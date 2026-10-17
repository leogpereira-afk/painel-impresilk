// A agenda, so para ver. Leituras sem escrita -- e nao ha o que
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

/** Calendário da empresa: eventos e celebrações projetadas do RH. */
export const lerEmpresa = (mes) =>
  chamar("empresa", mes).then((r) => ({
    eventos: Array.isArray(r?.eventos) ? r.eventos : [],
    hoje: r?.hoje || "",
    consultadoEm: r?.consultadoEm || "",
  }));

export const lerAgendaPatrimonio=mes=>chamar('patrimonio',mes).then(r=>Array.isArray(r?.eventos)?r.eventos:[]);

/** Vencimentos autorizados, calculados das fichas vigentes de Documentos. */
export const lerAgendaDocumentos = mes => chamar('documentos', mes).then(r => {
  if (!Array.isArray(r?.eventos)) throw new Error('Resposta inválida ao consultar os vencimentos de documentos.');
  return r.eventos;
});

/** Projeções das ações originais: calendário por mês ou agenda completa. */
export const lerAgendaComercial = mes => chamar('comercial', mes).then(r => {
  if (!Array.isArray(r?.eventos) || !Array.isArray(r?.vinculosLegados)) throw new Error('Resposta inválida ao consultar as atividades comerciais.');
  return {eventos:r.eventos,vinculosLegados:r.vinculosLegados,escopo:r.escopo||null,consultadoEm:r.consultadoEm||null};
});

export const lerAgendaCampanhas = mes => chamar('campanhas',mes).then(r=>{
  if(!Array.isArray(r?.eventos))throw Error('Resposta inválida ao consultar as ações das campanhas.');
  return r.eventos;
});
