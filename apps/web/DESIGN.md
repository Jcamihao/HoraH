---
name: Hora H, painel
description: Painel de agenda para salões, no formato de lista nativa do celular: título grande, grupos brancos e uma só cor de ação.
colors:
  surface-bg: "#f2f2f7"
  surface: "#ffffff"
  ink: "#111113"
  ink-soft: "#6c6c70"
  separator: "#d8d8dd"
  separator-strong: "#c6c6cb"
  press: "#e5e5ea"
  tint: "#0a72e8"
  tint-press: "#0860c4"
  tint-wash: "#e4f0fd"
  state-ok: "#16693a"
  state-ok-wash: "#e1f2e6"
  state-wait: "#8a5200"
  state-wait-wash: "#fff0d1"
  state-bad: "#c7271f"
  state-bad-wash: "#fde7e5"
  switch-on: "#2e9e52"
typography:
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "2.125rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.3
  small:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.3
  caption:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: "0.02em"
rounded:
  group: "12px"
  control: "12px"
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
  button-filled-pressed:
    backgroundColor: "{colors.tint-press}"
  button-tinted:
    backgroundColor: "{colors.tint-wash}"
    textColor: "{colors.tint}"
    rounded: "{rounded.control}"
    height: "50px"
  button-plain:
    backgroundColor: "transparent"
    textColor: "{colors.tint}"
    height: "44px"
  group:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.group}"
  row:
    textColor: "{colors.ink}"
    padding: "10px 16px"
    height: "52px"
  badge-ok:
    backgroundColor: "{colors.state-ok-wash}"
    textColor: "{colors.state-ok}"
    rounded: "{rounded.pill}"
    height: "24px"
  badge-wait:
    backgroundColor: "{colors.state-wait-wash}"
    textColor: "{colors.state-wait}"
    rounded: "{rounded.pill}"
    height: "24px"
  badge-bad:
    backgroundColor: "{colors.state-bad-wash}"
    textColor: "{colors.state-bad}"
    rounded: "{rounded.pill}"
    height: "24px"
---

# Design System: Hora H, painel

## Overview

**Creative North Star: "A Lista do Aparelho"**

O painel parece a lista de ajustes do próprio celular: título grande, grupos de linhas brancas separadas por um filete e uma cor só para o que se toca. O dono do salão, que não é técnico e usa o painel entre um atendimento e outro, já sabe usar esse formato; ninguém precisa aprender nada. A marca do Hora H ainda não existe (nome provisório), então a identidade é neutra de propósito e todos os valores moram em `src/styles/_tokens.scss`.

A densidade é média: linhas de 52px, alvos de toque de 44px ou mais, um grupo por assunto. Cor é informação, não decoração: azul é o que se toca, verde, âmbar e vermelho são estado, o resto é tinta e cinza.

**Key Characteristics:**
- Título grande de 34px que encolhe para a barra superior ao rolar (movimento de assinatura).
- Grupos brancos de canto 12px sobre cinza-claro; a divisão é um filete recuado de 1px.
- Uma cor de ação (azul); estados em verde, âmbar e vermelho só quando existe estado.
- Fonte do sistema: o texto parece do aparelho em qualquer plataforma.
- Telas entram pelo lado, como numa pilha de navegação.

## Colors

Paleta neutra e fria com uma única cor de ação.

### Primary
- **Azul de Ação** (#0a72e8): botões cheios, links, aba ativa, foco, barra de progresso. Só aparece no que se pode tocar.
- **Azul Pressionado** (#0860c4): botão cheio enquanto está pressionado.
- **Lavanda de Azul** (#e4f0fd): fundo do botão secundário, avisos informativos e seleção de texto.

### Secondary
- **Verde de Pronto** (#16693a) sobre **Fundo Verde** (#e1f2e6): estado concluído e avisos de sucesso.
- **Âmbar de Espera** (#8a5200) sobre **Fundo Âmbar** (#fff0d1): estado pendente, como "Sem acesso".
- **Vermelho de Falta** (#c7271f) sobre **Fundo Rosa** (#fde7e5): o que falta ou deu errado, como "Definir" no preço.
- **Verde do Interruptor** (#2e9e52): trilho do interruptor ligado.

### Neutral
- **Cinza de Fundo** (#f2f2f7): fundo da página e do cabeçalho fixo.
- **Branco de Grupo** (#ffffff): grupos de linhas e barra de abas.
- **Tinta** (#111113): texto principal.
- **Cinza de Apoio** (#6c6c70): texto secundário e rótulos (5:1 sobre branco).
- **Filete** (#d8d8dd) e **Filete Forte** (#c6c6cb): divisores e contorno do interruptor desligado.
- **Cinza de Toque** (#e5e5ea): linha enquanto é pressionada.

### Named Rules
**The Only-Touch Rule.** O azul de ação aparece só em quem responde ao toque. Nada informativo usa azul, a não ser o aviso com fundo lavanda.

**The State-Not-Style Rule.** Verde, âmbar e vermelho existem só para estado. Nenhum deles enfeita título, ícone ou fundo.

## Typography

**Display Font:** fonte do sistema (-apple-system, Segoe UI, Roboto), sem arquivo de fonte.
**Body Font:** a mesma.
**Label/Mono Font:** a mesma, em caixa-alta pequena só nos cabeçalhos de grupo.

**Character:** a voz do aparelho. O peso 700 só nos títulos; o resto é 400 e 600.

### Hierarchy
- **Title** (700, 2.125rem, 1.1): título grande de cada tela.
- **Headline** (700, 1.375rem, 1.2): títulos de estado vazio.
- **Body** (400, 1.0625rem, 1.3): linhas e campos; mínimo de 16px para o celular não dar zoom nos campos.
- **Small** (400, 0.9375rem, 1.3): subtítulos e detalhes de linha.
- **Caption** (400, 0.8125rem, 0.02em): rodapé de grupo e cabeçalho de grupo em caixa-alta.

### Named Rules
**The Tabular-Money Rule.** Preço, horário e duração usam `font-variant-numeric: tabular-nums` para as colunas alinharem.

## Layout

Coluna única de até 640px, centrada, com 16px de margem lateral. Blocos separados por 24px; linhas de 52px. No celular a navegação é uma barra de abas fixa na base; a partir de 960px vira barra lateral de 248px e o conteúdo continua numa coluna de 640px. No passo a passo, a ação principal fica fixa na base. Campos de formulário são linhas de grupo com rótulo à esquerda (8,5rem) e valor ao lado.

## Elevation & Depth

Quase plano. A profundidade vem de camada tonal (grupo branco sobre cinza-claro) e de filete, não de sombra. A única sombra é a do botão do interruptor e da aba selecionada do controle segmentado, com deslocamento e desfoque suaves.

### Shadow Vocabulary
- **Controle selecionado** (`box-shadow: 0 3px 8px rgba(0,0,0,.12), 0 3px 1px rgba(0,0,0,.04)`): aba ativa do controle segmentado.
- **Botão do interruptor** (`box-shadow: 0 3px 8px rgba(0,0,0,.15), 0 1px 1px rgba(0,0,0,.16)`): a bolinha do interruptor.

### Named Rules
**The Flat-By-Default Rule.** Grupos e botões não têm sombra; ela só marca o que o dedo move.

## Shapes

Cantos de 12px em grupos e botões; 999px em etiquetas de estado e na bolinha do interruptor. Sem borda em grupos; a divisão interna é um filete de 1px recuado 16px à esquerda. Setas de navegação são desenhadas com bordas CSS, não com caractere.

## Components

### Buttons
- **Shape:** canto de 12px (`--r-ctl`), altura mínima de 50px.
- **Filled:** fundo azul de ação, texto branco; a ação principal da tela, uma por tela.
- **Tinted:** fundo lavanda de azul e texto azul; ações secundárias como "Adicionar" e "Salvar nome".
- **Plain:** sem fundo, texto azul; ações leves como "Outro horário no dia".
- **Pressed:** escala 0,98; o botão cheio escurece para o azul pressionado. Desabilitado perde 60% da opacidade.

### Chips
- **Style:** etiqueta de 24px, canto total, texto de 13px em peso 600, fundo claro da cor do estado.
- **State:** `ok` (verde), `wait` (âmbar), `bad` (vermelho) e neutro (cinza) para "Você" e "Inativo".

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** branco sobre cinza-claro.
- **Shadow Strategy:** nenhuma.
- **Border:** nenhuma; filete interno entre linhas.
- **Internal Padding:** 10px vertical e 16px horizontal por linha.

### Inputs / Fields
- **Style:** o campo mora numa linha de grupo, sem contorno próprio; rótulo visível à esquerda.
- **Focus:** contorno interno de 2px azul de ação na linha inteira.
- **Error / Disabled:** a linha ganha fundo rosa e a mensagem aparece abaixo em vermelho; no preço, o campo mostra "Definir" em vermelho.

### Navigation
- **Style:** barra superior fixa com "Voltar" em azul à esquerda e título pequeno que surge ao rolar; barra de abas com ícone e rótulo de 11px.
- **States:** aba ativa em azul de ação; na barra lateral a aba ativa ganha fundo lavanda.
- **Mobile treatment:** abas na base até 959px; barra lateral a partir de 960px.

### Interruptor e Controle Segmentado
Interruptor de 51×31px com trilho verde ao ligar e área de toque ampliada em volta. O controle segmentado troca de profissional: fundo cinza de 2px de borda interna, aba selecionada branca com a sombra de controle.

## Do's and Don'ts

### Do:
- **Do** usar azul de ação (#0a72e8) só em quem responde ao toque.
- **Do** agrupar linhas em um grupo branco de canto 12px com filete recuado de 16px.
- **Do** mostrar o estado com etiqueta e texto ("Definir", "Sem acesso"), nunca só com cor.
- **Do** manter o campo de formulário em 16px ou mais e a área de toque em 44px ou mais.
- **Do** trocar a marca editando só `src/styles/_tokens.scss`.

### Don't:
- **Don't** pôr cartão dentro de cartão; use grupos e filetes.
- **Don't** usar verde, âmbar ou vermelho como enfeite.
- **Don't** usar sombra pesada, desfoque decorativo ou gradiente em texto.
- **Don't** pôr um rótulo pequeno em caixa-alta acima de um título; cabeçalho de grupo só nomeia o grupo abaixo.
- **Don't** inventar números, clientes ou provas: a tela só mostra dado do salão.
