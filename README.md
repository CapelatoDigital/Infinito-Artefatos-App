# App Infinito Artefatos

Controle de estoque e lançamento de vendas da Infinito Artefatos. Funciona como site no Chrome e pode ser **instalado** no celular e no computador.

- **Site:** HTML/JS puro, sem etapa de build, publicado na **Vercel**
- **Banco, login e fotos:** **Supabase**, com login pelo Google
- **Acesso:** só entra quem estiver na lista **Equipe** do app, com a conta Google do e-mail cadastrado

## Estrutura

| Arquivo | O que é |
|---|---|
| `index.html`, `styles.css`, `app.js` | O app |
| `config.js` | Endereço e chave pública do Supabase (**preencher**) |
| `manifest.webmanifest`, `sw.js`, `icons/` | O que torna o app instalável |
| `supabase/schema.sql` | Tabelas, regras de acesso e operações de venda/estoque |
| `supabase/seed-1.sql`, `seed-2.sql` | Os 12 produtos migrados do app anterior |
| `vercel.json`, `.vercelignore` | Configuração da Vercel |

---

## Passo a passo da configuração (uma vez só)

### 1. Supabase: criar o banco

1. Entre em <https://supabase.com> com a conta Google e crie um projeto (**New project**).
   - Nome: `infinito-artefatos`
   - Região: **South America (São Paulo)**
   - Guarde a senha do banco num lugar seguro.
2. Abra **SQL Editor → New query**, cole todo o conteúdo de `supabase/schema.sql` e clique em **Run**.
3. Repita com `supabase/seed-1.sql` e depois com `supabase/seed-2.sql`. São os produtos do app antigo, e cada arquivo deve rodar **uma única vez**.
4. Em **Project Settings → API**, copie a **Project URL** e a chave **anon public** e cole em `config.js`.

### 2. Google: liberar o "Entrar com Google"

1. Entre em <https://console.cloud.google.com>, crie um projeto (`Infinito Artefatos`) e abra **APIs e serviços → Tela de permissão OAuth**.
   - Tipo: **Externo**. Nome do app: `Infinito Artefatos`. Coloque seu e-mail de suporte.
   - No fim, clique em **Publicar app**. Sem isso, só os e-mails listados como "testadores" conseguem entrar.
2. Vá em **Credenciais → Criar credenciais → ID do cliente OAuth**:
   - Tipo: **Aplicativo da Web**
   - **URIs de redirecionamento autorizados:** `https://SEU-PROJETO.supabase.co/auth/v1/callback`, usando a Project URL do passo 1 seguida de `/auth/v1/callback`.
3. Copie o **ID do cliente** e a **Chave secreta**.
4. No Supabase, em **Authentication → Sign In / Providers → Google**, ative, cole os dois valores e salve.

### 3. Vercel: publicar o site

1. Entre em <https://vercel.com> com a conta do GitHub e clique em **Add New → Project**.
2. Importe o repositório `app-infinito-artefatos`.
3. Em **Framework Preset**, escolha **Other**. Deixe Build Command e Output Directory vazios e clique em **Deploy**.
4. Copie o endereço gerado, por exemplo `https://app-infinito-artefatos.vercel.app`.

### 4. Supabase: autorizar o endereço do site

Em **Authentication → URL Configuration**:
- **Site URL:** o endereço da Vercel
- **Redirect URLs:** adicione `https://SEU-ENDERECO.vercel.app/**`

### 5. Primeiro acesso

1. Abra o site e clique em **Entrar com Google** com `capelatodigital@gmail.com` ou `sacerdotefelipecapelato@gmail.com`. Os dois já são administradores.
2. Na aba **Equipe**, adicione o Gmail da Jéssica e da Cássia como **Equipe**.
3. Mande o endereço do site para elas.

---

## Instalar o app

- **Chrome no computador:** botão **Instalar app** no topo do site, ou o ícone de instalar na barra de endereço.
- **Android (Chrome):** botão **Instalar app**, ou menu ⋮ → **Instalar app**.
- **iPhone (Safari):** Compartilhar → **Adicionar à Tela de Início**.

## Quem pode o quê

| | Equipe | Administrador |
|---|:-:|:-:|
| Registrar vendas | ✓ | ✓ |
| Cadastrar produto e lançar entrada | ✓ | ✓ |
| Editar preço, foto e dados do produto | ✓ | ✓ |
| Excluir produto e cancelar venda | | ✓ |
| Gerenciar a equipe | | ✓ |

As regras ficam no banco de dados (`schema.sql`), não só na tela. Mesmo que alguém mexa no código do navegador, o Supabase recusa o que a pessoa não tem permissão para fazer. Toda venda dá baixa no estoque numa única operação, e o banco não deixa vender mais do que existe.

## Atualizar o app

Cada alteração enviada ao GitHub (branch `main`) é publicada automaticamente pela Vercel em cerca de 1 minuto. Quem tem o app instalado recebe a versão nova ao reabrir.
