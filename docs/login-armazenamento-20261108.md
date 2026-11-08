# Correção do acesso que volta para Entrar sem mensagem

## Comportamento e causa reproduzida

O botão do site foi observado indo para “Entrando...” e voltando para “Entrar”, sem mensagem e sem abrir o painel. O servidor respondeu HTTP 200 na tentativa observada. A inspeção direta do navegador foi interrompida por uma restrição da ferramenta; portanto, a falta de espaço no navegador do usuário ainda é uma hipótese, não uma medição confirmada.

Nos testes com o código publicado, falhas de armazenamento reproduziram o mesmo resultado: `entrar` ocultava erros de gravação e `getSessao` descartava uma sessão válida se falhasse somente a renovação do horário. Também havia aceitação silenciosa de respostas incompletas da porta antiga.

## Correção preparada

- Quando o armazenamento permanente falha, token e identidade são salvos juntos na sessão da aba, usando o mesmo acesso validado pelo servidor. Um aviso informa essa condição.
- Se nem a sessão da aba puder ser salva, a tela exibe um erro e permite tentar novamente. O erro local não dispara uma segunda tentativa de autenticação na porta antiga.
- Falhar ao atualizar o horário não apaga uma sessão válida nem amplia sua validade.
- Respostas sem token ou usuário são rejeitadas com mensagem clara.
- A preferência de tema deixa de derrubar o painel se o armazenamento estiver cheio ou bloqueado.
- Rascunhos, arquivos, dados dos outros sistemas, senhas e regras do servidor não são alterados. Saída, inatividade, permissões e senha provisória continuam sendo conferidas.

## Verificação

Quatro regressões reproduziram a falha antes da correção. Após a alteração: 18 testes focais aprovados, cobrindo armazenamento cheio/bloqueado, gravação parcial, recarga, permissões, saída, expiração, senha provisória e retorno da tela de login. Suíte geral: 2.247 aprovações e dois bloqueios de porta local na sandbox; os sete testes desse arquivo passaram ao repetir com a porta local permitida. Os três novos testes de interface foram executados separadamente e passaram. Build de produção aprovado. ESLint sem erros, com um aviso anterior em Agenda.jsx. Diff-check limpo.

Publicação autorizada pelo dono em 08/11/2026. Antes do envio, os 18 testes focais, o lint focal e o diff-check foram repetidos e aprovados. Publicado: commit `a199528635b10945366f29a05816d97928e952a8`, [Pages 42458017769](https://github.com/leogpereira-afk/painel-impresilk/actions/runs/42458017769), concluído com sucesso. Todos os verificadores e testes da CI passaram. Os 206 arquivos HTML/JS/CSS do site público coincidem por SHA-256 com o build local testado, sem divergências. Nenhuma mudança no servidor ou em registros reais. Foi solicitado ao dono atualizar o site e testar Entrar; a confirmação na sessão afetada continua pendente; o bloqueio de controle do navegador não foi contornado.
