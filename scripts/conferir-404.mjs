// ============================================================================
// Trava de regressao: um 404 que PISCA nao pode virar "nao tem nada".
//
// POR QUE ISTO EXISTE: em 31/07/2026 o tratamento de 404 foi movido para dentro
// do laco de tentativas e passou a devolver `{ data: [] }` na PRIMEIRA resposta
// -- desligando, para o 404, justamente a protecao de 4 tentativas que existia
// para o 404 intermitente do Mubisys. Consequencia: uma piscada na primeira
// pagina da lista de O.S. do ano virava `ordens: []`, e esse vazio era gravado
// como SUCESSO (as travas de preservacao so olhavam `null`). O painel inteiro
// perdia o vinculo de vendedor e o status saia ok:true.
//
// Nao usa nenhum framework: troca o `fetch` global por um roteiro de respostas
// e confere quantas chamadas foram feitas e o que voltou.
//
//   node scripts/conferir-404.mjs
// ============================================================================
process.env.MUBI_BASE_URL ||= "https://exemplo.invalido/api";
process.env.MUBI_PUBLIC_KEY ||= "pk-de-teste";
process.env.MUBI_TOKEN ||= "tk-de-teste";
process.env.MUBI_ESPERA_MS ||= "10"; // sem isto o teste leva 33s

let chamadas = 0;
let roteiro = [];
globalThis.fetch = async () => {
  const passo = roteiro[Math.min(chamadas++, roteiro.length - 1)];
  if (passo === "erro-de-rede") throw new Error("fetch failed");
  return {
    status: passo,
    ok: passo === 201,
    json: async () => ({ data: [{ id: 1 }, { id: 2 }] }),
  };
};

const { mubiGet } = await import("../netlify/functions/lib/mubi.js");

const CASOS = [
  {
    nome: "404 que PISCA (404 e depois 201) devolve os itens, nao vazio",
    roteiro: [404, 201],
    itens: 2,
    chamadas: 2,
  },
  {
    nome: "404 nas quatro tentativas: aí sim e vazio de verdade",
    roteiro: [404, 404, 404, 404],
    itens: 0,
    chamadas: 4,
  },
  {
    nome: "404 e depois a rede cai: vazio, sem derrubar o bloco inteiro",
    roteiro: [404, "erro-de-rede", "erro-de-rede", "erro-de-rede"],
    itens: 0,
    chamadas: 4,
  },
  {
    nome: "resposta boa de primeira nao gasta tentativa a toa",
    roteiro: [201],
    itens: 2,
    chamadas: 1,
  },
  {
    nome: "erro de rede sem nenhum 404 continua explodindo (nao vira vazio)",
    roteiro: ["erro-de-rede"],
    excecao: true,
    chamadas: 4,
  },
];

let falhas = 0;
for (const caso of CASOS) {
  chamadas = 0;
  roteiro = caso.roteiro;
  let resultado = null;
  let excecao = null;
  try {
    resultado = await mubiGet("ordem-servico", {});
  } catch (e) {
    excecao = e;
  }
  const nItens = excecao ? null : (resultado.data ?? resultado).length;
  const ok = caso.excecao
    ? !!excecao && chamadas === caso.chamadas
    : !excecao && nItens === caso.itens && chamadas === caso.chamadas;
  if (!ok) {
    falhas++;
    console.error(`  FALHOU  ${caso.nome}`);
    console.error(
      `          itens=${excecao ? `excecao(${excecao.message})` : nItens} (esperado ${caso.excecao ? "excecao" : caso.itens})` +
      ` | chamadas=${chamadas} (esperado ${caso.chamadas})`,
    );
  } else {
    console.log(`  ok      ${caso.nome}`);
  }
}

if (falhas) {
  console.error(`\n${falhas} caso(s) falharam: um 404 do ERP pode estar virando cache vazio.`);
  process.exit(1);
}
console.log(`\n${CASOS.length} casos ok -- 404 intermitente nao vira cache vazio.`);
