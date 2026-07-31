// ============================================================================
// Carga do cache do Mubisys — roda no GitHub Actions.
//
// POR QUE AQUI E NAO NUMA EDGE FUNCTION: o Mubisys responde em 25-40s por
// pagina e sao muitas paginas; a carga completa leva MINUTOS. Edge Function
// morre em 150s. O GitHub Actions nao tem esse limite (6h), entao a parte lenta
// mora aqui e o resultado PRONTO e enviado para a function painel-cache, que so
// grava -- isso e instantaneo.
//
// A CHAVE-MESTRA DO BANCO NAO PASSA POR AQUI. O Actions so conhece o
// PAINEL_TOKEN, que autoriza gravar CACHE -- dado descartavel, que se reconstroi
// sozinho. Se ele vazar, o estrago e alguem escrever numeros errados ate a
// proxima carga; nao e acesso ao banco.
//
// Reusa as etapas de netlify/functions/mubi-cache-background.mjs de proposito:
// sao 600 linhas de regra de negocio afinada em producao (janela de vencidos que
// escondia R$ 52 mil de calote, rateio das unioes de itens que inflava 23% do
// faturamento, DSO com corte). Copiar isso seria criar uma segunda verdade.
//
// Modos:
//   incremental (padrao) — recebiveis/pagar/bancos completos + janela de 7 dias
//                          de orcamentos e OS mesclada no cache atual
//   completo             — tudo desde 1 de janeiro (roda de madrugada)
// ============================================================================

import {
  etapaRapidos, etapaCompleta, calcDso, normOrcamento, normOS, chaveProduto,
} from "../netlify/functions/mubi-cache-background.mjs";
import { mubiGetTudo, mubiConfigurado, hojeMais } from "../netlify/functions/lib/mubi.js";

const FN = process.env.PAINEL_CACHE_URL
  || "https://heveemylixartyijxewh.supabase.co/functions/v1/painel-cache";
const TOKEN = process.env.PAINEL_TOKEN;
const MODO = process.argv.includes("--completo") ? "completo" : "incremental";

if (!TOKEN) { console.error("PAINEL_TOKEN ausente"); process.exit(1); }
if (!mubiConfigurado()) { console.error("Mubisys nao configurado (MUBI_*)"); process.exit(1); }

async function chamar(corpo) {
  const r = await fetch(FN, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-token": TOKEN },
    body: JSON.stringify(corpo),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`painel-cache HTTP ${r.status}: ${t.slice(0, 200)}`);
  return JSON.parse(t || "{}");
}

const ler = async (chave) => (await chamar({ action: "ler", chave })).valor ?? null;

// Grava so o que veio. null NAO grava -- e assim que uma fonte que falhou
// preserva o valor anterior em vez de zerar o painel.
async function gravar(chave, valor) {
  if (valor === null || valor === undefined) {
    console.log(`   ${chave}: manteve o anterior (fonte falhou)`);
    return;
  }
  const r = await chamar({ chave, valor });
  console.log(`   ${chave}: ${r.itens ?? "ok"}`);
}

// Janela de 7 dias mesclada no cache atual, por id. Substitui a etapaIncremental
// da versao Netlify, que dependia do store do Blobs para ler o que ja existia.
async function janelaDe7Dias() {
  const janela = { status: "TODOS", datainicial: hojeMais(-7), datafinal: hojeMais(0) };

  const [orcAtual, osAtual] = await Promise.all([ler("orcamentos"), ler("ordens")]);
  const mapaOrc = new Map((orcAtual ?? []).map((o) => [o.id, o]));
  const mapaOS = new Map((osAtual ?? []).map((o) => [o.id, o]));

  // Tres filtros de data: um orcamento aprovado hoje foi CADASTRADO ha meses e
  // nao apareceria numa janela so de cadastro.
  for (const filtro of ["CADASTRO", "APROVACAO", "CANCELAMENTO"]) {
    const brutos = await mubiGetTudo("orcamento", { ...janela, filtrodata: filtro }, 100);
    brutos.map(normOrcamento).forEach((o) => mapaOrc.set(o.id, o));
  }

  const catalogo = await mubiGetTudo("produto");
  const categoriaPorNome = new Map(
    catalogo.map((p) => [chaveProduto(p.nome), String(p.categoria || "").trim()]));

  for (const filtro of ["CADASTRO", "APROVACAO", "CANCELAMENTO"]) {
    const brutos = await mubiGetTudo("ordem-servico", { ...janela, filtrodata: filtro }, 100);
    for (const [i, bruto] of brutos.entries()) {
      const o = normOS(bruto, i, categoriaPorNome);
      if (o.cancelada) mapaOS.delete(o.id);
      else mapaOS.set(o.id, o);
    }
  }

  return { orcamentos: [...mapaOrc.values()], ordens: [...mapaOS.values()] };
}

async function main() {
  const inicio = Date.now();
  console.log(`carga do cache (${MODO})`);

  const anterior = (await chamar({ action: "ler", chave: "status" })).status;

  // Os dois blocos sao INDEPENDENTES: um "fetch failed" nos orcamentos nao pode
  // descartar os recebiveis que ja vieram, e vice-versa. Antes era tudo ou nada,
  // e foi assim que o Mubisys degradado congelou o painel por 8 horas.
  let rapidos = { recebiveis: null, pagar: null, bancos: null, falhas: ["bloco-rapido"] };
  let pesados = { orcamentos: null, ordens: null, falhas: ["bloco-pesado"] };
  try {
    rapidos = await etapaRapidos();
  } catch (e) {
    console.warn("bloco rapido falhou inteiro:", e?.message || e);
  }
  try {
    pesados = MODO === "completo" ? await etapaCompleta() : await janelaDe7Dias();
  } catch (e) {
    console.warn("bloco pesado falhou inteiro:", e?.message || e);
  }

  const veioAlgo = [rapidos.recebiveis, rapidos.pagar, rapidos.bancos,
                    pesados.orcamentos, pesados.ordens].some((x) => x != null);
  if (!veioAlgo) {
    console.error("Mubisys indisponivel: nada foi obtido. Cache anterior preservado.");
    process.exit(1);
  }

  console.log("gravando:");
  await gravar("recebiveis", rapidos.recebiveis);
  await gravar("pagar", rapidos.pagar);
  await gravar("bancos", rapidos.bancos);
  await gravar("orcamentos", pesados.orcamentos);
  await gravar("ordens", pesados.ordens);

  // DSO: sem recebiveis novos, mantem o anterior em vez de calcular sobre lista
  // vazia (que daria 0 e mentiria na curva).
  const dso = rapidos.recebiveis ? calcDso(rapidos.recebiveis) : (anterior?.dso ?? 0);
  const hist = (await ler("dso_hist")) ?? [];
  const dia = new Date().toISOString().slice(0, 10);
  await gravar("dso_hist", [...hist.filter((p) => p && p.dia !== dia), { dia, dso }].slice(-180));

  const falhas = [...(rapidos.falhas ?? []), ...(pesados.falhas ?? [])];
  await gravar("status", {
    em: new Date().toISOString(), // horario do ULTIMO sucesso (frescor real)
    ok: true,
    modo: MODO,
    dso,
    duracaoMs: Date.now() - inicio,
    contagens: {
      recebiveis: rapidos.recebiveis?.length ?? "manteve",
      pagar: rapidos.pagar?.length ?? "manteve",
      bancos: rapidos.bancos?.length ?? "manteve",
      orcamentos: pesados.orcamentos?.length ?? "manteve",
      ordens: pesados.ordens?.length ?? "manteve",
    },
    // Ciclo parcial: algumas fontes falharam e mantiveram o valor anterior.
    // ok:true porque o cache ESTA utilizavel -- mas o painel precisa saber.
    fontesQueFalharam: falhas,
    parcial: falhas.length > 0,
  });

  console.log(`pronto em ${Math.round((Date.now() - inicio) / 1000)}s`);
}

main().catch((e) => { console.error("carga falhou:", e); process.exit(1); });
