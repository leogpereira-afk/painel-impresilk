# Lixeira reversível dos kits de licitações

## Comportamento

Kits têm duas listas compactas: Ativos e Lixeira. Mover para a lixeira solicita confirmação na própria ficha; Restaurar retorna o mesmo kit aos ativos. A listagem da lixeira mantém as pendências, os requisitos, as datas, o histórico e o download do ZIP sujeito às permissões atuais. Não existe exclusão definitiva nem limpeza automática nesta mudança.

O kit permanece na coleção canônica e conserva seu ID, edital, titular, requisitos e snapshots. As movimentações acrescentam estado, data, pessoa e evento ao histórico. Os arquivos e as fichas dos documentos não são modificados. Renovação no acervo não substitui a versão escolhida no kit. Kits antigos sem estado continuam ativos; não há migração de dados.

## Integridade

As ações de mover e restaurar passam pelo mesmo servidor autorizado, com ambas as permissões de Licitações e Documentos, revalidação da sessão e gravação atômica por versão. Edições obsoletas não recriam um kit retirado. A combinação edital/empresa conserva o kit existente na lixeira e orienta restaurá-lo. Reenvio da mesma movimentação após perda da resposta não duplica o histórico.

Se outra aba retirar um kit durante o preenchimento, a releitura preserva o rascunho. A restauração fica no próprio formulário e exige resolver primeiro os campos alterados nas duas versões; a escolha entre conteúdo local e remoto permanece após restaurar. O salvamento continua explícito.

Restauração preserva referências mesmo se um documento ou edital saiu do acervo, mostrando a pendência. Não reabre acesso a documentos restritos nem ignora as regras do download. O backup inclui o estado de lixeira e o histórico na coleção original.

## Prévia e publicação

Prévia local com dados fictícios na porta 8923, cenário licitacoes-workspace. O banco e os arquivos da demonstração são simulados em memória; os handlers de validação utilizados são os mesmos do servidor. Recarregar reinicia a demonstração. Nenhum documento ou kit real é alterado.

Publicação autorizada pelo dono em 04/11/2026. O servidor painel-ativos foi publicado antes da interface e relido: versão 189 ACTIVE, 27 arquivos iguais ao pacote aprovado e requisição sem sessão recusada com HTTP 401. Nenhuma migração necessária.

O build de d665016 e todas as verificações da CI passaram. A implantação Pages 41894630086 excedeu dez minutos em updating_pages; a repetição somente do deploy reutilizou o mesmo identificador cancelado, retornou status vazio e também excedeu o tempo. A interface anterior continuou servida durante essa falha. Nova implantação com commit cf93c31, alterando somente a documentação, concluiu com sucesso na run 41898996407. Os 224 arquivos servidos, incluindo HTML, bundles e 404, coincidem por SHA-256 com o build aprovado.

## Verificação

Ensaio no navegador com dados fictícios: editar o nome, mover para a lixeira, baixar ZIP, restaurar e atualizar a lista. O mesmo kit retornou com três requisitos, versões e datas originais; o histórico mostrou criação, edição, movimentação e restauração. As fichas dos documentos permaneceram idênticas antes/depois. O ZIP restaurado abriu sem erro de integridade, com índice, datas de emissão/validade e os mesmos bytes dos dois PDFs de demonstração.

Conferência responsiva em 320 e 390 px, além de 1280 px: sem transbordamento horizontal nos kits. Ações móveis com pelo menos 44 px e campos com fonte de 16 px; nenhum erro de console observado. Trata-se de emulação de largura, não de aparelho físico.

Regressão geral: 2.238 testes executados; 2.236 passaram no ambiente restrito. Os dois restantes exigiam abrir uma porta local e passaram ao repetir, com essa permissão, o arquivo completo de sete testes (APIs simuladas; nenhuma publicação). Após o último ajuste, 93 testes focais aprovados cobrem permissões, concorrência, idempotência, backup PostgreSQL, restauração com acervo renovado, preservação das escolhas em conflito e ZIP. Lint focal limpo; lint geral sem erros, com aviso preexistente em Agenda. Builds de produção e revisão aprovados. Revisão independente final sem falha material pendente; diff-check limpo.

Verificação fresca para publicação: 2.241 regressões, 1.503 testes de cálculos/acessos e quinze verificadores aprovados; lint sem erros, com o aviso preexistente de Agenda. A CI da publicação também concluiu suas verificações com sucesso.

No site oficial autenticado, foi criado um kit sintético vinculado a um edital de teste sem participação, com duas versões documentais já existentes: uma com validade e outra sem vencimento. O kit foi movido à lixeira, conferido após recarregar, baixado, restaurado, novamente conferido após recarregar e baixado. Consultas ao servidor confirmaram o mesmo ID, requisitos e snapshots completos; o histórico original permaneceu intacto e recebeu os eventos de movimentação e restauração. Os dois PDFs são idênticos por SHA-256 nos três ZIPs, cujos índices mantêm as datas e a indicação de documento sem vencimento. Nenhum erro de console observado durante o ciclo.

A comparação final manteve idênticos todos os 102 registros e 120 arquivos preexistentes. Somente os dois cadastros sintéticos de apoio foram acrescentados; nenhum documento real foi editado. O kit de teste ficou na lixeira recuperável com quatro eventos, e o edital de apoio permanece identificado como teste sem participação para permitir sua restauração. Nenhuma exclusão definitiva foi feita. A conferência oficial foi realizada no Chrome; os tamanhos de celular foram ensaiados na prévia, não em aparelho físico.

Evidências locais, fora do Git, em /tmp/licitacoes-lixeira-20261104 e /tmp/licitacoes-lixeira-release-20261104. Nenhum documento privado ou cópia de registros entra no repositório.
