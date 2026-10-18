import { normal, pertence, resolverEscopo } from './comercial.mjs';

export const INSTALLATION_ORDER_LIMIT = 500;
const PAGE_SIZE = 20;
const failure = (message, status = 400) => Object.assign(new Error(message), { status });
const scalar = (value, limit) => {
  if (!(typeof value === 'string' || typeof value === 'number' && Number.isFinite(value))) return '';
  const text = String(value).trim();
  return text && text.length <= limit && !/[\u0000-\u001f\u007f]/.test(text) ? text : '';
};

export function installationOrderQuery({ busca, pagina = 1 } = {}) {
  if (typeof busca !== 'string') throw failure('Informe o número da O.S. ou parte do nome do cliente.');
  const text = busca.trim();
  if (!text || text.length > 120 || /[\u0000-\u001f\u007f%_*\\]/.test(text)) throw failure('Use até 120 caracteres, sem curingas, na busca da O.S.');
  const number = /^#?\s*\d+$/.test(text) ? text.replace(/^#\s*/, '') : null;
  if (!number && text.length < 3) throw failure('Digite ao menos três caracteres do cliente ou o número completo da O.S.');
  if (!Number.isInteger(pagina) || pagina < 1 || pagina > 25) throw failure('Página da consulta inválida.');
  return { text, number, page: pagina };
}

// The source is the synchronized O.S. ID, never its display number or client.
// Company must be present in that record; a missing company is not Impresilk.
export function installationOrderReference(row) {
  const details = row?.comercial && typeof row.comercial === 'object' ? row.comercial : row;
  const id = scalar(row?.id, 100), number = scalar(row?.numero, 80), client = scalar(row?.cliente, 240);
  const records = details === row ? [row] : [details, row];
  const companies = records.flatMap(record => [record?.empresaNome, record?.empresa_nome, typeof record?.empresa === 'string' ? record.empresa : record?.empresa?.nome]).filter(value => value != null && value !== '');
  const companyIds = records.flatMap(record => [record?.empresaId, record?.empresa_id, record?.empresa?.id]).filter(value => value != null && value !== '');
  if (companies.some(value => !scalar(value, 180)) || new Set(companies.map(normal)).size !== 1 || new Set(companyIds.map(String)).size > 1) return null;
  if (details?.id != null && String(details.id) !== id) return null;
  const company = scalar(companies[0], 180);
  if (!id || !number || !client || !company) return null;
  return { source: 'painel-os', id, number, client, company };
}

export function installationOrdersPage(rows, scope, input, consultedAt = new Date().toISOString()) {
  const query = installationOrderQuery(input);
  const candidates = rows.filter(row => query.number !== null
    ? String(row.numero) === query.number
    : String(row.cliente || '').toLocaleLowerCase('pt-BR').includes(query.text.toLocaleLowerCase('pt-BR')));
  // No partial page: a broad query must be refined before authorization/pagination.
  if (candidates.length > INSTALLATION_ORDER_LIMIT) throw failure('Muitas O.S. correspondem à busca. Informe o número completo ou um nome de cliente mais específico.', 422);
  const unique = new Map();
  for (const row of candidates) {
    if (!pertence({ ...row, ...row.comercial }, scope)) continue;
    const order = installationOrderReference(row);
    if (!order) continue;
    const key = JSON.stringify([order.source, normal(order.company), order.id]), previous = unique.get(key);
    if (unique.has(key) && (!previous || previous.number !== order.number || previous.client !== order.client)) unique.set(key, null);
    else if (!unique.has(key)) unique.set(key, order);
  }
  const orders = [...unique.values()].filter(Boolean), total = orders.length, pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (query.page > pages) throw failure('Página fora dos resultados desta consulta.');
  return { source: 'painel-os', orders: orders.slice((query.page - 1) * PAGE_SIZE, query.page * PAGE_SIZE), page: query.page, pages, total, consultedAt };
}

export async function consultarOrdensInstalacao(sb, session, input) {
  const query = installationOrderQuery(input);
  const [{ data: catalog, error: catalogError }, { data: config, error: configError }] = await Promise.all([
    sb.from('painel_cache').select('valor').eq('chave', 'comercial_catalogo').maybeSingle(),
    sb.from('painel_registros').select('registro').eq('colecao', 'comercial_config').eq('id', 'regras').maybeSingle(),
  ]);
  if (catalogError || configError || !catalog?.valor?.completo) throw failure('O catálogo comercial está indisponível. Tente novamente após a sincronização.', 503);
  const scope = resolverEscopo(session, catalog.valor, config?.registro || {}, input.filtro || {});
  let request = sb.from('painel_ordens').select('id,numero,cliente,vendedor,comercial').order('data', { ascending: false }).order('id');
  request = query.number !== null ? request.eq('numero', query.number) : request.ilike('cliente', `%${query.text}%`);
  const { data, error } = await request.range(0, INSTALLATION_ORDER_LIMIT);
  if (error || !Array.isArray(data)) throw failure('Não foi possível consultar as O.S. sincronizadas. Tente novamente.', 503);
  if (data.length > INSTALLATION_ORDER_LIMIT) throw failure('Muitas O.S. correspondem à busca. Informe o número completo ou um nome de cliente mais específico.', 422);
  // Authorization precedes the UI page, so another seller's records cannot hide
  // authorized matches. The bounded SQL query never loads the whole history.
  return installationOrdersPage(data, scope, input);
}
