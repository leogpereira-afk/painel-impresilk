/* Os casos que fazem a campanha mentir.
 *   node --test src/lib/calc/campanhas.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  resumoDaCampanha, resumoGeralCampanhas, totaisDasCampanhas, compradoresDaCampanha, fichaDaOS,
  extratoDaCampanha, anosDasCampanhas, totaisDoAno, comparativoPorAno, edicoesDoMesmoEvento,
  anosRepetidos, membrosDoEvento, candidatasAVincular, comparativoDeEdicoes, maiorComprador, comprasPorMes, produtosDaCampanha, categoriasDosProdutos,
  porProduto,
} from "./campanhas.js";

const os = (id, cliente, valor, extra = {}) => ({
  id, numero: `2${id}`, cliente, data: "2026-03-10", cnpj: "", valor, ...extra,
});

test("o vendido é a soma das O.S. escolhidas, e quem comprou vem separado", () => {
  const ordens = [os(1, "Candidato A", 49495), os(2, "Candidato B", 8500), os(3, "Candidato A", 640)];
  const c = { nome: "Eleições 2026", ano: "2026",
              os: Object.fromEntries(ordens.map((o) => [o.id, fichaDaOS(o)])) };
  const r = resumoDaCampanha(c, ordens);
  assert.equal(r.vendido, 58635);
  assert.equal(r.compradores, 2);
  assert.deepEqual(r.porCliente.map((x) => [x.cliente, x.valor]),
    [["Candidato A", 50135], ["Candidato B", 8500]]);
});

test("a maior fatia diz se a campanha é um cliente só ou um mercado", () => {
  const ordens = [os(1, "A", 9000), os(2, "B", 1000)];
  const c = { os: Object.fromEntries(ordens.map((o) => [o.id, fichaDaOS(o)])) };
  assert.equal(resumoDaCampanha(c, ordens).maiorFatia, 0.9);
});

test("campanha vazia não inventa fatia nem percentual", () => {
  const r = resumoDaCampanha({ os: {} }, [os(9, "X", 1)]);
  assert.equal(r.vendido, 0);
  assert.equal(r.maiorFatia, null);
  assert.equal(r.pct, null, "sem meta não há percentual");
  assert.equal(r.falta, null);
});

test("a meta só entra quando existe -- 0% num evento sem meta seria invenção", () => {
  const ordens = [os(1, "A", 300)];
  const semMeta = resumoDaCampanha({ os: { 1: fichaDaOS(ordens[0]) } }, ordens);
  assert.equal(semMeta.pct, null);
  const comMeta = resumoDaCampanha({ meta: 1000, os: { 1: fichaDaOS(ordens[0]) } }, ordens);
  assert.equal(comMeta.pct, 0.3);
  assert.equal(comMeta.falta, 700);
});

test("cliente ligado que não comprou nada NÃO conta como comprador", () => {
  // Senão "12 compradores" incluiria quem só foi pesquisado na busca.
  const ordens = [os(1, "A", 500)];
  const c = { clientes: [{ chave: "A", nome: "A" }, { chave: "B", nome: "B" }],
              os: { 1: fichaDaOS(ordens[0]) } };
  assert.equal(resumoDaCampanha(c, ordens).compradores, 1);
});

test("a campanha herda os avisos da permuta: divergência não se esconde", () => {
  const antes = os(1, "A", 300);
  const c = { os: { 1: fichaDaOS(antes) } };
  // O ERP corrigiu para 450.
  const r = resumoDaCampanha(c, [os(1, "A", 450)]);
  assert.equal(r.vendido, 450, "o valor do ERP manda");
  assert.equal(r.mudaram, 1);
  // E lista vazia não vira "tudo cancelado".
  const semErp = resumoDaCampanha(c, []);
  assert.equal(semErp.sumiram, 0);
  assert.equal(semErp.semConferir, true);
  assert.equal(semErp.vendido, 300, "se sustenta no congelado");
});

test("a lista abre pelo ANO CORRENTE, não pelo valor", () => {
  // Uma eleição de 2022 não pode empurrar para baixo a que está acontecendo.
  const ordens = [os(1, "A", 100), os(2, "B", 90000)];
  const g = resumoGeralCampanhas({
    velha: { nome: "Eleições 2022", ano: "2022", os: { 2: fichaDaOS(ordens[1]) } },
    atual: { nome: "Eleições 2026", ano: "2026", os: { 1: fichaDaOS(ordens[0]) } },
    fim:   { nome: "Festa 2026", ano: "2026", encerrada: true, os: {} },
  }, ordens, 2026);
  assert.deepEqual(g.map((c) => c.nome), ["Eleições 2026", "Eleições 2022", "Festa 2026"]);
});

test("os totais do ano não somam o mesmo comprador duas vezes", () => {
  const ordens = [os(1, "A", 100), os(2, "A", 200), os(3, "B", 50)];
  const lista = resumoGeralCampanhas({
    x: { nome: "X", ano: "2026", os: { 1: fichaDaOS(ordens[0]) } },
    y: { nome: "Y", ano: "2026", os: { 2: fichaDaOS(ordens[1]), 3: fichaDaOS(ordens[2]) } },
    z: { nome: "Z", ano: "2025", os: {} },
  }, ordens, 2026);
  const t = totaisDasCampanhas(lista, 2026);
  assert.equal(t.quantas, 3);
  assert.equal(t.quantasNoAno, 2);
  assert.equal(t.vendidoNoAno, 350);
  assert.equal(t.compradoresNoAno, 2, "A comprou nas duas e conta uma vez");
  assert.equal(t.osNoAno, 3);
});

test("o ranking soma o mesmo comprador de várias campanhas", () => {
  const ordens = [os(1, "A", 100), os(2, "A", 200), os(3, "B", 500)];
  const lista = resumoGeralCampanhas({
    x: { nome: "X", ano: "2026", os: { 1: fichaDaOS(ordens[0]) } },
    y: { nome: "Y", ano: "2026", os: { 2: fichaDaOS(ordens[1]), 3: fichaDaOS(ordens[2]) } },
  }, ordens, 2026);
  const r = compradoresDaCampanha(lista);
  assert.deepEqual(r.map((x) => [x.cliente, x.valor, x.qtd]), [["B", 500, 1], ["A", 300, 2]]);
});

test("venda sem O.S. entra no total do evento", () => {
  const ordens = [os(1, "A", 1000)];
  const c = {
    os: Object.fromEntries(ordens.map((o) => [o.id, fichaDaOS(o)])),
    lancamentos: { l1: { data: "2026-04-02", descricao: "Painel entregue direto", valor: 500 } },
  };
  const r = resumoDaCampanha(c, ordens);
  assert.equal(r.vendidoOS, 1000);
  assert.equal(r.semOS, 500);
  assert.equal(r.vendido, 1500, "o evento rendeu os dois");
  assert.equal(r.vendasSemOS.length, 1);
});

test("a venda sem O.S. NÃO encolhe a fatia de quem comprou", () => {
  /* Este é o erro que o denominador errado cria: o comprador único levou 100%
     do que passou por O.S., e somar ao denominador uma venda que não é de
     ninguém faria a tela dizer 67% -- uma fatia que não existe. */
  const ordens = [os(1, "A", 1000)];
  const c = {
    os: Object.fromEntries(ordens.map((o) => [o.id, fichaDaOS(o)])),
    lancamentos: { l1: { data: "2026-04-02", descricao: "sem O.S.", valor: 500 } },
  };
  assert.equal(resumoDaCampanha(c, ordens).maiorFatia, 1);
});

test("lançamento sem valor não conta, e o campo em texto com vírgula conta", () => {
  const c = { os: {}, lancamentos: {
    vazio: { data: "2026-01-01", descricao: "rascunho" },
    texto: { data: "2026-01-02", descricao: "acerto", valor: "1.234,50".replace(".", "") },
  } };
  // "1234,50" -- é assim que o campo da tela entrega antes do paraNumero.
  assert.equal(resumoDaCampanha(c, []).semOS, 1234.5);
});

test("o extrato de papel percorre o calendário, não o cadastro", () => {
  const ordens = [
    os(1, "B", 100, { data: "2026-05-20" }),
    os(2, "A", 900, { data: "2026-02-01" }),
  ];
  const c = { os: Object.fromEntries(ordens.map((o) => [o.id, fichaDaOS(o)])) };
  const e = extratoDaCampanha(c, ordens);
  assert.deepEqual(e.porData.map((l) => l.data), ["2026-02-01", "2026-05-20"]);
  assert.deepEqual(e.porCliente.map((x) => x.cliente), ["A", "B"], "o ranking continua por valor");
});

/* ------------------------------------------------------- comparar por ano */

const campanha = (id, nome, ano, valores, extra = {}) => {
  const ordens = valores.map((v, i) => os(Number(`${id}${i}`), `COMPRADOR ${id}${i}`, v));
  return { entrada: { id, nome, ano, os: Object.fromEntries(ordens.map((o) => [o.id, fichaDaOS(o)])), ...extra }, ordens };
};
const monta = (...cs) => {
  const mapa = {}, ordens = [];
  for (const c of cs) { mapa[c.entrada.id] = c.entrada; ordens.push(...c.ordens); }
  return resumoGeralCampanhas(mapa, ordens, 2026);
};

test("os anos vêm do mais ANTIGO para o mais novo, sem inventar os vazios", () => {
  /* Tempo se lê para a frente: começar pelo mais recente obriga quem lê a
     inverter a linha do tempo na cabeça para ver se cresceu. */
  const lista = monta(campanha(1, "Eleições", "2026", [100]), campanha(2, "Eleições", "2022", [80]),
                      campanha(3, "Festa", "2026", [20]));
  assert.deepEqual(anosDasCampanhas(lista), [{ ano: "2022", quantas: 1 }, { ano: "2026", quantas: 2 }],
    "2023, 2024 e 2025 não existem — não pode aparecer ano sem campanha");
});

test("ano inválido não vira ano", () => {
  const lista = monta(campanha(1, "X", "", [10]), campanha(2, "Y", "26", [10]), campanha(3, "Z", "2026", [10]));
  assert.deepEqual(anosDasCampanhas(lista).map((a) => a.ano), ["2026"]);
});

test("selecionar o ano recorta os números, e 'todos' junta a história inteira", () => {
  const lista = monta(campanha(1, "Eleições", "2026", [100, 50]), campanha(2, "Eleições", "2022", [80]));
  assert.equal(totaisDoAno(lista, "2026").vendido, 150);
  assert.equal(totaisDoAno(lista, "2026").os, 2);
  assert.equal(totaisDoAno(lista, "2022").vendido, 80);
  assert.equal(totaisDoAno(lista, "todos").vendido, 230);
  assert.equal(totaisDoAno(lista, "").vendido, 230, "vazio também é 'todos'");
});

test("campanha sem ano fica de fora do recorte e a tela é avisada", () => {
  /* Sem este aviso a soma dos anos não fecha com o total geral e ninguém
     descobre por quê -- a campanha some do recorte em silêncio. */
  const lista = monta(campanha(1, "Com ano", "2026", [100]), campanha(2, "Sem ano", "", [70]));
  assert.equal(totaisDoAno(lista, "2026").vendido, 100);
  assert.equal(totaisDoAno(lista, "2026").semAno, 1);
  assert.equal(totaisDoAno(lista, "todos").vendido, 170, "em 'todos' ela conta");
  /* Em "todos" ela ENTRA no total mas fica fora do quadro ano a ano, então a
     soma das linhas não fecha com o número grande -- é justamente onde o aviso
     mais precisa aparecer. Eu zerava o contador exatamente aqui. */
  assert.equal(totaisDoAno(lista, "todos").semAno, 1, "em 'todos' é onde a soma dos anos não fecha");
});

test("o comprador que voltou em duas campanhas do ano conta UMA vez", () => {
  const o1 = os(1, "CANDIDATO A", 100), o2 = os(2, "CANDIDATO A", 60);
  const lista = resumoGeralCampanhas({
    a: { nome: "Eleições", ano: "2026", os: { 1: fichaDaOS(o1) } },
    b: { nome: "Festa", ano: "2026", os: { 2: fichaDaOS(o2) } },
  }, [o1, o2], 2026);
  assert.equal(totaisDoAno(lista, "2026").compradores, 1);
  assert.equal(totaisDoAno(lista, "2026").vendido, 160, "o dinheiro soma, o comprador não");
});

test("a comparação é contra a EDIÇÃO ANTERIOR, não contra o ano−1", () => {
  /* Eleição é de 2 em 2 anos. Comparar 2026 com 2025 (sem eleição) daria
     −100% e mandaria a direção investigar uma queda que nunca existiu. */
  const lista = monta(campanha(1, "Eleições", "2026", [150]), campanha(2, "Eleições", "2022", [100]));
  const [velho, novo] = comparativoPorAno(lista);   // ascendente: a antiga vem primeiro
  assert.equal(velho.ano, "2022");
  assert.equal(velho.variacao, null, "a linha mais antiga não tem contra o que comparar");
  assert.equal(velho.anoAnterior, null);
  assert.equal(novo.ano, "2026");
  assert.equal(novo.anoAnterior, "2022", "pula 2025, 2024 e 2023: não houve campanha");
  assert.equal(novo.diferenca, 50);
  assert.equal(novo.variacao, 0.5);
});

test("edição anterior que vendeu zero não vira percentual infinito", () => {
  const lista = monta(campanha(1, "Eleições", "2026", [150]), campanha(2, "Eleições", "2022", []));
  const novo = comparativoPorAno(lista).at(-1);   // a mais nova é a ÚLTIMA
  assert.equal(novo.ano, "2026");
  assert.equal(novo.diferenca, 150, "a diferença em reais existe");
  assert.equal(novo.variacao, null, "o percentual, não");
});

test("as outras edições do mesmo evento casam pelo nome, e só de OUTROS anos", () => {
  const lista = monta(
    campanha(1, "Eleições Municipais", "2026", [150]),
    campanha(2, "eleições  municipais", "2022", [100]),   // caixa e espaço não separam
    campanha(3, "Eleições Municipais", "2026", [10]),     // mesmo ano = cadastro duplicado
    campanha(4, "Festa da Cidade", "2022", [90]),
  );
  const atual = lista.find((c) => c.id === 1);
  const outras = edicoesDoMesmoEvento(lista, atual);
  assert.deepEqual(outras.map((c) => [c.ano, c.vendido]), [["2022", 100]]);
});

test("campanha sem nome não arrasta todas as outras sem nome", () => {
  const lista = monta(campanha(1, "", "2026", [10]), campanha(2, "", "2022", [20]));
  assert.deepEqual(edicoesDoMesmoEvento(lista, lista.find((c) => c.id === 1)), []);
});

test("a mesma O.S. em duas campanhas do ano é DENUNCIADA, não somada em silêncio", () => {
  /* A tela bloqueia marcar, mas o bloqueio só age na hora de marcar: duas
     abas ao mesmo tempo passam pelas duas. O controle compara a soma das
     campanhas com as O.S. distintas -- dois caminhos diferentes, então ele
     consegue falhar. */
  const o1 = os(1, "A", 100), o2 = os(2, "B", 40);
  const lista = resumoGeralCampanhas({
    a: { nome: "Eleições", ano: "2026", os: { 1: fichaDaOS(o1), 2: fichaDaOS(o2) } },
    b: { nome: "Festa", ano: "2026", os: { 1: fichaDaOS(o1) } },
  }, [o1, o2], 2026);
  const t = totaisDoAno(lista, "2026");
  assert.equal(t.repetidas, 1);
  assert.equal(t.valorRepetido, 100);
  assert.equal(t.vendido, 240, "o total continua sendo a soma das campanhas — mas agora acompanhado do aviso");
});

test("sem repetição o controle fica em zero", () => {
  const o1 = os(1, "A", 100), o2 = os(2, "B", 40);
  const lista = resumoGeralCampanhas({
    a: { nome: "Eleições", ano: "2026", os: { 1: fichaDaOS(o1) } },
    b: { nome: "Festa", ano: "2026", os: { 2: fichaDaOS(o2) } },
  }, [o1, o2], 2026);
  assert.equal(totaisDoAno(lista, "2026").repetidas, 0);
  assert.equal(totaisDoAno(lista, "2026").valorRepetido, 0);
});

test("a mesma O.S. em ANOS diferentes não é repetição dentro do ano", () => {
  const o1 = os(1, "A", 100);
  const lista = resumoGeralCampanhas({
    a: { nome: "Eleições", ano: "2026", os: { 1: fichaDaOS(o1) } },
    b: { nome: "Eleições", ano: "2022", os: { 1: fichaDaOS(o1) } },
  }, [o1], 2026);
  assert.equal(totaisDoAno(lista, "2026").repetidas, 0, "cada ano vê a sua");
  assert.equal(totaisDoAno(lista, "todos").repetidas, 1, "na história inteira ela aparece duas vezes");
});

/* O caso que o meu primeiro teste NÃO montava: dois anos SEGUIDOS, com eventos
   diferentes. Era o único jeito de o "pulo" nunca acontecer -- e eu só tinha
   testado anos vazios no meio, ou seja, só o caso em que o código acerta. */
test("o quadro ano a ano compara TOTAL DE ANO, inclusive com evento diferente no meio", () => {
  const lista = monta(
    campanha(1, "Eleição", "2026", [450000]),
    campanha(2, "Festa da Cidade", "2025", [20000]),
    campanha(3, "Eleição", "2024", [400000]),
  );
  const [a24, a25, a26] = comparativoPorAno(lista);
  assert.equal(a24.anoAnterior, null, "a mais antiga abre a lista");
  assert.equal(a25.anoAnterior, "2024");
  assert.equal(a26.anoAnterior, "2025", "2025 teve campanha, então NÃO é pulado");
  assert.equal(Math.round(a26.variacao * 100), 2150, "é comparação de total de ano, e a tela diz isso");
});

test("a comparação do MESMO EVENTO é outra pergunta, e acha a edição certa", () => {
  const lista = monta(
    campanha(1, "Eleição", "2026", [450000]),
    campanha(2, "Festa da Cidade", "2025", [20000]),
    campanha(3, "Eleição", "2024", [400000]),
  );
  const outras = edicoesDoMesmoEvento(lista, lista.find((c) => c.id === 1));
  assert.deepEqual(outras.map((c) => [c.ano, c.vendido]), [["2024", 400000]],
    "a festa de 2025 não é edição da eleição; +12,5% é a resposta certa desta pergunta");
});

test("campanha sem ano não é edição de ninguém, nem tem edições", () => {
  const lista = monta(campanha(1, "Eleições", "", [10]), campanha(2, "Eleições", "2022", [20]));
  assert.deepEqual(edicoesDoMesmoEvento(lista, lista.find((c) => c.id === 1)), [],
    "sem ano de 4 dígitos ela não entra na cadeia -- saía 'vs ' sem ano");
  assert.deepEqual(edicoesDoMesmoEvento(lista, lista.find((c) => c.id === 2)), [],
    "e ela também não aparece como edição de outra");
});

test("ano com espaço conta no chip E no cartão -- as duas réguas são a mesma", () => {
  const lista = monta(campanha(1, "A", "2026", [10]), campanha(2, "B", "2026 ", [90]),
                      campanha(3, "C", "2022", [5]));
  assert.equal(anosDasCampanhas(lista).find((a) => a.ano === "2026").quantas, 2);
  assert.equal(totaisDoAno(lista, "2026").vendido, 100, "o cartão soma as duas, como o chip contou");
  assert.equal(totaisDoAno(lista, "2026").semAno, 0);
});

test("cadastro duplicado no mesmo ano é DENUNCIADO, não comparado consigo mesmo", () => {
  const lista = monta(
    campanha(1, "Eleição Municipal", "2026", [40000]),
    campanha(2, "Eleição Municipal", "2022", [30000]),
    campanha(3, "Eleição Municipal", "2022", [20000]),
  );
  const outras = edicoesDoMesmoEvento(lista, lista.find((c) => c.id === 1));
  assert.equal(outras.length, 2, "as duas de 2022 existem de verdade e não somem");
  assert.deepEqual(anosRepetidos(outras), ["2022"], "e a tela é avisada de que 2022 veio repetido");
});

/* ------------------------------ quem, quando e O QUE foi vendido na campanha */

const osComItens = (id, cliente, itens, data = "2026-03-10") => ({
  id, numero: `2${id}`, cliente, data, cnpj: "",
  valor: itens.reduce((s, i) => s + i.valorTotal, 0), itens,
});
const item = (produto, quantidade, valorTotal, categoria = "Comunicação visual") =>
  ({ produto, categoria, modelo: "", quantidade, valorUnit: valorTotal / quantidade, valorTotal });

test("o maior comprador vem com a fatia e com a distância para o segundo", () => {
  const ordens = [os(1, "A", 9000), os(2, "B", 1000)];
  const c = { os: Object.fromEntries(ordens.map((o) => [o.id, fichaDaOS(o)])) };
  const m = maiorComprador(resumoDaCampanha(c, ordens));
  assert.equal(m.cliente, "A");
  assert.equal(m.fatia, 0.9);
  assert.equal(m.sobreOSegundo, 8000, "é o que diz se a campanha se apoia numa perna só");
});

test("comprador único não inventa distância para um segundo que não existe", () => {
  const ordens = [os(1, "A", 500)];
  const c = { os: Object.fromEntries(ordens.map((o) => [o.id, fichaDaOS(o)])) };
  assert.equal(maiorComprador(resumoDaCampanha(c, ordens)).sobreOSegundo, null);
});

test("campanha sem comprador não tem maior comprador", () => {
  assert.equal(maiorComprador(resumoDaCampanha({ os: {} }, [])), null);
});

test("a curva mensal preenche o buraco NO MEIO, e não inventa fora das pontas", () => {
  /* Sem os meses vazios, compras em janeiro e abril viram duas barras coladas
     e a campanha parece contínua. */
  const linhas = [
    { data: "2026-01-15", valor: 100 },
    { data: "2026-04-02", valor: 300 },
    { data: "2026-04-20", valor: 200 },
  ];
  const meses = comprasPorMes(linhas);
  assert.deepEqual(meses.map((m) => m.mes), ["2026-01", "2026-02", "2026-03", "2026-04"]);
  assert.deepEqual(meses.map((m) => m.valor), [100, 0, 0, 500]);
  assert.deepEqual(meses.map((m) => m.qtd), [1, 0, 0, 2]);
});

test("a curva mensal atravessa a virada do ano", () => {
  const meses = comprasPorMes([{ data: "2025-11-10", valor: 10 }, { data: "2026-02-01", valor: 20 }]);
  assert.deepEqual(meses.map((m) => m.mes), ["2025-11", "2025-12", "2026-01", "2026-02"]);
});

test("data inválida não entra na curva nem trava a tela", () => {
  const meses = comprasPorMes([{ data: "", valor: 10 }, { data: "xx", valor: 5 }, { data: "2026-03-01", valor: 7 }]);
  assert.deepEqual(meses, [{ mes: "2026-03", qtd: 1, valor: 7 }]);
});

test("o ranking de produtos soma os itens das O.S. marcadas, juntando acento e caixa", () => {
  const ordens = [
    osComItens(1, "A", [item("Placa PVC", 10, 1000), item("Adesivo Vinílico", 5, 500)]),
    osComItens(2, "B", [item("adesivo vinilico", 3, 300), item("Lona", 1, 900)]),
  ];
  const c = { os: Object.fromEntries(ordens.map((o) => [o.id, fichaDaOS(o)])) };
  const p = produtosDaCampanha(c, ordens);
  assert.deepEqual(p.itens.map((i) => [i.produto, i.quantidade, i.valor, i.os]),
    [["Placa PVC", 10, 1000, 1], ["Lona", 1, 900, 1], ["Adesivo Vinílico", 8, 800, 2]]);
  assert.equal(p.total, 2700);
  assert.equal(p.completo, true);
});

test("ranking vazio DIZ por quê -- 'sem item' e 'ainda não carregado' não podem ficar iguais", () => {
  /* Esta é a regra que já me fez reportar o sistema mais pesado da casa como o
     mais leve: medição que dá zero pode ser "não cheguei lá". */
  const comIt = osComItens(1, "A", [item("Placa", 1, 100)]);
  const semIt = { id: 2, numero: "22", cliente: "B", data: "2026-03-10", valor: 50, itens: [] };
  const c = { os: { 1: fichaDaOS(comIt), 2: fichaDaOS(semIt), 3: { numero: "23", valor: 70 } } };
  const p = produtosDaCampanha(c, [comIt, semIt]);   // a O.S. 3 não veio na busca
  assert.equal(p.cobertura.aceitas, 3);
  assert.equal(p.cobertura.comItens, 1);
  assert.equal(p.cobertura.semItens, 1, "veio na busca e não tem item gravado");
  assert.equal(p.cobertura.foraDaBusca, 1, "não veio na busca: cancelada ou fora do período");
  assert.equal(p.completo, false, "a tela não pode chamar isto de 'os produtos da campanha'");
});

test("campanha sem nenhuma O.S. lida não é 'completa'", () => {
  const p = produtosDaCampanha({ os: {} }, []);
  assert.deepEqual(p.itens, []);
  assert.equal(p.completo, false, "zero de zero não é um ranking completo");
});

test("as categorias dobram o ranking: dois produtos, uma decisão", () => {
  const ordens = [osComItens(1, "A", [
    item("Placa PVC 3mm", 2, 200, "Placa"),
    item("Placa PVC 5mm", 1, 300, "Placa"),
    item("Lona 440g", 1, 100, "Lona"),
  ])];
  const c = { os: Object.fromEntries(ordens.map((o) => [o.id, fichaDaOS(o)])) };
  const cats = categoriasDosProdutos(produtosDaCampanha(c, ordens));
  assert.deepEqual(cats.map((x) => [x.categoria, x.valor, x.produtos]), [["Placa", 500, 2], ["Lona", 100, 1]]);
});

/* --------------------------------- o vínculo declarado entre edições */

test("o vínculo declarado sobrevive a renomear -- o nome sozinho não sobrevivia", () => {
  const lista = monta(
    campanha(1, "Eleição Municipal", "2026", [100], { evento: "ev-1" }),
    campanha(2, "Eleições 2022", "2022", [80], { evento: "ev-1" }),   // renomeada
  );
  const outras = edicoesDoMesmoEvento(lista, lista.find((c) => c.id === 1));
  assert.deepEqual(outras.map((c) => c.ano), ["2022"],
    "pelo nome elas nunca se achariam; pelo vínculo, sim");
});

test("cadastrada solta com o mesmo nome continua sendo achada", () => {
  const lista = monta(
    campanha(1, "Festa da Cidade", "2026", [100], { evento: "ev-9" }),
    campanha(2, "festa da  cidade", "2024", [70]),   // sem vínculo, só o nome
  );
  assert.deepEqual(edicoesDoMesmoEvento(lista, lista.find((c) => c.id === 1)).map((c) => c.ano), ["2024"]);
});

test("as duas pontas veem a MESMA lista -- a regra ingênua dava listas diferentes", () => {
  /* A(vínculo X, "Eleição") · B(vínculo X, renomeada) · C(sem vínculo, "Eleição").
     Casando por "evento OU nome" sem agrupar, A via B e C, mas B via só A. */
  const lista = monta(
    campanha(1, "Eleição", "2026", [10], { evento: "X" }),
    campanha(2, "Eleição Municipal", "2024", [20], { evento: "X" }),
    campanha(3, "Eleição", "2022", [30]),
  );
  const deA = edicoesDoMesmoEvento(lista, lista.find((c) => c.id === 1)).map((c) => c.ano).sort();
  const deB = edicoesDoMesmoEvento(lista, lista.find((c) => c.id === 2)).map((c) => c.ano).sort();
  const deC = edicoesDoMesmoEvento(lista, lista.find((c) => c.id === 3)).map((c) => c.ano).sort();
  assert.deepEqual(deA, ["2022", "2024"]);
  assert.deepEqual(deB, ["2022", "2026"]);
  assert.deepEqual(deC, ["2024", "2026"], "B e C se acham pelo caminho A, e as três fecham");
});

test("campanha sem nome não vira edição de todas as outras sem nome", () => {
  /* "Nova campanha" nasce sem nome preenchido; se o vazio agrupasse, cada
     campanha recém-criada apareceria como edição de todas as outras. */
  const lista = monta(campanha(1, "", "2026", [10]), campanha(2, "", "2024", [20]));
  assert.deepEqual(edicoesDoMesmoEvento(lista, lista.find((c) => c.id === 1)), []);
});

test("eventos diferentes com vínculos diferentes não se misturam", () => {
  const lista = monta(
    campanha(1, "Eleição", "2026", [10], { evento: "A" }),
    campanha(2, "Festa", "2024", [20], { evento: "B" }),
  );
  assert.deepEqual(edicoesDoMesmoEvento(lista, lista.find((c) => c.id === 1)), []);
});

/* ------------------------- vincular campanhas que já existem, e o cartão */

test("o ano dentro do NOME é o caso real: elas nunca se acham sozinhas", () => {
  /* É a nomenclatura do Léo na base de verdade: "Política 2026 - Deputados".
     A de 2022 se chama "Política 2022 - Deputados" -- nome diferente, nenhum
     vínculo. Sem um jeito de vincular à mão, a comparação nunca existe. */
  const lista = monta(
    campanha(1, "Política 2026 - Deputados", "2026", [268638.85]),
    campanha(2, "Política 2022 - Deputados", "2022", [180000]),
  );
  assert.deepEqual(edicoesDoMesmoEvento(lista, lista.find((c) => c.id === 1)), []);
  assert.deepEqual(candidatasAVincular(lista, lista.find((c) => c.id === 1)).map((c) => c.ano), ["2022"]);
});

test("vincular carimba o grupo INTEIRO do outro, não só ele", () => {
  /* B e C já eram um evento. Ligando B em A, se só B fosse carimbado, C ficaria
     órfão e o vínculo B–C sumiria calado. */
  const lista = monta(
    campanha(1, "A 2026", "2026", [10], { evento: "evA" }),
    campanha(2, "B 2024", "2024", [20], { evento: "evB" }),
    campanha(3, "C 2022", "2022", [30], { evento: "evB" }),
  );
  const membros = membrosDoEvento(lista, lista.find((c) => c.id === 2));
  assert.deepEqual(membros.map((c) => c.id).sort(), [2, 3], "B e C vêm juntos, para os dois serem carimbados");
});

test("candidatas não oferecem quem já está no evento", () => {
  const lista = monta(
    campanha(1, "X", "2026", [10], { evento: "e1" }),
    campanha(2, "X renomeada", "2024", [20], { evento: "e1" }),
    campanha(3, "Outra", "2022", [30]),
  );
  assert.deepEqual(candidatasAVincular(lista, lista.find((c) => c.id === 1)).map((c) => c.id), [3]);
});

test("o cartão compara com a edição anterior DELE, sem abrir a campanha", () => {
  const lista = monta(
    campanha(1, "Política - Deputados", "2026", [268638.85], { evento: "pol" }),
    campanha(2, "Política - Deputados", "2022", [180000], { evento: "pol" }),
    campanha(3, "Festa", "2026", [5000]),
  );
  const m = comparativoDeEdicoes(lista);
  assert.equal(m.get(1).anoAnterior, "2022");
  assert.equal(m.get(1).diferenca, 88638.85);
  assert.equal(Math.round(m.get(1).variacao * 1000) / 1000, 0.492);   // 88.638,85 / 180.000
  assert.equal(m.get(2), null, "a mais antiga não tem contra o que comparar");
  assert.equal(m.get(3), null, "campanha de evento único também não");
});

test("cadastro duplicado no mesmo ano não faz o cartão comparar com a gêmea", () => {
  const lista = monta(
    campanha(1, "Ev", "2026", [100], { evento: "e" }),
    campanha(2, "Ev", "2026", [40], { evento: "e" }),
    campanha(3, "Ev", "2022", [50], { evento: "e" }),
  );
  const m = comparativoDeEdicoes(lista);
  assert.equal(m.get(1).anoAnterior, "2022", "pula a gêmea de 2026");
  assert.equal(m.get(2).anoAnterior, "2022");
});

test("valor que não virou produto nenhum é DITO, não escondido num balde 'Outros'", () => {
  /* O caso real: 146 O.S. da base têm a soma dos itens MENOR que o cabeçalho --
     é a "união" do Mubisys sem sub-item nomeado, que o normalizador descarta.
     Numa O.S. específica isso já chega a 61% dela. Inventar um produto "Outros"
     para o resto foi exatamente o que escondeu esse defeito por meses. */
  const o = { id: 1, numero: "21442", cliente: "A", data: "2026-01-20",
              bruto: 15572.47, valor: 15572.47,
              itens: [item("Placa PVC", 2, 6021.20)] };
  const c = { os: { 1: fichaDaOS(o) } };
  const p = produtosDaCampanha(c, [o]);
  assert.equal(p.total, 6021.2, "o ranking mostra só o que tem dono");
  assert.equal(p.brutoDasLidas, 15572.47);
  assert.equal(p.naoAtribuido, 9551.27, "e o resto aparece como resto");
  assert.equal(p.fecha, false);
  assert.equal(p.completo, false, "não pode se apresentar como o quadro inteiro");
  assert.equal(p.itens.length, 1, "nenhum produto inventado");
});

test("quando fecha, fecha -- e um centavo de rateio não vira alarme", () => {
  const o = { id: 1, numero: "1", cliente: "A", data: "2026-01-20", bruto: 1000,
              itens: [item("X", 1, 666.67), item("Y", 1, 333.33)] };
  const c = { os: { 1: fichaDaOS(o) } };
  const p = produtosDaCampanha(c, [o]);
  assert.equal(p.naoAtribuido, 0);
  assert.equal(p.fecha, true);
  assert.equal(p.completo, true);
});

test("O.S. sem item não entra na conta do que fecha -- ela já é contada em semItens", () => {
  /* Somar o bruto dela no denominador faria a O.S. inteira virar "não
     atribuído", misturando duas coisas diferentes: "não tem item" e "tem item
     mas falta valor". */
  const comIt = { id: 1, numero: "1", cliente: "A", data: "2026-01-01", bruto: 100,
                  itens: [item("X", 1, 100)] };
  const semIt = { id: 2, numero: "2", cliente: "B", data: "2026-01-02", bruto: 500, itens: [] };
  const c = { os: { 1: fichaDaOS(comIt), 2: fichaDaOS(semIt) } };
  const p = produtosDaCampanha(c, [comIt, semIt]);
  assert.equal(p.brutoDasLidas, 100, "só as lidas");
  assert.equal(p.naoAtribuido, 0);
  assert.equal(p.cobertura.semItens, 1, "a outra aparece aqui, que é o lugar dela");
});

/* ------------------------------- o que foi comprado de verdade (produto+modelo) */

const itemM = (produto, modelo, quantidade, valorTotal, categoria = "") =>
  ({ produto, modelo, categoria, quantidade, valorUnit: valorTotal / quantidade, valorTotal });

test("o ranking separa pelo MODELO -- é ele que diz o que foi comprado", () => {
  /* No ERP o produto é a linha do catálogo ("Material Político 2026") e o que
     foi vendido está no modelo. Agrupando só pelo produto, a campanha inteira
     virava UMA linha de R$ 227 mil que não diz o que estocar. */
  const o = { id: 1, numero: "1", cliente: "A", data: "2026-03-01", bruto: 100000, itens: [
    itemM("Material Político 2026", "Adesivo Perfurado 60x33", 6300, 56633),
    itemM("Material Político 2026", "Adesivo Parachoque 30x10", 65250, 33367),
    itemM("Material Político 2026", "Bandeira 140X90", 1010, 10000),
  ] };
  const p = produtosDaCampanha({ os: { 1: fichaDaOS(o) } }, [o]);
  assert.deepEqual(p.itens.map((x) => [x.rotulo, x.quantidade, x.valor]), [
    ["Adesivo Perfurado 60x33", 6300, 56633],
    ["Adesivo Parachoque 30x10", 65250, 33367],
    ["Bandeira 140X90", 1010, 10000],
  ]);
  assert.equal(p.itens[0].produto, "Material Político 2026", "a linha do catálogo continua ali");
});

test("sem modelo, o produto continua sendo o rótulo", () => {
  const o = { id: 1, numero: "1", cliente: "A", data: "2026-03-01", bruto: 500, itens: [
    itemM("Totem", "", 1, 500),
  ] };
  const p = produtosDaCampanha({ os: { 1: fichaDaOS(o) } }, [o]);
  assert.equal(p.itens[0].rotulo, "Totem");
  assert.equal(p.itens[0].modelo, "");
});

test("modelo igual em produtos diferentes NÃO se junta", () => {
  /* "Placa / Lona 440g" e "Banner / Lona 440g" são coisas diferentes. */
  const o = { id: 1, numero: "1", cliente: "A", data: "2026-03-01", bruto: 300, itens: [
    itemM("Placa", "Lona 440g", 1, 100),
    itemM("Banner", "Lona 440g", 1, 200),
  ] };
  const p = produtosDaCampanha({ os: { 1: fichaDaOS(o) } }, [o]);
  assert.equal(p.itens.length, 2);
  assert.deepEqual(p.itens.map((x) => x.produto).sort(), ["Banner", "Placa"]);
});

test("o mesmo modelo em O.S. diferentes soma, e conta as O.S.", () => {
  const a = { id: 1, numero: "1", cliente: "A", data: "2026-03-01", bruto: 100,
              itens: [itemM("Mat", "Bandeira 140X90", 10, 100)] };
  const b = { id: 2, numero: "2", cliente: "B", data: "2026-04-01", bruto: 250,
              itens: [itemM("Mat", "Bandeira 140X90", 25, 250)] };
  const p = produtosDaCampanha({ os: { 1: fichaDaOS(a), 2: fichaDaOS(b) } }, [a, b]);
  assert.deepEqual(p.itens.map((x) => [x.rotulo, x.quantidade, x.valor, x.os]),
    [["Bandeira 140X90", 35, 350, 2]]);
});

test("o rollup por produto NÃO soma quantidade -- adesivo com bandeira não tem unidade comum", () => {
  /* Era o "192.778 un." que aparecia na tela: 6.300 adesivos somados com 1.010
     bandeiras. Número que não significa nada. */
  const o = { id: 1, numero: "1", cliente: "A", data: "2026-03-01", bruto: 66633, itens: [
    itemM("Material Político 2026", "Adesivo Perfurado 60x33", 6300, 56633),
    itemM("Material Político 2026", "Bandeira 140X90", 1010, 10000),
    itemM("PDV", "Painel Backlight", 4, 5000),
  ] };
  const p = produtosDaCampanha({ os: { 1: fichaDaOS(o) } }, [o]);
  const rollup = porProduto(p);
  assert.deepEqual(rollup.map((x) => [x.rotulo, x.itens, x.valor]),
    [["Material Político 2026", 2, 66633], ["PDV", 1, 5000]]);
  assert.equal(rollup[0].quantidade, undefined, "não existe quantidade somada aqui");
});

test("a categoria também conta produtos, não unidades", () => {
  const o = { id: 1, numero: "1", cliente: "A", data: "2026-03-01", bruto: 300, itens: [
    itemM("Placa", "PVC 3mm", 2, 200, "Placas"),
    itemM("Placa", "PVC 5mm", 1, 100, "Placas"),
  ] };
  const cats = categoriasDosProdutos(produtosDaCampanha({ os: { 1: fichaDaOS(o) } }, [o]));
  assert.deepEqual(cats.map((x) => [x.categoria, x.produtos, x.valor]), [["Placas", 2, 300]]);
  assert.equal(cats[0].quantidade, undefined);
});

test("O.S. de comprador DESLIGADO diz o motivo certo, não 'cancelada ou fora do período'", () => {
  /* Caso real da campanha "Política 2026 - Deputados": 4 O.S. de um deputado
     não apareciam no ranking. A tela mandava conferir o período — e todas as 19
     estavam dentro dele. O comprador é que tinha saído da lista: a busca de
     O.S. é por cliente, então elas ficaram inalcançáveis. Motivo errado manda
     procurar no lugar errado. */
  const dentro = { id: 1, numero: "1", cliente: "CANDIDATO A", data: "2026-03-01", bruto: 100,
                   itens: [itemM("Mat", "Bandeira", 1, 100)] };
  const c = {
    clientes: [{ chave: "CANDIDATO A", nome: "CANDIDATO A", cnpjs: [] }],
    os: {
      1: fichaDaOS(dentro),
      2: { numero: "2", cliente: "CANDIDATO B", valor: 6500 },   // desligado
      3: { numero: "3", cliente: "CANDIDATO B", valor: 2700 },
      9: { numero: "9", cliente: "CANDIDATO A", valor: 400 },    // ligado, mas some da busca
    },
  };
  const p = produtosDaCampanha(c, [dentro]);
  assert.equal(p.cobertura.foraDaBusca, 3);
  assert.equal(p.cobertura.semComprador, 2, "duas são do comprador que saiu da lista");
  assert.deepEqual(p.cobertura.compradores, ["CANDIDATO B"], "e a tela pode dizer o nome");
});

test("comprador ligado que some da busca NÃO é contado como desligado", () => {
  /* Essa é cancelada no ERP ou fora do período de verdade -- confundir as duas
     causas foi o defeito. */
  const dentro = { id: 1, numero: "1", cliente: "A", data: "2026-03-01", bruto: 100,
                   itens: [itemM("Mat", "X", 1, 100)] };
  const c = {
    clientes: [{ chave: "A", nome: "A", cnpjs: [] }],
    os: { 1: fichaDaOS(dentro), 7: { numero: "7", cliente: "A", valor: 50 } },
  };
  const p = produtosDaCampanha(c, [dentro]);
  assert.equal(p.cobertura.foraDaBusca, 1);
  assert.equal(p.cobertura.semComprador, 0);
  assert.deepEqual(p.cobertura.compradores, []);
});

test("comprador RENOMEADO no ERP é pego -- a lista de ligados sozinha não pega", () => {
  /* Caso real da "Política 2026 - Deputados": a campanha foi montada quando o
     cadastro dizia "ELEICA 2026 GILBERTO..." (sem o O). Alguém corrigiu para
     "ELEICAO 2026 GILBERTO...", e o vínculo virou órfão em silêncio: ele
     CONTINUA na lista, com o nome velho, e não casa com nenhuma O.S.
     Comparar com a lista de ligados daria zero e mandaria procurar
     cancelamento e período, onde não havia nada. */
  const viva = { id: 1, numero: "1", cliente: "CANDIDATO A", data: "2026-03-01", bruto: 100,
                 itens: [itemM("Mat", "Bandeira", 1, 100)] };
  const c = {
    clientes: [
      { chave: "CANDIDATO A", nome: "CANDIDATO A", cnpjs: [] },
      { chave: "ELEICA 2026 GILBERTO", nome: "ELEICA 2026 GILBERTO", cnpjs: [] },  // nome velho
    ],
    os: {
      1: fichaDaOS(viva),
      2: { numero: "2", cliente: "ELEICA 2026 GILBERTO", valor: 6500 },
      3: { numero: "3", cliente: "ELEICA 2026 GILBERTO", valor: 2700 },
    },
  };
  // a busca por "ELEICA 2026 GILBERTO" nao traz nada: no ERP ele virou "ELEICAO"
  const p = produtosDaCampanha(c, [viva]);
  assert.equal(p.cobertura.foraDaBusca, 2);
  assert.equal(p.cobertura.semComprador, 2, "o vínculo dele está quebrado, mesmo estando na lista");
  assert.deepEqual(p.cobertura.compradores, ["ELEICA 2026 GILBERTO"]);
});
