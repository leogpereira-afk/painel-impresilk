# A Virada — preparação da publicação e recuperação

Estado: publicado e conferido em 15/11/2026. Autorização expressa para módulo, PDFs e integração externa; mapeamento exato dos acompanhadores confirmado antes de salvar. Nenhum dado pessoal ou documento real versionado.

## Conferência da publicação

- Servidor publicado antes da interface: implementação fec229f; interface 60700c8; ajuste de elegibilidade da direção 530fd86. Pages 43766884148 e Functions 43766884150 concluídos com sucesso. Integração externa eed69bf, equipe-auth v94 ativo.
- Código produtivo relido, 212 arquivos HTML/JS/CSS iguais ao build oficial por SHA-256; 401 sem sessão. RLS e bloqueio de leitura anônima conferidos; bucket privado.
- Sete PDFs publicados pelo navegador no plano correto e baixados pelo site oficial, com todos os bytes idênticos e hashes persistidos conferidos. Seis páginas por pessoa, capa com foto, fundo branco, bordas coloridas e conteúdo sem numerologia. As 42 páginas foram renderizadas e revisadas; missão, visão e 12 valores preservados.
- Mapeamento de acesso confirmado pelo dono e salvo. Duas pessoas ainda dependem do fluxo de cadastro de contas para acesso individual. Os documentos já estão disponíveis à direção e aos acompanhadores autorizados.
- Ciclo sem data de início e sem missões presumidas. A contagem não começou. Cargo do programa separado do RH.
- Verificação: 57 testes focais, regressões completas e verificadores da CI aprovados. Ensaios de backup/recuperação com dados sintéticos; não foi executado restauro em produção. Cópia privada do ciclo e originais dos sete PDFs preservados fora do Git.

As seções seguintes documentam o procedimento e os limites da integração.

## Integração conferida

- O programa usa `painel-virada`, JWT próprio do Painel e permissão `virada`; projeto Supabase público de referência `heveemylixartyijxewh`.
- `scripts/publicar-functions.sh` descobre toda pasta em `supabase/functions/*/` que contenha `index.ts`, excluindo `_shared`. Também envia recursivamente os helpers `.ts`, `.mjs` e `.js`. A nova função e `virada.mjs`/`virada-backup.mjs` entram automaticamente.
- O script configura `verify_jwt=false` porque a própria função valida o crachá do Painel. Isso não torna os dados públicos: assinatura, revogação, permissão e escopo de cada registro são verificados no handler.
- `.github/workflows/functions.yml` reage às alterações de `supabase/functions/**` na main e executa o publicador. O ambiente de publicação existente deve continuar respeitado. Não alterar workflow nem contornar a restrição de ramo.
- Não há deploy de migrations implícito nesse publicador. As três migrations devem ser aplicadas e conferidas antes da publicação das funções que dependem delas.

## Integração externa de acesso

A string `virada` precisa existir na lista de módulos do frontend, na lista de `painel-auth` e no `equipe-auth` mantido em `vida-leo`. O script `conferir-sistemas.mjs` compara essas listas.

O `origin/main` de vida-leo consultado não contém AGENTS.md nem VEZ.md. O dono autorizou expressamente em 15/11 a alteração pontual de `MODULOS_PAINEL` em `equipe-auth`, em clone isolado da main atual. Depois, conceder `virada` somente às contas e fichas aprovadas, pelo fluxo existente de Sistemas de acessos. Permissão `*` não transforma usuário em direção.

## Backup do programa

O backup anterior descobria coleções de `painel_registros`, mas não tabelas isoladas nem buckets novos. A integração acrescenta apenas:

- `painel.viradaCiclos`: mapa de todas as linhas de `virada_ciclos`, preservando ID, estado ativo, versão, snapshot completo e timestamp;
- bucket privado `virada-evidencias`: bytes, MIME, tamanho e SHA-256 no manifesto existente;
- validação de que cada foto referenciada por missão ou mural consta na cópia, com tamanho e MIME correspondentes;
- RPC `painel_restaurar_com_virada`, que recupera o programa e chama a RPC antiga do Painel dentro da mesma transação.

A cópia continua no destino privado já aprovado do backup do Painel. Não se registra um novo sistema em `SISTEMAS_BACKUP`, não se cria um segundo destino e não se altera segredo. Backups antigos sem o programa continuam pelo caminho anterior e não modificam A Virada.

A recuperação é conservadora: repõe ciclos ausentes e aceita cópia idêntica sem duplicar; **recusa sobrescrever um ciclo diferente já existente**. O conflito é resolvido antes de recuperar dados de outros módulos. Falha em qualquer parte do restauro transacional desfaz os registros do programa e do Painel. Os arquivos são conferidos por checksum antes da restauração; em falha de preparação, recuperação concorrente ou resultado de transporte incerto, as fotos privadas de A Virada são preservadas para reconciliação, evitando apagar bytes já referenciados por um commit confirmado no banco.

O mecanismo atual de backup captura arquivos em memória antes de enviá-los. A integração mantém esse mecanismo; não declara capacidade ilimitada. No ensaio anterior à abertura, medir a exportação com a quantidade real de fotos e verificar conclusão/manifesto. Se o volume exceder o limite operacional, adaptar a cópia incremental antes de ampliar o uso. Nenhum dado real foi consultado para estimar esse volume nesta tarefa.

## Ordem após aprovação específica

1. Atualizar origin/main e reler AGENTS/VEZ dos repositórios envolvidos; conciliar alterações paralelas e confirmar o turno. Resolver a pendência do `equipe-auth` antes de conceder o novo módulo à equipe.
2. Concluir as verificações locais no código exato que será publicado: testes do programa e backup, regressões de backup existentes, build, lint pertinente e conferência das listas de sistemas/módulos. Guardar identificação do commit aprovado e a versão anterior para reversão de código.
3. Confirmar a recuperação do backup atual sem exportar segredos ou dados privados para o repositório público. Aplicar, na ordem, `20261115_a_virada.sql`, `20261115b_a_virada_backup.sql` e `20261115c_a_virada_pdis.sql` no projeto correto, usando o mecanismo autorizado. Conferir tabela, RLS, permissões da RPC, índice de ciclo ativo único e bucket privado com policy restritiva.
4. Publicar o servidor antes da tela. O caminho seguro com a CI atual é preparar uma etapa de servidor na main autorizada, contendo a função nova, helpers, `painel-auth` e integração de backup; verificar a publicação. Liberar os arquivos de interface em uma etapa posterior. Não usar o push da interface como prova de que a função ou migration já existe.
5. Conferir código/versão realmente servidos de `painel-virada`, `painel-auth` e `painel-backup`. Testar 401 sem sessão e 403 sem módulo. Com contas de ensaio autorizadas, conferir participante próprio, mentor, direção, curinga sem direção e leitura de foto fora de escopo. Nenhuma senha ou token vai para logs ou relatórios públicos.
6. Ensaiar com dados sintéticos identificados: ciclo, missão, evidência, foto, comentário, mural, validação, reabertura e revalidação. Confirmar uma prioridade ativa, XP 0→10→0→10, histórico e recuperação após recarregar. Validar identidade por ficha do RH, sem aproximação por nome ou CPF.
7. Exportar uma cópia pelo fluxo existente e conferir presença de `viradaCiclos`, fotos, contagens e SHA-256. Ensaiar restauração em destino isolado, nunca sobrescrevendo produção para testar. Validar repetição idempotente e recusa a destino com versão diferente.
8. Publicar a interface e conferir os arquivos servidos, navegação, persistência e experiência no celular. Só então cadastrar os vínculos reais aprovados, início do ciclo e primeira prioridade de cada participante. Sem data definida, mostrar “Ciclo ainda não iniciado”.

## Reversão e incidentes

- Se a interface falhar, voltar à versão aprovada da interface ou retirar temporariamente o acesso ao módulo. Manter tabela, bucket e backup do programa; não usar DROP, TRUNCATE, exclusão de arquivos ou restauração de cópia antiga como reversão de tela.
- Se houver falha de autorização ou gravação, interromper o uso do módulo, preservar evidências privadas e corrigir o servidor. Revogar o módulo pelo controle existente se necessário. Não publicar uma função antiga que abra os dados sem a verificação atual.
- Ao reverter código do Painel, conservar a inclusão de A Virada no backup. Voltar ao backup antigo excluiria os dados novos da rotina de cópia.
- Divergência de versão retorna 409: recarregar antes de reaplicar. Não sobrescrever silenciosamente o snapshot mais novo.
- Em falha de preparação ou resultado ambíguo de upload/restauração, conferir referências do ciclo e checksum antes de remover qualquer arquivo. Arquivo privado extra é preferível à perda de evidência; a limpeza exige confirmação de ausência de referência.
- Recuperar um ciclo antigo sobre outro diferente exige procedimento separado, com cópia da versão atual, avaliação do impacto, autorização específica e validação posterior. A RPC preparada recusa essa substituição por padrão.

## Evidência local

Os testes novos executam o handler real compilado com serviços simulados e as migrations em PostgreSQL PGlite. Cobrem tabela ausente, foto faltante, round-trip de bytes, bucket correto, compatibilidade de backups antigos, privilégios, idempotência, conflito e rollback atômico. Os testes existentes de backup de kits, cadastros, entidades e rotas foram executados para conferir regressões.

Os ensaios de recuperação provam o comportamento local com dados sintéticos. Implantação e documentos foram conferidos separadamente conforme a seção de publicação. Cron de backup, carga crescente de fotos e restauro produtivo não foram exercitados nesta entrega.


## PDFs individuais — atualização de 15/11

- PDFs reais ficam fora do repositório e só entram no bucket privado após configurar as sete fichas do RH e seus acompanhadores.
- A direção publica pelo plano selecionado. Cada versão tem ID, autor, data e hash dos bytes; as anteriores permanecem disponíveis. Limite: 6 MiB por PDF e 30 versões por participante.
- Dono, acompanhador designado e direção podem baixar. O servidor autoriza o documento antes de gerar URL de 300 segundos. O caminho interno não vai na listagem.
- O cargo do programa pode ser ajustado pela direção sem alterar o cadastro RH. Reconfigurar preserva os PDFs e impede remover participante que já tenha documentos.
- Backup inclui PDFs e verifica presença, MIME, tamanho e hash. Ensaios usam exclusivamente exemplos fictícios.
- A simulação local decodifica os bytes do PDF sem requisitar uma URL data:, respeitando a política de conteúdo da prévia. Produção baixa pela URL assinada.
- Início do ciclo permanece sem data até definição expressa. Publicação dos documentos não inicia automaticamente os 90 dias.
