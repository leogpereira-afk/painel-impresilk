/* CONECTOR DO GOOGLE ADS: o que a conta de anúncios da Impresilk gastou e trouxe.
 *
 * Etapa i do Marketing (integrações, 11/10/2026). O contrato está em
 * docs/marketing/integracoes-contrato.md. A pesquisa da API, com a
 * contraprova, ficou fora do repositório (integracoes-pesquisa.json, chave
 * "google-ads"); onde as duas discordaram, valeu a contraprova.
 *
 * COMO ENTRA. Conta de serviço, o caminho que o próprio Google recomenda para
 * quem lê a conta que já é sua: o JSON da chave vai no secret
 * GOOGLE_ADS_SA_JSON e a conta de serviço entra no Google Ads como usuária
 * "Somente leitura". A cada coleta o conector assina um JWT RS256 com a chave
 * e troca por um token de 1 hora. Não há refresh token nem botão Conectar, e
 * por isso nada vai para o cofre: o retorno nunca traz "conexao".
 *  - NÃO manda o cabeçalho developer-token. O Google encerrou o developer
 *    token em 09/09/2026: hoje ele é ignorado e uma versão futura vai
 *    recusá-lo. Quem dá o nível de acesso (Test, Explorer, Basic) é o projeto
 *    do Google Cloud dono da conta de serviço.
 *  - O customer id sai do customers:listAccessibleCustomers. Se o Léo
 *    cadastrar GOOGLE_ADS_CUSTOMER_ID (e GOOGLE_ADS_LOGIN_CUSTOMER_ID, quando
 *    o acesso passa pela conta de uma agência), vale o cadastrado.
 *  - Só leitura: só GoogleAdsService.Search. Nenhum mutate, nunca.
 *  - Cota do nível Explorer: 2.880 operações por dia. Cada consulta conta 1,
 *    por maior que seja; as páginas seguintes (pageToken) não contam. Uma
 *    coleta inteira gasta umas 30. As consultas vão em fila, uma de cada vez,
 *    porque o limite por segundo do Google é variável.
 *  - Consulta recusada (campo que a API não aceita naquela versão) vira aviso
 *    e null, sem derrubar o resto. As que têm campo mais arriscado levam uma
 *    "reserva", com menos campos, tentada uma vez.
 *  - Erro de credencial, de aprovação ou de acesso PARA a coleta na hora:
 *    repetir com a credencial morta só gasta cota e não muda a resposta.
 *
 * O ctx.fetchJson (criarBuscador, em coletora.mjs) devolve o corpo já lido e
 * LANÇA o erro (ErroFonte com .status, .codigo e .corpo). O conector também
 * aceita {status, ok, json} e erro devolvido, para não depender desse
 * detalhe. O body vai sempre como texto pronto, com o Content-Type certo (o
 * do token é formulário, não JSON). ctx.prazo() é em milissegundos.
 *
 * A GUARDA DOS LEADS precisa da coleta anterior em ctx.anterior (ver leads no
 * FORMATO): a coletora junta parte por parte, e uma parte boa troca a
 * anterior inteira.
 *
 * ============================================================== FORMATO ==
 * O "dados" que a tela recebe (painel_cache, chave mkt_fonte_google_ads).
 *
 * Regras gerais:
 *  - Cada chave de "dados" é uma PARTE, com o mesmo nome em "partes". Parte
 *    que falhou não vem em "dados" (vem em "partes" com estado "erro", motivo,
 *    codigo e coletado_em null): a coletora mantém a parte da coleta anterior.
 *  - partes[parte] = { estado, motivo?, codigo?, coletado_em }. motivo é FRASE
 *    para gente, em português (MOTIVOS e AVISO), para a tela mostrar como
 *    texto; codigo é o código curto do mesmo caso (nunca para mostrar). Os
 *    dois vêm juntos, ou nenhum (parte ok). Códigos do quadro: falhou,
 *    sem_tempo, grande_demais, limite_segundo, sem_resposta, recusada,
 *    parada (a frase diz por que a coleta parou). Na parte "conta", quando a
 *    coleta nem passou da porta (a parte leva o MESMO estado da fonte, e a
 *    frase não se repete em "avisos"): sem_secret, json_invalido, chave_formato,
 *    chave_recusada, token_recusado, token_pedido_invalido, token_sem_valor,
 *    api_desativada, projeto_sem_aprovacao, sem_contas, sem_acesso_na_conta,
 *    id_cliente_invalido, conta_desativada, sem_conta_comum, cota,
 *    limite_segundo, sem_resposta, permissao, outro.
 *  - Número não informado é null, nunca zero. O Google não manda linha quando
 *    todas as métricas dão zero; semana sem linha fica com os números null e
 *    atividade false, e dia sem linha fica fora da lista. A tela mostra "sem
 *    dado", não 0.
 *  - Dinheiro já vem na moeda da conta (dados.conta.moeda), com 2 casas: o
 *    conector divide os micros por 1.000.000.
 *  - Conversões são decimais (atribuição por dados) e mudam por dias depois
 *    do clique. Por isso as semanas são refeitas inteiras a cada coleta.
 *  - ctr é fração (0,05 quer dizer 5%). cpcMedio e custoPorConversao em
 *    dinheiro. Os três são recalculados das somas, nunca somados.
 *  - Parcela de impressões: {valor, menosDe10}. valor é a fração que o Google
 *    mandou; menosDe10 vem true quando o Google manda 0,0999, que é como ele
 *    diz "abaixo de 10%" sem dizer quanto. A tela escreve "menos de 10%", não
 *    "9,99%". Parcela PERDIDA: {valor, maisDe90}, com 0,9001 querendo dizer
 *    "mais de 90%".
 *  - DADO PESSOAL (leads de formulário, DDD de quem ligou, e-mail de quem
 *    mexeu na conta) mora SEMPRE numa chave "restrito" dentro da parte. A
 *    porta painel-marketing tira toda chave "restrito" para quem não é gestão
 *    (LGPD); o resto da parte pode ir para todos.
 *  - Período: dados.conta.periodo. "inicio" é a segunda-feira de 8 semanas
 *    atrás e "fim" é ontem (fuso de São Paulo; os dias do relatório seguem o
 *    fuso da conta, que é avisado quando for outro). Listas sem dia (grupos,
 *    anúncios, palavras, termos, cidades, páginas, horários, público) somam o
 *    período inteiro.
 *  - Listas longas têm teto (TETO, logo abaixo), em ordem de gasto, cliques e
 *    impressões; o que ficou de fora é contado em "cortados".
 *
 * Métricas comuns ({...metricas} abaixo): impressoes, cliques, gasto,
 * conversoes, valorConversoes, ctr, cpcMedio, custoPorConversao.
 *
 *  conta: {id, idFormatado ("123-456-7890"), nome, moeda, fuso, teste,
 *    tag (o número da tag AW- da conta), tagConfere (true se é a AW-11004527401
 *    do site), viaGerente ("555-000-1111", a conta de agência, ou null),
 *    relatorioChamadas (true, false ou null), versaoApi, consultas,
 *    periodo: {inicio, fim, semanas: [8 segundas-feiras fechadas], semanaAtual}}
 *    A tela mostra idFormatado: a coletora esconde no cache todo valor que
 *    saiu de um secret, e o id puro chega "[oculto]" quando o Léo cadastrou
 *    GOOGLE_ADS_CUSTOMER_ID.
 *  resumo: {
 *    semanas: [{semana (a segunda-feira), fechada, atividade,
 *      numeros: {seguidores, alcance, impressoes, engajamento, cliques,
 *                conversas, leads}  (ver NÚMEROS DA SEMANA),
 *      impressoes, cliques, interacoes, gasto, conversoes, valorConversoes,
 *      todasConversoes, ctr, cpcMedio, custoPorConversao, parcelaImpressoes,
 *      ligacoes, contatos, cliquesInvalidos, taxaCliquesInvalidos,
 *      ligacoesPeloAnuncio, rotas, siteDaLoja}],
 *      As 8 fechadas e a semana corrente (fechada false, até ontem).
 *    regras: {leads: 'categorias' | 'total' | null,
 *             conversas: 'ligacoes_e_contato' | 'ligacoes' | 'contato' | null},
 *    totais: {impressoes, cliques, interacoes, gasto, conversoes,
 *             valorConversoes, todasConversoes, ctr, cpcMedio, custoPorConversao}
 *      (o período inteiro, da segunda de 8 semanas atrás até ontem),
 *    dias: [{data, impressoes, cliques, interacoes, gasto, conversoes,
 *            valorConversoes, todasConversoes, ctr, cpcMedio, custoPorConversao}] | null,
 *    aparelhos: [{aparelho (MOBILE, DESKTOP...), rede (SEARCH, CONTENT...),
 *                 interacoes, ...metricas}] | null}
 *  campanhas: {lista: [{id, nome, status, situacao (primary_status), motivos,
 *    veiculacao, tipo (SEARCH, PERFORMANCE_MAX...), subtipo, lance, inicio,
 *    fim, otimizacao (0 a 1), orcamento: {valor, periodo, entrega,
 *    recomendado} | null,
 *    totais: {interacoes, todasConversoes, ligacoes, ...metricas},
 *    dias: [{data, impressoes, cliques, gasto, conversoes, valorConversoes,
 *            ligacoes}],
 *    parcela: [{semana, impressoes, topo, topoAbsoluto (parcelas),
 *               perdidaOrcamento, perdidaClassificacao (parcelas perdidas)}] | null,
 *    alcance (usuários únicos no período, só Display e Vídeo) | null,
 *    video: {visualizacoes, taxaVisualizacao, cpvMedio, quartis: {p25, p50,
 *            p75, p100}, curtidas, comentarios, compartilhamentos} | null,
 *    display: {parcela, perdidaOrcamento, perdidaClassificacao} | null}],
 *    cortadas}
 *    Campanha removida que gastou no período aparece (status REMOVED).
 *    ligacoes null quer dizer "campanha sem ligação no período" ou "consulta
 *    recusada" (o aviso diz qual).
 *  grupos: {lista: [{id, nome, status, tipo, situacao, campanhaId, campanha,
 *    interacoes, ligacoes, ...metricas}], cortados}
 *  anuncios: {lista: [{id, nome, tipo, link, links, titulos, descricoes,
 *    caminho, status, situacao, forca, aprovacao, grupoId, grupo, campanhaId,
 *    campanha, interacoes, ...metricas}], cortados}
 *  palavras: {lista: [{id, texto, correspondencia, status, veiculacao,
 *    aprovacao, qualidade: {nota (1 a 10), anuncio, pagina, ctrEsperado} | null,
 *    lanceCpc, cpcPrimeiraPagina, grupoId, grupo, campanhaId, campanha,
 *    parcelaImpressoes, ...metricas}], cortadas}
 *  termos: {
 *    lista: [{termo, status, campanhaId, campanha, grupos: [nomes],
 *             palavras: [{texto, correspondencia}], tiposCorrespondencia,
 *             ...metricas}],  (campanhas de Pesquisa; Performance Max fica fora)
 *    cortados: {quantidade, impressoes, cliques, gasto, conversoes} | null,
 *    outros: [{campanhaId, campanha, impressoes, cliques, gasto, conversoes}] | null,
 *      "Outros termos": a diferença entre o total da campanha de Pesquisa e a
 *      soma dos termos. O Google esconde os termos com pouca busca, então a
 *      soma nunca fecha; a tela mostra a diferença numa linha "outros termos".
 *    pmax: [{termo, campanhaId, campanha, ...metricas}] | null,
 *    smart: [{termo, campanhaId, campanha, impressoes, cliques, gasto}] | null,
 *    categorias: [{categoria, impressoes, cliques, conversoes,
 *                  volume: {min, max} | null}] | null}
 *      volume é FAIXA ("entre min e max buscas"), nunca um número só.
 *  conversoes: {
 *    acoes: [{id, nome, tipo, categoria, status, origem, principal,
 *             contaNasConversoes, contagem, valorPadrao, moeda,
 *             janelaCliqueDias, atribuicao, eventoGa4, todasConversoesHistorico,
 *             ultimaConversao}],
 *    semanas: [{semana, acaoId, acao, categoria, conversoes, valorConversoes,
 *               todasConversoes}],
 *    porCampanha: [{campanhaId, campanha, acao, categoria, conversoes,
 *                   valorConversoes, todasConversoes}] | null}
 *  chamadas: {ligado, total, recebidas, perdidas, duracaoMedia (segundos),
 *    porDia: [{data, total, recebidas, perdidas}],
 *    restrito: {lista: [{inicio, fim, duracao, status, tipo, ddd, pais,
 *                        origem, campanhaId, campanha}]}}
 *    ligado false: o relatório de chamadas está desligado na conta; aí os
 *    números vêm null. A lista guarda as TETO.chamadas mais recentes.
 *  leads: {total, novos, ultimos60, porDia: [{data, leads}],
 *    porCampanha: [{campanha, leads}],
 *    restrito: {porId: {<id>: {id, data, campanhaId, campanha, grupo, gclid,
 *               campos: [{tipo, valor}], perguntas: [{pergunta, valor}],
 *               vistoEm}}}}
 *    O Google apaga o lead do formulário depois de 60 dias. O conector só lê;
 *    a guarda é o próprio "dados": cada lead entra por id na primeira vez que
 *    aparece (vistoEm) e nunca sai. Para isso a coletora passa a coleta
 *    anterior em ctx.anterior (o objeto do cache, ou só o "dados"); sem ela,
 *    lead com mais de 60 dias some. total conta o que está guardado; novos,
 *    o que entrou agora; ultimos60, o que o Google devolveu hoje.
 *  publico: {idade: [{faixa (AGE_RANGE_25_34...), ...metricas}],
 *            genero: [{genero (MALE, FEMALE, UNDETERMINED), ...metricas}]}
 *  locais: {cidades: [{geo, nome, nomeCompleto, tipo ('presenca' ou
 *    'interesse'), impressoes, cliques, gasto, conversoes, ctr, cpcMedio,
 *    custoPorConversao}], cortadas}  (nome null se a tradução falhou)
 *    presenca é onde a pessoa estava; interesse, a região que ela buscou. Não
 *    somar as duas: é a mesma impressão vista de dois jeitos.
 *  paginas: {lista: [{url, ...metricas}], cortadas}
 *  horarios: {grade: [{dia (MONDAY a SUNDAY), hora (0 a 23), impressoes,
 *    cliques, gasto, conversoes}]}  (só as casas que tiveram linha)
 *  pmax: {aplica, grupos: [{id, nome, status, campanhaId, campanha, ...metricas}]}
 *  organico: {lista: [{termo, cliquesOrganicos, impressoesOrganicas,
 *    consultasOrganicas, cliquesCombinados}], cortados}
 *    Só tem linha se a conta do Google Ads estiver vinculada ao Search Console.
 *  alteracoes: {total, porDia: [{data, total}], porTipo: [{recurso, operacao,
 *    total}], restrito: {lista: [{quando, recurso, operacao, campos, cliente,
 *    email}]}}  (últimos 30 dias, no máximo TETO.alteracoes)
 *
 * NÚMEROS DA SEMANA (resumo.semanas[].numeros). O Google Ads não tem canal
 * próprio: nada vai para painel_mkt_api_metricas nem para as publicações
 * ("semanas" e "publicacoes" do retorno saem sempre vazios). O gasto aparece
 * no canal site e na Visão geral, lido daqui. A régua:
 *  - seguidores: null. Anúncio não tem seguidor.
 *  - alcance: null. metrics.unique_users só existe em Display e Vídeo, não
 *    aceita segments.week e não soma entre semanas.
 *  - impressoes: metrics.impressions da conta na semana.
 *  - engajamento: metrics.interactions. Em anúncio de Pesquisa a interação É o
 *    clique; não é engajamento de rede social, e a tela diz isso.
 *  - cliques: metrics.clicks.
 *  - conversas: ligações pelo anúncio (metrics.phone_calls, somado das
 *    campanhas, porque não é aceito com FROM customer) mais as conversões das
 *    ações da categoria CONTACT (clique no WhatsApp, por exemplo). Sem
 *    ligação e sem ação de contato configuradas: null.
 *  - leads: soma das conversões das categorias de lead (CATEGORIAS_LEAD). Se
 *    nenhuma ação ativa tem categoria de lead, vale o total metrics.conversions
 *    (só ações primárias). resumo.regras diz qual régua valeu.
 *  Semana sem linha do Google (nada rodou): todos null e atividade false.
 */
import { somarDias, segundaDaSemana, hojeSP } from '../marketing.mjs';

export const FONTE = 'google_ads';
export const SECRETS = ['GOOGLE_ADS_SA_JSON'];
// Lidos pelo descobrir() quando existem; sem eles a coleta acha a conta
// sozinha (a que tem a tag AW- do site). Só a lista de nomes: a coletora
// grava os nomes no cache, a porta diz à tela se estão cadastrados e o "Como
// ligar" explica quando valem a pena (conexoes-passos.js).
export const SECRETS_OPCIONAIS = ['GOOGLE_ADS_CUSTOMER_ID', 'GOOGLE_ADS_LOGIN_CUSTOMER_ID'];

// Versão da API numa constante só. Cada versão principal dura uns 12 meses
// (a v25 vence em agosto de 2027) e a versão vencida passa a dar erro. Antes
// de trocar, refazer a conferência de compatibilidade dos campos (a pesquisa
// conferiu os desta v25 campo a campo).
export const VERSAO_API = 'v25';
const BASE = `https://googleads.googleapis.com/${VERSAO_API}`;
// Fixos de propósito: o token_uri que vem dentro do JSON não é usado, para um
// JSON adulterado não mandar a assinatura para outro lugar.
const URL_TOKEN = 'https://oauth2.googleapis.com/token';
const ESCOPO = 'https://www.googleapis.com/auth/adwords';
// O número da tag AW- que está no site (público no HTML de impresilk.com.br).
// Serve só para escolher, entre as contas que a credencial alcança, a que é a
// da Impresilk. NÃO é o customer id: usar este número na URL dá
// INVALID_CUSTOMER_ID.
export const TAG_AW = '11004527401';
export const SEMANAS_FECHADAS = 8;
// Páginas de 10.000 linhas. Cinco páginas é muito mais do que a conta de uma
// gráfica produz; passar disso é sinal de consulta errada, e o teto segura o
// tempo e o tamanho do cache.
export const MAX_PAGINAS = 5;
// Uma chamada pode levar até 20 s (timeout da coletora). Sem essa folga, a
// última consulta estoura o orçamento de 110 s e a coleta inteira se perde.
export const MARGEM_MS = 25_000;
// Contas olhadas na descoberta quando o customer id não foi cadastrado.
const MAX_CONTAS = 5;
export const TETO = {
  campanhas: 200, grupos: 300, anuncios: 200, palavras: 300, termos: 300, termosPmax: 200, cidades: 100,
  paginas: 100, organico: 200, chamadas: 500, alteracoes: 200, leads: 5000,
};
export const CATEGORIAS_LEAD = ['SUBMIT_LEAD_FORM', 'REQUEST_QUOTE', 'PHONE_CALL_LEAD', 'BOOK_APPOINTMENT', 'QUALIFIED_LEAD', 'CONVERTED_LEAD', 'IMPORTED_LEAD'];
export const CATEGORIAS_CONTATO = ['CONTACT'];
// Tipos de erro que param a coleta: a resposta não muda na consulta seguinte.
const PARA = new Set(['aprovacao', 'configuracao', 'conexao', 'credencial', 'cota', 'permissao']);
const ESTADO_DA_PARADA = { aprovacao: 'aguardando_aprovacao', configuracao: 'falta_configurar', conexao: 'falta_conectar', credencial: 'reconectar', permissao: 'falta_conectar' };

// ---------------------------------------------------------------- números --

/** int64 chega como texto ("10922"). Campo ausente é null, nunca zero. */
export function num(v) {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
const arred = (n, casas = 2) => (n == null ? null : Math.round(n * 10 ** casas) / 10 ** casas);
/** Dinheiro vem em micros (milionésimos da moeda da conta). */
export const dinheiro = (micros) => { const n = num(micros); return n == null ? null : arred(n / 1e6, 2); };
const dec = (v) => arred(num(v), 2);
const razao = (a, b, casas) => (a == null || b == null || b === 0 ? null : arred(a / b, casas));
const texto = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const idTexto = (v) => (v === null || v === undefined || v === '' ? null : String(v));

/** Parcela de impressões. O Google informa de 0,1 a 1; abaixo de 10% manda
 *  0,0999. Guarda o número que veio e marca menosDe10, para a tela escrever
 *  "menos de 10%" e não "9,99%". */
export function parcela(v) {
  const n = num(v);
  return n == null ? null : { valor: n, menosDe10: n < 0.1 };
}
/** Parcela PERDIDA (por orçamento ou classificação): de 0 a 0,9, e acima
 *  disso chega 0,9001. A pesquisa confirmou a régua só para a parcela ganha;
 *  aqui só se marca, o número fica como veio. */
export function parcelaPerdida(v) {
  const n = num(v);
  return n == null ? null : { valor: n, maisDe90: n > 0.9 };
}

// Soma com os números crus (gasto em micros), para não acumular arredondamento,
// e fecha no fim. O que nunca apareceu continua null.
const CAMPOS = {
  impressoes: 'impressions', cliques: 'clicks', interacoes: 'interactions', gasto: 'costMicros', conversoes: 'conversions',
  valorConversoes: 'conversionsValue', todasConversoes: 'allConversions', ligacoes: 'phoneCalls', impressoesTelefone: 'phoneImpressions',
};
const DECIMAIS = new Set(['conversoes', 'valorConversoes', 'todasConversoes']);
export const METRICAS = ['impressoes', 'cliques', 'gasto', 'conversoes', 'valorConversoes'];
function somarEm(acc, m, campos) {
  for (const k of campos) {
    const v = num(m?.[CAMPOS[k]]);
    if (v != null) acc[k] = (acc[k] ?? 0) + v;
  }
  return acc;
}
function fechar(acc, campos) {
  const out = {};
  for (const k of campos) {
    const v = acc[k] ?? null;
    out[k] = v == null ? null : k === 'gasto' ? arred(v / 1e6, 2) : DECIMAIS.has(k) ? arred(v, 2) : v;
  }
  const gasto = acc.gasto == null ? null : acc.gasto / 1e6;
  if (campos.includes('cliques') && campos.includes('impressoes')) out.ctr = razao(acc.cliques ?? null, acc.impressoes ?? null, 4);
  if (campos.includes('gasto') && campos.includes('cliques')) out.cpcMedio = razao(gasto, acc.cliques ?? null, 2);
  if (campos.includes('gasto') && campos.includes('conversoes')) out.custoPorConversao = razao(gasto, acc.conversoes ?? null, 2);
  return out;
}
/** Junta linhas pela chave, somando as métricas. `info` sai da primeira linha. */
function agrupar(linhas, chave, info, campos) {
  const mapa = new Map();
  for (const l of linhas) {
    const k = chave(l);
    if (k == null) continue;
    let g = mapa.get(k);
    if (!g) { g = { info: info(l), acc: {} }; mapa.set(k, g); }
    somarEm(g.acc, l.metrics, campos);
  }
  return [...mapa.values()].map((g) => ({ ...g.info, ...fechar(g.acc, campos) }));
}
const peso = (x) => [x.gasto ?? -1, x.cliques ?? -1, x.impressoes ?? -1];
function porPeso(a, b) {
  const pa = peso(a), pb = peso(b);
  for (let i = 0; i < pa.length; i++) if (pa[i] !== pb[i]) return pb[i] - pa[i];
  return 0;
}
/** Ordena pelo que mais pesou e corta no teto, contando o que ficou fora. */
function cortar(lista, teto) {
  const ordenada = [...lista].sort(porPeso);
  return { lista: ordenada.slice(0, teto), cortados: Math.max(0, ordenada.length - teto) };
}
const ultimoId = (nome) => (typeof nome === 'string' ? /\/(\d+)$/.exec(nome)?.[1] ?? null : null);

// ---------------------------------------------------------------- leitura --

/** O search devolve {results, nextPageToken}; o searchStream, uma LISTA de
 *  lotes [{results}]. Aceita os dois: as respostas da documentação são de
 *  searchStream e a coleta usa search (por causa da paginação com teto). */
export function lerLinhas(resposta) {
  if (Array.isArray(resposta)) return resposta.flatMap((lote) => (Array.isArray(lote?.results) ? lote.results : []));
  return Array.isArray(resposta?.results) ? resposta.results : [];
}

/** customers:listAccessibleCustomers -> ids (só as contas de acesso DIRETO;
 *  as filhas de uma conta de agência não aparecem aqui). */
export function lerContasAcessiveis(resposta) {
  const nomes = Array.isArray(resposta?.resourceNames) ? resposta.resourceNames : [];
  return [...new Set(nomes.map((n) => /^customers\/(\d{1,20})$/.exec(String(n))?.[1]).filter(Boolean))];
}

export function lerConta(linha, viaGerente = null) {
  const c = linha?.customer ?? {};
  const rel = c.callReportingSetting?.callReportingEnabled;
  return {
    id: idTexto(c.id), nome: texto(c.descriptiveName), moeda: texto(c.currencyCode), fuso: texto(c.timeZone),
    gerente: c.manager === true, teste: c.testAccount === true,
    tag: idTexto(c.conversionTrackingSetting?.conversionTrackingId),
    tagCruzada: idTexto(c.conversionTrackingSetting?.crossAccountConversionTrackingId),
    relatorioChamadas: typeof rel === 'boolean' ? rel : null,
    viaGerente,
  };
}

/** customer_client de uma conta de agência: as contas filhas que ela gerencia. */
export function lerFilhas(linhas) {
  return linhas.map((l) => l.customerClient ?? {}).filter((c) => num(c.level) === 1 && c.manager !== true)
    .map((c) => ({ id: idTexto(c.id), nome: texto(c.descriptiveName), teste: c.testAccount === true, status: c.status ?? null }))
    .filter((c) => c.id && (c.status == null || c.status === 'ENABLED'));
}

/** Entre as contas que a credencial alcança, a da Impresilk: a que tem a tag
 *  AW- do site. Sem nenhuma com a tag, a única conta comum (não agência), ou a
 *  primeira que não é de teste, com aviso. */
export function escolherConta(candidatas, tag = TAG_AW) {
  const comuns = candidatas.filter((c) => c && c.id && !c.gerente);
  if (!comuns.length) return null;
  const daTag = comuns.find((c) => c.tag === tag || c.tagCruzada === tag);
  if (daTag) return { conta: daTag, tagConfere: true, varias: comuns.length > 1 };
  const ordem = [...comuns].sort((a, b) => Number(a.teste) - Number(b.teste));
  return { conta: ordem[0], tagConfere: false, varias: comuns.length > 1 };
}

const CAMPOS_SEMANA = ['impressoes', 'cliques', 'interacoes', 'gasto', 'conversoes', 'valorConversoes', 'todasConversoes'];

/** FROM customer por segments.week: uma linha por semana com atividade. */
export function lerSemanasConta(linhas) {
  const mapa = new Map();
  for (const l of linhas) {
    const s = l.segments?.week;
    if (!s) continue;
    const g = mapa.get(s) ?? { acc: {}, parcela: null };
    somarEm(g.acc, l.metrics, CAMPOS_SEMANA);
    g.parcela = g.parcela ?? parcela(l.metrics?.searchImpressionShare);
    mapa.set(s, g);
  }
  return new Map([...mapa].map(([s, g]) => [s, { ...fechar(g.acc, CAMPOS_SEMANA), parcelaImpressoes: g.parcela }]));
}

export function lerDiasConta(linhas) {
  return agrupar(linhas, (l) => l.segments?.date ?? null, (l) => ({ data: l.segments.date }), CAMPOS_SEMANA)
    .sort((a, b) => a.data.localeCompare(b.data));
}

export function lerAparelhos(linhas) {
  return agrupar(linhas, (l) => `${l.segments?.device ?? ''}|${l.segments?.adNetworkType ?? ''}`,
    (l) => ({ aparelho: l.segments?.device ?? null, rede: l.segments?.adNetworkType ?? null }), ['interacoes', ...METRICAS]).sort(porPeso);
}

/** Cliques inválidos e conversões de local, por semana (consultas opcionais). */
export function lerExtrasSemana(linhas) {
  const mapa = new Map();
  for (const l of linhas) {
    const s = l.segments?.week;
    if (!s) continue;
    const m = l.metrics ?? {}, atual = mapa.get(s) ?? {};
    const pega = (campo, valor) => { if (valor != null) atual[campo] = valor; };
    pega('cliquesInvalidos', num(m.invalidClicks));
    pega('taxaCliquesInvalidos', num(m.invalidClickRate));
    pega('ligacoesPeloAnuncio', dec(m.allConversionsFromClickToCall));
    pega('rotas', dec(m.allConversionsFromDirections));
    pega('siteDaLoja', dec(m.allConversionsFromStoreWebsite));
    mapa.set(s, atual);
  }
  return mapa;
}

/** Campanhas sem segmento: TODAS as não removidas, mesmo as que não rodaram
 *  (com segmento no SELECT, campanha parada simplesmente some). */
export function lerCampanhasLista(linhas) {
  const mapa = new Map();
  for (const l of linhas) {
    const c = l.campaign ?? {}, o = l.campaignBudget ?? null, id = idTexto(c.id);
    if (!id) continue;
    mapa.set(id, {
      id, nome: texto(c.name), status: c.status ?? null, situacao: c.primaryStatus ?? null,
      motivos: Array.isArray(c.primaryStatusReasons) ? c.primaryStatusReasons : [], veiculacao: c.servingStatus ?? null,
      tipo: c.advertisingChannelType ?? null, subtipo: c.advertisingChannelSubType ?? null, lance: c.biddingStrategyType ?? null,
      inicio: texto(c.startDateTime), fim: texto(c.endDateTime), otimizacao: num(c.optimizationScore),
      orcamento: o ? { valor: dinheiro(o.amountMicros), periodo: o.period ?? null, entrega: o.deliveryMethod ?? null, recomendado: dinheiro(o.recommendedBudgetAmountMicros) } : null,
    });
  }
  return mapa;
}

/** Campanhas por dia. Sem filtro de status: campanha removida que gastou no
 *  período entra, senão a soma das campanhas não bate com a da conta. */
export function lerCampanhasDias(linhas) {
  const mapa = new Map();
  for (const l of linhas) {
    const c = l.campaign ?? {}, id = idTexto(c.id), data = l.segments?.date;
    if (!id || !data) continue;
    let g = mapa.get(id);
    if (!g) { g = { info: { id, nome: texto(c.name), status: c.status ?? null, tipo: c.advertisingChannelType ?? null }, dias: new Map() }; mapa.set(id, g); }
    const acc = g.dias.get(data) ?? {};
    somarEm(acc, l.metrics, CAMPOS_SEMANA);
    g.dias.set(data, acc);
  }
  return mapa;
}

/** Ligações por campanha e dia (consulta separada: metrics.phone_calls não
 *  pode ir junto com segments.device, e a consulta inteira seria recusada). */
export function lerLigacoes(linhas) {
  const porCampanha = new Map(), porSemana = new Map();
  for (const l of linhas) {
    const id = idTexto(l.campaign?.id), data = l.segments?.date;
    if (!id || !data) continue;
    const dias = porCampanha.get(id) ?? new Map();
    const ant = dias.get(data) ?? { ligacoes: 0, impressoesTelefone: 0 };
    const lig = num(l.metrics?.phoneCalls) ?? 0;
    dias.set(data, { ligacoes: ant.ligacoes + lig, impressoesTelefone: ant.impressoesTelefone + (num(l.metrics?.phoneImpressions) ?? 0) });
    porCampanha.set(id, dias);
    const s = segundaDaSemana(data);
    porSemana.set(s, (porSemana.get(s) ?? 0) + lig);
  }
  // Linha só vem quando alguma métrica não é zero: se veio, a conta mostra
  // telefone no anúncio.
  return { porCampanha, porSemana, temLigacao: porCampanha.size > 0 };
}

export function lerParcelas(linhas) {
  const mapa = new Map();
  for (const l of linhas) {
    const id = idTexto(l.campaign?.id), s = l.segments?.week, m = l.metrics ?? {};
    if (!id || !s) continue;
    const lista = mapa.get(id) ?? [];
    lista.push({
      semana: s, impressoes: parcela(m.searchImpressionShare), topo: parcela(m.searchTopImpressionShare),
      topoAbsoluto: parcela(m.searchAbsoluteTopImpressionShare), perdidaOrcamento: parcelaPerdida(m.searchBudgetLostImpressionShare),
      perdidaClassificacao: parcelaPerdida(m.searchRankLostImpressionShare),
    });
    mapa.set(id, lista);
  }
  for (const lista of mapa.values()) lista.sort((a, b) => a.semana.localeCompare(b.semana));
  return mapa;
}

/** metrics.unique_users: não soma entre campanhas nem entre períodos. */
export function lerAlcance(linhas) {
  const mapa = new Map();
  for (const l of linhas) {
    const id = idTexto(l.campaign?.id), n = num(l.metrics?.uniqueUsers);
    if (id && n != null) mapa.set(id, n);
  }
  return mapa;
}

export function lerVideo(linhas) {
  const mapa = new Map();
  for (const l of linhas) {
    const id = idTexto(l.campaign?.id), m = l.metrics ?? {};
    if (!id) continue;
    mapa.set(id, {
      visualizacoes: num(m.videoTrueviewViews), taxaVisualizacao: num(m.videoTrueviewViewRate), cpvMedio: dinheiro(m.trueviewAverageCpv),
      quartis: { p25: num(m.videoQuartileP25Rate), p50: num(m.videoQuartileP50Rate), p75: num(m.videoQuartileP75Rate), p100: num(m.videoQuartileP100Rate) },
      curtidas: num(m.youtubeLikes), comentarios: num(m.youtubeComments), compartilhamentos: num(m.youtubeShares),
    });
  }
  return mapa;
}

export function lerDisplay(linhas) {
  const mapa = new Map();
  for (const l of linhas) {
    const id = idTexto(l.campaign?.id), m = l.metrics ?? {};
    if (!id) continue;
    mapa.set(id, { parcela: parcela(m.contentImpressionShare), perdidaOrcamento: parcelaPerdida(m.contentBudgetLostImpressionShare), perdidaClassificacao: parcelaPerdida(m.contentRankLostImpressionShare) });
  }
  return mapa;
}

/** Junta tudo o que é de campanha numa lista só. `ligacoes` null = consulta
 *  das ligações recusada; uma campanha sem nenhuma linha de telefone no
 *  período fica com ligações null (não tem telefone), e as outras com 0 nos
 *  dias sem linha. */
export function montarCampanhas({ lista, dias, ligacoes = null, parcelas = null, alcance = null, video = null, display = null }) {
  const ids = new Set([...(lista?.keys() ?? []), ...(dias?.keys() ?? [])]);
  const fora = [];
  for (const id of ids) {
    const base = lista?.get(id) ?? { id, nome: null, status: null, situacao: null, motivos: [], veiculacao: null, tipo: null, subtipo: null, lance: null, inicio: null, fim: null, otimizacao: null, orcamento: null };
    const doDia = dias?.get(id);
    if (doDia) { base.nome = base.nome ?? doDia.info.nome; base.status = base.status ?? doDia.info.status; base.tipo = base.tipo ?? doDia.info.tipo; }
    const tel = ligacoes ? ligacoes.porCampanha.get(id) ?? null : null;
    const total = {};
    let ligTotal = tel ? 0 : null;
    const linhasDia = [];
    for (const [data, acc] of [...(doDia?.dias ?? new Map())].sort(([a], [b]) => a.localeCompare(b))) {
      for (const k of CAMPOS_SEMANA) if (acc[k] != null) total[k] = (total[k] ?? 0) + acc[k];
      const f = fechar(acc, METRICAS);
      const lig = tel ? tel.get(data)?.ligacoes ?? 0 : null;
      linhasDia.push({ data, impressoes: f.impressoes, cliques: f.cliques, gasto: f.gasto, conversoes: f.conversoes, valorConversoes: f.valorConversoes, ligacoes: lig });
    }
    // Dia com ligação e sem nenhum clique ou impressão ainda conta no total.
    if (tel) ligTotal = [...tel.values()].reduce((t, d) => t + d.ligacoes, 0);
    fora.push({
      ...base,
      totais: { ...fechar(total, CAMPOS_SEMANA), ligacoes: ligTotal },
      dias: linhasDia,
      parcela: parcelas ? parcelas.get(id) ?? [] : null,
      alcance: alcance ? alcance.get(id) ?? null : null,
      video: video ? video.get(id) ?? null : null,
      display: display ? display.get(id) ?? null : null,
    });
  }
  return fora.sort((a, b) => porPeso(a.totais, b.totais) || String(a.nome ?? '').localeCompare(String(b.nome ?? '')));
}

export function lerGrupos(linhas) {
  return agrupar(linhas, (l) => idTexto(l.adGroup?.id), (l) => ({
    id: idTexto(l.adGroup.id), nome: texto(l.adGroup.name), status: l.adGroup.status ?? null, tipo: l.adGroup.type ?? null,
    situacao: l.adGroup.primaryStatus ?? null, campanhaId: idTexto(l.campaign?.id), campanha: texto(l.campaign?.name),
  }), ['interacoes', 'ligacoes', ...METRICAS]);
}

const textosDe = (lista) => (Array.isArray(lista) ? lista.map((x) => texto(x?.text)).filter(Boolean) : []);
export function lerAnuncios(linhas) {
  return agrupar(linhas, (l) => (l.adGroupAd?.ad?.id ? `${l.adGroup?.id ?? ''}|${l.adGroupAd.ad.id}` : null), (l) => {
    const a = l.adGroupAd, ad = a.ad, rsa = ad.responsiveSearchAd ?? {};
    const links = Array.isArray(ad.finalUrls) ? ad.finalUrls.filter((u) => typeof u === 'string') : [];
    return {
      id: idTexto(ad.id), nome: texto(ad.name), tipo: ad.type ?? null, link: links[0] ?? null, links,
      titulos: textosDe(rsa.headlines), descricoes: textosDe(rsa.descriptions), caminho: [texto(rsa.path1), texto(rsa.path2)].filter(Boolean),
      status: a.status ?? null, situacao: a.primaryStatus ?? null, forca: a.adStrength ?? null, aprovacao: a.policySummary?.approvalStatus ?? null,
      grupoId: idTexto(l.adGroup?.id), grupo: texto(l.adGroup?.name), campanhaId: idTexto(l.campaign?.id), campanha: texto(l.campaign?.name),
    };
  }, ['interacoes', ...METRICAS]);
}

/** O criterion_id só é único dentro do grupo: a chave leva os dois. */
export function lerPalavras(linhas) {
  return agrupar(linhas, (l) => (l.adGroupCriterion?.criterionId ? `${l.adGroup?.id ?? ''}|${l.adGroupCriterion.criterionId}` : null), (l) => {
    const c = l.adGroupCriterion, q = c.qualityInfo;
    return {
      id: idTexto(c.criterionId), texto: texto(c.keyword?.text), correspondencia: c.keyword?.matchType ?? null,
      status: c.status ?? null, veiculacao: c.systemServingStatus ?? null, aprovacao: c.approvalStatus ?? null,
      qualidade: q ? { nota: num(q.qualityScore), anuncio: q.creativeQualityScore ?? null, pagina: q.postClickQualityScore ?? null, ctrEsperado: q.searchPredictedCtr ?? null } : null,
      lanceCpc: dinheiro(c.effectiveCpcBidMicros), cpcPrimeiraPagina: dinheiro(c.positionEstimates?.firstPageCpcMicros),
      grupoId: idTexto(l.adGroup?.id), grupo: texto(l.adGroup?.name), campanhaId: idTexto(l.campaign?.id), campanha: texto(l.campaign?.name),
      parcelaImpressoes: parcela(l.metrics?.searchImpressionShare),
    };
  }, METRICAS);
}

/** Termos de pesquisa somados por campanha e termo. O mesmo termo vem em
 *  linhas diferentes (um grupo, uma palavra-chave), e a tela quer uma linha
 *  por termo. Devolve também a soma CRUA por campanha, para a conta dos
 *  "outros termos" não depender do teto da lista. */
export function lerTermos(linhas) {
  const mapa = new Map(), porCampanha = new Map();
  for (const l of linhas) {
    const termo = texto(l.searchTermView?.searchTerm ?? l.campaignSearchTermView?.searchTerm ?? l.smartCampaignSearchTermView?.searchTerm);
    const cid = idTexto(l.campaign?.id);
    if (!termo) continue;
    const k = `${cid ?? ''}|${termo.toLowerCase()}`;
    let g = mapa.get(k);
    if (!g) {
      g = { info: { termo, status: l.searchTermView?.status ?? null, campanhaId: cid, campanha: texto(l.campaign?.name) }, grupos: new Set(), palavras: new Map(), tipos: new Set(), acc: {} };
      mapa.set(k, g);
    }
    if (texto(l.adGroup?.name)) g.grupos.add(l.adGroup.name.trim());
    const kw = l.segments?.keyword?.info;
    if (texto(kw?.text)) g.palavras.set(`${kw.text}|${kw.matchType ?? ''}`, { texto: kw.text, correspondencia: kw.matchType ?? null });
    if (l.segments?.searchTermMatchType) g.tipos.add(l.segments.searchTermMatchType);
    somarEm(g.acc, l.metrics, METRICAS);
    if (cid) somarEm(porCampanha.get(cid) ?? porCampanha.set(cid, {}).get(cid), l.metrics, METRICAS);
  }
  const lista = [...mapa.values()].map((g) => ({ ...g.info, grupos: [...g.grupos], palavras: [...g.palavras.values()], tiposCorrespondencia: [...g.tipos], ...fechar(g.acc, METRICAS) }));
  return { lista, porCampanha };
}

/** "Outros termos": total da campanha de Pesquisa menos a soma dos termos. A
 *  diferença é o que o Google esconde por privacidade (termos com pouca busca).
 *  Nunca fica negativa; métrica que falta no total da campanha fica null. */
export function outrosTermos(campanhas, somaTermos) {
  const fora = [];
  for (const c of campanhas) {
    const tot = c.totais ?? {};
    // Campanha que não rodou no período não tem termo escondido: fora.
    if (c.tipo !== 'SEARCH' || (tot.impressoes == null && tot.cliques == null && tot.gasto == null)) continue;
    const t = somaTermos.get(c.id) ?? {};
    const dif = (k, crua) => {
      const total = tot[k];
      if (total == null) return null;
      const soma = t[k] == null ? 0 : (k === 'gasto' ? t[k] / 1e6 : t[k]);
      const d = Math.max(0, total - soma);
      return crua ? d : arred(d, 2);
    };
    fora.push({ campanhaId: c.id, campanha: c.nome, impressoes: dif('impressoes', true), cliques: dif('cliques', true), gasto: dif('gasto'), conversoes: dif('conversoes') });
  }
  return fora;
}

export function lerCategorias(linhas) {
  return linhas.map((l) => {
    const i = l.customerSearchTermInsight ?? l.campaignSearchTermInsight ?? {}, m = l.metrics ?? {}, v = m.searchVolume;
    return {
      categoria: texto(i.categoryLabel), impressoes: num(m.impressions), cliques: num(m.clicks), conversoes: dec(m.conversions),
      volume: v && (v.min != null || v.max != null) ? { min: num(v.min), max: num(v.max) } : null,
    };
  }).sort(porPeso);
}

export function lerAcoesConversao(linhas) {
  return linhas.map((l) => {
    const a = l.conversionAction ?? {}, m = l.metrics ?? {};
    return {
      id: idTexto(a.id), nome: texto(a.name), tipo: a.type ?? null, categoria: a.category ?? null, status: a.status ?? null,
      origem: a.origin ?? null, principal: typeof a.primaryForGoal === 'boolean' ? a.primaryForGoal : null,
      contaNasConversoes: typeof a.includeInConversionsMetric === 'boolean' ? a.includeInConversionsMetric : null,
      contagem: a.countingType ?? null, valorPadrao: num(a.valueSettings?.defaultValue), moeda: texto(a.valueSettings?.defaultCurrencyCode),
      janelaCliqueDias: num(a.clickThroughLookbackWindowDays), atribuicao: a.attributionModelSettings?.attributionModel ?? null,
      eventoGa4: texto(a.googleAnalytics4Settings?.eventName), todasConversoesHistorico: dec(m.allConversions),
      ultimaConversao: texto(m.conversionLastConversionDate),
    };
  }).filter((a) => a.id);
}

/** Conversões por ação e semana. Segmentado por ação, o Google só aceita
 *  métricas de conversão e some com a linha sem conversão. */
export function lerConversoesSemana(linhas) {
  return linhas.map((l) => {
    const s = l.segments ?? {}, m = l.metrics ?? {};
    return {
      semana: s.week ?? null, acaoId: ultimoId(s.conversionAction), acao: texto(s.conversionActionName), categoria: s.conversionActionCategory ?? null,
      conversoes: dec(m.conversions), valorConversoes: dec(m.conversionsValue), todasConversoes: dec(m.allConversions),
    };
  }).filter((x) => x.semana).sort((a, b) => a.semana.localeCompare(b.semana) || String(a.acao).localeCompare(String(b.acao)));
}

export function lerConversoesCampanha(linhas) {
  return linhas.map((l) => {
    const s = l.segments ?? {}, m = l.metrics ?? {};
    return {
      campanhaId: idTexto(l.campaign?.id), campanha: texto(l.campaign?.name), acao: texto(s.conversionActionName), categoria: s.conversionActionCategory ?? null,
      conversoes: dec(m.conversions), valorConversoes: dec(m.conversionsValue), todasConversoes: dec(m.allConversions),
    };
  });
}

/** call_view não tem métrica nem segmento: uma linha por ligação. O DDD vem
 *  null quando a ligação dura menos de 15 s. */
export function lerChamadas(linhas) {
  const lista = linhas.map((l) => {
    const c = l.callView ?? {};
    return {
      inicio: texto(c.startCallDateTime), fim: texto(c.endCallDateTime), duracao: num(c.callDurationSeconds), status: c.callStatus ?? null,
      tipo: c.type ?? null, ddd: texto(c.callerAreaCode), pais: texto(c.callerCountryCode), origem: c.callTrackingDisplayLocation ?? null,
      campanhaId: idTexto(l.campaign?.id), campanha: texto(l.campaign?.name),
    };
  }).filter((c) => c.inicio).sort((a, b) => b.inicio.localeCompare(a.inicio));
  return lista;
}

export function resumirChamadas(lista, ligado) {
  if (ligado === false) return { ligado: false, total: null, recebidas: null, perdidas: null, duracaoMedia: null, porDia: [] };
  const dias = new Map();
  let recebidas = 0, perdidas = 0, soma = 0, comDuracao = 0;
  for (const c of lista) {
    const d = c.inicio.slice(0, 10), g = dias.get(d) ?? { data: d, total: 0, recebidas: 0, perdidas: 0 };
    g.total++;
    if (c.status === 'RECEIVED') { g.recebidas++; recebidas++; if (c.duracao != null) { soma += c.duracao; comDuracao++; } }
    if (c.status === 'MISSED') { g.perdidas++; perdidas++; }
    dias.set(d, g);
  }
  return { ligado, total: lista.length, recebidas, perdidas, duracaoMedia: comDuracao ? Math.round(soma / comDuracao) : null, porDia: [...dias.values()].sort((a, b) => a.data.localeCompare(b.data)) };
}

export function lerLeads(linhas) {
  return linhas.map((l) => {
    const d = l.leadFormSubmissionData ?? {};
    return {
      id: idTexto(d.id), data: texto(d.submissionDateTime), campanhaId: idTexto(l.campaign?.id), campanha: texto(l.campaign?.name),
      grupo: texto(l.adGroup?.name), gclid: texto(d.gclid),
      campos: (Array.isArray(d.leadFormSubmissionFields) ? d.leadFormSubmissionFields : []).map((f) => ({ tipo: f?.fieldType ?? null, valor: texto(f?.fieldValue) })),
      perguntas: (Array.isArray(d.customLeadFormSubmissionFields) ? d.customLeadFormSubmissionFields : []).map((f) => ({ pergunta: texto(f?.questionText), valor: texto(f?.fieldValue) })),
    };
  }).filter((l) => l.id);
}

/** A GUARDA DOS LEADS. O Google apaga o lead depois de 60 dias; aqui o que já
 *  foi visto nunca sai, e o primeiro registro de cada id vale (vistoEm é o dia
 *  em que apareceu). Passou do teto, saem os mais antigos (o teto é alto de
 *  propósito: é para segurar um erro, não para podar). */
export function juntarLeads(anteriores, novos, hoje) {
  const porId = {};
  for (const [id, l] of Object.entries(anteriores && typeof anteriores === 'object' ? anteriores : {})) if (l && typeof l === 'object') porId[id] = l;
  let entraram = 0;
  for (const l of novos) {
    if (!l.id || porId[l.id]) continue;
    porId[l.id] = { ...l, vistoEm: hoje };
    entraram++;
  }
  const ids = Object.keys(porId);
  if (ids.length > TETO.leads) {
    ids.sort((a, b) => String(porId[b].data ?? '').localeCompare(String(porId[a].data ?? '')));
    for (const id of ids.slice(TETO.leads)) delete porId[id];
  }
  return { porId, novos: entraram };
}

export function resumirLeads(porId) {
  const dias = new Map(), camp = new Map();
  for (const l of Object.values(porId)) {
    const d = String(l.data ?? '').slice(0, 10);
    if (d) dias.set(d, (dias.get(d) ?? 0) + 1);
    const c = l.campanha ?? '(sem campanha)';
    camp.set(c, (camp.get(c) ?? 0) + 1);
  }
  return {
    porDia: [...dias].map(([data, leads]) => ({ data, leads })).sort((a, b) => a.data.localeCompare(b.data)),
    porCampanha: [...camp].map(([campanha, leads]) => ({ campanha, leads })).sort((a, b) => b.leads - a.leads),
  };
}

export function lerIdade(linhas) {
  return agrupar(linhas, (l) => l.adGroupCriterion?.ageRange?.type ?? null, (l) => ({ faixa: l.adGroupCriterion.ageRange.type }), METRICAS)
    .sort((a, b) => a.faixa.localeCompare(b.faixa));
}
export function lerGenero(linhas) {
  return agrupar(linhas, (l) => l.adGroupCriterion?.gender?.type ?? null, (l) => ({ genero: l.adGroupCriterion.gender.type }), METRICAS).sort(porPeso);
}

const TIPO_LOCAL = { LOCATION_OF_PRESENCE: 'presenca', AREA_OF_INTEREST: 'interesse' };
export function lerCidades(linhas) {
  return agrupar(linhas, (l) => (l.segments?.geoTargetCity ? `${l.segments.geoTargetCity}|${l.geographicView?.locationType ?? ''}` : null), (l) => ({
    geo: l.segments.geoTargetCity, nome: null, nomeCompleto: null,
    tipo: TIPO_LOCAL[l.geographicView?.locationType] ?? l.geographicView?.locationType ?? null,
  }), ['impressoes', 'cliques', 'gasto', 'conversoes']);
}
export function lerNomesGeo(linhas) {
  const mapa = new Map();
  for (const l of linhas) {
    const g = l.geoTargetConstant ?? {};
    if (g.resourceName) mapa.set(g.resourceName, { nome: texto(g.name), nomeCompleto: texto(g.canonicalName) });
  }
  return mapa;
}

export function lerPaginas(linhas) {
  return agrupar(linhas, (l) => texto(l.landingPageView?.unexpandedFinalUrl), (l) => ({ url: l.landingPageView.unexpandedFinalUrl.trim() }), METRICAS);
}

const DIAS_SEMANA = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
export function lerHorarios(linhas) {
  return agrupar(linhas, (l) => (l.segments?.dayOfWeek && num(l.segments?.hour) != null ? `${l.segments.dayOfWeek}|${num(l.segments.hour)}` : null),
    (l) => ({ dia: l.segments.dayOfWeek, hora: num(l.segments.hour) }), ['impressoes', 'cliques', 'gasto', 'conversoes'])
    .map(({ dia, hora, impressoes, cliques, gasto, conversoes }) => ({ dia, hora, impressoes, cliques, gasto, conversoes }))
    .sort((a, b) => DIAS_SEMANA.indexOf(a.dia) - DIAS_SEMANA.indexOf(b.dia) || a.hora - b.hora);
}

export function lerPmax(linhas) {
  return agrupar(linhas, (l) => idTexto(l.assetGroup?.id), (l) => ({
    id: idTexto(l.assetGroup.id), nome: texto(l.assetGroup.name), status: l.assetGroup.status ?? null, campanhaId: idTexto(l.campaign?.id), campanha: texto(l.campaign?.name),
  }), METRICAS).sort(porPeso);
}

export function lerOrganico(linhas) {
  const mapa = new Map();
  for (const l of linhas) {
    const t = texto(l.paidOrganicSearchTermView?.searchTerm), m = l.metrics ?? {};
    if (!t) continue;
    const g = mapa.get(t.toLowerCase()) ?? { termo: t, cliquesOrganicos: null, impressoesOrganicas: null, consultasOrganicas: null, cliquesCombinados: null };
    const soma = (k, v) => { const n = num(v); if (n != null) g[k] = (g[k] ?? 0) + n; };
    soma('cliquesOrganicos', m.organicClicks); soma('impressoesOrganicas', m.organicImpressions);
    soma('consultasOrganicas', m.organicQueries); soma('cliquesCombinados', m.combinedClicks);
    mapa.set(t.toLowerCase(), g);
  }
  return [...mapa.values()].sort((a, b) => (b.cliquesCombinados ?? -1) - (a.cliquesCombinados ?? -1) || (b.impressoesOrganicas ?? -1) - (a.impressoesOrganicas ?? -1));
}

export function lerAlteracoes(linhas) {
  return linhas.map((l) => {
    const c = l.changeEvent ?? {};
    const campos = typeof c.changedFields === 'string' ? c.changedFields.split(',').map((x) => x.trim()).filter(Boolean)
      : Array.isArray(c.changedFields?.paths) ? c.changedFields.paths : [];
    return { quando: texto(c.changeDateTime), recurso: c.changeResourceType ?? null, operacao: c.resourceChangeOperation ?? null, campos, cliente: c.clientType ?? null, email: texto(c.userEmail) };
  }).filter((x) => x.quando).sort((a, b) => b.quando.localeCompare(a.quando));
}

export function resumirAlteracoes(lista) {
  const dias = new Map(), tipos = new Map();
  for (const a of lista) {
    const d = a.quando.slice(0, 10);
    dias.set(d, (dias.get(d) ?? 0) + 1);
    const k = `${a.recurso}|${a.operacao}`, t = tipos.get(k) ?? { recurso: a.recurso, operacao: a.operacao, total: 0 };
    t.total++;
    tipos.set(k, t);
  }
  return {
    total: lista.length,
    porDia: [...dias].map(([data, total]) => ({ data, total })).sort((a, b) => a.data.localeCompare(b.data)),
    porTipo: [...tipos.values()].sort((a, b) => b.total - a.total),
  };
}

// ------------------------------------------------- os números da semana --

/** As semanas da conta com a régua dos números da semana (ver o FORMATO).
 *  conta: Map semana -> números (lerSemanasConta). conversoes: linhas de
 *  lerConversoesSemana, ou null se a consulta falhou. acoes: lerAcoesConversao
 *  ou null. ligacoes: lerLigacoes ou null. extras: lerExtrasSemana ou null. */
export function montarSemanas({ per, conta, conversoes = null, acoes = null, ligacoes = null, extras = null }) {
  // Que categorias contam nas conversões: as das ações ativas e primárias; sem
  // a lista de ações, as que apareceram nas linhas.
  let cats = null;
  if (acoes) cats = new Set(acoes.filter((a) => a.status === 'ENABLED' && a.contaNasConversoes !== false).map((a) => a.categoria));
  else if (conversoes) cats = new Set(conversoes.map((x) => x.categoria));
  const temLead = cats ? CATEGORIAS_LEAD.some((k) => cats.has(k)) : null;
  const temContato = cats ? CATEGORIAS_CONTATO.some((k) => cats.has(k)) : null;
  const regraLeads = temLead === null ? null : temLead ? (conversoes ? 'categorias' : null) : 'total';
  const temLigacao = ligacoes ? ligacoes.temLigacao : null;
  let regraConversas = null;
  if (ligacoes && temContato !== null) {
    if (temLigacao && temContato) regraConversas = conversoes ? 'ligacoes_e_contato' : null;
    else if (temLigacao) regraConversas = 'ligacoes';
    else if (temContato) regraConversas = conversoes ? 'contato' : null;
  }
  const somaCat = (s, lista) => arred(conversoes.filter((x) => x.semana === s && lista.includes(x.categoria)).reduce((t, x) => t + (x.conversoes ?? 0), 0), 2);
  const semanas = [...per.semanas, per.semanaAtual].map((s) => {
    const l = conta.get(s) ?? null;
    const ativa = !!l;
    const ligSemana = ativa && ligacoes && temLigacao ? ligacoes.porSemana.get(s) ?? 0 : null;
    const contatos = ativa && conversoes && temContato ? somaCat(s, CATEGORIAS_CONTATO) : null;
    const leads = !ativa ? null : regraLeads === 'categorias' ? somaCat(s, CATEGORIAS_LEAD) : regraLeads === 'total' ? l.conversoes : null;
    const conversas = !ativa || !regraConversas ? null : arred((regraConversas === 'contato' ? 0 : ligSemana) + (regraConversas === 'ligacoes' ? 0 : contatos), 2);
    const x = extras?.get(s) ?? {};
    return {
      semana: s, fechada: s < per.semanaAtual, atividade: ativa,
      numeros: { seguidores: null, alcance: null, impressoes: l?.impressoes ?? null, engajamento: l?.interacoes ?? null, cliques: l?.cliques ?? null, conversas, leads },
      impressoes: l?.impressoes ?? null, cliques: l?.cliques ?? null, interacoes: l?.interacoes ?? null, gasto: l?.gasto ?? null,
      conversoes: l?.conversoes ?? null, valorConversoes: l?.valorConversoes ?? null, todasConversoes: l?.todasConversoes ?? null,
      ctr: l?.ctr ?? null, cpcMedio: l?.cpcMedio ?? null, custoPorConversao: l?.custoPorConversao ?? null, parcelaImpressoes: l?.parcelaImpressoes ?? null,
      ligacoes: ligSemana, contatos,
      cliquesInvalidos: x.cliquesInvalidos ?? null, taxaCliquesInvalidos: x.taxaCliquesInvalidos ?? null,
      ligacoesPeloAnuncio: x.ligacoesPeloAnuncio ?? null, rotas: x.rotas ?? null, siteDaLoja: x.siteDaLoja ?? null,
    };
  });
  return { semanas, regras: { leads: regraLeads, conversas: regraConversas } };
}

/** Totais do período, recalculados das semanas (ctr e custos das somas). */
function totaisDoPeriodo(conta) {
  const acc = {};
  for (const l of conta.values()) {
    for (const k of CAMPOS_SEMANA) {
      if (l[k] == null) continue;
      acc[k] = (acc[k] ?? 0) + (k === 'gasto' ? Math.round(l[k] * 1e6) : l[k]);
    }
  }
  return fechar(acc, CAMPOS_SEMANA);
}

// ---------------------------------------------------------------- período --

/** As 8 semanas FECHADAS (segunda a domingo, São Paulo) e a corrente até
 *  ontem. Os dados do dia de hoje ainda estão chegando: ficam de fora. */
export function periodo(hoje) {
  const atual = segundaDaSemana(hoje);
  const semanas = [];
  for (let k = SEMANAS_FECHADAS; k >= 1; k--) semanas.push(somarDias(atual, -7 * k));
  return {
    hoje, inicio: semanas[0], fim: somarDias(hoje, -1), fimFechado: somarDias(atual, -1), semanas, semanaAtual: atual,
    leadsDesde: somarDias(hoje, -60), alteracoesDesde: somarDias(hoje, -29),
  };
}

// --------------------------------------------------------------- consultas --

/** As consultas GAQL, numa função só, para o teste conferir o texto (ex.: a
 *  das ligações não pode ter segments.device). Cada uma conta 1 operação. */
export function consultas(p, extra = {}) {
  const entre = `segments.date BETWEEN '${p.inicio}' AND '${p.fim}'`;
  const base = 'metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value';
  return {
    conta: 'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager, customer.test_account, customer.conversion_tracking_setting.conversion_tracking_id, customer.conversion_tracking_setting.cross_account_conversion_tracking_id, customer.call_reporting_setting.call_reporting_enabled FROM customer',
    contaReserva: 'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager, customer.test_account FROM customer',
    filhas: 'SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager, customer_client.test_account, customer_client.status, customer_client.level FROM customer_client WHERE customer_client.level <= 1',
    semanas: `SELECT segments.week, metrics.impressions, metrics.clicks, metrics.interactions, metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.all_conversions, metrics.search_impression_share FROM customer WHERE ${entre}`,
    dias: `SELECT segments.date, metrics.impressions, metrics.clicks, metrics.interactions, metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.all_conversions FROM customer WHERE ${entre}`,
    aparelhos: `SELECT segments.device, segments.ad_network_type, metrics.interactions, ${base} FROM customer WHERE ${entre}`,
    cliquesInvalidos: `SELECT segments.week, metrics.invalid_clicks, metrics.invalid_click_rate FROM customer WHERE ${entre}`,
    conversoesLocais: `SELECT segments.week, metrics.all_conversions_from_click_to_call, metrics.all_conversions_from_directions, metrics.all_conversions_from_store_website FROM customer WHERE ${entre}`,
    campanhasLista: "SELECT campaign.id, campaign.name, campaign.status, campaign.primary_status, campaign.primary_status_reasons, campaign.serving_status, campaign.advertising_channel_type, campaign.advertising_channel_sub_type, campaign.bidding_strategy_type, campaign.start_date_time, campaign.end_date_time, campaign.optimization_score, campaign_budget.amount_micros, campaign_budget.period, campaign_budget.delivery_method, campaign_budget.recommended_budget_amount_micros FROM campaign WHERE campaign.status != 'REMOVED'",
    campanhasListaReserva: "SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign_budget.amount_micros FROM campaign WHERE campaign.status != 'REMOVED'",
    campanhasDias: `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, segments.date, metrics.impressions, metrics.clicks, metrics.interactions, metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.all_conversions FROM campaign WHERE ${entre}`,
    // Sem segments.device: phone_calls não aceita esse segmento (contraprova).
    ligacoes: `SELECT campaign.id, segments.date, metrics.phone_calls, metrics.phone_impressions, metrics.phone_through_rate FROM campaign WHERE ${entre}`,
    // Só semanas fechadas: a parcela do domingo só fica pronta na quarta.
    parcela: `SELECT campaign.id, segments.week, metrics.search_impression_share, metrics.search_top_impression_share, metrics.search_absolute_top_impression_share, metrics.search_budget_lost_impression_share, metrics.search_rank_lost_impression_share FROM campaign WHERE segments.date BETWEEN '${p.inicio}' AND '${p.fimFechado}' AND campaign.advertising_channel_type = 'SEARCH'`,
    alcance: `SELECT campaign.id, metrics.unique_users FROM campaign WHERE ${entre} AND campaign.advertising_channel_type IN ('DISPLAY', 'VIDEO', 'DEMAND_GEN', 'MULTI_CHANNEL')`,
    video: `SELECT campaign.id, metrics.video_trueview_views, metrics.video_trueview_view_rate, metrics.trueview_average_cpv, metrics.video_quartile_p25_rate, metrics.video_quartile_p50_rate, metrics.video_quartile_p75_rate, metrics.video_quartile_p100_rate, metrics.youtube_likes, metrics.youtube_comments, metrics.youtube_shares FROM campaign WHERE ${entre} AND campaign.advertising_channel_type = 'VIDEO'`,
    videoReserva: `SELECT campaign.id, metrics.video_trueview_views, metrics.video_trueview_view_rate, metrics.trueview_average_cpv FROM campaign WHERE ${entre} AND campaign.advertising_channel_type = 'VIDEO'`,
    display: `SELECT campaign.id, metrics.content_impression_share, metrics.content_budget_lost_impression_share, metrics.content_rank_lost_impression_share FROM campaign WHERE ${entre} AND campaign.advertising_channel_type = 'DISPLAY'`,
    grupos: `SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.type, ad_group.primary_status, campaign.id, campaign.name, metrics.interactions, metrics.phone_calls, ${base} FROM ad_group WHERE ${entre} AND ad_group.status != 'REMOVED'`,
    gruposReserva: `SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.type, campaign.id, campaign.name, metrics.interactions, ${base} FROM ad_group WHERE ${entre} AND ad_group.status != 'REMOVED'`,
    anuncios: `SELECT ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type, ad_group_ad.ad.final_urls, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions, ad_group_ad.ad.responsive_search_ad.path1, ad_group_ad.ad.responsive_search_ad.path2, ad_group_ad.status, ad_group_ad.primary_status, ad_group_ad.ad_strength, ad_group_ad.policy_summary.approval_status, ad_group.id, ad_group.name, campaign.id, campaign.name, metrics.interactions, ${base} FROM ad_group_ad WHERE ${entre} AND ad_group_ad.status != 'REMOVED'`,
    anunciosReserva: `SELECT ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type, ad_group_ad.ad.final_urls, ad_group_ad.status, ad_group.id, ad_group.name, campaign.id, campaign.name, metrics.interactions, ${base} FROM ad_group_ad WHERE ${entre} AND ad_group_ad.status != 'REMOVED'`,
    palavras: `SELECT ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status, ad_group_criterion.system_serving_status, ad_group_criterion.approval_status, ad_group_criterion.quality_info.quality_score, ad_group_criterion.quality_info.creative_quality_score, ad_group_criterion.quality_info.post_click_quality_score, ad_group_criterion.quality_info.search_predicted_ctr, ad_group_criterion.effective_cpc_bid_micros, ad_group_criterion.position_estimates.first_page_cpc_micros, ad_group.id, ad_group.name, campaign.id, campaign.name, ${base}, metrics.search_impression_share FROM keyword_view WHERE ${entre} AND ad_group_criterion.status != 'REMOVED'`,
    palavrasReserva: `SELECT ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status, ad_group.id, ad_group.name, campaign.id, campaign.name, ${base} FROM keyword_view WHERE ${entre} AND ad_group_criterion.status != 'REMOVED'`,
    termos: `SELECT search_term_view.search_term, search_term_view.status, segments.keyword.info.text, segments.keyword.info.match_type, segments.search_term_match_type, campaign.id, campaign.name, ad_group.id, ad_group.name, ${base} FROM search_term_view WHERE ${entre}`,
    // segments.search_term_match_type é o campo de aceitação duvidosa (alerta
    // da contraprova); a reserva sai sem ele.
    termosReserva: `SELECT search_term_view.search_term, search_term_view.status, segments.keyword.info.text, segments.keyword.info.match_type, campaign.id, campaign.name, ad_group.id, ad_group.name, ${base} FROM search_term_view WHERE ${entre}`,
    termosPmax: `SELECT campaign_search_term_view.search_term, campaign.id, campaign.name, ${base} FROM campaign_search_term_view WHERE ${entre} AND campaign.advertising_channel_type = 'PERFORMANCE_MAX'`,
    termosSmart: `SELECT smart_campaign_search_term_view.search_term, campaign.id, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros FROM smart_campaign_search_term_view WHERE ${entre}`,
    categorias: `SELECT customer_search_term_insight.category_label, customer_search_term_insight.id, metrics.impressions, metrics.clicks, metrics.conversions, metrics.search_volume FROM customer_search_term_insight WHERE ${entre}`,
    acoes: "SELECT conversion_action.id, conversion_action.name, conversion_action.type, conversion_action.category, conversion_action.status, conversion_action.origin, conversion_action.primary_for_goal, conversion_action.include_in_conversions_metric, conversion_action.counting_type, conversion_action.value_settings.default_value, conversion_action.value_settings.default_currency_code, conversion_action.click_through_lookback_window_days, conversion_action.attribution_model_settings.attribution_model, conversion_action.google_analytics_4_settings.event_name, metrics.all_conversions, metrics.conversion_last_conversion_date FROM conversion_action WHERE conversion_action.status != 'REMOVED'",
    acoesReserva: "SELECT conversion_action.id, conversion_action.name, conversion_action.type, conversion_action.category, conversion_action.status, conversion_action.primary_for_goal, conversion_action.include_in_conversions_metric FROM conversion_action WHERE conversion_action.status != 'REMOVED'",
    conversoesSemana: `SELECT segments.week, segments.conversion_action, segments.conversion_action_name, segments.conversion_action_category, metrics.conversions, metrics.conversions_value, metrics.all_conversions FROM customer WHERE ${entre}`,
    conversoesCampanha: `SELECT campaign.id, campaign.name, segments.conversion_action_name, segments.conversion_action_category, metrics.conversions, metrics.conversions_value, metrics.all_conversions FROM campaign WHERE ${entre}`,
    chamadas: `SELECT call_view.start_call_date_time, call_view.end_call_date_time, call_view.call_duration_seconds, call_view.call_status, call_view.type, call_view.caller_area_code, call_view.caller_country_code, call_view.call_tracking_display_location, campaign.id, campaign.name FROM call_view WHERE call_view.start_call_date_time >= '${p.inicio}' ORDER BY call_view.start_call_date_time DESC LIMIT ${TETO.chamadas}`,
    chamadasReserva: `SELECT call_view.start_call_date_time, call_view.end_call_date_time, call_view.call_duration_seconds, call_view.call_status, call_view.type, call_view.caller_area_code, call_view.caller_country_code, call_view.call_tracking_display_location FROM call_view WHERE call_view.start_call_date_time >= '${p.inicio}' ORDER BY call_view.start_call_date_time DESC LIMIT ${TETO.chamadas}`,
    leads: `SELECT lead_form_submission_data.id, lead_form_submission_data.submission_date_time, lead_form_submission_data.lead_form_submission_fields, lead_form_submission_data.custom_lead_form_submission_fields, lead_form_submission_data.gclid, campaign.id, campaign.name, ad_group.name FROM lead_form_submission_data WHERE lead_form_submission_data.submission_date_time >= '${p.leadsDesde}'`,
    leadsReserva: `SELECT lead_form_submission_data.id, lead_form_submission_data.submission_date_time, lead_form_submission_data.lead_form_submission_fields, lead_form_submission_data.custom_lead_form_submission_fields FROM lead_form_submission_data WHERE lead_form_submission_data.submission_date_time >= '${p.leadsDesde}'`,
    paginas: `SELECT landing_page_view.unexpanded_final_url, ${base} FROM landing_page_view WHERE ${entre}`,
    cidades: `SELECT geographic_view.country_criterion_id, geographic_view.location_type, segments.geo_target_city, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM geographic_view WHERE ${entre}`,
    nomesGeo: `SELECT geo_target_constant.resource_name, geo_target_constant.name, geo_target_constant.canonical_name FROM geo_target_constant WHERE geo_target_constant.resource_name IN (${(extra.geos ?? []).map((g) => `'${g}'`).join(', ')})`,
    horarios: `SELECT campaign.id, segments.day_of_week, segments.hour, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE ${entre}`,
    // age_range_view e gender_view não podem ir na mesma consulta.
    idade: `SELECT ad_group_criterion.age_range.type, ${base} FROM age_range_view WHERE ${entre}`,
    genero: `SELECT ad_group_criterion.gender.type, ${base} FROM gender_view WHERE ${entre}`,
    pmax: `SELECT asset_group.id, asset_group.name, asset_group.status, campaign.id, campaign.name, ${base} FROM asset_group WHERE ${entre} AND asset_group.status != 'REMOVED'`,
    // As métricas orgânicas só existem nesta view (contraprova).
    organico: `SELECT paid_organic_search_term_view.search_term, metrics.organic_clicks, metrics.organic_impressions, metrics.organic_queries, metrics.combined_clicks FROM paid_organic_search_term_view WHERE ${entre}`,
    organicoReserva: `SELECT paid_organic_search_term_view.search_term, metrics.organic_clicks, metrics.organic_impressions, metrics.combined_clicks FROM paid_organic_search_term_view WHERE ${entre}`,
    // O Google obriga o filtro dentro dos últimos 30 dias e um LIMIT.
    alteracoes: `SELECT change_event.change_date_time, change_event.change_resource_type, change_event.resource_change_operation, change_event.changed_fields, change_event.client_type, change_event.user_email FROM change_event WHERE change_event.change_date_time >= '${p.alteracoesDesde}' AND change_event.change_date_time <= '${p.hoje} 23:59:59' ORDER BY change_event.change_date_time DESC LIMIT ${TETO.alteracoes}`,
  };
}

// ------------------------------------------------------------------ erros --

/** O código do erro, só quando é um nome de enum (LETRAS_E_SUBLINHADO). Texto
 *  livre do provedor nunca sai daqui: pode trazer dado da conta. */
export function codigoDoErro(corpo) {
  const itens = Array.isArray(corpo) ? corpo : [corpo];
  const enumOk = (v) => (typeof v === 'string' && /^[A-Z][A-Z0-9_]{2,80}$/.test(v) ? v : null);
  for (const item of itens) {
    for (const d of Array.isArray(item?.error?.details) ? item.error.details : []) {
      for (const e of Array.isArray(d?.errors) ? d.errors : []) {
        const v = e?.errorCode && typeof e.errorCode === 'object' ? enumOk(Object.values(e.errorCode)[0]) : null;
        if (v) return v;
      }
      const motivo = enumOk(d?.reason);
      if (motivo) return motivo;
    }
    const st = enumOk(item?.error?.status);
    if (st) return st;
    if (typeof item?.error === 'string' && /^[a-z_]{3,40}$/.test(item.error)) return item.error;
  }
  return null;
}

/** Que tipo de erro é, para decidir se para a coleta e em que estado fica.
 *  Procura os nomes de enum no corpo inteiro: o formato do erro do REST varia
 *  (objeto no search, lista no searchStream, outro no endpoint do token). */
export function classificarErro(resp) {
  const status = Number(resp?.status) || 0;
  const corpo = resp?.corpo ?? null;
  let bruto = '';
  try { bruto = JSON.stringify(corpo ?? '') || ''; } catch { bruto = ''; }
  const tem = (re) => re.test(bruto);
  const codigo = codigoDoErro(corpo);
  if (tem(/CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION|DEVELOPER_TOKEN_NOT_APPROVED|DEVELOPER_TOKEN_NOT_ON_ALLOWLIST/)) return { tipo: 'aprovacao', codigo: 'projeto_sem_aprovacao' };
  if (tem(/SERVICE_DISABLED|accessNotConfigured|has not been used in project/)) return { tipo: 'configuracao', codigo: 'api_desativada' };
  if (tem(/NOT_ADS_USER|USER_PERMISSION_DENIED/)) return { tipo: 'conexao', codigo: 'sem_acesso_na_conta' };
  if (tem(/INVALID_CUSTOMER_ID|CUSTOMER_NOT_FOUND/)) return { tipo: 'configuracao', codigo: 'id_cliente_invalido' };
  if (tem(/CUSTOMER_NOT_ENABLED|CUSTOMER_NOT_ACTIVE/)) return { tipo: 'conta', codigo: 'conta_desativada' };
  // Endpoint do token: {error: 'invalid_grant', error_description: '...'}.
  if (typeof corpo?.error === 'string') {
    if (status >= 500) return { tipo: 'transitorio', codigo: null };
    if (['invalid_scope', 'invalid_request', 'unsupported_grant_type'].includes(corpo.error)) return { tipo: 'configuracao', codigo: 'token_pedido_invalido' };
    return { tipo: 'credencial', codigo: 'chave_recusada' };
  }
  if (status === 401 || tem(/UNAUTHENTICATED|authenticationError/)) return { tipo: 'credencial', codigo: 'token_recusado' };
  // A pesquisa separa os dois: o estouro da cota do DIA é RESOURCE_EXHAUSTED;
  // o limite POR SEGUNDO, que passa sozinho, é RESOURCE_TEMPORARILY_EXHAUSTED
  // (no corpo REST, o status geral vem RESOURCE_EXHAUSTED nos dois; quem
  // separa é o quotaError). O do segundo não para a coleta nem diz que a cota
  // do dia acabou: aquela consulta fica sem dado e a próxima coleta tenta.
  if (codigo === 'RESOURCE_TEMPORARILY_EXHAUSTED' || tem(/RESOURCE_TEMPORARILY_EXHAUSTED/)) return { tipo: 'limite_segundo', codigo: 'RESOURCE_TEMPORARILY_EXHAUSTED' };
  if (status === 429 || tem(/RESOURCE_EXHAUSTED|quotaError/)) return { tipo: 'cota', codigo: codigo ?? 'RESOURCE_EXHAUSTED' };
  if (status === 400 || tem(/queryError|fieldError|requestError|dateRangeError|dateError|INVALID_ARGUMENT/)) return { tipo: 'consulta', codigo };
  if (status === 403) return { tipo: 'permissao', codigo: codigo ?? 'PERMISSION_DENIED' };
  if (status === 0 || status >= 500) return { tipo: 'transitorio', codigo: null };
  return { tipo: 'outro', codigo };
}

/** O que o ctx.fetchJson devolveu, num formato só: {ok, status, corpo}. */
export function normalizarResposta(r) {
  const temErro = (c) => (Array.isArray(c) ? c.some((x) => x && typeof x === 'object' && x.error) : !!(c && typeof c === 'object' && c.error));
  if (r && typeof r === 'object' && !Array.isArray(r) && typeof r.status === 'number'
    && ['ok', 'json', 'corpo', 'dados', 'body', 'data'].some((k) => k in r)) {
    const corpo = r.json ?? r.corpo ?? r.dados ?? r.body ?? r.data ?? null;
    const ok = 'ok' in r ? r.ok === true : r.status >= 200 && r.status < 300;
    return { ok: ok && !temErro(corpo), status: r.status, corpo };
  }
  if (temErro(r)) {
    const st = Number(Array.isArray(r) ? r.find((x) => x?.error)?.error?.code : r.error?.code);
    return { ok: false, status: Number.isFinite(st) ? st : (typeof r.error === 'string' ? 400 : 0), corpo: r };
  }
  return { ok: true, status: 200, corpo: r ?? null };
}

// ------------------------------------------------------ conta de serviço --

class ErroFonte extends Error {
  constructor(codigo) { super(codigo); this.codigo = codigo; }
}

/** O JSON da conta de serviço, conferido. Aceita colado puro ou em base64 (há
 *  quem cole assim no painel de secrets). Erro nunca repete o conteúdo. */
export function lerContaServico(bruto) {
  const t = String(bruto ?? '').trim();
  let obj = null;
  try { obj = JSON.parse(t); } catch { try { obj = JSON.parse(atob(t)); } catch { obj = null; } }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new ErroFonte('json_invalido');
  if (obj.type !== undefined && obj.type !== 'service_account') throw new ErroFonte('json_invalido');
  const email = typeof obj.client_email === 'string' ? obj.client_email.trim() : '';
  const chave = typeof obj.private_key === 'string' ? obj.private_key : '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !chave) throw new ErroFonte('json_invalido');
  const kid = typeof obj.private_key_id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(obj.private_key_id) ? obj.private_key_id : null;
  return { email, chave, kid };
}

const b64url = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64urlTexto = (t) => b64url(new TextEncoder().encode(t));

async function importarChave(pem) {
  // Colado à mão, o "\n" às vezes chega como as duas letras, não como quebra.
  const limpo = String(pem).replace(/\\n/g, '\n');
  if (!/-----BEGIN PRIVATE KEY-----[\s\S]+-----END PRIVATE KEY-----/.test(limpo)) throw new ErroFonte('chave_formato');
  const b64 = limpo.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  let bin;
  try { bin = atob(b64); } catch { throw new ErroFonte('chave_formato'); }
  const der = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  try {
    return await globalThis.crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  } catch { throw new ErroFonte('chave_formato'); }
}

/** JWT RS256 da conta de serviço: iss = e-mail, scope = adwords, aud = o
 *  endpoint do token, exp 1 hora depois. Sem "sub": a conta de serviço tem
 *  acesso direto, não age em nome de ninguém. */
export async function montarJwt(sa, agoraSeg = Math.floor(Date.now() / 1000)) {
  const chave = await importarChave(sa.chave);
  const cab = { alg: 'RS256', typ: 'JWT', ...(sa.kid ? { kid: sa.kid } : {}) };
  const corpo = { iss: sa.email, scope: ESCOPO, aud: URL_TOKEN, iat: agoraSeg, exp: agoraSeg + 3600 };
  const entrada = `${b64urlTexto(JSON.stringify(cab))}.${b64urlTexto(JSON.stringify(corpo))}`;
  const assinatura = new Uint8Array(await globalThis.crypto.subtle.sign('RSASSA-PKCS1-v1_5', chave, new TextEncoder().encode(entrada)));
  return `${entrada}.${b64url(assinatura)}`;
}

// -------------------------------------------------------------- os avisos --

// Para gente: sem travessão, sem texto do provedor, sem segredo.
const AVISO = {
  sem_secret: 'Falta cadastrar o GOOGLE_ADS_SA_JSON nos secrets do Supabase (o arquivo JSON da conta de serviço).',
  json_invalido: 'O GOOGLE_ADS_SA_JSON não é o arquivo JSON de uma conta de serviço (faltam client_email ou private_key). Cole o arquivo inteiro que o Google Cloud baixou.',
  chave_formato: 'A chave privada do GOOGLE_ADS_SA_JSON não pôde ser lida. Gere uma chave JSON nova da conta de serviço no Google Cloud e troque o secret.',
  chave_recusada: 'O Google recusou a chave da conta de serviço. Ela pode ter sido apagada ou desativada: gere uma chave JSON nova e troque o GOOGLE_ADS_SA_JSON.',
  token_recusado: 'O Google recusou o acesso da conta de serviço no meio da coleta. A próxima coleta tenta de novo; se continuar, gere uma chave nova.',
  token_pedido_invalido: 'O Google não aceitou o pedido de acesso da conta de serviço. Confira se o GOOGLE_ADS_SA_JSON é o arquivo inteiro.',
  token_sem_valor: 'O Google respondeu ao pedido de acesso sem o token. A próxima coleta tenta de novo.',
  api_desativada: 'A Google Ads API está desligada no projeto do Google Cloud. Ative em APIs e serviços (googleads.googleapis.com).',
  projeto_sem_aprovacao: 'O projeto do Google Cloud ainda não tem o nível Explorer da Google Ads API. Peça em Google Ads API Overview. O nível também cai depois de 90 dias sem uso.',
  sem_contas: 'A conta de serviço ainda não tem acesso a nenhuma conta do Google Ads. Adicione o e-mail dela como usuário Somente leitura em Administrador, Acesso e segurança.',
  sem_acesso_na_conta: 'A conta de serviço não tem acesso à conta do Google Ads. Adicione o e-mail dela como usuário Somente leitura em Administrador, Acesso e segurança.',
  id_cliente_invalido: 'O ID do cliente do Google Ads não confere. O GOOGLE_ADS_CUSTOMER_ID leva os 10 dígitos do ID do cliente, sem traços (não é o número da tag AW-).',
  conta_desativada: 'A conta do Google Ads está desativada ou cancelada.',
  sem_conta_comum: 'A conta de serviço só alcança contas de administrador, sem nenhuma conta de anúncios embaixo. Cadastre GOOGLE_ADS_CUSTOMER_ID e GOOGLE_ADS_LOGIN_CUSTOMER_ID.',
  cota: 'A cota diária de operações da Google Ads API acabou. A próxima coleta tenta de novo.',
  limite_segundo: 'O Google Ads pediu para ir mais devagar (limite por segundo, que passa sozinho) e parte das consultas ficou para a próxima coleta. A cota do dia não acabou.',
  sem_resposta: 'O Google Ads não respondeu (rede ou erro do servidor). A próxima coleta tenta de novo.',
  permissao: 'O Google recusou o acesso à conta do Google Ads. Confira se a conta de serviço continua como usuária Somente leitura.',
  outro: 'O Google Ads devolveu um erro que o Painel não conhece. A próxima coleta tenta de novo.',
};

// O motivo de cada parte vai para a tela como TEXTO (revisão 2). Os códigos
// de "status" (o que aconteceu com a consulta da parte) viram estas frases;
// os de quando a coleta nem passou da porta usam a frase do AVISO. O código
// curto vai ao lado, em "codigo".
export const MOTIVOS = Object.freeze({
  falhou: 'Este quadro não veio nesta coleta; o que estava na tela continua.',
  sem_tempo: 'O tempo da coleta acabou antes deste quadro; o que estava na tela continua.',
  grande_demais: 'A resposta deste quadro passou do tamanho que o Painel aceita; o que estava na tela continua.',
  limite_segundo: 'O Google Ads pediu para ir mais devagar (limite por segundo, que passa sozinho); este quadro fica para a próxima coleta.',
  sem_resposta: 'O Google Ads não respondeu a este quadro; a próxima coleta tenta de novo.',
  recusada: 'A API recusou a consulta deste quadro (um campo que ela não aceita); ele fica sem dado.',
  parada: 'A coleta parou antes deste quadro; o que estava na tela continua.',
});
/** A frase de um código: o MOTIVOS, ou o AVISO da porta (credencial, acesso,
 *  cota...). Nunca o código cru. */
export const fraseDoMotivo = (codigo) => MOTIVOS[codigo] ?? AVISO[codigo] ?? AVISO.outro;

// -------------------------------------------------------------- a coleta --

class Coleta {
  constructor(ctx) {
    this.ctx = ctx;
    this.avisos = [];
    this.partes = {};
    this.dados = {};
    this.chamadas = 0;
    this.parada = null;
    this.semTempo = [];
    this.transitorios = 0;
    this.algumOk = false;
    this.status = {};
    this.agora = new Date().toISOString();
    this.token = null;
    this.cliente = null;
    this.login = null;
  }
  avisar(t) { if (t && !this.avisos.includes(t)) this.avisos.push(t); }
  restante() {
    try { const r = Number(this.ctx.prazo?.()); return Number.isFinite(r) ? r : Infinity; } catch { return Infinity; }
  }
  async pedir(url, op) {
    this.chamadas++;
    try {
      return normalizarResposta(await this.ctx.fetchJson(url, op));
    } catch (e) {
      // Erro lançado: só o status e o corpo; a mensagem pode carregar a URL.
      // Resposta grande demais (teto de 8 MB da coletora) chega com status
      // 200 e não é recusa da API: ganha marca própria.
      if (e?.codigo === 'grande_demais') return { ok: false, status: 0, corpo: null, grande: true };
      const st = Number(e?.status ?? e?.codigo);
      return { ok: false, status: Number.isFinite(st) ? st : 0, corpo: e?.corpo ?? e?.json ?? e?.body ?? e?.dados ?? null };
    }
  }
  cabecalhos(login) {
    const h = { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' };
    if (login) h['login-customer-id'] = login;
    return h;
  }
  /** Search paginado, com teto de páginas e de tempo. */
  async buscar(cliente, login, gaql, nome) {
    const linhas = [];
    let pageToken = null;
    for (let pag = 0; pag < MAX_PAGINAS; pag++) {
      const r = await this.pedir(`${BASE}/customers/${cliente}/googleAds:search`, {
        method: 'POST', headers: this.cabecalhos(login), body: JSON.stringify(pageToken ? { query: gaql, pageToken } : { query: gaql }), rotulo: `google_ads:${nome}`,
      });
      if (!r.ok) return { ok: false, resp: r, linhas };
      linhas.push(...lerLinhas(r.corpo));
      pageToken = typeof r.corpo?.nextPageToken === 'string' && r.corpo.nextPageToken ? r.corpo.nextPageToken : null;
      if (!pageToken) return { ok: true, linhas };
      if (this.restante() < MARGEM_MS) return { ok: true, linhas, cortado: 'tempo' };
    }
    return { ok: true, linhas, cortado: 'paginas' };
  }
  /** Uma consulta da coleta. Devolve as linhas, ou null (e anota o porquê). */
  async bloco(nome, rotulo, gaql, reserva = null) {
    if (this.parada) { this.status[nome] = 'parada'; return null; }
    if (this.restante() < MARGEM_MS) { this.semTempo.push(rotulo); this.status[nome] = 'sem_tempo'; return null; }
    let r = await this.buscar(this.cliente, this.login, gaql, nome);
    if (!r.ok && reserva && classificarErro(r.resp).tipo === 'consulta' && this.restante() >= MARGEM_MS) {
      const cod = classificarErro(r.resp).codigo;
      // O nome do erro da API (UNRECOGNIZED_FIELD...) vai só para o diário: o
      // aviso é para gente.
      this.ctx.log?.(`google_ads: ${nome} recusou campos${cod ? ` (${cod})` : ''}; tentou a reserva`);
      this.avisar(`A API recusou parte dos campos de ${rotulo}; a coleta seguiu com menos campos.`);
      r = await this.buscar(this.cliente, this.login, reserva, `${nome}_reserva`);
    }
    if (r.ok) {
      this.transitorios = 0;
      this.algumOk = true;
      if (r.cortado === 'paginas') this.avisar(`A consulta de ${rotulo} passou de ${MAX_PAGINAS} páginas e foi cortada.`);
      if (r.cortado === 'tempo') this.avisar(`O tempo acabou no meio da consulta de ${rotulo}; a lista ficou incompleta.`);
      this.status[nome] = 'ok';
      return r.linhas;
    }
    this.falha(r.resp, rotulo, nome);
    return null;
  }
  falha(resp, rotulo, nome) {
    if (resp?.grande) {
      this.status[nome] = 'grande_demais';
      this.avisar(`A resposta de ${rotulo} passou do tamanho que o Painel aceita; esse quadro ficou com a coleta anterior.`);
      return;
    }
    const e = classificarErro(resp);
    // Depois que uma consulta já deu certo com a mesma credencial na mesma
    // conta, um 403 de permissão é daquela consulta (um campo que o papel
    // Somente leitura não vê), não da conexão: vira recusa e a coleta segue,
    // em vez de pintar "falta conectar" numa coleta que trouxe quase tudo.
    const soDaConsulta = this.algumOk && (e.tipo === 'permissao' || e.tipo === 'conexao');
    if (PARA.has(e.tipo) && !soDaConsulta) { this.parada = e; this.status[nome] = 'parada'; return; }
    if (e.tipo === 'transitorio' || e.tipo === 'limite_segundo') {
      const segundo = e.tipo === 'limite_segundo';
      this.status[nome] = segundo ? 'limite_segundo' : 'sem_resposta';
      this.avisar(segundo
        ? `O Google Ads pediu para ir mais devagar na consulta de ${rotulo} (limite por segundo, passageiro); esses números ficaram com a coleta anterior.`
        : `O Google Ads não respondeu à consulta de ${rotulo}; esses números ficaram com a coleta anterior.`);
      // Duas seguidas sem resposta: a rede ou o Google caiu, e cada nova
      // tentativa só gasta tempo do orçamento.
      if (++this.transitorios >= 2) this.parada = e;
      return;
    }
    this.transitorios = 0;
    this.status[nome] = 'recusada';
    this.ctx.log?.(`google_ads: ${nome} recusada${e.codigo ? ` (${e.codigo})` : ''}`);
    this.avisar(`A API recusou a consulta de ${rotulo}; esses números ficaram sem dado.`);
  }
  /** Registra a parte: com valor, ok e entra em "dados"; sem valor, erro e a
   *  coletora mantém a anterior. `nomes` são os blocos essenciais dela. */
  parte(nome, valor, nomes = []) {
    if (valor !== null && valor !== undefined) {
      this.partes[nome] = { estado: 'ok', coletado_em: this.agora };
      this.dados[nome] = valor;
      return;
    }
    const codigo = nomes.map((n) => this.status[n]).find((s) => s && s !== 'ok') ?? (this.parada ? 'parada' : 'falhou');
    // Parada: a frase diz por que a coleta parou (cota, credencial, acesso),
    // que é o que o Léo precisa saber para destravar.
    const motivo = codigo === 'parada' && this.parada ? AVISO[codigoAviso(this.parada)] ?? MOTIVOS.parada : fraseDoMotivo(codigo);
    this.partes[nome] = { estado: 'erro', motivo, codigo, coletado_em: null };
  }
}

/** Fecha a coleta que não passou da porta (sem credencial, sem acesso...).
 *  A frase do motivo vai UMA vez, na parte "conta", que a linha da fonte
 *  mostra com o estado; repetida em "avisos", a tela dizia a mesma coisa
 *  duas vezes (uma delas no "1 aviso"). E a parte leva o estado da FONTE:
 *  "Conta: Erro na coleta" ao lado do selo "Aguardando aprovação" se
 *  contradizia (revisão de 12/10). O `extra` (o e-mail da conta de serviço,
 *  que é o que o Léo precisa copiar) continua aviso. */
function encerrar(c, estado, codigo, extra = null) {
  if (extra) c.avisar(extra);
  c.partes.conta = { estado, motivo: fraseDoMotivo(codigo), codigo, coletado_em: null };
  c.ctx.log?.(`google_ads: ${estado} (${codigo}), ${c.chamadas} chamadas`);
  return { estado, conta: null, partes: c.partes, dados: c.dados, semanas: [], publicacoes: [], avisos: c.avisos };
}

// Cota, rede, conta desativada ou erro desconhecido antes de achar a conta:
// não há o que mostrar, e o estado é "erro".
const estadoDoErro = (e) => ESTADO_DA_PARADA[e.tipo] ?? 'erro';
const codigoAviso = (e) => (AVISO[e.codigo] ? e.codigo : e.tipo === 'transitorio' ? 'sem_resposta' : e.tipo === 'limite_segundo' ? 'limite_segundo' : e.tipo === 'cota' ? 'cota' : e.tipo === 'permissao' ? 'permissao' : 'outro');

const soDigitos = (v) => {
  const t = String(v ?? '').replace(/[\s-]/g, '');
  return t ? t : null;
};
export const formatarId = (id) => (/^\d{10}$/.test(String(id)) ? `${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6)}` : String(id ?? ''));

/** Acha a conta da Impresilk. Devolve {conta, tagConfere} ou {erro}. */
async function descobrir(c, Q) {
  const env = (n) => { try { return c.ctx.env(n); } catch { return null; } };
  const alvoEnv = soDigitos(env('GOOGLE_ADS_CUSTOMER_ID'));
  const loginEnv = soDigitos(env('GOOGLE_ADS_LOGIN_CUSTOMER_ID'));
  if ((alvoEnv && !/^\d{10}$/.test(alvoEnv)) || (loginEnv && !/^\d{10}$/.test(loginEnv))) return { erro: { tipo: 'configuracao', codigo: 'id_cliente_invalido' } };
  const r = await c.pedir(`${BASE}/customers:listAccessibleCustomers`, { method: 'GET', headers: c.cabecalhos(null), rotulo: 'google_ads:contas' });
  if (!r.ok) return { erro: classificarErro(r) };
  const ids = lerContasAcessiveis(r.corpo);
  if (!ids.length && !(alvoEnv && loginEnv)) return { erro: { tipo: 'conexao', codigo: 'sem_contas' } };

  // Lê a ficha de uma conta. Recusa de campo tenta a ficha curta; conta
  // desativada é pulada; o resto para a descoberta.
  const ficha = async (id, login) => {
    let b = await c.buscar(id, login, Q.conta, 'conta');
    if (!b.ok && classificarErro(b.resp).tipo === 'consulta') b = await c.buscar(id, login, Q.contaReserva, 'conta_reserva');
    if (b.ok) return { conta: b.linhas.length ? lerConta(b.linhas[0], login) : null };
    const e = classificarErro(b.resp);
    return e.tipo === 'conta' ? { pular: e } : { erro: e };
  };
  const filhas = async (gerente) => {
    const b = await c.buscar(gerente, gerente, Q.filhas, 'filhas');
    if (b.ok) return { lista: lerFilhas(b.linhas) };
    const e = classificarErro(b.resp);
    return PARA.has(e.tipo) ? { erro: e } : { lista: [] };
  };

  if (alvoEnv) {
    let login = loginEnv;
    if (!login && !ids.includes(alvoEnv)) {
      // O ID cadastrado não é de acesso direto: procura a conta de agência que
      // o gerencia entre as que a credencial alcança.
      for (const id of ids.slice(0, MAX_CONTAS)) {
        const f = await ficha(id, null);
        if (f.erro) return { erro: f.erro };
        if (!f.conta?.gerente) continue;
        const fl = await filhas(id);
        if (fl.erro) return { erro: fl.erro };
        if (fl.lista.some((x) => x.id === alvoEnv)) { login = id; break; }
      }
      if (!login) return { erro: { tipo: 'configuracao', codigo: 'id_cliente_invalido' } };
    }
    const f = await ficha(alvoEnv, login);
    if (f.erro) return { erro: f.erro };
    if (f.pular) return { erro: f.pular };
    if (!f.conta) return { erro: { tipo: 'configuracao', codigo: 'id_cliente_invalido' } };
    if (f.conta.gerente) return { erro: { tipo: 'configuracao', codigo: 'id_cliente_invalido' } };
    return { conta: f.conta, tagConfere: f.conta.tag === TAG_AW || f.conta.tagCruzada === TAG_AW };
  }

  const candidatas = [], gerentes = [];
  for (const id of ids.slice(0, MAX_CONTAS)) {
    const f = await ficha(id, null);
    if (f.erro) return { erro: f.erro };
    if (!f.conta) continue;
    (f.conta.gerente ? gerentes : candidatas).push(f.conta);
  }
  if (ids.length > MAX_CONTAS) c.avisar(`A conta de serviço alcança ${ids.length} contas; só as ${MAX_CONTAS} primeiras foram olhadas. Cadastre GOOGLE_ADS_CUSTOMER_ID para escolher.`);
  // Só contas de agência: as filhas dela (uma ficha por filha, até o teto).
  if (!candidatas.some((x) => x.tag === TAG_AW || x.tagCruzada === TAG_AW)) {
    let olhadas = 0;
    for (const g of gerentes) {
      if (olhadas >= MAX_CONTAS) break;
      const fl = await filhas(g.id);
      if (fl.erro) return { erro: fl.erro };
      for (const filha of fl.lista) {
        if (olhadas++ >= MAX_CONTAS) break;
        const f = await ficha(filha.id, g.id);
        if (f.erro) return { erro: f.erro };
        if (f.conta && !f.conta.gerente) candidatas.push(f.conta);
      }
    }
  }
  const escolha = escolherConta(candidatas);
  if (!escolha) return { erro: { tipo: 'conexao', codigo: gerentes.length ? 'sem_conta_comum' : 'sem_contas' } };
  if (!escolha.tagConfere) {
    c.avisar(escolha.varias
      ? `Nenhuma conta alcançada tem a tag AW-${TAG_AW} do site; usei a conta ${formatarId(escolha.conta.id)}. Para escolher outra, cadastre GOOGLE_ADS_CUSTOMER_ID.`
      : `A conta ${formatarId(escolha.conta.id)} não tem a tag AW-${TAG_AW} do site. Confira se é a conta certa.`);
  }
  return escolha;
}

/** A coleta inteira. Ver o FORMATO no topo. */
export async function coletar(ctx) {
  const c = new Coleta(ctx);
  const env = (n) => { try { return ctx.env(n); } catch { return null; } };

  // 1. A credencial. Sem ela, nenhuma chamada.
  const bruto = env('GOOGLE_ADS_SA_JSON');
  if (!bruto) return encerrar(c, 'falta_configurar', 'sem_secret');
  let sa;
  try { sa = lerContaServico(bruto); } catch { return encerrar(c, 'falta_configurar', 'json_invalido'); }
  let jwt;
  try { jwt = await montarJwt(sa); } catch (e) { return encerrar(c, 'falta_configurar', e?.codigo === 'chave_formato' ? 'chave_formato' : 'json_invalido'); }
  const emailSa = `O e-mail da conta de serviço é ${sa.email}.`;

  // 2. O token de 1 hora. Recusado, não insiste: a chave não muda sozinha.
  const rt = await c.pedir(URL_TOKEN, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${encodeURIComponent(jwt)}`,
    rotulo: 'google_ads:token',
  });
  if (!rt.ok) {
    const e = classificarErro(rt);
    return encerrar(c, estadoDoErro(e), codigoAviso(e));
  }
  const token = typeof rt.corpo?.access_token === 'string' ? rt.corpo.access_token : '';
  if (!token) return encerrar(c, 'erro', 'token_sem_valor');
  c.token = token;

  // 3. A conta.
  const hoje = /^\d{4}-\d{2}-\d{2}$/.test(String(ctx.hoje ?? '')) ? ctx.hoje : hojeSP();
  const per = periodo(hoje);
  const Q = consultas(per);
  const achou = await descobrir(c, Q);
  if (achou.erro) {
    const e = achou.erro;
    const ex = e.tipo === 'conexao' || e.codigo === 'sem_acesso_na_conta' ? emailSa : null;
    return encerrar(c, estadoDoErro(e), codigoAviso(e), ex);
  }
  const conta = achou.conta;
  c.cliente = conta.id;
  c.login = conta.viaGerente;
  if (conta.fuso && conta.fuso !== 'America/Sao_Paulo') c.avisar(`A conta do Google Ads está no fuso ${conta.fuso}; os dias do relatório seguem esse fuso, não o de São Paulo.`);
  if (conta.teste) c.avisar('A conta escolhida é uma conta de TESTE do Google Ads; os números não são reais.');

  // 4. As consultas, em ordem de importância: se o tempo acabar, faltam as
  //    do fim. Os leads vêm cedo porque o Google apaga em 60 dias.
  const semanasL = await c.bloco('semanas', 'semanas da conta', Q.semanas);
  const convSemL = await c.bloco('conversoes_semana', 'conversões por semana', Q.conversoesSemana);
  const acoesL = await c.bloco('acoes', 'ações de conversão', Q.acoes, Q.acoesReserva);
  const campListaL = await c.bloco('campanhas_lista', 'campanhas', Q.campanhasLista, Q.campanhasListaReserva);
  const campDiasL = await c.bloco('campanhas_dias', 'campanhas por dia', Q.campanhasDias);
  const ligL = await c.bloco('ligacoes', 'ligações pelo anúncio', Q.ligacoes);
  const leadsL = await c.bloco('leads', 'leads de formulário', Q.leads, Q.leadsReserva);
  const diasL = await c.bloco('dias', 'dias da conta', Q.dias);
  const termosL = await c.bloco('termos', 'termos de pesquisa', Q.termos, Q.termosReserva);
  const palavrasL = await c.bloco('palavras', 'palavras-chave', Q.palavras, Q.palavrasReserva);
  const gruposL = await c.bloco('grupos', 'grupos de anúncios', Q.grupos, Q.gruposReserva);
  const anunciosL = await c.bloco('anuncios', 'anúncios', Q.anuncios, Q.anunciosReserva);
  const parcelaL = await c.bloco('parcela', 'parcela de impressões', Q.parcela);
  let chamadasL = null;
  if (conta.relatorioChamadas !== false) chamadasL = await c.bloco('chamadas', 'detalhe das ligações', Q.chamadas, Q.chamadasReserva);
  const convCampL = await c.bloco('conversoes_campanha', 'conversões por campanha', Q.conversoesCampanha);
  const paginasL = await c.bloco('paginas', 'páginas de destino', Q.paginas);
  const cidadesL = await c.bloco('cidades', 'cidades', Q.cidades);
  let nomesGeo = null;
  if (cidadesL?.length) {
    const geos = cortar(lerCidades(cidadesL), TETO.cidades).lista.map((x) => x.geo).filter((g) => /^geoTargetConstants\/\d+$/.test(g));
    const unicos = [...new Set(geos)];
    if (unicos.length) {
      const nl = await c.bloco('nomes_geo', 'nomes das cidades', consultas(per, { geos: unicos }).nomesGeo);
      nomesGeo = nl ? lerNomesGeo(nl) : null;
    }
  }
  const horariosL = await c.bloco('horarios', 'dia da semana e hora', Q.horarios);
  const aparelhosL = await c.bloco('aparelhos', 'aparelhos e redes', Q.aparelhos);
  const idadeL = await c.bloco('idade', 'faixa de idade', Q.idade);
  const generoL = await c.bloco('genero', 'gênero', Q.genero);

  // As consultas que só fazem sentido com certo tipo de campanha (economiza
  // cota e evita aviso inútil).
  const tipos = new Set([...lerCampanhasLista(campListaL ?? []).values()].map((x) => x.tipo));
  for (const g of lerCampanhasDias(campDiasL ?? []).values()) tipos.add(g.info.tipo);
  const sabeTipos = !!(campListaL || campDiasL);
  const termosPmaxL = tipos.has('PERFORMANCE_MAX') ? await c.bloco('termos_pmax', 'termos do Performance Max', Q.termosPmax) : null;
  const termosSmartL = tipos.has('SMART') ? await c.bloco('termos_smart', 'termos da campanha Inteligente', Q.termosSmart) : null;
  const categoriasL = await c.bloco('categorias', 'categorias de busca', Q.categorias);
  const alcanceL = ['DISPLAY', 'VIDEO', 'DEMAND_GEN', 'MULTI_CHANNEL'].some((t) => tipos.has(t)) ? await c.bloco('alcance', 'alcance', Q.alcance) : null;
  const videoL = tipos.has('VIDEO') ? await c.bloco('video', 'vídeo', Q.video, Q.videoReserva) : null;
  const displayL = tipos.has('DISPLAY') ? await c.bloco('display', 'parcela na Rede de Display', Q.display) : null;
  const pmaxL = tipos.has('PERFORMANCE_MAX') ? await c.bloco('pmax', 'grupos de recursos do Performance Max', Q.pmax) : null;
  const organicoL = await c.bloco('organico', 'busca orgânica', Q.organico, Q.organicoReserva);
  const invalidosL = await c.bloco('cliques_invalidos', 'cliques inválidos', Q.cliquesInvalidos);
  const locaisL = await c.bloco('conversoes_locais', 'conversões de local', Q.conversoesLocais);
  const alteracoesL = await c.bloco('alteracoes', 'histórico de alterações', Q.alteracoes);

  // 5. As partes.
  c.parte('conta', {
    id: conta.id, idFormatado: formatarId(conta.id), nome: conta.nome, moeda: conta.moeda, fuso: conta.fuso, teste: conta.teste,
    tag: conta.tag ?? conta.tagCruzada ?? null, tagConfere: achou.tagConfere === true, viaGerente: conta.viaGerente ? formatarId(conta.viaGerente) : null,
    relatorioChamadas: conta.relatorioChamadas, versaoApi: VERSAO_API, consultas: c.chamadas,
    periodo: { inicio: per.inicio, fim: per.fim, semanas: per.semanas, semanaAtual: per.semanaAtual },
  });

  const acoes = acoesL ? lerAcoesConversao(acoesL) : null;
  const convSem = convSemL ? lerConversoesSemana(convSemL) : null;
  const ligacoes = ligL ? lerLigacoes(ligL) : null;
  if (!ligL && c.status.ligacoes && c.status.ligacoes !== 'ok') c.avisar('Sem a consulta das ligações, as conversas da semana ficaram sem dado.');

  let resumo = null;
  if (semanasL) {
    const contaSem = lerSemanasConta(semanasL);
    const extras = invalidosL || locaisL ? lerExtrasSemana([...(invalidosL ?? []), ...(locaisL ?? [])]) : null;
    const m = montarSemanas({ per, conta: contaSem, conversoes: convSem, acoes, ligacoes, extras });
    resumo = { semanas: m.semanas, regras: m.regras, totais: totaisDoPeriodo(contaSem), dias: diasL ? lerDiasConta(diasL) : null, aparelhos: aparelhosL ? lerAparelhos(aparelhosL) : null };
  }
  c.parte('resumo', resumo, ['semanas']);

  let campanhas = null;
  if (campListaL && campDiasL) {
    const lista = montarCampanhas({
      lista: lerCampanhasLista(campListaL), dias: lerCampanhasDias(campDiasL), ligacoes,
      parcelas: parcelaL ? lerParcelas(parcelaL) : null, alcance: alcanceL ? lerAlcance(alcanceL) : null,
      video: videoL ? lerVideo(videoL) : null, display: displayL ? lerDisplay(displayL) : null,
    });
    campanhas = { lista: lista.slice(0, TETO.campanhas), cortadas: Math.max(0, lista.length - TETO.campanhas) };
  }
  c.parte('campanhas', campanhas, ['campanhas_lista', 'campanhas_dias']);

  const comCortadas = ({ lista, cortados }) => ({ lista, cortadas: cortados });
  c.parte('grupos', gruposL ? cortar(lerGrupos(gruposL), TETO.grupos) : null, ['grupos']);
  c.parte('anuncios', anunciosL ? cortar(lerAnuncios(anunciosL), TETO.anuncios) : null, ['anuncios']);
  c.parte('palavras', palavrasL ? comCortadas(cortar(lerPalavras(palavrasL), TETO.palavras)) : null, ['palavras']);

  let termos = null;
  if (termosL) {
    const t = lerTermos(termosL), ordem = [...t.lista].sort(porPeso);
    const fora = ordem.slice(TETO.termos);
    const somaFora = fora.length ? fechar(fora.reduce((acc, x) => {
      for (const k of ['impressoes', 'cliques', 'conversoes']) if (x[k] != null) acc[k] = (acc[k] ?? 0) + x[k];
      if (x.gasto != null) acc.gasto = (acc.gasto ?? 0) + Math.round(x.gasto * 1e6);
      return acc;
    }, {}), ['impressoes', 'cliques', 'gasto', 'conversoes']) : null;
    termos = {
      lista: ordem.slice(0, TETO.termos),
      cortados: somaFora ? { quantidade: fora.length, impressoes: somaFora.impressoes, cliques: somaFora.cliques, gasto: somaFora.gasto, conversoes: somaFora.conversoes } : null,
      outros: campanhas ? outrosTermos(campanhas.lista, t.porCampanha) : null,
      pmax: termosPmaxL ? cortar(lerTermos(termosPmaxL).lista, TETO.termosPmax).lista.map(({ termo, campanhaId, campanha, impressoes, cliques, gasto, conversoes, valorConversoes, ctr, cpcMedio, custoPorConversao }) => ({ termo, campanhaId, campanha, impressoes, cliques, gasto, conversoes, valorConversoes, ctr, cpcMedio, custoPorConversao })) : null,
      smart: termosSmartL ? cortar(lerTermos(termosSmartL).lista, TETO.termosPmax).lista.map(({ termo, campanhaId, campanha, impressoes, cliques, gasto }) => ({ termo, campanhaId, campanha, impressoes, cliques, gasto })) : null,
      categorias: categoriasL ? lerCategorias(categoriasL) : null,
    };
    if (!campanhas) c.avisar('Sem as campanhas, a linha "outros termos" ficou sem dado.');
  }
  c.parte('termos', termos, ['termos']);

  c.parte('conversoes', acoes && convSem ? { acoes, semanas: convSem, porCampanha: convCampL ? lerConversoesCampanha(convCampL) : null } : null, ['acoes', 'conversoes_semana']);

  if (conta.relatorioChamadas === false) {
    c.avisar('O relatório de chamadas está desligado na conta do Google Ads; não há detalhe das ligações.');
    c.parte('chamadas', { ...resumirChamadas([], false), restrito: { lista: [] } });
  } else if (chamadasL) {
    const lista = lerChamadas(chamadasL);
    if (lista.length >= TETO.chamadas) c.avisar(`Vieram ${TETO.chamadas} ligações ou mais; a lista guarda só as mais recentes.`);
    c.parte('chamadas', { ...resumirChamadas(lista, conta.relatorioChamadas ?? null), restrito: { lista } });
  } else c.parte('chamadas', null, ['chamadas']);

  if (leadsL) {
    const ant = ctx.anterior?.dados?.leads?.restrito?.porId ?? ctx.anterior?.leads?.restrito?.porId ?? {};
    const novos = lerLeads(leadsL);
    const j = juntarLeads(ant, novos, hoje);
    c.parte('leads', { total: Object.keys(j.porId).length, novos: j.novos, ultimos60: novos.length, ...resumirLeads(j.porId), restrito: { porId: j.porId } });
  } else c.parte('leads', null, ['leads']);

  c.parte('publico', idadeL && generoL ? { idade: lerIdade(idadeL), genero: lerGenero(generoL) } : null, ['idade', 'genero']);

  let locais = null;
  if (cidadesL) {
    const cort = cortar(lerCidades(cidadesL), TETO.cidades);
    for (const x of cort.lista) { const n = nomesGeo?.get(x.geo); if (n) { x.nome = n.nome; x.nomeCompleto = n.nomeCompleto; } }
    locais = { cidades: cort.lista, cortadas: cort.cortados };
  }
  c.parte('locais', locais, ['cidades']);
  c.parte('paginas', paginasL ? comCortadas(cortar(lerPaginas(paginasL), TETO.paginas)) : null, ['paginas']);
  c.parte('horarios', horariosL ? { grade: lerHorarios(horariosL) } : null, ['horarios']);
  if (sabeTipos && !tipos.has('PERFORMANCE_MAX')) c.parte('pmax', { aplica: false, grupos: [] });
  else c.parte('pmax', pmaxL ? { aplica: true, grupos: lerPmax(pmaxL) } : null, ['pmax', 'campanhas_lista']);
  c.parte('organico', organicoL ? (() => { const o = lerOrganico(organicoL); return { lista: o.slice(0, TETO.organico), cortados: Math.max(0, o.length - TETO.organico) }; })() : null, ['organico']);
  if (alteracoesL) {
    const lista = lerAlteracoes(alteracoesL);
    c.parte('alteracoes', { ...resumirAlteracoes(lista), restrito: { lista } });
  } else c.parte('alteracoes', null, ['alteracoes']);

  // 6. O estado.
  if (c.semTempo.length) c.avisar(`O tempo da coleta acabou antes de: ${c.semTempo.join(', ')}. Esses quadros ficaram com a coleta anterior.`);
  const algumaErro = Object.values(c.partes).some((p) => p.estado !== 'ok');
  let estado = algumaErro || c.semTempo.length ? 'parcial' : 'ok';
  if (c.parada) {
    c.avisar(AVISO[codigoAviso(c.parada)]);
    if (c.parada.tipo === 'conexao' || c.parada.tipo === 'permissao') c.avisar(emailSa);
    estado = ESTADO_DA_PARADA[c.parada.tipo] ?? 'parcial';
  }
  ctx.log?.(`google_ads: ${estado}, conta ${formatarId(conta.id)}, ${c.chamadas} chamadas`);
  return { estado, conta: conta.nome ? `${conta.nome} (${formatarId(conta.id)})` : formatarId(conta.id), partes: c.partes, dados: c.dados, semanas: [], publicacoes: [], avisos: c.avisos };
}
