# Hora H — Especificação do produto (v1)

> Nome provisório: **Hora H**. Domínio e marca ainda precisam ser conferidos (Registro.br e INPI).
> Este documento reúne todas as decisões já tomadas. Onde algo não foi decidido, está marcado como **[PADRÃO]** (valor sugerido, ajustável) ou listado em "Pendências".

---

## 0. Instruções para o Claude Code

1. Leia este documento inteiro antes de escrever código.
2. **Stack definida: Angular (front) e NestJS (back)**, detalhada na seção 0.1. Antes de codar, proponha em uma resposta curta **só o que falta decidir** (ORM, auth, validação e demais itens marcados como [PADRÃO] na seção 0.1; banco, fila de jobs, estrutura do repositório e deploy já estão decididos) e espere confirmação. O ambiente é uma VPS própria; já existe conta Asaas com sandbox configurado.
3. Construa **por fases** (seção 12), com testes em cada fase. Não avance de fase com testes falhando.
4. Não implemente nada da seção 13 (fora do escopo).
5. Quando surgir dúvida de produto que este documento não cobre, pergunte em vez de assumir.
6. Todo horário é guardado em UTC e exibido no fuso do estabelecimento.

### 0.1 Stack

**Decidido**
- **Front-end: Angular.** Duas áreas na mesma aplicação ou em apps separados (decidir na proposta): o **painel** (dono e profissional) e a **página pública de agendamento** (`/{slug}`, cliente final). A página pública é **mobile-first** e precisa carregar rápido; só use SSR/prerender se medir necessidade.
- **Back-end: NestJS** (TypeScript), API REST organizada em módulos por domínio (estabelecimentos, usuários/auth, profissionais, serviços, agenda, clientes, assinatura, whatsapp, financeiro, notificações).
- **Banco: PostgreSQL.** Isolamento multi-tenant por `estabelecimento_id` em todas as tabelas, aplicado por guard/interceptor no NestJS e, se fizer sentido, reforçado com row-level security. **Conflito de horário** impedido no próprio banco, com constraint de exclusão (ou transação com lock), para nunca haver dois agendamentos sobrepostos do mesmo profissional.
- **Jobs agendados: Redis + BullMQ** (`@nestjs/bullmq`) para lembretes (24h antes, janela 8h–20h), cancelamento automático (2h após entrega), tolerância de inadimplência e backup. Jobs devem ser **idempotentes** e re-executáveis.
- **Estrutura e deploy:** **monorepo** com `apps/web` (Angular) e `apps/api` (NestJS), tipos/contratos compartilhados se simplificar. Containers (Docker) na VPS, proxy reverso com HTTPS, variáveis de ambiente para segredos, ambientes de desenvolvimento e produção separados.

**Sugestões [PADRÃO] — confirmar na proposta antes de codar**
- **ORM/migrações:** Prisma ou TypeORM (escolher e justificar em uma linha).
- **Auth:** JWT com refresh, guards por papel (dono/profissional), convites por token.
- **Validação:** `class-validator`/`class-transformer` nos DTOs.
- **WhatsApp:** módulo NestJS próprio atrás da interface `WhatsAppProvider` (seção 7.1), com a implementação não oficial isolada.
- **Asaas:** módulo próprio de cobrança, com endpoint de webhook validado e idempotente.

---

## 1. Visão geral

Sistema de agendamento online para pequenos negócios de beleza (salão, unhas, sobrancelha, barbearia), vendido por assinatura mensal. Dois canais para o cliente final: **link público** e **bot no WhatsApp**, que convivem. O dono acessa um **painel** para gerir agenda, profissionais, serviços e um balanço financeiro estimado.

**Princípios**
- Mais fácil que marcar pelo WhatsApp manualmente.
- Linguagem neutra no produto: "profissional" e "serviço", nunca "barbeiro" ou "corte" fixos.
- O sistema **não processa pagamento do cliente final**. Só cobra a assinatura do dono.

**Público do lançamento:** beleza em geral (salão, unhas, sobrancelha, barbearia).

---

## 2. Papéis e permissões

| Papel | Pode |
|---|---|
| **Dono** | Tudo: agenda de todos, profissionais, serviços, preços, horários, regras, financeiro, assinatura, conexão do WhatsApp, convidar profissionais |
| **Profissional** | Ver a **própria** agenda, lançar agendamento manual para si, marcar seus atendimentos como concluído/faltou/cancelado. **Sem acesso** a financeiro, assinatura, configurações do salão ou agenda de outros |
| **Cliente final** | Sem login. Agenda por link ou bot, e gerencia o próprio agendamento por link único com token |

- Dono se cadastra sozinho (seção 8). Profissionais são **convidados pelo dono** por link (WhatsApp ou e-mail) e definem a própria senha.
- Dados de cada estabelecimento são **totalmente isolados** (multi-tenant). Nenhuma consulta pode vazar dados entre estabelecimentos.

---

## 3. Entidades principais (sugestão de modelo)

- **Estabelecimento**: nome, `slug` único, fuso horário (**padrão `America/Sao_Paulo`**), horário de funcionamento padrão, regras de agenda (seção 4), status da assinatura.
- **Usuário**: login (e-mail + senha), papel (dono/profissional), estabelecimento.
- **Profissional**: nome, ativo/inativo, vínculo com usuário (opcional até aceitar convite), horários de trabalho por dia da semana (com intervalos, ex. almoço), folgas e bloqueios pontuais.
- **Serviço**: nome, **duração em minutos** (própria de cada serviço), ativo/inativo.
- **Profissional–Serviço**: qual profissional faz qual serviço e o **preço** (pode variar por profissional).
- **Cliente**: nome, WhatsApp (por estabelecimento). Só esses dois dados.
- **Agendamento**: estabelecimento, profissional, serviço, cliente, início, fim, **preço gravado** e **duração gravada** (copiados no momento da marcação), status, confirmação, origem (`link`, `bot`, `manual`), token público para gerir o agendamento.
- **Gasto**: descrição, categoria, valor, data (lançamento manual).
- **Assinatura**: estabelecimento, faixa, status, ids do Asaas, datas (fim do teste, próxima cobrança, fim da tolerância).
- **ConexãoWhatsApp**: estabelecimento, status, provedor, dados da sessão.
- **MensagemLog**: direção, tipo (lembrete, confirmação, cancelamento automático, bot), status de entrega, timestamps.

**Status do agendamento:** `agendado`, `concluido`, `faltou`, `cancelado`.
**Confirmação (campo separado):** `pendente`, `confirmado`, `sem_resposta` (informativo, não é status do agendamento).

---

## 4. Regras da agenda

1. **Disponibilidade** = horário de trabalho do profissional − folgas/bloqueios − agendamentos existentes, usando a **duração do serviço escolhido**.
2. **Nunca permitir dois agendamentos no mesmo horário do mesmo profissional.** Usar transação/lock/constraint no banco; testar concorrência (duas marcações simultâneas no mesmo slot).
3. O horário de trabalho é **por profissional**. No cadastro, o sistema pré-preenche com o horário de funcionamento do salão e o dono ajusta o que for diferente.
4. O cliente só vê os **serviços que aquele profissional faz**.
5. **Antecedência mínima** e **prazo de cancelamento** são configurados pelo dono no painel. **[PADRÃO]** 1 hora de antecedência mínima; cancelamento pelo cliente até 2 horas antes.
6. **Intervalo entre atendimentos:** **[PADRÃO]** 0 (sem intervalo). Se o dono precisar de pausa, ele usa o bloqueio de horário. Intervalo configurável por serviço fica para depois.
7. Cliente que tenta cancelar fora do prazo recebe aviso e é orientado a falar com o salão.
8. Preço e duração são **gravados no agendamento**. Alterar preço depois **não** muda o faturamento de atendimentos antigos.

---

## 5. Fluxo do cliente final

### 5.1 Link público
- Endereço: `dominio.com.br/{slug-do-salao}` (formato **por caminho**, não subdomínio). Reservar slugs de sistema (`admin`, `api`, `login`, etc.).
- Passos: escolher **profissional** → **serviço** (com preço) → **dia e horário** → informar **nome e WhatsApp** → confirmar.
- Mostrar aviso curto de uso dos dados (agendamento e lembretes), com consentimento registrado.
- Ao final, o cliente recebe confirmação imediata pelo WhatsApp com o **link único** para cancelar/remarcar.

### 5.2 Gerenciar agendamento (link único com token)
- Ver detalhes, **cancelar** ou **remarcar**, respeitando o prazo de cancelamento do salão.
- O token deve ser imprevisível e específico daquele agendamento.

### 5.3 Agendamento manual (dono ou profissional)
- No painel, para clientes que ligam, chegam ou chamam em outro canal.
- **Nome e WhatsApp obrigatórios**, com **validação do formato do número**.
- Segue o mesmo fluxo de confirmação, lembrete e cancelamento automático dos demais.

---

## 6. Lembretes, confirmação e cancelamento automático

**Lembrete único por agendamento**, enviado pelo WhatsApp do salão.

- **Quando:** 24 horas antes, **somente entre 8h e 20h** (fuso do salão).
  - **[PADRÃO]** se as 24h antes caírem antes das 8h, enviar às 8h do mesmo dia calendário; se caírem depois das 20h, enviar às 20h.
- **Conteúdo:** dados do agendamento, como confirmar, e **aviso claro** de que sem resposta em 2 horas o horário será liberado. Incluir o link único.
- **Confirmação:** o cliente responde pelo bot (ex. opção numerada) ou toca no link.
- **Sem resposta em 2 horas após a entrega → cancelamento automático.**
  - **Só cancela se a mensagem foi entregue** (confirmação de entrega do provedor). Se não houve entrega, **não cancela** e avisa o dono no painel.
  - Ao cancelar: horário volta a ficar livre, o cliente recebe mensagem com **link para remarcar**, o dono é notificado.
- **Agendamento com menos de 24h de antecedência (ou cujo horário de lembrete já passou):** **[PADRÃO]** recebe apenas a confirmação imediata, **sem lembrete e sem cancelamento automático**.
- O cancelamento automático **ignora** o prazo de cancelamento do salão (ele vale só para cancelamento feito pelo cliente).

---

## 7. Bot do WhatsApp

### 7.1 Conexão
- **Cada salão conecta o próprio número**, escaneando um QR code no painel. Recomendar ao dono **número dedicado ao negócio**.
- Solução **não oficial** (escolhida por custo). Avaliar opções open source mantidas (ex.: Baileys, Evolution API, WPPConnect) e **verificar manutenção atual** antes de escolher.
- **Isolar tudo atrás de uma interface** (ex. `WhatsAppProvider`: conectar, enviar, receber, status, confirmação de entrega) para **trocar pela API oficial da Meta no futuro** sem reescrever o sistema.
- Mitigação de risco de bloqueio: sem disparo em massa, falar principalmente com quem já interagiu, limitar taxa de envio, espaçar mensagens.
- Mostrar no painel o status da conexão e alertar o dono se cair.

### 7.2 Conversa: menu guiado passo a passo (sem IA)
- Cliente manda qualquer mensagem → bot apresenta menu numerado: **1) Agendar**, **2) Meus agendamentos** (ver, remarcar, cancelar).
- Agendar: profissional → serviço (com preço) → dia → horário → (nome, se for cliente novo) → confirmação.
- Mensagem não entendida: reenviar o menu. Sessão expira por inatividade.
- Mesmas regras de disponibilidade, prazo e antecedência do link.

---

## 8. Painel do dono

### 8.1 Cadastro e onboarding
- **Cadastro sozinho** com passo a passo curto: nome do salão e slug → horário de funcionamento → profissionais → serviços (duração) → preços por profissional → conectar WhatsApp (pode ser pulado e feito depois).
- O **teste grátis de 7 dias** começa no cadastro, sem cartão.
- Convidar profissionais por link.

### 8.2 Telas
- Agenda (visão dia/semana, por profissional), com agendamento manual e mudança de status.
- Profissionais (horários, folgas, serviços e preços).
- Serviços.
- Configurações do salão (horário, antecedência, prazo de cancelamento, fuso, slug/link).
- WhatsApp (conectar/status).
- Financeiro (seção 9).
- Assinatura (plano, cobranças, trocar forma de pagamento).
- Notificações.

### 8.3 Notificações ao dono
**[PADRÃO]** Novo agendamento, cancelamento e cancelamento automático: aparecem no painel **e** chegam por e-mail.

---

## 9. Financeiro (estimado)

- **Faturamento estimado** = soma do **preço gravado** dos agendamentos com status `concluido`. Chamar sempre de **"estimado"** na interface (não sabe de desconto, gorjeta, pagamento parcial).
- **Gastos:** lançamento manual com categoria e valor.
- **Saldo estimado** = faturamento estimado − gastos.
- Relatórios: por **dia, semana e mês**, por **profissional** e por **serviço**.
- Só o dono vê financeiro.
- **Sem comissão, sem processamento de pagamento** do cliente final.

---

## 10. Assinatura e cobrança (Asaas)

**Faixas por número de profissionais ativos**

| Faixa | Profissionais | Preço/mês |
|---|---|---|
| 1 | 1 | R$ 29,90 |
| 2 | 2 a 5 | R$ 59,90 |
| 3 | 6 ou mais | R$ 99,90 |

- **Teste grátis de 7 dias, sem cartão.** Depois, assinatura.
- Formas de pagamento: **Pix, cartão e boleto**, via **Asaas** (recorrência mensal). Usar o sandbox existente em desenvolvimento.
- **Webhooks do Asaas** para pagamento confirmado, vencido, etc. Devem ser **idempotentes** e validados.
- **Mudança de faixa:** ao cadastrar um profissional que faz passar de faixa, o sistema **avisa e pede confirmação do dono**; o **novo valor vale a partir da próxima cobrança**. Ao remover profissionais, a faixa pode baixar na próxima cobrança.
- **Inadimplência:**
  1. Venceu → **5 dias de tolerância** com avisos (painel e e-mail).
  2. Passou a tolerância → **bloquear novos agendamentos** (link e bot). Agendamentos já existentes e **todos os dados permanecem guardados**.
  3. Pagou → liberação automática.
  - **[PADRÃO]** Com a assinatura bloqueada, o painel abre em **modo restrito** (consulta e tela de assinatura/pagamento), para o dono conseguir regularizar.

---

## 11. Requisitos transversais

### 11.1 LGPD e documentos legais
- Coletar **apenas nome e WhatsApp** do cliente final.
- Registrar consentimento no agendamento, com texto curto sobre uso para agendamento e lembretes.
- O **dono do salão é o controlador** dos dados dos clientes dele; o Hora H atua como operador. Deixar isso claro nos termos.
- Prever rotina para **exclusão/anonimização** de dados por solicitação.
- **Termos de uso e política de privacidade** serão redigidos em rascunho personalizado (fora do código) e **revisados por profissional** antes do primeiro cliente real. Os termos devem avisar que o serviço depende do WhatsApp e **não há garantia contra bloqueio do número**.

### 11.2 Infraestrutura e segurança
- Deploy na VPS própria.
- **Backup diário automático do banco, guardado fora da VPS** (armazenamento externo como Backblaze B2, Cloudflare R2 ou S3), com retenção de 7 a 30 cópias. **Testar a restauração** antes de ter clientes reais e documentar o procedimento.
- Senhas com hash forte, HTTPS, limites de tentativa de login, proteção contra enumeração de slugs/tokens.
- Logs de mensagens e de eventos de cobrança.

---

## 12. Ordem de construção (fases)

**Fase 1 — Fundação**
Multi-tenant e isolamento de dados, autenticação, papéis e permissões, cadastro do dono com passo a passo, entidades base (estabelecimento, profissional, serviço, vínculo com preço).

**Fase 2 — Agenda e link público**
Cálculo de disponibilidade, página pública `/{slug}`, agendamento com proteção contra conflito, agendamento manual, status, cancelar e remarcar por link com token, painel de agenda. Fuso horário.

**Fase 3 — Assinatura (Asaas)**
Teste de 7 dias, faixas, cobrança recorrente, webhooks, tolerância, bloqueio e modo restrito, mudança de faixa com confirmação, notificações por e-mail.

> **Marco de validação:** colocar **2 ou 3 salões piloto** para usar fases 1 a 3 antes de investir no bot. Só seguir se usarem de verdade.

**Fase 4 — WhatsApp**
Camada `WhatsAppProvider`, conexão por QR, menu guiado, confirmação imediata, **lembrete + confirmação + cancelamento automático**, monitoramento de conexão.

**Fase 5 — Financeiro**
Gastos, faturamento estimado, saldo estimado, relatórios por período/profissional/serviço.

**Fase 6 — Fechamento para lançamento**
LGPD (consentimento, exclusão), documentos legais, backup externo e teste de restauração, revisão de segurança, testes ponta a ponta.

---

## 13. Fora do escopo da v1

Pagamento do cliente final (Pix, cartão, sinal), comissões, estoque, marketplace ou descoberta de salões, app nativo, conversa livre com IA no bot, domínio próprio por salão, programa de fidelidade, intervalo configurável por serviço, múltiplas unidades por conta, relatórios avançados.

---

## 14. Critérios de aceite essenciais

- Duas marcações simultâneas no mesmo horário: **só uma passa**.
- Horários exibidos corretos para salões em fusos diferentes.
- Preço alterado depois **não altera** faturamento de atendimentos já gravados.
- Profissional **não acessa** financeiro nem agenda de outro.
- Um salão **nunca** vê dados de outro.
- Lembrete respeita a janela das 8h às 20h; sem entrega, **não há cancelamento automático**.
- Agendamento com menos de 24h não gera lembrete nem cancelamento automático.
- Webhook do Asaas repetido **não duplica** efeitos.
- Tolerância de 5 dias, bloqueio e liberação após pagamento funcionam de ponta a ponta.
- Restauração de backup testada e documentada.

---

## 15. Pendências e riscos

**Para decidir antes ou durante a construção**
1. **Janela de 2 horas à noite:** um lembrete enviado às 20h vence às 22h. Considerar pausar a contagem entre 22h e 8h.
2. **Painel em modo restrito** quando bloqueado: confirmar o comportamento padrão da seção 10.
3. **Intervalo entre atendimentos:** confirmar o padrão 0.
4. **Valores padrão** de antecedência (1h) e cancelamento (2h): confirmar.
5. **Taxas atuais do Asaas** (Pix, cartão, boleto): conferir se o preço de entrada de R$ 29,90 cobre custos de infraestrutura e taxas.
6. **Nome definitivo, domínio e marca.**
7. **Escolha da biblioteca/serviço de WhatsApp não oficial.**

**Riscos conhecidos**
- Bloqueio de número pelo WhatsApp (mitigado por número dedicado, baixa taxa de envio e interface trocável).
- Margem pequena na faixa de entrada, exigindo volume de clientes.
- Concorrentes com plano grátis (ex.: GENDA, que também inclui lembrete no WhatsApp). O diferencial do Hora H precisa ficar claro: foco em beleza geral, bot de agendamento completo e balanço financeiro estimado.

---

## 16. Telas para prototipar (Claude Design)

Prioridade: **(1) página pública de agendamento** (mobile) e **(2) agenda do painel**. Depois: onboarding do dono, cadastro de profissionais/serviços, tela de gerenciar agendamento (link único), financeiro, assinatura, conexão do WhatsApp.
