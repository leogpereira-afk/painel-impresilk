// Modulo 1: contas a receber em aberto. A API do Mubisys exige status,
// filtrodata e periodo; buscamos VENCIDO + PENDENTE por VENCIMENTO numa janela
// de -365 a +90 dias e devolvemos os titulos normalizados (o front filtra os
// vencidos, calcula DSO e usa os a vencer no fluxo de caixa).
//
// CAMPOS: os nomes exatos do JSON do Mubisys ainda nao sao publicos no OpenAPI;
// a normalizacao usa campo() com varios nomes candidatos. Ao ver a primeira
// resposta real, conferir/ajustar aqui.

import { mubiGetTudo, mubiConfigurado, json, semConfig, num, campo, hojeMais } from "./lib/mubi.js";

function normalizar(r, i) {
  return {
    id: String(campo(r, "id", "codigo", "idTitulo") ?? `rec-${i}`),
    cliente: String(campo(r, "cliente.nome", "clienteNome", "nomeCliente", "cliente", "razaoSocial", "nome") ?? "Cliente"),
    cnpj: String(campo(r, "cliente.cpfcnpj", "cpfcnpj", "cpf_cnpj", "documento") ?? ""),
    nf: String(campo(r, "notaFiscal", "nota_fiscal", "nf", "numeroNota", "nfe") ?? ""),
    os: String(campo(r, "ordemServico", "ordem_servico", "os", "numeroOS", "numero_os") ?? ""),
    valor: num(campo(r, "valor", "valorTitulo", "valor_titulo", "valorAberto", "valor_aberto", "valorParcela", "valor_parcela")),
    emissao: String(campo(r, "emissao", "dataEmissao", "data_emissao", "cadastro", "dataCadastro", "data_cadastro") ?? ""),
    vencimento: String(campo(r, "vencimento", "dataVencimento", "data_vencimento", "dtVencimento") ?? ""),
    situacao: "aberto",
  };
}

export const handler = async () => {
  if (!mubiConfigurado()) return semConfig();
  try {
    const base = {
      filtrodata: "VENCIMENTO",
      datainicial: hojeMais(-365),
      datafinal: hojeMais(90),
    };
    const [vencidos, pendentes] = await Promise.all([
      mubiGetTudo("contas-receber", { ...base, status: "VENCIDO" }),
      mubiGetTudo("contas-receber", { ...base, status: "PENDENTE" }),
    ]);

    // Une e remove duplicados (caso PENDENTE tambem inclua vencidos).
    const vistos = new Set();
    const abertos = [];
    [...vencidos, ...pendentes].forEach((r, i) => {
      const n = normalizar(r, i);
      if (vistos.has(n.id)) return;
      vistos.add(n.id);
      abertos.push(n);
    });

    return json(abertos);
  } catch (e) {
    if (e.code === "SEM_CONFIG") return semConfig();
    return json({ erro: e.message }, 502);
  }
};
