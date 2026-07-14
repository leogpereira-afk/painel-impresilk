// Modulo 4: orcamentos (campos e status reais do Mubisys, 2026-07-14).
// Cada invocacao busca UMA pagina (limite de 10s da Function); o front junta.
//
// GET ?desde=AAAA-MM-DD&page=N -> { itens: [...], totalPaginas }
//
// Status reais: "Em aberto" (aberto), "Reprovado"/"Cancelada" (perdido),
// "Entregue"/"Em producao"/"Concluida"/"Ordem de servico" (ganho). Quando
// valor_total vem zerado, o valor real e a soma de itens[].valor_final.

import { mubiGetPagina, mubiConfigurado, json, semConfig, num, hojeMais } from "./lib/mubi.js";

function mapSituacao(status) {
  const s = String(status || "").toLowerCase();
  if (s.includes("cancel") || s.includes("reprov") || s.includes("recus") || s.includes("perd")) return "perdido";
  if (s.includes("aberto")) return "aberto";
  return "ganho";
}

function valorDoOrcamento(o) {
  const vt = num(o.valor_total);
  if (vt > 0) return vt;
  return (Array.isArray(o.itens) ? o.itens : []).reduce(
    (s, it) => s + (num(it.valor_final) || num(it.sub_total)),
    0
  );
}

export const handler = async (event) => {
  if (!mubiConfigurado()) return semConfig();
  const q = event.queryStringParameters || {};
  try {
    const anoInicio = `${new Date().getFullYear()}-01-01`;
    const desde = q.desde || anoInicio;
    const page = Math.max(1, parseInt(q.page, 10) || 1);
    const { lista, totalPaginas } = await mubiGetPagina(
      "orcamento",
      {
        status: "TODOS",
        filtrodata: "CADASTRO",
        datainicial: desde,
        datafinal: hojeMais(0),
      },
      page
    );

    const itensNorm = lista.map((o, i) => {
      const vendedor = String(o.vendedor || "").trim() || "Sem vendedor";
      return {
        id: String(o.id ?? `orc-${i}`),
        numero: String(o.sequencial_orcamento || o.id || ""),
        cliente: String(o.cliente || "Cliente"),
        vendedorId: vendedor,
        vendedorNome: vendedor,
        valor: valorDoOrcamento(o),
        situacao: mapSituacao(o.status),
        dataEnvio: String(o.data_cadastro || ""),
        dataFechamento: o.data_aprovacao || o.data_cancelamento || null,
        trabalho: String(o.nome_trabalho || ""),
      };
    });

    return json({ itens: itensNorm, totalPaginas });
  } catch (e) {
    if (e.code === "SEM_CONFIG") return semConfig();
    return json({ erro: e.message }, 502);
  }
};
