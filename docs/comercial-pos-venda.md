# Prospecção e Pós-venda separados

Entrega publicada em 15/10/2026, a partir da main 8a9372a. Autorização de implementação: “sim ele tem que sempre falar o que ele fez pode fazer”. Publicação autorizada por Léo com “subir” em 15/10/2026, após a entrega dos botões Fazer ação e Registrar e finalizar.

## Funcionamento

- Prospecção reúne conquista, reativação e estratégia; pós-venda não entra em seus contadores. A URL antiga é preservada.
- Pós-venda consulta automaticamente todas as páginas de candidatos autorizados e apresenta apenas entregas comprovadas no PCP, independentemente do mês de vendas. Contagens são parciais durante a leitura; falha ou cobertura incompleta não vira ausência de registros.
- Cada O.S. mantém seu cliente e vendedor original. A direção controla sem ação, atrasados, programados, concluídos e vínculos a conferir. Concluídos permanecem consultáveis.
- Cada O.S. pendente tem o botão Fazer ação. No atendimento, Registrar e continuar salva o contato mantendo o próximo passo; Registrar e finalizar registra o contato e conclui em uma única gravação, com relato e resultado obrigatórios. O atalho direto de finalização continua disponível.
- Planejar e reagendar editam a mesma ação, preservando histórico e agenda. Atendimento requer resultado e relato novo do que foi feito. Autor e horário são do servidor; a data do atendimento concluído vem do contato confirmado.
- Vínculo de pós-venda salvo não pode trocar cliente, O.S. ou tipo. Não é permitido transformar uma ação já salva de outro tipo em pós-venda; use a aba de entregas.
- Novas criações da mesma O.S. disputam um ID determinístico na RPC existente, protegida por versão e trava. Não foram aplicadas migrações nem mesclados registros antigos.
- Responsável divergente legado fica a conferir. A vendedora recebe somente um bloqueio sem informações da carteira alheia; a direção pode corrigir explicitamente o vendedor para a origem, mantendo ID e histórico.

## Integrações reutilizadas

O.S., clientes e vendedores sincronizados do Mubisys; prova de entrega do PCP; comercial_acoes e a RPC existente para versão e histórico; projeção existente da mesma ação na agenda. Nenhuma nova credencial, permissão ou tabela. Não houve escrita no ERP/PCP nem gravação de teste em produção.

## Verificação

- 1.444 regressões de tests/ na revisão final de publicação: aprovadas, zero falhas, zero ignorados.
- 653 testes de cálculos/acesso: aprovados, zero falhas, zero ignorados.
- Build com BASE_PATH=/painel-impresilk/: aprovado; 72 classes de cor presentes no CSS compilado.
- Lint dos arquivos alterados: limpo. Lint geral: zero erros e um aviso anterior em Agenda.jsx.
- 15 verificadores oficiais: aprovados. Lista externa de módulos lida da referência pública atual do equipe-auth.
- Node local v24.19.0, TZ=UTC; os testes HTTP locais foram executados com permissão para bind em loopback. O workflow de publicação usa Node 20 e ainda não foi executado por esta alteração.
- TDD dos comportamentos novos, validação de contato/vínculo/carteira, criação concorrente e RPC real em PGlite.
- Navegador: planejamento, reagendamento, bloqueio sem relato, confirmação de atendimento, conclusão e contadores atualizados, histórico com relato/resultado/autoria, duas abas, O.S. antiga fora do período; desktop e 390 px sem transbordamento. Prévia final nova sem erros JavaScript. Todos os dados da prévia são fictícios.
- Revisão independente corrigiu conversão de ação, troca de O.S., atribuição divergente e inicialização de O.S. histórica sem ID de vendedor na primeira página.

## Ajuste dos botões em 15/10/2026

- Após a verificação completa acima, o ajuste incremental foi validado com 103 testes relacionados (incluindo cinco novos cenários), zero falhas/ignorados; lint dos dois componentes e build oficial aprovados. A revisão independente repetiu 58 testes sem bloqueadores.
- Na prévia fictícia, Fazer ação abriu o formulário; finalizar sem relato foi bloqueado; finalizar com relato e resultado mudou o contador de concluídos de 1 para 2 e preservou o histórico. Registrar e continuar em outra O.S. manteve 5 pendentes e 2 concluídos, sem duplicar a O.S.

## Limites e publicação

A consulta depende das fontes sincronizadas e dos vínculos PCP comprovados; mostra cobertura e falhas. Duplicidades legadas não são removidas automaticamente. Não foi conferida escrita com conta real em produção.

Publicação autorizada: publicar painel-comercial com as dependências compartilhadas antes da interface; verificar função e versão oficial após cada etapa. Não há migração nesta entrega. Não versionar a pasta .review, que serve apenas a prévia local.

## Publicação autorizada em 15/10/2026

Servidor publicado antes da tela no commit 9b03e4b; Functions 38813524617 aprovado. As sete funções afetadas estão ACTIVE: painel-comercial 59, painel-agenda 84, painel-config 161, painel-dados 155, painel-ativos 142, painel-marketing 49 e painel-mkt-fontes 42. Todos os 114 arquivos dos pacotes publicados são idênticos ao código validado. Tela publicada no commit 9b6446a; Pages 38813736887 com build e deploy aprovados. HTML, 404 e 117 assets oficiais idênticos ao build validado (119/119). Chrome com sessão real da direção conferiu Prospecção e Pós-venda, entregas, Fazer ação, responsável original da O.S., formulário e botões Registrar e continuar e Registrar e finalizar habilitados. O formulário foi cancelado sem salvar; sem erros JavaScript. O histórico amplo continua por etapas, com contagens parciais explícitas até encerrar a consulta. Não houve teste de escrita com conta real nem sessão real de vendedora restrita. Não houve migração, mudança de credencial, concessão de acesso, mensagem ou gravação de teste em produção.
