# Histórico de mudanças

Formato livre, mais novo primeiro. As versões seguem o `package.json` da raiz e de `apps/web`.

## 0.8.0 (2026-11-04)

Só o site (`apps/web`) mudou; `apps/api` e `packages/shared` continuam na 0.4.0.

**Interface nova (telas do Claude Design)**
- Poppins e Caveat (só o "H" da marca), laranja, verde e preto sobre fundo claro, cartões brancos e botões em pílula. Títulos em maiúsculas. O Figtree saiu das dependências.
- Barra lateral escura no desktop e barra de abas flutuante no celular.
- Telas refeitas: Agenda (Dia, Semana e Mês), Início, Entrar, Criar conta e Convite (com painel preto no desktop), Cadastro do salão (barra lateral com os 6 passos), WhatsApp (QR em cartão escuro e "O que o cliente recebe"), Assinatura (faixas de preço), Notificações, página pública e "Seu horário". As demais telas do painel foram reestilizadas.
- O editor de horário mostra o dia à esquerda e as faixas à direita no desktop.

**Modo escuro**
- Botão sol/lua no canto superior direito de todas as telas. A escolha fica no aparelho; sem escolha vale o tema do sistema; o tema é aplicado antes do app carregar (sem piscar).

**Campos de dia e hora**
- `hh-campo-data` e `hh-campo-hora`: texto na fonte do app, em 24 h e em português ("Qua, 4 nov"), com o seletor nativo transparente por cima.

**Correções**
- Bloquear horário mostra "O fim precisa ser depois do início." em vez de só travar o botão.
- Página pública: quando outra pessoa toma o horário (409), aparece "Esse horário não está mais disponível. Escolha outro." na escolha de dia e horário.
- Estados de erro e vazio: sem "Nada por aqui" junto do aviso de erro; o Início não fica preso em "Carregando…"; estados vazios viram cartão.
- WhatsApp conectado no desktop sem coluna vazia; rótulos de seção com a largura do cartão.

**Documentação**
- README com o guia completo de instalação e configuração (app, Asaas, WA-AKG, produção), DESIGN.md e README do site reescritos, CHANGELOG criado, roteiro de testes atualizado.

**Verificação:** 51 testes do site, 125 unitários e 249 e2e da API passam; fluxos principais percorridos num navegador contra a API e o banco reais. WhatsApp e cobrança foram exercitados só com imitações locais: o WA-AKG e o Asaas reais ainda precisam de teste de ponta a ponta.

## 0.7.1 e anteriores

Fases 1 a 4 (fundação, agenda e página pública, assinatura com Asaas, WhatsApp com WA-AKG) e a agenda em três visões. Detalhes no histórico do git e em [README.md](README.md).
