// Modulo 4: orcamentos. Busca status=TODOS por CADASTRO desde a data de corte
// (?desde=AAAA-MM-DD, padrao 1 de janeiro) e normaliza situacao para o front:
// APROVADO -> ganho, CANCELADO -> perdido, ABERTO -> aberto.

import { mubiGetTudo, mubiConfigurado, json, semConfig, num, campo, hojeMais } from "./lib/mubi.js";

function mapSituacao(v) {
  const s = String(v || "").toUpperCase();
  if (s.includes("APROV") || s.includes("GANHO") || s.includes("FECHADO")) return "ganho";
  if (s.includes("CANCEL") || s.includes("PERD") || s.includes("RECUS") || s.includes("REPROV")) return "perdido";
  return "aberto";
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

    const lista = arr.map((o, i) => ({
      id: String(campo(o, "id", "codigo") ?? `orc-${i}`),
      numero: String(campo(o, "numero", "id") ?? ""),
      cliente: String(campo(o, "cliente.nome", "clienteNome", "cliente", "razaoSocial") ?? "Cliente"),
      // O front casa vendedorId com config.vendedores; usa o nome como id
      // quando o Mubisys nao mandar um id proprio.
      vendedorId: String(campo(o, "vendedor.id", "vendedorId", "vendedor_id", "vendedor.nome", "vendedorNome", "vendedor") ?? "sem"),
      vendedorNome: String(campo(o, "vendedor.nome", "vendedorNome", "vendedor_nome", "vendedor") ?? ""),
      valor: num(campo(o, "valor", "valorTotal", "valor_total", "total")),
      situacao: mapSituacao(campo(o, "status", "situacao")),
      dataEnvio: String(campo(o, "cadastro", "dataCadastro", "data_cadastro", "emissao", "data") ?? ""),
      dataFechamento:
        campo(o, "aprovacao", "dataAprovacao", "data_aprovacao", "cancelamento", "dataCancelamento", "data_cancelamento") ?? null,
    }));

    return json(lista);
  } catch (e) {
    if (e.code === "SEM_CONFIG") return semConfig();
    return json({ erro: e.message }, 502);
  }
};
