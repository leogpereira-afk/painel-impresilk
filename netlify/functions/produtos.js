// Modulo 3: produtos (campos reais do Mubisys, 2026-07-14). Cada invocacao faz
// UMA chamada ao Mubisys (limite de 10s da Function):
//
// GET ?parte=catalogo            -> { itens: [{nome, categoria}], totalPaginas }
// GET ?desde=AAAA-MM-DD&page=N   -> { itens: [OS com itens[]], totalPaginas }
//
// O front junta as paginas e faz o join da categoria pelo nome do produto.

import { mubiGetPagina, mubiConfigurado, json, semConfig, num, hojeMais } from "./lib/mubi.js";

export const handler = async (event) => {
  if (!mubiConfigurado()) return semConfig();
  const q = event.queryStringParameters || {};
  try {
    if (q.parte === "catalogo") {
      const { lista, totalPaginas } = await mubiGetPagina("produto", {}, Math.max(1, parseInt(q.page, 10) || 1));
      return json({
        itens: lista.map((p) => ({
          nome: String(p.nome || "").trim(),
          categoria: String(p.categoria || "Geral"),
        })),
        totalPaginas,
      });
    }

    const anoInicio = `${new Date().getFullYear()}-01-01`;
    const desde = q.desde || anoInicio;
    const page = Math.max(1, parseInt(q.page, 10) || 1);
    const { lista, totalPaginas } = await mubiGetPagina(
      "ordem-servico",
      {
        status: "TODOS",
        filtrodata: "CADASTRO",
        datainicial: desde,
        datafinal: hojeMais(0),
      },
      page
    );

    const ordens = lista
      .filter((os) => !/cancel/i.test(String(os.status || "")))
      .map((os, i) => ({
        id: String(os.id ?? `os-${i}`),
        numero: String(os.sequencial_ordem || os.sequencial_orcamento || os.id || ""),
        cliente: String(os.cliente || "Cliente"),
        data: String(os.data_cadastro || ""),
        itens: (Array.isArray(os.itens) ? os.itens : []).map((it, k) => {
          const nome = String(it.item || `Item ${k + 1}`).trim();
          return {
            produtoId: nome,
            produto: nome,
            categoria: "Geral", // o front faz o join com ?parte=catalogo
            quantidade: num(it.quantidade) || 1,
            valorUnit: num(it.valor_unitario),
            valorTotal: num(it.valor_final) || num(it.sub_total),
          };
        }),
      }));

    return json({ itens: ordens, totalPaginas });
  } catch (e) {
    if (e.code === "SEM_CONFIG") return semConfig();
    return json({ erro: e.message }, 502);
  }
};
