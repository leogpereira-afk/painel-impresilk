# Comercial — estudo e contrato da primeira entrega

Estudo em 07/10/2026. Trabalho isolado em `codex/comercial-20261007`; publicação não está incluída sem revisão final e autorização.

## Evidência anterior ao desenvolvimento

- React/Vite. Orçamentos, CRM, Cliente360, formatação, impressão, sessão e consultas já existem.
- `painel-dados` lê `painel_cache`, alimentado por scripts paginados no GitHub Actions. O histórico usa `painel_ordens` desde 2020. A consulta somente de leitura confirmou a presença do histórico.
- Cinco vínculos `painel_contas.vendedor_id` preenchidos: todos são nomes, nenhum é ID numérico. O identificador deve ser resolvido pelo catálogo oficial, com correspondência exata e única ou vínculo explícito cadastrado pela direção. Nunca por primeiro nome.
- A rota antiga de orçamentos entregava o cache completo a qualquer conta com o módulo. As portas antigas de leitura, cliente e marcações também precisam de escopo no servidor.
- OpenAPI pública 1.1.0 consultada em `https://api.mubisys.com/docs?api-docs.json`: orçamento, O.S., produto e usuário/vendedor têm GET; não documenta gravação de orçamento nem metas. Os estados documentados de orçamento são ABERTO, CANCELADO e APROVADO. Fases locais não são estados oficiais do ERP.
- O normalizador atual chama a data de cadastro de `dataEnvio`; não é evidência de envio. A nova área trata como cadastro e mantém envio desconhecido.
- O histórico de O.S. armazena valor líquido e itens; não preservava tipo, unidade nem data de aprovação. Não pode certificar exclusão de retrabalho/amostra/devolução no histórico sem uma carga enriquecida.

## Organização

Comercial usa a permissão existente `orcamentos`, preservando concessões. Seis vistas: Meu painel, Orçamentos, Minhas vendas, Meus clientes, Produtos e soluções, Minhas metas. Endereço antigo continua acessível. Consultas, detalhes e exportação usam a mesma resposta autorizada no servidor.

Mubisys é a fonte de vendas, clientes, catálogo e orçamentos. Próximas ações são do Painel, persistidas no servidor com ID do vendedor, cliente/orçamento, autor, versão e histórico. Não escrevem silenciosamente no ERP. Criar/editar orçamento continua no Mubisys, pois a API pública é de leitura para esse recurso.

## Critérios e limites

Venda: uma O.S. por ID, valor total menos desconto do cabeçalho, data de cadastro (critério disponível da carga atual); canceladas, retrabalho, amostra e cortesia não entram. Dados de tipo ausentes são sinalizados, nunca silenciosamente certificados. Documentos fiscais e orçamentos aprovados não são somados de novo às O.S. Devoluções só descontam quando identificadas pela origem: ausência de informação é limitação explícita.

Metas: conforme orientação posterior de Léo, são cadastradas pela direção no próprio Painel, por ID oficial da vendedora e mês. Origem explicitamente indicada como Painel, com autor e data; não são apresentadas como importação do Mubisys. O consolidado soma metas individuais e informa quando faltam cadastros; zero e ausência são distintos. Recortes que não correspondem a um mês completo não recebem uma meta proporcional inventada. Dias úteis dependem do calendário comercial configurado, incluindo exceções e feriados; não inferir calendário por conta própria.

Comparação: período em curso até hoje versus mesmos dias do mês anterior; meses completos são opção separada. Histórico incompleto não vira zero. Base zero não gera percentual de crescimento. Valores monetários em centavos, duas casas. Quantidades separadas por unidade; unidade desconhecida não é presumida como peça.

A carteira segue o responsável atual do cadastro; vendas seguem o responsável histórico da O.S. Revisões só se agrupam com vínculo explícito da origem, nunca pela semelhança entre cliente, valor ou título.


## Persistência e ativação

- `comercial_acoes`: próxima ação, cliente, orçamento, responsável, versão e histórico de alterações, em `painel_registros`.
- `comercial_metas`: uma meta por vendedor/mês, em `painel_registros`, origem Painel, autoria e horário do servidor, com conferência da versão anterior antes de sobrescrever.
- `comercial_config`: vínculos oficiais, equipes, calendário e prazos; direção apenas.
- Essas coleções entram no mecanismo de backup existente. Credenciais do ERP continuam exclusivamente no servidor/Actions.

A publicação precisa seguir esta ordem, após autorização:
1. Executar a migração `20261007_comercial.sql` (coluna de metadados do histórico e função atômica das ações). Ela ainda não foi aplicada ao banco real.
2. Publicar primeiro `painel-cache`, que aceita o novo catálogo, e executar a carga oficial de vendedores/produtos. Confirmar o resultado completo e os IDs; dados parciais não substituem a cópia anterior.
3. Conferir os cinco vínculos legados de usuário por nome, convertendo os ambíguos em vínculo explícito. Não liberar acesso por primeiro nome ou aproximação.
4. Publicar `painel-comercial`, `painel-dados` e `painel-config` com as dependências compartilhadas. Só então publicar a interface.
5. Na direção, cadastrar calendário e metas mensais. Conferir com contas de vendedora e gestor, incluindo PDF; confirmar os totais com os mesmos filtros.

Não executar as portas antigas com escopo novo antes de preparar o catálogo: isso bloquearia contas que ainda não têm vínculo resolvido. O fluxo atual de criação/edição no ERP continua disponível.

## Conferência feita nesta entrega

A consulta somente de leitura da base sincronizada em 07/10/2026 foi reconciliada com o novo cálculo por pedido, produto e categoria, mantendo os retrabalhos separados. Os valores e as contagens estão no relatório local da entrega, fora do repositório público. Essa é uma reconciliação com a cópia sincronizada; não substitui uma nova consulta autenticada diretamente ao ERP no momento da implantação.

Foram testados identidade exata/ambígua, ausência de vínculo, acesso indevido por vendedora, detalhes, configuração restrita, paginação acima de 500 registros, falha de fonte, ausência/zero, exclusões, centavos, unidades, revisões explícitas, comparações, calendário, cadastro de meta, autoria, tarefas e conflitos de edição. A prévia usa exclusivamente exemplos fictícios; gravações de teste não atingem a produção.

## Dependências que permanecem explícitas

- O catálogo comercial novo tem contrato validado na documentação pública e testes com respostas simuladas; sua primeira leitura autenticada será conferida durante a ativação.
- Tipos das O.S. antigas precisam de recarga enriquecida para um histórico totalmente verificável; registros incompletos não entram silenciosamente no realizado.
- Data efetiva de envio, vínculo de revisão/conversão e devoluções não foram confirmados na integração atual. A interface não os inventa.
- Unidades de medida ausentes aparecem como não informadas. Não converter peças, m² e metros lineares.
- O SQL novo foi revisado, mas não executado em PostgreSQL nesta máquina nem aplicado ao banco real.
- PDFs reutilizam a impressão do navegador com o recorte autorizado. Não há exportação de dados fora da permissão da vendedora.
