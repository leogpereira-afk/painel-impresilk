// Produtos: o Mubi nao tem endpoint de vendas por produto. Faturamento e volume
// saem dos itens das Ordens de Servico, agregados por produto e por mes desde a
// virada do ano. Variacao medida do mes corrente contra janeiro.

import { diaLocalISO, rotuloMes } from "../format.js";

export function calcProdutos(ordens, catalogo, config) {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mesAtual = hoje.getMonth(); // 0-based

  const meses = [];
  for (let m = 0; m <= mesAtual; m++) {
    meses.push({
      chave: `${ano}-${String(m + 1).padStart(2, "0")}`,
      rotulo: rotuloMes(`${ano}-${String(m + 1).padStart(2, "0")}`),
      idx: m,
    });
  }

  // Estrutura: produto -> mesIdx -> {faturamento, volume}
  const acc = {};
  for (const p of catalogo) {
    acc[p.id] = { info: p, meses: meses.map(() => ({ faturamento: 0, volume: 0 })) };
  }

  for (const os of ordens) {
    const dia = diaLocalISO(os.data);
    const [a, m] = dia.split("-");
    if (Number(a) !== ano) continue;
    const idx = Number(m) - 1;
    if (idx < 0 || idx > mesAtual) continue;
    for (const it of os.itens || []) {
      const bucket = acc[it.produtoId];
      if (!bucket) continue;
      bucket.meses[idx].faturamento += it.valorTotal || 0;
      bucket.meses[idx].volume += it.quantidade || 0;
    }
  }

  const varPct = (ini, fim) => {
    if (!ini) return fim > 0 ? 100 : 0;
    return Math.round(((fim - ini) / ini) * 100);
  };

  const ranking = Object.values(acc).map(({ info, meses: mm }) => {
    const faturamento = mm.reduce((s, x) => s + x.faturamento, 0);
    const volume = mm.reduce((s, x) => s + x.volume, 0);
    const jan = mm[0] || { faturamento: 0, volume: 0 };
    const atual = mm[mm.length - 1] || { faturamento: 0, volume: 0 };
    return {
      produtoId: info.id,
      nome: info.nome,
      categoria: info.categoria,
      faturamento,
      volume,
      fatJaneiro: jan.faturamento,
      fatAtual: atual.faturamento,
      volJaneiro: jan.volume,
      volAtual: atual.volume,
      varFat: varPct(jan.faturamento, atual.faturamento),
      varVol: varPct(jan.volume, atual.volume),
      serie: mm.map((x, i) => ({
        mes: meses[i].rotulo,
        faturamento: x.faturamento,
        volume: x.volume,
      })),
    };
  });

  const porFaturamento = [...ranking].sort((a, b) => b.faturamento - a.faturamento);
  const lider = porFaturamento[0] || null;
  const maiorAlta = [...ranking].sort((a, b) => b.varFat - a.varFat)[0] || null;
  const maiorQueda = [...ranking].sort((a, b) => a.varFat - b.varFat)[0] || null;

  // Serie combinada para o grafico: maior alta x maior queda.
  const chartData = meses.map((mm, i) => ({
    mes: mm.rotulo,
    alta: maiorAlta ? maiorAlta.serie[i].faturamento : 0,
    queda: maiorQueda ? maiorQueda.serie[i].faturamento : 0,
  }));

  return {
    ranking: porFaturamento,
    lider,
    liderEmQueda: !!lider && lider.varFat < 0,
    maiorAlta,
    maiorQueda,
    meses: meses.map((m) => m.rotulo),
    chartData,
    totalFaturamento: ranking.reduce((s, r) => s + r.faturamento, 0),
    totalVolume: ranking.reduce((s, r) => s + r.volume, 0),
  };
}
