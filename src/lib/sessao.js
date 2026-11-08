// Sessao do painel: guarda o cracha (JWT) e diz o que a pessoa pode abrir.
//
// O cracha vale 12h (o servidor decide). Aqui guardamos tambem o instante do
// ultimo uso: um computador do escritorio nao pode continuar logado no dia
// seguinte porque alguem esqueceu a tela aberta.
//
// IMPORTANTE: nada aqui autoriza coisa alguma de verdade. Esconder um item do
// menu e conforto, nao seguranca -- quem manda e o servidor, que confere o
// cracha em toda chamada (supabase/functions/_shared/cripto.ts, usado por cada
// painel-*).

import { API } from "./api.js";
import { entradaUnica, limparCrachas } from "./entradaUnica.js";

const K_TOKEN = "painel_auth_token";
const K_SESSAO = "painel_auth_sessao";
// Recuperação quando a cota compartilhada do localStorage está cheia.
// Token e identidade ficam juntos, somente nesta aba, sem apagar dados dos apps.
const K_ABA = "painel_auth_aba";
let sessaoBloqueada = false;
const ERRO_ARMAZENAMENTO = "Não consegui guardar sua sessão neste navegador. Verifique o espaço e as permissões de armazenamento e tente novamente.";

function limparSessaoArmazenada() {
  for (const chave of [K_TOKEN, K_SESSAO]) {
    try { localStorage.removeItem(chave); } catch { /* Pode estar bloqueado. */ }
  }
  try { sessionStorage.removeItem(K_ABA); } catch { /* Pode estar bloqueado. */ }
}
function lerSessaoArmazenada() {
  if (sessaoBloqueada) return null;
  try {
    const registro = JSON.parse(sessionStorage.getItem(K_ABA) || "null");
    if (registro?.token && registro.sessao?.usuario) return {...registro, aba:true};
  } catch { /* A sessão permanente ainda pode estar disponível. */ }
  try {
    const token = localStorage.getItem(K_TOKEN);
    const sessao = JSON.parse(localStorage.getItem(K_SESSAO) || "null");
    return token && sessao?.usuario ? {token, sessao, aba:false} : null;
  } catch { return null; }
}
function guardarSessao(token, sessao) {
  sessaoBloqueada = true;
  // Limpar só credenciais do Painel, nunca rascunhos/arquivos de outros sistemas.
  limparSessaoArmazenada();
  const texto = JSON.stringify(sessao);
  try {
    localStorage.setItem(K_TOKEN, token);
    localStorage.setItem(K_SESSAO, texto);
    if (localStorage.getItem(K_TOKEN) !== token || localStorage.getItem(K_SESSAO) !== texto) throw Error(ERRO_ARMAZENAMENTO);
  } catch {
    limparSessaoArmazenada();
    try {
      const registro = JSON.stringify({token, sessao});
      sessionStorage.setItem(K_ABA, registro);
      if (sessionStorage.getItem(K_ABA) !== registro) throw Error(ERRO_ARMAZENAMENTO);
    } catch {
      limparSessaoArmazenada();
      limparCrachas();
      throw Error(ERRO_ARMAZENAMENTO);
    }
  }
  sessaoBloqueada = false;
}
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
  if (sessaoBloqueada) return null;
  // Alguns clientes usam apenas o token legado, sem carregar a interface.
  const registro = lerSessaoArmazenada();
  if (registro) return registro.token;
  try { return localStorage.getItem(K_TOKEN) || null; } catch { return null; }
}

export function getSessao() {
  if (import.meta.env.MODE === "review") {
    // Perfis fictícios para conferir o que cada pessoa vê, sem autenticação
    // real. Este ramo desaparece da compilação publicada.
    const perfil = new URLSearchParams(window.location.search).get('perfil');
    if (perfil === 'reuniao-convidado') return {usuario:'ana-demo',nome:'Ana Exemplo',master:false,permissoes:['reunioes','calendario-empresa']};
    if (perfil === 'central-bancos') return {usuario:'bancos-exemplo',nome:'Bancos · simulação',master:false,permissoes:['bancos']};
    if (perfil === 'comercial-ana') return {usuario:'ana-exemplo',nome:'Ana Exemplo · simulação',master:false,vendedorId:'101',permissoes:['orcamentos','compromissos','calendario-empresa']};
    if (perfil === 'comercial-beatriz') return {usuario:'beatriz-exemplo',nome:'Beatriz Exemplo · simulação',master:false,vendedorId:'102',permissoes:['orcamentos','compromissos','calendario-empresa']};
    if (perfil === 'empresa') return { usuario:'demo',nome:'Consulta empresarial · simulação',master:false,permissoes:['documentos','patrimonio','calendario-empresa'] };
    if (perfil === 'sem-valores') return { usuario:'demo',nome:'Consulta sem valores · simulação',master:false,permissoes:['documentos','documentos-pessoais','patrimonio','calendario-empresa'] };
    // As quatro marcações do almoxarifado e a mesma conta sem Segurança (ficha oculta).
    if (perfil === 'almoxarifado') return { usuario:'demo',nome:'Almoxarifado · simulação',master:false,permissoes:['patrimonio','inventario-valores','manutencoes','seguranca'] };
    if (perfil === 'almoxarifado-sem-seguranca') return { usuario:'demo',nome:'Almoxarifado sem Segurança · simulação',master:false,permissoes:['patrimonio','inventario-valores','manutencoes'] };
    return {usuario:"demo",nome:"Conta de demonstração",master:true,permissoes:["*"]};
  }
  const registro = lerSessaoArmazenada();
  if (!registro) return null;
  const s = registro.sessao;
  const visto = typeof s.visto === "number" ? s.visto : Date.now();
  if (Date.now() - visto > INATIVIDADE_MS) {
    sair("Voce ficou muito tempo sem usar o painel. Entre de novo.");
    return null;
  }
  // Falhar ao renovar o horário não invalida uma sessão já autenticada.
  const renovada = {...s, visto:Date.now()};
  try {
    if (registro.aba) sessionStorage.setItem(K_ABA, JSON.stringify({token:registro.token, sessao:renovada}));
    else localStorage.setItem(K_SESSAO, JSON.stringify(renovada));
  } catch { /* O horário anterior continua válido; a expiração não é ampliada. */ }
  return registro.aba ? {...s, somenteNestaAba:true} : s;
}

export function entrar(dados) {
  if (typeof dados?.token !== "string" || !dados.token.trim() || typeof dados?.usuario !== "string" || !dados.usuario.trim()) {
    throw Error("A resposta de acesso veio incompleta. Tente entrar novamente.");
  }
  const {token, usuario, nome, permissoes, master, vendedorId, trocarSenha} = dados;
  guardarSessao(token, {
    usuario, nome, permissoes:permissoes || [], master:!!master,
    vendedorId:vendedorId || "", trocarSenha:trocarSenha === true, visto:Date.now(),
  });
  avisar();
}

/* A TROCA OBRIGATORIA FOI FEITA: a marca sai da sessao guardada.
   `avisarTela: false` tira a marca calado, logo que o servidor confirma a
   troca: a tela termina de mostrar "onde valeu", e se a pessoa recarregar a
   pagina nesse meio-tempo ela nao cai de novo em "Crie a sua senha" (onde teria
   de escolher OUTRA senha, porque a atual ja e a nova). */
export function senhaTrocada({ avisarTela = true } = {}) {
  const registro = lerSessaoArmazenada();
  if (registro) guardarSessao(registro.token, {...registro.sessao, trocarSenha:false});
  if (avisarTela) avisar();
}

// Vendedor da pessoa logada ("" = direcao ou conta sem vinculo, ve todos).
export function vendedorDaSessao(sessao = getSessao()) {
  return sessao?.vendedorId || "";
}

export function sair(motivo = "") {
  sessaoBloqueada = true;
  limparSessaoArmazenada();
  limparCrachas();
  try {
    if (motivo) localStorage.setItem(K_MOTIVO, motivo);
    else localStorage.removeItem(K_MOTIVO);
  } catch { /* A falha no recado não impede o encerramento da sessão. */ }
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

// Ajustes locais de uma área não concedem acesso às regras financeiras gerais.
export function podeConfigurar(sessao = getSessao()) {
  return ['configuracoes','permutas','marketing','campanhas'].some(m => podeAbrir(m, sessao));
}

// fetch com o cracha. Sessao expirada (401) derruba para a tela de login em vez
// de deixar a pessoa olhando um erro sem saber o que fazer.
export async function comCracha(url, opcoes = {}) {
  if (import.meta.env.MODE === "review") return (await import("../review/painel.mjs")).respostaPreview(url, opcoes);
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
  let doPainel;
  try {
    doPainel = await entradaUnica(usuario, senha);
  } catch (e) {
    if (e instanceof TypeError) throw new Error(SEM_REDE);
  }
  // Falha de persistência não é falha de autenticação: não tentar outra porta.
  if (doPainel?.token) {
    entrar(doPainel);
    return doPainel;
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
  if (!resp.ok) {
    // O status viaja junto, como em services/acesso.js: Minha conta separa
    // "tente de novo" (503) de "outra troca em andamento" (409) sem depender
    // so da frase (lib/regra-senha.mjs, classificarErroTroca).
    const erro = new Error(corpo?.erro || "Falha na operacao.");
    erro.status = resp.status;
    throw erro;
  }
  return corpo;
}
