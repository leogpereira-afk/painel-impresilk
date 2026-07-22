// Porteiro das funcoes de dados. Antes disto, qualquer pessoa com o endereco
// lia contas a receber, faturamento e orcamentos (225 titulos, 1.479 OS e 2.545
// orcamentos conferidos abertos em 2026-07-22).
//
// Regra: sem cracha valido, nao passa. E FAIL-CLOSED -- se JWT_SECRET some do
// ambiente, tudo trava em vez de liberar. Um painel financeiro fora do ar e um
// problema; um painel financeiro aberto e outro bem maior.
//
// As funcoes sao Lambda v1 (handler/event), entao a leitura do header vem do
// event, nao de um Request.

import { verificarJwt } from "../../lib/cripto.mjs";

const json = (corpo, status) => ({
  statusCode: status,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(corpo),
});

// Devolve { sessao } quando pode seguir, ou { resposta } com o erro pronto.
export async function exigirSessao(event, moduloExigido) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error("guarda: JWT_SECRET ausente -- recusando tudo (fail-closed)");
    return { resposta: json({ erro: "Login nao configurado no servidor." }, 503) };
  }

  const h = event?.headers || {};
  // Header chega em caixa variavel conforme o proxy.
  const auth = h.authorization || h.Authorization || "";
  const m = String(auth).match(/^Bearer\s+(.+)$/i);
  if (!m) return { resposta: json({ erro: "Entre no sistema para ver estes dados.", semSessao: true }, 401) };

  const sessao = await verificarJwt(m[1], secret);
  if (!sessao) {
    return { resposta: json({ erro: "Sessao expirada. Entre de novo.", semSessao: true }, 401) };
  }

  // Permissao por modulo: quem so tem Orcamentos nao le Contas Atrasadas nem
  // chamando a funcao na mao.
  if (moduloExigido) {
    const perms = Array.isArray(sessao.perms) ? sessao.perms : [];
    const liberado = sessao.master === true || perms.includes("*") || perms.includes(moduloExigido);
    if (!liberado) {
      return { resposta: json({ erro: "Voce nao tem acesso a este modulo." }, 403) };
    }
  }

  return { sessao };
}
