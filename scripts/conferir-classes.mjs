/* CLASSE DE COR QUE NAO EXISTE NAO DA ERRO -- o Tailwind descarta calado.
 *
 * Foi assim que bg-warn-500 (o trilho ambar das listas), bg-bad-500 (a barra
 * da permuta estourada) e bg-ok-500 (a meta batida) ficaram TRANSPARENTES em
 * 12 usos, sem uma linha de aviso: o sinal sumia exatamente no estado que ele
 * existia para gritar. Mesma familia da "lista copiada que falha calada".
 *
 * Este script extrai do src toda classe de cor das familias da casa
 * (brand/ok/warn/bad) e confere que cada uma gera regra no CSS COMPILADO.
 * Roda depois do build (precisa do dist).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function arquivos(dir, fim, saida = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) arquivos(p, fim, saida);
    else if (fim.some((f) => n.endsWith(f))) saida.push(p);
  }
  return saida;
}

// As classes que o src usa. Pega bg-/text-/border-/accent-/from-/to- das
// quatro familias, com tom e opcional /opacidade. Template strings entram
// porque a classe aparece literal dentro delas.
const usadas = new Set();
const RE = /(?:bg|text|border|accent|from|to|ring|divide)-(?:brand|ok|warn|bad)(?:-\d{2,3})?(?:\/\d{1,3})?\b/g;
for (const p of arquivos(resolve(RAIZ, "src"), [".jsx", ".js"])) {
  for (const m of readFileSync(p, "utf8").matchAll(RE)) usadas.add(m[0]);
}

// O CSS compilado. Classe vira seletor com escapes: `/` -> `\/`.
const dist = resolve(RAIZ, "dist/assets");
const css = readdirSync(dist).filter((n) => n.endsWith(".css"))
  .map((n) => readFileSync(join(dist, n), "utf8")).join("\n");
if (!css) { console.error("sem CSS em dist/assets -- rode o build antes"); process.exit(2); }

const fantasmas = [...usadas].filter((c) => {
  const nome = c.replace(/\//g, "\\/");
  /* A classe pode aparecer PURA (".bg-warn-500") ou com variante no nome
     (".focus\:ring-brand-200", ".hover\:text-warn-900") -- o Tailwind poe o
     prefixo dentro do seletor. Procurar so a forma pura acusava falso
     fantasma em todo uso com focus:/hover:/dark:. */
  return !css.includes("." + nome) && !css.includes("\\:" + nome);
});

if (fantasmas.length) {
  console.log(`REPROVADO: ${fantasmas.length} classe(s) de cor usadas no src NAO geram CSS:`);
  for (const c of fantasmas.sort()) console.log(`  ✗ ${c}`);
  console.log("Ou o tom nao existe na paleta (tailwind.config.js), ou o nome tem erro de digitacao.");
  process.exit(1);
}
console.log(`ok: ${usadas.size} classes de cor do src, todas presentes no CSS compilado.`);
