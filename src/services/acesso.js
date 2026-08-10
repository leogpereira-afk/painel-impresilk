// Quem entra nos sete sistemas. Fala com painel-acesso, que le e escreve
// acesso_conta/acesso_papel -- as tabelas que consolidam equipe_contas e
// painel_contas.
//
// IMPORTANTE: isto ainda nao decide login nenhum. Os logins de hoje continuam
// saindo das tabelas antigas; aqui e a preparacao da virada.

import { comCracha, mensagemDoStatus } from "../lib/sessao.js";
import { API } from "../lib/api.js";

const BASE = `${API}/painel-acesso`;

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

export const lerAcessos = () => chamar("listar");
export const salvarConta = (conta) => chamar("salvarConta", { conta }).then((r) => r.conta);
export const salvarPapel = (papel) => chamar("salvarPapel", { papel });
export const removerPapel = (usuario, sistema) => chamar("removerPapel", { usuario, sistema });
