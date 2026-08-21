// ============================================================================
// painel-backup — backup do Hub inteiro (substitui backup.js)
//
// O painel e a capa, entao e ele quem orquestra: guarda o proprio dado E PUXA
// os outros sistemas pelos endpoints que eles ja tem ({action:"list"} paginado
// + getCfg). Registry em SISTEMAS_BACKUP (secret, JSON):
//   [{key,nome,url,fn,listKey,token}]
// Na transicao o secret aponta para os endpoints NOVOS (Edge Functions); o
// painel antigo no Netlify segue fazendo o backup dele em paralelo — dois
// backups por dia nao machucam ninguem.
//
// Destino: repositorio privado no GitHub (GITHUB_REPO), uma pasta por sistema,
// um arquivo por dia (versionado). GITHUB_TOKEN e um PAT restrito a esse repo.
//
// DISPARO: pg_cron diario chama {action:"auto"} com o x-token. No Netlify o
// gatilho era piggyback no login, porque o cron de la ja congelou 11 horas; o
// pg_cron daqui tem execucao comprovada, entao o agendamento volta a ser o
// caminho normal. A trava e por dia: rodar duas vezes no mesmo dia nao repete.
//
// Acoes: status (qualquer sessao) | auto (x-token, um por dia) |
//        exportar / registrarManual / backupAgora / restaurar (so a direcao).
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verificarJwt, crachaRevogado } from "../_shared/cripto.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET = Deno.env.get("PAINEL_JWT_SECRET") ?? "";
const TOKEN = Deno.env.get("PAINEL_TOKEN") ?? "";
const GH_TOKEN = Deno.env.get("GITHUB_TOKEN") ?? "";
const GH_REPO = Deno.env.get("GITHUB_REPO") ?? "";
const VERSAO = 2; // v2: formato do Supabase (colecoes em vez de chaves de blob)

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resposta = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

// O "dia" do backup e o dia de QUEM TRABALHA aqui, nao o de Greenwich. Com o
// dia em UTC, tudo que a equipe faz depois das 21h (00h em Londres) ja cai no
// arquivo do dia seguinte -- e a rodada da manha, vendo o mesmo dia UTC, pula.
// Uma pasta por dia so faz sentido se o dia for o de Montes Claros.
const diaSP = (d: Date | string = new Date()): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" })
    .format(typeof d === "string" ? new Date(d) : d);

// ---------------------------------------------------------------- leitura local

/* QUAIS COLECOES EXISTEM DE VERDADE NO BANCO.
 *
 * Serve para o backup conferir a si mesmo. Ja aconteceu DUAS vezes de uma
 * colecao nova nascer e nao entrar aqui: `assinaturas` ficou um dia fora (a
 * auditoria pegou) e `permutas` passou meses -- em 19/08/2026 fui procurar um
 * dado de permuta no backup, nao achei nada, e quase conclui que a gravacao
 * estava falhando. Ausencia de copia parece ausencia de dado.
 *
 * Lista a mao envelhece calada. Perguntar ao banco, nao.
 */
async function colecoesNoBanco(): Promise<string[]> {
  const vistas = new Set<string>();
  const PASSO = 1000;
  for (let de = 0; ; de += PASSO) {
    const { data, error } = await sb.from("painel_registros").select("colecao")
      .order("colecao").range(de, de + PASSO - 1);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) vistas.add(String(r.colecao));
    if ((data ?? []).length < PASSO) break;
  }
  return [...vistas].sort();
}

async function linhasDe(colecao: string): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const PASSO = 1000;
  for (let de = 0; ; de += PASSO) {
    const { data, error } = await sb.from("painel_registros").select("id, registro")
      .eq("colecao", colecao).order("id").range(de, de + PASSO - 1);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) out[r.id] = r.registro;
    if ((data ?? []).length < PASSO) break;
  }
  return out;
}

async function montarBackupPainel() {
  const { data: cfg } = await sb.from("painel_config_global").select("config").eq("id", true).maybeSingle();
  const { data: contasRaw, error } = await sb.from("painel_contas").select("*");
  if (error) throw new Error(error.message);
  const contas: Record<string, unknown> = {};
  for (const c of contasRaw ?? []) {
    // COM hash/salt de proposito: e o que permite restaurar sem todo mundo
    // recriar senha. O repositorio do backup e privado.
    contas[c.usuario] = {
      usuario: c.usuario, nome: c.nome, permissoes: c.permissoes,
      vendedorId: c.vendedor_id, hash: c.hash, salt: c.salt, iter: c.iter,
      atualizadoEm: c.atualizado_em,
    };
  }
  /* AS COLECOES SAEM DO BANCO, nao de uma lista aqui.
   *
   * Esta lista era escrita a mao, e TRES vezes uma colecao nova nasceu fora
   * dela: `assinaturas` ficou um dia fora (a auditoria pegou), `permutas`
   * passou MESES -- em 19/08/2026 fui procurar um dado de permuta no backup e
   * nao achei nada, quase concluindo que a gravacao estava falhando --, e
   * `campanhas` nasceu fora ontem, com o Leo ja usando a tela.
   *
   * Ausencia de copia parece ausencia de dado, e a lista a mao envelhece
   * calada: quem cria a colecao esta pensando na tela, nao no backup, e nada
   * falha enquanto ninguem precisa restaurar. A funcao `colecoesNoBanco()`
   * logo acima ja existia para o backup se CONFERIR -- ela passa a ser tambem
   * a fonte do que copiar, e a conferencia vira redundancia de verdade em vez
   * de duas listas com o mesmo defeito.
   *
   * Os dois apelidos existem porque o nome no backup nunca foi igual ao do
   * banco (`ativo` -> `ativos`), e mudar isso agora quebraria a restauracao
   * dos arquivos que ja estao la.
   */
  const APELIDO: Record<string, string> = { ativo: "ativos", arquivo: "arquivosMeta" };
  const painel: Record<string, unknown> = {
    // `config` nao mora em painel_registros; entra a parte.
    config: cfg?.config ?? null,
  };
  for (const colecao of await colecoesNoBanco()) {
    const nome = APELIDO[colecao] ?? colecao;
    // Uma colecao chamada "config" no banco sobrescreveria a configuracao
    // global. Nao existe hoje; se um dia existir, o backup avisa em vez de
    // trocar uma coisa pela outra em silencio.
    if (nome === "config") throw new Error('colecao "config" colide com a configuracao global do painel');
    painel[nome] = await linhasDe(colecao);
  }
  // Os BYTES dos arquivos ficam no bucket (duraveis); um backup diario deles
  // incharia o repositorio. Mesma decisao do original com as fotos.

  return {
    versao: VERSAO,
    sistema: "painel",
    exportadoEm: new Date().toISOString(),
    painel,
    contas,
  };
}

// ---------------------------------------------------------------- sistemas externos

function sistemasExternos(): any[] {
  // Duas fontes, somadas. SISTEMAS_BACKUP é o registry histórico (um JSON com
  // TODOS os sistemas e seus tokens); SISTEMAS_BACKUP_EXTRA existe para
  // ACRESCENTAR um sistema novo sem reescrever aquele blob.
  //
  // Por que isso importa: a Management API devolve o valor dos secrets
  // MASCARADO. Para incluir o Compras (03/08/2026) seria preciso reescrever o
  // registry inteiro de memória — e um token digitado errado derrubaria em
  // silêncio o backup de outro sistema. Somar é aditivo e reversível: apagar o
  // EXTRA volta ao estado anterior sem tocar no que já funciona.
  const ler = (nome: string): any[] => {
    try {
      const v = JSON.parse(Deno.env.get(nome) ?? "[]");
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };
  const base = ler("SISTEMAS_BACKUP");
  // Generalização (03/08/2026, entrada do Pops): TODO secret cujo nome começa
  // com SISTEMAS_BACKUP_ soma ao registry — cada sistema novo ganha o seu
  // (SISTEMAS_BACKUP_EXTRA, SISTEMAS_BACKUP_POPS, ...) sem reescrever nem
  // arriscar o token de ninguém. Ordem alfabética para o "quem manda" ser
  // determinístico; chave repetida: o último (mais específico) vence.
  const extras = Object.keys(Deno.env.toObject())
    .filter((n) => n.startsWith("SISTEMAS_BACKUP_"))
    .sort()
    .flatMap((n) => ler(n));
  const porChave = new Map<string, any>();
  let ignorados = 0;
  for (const s of [...base, ...extras]) {
    if (s && s.key) porChave.set(s.key, s);
    else ignorados++;
  }
  // Entrada sem `key` era descartada calada -- um JSON digitado errado fazia um
  // sistema inteiro sumir do backup e nada mudava na tela.
  if (ignorados) console.error(`[painel-backup] ${ignorados} entrada(s) do registry sem "key" — sistema fora do backup`);
  return [...porChave.values()];
}

async function chamarSistema(sys: any, body: unknown) {
  // url completa no registry (as Edge Functions nao tem o caminho
  // /.netlify/functions/, entao o registry traz o endpoint inteiro em `url`
  // quando `fn` estiver vazio).
  const alvo = sys.fn ? `${sys.url}/.netlify/functions/${sys.fn}` : sys.url;
  // TETO DE TEMPO POR CHAMADA. Sem ele, um sistema pendurado segurava a corrida
  // inteira ate a function morrer -- e os outros cinco ficavam sem backup
  // naquele dia, sem nada dizendo por que.
  const r = await fetch(alvo, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-token": sys.token },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw new Error(`${sys.key}: HTTP ${r.status}`);
  return r.json();
}

async function puxarSistema(sys: any) {
  const registros: unknown[] = [];
  let after: unknown = null;
  let truncado = false;
  let guarda = 0;
  for (; guarda < 300; guarda++) {
    const res = await chamarSistema(sys, after != null ? { action: "list", after } : { action: "list" });
    registros.push(...(res[sys.listKey] || res.registros || res.os || res.itens || []));
    after = res.nextAfter ?? null;
    if (after == null) break;
  }
  // Bateu no teto de paginas e ainda havia mais: o backup esta INCOMPLETO.
  // Antes isso saia como um backup normal -- e so no dia de precisar dele
  // alguem descobriria que faltava metade.
  if (after != null) truncado = true;
  let cfg = null;
  try {
    cfg = (await chamarSistema(sys, { action: "getCfg" })).cfg ?? null;
  } catch { /* nem todo sistema tem getCfg */ }
  return {
    versao: VERSAO, sistema: sys.key, nome: sys.nome,
    exportadoEm: new Date().toISOString(), registros, cfg,
    fotos: "nao incluidas neste backup",
    ...(truncado ? { incompleto: true, motivo: `parou em ${guarda} paginas` } : {}),
  };
}

// ---------------------------------------------------------------- github

async function enviarParaGithub(chaveSistema: string, backup: any) {
  if (!GH_TOKEN || !GH_REPO) return { ok: false, motivo: "GitHub nao configurado (falta GITHUB_TOKEN/GITHUB_REPO)" };
  const dia = diaSP(backup.exportadoEm);
  const caminho = `${chaveSistema}/${dia}.json`;
  // base64 em BLOCOS: espalhar um array grande em String.fromCharCode(...)
  // estoura a pilha -- e um backup de sistema (RH ~900 KB) e grande.
  const bytes = new TextEncoder().encode(JSON.stringify(backup));
  let bin = "";
  const BLOCO = 0x8000;
  for (let i = 0; i < bytes.length; i += BLOCO) {
    bin += String.fromCharCode(...bytes.subarray(i, i + BLOCO));
  }
  const conteudo = btoa(bin);
  const url = `https://api.github.com/repos/${GH_REPO}/contents/${caminho}`;
  const cab = {
    Authorization: `Bearer ${GH_TOKEN}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "impresilk-painel-backup",
  };
  let sha: string | undefined;
  try {
    const r = await fetch(url, { headers: cab });
    if (r.ok) sha = (await r.json()).sha;
  } catch { /* arquivo novo */ }
  const r = await fetch(url, {
    method: "PUT",
    headers: cab,
    body: JSON.stringify({
      message: `backup ${chaveSistema} ${backup.exportadoEm}`,
      content: conteudo,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    return { ok: false, motivo: `GitHub ${r.status}: ${t.slice(0, 100)}` };
  }
  return { ok: true, caminho };
}

// ---------------------------------------------------------------- hub

async function lerStatus() {
  const { data } = await sb.from("painel_meta").select("valor").eq("chave", "backup_status").maybeSingle();
  return data?.valor ?? null;
}
async function gravarStatus(st: unknown) {
  // try/await, e nao .catch(): o query builder do supabase-js e "thenable" mas
  // NAO tem .catch proprio -- chamar .catch nele lanca TypeError e derruba o
  // backup INTEIRO depois de ele ja ter rodado (erro real, pago aqui).
  try {
    await sb.from("painel_meta").upsert(
      { chave: "backup_status", valor: st, atualizado_em: new Date().toISOString() },
      { onConflict: "chave" });
  } catch { /* status e best-effort */ }
}

async function backupDoHub() {
  const porSistema: Record<string, unknown> = {};
  const agora = new Date().toISOString();

  // 1) o proprio painel. Cada sistema falha sozinho.
  try {
    const bkp = await montarBackupPainel();
    /* Confere o backup contra o banco ANTES de reportar sucesso: um backup que
       nao copiou tudo nao e um backup bom com um detalhe, e a diferenca precisa
       aparecer para alguem. `config` nao mora em painel_registros, entao nao
       entra na comparacao. */
    const copiadas = new Set(Object.keys(bkp.painel));
    const naoCopiadas = (await colecoesNoBanco()).filter((c) => {
      // os nomes no backup nem sempre sao iguais aos do banco (ativo -> ativos,
      // arquivo -> arquivosMeta): confere pelos dois jeitos.
      return !copiadas.has(c) && !copiadas.has(`${c}s`) && !copiadas.has(`${c}sMeta`);
    });
    const gh = await enviarParaGithub("painel", bkp);
    porSistema.painel = {
      em: agora, ok: gh.ok,
      // Conta TUDO o que foi salvo. Ficou parado nas quatro colecoes originais
      // enquanto o backup ja levava mais quatro: a direcao abria a tela, via
      // "132 registros" e nao tinha como saber se as abas novas entraram.
      /* Contagem DERIVADA do que foi salvo, nao de uma lista a mao. A lista
         anterior ficou parada nas quatro colecoes originais enquanto o backup
         ja levava mais quatro, e a direcao via "132 registros" sem ter como
         saber se as abas novas entraram. Colecao nova agora entra na conta
         sozinha. */
      registros:
        Object.entries(bkp.painel)
          /* `config` e um objeto de AJUSTES, nao uma colecao de registros:
             contar as chaves dele inflava o total em 7 (8 chaves no lugar de
             1). O numero na tela diz "reg." e precisa querer dizer isso. */
          .reduce((n, [k, v]) => n + (k === "config" ? (v ? 1 : 0)
            : (v && typeof v === "object" ? Object.keys(v).length : 0)), 0) +
        Object.keys(bkp.contas).length,
      /* O que existe no banco e o backup NAO copiou. Vazio e o esperado; com
         algo dentro, a tela de backup tem o que mostrar antes de virar perda. */
      colecoesForaDoBackup: naoCopiadas,
      /* O QUE TEM DENTRO, colecao por colecao. Nasceu de um pedido direto: o
         Leonardo olhou "Painel de Gestao - 323 reg." e pediu para "adicionar
         permuta aqui" -- ela ja estava sendo salva desde a versao anterior, mas
         a tela nao tinha como provar. Numero total exige confianca; a lista
         mostra. E e ela que responde "as permutas estao no backup?" sem
         ninguem precisar abrir o arquivo no GitHub. */
      porColecao: Object.fromEntries(
        Object.entries(bkp.painel)
          .map(([k, v]) => [k, v && typeof v === "object" ? Object.keys(v).length : 0])
          .sort((a, b) => String(a[0]).localeCompare(String(b[0]), "pt-BR")),
      ),
      erro: gh.ok ? null : (gh as any).motivo,
    };
  } catch (e) {
    porSistema.painel = { em: agora, ok: false, erro: (e as Error)?.message ?? String(e) };
  }

  // 2) os outros, puxados por HTTP.
  for (const sys of sistemasExternos()) {
    try {
      const bkp = await puxarSistema(sys);
      const gh = await enviarParaGithub(sys.key, bkp);
      porSistema[sys.key] = {
        nome: sys.nome, em: agora, ok: gh.ok,
        registros: bkp.registros.length,
        erro: gh.ok ? null : (gh as any).motivo,
      };
    } catch (e) {
      porSistema[sys.key] = { nome: sys.nome, em: agora, ok: false, erro: (e as Error)?.message ?? String(e) };
    }
  }

  await gravarStatus({ atualizadoEm: agora, dia: diaSP(agora), sistemas: porSistema });
  return porSistema;
}

// ---------------------------------------------------------------- handler

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resposta({ erro: "use POST" }, 405);

  let corpo: any = {};
  try {
    corpo = await req.json();
  } catch {
    return resposta({ erro: "json invalido" }, 400);
  }

  // status: leitura leve (data/hora e ok por sistema). EXIGE SESSAO -- o
  // cabecalho desta function sempre disse "status (qualquer sessao)", mas a
  // trava nunca tinha sido escrita: qualquer um na internet recebia o
  // inventario do Hub (quais sistemas existem, o nome e QUANTOS REGISTROS cada
  // um tem). Isso e mapa da empresa para quem quiser atacar. O front ja mandava
  // o cracha; so faltava conferir.
  if (corpo.action === "status") {
    const m = String(req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
    const s = m && JWT_SECRET ? await verificarJwt(m[1], JWT_SECRET) : null;
    /* CRACHA VALIDO NAO E CRACHA QUE AINDA VALE. Esta era a unica porta do
       Painel que conferia a assinatura e nao perguntava se o acesso foi
       revogado -- as outras quatro (dados, gestao, config, ativos) perguntam.
       O cracha do Painel dura 12h: alguem desligado de manha seguia lendo o
       status do backup ate a tarde, e o backup diz o que a casa guarda e onde. */
    if (s && await crachaRevogado(sb, "painel", s)) {
      return resposta({ erro: "Seu acesso foi encerrado.", semSessao: true }, 401);
    }
    if (!s) return resposta({ erro: "Entre no sistema.", semSessao: true }, 401);
    return resposta({ ok: true, status: await lerStatus() });
  }

  // sistemas: diagnostico read-only -- QUAIS sistemas este backup enxerga hoje.
  // Existe porque a Management API devolve os secrets MASCARADOS: sem isto, a
  // unica forma de saber se um sistema novo entrou no registry era esperar a
  // rodada da noite e ver se a pasta apareceu. Nao devolve token nenhum.
  if (corpo.action === "sistemas") {
    if (!TOKEN || req.headers.get("x-token") !== TOKEN) return resposta({ erro: "nao autorizado" }, 401);
    const vistos = sistemasExternos().map((s: any) => ({
      key: s.key, nome: s.nome ?? null, listKey: s.listKey ?? null,
      url: s.fn ? `${s.url}/.netlify/functions/${s.fn}` : s.url,
      temToken: !!s.token,
    }));
    return resposta({ ok: true, quantos: vistos.length, sistemas: vistos });
  }

  // auto: disparo interno (pg_cron) com o token do servidor.
  //
  // A trava e por DIA, nao por horas. Com "20 horas" um backup manual no meio
  // da tarde empurrava o automatico do dia seguinte para fora da janela: em
  // 03/08 alguem rodou as 16h58, o cron das 08h40 do dia 04 viu 15h42 e pulou
  // -- resultado, 40 horas sem backup e um "200 ok" que parecia sucesso.
  //
  // Um dia = um arquivo (<sistema>/<AAAA-MM-DD>.json), entao a pergunta certa
  // e "ja existe o backup de hoje?". Se a ultima rodada do dia teve sistema com
  // erro, deixa tentar de novo em vez de dar o dia por encerrado.
  if (corpo.action === "auto") {
    if (!TOKEN || req.headers.get("x-token") !== TOKEN) return resposta({ erro: "nao autorizado" }, 401);
    const st: any = await lerStatus();
    // Mesmo calendario do nome do arquivo (America/Sao_Paulo): senao a trava
    // fala de um dia e a pasta de outro. `st.dia` e gravado a partir de agosto
    // de 2026; status antigo cai no calculo pelo carimbo de hora.
    const hoje = diaSP();
    const diaDoUltimo = st?.dia ?? (st?.atualizadoEm ? diaSP(String(st.atualizadoEm)) : null);
    const sistemas = st?.sistemas ?? {};
    const todosOk =
      Object.keys(sistemas).length > 0 && Object.values(sistemas).every((s: any) => s?.ok);
    /* `forcar` refaz o backup do dia mesmo com um ja pronto.
       Existe porque a trava por dia, sozinha, deixa um conserto sem efeito ate
       o dia seguinte: hoje o backup rodou de manha SEM a colecao `campanhas`
       (a lista de colecoes era escrita a mao e ela nasceu fora), e depois de
       corrigir nao havia como refazer o arquivo -- so apagando o do dia, que e
       destrutivo, ou esperando. O dia inteiro de dado novo ficaria sem copia.
       Mesmo token da chamada normal: nao abre porta nova, so tira a trava que
       protege contra repeticao inutil, nao contra repeticao PEDIDA. */
    if (diaDoUltimo === hoje && todosOk && corpo.forcar !== true) {
      return resposta({ ok: true, pulou: "ja tem backup de hoje" });
    }
    return resposta({ ok: true, sistemas: await backupDoHub() });
  }

  // Daqui para baixo, so a direcao.
  if (!JWT_SECRET) return resposta({ erro: "Login nao configurado." }, 503);
  const m = String(req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  const s = m ? await verificarJwt(m[1], JWT_SECRET) : null;
  if (!s) return resposta({ erro: "Entre no sistema." }, 401);
  if (s.master !== true) return resposta({ erro: "Apenas a direcao pode fazer backup." }, 403);

  try {
    switch (corpo.action) {
      case "exportar":
        return resposta({ ok: true, backup: await montarBackupPainel() });

      case "registrarManual": {
        const st: any = (await lerStatus()) ?? { sistemas: {} };
        st.atualizadoEm = new Date().toISOString();
        // De proposito NAO mexe em st.dia: baixar o arquivo no computador nao
        // e o backup do dia na nuvem, e nao pode fazer a rodada automatica
        // achar que o dia ja esta resolvido.
        st.sistemas = st.sistemas ?? {};
        st.sistemas.painel = { em: st.atualizadoEm, ok: true, destino: "Baixado no computador" };
        await gravarStatus(st);
        return resposta({ ok: true });
      }

      case "backupAgora":
        return resposta({ ok: true, sistemas: await backupDoHub() });

      case "restaurar": {
        const bk = corpo.backup;
        if (!bk || bk.sistema !== "painel") {
          return resposta({ erro: "Arquivo de backup invalido (so restauro o painel por aqui)." }, 400);
        }
        let gravou = 0;

        // v2 (formato do Supabase) e v1 (formato do Blobs) sao aceitos: o
        // backup de ontem nao vira lixo por causa da migracao.
        const p = bk.painel ?? {};
        const cfg = p.config ?? (bk.versao === 1 ? p.config : null);
        if (cfg) {
          await sb.from("painel_config_global").upsert(
            { id: true, config: cfg, atualizado_em: new Date().toISOString() }, { onConflict: "id" });
          gravou++;
        }
        const mapas: Array<[string, Record<string, unknown>]> = [];
        if (bk.versao >= 2) {
          mapas.push(["ov_rec", p.ov_rec ?? {}], ["ov_orc", p.ov_orc ?? {}],
                     ["ativo", p.ativos ?? {}], ["arquivo", p.arquivosMeta ?? {}]);
          // Backups de antes destas abas nao tem as chaves; nada a restaurar.
          if (p.marketing) mapas.push(["marketing", p.marketing]);
          if (p.bancos) mapas.push(["bancos", p.bancos]);
          if (p.glossario) mapas.push(["glossario", p.glossario]);
          if (p.compromissos) mapas.push(["compromissos", p.compromissos]);
          if (p.manutencoes) mapas.push(["manutencoes", p.manutencoes]);
          if (p.patrimonio) mapas.push(["patrimonio", p.patrimonio]);
          if (p.setores) mapas.push(["setores", p.setores]);
          if (p.assinaturas) mapas.push(["assinaturas", p.assinaturas]);
        } else {
          // v1: chaves de blob (ov_rec/ov_orc mapas; ativo_<id> soltos)
          mapas.push(["ov_rec", p.ov_rec ?? {}], ["ov_orc", p.ov_orc ?? {}]);
          const ativos: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(p)) {
            if (k.startsWith("ativo_") && v) ativos[k.slice(6)] = v;
          }
          mapas.push(["ativo", ativos]);
        }
        for (const [colecao, mapa] of mapas) {
          for (const [id, registro] of Object.entries(mapa)) {
            if (registro == null) continue;
            await sb.from("painel_registros").upsert(
              { colecao, id, registro, atualizado_em: new Date().toISOString() },
              { onConflict: "colecao,id" });
            gravou++;
          }
        }
        // Quem NAO existe mais hoje volta a existir -- e isso e o certo num
        // restauro de verdade (o caso ruim e a tabela ter sido apagada). O que
        // nao pode e voltar CALADO: quem foi desligado depois do backup entra
        // de novo com a senha e as permissoes antigas. Entao avisa quem voltou.
        const { data: hojeRaw } = await sb.from("painel_contas").select("usuario");
        const existiam = new Set((hojeRaw ?? []).map((c: any) => c.usuario));
        const ressuscitadas: string[] = [];
        let contas = 0;
        for (const [u, c] of Object.entries(bk.contas ?? {}) as [string, any][]) {
          if (!c?.hash) continue;
          const usuario = c.usuario ?? u;
          if (!existiam.has(usuario)) ressuscitadas.push(c.nome || usuario);
          await sb.from("painel_contas").upsert({
            usuario, nome: c.nome ?? u,
            permissoes: c.permissoes ?? [], vendedor_id: c.vendedorId ?? "",
            hash: c.hash, salt: c.salt, iter: c.iter ?? 120000,
            atualizado_em: new Date().toISOString(),
          }, { onConflict: "usuario" });
          contas++;
        }
        return resposta({ ok: true, gravou, contas, ressuscitadas });
      }

      default:
        return resposta({ erro: "acao desconhecida" }, 400);
    }
  } catch (e) {
    console.error("[painel-backup] erro:", e);
    return resposta({ erro: "erro interno no backup" }, 500);
  }
});
