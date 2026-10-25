# Vendas pela data de aprovação

## Diagnóstico

O Comercial selecionava vendas pela data de cadastro da O.S. O resumo de O.S. do ERP seleciona pela aprovação. Uma O.S. cadastrada em outro mês ou ano, mas aprovada no período consultado, ficava fora do Comercial. A conciliação somente leitura confirmou essa diferença. Os arquivos e valores reais permanecem fora do repositório.

## Correção

- Preservar a data de cadastro e guardar `dataAprovacao`, sem inventar aprovação quando a origem não a informa.
- Consultar a origem também por APROVACAO nas cargas completa, incremental e histórica, mesclando pelo ID da O.S.
- Apurar vendas, comparativos, metas, gráficos e detalhes pela aprovação. Manter o consolidado Impresilk e Universo e os filtros de autorização existentes.
- Excluir canceladas e separar retrabalho das vendas normais. Exibir também o total de O.S. normais mais retrabalho, com o detalhe acessível.
- Certificar a cobertura da aprovação em `ordens_aprovacao`, separada da cobertura antiga por cadastro. Falha de leitura ou gravação não certifica cobertura. Ausência de cobertura não vira zero confirmado.
- Preservar aprovação já sincronizada se um escritor antigo omitir o campo. `null` explícito da origem continua válido para remover aprovação.
- Manter os valores das metas cadastradas; o realizado passa a seguir a data de aprovação. Aceitar o identificador legado da meta sem regravar cadastros.

Nenhuma migração de estrutura é necessária: a aprovação utiliza o JSONB comercial existente. A carga histórica da aprovação não substitui os itens já preservados na tabela.

## Verificação local

- Regressão inicialmente reproduzida e depois corrigida: O.S. cadastrada em ano anterior e aprovada no mês atual.
- Casos de aprovação futura/ausente, cancelamento, retrabalho, filtros por vendedor e cobertura independente.
- Rotas reais de servidor exercitadas com banco simulado e perfis fictícios.
- Cargas completa/incremental/histórica, deduplicação, preservação dos metadados e falhas de persistência.
- Suíte raiz: 1.738 testes aprovados. Cálculos: 1.402 aprovados. Acessos: 7 aprovados. Após ajustes finais, 282 testes pertinentes aprovados.
- Build de produção aprovado. Lint sem erros; permanece um aviso anterior em Agenda.jsx.
- Conferências de imports, portas, papéis, 404 e realizado aprovadas.
- Prévia local no navegador com dados fictícios: aprovação de O.S. antiga, filtros por vendedor, detalhe de retrabalho e total separado.
- Conciliação privada com a origem reproduziu o resumo fornecido pelo dono, sem gravar registros reais.

## Publicação autorizada em 25/10/2026

O dono autorizou priorizar esta correção, atualizar a sincronização e conferir o site, preservando os dados reais e o trabalho da Inteligência.

1. Atualizar main e reler a vez antes de integrar mudanças concorrentes.
2. Publicar primeiro `painel-cache`, que aceita e preserva `dataAprovacao`.
3. Disponibilizar os novos carregadores e executar a sincronização/carga de aprovação para o histórico necessário, sem substituir itens ou cadastros. Conferir registros por ID, cancelamentos, totais e cobertura `ordens_aprovacao` antes de liberar o novo cálculo.
4. Publicar `painel-comercial` com seus módulos compartilhados. Conferir API autenticada, escopo por vendedor e resumo por aprovação.
5. Publicar a interface e verificar os arquivos servidos, o período relatado, o detalhamento, o Dashboard e os filtros no site.

Não foi feita publicação, carga de dados ou alteração de cadastros em produção nesta etapa.
