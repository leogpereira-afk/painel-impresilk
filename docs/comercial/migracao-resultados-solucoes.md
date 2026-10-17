# Migração de Resultados e Soluções para a Central Comercial

Implementação local de 17/10/2026. Nenhuma publicação ou alteração de registros reais é parte desta validação.

## Resultados

- `ResultadosComerciais` é montado sob demanda pelo Dashboard, com o filtro e o período já validados pelo motor analítico.
- A lista de vendas usa `dashboardDetalhe`, preservando IDs, empresa confirmada, vendedor, cliente, produto, categoria, campanha e período. Há paginação de 25 pedidos.
- Cada linha é recolhível. Identificação, cliente/vendedor e líquido do recorte ficam visíveis; os dados financeiros completos são consultados somente ao expandir.
- `consultarPedido` usa o ID original. A resposta é conferida também pelo número e por eventual empresa explicitamente divergente antes de associar o financeiro.
- Sinal registrado, recebido e saldo conciliado mantêm campos separados. A conciliação reaproveita `resumoFinanceiroComercial`; falta de prova permanece “A conferir”. O saldo em aberto não é rotulado automaticamente como atraso.
- Quando um produto está filtrado, o líquido da linha corresponde ao produto selecionado; o financeiro expandido é identificado como da O.S. inteira.
- Consulta de andamento, histórico do cliente, contato, acompanhamento e pós-venda reaproveitam os componentes e autorizações existentes.
- Metas cadastradas são consultadas e editadas no Dashboard. Formulários de meta e regras/calendário são compartilhados com a rotina operacional. O realizado exibido provém do motor novo, com empresa confirmada, e não dos totais legados.

## Fonte auxiliar

A nova ação autenticada `apoioComercial` retorna catálogo, regras, metas e ações da carteira. Não consulta O.S., títulos financeiros ou histórico de clientes. Vendedoras recebem somente sua carteira; vínculos de acesso e equipes de configuração permanecem restritos à gestão. A ação é exclusivamente de leitura.

## Soluções

- Catálogo, materiais, aplicações, ficha completa, validação, foto autorizada, complementos e edição pela gestão foram movidos para `SolucoesComerciais`.
- Pesquisa integrada encontra conteúdo do catálogo e das fichas. Há filtro por categoria, resumos recolhíveis e paginação incremental.
- Dicas por linha de solução, checklist e planejamento de ações permanecem disponíveis.
- Os números de desempenho por produto/categoria passam a ser consultados no Dashboard, usando empresa e período comprovados.

## Diferenças que não devem ser ocultadas

O antigo relatório operacional não utilizava a mesma exigência de empresa de origem do Dashboard. Seus totais não podem ser simplesmente transplantados. A migração usa a fonte analítica para as vendas e reutiliza a fonte operacional apenas nas consultas de cada registro e nos cadastros.

O bloco recolhível “Análises complementares e critérios” preserva o acesso às negociações e aos perfis de clientes. Aprovação de orçamento não é conversão em O.S. O percentual de aprovação só poderá ser integrado aos totais certificados quando empresa, revisões e cobertura estiverem comprovadas. Classificações de clientes na carteira mantêm seus próprios critérios; não são agregadas silenciosamente aos indicadores novos.

## Validação controlada

`tests/comercial-resultados-migracao.test.mjs` cobre associação exata da O.S., divergência de empresa, financeiro parcial/indisponível, períodos de metas, consulta auxiliar restrita por carteira, ausência de leitura histórica/financeira e falhas de fonte.

`tests/browser/resultados-comerciais.mjs` exercita a prévia isolada com rede externa bloqueada: expansão de pedido, conciliação financeira, histórico/retorno, edição de meta em memória, restrição de perfil comercial e disposição no celular.

A prévia compartilha identidades fictícias entre o motor analítico e os diálogos operacionais; edição de metas é exclusivamente em memória. A execução dos testes deve ser conferida antes de declarar aprovação.
