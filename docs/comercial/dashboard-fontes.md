# Dashboard da Central Comercial — contrato e limites

## Fronteira de leitura

`painel-comercial` autentica o crachá, consulta revogação e exige o módulo `orcamentos` antes de atender `dashboard` ou `dashboardDetalhe`. As duas ações são somente leitura. Elas passam por `consultarDashboard` antes do contexto operacional antigo, sem carregar clientes completos, contatos, notas de ações ou consultar o ERP ao vivo.

O escopo usa `resolverEscopo` e `pertence`, os mesmos validadores do Comercial. Um vendedor recebe apenas sua carteira. Direção pode filtrar vendedores; o catálogo permite trocar a seleção sem conceder acesso adicional. Campanhas e financeiro exigem seus próprios módulos. Não há cache compartilhado de respostas entre sessões.

## Fontes

- `painel_ordens`: histórico persistido, com projeção de identificação, data de cadastro, valor líquido, bruto, desconto, itens e metadados comerciais.
- Cache `ordens`: enriquecimento recente, deduplicado por ID. Metadados históricos mais novos preservam cancelamento e identidade.
- `comercial_catalogo`: identificação oficial de vendedores e produtos. Nome de produto só é vinculado ao catálogo quando a correspondência normalizada é única.
- `comercial_carga_status`: somente janelas concluídas comprovam cobertura temporal. Lacunas não são preenchidas artificialmente.
- `comercial_config` e `comercial_metas`: vínculos, participantes, calendário e metas mensais já cadastradas.
- Coleção `campanhas`: somente identificação e IDs de O.S. para filtrar vendas vinculadas; sem replicar faturamento manual ou despesas.
- Cache `recebiveis`: saldo restante dos títulos em aberto. O valor normalizado já desconta pagamentos; não se subtrai `pago` novamente.
- Cache `orcamentos`: situação dos orçamentos de origem preservada, com revisões explícitas agrupadas. Não comprova conversão por coorte, tempo até fechamento ou motivo de perda.

## Empresa e integridade

Somente registros com nome explícito da empresa e correspondência exata normalizada a `Impresilk`, `Impresilk Comunicação Visual` ou `Impresilk Comunicação Visual Ltda` entram nos indicadores, rankings e detalhamentos da Impresilk. Não se usa nome do cliente, vendedor, domínio ou conta para inferir empresa.

Registros sem empresa são separados em `resumo.empresaNaoIdentificadaCentavos` e `empresaNaoIdentificadaPedidos`. Eles não compõem `resumo.centavos`, rankings, gráficos ou recomendações. A presença de pendências no período impede `completo`. Empresas explicitamente diferentes são excluídas e contabilizadas na cobertura; uma empresa divergente corretamente excluída não invalida o período da Impresilk.

Os importadores passam a preservar a empresa declarada pela fonte. Isso não confirma um preenchimento retroativo: o legado permanece pendente até nova leitura autorizada. Os nomes permitidos são deliberadamente exatos; nomes não reconhecidos exigem validação antes de ampliar a correspondência.

## Regra dos indicadores

Venda é O.S. normal não cancelada, líquida de desconto, na data de cadastro. Não equivale a faturamento ou recebimento. Tipos especiais, datas futuras e registros sem valor ou tipo verificável são separados/excluídos conforme sua condição. Devoluções sem vínculo não são abatidas por suposição.

Todos os valores monetários da resposta são centavos inteiros. O líquido é rateado pelos pesos dos itens com divisão inteira `BigInt` e distribuição dos restos, conservando cada centavo. Se os itens não forem utilizáveis, a parcela fica em `Itens não disponíveis`; filtros por produto/categoria não passam a ter cobertura completa enquanto houver vendas não classificáveis. Quantidades só são agregadas por unidade explícita e quando o registro não estiver marcado como unidades não confirmadas. Não se infere unidade a partir do catálogo.

Curva ABC usa limites `abcA` e `abcB` (80%/95% por padrão). O item que atravessa o limite permanece na classe em que começou. A regra e os limites seguem na resposta.

Comparações usam datas equivalentes, respeitam meses em andamento e fevereiro bissexto. Percentuais não são calculados com cobertura incompleta ou base anterior zero. Quedas de produtos incluem produtos que zeraram, mas exigem itens identificados nos dois períodos. A mediana de recompra exige ao menos três datas, continuidade de cobertura e ausência de vendas com origem pendente do cliente.

## Financeiro

O índice é `saldo vencido / saldo em aberto dos títulos sincronizados vinculados integralmente às vendas selecionadas`. A fonte atual inclui vencidos desde 2015 e pendentes até 90 dias após a carga; não representa todas as parcelas futuras nem uma posição histórica na data final escolhida.

Títulos mistos com O.S. fora da seleção, números de O.S. repetidos, vínculos ausentes ou dados inválidos não são atribuídos ao cliente/vendedor por suposição. Esses casos impedem índice definitivo. Filtro por produto/categoria retorna `filtro_incompativel`, pois o título não comprova uma dívida por produto. `titulos` conta abertos; `titulosVencidos` conta vencidos; `clientes` conta clientes vencidos identificados.

Custos/margem e taxa de conversão ficam indisponíveis quando a fonte não sustenta o cálculo.

## Desempenho e limites

A leitura do Dashboard ocorre sob demanda. O servidor busca páginas estáveis de mil O.S., com concorrência máxima de quatro consultas, até cem mil registros. Ao atingir o limite ou falhar uma página, retorna erro e não apresenta um histórico truncado como completo. Coleções auxiliares usam páginas menores. Não se devolvem todas as O.S. na resposta do Dashboard.

Os cálculos são agregados na função de servidor. Índices de catálogo são montados uma vez por execução. Rankings retornam até 500 grupos por dimensão com `rankingsCobertura` explícita; filtros por cliente/produto permitem detalhar grupos além do primeiro recorte. Detalhamento separado usa páginas de até 50 O.S. e mantém o mesmo escopo e filtros.

Benchmark local sintético de desenvolvimento: 20 mil O.S., sete anos, 1.200 clientes e 100 produtos. A indexação reduziu o cálculo de aproximadamente 2.095 ms para 344 ms; resposta de aproximadamente 885 KiB. Isso mede somente o motor local, não rede, banco, navegador ou desempenho de produção.

## Contrato

Entrada `filtro`: `modo` (`mes`, `ano`, `todos`, `personalizado`), `mes`, `ano`, `de`, `ate`, `vendedor`, `cliente`, `produto`, `categoria`, `campanha`, `abcA`, `abcB`.

Saída: `periodo`, `criterio`, `escopo`, `catalogo`, `resumo`, `series.mensal/anual`, `rankings.produtos/clientes/vendedores`, `rankingsCobertura`, `comparacoes.anterior/anoAnterior`, `financeiro`, `inteligencia`, `metas`, `abc`, `cobertura`, `fontes`, `avisos`, `consultadoEm`.

Cada grupo do ranking inclui valor, pedidos, ticket, quantidades por unidade, participação, ABC, primeira/última compra, datas distintas, intervalo mediano quando verificável, séries mensais/anuais e posição em cada período. `comparacaoPeriodo` traz delta e percentual somente quando comprováveis.

`dashboardDetalhe` recebe o mesmo filtro e `dimensao` (`produto`, `cliente`, `vendedor` ou vazio), `id`, `pagina` e `tamanho`. Retorna `vendas`, `paginacao`, `periodo`, `criterio` e `cobertura`.

## Verificação

Testes sintéticos cobrem autorização, revogação, módulos, empresa desconhecida/divergente, ausência versus zero, mais de mil registros, falha de leitura, centavos, unidades, ABC, calendário, comparação, histórico completo, metas, títulos compartilhados e detalhe paginado. Testes existentes do endpoint Comercial são executados como regressão. Prévia usa o mesmo motor, sem banco real.

Não houve escrita de registros reais nem publicação nesta implementação.
