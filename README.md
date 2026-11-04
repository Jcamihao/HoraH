# Hora H

Agendamento online para salões, barbearias e estúdios de beleza. Especificação completa em [ESPECIFICACAO.md](ESPECIFICACAO.md).

**Versão 0.8.0.** Fases 1 a 4 prontas e interface nova (telas do Claude Design, com modo escuro). O contrato com o Asaas (sandbox) e com o WA-AKG (sessão, QR, pareamento, webhook) foi conferido contra instâncias reais; **envio de mensagem e confirmação de entrega do WhatsApp só foram testados contra um WA-AKG de mentira** (falta um celular para ler o QR): ver "WhatsApp" abaixo.
- Fase 1 (fundação): multi-tenant, login e papéis, cadastro do dono com passo a passo, profissionais, serviços, preços por profissional, convite por link.
- Fase 2 (agenda e link público): disponibilidade com fuso horário, página pública `/{slug}`, marcação sem conflito (garantida no banco), agendamento manual, situação do atendimento, folgas e bloqueios, cancelar e remarcar pelo link único `/agendamento/{token}`, agenda do painel (dia e semana).
- Fase 3 (assinatura): teste de 7 dias, faixas por número de profissionais, cobrança mensal pelo Asaas (Pix, cartão ou boleto), webhooks, tolerância de 5 dias, bloqueio e modo restrito, mudança de faixa com confirmação, e-mails (cobrança e avisos ao dono de novo agendamento e cancelamento).
- Fase 4 (WhatsApp): conexão do número do salão por QR (ou código de pareamento), confirmação imediata, lembrete 24 h antes (8h às 20h), confirmação de presença, cancelamento automático por falta de resposta (só se o lembrete foi ENTREGUE, com pausa de 22h às 8h), bot de agendamento em menu guiado e notificações no painel.
- Próxima: Fase 5 (financeiro) e Fase 6 (fechamento para lançamento: LGPD, backup, revisão de segurança).

## Estrutura

| Pasta | O que é |
|---|---|
| `apps/api` | NestJS 11 + Prisma 6 + PostgreSQL |
| `apps/web` | Angular 20 (Signals, sem Zone.js). Design em [`apps/web/DESIGN.md`](apps/web/DESIGN.md), tokens e tema escuro em `apps/web/src/styles/_tokens.scss` |
| `packages/shared` | Contratos usados pelos dois (papéis, slug, horários, tipos de resposta) |

## Guia completo: do zero até o app rodando com WhatsApp

Este guia leva do repositório vazio até o Hora H funcionando com cobrança (Asaas) e WhatsApp (WA-AKG). Faça na ordem. Os passos 1 a 3 já bastam para usar o app; os demais ligam as integrações, e cada uma é opcional.

### Como as peças se encaixam

```
Celular do cliente ──► página pública /{slug} ─┐
Celular do salão  ──► painel (Angular, :4200) ─┤
                                               ▼
                                  API do Hora H (NestJS, :3000)
                                   │        │         │
                         PostgreSQL │   Redis │         │ HTTP (chave de API)
                         (:5440 dev)│  (jobs) │         ▼
                                    │         │   WA-AKG (:3100) ◄──► WhatsApp
                                    │         │         │
                                    │         └─ Asaas ◄┘   (webhook assinado volta para
                                    ▼                        https://.../api/webhooks/whatsapp)
                              mesmo PostgreSQL
                        (WA-AKG usa o schema `wa_akg`)
```

- **Hora H** (este repositório): painel, página pública e API.
- **WA-AKG**: programa separado (Baileys) que conversa com o WhatsApp. Cada salão vira **uma sessão** nele. O Hora H chama o WA-AKG por HTTP com uma chave de API, e o WA-AKG avisa o Hora H por **webhook HTTPS público** (entrega, respostas do cliente, queda de conexão).
- **Asaas**: cobrança da assinatura do salão (Pix, cartão ou boleto). O Hora H nunca cobra o cliente final.

### Passo 0. O que você precisa ter

| Item | Para quê |
|---|---|
| Node 20.19 ou mais novo e npm | rodar tudo |
| git e `openssl` | clonar e gerar segredos |
| Um chip de WhatsApp **só do negócio** + um segundo celular | o chip é o número do salão (lê o QR); o outro celular faz o papel de cliente. Não use o seu número pessoal: o WhatsApp pode bloquear números que mandam mensagens automáticas |
| `cloudflared` (ou `ngrok`) | só em teste local: dar um endereço HTTPS público para o webhook do WA-AKG |
| Conta no Asaas sandbox | opcional: testar a cobrança |
| Redis | só em produção (em desenvolvimento os jobs rodam num temporizador do processo) |

Não precisa de Docker: em desenvolvimento o PostgreSQL roda embutido.

### Passo 1. Baixar e instalar

```bash
git clone https://github.com/Jcamihao/HoraH.git
cd HoraH
npm install
```

Se a instalação falhar no `postinstall` do `redis-memory-server` (rede que bloqueia o download do binário do Redis), rode `REDISMS_DISABLE_POSTINSTALL=1 npm install`. Só o teste e2e da fila precisa desse binário; nesse caso use o Redis do sistema com `REDISMS_SYSTEM_BINARY=/usr/bin/redis-server`.

### Passo 2. Subir o app em desenvolvimento

```bash
npm run dev      # banco, API e site de uma vez; Ctrl+C para parar
```

Na primeira vez ele também compila o `packages/shared` e cria `apps/api/.env` com um `JWT_SECRET` aleatório. Quando aparecer "Tudo no ar", abra http://localhost:4200.

Para subir cada parte num terminal (útil para ver o log separado): `npm run dev:db` (PostgreSQL na porta 5440 + migrations), `npm run dev:api` (http://localhost:3000/api) e `npm run dev:web` (http://localhost:4200, com proxy de `/api`). Se uma das portas 5440, 3000 ou 4200 estiver ocupada, o `npm run dev` avisa e não sobe nada.

### Passo 3. Criar a conta e cadastrar o salão

1. Em http://localhost:4200 toque em **Criar conta, 7 dias grátis**. Preencha seu nome, o nome do salão, o endereço (o `slug`, que vira `/{slug}`), e-mail e senha (mínimo 8 caracteres).
2. O cadastro do salão tem 6 passos: **Salão**, **Horário de funcionamento**, **Profissionais** ("Eu também atendo" dá agenda própria ao dono), **Serviços**, **Preços** (por profissional) e **WhatsApp** (dá para conectar depois). No desktop a lista dos passos aparece na barra lateral escura.
3. Ao concluir você cai no **Início**. O link de agendamento do salão aparece ali (`/{slug}`). O botão sol/lua no canto superior direito liga e desliga o modo escuro.

Sem as chaves do Asaas e do WA-AKG, a tela de Assinatura diz "cobrança não configurada" e a de WhatsApp diz "não configurado". É normal. Os e-mails saem só no log do terminal.

### Passo 4. Variáveis de ambiente da API (`apps/api/.env`)

O `npm run dev` cria o arquivo a partir de `apps/api/.env.example`. Nunca commite o `.env`.

| Variável | Obrigatória | O que é |
|---|---|---|
| `DATABASE_URL` | sim | PostgreSQL. Em dev: `postgresql://horah:horah@localhost:5440/horah?schema=public` |
| `JWT_SECRET` | sim | mínimo 32 caracteres. Gere com `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `PORT` | não | porta da API (3000) |
| `APP_BASE_URL` | não | endereço público do site, usado nos links dos e-mails (padrão `http://localhost:4200`) |
| `COOKIE_SECURE` | não | cookie de sessão só por HTTPS. Padrão: ligado em produção |
| `TRUST_PROXY` | não | quantos proxies reversos ficam na frente da API (0 em dev, 1 atrás do Nginx ou Caddy) |
| `TRIAL_DAYS` | não | dias de teste grátis (7) |
| `REDIS_URL` | em produção | fila dos jobs (BullMQ). Sem ela, em dev, os jobs rodam num temporizador |
| `ASAAS_API_KEY`, `ASAAS_BASE_URL`, `ASAAS_WEBHOOK_TOKEN` | para cobrança | a chave começa com `$`: entre aspas simples. A URL padrão é a do **sandbox**. `ASAAS_API_KEY` exige `ASAAS_WEBHOOK_TOKEN` |
| `MAIL_PROVIDER`, `RESEND_API_KEY`, `MAIL_FROM` | para e-mail | `log` (dev) escreve o e-mail no terminal; `resend` envia de verdade e exige a chave |
| `WAAKG_URL`, `WAAKG_API_KEY`, `WAAKG_WEBHOOK_SECRET`, `WAAKG_WEBHOOK_URL` | para WhatsApp | as quatro são obrigatórias juntas (passo 6) |
| `WHATSAPP_ESPACAMENTO_MS`, `WHATSAPP_JOB_INTERVALO_S`, `ROTINAS_INTERVALO_MIN` | não | espaçamento entre envios (6000), intervalo do job do WhatsApp (15 s) e das rotinas de assinatura (10 min) |

A API valida tudo ao subir e recusa configuração incompleta (por exemplo `WAAKG_URL` sem as outras três), com uma mensagem dizendo o que falta.

### Passo 5. Cobrança com o Asaas (opcional)

1. Crie uma conta no **sandbox** do Asaas e gere uma chave de API.
2. Em `apps/api/.env`: `ASAAS_API_KEY='$aact_...'` (entre aspas simples), `ASAAS_WEBHOOK_TOKEN=` um segredo longo e aleatório (`openssl rand -hex 32`). Reinicie o `npm run dev`.
3. Para conferir o contrato com o Asaas de verdade: `ASAAS_API_KEY='$aact_...' npm run asaas:sandbox` (só sandbox).
4. Webhook: no painel do Asaas, aponte para `https://SEU-ENDERECO-PUBLICO/api/webhooks/asaas`, com o mesmo token, fila sequencial e os eventos `PAYMENT_*` e `SUBSCRIPTION_*`. Em teste local use o mesmo túnel do passo 6. Sem o webhook a assinatura continua funcionando: o botão "Já paguei: atualizar situação" e o job das rotinas conferem com o Asaas.
5. No app: **Ajustes → Assinatura**, informe um CPF ou CNPJ válido e toque em **Assinar**. A primeira cobrança vence no último dia do teste.

### Passo 6. WA-AKG: o gateway de WhatsApp

**A armadilha principal:** o WA-AKG só chama webhook em endereço **HTTPS público** e recusa `http`, IP privado e `localhost`. Sem endereço público dá para conectar o número e enviar mensagens, mas a confirmação de entrega, as respostas "1" e "2" e o bot não chegam ao Hora H, e o cancelamento automático por falta de resposta fica sem efeito (o app trata a falta de confirmação como "não entregue" e nada é cancelado).

**6.1. Instalar (fora da pasta do Hora H)**

```bash
git clone https://github.com/mrifqidaffaaditya/WA-AKG.git ~/wa-akg
cd ~/wa-akg
sed -i 's/provider = "mysql"/provider = "postgresql"/' prisma/schema.prisma
npm install
```

O `sed` troca o banco dele de MySQL para PostgreSQL, o mesmo do Hora H (ele só usa `@db.Text`, que funciona nos dois).

**6.2. Criar `~/wa-akg/.env`** (troque `COLE_AQUI` pelo resultado de `openssl rand -base64 32`)

```
PORT=3100
HOSTNAME=127.0.0.1
BASE_URL=http://127.0.0.1:3100
NEXTAUTH_URL=http://127.0.0.1:3100
AUTH_TRUST_HOST=true
AUTH_SECRET=COLE_AQUI
DATABASE_URL=postgresql://horah:horah@localhost:5440/horah?schema=wa_akg
NODE_ENV=development
```

A porta é 3100 porque a API do Hora H usa a 3000. O `?schema=wa_akg` mantém as tabelas dele separadas das do Hora H.

**6.3. Criar as tabelas e o usuário**

O banco precisa estar no ar (o `npm run dev` do Hora H rodando).

```bash
cd ~/wa-akg
npx prisma db push
node scripts/setup-admin.js seu@email.com UmaSenhaForte123
npm run dev
```

Deixe o `npm run dev` do WA-AKG num terminal à parte, abra http://127.0.0.1:3100 e entre com esse e-mail e senha. Esse usuário nasce SUPERADMIN, o que serve para teste local. **Em produção use um usuário comum:** webhooks de SUPERADMIN recebem os eventos de todas as sessões (rebaixe o usuário para USER no painel ou no banco).

**6.4. Pegar a chave de API**

No painel do WA-AKG abra **Webhooks** (`/dashboard/webhooks`). Há um cartão de API Key com botão para gerar. Gere e copie a chave.

**6.5. Gerar o segredo do webhook**

```bash
openssl rand -hex 32
```

Ele prova que o aviso veio mesmo do WA-AKG: cada webhook chega assinado (`X-Webhook-Signature: sha256=<HMAC do corpo cru>`) e a API do Hora H confere.

**6.6. Endereço público (só para teste local)**

Em outro terminal:

```bash
cloudflared tunnel --url http://localhost:3000
```

Ele imprime um endereço como `https://algo.trycloudflare.com`, que **muda toda vez que o túnel reinicia**. Alternativa: `ngrok http 3000`. (Nenhum dos dois foi testado neste projeto.) Em produção o endereço é o do seu domínio (passo 8).

**6.7. Ligar o Hora H ao WA-AKG**

Acrescente em `apps/api/.env`:

```
WAAKG_URL=http://127.0.0.1:3100
WAAKG_API_KEY=a-chave-do-6.4
WAAKG_WEBHOOK_SECRET=o-segredo-do-6.5
WAAKG_WEBHOOK_URL=https://algo.trycloudflare.com/api/webhooks/whatsapp
```

Reinicie o `npm run dev` do Hora H. Se o túnel trocar de endereço, atualize `WAAKG_WEBHOOK_URL` e reinicie de novo.

**6.8. Conferir antes de abrir o app**

```bash
curl -s -o /dev/null -w "WA-AKG: %{http_code}\n" http://127.0.0.1:3100/
curl -s -o /dev/null -w "API pelo túnel: %{http_code}\n" https://algo.trycloudflare.com/api/health
```

Os dois devem dar `200`. Se o segundo falhar, o webhook não vai funcionar.

### Passo 7. Conectar o WhatsApp do salão e testar

1. No app: **Ajustes → WhatsApp → Conectar WhatsApp**. A situação passa para "Aguardando leitura" e o QR code aparece.
2. No celular do chip do salão: WhatsApp → **Aparelhos conectados** → **Conectar um aparelho** → aponte para o QR. Quando conectar, a tela passa sozinha para "Conectado" (ela consulta a cada poucos segundos). Se não houver outro aparelho para ler o QR, use "Gerar código de conexão": informe o número do chip e digite o código de 8 caracteres no WhatsApp.
3. Com o segundo celular, abra o link público do salão (`/{slug}`) e marque um horário usando o número desse segundo celular. Esperado: chega a **confirmação** imediata no WhatsApp.
4. **Lembrete:** sai 24 h antes, entre 8h e 20h do fuso do salão. Responder `1` confirma e `2` cancela. Sem resposta, o horário é cancelado 2 h depois da **entrega** do lembrete (a contagem pausa das 22h às 8h).
5. **Bot:** mande uma mensagem ("oi") do segundo celular para o número do salão. O menu oferece `1) Agendar` e `2) Meus agendamentos`.
6. Para desconectar: **Ajustes → WhatsApp → Desconectar** (dois toques).

O roteiro detalhado, com o esperado de cada passo, está em [docs/roteiro-de-testes.md](docs/roteiro-de-testes.md).

### Passo 8. Colocar em produção (VPS)

> **Aviso:** estes passos seguem o que o código exige (variáveis, portas, rotas), mas **ainda não foram executados num servidor real**. Trate o primeiro deploy como um teste e anote o que divergir.

Arquitetura: um domínio com HTTPS na frente (Caddy, abaixo, ou Nginx) → `/api` vai para a API (`127.0.0.1:3000`) e o resto serve os arquivos do site; o WA-AKG fica só em `127.0.0.1:3100`; PostgreSQL e Redis ficam na própria máquina.

1. **Pacotes:** Node 20.19+, PostgreSQL, Redis, Caddy e PM2 (`npm i -g pm2`).
2. **Banco:** crie o usuário e o banco do Hora H (`CREATE ROLE horah LOGIN PASSWORD '...'; CREATE DATABASE horah OWNER horah;`). O WA-AKG usa o mesmo banco no schema `wa_akg`.
3. **Código e build:**
   ```bash
   git clone https://github.com/Jcamihao/HoraH.git /srv/horah && cd /srv/horah
   npm ci && npm run build        # compila shared, api e web
   ```
4. **`apps/api/.env` de produção:**
   ```
   NODE_ENV=production
   DATABASE_URL=postgresql://horah:SENHA@localhost:5432/horah?schema=public
   JWT_SECRET=<48+ caracteres aleatórios>
   REDIS_URL=redis://127.0.0.1:6379
   APP_BASE_URL=https://horah.exemplo.com
   TRUST_PROXY=1
   MAIL_PROVIDER=resend
   RESEND_API_KEY=...
   MAIL_FROM=Hora H <avisos@exemplo.com>
   ASAAS_API_KEY='$aact_...'
   ASAAS_BASE_URL=https://api.asaas.com/v3     # produção do Asaas, só de propósito
   ASAAS_WEBHOOK_TOKEN=<segredo>
   WAAKG_URL=http://127.0.0.1:3100
   WAAKG_API_KEY=...
   WAAKG_WEBHOOK_SECRET=<segredo>
   WAAKG_WEBHOOK_URL=https://horah.exemplo.com/api/webhooks/whatsapp
   ```
   Em produção a API **exige** `REDIS_URL`, e o cookie de sessão só trafega por HTTPS.
5. **Migrations e API:**
   ```bash
   npm run migrate:deploy -w @hora-h/api
   pm2 start "npm run start -w @hora-h/api" --name horah-api
   ```
6. **WA-AKG** (em `~/wa-akg`, com `NODE_ENV=production`, `AUTH_SECRET` próprio, `DATABASE_URL` do schema `wa_akg` e um **usuário comum**): `npx prisma db push && npm run build`, depois `pm2 start "npm run start" --name wa-akg` (o repositório dele também traz um `ecosystem.config.js`). Gere a chave de API desse usuário e use no `WAAKG_API_KEY`.
7. **HTTPS e rotas (`/etc/caddy/Caddyfile`):**
   ```
   horah.exemplo.com {
     encode gzip
     handle /api/* {
       reverse_proxy 127.0.0.1:3000
     }
     handle {
       root * /srv/horah/apps/web/dist/web/browser
       try_files {path} /index.html
       file_server
     }
   }
   ```
   O `try_files` devolve o `index.html` para as rotas do Angular (`/painel`, `/{slug}`, `/agendamento/{token}`).
8. **Webhooks externos:** Asaas → `https://horah.exemplo.com/api/webhooks/asaas`; WA-AKG → o Hora H registra sozinho o webhook em `WAAKG_WEBHOOK_URL` ao conectar cada sessão.
9. **Persistir o PM2:** `pm2 save && pm2 startup`.
10. **Backup:** o banco guarda tudo (inclusive as sessões do WhatsApp no schema `wa_akg`). Faça `pg_dump` periódico. O backup automático ainda é trabalho da Fase 6.

### Passo 9. Problemas comuns

| Sintoma | Causa provável e saída |
|---|---|
| `npm run dev` diz que uma porta está em uso | feche o que usa 5440, 3000 ou 4200 |
| A API não sobe: "WAAKG_URL exige WAAKG_API_KEY, ..." | as quatro variáveis do WhatsApp são obrigatórias juntas |
| Tela do WhatsApp: "ainda não está configurado neste ambiente" | `WAAKG_URL` vazio ou a API não foi reiniciada depois de editar o `.env` |
| O QR não aparece ou a sessão fica "Desconectado" | o WA-AKG precisa de saída para a internet até os servidores do WhatsApp; confira o log dele e se a chave de API é de usuário comum |
| Mensagem sai, mas a entrega e as respostas "1"/"2" nunca chegam | webhook sem endereço público: confira o passo 6.8 e se o endereço do túnel não mudou |
| Webhook responde 401 | `WAAKG_WEBHOOK_SECRET` diferente do que o Hora H registrou; reinicie a API e reconecte a sessão |
| Painel avisa "assinatura pendente" e recusa salvar (402) | assinatura bloqueada (modo restrito): regularize em Ajustes → Assinatura |
| O PostgreSQL não sobe | ele recusa rodar como `root`; use um usuário comum |
| Cliente não consegue marcar na página pública | assinatura bloqueada, ou nenhum profissional com serviço e preço definidos |

## Roteiro de testes

[docs/roteiro-de-testes.md](docs/roteiro-de-testes.md): passo a passo para testar o app inteiro, incluindo como instalar e configurar o WA-AKG e testar o WhatsApp no app.

## Testes

```bash
npm test                                   # API: unitários + e2e contra um PostgreSQL embutido (374 testes)
CHROME_BIN=/caminho/do/chrome npm run test:web   # Angular: 51 testes em Chrome headless
npm run build                              # compila shared, api e web
ASAAS_API_KEY='$aact_...' npm run asaas:sandbox   # confere o contrato com o Asaas de verdade (só sandbox)
```

Os testes da API aplicam as migrations reais e conferem: isolamento entre salões (inclusive no banco, por chave estrangeira composta), papéis, sessão com rotação de refresh token, convites, limites de tentativa, constraints, disponibilidade em vários fusos (inclusive horário de verão), corrida de 10 marcações no mesmo horário (só uma passa) e o fluxo completo do link do cliente.

## Decisões que valem lembrar

- **Isolamento por tenant:** o `PrismaService.db` filtra tudo por `estabelecimentoId` e falha se não houver tenant no contexto. `semTenant` e SQL cru só existem nos arquivos listados em `apps/api/src/semtenant-allowlist.spec.ts`.
- **Sessão:** access token (15 min) só na memória do navegador; refresh token opaco, rotativo, em cookie `httpOnly`. Reuso tardio de um refresh token antigo derruba a sessão inteira.
- **Dono também atende:** ao cadastrar um profissional, o dono pode marcar "Eu também atendo" e ganha agenda própria.
- **Identidade visual (v0.8.0):** telas do Claude Design: Poppins, "H" da marca em Caveat, laranja `#e84a27`, verde `#65a30d`, preto e fundo claro, cartões brancos e botões em pílula; barra lateral escura no desktop e abas flutuantes no celular. Títulos em maiúsculas.
- **Modo escuro:** botão sol/lua no canto superior direito de todas as telas (`TemaStore`). A escolha fica em `localStorage` (`hh_tema`); sem escolha, vale o tema do sistema. A paleta escura está no mixin `escuro` de `_tokens.scss` e liga com `data-tema="escuro"` no `<html>`.
- **Campos de dia e hora:** `hh-campo-data` e `hh-campo-hora` (`apps/web/src/app/shared/campo-nativo.component.ts`) mostram "Qua, 4 nov" e "14:00" na fonte do app, com o seletor nativo transparente por cima.

## Agenda e página pública (Fase 2)

- **Conflito de horário:** o banco recusa dois agendamentos não cancelados que se sobrepõem para o mesmo profissional (`EXCLUDE USING gist`, intervalo `[início, fim)`: quem termina às 10:00 não conflita com quem começa às 10:00). A aplicação confere antes para dar mensagem boa, mas quem decide é o banco. Teste de mutação: sem a constraint, 5 de 10 marcações simultâneas passavam.
- **Horários:** grade fixa de 30 min; o atendimento inteiro precisa caber numa faixa de trabalho. Tudo é guardado em UTC; dia e hora vêm do fuso do salão (`apps/api/src/agenda/tempo.ts`).
- **Página pública:** `/{slug}` (escolher profissional, serviço, dia, horário, nome e WhatsApp, aceite do uso dos dados). Até 60 dias à frente, antecedência mínima do salão, no máximo 3 horários futuros por WhatsApp e salão. O WhatsApp **não é verificado** nesta fase.
- **Link do cliente:** `/agendamento/{token}` (192 bits, guardado em claro porque o painel reenvia o link e a Fase 4 o põe nos lembretes). Cancelar e remarcar respeitam o prazo de cancelamento do salão; remarcar muda só dia e hora, no mesmo registro. O painel cancela fora do prazo.
- **Painel:** o dono vê todos os profissionais; o profissional vê e altera só a própria agenda e os próprios bloqueios (agendamento de outro é 404). Concluído e faltou só valem depois que o horário começa.
- **Preço e duração** são copiados para o agendamento: mudar o serviço depois não reescreve o passado.
- **Design da página pública:** `apps/web/src/styles/_publico.scss`, mesma identidade do painel: faixa preta com o nome do salão em maiúsculas e formas redondas laranja e verde; no desktop vira um painel lateral.

## Assinatura e cobrança (Fase 3)

- **Preço pelo número de profissionais ativos:** 1 = R$ 29,90; 2 a 5 = R$ 59,90; 6 ou mais = R$ 99,90 (`packages/shared/src/assinatura.ts`). Ao adicionar ou reativar um profissional que passa de faixa numa assinatura ativa, o painel pede confirmação e o valor novo vale a partir da próxima cobrança (`PUT /subscriptions` com `updatePendingPayments=false`). Diminuir não pede confirmação. Se o Asaas falhar nessa hora, o cadastro vale e o job reenvia.
- **Teste de 7 dias sem cartão.** Assinar durante o teste cria a assinatura com a 1ª cobrança vencendo no último dia dele. Forma de pagamento livre (`billingType UNDEFINED`): o dono escolhe Pix, cartão ou boleto na página do Asaas. O CPF/CNPJ vai só para o Asaas e não fica no nosso banco.
- **Tolerância e bloqueio:** cobrança vencida (ou teste vencido sem assinar) dá 5 dias de tolerância com avisos; depois bloqueia novos agendamentos (link e painel). Agendamentos já marcados e todos os dados ficam guardados; o cliente ainda cancela/remarca pelo link. Pagou: libera na hora (webhook). O acesso é **calculado com o relógio** (`calcularAcesso`): um atraso do job nunca libera nem bloqueia errado.
- **Modo restrito:** com a assinatura bloqueada o painel é só consulta (escrita responde 402 com `code: ASSINATURA_RESTRITA`). Seguem valendo: tela de assinatura, e concluir/faltou/cancelar o que já estava marcado.
- **Webhook do Asaas:** `POST /api/webhooks/asaas`, autenticado pelo cabeçalho `asaas-access-token` (= `ASAAS_WEBHOOK_TOKEN`). No painel do Asaas: URL pública da API + esse token, fila sequencial, eventos `PAYMENT_*` e `SUBSCRIPTION_*`. Todo evento é gravado (`asaas_eventos`); o id do evento é único, então reentrega não repete efeito, e evento atrasado nunca desfaz um pagamento. Estorno e chargeback só viram status da cobrança e log: não derrubam o acesso.
- **Job (BullMQ + Redis):** a cada `ROTINAS_INTERVALO_MIN` (10) passa por todos os salões: vira teste vencido em tolerância, tolerância vencida em bloqueio, confere com o Asaas quem está em atraso (recupera webhook perdido) e envia os avisos, cada um uma vez só (`avisos_email` reserva a chave antes de enviar). **`REDIS_URL` é obrigatória em produção**; em desenvolvimento, sem Redis, roda num temporizador do processo.
- **E-mail (Resend):** `MAIL_PROVIDER=resend` + `RESEND_API_KEY` + `MAIL_FROM` (domínio verificado). Em desenvolvimento `MAIL_PROVIDER=log` escreve no log. O dono também recebe e-mail de novo agendamento e cancelamento feitos pelo cliente (liga/desliga em Ajustes); a lista de notificações dentro do painel fica para a Fase 4.
- **Variáveis novas** (ver `apps/api/.env.example`): `ASAAS_API_KEY`, `ASAAS_BASE_URL` (sandbox por padrão), `ASAAS_WEBHOOK_TOKEN`, `MAIL_PROVIDER`, `RESEND_API_KEY`, `MAIL_FROM`, `REDIS_URL`, `ROTINAS_INTERVALO_MIN`. A chave do Asaas começa com `$`: entre aspas simples.
- **Limites desta fase:** sem débito automático em cartão salvo (cada cobrança é paga na página do Asaas); estorno só registra; a regra de faixa olha o número de profissionais ativos no momento da mudança (não impede ativar e desativar perto da cobrança); os campos do Asaas foram conferidos contra um Asaas de mentira dos testes e contra a documentação, **não** contra o sandbox real.

## WhatsApp (Fase 4)

- **Gateway:** [WA-AKG](https://github.com/mrifqidaffaaditya/WA-AKG) (Baileys, não oficial), um serviço separado no mesmo servidor, **uma sessão por salão** (o nome da sessão é o id do estabelecimento). Tudo passa pela interface `WhatsAppProvider` (`apps/api/src/whatsapp/whatsapp.provider.ts`): trocar pela API oficial da Meta é escrever outra implementação. Decisões e achados em [docs/fase-4-whatsapp.md](docs/fase-4-whatsapp.md).
- **Subir o WA-AKG com o mesmo PostgreSQL:** passo a passo no [Passo 6 do guia](#passo-6-wa-akg-o-gateway-de-whatsapp) (troca do `provider` para PostgreSQL, schema `wa_akg`, usuário que não seja SUPERADMIN, chave de API, segredo de webhook e as quatro variáveis `WAAKG_*`).
- **O WA-AKG só chama webhook HTTPS público** (recusa `http` e IP privado/localhost): `WAAKG_WEBHOOK_URL` é o endereço público da API + `/api/webhooks/whatsapp`. Cada webhook vem assinado (`X-Webhook-Signature: sha256=HMAC` do corpo cru); a API usa `rawBody` para conferir. **O WA-AKG não reenvia webhook que falhou**: o que se perder cai no caminho seguro (sem confirmação de entrega, nada é cancelado e o dono é avisado).
- **Lembrete e cancelamento automático (spec 6):** o lembrete sai 24 h antes, só entre 8h e 20h do fuso do salão (antes das 8h sai às 8h; depois das 20h, às 20h). Agendamento com menos de 24 h, ou cujo horário de lembrete já passou, recebe só a confirmação imediata. O prazo de 2 h para o cliente responder **só começa quando o WhatsApp confirma a ENTREGA** e **não conta das 22h às 8h** (entregue às 21h vence às 9h). Sem resposta: cancela (ignorando o prazo de cancelamento do salão), avisa o cliente com link para remarcar e avisa o dono. Lembrete sem entrega depois de 2 h: o dono é avisado no painel e por e-mail e nada é cancelado.
- **Confirmar:** o cliente responde `1` (confirmar) ou `2` (cancelar) ao lembrete, ou toca em "Confirmo que vou" no link.
- **Bot (spec 7.2):** `1) Agendar`, `2) Meus agendamentos`; escolher profissional, serviço, dia, horário, nome (só se for cliente novo) e confirmar; ver, remarcar e cancelar. Usa a mesma agenda do link (disponibilidade, antecedência, prazo, teto de 3 horários por WhatsApp, assinatura bloqueada). Conversa expira em 30 min de silêncio. Só entende texto; ignora grupos.
- **Anti-bloqueio:** envios do mesmo salão saem espaçados (`WHATSAPP_ESPACAMENTO_MS`, 6 s ± 40% por padrão), uma mensagem de cada vez; só falamos com quem já tem horário ou puxou conversa; o painel recomenda número exclusivo do negócio. Mensagem que não sai em 6 h expira.
- **Fila e jobs:** a fila é a tabela `mensagens_log` (que também é o log da spec); um job a cada `WHATSAPP_JOB_INTERVALO_S` (15 s) manda o que está pronto, põe os lembretes devidos na fila e cancela quem não respondeu. Cada mensagem é "alugada" antes de enviar, então despachos simultâneos nunca duplicam.
- **Limites:** o WA-AKG devolve 500 (não 503) ao enviar sem sessão conectada, tratado como falha repetível; o bot só atende números brasileiros de celular; números `@lid` (sem telefone) são ignorados.
