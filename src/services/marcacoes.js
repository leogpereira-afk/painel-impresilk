import { comCracha, mensagemDoStatus, podeAbrir } from "../lib/sessao.js";

import { API } from "../lib/api.js";

const BASE = `${API}/painel-config`;

async function chamar(action, corpo) {
  const resp = await comCracha(BASE, {
    method: "POST",
    // keepalive: o botao "Chamar" grava e MANDA a pessoa para o WhatsApp no
    // mesmo gesto. Sem isto o navegador (o iPhone principalmente) descarta o
    // pedido ao jogar a aba para o fundo, e "eu chamei" nunca vira fato.
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...corpo }),
  });
  const body = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(body?.erro || mensagemDoStatus(resp.status));
  return body;
}

// Lê regras e marcações permitidas para a sessão. Falha mantém a edição
// bloqueada até confirmar as regras atuais no servidor.
export async function carregarMarcacoes() {
  const [config, ovRec, ovOrc] = await Promise.all([
    chamar("get", { chave: "config" }),
    podeAbrir("contas-atrasadas") ? chamar("get", { chave: "ov_rec" }) : Promise.resolve({valor:{}}),
    podeAbrir("orcamentos") ? chamar("get", { chave: "ov_orc" }) : Promise.resolve({valor:{}}),
  ]);
  return {
    config: config?.valor ?? null,
    overridesRecebiveis: ovRec?.valor ?? null,
    overridesOrcamentos: ovOrc?.valor ?? null,
  };
}

export function salvarConfig(patch, antes) {
  return chamar("merge", { chave: "config", patch, antes });
}

// patch = { [id]: {campos} } -- funde campo a campo por id no servidor.
export function mesclarOverrideRecebivel(id, campos) {
  return chamar("merge", { chave: "ov_rec", patch: { [id]: campos } });
}
export function mesclarOverrideOrcamento(id, campos) {
  return chamar("merge", { chave: "ov_orc", patch: { [id]: campos } });
}

// Varios orcamentos de uma vez, num pedido SO. Nao trocar por um laco de
// mesclarOverrideOrcamento: o servidor faz le-altera-grava do blob inteiro e a
// leitura do Blobs e eventual, entao dois merges seguidos podem se atropelar e
// um sobrescrever o outro (foi assim que o ativos.js perdeu dado em 2026-07).
export function mesclarOverridesOrcamento(patch) {
  return chamar("merge", { chave: "ov_orc", patch });
}
