/* A situação de um bem: o que vence primeiro, data ou medidor.
 *   node --test src/lib/calc/ativos.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { situacao } from "./ativos.js";

const HOJE = "2026-08-24";

test("medidor marcado e SEM leitura não vira 'Em dia'", () => {
  // O caso ruim: revisão marcada para 1.500 h e ninguém foi medir.
  const s = situacao({ medidorProximo: 1500 }, HOJE);
  assert.equal(s.nivel, "atencao");
  assert.equal(s.rotulo, "Falta ler o medidor");
  assert.equal(s.semLeitura, true);
});

test("leitura ZERO escrita por alguém continua sendo leitura", () => {
  const s = situacao({ medidorProximo: 1500, medidorAtual: 0 }, HOJE);
  assert.equal(s.semLeitura, undefined, "zero é resposta quando alguém a escreveu");
  assert.equal(s.nivel, "ok");
});

test("com data em dia e medidor sem leitura, a tela diz as duas coisas", () => {
  const s = situacao({ validade: "2027-08-24", medidorProximo: 1000 }, HOJE);
  assert.equal(s.nivel, "ok");
  assert.match(s.rotulo, /falta ler o medidor/);
});

test("sem data e sem medidor continua 'Sem controle'", () => {
  assert.equal(situacao({}, HOJE).nivel, "sem");
});

test("medidor estourado vence, mesmo com data boa", () => {
  const s = situacao({ validade: "2027-08-24", medidorProximo: 1000, medidorAtual: 1200 }, HOJE);
  assert.equal(s.nivel, "vencido");
});
