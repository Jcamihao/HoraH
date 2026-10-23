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
Lista Nativa, escolhida pelo usuário na rodada "mais segura" (dez rodadas de sorteio antes). Memorable moment: o título grande que encolhe para a barra superior ao rolar e a pilha de telas que entra pelo lado a cada passo.

## Direction contract

THESIS: O painel é a lista do próprio celular: título grande, grupos de linhas separadas por filete e uma única cor de ação; recusa personalidade de marca em troca de clareza e familiaridade até a marca do Hora H existir.

OWN-WORLD: Fundo #F2F2F7, grupos brancos de canto 12px, filete de 1px #D8D8DD, tinta #111, texto secundário #6C6C70, ação azul #0A72E8 só no que se toca; verde, âmbar e vermelho só em estado. Fonte do sistema, título 34px/700, corpo 17px. Reconhecível sem texto: grupos arredondados brancos sobre cinza-claro, controle segmentado, barra de abas.

STORY: O dono sabe onde está pelo título grande e pela barra de progresso fina; toca numa linha para editar, termina cada passo com um botão azul de largura total e nunca perde o caminho de volta.

FIRST VIEWPORT: Celular 390x844. Barra superior com "Voltar" em azul e o nome do salão à direita; abaixo, fio de progresso 5/6; título "Preços" 34px e subtítulo; controle segmentado com as profissionais; grupo branco com as linhas serviço, tempo e preço à direita com seta; a linha sem preço mostra "Definir" em vermelho; botão azul de largura total fixo na base.

FORM: Lista Nativa, direção autoral do mundo convencional (mão "mais segura"), cedendo tipo, paleta, densidade e o título grande que colapsa ao rolar como movimento de assinatura; navegação e controles são os padrão da plataforma. seed: none (unavailable)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved
Marca definitiva (logo, nome, paleta). Todos os tokens ficam em src/styles/_tokens.scss.
