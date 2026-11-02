'use strict';
/* App Infinito Artefatos — estoque e vendas (Supabase) */
const VERSAO = '2026-11-02.3'; // mudar junto com version.json a cada publicação

const CATS = ['Pulseiras', 'Colares', 'Incensos', 'Chaveiros', 'Pedras', 'Outros'];
const PAGS = ['Pix', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito'];
const CANAIS = ['Instagram', 'WhatsApp', 'Feira', 'Loja', 'Outro'];
const FORNS = ['Felipe', 'Jéssica'];
const VIEWS = ['vender', 'estoque', 'vendas', 'resumo', 'equipe'];

const S = {
  fase: 'carregando', // carregando | config | login | sem-acesso | pronto | erro
  user: null, membro: null,
  produtos: [], vendas: [], membros: [],
  carrinho: {}, periodo: 'hoje', cat: 'Todas', busca: '', buscaEst: '', confirm: null,
  form: { pag: 'Pix', canal: 'Instagram', desc: '', cliente: '' }, erro: ''
};
let sb = null, busy = false, canal = null, installEvt = null, migrando = false;

/* ---------- utilidades ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = n => (+n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = v => { if (typeof v === 'number') return v; let s = String(v ?? '').trim().replace(/\s|R\$/g, ''); if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); const n = parseFloat(s); return isNaN(n) ? 0 : n; };
const pad = n => String(n).padStart(2, '0');
const dia = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hoje = () => dia(new Date());
const diaDe = iso => dia(new Date(iso));
const prod = id => S.produtos.find(p => p.id === id);
const ehAdmin = () => !!(S.membro && S.membro.ativo && S.membro.papel === 'admin');
const view = () => { const h = location.hash.slice(1); return VIEWS.includes(h) && (h !== 'equipe' || ehAdmin()) ? h : 'vender'; };
function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 3200); }
function nivel(p) { const e = +p.estoque || 0, m = +p.minimo || 0; if (e <= 0) return ['bad', 'Sem estoque']; if (e <= m) return ['warn', e + ' un · baixo']; return ['ok', e + ' un']; }
function opts(arr, sel) { return arr.map(o => `<option${o === sel ? ' selected' : ''}>${esc(o)}</option>`).join(''); }
function cartList() { return Object.entries(S.carrinho).map(([id, q]) => ({ p: prod(id), q })).filter(x => x.p && x.q > 0); }
function cartTotals() { const it = cartList(); const sub = it.reduce((s, x) => s + x.q * (+x.p.preco || 0), 0); const d = Math.min(Math.max(num(S.form.desc), 0), sub); return { it, sub, d, tot: sub - d, n: it.reduce((s, x) => s + x.q, 0) }; }
function thumb(p, cls = '') { return p && p.foto ? `<img class="thumb ${cls}" src="${esc(p.foto)}" alt="" loading="lazy">` : `<span class="thumb ${cls}" aria-hidden="true">${esc(((p && p.nome) || '∞').trim()[0] || '∞')}</span>`; }
function msgErro(e) {
  const m = (e && (e.message || e.error_description)) || '';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Sem conexão com a internet. Tente de novo.';
  if (/row-level security|permission denied/i.test(m)) return 'Você não tem permissão para fazer isso.';
  return m || 'Não foi possível salvar. Tente de novo.';
}
function ordenarProdutos() { S.produtos.sort((a, b) => (a.categoria + a.nome + (a.variacao || '')).localeCompare(b.categoria + b.nome + (b.variacao || ''), 'pt-BR')); }
function ordenarVendas() { S.vendas.sort((a, b) => b.data.localeCompare(a.data)); }

/* ---------- telas de acesso ---------- */
const GOOGLE = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
function vLogin() {
  return `<div class="gate"><div class="logo"><img class="logo-claro" src="/icons/logo.png" alt="Infinito Artefatos"><img class="logo-escuro" src="/icons/logo-branco.png" alt=""></div><p>Estoque e vendas da loja. Entre com a conta Google que foi liberada para você.</p>
  <button class="gbtn" data-act="login">${GOOGLE} Entrar com Google</button>${S.erro ? `<div class="banner">${esc(S.erro)}</div>` : ''}</div>`;
}
function vSemAcesso() {
  return `<div class="gate"><div class="logo"><img class="logo-claro" src="/icons/logo.png" alt="Infinito Artefatos"><img class="logo-escuro" src="/icons/logo-branco.png" alt=""></div><h1>Acesso não liberado</h1>
  <p>A conta <span class="mail">${esc(S.user?.email)}</span> ainda não tem acesso ao app.</p>
  <p>Peça ao Felipe para adicionar esse e-mail na aba Equipe e depois toque em “Tentar de novo”.</p>
  <div class="row" style="width:100%"><button class="btn" data-act="logout">Entrar com outra conta</button><button class="btn pri" data-act="recarregar">Tentar de novo</button></div></div>`;
}
function vConfig() {
  return `<div class="gate"><div class="logo"><img class="logo-claro" src="/icons/logo.png" alt="Infinito Artefatos"><img class="logo-escuro" src="/icons/logo-branco.png" alt=""></div><h1>Falta configurar</h1><p>Preencha a Project URL e a chave anon do Supabase no arquivo <b>config.js</b> e publique de novo.</p></div>`;
}

/* ---------- telas do app ---------- */
function vVender() {
  const q = S.busca.toLowerCase();
  const ps = S.produtos.filter(p => !q || (p.nome + ' ' + p.variacao + ' ' + p.categoria + ' ' + p.fornecedor).toLowerCase().includes(q));
  const c = cartTotals();
  const lista = S.produtos.length ? ps.map(p => {
    const [k, l] = nivel(p); const noCart = S.carrinho[p.id] || 0; const sem = (+p.estoque || 0) - noCart <= 0;
    return `<button class="item" data-act="add" data-id="${p.id}" ${sem ? 'disabled' : ''}>${thumb(p)}<div class="main"><div class="nm">${esc(p.nome)}${p.variacao ? ' · ' + esc(p.variacao) : ''}</div><div class="sub">${esc(p.categoria)}${noCart ? ` · ${noCart} no carrinho` : ''}</div></div><span class="pill ${k}">${l}</span><span class="price">${brl(p.preco)}</span></button>`;
  }).join('') || '<div class="empty">Nenhum produto encontrado.</div>'
    : '<div class="empty"><b>Nenhum produto ainda</b>Cadastre seus produtos na aba Estoque para começar a vender.</div>';
  const cart = c.it.length ? c.it.map(x => `<div class="item">${thumb(x.p)}<div class="main"><div class="nm">${esc(x.p.nome)}${x.p.variacao ? ' · ' + esc(x.p.variacao) : ''}</div><div class="sub">${brl(x.p.preco)} cada</div></div><div class="qty"><button data-act="dec" data-id="${x.p.id}" aria-label="Diminuir">−</button><span>${x.q}</span><button data-act="add" data-id="${x.p.id}" aria-label="Aumentar">+</button></div><span class="price">${brl(x.q * x.p.preco)}</span></div>`).join('')
    : '<div class="empty">Toque em um produto para adicionar.</div>';
  return `<div class="head"><h1>Nova venda</h1></div>
  <div class="grid2">
    <section class="panel"><h2>Produtos</h2><div class="field" style="margin-bottom:8px"><input id="busca" type="search" placeholder="Buscar por nome, pedra ou categoria" value="${esc(S.busca)}"></div><div class="list">${lista}</div></section>
    <section class="panel sticky" id="carrinho"><h2>Carrinho</h2><div class="list">${cart}</div>
      <div class="row" style="margin-top:12px">
        <div class="field"><label for="pag">Pagamento</label><select id="pag">${opts(PAGS, S.form.pag)}</select></div>
        <div class="field"><label for="canal">Canal</label><select id="canal">${opts(CANAIS, S.form.canal)}</select></div>
      </div>
      <div class="row" style="margin-top:10px">
        <div class="field"><label for="desc">Desconto (R$)</label><input id="desc" inputmode="decimal" placeholder="0,00" value="${esc(S.form.desc)}"></div>
        <div class="field"><label for="cliente">Cliente (opcional)</label><input id="cliente" placeholder="Nome ou @" value="${esc(S.form.cliente)}"></div>
      </div>
      <div class="total"><span>${c.d ? `Subtotal ${brl(c.sub)} · desconto ${brl(c.d)}` : 'Total'}</span><strong id="tot">${brl(c.tot)}</strong></div>
      <button class="btn pri wide" data-act="vender" ${c.it.length && !busy ? '' : 'disabled'} style="margin-top:12px">${busy ? 'Registrando…' : 'Registrar venda'}</button>
    </section>
  </div>`;
}

function vEstoque() {
  const q = S.buscaEst.toLowerCase();
  const cats = ['Todas', ...new Set([...CATS.filter(c => S.produtos.some(p => p.categoria === c)), ...S.produtos.map(p => p.categoria)])];
  const ps = S.produtos.filter(p => (S.cat === 'Todas' || p.categoria === S.cat) && (!q || (p.nome + ' ' + p.variacao + ' ' + p.fornecedor + ' ' + p.descricao).toLowerCase().includes(q)));
  const val = S.produtos.reduce((s, p) => s + (+p.estoque || 0) * (+p.custo || 0), 0), un = S.produtos.reduce((s, p) => s + (+p.estoque || 0), 0);
  const adm = ehAdmin();
  const rows = ps.map(p => {
    const [k, l] = nivel(p); const conf = S.confirm === p.id;
    return `<div class="item">${thumb(p)}<div class="main"><div class="nm">${esc(p.nome)}${p.variacao ? ' · ' + esc(p.variacao) : ''}</div><div class="sub">${esc(p.categoria)}${p.fornecedor ? ' · fornecedor ' + esc(p.fornecedor) : ''} · custo ${brl(p.custo)} · venda ${brl(p.preco)}</div>${p.descricao ? `<div class="sub desc">${esc(p.descricao)}</div>` : ''}</div><span class="pill ${k}">${l}</span>
    <div class="acts"><button class="btn sm" data-act="entrada" data-id="${p.id}">Quantidade</button><button class="btn sm" data-act="editar" data-id="${p.id}">Editar</button>${adm ? `<button class="btn sm danger" data-act="excluir" data-id="${p.id}">${conf ? 'Confirmar exclusão' : 'Excluir'}</button>` : ''}</div></div>`;
  }).join('');
  return `<div class="head"><div><h1>Estoque</h1><div class="sub" style="color:var(--muted)">${S.produtos.length} produtos · ${un} unidades · ${brl(val)} em custo</div></div><button class="btn pri" data-act="novo">Novo produto</button></div>
  <div class="chips">${cats.map(c => `<button class="chip${S.cat === c ? ' on' : ''}" data-act="cat" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
  <section class="panel"><div class="field" style="margin-bottom:8px"><input id="buscaEst" type="search" placeholder="Buscar produto, fornecedor ou descrição" value="${esc(S.buscaEst)}"></div>
  <div class="list">${rows || (S.produtos.length ? '<div class="empty">Nenhum produto nesse filtro.</div>' : '<div class="empty"><b>Seu estoque está vazio</b>Toque em “Novo produto” para cadastrar o primeiro item.</div>')}</div></section>`;
}

function vVendas() {
  if (!S.vendas.length) return `<div class="head"><h1>Vendas</h1></div><section class="panel"><div class="empty"><b>Nenhuma venda registrada</b>As vendas que você registrar na aba Vender aparecem aqui.</div></section>`;
  const adm = ehAdmin(); let html = '', last = '';
  for (const v of S.vendas) {
    const d = diaDe(v.data);
    if (d !== last) { last = d; const [y, m, dd] = d.split('-'); html += `<div class="day">${d === hoje() ? 'Hoje · ' : ''}${dd}/${m}/${y}</div>`; }
    const conf = S.confirm === v.id; const hr = new Date(v.data);
    html += `<div class="item"><div class="main"><div class="nm">${(v.itens || []).map(i => `${i.qtd}× ${esc(i.nome)}`).join(', ')}</div><div class="sub">${pad(hr.getHours())}:${pad(hr.getMinutes())} · ${esc(v.pagamento)} · ${esc(v.canal)}${v.cliente ? ' · ' + esc(v.cliente) : ''}${+v.desconto ? ` · desc. ${brl(v.desconto)}` : ''}${v.vendedor_nome ? ' · por ' + esc(v.vendedor_nome) : ''}</div></div><span class="price">${brl(v.total)}</span>${adm ? `<div class="acts"><button class="btn sm danger" data-act="cancelar" data-id="${v.id}">${conf ? 'Confirmar cancelamento' : 'Cancelar'}</button></div>` : ''}</div>`;
  }
  return `<div class="head"><h1>Vendas</h1>${adm ? '<div class="sub" style="color:var(--muted)">Cancelar uma venda devolve os itens ao estoque.</div>' : ''}</div><section class="panel"><div class="list">${html}</div></section>`;
}

function vResumo() {
  const t = new Date(), h = hoje(); const d7 = new Date(t); d7.setDate(t.getDate() - 6); const ini7 = dia(d7); const mes = h.slice(0, 7);
  const f = { hoje: v => diaDe(v.data) === h, '7d': v => diaDe(v.data) >= ini7, mes: v => diaDe(v.data).startsWith(mes), tudo: () => true }[S.periodo];
  const vs = S.vendas.filter(f); const fat = vs.reduce((s, v) => s + (+v.total || 0), 0);
  const lucro = vs.reduce((s, v) => s + (v.itens || []).reduce((a, i) => a + i.qtd * ((+i.preco || 0) - (+i.custo || 0)), 0) - (+v.desconto || 0), 0);
  const soma = (fn) => { const o = {}; vs.forEach(v => fn(v, o)); return Object.entries(o).sort((a, b) => b[1] - a[1]); };
  const canais = soma((v, o) => o[v.canal || 'Outro'] = (o[v.canal || 'Outro'] || 0) + (+v.total || 0));
  const vends = soma((v, o) => { const k = v.vendedor_nome || v.vendedor_email || '—'; o[k] = (o[k] || 0) + (+v.total || 0); });
  const forn = soma((v, o) => (v.itens || []).forEach(i => { const k = i.fornecedor || prod(i.produto_id)?.fornecedor || 'Não informado'; o[k] = (o[k] || 0) + i.qtd * (+i.preco || 0); }));
  const tops = soma((v, o) => (v.itens || []).forEach(i => o[i.nome] = (o[i.nome] || 0) + i.qtd)).slice(0, 5);
  const baixo = S.produtos.filter(p => (+p.estoque || 0) <= (+p.minimo || 0)).sort((a, b) => a.estoque - b.estoque);
  const barras = (arr) => { const mx = arr[0]?.[1] || 1; return arr.length ? arr.map(([c, v]) => `<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;gap:8px"><span>${esc(c)}</span><b>${brl(v)}</b></div><div class="bar"><i style="width:${Math.max(3, v / mx * 100)}%"></i></div></div>`).join('') : '<div class="empty">Sem vendas no período.</div>'; };
  const P = { hoje: 'Hoje', '7d': '7 dias', mes: 'Este mês', tudo: 'Tudo' };
  return `<div class="head"><h1>Resumo</h1></div>
  <div class="chips">${Object.entries(P).map(([k, l]) => `<button class="chip${S.periodo === k ? ' on' : ''}" data-act="per" data-p="${k}">${l}</button>`).join('')}</div>
  <div class="tiles">
    <div class="tile"><div class="k">Faturamento</div><div class="v">${brl(fat)}</div></div>
    <div class="tile"><div class="k">Vendas</div><div class="v">${vs.length}</div></div>
    <div class="tile"><div class="k">Ticket médio</div><div class="v">${brl(vs.length ? fat / vs.length : 0)}</div></div>
    <div class="tile"><div class="k">Lucro estimado</div><div class="v">${brl(lucro)}</div></div>
  </div>
  <div class="grid2">
    <section class="panel"><h2>Por canal</h2>${barras(canais)}
      <h2 style="margin-top:18px">Por fornecedor</h2>${barras(forn)}
      <h2 style="margin-top:18px">Mais vendidos</h2><div class="list">${tops.length ? tops.map(([n, q]) => `<div class="item"><div class="main nm">${esc(n)}</div><b>${q} un</b></div>`).join('') : '<div class="empty">Sem vendas no período.</div>'}</div></section>
    <section class="panel"><h2>Por vendedor</h2>${barras(vends)}
      <h2 style="margin-top:18px">Repor estoque</h2><div class="list">${baixo.length ? baixo.map(p => { const [k, l] = nivel(p); return `<div class="item">${thumb(p)}<div class="main"><div class="nm">${esc(p.nome)}${p.variacao ? ' · ' + esc(p.variacao) : ''}</div><div class="sub">mínimo ${+p.minimo || 0} un</div></div><span class="pill ${k}">${l}</span></div>`; }).join('') : '<div class="empty">Tudo acima do mínimo.</div>'}</div></section>
  </div>`;
}

function vEquipe() {
  const eu = S.user?.email?.toLowerCase();
  const rows = S.membros.map(m => {
    const conf = S.confirm === 'm:' + m.email; const self = m.email === eu;
    return `<div class="item"><div class="main"><div class="nm">${esc(m.nome || m.email)}${self ? ' (você)' : ''} <span class="badge${m.ativo ? '' : ' off'}">${m.ativo ? (m.papel === 'admin' ? 'Administrador' : 'Equipe') : 'Bloqueado'}</span></div><div class="sub mail" style="font-weight:500;color:var(--muted)">${esc(m.email)}</div></div>
    ${self ? '' : `<div class="acts"><button class="btn sm" data-act="papel" data-e="${esc(m.email)}">${m.papel === 'admin' ? 'Tornar equipe' : 'Tornar administrador'}</button><button class="btn sm" data-act="ativo" data-e="${esc(m.email)}">${m.ativo ? 'Bloquear' : 'Desbloquear'}</button><button class="btn sm danger" data-act="remover" data-e="${esc(m.email)}">${conf ? 'Confirmar remoção' : 'Remover'}</button></div>`}</div>`;
  }).join('');
  return `<div class="head"><div><h1>Equipe</h1><div class="sub" style="color:var(--muted)">Só entra no app quem estiver nesta lista, com a conta Google do e-mail cadastrado.</div></div></div>
  <section class="panel"><h2>Adicionar pessoa</h2>
    <form class="addm" id="fmembro">
      <div class="field"><label for="m_email">E-mail Google</label><input id="m_email" type="email" required placeholder="nome@gmail.com" autocomplete="off"></div>
      <div class="field"><label for="m_nome">Nome</label><input id="m_nome" placeholder="Ex.: Jéssica"></div>
      <div class="field"><label for="m_papel">Acesso</label><select id="m_papel"><option value="vendedor">Equipe</option><option value="admin">Administrador</option></select></div>
      <button class="btn pri">Adicionar</button>
    </form>
    <div class="sub" style="color:var(--muted);margin-bottom:6px">Equipe (vendedor): vende, lança entradas, vê vendas e resumo, cadastra e edita produtos, fotos e preços. Administrador: também exclui produtos, cancela vendas e gerencia a equipe.</div>
    <div class="list">${rows}</div></section>`;
}

/* ---------- cabeçalho e render ---------- */
function vHeader() {
  let h = '';
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (!standalone && (installEvt || ios)) h += `<button class="btn sm" data-act="instalar">Instalar app</button>`;
  if (S.user) {
    const md = S.user.user_metadata || {}; const nome = S.membro?.nome || md.full_name || S.user.email;
    h += `<div class="me">${md.avatar_url ? `<img src="${esc(md.avatar_url)}" alt="" referrerpolicy="no-referrer">` : `<span class="ini">${esc((nome || '?')[0])}</span>`}<span>${esc(nome.split(' ')[0])}</span></div><button class="btn sm" data-act="logout">Sair</button>`;
  }
  return h;
}

function render() {
  $('#hright').innerHTML = vHeader();
  const pronto = S.fase === 'pronto';
  $('#side').hidden = !pronto; $('#menuBtn').hidden = !pronto; $('#navEquipe').hidden = !ehAdmin();
  if (!pronto) fecharMenu();
  const v = view();
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.v === v));
  const fe = document.activeElement, fid = fe && fe.id, sel = fid && fe.selectionStart;
  let html;
  if (S.fase === 'carregando') html = '<div class="empty"><b>Carregando…</b></div>';
  else if (S.fase === 'config') html = vConfig();
  else if (S.fase === 'login') html = vLogin();
  else if (S.fase === 'sem-acesso') html = vSemAcesso();
  else if (S.fase === 'erro') html = `<div class="gate"><h1>Não foi possível carregar</h1><p>${esc(S.erro)}</p><button class="btn pri" data-act="recarregar">Tentar de novo</button></div>`;
  else html = ({ vender: vVender, estoque: vEstoque, vendas: vVendas, resumo: vResumo, equipe: vEquipe }[v])();
  $('#app').innerHTML = html;
  if (fid) { const el = document.getElementById(fid); if (el && el.tagName === 'INPUT') { el.focus(); try { el.setSelectionRange(sel, sel); } catch (e) { } } }
  const c = cartTotals(), mb = $('#mbar');
  if (pronto && v === 'vender' && c.n) { mb.hidden = false; mb.innerHTML = `<span>${c.n} ${c.n > 1 ? 'itens' : 'item'} · ${brl(c.tot)}</span><span>Finalizar ↓</span>`; } else mb.hidden = true;
}

/* ---------- fotos ---------- */
function reduzir(file) {
  return new Promise((res, rej) => {
    const r = new FileReader(); r.onerror = rej;
    r.onload = () => {
      const img = new Image(); img.onerror = rej;
      img.onload = () => {
        const T = 320, c = document.createElement('canvas'); c.width = c.height = T;
        const s = Math.min(img.naturalWidth, img.naturalHeight); const x = c.getContext('2d');
        x.fillStyle = '#ffffff'; x.fillRect(0, 0, T, T);
        x.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, T, T);
        c.toBlob(b => b ? res(b) : rej(new Error('imagem')), 'image/jpeg', 0.75);
      };
      img.src = r.result;
    };
    r.readAsDataURL(file);
  });
}
async function enviarFoto(blob) {
  const nome = `${crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2)}.jpg`;
  const { error } = await sb.storage.from('fotos').upload(nome, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
  if (error) throw error;
  return sb.storage.from('fotos').getPublicUrl(nome).data.publicUrl;
}
// Fotos que vieram do app antigo (guardadas como texto) vão para o Storage na primeira vez que um administrador abre o app.
async function migrarFotos() {
  if (migrando || !ehAdmin()) return; migrando = true;
  let antigas = {};
  if (S.produtos.some(p => !p.foto)) { try { const r = await fetch('/migracao/fotos.json', { cache: 'no-store' }); if (r.ok) antigas = await r.json(); } catch (e) { } }
  let n = 0;
  for (const p of S.produtos) {
    const origem = p.foto && p.foto.startsWith('data:') ? p.foto : (!p.foto ? antigas[p.nome + '|' + (p.variacao || '')] : null);
    if (!origem) continue;
    try { const blob = await (await fetch(origem)).blob(); const url = await enviarFoto(blob); const { error } = await sb.from('produtos').update({ foto: url }).eq('id', p.id); if (error) throw error; p.foto = url; n++; } catch (e) { console.warn('Foto não migrada', p.nome, e); }
  }
  migrando = false;
  if (n) { toast(`${n} fotos do app antigo foram carregadas`); render(); }
}

/* ---------- modais ---------- */
function abrirProduto(p) {
  const m = $('#modal'); const e = p || { categoria: 'Pulseiras', estoque: 0, minimo: 2 };
  m.innerHTML = `<form class="box" id="fprod"><h1 style="font-size:26px">${p ? 'Editar produto' : 'Novo produto'}</h1>
  <div class="field"><label for="p_nome">Nome</label><input id="p_nome" required value="${esc(e.nome)}" placeholder="Ex.: Pulseira de bolinhas 8mm"></div>
  <div class="field"><label for="p_foto">Foto (opcional)</label><div class="fotobox"><span id="p_prev">${thumb(e, 'lg')}</span><div class="acts"><input type="file" id="p_foto" accept="image/*"><button type="button" class="btn sm" id="p_rmfoto" ${e.foto ? '' : 'hidden'}>Remover foto</button></div></div></div>
  <div class="row"><div class="field"><label for="p_cat">Categoria</label><select id="p_cat">${opts([...new Set([...CATS, e.categoria])], e.categoria)}</select></div>
  <div class="field"><label for="p_var">Variação (pedra, cor, tamanho)</label><input id="p_var" value="${esc(e.variacao)}" placeholder="Ex.: Ametista"></div></div>
  <div class="field"><label for="p_forn">Fornecedor</label><select id="p_forn"><option value="">Não informado</option>${opts([...new Set([...FORNS, ...(e.fornecedor ? [e.fornecedor] : [])])], e.fornecedor)}</select></div>
  <div class="field"><label for="p_desc">Descrição (opcional)</label><textarea id="p_desc" rows="3" placeholder="Materiais, significado da pedra, medidas…">${esc(e.descricao)}</textarea></div>
  <div class="row"><div class="field"><label for="p_custo">Custo (R$)</label><input id="p_custo" inputmode="decimal" value="${p ? String(e.custo ?? '').replace('.', ',') : ''}" placeholder="0,00"></div>
  <div class="field"><label for="p_preco">Preço de venda (R$)</label><input id="p_preco" inputmode="decimal" required value="${p ? String(e.preco ?? '').replace('.', ',') : ''}" placeholder="0,00"></div></div>
  <div class="row">${p ? '' : `<div class="field"><label for="p_est">Quantidade em estoque</label><input id="p_est" inputmode="numeric" value="0"></div>`}
  <div class="field"><label for="p_min">Avisar quando chegar a</label><input id="p_min" inputmode="numeric" value="${esc(e.minimo ?? 2)}"></div></div>
  <div class="row" style="margin-top:6px"><button type="button" class="btn" data-act="fechar">Cancelar</button><button class="btn pri" id="p_salvar">${p ? 'Salvar alterações' : 'Cadastrar produto'}</button></div></form>`;
  m.hidden = false; $('#p_nome').focus();
  let fotoNova; // undefined = sem mudança · null = remover · Blob = nova
  $('#p_foto').onchange = async ev => { const f = ev.target.files[0]; if (!f) return; try { fotoNova = await reduzir(f); $('#p_prev').innerHTML = thumb({ foto: URL.createObjectURL(fotoNova) }, 'lg'); $('#p_rmfoto').hidden = false; } catch (err) { toast('Não foi possível ler essa imagem. Tente uma foto JPG ou PNG.'); } };
  $('#p_rmfoto').onclick = () => { fotoNova = null; $('#p_foto').value = ''; $('#p_prev').innerHTML = thumb({ nome: $('#p_nome').value || '?' }, 'lg'); $('#p_rmfoto').hidden = true; };
  $('#fprod').onsubmit = async ev => {
    ev.preventDefault();
    const d = { nome: $('#p_nome').value.trim(), categoria: $('#p_cat').value, variacao: $('#p_var').value.trim(), fornecedor: $('#p_forn').value, descricao: $('#p_desc').value.trim(), custo: num($('#p_custo').value), preco: num($('#p_preco').value), minimo: Math.max(0, Math.round(num($('#p_min').value))) };
    if (!d.nome) return;
    const btn = $('#p_salvar'); btn.disabled = true; btn.textContent = 'Salvando…';
    try {
      if (fotoNova instanceof Blob) d.foto = await enviarFoto(fotoNova); else if (fotoNova === null) d.foto = null;
      if (p) { d.atualizado_em = new Date().toISOString(); const { error } = await sb.from('produtos').update(d).eq('id', p.id); if (error) throw error; toast('Produto atualizado'); }
      else { d.estoque = Math.max(0, Math.round(num($('#p_est').value))); const { error } = await sb.from('produtos').insert(d); if (error) throw error; toast('Produto cadastrado'); }
      fechar(); await recarregar(['produtos']);
    } catch (err) { toast(msgErro(err)); btn.disabled = false; btn.textContent = p ? 'Salvar alterações' : 'Cadastrar produto'; }
  };
}
function abrirEntrada(p) {
  const m = $('#modal'); const atual = +p.estoque || 0;
  const MOTIVOS = { mais: ['Entrada de mercadoria', 'Produção própria', 'Devolução de cliente', 'Ajuste de contagem', 'Outro'], menos: ['Ajuste de contagem', 'Perda ou quebra', 'Uso próprio ou brinde', 'Devolução ao fornecedor', 'Outro'] };
  m.innerHTML = `<form class="box" id="fent"><h1 style="font-size:26px">Ajustar quantidade</h1><div style="color:var(--muted)">${esc(p.nome)}${p.variacao ? ' · ' + esc(p.variacao) : ''}</div>
  <div class="ajuste-tipo" role="radiogroup" aria-label="Tipo de ajuste">
    <label><input type="radio" name="e_tipo" id="e_mais" value="mais" checked><span>+ Acrescentar</span></label>
    <label><input type="radio" name="e_tipo" id="e_menos" value="menos"><span>− Retirar</span></label>
  </div>
  <div class="field"><label for="e_q">Quantidade</label>
    <div class="qty-big"><button type="button" id="e_dec" aria-label="Diminuir">−</button><input id="e_q" inputmode="numeric" required value="1"><button type="button" id="e_inc" aria-label="Aumentar">+</button></div></div>
  <div class="field"><label for="e_mot">Motivo</label><select id="e_mot"></select></div>
  <div class="field"><label for="e_obs">Observação (opcional)</label><input id="e_obs" placeholder="Fornecedor, lote, detalhe…"></div>
  <div class="ajuste-prev" id="e_prev"></div>
  <div class="row" style="margin-top:6px"><button type="button" class="btn" data-act="fechar">Cancelar</button><button class="btn pri" id="e_ok">Salvar ajuste</button></div></form>`;
  m.hidden = false;
  const tipo = () => $('#e_menos').checked ? 'menos' : 'mais';
  const qtd = () => Math.max(0, Math.round(num($('#e_q').value)));
  const motivos = () => { const t = tipo(), sel = $('#e_mot').value; $('#e_mot').innerHTML = opts(MOTIVOS[t], MOTIVOS[t].includes(sel) ? sel : MOTIVOS[t][0]); };
  const prev = () => {
    const q = qtd(), sinal = tipo() === 'mais' ? 1 : -1, novo = atual + sinal * q;
    const erro = novo < 0;
    $('#e_prev').className = 'ajuste-prev' + (erro ? ' erro' : '');
    $('#e_prev').innerHTML = erro ? `Só há ${atual} un em estoque. Não dá para retirar ${q}.` : `Estoque: <b>${atual} un</b> → <b>${novo} un</b>`;
    $('#e_ok').disabled = erro || !q;
    $('#e_ok').textContent = tipo() === 'mais' ? `Acrescentar ${q || ''} un`.replace('  ', ' ') : `Retirar ${q || ''} un`.replace('  ', ' ');
  };
  motivos(); prev();
  $('#e_mais').onchange = $('#e_menos').onchange = () => { motivos(); prev(); };
  $('#e_q').oninput = prev;
  $('#e_inc').onclick = () => { $('#e_q').value = qtd() + 1; prev(); };
  $('#e_dec').onclick = () => { $('#e_q').value = Math.max(1, qtd() - 1); prev(); };
  $('#e_q').focus(); $('#e_q').select();
  $('#fent').onsubmit = async ev => {
    ev.preventDefault(); const q = qtd(); if (!q) { toast('Informe uma quantidade maior que zero'); return; }
    const delta = tipo() === 'mais' ? q : -q;
    $('#e_ok').disabled = true;
    const { error } = await sb.rpc('ajustar_estoque', { p_produto: p.id, p_delta: delta, p_motivo: $('#e_mot').value, p_obs: $('#e_obs').value.trim() });
    if (error) { toast(msgErro(error)); $('#e_ok').disabled = false; return; }
    toast(`${delta > 0 ? '+' : '−'}${q} un em ${p.nome}`); fechar(); recarregar(['produtos']);
  };
}
function abrirInstalar() {
  const m = $('#modal');
  m.innerHTML = `<div class="box"><h1 style="font-size:26px">Instalar no iPhone</h1><p>No Safari, toque no botão <b>Compartilhar</b> (o quadrado com a seta para cima) e escolha <b>Adicionar à Tela de Início</b>.</p><button class="btn pri" data-act="fechar">Entendi</button></div>`;
  m.hidden = false;
}
const celular = () => matchMedia('(max-width: 820px)').matches;
function fecharMenu() { document.body.classList.remove('open'); $('#scrim').hidden = true; $('#menuBtn')?.setAttribute('aria-expanded', 'false'); }
function alternarMenu() {
  if (celular()) { const abrir = !document.body.classList.contains('open'); document.body.classList.toggle('open', abrir); $('#scrim').hidden = !abrir; $('#menuBtn').setAttribute('aria-expanded', String(abrir)); }
  else { const mini = document.body.classList.toggle('mini'); $('#menuBtn').setAttribute('aria-expanded', String(!mini)); try { localStorage.setItem('menuRecolhido', mini ? '1' : '0'); } catch (e) { } }
}
function fechar() { $('#modal').hidden = true; $('#modal').innerHTML = ''; }

/* ---------- ações ---------- */
async function registrarVenda() {
  const c = cartTotals(); if (!c.it.length || busy) return;
  busy = true; render();
  const { error } = await sb.rpc('registrar_venda', { p_itens: c.it.map(x => ({ produto_id: x.p.id, qtd: x.q })), p_desconto: c.d, p_pagamento: S.form.pag, p_canal: S.form.canal, p_cliente: S.form.cliente.trim() });
  busy = false;
  if (error) { toast(msgErro(error)); render(); recarregar(['produtos']); return; }
  S.carrinho = {}; S.form.desc = ''; S.form.cliente = ''; toast(`Venda de ${brl(c.tot)} registrada`);
  await recarregar(['produtos', 'vendas']);
}

document.addEventListener('click', async ev => {
  if (ev.target.id === 'modal') { fechar(); return; }
  if (ev.target.id === 'scrim') { fecharMenu(); return; }
  if (ev.target.closest('#mbar')) { $('#carrinho')?.scrollIntoView({ behavior: 'smooth' }); return; }
  const b = ev.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act, id = b.dataset.id, em = b.dataset.e;
  if (!['excluir', 'cancelar', 'remover'].includes(a)) S.confirm = null;
  try {
    if (a === 'login') {
      const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + '/', queryParams: { prompt: 'select_account' } } });
      if (error) toast(msgErro(error));
    }
    else if (a === 'logout') { await sb.auth.signOut(); S.user = null; S.membro = null; S.fase = 'login'; render(); }
    else if (a === 'menu') alternarMenu();
    else if (a === 'atualizar') aplicarAtualizacao();
    else if (a === 'recarregar') { iniciarSessao(S.user); }
    else if (a === 'instalar') { if (installEvt) { installEvt.prompt(); await installEvt.userChoice; installEvt = null; render(); } else abrirInstalar(); }
    else if (a === 'add') { const p = prod(id); const q = (S.carrinho[id] || 0) + 1; if (q > (+p.estoque || 0)) { toast('Estoque insuficiente'); return; } S.carrinho[id] = q; render(); }
    else if (a === 'dec') { S.carrinho[id] = (S.carrinho[id] || 0) - 1; if (S.carrinho[id] <= 0) delete S.carrinho[id]; render(); }
    else if (a === 'vender') registrarVenda();
    else if (a === 'novo') abrirProduto();
    else if (a === 'editar') abrirProduto(prod(id));
    else if (a === 'entrada') abrirEntrada(prod(id));
    else if (a === 'fechar') fechar();
    else if (a === 'cat') { S.cat = b.dataset.c; render(); }
    else if (a === 'per') { S.periodo = b.dataset.p; render(); }
    else if (a === 'excluir') {
      if (S.confirm !== id) { S.confirm = id; render(); return; }
      S.confirm = null; delete S.carrinho[id];
      const { error } = await sb.from('produtos').delete().eq('id', id); if (error) throw error;
      toast('Produto excluído'); recarregar(['produtos']);
    }
    else if (a === 'cancelar') {
      if (S.confirm !== id) { S.confirm = id; render(); return; }
      S.confirm = null; const { error } = await sb.rpc('cancelar_venda', { p_id: id }); if (error) throw error;
      toast('Venda cancelada e estoque devolvido'); recarregar(['produtos', 'vendas']);
    }
    else if (a === 'papel' || a === 'ativo') {
      const m = S.membros.find(x => x.email === em); if (!m) return;
      const upd = a === 'papel' ? { papel: m.papel === 'admin' ? 'vendedor' : 'admin' } : { ativo: !m.ativo };
      const { error } = await sb.from('membros').update(upd).eq('email', em); if (error) throw error;
      toast('Acesso atualizado'); recarregar(['membros']);
    }
    else if (a === 'remover') {
      if (S.confirm !== 'm:' + em) { S.confirm = 'm:' + em; render(); return; }
      S.confirm = null; const { error } = await sb.from('membros').delete().eq('email', em); if (error) throw error;
      toast('Pessoa removida'); recarregar(['membros']);
    }
  } catch (err) { toast(msgErro(err)); }
});
document.addEventListener('submit', async ev => {
  if (ev.target.id !== 'fmembro') return;
  ev.preventDefault();
  const email = $('#m_email').value.trim().toLowerCase(), nome = $('#m_nome').value.trim(), papel = $('#m_papel').value;
  if (!/^\S+@\S+\.\S+$/.test(email)) { toast('Digite um e-mail válido'); return; }
  const { error } = await sb.from('membros').upsert({ email, nome, papel, ativo: true });
  if (error) { toast(msgErro(error)); return; }
  toast(`${nome || email} pode entrar no app`); recarregar(['membros']);
});
document.addEventListener('input', ev => {
  const t = ev.target;
  if (t.id === 'busca') { S.busca = t.value; render(); }
  else if (t.id === 'buscaEst') { S.buscaEst = t.value; render(); }
  else if (t.id === 'desc') { S.form.desc = t.value; const el = $('#tot'); if (el) el.textContent = brl(cartTotals().tot); }
  else if (t.id === 'cliente') S.form.cliente = t.value;
});
document.addEventListener('change', ev => {
  const t = ev.target;
  if (t.id === 'pag') S.form.pag = t.value; else if (t.id === 'canal') S.form.canal = t.value; else if (t.id === 'desc') render();
});
document.addEventListener('keydown', ev => { if (ev.key !== 'Escape') return; if (!$('#modal').hidden) fechar(); else fecharMenu(); });
addEventListener('hashchange', () => { S.confirm = null; fecharMenu(); render(); scrollTo(0, 0); });
addEventListener('resize', () => { if (!celular()) fecharMenu(); });
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; render(); });
addEventListener('appinstalled', () => { installEvt = null; render(); toast('App instalado'); });


/* ---------- atualização automática ---------- */
// Confere se há versão nova ao abrir, ao voltar para o app e a cada 10 minutos.
// Atualiza sozinho se não houver venda em andamento; senão, mostra um aviso para tocar e atualizar.
let novaVersao = null;
function podeRecarregar() { return !Object.keys(S.carrinho).length && $('#modal').hidden && !busy; }
async function aplicarAtualizacao() {
  try { const reg = await navigator.serviceWorker?.getRegistration(); await reg?.update(); } catch (e) { }
  try { if (sessionStorage.getItem('recarregouPara') === novaVersao) return; sessionStorage.setItem('recarregouPara', novaVersao); } catch (e) { }
  location.reload();
}
async function verificarVersao() {
  try {
    const r = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    const { versao } = await r.json();
    if (!versao || versao === VERSAO) return;
    novaVersao = versao;
    if (podeRecarregar()) aplicarAtualizacao();
    else mostrarAvisoVersao();
  } catch (e) { }
}
function mostrarAvisoVersao() {
  if ($('#avisoVersao')) return;
  const b = document.createElement('button'); b.id = 'avisoVersao'; b.className = 'aviso-versao'; b.dataset.act = 'atualizar';
  b.textContent = 'Nova versão do app disponível · toque para atualizar'; document.body.appendChild(b);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') verificarVersao(); });
addEventListener('focus', verificarVersao);
setInterval(verificarVersao, 10 * 60 * 1000);
if ('serviceWorker' in navigator) {
  let jaTinha = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (jaTinha && podeRecarregar()) location.reload(); jaTinha = true; });
}

/* ---------- dados ---------- */
function recarregar(quais) { return buscar(quais).catch(e => toast(msgErro(e))); }
async function buscar(quais = ['produtos', 'vendas', 'membros']) {
  const q = {
    produtos: () => sb.from('produtos').select('*'),
    vendas: () => sb.from('vendas').select('*').order('data', { ascending: false }).limit(2000),
    membros: () => sb.from('membros').select('*').order('nome')
  };
  const res = await Promise.all(quais.map(k => q[k]()));
  res.forEach((r, i) => { if (r.error) throw r.error; S[quais[i]] = r.data || []; });
  ordenarProdutos(); ordenarVendas();
  render();
}
function aplicar(tabela, chave, pl) {
  const arr = S[tabela];
  if (pl.eventType === 'DELETE') { const k = pl.old?.[chave]; const i = arr.findIndex(x => x[chave] === k); if (i >= 0) arr.splice(i, 1); }
  else { const row = pl.new; const i = arr.findIndex(x => x[chave] === row[chave]); if (i >= 0) arr[i] = row; else arr.push(row); }
  if (tabela === 'produtos') ordenarProdutos(); if (tabela === 'vendas') ordenarVendas();
  if (tabela === 'membros') { const eu = S.user?.email?.toLowerCase(); const me = S.membros.find(m => m.email === eu); if (!me || !me.ativo) { S.fase = 'sem-acesso'; } else S.membro = me; }
  render();
}
function assinar() {
  if (canal) sb.removeChannel(canal);
  canal = sb.channel('infinito')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'produtos' }, pl => aplicar('produtos', 'id', pl))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'vendas' }, pl => aplicar('vendas', 'id', pl))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'membros' }, pl => aplicar('membros', 'email', pl))
    .subscribe();
}
let sessaoAtual; // undefined até a primeira resposta do login
async function iniciarSessao(user) {
  S.user = user || null;
  if (!user) { S.fase = 'login'; render(); return; }
  S.fase = 'carregando'; render();
  try {
    const email = (user.email || '').toLowerCase();
    const { data: me, error } = await sb.from('membros').select('*').eq('email', email).maybeSingle();
    if (error) throw error;
    if (!me || !me.ativo) { S.fase = 'sem-acesso'; render(); return; }
    S.membro = me;
    if (!me.nome && user.user_metadata?.full_name) { await sb.rpc('atualizar_meu_nome', { p_nome: user.user_metadata.full_name }); S.membro.nome = user.user_metadata.full_name; }
    await buscar();
    S.fase = 'pronto'; render();
    assinar(); migrarFotos();
  } catch (err) { S.erro = msgErro(err); S.fase = 'erro'; render(); }
}

(function init() {
  try { if (localStorage.getItem('menuRecolhido') === '1') document.body.classList.add('mini'); } catch (e) { }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => { });
  verificarVersao();
  const cfg = window.CONFIG || {};
  if (!window.supabase || !cfg.SUPABASE_URL || cfg.SUPABASE_URL.startsWith('COLE_AQUI')) { S.fase = 'config'; render(); return; }
  sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  const erroUrl = new URLSearchParams(location.search).get('error_description');
  if (erroUrl) { S.erro = erroUrl; history.replaceState(null, '', location.pathname + location.hash); }
  sb.auth.onAuthStateChange((evento, session) => {
    const uid = session?.user?.id || null;
    if (uid === sessaoAtual) return; // renovação de token etc.
    sessaoAtual = uid;
    setTimeout(() => iniciarSessao(session?.user || null), 0);
  });
  render();
})();
