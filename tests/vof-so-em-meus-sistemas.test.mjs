/* O MÉTODO V.O.F. SÓ APARECE EM "MEUS SISTEMAS".
 *
 * Decisão do Léo (26/09/2026): o V.O.F. não entra na lateral do grupo
 * IMPRESILK, que toda a equipe vê. Ele aparece só em "Meus sistemas", para
 * quem tem acesso a ele.
 *
 * Quem faz isso é `pessoal: true` no bloco do registro (src/lib/sistemas.js).
 * O único leitor de `pessoal` é a lateral (CentralShell.jsx); "Meus sistemas",
 * a entrada única e a tela de Acessos leem outras chaves. Então os dois lados
 * precisam de guarda: tirar o `pessoal` põe o atalho de volta à vista da
 * equipe, calado; e um filtro novo que passasse a ler `pessoal` em "Meus
 * sistemas" ou na entrada única tiraria o V.O.F. de quem tem acesso, também
 * calado.
 *
 * A lateral é lida do PRÓPRIO CentralShell.jsx (o filtro de cada grupo é
 * extraído do texto e avaliado), e não copiada aqui: cópia de regra envelhece
 * sem avisar. Começa pelo caso ruim: sem `pessoal`, o filtro TEM de pôr o
 * V.O.F. no grupo IMPRESILK, senão a guarda nunca dispararia.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SISTEMAS, CHAVE_CRACHA, ENDERECO_DIRETO, sistemaNoPainel } from "../src/lib/sistemas.js";

const ENDERECO_VOF = "https://leogpereira-afk.github.io/metodo-vof/";

/** Os grupos da lateral, na ordem da tela, com o filtro de cada um. */
function gruposDaLateral() {
  const shell = readFileSync(new URL("../src/components/CentralShell.jsx", import.meta.url), "utf8");
  const achados = [...shell.matchAll(/\{nome:'([^']+)',\s*links:SISTEMAS\.filter\((.+?)\)\}/g)];
  assert.ok(achados.length >= 1, "não achei os grupos da lateral em CentralShell.jsx (o formato mudou?)");
  return achados.map(([, nome, filtro]) => ({ nome, filtro: new Function(`return (${filtro})`)() }));
}

const vof = SISTEMAS.find((s) => s.id === "vof");

test("o V.O.F. está no registro, com o endereço e a gaveta do crachá", () => {
  // Sem isto os testes abaixo passariam por ausência, e não por decisão.
  assert.ok(vof, "o bloco vof sumiu de src/lib/sistemas.js");
  assert.equal(vof.url, ENDERECO_VOF);
  assert.equal(vof.entradaUnica?.endereco, ENDERECO_VOF);
  assert.equal(vof.entradaUnica?.chave, "vof_cracha");
});

test("O CASO RUIM: sem `pessoal`, a lateral poria o V.O.F. no grupo que a equipe vê", () => {
  const [daEquipe] = gruposDaLateral();
  assert.equal(daEquipe.nome, "IMPRESILK");
  const semPessoal = { ...vof, pessoal: undefined };
  // O filtro devolve o endereço (verdadeiro), não `true`: vale o que o
  // Array.filter veria.
  assert.ok(daEquipe.filtro(semPessoal),
    "o filtro do grupo IMPRESILK não pega mais um sistema comum; esta guarda deixou de provar alguma coisa");
});

test("o V.O.F. não aparece em nenhum grupo da lateral", () => {
  for (const grupo of gruposDaLateral()) {
    const ids = SISTEMAS.filter(grupo.filtro).map((s) => s.id);
    assert.ok(!ids.includes("vof"),
      `o V.O.F. aparece na lateral, no grupo ${grupo.nome} (falta \`pessoal: true\` no bloco vof de src/lib/sistemas.js?)`);
  }
});

test("`pessoal` não tira o V.O.F. da tela de Acessos nem da entrada única", () => {
  // Acessos e "Meus sistemas" filtram por sistemaNoPainel (lista escrita à
  // mão, que tira domo e bosques); o V.O.F. tem de continuar fora dela.
  assert.equal(sistemaNoPainel("vof"), true);
  assert.equal(CHAVE_CRACHA.vof, "vof_cracha");
  assert.equal(ENDERECO_DIRETO.vof, ENDERECO_VOF);
});

test("quem tem acesso recebe o crachá e vê o V.O.F. em Meus sistemas", async () => {
  const gaveta = new Map();
  const falso = {
    getItem: (k) => (gaveta.has(k) ? gaveta.get(k) : null),
    setItem: (k, v) => gaveta.set(k, String(v)),
    removeItem: (k) => gaveta.delete(k),
  };
  const antes = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { value: falso, configurable: true, writable: true });
  try {
    const { plantarCrachas, meusSistemas, enderecoDe } = await import("../src/lib/entradaUnica.js");
    assert.deepEqual(plantarCrachas({ vof: { token: "cracha-de-teste" } }), ["vof"]);
    assert.equal(gaveta.get("vof_cracha"), "cracha-de-teste");

    // A lista que a entrada única grava vem do servidor: só tem o vof quem
    // tem linha ativa dele em acesso_papel.
    gaveta.set("painel_meus_sistemas", JSON.stringify(["pops", "vof"]));
    assert.deepEqual(meusSistemas(), ["pops", "vof"]);
    assert.equal(enderecoDe("vof"), ENDERECO_VOF);

    gaveta.set("painel_meus_sistemas", JSON.stringify(["pops"]));
    assert.deepEqual(meusSistemas(), ["pops"], "quem não tem acesso não pode ver o atalho");
  } finally {
    if (antes) Object.defineProperty(globalThis, "localStorage", antes);
    else delete globalThis.localStorage;
  }
});
