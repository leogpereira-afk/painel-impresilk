/* Os casos ruins da conta da permuta, escritos ANTES de eu confiar na tela.
 *
 * Roda com o node do repo, sem framework:
 *   node --test src/lib/calc/permutas.test.mjs
 *
 * O que está aqui não é "o saldo soma": é cada jeito que o saldo tem de mentir
 * — lista vazia virando "tudo cancelado", a mesma O.S. abatendo dois créditos,
 * crédito digitado com vírgula, O.S. cancelada sumindo do saldo sozinha.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  valorDaOS,
  chaveCliente,
  clientesDasOrdens,
  fichaDaOS,
  linhasDaPermuta,
  resumoDaPermuta,
  resumoGeral,
  ordensDosClientes,
  donoPorOS,
  linhasDosLancamentos,
} from "./permutas.js";

const os = (id, cliente, valor, extra = {}) => ({
  id,
  numero: `2${id}`,
  cliente,
  data: "2026-03-10 09:00:00",
  cnpj: "",
  itens: [{ valorTotal: valor }],
  cancelada: false,
  ...extra,
});

// ------------------------------------------------------------------ o valor

test("o valor da O.S. é a soma dos itens, não um campo", () => {
  assert.equal(valorDaOS({ itens: [{ valorTotal: 200 }, { valorTotal: 50.5 }] }), 250.5);
  assert.equal(valorDaOS({ itens: [] }), 0);
  assert.equal(valorDaOS(null), 0);
});

test("item sem valor não vira NaN e não contamina o saldo", () => {
  assert.equal(valorDaOS({ itens: [{ valorTotal: 100 }, { valorTotal: undefined }] }), 100);
  assert.equal(valorDaOS({ itens: [{ valorTotal: "abc" }] }), 0);
});

// ----------------------------------------------------------- o mesmo cliente

test("acento e caixa não fazem dois clientes de um", () => {
  assert.equal(chaveCliente("Construções Alfa"), chaveCliente("CONSTRUCOES ALFA"));
  assert.equal(chaveCliente("  Alfa   Ltda "), "ALFA LTDA");
});

test("a lista de clientes soma a carteira e junta os CNPJs do mesmo nome", () => {
  const cs = clientesDasOrdens([
    os(1, "Alfa Ltda", 100, { cnpj: "11111111000199" }),
    os(2, "Alfa Ltda", 200, { cnpj: "11111111000199" }),
    os(3, "Beta SA", 50, { cnpj: "" }),
  ]);
  const alfa = cs.find((c) => c.nome === "Alfa Ltda");
  assert.equal(alfa.qtd, 2);
  assert.equal(alfa.total, 300);
  assert.deepEqual(alfa.cnpjs, ["11111111000199"]);
  assert.deepEqual(cs.find((c) => c.nome === "Beta SA").cnpjs, []);
});

test("dois CNPJs no mesmo nome aparecem os dois (é sinal de cadastro repetido)", () => {
  const [c] = clientesDasOrdens([
    os(1, "Alfa", 100, { cnpj: "11111111000199" }),
    os(2, "Alfa", 100, { cnpj: "22222222000188" }),
  ]);
  assert.equal(c.cnpjs.length, 2);
});

// ------------------------------------------------------------------- o saldo

test("saldo = crédito − aceitas, e sobra é positivo", () => {
  const ordens = [os(1, "Alfa", 300), os(2, "Alfa", 200)];
  const p = { credito: 1000, os: { 1: fichaDaOS(ordens[0]), 2: fichaDaOS(ordens[1]) } };
  const r = resumoDaPermuta(p, ordens);
  assert.equal(r.consumido, 500);
  assert.equal(r.saldo, 500);
  assert.equal(r.pct, 0.5);
});

test("consumir além do crédito dá saldo negativo, não zero", () => {
  const ordens = [os(1, "Alfa", 1500)];
  const r = resumoDaPermuta({ credito: 1000, os: { 1: fichaDaOS(ordens[0]) } }, ordens);
  assert.equal(r.saldo, -500);
  assert.equal(r.pct, 1, "a barra enche, mas não passa de 100%");
});

test("crédito digitado com vírgula é dinheiro, não zero", () => {
  const r = resumoDaPermuta({ credito: "1500,50", os: {} }, [os(1, "Alfa", 0)]);
  assert.equal(r.credito, 1500.5);
  assert.equal(r.saldo, 1500.5);
});

test("sem crédito lançado a barra não finge percentual", () => {
  const ordens = [os(1, "Alfa", 300)];
  const r = resumoDaPermuta({ credito: 0, os: { 1: fichaDaOS(ordens[0]) } }, ordens);
  assert.equal(r.pct, null);
  assert.equal(r.saldo, -300);
});

// ------------------------------------------------- o congelado × o cache vivo

test("valor corrigido no ERP vale, e a tela fica sabendo", () => {
  const antes = os(1, "Alfa", 300);
  const p = { credito: 1000, os: { 1: fichaDaOS(antes) } };
  const depois = [os(1, "Alfa", 450)]; // o ERP corrigiu para 450
  const r = resumoDaPermuta(p, depois);
  assert.equal(r.consumido, 450, "o saldo usa o valor do ERP");
  assert.equal(r.mudaram, 1, "e avisa que mudou");
  assert.equal(r.linhas[0].congelado, 300);
});

test("diferença de centavo não é 'mudou'", () => {
  const p = { credito: 1000, os: { 1: { numero: "21", valor: 300.004 } } };
  assert.equal(resumoDaPermuta(p, [os(1, "Alfa", 300)]).mudaram, 0);
});

test("a cauda binária do rateio não vira 'mudou no ERP'", () => {
  // O cache guarda exatamente isto quando a O.S. tem união de itens rateada.
  const comCauda = { id: 1, numero: "21", cliente: "Alfa", data: "2026-07-06",
                     itens: [{ valorTotal: 7340.4400000000005 }] };
  assert.equal(valorDaOS(comCauda), 7340.44);
  const p = { credito: 10000, os: { 1: fichaDaOS(comCauda) } };
  const r = resumoDaPermuta(p, [comCauda]);
  assert.equal(r.mudaram, 0, "a mesma O.S. intocada não pode aparecer como alterada");
  assert.equal(r.consumido, 7340.44);
});

test("somar muitas O.S. não acumula centavo fantasma", () => {
  const ordens = Array.from({ length: 30 }, (_, i) => os(i + 1, "Alfa", 10.1));
  const p = { credito: 1000, os: Object.fromEntries(ordens.map((o) => [o.id, fichaDaOS(o)])) };
  assert.equal(resumoDaPermuta(p, ordens).consumido, 303);
});

test("O.S. cancelada no ERP some do cache e a permuta DENUNCIA", () => {
  const p = { credito: 1000, os: { 1: { numero: "21", cliente: "Alfa", valor: 300 } } };
  const r = resumoDaPermuta(p, [os(2, "Alfa", 100)]); // a 1 não está mais lá
  assert.equal(r.sumiram, 1);
  assert.equal(r.consumido, 300, "continua abatendo até a direção decidir tirar");
  assert.equal(r.linhas[0].sumiu, true);
});

test("LISTA VAZIA NÃO É 'TUDO CANCELADO'", () => {
  const p = { credito: 1000, os: { 1: { numero: "21", valor: 300 }, 2: { numero: "22", valor: 200 } } };
  for (const nada of [[], null, undefined]) {
    const r = resumoDaPermuta(p, nada);
    assert.equal(r.sumiram, 0, `${JSON.stringify(nada)}: não pode acusar cancelamento`);
    assert.equal(r.semConferir, true, `${JSON.stringify(nada)}: tem que assumir que não conferiu`);
    assert.equal(r.consumido, 500, "e o saldo se sustenta no congelado");
  }
});

// ------------------------------------------------ os lançamentos manuais

test("o crédito é a SOMA das entradas, e o consumo abate", () => {
  const ordens = [os(1, "Alfa", 300)];
  const p = {
    os: { 1: fichaDaOS(ordens[0]) },
    lancamentos: {
      a: { data: "2026-08-01", descricao: "brinde sem O.S.", valor: 150, tipo: "consumo" },
      b: { data: "2026-08-02", descricao: "projeto arquitetônico", valor: 7000, tipo: "credito" },
      c: { data: "2026-08-03", descricao: "6 meses de veiculação", valor: 3000, tipo: "credito" },
    },
  };
  const r = resumoDaPermuta(p, ordens);
  assert.equal(r.credito, 10000, "duas entradas de crédito somam");
  assert.equal(r.creditos.length, 2);
  assert.equal(r.emOS, 300);
  assert.equal(r.lancado, 150, "só o consumo manual");
  assert.equal(r.consumido, 450);
  assert.equal(r.saldo, 9550);
});

test("o crédito lançado ANTES desta tela não some do saldo", () => {
  // Registro da versão em que o crédito era um campo solto. Ignorá-lo faria
  // dinheiro real desaparecer em silêncio.
  const p = { credito: 5000, lancamentos: { a: { valor: 1000, tipo: "credito" } } };
  const r = resumoDaPermuta(p, [os(1, "Alfa", 1)]);
  assert.equal(r.credito, 6000);
  assert.equal(r.creditoAntigo, 5000, "e fica separado, para não virar valor sem origem");
});

test("tipo desconhecido cai em consumo, não some da conta", () => {
  // Registro velho ou corrompido não pode virar dinheiro invisível: um valor
  // que não abate nem credita seria um saldo alto sem explicação na tela.
  const p = { credito: 1000, os: {}, lancamentos: { a: { valor: 200, tipo: "sei-la" } } };
  assert.equal(resumoDaPermuta(p, [os(1, "Alfa", 1)]).saldo, 800);
});

test("editar o texto de um lançamento não perde a nota anexada", () => {
  const p = { lancamentos: { a: { valor: 100, tipo: "credito", anexo: { chave: "k", nome: "nf.pdf" } } } };
  assert.equal(resumoDaPermuta(p, [os(1, "Alfa", 1)]).creditos[0].anexo.nome, "nf.pdf");
});

test("lançamento com vírgula e sem valor não quebram a conta", () => {
  const p = { credito: 1000, os: {}, lancamentos: {
    a: { valor: "150,50", tipo: "consumo" },
    b: { valor: "", tipo: "consumo" },
    c: { tipo: "credito" },
  } };
  assert.equal(resumoDaPermuta(p, [os(1, "Alfa", 1)]).saldo, 849.5);
});

test("permuta sem nenhum crédito lançado dá saldo negativo do que gastou", () => {
  // Foi o estado real da Maple Bear: R$ 7.000 de projeto consumido, crédito
  // ainda por lançar. Tem que aparecer no vermelho, não como zero.
  const p = { lancamentos: { a: { valor: 7000, tipo: "consumo", descricao: "Projeto arquitetônico" } } };
  const r = resumoDaPermuta(p, [os(1, "Alfa", 1)]);
  assert.equal(r.credito, 0);
  assert.equal(r.saldo, -7000);
  assert.equal(r.pct, null, "sem crédito não há denominador para a barra");
});

test("só lançamentos, sem O.S. nenhuma, já dá saldo", () => {
  const p = { credito: 500, lancamentos: { a: { valor: 120, tipo: "consumo" } } };
  const r = resumoDaPermuta(p, [os(1, "Alfa", 1)]);
  assert.equal(r.linhas.length, 0);
  assert.equal(r.saldo, 380);
});

test("os lançamentos vêm do mais novo para o mais velho", () => {
  const p = { lancamentos: {
    a: { data: "2026-01-05", descricao: "velho", valor: 1, tipo: "consumo" },
    b: { data: "2026-08-05", descricao: "novo", valor: 1, tipo: "consumo" },
  } };
  assert.deepEqual(linhasDosLancamentos(p).map((l) => l.descricao), ["novo", "velho"]);
});

// -------------------------------------------------- a O.S. só abate uma vez

test("a mesma O.S. em duas permutas: a segunda vê que está presa", () => {
  const permutas = {
    a: { nome: "Rádio", os: { 1: { numero: "21", valor: 300 } } },
    b: { nome: "Gráfica", os: {} },
  };
  const dono = donoPorOS(permutas);
  const ordens = [os(1, "Alfa", 300), os(2, "Alfa", 100)];
  const lista = ordensDosClientes(ordens, [chaveCliente("Alfa")], dono, "b");
  const presa = lista.find((l) => l.id === "1");
  assert.equal(presa.presaEm, "Rádio");
  assert.equal(presa.nesta, false);
  assert.equal(lista.find((l) => l.id === "2").presaEm, null);
});

test("na própria permuta a O.S. aparece marcada, não bloqueada", () => {
  const permutas = { a: { nome: "Rádio", os: { 1: { numero: "21", valor: 300 } } } };
  const lista = ordensDosClientes([os(1, "Alfa", 300)], [chaveCliente("Alfa")], donoPorOS(permutas), "a");
  assert.equal(lista[0].nesta, true);
  assert.equal(lista[0].presaEm, null);
});

// ------------------------------------------------------- vários CNPJs, um dono

test("uma permuta abrange mais de um cliente e soma os dois", () => {
  const ordens = [os(1, "Alfa Ltda", 300), os(2, "Alfa Participações", 200), os(3, "Outro", 999)];
  const chaves = [chaveCliente("Alfa Ltda"), chaveCliente("Alfa Participações")];
  const lista = ordensDosClientes(ordens, chaves, new Map(), "p1");
  assert.equal(lista.length, 2, "só os clientes da permuta, o Outro fica fora");
  const p = { credito: 1000, os: Object.fromEntries(lista.map((l) => [l.id, l])) };
  assert.equal(resumoDaPermuta(p, ordens).consumido, 500);
});

test("sem cliente escolhido a lista de O.S. vem vazia, não vem tudo", () => {
  assert.deepEqual(ordensDosClientes([os(1, "Alfa", 300)], [], new Map(), "p1"), []);
});

test("O.S. cancelada não entra na lista de escolher", () => {
  const lista = ordensDosClientes(
    [os(1, "Alfa", 300, { cancelada: true }), os(2, "Alfa", 100)],
    [chaveCliente("Alfa")], new Map(), "p1",
  );
  assert.deepEqual(lista.map((l) => l.id), ["2"]);
});

// ------------------------------------------------------------------- a lista

test("a lista abre pelas que ainda têm saldo e joga a encerrada para o fim", () => {
  const ordens = [os(1, "Alfa", 100)];
  const g = resumoGeral(
    {
      gasta: { nome: "Gasta", credito: 100, os: { 1: fichaDaOS(ordens[0]) } },
      cheia: { nome: "Cheia", credito: 5000, os: {} },
      velha: { nome: "Velha", credito: 9999, os: {}, encerrada: true },
    },
    ordens,
  );
  assert.deepEqual(g.map((p) => p.nome), ["Cheia", "Gasta", "Velha"]);
});
