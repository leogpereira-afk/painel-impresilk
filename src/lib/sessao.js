// Sessao do painel: guarda o cracha (JWT) e diz o que a pessoa pode abrir.
//
// O cracha vale 12h (o servidor decide). Aqui guardamos tambem o instante do
// ultimo uso: um computador do escritorio nao pode continuar logado no dia
// seguinte porque alguem esqueceu a tela aberta.
//
// IMPORTANTE: nada aqui autoriza coisa alguma de verdade. Esconder um item do
// menu e conforto, nao seguranca -- quem manda e o servidor, que confere o
// cracha em toda chamada (supabase/functions/_compartilhado, usado por cada
// painel-*; o antigo netlify/functions/lib/guarda.js nao roda mais).

import { API } from "./api.js";

const K_TOKEN = "painel_auth_token";
const K_SESSAO = "painel_auth_sessao";
const INATIVIDADE_MS = 12 * 60 * 60 * 1000;

const ouvintes = new Set();
const avisar = () => ouvintes.forEach((fn) => fn());

export function aoMudarSessao(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

export function getToken() {
  try {
    return localStorage.getItem(K_TOKEN) || null;
  } catch {
    return null;
  }
}

export function getSessao() {
  try {
    const raw = localStorage.getItem(K_SESSAO);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s?.usuario) return null;
    const visto = typeof s.visto === "number" ? s.visto : Date.now();
    if (Date.now() - visto > INATIVIDADE_MS) {
      sair();
      return null;
    }
    // Cada leitura renova: quem esta usando nao e deslogado no meio do trabalho.
    localStorage.setItem(K_SESSAO, JSON.stringify({ ...s, visto: Date.now() }));
    return s;
  } catch {
    return null;
  }
}

export function entrar({ token, usuario, nome, permissoes, master, vendedorId }) {
  try {
    localStorage.setItem(K_TOKEN, token);
    localStorage.setItem(
      K_SESSAO,
      JSON.stringify({
        usuario,
        nome,
        permissoes: permissoes || [],
        master: !!master,
        // Vendedor vinculado: quem tem entra e ja cai na propria fila de acoes.
        vendedorId: vendedorId || "",
        visto: Date.now(),
      })
    );
  } catch {}
  avisar();
}

// Vendedor da pessoa logada ("" = direcao ou conta sem vinculo, ve todos).
export function vendedorDaSessao(sessao = getSessao()) {
  return sessao?.vendedorId || "";
}

export function sair() {
  try {
    localStorage.removeItem(K_TOKEN);
    localStorage.removeItem(K_SESSAO);
  } catch {}
  avisar();
}

// Modulo liberado? "inicio" e sempre, senao a pessoa entra e nao tem onde ficar.
export function podeAbrir(modulo, sessao = getSessao()) {
  if (modulo === "inicio") return true;
  if (!sessao) return false;
  if (sessao.master) return true;
  const p = sessao.permissoes || [];
  return p.includes("*") || p.includes(modulo);
}

// fetch com o cracha. Sessao expirada (401) derruba para a tela de login em vez
// de deixar a pessoa olhando um erro sem saber o que fazer.
export async function comCracha(url, opcoes = {}) {
  const token = getToken();
  const headers = { ...(opcoes.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const resp = await fetch(url, { ...opcoes, headers });
  if (resp.status === 401) {
    const corpo = await resp.clone().json().catch(() => null);
    if (corpo?.semSessao) {
      sair();
      throw new Error("Sua sessao expirou. Entre de novo.");
    }
  }
  return resp;
}

export async function login(usuario, senha) {
  const resp = await fetch(`${API}/painel-auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "login", usuario, senha }),
  });
  const corpo = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(corpo?.erro || "Nao consegui entrar. Tente de novo.");
  entrar(corpo);
  return corpo;
}

export async function chamarAuth(action, dados = {}) {
  const resp = await comCracha(`${API}/painel-auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...dados }),
  });
  const corpo = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(corpo?.erro || "Falha na operacao.");
  return corpo;
}
