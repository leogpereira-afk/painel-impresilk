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

import {capturarArquivos,prepararArquivos} from "../_shared/arquivos-backup.ts";
import {buscarComRetentativa} from "../_shared/repetir-http.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET = Deno.env.get("PAINEL_JWT_SECRET") ?? "";
const TOKEN = Deno.env.get("PAINEL_TOKEN") ?? "";
const GH_TOKEN = Deno.env.get("GITHUB_TOKEN") ?? "";
const GH_REPO = Deno.env.get("GITHUB_REPO") ?? "";
const VERSAO = 3; // v3: arquivos com checksum e recuperação verificada

/* As tabelas da tela de Gestao. Ficam FORA de painel_registros (sao tabelas
   com colunas, nao registros jsonb), entao a varredura de colecoes nao as
   alcanca -- e por isso elas estavam fora do backup inteiro. */
/* A REGUA DA CONTAGEM. `config` conta 1 (e um objeto de ajustes, nao uma
   colecao); o resto conta as chaves. Usada no total E na lista por colecao --
   duas reguas para o mesmo numero e sempre uma soma que nao fecha. */
const contarRegistros = (chave: string, v: unknown) =>
  chave === "config" ? (v ? 1 : 0) : (v && typeof v === "object" ? Object.keys(v as object).length : 0);

const TABELAS_GESTAO = [
  "gestao_empresa", "gestao_identidade", "gestao_valor", "gestao_plano_ano",
  "gestao_objetivo", "gestao_indicador", "gestao_tatica", "gestao_reuniao",
  "gestao_decisao", "gestao_ciclo_fechamento", "gestao_preferencia_ui",
];

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
  const { data: cfg, error: erroConfig } = await sb.from("painel_config_global").select("config").eq("id", true).maybeSingle();
  if (erroConfig) throw new Error(erroConfig.message);
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
  /* A GESTAO NAO MORA EM painel_registros. Identidade, valores, objetivos,
     indicadores, taticas, reunioes, decisoes, plano do ano e o fechamento do
     ciclo sao TABELAS proprias (gestao_*) -- e nenhuma delas entrava no
     backup: a mesma armadilha da lista escrita a mao, um andar acima. Hoje sao
     poucas linhas (a tela e nova); e justamente por isso o conserto e agora,
     antes de a direcao encher a tela e o backup so parecer completo. */
  const gestao: Record<string, unknown> = {};
  for (const t of TABELAS_GESTAO) {
    const { data, error } = await sb.from(t).select("*");
    // Sem engolir: backup que copia "quase tudo" e o pior dos mundos, porque
    // ninguem descobre ate precisar restaurar.
    if (error) throw new Error(`${t}: ${error.message}`);
    gestao[t] = data ?? [];
  }
  painel.gestao = gestao;

  const arquivos = await capturarArquivos(sb.storage.from("painel-arquivos"));

  return {
    versao: VERSAO,
    sistema: "painel",
    exportadoEm: new Date().toISOString(),
    painel,
    contas,
    arquivos,
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
  const r = await buscarComRetentativa(alvo, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-token": sys.token },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw new Error(`${sys.key}: HTTP ${r.status}`);
  const dados = await r.json();
  if(dados?.erro || dados?.error || dados?.ok===false) throw new Error(`${sys.key}: ${dados.erro || dados.error || "leitura recusada"}`);
  return dados;
}

async function puxarSistema(sys: any) {
  const registros: unknown[] = [];
  let after: unknown = null;
  let guarda = 0;
  for (; guarda < 300; guarda++) {
    const res = await chamarSistema(sys, after != null ? { action: "list", after } : { action: "list" });
    const itens = res[sys.listKey] || res.registros || res.os || res.itens;
    if(!Array.isArray(itens)) throw new Error(`${sys.key}: resposta sem coleção de registros`);
    registros.push(...itens);
    after = res.nextAfter ?? null;
    if (after == null) break;
  }
  // Bateu no teto de paginas e ainda havia mais: o backup esta INCOMPLETO.
  // Antes isso saia como um backup normal -- e so no dia de precisar dele
  // alguem descobriria que faltava metade.
  if (after != null) throw new Error("Backup incompleto: limite de páginas atingido.");
  let cfg = null;
  try {
    cfg = (await chamarSistema(sys, { action: "getCfg" })).cfg ?? null;
  } catch(e) { if(!/HTTP 400|a[cç][aã]o desconhecida|unknown action/i.test(String((e as Error).message))) throw e; }
  return {
    versao: VERSAO, sistema: sys.key, nome: sys.nome,
    exportadoEm: new Date().toISOString(), registros, cfg,
    fotos: "nao incluidas neste backup",
  };
}

// ---------------------------------------------------------------- github

async function enviarParaGithub(chaveSistema: string, backup: any) {
  if (!GH_TOKEN || !GH_REPO) return { ok: false, motivo: "GitHub nao configurado (falta GITHUB_TOKEN/GITHUB_REPO)" };
  if(GH_REPO !== 'leogpereira-afk/backups-impresilk') throw new Error('Destino de backup diferente do repositório privado aprovado.');
  const destino=await buscarComRetentativa(`https://api.github.com/repos/${GH_REPO}`,{headers:{Authorization:`Bearer ${GH_TOKEN}`,Accept:'application/vnd.github+json','User-Agent':'impresilk-painel-backup'}});
  if(!destino.ok || (await destino.json()).private !== true) throw new Error('Não foi possível confirmar que o repositório de backup é privado.');
  if(chaveSistema==='painel' && backup.arquivos?.length) {
    const manifesto=[];
    for(const arquivo of backup.arquivos) {
      const caminhoArquivo=`arquivos/painel/${arquivo.sha256}`;
      const urlArquivo=`https://api.github.com/repos/${GH_REPO}/contents/${caminhoArquivo}`;
      const headers={Authorization:`Bearer ${GH_TOKEN}`,Accept:'application/vnd.github+json','User-Agent':'impresilk-painel-backup'};
      const existe=await buscarComRetentativa(urlArquivo,{headers});
      if(existe.status===404){
        const enviado=await buscarComRetentativa(urlArquivo,{method:'PUT',headers,body:JSON.stringify({message:'backup de arquivo do painel',content:arquivo.base64})});
        if(!enviado.ok) throw new Error('Falha ao guardar arquivo no repositório privado: '+enviado.status);
      } else if(!existe.ok) throw new Error('Falha ao conferir cópia do arquivo: '+existe.status);
      const {base64:conteudo,...metadados}=arquivo;
      manifesto.push(metadados);
    }
    backup={...backup,arquivos:manifesto};
  }
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
    const r = await buscarComRetentativa(url, { headers: cab });
    if (r.ok) sha = (await r.json()).sha;
  } catch { /* arquivo novo */ }
  const r = await buscarComRetentativa(url, {
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
  const {data,error}=await sb.from("painel_meta").select("valor").eq("chave","backup_status").maybeSingle();
  if(error) throw new Error('Não foi possível consultar o estado do backup.');
  return data?.valor ?? null;
}
async function gravarStatus(st: unknown) {
  const {error}=await sb.rpc("painel_backup_estado",{p_patch:st});
  if(error) throw new Error('A cópia foi tentada, mas seu resultado não pôde ser registrado.');
}

async function backupDoHub(somente?: string) {
  const operacao=crypto.randomUUID();
  const {data:reservou,error}=await sb.rpc("painel_backup_reservar",{p_operacao:operacao});
  if(error) throw new Error("Não foi possível iniciar o backup com segurança.");
  if(!reservou) throw new Error("Um backup já está em andamento. Aguarde a conclusão.");
  try {return await executarBackupHub(somente);}
  finally {
    const {error}=await sb.from("painel_meta").delete().eq("chave","backup_operacao").eq("valor->>operacao",operacao);
    if(error) console.error("[painel-backup] A reserva será liberada automaticamente.");
  }
}
async function executarBackupHub(somente?: string) {
  const anterior = await lerStatus();
  const porSistema: Record<string, any> = {...(anterior?.sistemas || {})};
  const chaves=['painel','fortemais',...sistemasExternos().map(s=>s.key)];
  if(somente && !chaves.includes(somente)) throw new Error('Sistema não cadastrado no backup.');
  const executar = (chave:string) => !somente || somente===chave;

  const agora = new Date().toISOString();
  const confirmar = async(chave:string) => {
    const valor=porSistema[chave];
    valor.ultimoValido=valor.ok?valor.em:anterior?.sistemas?.[chave]?.ultimoValido || (anterior?.sistemas?.[chave]?.ok?anterior.sistemas[chave].em:null);
    await gravarStatus({atualizadoEm:agora,sistemas:{[chave]:valor}});
  };

  // 1) o próprio painel. Cada sistema falha sozinho.
  if(executar("painel")) { try {
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
    if(naoCopiadas.length) throw new Error('Há coleções fora da cópia.');
    const gh = await enviarParaGithub("painel", bkp);
    porSistema.painel = {
      em: agora, ok: gh.ok, arquivos: bkp.arquivos.length, bytesArquivos: bkp.arquivos.reduce((n,a)=>n+a.bytes,0),
      // Conta TUDO o que foi salvo. Ficou parado nas quatro colecoes originais
      // enquanto o backup ja levava mais quatro: a direcao abria a tela, via
      // "132 registros" e nao tinha como saber se as abas novas entraram.
      /* Contagem DERIVADA do que foi salvo, nao de uma lista a mao. A lista
         anterior ficou parada nas quatro colecoes originais enquanto o backup
         ja levava mais quatro, e a direcao via "132 registros" sem ter como
         saber se as abas novas entraram. Colecao nova agora entra na conta
         sozinha. */
      /* UMA REGUA SO, usada no total e na lista. `config` e um objeto de
         AJUSTES, nao uma colecao de registros: contar as chaves dele inflava
         em 7 (8 no lugar de 1). O total ja tinha o conserto; a lista logo
         abaixo continuava com a regua antiga, entao as duas nao fechavam --
         e `contas` nem aparecia nela. */
      registros:
        Object.entries(bkp.painel).reduce((n, [k, v]) => n + contarRegistros(k, v), 0) +
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
        [...Object.entries(bkp.painel).map(([k, v]) => [k, contarRegistros(k, v)] as [string, number]),
         ["contas", Object.keys(bkp.contas).length] as [string, number]]
          .sort((a, b) => String(a[0]).localeCompare(String(b[0]), "pt-BR")),
      ),
      erro: gh.ok ? null : (gh as any).motivo,
    };
  } catch (e) {
    porSistema.painel = { em: agora, ok: false, erro: (e as Error)?.message ?? String(e) };
  }

    await confirmar("painel");
  }

  // 1b) o FORTEMAIS (obras do Léo). Mora NESTE mesmo banco — as fichas na
  // leo_estado (só a coleção `obras`; o resto da Central é vida pessoal e não
  // pertence ao backup da empresa) e o livro-caixa na leo_obra_custos. Por
  // isso entra como interno: sem HTTP, sem token, sem o que expirar.
  if(executar("fortemais")) { try {
    const registros: any[] = [];
    const { data: est, error: e1 } = await sb.from("leo_estado")
      .select("dados").eq("id", true).maybeSingle();
    if (e1) throw new Error("leo_estado: " + e1.message);
    for (const o of ((est?.dados as any)?.obras ?? [])) registros.push({ _col: "obras", ...o });
    let de = 0;
    for (;;) {
      const { data: cus, error: e2 } = await sb.from("leo_obra_custos")
        .select("*").order("id").range(de, de + 999);
      if (e2) throw new Error("leo_obra_custos: " + e2.message);
      for (const c of (cus ?? [])) registros.push({ _col: "custos", ...c });
      if (!cus || cus.length < 1000) break;
      de += 1000;
    }
    const bkp = {
      versao: VERSAO, sistema: "fortemais", nome: "Fortemais (obras)",
      exportadoEm: agora, registros, cfg: null,
      fotos: "nao incluidas neste backup",
    };
    const gh = await enviarParaGithub("fortemais", bkp);
    porSistema.fortemais = {
      nome: "Fortemais (obras)", em: agora, ok: gh.ok,
      registros: registros.length,
      porColecao: {
        obras: registros.filter((r) => r._col === "obras").length,
        custos: registros.filter((r) => r._col === "custos").length,
      },
      erro: gh.ok ? null : (gh as any).motivo,
    };
  } catch (e) {
    porSistema.fortemais = { nome: "Fortemais (obras)", em: agora, ok: false, erro: (e as Error)?.message ?? String(e) };
  }

    await confirmar("fortemais");
  }

  // 2) os outros, puxados por HTTP.
  for (const sys of sistemasExternos()) {
    if(!executar(sys.key)) continue;
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
    await confirmar(sys.key);
  }

  for(const [chave,valor] of Object.entries(porSistema)) {
    valor.ultimoValido = valor.ok ? valor.em : anterior?.sistemas?.[chave]?.ultimoValido || (anterior?.sistemas?.[chave]?.ok ? anterior.sistemas[chave].em : null);
  }
  const diaCompleto = chaves.every(k=>porSistema[k]?.ok && diaSP(porSistema[k].em)===diaSP(agora));
  await gravarStatus({atualizadoEm: agora, dia:diaCompleto?diaSP(agora):anterior?.dia, sistemas:porSistema});
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
    if (s && await crachaRevogado(sb, "painel", s, true)) {
      return resposta({ erro: "Seu acesso foi encerrado.", semSessao: true }, 401);
    }
    if (!s) return resposta({ erro: "Entre no sistema.", semSessao: true }, 401);
    return resposta({ ok: true, status: {...(await lerStatus() || {}),capacidades:{restauroAtomico:true,arquivos:true,individual:true}} });
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
    try {return resposta({ ok: true, sistemas: await backupDoHub(corpo.sistema) });}
    catch(e) {return resposta({erro:(e as Error).message},503);}
  }

  // Daqui para baixo, so a direcao.
  if (!JWT_SECRET) return resposta({ erro: "Login nao configurado." }, 503);
  const m = String(req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  const s = m ? await verificarJwt(m[1], JWT_SECRET) : null;
  if (!s || await crachaRevogado(sb, "painel", s, true)) return resposta({ erro: "Seu acesso expirou ou foi encerrado.", semSessao: true }, 401);
  if (s.master !== true) return resposta({ erro: "Apenas a direcao pode fazer backup." }, 403);

  try {
    switch (corpo.action) {
      case "exportar":
        return resposta({ ok: true, backup: await montarBackupPainel() });

      case "registrarManual": {
        await gravarStatus({ultimoDownload:new Date().toISOString()});
        return resposta({ ok: true });
      }

      case "backupAgora":
        return resposta({ ok: true, sistemas: await backupDoHub(corpo.sistema) });

      case "restaurar": {
        const bk = corpo.backup;
        if (!bk || bk.sistema !== "painel") {
          return resposta({ erro: "Arquivo de backup invalido (so restauro o painel por aqui)." }, 400);
        }
        if (![1, 2, 3].includes(bk.versao) || !bk.painel || Array.isArray(bk.painel)) {
          return resposta({ erro: "Formato ou versão do backup inválidos." }, 400);
        }
        const APELIDO_VOLTA: Record<string, string> = { ativos: "ativo", arquivosMeta: "arquivo" };
        const p = bk.painel;
        const registros: any[] = [];
        const incluir = (colecao: string, mapa: any) => {
          if (mapa == null) return;
          if (typeof mapa !== "object" || Array.isArray(mapa)) throw new Error("Coleção inválida: " + colecao);
          for (const [id, registro] of Object.entries(mapa)) {
            if (registro == null) continue;
            if (typeof registro !== "object" || Array.isArray(registro)) throw new Error("Registro inválido: " + colecao);
            registros.push({ colecao, id, registro });
          }
        };
        if (bk.versao >= 2) {
          for (const [nome, mapa] of Object.entries(p)) {
            if (nome === "config" || nome === "gestao") continue;
            incluir(APELIDO_VOLTA[nome] ?? nome, mapa);
          }
        } else {
          incluir("ov_rec", p.ov_rec); incluir("ov_orc", p.ov_orc);
          for (const [nome, registro] of Object.entries(p)) {
            if (nome.startsWith("ativo_")) incluir("ativo", { [nome.slice(6)]: registro });
          }
        }
        const contas = Object.entries(bk.contas ?? {}).map(([usuario, c]: [string, any]) => ({ ...c, usuario: c.usuario || usuario }));
        const arquivos = await prepararArquivos(sb.storage.from("painel-arquivos"),bk.arquivos || [],async a=>{
          if(!/^[a-f0-9]{64}$/.test(a.sha256)) throw new Error('Identificação de arquivo inválida.');
          const r = await buscarComRetentativa(`https://api.github.com/repos/${GH_REPO}/contents/arquivos/painel/${a.sha256}`,{headers:{Authorization:`Bearer ${GH_TOKEN}`,Accept:'application/vnd.github.raw+json','User-Agent':'impresilk-painel-backup'}});
          if(!r.ok) throw new Error('A cópia do arquivo não foi encontrada no repositório privado.');
          return new Uint8Array(await r.arrayBuffer());
        });
        try {
          const { data, error } = await sb.rpc("painel_restaurar_atomico", {
            p_backup: { config: p.config ?? null, registros, contas, gestao: p.gestao ?? {} },
          });
          if (error || !data?.verificado) throw new Error(error?.message || "A recuperação não foi confirmada.");
          return resposta({ ok: true, ...data, arquivos:arquivos.quantidade, arquivosIncluidos:bk.versao>=3 });
        } catch(e) {await arquivos.desfazer();throw e;}

      }

      default:
        return resposta({ erro: "acao desconhecida" }, 400);
    }
  } catch (e) {
    console.error("[painel-backup] erro:", e);
    return resposta({ erro: "erro interno no backup" }, 500);
  }
});
