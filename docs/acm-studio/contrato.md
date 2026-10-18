# Contrato ACM Studio v1

Implementação autorizada pelo dono em 17/10/2026, com o superprompt em especificacao-aprovada.md. Somente implementação e prévia local. Sem deploy nem dados reais.

## Dados e motores

Todos os cálculos em mm e mm², preços em BRL. JSON serializável, schemaVersion:1. UI não calcula geometria paralela.

`createProject()` em `src/lib/acm/model.mjs` retorna projeto fictício inicial: id, name, revision, schemaVersion, units:'mm', front:{width:6000,height:1200}, left/right:{enabled:false,depth:600,height:1200}, soffit:{enabled:false,width:6000,depth:600}, openings:[], material:{colorId:'grafite',color:'#364152',finish:'matte',thickness:3,skin:null,core:'PE',manufacturer:'',sku:'',directional:false}, layout:{orientation:'vertical',maxWidth:1000,maxHeight:1400,joint:10,minimumStrip:100}, edges:{left:30,right:30,top:30,bottom:30}, overrides:{}, fabrication:{compensation:0,cornerRelief:1,grooveWidth:6,toolAngle:90,toolFlat:2,depth:null,remainingCore:null,calibration:null,machineWidth:1500,machineLength:5000}, stock:{width:1500,length:5000,trim:10,kerf:4,rotation:true,quantity:null,remnants:[]}, structure:{profile:'30x20',wall:null,spacing:600,barLength:6000,kerf:3}, fixing:{type:'tape',tapeWidth:19,thickness:1,screwPitch:300,edgeOffset:15,validated:false}, costs:{sheet:null,metalPerM:null,tapePerM:null,screw:null,work:null}.

`buildProject(project)` em engine.mjs retorna `{valid,errors:[{code,message}],warnings:[{code,message}],pieces,surfaces,structure,fixings,totals}`. Quantitativos não equivalem a aprovação estrutural. Limites de tamanho/quantidade para não bloquear interface. Input inválido não deve virar geometria válida silenciosamente.

Piece: `{id,surface,x,y,width,height,edges,material,blank:{width,height,contour:[[x,y],...],grooves:[{x1,y1,x2,y2,edge}],cutouts:[]},transform:{origin:[x,y,z],u:[x,y,z],v:[x,y,z],normal:[x,y,z]},fixings:{tape:[{x1,y1,x2,y2,width}],screws:[{x,y}]}}`.

Superfície: `{id,label,width,height,transform}`. Dimensão x/y da peça é local à superfície. Origem 3D em mm, horizontal x, vertical y, profundidade z. Front origin=[0,0,0], u=[1,0,0],v=[0,1,0],normal=[0,0,1]. Laterais se estendem para z negativo. blank é desenvolvimento no verso, eixos x/y positivos.

Estrutura: `{segments:[{id,start:[x,y,z],end:[x,y,z],profile,width,depth,length}],totalLength,bars:[{id,cuts:[{id,length}],used,waste}]}`. Totals: `{visibleArea,developedArea,metalLength,tapeLength,screws,pieces}` (mm/mm²).

`nestPieces(pieces,stock,fabrication)` em nesting.mjs retorna `{sheets:[{id,width,length,placements:[{pieceId,x,y,width,height,rotated}],usedArea}],unplaced:[{pieceId,reason}],grossArea,usedArea,utilization,wasteArea,method}`. Envelope conservador executável, não promessa de ótimo global. Material/cor/espessura/lote separados. Kerf entre peças e refilo nas bordas. Rotações respeitam sentido de acabamento. Teste independente de não sobreposição/limites e conservação dos IDs.

## Visualização

`ACMViewport({project,result,selectedId,onSelect,mode,view,showStructure,showFixings,transparent,onCapture})` usa Three.js sob demanda. mode='assembled'|'exploded'|'unfolded', view='iso'|'front'|'back'|'left'|'right'|'top'. Seleção estável. Fallback SVG 2D se WebGL falhar. Sem calls remotas. PNG usa geometria atual.

## Documentos e persistência

`pieceSVG(piece,{back:true})`, `pieceDXF(piece,{back:true})`, `materialsCSV(project,result,nesting)`, `projectReportHTML(project,result,nesting)` em documents.mjs; textos escapados, unidade/revisão e RASCUNHO quando não calibrado. Nenhum G-code. Imprimir HTML para PDF via navegador. Exportação JSON versionada para backup/restauração.

`loadDraft(ownerId)`, `saveDraft(ownerId,project,expectedVersion)`, `listRevisions(ownerId)`, `saveRevision(ownerId,project)`, `restoreRevision(ownerId,id)` em storage.mjs: namespace por identidade, limites/tamanho/schema, compare-and-swap e recuperação. Falhas de quota/conflito expostas. Prévia isolada. Servidor precisa de autorização real do módulo antes de guardar/carregar; não habilitar endpoint fake.

## Interface e revisão

Root implementa integração FerramentaIA e ACMStudio, formulários, SVG plano de corte, custos, assistente local determinístico para pré-preenchimento com confirmação, configuração/calibração, documentos, histórico e estado. Recursos que exigem provedor/dimensionamento devem apresentar disponibilidade real. Importação validada. Dados fictícios em testes e prévia. Publicação apenas após autorização.
