import { chamarComercial } from './comercial.js';

const field = (value, limit) => typeof value === 'string' && !!value.trim() && value.length <= limit && !/[\u0000-\u001f\u007f]/.test(value);
const normalizedCompany = value => String(value).trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
export function validInstallationOrder(order) {
  return order?.source === 'painel-os' && field(order.id, 100) && field(order.number, 80) && field(order.client, 240) && field(order.company, 180);
}
export const installationOrderKey = order => validInstallationOrder(order) ? JSON.stringify([order.source, order.company, order.id]) : '';
export function linkInstallationOrder(order, now = new Date().toISOString()) {
  if (!validInstallationOrder(order)) throw new Error('Selecione uma O.S. identificada na consulta.');
  return { source: 'painel-os', id: order.id, number: order.number, client: order.client, company: order.company, linkedAt: now };
}

export async function searchInstallationOrders(search, page = 1, signal, request = chamarComercial) {
  const result = await request('consultarOrdensInstalacao', { busca: search, pagina: page }, signal);
  if (result?.source !== 'painel-os' || !Array.isArray(result.orders) || result.orders.some(order => !validInstallationOrder(order))) throw new Error('A consulta não retornou O.S. com identidade verificável.');
  return result;
}

export async function consultInstallationOrder(order, signal, request = chamarComercial) {
  if (!validInstallationOrder(order)) throw new Error('O vínculo salvo está incompleto. Selecione novamente a O.S.');
  const result = await request('consultarPedido', { ordemId: order.id }, signal);
  if (String(result?.pedido?.id ?? '') !== order.id) throw new Error('O registro consultado não corresponde à O.S. vinculada.');
  const record = result.pedido;
  const companies = [record.empresaNome, record.empresa_nome, record.company, typeof record.empresa === 'string' ? record.empresa : record.empresa?.nome].filter(value => value != null && value !== '');
  if (companies.some(value => !field(value, 180) || normalizedCompany(value) !== normalizedCompany(order.company))) throw new Error('A empresa da O.S. consultada diverge do vínculo salvo. Confira e selecione novamente a ordem.');
  return { ...result, companyVerified: companies.length > 0 };
}

// Abort saves work when supported; the generation check also rejects late
// resolutions from transports/mocks that ignore AbortSignal.
export function latestInstallationRequest() {
  let generation = 0, controller;
  const cancel = () => { generation += 1; controller?.abort(); };
  return {
    cancel,
    async run(request) {
      cancel();
      controller = new AbortController();
      const own = generation, signal = controller.signal;
      try {
        const value = await request(signal);
        return own === generation && !signal.aborted ? { current: true, value } : { current: false };
      } catch (error) {
        return own === generation && !signal.aborted ? { current: true, error } : { current: false };
      }
    },
  };
}
