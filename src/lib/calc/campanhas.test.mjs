/* Os casos que fazem a campanha mentir.
 *   node --test src/lib/calc/campanhas.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  resumoDaCampanha, resumoGeralCampanhas, totaisDasCampanhas, compradoresDaCampanha, fichaDaOS,
  extratoDaCampanha, anosDasCampanhas, totaisDoAno, comparativoPorAno, edicoesDoMesmoEvento,
  anosRepetidos, maiorComprador, comprasPorMes, produtosDaCampanha, categoriasDosProdutos,
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

test("os anos vêm do mais novo para o mais velho, sem inventar os vazios", () => {
  const lista = monta(campanha(1, "Eleições", "2026", [100]), campanha(2, "Eleições", "2022", [80]),
                      campanha(3, "Festa", "2026", [20]));
  assert.deepEqual(anosDasCampanhas(lista), [{ ano: "2026", quantas: 2 }, { ano: "2022", quantas: 1 }],
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
  const [novo, velho] = comparativoPorAno(lista);
  assert.equal(novo.ano, "2026");
  assert.equal(novo.anoAnterior, "2022", "pula 2025, 2024 e 2023: não houve campanha");
  assert.equal(novo.diferenca, 50);
  assert.equal(novo.variacao, 0.5);
  assert.equal(velho.variacao, null, "a linha mais antiga não tem contra o que comparar");
  assert.equal(velho.anoAnterior, null);
});

test("edição anterior que vendeu zero não vira percentual infinito", () => {
  const lista = monta(campanha(1, "Eleições", "2026", [150]), campanha(2, "Eleições", "2022", []));
  const [novo] = comparativoPorAno(lista);
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
  const [a26, a25] = comparativoPorAno(lista);
  assert.equal(a26.anoAnterior, "2025", "2025 teve campanha, então NÃO é pulado");
  assert.equal(Math.round(a26.variacao * 100), 2150, "é comparação de total de ano, e a tela diz isso");
  assert.equal(a25.anoAnterior, "2024");
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
