Léo, recomendo **Visão geral** para a entrada principal e **Dashboard** para as análises detalhadas. Assim, você abre o Comercial para saber o que precisa fazer e entra no Dashboard para entender os resultados.

O prompt completo ficaria assim:

---

**Transformar o Comercial na Central Comercial da Impresilk**, reunindo operação, ferramentas de apoio e inteligência de vendas. Modernizar o layout e melhorar a velocidade de navegação, preservando dados, permissões e funcionalidades existentes.

**1. Entrada principal e navegação**

Manter **Comercial** na lateral. Dentro dele, criar uma navegação superior nesta ordem:

**Visão geral · Bancos e Pix · Glossário · Contas atrasadas · Brief · Dashboard**

Retirar Bancos e Pix, Glossário, Contas atrasadas e Brief da lateral, mantendo seus acessos dentro da Central Comercial.

A **Visão geral** será a entrada padrão, com resumo compacto da operação, pendências prioritárias e acesso às atividades comerciais. Preservar as funcionalidades de **Meu dia, Negociações, Clientes, Pós-venda, Resultados e Soluções**, reorganizando-as para evitar duplicidade entre Resultados e o novo Dashboard.

**2. Telas completas e navegação confortável**

Cada botão deve abrir a funcionalidade completa na área principal, aproveitando a largura e a altura disponíveis.

Adaptar tabelas, filtros, formulários e gráficos ao espaço. Manter a lateral recolhível, evitar cabeçalhos duplicados e preservar filtros ao alternar entre telas.

Permitir links diretos para cada área, funcionamento correto do botão Voltar e navegação adequada em computador, tablet e celular.

**3. Dashboard comercial**

Criar um Dashboard com filtros compartilhados de período, vendedor, cliente, produto, categoria e campanha, conforme os dados disponíveis.

Oferecer os recortes **mês, ano, todos os anos disponíveis e período personalizado**. Permitir comparação com o período anterior e com o mesmo período do ano anterior.

| Área | Informações e comparações |
|---|---|
| **Produtos** | Valor vendido, quantidade, participação nas vendas, evolução mensal e anual e produtos em crescimento ou queda. |
| **Vendedores** | Vendas mês a mês, total anual, comparação entre anos, quantidade de vendas, ticket médio e atingimento de metas cadastradas. |
| **Ranking de produtos** | Ranking por valor e quantidade, com evolução das posições mês a mês e ano a ano. |
| **Clientes** | Vendas mensais e anuais, ranking, frequência de compra, ticket médio, última compra e concentração de receita. |
| **Atrasos financeiros** | Valor vencido, quantidade de títulos, clientes envolvidos, faixas de atraso e índice de inadimplência com fórmula explícita. |
| **Curva ABC** | Curvas de clientes e produtos, participação acumulada e faixas de classificação visíveis e configuráveis. |
| **Comparativo histórico** | Matriz com anos nas linhas e meses nas colunas, permitindo reconhecer sazonalidade e comparar períodos equivalentes. |

Os gráficos devem permitir abrir os registros que compõem cada resultado. Exibir totais, filtros aplicados, origem dos dados e última atualização.

**4. Regras para os números serem confiáveis**

Definir e validar as regras dos indicadores antes de implementá-los.

Distinguir claramente **venda, faturamento, recebimento, orçamento e cancelamento**. Cada indicador precisa usar a data e a situação corretas da operação.

Separar valor bruto, desconto e valor líquido. Não somar quantidades de unidades incompatíveis, como peças e metros quadrados.

Manter a Impresilk separada das demais empresas. Tratar devoluções, duplicidades, registros incompletos e mudanças de vendedor conforme as regras existentes.

Identificar meses em andamento e cobertura parcial do histórico. “Todos os anos” deve abranger todo o histórico realmente disponível. Falha de consulta ou ausência de informação deve aparecer como indisponibilidade, nunca como zero.

**5. Inteligência comercial que recomendo acrescentar**

Estas são as melhorias que considero mais valiosas:

- **Radar de recompra:** identificar clientes que costumavam comprar regularmente e passaram do intervalo habitual, mostrando o histórico que sustenta a indicação.
- **Mapa de oportunidades:** localizar produtos comprados por clientes semelhantes que ainda não fazem parte do mix de determinado cliente. Apresentar sugestões explicáveis.
- **Receita em risco:** destacar concentração em poucos clientes, queda de recorrência e aumento de atrasos.
- **Vendas com qualidade:** comparar crescimento das vendas com descontos, margem e recebimento, quando houver dados confiáveis de custo e financeiro.
- **Funil com motivos de perda:** acompanhar orçamento, negociação e fechamento, tempo em cada etapa e causas registradas das perdas.
- **Sazonalidade para planejar campanhas:** mostrar quais produtos e segmentos tiveram maior demanda em cada época, ajudando a preparar campanhas antecipadamente.
- **Resumo executivo acionável:** apresentar as principais mudanças do período e até cinco prioridades, cada uma com evidência e botão para abrir os registros relacionados.
- **Simulador de metas:** calcular cenários de quantidade de vendas e ticket médio necessários para alcançar uma meta, identificando claramente que são simulações.

Recomendações e previsões devem indicar suas bases e limitações. Quando faltar histórico suficiente, informar isso. Qualquer contato, campanha ou alteração de registro seguirá as autorizações existentes.

**6. Velocidade e estabilidade**

Medir o desempenho atual e atacar os gargalos encontrados. Avaliar e aplicar:

- Carregamento do código de cada área somente quando necessário.
- Consultas sob demanda, sem carregar todas as abas na abertura.
- Totais e agrupamentos calculados no servidor para grandes históricos.
- Paginação e renderização apenas das linhas visíveis em listas extensas.
- Cache separado por usuário, permissões e filtros, com atualização após alterações.
- Cancelamento de consultas antigas quando os filtros mudarem.
- Redução de chamadas repetidas, arquivos pesados e renderizações desnecessárias.
- Estados de carregamento estáveis, preservando dados anteriores quando isso for seguro e deixando clara sua atualização.

O React oferece carregamento de componentes sob demanda com `lazy`; sua aplicação deve ser compatível com a arquitetura existente. [Documentação do React](https://react.dev/reference/react/lazy)

Comparar o desempenho antes e depois, incluindo carregamento, resposta aos cliques, estabilidade visual, volume transferido e tempo das consultas. Usar Core Web Vitals como referência, complementados pelas medições das telas autenticadas. [Referência de desempenho](https://web.dev/articles/vitals)

**7. Design system moderno**

Criar um padrão visual reutilizável para toda a Central Comercial: cores, tipografia, espaçamentos, ícones, botões, chips, formulários, tabelas, gráficos, mensagens e estados de carregamento.

Priorizar **cards compactos, boa leitura, tabelas úteis e detalhes recolhíveis**. Oferecer densidade confortável e compacta para listas extensas.

Garantir contraste, foco visível, navegação por teclado e informações compreensíveis sem depender apenas de cores. Usar animações discretas e respeitar a preferência por movimento reduzido.

Modernizar os componentes existentes progressivamente, escolhendo tecnologias por compatibilidade, manutenção e desempenho medido.

**8. Entrega e validação**

Começar pelo inventário das telas, fontes de dados e indicadores existentes. Apresentar a estrutura de navegação e uma prévia visual antes da implementação completa.

Entregar em etapas: **navegação e design system; ferramentas integradas; Dashboard; inteligência comercial**.

Validar cálculos contra registros de origem, permissões, navegação, responsividade e desempenho. Testar operações de escrita com dados fictícios.

Apresentar o que foi implementado, o que depende de dados adicionais e os resultados das verificações. Publicar somente após autorização.