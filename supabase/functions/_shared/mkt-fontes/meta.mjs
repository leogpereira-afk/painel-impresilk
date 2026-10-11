/* CONECTOR DA META: Página do Facebook, Instagram, anúncios e Pixel.
 *
 * Contrato: docs/marketing/integracoes-contrato.md (seções 4 e 5). A pesquisa
 * e a contraprova da fonte "meta" (documentação oficial de outubro de 2026)
 * ficam fora do repositório; onde as duas discordam, vale a contraprova.
 *
 * COMO LIGA. Um token de Usuário do Sistema do Gerenciador de Negócios da
 * Impresilk, cadastrado pelo Léo como secret META_TOKEN no Supabase. Não há
 * OAuth nem cofre: o token não vence (ou vence em 60 dias, se o portfólio
 * exigir prazo, e aí o Léo gera outro). Opcional: META_APP_SECRET, só se o
 * app estiver com "Exigir segredo do app" ligado; aí cada chamada leva o
 * appsecret_proof (HMAC do token com o segredo, nunca o segredo).
 *
 * SÓ LEITURA. Toda chamada é GET. O token vai no cabeçalho Authorization e
 * nunca na URL: a URL pode parar em log, em mensagem de erro ou no diário; o
 * cabeçalho não. O token da Página, que a Meta devolve no /me/accounts, vive
 * numa variável local e nunca entra em dados, avisos ou log. Link de próxima
 * página só é seguido se for do graph.facebook.com (o token não vai para
 * outro endereço).
 *
 * VERSÃO. Uma constante só (VERSAO_GRAPH). A v26.0 saiu em 29/07/2026; a
 * Marketing API vence em cerca de um ano (a v24 venceu em 06/10/2026), então
 * a constante sobe a cada lançamento. Regras da v26 que valem aqui: nada de
 * GET /?ids= (dá erro) e nada de date_format (dá erro).
 *
 * MÉTRICAS SOMEM SEM AVISO. A Meta tira métricas fora da troca de versão, e
 * uma métrica inválida derruba a chamada inteira. Por isso: lotes pequenos;
 * se o lote cai com erro de métrica (código 100), pede uma por uma para achar
 * a culpada, que vira null e aviso, e não é pedida de novo nesta execução.
 * Nunca zero no lugar de ausente.
 *
 * ----------------------------------------------------------------- FORMATO
 * O `dados` que a tela recebe (painel_cache, chave mkt_fonte_meta). Número
 * que a Meta não informou é null, nunca zero. Só vem a chave da parte que
 * trouxe algo nesta execução; a parte que falhou fica de fora, e a coletora
 * mantém o retrato anterior dela. Numa parte "parcial", a chave de uma etapa
 * que não rodou também fica AUSENTE (não vazia): a coletora junta campo a
 * campo, e um `posts: []` de mentira apagaria os posts da coleta anterior.
 * null quer dizer "a etapa rodou e a Meta não informou".
 *
 * partes = { pagina, instagram, anuncios, pixel }, cada uma { estado, motivo?, codigo?,
 *   coletado_em }. motivo é FRASE para gente, em português (MOTIVOS, logo abaixo do topo),
 *   para a tela mostrar como texto; codigo é o código curto do mesmo caso, para separar
 *   um do outro (nunca para mostrar). Os dois vêm juntos, ou nenhum (parte ok sem
 *   ressalva). Códigos: sem_token, token_invalido, prazo, sem_permissao,
 *   limite_de_chamadas, falha_provedor, falha_interna, pagina_nao_atribuida,
 *   instagram_nao_ligado, sem_tarefa_insights, sem_tarefa_conteudo,
 *   sem_conta_de_anuncios, pixel_nao_atribuido, estatisticas_recusadas, sem_dado.
 *
 * dados = {
 *   versao_api: 'v26.0',
 *   janela: { hoje, ultimo_domingo, publicacoes_desde,     // AAAA-MM-DD
 *             semanas: [{ semana, fim }] },                // 8 semanas fechadas, da mais velha à mais nova
 *
 *   pagina: {                                // Página do Facebook
 *     id, nome, usuario, link, categoria,
 *     tarefas: [texto] | null,               // tarefas do usuário do sistema na Página (ANALYZE, CREATE_CONTENT...)
 *     escolhida_por: 'link' | 'unica' | 'primeira',   // como a Página foi achada (link do canal facebook)
 *     seguidores, curtidas, falando_sobre, avaliacoes, nota, check_ins,   // retrato de agora
 *     alcance_28_dias, alcance_28_dias_ate,  // espectadores únicos em 28 dias (page_total_media_view_unique)
 *     por_dia: [{ dia, visualizacoes, engajamento, cliques_acao, visitas_perfil,
 *                 novos_seguidores, deixaram_de_seguir, seguidores_liquidos,
 *                 video_visualizacoes, video_tempo_ms, reacoes: { like, love, ... } | null }],
 *     por_semana: [{ semana, fim, dias_com_dado, alcance, visualizacoes, engajamento,
 *                    cliques_acao, visitas_perfil, novos_seguidores, deixaram_de_seguir,
 *                    video_visualizacoes }],   // soma só com os 7 dias presentes; senão null
 *     seguidores_por_pais: { BR: n } | null, seguidores_por_cidade: { 'Cidade': n } | null,
 *     posts: [{ id, data, criado_em, link, titulo, tipo, imagem,
 *               reacoes, comentarios, compartilhamentos, engajamento,
 *               visualizacoes, alcance, cliques,
 *               cliques_por_tipo, reacoes_por_tipo, atividade_por_tipo,   // objetos { tipo: n } | null
 *               video: { visualizacoes, tempo_medio_ms, tempo_total_ms,
 *                        completas_organicas, completas_pagas } | null }],
 *     reels: [{ id, data, criado_em, link, titulo, duracao_s, reproducoes, reproducoes_total,
 *               repeticoes, tempo_medio_ms, tempo_total_ms, seguidores_ganhos, acoes_sociais }]
 *            | null,                       // null: a Meta não deixou listar (pede permissão de escrita)
 *     fuso: texto,                           // os dias da Página seguem o fuso do Pacífico
 *   },
 *
 *   instagram: {
 *     id, usuario, nome, seguidores, seguindo, publicacoes_total, site, bio, foto,
 *     observacao: texto,                     // os números da conta incluem anúncio: não chamar de orgânico
 *     por_semana: [{ semana, fim, madura,    // madura: 3 dias depois do domingo (a Meta atrasa até 48 h)
 *                    alcance, visualizacoes, contas_engajadas, interacoes, curtidas, comentarios,
 *                    compartilhamentos, salvamentos, respostas, repostagens, toques_links,
 *                    seguir_deixar: { FOLLOWER: n, NON_FOLLOWER: n, UNKNOWN: n } | null }],
 *                    // seguir_deixar: valores crus da Meta; qual é "seguiu" e qual é
 *                    // "deixou de seguir" a documentação não confirma
 *     alcance_por_dia: [{ dia, alcance }],   // últimos 28 dias
 *     quebras: { semana, alcance_por_tipo, visualizacoes_por_tipo, alcance_por_seguidor,
 *                visualizacoes_por_seguidor, toques_por_botao } ,   // objetos { chave: n } | null
 *     demografia: { periodo: 'this_month',
 *                   seguidores: { idade, cidade, pais, genero },  // { chave: n } | null (top 45)
 *                   engajados:  { idade, cidade, pais, genero } },
 *     midias: [{ id, tipo, produto, data, criado_em, link, titulo, miniatura, ia,
 *                curtidas, comentarios, salvamentos, compartilhamentos, repostagens,
 *                visualizacoes, alcance, interacoes, seguiram, visitas_perfil, atividade_perfil,
 *                total_visualizacoes, total_curtidas, total_comentarios,
 *                tempo_medio_reels_ms, tempo_total_reels_ms, taxa_pulo_reels,
 *                visualizacoes_facebook, visualizacoes_cruzadas }],
 *     stories: [{ id, tipo, produto: 'STORY', data, criado_em, link, titulo,
 *                 visualizacoes, alcance, respostas, compartilhamentos, seguiram,
 *                 visitas_perfil, atividade_perfil, interacoes, repostagens, cliques_link,
 *                 navegacao: { chave: n } | null,
 *                 lido_em: ISO | null,   // a hora em que os números foram lidos (null: não vieram)
 *                 parcial: true }],      // o número é o daquele instante, não o final do Story
 *         Os Stories e os números deles só existem nas 24 h em que estão no ar, e a coleta
 *         roda uma vez por dia: a tela mostra "lido às HH:MM", nunca como o total do Story.
 *         titulo é a legenda; Story sem legenda fica com titulo null.
 *     (midias[].titulo também é só a legenda, ou null.)
 *   },
 *
 *   anuncios: {
 *     periodo: { inicio, fim },              // da segunda de 8 semanas atrás até hoje (fuso da conta de anúncios)
 *     contas: [{ id, numero, nome, moeda, fuso, situacao, situacao_codigo,
 *       por_dia:        [LINHA & { dia }],
 *       por_semana:     [LINHA & { semana, fim, fechada }],
 *       por_plataforma: [LINHA & { semana, fim, plataforma }],   // facebook, instagram, messenger, audience_network...
 *       campanhas:      [LINHA & { id, nome, objetivo, situacao, situacao_efetiva,
 *                                  orcamento_diario_centavos, orcamento_total_centavos, inicio, fim }],
 *                       // campanha sem entrega no período: os números da LINHA ficam null
 *       campanhas_por_dia: [LINHA & { campanha_id, dia }] }],
 *   },
 *   // LINHA = { gasto, impressoes, alcance, frequencia, cliques, cliques_link, cliques_saida,
 *   //           ctr (em %), cpc, cpm, leads, conversas, primeiras_respostas,
 *   //           acoes: { action_type: n }, valores_acoes, custo_por_acao,
 *   //           resultados: [{ indicador, valor }] | null, custo_por_resultado }
 *   // gasto, cpc e cpm na moeda da conta. leads: action_type "lead" (formulário + site);
 *   // sem ela, onsite_conversion.lead_grouped + offsite_conversion.fb_pixel_lead.
 *   // Linha com entrega e sem a ação: 0 (a Meta só lista a ação que aconteceu).
 *
 *   pixel: {
 *     periodo: { inicio, fim },              // 6 dias inteiros antes de hoje (a Meta guarda pouco)
 *     pixels: [{ id, nome, ultimo_disparo, indisponivel, criado_em, cookie_primario,
 *                correspondencia_automatica, campos_correspondencia, uso_dados,
 *                eventos_por_dia: [{ dia, eventos: { PageView: n } }] | null,
 *                eventos_total: { PageView: n } | null,
 *                por_origem: { chave: n } | null,
 *                urls: [{ url, disparos }] | null,     // só origem + caminho: o resto da URL pode ter dado pessoal
 *                qualidade: [{ evento, nota, cobertura_eventos, acr, frequencia_envio,
 *                              chaves: [{ chave, cobertura }] }] | null }],
 *   },
 * }
 *
 * NÚMEROS DA SEMANA (painel_mkt_api_metricas), só nas semanas fechadas:
 *   facebook:  alcance     = page_total_media_view_unique (period=week, a janela que fecha no domingo)
 *              impressoes  = soma diária de page_media_view (visualizações; "impressões" saiu em 2025)
 *              engajamento = soma diária de page_post_engagements
 *              cliques     = soma diária de page_total_actions (cliques em contato e botões da Página)
 *   instagram: alcance     = reach (total_value na janela da semana)
 *              impressoes  = views
 *              engajamento = total_interactions
 *              cliques     = profile_links_taps (toques nos botões e links do perfil)
 *              só semana madura (3 dias depois do domingo), porque a Meta atrasa até 48 h
 *   seguidores (os dois): o retrato de agora, gravado só quando a coleta roda na
 *              segunda-feira logo depois da semana; a API não dá o número de um
 *              domingo passado, e um retrato de quarta não é o do domingo.
 *   conversas e leads: não vão para o canal. Os da Meta saem dos anúncios
 *              (dados.anuncios); mandar aqui passaria por cima do que a equipe
 *              lança à mão (o número da API manda), e o canal não é o anúncio.
 *   Os números do Instagram incluem anúncio e conteúdo impulsionado: não são
 *   orgânicos, e a tela não deve chamá-los assim.
 *
 * PUBLICAÇÕES (painel_mkt_api_publicacoes), últimos 90 dias:
 *   facebook:  posts (published_posts) e Reels, se a Meta deixar listar.
 *              alcance = post_total_media_view_unique, impressoes = post_media_view,
 *              engajamento = reações + comentários + compartilhamentos, cliques = post_clicks.
 *   instagram: mídias do feed e Reels, com números: alcance = reach, impressoes = views,
 *              engajamento = total_interactions, cliques = profile_activity (o que existir
 *              no tipo). Stories vivos entram SÓ com url, data e a legenda como título, sem
 *              número nenhum: a coleta diária lê o Story num momento qualquer das 24 h em
 *              que ele existe, e esse número ficaria no banco como o final (ninguém regrava
 *              depois que ele some). O número lido fica em dados.instagram.stories.
 *   Título é só a legenda (ou a descrição do Reel do Facebook); sem ela, título null,
 *   nunca "Story" ou "Reel": o banco só preserva o título digitado à mão quando o da API
 *   vem vazio. Só vai a chave do número que veio: número ausente não apaga o lançado à mão.
 */
import { somarDias, segundaDaSemana, hojeSP, normalizarLink } from '../marketing.mjs';

export const FONTE = 'meta';
export const SECRETS = ['META_TOKEN'];
// Lido no coletar() quando existe: só faz falta se o app da Meta estiver com
// "Exigir segredo do app" ligado (aí cada chamada leva o appsecret_proof).
// Só a lista de nomes: a coletora grava os nomes no cache, a porta diz à tela
// se está cadastrado e o "Como ligar" explica quando vale a pena.
export const SECRETS_OPCIONAIS = ['META_APP_SECRET'];
export const VERSAO_GRAPH = 'v26.0';
export const BASE_GRAPH = `https://graph.facebook.com/${VERSAO_GRAPH}`;
// O Pixel que a pesquisa achou instalado no site da Impresilk. Os outros
// aparecem pelas contas de anúncio (/act_X/adspixels).
export const PIXEL_PADRAO = '809468386955046';
export const CANAL_FACEBOOK = 'facebook';
export const CANAL_INSTAGRAM = 'instagram';
export const SEMANAS = 8;
export const DIAS_PUBLICACOES = 90;
// Cada chamada tem até 20 s na coletora (mais as novas tentativas): abaixo
// desta folga não se começa chamada nova, e a coleta sai como "parcial".
export const MARGEM_MS = 22_000;
// Tetos de paginação e de volume: a Edge Function tem 110 s e a Meta conta
// chamadas por hora. Recoletar tudo todo dia é o que torna a coleta
// idempotente; o teto impede que uma conta grande vire uma fila sem fim.
export const LIMITES = Object.freeze({
  paginasLista: 3, posts: 100, midias: 100, stories: 30, reels: 30,
  contasAnuncio: 5, pixels: 3, paginasAnuncios: 10, paginasPixel: 10, urlsPixel: 20,
  linhasCampanhaDia: 2000, simultaneas: 4,
});
const PARTES = ['pagina', 'instagram', 'anuncios', 'pixel'];
const ROTULO = { pagina: 'Página', instagram: 'Instagram', anuncios: 'Anúncios', pixel: 'Pixel' };
// O motivo de cada parte vai para a tela como TEXTO (revisão 2): a frase é
// para gente; o código curto vai ao lado, em "codigo". A chave é o código.
export const MOTIVOS = Object.freeze({
  sem_token: 'Falta cadastrar o secret META_TOKEN no Supabase (o token do usuário do sistema da Meta).',
  token_invalido: 'A Meta recusou o token (vencido, revogado ou trocado). Gere um token novo do usuário do sistema e atualize o META_TOKEN.',
  prazo: 'O tempo da coleta acabou antes; o que faltou vem na próxima.',
  sem_permissao: 'A Meta não deu permissão para ler este dado. Confira no Gerenciador de Negócios se o ativo está atribuído ao usuário do sistema, com Conteúdo e Insights.',
  limite_de_chamadas: 'A Meta pediu calma (limite de chamadas); a próxima coleta tenta de novo.',
  falha_provedor: 'A Meta não entregou este dado desta vez; a próxima coleta tenta de novo.',
  falha_interna: 'Um erro inesperado na leitura parou este dado; a próxima coleta tenta de novo.',
  pagina_nao_atribuida: 'Nenhuma Página do Facebook apareceu para o usuário do sistema. No Gerenciador de Negócios, atribua a Página a ele com Conteúdo e Insights.',
  instagram_nao_ligado: 'Nenhuma conta profissional do Instagram ligada à Página apareceu para o usuário do sistema.',
  sem_tarefa_insights: 'O usuário do sistema não tem a tarefa Insights na Página; os números dela ficaram fora.',
  sem_tarefa_conteudo: 'O usuário do sistema não tem a tarefa Conteúdo na Página; os posts ficaram fora.',
  sem_conta_de_anuncios: 'Nenhuma conta de anúncios apareceu para o usuário do sistema.',
  pixel_nao_atribuido: 'A Meta não mostrou o Pixel ao usuário do sistema. Atribua o conjunto de dados a ele no Gerenciador de Negócios.',
  estatisticas_recusadas: 'A Meta não entregou as estatísticas de eventos do Pixel desta vez.',
  sem_dado: 'Nenhum dado desta parte veio nesta coleta.',
});
/** A parte no formato do contrato: { estado, motivo (frase), codigo, coletado_em }. */
const parteMeta = (estado, codigo, coletadoEm) => (codigo
  ? { estado, motivo: MOTIVOS[codigo] ?? MOTIVOS.falha_provedor, codigo, coletado_em: coletadoEm }
  : { estado, coletado_em: coletadoEm });

const CAMPOS = {
  contas: 'id,name,username,link,category,tasks,access_token,instagram_business_account{id,username}',
  contasBasico: 'id,name,access_token,tasks,instagram_business_account',
  pagina: 'id,name,link,username,category,followers_count,fan_count,talking_about_count,rating_count,overall_star_rating,were_here_count',
  paginaBasico: 'id,name,link,followers_count',
  posts: 'id,created_time,message,permalink_url,full_picture,status_type,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)',
  postsBasico: 'id,created_time,message,permalink_url,status_type',
  reels: 'id,description,created_time,updated_time,permalink_url,length',
  ig: 'id,username,name,followers_count,follows_count,media_count,profile_picture_url,website,biography',
  igBasico: 'id,username,followers_count,media_count',
  midias: 'id,caption,media_type,media_product_type,permalink,timestamp,thumbnail_url,media_url,like_count,comments_count,reposts_count,saved_count,shares_count,total_like_count,total_comments_count,total_views_count,is_ai_generated',
  midiasBasico: 'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count',
  stories: 'id,caption,media_type,media_product_type,permalink,timestamp',
  contasAnuncio: 'id,account_id,name,currency,timezone_name,account_status',
  campanhas: 'id,name,objective,status,effective_status,daily_budget,lifetime_budget,start_time,stop_time',
  ads: 'date_start,date_stop,spend,impressions,reach,frequency,clicks,inline_link_clicks,outbound_clicks,ctr,cpc,cpm,actions,action_values,cost_per_action_type,results,cost_per_result',
  adsBasico: 'date_start,date_stop,spend,impressions,reach,clicks,inline_link_clicks,ctr,cpc,cpm,actions',
  adsCampanha: 'campaign_id,campaign_name,objective',
  pixel: 'id,name,last_fired_time,is_unavailable,creation_time,first_party_cookie_status,enable_automatic_matching,automatic_matching_fields,data_use_setting',
  pixelBasico: 'id,name,last_fired_time',
  qualidade: 'web{event_name,event_match_quality{composite_score,match_key_feedback},event_coverage,acr,data_freshness}',
};

// Insights da Página válidos em outubro de 2026 (a lista de descontinuadas
// manda sobre a referência, que ainda mostra page_impressions e page_fans).
// Lotes pequenos: uma métrica que sumir custa poucas chamadas para achar.
const PAGINA_DIA = [
  ['page_media_view', 'page_post_engagements', 'page_total_actions', 'page_views_total'],
  ['page_daily_follows_unique', 'page_daily_unfollows_unique', 'page_follows'],
  ['page_video_views', 'page_video_view_time', 'page_actions_post_reactions_total'],
];
// Não confirmadas na referência (só aparecem como alternativa na lista de
// descontinuadas): cada uma na sua chamada, null se a Meta recusar.
const PAGINA_LUGARES = ['page_follows_country', 'page_follows_city'];
const POST_METRICAS = ['post_media_view', 'post_total_media_view_unique', 'post_clicks', 'post_clicks_by_type', 'post_reactions_by_type_total', 'post_activity_by_action_type'];
const POST_VIDEO = ['post_video_views', 'post_video_avg_time_watched', 'post_video_view_time', 'post_video_complete_views_organic', 'post_video_complete_views_paid'];
const REEL_FB = ['blue_reels_play_count', 'fb_reels_total_plays', 'fb_reels_replay_count', 'post_video_avg_time_watched', 'post_video_view_time', 'post_video_followers', 'post_video_social_actions'];
const IG_SEMANA = ['reach', 'views', 'accounts_engaged', 'total_interactions', 'likes', 'comments', 'shares', 'saves', 'replies', 'reposts', 'profile_links_taps'];
// Métricas por tipo de mídia. Pedir uma que não combina com o tipo derruba a
// chamada, por isso a lista é do tipo, e a recusa também fica por tipo.
const IG_MIDIA = {
  FEED: ['views', 'reach', 'likes', 'comments', 'saved', 'shares', 'total_interactions', 'follows', 'profile_visits', 'profile_activity', 'reposts', 'total_views', 'total_likes', 'total_comments'],
  REELS: ['views', 'reach', 'likes', 'comments', 'saved', 'shares', 'total_interactions', 'reposts', 'ig_reels_avg_watch_time', 'ig_reels_video_view_total_time', 'reels_skip_rate', 'total_views', 'total_likes', 'total_comments'],
  STORY: ['views', 'reach', 'replies', 'shares', 'follows', 'profile_visits', 'profile_activity', 'total_interactions', 'reposts', 'link_clicks'],
};
// Estas dão erro se a mídia não foi compartilhada no Facebook: chamada à
// parte, e o erro vira null só daquela mídia (não é métrica sumida).
const IG_CRUZADAS = { FEED: ['facebook_views'], REELS: ['facebook_views', 'crossposted_views'], STORY: ['facebook_views'] };

const NOMES_PAGINA_DIA = {
  page_media_view: 'visualizacoes', page_post_engagements: 'engajamento', page_total_actions: 'cliques_acao',
  page_views_total: 'visitas_perfil', page_daily_follows_unique: 'novos_seguidores', page_daily_unfollows_unique: 'deixaram_de_seguir',
  page_follows: 'seguidores_liquidos', page_video_views: 'video_visualizacoes', page_video_view_time: 'video_tempo_ms',
  page_actions_post_reactions_total: 'reacoes',
};
const SOMA_SEMANA_PAGINA = {
  page_media_view: 'visualizacoes', page_post_engagements: 'engajamento', page_total_actions: 'cliques_acao',
  page_views_total: 'visitas_perfil', page_daily_follows_unique: 'novos_seguidores', page_daily_unfollows_unique: 'deixaram_de_seguir',
  page_video_views: 'video_visualizacoes',
};
const NOMES_POST = {
  post_media_view: 'visualizacoes', post_total_media_view_unique: 'alcance', post_clicks: 'cliques',
  post_clicks_by_type: 'cliques_por_tipo', post_reactions_by_type_total: 'reacoes_por_tipo', post_activity_by_action_type: 'atividade_por_tipo',
};
const NOMES_VIDEO = {
  post_video_views: 'visualizacoes', post_video_avg_time_watched: 'tempo_medio_ms', post_video_view_time: 'tempo_total_ms',
  post_video_complete_views_organic: 'completas_organicas', post_video_complete_views_paid: 'completas_pagas',
};
const NOMES_REEL = {
  blue_reels_play_count: 'reproducoes', fb_reels_total_plays: 'reproducoes_total', fb_reels_replay_count: 'repeticoes',
  post_video_avg_time_watched: 'tempo_medio_ms', post_video_view_time: 'tempo_total_ms', post_video_followers: 'seguidores_ganhos',
  post_video_social_actions: 'acoes_sociais',
};
const NOMES_IG_SEMANA = {
  reach: 'alcance', views: 'visualizacoes', accounts_engaged: 'contas_engajadas', total_interactions: 'interacoes',
  likes: 'curtidas', comments: 'comentarios', shares: 'compartilhamentos', saves: 'salvamentos', replies: 'respostas',
  reposts: 'repostagens', profile_links_taps: 'toques_links',
};
const NOMES_IG_MIDIA = {
  views: 'visualizacoes', reach: 'alcance', likes: 'curtidas', comments: 'comentarios', saved: 'salvamentos',
  shares: 'compartilhamentos', total_interactions: 'interacoes', follows: 'seguiram', profile_visits: 'visitas_perfil',
  profile_activity: 'atividade_perfil', reposts: 'repostagens', total_views: 'total_visualizacoes', total_likes: 'total_curtidas',
  total_comments: 'total_comentarios', ig_reels_avg_watch_time: 'tempo_medio_reels_ms', ig_reels_video_view_total_time: 'tempo_total_reels_ms',
  reels_skip_rate: 'taxa_pulo_reels', facebook_views: 'visualizacoes_facebook', crossposted_views: 'visualizacoes_cruzadas',
  replies: 'respostas', link_clicks: 'cliques_link',
};
const DEMOGRAFIA = { age: 'idade', city: 'cidade', country: 'pais', gender: 'genero' };
const SITUACAO_CONTA = {
  1: 'ativa', 2: 'desativada', 3: 'pagamento pendente', 7: 'em análise de risco', 8: 'acerto pendente',
  9: 'em período de carência', 100: 'fechamento pendente', 101: 'fechada', 201: 'ativa', 202: 'fechada',
};

// ------------------------------------------------------------ utilidades --
const lista = (x) => (Array.isArray(x) ? x : []);
const objeto = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const texto = (x) => (typeof x === 'string' && x.trim() ? x.trim() : null);
const booleano = (x) => (typeof x === 'boolean' ? x : null);
// O jsonb do banco recusa o pedido inteiro por causa de um caractere de
// controle (o nulo sobretudo), então ele sai antes.
const CONTROLE = /[\u0000-\u001F\u007F]/g;

/** Número da Meta: ela manda número ou texto ("12.34" no gasto, "1500" nas
 *  impressões). Qualquer outra coisa é ausência (null), nunca zero. */
export function numeroMeta(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(v)) return Number(v);
  return null;
}
/** Inteiro que o banco aceita nos números (0 a 1 bilhão), ou null. */
export function inteiro(v) {
  const n = numeroMeta(v);
  return n == null || n < 0 ? null : Math.min(1e9, Math.round(n));
}

/** Id que entra num caminho da URL. Vem da própria Meta, mas um id torto
 *  não pode virar "../" no caminho. */
export const idMeta = (v) => {
  const t = typeof v === 'number' ? String(v) : v;
  return typeof t === 'string' && /^[A-Za-z0-9_]{1,80}$/.test(t) ? t : null;
};

/** Texto de uma linha, cortado por caractere de verdade (Array.from): cortar
 *  no meio de um emoji deixa meio par de surrogates, e o jsonb recusa. */
export function textoCurto(v, max) {
  if (typeof v !== 'string') return null;
  const t = v.replace(CONTROLE, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const letras = Array.from(t);
  return letras.length > max ? `${letras.slice(0, max - 1).join('').trimEnd()}…` : t;
}
/** "1 mídia ficou", "2 mídias ficaram": a frase concorda com o número. */
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
/** Frase do Painel não leva travessão (regra da casa); o nome que vem da Meta
 *  com meia-risca ou travessão entra com um hífen no lugar. */
export const semTravessao = (t) => String(t).replace(/\s*[\u2013\u2014]\s*/g, ' - ');

/** Título da publicação: a primeira linha com texto, até 200 letras (o
 *  limite da coluna). Sem texto, null: título vazio não apaga o que existe. */
export function tituloDe(v) {
  if (typeof v !== 'string') return null;
  for (const linha of v.split(/\r?\n/)) {
    const t = textoCurto(linha, 200);
    if (t) return t;
  }
  return null;
}

// A Meta escreve o fuso como "+0000"; o Date do JavaScript quer "+00:00".
function instante(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v > 1e12 ? v : v * 1000;
  if (typeof v !== 'string') return null;
  if (/^\d{9,11}$/.test(v)) return Number(v) * 1000;
  const t = Date.parse(v.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return Number.isFinite(t) ? t : null;
}
/** O dia que um valor de insights cobre. O end_time marca o FIM do dia no
 *  fuso do Pacífico (07:00 ou 08:00 UTC, conforme o horário de verão de lá);
 *  12 horas antes cai dentro do dia coberto em qualquer fuso de -12 a +12. */
export function diaDoFimMeta(endTime) {
  const t = instante(endTime);
  return t == null ? null : new Date(t - 12 * 3600e3).toISOString().slice(0, 10);
}
/** Data de São Paulo de um instante (a data da publicação, a casa é daqui). */
export function dataSP(v) {
  const t = instante(v);
  return t == null ? null : hojeSP(new Date(t));
}
/** Meia-noite de São Paulo em Unix. Sem horário de verão desde 2019: -03:00. */
export const unixInicioSP = (iso) => Math.floor(Date.parse(`${iso}T00:00:00-03:00`) / 1000);

/** As semanas fechadas (segunda a domingo) antes da semana de `hoje`, da
 *  mais velha à mais nova. Toda execução regrava as 8: é idempotente. */
export function janelaSemanas(hoje, n = SEMANAS) {
  const atual = segundaDaSemana(hoje);
  const fora = [];
  for (let i = n; i >= 1; i--) {
    const semana = somarDias(atual, -7 * i);
    fora.push({ semana, fim: somarDias(semana, 6) });
  }
  return fora;
}

/** O "apelido" de um link de perfil: o último pedaço do caminho, ou o ?id=
 *  do profile.php. Serve para achar a Página e o Instagram do canal. */
export function apelidoDoLink(url) {
  if (typeof url !== 'string' || !url) return null;
  try {
    const u = new URL(url);
    const id = u.searchParams.get('id');
    if (id) return id.toLowerCase();
    const partes = u.pathname.split('/').filter(Boolean);
    return partes.length ? decodeURIComponent(partes[partes.length - 1]).toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Link de vídeo e Reel vem relativo ("/reel/123"): vira absoluto. */
function linkAbsoluto(v) {
  if (typeof v !== 'string' || !v) return null;
  if (/^https:\/\//i.test(v)) return v;
  if (v.startsWith('/')) return `https://www.facebook.com${v}`;
  return null;
}

// ----------------------------------------------------------------- erros --
class ErroMeta extends Error {
  constructor(info) {
    super(`Meta recusou: ${info.tipo}${info.codigo ? ` ${info.codigo}` : ''}`);
    this.info = info;
  }
}
class SemTempo extends Error {
  constructor() { super('sem tempo'); }
}
// Falta do lado do dono (ativo não atribuído, conta inexistente): não é erro
// da Meta, é passo de ligação que falta.
class Falta extends Error {
  constructor(estado, motivo, aviso) { super(motivo); this.estado = estado; this.motivo = motivo; this.aviso = aviso; }
}

/** Lê o erro que a coletora devolveu (ctx.fetchJson lança com `status` e o
 *  corpo em `corpo`; aceita também body/json/dados/resposta) ou o corpo de
 *  erro da Graph ({error: {code, error_subcode}}). Só números e um tipo: o
 *  texto da Meta nunca é repetido para a tela.
 *    token     401, 190 (token vencido, revogado, senha trocada), 102
 *    permissao 10, 200 a 299, 3, 100/33 (objeto que o token não enxerga), 403
 *    limite    4, 17, 32, 613, 80000 a 80014, 429
 *    invalido  100 (métrica, campo ou parâmetro que a Meta não aceita)
 *    tempo     a chamada estourou o tempo (ErroFonte da coletora com codigo 'tempo')
 *    falha     o resto */
export function classificarErro(e) {
  const status = Number(e?.status ?? e?.statusCode) || null;
  let corpo = e?.corpo ?? e?.body ?? e?.json ?? e?.dados ?? e?.resposta ?? null;
  if (typeof corpo === 'string') {
    try { corpo = JSON.parse(corpo); } catch { corpo = null; }
  }
  const g = objeto(corpo?.error) ? corpo.error : objeto(e?.error) ? e.error : null;
  const codigo = Number(g?.code) || null;
  const subcodigo = Number(g?.error_subcode) || null;
  let tipo;
  if (status === 401 || codigo === 190 || codigo === 102) tipo = 'token';
  else if (codigo === 10 || codigo === 3 || (codigo >= 200 && codigo <= 299) || (codigo === 100 && subcodigo === 33) || (status === 403 && !codigo)) tipo = 'permissao';
  else if ([4, 17, 32, 613].includes(codigo) || (codigo >= 80000 && codigo <= 80014) || status === 429) tipo = 'limite';
  else if (codigo === 100) tipo = 'invalido';
  else if (e?.codigo === 'tempo' || e?.name === 'AbortError' || e?.name === 'TimeoutError') tipo = 'tempo';
  else tipo = 'falha';
  return { tipo, status, codigo, subcodigo };
}
const descreverCodigo = (info) => (info.codigo ? `código ${info.codigo}` : info.status ? `HTTP ${info.status}` : 'sem resposta');
const fatal = (e) => e instanceof SemTempo || (e instanceof ErroMeta && (e.info.tipo === 'token' || e.info.tipo === 'limite'));

// ------------------------------------------------------------------- URL --
export function montarUrl(caminho, params = {}) {
  if (typeof caminho !== 'string' || !/^(\/[A-Za-z0-9_]+)+$/.test(caminho)) throw new Error('caminho inválido');
  const u = new URL(BASE_GRAPH + caminho);
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') u.searchParams.set(k, String(v));
  return u.toString();
}

/** A próxima página que a Meta indicou, só se for do graph.facebook.com (o
 *  token vai junto no cabeçalho e não pode sair para outro endereço). Sai
 *  qualquer token que tenha vindo na URL; a versão vira a nossa. */
export function proximaPagina(resp) {
  const n = resp?.paging?.next;
  if (typeof n !== 'string') return null;
  let u;
  try { u = new URL(n); } catch { return null; }
  if (u.protocol !== 'https:' || u.hostname !== 'graph.facebook.com' || u.port) return null;
  u.searchParams.delete('access_token');
  u.searchParams.delete('appsecret_proof');
  u.searchParams.delete('date_format');
  u.pathname = /^\/v\d+\.\d+\//.test(u.pathname) ? u.pathname.replace(/^\/v\d+\.\d+\//, `/${VERSAO_GRAPH}/`) : `/${VERSAO_GRAPH}${u.pathname}`;
  return u.toString();
}

/** appsecret_proof: HMAC-SHA256 do token com o segredo do app, em hex. */
export async function provaDoSegredo(token, segredo) {
  const cod = new TextEncoder();
  const chave = await globalThis.crypto.subtle.importKey('raw', cod.encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const assinatura = await globalThis.crypto.subtle.sign('HMAC', chave, cod.encode(token));
  return [...new Uint8Array(assinatura)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// --------------------------------------------------- leitura das respostas --

/** /me/accounts: as Páginas que o usuário do sistema alcança. O token de cada
 *  Página sai SEPARADO do retrato, para nunca escorregar para `dados`. */
export function lerContasPaginas(itens) {
  const fora = [];
  for (const p of lista(itens)) {
    const id = idMeta(p?.id);
    if (!id) continue;
    const iga = objeto(p.instagram_business_account) ? p.instagram_business_account : null;
    const igId = idMeta(iga?.id);
    fora.push({
      pagina: {
        id, nome: textoCurto(p.name, 120), usuario: textoCurto(p.username, 120), link: texto(p.link), categoria: textoCurto(p.category, 80),
        tarefas: Array.isArray(p.tasks) ? p.tasks.filter((t) => typeof t === 'string') : null,
        instagram: igId ? { id: igId, usuario: textoCurto(iga.username, 120) } : null,
      },
      token: texto(p.access_token),
    });
  }
  return fora;
}

/** A Página do canal "facebook" (pelo link do perfil); sem casar, a única ou
 *  a primeira (e a tela diz qual foi). */
export function escolherPagina(contas, urlFacebook) {
  if (!contas.length) return null;
  const ap = apelidoDoLink(urlFacebook);
  if (ap) {
    const achou = contas.find((c) => [c.pagina.id, c.pagina.usuario, apelidoDoLink(c.pagina.link)].some((x) => x && String(x).toLowerCase() === ap));
    if (achou) return { ...achou, pelo: 'link' };
  }
  return { ...contas[0], pelo: contas.length > 1 ? 'primeira' : 'unica' };
}

/** O Instagram do canal "instagram": o que casa com o link do perfil, senão
 *  o ligado à Página escolhida, senão o primeiro ligado a alguma Página. */
export function escolherInstagram(contas, escolhida, urlInstagram) {
  const ap = apelidoDoLink(urlInstagram);
  if (ap) {
    const c = contas.find((x) => x.pagina.instagram?.usuario?.toLowerCase() === ap);
    if (c) return c.pagina.instagram;
  }
  if (escolhida?.pagina.instagram) return escolhida.pagina.instagram;
  return contas.find((x) => x.pagina.instagram)?.pagina.instagram ?? null;
}

export function lerPagina(r) {
  return {
    id: idMeta(r?.id), nome: textoCurto(r?.name, 120), link: texto(r?.link), usuario: textoCurto(r?.username, 120),
    categoria: textoCurto(r?.category, 80),
    seguidores: inteiro(r?.followers_count), curtidas: inteiro(r?.fan_count), falando_sobre: inteiro(r?.talking_about_count),
    avaliacoes: inteiro(r?.rating_count), nota: numeroMeta(r?.overall_star_rating), check_ins: inteiro(r?.were_here_count),
  };
}

// Valor de insights: número, ou objeto por tipo ({like: 3, love: 1}). Objeto
// vazio é "veio, sem nada dentro" (zero de cada tipo), e fica {}.
function valorMeta(v) {
  if (objeto(v)) {
    const m = {};
    for (const [k, x] of Object.entries(v)) {
      const n = numeroMeta(x);
      if (n != null) m[k] = n;
    }
    return m;
  }
  return numeroMeta(v);
}

/** Qualquer resposta de /insights (Página, post, conta e mídia do Instagram):
 *  { metrica: { periodo, valores: [{dia, valor}], total, quebras: {dim: {chave: n}} } }.
 *  `total` é o total_value, ou o valor único do period=lifetime. */
export function lerInsights(resp) {
  const fora = {};
  for (const item of lista(resp?.data)) {
    const nome = texto(item?.name);
    if (!nome) continue;
    const valores = lista(item.values).map((v) => ({ dia: diaDoFimMeta(v?.end_time), valor: valorMeta(v?.value) }));
    const tv = objeto(item.total_value) ? item.total_value : null;
    let total = null;
    if (tv) total = valorMeta(tv.value);
    else if (valores.length === 1 && valores[0].dia == null) total = valores[0].valor;
    const quebras = {};
    for (const q of lista(tv?.breakdowns)) {
      const dim = lista(q?.dimension_keys).join('+') || 'quebra';
      const mapa = {};
      for (const r of lista(q?.results)) {
        const k = lista(r?.dimension_values).map(String).join('+');
        const n = numeroMeta(r?.value);
        if (k && n != null) mapa[k] = (mapa[k] ?? 0) + n;
      }
      quebras[dim] = mapa;
    }
    const linha = { periodo: texto(item.period), valores, total, quebras };
    // Sem period no pedido a Meta manda a mesma métrica em vários períodos:
    // fica a primeira que trouxe algum valor.
    const ja = fora[nome];
    if (!ja || (!ja.valores.length && ja.total == null)) fora[nome] = linha;
  }
  return fora;
}
/** O número de uma métrica de insights: o total, ou o último valor do dia. */
export function valorDe(ins) {
  if (!ins) return null;
  if (ins.total != null) return ins.total;
  for (let i = ins.valores.length - 1; i >= 0; i--) if (ins.valores[i].valor != null) return ins.valores[i].valor;
  return null;
}
const numeroDe = (ins) => {
  const v = valorDe(ins);
  return typeof v === 'number' ? v : null;
};
const mapaDe = (ins) => {
  const v = valorDe(ins);
  return objeto(v) ? v : null;
};

/** Dia a dia da Página, um registro por dia da janela (null onde não veio). */
export function porDiaDaPagina(dia, janela) {
  const mapas = {};
  for (const m of Object.keys(NOMES_PAGINA_DIA)) mapas[m] = new Map(lista(dia[m]?.valores).filter((v) => v.dia).map((v) => [v.dia, v.valor]));
  const fora = [];
  for (let d = janela[0].semana; d <= janela[janela.length - 1].fim; d = somarDias(d, 1)) {
    const linha = { dia: d };
    for (const [m, k] of Object.entries(NOMES_PAGINA_DIA)) {
      const v = mapas[m].get(d);
      linha[k] = m === 'page_actions_post_reactions_total' ? (objeto(v) ? v : null) : typeof v === 'number' ? v : null;
    }
    fora.push(linha);
  }
  return fora;
}

/** Semana da Página. Soma só com os 7 dias presentes: semana com buraco
 *  daria número menor que o real, e menor que o real parece queda. O alcance
 *  é único, não se soma: vem do period=week que fecha no domingo. */
export function semanasDaPagina(dia, semana, janela) {
  const mapas = {};
  for (const m of Object.keys(SOMA_SEMANA_PAGINA)) mapas[m] = new Map(lista(dia[m]?.valores).filter((v) => v.dia).map((v) => [v.dia, v.valor]));
  const alcance = new Map(lista(semana.page_total_media_view_unique?.valores).filter((v) => v.dia).map((v) => [v.dia, v.valor]));
  return janela.map(({ semana: seg, fim }) => {
    const dias = Array.from({ length: 7 }, (_, i) => somarDias(seg, i));
    const linha = { semana: seg, fim, dias_com_dado: dias.filter((d) => typeof mapas.page_media_view.get(d) === 'number').length };
    const a = alcance.get(fim);
    linha.alcance = typeof a === 'number' ? a : null;
    for (const [m, k] of Object.entries(SOMA_SEMANA_PAGINA)) {
      const vs = dias.map((d) => mapas[m].get(d));
      linha[k] = vs.every((v) => typeof v === 'number') ? vs.reduce((s, v) => s + v, 0) : null;
    }
    return linha;
  });
}

/** Post do /published_posts. A Meta omite "shares" quando ninguém
 *  compartilhou: com as contagens de reações e comentários presentes, a
 *  ausência é zero; sem elas (campos básicos), é null. */
export function lerPost(p) {
  const id = idMeta(p?.id);
  if (!id) return null;
  const reacoes = inteiro(p.reactions?.summary?.total_count);
  const comentarios = inteiro(p.comments?.summary?.total_count);
  const compartilhamentos = objeto(p.shares) ? inteiro(p.shares.count) : reacoes != null && comentarios != null ? 0 : null;
  return {
    id, data: dataSP(p.created_time), criado_em: texto(p.created_time), link: linkAbsoluto(p.permalink_url),
    titulo: tituloDe(p.message), tipo: texto(p.status_type), imagem: texto(p.full_picture),
    reacoes, comentarios, compartilhamentos,
    engajamento: reacoes != null && comentarios != null && compartilhamentos != null ? reacoes + comentarios + compartilhamentos : null,
    visualizacoes: null, alcance: null, cliques: null, cliques_por_tipo: null, reacoes_por_tipo: null, atividade_por_tipo: null, video: null,
  };
}
const ehVideo = (post) => /video/i.test(post.tipo ?? '');

/** Números do post a partir dos insights (lifetime). */
export function aplicarInsightsPost(post, ins) {
  for (const [m, k] of Object.entries(NOMES_POST)) {
    if (!ins[m]) continue;
    post[k] = k.endsWith('_por_tipo') ? mapaDe(ins[m]) : numeroDe(ins[m]);
  }
  return post;
}
export function lerVideoPost(ins) {
  const v = {};
  for (const [m, k] of Object.entries(NOMES_VIDEO)) v[k] = numeroDe(ins[m]);
  return Object.values(v).some((x) => x != null) ? v : null;
}

export function lerReel(r) {
  const id = idMeta(r?.id);
  if (!id) return null;
  const criado = texto(r.created_time) ?? texto(r.updated_time);
  const fora = {
    id, data: dataSP(criado), criado_em: criado,
    link: linkAbsoluto(r.permalink_url) ?? `https://www.facebook.com/reel/${id}`,
    titulo: tituloDe(r.description), duracao_s: numeroMeta(r.length),
  };
  for (const k of Object.values(NOMES_REEL)) fora[k] = null;
  return fora;
}

export function lerContaInstagram(r) {
  return {
    id: idMeta(r?.id), usuario: textoCurto(r?.username, 120), nome: textoCurto(r?.name, 120),
    seguidores: inteiro(r?.followers_count), seguindo: inteiro(r?.follows_count), publicacoes_total: inteiro(r?.media_count),
    site: texto(r?.website), bio: textoCurto(r?.biography, 300), foto: texto(r?.profile_picture_url),
  };
}

/** Semana da conta do Instagram (total_value na janela da semana). */
export function semanaInstagram(w, ins, seg, hoje) {
  const linha = { semana: w.semana, fim: w.fim, madura: hoje >= somarDias(w.fim, 3) };
  for (const [m, k] of Object.entries(NOMES_IG_SEMANA)) linha[k] = ins[m] ? numeroDe(ins[m]) : null;
  const q = seg?.follows_and_unfollows?.quebras?.follow_type;
  linha.seguir_deixar = q && Object.keys(q).length ? q : null;
  return linha;
}

/** Mídia do /media e do /stories. */
export function lerMidia(m) {
  const id = idMeta(m?.id);
  if (!id) return null;
  const fora = {
    id, tipo: texto(m.media_type), produto: texto(m.media_product_type) ?? 'FEED',
    data: dataSP(m.timestamp), criado_em: texto(m.timestamp), link: texto(m.permalink),
    titulo: tituloDe(m.caption), miniatura: texto(m.thumbnail_url) ?? texto(m.media_url), ia: booleano(m.is_ai_generated),
  };
  for (const k of new Set(Object.values(NOMES_IG_MIDIA))) fora[k] = null;
  fora.curtidas = inteiro(m.like_count);
  fora.comentarios = inteiro(m.comments_count);
  fora.repostagens = inteiro(m.reposts_count);
  fora.salvamentos = inteiro(m.saved_count);
  fora.compartilhamentos = inteiro(m.shares_count);
  fora.total_curtidas = inteiro(m.total_like_count);
  fora.total_comentarios = inteiro(m.total_comments_count);
  fora.total_visualizacoes = inteiro(m.total_views_count);
  return fora;
}
/** O insight manda sobre o campo (o campo some se o dono ocultar curtidas). */
export function aplicarInsightsMidia(midia, ins) {
  for (const [m, k] of Object.entries(NOMES_IG_MIDIA)) {
    if (!ins[m]) continue;
    const n = numeroDe(ins[m]);
    if (n != null) midia[k] = n;
  }
  return midia;
}
/** Tipo da mídia para escolher as métricas: STORY, REELS ou FEED (AD e
 *  carrossel usam as do feed). */
const tipoMetricas = (midia) => (midia.produto === 'STORY' ? 'STORY' : midia.produto === 'REELS' ? 'REELS' : 'FEED');

export function lerContasAnuncio(itens) {
  const fora = [];
  for (const c of lista(itens)) {
    const id = idMeta(c?.id);
    if (!id || !id.startsWith('act_')) continue;
    const codigo = numeroMeta(c.account_status);
    fora.push({
      id, numero: texto(c.account_id) ?? id.slice(4), nome: textoCurto(c.name, 120), moeda: texto(c.currency),
      fuso: texto(c.timezone_name), situacao: SITUACAO_CONTA[codigo] ?? null, situacao_codigo: codigo,
    });
  }
  return fora;
}

/** [{action_type, value}] em { action_type: n }. */
export function lerAcoes(acoes) {
  const m = {};
  for (const a of lista(acoes)) {
    const k = texto(a?.action_type);
    const n = numeroMeta(a?.value);
    if (k && n != null) m[k] = (m[k] ?? 0) + n;
  }
  return m;
}
function lerResultados(x) {
  if (!Array.isArray(x)) return null;
  const fora = [];
  for (const r of x) {
    const indicador = texto(r?.indicator);
    if (!indicador) continue;
    const vs = lista(r.values).map((v) => numeroMeta(v?.value)).filter((n) => n != null);
    fora.push({ indicador, valor: vs.length ? vs.reduce((s, n) => s + n, 0) : null });
  }
  return fora;
}

/** Uma linha de /act_X/insights. A Meta só lista a ação que aconteceu: numa
 *  linha com entrega, ação ausente é zero; sem linha, não há número. */
export function lerLinhaAnuncio(r) {
  const acoes = lerAcoes(r?.actions);
  const entrega = numeroMeta(r?.impressions) != null || numeroMeta(r?.spend) != null;
  const ou0 = (v) => (v != null ? v : entrega ? 0 : null);
  let leads = acoes.lead ?? null;
  if (leads == null && (acoes['onsite_conversion.lead_grouped'] != null || acoes['offsite_conversion.fb_pixel_lead'] != null)) {
    leads = (acoes['onsite_conversion.lead_grouped'] ?? 0) + (acoes['offsite_conversion.fb_pixel_lead'] ?? 0);
  }
  const saida = lerAcoes(r?.outbound_clicks);
  return {
    gasto: numeroMeta(r?.spend), impressoes: inteiro(r?.impressions), alcance: inteiro(r?.reach), frequencia: numeroMeta(r?.frequency),
    cliques: inteiro(r?.clicks), cliques_link: inteiro(r?.inline_link_clicks),
    cliques_saida: Array.isArray(r?.outbound_clicks) ? Object.values(saida).reduce((s, n) => s + n, 0) : null,
    ctr: numeroMeta(r?.ctr), cpc: numeroMeta(r?.cpc), cpm: numeroMeta(r?.cpm),
    leads: ou0(leads),
    conversas: ou0(acoes['onsite_conversion.messaging_conversation_started_7d'] ?? null),
    primeiras_respostas: ou0(acoes['onsite_conversion.messaging_first_reply'] ?? null),
    acoes, valores_acoes: lerAcoes(r?.action_values), custo_por_acao: lerAcoes(r?.cost_per_action_type),
    resultados: lerResultados(r?.results), custo_por_resultado: lerResultados(r?.cost_per_result),
  };
}

export function lerCampanha(c) {
  const id = idMeta(c?.id);
  if (!id) return null;
  return {
    id, nome: textoCurto(c.name, 200), objetivo: texto(c.objective), situacao: texto(c.status), situacao_efetiva: texto(c.effective_status),
    // Orçamento vem na menor unidade da moeda (centavos no real): o nome diz.
    orcamento_diario_centavos: inteiro(c.daily_budget), orcamento_total_centavos: inteiro(c.lifetime_budget),
    inicio: texto(c.start_time), fim: texto(c.stop_time),
  };
}

export function lerPixel(r) {
  return {
    id: idMeta(r?.id), nome: textoCurto(r?.name, 120), ultimo_disparo: texto(r?.last_fired_time), indisponivel: booleano(r?.is_unavailable),
    criado_em: texto(r?.creation_time), cookie_primario: texto(r?.first_party_cookie_status),
    correspondencia_automatica: booleano(r?.enable_automatic_matching),
    campos_correspondencia: Array.isArray(r?.automatic_matching_fields) ? r.automatic_matching_fields.filter((x) => typeof x === 'string') : null,
    uso_dados: texto(r?.data_use_setting),
  };
}

/** /{pixel}/stats: blocos por hora, cada um com [{value, count}] (os nomes
 *  dos subcampos não estão na documentação; value/count é o comum). O que
 *  não tiver esse formato é contado e descartado, nunca vira zero. */
export function lerStatsPixel(blocos) {
  const fora = [];
  let estranhos = 0;
  for (const b of lista(blocos)) {
    const itens = [];
    for (const x of lista(b?.data)) {
      const chave = texto(x?.value) ?? texto(x?.event) ?? texto(x?.key);
      const contagem = numeroMeta(x?.count);
      if (chave && contagem != null) itens.push({ chave, contagem });
      else estranhos++;
    }
    fora.push({ hora: b?.start_time ?? null, dia: dataSP(b?.start_time), itens });
  }
  return { blocos: fora, estranhos };
}
export function eventosPorDia(stats) {
  const dias = new Map();
  const total = {};
  for (const b of stats.blocos) {
    if (!b.dia) continue;
    const ev = dias.get(b.dia) ?? {};
    for (const { chave, contagem } of b.itens) {
      ev[chave] = (ev[chave] ?? 0) + contagem;
      total[chave] = (total[chave] ?? 0) + contagem;
    }
    dias.set(b.dia, ev);
  }
  return { por_dia: [...dias.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([dia, eventos]) => ({ dia, eventos })), total };
}
export function totaisDoStats(stats) {
  const total = {};
  for (const b of stats.blocos) for (const { chave, contagem } of b.itens) total[chave] = (total[chave] ?? 0) + contagem;
  return total;
}
/** URLs que dispararam o Pixel: só origem + caminho. A consulta (?...) pode
 *  trazer e-mail ou telefone de formulário, e isso não entra no cache. */
export function urlsDoStats(stats, max = LIMITES.urlsPixel) {
  const soma = new Map();
  for (const b of stats.blocos) {
    for (const { chave, contagem } of b.itens) {
      let u;
      try { u = new URL(chave); } catch { continue; }
      if (!/^https?:$/.test(u.protocol)) continue;
      const k = `${u.origin}${u.pathname}`;
      soma.set(k, (soma.get(k) ?? 0) + contagem);
    }
  }
  return [...soma.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([url, disparos]) => ({ url, disparos }));
}

/** /dataset_quality: nota de correspondência (EMQ) e cobertura por evento. */
export function lerQualidade(r) {
  const web = Array.isArray(r?.web) ? r.web : Array.isArray(r?.data?.[0]?.web) ? r.data[0].web : null;
  if (!web) return null;
  return web.map((w) => ({
    evento: texto(w?.event_name),
    nota: numeroMeta(w?.event_match_quality?.composite_score),
    chaves: lista(w?.event_match_quality?.match_key_feedback)
      .map((k) => ({ chave: texto(k?.identifier), cobertura: numeroMeta(k?.coverage?.percentage) }))
      .filter((k) => k.chave),
    cobertura_eventos: numeroMeta(w?.event_coverage?.percentage),
    acr: numeroMeta(w?.acr?.percentage),
    frequencia_envio: texto(w?.data_freshness?.upload_frequency),
  })).filter((w) => w.evento);
}

/** Linha para painel_mkt_api_publicacoes. Só vai a chave do número que veio
 *  (número ausente não apaga o lançado à mão); link normalizado como o da
 *  tela (normalizarLink), e link que não passa fica de fora. */
export function linhaPublicacao(canal, link, data, titulo, numeros) {
  if (!data) return null;
  let url;
  try { url = normalizarLink(link); } catch { return null; }
  if (!url) return null;
  const fora = { canal, url, data, titulo: titulo ?? null };
  for (const [k, v] of Object.entries(numeros)) {
    const n = inteiro(v);
    if (n != null) fora[k] = n;
  }
  return fora;
}
const somaPresentes = (...vs) => (vs.some((v) => typeof v === 'number') ? vs.reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0) : null);
export const publicacaoDoPost = (p) => linhaPublicacao(CANAL_FACEBOOK, p.link, p.data, p.titulo,
  { alcance: p.alcance, impressoes: p.visualizacoes, engajamento: p.engajamento, cliques: p.cliques });
// Título só o de verdade (a legenda): o banco só preserva o título digitado
// à mão quando o da API vem VAZIO, e um "Reel" ou "Story" de enfeite
// trocaria o que a equipe escreveu (revisão 2).
export const publicacaoDoReel = (r) => linhaPublicacao(CANAL_FACEBOOK, r.link, r.data, r.titulo ?? null,
  { impressoes: r.reproducoes_total ?? r.reproducoes, engajamento: typeof r.acoes_sociais === 'number' ? r.acoes_sociais : null });
/** Mídia do Instagram para as publicações. O Story vai SEM número: ele e as
 *  métricas dele só existem nas 24 h em que está no ar, e a coleta roda uma
 *  vez por dia (a pesquisa pede de 4 em 4 ou de 6 em 6 horas, ou o webhook
 *  story_insights). O número lido é de um momento qualquer dessas 24 h, às
 *  vezes de minutos depois de publicar, e no banco ele ficaria como o número
 *  final do Story, sem ninguém regravar. A leitura fica em
 *  dados.instagram.stories, com a hora (lido_em) e parcial: true. */
export const publicacaoDaMidia = (m) => linhaPublicacao(CANAL_INSTAGRAM, m.link, m.data, m.titulo ?? null,
  m.produto === 'STORY' ? {}
    : { alcance: m.alcance, impressoes: m.visualizacoes, engajamento: m.interacoes, cliques: somaPresentes(m.atividade_perfil, m.cliques_link) });

/** Linhas para painel_mkt_api_metricas: só o número que veio. */
function linhaSemana(canal, semana, numeros) {
  const n = {};
  for (const [k, v] of Object.entries(numeros)) {
    const x = inteiro(v);
    if (x != null) n[k] = x;
  }
  return Object.keys(n).length ? { canal, semana, numeros: n } : null;
}

/** Facebook: alcance, visualizações, engajamento e cliques de cada semana
 *  fechada; seguidores só na segunda logo depois da semana (retrato). */
export function semanasFacebook(porSemana, seguidoresAgora, hoje, janela) {
  const ultima = janela[janela.length - 1];
  const naSegunda = hoje === somarDias(ultima.fim, 1);
  const fora = [];
  for (const w of janela) {
    const s = porSemana.find((x) => x.semana === w.semana) ?? {};
    const linha = linhaSemana(CANAL_FACEBOOK, w.semana, {
      alcance: s.alcance, impressoes: s.visualizacoes, engajamento: s.engajamento, cliques: s.cliques_acao,
      seguidores: naSegunda && w.semana === ultima.semana ? seguidoresAgora : null,
    });
    if (linha) fora.push(linha);
  }
  return fora;
}
/** Instagram: só semana madura (a Meta atrasa até 48 h e o total parcial
 *  pareceria queda); seguidores como no Facebook. */
export function semanasInstagram(porSemana, seguidoresAgora, hoje, janela) {
  const ultima = janela[janela.length - 1];
  const naSegunda = hoje === somarDias(ultima.fim, 1);
  const fora = [];
  for (const w of janela) {
    const s = porSemana.find((x) => x.semana === w.semana);
    const madura = s?.madura === true;
    const linha = linhaSemana(CANAL_INSTAGRAM, w.semana, {
      alcance: madura ? s.alcance : null, impressoes: madura ? s.visualizacoes : null,
      engajamento: madura ? s.interacoes : null, cliques: madura ? s.toques_links : null,
      seguidores: naSegunda && w.semana === ultima.semana ? seguidoresAgora : null,
    });
    if (linha) fora.push(linha);
  }
  return fora;
}

// --------------------------------------------------------------- cliente --

function criarCliente(ctx, segredoApp) {
  let chamadas = 0;
  const provas = new Map();
  const prazo = typeof ctx.prazo === 'function' ? () => Number(ctx.prazo()) : () => Infinity;

  async function pedir(url, token, rotulo) {
    if (!(prazo() >= MARGEM_MS)) throw new SemTempo();
    const u = new URL(url);
    if (segredoApp) {
      if (!provas.has(token)) provas.set(token, await provaDoSegredo(token, segredoApp));
      u.searchParams.set('appsecret_proof', provas.get(token));
    }
    chamadas++;
    let r;
    try {
      r = await ctx.fetchJson(u.toString(), { method: 'GET', headers: { Authorization: `Bearer ${token}` }, rotulo });
    } catch (e) {
      throw new ErroMeta(classificarErro(e));
    }
    // Algumas coletoras devolvem o corpo de erro da Graph em vez de lançar.
    if (objeto(r) && objeto(r.error)) throw new ErroMeta(classificarErro({ corpo: r }));
    return objeto(r) ? r : {};
  }
  const get = (caminho, params, token, rotulo) => pedir(montarUrl(caminho, params), token, rotulo);

  /** Lista paginada com teto. `parar(lote)` corta quando o resto já é velho. */
  async function todas(caminho, params, token, rotulo, maxPaginas, parar = () => false) {
    const itens = [];
    let r = await get(caminho, params, token, rotulo);
    let paginas = 1;
    let cortado = false;
    for (;;) {
      const lote = lista(r.data);
      itens.push(...lote);
      if (parar(lote)) break;
      const prox = proximaPagina(r);
      if (!prox) break;
      if (paginas >= maxPaginas) { cortado = true; break; }
      r = await pedir(prox, token, rotulo);
      paginas++;
    }
    return { itens, cortado };
  }
  return { get, todas, chamadas: () => chamadas };
}

/** Roda `fn` em cada item com no máximo `n` de uma vez. O erro que sobe
 *  (token, limite, prazo) para de puxar item novo e é relançado. */
async function emParalelo(itens, n, fn) {
  let i = 0;
  let erro = null;
  async function trabalhador() {
    while (!erro && i < itens.length) {
      const item = itens[i++];
      try { await fn(item); } catch (e) { erro = erro ?? e; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, trabalhador));
  if (erro) throw erro;
}

// --------------------------------------------------------------- coletar --

export async function coletar(ctx) {
  const agoraIso = () => (typeof ctx?.agora === 'function' ? new Date(ctx.agora()) : new Date()).toISOString();
  const hoje = /^\d{4}-\d{2}-\d{2}$/.test(ctx?.hoje ?? '') ? ctx.hoje : hojeSP();
  const log = (t) => {
    if (typeof ctx?.log !== 'function') return;
    try { ctx.log(t); } catch { /* o diário não derruba a coleta */ }
  };
  const avisos = new Set();
  // A coletora guarda até 30 avisos (normalizarResultado): mais que isso some.
  // Todo aviso passa pela troca do travessão: nome de Página e de conta vêm
  // da Meta como o dono escreveu, às vezes com meia-risca, e entram em frase
  // do Painel.
  const avisar = (t) => { if (avisos.size < 30) avisos.add(semTravessao(t)); };
  const token = String(ctx?.env?.('META_TOKEN') ?? '').trim();
  const janela = janelaSemanas(hoje);
  const ultimoDomingo = janela[janela.length - 1].fim;
  const desde = somarDias(hoje, -DIAS_PUBLICACOES);

  if (!token) {
    const em = agoraIso();
    return {
      estado: 'falta_configurar', conta: null,
      partes: Object.fromEntries(PARTES.map((p) => [p, parteMeta('falta_configurar', 'sem_token', em)])),
      dados: {}, semanas: [], publicacoes: [],
      avisos: ['Falta cadastrar o secret META_TOKEN no Supabase (o token do usuário do sistema da Meta).'],
    };
  }

  const cli = criarCliente(ctx, String(ctx.env?.('META_APP_SECRET') ?? '').trim() || null);
  const situacao = Object.fromEntries(PARTES.map((p) => [p, { oks: 0, falhas: [], em: null }]));
  const recusadas = Object.fromEntries(PARTES.map((p) => [p, new Set()]));
  const dados = { versao_api: VERSAO_GRAPH, janela: { hoje, ultimo_domingo: ultimoDomingo, publicacoes_desde: desde, semanas: janela } };
  let tokenMorto = false;
  let semTempo = false;
  let freio = false;

  const marcar = (parte, estado, motivo) => {
    situacao[parte].falhas.push({ estado, motivo });
    situacao[parte].em = agoraIso();
  };
  const canalAtivo = (codigo) => !Array.isArray(ctx.canais) || ctx.canais.some((c) => c?.codigo === codigo);
  const urlDoCanal = (codigo) => (Array.isArray(ctx.canais) ? ctx.canais.find((c) => c?.codigo === codigo)?.url_perfil ?? null : null);

  function tratarErro(parte, oque, e) {
    if (e instanceof SemTempo) {
      semTempo = true;
      marcar(parte, 'parcial', 'prazo');
      avisar('O tempo da coleta acabou antes do fim; o que faltou entra na próxima.');
      return;
    }
    if (e instanceof Falta) {
      marcar(parte, e.estado, e.motivo);
      if (e.aviso) avisar(e.aviso);
      return;
    }
    if (e instanceof ErroMeta) {
      const { tipo, codigo, status } = e.info;
      if (tipo === 'token') { tokenMorto = true; return; }
      if (tipo === 'permissao') {
        marcar(parte, 'falta_conectar', 'sem_permissao');
        avisar(`${ROTULO[parte]}: sem permissão para ler ${oque} (${descreverCodigo(e.info)}). Confira no Gerenciador de Negócios se o ativo está atribuído ao usuário do sistema, com Conteúdo e Insights.`);
        return;
      }
      if (tipo === 'limite') {
        // 4 e 17 são o limite do app e do usuário: vale para todas as partes.
        if (codigo === 4 || codigo === 17 || status === 429) freio = true;
        marcar(parte, 'erro', 'limite_de_chamadas');
        avisar(`${ROTULO[parte]}: a Meta pediu calma (limite de chamadas, ${descreverCodigo(e.info)}); a próxima coleta tenta de novo.`);
        return;
      }
      marcar(parte, 'erro', 'falha_provedor');
      avisar(`${ROTULO[parte]}: a Meta não entregou ${oque} (${descreverCodigo(e.info)}).`);
      return;
    }
    marcar(parte, 'erro', 'falha_interna');
    log(`meta ${parte}: falha interna em ${oque}: ${String(e?.message ?? e).slice(0, 160)}`);
    avisar(`${ROTULO[parte]}: falha interna da coleta em ${oque}.`);
  }

  /** Uma etapa de uma parte. `dado: false` é etapa de descoberta, que sozinha
   *  não traz número para a tela. */
  async function etapa(parte, oque, fn, { dado = true } = {}) {
    if (tokenMorto) return false;
    if (semTempo) { marcar(parte, 'parcial', 'prazo'); return false; }
    if (freio) { marcar(parte, 'erro', 'limite_de_chamadas'); return false; }
    try {
      await fn();
      if (dado) situacao[parte].oks++;
      situacao[parte].em = agoraIso();
      return true;
    } catch (e) {
      tratarErro(parte, oque, e);
      return false;
    }
  }

  async function comRecuo(parte, oque, principal, recuo) {
    try {
      return await principal();
    } catch (e) {
      if (!(e instanceof ErroMeta) || e.info.tipo !== 'invalido') throw e;
      avisar(`${ROTULO[parte]}: a Meta recusou parte dos campos de ${oque}; seguem só os básicos.`);
      return recuo();
    }
  }

  /** Insights com a busca da métrica culpada (ver o topo). A recusa fica
   *  guardada por grupo: o mesmo nome pode valer num tipo e não no outro. */
  async function insights(parte, id, metricas, params, tok, rotulo, grupo) {
    const rec = recusadas[parte];
    const pedir = metricas.filter((m) => !rec.has(`${grupo}|${m}`));
    if (!pedir.length) return {};
    const chamar = async (ms) => lerInsights(await cli.get(`/${id}/insights`, { metric: ms.join(','), ...params }, tok, rotulo));
    try {
      return await chamar(pedir);
    } catch (e) {
      if (!(e instanceof ErroMeta) || e.info.tipo !== 'invalido') throw e;
      if (pedir.length === 1) { rec.add(`${grupo}|${pedir[0]}`); return {}; }
      const fora = {};
      for (const m of pedir) {
        try {
          Object.assign(fora, await chamar([m]));
        } catch (e2) {
          if (e2 instanceof ErroMeta && e2.info.tipo === 'invalido') { rec.add(`${grupo}|${m}`); continue; }
          throw e2;
        }
      }
      return fora;
    }
  }

  // ---- 1. Descobrir a Página, o token dela e o Instagram ligado.
  let contas = [];
  let escolhida = null;
  let ig = null;
  const achou = await etapa('pagina', 'a lista de Páginas', async () => {
    const r = await comRecuo('pagina', 'a lista de Páginas',
      () => cli.todas('/me/accounts', { fields: CAMPOS.contas, limit: 50 }, token, 'meta:contas', LIMITES.paginasLista),
      () => cli.todas('/me/accounts', { fields: CAMPOS.contasBasico, limit: 50 }, token, 'meta:contas', LIMITES.paginasLista));
    contas = lerContasPaginas(r.itens);
    // O /me/accounts só lista a Página em que o usuário do sistema tem
    // Conteúdo, Moderação, Anúncios ou Controle total: só "Insights" não basta.
    if (!contas.length) throw new Falta('falta_conectar', 'pagina_nao_atribuida', 'Nenhuma Página do Facebook apareceu para o usuário do sistema. No Gerenciador de Negócios, atribua a Página a ele com Acesso parcial, ligando Conteúdo e Insights.');
    escolhida = escolherPagina(contas, urlDoCanal(CANAL_FACEBOOK));
    if (escolhida.pelo === 'primeira') avisar(`Página: o usuário do sistema enxerga ${contas.length} Páginas e nenhuma casou com o link do canal facebook; foi usada a primeira (${escolhida.pagina.nome ?? escolhida.pagina.id}).`);
    if (!escolhida.token) avisar('Página: a Meta não entregou o token da Página; as leituras dela usam o token do usuário do sistema.');
  }, { dado: false });
  if (!achou && !tokenMorto) {
    const f = situacao.pagina.falhas[situacao.pagina.falhas.length - 1];
    if (f) marcar('instagram', f.estado, f.motivo);
  }
  if (escolhida) {
    ig = escolherInstagram(contas, escolhida, urlDoCanal(CANAL_INSTAGRAM));
    if (!ig) {
      marcar('instagram', 'falta_conectar', 'instagram_nao_ligado');
      avisar('Instagram: nenhuma conta profissional ligada à Página apareceu. Ligue o Instagram à Página e atribua a conta ao usuário do sistema, com Conteúdo e Insights.');
    }
  }
  const tokenPagina = escolhida?.token ?? token;
  const tarefas = escolhida?.pagina.tarefas ?? null;

  // O retrato de cada parte começa só com o que a descoberta já sabe; cada
  // etapa põe as suas chaves (ver FORMATO: etapa que não rodou fica ausente).
  const baseDaPagina = () => {
    if (!dados.pagina) {
      const { instagram: _ig, ...pagina } = escolhida.pagina;
      dados.pagina = {
        ...pagina, escolhida_por: escolhida.pelo,
        fuso: 'Os dias da Página seguem o fuso do Pacífico, o da Meta; a semana do Painel vai de segunda a domingo no fuso de São Paulo.',
      };
    }
    return dados.pagina;
  };
  const baseDoInstagram = () => {
    dados.instagram ??= {
      id: ig.id, usuario: ig.usuario,
      observacao: 'Os números da conta incluem o alcance de anúncios e de conteúdo impulsionado: não são só orgânicos.',
    };
    return dados.instagram;
  };
  // O retrato do nó (Página, conta) veio: campo ausente vira null, mas não
  // apaga o que a descoberta já tinha (id, nome).
  const juntarNo = (alvo, no) => {
    for (const [k, v] of Object.entries(no)) if (v != null || !(k in alvo)) alvo[k] = v;
  };

  // ---- 2. Página: retrato e insights (os números da semana).
  if (escolhida) {
    await etapa('pagina', 'os números da Página', async () => {
      const id = escolhida.pagina.id;
      const no = lerPagina(await comRecuo('pagina', 'a Página',
        () => cli.get(`/${id}`, { fields: CAMPOS.pagina }, tokenPagina, 'meta:pagina'),
        () => cli.get(`/${id}`, { fields: CAMPOS.paginaBasico }, tokenPagina, 'meta:pagina')));
      const pg = baseDaPagina();
      juntarNo(pg, no);
      // Insights pedem a tarefa ANALYZE ("Insights"); sem ela, nem tenta.
      if (tarefas && !tarefas.includes('ANALYZE')) {
        marcar('pagina', 'parcial', 'sem_tarefa_insights');
        avisar('Página: o usuário do sistema não tem a tarefa Insights na Página; os números dela ficaram fora.');
        return;
      }
      const periodo = { since: janela[0].semana, until: segundaDaSemana(hoje) };
      const dia = {};
      for (const lote of PAGINA_DIA) Object.assign(dia, await insights('pagina', id, lote, { period: 'day', ...periodo }, tokenPagina, 'meta:pagina:insights', 'dia'));
      const semana = await insights('pagina', id, ['page_total_media_view_unique'], { period: 'week', ...periodo }, tokenPagina, 'meta:pagina:insights', 'semana');
      const d28 = await insights('pagina', id, ['page_total_media_view_unique'], { period: 'days_28', since: somarDias(hoje, -3), until: hoje }, tokenPagina, 'meta:pagina:insights', 'd28');
      const lugares = {};
      for (const m of PAGINA_LUGARES) Object.assign(lugares, await insights('pagina', id, [m], { since: somarDias(hoje, -3), until: hoje }, tokenPagina, 'meta:pagina:insights', 'lugar'));
      pg.por_dia = porDiaDaPagina(dia, janela);
      pg.por_semana = semanasDaPagina(dia, semana, janela);
      const ultimo28 = lista(d28.page_total_media_view_unique?.valores).filter((v) => typeof v.valor === 'number').pop();
      pg.alcance_28_dias = ultimo28?.valor ?? null;
      pg.alcance_28_dias_ate = ultimo28?.dia ?? null;
      pg.seguidores_por_pais = mapaDe(lugares.page_follows_country);
      pg.seguidores_por_cidade = mapaDe(lugares.page_follows_city);
    });
  }

  // ---- 3. Instagram: retrato e insights da conta (os números da semana).
  if (ig) {
    await etapa('instagram', 'os números da conta', async () => {
      const no = lerContaInstagram(await comRecuo('instagram', 'a conta',
        () => cli.get(`/${ig.id}`, { fields: CAMPOS.ig }, token, 'meta:instagram'),
        () => cli.get(`/${ig.id}`, { fields: CAMPOS.igBasico }, token, 'meta:instagram')));
      const conta = baseDoInstagram();
      juntarNo(conta, no);
      const rotulo = 'meta:instagram:insights';
      const semanaDe = async (w) => {
        const p = { period: 'day', metric_type: 'total_value', since: unixInicioSP(w.semana), until: unixInicioSP(somarDias(w.semana, 7)) };
        const ins = await insights('instagram', ig.id, IG_SEMANA, p, token, rotulo, 'conta');
        const seg = await insights('instagram', ig.id, ['follows_and_unfollows'], { ...p, breakdown: 'follow_type' }, token, rotulo, 'conta:follow_type');
        return semanaInstagram(w, ins, seg, hoje);
      };
      // A primeira semana sozinha (se uma métrica sumiu, a busca da culpada
      // acontece uma vez só); as outras em paralelo.
      const porSemana = new Map();
      porSemana.set(janela[0].semana, await semanaDe(janela[0]));
      await emParalelo(janela.slice(1), LIMITES.simultaneas, async (w) => porSemana.set(w.semana, await semanaDe(w)));
      conta.por_semana = janela.map((w) => porSemana.get(w.semana));

      // Quebras da última semana madura (a mais recente que a Meta já fechou).
      const wq = [...janela].reverse().find((w) => hoje >= somarDias(w.fim, 3)) ?? janela[janela.length - 1];
      const pq = { period: 'day', metric_type: 'total_value', since: unixInicioSP(wq.semana), until: unixInicioSP(somarDias(wq.semana, 7)) };
      const porTipo = await insights('instagram', ig.id, ['reach', 'views'], { ...pq, breakdown: 'media_product_type' }, token, rotulo, 'conta:media_product_type');
      const porSeguidor = await insights('instagram', ig.id, ['views'], { ...pq, breakdown: 'follower_type' }, token, rotulo, 'conta:follower_type');
      const alcanceSeguidor = await insights('instagram', ig.id, ['reach'], { ...pq, breakdown: 'follow_type' }, token, rotulo, 'conta:follow_type');
      const botoes = await insights('instagram', ig.id, ['profile_links_taps'], { ...pq, breakdown: 'contact_button_type' }, token, rotulo, 'conta:contact_button_type');
      const q = (ins, m, dim) => {
        const x = ins[m]?.quebras?.[dim];
        return x && Object.keys(x).length ? x : null;
      };
      conta.quebras = {
        semana: wq.semana,
        alcance_por_tipo: q(porTipo, 'reach', 'media_product_type'), visualizacoes_por_tipo: q(porTipo, 'views', 'media_product_type'),
        alcance_por_seguidor: q(alcanceSeguidor, 'reach', 'follow_type'), visualizacoes_por_seguidor: q(porSeguidor, 'views', 'follower_type'),
        // Toques por botão: soma inclusive UNDEFINED (a lista oficial tem).
        toques_por_botao: q(botoes, 'profile_links_taps', 'contact_button_type'),
      };

      const serie = await insights('instagram', ig.id, ['reach'], { period: 'day', metric_type: 'time_series', since: unixInicioSP(somarDias(hoje, -28)), until: unixInicioSP(hoje) }, token, rotulo, 'serie');
      conta.alcance_por_dia = lista(serie.reach?.valores).filter((v) => v.dia && typeof v.valor === 'number').map((v) => ({ dia: v.dia, alcance: v.valor }));

      // Demografia: top 45, só com 100 seguidores ou mais (sem isso vem vazia).
      const demo = { periodo: 'this_month', seguidores: {}, engajados: {} };
      let algum = false;
      for (const [b, k] of Object.entries(DEMOGRAFIA)) {
        const d = await insights('instagram', ig.id, ['follower_demographics', 'engaged_audience_demographics'], { period: 'lifetime', timeframe: 'this_month', metric_type: 'total_value', breakdown: b }, token, 'meta:instagram:demografia', `demo:${b}`);
        demo.seguidores[k] = q(d, 'follower_demographics', b);
        demo.engajados[k] = q(d, 'engaged_audience_demographics', b);
        if (demo.seguidores[k] || demo.engajados[k]) algum = true;
      }
      conta.demografia = algum ? demo : null;
    });
  }

  // ---- 4. Anúncios: contas, e por conta os relatórios (dia, semana,
  //         plataforma, campanha, campanha por dia) e a lista de campanhas.
  let contasAnuncio = [];
  const inicioAds = janela[0].semana;
  const okAds = await etapa('anuncios', 'as contas de anúncio', async () => {
    const r = await cli.todas('/me/adaccounts', { fields: CAMPOS.contasAnuncio, limit: 50 }, token, 'meta:anuncios:contas', 2);
    contasAnuncio = lerContasAnuncio(r.itens);
    if (!contasAnuncio.length) throw new Falta('falta_conectar', 'sem_conta_de_anuncios', 'Anúncios: nenhuma conta de anúncios apareceu para o usuário do sistema. No Gerenciador de Negócios, atribua a conta a ele com acesso de ver o desempenho.');
    if (contasAnuncio.length > LIMITES.contasAnuncio) {
      avisar(`Anúncios: ${contasAnuncio.length} contas apareceram; foram lidas as ${LIMITES.contasAnuncio} primeiras.`);
      contasAnuncio = contasAnuncio.slice(0, LIMITES.contasAnuncio);
    }
  }, { dado: false });
  if (okAds) {
    const relatorio = async (conta, extra, campanha = false) => {
      const base = {
        time_range: JSON.stringify({ since: inicioAds, until: hoje }), use_unified_attribution_setting: 'true', limit: 500, ...extra,
      };
      const campos = (cs) => (campanha ? `${CAMPOS.adsCampanha},${cs}` : cs);
      const r = await comRecuo('anuncios', 'o relatório de anúncios',
        () => cli.todas(`/${conta}/insights`, { ...base, fields: campos(CAMPOS.ads) }, token, 'meta:anuncios:insights', LIMITES.paginasAnuncios),
        () => cli.todas(`/${conta}/insights`, { ...base, fields: campos(CAMPOS.adsBasico) }, token, 'meta:anuncios:insights', LIMITES.paginasAnuncios));
      if (r.cortado) avisar('Anúncios: um relatório passou do teto de páginas; parte das linhas ficou fora.');
      return r.itens;
    };
    for (const c of contasAnuncio) {
      await etapa('anuncios', `a conta ${c.nome ?? c.id}`, async () => {
        const conta = { ...c, por_dia: [], por_semana: [], por_plataforma: [], campanhas: [], campanhas_por_dia: [] };
        conta.por_dia = (await relatorio(c.id, { level: 'account', time_increment: 1 }))
          .map((r) => ({ dia: texto(r.date_start), ...lerLinhaAnuncio(r) })).filter((l) => l.dia);
        // time_increment=7 a partir de uma segunda: cada linha é segunda a domingo.
        conta.por_semana = (await relatorio(c.id, { level: 'account', time_increment: 7 }))
          .map((r) => ({ semana: texto(r.date_start), fim: texto(r.date_stop), ...lerLinhaAnuncio(r) }))
          .filter((l) => l.semana)
          .map((l) => ({ ...l, fechada: l.fim != null && l.fim <= ultimoDomingo && l.fim === somarDias(l.semana, 6) }));
        conta.por_plataforma = (await relatorio(c.id, { level: 'account', time_increment: 7, breakdowns: 'publisher_platform' }))
          .map((r) => ({ semana: texto(r.date_start), fim: texto(r.date_stop), plataforma: texto(r.publisher_platform), ...lerLinhaAnuncio(r) }))
          .filter((l) => l.semana);
        const totais = await relatorio(c.id, { level: 'campaign' }, true);
        const porDia = await relatorio(c.id, { level: 'campaign', time_increment: 1 }, true);
        const lst = await cli.todas(`/${c.id}/campaigns`, { fields: CAMPOS.campanhas, limit: 100 }, token, 'meta:anuncios:campanhas', LIMITES.paginasLista);
        const camp = new Map();
        for (const x of lst.itens) {
          const k = lerCampanha(x);
          if (k) camp.set(k.id, k);
        }
        const vazia = lerLinhaAnuncio({});
        const comNumeros = new Map();
        for (const r of totais) {
          const id = idMeta(r.campaign_id);
          if (!id) continue;
          comNumeros.set(id, lerLinhaAnuncio(r));
          if (!camp.has(id)) camp.set(id, { id, nome: textoCurto(r.campaign_name, 200), objetivo: texto(r.objective), situacao: null, situacao_efetiva: null, orcamento_diario_centavos: null, orcamento_total_centavos: null, inicio: null, fim: null });
        }
        conta.campanhas = [...camp.values()]
          .map((k) => ({ ...k, ...(comNumeros.get(k.id) ?? vazia) }))
          .sort((a, b) => (b.gasto ?? -1) - (a.gasto ?? -1));
        conta.campanhas_por_dia = porDia.slice(0, LIMITES.linhasCampanhaDia)
          .map((r) => ({ campanha_id: idMeta(r.campaign_id), dia: texto(r.date_start), ...lerLinhaAnuncio(r) }))
          .filter((l) => l.campanha_id && l.dia);
        if (porDia.length > LIMITES.linhasCampanhaDia) avisar('Anúncios: o dia a dia por campanha passou do teto de linhas; o resto ficou fora.');
        dados.anuncios ??= { periodo: { inicio: inicioAds, fim: hoje }, contas: [] };
        dados.anuncios.contas.push(conta);
      });
    }
  }

  // ---- 5. Pixel: o da Impresilk e os das contas de anúncio.
  await etapa('pixel', 'o Pixel', async () => {
    const ids = new Set([PIXEL_PADRAO]);
    for (const c of contasAnuncio) {
      try {
        const r = await cli.get(`/${c.id}/adspixels`, { fields: 'id,name', limit: 25 }, token, 'meta:pixel:lista');
        for (const p of lista(r.data)) {
          const id = idMeta(p?.id);
          if (id) ids.add(id);
        }
      } catch (e) {
        if (fatal(e)) throw e;
        // Sem a lista, segue com o Pixel conhecido.
      }
    }
    if (ids.size > LIMITES.pixels) avisar(`Pixel: ${ids.size} Pixels apareceram; foram lidos os ${LIMITES.pixels} primeiros.`);
    // Seis dias inteiros: a Meta só guarda cerca de sete dias de estatística.
    const inicio = somarDias(hoje, -6);
    const janelaPx = { start_time: unixInicioSP(inicio), end_time: unixInicioSP(hoje) };
    const pixels = [];
    let semEstatistica = false;
    for (const id of [...ids].slice(0, LIMITES.pixels)) {
      let no;
      try {
        no = lerPixel(await comRecuo('pixel', 'o Pixel',
          () => cli.get(`/${id}`, { fields: CAMPOS.pixel }, token, 'meta:pixel'),
          () => cli.get(`/${id}`, { fields: CAMPOS.pixelBasico }, token, 'meta:pixel')));
      } catch (e) {
        if (e instanceof ErroMeta && e.info.tipo === 'permissao') continue;
        throw e;
      }
      const px = { ...no, id: no.id ?? id, eventos_por_dia: null, eventos_total: null, por_origem: null, urls: null, qualidade: null };
      const stats = async (agregacao, nome) => {
        try {
          const r = await cli.todas(`/${id}/stats`, { aggregation: agregacao, ...janelaPx }, token, 'meta:pixel:stats', LIMITES.paginasPixel);
          const s = lerStatsPixel(r.itens);
          if (s.estranhos) avisar(`Pixel: ${plural(s.estranhos, 'linha das estatísticas', 'linhas das estatísticas')} por ${nome} ${s.estranhos === 1 ? 'veio num formato desconhecido e ficou fora' : 'vieram num formato desconhecido e ficaram fora'}.`);
          return s;
        } catch (e) {
          if (fatal(e)) throw e;
          avisar(`Pixel: a Meta não entregou as estatísticas por ${nome} (${e instanceof ErroMeta ? descreverCodigo(e.info) : 'falha'}).`);
          return null;
        }
      };
      const ev = await stats('event', 'evento');
      if (ev) {
        const { por_dia: porDia, total } = eventosPorDia(ev);
        px.eventos_por_dia = porDia;
        px.eventos_total = total;
      } else semEstatistica = true;
      const origem = await stats('event_source', 'origem');
      if (origem) px.por_origem = totaisDoStats(origem);
      const urls = await stats('url', 'página');
      if (urls) px.urls = urlsDoStats(urls);
      try {
        px.qualidade = lerQualidade(await cli.get('/dataset_quality', { dataset_id: id, fields: CAMPOS.qualidade }, token, 'meta:pixel:qualidade'));
      } catch (e) {
        if (fatal(e)) throw e;
        avisar(`Pixel: a qualidade do conjunto de dados ficou fora (${e instanceof ErroMeta ? descreverCodigo(e.info) : 'falha'}); ela pede o acesso "Usar conjunto de dados de eventos".`);
      }
      pixels.push(px);
    }
    if (!pixels.length) throw new Falta('falta_conectar', 'pixel_nao_atribuido', 'Pixel: a Meta não mostrou o Pixel ao usuário do sistema. No Gerenciador de Negócios, atribua o conjunto de dados a ele (Acesso parcial, Usar conjunto de dados de eventos).');
    if (semEstatistica) marcar('pixel', 'parcial', 'estatisticas_recusadas');
    dados.pixel = { periodo: { inicio, fim: somarDias(hoje, -1) }, pixels };
  });

  // ---- 6. Posts da Página (os mais pesados: um pedido por post).
  if (escolhida && !tokenMorto) {
    const podeFeed = !tarefas || tarefas.some((t) => ['CREATE_CONTENT', 'MANAGE', 'MODERATE'].includes(t));
    if (!podeFeed) {
      marcar('pagina', 'parcial', 'sem_tarefa_conteudo');
      avisar('Página: o usuário do sistema não tem a tarefa Conteúdo na Página; os posts ficaram fora.');
    } else {
      await etapa('pagina', 'os posts', async () => {
        const id = escolhida.pagina.id;
        const velho = (lote) => lote.length > 0 && (dataSP(lote[lote.length - 1]?.created_time) ?? '9999') < desde;
        // O since no /published_posts não está documentado: o recuo vai sem
        // ele (o corte de 90 dias é feito aqui, e a paginação para no velho).
        const r = await comRecuo('pagina', 'os posts',
          () => cli.todas(`/${id}/published_posts`, { fields: CAMPOS.posts, since: unixInicioSP(desde), limit: 100 }, tokenPagina, 'meta:pagina:posts', LIMITES.paginasLista, velho),
          () => cli.todas(`/${id}/published_posts`, { fields: CAMPOS.postsBasico, limit: 100 }, tokenPagina, 'meta:pagina:posts', LIMITES.paginasLista, velho));
        let posts = r.itens.map(lerPost).filter((p) => p && p.data && p.data >= desde);
        if (posts.length > LIMITES.posts) {
          avisar(`Página: ${posts.length} posts nos últimos ${DIAS_PUBLICACOES} dias; os números foram lidos dos ${LIMITES.posts} mais novos.`);
          posts = posts.slice(0, LIMITES.posts);
        }
        const pg = baseDaPagina();
        pg.posts = posts;
        let parado = false;
        let falhas = 0;
        const numeros = async (post) => {
          if (parado) return;
          try {
            aplicarInsightsPost(post, await insights('pagina', post.id, POST_METRICAS, { period: 'lifetime' }, tokenPagina, 'meta:pagina:post', 'post'));
            if (ehVideo(post)) post.video = lerVideoPost(await insights('pagina', post.id, POST_VIDEO, { period: 'lifetime' }, tokenPagina, 'meta:pagina:video', 'video'));
          } catch (e) {
            if (!(e instanceof ErroMeta) || fatal(e)) throw e;
            if (e.info.tipo === 'permissao' && e.info.codigo >= 200 && e.info.codigo <= 299) {
              parado = true;
              marcar('pagina', 'parcial', 'sem_permissao');
              avisar(`Página: a Meta não liberou os números por post (${descreverCodigo(e.info)}).`);
              return;
            }
            falhas++;
          }
        };
        if (posts.length) {
          await numeros(posts[0]);
          await emParalelo(posts.slice(1), LIMITES.simultaneas, numeros);
        }
        if (falhas) avisar(`Página: ${plural(falhas, 'post ficou', 'posts ficaram')} sem números nesta coleta.`);
      });
    }
  }

  // ---- 7. Mídias e Stories do Instagram.
  if (ig && !tokenMorto) {
    await etapa('instagram', 'as mídias', async () => {
      const velho = (lote) => lote.length > 0 && (dataSP(lote[lote.length - 1]?.timestamp) ?? '9999') < desde;
      const r = await comRecuo('instagram', 'as mídias',
        () => cli.todas(`/${ig.id}/media`, { fields: CAMPOS.midias, since: unixInicioSP(desde), limit: 50 }, token, 'meta:instagram:midias', LIMITES.paginasLista, velho),
        () => cli.todas(`/${ig.id}/media`, { fields: CAMPOS.midiasBasico, limit: 50 }, token, 'meta:instagram:midias', LIMITES.paginasLista, velho));
      let midias = r.itens.map(lerMidia).filter((m) => m && m.data && m.data >= desde);
      if (midias.length > LIMITES.midias) {
        avisar(`Instagram: ${midias.length} mídias nos últimos ${DIAS_PUBLICACOES} dias; os números foram lidos das ${LIMITES.midias} mais novas.`);
        midias = midias.slice(0, LIMITES.midias);
      }
      let historias = [];
      try {
        const s = await cli.get(`/${ig.id}/stories`, { fields: CAMPOS.stories, limit: 50 }, token, 'meta:instagram:stories');
        historias = lista(s.data).map(lerMidia).filter(Boolean).slice(0, LIMITES.stories).map((m) => ({ ...m, produto: 'STORY', navegacao: null, lido_em: null, parcial: true }));
      } catch (e) {
        if (fatal(e)) throw e;
        avisar(`Instagram: os Stories ficaram fora (${e instanceof ErroMeta ? descreverCodigo(e.info) : 'falha'}).`);
      }
      const conta = baseDoInstagram();
      conta.midias = midias;
      conta.stories = historias;
      let parado = false;
      let falhas = 0;
      const numeros = async (m) => {
        if (parado) return;
        const tipo = tipoMetricas(m);
        try {
          // Insights de mídia não levam metric_type (esse parâmetro é da conta).
          aplicarInsightsMidia(m, await insights('instagram', m.id, IG_MIDIA[tipo], {}, token, 'meta:instagram:midia', `${tipo}:${m.tipo ?? ''}`));
          if (tipo === 'STORY') {
            // A hora da leitura: o número do Story é o deste instante, não o final.
            m.lido_em = agoraIso();
            const nav = await insights('instagram', m.id, ['navigation'], { breakdown: 'story_navigation_action_type' }, token, 'meta:instagram:midia', 'STORY:navigation');
            const q = nav.navigation?.quebras?.story_navigation_action_type;
            m.navegacao = q && Object.keys(q).length ? q : null;
          }
        } catch (e) {
          if (!(e instanceof ErroMeta) || fatal(e)) throw e;
          if (e.info.tipo === 'permissao' && e.info.codigo >= 200 && e.info.codigo <= 299) {
            parado = true;
            marcar('instagram', 'parcial', 'sem_permissao');
            avisar(`Instagram: a Meta não liberou os números por mídia (${descreverCodigo(e.info)}). Se faltar a permissão ads_management, a decisão é do Léo (é de escrita).`);
            return;
          }
          // Story com menos de 5 espectadores dá erro 10: fica sem número.
          falhas++;
          return;
        }
        // Visualizações no Facebook: dão erro se a mídia não foi
        // compartilhada lá. O erro é só desta mídia; null e segue.
        try {
          aplicarInsightsMidia(m, lerInsights(await cli.get(`/${m.id}/insights`, { metric: IG_CRUZADAS[tipo].join(',') }, token, 'meta:instagram:midia')));
        } catch (e) {
          if (fatal(e)) throw e;
        }
      };
      const todasMidias = [...historias, ...midias];
      if (todasMidias.length) {
        await numeros(todasMidias[0]);
        await emParalelo(todasMidias.slice(1), LIMITES.simultaneas, numeros);
      }
      if (falhas) avisar(`Instagram: ${plural(falhas, 'mídia ficou', 'mídias ficaram')} sem números nesta coleta (Story com menos de 5 espectadores não tem número).`);
    });
  }

  // ---- 8. Reels do Facebook. A Meta pede permissão de escrita para
  //         listá-los e para os números; o painel não pede escrita. Se der
  //         erro de permissão, os Reels ficam fora, com aviso.
  if (escolhida && !tokenMorto && !semTempo && (!tarefas || tarefas.includes('ANALYZE'))) {
    await etapa('pagina', 'os Reels', async () => {
      const id = escolhida.pagina.id;
      let itens;
      try {
        const r = await cli.get(`/${id}/video_reels`, { fields: CAMPOS.reels, since: unixInicioSP(desde), limit: LIMITES.reels }, tokenPagina, 'meta:pagina:reels');
        itens = lista(r.data);
      } catch (e) {
        if (fatal(e)) throw e;
        avisar('Página: os Reels do Facebook ficaram fora (a Meta pede permissão de escrita para listá-los).');
        baseDaPagina().reels = null;
        return;
      }
      const reels = itens.map(lerReel).filter((x) => x && x.data && x.data >= desde).slice(0, LIMITES.reels);
      let parado = false;
      for (const reel of reels) {
        if (parado) break;
        try {
          const r = await cli.get(`/${reel.id}/video_insights`, { metric: REEL_FB.join(','), period: 'lifetime' }, tokenPagina, 'meta:pagina:reel');
          const ins = lerInsights(r);
          for (const [m, k] of Object.entries(NOMES_REEL)) if (ins[m]) reel[k] = valorDe(ins[m]);
        } catch (e) {
          if (fatal(e)) throw e;
          parado = true;
          avisar('Página: os números dos Reels do Facebook ficaram fora (a Meta pede permissão de escrita para eles).');
        }
      }
      baseDaPagina().reels = reels;
    }, { dado: false });
  }

  // ---------------------------------------------------------------- fecho --
  const em = agoraIso();
  const partes = {};
  for (const p of PARTES) {
    const s = situacao[p];
    if (tokenMorto) { partes[p] = parteMeta('reconectar', 'token_invalido', em); continue; }
    const f = s.falhas[0];
    if (!f) partes[p] = parteMeta(s.oks ? 'ok' : 'erro', s.oks ? null : 'sem_dado', s.em ?? em);
    else if (s.oks) partes[p] = parteMeta('parcial', f.motivo, s.em ?? em);
    else partes[p] = parteMeta(f.estado, f.motivo, s.em ?? em);
  }
  // Parte sem nenhum dado bom fica fora de `dados`: a coletora guarda o
  // retrato anterior dela em vez de trocá-lo por um vazio.
  for (const p of PARTES) if (!situacao[p].oks || tokenMorto) delete dados[p];

  const semanas = [];
  const publicacoes = [];
  if (!tokenMorto) {
    const pg = dados.pagina;
    const conta = dados.instagram;
    for (const [codigo, tem] of [[CANAL_FACEBOOK, pg], [CANAL_INSTAGRAM, conta]]) {
      if (tem && !canalAtivo(codigo)) avisar(`O canal ${codigo} não está ativo no Painel; os números e as publicações dele não foram gravados.`);
    }
    if (pg && canalAtivo(CANAL_FACEBOOK)) {
      semanas.push(...semanasFacebook(pg.por_semana ?? [], pg.seguidores ?? null, hoje, janela));
      for (const p of pg.posts ?? []) { const l = publicacaoDoPost(p); if (l) publicacoes.push(l); }
      for (const r of pg.reels ?? []) { const l = publicacaoDoReel(r); if (l) publicacoes.push(l); }
    }
    if (conta && canalAtivo(CANAL_INSTAGRAM)) {
      semanas.push(...semanasInstagram(conta.por_semana ?? [], conta.seguidores ?? null, hoje, janela));
      for (const m of [...(conta.midias ?? []), ...(conta.stories ?? [])]) { const l = publicacaoDaMidia(m); if (l) publicacoes.push(l); }
    }
  }
  // O mesmo link duas vezes no mesmo canal é a mesma publicação.
  const vistos = new Set();
  const unicas = publicacoes.filter((l) => {
    const k = `${l.canal}|${l.url}`;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });

  for (const p of PARTES) {
    const nomes = [...new Set([...recusadas[p]].map((k) => k.split('|')[1]))];
    if (nomes.length) avisar(`${ROTULO[p]}: a Meta recusou ${nomes.length === 1 ? 'a métrica' : 'as métricas'} ${nomes.join(', ')}; ${nomes.length === 1 ? 'ela fica' : 'elas ficam'} sem número.`);
  }

  let estado;
  const estados = PARTES.map((p) => partes[p].estado);
  if (tokenMorto) {
    estado = 'reconectar';
    avisos.clear();
    avisar('A Meta recusou o token (vencido, revogado ou trocado). Gere um token novo do usuário do sistema e atualize o secret META_TOKEN.');
  } else if (estados.every((e) => e === 'ok')) estado = 'ok';
  else if (estados.some((e) => e === 'ok' || e === 'parcial')) estado = 'parcial';
  else if (estados.every((e) => e === 'falta_conectar')) estado = 'falta_conectar';
  else estado = 'erro';

  const nomeConta = [escolhida?.pagina.nome, ig?.usuario ? `@${ig.usuario}` : null].filter(Boolean);
  const conta = tokenMorto ? null : nomeConta.length ? nomeConta.join(' e ') : contasAnuncio[0]?.nome ?? null;
  log(`meta: ${estado}, ${cli.chamadas()} chamadas, ${semanas.length} semanas, ${unicas.length} publicações`);

  return {
    estado, conta, partes,
    dados: tokenMorto ? {} : dados,
    semanas: tokenMorto ? [] : semanas,
    publicacoes: tokenMorto ? [] : unicas,
    avisos: [...avisos],
  };
}
