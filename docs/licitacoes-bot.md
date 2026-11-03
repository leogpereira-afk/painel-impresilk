# Licitações: pesquisa do BotImpresilk e acompanhamento da equipe

O módulo possui duas áreas independentes. **Pesquisa do BotImpresilk** lê a última pesquisa pública ou uma versão escolhida no histórico; **Acompanhamento da equipe** conserva editais, arquivos, responsáveis, checklist e resultados cadastrados anteriormente. A leitura da pesquisa, por si só, não cria uma licitação acompanhada nem autoriza proposta, participação ou lance.

## Leitura e integração

O navegador chama `painel-dados?modulo=licitacoes` usando o crachá existente. O servidor confere a permissão `licitacoes` e a revogação estrita antes e depois da consulta. Esta rota aceita somente GET, não grava registros e não consulta ERP, RH, e-mail ou memória pessoal.

Como painel e bot utilizam projetos distintos, a leitura usa a rota dedicada `badboy-telegram?acao=licitacoes-painel`. O endereço é fixo, com credencial de leitura `LICITACOES_PAINEL_TOKEN` somente nos ambientes dos dois servidores. O cabeçalho de serviço é `x-licitacoes-painel-token`. Não repassa o crachá do usuário nem aceita endereço livre. O navegador pode informar somente um ID de relatório validado ou uma página de histórico; o servidor monta esses parâmetros no endereço fixo. Não segue redirects, limita o documento a 600 KiB e encerra a consulta em quinze segundos.

O serviço do bot entrega o dossiê público selecionado, com ID, geração, período, versão e SHA256. O painel rejeita campos desconhecidos, recomputa o relatório com `supabase/functions/_shared/licitacoes-controle.mjs`, confere hash e metadados e entrega apenas a projeção pública. Totais persistidos não substituem a reconstrução. O núcleo congelado é compartilhado com o bot; versão `2026.10.12-cobertura-2-educacao`, SHA256 `99dd186a62b3e92736ed9ff002cbd9de0466f017a88d0147c8c5d0e9ceb87e75`.

A matriz institucional contém 32 grupos obrigatórios. Unimontes, UFMG / ICA, IFMG e IFNMG são grupos distintos, incluindo suas reitorias, campi e compras centralizadas destinadas à região. A sede do órgão não substitui a avaliação do local de execução.

Se a credencial estiver ausente, há erro de configuração, sem cobertura inventada. Relatório ausente é diferente de relatório inicial com 89 municípios não consultados e 0%. Atualizar a leitura recarrega a versão selecionada e não executa a pesquisa semanal. O agendamento e a publicação da pesquisa pertencem ao executor autorizado do bot.

## Uso da tela

- O histórico é agrupado pelo mês de geração, com a data do relatório em destaque, hora e período pesquisado separados. O período pode abranger mais de uma semana; a interface não cria semanas sem publicação. Cada página contém até vinte registros e os meses exibidos se referem somente àquela página.
- Geração e período identificam a pesquisa; a leitura atual não renova essas datas. Relatórios com oito dias ou mais mostram ressalva. “Última pesquisa” retorna ao registro mais recente. A seleção usa `?relatorio=ID`, permanece após recarregar e acompanha voltar/avançar do navegador.
- KPIs municipais sempre usam o denominador 89. Cobertura institucional tem quadro e contagens separados.
- A busca combina processo, item, produto e destino com filtros de classificação, município de execução, órgão e produto.
- Prazos abertos aparecem primeiro. Um prazo encerrado na leitura não altera silenciosamente a classificação histórica, mas exige conferência no portal oficial.
- Detalhes mostram critérios, exigências, destino, viabilidade registrada e próxima ação. Documentos ausentes não são inventados; o link oficial permite conferir edital e anexos.
- Candidatos retidos aparecem em fichas próprias, com órgão, processo, produto, motivos, exigências e fonte registrada segura. Destino, justificativa e prazo são identificados como dados a conferir. Um prazo descritivo é preservado literalmente; nenhum desses registros recebe classificação validada automaticamente.
- Matrizes municipais e institucionais possuem busca, filtro de cobertura e paginação. Exportação inclui todos os registros filtrados, não apenas a página. CSV neutraliza células que possam ser interpretadas como fórmulas.
- O botão de Telegram só aparece quando o serviço informa um username válido do bot. A URL é construída com domínio `t.me`; não aceita endereço livre. Perguntas sugeridas podem ser copiadas, sem envio automático. A autenticação e as permissões do bot continuam próprias.
- Respostas atrasadas de relatório e histórico são descartadas ao mudar seleção, atualizar, sair da área ou trocar a sessão. Uma falha limpa o resultado anterior e informa que a leitura não foi confirmada.
- O link de um compromisso inclui `?relatorio=ID&item=ID`. A tela encontra a página do item, limpa os filtros, destaca a ficha, abre seus detalhes e direciona o foco. Item ausente recebe aviso; o link nunca muda silenciosamente para outra pesquisa.

## Histórico e seleção no servidor

`GET painel-dados?modulo=licitacoes` consulta a última pesquisa. `GET painel-dados?modulo=licitacoes&relatorio=ID` consulta exatamente aquela versão. `GET painel-dados?modulo=licitacoes&acao=historico&pagina=N` retorna somente ID, período, geração, recebimento, versão de esquema e hash, além de página e indicação de próxima página. O histórico não transporta dossiês nem anexos.

Todos compartilham a mesma autenticação e permissão `licitacoes`. Seletores desconhecidos, duplicados, combinados de forma inválida ou fora dos limites são recusados com 400. Uma versão inexistente mantém 404, sem buscar a última pesquisa como substituta. Falha da origem, resposta inconsistente ou timeout não produz cobertura zerada; informa indisponibilidade. As respostas de leitura do relatório/histórico usam `Cache-Control: no-store`.

Os dossiês e seus metadados persistem no acervo do bot. O Painel reconstrói a projeção pública a cada leitura; abrir o histórico, selecionar uma pesquisa ou exportar seu resumo não grava um novo relatório nem altera o acompanhamento.

## Resumo PDF

“Baixar resumo PDF” gera um arquivo local a partir da pesquisa inteira selecionada, incluindo todas as oportunidades e todos os candidatos retidos, independentemente dos filtros e da página visível. A geração tem estado de andamento e erro; mudança de relatório ou sessão cancela a entrega pendente.

O documento identifica o ID e a data original da pesquisa, o período e a data de exportação separadamente. Inclui os totais das coberturas municipal e institucional, dados e pendências dos registros, fontes seguras clicáveis e link autenticado para a versão completa no Painel. Não executa nova consulta aos portais nem modifica prazos ou classificação. Candidatos retidos permanecem pendentes de conferência.

Trata-se de um resumo: as matrizes completas dos municípios/instituições e os recibos não são reproduzidos. Ressalvas e limites gerais extensos são resumidos com indicação explícita da quantidade adicional. O arquivo é gerado no navegador e não é salvo no servidor nem enviado a terceiros.

## Calendário e acompanhamento

“Adicionar ao calendário” abre a confirmação de título, data e horário em Brasília. Uma oportunidade com prazo ISO válido pode preencher esses campos, mas a pessoa precisa conferir o prazo na fonte oficial e confirmar a gravação. “Agendar conferência” é a ação dos candidatos retidos: a data começa vazia e representa somente quando revisar as evidências, sem transformar a pendência em prazo de propostas. É possível registrar o evento sem horário.

A gravação usa o fluxo existente de `painel-ativos` e cria uma ficha `tipo: licitacao` em `painel_registros`, coleção `ativo`, com status inicial `avaliar`. Preserva a origem em `origemPesquisa` (relatório, item, órgão, processo, item/lote e condição pendente), título, horário, URL segura e próxima ação. Para uma oportunidade, a data confirmada vai em `validade`; para conferência pendente, vai em `acompanhamento.prazoAcao` e `validade` permanece vazia. Esses dados constituem o acompanhamento persistido, separado do relatório público de origem.

A identidade determinística evita novo cadastro para a mesma combinação de órgão/processo/item/lote, inclusive em relatórios posteriores; quando esses identificadores estão incompletos, usa relatório e ID do candidato. Cliques repetidos e criação concorrente devolvem o registro existente, preservando a data, o relatório de origem, checklist e anexos já salvos. A origem da ficha não pode ser trocada por uma nova criação. Alterações posteriores continuam no acompanhamento da equipe.

A leitura mensal de `painel-agenda` projeta eventos a partir dessas fichas; não cria uma segunda cópia de evento no RH ou em serviço externo. Apenas fichas com origem de pesquisa e status `avaliar`, `participar` ou `enviada` entram no mês correspondente. Encerrar o acompanhamento retira-o dessa projeção sem apagar a ficha. Cada evento oferece retorno ao relatório e item de origem.

Agendar exige simultaneamente as permissões `licitacoes` e `calendario-empresa`, conferidas na interface e no servidor. Editar uma ficha vinculada exige também acesso ao calendário. A leitura da fonte de Licitações no calendário confere os dois módulos antes e depois da consulta, respeitando a autenticação existente; quem não tem os dois acessos não recebe os eventos dessa fonte. Nenhuma leitura ou seleção agenda por conta própria.

## Verificação local e publicação

A prévia `revisao-local.html#/licitacoes` utiliza somente fixtures de demonstração e não acessa o acervo real. O acervo demonstrativo possui 23 versões, duas páginas de histórico e candidatos retidos fictícios. Cenários no parâmetro `cenario`: `licitacoes-inicial`, `licitacoes-sem-relatorio`, `licitacoes-erro`, `licitacoes-historico-erro`, `licitacoes-antigo` e `licitacoes-lento`. Agendamentos fictícios permanecem ao navegar na prévia, mas são descartados ao recarregar; isso não representa a persistência do servidor em produção.

Os testes exercitam permissão e revogação, contrato do serviço, projeção pública, integridade, ausência versus cobertura inicial, relatório antigo, limite de corpo, timeout, descarte de respostas atrasadas, filtros, prazos, paginação, CSV, histórico e seleção por ID, PDF completo em relação aos registros selecionados, vínculos de calendário, permissões combinadas, duplicidade, datas de conferência e renderização React. A instalação normal da CI (`npm ci`) fornece PGlite para testes de banco em memória.

Publicar e conferir o serviço do bot e sua credencial dedicada primeiro; publicar e conferir `painel-dados`, `painel-ativos` e `painel-agenda` antes da tela que dependa das respectivas mudanças. Confirmar o estado efetivo em produção usando leitura autenticada e conferir a resposta sem sessão/permissão. A criação ou alteração de editais continua no fluxo manual existente. Este documento não comprova implantação nem pesquisa executada.

## Execução sob solicitação

O botão Rodar pesquisa e seu executor parcial estão descritos em [licitacoes-execucao.md](licitacoes-execucao.md). Atualizar leitura continua somente consultando o acervo.
