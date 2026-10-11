/* AS FONTES DE DADOS LIDAS POR UM CAMINHO SÓ (a ação "fontes" da
 * painel-marketing).
 *
 * Toda tela que mostra fonte de dados lê por aqui, e a memória fica fora dos
 * componentes (a conta mora em lib/calc/marketing-fontes-cache.js):
 *  - a faixa "Fontes" da Visão geral e o bloco Conexões de Configurações
 *    pedem a leitura LEVE (useFontesMarketing({leve: true})): o estado das
 *    seis fontes, sem os "dados", que são centenas de KB;
 *  - a sub-aba Dados do canal pede os DADOS só das fontes do canal aberto
 *    (useFontesMarketing({fontes: [...]})): o Facebook lê só a Meta.
 * Antes, a faixa lia por conta própria e a sub-aba lia de novo: a página
 * baixava o retrato inteiro das seis fontes duas vezes. Agora trocar de
 * sub-aba (Fazer, Dados, Resultados) ou voltar a um canal já lido não pede
 * nada; trocar de canal pede só as fontes que faltam.
 *
 * Quando a leitura é refeita:
 *  - passaram 10 minutos e uma tela que usa as fontes abriu;
 *  - a leitura leve viu coleta nova numa fonte que a sub-aba mostra (os
 *    números dela envelheceram): a sub-aba pede de novo só aquela fonte;
 *  - alguma fonte está "coletando" (andando): a memória relê, leve e só as
 *    fontes que andam, nas esperas de ESPERAS_DA_RELEITURA_S, enquanto alguém
 *    está olhando. É a releitura das três telas (o bloco Conexões só confere
 *    a cada retrato novo se a coleta que ele segue terminou);
 *  - o "Atualizar agora" terminou (a fonte nova entra na memória, sem reler
 *    as outras) ou ficou andando no servidor (a releitura começa de novo);
 *  - "Tentar de novo" (forçada).
 *
 * TROCOU A PESSOA, A MEMÓRIA SAI. As chaves "restrito" (dado pessoal) só vêm
 * para a gestão: um retrato da gestão não pode sobrar na memória para quem
 * entrar depois no mesmo aparelho. Sair e entrar (aoMudarSessao) e um crachá
 * diferente do que fez a leitura limpam tudo, e enquanto o crachá não é o
 * dono da memória, nenhuma tela a enxerga (atual). Papel diferente na mesma
 * pessoa também zera (juntarLeitura).
 */
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { coletarAgoraMarketing, lerFontesMarketing } from '../../../services/marketing.js';
import { ESPERAS_DA_RELEITURA_S } from '../../../lib/calc/marketing-conexoes.js';
import {
  andandoEntre,
  cheiasParaLer,
  desatualizadas,
  juntarFonte,
  juntarLeitura,
  leveVale,
  listaDeFontes,
  memoriaVazia,
  vistaCheia,
  vistaLeve,
} from '../../../lib/calc/marketing-fontes-cache.js';
import { aoMudarSessao, getToken } from '../../../lib/sessao.js';

// Quantas releituras seguidas enquanto alguma fonte anda (as esperas somam
// uns 7 minutos; a coleta morre em 150 s, e o servidor para de dizer
// "andando" depois disso).
const MAX_RELEITURAS = ESPERAS_DA_RELEITURA_S.length + 4;

/* O que as telas assinam. `memoria` só muda quando chega notícia (as vistas
   são refeitas só aí); os sinais de leitura e os erros ficam ao lado:
   - erro: a última leitura de TODAS falhou (faixa e Conexões);
   - errosCheias: fonte -> a frase da última leitura com os dados que falhou
     (a sub-aba Dados);
   - lendoLeve / lendoCheias: o que está sendo lido agora. */
const INICIAL = Object.freeze({ memoria: memoriaVazia(), erro: '', errosCheias: {}, lendoLeve: false, lendoCheias: [] });

let estado = INICIAL;
let dono = null;
let geracao = 0;
// As leituras em andamento: {leve, fontes (null: todas), quando (a hora em
// que saiu), promessa}.
let emCurso = [];
let relogio = null;
let releituras = 0;
const ouvintes = new Set();

function publicar(parcial) {
  estado = { ...estado, ...parcial };
  for (const f of ouvintes) f();
}

function limpar() {
  geracao += 1;
  emCurso = [];
  clearTimeout(relogio);
  relogio = null;
  releituras = 0;
  dono = null;
  estado = INICIAL;
  for (const f of ouvintes) f();
}

aoMudarSessao(limpar);

/** O crachá de agora; se não é o que fez a memória, a memória sai antes. */
function conferirDono() {
  const token = getToken();
  if (dono !== null && dono !== token) limpar();
  return token;
}

function aplicar(memoria, token) {
  if (dono === null) dono = token;
  publicar({ memoria });
}

const sinais = () => ({
  lendoLeve: emCurso.some((p) => p.fontes === null),
  lendoCheias: [...new Set(emCurso.filter((p) => !p.leve).flatMap((p) => p.fontes ?? listaDeFontes(null)))],
});
const comErro = (erros, fontes, frase) => ({ ...erros, ...Object.fromEntries(fontes.map((k) => [k, frase])) });
const semErro = (erros, fontes) => Object.fromEntries(Object.entries(erros).filter(([k]) => !fontes.includes(k)));

// Uma leitura em andamento serve para outra quando traz tudo o que ela quer
// (a leve não traz dados; a de todas serve para qualquer lista) e saiu
// depois da notícia mais nova dessas fontes: a que saiu antes de a leitura
// leve ver uma coleta nova traria a coleta de antes.
const marcaDe = (k) => (Object.hasOwn(estado.memoria.marcas, k) ? estado.memoria.marcas[k] : -Infinity);
const serve = (p, leve, fontes) =>
  (leve || !p.leve) &&
  (p.fontes === null || (fontes !== null && fontes.every((k) => p.fontes.includes(k)))) &&
  (fontes ?? Object.keys(estado.memoria.marcas)).every((k) => p.quando >= marcaDe(k));

/* Uma ida ao servidor. Nunca lança: devolve true (entrou na memória) ou
   false (o erro fica no estado, e o retrato anterior continua na tela). */
function pedir(leve, fontes) {
  const igual = emCurso.find((p) => serve(p, leve, fontes));
  if (igual) return igual.promessa;
  const minha = geracao;
  const token = getToken();
  // A hora em que a leitura SAI: é ela que diz se a notícia é a mais nova.
  const quando = Date.now();
  const item = { leve, fontes, quando, promessa: null };
  item.promessa = lerFontesMarketing({ leve, fontes })
    .then((r) => {
      if (minha !== geracao) return false;
      const memoria = juntarLeitura(estado.memoria, r, { leve, fontes, quando });
      if (!memoria) throw new Error('O servidor respondeu sem as fontes de dados.');
      dono = token;
      const parcial = { memoria };
      if (fontes === null) parcial.erro = '';
      if (!leve) parcial.errosCheias = semErro(estado.errosCheias, fontes ?? listaDeFontes(null));
      publicar(parcial);
      return true;
    })
    .catch((e) => {
      if (minha !== geracao) return false;
      const frase = e?.message || 'Não foi possível ler as fontes de dados.';
      // A releitura leve de poucas fontes (a coleta andando) falha calada: a
      // próxima tenta de novo, e o que está na tela continua.
      const parcial = {};
      if (fontes === null) parcial.erro = frase;
      if (!leve) parcial.errosCheias = comErro(estado.errosCheias, fontes ?? listaDeFontes(null), frase);
      if (Object.keys(parcial).length) publicar(parcial);
      return false;
    })
    .finally(() => {
      if (minha !== geracao) return;
      emCurso = emCurso.filter((x) => x !== item);
      publicar(sinais());
      agendarReleitura();
    });
  emCurso.push(item);
  // Lendo de novo: o erro de antes some (volta se esta falhar também).
  const limpo = sinais();
  if (fontes === null) limpo.erro = '';
  if (!leve) limpo.errosCheias = semErro(estado.errosCheias, fontes ?? listaDeFontes(null));
  publicar(limpo);
  return item.promessa;
}

/* A RELEITURA ENQUANTO ALGUMA FONTE ANDA: leve, só das que andam, nas
   esperas de ESPERAS_DA_RELEITURA_S (cedo no começo, espaçado depois), e só
   com alguém olhando (a página fechada não fica pedindo sozinha). Uma
   releitura marcada por vez; o "Atualizar agora" recomeça a contagem. */
function agendarReleitura({ recomecar = false } = {}) {
  if (recomecar) {
    clearTimeout(relogio);
    relogio = null;
    releituras = 0;
  }
  if (relogio) return;
  if (!andandoEntre(estado.memoria).length) {
    releituras = 0;
    return;
  }
  if (releituras >= MAX_RELEITURAS) return;
  const espera = ESPERAS_DA_RELEITURA_S[Math.min(releituras, ESPERAS_DA_RELEITURA_S.length - 1)];
  releituras += 1;
  const minha = geracao;
  relogio = setTimeout(() => {
    relogio = null;
    if (minha !== geracao) return;
    const andando = andandoEntre(estado.memoria);
    if (!ouvintes.size || !andando.length) {
      releituras = 0;
      return;
    }
    // O fim da leitura (pedir) marca a próxima, se ainda andar.
    pedir(true, andando);
  }, espera * 1000);
}

/** Lê as fontes, ou devolve o que a memória já tem, se ainda vale.
 *  - {leve: true}: o estado de todas (a faixa e o Conexões); devolve o
 *    retrato leve (vistaLeve);
 *  - {fontes: [...]}: os dados dessas (a sub-aba Dados); null é todas;
 *    devolve o retrato delas (vistaCheia);
 *  - forcar: lê de novo mesmo valendo ("Tentar de novo", e o Conexões ao
 *    abrir: é lá que se decide conectar).
 *  Nunca lança: o retrato, ou null se a leitura falhou (o erro fica no
 *  estado, e o retrato anterior continua na tela). */
export function lerFontes({ leve = false, fontes = null, forcar = false } = {}) {
  conferirDono();
  const agora = Date.now();
  if (leve) {
    if (!forcar && leveVale(estado.memoria, agora)) return Promise.resolve(vistaLeve(estado.memoria));
    return pedir(true, null).then((ok) => (ok ? vistaLeve(estado.memoria) : null));
  }
  const pedidas = listaDeFontes(fontes);
  const faltam = forcar ? pedidas : cheiasParaLer(estado.memoria, pedidas, agora);
  const esperas = [];
  if (faltam.length) esperas.push(pedir(false, fontes == null && faltam.length === pedidas.length ? null : faltam));
  // Fonte do canal "andando" na memória e nenhuma releitura marcada (a
  // página estava fechada quando a coleta começou): confere agora, leve.
  const andando = andandoEntre(estado.memoria, pedidas.filter((k) => !faltam.includes(k)));
  if (andando.length && !relogio) esperas.push(pedir(true, andando));
  return Promise.all(esperas).then((r) => (r.every(Boolean) ? vistaCheia(estado.memoria, pedidas) : null));
}

/** Uma fonte que chegou fora da leitura (a confirmação da conexão devolve a
 *  fonte nova) entra na memória: a faixa e a sub-aba veem também. */
export function guardarFonte(f) {
  const token = conferirDono();
  const memoria = juntarFonte(estado.memoria, f, Date.now());
  if (memoria !== estado.memoria) aplicar(memoria, token);
}

/** "Atualizar agora" de uma ou mais fontes, ao mesmo tempo (cada uma tem a
 *  trava de 2 minutos dela no servidor). Devolve, por fonte, {fonte, ok,
 *  andando, nova (a fonte que voltou pronta, ou null), erro, status,
 *  aguardarSegundos}. A fonte que voltou pronta entra na memória; a que
 *  ficou andando fica marcada "coletando", e a releitura recomeça. */
export async function atualizarFontes(fontes) {
  const token = conferirDono();
  const minha = geracao;
  const resultados = await Promise.all(
    listaDeFontes(fontes).map(async (fonte) => {
      try {
        const r = await coletarAgoraMarketing(fonte);
        if (minha === geracao) {
          const velha = Object.hasOwn(estado.memoria.estados, fonte) ? estado.memoria.estados[fonte] : null;
          if (r.fonte) aplicar(juntarFonte(estado.memoria, r.fonte, Date.now()), token);
          else if (r.andando === true && velha) aplicar(juntarFonte(estado.memoria, { ...velha, andando: true }, Date.now()), token);
        }
        return { fonte, ok: true, andando: r.andando === true, nova: r.fonte ?? null, erro: null, status: null, aguardarSegundos: null };
      } catch (e) {
        return {
          fonte, ok: false, andando: false, nova: null,
          erro: e?.message || 'Não foi possível atualizar.',
          status: Number.isInteger(e?.status) ? e.status : null,
          aguardarSegundos: e?.aguardarSegundos ?? null,
        };
      }
    })
  );
  if (minha === geracao && resultados.some((r) => r.andando)) agendarReleitura({ recomecar: true });
  return resultados;
}

const assinar = (f) => {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
};
// Crachá diferente do dono da memória: nenhuma tela enxerga o retrato de
// antes, nem no desenho que vem antes da limpeza.
const atual = () => (dono !== null && dono !== getToken() ? INICIAL : estado);

/** {retrato, erro, carregando, lidoEm, recarregar}.
 *  - {leve: true}: o retrato leve de todas as fontes (sem "dados"), ou null
 *    antes da primeira leitura de todas;
 *  - {fontes: [...]}: o retrato com os dados dessas fontes, ou null enquanto
 *    alguma nunca foi lida com os dados (a tela espera, e não mostra "sem
 *    dados"); null é todas;
 *  - auto: false deixa a tela decidir quando ler (o Conexões lê só com o
 *    grupo aberto, e depois da confirmação da volta). */
export function useFontesMarketing({ leve = false, fontes = null, auto = true } = {}) {
  const e = useSyncExternalStore(assinar, atual, atual);
  // A lista vira texto: a tela pode mandar um array novo a cada desenho.
  const todas = fontes == null;
  const chave = todas ? '' : listaDeFontes(fontes).join(',');
  const pedidas = useMemo(() => (todas ? null : chave ? chave.split(',') : []), [todas, chave]);
  const retrato = useMemo(() => (leve ? vistaLeve(e.memoria) : vistaCheia(e.memoria, pedidas)), [e.memoria, leve, pedidas]);
  // Ao abrir a tela (e ao trocar de canal): lê o que não vale mais.
  useEffect(() => {
    if (auto) lerFontes({ leve, fontes: pedidas });
  }, [auto, leve, pedidas]);
  // E com a tela aberta, quando falta alguma coisa que antes havia: a memória
  // zerou (papel novo), ou o retrato cheio de uma fonte envelheceu (a leitura
  // leve viu coleta nova). Vazio é "nada falta". Uma leitura que falhou não
  // volta sozinha (o texto não muda, e o efeito não roda de novo): o "Tentar
  // de novo" fica com quem olha.
  const falta = leve
    ? (e.memoria.lidoEm === 0 ? 'todas' : '')
    : [...listaDeFontes(pedidas).filter((k) => !Object.hasOwn(e.memoria.cheias, k)), ...desatualizadas(e.memoria, pedidas)].join(',');
  useEffect(() => {
    if (auto && falta) lerFontes({ leve, fontes: pedidas });
  }, [auto, leve, pedidas, falta]);
  const recarregar = useCallback(() => lerFontes({ leve, fontes: pedidas, forcar: true }), [leve, pedidas]);
  const minhas = listaDeFontes(pedidas);
  const erro = leve ? e.erro : (minhas.map((k) => (Object.hasOwn(e.errosCheias, k) ? e.errosCheias[k] : '')).find(Boolean) ?? '');
  const carregando = leve ? e.lendoLeve : minhas.some((k) => e.lendoCheias.includes(k));
  return { retrato, erro, carregando, lidoEm: e.memoria.lidoEm, recarregar };
}
