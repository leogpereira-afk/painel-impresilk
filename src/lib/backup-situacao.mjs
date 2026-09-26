// A SITUACAO DO BACKUP, num lugar so. A Visao geral (celula "Backup") e a aba
// Backups dizem a mesma coisa porque as duas leem daqui. Antes a regra das 36
// horas e a do "nao voltou na rodada" moravam dentro da tabela da aba Backups,
// e nenhuma outra tela sabia delas.

import { nomeCompletoSis, sistemaNoPainel } from "./sistemas.js";

const FUSO = "America/Sao_Paulo";

/** "26/09/2026, 09:03" no fuso da casa. Vazio quando nao ha data. */
export function quandoBR(iso) {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: FUSO,
  });
}

const diaNoFuso = (t) => new Date(t).toLocaleDateString("pt-BR", { timeZone: FUSO });

/** "hoje, 09:03", "ontem, 22:10", "24/09, 09:03" ou "24/09/2025, 09:03". */
export function quandoCurto(iso, agora = Date.now()) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "";
  const hora = new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: FUSO });
  if (diaNoFuso(t) === diaNoFuso(agora)) return `hoje, ${hora}`;
  if (diaNoFuso(t) === diaNoFuso(agora - 864e5)) return `ontem, ${hora}`;
  const mesmoAno = new Date(t).toLocaleDateString("pt-BR", { year: "numeric", timeZone: FUSO })
    === new Date(agora).toLocaleDateString("pt-BR", { year: "numeric", timeZone: FUSO });
  const dia = new Date(t).toLocaleDateString("pt-BR", mesmoAno
    ? { day: "2-digit", month: "2-digit", timeZone: FUSO }
    : { day: "2-digit", month: "2-digit", year: "numeric", timeZone: FUSO });
  return `${dia}, ${hora}`;
}

/** Horas desde a data; Infinity quando nao ha data (nunca copiado). */
export function horasDesde(iso, agora = Date.now()) {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? (agora - t) / 36e5 : Infinity;
}

// A ultima copia que VALE de um sistema: a desta rodada, se deu certo; senao a
// ultima boa que ficou guardada.
export const ultimaCopia = (s) => (s?.ok ? s.em : s?.ultimoValido) || "";

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const juntar = (nomes) => (nomes.length <= 1 ? nomes.join("") : `${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)}`);

/**
 * Uma linha por sistema, na ordem do registro: primeiro os da Impresilk, depois
 * os que o Painel esconde (Domo, Bosques), que TAMBEM sao copiados. Esconder a
 * falha deles seria silencio.
 */
export function linhasDoBackup(status, SISTEMAS) {
  const sistemas = status?.sistemas || (status?.em ? { painel: status } : null);
  if (!sistemas) return [];
  const ordem = new Map(SISTEMAS.map((s, i) => [s.id, i]));
  const pos = (id) => (ordem.has(id) ? ordem.get(id) : 999);

  /* QUEM ESTA NO ELENCO E NAO APARECEU NA ULTIMA RODADA. O registro do backup
     (SISTEMAS_BACKUP, um secret) e invisivel daqui, e foi assim que sistema
     novo ficou meses sem backup sem ninguem ver. O elenco da tela e o
     src/lib/sistemas.js; quem esta la, nao e so-leitura (central/dre,
     aposentados, nao tem o que copiar) e nao veio na rodada vira linha
     vermelha em vez de silencio. */
  const noStatus = new Set(Object.keys(sistemas));
  const semRodada = SISTEMAS.filter((sx) => !sx.soLeitura && !noStatus.has(sx.id))
    .map((sx) => ({ id: sx.id, nome: nomeCompletoSis(sx.id), estado: "semRodada", quando: "" }));

  const linhas = Object.entries(sistemas).map(([id, s]) => ({
    ...s,
    id,
    nome: nomeCompletoSis(id) || s.nome || id,
    estado: s.emAndamento ? "copiando" : s.ok === false ? "falhou" : "ok",
    quando: ultimaCopia(s),
  }));
  return [...semRodada, ...linhas]
    .map((l) => ({ ...l, daCasa: sistemaNoPainel(l.id) }))
    .sort((a, b) => Number(b.daCasa) - Number(a.daCasa) || pos(a.id) - pos(b.id));
}

/**
 * A situacao em uma palavra: `{ tom, palavra, sub, segunda, curto, falharam,
 * semRodada, maisVelhoHoras, nuncaCopiado }`.
 * `progresso` ({ numero, total }) quando uma copia esta rodando nesta tela.
 */
export function situacaoDoBackup(status, SISTEMAS, { agora = Date.now(), progresso = null } = {}) {
  const linhas = linhasDoBackup(status, SISTEMAS);
  const falharam = linhas.filter((l) => l.estado === "falhou");
  const semRodada = linhas.filter((l) => l.estado === "semRodada");
  const copiadas = linhas.filter((l) => l.estado !== "semRodada");

  /* O DISPARO DIARIO E CEGO: quem chama nao le a resposta, entao uma noite
     inteira pode passar sem gravar nada e nada muda de cor. Aqui a propria
     data denuncia: passou de 36 horas, o aviso aparece. E o unico lugar onde a
     direcao olharia. */
  const idades = copiadas.map((l) => ({ l, h: horasDesde(l.quando, agora) }));
  const maisVelho = idades.reduce((m, x) => (x.h > m.h ? x : m), { l: null, h: -Infinity });
  const maisVelhoHoras = copiadas.length ? maisVelho.h : null;
  const nuncaCopiado = idades.filter((x) => x.h === Infinity).map((x) => x.l.nome);
  const atrasado = copiadas.length > 0 && maisVelho.h > 36;
  const fraseAtraso = !atrasado ? "" : Number.isFinite(maisVelho.h)
    ? `A cópia mais antiga tem ${Math.round(maisVelho.h)} horas. O normal é rodar todo dia.`
    : `${maisVelho.l.nome} ainda não tem nenhuma cópia guardada.`;

  const base = { falharam, semRodada, maisVelhoHoras, nuncaCopiado, atrasado, linhas };

  if (progresso) {
    const sub = progresso.total ? `Copiando ${progresso.numero} de ${progresso.total}.` : "Preparando a cópia.";
    return { ...base, tom: "neutral", palavra: "Copiando", sub, segunda: "", curto: "copiando" };
  }
  if (!linhas.length) {
    return { ...base, tom: "warn", palavra: "Nenhuma cópia ainda", sub: "Copie agora ou baixe uma cópia do Painel.", segunda: "", curto: "sem cópia" };
  }
  const problemas = [...falharam, ...semRodada];
  if (problemas.length) {
    const partes = [];
    if (falharam.length) partes.push(`${juntar(falharam.map((l) => l.nome))} na última rodada.`);
    if (semRodada.length) partes.push(`${juntar(semRodada.map((l) => l.nome))} não ${semRodada.length === 1 ? "voltou" : "voltaram"} na rodada.`);
    return {
      ...base, tom: "bad",
      palavra: problemas.length === 1 ? "1 sistema falhou" : `${problemas.length} sistemas falharam`,
      sub: partes.join(" "),
      segunda: fraseAtraso,
      curto: "ver o que falhou",
    };
  }
  if (atrasado) {
    return { ...base, tom: "bad", palavra: "Atrasado", sub: fraseAtraso, segunda: "", curto: "cópia atrasada" };
  }
  const ultima = status?.atualizadoEm || copiadas.map((l) => l.quando).sort().at(-1);
  return {
    ...base, tom: "ok", palavra: "Em dia",
    sub: `Última rodada ${quandoCurto(ultima, agora) || "sem data"}. O normal é uma por dia.`,
    segunda: "",
    curto: plural(copiadas.length, "sistema copiado", "sistemas copiados"),
  };
}
