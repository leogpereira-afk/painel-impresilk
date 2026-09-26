/* A SITUACAO DO BACKUP (Visao geral e aba Backups leem a mesma funcao).
 *
 * Os casos ruins primeiro: status vazio, sistema que nunca teve copia,
 * rodada com mais de 36 horas (o disparo diario e cego), sistema do elenco que
 * nao voltou na rodada, e falha junto com atraso. Cada um ja passou calado.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { situacaoDoBackup, linhasDoBackup, quandoCurto } from "../src/lib/backup-situacao.mjs";
import { SISTEMAS } from "../src/lib/sistemas.js";

const AGORA = Date.parse("2026-09-26T15:00:00Z");
const horasAtras = (h) => new Date(AGORA - h * 36e5).toISOString();
// Todos os sistemas copiaveis, com copia boa de 2 horas atras.
function tudoBem(extra = {}) {
  const sistemas = Object.fromEntries(SISTEMAS.filter((s) => !s.soLeitura || ["domo", "bosques"].includes(s.id))
    .map((s) => [s.id, { ok: true, em: horasAtras(2), registros: 10 }]));
  return { atualizadoEm: horasAtras(2), sistemas: { ...sistemas, ...extra } };
}

test("status vazio: nenhuma copia ainda (e nao 'em dia')", () => {
  const s = situacaoDoBackup(null, SISTEMAS, { agora: AGORA });
  assert.equal(s.palavra, "Nenhuma cópia ainda");
  assert.equal(s.tom, "warn");
  assert.equal(situacaoDoBackup({}, SISTEMAS, { agora: AGORA }).palavra, "Nenhuma cópia ainda");
});

test("tudo certo: em dia, e so entao verde", () => {
  const s = situacaoDoBackup(tudoBem(), SISTEMAS, { agora: AGORA });
  assert.equal(s.tom, "ok");
  assert.equal(s.palavra, "Em dia");
  assert.match(s.sub, /Última rodada hoje/);
});

test("mais de 36 horas: atrasado, com as horas escritas", () => {
  const st = tudoBem({ pcp: { ok: true, em: horasAtras(40), registros: 3 } });
  const s = situacaoDoBackup(st, SISTEMAS, { agora: AGORA });
  assert.equal(s.palavra, "Atrasado");
  assert.equal(s.tom, "bad");
  assert.match(s.sub, /40 horas/);
});

test("sistema que nunca teve copia: diz o nome, e nao 'data desconhecida'", () => {
  const st = tudoBem({ pops: { ok: false, erro: "falha", ultimoValido: null } });
  const s = situacaoDoBackup(st, SISTEMAS, { agora: AGORA });
  assert.equal(s.palavra, "1 sistema falhou");
  assert.match(s.sub, /Pops & Fabricação na última rodada/);
  assert.match(s.segunda, /Pops & Fabricação ainda não tem nenhuma cópia guardada/);
  assert.doesNotMatch(`${s.sub} ${s.segunda}`, /desconhecida/);
  assert.deepEqual(s.nuncaCopiado, ["Pops & Fabricação"]);
});

test("sistema do elenco que nao voltou na rodada vira falha, com o nome", () => {
  const st = tudoBem();
  delete st.sistemas.vof;
  const s = situacaoDoBackup(st, SISTEMAS, { agora: AGORA });
  assert.equal(s.tom, "bad");
  assert.match(s.sub, /Método V\.O\.F\. não voltou na rodada/);
  assert.ok(linhasDoBackup(st, SISTEMAS).some((l) => l.id === "vof" && l.estado === "semRodada"));
});

test("falhou e atrasado juntos: as duas coisas aparecem", () => {
  const st = tudoBem({
    rh: { ok: false, erro: "x", ultimoValido: horasAtras(50) },
    pcp: { ok: true, em: horasAtras(45) },
  });
  const s = situacaoDoBackup(st, SISTEMAS, { agora: AGORA });
  assert.equal(s.palavra, "1 sistema falhou");
  assert.match(s.segunda, /50 horas/);
});

test("copiando: a palavra e 'Copiando', com o progresso", () => {
  const s = situacaoDoBackup(tudoBem(), SISTEMAS, { agora: AGORA, progresso: { numero: 3, total: 9 } });
  assert.equal(s.palavra, "Copiando");
  assert.equal(s.sub, "Copiando 3 de 9.");
  assert.equal(situacaoDoBackup(tudoBem(), SISTEMAS, { agora: AGORA, progresso: { numero: 0, total: 0 } }).sub, "Preparando a cópia.");
});

test("Domo e Bosques sao copiados e aparecem, no fim, fora da Impresilk", () => {
  const linhas = linhasDoBackup(tudoBem(), SISTEMAS);
  const fora = linhas.filter((l) => !l.daCasa).map((l) => l.id);
  assert.deepEqual(fora.sort(), ["bosques", "domo"]);
  assert.ok(linhas.findIndex((l) => l.id === "domo") > linhas.findIndex((l) => l.id === "vof"));
  assert.equal(linhas[0].id, "painel", "a ordem e a do registro");
});

test("quando curto: hoje, ontem, data", () => {
  assert.match(quandoCurto(horasAtras(1), AGORA), /^hoje, \d\d:\d\d$/);
  assert.match(quandoCurto(horasAtras(24), AGORA), /^ontem, /);
  assert.match(quandoCurto(horasAtras(24 * 5), AGORA), /^21\/09, /);
  assert.equal(quandoCurto("", AGORA), "");
});
