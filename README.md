# Hora H

Agendamento online para salões, barbearias e estúdios de beleza. Especificação completa em [ESPECIFICACAO.md](ESPECIFICACAO.md).

**Estado:** Fases 1 e 2 prontas.
- Fase 1 (fundação): multi-tenant, login e papéis, cadastro do dono com passo a passo, profissionais, serviços, preços por profissional, convite por link.
- Fase 2 (agenda e link público): disponibilidade com fuso horário, página pública `/{slug}`, marcação sem conflito (garantida no banco), agendamento manual, situação do atendimento, folgas e bloqueios, cancelar e remarcar pelo link único `/agendamento/{token}`, agenda do painel (dia e semana).
- Próxima: Fase 3 (assinatura pelo Asaas). Avisos por WhatsApp e e-mail só nas Fases 3 e 4: até lá o link do cliente aparece na tela de confirmação e o painel copia o link de cada agendamento.

## Estrutura

| Pasta | O que é |
|---|---|
| `apps/api` | NestJS 11 + Prisma 6 + PostgreSQL |
| `apps/web` | Angular 20 (Signals, sem Zone.js). Design em `apps/web/DESIGN.md`, tokens em `apps/web/src/styles/_tokens.scss` |
| `packages/shared` | Contratos usados pelos dois (papéis, slug, horários, tipos de resposta) |

## Rodar em desenvolvimento

Precisa de Node 20.19+ e npm. Sem Docker: o banco roda embutido.

```bash
npm install
cp apps/api/.env.example apps/api/.env      # ajuste JWT_SECRET (32+ caracteres)
npm run build -w @hora-h/shared             # a api e o web importam este pacote
npm run dev:db      # terminal 1: PostgreSQL de desenvolvimento (porta 5440) + migrations
npm run dev:api     # terminal 2: API em http://localhost:3000/api
npm run dev:web     # terminal 3: app em http://localhost:4200 (proxy de /api para a API)
```

## Testes

```bash
npm test                                   # API: unitários + e2e contra um PostgreSQL embutido (199 testes)
CHROME_BIN=/caminho/do/chrome npm run test:web   # Angular: 31 testes em Chrome headless
npm run build                              # compila shared, api e web
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
