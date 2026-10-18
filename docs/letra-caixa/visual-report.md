# Visualizador de letras — entrega local

API: `LetterViewport({ project, result, selectedId, onSelect, onCapture })`. `onSelect(componentId)` vincula cena/alternativa 2D à lista externa. `onCapture(dataUrl)` recebe PNG e o botão também baixa `letra-caixa-previa.png`.

`result.components` usa IDs estáveis, `role`, `x/y/z`, `thickness`, `depth` e `contours:[{outer:[[x,y]],holes:[[[x,y]]]}]` nominais em mm, Y para cima. Faces extrudam de z até z+thickness; laterais percorrem contornos externos e vazados de z até z+depth. Faixas em result.strips são quantitativos separados; não renderizam placas retangulares na montagem. A parede tem cor de fundo e plano opcional com bordas, explicitamente ilustrativo, dimensionado por margem de apresentação e sem presumir levantamento.

Aparência: `project.appearance.{front,side,back,wall,finish,overrides}`; override por componentId com `{color,finish}`. Acabamentos visuais matte/satin/semigloss/glossy/metallic. Cores não definem tinta técnica. Todos os estados de câmera, explosão, visibilidade e transparência são internos ao viewport; modelo nominal nunca é modificado.

Disponível: sete vistas, enquadramento inclusive portrait, giro/deslocamento/zoom por OrbitControls, seleção de componente sem reiniciar câmera, explosão em mm apenas visuais, transparência, filtros de frente/lateral/fundo, PNG e alternativa SVG frontal por teclado/toque. Falha ao criar WebGL ativa 2D. Backlit mostra aviso explícito sem alegação de fotometria ou iluminação elétrica validada.

Compartilhamento real ACM/letras: escala, direções e cálculo de enquadramento vêm de scene-geometry.mjs; viewportGeometry.mjs mantém reexports compatíveis. Disposal compartilhado é utilizado por ambos, com deduplicação de texturas/geometrias/materiais. A transação sem overlays também foi extraída, mantendo os testes ACM.

Limites: paredes laterais são superfícies nominais sem espessura física e sem compensação CAM; não há desenvolvimento fictício. Elétrica, fios/fontes/fixadores detalhados, fotografia calibrada não são simulados neste incremento. A edição da paleta ocorre na página integradora. Em 2D a captura é frontal nominal e não aplica explosão. Sem validação visual por navegador nesta subtarefa; a integração deve verificar desktop/mobile e arquivos baixados.

Verificação em 17/10/2026: 15/15 testes focados (scene-geometry e regressão viewportGeometry ACM), lint dos quatro arquivos JS/JSX sem erros/avisos e build Vite concluído (aviso de chunk ACM >500kB). O build foi executado antes de a página LetraCaixa integrar este componente; o módulo JSX foi inspecionado pelo lint. Nenhum deploy, commit ou dado real.

## Complemento visual

Cotas gerais nominais width/height: linhas e rótulos 3D em mm, legenda compacta permanente enquanto habilitadas e dimensão 2D. IDs opcionais com sprites legíveis e lista de botões acessíveis para selecionar componentes, inclusive camadas planares. Plano ilustrativo de parede opcional com contorno; nenhum tamanho físico de parede é deduzido. Seleção não redefine a câmera. O PNG 3D inclui cotas/IDs/plano visíveis; no fallback PNG as cotas e IDs são anotados em texto. `layer-*` herda appearance.front, inclusive override por componentId, tanto em 3D quanto em 2D/PNG.

Complemento verificado com 15 testes passando e lint focal limpo. Visual no navegador integrado permanece verificação da entrega principal.
