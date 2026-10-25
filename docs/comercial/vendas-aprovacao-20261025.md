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

## Resultado da publicação

- PR 27 integrado em `a28ae37`; atualização documental da Inteligência em `3a9f152` preservada.
- Servidor conferido: `painel-cache` v173 e `painel-comercial` v101 ACTIVE. Os arquivos publicados correspondem ao código testado; acesso sem sessão continua retornando 401.
- Functions 40189305636, sincronização histórica 40189031955 e Pages 40189500991 concluídos com sucesso.
- Sete janelas anuais de aprovação confirmadas, desde 2020 até a data da carga. O carregador mantém a atualização por aprovação nas cargas seguintes.
- Na sessão real do site, as quantidades e somas das linhas de vendas e de retrabalho fecham com a referência fornecida pelo dono; o total combinado e a separação aparecem no resumo.
- Quantidade de registros e IDs distintos preservada; hash dos IDs e itens idêntico antes/depois. Cópias de recuperação e evidências reais guardadas somente em arquivos privados fora do Git.
- Dez arquivos servidos conferidos byte a byte com o build local. CI: 1.751 testes da raiz, 1.402 de cálculos e 7 de acesso aprovados; build concluído e lint sem erros (aviso anterior em Agenda).

Nenhuma O.S. fictícia foi criada; nenhum cadastro foi excluído e não houve escrita no ERP.
