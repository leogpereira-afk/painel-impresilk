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

// GET em {BASE}/{publicKey}/{caminho}?{query}, com timeout de 25s por chamada
// e ate 3 tentativas. Sem isso, uma resposta pendurada do Mubisys congela a
// background function inteira ate o limite de 15 minutos.
export async function mubiGet(caminho, query = {}) {
  if (!mubiConfigurado()) {
    const err = new Error(
      "Mubi nao configurado (defina MUBI_BASE_URL, MUBI_PUBLIC_KEY e MUBI_TOKEN)."
    );
    err.code = "SEM_CONFIG";
    throw err;
  }
  const url = new URL(`${BASE.replace(/\/$/, "")}/${PUB}/${caminho.replace(/^\//, "")}`);
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });

  let ultimoErro;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    const ctl = new AbortController();
    // O Mubisys chega a levar minutos por pagina em horario comercial; quem
    // chama e sempre a background function (15 min), entao ha folga.
    const timer = setTimeout(() => ctl.abort(), 240000);
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
      ultimoErro = e.name === "AbortError" ? new Error(`Mubi ${caminho}: timeout de 240s`) : e;
      // pequena pausa antes de tentar de novo (o Mubisys engasga sob carga)
      if (tentativa < 3) await new Promise((r) => setTimeout(r, 2000 * tentativa));
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

function ultimaPagina(bruto, qtdRecebida, perPage) {
  const meta = bruto?.meta || bruto;
  if (meta && meta.current_page != null && meta.last_page != null) {
    return Number(meta.current_page) >= Number(meta.last_page);
  }
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

// Busca TODAS as paginas de um recurso (trava em 30 paginas). So usar em
// background functions (o Mubisys e lento demais para Functions sincronas).
export async function mubiGetTudo(caminho, query = {}, perPage = 500) {
  const tudo = [];
  for (let page = 1; page <= 30; page++) {
    const bruto = await mubiGet(caminho, { ...query, page, per_page: perPage });
    const arr = itens(bruto);
    tudo.push(...arr);
    if (ultimaPagina(bruto, arr.length, perPage)) break;
  }
  return tudo;
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

// Converte "1.234,56" ou "1234.56" ou number em Number seguro.
export function num(v) {
  if (typeof v === "number") return v;
  if (v == null) return 0;
  const s = String(v).trim();
  // formato brasileiro (1.234,56) vs americano (1234.56)
  if (/,\d{1,2}$/.test(s)) {
    const n = Number(s.replace(/\./g, "").replace(",", "."));
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
