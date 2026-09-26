/* A AREA "Sistemas e configuracoes" SEM TRAVESSAO, e com um nome por sistema.
 *
 * Regra da casa (23/09): nenhum travessao (—) nem meia-risca (–) em texto de
 * tela, confirm(), placeholder ou comentario novo. A area inteira foi reescrita
 * em 26/09 sem eles; este teste segura para o proximo que mexer.
 * Os textos que a area mostra e moram fora dela (descricao dos modulos e o
 * caminho de acessos de cada sistema) entram na mesma regra.
 *
 * E o nome curto do sistema ("POPs", "Brief") nao aparece mais nesta area: o
 * mesmo sistema tinha dois nomes em abas vizinhas.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MODULOS } from "../src/lib/modulos.js";
import { SISTEMAS } from "../src/lib/sistemas.js";

const ARQUIVOS = [
  "pages/Acessos.jsx", "pages/Backups.jsx", "pages/Configuracoes.jsx", "pages/configuracoes.css",
  "components/AcessoUnico.jsx", "components/CentralResumo.jsx", "components/AreaSistemas.jsx",
  "components/area-sistemas.css", "components/central/MinhaConta.jsx",
  "components/ConfiguracoesModulos.jsx", "components/LixeiraRegistros.jsx",
  "lib/regra-senha.mjs", "lib/senha-previsao.mjs", "lib/acesso-sistema.mjs", "lib/backup-situacao.mjs",
];
const TRACO = /[–—]/;

test("nenhum travessao nos arquivos da area", async () => {
  const achados = [];
  for (const f of ARQUIVOS) {
    const linhas = (await readFile(new URL(`../src/${f}`, import.meta.url), "utf8")).split("\n");
    linhas.forEach((l, i) => { if (TRACO.test(l)) achados.push(`${f}:${i + 1}`); });
  }
  assert.deepEqual(achados, []);
});

test("nenhum travessao no texto que a area mostra de outros arquivos", () => {
  assert.deepEqual(MODULOS.filter((m) => TRACO.test(m.sub) || TRACO.test(m.nome)).map((m) => m.id), []);
  assert.deepEqual(SISTEMAS.filter((s) => TRACO.test(s.acessos?.caminho || "")).map((s) => s.id), []);
});

test("a area usa o nome completo do sistema, nunca o curto", async () => {
  for (const f of ARQUIVOS.filter((x) => /\.(jsx|mjs)$/.test(x))) {
    const src = await readFile(new URL(`../src/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /\bnomeSis\(/, `${f} usa nomeSis (curto); use nomeCompletoSis`);
  }
});
