---
name: Hora H, painel e página pública
description: Identidade do Hora H (telas do Claude Design, v0.8.0): Poppins, "H" da marca em Caveat, laranja, verde e preto sobre fundo claro, cartões brancos, botões em pílula, barra lateral escura no desktop e modo escuro.
colors:
  orange-500: "#e84a27"
  orange-bright: "#f97316"
  orange-ink: "#c53a1a"
  orange-100: "#fdeee6"
  green-500: "#65a30d"
  green-ink: "#3f6212"
  green-100: "#ecfccb"
  ink-900: "#111111"
  text-secondary: "#57534e"
  bg: "#fafafa"
  surface: "#ffffff"
  divider: "#eeece8"
  dark-bg: "#0a0908"
  dark-surface: "#181614"
  dark-panel: "#24201d"
  dark-border: "#33302d"
typography:
  display:
    fontFamily: "'Poppins', system-ui, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 800
    textTransform: uppercase
  title:
    fontFamily: "'Poppins', system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 800
    textTransform: uppercase
  body:
    fontFamily: "'Poppins', system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
  kicker:
    fontFamily: "'Poppins', system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    letterSpacing: "0.1em"
    textTransform: uppercase
  brand-h:
    fontFamily: "'Caveat', cursive"
    fontWeight: 700
rounded:
  sm: "12px"
  md: "16px"
  lg: "22px"
  xl: "28px"
  pill: "999px"
components:
  button-filled:
    backgroundColor: "{colors.orange-500}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    height: "48px"
  button-outline:
    borderColor: "{colors.ink-900}"
    rounded: "{rounded.pill}"
    height: "48px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
---

# Design System: Hora H

Os valores vivem em `src/styles/_tokens.scss` e os estilos em `src/styles/` (`_base`, `_layout`, `_controls`, `_lists`, `_agenda`, `_publico`). Este arquivo explica as regras; para mudar a aparência, edite os tokens.

## Marca

O nome aparece como "Hora" em Poppins 800 seguido de um "H" em Caveat 700 laranja (classe `.brand`). Não há logo de imagem.

## Cor

- **Laranja `#e84a27`** é tudo o que se toca, está selecionado ou ocupado (botão principal, aba ativa, hoje). `#f97316` só na faixa de teste grátis e em destaques de título; `#c53a1a` é o laranja legível como texto.
- **Verde `#65a30d`** é "ligado" e "confirmado" (interruptor, etiqueta Confirmado, botão Confirmo que vou).
- **Preto `#111`** nas faixas fortes: barra lateral, cartão "Hoje", bloqueios, faixa do salão na página pública. Fundo `#fafafa` e cartões brancos.
- Etiquetas de estado: cinza (padrão), verde (ok), laranja claro (atenção) e preto (concluído).

## Tipografia

Poppins para tudo (arquivos locais via `@fontsource`, pesos 400 a 800). **Títulos de página e perguntas da página pública em maiúsculas**, peso 800. Rótulos de cartão ("kicker") em maiúsculas com espaçamento. Números tabulares em horas e valores. O "H" da marca usa Caveat.

## Forma e componentes

- Cantos grandes: cartões de 22px, campos de 16px, botões e abas em pílula.
- **Botão principal** em largura total leva texto à esquerda e uma seta em círculo à direita; o secundário é um contorno preto.
- **Cartões** brancos com sombra suave (`--shadow-card`); o rótulo em maiúsculas fica dentro do cartão (`.card` ou `.group__header` + `.group`).
- **Campos** brancos com borda fina; hora em pastilha cinza. Dia e hora usam `hh-campo-data` e `hh-campo-hora` (texto "Qua, 4 nov" e "14:00", seletor nativo transparente por cima).
- **Navegação:** barra lateral escura de 256px no desktop (≥960px) com o item ativo em gradiente laranja; no celular, barra de abas branca flutuante com o ícone ativo numa pastilha laranja clara. Telas internas têm um botão "voltar" em pílula.
- **Agenda:** dia em linhas por hora com cartões brancos e bloqueios em faixa preta listrada; semana em sete cartões com horários em laranja claro; mês em grade de cartões com contagem em bolinha preta.
- **Página pública:** faixa preta com o nome do salão em maiúsculas, "agenda online" em Caveat e duas formas redondas (laranja e verde); no desktop vira um painel lateral de 46%.
- **Entrar, cadastro e convite:** no desktop, painel preto à esquerda com a promessa do produto e a onda laranja.

## Modo escuro

O botão sol/lua no canto superior direito (`TemaStore`, `hh-tema-botao`) alterna o tema e grava a escolha em `localStorage` (`hh_tema`); sem escolha, vale a preferência do sistema. Um script no `index.html` aplica o tema antes do Angular subir. A paleta escura é o mixin `escuro` em `_tokens.scss`, ligada por `data-tema="escuro"` no `<html>`:

- Fundo `#0a0908`, cartões `#181614`, painéis `#24201d`, bordas `#33302d`, texto branco e cinza quente.
- Laranja e verde de marca iguais ao claro; etiquetas e avisos em tons escuros de laranja e verde.
- Botões em maiúsculas só no escuro (como no pacote escuro).
- Papéis de cor que separam "painel forte" de "texto": `--panel`, `--seg-on`, `--done-bg`, `--done-fg`. Fundos que antes usavam `--ink-900` usam `--panel`, porque `--ink-900` vira branco no escuro.

## Faça e não faça

- **Faça** pegar cores, raios e sombras dos tokens; **não** escreva hexadecimais nos componentes.
- **Faça** usar `--panel` para fundos escuros e `--ink-900` para texto e contornos.
- **Faça** mostrar o motivo quando algo está bloqueado ou inválido (mensagem), não só desabilitar o botão.
- **Não** use o seletor nativo de data e hora à vista: ele desenha com a fonte e o formato do navegador.
- **Não** crie uma segunda paleta para telas novas: estenda os tokens e o mixin `escuro`.
