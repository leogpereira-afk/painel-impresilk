# Núcleo do piloto de impressão 3D

Núcleo local em milímetros, derivado da prova aprovada em 28/10/2026. Não contém fatiador, G-code, conexão com impressora, arranjo, rotação ou divisão automática. A frente representa acrílico nominal, sem compensação de corte. STL da frente serve à inspeção.

## Contrato

- `model.mjs`: `createPrintProject`, `validatePrintProject`, `geometrySignature`, `PRINTER_PROFILES`, `DEFAULT_PARAMETERS`, `PARAMETER_RANGES`, `LIMITS`.
- `engine.mjs`: `generatePrintProject(project)`; execução direta para testes Node. A interface deve usar o Worker.
- `client.mjs`: `createPrintClient()` com `generate(project)`, `cancel()` e `dispose()`. Cada geração usa um Worker novo, encerrado após resultado, erro, cancelamento ou timeout de 20 s. Respostas atrasadas são descartadas.
- `exports.mjs`: `partSTL(project,result,partId)`, `frontSVG(project,result,partId?)`, `projectReportJSON(project,result)`. Todos exigem assinatura completa do projeto normalizado atual.
- `notices.mjs`: `PRINT_LICENSES_URL`, emitido como asset pelo Vite para disponibilizar os avisos de terceiros.

Projeto: `{id,name,revision,product:'impressao-3d',schemaVersion:1,unit:'mm',units:'mm',source,parameters,material,bed}`. Origem texto `{kind:'text',text,font:'helvetiker'|'gentilis'}`; arquivo `{kind:'svg'|'dxf',content,name}`. Armazenar somente o projeto, sem malhas ou resultados derivados.

Resultado: `{signature,project,kernel,parts,metrics,dimensionsMm,bedFit,input,validation,warnings,elapsedMs}`. Cada peça tem `id`, `role` (`body`/`front`), `mesh:{positions,indices}`, `frontContours` quando frente, `dimensionsMm`, `volumeMm3` e `checks`. Mesh conserva coordenadas da montagem em mm. Explosão visual não deve mutar as malhas. STL move a peça para XYZ mínimo zero, conserva orientação, verifica float32 e tolerância dimensional de 0,01 mm. STL maior que a mesa fica bloqueado.

## Limites e importação

256 KiB por arquivo; 32 caracteres; 128 contornos; 8.000 vértices aproximados. Tolerância de curva fixada em 0,025 mm; preparação float32 0,0001 mm. Números precisam ser finitos e respeitar `PARAMETER_RANGES`. Folga por lado deve ser menor que a largura de apoio.

Texto usa a altura total do desenho, incluindo acentos. SVG/DXF conservam as medidas físicas do arquivo, sem aplicar a altura do texto. SVG requer página em mm e proporção viewBox igual à página; um único path composto com M/L/Q/C/Z absolutos e coordenadas explícitas; matriz opcional no path. Múltiplos subpaths exigem `fill-rule="evenodd"`. Contornos fora da página, transformações na raiz, grupos, estilos, strokes, recursos externos e atributos desconhecidos são recusados.

DXF ASCII aceita HEADER/ENTITIES, INSUNITS mm/cm/polegada e LWPOLYLINE fechada com contagem explícita, sem bulge, largura, elevação, espessura ou plano OCS alternativo. TABLES, BLOCKS e demais entidades são recusados. As polilinhas são interpretadas por paridade como contornos/vazados. Esse subconjunto é deliberadamente pequeno; não anunciar importação genérica de SVG ou DXF.

## Verificação e seus limites

O kernel confere estado, topologia por componente, colisão, volume e seções. Uma implementação JS adicional confere a malha float32: arestas incidentes a duas faces em sentidos opostos, faces não degeneradas/duplicadas, volume positivo e característica de Euler compatível com os vazados esperados. A malha exportada é novamente conferida após translação. Essa checagem não prova ausência universal de auto-interseções de triângulos ou espessura mínima local. Não é auditoria externa nem homologação física.

Os bloqueios da prova foram preservados: Ç/Gentilis/120 mm (frente separa) e AÇÃO/Gentilis/120 e 180 mm (apoio separa). AÇÃO/210 e Ç/180 passam com o perfil padrão; nenhuma parede é reduzida silenciosamente.

Perfis Ender-3 V3 e K1 Max registram volumes nominais de páginas oficiais. Margem de 5 mm é decisão conservadora do piloto, ajustável no projeto; não é recomendação do fabricante nem homologação de filamento, bico, camada ou encaixe. Material é apenas anotação e não altera dimensões automaticamente.

## Reprodução

`node --test src/lib/impressao3d/*.test.mjs`

Node 24 usado na verificação. Browser: o Worker carrega o JS Emscripten oficial como asset sem reempacotá-lo e passa URL explícita do WASM. Fontes são assets locais compartilhados com Letra Caixa. Vite precisa manter os caminhos relativos ao `base`; validar build com `/painel-impresilk/` e o build de revisão antes de considerar integração concluída.

Proveniência e hashes: `vendor/manifold/PROVENANCE.json`. Licenças: `vendor/THIRD_PARTY_NOTICES.txt`. O runtime JS/WASM oficial permanece intacto.
