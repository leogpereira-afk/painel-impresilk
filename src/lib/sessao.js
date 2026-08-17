// Sessao do painel: guarda o cracha (JWT) e diz o que a pessoa pode abrir.
//
// O cracha vale 12h (o servidor decide). Aqui guardamos tambem o instante do
// ultimo uso: um computador do escritorio nao pode continuar logado no dia
// seguinte porque alguem esqueceu a tela aberta.
//
// IMPORTANTE: nada aqui autoriza coisa alguma de verdade. Esconder um item do
// menu e conforto, nao seguranca -- quem manda e o servidor, que confere o
// cracha em toda chamada (supabase/functions/_shared/cripto.ts, usado por cada
// painel-*; o antigo netlify/functions/lib/guarda.js nao roda mais).

import { API } from "./api.js";
import { entradaUnica, limparCrachas } from "./entradaUnica.js";

const K_TOKEN = "painel_auth_token";
const K_SESSAO = "painel_auth_sessao";
// Por que a pessoa foi parar na tela de login. Sem isso, o cracha vencia no
// meio do trabalho, a tela virava Login sem uma palavra e a impressao era de
// que o sistema tinha derrubado ela por conta propria.
const K_MOTIVO = "painel_auth_motivo";
const INATIVIDADE_MS = 12 * 60 * 60 * 1000;

// Frase unica para queda de rede -- usada aqui e nos services.
export const SEM_REDE =
  "Nao consegui falar com o servidor. Confira a internet e tente de novo.";

// Ultimo recurso: o servidor respondeu erro mas nao mandou frase nenhuma.
// Antes vazava "config respondeu 500" para a tela -- nome de function e numero
// de protocolo nao dizem nada para quem esta trabalhando.
export function mensagemDoStatus(status) {
  if (status === 401) return "Sua sessao expirou. Entre de novo.";
  if (status === 403) return "Voce nao tem acesso a esta parte do painel.";
  if (status === 404) return "Nao encontrei esse registro (talvez alguem tenha apagado).";
  if (status === 409) return "Alguem mexeu neste registro antes de voce. Recarregue a pagina.";
  if (status === 413) return "Arquivo grande demais.";
  if (status >= 500) return "O servidor falhou agora. Tente de novo em instantes.";
  return "Nao consegui concluir. Tente de novo.";
}

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
      sair("Voce ficou muito tempo sem usar o painel. Entre de novo.");
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

export function sair(motivo = "") {
  try {
    localStorage.removeItem(K_TOKEN);
    localStorage.removeItem(K_SESSAO);
    // Sair do painel tira TAMBEM os crachas que ele plantou. Sem isto, sair no
    // computador da recepcao deixaria o PCP e o Brief abertos para o proximo.
    limparCrachas();
    if (motivo) localStorage.setItem(K_MOTIVO, motivo);
    else localStorage.removeItem(K_MOTIVO);
  } catch {}
  avisar();
}

// Le e JA APAGA o motivo: a frase aparece uma vez, na volta para o login, e nao
// fica assombrando quem entrar depois no mesmo computador.
export function motivoSaida() {
  try {
    const m = localStorage.getItem(K_MOTIVO);
    if (m) localStorage.removeItem(K_MOTIVO);
    return m || "";
  } catch {
    return "";
  }
}

/* QUEM ADMINISTRA ACESSO: so a conta da direcao (`master`). Uma pessoa, o dono.

   Houve um desencontro aqui, e ele valia dos dois lados. A regra estava escrita
   a mao como `sessao.master` em tres telas, enquanto o servidor aceitava tambem
   quem tivesse acesso total ("*") -- e a caixa "Acesso total" prometia, com
   todas as letras, que a pessoa passaria a cadastrar e tirar acesso de todo
   mundo. Ou seja: a tela prometia, o menu escondia, e a porta de dados abria.

   O dono decidiu (16/08/2026) que administrar acesso e SO DELE. A regra passa a
   ser uma so, escrita aqui, e o servidor confere o mesmo: "*" manda no que a
   pessoa VE dentro do painel, nao em quem entra nos sistemas. O texto da caixa
   foi corrigido junto -- promessa que a porta desmente e pior do que permissao
   faltando, porque ninguem vai procurar. */
export const ehDirecao = (sessao = getSessao()) => !!sessao && sessao.master === true;

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
  let resp;
  try {
    resp = await fetch(url, { ...opcoes, headers });
  } catch {
    // fetch so lanca quando a rede falha (o navegador escreve "Failed to
    // fetch", em ingles). Vendedora na rua com sinal ruim cai aqui o tempo
    // todo; a frase precisa dizer o que fazer.
    throw new Error(SEM_REDE);
  }
  if (resp.status === 401) {
    const corpo = await resp.clone().json().catch(() => null);
    if (corpo?.semSessao) {
      sair("Sua sessao expirou (o cracha vale 12 horas). Entre de novo para continuar.");
      throw new Error("Sua sessao expirou. Entre de novo.");
    }
  }
  return resp;
}

// Entrar no painel. DUAS PORTAS, nesta ordem:
//
//  1. a entrada unica (acesso-entrar), que alem de deixar entrar aqui ja planta
//     o cracha dos outros sistemas -- e o que faz "entrei uma vez, abro todos";
//  2. o login antigo (painel-auth), para quem ainda nao foi consolidado.
//
// A segunda porta continua de pe de proposito. Virar tudo de uma vez deixaria
// alguem do lado de fora sem ter a quem recorrer, num sistema que so a direcao
// sabe consertar.
export async function login(usuario, senha) {
  try {
    const doPainel = await entradaUnica(usuario, senha);
    if (doPainel?.token) {
      entrar(doPainel);
      return doPainel;
    }
  } catch (e) {
    // Rede caida cai aqui; senha errada nao (a entrada unica devolve null e
    // deixa a porta antiga dar a palavra final).
    if (e instanceof TypeError) throw new Error(SEM_REDE);
  }

  let resp;
  try {
    resp = await fetch(`${API}/painel-auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", usuario, senha }),
    });
  } catch {
    throw new Error(SEM_REDE);
  }
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
