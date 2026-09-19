// Somente as duas empresas autorizadas; o nome do grupo não concede inclusão.
export function contaDaImpresilk(conta) {
  const titular = String(conta?.titular || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  return /^(?:impresilk|universo)(?:\s|$)/i.test(titular);
}
export function bancosDaImpresilk(mapa = {}) {
  return Object.fromEntries(Object.entries(mapa).filter(([, conta]) => contaDaImpresilk(conta)));
}
