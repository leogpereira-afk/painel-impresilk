import { dataHoraLicitacaoValida } from './licitacoes-controle.mjs';

const PNCP = 'https://pncp.gov.br';
const PORTAL_COMPRAS = 'https://compras.api.portaldecompraspublicas.com.br';
const LIMITE_RESPOSTA = 256 * 1024;
const CONSULTAS_SIMULTANEAS = 4;
const MAX_PROCESSOS = 40;
const ESTADOS_INTERROMPIDOS = new Map([[2, 'Revogada'], [3, 'Anulada'], [4, 'Suspensa']]);

function dadosPNCP(item) {
  const controle = [...new Set((item.processo || '').match(/\b[0-9A-Z]{14}-1-\d{6}\/\d{4}\b/gi) || [])];
  if (controle.length > 1) return null;
  let url;
  try { url = new URL(item.oficialUrl); } catch { /* O número de controle também pode identificar a contratação. */ }
  const caminho = url?.origin === PNCP && !url.username && !url.password
    ? /^(?:\/app\/editais\/([0-9A-Z]{14})\/(\d{4})\/(\d{1,6})|\/api\/(?:consulta|pncp)\/v1\/orgaos\/([0-9A-Z]{14})\/compras\/(\d{4})\/(\d{1,6}))\/?$/i.exec(url.pathname)
    : null;
  const numeroLink = caminho && `${(caminho[1] || caminho[4]).toUpperCase()}-1-${(caminho[3] || caminho[6]).padStart(6, '0')}/${caminho[2] || caminho[5]}`;
  const numero = controle[0]?.toUpperCase() || numeroLink;
  if (!numero || (numeroLink && numero !== numeroLink)) return null;
  const [cnpj, , sequencialAno] = numero.split('-');
  const [sequencialTexto, anoTexto] = sequencialAno.split('/');
  const sequencial = Number(sequencialTexto), ano = Number(anoTexto);
  if (sequencial < 1 || ano < 2021) return null;
  return { numero, cnpj, ano, sequencial };
}

async function consultarJson(url, fetcher, signal) {
  try {
    const response = await fetcher(url, { headers: { accept: 'application/json' }, redirect: 'error', signal });
    if (!response.ok || response.redirected || !response.body) return null;
    const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
    let texto = '', bytes = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > LIMITE_RESPOSTA) { void reader.cancel().catch(() => {}); return null; }
        texto += decoder.decode(chunk.value, { stream: true });
      }
      return JSON.parse(texto + decoder.decode());
    } finally { reader.releaseLock(); }
  } catch { return null; }
}

function dataHoraPNCP(valor) {
  if (typeof valor !== 'string') return '';
  // O Manual de Integração do PNCP define o encerramento no horário de Brasília.
  const iso = /(?:Z|[+-]\d{2}:\d{2})$/.test(valor) ? valor : `${valor}-03:00`;
  return dataHoraLicitacaoValida(iso) ? iso : '';
}

async function consultarSessao(compra, prazo, fetcher, signal) {
  if (!prazo || typeof compra.linkSistemaOrigem !== 'string') return null;
  let url;
  try { url = new URL(compra.linkSistemaOrigem); } catch { return null; }
  if (!['https://www.portaldecompraspublicas.com.br', 'https://portaldecompraspublicas.com.br'].includes(url.origin) || url.username || url.password) return null;
  const processo = /^\/processos\/((?:[A-Z]{2}\/)[A-Za-z0-9-]+\/[A-Za-z0-9-]+-(\d+))\/?$/.exec(url.pathname);
  if (!processo) return null;
  const dados = await consultarJson(`${PORTAL_COMPRAS}/v2/licitacao/${processo[1]}`, fetcher, signal);
  const sessao = dados?.dataHoraAbertura;
  if (dados?.codigoLicitacao !== Number(processo[2]) || !dataHoraLicitacaoValida(sessao)
    || !dataHoraLicitacaoValida(dados.dataHoraFinalRecebimentoPropostas)
    || Date.parse(dados.dataHoraFinalRecebimentoPropostas) !== Date.parse(prazo)
    || Date.parse(sessao) < Date.parse(prazo)) return null;
  return { dataHora: sessao, fonteUrl: url.origin + url.pathname, referencia: 'Portal de Compras Públicas' };
}

async function consultarAnexos(processo, caminhoCompra, fetcher, signal) {
  const listaUrl = `${PNCP}/api/pncp/v1${caminhoCompra}/arquivos`;
  const dados = await consultarJson(listaUrl, fetcher, signal);
  if (!Array.isArray(dados)) return [];
  const arquivos = new Map();
  for (const arquivo of dados) {
    if (arquivo?.statusAtivo !== true || arquivo.cnpj !== processo.cnpj
      || arquivo.anoCompra !== processo.ano || arquivo.sequencialCompra !== processo.sequencial
      || !Number.isSafeInteger(arquivo.sequencialDocumento) || arquivo.sequencialDocumento < 1
      || typeof arquivo.titulo !== 'string' || !arquivo.titulo.trim()
      || typeof arquivo.tipoDocumentoNome !== 'string' || !arquivo.tipoDocumentoNome.trim()) continue;
    const url = `${listaUrl}/${arquivo.sequencialDocumento}`;
    arquivos.set(url, { nome: arquivo.titulo.trim().slice(0, 200), tipo: arquivo.tipoDocumentoNome.trim().slice(0, 100), url });
  }
  return [...arquivos.values()];
}

async function consultarEdital(processo, fetcher, signal) {
  const caminhoCompra = `/orgaos/${processo.cnpj}/compras/${processo.ano}/${processo.sequencial}`;
  const fonteUrl = `${PNCP}/api/consulta/v1${caminhoCompra}`;
  const [compra, arquivosEdital] = await Promise.all([
    consultarJson(fonteUrl, fetcher, signal),
    consultarAnexos(processo, caminhoCompra, fetcher, signal),
  ]);
  const datasEdital = {};
  let situacaoEdital;
  if (compra?.numeroControlePNCP === processo.numero) {
    const nome = ESTADOS_INTERROMPIDOS.get(compra.situacaoCompraId);
    if (nome) situacaoEdital = { codigo: compra.situacaoCompraId, nome, fonteUrl };
    if (compra.situacaoCompraId === 1) {
      const prazo = dataHoraPNCP(compra.dataEncerramentoProposta);
      if (prazo) {
        datasEdital.envioProposta = { dataHora: prazo, fonteUrl, referencia: 'PNCP' };
        const sessao = await consultarSessao(compra, prazo, fetcher, signal);
        if (sessao) datasEdital.sessaoPublica = sessao;
      }
    }
  }
  return { datasEdital, arquivosEdital, situacaoEdital };
}

export async function enriquecerEditaisLicitacoes(pesquisa, { fetcher, signal }) {
  const processos = new Map();
  const itens = [...pesquisa.oportunidades, ...pesquisa.candidatosRetidos].flatMap(item => {
    const processo = dadosPNCP(item);
    if (!processo) return [];
    processos.set(processo.numero, processo);
    return [[item, processo.numero]];
  });
  const fila = [...processos.values()].slice(0, MAX_PROCESSOS).values();
  const porProcesso = new Map();
  if (!processos.size || signal.aborted) return pesquisa;
  let avisarFim;
  const fimDoPrazo = new Promise(resolve => { avisarFim = resolve; });
  signal.addEventListener('abort', avisarFim, { once: true });
  try {
    const consultas = Promise.all(Array.from({ length: Math.min(CONSULTAS_SIMULTANEAS, processos.size) }, async () => {
      for (const processo of fila) {
        if (signal.aborted) return;
        const edital = await consultarEdital(processo, fetcher, signal);
        if (!signal.aborted) porProcesso.set(processo.numero, edital);
      }
    }));
    await Promise.race([consultas, fimDoPrazo]);
  } finally {
    signal.removeEventListener('abort', avisarFim);
  }
  for (const [item, numero] of itens) {
    const edital = porProcesso.get(numero);
    if (!edital) continue;
    if (Object.keys(edital.datasEdital).length) item.datasEdital = { ...item.datasEdital, ...edital.datasEdital };
    if (edital.arquivosEdital.length) item.arquivosEdital = edital.arquivosEdital;
    if (edital.situacaoEdital) item.situacaoEdital = edital.situacaoEdital;
  }
  return pesquisa;
}
