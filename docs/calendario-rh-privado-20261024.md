# Calendário e dados privados do RH

Pedido autorizado: avisos e dados do RH somente para quem tem autorização RH; testar perfil Comercial e publicar.

A ação empresa de painel-agenda confere acesso_conta ativa e vínculo com perfis do RH ADMIN_RH ativo antes de consultar eventos, colaboradores, status ou configuração. Sem autorização retorna eventos vazios; permissões amplas no Painel não ampliam o acesso ao RH. Falha de autorização não devolve dados. O calendário limpa a consulta anterior ao atualizar e identifica a resposta pela sessão.

Verificado: 21 testes focados, 1680 testes de raiz (dois exigiram repetição fora do sandbox por porta local bloqueada; ambos passaram), lint sem erros (aviso anterior em Agenda), build aprovado. Testes somente com dados fictícios. Nenhum registro de produção modificado. RH recebe proteção complementar no sync e na rota; mês branco no cabeçalho.
