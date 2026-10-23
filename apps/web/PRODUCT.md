# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Dono de pequeno negócio de beleza** (salão, unhas, sobrancelha, barbearia), que se cadastra sozinho e configura tudo: horário, profissionais, serviços, preços, regras da agenda, financeiro, assinatura. Usa o painel principalmente **no celular**, entre um atendimento e outro (confirmado pelo usuário em 2026-10-21). Não é técnico.
- **Profissional** (cabeleireira, manicure, barbeiro) convidado pelo dono por link. Vê só a própria agenda e marca atendimentos como concluído/faltou/cancelado. Sem acesso a financeiro, assinatura ou agenda de outros.
- **Cliente final** (sem login) usa a página pública `/{slug}` e o bot de WhatsApp; fora do escopo deste painel.

## Product Purpose

Hora H é um sistema de agendamento online para pequenos negócios de beleza, vendido por assinatura mensal (teste grátis de 7 dias sem cartão). O dono ganha uma agenda que nunca marca dois clientes no mesmo horário do mesmo profissional, lembretes e confirmação por WhatsApp, e um balanço financeiro estimado. Sucesso: marcar pelo Hora H é mais fácil do que marcar pelo WhatsApp manualmente, e o dono termina o cadastro inicial sozinho, sem ajuda.

## Positioning

Foco em beleza em geral (não só barbearia), bot de agendamento completo no WhatsApp convivendo com o link público, e balanço financeiro "estimado" no mesmo produto. Concorrentes têm plano grátis (ex.: GENDA); o diferencial precisa ficar claro na experiência, não em preço.

## Operating Context

- Passo a passo de cadastro: salão e endereço (slug) → horário de funcionamento → profissionais → serviços (com duração) → preço por profissional → conectar WhatsApp (pode ser pulado e feito depois).
- Horário de trabalho do profissional vem pré-preenchido com o horário do salão; o dono ajusta o que for diferente.
- Todo horário é guardado em UTC e exibido no fuso do estabelecimento (padrão America/Sao_Paulo).
- Profissionais entram por link de convite, definindo a própria senha.

## Capabilities and Constraints

- Fase 1 (esta entrega): login, cadastro do dono, aceitar convite, passo a passo inicial, cadastro de profissionais, serviços, preços por profissional, horários e configurações do salão. Agenda, página pública, assinatura, WhatsApp e financeiro vêm em fases seguintes.
- Terminologia neutra obrigatória: "profissional" e "serviço", nunca "barbeiro" ou "corte" fixos.
- Valores financeiros sempre rotulados "estimado". O sistema não processa pagamento do cliente final.
- Preços em centavos no back-end; exibição em reais (pt-BR).
- Stack já decidida: Angular 20 (Signals, zoneless), NestJS, PostgreSQL.
- Em aberto: nome definitivo, domínio e marca (Registro.br e INPI ainda não conferidos).

## Brand Commitments

Nome provisório "Hora H". Não há logo, paleta nem tipografia definidos. Idioma da interface: português do Brasil.

## Evidence on Hand

Especificação completa em `../../ESPECIFICACAO.md` (raiz do projeto). Não há clientes, depoimentos, métricas nem material visual reais; nada disso deve ser inventado na interface.

## Product Principles

1. Mais fácil que o WhatsApp manual: cada tela tem uma tarefa e termina rápido, no polegar.
2. Linguagem do dia a dia do salão, neutra quanto ao tipo de negócio; nada de jargão de sistema.
3. Honestidade sobre o que o sistema sabe: "estimado", avisos claros de prazo e consequência antes de ações irreversíveis.
4. O dono configura sozinho: o passo a passo nunca deixa o salão num estado quebrado e sempre diz o que falta.
5. Cada papel vê só o que é seu; o que não pode acessar nem aparece.

## Accessibility & Inclusion

Público não técnico e frequentemente em movimento: alvos de toque confortáveis, texto legível em tela pequena sob luz forte de salão, contraste AA, formulários com rótulos visíveis e mensagens de erro em português claro. Nenhum requisito formal além disso foi estabelecido.
