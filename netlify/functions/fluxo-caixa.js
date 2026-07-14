// Modulo 2: fluxo de caixa (campos reais do Mubisys, 2026-07-14).
// Cada invocacao faz UMA chamada ao Mubisys (limite de 10s da Function):
//
// GET ?parte=bancos                     -> { itens: [contas], totalPaginas }
// GET ?fonte=pendente|vencido|fixa|cartao|folha&page=N -> { itens: [saidas], totalPaginas }
//
// "Permuta" fica fora do saldo (credito de troca, nao e dinheiro em caixa).

import { mubiGetPagina, mubiConfigurado, json, semConfig, num, hojeMais } from "./lib/mubi.js";

function normalizarPagar(s, i) {
  return {
    id: String(s.id ?? `pag-${i}`),
    descricao: String(s.despesa || s.descricao || s.origem || "Saida"),
    categoria: String(s.centro_custo || s.tipo || "Fornecedor"),
    valor: num(s.valor_titulo),
    vencimento: String(s.data_vencimento || ""),
    tipo: "pagar",
  };
}

function normalizarProvisao(categoria) {
  return (s, i) => ({
    id: String(s.id ?? `prov-${i}`),
    descricao: String(s.cap_despesa || s.cap_descricao || categoria),
    categoria,
    valor: num(s.cap_valor),
    vencimento: String(s.cap_vencimento || ""),
    tipo: "provisao",
  });
}

const FONTES = {
  pendente: { caminho: "contas-pagar", extra: { status: "PENDENTE" }, mapear: normalizarPagar },
  vencido: { caminho: "contas-pagar", extra: { status: "VENCIDO" }, mapear: normalizarPagar },
  fixa: { caminho: "contas-pagar-provisao/despesa-fixa", extra: {}, mapear: normalizarProvisao("Despesa fixa") },
  cartao: { caminho: "contas-pagar-provisao/cartao-credito", extra: {}, mapear: normalizarProvisao("Cartao") },
  folha: { caminho: "contas-pagar-provisao/folha-pagamento", extra: {}, mapear: normalizarProvisao("Folha") },
};

export const handler = async (event) => {
  if (!mubiConfigurado()) return semConfig();
  const q = event.queryStringParameters || {};
  try {
    if (q.parte === "bancos") {
      const { lista, totalPaginas } = await mubiGetPagina("conta-bancaria", {}, 1);
      const contas = lista
        .filter((b) => String(b.status || "").toLowerCase() === "ativo")
        .filter((b) => !/permuta/i.test(String(b.titulo || "")))
        .map((b, i) => ({
          id: String(b.id ?? `cb-${i}`),
          banco: String(b.titulo || "Conta"),
          conta: String(b.empresa || ""),
          saldo: num(b.valor_saldo),
        }));
      return json({ itens: contas, totalPaginas });
    }

    const fonte = FONTES[q.fonte];
    if (!fonte) return json({ erro: "informe ?fonte=pendente|vencido|fixa|cartao|folha ou ?parte=bancos" }, 400);
    const page = Math.max(1, parseInt(q.page, 10) || 1);
    const { lista, totalPaginas } = await mubiGetPagina(
      fonte.caminho,
      {
        ...fonte.extra,
        filtrodata: "VENCIMENTO",
        datainicial: hojeMais(-30),
        datafinal: hojeMais(60),
      },
      page
    );
    return json({
      itens: lista.map(fonte.mapear).filter((n) => n.valor > 0),
      totalPaginas,
    });
  } catch (e) {
    if (e.code === "SEM_CONFIG") return semConfig();
    return json({ erro: e.message }, 502);
  }
};
