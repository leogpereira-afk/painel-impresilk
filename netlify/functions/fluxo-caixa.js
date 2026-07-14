// Modulo 2: fluxo de caixa. Campos confirmados com o JSON real do Mubisys em
// 2026-07-14. Duas partes (?parte=):
//   parte=pagar  -> /contas-pagar (PENDENTE + VENCIDO) + 3 provisoes (campos cap_*),
//                   por VENCIMENTO numa janela de -30 a +60 dias.
//   parte=bancos -> /conta-bancaria. Exclui contas "Permuta" (credito de troca,
//                   nao e dinheiro em caixa) e as inativas.

import { mubiGetTudo, mubiConfigurado, json, semConfig, num, hojeMais } from "./lib/mubi.js";

function normalizarPagar(s, i) {
  return {
    id: String(s.id ?? `pag-${i}`),
    descricao: String(s.despesa || s.descricao || s.origem || "Saida"),
    categoria: String(s.centro_custo || s.tipo || "Fornecedor"),
    valor: num(s.valor_titulo),
    vencimento: String(s.data_vencimento || ""),
    tipo: "pagar",
  };
}

function normalizarProvisao(s, i, categoria) {
  return {
    id: String(s.id ?? `prov-${i}`),
    descricao: String(s.cap_despesa || s.cap_descricao || categoria),
    categoria,
    valor: num(s.cap_valor),
    vencimento: String(s.cap_vencimento || ""),
    tipo: "provisao",
  };
}

async function saidas() {
  const janela = { filtrodata: "VENCIMENTO", datainicial: hojeMais(-30), datafinal: hojeMais(60) };

  const [pendentes, vencidas, fixa, cartao, folha] = await Promise.all([
    mubiGetTudo("contas-pagar", { ...janela, status: "PENDENTE" }),
    mubiGetTudo("contas-pagar", { ...janela, status: "VENCIDO" }),
    mubiGetTudo("contas-pagar-provisao/despesa-fixa", janela),
    mubiGetTudo("contas-pagar-provisao/cartao-credito", janela),
    mubiGetTudo("contas-pagar-provisao/folha-pagamento", janela),
  ]);

  const vistos = new Set();
  const out = [];
  const add = (lista, mapear) => {
    lista.forEach((s, i) => {
      const n = mapear(s, i);
      const chave = `${n.tipo}:${n.id}`;
      if (!n.valor || vistos.has(chave)) return;
      vistos.add(chave);
      out.push(n);
    });
  };
  add(pendentes, normalizarPagar);
  add(vencidas, normalizarPagar);
  add(fixa, (s, i) => normalizarProvisao(s, i, "Despesa fixa"));
  add(cartao, (s, i) => normalizarProvisao(s, i, "Cartao"));
  add(folha, (s, i) => normalizarProvisao(s, i, "Folha"));
  return out;
}

async function bancos() {
  const arr = await mubiGetTudo("conta-bancaria");
  return arr
    .filter((b) => String(b.status || "").toLowerCase() === "ativo")
    // "Permuta" e credito de troca de mercadoria, nao compoe o caixa real.
    .filter((b) => !/permuta/i.test(String(b.titulo || "")))
    .map((b, i) => ({
      id: String(b.id ?? `cb-${i}`),
      banco: String(b.titulo || "Conta"),
      conta: String(b.empresa || ""),
      saldo: num(b.valor_saldo),
    }));
}

export const handler = async (event) => {
  if (!mubiConfigurado()) return semConfig();
  const parte = event.queryStringParameters?.parte || "pagar";
  try {
    if (parte === "bancos") return json(await bancos());
    return json(await saidas());
  } catch (e) {
    if (e.code === "SEM_CONFIG") return semConfig();
    return json({ erro: e.message }, 502);
  }
};
