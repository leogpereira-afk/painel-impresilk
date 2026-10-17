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

O detalhamento das faixas executa o mesmo pipeline que calcula o gráfico, conservando empresa, carteira, cliente, campanha e datas das vendas. Somente títulos vencidos entram na lista; vencimento hoje ou futuro continua fora. O título aparece uma única vez mesmo que esteja ligado a várias O.S. autorizadas. Cliente e vendedor exibidos vêm das O.S. confirmadas, não de descrições livres do título. Sem permissão `contas-atrasadas`, a ação responde 403 antes de ler a fonte financeira.

Correção de auditoria sobre a V1: IDs financeiros repetidos excluem **todas** as ocorrências dos valores confirmados, mesmo que tenham o mesmo valor. Antes, a primeira ocorrência era somada e somente a seguinte era marcada para conferência, deixando o resultado dependente da ordem da fonte. O índice prévio agora identifica repetições antes do filtro de carteira; cada ID ambíguo relacionado à seleção conta uma única vez em `titulosAConferir`, sem expor outra carteira. A regra é compartilhada pelo gráfico e seu detalhe.

Custos/margem e taxa de conversão ficam indisponíveis quando a fonte não sustenta o cálculo.

## Desempenho e limites

A leitura do Dashboard ocorre sob demanda. O servidor busca páginas estáveis de mil O.S., com concorrência máxima de quatro consultas, até cem mil registros. Ao atingir o limite ou falhar uma página, retorna erro e não apresenta um histórico truncado como completo. Coleções auxiliares usam páginas menores. Não se devolvem todas as O.S. na resposta do Dashboard.

Os cálculos são agregados na função de servidor. Índices de catálogo são montados uma vez por execução. Rankings retornam até 500 grupos por dimensão com `rankingsCobertura` explícita; filtros por cliente/produto permitem detalhar grupos além do primeiro recorte. Detalhamento separado usa páginas de até 50 O.S. e mantém o mesmo escopo e filtros.

Benchmark local sintético de desenvolvimento: 20 mil O.S., sete anos, 1.200 clientes e 100 produtos. A indexação reduziu o cálculo de aproximadamente 2.095 ms para 344 ms; resposta de aproximadamente 885 KiB. Isso mede somente o motor local, não rede, banco, navegador ou desempenho de produção.

## Contrato

Entrada `filtro`: `modo` (`mes`, `ano`, `todos`, `personalizado`), `mes`, `ano`, `de`, `ate`, `vendedor`, `cliente`, `produto`, `categoria`, `campanha`, `abcA`, `abcB`.

Saída (versão 2, campos anteriores preservados): `periodo`, `criterio`, `escopo`, `catalogo`, `resumo`, `series.diaria/mensal/anual`, `rankings.produtos/clientes/vendedores`, `rankingsCobertura`, `comparacoes.anterior/anoAnterior/diasUteis/mesCompleto`, `financeiro`, `inteligencia`, `metas`, `abc`, `cobertura`, `fontes`, `avisos`, `consultadoEm`.

### Séries para gráficos

- `series.diaria` traz no máximo 366 pontos; acima disso é `null`, `diariaDisponivel:false`, com `motivoDiaria` e `limiteDias:366`. Mês e ano continuam disponíveis. A janela atual termina em `periodo.ateEfetivo`, sem dias futuros preenchidos com zero.
- Cada ponto tem `data`, `mes` ou `ano`, conforme a granularidade; `de` e `ate` informam as datas exatas que compõem o ponto, incluindo meses/anos parcialmente selecionados.
- `centavos`, `brutoCentavos`, `descontoCentavos`, `pedidos`, `clientes`, `completo` e `estado` usam a mesma apuração do indicador. Zero só aparece quando a cobertura o comprova; dados desconhecidos permanecem `null`. Bruto e desconto não são rateados para filtros de produto ou categoria.
- `descontoPercentual` é desconto dividido pelo bruto, vezes cem, somente quando o ponto está completo, os valores conciliam e o bruto é positivo. Também está disponível em `resumo`.
- `acumuladoCentavos` soma o líquido desde o início efetivo da seleção. Depois de qualquer lacuna ou ponto parcial, permanece `null`, sem transformar a soma observada em acumulado completo.
- `comparacoes.anterior.series` e `anoAnterior.series` usam o mesmo formato e as próprias datas equivalentes. `comparavel:true` exige cobertura completa nas duas janelas. A interface não deve desenhar uma comparação afirmativa quando esse campo for falso. Anos bissextos e meses de durações diferentes mantêm suas datas reais; não se inventa um dia para igualar o tamanho das séries.
- Índices temporais são criados uma vez por granularidade na execução; pontos não revarrem todo o histórico. Janelas comparativas idênticas reutilizam o cálculo dentro da requisição.

### Comparações mensais operacionais

`comparacoes.diasUteis` e `comparacoes.mesCompleto` preservam os intervalos calculados por `anteriorEquivalente`, mas apuram os valores com o mesmo motor confirmado do Dashboard. Cada uma informa `periodo` (anterior), `periodoAtual`, `centavos` (valor anterior), `valorAtual`, `delta`, `percentual`, `completo`, `comparavel`, `estado`, `mensagem`, `criterio`, `calendarioConfigurado`, `diasUteisAtual` e `diasUteisAnterior`. Não duplicam séries: `series:null`.

Dias úteis exigem calendário conferido e quantidade equivalente disponível no mês anterior. Sem isso, os valores comparativos ficam `null`. Meses completos, quando o mês selecionado ainda é o atual, comparam os dois últimos meses fechados, sem substituir os indicadores do mês selecionado. Valores principais exigem cobertura completa da respectiva janela; delta exige ambas e percentual exige base anterior positiva. Ano, todos os anos e recortes incompatíveis não recebem uma comparação mensal por suposição.

### Meta acumulada

`metas.serieAcumulada` retorna `estado`, `periodo`, `metaCentavos`, `pontos` e `criterio`. Os pontos diários somam exclusivamente as vendas reais dos participantes da meta no mês escolhido, até o fim efetivo da consulta. A meta é mensal e deve aparecer como referência final, sem meta diária inventada. `metaCentavos` fica `null` quando faltam metas válidas ou a fonte não foi confirmada. Recorte incompatível ou ausência de participantes retorna `pontos:[]`. Vínculos incompletos impedem acumulado conclusivo.

Cada grupo do ranking inclui valor, pedidos, ticket, quantidades por unidade, participação, ABC, primeira/última compra, datas distintas, intervalo mediano quando verificável, séries mensais/anuais e posição em cada período. `comparacaoPeriodo` traz delta e percentual somente quando comprováveis.

`dashboardDetalhe` recebe o mesmo filtro e `dimensao` (`produto`, `cliente`, `vendedor` ou vazio), `id`, `pagina` e `tamanho`. Retorna `vendas`, `paginacao`, `periodo`, `criterio` e `cobertura`. Cada venda preserva `sinalPagoCentavos` da origem: zero explícito é zero; ausência, vazio ou valor inválido é `null`. Sinal não comprova recebimento. Recebido e saldo conciliado continuam dependentes da consulta financeira do pedido; o agregado de títulos em aberto do Dashboard não substitui essa conciliação.

Para o gráfico de atrasos, a mesma ação aceita `dimensao:'atraso'` e `id:'todos'|'1_7'|'8_30'|'31_60'|'61_90'|'90_mais'`. A resposta contém `tipo:'atrasos'`, `faixa`, `periodo`, `referencia` (dia da posição), `criterio`, `resumo:{centavos,titulos}`, `paginacao` e `cobertura`. `titulos` é uma lista paginada (25 por padrão, máximo 50), com `id`, `os`, `cliente`, `clientes:[{id,nome}]`, `ordens:[{id,numero,data,clienteId,cliente,vendedorId,vendedor}]`, `vencimento`, `centavos`, `atrasoDias` e `faixa`. O resumo soma toda a seleção, não apenas a página. Fonte indisponível mantém valores `null`; zero só é afirmado conforme o mesmo estado de cobertura usado pelo gráfico.

Benchmark V2 final sintético: 20 mil O.S., 1.200 clientes, 100 produtos, cobertura desde 2020, três medições após aquecimento. No recorte todos os anos, V1 levou 210–255 ms e V2 187–251 ms; JSON passou de 1.556.074 para 1.566.796 bytes, sem série diária. No ano atual, V1 levou 125–150 ms e V2 122–137 ms; JSON de 530.793 para 918.996 bytes, incluindo 290 pontos diários e comparações. No mês atual, V1 levou 97–98 ms e V2 102–111 ms; JSON de 195.839 para 228.747 bytes, incluindo 17 dias. Totais foram idênticos nos três recortes. São medições do motor local com dados fictícios, sem rede, banco ou compressão; não demonstram latência em produção.

## Verificação

Testes sintéticos cobrem autorização, revogação, módulos, empresa desconhecida/divergente, ausência versus zero, mais de mil registros, falha de leitura, centavos, unidades, ABC, calendário, comparação, histórico completo, metas, títulos compartilhados e detalhe paginado. Testes existentes do endpoint Comercial são executados como regressão. Prévia usa o mesmo motor, sem banco real.

Auditoria de compatibilidade contra a V1 da revisão `6aa7a27`: 720 cenários confrontaram todos os campos anteriores de apuração e detalhamento, incluindo status de erro. Mantiveram os mesmos valores em séries mensais/anuais, rankings, metas e financeiro; campos adicionados e a versão foram excluídos dessa comparação. A amostra variou filtros de produto/vendedor, carteira individual, empresa externa/ausente, vendedor desconhecido, datas/valores inválidos e lacunas de cobertura. A exceção intencional são IDs financeiros repetidos, cobertos por regressões específicas com valores iguais/divergentes, ordem invertida e outras carteiras. Isso verifica paridade, não substitui os testes específicos dos recursos novos.

Não houve escrita de registros reais nem publicação nesta implementação.
