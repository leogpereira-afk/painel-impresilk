/* O QUE ESTÁ NO AR É O QUE ESTÁ COMMITADO?
 *
 * A tela é publicada pela CI a cada push; as Edge Functions, NÃO -- elas
 * sobem por `scripts/publicar-functions.sh`, à mão. Um conserto commitado e
 * não publicado é o pior estado possível: o código diz uma coisa, a porta faz
 * outra, e a leitura do repo "prova" o conserto que não está valendo.
 *
 * COMO SE CONFERE: a Management API devolve o corpo publicado como bundle
 * ESZIP -- comparar sha com o arquivo NÃO SERVE (formatos diferentes; o
 * primeiro teste que fiz assim deu "tudo diferente", que era só ruído).
 * O que serve é procurar dentro do bundle as MARCAS do último commit que
 * tocou a função: linhas novas com texto próprio nosso. Se elas estão lá, o
 * que está no ar inclui aquela mudança.
 *
 *   export SUPABASE_ACCESS_TOKEN="$(tr -d '\n' < ~/.supabase-token)"
 *   node scripts/conferir-publicado.mjs
 */
import { execFileSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";

const REF = "heveemylixartyijxewh";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) {
  console.log("sem SUPABASE_ACCESS_TOKEN -- pulando (a CI não tem o token, e não deve ter)");
  process.exit(0);
}

const git = (args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

/* AS MARCAS TÊM DE SER ÚNICAS, senão o controle não detecta nada. Duas
   armadilhas, as duas encontradas testando este próprio script:

   1. o bundle REFORMATA a fonte (`case "x": {` vira duas linhas), então marca
      que termina em chave nunca casa -- as chaves saem antes de comparar;
   2. linha nova mas BANAL (`if (g.resposta) return g.resposta;`) existe em
      dez outros pontos: casaria mesmo com a mudança NÃO publicada, e o
      verificador diria "ok" sem provar nada.

   Vale só a linha que aparece UMA vez no arquivo de hoje e NENHUMA na versão
   anterior dele. Sem nenhuma marca assim, o certo é dizer "não conferido". */
function marcasDoUltimoCommit(caminho) {
  const commit = git(["log", "-1", "--format=%H", "--", caminho]).trim();
  if (!commit) return { commit: null, marcas: [] };
  const atual = git(["show", `${commit}:${caminho}`]);
  let anterior = "";
  try { anterior = git(["show", `${commit}~1:${caminho}`]); } catch { /* nasceu neste commit */ }
  const limpa = (t) => t.trim().replace(/^(\/\/|\*)\s*/, "").replace(/[{}]+$/, "").trim();

  const diff = git(["show", "--format=", "-U0", commit, "--", caminho]);
  const marcas = [];
  for (const linha of diff.split("\n")) {
    if (!linha.startsWith("+") || linha.startsWith("+++")) continue;
    const t = limpa(linha.slice(1));
    if (t.length < 24 || t.length > 90) continue;
    if (!/^[\x20-\x7E]+$/.test(t)) continue;      // o bundle escapa não-ASCII
    if (!/[a-zA-Z]{4}/.test(t)) continue;
    if (atual.split(t).length - 1 !== 1) continue; // repetida no arquivo: não prova nada
    if (anterior.includes(t)) continue;            // já existia: não prova ESTE commit
    marcas.push(t);
    if (marcas.length >= 4) break;
  }
  return { commit: commit.slice(0, 7), marcas };
}

const dir = "supabase/functions";
const funcoes = readdirSync(dir).filter((f) => !f.startsWith("_") && existsSync(`${dir}/${f}/index.ts`));
let ruim = 0, semMarca = 0;

for (const fn of funcoes) {
  const caminho = `${dir}/${fn}/index.ts`;
  const { commit, marcas } = marcasDoUltimoCommit(caminho);
  if (!marcas.length) {
    // Sem marca utilizável não se AFIRMA que está no ar -- dizer "ok" aqui
    // seria o verificador que passa sem provar nada.
    console.log(`? ${fn.padEnd(16)} sem marca utilizável no commit ${commit ?? "(nenhum)"} -- não conferido`);
    semMarca++;
    continue;
  }
  const resp = await fetch(`https://api.supabase.com/v1/projects/${REF}/functions/${fn}/body`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!resp.ok) {
    console.log(`! ${fn.padEnd(16)} a API não devolveu o corpo (HTTP ${resp.status})`);
    ruim++;
    continue;
  }
  const corpo = Buffer.from(await resp.arrayBuffer()).toString("latin1");
  /* O BUNDLE REFLUI A LINHA. `new Set(["central", "dre", "bosques", "domo"])`
     sai no ESZIP quebrado em SEIS linhas, uma por item -- e a marca de uma
     linha só nunca casa. Foi assim que em 04/09/2026 o verificador acusou
     `painel-acesso` de "FALTA PUBLICAR" com a mudança publicada havia dias:
     eu republiquei por reflexo e o alarme continuou, que é o que denunciou o
     defeito. Controle que grita sem motivo é pior que controle nenhum --
     ensina a ignorar.

     Comparar SEM espaço nenhum resolve sem afrouxar: a marca continua tendo de
     aparecer inteira, na ordem, com os mesmos caracteres; só as quebras de
     linha e a indentação deixam de contar. Não basta achatar para UM espaço --
     o bundle escreve `new Set([ "central"` (espaço depois do colchete) e a
     fonte escreve `new Set(["central"`; provado com 6 casos sintéticos, entre
     eles os que TÊM de falhar: item faltando, item a mais, ordem trocada. */
  const semEspaco = (t) => t.replace(/\s+/g, "");
  const corpoSemEspaco = semEspaco(corpo);
  const faltando = marcas.filter((m) => !corpo.includes(m) && !corpoSemEspaco.includes(semEspaco(m)));
  if (faltando.length === marcas.length) {
    console.log(`X ${fn.padEnd(16)} NO AR sem nenhuma marca do commit ${commit} -- FALTA PUBLICAR`);
    ruim++;
  } else if (faltando.length) {
    // Parte sim, parte não: o bundle pode ter reformatado a linha. Não é
    // "ok" e não é "falta publicar" -- é para olhar.
    console.log(`? ${fn.padEnd(16)} ${commit}: ${marcas.length - faltando.length}/${marcas.length} marcas -- confira "${faltando[0].slice(0, 40)}…"`);
    semMarca++;
  } else {
    console.log(`ok ${fn.padEnd(15)} no ar com ${commit} (${marcas.length}/${marcas.length} marcas próprias)`);
  }
}

console.log(
  ruim
    ? `\n${ruim} função(ões) fora do ar ou desatualizada(s): rode ./scripts/publicar-functions.sh <nome>`
    : `\n${funcoes.length - semMarca} funções conferidas: o que está no ar tem o último commit de cada uma.`,
);
process.exit(ruim ? 1 : 0);
