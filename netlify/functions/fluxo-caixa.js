// Modulo 2: fluxo de caixa. Duas partes (parametro ?parte=):
//   parte=pagar  -> saidas: /contas-pagar (VENCIDO + PENDENTE) mais as tres
//                   provisoes (despesa-fixa, cartao-credito, folha-pagamento),
//                   todas por VENCIMENTO numa janela de -30 a +60 dias.
//   parte=bancos -> /conta-bancaria (saldo inicial).
// As entradas previstas saem dos recebiveis (funcao contas-atrasadas).

import { mubiGetTudo, mubiConfigurado, json, semConfig, num, campo, hojeMais } from "./lib/mubi.js";

function normalizarSaida(s, i, tipo, categoriaPadrao) {
  return {
    id: String(campo(s, "id", "codigo") ?? `pag-${tipo}-${i}`),
    descricao: String(
      campo(s, "descricao", "historico", "fornecedor.nome", "fornecedorNome", "nome", "titulo") ?? "Saida"
    ),
    categoria: String(campo(s, "categoria", "plano", "planoContas", "plano_contas", "grupo") ?? categoriaPadrao),
    valor: num(campo(s, "valor", "valorTitulo", "valor_titulo", "valorParcela", "valor_parcela")),
    vencimento: String(campo(s, "vencimento", "dataVencimento", "data_vencimento", "competencia") ?? ""),
    tipo,
  };
}

async function saidas() {
  const janela = { filtrodata: "VENCIMENTO", datainicial: hojeMais(-30), datafinal: hojeMais(60) };

  const [pendentes, vencidas, fixa, cartao, folha] = await Promise.all([
    mubiGetTudo("contas-pagar", { ...janela, status: "PENDENTE" }),
    mubiGetTudo("contas-pagar", { ...janela, status: "VENCIDO" }),
    mubiGetTudo("contas-pagar-provisao/despesa-fixa", janela),
    mubiGetTudo("contas-pagar-provisao/cartao-credito", janela),
    mubiGetTudo("contas-pagar-provisao/folha-pagamento", janela),
  ]);

  const vistos = new Set();
  const out = [];
  const add = (lista, tipo, categoriaPadrao) => {
    lista.forEach((s, i) => {
      const n = normalizarSaida(s, i, tipo, categoriaPadrao);
      const chave = `${tipo}:${n.id}`;
      if (vistos.has(chave)) return;
      vistos.add(chave);
      out.push(n);
    });
  };
  add(pendentes, "pagar", "Fornecedor");
  add(vencidas, "pagar", "Fornecedor");
  add(fixa, "provisao", "Despesa fixa");
  add(cartao, "provisao", "Cartao");
  add(folha, "provisao", "Folha");
  return out;
}

async function bancos() {
  const arr = await mubiGetTudo("conta-bancaria");
  return arr.map((b, i) => ({
    id: String(campo(b, "id", "codigo") ?? `cb-${i}`),
    banco: String(campo(b, "banco", "nome", "instituicao", "descricao") ?? "Conta"),
    conta: String(campo(b, "conta", "numero", "numeroConta", "numero_conta") ?? ""),
    saldo: num(campo(b, "saldo", "saldoAtual", "saldo_atual", "saldoDisponivel", "saldo_disponivel")),
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
