# Histórico de mudanças

Formato livre, mais novo primeiro. As versões seguem o `package.json` da raiz e de `apps/web`.

## 0.9.0 (2026-11-04)

Só o site (`apps/web`).

- **PWA:** service worker (`@angular/service-worker`, só em produção) que guarda o casco do site para abrir rápido e funcionar sem internet até a tela do app; a API nunca entra no cache. Meta tags para o "Adicionar à Tela de Início" do iPhone; o manifest e os ícones já existiam (0.8.4).
- **App nativo com Capacitor 8** (Android e iOS): projetos gerados em `apps/web/android` e `apps/web/ios`, configuração em `apps/web/capacitor.config.ts`, scripts `npm run mobile:sync`, `mobile:android`, `mobile:ios` e `mobile:assets`. O app carrega o site publicado (`HORAH_URL`), porque o login usa cookie `httpOnly` na mesma origem da API. `NativoService` ajusta a barra de status ao tema, trata o botão "voltar" do Android e esconde o splash. Ícones e splash (claro e escuro) gerados do logo (`apps/web/assets/`).
- Dependências: `@capacitor/core`, `app`, `status-bar`, `splash-screen`, `keyboard` (e `cli`, `android`, `ios`, `assets` em desenvolvimento). `@angular/service-worker` fixado em 20.3.34 para casar com o `@angular/core` do projeto.
- **README:** novo "Passo 10. App no celular: PWA e Capacitor", com o passo a passo, o teste em casa pela rede local, o aviso sobre o identificador do app e o que não foi verificado.

## 0.8.4 (2026-11-04)

Só o site (`apps/web`).

- **Favicon e ícones do app** a partir do logo: `favicon.svg` (símbolo redondo), `favicon.ico` (16, 32 e 48 px), `favicon-32.png`, `apple-touch-icon.png` (180 px, para "Adicionar à tela de início" no iPhone), `icon-192.png`, `icon-512.png` e `icon-maskable-512.png` (para o Android recortar o ícone). Novo `manifest.webmanifest` (nome, cor do tema, ícones e `start_url` em `/painel`) e os links no `index.html`.

## 0.8.3 (2026-11-04)

Só o site (`apps/web`).

- **Logo nas telas** (arquivos do pacote "Hora H - Telas 3"): a marca em texto ("Hora" + "H" em Caveat) foi trocada pelo logo (palavra "HORA" geométrica + símbolo laranja) em todos os lugares onde aparecia: barra lateral do painel, painel preto das telas de entrada, topo das telas de entrada no celular, barra do topo no celular e lista de passos do cadastro. Novo componente `hh-logo` (texto em `currentColor`, símbolo colorido), então o logo acompanha o tema claro e o escuro sozinho.
- **Favicon** passa a ser o símbolo redondo do logo; os seis arquivos do logo ficam em `public/logo/`.

## 0.8.2 (2026-11-04)

Só o site (`apps/web`).

- **Barra lateral "sticky" no desktop:** a barra lateral do painel e a lista de passos do cadastro agora são uma coluna do layout (`position: sticky`, altura da tela) e acompanham a rolagem.
- **Troca de tela sem a barra deslizar:** a animação de troca de tela movia o "instantâneo" da página inteira, inclusive a barra lateral, as abas do celular e o botão de tema. Esses elementos ganharam nome próprio na transição (`view-transition-name`) e ficam parados.

## 0.8.1 (2026-11-04)

Só o site (`apps/web`).

- **Desktop em largura total:** o conteúdo parava em 720px (ou 1120px) e deixava cerca de um terço da tela vazio em monitor largo. Agora a página usa a largura disponível (até 1680px) e as telas de formulário viram colunas, como no design: Ajustes, Novo agendamento (3), Bloquear horário (3), Equipe, Serviços, Assinatura, Profissional, Detalhe do agendamento, Meu perfil, Notificações (2) e WhatsApp (2). O cadastro do salão continua estreito. No celular nada muda.
- **Editor de horário** decide o layout pela largura do próprio editor (container query), então cabe numa coluna estreita sem cortar os campos.
- **Campo de dia** ocupa a largura certa ao lado do campo de hora.
- **Profissional:** um serviço desativado no salão não entra mais no que se salva em "Serviços e preços". Antes o servidor recusava com "Algum serviço não existe ou está inativo" e a pessoa não via o serviço na lista para corrigir.

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
