/* TODA AÇÃO QUE ESCREVE CONFERE O PAPEL?
 *
 * Irmão do `conferir-portas.mjs`. Aquele confere UMA coisa: que o ramo olhou o
 * crachá. Este confere a SEGUINTE: que o ramo que GRAVA olhou também o que
 * aquele crachá pode. É a 4ª conferência do PADRAO-DOS-SISTEMAS.md §1 -- "o
 * PAPEL, nas ações de ESCRITA" -- a única das quatro que nenhum verificador
 * cobria.
 *
 * O QUE CUSTOU: em 14/09/2026 a `painel-ativos` exigia crachá em TODAS as
 * ações (o conferir-portas passava verde, e passou verde por meses) e decidia
 * o módulo por um mapa:
 *
 *     const mod = MODULO_DO_TIPO[tipo];
 *     if (!mod) return true;            // <- aqui
 *
 * O mapa cobria 3 dos 7 tipos da constante `TIPOS`. Os outros quatro --
 * documento, veiculo, maquina e `seguro`, que chegou depois e trouxe junto a
 * seguradora e a importância segurada -- caíam no `return true` e ficavam
 * abertos a QUALQUER pessoa logada, inclusive para salvar, remover, restaurar
 * e trocar o arquivo. Ninguém decidiu isso: foi o FORMATO do mapa que
 * transformou esquecer em conceder.
 *
 * Daí as DUAS conferências deste script:
 *
 *   1. RAMO QUE GRAVA PROVA O PAPEL -- quem escreve no banco ou no bucket
 *      mostra, no próprio ramo (ou antes dele, no topo da function), que olhou
 *      perms/master/papel/x-token, e não só que existe sessão.
 *   2. MAPA DE PERMISSÃO COBRE A LISTA FECHADA -- mapa indexado por valor de
 *      dado (tipo, chave, coleção) que decide acesso tem de cobrir TODOS os
 *      valores da lista fechada correspondente. A exceção aberta de propósito
 *      entra no mapa escrita, não subentendida.
 *
 *   node scripts/conferir-papel.mjs
 *
 * ELE ACEITA TODOS OS JEITOS DA CASA de resolver permissão, de propósito:
 * `podeModulo`, `ehDirecao`, `perms.includes(...)`, `sessao.master`, ajudantes
 * locais (`podeTipo`, `barraId`, `soDiretoria`, `temModulo`, `exigirSessao(req,
 * "modulo")`) e o `x-token` de máquina. Ele RESOLVE o ajudante até o fundo
 * (três níveis) em vez de confiar no nome: `podeX` que não confere nada não
 * passa, e ajudante com nome esquisito que confere passa. Verificador que
 * grita à toa é desligado no dia seguinte -- e um desligado não confere nada.
 *
 * O QUE ELE NÃO PEGA, escrito aqui para ninguém confundir verde com seguro:
 * se o ramo confere UM módulo e grava em OUTRO, para ele está provado. Ele
 * confere que alguém olhou o papel, não que olhou o papel certo.
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

// PAPEL_DIR / PAPEL_SQL existem para o teste de controle (tests/
// conferir-papel.test.mjs): dá para apontar o verificador para uma pasta de
// mentira e provar que ele REPROVA o que deve reprovar.
const DIR = process.env.PAPEL_DIR || "supabase/functions";
const SQL_DIRS = (process.env.PAPEL_SQL ?? "supabase/migrations,supabase/migracoes")
  .split(",").map((s) => s.trim()).filter(Boolean);

/* ── ESCRITAS SEM PAPEL, DE PROPÓSITO ─────────────────────────────────────
   Cada uma com o porquê, como o PUBLICAS do conferir-portas. Lista curta e
   explícita: sem isso o verificador vira ruído e alguém o desliga. */
const SEM_PAPEL = {
  "acesso-entrar:(function inteira)":
    "é a ENTRADA ÚNICA -- a porta por onde se entra nos sete sistemas. Quem " +
    "bate aqui ainda não tem crachá; é esta function que emite o dele. O que " +
    "ela grava é sobre a própria tentativa (porta_travada/porta_registrar) e " +
    "sobre a identidade de quem acabou de provar a senha (o auth_user_id em " +
    "acesso_conta, e o convite marcado como usado). Papel é o que ela DEVOLVE, " +
    "não o que ela pode exigir na entrada",
  "painel-auth:login":
    "é o próprio login -- quem bate aqui ainda não tem crachá, então não há " +
    "papel a conferir. O que ela grava é sobre a TENTATIVA e mais nada: o " +
    "freio (porta_travada, que consome a ficha na mesma operação que confere) " +
    "e o rastro da tentativa (porta_registrar). Nenhum dado de outra pessoa " +
    "está ao alcance deste ramo",
  "painel-gestao:preferencia":
    "grava só a preferência de tela DA PRÓPRIA PESSOA (chave usuario+bloco, " +
    "tirada da sessão, nunca do corpo); não há papel a conferir porque não " +
    "existe dado de outra pessoa ao alcance",
};

/* ── MAPAS DE PERMISSÃO QUE NÃO COBREM A LISTA, DE PROPÓSITO ──────────────
   Mesma regra: o motivo fica escrito, não subentendido. */
const MAPAS_DECLARADOS = {
  "painel-config:MODULO_APAGAR":
    "não é o porteiro da chave -- é uma trava A MAIS sobre duas delas. Toda " +
    "chave de OVERLAYS já passa pelo barraChave (MODULO_DA_CHAVE, que cobre " +
    "as 14) no mesmo ramo; este mapa só exige o módulo para APAGAR ov_rec/ov_orc",
};

/* ── O QUE É PROVA DE PAPEL ───────────────────────────────────────────────
   Primitivos: o fundo onde todo ajudante da casa desemboca. Conferir a
   assinatura do crachá (`verificarJwt`) NÃO entra -- isso é sessão, e sessão é
   justamente o que o conferir-portas já cobre. Nome de ajudante também não
   entra: quem resolve isso é o `comAjudantes`, que lê o corpo dele. */
const PRIMITIVOS = [
  /\bperms\w*\s*\)?\s*\??\.\s*includes\s*\(/,        // perms.includes("x"), (sessao.perms||[]).includes("x")
  /\bpermiss(oes|ões)\w*\s*\)?\s*\??\.\s*includes\s*\(/,
  /\.\s*perms\b[\s\S]{0,80}?\.\s*includes\s*\(/,     // sessao.perms?.includes("x")
  /\.\s*master\b/,                                    // sessao.master === true, !s.master
  /\bmaster\s*(===|!==|==|!=)/,
  /\bpapel\s*(===|!==|==|!=)/,                        // papel === "gestao"
  /\bpap(e|é)is\b[\s\S]{0,60}?\.\s*(includes|has)\s*\(/,
  // Credencial de máquina (a carga, o pg_cron). Só vale COMPARADA: o
  // `painel-backup` MANDA "x-token" no cabeçalho quando chama os outros
  // sistemas, e ler esse envio como portão aprovava o `restaurar` por causa de
  // uma chamada de saída, que não confere nada de quem pediu.
  /["'`]x-token["'`]\s*\)?\s*(===|!==|==|!=)/,
];
const ehProva = (t) => PRIMITIVOS.some((re) => re.test(t));

/* ── O QUE É ESCRITA ──────────────────────────────────────────────────────
   Pelo que a CHAMADA faz, nunca pelo nome da ação: "resolver", "mexer" e
   "auto" gravam; "salvarConta" (aposentada, responde 410) não grava nada.
   Nome de ação é intenção; chamada é o que acontece. */
const ESCRITA_DIRETA =
  /\.\s*(upsert|insert|update|delete|upload|remove|move|copy|createSignedUploadUrl)\s*\(/;
const CHAMA_RPC = /\.\s*rpc\s*\(\s*["'`]([^"'`]+)["'`]/g;

/* ── LER O TEXTO SEM TROPEÇAR NO TEXTO ────────────────────────────────────
   Todo o resto conta chaves e parênteses para achar blocos. Comentário e
   literal quebram essa conta: estes arquivos têm regex com um parêntese solto
   dentro, comentário com parêntese e apóstrofo, e template com chaves. Pior:
   comentário é onde mais aparecem as palavras que este script procura ("a
   direcao", "o x-token", "master") -- contar comentário como prova seria
   aprovar function por causa do que ela DIZ, não do que ela FAZ.

   `preparar` devolve uma cópia do MESMO tamanho (os índices e as linhas
   continuam valendo) com: comentário virado espaço, e os caracteres de
   estrutura -- ()[]{}; e as próprias aspas -- neutralizados DENTRO de
   literais e regex. O conteúdo do literal fica legível, que é o que permite
   achar `case "salvar"` e `.rpc("painel_registro_gravar")`. */
function preparar(src) {
  const fora = src.split("");
  const neutro = (i) => { if (/[()[\]{};'"`]/.test(fora[i])) fora[i] = "_"; };
  let anterior = "";                       // último caractere de código, para separar regex de divisão
  for (let i = 0; i < src.length; i++) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") {
      while (i < src.length && src[i] !== "\n") fora[i++] = " ";
      continue;
    }
    if (c === "/" && d === "*") {
      for (const fim = src.indexOf("*/", i + 2); i < (fim < 0 ? src.length : fim + 2); i++) {
        if (src[i] !== "\n") fora[i] = " ";
      }
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      for (i++; i < src.length && src[i] !== c; i++) {
        if (src[i] === "\\") { neutro(i); neutro(++i); continue; }
        neutro(i);
      }
      anterior = c;
      continue;
    }
    if (c === "/" && !/[\w$)\]]/.test(anterior)) {      // início de regex, não divisão
      let classe = false;
      for (i++; i < src.length; i++) {
        if (src[i] === "\\") { neutro(i); neutro(++i); continue; }
        if (src[i] === "[") classe = true;
        else if (src[i] === "]") classe = false;
        else if (src[i] === "/" && !classe) break;
        neutro(i);
      }
      anterior = "/";
      continue;
    }
    if (!/\s/.test(c)) anterior = c;
  }
  return fora.join("");
}

// ── blocos equilibrados (sempre sobre o texto preparado) ─────────────────
const ABRE = { "{": "}", "(": ")", "[": "]" };
const FECHA = new Set(["}", ")", "]"]);
/** Do índice do abridor até o fechador correspondente (inclusive). */
function bloco(w, i) {
  if (!ABRE[w[i]]) return { ini: i, fim: i };
  let d = 0;
  for (let j = i; j < w.length; j++) {
    if (ABRE[w[j]]) d++;
    else if (FECHA.has(w[j]) && !--d) return { ini: i, fim: j + 1 };
  }
  return { ini: i, fim: w.length };
}
/** Do `=` até o `;` do mesmo nível (ou o fim do arquivo). */
function ateOPontoEVirgula(w, i) {
  let d = 0;
  for (let j = i; j < w.length; j++) {
    if (ABRE[w[j]]) d++;
    else if (FECHA.has(w[j])) { if (d <= 0) return j; d--; }
    else if (w[j] === ";" && d === 0) return j;
  }
  return w.length;
}

/* Definições locais: `const x = ...`, `let x = ...`, `function x(...) {...}`.
   SÓ AS DE FORA. Uma `const r` declarada dentro de outro ajudante (ou dentro de
   um ramo) é de lá, não daqui: emprestá-la a quem só repete o nome `r` fez o
   `painel-backup:restaurar` "provar" o papel com uma chamada de saída que nada
   tem a ver com quem pediu. Fica só o que qualquer ramo enxerga de verdade --
   o escopo do módulo e o do corpo do Deno.serve, que é onde a casa guarda
   `podeTipo`, `barraChave`, `soDiretoria` e `temModulo`. */
function definicoes(w, ramosDaVez = []) {
  const mapa = new Map();
  const guardar = (nome, ini, fim) => {
    if (!mapa.has(nome)) mapa.set(nome, { ini, fim, texto: w.slice(ini, fim) });
  };
  const re = /(?:^|[;{}()\s])(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;\n]+)?=\s*/g;
  for (let m; (m = re.exec(w)); ) {
    const i = m.index + m[0].length;
    guardar(m[1], i, ateOPontoEVirgula(w, i));
  }
  const fn = /(?:^|[;{}()\s])(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  for (let m; (m = fn.exec(w)); ) {
    const par = m.index + m[0].length - 1;
    const chave = w.indexOf("{", bloco(w, par).fim);
    if (chave < 0) continue;
    guardar(m[1], m.index, bloco(w, chave).fim);
  }
  const dentroDeOutra = (ini) =>
    [...mapa.values()].some((o) => o.ini < ini && ini < o.fim) ||
    ramosDaVez.some((r) => r.ini < ini && ini < r.fim);
  for (const [nome, { ini }] of [...mapa]) if (dentroDeOutra(ini)) mapa.delete(nome);
  return mapa;
}

/** O trecho MAIS o corpo dos ajudantes locais que ele cita (três níveis). */
function comAjudantes(w, texto, defs, nivel = 3, vistos = new Set()) {
  if (nivel <= 0) return texto;
  let fora = texto;
  for (const m of texto.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)) {
    const nome = m[1];
    if (vistos.has(nome) || !defs.has(nome)) continue;
    vistos.add(nome);
    fora += "\n" + comAjudantes(w, defs.get(nome).texto, defs, nivel - 1, vistos);
  }
  return fora;
}

/* O AJUDANTE QUE MORA EM `_shared`. O `painel-vigia` grava (um `upsert` em
   painel_meta) sem que a palavra `upsert` apareça no index.ts dele: quem grava
   é o `vigiarCache`, importado. Sem seguir o import, essa function parecia não
   escrever nada -- e o que não parece escrever não é conferido.

   Só entra import RELATIVO (o `https://esm.sh/...` fica de fora), e só para
   achar ESCRITA: nenhum arquivo de `_shared` contém primitivo de papel
   (conferido), então seguir o import não tem como aprovar ninguém de graça. */
function definicoesVizinhas(dirDaFunction, w) {
  const mapa = new Map();
  for (const m of w.matchAll(/import\s*\{([^}]*)\}\s*from\s*["'`](\.[^"'`]+)["'`]/g)) {
    const alvo = join(dirDaFunction, m[2]);
    if (!existsSync(alvo)) continue;
    const vw = preparar(readFileSync(alvo, "utf8"));
    const defs = definicoes(vw);
    for (const bruto of m[1].split(",")) {
      const nome = bruto.trim().split(/\s+as\s+/).pop()?.trim();
      if (nome && defs.has(nome) && !mapa.has(nome)) mapa.set(nome, defs.get(nome));
    }
  }
  return mapa;
}

// ── as funções SQL: `stable`/`immutable` lê, o resto grava ────────────────
/* Classificar rpc pelo NOME seria o mesmo erro de classificar ação pelo nome.
   O repositório guarda as migrações, então dá para LER a declaração. Três
   sinais, nesta ordem:

   1. `stable`/`immutable` no cabeçalho -- o Postgres proíbe essas de gravar,
      então é resposta definitiva: lê.
   2. o corpo tem `insert into` / `update ... set` / `delete from` / `truncate`:
      grava.
   3. o corpo CHAMA outra função do repositório que grava: grava também. Sem
      este passo, `painel_crm_resolver` passaria por leitura -- ela não tem um
      `insert` sequer, só chama `painel_crm_finalizar`, que tem.

   Chamada a coisa que o repo não declara (`now()`, `coalesce`,
   `pg_advisory_xact_lock`) é ignorada aqui: são as embutidas do Postgres, e
   contá-las tornaria TODA função uma escrita. A dúvida que de fato pesa é
   outra -- rpc que o TypeScript chama e que o repositório não declara em lugar
   nenhum conta como escrita, porque aí não se sabe, e não saber recusa.

   O que isto evitou de ruído: `acesso_revogado` (a conferência de crachá
   revogado, que o `crachaRevogado` de `_shared` chama no topo de quase toda
   function) é `plpgsql` sem `stable`, logo volátil -- pela regra do cabeçalho
   ela seria escrita, e passava a "gravar" em 30 ramos que só conferem sessão.
   Ela não tem uma linha de escrita no corpo. */
function classificarRpc() {
  const declaradas = new Map();   // nome -> { escreveDireto, chama:Set }
  for (const dir of SQL_DIRS) {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql"))) {
      const sql = readFileSync(`${dir}/${f}`, "utf8");
      const re = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_]+)\s*\(/gi;
      for (let m; (m = re.exec(sql)); ) {
        const par = m.index + m[0].length - 1;
        let d = 0, fimArgs = par;
        for (let j = par; j < sql.length; j++) {
          if (sql[j] === "(") d++;
          else if (sql[j] === ")" && !--d) { fimArgs = j + 1; break; }
        }
        const depois = sql.slice(fimArgs);
        const abre = depois.search(/\$[a-z_]*\$/i);           // $$ ou $function$
        const cabeca = abre < 0 ? depois.slice(0, 400) : depois.slice(0, abre);
        if (/\b(stable|immutable)\b/i.test(cabeca)) { declaradas.set(m[1], null); continue; }
        // corpo entre a marca de abertura e a MESMA marca de fechamento
        let corpo = "";
        if (abre >= 0) {
          const marca = depois.slice(abre).match(/^\$[a-z_]*\$/i)[0];
          const fim = depois.indexOf(marca, abre + marca.length);
          corpo = depois.slice(abre + marca.length, fim < 0 ? undefined : fim);
        }
        declaradas.set(m[1], {
          escreveDireto: /\b(insert\s+into|update\s+[\w."]+\s+set|delete\s+from|truncate)\b/i.test(corpo),
          chama: new Set([...corpo.matchAll(/\b([a-z0-9_]{4,})\s*\(/gi)].map((x) => x[1].toLowerCase())),
        });
      }
    }
  }
  // Propaga: quem chama quem grava, grava. Repete até parar de mudar.
  const grava = new Set();
  for (const [nome, d] of declaradas) if (d?.escreveDireto) grava.add(nome);
  for (let mexeu = true; mexeu; ) {
    mexeu = false;
    for (const [nome, d] of declaradas) {
      if (!d || grava.has(nome)) continue;
      for (const c of d.chama) {
        if (c !== nome && grava.has(c)) { grava.add(nome); mexeu = true; break; }
      }
    }
  }
  const tipo = new Map();
  for (const nome of declaradas.keys()) tipo.set(nome, grava.has(nome) ? "grava" : "le");
  return tipo;
}

/** Nomes de rpc que o trecho chama e que gravam (ou que não sabemos classificar). */
function rpcsQueGravam(texto, tipoRpc) {
  const fora = [];
  for (const m of texto.matchAll(CHAMA_RPC)) {
    const t = tipoRpc.get(m[1]);
    if (t === "le") continue;
    fora.push(t ? m[1] : `${m[1]} (não achei no SQL do repo -- conta como escrita)`);
  }
  return fora;
}

// ── os ramos de ação, nos dois formatos de despacho ──────────────────────
/* A casa despacha de dois jeitos: `switch (corpo.action)` com `case "x":`
   (painel-dados, painel-ativos, painel-gestao...) e corrente de
   `if (body.action === "x") { ... }` (painel-cache, painel-crm). O
   conferir-portas só enxerga o primeiro -- por isso as escritas do cache e do
   CRM nunca entraram na conta dele. */
function ramos(w) {
  const fora = [];
  const casos = [...w.matchAll(/case\s+["'`]([^"'`]+)["'`]\s*:/g)];
  for (let i = 0; i < casos.length; i++) {
    const resto = w.slice(casos[i].index + 1).search(/case\s+["'`][^"'`]+["'`]\s*:|default\s*:/);
    const fim = resto < 0 ? w.length : casos[i].index + 1 + resto;
    fora.push({ nome: casos[i][1], ini: casos[i].index, fim });
  }
  const ifs = /\bif\s*\(([^{;]*?\baction\b[^{;]*?)\)\s*\{/g;
  for (let m; (m = ifs.exec(w)); ) {
    const cond = m[1];
    if (!/===?\s*["'`]|\.\s*includes\s*\(\s*action\s*\)/.test(cond)) continue;
    if (/!==|!=/.test(cond)) continue;                       // guarda negativa não é ramo
    const nomes = [...cond.matchAll(/["'`]([^"'`]+)["'`]/g)].map((x) => x[1]);
    if (!nomes.length) continue;
    fora.push({ nome: nomes.join("|"), ini: m.index, fim: bloco(w, m.index + m[0].length - 1).fim });
  }
  if (fora.length) return fora.sort((a, b) => a.ini - b.ini);
  /* NENHUM DESPACHO POR AÇÃO -- e nem por isso a function está fora do
     assunto. O `acesso-entrar` é uma porta só (a entrada única) e grava em
     acesso_conta; o `painel-vigia` é uma porta só e grava pelo vigiarCache.
     Antes os dois saíam num rodapé de "não conferidas", e rodapé não segura
     escrita nenhuma. Agora o corpo inteiro do Deno.serve responde como um
     ramo: menos preciso que por ação, mas conferido -- e o nome sai escrito
     assim para ninguém achar que foi olhado ação por ação. */
  const serve = w.search(/Deno\s*\.\s*serve\s*\(/);
  if (serve < 0) return [];
  const par = w.indexOf("(", serve);
  const { ini, fim } = bloco(w, par);
  return [{ nome: "(function inteira)", ini, fim, inteira: true }];
}

/* ── ONDE A FUNCTION FECHA A PORTA POR PAPEL ──────────────────────────────
   Só vale recusa que esteja no CAMINHO de todo mundo. Duas coisas são apagadas
   antes de procurar:

   - o corpo dos ajudantes. O `painel-ativos` DEFINE `barraId` (que devolve
     403) antes do switch; contar a definição como "a function fecha no topo"
     faria todos os ramos dela passarem, inclusive os que não chamam ninguém.
   - o corpo dos ramos. O `painel-backup` recusa por `x-token` DENTRO do ramo
     `auto`; essa recusa protege o `auto`, não o `restaurar` que vem depois.

   O que sobra é o fluxo por onde a chamada passa de qualquer jeito. Cada
   portão vale para os ramos que começam DEPOIS dele. */
function portoes(w, defs, lista) {
  const texto = w.split("");
  const apagar = (ini, fim) => { for (let i = ini; i < fim; i++) if (texto[i] !== "\n") texto[i] = " "; };
  for (const { ini, fim } of defs.values()) if (/=>|function/.test(w.slice(ini, fim))) apagar(ini, fim);
  for (const r of lista) apagar(r.ini, r.fim);
  const limpo = texto.join("");
  const fora = [];
  for (const m of limpo.matchAll(/\b(401|403)\b/g)) {
    const janela = limpo.slice(Math.max(0, m.index - 300), m.index);
    if (!/\bif\s*\(/.test(janela)) continue;
    const condicao = janela.slice(janela.lastIndexOf("if"));
    if (m[1] === "403" && ehProva(comAjudantes(w, condicao, defs))) fora.push(m.index);
    if (m[1] === "401" && /["'`]x-token["'`]/.test(condicao)) fora.push(m.index);  // porta de máquina
  }
  return fora;
}

/* ── 2ª CONFERÊNCIA: O MAPA COBRE A LISTA FECHADA? ────────────────────────
   Mapa `{valor: "modulo"}` consultado por `MAPA[variavel]` de dentro de algo
   que decide acesso. A lista fechada é a que valida a MESMA variável
   (`TIPOS.has(tipo)`, `OVERLAYS.has(chave)`); entre as candidatas vale a que o
   mapa cobre MELHOR, senão qualquer listinha do arquivo acusaria qualquer
   mapa -- e a acusação errada é o começo do fim de um verificador. */
function conferirMapas(fn, w, src, defs, acusar) {
  const listas = [];
  for (const [nome, { texto: corpo }] of defs) {
    const m = corpo.match(/^\s*new\s+Set\s*\(\s*\[([\s\S]*)\]\s*\)\s*$|^\s*\[([\s\S]*)\]\s*$/);
    if (!m) continue;
    const itens = [...(m[1] ?? m[2] ?? "").matchAll(/["'`]([^"'`]+)["'`]/g)].map((x) => x[1]);
    if (itens.length > 1) listas.push({ nome, itens });
  }
  for (const [nome, { ini, texto: corpo }] of defs) {
    if (!/^\s*\{/.test(corpo)) continue;
    // O valor pode ser UM módulo ("marketing") ou uma LISTA deles
    // (["documentos", "manutencoes"] -- o mesmo carro em duas telas). As duas
    // formas contam: ler só a primeira deixaria o mapa certo invisível, e
    // mapa invisível é mapa não conferido.
    const chaves = [...corpo.matchAll(/(?:^\s*\{|,)\s*(?:["'`]([^"'`]+)["'`]|([A-Za-z_$][\w$]*))\s*:\s*(?:["'`]|\[)/g)]
      .map((x) => x[1] ?? x[2]);
    if (chaves.length < 2) continue;                          // mapa de um item não é tabela
    const usos = [...w.matchAll(new RegExp(`\\b${nome}\\s*\\[\\s*([A-Za-z_$][\\w$]*)`, "g"))];
    if (!usos.length) continue;
    // Decide acesso? O que está em volta do uso, com os ajudantes resolvidos,
    // fala de perms/master/papel. Mapa de dado (ESPEC_PERMITIDA, APELIDO_VOLTA)
    // não fala, e por isso não entra aqui.
    const perto = usos
      .map((u) => comAjudantes(w, w.slice(Math.max(0, u.index - 500), u.index + 500), defs))
      .join("\n");
    if (!ehProva(perto)) continue;
    const variaveis = [...new Set(usos.map((u) => u[1]))];
    let melhor = null;
    for (const l of listas) {
      if (l.nome === nome) continue;
      const testada = variaveis.some((v) =>
        new RegExp(`\\b${l.nome}\\s*\\.\\s*(has|includes)\\s*\\(\\s*${v}\\b`).test(w));
      if (!testada) continue;
      const cobre = l.itens.filter((x) => chaves.includes(x)).length / l.itens.length;
      if (!melhor || cobre > melhor.cobre) melhor = { ...l, cobre };
    }
    if (!melhor || melhor.cobre === 1) continue;
    const chave = `${fn}:${nome}`;
    if (MAPAS_DECLARADOS[chave]) continue;
    const faltam = melhor.itens.filter((x) => !chaves.includes(x));
    acusar(
      `X ${chave} — decide acesso por valor de dado e NÃO cobre ${melhor.nome} ` +
      `(linha ${linha(src, ini)})\n` +
      `    Falta: ${faltam.join(", ")}\n` +
      `    Quem cai fora do mapa não é recusado: é liberado por omissão -- esquecer\n` +
      `    vira conceder, e ninguém abre chamado por acesso que ganhou de graça.\n` +
      `    Ponha cada valor no mapa (o aberto de propósito também, escrito), ou\n` +
      `    declare em MAPAS_DECLARADOS com o motivo.`,
    );
  }
}

const linha = (src, i) => src.slice(0, i).split("\n").length;

// ── a conferência ────────────────────────────────────────────────────────
const tipoRpc = classificarRpc();
const achados = [];
const acusar = (msg) => achados.push(msg);
let escritas = 0;
const semServe = [], inteiras = [];

for (const fn of readdirSync(DIR).filter((f) => !f.startsWith(".") && !f.startsWith("_")).sort()) {
  const caminho = `${DIR}/${fn}/index.ts`;
  if (!existsSync(caminho)) continue;
  const src = readFileSync(caminho, "utf8");
  const w = preparar(src);
  const lista = ramos(w);
  const defs = definicoes(w, lista);

  conferirMapas(fn, w, src, defs, acusar);

  if (!lista.length) { semServe.push(fn); continue; }
  // As de `_shared` só para seguir a escrita; o mapa local continua sendo o
  // que manda nas listas fechadas e nos mapas de permissão.
  const seguir = new Map([...definicoesVizinhas(dirname(caminho), w), ...defs]);
  const portas = portoes(w, defs, lista);

  for (const r of lista) {
    if (r.inteira) inteiras.push(fn);
    const inteiro = comAjudantes(w, w.slice(r.ini, r.fim), seguir);
    const rpcs = rpcsQueGravam(inteiro, tipoRpc);
    if (!ESCRITA_DIRETA.test(inteiro) && !rpcs.length) continue;      // ramo de leitura
    escritas++;
    const chave = `${fn}:${r.nome}`;
    if (SEM_PAPEL[chave]) continue;
    if (portas.some((p) => p < r.ini)) continue;                      // fechada antes do ramo
    if (ehProva(inteiro)) continue;                                   // fechada no ramo
    acusar(
      `X ${chave} — ${rpcs.length ? `chama a rpc ${rpcs[0]}` : "grava no banco/bucket"} ` +
      `e ninguém conferiu o PAPEL (linha ${linha(src, r.ini)})\n` +
      `    O ramo prova que existe sessão, não que essa sessão pode escrever isto.\n` +
      `    Confira o módulo no ramo (perms/master/papel, ou um ajudante que os use),\n` +
      `    feche a function antes do despacho, ou declare em SEM_PAPEL com o motivo.`,
    );
  }
}

for (const a of achados) console.log(a);
if (inteiras.length) {
  console.log(
    `\n(${inteiras.length} function(s) sem despacho por ação, conferidas como UM bloco ` +
    `-- porta única: ${inteiras.join(", ")}. Aqui o script diz que alguém olhou o papel ` +
    `em algum lugar do corpo, não que olhou neste ramo.)`,
  );
}
if (semServe.length) {
  console.log(
    `\n(${semServe.length} arquivo(s) sem Deno.serve, NÃO conferidos: ${semServe.join(", ")} ` +
    `-- zero achado neles é "não cheguei lá", não "está limpo".)`,
  );
}
console.log(
  achados.length
    ? `\n${achados.length} achado(s) em ${escritas} ações de escrita.`
    : `\n${escritas} ações de escrita conferidas: todas provam o papel (ou estão declaradas com motivo).`,
);
process.exit(achados.length ? 1 : 0);
