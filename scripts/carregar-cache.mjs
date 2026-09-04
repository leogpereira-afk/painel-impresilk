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
  SEM_CATEGORIA, FORA_CATALOGO, normRecebivel, CORTE_ATRASADOS,
  etapaHistoricoOS, fatiasPorAno, conferirAbatimentos,
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
const MODO = process.argv.includes("--historico") ? "historico"
  : process.argv.includes("--realizado") ? "realizado"
  : process.argv.includes("--completo") ? "completo"
  : "incremental";

/* De quando puxar o historico de O.S. A direcao escolhe na tela de Permutas
   (fica em painel_config_global) e o job usa. O padrao existe para a primeira
   corrida ter um valor sensato sem ninguem configurar nada. */
const HISTORICO_DESDE_PADRAO = "2020-01-01";

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

/* AS O.S. TAMBEM VAO PARA A TABELA `painel_ordens`.
   O vetor do cache viaja inteiro para o navegador no login e por isso so pode
   ir ate onde as OUTRAS telas precisam (2025). A tela de Permutas precisa do
   historico -- 2020 sao ~19.500 O.S., ~10 MB -- e le da tabela, por cliente.
   A mesma carga alimenta as duas: um dado so, duas formas. */
const chaveCliente = (nome) =>
  String(nome ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().replace(/\s+/g, " ").toUpperCase();

/* O VALOR FINAL da O.S. -- bruto menos desconto -- que e o que a permuta abate
   do credito do parceiro. Vem do cabecalho do ERP, ja calculado pelo normOS.
   A soma dos itens fica como caminho de volta para O.S. do cache antigo,
   gravada antes de o campo existir: sem ela elas passariam a valer zero e o
   saldo da permuta subiria sozinho. */
const valorDaOS = (o) => {
  const v = o?.valor != null && o.valor !== ""
    ? Number(o.valor) || 0
    : (o.itens ?? []).reduce((s, it) => s + (Number(it.valorTotal) || 0), 0);
  return Math.round(v * 100) / 100;
};

/* SO GRAVA O QUE ELA MESMA NORMALIZOU NESTA CORRIDA.
 *
 * `painel_ordens` tem DOIS escritores: a carga do historico, que busca a O.S.
 * no ERP e traz `valor_total` e `valor_desconto`, e a carga incremental de 20
 * em 20 minutos, que MESCLA a janela de 7 dias no cache e reescreve o vetor
 * inteiro -- inclusive as O.S. antigas, que vieram do cache guardado e nao tem
 * cabecalho nenhum.
 *
 * Sem esta trava, a incremental desfazia a do historico: em 19/08/2026 ela
 * passou por cima de 4.869 linhas as 10:57 e zerou 1.536 descontos que a carga
 * das 02:15 tinha acabado de trazer. Nada reclamou -- os dois numeros eram
 * "coerentes" (bruto = valor, desconto = 0), so que errados.
 *
 * `valorBruto` so existe em O.S. que passaram pelo `normOS` DESTA versao, com o
 * cabecalho do ERP na mao. Quem nao tem, ja esta na tabela com dado melhor: o
 * certo e nao encostar. */
async function gravarOrdensTabela(ordens) {
  if (!Array.isArray(ordens) || !ordens.length) return 0;
  const comCabecalho = ordens.filter((o) => o?.valorBruto != null);
  const pulou = ordens.length - comCabecalho.length;
  if (pulou) {
    console.log(`   painel_ordens: ${pulou} O.S. sem cabecalho do ERP -- nao toquei (ja estao la com dado melhor)`);
  }
  if (!comCabecalho.length) return 0;
  const LOTE = 1000;
  let total = 0;
  for (let i = 0; i < comCabecalho.length; i += LOTE) {
    const linhas = comCabecalho.slice(i, i + LOTE).map((o) => {
      const ck = chaveCliente(o.cliente);
      return {
        id: String(o.id),
        numero: String(o.numero ?? ""),
        cliente: String(o.cliente ?? ""),
        clienteChave: ck,
        // O CNPJ vem na propria O.S. (`cliente_cnpj_cpf`), ja normalizado pelo
        // normOS. A primeira versao ia busca-lo no cadastro de clientes -- 22
        // paginas, ~88 s -- porque eu procurava o campo com o nome errado.
        cnpj: String(o.cnpj || ""),
        data: String(o.data ?? "").slice(0, 10),
        valor: valorDaOS(o),
        // O bruto e o desconto vao JUNTO, e nao so o resultado: guardar so o
        // final faz a conta virar um numero de origem desconhecida -- que foi
        // o que permitiu o desconto passar batido por dois dias.
        bruto: Math.round(Number(o.valorBruto) * 100) / 100,
        desconto: Math.round((Number(o.desconto) || 0) * 100) / 100,
        vendedor: String(o.vendedor ?? ""),
        /* OS ITENS VAO JUNTO. E o que responde "o que a gente vende nesse tipo
           de evento" na tela de Campanhas -- placa, lona, adesivo. Sem eles a
           campanha so sabe QUANTO vendeu, nunca O QUE.
           `normOS` ja rateou as unioes do Mubisys, entao a soma dos itens
           fecha com o bruto da O.S.; mandar o item cru traria de volta o balde
           "Outros" de 23% que ja custou caro. */
        itens: Array.isArray(o.itens) ? o.itens : [],
      };
    });
    const r = await chamar({ action: "ordens", linhas });
    total += r.gravadas ?? 0;
  }
  return total;
}

// Janela de 7 dias mesclada no cache atual, por id. Substitui a etapaIncremental
// da versao Netlify, que dependia do store do Blobs para ler o que ja existia.
async function janelaDe7Dias() {
  /* `datafinal` vai um dia ALEM de hoje. O Mubisys compara a data final na
     meia-noite: `datafinal=2026-08-24` significa "cadastro < 24/08 00:00", e a
     O.S. cadastrada hoje as 11h fica FORA da janela que termina "hoje". Foi
     assim que em 24/08/2026 sete O.S. do dia (23081-23087) existiam no ERP --
     o PCP as importava de hora em hora, com janela terminando no futuro -- e o
     painel inteiro dizia que a mais nova era de quinta, com toda rodada em
     "sucesso". O painel era cego para o proprio dia desde sempre; so aparecia
     para quem procurasse a O.S. de hoje. */
  const janela = { status: "TODOS", datainicial: hojeMais(-7), datafinal: hojeMais(1) };

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
  const osCanceladas = new Set();

  /* O QUE O ERP RESPONDEU, filtro a filtro. "Sucesso" com zero linhas e uma
     resposta valida num domingo parado -- e o sintoma de endpoint quebrado num
     dia de semana com pedido novo na fabrica. Sem este registro as duas coisas
     saem iguais no status, e ja se passaram dias assim (24/08: O.S. paradas em
     quinta-feira com a rodada dizendo ok). Vai junto no status para o banco
     responder de que lado esta o defeito sem precisar de acesso ao ERP. */
  const janelaErp = { orc: {}, os: {}, osMaisNova: "" };

  // Tres filtros de data: um orcamento aprovado hoje foi CADASTRADO ha meses e
  // nao apareceria numa janela so de cadastro.
  for (const filtro of ["CADASTRO", "APROVACAO", "CANCELAMENTO"]) {
    const brutos = await mubiGetTudo("orcamento", { ...janela, filtrodata: filtro }, 100);
    janelaErp.orc[filtro] = brutos.length;
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
  let catalogoOk = true;
  try {
    const catalogo = await mubiGetTudo("produto");
    // LISTA VAZIA NAO E CATALOGO. O ERP pode responder 200 com [] (janela de
    // manutencao, filtro que mudou); seguir com o mapa vazio faria TODO item
    // virar "Fora do catalogo" -- sem excecao nenhuma para o try pegar.
    if (!catalogo.length) throw new Error("catalogo veio vazio");
    categoriaPorNome = new Map(
      catalogo.map((p) => [chaveProduto(p.nome), String(p.categoria || "").trim()]));
  } catch (e) {
    catalogoOk = false;
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

  /* SEM CATALOGO, NAO SE INVENTA CLASSIFICACAO NOVA.
     A base reconstruida so conhece o que ja passou por aqui. Produto NOVO nao
     esta nela e viraria "Fora do catalogo" -- e esse rotulo seria GRAVADO,
     virando a base da rodada seguinte: o erro se cimenta e nunca mais sai
     sozinho. Enquanto o ERP nao volta, item desconhecido fica com a
     classificacao que a O.S. ja tinha (ou sem nenhuma), nunca com a sentinela. */
  const guardarCategoria = catalogoOk ? null : (o) => {
    const antes = mapaOS.get(o.id);
    for (const it of o.itens ?? []) {
      if (it.categoria !== FORA_CATALOGO) continue;
      const igual = (antes?.itens ?? []).find((x) => x.produto === it.produto);
      it.categoria = igual?.categoria ?? "";
    }
    return o;
  };

  /* As O.S. tambem sao isoladas: falha aqui nao pode descartar os orcamentos
     que ja estao prontos na mao. */
  try {
    for (const filtro of ["CADASTRO", "APROVACAO", "CANCELAMENTO"]) {
      const brutos = await mubiGetTudo("ordem-servico", { ...janela, filtrodata: filtro }, 100);
      janelaErp.os[filtro] = brutos.length;
      for (const [i, bruto] of brutos.entries()) {
        const o = normOS(bruto, i, categoriaPorNome);
        // A data mais nova que o ERP mandou NA JANELA -- antes de qualquer
        // filtro nosso. Se ela ficar dias atras do relogio, o atraso e do ERP.
        if (o.data > janelaErp.osMaisNova) janelaErp.osMaisNova = o.data;
        /* A cancelada sai do CACHE aqui -- e o id fica guardado para sair da
           TABELA painel_ordens tambem. Sem isso, a O.S. cancelada hoje
           continuava na tabela (e ABATENDO credito de permuta) por ate 7 dias,
           ate a carga do historico de domingo passar por ela. */
        if (o.cancelada) { mapaOS.delete(o.id); osCanceladas.add(String(o.id)); }
        else mapaOS.set(o.id, guardarCategoria ? guardarCategoria(o) : o);
      }
    }
  } catch (e) {
    console.warn("ordens de servico falharam:", e?.message || e);
    return { orcamentos: [...mapaOrc.values()], ordens: null, falhas: ["ordens"], janelaErp };
  }

  // `falhas` sobe junto: sem isso a rodada terminava em "sucesso" limpo, e nada
  // na tela nem no log dizia que o painel estava rodando com a classificacao
  // velha. Foi assim que quatro dias passaram sem ninguem ver.
  console.log(
    `   janela do ERP: orc ${JSON.stringify(janelaErp.orc)} | os ${JSON.stringify(janelaErp.os)}` +
    ` | O.S. mais nova na janela: ${janelaErp.osMaisNova || "(nenhuma veio)"}`
  );

  /* OS TÍTULOS PAGOS, por título — o mapa `recebidos_os`.
     A tela de Campanhas responde "o que já entrou e o que ainda devem" desta
     campanha, e título QUITADO some das listas de aberto: sem este mapa, "nada
     em aberto" e "pago" seriam indistinguíveis (e a tela afirmaria pago sem
     dado). Guarda por ID DE TÍTULO, não somado por O.S.: mesclar a janela de
     7 dias num mapa por id é idempotente — a soma refeita a cada leitura nunca
     conta a mesma parcela duas vezes.
     A primeira corrida puxa desde CORTE_ATRASADOS (a régua das cobranças);
     depois só a janela de 7 dias por data de PAGAMENTO. Isolado como o resto:
     falha aqui não derruba orçamentos nem O.S. que já vieram. */
  let recebidos = null;
  let recebidosFalhou = false;
  try {
    const atual = await lerComExistencia("recebidos_os");
    const base = atual.existe && atual.valor && typeof atual.valor === "object" ? atual.valor : null;
    const jPagos = {
      status: "PAGO", filtrodata: "PAGAMENTO",
      datainicial: base ? hojeMais(-7) : CORTE_ATRASADOS,
      datafinal: hojeMais(1),
    };
    const brutos = await mubiGetTudo("contas-receber", jPagos, base ? 100 : 500);
    /* LISTA VAZIA NÃO É MAPA. Na PRIMEIRA carga, "zero títulos pagos desde
       2025" não existe na Impresilk — 200 com [] é o ERP piscando (a mesma
       pisca que o catálogo já deu). Gravar {titulos:{}} confiante faria a
       tela afirmar "sem título no ERP" sobre dois anos de cobrança quitada.
       Na janela de 7 dias, vazio é normal (fim de semana) e o merge preserva. */
    if (!base && !brutos.length) throw new Error("primeira carga veio vazia -- nao gravo mapa vazio");
    const titulos = { ...(base?.titulos ?? {}) };
    for (const [i, r] of brutos.entries()) {
      const n = normRecebivel(r, i);
      if (!n.os || !(n.pago > 0)) continue; // sem O.S. ou sem valor pago: não responde a pergunta
      const em = (Array.isArray(r.pagamentos) ? r.pagamentos : [])
        .map((p) => String(p?.data_pagamento || "")).filter(Boolean).sort().pop() || "";
      titulos[n.id] = { os: n.os, pago: n.pago, em };
    }
    recebidos = { desde: base?.desde ?? CORTE_ATRASADOS, titulos };
    console.log(
      `   recebidos_os: ${brutos.length} título(s) na ${base ? "janela de 7 dias" : `primeira carga (desde ${CORTE_ATRASADOS})`}` +
      ` — ${Object.keys(titulos).length} no mapa`
    );
  } catch (e) {
    recebidosFalhou = true;
    console.warn("títulos pagos falharam:", e?.message || e);
  }

  const falhas = [
    ...(catalogoOk ? [] : ["catalogo-do-erp-fora"]),
    ...(recebidosFalhou ? ["recebidos-do-erp-fora"] : []),
  ];
  return {
    orcamentos: [...mapaOrc.values()],
    ordens: [...mapaOS.values()],
    osCanceladas: [...osCanceladas],
    janelaErp,
    recebidos,
    ...(falhas.length ? { falhas } : {}),
  };
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

/* A CARGA DO HISTORICO.
   Corrida propria, e nao um pedaco da completa, porque a completa ja usa 25 dos
   45 minutos do job. Enche a TABELA `painel_ordens` -- nunca o cache, que
   viaja no login e por isso fica em 2025 em diante. */
/* A CARGA DO HISTORICO.
   Corrida propria, e nao um pedaco da completa, porque a completa ja usa 25 dos
   45 minutos do job.

   ELA ESCREVE O PROPRIO DIARIO em `historico_status`. O motivo de uma falha
   ficava so no log do Actions, que exige admin no repositorio -- duas corridas
   se perderam com "exit code 1" e nada mais, e eu passei a adivinhar em vez de
   ler. Escrito no banco, o motivo fica onde quem esta consertando alcanca. */
async function cargaDoHistorico() {
  const inicio = Date.now();
  const diario = { comecou: new Date().toISOString(), passo: "inicio", anos: [], erro: null };
  const anotar = async (extra) => {
    Object.assign(diario, extra, { ms: Date.now() - inicio });
    // Nunca deixar a anotacao derrubar a carga: ela existe para CONTAR o que
    // aconteceu, e um erro aqui nao pode virar o erro que se conta.
    try { await chamar({ chave: "historico_status", valor: diario }); } catch { /* ignora */ }
  };

  try {
    await anotar({ passo: "lendo a data das permutas" });
    const doPainel = (await chamar({ action: "cfgHistorico" })).historicoDesde;
    const desde = process.env.HISTORICO_DESDE || doPainel || HISTORICO_DESDE_PADRAO;
    const ate = process.env.HISTORICO_ATE || hojeMais(0);
    const fatias = fatiasPorAno(desde, ate);
    console.log(`carga do historico de O.S.: ${desde} ate ${ate} -- ${fatias.length} ano(s)`);
    await anotar({ passo: "buscando O.S.", desde, ate, anosPrevistos: fatias.map((f) => f.ano) });

    /* ANO A ANO, e cada ano GRAVADO ANTES do proximo comecar.
       Se o job estourar o tempo ou o ERP cair no meio, o que ja veio fica na
       tabela -- e rodar de novo completa o resto, porque a gravacao e upsert
       por id. A primeira versao pedia tudo de uma vez e, ao falhar, nao deixava
       nada: 20 minutos de ERP jogados fora e a tela igual ao que era. */
    let total = 0;
    const falharam = [];
    for (const f of fatias) {
      await anotar({ passo: `ano ${f.ano}` });
      try {
        const { ordens, canceladas, brutas } = await etapaHistoricoOS(f.de, f.ate);
        const n = await gravarOrdensTabela(ordens);
        if (canceladas.length) {
          for (let i = 0; i < canceladas.length; i += 1000) {
            await chamar({ action: "ordensApagar", ids: canceladas.slice(i, i + 1000) });
          }
        }
        total += n;
        const comCnpj = ordens.filter((o) => o.cnpj).length;
        console.log(`   ${f.ano}: ${brutas} no ERP -> ${n} gravadas (${comCnpj} com CNPJ), ${canceladas.length} canceladas`);
        /* QUANTAS TINHAM DESCONTO, e quanto foi abatido. Se um dia a regra
           parar de valer, isto vira zero e aparece no diario -- em vez de
           voltar a inflar o saldo das permutas em silencio. */
        const comDesc = ordens.filter((o) => (Number(o.desconto) || 0) > 0);
        const abatido = Math.round(comDesc.reduce((s, o) => s + Number(o.desconto), 0) * 100) / 100;
        console.log(`      ${comDesc.length} com desconto, R$ ${abatido} abatidos`);
        diario.anos.push({ ano: f.ano, brutas, gravadas: n, comCnpj,
                           canceladas: canceladas.length, comDesconto: comDesc.length, abatido });
      } catch (e) {
        // Um ano que falha NAO derruba os outros. Fica registrado -- silencio
        // aqui viraria "carga ok" com um buraco de um ano no meio.
        const motivo = String(e?.message || e).slice(0, 500);
        console.warn(`   ${f.ano}: FALHOU -- ${motivo}`);
        diario.anos.push({ ano: f.ano, erro: motivo });
        falharam.push(f.ano);
      }
    }

    console.log(`gravadas ${total} linhas em ${Math.round((Date.now() - inicio) / 1000)}s`);
    await anotar({ passo: "fim", total, falharam, ok: falharam.length === 0 });
    if (falharam.length) {
      console.error(`anos que NAO vieram: ${falharam.join(", ")} -- rode de novo para completar`);
      process.exit(1);
    }
  } catch (e) {
    /* Falha ANTES ou FORA do laco dos anos -- e foi exatamente aqui que as
       duas corridas morreram sem deixar rastro legivel. `stack` vai junto
       porque "Cannot read properties of undefined" sem a linha nao ajuda. */
    const motivo = String(e?.message || e).slice(0, 500);
    console.error(`carga do historico morreu no passo "${diario.passo}": ${motivo}`);
    await anotar({ erro: motivo, pilha: String(e?.stack || "").slice(0, 1200), ok: false });
    process.exit(1);
  }
}

async function main() {
  if (MODO === "historico") return cargaDoHistorico();
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
  /* Só o incremental monta o mapa de títulos pagos; a completa nem tenta — e
     gravar(null) aqui registraria "fonte falhou" sobre uma fonte não tentada,
     sujando o log de toda madrugada. */
  if (MODO === "incremental") await gravar("recebidos_os", pesados.recebidos, recusados);

  /* A TABELA ANDA JUNTO. Sem isto, a O.S. de hoje entraria no cache (e nas
     outras telas) mas nao na busca da permuta, que so veria ate a ultima carga
     de historico -- e ninguem entenderia por que a O.S. de ontem "nao existe". */
  if (Array.isArray(pesados.ordens) && pesados.ordens.length) {
    try {
      const n = await gravarOrdensTabela(pesados.ordens);
      console.log(`   painel_ordens: ${n} linhas`);
      /* O CANCELAMENTO TAMBEM ANDA JUNTO. O incremental tirava a cancelada do
         cache e a deixava na tabela ate a carga de domingo -- por ate 7 dias a
         O.S. cancelada continuava abatendo credito de permuta. Os ids ja estao
         na mao; e o mesmo ordensApagar da carga do historico. */
      const canc = pesados.osCanceladas || [];
      if (canc.length) {
        for (let i = 0; i < canc.length; i += 1000) {
          await chamar({ action: "ordensApagar", ids: canc.slice(i, i + 1000) });
        }
        console.log(`   painel_ordens: ${canc.length} cancelada(s) removida(s)`);
      }
    } catch (e) {
      // Falhar aqui NAO derruba a carga: o cache ja gravou, e as outras telas
      // dependem dele. A permuta fica com a busca um pouco atrasada.
      console.warn("   painel_ordens falhou:", e?.message || e);
      recusados.push("painel_ordens");
    }
  }

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

  /* O CONTROLE DOS ABATIMENTOS, gravado a cada carga.
     Tres vezes o painel usou o valor CHEIO onde a realidade era o liquido -- e
     as tres passaram batido porque o numero errado era plausivel. Isto conta
     quanto foi abatido em cada fonte: se um dia virar zero num campo que
     sempre teve valor, a denuncia esta na tela. */
  const abatimentos = conferirAbatimentos({
    recebiveis: rapidos.recebiveis ?? [],
    pagar: rapidos.pagar ?? [],
    ordens: pesados.ordens ?? [],
    orcamentos: pesados.orcamentos ?? [],
  });
  for (const [fonte, a] of Object.entries(abatimentos)) {
    if (a.total) console.log(`   ${fonte}: ${a.abatidos}/${a.total} abatidos, R$ ${a.valor}`);
  }

  const falhas = [...(rapidos.falhas ?? []), ...(pesados.falhas ?? []), ...recusados];
  await gravar("status", {
    abatimentos,
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
    // O que o ERP respondeu na janela de 7 dias (so no incremental): linhas
    // por filtro e a O.S. mais nova. E o diario que separa "o ERP nao mandou"
    // de "a carga descartou" sem precisar das credenciais do ERP na mao.
    ...(pesados.janelaErp ? { janelaErp: pesados.janelaErp } : {}),
  });

  console.log(`pronto em ${Math.round((Date.now() - inicio) / 1000)}s`);
}

main().catch((e) => { console.error("carga falhou:", e); process.exit(1); });
