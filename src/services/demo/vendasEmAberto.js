/* A resposta da porta vendasEmAberto no modo de revisão (dados fictícios).
   Os títulos abertos da demonstração viram as parcelas das O.S. que eles citam;
   das O.S. sem título, uma em três aparece quitada e uma em três paga em parte,
   para a aba ter todos os estados. */
import { getRecebiveis, getOrdensServico } from "./dados.js";

export function respostaDemo() {
  const ordens = getOrdensServico();
  const numeros = new Set(ordens.map((o) => String(o.numero)));
  const abertos = getRecebiveis()
    .filter((r) => numeros.has(String(r.os)))
    .map((r) => ({ id: r.id, os: String(r.os), valor: r.valor, pago: r.pago || 0, vencimento: r.vencimento, compartilhado: false, incerto: false }));
  const comTitulo = new Set(abertos.map((a) => a.os));
  const pagosPorOS = {};
  ordens.forEach((o, i) => {
    if (comTitulo.has(String(o.numero))) return;
    if (i % 3 === 0) pagosPorOS[o.numero] = [o.valor, 0, 0];
    else if (i % 3 === 1) pagosPorOS[o.numero] = [Math.round(o.valor * 0.6 * 100) / 100, 0, 0];
  });
  return { abertos, pagosPorOS, permutaDaOS: {}, consultadas: [...numeros], temPagos: true, desdeDados: "2025-01-01", incertos: 0 };
}
