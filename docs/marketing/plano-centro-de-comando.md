# Centro de Comando do Marketing: plano

Pedido do Léo em 10/10/2026 (especificação completa no fim da conversa da etapa a1). Este arquivo guarda o plano aprovado, as decisões que ele validou e as correções que a revisão do plano levantou. Cada etapa atualiza a seção "Estado".

## Decisões validadas pelo Léo (10/10/2026, "pode fazer")

1. Pessoa é o id_pessoa (6 dígitos do CPF), a regra de 29/09/2026.
2. Um só módulo Marketing, com papéis dentro (gestão, marketing, visualização); quem só tem tarefa conclui pela agenda, sem precisar do módulo.
3. Valor vendido (R$) só para quem tem o módulo Campanhas, como na especificação.
4. Rotina diária vira uma tarefa por semana com meta de quantidade.
5. A fonte do corpo continua Arial, como no Painel inteiro.
6. Ordem: a1, a2, b1 (para Black Friday e Natal 2026), a3, a4, b2 e b3, depois c a i.
7. O lançamento manual de números por publicação (colando o link) e por CSV sobe para a etapa a2, para "Resultados" de cada canal funcionar desde o começo.

## Estado

- **a1 (10/10/2026):** tabelas painel_mkt_acoes, painel_mkt_orcamento_vinculo (a trava "um orçamento numa ação só" é a chave primária) e painel_mkt_log (auditoria por gatilho); Edge Function painel-marketing; a tela "Ações e resultados" usa a função nova; backup e restauro cobrem as tabelas; o painel-config recusa ação antiga. Em produção a coleção "marketing" estava vazia (0 ações, 0 atalhos, 0 materiais), então não houve dado a migrar; a migração das ações antigas existe como proteção (botão só para a direção, aparece só se houver ação antiga).

# Centro de Comando do Marketing: plano curto (Entrega 1)

Base lida: main 5ecfbfd, 10/10/2026.

Como está hoje: as ações do Marketing são linhas da tabela genérica painel_registros (coleção "marketing", id "mkt-<uuid>"), misturadas com os atalhos do Drive na mesma coleção. Os materiais ficam na coleção "ativo" (tipo marketing), com os arquivos no bucket painel-arquivos. A trava "um orçamento numa ação só" existe só na tela (PlanejamentoMarketing.jsx L19): o servidor aceita qualquer gravação. Campanhas, Comercial e Compromissos também moram em painel_registros, com ids em texto que não são UUID.

## 1. Modelo de dados

Regra para todas as tabelas novas: prefixo painel_mkt_ (o projeto Supabase é dividido com RH, PCP e Brief), id UUID, RLS ligado e nenhum acesso direto. Leitura e gravação passam só pela Edge Function nova painel-marketing. O que pode sofrer corrida (dois aparelhos ao mesmo tempo) grava por função no banco com trava e versão, no molde de painel_comercial_salvar_acao (20261007_comercial.sql).

As ligações com o que já existe ficam em texto, porque lá os ids são texto: campanha "campanha-...", orçamento, O.S. e cliente pelo id do ERP, vendedora pelo id do catálogo do Mubisys, material "marketing-...", permuta "permuta-..." com o lançamento "lanc-...", e pessoa pelo id_pessoa. O banco não consegue conferir essas ligações, então o servidor confere.

São 34 tabelas no total, por etapa:

**Etapa a (base)**
- painel_mkt_canais: cada chip (grupo, nome, ícone, cor, ordem, ativo, em implantação, links de perfil e gerenciador, mensagem de WhatsApp, dias para "parado").
- painel_mkt_opcoes: as listas editáveis pequenas numa tabela só (tipos de campanha, subtipos offline, pilares de conteúdo, origens que não são canal).
- painel_mkt_regras: os números configuráveis (antecedência por tipo de ação, 48h do semáforo, dias para escalar, pesos da saúde).
- painel_mkt_papeis: quem é gestão, marketing ou visualização (só se a decisão 2 for papel interno).
- painel_mkt_playbook: item do playbook (ação única, rotina ou gatilho; canal, instrução, responsável padrão, recorrência e meta, prazo relativo, checklist, evidência, ativo). O checklist de implantação do canal são itens daqui.
- painel_mkt_tarefas: cada tarefa (origem por tipo e id, canal, campanha, responsável, prazo, situação, evidência, justificativa, id do compromisso, chave de geração única).
- painel_mkt_log: o log de auditoria de todas as tabelas (quem, quando, o que mudou, motivo). O histórico da tarefa sai daqui.
- painel_mkt_acoes: toda ação, de campanha ou avulsa (canal, fase, data relativa ou fixa, responsável, verba em dinheiro, permuta e produção interna, checklist, material, situação, id antigo). Junta "campanha_acoes" e "acoes (migradas)" da especificação numa tabela só, para não duplicar.
- painel_mkt_orcamentos_vinculo: orçamento ligado a uma ação ou veiculação, com o orçamento ÚNICO no banco. É a trava contra dupla contagem, agora de verdade.
- painel_mkt_metricas_canal: o lançamento manual semanal por canal, que alimenta o indicador do chip.
- painel_mkt_publicacoes: a publicação registrada ao concluir a tarefa de publicar. Cresce na etapa g (Kanban; a pauta é a publicação ainda em Ideia ou Roteiro).

**Etapa b (campanhas)**
- painel_mkt_campanha_planos: o plano pendurado na campanha (campanha_id única, tipo, objetivo, público, dono, Dia D, início e fim, metas de orçamentos e contatos, verba planejada, situação de Rascunho até Avaliada).
- painel_mkt_plano_verbas: a verba planejada por canal.
- painel_mkt_biblioteca: a ação modelo (título, canal, fase e deslocamento sugeridos, instrução, checklist, evidência).
- painel_mkt_modelos e painel_mkt_modelo_acoes: o modelo de campanha e suas ações em datas relativas.
- painel_mkt_versoes: a foto aprovada do plano da campanha e do plano do ano, com quem aprovou e o motivo de cada mudança depois.

**Etapa c (plano do ano)**
- painel_mkt_datas: o calendário de datas (fixas ou anuais, cidade, eleições, antecedência para sugerir modelo).
- painel_mkt_planos_ano: o ano, a situação, a versão vigente e o PDF arquivado.

**Etapa d (contato direto e pós-venda)**
- painel_mkt_listas e painel_mkt_lista_contatos: a lista com filtros, roteiro, mensagem e meta por pessoa e dia; cada contato com cliente, vendedora, ação gerada no Comercial e registro do envio.
- painel_mkt_escalas: a escala de presença por dia, turno e pessoa.
- painel_mkt_leads: o contato captado no local, ligado à campanha.
- painel_mkt_reguas e painel_mkt_regua_etapas: a régua por categoria de produto (D+N, o que fazer, para quem).

**Etapa e (offline)**
- painel_mkt_veiculacoes, painel_mkt_pecas e painel_mkt_comprovacoes: a veiculação, cada peça ou ponto, e a prova (foto datada, mapa, exemplar; o arquivo vai para o bucket que já existe).

**Etapa f (atribuição)**
- painel_mkt_links: UTM, QR, link curto e WhatsApp gerados por campanha, canal e peça.
- painel_mkt_origens: o de/para da origem do CRM para um canal ou uma origem que não é canal.

**Etapa g (conteúdo)**
- painel_mkt_metricas_publicacao: alcance, engajamento e leads por publicação, com fonte e data.
- painel_mkt_divulgacao: o cliente que não autoriza divulgação (quem marcou e quando).

**Etapa h (melhoria)**
- painel_mkt_metas e painel_mkt_testes.

**O que NÃO vira tabela nova, porque já existe:**
- A campanha (nome, ano, meta em R$, período desde/ate, O.S. aceitas, edições pelo campo evento) continua em painel_registros "campanhas", gravada pela troca_mexer. O plano só aponta para ela.
- O contato com cliente continua em "comercial_acoes" do Comercial, que ganha campos novos.
- A tarefa entra na coleção "compromissos" que já existe.
- A permuta continua em "permutas": a ação só aponta para o lançamento de crédito.
- Materiais e arquivos continuam no painel-ativos (coleção "ativo", tipo marketing). A ação guarda só o id do material.
- Os atalhos do Drive continuam na coleção "marketing" e são editados em Configurações, como hoje.
- Pessoas vêm da lista do RH que Demandas e Reuniões já usam (pessoasParaReunioes), sem cadastro paralelo.
- Reuniões e ritos usam o módulo Reuniões ("reunioes_empresa"). A tabela registros_reuniao da especificação não é criada.
- Leads por origem do CRM são calculados do cache crm_clientes e crm_funil.
- Os números das APIs (etapa i) vão para o painel_cache, como os do ERP.

**O custo das tabelas próprias:** o backup só copia sozinho o que está em painel_registros. Cada tabela nova tem de entrar à mão em dois lugares: TABELAS_GESTAO no painel-backup (L45) e a lista fixa do painel_restaurar_atomico (20260906_auditoria_integridade.sql L52). Junto vai um teste na CI que reprova se alguma painel_mkt_ ficar de fora. Sem isso, o backup parece completo e não é.

## 2. Vínculos

**Campanhas (mesmo ID)**
- O plano guarda campanha_id, que é o próprio id da campanha no módulo Campanhas (texto "campanha-<ms>-<5 letras>", trocas.jsx L49). É um plano por campanha.
- Criar pelo Marketing: o painel-marketing chama uma função de banco nova que, na mesma transação, cria a campanha pela troca_mexer e cria o plano. É o mesmo caminho do botão Criar de Campanhas.jsx L2289, mas só com nome, ano, desde, ate e evento; nunca O.S. nem vendas.
- Vincular a uma campanha existente: o Marketing recebe uma lista podada (nome, ano, datas, edição), sem R$, sem clientes e sem histórico.
- As vendas continuam vindo das O.S. aceitas em Campanhas. O Marketing só lê, e o servidor só devolve o valor vendido para quem tem o módulo campanhas.
- Edições: usa o campo evento e as funções que já existem e têm teste (gruposDeEvento, edicoesDoMesmoEvento, comparativoDeEdicoes, em lib/calc/campanhas.js). A lógica de Duplicar e Outra edição sai de dentro de Campanhas.jsx para lib/calc, para as duas telas seguirem a mesma regra. Duplicar pelo Marketing copia o plano e as ações para o id novo e recalcula as datas pelo novo Dia D.
- O plano não fica dentro do registro da campanha: a troca_mexer funde raso e trocaria o plano inteiro a cada gravação.
- Apagar uma campanha que tem plano passa a ser recusado com aviso. Hoje ela iria para a lixeira e deixaria o plano órfão.
- Campanhas.jsx passa a aceitar ?campanha=<id>, para o Marketing abrir a campanha direto.

**Comercial (Prospecção e pós-venda)**
- Cada contato de lista ou da régua vira uma ação em comercial_acoes, gravada pela mesma função de hoje (painel_comercial_salvar_acao). O dono continua sendo a vendedora pelo id do catálogo do Mubisys.
- Campos novos: campanhaId, acaoMarketingId, listaContatoId, roteiro e resultadoContato. A lista de resultados padronizados fica editável em comercial_config (onde já mora diasReativacao) e o texto livre "resultado" continua. Os campos entram na lista fechada do servidor (contextoDaAcao e validarAcao). Se não entrarem, a vendedora apaga os campos sem saber na próxima vez que salvar. O nome "origem" não é usado, porque já marca as ações da mesa.
- Entra o tipo novo "campanha" em TIPOS_ACAO. Pós-venda e reativação usam os tipos que já existem (pos_venda exige a O.S.).
- Distribuição em lote: ação nova no painel-comercial que lê o contexto uma vez e grava todas as ações, com id fixo por contato. Repetir não duplica.
- Dono da carteira: vale a regra que já existe (vendedor do cadastro do cliente, casado por nome único). Cliente sem dono é dividido igualmente entre as vendedoras escolhidas.
- O resultado volta ao Marketing lendo comercial_acoes por campanhaId, com um índice novo no molde do índice de vendedorId.
- Contato com cliente NÃO vai para Compromissos. Isso mantém a decisão registrada em docs/comercial/revisao-experiencia.md: o contato fica na fila do Comercial.

**Compromissos (tipo Marketing)**
- O tipo "marketing" entra em TIPOS (Compromissos.jsx L58) com ícone e cor. O servidor aceita sem mudança, porque não valida o tipo.
- O motor cria o compromisso direto no banco com id "tarefa-<uuid da tarefa>" e o campo marketingTarefa. Rodar de novo não duplica (ON CONFLICT, no molde do painel_crm_finalizar).
- O dono do compromisso é o login do Painel da pessoa, achado pelo id_pessoa em acesso_conta e acesso_papel. Se a resposta for ambígua, o motor não grava e avisa a gestão.
- Concluir em sincronia: uma única função de banco conclui a tarefa e o compromisso na mesma transação, com a evidência. Os dois botões (o Fazer do Marketing e o check do Compromissos) chamam essa função. Adiar e pular pedem justificativa e mudam as duas datas juntas.
- No compromisso de origem Marketing, o servidor (painel-config) recusa apagar, encaminhar e marcar feito pelo caminho genérico. O responsável se troca no Marketing. Isso também segura uma aba aberta na versão velha.

**Permutas**
- A ação ou veiculação aponta para UMA entrada de crédito da permuta (permutaId e lancamentoId): a mídia que o parceiro deu. O valor vem de lá.
- As O.S. que o parceiro consumiu são o pagamento da troca e não entram como investimento.
- Cada lançamento só pode ser usado uma vez (índice único no banco). O registro da permuta não é alterado.

## 3. Migração dos dados atuais

Só as ações mudam de lugar. Atalhos e materiais ficam onde estão.

**Antes**
- Uma consulta só de leitura conta quantas linhas da coleção marketing são ação e quantas são atalho, e soma o investimento. Ela também lista os orçamentos repetidos entre ações (pode haver, porque a trava era só na tela), as ações sem id interno (criadas entre 05 e 06/09) e os textos distintos de canal e de responsável.
- O dono confere o de/para de canal e de responsável (texto livre para canal e para id_pessoa). O que não casar fica com o texto original guardado e sem id. Nada é casado por adivinhação de nome.
- O backup diário já copia a coleção. Um retrato extra é tirado antes do corte.

**Carga**
- A carga é um botão em Configurações > Marketing: "Migrar N ações", que mostra a lista antes e roda com um clique seu (escrita de dado em produção vai pela tela).
- A função de banco pode rodar de novo: ela grava pelo id antigo, então repetir atualiza em vez de duplicar.
- Cada ação vira uma linha em painel_mkt_acoes com legado_id = "mkt-...". Os orçamentos viram linhas no vínculo, pelo id do ERP como hoje.
- As situações antigas (de Ideia até Encerrada) ficam como estão. Ação migrada não gera tarefa para trás.

**Corte**
- A ordem é: as tabelas (migração aplicada à mão, porque nenhum workflow aplica migração), depois as functions, depois a tela.
- Com a tela nova no ar, o servidor passa a recusar gravar ação na chave antiga, e o botão roda de novo para pegar o que mudou no meio.
- As linhas antigas ficam paradas por 30 dias e depois vão para a lixeira de registros, de onde podem ser recuperadas. Nada é apagado.

**Depois (conferência que pode falhar)**
- Um script só de leitura compara linha a linha: mesma quantidade, cada id antigo presente, mesmos campos, mesma soma de investimento e mesmo conjunto de orçamentos.
- O cartão de resultado (vinculados, ganhos, custo por proposta, conversão) é calculado pela função antiga e pela nova sobre os mesmos dados, e tem de dar igual.
- A contagem de atalhos e de materiais tem de ser a mesma antes e depois.

## 4. Telas

A rota /marketing e o módulo "marketing" continuam os mesmos. Assim não é preciso mexer nas 3 listas de módulos nem em Acessos.

- **Materiais e Drive:** vira um botão fixo no topo. O bloco de hoje (Marketing.jsx L236 a L356) é extraído inteiro para um componente, e ?aba=materiais continua valendo.
- **Fileira de chips:** fica fixa no topo, com rolagem lateral e encaixe: Visão geral, Campanhas, Plano do ano e um chip por canal. Cada chip mostra ícone, nome, indicador com seta, pendentes e o ponto do semáforo com texto (nunca só cor). No celular, só ícone, nome e ponto.
- **Visão geral:** a central Fazer (as minhas tarefas e, para a gestão, as da equipe: atrasadas, hoje, semana, próximas). Também os KPIs (2 colunas no celular, 4 no computador), as próximas campanhas com contagem regressiva, os alertas e as ações avulsas. As ações migradas ficam aqui, com o mesmo cartão de resultado de hoje.
- **Campanhas:** a lista de planos. Ao abrir uma campanha:
  - cabeçalho com Dia D, situação e % feito;
  - linha do tempo com raias por canal e colunas Pré, Durante e Pós (arrastar no computador; no celular, lista por fase);
  - Puxar ação, alertas e aprovação;
  - resultado, com R$ só para quem tem Campanhas.
- **Plano do ano:** os 12 meses com barras por tipo (no celular, lista por mês), as datas, a verba planejada e a realizada, a carga por pessoa e a faixa de sazonalidade (só para quem tem Campanhas).
- **Canal aberto:** Fazer, Resultados, Calendário e Histórico, mais os atalhos do canal (perfil, gerenciador, nova publicação, copiar link com UTM, copiar WhatsApp).
- **Endereço:** cada chip, aba, sub-aba e filtro fica na URL. O hook de hoje (useAbaNavegavel) só conhece a chave "aba"; ele ganha uma versão com chave própria, e o antigo continua valendo.
- **Detalhe:** abre numa gaveta lateral no computador e numa folha que sobe de baixo no celular. A gaveta não existe hoje e nasce como variação do JanelaFormulario (dialog nativo).
- **Os 3 componentes novos** ficam em src/components e partem de ui.jsx e lista.jsx (Selo, Avatar, LinhaLista):
  - ChipCanal: a pílula de 44px;
  - LinhaTarefa: uma linha de ~44px com check, título, ponto do canal, prazo e iniciais. Conclui na própria linha, com desfazer, e pede a evidência quando a tarefa exige;
  - CardCompacto: no máximo 2 ações e nada de card dentro de card.
- **Home:** card de atrasadas do Marketing para a direção. Ele lê a contagem pronta do servidor, e não a agenda inteira. Falha de leitura aparece como falha, nunca como zero.
- **Escolher responsável:** a ação "pessoas" do painel-marketing devolve a lista do RH. A cópia dessa lista, hoje repetida em painel-processos e painel-reunioes, vai para um arquivo comum.

## 5. Motor de tarefas

**Onde roda:** de hora em hora, o pg_cron do banco chama o painel-marketing (ação "motor", com o token do Vault), no mesmo molde do vigia (20260906_vigia_periodico.sql). Por quê:
- Não é o GitHub Actions porque o cron de lá atrasa horas e é desligado depois de 60 dias parado (comentário em cache-mubisys.yml), e agenda de gente não pode atrasar. O Actions fica só para trazer dados do ERP (O.S. entregue) e das APIs.
- Não é SQL puro porque o motor precisa das regras em JavaScript que o Comercial já usa (validarAcao, dono da carteira) e de regras de data testadas em lib/calc com o npm test. Função de banco não tem teste rodando na CI.
- Cuidado conhecido: o "sucesso" do pg_cron não prova entrega, e o pg_net desiste em 5s. Por isso o motor escreve o próprio diário no banco (painel_meta "mkt_motor": início, fim, tarefas criadas, escaladas, erro), e o vigia de frescor passa a conferir esse batimento. O motor trabalha em lotes para caber nos 150s de uma Edge Function.

**Sem duplicar:** cada tarefa nasce com uma chave única de geração (por exemplo "playbook:<id>:2026-10-12", "acao:<id>", "regua:<etapa>:<O.S.>"). Gravar de novo não cria outra (ON CONFLICT). O compromisso tem id fixo "tarefa-<id>" e a ação do Comercial tem id fixo por contato. Rodar duas vezes dá o mesmo resultado.

**Origem por ID:** cada tarefa guarda o tipo da origem (ação, playbook, régua, gatilho ou avulsa) e o id dela, mais a campanha e o canal.

**X dias antes:** a tarefa aparece no Fazer assim que nasce. Ela entra na agenda (vira compromisso) quando faltarem X dias para o prazo, com X definido por tipo de ação em painel_mkt_regras. Mudar o Dia D recalcula as tarefas abertas e os compromissos delas juntos.

**Atraso e escalonamento:** passou do prazo, a tarefa fica vermelha no Fazer, na agenda da pessoa e no card da Home. Depois de X dias (regra editável), ela sobe para a gestão: entra na lista da gestão e gera um compromisso de cobrança para o gestor configurado (id fixo, sem repetir). O Painel não tem e-mail nem Telegram, então o alerta é dentro do sistema.

**Gatilhos:** cada gatilho liga na etapa que cria o dado dele:
- O.S. entregue: etapas d e g;
- avaliação nova: só com a API do Google, na etapa i;
- canal parado e queda de alcance: quando houver métricas;
- data sem campanha: etapa c;
- veiculação começando ou terminando: etapa e;
- ação publicada há 30 dias sem orçamento: etapa f.

## 6. Etapas

**a) Base.** As 11 tabelas da base e o painel-marketing. A migração das ações com a trava no banco e o seletor de orçamentos com busca no lugar do campo de números (adiantado da etapa f, porque o formulário é refeito aqui). Canais e playbook editáveis, já com a carga inicial da seção 6. O motor, o tipo Marketing em Compromissos com conclusão sincronizada, o card na Home e o backup e restauro com as tabelas novas.
Você vê: a aba nova com os chips, as ações antigas com o mesmo resultado, as rotinas caindo na agenda de cada um como "Marketing" e as atrasadas na Home.

**b) Campanhas.** O plano ligado a Campanhas pelo mesmo id, a biblioteca, Puxar ação, Dia D com datas relativas e a linha do tempo. Os modelos (Feira ou evento, Data comercial, Lançamento, Eleições), a aprovação com versão e log com motivo, duplicar edição e o comparativo.
Você vê: Black Friday e Natal 2026 montadas a partir do modelo, aprovadas, com as tarefas nas agendas.

**c) Plano do ano.** As datas configuráveis com a carga inicial e 2027 montado em lote a partir dos modelos e das edições de 2026. Verba por mês, trimestre, canal e campanha, carga por pessoa, faixa de sazonalidade, versão aprovada e PDF arquivado.
Você vê: 2027 inteiro numa tela e o PDF aprovado guardado.

**d) Ligações e pós-venda.** Listas por filtro, distribuição para a vendedora da carteira e ações na Prospecção e pós-venda com campanha e resultado padronizado. Escala de presença e captura de contatos. A régua por categoria disparada pela O.S. entregue (carga nova do ERP) e a reativação.
Você vê: a lista da próxima feira distribuída e o placar de ligações por resultado. Cada obra entregue gera agradecimento e pedido de avaliação.

**e) Mídia offline.** Subtipos e veiculações com investimento em dinheiro, permuta e produção interna. Peças e pontos, comprovação com foto, checking quinzenal e aviso 7 dias antes do fim, pelo motor.
Você vê: TV, revista ACI, outdoor, frota e fachada com custo, período e prova.

**f) Atribuição.** O gerador de UTM, QR, link curto e WhatsApp e o de/para das origens do CRM. Por ação, canal, campanha e veiculação: investimento, conversas, orçamentos, vendas, custo por orçamento e ROI, com o aviso de que proposta ganha não é dinheiro recebido.
Você vê: quanto custou cada orçamento por canal e por campanha, com fonte e data.

**g) Conteúdo.** O calendário editorial com cor por canal, o Kanban, os pilares e o checklist de publicação. As métricas por publicação (colando o link), o pacote da obra entregue com as fotos do PCP e a marca "não autoriza divulgação".
Você vê: cada obra entregue virando um pacote de posts com dono e prazo.

**h) Melhoria contínua.** Metas e ritos no módulo Reuniões, com pauta gerada e decisões. O registro de testes (o teste aprovado vira playbook com um toque) e a saúde de 0 a 100 por canal, com pesos editáveis.
Você vê: a nota de saúde de cada canal e a reunião mensal com a pauta pronta.

**i) Integrações, uma por vez:** GA4 e Search Console, Meta, Google Meu Negócio, Pinterest e LinkedIn. Um job no GitHub Actions grava no cache e a tela nunca chama a API. Há uma tela de status com a última leitura de cada fonte.
Você vê: os números de cada canal chegando sozinhos, com fonte e data. Os tokens ficam com você.

## 7. Decisões que precisam da sua validação

**Para começar a etapa a**
1. Chave de pessoa: usar o id_pessoa de 6 dígitos (o do PCP e da sua ordem de 29/09), e não o id da ficha que Demandas grava hoje. Recomendo o id_pessoa.
2. Papéis: manter um módulo "marketing" com papéis internos (gestão, marketing, visualização), e "responsável" é quem tem tarefa, sem precisar do módulo. Gestão é a direção mais quem você nomear. A alternativa, criar módulos novos, mexe em 3 listas, uma delas no repositório vida-leo.
3. Se a consulta achar o mesmo orçamento em duas ações, qual ação fica com ele? Sugestão: a mais antiga, e a outra recebe uma nota.
4. Rotina diária (stories, responder mensagens): um compromisso por dia ou um por semana com meta de quantidade? Recomendo por semana. A agenda lê a coleção inteira, e 365 linhas por rotina pesam para todo mundo.
5. Pessoa sem login no Painel ou sem o módulo Compromissos: a tarefa fica só no Marketing, com alerta para a gestão, ou o módulo é concedido junto?

**Para a etapa b**
6. Dia D e período: o plano tem os seus. O período da campanha decide quais O.S. entram e até onde a carga varre o ERP, por isso só muda quando a gestão confirma. Quem pode criar campanha pelo Marketing: só a gestão?
7. Quem tem só Marketing vê a lista de campanhas sem R$ e vincula orçamentos de todas as vendedoras? Hoje o R$ das propostas ganhas aparece no cartão da ação para quem tem Comercial. Com a especificação, todo R$ vendido fica só para quem tem Campanhas.

**Para a etapa d**
8. Distribuir listas para as vendedoras: hoje só a direção grava ação para outra vendedora. Abrir para a gestão de Marketing? E as ligações de campanha entram na "Minha agenda" e nos números de retornos do Comercial, ou numa visão separada?
9. O.S. entregue: buscar no ERP pela carga do Painel (pelo id, recomendado), com o dia da saída real como D0. A retirada no balcão também dispara a régua?
10. Captura por QR feita pelo próprio cliente exige uma página pública, sem login. Aceita, ou só a equipe captura, logada?

**Para a etapa e**
11. Investimento em permuta: vale a entrada de crédito (a mídia recebida), marcada uma a uma, porque nem toda permuta é marketing. E uma O.S. quitada em permuta que também está numa campanha conta como venda no ROI?
12. O que é "O.S. interna" no ERP (cliente Impresilk? tipo Cortesia?), e ela entra pelo custo ou pelo preço?

**Para a etapa g**
13. "Não autoriza divulgação": mora no cliente ou na O.S.? Quem marca? E, sem marca, o padrão é não divulgar?

## 8. Riscos e o que não existe hoje

**Riscos**
- Backup calado se uma tabela nova ficar fora das duas listas. A guarda na CI resolve.
- Aba presa na versão velha continua gravando na chave antiga. Por isso o servidor recusa e a carga pode rodar de novo.
- Campo novo no Comercial é apagado se não entrar na lista fechada do servidor. E a fila das vendedoras pode inflar com centenas de ligações.
- Volume: Compromissos lê a coleção inteira a cada abertura, e tarefas diárias deixam todo mundo lento.
- Dinheiro vazando: a resposta atual da gravação de campanhas devolve o mapa inteiro com R$. O Marketing não pode usar essa porta.
- Agrupamento por nome: campanhas com o mesmo nome se ligam sozinhas como edições, inclusive todas as "Nova campanha", o nome com que nascem.
- ERP:
  - o número de O.S. repete (20050 e 21855), então o casamento é sempre pelo id;
  - a data da O.S. no Painel é a de cadastro e não serve de D0;
  - o cache atrasa quando o cron do GitHub falha.
- Publicação: a migração é aplicada à mão, functions e tela sobem no push da main e PR não roda CI. Ordem fixa: migração, functions, tela. Escrita de dado em produção só pela tela, com o seu clique.
- A seta de tendência de hoje segue a lógica do DSO (subir é vermelho). KPI de marketing precisa da seta ao contrário.
- O corpo do Painel é Arial de propósito (index.css L34). Spectral só no Marketing quebraria a unidade, então fica Arial, salvo decisão para o Painel inteiro.
- O painel-crm já escreve no funil do Mubisys (mover, anotar, criar card, tarefa), contra a regra "Mubi só leitura". Não estendo isso.

**Não existe e precisa ser criado**
- Estrutura: as 34 tabelas, a Edge Function painel-marketing e o motor agendado.
- Travas no banco: orçamento numa ação só, O.S. numa campanha só e O.S. numa permuta só (hoje as três existem só na tela).
- Campanhas: leitura sem R$ e criação de campanha fora do módulo Campanhas.
- Compromissos: o tipo Marketing, a conclusão sincronizada, a evidência, a justificativa e o escalonamento.
- Pessoas: a tradução de id_pessoa para o login do Painel. No Comercial também não há id_pessoa: lá o dono é o id do vendedor no Mubisys.
- Comercial: campanhaId, resultado padronizado e gravação em lote.
- O.S. entregue: o status e a data. Só o PCP lê esse dado; o Painel só sabe "cancelada".
- Fotos da obra no Painel. Elas estão no PCP (bucket pcp-arquivos), e é preciso uma porta fechada que devolva só as fotos do serviço pronto.
- Dados que o Painel não tem:
  - a marca de divulgação, a O.S. interna e o custo de produção por O.S.;
  - o fornecedor do ERP no cache;
  - o id da origem do CRM (hoje só o nome, e só dos cards ativos);
  - segmento e região do cliente (o cadastro copiado não tem cidade nem atividade).
- UTM, QR e link curto. O link curto precisa de um redirecionador, porque o GitHub Pages não faz isso. Também não há biblioteca de QR nem de mapa instalada.
- WhatsApp e e-mail em lote: não há API. O "lote" será uma fila de links wa.me, um clique por contato, registrando quem recebeu.
- Canal de alerta por e-mail ou Telegram no Painel.
- Tela: a gaveta lateral, o ChipCanal, a LinhaTarefa, o CardCompacto, o formato curto de números em PT-BR e o hook de URL com chave própria.
- Reuniões: o vínculo com campanha e o setor marketing.
- As integrações com GA4, Search Console, Meta, Google Meu Negócio, Pinterest e LinkedIn.
- Teste de função de banco rodando na CI (o PGlite não está instalado).
# Correções levantadas pela revisão do plano (incorporar em cada etapa)

**A. Afirmações do plano que o código não sustenta**

1. **Onde ficam as regras do motor.** O plano diz que o motor usa "regras de data testadas em lib/calc com o npm test". Nenhuma Edge Function importa de `src/`. O `scripts/publicar-functions.sh` publica só `supabase/functions`. Na casa o caminho é o inverso: o contrato fica em `supabase/functions/_shared/*.mjs`, a tela importa de lá (`relacionamento-comercial.mjs` L2) e o teste fica em `tests/*.test.mjs`, que o `pages.yml` L36 roda. O `npm test` (package.json L13) só roda `src/lib/calc`.
   - **Corrigir:** datas relativas, chave de geração, semáforo e escalonamento vão para `_shared/marketing-*.mjs`, com teste em `tests/`.

2. **A lista de pessoas não entrega o id_pessoa.** `pessoasParaReunioes` devolve `id = registros.id` da ficha (`_shared/reunioes.mjs` L10), e não o id_pessoa. Os 6 dígitos só são calculados do `cpf` em `_shared/agenda-pcp.ts` L241-250, com a guarda de id repetido.
   - Se a decisão 1 ficar com o id_pessoa, a função comum de pessoas precisa devolver `idPessoa` calculado no servidor, sem o CPF sair e com a mesma guarda.
   - Sem isso, o seletor grava o id da ficha e a tradução para login por `acesso_conta.id_pessoa` não casa.

3. **Falta traduzir login em id_pessoa.** O crachá só carrega `{sub, nome, master, perms, vend}` (painel-auth L236). "Minhas tarefas", "quem é gestão" e "quem concluiu" dependem dessa tradução.
   - **Corrigir:** criar uma função no molde de `identidadeRH` (painel-processos L26-33), que recusa ambiguidade e devolve o id_pessoa.
   - **Corrigir:** dizer qual é a chave de `painel_mkt_papeis` (id_pessoa) e fazer o acesso passar por essa tradução.

4. **Ids "que não são UUID".** O texto erra em parte. As ações do Comercial e os compromissos criados na tela nascem de `crypto.randomUUID()`. Os ids não UUID são os de campanha, permuta, `lanc-`, `mkt-`, `ml-` e `marketing-`.
   - O "id fixo por contato" no Comercial não pode levar o clienteId: o prospecto é `prospecto:<uuid>` e o servidor só aceita `/^[\w-]{1,80}$/` (validarAcao). Usar o id do contato da lista.

5. **O backup corta em 1000 linhas.** Pôr a tabela em `TABELAS_GESTAO` não basta.
   - O laço faz `sb.from(t).select("*")` sem `.range` (painel-backup L165). O PostgREST corta em 1000 linhas, e tarefas, log e contatos passam disso. O backup sai truncado sem aviso. **Corrigir:** paginar.
   - O autoexame `naoCopiadas` (L419-424) e o `scripts/conferir-restauro.mjs` só comparam coleções de `painel_registros`. **Corrigir:** comparar, na hora do backup, a contagem de cada tabela `painel_mkt_%` do banco com a cópia, e não só na CI.

6. **O restauro trava com índice único.** `painel_restaurar_atomico` só faz upsert pela chave primária e nunca apaga (20260906_auditoria_integridade.sql L70).
   - As tabelas novas terão índices únicos fora da chave primária: orçamento, lançamento de permuta e chave de geração. Um backup antigo colide nesses índices e aborta o restauro inteiro.
   - **Corrigir:** definir como restaurar o conjunto `painel_mkt_*` (substituir dentro da transação, filhos antes), pôr a lista em ordem de FK e provar com teste.

7. **A guarda da CI não segura as functions.** O `functions.yml` publica a cada push na main sem esperar o `pages.yml`. A guarda "tabela fora do backup" na CI não impede a function de subir.
   - **Corrigir:** rodar a guarda local antes do push (Node 20 em `~/apps/node20/bin`).

8. **A guarda dos compromissos de Marketing está incompleta.** O merge genérico (painel-config L640) aceita qualquer campo vindo do cliente:
   - `data`: o reagendar de Compromissos.jsx L645 manda `{data}`;
   - `titulo` e `tipo`;
   - o próprio `marketingTarefa`: mandar `null` e depois apagar desfaz a trava;
   - criar um id `tarefa-...` ou forjar o campo `marketingTarefa`.

   **Corrigir:**
   - a guarda olha o registro já gravado (`data?.registro`), nunca o que chega;
   - recusa criar ou mexer em data, feito, dono, tipo e `marketingTarefa` pelo caminho genérico;
   - leva feito e data para a função de banco, com justificativa e evidência;
   - Compromissos.jsx ganha os diálogos de evidência e de justificativa para esse tipo;
   - os eventos novos (adiou, pulou, evidência) ganham rótulo na Conversa e no `FRASE` do `pdfConversa.js` L130.

9. **O check da agenda fala com o painel-config, não com o Marketing.** O responsável pode não ter o módulo marketing (decisão 2).
   - **Corrigir:** escrever que o ramo fica no painel-config (o POR_DONO confere o dono) e chama a função de banco.
   - **Corrigir:** a evidência enviada pela agenda usa o anexo da Conversa (ação `evento`, painel-config L739).

10. **Decisão 3 ("fica com a mais antiga") não tem como ser apurada.** A ação não guarda criadoEm nem autor. O único carimbo é `painel_registros.atualizado_em`, que muda a cada edição.
    - **Corrigir:** a consulta lista os pares e o dono escolhe na tela. Outra opção é usar um critério que exista, como o prazo.

**B. Conflitos com as regras da casa**

11. **Decisão 7 tem de vir para a etapa a.** Hoje o cartão mostra o R$ das propostas ganhas para quem tem marketing e orçamentos (PlanejamentoMarketing L35-39). A etapa a promete "mesmo resultado" e uma conferência que "tem de dar igual".
    - **Corrigir:** decidir antes da etapa a.
    - **Corrigir:** o servidor poda o R$, e a tela não soma valor do cache de orçamentos para quem não tem campanhas.

12. **Leitura de `comercial_acoes` pelo Marketing.** O registro traz `valor` (R$ do orçamento, comercial.mjs validarAcao), `nota`, `estrategia` e `briefing`.
    - **Corrigir:** projeção fechada na porta do Marketing: id, campanhaId, vendedorId, status, resultadoContato e data.

13. **Log de auditoria.** O `painel_mkt_log` não pode guardar valor de venda nem meta em R$ (memória "log que sincroniza vaza").
    - Leitura podada por papel, nenhuma exclusão, teto e poda, backup paginado.
    - Sugestão: gravar por gatilho AFTER nas `painel_mkt_*`, com o autor via `set_config`, para nenhuma escrita escapar.

14. **Carga inicial.**
    - Não vai para `src/data` (memória "semente não é cadastro"). Entra por um botão "Carregar padrão" com clique do dono, ou por insert idempotente.
    - O repositório é público: verba, fornecedor e valor de TV ou revista numa migration ficam abertos na internet. A semente vai sem valores.
    - Declarar quais listas ficam no código de propósito (situações do plano, Kanban, situação da veiculação) e por quê.

15. **Canais do Comercial e chips.** Os canais do Comercial são fixos (`CANAIS`, relacionamento-comercial.mjs L4). Os chips do Marketing são UUID.
    - **Corrigir:** o canal ganha um campo que o liga por código ao canal do Comercial (`ligacao`, `whatsapp`, `visita`). Sem isso, contar ligações por chip vira casamento por nome.

16. **UTM.** "utm_campaign do nome" quebra quando o nome muda.
    - **Corrigir:** gerar o slug uma vez, gravar com o `campanha_id` e nunca recalcular a partir do nome.

17. **Origem do CRM.** Hoje só vem o nome (crm-mubi.mjs L11) e só dos cards ATIVOS.
    - A etapa f começa por guardar `c.origem.id` na carga (CHAVES e validação do painel-cache L266-270). Só depois vem o de/para por id.
    - A origem é do cliente (`crm_clientes`). O orçamento não tem origem (`normOrcamento`).

18. **Carga de O.S. entregue.**
    - A coluna nova em `painel_ordens` fica fora do upsert quando a carga não a trouxe ("ausente não é vazio", painel-cache L109-131). A carga leve já zerou 1.536 descontos assim.
    - A O.S. cancelada é apagada de `painel_ordens` (`ordensApagar`). A régua trata "sumiu" sem apagar nada.

**C. Risco de perda de dado e de corrida**

19. **Repetir a migração pode sobrescrever edição nova.** "Repetir atualiza" troca a edição feita na tabela nova pelo dado velho.
    - **Corrigir:** só atualizar quando a linha antiga mudou depois de `migrado_em` e a nova não foi editada; nos outros casos, listar o conflito.
    - **Corrigir:** os vínculos sincronizam também os removidos e acusam a colisão no índice único, sem pular calado.
    - **Corrigir:** a migração não roda enquanto houver orçamento repetido.

20. **Quem roda a migração.** O botão em Configurações > Marketing aparece para qualquer pessoa com o módulo (Configuracoes.jsx L104, sessao.js L169). **Corrigir:** só a direção, conferido no servidor.

21. **Mapa aninhado.** Checklist, verba por canal, contatos e escala gravados como jsonb inteiro reabrem a corrida. **Corrigir:** linhas próprias, ou patch por item na função de banco.

22. **Dia D novo sobrescreve adiamento.** Recalcular as tarefas abertas apaga a data que a pessoa adiou com justificativa. **Corrigir:** marcar a data manual e não recalcular sem confirmar.

23. **Motor.**
    - Reserva em `painel_meta`, como o `backup_operacao`, contra duas rodadas juntas.
    - Cursor retomado a cada disparo, no molde de `20260906_backup_por_etapa.sql`, em vez de "caber em 150 s".
    - Prazo próprio em cada etapa: morte vinda da plataforma não roda o catch.
    - Datas calculadas em America/Sao_Paulo: a Edge Function roda em UTC.

24. **Compromisso ressuscitado.** O `ON CONFLICT DO NOTHING` recria o compromisso que a direção mandou para `registro_lixeira`. **Corrigir:** conferir a lixeira, como o `painel_registro_gravar` já faz.

25. **Permuta.**
    - Um "índice único" não cobre o mesmo lançamento usado em duas tabelas (ações e veiculações). **Corrigir:** tabela de vínculo própria com UNIQUE(lancamento_id).
    - Um lançamento editado ou tirado em Permutas (`lancPatch {id:null}`) deixa o vínculo órfão e muda o investimento de um plano aprovado. **Corrigir:** congelar o valor no vínculo e marcar "mudou" ou "sumiu".
    - Decidir se um crédito grande pode ser usado em partes.

26. **Comercial.**
    - O servidor funde `{...anterior,...b.acao}` (painel-comercial L55), então o formulário pode zerar ou trocar o campanhaId. **Corrigir:** campanhaId, acaoMarketingId e listaContatoId vêm só do registro gravado.
    - No lote, um id que já existe cai em "Conflito de versão" e volta como 409 genérico. **Corrigir:** tratar como "já existe".
    - **Corrigir:** um só montador da ação em `_shared`, usado pelo lote e pela régua.

27. **Apagar campanha com plano.** A recusa no `removerId` (molde dos setores, painel-config L992-999) confere e depois retira, sem ser atômica. Documentar, ou fazer a conferência na função SQL.

**D. Itens da especificação faltando ou cobertos errado**

28. **2.2:** dizer como a situação "Encerrada" do plano convive com `campanha.encerrada`.
29. **2.3:**
    - âncora da data relativa (Dia D, início ou fim, como em "Fim+2");
    - aviso quando a data fixa sai da fase.
30. **2.7 e 2.9:** nenhuma etapa tem:
    - os gatilhos de fim;
    - o follow-up em 48 h;
    - a reunião de avaliação gerada;
    - o "Salvar como modelo";
    - o checklist de prontidão.

    **Corrigir:** pôr na etapa b. A reunião gerada exige:
    - o setor `marketing` em `SETORES_REUNIAO` (reunioes.mjs L4, tela e servidor juntos);
    - o campanhaId na lista fechada do `prepararReuniao`;
    - o `criadoPor` definido;
    - o módulo reuniões.
31. **2.6:**
    - a escala tem de gerar tarefa por turno;
    - o contato captado vira prospecto do Comercial, que exige `crm_clientes.completo` e recusa nome ou CNPJ já cadastrado (contextoDaAcao L22-26).
32. **4 (pós-venda):**
    - não há onde guardar a nota de 0 a 10, a avaliação manual, a indicação e a recompra, nem o alerta de nota até 6: falta tabela na etapa d;
    - a O.S. de 2020-2024 provavelmente cai em "Fora do catalogo" (mubi-cache.mjs L731, dedução pela leitura do código), o que afeta D+365 e recompra.
33. **5:**
    - a avaliação nova não precisa esperar a API: o lançamento manual da fase 1 (seção 11) pode disparar o gatilho;
    - faltam "prioridade" e "tipo" no playbook;
    - falta o indicador de execução (no prazo e atrasadas por canal e por pessoa).
34. **7:**
    - o fornecedor por id só aparece como "não existe": decidir na etapa e (carga só de leitura ou cadastro);
    - faltam CPM e o rótulo "estimativa".
35. **8 (link curto e QR):**
    - **Link curto:** o redirecionamento 302 pela Edge Function funciona, mas no domínio supabase.co. Em impresilk.com.br, a Locaweb não repassa o caminho. Vai para decisão.
    - **Portas públicas:** o QR do cliente e o redirecionador ficam numa function separada, com entrada em `PUBLICAS` do `conferir-portas` e limite de taxa.
36. **11:**
    - falta a importação de CSV;
    - falta "fonte e data" nas métricas por canal;
    - o número da API só no `painel_cache` (descartável, fora do backup) perde o histórico que a API não devolve depois: guardar um retrato semanal com fonte "api";
    - o log do Actions de repositório público é público: não imprimir o conteúdo da resposta.
37. **10:**
    - as decisões da reunião têm responsável em texto livre;
    - não existe PDF da ata, só o de presença;
    - na nota de saúde, critério sem dado não conta como zero.
38. **3 (PDF do plano):** não há biblioteca de PDF. Definir como gerar e onde guardar (bucket `painel-arquivos`, que entra no backup).
39. **14 (tela):**
    - não há biblioteca de virtualização;
    - o `Empty` não aceita botão;
    - a cor do canal só funciona por `style` inline (a classe dinâmica é descartada e o `conferir-classes` cobra) e precisa de contraste no escuro;
    - os filtros na URL usam `replace`.
40. **Build de revisão:** o `src/review/painel.mjs` precisa de dados de exemplo para o painel-marketing, senão o build quebra.
41. **2027 em lote:** montar o ano cria campanhas vazias em Campanhas. Elas entram nas análises e se agrupam por nome (`gruposDeEvento`). Decidir se a campanha só nasce na aprovação, com nome único por ano e `evento` declarado.

**E. Etapas grandes demais**

42. **A etapa a mexe em oito partes que funcionam:** painel-config, Compromissos, Home, painel-backup, a função de restauro, painel-processos, painel-reunioes e Marketing. Partir em:
    - **a1:** tabelas, painel-marketing, migração, trava, backup e restauro paginados;
    - **a2:** chips, canais, playbook e o Fazer;
    - **a3:** motor, tipo Marketing e as guardas;
    - **a4:** card da Home.
43. **Prazo da Black Friday.** Hoje é 10/10/2026. A Black Friday é em 27/11, com D-30 em 28/10. Para o Natal, D-30 é 25/11. Com a etapa a inteira antes da b, a Black Friday de 2026 não sai pelo sistema. Decidir: um recorte mínimo da b logo depois da a1, ou assumir a Black Friday fora.
44. **Etapa b em três:**
    - **b1:** plano, biblioteca, Dia D e linha do tempo, só vinculando campanha que já existe;
    - **b2:** criar campanha, modelos, aprovação e encerramento;
    - **b3:** duplicar e comparativo, depois de extrair Campanhas.jsx L2319-2458 com testes de antes e depois.
45. **Etapas d e g:**
    - **d1:** listas e distribuição;
    - **d2:** carga de O.S. entregue e régua;
    - **d3:** presença e QR público;
    - **pacote da obra (g):** etapa própria, porque depende de uma porta nova para o PCP, com casamento por número de O.S. que repete.
46. **Travas de O.S. em campanha e em permuta.** Estão em "precisa ser criado" sem etapa. Mexem na `troca_mexer`, e existe caso real de O.S. numa campanha e numa permuta ao mesmo tempo. Tirar do escopo, ou dar etapa própria com consulta de leitura antes.

**F. Decisões para acrescentar à lista**

- **Fonte:** Spectral ou Arial. A especificação pede Spectral no corpo; `index.css` L35 usa Arial; o Spectral já carrega no `index.html` L23 sem uso.
- **Migração:** quem roda o botão de migrar e quem aplica a migration.
- **Edições:** nome único por ano, para evitar o agrupamento automático por nome.
- **Rotina semanal:** meta parcial conta como feita?
- **Régua de pós-venda:** só O.S. do tipo Normal?
- **Home:** direção é só o master (Home e sessao.js L157) ou também quem tem "*" (servidor, painel-config L345)?
- **Também entram:** a Black Friday (item 43), o link curto (35), o uso parcial de crédito de permuta (25) e a situação "Encerrada" do plano frente à da campanha (28).