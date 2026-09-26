// A REGRA DA SENHA, do lado da tela. E a mesma do contrato das senhas
// (painel-redesenho/contrato-senhas.md, secao 0.6), que vale no servidor para as
// duas trocas: a minha (Minha conta) e a que a direcao define para uma pessoa.
//
// Por que a tela repete a regra, se o servidor confere de novo: para a pessoa
// ver ANTES de enviar o que falta, em vez de ler "senha invalida" depois. Quem
// manda continua sendo o servidor; aqui e so o espelho.
//
// NADA E APARADO NEM CORTADO. A versao antiga do servidor fazia `texto(senha, 80)`,
// que tirava espaco das pontas e cortava no 80: a pessoa digitava uma senha e
// passava a valer outra, sem aviso. A regra agora recusa o que fura, dizendo o
// motivo, e a tela mostra exatamente isso.
//
// O teto e de 72 BYTES, nao de 72 letras: o bcrypt do Supabase Auth so olha os
// 72 primeiros bytes, e acima disso a mesma senha valeria diferente no Auth e no
// PBKDF2 dos outros sistemas. Letra com acento ocupa 2 bytes, por isso a regra
// avisa que "acento conta dobrado" quando ha acento na senha.

export const MINIMO = 6;
export const MAXIMO_BYTES = 72;

export const bytesDe = (s) => new TextEncoder().encode(String(s ?? "")).length;
// Caracteres de verdade (um emoji e um so), e nao unidades de UTF-16.
export const caracteresDe = (s) => [...String(s ?? "")].length;

/**
 * Confere a senha nova e devolve uma regra por linha, na ordem em que a tela
 * mostra: `[{ id, ok, texto }]`.
 *
 * `atual` (so na troca da propria senha) acrescenta "diferente da senha atual".
 * `repetida` (quando ha o campo "Repita") acrescenta "as duas iguais".
 * Passar `undefined` deixa a regra de fora; string vazia conta como digitado.
 */
export function conferirSenha(nova, { atual, repetida } = {}) {
  const s = String(nova ?? "");
  const temAcento = bytesDe(s) !== s.length;
  const regras = [
    { id: "min", ok: caracteresDe(s) >= MINIMO, texto: `${MINIMO} caracteres ou mais` },
    {
      id: "max",
      ok: bytesDe(s) <= MAXIMO_BYTES,
      texto: temAcento ? `até ${MAXIMO_BYTES} caracteres (acento conta dobrado)` : `até ${MAXIMO_BYTES} caracteres`,
    },
    { id: "pontas", ok: !/^\s|\s$/u.test(s), texto: "sem espaço no começo nem no fim" },
  ];
  if (atual !== undefined) {
    regras.push({ id: "diferente", ok: s.length > 0 && s !== String(atual), texto: "diferente da senha atual" });
  }
  if (repetida !== undefined) {
    regras.push({ id: "iguais", ok: s.length > 0 && String(repetida) === s, texto: "as duas iguais" });
  }
  return regras;
}

/** Todas as regras cumpridas. */
export const senhaPassa = (regras) => regras.every((r) => r.ok);

/**
 * A senha para todos (direcao): o que mandar ao servidor.
 * "gerar": nenhuma senha (o servidor gera). "escolher": a digitada, se passar
 * na regra. `{ ok, senha, regras }`; com `ok: false` NADA e enviado.
 */
export function prepararDefinicao({ modo, nova, repetida }) {
  if (modo !== "escolher") return { ok: true, senha: undefined, regras: [] };
  const regras = conferirSenha(nova, { repetida });
  return { ok: senhaPassa(regras), senha: senhaPassa(regras) ? nova : undefined, regras };
}

/**
 * A minha senha (Minha conta): pode enviar? `{ ok, regras, faltaAtual }`.
 * Sem a senha atual nao se envia: e ela que prova que quem troca e a pessoa.
 */
export function prepararTroca({ atual, nova, repetida }) {
  const regras = conferirSenha(nova, { atual, repetida });
  const faltaAtual = !String(atual ?? "").length;
  return { ok: !faltaAtual && senhaPassa(regras), regras, faltaAtual };
}

/**
 * Onde mostrar o erro da troca da minha senha (contrato A, tabela de erros).
 * `{ onde: "atual" | "aviso", tom, texto }`. "Senha atual incorreta" vai para
 * debaixo do campo da senha atual (e so ela e limpa); o resto vira aviso acima
 * do botao, e os campos ficam.
 */
export function classificarErroTroca(erro) {
  const texto = String(erro?.message || erro || "Não consegui trocar a senha. Tente de novo.");
  const status = Number(erro?.status) || 0;
  if (/senha atual incorreta/i.test(texto) || (status === 401 && !erro?.semSessao)) {
    return { onde: "atual", tom: "erro", texto };
  }
  if (status === 409 || status === 503 || /em andamento|em instantes|agora\. Tente/i.test(texto)) {
    return { onde: "aviso", tom: "aviso", texto };
  }
  return { onde: "aviso", tom: "erro", texto };
}
