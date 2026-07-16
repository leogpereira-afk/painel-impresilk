// Helper compartilhado das Functions. Guarda as credenciais do Mubisys no
// servidor e fala com o ERP (somente GET). Este arquivo NAO vira uma Function.
//
// API real (confirmada no OpenAPI em api.mubisys.com/api/documentation):
//   base:  https://api.mubisys.com/api
//   rota:  {base}/{publicKey}/{recurso}?status=...&filtrodata=...&datainicial=AAAA-MM-DD&datafinal=AAAA-MM-DD&page=N&per_page=500
//   auth:  header "Access-Token" (token de autorizacao do usuario) + publicKey no caminho
//   403 =  cliente sem pacote MubiPro (a API exige esse pacote)
//
// Variaveis de ambiente do Netlify:
//   MUBI_BASE_URL    https://api.mubisys.com/api
//   MUBI_PUBLIC_KEY  chave publica (vai no caminho)
//   MUBI_TOKEN       Access-Token do usuario

const BASE = process.env.MUBI_BASE_URL || "";
const PUB = process.env.MUBI_PUBLIC_KEY || "";
const TOKEN = process.env.MUBI_TOKEN || "";

export function mubiConfigurado() {
  return Boolean(BASE && PUB && TOKEN);
}

// GET em {BASE}/{publicKey}/{caminho}?{query}, com timeout por pagina e ate 4
// tentativas. No horario comercial uma pagina de 500 itens ja foi medida em
// 206s; 120s (o valor antigo) abortava paginas validas e derrubava a etapa.
// 280s cobre o pior caso observado sem deixar uma resposta pendurada travar a
// background (cujo teto e 900s).
const TIMEOUT_MS = 280000;
const CAP_POR_PAGINA_MS = 300000;

export async function mubiGet(caminho, query = {}) {
  if (!mubiConfigurado()) {
    const err = new Error(
      "Mubi nao configurado (defina MUBI_BASE_URL, MUBI_PUBLIC_KEY e MUBI_TOKEN)."
    );
    err.code = "SEM_CONFIG";
    throw err;
  }
  // Toda chamada ao Mubisys passa por aqui: e o unico lugar onde o teto global
  // de concorrencia pode ser garantido.
  return comVaga(() => mubiGetSemFila(caminho, query));
}

async function mubiGetSemFila(caminho, query) {
  const url = new URL(`${BASE.replace(/\/$/, "")}/${PUB}/${caminho.replace(/^\//, "")}`);
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });

  // O Mubisys as vezes devolve 404 intermitente para um recurso valido; ate 4
  // tentativas absorvem a piscada. Teto de 180s por pagina no total, para nao
  // acumular timeouts e estourar o limite de 15 min da background.
  let ultimoErro;
  const inicioChamada = Date.now();
  for (let tentativa = 1; tentativa <= 4; tentativa++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const resp = await fetch(url, {
        headers: { Accept: "application/json", "Access-Token": TOKEN },
        signal: ctl.signal,
      });
      clearTimeout(timer);
      if (resp.status === 403) {
        throw Object.assign(
          new Error("Mubisys recusou (403): o plano precisa do pacote MubiPro para usar a API."),
          { fatal: true }
        );
      }
      if (resp.status === 401) {
        throw Object.assign(
          new Error("Mubisys recusou (401): confira MUBI_PUBLIC_KEY e MUBI_TOKEN."),
          { fatal: true }
        );
      }
      if (!resp.ok) {
        throw new Error(`Mubi ${caminho} respondeu ${resp.status}`);
      }
      return await resp.json();
    } catch (e) {
      clearTimeout(timer);
      if (e.fatal) throw e;
      ultimoErro = e.name === "AbortError" ? new Error(`Mubi ${caminho}: timeout de ${TIMEOUT_MS / 1000}s`) : e;
      if (Date.now() - inicioChamada > CAP_POR_PAGINA_MS) break; // nao insiste alem do cap por pagina
      if (tentativa < 4) await new Promise((r) => setTimeout(r, 2500 * tentativa));
    }
  }
  throw ultimoErro;
}

// Extrai o array de itens de uma resposta (aceita array puro ou paginacao
// estilo Laravel: {data:[...], current_page, last_page, ...}).
export function itens(bruto) {
  if (Array.isArray(bruto)) return bruto;
  if (Array.isArray(bruto?.data)) return bruto.data;
  if (Array.isArray(bruto?.dados)) return bruto.dados;
  return [];
}

// O Mubisys devolve o mapa de paginacao em `pagination`; algumas rotas usam
// `meta`. Ler isso e o que permite buscar as paginas 2..N em paralelo.
function paginacao(bruto) {
  const m = bruto?.pagination || bruto?.meta;
  if (!m || m.current_page == null || m.last_page == null) return null;
  return { atual: Number(m.current_page), ultima: Number(m.last_page) };
}

function ultimaPagina(bruto, qtdRecebida, perPage) {
  const p = paginacao(bruto);
  if (p) return p.atual >= p.ultima;
  return qtdRecebida < perPage; // sem meta: para quando a pagina vem incompleta
}

// Busca UMA pagina de um recurso e devolve tambem o total de paginas.
// IMPORTANTE: cada invocacao de Function deve fazer NO MAXIMO uma chamada ao
// Mubisys (a API leva 5-8s por pagina e o limite da Function e 10s); quem
// orquestra as paginas em paralelo e o navegador.
export async function mubiGetPagina(caminho, query = {}, page = 1) {
  const perPage = 500;
  const bruto = await mubiGet(caminho, { ...query, page, per_page: perPage });
  const arr = itens(bruto);
  const pag = bruto?.pagination || bruto?.meta || {};
  const totalPaginas = Number(pag.last_page) || (arr.length < perPage ? page : page + 1);
  return { lista: arr, totalPaginas };
}

// Busca TODAS as paginas de um recurso. So usar em background functions (o
// Mubisys e lento demais para Functions sincronas). Trava de seguranca em 100
// paginas; se ainda houver mais, FALHA em vez de truncar em silencio (melhor
// erro visivel do que faturamento subestimado sem ninguem saber).
// Limite GLOBAL de chamadas simultaneas ao Mubisys. Medido contra a API real:
// 2 em paralelo respondem em ~70s cada (mais rapido que 1 sozinha, que variou
// de 106s a 157s); 4 em paralelo estouram TODAS em timeout de 300s. O teto
// precisa ser global, e nao por chamada: etapaRapidos e etapaCompleta ja
// disparam recursos em paralelo entre si, e os limites se somariam.
const TETO = 2;
let emVoo = 0;
const fila = [];

async function comVaga(fn) {
  if (emVoo >= TETO) await new Promise((r) => fila.push(r));
  emVoo++;
  try {
    return await fn();
  } finally {
    emVoo--;
    fila.shift()?.();
  }
}

export async function mubiGetTudo(caminho, query = {}, perPage = 500) {
  const GUARDA = 100; // 50000 itens a 500/pagina
  const p1 = await mubiGet(caminho, { ...query, page: 1, per_page: perPage });
  const arr1 = itens(p1);
  if (ultimaPagina(p1, arr1.length, perPage)) return arr1;

  const pag = paginacao(p1);
  if (!pag) {
    // Sem mapa de paginacao: nao da para saber quantas faltam, segue em serie.
    const tudo = [...arr1];
    for (let page = 2; page <= GUARDA; page++) {
      const bruto = await mubiGet(caminho, { ...query, page, per_page: perPage });
      const arr = itens(bruto);
      tudo.push(...arr);
      if (ultimaPagina(bruto, arr.length, perPage)) return tudo;
    }
    console.warn(`mubiGetTudo: ${caminho} passou de ${GUARDA} paginas (${tudo.length} itens)`);
    throw Object.assign(new Error(`Paginacao de ${caminho} excedeu ${GUARDA} paginas`), {
      truncou: true,
    });
  }

  if (pag.ultima > GUARDA) {
    throw Object.assign(new Error(`Paginacao de ${caminho} excedeu ${GUARDA} paginas`), {
      truncou: true,
    });
  }

  // Dispara todas as paginas restantes: quem controla a concorrencia real e o
  // teto global no mubiGet, nao um lote aqui.
  const restantes = [];
  for (let p = 2; p <= pag.ultima; p++) restantes.push(p);
  const res = await Promise.all(
    restantes.map((page) =>
      mubiGet(caminho, { ...query, page, per_page: perPage }).then((b) => itens(b))
    )
  );
  // Ordem preservada: Promise.all devolve na ordem de entrada, nao de conclusao.
  return [...arr1, ...res.flat()];
}

// Datas AAAA-MM-DD relativas a hoje (fuso de Sao Paulo nao importa aqui: a
// janela tem folga de dias nas duas pontas).
export function hojeMais(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function json(body, status = 200) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}

// Resposta padrao quando o Mubi ainda nao foi ligado: o front usa MODO_DEMO.
export function semConfig() {
  return json(
    { erro: "Mubi nao configurado. O painel roda em MODO_DEMO ate as variaveis de ambiente serem definidas." },
    501
  );
}

// Erro generico para o cliente (nao vaza mensagem/stack interna); detalhe so no log.
export function erroInterno(e, status = 502) {
  console.error("[painel] erro na Function:", e?.message || e);
  return json({ erro: "Erro ao carregar os dados. Tente de novo em instantes." }, status);
}

// Converte number, "1234.56", "1.234,56" (BR com centavos) e "1.234.567" (BR
// milhar sem centavos) em Number seguro.
export function num(v) {
  if (typeof v === "number") return v;
  if (v == null) return 0;
  const s = String(v).trim();
  if (!s) return 0;
  // BR com centavos: 1.234,56  (ponto = milhar, virgula = decimal)
  if (/,\d{1,2}$/.test(s)) {
    const n = Number(s.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  // BR milhar sem centavos: 1.234 / 1.234.567  (ponto so como separador de milhar)
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    const n = Number(s.replace(/\./g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// Le o primeiro campo existente entre varias alternativas de nome.
export function campo(obj, ...nomes) {
  for (const n of nomes) {
    const v = n.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}
