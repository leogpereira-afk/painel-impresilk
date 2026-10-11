# Compromissos: identidade existente do RH

Implementação local concluída em 11/10/2026, conforme o pedido de vincular o ID do RH sem criar outra identificação. Léo autorizou a publicação com “subir” após a revisão.

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

## Publicação autorizada

Servidor publicado antes da tela: `painel-config` v123 ACTIVE. Os 14 arquivos da função e das dependências foram recuperados pelo conector e comparados integralmente com o código validado. Cópia anterior privada preservada fora do Git. A liberação da tela está em andamento. Não foi necessário modificar o RH, cadastrar pessoas ou aplicar migração; a main atual estava contida no ramo da revisão.

Depois, verificar a versão oficial e o diretório autenticado com pessoas já cadastradas, conferir fotos/códigos e a separação de agenda com conta restrita. Não salvar registros fictícios em produção. A confirmação do vínculo real depende dos cadastros centrais existentes; vínculos faltantes devem ser corrigidos pelo fluxo de cadastro autorizado da tela.

## Conferência oficial concluída · 11/10/2026

- Código `0117f1d`, liberação `b99705e`; GitHub Pages 38176183363 e Edge Functions 38176183434 concluídos com sucesso.
- Servidor final `painel-config` v124 ACTIVE. Os 14 arquivos da versão recuperada após o workflow são idênticos aos revisados; autenticação e permissões existentes preservadas.
- `index.html`, JavaScript e CSS principais e os dois arquivos de Compromissos em produção são idênticos, byte a byte, ao build local.
- Navegador autenticado como Direção: nomes atuais, fotos carregadas, códigos existentes, busca preservando zero inicial, identidade no novo compromisso e seleção do destinatário no encaminhamento conferidos. Formulários cancelados antes de salvar. Sem transbordamento horizontal e sem erros JavaScript na verificação.
- A conta sem ficha confirmada permanece indisponível para receber; nenhum vínculo foi inventado ou corrigido automaticamente. A correção continua em Sistemas e configurações → Pessoas, pelo cadastro existente.
- Nenhum dado real, credencial, ID de pessoa ou fotografia incluído no Git. Evidência visual privada em `/private/tmp/compromissos-rh-publicado.png`.

Limite da verificação: escrita, concorrência e perfis restritos cobertos por testes dos handlers com transporte/banco/autenticação simulados. Não havia sessão de uma conta restrita real para essa conferência; não foram criados registros de teste em produção. A publicação do código e a leitura autenticada da Direção estão confirmadas.
