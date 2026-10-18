# Prompt de desenvolvimento — Letra Caixa e núcleo compartilhado Impresilk

Versão ampliada em 17/10/2026: laser de fibra para o corte metálico, letras em MDF e acrílico no laser CO₂, leitura das pranchas por processo, vínculo à O.S. e Planejamento da Instalação integrado ao Layout 3D. Este documento é uma especificação de desenvolvimento, não uma declaração de funcionalidades implementadas.

Atue como arquiteto de software de aplicações CAD/CAM para comunicação visual, com rigor em geometria computacional, desenvolvimento de peças, materiais, iluminação e documentação de fabricação. Desenvolva uma prévia local verificável do módulo Letra Caixa, aproveitando o ACM Studio existente. Pesquisa e linguagem de especialista não substituem fichas técnicas, calibração de oficina ou validação do resultado.

## Objetivo

Na Ferramenta I.A do Painel Impresilk, criar um acesso com ícone e nome “Letra Caixa”, imediatamente ao lado de “ACM Studio · 3D”. Cada produto terá sua própria ferramenta e suas regras. Compartilhar infraestrutura de projeto, visualização, materiais, histórico e documentos.

A jornada desejada é: escolher o tipo de letra; escrever ou importar o desenho; escolher a fonte tipográfica; informar dimensões; configurar materiais e montagem; calcular componentes; distribuir LEDs quando aplicável; posicionar fontes de alimentação e percursos dos cabos; gerar aproveitamento; planejar posição no local, acesso e materiais de instalação; emitir molde, orçamento e caderno técnico da mesma revisão. A equipe deve conseguir preparar a saída sabendo onde instalar, como marcar, quais materiais levar e qual equipamento de acesso foi confirmado.

Princípio central: compartilhar infraestrutura, preservar as regras de fabricação de cada produto. A IA interpreta e propõe; funções determinísticas calculam e validam. A prévia deve funcionar sem provedor de IA, com exemplos fictícios. Não publicar, alterar produção ou ativar integrações remotas automaticamente.

## 1. CONFERIR A BASE ANTES DE ALTERAR

Leia as regras vigentes do repositório e o protocolo de vez. Trabalhe fora do iCloud e preserve alterações de outros agentes. Não inclua dados reais das pranchas em repositórios, testes, demonstrações ou capturas públicas.

Referências locais:

- /tmp/painel-acm-studio-20261017/docs/acm-studio/entrega.md
- /tmp/painel-acm-studio-20261017/src/components/acm/ACMViewport.jsx
- /tmp/painel-acm-studio-20261017/src/lib/acm/engine.mjs
- /tmp/painel-acm-studio-20261017/src/lib/acm/documents.mjs

Confronte a documentação com o código atual. Apresente um inventário: recurso existente, recurso reaproveitável, adaptação necessária, desenvolvimento novo e validação pendente. Testes relatados em uma entrega anterior não comprovam o estado depois da refatoração.

Preserve React/Vite, carregamento sob demanda de Three.js, alternativa 2D, unidades, seleção, câmeras, materiais, Worker de aproveitamento, custos, histórico, armazenamento local, revisões e exportações. A existência de preparação remota não significa integração ativa. O editor completo de composição, o fluxo formal de liberação e a simulação óptica devem ser avaliados separadamente; não os anuncie como concluídos.

Extraia o núcleo incrementalmente, usando adaptadores para manter projetos ACM existentes. Evite reescrever o ACM inteiro ou copiar seus arquivos para manter dois motores divergentes.

## 2. ARQUITETURA E CONTRATOS

Organize três camadas:

- Núcleo compartilhado: unidades, IDs, coordenadas, catálogo, seleção, renderização, câmeras, histórico, armazenamento, arquivos, revisão, execução de cálculos e contrato do assistente.
- Motores de produto: ACM e Letra Caixa, com parâmetros, geometria, operações, quantitativos, compatibilidades, aproveitamento e documentos específicos.
- Interfaces: formulários e etapas próprios, mostrando apenas opções aplicáveis ao produto escolhido.

Cada motor deve expor contratos equivalentes a validar, calcular, gerar cena, gerar operações e gerar documentos, com capacidades declaradas. Vista desenvolvida só existe quando o motor produz desenvolvimento válido. Componentes visuais não devem conter fórmulas de fabricação.

Adote um envelope de projeto comum com parâmetros específicos discriminados pelo tipo de produto. Não force todos os produtos a compartilhar os mesmos campos construtivos.

## 3. PROJETO, IDENTIDADE E RASTREABILIDADE

Registrar: ID, tipo de produto, versão do schema, revisão, unidade, autoria, parâmetros, fontes de dados, componentes, materiais, operações, transformações, aparência, anexos, pendências, validações e documentos. Incluir local de instalação, referencial de medidas, posição do conjunto, pontos de marcação, equipamentos, checklist e confirmações técnicas. Esses dados pertencem ao projeto; as telas e a ficha apenas apresentam o mesmo estado.

Cada instância de letra e cada frente, fundo, lateral, reforço, LED, fixação e circuito devem possuir identidade própria e referências estáveis. Duas letras iguais na palavra são instâncias distintas. Se uma edição substituir a geometria, registrar a substituição em vez de reutilizar IDs incorretamente.

Fluxo obrigatório:
Dados → validação → cálculo → geometria/componentes → quantitativos → apresentação/documentos.

Gerar resultados identificados pela revisão de entrada, versão do motor e assinatura dos parâmetros relevantes. Descartar resultados antigos de Workers. Congelar a revisão usada por cada exportação. Tela, orçamento, molde e corte devem consumir o mesmo resultado calculado.

Alterações em texto, fonte, escala, material, profundidade, folgas, LEDs, circuitos ou fixações invalidam os resultados e documentos afetados. Mudanças em medidas do local, referencial do chão, posição, substrato, massa, obstáculos ou equipamento invalidam os cálculos e confirmações de instalação que dependem desses dados. Preservar documentos antigos como históricos, identificando que pertencem a outra revisão. Uma alteração de câmera ou cor de fundo não invalida uma fixação confirmada; usar dependências explícitas, sem exigir confirmações repetidas para alterações irrelevantes.

### 3.1. VINCULAR À O.S. EXISTENTE DO SISTEMA

Associar o projeto e o Planejamento da Instalação à O.S. existente do Mubisys, aproveitando os cadastros e vínculos já disponíveis no Painel. Primeiro verificar o contrato real da integração e o significado dos identificadores; número de O.S., ID interno de O.S., pedido, orçamento e nota são identificadores distintos. Não assumir que um endpoint ou campo exista porque foi descrito neste prompt.

Disponibilizar “Vincular O.S.” no início do projeto, com pesquisa por número e, se suportado, filtros de cliente, período e situação. Apresentar empresa/unidade, número, cliente, descrição, itens, situação e datas disponíveis para conferir o alvo antes da associação. Respeitar os acessos autenticados. Não associar por nome parecido, por ordem de retorno ou por coincidência de número entre empresas.

Persistir sistema de origem, empresa/unidade quando aplicável, tipo e ID interno do registro, número exibido, IDs dos itens selecionados e data da consulta. Guardar o vínculo ao briefing existente, quando disponível, sem criar um segundo cadastro independente do cliente.

Uma O.S. pode ter vários itens, projetos e locais de instalação. Permitir selecionar os itens e quantidades atendidos por cada projeto, sem assumir que toda a ordem será fabricada ou instalada de uma vez. Mostrar quantidade da O.S., quantidade associada e saldo conhecido; sinalizar sobreposição ou excesso de alocação. Se a integração não conhecer outros projetos vinculados, informar essa cobertura parcial em vez de garantir saldo global. Evitar duplicar o mesmo vínculo ao repetir a ação.

Registrar a unidade da quantidade do item da O.S. e da alocação. Comparar e subtrair somente quantidades na mesma unidade ou com conversão explícita e validada. Quantidade comercial, quantidade de conjuntos e quantidade de componentes de fabricação são grandezas distintas: “1 conjunto” não pode ser subtraído de “12 letras” ou de uma área em m². Sem conversão definida, manter o saldo automático pendente.

Aproveitar cliente, local de instalação, descrições, quantidades, medidas, materiais, prazo e anexos somente quando esses dados estiverem disponíveis e autorizados. Identificar a origem e a última leitura de cada dado. Endereço cadastral do cliente não é automaticamente endereço de instalação; data do pedido não é automaticamente prazo confirmado. Descrição livre não se transforma em medida técnica validada sem conferência.

Exibir a O.S. e seus itens vinculados em todas as etapas e nos documentos aplicáveis. Permitir “Abrir O.S.” apenas quando houver destino real conhecido. Cada ficha e arquivo emitido deve registrar a revisão do projeto e a versão/data dos dados da O.S. usados, distinguindo essas duas referências. Anexos sensíveis mantêm suas permissões.

Atualizações posteriores da O.S. devem gerar comparação de campos e pendências. Não sobrescrever silenciosamente medidas conferidas, documentos emitidos ou posição aprovada. Cancelamento, substituição de item ou mudança de quantidade deve sinalizar impacto e impedir tratar a revisão afetada como liberada até conferência. Retentativas, recarga da página e reabertura não podem criar vínculos duplicados.

Vincular uma O.S. ao projeto não significa alterar a O.S., emitir pedido, mudar sua situação ou anexar arquivos no ERP. Se houver recurso de anexação autorizado e implementado, conferir a gravação remota antes de declarar “anexado à O.S.”. Arquivo disponível no projeto deve ser identificado como “vinculado no projeto”, e download local como download.

Na prévia local, oferecer O.S. fictícia identificada como demonstração e testar o contrato de associação. Se o conector real não estiver ativo, informar “Integração com a O.S. pendente”; não apresentar consulta simulada como acesso ao Mubisys. Preparar o adaptador para a integração existente, sem ativar acesso remoto ou escrita produtiva automaticamente.

## 4. FAMÍLIAS CONSTRUTIVAS

Preparar regras e interfaces independentes para:

- Chapa galvanizada com face acrílica e iluminação frontal.
- Chapa galvanizada cega.
- PVC expandido recortado, maciço ou em camadas especificadas.
- MDF recortado ou em camadas especificadas, com corte em laser CO₂ conforme material, espessura e equipamento validados. Letras planas não recebem laterais de caixa automaticamente.
- Acrílico recortado/maciço e caixa acrílica montada, distinguindo os processos.
- Letra retroiluminada, com frente opaca, fundo e afastamento especificados.
- Letra em ACM fresado/frisado e conformado, inclusive curvas apenas nos métodos validados.

Cada família define componentes obrigatórios e opcionais, materiais permitidos, operações e restrições. Frente, fundo, laterais, difusores, reforços, espaçadores e fixações são independentes. Letras cegas não geram automaticamente LEDs, fontes ou cabos.

Permitir acabamentos e iluminação diferentes por conjunto ou letra quando a montagem suportar. Combinações ainda não implementadas devem ser identificadas claramente; não entregar um seletor que aparenta fabricar algo que o motor não calcula.

### 4.1. ENTENDER AS PRANCHAS E A LETRA COM FACE ACRÍLICA

As quatro pranchas enviadas representam frentes de fabricação de um mesmo trabalho. São referências para estruturar o sistema, não uma receita universal nem prova de todas as etapas executadas. Ler cabeçalhos, marcações e componentes; campos em branco não representam seleção ou liberação. O usuário confirmou que “FIBRA LETRA CAIXA” identifica o corte em laser de fibra. Utilizar o nome “Laser de fibra” na interface e nos documentos. Também confirmou a inclusão de letras de MDF ou acrílico no fluxo de laser CO₂; isso amplia o catálogo e não significa que MDF esteja selecionado no trabalho das imagens.

- “FIBRA LETRA CAIXA”: estão marcados chapa galvanizada, indicação de espessura “24”, modelo iluminado, face acrílica e borda de 7,5 cm. Há contornos e faixas laterais com marcações, além de indicação de LED frio de 1,5 W. Registrar esses dados apenas como leitura do exemplo, sem torná-los padrões. Confirmar espessura em mm, papel de cada contorno e significado de cada marca de faixa. A prancha não especifica sozinha o modelo completo do LED nem o circuito.
- “ROUTER”: aparecem peças em PVC expandido, referências a 5/10 mm e Daycell de 10 mm, além de policarbonato de 3 mm. Vincular cada desenho à sua função real: fundo, base, reforço, espaçador ou outro componente. Não presumir que todo PVC é fundo da letra, que todo policarbonato é difusor ou que todos os elementos da prancha compõem a mesma letra.
- “LASER CO₂”: aparecem acrílico leitoso de 2 mm, desenhos identificados como molde, papel assinalado e peças circulares associadas a impressão UV. Separar faces acrílicas, moldes e itens gráficos adicionais. A presença de peças com impressão não transforma a impressão UV em etapa obrigatória de todas as letras.
- “PINTURA”: aparecem os contornos do conjunto e a indicação de branco. As opções de tinta e acabamento precisam de seleção explícita; não deduzir produto, brilho, número de demãos ou tempo de cura a partir de campos não preenchidos.

As dimensões diferem entre metal, router e acrílico. Isso exige relacionar componentes e conferir encaixes; não comprova uma fórmula de compensação. As cotas sem unidade explícita devem ser confirmadas. Não medir pixels das fotografias para gerar peças.

Para cada letra ou símbolo, oferecer uma vista de composição e seção transversal: face, corpo/laterais, fundo quando previsto, reforços, LEDs, retenção da face, passagem de fios, fixações e parede. Mostrar materiais, espessuras, afastamentos, folgas e método de montagem próprios de cada componente. Não acrescentar um fundo ou uma estrutura física apenas porque é conveniente à visualização.

### 4.2. ROTEIRO DE PRODUÇÃO DA LETRA COM FACE ACRÍLICA

Preparar um roteiro configurável por componentes e dependências, a ser conferido com a oficina. A ordem das fotos não determina a ordem de fabricação. Cortes em setores distintos podem ocorrer em paralelo quando suas entradas estiverem conferidas.

1. Briefing e conferência: texto/vetor, dimensões, construção, materiais, unidade, levantamento do local e revisão de trabalho.
2. Engenharia das peças: contornos nominais e de fabricação, compatibilidade de encaixe, desenvolvimento das laterais externas/internas, emendas e identificação de cada componente.
3. Laser de fibra e fabricação metálica: corte das peças de chapa conforme compatibilidade validada; preparação das faixas, conformação e união como operações posteriores próprias. Diferenciar desenhos de referência de operações reais de corte ou dobra. A máquina de corte não realiza automaticamente conformação e montagem.
4. Router: fabricação das peças efetivamente atribuídas ao setor, com material, espessura, papel na montagem e operações definidos. Não enviar ao laser peças de PVC.
5. Laser CO₂ e operações gráficas: corte das faces acrílicas e demais peças compatíveis; moldes têm arquivo próprio. Letras inteiras recortadas em MDF ou acrílico usam roteiros próprios e não precisam passar pela fabricação metálica. Impressão UV pertence somente aos componentes que a exigem.
6. Conferência de encaixe e acabamento: prever verificação dimensional antes de fechar o conjunto; preparação e pintura das superfícies previstas, proteção das áreas que não recebem tinta e condições de cura conforme o produto. A sequência exata entre montagem, pintura e colagem vem do procedimento aprovado.
7. Iluminação e elétrica: fixação dos módulos, distribuição de circuitos, fontes, conectores e percursos documentados; manter acesso para inspeção e manutenção. Esta etapa precisa de uma prancha própria, ausente nas quatro referências.
8. Montagem final: união de corpo, componentes internos e face pelo método especificado, com folgas e condições de retenção verificadas. Não assumir que fita, silicone ou encaixe por pressão sejam suficientes.
9. Conferência de bancada: dimensões, componentes, acabamento, retenção e verificações elétricas/visuais previstas no procedimento. Registrar resultado e responsável; uma renderização não substitui esse registro.
10. Preparação da instalação: molde, posição no local, acessos, fixações, kit de materiais e ferramentas, embalagem, identificação e pendências antes da saída.
11. Instalação e entrega: registrar conferências em campo, eventuais diferenças do levantamento, versão efetivamente instalada e aceite quando realizado. Preparação da ficha não significa serviço executado.

Cada operação deve registrar componente(s), entradas, saída esperada, predecessoras, setor, responsável quando definido, situação e evidência. Distinguir “planejada”, “em execução”, “conferida” e “pendente”; não avançar automaticamente apenas porque um PDF foi gerado. Alterações relevantes de componente devem sinalizar retrabalho nos setores dependentes.

## 5. TEXTO, FONTE TIPOGRÁFICA E IMPORTAÇÃO

Usar os rótulos “Fonte tipográfica” e “Fonte de alimentação”, sem ambiguidade.

Permitir texto, múltiplas linhas, alinhamento, espaçamento entre letras e linhas, kerning, altura real desejada e largura total. Preservar proporções por padrão; distorção deve ser explícita. Diferenciar tamanho tipográfico, altura do contorno e dimensões da palavra.

Suportar fontes locais em formatos documentados, respeitando licença. Registrar arquivo, versão/hash, estilo e parâmetros necessários para reabrir a geometria. Não substituir fonte ausente silenciosamente. Tratar acentos, cedilha, pontos, glifos compostos e partes desconectadas.

Importar vetores em formatos efetivamente suportados, começando por SVG e um subconjunto DXF documentado. Não prometer suporte genérico a CDR, AI ou PDF vetorial sem implementação e testes. Informar entidades não suportadas e não descartá-las silenciosamente.

Confirmar unidade e escala; sanitizar SVG, bloquear scripts, referências externas e cargas excessivas. Imagem raster é referência visual, não contorno de fabricação. Vetorização futura exige conferência explícita.

Separar “texto/arte visual” de “converter em letras físicas”. Uma legenda sobre uma placa não pode gerar cortes automaticamente. Exibir medidas e irregularidades antes da conversão final.

## 6. GEOMETRIA E TOLERÂNCIAS

Usar milímetros internamente, com conversão explícita para o 3D. Separar coordenadas locais, montagem, fabricação, instalação e apresentação. Câmera, explosão e rotação na chapa não alteram a peça nominal.

Modelar contornos externos, vazados, ilhas e orientação. Validar números não finitos, medidas negativas/nulas, contornos abertos, autointerseções, segmentos nulos, duplicidades, vazados inválidos, áreas desaparecidas, traços estreitos e transformações inconsistentes.

Preservar curvas quando possível. Ao aproximá-las, declarar tolerância em mm e verificar convergência de área e perímetro. Não confundir tolerância numérica com tolerância de fabricação.

Separar: contorno nominal, folga de encaixe, compensação do processo, kerf/diâmetro de ferramenta, dilatação e trajetória de corte. Offsets que eliminam vazados ou geram colisões devem bloquear o componente afetado. Não compensar o mesmo corte no arquivo e novamente no CAM.

As fotos mostram diferenças entre peças, mas não fornecem uma regra geral de folga. Não deduzir unidade a partir da aparência. “Chapa 24” exige identificação do sistema de espessura e confirmação em mm; LED de 1,5 W e demais marcações são exemplos daquele trabalho.

## 7. FRENTE, FUNDO E DESENVOLVIMENTO DAS LATERAIS

Habilitar desenvolvimento de faixas somente nas construções que realmente possuem laterais conformadas. Letras maciças ou em camadas de MDF/acrílico não usam automaticamente faixas de chapa ou frisos de ACM. Em composições de camadas, identificar ordem, orientação, alinhamento, espessura individual/final, método de união e acabamento das bordas. Calcular o adesivo apenas com área de aplicação e regra de consumo cadastradas; não presumir que ele acrescenta espessura zero quando isso afeta o encaixe.

Calcular áreas líquidas, perímetros externos/internos e dimensões por componente. Frente e fundo podem ter contornos e folgas distintos por regra explícita.

Cada lateral deve indicar: contorno de origem, início, sentido de percurso, comprimento nominal, linha de referência de conformação, comprimento bruto de corte, largura/profundidade, emendas, sobreposições e acabamento final.

Desenvolver separadamente laterais externas e internas dos vazados. Exibir marcações acumuladas, curvas, quinas, pontos de mudança e identificação correspondente na montagem. Permitir revisar a posição da emenda considerando visibilidade, acesso e processo aprovado.

Não usar apenas “perímetro × profundidade” como desenvolvimento final. Não transformar cada segmento de uma curva aproximada em uma dobra física. Correções de dobra exigem material, espessura, raio, equipamento e tabela/calibração compatível; não assumir fator K universal.

Validar comprimento máximo de faixa, emendas adicionais, encontros, interferências e montagem. Separar a representação idealizada de uma dobra da comprovação de que a máquina consegue executá-la.

## 8. ACM FRESADO E CURVADO

Criar um método específico para letra em ACM. Não reutilizar automaticamente as quatro abas, alívios, canais em V, paginação ou fórmula de encapamento das bandejas de fachada.

Registrar fabricante/SKU, espessura total, lâminas, núcleo, ferramenta, geometria e lado do canal, material residual, raio, compensações, emendas e calibração. Distinguir canto localizado de conformação curva e frisos repetidos.

Não transformar espaçamentos, temperaturas, excesso de material ou compensações de um vídeo em padrão. Se faltarem regras comprovadas, permitir estudo visual, mantendo desenvolvimento e fabricação pendentes.

Pranchas devem diferenciar corte externo, fresagem, frisos, referências, dobras e acabamento. Não gerar G-code ou trajetórias de máquina sem pós-processador e processo validados.

## 9. MATERIAIS, MÁQUINAS E ACABAMENTOS

Catálogo compartilhado com material, fabricante, SKU, espessura em mm, composição relevante, cor, acabamento, frente/verso, formatos, lote, direção, preço/unidade, ficha técnica, foto/amostra e validade da informação.

Separar aparência, especificação e disponibilidade. Cor no monitor não comprova cor física ou estoque. Permitir materiais por projeto, conjunto, peça e superfície.

Criar matriz material × equipamento × operação. Router, laser de fibra e laser CO₂ são processos distintos. Bloquear PVC para processamento a laser. Outros materiais exigem compatibilidade documentada; não liberar por semelhança visual.

Organizar as rotas de corte por componente:

- Laser de fibra: peças metálicas e faixas de chapa do projeto, conforme capacidade e procedimento validados para o material e espessura. Dobra, conformação, união e pintura são operações separadas.
- Laser CO₂: letras recortadas em MDF ou acrílico, faces acrílicas e outros componentes/moldes cujo material e processo estejam validados. Distinguir peça plana, montagem em camadas e caixa montada.
- Router: componentes em PVC expandido e demais materiais compatíveis, além de corte, rebaixo e fresagem conforme a configuração validada.

Para cada máquina, cadastrar identificação, área útil, materiais e espessuras efetivamente validados, operações, ficha/manual e procedimento de oficina. Selecionar uma rota compatível não comprova que qualquer máquina daquele tipo consiga cortar a espessura informada. Não inventar potência, velocidade, número de passes, gás, exaustão ou demais parâmetros a partir de fotografias ou apenas do nome do processo.

Para MDF e acrílico, cadastrar variante/composição, espessura real, acabamento das faces e bordas, número de camadas quando aplicável, método de união, massa e condição de uso prevista. Verificar adequação ao ambiente segundo a especificação do produto; não aprovar automaticamente MDF em área externa ou úmida. Configuração sem dados permanece pendente. O motor deve calcular contornos, vazados, área, perímetro, componentes, aproveitamento e documentos dessas famílias, sem exigir LEDs ou laterais metálicas quando não fazem parte do produto.

Para pintura e colagem, registrar produto, superfície, área, número de demãos e rendimento apenas quando informados/validados. Incluir preparação e acabamento conforme procedimento aprovado. Não inventar consumo, produtividade, espessura de chapa, adesivo ou parâmetro de máquina.

### 9.1. SISTEMA DE PINTURA COMPLETO

Criar uma configuração de pintura por peça ou superfície, com opções “sem pintura”, “pintura especificada” e “a definir”. Registrar separadamente frente, laterais externas, laterais internas, verso, fundo, estrutura, suportes e afastadores. Preservar as áreas de colagem, contato elétrico, fixação, drenagem e passagem de luz que não possam receber o acabamento selecionado.

Cor e brilho são campos distintos do tipo de tinta. Cadastrar nome da cor, fabricante, linha, código de catálogo ou referência RAL/Pantone quando informada, fórmula de mistura fornecida pelo fabricante, lote e amostra física aprovada. HEX/RGB serve à apresentação; não converter automaticamente em fórmula de tinta nem declarar equivalência exata entre catálogos.

Organizar o sistema de pintura em camadas opcionais e ordenadas:

1. Preparação e limpeza do substrato.
2. Tratamento ou promotor de aderência quando especificado.
3. Fundo, primer ou seladora quando exigido pelo sistema.
4. Regularização e lixamento quando previstos.
5. Tinta de acabamento.
6. Verniz quando especificado e compatível.
7. Secagem, cura, inspeção e liberação para as etapas seguintes.

Fundo e verniz devem ter seleção “aplicar”, “dispensado conforme sistema validado” ou “a definir”, com justificativa e fonte. Não exigir verniz sobre toda tinta nem dispensar primer apenas pelo nome “galvanizado”. Não confundir fundo traseiro da letra com fundo preparador de pintura.

Cadastrar categorias de acabamento, sem declarar aplicação universal: esmalte sintético/alquídico, PU, acrílico, epóxi, sistemas à base d'água e outros produtos efetivamente usados; pintura a pó deve ter processo e ciclo próprios quando oferecida. Distinguir família química, base solvente/água, produto monocomponente/bicomponente e função de fundo/acabamento/verniz.

Cada camada deve registrar produto/SKU, ficha técnica e revisão, substratos e camadas compatíveis, cor, brilho, método de aplicação, demãos, espessura quando especificada, rendimento, diluente, catalisador/endurecedor, proporção e unidade da mistura, indução, vida útil da mistura e condições de aplicação. Não converter proporção em massa para volume sem os dados necessários. Não reutilizar parâmetros de outro produto da mesma família.

Para metal galvanizado, conferir condição da superfície e preparação do sistema específico. Para MDF, especificar separadamente faces e bordas e sua preparação; primer, tinta e verniz não comprovam por si adequação ao exterior. Para acrílico/PVC/ACM, verificar compatibilidade do acabamento e tratamento com o material exato. Nenhuma seleção deve pintar automaticamente uma face translúcida de maneira incompatível com a iluminação.

### 9.2. SECAGEM, CURA E LIBERAÇÃO PARA MONTAGEM

Registrar separadamente, quando a ficha fornecer:

- Tempo de indução após mistura.
- Vida útil da mistura (pot life).
- Intervalo entre demãos e evaporação entre etapas.
- Secagem ao toque.
- Tempo para manuseio e lixamento.
- Janela mínima e máxima de repintura.
- Secagem final, mantendo o significado adotado na ficha.
- Cura total.
- Condições para colagem, aplicação de fita, montagem, embalagem, transporte e exposição ao ambiente.

Os prazos dependem do produto e das condições declaradas: temperatura ambiente e da peça, umidade, ventilação, espessura e método de aplicação, conforme a ficha. Se houver secagem forçada, registrar ciclo e temperatura da peça, não apenas ajuste do equipamento. Sem dados compatíveis, manter previsão pendente; não interpolar ou extrapolar regras sem base técnica.

Preservar a terminologia e as condições de cada ficha: “secagem final” não equivale automaticamente a “cura total” ou a liberação para todas as etapas. Produtos encontrados na pesquisa são exemplos independentes; não combinar fundo, acabamento e verniz de referências diferentes sem compatibilidade expressa do sistema.

Registrar início/fim real de cada aplicação, mistura, lote, responsável e condições observadas. Mostrar previsão da próxima etapa e sua origem. Prazo decorrido não confirma cura: exigir conferência prevista no procedimento antes de marcar liberação. Janela de repintura ultrapassada ou mistura fora da vida útil deve gerar pendência e instrução de consultar o sistema específico, sem permitir correção inventada.

Integrar essas dependências ao roteiro e ao prazo da O.S. Distinguir prazo solicitado de previsão técnica. Não agendar automaticamente montagem, fita, embalagem ou instalação usando apenas “seco ao toque”. Diferenciar cura da pintura, cura do adesivo e desenvolvimento de adesão de uma fita sensível à pressão; são controles próprios.

Calcular consumo por camada com área real das superfícies selecionadas, unidade e base do rendimento. Identificar se o rendimento é por demão ou do sistema para não multiplicar duas vezes. Separar consumo teórico, perda explicitamente cadastrada, produto preparado, embalagem comprada e sobra. Sem rendimento confirmado, mostrar consumo pendente.

### 9.3. CORES PARA ESCOLHER NO SIMULADOR

Implementar uma paleta clicável visível no simulador, com nome e amostra de cada cor, seleção por teclado e seletor de cor personalizada. Fornecer amostras visuais iniciais: branco, preto, cinza, vermelho, amarelo, azul, verde, laranja, bege, dourado e prata. Esses nomes são presets visuais sem alegação de equivalência com uma tinta disponível.

Paleta visual inicial em sRGB: branco #FFFFFF; preto #171717; cinza #808080; vermelho #D62828; amarelo #FFD500; azul #0057B8; verde #198754; laranja #F28C28; bege #D8C3A5; dourado #C8A84B; prata #C0C0C0. Dourado e prata combinam uma cor de prévia com aparência metálica quando selecionada; o código HEX sozinho não reproduz o acabamento físico. Não criar códigos ou nomes de catálogo técnico para esses presets.

Permitir escolher por projeto, conjunto, letra, componente ou superfície. Oferecer ações explícitas de aplicar a todas as letras, apenas à seleção ou a superfícies equivalentes. Exibir separadamente cores da frente, laterais, fundo, suportes/afastadores e parede; cadastrar a cor de emissão dos LEDs em campo próprio vinculado ao modelo.

Oferecer acabamentos fosco, acetinado, semibrilho e brilho, além de aparência metálica quando aplicável. Vincular o acabamento técnico a produto/sistema confirmado; os parâmetros de renderização são aproximações visuais. Dourado/prata não definem metal, composição ou tinta por si.

Permitir consultar e filtrar cores reais do catálogo cadastrado por fabricante, linha e código, com estado de disponibilidade quando conhecido. Cor personalizada ou catálogo não mapeado permanece como proposta visual com pendência de especificação. Preservar nome/código já escolhido; não gerar código RAL/Pantone automaticamente a partir do HEX.

Mostrar a comparação antes/depois e permitir desfazer/refazer. Separar a troca de cor somente na apresentação da alteração da especificação de pintura. Ao aplicar a mudança técnica, recalcular custos/documentos afetados e invalidar a aprovação de cor correspondente. Manter uma indicação discreta de que a tela é uma prévia e a aprovação de cor depende da referência/amostra definida.

## 10. DISTRIBUIÇÃO DE LEDs

Cadastrar modelos reais, sem escolher um LED genérico por padrão: fabricante/SKU, tensão, modo de alimentação, potência/corrente, dimensões, cor/temperatura, óptica, proteção ambiental, condições térmicas, restrições de corte/dobra, limites por ramal e documentação de aplicação.

Distinguir módulo de LED, quantidade de emissores no módulo e fita medida em comprimento. Não multiplicar a potência duas vezes.

Para iluminação frontal ou retroiluminação, propor posições com base na geometria útil, profundidade, largura dos traços, material da face/fundo e regras do modelo selecionado. Respeitar vazados, bordas, reforços, fixações, saídas de fios e acesso.

Gerar IDs e coordenadas dos módulos, quantidades por letra, ramal e projeto. Permitir mover, excluir ou acrescentar módulos manualmente com recálculo e nova validação.

Não usar somente área × coeficiente universal. Espaçamento e quantidade devem ter fonte técnica e faixa de aplicação. Se os dados forem insuficientes, marcar “distribuição preliminar”, sem prometer uniformidade.

A prévia deve mostrar dia/noite e opção de halo como apresentação. Simulação fotométrica quantitativa exige dados ópticos e validação próprios. Uma textura emissiva ou bloom não constitui ensaio de iluminação. Registrar teste de amostra com face, profundidade e acabamento reais.

## 11. FONTES DE ALIMENTAÇÃO E CIRCUITOS

Construir um dimensionamento determinístico e auditável, com memória de cálculo.

Para módulos de tensão constante, quando os dados forem aplicáveis:

- Potência dos módulos = soma da quantidade de cada modelo × potência correspondente.
- Incluir controladores e outras cargas documentadas, além de perdas consideradas.
- Corrente nominal estimada = potência do circuito ÷ tensão nominal.
- Verificar potência e corrente disponíveis da fonte nas condições reais de instalação.

Separar carga, margem operacional e redução de capacidade por temperatura/montagem. A capacidade utilizável deve vir das curvas e condições do fabricante; não multiplicar fatores como se fossem independentes sem justificativa. Não adotar automaticamente margem universal de 20% ou 30%.

Selecionar fontes reais do catálogo e distribuir a carga por saídas e circuitos, verificando limites por ramal, conectores, tensão, ambiente e manutenção. Não basta dividir a potência total pela potência de uma fonte.

Cada módulo deve pertencer exatamente a um circuito alimentado. Distinguir ramais de carga em paralelo de fontes com saídas em paralelo. Bloquear interligação de saídas de fontes sem autorização técnica explícita do modelo. Tensão constante e corrente constante precisam de regras próprias.

Exibir modelo, quantidade, posição, tensão, potência nominal/utilizável, carga atribuída, corrente, ocupação e pendências. Posicionamento, ventilação, proteção ambiental e acesso devem estar documentados. A alimentação da rede, proteção e aterramento exigem projeto/revisão aplicáveis; o software não concede aprovação elétrica.

## 12. FIAÇÃO E SIMULADOR DE PERCURSOS

Permitir posicionar fontes de alimentação, caixas e passagens; desenhar percursos com pontos intermediários e obstáculos; distinguir distância geométrica direta de percurso instalado.

Representar o circuito como rede de nós e trechos. Para cada trecho, registrar origem/destino, comprimento, condutores/vias, seção, material, corrente que o percorre, polaridade, conectores e carga a jusante. Mudanças na posição da fonte ou no percurso devem recalcular os resultados afetados.

Calcular separadamente:

- Comprimento do percurso e metragem de cabo multipolar.
- Metragem dos condutores individuais.
- Fios já incorporados aos módulos e fios adicionais.
- Subidas, descidas, travessias, interligações e reservas de montagem explicitamente configuradas.
- Lista de cortes, terminais e conexões por circuito.

Não duplicar compra de cabo bipolar ao contabilizar suas duas vias. Não contar duas vezes trechos compartilhados fisicamente; contabilizar corretamente os condutores que passam neles.

Verificar queda de tensão por trecho e caminho até a carga, usando resistência documentada e corrente correspondente. Quando aplicável, usar R = resistividade × comprimento ÷ seção e ΔV = I × R, com unidades explícitas. A resistência de ida e retorno deve estar incluída; se o comprimento já representa ambos, não multiplicar novamente por dois. Ramais com derivações usam correntes por trecho, não a corrente total em todos os segmentos.

Conferir faixa de tensão nas cargas, limites térmicos, conectores, agrupamento e método de instalação. Não selecionar bitola somente por potência ou distância. Sem dados suficientes, apresentar estimativa e pendências, sem declarar dimensionamento aprovado.

Exportar diagrama funcional com fontes, ramais, polaridades e IDs. Separar rede elétrica e circuitos de saída. Não inventar cores normativas ou padrões de ligação a partir de material estrangeiro.

## 13. PLANEJAMENTO DA INSTALAÇÃO — DENTRO DO LAYOUT 3D

Criar a seção “Planejamento da Instalação” dentro de Layout 3D, compartilhada entre ACM e Letra Caixa. Cada motor fornece seus componentes, limites e regras; a seção não deve copiar medidas nem manter um projeto paralelo. Funcionar também em desenho 2D quando não houver WebGL.

### 13.1. LEVANTAMENTO DO LOCAL E DO CONJUNTO

Cadastrar largura e altura do espaço disponível — parede, muro ou fachada — e a altura de sua base em relação ao chão de referência. Identificar local, data, responsável, origem e situação de conferência das medidas. Aceitar m, cm e mm, inclusive vírgula decimal; converter para mm internamente, preservar a unidade informada e exibir unidades consistentes nas cotas. Não arredondar os valores usados no cálculo.

Para placa ou conjunto, registrar largura, altura, espessura/profundidade e massa em kg quando conhecida. Distinguir massa medida, estimada e não informada. Calcular estimativa somente com densidades e componentes conhecidos, indicando o que ficou fora. Campo vazio não equivale a zero.

Medidas provenientes do motor geométrico devem ser vinculadas à revisão, com indicação de origem. Alterar a dimensão de fabricação exige editar o parâmetro correspondente e recalcular; não esticar silenciosamente a placa na apresentação. Para letras separadas, usar o envelope do conjunto para posicionamento, preservando a posição individual e os espaçamentos. Esse envelope não representa uma placa de fundo física.

Adicionar fotos, observações, desníveis, obstáculos, acessos, interferências e áreas proibidas para furação/passagens. Separar substrato resistente e revestimento: concreto, alvenaria, estrutura metálica, drywall, madeira, ACM, vidro ou outro levantado, com espessuras e condições conhecidas.

Registrar o ponto físico usado como referência do chão, origem, eixos e linha de nível. Em terreno irregular, não tratar todos os pontos do piso como tendo a mesma altura. Cadastrar desníveis relevantes e cotas locais dos pontos de trabalho. Parede inclinada, curva ou instalação suspensa exige modelo específico; informar a limitação do modo plano.

### 13.2. POSICIONAMENTO E CÁLCULO DETERMINÍSTICO

Apresentar desenho frontal proporcional com espaço disponível, conjunto, chão de referência, origem e cotas. Oferecer centralização horizontal, vertical ou ambas. Permitir informar distância da borda esquerda até a lateral do espaço e altura da borda inferior em relação ao chão. Diferenciar claramente esse último campo do espaço livre abaixo da placa, medido a partir da base da parede.

No modelo retangular, plano e sem rotação, definir:

- W e H: largura e altura do espaço.
- B: altura da base do espaço acima do chão de referência.
- w e h: largura e altura do conjunto.
- x: distância da borda esquerda do conjunto à lateral esquerda do espaço.
- y: distância da borda inferior do conjunto à base do espaço.

Calcular com as mesmas unidades:

- Espaço à esquerda = x.
- Espaço à direita = W − x − w.
- Espaço abaixo = y.
- Espaço acima = H − y − h.
- Altura da borda inferior em relação ao chão = B + y.
- Altura do centro em relação ao chão = B + y + h/2.
- Altura da borda superior em relação ao chão = B + y + h.
- Para centralizar: x = (W − w)/2 e y = (H − h)/2.
- Quando o usuário informa a altura inferior em relação ao chão, converter para y subtraindo B.

Exemplo de aceitação: espaço de 10 m × 4 m, placa de 4 m × 80 cm, B = 0 e centralização completa. Resultado: 3 m à esquerda, 3 m à direita, 1,60 m abaixo, 1,60 m acima; borda inferior a 1,60 m, centro a 2 m e borda superior a 2,40 m do chão. Com o mesmo espaço começando 1 m acima do chão, os espaços livres permanecem iguais e as alturas passam para 2,60 m, 3 m e 3,40 m.

Permitir arrastar o conjunto no plano da parede, com atualização dos mesmos campos e cotas. Desfazer/refazer deve restaurar o estado numérico e visual. Movimento de câmera não é movimento da instalação; rotação de apresentação não altera coordenadas reais. Rotação física do conjunto só pode ser oferecida quando o motor calcular corretamente seus limites e pontos transformados.

Exibir valores negativos quando houver ultrapassagem, destacando o lado e quanto excedeu; não esconder o problema com ajuste automático. Se faltarem medidas, calcular apenas o que for determinado pelas entradas disponíveis e listar o que falta. B desconhecido não pode virar zero para apresentar alturas absolutas. Validar dimensões positivas, números finitos, colisões e limites antes da conferência da posição.

### 13.3. MARCAÇÃO, FURAÇÃO E REFERÊNCIAS

Gerar referências de bordas, centro, linha de base e pontos aprovados de fixação por peça, usando IDs estáveis. Mostrar coordenadas em relação à origem escolhida, cota em relação ao chão de referência e afastamento da parede. Oferecer vista lateral para profundidade, estrutura e espaçadores.

Distinguir ponto de referência visual, ponto previsto para conferência e furo técnico especificado. Não transformar marca de centro em ordem de perfuração sem diâmetro, finalidade e solução definida. Regiões com interferências conhecidas devem impedir posicionamento de furos nelas.

Vincular o molde às posições e referências desta seção. Alteração real de posição, dimensão ou fixação deve atualizar a ficha e sinalizar o molde afetado. Permitir registrar posição aprovada, responsável, data e revisão, sem confundir aprovação visual do cliente com validação técnica de ancoragem e acesso.

### 13.4. ACESSO E EQUIPAMENTO

Usar as alturas calculadas como informação para o planejamento. Registrar também os pontos reais das tarefas — marcação, furação, conexão, fixação e acabamento — que podem ficar acima ou abaixo dos limites da placa. Altura do topo da placa, altura do ponto de trabalho, altura da plataforma/pés e alcance do equipamento são grandezas diferentes.

Cadastrar alternativas de escada, andaime e plataforma com identificação/modelo, características documentadas, capacidade, condições de uso, dimensões relevantes, disponibilidade, inspeção e confirmação de reserva quando existentes. Mostrar fabricante/manual e restrições conhecidas; disponibilidade desconhecida não equivale a equipamento reservado.

Incluir terreno, nivelamento, obstáculos, circulação, espaço de apoio, transporte dos componentes, massa/dimensões a manusear, duração da atividade, necessidade de trabalhar com as duas mãos e acesso para manutenção. Não escolher equipamento ou comprimento seguro de escada apenas pela altura da placa, nem somar um alcance humano padrão para declarar adequação.

Apresentar os dados e pendências para o responsável confirmar o equipamento conforme instruções do fabricante e requisitos de segurança aplicáveis. Registrar a decisão, responsável, data, escopo e condicionantes. Sem confirmação, manter “Equipamento de acesso pendente”, sem impedir o estudo geométrico.

### 13.5. SUPORTES, FIXADORES, ADESIVOS E PREPARAÇÃO

Criar checklist editável com “necessário”, “não se aplica”, “a definir”, “especificado” e situação de separação para o serviço. Para cada item, registrar componente/local de aplicação, produto, unidade, quantidade, origem do quantitativo, responsável e observação.

Incluir:

- Suportes, estrutura auxiliar, trilhos, pinos e afastadores: tipo, material, quantidade, dimensões, posição e afastamento da parede.
- Parafusos, buchas, chumbadores e demais fixadores: produto/especificação, quantidade, diâmetros e aplicação conforme solução confirmada.
- Fitas: fabricante/produto, tipo, largura, espessura quando relevante, comprimento e finalidade.
- Silicone, cola para pedra ou outro adesivo: produto, finalidade, substratos, quantidade prevista e unidade; distinguir colagem, retenção auxiliar e vedação.
- Limpeza e preparação: produtos, ferramentas, tratamentos necessários, condições da superfície e verificações.
- Vedação, condições de aplicação, tempo de cura e eventual sustentação temporária, conforme procedimento e produto definidos.
- Ferramentas, consumíveis, gabaritos, instrumentos de medição e itens de acesso/proteção previstos pelo responsável.

Relacionar a seleção ao material e massa do conjunto, substrato resistente, revestimento, exposição ao sol, chuva e vento, manutenção e especificação do produto. Não recomendar fita, silicone ou cola como fixação suficiente por seleção genérica no formulário. Não inventar capacidade de ancoragem, quantidade segura de fixadores ou resistência da parede; peso isolado não dimensiona fixação.

Integrar os quantitativos ao orçamento e à lista de materiais da mesma revisão. Distinguir quantidade calculada, previsão manual, reserva explícita, embalagem comercial e quantidade efetivamente separada. Não contar novamente um suporte já presente na lista de componentes. Ausência de estoque integrado deve aparecer como disponibilidade não conferida.

Para retroiluminação, relacionar afastamento e acabamento da parede à apresentação do halo, sem promessa fotométrica automática. Integrar posições das fontes, passagens e percursos de cabos ao modelo elétrico, sem manter outra contagem independente na instalação.

### 13.5.1. TIPOS DE FIXAÇÃO DA LETRA

Separar quatro interfaces: face/acessórios no corpo da letra; corpo da letra em seu suporte; suporte no substrato resistente; e equipamentos/fontes em seus próprios suportes. A aprovação de uma interface não aprova automaticamente as demais.

Criar catálogo de soluções, habilitado por compatibilidade, incluindo:

- Pinos ou hastes traseiras com solução de ancoragem especificada.
- Pinos com afastadores para distância controlada da parede.
- Blocos ou bases de montagem ligados à letra, com pinos/parafusos compatíveis.
- Parafusos pelo fundo ou por abas/orelhas previstas na construção.
- Fixação passante com porca, arruela e acesso ao verso quando possível.
- Suportes ou cantoneiras, com fixação superior, inferior ou traseira conforme projeto.
- Trilhos ou estrutura auxiliar que recebem várias letras.
- Caixa de suporte com passagem de cabos (raceway), quando esse conjunto fizer parte do projeto.
- Encaixes e ferragens removíveis especificados para manutenção, com verificação de retenção e acesso.
- Fita de montagem especificada.
- Adesivo de montagem especificado.
- Solução combinada de fixação mecânica e adesiva, com funções identificadas e compatibilidade demonstrada.

Esse catálogo é de alternativas para avaliação, não uma declaração de adequação de todos os métodos a qualquer letra. Não somar capacidades nominais de fita, cola e fixadores como se distribuíssem carga igualmente.

Para cada ligação, registrar componente de origem/destino, método, material, produto, número de pontos, coordenadas, dimensões, afastamento, acesso de montagem/manutenção e forma de união do fixador à letra. Selecionar e destacar os pontos na cena, em vista traseira e no molde.

Na ancoragem, registrar substrato resistente, espessura conhecida, revestimento, tipo e modelo do fixador, diâmetro de furo, profundidade, espaçamentos, distâncias às bordas, torque ou cura quando exigidos pela especificação. Não tratar revestimento de ACM, reboco ou pintura como estrutura resistente sem comprovação. Não dimensionar pela massa dividida por uma capacidade genérica de fixador.

Para colagem/fita, registrar as duas superfícies reais de contato — inclusive tinta ou verniz existentes —, preparação, área/comprimento, produto, espessura de aplicação, pressão ou sustentação quando previstas, condições ambientais e prazo de desenvolvimento da ligação. Verificar cura e aderência do revestimento ao substrato; aderência ao acabamento não prova a resistência de toda a cadeia.

Usar esforços, condições e critérios do procedimento/projeto técnico aplicável, considerando exposição, afastamento e manutenção. Mostrar pendências de cálculo ou validação. Fixação removível exige espaço de operação e retenção prevista; o halo de uma letra retroiluminada não define sozinho o afastamento técnico ou a quantidade de ancoragens.

Retenção da face acrílica deverá ter especificação própria de encaixe, perfil, parafuso, presilha ou adesivo quando o método for suportado. Indicar folgas, desmontagem, drenagem/vedação e acesso aos LEDs conforme o sistema validado, sem deduzir essa solução das quatro pranchas.

### 13.6. FICHA DE INSTALAÇÃO E PREPARAÇÃO DA SAÍDA

Gerar ficha legível na tela e PDF com layout próprio, contendo:

- Identificação do projeto, revisão, O.S. e itens vinculados, briefing quando existente, local e data da consulta aos dados de origem.
- Foto do local, quando cadastrada, e desenho proporcional cotado, com indicação de aproximação quando houver montagem fotográfica.
- Medidas do espaço e do conjunto, origem/unidades, referencial do chão, posição aprovada e todas as distâncias calculadas.
- Vistas frontal/lateral e referências para marcação, fixação e passagens conforme o projeto.
- Alturas de trabalho por tarefa, terreno/obstáculos relevantes e equipamento de acesso confirmado ou pendente.
- Relação de suportes, fixadores, adesivos, consumíveis, ferramentas e componentes elétricos aplicáveis, com quantidades e situação de separação.
- Sequência prevista, pré-requisitos, preparação, cura e restrições de montagem registradas.
- Pendências antes da saída, com responsável e próxima ação quando definidos.
- Responsável pela revisão, confirmações técnicas, data da última atualização e data de geração do documento.

Usar identificação textual, além de cores, para “Medida informada”, “Calculado pelo sistema” e “Decisão técnica confirmada”. Permitir rastrear o dado à fonte e à revisão. Não apresentar estimativas como medições nem campos preenchidos como decisões aprovadas.

Oferecer conferência de saída com posição, equipamentos, materiais, ferramentas, molde e pendências. Marcação de separação do kit não comprova montagem, inspeção técnica ou conclusão do serviço. Pendências críticas impedem apresentar a ficha como pronta para execução; ainda é possível exportar uma versão identificada como rascunho.

Vincular a ficha ao projeto e à O.S. conforme a seção 3.1. Ficha PDF de consulta não é molde 1:1. Implementar e verificar a exportação PDF solicitada; se houver apenas HTML imprimível na fase intermediária, identificá-lo como tal e manter a entrega PDF pendente.

## 14. MOLDE DE INSTALAÇÃO

Criar documento específico a partir da montagem e revisão aprovadas para essa finalidade, contendo:

- Contornos e identificação de letras, acentos e partes soltas.
- Origem, eixos, nível, orientação frontal/traseira e referências físicas.
- Distâncias entre peças e até referências de instalação.
- Centros de fixação, espaçadores e passagens elétricas.
- Tabela de coordenadas e legenda de operações.
- Réguas de conferência horizontal e vertical.

Oferecer SVG/DXF em mm e molde PDF 1:1 somente quando a geração e a escala estiverem implementadas e testadas. Para impressão em mosaico, incluir folhas numeradas, sobreposição, marcas de registro e mapa de montagem.

Diferenciar impressão de apresentação ajustada à página de molde em escala real. Exigir conferência física das réguas antes do uso. Espelhamento deve ser explícito e preservar texto/legenda legíveis.

Pontes de retenção, quando necessárias ao material do molde, pertencem ao molde e não podem modificar a letra de produção. Não gerar furos técnicos quando só existe um ponto indicativo sem diâmetro especificado.

## 15. APROVEITAMENTO E PLANO DE CORTE

Reaproveitar inicialmente o encaixe por envelopes retangulares, identificado como conservador. Separar frente, fundo, laterais, reforços e moldes por material, espessura, acabamento, lote, formato e processo.

Considerar refilo, separação, compensação de corte, orientação, direção, rotação permitida, retalhos e área útil da máquina. Peça fora da capacidade deve bloquear o plano correspondente. Não dividir peças ou criar emendas automaticamente sem regra e revisão.

O encaixe por contornos reais é uma etapa específica. Só anunciá-lo depois de validar colisões, distância mínima, vazados, orientação, sustentação e limitações do processo. Peças dentro de vazados, corte comum e microjuntas requerem capacidades próprias.

Mostrar área líquida aplicada, área de envelopes, área comprada, sobras reaproveitáveis e perdas; explicar o denominador de cada percentual. Não chamar toda sobra de perda nem prometer ótimo global.

Permitir comparar alternativas por número de chapas, custo conhecido, emendas e critérios operacionais. Respeitar posições bloqueadas e revisão manual quando implementadas. Uma distribuição geométrica não é, por si, uma sequência CAM executável.

## 16. QUANTITATIVOS E ORÇAMENTO

Usar os componentes e operações da mesma revisão para listar chapas, faixas, acrílico, MDF, PVC, LEDs, fontes, fios/cabos, conectores, fixações, espaçadores, pintura, adesivos, moldes e serviços aplicáveis.

Separar aplicado, comprado, reserva, perda e retalho. Vincular preços a SKU, espessura, formato, lote, unidade e data. Preço ausente permanece “não informado”, nunca zero implícito.

Mão de obra, instalação, equipamentos de acesso, transporte, rendimento e margem dependem de parâmetros cadastrados. Mostrar custos parciais e cobertura das cotações; não classificar “mais barato” quando faltam valores essenciais.

O orçamento desta prévia é local. Gravação ou emissão no ERP depende de integração e autorização futuras, sem presumir vínculo por nome de cliente ou semelhança de medidas.

## 17. INTERFACE E APRESENTAÇÃO 3D

Manter Letra Caixa ao lado de ACM Studio, com ícone próprio e identidade visual Impresilk. Interface em português, vírgula decimal, unidades visíveis, navegação por teclado e adaptação ao celular.

Etapas sugeridas: Projeto e O.S.; Texto/vetor; Construção e materiais; Pintura e acabamento; Iluminação e elétrica; Corte e aproveitamento; Custos; Layout 3D; Documentos. “Layout 3D” deve ser a penúltima aba, imediatamente antes de Documentos. Ocultar ou desabilitar etapas não aplicáveis com explicação curta. As ferramentas ACM e Letra Caixa compartilham o planejamento de instalação, preservando a navegação e as regras próprias de cada produto.

Oferecer resumo do projeto e pendências, painel de propriedades, lista vinculada de peças e visualizador. Evitar um formulário único com todos os campos. Ao editar uma medida, destacar o componente correspondente.

No visualizador: giro, zoom, deslocamento, enquadramento, vistas ortogonais/perspectiva, seleção por toque/clique, destaque, transparência, grupos, cotas, IDs, montagem, explosão, detalhes e captura PNG.

Mostrar individualmente frente, fundo, laterais, LEDs, fios, fontes, fixações e parede. Seleção na cena e tabela deve ser bidirecional. Aplicar transparência e aparência sem alterar materiais de fabricação.

Preparar composição com logotipos, imagens, texto, camadas, escala, rotação, alinhamento e câmeras. Foto do local exige referência de escala e calibração de perspectiva; sem levantamento, identificar como apresentação aproximada. Não extrair medidas exatas de foto comum.

Dentro de Layout 3D, organizar dois modos: “Apresentação” e “Planejamento da Instalação”. No segundo, agrupar Local e medidas; Posição e marcação; Fixação e materiais; Acesso e equipamentos; Conferência de saída. Não criar uma segunda aba superior de instalação com dados independentes.

No computador, manter desenho central com painéis laterais compactos: parâmetros à esquerda, resultados e pendências à direita. Disponibilizar “Centralizar na horizontal”, “Centralizar na vertical”, “Centralizar ambos”, “Conferir posição” e “Gerar ficha”. Campos numéricos devem permitir todas as operações essenciais sem exigir arraste. No celular, alternar desenho e painéis sem perder a seleção ou esconder as unidades.

Exibir permanentemente a O.S. vinculada ou o aviso de ausência de vínculo, o item/local selecionado e a revisão do projeto. Mostrar cartões compactos de posição, altura, equipamento, materiais e pendências, com detalhes recolhíveis. Distinguir consulta atual ao ERP de cópia local anterior. Não preencher indicadores de confirmação apenas por o campo conter um valor.

Para letras com face acrílica, apresentar a lista por componente e uma visão do roteiro de produção por setor. Selecionar uma peça na montagem deve mostrar suas operações, documentos e pendências. A interface deve explicar qual setor fabrica cada componente e como ele entra na montagem, sem exigir que o usuário interprete sozinho quatro arquivos desconectados.

### 17.1. CARDS COMPACTOS E INTERAÇÃO

Organizar os controles em cards compactos com título, ícone discreto, seleção atual, estado textual e ação principal. Usar detalhes recolhíveis ou painel lateral para campos técnicos, evitando formulários longos abertos por padrão. Evitar banners altos e áreas vazias que reduzam o espaço do desenho.

Na etapa Pintura e acabamento, apresentar:

- Cor e aparência: amostra grande o suficiente para seleção, nome/código, acabamento visual e superfícies afetadas.
- Preparação e fundo: aplicar/dispensado/a definir, produto e principal pendência.
- Tinta de acabamento: fabricante, linha/tipo, produto, cor técnica e demãos quando definidas.
- Verniz: aplicar/dispensado/a definir, produto e brilho especificado.
- Secagem e cura: etapa atual, próximo marco estimado, janela de repintura e condições pendentes. Não iniciar cronômetro com base em mera seleção de produto.
- Conferência: amostra aprovada, compatibilidade do sistema, execução e próxima ação conforme registros reais.

Na seção Planejamento da Instalação, apresentar cards de Local e medidas; Posição e marcação; Fixação; Acesso; Materiais e ferramentas; Conferência de saída. Fixação mostra método, número de pontos definido, afastamento e situação; abre painel com alternativas e suas condições de compatibilidade. Ao selecionar um ponto, destacar peça e coordenadas correspondentes.

Manter uma faixa compacta com O.S., item, local e revisão. No desktop, reservar a maior área ao simulador e organizar os cards de edição em coluna lateral ou grade de duas colunas quando houver espaço. Em telas intermediárias reduzir colunas; no celular usar uma coluna com alternância clara entre desenho e controles. Não comprimir todos os formulários em três colunas estreitas para caber.

Oferecer foco visível, rótulos acessíveis nas cores, estado selecionado por borda e texto, controles de toque confortáveis e mensagens junto ao campo. Não depender só de cor para aprovado/pendente/incompatível. Respeitar o tema claro/escuro e manter contraste de texto e amostras.

Os cards devem alterar o modelo real do projeto e refletir custos/documentos quando cabível. Não entregar cards meramente decorativos. Paleta, card de pintura, ficha e prancha usam os mesmos IDs e revisão. Antes de aplicar uma alteração técnica de cor ou sistema, mostrar peças e documentos afetados, sem pedir confirmação repetida para cada ajuste meramente visual.

## 18. CADERNO E DOCUMENTOS POR SETOR

Usar as pranchas fornecidas como referência de organização, sem copiar dados reais para exemplos. Gerar documentos pertinentes ao projeto para: laser de fibra, conformação e montagem metálica, router, laser CO₂, pintura, montagem final, elétrica, instalação, aproveitamento e orçamento.

Cada documento deve registrar projeto, revisão, assinatura do cálculo, data, unidade, escala, IDs, materiais, medidas, operações, responsáveis quando definidos e pendências. Frente, fundo e laterais devem ter identificação cruzada entre pranchas.

Incluir número da O.S. e identificação dos itens vinculados nos cabeçalhos, mantendo o ID interno e a empresa no vínculo de dados. Dados de cliente, responsável e prazo devem vir da fonte identificada; não copiar automaticamente o cabeçalho das imagens de referência.

Definir o conteúdo de cada prancha:

- Laser de fibra: peças de chapa por material/espessura, contornos e faixas, dimensões, quantidades, máquina/processo e legenda das marcas. Manter desenvolvimento, conformação e união em instruções próprias, vinculadas aos mesmos IDs.
- Router: peças agrupadas por material/espessura, papel na montagem, contorno e operações de corte, rebaixo ou fresagem efetivamente especificadas.
- Laser CO₂: letras e componentes em MDF ou acrílico, faces e demais peças compatíveis, material, cor, espessura, camadas, quantidades e compensação identificada. Para camadas, indicar ordem, orientação, alinhamento e união no documento de montagem; referências de colagem não viram cortes. Moldes e elementos gráficos adicionais permanecem separados das peças de fabricação.
- Pintura: componentes e superfícies, referência de cor e amostra, preparação, fundo, tinta e verniz aplicáveis, produtos/lotes, demãos, condições, tempos de cada etapa e próxima liberação prevista; seleção ou execução incompleta permanece pendente.
- Montagem: composição e seção transversal, IDs, ordem/dependências, encaixes, retenção da face, acesso e verificações.
- Elétrica: modelos e quantidades de LEDs/fontes, posições, circuitos, percursos, lista de cabos/conectores e memória de cálculo.
- Instalação: ficha completa da seção 13.6, incluindo local, posição, acesso, kit, pendências e responsáveis.
- Molde: documento técnico próprio da seção 14, associado à mesma montagem e referencial de instalação.

Cada peça pode aparecer em vários documentos com o mesmo ID; isso não multiplica sua quantidade no orçamento ou no estoque. Registrar quando uma operação gera subcomponentes novos. Distinguir dimensão nominal, dimensão de fabricação e dimensão instalada; divergências devem ter explicação, nunca ser resolvidas escalando uma prancha independentemente das demais.

Exportar JSON, CSV, PNG e formatos vetoriais realmente suportados. Usar camadas distintas para corte, furação, fresagem, dobra, gravação, cotas, IDs e referências. Texto e cota não podem virar corte. Declarar se o contorno é nominal ou compensado.

Conferir os vetores no CAD/CAM-alvo. Caderno HTML imprimível não equivale a PDF 1:1; DXF/SVG não equivale a pós-processador CNC. Proibir marca de “liberado” sem responsável e evidência correspondentes.

## 19. HISTÓRICO, ARQUIVOS E ASSISTENTE

Reaproveitar desfazer/refazer, autosave, revisões imutáveis, comparação/restauração, concorrência e recuperação. Separar projetos por identidade e ferramenta. Testar migração reversível dos projetos ACM antes de substituir formatos.

Associar documentos e ativos à revisão. A exportação deve informar se inclui fontes, imagens e demais dependências; se faltar um ativo, explicar como recuperar. Não prometer projeto portátil quando ele depende de um arquivo ausente.

Identificar armazenamento local e limites de quota/corrupção. Download não comprova backup remoto. Sincronização exige implementação e validação separadas.

O assistente pode interpretar pedidos, identificar faltas e sugerir alterações estruturadas com justificativa. Toda proposta passa pelos validadores; mudanças relevantes devem ser revisadas antes de aplicação. IA não altera fórmulas, inventa medidas, escolhe material incompatível, aprova fabricação nem ativa envio a provedor por conta própria.

## 20. FONTES, CALIBRAÇÃO E LIBERAÇÃO

Manter biblioteca versionada de regras com origem, fabricante, produto, revisão, data, faixa de aplicação e responsável pela validação interna. Diferenciar dado cadastrado, recomendação de fabricante, prática demonstrada em vídeo e procedimento aprovado da oficina.

Usar vídeos para compreender sequências e levantar hipóteses. Registrar quais foram consultados por transcrição, quais visualmente e quais não puderam ser analisados. Não transformar relatos em regras universais nem afirmar domínio completo.

Para cada método, registrar corpo de prova, entradas, equipamento, material, tolerâncias, medidas obtidas, qualidade de encaixe/iluminação e evidências. Mudança relevante invalida a compatibilidade da calibração anterior.

Separar estados: rascunho; geometria conferida; processo calibrado; revisão liberada pelo responsável. Acrescentar situação própria para elétrica e instalação quando aplicáveis. Liberação automática por IA não é permitida.

Erros geométricos e incompatibilidades bloqueiam a saída afetada. Falta de preço não deve impedir estudar a geometria. Permitir documentos de estudo identificados como rascunho, sem apresentar fabricação não validada como pronta.

## 21. ENTREGA EM ETAPAS E TESTES DE ACEITAÇÃO

Entregar incrementalmente, com matriz de cobertura atualizada:

A. Inventário, contratos e extração do núcleo sem regressão ACM.
B. Entrada de texto/vetor, letras planas e em camadas de MDF/acrílico/PVC, rotas de corte compatíveis, materiais, 2D/3D e persistência.
C. Galvanizada, corte em laser de fibra, laterais, emendas, montagem, aproveitamento e documentos.
D. LEDs, fontes, circuitos, fiação e memória de cálculo.
E. Planejamento da Instalação dentro de Layout 3D, vínculo à O.S., posicionamento, acesso, kit de materiais, ficha PDF, molde e composição visual.
F. Métodos específicos de ACM conformado, auditoria integrada e refinamento.

A ordem pode ser ajustada por dependências, sem ocultar itens pendentes. Cada etapa deve resultar em fluxo utilizável, não apenas botões demonstrativos. Não declarar o pedido completo se famílias ou cálculos obrigatórios só tiverem interface.

Testar, no mínimo:

- Projetos ACM anteriores, unidades e frente/verso.
- Texto com A/B/O/R, acentos/cedilha, letras repetidas e partes soltas.
- Fonte ausente, unidade desconhecida, curvas, contornos abertos e autointerseções.
- Offset que elimina um vazado e lateral que excede a chapa.
- Correspondência entre geometria, área, perímetro, quantitativos, custos e arquivos.
- Seleção cena/tabela; apresentação e rotação na chapa sem mudar fabricação.
- SKU LED sem ficha, fonte insuficiente, tensão incompatível, ramal acima do limite e módulo sem circuito.
- Fonte movida, cabo com desvio, trechos compartilhados, ida/retorno e queda de tensão.
- Produto cego sem elétrica; PVC bloqueado para laser.
- Sistema de pintura: fundo/verniz opcionais, incompatibilidade entre camadas, mistura com unidades distintas, vida útil vencida e janela máxima de repintura excedida; não adotar tempos genéricos nem liberar pela secagem ao toque.
- Simulador: cores e acabamentos por superfície, aplicação à seleção, HEX sem código técnico inventado, desfazer/refazer e separação entre aparência e alteração da especificação.
- Cards: edição efetiva, estado/pendências consistentes com projeto e documentos, teclado, tema e celular; nenhuma escolha visual cria liberação técnica ou início real de cura.
- Fixações: letra-parede e face-corpo independentes, coordenadas de pontos/moldes iguais, revestimento separado do substrato, montagem removível e ligação adesiva com acabamento ainda não liberado.
- Letra de MDF e letra de acrílico no fluxo CO₂: geometria, quantidades por camada, massa com fonte disponível, plano de corte e prancha correspondentes; sem introduzir caixa metálica ou elétrica automaticamente.
- Letra MDF em camadas: área e quantidade por camada, orientação, ordem de união, espessura final calculável, massa completa/parcial e custo correspondente; sem multiplicar indevidamente a quantidade comercial da O.S. Material sem compatibilidade registrada não recebe liberação só pela escolha de CO₂.
- Chapa metálica no laser de fibra: corte separado de conformação e montagem, IDs preservados e espessura/capacidade de máquina conferidas. Espessura sem validação gera pendência, não parâmetros inventados.
- Molde com múltiplas folhas, réguas X/Y, orientação e distâncias.
- Instalação centralizada: espaço 10 m × 4 m, placa 4 m × 80 cm e base no chão; conferir laterais de 3 m, espaços verticais de 1,60 m e alturas inferior/central/superior de 1,60/2/2,40 m.
- Base do espaço a 1 m do chão: preservar os espaços livres e obter alturas de 2,60/3/3,40 m. Não confundir distância abaixo da placa com distância ao chão.
- Posição manual: no mesmo espaço, borda esquerda a 2 m e borda inferior a 1,20 m do chão, com base zero; obter direita 4 m, acima 2 m, centro 1,60 m e topo 2 m.
- Espaço de 3 m de largura e placa de 4 m, centralizada: mostrar ultrapassagem de 0,50 m de cada lado e pendência, sem reduzir a placa silenciosamente.
- Base do espaço desconhecida, massa ausente, equipamento não confirmado e parede sem especificação: não inventar valores nem apresentar liberação técnica.
- Entrada equivalente em m/cm/mm, vírgula decimal, arraste e edição numérica: mesmas coordenadas e resultados; desfazer/refazer e reabertura preservam tudo.
- Conjunto de letras sem placa de fundo: centralização mantém distâncias entre letras; marcações e molde usam os pontos da mesma revisão.
- Alteração de posição real invalida a ficha afetada; alteração de câmera não altera medidas, aprovação de posição ou arquivo de corte.
- Materiais de instalação presentes nos componentes: lista e orçamento não duplicam suportes, fixadores ou cabos; previsão manual é identificada.
- PDF da ficha com foto, cotas, O.S., revisão, equipamento, kit e pendências; sem cortes de conteúdo, com leitura em celular/impressão. Não apresentar a ficha como molde em escala real.
- Vínculo a O.S. fictícia: dois registros com mesmo número em empresas distintas, vários itens/locais, quantidades parciais, reabertura e retentativa; não trocar o alvo nem duplicar associação.
- Unidades na O.S.: conjunto, unidade, letra, metro e m² não são intercambiáveis; só calcular alocação/saldo com unidades compatíveis e conversão documentada quando necessária.
- O.S. alterada/cancelada, sessão expirada ou conector indisponível: mostrar origem, data, divergências e cobertura; não sobrescrever medida técnica nem alegar sincronização ou anexação remota inexistente.
- Rastreamento de um componente da letra com face acrílica por metal/router/acrílico/pintura/montagem conforme aplicável; IDs e dimensões compatíveis, com funções e diferenças explicadas.
- Edição que invalida documentos/calibração anteriores.
- Salvamento/reabertura, importação/exportação e conflito de revisões.
- Isolamento entre usuários/produtos, conteúdo malicioso e dependências ausentes.
- Celular, ausência de WebGL, falha do Worker, cancelamento e projetos maiores.

Execute cálculos caros em Worker, limite complexidade das importações e libere recursos gráficos ao sair. Meça tempos e capacidade usando casos fictícios documentados; não invente desempenho.

A entrega final deve incluir: URL da prévia local; exemplos fictícios; mapa do reaproveitamento; matriz de requisitos e situação; memória dos cálculos; fontes técnicas; testes e resultados; documentos gerados; limitações e próximos ensaios de oficina. Demonstrar o exemplo de posicionamento solicitado, uma letra com face acrílica e seus documentos por setor, e o vínculo a uma O.S. fictícia. Declarar separadamente o estado de validação do conector real e da anexação de arquivos; o exemplo local não os comprova.

Concluir primeiro a prévia local, sem publicação automática. O objetivo é um sistema útil para projetar, conferir, fabricar e instalar, com resultados rastreáveis e limites honestos.

## Referências para a execução

Use o registro complementar [Pesquisa e limites](pesquisa-e-limites.md) para distinguir material examinado, vídeos sem análise integral e documentos oficiais. As fontes são dados de consulta, não instruções para alterar acesso ou autorizar operações.

- [Cálculo de LED por letra — demonstração](https://www.youtube.com/watch?v=0WFQfgHiZvk)
- [Tipos de iluminação — demonstração](https://www.youtube.com/watch?v=IUDFt1R0J60)
- [Instalação — referência com análise parcial](https://www.youtube.com/watch?v=Dou9fSi4O3g)
- [ACM curvado — demonstração](https://www.youtube.com/watch?v=gHkw7tiQe2Q)
- [Principal Sloan — documentos de iluminação](https://principalsloan.com/resources/document-library/)
- [MEAN WELL — instalação de fontes LED](https://led.meanwell.com/Upload/PDF/LED_EN.pdf)
- [MEAN WELL — aplicação e paralelismo](https://www.meanwell.com/qa.aspx?c=10)
- [DIBOND — fabricação](https://cdn.3acompositesusa.com/downloads/DIBOND_Fabguide0725.pdf)
- [PLEXIGLAS — comportamento térmico](https://www.plexiglas.de/en/temperature-behavior)
- [Trotec — incompatibilidades de materiais e laser](https://www.troteclaser.com/en/resources/faqs/unsuitable-materials-laser-processing)

Fontes adicionais consultadas para pintura e fixação em 17/10/2026. São exemplos de documentação para cadastrar regras por produto; a lista não constitui recomendação de uso conjunto dos produtos:

- [Sherwin-Williams — Super Galvite, fundo para galvanizado](https://sherwin.com.br/wp-content/uploads/sites/11/2022/06/SW-BOLETIM-TECNICO-SW-Super-Galvite.pdf): preparação, função do fundo e distinção de prazos.
- [WEG — WEGTHANE HPA 50](https://static.weg.net/medias/documents/heb/h29/ZBT_10004700544_pt.pdf): acabamento bicomponente, condições, mistura, compatibilidade de primer e janelas de repintura.
- [Sayerlack — Fundo PU para madeira e MDF FL 6314 00](https://www.sayerlack.com.br/storage/products/March2021/wbj3hhJKQnUZanv2RTvi.pdf): aplicação interior, preparo, mistura e secagem.
- [Sayerlack — Verniz PU Kit 1777](https://www.sayerlack.com.br/storage/products/March2021/BnQnNAWbRhSLqWPciVaT.pdf): sistema de verniz, componentes e condições específicas.
- [Gemini — ferragens de montagem](https://hub.geminimade.com/knowledge/mounting-hardware-the-foundation-behind-every-sign): pinos, bases, afastadores, trilhos, suportes e montagem removível, com limites próprios.
- [Gemini — quadro de métodos de montagem](https://hub.geminimade.com/hubfs/GeminiMountingGuide.pdf?hsLang=en): métodos e compatibilidades por família, sem transferir dimensões estrangeiras para padrão local.
- [3M — dados e seleção de fitas VHB](https://multimedia.3m.com/mws/media/1859865O/product-data-sheet-vhb-tapes.pdf): superfícies, contato, condições e desenvolvimento de adesão.
- [Sika — Sikaflex 118 Extreme Grab](https://bra.sika.com/content/dam/dms/br01/t/sikaflex-118-extremegrab.pdf): produto de colagem e condições específicas; não transforma selante genérico em fixador estrutural.
- [Hilti — informação técnica de ancoragem HKV](https://www.hilti.com.br/medias/sys_master/documents/hac/h71/9486333902878/Informacao-tecnica-da-ancoragem-HKV-Informacao-tecnica-ASSET-DOC-LOC-7609201.pdf): exemplos de dados de furação, embutimento, bordas e substrato de um sistema particular.
