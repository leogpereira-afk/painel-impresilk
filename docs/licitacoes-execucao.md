# Pesquisa pública no painel

O botão Rodar pesquisa é independente de Atualizar leitura. Somente a Direção (master ou permissão geral, conferidos no servidor) inicia o workflow pesquisa-licitacoes.yml na main. Pessoas com permissão de Licitações consultam o relatório e o andamento. Revogação é verificada antes e depois das operações externas.

O disparo reutiliza a credencial de Actions já configurada no servidor. Não expõe essa credencial ao navegador. Reserva concorrente e intervalo entre solicitações ficam em uma chave dedicada de painel_meta; execução ativa é reaproveitada. Uma solicitação aceita não comprova início, e um workflow bem-sucedido não comprova cobertura integral.

O executor atual consulta propostas abertas no PNCP para MG, com horizonte explícito de um ano, paginação, deduplicação e registro de erros/mudanças de contagem. Faz triagem textual do portfólio e dos nomes canônicos, sem confundir sede e destino ou promover metadados a edital analisado. O recorte de propostas não esgota publicações dos últimos 90 dias. Portais próprios, Diário, anexos, demais compradores e confirmações internas continuam como pendências. O relatório preserva os recibos e sua data; consultas de outra janela não contam como consultas atuais. O botão não equivale à pesquisa completa feita pelo executor semanal.

Para publicar somente dados públicos, o workflow recebe uma identidade OIDC temporária do GitHub. O servidor confere assinatura RS256 com JWKS oficial, emissor, destinatário, IDs do repositório/proprietário, workflow específico, main, evento manual e validade. A confiança não se aplica às rotas privadas e não reutiliza o token de leitura do painel para escrita. A identidade pode ser utilizada durante sua curta validade; não é um token de uso único.

O dossiê é validado pela whitelist, publicado com ID imutável e SHA-256 e lido novamente por ID. Resultado incerto não gera repetição cega. O cache persistido do relatório contém somente resumos derivados; a leitura sempre reconstrói as linhas do dossiê original, conferindo hash e metadados. Isso evita a repetição das evidências em cada município estourar o limite de armazenamento. Limites: corpo 512 KiB, JSONB do dossiê 650.000 bytes, leitura entre servidores 600 KiB. RLS e privilégios anteriores são preservados.

Prompts geral e por edital copiam somente contexto público para revisão pelo usuário. Não enviam mensagens nem criam proposta, participação, sessão ou vitória. A classificação GO exige as quatro confirmações e não autoriza disputar.

Validação: regressões de publicação, recibos, conflitos, tamanho UTF-8, revogação, OIDC, concorrência, correlação de execução, erro, paginação e interface. Confira o resultado real da execução e a versão publicada antes de declarar integração validada.

Referência técnica: [OIDC do GitHub](https://docs.github.com/en/actions/reference/security/oidc).
