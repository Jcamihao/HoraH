---
version: 1
slug: "src-app"
primary_target: "src/app"
related_targets: []
---

# Surface brief: painel do Hora H (Fase 1)

## Scope and mode
Operate. Painel Angular mobile-first (dono e profissional) e telas de entrada: login, cadastro do dono, convite, passo a passo de cadastro, Equipe, Serviços, Ajustes. Página pública `/{slug}` e agenda ficam para a Fase 2.

## Audience, task, constraints
Dono de salão pequeno, não técnico, no celular entre atendimentos. Tarefa: terminar o cadastro sozinho e depois ajustar profissionais, serviços, preços e regras. Estados: passo atual/concluído, preço faltando, convite enviado, profissional inativo, erro de rede, vazio. Idioma pt-BR. Marca do Hora H ainda não existe (nome provisório): a identidade é neutra e trocável por tokens.

## Chosen direction
Rolo de Senhas, sorteado e confirmado pelo usuario em 2026-10-30 (substitui a Lista Nativa; o usuario achou o visual generico, sem marca e parecido com iPhone). Cada horario marcado e uma ficha de senha. Memorable moment: a ficha com picote e a hora em numero grande condensado, e a fita de cor fixa de cada profissional.

## Direction contract

THESIS: O painel e um rolo de senhas de atendimento: cada horario marcado e uma ficha numerada com picote; recusa o cinza-e-azul de aparelho e a lista de linhas iguais.

OWN-WORLD: Faixa de topo amarelo senha #FFD84D, fundo branco-frio #F7F7F4, fichas brancas com picote tracejado e dois recortes redondos, tinta quase preta #17171A, acao cobalto #1F3FD6, vermelho de falta #E0301E. Numeros em Barlow Condensed 700 tabular, texto em Barlow. Reconhecivel sem texto: faixa amarela, fichas com stub de hora e picote.

STORY: O dono bate o olho na faixa amarela com o dia, le as fichas de cima para baixo pela hora grande, ve o estado em etiqueta carimbada e toca no botao cobalto para marcar.

FIRST VIEWPORT: Celular 390x844. Faixa amarela no topo com data e titulo condensado 40px, filtros em pilulas de contorno preto; fichas brancas com stub de 84px (hora e duracao) e fita de cor do profissional; botao cobalto flutuante Marcar horario; abas brancas na base.

FORM: Rolo de Senhas, assigned (indice 4 da lista propria), seed: none (unavailable). Cede tipo, paleta, densidade e a ficha com picote como movimento; navegacao, abas, campos e controles seguem padrao web. Raises: fita de cor por profissional (mascotes), grade de 30 min visivel (Crouwel).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved
Marca definitiva (logo, nome, paleta). Todos os tokens ficam em src/styles/_tokens.scss.
