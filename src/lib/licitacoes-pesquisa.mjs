// Contrato de apresentação da pesquisa pública, sem consultas ou gravações.
export function normalizarBusca(valor) {
  return String(valor ?? '').normalize('NFD').replace(/\p{M}/gu, '')
    .toLocaleLowerCase('pt-BR').replace(/[’'`´]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function instanteISO(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(valor)) return NaN;
  const dia = valor.slice(0, 10);
  const data = new Date(`${dia}T00:00:00Z`);
  if (!Number.isFinite(data.getTime()) || data.toISOString().slice(0, 10) !== dia) return NaN;
  return Date.parse(valor);
}

export function filtrarOportunidades(oportunidades, filtros = {}, agora = new Date().toISOString()) {
  const termos = normalizarBusca(filtros.busca).split(' ').filter(Boolean);
  const referencia = instanteISO(agora);
  const igual = (valor, esperado) => !esperado || normalizarBusca(valor) === normalizarBusca(esperado);
  return (Array.isArray(oportunidades) ? oportunidades : []).filter(item => {
    const destinos = Array.isArray(item.municipiosAbrangidos) ? item.municipiosAbrangidos : [];
    const texto = normalizarBusca([item.processo, item.orgao, item.produto, item.item, item.lote, ...destinos].join(' '));
    return termos.every(termo => texto.includes(termo))
      && igual(item.classificacao, filtros.classificacao)
      && igual(item.orgao, filtros.orgao) && igual(item.produto, filtros.produto)
      && (!filtros.municipio || destinos.some(destino => igual(destino, filtros.municipio)));
  }).sort((a, b) => {
    const dataA = instanteISO(a.prazo), dataB = instanteISO(b.prazo);
    const grupo = data => !Number.isFinite(data) ? 2 : data < referencia ? 1 : 0;
    return grupo(dataA) - grupo(dataB)
      || (Number.isFinite(dataA) ? dataA : Infinity) - (Number.isFinite(dataB) ? dataB : Infinity)
      || String(a.processo ?? '').localeCompare(String(b.processo ?? ''), 'pt-BR');
  });
}

export function resumoCobertura(cobertura = {}) {
  const quantidade = valor => Number.isInteger(valor) && valor >= 0 && valor <= 89 ? valor : 0;
  const concluidos = quantidade(cobertura.concluidos), parciais = quantidade(cobertura.parciais);
  const naoConsultados = quantidade(cobertura.naoConsultados);
  const coberturaPercentual = Math.round(concluidos / 89 * 10000) / 100;
  return { totalMunicipios: 89, concluidos, parciais, naoConsultados, coberturaPercentual,
    inconsistente: cobertura.totalMunicipios !== 89 || concluidos + parciais + naoConsultados !== 89
      || cobertura.coberturaPercentual !== coberturaPercentual };
}

export function formatarData(valor, incluirHora = false) {
  const data = typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)
    ? new Date(`${valor}T12:00:00Z`) : new Date(valor);
  if (!valor || !Number.isFinite(data.getTime())) return 'Não informado';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
    ...(incluirHora ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(data);
}

export function prazoOportunidade(valor, agora = new Date().toISOString()) {
  const prazo = instanteISO(valor), referencia = instanteISO(agora);
  if (!Number.isFinite(prazo) || !Number.isFinite(referencia)) return { valido: false, encerrado: false, proximo: false, texto: 'Prazo a confirmar' };
  const encerrado = prazo < referencia;
  return { valido: true, encerrado, proximo: !encerrado && prazo - referencia <= 3 * 86400000,
    texto: encerrado ? 'Prazo encerrado' : `Até ${formatarData(valor, true)}` };
}

export function relatorioAntigo(geradoEm, agora = new Date().toISOString()) {
  const geracao = instanteISO(geradoEm), referencia = instanteISO(agora);
  return Number.isFinite(geracao) && Number.isFinite(referencia) && referencia - geracao >= 8 * 86400000;
}

export function urlOficialSegura(valor) {
  if (typeof valor !== 'string' || /[\s\\\u0000-\u001f\u007f]/.test(valor)) return null;
  try {
    const url = new URL(valor);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || !host.includes('.')
      || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')
      || host.startsWith('[') || /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)) return null;
    return url.href;
  } catch { return null; }
}

export function urlBotSegura(bot) {
  if (!bot || typeof bot.username !== 'string' || !/^[a-zA-Z0-9_]+$/.test(bot.username)) return null;
  const segura = urlOficialSegura(bot.url);
  if (!segura) return null;
  const url = new URL(segura);
  return url.hostname === 't.me' && !url.port && url.pathname === `/${bot.username}` && !url.search && !url.hash ? segura : null;
}

export function exportarCSV(cabecalhos, linhas) {
  const celula = valor => {
    const texto = String(valor ?? '').replace(/\r\n|\r|\n/g, ' ');
    const seguro = /^\s*[=+\-@]/.test(texto) ? `'${texto}` : texto;
    return `"${seguro.replaceAll('"', '""')}"`;
  };
  return '\uFEFF' + [cabecalhos, ...linhas].map(linha => linha.map(celula).join(';')).join('\r\n');
}

export function paginar(linhas, pagina = 1, tamanho = 12) {
  const dados = Array.isArray(linhas) ? linhas : [];
  const limite = Number.isInteger(tamanho) && tamanho > 0 ? tamanho : 12;
  const totalPaginas = Math.max(1, Math.ceil(dados.length / limite));
  const atual = Math.min(totalPaginas, Math.max(1, Number.isInteger(pagina) ? pagina : 1));
  return { pagina: atual, totalPaginas, itens: dados.slice((atual - 1) * limite, atual * limite) };
}
