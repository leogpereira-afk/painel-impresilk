/* A missão, a visão e os doze valores não levam travessão.
 *
 * Ordem do Léo (23/09/2026): "tirar o travessão". O texto é dele e vai para o
 * Welcome Kit, para a parede da produção e para a tela de início -- em todos
 * esses lugares ele é lido em voz alta por gente, não por mim.
 *
 * POR QUE UM TESTE E NÃO SÓ O CONSERTO: eu escrevi esses textos e travessão é
 * o meu vício de pontuação. Sem guarda, ele volta no primeiro ajuste de uma
 * frase, calado -- ninguém relê os doze valores procurando um tracinho.
 *
 * Começa pelo caso ruim: um texto COM travessão precisa ser pego. Guarda que
 * nunca dispara não prova nada.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MISSAO, VISAO, VALORES } from "../src/lib/identidade.js";

/** Travessão (—) e meia-risca (–). O hífen comum continua permitido. */
const TRAVESSAO = /[–—]/;

const achar = (texto) => TRAVESSAO.test(texto);

test("O CASO RUIM: o detector pega travessão e meia-risca", () => {
  assert.equal(achar("a casa não cobra — sem treinamento à noite"), true);
  assert.equal(achar("de 2020 – 2026"), true);
});

test("hífen de palavra composta NÃO é travessão", () => {
  // Se a guarda acusasse hífen, "boas-vindas" e "segunda-feira" quebrariam o
  // teste e alguém acabaria desligando a regra inteira.
  assert.equal(achar("carta de boas-vindas na segunda-feira"), false);
});

test("a missão e a visão não têm travessão", () => {
  assert.equal(achar(MISSAO), false, MISSAO);
  assert.equal(achar(VISAO), false, VISAO);
});

test("nenhum dos doze valores tem travessão, em nenhum dos três campos", () => {
  assert.equal(VALORES.length, 12);
  for (const v of VALORES) {
    for (const campo of ["titulo", "texto", "quebra"]) {
      assert.equal(achar(v[campo]), false, `valor ${v.n}, ${campo}: ${v[campo]}`);
    }
  }
});
