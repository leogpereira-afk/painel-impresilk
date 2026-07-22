// Acesso a documentos/veiculos/maquinas. Toda chamada leva o cracha.

import { comCracha } from "../lib/sessao.js";

const BASE = "/.netlify/functions/ativos";

async function chamar(action, dados = {}) {
  const resp = await comCracha(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...dados }),
  });
  const corpo = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(corpo?.erro || "Falha na operacao.");
  return corpo;
}

export const listarAtivos = () => chamar("listar").then((r) => r.itens || []);
export const salvarAtivo = (item) => chamar("salvar", { item }).then((r) => r.item);
export const removerAtivo = (id) => chamar("remover", { id });
export const guardarArquivo = (id, base64, mime, nome) =>
  chamar("guardarArquivo", { id, base64, mime, nome });
export const lerArquivo = (id) => chamar("lerArquivo", { id });

// Le um File do input e devolve base64 puro (sem o prefixo data:).
export function arquivoParaBase64(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const s = String(fr.result || "");
      resolve(s.includes(",") ? s.slice(s.indexOf(",") + 1) : s);
    };
    fr.onerror = () => reject(new Error("Nao consegui ler o arquivo."));
    fr.readAsDataURL(file);
  });
}

// Monta um blob a partir do base64 e abre numa aba (ver/baixar o documento).
export function abrirBase64(base64, mime, nome) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: mime || "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener";
  if (nome) a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Espera o navegador consumir antes de soltar a memoria.
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
