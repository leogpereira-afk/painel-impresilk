# Compromissos: identidade existente do RH

Implementação local concluída em 11/10/2026, conforme o pedido de vincular o ID do RH sem criar outra identificação. Publicação ainda não executada.

## Comportamento

O responsável continua identificado pelo login para aplicar as permissões da agenda. A identidade da pessoa vem da conta central já cadastrada: `acesso_conta.colaborador_id` referencia a ficha em `registros` / `colaboradores`; `acesso_conta.id_pessoa` é o código existente exibido como ID RH. Não se calcula outro código, não se consulta CPF e não se associa por nome.

Nome atual e foto da ficha aparecem nas linhas, nos chips, no formulário e no encaminhamento. A busca aceita o código do RH. Sem foto válida, aparecem iniciais. Fotos não são duplicadas nos compromissos; são consultadas pela ficha, com projeção fechada e sem URLs externas.

Criação e encaminhamento exigem acesso a Compromissos, conta central vinculada, ficha disponível e aprovação da verificação de revogação já existente. A escolha envia a chave da ficha para detectar mudança de vínculo entre a seleção e a gravação. Vínculos ambíguos ou ausentes não são resolvidos automaticamente; a tela orienta conferir Sistemas e configurações → Pessoas.

O servidor grava `donoRhId` e carimba os eventos novos com `quemRhId` e o código existente quando disponível. Encaminhamentos preservam a origem e o destino, a conversa e os anexos. Eventos antigos mantêm seus nomes e não recebem identidades retroativas inventadas. A leitura não migra registros; um legado sem chave pode ser apresentado pelo vínculo central e receber essa referência ao ser salvo normalmente. Uma chave já persistida nunca é trocada silenciosamente em edição comum.

Continuam valendo a filtragem por login e a gravação com comparação do estado anterior. O registro usado na gravação passa novamente pelo crivo do dono, impedindo alteração pela pessoa anterior quando houve encaminhamento entre as consultas. Dados pessoais privados e permissões não são retornados pelo novo diretório mínimo.

## Verificação local

- 25 testes pertinentes aprovados: homônimos, logins de papel, paginação, ficha apagada, conta/papel inativo, desligamento, falha de consulta, IDs forjados, escolha antiga, legado, histórico, revogação e concorrência de dono. Incluem execução do handler real com transporte e banco simulados.
- Suíte completa: 1.800 casos, 1.716 aprovados, zero falhas e 84 condicionais de banco não executados. PostgreSQL/PGlite não estava configurado para esses casos; não há SQL nem migração nesta mudança.
- Compilações de produção e revisão aprovadas. Lint sem erros; um aviso anterior em `Agenda.jsx`, fora do escopo.
- Todos os 15 verificadores usados na publicação aprovados, incluindo portas, papel, imports, fotos, sistemas e classes de cor compiladas. O verificador de sistemas utilizou `equipe-auth` da main atual do vida-leo, obtida somente para leitura.
- Navegador: busca pelo código, criação, encaminhamento, conclusão, reabertura e edição conferidos com dados fictícios. Foto carregada e IDs de autor/destinatário visíveis. Desktop de 1.440 px e celular de 390 px sem transbordamento horizontal e sem erros JavaScript.

Evidências privadas fora do Git: `/private/tmp/compromissos-rh-revisao.png`, `/private/tmp/compromissos-rh-celular.png` e `/private/tmp/compromissos-rh-tests-final.log`. Nenhum registro real foi criado ou alterado.

## Publicação pendente

Obter autorização específica conforme `AGENTS.md`. Publicar e confirmar `painel-config` com o módulo compartilhado antes de liberar a tela dependente. Não é necessário modificar o RH, cadastrar pessoas ou aplicar migração. Preservar alterações paralelas da main ao preparar a publicação.

Depois, verificar a versão oficial e o diretório autenticado com pessoas já cadastradas, conferir fotos/códigos e a separação de agenda com conta restrita. Não salvar registros fictícios em produção. A confirmação do vínculo real depende dos cadastros centrais existentes; vínculos faltantes devem ser corrigidos pelo fluxo de cadastro autorizado da tela.
