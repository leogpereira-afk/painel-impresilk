/* A COPIA EXISTE != A COPIA VOLTA.
 *
 * `permutas` ficou meses no arquivo de backup sem que o `restaurar` a
 * devolvesse (a volta era uma lista a mao), e ninguem viu porque restaurar so
 * acontece no dia ruim. Este script prova a volta SEM tocar em nada:
 *
 *   1. le o codigo do painel-backup e recusa lista a mao na restauracao
 *      (a volta tem de percorrer o ARQUIVO, com os dois apelidos inversos);
 *   2. com credenciais (SUPABASE_ACCESS_TOKEN + gh), baixa o backup real de
 *      HOJE e confere colecao a colecao que o que esta no arquivo casa com o
 *      banco -- o banco pode ter MAIS (registros novos do dia), nunca colecao
 *      que o arquivo ignoraria.
 *
 * Rodar: node scripts/conferir-restauro.mjs           (so a parte 1, sem rede)
 *        CONFERIR_CONTAGEM=1 node scripts/...         (1 + 2, precisa de gh e token)
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let problemas = 0;
const acusar = (m) => { console.log(`  ✗ ${m}`); problemas++; };
const ok = (m) => console.log(`  · ${m}`);

// ---------------------------------------------------------------- parte 1
console.log("1. A volta percorre o arquivo, nao uma lista a mao?");
const fonte = readFileSync(resolve(RAIZ, "supabase/functions/painel-backup/index.ts"), "utf8");

// A doenca tem assinatura: `if (p.<colecao>) mapas.push(...)` -- uma linha por
// colecao, escrita a mao. Uma unica ocorrencia ja e a lista renascendo.
const listaAMao = fonte.match(/if \(p\.[a-zA-Z_]+\) mapas\.push/g) || [];
if (listaAMao.length) acusar(`a restauracao tem ${listaAMao.length} colecao(oes) escrita(s) a mao -- a proxima colecao nova nasce fora dela`);
else ok("restauracao deriva as colecoes do arquivo");

// Os apelidos da ida e da volta tem de ser espelho um do outro.
const ida = [...fonte.matchAll(/APELIDO: Record<string, string> = \{([^}]*)\}/g)][0]?.[1] ?? "";
const volta = [...fonte.matchAll(/APELIDO_VOLTA: Record<string, string> = \{([^}]*)\}/g)][0]?.[1] ?? "";
const par = (t) => Object.fromEntries([...t.matchAll(/(\w+): "(\w+)"/g)].map((m) => [m[1], m[2]]));
const mIda = par(ida), mVolta = par(volta);
const inverso = Object.entries(mIda).every(([k, v]) => mVolta[v] === k)
  && Object.entries(mVolta).every(([k, v]) => mIda[v] === k);
if (!Object.keys(mIda).length || !Object.keys(mVolta).length) acusar("nao achei APELIDO/APELIDO_VOLTA no codigo (mudou de forma?)");
else if (!inverso) acusar(`os apelidos da ida (${JSON.stringify(mIda)}) e da volta (${JSON.stringify(mVolta)}) nao sao inversos`);
else ok(`apelidos inversos conferidos: ${JSON.stringify(mIda)}`);

// ---------------------------------------------------------------- parte 2
if (process.env.CONFERIR_CONTAGEM === "1") {
  console.log("2. O arquivo de HOJE bate com o banco, colecao a colecao?");
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const bruto = execSync(
    `gh api repos/leogpereira-afk/backups-impresilk/contents/painel/${hoje}.json --jq .content | base64 -d`,
    { maxBuffer: 64 * 1024 * 1024 }).toString();
  const bk = JSON.parse(bruto);
  const doArquivo = {};
  for (const [nome, mapa] of Object.entries(bk.painel ?? {})) {
    if (nome === "config" || mapa == null || typeof mapa !== "object") continue;
    doArquivo[mVolta[nome] ?? nome] = Object.keys(mapa).length;
  }
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) { acusar("sem SUPABASE_ACCESS_TOKEN para conferir o banco"); }
  else {
    const q = "select colecao, count(*) n from painel_registros group by 1;";
    const resp = execSync(
      `curl -s -X POST "https://api.supabase.com/v1/projects/heveemylixartyijxewh/database/query" ` +
      `-H "Authorization: Bearer ${token}" -H "Content-Type: application/json" ` +
      `-d '${JSON.stringify({ query: q })}'`,
      { maxBuffer: 8 * 1024 * 1024 }).toString();
    const noBanco = Object.fromEntries(JSON.parse(resp).map((r) => [r.colecao, Number(r.n)]));
    for (const [col, n] of Object.entries(noBanco)) {
      const arq = doArquivo[col];
      if (arq === undefined) acusar(`colecao "${col}" (${n} registros) existe no banco e NAO esta no arquivo de hoje`);
      else if (arq < n) ok(`${col}: arquivo ${arq} / banco ${n} (banco cresceu depois do backup -- normal)`);
      else if (arq > n) acusar(`${col}: arquivo ${arq} > banco ${n} -- o banco PERDEU registros desde o backup?`);
      else ok(`${col}: ${n} registros, bate`);
    }
    for (const col of Object.keys(doArquivo)) {
      if (!(col in noBanco)) ok(`${col}: so no arquivo (colecao esvaziada hoje?) -- a volta a devolveria`);
    }
  }
}

console.log(problemas ? `\nREPROVADO: ${problemas} problema(s).` : "\nA volta do backup confere.");
process.exit(problemas ? 1 : 0);
