// Modulo 2: fluxo de caixa. Duas partes (parametro ?parte=):
//   parte=pagar  -> saidas: /contas-pagar + as tres provisoes (despesa-fixa,
//                   cartao-credito, folha-pagamento), unificadas por vencimento.
//   parte=bancos -> /conta-bancaria (para o saldo inicial).
// As entradas previstas saem dos recebiveis (funcao contas-atrasadas), entao
// aqui tratamos apenas saidas e bancos.

import { mubiGet, mubiConfigurado, json, semConfig, num } from "./lib/mubi.js";

async function saidas() {
  const out = [];
  const push = (lista, tipo, categoriaPadrao) => {
    const arr = Array.isArray(lista) ? lista : lista?.dados || lista?.data || [];
    for (const s of arr) {
      out.push({
        id: String(s.id ?? s.codigo ?? out.length + 1),
        descricao: s.descricao || s.fornecedor?.nome || s.historico || "Saida",
        categoria: s.categoria || s.plano || categoriaPadrao,
        valor: num(s.valor ?? s.valorTitulo),
        vencimento: s.vencimento || s.dataVencimento || s.competencia || "",
        tipo,
      });
    }
  };

  const [contas, fixa, cartao, folha] = await Promise.all([
    mubiGet("contas-pagar"),
    mubiGet("contas-pagar-provisao/despesa-fixa"),
    mubiGet("contas-pagar-provisao/cartao-credito"),
    mubiGet("contas-pagar-provisao/folha-pagamento"),
  ]);
  push(contas, "pagar", "Fornecedor");
  push(fixa, "provisao", "Despesa fixa");
  push(cartao, "provisao", "Cartao");
  push(folha, "provisao", "Folha");
  return out;
}

async function bancos() {
  const bruto = await mubiGet("conta-bancaria");
  const arr = Array.isArray(bruto) ? bruto : bruto?.dados || bruto?.data || [];
  return arr.map((b) => ({
    id: String(b.id ?? b.codigo),
    banco: b.banco || b.nome || b.instituicao || "Conta",
    conta: b.conta || b.numero || "",
    saldo: num(b.saldo ?? b.saldoAtual ?? b.saldoDisponivel),
  }));
}

export const handler = async (event) => {
  if (!mubiConfigurado()) return semConfig();
  const parte = event.queryStringParameters?.parte || "pagar";
  try {
    if (parte === "bancos") return json(await bancos());
    return json(await saidas());
  } catch (e) {
    if (e.code === "SEM_CONFIG") return semConfig();
    return json({ erro: e.message }, 502);
  }
};
