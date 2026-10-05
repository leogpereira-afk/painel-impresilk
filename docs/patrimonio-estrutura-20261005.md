# Patrimônio — Estrutura · 05/10/2026

A aba Estrutura organiza os itens físicos da empresa: ar-condicionado, ventiladores, bebedouros, itens de cozinha, caixas-d’água, portões, motores e outras instalações. O cadastro usa o mesmo registro `ativo/predial` de Manutenções, sem copiar itens ou alterar o inventário existente.

## Entrega

- Cadastro e edição com nome, categoria, identificação, local, responsável, marca/modelo, quantidade, instalação e observações.
- Busca por identificação, nome, local, modelo e responsável; filtro por categoria e paginação.
- Autor e data da última atualização produzidos pelo servidor.
- Relatório de todo o filtro com botão Imprimir / salvar PDF.
- Acesso à ficha e ao histórico do mesmo item em Manutenções, quando a pessoa tem acesso ao módulo.
- Categorias anteriores preservadas; nenhuma reclassificação automática dos dados.
- Preenchimento mantido em falha de conexão, criação idempotente e edição com controle de versão para não sobrescrever outra alteração.

## Verificação

- 367 testes de cálculo aprovados.
- 278 testes de auditoria aprovados, 11 testes de banco omitidos por dependências locais ausentes; nenhum teste falhou.
- Inclui 7 regressões de edição: resposta perdida, repetição do cadastro, recarga tardia e troca do formulário.
- Verificações de autenticação: 85 ações; de permissão de escrita: 52 ações.
- ESLint sem erros; dois avisos preexistentes em Agenda e CalendarioEmpresa.
- Build de produção e classes compiladas aprovados.
- Navegador em ambiente local isolado: inclusão e edição de exemplo, busca por identificação, categoria, relatório filtrado, vínculo com a mesma ficha em Manutenções e formulário em 390 px.
- O relatório foi conferido na tela. A gravação final do PDF pela janela nativa de impressão não foi automatizada.
- Nenhum cadastro real foi criado ou alterado nos testes.

## Publicação

Servidor `painel-ativos` versão 85 publicado antes da interface, com os dois arquivos servidos conferidos contra os fontes locais. Autenticação e campos privados preservados. Não exige migração.

A publicação da interface é disparada separadamente pelo fluxo Pages, para não republicar functions de outros módulos/PCP. A confirmação do fluxo e dos arquivos públicos consta no comprovante local da entrega.
