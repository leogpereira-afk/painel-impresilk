/* CONECTOR "google": GOOGLE ANALYTICS 4, SEARCH CONSOLE E PERFIL DA EMPRESA.
 *
 * Pedido do Léo (11/10/2026): "integrar todos que derem para integrar e puxar
 * todos os dados possíveis". Contrato em docs/marketing/integracoes-contrato.md
 * (seção 4, interface do conector; seção 5, conectores). A pesquisa oficial de
 * cada API (levantamento + contraprova) ficou fora do repositório; onde as duas
 * discordaram, valeu a contraprova, e as regras que vieram dela estão citadas
 * nos comentários abaixo.
 *
 * Um consentimento só ("Conectar Google") serve as três partes, mas cada parte
 * tem estado próprio: o Léo pode desmarcar uma caixinha no consentimento
 * granular, e o Perfil da Empresa depende de uma aprovação do Google que o GA4
 * e o Search Console não pedem. Uma parte parada não derruba as outras.
 *
 * Roda no Deno (Edge Function painel-mkt-fontes) e no Node 20 (testes): só
 * JavaScript puro, globalThis e o ctx.fetchJson; nenhum import de npm.
 * SÓ LEITURA: nenhuma chamada daqui grava nada no Google.
 *
 * ============================================================== FORMATO ==
 * O que este conector devolve em `dados` (o contrato com a tela). Regra que
 * vale para tudo: número que o Google não informou é null, nunca zero. Datas
 * em AAAA-MM-DD; "semana" é sempre a SEGUNDA-FEIRA da semana.
 *
 * Parte com estado "parcial": o bloco que não deu tempo de coletar SAI do
 * objeto (em vez de null), porque a coletora junta a parte parcial por cima
 * da coleta anterior e assim o bloco de ontem continua na tela.
 *
 * dados = {
 *   versao: 1,
 *   periodo: { inicio, fim, semanas: [segundas das 8 semanas fechadas, da mais antiga para a mais nova] },
 *       inicio = segunda da semana fechada mais antiga; fim = ontem (São Paulo).
 *
 *   ga4: null | {                            // null = a parte não trouxe nada nesta coleta
 *     propriedade: { id: 'properties/N', nome, conta, fuso, moeda, nivel, criada_em,
 *                    medicao: 'G-...', fluxo: { nome, site }, achada_por: 'medicao' | 'site' },
 *     eventos_chave: null | [{ evento, contagem, desde, personalizado }],
 *         null = não deu para ler a lista; [] = nenhum evento-chave configurado
 *         (o "purchase" padrão do GA, que não se apaga, não conta como configurado).
 *     eventos_chave_desde: null | 'AAAA-MM-DD',   // o mais antigo configurado
 *     vinculo_ads: null | boolean,
 *     semanas: [{ semana, usuarios, novos, usuarios_totais, sessoes, sessoes_engajadas,
 *                 taxa_engajamento, visualizacoes, eventos, eventos_chave, tempo_engajamento_s }],
 *         usuarios contados SEM repetição dentro da semana (pedido próprio, nunca soma de dias).
 *     dias: [{ data, registrou, usuarios, novos, sessoes, sessoes_engajadas, taxa_engajamento,
 *              duracao_media_s, taxa_rejeicao, visualizacoes, eventos, eventos_chave }],
 *         calendário COMPLETO de inicio a fim. O GA4 não manda linha para dia sem
 *         registro (keepEmptyRows não garante, pela contraprova): esse dia vem com
 *         registrou=false, contagens 0 e taxas null SE a semana dele teve algum
 *         registro; semana inteira sem registro (ou dia antes de a propriedade
 *         existir) fica toda null, porque aí o zero seria um palpite.
 *         eventos_chave: null antes do primeiro evento-chave configurado.
 *     (eventos_chave de toda linha com "semana": null na semana que começou antes de
 *      eventos_chave_desde; nos quadros do período, conta só dali em diante.)
 *     canais:            [{ semana, canal, sessoes, sessoes_engajadas, usuarios, novos, eventos_chave }],
 *         canal é o texto do GA4 (qualquer um, inclusive "AI Assistant"): a tela não tem lista fixa.
 *     origens:           [{ semana, origem_midia, sessoes, sessoes_engajadas, usuarios, novos, eventos_chave }],
 *     campanhas:         [{ semana, campanha, origem_midia, sessoes, sessoes_engajadas, usuarios, novos, eventos_chave }],
 *     novos_recorrentes: [{ semana, tipo, usuarios, sessoes, sessoes_engajadas, eventos_chave }],
 *     aparelhos:         [{ semana, aparelho, usuarios, sessoes, sessoes_engajadas, eventos_chave }],
 *         (estas quatro também trazem a semana aberta, até ontem)
 *     paginas:   [{ caminho, titulo, host, link, visualizacoes, usuarios, tempo_engajamento_s, eventos, eventos_chave }],  // as 200 mais vistas do período
 *         caminho e pagina vêm COM a consulta (?page_id=144), porque o site ainda vive nesse formato.
 *     entradas:  [{ pagina, sessoes, sessoes_engajadas, usuarios, eventos_chave, taxa_rejeicao }],
 *     cidades:   [{ cidade, estado, pais, usuarios, sessoes, eventos_chave }],
 *     eventos_chave_dia: null | [{ data, evento, eventos_chave, eventos }],
 *     cliques_saida: null | [{ data, dominio, link, cliques }],   // null = não medido (medição otimizada desligada ou nenhum clique no período)
 *     whatsapp_medido: boolean,              // viu ao menos um clique para wa.me / whatsapp.com
 *     ads: null | [{ semana, campanha, custo, cliques, impressoes, cpc, roas, sessoes, eventos_chave }],  // só com vínculo ao Google Ads
 *     recusados: [chave do bloco que o GA4 recusou],
 *     cortados: [chave do bloco que veio cortado pelo teto de linhas],
 *         (as chaves são as deste objeto: servem para a tela saber qual quadro ficou sem dado;
 *          o aviso já diz o mesmo em português, sem a chave e sem a mensagem do Google)
 *     qualidade: { linha_other, limiar_privacidade, amostragem, cortes: [{ tipo, desde }] },
 *     cota: null | { dia_restante, hora_restante, projeto_hora_restante, erros_servidor_restantes },
 *   },
 *
 *   search_console: null | {
 *     propriedade: { site: 'sc-domain:...' | 'https://.../', permissao },
 *     fuso: 'America/Los_Angeles',           // as datas do Search Console são do horário do Pacífico
 *     primeiro_dia_incompleto: null | 'AAAA-MM-DD',
 *     semanas: null | [{ semana, fechada, cliques, impressoes, ctr, posicao }],   // tipo web; fechada=false vem com números null
 *     dias: [{ data, provisorio, cliques, impressoes, ctr, posicao }],     // de inicio até hoje
 *     por_hora: null | [{ hora, cliques, impressoes, ctr, posicao }],      // dias mais recentes, dado parcial
 *     tipos: null | { web, image, video, news, discover, googleNews },   // cada um null (sem volume) ou { cliques, impressoes, ctr, posicao }
 *     consultas, paginas: [{ consulta | pagina, cliques, impressoes, ctr, posicao }],   // no período (até 1000 linhas)
 *     consultas_semana, paginas_semana: null | [...],                     // só a última semana fechada
 *     paises: [{ pais, ... }], aparelhos: [{ aparelho, ... }], aparencias: [{ aparencia, ... }],
 *     marca: null | { marca: {cliques, impressoes}, nao_marca: {...}, anonimas: {...} },
 *         anonimas = total menos marca menos não marca: consulta rara não vira linha, mas entra no total.
 *     cortados: [chave do bloco que passou do teto],
 *     agregacao: { [bloco]: 'byProperty' | 'byPage' | 'auto' },        // por página e por propriedade contam diferente
 *     sitemaps: null | [{ caminho, enviado_em, lido_em, pendente, indice, tipo, avisos, erros, conteudos: [{ tipo, enviados }] }],
 *     inspecoes: null | [{ pagina, veredito, cobertura, robots, indexacao, rastreado_em, busca, canonica_google,
 *                          canonica_site, rastreado_como, ricos: null | { veredito, tipos }, link, consultado_em }],
 *       consultado_em = dia da consulta (São Paulo); reutiliza apenas no mesmo dia e na mesma propriedade.
 *   },
 *
 *   perfil: null | {
 *     contas: n,                             // quantas contas o login enxerga (accounts.list inteira)
 *     conta: { id, nome, tipo, papel, verificacao },
 *     local: { id, nome, site, telefone, categoria, categorias_extra, endereco, maps, pedir_avaliacao, place_id,
 *              aberto, descricao, pode_postar, alteracoes_pendentes, google_alterou, voz_do_comerciante,
 *              situacao: null | {...}, atributos: null | [{ nome, valores }], alteracoes_google: null | { campos, pendentes } },
 *     outros_locais: [{ id, nome }],
 *     metricas_recusadas: [nome da métrica do Google],
 *     dias: [{ data, impressoes_maps_computador, impressoes_busca_computador, impressoes_maps_celular,
 *              impressoes_busca_celular, rotas, ligacoes, cliques_site, reservas, cliques_cardapio }],
 *         o Google omite o valor do dia zerado. O dia que veio SEM valor só vira 0 quando já
 *         fechou: passou 3 dias dele E ele não é depois de dias_ate. Antes disso fica null (o
 *         Google pode só não ter processado ainda: os 2 ou 3 últimos dias costumam vir assim).
 *         Dia que nem aparece fica null. A tela mostra null como "ainda sem dado", nunca 0.
 *     dias_ate: null | 'AAAA-MM-DD',          // o último dia em que alguma métrica trouxe número
 *     semanas: [{ semana, fechada, impressoes, cliques_site, ligacoes, rotas, reservas, cliques, interacoes }],
 *         impressoes = soma das 4 visualizações (pessoa contada 1 vez POR DIA); cliques = site + ligação + rota;
 *         interacoes = cliques + reservas (cálculo do Painel, pode não bater com a tela do Google).
 *         Cada soma só sai com os 7 dias com número; um dia null deixa a soma null (nunca uma
 *         semana pela metade, que pareceria queda). fechada = passou 3 dias do domingo (o
 *         Google não documenta o atraso); a semana não fechada costuma vir com as somas null.
 *     seguidores: null | n,                  // total de hoje (a API não tem histórico)
 *     termos: null | [{ mes: 'AAAA-MM', completo, termos: [{ termo, usuarios, abaixo_de }] }],
 *         usuarios = número exato; abaixo_de = o Google só diz "menos que N".
 *     avaliacoes: null | { media, total, guardadas, completas, distribuicao: {1..5}, sem_resposta,
 *                          taxa_resposta, resposta_media_horas, por_semana: [{ semana, novas, media }], lista: [...] },
 *     posts: null | [{ id, tipo, situacao, texto, criado_em, atualizado_em, agendado_em, link, botao, evento, oferta, imagem }],
 *     fotos: null | { empresa, clientes, recentes: [{ id, formato, categoria, link, miniatura, criada_em }] },
 *   },
 * }
 *
 * NÚMEROS DA SEMANA (semanas -> painel_mkt_api_metricas). Só as 8 últimas
 * semanas FECHADAS, toda execução (é idempotente). Chave ausente = "não mexe";
 * NUNCA mandamos null, porque null apaga o número lançado à mão.
 *   canal "site":
 *     alcance     = usuários ativos da semana (GA4, sem repetição)
 *     impressoes  = visualizações de página (GA4)
 *     engajamento = sessões engajadas (GA4)
 *     leads       = eventos-chave (GA4), só se havia evento-chave configurado desde a segunda
 *     conversas   = cliques em link do WhatsApp (GA4, evento click), só da semana do PRIMEIRO
 *                   clique desses visto no período em diante (antes dela o zero seria "não
 *                   medido": a medição otimizada pode ter sido ligada depois)
 *     cliques     = cliques no Google (Search Console, tipo web), só com a semana fechada
 *                   pela regra do first_incomplete_date
 *   canal "google" (Perfil da Empresa), só com a semana fechada (3 dias depois do domingo)
 *   e só com os 7 dias com número (um dia ainda sem dado deixa a chave de fora):
 *     impressoes  = soma das 4 visualizações do perfil
 *     cliques     = cliques no site + ligações + rotas
 *     seguidores  = total de hoje, gravado na semana que acabou de fechar, SÓ na segunda logo
 *                   depois dela (o retrato de domingo; na terça o total já tem a segunda
 *                   inteira de outra semana, e regravar trocaria o retrato)
 *   conversas do Google: não existe mais (BUSINESS_CONVERSATIONS saiu em 31/01/2026).
 *
 * PUBLICAÇÕES (publicacoes -> painel_mkt_api_publicacoes): os posts do Perfil
 * da Empresa no ar (state LIVE), canal "google", link = searchUrl, data = dia
 * de criação em São Paulo, título = event.title (EVENT e OFFER) ou o começo do
 * texto. Sem números: as métricas por post foram desligadas em 20/02/2023.
 * As páginas do site saem do conector "site" (WordPress), não daqui.
 *
 * O ctx (seção 4 do contrato) mais dois opcionais que este conector aceita:
 *   ctx.ga4Medicoes: IDs "G-..." que as etiquetas do site acharam (somam ao G-W14DLRNWRD);
 *   ctx.anterior:    os `dados` da coleta anterior, para não perder avaliações quando a
 *                    lista do Google vier incompleta e para achar a propriedade mais rápido.
 * ctx.prazo() é lido em milissegundos (se a primeira leitura vier até 600, em segundos).
 */
import { somarDias, segundaDaSemana, hojeSP, normalizarLink } from '../marketing.mjs';
import { renovar } from '../mkt-oauth.mjs';

export const FONTE = 'google';
export const SECRETS = ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET'];
export const PARTES = ['ga4', 'search_console', 'perfil'];
// O ID de medição que está no HTML de impresilk.com.br (conferido em 11/10/2026).
export const MEDICAO_GA4 = 'G-W14DLRNWRD';

const ADMIN = 'https://analyticsadmin.googleapis.com/v1beta';
const DATA = 'https://analyticsdata.googleapis.com/v1beta';
const SC = 'https://www.googleapis.com/webmasters/v3';
const SC_INSPECAO = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';
const GBP_CONTAS = 'https://mybusinessaccountmanagement.googleapis.com/v1';
const GBP_INFO = 'https://mybusinessbusinessinformation.googleapis.com/v1';
const GBP_VERIF = 'https://mybusinessverifications.googleapis.com/v1';
const GBP_DESEMPENHO = 'https://businessprofileperformance.googleapis.com/v1';
const GBP_V4 = 'https://mybusiness.googleapis.com/v4';
const hostDaUrl = (u) => new URL(u).hostname;

// Escopos que liberam cada parte. O cofre pode guardar a URL inteira ou só o
// nome curto; os dois casam. analytics.edit e webmasters (sem .readonly) também
// dão leitura, e plus.business.manage é o nome antigo que o Google ainda aceita.
export const ESCOPOS = {
  ga4: ['analytics.readonly', 'analytics', 'analytics.edit'],
  search_console: ['webmasters.readonly', 'webmasters'],
  perfil: ['business.manage', 'plus.business.manage'],
};
const NOME_PARTE = { ga4: 'Google Analytics', search_console: 'Search Console', perfil: 'Perfil da Empresa' };

// Tetos. Os do GA4 são da documentação (contraprova): 10 métricas, 9
// dimensões e 4 intervalos por pedido, 5 pedidos por lote. Os outros são nossos:
// paginação sempre com teto, para um laço de nextPageToken nunca comer os 110 s.
export const LIMITES = {
  GA4_METRICAS: 10, GA4_DIMENSOES: 9, GA4_INTERVALOS: 4, GA4_LOTE: 5, GA4_PAGINAS_EXTRA: 3,
  ADMIN_PAGINAS: 5, PROPRIEDADES: 30,
  SC_LINHAS: 25000, SC_PAGINAS: 2, SC_GUARDAR: 1000, INSPECOES: 10,
  CONTAS_PAGINAS: 10, LOCAIS_PAGINAS: 5, AVALIACOES_PAGINAS: 10, POSTS_PAGINAS: 5, TERMOS_PAGINAS: 3, TERMOS_MESES: 3,
};
// Margens de tempo (ms). Uma chamada pode levar até 20 s no fetchJson; a
// coleta para de chamar antes de o orçamento acabar no meio de uma resposta.
const MARGEM_MS = 15_000;
const MARGEM_EXTRA_MS = 35_000;      // o que é opcional (por hora, inspeções) só roda com folga
const PRAZO_TOKEN_MS = 20_000;
// Abaixo disto o GA4 para de pedir relatório: estourar a cota por hora do
// projeto bloqueia o projeto inteiro naquela propriedade.
const COTA_MINIMA_HORA = 500;
const COTA_MINIMA_DIA = 2_000;
// O GA4 dá só 10 erros 500/503 por hora por projeto e propriedade, e
// estourar bloqueia o projeto naquela propriedade (pesquisa, cotas da Data
// API). Com 3 ou menos sobrando, o GA4 para: um soluço do Google agora
// gastaria o que outra coleta da hora ainda vai precisar.
const COTA_MINIMA_ERROS_SERVIDOR = 3;
// O Perfil da Empresa não documenta o atraso dos números diários.
const DIAS_ATRASO_PERFIL = 3;
const MAX_NUMERO = 1e9;

// ------------------------------------------------------------ utilidades --

const objeto = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const lista = (x) => (Array.isArray(x) ? x : []);
const textoOuNull = (x) => (typeof x === 'string' && x.trim() ? x.trim() : null);

/** Número que veio da API (o GA4 e o Perfil mandam em TEXTO). Vazio, ausente
 *  ou lixo é null: nunca vira zero por acidente. */
export function numeroApi(v) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}
const inteiroApi = (v) => { const n = numeroApi(v); return n == null ? null : Math.round(n); };
const arred = (n, casas) => (n == null ? null : Math.round(n * 10 ** casas) / 10 ** casas);

/** Inteiro que vai para o banco (as colunas aceitam 0 a 1 bilhão). */
const paraBanco = (n) => (n == null || !Number.isFinite(n) ? null : Math.min(MAX_NUMERO, Math.max(0, Math.round(n))));

const diaDeIso = (iso) => (typeof iso === 'string' && iso ? hojeSP(new Date(iso)) : null);
const dataGoogle = (d) => (objeto(d) && d.year && d.month && d.day
  ? `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}` : null);

function* diasEntre(de, ate) {
  for (let d = de; d <= ate; d = somarDias(d, 1)) yield d;
}

// Sem travessão em texto para gente (regra da casa) e nada que pareça token.
const TOKEN_GOOGLE = /\b(ya29\.[\w.-]+|1\/\/[\w.-]+|GOCSPX-[\w-]+)/g;
export function limparTexto(t, max = 200) {
  if (t == null) return null;
  return String(t)
    .replace(/Bearer\s+\S+/gi, 'Bearer [oculto]')
    .replace(TOKEN_GOOGLE, '[oculto]')
    .replace(/\s*[\u2013\u2014]\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** As janelas de datas, todas no dia de São Paulo. */
export function janelas(hoje) {
  const segundaAtual = segundaDaSemana(hoje);
  const semanas = [];
  for (let k = 8; k >= 1; k--) {
    const segunda = somarDias(segundaAtual, -7 * k);
    semanas.push({ segunda, domingo: somarDias(segunda, 6) });
  }
  return {
    hoje, segundaAtual, semanas,
    inicio: semanas[0].segunda,
    ultimoDomingo: somarDias(segundaAtual, -1),
    ontem: somarDias(hoje, -1),
  };
}

/** Escopos concedidos -> parte liberada. null = não sabemos (o cofre não
 *  guardou a lista); aí tentamos e o 403 de escopo decide. */
export function escoposDaParte(escopos) {
  const crus = Array.isArray(escopos) ? escopos : typeof escopos === 'string' ? escopos.split(/\s+/) : null;
  const curtos = (crus ?? []).filter(Boolean).map((e) => String(e).replace(/^https:\/\/www\.googleapis\.com\/auth\//, ''));
  const fora = {};
  for (const p of PARTES) fora[p] = curtos.length ? ESCOPOS[p].some((e) => curtos.includes(e)) : null;
  return fora;
}

// A coletora já renova antes de chamar o conector quando faltam menos de 5
// minutos (mkt-oauth.mjs, precisaRenovar); com a mesma régua, o caminho normal
// é usar o token do ctx sem renovar de novo.
function tokenAindaVale(c, folgaMs = 5 * 60 * 1000, agoraMs = Date.now()) {
  if (!c?.access_token || c.expira_em == null) return false;
  const ms = typeof c.expira_em === 'number' ? (c.expira_em < 1e12 ? c.expira_em * 1000 : c.expira_em) : Date.parse(c.expira_em);
  return Number.isFinite(ms) && ms - agoraMs > folgaMs;
}

// ------------------------------------------------- respostas e erros --

/** O fetchJson da coletora pode devolver o JSON direto ou um envelope
 *  {ok, status, dados}, e pode lançar o erro (com .status) ou devolvê-lo. Os
 *  quatro jeitos viram um só aqui, para o resto do arquivo não adivinhar. */
export function normalizarResposta(x) {
  if (objeto(x) && typeof x.ok === 'boolean' && typeof x.status === 'number') {
    const dados = x.dados ?? x.json ?? x.data ?? x.body ?? x.corpo ?? null;
    return { ok: x.ok, status: x.status, dados };
  }
  return { ok: true, status: 200, dados: x ?? null };
}
export function respostaDoErro(e) {
  const status = Number(e?.status ?? e?.statusCode ?? e?.httpStatus ?? 0) || 0;
  // A coletora lança ErroFonte com .codigo ('tempo', 'rede', 'limite'...) e
  // .corpo (o JSON de erro do Google, ou texto quando não era JSON).
  const dados = e?.dados ?? e?.corpo ?? e?.json ?? e?.data ?? e?.body ?? null;
  return { ok: false, status, dados: objeto(dados) ? dados : null, codigo: typeof e?.codigo === 'string' ? e.codigo : null };
}

/** O erro no formato do Google: {error: {code, message, status, details}}. */
export function erroGoogle(dados) {
  const e = dados?.error;
  if (!objeto(e)) return { status: null, motivo: null, mensagem: typeof e === 'string' ? e : '', cotaZero: false };
  const detalhes = lista(e.details).filter(objeto);
  const info = detalhes.find((d) => d.reason || String(d['@type'] ?? '').includes('ErrorInfo'));
  const motivo = info?.reason ?? lista(e.errors)[0]?.reason ?? null;
  const meta = objeto(info?.metadata) ? info.metadata : {};
  // O serviço que recusou (ErrorInfo.metadata.service), ou o que a mensagem
  // de "ative a API" cita (.../apis/api/<serviço>/...). Só nome de host.
  const servico = [meta.service, meta.serviceName, /apis\/api\/([a-z0-9.-]+\.googleapis\.com)/.exec(String(e.message ?? ''))?.[1]]
    .find((x) => typeof x === 'string' && /^[a-z0-9.-]+\.googleapis\.com$/.test(x)) ?? null;
  return {
    status: typeof e.status === 'string' ? e.status : null,
    motivo,
    servico,
    mensagem: typeof e.message === 'string' ? e.message : '',
    // Projeto do Perfil da Empresa ainda não aprovado: a cota por minuto é 0.
    cotaZero: String(meta.quota_limit_value ?? meta.quotaLimitValue ?? '') === '0',
  };
}
const mensagemGoogle = (dados) => limparTexto(erroGoogle(dados).mensagem, 160) || null;

/** O detalhe técnico (a mensagem do Google, em inglês, e o nome interno do
 *  relatório) vai SÓ para o diário da coleta. O aviso, que a tela mostra,
 *  diz o caso em português (revisão 2). */
const anotar = (ctx, texto) => { try { ctx?.log?.(limparTexto(texto, 300)); } catch { /* o diário não derruba a coleta */ } };
const dataBr = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(String(iso ?? '')) ? iso.split('-').reverse().join('/') : null);
/** "a, b e c": lista de nomes numa frase. */
const juntarNomes = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}` : xs[0] ?? '');

// Os quadros do GA4 pelo nome que o Léo entende (a chave é a de dados.ga4).
export const RELATORIOS_GA4 = Object.freeze({
  semanas: 'o resumo por semana', dias: 'o resumo por dia', canais: 'as sessões por canal',
  origens: 'as sessões por origem e mídia', campanhas: 'as sessões por campanha', paginas: 'as páginas mais vistas',
  entradas: 'as páginas de entrada', cidades: 'as cidades', aparelhos: 'os aparelhos',
  novos_recorrentes: 'os usuários novos e recorrentes', cliques_saida: 'os cliques que saem do site',
  eventos_chave_dia: 'os eventos-chave por dia', ads: 'o custo do Google Ads por campanha',
});
const nomeRelatorio = (k) => RELATORIOS_GA4[k] ?? 'um dos relatórios';
// Os quadros do Search Console (o bloco que a coleta pediu).
export const BLOCOS_SC = Object.freeze({
  semana: 'o total de uma das semanas', 'tipo web': 'a busca na Web', 'tipo image': 'a busca de imagens',
  'tipo video': 'a busca de vídeos', 'tipo news': 'a aba Notícias da busca', 'tipo discover': 'o Discover',
  'tipo googleNews': 'o Google Notícias', consultas: 'as consultas', paginas: 'as páginas', paises: 'os países',
  aparelhos: 'os aparelhos', aparencias: 'as aparências na busca', consultas_semana: 'as consultas da última semana fechada',
  paginas_semana: 'as páginas da última semana fechada', marca: 'as buscas com o nome da marca',
  nao_marca: 'as buscas sem o nome da marca', sitemaps: 'os sitemaps',
});
const nomeBlocoSc = (k) => BLOCOS_SC[k] ?? 'um dos quadros';
// As métricas diárias do Perfil, para o aviso de métrica recusada.
const NOME_METRICA_PERFIL = Object.freeze({
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: 'as visualizações no Maps pelo computador',
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: 'as visualizações na Pesquisa pelo computador',
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: 'as visualizações no Maps pelo celular',
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: 'as visualizações na Pesquisa pelo celular',
  BUSINESS_DIRECTION_REQUESTS: 'os pedidos de rota', CALL_CLICKS: 'os cliques para ligar', WEBSITE_CLICKS: 'os cliques no site',
  BUSINESS_BOOKINGS: 'as reservas', BUSINESS_FOOD_MENU_CLICKS: 'os cliques no cardápio',
});
// Os cortes que o GA4 avisa (dataTruncationReasons, pela contraprova).
const CORTES_GA4 = Object.freeze({
  DATA_TRUNCATION_TYPE_PROPERTY: 'pela retenção de dados da propriedade',
  DATA_TRUNCATION_TYPE_GOOGLE_ADS: 'pela regra de 36 meses do Google Ads',
});
// O que o Google diz quando marca o perfil (complyWithGuidelines).
const PROBLEMAS_PERFIL = Object.freeze({ BUSINESS_LOCATION_SUSPENDED: 'como suspenso', BUSINESS_LOCATION_DISABLED: 'como desativado' });

const MOTIVO_SEM_TEMPO = 'O tempo da coleta acabou antes de terminar; o resto vem na próxima.';
// As APIs do Perfil da Empresa. A contraprova da pesquisa corrigiu o
// levantamento: as QUATRO v1 aparecem e podem ser ativadas no Google Cloud
// ANTES da aprovação (o que falta até lá é cota: 0 por minuto). Só a Google
// My Business API v4 fica invisível até aprovar. Por isso "desligada" na v1
// é passo do dono (ativar), e só na v4 é espera pelo Google.
export const SERVICO_PERFIL_V4 = 'mybusiness.googleapis.com';
export const APIS_PERFIL = Object.freeze({
  'mybusinessaccountmanagement.googleapis.com': 'My Business Account Management API',
  'mybusinessbusinessinformation.googleapis.com': 'My Business Business Information API',
  'mybusinessverifications.googleapis.com': 'My Business Verifications API',
  'businessprofileperformance.googleapis.com': 'Business Profile Performance API',
  'mybusiness.googleapis.com': 'Google My Business API',
});
const AGUARDANDO = 'O Google ainda não aprovou o acesso à API do Perfil da Empresa (cota 0 por minuto). GA4 e Search Console seguem funcionando.';
const SEM_PERMISSAO = {
  ga4: 'A conta conectada perdeu o acesso à propriedade do Google Analytics.',
  search_console: 'A conta conectada não tem permissão na propriedade do Search Console (ou a propriedade perdeu a verificação).',
  perfil: 'A conta conectada não tem permissão no Perfil da Empresa (ou o serviço está desligado no Google Workspace).',
};

/** O que um erro HTTP quer dizer para a PARTE. 401 é token morto (reconectar);
 *  403 tem quatro sentidos e só um deles é reconectar a caixinha certa.
 *  `servico`: o host que foi chamado, para quando o erro não diz qual API
 *  recusou (no Perfil, a v4 desligada é espera; a v1, passo do dono). */
export function classificarErro(parte, r, { primeira = false, servico = null } = {}) {
  const nome = NOME_PARTE[parte];
  if (r?.semTempo) return { estado: 'parcial', motivo: MOTIVO_SEM_TEMPO };
  if (r?.status === 401) return { estado: 'reconectar', motivo: 'O Google recusou o acesso. Reconecte a conta Google em Configurações.' };
  const g = erroGoogle(r?.dados);
  const texto = `${g.motivo ?? ''} ${g.mensagem}`;
  const escopo = g.motivo === 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' || /insufficient authentication scopes|insufficientPermissions/i.test(texto);
  const desligada = /SERVICE_DISABLED|accessNotConfigured/.test(g.motivo ?? '') || /has not been used|is disabled|not been enabled/i.test(g.mensagem);
  if (r?.status === 403 || g.status === 'PERMISSION_DENIED') {
    if (escopo) return { estado: 'falta_conectar', motivo: `A permissão do ${nome} ficou desmarcada ao conectar. Reconecte e deixe a caixinha marcada.` };
    if (parte === 'perfil' && g.cotaZero) return { estado: 'aguardando_aprovacao', motivo: AGUARDANDO };
    if (parte === 'perfil' && desligada) {
      const qual = g.servico ?? servico;
      if (qual === SERVICO_PERFIL_V4) return { estado: 'aguardando_aprovacao', motivo: AGUARDANDO };
      const api = APIS_PERFIL[qual];
      return { estado: 'falta_configurar', motivo: api
        ? `A ${api} não está ativada no projeto do Google Cloud. Ative em APIs e serviços (${qual}).`
        : `Uma API do ${nome} não está ativada no projeto do Google Cloud. Ative as APIs do Perfil da Empresa em APIs e serviços.` };
    }
    if (desligada) return { estado: 'falta_configurar', motivo: `A API do ${nome} não está ativada no projeto do Google Cloud.` };
    return { estado: 'erro', motivo: SEM_PERMISSAO[parte] };
  }
  if (r?.status === 429 || g.status === 'RESOURCE_EXHAUSTED') {
    // Antes da aprovação TODA chamada do Perfil volta 429 (cota 0): na primeira
    // chamada isso é a fila do Google, não um pico de uso nosso.
    if (parte === 'perfil' && (g.cotaZero || primeira)) return { estado: 'aguardando_aprovacao', motivo: AGUARDANDO };
    return { estado: 'parcial', motivo: `A cota do ${nome} acabou por agora; a próxima coleta continua.` };
  }
  // Códigos da coletora que não são resposta do Google (ErroFonte): a
  // "grande_demais" chega com HTTP 200, e "erro 200" não diria nada a ninguém.
  const DA_COLETORA = {
    grande_demais: `A resposta do ${nome} passou do tamanho máximo que a coleta aceita.`,
    resposta_invalida: `O ${nome} mandou uma resposta que não deu para ler.`,
    url_recusada: `A coleta recusou um endereço do ${nome} fora da lista permitida.`,
    metodo_recusado: `A coleta recusou um pedido ao ${nome} que não é só leitura.`,
  };
  if (r?.codigo && DA_COLETORA[r.codigo]) return { estado: 'erro', motivo: DA_COLETORA[r.codigo] };
  if (!r?.status) {
    return { estado: 'erro', motivo: r?.codigo === 'tempo' ? `O ${nome} não respondeu a tempo.` : `Não deu para falar com o ${nome} agora (rede). A próxima coleta tenta de novo.` };
  }
  return { estado: 'erro', motivo: `O ${nome} respondeu com erro ${r.status}.` };
}

/** Falha ao renovar o access token. invalid_grant é o refresh token morto
 *  (revogado, 6 meses parado, app em Teste): reconectar, e parar ali. */
export function falhaDaRenovacao(e) {
  const textos = [e?.codigo, e?.code, e?.motivo, e?.erro, e?.error, e?.dados?.error, e?.corpo?.error, e?.message]
    .filter((x) => typeof x === 'string').join(' ').toLowerCase();
  const status = Number(e?.status ?? e?.statusCode ?? 0) || 0;
  const RECONECTAR = { estado: 'reconectar', motivo: 'A conexão com o Google venceu ou foi revogada. Reconecte a conta Google em Configurações.' };
  const TRANSITORIO = { estado: 'erro', motivo: 'O Google não renovou o acesso agora. A próxima coleta tenta de novo.' };
  // Os códigos do ErroOAuth (mkt-oauth.mjs) primeiro; o resto é para erro de outro formato.
  if (/reconectar|invalid_grant|invalid_token/.test(textos)) return RECONECTAR;
  // Mesmo estado que a coletora dá a esse caso: a credencial existe, mas o Google a recusa.
  if (/credencial_recusada|invalid_client|unauthorized_client/.test(textos)) {
    return { estado: 'erro', motivo: 'O Google recusou o ID ou a chave secreta do app. Confira os Secrets do Supabase.' };
  }
  if (/falta_configurar/.test(textos)) return { estado: 'falta_configurar', motivo: 'Faltam o ID e a chave secreta do app do Google nos Secrets do Supabase.' };
  if (/falta_conectar|sem_refresh/.test(textos)) return { estado: 'falta_conectar', motivo: 'Falta conectar a conta Google em Configurações.' };
  if (/troca_falhou/.test(textos) || e?.transitorio) return TRANSITORIO;
  if (/revog|expired/.test(textos) || status === 400 || status === 401) return RECONECTAR;
  return TRANSITORIO;
}

/** O estado da fonte a partir das partes. Tudo ok é ok; alguma parte com
 *  dado e outra sem é parcial; nenhuma com dado: o estado que mais pede ação. */
export function estadoGeral(partes) {
  const est = PARTES.map((p) => partes[p]?.estado ?? 'erro');
  if (est.every((e) => e === 'ok')) return 'ok';
  if (est.some((e) => e === 'ok' || e === 'parcial')) return 'parcial';
  for (const e of ['reconectar', 'falta_conectar', 'falta_configurar', 'erro', 'aguardando_aprovacao']) if (est.includes(e)) return e;
  return 'erro';
}

// ------------------------------------------------------- o chamador --

/** Toda chamada ao Google passa aqui: o token no cabeçalho (nunca na URL), a
 *  conta do prazo e a trava de token morto. Depois do primeiro 401 nenhuma
 *  parte chama mais nada: o GA4 conta erro de autenticação na cota de erros, e
 *  token morto não volta a viver insistindo. */
function criarChamador(ctx, token) {
  const st = { tokenMorto: false, chamadas: 0 };
  const ler = () => (typeof ctx.prazo === 'function' ? Number(ctx.prazo()) : Infinity);
  // O contrato não diz a unidade do prazo. O orçamento é de 110 s: lido logo
  // no começo, um valor de até 600 só pode ser segundos (em milissegundos
  // seria menos de 1 s para a coleta inteira).
  const primeira = ler();
  const escala = Number.isFinite(primeira) && primeira > 0 && primeira <= 600 ? 1000 : 1;
  const restaMs = () => {
    const v = ler() * escala;
    return Number.isNaN(v) ? Infinity : v;
  };
  async function chamar(url, { method = 'GET', body, rotulo, margem = MARGEM_MS } = {}) {
    if (st.tokenMorto) return { ok: false, status: 401, dados: null, pulada: true };
    if (restaMs() < margem) return { ok: false, status: 0, dados: null, semTempo: true };
    st.chamadas++;
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let r;
    try { r = normalizarResposta(await ctx.fetchJson(url, { method, headers, body, rotulo })); }
    catch (e) { r = respostaDoErro(e); }
    // "tempo" da coletora com o orçamento no fim é o orçamento acabando, não
    // um Google lento: a parte fica parcial, não com erro.
    if (r.codigo === 'tempo' && restaMs() < MARGEM_MS) r.semTempo = true;
    if (r.status === 401) st.tokenMorto = true;
    return r;
  }
  return { chamar, st, restaMs };
}

/** Lista paginada do Google (nextPageToken), com teto de páginas. */
async function paginar(chamar, montarUrl, campo, { maxPaginas, rotulo }) {
  const itens = [];
  let token = null, primeira = null;
  for (let pag = 0; pag < maxPaginas; pag++) {
    const r = await chamar(montarUrl(token), { rotulo });
    if (!r.ok) return { itens, primeira, falha: r, cortado: false };
    if (!primeira) primeira = r.dados ?? {};
    itens.push(...lista(r.dados?.[campo]));
    token = textoOuNull(r.dados?.nextPageToken);
    if (!token) return { itens, primeira, falha: null, cortado: false };
  }
  return { itens, primeira, falha: null, cortado: true };
}
const comPagina = (url, token) => (token ? `${url}${url.includes('?') ? '&' : '?'}pageToken=${encodeURIComponent(token)}` : url);

// ================================================================= GA4 ==

const CAMPO_METRICA = {
  activeUsers: 'usuarios', newUsers: 'novos', totalUsers: 'usuarios_totais', sessions: 'sessoes',
  engagedSessions: 'sessoes_engajadas', engagementRate: 'taxa_engajamento', averageSessionDuration: 'duracao_media_s',
  bounceRate: 'taxa_rejeicao', screenPageViews: 'visualizacoes', eventCount: 'eventos', keyEvents: 'eventos_chave',
  userEngagementDuration: 'tempo_engajamento_s', advertiserAdCost: 'custo', advertiserAdClicks: 'cliques',
  advertiserAdImpressions: 'impressoes', advertiserAdCostPerClick: 'cpc', returnOnAdSpend: 'roas',
};
const CAMPO_DIMENSAO = {
  date: 'data', isoYearIsoWeek: 'semana', sessionDefaultChannelGroup: 'canal', sessionSourceMedium: 'origem_midia',
  sessionCampaignName: 'campanha', sessionGoogleAdsCampaignName: 'campanha', pagePath: 'caminho', pagePathPlusQueryString: 'caminho',
  pageTitle: 'titulo', hostName: 'host', landingPage: 'pagina', landingPagePlusQueryString: 'pagina', city: 'cidade', region: 'estado', country: 'pais', deviceCategory: 'aparelho',
  eventName: 'evento', linkDomain: 'dominio', linkUrl: 'link', newVsReturning: 'tipo',
};
const M_SEMANA = ['activeUsers', 'newUsers', 'totalUsers', 'sessions', 'engagedSessions', 'engagementRate', 'screenPageViews', 'eventCount', 'keyEvents', 'userEngagementDuration'];
const M_DIA = ['activeUsers', 'newUsers', 'sessions', 'engagedSessions', 'engagementRate', 'averageSessionDuration', 'bounceRate', 'screenPageViews', 'eventCount', 'keyEvents'];
const M_TRAFEGO = ['sessions', 'engagedSessions', 'activeUsers', 'newUsers', 'keyEvents'];
const CONTAGENS_DIA = ['usuarios', 'novos', 'sessoes', 'sessoes_engajadas', 'visualizacoes', 'eventos'];
const TAXAS_DIA = ['taxa_engajamento', 'duracao_media_s', 'taxa_rejeicao'];

/** "202634" (ano ISO + semana ISO) -> segunda-feira. A semana ISO começa na
 *  segunda, a mesma da casa; week/yearWeek do GA4 começam no domingo. */
export function isoSemanaParaSegunda(valor) {
  const m = /^(\d{4})(\d{2})$/.exec(String(valor ?? ''));
  if (!m) return null;
  const ano = Number(m[1]), sem = Number(m[2]);
  if (sem < 1 || sem > 53) return null;
  const segunda = somarDias(segundaDaSemana(`${ano}-01-04`), (sem - 1) * 7);
  // A quinta-feira decide o ano ISO: semana 53 num ano que não tem 53 cai fora.
  return somarDias(segunda, 3).slice(0, 4) === String(ano) ? segunda : null;
}

function valorDimensao(nome, v) {
  if (nome === 'date') return /^\d{8}$/.test(v ?? '') ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : null;
  if (nome === 'isoYearIsoWeek') return isoSemanaParaSegunda(v);
  return v ?? null;
}
function valorMetrica(tipo, v) {
  const n = numeroApi(v);
  if (n == null) return null;
  if (tipo === 'TYPE_INTEGER') return Math.round(n);
  if (tipo === 'TYPE_SECONDS' || tipo === 'TYPE_MILLISECONDS') return arred(n, 1);
  if (tipo === 'TYPE_CURRENCY') return arred(n, 2);
  return arred(n, 4);
}

export function qualidadeGa4(metadata) {
  const m = objeto(metadata) ? metadata : {};
  return {
    linha_other: m.dataLossFromOtherRow === true,
    limiar_privacidade: m.subjectToThresholding === true,
    amostragem: lista(m.samplingMetadatas).length > 0,
    // dataTruncationReasons entrou em 14/09/2026 (contraprova): cada relatório
    // pode vir cortado antes de uma data (retenção, 36 meses do Google Ads).
    cortes: lista(m.dataTruncationReasons).map((c) => (typeof c === 'string'
      ? { tipo: c, desde: null }
      : { tipo: c?.type ?? c?.dataTruncationType ?? c?.reason ?? null,
          desde: typeof c?.dataTruncationDate === 'string' ? c.dataTruncationDate : dataGoogle(c?.dataTruncationDate) })),
  };
}

export function lerCotaGa4(q) {
  if (!objeto(q)) return null;
  const resta = (k) => numeroApi(q[k]?.remaining);
  return {
    dia_restante: resta('tokensPerDay'), hora_restante: resta('tokensPerHour'),
    projeto_hora_restante: resta('tokensPerProjectPerHour'), erros_servidor_restantes: resta('serverErrorsPerProjectPerHour'),
  };
}

/** Uma resposta do runReport -> linhas com nomes nossos e números de verdade.
 *  O GA4 manda todo valor como texto, e a taxa como fração (0,72 = 72%). */
export function lerRelatorioGa4(resp) {
  const dims = lista(resp?.dimensionHeaders).map((h) => h?.name);
  const mets = lista(resp?.metricHeaders).map((h) => ({ nome: h?.name, tipo: h?.type }));
  const linhas = lista(resp?.rows).map((row) => {
    const l = {};
    dims.forEach((nome, i) => { l[CAMPO_DIMENSAO[nome] ?? nome] = valorDimensao(nome, row?.dimensionValues?.[i]?.value); });
    mets.forEach((m, i) => { l[CAMPO_METRICA[m.nome] ?? m.nome] = valorMetrica(m.tipo, row?.metricValues?.[i]?.value); });
    return l;
  });
  const total = inteiroApi(resp?.rowCount) ?? linhas.length;
  return { linhas, total, cortado: total > linhas.length, qualidade: qualidadeGa4(resp?.metadata), cota: lerCotaGa4(resp?.propertyQuota), fuso: resp?.metadata?.timeZone ?? null };
}

function pedidoGa4({ dims, mets, de, ate, limite, ordem, filtro }) {
  const p = {
    dateRanges: [{ startDate: de, endDate: ate }],
    dimensions: dims.map((name) => ({ name })),
    metrics: mets.map((name) => ({ name })),
    limit: limite,
    returnPropertyQuota: true,
  };
  if (ordem) p.orderBys = [{ metric: { metricName: ordem }, desc: true }];
  if (filtro) p.dimensionFilter = { filter: { fieldName: filtro[0], stringFilter: { matchType: 'EXACT', value: filtro[1] } } };
  return p;
}

/** Confere os tetos da documentação ANTES de mandar: pedido acima do teto é
 *  erro 400 que gasta cota de erro e derruba o lote inteiro. */
export function conferirPedidoGa4(p) {
  if (lista(p.metrics).length > LIMITES.GA4_METRICAS) throw new Error('GA4: mais de 10 métricas num pedido.');
  if (lista(p.dimensions).length > LIMITES.GA4_DIMENSOES) throw new Error('GA4: mais de 9 dimensões num pedido.');
  if (lista(p.dateRanges).length > LIMITES.GA4_INTERVALOS) throw new Error('GA4: mais de 4 intervalos num pedido.');
  return p;
}

/** Os relatórios de toda coleta. As semanas têm pedido próprio porque usuário
 *  não se soma entre dias. Os quebrados por semana pegam também a semana
 *  aberta (até ontem); os "top" (páginas, entradas, cidades) olham o período. */
export function relatoriosGa4(j, { comAds = false, comEventosChave = true } = {}) {
  const ate = j.ontem;
  const r = (chave, cfg, extra = {}) => ({ chave, pedido: conferirPedidoGa4(pedidoGa4({ de: j.inicio, ate, ...cfg })), ...extra });
  const lst = [
    r('semanas', { dims: ['isoYearIsoWeek'], mets: M_SEMANA, ate: j.ultimoDomingo, limite: 60 }, { essencial: true }),
    r('dias', { dims: ['date'], mets: M_DIA, limite: 400 }, { essencial: true }),
    r('canais', { dims: ['isoYearIsoWeek', 'sessionDefaultChannelGroup'], mets: M_TRAFEGO, limite: 1000, ordem: 'sessions' }, { paginar: true }),
    r('origens', { dims: ['isoYearIsoWeek', 'sessionSourceMedium'], mets: M_TRAFEGO, limite: 1000, ordem: 'sessions' }, { paginar: true }),
    r('campanhas', { dims: ['isoYearIsoWeek', 'sessionCampaignName', 'sessionSourceMedium'], mets: M_TRAFEGO, limite: 1000, ordem: 'sessions' }, { paginar: true }),
    // Com a consulta (?page_id=144): o site da casa ainda vive em ?page_id=NNN
    // (as URLs bonitas estão em laço de 301), e só pagePath juntaria tudo em "/".
    r('paginas', { dims: ['pagePathPlusQueryString', 'pageTitle', 'hostName'], mets: ['screenPageViews', 'activeUsers', 'userEngagementDuration', 'eventCount', 'keyEvents'], limite: 200, ordem: 'screenPageViews' }),
    r('entradas', { dims: ['landingPagePlusQueryString'], mets: ['sessions', 'engagedSessions', 'activeUsers', 'keyEvents', 'bounceRate'], limite: 200, ordem: 'sessions' }),
    r('cidades', { dims: ['city', 'region', 'country'], mets: ['activeUsers', 'sessions', 'keyEvents'], limite: 200, ordem: 'activeUsers' }),
    r('aparelhos', { dims: ['isoYearIsoWeek', 'deviceCategory'], mets: ['activeUsers', 'sessions', 'engagedSessions', 'keyEvents'], limite: 200 }, { paginar: true }),
    r('novos_recorrentes', { dims: ['isoYearIsoWeek', 'newVsReturning'], mets: ['activeUsers', 'sessions', 'engagedSessions', 'keyEvents'], limite: 200 }, { paginar: true }),
    // Clique em link que sai do site (medição otimizada): WhatsApp, redes, outros sites.
    r('cliques_saida', { dims: ['date', 'linkDomain', 'linkUrl'], mets: ['eventCount'], limite: 5000, filtro: ['eventName', 'click'] }, { paginar: true }),
  ];
  if (comEventosChave) {
    lst.push(r('eventos_chave_dia', { dims: ['date', 'eventName'], mets: ['keyEvents', 'eventCount'], limite: 5000, filtro: ['isKeyEvent', 'true'] }, { paginar: true }));
  }
  if (comAds) {
    // Sozinho: advertiserAd* pode ser recusado (vínculo, compatibilidade) e,
    // num lote, um pedido recusado derruba os outros quatro.
    lst.push(r('ads', { dims: ['isoYearIsoWeek', 'sessionGoogleAdsCampaignName'], mets: ['advertiserAdCost', 'advertiserAdClicks', 'advertiserAdImpressions', 'advertiserAdCostPerClick', 'returnOnAdSpend', 'sessions', 'keyEvents'], limite: 1000, ordem: 'advertiserAdCost' }, { sozinho: true }));
  }
  return lst;
}

function gruposDeRelatorios(lst) {
  const grupos = [];
  let atual = [];
  for (const r of lst) {
    if (r.sozinho) { grupos.push([r]); continue; }
    atual.push(r);
    if (atual.length === LIMITES.GA4_LOTE) { grupos.push(atual); atual = []; }
  }
  if (atual.length) grupos.push(atual);
  return grupos.sort((a, b) => Number(!!a[0].sozinho) - Number(!!b[0].sozinho));
}

export function lerContasGa4(resp) {
  const fora = [];
  for (const c of lista(resp?.accountSummaries)) {
    for (const p of lista(c?.propertySummaries)) {
      if (!textoOuNull(p?.property)) continue;
      fora.push({ conta: c.account ?? null, conta_nome: c.displayName ?? null, propriedade: p.property, nome: p.displayName ?? null, tipo: p.propertyType ?? null });
    }
  }
  return fora;
}
export const lerFluxosGa4 = (resp) => lista(resp?.dataStreams).map((f) => ({
  nome: f?.displayName ?? null, tipo: f?.type ?? null,
  medicao: f?.webStreamData?.measurementId ?? null, site: f?.webStreamData?.defaultUri ?? null,
}));

const hostDe = (url) => { try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return null; } };

/** O fluxo certo: pelo ID de medição; se nenhum bater, pelo endereço do site
 *  (com aviso, porque aí é palpite bem fundado e não prova). */
export function acharFluxo(fluxos, medicoes, host) {
  const ids = medicoes.map((m) => String(m).toUpperCase());
  const porId = fluxos.find((f) => f.medicao && ids.includes(String(f.medicao).toUpperCase()));
  if (porId) return { fluxo: porId, por: 'medicao' };
  const porSite = host ? fluxos.find((f) => f.site && hostDe(f.site) === host) : null;
  return porSite ? { fluxo: porSite, por: 'site' } : null;
}

export function lerPropriedadeGa4(resp) {
  if (!objeto(resp)) return null;
  return {
    nome: resp.displayName ?? null, fuso: resp.timeZone ?? null, moeda: resp.currencyCode ?? null,
    nivel: resp.serviceLevel ?? null, criada_em: diaDeIso(resp.createTime), setor: resp.industryCategory ?? null,
  };
}
export const lerEventosChave = (resp) => lista(resp?.keyEvents).map((k) => ({
  evento: k?.eventName ?? null, contagem: k?.countingMethod ?? null, desde: diaDeIso(k?.createTime),
  personalizado: k?.custom ?? null, apagavel: k?.deletable ?? null,
}));
// O "purchase" que o GA4 cria sozinho não se apaga e não é personalizado: ele
// não prova que alguém configurou lead, e contar com ele daria "0 leads" onde
// a verdade é "lead não configurado".
export const eventoChaveConfigurado = (k) => !(k.personalizado === false && k.apagavel === false);

export function diasGa4(rel, inicio, fim, { criadaEm = null, desdeEventosChave } = {}) {
  const porData = new Map(lista(rel?.linhas).filter((l) => l.data).map((l) => [l.data, l]));
  const semanaComRegistro = new Set([...porData.keys()].map(segundaDaSemana));
  const chaveDoDia = (d, v) => {
    if (desdeEventosChave === undefined) return v;           // não sabemos a configuração: o número como veio
    if (!desdeEventosChave || d < desdeEventosChave) return null;
    return v;
  };
  const fora = [];
  for (const d of diasEntre(inicio, fim)) {
    const l = porData.get(d);
    const dia = { data: d, registrou: !!l };
    if (l) {
      for (const k of [...CONTAGENS_DIA, ...TAXAS_DIA]) dia[k] = l[k] ?? null;
      dia.eventos_chave = chaveDoDia(d, l.eventos_chave ?? null);
    } else {
      const zera = semanaComRegistro.has(segundaDaSemana(d)) && !(criadaEm && d < criadaEm);
      for (const k of CONTAGENS_DIA) dia[k] = zera ? 0 : null;
      for (const k of TAXAS_DIA) dia[k] = null;
      dia.eventos_chave = zera ? chaveDoDia(d, 0) : null;
    }
    fora.push(dia);
  }
  return fora;
}

const DOMINIO_WHATSAPP = /(^|\.)(wa\.me|whatsapp\.com)$/i;
export const ehWhatsapp = (l) => DOMINIO_WHATSAPP.test(String(l?.dominio ?? '')) || /^https?:\/\/(api\.|web\.)?(wa\.me|whatsapp\.com)\//i.test(String(l?.link ?? ''));

async function rodarRelatoriosGa4(chamar, prop, lst) {
  const resultado = {}, recusados = [], cortados = [];
  let parada = null, cota = null;
  const runReport = (pedido, rotulo) => chamar(`${DATA}/${prop}:runReport`, { method: 'POST', body: pedido, rotulo });
  const cotaBaixa = (c) => c && ((c.projeto_hora_restante != null && c.projeto_hora_restante < COTA_MINIMA_HORA)
    || (c.dia_restante != null && c.dia_restante < COTA_MINIMA_DIA)
    || (c.erros_servidor_restantes != null && c.erros_servidor_restantes <= COTA_MINIMA_ERROS_SERVIDOR));
  for (const grupo of gruposDeRelatorios(lst)) {
    if (parada) break;
    let respostas = null;
    if (grupo.length > 1) {
      const r = await chamar(`${DATA}/${prop}:batchRunReports`, { method: 'POST', body: { requests: grupo.map((g) => g.pedido) }, rotulo: 'ga4 lote' });
      if (r.ok) respostas = lista(r.dados?.reports);
      else if (r.status !== 400 && r.codigo !== 'grande_demais') { parada = r; break; }
      // 400 num lote: um pedido recusado derruba os cinco; refaz um por um
      // para só o recusado ficar de fora. Lote grande demais para o teto da
      // coletora: um por um também cabe.
    }
    if (!respostas) {
      respostas = [];
      for (const g of grupo) {
        const r = await runReport(g.pedido, `ga4 ${g.chave}`);
        if (r.ok) { respostas.push(r.dados); continue; }
        respostas.push(null);
        if (r.status === 400) { recusados.push({ chave: g.chave, motivo: mensagemGoogle(r.dados) }); continue; }
        if (r.codigo === 'grande_demais') { recusados.push({ chave: g.chave, grande: true, motivo: 'resposta grande demais' }); continue; }
        parada = r; break;
      }
    }
    grupo.forEach((g, i) => {
      if (!respostas[i]) return;
      const rel = lerRelatorioGa4(respostas[i]);
      resultado[g.chave] = rel;
      if (rel.cota) cota = rel.cota;
    });
    if (cotaBaixa(cota)) { parada = { cotaBaixa: true }; break; }
  }
  // Séries que passaram do teto de linhas: mais páginas pelo offset, com teto.
  for (const g of lst) {
    const rel = resultado[g.chave];
    // As listas "top" (páginas, entradas, cidades) são cortadas de propósito
    // nas 200 primeiras: avisar toda coleta seria ruído. Só série avisa.
    if (!rel?.cortado || !g.paginar) continue;
    if (parada) { cortados.push(g.chave); continue; }
    for (let pag = 0; pag < LIMITES.GA4_PAGINAS_EXTRA && rel.total > rel.linhas.length; pag++) {
      const r = await runReport({ ...g.pedido, offset: rel.linhas.length }, `ga4 ${g.chave} offset`);
      if (!r.ok) { if (r.status !== 400) parada = r; break; }
      const mais = lerRelatorioGa4(r.dados);
      if (!mais.linhas.length) break;
      rel.linhas.push(...mais.linhas);
      if (mais.cota) cota = mais.cota;
      if (cotaBaixa(cota)) { parada = { cotaBaixa: true }; break; }
    }
    if (rel.total > rel.linhas.length) cortados.push(g.chave);
    if (parada) break;
  }
  return { resultado, recusados, cortados, parada, cota };
}

async function acharPropriedadeGa4(chamar, medicoes, host, anterior) {
  // A propriedade da coleta anterior primeiro: um pedido em vez de varrer tudo.
  const jaConhecida = textoOuNull(anterior?.ga4?.propriedade?.id);
  const olhar = async (prop) => {
    const r = await paginar(chamar, (t) => comPagina(`${ADMIN}/${prop}/dataStreams?pageSize=200`, t), 'dataStreams', { maxPaginas: LIMITES.ADMIN_PAGINAS, rotulo: 'ga4 fluxos' });
    return { achado: r.falha ? null : acharFluxo(lerFluxosGa4({ dataStreams: r.itens }), medicoes, host), falha: r.falha };
  };
  if (jaConhecida) {
    const { achado, falha } = await olhar(jaConhecida);
    if (falha?.status === 401) return { falha };
    if (achado?.por === 'medicao') {
      return { prop: { propriedade: jaConhecida, nome: anterior.ga4.propriedade.nome ?? null, conta_nome: anterior.ga4.propriedade.conta ?? null }, ...achado };
    }
  }
  const contas = await paginar(chamar, (t) => comPagina(`${ADMIN}/accountSummaries?pageSize=200`, t), 'accountSummaries', { maxPaginas: LIMITES.ADMIN_PAGINAS, rotulo: 'ga4 contas' });
  if (contas.falha) return { falha: contas.falha };
  const props = lerContasGa4({ accountSummaries: contas.itens });
  if (!props.length) return { nenhuma: true };
  let candidato = null;
  for (const p of props.slice(0, LIMITES.PROPRIEDADES)) {
    const { achado, falha } = await olhar(p.propriedade);
    // Só 403/404 (propriedade sem acesso) pula para a próxima. Cota, tempo ou
    // servidor param a busca: senão o fim seria "nenhuma propriedade", e o
    // Léo iria procurar um problema de configuração que não existe.
    if (falha && ![403, 404].includes(falha.status)) return { falha };
    if (achado?.por === 'medicao') return { prop: p, ...achado };
    if (achado && !candidato) candidato = { prop: p, ...achado };
  }
  return candidato ?? { nenhuma: true, vistas: props.length };
}

async function coletarGa4(ctx, chamar, j, { medicoes, host, anterior }) {
  const avisos = [];
  const achou = await acharPropriedadeGa4(chamar, medicoes, host, anterior);
  if (achou.falha) return { ...classificarErro('ga4', achou.falha), dados: null, avisos };
  if (achou.nenhuma) {
    return {
      estado: 'falta_configurar', dados: null, avisos,
      motivo: `A conta Google conectada não enxerga nenhuma propriedade do Google Analytics com o ID ${medicoes.join(' ou ')}. Dê acesso de Leitor a ela na propriedade.`,
    };
  }
  const prop = achou.prop.propriedade;
  if (achou.por === 'site') avisos.push(`GA4: nenhum fluxo com o ID ${medicoes.join(' ou ')}; usei o fluxo do mesmo endereço do site (${limparTexto(achou.fluxo.medicao, 40) ?? 'sem ID de medição'}).`);

  // Cadastro, eventos-chave e vínculo com o Google Ads: falha aqui vira aviso,
  // não derruba os relatórios.
  const parar = (r) => r.status === 401 || r.semTempo;
  const rProp = await chamar(`${ADMIN}/${prop}`, { rotulo: 'ga4 propriedade' });
  if (parar(rProp)) return { ...classificarErro('ga4', rProp), dados: null, avisos };
  const cadastro = rProp.ok ? lerPropriedadeGa4(rProp.dados) : null;
  if (!rProp.ok) avisos.push('GA4: não deu para ler o cadastro da propriedade (fuso e moeda).');
  if (cadastro?.fuso && cadastro.fuso !== 'America/Sao_Paulo') avisos.push(`GA4: o fuso da propriedade é ${limparTexto(cadastro.fuso, 40)}; os dias e as semanas seguem esse fuso.`);

  const rChave = await paginar(chamar, (t) => comPagina(`${ADMIN}/${prop}/keyEvents?pageSize=200`, t), 'keyEvents', { maxPaginas: LIMITES.ADMIN_PAGINAS, rotulo: 'ga4 eventos-chave' });
  if (rChave.falha && parar(rChave.falha)) return { ...classificarErro('ga4', rChave.falha), dados: null, avisos };
  const eventosChave = rChave.falha ? null : lerEventosChave({ keyEvents: rChave.itens });
  const configurados = eventosChave ? eventosChave.filter(eventoChaveConfigurado) : null;
  // undefined = não sabemos; null = nenhum configurado; data = desde quando conta.
  const desdeEventosChave = configurados == null ? undefined
    : configurados.length ? configurados.map((k) => k.desde).filter(Boolean).sort()[0] ?? null : null;
  if (rChave.falha) avisos.push('GA4: não deu para ler os eventos-chave; leads ficam sem número nesta coleta.');
  else if (!configurados.length) avisos.push('GA4: nenhum evento-chave configurado; leads ficam "não configurado", não zero.');

  const rAds = await paginar(chamar, (t) => comPagina(`${ADMIN}/${prop}/googleAdsLinks?pageSize=200`, t), 'googleAdsLinks', { maxPaginas: LIMITES.ADMIN_PAGINAS, rotulo: 'ga4 vinculo ads' });
  if (rAds.falha && parar(rAds.falha)) return { ...classificarErro('ga4', rAds.falha), dados: null, avisos };
  const vinculoAds = rAds.falha ? null : rAds.itens.length > 0;

  const lst = relatoriosGa4(j, { comAds: vinculoAds === true, comEventosChave: configurados == null || configurados.length > 0 });
  const { resultado, recusados, cortados, parada, cota } = await rodarRelatoriosGa4(chamar, prop, lst);
  for (const r of recusados) {
    avisos.push(r.grande
      ? `GA4: ${nomeRelatorio(r.chave)} veio grande demais para a coleta e ficou sem dado desta vez.`
      : `GA4: o Google recusou ${nomeRelatorio(r.chave)} (um campo ou uma combinação que ele não aceita); esse quadro fica sem dado.`);
    anotar(ctx, `google ga4: relatório ${r.chave} recusado${r.motivo ? ` (${r.motivo})` : ''}`);
  }
  for (const c of cortados) avisos.push(`GA4: ${nomeRelatorio(c)} passou do teto de linhas e veio cortado.`);

  let estado = 'ok', motivo;
  if (parada) {
    if (parada.cotaBaixa) { estado = 'parcial'; motivo = 'A cota de tokens do GA4 ficou baixa; parei para não bloquear o projeto. A próxima coleta continua.'; }
    else {
      const c = classificarErro('ga4', parada);
      if (['reconectar', 'falta_conectar', 'falta_configurar'].includes(c.estado) || !Object.keys(resultado).length) {
        return { ...c, estado: c.estado === 'parcial' && !Object.keys(resultado).length ? 'erro' : c.estado, dados: null, avisos };
      }
      estado = 'parcial'; motivo = c.motivo;
    }
  }
  if (lst.some((g) => g.essencial && !resultado[g.chave])) {
    estado = 'parcial';
    motivo = motivo ?? 'O GA4 não devolveu o resumo da semana ou dos dias nesta coleta.';
  }

  // Qualidade: a pior de todas as respostas (basta uma ter a linha "(other)").
  const qualidade = { linha_other: false, limiar_privacidade: false, amostragem: false, cortes: [] };
  for (const rel of Object.values(resultado)) {
    qualidade.linha_other ||= rel.qualidade.linha_other;
    qualidade.limiar_privacidade ||= rel.qualidade.limiar_privacidade;
    qualidade.amostragem ||= rel.qualidade.amostragem;
    for (const c of rel.qualidade.cortes) if (!qualidade.cortes.some((x) => x.tipo === c.tipo && x.desde === c.desde)) qualidade.cortes.push(c);
  }
  if (qualidade.linha_other) avisos.push('GA4: parte das linhas foi agrupada em "(other)" pelo Google.');
  if (qualidade.limiar_privacidade) avisos.push('GA4: alguns números foram escondidos pelo limite de privacidade do Google.');
  for (const c of qualidade.cortes) {
    const desde = dataBr(c.desde);
    avisos.push(`GA4: o Google cortou dados ${CORTES_GA4[c.tipo] ?? 'por uma regra de guarda dele'}${desde ? `, antes de ${desde}` : ''}.`);
    if (!CORTES_GA4[c.tipo]) anotar(ctx, `google ga4: corte de dados ${c.tipo ?? 'sem tipo'}`);
  }

  // Semana que começou antes do primeiro evento-chave configurado: o número
  // de eventos-chave dela é "não medido", não zero (só conta dali em diante).
  const semChave = (l) => (l.semana && 'eventos_chave' in l && desdeEventosChave !== undefined
    && (!desdeEventosChave || l.semana < desdeEventosChave) ? { ...l, eventos_chave: null } : l);
  const linhas = (k) => (resultado[k] ? resultado[k].linhas.map(semChave) : null);
  const cliques = linhas('cliques_saida');
  const cliquesSaida = cliques && cliques.length ? cliques.map((l) => ({ data: l.data, dominio: l.dominio, link: l.link, cliques: l.eventos })) : null;
  const paginas = linhas('paginas')?.map((l) => ({ ...l, link: l.host && l.caminho ? `https://${l.host}${l.caminho}` : null })) ?? null;

  const dados = {
    propriedade: {
      id: prop, nome: cadastro?.nome ?? achou.prop.nome ?? null, conta: achou.prop.conta_nome ?? null,
      fuso: cadastro?.fuso ?? null, moeda: cadastro?.moeda ?? null, nivel: cadastro?.nivel ?? null, criada_em: cadastro?.criada_em ?? null,
      medicao: achou.fluxo.medicao, fluxo: { nome: achou.fluxo.nome, site: achou.fluxo.site }, achada_por: achou.por,
    },
    eventos_chave: eventosChave,
    eventos_chave_desde: desdeEventosChave ?? null,
    vinculo_ads: vinculoAds,
    semanas: linhas('semanas')?.filter((l) => l.semana) ?? null,
    dias: resultado.dias ? diasGa4(resultado.dias, j.inicio, j.ontem, { criadaEm: cadastro?.criada_em ?? null, desdeEventosChave }) : null,
    canais: linhas('canais'), origens: linhas('origens'), campanhas: linhas('campanhas'),
    novos_recorrentes: linhas('novos_recorrentes'), aparelhos: linhas('aparelhos'),
    paginas, entradas: linhas('entradas'), cidades: linhas('cidades'),
    eventos_chave_dia: linhas('eventos_chave_dia'),
    cliques_saida: cliquesSaida,
    whatsapp_medido: !!cliquesSaida?.some(ehWhatsapp),
    ads: linhas('ads'),
    recusados: recusados.map((r) => r.chave), cortados,
    qualidade, cota,
  };
  // O que serve para os números da semana e não é para a tela.
  const interno = { desdeEventosChave };
  return { estado, motivo, dados, avisos, interno };
}

// ====================================================== SEARCH CONSOLE ==

const CAMPO_SC = { date: 'data', query: 'consulta', page: 'pagina', country: 'pais', device: 'aparelho', searchAppearance: 'aparencia', hour: 'hora' };
const TIPOS_SC = ['web', 'image', 'video', 'news', 'discover', 'googleNews'];

/** A propriedade do Search Console: a de Domínio primeiro (enxerga http e
 *  https, com e sem www); depois as de prefixo. Usuário não verificado não
 *  lê nada e fica de fora. */
export function escolherPropriedadeSc(siteEntry, host) {
  const validas = lista(siteEntry).filter((s) => s?.siteUrl && s.permissionLevel !== 'siteUnverifiedUser');
  const ordem = [`sc-domain:${host}`, `https://${host}/`, `https://www.${host}/`, `http://${host}/`, `http://www.${host}/`];
  for (const alvo of ordem) {
    const s = validas.find((x) => String(x.siteUrl).toLowerCase() === alvo);
    if (s) return { site: s.siteUrl, permissao: s.permissionLevel ?? null };
  }
  return null;
}

export function lerSearchAnalytics(resp, dims = []) {
  const linhas = lista(resp?.rows).map((row) => {
    const l = {};
    dims.forEach((d, i) => {
      const v = row?.keys?.[i] ?? null;
      // A caixa do país na resposta não é documentada (contraprova): sai em maiúscula.
      l[CAMPO_SC[d] ?? d] = d === 'country' && v ? String(v).toUpperCase() : v;
    });
    l.cliques = numeroApi(row?.clicks);
    l.impressoes = numeroApi(row?.impressions);
    l.ctr = arred(numeroApi(row?.ctr), 4);
    l.posicao = arred(numeroApi(row?.position), 2);
    return l;
  });
  const meta = objeto(resp?.metadata) ? resp.metadata : {};
  return {
    linhas,
    agregacao: resp?.responseAggregationType ?? null,
    primeiro_dia_incompleto: meta.first_incomplete_date ?? meta.firstIncompleteDate ?? null,
    primeira_hora_incompleta: meta.first_incomplete_hour ?? meta.firstIncompleteHour ?? null,
  };
}

/** Regra da contraprova: a semana está fechada se o primeiro dia incompleto
 *  (consulta por date, dataState all, até hoje) é depois do domingo, ou se o
 *  metadata nem veio. */
export const semanaScFechada = (domingo, primeiroIncompleto) => !primeiroIncompleto || primeiroIncompleto > domingo;

export function diasSc(rel, inicio, fim, primeiroIncompleto) {
  const porData = new Map(lista(rel?.linhas).filter((l) => l.data).map((l) => [l.data, l]));
  const temDado = porData.size > 0;
  const fora = [];
  for (const d of diasEntre(inicio, fim)) {
    const l = porData.get(d);
    const provisorio = !!primeiroIncompleto && d >= primeiroIncompleto;
    if (l) { fora.push({ data: d, provisorio, cliques: l.cliques, impressoes: l.impressoes, ctr: l.ctr, posicao: l.posicao }); continue; }
    // Dia fechado sem linha, numa série que tem dado, é dia sem impressão.
    // Dia ainda aberto sem linha é atraso do Google, não zero.
    const zero = temDado && !provisorio;
    fora.push({ data: d, provisorio, cliques: zero ? 0 : null, impressoes: zero ? 0 : null, ctr: null, posicao: null });
  }
  return fora;
}

export function lerSitemaps(resp) {
  return lista(resp?.sitemap).map((s) => ({
    caminho: s?.path ?? null, enviado_em: s?.lastSubmitted ?? null, lido_em: s?.lastDownloaded ?? null,
    pendente: s?.isPending ?? null, indice: s?.isSitemapsIndex ?? null, tipo: s?.type ?? null,
    // long do Google chega como texto; contents[].indexed está descontinuado e fica de fora.
    avisos: inteiroApi(s?.warnings), erros: inteiroApi(s?.errors),
    conteudos: lista(s?.contents).map((c) => ({ tipo: c?.type ?? null, enviados: inteiroApi(c?.submitted) })),
  }));
}

export function lerInspecao(resp, pagina) {
  const r = resp?.inspectionResult;
  if (!objeto(r)) return null;
  const i = objeto(r.indexStatusResult) ? r.indexStatusResult : {};
  const ricos = objeto(r.richResultsResult) ? {
    veredito: r.richResultsResult.verdict ?? null,
    tipos: lista(r.richResultsResult.detectedItems).map((d) => d?.richResultType).filter(Boolean),
  } : null;
  return {
    pagina, veredito: i.verdict ?? null, cobertura: i.coverageState ?? null, robots: i.robotsTxtState ?? null,
    indexacao: i.indexingState ?? null, rastreado_em: i.lastCrawlTime ?? null, busca: i.pageFetchState ?? null,
    canonica_google: i.googleCanonical ?? null, canonica_site: i.userCanonical ?? null, rastreado_como: i.crawledAs ?? null,
    ricos, link: r.inspectionResultLink ?? null,
  };
}

const somaSc = (linhas) => {
  if (!linhas?.length) return null;
  const cliques = linhas.reduce((a, l) => a + (l.cliques ?? 0), 0), impressoes = linhas.reduce((a, l) => a + (l.impressoes ?? 0), 0);
  return { cliques, impressoes };
};

async function coletarSearchConsole(ctx, chamar, j, { host, anterior }) {
  const avisos = [];
  const rSites = await chamar(`${SC}/sites`, { rotulo: 'sc sites' });
  if (!rSites.ok) return { ...classificarErro('search_console', rSites), dados: null, avisos };
  const escolhida = escolherPropriedadeSc(rSites.dados?.siteEntry, host);
  if (!escolhida) {
    return {
      estado: 'falta_configurar', dados: null, avisos,
      motivo: `Nenhuma propriedade verificada do Search Console para ${host} na conta conectada. Crie a propriedade de Domínio e verifique pelo DNS.`,
    };
  }
  if (!escolhida.site.startsWith('sc-domain:')) avisos.push('Search Console: a propriedade é de prefixo; a de Domínio enxerga também o http e o www.');
  const base = `${SC}/sites/${encodeURIComponent(escolhida.site)}/searchAnalytics/query`;
  const consultar = (corpo, rotulo, margem) => chamar(base, { method: 'POST', body: corpo, rotulo, margem });
  const corpo = ({ de = j.inicio, ate = j.ultimoDomingo, dims, tipo = 'web', estado, linhas = 1000, inicio, filtro }) => ({
    startDate: de, endDate: ate, ...(dims?.length ? { dimensions: dims } : {}), type: tipo,
    ...(estado ? { dataState: estado } : {}), rowLimit: linhas, ...(inicio ? { startRow: inicio } : {}),
    ...(filtro ? { dimensionFilterGroups: [{ groupType: 'and', filters: [filtro] }] } : {}),
  });
  let parada = null;
  const falhou = (r, bloco) => {
    if (r.ok) return false;
    if (r.status === 400) {
      avisos.push(`Search Console: o Google recusou ${nomeBlocoSc(bloco)}; esse quadro fica sem dado nesta coleta.`);
      anotar(ctx, `google search console: bloco ${bloco} recusado${mensagemGoogle(r.dados) ? ` (${mensagemGoogle(r.dados)})` : ''}`);
      return true;
    }
    parada = parada ?? r;
    return true;
  };

  // 1. Por dia, de inicio até HOJE com dataState all: traz o dado fresco e o
  //    first_incomplete_date, que decide quais semanas estão fechadas.
  const rDias = await consultar(corpo({ ate: j.hoje, dims: ['date'], estado: 'all', linhas: LIMITES.SC_LINHAS }), 'sc dias');
  if (!rDias.ok) return { ...classificarErro('search_console', rDias), dados: null, avisos };
  const lidoDias = lerSearchAnalytics(rDias.dados, ['date']);
  const fid = lidoDias.primeiro_dia_incompleto;
  const temDado = lidoDias.linhas.length > 0;
  const dados = {
    propriedade: escolhida, fuso: 'America/Los_Angeles', primeiro_dia_incompleto: fid,
    // semanas e tipos começam null (não [] nem {}): numa coleta parcial o que
    // não veio sai do objeto e a coletora mantém o da coleta anterior.
    semanas: null, dias: diasSc(lidoDias, j.inicio, j.hoje, fid), por_hora: null,
    tipos: null, consultas: null, paginas: null, consultas_semana: null, paginas_semana: null,
    paises: null, aparelhos: null, aparencias: null, marca: null, cortados: [], agregacao: { dias: lidoDias.agregacao },
    sitemaps: null, inspecoes: null,
  };
  if (!temDado) avisos.push('Search Console: nenhum dado no período (propriedade nova, sem impressão ou canônica em outra propriedade).');

  // 2. Semanas fechadas: o total da chamada SEM dimensões (entra a consulta anônima).
  const semanasSc = [];
  for (const s of j.semanas) {
    if (parada) break;
    if (!semanaScFechada(s.domingo, fid)) { semanasSc.push({ semana: s.segunda, fechada: false, cliques: null, impressoes: null, ctr: null, posicao: null }); continue; }
    const r = await consultar(corpo({ de: s.segunda, ate: s.domingo, linhas: 1 }), 'sc semana');
    if (falhou(r, 'semana')) continue;
    const l = lerSearchAnalytics(r.dados).linhas[0];
    // Semana fechada sem linha: zero de verdade se a série tem dado; senão, nada a afirmar.
    semanasSc.push(l ? { semana: s.segunda, fechada: true, cliques: l.cliques, impressoes: l.impressoes, ctr: l.ctr, posicao: l.posicao }
      : { semana: s.segunda, fechada: true, cliques: temDado ? 0 : null, impressoes: temDado ? 0 : null, ctr: null, posicao: null });
  }
  if (semanasSc.length) dados.semanas = semanasSc;

  // 3. Tipos de busca no período (Discover e News só aparecem com volume mínimo).
  if (!parada) dados.tipos = {};
  for (const tipo of TIPOS_SC) {
    if (parada) break;
    const r = await consultar(corpo({ tipo, linhas: 1 }), `sc tipo ${tipo}`);
    if (falhou(r, `tipo ${tipo}`)) { dados.tipos[tipo] = null; continue; }
    const l = lerSearchAnalytics(r.dados).linhas[0];
    dados.tipos[tipo] = l && (l.impressoes || l.cliques) ? { cliques: l.cliques, impressoes: l.impressoes, ctr: l.ctr, posicao: l.posicao } : null;
  }

  // 4. Detalhes no período, paginando de 25.000 em 25.000 até o teto.
  const detalhe = async (dims, campo, opcoes = {}) => {
    const todas = [];
    for (let pag = 0; pag < LIMITES.SC_PAGINAS; pag++) {
      if (parada) return null;
      const r = await consultar(corpo({ dims, linhas: LIMITES.SC_LINHAS, inicio: pag * LIMITES.SC_LINHAS, ...opcoes }), `sc ${campo}`);
      if (falhou(r, campo)) return todas.length ? todas : null;
      const lido = lerSearchAnalytics(r.dados, dims);
      dados.agregacao[campo] = lido.agregacao;
      todas.push(...lido.linhas);
      if (lido.linhas.length < LIMITES.SC_LINHAS) break;
    }
    if (todas.length > LIMITES.SC_GUARDAR) dados.cortados.push(campo);
    return todas.sort((a, b) => (b.cliques ?? 0) - (a.cliques ?? 0) || (b.impressoes ?? 0) - (a.impressoes ?? 0)).slice(0, LIMITES.SC_GUARDAR);
  };
  dados.consultas = await detalhe(['query'], 'consultas');
  dados.paginas = await detalhe(['page'], 'paginas');
  dados.paises = await detalhe(['country'], 'paises');
  dados.aparelhos = await detalhe(['device'], 'aparelhos');
  // searchAppearance só pode ser pedida sozinha.
  dados.aparencias = await detalhe(['searchAppearance'], 'aparencias');
  const ultimaFechada = [...j.semanas].reverse().find((s) => semanaScFechada(s.domingo, fid));
  if (ultimaFechada) {
    dados.consultas_semana = await detalhe(['query'], 'consultas_semana', { de: ultimaFechada.segunda, ate: ultimaFechada.domingo });
    dados.paginas_semana = await detalhe(['page'], 'paginas_semana', { de: ultimaFechada.segunda, ate: ultimaFechada.domingo });
  }

  // 5. Marca e não marca. O filtro do Google é por IA; o regex é aproximação,
  //    e a diferença para o total é a consulta anônima, que a tela mostra.
  const nomeMarca = host.split('.')[0];
  if (!parada && nomeMarca) {
    const rMarca = await consultar(corpo({ linhas: 1, filtro: { dimension: 'query', operator: 'includingRegex', expression: nomeMarca } }), 'sc marca');
    const rNao = rMarca.ok ? await consultar(corpo({ linhas: 1, filtro: { dimension: 'query', operator: 'excludingRegex', expression: nomeMarca } }), 'sc nao marca') : rMarca;
    if (!falhou(rMarca, 'marca') && !falhou(rNao, 'nao_marca')) {
      const m = somaSc(lerSearchAnalytics(rMarca.dados).linhas) ?? { cliques: 0, impressoes: 0 };
      const n = somaSc(lerSearchAnalytics(rNao.dados).linhas) ?? { cliques: 0, impressoes: 0 };
      // O total do mesmo período e do mesmo estado de dado (a consulta do tipo
      // web). Sem volume no período, marca "zero" seria palpite: fica null.
      const total = dados.tipos?.web ?? null;
      dados.marca = total ? {
        marca: m, nao_marca: n,
        anonimas: { cliques: Math.max(0, total.cliques - m.cliques - n.cliques), impressoes: Math.max(0, total.impressoes - m.impressoes - n.impressoes) },
      } : null;
    }
  }

  // 6. Sitemaps (só contagens de erro e aviso; o texto do erro a API não dá).
  if (!parada) {
    const r = await chamar(`${SC}/sites/${encodeURIComponent(escolhida.site)}/sitemaps`, { rotulo: 'sc sitemaps' });
    if (!falhou(r, 'sitemaps')) dados.sitemaps = lerSitemaps(r.dados);
    if (dados.sitemaps && !dados.sitemaps.length) avisos.push('Search Console: nenhum sitemap enviado.');
    if (dados.sitemaps?.some((s) => s.erros > 0 || s.pendente)) avisos.push('Search Console: há sitemap com erro ou pendente (o Google não conseguiu ler).');
  }

  // 7. Opcionais, só com folga de tempo: curva por hora e inspeção das páginas
  //    que mais trazem clique (2.000 por dia por propriedade; aqui no máximo 10).
  if (!parada) {
    const r = await consultar(corpo({ de: somarDias(j.hoje, -2), ate: j.hoje, dims: ['hour'], estado: 'hourly_all', linhas: 200 }), 'sc por hora', MARGEM_EXTRA_MS);
    if (r.ok) dados.por_hora = lerSearchAnalytics(r.dados, ['hour']).linhas;
    else if (r.status === 401) parada = r;
  }
  const alvos = lista(dados.paginas).slice(0, LIMITES.INSPECOES).map((p) => p.pagina).filter(Boolean);
  if (!parada && alvos.length) {
    // O prazo pode terminar antes das últimas páginas. Conservar por URL e
    // consultar as ausentes primeiro impede reiniciar sempre na primeira.
    // Nunca misturar propriedades, nem apresentar a consulta antiga como nova.
    const prev = anterior?.search_console;
    const guardadas = new Map((prev?.propriedade?.site === escolhida.site ? lista(prev.inspecoes) : [])
      .filter((i) => alvos.includes(i?.pagina)).map((i) => [i.pagina, i]));
    const pendentes = alvos.filter((p) => guardadas.get(p)?.consultado_em !== j.hoje)
      .sort((a, b) => Number(guardadas.has(a)) - Number(guardadas.has(b)));
    for (const pagina of pendentes) {
      const r = await chamar(SC_INSPECAO, { method: 'POST', body: { inspectionUrl: pagina, siteUrl: escolhida.site, languageCode: 'pt-BR' }, rotulo: 'sc inspecao', margem: MARGEM_EXTRA_MS });
      if (r.semTempo) { avisos.push('Search Console: faltou tempo para inspecionar todas as páginas; a próxima coleta continua.'); break; }
      if (!r.ok) { if (r.status === 401) parada = r; else avisos.push('Search Console: a inspeção de páginas parou (cota ou permissão).'); break; }
      const i = lerInspecao(r.dados, pagina);
      if (i) guardadas.set(pagina, { ...i, consultado_em: j.hoje });
    }
    dados.inspecoes = alvos.map((p) => guardadas.get(p)).filter(Boolean);
    const fora = dados.inspecoes.filter((i) => i.veredito && i.veredito !== 'PASS').length;
    if (fora) avisos.push(`Search Console: ${fora === 1 ? '1 página com clique está fora do índice ou com problema' : `${fora} páginas com clique estão fora do índice ou com problema`}.`);
  }

  // dados.cortados diz à tela quais listas ficaram nas 1000 que mais trazem
  // clique. Não vira aviso: é corte de propósito e se repetiria todo dia.
  if (parada) {
    const c = classificarErro('search_console', parada);
    if (c.estado === 'reconectar' || c.estado === 'falta_conectar') return { ...c, dados: null, avisos };
    return { estado: 'parcial', motivo: c.motivo, dados, avisos };
  }
  return { estado: 'ok', dados, avisos };
}

// ==================================================== PERFIL DA EMPRESA ==

// As métricas diárias de hoje. BUSINESS_CONVERSATIONS (removida em
// 31/01/2026) e BUSINESS_FOOD_ORDERS (depreciada) ficam de fora: pedir enum
// removido pode derrubar a chamada inteira.
export const METRICAS_DIARIAS = {
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: 'impressoes_maps_computador',
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: 'impressoes_busca_computador',
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: 'impressoes_maps_celular',
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: 'impressoes_busca_celular',
  BUSINESS_DIRECTION_REQUESTS: 'rotas',
  CALL_CLICKS: 'ligacoes',
  WEBSITE_CLICKS: 'cliques_site',
  BUSINESS_BOOKINGS: 'reservas',
  BUSINESS_FOOD_MENU_CLICKS: 'cliques_cardapio',
};
const IMPRESSOES_PERFIL = ['impressoes_maps_computador', 'impressoes_busca_computador', 'impressoes_maps_celular', 'impressoes_busca_celular'];
const READMASK_LOCAL = 'name,title,storeCode,websiteUri,phoneNumbers,categories,storefrontAddress,regularHours,specialHours,serviceArea,labels,latlng,openInfo,metadata,profile,moreHours,serviceItems';
const ESTRELAS = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

export const lerContasPerfil = (resp) => lista(resp?.accounts).filter((c) => textoOuNull(c?.name)).map((c) => ({
  id: c.name, nome: c.accountName ?? null, tipo: c.type ?? null, papel: c.role ?? null, verificacao: c.verificationState ?? null,
}));

function endereco(a) {
  if (!objeto(a)) return null;
  const partes = [...lista(a.addressLines), a.sublocality, a.locality, a.administrativeArea, a.postalCode].filter((x) => textoOuNull(x));
  return partes.length ? partes.join(', ') : null;
}
export const lerLocais = (resp, conta = null) => lista(resp?.locations).filter((l) => textoOuNull(l?.name)).map((l) => ({
  id: l.name, conta, nome: l.title ?? null, site: l.websiteUri ?? null, telefone: l.phoneNumbers?.primaryPhone ?? null,
  categoria: l.categories?.primaryCategory?.displayName ?? null,
  categorias_extra: lista(l.categories?.additionalCategories).map((c) => c?.displayName).filter(Boolean),
  endereco: endereco(l.storefrontAddress), maps: l.metadata?.mapsUri ?? null, pedir_avaliacao: l.metadata?.newReviewUri ?? null,
  place_id: l.metadata?.placeId ?? null, aberto: l.openInfo?.status ?? null, descricao: l.profile?.description ?? null,
  pode_postar: l.metadata?.canOperateLocalPost ?? null, alteracoes_pendentes: l.metadata?.hasPendingEdits ?? null,
  google_alterou: l.metadata?.hasGoogleUpdated ?? null, voz_do_comerciante: l.metadata?.hasVoiceOfMerchant ?? null,
}));

/** O perfil certo quando a conta enxerga mais de um: o do link do canal
 *  "google" (cid ou place id), depois o do site da casa, depois o primeiro. */
export function escolherLocal(locais, host, urlCanal) {
  if (!locais.length) return null;
  const cid = (u) => { try { return new URL(u).searchParams.get('cid'); } catch { return null; } };
  if (urlCanal) {
    const c = cid(urlCanal);
    const peloLink = locais.find((l) => (l.place_id && urlCanal.includes(l.place_id)) || (c && l.maps && cid(l.maps) === c));
    if (peloLink) return peloLink;
  }
  return locais.find((l) => l.site && host && hostDe(l.site) === host) ?? locais[0];
}

/** O dia (ou o domingo da semana) que já passou do atraso que o Google não
 *  documenta: 3 dias depois dele. */
const perfilFechada = (dia, hoje) => somarDias(dia, DIAS_ATRASO_PERFIL) < hoje;
// Marca do dia que veio só com a data (sem value): só vira número na hora
// de montar o dia, quando já se sabe se o dia fechou.
const SEM_VALOR = Symbol('sem_valor');

/** Série diária do Perfil. O Google omite o value do dia zerado
 *  (documentado), mas um dia RECENTE sem value pode ser só atraso: o Google
 *  ainda não processou (de 2 a 3 dias, segundo terceiros; a pesquisa manda
 *  tratar como zero só o dia já fechado). Transformar o atraso em zero fazia
 *  toda coleta mostrar os 2 ou 3 últimos dias zerados e a semana em curso
 *  com uma queda que não existe (revisão 2). Por isso o dia sem value é:
 *   - zero, se o dia já fechou (3 dias depois dele) E não passa do último
 *     dia em que ALGUMA métrica trouxe número (o Google já processou até
 *     ali; um atraso maior que 3 dias também não vira zero);
 *   - null, se não (pode ser atraso).
 *  Dia que nem veio fica null. Métrica que não voltou fica null em todos os
 *  dias. `hoje` (dia de São Paulo) diz o que já fechou; sem ele, conta como
 *  se hoje fosse o dia seguinte a `fim`. dias_ate é o último dia com algum
 *  número (null se nenhum dia trouxe número). */
export function lerSerieDiaria(resp, inicio, fim, { hoje = null } = {}) {
  const porMetrica = {};
  let diasAte = null;
  for (const multi of lista(resp?.multiDailyMetricTimeSeries)) {
    for (const s of lista(multi?.dailyMetricTimeSeries)) {
      const campo = METRICAS_DIARIAS[s?.dailyMetric];
      if (!campo || s?.dailySubEntityType) continue;
      const m = (porMetrica[campo] ??= new Map());
      for (const dv of lista(s?.timeSeries?.datedValues)) {
        const d = dataGoogle(dv?.date);
        if (!d) continue;
        if (dv.value == null) { m.set(d, SEM_VALOR); continue; }
        m.set(d, inteiroApi(dv.value));
        if (!diasAte || d > diasAte) diasAte = d;
      }
    }
  }
  const referencia = /^\d{4}-\d{2}-\d{2}$/.test(String(hoje ?? '')) ? hoje : somarDias(fim, 1);
  const zeroDeVerdade = (d) => !!diasAte && d <= diasAte && perfilFechada(d, referencia);
  const dias = [];
  for (const d of diasEntre(inicio, fim)) {
    const dia = { data: d };
    for (const campo of Object.values(METRICAS_DIARIAS)) {
      const v = porMetrica[campo]?.has(d) ? porMetrica[campo].get(d) : null;
      dia[campo] = v === SEM_VALOR ? (zeroDeVerdade(d) ? 0 : null) : v;
    }
    dias.push(dia);
  }
  return { dias, metricas: Object.keys(porMetrica), dias_ate: diasAte };
}

export function semanasPerfil(dias, j) {
  const porData = new Map(lista(dias).map((d) => [d.data, d]));
  return j.semanas.map((s) => {
    const semana = [...diasEntre(s.segunda, s.domingo)].map((d) => porData.get(d));
    const soma = (campo) => (semana.every((d) => d && d[campo] != null) ? semana.reduce((a, d) => a + d[campo], 0) : null);
    const somaDe = (campos) => { const v = campos.map(soma); return v.every((x) => x != null) ? v.reduce((a, x) => a + x, 0) : null; };
    const cliques = somaDe(['cliques_site', 'ligacoes', 'rotas']);
    const reservas = soma('reservas');
    return {
      semana: s.segunda, fechada: perfilFechada(s.domingo, j.hoje),
      impressoes: somaDe(IMPRESSOES_PERFIL), cliques_site: soma('cliques_site'), ligacoes: soma('ligacoes'), rotas: soma('rotas'),
      reservas, cliques, interacoes: cliques != null && reservas != null ? cliques + reservas : null,
    };
  });
}

export const lerTermos = (resp) => lista(resp?.searchKeywordsCounts).map((t) => ({
  termo: t?.searchKeyword ?? null,
  usuarios: inteiroApi(t?.insightsValue?.value),
  abaixo_de: inteiroApi(t?.insightsValue?.threshold),
})).filter((t) => t.termo);

export function lerAvaliacoes(resp) {
  return {
    media: numeroApi(resp?.averageRating),
    total: inteiroApi(resp?.totalReviewCount),
    proxima: textoOuNull(resp?.nextPageToken),
    lista: lista(resp?.reviews).filter((r) => textoOuNull(r?.reviewId) || textoOuNull(r?.name)).map((r) => ({
      id: r.reviewId ?? String(r.name).split('/').pop(),
      autor: r.reviewer?.displayName ?? null, anonimo: r.reviewer?.isAnonymous ?? null, foto: r.reviewer?.profilePhotoUrl ?? null,
      estrelas: ESTRELAS[r.starRating] ?? null, comentario: r.comment ?? null,
      criada_em: r.createTime ?? null, atualizada_em: r.updateTime ?? null,
      midias: lista(r.reviewMediaItems).length,
      resposta: objeto(r.reviewReply) ? {
        texto: r.reviewReply.comment ?? null, em: r.reviewReply.updateTime ?? null,
        situacao: r.reviewReply.reviewReplyState ?? null, violacao: r.reviewReply.policyViolation ?? null,
      } : null,
    })),
  };
}

/** Junta por reviewId: a mais atualizada vence. Problema conhecido do Google
 *  (17/06/2026): da 2a página em diante a lista pode vir faltando avaliação. */
export function juntarAvaliacoes(...listas) {
  const mapa = new Map();
  for (const l of listas) {
    for (const a of lista(l)) {
      if (!a?.id) continue;
      const v = mapa.get(a.id);
      if (!v || String(a.atualizada_em ?? '') >= String(v.atualizada_em ?? '')) mapa.set(a.id, a);
    }
  }
  return [...mapa.values()].sort((a, b) => String(b.criada_em ?? '').localeCompare(String(a.criada_em ?? '')));
}

export function resumoAvaliacoes(lst, { media = null, total = null } = {}, j = null) {
  const distribuicao = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const a of lst) if (a.estrelas) distribuicao[a.estrelas]++;
  const respondidas = lst.filter((a) => a.resposta?.texto);
  const horas = respondidas.map((a) => (Date.parse(a.resposta.em) - Date.parse(a.criada_em)) / 3_600_000).filter((h) => Number.isFinite(h) && h >= 0);
  const porSemana = j ? j.semanas.map((s) => {
    const novas = lst.filter((a) => { const d = diaDeIso(a.criada_em); return d && d >= s.segunda && d <= s.domingo; });
    const notas = novas.map((a) => a.estrelas).filter(Boolean);
    return { semana: s.segunda, novas: novas.length, media: notas.length ? arred(notas.reduce((x, y) => x + y, 0) / notas.length, 2) : null };
  }) : [];
  return {
    media, total, guardadas: lst.length, completas: total == null ? null : lst.length >= total,
    distribuicao, sem_resposta: lst.length - respondidas.length,
    taxa_resposta: lst.length ? arred(respondidas.length / lst.length, 4) : null,
    resposta_media_horas: horas.length ? arred(horas.reduce((a, b) => a + b, 0) / horas.length, 1) : null,
    por_semana: porSemana, lista: lst,
  };
}

export const lerPosts = (resp) => lista(resp?.localPosts).filter((p) => textoOuNull(p?.name)).map((p) => ({
  id: p.name, tipo: p.topicType ?? null, situacao: p.state ?? null, texto: p.summary ?? null,
  criado_em: p.createTime ?? null, atualizado_em: p.updateTime ?? null, agendado_em: p.scheduledTime ?? null,
  link: p.searchUrl ?? null,
  botao: objeto(p.callToAction) ? { tipo: p.callToAction.actionType ?? null, url: p.callToAction.url ?? null } : null,
  evento: objeto(p.event) ? { titulo: p.event.title ?? null, agenda: p.event.schedule ?? null } : null,
  oferta: objeto(p.offer) ? { cupom: p.offer.couponCode ?? null, link: p.offer.redeemOnlineUrl ?? null, termos: p.offer.termsConditions ?? null } : null,
  imagem: lista(p.media)[0]?.googleUrl ?? null,
}));

/** Post no ar -> publicação do canal "google". O título sai de event.title nos
 *  posts EVENT e OFFER (o objeto event é obrigatório nos dois); nos outros, do
 *  começo do texto. Link inválido não entra (a chave da publicação é o link). */
export function postParaPublicacao(post) {
  if (post?.situacao !== 'LIVE' || !post.link || !post.criado_em) return null;
  let url;
  try { url = normalizarLink(post.link); } catch { return null; }
  if (!url) return null;
  let titulo = ['EVENT', 'OFFER'].includes(post.tipo) ? textoOuNull(post.evento?.titulo) : null;
  if (!titulo && textoOuNull(post.texto)) {
    const t = post.texto.replace(/\s+/g, ' ').trim();
    titulo = t.length > 80 ? `${t.slice(0, 77).replace(/\s+\S*$/, '')}...` : t;
  }
  const fora = { canal: 'google', url, data: diaDeIso(post.criado_em) };
  if (titulo) fora.titulo = limparTexto(titulo, 200);
  return fora;
}

export const lerSeguidores = (resp) => inteiroApi(resp?.count);
export const lerMidias = (resp) => ({
  total: inteiroApi(resp?.totalMediaItemCount),
  itens: lista(resp?.mediaItems).map((m) => ({
    id: m?.name ?? null, formato: m?.mediaFormat ?? null, categoria: m?.locationAssociation?.category ?? null,
    link: m?.googleUrl ?? null, miniatura: m?.thumbnailUrl ?? null, criada_em: m?.createTime ?? null,
  })),
});
export function lerSituacaoPerfil(resp) {
  if (!objeto(resp)) return null;
  return {
    voz_do_comerciante: resp.hasVoiceOfMerchant ?? null, autoridade: resp.hasBusinessAuthority ?? null,
    aguardando: objeto(resp.waitForVoiceOfMerchant), verificacao_pendente: resp.verify?.hasPendingVerification ?? null,
    conflito: objeto(resp.resolveOwnershipConflict), problema: resp.complyWithGuidelines?.recommendationReason ?? null,
  };
}

function urlMetricas(local, metricas, de, ate) {
  const q = new URLSearchParams();
  for (const m of metricas) q.append('dailyMetrics', m);
  const [a1, m1, d1] = de.split('-').map(Number), [a2, m2, d2] = ate.split('-').map(Number);
  q.set('dailyRange.start_date.year', a1); q.set('dailyRange.start_date.month', m1); q.set('dailyRange.start_date.day', d1);
  q.set('dailyRange.end_date.year', a2); q.set('dailyRange.end_date.month', m2); q.set('dailyRange.end_date.day', d2);
  return `${GBP_DESEMPENHO}/${local}:fetchMultiDailyMetricsTimeSeries?${q}`;
}

/** Os meses fechados mais recentes. O mês só chega até o dia 5 do seguinte. */
export function mesesDeTermos(hoje, n = LIMITES.TERMOS_MESES) {
  const [a, m, d] = hoje.split('-').map(Number);
  const fora = [];
  for (let k = 1; k <= n; k++) {
    const dt = new Date(Date.UTC(a, m - 1 - k, 1));
    fora.push({ ano: dt.getUTCFullYear(), mes: dt.getUTCMonth() + 1, completo: k > 1 || d > 5 });
  }
  return fora;
}

async function coletarPerfil(ctx, chamar, j, { host, urlCanal, anterior }) {
  const avisos = [];
  // 1. Todas as contas: o perfil pode estar num Grupo de empresas, e a conta
  //    pessoal não o lista (contraprova).
  const rContas = await paginar(chamar, (t) => comPagina(`${GBP_CONTAS}/accounts?pageSize=20`, t), 'accounts', { maxPaginas: LIMITES.CONTAS_PAGINAS, rotulo: 'perfil contas' });
  if (rContas.falha) return { ...classificarErro('perfil', rContas.falha, { primeira: rContas.itens.length === 0, servico: hostDaUrl(GBP_CONTAS) }), dados: null, avisos };
  const contas = lerContasPerfil({ accounts: rContas.itens });
  if (rContas.cortado) avisos.push('Perfil da Empresa: a conta enxerga mais contas do que o teto de leitura.');
  if (!contas.length) return { estado: 'falta_configurar', motivo: 'A conta Google conectada não administra nenhum Perfil da Empresa.', dados: null, avisos };

  const locais = [];
  for (const conta of contas) {
    const r = await paginar(chamar, (t) => comPagina(`${GBP_INFO}/${conta.id}/locations?readMask=${READMASK_LOCAL}&pageSize=100`, t), 'locations', { maxPaginas: LIMITES.LOCAIS_PAGINAS, rotulo: 'perfil locais' });
    if (r.falha) {
      const c = classificarErro('perfil', r.falha, { primeira: !locais.length, servico: hostDaUrl(GBP_INFO) });
      // API desligada (falta_configurar) vale para o projeto inteiro, não
      // para uma conta: para aqui, com o nome da API a ativar, em vez de
      // dizer "nenhum perfil".
      if (['reconectar', 'falta_conectar', 'aguardando_aprovacao', 'falta_configurar'].includes(c.estado) || r.falha.semTempo) return { ...c, dados: null, avisos };
      avisos.push(`Perfil da Empresa: não deu para listar os perfis de uma das contas (${limparTexto(conta.nome ?? conta.id, 60)}).`);
      continue;
    }
    for (const l of lerLocais({ locations: r.itens }, conta.id)) if (!locais.some((x) => x.id === l.id)) locais.push(l);
  }
  if (!locais.length) return { estado: 'falta_configurar', motivo: 'Nenhum Perfil da Empresa nas contas que o login administra.', dados: null, avisos };
  const local = escolherLocal(locais, host, urlCanal);
  const conta = contas.find((c) => c.id === local.conta) ?? contas[0];
  if (locais.length > 1) avisos.push(`Perfil da Empresa: a conta administra ${locais.length} perfis; os números são de "${limparTexto(local.nome, 80)}".`);

  let estado = 'ok', motivo, parada = null;
  const dados = {
    contas: contas.length, conta,
    local: { ...local, situacao: null, atributos: null, alteracoes_google: null },
    outros_locais: locais.filter((l) => l.id !== local.id).map((l) => ({ id: l.id, nome: l.nome })),
    metricas_recusadas: [], dias: null, dias_ate: null, semanas: null, seguidores: null, termos: null, avaliacoes: null, posts: null, fotos: null,
  };
  delete dados.local.conta;
  // Erro de um bloco: 401 para tudo; cota/tempo para o resto; o resto vira aviso.
  const tratar = (r, bloco) => {
    if (r.ok) return false;
    if (r.status === 401 || r.semTempo || r.status === 429) parada = parada ?? r;
    else {
      avisos.push(`Perfil da Empresa: não deu para ler ${bloco} nesta coleta.`);
      anotar(ctx, `google perfil: ${bloco} falhou (${r.status || r.codigo || 'sem resposta'}${mensagemGoogle(r.dados) ? `, ${mensagemGoogle(r.dados)}` : ''})`);
    }
    estado = 'parcial';
    return true;
  };

  // 2. Situação, atributos e o que o Google mudou no perfil.
  const rVoz = await chamar(`${GBP_VERIF}/${local.id}/VoiceOfMerchantState`, { rotulo: 'perfil situacao' });
  if (!tratar(rVoz, 'a situação do perfil')) {
    dados.local.situacao = lerSituacaoPerfil(rVoz.dados);
    const problema = dados.local.situacao?.problema;
    if (problema) {
      avisos.push(`Perfil da Empresa: o Google marcou o perfil ${PROBLEMAS_PERFIL[problema] ?? 'com um problema que pede atenção'}; confira no Perfil da Empresa.`);
      if (!PROBLEMAS_PERFIL[problema]) anotar(ctx, `google perfil: marcado pelo Google (${problema})`);
    }
  }
  if (!parada) {
    const r = await chamar(`${GBP_INFO}/${local.id}/attributes`, { rotulo: 'perfil atributos' });
    if (!tratar(r, 'os atributos')) {
      dados.local.atributos = lista(r.dados?.attributes).map((a) => ({
        nome: String(a?.name ?? '').replace(/^.*attributes\//, '') || null,
        valores: a?.values ?? a?.repeatedEnumValue ?? a?.uriValues ?? null,
      }));
    }
  }
  if (!parada && local.google_alterou) {
    const r = await chamar(`${GBP_INFO}/${local.id}:getGoogleUpdated?readMask=${READMASK_LOCAL}`, { rotulo: 'perfil alteracoes do google' });
    if (!tratar(r, 'as alterações do Google')) {
      dados.local.alteracoes_google = { campos: textoOuNull(r.dados?.diffMask), pendentes: textoOuNull(r.dados?.pendingMask) };
      if (dados.local.alteracoes_google.campos) avisos.push('Perfil da Empresa: o Google alterou campos do perfil; confira.');
    }
  }

  // 3. Métricas diárias numa chamada só; se o Google recusar o pedido, uma por
  //    uma, para só a recusada ficar null.
  if (!parada) {
    const todas = Object.keys(METRICAS_DIARIAS);
    let serie = null;
    const r = await chamar(urlMetricas(local.id, todas, j.inicio, j.ontem), { rotulo: 'perfil metricas' });
    if (r.ok) serie = lerSerieDiaria(r.dados, j.inicio, j.ontem, { hoje: j.hoje });
    else if (r.status === 400) {
      const juntas = { multiDailyMetricTimeSeries: [] };
      for (const m of todas) {
        const r1 = await chamar(urlMetricas(local.id, [m], j.inicio, j.ontem), { rotulo: 'perfil metrica' });
        if (r1.ok) juntas.multiDailyMetricTimeSeries.push(...lista(r1.dados?.multiDailyMetricTimeSeries));
        else if (r1.status === 400) dados.metricas_recusadas.push(m);
        else { tratar(r1, 'as métricas diárias'); break; }
      }
      serie = lerSerieDiaria(juntas, j.inicio, j.ontem, { hoje: j.hoje });
      if (dados.metricas_recusadas.length) {
        const nomes = dados.metricas_recusadas.map((m) => NOME_METRICA_PERFIL[m] ?? 'uma das métricas diárias');
        avisos.push(`Perfil da Empresa: o Google recusou ${juntarNomes([...new Set(nomes)])}; esses números ficam vazios.`);
        anotar(ctx, `google perfil: métricas recusadas ${dados.metricas_recusadas.join(', ')}`);
      }
    } else tratar(r, 'as métricas diárias');
    if (serie) {
      dados.dias = serie.dias;
      dados.dias_ate = serie.dias_ate;
      dados.semanas = semanasPerfil(serie.dias, j);
    }
  }

  // 4. Termos de pesquisa, mês a mês (só mensal; valor pequeno vem como "menos de N").
  for (const mes of mesesDeTermos(j.hoje)) {
    if (parada) break;
    const base = `${GBP_DESEMPENHO}/${local.id}/searchkeywords/impressions/monthly?monthlyRange.start_month.year=${mes.ano}&monthlyRange.start_month.month=${mes.mes}&monthlyRange.end_month.year=${mes.ano}&monthlyRange.end_month.month=${mes.mes}&pageSize=100`;
    const r = await paginar(chamar, (t) => comPagina(base, t), 'searchKeywordsCounts', { maxPaginas: LIMITES.TERMOS_PAGINAS, rotulo: 'perfil termos' });
    if (r.falha) { tratar(r.falha, 'os termos de pesquisa'); break; }
    (dados.termos ??= []).push({ mes: `${mes.ano}-${String(mes.mes).padStart(2, '0')}`, completo: mes.completo, termos: lerTermos({ searchKeywordsCounts: r.itens }) });
  }

  // 5. API v4 (avaliações, posts, fotos, seguidores). Ela só aparece para
  //    ativar no Google Cloud DEPOIS da aprovação: desligada vira um aviso só.
  const v4 = `${GBP_V4}/${conta.id}/${local.id}`;
  let v4Desligada = false;
  const tratarV4 = (r, bloco) => {
    if (!r.ok && !r.semTempo && classificarErro('perfil', r, { servico: SERVICO_PERFIL_V4 }).estado === 'aguardando_aprovacao') {
      v4Desligada = true; estado = 'parcial';
      avisos.push('Perfil da Empresa: a Google My Business API (avaliações, posts, fotos e seguidores) ainda não está ativada; ela só aparece no Google Cloud depois da aprovação.');
      return true;
    }
    return tratar(r, bloco);
  };
  if (!parada) {
    const mapa = [];
    let media = null, total = null, falha = null;
    const anteriores = lista(anterior?.perfil?.avaliacoes?.lista);
    // A 1a página de cada ordem vem sempre certa; as seguintes podem faltar
    // avaliação. Se a soma não bate com o total, puxa de novo em outra ordem.
    for (const ordem of [null, 'rating', 'rating desc']) {
      // Sem o total (perfil sem avaliação, ou o Google não mandou) não há como
      // saber se faltou alguma: outra ordem só gastaria chamada.
      if (ordem && (total == null || juntarAvaliacoes(...mapa).length >= total)) break;
      let token = null;
      for (let pag = 0; pag < LIMITES.AVALIACOES_PAGINAS; pag++) {
        const q = new URLSearchParams({ pageSize: '50' });
        if (ordem) q.set('orderBy', ordem);
        if (token) q.set('pageToken', token);
        const r = await chamar(`${v4}/reviews?${q}`, { rotulo: 'perfil avaliacoes' });
        if (!r.ok) { falha = r; break; }
        const l = lerAvaliacoes(r.dados);
        media ??= l.media; total ??= l.total;
        mapa.push(l.lista);
        token = l.proxima;
        if (!token || (total != null && juntarAvaliacoes(...mapa).length >= total)) break;
      }
      if (falha) break;
    }
    if (falha && !mapa.length) tratarV4(falha, 'as avaliações');
    else {
      if (falha) tratar(falha, 'todas as avaliações');
      let juntas = juntarAvaliacoes(...mapa);
      // Lista incompleta: as que a coleta anterior viu e esta não, ficam.
      if (total != null && juntas.length < total && anteriores.length) juntas = juntarAvaliacoes(anteriores, juntas);
      dados.avaliacoes = resumoAvaliacoes(juntas, { media, total }, j);
      if (total != null && juntas.length < total) avisos.push(`Perfil da Empresa: o Google listou ${juntas.length} de ${total} avaliações (problema conhecido da API); a próxima coleta tenta completar.`);
    }
  }
  if (!parada && !v4Desligada) {
    const r = await paginar(chamar, (t) => comPagina(`${v4}/localPosts?pageSize=100`, t), 'localPosts', { maxPaginas: LIMITES.POSTS_PAGINAS, rotulo: 'perfil posts' });
    if (r.falha) tratarV4(r.falha, 'os posts');
    else dados.posts = lerPosts({ localPosts: r.itens });
  }
  if (!parada && !v4Desligada) {
    const r = await chamar(`${v4}/media?pageSize=100`, { rotulo: 'perfil fotos' });
    if (!tratarV4(r, 'as fotos')) {
      const empresa = lerMidias(r.dados);
      dados.fotos = { empresa: empresa.total, clientes: null, recentes: empresa.itens.slice(0, 30) };
      const rc = await chamar(`${v4}/media/customers?pageSize=100`, { rotulo: 'perfil fotos de clientes' });
      if (!tratar(rc, 'as fotos de clientes')) dados.fotos.clientes = lerMidias(rc.dados).total;
    }
  }
  if (!parada && !v4Desligada) {
    const r = await chamar(`${v4}/followers/metadata`, { rotulo: 'perfil seguidores' });
    if (!tratarV4(r, 'os seguidores')) dados.seguidores = lerSeguidores(r.dados);
  }

  if (parada) {
    const c = classificarErro('perfil', parada);
    if (c.estado === 'reconectar' || c.estado === 'falta_conectar') return { ...c, dados: null, avisos };
    estado = 'parcial'; motivo = c.motivo;
  }
  if (!dados.dias && estado === 'ok') estado = 'parcial';
  if (estado === 'parcial') motivo = motivo ?? 'Parte dos números do Perfil da Empresa não veio nesta coleta.';
  return { estado, motivo, dados, avisos };
}

// ============================================= números da semana e posts --

const comNumero = (numeros, chave, valor) => { const v = paraBanco(valor); if (v != null) numeros[chave] = v; };

/** Canal "site": GA4 (alcance, impressões, engajamento, leads, conversas) +
 *  Search Console (cliques). Chave sem número fica de fora, nunca null. */
export function semanasDoSite(ga4, sc, j, { desdeEventosChave } = {}) {
  const porSemanaGa4 = new Map(lista(ga4?.semanas).map((l) => [l.semana, l]));
  const porSemanaSc = new Map(lista(sc?.semanas).filter((l) => l.fechada).map((l) => [l.semana, l]));
  // A base zero começa na semana do PRIMEIRO clique de WhatsApp visto: um
  // clique só prova que a medição existe dali em diante (a medição otimizada
  // pode ter sido ligada ontem). Semana anterior fica sem a chave, e um
  // zero ali passaria por cima das conversas lançadas à mão.
  const whatsapp = new Map();
  const cliquesWa = lista(ga4?.cliques_saida).filter((c) => ehWhatsapp(c) && typeof c.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.data));
  if (ga4?.whatsapp_medido && cliquesWa.length) {
    const desde = segundaDaSemana(cliquesWa.map((c) => c.data).sort()[0]);
    for (const s of j.semanas) if (s.segunda >= desde) whatsapp.set(s.segunda, 0);
    for (const c of cliquesWa) {
      const seg = segundaDaSemana(c.data);
      if (whatsapp.has(seg)) whatsapp.set(seg, whatsapp.get(seg) + (c.cliques ?? 0));
    }
  }
  const fora = [];
  for (const s of j.semanas) {
    const numeros = {};
    const g = porSemanaGa4.get(s.segunda);
    if (g) {
      comNumero(numeros, 'alcance', g.usuarios);
      comNumero(numeros, 'impressoes', g.visualizacoes);
      comNumero(numeros, 'engajamento', g.sessoes_engajadas);
      // Evento-chave só conta da data em que foi marcado: semana anterior a
      // isso teria "0 leads" que na verdade é "não medido".
      if (desdeEventosChave && desdeEventosChave <= s.segunda) comNumero(numeros, 'leads', g.eventos_chave);
      // Semana sem nenhum registro no GA4 (etiqueta fora do ar?) não ganha
      // "0 conversas": só semana medida tem zero.
      if (whatsapp.has(s.segunda)) comNumero(numeros, 'conversas', whatsapp.get(s.segunda));
    }
    const c = porSemanaSc.get(s.segunda);
    if (c) comNumero(numeros, 'cliques', c.cliques);
    if (Object.keys(numeros).length) fora.push({ canal: 'site', semana: s.segunda, numeros });
  }
  return fora;
}

/** Canal "google": impressões e cliques (site + ligação + rota) só com a
 *  semana fechada; seguidores (total de hoje) só na semana que acabou de
 *  fechar, e só na segunda logo depois dela: o número da semana é o retrato
 *  de domingo, e a coleta de terça (ou um "Atualizar agora" na terça) já
 *  traria a segunda inteira de outra semana por cima dele. */
export function semanasDoGoogle(perfil, j) {
  const porSemana = new Map(lista(perfil?.semanas).map((l) => [l.semana, l]));
  const ultima = j.semanas[j.semanas.length - 1];
  const fora = [];
  for (const s of j.semanas) {
    const numeros = {};
    const p = porSemana.get(s.segunda);
    if (p?.fechada) {
      comNumero(numeros, 'impressoes', p.impressoes);
      comNumero(numeros, 'cliques', p.cliques);
    }
    if (s === ultima && perfil?.seguidores != null && j.hoje === somarDias(s.domingo, 1)) comNumero(numeros, 'seguidores', perfil.seguidores);
    if (Object.keys(numeros).length) fora.push({ canal: 'google', semana: s.segunda, numeros });
  }
  return fora;
}

export function publicacoesDoPerfil(perfil) {
  const fora = [], vistos = new Set();
  for (const p of lista(perfil?.posts)) {
    const pub = postParaPublicacao(p);
    if (!pub || vistos.has(pub.url)) continue;
    vistos.add(pub.url);
    fora.push(pub);
  }
  return fora;
}

// ================================================================ coletar --

function envParaOauth(ctx) {
  const ler = (n) => (typeof ctx.env === 'function' ? ctx.env(n) : undefined) ?? undefined;
  // renovar pode ler o env como função, como Deno.env (.get) ou como objeto:
  // os três jeitos funcionam, e o valor só sai por getter (não é copiado).
  const env = (n) => ler(n);
  env.get = ler;
  for (const n of SECRETS) Object.defineProperty(env, n, { get: () => ler(n), enumerable: true });
  return env;
}
function fetchParaOauth(ctx) {
  const base = typeof ctx.fetch === 'function' ? ctx.fetch : globalThis.fetch;
  return (url, init = {}) => base(url, { ...init, signal: init.signal ?? AbortSignal.timeout(PRAZO_TOKEN_MS) });
}

export async function coletar(ctx) {
  const hoje = ctx.hoje || hojeSP();
  const j = janelas(hoje);
  const env = typeof ctx.env === 'function' ? ctx.env : () => null;
  const log = (t) => { try { ctx.log?.(t); } catch { /* o diário não derruba a coleta */ } };
  const avisos = [];
  const partes = {};
  const dados = { versao: 1, periodo: { inicio: j.inicio, fim: j.ontem, semanas: j.semanas.map((s) => s.segunda) }, ga4: null, search_console: null, perfil: null };
  let semanas = [], publicacoes = [], conexaoNova = null, faltouTempo = false;
  const marcar = (p, estado, motivo) => { partes[p] = { estado, ...(motivo ? { motivo } : {}), coletado_em: new Date().toISOString() }; };
  const segredos = () => [ctx.conexao?.access_token, ctx.conexao?.refresh_token, conexaoNova?.access_token, conexaoNova?.refresh_token, ...SECRETS.map((n) => env(n))]
    .filter((s) => typeof s === 'string' && s.length >= 8);
  // Última trava: nenhum texto para gente sai com um segredo dentro.
  const semSegredo = (t) => { let x = limparTexto(t, 300); for (const s of segredos()) x = x.split(s).join('[oculto]'); return x; };
  const fim = () => {
    for (const p of PARTES) if (partes[p]?.motivo) partes[p].motivo = semSegredo(partes[p].motivo);
    const conta = textoOuNull(ctx.conexao?.conta) ?? dados.perfil?.local?.nome ?? dados.ga4?.propriedade?.nome ?? dados.search_console?.propriedade?.site ?? null;
    let estado = estadoGeral(partes);
    // Contrato: "se o tempo acabar, o estado é parcial". As partes ficam com
    // erro (para a coletora manter o retrato anterior), a fonte, parcial.
    if (faltouTempo && estado === 'erro') estado = 'parcial';
    // A coletora guarda no máximo 30 avisos; os primeiros são os das partes.
    const fora = { estado, conta, partes, dados, semanas, publicacoes, avisos: [...new Set(avisos.map(semSegredo))].filter(Boolean).slice(0, 30) };
    if (conexaoNova) fora.conexao = conexaoNova;
    return fora;
  };
  const todas = (estado, motivo) => PARTES.forEach((p) => marcar(p, estado, motivo));

  // 1. Configurado? Sem o client OAuth no Supabase não há o que tentar.
  const faltam = SECRETS.filter((n) => !env(n));
  if (faltam.length) { todas('falta_configurar', `Cadastre ${faltam.join(' e ')} em Edge Functions > Secrets do Supabase.`); return fim(); }

  // 2. Conectado? Sem refresh token não dá para renovar.
  const conexao = ctx.conexao;
  if (!conexao?.refresh_token && !tokenAindaVale(conexao)) { todas('falta_conectar', 'Falta conectar a conta Google: botão "Conectar Google" em Configurações > Marketing.'); return fim(); }

  // 3. Token: reaproveita o que ainda vale; senão renova UMA vez. Falha aqui
  //    para tudo, sem nenhuma outra chamada.
  let token = null, escopos = conexao.escopos;
  if (tokenAindaVale(conexao)) token = conexao.access_token;
  else {
    try {
      const nova = await renovar('google', conexao, envParaOauth(ctx), fetchParaOauth(ctx));
      const c = nova?.access_token ? nova : nova?.conexao;
      if (!c?.access_token) throw Object.assign(new Error('renovacao sem token'), { codigo: 'erro' });
      // O Google não manda refresh token novo na renovação: a conexão que volta
      // para o cofre não pode perder o que já estava lá.
      conexaoNova = { ...conexao, ...c, refresh_token: c.refresh_token ?? conexao.refresh_token };
      token = c.access_token;
      escopos = c.escopos ?? escopos;
    } catch (e) {
      const f = falhaDaRenovacao(e);
      log(`google: renovação do token falhou (${f.estado})`);
      // Falha passageira com um token que ainda vale uns minutos: coleta com
      // ele (a coleta inteira cabe em 110 s) em vez de parar tudo.
      if (f.estado === 'erro' && tokenAindaVale(conexao, 2 * 60 * 1000)) {
        token = conexao.access_token;
        avisos.push('Não deu para renovar a conexão com o Google agora; a coleta usou a de antes.');
      } else {
        todas(f.estado, f.motivo);
        return fim();
      }
    }
  }

  // 4. As três partes em paralelo (APIs diferentes, cotas diferentes); dentro
  //    de cada uma, uma chamada por vez. Escopo desmarcado nem é tentado.
  const liberada = escoposDaParte(escopos);
  const { chamar, st } = criarChamador(ctx, token);
  const canal = (cod) => lista(ctx.canais).find((c) => c?.codigo === cod) ?? null;
  const host = hostDe(canal('site')?.url_perfil ?? '') ?? 'impresilk.com.br';
  const medicoes = [...new Set([...lista(ctx.ga4Medicoes).filter((m) => /^G-[A-Z0-9]+$/i.test(String(m))), MEDICAO_GA4])];
  const resultados = {};
  const rodar = async (p, fn) => {
    if (liberada[p] === false) {
      marcar(p, 'falta_conectar', `A permissão do ${NOME_PARTE[p]} não foi concedida ao conectar. Reconecte e deixe a caixinha marcada.`);
      return;
    }
    try { resultados[p] = await fn(); }
    catch (e) {
      // Defeito nosso ao ler uma resposta: a parte vira erro, as outras seguem.
      resultados[p] = { estado: 'erro', motivo: `Falha ao ler a resposta do ${NOME_PARTE[p]}.`, dados: null, avisos: [] };
      log(`google ${p}: falha interna ${limparTexto(e?.message, 120)}`);
    }
    const r = resultados[p];
    // A coletora junta o retrato novo com o anterior parte por parte
    // (juntarRetrato): parte ok troca, parte parcial entra POR CIMA do
    // anterior, parte com erro mantém o anterior. Então:
    //  - parte sem dado nenhum não pode ser "parcial" (apagaria o retrato bom
    //    de ontem com null): vira erro, e o motivo diz que o tempo acabou;
    //  - numa parte parcial, o bloco que ficou sem coletar sai do objeto em
    //    vez de ir null, para o da coleta anterior continuar na tela.
    if (r.estado === 'parcial' && !r.dados) r.estado = 'erro';
    if (r.motivo === MOTIVO_SEM_TEMPO) faltouTempo = true;
    if (r.estado === 'parcial' && objeto(r.dados)) for (const k of Object.keys(r.dados)) if (r.dados[k] === null) delete r.dados[k];
    marcar(p, r.estado, r.motivo);
    dados[p] = r.dados ?? null;
    avisos.push(...lista(r.avisos));
  };
  await Promise.all([
    rodar('ga4', () => coletarGa4(ctx, chamar, j, { medicoes, host, anterior: ctx.anterior })),
    rodar('search_console', () => coletarSearchConsole(ctx, chamar, j, { host, anterior: ctx.anterior })),
    rodar('perfil', () => coletarPerfil(ctx, chamar, j, { host, urlCanal: canal('google')?.url_perfil ?? null, anterior: ctx.anterior })),
  ]);
  // Token morto no meio (401): a parte que não chegou a ver o 401 também não
  // tem dado confiável desta coleta.
  if (st.tokenMorto) {
    for (const p of PARTES) {
      if (partes[p].estado !== 'falta_conectar' && !dados[p]) marcar(p, 'reconectar', 'O Google recusou o acesso. Reconecte a conta Google em Configurações.');
    }
  }

  // 5. Números da semana e publicações, só para os canais ativos.
  const ativo = (cod) => !Array.isArray(ctx.canais) || !!canal(cod);
  if (ativo('site')) semanas.push(...semanasDoSite(dados.ga4, dados.search_console, j, { desdeEventosChave: resultados.ga4?.interno?.desdeEventosChave }));
  if (ativo('google')) {
    semanas.push(...semanasDoGoogle(dados.perfil, j));
    publicacoes = publicacoesDoPerfil(dados.perfil);
  }
  log(`google: ${PARTES.map((p) => `${p} ${partes[p].estado}`).join(', ')}; ${st.chamadas} chamadas`);
  return fim();
}
