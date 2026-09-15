/* TODO MÓDULO DO MENU TEM DE TER ROTA.
 *
 * O menu lateral não é uma lista escrita à mão: `CentralShell.jsx` o monta com
 * `MODULOS.filter(m => podeAbrir(m.id, sessao))`. Então acrescentar um id em
 * `src/lib/modulos.js` já faz o botão aparecer na lateral — e se ninguém
 * escrever a rota junto, o clique cai no `<Route path="*">` do fim do App.jsx,
 * que é `<Navigate to="/" replace />`.
 *
 * O resultado é a pior forma de defeito: a pessoa clica em "Planilhas", volta
 * para o Início, e nada avisa. Sem erro no console, sem 404, sem tela branca —
 * só um botão que leva ao lugar errado. Aconteceu em 15/09/2026, na hora em que
 * `planilhas` entrou nas três listas e a tela ainda não existia.
 *
 * Este teste é barato e lê os dois arquivos como texto. Ele não julga o que a
 * rota faz; só cobra que ela exista.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MODULOS } from "../src/lib/modulos.js";

test("todo módulo oferecido no menu tem rota no App", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const rotas = new Set(
    [...app.matchAll(/<Route\s+path="\/([a-z-]+)"/g)].map((m) => m[1]),
  );
  assert.ok(rotas.size >= 10, `esperava a tabela de rotas inteira, achei ${rotas.size}`);

  const semRota = MODULOS.map((m) => m.id).filter((id) => !rotas.has(id));
  assert.deepEqual(semRota, [],
    `estes módulos aparecem no menu e o clique volta para o Início: ${semRota.join(", ")}`);
});

/* E O CAMINHO INVERSO: rota de módulo sem `<Restrito>`.
 *
 * Foi o buraco do `documentos`, que respondeu a qualquer pessoa logada por
 * meses — rota sem guarda, item de menu fora do filtro. A guarda da TELA não é
 * a que vale (quem vale é a porta de dados), mas a ausência dela é o sinal de
 * que ninguém pensou no assunto ao criar a rota.
 */
test("rota de módulo é protegida por <Restrito>", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const protegidos = new Set(
    [...app.matchAll(/<Restrito\s+modulo="([a-z-]+)"/g)].map((m) => m[1]),
  );
  /* `configuracoes` tem guarda própria (podeConfigurar, dentro da própria
     tela), e `glossario` é aberto de propósito: é vocabulário da casa, não
     dado. Exceção escrita é exceção decidida; exceção silenciosa é esquecimento. */
  const SEM_RESTRITO = new Set(["configuracoes", "glossario"]);
  const desprotegidos = MODULOS.map((m) => m.id)
    .filter((id) => !SEM_RESTRITO.has(id) && !protegidos.has(id));
  assert.deepEqual(desprotegidos, [],
    `rota de módulo sem <Restrito>: ${desprotegidos.join(", ")}`);
});
