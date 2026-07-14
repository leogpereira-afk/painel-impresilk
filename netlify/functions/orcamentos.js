// Modulo 4: orcamentos. Campos e status confirmados com o JSON real do Mubisys
// em 2026-07-14. Status reais: "Em aberto" (aberto), "Reprovado"/"Cancelada"
// (perdido), "Entregue"/"Em producao"/"Concluida"/"Ordem de servico" (ganho).
// Quando valor_total vem zerado, o valor real e a soma de itens[].valor_final.

import { mubiGetTudo, mubiConfigurado, json, semConfig, num, hojeMais } from "./lib/mubi.js";

function mapSituacao(status) {
  const s = String(status || "").toLowerCase();
  if (s.includes("cancel") || s.includes("reprov") || s.includes("recus") || s.includes("perd")) return "perdido";
  if (s.includes("aberto")) return "aberto";
  return "ganho"; // Entregue, Em producao, Concluida, Ordem de servico
}

function valorDoOrcamento(o) {
  const vt = num(o.valor_total);
  if (vt > 0) return vt;
  const soma = (Array.isArray(o.itens) ? o.itens : []).reduce(
    (s, it) => s + (num(it.valor_final) || num(it.sub_total)),
    0
  );
  return soma;
}

export const handler = async (event) => {
  if (!mubiConfigurado()) return semConfig();
  try {
    const anoInicio = `${new Date().getFullYear()}-01-01`;
    const desde = event.queryStringParameters?.desde || anoInicio;
    const arr = await mubiGetTudo("orcamento", {
      status: "TODOS",
      filtrodata: "CADASTRO",
      datainicial: desde,
      datafinal: hojeMais(0),
    });

    const lista = arr.map((o, i) => {
      const vendedor = String(o.vendedor || "").trim() || "Sem vendedor";
      return {
        id: String(o.id ?? `orc-${i}`),
        numero: String(o.sequencial_orcamento || o.id || ""),
        cliente: String(o.cliente || "Cliente"),
        // O nome do vendedor e o proprio id: casa com config.vendedores por nome.
        vendedorId: vendedor,
        vendedorNome: vendedor,
        valor: valorDoOrcamento(o),
        situacao: mapSituacao(o.status),
        dataEnvio: String(o.data_cadastro || ""),
        dataFechamento: o.data_aprovacao || o.data_cancelamento || null,
        trabalho: String(o.nome_trabalho || ""),
        motivoCancelamentoMubi: String(o.motivo_cancelamento || ""),
      };
    });

    return json(lista);
  } catch (e) {
    if (e.code === "SEM_CONFIG") return semConfig();
    return json({ erro: e.message }, 502);
  }
};
