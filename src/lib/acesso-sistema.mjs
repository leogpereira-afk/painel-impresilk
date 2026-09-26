// QUEM ENTRA EM CADA SISTEMA, e a palavra que resume. Regra pura, sem tela.
//
// A Visao geral e a aba Sistemas contam e pintam cada sistema por AQUI. Antes a
// Visao geral tinha uma conta propria, diferente da aba Sistemas: o mesmo PCP
// aparecia "Consultado" numa e "1 senha temporaria" na outra. Uma regra so.

import { estadoDoPapel } from "./acesso-state.mjs";

// Para comparar nome com login sem tropecar em acento e maiuscula: a mesma
// regra que o servidor usa. "Barbara Patrícia" tem de casar com "barbara patricia".
export const norma = (s) =>
  String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();

/* A OUTRA LENTE: "quem entra no PCP, e com que login?".
   Esta pergunta nao tinha resposta em lugar nenhum: era abrir o sistema e
   olhar. Aqui ela sai do mesmo dado da lente por pessoa: as contas que existem
   de verdade la, com o nome de quem e (ou "de ninguem", que e o caso a
   resolver).

   O RECORTE E O SISTEMA, e o conjunto e FECHADO: o que existe naquele sistema
   esta nesta lista, ponto. Se aparecer alguem aqui que voce nao conhece, e
   porque essa pessoa entra la de verdade. */
export function contasDoSistema(sistema, contas, soltas, elenco) {
  const fora = [];
  const dentro = [];
  for (const c of contas || []) {
    const p = (c.papeis || []).find((x) => x.sistema === sistema);
    if (!p) continue;
    if (p.real?.existe) {
      dentro.push({
        login: p.real.login, papel: p.real.papel, ativo: p.real.ativo,
        temporaria: p.real.temporaria, dono: c, tom: estadoDoPapel(p).tom,
        estado: estadoDoPapel(p).chave,
      });
    } else {
      fora.push({ login: p.login, dono: c });
    }
  }
  for (const s of soltas?.[sistema] || []) {
    dentro.push({
      login: s.login, papel: s.papel, ativo: s.ativo, temporaria: s.temporaria,
      dono: null, tom: "warn", nome: s.nome,
      estado: s.ativo === false ? "desativada" : s.temporaria ? "temporaria" : "ok",
    });
  }
  dentro.sort((a, b) => String(a.login).localeCompare(String(b.login), "pt-BR"));

  /* O ELENCO DE DENTRO. Quem o sistema conhece e NAO tem conta aqui: as 40
     pessoas do POPs, as 93 fichas do RH, os 15 instaladores do PCP. Quem ja
     aparece como conta sai da lista para nao ser contado duas vezes. */
  const jaTem = new Set(dentro.map((l) => norma(l.login)).concat(dentro.map((l) => norma(l.dono?.nome))));
  const outros = (elenco?.[sistema] || []).filter((e) => !jaTem.has(norma(e.nome)));

  return {
    dentro,
    fora,
    outros,
    // Instalador do PCP e fornecedor do Compras nao sao "so cadastro": eles
    // ENTRAM, por outro caminho. Contados por caminho, nao somados.
    entram: ["nome", "link"]
      .map((k) => ({ como: k, n: outros.filter((e) => e.como === k).length }))
      .filter((x) => x.n > 0),
    semDono: dentro.filter((l) => !l.dono).length,
    temporarias: dentro.filter((l) => l.temporaria && l.ativo !== false).length,
    incompletas: dentro.filter((l) => l.tom === "bad").length,
    desativadas: dentro.filter((l) => l.ativo === false).length,
  };
}

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/* TODAS AS SITUACOES DE UM SISTEMA, da mais grave para a mais leve. O cabecalho
   da secao mostra UM selo (o primeiro) e "+N" para o resto; aberta, a secao
   lista todas por extenso. A ordem e a regra:
     1. vermelho: a tela promete conta que nao existe; conta que nao abre nada;
     2. amarelo: entra sem senha ou por link; conta sem dono; senha provisoria;
     3. cinza: desativada; ninguem entra;
     4. verde "em ordem" SO quando nada acima vale. Ele aparecia ao lado de
        "3 entram sem senha", e as duas frases juntas se desmentem. E sistema
        com zero contas ganhava verde: verde onde nao ha nada e mentira. */
export function situacoesDoSistema(dados) {
  const d = dados || {};
  const todas = [];
  if (d.fora?.length) todas.push({ tom: "bad", texto: `${d.fora.length} sem conta lá` });
  if (d.incompletas) todas.push({ tom: "bad", texto: `${d.incompletas} sem nenhuma parte` });
  for (const x of d.entram || []) {
    todas.push({
      tom: "warn",
      texto: x.como === "nome" ? plural(x.n, "entra sem senha", "entram sem senha") : plural(x.n, "entra por link", "entram por link"),
    });
  }
  if (d.semDono) todas.push({ tom: "warn", texto: `${d.semDono} sem dono` });
  if (d.temporarias) todas.push({ tom: "warn", texto: plural(d.temporarias, "senha provisória", "senhas provisórias") });
  if (d.desativadas) todas.push({ tom: "neutral", texto: plural(d.desativadas, "desativada", "desativadas") });
  if (!d.dentro?.length && !d.entram?.length && !d.fora?.length) todas.push({ tom: "neutral", texto: "ninguém entra" });
  return todas;
}

/** O selo do sistema: `{ tom, texto, mais, todas }`. */
export function seloDoSistema(dados, { externa = false } = {}) {
  if (externa) return { tom: "neutral", texto: "gestão externa", mais: 0, todas: [] };
  const todas = situacoesDoSistema(dados);
  if (!todas.length) return { tom: "ok", texto: "em ordem", mais: 0, todas };
  return { ...todas[0], mais: todas.length - 1, todas };
}

/** A segunda linha do sistema na Visao geral. Com zero contas ela diz
    "nenhuma conta", e nao "ninguem entra": essa frase ja e a do selo ao lado,
    e a mesma frase duas vezes na mesma linha parece defeito. */
export function contagemDoSistema(dados, { externa = false } = {}) {
  if (externa) return "administrado lá dentro";
  const n = dados?.dentro?.length || 0;
  return n ? `${n} com conta` : "nenhuma conta";
}

/** Sistema cujos acessos moram no proprio sistema (Domo, Bosques, nao integrado). */
export const ehExterna = (sistema, fonte) =>
  fonte?.estado === "nao_integrado" || ["domo", "bosques"].includes(sistema);
