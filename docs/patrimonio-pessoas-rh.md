# Pessoas do Patrimônio vinculadas ao RH

O responsável é uma referência ao ID oficial do colaborador do RH. Nomes iguais não estabelecem vínculo e não são usados para combinar cadastros.

## Fonte e campos

`painel-config`, ação `pessoasPatrimonio`, consulta a coleção `colaboradores` da tabela `registros`, a mesma fonte já utilizada por `painel-gestao`. A consulta é paginada e projeta somente ID, nome e os campos necessários para identificar desligamento. A resposta contém apenas `id`, `nome` e `disponivel`.

A leitura exige sessão válida e acesso a Patrimônio, Manutenções ou Documentos, que editam os mesmos ativos físicos. Nenhum documento pessoal, salário, foto ou contato do RH integra essa consulta.

Referências salvas:

- Bens e ativos físicos: `responsavelId`.
- Ramais, armários, caixas, camas e celulares: `pessoaId`.
- Entregas e devoluções de ferramentas: `pessoaId` em cada movimento.
- Motorista padrão: `especificacao.motoristaId`.

O servidor confirma a existência e disponibilidade do ID e preenche o nome oficial. Colaboradores ativos podem receber novos vínculos. Um vínculo existente continua preservado após desligamento ou retirada do cadastro. A devolução aceita quem já recebeu o item, inclusive ex-colaborador.

## Cadastros e histórico anteriores

Não há migração automática por nome. Um nome antigo permanece visível e pode ser conservado ao editar outros campos. Para mudar a pessoa, o usuário escolhe um colaborador no seletor do RH. O formulário identifica o cadastro antigo que ainda precisa dessa confirmação.

Movimentos anteriores sem ID permanecem separados dos movimentos novos vinculados ao RH. A devolução de uma entrega antiga utiliza a pessoa daquela entrega, sem inventar um ID. Nomes e autoria históricos não são reescritos quando o RH atualiza o nome do colaborador.

O campo `local` do ramal é separado da pessoa; telefone continua opcional. Local e telefone não estabelecem vínculo com colaborador.

Falha na consulta ao RH não vira lista vazia. A interface oferece nova tentativa e impede novas escolhas enquanto a consulta falha. O servidor interrompe a gravação com mensagem de indisponibilidade. IDs duplicados no RH impedem a vinculação, sem unir fichas silenciosamente.

## Publicação

Requer autorização específica do dono. Publicar `painel-config` e `painel-ativos` com seus módulos compartilhados antes da tela. Confirmar a nova ação autenticada e as permissões; depois publicar a tela e verificar no Chrome a lista real, a seleção por ID e a edição dos cadastros existentes. A publicação não migra registros antigos nem cria vínculos por similaridade de nome.

## Verificação local

Os testes cobrem projeção e paginação do RH, permissões, nomes iguais, nome forjado, ID inexistente, desligamento, registros anteriores, atualização de nome, saldos por pessoa, devoluções, concorrência e preservação de etiquetas, anexos e histórico. A prévia utiliza exclusivamente dados fictícios e mantém alterações apenas na memória da aba.
