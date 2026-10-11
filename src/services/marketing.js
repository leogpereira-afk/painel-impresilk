// Atalhos do Drive da aba Marketing. Moram no servidor (painel-config, chave
// "marketing", mapa {id: {nome, url}}) para valerem em qualquer aparelho.
//
// Adicionar usa "merge" e remover usa "removerId" -- os dois mexem em UMA
// linha por vez. Remover via get+set do mapa inteiro reabria a corrida:
// duas lixeiras clicadas rapido ressuscitavam o atalho da primeira.

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

export const lerAtalhos = () =>
  chamar("get", { chave: "marketing" }).then((r) => r.valor || {});

export const salvarAtalho = (id, { nome, url }) =>
  chamar("merge", { chave: "marketing", patch: { [id]: { nome, url } } });

export const removerAtalho = (id) =>
  chamar("removerId", { chave: "marketing", id });

// AÇÕES DO MARKETING (desde 10/10/2026): moram nas tabelas painel_mkt_* e
// passam pela Edge Function painel-marketing, que tem a trava "um orçamento
// numa ação só" no banco. Os atalhos acima continuam no painel-config.
async function chamarMarketing(action, corpo = {}) {
  const resp = await comCracha(`${API}/painel-marketing`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...corpo }),
  });
  const body = await resp.json().catch(() => null);
  if (!resp.ok || !body?.ok) throw new Error(body?.erro || mensagemDoStatus(resp.status));
  return body;
}

export const listarAcoesMarketing = () => chamarMarketing("acoes");
// Ação nova: a tela gera o id e manda novo:true. Se a resposta se perder e a
// pessoa tentar de novo, o servidor devolve a mesma ação em vez de criar outra.
export const salvarAcaoMarketing = (acao, versao, novo = false) =>
  chamarMarketing("salvarAcao", { acao, versao, novo }).then((r) => r.acao);
export const retirarAcaoMarketing = (id, versao) => chamarMarketing("retirarAcao", { id, versao });
export const migrarAcoesAntigasMarketing = () =>
  chamarMarketing("migrarLegado").then((r) => r.resultado);

// ETAPA A2 (11/10/2026): canais, playbook, publicações, números da semana e
// papéis. Uma função por ação da painel-marketing. O servidor decide o papel
// (gestão, marketing, visualização) e recusa o que não cabe; a tela só
// esconde o botão. As que salvam devolvem a linha no formato da tela (como
// salvarAcaoMarketing); as outras devolvem a resposta inteira.

// { papel, idPessoa, hoje, canais, playbook, acoes, publicacoes, metricas,
//   papeis (só para a gestão), legado:{pendentes}, podeMigrar }
// A função da a1 não conhece "painel" e responde 400 "Ação inválida.". Na
// janela em que a tela nova chega antes da função nova, diz isso para gente.
export const lerPainelMarketing = () =>
  chamarMarketing("painel").catch((e) => {
    if (e?.message === "Ação inválida.") throw new Error("O servidor do Marketing ainda está na versão anterior. Tente de novo em alguns minutos.");
    throw e;
  });
// { pessoas:[{idPessoa, nome, area}], semId }: o CPF nunca vem.
export const listarPessoasMarketing = () => chamarMarketing("pessoas");

// Canal e item do playbook (só a gestão). Novo: mande o id gerado na tela e
// novo=true, sem versão; repetir o pedido devolve o mesmo, não cria outro.
// Na edição, pode mandar só o que mudou (ex.: {id, ordem}): o resto vem do
// que está gravado. O código do canal não muda depois de criado.
export const salvarCanal = (canal, versao, novo = false) =>
  chamarMarketing("salvarCanal", { canal, versao, novo }).then((r) => r.canal);
export const salvarPlaybook = (item, versao, novo = false) =>
  chamarMarketing("salvarPlaybook", { item, versao, novo }).then((r) => r.item);
export const retirarPlaybook = (id, versao) => chamarMarketing("retirarPlaybook", { id, versao });
// Marcar (feito=true) ou desmarcar um item único ou de implantação. Item que
// pede link ou texto exige a evidência.
export const concluirPlaybook = (id, versao, feito, evidencia) =>
  chamarMarketing("concluirPlaybook", { id, versao, feito, evidencia }).then((r) => r.item);

// Publicação lançada à mão (colando o link). Número vazio vai como null.
export const salvarPublicacao = (publicacao, versao, novo = false) =>
  chamarMarketing("salvarPublicacao", { publicacao, versao, novo }).then((r) => r.publicacao);
export const retirarPublicacao = (id, versao) => chamarMarketing("retirarPublicacao", { id, versao });
// Linhas de lerCsvPublicacoes (com `linha`, o número da linha no arquivo).
// Devolve { inseridas, atualizadas, iguais, recusadas:[{linha, motivo}] }.
export const importarPublicacoes = (linhas) => chamarMarketing("importarPublicacoes", { linhas });

// Números da semana (semana = segunda-feira, AAAA-MM-DD). Só os números
// mandados mudam; mandar null apaga aquele número.
export const salvarMetricas = (canalId, semana, numeros) =>
  chamarMarketing("salvarMetricas", { canalId, semana, numeros }).then((r) => r.metricas);

// Papel de uma pessoa (só a gestão). papel null volta ao padrão (marketing).
export const definirPapel = (idPessoa, papel) => chamarMarketing("definirPapel", { idPessoa, papel });
// Canais e playbook da especificação. Pode rodar de novo: não duplica nem
// sobrescreve. Devolve { canais, itens } (quantos entraram agora).
export const carregarPadrao = () => chamarMarketing("carregarPadrao");
