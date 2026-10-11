/* CONECTOR DO LINKEDIN: a Página da Impresilk pela Community Management API.
 *
 * Contrato em docs/marketing/integracoes-contrato.md (seção 5). Quem chama é a
 * coletora painel-mkt-fontes, com o ctx descrito lá. Este arquivo só LÊ do
 * LinkedIn (todas as chamadas são GET): o token do cofre tem poder de escrita
 * (rw_organization_admin é o único escopo que dá as estatísticas), e por isso
 * nada aqui monta POST, PUT ou DELETE para a API.
 *
 * POR QUE ASSIM (pesquisa de 11/10/2026, com a contraprova valendo onde as
 * duas discordam):
 *  - Teto REAL de 100 chamadas por dia: o nível Development conta 100 por
 *    membro a cada 24 h, e o coletor só usa o token do Léo. Cada execução tem
 *    um orçamento explícito (ORCAMENTO_CHAMADAS), gasto por prioridade: o que
 *    alimenta os números da semana vem primeiro, o detalhe por post por
 *    último. Se a coletora passar ctx.chamadasHoje (o que o diário do dia já
 *    gastou), o orçamento encolhe para não estourar o teto.
 *  - Posts só dos últimos 60 dias: socialMetadata e videoAnalytics custam uma
 *    chamada por post (BATCH_GET é bloqueado no Development).
 *  - Guarda de conteúdo: texto, título e mídia de post só podem ficar 6 meses;
 *    números de relatório, 1 ano. Por isso as publicações vão SEM título, o
 *    "dados" não leva texto de post, e todo retorno pede a faxina
 *    (painel_mkt_api_faxina) que a coletora executa.
 *  - O token: a coletora lê o cofre, renova com 7 dias de folga e avisa do
 *    prazo (mkt-oauth.mjs). Aqui só a última rede: o token vencido, ou que
 *    vence durante a coleta, é renovado pelo renovar do mkt-oauth.mjs, e a
 *    conexão nova volta em "conexao" para ser regravada.
 *  - Os dias do LinkedIn são dias UTC (timeRange em milissegundos UTC). A
 *    semana do Painel (segunda a domingo) soma 7 dias UTC; a diferença para o
 *    horário de Brasília é de 3 horas na virada do dia.
 *
 * ============================================================== FORMATO ==
 * O "dados" que a tela recebe (cada chave de primeiro nível, menos "cota", é
 * uma PARTE; parte que falhou não aparece aqui, e a coletora mantém a da
 * coleta anterior; parte parcial traz só os campos que vieram, e a coletora
 * junta com os de antes). Todo número não informado é null, nunca zero.
 * partes: pagina, seguidores, visitas, conteudo, posts, cada uma
 * { estado, motivo?, codigo?, coletado_em }: estado ok, parcial ou erro e,
 * quando não é ok, motivo (FRASE para gente, em português, para a tela
 * mostrar como texto; ver MOTIVOS) e codigo (o código curto do mesmo caso,
 * nunca para mostrar: orcamento, prazo, cota, reconectar, versao,
 * sem_permissao, sem_escopo, formato, falhou, estatistica, detalhe). É a
 * regra da revisão 2 para as seis fontes (contrato, seção 4).
 *
 * dados.pagina = {
 *   urn: 'urn:li:organization:123', id: '123',
 *   nome, vanity, url: 'https://www.linkedin.com/company/<vanity>' | null,
 *   site, porte: 'SIZE_11_TO_50' | null, setores: [urn], tipo
 * }
 * dados.seguidores = {
 *   total,                  // networkSizes.firstDegreeSize, lido nesta coleta
 *   pronto_ate,             // último dia com ganho (o LinkedIn fecha com 2 dias de atraso)
 *   por_dia: [{ dia, organicos, pagos, total }],     // ganhos por dia UTC
 *   semanas: [{ semana, ganho, organicos, pagos, total_fim }],
 *       // ganho só quando os 7 dias vieram; total_fim só na última semana
 *       // fechada (estimativa: total de hoje menos os ganhos desde a segunda)
 *   perfil: { vinculo, pais, regiao, funcao, setor, senioridade, porte } | null
 *       // cada um: [{ codigo, n }] do maior para o menor; codigo é o URN do
 *       // LinkedIn (urn:li:geo:..., urn:li:function:...), ainda sem tradução,
 *       // ou o código da faixa (SIZE_11_TO_50, com rotulo '11 a 50')
 * }
 * dados.visitas = {
 *   por_dia: [{ dia, visualizacoes, unicas, inicio, inicio_unicas, carreiras,
 *               carreiras_unicas, cliques_botao_computador, cliques_botao_celular }],
 *       // SÓ os campos que a documentação confirma na série diária
 *   semanas: [{ semana, visualizacoes, inicio, cliques_botao }],
 *   desde_sempre: { vistas: { total: {visualizacoes, unicas}, total_computador,
 *                   total_celular, inicio, ..., outras: {<nome da API>: {...}} },
 *                   cliques_botao: { computador, celular } } | null,
 *   perfil: { pais, regiao, funcao, setor, senioridade, porte } | null
 * }
 * dados.conteudo = {     // soma de todos os posts, só orgânico
 *   por_dia: [{ dia, impressoes, alcance, cliques, curtidas, comentarios,
 *               compartilhamentos, engajamento, taxa }],
 *   semanas: [{ semana, impressoes, alcance, cliques, curtidas, comentarios,
 *               compartilhamentos, engajamento, taxa }],
 *       // alcance é o ALCANCE DIÁRIO SOMADO (únicos de cada dia somados):
 *       // passa do alcance único real da semana; a tela tem de dizer isso
 *   desde_sempre: { impressoes, alcance, cliques, curtidas, comentarios,
 *                   compartilhamentos, engajamento, taxa } | null
 *       // o LinkedIn só guarda 12 meses de conteúdo
 * }
 * dados.posts = {
 *   desde: 'AAAA-MM-DD',    // 60 dias para trás
 *   itens: [{ urn, url, data, publicado_em, tipo, patrocinado,
 *             impressoes, alcance, cliques, curtidas, comentarios,
 *             compartilhamentos, engajamento, taxa,
 *             reacoes: { LIKE: n, PRAISE: n, ENTERTAINMENT: n, ... } | null,
 *             reacoes_total, comentarios_total, comentarios_principais,
 *             video: { visualizacoes, espectadores, tempo_assistido_ms,
 *                      tempo_das_visualizacoes_ms } | null }],
 *       // sem texto, sem título e sem mídia (regra de guarda e de uso: o
 *       // Painel mostra uma tabela de desempenho, nunca um mural de posts);
 *       // tipo: texto, imagem, imagens, video, documento, artigo, enquete,
 *       // celebracao, carrossel, compartilhamento. Números do post são os
 *       // acumulados e só orgânicos. reacoes e comentarios_total só nos 15
 *       // posts mais novos, e video só nos 3 vídeos mais novos (1 chamada
 *       // por post ou por métrica de vídeo); nos outros, null
 *   ignorados: { nao_publicados, sem_feed }
 * }
 * dados.cota = { orcamento, usadas, teto_dia: 100, versao_api: '202609' }
 *
 * NÚMEROS DA SEMANA (canal do LinkedIn, 8 semanas FECHADAS, só o que foi
 * medido; número ausente nem vai, para não apagar o que foi lançado à mão):
 *   seguidores   o total (networkSizes) lido na SEGUNDA logo depois da semana,
 *                o retrato de domingo que a pesquisa manda gravar. Nos outros
 *                dias a chave nem vai: a estimativa "total de hoje menos os
 *                ganhos desde a segunda" se afasta do retrato (os ganhos chegam
 *                com 2 dias de atraso e podem não descontar quem saiu), e a
 *                coleta de cada dia trocaria o número da semana. A estimativa
 *                continua em dados.seguidores.semanas[0].total_fim, para a tela
 *   alcance      soma de uniqueImpressionsCount dos 7 dias (alcance diário somado)
 *   impressoes   soma de impressionCount dos 7 dias
 *   engajamento  soma de curtidas + comentários + compartilhamentos + cliques
 *   cliques      soma de clickCount dos 7 dias (cliques nos posts)
 *   conversas e leads: a Community Management API não tem; nunca vão.
 * PUBLICAÇÕES: url https://www.linkedin.com/feed/update/<urn>, data de
 * publicação no dia de São Paulo, titulo null, e os números acumulados do
 * post (impressoes, alcance quando vier, engajamento, cliques). Post que a
 * estatística por post não devolve conta como zero (é o que a documentação
 * manda); se a chamada falhou, os números não vão.
 * ========================================================================= */
import { somarDias, segundaDaSemana, hojeSP, normalizarLink } from '../marketing.mjs';
import { renovar } from '../mkt-oauth.mjs';

export const FONTE = 'linkedin';
export const SECRETS = ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'];

// Versão mensal da Marketing API. Uma constante só: sem cabeçalho, ou com
// versão vencida, a API inteira recusa. Cada versão vale no mínimo 1 ano
// (a 202609 é a mais nova em 11/10/2026); trocar pelo menos uma vez por ano.
export const VERSAO_API = '202609';
export const BASE = 'https://api.linkedin.com/rest';

export const TETO_DIA = 100;
export const ORCAMENTO_CHAMADAS = 40;
// O que sobra do teto do dia para o "Atualizar agora" e para imprevistos,
// quando a coletora informa quanto o dia já gastou.
const RESERVA_DIA = 10;
export const DIAS_POSTS = 60;
export const SEMANAS = 8;
// Regra de guarda do LinkedIn: números de relatório por 1 ano, texto e título
// de post por 6 meses. Vai em todo retorno; a coletora chama a
// painel_mkt_api_faxina com estes mesmos números.
export const FAXINA = { canal: 'linkedin', dias_numeros: 365, dias_titulo: 180 };

const ESCOPO_ADMIN = 'rw_organization_admin';
const ESCOPO_POSTS = 'r_organization_social';
const ESCOPO_FEED = 'r_organization_social_feed';

// Posts por chamada de estatística por post. O máximo por chamada não é
// documentado (nao_confirmado); 20 URNs cabem com folga numa URL comum.
const LOTE_POSTS = 20;
const MAX_PAGINAS_POSTS = 3;
// Detalhe por post (1 chamada cada): reações por tipo e vídeo.
const MAX_DETALHE = 15;
const MAX_VIDEOS = 3;
const TIPOS_VIDEO = [
  ['VIDEO_VIEW', 'visualizacoes'],
  ['VIEWER', 'espectadores'],
  ['TIME_WATCHED_FOR_VIDEO_VIEWS', 'tempo_das_visualizacoes_ms'],
  ['TIME_WATCHED', 'tempo_assistido_ms'],
];
// Cada chamada pode levar 20 s e repetir em 429/5xx: com menos que isso de
// prazo, a próxima chamada não começa (o estado vira "parcial").
const FOLGA_PRAZO_MS = 25_000;
// Token que vence nos próximos 15 minutos não termina a coleta.
const ULTIMOS_MINUTOS_MS = 15 * 60_000;
const MAX_NUMERO = 1e9;

// ------------------------------------------------------------ miudezas --

const lista = (x) => (Array.isArray(x) ? x : []);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
// O banco aceita inteiro de 0 a 1 bilhão; o resto não vai (likeCount pode
// vir negativo quando alguém desfaz a reação).
const inteiroValido = (v) => (Number.isInteger(v) && v >= 0 && v <= MAX_NUMERO ? v : null);
// Instante em milissegundos que o Date aguenta: fora disso o toISOString
// lança, e uma resposta torta derrubaria a coleta inteira.
const tempo = (v) => (num(v) != null && Math.abs(v) <= 8.64e15 ? v : null);
const diaUTC = (ms) => (tempo(ms) == null ? null : new Date(ms).toISOString().slice(0, 10));
const msDoDia = (iso) => Date.parse(`${iso}T00:00:00Z`);
const enc = encodeURIComponent;
const taxa = (parte, todo) => (parte == null || !todo ? null : Math.round((parte / todo) * 10000) / 10000);
function somaOuNulo(...valores) {
  let s = 0;
  for (const v of valores) { if (v == null) return null; s += v; }
  return s;
}

/** Instante em milissegundos: aceita ISO, segundos ou milissegundos. */
export function instante(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v < 1e12 ? v * 1000 : v;
  if (typeof v === 'string' && v) { const t = Date.parse(v); return Number.isFinite(t) ? t : null; }
  return null;
}

/** Janela do Rest.li 2.0, sem codificar parênteses, dois-pontos e vírgula. */
export function janelaDia(inicioIso, fimIso) {
  return `timeIntervals=(timeRange:(start:${msDoDia(inicioIso)},end:${msDoDia(fimIso)}),timeGranularityType:DAY)`;
}

/** As 8 semanas FECHADAS (segunda-feira de cada), da mais nova para a mais velha. */
export function semanasFechadas(hoje, n = SEMANAS) {
  const atual = segundaDaSemana(hoje);
  return Array.from({ length: n }, (_, i) => somarDias(atual, -7 * (i + 1)));
}

/** Soma os 7 dias da semana; falta de um dia (ou do número nele) dá null. */
export function somaDaSemana(porDia, semana, pegar) {
  let soma = 0;
  for (let i = 0; i < 7; i++) {
    const d = porDia.get(somarDias(semana, i));
    const v = d ? pegar(d) : null;
    if (v == null) return null;
    soma += v;
  }
  return soma;
}

/** Dias que faltam na série entre o primeiro dia pedido e o último que veio.
 *  Se o LinkedIn pular dia sem movimento (a documentação não diz), a semana
 *  com falta fica sem número; contar os buracos mostra isso na primeira
 *  coleta de verdade, em vez de semanas vazias sem explicação. */
export function diasFaltando(porDia, inicio) {
  if (!porDia || !porDia.size) return 0;
  const ultimo = [...porDia.keys()].sort().pop();
  let faltam = 0;
  for (let d = inicio; d <= ultimo; d = somarDias(d, 1)) if (!porDia.has(d)) faltam++;
  return faltam;
}

/** O canal do LinkedIn entre os ativos: pelo código, ou pelo link do perfil. */
export function acharCanal(canais) {
  const todos = lista(canais);
  return todos.find((c) => c?.codigo === 'linkedin')
    || todos.find((c) => { try { return /(^|\.)linkedin\.com$/i.test(new URL(c?.url_perfil).hostname); } catch { return false; } })
    || null;
}

/** Escopos guardados na conexão (lista ou texto). Sem lista, não julga. */
export function lerEscopos(v) {
  const itens = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[\s,]+/) : [];
  const s = new Set(itens.map((x) => String(x).trim()).filter(Boolean));
  return s.size ? s : null;
}

export const linkDoPost = (urn) => normalizarLink(`https://www.linkedin.com/feed/update/${urn}/`, 'o link do post');

// ------------------------------------------------- leitura de respostas --

/** organizationAcls: as Páginas que a conta administra. A documentação
 *  mostra ora "organization", ora "organizationTarget": aceita as duas. */
export function lerAcl(resp) {
  const fora = [];
  for (const e of lista(resp?.elements)) {
    const urn = e?.organization ?? e?.organizationTarget;
    if (typeof urn !== 'string' || !/^urn:li:organization:\d+$/.test(urn)) continue;
    if (e.role != null && e.role !== 'ADMINISTRATOR') continue;
    if (e.state != null && e.state !== 'APPROVED') continue;
    if (!fora.some((o) => o.urn === urn)) fora.push({ urn, id: urn.split(':').pop() });
  }
  return fora;
}

/** organizations/{id}: dados cadastrais da Página (guardar até 8 semanas). */
export function lerOrganizacao(resp, urn) {
  if (!resp || typeof resp !== 'object') return null;
  const localizado = resp.name?.localized && typeof resp.name.localized === 'object' ? Object.values(resp.name.localized)[0] : null;
  const vanity = typeof resp.vanityName === 'string' && resp.vanityName ? resp.vanityName : null;
  let url = null;
  if (vanity) { try { url = normalizarLink(`https://www.linkedin.com/company/${vanity}/`); } catch { url = null; } }
  const id = resp.id != null ? String(resp.id) : urn ? urn.split(':').pop() : null;
  return {
    urn: urn ?? (id ? `urn:li:organization:${id}` : null),
    id,
    nome: typeof resp.localizedName === 'string' ? resp.localizedName : typeof localizado === 'string' ? localizado : null,
    vanity,
    url,
    site: typeof resp.localizedWebsite === 'string' ? resp.localizedWebsite : null,
    porte: typeof resp.staffCountRange === 'string' ? resp.staffCountRange : null,
    setores: lista(resp.industries).filter((x) => typeof x === 'string'),
    tipo: typeof resp.organizationType === 'string' ? resp.organizationType : null,
  };
}

/** networkSizes: o total oficial de seguidores (o follower statistics não
 *  devolve mais o total). */
export const lerTotalSeguidores = (resp) => inteiroValido(resp?.firstDegreeSize);

/** Ganhos de seguidores por dia UTC (orgânicos + pagos). */
export function lerGanhosPorDia(resp) {
  const porDia = new Map();
  for (const e of lista(resp?.elements)) {
    const dia = diaUTC(e?.timeRange?.start);
    const g = e?.followerGains;
    if (!dia || !g || typeof g !== 'object') continue;
    const organicos = num(g.organicFollowerGain), pagos = num(g.paidFollowerGain);
    porDia.set(dia, { dia, organicos, pagos, total: somaOuNulo(organicos, pagos) });
  }
  return porDia;
}

// Rótulo legível só para o que se lê do próprio código (SIZE_11_TO_50); os
// URNs de país, função, setor e senioridade precisam da tabela Standardized
// Data do LinkedIn, que ainda não é consultada (custaria chamadas).
function rotuloPorte(codigo) {
  const m = /^SIZE_(\d+)(?:_TO_(\d+)|_OR_MORE)?$/.exec(codigo || '');
  if (!m) return null;
  if (m[2]) return `${m[1]} a ${m[2]}`;
  return /_OR_MORE$/.test(codigo) ? `${m[1]} ou mais` : m[1];
}
function lerFaceta(itens, chave, pegarN) {
  const fora = [];
  for (const i of lista(itens)) {
    const codigo = typeof i?.[chave] === 'string' ? i[chave] : null;
    const n = inteiroValido(pegarN(i));
    if (!codigo || n == null) continue;
    fora.push(chave === 'staffCountRange' ? { codigo, rotulo: rotuloPorte(codigo), n } : { codigo, n });
  }
  return fora.sort((a, b) => b.n - a.n);
}

/** Perfil acumulado dos seguidores (sem timeIntervals). O número de cada
 *  item é organicFollowerCount, que já soma orgânico e pago (a documentação
 *  manda não usar paidFollowerCount aqui). */
export function lerPerfilSeguidores(resp) {
  const e = lista(resp?.elements)[0];
  if (!e) return null;
  const n = (i) => i?.followerCounts?.organicFollowerCount;
  return {
    vinculo: lerFaceta(e.followerCountsByAssociationType, 'associationType', n),
    pais: lerFaceta(e.followerCountsByGeoCountry, 'geo', n),
    regiao: lerFaceta(e.followerCountsByGeo, 'geo', n),
    funcao: lerFaceta(e.followerCountsByFunction, 'function', n),
    setor: lerFaceta(e.followerCountsByIndustry, 'industry', n),
    senioridade: lerFaceta(e.followerCountsBySeniority, 'seniority', n),
    porte: lerFaceta(e.followerCountsByStaffCountRange, 'staffCountRange', n),
  };
}

// Cliques no botão da Página: lista vazia é zero de verdade (a lista veio);
// lista ausente é null. O nome do campo de contagem não está na pesquisa:
// aceita os três que aparecem nas APIs do LinkedIn.
function somaBotoes(v) {
  if (!Array.isArray(v)) return null;
  let s = 0;
  for (const i of v) {
    const n = num(i?.clicks) ?? num(i?.count) ?? num(i?.clickCount);
    if (n == null) return null;
    s += n;
  }
  return s;
}
const vista = (v) => ({ visualizacoes: num(v?.pageViews), unicas: num(v?.uniquePageViews) });

/** Visitas por dia UTC. A contraprova: o exemplo diário só confirma
 *  allPageViews, overviewPageViews e careersPageViews; o resto (aparelho,
 *  vagas, vida) fica de fora da série, e o que faltar é null. */
export function lerVisitasPorDia(resp) {
  const porDia = new Map();
  for (const e of lista(resp?.elements)) {
    const dia = diaUTC(e?.timeRange?.start);
    const t = e?.totalPageStatistics;
    if (!dia || !t || typeof t !== 'object') continue;
    const v = t.views || {};
    const todas = vista(v.allPageViews), inicio = vista(v.overviewPageViews), carreiras = vista(v.careersPageViews);
    porDia.set(dia, {
      dia,
      visualizacoes: todas.visualizacoes, unicas: todas.unicas,
      inicio: inicio.visualizacoes, inicio_unicas: inicio.unicas,
      carreiras: carreiras.visualizacoes, carreiras_unicas: carreiras.unicas,
      cliques_botao_computador: somaBotoes(t.clicks?.desktopCustomButtonClickCounts),
      cliques_botao_celular: somaBotoes(t.clicks?.mobileCustomButtonClickCounts),
    });
  }
  return porDia;
}

const NOMES_VISTA = {
  allPageViews: 'total', allDesktopPageViews: 'total_computador', allMobilePageViews: 'total_celular',
  overviewPageViews: 'inicio', desktopOverviewPageViews: 'inicio_computador', mobileOverviewPageViews: 'inicio_celular',
  careersPageViews: 'carreiras', desktopCareersPageViews: 'carreiras_computador', mobileCareersPageViews: 'carreiras_celular',
  jobsPageViews: 'vagas', desktopJobsPageViews: 'vagas_computador', mobileJobsPageViews: 'vagas_celular',
  lifeAtPageViews: 'vida', desktopLifeAtPageViews: 'vida_computador', mobileLifeAtPageViews: 'vida_celular',
};

/** Visitas acumuladas (sem timeIntervals): todas as abas que vierem, por
 *  aparelho, os cliques no botão e o perfil de quem visitou. */
export function lerVisitasDesdeSempre(resp) {
  const e = lista(resp?.elements)[0];
  if (!e) return null;
  const t = e.totalPageStatistics || {};
  const vistas = { outras: {} };
  for (const [k, v] of Object.entries(t.views || {})) {
    if (!v || typeof v !== 'object') continue;
    if (NOMES_VISTA[k]) vistas[NOMES_VISTA[k]] = vista(v);
    else vistas.outras[k] = vista(v);
  }
  const n = (i) => i?.pageStatistics?.views?.allPageViews?.pageViews;
  return {
    desde_sempre: {
      vistas,
      cliques_botao: { computador: somaBotoes(t.clicks?.desktopCustomButtonClickCounts), celular: somaBotoes(t.clicks?.mobileCustomButtonClickCounts) },
    },
    perfil: {
      pais: lerFaceta(e.pageStatisticsByGeoCountry, 'geo', n),
      regiao: lerFaceta(e.pageStatisticsByGeo, 'geo', n),
      funcao: lerFaceta(e.pageStatisticsByFunction, 'function', n),
      setor: lerFaceta(e.pageStatisticsByIndustryV2, 'industryV2', n),
      senioridade: lerFaceta(e.pageStatisticsBySeniority, 'seniority', n),
      porte: lerFaceta(e.pageStatisticsByStaffCountRange, 'staffCountRange', n),
    },
  };
}

/** totalShareStatistics em números do Painel. O alcance (únicos) aparece
 *  como uniqueImpressionsCount no esquema e "uniqueImpressionsCounts" no
 *  exemplo da documentação: aceita os dois. Sem o campo, só vale zero quando
 *  não houve impressão nenhuma; senão é null. engagement é TAXA, não soma. */
export function lerNumerosConteudo(s) {
  if (!s || typeof s !== 'object') return null;
  const impressoes = num(s.impressionCount);
  const unicos = num(s.uniqueImpressionsCount) ?? num(s.uniqueImpressionsCounts);
  const cliques = num(s.clickCount), curtidas = num(s.likeCount), comentarios = num(s.commentCount), compartilhamentos = num(s.shareCount);
  const engajamento = somaOuNulo(curtidas, comentarios, compartilhamentos, cliques);
  return {
    impressoes,
    alcance: unicos ?? (impressoes === 0 ? 0 : null),
    cliques, curtidas, comentarios, compartilhamentos, engajamento,
    taxa: num(s.engagement) ?? taxa(engajamento, impressoes),
  };
}

/** Conteúdo (todos os posts somados) por dia UTC. */
export function lerConteudoPorDia(resp) {
  const porDia = new Map();
  for (const e of lista(resp?.elements)) {
    const dia = diaUTC(e?.timeRange?.start);
    const n = lerNumerosConteudo(e?.totalShareStatistics);
    if (dia && n) porDia.set(dia, { dia, ...n });
  }
  return porDia;
}

/** Conteúdo acumulado (sem timeIntervals, janela móvel de 12 meses). */
export function lerConteudoTotal(resp) {
  return lerNumerosConteudo(lista(resp?.elements)[0]?.totalShareStatistics);
}

/** Estatística acumulada por post: URN do post para os números. */
export function lerEstatisticasPorPost(resp) {
  const porPost = new Map();
  for (const e of lista(resp?.elements)) {
    const urn = e?.share ?? e?.ugcPost;
    const n = lerNumerosConteudo(e?.totalShareStatistics);
    if (typeof urn === 'string' && n) porPost.set(urn, n);
  }
  return porPost;
}
// O post que não teve impressão nem ação não volta na resposta por post; a
// documentação manda tratar como zero.
const ZERADO = { impressoes: 0, alcance: 0, cliques: 0, curtidas: 0, comentarios: 0, compartilhamentos: 0, engajamento: 0, taxa: null };

function tipoDoPost(p) {
  const c = p?.content && typeof p.content === 'object' ? p.content : {};
  const midia = typeof c.media?.id === 'string' ? c.media.id : '';
  if (/^urn:li:video:/.test(midia)) return 'video';
  if (/^urn:li:image:/.test(midia)) return 'imagem';
  if (/^urn:li:document:/.test(midia)) return 'documento';
  if (c.multiImage) return 'imagens';
  if (c.article) return 'artigo';
  if (c.poll) return 'enquete';
  if (c.celebration) return 'celebracao';
  if (c.carousel) return 'carrossel';
  if (p?.reshareContext) return 'compartilhamento';
  return 'texto';
}

/** Lista de posts (finder q=author). Só os publicados, desde `desde` (dia de
 *  São Paulo). Post só de anúncio (feedDistribution NONE) não é publicação da
 *  Página. Nada de texto, título ou mídia sai daqui. */
export function lerPosts(resp, desde) {
  const itens = [];
  const ignorados = { nao_publicados: 0, sem_feed: 0 };
  let maisAntigo = null;
  for (const p of lista(resp?.elements)) {
    const urn = p?.id;
    if (typeof urn !== 'string' || !/^urn:li:(share|ugcPost):\d+$/.test(urn)) continue;
    const ms = tempo(p.publishedAt) ?? tempo(p.createdAt);
    const data = ms == null ? null : hojeSP(new Date(ms));
    if (data && (!maisAntigo || data < maisAntigo)) maisAntigo = data;
    if (p.lifecycleState !== 'PUBLISHED') { ignorados.nao_publicados++; continue; }
    if (p.distribution?.feedDistribution === 'NONE') { ignorados.sem_feed++; continue; }
    if (!data || (desde && data < desde)) continue;
    const tipo = tipoDoPost(p);
    itens.push({ urn, url: linkDoPost(urn), data, publicado_em: new Date(ms).toISOString(), tipo, patrocinado: !!p.adContext });
  }
  return { itens, ignorados, maisAntigo };
}

/** Próxima página da lista de posts: só quando o LinkedIn diz que há mais
 *  (link "next" ou total). Uma página pode vir com menos itens que count
 *  mesmo havendo mais, por isso o tamanho da página não decide. */
export function proximoInicio(resp, inicioAtual, count) {
  const paging = resp?.paging || {};
  const start = num(paging.start) ?? inicioAtual;
  const passo = num(paging.count) ?? count;
  const temNext = lista(paging.links).some((l) => l?.rel === 'next');
  const total = num(paging.total);
  if (!lista(resp?.elements).length) return null;
  if (temNext || (total != null && start + passo < total)) return start + passo;
  return null;
}

/** socialMetadata: reações por tipo (qualquer tipo que vier: a lista do
 *  LinkedIn muda, ENTERTAINMENT entrou e MAYBE saiu) e comentários. */
export function lerSocialMetadata(resp) {
  if (!resp || typeof resp !== 'object') return null;
  const reacoes = {};
  let total = 0, temReacao = false;
  for (const [k, v] of Object.entries(resp.reactionSummaries || {})) {
    const n = inteiroValido(num(v?.count));
    if (n == null) continue;
    const tipo = typeof v?.reactionType === 'string' ? v.reactionType : k;
    reacoes[tipo] = (reacoes[tipo] || 0) + n;
    total += n; temReacao = true;
  }
  const veioResumo = resp.reactionSummaries && typeof resp.reactionSummaries === 'object';
  return {
    reacoes: veioResumo ? reacoes : null,
    reacoes_total: veioResumo ? (temReacao ? total : 0) : null,
    comentarios_total: num(resp.commentSummary?.count),
    comentarios_principais: num(resp.commentSummary?.topLevelCount),
  };
}

/** videoAnalytics com aggregation ALL: soma os valores que vierem. */
export function lerVideo(resp) {
  let s = null;
  for (const e of lista(resp?.elements)) {
    const v = num(e?.value);
    if (v != null) s = (s ?? 0) + v;
  }
  return s;
}

// --------------------------------------------------- erro e chamadas --

/** O que deu errado numa chamada, sem texto do provedor para a tela:
 *  reconectar (401), versao (versão da API vencida), cota (429),
 *  sem_permissao (403), formato (400), falhou (resto). */
export function classificarErro(falha) {
  const status = falha?.status ?? null;
  const corpo = falha?.corpo && typeof falha.corpo === 'object' ? falha.corpo : {};
  const codigo = String(corpo.code ?? ''), msg = String(corpo.message ?? '');
  if (status === 401) return 'reconectar';
  if (status === 426 || /VERSION/i.test(codigo) || ((status === 400 || status === 404) && /version/i.test(msg))) return 'versao';
  if (status === 429) return 'cota';
  if (status === 403) return 'sem_permissao';
  if (status === 400) return 'formato';
  return 'falhou';
}

// O contrato diz que o ctx.fetchJson "devolve o erro" em 401/403, sem dizer
// se lança ou devolve um envelope. Aceita os dois jeitos: erro lançado com
// status (ou "HTTP 403" na mensagem), envelope {ok, status, dados} e o corpo
// de erro do LinkedIn devolvido como se fosse resposta.
export function lerFalha(e) {
  let status = num(e?.status) ?? num(e?.statusCode) ?? num(e?.resposta?.status) ?? num(e?.response?.status);
  if (status == null) { const m = /\b([45]\d\d)\b/.exec(String(e?.message ?? '')); if (m) status = Number(m[1]); }
  const corpo = e?.corpo ?? e?.body ?? e?.dados ?? e?.json ?? e?.data ?? null;
  return { status, corpo: corpo && typeof corpo === 'object' ? corpo : null };
}
export function desembrulhar(r) {
  if (r && typeof r === 'object' && typeof r.ok === 'boolean' && typeof r.status === 'number') {
    const corpo = r.dados ?? r.json ?? r.corpo ?? r.body ?? r.data ?? null;
    return r.ok ? { corpo } : { falha: { status: r.status, corpo } };
  }
  if (r && typeof r === 'object' && num(r.status) >= 400 && ('serviceErrorCode' in r || 'message' in r || 'code' in r)) {
    return { falha: { status: r.status, corpo: r } };
  }
  return { corpo: r };
}

/** Quantas chamadas esta execução pode gastar. */
export function orcamentoDaRodada(chamadasHoje) {
  const usadas = num(chamadasHoje);
  if (usadas == null) return ORCAMENTO_CHAMADAS;
  return Math.max(0, Math.min(ORCAMENTO_CHAMADAS, TETO_DIA - RESERVA_DIA - usadas));
}

// Cada get conta UMA chamada no orçamento, e é uma ida só de verdade: a
// coletora não repete pedido ao api.linkedin.com (SEM_REPETIR em
// coletora.mjs), justamente para esta conta bater com o teto de 100 por dia.
function cliente(ctx, token, orcamento) {
  const estado = { usadas: 0, parado: null, orcamento };
  async function get(nome, caminho, cabecalhos = {}) {
    if (estado.parado) return { ok: false, motivo: estado.parado };
    if (estado.usadas >= orcamento) return { ok: false, motivo: 'orcamento' };
    const resta = typeof ctx.prazo === 'function' ? num(ctx.prazo()) : null;
    if (resta != null && resta < FOLGA_PRAZO_MS) return { ok: false, motivo: 'prazo' };
    estado.usadas++;
    let falha = null, corpo = null;
    try {
      const r = await ctx.fetchJson(BASE + caminho, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'LinkedIn-Version': VERSAO_API,
          'X-Restli-Protocol-Version': '2.0.0',
          ...cabecalhos,
        },
        rotulo: `linkedin:${nome}`,
      });
      const d = desembrulhar(r);
      if (d.falha) falha = d.falha; else corpo = d.corpo;
    } catch (e) {
      falha = lerFalha(e);
    }
    if (!falha) return { ok: true, dados: corpo };
    const motivo = classificarErro(falha);
    // Só o nome da chamada e o status: nem token, nem texto do provedor.
    ctx.log?.(`linkedin: ${nome} recusada (${falha.status ?? 'sem resposta'}, ${motivo})`);
    // Token morto, versão vencida e cota do dia param tudo: insistir só
    // gasta cota e repete o mesmo erro.
    if (motivo === 'reconectar' || motivo === 'versao' || motivo === 'cota') estado.parado = motivo;
    return { ok: false, motivo, status: falha.status };
  }
  return { get, estado };
}

// -------------------------------------------------------------- token --

// O mkt-oauth.mjs lê o env como função (env('X')) ou como objeto (env.X):
// entrega os dois jeitos, e o do Deno (env.get('X')) de quebra.
function envDaRenovacao(ctx) {
  const ler = (nome) => ctx.env(nome);
  const env = (nome) => ler(nome);
  env.get = ler;
  for (const n of SECRETS) env[n] = ler(n);
  return env;
}

// O fetch da renovação, com o mesmo teto de 20 s das chamadas do ctx: a
// troca de token não pode segurar a coleta inteira. Vai pelo ctx.fetch da
// coletora quando ele existe (como no Google e no Pinterest): assim a ida ao
// endpoint de token passa pela trava de hosts da fonte, para quando o
// orçamento acaba e entra na conta de chamadas do diário.
function fetchDaRenovacao(ctx) {
  const base = typeof ctx.fetch === 'function' ? ctx.fetch : (url, init) => globalThis.fetch(url, init);
  return (url, init = {}) => base(url, { ...init, signal: AbortSignal.timeout(20_000) });
}

// Junta a conexão renovada sem deixar um campo ausente (undefined) apagar o
// que já existia, como o refresh_token que nem toda renovação devolve.
function juntarConexao(velha, nova) {
  const fora = { ...velha };
  for (const [k, v] of Object.entries(nova || {})) if (v !== undefined && v !== null) fora[k] = v;
  return fora;
}

// O que cada recusa da renovação (ErroOAuth.codigo) quer dizer, quando o
// token guardado já não serve mais.
const RECUSA_RENOVACAO = {
  reconectar: ['reconectar', 'O LinkedIn recusou a conexão guardada. Clique em Reconectar.'],
  credencial_recusada: ['erro', 'O LinkedIn recusou o ID ou a chave secreta do app. Confira os Secrets do Supabase.'],
  falta_configurar: ['falta_configurar', 'Faltam o ID e a chave secreta do app do LinkedIn nos Secrets do Supabase.'],
};

/** O token desta coleta. A coletora (painel-mkt-fontes) já renova com 7
 *  dias de folga e já avisa do prazo (avisosDaConexao do mkt-oauth.mjs);
 *  aqui é a última rede: só renova o token vencido ou que vence durante esta
 *  coleta, para não pedir duas renovações seguidas nem repetir o aviso. */
async function prepararToken(ctx, cx, avisar) {
  const agora = Date.now();
  const exp = instante(cx.expira_em);
  if (exp == null || exp - agora > ULTIMOS_MINUTOS_MS) return { token: cx.access_token };
  const vivo = exp > agora + 60_000;
  const expRefresh = instante(cx.refresh_expira_em);
  const temRefresh = typeof cx.refresh_token === 'string' && !!cx.refresh_token && (expRefresh == null || expRefresh > agora);
  if (!temRefresh) {
    if (vivo) return { token: cx.access_token };
    avisar('O acesso ao LinkedIn venceu. Clique em Reconectar.');
    return { estado: 'reconectar' };
  }
  let recusa = null;
  try {
    const nova = await renovar(FONTE, cx, envDaRenovacao(ctx), fetchDaRenovacao(ctx), { agora });
    if (nova && typeof nova.access_token === 'string' && nova.access_token) {
      const conexao = juntarConexao(cx, nova);
      return { token: conexao.access_token, conexao };
    }
  } catch (e) {
    const codigo = typeof e?.codigo === 'string' ? e.codigo : null;
    // Só o código curto do mkt-oauth: a mensagem pode trazer o que o
    // provedor respondeu.
    ctx.log?.(`linkedin: renovação do acesso recusada (${codigo ?? 'sem código'})`);
    recusa = RECUSA_RENOVACAO[codigo] ?? null;
  }
  // Ainda vale por alguns minutos: coleta com ele e deixa o aviso.
  if (vivo) {
    if (recusa) avisar(recusa[1]);
    return { token: cx.access_token };
  }
  const [estado, aviso] = recusa ?? ['erro', 'Não deu para renovar o acesso ao LinkedIn agora. A próxima coleta tenta de novo.'];
  avisar(aviso);
  return { estado };
}

// ------------------------------------------------------------- semanas --

/** Os números das 8 semanas fechadas, por parte (para o "dados") e em linhas
 *  para painel_mkt_api_metricas (sem o canal). Só vai o número medido. */
export function montarSemanas({ hoje, ganhos = null, total = null, conteudo = null, visitas = null }) {
  const semanas = semanasFechadas(hoje);
  const atual = segundaDaSemana(hoje);
  const fora = { seguidores: [], conteudo: [], visitas: [], linhas: [], fora_da_faixa: [] };
  // Total no fim da última semana fechada: o de hoje menos os ganhos desde a
  // segunda atual (os 2 dias mais recentes ainda não chegaram do LinkedIn).
  let totalFim = null;
  if (total != null) {
    totalFim = total;
    if (ganhos) for (const [dia, g] of ganhos) if (dia >= atual && g.total != null) totalFim -= g.total;
  }
  semanas.forEach((semana, i) => {
    const numeros = {};
    const guardar = (k, v) => {
      if (v == null) return;
      const n = inteiroValido(v);
      if (n == null) { fora.fora_da_faixa.push(`${k} ${semana}`); return; }
      numeros[k] = n;
    };
    if (ganhos) {
      fora.seguidores.push({
        semana,
        ganho: somaDaSemana(ganhos, semana, (d) => d.total),
        organicos: somaDaSemana(ganhos, semana, (d) => d.organicos),
        pagos: somaDaSemana(ganhos, semana, (d) => d.pagos),
        total_fim: i === 0 ? totalFim : null,
      });
    }
    // Só na segunda logo depois da semana, com o total lido (o retrato). A
    // estimativa dos outros dias fica só para a tela (total_fim acima).
    if (i === 0 && total != null && hoje === somarDias(semana, 7)) guardar('seguidores', total);
    if (conteudo) {
      const s = (k) => somaDaSemana(conteudo, semana, (d) => d[k]);
      const linha = {
        semana, impressoes: s('impressoes'), alcance: s('alcance'), cliques: s('cliques'), curtidas: s('curtidas'),
        comentarios: s('comentarios'), compartilhamentos: s('compartilhamentos'), engajamento: s('engajamento'),
      };
      linha.taxa = taxa(linha.engajamento, linha.impressoes);
      fora.conteudo.push(linha);
      guardar('alcance', linha.alcance);
      guardar('impressoes', linha.impressoes);
      guardar('engajamento', linha.engajamento);
      guardar('cliques', linha.cliques);
    }
    if (visitas) {
      const comp = somaDaSemana(visitas, semana, (d) => d.cliques_botao_computador);
      const cel = somaDaSemana(visitas, semana, (d) => d.cliques_botao_celular);
      fora.visitas.push({
        semana,
        visualizacoes: somaDaSemana(visitas, semana, (d) => d.visualizacoes),
        inicio: somaDaSemana(visitas, semana, (d) => d.inicio),
        cliques_botao: somaOuNulo(comp, cel),
      });
    }
    if (Object.keys(numeros).length) fora.linhas.push({ semana, numeros });
  });
  return fora;
}

// ------------------------------------------------------------- coleta --

// O motivo de cada parte vai para a tela como está: texto curto para gente.
// A chave é o código interno da falha (classificarErro e os cortes), e ele
// vai junto em partes[parte].codigo, para separar um caso do outro sem
// comparar frase.
export const MOTIVOS = Object.freeze({
  orcamento: 'As chamadas desta coleta acabaram antes; o que faltou vem na próxima.',
  prazo: 'O tempo da coleta acabou antes; o que faltou vem na próxima.',
  cota: 'O LinkedIn avisou que a cota do dia acabou; o que faltou vem na próxima coleta.',
  reconectar: 'O LinkedIn recusou o acesso guardado.',
  versao: `O LinkedIn recusou a versão ${VERSAO_API} da API.`,
  sem_permissao: 'O LinkedIn não liberou este dado para o app.',
  sem_escopo: 'A conexão veio sem a permissão deste dado. Conecte de novo e aceite tudo.',
  formato: 'O LinkedIn recusou o pedido.',
  falhou: 'O LinkedIn não respondeu desta vez.',
  estatistica: 'Os números por post não vieram desta vez.',
  detalhe: 'Parte das reações ou dos números de vídeo não veio.',
});
// Falta que não é defeito: a próxima coleta completa. Com ela, o estado
// geral é "parcial", nunca "erro".
const ADIADO = new Set(['orcamento', 'prazo', 'cota']);
const PARTES = ['pagina', 'seguidores', 'visitas', 'conteudo', 'posts'];

const AVISO_COTA = 'O LinkedIn avisou que a cota do dia acabou (100 chamadas por pessoa). O resto fica para a próxima coleta.';
const AVISO_VERSAO = `O LinkedIn recusou a versão ${VERSAO_API} da API. É preciso trocar a constante VERSAO_API do conector pela versão atual.`;
const AVISO_RECONECTAR = 'O LinkedIn recusou o acesso guardado. Clique em Reconectar.';


/* O NÚMERO FORA DA FAIXA, PARA GENTE (revisão de 12/10): a chave interna e
   a data em ISO ("impressoes 2026-09-28") vão para o diário; o aviso diz
   "as impressões da semana de 28/09". */
const NOME_DO_NUMERO = Object.freeze({
  seguidores: 'os seguidores', alcance: 'o alcance', impressoes: 'as impressões', engajamento: 'o engajamento',
  cliques: 'os cliques', conversas: 'as conversas', leads: 'os leads',
});
export function avisoDeForaDaFaixa(itens) {
  const lidos = (Array.isArray(itens) ? itens : []).map((x) => {
    const [k, semana] = String(x).split(' ');
    const d = /^\d{4}-(\d{2})-(\d{2})$/.exec(semana ?? '');
    return `${NOME_DO_NUMERO[k] ?? 'um número'}${d ? ` da semana de ${d[2]}/${d[1]}` : ''}`;
  });
  const l = [...new Set(lidos)];
  if (!l.length) return null;
  const nomes = l.length > 1 ? `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}` : l[0];
  return `${l.length === 1 ? 'Um número veio' : 'Alguns números vieram'} fora da faixa e ${l.length === 1 ? 'ficou' : 'ficaram'} de fora: ${nomes}.`;
}
export async function coletar(ctx) {
  const avisos = [];
  const avisar = (t) => { if (t && !avisos.includes(t)) avisos.push(t); };
  const canal = acharCanal(ctx?.canais);
  // A faxina vai em TODO retorno: a regra de guarda vale mesmo quando a
  // coleta de hoje não acontece.
  const faxina = { ...FAXINA, canal: canal?.codigo ?? FAXINA.canal };
  const cx = ctx?.conexao && typeof ctx.conexao === 'object' ? ctx.conexao : null;
  const parar = (estado, extra = {}) => ({
    estado, conta: (cx && typeof cx.conta === 'string' ? cx.conta : null), partes: {}, dados: {}, semanas: [], publicacoes: [], avisos, faxina, ...extra,
  });

  const faltam = SECRETS.filter((n) => !ctx.env(n));
  if (faltam.length) {
    avisar(`Falta cadastrar ${faltam.join(' e ')} nos Secrets das Edge Functions do Supabase.`);
    return parar('falta_configurar');
  }
  if (!cx || typeof cx.access_token !== 'string' || !cx.access_token) return parar('falta_conectar');
  const escopos = lerEscopos(cx.escopos);
  if (escopos && !escopos.has(ESCOPO_ADMIN)) {
    avisar('A conexão com o LinkedIn veio sem a permissão de administrador da Página. Clique em Reconectar e aceite todas as permissões.');
    return parar('reconectar');
  }

  const tk = await prepararToken(ctx, cx, avisar);
  if (tk.estado) return parar(tk.estado);
  const comConexao = tk.conexao ? { conexao: tk.conexao } : {};

  const orcamento = orcamentoDaRodada(ctx.chamadasHoje);
  const cli = cliente(ctx, tk.token, orcamento);
  const coletadoEm = new Date().toISOString();
  const partes = {}, codigos = {}, dados = {};
  const cota = () => ({ orcamento, usadas: cli.estado.usadas, teto_dia: TETO_DIA, versao_api: VERSAO_API });
  // Estado de parte é um dos estados da coletora (ok, parcial, erro...):
  // outro valor ela troca por "erro". O código fica guardado aqui para o
  // estado geral e para os avisos.
  // O código que vai para a tela é o da frase que vai junto: código que não
  // está em MOTIVOS vira "falhou", como a frase.
  const parte = (nome, estado, codigo = null) => {
    const conhecido = codigo && Object.prototype.hasOwnProperty.call(MOTIVOS, codigo) ? codigo : 'falhou';
    partes[nome] = codigo ? { estado, motivo: MOTIVOS[conhecido], codigo: conhecido, coletado_em: coletadoEm } : { estado, coletado_em: coletadoEm };
    codigos[nome] = codigo;
  };
  const avisarFalha = (r, oQue) => {
    if (r.motivo === 'sem_permissao') avisar(`O LinkedIn não liberou ${oQue} para este app.`);
    else if (r.motivo === 'formato') avisar(`O LinkedIn recusou o pedido de ${oQue}.`);
    else if (r.motivo === 'falhou') avisar(`O LinkedIn não mandou ${oQue} desta vez.`);
  };

  const hoje = ctx.hoje || hojeSP();
  const semanas = semanasFechadas(hoje);
  const inicio = semanas[semanas.length - 1];
  const ontem = somarDias(hoje, -1);
  // Os dias UTC da série, só os da janela (o pedido pega um dia a mais nas
  // pontas, porque cada estatística conta o início e o fim de um jeito).
  const dentro = (porDia) => new Map([...porDia].filter(([dia]) => dia >= inicio && dia <= ontem).sort(([a], [b]) => (a < b ? -1 : 1)));

  const fechar = () => {
    const parado = cli.estado.parado;
    if (parado === 'cota') avisar(AVISO_COTA);
    if (parado === 'versao') avisar(AVISO_VERSAO);
    if (parado === 'reconectar') avisar(AVISO_RECONECTAR);
    const valores = Object.values(partes).map((p) => p.estado);
    const cods = Object.values(codigos);
    let estado;
    if (parado === 'reconectar') estado = 'reconectar';
    else if (parado === 'versao') estado = 'erro';
    else if (valores.length && valores.every((v) => v === 'ok')) estado = 'ok';
    else if (valores.some((v) => v === 'ok' || v === 'parcial') || cods.some((c) => ADIADO.has(c))) estado = 'parcial';
    else estado = 'erro';
    if (cods.includes('orcamento')) avisar(`Esta coleta usou as ${orcamento} chamadas que tinha; o detalhe que faltou vem na próxima.`);
    if (cods.includes('prazo')) avisar('O tempo da coleta acabou antes do fim; o que faltou vem na próxima.');
    dados.cota = cota();
    ctx.log?.(`linkedin: ${cli.estado.usadas} chamada(s), estado ${estado}`);
    return { estado, conta: dados.pagina?.nome ?? (typeof cx.conta === 'string' ? cx.conta : null), partes, dados, semanas: [], publicacoes: [], avisos, faxina, ...comConexao };
  };

  if (orcamento <= 0) {
    for (const p of PARTES) parte(p, 'erro', 'orcamento');
    avisar('A cota do dia do LinkedIn já foi usada por outras coletas. A próxima coleta tenta de novo.');
    return fechar();
  }

  // 1. A Página que a conta administra. Sem ela, nada mais tem endereço.
  const acl = await cli.get('organizationAcls', '/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=20');
  if (!acl.ok) {
    if (acl.motivo === 'sem_permissao') {
      // 403 na porta de entrada do produto: o app ainda não tem (ou perdeu)
      // a Community Management API.
      avisar('O LinkedIn ainda não liberou a Community Management API para este app. Acompanhe o pedido na aba Products do app.');
      return { ...parar('aguardando_aprovacao'), ...comConexao, dados: { cota: cota() } };
    }
    parte('pagina', 'erro', acl.motivo);
    avisarFalha(acl, 'a lista de Páginas');
    return fechar();
  }
  const orgs = lerAcl(acl.dados);
  if (!orgs.length) {
    avisar('A conta conectada não é administradora de nenhuma Página no LinkedIn. Quem conecta precisa ser administrador da Página da Impresilk.');
    return { ...parar('reconectar'), ...comConexao, dados: { cota: cota() } };
  }
  if (orgs.length > 1) avisar(`A conta administra ${orgs.length} Páginas; o Painel usa a primeira.`);
  const org = orgs[0];
  const orgEnc = enc(org.urn);

  const rOrg = await cli.get('organizations', `/organizations/${org.id}`);
  if (rOrg.ok) {
    dados.pagina = lerOrganizacao(rOrg.dados, org.urn);
    parte('pagina', 'ok');
  } else {
    // Só o que a lista de Páginas já disse; nome e endereço ficam os da
    // coleta anterior (a coletora junta campo a campo na parte parcial).
    dados.pagina = { urn: org.urn, id: org.id };
    parte('pagina', 'parcial', rOrg.motivo);
    avisarFalha(rOrg, 'os dados da Página');
  }

  // 2. O que alimenta os números da semana, uma chamada cada.
  const rTotal = await cli.get('networkSizes', `/networkSizes/${orgEnc}?edgeType=COMPANY_FOLLOWED_BY_MEMBER`);
  const rGanhos = await cli.get('seguidoresPorDia',
    `/organizationalEntityFollowerStatistics?q=organizationalEntity&organizationalEntity=${orgEnc}&${janelaDia(inicio, ontem)}`);
  const rVisitas = await cli.get('visitasPorDia',
    `/organizationPageStatistics?q=organization&organization=${orgEnc}&${janelaDia(somarDias(inicio, -1), hoje)}`);
  const rConteudo = await cli.get('conteudoPorDia',
    `/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${orgEnc}&${janelaDia(inicio, hoje)}`);

  const total = rTotal.ok ? lerTotalSeguidores(rTotal.dados) : null;
  const ganhos = rGanhos.ok ? dentro(lerGanhosPorDia(rGanhos.dados)) : null;
  const visitas = rVisitas.ok ? dentro(lerVisitasPorDia(rVisitas.dados)) : null;
  const conteudo = rConteudo.ok ? dentro(lerConteudoPorDia(rConteudo.dados)) : null;
  if (!rTotal.ok) avisarFalha(rTotal, 'o total de seguidores');
  if (!rGanhos.ok) avisarFalha(rGanhos, 'os ganhos de seguidores por dia');
  if (!rVisitas.ok) avisarFalha(rVisitas, 'as visitas à Página');
  if (!rConteudo.ok) avisarFalha(rConteudo, 'os números dos posts por dia');
  for (const [serie, nome] of [[ganhos, 'ganhos de seguidores'], [visitas, 'visitas'], [conteudo, 'números dos posts']]) {
    const n = diasFaltando(serie, inicio);
    if (n) avisar(`O LinkedIn não mandou ${n} dia(s) de ${nome}; a semana com falta ficou sem esse número.`);
  }

  // 3. Posts dos últimos 60 dias: a lista, depois a estatística por post.
  const desde = somarDias(hoje, -DIAS_POSTS);
  const posts = [];
  const ignorados = { nao_publicados: 0, sem_feed: 0 };
  let rPosts = { ok: false, motivo: 'sem_escopo' };
  if (escopos && !escopos.has(ESCOPO_POSTS)) {
    avisar('A conexão não tem a permissão de ler os posts da Página (r_organization_social). Clique em Reconectar.');
  } else {
    let start = 0;
    for (let pagina = 0; pagina < MAX_PAGINAS_POSTS; pagina++) {
      const r = await cli.get('posts', `/posts?author=${orgEnc}&q=author&count=100&sortBy=CREATED${start ? `&start=${start}` : ''}`, { 'X-RestLi-Method': 'FINDER' });
      if (!r.ok) { if (pagina === 0) rPosts = r; else avisarFalha(r, 'a lista completa de posts'); break; }
      rPosts = r;
      const lidos = lerPosts(r.dados, desde);
      for (const p of lidos.itens) if (!posts.some((x) => x.urn === p.urn)) posts.push(p);
      ignorados.nao_publicados += lidos.ignorados.nao_publicados;
      ignorados.sem_feed += lidos.ignorados.sem_feed;
      // Ordenado do mais novo para o mais velho: passou da janela, acabou.
      if (lidos.maisAntigo && lidos.maisAntigo < desde) break;
      const prox = proximoInicio(r.dados, start, 100);
      if (prox == null) break;
      if (pagina === MAX_PAGINAS_POSTS - 1) avisar('Há mais posts nos últimos 60 dias do que o Painel lê numa coleta; os mais antigos ficaram de fora.');
      start = prox;
    }
    if (!rPosts.ok) avisarFalha(rPosts, 'a lista de posts');
  }
  posts.sort((a, b) => (a.publicado_em < b.publicado_em ? 1 : -1));

  // Estatística acumulada por post, em lotes. A forma ugcPosts=List(...) não
  // é confirmada (só a indexada tem exemplo): tenta a lista e, se o LinkedIn
  // recusar com 400, refaz o lote no formato indexado.
  const numerosPost = new Map();
  let statsOk = rPosts.ok, ugcIndexado = false;
  for (let i = 0; rPosts.ok && i < posts.length; i += LOTE_POSTS) {
    const lote = posts.slice(i, i + LOTE_POSTS).map((p) => p.urn);
    const shares = lote.filter((u) => u.startsWith('urn:li:share:'));
    const ugcs = lote.filter((u) => u.startsWith('urn:li:ugcPost:'));
    const montar = () => {
      let q = `/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${orgEnc}`;
      if (shares.length) q += `&shares=List(${shares.map(enc).join(',')})`;
      if (ugcs.length) q += ugcIndexado ? ugcs.map((u, k) => `&ugcPosts[${k}]=${enc(u)}`).join('') : `&ugcPosts=List(${ugcs.map(enc).join(',')})`;
      return q;
    };
    let r = await cli.get('estatisticaPorPost', montar());
    if (!r.ok && r.motivo === 'formato' && ugcs.length && !ugcIndexado) {
      ugcIndexado = true;
      r = await cli.get('estatisticaPorPost', montar());
    }
    if (!r.ok) { statsOk = false; avisarFalha(r, 'os números por post'); continue; }
    const lidos = lerEstatisticasPorPost(r.dados);
    for (const u of lote) numerosPost.set(u, lidos.get(u) ?? { ...ZERADO });
  }

  // 4. Perfis acumulados (mudam devagar; ficam depois do essencial).
  const rPerfilSeg = await cli.get('seguidoresPerfil', `/organizationalEntityFollowerStatistics?q=organizationalEntity&organizationalEntity=${orgEnc}`);
  const rPerfilVis = await cli.get('visitasDesdeSempre', `/organizationPageStatistics?q=organization&organization=${orgEnc}`);
  const rConteudoTotal = await cli.get('conteudoDesdeSempre', `/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${orgEnc}`);
  if (!rPerfilSeg.ok) avisarFalha(rPerfilSeg, 'o perfil dos seguidores');
  if (!rPerfilVis.ok) avisarFalha(rPerfilVis, 'o perfil dos visitantes');
  if (!rConteudoTotal.ok) avisarFalha(rConteudoTotal, 'os números acumulados dos posts');

  // 5. Detalhe por post, do mais novo para o mais velho, até onde a cota
  // deixar: reações por tipo e comentários; depois vídeo. Um 403 para o
  // tipo inteiro: repetir post a post só gastaria a cota com a mesma recusa.
  const detalhe = new Map();
  let corte = null, socialRecusado = false, videoRecusado = false, detalheFalhou = false;
  const semFeed = !!(escopos && !escopos.has(ESCOPO_FEED));
  if (rPosts.ok && !semFeed) {
    for (const p of posts.slice(0, MAX_DETALHE)) {
      const r = await cli.get('socialMetadata', `/socialMetadata/${enc(p.urn)}`);
      if (r.ok) { detalhe.set(p.urn, lerSocialMetadata(r.dados)); continue; }
      if (r.motivo === 'sem_permissao') { socialRecusado = true; avisarFalha(r, 'as reações por tipo'); break; }
      if (cli.estado.parado || ADIADO.has(r.motivo)) { corte = cli.estado.parado ?? r.motivo; break; }
      detalheFalhou = true;
    }
  } else if (rPosts.ok) {
    avisar('A conexão não tem a permissão de ler reações e comentários (r_organization_social_feed). Clique em Reconectar.');
  }
  const video = new Map();
  const videos = posts.filter((p) => p.tipo === 'video' && p.urn.startsWith('urn:li:ugcPost:')).slice(0, MAX_VIDEOS);
  for (const p of videos) {
    if (videoRecusado || corte || cli.estado.parado) break;
    const v = { visualizacoes: null, espectadores: null, tempo_das_visualizacoes_ms: null, tempo_assistido_ms: null };
    let algum = false;
    for (const [tipo, campo] of TIPOS_VIDEO) {
      const r = await cli.get('videoAnalytics', `/videoAnalytics?q=entity&entity=${enc(p.urn)}&type=${tipo}&aggregation=ALL`);
      if (r.ok) { v[campo] = lerVideo(r.dados); algum = true; continue; }
      if (r.motivo === 'sem_permissao') { videoRecusado = true; avisarFalha(r, 'os números de vídeo'); break; }
      if (cli.estado.parado || ADIADO.has(r.motivo)) { corte = cli.estado.parado ?? r.motivo; break; }
      detalheFalhou = true;
    }
    if (algum) video.set(p.urn, v);
  }

  // ------------------------------------------------ montar as partes --
  // Parte parcial leva só o que veio: a coletora junta campo a campo com a
  // coleta anterior, e um campo ausente mantém o de antes (um null apagaria).
  const sem = montarSemanas({ hoje, ganhos, total, conteudo, visitas });
  if (sem.fora_da_faixa.length) {
    ctx.log?.(`linkedin: fora da faixa ${sem.fora_da_faixa.join(', ')}`);
    avisar(avisoDeForaDaFaixa(sem.fora_da_faixa));
  }

  if (rTotal.ok || rGanhos.ok) {
    const s = {};
    if (rTotal.ok) s.total = total;
    if (rGanhos.ok) Object.assign(s, { pronto_ate: ganhos.size ? [...ganhos.keys()].pop() : null, por_dia: [...ganhos.values()], semanas: sem.seguidores });
    if (rPerfilSeg.ok) s.perfil = lerPerfilSeguidores(rPerfilSeg.dados);
    dados.seguidores = s;
    const falha = [rTotal, rGanhos, rPerfilSeg].find((r) => !r.ok);
    parte('seguidores', falha ? 'parcial' : 'ok', falha?.motivo);
  } else parte('seguidores', 'erro', rGanhos.motivo);

  if (rVisitas.ok) {
    const v = { por_dia: [...visitas.values()], semanas: sem.visitas };
    if (rPerfilVis.ok) {
      const desdeSempre = lerVisitasDesdeSempre(rPerfilVis.dados);
      Object.assign(v, { desde_sempre: desdeSempre?.desde_sempre ?? null, perfil: desdeSempre?.perfil ?? null });
    }
    dados.visitas = v;
    parte('visitas', rPerfilVis.ok ? 'ok' : 'parcial', rPerfilVis.ok ? null : rPerfilVis.motivo);
  } else parte('visitas', 'erro', rVisitas.motivo);

  if (rConteudo.ok) {
    const c = { por_dia: [...conteudo.values()], semanas: sem.conteudo };
    if (rConteudoTotal.ok) c.desde_sempre = lerConteudoTotal(rConteudoTotal.dados);
    dados.conteudo = c;
    parte('conteudo', rConteudoTotal.ok ? 'ok' : 'parcial', rConteudoTotal.ok ? null : rConteudoTotal.motivo);
  } else parte('conteudo', 'erro', rConteudo.motivo);

  if (rPosts.ok) {
    const itens = posts.map((p) => {
      const n = numerosPost.get(p.urn) ?? null;
      const s = detalhe.get(p.urn) ?? null;
      return {
        ...p,
        impressoes: n?.impressoes ?? null, alcance: n?.alcance ?? null, cliques: n?.cliques ?? null,
        curtidas: n?.curtidas ?? null, comentarios: n?.comentarios ?? null, compartilhamentos: n?.compartilhamentos ?? null,
        engajamento: n?.engajamento ?? null, taxa: n?.taxa ?? null,
        reacoes: s?.reacoes ?? null, reacoes_total: s?.reacoes_total ?? null,
        comentarios_total: s?.comentarios_total ?? null, comentarios_principais: s?.comentarios_principais ?? null,
        video: video.get(p.urn) ?? null,
      };
    });
    dados.posts = { desde, itens, ignorados };
    // Os posts além dos 15 mais novos ficam sem reações por tipo de
    // propósito (cota); isso não deixa a parte incompleta.
    const codigo = !statsOk ? 'estatistica' : corte ? corte : semFeed ? 'sem_escopo'
      : socialRecusado || videoRecusado ? 'sem_permissao' : detalheFalhou ? 'detalhe' : null;
    parte('posts', codigo ? 'parcial' : 'ok', codigo);
  } else parte('posts', 'erro', rPosts.motivo);

  const resultado = fechar();

  // ------------------------------- para o banco (só com o canal achado) --
  if (!canal) {
    avisar('Nenhum canal ativo do LinkedIn no Marketing: os números ficaram só nesta tela.');
    return resultado;
  }
  resultado.semanas = sem.linhas.map((l) => ({ canal: canal.codigo, semana: l.semana, numeros: l.numeros }));
  if (rPosts.ok) {
    resultado.publicacoes = posts.map((p) => {
      const linha = { canal: canal.codigo, url: p.url, data: p.data, titulo: null };
      const n = numerosPost.get(p.urn);
      if (n) {
        for (const k of ['impressoes', 'alcance', 'engajamento', 'cliques']) {
          const v = inteiroValido(n[k]);
          if (v != null) linha[k] = v;
        }
      }
      return linha;
    });
  }
  return resultado;
}
