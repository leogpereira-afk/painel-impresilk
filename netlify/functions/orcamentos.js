// Modulo 4: orcamentos. Chama /orcamento, normaliza vendedor, valor, situacao e
// datas. O front filtra por valor minimo e data de corte, agrupa por vendedor e
// cruza com o motivo de perda (override).
//
// PONTOS A CONFIRMAR NO JSON REAL: nomes de situacao (ganho/perdido/aberto),
// vendedor e as datas de envio e fechamento.

import { mubiGet, mubiConfigurado, json, semConfig, num } from "./lib/mubi.js";

function mapSituacao(v) {
  const s = String(v || "").toLowerCase();
  if (s.includes("ganho") || s.includes("aprovado") || s.includes("fechado")) return "ganho";
  if (s.includes("perd") || s.includes("recusado") || s.includes("cancel")) return "perdido";
  return "aberto";
}

export const handler = async () => {
  if (!mubiConfigurado()) return semConfig();
  try {
    const bruto = await mubiGet("orcamento");
    const arr = Array.isArray(bruto) ? bruto : bruto?.dados || bruto?.data || [];
    const lista = arr.map((o) => ({
      id: String(o.id ?? o.codigo ?? o.numero),
      numero: String(o.numero ?? o.id),
      cliente: o.cliente?.nome || o.clienteNome || o.cliente || "Cliente",
      // O front usa vendedorId para casar com config.vendedores; sem cadastro
      // comum, use o id do vendedor do Mubi (a tela permite (re)cadastrar).
      vendedorId: String(o.vendedor?.id ?? o.vendedorId ?? o.vendedor ?? "sem"),
      vendedorNome: o.vendedor?.nome || o.vendedorNome || "",
      valor: num(o.valor ?? o.valorTotal),
      situacao: mapSituacao(o.situacao || o.status),
      dataEnvio: o.dataEnvio || o.emissao || o.data || o.criadoEm || "",
      dataFechamento: o.dataFechamento || o.dataAprovacao || null,
    }));
    return json(lista);
  } catch (e) {
    if (e.code === "SEM_CONFIG") return semConfig();
    return json({ erro: e.message }, 502);
  }
};
