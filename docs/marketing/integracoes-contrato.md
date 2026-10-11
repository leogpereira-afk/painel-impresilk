# Integrações do Marketing (etapa i, puxada para agora): contrato

Pedido do Léo (11/10/2026): "integrar todos que derem para integrar e puxar todos os dados possíveis", e ver na página do canal os pixels, os dados do Analytics etc.

A pesquisa de cada fonte está em `scratchpad/integracoes-pesquisa.json`, fora do repositório. Ela foi feita na documentação oficial de outubro de 2026 e passou por contraprova. Para cada fonte, o arquivo traz:
- `levantamento`: endpoints, campos, escopos, passos do dono e exemplo de resposta;
- `contraprova`: correções e alertas.

**Quando o levantamento e a contraprova discordam, vale a contraprova.**

## O que entra e como liga

| fonte | o que puxa | como o Léo liga | provedor aprova? |
|---|---|---|---|
| `site` | etiquetas instaladas (GA4, GTM, Ads, Pixel da Meta, LinkedIn, Pinterest, TikTok, Clarity, Hotjar/Contentsquare, verificações), robots.txt, sitemap, posts e páginas do WordPress (REST), PageSpeed (notas do Lighthouse, celular e computador), CrUX (LCP, INP, CLS e histórico de 25 semanas) | nada para o HTML. Uma chave de API do Google (`GOOGLE_API_KEY`, restrita a PageSpeed Insights API e Chrome UX Report API) para PSI e CrUX | não |
| `google` | GA4 (tudo da pesquisa: resumo, por dia, canal, origem/mídia, campanha, páginas, página de entrada, cidade, aparelho, eventos-chave) + Search Console (cliques, impressões, CTR, posição; consultas, páginas, país, aparelho, por dia; sitemaps) + Perfil da Empresa (métricas diárias, termos de pesquisa mensais, avaliações, seguidores, posts, dados do perfil) | botão "Conectar Google" no Painel (OAuth). Antes, cadastra `GOOGLE_OAUTH_CLIENT_ID` e `GOOGLE_OAUTH_CLIENT_SECRET` | GA4 e Search Console não. O Perfil da Empresa sim: formulário de acesso à API. Até aprovar, a parte do Perfil fica "aguardando aprovação do Google" e o resto funciona |
| `meta` | Página do Facebook (seguidores, insights válidos em 2026, posts com métricas), Instagram (conta, insights, mídias com métricas), anúncios (gasto, alcance, impressões, cliques, resultados por campanha e por dia), Pixel/Dataset (eventos recebidos) | token de Usuário do Sistema do Gerenciador de Negócios, cadastrado como `META_TOKEN` | não |
| `google_ads` | campanhas, grupos, palavras-chave e termos de pesquisa com custo, cliques, impressões, conversões, por dia; ações de conversão; chamadas | conta de serviço: o JSON vai em `GOOGLE_ADS_SA_JSON`; a conta de serviço entra como "Somente leitura" no Google Ads | sim: nível Explorer no Google Cloud (página Google Ads API Overview) |
| `linkedin` | seguidores (total e ganhos), visitas à página, estatísticas de posts | botão "Conectar LinkedIn" (OAuth). Antes, `LINKEDIN_CLIENT_ID` e `LINKEDIN_CLIENT_SECRET` | sim: Community Management API, nível Development. Teto de 100 chamadas por dia |
| `pinterest` | analytics da conta, Pins e analytics por Pin, seguidores | botão "Conectar Pinterest" (OAuth). Antes, `PINTEREST_CLIENT_ID` e `PINTEREST_CLIENT_SECRET` | sim: Trial access (a fila deles está travada desde 08/2026) |

Os secrets ficam no Supabase, em Edge Functions > Secrets, e é o Léo quem cadastra. **Nenhum segredo passa pelo chat, pelo repositório (que é PÚBLICO) nem pela tela.**

Sem o secret, a fonte fica no estado `falta_configurar`, e a tela mostra os passos para ligar.

## Peças

### 1. Banco: migração `supabase/migrations/20261012a_marketing_fontes.sql`
- **Ordem de publicação** (revisão de 12/10). A migração cria os seis jobs do pg_cron, que chamam a `painel-mkt-fontes`; aplicada antes de a function existir, o cron das 09:05 UTC bate numa function que não existe, o pg_cron marca "succeeded" (o pg_net só enfileira) e ninguém fica sabendo. Por isso, nesta ordem:
  1. publicar as Edge Functions (`painel-mkt-fontes`, `painel-mkt-oauth` e `painel-marketing`) e conferir no log do `functions.yml` a linha de cada uma com a versão nova;
  2. conferir que a `painel-mkt-fontes` responde **401** a um `POST` sem `x-token` (a function existe e a porta de máquina está fechada);
  3. só então aplicar a 20261012a, **no mesmo dia** e **antes das 09:05 UTC** (06:05 em Brasília), para o primeiro disparo já achar a function no ar.
- **Cofre** (Vault), com funções `security definer`, `search_path = public, pg_temp`, `revoke` de public, anon e authenticated, e `grant` só para `service_role`:
  - `painel_mkt_conexao_gravar(p_fonte text, p_valor jsonb) returns void`: grava em `vault` o segredo de nome `mkt_conexao_<p_fonte>`, criando ou atualizando. `p_fonte` só pode ser `google`, `linkedin` ou `pinterest`; qualquer outro valor dá `22023`.
  - `painel_mkt_conexao_ler(p_fonte text) returns jsonb`: o JSON decifrado, ou null.
  - `painel_mkt_conexao_info() returns jsonb`: `{google: {conectado_em, conectado_por, conta, escopos, expira_em, refresh_expira_em}, ...}`. Só os campos SEM token; os tokens nunca saem daqui.
  - `painel_mkt_conexao_apagar(p_fonte text) returns void`. Leva junto a conexão pendente da fonte (revisão de 12/10).
  - `painel_mkt_conexao_regravar(p_fonte text, p_esperado jsonb, p_valor jsonb) returns text` (revisão de 11/10): a gravação da COLETORA. Só grava se o cofre ainda tem a conexão que ela leu (mesmos `access_token`, `refresh_token` e `conectado_em` de `p_esperado`); senão não grava e devolve `'mudou'`. Um Desconectar ou Reconectar feito durante a coleta não é desfeito. A confirmação de quem clicou (abaixo) continua gravando de cima, pela `painel_mkt_conexao_gravar`.
  - `painel_mkt_conexao_pedido(p_nonce, p_fonte, p_quem, p_verificador, p_validade_s)` e `painel_mkt_conexao_consumir(p_nonce) returns jsonb` (revisão de 11/10): cada clique em Conectar guarda o seu nonce (e o verificador do PKCE, quando o provedor usa) no `painel_cache`; a volta consome num passo só. O mesmo state não vale duas vezes. O clique novo também derruba a conexão pendente daquela fonte (revisão de 12/10): quem clicou de novo desistiu do clique anterior.
  - **Conexão pendente** (revisão de 12/10). O uso único do state só segura quem volta DEPOIS do Léo; quem tem a URL da tela de permissão e volta ANTES conectava a própria conta com a autoria do Léo, e o PKCE não impede (o desafio vai na mesma URL). Por isso a volta do provedor não grava no cofre:
    - `painel_mkt_conexao_pendente(p_nonce text, p_fonte text, p_quem text, p_valor jsonb, p_validade_s integer) returns void`: guarda a conexão trocada na volta, PENDENTE, no Vault, com o nome `mkt_pendente_<fonte>` (uma por fonte; a volta mais nova manda), no JSON `{nonce, quem, exp, conexao}`. Nunca no `painel_cache`, onde o token ficaria em texto aberto. A `painel-mkt-oauth` manda validade de 600 s.
    - `painel_mkt_conexao_confirmar(p_fonte text, p_nonce text, p_quem text) returns jsonb`: num passo só, sob a trava da fonte, confere o nonce, a validade e se `p_quem` é quem clicou; move a pendente para o cofre (pela `painel_mkt_conexao_gravar`) e a apaga. Devolve `{ok: true}`, `{ok: false, motivo: 'pedido_vencido'}` (não há pendente com esse nonce nessa fonte, já foi confirmada, foi trocada por um clique novo, o Desconectar a levou, ou venceu, e aí sai na hora) ou `{ok: false, motivo: 'outra_pessoa'}` (é de outro login; ela fica, para quem clicou ainda poder confirmar). Uso único.
    - A coleta (`painel_mkt_conexao_ler`) e a tela (`painel_mkt_conexao_info`) nunca enxergam a pendente.
  - O JSON guardado tem esta forma: `{access_token?, refresh_token?, expira_em?, refresh_expira_em?, escopos: [], conta?, conectado_por, conectado_em}`.
- **A origem de cada número** (revisão de 12/10): a fonte (`manual`, `csv`, `api`) é da LINHA, e uma linha mistura número de gente com número da API. A única coisa nova nas tabelas é a coluna `numeros_api text[]` em `painel_mkt_metricas_canal` e `painel_mkt_publicacoes`: quais números daquela linha a API gravou. Quem anota é um gatilho BEFORE (`painel_mkt_origem_numeros`), não cada função:
  - a coleta (motivo `Coleta da API`) que MUDA um número passa a ser a dona dele; número que ela só confirmou igual continua de quem era;
  - qualquer outra gravação (tela, CSV, faxina, volta do backup) que muda um número tira esse número da lista; quem grava a lista de propósito (a faxina) manda nela;
  - nulo é "nenhum número da API" (linha de antes, ou cópia de backup antiga): o lado seguro para o log e para o dado de gente. A cópia do backup leva a coluna (`painel_mkt_exportar` e `painel_mkt_restaurar` já pegam a linha inteira): a linha que volta inteira traz a lista do arquivo; na linha que já existe, o número que a volta troca sai da lista (passa a contar como de gente, o lado seguro).
- **Números que vêm da API:**
  - `painel_mkt_api_metricas(p_linhas jsonb, p_quem text) returns jsonb`. Cada linha é `{canal: '<codigo>', semana: 'AAAA-MM-DD' (segunda-feira), numeros: {seguidores?, alcance?, impressoes?, engajamento?, cliques?, conversas?, leads?}}`.
    - Acha o canal pelo `codigo`. Canal inexistente: a linha vai para `ignoradas` com o motivo.
    - Grava só os números que vieram (a mesma regra da `painel_mkt_salvar_metricas`), com fonte `api` e `coletado_em = now()`.
    - Semana que ainda não fechou não entra.
    - Devolve `{gravadas, ignoradas: [...]}`.
  - `painel_mkt_api_publicacoes(p_linhas jsonb, p_quem text) returns jsonb`. Cada linha é `{canal, url, data, titulo?, alcance?, impressoes?, engajamento?, cliques?, leads?}`.
    - Mesma chave (canal + url) da tabela. A url já chega normalizada pelo `normalizarLink` de `_shared/marketing.mjs`.
    - Linha nova: insere com fonte `api`.
    - Linha que já existe e não está retirada: atualiza data, título e números.
      - O número da API manda sobre o número lançado à mão; a fonte vira `api` e `coletado_em` só muda quando algum número muda.
      - Título vazio da API não apaga o título que já existe.
    - Linha retirada: não volta. Conta em `retiradas`.
    - Devolve `{inseridas, atualizadas, iguais, retiradas}`.
  - **Retenção** (regra do LinkedIn, ver a pesquisa): `painel_mkt_api_faxina(p_canal text, p_dias_numeros int, p_dias_titulo int)`. Só o coletor do LinkedIn chama. Revisão de 12/10: a faxina escolhe pela ORIGEM DE CADA NÚMERO (`numeros_api`), nunca pela fonte da linha (a de 11/10 apagava o seguidores digitado numa semana que a API tomou e não alcançava o número do LinkedIn numa linha que tinha virado `manual`):
    - nas semanas mais velhas que `p_dias_numeros`, somem os números que a API gravou entre os que o LinkedIn mede (seguidores, alcance, impressões, engajamento, cliques); o número de gente fica; a linha só sai quando não sobra número nenhum, e a que sobra sem número da API volta a `manual`;
    - nas publicações mais velhas que `p_dias_numeros`, somem os números do post que a API gravou (alcance, impressões, engajamento, cliques); ficam link, data, leads e todo número digitado;
    - o log de TODAS as semanas e publicações velhas do canal perde, no antes e no depois de cada linha, o número que aquela cópia diz que a API gravou (o `numeros_api` da própria cópia, pela `painel_mkt_sem_numeros_api`); o que a pessoa digitou fica, até na linha em que a API o trocou;
    - o título (`p_dias_titulo`) a coletora passa nulo: a API do LinkedIn nunca manda título, então o que houver foi digitado por gente.
  - **Diário e travas** (revisão de 11/10): `painel_mkt_coleta_anotar(p_entrada jsonb, p_exclusiva boolean)` grava o diário num passo só (com `p_exclusiva`, recusa a segunda execução da mesma fonte) e mantém o gasto de chamadas por hora; `painel_mkt_coleta_pedir(p_fonte, p_quem, p_intervalo_s)` é a trava do "Atualizar agora". Ler, juntar e gravar pelas Edge Functions perdia escrita.
  - **Log da coleta** (revisões de 11/10 e 12/10): fica fora do `painel_mkt_log` só a REGRAVAÇÃO, pela coleta, de número que já era da API (estava no `numeros_api` do antes), numa linha que era e continua `api`, quando só mudam esses números e os carimbos. TODA troca de um número que veio de gente (fonte `manual` ou `csv`) vai para o log, mesmo numa linha que já era `api` (a de 11/10 olhava só a fonte da linha, e os 40 cliques da Ana viravam 55 sem rastro). O log de máquina sai depois de 1 ano (job `painel-mkt-log-coleta`), menos a linha em que a coleta trocou um número que alguém tinha lançado: é a prova de quando o número da pessoa saiu.
- **Agendamento** (pg_cron): um job por fonte, todo dia, escalonados entre 09:05 e 09:35 UTC.
  - Cada um chama `net.http_post` para `https://heveemylixartyijxewh.supabase.co/functions/v1/painel-mkt-fontes`, com `x-token` lido de `vault.decrypted_secrets` (nome `painel_token`, o mesmo padrão de `0002_cron_backup.sql`), corpo `{"action":"coletar","fonte":"<fonte>"}` e `timeout_milliseconds` explícito.
  - Nomes dos jobs: `painel-mkt-fonte-<fonte>`. Use `cron.unschedule` antes de `cron.schedule`, para a migração poder rodar duas vezes.
  - No teste com PGlite não há `cron`, `net` nem `vault`: crie stubs no teste, nunca na migração.
- Testes em PGlite: `tests/marketing-fontes-banco.test.mjs`, rodando a 20261010a, a 20261011a e a 20261012a, cada uma duas vezes, com stubs dos schemas `vault` (função `create_secret`, `update_secret` e a view `decrypted_secrets`), `cron` e `net`. Os casos ruins da revisão de 12/10 estão lá: a pendente sem confirmação nunca chega ao cofre; outra pessoa, nonce vencido e nonce usado duas vezes não confirmam; a troca de número de gente fica no log; a faxina pelo número.

### 2. `_shared/mkt-oauth.mjs`: provedores OAuth, `state` e tokens
- `PROVEDORES`: `google`, `linkedin` e `pinterest`, cada um com URL de autorização, URL de token, escopos, parâmetros extras (Google: `access_type=offline`, `prompt=consent`, `include_granted_scopes=true`) e nomes dos secrets.
  - Escopos do Google: `analytics.readonly`, `webmasters.readonly` e `business.manage`. **Não** pedir `adwords`: ele é restrito e o Google Ads vai por conta de serviço.
- `assinarState({fonte, quem, exp}, segredo)` e `conferirState(state, segredo, agora)`: HMAC-SHA256 com o `PAINEL_JWT_SECRET`, em base64url, válido por 10 minutos. Recusa assinatura errada, prazo vencido ou fonte fora da lista.
- `urlDeAutorizacao(fonte, state, env)`: devolve a URL, ou lança `falta_configurar` quando o client id não existe.
- `trocarCodigo(fonte, code, env, fetch)` e `renovar(fonte, conexao, env, fetch)`: devolvem a conexão nova. O Pinterest devolve um refresh token novo a cada renovação, e é preciso gravá-lo.
  - Do Google, guardar os escopos que voltaram de verdade (consentimento granular: o Léo pode desmarcar alguma caixinha).
- `REDIRECT_URI = 'https://heveemylixartyijxewh.supabase.co/functions/v1/painel-mkt-oauth'`.
- `destinoDoRetorno(fonte, motivo, confirmar)` (revisão de 12/10): na volta boa leva `confirmar=<nonce>` (só nonce no formato e só de fonte da lista; com motivo de erro, nunca). `MOTIVOS` ganhou `pedido_vencido` e `outra_pessoa`, os da confirmação, com o texto para gente. `nonceValido(n)` confere só o formato; o resto é o banco.
- Funções puras e testáveis. `fetch` entra por parâmetro.

### 3. Edge Function `painel-mkt-oauth` (pública: o retorno do provedor chega sem crachá)
- `GET ?code&state`, ou `?error&state`:
  1. confere o `state` e consome o pedido guardado no clique (`painel_mkt_conexao_consumir`); state já usado ou desconhecido é `state_invalido`, e isso vale também na volta com `error`;
  2. troca o code pelo token (com o `code_verifier` do PKCE, quando o provedor usa);
  3. **não grava no cofre** (revisão de 12/10): guarda a conexão como PENDENTE pela `painel_mkt_conexao_pendente`, amarrada ao nonce e ao `quem` do pedido, por 10 minutos, com `conectado_por` igual ao `quem` do state. Esta function não tem crachá para saber quem é o navegador; quem leva a pendente para o cofre é a tela, com o crachá de quem clicou (`conectarConfirmar`, seção 6). Consentimento completado sem a confirmação vence sem nunca chegar à coleta;
  4. responde **302** para `https://leogpereira-afk.github.io/painel-impresilk/configuracoes?secao=marketing&conexao=<fonte>&r=ok&confirmar=<nonce>`, ou `r=erro&motivo=<código curto>` (sem `confirmar`).
- O Supabase não serve HTML, por isso a resposta é sempre um 302. O destino é fixo e nunca vem da URL; o `confirmar` é o nonce do pedido consumido, nunca um valor da URL da volta. Os motivos são códigos fixos (`state_invalido`, `negado`, `troca_falhou`, `sem_refresh`, `gravar_falhou`, `pedido_falhou`; `gravar_falhou` também quando a pendente não foi guardada). Nunca ecoar texto do provedor nem token.
- Qualquer coisa fora disso: 400, com texto curto.
- Em `scripts/conferir-portas.mjs`, declarar em PUBLICAS com o motivo.

### 4. Edge Function `painel-mkt-fontes`: a coletora
- Só aceita `x-token` igual a `PAINEL_TOKEN`, o mesmo padrão da `painel-backup`. Declarar em PUBLICAS com o motivo.
- `POST {action: 'coletar', fonte}`:
  1. carrega o conector `_shared/mkt-fontes/<fonte>.mjs`;
  2. monta o `ctx`;
  3. roda com orçamento de **110 s**;
  4. grava o resultado.
- Também recebe `{action: 'coletar', fonte, quem}` vindo da `painel-marketing`, pelo botão "Atualizar agora".
- **Interface do conector** (todos iguais):
  ```js
  export const FONTE = 'google';
  export const SECRETS = ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET']; // o que precisa para estar "configurado"
  export const SECRETS_OPCIONAIS = [];  // opcional: o que o conector lê se existir, sem o qual a fonte funciona
  export async function coletar(ctx) -> {
    estado: 'ok' | 'parcial' | 'falta_configurar' | 'falta_conectar' | 'reconectar' | 'aguardando_aprovacao' | 'erro',
    conta: string | null,            // nome legível da conta/propriedade/página
    partes: { [parte]: { estado, motivo?, codigo?, coletado_em } },   // ex.: google: ga4, search_console, perfil
    dados: { ... },                  // o retrato rico para a tela (formato documentado no próprio arquivo, seção FORMATO)
    semanas: [ { canal, semana, numeros } ],        // para painel_mkt_api_metricas
    publicacoes: [ { canal, url, data, titulo, ...numeros } ],  // para painel_mkt_api_publicacoes
    conexao?: { ... },               // se o token foi renovado e precisa ser regravado
    avisos: [ string ],              // para gente, sem travessão
  }
  ```
- **Motivo da parte** (revisão 2, regra única para as seis fontes): `partes[parte].motivo` é FRASE para gente, em português, pronta para a tela mostrar como texto: sem travessão, sem nome interno de relatório ou de bloco, sem o texto do provedor em inglês. O código técnico, quando o conector tem um, vai em `partes[parte].codigo` (só letras minúsculas, dígitos e `_`; a coletora descarta o que não for assim), para separar um caso do outro, nunca para mostrar. A lista de códigos de cada fonte está no FORMATO do conector. A coletora guarda `codigo` no retrato (`normalizarResultado` e `juntarRetrato`); a porta da tela repassa `motivo` e, se quiser, `codigo`.
- **Avisos**: o mesmo vale para `avisos`. O detalhe técnico (a mensagem do provedor, o nome interno do relatório) vai só para o diário, pelo `ctx.log`.
- `ctx`:
  - `ctx.env(nome)`;
  - `ctx.conexao`: o JSON do cofre, ou null;
  - `ctx.fetchJson(url, {method, headers, body, rotulo})`:
    - timeout de 20 s por chamada;
    - até 2 novas tentativas em 429 e 5xx, respeitando `Retry-After`: só repete quando a espera pedida cabe inteira (até 15 s e dentro do orçamento); se o provedor pedir mais, não repete;
    - nunca repete no `analyticsdata.googleapis.com` (o GA4 dá só 10 erros 500/503 por hora e manda parar no primeiro 429) nem no `api.linkedin.com` (100 chamadas por dia);
    - em 401 e 403 devolve o erro sem repetir: token morto não insiste, por causa da cota de erros do GA4;
    - nunca põe token em log nem em mensagem de erro.
  - `ctx.prazo()`: quanto falta do orçamento;
  - `ctx.hoje`: AAAA-MM-DD no fuso de São Paulo;
  - `ctx.canais`: os canais ativos, com `codigo` e `url_perfil`;
  - `ctx.log(texto)`: vai para o diário.
- **Gravação**:
  - `painel_cache` com a chave `mkt_fonte_<fonte>`: `{estado, conta, partes, dados, avisos, coletado_em}`. A tela lê daqui, pela `painel-marketing`.
  - Os retratos semanais e as publicações vão pelas RPCs da seção 1.
  - A conexão renovada vai pela `painel_mkt_conexao_regravar`, logo depois de renovar (antes do conector) e de novo no fim só se o conector mudou algo; sempre condicional.
  - Erro de uma parte NÃO apaga os `dados` bons da coleta anterior daquela parte: junta, parte por parte.
- **Diário**: `painel_cache` com a chave `mkt_coleta_diario`, guardando as 20 últimas execuções de cada fonte: `{fonte, inicio, fim, estado, chamadas, erro?}`, mais o gasto por fonte e por hora (`cota`), que é o que segura o teto do dia. Gravado pela `painel_mkt_coleta_anotar`. Um processo que escreve o próprio diário no banco é o único log que alguém abre.
- Os segredos do provedor que ficam no `env` são:
  - `GOOGLE_API_KEY` (site), mandado no cabeçalho `x-goog-api-key`, nunca na URL;
  - `META_TOKEN`;
  - `GOOGLE_ADS_SA_JSON`.
  Nenhum deles pode ir para o cache, o diário ou a resposta.
- **Site**: só busca URLs do próprio domínio do `url_perfil` do canal `site` (https, host público, sem IP, no máximo 2 MB por página e 15 páginas por execução). Isso evita SSRF. O nome é sempre comparado e pedido SEM o ponto final (`www.x.com.br.` e `www.x.com.br%2E` são o mesmo nome para o DNS): a URL que a trava devolve, a do próximo salto (Location) e a que vai para a rede saem sem ele, e nome com rótulo vazio (dois pontos) é recusado.

### 5. Conectores: `supabase/functions/_shared/mkt-fontes/<fonte>.mjs`
- Um arquivo por fonte: `site`, `google`, `meta`, `google_ads`, `linkedin` e `pinterest`.
- **Funções puras** de leitura de resposta (`lerRelatorioGa4`, `lerSearchAnalytics`, etc.), exportadas e testadas com fixtures tiradas dos exemplos da pesquisa ou da documentação: `tests/fixtures/mkt-<fonte>/*.json` e `tests/mkt-<fonte>.test.mjs`.
- No topo de cada arquivo, a seção `FORMATO`, que descreve o `dados` que a tela vai receber. É o contrato com a tela.
- Mapeamento para os números da semana. O ponto de partida é o campo `numeros_da_semana` da pesquisa; o conector decide e escreve no FORMATO:
  - **site**, a partir do GA4 e do Search Console. GA4: usuários em alcance, visualizações em impressões, sessões engajadas em engajamento, eventos-chave em leads. Search Console: cliques em cliques.
  - **facebook** e **instagram**, pela Meta: seguidores, alcance (o que existir em 2026), visualizações, interações e cliques no perfil.
  - **google**, pelo Perfil: seguidores, impressões (soma), cliques (site + ligação + rota), conversas (se existir).
  - **linkedin** e **pinterest**: os equivalentes.
  - O Google Ads não tem canal próprio. Ele vai em `dados` do `google_ads`, e o gasto aparece no canal `site` e na Visão geral.
- Semanas: as 8 últimas semanas FECHADAS (segunda a domingo, fuso de São Paulo), em toda execução. É idempotente.
- Publicações:
  - **site**: posts e páginas do WordPress, com a data de publicação; a url é o link curto do WordPress (`?page_id=<id>` para página, `?p=<id>` para post, no domínio sem www), que não muda quando os links permanentes mudam;
  - **facebook** e **instagram**: posts e mídias dos últimos 90 dias, com números; o Story do Instagram vai só com url, data e a legenda (sem número: a métrica dele só existe nas 24 h em que está no ar, e a coleta diária leria um número parcial). Título é só o texto de verdade, nunca "Story" ou "Reel";
  - **linkedin**: só url e data, sem título (regra de guarda de conteúdo);
  - **pinterest**: os Pins, com link para `https://www.pinterest.com/pin/<id>/`.
- Paginação com teto, e respeito ao `ctx.prazo()`. Se o tempo acabar, o estado é `parcial`.

### 6. `painel-marketing`: ações novas (o crachá e o módulo valem como sempre)
- `fontes`, para todos os papéis: para cada fonte, `{estado, conta, partes, dados, avisos, coletadoEm, configurado: bool, opcionais: [{nome, cadastrado}], conexao: {conectadoEm, conectadoPor, conta, escopos, expiraEm}}`. Sem token, sem segredo. `configurado` olha só se os secrets existem (`!!Deno.env.get(...)`), nunca o valor; `opcionais` (11/10) são os `SECRETS_OPCIONAIS` do conector (site: `GOOGLE_API_KEY`; meta: `META_APP_SECRET`; google_ads: `GOOGLE_ADS_CUSTOMER_ID` e `GOOGLE_ADS_LOGIN_CUSTOMER_ID`), só o nome e se existe.
  - **Leitura leve e por fonte** (11/10): `{leve: true}` manda cada fonte SEM a chave `dados` (nem vazia, nem o `restrito`), com todo o resto; `{fontes: ['site', ...]}` manda só as pedidas, na ordem de `FONTES`, em `ordem` e em `fontes` (desconhecida é ignorada; lista vazia não vai ao banco). O que não é `true` ou não é lista vale como "não mandou": sem os dois, a resposta é a de antes (as seis, com os dados). A faixa da Visão geral e o bloco Conexões pedem a leve; a sub-aba Dados pede os dados só das fontes do canal aberto. O `restrito` continua saindo só para a gestão. Junto vai `motivos` (o `MOTIVOS` de `_shared/mkt-oauth.mjs`): código para texto de gente, inclusive `pedido_vencido` e `outra_pessoa`. Cada parte vai como `{estado, motivo, codigo, coletadoEm, tentadoEm}`: `motivo` é a frase para mostrar; `codigo` (só `[a-z0-9_]`, senão null) é para a tela separar um caso do outro, nunca para mostrar.
- `conectarInicio {fonte}`, só gestão: `{url, nonce}` para a tela redirecionar. O pedido (nonce e, no Google, o verificador do PKCE) fica guardado no servidor pela `painel_mkt_conexao_pedido`, e o clique derruba a conexão pendente de um clique anterior da mesma fonte. O `nonce` (o mesmo que vai dentro do state, na URL) volta para a tela poder guardar, na aba que clicou, qual volta ela pediu, e confirmar só essa.
- `conectarConfirmar {fonte, nonce}`, só gestão (revisão de 12/10): a tela chama ao abrir Configurações com `confirmar=<nonce>` na URL. Num passo só no banco (`painel_mkt_conexao_confirmar`): exige que o crachá de quem chama (`s.sub`) seja o `quem` do pedido, dentro da validade, uso único; move a pendente para o cofre e a apaga. O "quem" vem sempre do crachá, nunca do corpo.
  - certo: **200** `{ok: true, fonte}`, com `fonte` no MESMO formato de uma fonte da ação `fontes`;
  - não é gestão: **403** `{erro}` (sem `motivo`); fonte fora do OAuth: **422** `{erro}`;
  - pendente que não existe, já usada, trocada por um clique novo, levada pelo Desconectar, vencida, ou nonce fora do formato: **404** `{erro, motivo: 'pedido_vencido'}`;
  - pendente de outro login: **403** `{erro, motivo: 'outra_pessoa'}` (a pendente fica, para quem clicou ainda confirmar).
  - Grava pelo Vault, que o `scripts/conferir-papel.mjs` não enxerga: a guarda do papel está escrita no ramo, à mão.
- `desconectar {fonte}`, só gestão:
  - apaga do cofre, e a conexão pendente da fonte junto;
  - no Google, chama também o revoke. Avisar na tela que isso desliga GA4, Search Console e Perfil juntos;
  - no LinkedIn, apaga também o retrato da fonte no `painel_cache` (`mkt_fonte_linkedin`): a faxina cuida das tabelas e do log, mas o retrato não tinha prazo, e depois do Desconectar a coleta diária só pula, mantendo os números dos posts para sempre (revisão de 12/10). Se o cache não deixar apagar, a conexão sai assim mesmo e `aviso` diz para desconectar de novo. Nas outras fontes o último retrato fica, marcado `falta_conectar`.
- `painel` devolve também `semIdentidade: boolean` (revisão de 12/10): `true` quando quem entrou não é a direção e o login não achou a pessoa (nenhuma conta, ou duas), e por isso o papel de `painel_mkt_papeis` não alcança essa pessoa e vale o padrão, `marketing`. Ninguém é trancado; a tela só avisa.
- `pessoas` devolve, SÓ para a gestão, `temContaPainel: boolean` em cada pessoa: existe conta do Painel (linha em `painel_contas`, ou o login de quem está pedindo) que cai naquele `id_pessoa` pela MESMA regra do papel (`idPessoaDoLogin` de `_shared/marketing-papel.mjs`, rodada sobre as tabelas lidas uma vez). Para os outros papéis a chave não vai: quem tem conta em qual sistema é, por si só, um mapa de onde bater.
- `coletarAgora {fonte}`, para gestão e marketing: chama a `painel-mkt-fontes` com `x-token` (o `PAINEL_TOKEN` do env) e espera até 25 s.
  - Se terminar, devolve o estado novo.
  - Se não, devolve `{andando: true}`, e a tela relê depois.
  - Trava de 1 pedido por fonte a cada 2 minutos, conferida e marcada num passo só pela `painel_mkt_coleta_pedir`.

### 7. Tela (depois da compactação que está em andamento, em outra rodada)
- Em Configurações > Marketing, o bloco "Conexões": uma linha por fonte, com:
  - o estado;
  - a conta;
  - a última coleta;
  - os botões Conectar, Reconectar, Desconectar e Atualizar agora;
  - "Como ligar", com os passos do dono tirados da pesquisa, em linguagem simples.
- No canal, a sub-aba "Dados", com os quadros da fonte daquele canal. Todo quadro recolhível, porque o Léo pede isso em telas de análise, e compacto.
- Na Visão geral, uma faixa com o estado das fontes.
- **Uma leitura por página** (11/10): as três leem pela mesma memória (`src/components/marketing/dados/useFontesMarketing.js`, a conta em `src/lib/calc/marketing-fontes-cache.js`). A faixa e o Conexões leem a leve; a sub-aba Dados lê os dados só das fontes do canal. O retrato com os dados é guardado inteiro: a leitura leve que vê coleta nova não mistura a data nova com os números velhos, e a sub-aba pede de novo só aquela fonte. Sair e entrar, crachá diferente ou papel diferente limpam tudo.

## Regras que valem para tudo
- **Só leitura** nos provedores.
- Sem travessão em texto.
- Comentários em português, explicando o porquê.
- Número não informado é nulo, nunca zero.
- Toda afirmação sobre a API apoiada na pesquisa: o que lá estiver como `nao_confirmado` é tratado com tolerância. Campo ausente vira null, e a métrica recusada vai para `avisos` sem derrubar a coleta.
- Nada de segredo no repositório. Os testes usam fixtures fictícias.
- Testes começam pelo caso ruim.

## Revisão final (11/10/2026): campos novos da porta e da coletora

Toda a costura que vale a partir daqui:
- `fontes` manda `conexaoDesconhecida: true` quando o cofre não pôde ser lido. A tela mantém o estado da última coleta e não deduz "falta conectar".
- `fontes` manda `iniciadoEm` (a hora em que a coleta começou, gravada pela coletora como `iniciado_em` no retrato). A tela compara a conexão com esse início, e não com o fim.
- `desconectar` manda `retratoFicou: true` quando não conseguiu apagar o retrato (regra de guarda do LinkedIn). A tela mantém o Desconectar enquanto a fonte tiver números (`ultimaBoaEm`).
- A porta passa a fonte para `aguardando_coleta` quando a coleta anotou `faltavam` (secrets que faltavam) e eles já existem agora. Nesse caso, ela tira os avisos daquela coleta.
- `ultimas[].erro` (texto técnico do diário) só vai para a gestão. A linha mostra uma frase fixa.
- Avisos dos conectores: sempre uma frase para gente. Nome de métrica, código e HTTP ficam só no `ctx.log`.
- Volta do OAuth com o state vencido mas assinado: vem com a fonte. Com o state adulterado, volta sem a fonte. A tela mostra o aviso nos dois casos.
