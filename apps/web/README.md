# Hora H, site (Angular)

Painel do salão, página pública de agendamento e telas de entrada. Angular 20 com Signals, componentes standalone e sem Zone.js. Faz parte do monorepo; o passo a passo completo de instalação está no [README da raiz](../../README.md#guia-completo-do-zero-até-o-app-rodando-com-whatsapp).

## Comandos

Na raiz do repositório:

```bash
npm run dev:web      # http://localhost:4200 (proxy de /api para http://localhost:3000)
npm run build -w @hora-h/web
CHROME_BIN=/caminho/do/chrome npm run test:web   # 54 testes unitários, Chrome headless
```

Ou, dentro de `apps/web`: `npx ng serve`, `npx ng build`, `npx ng test --watch=false --browsers=ChromeHeadlessCI`.

App para celular (PWA e Capacitor): `npm run mobile:sync`, `mobile:android` e `mobile:ios` na raiz, com `HORAH_URL` definido. Detalhes no [Passo 10 do README](../../README.md#passo-10-app-no-celular-pwa-e-capacitor).

O pacote `@hora-h/shared` precisa estar compilado antes (`npm run build -w @hora-h/shared`); o `npm run dev` da raiz já faz isso.

## Estrutura

```
src/
  styles/            tokens (claro e escuro) e estilos globais: _tokens, _base, _layout, _controls, _lists, _agenda, _publico
  app/
    core/            API, sessão, tema, guards, datas, regras da agenda
    shared/          componentes usados em várias telas (navbar, ícones, horário, campos de dia e hora, botão de tema)
    features/        uma pasta por área: auth, onboarding, inicio, agenda, profissionais, servicos,
                     configuracoes, assinatura, whatsapp, notificacoes, publico, shell
```

- **Rotas** em `src/app/app.routes.ts`: `/entrar`, `/cadastrar`, `/convite/:token`, `/painel/...` (dono e profissional), `/agendamento/:token` e `/:slug` (página pública).
- **Sessão:** o access token fica só na memória; o refresh token é um cookie `httpOnly`. O interceptor renova sozinho.
- **Tema:** `TemaStore` grava `data-tema="claro|escuro"` no `<html>` e a escolha em `localStorage` (`hh_tema`). Um script no `index.html` aplica o tema antes do Angular subir.

## Design

Regras e valores em [DESIGN.md](DESIGN.md); contexto de produto em [PRODUCT.md](PRODUCT.md). Para mudar cores, fontes ou raios, edite `src/styles/_tokens.scss`.
