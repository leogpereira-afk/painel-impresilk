# ACM Studio Implementation Plan

> Execução: subagent-driven-development, agentes com arquivos separados e revisão integrada.

**Goal:** medir fachadas, estudar cores e montagem em 3D, desenvolver bandejas e conferir corte/quantitativos/documentos pela mesma revisão.
**Architecture:** motores puros e testáveis, Three.js carregado sob demanda, interface React, persistência por usuário, documentos gerados do mesmo resultado.
**Tech Stack:** React 18, Vite 5, JavaScript ESM, SVG e Three.js.
**Spec:** docs/acm-studio/especificacao-aprovada.md; interfaces em docs/acm-studio/contrato.md.

## Restrições
- Clone fora do iCloud, dados somente fictícios; nenhuma publicação.
- Abas 20/30 mm distintas de juntas e laterais. Espessuras 3/4 mm. Chapas 1220/1250/1500 × 5000 mm.
- Nenhuma constante de vídeo vira regra universal. Calibração vinculada ao material/processo.
- Medidas e documentos são uma revisão; aprovação geométrica não aprova estrutura.

## Entregas executáveis
- [x] Modelo, validação, desenvolvimento e modulação: model.mjs, engine.mjs, nesting.mjs. Testar áreas/IDs, assimetria, recortes, dados inválidos, espessuras, limites, orientação, encaixe exato, kerf, ausência de sobreposições e barras.
- [x] Cena 3D em ACMViewport.jsx: vistas, seleção, materiais, acabamentos, abas, corte, estrutura e fixação; SVG alternativo e descarte de recursos. Conferir por navegador com geometria fictícia.
- [x] Documentos/persistência: SVG/DXF por operação, CSV e relatório imprimível; coordenadas frente/verso, escape de texto, rascunhos isolados, revisões e conflitos. Testar round trip e revisão.
- [x] Interface integrada: fluxo completo de projeto até documento, biblioteca de cores, formulários avançados, plano de corte e comparação, calibração, custos e rascunho. Abrir prévia em modo review e conferir desktop/celular.
- [x] Revisão independente: atacar limites e diferenças entre modelo/render/exportação; corrigir achados, executar regressões, build, lint e medir recursos 3D sob demanda.
- [x] Relatório: cobertura por seção do prompt, limitações verificadas e URL da prévia; sem declarar publicação.

## Decisões de execução
- O prompt anexado é a especificação aprovada; “fazer” autoriza a implementação. Não repetir aprovação de design.
- Nesting começa por envelopes conservadores com múltiplas heurísticas determinísticas; desperdício dos cantos fica explícito e sem alegação de ótimo global.
- Disponibilidade de SKU, resistência e calibração real não são inventadas. Modelos visuais têm pendências objetivas até dados confirmados.

## Fechamento local

Prévia funcional verificada; cobertura e limites em docs/acm-studio/entrega.md. 789 testes passaram, build aprovado e lint sem erros. Os itens acima cobrem a implementação local; não representam liberação estrutural, fabricação, ativação remota ou publicação.
