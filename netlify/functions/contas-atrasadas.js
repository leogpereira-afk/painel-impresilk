// Modulo 1: contas a receber em aberto (campos reais do Mubisys, 2026-07-14).
// Cada invocacao busca UMA pagina de UM status (limite de 10s da Function);
// o front chama VENCIDO e PENDENTE e junta as paginas.
//
// GET ?status=VENCIDO|PENDENTE&page=N
// -> { itens: [...], totalPaginas: N }

import { mubiGetPagina, mubiConfigurado, json, semConfig, num, hojeMais } from "./lib/mubi.js";

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

export const handler = async (event) => {
  if (!mubiConfigurado()) return semConfig();
  const q = event.queryStringParameters || {};
  const status = q.status === "PENDENTE" ? "PENDENTE" : "VENCIDO";
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  try {
    const { lista, totalPaginas } = await mubiGetPagina(
      "contas-receber",
      {
        status,
        filtrodata: "VENCIMENTO",
        datainicial: hojeMais(-365),
        datafinal: hojeMais(90),
      },
      page
    );
    return json({
      itens: lista.map(normalizar).filter((n) => n.valor > 0),
      totalPaginas,
    });
  } catch (e) {
    if (e.code === "SEM_CONFIG") return semConfig();
    return json({ erro: e.message }, 502);
  }
};
