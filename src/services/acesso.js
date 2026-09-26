// Quem entra nos sete sistemas. Fala com painel-acesso, que le e escreve
// acesso_conta/acesso_papel -- as tabelas que consolidam equipe_contas e
// painel_contas.
//
// ISTO MANDA NO LOGIN DE VERDADE. Criar, mudar papel, desativar e tirar acesso
// escrevem no sistema real (a function chama a equipe-auth, que ja sabe espelhar
// o elenco e nao deixar sistema sem gestor). O que continua so aqui e a visao
// "uma linha por pessoa".

import { comCracha, mensagemDoStatus } from "../lib/sessao.js";
import { API } from "../lib/api.js";

import { sistemaNoPainel } from "../lib/sistemas.js";

const BASE = `${API}/painel-acesso`;

async function chamar(action, corpo = {}) {
  if (import.meta.env.MODE === "review") {
    const { simularAcesso } = await import("../review/dados.mjs");
    return simularAcesso(action, corpo);
  }
  const resp = await comCracha(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...corpo }),
  });
  const body = await resp.json().catch(() => null);
  if (!resp.ok) {
    // O status viaja junto: a tela separa "senha atual incorreta" (401) de
    // "tente de novo" (503) e de "outra troca em andamento" (409) sem ler texto.
    const erro = new Error(body?.erro || mensagemDoStatus(resp.status));
    erro.status = resp.status;
    throw erro;
  }
  return body;
}

export const lerAcessos = () => chamar("listar").then(dados => ({
  ...dados,
  sistemas: dados.sistemas.filter(sistemaNoPainel),
  contas: dados.contas.map(conta => ({...conta, papeis: (conta.papeis || []).filter(p => sistemaNoPainel(p.sistema))})),
  soltas: Object.fromEntries(Object.entries(dados.soltas || {}).filter(([id]) => sistemaNoPainel(id))),
}));
export const salvarConta = (conta) => chamar("salvarConta", { conta }).then((r) => r.conta);

// `criar` e PEDIDO EXPLICITO. Sem ele, gravar papel numa linha cujo login nao
// existe no sistema devolve 409 em vez de inventar uma conta com aquele nome --
// que era como nascia a sosia (`leonardo` no PCP ao lado do `leo` de verdade).
export const salvarPapel = (papel, { criar = false } = {}) =>
  chamar("salvarPapel", { papel, criar });
export const removerPapel = (usuario, sistema) => chamar("removerPapel", { usuario, sistema });

// "Esta pessoa, NESTE sistema, chama-se assim." Nao escreve nada no sistema:
// so acerta o apontamento. Mandar login vazio volta para a regra deduzida.
export const apontarLogin = (usuario, sistema, login) =>
  chamar("apontarLogin", { usuario, sistema, login });

// Trocar a senha em UM sistema. A de todos de uma vez continua em definirSenha,
// mas consertar o PCP nao pode custar a senha do RH que a pessoa ja decorou.
export const senhaDoSistema = (usuario, sistema) =>
  chamar("senhaDoSistema", { usuario, sistema });

// Cria a pessoa e ja da acesso aos sistemas escolhidos. Devolve a senha
// temporaria UMA vez -- ela nao fica guardada em lugar nenhum legivel, entao a
// tela precisa mostrar na hora.
export const criarPessoa = (conta, papeis) =>
  chamar("criarPessoa", { conta, papeis });

// UMA senha para UMA pessoa em todos os sistemas dela (contrato das senhas,
// acao B). Uma pessoa por chamada, sempre: lista, estrela ou vazio sao
// recusados aqui, antes de sair do navegador, e de novo no servidor. Sem
// `senha`, o servidor gera uma; com `senha`, vale a regra (6 caracteres ou
// mais, ate 72, sem espaco nas pontas) e nada e aparado.
// A resposta traz a senha UMA vez: a tela mostra e esquece ao fechar.
export function definirSenha(usuario, senha) {
  if (typeof usuario !== "string" || !usuario.trim()) throw new Error("Escolha uma pessoa.");
  if (/[*,;]/.test(usuario)) throw new Error("Uma pessoa por vez.");
  return chamar("definirSenha", senha === undefined ? { usuario } : { usuario, senha });
}

export const desativar = (usuario, ativo) => chamar("desativar", { usuario, ativo });
