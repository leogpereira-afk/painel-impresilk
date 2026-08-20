/* CAMPANHAS: quanto vendemos para um evento, e quem comprou.
 *
 * Mesma base da permuta -- escolher clientes, aceitar O.S. uma a uma -- porque
 * é o mesmo trabalho: separar, dentro da carteira, o que pertence àquilo. O que
 * muda é a PERGUNTA.
 *
 *   A permuta pergunta  "quanto ainda sobra do crédito do parceiro"
 *   A campanha pergunta "quanto vendemos para este evento, e quem comprou"
 *
 * Por isso não há crédito nem saldo aqui. O número é o FATURAMENTO, e a leitura
 * é por comprador: numa eleição são vinte candidaturas, cada uma com o seu
 * CNPJ, e o que se quer saber é quanto cada uma comprou.
 *
 * A escolha continua sendo um ATO, nunca uma regra. Seria tentador dizer "toda
 * O.S. com 'eleição' no nome do cliente é da campanha" -- e aí a primeira
 * gráfica chamada "Eleição Papelaria" entraria sozinha, e ninguém perceberia.
 * Deduzir pelo nome já criou sósia na Central de Acessos.
 */

import {
  chaveCliente, valorDaOS, linhasDaPermuta, linhasPorCliente, linhasDosLancamentos,
} from "./permutas.js";

const num = (v) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export { chaveCliente, valorDaOS };

/** A ficha de uma O.S. dentro da campanha -- a mesma da permuta. */
export { fichaDaOS } from "./permutas.js";

/* O RESUMO DE UMA CAMPANHA.
 *
 * `linhasDaPermuta` é reaproveitada inteira: ela já sabe congelar o valor no
 * aceite, conferir contra o ERP a cada carga, avisar quando mudou e distinguir
 * "a O.S. sumiu" de "não deu para conferir". Essas regras não são da permuta --
 * são de qualquer lista de O.S. escolhida à mão, e a campanha é uma delas.
 */
export function resumoDaCampanha(campanha, ordens) {
  const linhas = linhasDaPermuta(campanha, ordens);
  const vendidoOS = Math.round(linhas.reduce((s, l) => s + l.valor, 0) * 100) / 100;
  const porCliente = linhasPorCliente(linhas, campanha?.clientes || []);

  /* VENDA SEM O.S.: o que foi da campanha mas não virou ordem de serviço --
     uma entrega acertada por fora, um faturamento em outro CNPJ nosso. Sem
     este lugar, a pessoa "conserta" o total inventando uma O.S. que não
     existe, e aí a lista de O.S. deixa de bater com o ERP.

     Só somam (`tipo` não é usado aqui): numa campanha não há o que abater --
     o que não foi vendido simplesmente não entra. */
  const vendasSemOS = linhasDosLancamentos(campanha);
  const semOS = Math.round(vendasSemOS.reduce((s, l) => s + l.valor, 0) * 100) / 100;
  const vendido = Math.round((vendidoOS + semOS) * 100) / 100;

  /* A META é opcional e só entra na conta quando existe. Sem ela a tela não
     mostra percentual nenhum -- fingir 0% num evento sem meta seria inventar
     uma cobrança que ninguém fez. */
  const meta = Math.round(num(campanha?.meta) * 100) / 100;

  return {
    linhas,
    porCliente,
    vendasSemOS,
    semOS,
    vendidoOS,
    vendido,
    meta,
    // Quantos compradores DE VERDADE: cliente ligado que não comprou nada não
    // conta, senão "12 compradores" incluiria quem só foi pesquisado.
    compradores: porCliente.length,
    // Quanto o maior comprador representa. É o número que responde "esta
    // campanha é um cliente só ou é um mercado".
    /* A fatia é sobre o que passou por O.S., NÃO sobre o total: a venda sem
       O.S. não pertence a comprador nenhum, e somá-la ao denominador
       encolheria a fatia de todos por causa de um valor sem dono. */
    maiorFatia: vendidoOS > 0 && porCliente.length ? porCliente[0].valor / vendidoOS : null,
    pct: meta > 0 ? vendido / meta : null,
    falta: meta > 0 ? Math.round((meta - vendido) * 100) / 100 : null,
    // Os mesmos avisos da permuta: divergência não se esconde.
    mudaram: linhas.filter((l) => l.mudou).length,
    sumiram: linhas.filter((l) => l.sumiu).length,
    semConferir: linhas.some((l) => l.semConferir),
  };
}

/* Todas as campanhas com o seu resumo, para a lista de abertura.
   As do ANO CORRENTE primeiro, depois as mais recentes: uma eleição de 2022 não
   pode empurrar para baixo a que está acontecendo. */
export function resumoGeralCampanhas(campanhas, ordens, anoHoje) {
  return Object.entries(campanhas || {})
    .map(([id, c]) => ({ id, ...c, ...resumoDaCampanha(c, ordens) }))
    .sort((a, b) => {
      if (!!a.encerrada !== !!b.encerrada) return a.encerrada ? 1 : -1;
      const aAno = String(a.ano || "");
      const bAno = String(b.ano || "");
      const aAtual = aAno === String(anoHoje);
      const bAtual = bAno === String(anoHoje);
      if (aAtual !== bAtual) return aAtual ? -1 : 1;
      return bAno.localeCompare(aAno) || b.vendido - a.vendido;
    });
}

/* OS NÚMEROS DO TOPO. Separados por ANO porque é assim que a pergunta é feita:
   "quanto a eleição de 2026 rendeu" não se compara com o total de todos os
   tempos. Campanha encerrada continua contando no ano dela -- ela aconteceu. */
export function totaisDasCampanhas(lista, anoHoje) {
  const cem = (n) => Math.round(n * 100) / 100;
  const doAno = lista.filter((c) => String(c.ano || "") === String(anoHoje));
  return {
    quantas: lista.length,
    vendidoTotal: cem(lista.reduce((s, c) => s + c.vendido, 0)),
    quantasNoAno: doAno.length,
    vendidoNoAno: cem(doAno.reduce((s, c) => s + c.vendido, 0)),
    // Compradores DISTINTOS no ano: o mesmo candidato em duas campanhas conta
    // uma vez. Somar os compradores de cada uma inflaria.
    compradoresNoAno: new Set(doAno.flatMap((c) => c.porCliente.map((p) => p.chave))).size,
    osNoAno: doAno.reduce((s, c) => s + c.linhas.length, 0),
  };
}

/* O RANKING DE COMPRADORES de uma campanha, ou de várias somadas.
   É o "quem comprou quanto" que a campanha existe para responder. */
export function compradoresDaCampanha(resumos) {
  const mapa = new Map();
  for (const r of resumos || []) {
    for (const c of r.porCliente || []) {
      const g = mapa.get(c.chave) || { chave: c.chave, cliente: c.cliente, cnpj: c.cnpj, qtd: 0, valor: 0 };
      g.qtd += c.qtd;
      g.valor += c.valor;
      if (!g.cnpj) g.cnpj = c.cnpj;
      mapa.set(c.chave, g);
    }
  }
  return [...mapa.values()]
    .map((g) => ({ ...g, valor: Math.round(g.valor * 100) / 100 }))
    .sort((a, b) => b.valor - a.valor);
}

/* O EXTRATO DE PAPEL de uma campanha.
 *
 * A tela é dividida por tarefa (ligar cliente, escolher O.S.); o papel é
 * dividido pela PERGUNTA: quem comprou quanto, e o que foi. Por isso aqui o
 * ranking vem antes da lista de O.S. -- numa eleição com vinte candidaturas, o
 * que se leva para a reunião é o ranking; a lista é a prova dele.
 */
export function extratoDaCampanha(campanha, ordens) {
  const r = resumoDaCampanha(campanha, ordens);
  return {
    ...r,
    // As O.S. em ordem de DATA para o papel (na tela vão por cliente): quem
    // confere um extrato percorre o calendário, não o cadastro.
    porData: [...r.linhas].sort((a, b) => String(a.data).localeCompare(String(b.data))),
  };
}
