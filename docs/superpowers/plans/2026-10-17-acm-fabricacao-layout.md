# ACM Studio — serralheria, router e Layout 3D

Autorização: executar o prompt completo do ACM com plano de corte do metalon e Layout 3D penúltimo. Somente implementação e prévia local; não publicar, alterar dados reais ou ativar IA/nuvem.

## Contrato e execução

1. Estrutura: perfis independentes por grupo, orientação, encontros, comprimentos reais, barras comerciais/retalhos, kerf/refilos, plano e closes. Novo projeto.structure.frame opcional preserva projetos antigos até ativação explícita. Responsável: engine-v2; arquivos engine.mjs, structure.mjs, shared/acm-structure.mjs, StructureEditor.jsx e testes próprios.
2. Layout 3D: imagens raster/SVG seguro, textos, camadas, arte por peça/face, continuidade, fundo fotográfico, câmera/iluminação, exportação. Novo project.visual opcional. Responsável: layout-v2; visual-model/assets, Layout3D.jsx, ACMViewport.jsx, viewportGeometry, CSS próprios, storage para tamanho/ativos e testes próprios. Não editar página principal ou shared/acm-model.mjs.
3. Documentos/fixação: preto corte/vermelho fresa, verso, serralheria/router/montagem, catálogo foto real ou ausência, padrões e mapa. Responsável: documents-v2; documents.mjs, FixingEditor.jsx, shared/acm-fixing.mjs, testes próprios. Coordenar contrato com engine-v2.
4. Integração: seis abas Projeto/Estrutura/Corte ACM/Fixações/Layout 3D/Documentos; subetapas preservam medidas, materiais, modulação, abas, custos e calibração. Responsável: root; página, CSS principal, shared/acm-model.mjs, validação global e documentação.
5. Revisão independente, testes globais, build/lint e navegador desktop/mobile com dados fictícios; corrigir problemas e verificar arquivos reais baixados.

## Contratos entre frentes

- buildProject mantém result.structure.segments/bars/totalLength/unplaced e piece.fixing/fixings. Segmentos acrescentam grupo, SKU/material/parede/bitola, face de apoio, comprimentos/cortes/uniões. Campos legados continuam válidos.
- Shared validators independentes exportam validateStructureFrame(structure), validateVisual(visual), validateFixingDetails(fixing), retornando {code,message}[]. Root liga ao modelo; ausência de novos campos preserva legado.
- Fixing: tipo tape/screws/hybrid; produtos/metadados opcionais em fixing.screwProduct e fixing.tapeProduct; padrão em fixing.pattern. Não inferir capacidade, passo seguro ou diâmetro de furo.
- Visual: root monta Layout3D com project,result,update,onSelect,selectedId. Componente pode conter sua própria cena e captura. Não modificar geometria de fabricação ao editar arte.
- Dados reais dos anexos não entram no repositório. Nenhuma referência de fabricante falsa ou foto gerada como produto exato.

## Aceitação

Perfis mistos/orientação 20/30, encontros retos/45, orçamento sem misturar SKU, plano de barras executável dentro dos limites, preto/vermelho pelo verso, espelhamento único em peças assimétricas, mapa de fixação coerente e produtos reais cadastráveis, continuidade da arte, revisões e importação/exportação com ativos, Layout 3D penúltimo, documentos da mesma revisão, desempenho/responsividade. Processo estrutural e oficina não validados devem ser identificados, nunca certificados pelo software.

## Progresso

- Implementação local integrada nas seis abas, com Layout 3D na penúltima posição. Quadro independente, perfis por grupo/face/elemento, encontros retos/45°, plano de barras e retalhos, fixação híbrida/cadastro/mapa, documentos por disciplina e editor visual estão disponíveis na prévia.
- Convenção de produção conferida: CUT preto, FRESA vermelha, verso com espelhamento único; testes com peça assimétrica cobrem o sentido. Furo depende de diâmetro explicitamente informado, sem inferência pelo parafuso.
- Revisão independente teve cinco achados corrigidos. Rodada final ampla: 915 testes passaram; build concluído; ESLint sem erros e com um aviso preexistente em Agenda. O chunk 3D sob demanda de 578,16 kB mantém o aviso de tamanho.
- Canvas no navegador: 7/7 cenários passaram. PNG e CSV de metalon baixados pela interface do navegador integrado; PNG aberto e conferido visualmente, sem contorno de seleção.
- Entrega e limites documentados em [entrega local v2](../../acm-studio/entrega-v2.md). A entrega anterior permanece como baseline histórico.
- Sem publicação, aplicação de SQL, ativação de servidor remoto/IA, fabricação física ou validação técnica. Calibração da oficina, CAD/CAM, paginação final em PDF/impressão e conferência em produção continuam pendentes.

Complementos de instalação, associação às O.S. e simulador ampliado conferidos na entrega v2. Layout 3D permanece penúltimo entre sete abas. Novos cards e gavetas verificados em desktop e largura estreita; nenhuma publicação.
