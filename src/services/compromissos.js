// Compromissos da equipe. Moram no servidor (painel-config, chave
// "compromissos") e sao SEPARADOS POR DONO la, nao aqui: cada vendedora le e
// grava so os dela, a direcao ve todos. O "dono" e carimbado pelo servidor --
// mandar dono no corpo nao muda nada.

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

export const lerCompromissos = () =>
  chamar("get", { chave: "compromissos" }).then((r) => r.valor || {});

// Devolve o MAPA que o servidor gravou, no escopo de quem pediu -- e nao o que
// a tela imaginou. E o servidor que carimba dono/donoNome e que decide o que
// esta pessoa enxerga; montar o item no cliente fazia o compromisso recem-criado
// aparecer sem dono (e o "passar para..." oferecia a propria pessoa).
export const salvarCompromisso = (id, dados) =>
  chamar("merge", { chave: "compromissos", patch: { [id]: dados } }).then((r) => r.valor || {});

export const removerCompromisso = (id) =>
  chamar("removerId", { chave: "compromissos", id });

// Encaminhar: manda o compromisso para outra pessoa. O servidor confere se ela
// existe, carimba a passagem NO HISTORICO e devolve o mapa no escopo de quem
// pediu -- depois disso o item sai da lista de quem encaminhou.
//
// `recado` e opcional e vira a primeira linha que a pessoa de destino le.
export const encaminharCompromisso = (id, paraUsuario, recado = "") =>
  chamar("merge", {
    chave: "compromissos",
    patch: { [id]: { dono: paraUsuario, ...(recado ? { recado } : {}) } },
  }).then((r) => r.valor || {});

// Recado na conversa, com anexo opcional. Quem carimba autor e hora e o
// servidor: aqui so vai o que a pessoa escreveu.
export const mandarRecado = (id, { texto = "", arquivo = null } = {}) =>
  chamar("evento", {
    chave: "compromissos",
    id,
    texto,
    ...(arquivo ? { base64: arquivo.base64, nome: arquivo.nome, mime: arquivo.mime } : {}),
  }).then((r) => r.valor || {});

export const lerAnexo = (id, chaveArquivo) =>
  chamar("lerArquivo", { chave: "compromissos", id, arquivo: chaveArquivo });

// Arquivo -> base64 PURO (sem o prefixo "data:"): e o contrato do servidor,
// que faz atob() direto. Mesmo formato do painel-ativos.
export const arquivoParaBase64 = (file) =>
  new Promise((ok, falha) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] || "");
    r.onerror = () => falha(new Error("Nao consegui ler o arquivo."));
    r.readAsDataURL(file);
  });

// Abre o anexo numa aba nova (ou baixa, conforme o tipo).
export function abrirBase64(base64, mime, nome) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: mime || "application/octet-stream" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome || "anexo";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// Quem trabalha aqui (usuario + nome), para montar o "encaminhar para".
export async function lerPessoas() {
  const resp = await comCracha(`${API}/painel-auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "listarPessoas" }),
  });
  const body = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(body?.erro || "Nao consegui carregar a equipe.");
  return body?.pessoas || [];
}
