// Contas da tela de Gestao. Ficam aqui, fora do componente, porque sao regra
// de negocio: "quantos dias faltam para fechar o trimestre" e "a decisao foi
// cumprida no prazo" tem uma resposta certa, e ela nao muda com o desenho.

import { diasEntre } from "../format.js";

export const SITUACOES = {
  no_rumo: { rotulo: "No rumo", chip: "chip-ok", ponto: "bg-ok-600" },
  atencao: { rotulo: "Atencao", chip: "chip-warn", ponto: "bg-warn-600" },
  travado: { rotulo: "Travado", chip: "chip-bad", ponto: "bg-bad-600" },
};

export const STATUS_TATICA = {
  aberta: { rotulo: "Aberta", chip: "chip" },
  em_andamento: { rotulo: "Em andamento", chip: "chip-warn" },
  concluida: { rotulo: "Concluida", chip: "chip-ok" },
  cancelada: { rotulo: "Cancelada", chip: "chip" },
};

// Fim do trimestre e fim do ano em que a data cai.
export function fimDoTrimestre(hojeISO) {
  const [a, m] = hojeISO.split("-").map(Number);
  const ultimoMes = Math.ceil(m / 3) * 3;
  const ultimoDia = new Date(a, ultimoMes, 0).getDate();
  return `${a}-${String(ultimoMes).padStart(2, "0")}-${ultimoDia}`;
}
export const fimDoAno = (hojeISO) => `${hojeISO.slice(0, 4)}-12-31`;

// R5/bloco 5: o fechamento ganha destaque quando falta pouco. Devolve o que
// esta mais perto -- fim de ano tambem e fim de trimestre, e avisar duas vezes
// a mesma coisa so confunde.
export function alertaDeCiclo(hojeISO, limite = 15) {
  const paraTri = diasEntre(hojeISO, fimDoTrimestre(hojeISO));
  const paraAno = diasEntre(hojeISO, fimDoAno(hojeISO));
  if (paraAno <= limite) return { destaque: true, tipo: "anual", dias: paraAno };
  if (paraTri <= limite) return { destaque: true, tipo: "trimestral", dias: paraTri };
  return { destaque: false, tipo: "trimestral", dias: paraTri };
}

// Por objetivo: quantas taticas abertas e concluidas. E o numero que responde
// "esse objetivo tem trabalho andando ou e so um titulo bonito?".
export function porObjetivo(objetivos, indicadores, taticas) {
  return (objetivos || []).map((o) => {
    const minhas = (taticas || []).filter((t) => t.objetivo_id === o.id);
    return {
      ...o,
      indicadores: (indicadores || []).filter((i) => i.objetivo_id === o.id),
      taticas: minhas,
      abertas: minhas.filter((t) => t.status === "aberta" || t.status === "em_andamento").length,
      concluidas: minhas.filter((t) => t.status === "concluida").length,
    };
  });
}

// Tatica sem objetivo aparece separada, nunca escondida: ela existe (veio de
// um plano encerrado ou de um objetivo apagado) e precisa de destino.
export const taticasSoltas = (taticas) => (taticas || []).filter((t) => !t.objetivo_id);

export const atrasada = (t, hojeISO) =>
  !!t.prazo && t.status !== "concluida" && t.status !== "cancelada" && diasEntre(hojeISO, t.prazo) < 0;

// Cumprimento das decisoes de ata: percentual concluido DENTRO do prazo.
// Concluir depois do prazo nao conta como cumprido -- se contasse, o indicador
// premiaria o atraso e ninguem olharia mais para ele.
export function cumprimentoDecisoes(decisoes, taticas) {
  const porDecisao = new Map((taticas || []).filter((t) => t.decisao_id).map((t) => [t.decisao_id, t]));
  const contar = (lista) => {
    const total = lista.length;
    let noPrazo = 0;
    for (const d of lista) {
      if (d.status !== "concluida") {
        // A decisao pode ter sido concluida pela tatica que ela gerou.
        const t = porDecisao.get(d.id);
        if (!t || t.status !== "concluida") continue;
        if (!d.prazo || (t.concluido_em || "").slice(0, 10) <= d.prazo) noPrazo++;
        continue;
      }
      if (!d.prazo) { noPrazo++; continue; }
      const t = porDecisao.get(d.id);
      const quando = (t?.concluido_em || "").slice(0, 10);
      if (!quando || quando <= d.prazo) noPrazo++;
    }
    return { total, noPrazo, pct: total ? Math.round((noPrazo / total) * 100) : null };
  };

  const geral = contar(decisoes || []);
  const nomes = [...new Set((decisoes || []).map((d) => d.responsavel).filter(Boolean))];
  const porPessoa = nomes.map((nome) => ({
    nome,
    ...contar((decisoes || []).filter((d) => d.responsavel === nome)),
  })).sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101));

  return { geral, porPessoa };
}

// Pauta da reuniao nova ja nasce com o que ficou em aberto nas anteriores DO
// MESMO TIPO. Reuniao semanal nao herda pendencia da mensal de resultado: sao
// conversas diferentes, e misturar faz a pauta virar lista morta.
export function pautaSugerida(reunioes, decisoes, tipo) {
  const doTipo = new Set((reunioes || []).filter((r) => r.tipo === tipo).map((r) => r.id));
  const abertas = (decisoes || []).filter((d) => doTipo.has(d.reuniao_id) && d.status === "aberta");
  if (!abertas.length) return "";
  return "Pendentes das reunioes anteriores:\n" +
    abertas.map((d) => `- ${d.texto}` +
      (d.responsavel ? ` (${d.responsavel}` + (d.prazo ? `, ate ${d.prazo.split("-").reverse().join("/")}` : "") + ")" : "")
    ).join("\n");
}
