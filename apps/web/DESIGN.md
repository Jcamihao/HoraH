---
name: Hora H, painel
description: Painel de agenda para salões no formato de rolo de senhas: faixa amarela, fichas numeradas com picote e uma só cor de ação.
colors:
  roll: "#ffd84d"
  surface-bg: "#f7f7f4"
  surface: "#ffffff"
  ink: "#17171a"
  ink-soft: "#55555a"
  separator: "#d6d6cd"
  separator-strong: "#b9b9ae"
  tint: "#1f3fd6"
  tint-press: "#1832ae"
  tint-wash: "#fff1b8"
  state-ok: "#17693a"
  state-ok-wash: "#dff1e4"
  state-wait: "#7a4b00"
  state-wait-wash: "#ffecb0"
  state-bad: "#c42a1a"
  state-bad-wash: "#fde5e1"
  ribbon-1: "#1f3fd6"
  ribbon-2: "#e0301e"
  ribbon-3: "#17693a"
  ribbon-4: "#8a2be2"
  ribbon-5: "#e07b00"
  ribbon-6: "#0a8aa8"
typography:
  title:
    fontFamily: "'Barlow Condensed', 'Arial Narrow', 'Barlow', sans-serif"
    fontSize: "2.5rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0"
  headline:
    fontFamily: "'Barlow Condensed', 'Arial Narrow', 'Barlow', sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "0.005em"
  ticket-time:
    fontFamily: "'Barlow Condensed', 'Arial Narrow', 'Barlow', sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1
  body:
    fontFamily: "'Barlow', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 500
    lineHeight: 1.3
  small:
    fontFamily: "'Barlow', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 500
    lineHeight: 1.3
  caption:
    fontFamily: "'Barlow', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0.04em"
rounded:
  group: "8px"
  control: "8px"
  ticket: "6px"
  pill: "999px"
spacing:
  gutter: "16px"
  row-y: "10px"
  block: "24px"
components:
  button-filled:
    backgroundColor: "{colors.tint}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    height: "50px"
    padding: "0 20px"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "50px"
  button-fab:
    backgroundColor: "{colors.tint}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    height: "52px"
    padding: "0 22px"
  ticket:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.ticket}"
    height: "72px"
  badge-ok:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.roll}"
    rounded: "4px"
    height: "26px"
  badge-wait:
    backgroundColor: "{colors.state-wait-wash}"
    textColor: "{colors.state-wait}"
    rounded: "4px"
    height: "26px"
  badge-bad:
    backgroundColor: "{colors.state-bad-wash}"
    textColor: "{colors.state-bad}"
    rounded: "4px"
    height: "26px"
---

# Design System: Hora H, painel

## Overview

**Creative North Star: "O Rolo de Senhas"**

Cada horário marcado é uma ficha de senha: a hora em número grande e condensado num talão à esquerda, um picote tracejado com dois recortes redondos, o nome do cliente ao lado e uma fita de cor na borda. O topo de cada tela é uma faixa de papel amarelo que sangra até a borda. O dono do salão, entre um atendimento e outro, reconhece a ficha na hora: é a senha da farmácia, só que com o nome do cliente.

A identidade foi escolhida em 2026-10-30, substituindo a "Lista Nativa", porque o dono achou o visual genérico, sem marca e parecido com iPhone. Todos os valores moram em `src/styles/_tokens.scss`; a marca definitiva (nome, domínio) ainda não existe e vai mexer só nesse arquivo.

**Key Characteristics:**
- Faixa amarela (#ffd84d) no topo de toda tela, com título condensado de 40px.
- Ficha com talão de hora, picote tracejado e fita de cor fixa por profissional.
- Texto em Barlow, números e títulos em Barlow Condensed, arquivos locais (@fontsource).
- Contornos de tinta de 2px em controles de contorno, em vez de sombra.
- Uma cor de ação (cobalto) que só aparece no que se toca.

## Colors

Amarelo de papel e tinta quase preta, com um cobalto para a ação.

### Primary
- **Cobalto de Ação** (#1f3fd6): botão cheio, botão flutuante, links e foco. Só no que se toca.
- **Cobalto Pressionado** (#1832ae): botão cheio enquanto pressionado.

### Secondary
- **Amarelo de Senha** (#ffd84d): faixa de topo, aba ativa, seleção de texto. É o campo de cor da marca.
- **Papel Claro** (#fff1b8): aviso informativo.
- **Verde de Pronto** (#17693a): estado concluído e interruptor ligado.
- **Âmbar de Espera** (#7a4b00) sobre **Fundo Âmbar** (#ffecb0): pendente.
- **Vermelho de Falta** (#c42a1a) sobre **Fundo Rosa** (#fde5e1): o que falta ou deu errado.
- **Fitas de profissional** (#1f3fd6, #e0301e, #17693a, #8a2be2, #e07b00, #0a8aa8): uma por posição na equipe, a mesma em todas as telas.

### Neutral
- **Branco Frio** (#f7f7f4): fundo da página.
- **Branco de Ficha** (#ffffff): fichas, grupos e barra de abas.
- **Tinta** (#17171a): texto principal, contornos, aba selecionada.
- **Cinza de Apoio** (#55555a): texto secundário (7:1 sobre branco).
- **Filete** (#d6d6cd) e **Filete Forte** (#b9b9ae): divisores e picote.

### Named Rules
**The Only-Touch Rule.** O cobalto aparece só em quem responde ao toque. Nada informativo usa cobalto.

**The State-Not-Style Rule.** Verde, âmbar e vermelho existem só para estado, sempre com texto junto.

**The Roll-Is-The-Frame Rule.** O amarelo é o campo da marca: faixa de topo e aba ativa. Não vira fundo de conteúdo nem enfeite de ícone.

## Typography

**Display Font:** Barlow Condensed (700), arquivos locais.
**Body Font:** Barlow (400 a 600), arquivos locais.

**Character:** condensada e firme como número impresso em papel térmico. O corpo é uma grotesca neutra que lê bem sob luz forte.

### Hierarchy
- **Title** (700, 2.5rem, 1): título da tela, na faixa amarela.
- **Headline** (700, 1.75rem, 1.05): estado vazio e títulos de seção.
- **Ticket time** (700, 1.875rem, 1): hora da ficha.
- **Body** (500, 1.0625rem, 1.3): linhas e campos; mínimo de 16px para o celular não dar zoom.
- **Small** (500, 0.9375rem): subtítulos de linha.
- **Caption** (700, 0.8125rem, 0.04em): carimbos de estado, em caixa-alta.

### Named Rules
**The Tabular-Time Rule.** Hora, preço e duração usam Barlow Condensed com algarismos tabulares.

## Layout

Coluna única de até 640px, centrada, margem lateral de 16px. No celular a navegação é uma barra de abas fixa na base com borda de tinta de 2px; a partir de 960px vira barra lateral de 248px. A ação principal da agenda é um botão cobalto flutuante acima das abas. No passo a passo, a ação principal fica fixa na base. Campos de formulário são linhas de grupo com rótulo à esquerda (8,5rem).

## Elevation & Depth

Quase plano. A profundidade vem do contraste entre ficha branca e fundo frio, de um filete de 1px sob a ficha e de contornos de tinta de 2px. Sombra só no botão flutuante e na bolinha do interruptor.

### Shadow Vocabulary
- **Botão flutuante** (`0 6px 16px rgba(31,63,214,.35)`): marca o que flutua sobre a lista.
- **Bolinha do interruptor** (`0 2px 4px rgba(0,0,0,.25)`): marca o que o dedo move.

### Named Rules
**The Flat-By-Default Rule.** Fichas, grupos e botões não têm sombra de repouso além do filete de 1px.

## Shapes

Cantos de 8px em grupos e controles, 6px na ficha, 999px nas pílulas de filtro e no botão flutuante, 4px nos carimbos de estado. A ficha tem dois recortes redondos no picote (um em cima, um embaixo). Setas de navegação são máscara SVG, não caractere.

## Components

### Buttons
- **Filled:** cobalto com texto branco, 50px; a ação principal de cada tela.
- **Outline (padrão):** fundo branco, contorno de tinta de 2px; ações secundárias.
- **Plain:** sem fundo, texto cobalto sublinhado; ações leves.
- **FAB:** pílula cobalto de 52px, fixa acima das abas.
- **Pressed:** escala 0,98; o cheio escurece. Desabilitado perde 60% da opacidade.

### Ticket (ficha)
Talão de 6rem com hora grande e hora final pequena, picote tracejado de 2px, recortes redondos, fita de cor de 6px na borda esquerda, nome e serviço ao lado, carimbo de estado à direita. Cancelado recua (60%) e risca o nome; bloqueio fica cinza e sem cor de estado.

### Chips e controle segmentado
Pílulas e horários livres com contorno de tinta de 2px; a escolhida preenche de tinta com texto amarelo.

### Carimbo de estado
Rótulo de 26px, caixa-alta, contorno de 2px na cor do estado. Confirmado é tinta com texto amarelo.

### Navigation
Barra superior amarela com "Voltar" em tinta e título pequeno que surge ao rolar; barra de abas branca com borda de tinta; aba ativa preenche de amarelo.

## Do's and Don'ts

### Do:
- **Do** usar cobalto só em quem responde ao toque.
- **Do** mostrar a hora grande no talão da ficha e o estado em carimbo com texto.
- **Do** manter a mesma fita de cor para o mesmo profissional em toda tela.
- **Do** manter campos em 16px ou mais e alvos de toque de 44px ou mais.
- **Do** trocar a marca editando só `src/styles/_tokens.scss`.

### Don't:
- **Don't** pôr ficha dentro de ficha; use grupos e filetes.
- **Don't** usar verde, âmbar ou vermelho como enfeite.
- **Don't** usar o amarelo como fundo de conteúdo.
- **Don't** usar sombra pesada, degradê ou desfoque decorativo.
- **Don't** inventar números, clientes ou provas: a tela só mostra dado do salão.

## Known defects (not canonized)
- A fita de 6px na borda esquerda da ficha lê como "side stripe". Ela foi escolhida pelo usuário no esboço (cor fixa por profissional) e fica como exceção declarada, não como regra para outros componentes.
- A régua de 30 minutos visível e o aviso "Livre das 11:15 às 12:00" do esboço ainda não foram construídos.
