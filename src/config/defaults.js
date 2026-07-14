// Configuracao padrao do painel. TUDO aqui e editavel em Configuracoes e fica
// salvo (localStorage agora, Netlify Blobs no deploy). Nenhuma regra fica fixa
// no codigo dos modulos: todos leem daqui.

export const CONFIG_PADRAO = {
  parametros: {
    colchaoMinimo: 25000, // colchao minimo de caixa (R$)
    dsoMeta: 30, // DSO meta (dias)
    dsoAlerta: 45, // DSO de alerta (dias)
    valorMinimoOrcamento: 2500, // valor minimo para entrar no funil (R$)
    dataCorteOrcamentos: "2026-01-01", // considera orcamentos a partir daqui
    saldoInicialModo: "mubi", // "mubi" = soma das contas bancarias | "manual"
    saldoInicialManual: 60000, // usado quando saldoInicialModo = manual
    diasParado: 7, // orcamento enviado sem resposta ha X dias
    diasEscala: 10, // "sem contato" acima disso vira escalada
  },

  // Os tres grupos de causa sao renomeaveis (o CEO decide o que e falha interna).
  gruposCausa: [
    { id: "interna", nome: "Falha interna" },
    { id: "cliente", nome: "Cliente" },
    { id: "processo", nome: "Processo" },
  ],

  // Cada motivo aponta para um grupo. A tag liga o motivo a uma frente de acao.
  // tags: "semContato" | "esquecimento" | "disputa" | "nfNaoEnviada" | null
  motivosAtraso: [
    { id: "arte", nome: "Aguardando aprovacao de arte", grupo: "interna", tag: null },
    { id: "refacao", nome: "Refacao ou retrabalho", grupo: "interna", tag: null },
    { id: "erro-pedido", nome: "Erro no pedido", grupo: "interna", tag: null },
    { id: "nf", nome: "NF nao enviada", grupo: "processo", tag: "nfNaoEnviada" },
    { id: "boleto", nome: "Boleto nao recebido", grupo: "processo", tag: null },
    { id: "instalacao", nome: "Aguardando medicao ou instalacao", grupo: "processo", tag: null },
    { id: "verba", nome: "Cliente sem verba", grupo: "cliente", tag: null },
    { id: "disputa", nome: "Disputa de valor", grupo: "cliente", tag: "disputa" },
    { id: "esquecimento", nome: "Esquecimento do cliente", grupo: "cliente", tag: "esquecimento" },
    { id: "sem-contato", nome: "Nao responde", grupo: "cliente", tag: "semContato" },
  ],

  // Regua de cobranca por faixa de dias. Primeira faixa cujo limite cobre os dias vence.
  reguaCobranca: [
    { ateDias: 7, acao: "Lembrete cordial por WhatsApp" },
    { ateDias: 15, acao: "Ligar e confirmar data de pagamento" },
    { ateDias: 30, acao: "Cobranca formal por e-mail com o boleto" },
    { ateDias: 60, acao: "Negociar parcelamento e registrar o acordo" },
    { ateDias: 99999, acao: "Escalar para cobranca juridica" },
  ],

  // Regras que sobrepoem a regua por motivo (o motor sempre prioriza estas).
  regrasPorMotivo: [
    { motivoId: "nf", acao: "Reenviar a NF antes de cobrar" },
    { motivoId: "disputa", acao: "Resolver a disputa antes de cobrar" },
  ],

  // Limites das faixas de idade dos atrasos (dias).
  faixasIdade: [15, 30, 60, 90],

  // Vendedores reais do Mubisys: o id e o proprio nome como a API devolve,
  // para as linhas casarem automaticamente com os orcamentos.
  vendedores: [
    { id: "Barbara Vasconcelos", nome: "Barbara Vasconcelos" },
    { id: "Candida", nome: "Candida" },
    { id: "Jessica Sampaio", nome: "Jessica Sampaio" },
    { id: "Michelle", nome: "Michelle" },
  ],

  motivosPerda: [
    { id: "preco", nome: "Preco" },
    { id: "prazo", nome: "Prazo de entrega" },
    { id: "concorrencia", nome: "Foi para a concorrencia" },
    { id: "sem-retorno", nome: "Cliente sumiu" },
    { id: "cancelado", nome: "Projeto cancelado" },
    { id: "escopo", nome: "Escopo mudou" },
  ],
};

// Versao do schema de config; usada para migracoes futuras.
export const CONFIG_VERSAO = 1;
