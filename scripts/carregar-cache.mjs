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
  etapaRapidos, etapaCompleta, etapaRealizado, calcDso, normOrcamento, normOS, chaveProduto,
  SEM_CATEGORIA, FORA_CATALOGO,
} from "../netlify/functions/mubi-cache-background.mjs";
import { mubiGetTudo, mubiConfigurado, hojeMais } from "../netlify/functions/lib/mubi.js";

const FN = process.env.PAINEL_CACHE_URL
  || "https://heveemylixartyijxewh.supabase.co/functions/v1/painel-cache";
const TOKEN = process.env.PAINEL_TOKEN;
/* Tres modos:
   incremental — a cada 20 min: recebiveis/pagar/bancos + janela de 7 dias.
   completo    — de madrugada: o ano de orcamentos e dois anos de O.S.
   realizado   — de madrugada, em corrida PROPRIA: o fluxo mes a mes do que ja
                 foi pago. Fica separado porque sao ~11 paginas por ano por
                 endpoint e a completa ja leva ~25 min; juntas encostariam no
                 teto de 45 min do job. */
const MODO = process.argv.includes("--realizado") ? "realizado"
  : process.argv.includes("--completo") ? "completo"
  : "incremental";

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

/* Le distinguindo "a chave NAO EXISTE" de "a chave existe e esta vazia".
   A diferenca decide se a carga leve pode mesclar: mesclar 7 dias por cima de
   uma base que nunca existiu grava so esses 7 dias e apaga o resto do ano.
   O servidor antigo nao manda `existe` -- nesse caso `existe` vem undefined e a
   heuristica cai para "tem valor?", que e o comportamento de sempre. */
async function lerComExistencia(chave) {
  const r = await chamar({ action: "ler", chave });
  return { valor: r.valor ?? null, existe: r.existe ?? r.valor != null };
}

// Grava so o que veio. null NAO grava -- e assim que uma fonte que falhou
// preserva o valor anterior em vez de zerar o painel.
async function gravar(chave, valor, recusados) {
  if (valor === null || valor === undefined) {
    console.log(`   ${chave}: manteve o anterior (fonte falhou)`);
    return;
  }
  const r = await chamar({ chave, valor });
  // O servidor recusa lista vazia por cima de lista cheia (404 do ERP e afins).
  // Recusa e FALHA DE FONTE, nao sucesso -- registra para o status nao sair
  // verde dizendo que gravou.
  if (r.recusouVazio) {
    console.warn(`   ${chave}: RECUSADO -- ${r.pulou}`);
    recusados?.push(`vazio-recusado:${chave}`);
    return;
  }
  console.log(`   ${chave}: ${r.itens ?? "ok"}`);
}

// Janela de 7 dias mesclada no cache atual, por id. Substitui a etapaIncremental
// da versao Netlify, que dependia do store do Blobs para ler o que ja existia.
async function janelaDe7Dias() {
  const janela = { status: "TODOS", datainicial: hojeMais(-7), datafinal: hojeMais(0) };

  const [orc, os] = await Promise.all([
    lerComExistencia("orcamentos"), lerComExistencia("ordens"),
  ]);

  /* A carga leve ATUALIZA A PONTA de uma base que ja existe. Se a base nao
     existe, mesclar 7 dias em cima do vazio nao e atualizar: e regravar a chave
     com uma semana de dados e apagar o ano. Como isso roda a cada 20 minutos e
     a carga completa so as 06:00, o estrago ficava consolidado o dia inteiro.

     `null` devolvido aqui e o sinal de "fonte falhou": gravar() preserva o que
     estava la e a chave entra em `falhas`, para o status nao sair verde.

     Chave EXISTENTE e vazia nao entra nesta trava -- em 1o de janeiro `ordens`
     comeca vazia de verdade, e recusar merge deixaria a tela sem O.S. ate o dia
     seguinte. */
  const faltando = [];
  if (!orc.existe) faltando.push("orcamentos");
  if (!os.existe) faltando.push("ordens");
  if (faltando.length) {
    console.warn(`   base ausente (${faltando.join(", ")}) -- pulando o merge, aguardando a carga completa`);
    return { orcamentos: null, ordens: null, falhas: faltando.map((f) => `base-ausente:${f}`) };
  }

  const mapaOrc = new Map((orc.valor ?? []).map((o) => [o.id, o]));
  const mapaOS = new Map((os.valor ?? []).map((o) => [o.id, o]));

  // Tres filtros de data: um orcamento aprovado hoje foi CADASTRADO ha meses e
  // nao apareceria numa janela so de cadastro.
  for (const filtro of ["CADASTRO", "APROVACAO", "CANCELAMENTO"]) {
    const brutos = await mubiGetTudo("orcamento", { ...janela, filtrodata: filtro }, 100);
    brutos.map(normOrcamento).forEach((o) => mapaOrc.set(o.id, o));
  }

  /* O CATALOGO PODE CAIR SEM LEVAR O RESTO JUNTO.
     Em 06/08/2026 o endpoint `produto` do Mubisys passou a responder 500. Como
     esta chamada estava solta, a excecao derrubava o bloco pesado INTEIRO --
     inclusive os orcamentos, que ja tinham vindo e nao dependem de catalogo
     nenhum. Resultado: quatro dias de painel com dado velho, e toda rodada
     terminando em "success", porque o script preserva o cache anterior e sai 0.

     E nao basta seguir com o catalogo vazio: `itemProduto` marca como
     "Fora do catalogo" todo nome que nao achar, e a tela de Produtos passaria a
     mentir com cara de verdade (foi o bug do balde "Outros", R$609 mil).
     Entao a classificacao e reconstruida a partir do que ja esta no cache. */
  let categoriaPorNome = new Map();
  try {
    const catalogo = await mubiGetTudo("produto");
    categoriaPorNome = new Map(
      catalogo.map((p) => [chaveProduto(p.nome), String(p.categoria || "").trim()]));
  } catch (e) {
    console.warn("catalogo de produtos indisponivel:", e?.message || e);
    for (const o of mapaOS.values()) {
      for (const it of o.itens ?? []) {
        const cat = String(it.categoria || "");
        // Sentinelas nao sao classificacao: cimenta-las faria o erro virar dado.
        if (!cat || cat === SEM_CATEGORIA || cat === FORA_CATALOGO) continue;
        categoriaPorNome.set(chaveProduto(it.produto), cat);
      }
    }
    if (categoriaPorNome.size === 0) {
      // Sem catalogo e sem base anterior, mexer nas O.S. so estragaria. Os
      // orcamentos seguem: nunca dependeram do catalogo.
      console.warn("sem base para classificar: O.S. mantidas como estao");
      return { orcamentos: [...mapaOrc.values()], ordens: null, falhas: ["catalogo-indisponivel"] };
    }
    console.warn(`classificando por ${categoriaPorNome.size} produtos ja conhecidos`);
  }

  /* As O.S. tambem sao isoladas: falha aqui nao pode descartar os orcamentos
     que ja estao prontos na mao. */
  try {
    for (const filtro of ["CADASTRO", "APROVACAO", "CANCELAMENTO"]) {
      const brutos = await mubiGetTudo("ordem-servico", { ...janela, filtrodata: filtro }, 100);
      for (const [i, bruto] of brutos.entries()) {
        const o = normOS(bruto, i, categoriaPorNome);
        if (o.cancelada) mapaOS.delete(o.id);
        else mapaOS.set(o.id, o);
      }
    }
  } catch (e) {
    console.warn("ordens de servico falharam:", e?.message || e);
    return { orcamentos: [...mapaOrc.values()], ordens: null, falhas: ["ordens"] };
  }

  return { orcamentos: [...mapaOrc.values()], ordens: [...mapaOS.values()] };
}

/* CARGA DO REALIZADO — corrida propria, so o fluxo mes a mes.
   Nao toca em mais nada: se falhar, o painel inteiro segue com o cache de
   sempre e so o grafico do Fluxo fica com o valor anterior. */
async function cargaDoRealizado() {
  const inicio = Date.now();
  console.log("carga do realizado mes a mes");

  const atual = await ler("fluxo_mensal");
  const r = await etapaRealizado(new Date().getUTCFullYear(), atual);

  if (!r.valor) {
    console.error("nenhum ano do realizado veio. Cache anterior preservado.");
    process.exit(1);
  }

  console.log("gravando:");
  await gravar("fluxo_mensal", r.valor);
  const anos = r.valor.disponiveis.join(", ");
  const total = Object.values(r.valor.contagens || {})
    .reduce((s, c) => s + (c.receber || 0) + (c.pagar || 0), 0);
  console.log(`   anos no grafico: ${anos} | ${total} titulos pagos lidos nesta corrida`);
  if (r.falhas.length) console.warn(`   falhas: ${r.falhas.join(", ")}`);
  console.log(`pronto em ${Math.round((Date.now() - inicio) / 1000)}s`);
}

async function main() {
  if (MODO === "realizado") return cargaDoRealizado();

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
  const recusados = [];
  await gravar("recebiveis", rapidos.recebiveis, recusados);
  await gravar("pagar", rapidos.pagar, recusados);
  await gravar("bancos", rapidos.bancos, recusados);
  await gravar("orcamentos", pesados.orcamentos, recusados);
  await gravar("ordens", pesados.ordens, recusados);

  // DSO: sem recebiveis novos, mantem o anterior em vez de calcular sobre lista
  // vazia (que daria 0 e mentiria na curva).
  /* Lista VAZIA nao serve de base para o DSO. `[]` e truthy, entao a condicao
     antiga (`rapidos.recebiveis ?`) entrava no calcDso, que devolve 0 limpo
     para lista vazia -- e esse 0 ia para a curva e para o status, virando o
     "anterior" da rodada seguinte. Ou seja: a trava nova do servidor salvava os
     recebiveis, mas o DSO era zerado do mesmo jeito por esta linha. */
  const temBase = Array.isArray(rapidos.recebiveis) && rapidos.recebiveis.length > 0;
  const dso = temBase ? calcDso(rapidos.recebiveis) : (anterior?.dso ?? 0);
  if (!temBase) {
    console.warn("   dso: sem base de recebiveis -- mantive o historico como estava");
    recusados.push("dso-sem-base");
  } else {
    const hist = (await ler("dso_hist")) ?? [];
    const dia = new Date().toISOString().slice(0, 10);
    await gravar("dso_hist", [...hist.filter((p) => p && p.dia !== dia), { dia, dso }].slice(-180));
  }

  const falhas = [...(rapidos.falhas ?? []), ...(pesados.falhas ?? []), ...recusados];
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
