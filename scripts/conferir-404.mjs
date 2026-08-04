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

const { mubiGet, mubiGetTudo } = await import("../netlify/functions/lib/mubi.js");

const CASOS = [
  {
    nome: "404 que PISCA (404 e depois 201) devolve os itens, nao vazio",
    roteiro: [404, 201],
    itens: 2,
    chamadas: 2,
  },
  {
    nome: "dois 404 concordando: aí sim e vazio de verdade",
    roteiro: [404, 404],
    itens: 0,
    chamadas: 2,
  },
  {
    // UM 404 sozinho nao confirma nada. Se a rede cai antes de o servidor
    // repetir o "nao encontrado", a resposta honesta e falhar -- falhando, o
    // cache anterior e preservado; devolvendo vazio, ele e apagado. Entre errar
    // para o lado de nao atualizar e errar para o lado de zerar, o primeiro.
    nome: "UM 404 e depois a rede cai: explode (nao houve confirmacao)",
    roteiro: [404, "erro-de-rede", "erro-de-rede", "erro-de-rede"],
    excecao: true,
    chamadas: 4,
  },
  {
    nome: "dois 404 e depois a rede cai: vazio (a confirmacao veio antes)",
    roteiro: [404, 404],
    itens: 0,
    chamadas: 2,
  },
  {
    // O caso que passou batido na primeira versao: o 404 intermitente acontece
    // quando o ERP esta degradado, que e quando tambem chovem 5xx. Aceitar
    // vazio nessa mistura desligava a protecao justamente na hora que ela serve.
    nome: "404 seguido de 5xx NAO vira vazio -- 5xx e o servidor dizendo que deu errado",
    roteiro: [404, 500, 500, 500],
    excecao: true,
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
  {
    nome: "5xx sem nenhum 404 continua explodindo",
    roteiro: [503],
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

/* PAGINACAO — o buraco irmao. mubiGet devolver vazio para uma pagina do MEIO
   fazia a pagina sumir dentro do Promise.all: a lista final vinha cheia, so que
   menor, e nenhuma protecao pegava (a trava de lista vazia do servidor nao
   dispara com lista cheia, e o status sai ok:true). Em producao seriam ~500
   O.S. a menos, com "vendedor nao localizado" na tela e carimbo verde. */
const paginado = (n, ultima) => ({
  status: 201,
  ok: true,
  json: async () => ({
    data: Array.from({ length: n }, (_, i) => ({ id: i })),
    current_page: 1,
    last_page: ultima,
    per_page: 500,
  }),
});

async function conferirPaginacao() {
  // Pagina 1 cheia dizendo que ha 3 paginas; a pagina 3 responde 404 sempre.
  let n = 0;
  globalThis.fetch = async (url) => {
    n++;
    const page = Number(new URL(url).searchParams.get("page") || 1);
    if (page === 3) return { status: 404, ok: false, json: async () => ({}) };
    return paginado(500, 3);
  };
  try {
    const r = await mubiGetTudo("ordem-servico", {}, 500);
    console.error(`  FALHOU  pagina vazia no meio da paginacao trunca em silencio`);
    console.error(`          devolveu ${r.length} itens sem excecao (esperado: excecao)`);
    return 1;
  } catch (e) {
    const ok = e.truncou === true;
    console.log(`${ok ? "  ok    " : "  FALHOU"}  pagina vazia no meio da paginacao EXPLODE em vez de truncar`);
    if (!ok) console.error(`          erro sem marca truncou: ${e.message}`);
    return ok ? 0 : 1;
  } finally {
    void n;
  }
}

falhas += await conferirPaginacao();

if (falhas) {
  console.error(`\n${falhas} caso(s) falharam: um 404 do ERP pode estar virando cache vazio.`);
  process.exit(1);
}
console.log(`\n${CASOS.length + 1} casos ok -- 404 intermitente nao vira cache vazio nem lista truncada.`);
