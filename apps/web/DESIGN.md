---
name: Hora H, painel
description: Painel de agenda para salões no Meetgen Design System: topo escuro, folhas sálvia sobrepostas com cantos grandes, laranja só no que se toca e sem sombras.
colors:
  orange-500: "#e86a30"
  orange-400: "#ee7f4c"
  orange-200: "#f3b693"
  orange-100: "#efcbb2"
  orange-ink: "#9a3b0c"
  ink-900: "#262721"
  ink-700: "#3a3b34"
  text-secondary: "#4a4b41"
  on-dark-muted: "#c9caba"
  olive-400: "#9fa08a"
  sage-400: "#b2b49e"
  sage-300: "#c3c4a9"
  sage-250: "#cfd0b4"
  sage-200: "#dadbbb"
  sage-100: "#e6e7cc"
  sage-50: "#eef0d4"
  cream-50: "#fbfbea"
  cream-0: "#fffff3"
  divider-light: "#e2e2cf"
  danger: "#a8281c"
  danger-wash: "#f4d3cc"
typography:
  display:
    fontFamily: "'Figtree', system-ui, sans-serif"
    fontSize: "2.125rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.015em"
  title:
    fontFamily: "'Figtree', system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.2
  heading:
    fontFamily: "'Figtree', system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "'Figtree', system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.35
  small:
    fontFamily: "'Figtree', system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.35
  caption:
    fontFamily: "'Figtree', system-ui, sans-serif"
    fontSize: "0.78125rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.04em"
rounded:
  xs: "8px"
  sm: "12px"
  md: "14px"
  lg: "18px"
  xl: "28px"
  2xl: "34px"
  pill: "999px"
spacing:
  gutter: "16px"
  sheet-edge: "10px"
  block: "24px"
components:
  button-filled:
    backgroundColor: "{colors.orange-500}"
    textColor: "{colors.ink-900}"
    rounded: "{rounded.md}"
    height: "56px"
    padding: "0 20px"
  button-dark:
    backgroundColor: "{colors.ink-900}"
    textColor: "{colors.cream-50}"
    rounded: "{rounded.md}"
    height: "56px"
  button-soft:
    backgroundColor: "{colors.sage-250}"
    textColor: "{colors.ink-900}"
    rounded: "{rounded.md}"
    height: "56px"
  card:
    backgroundColor: "{colors.cream-50}"
    rounded: "{rounded.lg}"
  pill-going:
    backgroundColor: "{colors.ink-900}"
    textColor: "{colors.cream-50}"
    rounded: "{rounded.pill}"
    height: "24px"
  pill-pending:
    backgroundColor: "{colors.sage-200}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.pill}"
    height: "24px"
---

# Design System: Hora H, painel

## Overview

**Creative North Star: "A Folha Sobre o Escuro"**

O painel segue o Meetgen Design System, recebido em 2026-10-31 e pedido pelo dono para o Hora H inteiro. O topo de cada tela é uma faixa escura com o título grande; por baixo sobem duas folhas sálvia com cantos grandes, a externa mais escura e a interna mais clara, e sobre elas os cartões cremes. Não há sombras: a profundidade vem do degrau de tom e do canto arredondado. O laranja é tudo o que se toca, está selecionado ou ocupado.

A marca do Hora H ainda não existe: o nome aparece só em texto ("Hora H", na barra superior). Logo e ilustração do pacote são do Meetgen e não foram usados. Valores em `src/styles/_tokens.scss`.

**Key Characteristics:**
- Faixa escura com título de 34px; as folhas sálvia sobem por baixo com cantos de 34 e 28.
- Três famílias de cor: laranja, tinta e sálvia/creme. Azul e verde só em avatares.
- Figtree, servida pelo próprio app (@fontsource), pesos 400 a 700.
- Horário vazio ou indisponível é listrado a 135°.
- Barra de abas escura, aba ativa em pílula laranja.

## Colors

### Primary
- **Laranja de Marca** (#e86a30): botão principal, aba ativa, interruptor ligado, dia selecionado, contagem.
- **Laranja Ocupado** (#ee7f4c): tiles de dia com atendimento, rodapé do bloco de hora.
- **Laranja Escuro** (#9a3b0c): laranja quando é texto sobre sálvia (4,9:1); o laranja de marca como texto daria 2,6:1.

### Neutral
- **Tinta** (#262721): fundo do topo, texto principal, estado "confirmado".
- **Cinza de Apoio** (#4a4b41): texto secundário.
- **Sálvia 400/200/250/300/100/50** (#b2b49e, #dadbbb, #cfd0b4, #c3c4a9, #e6e7cc, #eef0d4): folha externa, folha interna, botão suave, tiles, listra clara.
- **Creme** (#fbfbea) e **Creme Claro** (#fffff3): cartões e "hoje" no mês.
- **Oliva** (#9fa08a): só decorativo; não serve para texto (1,9:1 sobre sálvia).

### Named Rules
**The Orange-Is-Touch Rule.** Laranja marca o que se toca, está selecionado ou ocupado. Não enfeita título nem ícone.

**The Ink-On-Orange Rule.** O texto sobre laranja é tinta e em negrito de 18px ou mais (4,1:1). O creme do pacote dá 3,5:1 e não passa.

## Typography

**Font:** Figtree para tudo. Display 600 e 34px; título de seção 600 e 18px; corpo 17px; legenda de 12,5px em caixa-alta com 0,04em.

### Named Rules
**The Tabular-Time Rule.** Hora, preço e contagem usam algarismos tabulares.

## Layout

Coluna única de até 660px: 10px de moldura sálvia-400, 16px de margem interna e a folha sálvia-200 por dentro. O topo escuro sangra até a borda. No celular, barra de abas escura na base; a partir de 960px vira barra lateral de 248px. A ação principal da agenda é um botão laranja flutuante; no passo a passo, fica fixa na base.

## Elevation & Depth

Sem sombras. A profundidade vem da sobreposição de camadas: tinta, sálvia-400, sálvia-200 e creme.

## Shapes

Raios de 8, 12, 14, 18, 28 e 34; pílulas de 999. Setas são máscara SVG.

## Components

- **Botão:** 56px, canto 14. Laranja é o principal (um por tela); escuro e suave são os secundários. Pressionado: escala 0,98.
- **Cartão de atendimento:** cartão creme de canto 18 com o bloco laranja da hora à esquerda e o fim da hora no rodapé mais escuro do bloco.
- **Pílula de estado:** 24px, caixa-alta pequena. Confirmado = tinta; aguardando = sálvia.
- **Abas Dia/Semana/Mês:** na faixa escura, 36px de altura visível, ativa laranja.
- **Mês:** grade de 7 colunas com contagem acima de cada dia; zero em contorno; hoje em creme claro.
- **Horário vazio:** barra listrada com "Sem horários".

## Do's and Don'ts

### Do:
- **Do** usar laranja só no que se toca, está selecionado ou ocupado.
- **Do** manter o texto sobre laranja em tinta e em negrito de 18px ou mais.
- **Do** mostrar o estado com texto, nunca só com cor.
- **Do** trocar a marca editando só `src/styles/_tokens.scss`.

### Don't:
- **Don't** usar sombra, degradê decorativo ou borda grossa.
- **Don't** usar o logo, o nome ou a ilustração do Meetgen.
- **Don't** usar oliva (#9fa08a) como cor de texto.
- **Don't** inventar números, clientes ou provas: a tela só mostra dado do salão.

## Known defects (not canonized)
- Erro usa um vermelho próprio (#a8281c): o pacote não define cor de erro, é a única exceção às três famílias.
- Contagens de 10px em laranja com tinta ficam em 4,1:1, abaixo de 4,5:1 para texto pequeno.
- Telas fora da agenda (detalhe, Equipe, Serviços, Ajustes, cadastro) herdam o novo visual pelas classes globais, mas não foram revisadas uma a uma.
