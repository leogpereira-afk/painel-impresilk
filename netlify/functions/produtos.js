// Modulo 3: produtos. O Mubi nao tem endpoint de vendas por produto, entao o
// faturamento e o volume saem dos ITENS das Ordens de Servico. Aqui devolvemos
// as OS normalizadas (numero, cliente, data e itens); o front agrega por produto
// e por mes.
//
// PONTO CRITICO A CONFIRMAR NO JSON REAL: a estrutura dos itens da OS. Isole a
// leitura dos itens na funcao normalizarItens abaixo para ajustar num lugar so.

import { mubiGet, mubiConfigurado, json, semConfig, num } from "./lib/mubi.js";

function normalizarItens(os) {
  const itens = os.itens || os.produtos || os.servicos || os.linhas || [];
  return itens.map((it) => {
    const quantidade = num(it.quantidade ?? it.qtd ?? 1);
    const valorUnit = num(it.valorUnitario ?? it.valorUnit ?? it.preco);
    const valorTotal = num(it.valorTotal ?? it.total ?? quantidade * valorUnit);
    return {
      produtoId: String(it.produtoId ?? it.produto?.id ?? it.codigoProduto ?? it.produto ?? "produto"),
      produto: it.produto?.nome || it.produtoNome || it.descricao || "Produto",
      categoria: it.categoria || it.produto?.categoria || "Geral",
      quantidade,
      valorUnit,
      valorTotal,
    };
  });
}

export const handler = async () => {
  if (!mubiConfigurado()) return semConfig();
  try {
    const bruto = await mubiGet("ordem-servico");
    const arr = Array.isArray(bruto) ? bruto : bruto?.dados || bruto?.data || [];
    const ordens = arr.map((os) => ({
      id: String(os.id ?? os.codigo ?? os.numero),
      numero: String(os.numero ?? os.id),
      cliente: os.cliente?.nome || os.clienteNome || os.cliente || "Cliente",
      data: os.data || os.dataAbertura || os.emissao || os.criadoEm || "",
      itens: normalizarItens(os),
    }));
    return json(ordens);
  } catch (e) {
    if (e.code === "SEM_CONFIG") return semConfig();
    return json({ erro: e.message }, 502);
  }
};
