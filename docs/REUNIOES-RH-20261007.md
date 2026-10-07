# Reuniões vinculadas ao RH — 07/10/2026

Implementação preparada na branch `codex/reunioes-rh-20261007`, a partir de `c74dd9c`, e integrada às mudanças de `8c64504`. Publicação autorizada pelo Léo em 07/10/2026. Código integrado na main em `f03232f`.

## Comportamento

- Organização por Empresa toda, Financeiro, Comercial, Produção e Outros setores.
- Seleção individual ou em grupo, com busca e filtro pelos setores reais do RH.
- Participantes vinculados pelo ID do RH, sem duplicidade; nomes de registros antigos podem ser vinculados sem perder sua presença.
- Diretório retorna somente ID, nome, setor e cargo; nenhum documento, contato, remuneração ou dado de saúde.
- A identificação é validada no servidor e preservada historicamente. Convidados externos continuam disponíveis.
- Presença é marcada separadamente de convite. O PDF dos presentes inclui apenas quem recebeu presença; a lista para assinaturas contém todos os convidados.
- PDFs A4 reais, com paginação, identificação do encontro e espaço para assinatura.
- Reuniões aparecem no Calendário da empresa para quem já possui acesso a Reuniões. Mudanças de data e cancelamentos são refletidos pela leitura da própria reunião, sem duplicar eventos no RH.
- Calendário e ficha possuem links entre si. Nenhum convite ou mensagem é enviado automaticamente.
- Permissões anteriores de edição, controle de concorrência, arquivos, ata, decisões e histórico são preservados.

## Verificações executadas

- Suíte geral: 753 testes, 742 aprovados, 11 ignorados pela suíte, nenhuma falha. A primeira execução não pôde abrir o servidor local usado por um teste; repetida com a permissão necessária, sem mudança de código.
- Cálculos em UTC e estados de acesso: 386 aprovados, nenhuma falha.
- ESLint: zero erros, dois avisos preexistentes nos efeitos de Agenda e CalendarioEmpresa.
- Build de produção aprovado; `git diff --check` aprovado.
- Verificadores do fluxo Pages aprovados: portas, papel, imports, 404, realizado, acessos, gestão, prioridade de cobrança, fotos, CRM, ações Mubisys, preparação de licitação, restauro, classes e sistemas.
- Verificador das três listas de módulos executado com `VIDA_LEO=../reunioes-acessos-20261006`. O caminho padrão `~/Projetos/vida-leo` contém uma cópia anterior aos módulos VOF/Reuniões; não foi alterado.
- Chrome, prévia local com dados fictícios: criação, seleção por setor, vínculo de participante antigo, deduplicação ao adicionar o restante da empresa, presença, salvar, calendário, reagendamento, cancelamento e retorno pela ficha.
- Layout conferido a 390 px; lista e formulário sem transbordamento horizontal. Tamanho normal restaurado. Nenhum erro de console observado.
- Dois PDFs efetivamente baixados pelos botões da tela; texto e renderização conferidos. Exemplo de quatro participantes com quatro espaços para assinatura em uma página A4.
- Testes do contrato cobrem diretório mínimo, status ativo, desligamento, homônimos, vínculos forjados, duplicidade, identificação histórica, agenda sem ata/pessoas, cancelamento, permissões e paginação, além de PDF com 150 participantes.

## Publicação

Após autorização, a função `painel-reunioes` foi publicada como versão 2 (ACTIVE). Os três arquivos recuperados do servidor correspondem integralmente aos arquivos locais: `painel-reunioes/index.ts`, `_shared/reunioes.mjs` e `_shared/cripto.ts`. A autenticação personalizada existente foi preservada.

Verificação após integração com a main: 774 testes, 763 aprovados, 11 ignorados pela suíte, nenhuma falha; build com `BASE_PATH=/painel-impresilk/` aprovado. Não houve migração nem gravação de reunião em produção.

O commit de implementação usou `[skip ci]` para evitar republicação de funções alheias. Este registro dispara somente o fluxo Pages, após a função v2 ter sido conferida. Conferir no ambiente real o diretório mínimo e o calendário sem criar reunião de teste com pessoas reais; registrar resultado e execução do Pages na evidência externa da publicação.
