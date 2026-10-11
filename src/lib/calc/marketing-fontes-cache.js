/* A MEMÓRIA DAS FONTES NA TELA: a ação "fontes" lida por um caminho só.
 *
 * Quem lê: a faixa "Fontes" da Visão geral e o bloco Conexões (o ESTADO das
 * seis fontes, na leitura leve, sem os "dados") e a sub-aba Dados do canal
 * (os DADOS só das fontes do canal aberto). As três leem pelo
 * src/components/marketing/dados/useFontesMarketing.js, que guarda esta
 * memória fora dos componentes. Aqui mora só a conta: sem rede e sem relógio
 * escondido (o "quando" vem por parâmetro), para o teste alcançar.
 *
 * TRÊS REGRAS:
 * 1. ESTADO E DADOS FICAM À PARTE. `estados` tem a notícia mais nova de cada
 *    fonte (leve ou cheia); `cheias` tem, por fonte, um retrato que chegou
 *    INTEIRO numa leitura (o estado e os números juntos). A sub-aba Dados
 *    desenha sempre um retrato inteiro: nunca a data de uma coleta nova em
 *    cima dos números da anterior.
 * 2. A LEITURA LEVE NÃO APAGA DADOS, MAS SABE QUANDO ELES ENVELHECERAM. Os
 *    dados de uma fonte só mudam quando a coletora grava, e aí o coletadoEm
 *    muda (o juntarRetrato da coletora carimba toda gravação). Leve com a
 *    mesma coleta: o retrato cheio ganha o estado novo e continua valendo.
 *    Com coleta nova: o retrato cheio fica como estava (inteiro) e passa a
 *    ser "desatualizado"; a sub-aba pede de novo só aquela fonte.
 * 3. A NOTÍCIA MAIS NOVA GANHA. Cada fonte guarda quando saiu a leitura que a
 *    trouxe (ou quando chegou a resposta do "Atualizar agora"); uma leitura
 *    que saiu ANTES não passa por cima: ela traria a fonte velha.
 *
 * O PAPEL MUDOU, A MEMÓRIA ZERA: o "restrito" (dado pessoal) só vem para a
 * gestão, e o retrato da gestão não pode sobrar para um papel menor. (Trocar
 * de pessoa é antes disto: o useFontesMarketing.js limpa tudo.)
 */
import { FONTES } from '../../../supabase/functions/_shared/mkt-fontes/info.mjs';
import { normalizarFontes } from './marketing-fontes.js';

/** Quanto uma leitura vale antes de a tela pedir de novo: as fontes mudam
 *  uma vez por dia (a coleta da manhã) ou no "Atualizar agora", que já traz
 *  a fonte nova. */
export const VALIDADE_MS = 10 * 60 * 1000;

const objeto = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const tem = (o, k) => objeto(o) && Object.hasOwn(o, k);
const temDados = (f) => objeto(f) && objeto(f.dados);
// O nome de uma fonte: o formato das chaves de FONTES. "__proto__" não passa
// (vira chave de objeto aqui dentro).
const FONTE_VALIDA = /^[a-z][a-z0-9_]{0,40}$/;
const fonteValida = (k) => typeof k === 'string' && FONTE_VALIDA.test(k);
// Quando saiu a notícia guardada (ou -Infinity: nenhuma).
const marca = (o, k) => (tem(o, k) && Number.isFinite(o[k]) ? o[k] : -Infinity);

/** A memória vazia: antes da primeira leitura, ou depois de trocar a pessoa
 *  ou o papel.
 *  - estados: fonte -> a notícia mais nova (o objeto que o servidor mandou);
 *  - marcas: fonte -> quando saiu a leitura dessa notícia;
 *  - cheias: fonte -> o retrato inteiro com os dados, ou null (a leitura com
 *    os dados foi feita e o servidor não mandou a fonte);
 *  - cheiasEm: fonte -> quando o retrato cheio foi lido ou confirmado;
 *  - lidoEm: quando saiu a última leitura de TODAS as fontes (0: nunca);
 *  - ordem: a ordem do servidor nessa leitura. */
export function memoriaVazia() {
  return { papel: null, ordem: [], estados: {}, marcas: {}, cheias: {}, cheiasEm: {}, lidoEm: 0, avisos: [], motivos: {} };
}

function copiar(m) {
  return {
    ...m,
    ordem: [...m.ordem],
    estados: { ...m.estados },
    marcas: { ...m.marcas },
    cheias: { ...m.cheias },
    cheiasEm: { ...m.cheiasEm },
    avisos: [...m.avisos],
    motivos: { ...m.motivos },
  };
}

/** As duas notícias são da mesma coleta? Então os dados de uma valem para a
 *  outra (a regra 2 do topo). */
export const mesmaColeta = (a, b) =>
  objeto(a) && objeto(b) && a.fonte === b.fonte && (a.coletadoEm ?? null) === (b.coletadoEm ?? null) && (a.ultimaBoaEm ?? null) === (b.ultimaBoaEm ?? null);

/** A lista de fontes de um pedido: sem repetir, só nomes de fonte e na
 *  ordem de FONTES (a mesma lista em outra ordem é o mesmo pedido, e a
 *  mesma chave para a tela); null é "todas" (as de FONTES). */
export function listaDeFontes(fontes) {
  if (fontes == null) return [...FONTES];
  const pedidas = new Set((Array.isArray(fontes) ? fontes : []).filter(fonteValida));
  return [...FONTES.filter((k) => pedidas.has(k)), ...[...pedidas].filter((k) => !FONTES.includes(k))];
}

/* Uma fonte que chegou (de uma leitura ou do "Atualizar agora"), já na cópia
   `m`. O estado só entra se a notícia é a mais nova; o retrato cheio tem a
   própria marca (um retrato inteiro que saiu antes de uma leitura leve mais
   nova ainda é um retrato inteiro, e a regra 2 diz se ele envelheceu). */
function guardarUma(m, f, quando) {
  const k = f.fonte;
  const novaNoticia = quando >= marca(m.marcas, k);
  if (novaNoticia) {
    m.estados[k] = f;
    m.marcas[k] = quando;
  }
  if (temDados(f)) {
    if (quando >= marca(m.cheiasEm, k)) {
      m.cheias[k] = f;
      m.cheiasEm[k] = quando;
    }
    return;
  }
  const cheia = tem(m.cheias, k) ? m.cheias[k] : null;
  if (!novaNoticia || !temDados(cheia)) return;
  if (mesmaColeta(cheia, f)) {
    // Leve, da mesma coleta: o estado novo (conexão, andando, avisos) com os
    // mesmos dados, e o retrato vale como lido agora.
    m.cheias[k] = { ...f, dados: cheia.dados };
    m.cheiasEm[k] = quando;
  } else if (!f.coletadoEm && cheia.coletadoEm) {
    // O servidor não tem mais retrato nenhum desta fonte (o Desconectar do
    // LinkedIn apaga o retrato, pela regra de guarda dele): os números saem
    // da memória também, e não ficam na tela enquanto a sub-aba relê.
    delete m.cheias[k];
    delete m.cheiasEm[k];
  }
}

/** A resposta de uma leitura entra na memória. Devolve a memória NOVA (a de
 *  entrada não muda), ou null quando a resposta não tem as fontes (quem
 *  chama diz que não leu).
 *  - leve: o pedido foi da leitura leve (a resposta pode vir cheia assim
 *    mesmo: a função antiga ignora o pedido, e os dados são aproveitados);
 *  - fontes: as pedidas, ou null para todas;
 *  - quando: a hora em que a leitura SAIU (regra 3). */
export function juntarLeitura(memoria, resposta, { leve = false, fontes = null, quando = 0 } = {}) {
  const n = normalizarFontes(resposta);
  if (!n) return null;
  let m = copiar(memoria ?? memoriaVazia());
  if (m.papel !== null && n.papel !== m.papel) m = memoriaVazia();
  const lista = n.lista.filter((f) => fonteValida(f?.fonte));
  for (const f of lista) guardarUma(m, f, quando);
  const vieram = new Set(lista.map((f) => f.fonte));
  if (fontes == null) {
    // A leitura de todas: a fonte que o servidor não manda mais saiu de cena.
    for (const k of Object.keys(m.estados)) {
      if (vieram.has(k) || quando < marca(m.marcas, k)) continue;
      delete m.estados[k];
      delete m.marcas[k];
      delete m.cheias[k];
      delete m.cheiasEm[k];
    }
    if (quando >= m.lidoEm) {
      m.lidoEm = quando;
      m.ordem = lista.map((f) => f.fonte);
    }
  } else if (!leve) {
    // Pedida com os dados e não veio: o servidor não tem essa fonte. Fica
    // "lida" (null), para a tela dizer que não leu, e não pedir de novo a
    // cada desenho.
    for (const k of listaDeFontes(fontes)) {
      if (vieram.has(k) || quando < marca(m.cheiasEm, k)) continue;
      m.cheias[k] = null;
      m.cheiasEm[k] = quando;
    }
  }
  m.papel = n.papel;
  m.avisos = n.avisos;
  m.motivos = n.motivos;
  return m;
}

/** Uma fonte que chegou sozinha (o "Atualizar agora" que terminou, a
 *  confirmação da conexão, ou a fonte marcada "andando") entra na memória.
 *  `quando` é a hora da resposta: leitura que saiu antes dela não passa por
 *  cima. Fonte inválida devolve a mesma memória. */
export function juntarFonte(memoria, f, quando = 0) {
  if (!objeto(f) || !fonteValida(f.fonte)) return memoria;
  const m = copiar(memoria ?? memoriaVazia());
  guardarUma(m, f, quando);
  return m;
}

/* O retrato no formato do normalizarFontes ({papel, lista, porFonte,
   avisos, motivos}), com as fontes `chaves` na ordem do servidor. */
function montar(m, chaves, pegar) {
  const ordem = [...new Set([...m.ordem, ...FONTES, ...chaves])].filter((k) => chaves.includes(k));
  const lista = ordem.map(pegar).filter(objeto);
  return { papel: m.papel ?? 'visualizacao', lista, porFonte: Object.fromEntries(lista.map((f) => [f.fonte, f])), avisos: m.avisos, motivos: m.motivos };
}

/** O que a faixa e o bloco Conexões desenham: o estado de todas as fontes.
 *  null enquanto nenhuma leitura de TODAS chegou (uma leitura só das fontes
 *  de um canal não pode virar uma faixa com uma fonte só). */
export function vistaLeve(m) {
  if (!m || !(m.lidoEm > 0)) return null;
  return montar(m, Object.keys(m.estados), (k) => m.estados[k]);
}

/** O que a sub-aba Dados desenha: o retrato inteiro de cada fonte pedida
 *  (regra 1), com o "andando" da notícia mais nova por cima (a coleta que
 *  roda agora não muda os números até terminar). null enquanto alguma
 *  pedida nunca foi lida com os dados: a tela espera, e não mostra "sem
 *  dados". A pedida que o servidor não mandou fica de fora (a ligação dela
 *  aparece como "não leu"). */
export function vistaCheia(m, fontes) {
  if (!m) return null;
  const pedidas = listaDeFontes(fontes);
  if (pedidas.some((k) => !tem(m.cheias, k))) return null;
  return montar(m, pedidas.filter((k) => objeto(m.cheias[k])), (k) => {
    const c = m.cheias[k];
    const andando = (tem(m.estados, k) ? m.estados[k] : c).andando === true;
    return (c.andando === true) === andando ? c : { ...c, andando };
  });
}

/** A leitura leve que está na memória ainda vale? Leu todas há menos de
 *  VALIDADE_MS e nenhuma fonte está "andando" (aí a tela precisa saber
 *  quando ela termina). */
export function leveVale(m, agora) {
  return !!m && m.lidoEm > 0 && agora - m.lidoEm < VALIDADE_MS && andandoEntre(m).length === 0;
}

/** Das fontes pedidas, as que a sub-aba Dados precisa ler (de novo) com os
 *  dados: nunca lidas, lidas há VALIDADE_MS ou mais, ou com o retrato
 *  desatualizado (a leitura leve viu coleta nova). */
export function cheiasParaLer(m, fontes, agora) {
  return listaDeFontes(fontes).filter((k) => {
    if (!m || !tem(m.cheias, k)) return true;
    if (agora - marca(m.cheiasEm, k) >= VALIDADE_MS) return true;
    return objeto(m.cheias[k]) && tem(m.estados, k) && !mesmaColeta(m.cheias[k], m.estados[k]);
  });
}

/** Das fontes pedidas, as que têm o retrato cheio desatualizado (coleta nova
 *  vista pela leitura leve). É por elas que a sub-aba pede de novo sozinha. */
export function desatualizadas(m, fontes) {
  if (!m) return [];
  return listaDeFontes(fontes).filter((k) => tem(m.cheias, k) && objeto(m.cheias[k]) && tem(m.estados, k) && !mesmaColeta(m.cheias[k], m.estados[k]));
}

/** As fontes com coleta "andando" agora (todas, ou só entre as pedidas). */
export function andandoEntre(m, fontes = null) {
  if (!m) return [];
  const chaves = fontes == null ? Object.keys(m.estados) : listaDeFontes(fontes);
  return chaves.filter((k) => tem(m.estados, k) && m.estados[k]?.andando === true);
}
