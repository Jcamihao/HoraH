# Hora H

Agendamento online para salões, barbearias e estúdios de beleza. Especificação completa em [ESPECIFICACAO.md](ESPECIFICACAO.md).

**Estado:** Fases 1 a 4 prontas. O contrato com o Asaas (sandbox) e com o WA-AKG (sessão, QR, pareamento, webhook) foi conferido contra instâncias reais; **envio de mensagem e confirmação de entrega do WhatsApp só foram testados contra um WA-AKG de mentira** (falta um celular para ler o QR): ver "WhatsApp" abaixo.
- Fase 1 (fundação): multi-tenant, login e papéis, cadastro do dono com passo a passo, profissionais, serviços, preços por profissional, convite por link.
- Fase 2 (agenda e link público): disponibilidade com fuso horário, página pública `/{slug}`, marcação sem conflito (garantida no banco), agendamento manual, situação do atendimento, folgas e bloqueios, cancelar e remarcar pelo link único `/agendamento/{token}`, agenda do painel (dia e semana).
- Fase 3 (assinatura): teste de 7 dias, faixas por número de profissionais, cobrança mensal pelo Asaas (Pix, cartão ou boleto), webhooks, tolerância de 5 dias, bloqueio e modo restrito, mudança de faixa com confirmação, e-mails (cobrança e avisos ao dono de novo agendamento e cancelamento).
- Fase 4 (WhatsApp): conexão do número do salão por QR (ou código de pareamento), confirmação imediata, lembrete 24 h antes (8h às 20h), confirmação de presença, cancelamento automático por falta de resposta (só se o lembrete foi ENTREGUE, com pausa de 22h às 8h), bot de agendamento em menu guiado e notificações no painel.
- Próxima: Fase 5 (financeiro) e Fase 6 (fechamento para lançamento: LGPD, backup, revisão de segurança).

## Estrutura

| Pasta | O que é |
|---|---|
| `apps/api` | NestJS 11 + Prisma 6 + PostgreSQL |
| `apps/web` | Angular 20 (Signals, sem Zone.js). Design em `apps/web/DESIGN.md`, tokens em `apps/web/src/styles/_tokens.scss` |
| `packages/shared` | Contratos usados pelos dois (papéis, slug, horários, tipos de resposta) |

## Rodar em desenvolvimento

Precisa de Node 20.19+ e npm. Sem Docker: o banco roda embutido.

```bash
npm run dev:all     # tudo de uma vez: banco, API e site; Ctrl+C para parar
```

Na primeira vez o `dev:all` também faz o que falta: `npm install`, cria `apps/api/.env` com um `JWT_SECRET` aleatório e compila o pacote `shared`. Depois abra http://localhost:4200. Se uma das portas (5440, 3000, 4200) já estiver em uso, ele avisa e não sobe nada.

Para subir cada parte em seu terminal (útil para ver o log separado):

```bash
npm run dev:db      # terminal 1: PostgreSQL de desenvolvimento (porta 5440) + migrations
npm run dev:api     # terminal 2: API em http://localhost:3000/api
npm run dev:web     # terminal 3: app em http://localhost:4200 (proxy de /api para a API)
```

## Roteiro de testes

[docs/roteiro-de-testes.md](docs/roteiro-de-testes.md): passo a passo para testar o app inteiro, incluindo como instalar e configurar o WA-AKG e testar o WhatsApp no app.

## Testes

```bash
npm test                                   # API: unitários + e2e contra um PostgreSQL embutido (374 testes)
CHROME_BIN=/caminho/do/chrome npm run test:web   # Angular: 36 testes em Chrome headless
npm run build                              # compila shared, api e web
ASAAS_API_KEY='$aact_...' npm run asaas:sandbox   # confere o contrato com o Asaas de verdade (só sandbox)
```

Os testes da API aplicam as migrations reais e conferem: isolamento entre salões (inclusive no banco, por chave estrangeira composta), papéis, sessão com rotação de refresh token, convites, limites de tentativa, constraints, disponibilidade em vários fusos (inclusive horário de verão), corrida de 10 marcações no mesmo horário (só uma passa) e o fluxo completo do link do cliente.

## Decisões que valem lembrar

- **Isolamento por tenant:** o `PrismaService.db` filtra tudo por `estabelecimentoId` e falha se não houver tenant no contexto. `semTenant` e SQL cru só existem nos arquivos listados em `apps/api/src/semtenant-allowlist.spec.ts`.
- **Sessão:** access token (15 min) só na memória do navegador; refresh token opaco, rotativo, em cookie `httpOnly`. Reuso tardio de um refresh token antigo derruba a sessão inteira.
- **Dono também atende:** ao cadastrar um profissional, o dono pode marcar "Eu também atendo" e ganha agenda própria.
- **Identidade visual provisória:** neutra de propósito até a marca existir; trocar é editar `_tokens.scss`.

## Agenda e página pública (Fase 2)

- **Conflito de horário:** o banco recusa dois agendamentos não cancelados que se sobrepõem para o mesmo profissional (`EXCLUDE USING gist`, intervalo `[início, fim)`: quem termina às 10:00 não conflita com quem começa às 10:00). A aplicação confere antes para dar mensagem boa, mas quem decide é o banco. Teste de mutação: sem a constraint, 5 de 10 marcações simultâneas passavam.
- **Horários:** grade fixa de 30 min; o atendimento inteiro precisa caber numa faixa de trabalho. Tudo é guardado em UTC; dia e hora vêm do fuso do salão (`apps/api/src/agenda/tempo.ts`).
- **Página pública:** `/{slug}` (escolher profissional, serviço, dia, horário, nome e WhatsApp, aceite do uso dos dados). Até 60 dias à frente, antecedência mínima do salão, no máximo 3 horários futuros por WhatsApp e salão. O WhatsApp **não é verificado** nesta fase.
- **Link do cliente:** `/agendamento/{token}` (192 bits, guardado em claro porque o painel reenvia o link e a Fase 4 o põe nos lembretes). Cancelar e remarcar respeitam o prazo de cancelamento do salão; remarcar muda só dia e hora, no mesmo registro. O painel cancela fora do prazo.
- **Painel:** o dono vê todos os profissionais; o profissional vê e altera só a própria agenda e os próprios bloqueios (agendamento de outro é 404). Concluído e faltou só valem depois que o horário começa.
- **Preço e duração** são copiados para o agendamento: mudar o serviço depois não reescreve o passado.
- **Design da página pública:** identidade própria (`apps/web/src/styles/_publico.scss`), separada do painel: o nome do salão é o maior elemento e a cor vem em campos inteiros.

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
- **Subir o WA-AKG com o mesmo PostgreSQL:** o repositório vem configurado para MySQL; troque `provider = "mysql"` por `"postgresql"` em `prisma/schema.prisma` (só usa `@db.Text`, que funciona nos dois), use `DATABASE_URL=...?schema=wa_akg` (tabelas separadas das do Hora H), `npx prisma db push`, crie um usuário **que não seja SUPERADMIN** (`node scripts/setup-admin.js` cria SUPERADMIN: rebaixe para USER, porque webhooks de SUPERADMIN recebem eventos de todas as sessões) e gere a API key dele. Variáveis do Hora H: `WAAKG_URL`, `WAAKG_API_KEY`, `WAAKG_WEBHOOK_SECRET`, `WAAKG_WEBHOOK_URL` (ver `apps/api/.env.example`).
- **O WA-AKG só chama webhook HTTPS público** (recusa `http` e IP privado/localhost): `WAAKG_WEBHOOK_URL` é o endereço público da API + `/api/webhooks/whatsapp`. Cada webhook vem assinado (`X-Webhook-Signature: sha256=HMAC` do corpo cru); a API usa `rawBody` para conferir. **O WA-AKG não reenvia webhook que falhou**: o que se perder cai no caminho seguro (sem confirmação de entrega, nada é cancelado e o dono é avisado).
- **Lembrete e cancelamento automático (spec 6):** o lembrete sai 24 h antes, só entre 8h e 20h do fuso do salão (antes das 8h sai às 8h; depois das 20h, às 20h). Agendamento com menos de 24 h, ou cujo horário de lembrete já passou, recebe só a confirmação imediata. O prazo de 2 h para o cliente responder **só começa quando o WhatsApp confirma a ENTREGA** e **não conta das 22h às 8h** (entregue às 21h vence às 9h). Sem resposta: cancela (ignorando o prazo de cancelamento do salão), avisa o cliente com link para remarcar e avisa o dono. Lembrete sem entrega depois de 2 h: o dono é avisado no painel e por e-mail e nada é cancelado.
- **Confirmar:** o cliente responde `1` (confirmar) ou `2` (cancelar) ao lembrete, ou toca em "Confirmo que vou" no link.
- **Bot (spec 7.2):** `1) Agendar`, `2) Meus agendamentos`; escolher profissional, serviço, dia, horário, nome (só se for cliente novo) e confirmar; ver, remarcar e cancelar. Usa a mesma agenda do link (disponibilidade, antecedência, prazo, teto de 3 horários por WhatsApp, assinatura bloqueada). Conversa expira em 30 min de silêncio. Só entende texto; ignora grupos.
- **Anti-bloqueio:** envios do mesmo salão saem espaçados (`WHATSAPP_ESPACAMENTO_MS`, 6 s ± 40% por padrão), uma mensagem de cada vez; só falamos com quem já tem horário ou puxou conversa; o painel recomenda número exclusivo do negócio. Mensagem que não sai em 6 h expira.
- **Fila e jobs:** a fila é a tabela `mensagens_log` (que também é o log da spec); um job a cada `WHATSAPP_JOB_INTERVALO_S` (15 s) manda o que está pronto, põe os lembretes devidos na fila e cancela quem não respondeu. Cada mensagem é "alugada" antes de enviar, então despachos simultâneos nunca duplicam.
- **Limites:** o WA-AKG devolve 500 (não 503) ao enviar sem sessão conectada, tratado como falha repetível; o bot só atende números brasileiros de celular; números `@lid` (sem telefone) são ignorados.
