// Orcamentos acima do valor minimo. Cruza o dado do Mubi com o override de
// motivo de perda. Filtra por valor minimo e data de corte de Configuracoes.
// Recalcula ao vivo quando o CEO troca um motivo.

import { diaLocalISO, diasEntre } from "../format.js";

const ACAO_POR_MOTIVO = {
  preco: "Revisar a tabela e criar faixa de desconto por volume.",
  prazo: "Alinhar o prazo real com a producao antes de enviar a proposta.",
  concorrencia: "Reforcar diferencial e prova social na proposta.",
  "sem-retorno": "Ativar follow-up automatico em 48 horas e em 5 dias.",
  cancelado: "Qualificar melhor a demanda antes de orcar.",
  escopo: "Fechar o escopo por escrito antes de enviar o valor.",
};

export function calcOrcamentos(orcamentos, overrides, config) {
  const p = config.parametros;
  const minimo = p.valorMinimoOrcamento || 0;
  const corte = p.dataCorteOrcamentos;
  const diasParado = p.diasParado || 7;

  // No modo real o id do vendedor JA e o nome (vem assim do Mubisys), entao
  // se o vendedor nao estiver cadastrado em Configuracoes, usamos o proprio id
  // como nome, em vez de "Sem vendedor".
  const nomeVend = (id) =>
    (config.vendedores || []).find((v) => v.id === id)?.nome || (id && id !== "sem" ? id : "Sem vendedor");
  const nomeMotivo = (id) => (config.motivosPerda || []).find((m) => m.id === id)?.nome || "Nao informado";

  const hoje = new Date();
  const hojeISO = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(
    hoje.getDate()
  ).padStart(2, "0")}`;

  const filtrados = orcamentos
    .filter((o) => o.valor >= minimo && diaLocalISO(o.dataEnvio) >= corte)
    .map((o) => {
      const ov = overrides[o.id] || {};
      const dias = diasEntre(o.dataEnvio, hojeISO);
      // Baixa manual: o CEO registra o desfecho de um orcamento que o ERP
      // deixou "em aberto" para sempre. O override sobrepoe o status do Mubisys.
      const baixaManual = ov.situacao === "ganho" || ov.situacao === "perdido";
      const situacao = baixaManual ? ov.situacao : o.situacao;
      return {
        ...o,
        situacao,
        situacaoErp: o.situacao,
        baixaManual,
        dataBaixa: baixaManual ? ov.dataBaixa || null : null,
        vendedorNome: nomeVend(o.vendedorId),
        motivoPerdaId: ov.motivoPerdaId || null,
        motivoPerdaNome: ov.motivoPerdaId ? nomeMotivo(ov.motivoPerdaId) : null,
        dias,
        parado: situacao === "aberto" && dias > diasParado,
      };
    })
    .sort((a, b) => b.valor - a.valor);

  const ganhos = filtrados.filter((o) => o.situacao === "ganho");
  const perdidos = filtrados.filter((o) => o.situacao === "perdido");
  const abertos = filtrados.filter((o) => o.situacao === "aberto");
  const fechados = ganhos.length + perdidos.length;
  const conversao = fechados ? Math.round((ganhos.length / fechados) * 100) : 0;

  // Por vendedor
  const mapV = {};
  for (const v of config.vendedores || []) {
    mapV[v.id] = { vendedorId: v.id, nome: v.nome, qtd: 0, valor: 0, ganhos: 0, perdidos: 0, conversao: 0 };
  }
  for (const o of filtrados) {
    const row = mapV[o.vendedorId] || (mapV[o.vendedorId] = { vendedorId: o.vendedorId, nome: o.vendedorNome, qtd: 0, valor: 0, ganhos: 0, perdidos: 0, conversao: 0 });
    row.qtd += 1;
    row.valor += o.valor;
    if (o.situacao === "ganho") row.ganhos += 1;
    if (o.situacao === "perdido") row.perdidos += 1;
  }
  // Vendedores ocultados na tela: a tabela e reconstruida a partir dos
  // orcamentos, entao quem tem ao menos um voltaria sozinho. Sem este filtro, o
  // botao de retirar nao tinha efeito nenhum.
  const ocultos = new Set(config.vendedoresOcultos || []);
  const porVendedor = Object.values(mapV)
    .filter((r) => !ocultos.has(r.vendedorId))
    .map((r) => ({ ...r, conversao: r.ganhos + r.perdidos ? Math.round((r.ganhos / (r.ganhos + r.perdidos)) * 100) : 0 }))
    .sort((a, b) => b.valor - a.valor);

  // Por que perdemos (por motivo, por valor)
  const mapM = {};
  for (const o of perdidos) {
    const k = o.motivoPerdaId || "sem";
    if (!mapM[k]) mapM[k] = { motivoId: o.motivoPerdaId, nome: nomeMotivo(o.motivoPerdaId), valor: 0, qtd: 0 };
    mapM[k].valor += o.valor;
    mapM[k].qtd += 1;
  }
  const porMotivoPerda = Object.values(mapM).sort((a, b) => b.valor - a.valor);
  const motivoLider = porMotivoPerda[0];
  const acaoLider = motivoLider
    ? ACAO_POR_MOTIVO[motivoLider.motivoId] || "Revisar a abordagem para este motivo."
    : "Sem perdas registradas no periodo.";

  const parados = abertos
    .filter((o) => o.parado)
    .sort((a, b) => b.dias - a.dias)
    .map((o) => ({ id: o.id, numero: o.numero, cliente: o.cliente, vendedorNome: o.vendedorNome, valor: o.valor, dias: o.dias }));

  return {
    // Lista mestra (ja filtrada por valor minimo e data de corte, ordenada por
    // valor): alimenta a tabela com busca, filtros e linhas expansiveis.
    lista: filtrados,
    kpis: {
      naMesaQtd: abertos.length,
      naMesaValor: abertos.reduce((s, o) => s + o.valor, 0),
      conversao,
      valorPerdido: perdidos.reduce((s, o) => s + o.valor, 0),
      ganhosValor: ganhos.reduce((s, o) => s + o.valor, 0),
      ganhosQtd: ganhos.length,
      perdidosQtd: perdidos.length,
      totalQtd: filtrados.length,
    },
    porVendedor,
    porMotivoPerda,
    motivoLider: motivoLider || null,
    acaoLider,
    parados,
    perdidos: perdidos
      .sort((a, b) => b.valor - a.valor)
      .map((o) => ({ id: o.id, numero: o.numero, cliente: o.cliente, vendedorNome: o.vendedorNome, valor: o.valor, motivoPerdaId: o.motivoPerdaId })),
  };
}

export { ACAO_POR_MOTIVO };
