# Vez do Painel Impresilk

## Trabalho atual · Token da Meta com gerenciar anúncios

Agente: claude. Pedido de Léo nesta conversa, em 12/10/2026: "fazer tudo pra mim" na Meta. Ramo `claude/meta-token-20261012`, clone isolado em /tmp. O Léo gerou o token do painel-coletor de novo com ads_management, e a coleta real das 11:27 UTC trouxe as estatísticas do Pixel (59 eventos em 6 dias) e a Meta inteira "ok", sem aviso: a causa da negação era essa permissão. Mudança: o Como ligar passa a pedir as nove permissões, com o porquê, e o aviso de estatísticas negadas diz o que fazer. Verificação local: 627 e 1.252 testes aprovados, lint sem erros, build aprovado. Sem mudança de banco nem de registros (os links dos canais Instagram e Facebook foram cadastrados pela tela, a pedido do Léo).

## Trabalho atual · A Meta a fundo

Agente: claude. Autorização de Léo nesta conversa, em 12/10/2026: "vai a fundo no meta" e "vamos resolver". Ramo `claude/meta-fundo-20261012`, clone isolado em /tmp. Auditoria campo a campo da coleta real da Meta: os números da Página (41 seguidores, zeros reais), do Instagram e das campanhas (todas pausadas desde 02/2025) conferem. Consertos de tela: anúncios sem entrega no período mostram R$ 0,00 e "nenhum anúncio rodou" (antes "não medido"), com alerta quando a conta não está ativa (hoje "pagamento pendente"); a situação do Pixel vem do último disparo ("nunca disparou", "parado há N dias"); país e cidade dos seguidores da Página explicam o limite de 100 seguidores da Meta. Verificação local: 627 e 1.252 testes aprovados, lint sem erros, build aprovado. As estatísticas do Pixel (negadas pela Meta) seguem em pesquisa. Sem mudança de banco nem de registros.

Publicado e conferido em 12/10/2026: código `21d3ffd`, Pages 38239499440 com sucesso; na tela do Facebook aparecem "R$ 0,00 no período", "nenhum anúncio rodou", o alerta de "pagamento pendente", "nunca disparou" no segundo Pixel e "menos de 100 seguidores". Pesquisa das estatísticas do Pixel sem resposta oficial; a hipótese mais forte é o token sem ads_management (teste do Léo, sem código). Trabalho concluído: fim da vez do Claude, e o Léo decide quem segue.

## Trabalho atual · Consertos da coleta da Meta

Agente: claude. Autorização de Léo nesta conversa, em 12/10/2026: "corrigir meta". Ramo `claude/meta-consertos-20261012`, clone isolado em /tmp. Escopo: as recusas da primeira coleta real da Meta (estatísticas do Pixel e visualizações do Instagram, as duas com "código 100"). Passo 1: o diário passa a guardar a mensagem da Meta junto com o código (curta, sem token), para achar a causa. Passo 2: o conserto. Sem mudança de banco nem de registros.

Passo 1 publicado (`5414aab`) e lido no diário real: o Pixel volta "(#100) Permission Denied" e as visualizações do Instagram, "breakdown[0] must be one of ... follow_type ...". Passo 2: a divisão das visualizações por seguidor passa a pedir follow_type (o nome que a API aceita; a documentação diz follower_type); divisão recusada ganha aviso próprio (antes dizia que as visualizações tinham ficado vazias, e as da semana tinham vindo); estatísticas do Pixel negadas viram o código estatisticas_negadas, com uma chamada só e aviso claro. Verificação local: 624 e 1.252 testes aprovados, lint sem erros, build aprovado.

Publicado e conferido em 12/10/2026: código `27cf675`, Functions 38234463130 e Pages 38234463138 com sucesso. Coleta real da Meta às 10:12 UTC: Instagram sem recusa (visualizações por seguidor chegaram), Pixel com estatisticas_negadas numa chamada só e um aviso, 65 chamadas (eram 70). As estatísticas do Pixel seguem negadas pela Meta: a causa (permissão do app ou modo do app) não está documentada e fica para investigar. Trabalho concluído: fim da vez do Claude, e o Léo decide quem segue.

## Trabalho atual · Testes de banco na CI

Agente: claude. Autorização de Léo nesta conversa, em 12/10/2026: "testar o github automatico" (a CI passar a testar o banco de verdade). Ramo `claude/ci-banco-20261012`, clone isolado em /tmp. Escopo: `@electric-sql/pglite` 0.5.8 (exata, de 26/08/2026, sem dependências) no devDependencies, para o `npm ci` da CI instalar; `tests/banco-na-ci.test.mjs` falha na CI (CI=true) se o PGlite faltar, em vez de os testes de banco pularem calados. Sem mudança de código do Painel, de servidor ou de banco.

Estado: verificação local como a CI (npm ci limpo, CI=true, TZ=UTC): 1.248 testes aprovados, nenhum pulado. Os 10 arquivos de banco têm 89 testes: sem o pacote, 84 pulavam; com ele, os 89 passam. A trava foi conferida nos dois sentidos (sem o pacote, falha com CI=true e pula fora da CI).

Conferido na CI em 12/10/2026: commit `d8d87d3`, Pages 38200228870 com sucesso (build e deploy). No registro da etapa "Regressões da auditoria": 1.248 testes aprovados, 0 pulados, a trava `banco-na-ci` aprovada e os testes de PostgreSQL rodando. Trabalho concluído: fim da vez do Claude, e o Léo decide quem segue.

## Trabalho atual · Sobras do Centro de Comando do Marketing

Agente: claude. Autorização de Léo nesta conversa, em 12/10/2026: "Sim, pega a vez" (aplicar e publicar as sobras do Marketing) e "12 meses" para a guarda dos leads do Google Ads. Ramo `claude/marketing-sobras-20261012`, clone isolado em /tmp. Escopo: leads do Google Ads guardados por 12 meses, contados do dia do formulário; parte do retrato de uma fonte sem coleta boa há mais de 1 ano sai do cache (o caso do token do LinkedIn vencido); o "hoje" da tela de Marketing vem do servidor; aviso de cache do conector do site em linguagem de gente; link do Pinterest de cada país (br.pinterest.com) igual ao que a API manda; campanha de leads pausada no Pinterest não grava lead 0 nas semanas seguintes; dados fictícios da prévia sem data no futuro e ancorados na semana de hoje. Sem migração e sem alteração de registros reais (conferido antes: nenhuma publicação do Pinterest no banco). Os trabalhos do Codex abaixo permanecem intactos.

Estado: verificação local concluída. 624 testes de cálculo e 1.247 de tests/ aprovados, lint sem erros (o aviso anterior em Agenda), build e build da prévia aprovados, e as conferências da CI (portas, papel, imports, 404, realizado, acessos, gestão, cobrança, fotos, CRM, ações do Mubisys, licitação, restauro, classes) aprovadas.

Publicado e conferido em 12/10/2026: código `b24f92e`; Functions 38199597503 e Pages 38199597538 com sucesso. No ar, `painel-mkt-fontes` v9 (15 arquivos) e `painel-marketing` v16 (10 arquivos) idênticos ao código; o pedaço novo da tela de Marketing está no arquivo que o Pages serve. A Política de Privacidade do site (impresilk.com.br/?page_id=3) passou a dizer que o painel recebe os contatos dos formulários dos anúncios do Google, só para a gestão, guardados por 12 meses. Sem migração e sem alteração de registros reais. Trabalho concluído: fim da vez do Claude, e o Léo decide quem segue (antes deste trabalho a vez era do Codex).

## Trabalho atual · Compromissos e identidade do RH

Agente: codex. Autorização de Léo: “finalizar”, em 11/10/2026. Ramo `codex/compromissos-rh-20261011`, clone isolado em /tmp. Usar o vínculo existente `acesso_conta.colaborador_id`, sem criar identificadores de pessoas ou associar por nome. Preservar o dono usado nas permissões e os históricos. Implementação e verificação local autorizadas; publicação e alterações de dados reais dependem de autorização específica. Os demais trabalhos deste arquivo permanecem intactos.

Estado: integração local concluída com a ficha existente e o código `acesso_conta.id_pessoa`, nome/foto, encaminhamento e eventos por RH ID. 25 testes pertinentes aprovados; suíte completa com 1.716 aprovados, zero falhas e 84 condicionais de banco não executados. Builds e 15 verificadores aprovados; lint sem erros, um aviso anterior em Agenda. Desktop/celular e gravações fictícias conferidos no navegador. Relatório em `docs/compromissos-rh.md`. Não houve publicação, migração, concessão de acesso ou alteração de registros reais. A vez continua do Codex.

Publicação autorizada por Léo: “subir”, em 11/10/2026, após a revisão local. Servidor publicado antes da tela: `painel-config` v123 ACTIVE, 14 arquivos comparados com o código validado e idênticos. A liberação da tela está em andamento. Nenhuma migração, alteração de registros ou concessão de acesso.

Conferência oficial concluída em 11/10/2026: código `0117f1d`, liberação `b99705e`; Pages 38176183363 e Functions 38176183434 com sucesso. Função final `painel-config` v124 ACTIVE, 14 arquivos idênticos à revisão. HTML, JavaScript e CSS oficiais de Compromissos idênticos ao build validado. Sessão real da Direção confirmou nomes/fotos/códigos do RH, busca com zero inicial, identidade no formulário e destino do encaminhamento, sem gravar. Os controles não concedem acesso nem resolvem vínculos faltantes automaticamente. Testes locais de escrita/perfis restritos usam banco e autenticação simulados; conferência autenticada com conta restrita real não executada. Sem alteração de registros reais. Publicação concluída; a vez continua Codex.

## Trabalho atual: Documentos e vencimentos

Publicação autorizada por Léo: “pode subir”, em 11/10/2026, após revisão local. Servidor publicado e todos os arquivos conferidos antes da tela: painel-ativos 105, painel-agenda 46, painel-auth 115 e equipe-auth 79. RPC estrutural aplicada sem transformar registros; assinatura dos cadastros preservada. Publicação da tela em andamento. Nenhuma concessão de acesso.

Agente: codex. Pedido de Léo em 11/10/2026, conforme especificação completa desta conversa. Menu lateral Documento & Seguros. Ramo codex/documentos-vencimentos, clone isolado em /tmp. Escopo: implementação e revisão local de documentos, titulares, veículos vinculados, garantias, seguros, versões, permissões e calendário. Publicação e migração de registros dependem de aprovação específica. Plano em docs/documentos-vencimentos.md. Preservar arquivos e cadastros; nenhuma concessão automática de acesso.

Verificação final local: 1.778/1.778 testes aprovados, sem ignorados; produção e revisão compiladas; lint sem erros (um aviso anterior em Agenda); 22 permissões conferem nas três listas. Tabela compacta, detalhes recolhíveis, impressão, abertura por ID e celular de 390px conferidos com dados fictícios. Sessão/permissão alterada descarta cache e formulários antigos. Não houve commit, publicação, migração de registros nem concessão de acesso. Falta autorização de publicação e validação autenticada real.

Agente: codex

Autorização: dono confirmou nesta conversa a criação do protocolo inicial e a vez do Codex.

Escopo: publicar a vinculação de todas as pessoas do Patrimônio aos IDs oficiais do RH, preservar históricos e conferir a versão no endereço oficial.

Estado: publicação autorizada pelo dono nesta conversa ("pode sim") e verificada em 11/10/2026. Código publicado: `da040bf`. Servidor confirmado antes das telas; versões finais: `painel-config` 116 e `painel-ativos` 100. GitHub Pages e Edge Functions concluídos com sucesso. No Chrome, conferidos o seletor real do RH, o ID da opção selecionada, telefone opcional, edição de cadastro antigo e responsáveis de veículos nas telas compartilhadas. Nenhum vínculo antigo foi migrado nem registro de teste criado em produção.

Verificação: 956 testes de auditoria aprovados (74 casos condicionais não executados), 564 testes de cálculo/acesso aprovados, compilação e verificadores da publicação aprovados; lint sem erros, com dois avisos anteriores em Agenda e CalendarioEmpresa. A alteração de código e o protocolo estão concluídos. A vez permanece do Codex até decisão do dono.

## Trabalho atual · Patrimônio e Manutenções

Autorização: Léo pediu a unificação e confirmou “fazer o que tem que ser feito” após a consulta sobre o protocolo.

Ramo: `codex/patrimonio-manutencoes-unificado`, clone isolado fora do iCloud.

Escopo: entrada única Patrimônio e fases 1–3 da evolução solicitada: permissões, proteção das respostas no servidor, ordem dos chips, novas famílias de manutenção e prévia somente leitura. Implementação de servidor preparada localmente, sem implantação ou migração de registros.

Estado: fases 1–3 verificadas localmente. Pausa solicitada pelo dono antes da fase 4 e de qualquer migração. Ajuste pontual autorizado e preparado também na lista MODULOS_PAINEL da equipe-auth, em clone separado de vida-leo, ramo codex/patrimonio-permissoes. Publicação desta alteração ainda não executada; a autorização anterior de publicação refere-se à vinculação ao RH. Plano e próximos passos em docs/patrimonio-fases.md.

Verificação em 11/10/2026: build aprovado; lint sem erros (dois avisos anteriores em Agenda e CalendarioEmpresa); 592 testes de cálculo/acesso e 51 testes de handlers/UI aprovados. As 21 permissões conferem nas três listas, usando o clone atualizado de vida-leo. Navegador local com dados fictícios conferiu ordem, primeira aba por permissão, Pendências internas, bloqueios de aquisição, novas famílias e celular sem transbordamento ou erros JavaScript. Teste autenticado com conta restrita no servidor publicado permanece para a fase 7; transporte/auth dos testes locais são sintéticos.

### Fase 4 autorizada

O dono autorizou continuar e detalhou Ramais: setor para localização e aparelho instalado para troca. Implementação local de Estrutura hidráulica/elétrica e Ramais concluída. Prévia oficial repetida sem candidatos, sem reclassificação aplicada. SQL de integridade e RPC de famílias preparados, não publicados. 662 testes aprovados incluindo banco PostgreSQL local; build OK; fluxo de troca, histórico e lançamento por ID conferido em desktop/celular. Restam fases 5–7 e publicação com autorização específica.


### Fases 5–6 e verificação local final

Autorização: o dono pediu “fazer todos”, reunir Ramais e Celulares e acrescentar Extintores/AVCB, luminárias de emergência e placas de segurança. Telefonia, Computadores, Segurança e Prevenção contra incêndio concluídos na revisão local, com RH e vínculos por ID e calendário calculado a partir das fichas.

Verificação final: 698/698 testes aprovados, sem ignorados, com handlers sintéticos e PostgreSQL local; build aprovado; lint sem erros (dois avisos anteriores). Fluxos completos e perfis restritos no navegador aprovados, celular390px sem transbordamento. Revisão independente de escopo/qualidade aprovada após correções de integridade e restauração dos três formatos de legado.

Estado: ramo local preservado, sem commit, merge ou implantação. Seis migrações estruturais e funções preparadas; nenhuma aplicada no Supabase. Não houve concessão automática de permissão nem transformação de registros. Publicação exige autorização específica; verificação com conta restrita real no servidor publicado permanece pendente. Detalhes em docs/patrimonio-fases.md. A vez continua Codex.

### Expansão de Estrutura e Celulares e Ramais

Autorização: especificação detalhada do dono de 11/10/2026, “adicionar mantendo o padrão existente”. Novas divisões Internet, Computadores/Servidores e Parte Elétrica; plano corporativo único, contato e relação por RH ID. Código local implementado e verificado: 711/711 testes sem ignorados, build OK, lint sem erros (dois avisos anteriores), verificadores 122 ações/91 escritas/fotos/21 módulos e navegador desktop/celular/perfis restritos aprovados. Revisão independente aprovada após correções de linhas sem aparelho e referências antigas intactas. Sete migrações preparadas, nenhuma aplicada remotamente. Não houve commit, publicação, concessão de acesso ou alteração de dados reais. Publicação e validação com pessoa restrita no servidor continuam pendentes de autorização específica. A vez continua Codex.

### Publicação autorizada da expansão

Autorização: Léo confirmou “subir” em 11/10/2026, após a entrega da revisão local. O escopo inclui Patrimônio/Manutenções, banco de integridade e as duas permissões da equipe-auth. Publicar servidor antes da tela; preservar dados e históricos.

Pré-publicação: 1094/1094 testes da suíte completa de auditoria com PostgreSQL local, sem ignorados; 711/711 testes integrados de patrimônio/cálculos/acesso da revisão; build e verificadores aprovados. Ajustados os verificadores de rotas para as permissões internas e os imports de teste da Licitação para os módulos compartilhados novos. Cópias de recuperação privadas preparadas fora do Git. Nenhuma reclassificação ou concessão de acesso será feita automaticamente.

Estado: publicação em execução; confirmar as versões do servidor e a versão oficial das telas antes de declarar concluída.

### Publicação concluída · 11/10/2026

Patrimônio/Manutenções publicado com autorização “subir”, commit 86c01a0; duas permissões da equipe-auth no vida-leo, commit 5e9a9ce. Sete migrações de integridade aplicadas sem transformar registros; comparação privada confirmou preservação. Servidor conferido antes da tela e novamente após os Actions; versões ativas 119/103/113/48/44 e equipe-auth 78. Pages e functions verdes; arquivos oficiais das duas telas idênticos ao build validado. Build OK e 1094/1094 testes locais de auditoria aprovados. Nenhuma concessão de acesso automática.

Limitação: conta restrita real não estava autenticada no navegador oficial. Testes dos handlers com perfis restritos simulados e leitura pública recusada com 401 passaram; conferência autenticada com pessoa restrita real continua pendente. Relatório detalhado em docs/patrimonio-fases.md. A vez continua Codex.

### Ajuste da navegação de Estrutura

Pedido após a publicação: abrir em Itens e deixar Hidráulica separada. Itens é a primeira área e o destino padrão; Hidráulica apresenta apenas suas instalações e caixas-d’água, sem duplicação dentro de Itens. Links anteriores preservados. 29 testes pertinentes aprovados, build e lint dos arquivos alterados OK; navegador local confirmou abertura em Itens e caixa-d’água somente na área Hidráulica. Correção de navegação da publicação autorizada, sem alteração de servidor ou dados.

### Listas de Ramais e Celulares

Pedido complementar: Telefonia abre em Ramais, depois Celulares; ambos em lista. Linhas compactas com número, pessoa, setor e situação; aparelho, manutenção e trocas continuam recolhíveis. Relação de números e Plano corporativo seguem disponíveis. Build e lint dos arquivos alterados OK, 15 testes de telefonia/infra aprovados; abertura, duas listas e expansão dos detalhes conferidas no navegador, sem transbordamento em 390 px. Mudança somente de apresentação, sem migração ou alteração de registros.

### Telefonia no padrao de Armarios

Ramais e Celulares usam tabela com cabecalhos, filtros Todos/Com responsavel/Disponiveis com contagem, busca, acoes a direita e historicos recolhiveis. Em celular, cada registro mostra os campos empilhados. Mantidos IDs, permissoes, edicao e historicos. Verificacao: 15 testes, lint dos componentes e build aprovados; navegador local conferiu filtro de disponibilidade e historico do aparelho. Publicacao dentro do ajuste visual solicitado pelo dono.

### Navegacao compacta de Seguranca

Ajuste solicitado pelo dono: cameras/gravadores juntos, chaves/acesso facial juntos, alarmes, portoes e relogio de ponto; aba Desligamento retirada com sua consulta extra. Filtros por tipo e atalhos de cadastro preservam categorias e IDs. 24 testes pertinentes, lint e build aprovados; navegador local conferiu grupos, formulario de gravador e acesso facial e layout estreito. Sem alteracao de dados ou servidor.

### Cadastro anterior a qualquer nova manutencao

Pedido do dono: qualquer item que receba manutencao precisa estar em Bens e cadastros. Cadastro e edicao de Carros/Maquinas movidos para essa area; Manutencoes conserva os servicos e oferece retorno a ficha por ID. Links antigos de cadastro redirecionam para Bens. O servidor valida todos os IDs antes de escrever o lote; referencia ausente, nome, item retirado ou documento nao cria servico novo. Correcoes de historicos antigos mantem o vinculo anterior.

Verificacao: 1014 testes de auditoria aprovados (83 condicionais de banco sem execucao nesta rodada), 610 testes de calculo/acesso aprovados, build e verificadores aprovados; lint sem erros, com os dois avisos anteriores. Navegador local conferiu ficha, formulario, item selecionado pelo mesmo ID e retorno ao cadastro, sem transbordamento em 319 px. A previa bloqueia gravacoes genericas: os testes de escrita usam handlers com banco/auth sinteticos, sem registros reais de teste.

Publicacao dentro da evolucao autorizada do Patrimonio: painel-config 120 ativo e com todos os arquivos conferidos antes da liberacao da tela. Nenhuma migracao, concessao de acesso ou alteracao de cadastros reais. A vez permanece Codex.

Conferencia oficial concluida: codigo bde1a7d; Pages 38164888473 e Functions 38164888478 com sucesso. painel-config 121 ativo e identico ao codigo validado apos o workflow. Pagina inicial e arquivos oficiais de Patrimonio/Manutencoes idênticos ao build local. Nao houve gravacao de teste em producao; os testes de handlers usam autenticacao/banco sinteticos.


## Ajuste pontual · Atalho do Brief no Comercial

Agente: codex. Pedido de Léo em 11/10/2026: colocar um atalho para o Brief no topo do painel Comercial. Ramo `codex/comercial-brief-20261011`, clone isolado em `/tmp`. Escopo: reutilizar nome, ícone e endereço direto do cadastro central de sistemas e abrir o Brief em outra aba. Sem alteração de credenciais, permissões, servidor ou dados. Implementação e revisão local autorizadas; Léo aprovou a publicação deste atalho em 11/10/2026 com “Aprovado”, após a prévia. Publicação em execução. Preservar os demais trabalhos registrados neste arquivo.

Verificação local do atalho: 9/9 testes de navegação aprovados, compilação de produção e lint de Comercial.jsx aprovados, diff sem erros de whitespace. Chrome confirmou o botão no topo, abertura do Brief em outra aba e preservação do Comercial. Tela de 390 px conferida sem transbordamento horizontal e sem erros JavaScript. Nenhum commit, publicação ou alteração de dados executado.

Pré-publicação aprovada: suíte de auditoria com 1.080 testes aprovados e zero falhas (84 casos condicionais de banco sem execução), 621 testes de cálculo/acesso aprovados, build com BASE_PATH oficial e lint sem erros (um aviso anterior em Agenda). Os verificadores do Pages passaram, inclusive as 22 permissões contra a versão atual de vida-leo. Publicar apenas o atalho aprovado e confirmar a versão oficial antes da entrega.


## Evolução completa do Comercial · 11/10/2026

Agente: codex. Atalho Brief publicado e conferido no commit bc2c564. Léo autorizou “Fazer as outras coisas”: implementar localmente as três etapas do pedido Comercial e do desenho já apresentado. Clone isolado /tmp, ramo codex/comercial-evolucao-20261011. Plano em docs/superpowers/plans/2026-10-11-comercial-evolucao.md. Preservar os demais trabalhos. Sem alteração de registros reais, ERP, acessos ou mensagens. Publicação desta reforma exige aprovação específica após a revisão concreta.

Verificação local desta reforma: 1.142 testes de auditoria aprovados, 84 casos condicionais de banco não executados; 620 testes de cálculo aprovados. Build e verificadores oficiais aprovados; lint sem erros, com um aviso anterior em Agenda. Chrome desktop/celular e revisão independente F1–F14 conferidos. Troca de sessão/permissões remonta o módulo para descartar consultas e formulários antigos. Metas/calendário/fichas sem fonte oficial permanecem explícitos. Estado: código e revisão local preparados, sem commit, merge, push, implantação ou mudança de registros reais. Entrega em docs/comercial-evolucao.md; publicar servidor antes da tela somente após aprovação específica do dono.

Publicação desta reforma autorizada por Léo em 11/10/2026: “subir”, após a entrega da revisão local. Integrar a main atual com Compromissos RH; publicar e comparar funções antes da tela, sem migração ou alteração de registros reais.

Servidor desta evolução publicado antes da tela em 11/10/2026: painel-comercial v24, painel-agenda v49, painel-config v125 e painel-dados v120 ACTIVE. Todos os 67 arquivos dos quatro pacotes são idênticos ao código integrado validado. A main 2aeb387 foi preservada, incluindo Compromissos RH. Conferência local final: 1.156 testes de auditoria aprovados e 84 condicionais de banco não executados, 621 cálculos e 6 acessos aprovados; build oficial, 15 verificadores e revisão independente do merge aprovados; lint sem erros, um aviso anterior em Agenda. A lista externa de permissões foi conferida contra a equipe-auth oficial atual, pois a cópia antiga local estava desatualizada. Publicação da tela em andamento; nenhuma migração ou gravação de registros reais.

Conferência oficial desta evolução concluída em 11/10/2026: código 3e51a01, integração a25dce5, liberação 3894c2a. Pages 38178121510 e Functions 38178121497 com sucesso. Funções finais painel-comercial 25, painel-agenda 50, painel-config 126 e painel-dados 121 ACTIVE; 67 arquivos idênticos ao código validado. HTML e 113 assets oficiais idênticos ao build integrado. Sessão real da Direção no Chrome conferiu prioridades, período independente das pendências, listas/somas, formulário sem gravação, histórico, metas faltantes, PCP e catálogo. Consultas válidas das quatro portas sem sessão recusadas com 401. Nenhuma migração, concessão de acesso, mensagem ou alteração de registros reais. Conta restrita real não autenticada; gravações e perfis restritos testados com dados simulados. Relatório em docs/comercial-evolucao.md. Publicação concluída; a vez continua Codex.

## Enquadramento das fotos · 11/10/2026

Agente: codex. Pedido de Léo: melhorar o enquadramento das fotos, usando Compromissos como referência. Clone /tmp/painel-fotos-20261011, ramo codex/enquadramento-fotos-20261011. Ajuste visual das miniaturas RH nos filtros, cards e formulários, sem alterar fotos originais, cadastros, permissões ou servidor. Implementação e revisão local; publicação depende de autorização específica. Demais trabalhos preservados.

Verificação local: reproduzido transbordamento de retrato vertical (23×46 dentro de 23×23; 19×38 dentro de 19×19). Corrigido para 32×32 nos filtros, 24×24 nas linhas e 40×40 nos formulários, com recorte superior, contenção e proporção preservada. Retrato fictício vertical adicionado à prévia. 25 testes pertinentes aprovados; build aprovado; desktop e celular conferidos no navegador. Nenhuma publicação, mudança de foto original ou registro real.

Publicação autorizada por Léo em 11/10/2026: “publicar a correcao das fotos”. Escopo somente visual e retrato fictício da prévia; sem alteração de fotos originais, dados ou servidor.
