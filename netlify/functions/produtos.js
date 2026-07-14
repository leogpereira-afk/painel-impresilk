// Modulo 3: produtos. Campos confirmados com o JSON real do Mubisys em
// 2026-07-14: cada OS traz itens[] com item (nome do produto), quantidade,
// valor_final. A categoria vem do catalogo /produto (join pelo nome).
// Busca status=TODOS por CADASTRO desde ?desde (padrao 1 de janeiro) e ignora
// OS canceladas.

import { mubiGetTudo, mubiConfigurado, json, semConfig, num, hojeMais } from "./lib/mubi.js";

export const handler = async (event) => {
  if (!mubiConfigurado()) return semConfig();
  try {
    const anoInicio = `${new Date().getFullYear()}-01-01`;
    const desde = event.queryStringParameters?.desde || anoInicio;

    const [osArr, catalogo] = await Promise.all([
      mubiGetTudo("ordem-servico", {
        status: "TODOS",
        filtrodata: "CADASTRO",
        datainicial: desde,
        datafinal: hojeMais(0),
      }),
      mubiGetTudo("produto"),
    ]);

    // nome do produto -> categoria (do cadastro de produtos)
    const categoriaPorNome = new Map(
      catalogo.map((p) => [String(p.nome || "").trim().toLowerCase(), String(p.categoria || "Geral")])
    );

    const ordens = osArr
      .filter((os) => !/cancel/i.test(String(os.status || "")))
      .map((os, i) => ({
        id: String(os.id ?? `os-${i}`),
        numero: String(os.sequencial_ordem || os.sequencial_orcamento || os.id || ""),
        cliente: String(os.cliente || "Cliente"),
        data: String(os.data_cadastro || ""),
        itens: (Array.isArray(os.itens) ? os.itens : []).map((it, k) => {
          const nome = String(it.item || `Item ${k + 1}`).trim();
          const quantidade = num(it.quantidade) || 1;
          const valorTotal = num(it.valor_final) || num(it.sub_total);
          return {
            produtoId: nome,
            produto: nome,
            categoria: categoriaPorNome.get(nome.toLowerCase()) || "Geral",
            quantidade,
            valorUnit: num(it.valor_unitario),
            valorTotal,
          };
        }),
      }));

    return json(ordens);
  } catch (e) {
    if (e.code === "SEM_CONFIG") return semConfig();
    return json({ erro: e.message }, 502);
  }
};
