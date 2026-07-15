// Produtos: o Mubi nao tem endpoint de vendas por produto. Faturamento e volume
// saem dos itens das Ordens de Servico, agregados por PRODUTO e por FAMILIA
// (a categoria do cadastro), mes a mes desde a virada do ano.
//
// Os TOTAIS somam tudo no ano (inclui o mes corrente em andamento); a VARIACAO e
// a tendencia comparam janeiro contra o ULTIMO MES FECHADO, para nao mostrar
// "queda" so porque o mes atual esta pela metade.
//
// FURO DE CADASTRO: nao existe item sem produto no Mubisys. O que existe sao
// duas falhas de CADASTRO, marcadas explicitamente pela normalizacao:
//   "Sem categoria"    -> o produto existe, mas ninguem preencheu a categoria
//   "Fora do catalogo" -> a OS usa um nome que nao esta mais no catalogo
// Sao familias falsas: o dinheiro e real e continua no ranking, mas nunca sao
// eleitas lider nem maior alta/queda -- senao o destaque perde o sentido. A
// deteccao e por rotulo exato (nao regex no nome), para que uma familia real
// chamada "Outros" concorra normalmente.

import { diaLocalISO, rotuloMes } from "../format.js";

export const ROTULOS_SEM_CADASTRO = ["Sem categoria", "Fora do catalogo"];
const semCadastro = new Set(ROTULOS_SEM_CADASTRO);

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

  const zeros = () => meses.map(() => ({ faturamento: 0, volume: 0 }));

  // Duas agregacoes a partir dos mesmos itens: por produto e por familia. Cada
  // uma guarda tambem a COMPOSICAO -- o que somou para dar aquele numero --
  // para a tela poder abrir o detalhe (familia -> produtos, produto -> modelos).
  const accProd = {};
  for (const p of catalogo) {
    accProd[p.id] = { chave: p.id, nome: p.nome, categoria: p.categoria, meses: zeros(), comp: {} };
  }
  const accFam = {};

  const somaComp = (destino, rotulo, fat, vol) => {
    const c = (destino[rotulo] ||= { nome: rotulo, faturamento: 0, volume: 0 });
    c.faturamento += fat;
    c.volume += vol;
  };

  for (const os of ordens) {
    const dia = diaLocalISO(os.data);
    const [a, m] = dia.split("-");
    if (Number(a) !== ano) continue;
    const idx = Number(m) - 1;
    if (idx < 0 || idx > mesAtual) continue;
    for (const it of os.itens || []) {
      const fat = it.valorTotal || 0;
      const vol = it.quantidade || 0;

      const bp = accProd[it.produtoId];
      if (bp) {
        bp.meses[idx].faturamento += fat;
        bp.meses[idx].volume += vol;
        somaComp(bp.comp, String(it.modelo || "").trim() || "Sem modelo", fat, vol);
      }

      const fam = String(it.categoria || "").trim() || "Sem categoria";
      const bf = (accFam[fam] ||= { chave: fam, nome: fam, categoria: fam, meses: zeros(), comp: {} });
      bf.meses[idx].faturamento += fat;
      bf.meses[idx].volume += vol;
      somaComp(bf.comp, it.produto || it.produtoId, fat, vol);
    }
  }

  // Variacao percentual so faz sentido com base (janeiro) positiva. Base zero
  // (lancado depois de janeiro) retorna null -> tratado como "novo", sem
  // inventar um +100% que competiria mal no ranking de maior alta.
  const varPct = (ini, fim) => (ini > 0 ? Math.round(((fim - ini) / ini) * 100) : null);

  // Monta ranking + lider + maior alta/queda + serie do grafico para UMA dimensao.
  function montarDimensao(acc, rotuloDim) {
    const ranking = Object.values(acc)
      .map((b) => {
        const mm = b.meses;
        const faturamento = mm.reduce((s, x) => s + x.faturamento, 0);
        const volume = mm.reduce((s, x) => s + x.volume, 0);
        const jan = mm[0] || { faturamento: 0, volume: 0 };
        const fim = mm[idxFim] || { faturamento: 0, volume: 0 };
        // Composicao: o que somou para dar este numero, do maior para o menor,
        // ja com o peso de cada parte no total da linha.
        const composicao = Object.values(b.comp)
          .filter((c) => c.faturamento > 0 || c.volume > 0)
          .sort((x, y) => y.faturamento - x.faturamento)
          .map((c) => ({ ...c, pct: faturamento > 0 ? (c.faturamento / faturamento) * 100 : 0 }));

        return {
          produtoId: b.chave,
          nome: b.nome,
          categoria: b.categoria,
          balde: semCadastro.has(b.nome),
          composicao,
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
          serie: mm.slice(0, idxFim + 1).map((x, i) => ({
            mes: meses[i].rotulo,
            faturamento: x.faturamento,
            volume: x.volume,
          })),
        };
      })
      .filter((r) => r.faturamento > 0 || r.volume > 0)
      .sort((a, b) => b.faturamento - a.faturamento);

    // Lider e destaques ignoram o balde (nao e produto nem segmento de verdade).
    const reais = ranking.filter((r) => !r.balde);
    const lider = reais[0] || null;
    const comBase = reais.filter((r) => r.varFat != null);
    const maiorAlta = [...comBase].sort((a, b) => b.varFat - a.varFat)[0] || null;
    const maiorQueda = [...comBase].sort((a, b) => a.varFat - b.varFat)[0] || null;

    const mesesFechados = meses.slice(0, idxFim + 1);
    const chartData = mesesFechados.map((mm, i) => ({
      mes: mm.rotulo,
      alta: maiorAlta ? maiorAlta.serie[i]?.faturamento || 0 : 0,
      queda: maiorQueda ? maiorQueda.serie[i]?.faturamento || 0 : 0,
    }));

    const balde = ranking.find((r) => r.balde) || null;

    return {
      rotuloDim,
      ranking,
      lider,
      liderEmQueda: !!lider && lider.varFat != null && lider.varFat < 0,
      maiorAlta,
      maiorQueda,
      chartData,
      balde,
      totalFaturamento: ranking.reduce((s, r) => s + r.faturamento, 0),
      totalVolume: ranking.reduce((s, r) => s + r.volume, 0),
    };
  }

  const produtos = montarDimensao(accProd, "produto");
  const familias = montarDimensao(accFam, "familia");

  return {
    meses: meses.slice(0, idxFim + 1).map((m) => m.rotulo),
    // Dimensao PRODUTO no topo (compatibilidade com a tela atual).
    ...produtos,
    // Dimensao FAMILIA (segmento): mesma forma, para a tela alternar.
    produtos,
    familias,
    totalFaturamento: produtos.totalFaturamento,
    totalVolume: produtos.totalVolume,
  };
}
