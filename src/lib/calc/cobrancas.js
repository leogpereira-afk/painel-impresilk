/* A CARTEIRA DE COBRANÇA: um cartão por cliente que deve, com o que já foi
 * tentado.
 *
 * A tela de Contas Atrasadas responde "quem deve". A pergunta que trava a
 * cobrança é outra: "o que eu já tentei com esse aqui". Ligar de novo sem
 * saber que o cliente prometeu pagar dia 20 queima a relação e o tempo -- e é
 * exatamente o que acontece quando o histórico mora na cabeça de quem ligou.
 *
 * Este arquivo junta as duas metades: os títulos vencidos (do ERP) e os
 * chamados (o que a direção registrou). Sem rede nenhuma, para poder ser
 * testado.
 */

const num = (v) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/** Nome de cliente comparável: sem acento, sem caixa, sem espaço dobrado. */
export function chaveCliente(nome) {
  return String(nome ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

/* Os estados em que uma conversa de cobrança termina. São poucos de propósito:
   lista longa vira campo que ninguém preenche igual duas vezes, e aí não dá
   para filtrar nem contar. `promessa` é o único que pede data. */
export const SITUACOES = [
  { id: "prometeu", rotulo: "Prometeu pagar", pedeData: true, tom: "ok" },
  { id: "negociar", rotulo: "Quer negociar", pedeData: false, tom: "warn" },
  { id: "contestou", rotulo: "Contesta a cobrança", pedeData: false, tom: "bad" },
  { id: "semResposta", rotulo: "Não atendeu / sem retorno", pedeData: false, tom: "neutral" },
  { id: "pagou", rotulo: "Disse que já pagou", pedeData: false, tom: "brand" },
];

export const CANAIS = ["Ligação", "WhatsApp", "E-mail", "Presencial"];

const situacaoDe = (id) => SITUACOES.find((s) => s.id === id) || null;

/** Os chamados de um cliente, do mais novo para o mais velho. */
export function chamadosDoCliente(registro) {
  return Object.entries(registro?.chamados || {})
    .map(([id, c]) => ({
      id,
      data: String(c?.data ?? "").slice(0, 10),
      canal: String(c?.canal ?? ""),
      contato: String(c?.contato ?? ""),
      resumo: String(c?.resumo ?? ""),
      situacao: String(c?.situacao ?? ""),
      promessa: String(c?.promessa ?? "").slice(0, 10),
      quemNome: String(c?.quemNome ?? c?.quem ?? ""),
      em: String(c?.em ?? ""),
    }))
    .sort((a, b) => (b.data || b.em).localeCompare(a.data || a.em));
}

/* A CARTEIRA: um cartão por cliente com dívida, já com o último chamado.
 *
 * `hoje` entra como parâmetro para o teste não depender do relógio -- e para a
 * tela poder passar o dia LOCAL, que é o que a pessoa vê no calendário.
 */
export function carteiraDeCobranca(titulos, cobrancas, hoje) {
  const porCliente = new Map();
  for (const t of titulos || []) {
    const nome = String(t?.cliente ?? "").trim();
    if (!nome) continue;
    const k = chaveCliente(nome);
    let c = porCliente.get(k);
    if (!c) {
      c = { chave: k, cliente: nome, qtd: 0, valor: 0, maiorAtraso: 0, titulos: [] };
      porCliente.set(k, c);
    }
    c.qtd += 1;
    c.valor += num(t.valor);
    c.maiorAtraso = Math.max(c.maiorAtraso, num(t.dias));
    c.titulos.push(t);
  }

  const cartoes = [...porCliente.values()].map((c) => {
    const reg = (cobrancas || {})[c.chave] || null;
    const chamados = chamadosDoCliente(reg);
    const ultimo = chamados[0] || null;
    const sit = ultimo ? situacaoDe(ultimo.situacao) : null;

    /* PROMESSA VENCIDA é o estado que a lista existe para achar: alguém disse
       que pagaria, a data passou e ninguém voltou. Sem isto, a promessa vira
       desculpa para não ligar -- e some. */
    const promessaVencida = !!(
      ultimo && ultimo.situacao === "prometeu" && ultimo.promessa && ultimo.promessa < hoje
    );

    return {
      ...c,
      valor: Math.round(c.valor * 100) / 100,
      chamados,
      ultimo,
      situacaoRotulo: sit?.rotulo || null,
      situacaoTom: sit?.tom || "neutral",
      promessaVencida,
      // Nunca falado com: é onde a cobrança começa.
      semChamado: chamados.length === 0,
      // Dias desde o último contato. null quando nunca houve.
      diasSemContato: ultimo?.data ? diasEntre(ultimo.data, hoje) : null,
    };
  });

  /* A ORDEM É A DA AÇÃO, não a do valor. Primeiro quem prometeu e não cumpriu
     (a conversa já existe e foi quebrada), depois quem nunca foi chamado, e só
     então o resto por valor. Ordenar só por dinheiro põe no topo o cliente com
     quem se falou ontem. */
  return cartoes.sort((a, b) => {
    if (a.promessaVencida !== b.promessaVencida) return a.promessaVencida ? -1 : 1;
    if (a.semChamado !== b.semChamado) return a.semChamado ? -1 : 1;
    return b.valor - a.valor;
  });
}

function diasEntre(de, ate) {
  const a = new Date(`${de}T00:00:00`);
  const b = new Date(`${ate}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b - a) / 86400000);
}

/* O RESUMO DA CARTEIRA, para os números do topo. Cada um responde a uma
   pergunta que muda o que se faz agora -- não são três jeitos de somar a mesma
   dívida. */
export function resumoDaCarteira(cartoes) {
  const cem = (n) => Math.round(n * 100) / 100;
  const r = {
    clientes: cartoes.length,
    total: 0,
    // Prometeu e a data passou: é aqui que se liga primeiro.
    quebradas: 0, valorQuebrado: 0,
    // Nunca foi chamado: a cobrança nem começou.
    semChamado: 0, valorSemChamado: 0,
    // Prometeu e a data ainda não chegou: não ligar, esperar.
    aguardando: 0, valorAguardando: 0,
  };
  for (const c of cartoes) {
    r.total += c.valor;
    if (c.promessaVencida) { r.quebradas += 1; r.valorQuebrado += c.valor; }
    else if (c.semChamado) { r.semChamado += 1; r.valorSemChamado += c.valor; }
    else if (c.ultimo?.situacao === "prometeu" && c.ultimo.promessa) {
      r.aguardando += 1; r.valorAguardando += c.valor;
    }
  }
  for (const k of ["total", "valorQuebrado", "valorSemChamado", "valorAguardando"]) r[k] = cem(r[k]);
  return r;
}
