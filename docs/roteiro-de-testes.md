# Roteiro de testes do Hora H

Para testar o app inteiro, do zero, no celular ou numa janela de navegador estreita (390px). A parte B liga o WhatsApp de verdade pelo WA-AKG.

Legenda: **Esperado** é o que deve acontecer. Se algo diferente acontecer, anote o passo e o texto da tela ou do terminal.

## Parte A. Subir o app

1. Na pasta do projeto: `npm run dev:all`. Espere a linha "Tudo no ar".
2. Abra http://localhost:4200.
3. Para parar, Ctrl+C no terminal.

Sem as chaves do Asaas e do WA-AKG, a tela de Assinatura diz "cobrança não configurada" e a de WhatsApp diz "não configurado". É normal. E-mails saem só no log do terminal.

## Parte B. Configurar o WA-AKG e ligar ao Hora H

O WA-AKG é um programa separado que conversa com o WhatsApp. O Hora H fala com ele por HTTP e cada salão vira uma sessão nele.

**Armadilha principal:** o WA-AKG só chama endereço HTTPS público e recusa `localhost`. Para receber a confirmação de entrega e as respostas do cliente no seu computador, o webhook precisa de um túnel (passo B6). Sem túnel dá para conectar e enviar, mas as respostas "1" e "2" e o menu do bot não chegam ao app.

**B1. Instalar (fora da pasta do Hora H)**

```bash
git clone https://github.com/mrifqidaffaaditya/WA-AKG.git ~/wa-akg
cd ~/wa-akg
sed -i 's/provider = "mysql"/provider = "postgresql"/' prisma/schema.prisma
npm install
```

O `sed` troca o banco dele de MySQL para PostgreSQL, o mesmo do Hora H.

**B2. Criar `~/wa-akg/.env`**

Troque `COLE_AQUI` pelo resultado de `openssl rand -base64 32`.

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

A porta é 3100 porque a API do Hora H usa a 3000. O `?schema=wa_akg` põe as tabelas dele separadas das do Hora H.

**B3. Criar as tabelas e o usuário dele**

O banco precisa estar no ar, então o `npm run dev:all` do Hora H tem de estar rodando.

```bash
cd ~/wa-akg
npx prisma db push
node scripts/setup-admin.js seu@email.com UmaSenhaForte123
npm run dev
```

Deixe o `npm run dev` rodando num terminal à parte. Abra http://127.0.0.1:3100 e entre com esse e-mail e senha. Esse usuário nasce SUPERADMIN, o que serve para teste local. Em produção use um usuário comum, porque webhooks de SUPERADMIN recebem eventos de todas as sessões.

**B4. Pegar a chave de API**

No painel do WA-AKG, abra **Webhooks** (`/dashboard/webhooks`). Há um cartão de API Key com botão para gerar. Gere e copie a chave.

**B5. Gerar o segredo do webhook**

`openssl rand -hex 32`. Ele prova que o aviso veio mesmo do WA-AKG.

**B6. Endereço público para o webhook (só para teste local)**

Instale o `cloudflared` e rode, num terminal à parte:

```bash
cloudflared tunnel --url http://localhost:3000
```

Ele imprime um endereço como `https://algo.trycloudflare.com`. Esse endereço muda toda vez que o túnel reinicia. Alternativa: `ngrok http 3000`. Nenhum dos dois foi testado neste projeto.

**B7. Ligar o Hora H**

Acrescente em `apps/api/.env`:

```
WAAKG_URL=http://127.0.0.1:3100
WAAKG_API_KEY=a-chave-do-B4
WAAKG_WEBHOOK_SECRET=o-segredo-do-B5
WAAKG_WEBHOOK_URL=https://algo.trycloudflare.com/api/webhooks/whatsapp
```

As quatro são obrigatórias juntas. Reinicie o `npm run dev:all`. Se o túnel mudar de endereço, atualize `WAAKG_WEBHOOK_URL` e reinicie de novo.

**B8. Conferir antes de abrir o app**

```bash
curl -s -o /dev/null -w "WA-AKG: %{http_code}\n" http://127.0.0.1:3100/
curl -s -o /dev/null -w "API pelo túnel: %{http_code}\n" https://algo.trycloudflare.com/api/health
```

Os dois devem dar 200. Se o segundo falhar, o webhook não vai funcionar.

**Cuidados com o número**
- Use um chip só de teste, nunca o seu número pessoal. O WhatsApp pode bloquear números que mandam mensagens automáticas.
- Você precisa de **dois** aparelhos: o do chip do salão (lê o QR) e outro celular que faz o papel de cliente.

## Parte C. Roteiro do app

### C1. Cadastro e passo a passo
1. **Criar conta** com nome, salão, endereço (só letras minúsculas, números e hífen), e-mail e senha de 8+ caracteres. Esperado: cai no passo a passo.
2. Errar de propósito (endereço com acento, senha curta). Esperado: campo rosa e mensagem em português.
3. Passos: Salão, Horário, Profissionais (crie 2), Serviços (com duração), Preços por profissional, WhatsApp (pule agora). Esperado: barra de progresso avança e o botão Voltar não perde o que foi digitado.
4. Concluir. Esperado: cai no painel Início.

### C2. Painel do dono
1. **Início:** aviso de teste grátis (7 dias), contagem de equipe e serviços, link de agendamento, botões Copiar link e Abrir página.
2. **Equipe:** abrir um profissional, mudar nome, horário e preços. Convidar gera um link.
3. **Serviços:** criar, editar na própria linha e desativar.
4. **Ajustes:** mudar nome, fuso, antecedência mínima e prazo de cancelamento. Salvar.

### C3. Agenda (visão do dono)
1. **Marcar horário** (botão azul): profissional, serviço, dia, horário, nome e WhatsApp do cliente. Esperado: ficha na agenda com a hora grande.
2. Tentar o mesmo horário do mesmo profissional. Esperado: o horário não aparece ou dá erro de conflito.
3. Abrir a ficha e marcar Concluído, Faltou e Cancelado. Esperado: carimbo de estado, e a ficha cancelada fica riscada.
4. Alternar Dia e Semana, filtrar por profissional e usar Voltar para hoje.
5. **Bloquear horário** (almoço, folga e dia inteiro). Esperado: aparece cinza na agenda e some dos horários do cliente.

### C4. Página pública (cliente)
1. Janela anônima em `http://localhost:4200/<endereço-do-salão>`.
2. Escolher profissional, serviço, dia e horário. Informar nome e WhatsApp e confirmar. Esperado: confirmação com link do agendamento.
3. Abrir o link do agendamento e remarcar. Depois cancelar. Esperado: o painel do dono reflete as duas coisas.
4. Tentar um 4º horário futuro com o mesmo WhatsApp. Esperado: bloqueado (limite de 3).
5. Conferir que horários bloqueados e ocupados não aparecem.

### C5. Profissional
1. Abrir o link de convite em janela anônima e definir a senha.
2. Esperado: vê só a própria agenda; não vê Assinatura, Ajustes do salão nem a agenda dos outros.
3. Em Meu perfil, ajustar o próprio horário.

### C6. Assinatura (precisa de chave Asaas sandbox no `.env`)
1. Ajustes, Assinatura: teste grátis e faixa de preço pelo número de profissionais (1, 2 a 5, 6 ou mais).
2. Assinar. Esperado: abre o link de pagamento do sandbox do Asaas.
3. Sem chave: "cobrança não configurada" e o resto segue funcionando.

## Parte D. WhatsApp no app (depois da Parte B)

Sempre com o app aberto em Ajustes, **WhatsApp**.

### D1. Conectar
1. Toque em **Conectar WhatsApp**. Esperado: aparece o QR (pode levar alguns segundos).
2. No celular do chip do salão: WhatsApp, Aparelhos conectados, Conectar um aparelho, e leia o QR.
3. Esperado: a tela muda sozinha para **Conectado**.
4. Se o celular que vai conectar é o mesmo que você está usando para ver a tela, use **Gerar código de conexão** e digite o código no WhatsApp.

### D2. Confirmação de agendamento
1. Na página pública, marque um horário usando o número do **outro** celular (o cliente).
2. Esperado: o celular do cliente recebe "Seu horário está confirmado", com serviço, profissional, dia e o link do agendamento, em até alguns segundos (há espaçamento de cerca de 6 s entre mensagens do mesmo salão).
3. Toque no link. Esperado: abre a página do agendamento, onde dá para ver, remarcar e cancelar. Remarcar gera uma nova mensagem "Seu horário foi remarcado".

A confirmação **não** pede resposta "1" ou "2". Quem pede é o lembrete (D3).

### D3. Lembrete de 24 h e as respostas 1 e 2
1. Marque um horário que esteja a **menos de 24 horas daqui** e faça isso **entre 8h e 20h**. Exemplo: agora são 14h, marque amanhã às 10h.
2. Esperado: depois da confirmação, o lembrete sai em até cerca de 15 segundos: "Para CONFIRMAR, responda 1. Para CANCELAR, responda 2".
3. No celular do cliente, responda `1`. Esperado: o horário passa a **Confirmado** na agenda.
4. Repita com outro horário e responda `2`. Esperado: o horário é cancelado e o painel mostra o cancelamento.
5. Repita e, em vez de responder, confirme ou cancele pelo link do lembrete. Esperado: o mesmo efeito.
6. Sem responder: a janela é de 2 horas contadas a partir da **entrega** e pausa das 22h às 8h. Se acabar sem resposta, o horário é cancelado sozinho e o cliente recebe "liberamos o horário". Teste demorado; faça só se der tempo.

As respostas "1" e "2" só chegam ao app se o túnel do B6 estiver ativo.

### D4. Bot de agendamento
1. No celular do cliente, mande `menu` (ou `oi`) para o número do salão. Esperado: aparece o menu do bot.
2. Siga as opções que o bot mostrar: marcar horário (escolher profissional, dia e horário), ver os meus horários e cancelar. Esperado: o que o bot faz aparece na agenda.
3. Fique 30 minutos sem responder no meio do menu. Esperado: a conversa expira e recomeça pelo menu.

### D5. Falhas e avisos
1. Ponha o celular do cliente em modo avião **antes** do lembrete sair. Esperado: o lembrete não é entregue e, depois de 2 horas, o dono recebe uma notificação e um e-mail (no log do terminal), **sem cancelar** o horário.
2. Em Ajustes, **Notificações**: conferir novos agendamentos, cancelamentos e avisos.

### D6. Desconectar
1. Em WhatsApp, **Desconectar** (toque duas vezes para confirmar). Esperado: volta para "não conectado".
2. Marcar um horário agora. Esperado: o agendamento é criado normalmente; a mensagem fica na fila e só sai quando o WhatsApp voltar. Se ficar mais de 6 horas desconectado, ela é descartada.
3. Conectar de novo e conferir que a mensagem pendente sai e tudo volta ao normal.

## Parte E. Visual e uso geral
1. Todas as telas em 390px: sem rolagem horizontal, botões fáceis de tocar, texto legível.
2. Desktop em 1440px: barra lateral e coluna centrada.
3. Sair da conta e entrar de novo. Esperado: volta ao painel.

## O que este roteiro não garante
- O texto exato do menu do bot não foi conferido na tela; os passos da D4 seguem o que o bot mostrar.
- O envio e a entrega reais de mensagem **nunca foram vistos funcionando** antes: foram testados só contra um WA-AKG de mentira. A Parte D é a primeira vez de verdade; trate falhas ali como achados, não como erro seu.
- O túnel (`cloudflared` ou `ngrok`) não foi testado neste projeto.
- Esperados das partes C2, C3 (itens 3 a 5), C5 e C6 vêm dos testes automáticos, não de ter olhado a tela.
