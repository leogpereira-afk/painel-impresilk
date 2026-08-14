// As contas dos sistemas: quanto custa por mês manter o painel de pé, e o que
// já foi pago.
//
// O eixo é o MÊS, não a data solta: a pergunta é "paguei o Supabase de agosto?".
// Por isso o pagamento é gravado por competência (`pagos: { "2026-08": "…" }`)
// e não como um `pago: true` que ninguém sabe de quando é.
//
// DUAS MOEDAS, NUNCA SOMADAS. Supabase, GitHub e Claude cobram em dólar; a
// hospedagem cobra em real. Somar os dois num total só produziria um número que
// não existe -- cada moeda tem o seu.

import { diasEntre, ymdLocal } from "../format.js";

export const MOEDAS = {
  BRL: { simbolo: "R$", nome: "Real" },
  USD: { simbolo: "US$", nome: "Dólar" },
};

// Os serviços que sustentam os sistemas hoje. Entram como sugestão do cadastro:
// o dia e o valor só o Léo sabe -- a tela nunca inventa número.
export const SUGESTOES = [
  { nome: "Supabase", oQue: "banco e Edge Functions dos 8 sistemas", moeda: "USD", url: "https://supabase.com/dashboard/org/_/billing" },
  { nome: "GitHub", oQue: "código dos sistemas e as publicações (Actions)", moeda: "USD", url: "https://github.com/settings/billing" },
  { nome: "Claude", oQue: "assistente que mantém os sistemas", moeda: "USD", url: "https://claude.ai/settings/billing" },
  { nome: "Locaweb", oQue: "domínio impresilk.com.br e os atalhos", moeda: "BRL", url: "" },
  { nome: "Netlify", oQue: "o que ainda não migrou para o GitHub Pages", moeda: "USD", url: "" },
];

export const mesDe = (iso) => String(iso || "").slice(0, 7);

export const nomeDoMes = (mes) => {
  const M = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const [a, m] = String(mes || "").split("-");
  return m ? `${M[Number(m) - 1]} de ${a}` : "";
};

/* O dia do vencimento DENTRO do mês. Dia 31 em fevereiro não existe: cai no
   último dia, senão a conta ficaria eternamente "a vencer" e nunca venceria. */
export function vencimentoNoMes(dia, mes) {
  const [ano, m] = String(mes).split("-").map(Number);
  const ultimo = new Date(ano, m, 0).getDate();
  const d = Math.min(Math.max(Number(dia) || 1, 1), ultimo);
  return `${mes}-${String(d).padStart(2, "0")}`;
}

export function calcAssinaturas(mapa, opcoes = {}) {
  const hoje = opcoes.hoje || ymdLocal(new Date());
  const mes = opcoes.mes || mesDe(hoje);

  const lista = Object.entries(mapa || {})
    .map(([id, a]) => ({ id, ...a }))
    .filter((a) => a && a.nome)
    .map((a) => {
      const ativa = a.ativa !== false;
      // Sem dia cadastrado NÃO vira "vence dia 1": inventar data é pior do que
      // não ter data, porque o dono para de procurar a informação que falta.
      const temDia = Number(a.diaVencimento) >= 1 && Number(a.diaVencimento) <= 31;
      const vence = temDia ? vencimentoNoMes(a.diaVencimento, mes) : "";
      const pagos = a.pagos && typeof a.pagos === "object" ? a.pagos : {};
      const pagoEm = pagos[mes] || null;
      const dias = temDia ? diasEntre(hoje, vence) : null; // negativo = já passou
      const valor = Number(a.valor) || 0;
      const moeda = MOEDAS[a.moeda] ? a.moeda : "BRL";

      let estado;
      if (!ativa) estado = { chave: "inativa", rotulo: "Cancelada", tom: "neutral" };
      else if (pagoEm) estado = { chave: "pago", rotulo: `Pago ${pagoEm.slice(8, 10)}/${pagoEm.slice(5, 7)}`, tom: "ok" };
      else if (!temDia) estado = { chave: "semDia", rotulo: "Falta o dia do vencimento", tom: "warn" };
      else if (dias < 0) estado = { chave: "vencida", rotulo: `Venceu há ${Math.abs(dias)} d`, tom: "bad" };
      else if (dias === 0) estado = { chave: "hoje", rotulo: "Vence hoje", tom: "warn" };
      else if (dias <= 7) estado = { chave: "perto", rotulo: `Vence em ${dias} d`, tom: "warn" };
      else estado = { chave: "aberta", rotulo: `Vence dia ${vence.slice(8, 10)}`, tom: "neutral" };

      // `id` já vem dentro de `a` (o map anterior o colocou lá): repetir aqui
      // era um ReferenceError que só estoura em tempo de execução.
      return { ...a, ativa, valor, moeda, vence, dias, temDia, pagos, pagoEm, estado, semValor: !(valor > 0) };
    })
    // Quem vence primeiro no topo; pago vai para o fim.
    .sort((x, y) => {
      const peso = (i) => (i.estado.chave === "pago" ? 2 : i.estado.chave === "inativa" ? 3 : 0);
      const d = (i) => (i.temDia ? i.dias : 9999); // sem dia vai para o fim
      return peso(x) - peso(y) || d(x) - d(y) || y.valor - x.valor;
    });

  const ativas = lista.filter((a) => a.ativa);
  const aPagar = ativas.filter((a) => !a.pagoEm);
  const vencidas = aPagar.filter((a) => a.temDia && a.dias < 0);
  const semDia = ativas.filter((a) => !a.temDia);

  // Totais por moeda -- nunca um total só.
  const porMoeda = {};
  for (const a of ativas) {
    const b = (porMoeda[a.moeda] ||= { moeda: a.moeda, mensal: 0, aPagar: 0, pago: 0, semValor: 0 });
    b.mensal += a.valor;
    if (a.semValor) b.semValor += 1;
    if (a.pagoEm) b.pago += a.valor;
    else b.aPagar += a.valor;
  }

  return {
    lista,
    mes,
    kpis: {
      qtd: ativas.length,
      aPagarQtd: aPagar.length,
      vencidasQtd: vencidas.length,
      pagasQtd: ativas.length - aPagar.length,
      porMoeda: Object.values(porMoeda).sort((a, b) => b.mensal - a.mensal),
      // Quantas contas ainda não têm valor cadastrado: sem isto o total mente
      // por omissão e ninguém desconfia.
      semValor: ativas.filter((a) => a.semValor).length,
      semDia: semDia.length,
    },
  };
}

// Formata na moeda da linha. Duas moedas na mesma tela pedem o símbolo junto.
export function dinheiro(valor, moeda) {
  const s = MOEDAS[moeda]?.simbolo || "R$";
  return `${s} ${Number(valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
