// Modulo 3: produtos. O faturamento e o volume saem dos ITENS das Ordens de
// Servico (status=TODOS, filtrodata=CADASTRO, desde a data de corte ate hoje).
// O front agrega por produto e por mes e deriva o catalogo dos proprios itens.
//
// Query aceita: ?desde=AAAA-MM-DD (padrao: 1 de janeiro do ano corrente).
//
// PONTO CRITICO: a estrutura dos itens da OS ainda nao e publica no OpenAPI.
// A leitura fica isolada em normalizarItens() com varios nomes candidatos;
// ajustar ao ver o JSON real.

import { mubiGetTudo, mubiConfigurado, json, semConfig, num, campo, hojeMais } from "./lib/mubi.js";

function normalizarItens(os) {
  const lista = campo(os, "itens", "produtos", "servicos", "items", "linhas") || [];
  if (!Array.isArray(lista)) return [];
  return lista.map((it, i) => {
    const quantidade = num(campo(it, "quantidade", "qtd", "qtde") ?? 1) || 1;
    const valorUnit = num(campo(it, "valorUnitario", "valor_unitario", "valorUnit", "preco", "precoUnitario", "preco_unitario"));
    const valorTotal = num(campo(it, "valorTotal", "valor_total", "total", "valor")) || quantidade * valorUnit;
    const nome = String(campo(it, "produto.nome", "produtoNome", "produto_nome", "descricao", "nome", "produto") ?? `Produto ${i + 1}`);
    const id = String(campo(it, "produtoId", "produto_id", "produto.id", "codigoProduto", "codigo_produto") ?? nome);
    return {
      produtoId: id,
      produto: nome,
      categoria: String(campo(it, "categoria", "produto.categoria", "grupo") ?? "Geral"),
      quantidade,
      valorUnit,
      valorTotal,
    };
  });
}

export const handler = async (event) => {
  if (!mubiConfigurado()) return semConfig();
  try {
    const anoInicio = `${new Date().getFullYear()}-01-01`;
    const desde = event.queryStringParameters?.desde || anoInicio;
    const arr = await mubiGetTudo("ordem-servico", {
      status: "TODOS",
      filtrodata: "CADASTRO",
      datainicial: desde,
      datafinal: hojeMais(0),
    });

    const ordens = arr
      .filter((os) => {
        const sit = String(campo(os, "status", "situacao") ?? "").toUpperCase();
        return !sit.includes("CANCEL"); // ignora OS canceladas no faturamento
      })
      .map((os, i) => ({
        id: String(campo(os, "id", "codigo") ?? `os-${i}`),
        numero: String(campo(os, "numero", "id") ?? ""),
        cliente: String(campo(os, "cliente.nome", "clienteNome", "cliente") ?? "Cliente"),
        data: String(campo(os, "cadastro", "dataCadastro", "data_cadastro", "data", "emissao", "dataAbertura") ?? ""),
        itens: normalizarItens(os),
      }));

    return json(ordens);
  } catch (e) {
    if (e.code === "SEM_CONFIG") return semConfig();
    return json({ erro: e.message }, 502);
  }
};
