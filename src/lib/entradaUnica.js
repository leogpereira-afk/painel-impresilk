// Entrar uma vez e abrir os outros sistemas sem digitar senha de novo.
//
// COMO ISTO FUNCIONA, EM UMA FRASE: os sete sistemas sao servidos do MESMO
// endereco (leogpereira-afk.github.io), e localStorage e por endereco -- entao
// o cracha que o painel grava aqui e o mesmo cracha que o POPs le la.
//
// Por isso a virada NAO mexeu em nenhum dos cinco apps: cada um continua lendo
// a chave que sempre leu, e continua conferindo o cracha no servidor dele. O
// que mudou e so quem grava a chave. Se um dia os sistemas sairem desse
// endereco comum, isto para de funcionar em silencio -- e o motivo esta escrito
// aqui para quem for mexer.
//
// O cracha e um JWT assinado com o MESMO segredo que cada sistema ja usa
// (EQUIPE_JWT_SECRET, PAINEL_JWT_SECRET). Plantar a chave nao da acesso a nada:
// quem confere e o servidor, em toda chamada.

// Nao importa nada de sessao.js de proposito: sessao.js importa este arquivo, e
// um ciclo entre os dois so daria certo por sorte de ordem do empacotador.
// Quando a rede cai, o fetch estoura e quem traduz o erro e o login, em sessao.js.
import { API } from "./api.js";
/* AS TRES LISTAS DESTE ARQUIVO AGORA SAEM DO REGISTRO. Estavam escritas a mao
   aqui, e a de nomes tinha ainda uma quarta copia em pages/Acessos.jsx que
   parou em cinco sistemas. Sistema novo agora e UM bloco em lib/sistemas.js:
   ganha a gaveta do cracha, o atalho e o nome de uma vez so. */
// Nao ha ciclo: sistemas.js nao importa nada -- e uma tabela, so.
// Quem precisa do NOME de um sistema chama `nomeSis` do registro direto.
import { CHAVE_CRACHA as CHAVE, ENDERECO_DIRETO as ENDERECO } from "./sistemas.js";

const K_SISTEMAS = "painel_meus_sistemas";

/** Guarda os crachas dos outros sistemas. Devolve a lista que deu para plantar. */
export function plantarCrachas(crachas = {}) {
  const plantados = [];
  for (const [sis, dado] of Object.entries(crachas)) {
    const chave = CHAVE[sis];
    const token = dado?.token;
    if (!chave || !token) continue;
    try {
      localStorage.setItem(chave, token);
      plantados.push(sis);
    } catch {}
  }
  return plantados;
}

/** Os sistemas que esta pessoa pode abrir, para a tela montar os atalhos. */
export function meusSistemas() {
  try {
    const l = JSON.parse(localStorage.getItem(K_SISTEMAS) || "[]");
    return Array.isArray(l) ? l.filter((s) => ENDERECO[s]) : [];
  } catch {
    return [];
  }
}

export const enderecoDe = (sis) => ENDERECO[sis] || "";

/**
 * A entrada unica. Devolve o pedaco do painel (para entrar()) ou null quando
 * esta pessoa ainda nao existe na tabela nova -- e ai quem responde e o login
 * antigo, que continua de pe. As DUAS portas ficam abertas de proposito: virar
 * tudo de uma vez deixaria alguem do lado de fora sem ter a quem recorrer.
 */
export async function entradaUnica(usuario, senha) {
  const resp = await fetch(`${API}/acesso-entrar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "entrar", usuario, senha }),
  });
  // 401 aqui NAO e "senha errada" com certeza: pode ser conta que ainda nao foi
  // consolidada. Por isso devolve null e deixa o login antigo tentar -- quem
  // decide que a senha esta errada e a ultima porta, nao a primeira.
  if (!resp.ok) return null;
  const corpo = await resp.json().catch(() => null);
  if (!corpo?.ok) return null;

  /* PLANTAR SO DEPOIS DE SABER QUE ELA ENTRA NO PAINEL.
     Antes os crachas dos outros cinco eram gravados aqui e a funcao so
     devolvia `null` na linha seguinte quando faltava o painel -- o login
     falhava, a tela dizia "senha incorreta", e a pessoa saia dali com acesso
     plantado aos outros sistemas no computador. */
  if (!corpo.crachas?.painel) return null;

  const plantados = plantarCrachas(corpo.crachas);
  try {
    // O RH nao ganha cracha nosso (la o cracha e a sessao do Supabase Auth), mas
    // entra na lista: o atalho leva a pessoa ate a porta, ela digita a senha uma
    // vez la e pronto.
    const lista = [...new Set([...plantados, ...(corpo.sistemas || [])])]
      .filter((s) => ENDERECO[s]);
    localStorage.setItem(K_SISTEMAS, JSON.stringify(lista));
  } catch {}

  return corpo.crachas?.painel || null;
}

/** Sair do painel tira TAMBEM os crachas plantados. */
export function limparCrachas() {
  try {
    for (const chave of Object.values(CHAVE)) localStorage.removeItem(chave);
    localStorage.removeItem(K_SISTEMAS);
  } catch {}
}
