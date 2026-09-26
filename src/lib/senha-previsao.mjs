// ONDE UMA SENHA VAI VALER, antes e depois de trocar. Regra pura, sem tela:
// o cartao da pessoa (senha para todos), a Minha conta e o teste usam as mesmas
// funcoes.
//
// As duas perguntas que o dono faz sao "vale para todos?" e, depois, "valeu
// onde?". A resposta do servidor (contrato das senhas, secoes 3 e 4) traz um
// item por sistema; aqui ele vira uma linha com palavra e cor, na ordem que
// pede acao primeiro: o que falhou, o que ficou sem conta, a entrada, o que
// trocou e o que abre pela entrada.
//
// NENHUM RESULTADO SOME. Sistema que o registro nao conhece, ou que o Painel
// esconde (Domo, Bosques), aparece com o proprio nome mesmo assim: filtro
// calado ja fez a direcao achar que tinha concedido o que nao tinha.

import { SISTEMAS, doSistema, nomeCompletoSis } from "./sistemas.js";

const ORDEM = new Map(SISTEMAS.map((s, i) => [s.id, i]));
const posicao = (id) => (ORDEM.has(id) ? ORDEM.get(id) : 999);

// Central do Leo e DRE nao guardam senha propria: abrem pela entrada unica.
const PELA_ENTRADA = new Set(["central", "dre"]);
// Quem obriga a trocar a senha provisoria na proxima entrada (contrato, secao 4).
const OBRIGAM = new Set(["brief", "pcp", "pops", "vof"]);
// Em "Dar acesso" e em "Senha nova so no sistema", a senha sai provisoria so
// nestes: no Painel e no RH a senha de um sistema sai definitiva.
const PROVISORIA_NO_SISTEMA = new Set(["brief", "pcp", "compras", "pops", "vof"]);

export const provisoriaNoSistema = (id) => PROVISORIA_NO_SISTEMA.has(id);

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

function juntar(nomes, ultimo = "e") {
  if (nomes.length <= 1) return nomes.join("");
  return `${nomes.slice(0, -1).join(", ")} ${ultimo} ${nomes.at(-1)}`;
}

const ENTRADA = "entrada";

/**
 * "Vai valer em": o que o cartao da pessoa mostra ANTES de definir a senha.
 * Sai de `conta.papeis` (o que a tela ja leu de cada sistema) e do registro.
 */
export function previsaoDaSenha(conta) {
  const itens = [
    { chave: ENTRADA, sistema: ENTRADA, nome: "Entrada pelo Painel", detalhe: "abre os outros sistemas", tom: "neutral", selo: "entrada" },
  ];
  const papeis = [...(conta?.papeis || [])].sort((a, b) => posicao(a.sistema) - posicao(b.sistema));
  for (const p of papeis) {
    const nome = nomeCompletoSis(p.sistema);
    const login = p.real?.login || p.login || "";
    if (PELA_ENTRADA.has(p.sistema)) {
      itens.push({ chave: p.sistema, sistema: p.sistema, nome, detalhe: "abre pela entrada, com a mesma senha", tom: "neutral", selo: "pela entrada" });
    } else if (p.fonte === "nao_integrado" || doSistema(p.sistema).soLeitura) {
      itens.push({ chave: p.sistema, sistema: p.sistema, nome, detalhe: "senha própria, fora do Painel", tom: "neutral", selo: "fora do Painel" });
    } else if (!p.real?.existe) {
      itens.push({ chave: p.sistema, sistema: p.sistema, nome, detalhe: `não tem conta "${login}" lá`, tom: "warn", selo: "não recebe" });
    } else {
      itens.push({ chave: p.sistema, sistema: p.sistema, nome, detalhe: login ? `login ${login}` : "", tom: "ok", selo: "recebe" });
    }
  }
  return itens;
}

const PESO = { falhou: 0, "sem-conta": 1, entrada: 2, trocada: 3, "pela-entrada": 4, fora: 5 };

/**
 * A lista "onde valeu" depois da resposta do servidor.
 * `modo`: "minha" (Minha conta, contrato A) ou "definir" (direcao, contrato B).
 * `usuario`: o usuario de quem trocou, para dizer "o seu login aqui e outro".
 * Aceita tambem o formato antigo (`recusados: [{ sistema, erro }]`), que o
 * cadastro e o "Dar acesso" ainda devolvem.
 */
export function resultadoDaSenha(resposta, { modo = "definir", usuario = "" } = {}) {
  const r = resposta || {};
  const definir = modo === "definir";
  const itens = [];
  if (r.entrada === "trocada") {
    itens.push({ chave: ENTRADA, sistema: ENTRADA, nome: "Entrada pelo Painel", detalhe: "abre os outros sistemas", tom: "ok", selo: definir ? "definida" : "trocada", peso: PESO.entrada });
  } else if (r.entrada === "nao-consolidada") {
    itens.push({
      chave: ENTRADA, sistema: ENTRADA, nome: "Entrada pelo Painel", tom: "warn", selo: "não alcançada", peso: PESO.entrada,
      detalhe: "A sua conta ainda não está na entrada única. A senha nova vale no Painel; fale com a direção para juntar as contas.",
    });
  }
  for (const s of Array.isArray(r.sistemas) ? r.sistemas : []) {
    const nome = nomeCompletoSis(s.sistema);
    const base = { chave: s.sistema, sistema: s.sistema, nome, ordem: posicao(s.sistema) };
    if (s.resultado === "trocada") {
      const diferente = !definir && s.login && usuario && s.login !== usuario;
      const troca = definir && typeof s.obriga === "boolean" ? (s.obriga ? "pede troca na entrada" : "não pede troca") : "";
      itens.push({
        ...base, tom: "ok", selo: definir ? "definida" : "trocada", peso: PESO.trocada,
        // Login diferente do usuario: a linha diz isso por extenso (destaque),
        // e nao repete "login leo" logo acima.
        // `aviso`: o servidor achou a conta pelo NOME (RH sem ficha ligada).
        // Valeu, mas a ligacao e fraca, e a direcao tem de saber.
        detalhe: [s.login && !diferente ? `login ${s.login}` : "", troca, s.aviso || ""].filter(Boolean).join(" · "),
        destaque: diferente ? `o seu login aqui é ${s.login}` : "",
      });
    } else if (s.resultado === "pela-entrada") {
      itens.push({ ...base, tom: "neutral", selo: "pela entrada", peso: PESO["pela-entrada"], detalhe: "abre pela entrada, com a mesma senha" });
    } else if (s.resultado === "fora") {
      // Sistema de senha propria (Domo, Bosques) ou que a troca nao conhece:
      // nao e defeito, mas aparece, com o nome, em vez de sumir.
      itens.push({ ...base, tom: "neutral", selo: "fora do Painel", peso: PESO.fora, detalhe: s.motivo || "senha própria, fora do Painel" });
    } else if (s.resultado === "sem-conta") {
      itens.push({
        ...base, tom: "warn", selo: "sem conta", peso: PESO["sem-conta"],
        detalhe: [s.motivo || "não existe conta ali", definir ? "Resolva na linha do sistema." : ""].filter(Boolean).join(". "),
      });
    } else {
      itens.push({
        ...base, tom: "bad", selo: "falhou", peso: PESO.falhou,
        detalhe: `${s.motivo || "o sistema recusou"}. Continua a senha anterior.`,
      });
    }
  }
  // Formato antigo: quem recebeu (`trocados`) e quem recusou. Recusa nao pode
  // virar silencio.
  // Com a lista nova (`sistemas`) o formato antigo que vem junto e ignorado:
  // os dois juntos contariam o mesmo sistema duas vezes.
  if (!Array.isArray(r.sistemas)) {
    for (const x of Array.isArray(r.trocados) ? r.trocados : []) {
      const id = typeof x === "string" ? x : x?.sistema;
      if (!id || id === ENTRADA) continue;
      itens.push({
        chave: `trocou-${id}`, sistema: id, nome: nomeCompletoSis(id), ordem: posicao(id),
        tom: "ok", selo: definir ? "definida" : "trocada", peso: PESO.trocada,
        detalhe: typeof x === "object" && x?.login ? `login ${x.login}` : "",
      });
    }
  }
  // Formato antigo: quem recusou a conta nova ou a senha. Nao pode virar silencio.
  for (const x of !Array.isArray(r.sistemas) && Array.isArray(r.recusados) ? r.recusados : []) {
    itens.push({
      chave: `recusou-${x.sistema}`, sistema: x.sistema, nome: nomeCompletoSis(x.sistema), ordem: posicao(x.sistema),
      tom: "bad", selo: "não alcançado", peso: PESO.falhou, detalhe: x.erro || x.motivo || "o sistema recusou",
    });
  }
  return itens.sort((a, b) => a.peso - b.peso || (a.ordem ?? -1) - (b.ordem ?? -1));
}

/** Quantos sistemas receberam a senha. */
export const quantosReceberam = (resposta) =>
  (Array.isArray(resposta?.sistemas) ? resposta.sistemas.filter((s) => s.resultado === "trocada").length : 0) ||
  (Array.isArray(resposta?.trocados) ? resposta.trocados.filter((x) => x !== "entrada").length : 0);

/**
 * A frase de cima do resultado. `{ tom, texto, segunda }`.
 * `modo`: "minha" ou "definir"; `nome`: de quem e a senha (so em "definir").
 */
export function mancheteDaSenha(resposta, { modo = "definir", nome = "" } = {}) {
  const r = resposta || {};
  const sistemas = Array.isArray(r.sistemas) ? r.sistemas : [];
  const falharam = sistemas.filter((s) => s.resultado === "falhou");
  const deFora = Array.isArray(r.sistemas)
    ? sistemas.filter((s) => s.resultado === "sem-conta").length
    : (Array.isArray(r.recusados) ? r.recusados.length : 0);
  const definir = modo === "definir";
  const inicio = definir ? `Senha definida para ${nome}` : "Senha trocada";

  /* RESPOSTA SEM A LISTA POR SISTEMA (servidor antigo, que so dizia "ok"): a
     tela nao afirma "em todos os sistemas", porque nao sabe. Dizer mais do que
     o servidor disse foi o que fez a tela antiga prometer 21 acessos que nao
     existiam. */
  if (!Array.isArray(r.sistemas) && !Array.isArray(r.recusados)) {
    return {
      tom: "ok",
      texto: definir ? `${inicio}.` : "Senha trocada. Use a nova da próxima vez que entrar.",
      segunda: "",
    };
  }

  if (r.parcial || falharam.length) {
    const nomes = falharam.map((s) => nomeCompletoSis(s.sistema));
    const soRh = falharam.length === 1 && falharam[0].sistema === "rh";
    const onde = soRh ? "no RH" : nomes.length ? `em ${juntar(nomes)}` : "em um sistema";
    const motivos = falharam.map((s) => s.motivo || "o sistema recusou").join("; ");
    return {
      tom: "aviso",
      texto: `${inicio} em todos os sistemas, menos ${onde}.`,
      segunda: !falharam.length ? "" : soRh
        ? `No RH continua a anterior: ${motivos}.`
        : `Continua a anterior em ${juntar(nomes)}: ${motivos}.`,
    };
  }
  if (!definir && r.entrada === "nao-consolidada") {
    return { tom: "aviso", texto: "Senha trocada no Painel. A entrada única não foi alcançada: veja abaixo.", segunda: "" };
  }
  if (deFora) {
    return {
      tom: "aviso",
      texto: `${inicio}. ${plural(deFora, "sistema ficou", "sistemas ficaram")} de fora: veja abaixo.`,
      segunda: "",
    };
  }
  return {
    tom: "ok",
    texto: definir ? `${inicio} em todos os sistemas.` : "Senha trocada em todos os sistemas. Use a nova da próxima vez que entrar.",
    segunda: "",
  };
}

/**
 * O aviso sobre a troca obrigatoria, montado com os sistemas DELA (janela da
 * senha para todos, passo 1).
 */
export function avisoDeTroca(conta) {
  if (conta?.tipo === "funcao") {
    return "Porta compartilhada: a senha fica definitiva e ninguém é obrigado a trocar.";
  }
  // So conta que existe recebe a senha; sistema sem conta la nao pede troca.
  const ids = new Set((conta?.papeis || []).filter((p) => p.real?.existe).map((p) => p.sistema));
  const obrigam = SISTEMAS.filter((s) => OBRIGAM.has(s.id) && ids.has(s.id)).map((s) => nomeCompletoSis(s.id));
  const naoObrigam = ["compras", "rh"].filter((id) => ids.has(id)).map((id) => `no ${nomeCompletoSis(id)}`);
  /* "PELO PAINEL" SO PARA QUEM ENTRA NO PAINEL. Sem conta no Painel a entrada
     unica nao emite o cracha dele, e a pessoa nunca passa por ali: prometer
     que o Painel obriga a troca era prometer uma porta que ela nao usa. E sem
     nenhum sistema que obrigue, a frase antiga terminava em "ao entrar pelo ." */
  const painel = (conta?.papeis || []).some((p) => p.sistema === "painel" && p.real?.existe && p.real?.ativo !== false);
  const onde = [...(painel ? ["Painel"] : []), ...obrigam];
  let texto = onde.length
    ? `É provisória: ela vai ter de trocar ao entrar pelo ${juntar(onde, "ou")}.`
    : "É provisória, mas nenhum sistema dela obriga a troca na entrada.";
  if (naoObrigam.length) {
    const lista = juntar(naoObrigam);
    texto += ` ${lista.charAt(0).toUpperCase()}${lista.slice(1)} a troca não é obrigatória.`;
  }
  return texto;
}
