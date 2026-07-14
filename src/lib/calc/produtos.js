// Produtos: o Mubi nao tem endpoint de vendas por produto. Faturamento e volume
// saem dos itens das Ordens de Servico, agregados por produto e por mes desde a
// virada do ano. Os TOTAIS somam tudo no ano (inclui o mes corrente em
// andamento); a VARIACAO e a tendencia comparam janeiro contra o ULTIMO MES
// FECHADO, para nao mostrar "queda" so porque o mes atual esta pela metade.

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

  // Ultimo mes fechado: se hoje nao e o ultimo dia do mes, o mes corrente esta
  // incompleto, entao a comparacao para no mes anterior. Nunca abaixo de janeiro.
  const ultimoDiaDoMes = new Date(ano, mesAtual + 1, 0).getDate();
  const mesCorrenteFechado = hoje.getDate() >= ultimoDiaDoMes;
  const idxFim = mesAtual === 0 ? 0 : mesCorrenteFechado ? mesAtual : mesAtual - 1;

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

  // Variacao percentual so faz sentido com base (janeiro) positiva. Base zero
  // (produto lancado depois de janeiro) retorna null -> tratado como "novo",
  // sem inventar um +100% que competiria mal no ranking de maior alta.
  const varPct = (ini, fim) => (ini > 0 ? Math.round(((fim - ini) / ini) * 100) : null);

  const ranking = Object.values(acc).map(({ info, meses: mm }) => {
    const faturamento = mm.reduce((s, x) => s + x.faturamento, 0);
    const volume = mm.reduce((s, x) => s + x.volume, 0);
    const jan = mm[0] || { faturamento: 0, volume: 0 };
    // "atual" para a variacao = ultimo mes fechado (nao o mes em andamento).
    const fim = mm[idxFim] || { faturamento: 0, volume: 0 };
    return {
      produtoId: info.id,
      nome: info.nome,
      categoria: info.categoria,
      faturamento,
      volume,
      fatJaneiro: jan.faturamento,
      fatAtual: fim.faturamento,
      volJaneiro: jan.volume,
      volAtual: fim.volume,
      varFat: varPct(jan.faturamento, fim.faturamento),
      varVol: varPct(jan.volume, fim.volume),
      novoFat: jan.faturamento === 0 && fim.faturamento > 0,
      novoVol: jan.volume === 0 && fim.volume > 0,
      // Serie/tendencia so ate o ultimo mes fechado, para o grafico nao
      // despencar por causa do mes corrente incompleto.
      serie: mm.slice(0, idxFim + 1).map((x, i) => ({
        mes: meses[i].rotulo,
        faturamento: x.faturamento,
        volume: x.volume,
      })),
    };
  });

  const porFaturamento = [...ranking].sort((a, b) => b.faturamento - a.faturamento);
  const lider = porFaturamento[0] || null;
  // Maior alta/queda so entre produtos com base real (varFat != null).
  const comBase = ranking.filter((r) => r.varFat != null);
  const maiorAlta = [...comBase].sort((a, b) => b.varFat - a.varFat)[0] || null;
  const maiorQueda = [...comBase].sort((a, b) => a.varFat - b.varFat)[0] || null;

  // Serie combinada para o grafico: maior alta x maior queda, so ate o ultimo
  // mes fechado (mesma janela da variacao).
  const mesesFechados = meses.slice(0, idxFim + 1);
  const chartData = mesesFechados.map((mm, i) => ({
    mes: mm.rotulo,
    alta: maiorAlta ? maiorAlta.serie[i]?.faturamento || 0 : 0,
    queda: maiorQueda ? maiorQueda.serie[i]?.faturamento || 0 : 0,
  }));

  return {
    ranking: porFaturamento,
    lider,
    liderEmQueda: !!lider && lider.varFat < 0,
    maiorAlta,
    maiorQueda,
    meses: mesesFechados.map((m) => m.rotulo),
    chartData,
    totalFaturamento: ranking.reduce((s, r) => s + r.faturamento, 0),
    totalVolume: ranking.reduce((s, r) => s + r.volume, 0),
  };
}
