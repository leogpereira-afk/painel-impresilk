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
    /* O DESFECHO VEM DO ÚLTIMO CHAMADO QUE TEVE UM. Registro sem desfecho --
       o eco do botão "Cobrado", por exemplo -- é anotação de que alguém
       cobrou, não notícia sobre o cliente. Lendo só `chamados[0]`, uma
       anotação dessas apagava a promessa vencida registrada dias antes. */
    const comDesfecho = chamados.find((ch) => ch.situacao) || null;
    const sit = comDesfecho ? situacaoDe(comDesfecho.situacao) : null;

    /* PROMESSA VENCIDA é o estado que a lista existe para achar: alguém disse
       que pagaria, a data passou e ninguém voltou. Sem isto, a promessa vira
       desculpa para não ligar -- e some. */
    const promessaVencida = !!(
      comDesfecho && comDesfecho.situacao === "prometeu" &&
      comDesfecho.promessa && comDesfecho.promessa < hoje
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

  return ordenarCarteira(cartoes, "acao");
}

/* AS ORDENS POSSÍVEIS. `acao` é o padrão e é opinião: primeiro quem prometeu e
   não cumpriu (a conversa já existe e foi quebrada), depois quem nunca foi
   chamado, e só então o resto por valor. Ordenar só por dinheiro põe no topo o
   cliente com quem se falou ontem.

   As outras existem porque a pergunta muda: numa manhã de cobrança grande vale
   o valor; numa faxina de carteira vale o número de títulos; para achar quem
   está esquecido vale o tempo sem contato. */
export const ORDENS = [
  { id: "acao", rotulo: "O que fazer agora" },
  { id: "valor", rotulo: "Maior valor" },
  { id: "titulos", rotulo: "Mais títulos" },
  { id: "atraso", rotulo: "Maior atraso" },
  { id: "recente", rotulo: "Contato mais recente" },
  { id: "esquecido", rotulo: "Mais tempo sem contato" },
];

export function ordenarCarteira(cartoes, ordem) {
  const c = [...cartoes];
  /* Quem NUNCA foi contatado não tem "há quantos dias": em `recente` ele vai
     para o fim (não há contato para ser recente) e em `esquecido` vai para o
     COMEÇO, porque zero contato é o esquecimento máximo. Tratar null como zero
     inverteria os dois. */
  const semContatoNoFim = (x) => (x.diasSemContato === null ? Number.POSITIVE_INFINITY : x.diasSemContato);
  switch (ordem) {
    case "valor":     return c.sort((a, b) => b.valor - a.valor);
    case "titulos":   return c.sort((a, b) => b.qtd - a.qtd || b.valor - a.valor);
    case "atraso":    return c.sort((a, b) => b.maiorAtraso - a.maiorAtraso || b.valor - a.valor);
    case "recente":   return c.sort((a, b) => semContatoNoFim(a) - semContatoNoFim(b) || b.valor - a.valor);
    case "esquecido": return c.sort((a, b) => semContatoNoFim(b) - semContatoNoFim(a) || b.valor - a.valor);
    default:
      return c.sort((a, b) => {
        if (a.promessaVencida !== b.promessaVencida) return a.promessaVencida ? -1 : 1;
        if (a.semChamado !== b.semChamado) return a.semChamado ? -1 : 1;
        return b.valor - a.valor;
      });
  }
}

/* O RECORTE: nome do cliente e janela de vencimento.
 *
 * O filtro de data corta TÍTULOS, e o cartão é recontado com o que sobrou --
 * não é um filtro de cartões. Se ele apenas escondesse clientes, o valor
 * mostrado continuaria sendo o da dívida inteira e a soma da tela não fecharia
 * com a lista. Cliente que fica sem nenhum título no período sai. */
export function filtrarCarteira(cartoes, { termo = "", de = "", ate = "" } = {}) {
  const t = chaveCliente(termo);
  const recorta = de || ate;
  let fora = cartoes;
  if (t.length >= 2) fora = fora.filter((c) => c.chave.includes(t));
  if (!recorta) return fora;

  return fora
    .map((c) => {
      const titulos = c.titulos.filter((x) => {
        const v = String(x?.vencimento ?? "").slice(0, 10);
        if (!v) return false;
        if (de && v < de) return false;
        if (ate && v > ate) return false;
        return true;
      });
      if (!titulos.length) return null;
      return {
        ...c,
        titulos,
        qtd: titulos.length,
        valor: Math.round(titulos.reduce((s, x) => s + num(x.valor), 0) * 100) / 100,
        maiorAtraso: titulos.reduce((m, x) => Math.max(m, num(x.dias)), 0),
      };
    })
    .filter(Boolean);
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
    /* O QUARTO NÚMERO: em conversa (negociando, contestou, não atendeu,
       prometeu sem data). Sem ele os três cards não somavam o total da
       carteira -- o CEO somava de cabeça e não fechava, e a diferença ficava
       sem nome. Todo cartão cai em exatamente UM dos quatro. */
    emConversa: 0, valorEmConversa: 0,
  };
  for (const c of cartoes) {
    r.total += c.valor;
    if (c.promessaVencida) { r.quebradas += 1; r.valorQuebrado += c.valor; }
    else if (c.semChamado) { r.semChamado += 1; r.valorSemChamado += c.valor; }
    else if (c.ultimo?.situacao === "prometeu" && c.ultimo.promessa) {
      r.aguardando += 1; r.valorAguardando += c.valor;
    } else { r.emConversa += 1; r.valorEmConversa += c.valor; }
  }
  for (const k of ["total", "valorQuebrado", "valorSemChamado", "valorAguardando", "valorEmConversa"]) r[k] = cem(r[k]);
  return r;
}
