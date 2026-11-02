-- =====================================================================
-- App Infinito Artefatos — estrutura do banco (Supabase / Postgres)
-- Rode este arquivo inteiro uma vez em: Supabase → SQL Editor → New query
-- Pode rodar de novo sem perder dados (usa "if not exists" / "or replace").
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Tabelas ----------

-- Quem pode entrar no app. O acesso é liberado pelo e-mail da conta Google.
create table if not exists public.membros (
  email      text primary key check (email = lower(email)),
  nome       text not null default '',
  papel      text not null default 'vendedor' check (papel in ('admin', 'vendedor')),
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

create table if not exists public.produtos (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null,
  categoria      text not null default 'Outros',
  variacao       text not null default '',
  fornecedor     text not null default '',
  descricao      text not null default '',
  custo          numeric(10,2) not null default 0,
  preco          numeric(10,2) not null default 0,
  estoque        integer not null default 0 check (estoque >= 0),
  minimo         integer not null default 2 check (minimo >= 0),
  foto           text,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

create table if not exists public.vendas (
  id              uuid primary key default gen_random_uuid(),
  data            timestamptz not null default now(),
  itens           jsonb not null default '[]'::jsonb,
  subtotal        numeric(10,2) not null default 0,
  desconto        numeric(10,2) not null default 0,
  total           numeric(10,2) not null default 0,
  pagamento       text not null default '',
  canal           text not null default '',
  cliente         text not null default '',
  vendedor_email  text not null default '',
  vendedor_nome   text not null default ''
);
create index if not exists vendas_data_idx on public.vendas (data desc);

create table if not exists public.entradas (
  id             uuid primary key default gen_random_uuid(),
  produto_id     uuid references public.produtos(id) on delete cascade,
  nome           text not null default '',
  qtd            integer not null,
  obs            text not null default '',
  data           timestamptz not null default now(),
  usuario_email  text not null default ''
);

-- ---------- Funções de apoio ----------

create or replace function public.meu_email() returns text
language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create or replace function public.eh_membro() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from membros where email = meu_email() and ativo)
$$;

create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from membros where email = meu_email() and ativo and papel = 'admin')
$$;

-- ---------- Regras de acesso (Row Level Security) ----------

alter table public.membros  enable row level security;
alter table public.produtos enable row level security;
alter table public.vendas   enable row level security;
alter table public.entradas enable row level security;

drop policy if exists membros_ler   on public.membros;
drop policy if exists membros_admin on public.membros;
create policy membros_ler   on public.membros for select to authenticated
  using (eh_membro() or email = meu_email());
create policy membros_admin on public.membros for all to authenticated
  using (eh_admin()) with check (eh_admin());

drop policy if exists produtos_ler    on public.produtos;
drop policy if exists produtos_criar  on public.produtos;
drop policy if exists produtos_editar on public.produtos;
drop policy if exists produtos_apagar on public.produtos;
create policy produtos_ler    on public.produtos for select to authenticated using (eh_membro());
create policy produtos_criar  on public.produtos for insert to authenticated with check (eh_membro());
create policy produtos_editar on public.produtos for update to authenticated using (eh_membro()) with check (eh_membro());
create policy produtos_apagar on public.produtos for delete to authenticated using (eh_admin());

drop policy if exists vendas_ler on public.vendas;
create policy vendas_ler on public.vendas for select to authenticated using (eh_membro());

drop policy if exists entradas_ler on public.entradas;
create policy entradas_ler on public.entradas for select to authenticated using (eh_membro());

-- Ninguém sem login enxerga nada.
revoke all on public.membros, public.produtos, public.vendas, public.entradas from anon;

-- ---------- Operações (vendas e estoque passam sempre por aqui) ----------

-- Registra a venda e dá baixa no estoque numa única operação.
create or replace function public.registrar_venda(
  p_itens jsonb, p_desconto numeric, p_pagamento text, p_canal text, p_cliente text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  it jsonb; p produtos%rowtype; q integer;
  snap jsonb := '[]'::jsonb; sub numeric := 0; d numeric; vid uuid; vnome text;
begin
  if not eh_membro() then raise exception 'Acesso não autorizado'; end if;
  if p_itens is null or jsonb_array_length(p_itens) = 0 then raise exception 'O carrinho está vazio'; end if;

  for it in select * from jsonb_array_elements(p_itens) loop
    q := (it ->> 'qtd')::integer;
    if q is null or q <= 0 then raise exception 'Quantidade inválida'; end if;
    select * into p from produtos where id = (it ->> 'produto_id')::uuid for update;
    if not found then raise exception 'Um dos produtos não existe mais'; end if;
    if p.estoque < q then
      raise exception 'Estoque insuficiente de % (restam %)', p.nome, p.estoque;
    end if;
    update produtos set estoque = estoque - q, atualizado_em = now() where id = p.id;
    snap := snap || jsonb_build_array(jsonb_build_object(
      'produto_id', p.id,
      'nome', p.nome || case when p.variacao <> '' then ' · ' || p.variacao else '' end,
      'qtd', q, 'preco', p.preco, 'custo', p.custo, 'fornecedor', p.fornecedor));
    sub := sub + q * p.preco;
  end loop;

  d := least(greatest(coalesce(p_desconto, 0), 0), sub);
  select coalesce(nullif(nome, ''), auth.jwt() -> 'user_metadata' ->> 'full_name', meu_email())
    into vnome from membros where email = meu_email();

  insert into vendas (itens, subtotal, desconto, total, pagamento, canal, cliente, vendedor_email, vendedor_nome)
  values (snap, sub, d, sub - d, coalesce(p_pagamento, ''), coalesce(p_canal, ''),
          coalesce(trim(p_cliente), ''), meu_email(), coalesce(vnome, ''))
  returning id into vid;
  return vid;
end $$;

-- Cancela a venda e devolve os itens ao estoque (só administradores).
create or replace function public.cancelar_venda(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v vendas%rowtype; it jsonb;
begin
  if not eh_admin() then raise exception 'Somente administradores podem cancelar vendas'; end if;
  select * into v from vendas where id = p_id for update;
  if not found then raise exception 'Venda não encontrada'; end if;
  for it in select * from jsonb_array_elements(v.itens) loop
    update produtos set estoque = estoque + (it ->> 'qtd')::integer, atualizado_em = now()
    where id = (it ->> 'produto_id')::uuid;
  end loop;
  delete from vendas where id = p_id;
end $$;

-- Entrada de mercadoria (qualquer membro).
create or replace function public.registrar_entrada(p_produto uuid, p_qtd integer, p_obs text) returns void
language plpgsql security definer set search_path = public as $$
declare p produtos%rowtype;
begin
  if not eh_membro() then raise exception 'Acesso não autorizado'; end if;
  if p_qtd is null or p_qtd <= 0 then raise exception 'Quantidade inválida'; end if;
  select * into p from produtos where id = p_produto for update;
  if not found then raise exception 'Produto não encontrado'; end if;
  update produtos set estoque = estoque + p_qtd, atualizado_em = now() where id = p_produto;
  insert into entradas (produto_id, nome, qtd, obs, usuario_email)
  values (p_produto, p.nome, p_qtd, coalesce(p_obs, ''), meu_email());
end $$;

-- Preenche o nome do membro no primeiro acesso (com o nome da conta Google).
create or replace function public.atualizar_meu_nome(p_nome text) returns void
language sql security definer set search_path = public as $$
  update membros set nome = trim(p_nome)
  where email = meu_email() and nome = '' and coalesce(trim(p_nome), '') <> ''
$$;

revoke all on function public.registrar_venda(jsonb, numeric, text, text, text) from public, anon;
revoke all on function public.cancelar_venda(uuid) from public, anon;
revoke all on function public.registrar_entrada(uuid, integer, text) from public, anon;
revoke all on function public.atualizar_meu_nome(text) from public, anon;
grant execute on function public.registrar_venda(jsonb, numeric, text, text, text) to authenticated;
grant execute on function public.cancelar_venda(uuid) to authenticated;
grant execute on function public.registrar_entrada(uuid, integer, text) to authenticated;
grant execute on function public.atualizar_meu_nome(text) to authenticated;

-- ---------- Fotos dos produtos (Storage) ----------

insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', true)
on conflict (id) do nothing;

drop policy if exists fotos_enviar on storage.objects;
drop policy if exists fotos_apagar on storage.objects;
create policy fotos_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and public.eh_membro());
create policy fotos_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and public.eh_admin());

-- ---------- Atualização em tempo real entre celulares ----------

do $$
begin
  begin alter publication supabase_realtime add table public.produtos; exception when others then null; end;
  begin alter publication supabase_realtime add table public.vendas;   exception when others then null; end;
  begin alter publication supabase_realtime add table public.membros;  exception when others then null; end;
end $$;

-- ---------- Administradores iniciais ----------
-- A Jéssica e a Cássia são adicionadas depois, pela aba Equipe do app.

insert into public.membros (email, nome, papel) values
  ('capelatodigital@gmail.com',         'Felipe Capelato', 'admin'),
  ('sacerdotefelipecapelato@gmail.com', 'Felipe Capelato', 'admin')
on conflict (email) do nothing;

-- ---------- Ajuste de estoque (acrescentar ou retirar, com motivo) ----------
alter table public.entradas add column if not exists motivo text not null default 'Entrada de mercadoria';

create or replace function public.ajustar_estoque(p_produto uuid, p_delta integer, p_motivo text, p_obs text)
returns integer
language plpgsql security definer set search_path = '' as $$
declare p public.produtos%rowtype; novo integer;
begin
  if not public.eh_membro() then raise exception 'Acesso não autorizado'; end if;
  if p_delta is null or p_delta = 0 then raise exception 'Informe uma quantidade diferente de zero'; end if;
  select * into p from public.produtos where id = p_produto for update;
  if not found then raise exception 'Produto não encontrado'; end if;
  novo := p.estoque + p_delta;
  if novo < 0 then raise exception 'Não dá para retirar % un de %: só há % em estoque', -p_delta, p.nome, p.estoque; end if;
  update public.produtos set estoque = novo, atualizado_em = now() where id = p_produto;
  insert into public.entradas (produto_id, nome, qtd, motivo, obs, usuario_email)
  values (p_produto, p.nome, p_delta, coalesce(nullif(trim(p_motivo), ''), case when p_delta > 0 then 'Entrada de mercadoria' else 'Ajuste' end),
          coalesce(trim(p_obs), ''), public.meu_email());
  return novo;
end $$;

revoke all on function public.ajustar_estoque(uuid, integer, text, text) from public, anon;
grant execute on function public.ajustar_estoque(uuid, integer, text, text) to authenticated;

-- ---------- Editar e estornar venda ----------
-- Aplicado no projeto pela migração "editar_e_estornar_venda" (colunas estornada, estornada_em,
-- estornada_por, motivo_estorno, editada_em em vendas; funções estornar_venda e editar_venda;
-- gatilho mov_vendas registrando "Editou venda" e "Estornou venda" em movimentacoes).
