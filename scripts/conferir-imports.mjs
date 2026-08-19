/* AS IMPORTACOES RESOLVEM?
 *
 * `node --check` valida SINTAXE e nada mais: um `import { x }` de um nome que o
 * modulo nao exporta passa verde e so explode quando o processo roda de
 * verdade -- no Actions, com as chaves, depois de 20 minutos de ERP. Foi assim
 * que a carga do historico morreu na primeira tentativa.
 *
 * Este script IMPORTA os modulos e confere que cada nome existe. Roda em
 * segundos, sem chave nenhuma, e cabe no lint.
 */
const ALVOS = [
  {
    modulo: "../netlify/functions/mubi-cache-background.mjs",
    nomes: [
      "etapaRapidos", "etapaCompleta", "etapaRealizado", "calcDso",
      "normOrcamento", "normOS", "chaveProduto", "SEM_CATEGORIA", "FORA_CATALOGO",
      "etapaHistoricoOS", "fatiasPorAno", "PAGINA_HISTORICO", "normRecebivel",
    ],
  },
  {
    modulo: "../netlify/functions/lib/mubi.js",
    nomes: ["mubiGetTudo", "mubiConfigurado", "hojeMais", "num"],
  },
];

let ruim = 0;
for (const alvo of ALVOS) {
  const m = await import(alvo.modulo);
  const faltando = alvo.nomes.filter((n) => m[n] === undefined);
  if (faltando.length) {
    console.error(`${alvo.modulo}: NAO exporta ${faltando.join(", ")}`);
    ruim = 1;
  } else {
    console.log(`ok  ${alvo.modulo} (${alvo.nomes.length} nomes)`);
  }
}

/* E o que o carregar-cache pede de verdade: le o proprio import do arquivo,
   em vez de uma lista escrita a mao aqui que envelhece calada. */
import { readFileSync } from "node:fs";
const fonte = readFileSync(new URL("./carregar-cache.mjs", import.meta.url), "utf8");
for (const [, dentro, de] of fonte.matchAll(/import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g)) {
  if (!de.startsWith("..")) continue;
  const m = await import(de);
  const faltando = dentro.split(",").map((x) => x.trim().split(" as ")[0]).filter(Boolean)
    .filter((n) => m[n] === undefined);
  if (faltando.length) {
    console.error(`carregar-cache.mjs importa de ${de} nomes que nao existem: ${faltando.join(", ")}`);
    ruim = 1;
  } else {
    console.log(`ok  carregar-cache.mjs <- ${de}`);
  }
}
process.exit(ruim);
