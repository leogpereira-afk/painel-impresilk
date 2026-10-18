# ACM Studio — entrega local v2

**Atualização posterior:** esta versão foi publicada e a consulta de O.S. foi conferida em produção. Veja [publicação e verificações](publicacao.md). As declarações de “não publicado” abaixo registram o estado da prévia antes dessa autorização.

A prévia local de 17/10/2026 incorpora estrutura independente, plano de barras, fixações detalhadas, planejamento da instalação, documentos de oficina e Layout 3D. A navegação tem sete abas: **Projeto → Estrutura → Corte ACM → Fixações → Instalação → Layout 3D → Documentos**. Layout 3D permanece na penúltima etapa.

**Não houve publicação, aplicação de SQL, ativação de servidor remoto ou provedor de IA.** Não houve fabricação física, calibração da oficina ou validação estrutural nesta entrega. Os estudos usados na conferência são fictícios; dados reais dos anexos não foram acrescentados ao repositório.

Este documento atualiza a [entrega anterior](entrega.md), preservada como baseline histórico. As limitações anteriores sobre estrutura e composição sobre foto devem ser lidas com as alterações abaixo. Não é uma declaração de atendimento irrestrito a toda a [especificação aprovada](especificacao-aprovada.md).

- Clone local: `/tmp/painel-acm-studio-20261017`.
- Ramo: `codex/acm-studio-20261017`.
- [Abrir a prévia local](http://127.0.0.1:4305/revisao-local.html#/ferramenta-ia?ferramenta=acm), enquanto o servidor de desenvolvimento estiver em execução.

## Estrutura e corte do metalon

Novos projetos usam o quadro independente da paginação do ACM. Projetos antigos conservam a estrutura anterior até a ativação explícita do novo modelo. Alterar os módulos do ACM não recria automaticamente o quadro como apoios particulares de cada peça.

O cadastro distingue grupos externos horizontais/verticais, internos horizontais/verticais e reforços, com ajustes por face e elemento. Cada perfil contém dimensões, orientação da face de apoio, profundidade, parede em mm, bitola informada, material, SKU e acabamento. A bitola não é convertida automaticamente em espessura ou resistência.

Encontros retos descontam as seções efetivas conforme o elemento contínuo. Cantos a 45° têm contornos, pontas longa/curta e cortes A/B; combinações incompatíveis são bloqueadas. Aberturas recebem reforços e dividem membros quando necessário. Há detecção geométrica de sobreposição entre perfis e de interferência entre quadros de faces diferentes. Essas verificações não são análise de cargas ou certificação da ligação.

O plano de barras usa comprimentos de corte, perda da serra, projeção do corte a 45°, refilos e respectivas perdas, barra comercial, retalhos identificados e sobra. Peças que não cabem são expostas, sem emenda automática. O reaproveitamento de retalhos exige identidade compatível de material, SKU, parede e acabamento. Comprimento usado, perdas e sobra reconciliam com o estoque.

A tela e o caderno incluem lista técnica com material, chapa/bitola, DIM, orientação, medida, quantidade, cortes A/B e barra, além do quadro, ampliações dos encontros e plano das barras. O orçamento mantém perfis e produtos distintos separados; preço ausente continua pendente.

## Fixações e produtos

São suportados fita, parafusos e sistema híbrido. A distribuição usa as faces reais dos apoios; fitas não ultrapassam o contorno do metalon e furos com diâmetro especificado precisam caber no apoio. Incompatibilidades entre espessura do ACM, fita e plano de contato são expostas. A aplicação pode ser feita no padrão do projeto, na peça selecionada ou em lote nas peças atuais de uma face. Após remodular, é necessário conferir as novas peças e os overrides existentes.

O cadastro de parafuso distingue fabricante, código, cabeça, diâmetro nominal, comprimento, material, revestimento, arruela, função, preço e diâmetro de furação. **Diâmetro nominal do parafuso não determina o furo.** Sem diâmetro explícito, os documentos mantêm somente marcador informativo.

A fita tem largura, espessura, comprimento comercial do rolo, perda de compra, preparação, substrato, função e preços. Quantidades derivam das faixas e pontos gerados, com contagem por peça, apoio e função. O custo considera produtos por peça e rolos inteiros com a perda informada.

Fotos de produto são cadastradas pelo usuário, incorporadas como PNG/JPEG limitado e identificadas como tal. A ausência aparece expressamente; não há foto gerada apresentada como produto comercial. Fonte técnica, responsável, data, restrições e parâmetros de distribuição são editáveis. Nenhum número de capacidade ou espaçamento seguro é inferido de foto. O registro da conferência de um padrão não libera a estrutura ou a obra.

## Router e documentos

A convenção de produção é **verso, corte preto e fresa vermelha**. A geometria do motor segue a frente da peça; o verso recebe um único espelhamento horizontal, aplicado em conjunto a contornos, canais, recortes, fixações e sentido do material. A rotação do encaixe é aplicada depois dessa transformação. A referência de origem/eixos e os textos permanecem legíveis. A vista frontal é identificada como conferência visual.

Estão disponíveis:

- Caderno completo e variantes Serralheria, Router, Montagem e Apresentação, com carimbo editável.
- CSV de materiais, CSV da estrutura/cortes/barras e CSV das operações Router.
- SVG e DXF da peça em mm, com operações e informações em camadas separadas.
- PNG da cena, apresentação visual e projeto JSON com os ativos incorporados.
- Ficha de planejamento da instalação com referência da O.S., cotas, recursos, decisões e pendências.

Os cadernos incluem fotos cadastradas ou sua ausência, critérios de fixação, quantitativos e identificações da revisão. Os documentos não carregam recursos externos. Arquivos de fabricação exigem geometria e revisão compatíveis; pendências geométricas relevantes bloqueiam a geração do arquivo aplicável. Os casos de simples ausência de dado comercial ou validação técnica continuam identificados como pendência, sem aprovação presumida.

Os vetores têm escala geométrica 1:1. O caderno HTML é ajustado à página; PDF continua sendo obtido por **Imprimir → Salvar como PDF**. Não há pós-processador, G-code ou interoperabilidade com uma máquina/CAD/CAM específico validada nesta entrega.

## Planejamento da instalação

A aba Instalação registra o local, espaço disponível, altura da base ao chão, dimensões/espessura/peso da placa, posição, fotos do local, terreno, acesso, exposição, duração prevista e necessidade de usar as duas mãos. Medidas internas ficam em mm; a edição, as cotas e a ficha usam m ou cm conforme a preferência. Campos desconhecidos permanecem ausentes, sem zero presumido. Copiar medidas do ACM exige ação explícita e não preenche um peso estimado.

O posicionamento pode ser centralizado ou manual, com edição numérica e ajustes pelas setas do teclado. O motor calcula folgas à esquerda/direita/acima/abaixo e alturas da base, centro e topo em relação ao chão, além dos marcos de conferência. Quando falta a referência do chão, as margens relativas conhecidas ainda podem aparecer, mas as alturas absolutas ficam pendentes. Extrapolações são mostradas sem deslocar silenciosamente a placa de volta ao espaço.

Equipamentos são registrados com características e disponibilidade. Materiais incluem suportes, fixadores, fita, adesivos e ferramentas, com quantidade, unidade, posição, produto, finalidade, dimensões pertinentes, preparação e cura. Fotos PNG/JPEG limitadas são incorporadas localmente; a imagem não fornece capacidade, distância segura ou método de trabalho por inferência.

Posição, acesso/execução e fixação têm confirmações nominais separadas, com responsável e data. Cada registro se vincula às entradas relevantes de seu escopo e ao contexto de O.S., local, fotos e observações. Mudanças relevantes tornam a confirmação desatualizada. Trocar a unidade de exibição não altera as medidas nem reconfirma decisões. Mesmo com três registros atuais, o sistema não libera automaticamente a execução ou certifica o método.

A ficha de instalação é HTML autocontido, vinculado à revisão e ao arquivo local, com desenho proporcional, cotas, marcos, fotos, equipamentos, materiais, decisões e pendências. A impressão permite salvar PDF; não há escala de impressão garantida. O planejamento de instalação é separado da geometria de fabricação do ACM.

### Associação com O.S.

O seletor procura uma ordem existente por número completo ou cliente e permite conferir seu detalhe. A identidade do vínculo é formada por **origem (`source: painel-os`), ID da ordem e empresa**; número e cliente são informações de exibição. O vínculo fica no projeto/revisão local. Não cria ordem, não altera a O.S., não grava no ERP e não anexa automaticamente a ficha ao registro comercial. Referência de briefing não é tratada como integração automática comprovada.

A ação de consulta `consultarOrdensInstalacao` foi acrescentada ao código de `painel-comercial` e respeita o escopo comercial autorizado. **Para disponibilizar esse fluxo em produção, é necessário publicar `painel-comercial` com essa ação antes da interface.** Essa publicação não foi realizada. Consulta vazia, indisponibilidade e erro de acesso são estados distintos; falta de empresa na origem não é preenchida com uma empresa presumida. Nenhuma aplicação de SQL foi executada.

### Conferência manual da instalação

Na prévia local foram observados:

- Alternância entre m e cm, mantendo as dimensões do modelo.
- Espaço de 10 × 4 m, placa de 4 × 0,8 m e base do espaço a 0 m: margens laterais de 3 m, margens superior/inferior de 1,6 m e topo da placa a 2,4 m do chão.
- Ajuste manual pelas setas do teclado até 301 cm, com recálculo das cotas.
- Posição fora do espaço com alerta de extrapolação, sem correção automática da medida.
- Consulta de O.S. por cliente e por número, seleção da referência e ação de conferir o detalhe.

Essas verificações são da prévia local. Não demonstram implantação da nova ação comercial nem alteração de ordens em produção.

## Layout 3D

A etapa visual admite PNG/JPEG e um subconjunto seguro de SVG local. SVG aceito é rasterizado antes de entrar no projeto; referências externas, scripts e eventos ativos são rejeitados. Imagens, textos e camadas podem ser aplicados por peça ou face, com posição, tamanho, proporção, recorte, rotação, opacidade, ordem, bloqueio e ocultação.

A aplicação contínua por face atravessa as juntas sem reiniciar a arte em cada painel. Alterações visuais não mudam contornos de fabricação ou a compatibilidade da calibração. A composição permite fundo neutro ou foto incorporada, ajustes visuais, câmera, iluminação e vistas salvas. O fundo fotográfico é uma simulação manual; não realiza medição, registro fotogramétrico ou correção de perspectiva calibrada da obra.

Há captura PNG, opção de fundo transparente e apresentação HTML com imagem incorporada. Os ativos acompanham importação/exportação JSON e revisões locais, sujeitos aos limites de tamanho. A composição permanece local, sem serviço de geração de imagens ou busca remota de texturas.

## Simulador ampliado e cards

O simulador principal e o Layout 3D abrem ocupando a tela útil, com barra compacta e sete áreas de navegação preservadas. As configurações ficam em gavetas recolhíveis sobre a cena; a saída para a visão normal é explícita. Escape recolhe a configuração principal e sai do modo ampliado. O desenho continua redimensionando pelo espaço disponível, sem alterar geometria, câmera persistida ou quantitativos.

Cards, campos, ações e indicadores receberam alinhamento consistente, números tabulares e tratamento de textos extensos. As listas da busca de O.S. têm ações separadas do conteúdo. Conferência visual em 1440 × 1000 e 319 × 674 px sem transbordamento horizontal; gaveta estreita com conteúdo de 966 px rolando dentro de 456 px, alcançando os últimos campos. A revisão independente identificou e corrigiu a cascata CSS que impedia essa rolagem.

## Persistência e limites operacionais

Rascunhos, revisões e originais dos documentos continuam no navegador, separados por identidade. A revisão é preservada antes do arquivamento/exportação, com controle de concorrência. JSON transporta o projeto e seus ativos, mas não substitui o arquivo local dos documentos já gerados. Limpar os dados do navegador pode remover essas cópias; não houve sincronização com nuvem ou anexação a CRM.

O novo quadro resolve os encontros implementados em superfícies planas. Formas livres, todos os detalhes construtivos possíveis, soldas, ancoragens, deformação e cargas reais não estão validados. A simulação de dobra permanece idealizada. O plano de **barras de metalon** não habilita o processo de **corte de chapas ACM por serra**, que continua bloqueado sem processo operacional validado.

Sem corpo de prova compatível, os documentos permanecem como estudo/rascunho. Conferência geométrica, calibração da oficina, dimensionamento estrutural e liberação de fabricação são etapas distintas. O fluxo formal completo de aprovação de revisão e o serviço remoto preparado continuam pendentes de implantação e conferência próprias.

## Verificações desta entrega

| Verificação | Resultado observado |
|---|---|
| Suíte automatizada ampla | **915 testes passaram**, zero falhas, cancelamentos ou ignorados. Inclui geometria, estrutura, fixação, custos, documentos, ativos visuais, armazenamento e backend preparado. |
| Build de produção | Concluído. Cena 3D em chunk carregado sob demanda: **578,16 kB**, 150,38 kB gzip. Permanece o aviso de chunk maior que 500 kB. |
| ESLint | Zero erros e um aviso preexistente em `Agenda.jsx:168`, alheio a esta alteração. |
| Revisão independente | Cinco achados tratados e corrigidos antes da rodada final. |
| Canvas no navegador | **7/7 cenários passaram**: importação/rasterização segura, rejeição de SVG ativo/externo, continuidade entre painéis, aplicação por peça com recorte/opacidade, texto/ordem/ocultação, composição da foto e transparência PNG. |
| Instalação e O.S. | Busca por cliente e número, seleção, conferência pelo ID, persistência ao alternar abas, confirmação nominal e invalidação ao mover a placa verificadas na prévia. HTML baixado e conferido com vínculo, desenho e topo a 2,4 m. |
| Simulador e cards | Tela ampliada, gavetas, saída/Escape, navegação e rolagem em largura estreita conferidos no navegador. |
| PNG e CSV da estrutura | Download real confirmado pela interface no navegador integrado; PNG aberto e conferido visualmente, sem contorno de seleção. |

O resultado do canvas demonstra esses cenários locais de renderização e serialização. O PNG passou a ser entregue como arquivo binário, com download real confirmado na interface do navegador integrado (IAB), e foi aberto para conferência visual. O CSV de metalon também foi baixado e conferido. Essas evidências pertencem a esta rodada e não demonstram publicação, fabricação ou validação da oficina.

Paginação final em impressora/PDF, importação no CAD/CAM da oficina, fabricação física, calibração real, validação técnica, aplicação do SQL, servidor remoto e comportamento em produção não foram verificados nesta entrega. Não houve publicação.
