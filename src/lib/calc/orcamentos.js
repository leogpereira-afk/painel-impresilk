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

// Chave estavel para agrupar um motivo que veio como texto livre do ERP.
const chaveTexto = (t) =>
  String(t || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

// "Compra futura" nao e perda: e um cliente que pediu para voltar depois. E a
// maior fatia do valor que escapa, e a unica que se recupera so com agenda.
const ehCompraFutura = (texto) => chaveTexto(texto).includes("compra futura");
// Perdas por falta de acompanhamento (o vendedor nunca voltou a falar).
const ehSemRetorno = (texto) => chaveTexto(texto).includes("retorno");

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

      // Motivo da perda: a marcacao da direcao manda, mas o padrao agora e o
      // que o vendedor ja escreveu no ERP -- ele preenche em 100% dos casos.
      const motivoTexto = ov.motivoPerdaId ? nomeMotivo(ov.motivoPerdaId) : o.motivoErp || "";
      const motivoChave = ov.motivoPerdaId || (o.motivoErp ? chaveTexto(o.motivoErp) : "sem");

      // Validade: o ERP nao preenche sempre. Sem ela nao da para dizer que
      // venceu -- e "sem validade" nao pode virar "vencido".
      const temValidade = Number(o.validade) > 0;
      const diasParaVencer = temValidade ? Number(o.validade) - dias : null;
      const vencido = situacao === "aberto" && temValidade && diasParaVencer < 0;

      // Retorno agendado pelo vendedor (o unico dado que o ERP nao tem).
      const proximoToque = ov.proximoToque || null;
      const adiado = !!proximoToque && proximoToque > hojeISO;

      return {
        ...o,
        situacao,
        situacaoErp: o.situacao,
        baixaManual,
        dataBaixa: baixaManual ? ov.dataBaixa || null : null,
        vendedorNome: nomeVend(o.vendedorId),
        motivoPerdaId: ov.motivoPerdaId || null,
        motivoPerdaNome: motivoTexto || null,
        motivoChave,
        motivoManual: !!ov.motivoPerdaId,
        margem: Number(o.margem) || 0,
        dias,
        parado: situacao === "aberto" && dias > diasParado,
        temValidade,
        diasParaVencer,
        vencido,
        proximoToque,
        nota: ov.nota || "",
        adiado,
      };
    })
    .sort((a, b) => b.valor - a.valor);

  const ganhos = filtrados.filter((o) => o.situacao === "ganho");
  const perdidos = filtrados.filter((o) => o.situacao === "perdido");
  const abertos = filtrados.filter((o) => o.situacao === "aberto");
  const fechados = ganhos.length + perdidos.length;
  const conversao = fechados ? Math.round((ganhos.length / fechados) * 100) : 0;

  // Por vendedor
  const linhaV = (id, nome) => ({
    vendedorId: id,
    nome,
    qtd: 0,
    valor: 0,
    ganhos: 0,
    perdidos: 0,
    conversao: 0,
    // Margem separa quem fatura de quem da lucro: sao rankings diferentes.
    margemGanha: 0,
    margemPerdida: 0,
    semRetorno: 0,
    naMesa: 0,
  });
  const mapV = {};
  for (const v of config.vendedores || []) mapV[v.id] = linhaV(v.id, v.nome);
  for (const o of filtrados) {
    const row = mapV[o.vendedorId] || (mapV[o.vendedorId] = linhaV(o.vendedorId, o.vendedorNome));
    row.qtd += 1;
    row.valor += o.valor;
    if (o.situacao === "ganho") {
      row.ganhos += 1;
      row.margemGanha += o.margem;
    }
    if (o.situacao === "perdido") {
      row.perdidos += 1;
      row.margemPerdida += o.margem;
      if (ehSemRetorno(o.motivoPerdaNome)) row.semRetorno += 1;
    }
    if (o.situacao === "aberto") row.naMesa += 1;
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
    const k = o.motivoChave;
    if (!mapM[k])
      mapM[k] = {
        motivoId: o.motivoPerdaId,
        chave: k,
        nome: o.motivoPerdaNome || "Nao informado",
        valor: 0,
        qtd: 0,
        margem: 0,
      };
    mapM[k].valor += o.valor;
    mapM[k].qtd += 1;
    mapM[k].margem += o.margem;
  }
  const porMotivoPerda = Object.values(mapM).sort((a, b) => b.valor - a.valor);
  const motivoLider = porMotivoPerda[0];
  // A acao sugerida seguia so o id das marcacoes manuais. Agora o motivo chega
  // como texto do ERP, entao caimos para o casamento por palavra.
  const acaoPorTexto = (texto) => {
    const t = chaveTexto(texto);
    if (t.includes("compra futura")) return "Agendar o retorno na data que o cliente pediu -- este dinheiro so volta com lembrete.";
    if (t.includes("retorno")) return "Ativar follow-up automatico em 48 horas e em 5 dias.";
    if (t.includes("preco")) return "Revisar a tabela e criar faixa de desconto por volume.";
    if (t.includes("prazo")) return "Alinhar o prazo real com a producao antes de enviar a proposta.";
    if (t.includes("outra empresa") || t.includes("comparativo")) return "Reforcar diferencial e prova social na proposta.";
    if (t.includes("escopo") || t.includes("material")) return "Fechar o escopo por escrito antes de enviar o valor.";
    return "Revisar a abordagem para este motivo.";
  };
  const acaoLider = motivoLider
    ? ACAO_POR_MOTIVO[motivoLider.motivoId] || acaoPorTexto(motivoLider.nome)
    : "Sem perdas registradas no periodo.";

  const parados = abertos
    .filter((o) => o.parado)
    .sort((a, b) => b.dias - a.dias)
    .map((o) => ({ id: o.id, numero: o.numero, cliente: o.cliente, vendedorNome: o.vendedorNome, valor: o.valor, dias: o.dias }));

  // ---------------------------------------------------------------- acoes do dia
  //
  // A fila de trabalho: o que vale a pena tocar HOJE, do maior para o menor
  // dinheiro em jogo. Ordena por MARGEM, nao por faturamento -- um orcamento
  // gordo de margem fina nao vale a ligacao que um menor e mais rentavel vale.
  //
  // Quem ja tem retorno agendado para depois de hoje sai da fila ate la: sem
  // isso o vendedor veria o mesmo cliente todo dia e pararia de olhar a tela.
  const naFila = (o) => !o.adiado;

  const itensDaFila = [
    ...abertos.filter((o) => o.vencido && naFila(o)).map((o) => ({ ...o, fila: "vencido" })),
    // Perdidos por "compra futura": nao sao perda, sao agenda. Maior fatia do
    // valor que escapa e a unica que volta so com alguem lembrando de ligar.
    ...perdidos
      .filter((o) => ehCompraFutura(o.motivoPerdaNome) && naFila(o))
      .map((o) => ({ ...o, fila: "recall" })),
    ...abertos
      .filter((o) => o.parado && !o.vencido && naFila(o))
      .map((o) => ({ ...o, fila: "sem-retorno" })),
  ];

  // Uma linha por CLIENTE (do mesmo vendedor), nao por orcamento: quatro
  // orcamentos da mesma empresa sao uma ligacao so. Sem agrupar, o topo da fila
  // ficava com o mesmo nome repetido quatro vezes e escondia os outros clientes.
  const URGENCIA = { vencido: 0, "sem-retorno": 1, recall: 2 };
  const grupos = new Map();
  for (const o of itensDaFila) {
    const chave = `${o.vendedorId}|${o.clienteId || chaveTexto(o.cliente)}`;
    let g = grupos.get(chave);
    if (!g) {
      g = {
        chave,
        cliente: o.cliente,
        clienteId: o.clienteId || "",
        vendedorId: o.vendedorId,
        vendedorNome: o.vendedorNome,
        celular: o.celular || "",
        contatoNome: o.contatoNome || "",
        fila: o.fila,
        qtd: 0,
        valor: 0,
        margem: 0,
        dias: 0,
        itens: [],
      };
      grupos.set(chave, g);
    }
    g.qtd += 1;
    g.valor += o.valor;
    g.margem += o.margem;
    g.dias = Math.max(g.dias, o.dias);
    if (!g.celular && o.celular) g.celular = o.celular;
    // A linha herda a fila mais urgente entre os orcamentos do cliente.
    if (URGENCIA[o.fila] < URGENCIA[g.fila]) g.fila = o.fila;
    g.itens.push({
      id: o.id,
      numero: o.numero,
      valor: o.valor,
      margem: o.margem,
      dias: o.dias,
      trabalho: o.trabalho,
      fila: o.fila,
      motivo: o.motivoPerdaNome || null,
    });
  }
  const acoes = [...grupos.values()]
    .map((g) => ({ ...g, itens: g.itens.sort((a, b) => b.margem - a.margem) }))
    .sort((a, b) => b.margem - a.margem);

  const soma = (lista, campo) => lista.reduce((s, o) => s + (o[campo] || 0), 0);
  const vencidos = abertos.filter((o) => o.vencido);
  const recall = perdidos.filter((o) => ehCompraFutura(o.motivoPerdaNome));

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
      // Margem: o numero que decide a ordem da fila.
      margemEmRisco: soma(abertos, "margem"),
      margemGanha: soma(ganhos, "margem"),
      margemPerdida: soma(perdidos, "margem"),
      vencidosQtd: vencidos.length,
      vencidosValor: soma(vencidos, "valor"),
      recallQtd: recall.length,
      recallValor: soma(recall, "valor"),
      // Duas contagens diferentes de proposito: a fila mostra CLIENTES (uma
      // ligacao cada), mas o dinheiro em jogo vem dos orcamentos por tras.
      acoesQtd: acoes.length,
      acoesOrcamentos: itensDaFila.length,
      acoesMargem: soma(itensDaFila, "margem"),
    },
    acoes,
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
