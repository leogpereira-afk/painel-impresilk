/* O SERVICE WORKER DO PAINEL — cache com as regras ditas, não um framework.
 *
 * POR QUE ELE EXISTE: o GitHub Pages manda `cache-control: max-age=600` para
 * TUDO — dez minutos. Passado isso, toda visita re-baixa ~90 kB de JS/CSS e as
 * fontes, no 4G da rua, para arquivos que têm HASH NO NOME e nunca mudam de
 * conteúdo. Este worker corrige exatamente isso, e nada mais.
 *
 * AS REGRAS (a parte que importa):
 *  1. /assets/ com hash e fontes do Google  -> CACHE PRIMEIRO, para sempre.
 *     Hash no nome = conteúdo imutável; se o arquivo mudar, o nome muda.
 *  2. O HTML (navegações)                    -> REDE PRIMEIRO, cache só como
 *     socorro offline. O painel NUNCA pode abrir numa versão velha por causa
 *     de cache — número velho é o pecado capital da casa. Deploy novo = HTML
 *     novo = nomes novos de assets, na hora.
 *  3. supabase.co (dados, login)             -> NUNCA TOCADO. Nem cache, nem
 *     interceptação: dado de decisão não passa por aqui.
 *
 * Limpeza: assets que nenhum HTML referencia mais morrem quando o cache passa
 * de ~60 entradas — o suficiente para 2-3 versões conviverem, sem crescer
 * para sempre.
 */
const CACHE = "painel-v1";
const IMUTAVEL = /\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(js|css|png|svg|woff2?)$|fonts\.gstatic\.com|fonts\.googleapis\.com/;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    /* Versão nova do worker apaga caches de versões velhas DO PAINEL -- e
       SÓ delas. `caches` é por ORIGEM, não por escopo: o RH
       (impresilk-rh-v8), o POPs (pops-shell-v11) e o Painel moram todos em
       leogpereira-afk.github.io, e apagar "tudo que não é o meu" derrubava o
       cache dos vizinhos a cada visita -- os três faziam isso, um contra o
       outro, e o ganho de velocidade de cada um evaporava ao trocar de
       sistema. O prefixo separa a minha prateleira velha da casa alheia. */
    for (const k of await caches.keys()) {
      if (k !== CACHE && k.startsWith("painel-")) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // Regra 3: dados nunca passam por aqui.
  if (url.hostname.endsWith("supabase.co")) return;

  // Regra 2: navegação = rede primeiro, cache só se a rede falhar (offline).
  if (e.request.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const r = await fetch(e.request);
        // SÓ RESPOSTA BOA VIRA RESERVA: guardando qualquer coisa, um 404 ou
        // 500 de passagem virava a página que o offline serve depois.
        if (r.ok) {
          const c = await caches.open(CACHE);
          c.put(e.request, r.clone());
        }
        return r;
      } catch {
        return (await caches.match(e.request)) || Response.error();
      }
    })());
    return;
  }

  // Regra 1: imutáveis vêm do disco; a rede só na primeira vez.
  if (IMUTAVEL.test(url.href)) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(e.request);
      if (hit) return hit;
      const r = await fetch(e.request);
      if (r.ok) {
        c.put(e.request, r.clone());
        // Poda: mantém o cache pequeno sem gerenciar versões à mão.
        const chaves = await c.keys();
        if (chaves.length > 60) await c.delete(chaves[0]);
      }
      return r;
    })());
  }
});
