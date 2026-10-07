import { financeiroDasLinhas, TOLERANCIA } from './financeiroOS.js';

// O sinal pode já estar incluído no título. A régua comum faz a conciliação;
// aqui só decidimos se há prova suficiente para exibir totais na venda.
export function resumoFinanceiroComercial(ordens, fonte, hoje) {
  if (!Array.isArray(ordens) || !ordens.length || !fonte?.temPagos) return {};
  const { porNumero } = financeiroDasLinhas(ordens, fonte, hoje);
  const resumo = {};
  for (const ordem of ordens) {
    const numero = String(ordem.numero ?? '');
    const linha = porNumero[numero];
    const coberta = !fonte.desdeDados || String(ordem.data ?? '').slice(0, 10) >= fonte.desdeDados;
    const titulo = linha?.pagoTitulos > 0 || linha?.aberto > 0;
    const fechado = Math.abs((linha?.recebido ?? 0) + (linha?.aReceber ?? 0) - (linha?.valor ?? 0)) <= TOLERANCIA;
    if (coberta && titulo && fechado && !linha.compartilhado && !linha.incerto && linha.resto <= TOLERANCIA && ['pago', 'aberto'].includes(linha.tipo)) {
      resumo[numero] = { recebido: linha.recebido, saldo: linha.aReceber };
    }
  }
  return resumo;
}
