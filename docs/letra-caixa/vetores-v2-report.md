# Arte vetorial e construção — entrega local v2

## Entregue

- `VectorImportPanel` recebe `{project,onChange}`; `onChange` entrega somente `artwork`. Upload SVG/DXF com leitura local, prévia dos contornos e vazados, medidas físicas, confirmação explícita e aplicação ao projeto. Arquivos inválidos não substituem a arte existente. Alternância para texto e redimensionamento proporcional da arte aplicada.
- Exemplos fictícios `public/examples/letras-demo.svg` e `.dxf`: 400 × 200 mm, duas formas, três vazados, área física de 50.000 mm². Links baixáveis no painel.
- SVG: parser próprio sem DOM ou execução, caminhos M/L/H/V/C/S/Q/T/A/Z relativos/absolutos, polygon, rect simples, circle/ellipse, grupos e transformações matrix/translate/scale/rotate. Regras evenodd e nonzero com orientação de vazados; ilhas dentro de vazados. Unidades mm/cm/in/pt/pc e viewBox; sem unidades físicas exige largura informada. Referências, código ativo, texto, contornos abertos, estilos/elementos não suportados, traços não expandidos e sobreposições ambíguas são rejeitados.
- DXF ASCII: LWPOLYLINE/POLYLINE planas fechadas, arcos por bulge, círculos, vazados por inclusão e unidades INSUNITS. ARC isolado é aberto e rejeitado; exige união em polilinha fechada. LINE/SPLINE/INSERT/3D/largura de polilinha não expandida são rejeitados, nunca descartados silenciosamente.
- Limites: 2 MB, 200 formas, 8.000 pontos totais e 2.000 pontos por contorno. Coordenadas não finitas, interseções e vazados inválidos são bloqueados. Projeto salvo repete validação do contrato, inclusive sobreposições.
- Arte normalizada em mm entra em `geometryInput`/assinatura e no mesmo contrato de `letters`, `components`, `strips` e `bounds` do texto. JSON conserva arte e escala. Largura altera altura na mesma proporção, com IDs estáveis por forma.
- `setLetterFamily` configura frente/lateral/fundo compatíveis: backlit com frente/lateral metálicas e fundo acrílico; ACM com face plana ACM/router, borda metálica separada e fundo PVC; polymeric com frente acrílica, borda polimérica/manual-cut e fundo PVC. Não há friso/dobra inventado em curva ACM. Famílias planas preservadas.
- `depthMm` continua largura física da borda, separada da espessura. 30/75/150 mm mudam profundidade, faixas e áreas.
- `faceClearanceMm` recua a face por distância perpendicular, amplia vazados e preserva lateral/fundo nominal. Topologias inválidas são bloqueadas. Nos contornos serifados O/B/A, pequenos laços invertidos gerados pela aproximação são eliminados somente quando menores que 1% de folga²; divisão significativa da peça continua rejeitada. `standoffMm` é apenas validado; cálculo estrutural de afastadores não existe.

## Verificação

- Testes de importação e motor: 37 passaram após os ajustes; conjunto existente permaneceu passando.
- Regressão específica de folga em B reproduzida em teste falhando, causa rastreada a laço invertido de 0,000253 mm² na aproximação da curva; teste passou após correção. A tinha laço de 0,000459 mm². Corte não é liberado por esta tolerância de cálculo.
- Testes cobrem escala ausente, mudança de unidades, curvas/arcos, scripts/recursos externos/texto, contornos abertos, sobreposição/contato, vazados, ilhas, dados malformados, JSON, assinatura, espessura/profundidade, materiais/famílias e folgas colapsadas.
- Lint dos arquivos novos/alterados passou. Integração visual no navegador, documentos e suíte final são conferidos pelo agente principal com os demais módulos.

## Limites explícitos

- Importação limitada a contornos que o parser realmente entende. PDFs, CDR, AI, imagens, fontes embutidas, SVG avançado, DXF splines/blocos exigem conversão prévia.
- Curvas são aproximadas em segmentos (Bézier 32 subdivisões, círculos/arcos até 96 por volta); não há tolerância CAD certificada. Reavaliar no CAM conforme fabricação.
- Geometria e desenvolvimento permanecem nominais onde compensações não foram informadas. Espessuras iniciais são valores de estudo, não equivalência automática a chapa 24.
- Compatibilidade: projetos v1 cegos sem `artwork` continuam usando `side` como face, como no motor original; projetos novos usam face própria validada. Assinatura do motor atualizada para letters-2.
- Nenhuma publicação, instalação de dependência, commit ou escrita no Mubisys.
