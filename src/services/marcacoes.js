// Persistencia das marcacoes do painel (config e overrides) no Netlify Blobs,
// via a Function config. Sem isto, tudo o que o CEO marca -- motivo de perda,
// "cobrado", baixa, regras -- so existiria no navegador em que ele clicou:
// trocar de aparelho ou limpar o cache do Chrome apagaria o trabalho.
//
// As tres chaves de marcacao sao publicas de propósito (o painel ja e publico
// de leitura e elas nao tocam os dados financeiros). A gravacao usa "merge"
// por id, entao dois aparelhos nao se sobrescrevem.

import { comCracha } from "../lib/sessao.js";

const BASE = "/.netlify/functions/config";

async function chamar(action, corpo) {
  const resp = await comCracha(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...corpo }),
  });
  const body = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(body?.erro || `config respondeu ${resp.status}`);
  return body;
}

// Le as tres chaves de uma vez no boot. Falha de rede nao derruba o app: o
// chamador cai no que tiver no localStorage.
export async function carregarMarcacoes() {
  const [config, ovRec, ovOrc] = await Promise.all([
    chamar("get", { chave: "config" }),
    chamar("get", { chave: "ov_rec" }),
    chamar("get", { chave: "ov_orc" }),
  ]);
  return {
    config: config?.valor ?? null,
    overridesRecebiveis: ovRec?.valor ?? null,
    overridesOrcamentos: ovOrc?.valor ?? null,
  };
}

export function salvarConfig(patch) {
  return chamar("merge", { chave: "config", patch });
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
