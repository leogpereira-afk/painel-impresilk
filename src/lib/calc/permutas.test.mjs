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
  unirOrdens,
  resumoDaPermuta,
  resumoGeral,
  ordensDosClientes,
  donoPorOS,
  linhasDosLancamentos,
  extratoDaPermuta,
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

/* A REGRA DO DESCONTO, com os numeros reais da O.S. 19386 (Empominas).
   Ela existe porque o painel guardou 2.138,64 numa O.S. de 2.000,00 e isso
   consumiu R$ 138,64 a mais do credito do parceiro. Se alguem um dia voltar a
   usar o bruto, este teste reprova antes de chegar na tela. */
test("O.S. com desconto vale o VALOR FINAL, nunca o bruto", () => {
  const os19386 = { id: "1", numero: "19386", cliente: "EMPOMINAS",
                    data: "2025-06-03", bruto: 2138.64, desconto: 138.64, valor: 2000 };
  assert.equal(valorDaOS(os19386), 2000, "2.138,64 - 138,64");
  const f = fichaDaOS(os19386);
  assert.equal(f.valor, 2000);
  assert.equal(f.bruto, 2138.64, "o bruto fica guardado para a conta ser conferivel");
  assert.equal(f.desconto, 138.64);
});

test("sem desconto a ficha nao carrega campo vazio", () => {
  const f = fichaDaOS({ id: "2", numero: "1", valor: 500, bruto: 500, desconto: 0 });
  assert.equal(f.valor, 500);
  assert.equal("desconto" in f, false, "registro so guarda o que tem o que dizer");
});

test("o desconto chega na linha da tela, viva ou congelada", () => {
  const p = { lancamentos: {}, os: { "1": { numero: "19386", valor: 2000, bruto: 2138.64, desconto: 138.64 } } };
  // Sem o ERP na mao, a linha ainda sabe explicar o numero.
  const soCongelado = resumoDaPermuta(p, [os(9, "Outro", 1)]).linhas[0];
  assert.equal(soCongelado.desconto, 138.64);
  assert.equal(soCongelado.bruto, 2138.64);
});

test("o valor de VENDA do ERP manda sobre a soma dos itens", () => {
  // A 21076 real: o ERP diz 2.767,83 e os itens somam 2.651,73.
  const osReal = { id: 1, numero: "21076", cliente: "H2", data: "2025-11-25",
                   valor: 2767.83, itens: [{ valorTotal: 2651.73 }] };
  assert.equal(valorDaOS(osReal), 2767.83);
});

test("O.S. antiga, gravada antes do campo existir, ainda vale os itens", () => {
  // Sem o caminho de volta ela passaria a valer zero e o saldo subiria sozinho.
  assert.equal(valorDaOS({ itens: [{ valorTotal: 300 }] }), 300);
  assert.equal(valorDaOS({ valor: "", itens: [{ valorTotal: 300 }] }), 300);
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

// ------------------------------------------------- o extrato, que vai ao papel

test("o extrato junta O.S. e lançamento manual numa lista só, por data", () => {
  const ordens = [os(1, "Alfa Ltda", 300, { data: "2026-03-10" }),
                  os(2, "Alfa Filial", 500, { data: "2026-01-05" })];
  const p = {
    os: { 1: fichaDaOS(ordens[0]), 2: fichaDaOS(ordens[1]) },
    lancamentos: {
      c1: { data: "2025-12-01", descricao: "espaço em rádio", valor: 4000, tipo: "credito" },
      x1: { data: "2026-02-01", descricao: "brindes", valor: 150, tipo: "consumo" },
    },
  };
  const e = extratoDaPermuta(p, ordens);
  // A lista de consumo tem as duas O.S. E o manual, do mais antigo ao mais novo.
  assert.deepEqual(e.consumo.map((c) => c.documento),
    ["O.S. 22", "Lançamento manual", "O.S. 21"]);
  assert.deepEqual(e.consumo.map((c) => c.data),
    ["2026-01-05", "2026-02-01", "2026-03-10"]);
  assert.equal(e.creditos.length, 1);
});

test("a balança comercial diz de que lado está a diferença", () => {
  const sobra = extratoDaPermuta(
    { lancamentos: { c: { valor: 5000, tipo: "credito" }, x: { valor: 1000, tipo: "consumo" } } },
    [os(9, "Z", 1)],
  );
  assert.equal(sobra.balanca.recebemos, 5000);
  assert.equal(sobra.balanca.entregamos, 1000);
  assert.equal(sobra.balanca.diferenca, 4000);
  assert.equal(sobra.balanca.lado, "credito-do-parceiro");

  const estourou = extratoDaPermuta(
    { lancamentos: { c: { valor: 1000, tipo: "credito" }, x: { valor: 1500, tipo: "consumo" } } },
    [os(9, "Z", 1)],
  );
  assert.equal(estourou.balanca.lado, "a-receber");
  assert.equal(estourou.balanca.diferenca, -500);

  const zerada = extratoDaPermuta(
    { lancamentos: { c: { valor: 800, tipo: "credito" }, x: { valor: 800, tipo: "consumo" } } },
    [os(9, "Z", 1)],
  );
  assert.equal(zerada.balanca.lado, "zerada");
});

test("o extrato separa o consumo por cliente, para permuta de vários CNPJs", () => {
  const ordens = [os(1, "Alfa Ltda", 300), os(2, "Alfa Participações", 700)];
  const p = { os: { 1: fichaDaOS(ordens[0]), 2: fichaDaOS(ordens[1]) },
              lancamentos: { x: { valor: 50, tipo: "consumo", descricao: "brinde" } } };
  const e = extratoDaPermuta(p, ordens);
  assert.deepEqual(e.porCliente,
    [{ nome: "Alfa Participações", valor: 700 },
     { nome: "Alfa Ltda", valor: 300 },
     { nome: "Lançamentos manuais", valor: 50 }]);
});

test("O.S. com desconto leva bruto e desconto para o papel", () => {
  const comDesc = { id: "1", numero: "19386", cliente: "EMPOMINAS", data: "2025-06-03",
                    bruto: 2138.64, desconto: 138.64, valor: 2000 };
  const e = extratoDaPermuta({ os: { 1: fichaDaOS(comDesc) } }, [comDesc]);
  assert.equal(e.consumo[0].bruto, 2138.64);
  assert.equal(e.consumo[0].desconto, 138.64);
  assert.equal(e.consumo[0].valor, 2000);
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

// ------------------------------------ as O.S. agrupadas por cliente (CNPJ)

import { linhasPorCliente } from "./permutas.js";

test("agrupa as O.S. aceitas por cliente, do maior valor para o menor", () => {
  const linhas = [
    { id: "1", numero: "23051", cliente: "ELEICAO PEDRO", valor: 300, cnpj: "68237251000128" },
    { id: "2", numero: "23026", cliente: "ELEICAO RUY", valor: 49495, cnpj: "68345471000175" },
    { id: "3", numero: "23053", cliente: "ELEICAO GILBERTO", valor: 8500, cnpj: "" },
    { id: "4", numero: "23027", cliente: "ELEICAO GILBERTO", valor: 2700, cnpj: "" },
  ];
  const g = linhasPorCliente(linhas, []);
  assert.deepEqual(g.map((x) => x.cliente), ["ELEICAO RUY", "ELEICAO GILBERTO", "ELEICAO PEDRO"]);
  assert.equal(g[1].qtd, 2);
  assert.equal(g[1].valor, 11200, "as duas do Gilberto somam no grupo dele");
});

test("o CNPJ vem da O.S.; sem ele, do cliente ligado à permuta", () => {
  const linhas = [
    { id: "1", cliente: "ALFA", valor: 100, cnpj: "11111111000199" },
    { id: "2", cliente: "BETA", valor: 90, cnpj: "" },
  ];
  const g = linhasPorCliente(linhas, [{ chave: "BETA", nome: "Beta", cnpjs: ["22222222000188"] }]);
  assert.equal(g.find((x) => x.cliente === "ALFA").cnpj, "11111111000199");
  assert.equal(g.find((x) => x.cliente === "BETA").cnpj, "22222222000188", "caiu para o do cliente");
});

test("cliente com DOIS CNPJs não recebe chute nenhum", () => {
  // Dois documentos na mesma razão social é cadastro repetido: escolher um
  // seria afirmar o que não se sabe.
  const g = linhasPorCliente(
    [{ id: "1", cliente: "ALFA", valor: 100, cnpj: "" }],
    [{ chave: "ALFA", nome: "Alfa", cnpjs: ["11111111000199", "22222222000188"] }],
  );
  assert.equal(g[0].cnpj, "");
});

test("acento e caixa não partem um cliente em dois grupos", () => {
  const g = linhasPorCliente([
    { id: "1", cliente: "Construções Alfa", valor: 100 },
    { id: "2", cliente: "CONSTRUCOES ALFA", valor: 50 },
  ], []);
  assert.equal(g.length, 1);
  assert.equal(g[0].valor, 150);
});

test("lista vazia dá nenhum grupo, não um grupo vazio", () => {
  assert.deepEqual(linhasPorCliente([], []), []);
  assert.deepEqual(linhasPorCliente(null, null), []);
});

test("estreitar o período NÃO transforma O.S. aceita em 'cancelada no ERP'", () => {
  // A busca da tela traz só o período/clientes atuais; a conferência das
  // aceitas vem por id. Unidas, a O.S. viva de fora do período não some.
  const aceita = { id: 7, numero: "207", cliente: "Parceiro X", data: "2024-03-02", valor: 900 };
  const permuta = { nome: "P", os: { 7: fichaDaOS(aceita) }, lancamentos: {} };
  const doPeriodo = []; // o período foi estreitado para 2026: nada casa
  const semUniao = linhasDaPermuta(permuta, doPeriodo);
  assert.equal(semUniao[0].sumiu, false, "lista vazia já era tratada como 'não deu para conferir'");

  const outra = { id: 9, numero: "209", cliente: "Parceiro X", data: "2026-01-05", valor: 100 };
  const comUniao = linhasDaPermuta(permuta, unirOrdens([outra], [aceita]));
  assert.equal(comUniao.find((l) => l.numero === "207").sumiu, false,
    "com a união, a aceita de 2024 continua viva mesmo com o período em 2026");

  const semAceita = linhasDaPermuta(permuta, [outra]);
  assert.equal(semAceita.find((l) => l.numero === "207").sumiu, true,
    "controle: sem a união, a mesma O.S. era dada como cancelada");
});

test("unirOrdens não duplica e preserva as marcas de corte", () => {
  const a = Object.assign([{ id: 1 }, { id: 2 }], { clientesCortados: 3, linhasNoTeto: true });
  const juntas = unirOrdens(a, [{ id: 2 }, { id: 5 }]);
  assert.deepEqual(juntas.map((o) => o.id), [1, 2, 5]);
  assert.equal(juntas.clientesCortados, 3);
  assert.equal(juntas.linhasNoTeto, true);
  assert.equal(unirOrdens(a, []), a, "sem nada novo, devolve o mesmo array (marcas intactas)");
});
