# Licitações: pesquisa do BotImpresilk e acompanhamento da equipe

O módulo possui duas áreas independentes. **Pesquisa do BotImpresilk** lê o último relatório público validado; **Acompanhamento da equipe** conserva editais, arquivos, responsáveis, checklist e resultados cadastrados anteriormente. Uma oportunidade pesquisada não cria uma licitação acompanhada nem autoriza proposta, participação ou lance.

## Leitura e integração

O navegador chama `painel-dados?modulo=licitacoes` usando o crachá existente. O servidor confere a permissão `licitacoes` e a revogação estrita antes e depois da consulta. Esta rota aceita somente GET, não grava registros e não consulta ERP, RH, e-mail ou memória pessoal.

Como painel e bot utilizam projetos distintos, a leitura usa a rota dedicada `badboy-telegram?acao=licitacoes-painel`. O endereço é fixo, com credencial de leitura `LICITACOES_PAINEL_TOKEN` somente nos ambientes dos dois servidores. O cabeçalho de serviço é `x-licitacoes-painel-token`. Não repassa o crachá do usuário nem aceita endereço ou ID informado pelo navegador. Não segue redirects, limita o documento a 250 KiB e encerra a consulta em quinze segundos.

O serviço do bot entrega o último dossiê público, com ID, geração, período, versão e SHA256. O painel rejeita campos desconhecidos, recomputa o relatório com `supabase/functions/_shared/licitacoes-controle.mjs`, confere hash e metadados e entrega apenas a projeção pública. Totais persistidos não substituem a reconstrução. O núcleo congelado é compartilhado com o bot; versão `2026.10.12-cobertura-2-educacao`, SHA256 `99dd186a62b3e92736ed9ff002cbd9de0466f017a88d0147c8c5d0e9ceb87e75`.

A matriz institucional contém 32 grupos obrigatórios. Unimontes, UFMG / ICA, IFMG e IFNMG são grupos distintos, incluindo suas reitorias, campi e compras centralizadas destinadas à região. A sede do órgão não substitui a avaliação do local de execução.

Se a credencial estiver ausente, há erro de configuração, sem cobertura inventada. Relatório ausente é diferente de relatório inicial com 89 municípios não consultados e 0%. Atualizar a leitura não executa a pesquisa semanal. O agendamento e a publicação da pesquisa pertencem ao executor autorizado do bot.

## Uso da tela

- Geração e período identificam a pesquisa; a leitura atual não renova essas datas. Relatórios com oito dias ou mais mostram ressalva.
- KPIs municipais sempre usam o denominador 89. Cobertura institucional tem quadro e contagens separados.
- A busca combina processo, item, produto e destino com filtros de classificação, município de execução, órgão e produto.
- Prazos abertos aparecem primeiro. Um prazo encerrado na leitura não altera silenciosamente a classificação histórica, mas exige conferência no portal oficial.
- Detalhes mostram critérios, exigências, destino, viabilidade registrada e próxima ação. Documentos ausentes não são inventados; o link oficial permite conferir edital e anexos.
- Matrizes municipais e institucionais possuem busca, filtro de cobertura e paginação. Exportação inclui todos os registros filtrados, não apenas a página. CSV neutraliza células que possam ser interpretadas como fórmulas.
- O botão de Telegram só aparece quando o serviço informa um username válido do bot. A URL é construída com domínio `t.me`; não aceita endereço livre. Perguntas sugeridas podem ser copiadas, sem envio automático. A autenticação e as permissões do bot continuam próprias.
- Respostas atrasadas são descartadas ao atualizar, sair da área ou trocar a sessão. Uma falha limpa o resultado anterior e informa que a leitura não foi confirmada.

## Verificação local e publicação

A prévia `revisao-local.html#/licitacoes` utiliza somente fixtures de demonstração e não acessa o acervo real. Cenários no parâmetro `cenario`: `licitacoes-inicial`, `licitacoes-sem-relatorio`, `licitacoes-erro`, `licitacoes-antigo` e `licitacoes-lento`.

Os testes exercitam permissão e revogação, contrato do serviço, projeção pública, integridade, ausência versus cobertura inicial, relatório antigo, limite de corpo, timeout, descarte de respostas atrasadas, filtros, prazos, paginação, CSV e renderização React. A instalação normal da CI (`npm ci`) fornece PGlite para testes de banco em memória.

Publicar e conferir o serviço do bot e sua credencial dedicada primeiro; publicar e conferir `painel-dados` antes da tela dependente. Confirmar o estado efetivo em produção usando leitura autenticada e conferir a resposta sem sessão/permissão. A criação ou alteração de editais continua no fluxo manual existente. Este documento não comprova implantação nem pesquisa executada.
