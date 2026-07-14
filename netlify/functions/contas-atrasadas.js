// Modulo 1: contas a receber em aberto. Campos confirmados com o JSON real do
// Mubisys em 2026-07-14 (origem, origem_cnpj, numero_nota_fiscal, despesa,
// valor_titulo, data_despesa, data_vencimento). Busca VENCIDO + PENDENTE por
// VENCIMENTO numa janela de -365 a +90 dias; o front filtra vencidos, calcula
// DSO e usa os a vencer no fluxo de caixa.

import { mubiGetTudo, mubiConfigurado, json, semConfig, num, hojeMais } from "./lib/mubi.js";

function normalizar(r, i) {
  return {
    id: String(r.id ?? `rec-${i}`),
    cliente: String(r.origem || "Cliente"),
    cnpj: String(r.origem_cnpj || ""),
    nf: String(r.numero_nota_fiscal || ""),
    os: String(r.despesa || ""),
    valor: num(r.valor_titulo),
    emissao: String(r.data_despesa || r.data_cadastro || ""),
    vencimento: String(r.data_vencimento || ""),
    situacao: "aberto",
  };
}

export const handler = async () => {
  if (!mubiConfigurado()) return semConfig();
  try {
    const base = {
      filtrodata: "VENCIMENTO",
      datainicial: hojeMais(-365),
      datafinal: hojeMais(90),
    };
    const [vencidos, pendentes] = await Promise.all([
      mubiGetTudo("contas-receber", { ...base, status: "VENCIDO" }),
      mubiGetTudo("contas-receber", { ...base, status: "PENDENTE" }),
    ]);

    const vistos = new Set();
    const abertos = [];
    [...vencidos, ...pendentes].forEach((r, i) => {
      const n = normalizar(r, i);
      if (!n.valor || vistos.has(n.id)) return;
      vistos.add(n.id);
      abertos.push(n);
    });

    return json(abertos);
  } catch (e) {
    if (e.code === "SEM_CONFIG") return semConfig();
    return json({ erro: e.message }, 502);
  }
};
