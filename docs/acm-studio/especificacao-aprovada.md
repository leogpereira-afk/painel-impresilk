Léo, analisei a transcrição completa e as demonstrações de corte e dobra do [vídeo da BOLD](https://www.youtube.com/watch?v=ax2T5VOsoCM). Ele acrescenta **os recortes dos cantos, a geometria da fresa, a preservação das camadas do ACM e a formação real das bandejas**.

Também conferi o [catálogo de cores da BOLD](https://institucional.bold.net/wp-content/uploads/2026/02/mostruario_acm_bold-2025-11.pdf). O prompt abaixo inclui cores e acabamentos no 3D, vinculados ao material, além de todos os requisitos que reunimos nos vídeos anteriores.

---

# SUPERPROMPT — IMPRESILK ACM STUDIO

## 1. Objetivo e resultado esperado

Atue como uma equipe especializada em engenharia de fachadas, fabricação de ACM, geometria computacional, desenvolvimento de software e design de interfaces.

Desenvolva o **Impresilk ACM Studio**, integrado à área **Ferramenta I.A do Painel Impresilk**.

O sistema deve transformar as medidas de uma fachada em um projeto visual e técnico contendo:

- 🏢 Fachada em 3D, com cores e acabamentos.
- 📐 Frente, laterais, forro, aberturas e encontros.
- ↪️ Bandejas e outras peças com abas, dobras e recortes.
- 🧩 Plano de corte com aproveitamento real das chapas.
- 🔩 Estrutura de metalon e mapa de fixações.
- 💰 Quantitativos e estimativas de custos.
- 📄 Fichas de fabricação, etiquetas e documentos de montagem.

**O projeto 3D, a peça aberta, os cálculos, o plano de corte e os arquivos exportados devem derivar do mesmo modelo geométrico e da mesma revisão.**

A ferramenta deve ajudar a projetar, orçar, conferir e preparar a fabricação, apresentando claramente os parâmetros que já foram validados e os que ainda dependem de definição.

## 2. Materiais e configurações iniciais

Disponibilizar estes formatos de chapa:

| Largura | Comprimento |
|---|---|
| 1.220 mm | 5.000 mm |
| 1.250 mm | 5.000 mm |
| 1.500 mm | 5.000 mm |

Espessuras de ACM: **3 mm e 4 mm**.

Abas dobradas para dentro: **20 mm e 30 mm**, com configuração individual por borda.

Perfis de metalon:

- **20 × 20 mm**
- **30 × 20 mm**
- **50 × 30 mm**

Permitir novos formatos, materiais e perfis mediante cadastro.

Tratar formatos e espessuras como opções do sistema. A disponibilidade comercial deve ser confirmada por produto: não presumir que toda cor existe em todas as espessuras e dimensões.

Separar os seguintes parâmetros:

- Espessura total do ACM.
- Espessura das lâminas de alumínio.
- Tipo de núcleo e revestimento.
- Altura acabada das abas.
- Junta aparente entre placas.
- Profundidade das laterais e do forro.
- Dimensões externas e espessura da parede do metalon.
- Espessura da fita e demais afastamentos de montagem.

## 3. Fluxo de trabalho

Organizar a ferramenta nesta sequência:

**Projeto → Medidas → Materiais e cores → Modulação → Dobras e bordas → Estrutura e fixação → Aproveitamento → Conferência → Documentos**

Manter um resumo visível com:

**Área · Peças · Chapas · Aproveitamento · Metalon · Fixações · Custo · Pendências**

Oferecer modo guiado para o usuário operacional e configurações avançadas recolhíveis para quem prepara a fabricação.

Cada alteração deve atualizar os resultados afetados sem apagar escolhas manuais desnecessariamente.

## 4. Entrada das medidas da fachada

Solicitar:

- Largura e altura da frente.
- Lateral esquerda: presença, profundidade e altura.
- Lateral direita: presença, profundidade e altura.
- Forro: presença, largura, profundidade e posição.
- Aberturas, portas, janelas, pilares e interferências.
- Acabamentos superior, inferior e dos encontros.
- Posição de letreiros e elementos que interfiram na montagem.

As laterais podem ter medidas diferentes.

Mostrar um desenho ao lado de cada campo, destacando a dimensão que está sendo preenchida.

O usuário deve indicar se a medida corresponde:

- À dimensão externa acabada.
- À dimensão interna de encaixe.
- À estrutura existente.
- Ao vão disponível.

Aceitar metros e milímetros, com vírgula decimal, normalizando os cálculos internos em milímetros.

**As laterais da fachada são superfícies revestidas. As abas de 20 ou 30 mm são partes dobradas das peças. Não confundir esses conceitos.**

## 5. Ambiente 3D

Criar um editor com:

- Árvore de componentes à esquerda.
- Cena 3D central ampla.
- Propriedades da seleção à direita.
- Lista de peças em painel inferior recolhível.

No celular, alternar entre desenho e formulário com controles adequados ao toque.

Disponibilizar:

- Vistas frontal, traseira, laterais, superior, inferior e isométrica.
- Rotação, aproximação e enquadramento.
- Fachada pronta.
- Estrutura aparente.
- Transparência do ACM.
- Vista explodida.
- Peça aberta.
- Corte transversal ampliado.
- Animação da sequência de dobra.
- Cotas e identificação das peças.
- Sentido do acabamento.
- Mapa de fita ou parafusos.

Selecionar uma peça no 3D deve destacar a mesma peça na tabela, na ficha e no plano de corte.

Representar a espessura, os retornos e os encontros das peças de maneira coerente. As dobras devem usar a geometria do perfil de fabricação, incluindo a transição ou o raio aplicável.

## 6. Cores e acabamentos do ACM

Criar uma biblioteca visual de materiais com amostras grandes, busca e filtros.

Organizar por famílias:

- Branco, preto, cinzas e grafites.
- Azul, vermelho, amarelo, laranja e verde.
- Prata, bronze, dourado e champanhe.
- Amadeirados.
- Escovados.
- Espelhados.
- Acabamentos especiais cadastrados.

Separar **cor** de **acabamento**: fosco, brilhante, metálico, escovado, amadeirado ou espelhado, conforme a disponibilidade do produto.

Cada material deve registrar:

- Fabricante e linha.
- Nome e código comercial.
- Espessura.
- Formatos disponíveis.
- Cor de visualização.
- Textura e direção do acabamento.
- Aplicação indicada na ficha técnica.
- Lote e estoque, quando disponíveis.
- Fonte e data de atualização.

Permitir aplicar material à fachada inteira, a uma face ou a peças selecionadas.

Criar comparação lado a lado entre alternativas de cores, preservando as medidas.

A renderização deve representar brilho, reflexo e textura. A direção de um acabamento escovado ou amadeirado precisa acompanhar a orientação física da peça.

Identificar a imagem como **simulação visual**. Um seletor livre de cor pode servir ao estudo, mas uma cor personalizada não deve virar automaticamente um produto disponível para compra.

## 7. Modulação e paginação

Oferecer:

**Vertical · Horizontal · Mista · Manual**

Separar:

1. A organização das placas na fachada.
2. A distribuição das peças abertas nas chapas.

Permitir:

- Alinhar ou centralizar juntas.
- Repetir módulos.
- Definir larguras preferidas.
- Evitar faixas estreitas conforme limite configurado.
- Alinhar frente, laterais e forro.
- Bloquear peças aprovadas.
- Ajustar juntas e folgas.
- Definir limites de fabricação, transporte e montagem.

Comparar alternativas com a mesma cobertura e os mesmos requisitos.

Quando uma peça não couber na chapa ou na máquina, apresentar a causa e sugerir uma divisão explícita no projeto. Qualquer mudança nas dimensões solicitadas deve depender de aplicação consciente pelo usuário.

## 8. Bandejas, bordas e recortes dos cantos

Modelar a bandeja como uma peça desenvolvida contendo:

- Face central.
- Abas independentes.
- Canais de fresagem.
- Recortes e alívios dos cantos.
- Eventuais abas de união.
- Furos.
- Linhas e sentidos de dobra.

Permitir bordas sem dobra e peças com duas, três ou quatro bordas dobradas.

Cada borda deve ter seu próprio tipo de acabamento e altura de aba, incluindo **20 e 30 mm**.

Para os cantos:

- Mostrar o material que será retirado.
- Referenciar os recortes aos eixos e à geometria dos canais.
- Considerar espessura, compensações e tipo de encontro.
- Detectar sobreposição entre abas.
- Conferir a sequência de fechamento.
- Representar cantos internos e externos.
- Preservar a face de acabamento.

Não assumir que todo canto utiliza um quadrado igual à altura da aba ou um corte universal de 45°.

Disponibilizar modelos de encontro validados pela fabricação, com desenho explicativo e parâmetros próprios.

O usuário deve conseguir alternar entre:

**Chapa aberta → Recortes dos cantos → Dobras → Bandeja montada**

## 9. Motor de usinagem e compensação de dobra

O usuário informa a **medida acabada desejada**. O motor calcula o desenvolvimento necessário para obtê-la.

Distinguir:

- Borda de corte.
- Eixo central do canal de usinagem.
- Largura do canal.
- Dimensão interna.
- Dimensão externa.
- Altura acabada da aba.
- Referência da guia da ferramenta.

Usar o eixo do canal como referência geométrica explícita, mantendo separada a marcação da guia de uma tupia manual.

Cadastrar o perfil de fabricação com:

- Fabricante e modelo do ACM.
- Espessura total e das lâminas.
- Núcleo e revestimento.
- Máquina e ferramenta.
- Ângulo e geometria da fresa.
- Largura do fundo e transições da ferramenta.
- Profundidade de usinagem.
- Núcleo residual.
- Espessura total restante.
- Ângulo final da dobra.
- Compensações e tolerâncias.
- Resultado da calibração.

**Núcleo residual e espessura total restante são grandezas diferentes.**

Mostrar um corte ampliado com as camadas do ACM, o canal e a ferramenta.

Os valores apresentados nos vídeos — como posição de guia, ganho de dobra, largura do fundo ou material residual — devem ser registrados como exemplos associados ao processo demonstrado. Não transformá-los em constantes universais.

Quando referências divergirem, identificar produto, processo e origem de cada parâmetro. Utilizar a especificação aplicável e a calibração da oficina.

## 10. Encapamento e módulos contínuos

Criar dois modos de montagem:

**Encapar perfil**

Calcular a peça considerando metalon, orientação do perfil, espessura do ACM, fita, afastamentos e folgas de encaixe.

**Bandejas ou módulos contínuos**

Calcular dimensões acabadas, juntas e alinhamento entre peças, considerando o efeito acumulado das compensações.

Permitir verificar:

- Dimensão nominal.
- Dimensão desenvolvida.
- Dimensão acabada prevista.
- Folga de encaixe.
- Soma das peças e juntas.
- Diferença acumulada ao longo da fachada.
- Correspondência com os apoios da estrutura.

A aplicação de compensação deve considerar a borda e a direção afetada. Não descontar o mesmo valor indiscriminadamente de todas as cotas.

## 11. Estrutura de metalon

Representar os perfis cadastrados com dimensões e orientação corretas.

Solicitar:

- Seção.
- Espessura da parede.
- Material e acabamento.
- Comprimento comercial da barra.
- Posição de montantes e travessas.
- Apoios e uniões.
- Cortes retos ou angulados.

Gerar:

- Comprimento total por perfil.
- Lista de segmentos.
- Plano de corte das barras.
- Quantidade de barras.
- Sobras.
- Identificação das peças.
- Peso quando houver propriedades suficientes.

Separar **estrutura desenhada e quantificada** de **estrutura dimensionada**.

A verificação de resistência, deformação, espaçamento e ancoragem exige cargas, vãos, propriedades, apoios e substrato. O sistema deve mostrar essas pendências quando faltarem informações, sem converter uma montagem visual em aprovação estrutural.

## 12. Fixação por fita ou parafusos

Disponibilizar:

**🟩 Fita · 🔩 Parafusos**

Aplicar a escolha por projeto ou por peça.

Para fita, cadastrar:

- Produto.
- Largura e espessura.
- Superfícies de contato.
- Posição e extensão das faixas.
- Requisitos de preparação e aplicação.
- Critérios técnicos associados ao sistema.

Para parafusos, cadastrar:

- Tipo, material e dimensões.
- Perfil de apoio.
- Furos e afastamentos.
- Arruelas e outros componentes.
- Tratamento da movimentação térmica.
- Acesso para instalação.

Criar o **Mapa de fixação**:

- Fita representada por faixas.
- Parafusos representados por pontos numerados.
- Cotas a partir de referências claras.
- Perfil que recebe cada fixação.
- Visualização frontal, traseira e em corte.

Detectar fixações sem apoio e interferências com bordas, canais, recortes ou dobras.

A distribuição automática deve usar critérios validados para o sistema escolhido. Quando faltarem, mostrar uma prévia com pendências, sem inventar espaçamentos seguros.

Alterar a fixação deve recalcular os afastamentos e conferir o encaixe.

## 13. Aproveitamento e plano de corte

Otimizar os contornos desenvolvidos considerando:

- Formatos e quantidades em estoque.
- Material, cor, espessura e lote.
- Refilo.
- Largura de corte.
- Separação entre peças.
- Fixação na mesa.
- Dimensões úteis da máquina.
- Direção do acabamento.
- Rotações permitidas.
- Peças e posições bloqueadas.
- Retalhos cadastrados.

Distinguir corte por serra, com suas restrições, de corte por router/CNC.

A divisão de áreas pode fornecer um limite teórico. A quantidade final de chapas deve resultar de um encaixe executável.

Oferecer prioridades:

**Menor custo · Menos chapas · Menos emendas · Melhor composição visual**

Mostrar a melhor solução encontrada, o critério usado e as alternativas comparadas.

Apresentar cada chapa em escala, com peças numeradas, direção do material, margens, recortes e sobras.

Separar:

- Área visível instalada.
- Área desenvolvida das peças.
- Área bruta consumida.
- Perdas de processo.
- Retalhos reutilizáveis.
- Aproveitamento percentual com denominador identificado.

## 14. Custos e comparações

Calcular com preços e parâmetros cadastrados:

- Chapas.
- Metalon.
- Fita ou parafusos.
- Demais componentes especificados.
- Corte e usinagem.
- Preparação, dobra e montagem.
- Transporte e instalação, quando informados.

Separar custo estimado, custo informado e valor indisponível.

Permitir comparar a mesma fachada com diferentes:

- Formatos de chapa.
- Espessuras.
- Materiais e acabamentos.
- Modulações.
- Fixações.

Mostrar o que mudou em consumo, emendas, aparência e custo.

Sugerir pequenos ajustes de medidas que possam reduzir desperdício, apresentando a diferença e preservando a escolha original até confirmação.

## 15. Documentação e etiquetas

Gerar documentos distintos para cada finalidade.

**Apresentação comercial**

Imagem da fachada, cores, acabamentos, medidas gerais e alternativa escolhida.

**Ficha de fabricação por peça**

Projeto, identificação, revisão, quantidade, material, dimensões de corte, eixos de usinagem, recortes, dobras, furos, orientação e dimensão acabada prevista.

**Plano de corte**

Distribuição por chapa, peças, posições, orientação, margens e retalhos.

**Mapa de montagem e fixação**

Posição de cada peça, perfis correspondentes, sequência de montagem e locais de fita ou parafusos.

**Lista de materiais**

Quantitativos, unidades, custos disponíveis e pendências.

**Etiquetas**

Código da peça, projeto, revisão, posição e seta do acabamento, com QR code opcional para a ficha correspondente.

Manter a ficha da oficina enxuta e legível. Explicações detalhadas ficam em páginas complementares.

## 16. Frente, verso e arquivos de fabricação

Identificar claramente:

**FRENTE — ACABAMENTO**
**VERSO — USINAGEM**

Ao alternar a face, transformar corretamente coordenadas, recortes, dobras, furos e fixações.

Exportar PDF, imagens, tabelas e SVG/DXF com unidade e escala explícitas.

Separar as camadas de:

**Corte · Usinagem · Furação · Dobra · Cotas · Identificação**

As marcações informativas não podem ser confundidas com trajetórias de corte.

Arquivos de produção devem indicar a revisão e o perfil de fabricação utilizado. Alterações posteriores tornam os resultados anteriores desatualizados.

G-code depende de máquina, ferramenta, pós-processador e validação específicos; uma exportação vetorial não equivale a um programa validado para CNC.

## 17. Calibração e conferência da primeira peça

Criar o comando **“Calibrar com corpo de prova”**.

Registrar:

- Material e ferramenta.
- Parâmetros programados.
- Medidas obtidas após cortar, usinar e dobrar.
- Ângulo final.
- Qualidade visual da dobra.
- Encaixe.
- Tolerâncias.
- Responsável e data.

A aprovação deve valer para a configuração efetivamente testada.

Mudanças relevantes de material, espessura, ferramenta ou processo devem exigir uma calibração compatível ou nova conferência.

Separar os estados:

**Rascunho · Geometria conferida · Fabricação calibrada · Revisão liberada**

A demonstração de dobrar repetidamente uma amostra até romper, vista no vídeo, não deve virar procedimento de aprovação das peças entregues.

Incluir orientações de proteção e manuseio do acabamento conforme o fabricante e a operação.

## 18. Assistente de inteligência artificial

Permitir pedidos em linguagem natural, por exemplo:

> “Monte uma fachada com oito metros de frente, duas laterais de sessenta centímetros, forro, ACM preto fosco e abas de trinta milímetros.”

O assistente deve:

- Preencher campos estruturados.
- Identificar dados faltantes.
- Mostrar alterações propostas.
- Explicar alternativas.
- Acionar o motor de cálculo.
- Localizar incompatibilidades.
- Resumir materiais e pendências.

**Os resultados numéricos devem vir dos motores geométricos e de otimização.**

A IA não deve inventar medidas, preços, disponibilidade de material, propriedades mecânicas ou parâmetros de fabricação.

Manter provedor e modelo configuráveis, com acompanhamento de uso e custo. As operações geométricas básicas devem funcionar sem depender de chamadas à IA.

## 19. Arquitetura, desempenho e persistência

Integrar ao sistema existente, preservando autenticação, permissões e componentes compartilhados.

Separar os módulos de:

- Dados do projeto.
- Geometria.
- Desenvolvimento e dobras.
- Modulação.
- Otimização de chapas e barras.
- Estrutura e fixações.
- Materiais e cores.
- Visualização.
- Custos.
- Documentos.

Manter identificadores estáveis e um modelo de dados versionado.

Carregar o editor 3D e recursos pesados sob demanda. Executar otimizações fora da interface principal, com progresso, cancelamento e descarte de resultados antigos.

Disponibilizar alternativa 2D quando o dispositivo não suportar adequadamente a visualização 3D.

Implementar:

- Salvamento automático.
- Recuperação de rascunhos.
- Desfazer e refazer.
- Histórico de revisões.
- Comparação de versões.
- Controle de alterações simultâneas.
- Permissões verificadas também no servidor.
- Proteção dos dados dos clientes.

Salvar uma revisão antes de gerar seus documentos e manter os arquivos associados a ela.

## 20. Interface e identidade visual

Usar o Silk no cabeçalho e o nome **Impresilk ACM Studio**.

Aplicar o design system do Painel, com cards compactos, navegação clara e aproveitamento da área útil.

Utilizar ícones acompanhados de texto:

**📐 Medidas · 🎨 Materiais · 🏢 Fachada · ↪️ Dobras · 🔩 Fixações · 🧩 Corte · 💰 Custos · 📄 Documentos**

Manter cores técnicas de seleção, alertas e operações separadas das cores reais do ACM.

Oferecer foco visível, navegação por teclado, legendas e estados claros de carregamento, erro e resultado desatualizado.

Cada controle apresentado deve executar sua função ou explicar objetivamente o requisito que falta.

## 21. Recursos adicionais de alto valor

Preparar a evolução para:

- Simulação da fachada sobre foto, com escala e perspectiva calibradas.
- Biblioteca de retalhos por material e dimensões verificadas.
- Comparação de cores e paginações lado a lado.
- Sequência visual de montagem.
- Leitura da etiqueta para localizar a peça no projeto.
- Registro de consumo previsto versus realizado.
- Biblioteca de detalhes construtivos aprovados pela oficina.
- Reutilização de projetos anteriores como modelos.

Uma fotografia sem referência dimensional não deve produzir medidas definitivas.

## 22. Testes e critérios de aceite

Validar:

- Frente simples, laterais independentes e forro.
- ACM de 3 e 4 mm.
- Abas de 20 e 30 mm, inclusive diferentes na mesma peça.
- Bandejas com duas, três e quatro bordas dobradas.
- Recortes e encontros assimétricos.
- Cantos internos e externos.
- Peças que cabem exatamente e peças inviáveis.
- Acabamentos com rotação restrita.
- Diferentes posições e espessuras de fita.
- Parafusos com apoio e acesso de montagem.
- Compensação por dobra e diferença acumulada entre módulos.
- Correspondência entre 3D, peça aberta, plano de corte e exportações.
- Ausência de sobreposição e peças fora da chapa.
- Transformação correta entre frente e verso.
- Soma consistente de materiais e quantidades.
- Recuperação de rascunhos e integridade das revisões.
- Desempenho com um projeto representativo definido antes dos testes.

Usar os exemplos dos vídeos como casos documentados de estudo, com seus parâmetros explícitos. A validação da fabricação deve incluir corpos de prova do processo real da Impresilk.

## 23. Forma de entrega

Antes de implementar, examinar a arquitetura atual e apresentar um plano dividido em etapas executáveis.

Entregar progressivamente:

1. Modelo paramétrico, materiais, cores e visualização.
2. Bandejas, bordas, dobras e calibração.
3. Modulação e aproveitamento das chapas.
4. Estrutura, fixações e quantitativos.
5. Documentação, revisões e conferência.
6. Assistente e recursos avançados.

Apresentar prévia funcional com dados fictícios, evidências dos testes e limitações reais de cada etapa.

**A entrega final deve permitir medir uma fachada, escolher o material e sua cor, conferir a montagem em 3D, calcular as peças e obter documentos coerentes para orçamento, fabricação e instalação. Publicar somente após autorização.**
