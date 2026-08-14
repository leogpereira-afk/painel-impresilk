// As contas dos SISTEMAS: Supabase, GitHub, Claude e o que mais for mensal.
//
// Moram no painel-config (chave "assinaturas"), um registro por serviço --
// mesmo mecanismo dos bancos e das manutenções, então marcar duas contas ao
// mesmo tempo não apaga uma a outra.
//
// A chave exige o módulo "gestao" no servidor: conta de sistema é assunto da
// direção, e esconder só na tela seria conforto, não separação.

import { comCracha, mensagemDoStatus } from "../lib/sessao.js";
import { API } from "../lib/api.js";

const BASE = `${API}/painel-config`;

async function chamar(action, corpo) {
  const resp = await comCracha(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...corpo }),
  });
  const body = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(body?.erro || mensagemDoStatus(resp.status));
  return body;
}

export const lerAssinaturas = () =>
  chamar("get", { chave: "assinaturas" }).then((r) => r.valor || {});

export const salvarAssinatura = (id, dados) =>
  chamar("merge", { chave: "assinaturas", patch: { [id]: dados } }).then((r) => r.valor || {});

export const removerAssinatura = (id) =>
  chamar("removerId", { chave: "assinaturas", id }).then(() => true);
