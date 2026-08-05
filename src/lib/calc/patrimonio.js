// Patrimonio: o que a empresa TEM e quanto vale.
//
// Nao confundir com Manutencoes, que responde "quanto custa manter". O mesmo
// ar condicionado aparece nos dois com perguntas diferentes: la, o gasto do
// ano; aqui, de quem e, onde esta, quanto custou e qual e a etiqueta colada
// nele. Separar e o que permite responder cada pergunta sem poluir a outra.
//
// O que este modulo tem de servir na pratica:
//   - INVENTARIO: pegar a lista de um setor e conferir item por item, pela
//     etiqueta, sem ligar computador.
//   - SEGURO: quanto vale o que esta dentro do galpao, por setor.
//   - COMPRA: quando foi comprado, por quanto, com qual nota.

import { diasEntre } from "../format.js";

// Os 21 setores reais da Impresilk (estrutura passada pelo dono em 04/08/2026),
// com a sigla que vai na etiqueta. Sao SEMENTE: a tela cria, edita e remove.
//
// A sigla e curta de proposito -- ela vira adesivo, e etiqueta comprida nao
// cabe no lado de uma maquina nem sobrevive a limpeza.
export const SETORES_PADRAO = [
  { sigla: "DIR", nome: "Direcao", area: "Apoio e Gestao" },
  { sigla: "COM", nome: "Comercial", area: "Mercado e Vendas" },
  { sigla: "MKT", nome: "Marketing", area: "Mercado e Vendas" },
  { sigla: "POS", nome: "Pos-venda", area: "Mercado e Vendas" },
  { sigla: "DES", nome: "Design de criacao", area: "Criacao e Engenharia" },
  { sigla: "ART", nome: "Arte-final e pre-impressao", area: "Criacao e Engenharia" },
  { sigla: "PRJ", nome: "Projetos tecnicos", area: "Criacao e Engenharia" },
  { sigla: "PCP", nome: "PCP e Expedicao", area: "Operacoes" },
  { sigla: "ALM", nome: "Compras e almoxarifado", area: "Operacoes" },
  { sigla: "IMP", nome: "Impressao digital e recorte", area: "Operacoes" },
  { sigla: "DTF", nome: "DTF UV e brindes", area: "Operacoes" },
  { sigla: "COR", nome: "Corte de chapas e usinagem", area: "Operacoes" },
  { sigla: "MET", nome: "Metalurgia", area: "Operacoes" },
  { sigla: "PIN", nome: "Pintura", area: "Operacoes" },
  { sigla: "MON", nome: "Montagem de letras", area: "Operacoes" },
  { sigla: "ACM", nome: "Portas de ACM", area: "Operacoes" },
  { sigla: "ACB", nome: "Acabamento", area: "Operacoes" },
  { sigla: "INS", nome: "Instalacao de placas", area: "Operacoes" },
  { sigla: "FIN", nome: "Financeiro", area: "Apoio e Gestao" },
  { sigla: "RHU", nome: "RH e DP", area: "Apoio e Gestao" },
  { sigla: "TIC", nome: "TI e sistemas", area: "Apoio e Gestao" },
  { sigla: "MNT", nome: "Manutencao", area: "Apoio e Gestao" },
];

// Situacao do bem. "baixado" existe para nao APAGAR o que saiu: um bem
// vendido, roubado ou sucateado precisa continuar no historico com a data e o
// motivo -- some do inventario ativo, nao da memoria da empresa.
export const SITUACOES = {
  uso: { rotulo: "Em uso", chip: "chip-ok" },
  reserva: { rotulo: "De reserva", chip: "chip" },
  manutencao: { rotulo: "Em manutencao", chip: "chip-warn" },
  baixado: { rotulo: "Baixado", chip: "chip-bad" },
};

// Nomes genericos sugeridos -- o "o que e", que agrupa. A descricao tecnica
// (marca, modelo, numero de serie) e outro campo, porque nenhum relatorio
// consegue somar "Dell Optiplex 7090 i5 16GB".
export const NOMES_GENERICOS = [
  "Computador", "Notebook", "Monitor", "Impressora", "Nobreak", "Roteador",
  "Servidor", "Telefone", "Celular", "Camera",
  "Mesa", "Cadeira", "Armario", "Estante", "Bancada", "Arquivo",
  "Ar condicionado", "Ventilador", "Bebedouro", "Geladeira", "Micro-ondas",
  "Compressor", "Router CNC", "Laser", "Impressora digital", "Plotter",
  "Solda", "Furadeira", "Serra", "Esmerilhadeira", "Parafusadeira",
  "Escada", "Andaime", "Carrinho", "Empilhadeira", "Veiculo",
  "Ferramenta", "Extintor", "Televisao",
];

const soNumero = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function calcPatrimonio(mapaBens, mapaSetores, hojeISO) {
  const setores = Object.entries(mapaSetores || {})
    .map(([id, s]) => ({ ...s, id }))
    .sort((a, b) => String(a.sigla || "").localeCompare(String(b.sigla || "")));

  const bens = Object.entries(mapaBens || {})
    .map(([id, b]) => ({ ...b, id, valor: soNumero(b?.valor) }))
    .sort((a, b) => String(a.codigo || "").localeCompare(String(b.codigo || ""), "pt-BR", { numeric: true }));

  const ativos = bens.filter((b) => b.situacao !== "baixado");
  const baixados = bens.filter((b) => b.situacao === "baixado");

  const ano = String(hojeISO).slice(0, 4);
  const soma = (l) => l.reduce((s, b) => s + b.valor, 0);

  // Por setor: quantos bens e quanto vale. E a lista que se leva na prancheta
  // no dia do inventario, e o numero que o seguro pede.
  const porSetor = setores.map((s) => {
    const doSetor = ativos.filter((b) => b.setorSigla === s.sigla);
    return {
      ...s,
      bens: doSetor,
      quantos: doSetor.length,
      valor: soma(doSetor),
    };
  });

  // Bem sem setor (ou com setor que foi removido) nao pode evaporar: ele
  // existe fisicamente em algum lugar e precisa aparecer para ser corrigido.
  const siglas = new Set(setores.map((s) => s.sigla));
  const semSetor = ativos.filter((b) => !b.setorSigla || !siglas.has(b.setorSigla));

  // Por nome generico: responde "quantos computadores a empresa tem?".
  const porTipo = [...new Set(ativos.map((b) => b.nomeGenerico).filter(Boolean))]
    .map((nome) => {
      const doTipo = ativos.filter((b) => b.nomeGenerico === nome);
      return { nome, quantos: doTipo.length, valor: soma(doTipo) };
    })
    .sort((a, b) => b.valor - a.valor);

  return {
    setores,
    bens,
    ativos,
    baixados,
    porSetor,
    porTipo,
    semSetor,
    kpis: {
      quantos: ativos.length,
      valor: soma(ativos),
      noAno: soma(ativos.filter((b) => String(b.dataAquisicao || "").startsWith(ano))),
      compradosNoAno: ativos.filter((b) => String(b.dataAquisicao || "").startsWith(ano)).length,
      setores: setores.length,
      baixados: baixados.length,
      semNota: ativos.filter((b) => !String(b.nf || "").trim()).length,
      semValor: ativos.filter((b) => !b.valor).length,
    },
  };
}

// Idade do bem em anos cheios -- ajuda a decidir troca sem inventar
// depreciacao contabil, que o contador faz com a regra dele.
export function idadeEmAnos(dataISO, hojeISO) {
  if (!dataISO) return null;
  const dias = diasEntre(dataISO, hojeISO);
  if (dias < 0) return null;
  return Math.floor(dias / 365);
}
