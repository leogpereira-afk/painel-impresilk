# Empresas — carteira comercial e cadastro fornecedor

Prévia local de 03/11/2026, continuação de Regiões. Não publicada.

## Fluxo entregue

- Aba Empresas com linhas compactas, detalhes recolhíveis, indicadores e filtros de busca, cidade, etapa e prioridade.
- Ficha da empresa compradora com cidades, responsável interno, contato, prazo, próxima ação e observações. É a mesma entidade de Regiões, por ID.
- Preparação do nosso cadastro de fornecedor na empresa: nossa pessoa jurídica, portal, situação, protocolo, validade, exigências e documentos já autorizados.
- O portal precisa ser conferido pelo operador; salvar no painel não envia inscrição externa.
- Cadastro ativo em verde, pendências e retorno atrasado priorizados, histórico preservado. Nenhuma oportunidade é inferida por nome de empresa.

## Persistência e recuperação

Reutiliza serviços e permissões existentes. Empresa compradora não é titular do cadastro: titular identifica nossa pessoa jurídica fornecedora.

O salvamento mantém duas etapas explícitas. Primeiro grava o cadastro; depois relê a entidade e acrescenta apenas o ID do vínculo com a versão atual. Se a segunda etapa falhar, o cadastro permanece salvo e a repetição executa somente o vínculo. Portal equivalente e mesma empresa fornecedora recuperam a ficha existente mediante escolha explícita, sem substituir seus dados. Conflito de edição conserva o preenchimento. Respostas de sessão antiga não fecham formulários novos nem alteram a carteira atual.

## Verificação

- 326 testes de Licitações/documentos passaram, incluindo estados da carteira, busca, permissões, vínculos, duplicidade, conflito e falha parcial.
- Suíte geral: 2.140 casos; 2.138 passaram no ambiente restrito. Os dois bloqueados por abertura de porta local passaram ao repetir `tests/publicar-sistemas.test.mjs` com sua execução local permitida (7/7).
- Builds oficial e revisão passaram. ESLint sem erros; permanece somente o aviso preexistente em Agenda.jsx:168.
- Verificadores de portas, papéis e preparação de licitação passaram.
- Ensaios React com serviços fictícios: empresa selecionada fora da primeira página, estado ocupado após troca de sessão, rascunho novo preservado após retorno antigo, reutilização do FormEntidade e conflito. A retirada da proteção no bundle temporário reproduziu a falha de sessão; código atual aprovado.
- Navegador: inclusão de empresa fictícia, criação do cadastro fornecedor, repetição do mesmo portal, manutenção dos dados originais, vínculo único em Regiões, edição, filtros, detalhes e tema escuro conferidos. Larguras 1280, 390 e 320 px sem transbordamento horizontal; formulário móvel com controles acessíveis. Corrigida a posição do nome da empresa no topo da linha móvel.

- Primeira abertura da prévia: preparação das entidades e dos cadastros sincronizada; teste reproduziu os vínculos incompletos antes do ajuste e passou após a correção.

## Limites e publicação futura

A demonstração usa dados fictícios e descarta alterações ao recarregar. Nenhuma inscrição, mensagem, migração externa ou gravação produtiva foi realizada. Regiões e Participar ainda têm dependências locais descritas nos documentos próprios. Antes de eventual publicação, conciliar o avanço da main (3ce5c78 lida nesta etapa), preservando a publicação de Documentos/Cadastros, e respeitar servidor antes da interface. Esta etapa não publica automaticamente.
