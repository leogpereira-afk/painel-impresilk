// Modulo 1: contas a receber em aberto. Chama /contas-receber, normaliza e
// devolve TODOS os titulos em aberto (o front filtra os vencidos e calcula DSO
// sobre o conjunto). A chave do Mubi nunca sai do servidor.
//
// PONTOS A CONFIRMAR COM O JSON REAL (ajustar os campos abaixo):
//   nomes de: cliente, cpfcnpj, numero da NF, numero da OS, valor, emissao,
//   vencimento e situacao (aberto/pago).

import { mubiGet, mubiConfigurado, json, semConfig, num } from "./lib/mubi.js";

export const handler = async () => {
  if (!mubiConfigurado()) return semConfig();
  try {
    const bruto = await mubiGet("contas-receber");
    const lista = Array.isArray(bruto) ? bruto : bruto.dados || bruto.data || [];

    const abertos = lista
      .filter((r) => {
        const sit = String(r.situacao || r.status || "").toLowerCase();
        return !sit || sit.includes("aberto") || sit.includes("pendente") || r.pago === false;
      })
      .map((r) => ({
        id: String(r.id ?? r.codigo ?? r.numero),
        cliente: r.cliente?.nome || r.clienteNome || r.nomeCliente || r.cliente || "Cliente",
        cnpj: r.cliente?.cpfcnpj || r.cpfcnpj || r.documento || "",
        nf: String(r.notaFiscal || r.nf || r.numeroNota || ""),
        os: String(r.ordemServico || r.os || r.numeroOS || ""),
        valor: num(r.valor ?? r.valorTitulo ?? r.valorAberto),
        emissao: r.emissao || r.dataEmissao || r.criadoEm || "",
        vencimento: r.vencimento || r.dataVencimento || r.dtVencimento || "",
        situacao: "aberto",
      }));

    return json(abertos);
  } catch (e) {
    if (e.code === "SEM_CONFIG") return semConfig();
    return json({ erro: e.message }, 502);
  }
};
