// Vínculo do bem do inventário com a ficha de cima (painel-ativos).
// Toda chamada leva o crachá; quem barra de verdade é o servidor.
import { comCracha, mensagemDoStatus } from "../lib/sessao.js";
import { API } from "../lib/api.js";

const BASE = `${API}/painel-ativos`;

async function chamar(action, dados = {}) {
  const resp = await comCracha(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...dados }),
  });
  const corpo = await resp.json().catch(() => null);
  if (!resp.ok) throw Object.assign(new Error(corpo?.erro || mensagemDoStatus(resp.status)), { status: resp.status, parcial: corpo?.parcial === true });
  return corpo;
}

const pedido = ({ bemId, ativoId, versaoFicha = "", versaoBem = "", origem }) =>
  ({ bemId, ativoId, versaoFicha: versaoFicha || "", versaoBem: versaoBem || "", ...(origem ? { origem } : {}) });

// As fichas que o Patrimônio enxerga e, para quem não tem Segurança, só o par
// {ativoId, bemId} das fichas de Segurança (sem nome nem detalhe).
export const lerFichasDoPatrimonio = () => chamar("listarPatrimonio")
  .then((r) => ({ itens: r.itens || [], vinculosOcultos: Array.isArray(r.vinculosOcultos) ? r.vinculosOcultos : [] }));
// Liga gravando só a ficha (bemId). Repetição responde jaLigado sem gravar.
export const vincularFicha = (dados) => chamar("vincularFicha", pedido(dados));
// Desfaz o par nos dois lados, onde existir. Repetição responde jaDesfeito.
export const desvincularFicha = (dados) => chamar("desvincularFicha", pedido(dados));
export const lerHistoricoVinculo = (bemId) => chamar("historicoVinculo", { bemId }).then((r) => r.eventos || []);
