/* CONECTOR DO PINTEREST: a conta empresarial da Impresilk pela API REST v5.
 *
 * Contrato em docs/marketing/integracoes-contrato.md (seções 4 e 5). Quem
 * chama é a coletora painel-mkt-fontes, com o ctx descrito lá. A pesquisa da
 * fonte "pinterest" (especificação oficial 5.28.0 e documentação de outubro
 * de 2026, com contraprova) fica fora do repositório; onde levantamento e
 * contraprova discordam, valeu a contraprova.
 *
 * SÓ LEITURA. Toda chamada à API é GET. O token vai no cabeçalho
 * Authorization e nunca na URL (a URL pode parar em log ou mensagem de erro).
 * A única ida que não é GET é a renovação do token (POST no /oauth/token),
 * feita pelo renovar do mkt-oauth.mjs.
 *
 * POR QUE ASSIM:
 *  - Aprovação: o app só funciona depois do Trial access. Enquanto a fila do
 *    Pinterest não aprova (travada desde 08/2026, aviso oficial de 25/08),
 *    TODA chamada volta 401 com o código 3, "consumer type is not
 *    supported". Isso vira "aguardando_aprovacao" na primeira chamada, sem
 *    insistir; não é token morto, e "Reconectar" não resolveria.
 *  - Cota do Trial: 1000 chamadas por dia para o app inteiro. Cada execução
 *    tem um orçamento (ORCAMENTO_CHAMADAS), gasto por prioridade: o que
 *    alimenta os números da semana primeiro, a análise por Pin (1 chamada
 *    por Pin) por último. Se a coletora passar ctx.chamadasHoje, o orçamento
 *    encolhe para não estourar o dia.
 *  - Só 90 dias de passado nos analytics orgânicos: as 8 semanas fechadas
 *    cabem (no máximo 62 dias), e são recoletadas todo dia (idempotente).
 *  - Dias em UTC: o orgânico não tem parâmetro de fuso. A semana do Painel
 *    (segunda a domingo) soma 7 dias UTC; a diferença para Brasília é de 3
 *    horas na virada do dia. Os anúncios pedem o fuso da conta de anúncios
 *    (reporting_timezone saiu do beta em 04/2026).
 *  - Atraso de cerca de 48 h e dias com data_status ESTIMATE ou PROCESSING:
 *    a semana só vai para o banco quando os 7 dias vieram READY.
 *  - engagement_window_days está descontinuado (não devolve dado novo) e
 *    nunca é pedido; as janelas de atribuição dos anúncios são só clique
 *    (30 dias) e visualização (1 dia).
 *  - A análise de vários Pins de uma vez (GET /v5/pins/analytics) é beta
 *    fechada, e o relatório assíncrono de anúncios entrega um arquivo em
 *    outro endereço (que a coletora não busca, e não deve): os dois ficam de
 *    fora. A lista nominal de seguidores (GET /v5/user_account/followers)
 *    também: é só nome de usuário de terceiros, sem data, e não serve a
 *    nenhum número do Painel. O filtro from_claimed_content não é pedido à
 *    parte: as quebras SOURCE (seus Pins e os de outros) e OWNED_CONTENT já
 *    separam o conteúdo do site reivindicado. E a lista oficial de métricas
 *    (GET /v5/resources/delivery_metrics) não é consultada: a métrica que a
 *    API recusar é achada na hora (uma por uma) e vira aviso.
 *  - Regra de guarda (Developer Guidelines): a exceção literal cobre só a
 *    análise de anúncios; guardar números orgânicos e títulos é zona cinzenta
 *    (contraprova). O Painel é interno e do próprio dono; o título vai para
 *    as publicações por causa de GUARDAR_TITULO, que pode ser desligado sem
 *    mexer em mais nada. Todo Pin mostrado tem o link de volta para
 *    https://www.pinterest.com/pin/<id>/ (exigência das mesmas regras).
 *
 * ============================================================== FORMATO ==
 * O "dados" que a tela recebe (painel_cache, chave mkt_fonte_pinterest).
 * Cada chave de primeiro nível, menos "janela" e "cota", é uma PARTE: parte
 * que falhou não aparece aqui (a coletora mantém a da coleta anterior); parte
 * parcial traz só as chaves das etapas que rodaram (a coletora junta com as
 * de antes). Número não informado é null, nunca zero. Taxas vêm em fração
 * (0,08 = 8%). Partes: perfil, conta, top, pins, pastas, anuncios,
 * analise_pins, cada uma { estado, motivo?, codigo?, coletado_em }: estado
 * ok, parcial ou erro e, quando não é ok, motivo (FRASE para gente, em
 * português, para a tela mostrar como texto; ver MOTIVOS) e codigo (o código
 * curto do mesmo caso, nunca para mostrar: orcamento, prazo, cota,
 * reconectar, aprovacao, sem_permissao, sem_escopo, formato, nao_encontrado,
 * falhou, incompleto).
 *
 * M (as métricas, com os nomes do Painel; as que não vierem ficam null):
 *   { impressoes, engajamento, taxa_engajamento, cliques_pin, taxa_cliques_pin,
 *     cliques_saida, taxa_cliques_saida, salvamentos, taxa_salvamento,
 *     extras: { visitas_perfil, ampliacoes, video_visualizacoes, ... } | null }
 *   cliques_pin = abrir o Pin; cliques_saida = clicar e sair para o destino
 *   (o site). extras: o que a API mandar além das 9 métricas confirmadas
 *   (CLOSEUP, PROFILE_VISIT, VIDEO_*...), sem garantia de vir sempre; nome
 *   desconhecido fica com o nome da API.
 *
 * dados.janela = { hoje, inicio, fim, semanas: ['AAAA-MM-DD' (segundas, da
 *   mais nova para a mais velha)], fuso_dos_dias: 'UTC' }
 *   inicio = segunda de 8 semanas atrás; fim = ontem.
 * dados.cota = { orcamento, usadas, teto_dia: 1000 }
 *
 * dados.perfil = { id, usuario, nome, tipo_conta: 'BUSINESS' | 'PINNER' | null,
 *   sobre, foto, site, url: 'https://www.pinterest.com/<usuario>/',
 *   seguidores, seguindo, pins, pastas, visualizacoes_mensais }
 *   seguidores é o total de AGORA (a API não tem histórico); pins soma os
 *   criados e os salvos.
 *
 * dados.conta = {             // GET /v5/user_account/analytics, janela inicio..fim
 *   metricas_recusadas: ['NOME_DA_API'],     // a API recusou; ficaram null
 *   total: { resumo: M,                       // orgânico + pago (content_type ALL), como o painel do Pinterest
 *            por_dia: [{ dia, status, impressoes, engajamento, cliques_pin,
 *                        cliques_saida, salvamentos }],
 *                        // status: READY, ESTIMATE, PROCESSING, BEFORE_* (da API)
 *            semanas: [SEMANA] },
 *   organico: { resumo: M, semanas: [SEMANA] },     // content_type ORGANIC
 *   pago:     { resumo: M, semanas: [SEMANA] },     // content_type PAID
 *   quebras: { aparelho, origem, formato, conteudo_proprio },
 *       // cada uma: [{ grupo: 'MOBILE' | 'YOUR_PINS' | 'ORGANIC_IMAGE' ..., ...M }]
 *       // na janela inteira; a quebra que falhou fica AUSENTE
 * }
 * SEMANA = { semana, pronta, dias_com_dado, impressoes, engajamento, cliques_pin,
 *            cliques_saida, salvamentos, taxa_engajamento }
 *   soma dos 7 dias UTC; dia faltando deixa o número null. pronta: os 7 dias
 *   vieram READY (só aí a semana vai para o banco).
 *
 * dados.top = {               // os 50 melhores Pins
 *   semana:  TOP,             // última semana fechada, por engajamento
 *   periodo: TOP,             // a janela inteira (8 semanas e a atual), por engajamento
 *   video:   TOP,             // Pins de vídeo na janela inteira, por visualizações (VIDEO_MRC_VIEW)
 * }
 * TOP = { inicio, fim, ordem, dados_ate: ISO | null, tempo_real: bool | null,
 *         pins: [{ id, url, pronto: bool | null, ...M }] }
 *   (no vídeo, extras traz as métricas de vídeo). Lista que falhou fica ausente.
 *
 * dados.pins = {              // GET /v5/pins (só os Pins criados pela conta)
 *   total, completo: bool,    // completo false: passou do teto de páginas
 *   itens: [PIN],             // os MAX_PINS_DADOS mais novos (o total conta todos)
 *   do_site: {                // GET /v5/pins?domain=<domínio do site>
 *     dominio, total, completo, ids: [id],
 *     ultimos_90_dias: { impressoes, cliques_pin, cliques_saida },
 *     desde_sempre:    { impressoes, cliques_pin, cliques_saida },
 *     de_fora: [PIN]          // Pins do domínio que não são da lista acima (salvos)
 *   }                         // ausente se a chamada do domínio falhou
 * }
 * PIN = { id, url: 'https://www.pinterest.com/pin/<id>/', data (dia de São Paulo),
 *   criado_em, titulo, descricao (até 200 letras), destino (link do Pin),
 *   leva_ao_site: bool | null, pasta_id, tipo_criativo, tipo_midia, video: bool,
 *   promovido, imagem (miniatura https) | null, ia: bool | null,
 *   ultimos_90_dias: { impressoes, cliques_pin, cliques_saida } | null,
 *   desde_sempre: { impressoes, cliques_pin, cliques_saida, reacoes, comentarios } | null }
 *   desde_sempre só existe para Pins criados a partir de 20/03/2023.
 *
 * dados.pastas = { total, completo, itens: [{ id, nome, descricao, privacidade,
 *   pins, seguidores, colaboradores, criada_em, pins_alterados_em }] }
 *   (pasta secreta só aparece com o escopo boards:read_secret, que não é pedido)
 *
 * dados.analise_pins = {      // GET /v5/pins/{id}/analytics, 1 chamada por Pin
 *   inicio, fim,              // até 88 dias para trás
 *   pedidos, medidos,         // pedidos: Pins escolhidos; medidos: os que vieram
 *   itens: [{ id, url, video: bool, origem: 'recente' | 'top',
 *             soma: M & { comentarios, reacoes, seguidores_ganhos, visitas_perfil },
 *             engajamento_aprox,   // salvamentos + cliques_pin + cliques_saida
 *                                  // (o ENGAGEMENT não existe por Pin; aproximação)
 *             desde_sempre: { comentarios, reacoes } | null,
 *             semanas: [{ semana, pronta, impressoes, cliques_saida, cliques_pin,
 *                         salvamentos, seguidores_ganhos, visitas_perfil,
 *                         video_visualizacoes }] }],
 *   seguidores_por_semana: [{ semana, ganhos, pins_medidos }]
 *       // USER_FOLLOW somado só dos Pins medidos: piso, não o total da conta
 * }
 *   Escolha: os Pins criados nos últimos 90 dias (mais novos primeiro) e os
 *   que estão nos tops, até MAX_ANALISE_PINS. Vídeo pede a lista de vídeo
 *   (sem USER_FOLLOW e PROFILE_VISIT, que lá não existem).
 *
 * dados.anuncios = {          // só com o escopo ads:read
 *   observacao: texto | null, // por exemplo "sem conta de anúncios"
 *   contas: [{ id, nome, moeda, pais, fuso, fuso_dos_dias: 'conta' | 'UTC',
 *     colunas_recusadas: bool,
 *     resumo: A, por_dia: [A & { dia }], semanas: [A & { semana }],
 *     campanhas: [{ id, nome, situacao, objetivo, limite_diario, limite_total,
 *                   inicio, fim, ...A }] | null,
 *     publico: { total: PUBLICO | null, engajado: PUBLICO | null } }]
 * }
 * A = { gasto, impressoes_pagas, impressoes_total, alcance_pago, cliques, cliques_saida,
 *       engajamento, salvamentos, leads, leads_tag, conversoes, sessoes_site,
 *       visitas_pagina, video_visualizacoes, ctr, cpc, cpm, custo_por_lead }
 *   gasto, cpc, cpm e custo_por_lead na moeda da conta; o Pinterest omite a
 *   linha do dia sem entrega, e esse dia vale ZERO (FAQ oficial). alcance_pago
 *   é de pessoas únicas no DIA e não é somado na semana. ctr em fração.
 * PUBLICO = { tamanho, tamanho_e_teto, data, idades, generos, paises, regioes,
 *   aparelhos: [{ chave, nome, proporcao }], interesses: [{ chave, nome,
 *   proporcao, indice, subcategorias: [...] }] }
 *   tamanho de YOUR_TOTAL_AUDIENCE é o "alcance" móvel de 30 dias (pessoas
 *   únicas, orgânico e anúncio); NÃO vai para os números da semana.
 *
 * NÚMEROS DA SEMANA (canal pinterest, 8 semanas FECHADAS, só o que foi
 * medido; número ausente nem vai, para não apagar o lançado à mão):
 *   impressoes   soma de IMPRESSION dos 7 dias (content_type ALL)
 *   engajamento  soma de ENGAGEMENT (salvamentos, cliques no Pin, cliques de
 *                saída, deslizes de carrossel e cliques em coleções)
 *   cliques      soma de OUTBOUND_CLICK (cliques que saem do Pinterest)
 *                os três só quando os 7 dias vieram READY
 *   seguidores   follower_count de agora, só na semana que acabou de fechar e
 *                só se a coleta roda na SEGUNDA logo depois dela (a API não dá
 *                o número de um domingo passado; o de segunda é o retrato mais
 *                perto do domingo, e a coleta de terça trocaria esse retrato
 *                por um com a segunda inteira de outra semana dentro)
 *   leads        soma de LEADS dos anúncios, só na semana que teve lead, ou
 *                que cruza o período de uma campanha de objetivo LEAD (do
 *                start_time ao end_time; sem end_time, sem fim) E em que a
 *                conta entregou anúncio (gasto, impressão paga, clique). Fora
 *                disso a chave nem vai: antes da campanha, depois que ela
 *                acaba ou enquanto ela não roda, o "zero" seria "não havia
 *                campanha no ar" e passaria por cima do lançado à mão. Com
 *                a leitura dos anúncios incompleta (uma conta falhou, coluna
 *                LEADS recusada), leads não vai em semana nenhuma
 *   alcance e conversas: a API orgânica não tem; nunca vão.
 * PUBLICAÇÕES: os Pins criados pela conta (todos que a paginação alcançar),
 * url sempre no formato canônico https://www.pinterest.com/pin/<id>/
 * (linkCanonicoDoPin: br.pinterest.com, pinterest.com.br, sem www, m. ou com
 * rastreio são o mesmo Pin e saem assim), data de criação no dia de São
 * Paulo, titulo (o title do Pin), impressoes = impressões desde sempre e
 * cliques = cliques de saída desde sempre. Pin sem números desde sempre (antes
 * de 20/03/2023) vai sem números. engajamento não vai: o "desde sempre" não
 * tem salvamentos, e uma soma sem eles pareceria o engajamento do Pinterest.
 * ========================================================================= */
import { somarDias, segundaDaSemana, hojeSP, normalizarLink } from '../marketing.mjs';
import { renovar } from '../mkt-oauth.mjs';

export const FONTE = 'pinterest';
export const SECRETS = ['PINTEREST_CLIENT_ID', 'PINTEREST_CLIENT_SECRET'];
export const BASE = 'https://api.pinterest.com/v5';
export const CANAL = 'pinterest';

// Trial: 1000 chamadas por dia para o app, somando tudo. Uma execução usa
// no máximo 120; a reserva deixa o "Atualizar agora" funcionar no mesmo dia.
export const TETO_DIA = 1000;
export const ORCAMENTO_CHAMADAS = 120;
const RESERVA_DIA = 100;
export const SEMANAS = 8;
// A análise por Pin aceita até 90 dias para trás. Com 88, a virada do dia em
// UTC (3 horas antes de São Paulo) nunca empurra o pedido para fora.
export const DIAS_ANALISE_PINS = 88;
export const DIAS_PINS_RECENTES = 90;
export const MAX_ANALISE_PINS = 40;
export const TAMANHO_PAGINA = 250;
export const MAX_PAGINAS_PINS = 8;
export const MAX_PAGINAS_SITE = 4;
export const MAX_PAGINAS_PASTAS = 2;
export const MAX_PAGINAS_CAMPANHAS = 2;
export const MAX_CONTAS_ANUNCIO = 2;
// O "dados" vai inteiro para a tela a cada abertura: a lista guarda os mais
// novos, e as publicações (tabela própria) levam todos.
export const MAX_PINS_DADOS = 300;
const MAX_CAMPANHAS_ANALISE = 250;
// O domínio do site, se o canal "site" não tiver endereço.
export const DOMINIO_PADRAO = 'impresilk.com.br';
// Ver "Regra de guarda" no topo.
export const GUARDAR_TITULO = true;

// Cada chamada pode levar 20 s e repetir em 429 e 5xx: com menos que isto de
// prazo, a próxima não começa (o estado vira "parcial").
const FOLGA_PRAZO_MS = 25_000;
// Token que vence nos próximos 15 minutos não termina a coleta.
const ULTIMOS_MINUTOS_MS = 15 * 60_000;
const MAX_NUMERO = 1e9;

// As 9 métricas da conta que o filtro metric_types aceita (contraprova).
export const METRICAS_CONTA = Object.freeze(['IMPRESSION', 'ENGAGEMENT', 'ENGAGEMENT_RATE', 'PIN_CLICK', 'PIN_CLICK_RATE', 'OUTBOUND_CLICK', 'OUTBOUND_CLICK_RATE', 'SAVE', 'SAVE_RATE']);
// Por Pin, metric_types é obrigatório e é UMA de duas listas (contraprova):
// a de vídeo não tem USER_FOLLOW nem PROFILE_VISIT. Misturar não é confirmado.
export const METRICAS_PIN = Object.freeze(['IMPRESSION', 'OUTBOUND_CLICK', 'PIN_CLICK', 'SAVE', 'SAVE_RATE', 'TOTAL_COMMENTS', 'TOTAL_REACTIONS', 'USER_FOLLOW', 'PROFILE_VISIT']);
export const METRICAS_PIN_VIDEO = Object.freeze(['IMPRESSION', 'OUTBOUND_CLICK', 'PIN_CLICK', 'SAVE', 'SAVE_RATE', 'VIDEO_MRC_VIEW', 'VIDEO_10S_VIEW', 'QUARTILE_95_PERCENT_VIEW', 'VIDEO_V50_WATCH_TIME', 'VIDEO_START', 'VIDEO_AVG_WATCH_TIME', 'TOTAL_COMMENTS', 'TOTAL_REACTIONS']);
// As quatro que existem nas duas listas: o recuo quando a lista é recusada.
export const METRICAS_PIN_BASICAS = Object.freeze(['IMPRESSION', 'OUTBOUND_CLICK', 'PIN_CLICK', 'SAVE']);
export const METRICAS_TOP = Object.freeze(['IMPRESSION', 'ENGAGEMENT', 'PIN_CLICK', 'OUTBOUND_CLICK', 'SAVE']);
export const METRICAS_TOP_VIDEO = Object.freeze(['IMPRESSION', 'SAVE', 'OUTBOUND_CLICK', 'VIDEO_MRC_VIEW', 'VIDEO_AVG_WATCH_TIME', 'VIDEO_V50_WATCH_TIME', 'QUARTILE_95_PERCENT_VIEW', 'VIDEO_10S_VIEW', 'VIDEO_START']);
export const QUEBRAS = Object.freeze([['APP_TYPE', 'aparelho'], ['SOURCE', 'origem'], ['PIN_FORMAT', 'formato'], ['OWNED_CONTENT', 'conteudo_proprio']]);
const ROTULO_QUEBRA = { aparelho: 'aparelho', origem: 'origem', formato: 'formato do Pin', conteudo_proprio: 'conteúdo próprio' };

// Colunas de anúncio que somam. As taxas (CTR, CPC, CPM, custo por lead) são
// calculadas da soma: média de taxa diária não é a taxa da semana.
export const COLUNAS_ANUNCIO = Object.freeze({
  SPEND_IN_MICRO_DOLLAR: 'gasto',
  PAID_IMPRESSION: 'impressoes_pagas',
  TOTAL_IMPRESSION: 'impressoes_total',
  TOTAL_IMPRESSION_USER: 'alcance_pago',
  TOTAL_CLICKTHROUGH: 'cliques',
  OUTBOUND_CLICK_1: 'cliques_saida',
  TOTAL_ENGAGEMENT: 'engajamento',
  REPIN_1: 'salvamentos',
  LEADS: 'leads',
  TOTAL_LEAD: 'leads_tag',
  TOTAL_CONVERSIONS: 'conversoes',
  TOTAL_WEB_SESSIONS: 'sessoes_site',
  TOTAL_PAGE_VISIT: 'visitas_pagina',
  TOTAL_VIDEO_MRC_VIEWS: 'video_visualizacoes',
});
const COLUNAS_ANUNCIO_BASICAS = Object.freeze(['SPEND_IN_MICRO_DOLLAR', 'PAID_IMPRESSION', 'TOTAL_CLICKTHROUGH']);
export const COLUNAS_CAMPANHA = Object.freeze(['SPEND_IN_MICRO_DOLLAR', 'PAID_IMPRESSION', 'TOTAL_CLICKTHROUGH', 'OUTBOUND_CLICK_1', 'TOTAL_ENGAGEMENT', 'LEADS', 'TOTAL_CONVERSIONS']);
// Pessoas únicas no dia: somar dias contaria a mesma pessoa várias vezes.
const NAO_SOMA_NA_SEMANA = new Set(['alcance_pago']);

const ESCOPO_CONTA = 'user_accounts:read';
const ESCOPO_PINS = 'pins:read';
const ESCOPO_PASTAS = 'boards:read';
const ESCOPO_ANUNCIOS = 'ads:read';

// ------------------------------------------------------------ miudezas --

const lista = (x) => (Array.isArray(x) ? x : []);
const objeto = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const num = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(v)) return Number(v);
  return null;
};
// Contagem: 0 a 1 bilhão. O Pinterest manda -1 em monthly_views quando a
// conta esconde o número; isso é "não informado", não zero.
const contagem = (v) => { const n = num(v); return n != null && n >= 0 && n <= MAX_NUMERO ? n : null; };
const inteiroValido = (v) => { const n = num(v); return n != null && Number.isInteger(n) && n >= 0 && n <= MAX_NUMERO ? n : null; };
const CONTROLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const texto = (v, max = 200) => (typeof v === 'string' && v.trim() ? v.replace(CONTROLE, '').replace(/\s+/g, ' ').trim().slice(0, max) : null);
const enc = encodeURIComponent;
const arred = (v, casas = 4) => (v == null ? null : Math.round(v * 10 ** casas) / 10 ** casas);
const taxa = (parte, todo) => (parte == null || !todo ? null : arred(parte / todo));
const ID_VALIDO = /^[0-9A-Za-z_-]{1,40}$/;
const idValido = (v) => {
  const s = typeof v === 'number' && Number.isInteger(v) ? String(v) : v;
  return typeof s === 'string' && ID_VALIDO.test(s) ? s : null;
};
const urlHttps = (v) => {
  if (typeof v !== 'string' || v.length > 1000) return null;
  try { return new URL(v).protocol === 'https:' ? v : null; } catch { return null; }
};
function dataValida(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

/** Instante em milissegundos: aceita ISO, segundos ou milissegundos. O
 *  exemplo oficial do Pin traz created_at SEM fuso ("2020-01-01T20:10:40"),
 *  e o Date.parse leria isso na hora local do servidor: sem fuso, é UTC. */
export function instante(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.abs(v) < 1e12 ? v * 1000 : v;
  if (typeof v === 'string' && v) {
    if (/^\d+$/.test(v)) return instante(Number(v));
    const s = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(v) ? `${v}Z` : v;
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}
const isoDe = (v) => { const t = instante(v); return t != null && Math.abs(t) <= 8.64e15 ? new Date(t).toISOString() : null; };
// O dia de São Paulo de um instante (a data da publicação, como nas outras fontes).
const diaSP = (v) => { const t = instante(v); return t != null && Math.abs(t) <= 8.64e15 ? hojeSP(new Date(t)) : null; };

/** O endereço do Pin no Pinterest: o formato das Developer Guidelines
 *  (confirmado na contraprova), com a barra do fim. */
export const linkDoPin = (id) => `https://www.pinterest.com/pin/${id}/`;

/** O mesmo Pin tem vários endereços: br.pinterest.com (o que o navegador
 *  mostra no Brasil), pinterest.com.br, sem www, m., com rastreio, sem a
 *  barra do fim. A chave da publicação é canal + url, então todo Pin que sai
 *  daqui vai no formato canônico, https://www.pinterest.com/pin/<id>/ (revisão
 *  2). Recebe o id ou um endereço de Pin; o que não for Pin vira null. */
export function linkCanonicoDoPin(valor) {
  const s = typeof valor === 'number' && Number.isInteger(valor) ? String(valor) : typeof valor === 'string' ? valor.trim() : '';
  if (ID_VALIDO.test(s)) return linkDoPin(s);
  let u;
  try { u = new URL(s); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || !/(^|\.)pinterest\.[a-z]{2,3}(\.[a-z]{2})?$/i.test(u.hostname)) return null;
  const m = /^\/pin\/([0-9A-Za-z_-]{1,40})\/?$/.exec(u.pathname);
  return m ? linkDoPin(m[1]) : null;
}

/** As 8 semanas FECHADAS (segunda-feira de cada), da mais nova para a mais velha. */
export function semanasFechadas(hoje, n = SEMANAS) {
  const atual = segundaDaSemana(hoje);
  return Array.from({ length: n }, (_, i) => somarDias(atual, -7 * (i + 1)));
}

/** O canal do Pinterest entre os ativos: pelo código, ou pelo link do perfil. */
export function acharCanal(canais) {
  const todos = lista(canais);
  return todos.find((c) => c?.codigo === CANAL)
    || todos.find((c) => { try { return /(^|\.)pinterest\.[a-z.]+$/i.test(new URL(c?.url_perfil).hostname); } catch { return false; } })
    || null;
}

/** O domínio do site para o filtro domain= do GET /v5/pins: o do canal
 *  "site", sem www (o filtro quer o domínio exato, sem www). */
export function dominioDoSite(canais) {
  const site = lista(canais).find((c) => c?.codigo === 'site');
  try {
    const h = new URL(site?.url_perfil || '').hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h)) return h;
  } catch { /* sem endereço */ }
  return DOMINIO_PADRAO;
}

/** Escopos guardados na conexão (lista ou texto). Sem lista, não julga. */
export function lerEscopos(v) {
  const itens = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[\s,]+/) : [];
  const s = new Set(itens.map((x) => String(x).trim()).filter(Boolean));
  return s.size ? s : null;
}

/** Monta a URL da API. Listas vão separadas por vírgula (o jeito do v5). */
export function montarUrl(caminho, params = {}) {
  const pares = [];
  for (const [k, v] of Object.entries(params || {})) {
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue;
    const valor = Array.isArray(v) ? v.join(',') : String(v);
    pares.push(`${enc(k)}=${enc(valor).replace(/%2C/gi, ',')}`);
  }
  return `${BASE}${caminho}${pares.length ? `?${pares.join('&')}` : ''}`;
}

/** Quantas chamadas esta execução pode gastar. */
export function orcamentoDaRodada(chamadasHoje) {
  const usadas = num(chamadasHoje);
  if (usadas == null) return ORCAMENTO_CHAMADAS;
  return Math.max(0, Math.min(ORCAMENTO_CHAMADAS, TETO_DIA - RESERVA_DIA - usadas));
}

// ------------------------------------------------------------ métricas --

// Nome da API para o nome do Painel. As 9 primeiras são as confirmadas da
// conta; o resto aparece no exemplo oficial ou na análise por Pin.
const NOMES = Object.freeze({
  IMPRESSION: 'impressoes', ENGAGEMENT: 'engajamento', ENGAGEMENT_RATE: 'taxa_engajamento',
  PIN_CLICK: 'cliques_pin', PIN_CLICK_RATE: 'taxa_cliques_pin',
  OUTBOUND_CLICK: 'cliques_saida', OUTBOUND_CLICK_RATE: 'taxa_cliques_saida',
  SAVE: 'salvamentos', SAVE_RATE: 'taxa_salvamento',
  CLOSEUP: 'ampliacoes', CLOSEUP_RATE: 'taxa_ampliacoes', PROFILE_VISIT: 'visitas_perfil',
  USER_FOLLOW: 'seguidores_ganhos', TOTAL_COMMENTS: 'comentarios', TOTAL_REACTIONS: 'reacoes',
  VIDEO_MRC_VIEW: 'video_visualizacoes', VIDEO_START: 'video_inicios', VIDEO_10S_VIEW: 'video_10s',
  QUARTILE_95_PERCENT_VIEW: 'video_95', VIDEO_AVG_WATCH_TIME: 'video_tempo_medio', VIDEO_V50_WATCH_TIME: 'video_tempo_v50',
});
const BASICOS = Object.freeze(['impressoes', 'engajamento', 'taxa_engajamento', 'cliques_pin', 'taxa_cliques_pin', 'cliques_saida', 'taxa_cliques_saida', 'salvamentos', 'taxa_salvamento']);
const DO_DIA = Object.freeze(['impressoes', 'engajamento', 'cliques_pin', 'cliques_saida', 'salvamentos']);

/** As métricas no formato M: as 9 básicas sempre presentes (null quando não
 *  vieram) e o resto em "extras". Valor que não é número (ou é negativo)
 *  vira null: o Pinterest não manda contagem negativa de propósito. */
export function traduzirMetricas(m) {
  const fora = {};
  for (const k of BASICOS) fora[k] = null;
  const extras = {};
  for (const [k, v] of Object.entries(objeto(m) ? m : {})) {
    if (!/^[A-Z0-9_]{1,60}$/.test(k)) continue;
    const n = contagem(v);
    const nome = NOMES[k] || k;
    if (BASICOS.includes(nome)) fora[nome] = n;
    else extras[nome] = n;
  }
  fora.extras = Object.keys(extras).length ? extras : null;
  return fora;
}

// "Pronto" é READY. Status ausente (a API não mandou o campo) não reprova o
// dia: a pesquisa só confirma a lista de valores, não que venha sempre.
const statusPronto = (s) => s == null || s === 'READY';

/** Os grupos de uma resposta de analytics. A chave de cada grupo é o nome do
 *  grupo do split (a documentação só mostra "property1"; sem split, o nome
 *  não é confirmado), por isso a leitura é por Object.entries. Resposta sem
 *  grupo (daily_metrics no topo) também vale. */
export function gruposDaAnalise(resp) {
  if (!objeto(resp)) return [];
  if (Array.isArray(resp.daily_metrics) || objeto(resp.summary_metrics)) return [['ALL', resp]];
  return Object.entries(resp).filter(([, g]) => objeto(g) && (Array.isArray(g.daily_metrics) || objeto(g.summary_metrics) || objeto(g.lifetime_metrics)));
}

function lerGrupo(g) {
  const porDia = new Map();
  for (const d of lista(g?.daily_metrics)) {
    if (!objeto(d) || !dataValida(d.date)) continue;
    const m = traduzirMetricas(d.metrics);
    porDia.set(d.date, { dia: d.date, status: typeof d.data_status === 'string' ? d.data_status : null, ...m });
  }
  return { resumo: objeto(g?.summary_metrics) ? traduzirMetricas(g.summary_metrics) : null, porDia };
}

/** user_account/analytics (e pins/{id}/analytics) sem split: o grupo único.
 *  Com mais de um grupo, prefere o que se chama ALL. */
export function lerAnalise(resp) {
  const grupos = gruposDaAnalise(resp);
  if (!grupos.length) return null;
  const [, g] = grupos.find(([k]) => /^all$/i.test(k)) || grupos[0];
  const lido = lerGrupo(g);
  const vida = objeto(g.lifetime_metrics) ? traduzirMetricas(g.lifetime_metrics) : null;
  return { ...lido, vida: vida ? { comentarios: vida.extras?.comentarios ?? null, reacoes: vida.extras?.reacoes ?? null } : null };
}

/** A quebra (split_field): um M por grupo, na janela inteira. Sem resumo do
 *  grupo, soma os dias (só as contagens; taxa de dia não soma). */
export function lerQuebra(resp) {
  return gruposDaAnalise(resp).map(([grupo, g]) => {
    const { resumo, porDia } = lerGrupo(g);
    if (resumo) return { grupo, ...resumo };
    const m = traduzirMetricas({});
    for (const k of DO_DIA) {
      let s = null;
      for (const d of porDia.values()) if (d[k] != null) s = (s ?? 0) + d[k];
      m[k] = s;
    }
    return { grupo, ...m };
  });
}

/** O dia na série de dados.conta.total.por_dia (só as contagens). */
const linhaDoDia = (d) => {
  const fora = { dia: d.dia, status: d.status };
  for (const k of DO_DIA) fora[k] = d[k] ?? null;
  return fora;
};

/** A semana somada: dia faltando (ou número faltando num dia) deixa aquele
 *  número null; pronta só com os 7 dias READY. */
export function resumoDaSemana(porDia, semana, campos = DO_DIA) {
  const dias = Array.from({ length: 7 }, (_, i) => porDia.get(somarDias(semana, i)) || null);
  const presentes = dias.filter(Boolean);
  const fora = { semana, pronta: presentes.length === 7 && presentes.every((d) => statusPronto(d.status)), dias_com_dado: presentes.length };
  for (const k of campos) {
    fora[k] = presentes.length === 7 && presentes.every((d) => d[k] != null) ? presentes.reduce((s, d) => s + d[k], 0) : null;
  }
  if (campos.includes('engajamento')) fora.taxa_engajamento = taxa(fora.engajamento, fora.impressoes);
  return fora;
}

// ----------------------------------------------- leitura de respostas --

/** GET /v5/user_account. */
export function lerPerfil(resp) {
  if (!objeto(resp)) return null;
  const usuario = texto(resp.username, 100);
  return {
    id: idValido(resp.id),
    usuario,
    nome: texto(resp.business_name, 200),
    tipo_conta: texto(resp.account_type, 30),
    sobre: texto(resp.about, 500),
    foto: urlHttps(resp.profile_image),
    site: texto(resp.website_url, 300),
    url: usuario && /^[A-Za-z0-9_.-]{1,100}$/.test(usuario) ? `https://www.pinterest.com/${usuario}/` : null,
    seguidores: inteiroValido(resp.follower_count),
    seguindo: inteiroValido(resp.following_count),
    pins: inteiroValido(resp.pin_count),
    pastas: inteiroValido(resp.board_count),
    visualizacoes_mensais: inteiroValido(resp.monthly_views),
  };
}

function miniatura(media) {
  if (!objeto(media)) return null;
  const imgs = objeto(media.images) ? media.images : {};
  for (const k of ['400x300', '600x', '236x', '150x150', '1200x', 'originals']) {
    const u = urlHttps(imgs[k]?.url);
    if (u) return u;
  }
  for (const v of Object.values(imgs)) { const u = urlHttps(v?.url); if (u) return u; }
  return urlHttps(media.cover_image_url) || urlHttps(lista(media.items)[0]?.images?.['400x300']?.url) || null;
}

const hostDe = (u) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch { return null; } };

/** Um Pin do GET /v5/pins. `dominio` marca leva_ao_site pelo destino. */
export function lerPin(p, dominio = null) {
  if (!objeto(p)) return null;
  const id = idValido(p.id);
  if (!id) return null;
  const tipoCriativo = texto(p.creative_type, 40);
  const tipoMidia = texto(p.media?.media_type, 40);
  const destino = urlHttps(p.link) || (typeof p.link === 'string' && /^http:\/\//.test(p.link) ? p.link.slice(0, 1000) : null);
  const host = destino ? hostDe(destino) : null;
  const m90 = objeto(p.pin_metrics?.['90d']) ? p.pin_metrics['90d'] : null;
  const vida = objeto(p.pin_metrics?.lifetime_metrics) ? p.pin_metrics.lifetime_metrics : null;
  // ai_disclosures: o formato do campo não está na pesquisa (só o nome).
  // Lista com algo, objeto com algum valor ligado ou true: "tem aviso de IA".
  const d = p.ai_disclosures;
  const ia = typeof d === 'boolean' ? d
    : Array.isArray(d) ? d.length > 0
      : objeto(d) ? Object.values(d).some((v) => v === true || (typeof v === 'string' && v.trim() !== ''))
        : null;
  return {
    id,
    url: linkDoPin(id),
    data: diaSP(p.created_at),
    criado_em: isoDe(p.created_at),
    titulo: texto(p.title, 200),
    descricao: texto(p.description, 200),
    destino,
    leva_ao_site: dominio ? (host ? host === dominio || host.endsWith(`.${dominio}`) : false) : null,
    pasta_id: idValido(p.board_id),
    tipo_criativo: tipoCriativo,
    tipo_midia: tipoMidia,
    video: /VIDEO/i.test(tipoCriativo || '') || /video/i.test(tipoMidia || ''),
    promovido: typeof p.has_been_promoted === 'boolean' ? p.has_been_promoted : null,
    dono: typeof p.is_owner === 'boolean' ? p.is_owner : null,
    imagem: miniatura(p.media),
    ia,
    ultimos_90_dias: m90 ? { impressoes: contagem(m90.impression), cliques_pin: contagem(m90.pin_click), cliques_saida: contagem(m90.clickthrough) } : null,
    desde_sempre: vida ? {
      impressoes: contagem(vida.impression), cliques_pin: contagem(vida.pin_click), cliques_saida: contagem(vida.clickthrough),
      reacoes: contagem(vida.reaction), comentarios: contagem(vida.comment),
    } : null,
  };
}

/** Uma página do GET /v5/pins (ou boards, campanhas): itens e o bookmark. */
export function lerPagina(resp) {
  const bookmark = typeof resp?.bookmark === 'string' && resp.bookmark ? resp.bookmark : null;
  return { itens: lista(resp?.items), bookmark };
}

/** top_pins e top_video_pins. */
export function lerTop(resp) {
  if (!objeto(resp)) return null;
  const disp = objeto(resp.date_availability) ? resp.date_availability : {};
  const pins = [];
  for (const p of lista(resp.pins)) {
    const id = idValido(p?.pin_id ?? p?.id);
    if (!id || pins.some((x) => x.id === id)) continue;
    const st = p.data_status;
    const pronto = typeof st === 'string' ? st === 'READY'
      : objeto(st) && Object.keys(st).length ? Object.values(st).every((v) => v === 'READY') : null;
    pins.push({ id, url: linkDoPin(id), pronto, ...traduzirMetricas(p.metrics) });
  }
  return {
    ordem: texto(resp.sort_by, 40),
    dados_ate: isoDe(disp.latest_available_timestamp),
    tempo_real: typeof disp.is_realtime === 'boolean' ? disp.is_realtime : null,
    pins,
  };
}

/** Uma pasta do GET /v5/boards. */
export function lerPasta(b) {
  if (!objeto(b)) return null;
  const id = idValido(b.id);
  if (!id) return null;
  return {
    id,
    nome: texto(b.name, 200),
    descricao: texto(b.description, 200),
    privacidade: texto(b.privacy, 30),
    pins: inteiroValido(b.pin_count),
    seguidores: inteiroValido(b.follower_count),
    colaboradores: inteiroValido(b.collaborator_count),
    criada_em: isoDe(b.created_at),
    pins_alterados_em: isoDe(b.board_pins_modified_at),
  };
}

/** Uma conta de anúncio do GET /v5/ad_accounts. */
export function lerContaAnuncio(a) {
  if (!objeto(a)) return null;
  const id = typeof a.id === 'string' && /^\d{1,30}$/.test(a.id) ? a.id : typeof a.id === 'number' && Number.isInteger(a.id) ? String(a.id) : null;
  if (!id) return null;
  return { id, nome: texto(a.name, 200), moeda: texto(a.currency, 10), pais: texto(a.country, 10), fuso: texto(a.time_zone, 60) };
}

const dinheiroDeMicro = (v) => { const n = num(v); return n == null || n < 0 ? null : Math.round(n / 1e4) / 100; };

// Linha de anúncio no formato A, com as taxas tiradas da soma.
function comTaxas(a) {
  a.ctr = taxa(a.cliques, a.impressoes_pagas);
  a.cpc = a.gasto == null || !a.cliques ? null : arred(a.gasto / a.cliques, 2);
  a.cpm = a.gasto == null || !a.impressoes_pagas ? null : arred((a.gasto / a.impressoes_pagas) * 1000, 2);
  a.custo_por_lead = a.gasto == null || !a.leads ? null : arred(a.gasto / a.leads, 2);
  return a;
}
const NOMES_ANUNCIO = Object.values(COLUNAS_ANUNCIO);
function linhaAnuncio(linha, colunas) {
  const a = {};
  for (const nome of NOMES_ANUNCIO) a[nome] = null;
  for (const col of colunas) {
    const nome = COLUNAS_ANUNCIO[col];
    if (!nome) continue;
    // Coluna pedida que a linha não trouxe: zero (o Pinterest só manda o que
    // tem valor). Linha null (dia que nem veio) também: tudo zero.
    const bruto = linha ? linha[col] : 0;
    const v = bruto == null ? 0 : col === 'SPEND_IN_MICRO_DOLLAR' ? dinheiroDeMicro(bruto) : contagem(bruto);
    a[nome] = v;
  }
  return a;
}

/** ad_accounts/{id}/analytics com granularity DAY: um A por dia da janela.
 *  O dia que não veio é ZERO (a FAQ oficial: só vêm linhas com dado), mas só
 *  das colunas pedidas; as outras ficam null. */
export function lerAnunciosPorDia(resp, colunas, inicio, fim) {
  const linhas = Array.isArray(resp) ? resp : lista(resp?.items ?? resp?.data);
  const porData = new Map();
  for (const l of linhas) {
    const dia = typeof l?.DATE === 'string' ? l.DATE.slice(0, 10) : null;
    if (dia && dataValida(dia)) porData.set(dia, l);
  }
  const porDia = new Map();
  for (let d = inicio; d <= fim; d = somarDias(d, 1)) porDia.set(d, { dia: d, ...comTaxas(linhaAnuncio(porData.get(d) || null, colunas)) });
  return porDia;
}

/** A soma de vários A (semana ou janela), com as taxas recalculadas. */
export function somarAnuncios(linhasA) {
  const a = {};
  for (const nome of NOMES_ANUNCIO) {
    if (NAO_SOMA_NA_SEMANA.has(nome)) { a[nome] = null; continue; }
    let s = 0, algum = false, falta = false;
    for (const l of linhasA) { if (l[nome] == null) falta = true; else { s += l[nome]; algum = true; } }
    a[nome] = algum && !falta ? (nome === 'gasto' ? arred(s, 2) : s) : null;
  }
  return comTaxas(a);
}

/** Uma campanha do GET /v5/ad_accounts/{id}/campaigns. */
export function lerCampanha(c) {
  if (!objeto(c)) return null;
  const id = typeof c.id === 'string' && /^\d{1,30}$/.test(c.id) ? c.id : typeof c.id === 'number' && Number.isInteger(c.id) ? String(c.id) : null;
  if (!id) return null;
  return {
    id,
    nome: texto(c.name, 200),
    situacao: texto(c.status, 30),
    objetivo: texto(c.objective_type, 40),
    limite_diario: dinheiroDeMicro(c.daily_spend_cap),
    limite_total: dinheiroDeMicro(c.lifetime_spend_cap),
    inicio: isoDe(c.start_time),
    fim: isoDe(c.end_time),
  };
}

/** campaigns/analytics com granularity TOTAL: um A por campanha. Campanha
 *  que não voltou na resposta teve zero (mesma regra das linhas omitidas). */
export function lerAnaliseCampanhas(resp, ids, colunas) {
  const linhas = Array.isArray(resp) ? resp : lista(resp?.items ?? resp?.data);
  const porId = new Map();
  for (const l of linhas) {
    const id = l?.CAMPAIGN_ID != null ? String(l.CAMPAIGN_ID) : null;
    if (id) porId.set(id, l);
  }
  const fora = new Map();
  for (const id of ids) fora.set(id, comTaxas(linhaAnuncio(porId.get(id) || null, colunas)));
  return fora;
}

function lerFatias(v, max = 15) {
  return lista(v).map((x) => ({ chave: texto(x?.key, 80), nome: texto(x?.name, 120), proporcao: num(x?.ratio) }))
    .filter((x) => x.chave || x.nome).slice(0, max);
}

/** audience_insights: tamanho do público e o perfil (idade, gênero, país,
 *  cidade, aparelho, interesses). */
export function lerPublico(resp) {
  if (!objeto(resp)) return null;
  const dem = objeto(resp.demographics) ? resp.demographics : {};
  return {
    tipo: texto(resp.type, 40),
    data: texto(resp.date, 30),
    tamanho: inteiroValido(resp.size),
    tamanho_e_teto: typeof resp.size_is_upper_bound === 'boolean' ? resp.size_is_upper_bound : null,
    idades: lerFatias(dem.ages),
    generos: lerFatias(dem.genders),
    paises: lerFatias(dem.countries),
    regioes: lerFatias(dem.metros),
    aparelhos: lerFatias(dem.devices),
    interesses: lista(resp.categories).map((c) => ({
      chave: texto(c?.key, 80), nome: texto(c?.name, 120), proporcao: num(c?.ratio), indice: num(c?.index),
      subcategorias: lista(c?.subcategories).map((s) => ({ chave: texto(s?.key, 80), nome: texto(s?.name, 120), proporcao: num(s?.ratio), indice: num(s?.index) })).slice(0, 5),
    })).filter((c) => c.chave || c.nome).slice(0, 15),
  };
}

// --------------------------------------------------- erro e chamadas --

/** O que deu errado numa chamada, a partir do ErroFonte da coletora (status,
 *  codigo, corpo) ou de um erro qualquer com status. Nada do texto do
 *  provedor sai daqui. */
export function lerFalha(e) {
  let status = num(e?.status) ?? num(e?.statusCode) ?? num(e?.response?.status);
  if (status == null) { const m = /\b([45]\d\d)\b/.exec(String(e?.message ?? '')); if (m) status = Number(m[1]); }
  const corpo = e?.corpo ?? e?.body ?? e?.dados ?? null;
  // Corpo de erro que não era JSON chega como texto (a coletora corta em
  // 2000 letras): vale só para classificar, nunca para mostrar.
  return { status, codigo: typeof e?.codigo === 'string' ? e.codigo : null, corpo: objeto(corpo) ? corpo : typeof corpo === 'string' ? { message: corpo.slice(0, 500) } : null };
}

// O app ainda sem Trial aprovado: o Pinterest responde 401 com o código 3,
// "consumer type is not supported", em TODAS as chamadas (aviso oficial de
// 25/08/2026). Os outros textos são variações vistas em pedido pendente.
const APROVACAO = /consumer type is not supported|consumer type|trial access|not (been |yet )?approved|pending (approval|review)/i;

/** O motivo curto: reconectar (401), aprovacao (app sem Trial), cota (429),
 *  sem_permissao (403), formato (400: métrica ou parâmetro recusado),
 *  nao_encontrado (404), prazo (o tempo da coleta acabou), falhou (resto). */
export function classificarErro(falha) {
  const status = falha?.status ?? null;
  const corpo = objeto(falha?.corpo) ? falha.corpo : {};
  const msg = String(corpo.message ?? corpo.error ?? '');
  if (falha?.codigo === 'tempo') return 'prazo';
  if ((status === 401 || status === 403) && (APROVACAO.test(msg) || (status === 401 && num(corpo.code) === 3))) return 'aprovacao';
  if (status === 401) return 'reconectar';
  if (status === 429 || falha?.codigo === 'limite') return 'cota';
  if (status === 403) return 'sem_permissao';
  if (status === 400) return 'formato';
  if (status === 404) return 'nao_encontrado';
  return 'falhou';
}

// Motivos que param a coleta inteira: insistir só gasta a cota e repete a
// mesma recusa (token morto, app sem aprovação, limite do dia).
const PARA_TUDO = new Set(['reconectar', 'aprovacao', 'cota']);
// Falta que não é defeito: a próxima coleta completa. Com ela o estado geral
// é "parcial", nunca "erro".
const ADIADO = new Set(['orcamento', 'prazo', 'cota']);

function cliente(ctx, token, orcamento) {
  const estado = { usadas: 0, parado: null, orcamento };
  async function get(nome, caminho, params = {}) {
    if (estado.parado) return { ok: false, motivo: estado.parado };
    if (estado.usadas >= orcamento) return { ok: false, motivo: 'orcamento' };
    const resta = typeof ctx.prazo === 'function' ? num(ctx.prazo()) : null;
    if (resta != null && resta < FOLGA_PRAZO_MS) return { ok: false, motivo: 'prazo' };
    estado.usadas++;
    try {
      const dados = await ctx.fetchJson(montarUrl(caminho, params), {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        rotulo: `pinterest:${nome}`,
      });
      return { ok: true, dados: dados ?? {} };
    } catch (e) {
      const falha = lerFalha(e);
      const motivo = classificarErro(falha);
      // Só o nome da chamada, o status e o motivo: nem token, nem texto do
      // Pinterest, nem a URL (que pode ter o bookmark).
      ctx.log?.(`pinterest: ${nome} recusada (${falha.status ?? 'sem resposta'}, ${motivo})`);
      if (PARA_TUDO.has(motivo)) estado.parado = motivo;
      return { ok: false, motivo, status: falha.status };
    }
  }
  return { get, estado };
}

/** Paginação pelo bookmark (null na última página), com teto de páginas.
 *  Falha na primeira página é falha; numa seguinte, o que veio fica e a
 *  lista sai incompleta. */
async function paginar(cli, nome, caminho, params, maxPaginas) {
  const itens = [];
  let bookmark = null, paginas = 0, falha = null;
  const vistos = new Set();
  for (;;) {
    const r = await cli.get(nome, caminho, { ...params, bookmark });
    if (!r.ok) {
      if (paginas === 0) return { ok: false, motivo: r.motivo };
      falha = r.motivo;
      break;
    }
    paginas++;
    const pag = lerPagina(r.dados);
    itens.push(...pag.itens);
    if (!pag.bookmark) { bookmark = null; break; }
    bookmark = pag.bookmark;
    // Bookmark repetido seria um laço sem fim: para, e a lista sai
    // incompleta (não dá para saber o que faltou).
    if (vistos.has(pag.bookmark)) break;
    vistos.add(pag.bookmark);
    if (paginas >= maxPaginas) break;
  }
  return { ok: true, itens, paginas, falha, completo: !bookmark && !falha };
}

// -------------------------------------------------------------- token --

// O mkt-oauth.mjs lê o env como função (env('X')) ou como objeto (env.X):
// entrega os dois jeitos.
function envDaRenovacao(ctx) {
  const ler = (nome) => ctx.env(nome);
  const env = (nome) => ler(nome);
  for (const n of SECRETS) env[n] = ler(n);
  return env;
}

// A renovação vai pelo ctx.fetch da coletora quando ele existe: só deixa ir
// ao api.pinterest.com, conta no diário e para quando o orçamento acaba. O
// teto de 20 s por chamada vale aqui também.
function fetchDaRenovacao(ctx) {
  const base = typeof ctx.fetch === 'function' ? ctx.fetch : (url, init) => globalThis.fetch(url, init);
  return (url, init = {}) => base(url, { ...init, signal: AbortSignal.timeout(20_000) });
}

// Junta a conexão renovada sem deixar um campo ausente apagar o que existia.
function juntarConexao(velha, nova) {
  const fora = { ...velha };
  for (const [k, v] of Object.entries(nova || {})) if (v !== undefined && v !== null) fora[k] = v;
  return fora;
}

const RECUSA_RENOVACAO = {
  reconectar: ['reconectar', 'O Pinterest recusou a conexão guardada. Clique em Reconectar.'],
  credencial_recusada: ['erro', 'O Pinterest recusou o ID ou a chave secreta do app. Confira os Secrets do Supabase.'],
  falta_configurar: ['falta_configurar', 'Faltam o ID e a chave secreta do app do Pinterest nos Secrets do Supabase.'],
};

/** O token desta coleta. A coletora (painel-mkt-fontes) já renova com 7
 *  dias de folga (e 30 de folga no refresh contínuo) antes de chamar; aqui é
 *  a última rede: só renova o token vencido ou que vence durante a coleta.
 *  Toda renovação do Pinterest devolve um refresh token NOVO, e a conexão
 *  inteira volta em "conexao" para a coletora regravar no cofre. */
async function prepararToken(ctx, cx, avisar) {
  const agora = Date.now();
  const exp = instante(cx.expira_em);
  if (exp == null || exp - agora > ULTIMOS_MINUTOS_MS) return { token: cx.access_token };
  const vivo = exp > agora + 60_000;
  const expRefresh = instante(cx.refresh_expira_em);
  const temRefresh = typeof cx.refresh_token === 'string' && !!cx.refresh_token && (expRefresh == null || expRefresh > agora);
  if (!temRefresh) {
    if (vivo) return { token: cx.access_token };
    avisar('O acesso ao Pinterest venceu. Clique em Reconectar.');
    return { estado: 'reconectar' };
  }
  let recusa = null;
  try {
    const nova = await renovar(FONTE, cx, envDaRenovacao(ctx), fetchDaRenovacao(ctx), { agora });
    if (nova && typeof nova.access_token === 'string' && nova.access_token) {
      const conexao = juntarConexao(cx, nova);
      ctx.log?.(`pinterest: acesso renovado; refresh ${conexao.refresh_token !== cx.refresh_token ? 'novo' : 'o mesmo'}`);
      return { token: conexao.access_token, conexao, renovou: true };
    }
  } catch (e) {
    const codigo = typeof e?.codigo === 'string' ? e.codigo : null;
    // Só o código curto do mkt-oauth: a mensagem pode trazer o que o
    // Pinterest respondeu.
    ctx.log?.(`pinterest: renovação do acesso recusada (${codigo ?? 'sem código'})`);
    recusa = RECUSA_RENOVACAO[codigo] ?? null;
  }
  if (vivo) {
    if (recusa) avisar(recusa[1]);
    return { token: cx.access_token, renovou: true };
  }
  const [estado, aviso] = recusa ?? ['erro', 'Não deu para renovar o acesso ao Pinterest agora. A próxima coleta tenta de novo.'];
  avisar(aviso);
  return { estado };
}

// ------------------------------------------------------------- semanas --

/** As linhas para painel_mkt_api_metricas (sem o canal): só semana pronta,
 *  só número medido.
 *  Leads (leadsPorSemana: segunda -> soma de LEADS dos anúncios) só vão na
 *  semana em que houve lead, ou em que uma campanha de objetivo LEAD estava
 *  no período dela (periodosLeads: [{ de, ate }], AAAA-MM-DD, null = sem
 *  limite) E a conta entregou anúncio (entregaPorSemana: as segundas com
 *  gasto, impressão paga, clique ou lead). O dia sem linha nos anúncios vale
 *  zero (FAQ do Pinterest); fora disso, esse zero é "não havia campanha de
 *  leads no ar", e passaria por cima do lead lançado à mão (lead do
 *  orgânico, por exemplo). Antes a regra só olhava o COMEÇO da campanha, e
 *  toda semana depois do fim dela recebia leads 0 (revisão 2). */
export function montarSemanas({ hoje, porDia = null, seguidores = null, leadsPorSemana = null, entregaPorSemana = null, periodosLeads = [] }) {
  const semanas = semanasFechadas(hoje);
  const linhas = [], fora_da_faixa = [];
  semanas.forEach((semana, i) => {
    const numeros = {};
    const guardar = (k, v) => {
      if (v == null) return;
      const n = inteiroValido(v);
      if (n == null) { fora_da_faixa.push(`${k} ${semana}`); return; }
      numeros[k] = n;
    };
    if (porDia) {
      const s = resumoDaSemana(porDia, semana);
      if (s.pronta) {
        guardar('impressoes', s.impressoes);
        guardar('engajamento', s.engajamento);
        guardar('cliques', s.cliques_saida);
      }
    }
    // O total de agora só vale como o do domingo se a coleta é logo depois:
    // na segunda. Na terça ele já tem a segunda inteira de outra semana, e
    // regravar trocaria o retrato que a coleta de segunda guardou.
    if (i === 0 && seguidores != null && hoje === somarDias(semana, 7)) guardar('seguidores', seguidores);
    if (leadsPorSemana && leadsPorSemana.has(semana)) {
      const n = leadsPorSemana.get(semana);
      const domingo = somarDias(semana, 6);
      const noPeriodo = lista(periodosLeads).some((x) => (!x?.de || x.de <= domingo) && (!x?.ate || x.ate >= semana));
      if (n > 0 || (noPeriodo && !!entregaPorSemana?.has(semana))) guardar('leads', n);
    }
    if (Object.keys(numeros).length) linhas.push({ semana, numeros });
  });
  return { linhas, fora_da_faixa };
}

/** A linha de publicação de um Pin (sem o canal). Números só os desde
 *  sempre, e só os que vieram. */
export function publicacaoDoPin(pin) {
  if (!pin?.id || !pin.data) return null;
  const url = linkCanonicoDoPin(pin.url ?? pin.id) ?? linkCanonicoDoPin(pin.id);
  if (!url) return null;
  const linha = { url, data: pin.data, titulo: GUARDAR_TITULO ? pin.titulo : null };
  const v = pin.desde_sempre;
  if (v) {
    const imp = inteiroValido(v.impressoes), cli = inteiroValido(v.cliques_saida);
    if (imp != null) linha.impressoes = imp;
    if (cli != null) linha.cliques = cli;
  }
  return linha;
}

/** Os Pins para a análise por Pin: os criados nos últimos 90 dias (mais
 *  novos primeiro) e depois os dos tops, sem repetir, até o teto. */
export function escolherPinsParaAnalise({ pins = [], tops = [], videos = new Set(), hoje, max = MAX_ANALISE_PINS }) {
  const desde = somarDias(hoje, -DIAS_PINS_RECENTES);
  const fora = [];
  const ja = new Set();
  const recentes = pins.filter((p) => p?.id && p.data && p.data >= desde).sort((a, b) => ((a.criado_em || '') < (b.criado_em || '') ? 1 : -1));
  for (const p of recentes) {
    if (fora.length >= max) break;
    if (ja.has(p.id)) continue;
    ja.add(p.id);
    fora.push({ id: p.id, video: p.video === true || videos.has(p.id), origem: 'recente' });
  }
  const porId = new Map(pins.map((p) => [p.id, p]));
  for (const id of tops) {
    if (fora.length >= max) break;
    if (!id || ja.has(id)) continue;
    ja.add(id);
    fora.push({ id, video: porId.get(id)?.video === true || videos.has(id), origem: 'top' });
  }
  return fora;
}

const CAMPOS_SEMANA_PIN = ['impressoes', 'cliques_saida', 'cliques_pin', 'salvamentos', 'seguidores_ganhos', 'visitas_perfil', 'video_visualizacoes'];
const somaPresentes = (dias, k) => { let s = null; for (const d of dias) { const v = d[k] ?? d.extras?.[k]; if (v != null) s = (s ?? 0) + v; } return s; };

/** A análise de um Pin no formato de dados.analise_pins.itens. Na semana,
 *  soma os dias que vieram (dia antes de o Pin existir não traz número). */
export function montarAnalisePin({ id, video, origem }, lido, semanas) {
  const r = lido?.resumo || traduzirMetricas({});
  const ex = r.extras || {};
  const soma = { ...r, comentarios: ex.comentarios ?? null, reacoes: ex.reacoes ?? null, seguidores_ganhos: ex.seguidores_ganhos ?? null, visitas_perfil: ex.visitas_perfil ?? null };
  const eng = r.salvamentos != null && r.cliques_pin != null && r.cliques_saida != null ? r.salvamentos + r.cliques_pin + r.cliques_saida : null;
  return {
    id, url: linkDoPin(id), video: !!video, origem,
    soma,
    engajamento_aprox: eng,
    desde_sempre: lido?.vida ?? null,
    semanas: semanas.map((semana) => {
      const dias = Array.from({ length: 7 }, (_, i) => lido?.porDia?.get(somarDias(semana, i)) || null).filter(Boolean);
      const linha = { semana, pronta: dias.length === 7 && dias.every((d) => statusPronto(d.status)) };
      for (const k of CAMPOS_SEMANA_PIN) linha[k] = somaPresentes(dias, k);
      return linha;
    }),
  };
}

// ------------------------------------------------------------- coleta --

export const MOTIVOS = Object.freeze({
  orcamento: 'As chamadas desta coleta acabaram antes; o que faltou vem na próxima.',
  prazo: 'O tempo da coleta acabou antes; o que faltou vem na próxima.',
  cota: 'O Pinterest avisou que o limite de chamadas acabou; o que faltou vem na próxima coleta.',
  reconectar: 'O Pinterest recusou o acesso guardado.',
  aprovacao: 'O app ainda não tem o Trial access aprovado pelo Pinterest.',
  sem_permissao: 'O Pinterest não liberou este dado para o app.',
  sem_escopo: 'A conexão veio sem a permissão deste dado. Conecte de novo e aceite tudo.',
  formato: 'O Pinterest recusou o pedido.',
  nao_encontrado: 'O Pinterest não achou o que foi pedido.',
  falhou: 'O Pinterest não respondeu desta vez.',
  incompleto: 'Parte deste dado não veio desta vez.',
});
const PARTES = ['perfil', 'conta', 'top', 'pins', 'pastas', 'anuncios', 'analise_pins'];

const AVISO_APROVACAO = 'O Pinterest ainda não aprovou o app (Trial access pendente), e por isso recusa toda chamada. Nada foi coletado. Se passar de 3 dias úteis sem resposta, ou se vier negativa, abra chamado em https://help.pinterest.com/contact?pinterest_api_and_developer_tools=api_access&origin=pbc com o App ID.';
const AVISO_RECONECTAR = 'O Pinterest recusou o acesso guardado. Clique em Reconectar.';
const AVISO_COTA = 'O Pinterest avisou que o limite de chamadas acabou (no Trial são 1000 por dia para o app inteiro). O resto fica para a próxima coleta.';

export async function coletar(ctx) {
  const avisos = [];
  const avisar = (t) => { if (t && !avisos.includes(t)) avisos.push(t); };
  const canal = acharCanal(ctx?.canais);
  const cx = objeto(ctx?.conexao) ? ctx.conexao : null;
  const contaGuardada = cx && typeof cx.conta === 'string' ? cx.conta : null;
  const parar = (estado, extra = {}) => ({ estado, conta: contaGuardada, partes: {}, dados: {}, semanas: [], publicacoes: [], avisos, ...extra });
  const env = typeof ctx?.env === 'function' ? ctx.env : () => null;

  const faltam = SECRETS.filter((n) => !env(n));
  if (faltam.length) {
    avisar(`Falta cadastrar ${faltam.join(' e ')} nos Secrets das Edge Functions do Supabase.`);
    return parar('falta_configurar');
  }
  if (!cx || typeof cx.access_token !== 'string' || !cx.access_token) {
    avisar('O Pinterest ainda não foi conectado. Clique em Conectar em Configurações, Marketing.');
    return parar('falta_conectar');
  }
  const escopos = lerEscopos(cx.escopos);
  if (escopos && !escopos.has(ESCOPO_CONTA)) {
    avisar('A conexão com o Pinterest veio sem a permissão de ler a conta (user_accounts:read). Clique em Reconectar e aceite todas as permissões.');
    return parar('reconectar');
  }
  const temEscopo = (e) => !escopos || escopos.has(e);

  const tk = await prepararToken({ ...ctx, env }, cx, avisar);
  if (tk.estado) return parar(tk.estado);
  const comConexao = tk.conexao ? { conexao: tk.conexao } : {};

  // A renovação também conta na cota do dia do app.
  const orcamento = Math.max(0, orcamentoDaRodada(ctx.chamadasHoje) - (tk.renovou ? 1 : 0));
  const cli = cliente(ctx, tk.token, orcamento);
  const coletadoEm = new Date().toISOString();
  const partes = {}, codigos = {}, dados = {};
  const cota = () => ({ orcamento, usadas: cli.estado.usadas, teto_dia: TETO_DIA });
  // motivo é a frase (a tela mostra como texto); o código curto vai ao lado.
  const parte = (nome, estado, codigo = null) => {
    partes[nome] = codigo ? { estado, motivo: MOTIVOS[codigo] ?? MOTIVOS.falhou, codigo, coletado_em: coletadoEm } : { estado, coletado_em: coletadoEm };
    codigos[nome] = codigo;
  };
  const avisarFalha = (r, oQue) => {
    if (r.motivo === 'sem_permissao') avisar(`O Pinterest não liberou ${oQue} para este app.`);
    else if (r.motivo === 'formato') avisar(`O Pinterest recusou o pedido, e ${oQue} não veio.`);
    else if (r.motivo === 'falhou' || r.motivo === 'nao_encontrado') avisar(`O Pinterest não mandou ${oQue} desta vez.`);
  };

  const hoje = dataValida(ctx.hoje) ? ctx.hoje : hojeSP();
  const semanas = semanasFechadas(hoje);
  const inicio = semanas[semanas.length - 1];
  const ontem = somarDias(hoje, -1);
  const dominio = dominioDoSite(ctx.canais);
  dados.janela = { hoje, inicio, fim: ontem, semanas, fuso_dos_dias: 'UTC' };

  const fechar = () => {
    const parado = cli.estado.parado;
    if (parado === 'cota') avisar(AVISO_COTA);
    if (parado === 'reconectar') avisar(AVISO_RECONECTAR);
    if (parado === 'aprovacao') avisar(AVISO_APROVACAO);
    const valores = Object.values(partes).map((p) => p.estado);
    const cods = Object.values(codigos);
    let estado;
    if (parado === 'reconectar') estado = 'reconectar';
    else if (parado === 'aprovacao') estado = 'aguardando_aprovacao';
    else if (valores.length && valores.every((v) => v === 'ok')) estado = 'ok';
    else if (valores.some((v) => v === 'ok' || v === 'parcial') || cods.some((c) => ADIADO.has(c))) estado = 'parcial';
    else estado = 'erro';
    if (cods.includes('orcamento')) avisar(`Esta coleta usou as ${orcamento} chamadas que tinha; o que faltou vem na próxima.`);
    if (cods.includes('prazo')) avisar('O tempo da coleta acabou antes do fim; o que faltou vem na próxima.');
    dados.cota = cota();
    ctx.log?.(`pinterest: ${cli.estado.usadas} chamada(s), estado ${estado}`);
    return { estado, conta: dados.perfil?.nome ?? dados.perfil?.usuario ?? contaGuardada, partes, dados, semanas: [], publicacoes: [], avisos, ...comConexao };
  };

  if (orcamento <= 0) {
    for (const p of PARTES) parte(p, 'erro', 'orcamento');
    avisar('A cota do dia do Pinterest já foi usada por outras coletas. A próxima coleta tenta de novo.');
    return fechar();
  }

  // 1. O perfil. É a porta de entrada: app sem aprovação ou token morto
  //    respondem aqui, e aí nada mais é pedido.
  const rPerfil = await cli.get('perfil', '/user_account');
  if (!rPerfil.ok && (rPerfil.motivo === 'aprovacao' || rPerfil.motivo === 'reconectar')) {
    avisar(rPerfil.motivo === 'aprovacao' ? AVISO_APROVACAO : AVISO_RECONECTAR);
    return { ...parar(rPerfil.motivo === 'aprovacao' ? 'aguardando_aprovacao' : 'reconectar'), ...comConexao, dados: { cota: cota() } };
  }
  const perfil = rPerfil.ok ? lerPerfil(rPerfil.dados) : null;
  if (perfil) {
    dados.perfil = perfil;
    parte('perfil', 'ok');
    if (perfil.tipo_conta && perfil.tipo_conta !== 'BUSINESS') avisar('A conta conectada não é uma conta empresarial do Pinterest; os números da conta podem não vir.');
  } else {
    parte('perfil', 'erro', rPerfil.ok ? 'falhou' : rPerfil.motivo);
    avisarFalha(rPerfil, 'os dados da conta');
  }

  // 2. A análise da conta (alimenta os números da semana). Se a lista de
  //    métricas for recusada, pede uma por uma para achar a culpada, que vira
  //    null e aviso; as aceitas seguem para as outras chamadas.
  const janelaConta = { start_date: inicio, end_date: ontem };
  let aceitas = [...METRICAS_CONTA];
  const recusadas = [];
  let rTotal = await cli.get('contaTotal', '/user_account/analytics', { ...janelaConta, metric_types: aceitas, content_type: 'ALL' });
  let total = rTotal.ok ? lerAnalise(rTotal.dados) : null;
  if (!rTotal.ok && rTotal.motivo === 'formato') {
    const juntas = new Map();
    const resumo = traduzirMetricas({});
    const achadas = [], negadas = [];
    // IMPRESSION vem primeiro: se nem ela sozinha passa, o problema não é a
    // lista de métricas (é a janela ou o pedido), e nenhuma leva a culpa.
    for (const m of METRICAS_CONTA) {
      const r = await cli.get('contaTotal', '/user_account/analytics', { ...janelaConta, metric_types: [m], content_type: 'ALL' });
      if (!r.ok) {
        if (r.motivo !== 'formato' || !achadas.length) break;
        negadas.push(m);
        continue;
      }
      const l = lerAnalise(r.dados);
      if (!l) continue;
      achadas.push(m);
      const nome = NOMES[m];
      if (l.resumo) resumo[nome] = l.resumo[nome];
      for (const [dia, d] of l.porDia) {
        const antes = juntas.get(dia) || { dia, status: d.status, ...traduzirMetricas({}) };
        antes[nome] = d[nome];
        if (!statusPronto(d.status)) antes.status = d.status;
        juntas.set(dia, antes);
      }
    }
    if (achadas.length) {
      aceitas = achadas;
      recusadas.push(...negadas);
      total = { resumo, porDia: juntas, vida: null };
      rTotal = { ok: true };
    }
    if (recusadas.length) avisar(`O Pinterest recusou ${recusadas.length === 1 ? 'a métrica' : 'as métricas'} ${recusadas.join(', ')} da conta; ${recusadas.length === 1 ? 'ela ficou' : 'elas ficaram'} sem número.`);
  }
  const porDiaTotal = total ? new Map([...total.porDia].filter(([d]) => d >= inicio && d <= ontem).sort(([a], [b]) => (a < b ? -1 : 1))) : null;
  if (!rTotal.ok) avisarFalha(rTotal, 'a análise da conta');

  // 3. A lista dos Pins da conta (as publicações). exclude_repins tira o
  //    que a conta só salvou de outras pessoas.
  const podePins = temEscopo(ESCOPO_PINS) && temEscopo(ESCOPO_PASTAS);
  if (!podePins) avisar('A conexão não tem a permissão de ler Pins e pastas (pins:read e boards:read). Clique em Reconectar e aceite tudo.');
  const rPins = podePins
    ? await paginar(cli, 'pins', '/pins', { page_size: TAMANHO_PAGINA, pin_metrics: 'true', pin_filter: 'exclude_repins' }, MAX_PAGINAS_PINS)
    : { ok: false, motivo: 'sem_escopo' };
  const pins = [];
  if (rPins.ok) {
    for (const bruto of rPins.itens) {
      const p = lerPin(bruto, dominio);
      if (p && p.dono !== false && !pins.some((x) => x.id === p.id)) pins.push(p);
    }
    // Do mais novo para o mais velho; Pin sem data vai para o fim.
    pins.sort((a, b) => ((a.criado_em || '') < (b.criado_em || '') ? 1 : -1));
    if (!rPins.completo && !rPins.falha) avisar(`A conta tem mais Pins do que o Painel lê numa coleta (${MAX_PAGINAS_PINS * TAMANHO_PAGINA}); os mais antigos ficaram de fora.`);
    if (rPins.falha) avisarFalha({ motivo: rPins.falha }, 'a lista completa de Pins');
  } else if (rPins.motivo !== 'sem_escopo') avisarFalha(rPins, 'a lista de Pins');

  // 4. Orgânico e pago separados (somar com os anúncios contaria duas vezes).
  const metricasAceitas = aceitas.length ? aceitas : METRICAS_CONTA;
  const rOrganico = rTotal.ok ? await cli.get('contaOrganico', '/user_account/analytics', { ...janelaConta, metric_types: metricasAceitas, content_type: 'ORGANIC' }) : null;
  const rPago = rTotal.ok ? await cli.get('contaPago', '/user_account/analytics', { ...janelaConta, metric_types: metricasAceitas, content_type: 'PAID' }) : null;

  // 5. Os tops: a semana fechada, a janela inteira e os vídeos.
  const topSemana = { inicio: semanas[0], fim: somarDias(semanas[0], 6) };
  const topPeriodo = { inicio, fim: ontem };
  const podeTop = temEscopo(ESCOPO_PINS);
  const pedirTop = async (nome, caminho, janela, ordem, metricas) => {
    const base = { start_date: janela.inicio, end_date: janela.fim, sort_by: ordem, num_of_pins: 50 };
    let r = await cli.get(nome, caminho, { ...base, metric_types: metricas });
    // Métrica recusada no top: pede sem a lista (vêm as que o Pinterest
    // escolher) em vez de perder o ranking.
    if (!r.ok && r.motivo === 'formato') r = await cli.get(nome, caminho, base);
    return r;
  };
  const rTopSemana = podeTop ? await pedirTop('topSemana', '/user_account/analytics/top_pins', topSemana, 'ENGAGEMENT', METRICAS_TOP) : { ok: false, motivo: 'sem_escopo' };
  const rTopPeriodo = podeTop ? await pedirTop('topPeriodo', '/user_account/analytics/top_pins', topPeriodo, 'ENGAGEMENT', METRICAS_TOP) : { ok: false, motivo: 'sem_escopo' };
  const rTopVideo = podeTop ? await pedirTop('topVideo', '/user_account/analytics/top_video_pins', topPeriodo, 'VIDEO_MRC_VIEW', METRICAS_TOP_VIDEO) : { ok: false, motivo: 'sem_escopo' };
  const tops = {};
  if (rTopSemana.ok) tops.semana = { ...topSemana, ...lerTop(rTopSemana.dados) };
  if (rTopPeriodo.ok) tops.periodo = { ...topPeriodo, ...lerTop(rTopPeriodo.dados) };
  if (rTopVideo.ok) tops.video = { ...topPeriodo, ...lerTop(rTopVideo.dados) };
  for (const [r, oQue] of [[rTopSemana, 'o ranking de Pins da semana'], [rTopPeriodo, 'o ranking de Pins do período'], [rTopVideo, 'o ranking de vídeos']]) if (!r.ok) avisarFalha(r, oQue);

  // 6. Os Pins que levam ao site (filtro domain=, domínio exato sem www).
  const rSite = podePins && rPins.ok
    ? await paginar(cli, 'pinsDoSite', '/pins', { page_size: TAMANHO_PAGINA, pin_metrics: 'true', domain: dominio }, MAX_PAGINAS_SITE)
    : null;
  if (rSite && !rSite.ok) avisarFalha(rSite, 'os Pins que levam ao site');

  // 7. As pastas.
  const rPastas = temEscopo(ESCOPO_PASTAS) ? await paginar(cli, 'pastas', '/boards', { page_size: TAMANHO_PAGINA }, MAX_PAGINAS_PASTAS) : { ok: false, motivo: 'sem_escopo' };
  if (!rPastas.ok && rPastas.motivo !== 'sem_escopo') avisarFalha(rPastas, 'as pastas');

  // 8. Anúncios: contas, gasto por dia, campanhas e público.
  const anuncios = { observacao: null, contas: [] };
  let rContas = { ok: false, motivo: 'sem_escopo' };
  // O primeiro motivo de falha dentro dos anúncios (a parte sai parcial).
  let anunciosFalha = null;
  const falhaAnuncio = (m) => { anunciosFalha = anunciosFalha || m || 'incompleto'; };
  const leadsPorSemana = new Map();
  let leadsFalhou = false;
  // Para a regra dos leads (montarSemanas): as semanas em que a conta
  // entregou anúncio, e o período de cada campanha de objetivo LEAD.
  const entregaPorSemana = new Set();
  const periodosLeads = [];
  if (!temEscopo(ESCOPO_ANUNCIOS)) {
    avisar('A conexão não tem a permissão de ler anúncios (ads:read); anúncios e público ficaram de fora. Para ver, clique em Reconectar e aceite tudo.');
  } else {
    rContas = await cli.get('contasAnuncio', '/ad_accounts', { page_size: 25 });
    if (!rContas.ok) avisarFalha(rContas, 'as contas de anúncio');
  }
  if (rContas.ok) {
    const contas = lista(rContas.dados?.items).map(lerContaAnuncio).filter(Boolean);
    if (!contas.length) anuncios.observacao = 'Não há conta de anúncios ligada a este perfil: anúncios e público ficam vazios. Criar uma em ads.pinterest.com libera o público (idade, cidade, interesses).';
    if (contas.length > MAX_CONTAS_ANUNCIO) avisar(`O perfil tem ${contas.length} contas de anúncio; o Painel lê as ${MAX_CONTAS_ANUNCIO} primeiras.`);
    for (const conta of contas.slice(0, MAX_CONTAS_ANUNCIO)) {
      const c = { ...conta, fuso_dos_dias: 'conta', colunas_recusadas: false };
      const caminho = `/ad_accounts/${conta.id}`;
      // Janelas de atribuição: só clique e visualização. engagement_window_days
      // está descontinuado e nunca é pedido.
      const atribuicao = { click_window_days: 30, view_window_days: 1 };
      let colunas = Object.keys(COLUNAS_ANUNCIO);
      let rA = await cli.get('anuncios', `${caminho}/analytics`, { start_date: inicio, end_date: ontem, columns: colunas, granularity: 'DAY', ...atribuicao, reporting_timezone: 'AD_ACCOUNT_TIME_ZONE' });
      if (!rA.ok && rA.motivo === 'formato') {
        // Coluna ou fuso recusado: refaz com o essencial, nos dias UTC.
        colunas = [...COLUNAS_ANUNCIO_BASICAS];
        Object.assign(c, { fuso_dos_dias: 'UTC', colunas_recusadas: true });
        avisar('O Pinterest recusou parte das colunas dos anúncios; ficaram só gasto, impressões pagas e cliques.');
        rA = await cli.get('anuncios', `${caminho}/analytics`, { start_date: inicio, end_date: ontem, columns: colunas, granularity: 'DAY', ...atribuicao });
      }
      if (rA.ok) {
        const porDia = lerAnunciosPorDia(rA.dados, colunas, inicio, ontem);
        c.por_dia = [...porDia.values()];
        c.resumo = somarAnuncios(c.por_dia);
        c.semanas = semanas.map((s) => ({ semana: s, ...somarAnuncios(Array.from({ length: 7 }, (_, i) => porDia.get(somarDias(s, i))).filter(Boolean)) }));
        for (const s of c.semanas) {
          if (s.leads == null) { leadsFalhou = true; continue; }
          leadsPorSemana.set(s.semana, (leadsPorSemana.get(s.semana) ?? 0) + s.leads);
          if (s.gasto > 0 || s.impressoes_pagas > 0 || s.cliques > 0 || s.leads > 0) entregaPorSemana.add(s.semana);
        }
      } else {
        falhaAnuncio(rA.motivo);
        leadsFalhou = true;
        avisarFalha(rA, 'os números dos anúncios');
      }

      const rC = await paginar(cli, 'campanhas', `${caminho}/campaigns`, { page_size: TAMANHO_PAGINA }, MAX_PAGINAS_CAMPANHAS);
      if (rC.ok) {
        const campanhas = rC.itens.map(lerCampanha).filter(Boolean);
        // O período de cada campanha de leads (end_time ausente: sem fim).
        // Campanha pausada sem end_time segue "no período", e quem segura o
        // zero falso aí é a entrega da semana.
        for (const x of campanhas) if (/LEAD/i.test(x.objetivo || '')) periodosLeads.push({ de: x.inicio ? diaSP(x.inicio) : null, ate: x.fim ? diaSP(x.fim) : null });
        // Página que falhou é falta; passar do teto de páginas é só teto.
        if (rC.falha) falhaAnuncio(rC.falha);
        else if (!rC.completo) avisar('Há mais campanhas do que o Painel lê numa coleta; as mais antigas ficaram de fora.');
        const ids = campanhas.slice(0, MAX_CAMPANHAS_ANALISE).map((x) => x.id);
        let numeros = null;
        if (ids.length) {
          const rCA = await cli.get('campanhasAnalise', `${caminho}/campaigns/analytics`, { start_date: inicio, end_date: ontem, campaign_ids: ids, columns: COLUNAS_CAMPANHA, granularity: 'TOTAL', ...atribuicao });
          if (rCA.ok) numeros = lerAnaliseCampanhas(rCA.dados, ids, COLUNAS_CAMPANHA);
          else { falhaAnuncio(rCA.motivo); avisarFalha(rCA, 'os números das campanhas'); }
        }
        c.campanhas = campanhas.map((x) => ({ ...x, ...(numeros?.get(x.id) ?? {}) }));
      } else {
        c.campanhas = null;
        falhaAnuncio(rC.motivo);
        avisarFalha(rC, 'as campanhas');
      }

      c.publico = { total: null, engajado: null };
      for (const [tipo, chave] of [['YOUR_TOTAL_AUDIENCE', 'total'], ['YOUR_ENGAGED_AUDIENCE', 'engajado']]) {
        const rP = await cli.get('publico', `${caminho}/audience_insights`, { audience_insight_type: tipo });
        if (rP.ok) c.publico[chave] = lerPublico(rP.dados);
        else if (rP.motivo === 'formato' || rP.motivo === 'nao_encontrado') {
          // Conta de anúncios nova ou com pouco volume: o Pinterest não monta
          // o público. Não é falha da coleta (senão a fonte ficaria "parcial"
          // todo dia); fica a observação.
          anuncios.observacao = anuncios.observacao || 'O Pinterest não devolveu o público da conta de anúncios (costuma faltar volume em conta nova ou parada).';
        } else { falhaAnuncio(rP.motivo); avisarFalha(rP, 'o público da conta de anúncios'); }
      }
      anuncios.contas.push(c);
    }
  }

  // 9. As quebras da conta (aparelho, origem, formato, conteúdo próprio).
  const quebras = {};
  let quebraFalhou = null;
  if (rTotal.ok) {
    for (const [campo, nome] of QUEBRAS) {
      const r = await cli.get(`quebra ${nome}`, '/user_account/analytics', { ...janelaConta, metric_types: metricasAceitas, split_field: campo });
      if (r.ok) quebras[nome] = lerQuebra(r.dados);
      else { quebraFalhou = r.motivo; avisarFalha(r, `a quebra por ${ROTULO_QUEBRA[nome] || nome}`); }
    }
  }

  // 10. A análise por Pin, com o que sobrar do orçamento. Um 403 para tudo:
  //     repetir Pin a Pin só gastaria a cota com a mesma recusa.
  const videosTop = new Set((tops.video?.pins || []).map((p) => p.id));
  const idsTop = [...(tops.semana?.pins || []), ...(tops.periodo?.pins || []), ...(tops.video?.pins || [])].map((p) => p.id);
  const candidatos = podePins ? escolherPinsParaAnalise({ pins: rPins.ok ? pins : [], tops: idsTop, videos: videosTop, hoje }) : [];
  const janelaPin = { inicio: somarDias(hoje, -DIAS_ANALISE_PINS), fim: ontem };
  const medidos = [];
  let cortePins = null, pinsFalharam = 0;
  const listaPara = { padrao: [...METRICAS_PIN], video: [...METRICAS_PIN_VIDEO] };
  for (const c of candidatos) {
    const tipo = c.video ? 'video' : 'padrao';
    const caminho = `/pins/${enc(c.id)}/analytics`;
    let r = await cli.get('analisePin', caminho, { start_date: janelaPin.inicio, end_date: janelaPin.fim, metric_types: listaPara[tipo] });
    if (!r.ok && r.motivo === 'formato' && listaPara[tipo].length > METRICAS_PIN_BASICAS.length) {
      // A lista do tipo foi recusada: daqui em diante, só as quatro que
      // existem nas duas listas (sem gastar uma chamada a mais por Pin).
      listaPara[tipo] = [...METRICAS_PIN_BASICAS];
      avisar(`O Pinterest recusou a lista de métricas por Pin ${c.video ? 'de vídeo' : 'de imagem'}; ficaram impressões, cliques e salvamentos.`);
      r = await cli.get('analisePin', caminho, { start_date: janelaPin.inicio, end_date: janelaPin.fim, metric_types: listaPara[tipo] });
    }
    if (r.ok) { medidos.push(montarAnalisePin(c, lerAnalise(r.dados), semanas)); continue; }
    if (cli.estado.parado || ADIADO.has(r.motivo)) { cortePins = cli.estado.parado ?? r.motivo; break; }
    if (r.motivo === 'sem_permissao') { cortePins = 'sem_permissao'; avisarFalha(r, 'a análise por Pin'); break; }
    pinsFalharam++;
  }
  if (pinsFalharam) avisar(`A análise de ${pinsFalharam} Pin(s) não veio desta vez.`);

  // ------------------------------------------------ montar as partes --
  if (rTotal.ok && total) {
    const conta = { metricas_recusadas: recusadas };
    conta.total = { resumo: total.resumo || traduzirMetricas({}), por_dia: [...porDiaTotal.values()].map(linhaDoDia), semanas: semanas.map((s) => resumoDaSemana(porDiaTotal, s)) };
    const lado = (r) => {
      const l = r?.ok ? lerAnalise(r.dados) : null;
      if (!l) return null;
      const porDia = new Map([...l.porDia].filter(([d]) => d >= inicio && d <= ontem));
      return { resumo: l.resumo || traduzirMetricas({}), semanas: semanas.map((s) => resumoDaSemana(porDia, s)) };
    };
    const organico = lado(rOrganico), pago = lado(rPago);
    if (organico) conta.organico = organico; else if (rOrganico) avisarFalha(rOrganico, 'a análise orgânica da conta');
    if (pago) conta.pago = pago; else if (rPago) avisarFalha(rPago, 'a análise paga da conta');
    if (Object.keys(quebras).length) conta.quebras = quebras;
    dados.conta = conta;
    const falha = (!organico && rOrganico?.motivo) || (!pago && rPago?.motivo) || quebraFalhou || ((!organico || !pago) ? 'incompleto' : null);
    parte('conta', falha ? 'parcial' : 'ok', falha || null);
  } else parte('conta', 'erro', rTotal.ok ? 'falhou' : rTotal.motivo);

  if (!podeTop) parte('top', 'erro', 'sem_escopo');
  else if (Object.keys(tops).length) {
    dados.top = tops;
    const falha = [rTopSemana, rTopPeriodo, rTopVideo].find((r) => !r.ok);
    parte('top', falha ? 'parcial' : 'ok', falha?.motivo ?? null);
  } else parte('top', 'erro', rTopSemana.motivo);

  if (rPins.ok) {
    const p = { total: pins.length, completo: !!rPins.completo, itens: pins.slice(0, MAX_PINS_DADOS) };
    if (rSite?.ok) {
      const doSite = [];
      for (const bruto of rSite.itens) { const x = lerPin(bruto, dominio); if (x && !doSite.some((y) => y.id === x.id)) doSite.push(x); }
      const ids = new Set(doSite.map((x) => x.id));
      // O filtro do Pinterest manda; o destino lido é a segunda opinião.
      for (const x of pins) if (ids.has(x.id)) x.leva_ao_site = true;
      const somar = (campo, k) => { let s = null; for (const x of doSite) { const v = x[campo]?.[k]; if (v != null) s = (s ?? 0) + v; } return s; };
      p.do_site = {
        dominio, total: doSite.length, completo: !!rSite.completo, ids: [...ids],
        ultimos_90_dias: { impressoes: somar('ultimos_90_dias', 'impressoes'), cliques_pin: somar('ultimos_90_dias', 'cliques_pin'), cliques_saida: somar('ultimos_90_dias', 'cliques_saida') },
        desde_sempre: { impressoes: somar('desde_sempre', 'impressoes'), cliques_pin: somar('desde_sempre', 'cliques_pin'), cliques_saida: somar('desde_sempre', 'cliques_saida') },
        de_fora: doSite.filter((x) => !pins.some((y) => y.id === x.id)).slice(0, 50),
      };
    }
    dados.pins = p;
    const codigo = rPins.falha || (rSite && !rSite.ok ? rSite.motivo : null) || (rSite?.falha ?? null);
    parte('pins', codigo ? 'parcial' : 'ok', codigo);
  } else parte('pins', 'erro', rPins.motivo);

  if (rPastas.ok) {
    const itens = [];
    for (const b of rPastas.itens) { const x = lerPasta(b); if (x && !itens.some((y) => y.id === x.id)) itens.push(x); }
    dados.pastas = { total: itens.length, completo: !!rPastas.completo, itens };
    parte('pastas', rPastas.falha ? 'parcial' : 'ok', rPastas.falha || null);
  } else parte('pastas', 'erro', rPastas.motivo);

  if (rContas.ok) {
    dados.anuncios = anuncios;
    parte('anuncios', anunciosFalha ? 'parcial' : 'ok', anunciosFalha);
  } else parte('anuncios', 'erro', rContas.motivo);

  // Os candidatos saem da lista de Pins e dos tops. Com a lista de Pins
  // recusada, "nenhum candidato" não quer dizer "nada a medir": quer dizer
  // que não deu para saber o que medir. Marcar ok aí trocaria a análise boa
  // da coleta anterior por uma lista vazia (a coletora troca parte ok), e a
  // fonte inteira passaria por "parcial" com tudo fora do ar.
  const basePins = rPins.ok ? null : (rPins.motivo || 'falhou');
  if (!podePins) parte('analise_pins', 'erro', 'sem_escopo');
  else if (candidatos.length && !medidos.length && (cortePins || pinsFalharam)) parte('analise_pins', 'erro', cortePins || 'falhou');
  else if (!candidatos.length && basePins) parte('analise_pins', 'erro', basePins);
  else {
    const seguidoresPorSemana = semanas.map((semana) => {
      let ganhos = null, n = 0;
      for (const m of medidos) {
        const v = m.semanas.find((s) => s.semana === semana)?.seguidores_ganhos;
        if (v != null) { ganhos = (ganhos ?? 0) + v; n++; }
      }
      return { semana, ganhos, pins_medidos: n };
    });
    dados.analise_pins = { inicio: janelaPin.inicio, fim: janelaPin.fim, pedidos: candidatos.length, medidos: medidos.length, itens: medidos, seguidores_por_semana: seguidoresPorSemana };
    // Sem a lista de Pins, só os tops foram medidos: os recentes ficaram de
    // fora, e a parte é parcial (a coletora junta com a anterior).
    const codigo = medidos.length < candidatos.length ? (cortePins || 'incompleto') : basePins ? 'incompleto' : null;
    parte('analise_pins', codigo ? 'parcial' : 'ok', codigo);
  }

  const resultado = fechar();

  // ------------------------------- para o banco (só com o canal achado) --
  if (!canal) {
    avisar('Nenhum canal ativo do Pinterest no Marketing: os números ficaram só nesta tela.');
    return resultado;
  }
  // Leads só com a leitura dos anúncios inteira (uma conta que falhou deixa
  // a soma pela metade); a semana a semana é a regra do montarSemanas.
  const leads = !leadsFalhou && rContas.ok ? leadsPorSemana : null;
  const sem = montarSemanas({ hoje, porDia: rTotal.ok ? porDiaTotal : null, seguidores: perfil?.seguidores ?? null, leadsPorSemana: leads, entregaPorSemana, periodosLeads });
  if (sem.fora_da_faixa.length) avisar(`Número fora da faixa ficou de fora: ${sem.fora_da_faixa.join(', ')}.`);
  resultado.semanas = sem.linhas.map((l) => ({ canal: canal.codigo, semana: l.semana, numeros: l.numeros }));
  if (rPins.ok) {
    resultado.publicacoes = pins.map(publicacaoDoPin).filter(Boolean).map((l) => ({ canal: canal.codigo, ...l }));
  }
  return resultado;
}
