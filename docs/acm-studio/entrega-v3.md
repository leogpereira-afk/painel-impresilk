# ACM Studio v3 — entrega e publicação

Implementação: 17–18/10/2026. Base: 3cd2ad4. Ramo: codex/acm-studio-20261017. Publicação autorizada pelo dono em 18/10/2026; em preparação. Os estados locais abaixo registram a sequência de validação, anterior à autorização. Sem migração ou escrita em dados de produção.

## Complemento — acabamento e furos nas abas

Solicitação confirmada pelo dono: bandeja dobrada e furos somente nas abas. Implementado localmente:

- Entrada Projeto → Acabamento: forma da peça, junta, fixação e exposição independentes. Escolhas antigas ficam por confirmar, sem apagar medidas; chapa plana remove dobras somente por comando explícito com histórico.
- Furos automáticos no desenvolvimento da aba selecionada (operação 1–4 ou borda sem furação). Sem aba válida, nenhum furo automático. Frente sem projeção desses furos; fita nos apoios e furos explícitos de importação preservados.
- Mapa abre no verso com origem, coordenadas, borda/operação e diâmetro informado. Botão Enquadrar ajusta a peça inteira; zoom amplia ambos os eixos. Cálculo, 3D, SVG/DXF e cadernos seguem a mesma coordenada.
- Sem dupla soma de aba/espelhamento; contagem no caderno conserva parafusos das abas; limite global de 30 mil posições. Troca de sistema ou migração de padrão legado invalida conferência anterior. Reconfirmar grava explicitamente o padrão nas abas em todos os escopos, preservando detalhes.
- Referências dos três vídeos na biblioteca, com disponibilidade de transcrição identificada. Não foram adotadas medidas de fixador ou fita a partir de áudio indisponível.

Verificação atual: 954 testes passaram, zero falhas/ignorados; build de produção e prévia aprovados; ESLint sem erros (aviso preexistente de Agenda). Conferência independente corrigiu carga de rascunho, aprovação legada, contagem da montagem, limite global e aviso falso quando todas as peças são planas via override. SSR e callbacks adicionais cobriram confirmação global/peça/face e mapas com aba, sem aba e importação plana.

Navegador: escolhas preservadas após recarregar; frente com zero círculos de furação automática; verso com pontos identificados por aba/dobra; 3D carregando sem erros; largura de 390 px sem transbordamento global e desenho a 100% enquadrado em caixa de 388 px. Nenhum erro JavaScript observado. Prova visual local: /tmp/acm-acabamento-flanges.png.

Limites: trata-se de distribuição geométrica; cantoneiras, contato com estrutura, capacidade e ancoragem permanecem pendentes de especificação. Transcrição integral do vídeo de juntas consultada; os vídeos de parafusos e fita foram consultados visualmente, sem afirmação de análise integral do áudio. Sem publicação nesta rodada. Prévia: http://127.0.0.1:4306/revisao-local.html#/ferramenta-ia?ferramenta=acm&acm=finish .

## Entrega anterior preservada

- Acessos diretos para plano de chapas ACM, plano do quadro de metalon, parafusos/furos, dobras e importação técnica. Planos abrem no topo, sem exigir atravessar uma cena 3D.
- Plano ACM pelo verso: corte preto, canais vermelhos, furos azuis; controle de camadas, zoom, seleção de peça e desenvolvimento detalhado. Formatos 1220/1250/1500 × 5000 mm e medidas personalizadas, estoque, refilo, separação e retalhos junto ao plano.
- Até quatro dobras encadeadas por borda, com atalhos de uma e duas dobras, comprimento, giro, sentido, compensação explícita, seção nominal e atualização de desenvolvimento/3D/exports. Compatibilidade com bordas numéricas antigas preservada.
- Plano independente do quadro de metalon: perfis externos e internos, apoio/profundidade, ponta longa/curta, corte A/B, close do encontro, distribuição nas barras, sobras e CSV. Exportação de serralheria não depende do nesting ACM.
- Mapa de fixações amplo com contagem por peça/apoio, fita/parafusos/híbrido e coordenadas no verso. Sem Ø explícito permanece posição informativa; diâmetro nominal de parafuso não determina a furação.
- Importação local SVG/DXF plano com unidade/escala/tolerância, camadas explícitas, diagnóstico, prévia e confirmação. Preserva o estudo da fachada e sua revisão antes de aplicar modo técnico.
- Biblioteca técnica original dos dois PDFs: fontes/páginas, evidências e lacunas no estudo, divergências entre referências e dados adicionais de lote, direção, preparo, interfaces, vedação, transporte, peso informado e manutenção. Síntese completa em inteligencia-tecnica-fontes-20261017.md.
- Formulários com edição numérica antes de recalcular, validação local e retenção de unidade/escopo ao alternar áreas. Layout 3D continua penúltimo; planejamento da instalação, armazenamento por revisão e consulta às O.S. preservados.

## Verificação da etapa anterior

- 936 testes passaram, zero falhas, zero ignorados: cálculos comerciais, ACM, componentes puros, backend ACM, consulta de O.S. e acessos. Log local: /tmp/acm-v3-final-tests.log.
- Build de produção e build de prévia concluídos. Aviso do Vite para chunk 3D acima de 500 kB; carregamento permanece sob demanda.
- ESLint de src: zero erros; um aviso preexistente em Agenda.jsx:168. Arquivo de importação revisto novamente após ajuste apenas de cores. git diff --check sem problemas.
- Revisão independente corrigiu perda de estado entre áreas, caminho de PNG sem viewport e captura incidental que poderia bloquear a navegação. Ao final, nenhum achado acionável remanescente nessa revisão.
- Navegador em ambiente com dados fictícios: duas dobras atualizando envelope; escopo por peça preservado; fita trocada por parafusos com contagem; Ø explícito e tabela de coordenadas; CSV de metalon baixado/arquivado e conteúdo conferido; mudança 1500→1220 alterando arranjo; SVG com curva/furo/sulco diagnosticado, confirmado e aplicado; retorno à fachada; campo obrigatório vazio não altera a geometria; cm preservado ao passar por Instalação e Layout 3D; biblioteca com fontes; zero erros JavaScript registrados nesses cenários.
- Celular 390 × 844: largura da página 390 sem transbordamento horizontal global; desenho e ferramentas acessíveis, zoom de 100% para 125%; menus possuem rolagem própria.

## Limites reais

- Múltiplas dobras têm geometria nominal e verificações de colisão; não recebem a calibração válida de uma dobra simples. Raio real, compensação, interferência por espessura e sequência exigem corpo de prova e conferência do processo.
- Importação suporta geometria 2D compatível. Não desenvolve automaticamente calandragem, superfícies curvas espaciais ou modelos 3D. Bytes do original não fazem parte do backup; ele contém nome, parâmetros e geometria confirmada.
- Encaixe conserva envelopes e sentido de acabamento; é o melhor arranjo encontrado pelo algoritmo, não prova de ótimo global. SVG/DXF são desenhos, não G-code.
- Distribuição de parafusos/fita é quantitativa/geométrica, não dimensionamento de vento, carga, ancoragem ou capacidade. A biblioteca não aplica parâmetros dos manuais como regras universais nem concede liberação técnica.
- PDFs originais e suas ilustrações não foram copiados ao repositório público. Não houve ativação de IA remota nem novo serviço em nuvem.
- Prévia revisada em http://127.0.0.1:4306/revisao-local.html#/ferramenta-ia?ferramenta=acm&acm=nesting . A porta 4305 é a sessão antiga; a conferência desta rodada ocorreu em 4306. Publicação depende da autorização do dono para esta versão.


## Complemento: escolhas e configurações simples — 18/10/2026

- Acabamento em quatro perguntas com cartões selecionáveis: tipo de peça, junta, fixação e ambiente. Tipos especiais preservados; limpar escolha e explicações em detalhes recolhidos. Seleção não altera medidas ou dobras implicitamente.
- Dobras mostram o tamanho de cada aba e atalhos de 20/30 mm. Ângulo, sentido e compensação continuam editáveis em Mais opções; o resumo exibe a configuração atual mesmo fechado.
- Fixação em três escolhas diretas. Distância entre furos, distância ao canto e diâmetro ficam visíveis; operações por borda, fonte e cadastro técnico ficam em grupos recolhidos. Avisos e conferência continuam disponíveis.
- Selecionar a opção atual não altera a conferência nem cria histórico. A escolha inicial de fixação é uma ação atômica. Enter confirma uma medida uma única vez, permitindo desfazer em um clique.
- O diâmetro legado é exibido pelo valor efetivo; editar ou limpar elimina o fallback antigo no mesmo update. Escopos global, peça e face preservados, sem editar outras peças indevidamente.
- Verificação: 962 testes passaram, incluindo oito novas regressões de interface. Builds de produção e revisão concluídos. Lint sem erros; aviso anterior em Agenda.jsx e aviso de tamanho do módulo 3D continuam existentes. Browser desktop 1280 px e celular 390 px: teclado, detalhes, troca de fixação, cálculo correspondente, desfazer, restauração de rascunho e largura sem transbordamento. Sem erros JavaScript observados.
- Somente prévia local; não publicado. Motor de fabricação e exigências de conferência técnica preservados.

## Verificação para publicação — 18/10/2026

- Autorização: “pode subir essa versão simplificada do ACM”.
- Base conferida por fetch: origin/main 3cd2ad4, idêntica à base local, sem conflitos ou alterações alheias.
- 962 testes de cálculo, ACM, componentes, consulta de O.S. e acesso aprovados. 1.602 regressões gerais: 1.600 aprovadas no ambiente restrito; duas bloqueadas por `listen EPERM` em localhost aprovadas na repetição do arquivo de sete casos fora desse isolamento.
- Build oficial com BASE_PATH=/painel-impresilk/, 15 verificadores e diff aprovados. Lint sem erros, somente aviso preexistente em Agenda. Permanece aviso de tamanho do módulo 3D, carregado sob demanda.
- Apenas arquivos da tarefa. Bibliotecas ACM compartilhadas alimentam o navegador; endpoint futuro permanece fora da pasta publicada. Nenhuma alteração de SQL ou ativação remota.
