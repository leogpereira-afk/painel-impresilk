# Letra Caixa · pesquisa de fabricação e revisão do fluxo

Consulta: 17/10/2026. Escopo: preparação da fabricação na prévia local, incluindo arte vetorial importada. Fontes primárias de fabricantes; sem dados de clientes. Leitura de páginas e documentos, sem afirmação de ter assistido integralmente a vídeos. A inspeção de código abaixo é um retrato anterior à integração da v5 e não é uma auditoria do estado final.

## O que as fontes sustentam

### Componentes e ordem de montagem

A SignFab descreve uma letra com fundo recortado, lateral conformada, união, pintura, iluminação e face translúcida. Sua página de produtos também diferencia face, acabamento de borda, fundo, lateral, montagem e molde em tamanho real. Isso sustenta a separação dessas peças e etapas na interface. Os exemplos do fabricante são predominantemente de alumínio: suas espessuras, larguras e métodos não são parâmetros para a letra galvanizada da Impresilk. Fontes: [descrição de fabricação](https://signfab.com/frequently-asked-questions/) e [especificações por família](https://signfab.com/sign-products/channel-letter/).

A UFB apresenta um conjunto de face, acabamento de borda, lateral, iluminação, fundo, arte e fixação, variando conforme o projeto. A leitura confirma a necessidade de mostrar componentes distintos no desenho e de associá-los às operações. Não foi encontrada nessa página uma fórmula universal de folga ou emenda. Fonte: [Channel Letters · UFB Fabrication](https://ufbfab.com/channel-letters).

### Corte: material e processo

A Trotec apresenta MDF e acrílico entre os materiais processados em máquinas CO₂. A capacidade de corte depende de máquina, material e espessura; não transferir suas tabelas para equipamentos não identificados. Usar isso para a seleção do processo, preservando parâmetros de potência, velocidade, foco e exaustão como dependentes do procedimento de oficina. Fontes: [MDF](https://www.troteclaser.com/en-ca/laserable-materials/laser-cutting-mdf) e [máquinas e materiais](https://www.troteclaser.com/en-ca/laser-machines/laser-cutter).

A Trotec inclui PVC na relação de materiais inadequados para processamento a laser. O bloqueio PVC→laser deve permanecer tanto na interface quanto no motor e nos documentos. Material polimérico sem identificação também não pode herdar autorização de corte de acrílico. Fonte: [materiais inadequados para laser](https://www.troteclaser.com/en-nz/resources/faqs/unsuitable-materials-laser-processing).

A Palram cita corte, fresagem/router, fixação e colagem em sua linha de PVC expandido PALIGHT. A 3A Composites também lista router para SINTRA. Essas referências apoiam o caminho PVC→router, sem determinar fresa, avanço, rotação, adesivo ou capacidade da máquina. Fontes: [PALIGHT](https://www.palram.com/us/product/palight/) e [SINTRA](https://3acompositesusa.com/products/sintra/). O PDF SINTRA_Fabguide0725.pdf apareceu na busca, mas sua abertura retornou erro; não foi usado como se tivesse sido lido integralmente.

A TRUMPF descreve corte de chapas metálicas com suas máquinas TruLaser fiber e relaciona processo, material e tecnologia da máquina. A documentação reforça que o arquivo de contornos não substitui a configuração de processo. Não foi validada nesta pesquisa uma tabela específica de parâmetros para o galvanizado, espessura e máquina da Impresilk. Fonte: [TruLaser 5030/5040/5060 fiber](https://www.trumpf.com/en_US/products/machines-systems/2d-laser-cutting-machines/trulaser-5030-fiber-5040-fiber-5060-fiber/).

### Laterais, curvas e emendas

A Varisigns mantém instruções distintas para calibrar alimentação, dobra, intervalo entre entalhe e dobra e compensação de arco. A descrição textual explica que deslocamentos de arco ou alimentação podem produzir comprimentos ou posições incorretos. Consequência para o simulador: medir perímetro não equivale a produzir programa validado de conformadora. Origem, sentido, referências, comprimento nominal e acréscimos devem ser visíveis, enquanto a compensação precisa de procedimento específico. Fonte: [tutoriais oficiais de calibração](https://www.varisigns.com/tutorials/). Os vídeos vinculados não foram assistidos integralmente e seus parâmetros não foram transcritos.

O documento ALUCOBOND diferencia borda cortada, fresagem/dobra e acabamento de borda. Seus exemplos possuem condições específicas de produto, espessura e geometria. Portanto, não transformar marcações de contorno de uma letra em frisos V nem transportar o desenvolvimento de uma bandeja ACM para uma letra curva. Fonte: [ALUCOBOND · Edge Processing](https://www.alucobond.com/files/downloads/produkte/en/ALUCOBOND_Edge_bending_EN.pdf), páginas 2–3 do PDF (índices 1–2).

## Proposta de fluxo para a interface

Esta seção é recomendação de produto baseada na leitura e no código, não um procedimento industrial aprovado.

1. **Conferência da arte:** origem do arquivo ou fonte, revisão, largura/altura, contornos externos, vazados, unidade e confirmação de escala. Arquivo importado entra no mesmo motor das letras digitadas.
2. **Preparação do corte:** separar face, fundo e faixas por processo, material, espessura, SKU e lote. Mostrar quantidade e IDs. A prancha de peças isoladas é diferente do arranjo na chapa.
3. **Corte das faces/fundos:** apresentar contornos reais e vazados com os respectivos IDs. Folga de encaixe, compensação do corte e rota de ferramenta são conceitos distintos.
4. **Corte das faixas:** exibir comprimento nominal, compensação informada, sobreposição por fechamento, comprimento bruto e largura bruta. Distinguir profundidade do corpo, espessura do material e aba adicional.
5. **Conformação:** ligar a faixa aberta ao contorno correspondente. Mostrar REF 0, sentido de percurso, laterais externas/internas e posições das emendas. Referências geométricas não são linhas de corte, vinco nem parâmetros de dobra.
6. **União e prova de encaixe:** listar processo selecionado, emendas, encontro com fundo e encaixe da face. Exigir conferência de oficina; não pressupor que uma seleção de método valida compatibilidade.
7. **Acabamento e pintura:** manter preparação, camadas, cura e superfícies aplicáveis vinculadas aos componentes.
8. **LEDs e ligações:** preservar o planejamento elétrico da v4 e conferir o conjunto com face/fundo da mesma revisão.
9. **Fechamento e controle:** conferir dimensões, encaixe, identificação, acabamento, iluminação quando aplicável e acesso para manutenção.
10. **Molde, separação e instalação:** desenho de posicionamento, peças e materiais separados por IDs, pendências e ficha de instalação vinculada à O.S. informada, sem tratar vínculo local como gravação no ERP.

MDF, acrílico e PVC planos devem pular conformação de laterais metálicas e iluminação quando não fizerem parte da família. Chapas para corte devem preservar as orientações físicas; a apresentação explodida não altera a fabricação.

## Achados concretos anteriores à v5

### P1 · Arte substituída pode reutilizar emendas de outra geometria

`importers.mjs` atribui `shape-1`, `shape-2` etc. `engine.mjs` deriva os IDs do projeto, posição e sourceId. `VectorImportPanel.jsx` altera apenas `artwork`; o plano antigo de emendas permanece.

Reprodução somente em memória, com dados fictícios: retângulo SVG 100×100 mm substituído por 200×100 mm no mesmo projeto. O ID da faixa ficou igual, o perímetro passou de 400 para 600 mm e a emenda antiga em 50 mm foi aplicada sem erro nem aviso específico de troca de geometria.

Recomendação: invalidar origens/emendas e confirmações ao substituir ou redimensionar arte, ou vincular os ajustes à assinatura dos contornos. Não usar o nome do arquivo como identidade. Um aviso genérico para conferir emendas não indica que elas pertencem à geometria anterior.

### P1 · Curvas aproximadas não têm tolerância final comprovada

`importers.mjs` usa 32 subdivisões para Béziers e 96 por circunferência; `engine.mjs` também amostra curvas tipográficas. A mesma quantidade de segmentos aplicada a projetos maiores aumenta o erro absoluto. O aviso atual é verdadeiro, mas o desenho de fabricação não pode prometer tolerância exata.

Recomendação imediata: preservar aviso nos desenhos e evitar promessa de arquivo pronto para máquina. Evolução: amostragem adaptativa em milímetros, tolerância geométrica explícita, limite de complexidade e teste de convergência do perímetro/área, antes de liberar desenvolvimento preciso.

### P2 · Origem e fechamento precisam ser legíveis no contorno

O desenvolvimento começa em `ring[0]`, que pode ser um ponto arbitrário escolhido no arquivo. A compensação global é distribuída proporcionalmente entre segmentos, sem simular deformação, raio ou retorno elástico.

Recomendação: origem ajustável por contorno, sentido explícito, marca da emenda de fechamento e vínculo segmento↔trecho do contorno. Informar a distribuição proporcional como convenção de cálculo do estudo, não como modelo físico.

### P2 · Prancha de peças não é plano de chapa

`fabricationSVG` desenha peças em linhas, sem nesting. `nestLetters` utiliza envelopes retangulares conservadores. O desenho real de cada letra pode ser sobreposto ao seu envelope na chapa, mas isso não transforma o algoritmo em encaixe de curvas/vazados.

Recomendação: duas saídas nomeadas — desenho de conferência e plano de chapas. No plano, destacar contorno, envelope reservado, refilo, separação, rotação, IDs, peças não alocadas e faixas ainda nominais. Manter identificação do processo em cada chapa.

### P2 · Identidade de materiais nas faixas

A criação de `result.strips` copia material/espessura/operação, mas não SKU, fabricante, lote ou direção. `nestLetters` tenta consumir esses campos. Caso a face metálica e a lateral tenham o mesmo material/espessura, a identidade comercial incompleta pode aproximar peças de estoques distintos.

Recomendação: propagar a identidade completa da especificação da lateral ao desenvolvimento, plano e documentos. Separar a lista de corte por processo, material, espessura e identidade de estoque relevante.

## Casos de aceite recomendados

- Arte SVG fictícia com um contorno externo e um vazado: face, fundo e duas laterais ligados aos mesmos IDs.
- DXF em centímetros convertido para milímetros: dimensões, perímetros e plano mantidos após salvar/reabrir.
- Substituição por arquivo diferente de mesmo nome: não reaproveitar emendas confirmadas silenciosamente.
- Mudança de largura da arte: invalidar ajustes dependentes da geometria; não escalar sobreposição ou largura de chapa automaticamente.
- Origem perto do fim do perímetro: percurso fecha corretamente sem segmento negativo ou repetido.
- Múltiplas emendas: soma dos comprimentos nominais igual ao perímetro; acréscimo por fechamento contabilizado uma única vez por segmento.
- Lateral 75 mm com aba informada de 12 mm: largura bruta 87 mm, sem inventar raio ou alívio.
- Compensação/sobreposição ausentes: estudo nominal identificado; não apresentar consumo final.
- Peça girada 90° no plano: contorno e envelope coincidem, IDs preservados.
- Arte plana PVC: router; não emitir rota laser. Cega: sem LEDs. ACM: nenhum friso V automático não validado.
- Exportação: CORTE separado de referências e anotações; projeto/revisão/unidade visíveis; sem G-code ou promessa de CNC validado.
