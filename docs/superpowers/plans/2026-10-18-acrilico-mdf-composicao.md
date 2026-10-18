# Acrílico e MDF — composição e meios-encaixes

Escopo aprovado: implementar a revisão 5 em Acrílico/MDF, preservar Metalon integralmente e entregar prévia local. Sem deploy. Referências funcionais e imagens estão no prompt da pasta Dre/entregas/oficina-cnc-20261018.

## Contrato compartilhado

Novo domínio `src/lib/oficina-placas/model.mjs` exporta:

- `createPanelsProject()` — projeto com `product:'oficina-placas'`, id/name/revision/formatVersion:1/schemaVersion:1/unit:'mm'/units:'mm'/quantity:1/links/stock/costs como Oficina. `materials:{acrylic:{objects:[],joints:[]},mdf:{objects:[],joints:[]}}`. Cada material começa com uma caixa aberta.
- `createPanelObject(type,materialId)` — type `box|text|plate|dividers|vector`. Objeto `{id,type,name,visible:true,locked:false,position:{x:0,y:0,z:0},rotation:0,quantity:1,config:{...}}`. Rotação em graus em torno de Z do mundo; unidades mm. Config de box/plate/dividers usa campos da antiga Oficina (model,width,depth,height,dimensionMode,thickness,measuredThickness,clearance,joint,fingerCount,columns,rows,finish,color,subtype,sku,process,rotation), com opacity 1 para opaco, .55 translúcido, .2 transparente. Plate config `shape:'rectangle|ellipse'`,holes:[],cutouts:[]. Text config `text`,font,heightMm,letterSpacingMm,lineSpacing,align,operation:'cut|engrave|annotation|cutout',targetPieceId (para engrave/cutout),widthMm:null; usa espessura/material iguais aos demais; formas reais do motor Letra Caixa. Vector `artwork` no formato do importador existente. IDs não podem colidir.
- `buildPanelsProject(project,materialId)` — resultado padrão da Oficina: `{valid,errors,warnings,pieces,displayPieces,dimensions,assembly,materialId,revision,signature,objects:[{id,name,pieceIds,width,height,depth}],jointPairs:[...]}`. Cada piece adiciona objectId, visible, operation, material.opacity. Normalização 2D local em [0,width]×[0,height]; transform real para montagem. Peças ocultas permanecem em pieces, displayPieces só visíveis. `pieces` contém apenas material físico; `markings` são contornos de engrave/annotation ligados a targetPieceId e não geram material extra. Texto vazado altera cutouts da peça alvo, bloqueando interseção/borda/ilhas sem pontes explícitas. A imagem deve refletir geometria real, nunca apenas textura.
- `asWorkshopProject(project,materialId)` — adaptador legado, product oficina; components[materialId] inclui composição inteira para cutSignature consistente; stock/costs/quantity/revision/id mantidos. Usado pelos motores existentes de corte/custos/exportação sem editá-los.
- `validatePanelsProject(project)` — valida formato para persistir rascunho, sem exigir que rascunho geométrico esteja completo.
- Joint: `{id,a:pieceId,b:pieceId,positionA,positionB,depthA,depthB,entryA:'top|bottom',entryB:'top|bottom',clearance:0,minWeb:1,enabled:true}`. widthA = espessura B + clearance e vice-versa. Pares devem ser perpendiculares e cruzar de verdade; validar posição e profundidade contra montagem. Interface pode pré-preencher joint pelo par de divisórias; não inventar interseção inexistente. Gerar rasgos reais na geometria exportada. Dividers usa algoritmo existente de grelha complementar, pares editáveis na configuração e no resultado.

`src/lib/oficina-placas/workflow.mjs` (root): planejamento e exportação usam adaptador + resultado; exportação revalida plano completo. Operações do plano e projeto no mesmo histórico; backup preserva planos revalidados, sem sobrescrever namespace Metalon. Namespace IndexedDB `oficina-placas`. Worker próprio recebe project/material/previous e responde plan/errors.

Viewport `src/components/oficina-placas/PanelsViewport.jsx` props `{result,selected,onSelect,onCaptureReady,onMove,onBack}`. selected é pieceId; onMove(objectId,{x,y,z,rotation}) opcional. Usa transform de cada peça, cor/opacidade individuais. Marcações em targetPieceId em coordenadas locais. Não muda módulos antigos.

Página `src/pages/OficinaPlacas.jsx` props `{initialMaterial,onTool,onBack}`, classes `op-*`, CSS próprio. Motor via contrato acima. Chamadas workflow `calculatePanelsPlan(project,material,previous?)`, `exportPanelsDrawing(project,material,format,plan?)`, `restorePanelsPlans(project)` -> `{plans,discarded}`, `editPanelsPlan(project,material,plan,action,pieceId,changes)` -> `{plan,valid,errors}`. `action:move|remove|allocate`, changes de allocate incluem sheetId. Armazena plano em project.cutPlans[material]. `getPanelsCosts(project,material,plan)` reutiliza custos existentes. UI pode importar funções diretamente do model. Tudo compilável e erros locais visíveis.

## Tarefas e donos

1. Motor e testes — agente domain: somente `src/lib/oficina-placas/model.mjs`, `geometry*.mjs`, `model.test.mjs`. Textos reais, caixas, divisórias/meios-encaixes, material, composição, dimensões/validação. Modelo/API acima.
2. Página e estilos — agente UI: somente `src/pages/OficinaPlacas.jsx/.css`. Controles compactos de objetos, texto/material/encaixes; persistência/histórico; nesting editável e documentos. Reusar componentes antigos por import, sem editar.
3. Viewport — agente viewer: somente `src/components/oficina-placas/PanelsViewport.jsx/.css` e auxiliares próprios. 2D/3D, seleção/cor/opacidade, vistas/medidas/animação, captura.
4. Root — workflow/export/worker/tests, integração rota/scripts, baseline protegido, revisão geral e validação browser desktop/mobile.

## Aceite

Caixa + texto acentuado + divisórias simultâneos; não perder objetos ao trocar material. Textos editáveis e vazados reais. Peça 300×150×3,2 com dimensões corretas. Caixa externa 300×200×150 e espessura 3,2: lateral 193,6×150/base293,6×193,6. Encaixes H100 profundidade50 e espessura3,2 + folga.15 =3.35. Plano inválido por margem/gap/material/rotação/estoque não exporta. Desfazer/refazer inclui nesting e reabrir mantém plano válido. Campos com vírgula/erro. Cor e opacidade coerentes. Relatar limites concretos de fabricação. Testes, lint, build e prévia local antes de qualquer publicação. Comparar hashes de todos os arquivos protegidos.
