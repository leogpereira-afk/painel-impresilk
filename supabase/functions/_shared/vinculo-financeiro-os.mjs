// A descrição de um movimento financeiro não é uma chave de O.S.
// Empréstimos/aportes podem citar um serviço como referência, mas não são
// pagamentos do cliente e não reduzem o saldo da venda.
export function numerosDeOSComercial(descricao) {
  const texto = String(descricao ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (/\bEMPRESTIM\w*\b|\bAPORTE\b|\bTRANSFERENCIA\b|\bSEM\s+O\.?\s*S\.?\b/.test(texto)) return [];
  const numerica = /^[\d\s,;|/+.\-E]+$/.test(texto);
  // Em texto livre, só os números logo após O.S.; datas e NF adiante não
  // viram serviços adicionais por coincidência.
  const referencias = numerica ? [texto] : [...texto.matchAll(/\bO\.?\s*S\.?\s*[:#=\-]?\s*(\d{1,12}(?:\s*[,;|/+E\-]\s*\d{1,12})*)/g)].map(m => m[1]);
  return [...new Set(referencias.flatMap(r => r.match(/\d{1,12}/g) || []))];
}
