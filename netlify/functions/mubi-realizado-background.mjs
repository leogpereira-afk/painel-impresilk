// Fluxo REALIZADO mes a mes: o que de fato entrou (contas-receber PAGO) e saiu
// (contas-pagar PAGO), agrupado por mes de PAGAMENTO, para os ultimos anos.
//
// Fica numa background function separada da mubi-cache-background porque busca
// MUITA pagina (todos os titulos pagos do ano, ~11 paginas/ano) e o Mubisys e
// lento em horario comercial -- juntar tudo num ciclo so estouraria o tempo.
// Roda uma vez por dia de madrugada; o historico mensal muda pouco.
//
// SUTILEZA: um titulo pode ser pago em PARCELAS, em datas (e meses) diferentes.
// O valor real de cada pagamento esta no array `pagamentos[]`, cada um com sua
// `data_pagamento` e `valor`. Somar o campo do topo (`valor_pagamento`) perderia
// as parcelas e as vezes vem zerado. Entao a agregacao percorre `pagamentos[]`.
// Validado contra 2026 (1.550 receber + 3.081 pagar pagos): fecha.

import { getStore } from "@netlify/blobs";
import { mubiGetTudo, mubiConfigurado, num } from "./lib/mubi.js";

// Quantos anos para tras trazer (alem do corrente), para permitir comparar.
const ANOS_ATRAS = 1;

const mesDe = (s) => (s ? String(s).slice(0, 7) : null); // "YYYY-MM"

// Soma os pagamentos de um titulo por mes, dentro do ano alvo.
function acumular(destino, titulos, ano) {
  for (const t of titulos) {
    const pagamentos =
      Array.isArray(t.pagamentos) && t.pagamentos.length
        ? t.pagamentos
        : t.data_pagamento
          ? [{ data_pagamento: t.data_pagamento, valor: t.valor_pagamento }]
          : [];
    for (const p of pagamentos) {
      const mes = mesDe(p.data_pagamento || p.data_credito);
      if (!mes || !mes.startsWith(String(ano))) continue;
      destino[mes] = (destino[mes] || 0) + (num(p.valor) || 0);
    }
  }
}

async function realizadoDoAno(ano) {
  const janela = {
    status: "PAGO",
    filtrodata: "PAGAMENTO",
    datainicial: `${ano}-01-01`,
    // ano+1: a datafinal do ERP corta na meia-noite; "ate 31/12" perderia o
    // proprio 31/12 (pagamento tem hora). O upsert nao duplica o excedente.
    datafinal: `${ano + 1}-01-01`,
  };
  const [receber, pagar] = await Promise.all([
    mubiGetTudo("contas-receber", janela),
    mubiGetTudo("contas-pagar", janela),
  ]);
  const entradas = {};
  const saidas = {};
  acumular(entradas, receber, ano);
  acumular(saidas, pagar, ano);
  return {
    entradas,
    saidas,
    contagens: { receber: receber.length, pagar: pagar.length },
  };
}

export default async (req) => {
  const SEGREDO = process.env.TOKEN;
  if (!SEGREDO) {
    console.error("mubi-realizado: TOKEN nao configurado");
    return new Response(JSON.stringify({ erro: "servidor sem TOKEN" }), { status: 500 });
  }
  if (req.headers.get("x-token") !== SEGREDO) {
    return new Response(JSON.stringify({ erro: "nao autorizado" }), { status: 401 });
  }
  if (!mubiConfigurado()) {
    return new Response(JSON.stringify({ erro: "Mubi nao configurado" }), { status: 501 });
  }

  const store = getStore("painel");
  const inicio = Date.now();

  // Ano de referencia: aceita ?ano=2025 (backfill manual); senao usa o corrente.
  const anoParam = Number(new URL(req.url).searchParams.get("ano"));
  const anoBase = Number.isInteger(anoParam) && anoParam > 2000 ? anoParam : new Date().getUTCFullYear();
  const anos = [];
  for (let a = anoBase; a > anoBase - 1 - ANOS_ATRAS; a--) anos.push(a);

  try {
    const porAno = {};
    const contagens = {};
    for (const ano of anos) {
      const r = await realizadoDoAno(ano);
      porAno[ano] = { entradas: r.entradas, saidas: r.saidas };
      contagens[ano] = r.contagens;
    }

    // Merge com o que ja existia (para nao apagar anos buscados em outra corrida).
    const anterior = (await store.get("cache_fluxo_mensal", { type: "json" })) || {};
    const anosMescla = { ...(anterior.anos || {}), ...porAno };

    await store.setJSON("cache_fluxo_mensal", {
      em: new Date().toISOString(),
      anos: anosMescla,
      disponiveis: Object.keys(anosMescla)
        .map(Number)
        .sort((a, b) => b - a),
      contagens,
      duracaoMs: Date.now() - inicio,
    });

    console.log("mubi-realizado: fim ok", JSON.stringify(contagens));
    return new Response(JSON.stringify({ ok: true, anos, contagens }), { status: 200 });
  } catch (e) {
    console.error("mubi-realizado: ERRO", e?.message || e);
    return new Response(JSON.stringify({ erro: "falha ao montar o realizado" }), { status: 502 });
  }
};
