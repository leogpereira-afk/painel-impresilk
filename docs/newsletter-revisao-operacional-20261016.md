# Revisão operacional da Newsletter — 16/10/2026

Estado: revisão local, não publicada. Integração de envio pendente de definição do serviço e remetente pelo usuário.

## Diagnóstico e alterações
- Listas estavam pouco visíveis: agora aparecem com contagens e filtro de membros.
- Adicionar e-mails exigia formulário ou CSV: agora também aceita colar até 500 endereços, valida duplicados e inválidos e exige lista de destino. Importação permanece pendente, sem ativação automática.
- Composição pouco clara: etapas Escrever mensagem, Escolher público, Revisar e enviar, com assunto, texto, prévia e destinatários elegíveis.
- Histórico pouco acessível: aba própria e abertura direta das versões.
- Descadastro: filtros e registro manual do motivo, preservado no servidor; importação não reativa supressões.
- Configurações: remetente separado da conexão de envio. Não há formulário de senha ou chave pública.

## Verificação
Build oficial e de revisão sem erro. ESLint dos arquivos alterados sem erro. 35 testes focados passaram. Diff sem erros de whitespace.
Navegador local: colagem com duplicado/invalidade resultou em dois válidos e duas recusas; dois contatos importados pendentes. Campanha percorreu as três etapas e foi salva na simulação sem enviar. Histórico abre diretamente as versões. Layout observado em 390px e restaurado ao tamanho original.
Correção encontrada na conferência: display:grid sobrescrevia hidden no fieldset; substituído por renderização condicional, conferida no navegador.

## Ainda necessário para envio real
1. Identificar serviço de envio e endereço remetente (pergunta ao usuário pendente).
2. Implementar conexão segura no servidor, domínio verificado, envio de teste autorizado e confirmação de destinatários.
3. Fila/idempotência, destinatários congelados por envio, estados de entrega/falha e histórico de disparos.
4. Descadastro público seguro e eventos do provedor validados; métricas automáticas conforme suporte real.
5. Verificação ponta a ponta e autorização de publicação. Nenhum disparo real realizado.

A tela atual oferece preparação e gestão, não um serviço de envio concluído. Na publicação desta revisão, painel-marketing precisa subir antes da tela por causa do campo motivoSaida.

## Complemento Locaweb
O dono confirmou Locaweb e adiou a configuração. Formulário preparado para host, porta, TLS/STARTTLS e usuário SMTP, além de remetente/respostas. Dados não secretos são validados e persistidos no registro existente; senha não é recebida nem armazenada. Não há valores de conexão presumidos. Botões de teste/envio continuam desabilitados até implementação e verificação da integração segura. Nenhuma configuração real ou publicação realizada.

## Publicação autorizada
Em 16/10/2026 o dono autorizou subir tudo. Commit 55ec5d0, Pages 38885378580 e Functions 38885378551 aprovados. Servidor final v55 com 12/12 arquivos iguais; 121/121 arquivos públicos iguais ao build validado. Configuração da Locaweb permanece para depois, conforme pedido. Sem disparo real.
