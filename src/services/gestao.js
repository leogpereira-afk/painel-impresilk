// Gestao estrategica: identidade, plano do ano, taticas, atas e ciclo.
//
// FONTE UNICA: tudo passa pela Edge Function painel-gestao, que e a mesma
// porta que a Central do Leo usa para as taticas da Impresilk. Nao existe
// tabela paralela nem copia -- editar de um lado muda o registro que o outro
// le.

import { comCracha, mensagemDoStatus } from "../lib/sessao.js";
import { API } from "../lib/api.js";

const BASE = `${API}/painel-gestao`;

async function chamar(action, corpo = {}) {
  const resp = await comCracha(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...corpo }),
  });
  const body = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(body?.erro || mensagemDoStatus(resp.status));
  return body;
}

// Um pedido so traz a tela inteira. Cinco blocos com cinco chamadas fariam a
// tela abrir em cascata, cada bloco pulando na hora que chegasse.
export const lerGestao = (empresa = "Impresilk") => chamar("tudo", { empresa });

export const salvarIdentidade = (dados) => chamar("salvarIdentidade", dados);
export const salvarValor = (valor) => chamar("salvarValor", { valor }).then((r) => r.valor);
export const removerValor = (id) => chamar("removerValor", { id });

export const salvarPlano = (dados) => chamar("salvarPlano", dados).then((r) => r.plano);
export const salvarObjetivo = (objetivo) => chamar("salvarObjetivo", { objetivo }).then((r) => r.objetivo);
export const removerObjetivo = (id) => chamar("removerObjetivo", { id });
export const salvarIndicador = (indicador) => chamar("salvarIndicador", { indicador }).then((r) => r.indicador);
export const removerIndicador = (id) => chamar("removerIndicador", { id });

export const salvarTatica = (tatica) => chamar("salvarTatica", { tatica }).then((r) => r.tatica);
export const removerTatica = (id) => chamar("removerTatica", { id });

export const salvarReuniao = (reuniao) => chamar("salvarReuniao", { reuniao }).then((r) => r.reuniao);
export const aprovarAta = (id) => chamar("aprovarAta", { id }).then((r) => r.reuniao);
export const salvarDecisao = (decisao) => chamar("salvarDecisao", { decisao }).then((r) => r.decisao);
export const gerarAcoes = (reuniaoId, objetivoId) => chamar("gerarAcoes", { reuniaoId, objetivoId });

export const encerrarCiclo = (dados) => chamar("encerrarCiclo", dados);

// Acordeao lembrado por pessoa. Falha em silencio de proposito: nao lembrar
// qual bloco estava aberto nao pode virar erro na tela.
export const gravarPreferencia = (bloco, aberto) =>
  chamar("preferencia", { bloco, aberto }).catch(() => {});
