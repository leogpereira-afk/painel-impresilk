# Reuniões recorrentes, calendário e atas

Aprovado pelo usuário ao responder “fazer” ao prompt de 26/10/2026. Entrega é prévia fictícia; nenhuma publicação, alteração de cadastro ou convite real.

## Modelo e limites
Reutilizar reunioes_empresa e seus IDs, calendário e controles de presença. Materializar até 104 ocorrências, com término obrigatório por quantidade ou data, horizonte máximo de 3 anos. Repetição diária, semanal, quinzenal (semanal intervalo 2) ou mensal no dia do mês; datas inexistentes são puladas e explicadas na prévia. Cada ocorrência mantém ata, presenças, anexos, decisões e histórico independentes.

Metadados de recorrência são controlados pelo servidor: serieId, indice (1-based), total, regra {frequencia:'diaria'|'semanal'|'mensal',intervalo:1|2,diasSemana:number[],termino:'quantidade'|'data',quantidade:number,ate:string}, dataOriginal. Criação idempotente usa o ID da primeira reunião como serieId e IDs determinísticos nas demais. Registro individual preserva esses campos; corpo não pode injetar vínculo de série.

Editar/cancelar uma, esta e próximas ou toda a série. Edição coletiva só de agendadas futuras, sem ata/presença/registro/encaminhamento/anexo; realizadas e registros com atividade ficam preservados. Mostrar alcance e itens preservados antes da confirmação. Datas se deslocam pelo mesmo número de dias da ocorrência escolhida; regras de repetição de série existente não se regeneram silenciosamente. Mudar a frequência requer criar nova série após cancelar futuras, explicado na tela.

## Interfaces compartilhadas
- gerarDatasRecorrencia(item,regra): string[]; usa item.data, calendário civil, fuso Brasília para agora, sem dependência de relógio nos testes.
- resumoRecorrencia(regra): string.
- criarSerieReunioes(item,regra,s,pessoas,agora): lista de reuniões carimbadas, independentes; sem ata/decisões/presença herdadas.
- prepararAlteracaoSerie(atual,lista,item,escopo,s,pessoas,agora): {alteracoes:[{antes,item}],preservadas:number}; escopo 'esta'|'proximas'|'serie'. Mantém IDs e metadados. Validar versoesAnteriores enviadas pelo cliente no servidor para todos os alvos.
- conflitosReunioes(candidatos,existentes): conflitos de horário (intervalos semiabertos) por rhId; retorna somente reuniões já autorizadas. Ignorar canceladas e IDs do próprio lote.
- prepararReuniao recebe responsavelRhId opcional e decisões com responsavelRhId; nomes e idPessoa são obtidos do diretório mínimo/histórico. Preserva legado textual. Ata opcional: ataSituacao rascunho/finalizada e ataVersoes auditadas no servidor.

## API
Existente action salvar continua salvando uma ocorrência; sem criar série por metadados injetados. Nova action salvarSerie recebe {item,recorrencia} na criação, ou {item,escopo,versoesAnteriores:{id:versao}} na edição. Retorna {ok,item,itens,preservadas}. Repetir criação idempotente retorna série existente apenas ao criador/direção, sem modificar encontros. Gravação em lote usa RPC dedicada atômica, service_role apenas, comparando versões e preservando lixeira. Migration criada localmente; não aplicar em produção.

Nova action demanda recebe {id,versao,decisaoId}; exige permissão de Demandas e poder editar a reunião, cria demanda de ID determinístico e marca decisão com demandaId na mesma transação. Responsável tem vínculo RH validado, prazo e texto vêm da decisão; nunca duplica por repetição.

## Interface e calendário
Editor modular: programação, participantes, ata opcional e encaminhamentos. Chips para frequência/dias, previsão de datas, aviso de conflitos, escopo explícito ao editar série. Busca RH por nome/idPessoa (ID oficial 6 dígitos) e fallback de id de ficha; mostrar identificação disponível sem inferir por nome. Série usa participantes como lista fixa, sem adicionar futuras admissões automaticamente.
Calendário existente deriva os eventos dos mesmos IDs, sem segundo cadastro, exibe recorrência e abre a reunião. Visão pessoal usa convite pelo vínculo RH existente. Não expor dados privados do RH no calendário. Datas e horário civil de Brasília.
Prévia isola registros fictícios em sessionStorage e mantém após reload, incluindo calendário e demandas derivadas. Arquivos de teste seguem limitados à sessão.

## Verificação
Testar regras de datas, ano bissexto, fim de mês, limites, duplicações/retry, permissão, conflito/rollback, histórico e dados legados. Testar UI criar semanal/única, editar uma/futuras, ata e decisão, conversão explícita, calendário e reload; 390px sem overflow. Build/lint e regressões pertinentes antes de apresentar a prévia.
