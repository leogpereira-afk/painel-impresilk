// A agenda, so para ver. Duas leituras, nenhuma escrita -- e nao ha o que
// escrever: a function painel-agenda nao tem acao de gravar. Quem programa O.S.,
// lanca plantao ou registra evento continua fazendo isso no PCP; quem lanca
// evento da empresa, no RH. Aqui e a vitrine.

import { comCracha, mensagemDoStatus } from "../lib/sessao.js";
import { API } from "../lib/api.js";

const BASE = `${API}/painel-agenda`;

async function chamar(action, mes) {
  const resp = await comCracha(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, mes }),
  });
  const body = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(body?.erro || mensagemDoStatus(resp.status));
  return body;
}

/** Calendario da producao e Programacao: O.S. do mes, eventos e plantoes. */
export const lerProducao = (mes) =>
  chamar("producao", mes).then((r) => ({
    os: Array.isArray(r?.os) ? r.os : [],
    eventos: Array.isArray(r?.eventos) ? r.eventos : [],
    plantoes: Array.isArray(r?.plantoes) ? r.plantoes : [],
    hoje: r?.hoje || "",
    consultadoEm: r?.consultadoEm || "",
  }));

/** Calendario da empresa: so os eventos lancados no RH. Sem dado de pessoa. */
export const lerEmpresa = (mes) =>
  chamar("empresa", mes).then((r) => ({
    eventos: Array.isArray(r?.eventos) ? r.eventos : [],
    hoje: r?.hoje || "",
    consultadoEm: r?.consultadoEm || "",
  }));
