// As planilhas do Google que a casa mexe, e quem enxerga cada uma.
//
// O QUE NUNCA MORA AQUI: o id de uma planilha. Ele é a chave dela -- quem tem o
// id, abre o documento -- e este bundle é servido no github.io para o mundo. A
// lista vem do servidor a cada abertura, já PODADA pelo setor de quem pediu
// (painel-config, o crivo dentro de lerOverlay). É a mesma razão pela qual a
// aba Planilhas da Central do Léo guarda a lista na nuvem dele.
//
// AS DUAS TRANCAS, e elas não mandam uma na outra:
//   o Painel decide quem ACHA a planilha (o setor, aqui);
//   o Google decide quem LÊ (a conta Google de quem está no navegador).
// Enquanto uma planilha estiver compartilhada como "qualquer pessoa com o
// link", este módulo organiza um menu -- não fecha uma porta. A tela diz isso.

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

export const lerPlanilhas = () => chamar("get", { chave: "planilhas" }).then((r) => r.valor || {});

export const salvarPlanilha = (id, dados) =>
  chamar("merge", { chave: "planilhas", patch: { [id]: dados } }).then((r) => r.valor || {});

export const removerPlanilha = (id) => chamar("removerId", { chave: "planilhas", id });

// A concessão de setor. Só a direção enxerga e grava -- a porta é master-only no
// servidor, e a coleção fica fora das chaves genéricas, então não existe outro
// caminho até ela.
export const lerSetoresDaPessoa = (usuario) =>
  chamar("setoresDaPessoa", { usuario }).then((r) => r.setores || []);

// Devolve o que FICOU GRAVADO, não o que foi pedido, mais o que o servidor
// descartou. Marcar a caixa, ver marcada e não conceder nada já custou dois
// dias de caça ao defeito na tela errada (permutas, 19/08) -- o eco existe para
// isso não se repetir com setor.
export const salvarSetoresDaPessoa = (usuario, setores) =>
  chamar("salvarSetoresDaPessoa", { usuario, setores });

/* O LINK COLADO VIRA ID + ABA, e nunca uma URL guardada inteira.
   Mesma leitura que a Central faz: aceita o endereço que a pessoa copia da
   barra do navegador, tira o `sheetId` e o `gid` (a aba), e recusa o resto. Um
   campo de "cole o id" obrigaria a recortar o miolo de uma URL à mão. */
const LINK = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/;
export function lerLinkDePlanilha(url) {
  const t = String(url || "").trim();
  const m = t.match(LINK);
  if (!m) return null;
  const g = t.match(/[#&?]gid=(\d+)/);
  return { docId: m[1], gid: g ? g[1] : "" };
}

/* UMA URL SÓ, e o `rm=minimal` foi embora junto com o quadro embutido.
   Medido em 16/09/2026, mesmo navegador e mesma conta: a planilha abre inteira
   como ABA e fica em BRANCO dentro de um iframe -- nas cinco formas testadas
   (`/edit`, `/edit?rm=minimal`, `/preview`, `/htmlembed`, `/pubhtml`), com HTTP
   200 e sem erro no console. O Google não roda o editor dentro de outro site.
   `pubhtml` é o único que embeda, e exige PUBLICAR NA WEB -- tornaria a planilha
   pública para a internet, que é o contrário do que este módulo faz. */
export const urlNoGoogle = (p) =>
  `https://docs.google.com/spreadsheets/d/${encodeURIComponent(p.docId)}/edit` +
  (p.gid ? `#gid=${encodeURIComponent(p.gid)}` : "");

/* EM ORDEM, NUMA CÓPIA -- ordenar a lista guardada mexeria no que veio do
   servidor. `localeCompare` pt-BR com `sensitivity:'base'` porque a ordem do
   code point joga acento e maiúscula para fora do alfabeto; `numeric` para
   "Caixa 2" vir antes de "Caixa 10". Sem nome vai para o fim. */
export const emOrdem = (lista) =>
  [...(Array.isArray(lista) ? lista : [])].sort((a, b) => {
    const x = String(a?.nome || "").trim();
    const y = String(b?.nome || "").trim();
    if (!x !== !y) return x ? -1 : 1;
    return x.localeCompare(y, "pt-BR", { sensitivity: "base", numeric: true });
  });
