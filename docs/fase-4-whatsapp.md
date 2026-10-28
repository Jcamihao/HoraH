# Fase 4: WhatsApp com o WA-AKG

Escolha do dono do produto (2026-10-23): usar o **WA-AKG** (`github.com/mrifqidaffaaditya/WA-AKG`) como gateway de WhatsApp.

## O que é
Serviço separado (Next.js + Prisma + **Baileys**, MIT) que expõe o WhatsApp como API REST com painel, várias sessões (um QR por número) e webhooks. Roda ao lado da API do Hora H (PM2 ou Docker Compose, Node 20+, MySQL ou PostgreSQL próprio). Atividade conferida em 2026-10-23: último push em 19/10/2026, 13 issues abertas, não arquivado.

## O que a spec exige e o que o WA-AKG entrega (conferido numa instância real: sessão, QR, pareamento, webhook, bot-config; envio e entrega só no fake)
| Precisamos | WA-AKG |
|---|---|
| Conectar o número do salão por QR | `POST /api/sessions` cria a sessão; `GET /api/sessions/{id}/qr` devolve o QR (texto e imagem base64); evento `qr.update` |
| Enviar mensagem | `POST /api/messages/{sessionId}/{jid}/send`, cabeçalho `X-API-Key`; resposta traz `data.key.id` (id da mensagem) |
| **Confirmação de entrega** (só cancela automático se foi entregue) | webhook `message.status` com `data.keyId` e `status`: `PENDING → SENT → DELIVERED → READ`. Casar `keyId` com o `key.id` do envio |
| Receber a resposta do cliente (bot) | webhook `message.received` (`from`, `type`, `content`) |
| Status da conexão / queda | webhook `connection.update` |
| Autenticar webhook | cabeçalho `X-Webhook-Signature: sha256=<hmac>` (HMAC-SHA256 do corpo cru com o `secret` do webhook) |

Não há limite de taxa documentado na API: o limite de envio e o espaçamento são nossos (spec 7.1).

## Como encaixa
Atrás da interface `WhatsAppProvider` (conectar, enviar, receber, status, entrega), com o WA-AKG como única implementação. Trocar pela API oficial da Meta depois não mexe no resto.

## Decisões (2026-10-23, dono do produto)
1. **Janela de 2 h à noite:** a contagem das 2 horas **pausa entre 22h e 8h** (entregue às 21h, vence às 9h).
2. **Um WA-AKG só, no mesmo servidor e no mesmo PostgreSQL do Hora H** (tabelas dele separadas das nossas), **uma sessão por salão**: cada salão escaneia o próprio QR.
3. Nome da sessão = id do estabelecimento; chave de API do WA-AKG só no servidor do Hora H.

## Riscos
- Baileys é não oficial: risco de bloqueio do número (spec 7.1 e 15). Mitigar com número dedicado, envio espaçado e sem disparo em massa.
- O WA-AKG é mantido por uma pessoa; fixar a versão e ler o changelog antes de atualizar.
- Webhook de entrega pode chegar fora de ordem ou repetido: tratar como a Fase 3 (id único, nunca regredir estado).

## Achados rodando o WA-AKG de verdade (2026-10-28)
- Funciona com PostgreSQL trocando `provider` no schema (só usa `@db.Text`); `?schema=wa_akg` separa as tabelas.
- `POST /api/sessions` cria a sessão **parada** (`STOPPED`); é preciso `POST /api/sessions/{id}/start`. Depois de `start` ela leva alguns segundos para aparecer como `SCAN_QR`: o Hora H não trata "parada" como desconectada nesse começo (folga de 60 s).
- O QR vem como texto (`https://wa.me/settings/linked_devices#2@...`); o Hora H o desenha como PNG no servidor.
- Pareamento por código (`POST /sessions/{id}/pair {phoneNumber}`) devolve 8 caracteres: serve quando o celular do salão é o que vai conectar.
- Webhook: só HTTPS e fora de IP privado (checagem anti-SSRF), sem nova tentativa em caso de falha. O bot embutido vem **ligado** em toda sessão (`bot-config`): o Hora H o desliga.
- Webhooks de usuário SUPERADMIN recebem eventos de TODAS as sessões: usar usuário comum.
- Depois de `logout` o WA-AKG gera QR sozinho; o Hora H chama `stop` em seguida.
- Enviar sem sessão conectada devolve 500 ("Cannot read properties of undefined"), não 503.
- Não há rota para consultar o status de uma mensagem: a entrega só chega por webhook (`message.status`, `keyId` = `data.key.id` do envio).
