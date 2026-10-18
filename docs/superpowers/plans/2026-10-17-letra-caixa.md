# Letra Caixa — plano da prévia local

Objetivo: executar a especificação aprovada em docs/letra-caixa/especificacao-aprovada.md, por incrementos funcionais A–F, preservando a base ACM local v2.

Arquitetura: núcleo compartilhado para medidas, geometria visual, encaixe, instalação e persistência; motor próprio de letras; página independente dentro da Ferramenta I.A. React/Vite/Three.js. Cálculos determinísticos, arquivos por revisão e dados fictícios.

Restrições globais: não publicar, não alterar ERP ou permissões, não incluir dados reais, não substituir alterações ACM, não declarar fabricação aprovada. Parâmetros técnicos ausentes permanecem pendentes. Layout 3D penúltimo. Cores visuais não são códigos de tinta. Laser de fibra para metal; CO₂ apenas material compatível, PVC bloqueado. Não definir escada pela altura. Encaixe inicial usa envelopes conservadores.

## Tarefa 1 — modelo e motor de letras
Arquivos: src/lib/letras/model.mjs, engine.mjs, vectors.mjs, testes, fontes locais licenciadas.
Texto/fonte conhecida, contornos/vazados, letras planas e camadas, construção metálica nominal, faixas por contorno, materiais/processos, áreas/perímetros e validação. Importação SVG limitada e segura; não simular suporte inexistente. API createLetterProject(), validateLetterProject(p), calculateLetters(p). Resultado com bounds, letters, components, strips, totals, errors, pending; componentes em mm com contornos locais, x/y/z e IDs estáveis. Exportar contratos no relatório de implementação antes da UI consumi-los.

## Tarefa 2 — pintura, elétrica e cards técnicos
Arquivos: src/lib/letras/finishing.mjs, electrical.mjs e testes; src/components/letras/TechnicalCards.jsx e CSS próprio.
APIs createPainting(), calculatePainting(value, areaMm2, now); createElectrical(), calculateElectrical(value). Cards recebem value/onChange, result opcional. Separar visual de ficha, primer/verniz opcionais, cura condicionada, circuitos com tensão/capacidade, percursos e consumo. Parâmetros ausentes sem números inventados. Testar condições inválidas e resultados conhecidos.

## Tarefa 3 — núcleo geométrico e visualizador
Arquivos: src/lib/fabrication/scene-geometry.mjs, src/components/letras/LetterViewport.jsx, letter-viewport.css; adaptação mínima de viewportGeometry.mjs/ACMViewport.jsx para consumir primitivas compartilhadas.
API viewport {project,result,selectedId,onSelect,onCapture}; result.components com contours:[{outer,holes}], x/y/z, thickness, role e letterId. Câmera independente da fabricação, extrusão de faces e faixas de contornos (laterais), vistas, transparência, explosão, seleção vinculada, PNG, alternativa 2D. Sem vista desenvolvida falsa. Cores appearance.front/side/back/wall e acabamento. Testar primitivas e preservar testes ACM.

## Tarefa 4 — integração da página e arquivo local
Arquivos: src/pages/LetraCaixa.jsx/CSS, FerramentaIA.jsx; src/lib/fabrication/storage.mjs e src/lib/letras/documents.mjs/nesting.mjs/testes.
Navegação lado a lado, cards compactos e edição real; O.S. pelo componente existente, instalação dentro de Layout 3D, histórico por identidade/produto, JSON, CSV, SVG/DXF, caderno de estudo e molde. Reutilizar encaixe ACM e instalação; revisar contratos específicos antes de extração. Conexão real e anexação remota não ativadas.

## Tarefa 5 — revisão e exemplos
Exemplos fictícios, cores, família plana e caixa com face acrílica, vínculo fictício via serviço de revisão, instalação 10×4m / 4×0,8m. Revisão independente de motor e integração, corrigir achados. Registrar cobertura atendida/parcial/pendente por etapa.

## Tarefa 6 — verificação e entrega
Testes focados, regressões ACM, lint, build, diff, navegador desktop e mobile, downloads e reabertura. Gerar docs/letra-caixa/entrega.md com evidências atuais e URL local. Nenhum deploy. Ensaios de oficina, CAD/CAM, fixação/estrutura e elétrica real continuam requisitos de validação externa.

## Encerramento deste incremento

Primeira prévia integrada entregue localmente. As tarefas 1–5 têm cobertura parcial funcional discriminada em `docs/letra-caixa/entrega.md`; a verificação desta cobertura foi concluída. Importação SVG não foi implementada, e as etapas de fabricação/calibração não foram declaradas prontas. Revisões independentes encontraram falhas concretas e os achados foram corrigidos e rechecados. Sem publicação.
