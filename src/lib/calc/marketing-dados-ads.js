/* O CONECTOR "google_ads" NA SUB-ABA "DADOS" DO CANAL SITE (o Google Ads não
 * tem canal próprio: o gasto aparece no site e na Visão geral).
 *
 * O formato é o da seção FORMATO de
 * supabase/functions/_shared/mkt-fontes/google_ads.mjs. Cada chave de
 * "dados" é uma PARTE com estado próprio, e cada seção do quadro é uma parte:
 * a parte que não veio diz o estado e o motivo dela no lugar da tabela
 * (semDadoDaParte), sem derrubar as outras.
 *
 * Regras do Google que a tela segura:
 *  - ctr, cpc e custo por conversão vêm recalculados das somas pelo
 *    conector; aqui nada é somado de novo por cima deles;
 *  - a parcela de impressões "menos de 10%" (o Google manda 0,0999) e a
 *    perdida "mais de 90%" aparecem escritas assim (textoParcela e
 *    textoPerdida, em marketing-dados.js), também na parcela por campanha e
 *    na da Rede de Display;
 *  - a faixa de volume das categorias de busca é FAIXA, nunca um número só;
 *  - "presença" e "interesse" nas cidades são a mesma impressão vista de dois
 *    jeitos: a tabela mostra o tipo e não soma as duas;
 *  - o dado pessoal (leads de formulário, DDD de quem ligou, e-mail de quem
 *    mexeu na conta) mora em "restrito", que o servidor só manda para a
 *    gestão: a tela mostra quando veio e não pede o que não veio.
 */
import {
  agrupar,
  blocoAvisos,
  blocoBarras,
  blocoGrafico,
  blocoNumeros,
  blocoPares,
  blocoTabela,
  blocoTexto,
  col,
  colSemanaFechada,
  conhecido,
  formatar,
  lista,
  medida,
  montarQuadro,
  nomeDaMoeda,
  numero,
  objeto,
  ordenar,
  plural,
  rotuloPeriodo,
  secao,
  secaoTabela,
  semDadoDaParte,
  separarPorHoje,
  somaDisponivel,
  texto,
  traduzir,
  ultimasDuas,
} from './marketing-dados.js';
import { rotuloSemana } from './marketing-dados-google.js';

/** As partes do Google Ads, na ordem do FORMATO (todas alimentam o quadro). */
export const PARTES_ADS = Object.freeze([
  'conta', 'resumo', 'campanhas', 'grupos', 'anuncios', 'palavras', 'termos', 'conversoes', 'chamadas', 'leads', 'publico', 'locais', 'paginas',
  'horarios', 'pmax', 'organico', 'alteracoes',
]);

const STATUS = Object.freeze({ ENABLED: 'ativa', PAUSED: 'pausada', REMOVED: 'removida' });
const SITUACAO = Object.freeze({
  ELIGIBLE: 'veiculando', PAUSED: 'pausada', REMOVED: 'removida', ENDED: 'encerrada', PENDING: 'pendente', MISCONFIGURED: 'mal configurada',
  LIMITED: 'limitada', LEARNING: 'aprendendo', NOT_ELIGIBLE: 'não qualificada',
});
const TIPO_CAMPANHA = Object.freeze({
  SEARCH: 'Pesquisa', PERFORMANCE_MAX: 'Performance Max', DISPLAY: 'Display', VIDEO: 'Vídeo', SMART: 'Inteligente', SHOPPING: 'Shopping',
  DEMAND_GEN: 'Geração de demanda', LOCAL: 'Local', MULTI_CHANNEL: 'Várias redes', LOCAL_SERVICES: 'Serviços locais',
});
const SUBTIPO = Object.freeze({
  SEARCH_EXPRESS: 'Pesquisa Express', SMART_CAMPAIGN: 'inteligente', DISPLAY_SMART_CAMPAIGN: 'Display inteligente', DISPLAY_GMAIL_AD: 'Gmail',
  VIDEO_ACTION: 'vídeo de ação', VIDEO_NON_SKIPPABLE: 'vídeo não pulável', VIDEO_OUTSTREAM: 'vídeo fora do YouTube', VIDEO_SEQUENCE: 'sequência de vídeos',
  VIDEO_REACH_TARGET_FREQUENCY: 'vídeo de alcance', LOCAL_CAMPAIGN: 'local', SHOPPING_SMART_ADS: 'Shopping inteligente', SHOPPING_COMPARISON_LISTING_ADS: 'Shopping comparativo',
});
const VEICULACAO = Object.freeze({ SERVING: 'veiculando', NONE: 'sem veiculação', ENDED: 'encerrada', PENDING: 'pendente', SUSPENDED: 'suspensa' });
const MOTIVO = Object.freeze({
  CAMPAIGN_REMOVED: 'campanha removida', CAMPAIGN_PAUSED: 'campanha pausada', CAMPAIGN_PENDING: 'campanha pendente', CAMPAIGN_ENDED: 'campanha encerrada',
  CAMPAIGN_DRAFT: 'rascunho', BIDDING_STRATEGY_MISCONFIGURED: 'estratégia de lance mal configurada', BIDDING_STRATEGY_LIMITED: 'estratégia de lance limitada',
  BIDDING_STRATEGY_LEARNING: 'estratégia de lance aprendendo', BIDDING_STRATEGY_CONSTRAINED: 'estratégia de lance restrita', BUDGET_CONSTRAINED: 'limitada pelo orçamento',
  BUDGET_MISCONFIGURED: 'orçamento mal configurado', SEARCH_VOLUME_LIMITED: 'pouca busca', AD_GROUPS_PAUSED: 'grupos pausados', NO_AD_GROUPS: 'sem grupos',
  KEYWORDS_PAUSED: 'palavras pausadas', NO_KEYWORDS: 'sem palavras-chave', AD_GROUP_ADS_PAUSED: 'anúncios pausados', NO_AD_GROUP_ADS: 'sem anúncios',
  HAS_ADS_LIMITED_BY_POLICY: 'anúncios limitados pela política', HAS_ADS_DISAPPROVED: 'anúncios reprovados', MOST_ADS_UNDER_REVIEW: 'anúncios em análise',
  MISSING_LEAD_FORM_EXTENSION: 'falta o formulário de lead', MISSING_CALL_EXTENSION: 'falta a extensão de ligação', LEAD_FORM_EXTENSION_UNDER_REVIEW: 'formulário de lead em análise',
  LEAD_FORM_EXTENSION_DISAPPROVED: 'formulário de lead reprovado', CALL_EXTENSION_UNDER_REVIEW: 'extensão de ligação em análise', CALL_EXTENSION_DISAPPROVED: 'extensão de ligação reprovada',
  NO_ASSET_GROUPS: 'sem grupos de recursos', ASSET_GROUPS_PAUSED: 'grupos de recursos pausados', HAS_ASSET_GROUPS_DISAPPROVED: 'grupos de recursos reprovados',
  HAS_ASSET_GROUPS_LIMITED_BY_POLICY: 'grupos de recursos limitados pela política', MOST_ASSET_GROUPS_UNDER_REVIEW: 'grupos de recursos em análise',
});
const ENTREGA = Object.freeze({ STANDARD: 'padrão', ACCELERATED: 'acelerada' });
const CORRESPONDENCIA = Object.freeze({ EXACT: 'exata', PHRASE: 'frase', BROAD: 'ampla', NEAR_EXACT: 'variação da exata', NEAR_PHRASE: 'variação da frase' });
const FORCA = Object.freeze({ EXCELLENT: 'excelente', GOOD: 'boa', AVERAGE: 'média', POOR: 'fraca', PENDING: 'pendente', NO_ADS: 'sem anúncio' });
const APROVACAO = Object.freeze({ APPROVED: 'aprovado', APPROVED_LIMITED: 'aprovado com limite', DISAPPROVED: 'reprovado', AREA_OF_INTEREST_ONLY: 'só na área de interesse', UNDER_REVIEW: 'em análise', PENDING_REVIEW: 'em revisão' });
const VEICULACAO_PALAVRA = Object.freeze({ ELIGIBLE: 'qualificada', RARELY_SERVED: 'raramente veiculada' });
const STATUS_TERMO = Object.freeze({ ADDED: 'virou palavra-chave', EXCLUDED: 'excluído', ADDED_EXCLUDED: 'adicionado e excluído', NONE: 'nenhuma ação' });
const TIPO_GRUPO = Object.freeze({
  SEARCH_STANDARD: 'Pesquisa', SEARCH_DYNAMIC_ADS: 'Pesquisa dinâmica', DISPLAY_STANDARD: 'Display', SHOPPING_PRODUCT_ADS: 'Shopping',
  VIDEO_TRUE_VIEW_IN_STREAM: 'vídeo in-stream', VIDEO_BUMPER: 'vídeo curto (bumper)', VIDEO_RESPONSIVE: 'vídeo responsivo', VIDEO_NON_SKIPPABLE_IN_STREAM: 'vídeo não pulável',
  SMART_CAMPAIGN_ADS: 'inteligente',
});
const QUALIDADE = Object.freeze({ ABOVE_AVERAGE: 'acima da média', AVERAGE: 'na média', BELOW_AVERAGE: 'abaixo da média', UNKNOWN: 'sem nota', UNSPECIFIED: 'sem nota' });
// O tipo do anúncio (ad.type), com o nome da tela do Google Ads.
const TIPO_ANUNCIO = Object.freeze({
  RESPONSIVE_SEARCH_AD: 'Pesquisa responsivo', EXPANDED_TEXT_AD: 'texto expandido', TEXT_AD: 'texto', CALL_AD: 'só chamada',
  RESPONSIVE_DISPLAY_AD: 'Display responsivo', IMAGE_AD: 'imagem', VIDEO_AD: 'vídeo', VIDEO_RESPONSIVE_AD: 'vídeo responsivo',
  EXPANDED_DYNAMIC_SEARCH_AD: 'Pesquisa dinâmica', SMART_CAMPAIGN_AD: 'campanha inteligente', APP_AD: 'app', LOCAL_AD: 'local',
  DEMAND_GEN_MULTI_ASSET_AD: 'Geração de demanda', DEMAND_GEN_CAROUSEL_AD: 'carrossel (Geração de demanda)', DEMAND_GEN_VIDEO_RESPONSIVE_AD: 'vídeo (Geração de demanda)',
  DEMAND_GEN_PRODUCT_AD: 'produto (Geração de demanda)', SHOPPING_PRODUCT_AD: 'Shopping', SHOPPING_SMART_AD: 'Shopping inteligente', HOTEL_AD: 'hotel',
  LEGACY_RESPONSIVE_DISPLAY_AD: 'Display responsivo antigo', LEGACY_APP_INSTALL_AD: 'instalação de app (antigo)', GMAIL_AD: 'Gmail', HTML5_UPLOAD_AD: 'HTML5',
  IN_FEED_VIDEO_AD: 'vídeo no feed', VIDEO_BUMPER_AD: 'vídeo curto (bumper)', VIDEO_NON_SKIPPABLE_IN_STREAM_AD: 'vídeo não pulável',
  VIDEO_TRUEVIEW_IN_STREAM_AD: 'vídeo in-stream',
});
// Os campos que mudaram numa alteração da conta (changedFields, o caminho
// da API: "keyword.text", "amountMicros"), com o nome de gente; o caminho
// que o mapa não conhece cai no último pedaço, e daí em "outro campo".
const CAMPOS_ADS = Object.freeze({
  amountMicros: 'valor do orçamento', status: 'situação', name: 'nome', cpcBidMicros: 'lance de CPC', cpmBidMicros: 'lance de CPM', cpvBidMicros: 'lance de CPV',
  targetCpaMicros: 'CPA desejado', targetRoas: 'ROAS desejado', 'keyword.text': 'texto da palavra-chave', 'keyword.matchType': 'correspondência', text: 'texto',
  matchType: 'correspondência', negative: 'palavra negativa', finalUrls: 'links finais', finalMobileUrls: 'links finais no celular',
  trackingUrlTemplate: 'modelo de rastreamento', finalUrlSuffix: 'sufixo do link final', headlines: 'títulos', descriptions: 'descrições',
  path1: 'caminho exibido', path2: 'caminho exibido', startDate: 'início', endDate: 'fim', startDateTime: 'início', endDateTime: 'fim',
  biddingStrategyType: 'estratégia de lance', campaignBudget: 'orçamento', deliveryMethod: 'entrega do orçamento', period: 'período do orçamento',
  networkSettings: 'redes', targetSearchNetwork: 'parceiros de pesquisa', targetContentNetwork: 'rede de Display', geoTargetConstant: 'local',
  languageConstant: 'idioma', adSchedule: 'programação', dayOfWeek: 'dia da semana', startHour: 'hora de início', endHour: 'hora de fim', bidModifier: 'ajuste de lance',
  type: 'tipo', url: 'link', phoneNumber: 'telefone', countryCode: 'país do telefone', callTrackingEnabled: 'rastreamento de chamadas', sitelinkAsset: 'sitelink',
  linkText: 'texto do link', calloutText: 'frase de destaque', proximity: 'raio', radius: 'raio', locationGroup: 'grupo de locais', excludedParentAssetFieldTypes: 'recursos excluídos',
});
/** O nome de gente de um campo alterado na conta do Google Ads. */
export function nomeDoCampoAds(caminho) {
  const c = String(caminho ?? '').trim();
  if (!c) return null;
  const ultimo = c.split('.').pop();
  return conhecido(CAMPOS_ADS, c) ?? conhecido(CAMPOS_ADS, ultimo) ?? (/Micros$/.test(ultimo) ? 'valor' : 'outro campo');
}
const APARELHO = Object.freeze({ MOBILE: 'celular', DESKTOP: 'computador', TABLET: 'tablet', CONNECTED_TV: 'TV', OTHER: 'outro' });
const REDE = Object.freeze({ SEARCH: 'Pesquisa', SEARCH_PARTNERS: 'parceiros de pesquisa', CONTENT: 'Display', YOUTUBE: 'YouTube', YOUTUBE_SEARCH: 'YouTube', YOUTUBE_WATCH: 'YouTube', MIXED: 'várias' });
const IDADE = Object.freeze({
  AGE_RANGE_18_24: '18 a 24', AGE_RANGE_25_34: '25 a 34', AGE_RANGE_35_44: '35 a 44', AGE_RANGE_45_54: '45 a 54', AGE_RANGE_55_64: '55 a 64',
  AGE_RANGE_65_UP: '65 ou mais', AGE_RANGE_UNDETERMINED: 'não informada',
});
const GENERO = Object.freeze({ MALE: 'masculino', FEMALE: 'feminino', UNDETERMINED: 'não informado' });
const DIA_SEMANA = Object.freeze({ MONDAY: 'segunda', TUESDAY: 'terça', WEDNESDAY: 'quarta', THURSDAY: 'quinta', FRIDAY: 'sexta', SATURDAY: 'sábado', SUNDAY: 'domingo' });
const CATEGORIA_CONV = Object.freeze({
  SUBMIT_LEAD_FORM: 'formulário', REQUEST_QUOTE: 'pedido de orçamento', PHONE_CALL_LEAD: 'ligação', CONTACT: 'contato', BOOK_APPOINTMENT: 'agendamento',
  PAGE_VIEW: 'visita a página', QUALIFIED_LEAD: 'lead qualificado', CONVERTED_LEAD: 'lead convertido', IMPORTED_LEAD: 'lead importado', PURCHASE: 'compra',
  DEFAULT: 'padrão', OTHER: 'outra', SIGNUP: 'cadastro', DOWNLOAD: 'download', GET_DIRECTIONS: 'rota', OUTBOUND_CLICK: 'clique de saída',
});
const TIPO_CONV = Object.freeze({
  WEBPAGE: 'página do site', AD_CALL: 'ligação pelo anúncio', CLICK_TO_CALL: 'clique para ligar', WEBSITE_CALL: 'ligação pelo site',
  GOOGLE_ANALYTICS_4_CUSTOM: 'evento do GA4', GOOGLE_ANALYTICS_4_PURCHASE: 'compra do GA4', UPLOAD_CLICKS: 'importada (cliques)', UPLOAD_CALLS: 'importada (ligações)',
  STORE_VISITS: 'visitas à loja', GOOGLE_HOSTED: 'do Google', SMART_CAMPAIGN_AD_CLICKS_TO_CALL: 'clique para ligar (inteligente)',
  SMART_CAMPAIGN_MAP_CLICKS_TO_CALL: 'clique para ligar no mapa', SMART_CAMPAIGN_MAP_DIRECTIONS: 'rota no mapa', SMART_CAMPAIGN_TRACKED_CALLS: 'ligação rastreada',
});
const ORIGEM_CONV = Object.freeze({ WEBSITE: 'site', GOOGLE_HOSTED: 'Google', APP: 'aplicativo', CALL_FROM_ADS: 'ligação pelo anúncio', STORE: 'loja', YOUTUBE_HOSTED: 'YouTube' });
const ATRIBUICAO = Object.freeze({ GOOGLE_ADS_LAST_CLICK: 'último clique', GOOGLE_SEARCH_ATTRIBUTION_DATA_DRIVEN: 'baseada em dados', EXTERNAL: 'externa' });
const LANCE = Object.freeze({
  MAXIMIZE_CONVERSIONS: 'maximizar conversões', MANUAL_CPC: 'CPC manual', TARGET_CPA: 'CPA desejado', MAXIMIZE_CONVERSION_VALUE: 'maximizar valor',
  TARGET_ROAS: 'ROAS desejado', TARGET_SPEND: 'maximizar cliques', TARGET_IMPRESSION_SHARE: 'parcela de impressões', ENHANCED_CPC: 'CPC otimizado',
});
const CAMPO_LEAD = Object.freeze({ FULL_NAME: 'nome', FIRST_NAME: 'nome', LAST_NAME: 'sobrenome', EMAIL: 'e-mail', PHONE_NUMBER: 'telefone', CITY: 'cidade', POSTAL_CODE: 'CEP', COMPANY_NAME: 'empresa', JOB_TITLE: 'cargo' });
const TIPO_LIGACAO = Object.freeze({ MANUALLY_DIALED: 'discada', HIGH_END_MOBILE_SEARCH: 'tocou para ligar' });
const ORIGEM_LIGACAO = Object.freeze({ AD: 'pelo anúncio', LANDING_PAGE: 'pelo site' });
const RECURSO = Object.freeze({
  CAMPAIGN: 'campanha', CAMPAIGN_BUDGET: 'orçamento', AD_GROUP: 'grupo de anúncios', AD_GROUP_AD: 'anúncio', AD_GROUP_CRITERION: 'palavra ou segmentação',
  CAMPAIGN_CRITERION: 'segmentação da campanha', ASSET: 'recurso', AD_GROUP_ASSET: 'recurso do grupo', CAMPAIGN_ASSET: 'recurso da campanha',
});
const OPERACAO = Object.freeze({ CREATE: 'criou', UPDATE: 'alterou', REMOVE: 'removeu' });
const CLIENTE = Object.freeze({
  GOOGLE_ADS_WEB_CLIENT: 'site do Google Ads', GOOGLE_ADS_AUTOMATED_RULE: 'regra automática', GOOGLE_ADS_SCRIPTS: 'script', GOOGLE_ADS_BULK_UPLOAD: 'envio em lote',
  GOOGLE_ADS_API: 'API', GOOGLE_ADS_EDITOR: 'Google Ads Editor', GOOGLE_ADS_MOBILE_APP: 'aplicativo do celular', GOOGLE_ADS_RECOMMENDATIONS: 'recomendação aplicada',
  GOOGLE_ADS_RECOMMENDATIONS_SUBSCRIPTION: 'recomendação automática', SEARCH_ADS_360_SYNC: 'Search Ads 360', SEARCH_ADS_360_POST: 'Search Ads 360',
  INTERNAL_TOOL: 'equipe do Google', OTHER: 'outro',
});

// A situação de serviço manda; sem ela, o status. O código que nenhum dos
// dois mapas conhece vira "outra situação" (antes ia o código cru, e o
// segundo mapa nem era consultado: o primeiro devolvia o código).
const situacao = (l) => conhecido(SITUACAO, l.situacao) ?? conhecido(STATUS, l.status) ?? (l.situacao || l.status ? 'outra situação' : null);
const tomSituacao = (l) => (l.status === 'REMOVED' || l.situacao === 'NOT_ELIGIBLE' || l.situacao === 'MISCONFIGURED' ? 'warn' : null);
const tomPerdida = (p) => (objeto(p) && (p.maisDe90 === true || (medida(p.valor) ?? 0) >= 0.5) ? 'warn' : null);
const recentesPrimeiro = (linhas, campo) => [...lista(linhas)].filter(objeto).sort((a, b) => String(b[campo] ?? '').localeCompare(String(a[campo] ?? '')));

/* ------------------------------------------------- as campanhas por dentro -- */

/** A parcela de impressões das campanhas de Pesquisa, semana a semana: uma
 *  linha por campanha e semana (a campanha que mais gastou primeiro; dentro
 *  dela, a semana mais nova primeiro). Nenhuma campanha com a lista (a
 *  consulta não rodou ou foi recusada): null, que a tela diz "não medido";
 *  listas vazias: [] (medido, e nenhuma campanha de Pesquisa com parcela). */
export function linhasDaParcela(campanhas) {
  const l = lista(campanhas).filter(objeto);
  if (!l.some((c) => Array.isArray(c.parcela))) return null;
  return ordenar(l, (c) => c.totais?.gasto).flatMap((c) =>
    recentesPrimeiro(c.parcela, 'semana').map((p) => ({ ...p, campanha: c.nome, campanhaId: c.id }))
  );
}

/** As campanhas de vídeo (as que trazem o "video" do conector), prontas para
 *  a tabela: os quartis saem do objeto e o alcance da campanha vai junto. */
export function linhasDeVideo(campanhas) {
  return ordenar(lista(campanhas).filter((c) => objeto(c) && objeto(c.video)), (c) => c.totais?.gasto).map((c) => {
    const q = objeto(c.video.quartis) ? c.video.quartis : {};
    return { ...c.video, id: c.id, campanha: c.nome, alcance: c.alcance ?? null, p25: q.p25 ?? null, p50: q.p50 ?? null, p75: q.p75 ?? null, p100: q.p100 ?? null };
  });
}

/** As campanhas da Rede de Display (as que trazem o "display"), com a
 *  parcela ganha e as perdidas. */
export function linhasDeDisplay(campanhas) {
  return ordenar(lista(campanhas).filter((c) => objeto(c) && objeto(c.display)), (c) => c.totais?.gasto)
    .map((c) => ({ ...c.display, id: c.id, campanha: c.nome, alcance: c.alcance ?? null }));
}

/** O dia a dia de cada campanha (campanhas[].dias), do dia mais novo para o
 *  mais velho. */
export function diasDasCampanhas(campanhas) {
  return lista(campanhas).filter(objeto)
    .flatMap((c) => lista(c.dias).filter(objeto).map((d) => ({ ...d, campanha: c.nome, campanhaId: c.id })))
    .sort((a, b) => String(b.data ?? '').localeCompare(String(a.data ?? '')) || String(a.campanha ?? '').localeCompare(String(b.campanha ?? '')));
}

function corpoAds(d, l, hoje) {
  const conta = objeto(d.conta) ? d.conta : {};
  const moeda = texto(conta.moeda, 3) || 'BRL';
  const per = objeto(conta.periodo) ? conta.periodo : {};
  const r = objeto(d.resumo) ? d.resumo : null;
  const t = objeto(r?.totais) ? r.totais : {};
  const m = (campo, rotulo, tipo = 'int', extra = {}) => numero({ id: campo, rotulo, tipo, valor: t[campo], moeda, ...extra });
  const { atual, anterior } = ultimasDuas(r?.semanas, 'semana', (s) => s.fechada === true);
  const comparar = (campo) => (anterior ? anterior[campo] : undefined);
  const semDado = (parte) => semDadoDaParte(l, parte);
  const tabelaDaParte = (parte, id, titulo, linhas, colunas, opcoes = {}) =>
    secaoTabela(id, titulo, linhas, colunas, { moeda, hoje, semDado: semDado(parte), ...opcoes });

  const camp = objeto(d.campanhas) ? d.campanhas : null;
  const termos = objeto(d.termos) ? d.termos : null;
  const conv = objeto(d.conversoes) ? d.conversoes : null;
  const ch = objeto(d.chamadas) ? d.chamadas : null;
  const leads = objeto(d.leads) ? d.leads : null;
  const pub = objeto(d.publico) ? d.publico : null;
  const alt = objeto(d.alteracoes) ? d.alteracoes : null;
  const grade = objeto(d.horarios) ? lista(d.horarios.grade).filter(objeto) : null;
  const leadsRestritos = leads && objeto(leads.restrito) && objeto(leads.restrito.porId) ? Object.values(leads.restrito.porId).filter(objeto) : null;
  // As métricas comuns do FORMATO ({...metricas}), na mesma ordem em toda
  // tabela.
  const COLS_METRICAS = [
    col('gasto', 'Gasto', 'moeda'),
    col('impressoes', 'Impressões', 'int'),
    col('cliques', 'Cliques', 'int'),
    col('ctr', 'CTR', 'fracao'),
    col('cpcMedio', 'CPC médio', 'moeda'),
    col('conversoes', 'Conversões', 'num2'),
    col('custoPorConversao', 'Custo por conversão', 'moeda'),
    col('valorConversoes', 'Valor das conversões', 'moeda'),
  ];
  const cortadas = (n, nome) => (medida(n) ? `${plural(medida(n), nome[0], nome[1])} ficaram fora pelo teto da lista.` : null);
  const outros = termos && Array.isArray(termos.outros) ? termos.outros.filter(objeto).map((o) => ({ ...o, termo: 'Outros termos (pouca busca)', outros: true })) : [];
  const listaCampanhas = camp ? lista(camp.lista).filter(objeto) : [];
  const comAlcance = listaCampanhas.some((c) => medida(c.alcance) !== null);
  const parcela = camp ? linhasDaParcela(listaCampanhas) : null;
  const video = linhasDeVideo(listaCampanhas);
  const display = linhasDeDisplay(listaCampanhas);
  const diasCampanhas = diasDasCampanhas(listaCampanhas);
  const diasConta = r && Array.isArray(r.dias) ? recentesPrimeiro(r.dias, 'data') : null;
  const cortadosTermos = objeto(termos?.cortados) && medida(termos.cortados.quantidade) ? termos.cortados : null;

  const topo = [
    blocoNumeros([
      m('gasto', 'Gasto', 'moeda', { titulo: 'Gasto no período, na moeda da conta.' }),
      m('cliques', 'Cliques'),
      m('impressoes', 'Impressões'),
      m('interacoes', 'Interações', 'int', { titulo: 'Em anúncio de Pesquisa a interação é o clique; em vídeo, a visualização.' }),
      m('conversoes', 'Conversões', 'num2', { titulo: 'Conversões das ações principais (decimais pela atribuição por dados).' }),
      m('todasConversoes', 'Todas as conversões', 'num2', { titulo: 'Com as ações secundárias, que não entram em "Conversões".' }),
      m('ctr', 'CTR', 'fracao'),
      m('cpcMedio', 'CPC médio', 'moeda'),
      m('custoPorConversao', 'Custo por conversão', 'moeda'),
      m('valorConversoes', 'Valor das conversões', 'moeda'),
    ], `Período ${rotuloPeriodo(per.inicio, per.fim, hoje) ?? 'da coleta'} (as 8 semanas fechadas e a atual)`),
    atual
      ? blocoNumeros([
        numero({ id: 's-gasto', rotulo: 'Gasto', tipo: 'moeda', moeda, valor: atual.gasto, anterior: comparar('gasto'), subirE: 'neutro' }),
        numero({ id: 's-cliques', rotulo: 'Cliques', valor: atual.cliques, anterior: comparar('cliques') }),
        numero({ id: 's-conversoes', rotulo: 'Conversões', tipo: 'num2', valor: atual.conversoes, anterior: comparar('conversoes') }),
        numero({ id: 's-custo', rotulo: 'Custo por conversão', tipo: 'moeda', moeda, valor: atual.custoPorConversao, anterior: comparar('custoPorConversao'), subirE: 'ruim' }),
      ], rotuloSemana(atual.semana, anterior?.semana, hoje))
      : null,
    blocoGrafico(r?.semanas, { x: 'semana', y: 'gasto', titulo: 'Gasto por semana', tipo: 'moeda', moeda, hoje, fraco: (s) => s.fechada === false }),
    blocoAvisos([
      conta.teste === true && { nivel: 'atencao', texto: 'Esta é uma conta de teste do Google Ads.' },
      conta.tagConfere === false && { nivel: 'atencao', texto: 'A tag AW- desta conta não é a que está no site: as conversões do site podem estar indo para outra conta.' },
      texto(conta.viaGerente, 30) && { nivel: 'info', texto: `O acesso passa pela conta de administrador ${texto(conta.viaGerente, 30)}.` },
      conta.relatorioChamadas === false && { nivel: 'info', texto: 'O relatório de chamadas está desligado na conta: as ligações ficam sem número.' },
    ]),
  ];

  const secoes = [
    tabelaDaParte('campanhas', 'campanhas', 'Campanhas', camp ? ordenar(camp.lista, (x) => x.totais?.gasto) : null, [
      col('nome', 'Campanha', 'texto', { max: 120 }),
      col('tipo', 'Tipo', 'texto', { valor: (x) => traduzir(TIPO_CAMPANHA, x.tipo, 'outro tipo') }),
      col('situacao', 'Situação', 'texto', { valor: situacao, tom: tomSituacao }),
      col('orcamento', 'Orçamento', 'texto', { valor: (x) => (objeto(x.orcamento) && medida(x.orcamento.valor) !== null ? `${formatar('moeda', x.orcamento.valor, { moeda })} ${traduzir({ DAILY: 'por dia', CUSTOM_PERIOD: 'no período' }, x.orcamento.periodo, 'em outro período') ?? ''}`.trim() : null), numerico: true }),
      col('lance', 'Lance', 'texto', { valor: (x) => traduzir(LANCE, x.lance, 'outra estratégia') }),
      col('gasto', 'Gasto', 'moeda', { valor: (x) => x.totais?.gasto }),
      col('impressoes', 'Impressões', 'int', { valor: (x) => x.totais?.impressoes }),
      col('cliques', 'Cliques', 'int', { valor: (x) => x.totais?.cliques }),
      col('ctr', 'CTR', 'fracao', { valor: (x) => x.totais?.ctr }),
      col('cpc', 'CPC médio', 'moeda', { valor: (x) => x.totais?.cpcMedio }),
      col('conversoes', 'Conversões', 'num2', { valor: (x) => x.totais?.conversoes }),
      col('custo', 'Custo por conversão', 'moeda', { valor: (x) => x.totais?.custoPorConversao }),
      col('valor', 'Valor das conversões', 'moeda', { valor: (x) => x.totais?.valorConversoes }),
      col('todas', 'Todas as conversões', 'num2', { valor: (x) => x.totais?.todasConversoes }),
      col('interacoes', 'Interações', 'int', { valor: (x) => x.totais?.interacoes }),
      col('ligacoes', 'Ligações', 'int', { valor: (x) => x.totais?.ligacoes }),
      ...(comAlcance ? [col('alcance', 'Pessoas alcançadas', 'int', { titulo: () => 'Pessoas únicas no período: só campanhas de Display e de vídeo.' })] : []),
      col('otimizacao', 'Otimização', 'fracao', { casas: 0 }),
    ], { aberta: true, unidade: ['campanha', 'campanhas'], vazio: 'Nenhuma campanha com gasto no período.', nota: [cortadas(camp?.cortadas, ['campanha', 'campanhas']), comAlcance ? 'Pessoas alcançadas só existe em Display e vídeo, e não soma entre campanhas.' : null].filter(Boolean).join(' ') || null }),
    camp
      ? secaoTabela('parcela', 'Parcela de impressões', parcela, [
        col('campanha', 'Campanha', 'texto', { max: 80 }),
        col('semana', 'Semana de', 'dia'),
        col('impressoes', 'Parcela de impressões', 'parcela'),
        col('topo', 'No topo', 'parcela'),
        col('topoAbsoluto', 'Em primeiro', 'parcela'),
        col('perdidaOrcamento', 'Perdida por orçamento', 'perdida', { tom: (x) => tomPerdida(x.perdidaOrcamento) }),
        col('perdidaClassificacao', 'Perdida por classificação', 'perdida', { tom: (x) => tomPerdida(x.perdidaClassificacao) }),
      ], {
        hoje, limite: 9, unidade: ['semana', 'semanas'], chave: (x, i) => `${x.campanhaId ?? ''}-${x.semana ?? i}`,
        semDado: 'Não medida nesta coleta (a consulta da parcela não rodou ou foi recusada).',
        vazio: 'Nenhuma campanha de Pesquisa com parcela medida no período.',
        nota: 'Só campanhas de Pesquisa, nas semanas fechadas. O Google não diz o número exato abaixo de 10% (parcela ganha) nem acima de 90% (perdida). No topo: acima dos resultados orgânicos; em primeiro: na primeira posição.',
      })
      : secao('parcela', 'Parcela de impressões', [blocoTexto(semDado('campanhas'))], { resumo: 'não veio' }),
    video.length || display.length
      ? secao('video_display', 'Vídeo e Display', [
        video.length
          ? blocoTabela(video, [
            col('campanha', 'Campanha', 'texto', { max: 80 }),
            col('alcance', 'Pessoas alcançadas', 'int'),
            col('visualizacoes', 'Visualizações', 'int'),
            col('taxaVisualizacao', 'Taxa de visualização', 'fracao'),
            col('cpvMedio', 'CPV médio', 'moeda'),
            col('p25', 'Viram 25%', 'fracao', { casas: 0 }),
            col('p50', 'Viram 50%', 'fracao', { casas: 0 }),
            col('p75', 'Viram 75%', 'fracao', { casas: 0 }),
            col('p100', 'Viram até o fim', 'fracao', { casas: 0 }),
            col('curtidas', 'Curtidas', 'int'),
            col('comentarios', 'Comentários', 'int'),
            col('compartilhamentos', 'Compartilhamentos', 'int'),
          ], { moeda, chave: 'id', titulo: 'Vídeo (YouTube)', nota: 'CPV: o custo por visualização. "Viram 25%" é a parte das impressões em que o vídeo chegou a um quarto, e assim por diante.' })
          : null,
        display.length
          ? blocoTabela(display, [
            col('campanha', 'Campanha', 'texto', { max: 80 }),
            col('alcance', 'Pessoas alcançadas', 'int'),
            col('parcela', 'Parcela de impressões', 'parcela'),
            col('perdidaOrcamento', 'Perdida por orçamento', 'perdida', { tom: (x) => tomPerdida(x.perdidaOrcamento) }),
            col('perdidaClassificacao', 'Perdida por classificação', 'perdida', { tom: (x) => tomPerdida(x.perdidaClassificacao) }),
          ], { chave: 'id', titulo: 'Rede de Display' })
          : null,
      ], { resumo: plural(video.length + display.length, 'campanha', 'campanhas') })
      : null,
    camp
      ? secaoTabela('config', 'Configuração das campanhas', ordenar(camp.lista, (x) => x.totais?.gasto), [
        col('nome', 'Campanha', 'texto', { max: 120 }),
        col('status', 'Status', 'texto', { valor: (x) => traduzir(STATUS, x.status, 'outra situação') }),
        col('subtipo', 'Subtipo', 'texto', { valor: (x) => traduzir(SUBTIPO, x.subtipo, 'outro subtipo') }),
        col('veiculacao', 'Veiculação', 'texto', { valor: (x) => traduzir(VEICULACAO, x.veiculacao, 'outra situação'), tom: (x) => (x.veiculacao === 'SUSPENDED' ? 'bad' : null) }),
        col('motivos', 'Motivos da situação', 'texto', { valor: (x) => [...new Set(lista(x.motivos).map((k) => traduzir(MOTIVO, k, 'outro motivo')).filter(Boolean))].join(', ') || null, max: 300 }),
        col('entrega', 'Entrega do orçamento', 'texto', { valor: (x) => traduzir(ENTREGA, x.orcamento?.entrega, 'outra forma') }),
        col('recomendado', 'Orçamento recomendado', 'moeda', { valor: (x) => x.orcamento?.recomendado }),
        col('inicio', 'Início', 'dia'),
        col('fim', 'Fim', 'dia'),
      ], { moeda, hoje, unidade: ['campanha', 'campanhas'], vazio: 'Nenhuma campanha com gasto no período.', nota: 'Orçamento recomendado: o que o Google sugere quando a campanha está limitada pelo orçamento.' })
      : null,
    tabelaDaParte('termos', 'termos', 'Termos de pesquisa', termos ? [...ordenar(termos.lista, 'cliques'), ...outros] : null, [
      col('termo', 'Termo', 'texto', { max: 120 }),
      col('status', 'Situação', 'texto', { valor: (x) => traduzir(STATUS_TERMO, x.status, 'outra situação') }),
      col('campanha', 'Campanha', 'texto', { max: 80 }),
      col('grupos', 'Grupos', 'texto', { valor: (x) => lista(x.grupos).join(', ') || null, max: 200 }),
      col('palavras', 'Palavra que acionou', 'texto', { valor: (x) => lista(x.palavras).filter(objeto).map((p) => { const c = traduzir(CORRESPONDENCIA, p.correspondencia, 'outra correspondência'); return `${texto(p.texto, 80) ?? 'sem texto'}${c ? ` (${c})` : ''}`; }).join(', ') || null }),
      col('tipos', 'Correspondência do termo', 'texto', { valor: (x) => [...new Set(lista(x.tiposCorrespondencia).map((k) => traduzir(CORRESPONDENCIA, k, 'outra correspondência')).filter(Boolean))].join(', ') || null }),
      ...COLS_METRICAS,
    ], {
      unidade: ['termo', 'termos'], vazio: 'Nenhum termo de pesquisa no período.', chave: (x, i) => `${x.outros ? 'outros-' : ''}${x.campanhaId ?? ''}-${x.termo}-${i}`,
      nota: [
        'O Google esconde os termos com pouca busca: a linha "Outros termos" é a diferença entre o total de cada campanha de Pesquisa e a soma dos termos.',
        cortadosTermos
          ? `${plural(medida(cortadosTermos.quantidade), 'termo ficou', 'termos ficaram')} fora pelo teto da lista: somam ${formatar('int', cortadosTermos.impressoes)} impressões, ${formatar('int', cortadosTermos.cliques)} cliques, ${formatar('moeda', cortadosTermos.gasto, { moeda })} e ${formatar('num2', cortadosTermos.conversoes)} conversões.`
          : null,
      ].filter(Boolean).join(' '),
    }),
    termos && Array.isArray(termos.pmax)
      ? secaoTabela('termos_pmax', 'Termos da Performance Max', ordenar(termos.pmax, 'cliques'), [col('termo', 'Termo', 'texto', { max: 120 }), col('campanha', 'Campanha', 'texto', { max: 80 }), ...COLS_METRICAS], { moeda, unidade: ['termo', 'termos'], vazio: 'Nenhum termo da Performance Max no período.' })
      : null,
    termos && Array.isArray(termos.smart)
      ? secaoTabela('termos_smart', 'Termos das campanhas inteligentes', ordenar(termos.smart, 'cliques'), [col('termo', 'Termo', 'texto', { max: 120 }), col('campanha', 'Campanha'), col('impressoes', 'Impressões', 'int'), col('cliques', 'Cliques', 'int'), col('gasto', 'Gasto', 'moeda')], { moeda, unidade: ['termo', 'termos'] })
      : null,
    termos && Array.isArray(termos.categorias)
      ? secaoTabela('categorias', 'Categorias de busca', ordenar(termos.categorias, 'cliques'), [
        col('categoria', 'Categoria', 'texto', { max: 120 }),
        col('volume', 'Buscas no mês', 'faixa', { numerico: true }),
        col('impressoes', 'Impressões', 'int'),
        col('cliques', 'Cliques', 'int'),
        col('conversoes', 'Conversões', 'num2'),
      ], { unidade: ['categoria', 'categorias'], nota: 'O volume é uma faixa: o Google não diz o número exato.' })
      : null,
    tabelaDaParte('resumo', 'semanas', 'Por semana', r ? [...lista(r.semanas)].filter(objeto).reverse() : null, [
      col('semana', 'Semana de', 'dia'),
      colSemanaFechada('fechada', 'em andamento', { hoje }),
      col('atividade', 'Teve anúncio', 'sim', { tom: (s) => (s.atividade === false ? 'warn' : null) }),
      ...COLS_METRICAS,
      col('interacoes', 'Interações', 'int'),
      col('todasConversoes', 'Todas as conversões', 'num2'),
      col('parcelaImpressoes', 'Parcela de impressões', 'parcela'),
      col('ligacoes', 'Ligações', 'int'),
      col('contatos', 'Contatos', 'num2'),
      col('leadsSemana', 'Leads da semana', 'num2', { valor: (s) => s.numeros?.leads }),
      col('conversasSemana', 'Conversas da semana', 'num2', { valor: (s) => s.numeros?.conversas }),
      col('ligacoesPeloAnuncio', 'Toques para ligar', 'num2'),
      col('rotas', 'Pedidos de rota', 'num2'),
      col('siteDaLoja', 'Site da loja', 'num2'),
      col('cliquesInvalidos', 'Cliques inválidos', 'int'),
      col('taxaCliquesInvalidos', 'Taxa de cliques inválidos', 'fracao'),
    ], { unidade: ['semana', 'semanas'], nota: 'As conversões mudam por dias depois do clique: as semanas são refeitas a cada coleta. Leads e conversas da semana seguem a régua de "Sobre a conta". Toques para ligar, pedidos de rota e site da loja são conversões dessas ações.' }),
    tabelaDaParte('grupos', 'grupos', 'Grupos de anúncios', objeto(d.grupos) ? ordenar(d.grupos.lista, 'gasto') : null, [
      col('nome', 'Grupo', 'texto', { max: 100 }),
      col('campanha', 'Campanha', 'texto', { max: 80 }),
      col('tipo', 'Tipo', 'texto', { valor: (x) => traduzir(TIPO_GRUPO, x.tipo, 'outro tipo') }),
      col('situacao', 'Situação', 'texto', { valor: situacao, tom: tomSituacao }),
      ...COLS_METRICAS,
      col('interacoes', 'Interações', 'int'),
      col('ligacoes', 'Ligações', 'int'),
    ], { unidade: ['grupo', 'grupos'], vazio: 'Nenhum grupo com gasto no período.', nota: cortadas(d.grupos?.cortados, ['grupo', 'grupos']) }),
    tabelaDaParte('anuncios', 'anuncios', 'Anúncios', objeto(d.anuncios) ? ordenar(d.anuncios.lista, 'gasto') : null, [
      col('titulo', 'Anúncio', 'texto', { valor: (x) => lista(x.titulos)[0] || x.nome, link: (x) => x.link, titulo: (x) => lista(x.titulos).join(' | ') || null, max: 100 }),
      col('tipo', 'Tipo', 'texto', { valor: (x) => traduzir(TIPO_ANUNCIO, x.tipo, 'outro tipo') }),
      col('situacao', 'Situação', 'texto', { valor: situacao, tom: tomSituacao }),
      col('forca', 'Força', 'texto', { valor: (x) => traduzir(FORCA, x.forca, 'outra nota'), tom: (x) => (x.forca === 'POOR' ? 'warn' : null) }),
      col('aprovacao', 'Aprovação', 'texto', { valor: (x) => traduzir(APROVACAO, x.aprovacao, 'outra situação'), tom: (x) => (x.aprovacao === 'DISAPPROVED' ? 'bad' : null) }),
      col('grupo', 'Grupo', 'texto', { max: 80 }),
      col('campanha', 'Campanha', 'texto', { max: 80 }),
      col('titulos', 'Títulos', 'texto', { valor: (x) => lista(x.titulos).join(' | ') || null, max: 600 }),
      col('descricoes', 'Descrições', 'texto', { valor: (x) => lista(x.descricoes).join(' | ') || null, max: 600 }),
      col('caminho', 'Caminho exibido', 'texto', { valor: (x) => (lista(x.caminho).length ? `/${lista(x.caminho).join('/')}` : null) }),
      col('links', 'Outros links', 'texto', { valor: (x) => lista(x.links).slice(1).join(', ') || null, max: 300 }),
      ...COLS_METRICAS,
      col('interacoes', 'Interações', 'int'),
    ], { unidade: ['anúncio', 'anúncios'], vazio: 'Nenhum anúncio com gasto no período.', nota: cortadas(d.anuncios?.cortados, ['anúncio', 'anúncios']) }),
    tabelaDaParte('palavras', 'palavras', 'Palavras-chave', objeto(d.palavras) ? ordenar(d.palavras.lista, 'gasto') : null, [
      col('texto', 'Palavra', 'texto', { max: 100 }),
      col('correspondencia', 'Correspondência', 'texto', { valor: (x) => traduzir(CORRESPONDENCIA, x.correspondencia, 'outra correspondência') }),
      col('situacao', 'Situação', 'texto', {
        valor: (x) => [traduzir(STATUS, x.status, 'outra situação'), traduzir(VEICULACAO_PALAVRA, x.veiculacao, 'outra situação')].filter(Boolean).join(', ') || null,
        tom: (x) => (x.veiculacao === 'RARELY_SERVED' || x.status === 'REMOVED' ? 'warn' : null),
      }),
      col('aprovacao', 'Aprovação', 'texto', { valor: (x) => traduzir(APROVACAO, x.aprovacao, 'outra situação'), tom: (x) => (x.aprovacao === 'DISAPPROVED' ? 'bad' : null) }),
      col('grupo', 'Grupo', 'texto', { max: 80 }),
      col('campanha', 'Campanha', 'texto', { max: 80 }),
      col('qualidade', 'Índice de qualidade', 'texto', {
        valor: (x) => (objeto(x.qualidade) && medida(x.qualidade.nota) !== null ? `${formatar('int', x.qualidade.nota)} de 10` : null),
        titulo: (x) => (objeto(x.qualidade) ? `Anúncio ${traduzir(QUALIDADE, x.qualidade.anuncio, 'sem nota') ?? 'sem nota'}; página ${traduzir(QUALIDADE, x.qualidade.pagina, 'sem nota') ?? 'sem nota'}; CTR esperado ${traduzir(QUALIDADE, x.qualidade.ctrEsperado, 'sem nota') ?? 'sem nota'}` : null),
        tom: (x) => (objeto(x.qualidade) && medida(x.qualidade.nota) !== null ? (x.qualidade.nota >= 7 ? 'ok' : x.qualidade.nota >= 5 ? 'warn' : 'bad') : null),
        numerico: true,
      }),
      col('qAnuncio', 'Relevância do anúncio', 'texto', { valor: (x) => traduzir(QUALIDADE, x.qualidade?.anuncio, 'outra nota') }),
      col('qPagina', 'Experiência na página', 'texto', { valor: (x) => traduzir(QUALIDADE, x.qualidade?.pagina, 'outra nota') }),
      col('qCtr', 'CTR esperado', 'texto', { valor: (x) => traduzir(QUALIDADE, x.qualidade?.ctrEsperado, 'outra nota') }),
      col('lanceCpc', 'Lance', 'moeda'),
      col('cpcPrimeiraPagina', 'CPC da 1ª página', 'moeda'),
      col('parcelaImpressoes', 'Parcela de impressões', 'parcela'),
      ...COLS_METRICAS,
    ], { unidade: ['palavra', 'palavras'], vazio: 'Nenhuma palavra-chave com gasto no período.', nota: cortadas(d.palavras?.cortadas, ['palavra', 'palavras']) }),
    conv
      ? secao('conversoes', 'Conversões', [
        Array.isArray(conv.acoes)
          ? blocoTabela(conv.acoes.filter(objeto), [
            col('nome', 'Ação', 'texto', { max: 100 }),
            col('categoria', 'Categoria', 'texto', { valor: (x) => traduzir(CATEGORIA_CONV, x.categoria, 'outra categoria') }),
            col('tipo', 'Tipo', 'texto', { valor: (x) => traduzir(TIPO_CONV, x.tipo, 'outro tipo') }),
            col('origem', 'Origem', 'texto', { valor: (x) => traduzir(ORIGEM_CONV, x.origem, 'outra origem') }),
            col('principal', 'Principal', 'sim'),
            col('contaNasConversoes', 'Entra em "Conversões"', 'sim'),
            col('status', 'Situação', 'texto', { valor: (x) => traduzir(STATUS, x.status, 'outra situação') }),
            col('contagem', 'Conta', 'texto', { valor: (x) => traduzir({ ONE_PER_CLICK: 'uma por clique', MANY_PER_CLICK: 'todas' }, x.contagem, 'outra regra') }),
            col('valorPadrao', 'Valor padrão', 'moeda', { valor: (x) => x.valorPadrao, titulo: (x) => (texto(x.moeda, 3) && texto(x.moeda, 3) !== moeda ? `Em ${nomeDaMoeda(x.moeda)}.` : null) }),
            col('janelaCliqueDias', 'Janela (dias)', 'int'),
            col('atribuicao', 'Atribuição', 'texto', { valor: (x) => traduzir(ATRIBUICAO, x.atribuicao, 'outro modelo') }),
            col('eventoGa4', 'Evento do GA4', 'texto'),
            col('ultimaConversao', 'Última', 'dia'),
            col('todasConversoesHistorico', 'Desde sempre', 'num2'),
          ], { hoje, moeda, titulo: 'Ações de conversão' })
          : blocoTexto('Não veio nesta coleta.'),
        lista(conv.semanas).length
          ? blocoTabela(ordenar(agrupar(separarPorHoje(conv.semanas, 'semana', hoje).ate, (x) => `${x.acaoId ?? x.acao}`, ['conversoes', 'valorConversoes', 'todasConversoes'], (x) => ({ acao: x.acao, categoria: x.categoria })), 'conversoes'), [
            col('acao', 'Ação', 'texto', { max: 100 }),
            col('categoria', 'Categoria', 'texto', { valor: (x) => traduzir(CATEGORIA_CONV, x.categoria, 'outra categoria') }),
            col('conversoes', 'Conversões no período', 'num2'),
            col('valorConversoes', 'Valor', 'moeda'),
            col('todasConversoes', 'Todas as conversões', 'num2'),
          ], { moeda, titulo: 'No período', nota: 'Somadas nas semanas do período.' })
          : null,
        Array.isArray(conv.porCampanha) && conv.porCampanha.length
          ? blocoTabela(ordenar(conv.porCampanha.filter(objeto), 'conversoes'), [
            col('campanha', 'Campanha', 'texto', { max: 80 }),
            col('acao', 'Ação', 'texto', { max: 100 }),
            col('categoria', 'Categoria', 'texto', { valor: (x) => traduzir(CATEGORIA_CONV, x.categoria, 'outra categoria') }),
            col('conversoes', 'Conversões', 'num2'),
            col('valorConversoes', 'Valor', 'moeda'),
            col('todasConversoes', 'Todas as conversões', 'num2'),
          ], { moeda, titulo: 'Por campanha' })
          : null,
      ], { aberta: false, resumo: Array.isArray(conv.acoes) ? plural(conv.acoes.length, 'ação', 'ações') : null })
      : secao('conversoes', 'Conversões', [blocoTexto(semDado('conversoes'))], { resumo: 'não veio' }),
    ch
      ? secao('chamadas', 'Ligações', [
        blocoPares([
          { rotulo: 'Relatório de chamadas', valor: ch.ligado === true ? 'ligado' : ch.ligado === false ? 'desligado' : null },
          { rotulo: 'Ligações', valor: ch.total, tipo: 'int' },
          { rotulo: 'Atendidas', valor: ch.recebidas, tipo: 'int' },
          { rotulo: 'Perdidas', valor: ch.perdidas, tipo: 'int' },
          { rotulo: 'Duração média', valor: ch.duracaoMedia, tipo: 'dur' },
        ]),
        lista(ch.porDia).length
          ? blocoTabela([...lista(ch.porDia)].filter(objeto).reverse(), [col('data', 'Dia', 'dia'), col('total', 'Ligações', 'int'), col('recebidas', 'Atendidas', 'int'), col('perdidas', 'Perdidas', 'int')], { hoje, titulo: 'Por dia' })
          : null,
        objeto(ch.restrito) && Array.isArray(ch.restrito.lista)
          ? blocoTabela(ch.restrito.lista.filter(objeto), [
            col('inicio', 'Quando', 'instante'),
            col('duracao', 'Duração', 'dur'),
            col('status', 'Situação', 'texto', { valor: (x) => traduzir({ RECEIVED: 'atendida', MISSED: 'perdida' }, x.status, 'outra situação'), tom: (x) => (x.status === 'MISSED' ? 'warn' : null) }),
            col('tipo', 'Como ligou', 'texto', { valor: (x) => traduzir(TIPO_LIGACAO, x.tipo, 'outro jeito') }),
            col('origem', 'De onde', 'texto', { valor: (x) => traduzir(ORIGEM_LIGACAO, x.origem, 'outra origem') }),
            col('ddd', 'DDD', 'texto'),
            col('pais', 'País', 'pais'),
            col('campanha', 'Campanha', 'texto', { max: 80 }),
          ], { hoje, titulo: 'Cada ligação', nota: 'Lista com DDD: dado pessoal, só a gestão vê.' })
          : null,
      ], { resumo: medida(ch.total) !== null ? plural(medida(ch.total), 'ligação', 'ligações') : null })
      : secao('chamadas', 'Ligações', [blocoTexto(semDado('chamadas'))], { resumo: 'não veio' }),
    leads
      ? secao('leads', 'Leads de formulário', [
        blocoPares([
          { rotulo: 'Guardados no Painel', valor: leads.total, tipo: 'int' },
          { rotulo: 'Novos nesta coleta', valor: leads.novos, tipo: 'int' },
          { rotulo: 'Nos últimos 60 dias (Google)', valor: leads.ultimos60, tipo: 'int' },
        ]),
        lista(leads.porCampanha).length ? blocoTabela(ordenar(leads.porCampanha, 'leads'), [col('campanha', 'Campanha'), col('leads', 'Leads', 'int')], { titulo: 'Por campanha' }) : null,
        lista(leads.porDia).length ? blocoTabela(recentesPrimeiro(leads.porDia, 'data'), [col('data', 'Dia', 'dia'), col('leads', 'Leads', 'int')], { hoje, titulo: 'Por dia' }) : null,
        leadsRestritos
          ? blocoTabela(leadsRestritos.sort((a, b) => String(b.data ?? '').localeCompare(String(a.data ?? ''))), [
            col('data', 'Quando', 'instante'),
            col('campanha', 'Campanha', 'texto', { max: 80 }),
            col('grupo', 'Grupo', 'texto', { max: 80 }),
            col('campos', 'Respostas', 'texto', {
              valor: (x) => [...lista(x.campos).filter(objeto).map((c) => `${traduzir(CAMPO_LEAD, c.tipo, 'outro campo') ?? 'campo sem nome'}: ${c.valor}`), ...lista(x.perguntas).filter(objeto).map((p) => `${p.pergunta} ${p.valor}`)].join('; ') || null,
              max: 400,
            }),
            col('vistoEm', 'Chegou ao Painel', 'instante'),
          ], { hoje, titulo: 'Cada lead', nota: 'Dado pessoal, só a gestão vê. O Google apaga o lead depois de 60 dias; o Painel guarda.' })
          : null,
      ], { resumo: medida(leads.total) !== null ? plural(medida(leads.total), 'lead', 'leads') : null })
      : secao('leads', 'Leads de formulário', [blocoTexto(semDado('leads'))], { resumo: 'não veio' }),
    pub
      ? secao('publico', 'Público', [
        Array.isArray(pub.idade) ? blocoTabela(ordenar(pub.idade, 'cliques'), [col('faixa', 'Idade', 'texto', { valor: (x) => traduzir(IDADE, x.faixa, 'outra faixa') }), ...COLS_METRICAS], { moeda }) : null,
        Array.isArray(pub.genero) ? blocoTabela(ordenar(pub.genero, 'cliques'), [col('genero', 'Gênero', 'texto', { valor: (x) => traduzir(GENERO, x.genero, 'outro') }), ...COLS_METRICAS], { moeda }) : null,
      ])
      : secao('publico', 'Público', [blocoTexto(semDado('publico'))], { resumo: 'não veio' }),
    tabelaDaParte('locais', 'locais', 'Cidades', objeto(d.locais) ? ordenar(d.locais.cidades, 'cliques') : null, [
      col('nome', 'Cidade', 'texto', {
        valor: (x) => [texto(x.nome ?? x.nomeCompleto, 120) ?? 'cidade sem nome', traduzir({ presenca: 'estava lá', interesse: 'buscou por lá' }, x.tipo, 'outro tipo')].filter(Boolean).join(', '),
        titulo: (x) => x.nomeCompleto,
      }),
      col('impressoes', 'Impressões', 'int'),
      col('cliques', 'Cliques', 'int'),
      col('gasto', 'Gasto', 'moeda'),
      col('conversoes', 'Conversões', 'num2'),
      col('ctr', 'CTR', 'fracao'),
      col('cpcMedio', 'CPC médio', 'moeda'),
      col('custoPorConversao', 'Custo por conversão', 'moeda'),
    ], { unidade: ['cidade', 'cidades'], nota: ['"Estava lá" e "buscou por lá" são a mesma impressão vista de dois jeitos: não some as duas.', cortadas(d.locais?.cortadas, ['cidade', 'cidades'])].filter(Boolean).join(' ') }),
    tabelaDaParte('paginas', 'paginas_destino', 'Páginas de destino', objeto(d.paginas) ? ordenar(d.paginas.lista, 'gasto') : null, [
      col('url', 'Página', 'texto', { link: (x) => x.url, max: 120 }),
      ...COLS_METRICAS,
    ], { unidade: ['página', 'páginas'], nota: cortadas(d.paginas?.cortadas, ['página', 'páginas']) }),
    grade
      ? secao('horarios', 'Dias e horários', [
        // Dia da semana sem linha nenhuma fica sem medida (o Google não manda
        // a casa zerada), e não vira um zero inventado.
        blocoBarras(Object.entries(DIA_SEMANA).map(([k, rotulo]) => ({ rotulo, valor: somaDisponivel(grade.filter((g) => g.dia === k).map((g) => g.cliques)) })), { titulo: 'Cliques por dia da semana' }),
        blocoTabela(ordenar(grade, 'cliques'), [
          col('dia', 'Dia', 'texto', { valor: (x) => traduzir(DIA_SEMANA, x.dia, 'outro dia') }),
          col('hora', 'Hora', 'texto', { valor: (x) => (medida(x.hora) === null ? null : `${String(x.hora).padStart(2, '0')}h`) }),
          col('impressoes', 'Impressões', 'int'),
          col('cliques', 'Cliques', 'int'),
          col('gasto', 'Gasto', 'moeda'),
          col('conversoes', 'Conversões', 'num2'),
        ], { moeda, nota: 'Só os horários que tiveram anúncio no período.' }),
      ], { resumo: plural(grade.length, 'horário', 'horários') })
      : secao('horarios', 'Dias e horários', [blocoTexto(semDado('horarios'))], { resumo: 'não veio' }),
    objeto(d.pmax)
      ? d.pmax.aplica === false
        ? secao('pmax', 'Performance Max', [blocoTexto('A conta não tem campanha Performance Max.')], { resumo: 'não tem' })
        : secaoTabela('pmax', 'Performance Max', ordenar(d.pmax.grupos, 'gasto'), [
          col('nome', 'Grupo de recursos', 'texto', { max: 100 }),
          col('campanha', 'Campanha', 'texto', { max: 80 }),
          col('status', 'Situação', 'texto', { valor: (x) => traduzir(STATUS, x.status, 'outra situação') }),
          ...COLS_METRICAS,
        ], { moeda, unidade: ['grupo', 'grupos'] })
      : secao('pmax', 'Performance Max', [blocoTexto(semDado('pmax'))], { resumo: 'não veio' }),
    tabelaDaParte('organico', 'organico', 'Busca orgânica (Search Console)', objeto(d.organico) ? ordenar(d.organico.lista, 'cliquesOrganicos') : null, [
      col('termo', 'Termo', 'texto', { max: 120 }),
      col('cliquesOrganicos', 'Cliques orgânicos', 'int'),
      col('impressoesOrganicas', 'Impressões orgânicas', 'int'),
      col('consultasOrganicas', 'Consultas', 'int'),
      col('cliquesCombinados', 'Cliques somados ao anúncio', 'int'),
    ], { unidade: ['termo', 'termos'], vazio: 'Sem linhas: a conta do Google Ads precisa estar vinculada ao Search Console.', nota: cortadas(d.organico?.cortados, ['termo', 'termos']) }),
    alt
      ? secao('alteracoes', 'Alterações na conta', [
        blocoPares([{ rotulo: 'Alterações nos últimos 30 dias', valor: alt.total, tipo: 'int' }]),
        lista(alt.porTipo).length
          ? blocoTabela(ordenar(alt.porTipo, 'total'), [
            col('recurso', 'O quê', 'texto', { valor: (x) => traduzir(RECURSO, x.recurso, 'outro item') }),
            col('operacao', 'Mudança', 'texto', { valor: (x) => traduzir(OPERACAO, x.operacao, 'outra mudança') }),
            col('total', 'Vezes', 'int'),
          ], { titulo: 'Por tipo' })
          : null,
        lista(alt.porDia).length
          ? blocoTabela(recentesPrimeiro(alt.porDia, 'data'), [col('data', 'Dia', 'dia'), col('total', 'Alterações', 'int')], { hoje, titulo: 'Por dia' })
          : null,
        objeto(alt.restrito) && Array.isArray(alt.restrito.lista)
          ? blocoTabela(alt.restrito.lista.filter(objeto), [
            col('quando', 'Quando', 'instante'),
            col('recurso', 'O quê', 'texto', { valor: (x) => traduzir(RECURSO, x.recurso, 'outro item') }),
            col('operacao', 'Mudança', 'texto', { valor: (x) => traduzir(OPERACAO, x.operacao, 'outra mudança') }),
            col('campos', 'Campos', 'texto', { valor: (x) => [...new Set(lista(x.campos).map(nomeDoCampoAds).filter(Boolean))].join(', ') || null }),
            col('cliente', 'Por onde', 'texto', { valor: (x) => traduzir(CLIENTE, x.cliente, 'outro meio') }),
            col('email', 'Quem', 'texto'),
          ], { hoje, titulo: 'Cada alteração', nota: 'Com o e-mail de quem mexeu: dado pessoal, só a gestão vê.' })
          : null,
      ], { resumo: medida(alt.total) !== null ? plural(medida(alt.total), 'alteração', 'alterações') : null })
      : secao('alteracoes', 'Alterações na conta', [blocoTexto(semDado('alteracoes'))], { resumo: 'não veio' }),
    r && Array.isArray(r.aparelhos)
      ? secaoTabela('aparelhos', 'Aparelhos e redes', ordenar(r.aparelhos, 'gasto'), [
        col('aparelho', 'Aparelho e rede', 'texto', { valor: (x) => [traduzir(APARELHO, x.aparelho, 'outro aparelho'), traduzir(REDE, x.rede, 'outra rede')].filter(Boolean).join(', ') || null }),
        ...COLS_METRICAS,
        col('interacoes', 'Interações', 'int'),
      ], { moeda, unidade: ['linha', 'linhas'] })
      : null,
    diasConta || diasCampanhas.length
      ? secao('dias', 'Por dia', [
        diasConta
          ? blocoTabela(diasConta, [col('data', 'Dia', 'dia'), ...COLS_METRICAS, col('interacoes', 'Interações', 'int'), col('todasConversoes', 'Todas as conversões', 'num2')], {
            moeda, hoje, limite: 14, titulo: diasCampanhas.length ? 'A conta' : null, nota: 'Dia em que nada rodou não aparece (o Google não manda linha zerada).',
          })
          : null,
        diasCampanhas.length
          ? blocoTabela(diasCampanhas, [
            col('data', 'Dia', 'dia'),
            col('campanha', 'Campanha', 'texto', { max: 80 }),
            col('gasto', 'Gasto', 'moeda'),
            col('impressoes', 'Impressões', 'int'),
            col('cliques', 'Cliques', 'int'),
            col('conversoes', 'Conversões', 'num2'),
            col('valorConversoes', 'Valor das conversões', 'moeda'),
            col('ligacoes', 'Ligações', 'int'),
          ], { moeda, hoje, limite: 14, chave: (x, i) => `${x.campanhaId ?? ''}-${x.data ?? i}`, titulo: 'Por campanha' })
          : null,
      ], { resumo: diasConta ? plural(diasConta.length, 'dia', 'dias') : plural(diasCampanhas.length, 'linha', 'linhas') })
      : null,
    secao('conta', 'Sobre a conta', [
      blocoPares([
        { rotulo: 'Conta', valor: conta.nome },
        { rotulo: 'Número da conta', valor: conta.idFormatado },
        { rotulo: 'Moeda', valor: conta.moeda, tipo: 'nomeMoeda' },
        { rotulo: 'Fuso', valor: conta.fuso, tipo: 'fuso' },
        // Só o número da tag (é público, está no HTML do site); valor escondido
        // pela coletora ("[oculto]") ou fora do formato não vai.
        { rotulo: 'Tag de conversão', valor: /^\d{6,15}$/.test(String(conta.tag ?? '')) ? `AW-${conta.tag}` : null },
        { rotulo: 'A tag do site é desta conta', valor: conta.tagConfere, tipo: 'sim' },
        { rotulo: 'Via conta de administrador', valor: conta.viaGerente ?? 'não' },
        { rotulo: 'Relatório de chamadas', valor: conta.relatorioChamadas === true ? 'ligado' : conta.relatorioChamadas === false ? 'desligado' : null },
        { rotulo: 'Regra dos leads da semana', valor: traduzir({ categorias: 'conversões das categorias de lead', total: 'todas as conversões principais' }, r?.regras?.leads, 'outra regra') },
        { rotulo: 'Regra das conversas da semana', valor: traduzir({ ligacoes_e_contato: 'ligações e ações de contato', ligacoes: 'ligações', contato: 'ações de contato' }, r?.regras?.conversas, 'outra regra') },
        { rotulo: 'Versão da API', valor: conta.versaoApi },
        { rotulo: 'Consultas nesta coleta', valor: conta.consultas, tipo: 'int' },
      ]),
    ]),
  ];

  return {
    destaque: medida(t.gasto) !== null ? `${formatar('moeda', t.gasto, { moeda })} no período` : null,
    topo,
    secoes,
  };
}

/** O quadro do Google Ads (ligação google_ads do canal site). */
export function quadrosGoogleAds(l, { hoje } = {}) {
  const d = objeto(l?.dados) ? l.dados : {};
  const temDado = PARTES_ADS.some((p) => objeto(d[p]));
  return [montarQuadro({ id: 'google_ads', titulo: 'Google Ads', rotuloFonte: 'Google Ads', ligacao: l, partes: [...PARTES_ADS], temDado, hoje, corpo: () => corpoAds(d, l, hoje) })];
}
