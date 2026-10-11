/* AS CONEXÕES DO MARKETING NA TELA: o bloco "Conexões" de Configurações >
 * Marketing e a faixa "Fontes" da Visão geral (integrações, 11/10/2026).
 *
 * Contrato em docs/marketing/integracoes-contrato.md, seções 6 e 7. Aqui só
 * cálculo puro: o que cada linha mostra, a volta do OAuth lida da URL e o
 * texto de cada resposta dos botões. Sem rede e sem relógio escondido (quem
 * precisa de "hoje" recebe por parâmetro).
 *
 * As contas que valem também para a sub-aba "Dados" do canal (estado de cada
 * fonte, botões por papel, nomes das partes, formatadores) moram em
 * marketing-fontes.js e são usadas daqui; este arquivo não repete nenhuma.
 *
 * A VOLTA DO OAUTH COM CONFIRMAÇÃO (protocolo de 11/10/2026). O Conectar
 * recebe do servidor a url do provedor e um nonce, que a tela guarda NESTA
 * ABA antes de navegar. O provedor devolve o Léo à painel-mkt-oauth, que
 * guarda a conexão como PEDIDA e manda para
 * /configuracoes?secao=marketing&conexao=<fonte>&r=ok&confirmar=<nonce> (ou
 * r=erro&motivo=<código>). A conexão só passa a valer quando a tela chama
 * "conectarConfirmar" com o nonce, e ela só chama quando o nonce da URL é o
 * guardado na aba. Sem esses dois passos, um link de volta forjado (o fluxo
 * de outra pessoa, com a conta dela) trocaria a conta da casa sem ninguém
 * perceber: a aba prova que a volta é do Conectar que saiu dela, o crachá
 * prova quem está confirmando, e o servidor confere que é quem pediu.
 *
 * NADA DA URL VIRA TEXTO NA TELA: a fonte só vale se for uma das fontes por
 * OAuth; o motivo só vale como código (o texto vem do mapa MOTIVOS, do
 * servidor ou desta tela); o nonce nunca aparece, só volta ao servidor.
 */
import { MOTIVOS, PROVEDORES } from '../../../supabase/functions/_shared/mkt-oauth.mjs';
import { dataCurta, dataLonga } from '../format.js';
import { paraDia } from './marketing-canais.js';
import { TRAVA_COLETA_MS } from '../../../supabase/functions/_shared/mkt-fontes/info.mjs';
import {
  FONTES,
  ROTULO_CURTO,
  ROTULO_FONTE,
  ROTULO_PARTE,
  acoesDaFonte,
  conexaoDesconhecida,
  fmtDataHora,
  infoEstado,
  motivoLegivel,
  retratoDeAntes,
  rotuloParte,
  secretsDaFonte,
  semConexao,
  situacaoDaFonte,
} from './marketing-fontes.js';

const objeto = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const texto = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const instante = (v) => (typeof v === 'string' && v ? Date.parse(v) : NaN);

/** "A", "A e B", "A, B e C". */
export function listaHumana(itens) {
  const l = (Array.isArray(itens) ? itens : []).filter((x) => typeof x === 'string' && x);
  if (l.length <= 1) return l[0] || '';
  return `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}`;
}

/** O nome curto da fonte (Site, Google, Meta...), nunca vazio. */
export const rotuloDaFonte = (f) => ROTULO_FONTE[f?.fonte] || texto(f?.nome) || String(f?.fonte ?? 'Fonte');

/* ------------------------------------------------------- a volta do OAuth -- */

/** Os parâmetros que a volta do OAuth põe na URL de Configurações. A tela lê
 *  uma vez e tira todos: o nonce não fica no histórico do navegador, e um F5
 *  não manda confirmar de novo. */
export const PARAMETROS_DA_VOLTA = Object.freeze(['conexao', 'r', 'confirmar', 'motivo']);

/** O foco que a faixa "Fontes" da Visão geral pede (?fonte=google): a linha
 *  daquela fonte aparece na tela. Também sai da URL depois de lido. */
export const PARAMETRO_FOCO = 'fonte';

// O nonce do servidor é base64url de 16 bytes (22 letras). A régua aceita de
// 16 a 128 letras do alfabeto base64url: cabe um nonce maior, e não cabe
// nada que vire HTML, caminho ou outro parâmetro.
const NONCE = /^[A-Za-z0-9_-]{16,128}$/;
// Código de motivo: o formato dos códigos de MOTIVOS (state_invalido,
// pedido_vencido...). Texto livre, espaço, sinal e maiúscula não passam.
const CODIGO = /^[a-z][a-z0-9_]{0,59}$/;

function lerParametro(params, chave) {
  const v = params && typeof params.get === 'function' ? params.get(chave) : objeto(params) ? params[chave] : null;
  return typeof v === 'string' ? v : null;
}

/** A volta do OAuth na URL, ou null quando a URL não é uma volta:
 *  - {fonte, nome, tipo: 'confirmar', nonce}: r=ok com o nonce (o caminho
 *    certo; a tela confirma uma vez, sozinha);
 *  - {fonte, nome, tipo: 'erro', motivo}: r=erro; motivo é o CÓDIGO (ou null
 *    quando o que veio não tem cara de código);
 *  - {fonte: null, nome: null, tipo: 'erro', motivo}: r=erro SEM "conexao".
 *    É a volta do state que não conferiu (vencido, adulterado): o servidor
 *    não sabe de qual fonte era e não manda. Antes ela sumia sem aviso
 *    nenhum (revisão de 12/10); agora vira o aviso genérico;
 *  - {fonte, nome, tipo: 'sem_confirmacao'}: r=ok sem nonce válido. O
 *    servidor do protocolo novo não manda isso; pode ser o servidor antigo
 *    (que já gravava a conexão na volta) ou um link montado à mão. A tela
 *    não afirma nada: manda conferir a linha.
 *  Fonte que não se conecta por OAuth (ou que não existe) não é volta. */
export function lerVoltaDoOAuth(params) {
  const fonte = lerParametro(params, 'conexao');
  const r = lerParametro(params, 'r');
  const motivoDaUrl = () => {
    const motivo = lerParametro(params, 'motivo');
    return motivo && CODIGO.test(motivo) ? motivo : null;
  };
  if (fonte == null && r === 'erro') return { fonte: null, nome: null, tipo: 'erro', motivo: motivoDaUrl() };
  if (!fonte || !Object.hasOwn(PROVEDORES, fonte) || (r !== 'ok' && r !== 'erro')) return null;
  const nome = PROVEDORES[fonte].nome;
  if (r === 'erro') return { fonte, nome, tipo: 'erro', motivo: motivoDaUrl() };
  const nonce = lerParametro(params, 'confirmar');
  return nonce && NONCE.test(nonce) ? { fonte, nome, tipo: 'confirmar', nonce } : { fonte, nome, tipo: 'sem_confirmacao' };
}

/* O NONCE GUARDADO NA ABA (protocolo fechado em 11/10/2026). O Conectar
   guarda nesta aba, ANTES de ir ao provedor, o nonce que o servidor devolveu
   (uma chave por fonte), e a volta só é confirmada sozinha quando o nonce da
   URL é o guardado para aquela fonte. Um link de volta que chegou de outra
   pessoa (ou de outra aba) não confirma nada: a tela pede para clicar em
   Conectar de novo. O servidor confere outra vez (o crachá de quem pediu);
   esta é a primeira porta, e a que não depende de rede. Usado, o nonce sai
   da aba. Tudo em try/catch: armazenamento bloqueado não derruba a tela, só
   não guarda (e aí o Conectar avisa em vez de abrir o provedor à toa). O
   `armazenamento` entra por parâmetro para o teste. */
export const chaveDoNonce = (fonte) => `painel-mkt-conexao-nonce:${fonte}`;
function armazenamentoDaAba() {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}
const fonteOAuth = (fonte) => typeof fonte === 'string' && Object.hasOwn(PROVEDORES, fonte);

/** Guarda o nonce do Conectar na aba. Devolve true só se ficou guardado. */
export function guardarNonce(fonte, nonce, armazenamento = armazenamentoDaAba()) {
  if (!fonteOAuth(fonte) || typeof nonce !== 'string' || !NONCE.test(nonce) || !armazenamento) return false;
  try {
    armazenamento.setItem(chaveDoNonce(fonte), nonce);
    return armazenamento.getItem(chaveDoNonce(fonte)) === nonce;
  } catch {
    return false;
  }
}

/** O nonce guardado na aba para a fonte, ou null. */
export function lerNonceGuardado(fonte, armazenamento = armazenamentoDaAba()) {
  if (!fonteOAuth(fonte) || !armazenamento) return null;
  try {
    const v = armazenamento.getItem(chaveDoNonce(fonte));
    return typeof v === 'string' && NONCE.test(v) ? v : null;
  } catch {
    return null;
  }
}

/** Tira o nonce da aba (usado, ou o Conectar não chegou a sair). */
export function apagarNonceGuardado(fonte, armazenamento = armazenamentoDaAba()) {
  if (!fonteOAuth(fonte) || !armazenamento) return;
  try {
    armazenamento.removeItem(chaveDoNonce(fonte));
  } catch {
    /* sem armazenamento: não havia nada guardado */
  }
}

/** A volta pode ser confirmada sozinha? Só uma volta "confirmar" com o
 *  nonce da URL IGUAL ao guardado nesta aba para aquela fonte. */
export const voltaDestaAba = (volta, guardado) =>
  objeto(volta) && volta.tipo === 'confirmar' && typeof guardado === 'string' && NONCE.test(guardado) && guardado === volta.nonce;

/** A fonte que a URL pede para mostrar (?fonte=), ou null. */
export function lerFoco(params) {
  const f = lerParametro(params, PARAMETRO_FOCO);
  return f && FONTES.includes(f) ? f : null;
}

/** A consulta sem as chaves pedidas, para trocar a URL (com replace), ou
 *  null quando nenhuma delas está lá (aí não há o que trocar). As outras
 *  chaves (secao, as de outras partes de Configurações) ficam. */
export function semParametros(params, chaves = PARAMETROS_DA_VOLTA) {
  if (!params || typeof params.has !== 'function') return null;
  if (!chaves.some((k) => params.has(k))) return null;
  const n = new URLSearchParams(params);
  for (const k of chaves) n.delete(k);
  return n;
}

/** O texto de um código de motivo: o mapa que o servidor mandou (na ação
 *  "fontes"), depois o MOTIVOS de mkt-oauth.mjs (o mesmo arquivo do
 *  servidor, no pacote da tela, que já tem os dois da confirmação:
 *  pedido_vencido e outra_pessoa). Assim a confirmação que responde antes de
 *  as fontes serem lidas também acha o texto, sem uma cópia da frase aqui
 *  (a cópia de antes ficou para trás quando a frase do servidor mudou).
 *  Código desconhecido devolve null (quem chama escolhe a frase genérica).
 *  Só chave própria: "toString" não acha texto no protótipo. */
export function textoDoMotivo(codigo, motivos) {
  if (typeof codigo !== 'string' || !CODIGO.test(codigo)) return null;
  for (const tabela of [motivos, MOTIVOS]) {
    if (objeto(tabela) && Object.hasOwn(tabela, codigo)) {
      const t = texto(tabela[codigo]);
      if (t) return t;
    }
  }
  return null;
}

/** O erro da confirmação que vale tentar de novo com o mesmo nonce: a rede
 *  (sem status) ou o servidor fora do ar (5xx). Um 4xx é resposta: o pedido
 *  venceu, é de outra pessoa, o papel não pode ou a função é a antiga. */
export const confirmacaoTransitoria = (e) => !Number.isInteger(e?.status) || e.status >= 500;

/** O aviso da volta, no topo do bloco Conexões: {tom, texto, tentarDeNovo}.
 *  `volta` é o que lerVoltaDoOAuth devolveu (ou, com tipo 'outra_aba', a
 *  volta cujo nonce não é o guardado nesta aba) mais, na confirmação, a
 *  etapa (confirmando | ok | recusada | falhou), o `motivo` (código) e a
 *  `mensagem` do erro. tom: ok, erro, aviso ou neutro. */
export function avisoDaVolta(volta, motivos) {
  if (!objeto(volta)) return null;
  const generico = MOTIVOS.troca_falhou;
  // A volta sem fonte (o state não conferiu): a frase do código, sem nome.
  if (volta.fonte == null && volta.tipo === 'erro') return { tom: 'erro', texto: `A conexão não foi feita. ${textoDoMotivo(volta.motivo, motivos) ?? generico}` };
  if (!Object.hasOwn(PROVEDORES, volta.fonte ?? '')) return null;
  const nome = PROVEDORES[volta.fonte].nome;
  // "A conexão ... não foi feita", e não "não conectado": numa reconexão
  // recusada, a conexão de antes continua valendo (a linha mostra).
  const naoFeita = `A conexão do ${nome} não foi feita.`;
  if (volta.tipo === 'erro') return { tom: 'erro', texto: `${naoFeita} ${textoDoMotivo(volta.motivo, motivos) ?? generico}` };
  if (volta.tipo === 'sem_confirmacao') {
    return {
      tom: 'neutro',
      texto: `A volta do ${nome} chegou sem o pedido de confirmação. Confira na linha do ${nome} se ele aparece conectado; se não, clique em Conectar de novo.`,
    };
  }
  // O nonce da URL não é o guardado nesta aba: nada foi confirmado.
  if (volta.tipo === 'outra_aba') {
    return {
      tom: 'aviso',
      texto: `A conexão do ${nome} não foi confirmada: esta volta não saiu de um Conectar feito nesta aba (pode ser um link de outra pessoa ou de outra aba). Para ligar, clique em Conectar de novo.`,
    };
  }
  if (volta.tipo !== 'confirmar') return null;
  switch (volta.etapa) {
    case 'ok':
      return { tom: 'ok', texto: `${nome} conectado. Os números chegam na próxima coleta (todo dia de manhã) ou em Atualizar agora.` };
    case 'recusada':
      return { tom: 'erro', texto: `${naoFeita} ${textoDoMotivo(volta.motivo, motivos) ?? texto(volta.mensagem) ?? generico}` };
    case 'falhou':
      return { tom: 'erro', texto: `Não deu para confirmar a conexão do ${nome} agora. ${texto(volta.mensagem) ?? 'Tente de novo.'}`, tentarDeNovo: true };
    default:
      return { tom: 'neutro', texto: `Confirmando a conexão do ${nome}...` };
  }
}

/* --------------------------------------------------------------- a linha -- */

// Dia (sem hora) para gente: "01/10", com o ano quando não é o de `hoje`.
function fmtDia(iso, hoje) {
  const dia = paraDia(iso);
  if (!dia) return null;
  const h = paraDia(hoje);
  return h && h.slice(0, 4) === dia.slice(0, 4) ? dataCurta(dia) : dataLonga(dia);
}

// A fonte está parada inteira por um motivo de AGORA (sem os secrets, ou
// por OAuth e sem a conexão, sabido)? Aí o estado guardado de cada parte é
// velho. A conexão desconhecida (o cofre não foi lido) não para nada.
const paradaInteira = (f) => f.configurado === false || semConexao(f);

/** Até este tanto de partes a linha mostra todas, cada uma com o estado; com
 *  mais (o site tem 8, o Google Ads 17), só as que pedem atenção e a conta
 *  das que funcionam: dezessete selos verdes não dizem nada que "17 de 17"
 *  não diga. */
export const PARTES_NA_LINHA = 5;

// O código técnico de uma parte, só no formato de código (letras minúsculas,
// números e "_"): é o que pode virar frase pela tabela de motivos.
const CODIGO_DE_PARTE = /^[a-z0-9_]{1,60}$/;

/** O motivo de uma parte, em TEXTO para gente. Os conectores consertados
 *  (11/10/2026) mandam, em todas as fontes, {estado, motivo?, codigo?}: o
 *  `motivo` já é a frase, e o `codigo` é técnico e NÃO vai para a tela. O
 *  formato antigo (o motivo como código, ainda nos dados fictícios) também
 *  vale: código conhecido vira frase (motivoLegivel). Sem frase nenhuma, o
 *  código conhecido ainda vira frase; código desconhecido, nunca aparece. */
export function motivoDaParte(p) {
  if (!objeto(p)) return null;
  const frase = motivoLegivel(p.motivo);
  if (frase) return frase;
  return typeof p.codigo === 'string' && CODIGO_DE_PARTE.test(p.codigo) ? motivoLegivel(p.codigo) : null;
}

/** As partes da fonte para a linha: {lista: [{chave, rotulo, info, motivo}],
 *  funcionando, total, resumidas}.
 *  - na ordem do FORMATO do conector (o Google: Analytics, Search Console,
 *    Perfil), e não na ordem em que o cache gravou;
 *  - o motivo é TEXTO (motivoDaParte): o código técnico nunca aparece, e
 *    código desconhecido fica de fora (a parte mostra só o estado);
 *  - fonte parada inteira ou com o estado de antes da conexão: nenhuma parte
 *    (o estado delas é da situação anterior; a regra é a do fontesDoCanal). */
export function partesDaLinha(f) {
  const vazio = { lista: [], funcionando: 0, total: 0, resumidas: false };
  if (!objeto(f) || !objeto(f.partes) || paradaInteira(f) || retratoDeAntes(f)) return vazio;
  const ordem = Object.keys(ROTULO_PARTE[f.fonte] || {});
  const pos = (k) => (ordem.includes(k) ? ordem.indexOf(k) : ordem.length);
  const todas = Object.entries(f.partes)
    .filter(([, p]) => objeto(p))
    .sort(([a], [b]) => pos(a) - pos(b) || a.localeCompare(b))
    .map(([chave, p]) => {
      const info = infoEstado(p.estado);
      return { chave, rotulo: rotuloParte(f.fonte, chave), info, motivo: info.chave === 'ok' ? null : motivoDaParte(p) };
    });
  const funcionando = todas.filter((p) => p.info.chave === 'ok').length;
  const resumidas = todas.length > PARTES_NA_LINHA;
  return { lista: resumidas ? todas.filter((p) => p.info.chave !== 'ok') : todas, funcionando, total: todas.length, resumidas };
}

/** A última coleta, para a linha:
 *  - a última trouxe dados: "coletado em 11/10 às 06:11";
 *  - a última não trouxe, mas uma antes trouxe: "dados de 10/10 às 06:11;
 *    tentou de novo em 11/10 às 06:11";
 *  - nenhuma trouxe: "tentou em 11/10 às 06:29, sem dados ainda";
 *  - nunca rodou: "ainda sem coleta".
 *  Fonte parada inteira (sem secrets, sem conexão) só diz de quando são os
 *  dados que ficaram, se ficaram: a tentativa de cada manhã ali é a porta
 *  fechada, e não informação. */
export function textoDaColeta(f, hoje) {
  if (!objeto(f)) return null;
  const quando = (iso) => fmtDataHora(iso, hoje, { vazio: null });
  const coletado = quando(f.coletadoEm);
  const boa = quando(f.ultimaBoaEm);
  if (paradaInteira(f)) return boa ? `dados de ${boa}` : null;
  if (!coletado) return boa ? `dados de ${boa}` : 'ainda sem coleta';
  if (boa && instante(f.ultimaBoaEm) >= instante(f.coletadoEm)) return `coletado em ${coletado}`;
  if (boa) return `dados de ${boa}; tentou de novo em ${coletado}`;
  return `tentou em ${coletado}, sem dados ainda`;
}

/** A frase de apoio da linha, quando o selo sozinho não diz o que fazer.
 *  Sem os secrets: os NOMES que faltam (nunca valor; a tela não tem). Os
 *  estados que já se explicam pelas partes e pelos avisos (funcionando,
 *  parcial, aguardando aprovação) não ganham frase. */
export function detalheDaLinha(f, papel) {
  if (!objeto(f)) return null;
  const gestao = papel === 'gestao';
  if (f.configurado === false) {
    const { obrigatorios } = secretsDaFonte(f.fonte);
    if (!obrigatorios.length) return 'Falta cadastrar os secrets desta fonte no Supabase. Veja Como ligar.';
    if (obrigatorios.length === 1) return `Precisa de ${obrigatorios[0]} nos Secrets do Supabase. Veja Como ligar.`;
    return `Precisa de ${listaHumana(obrigatorios)} nos Secrets do Supabase; falta ao menos um. Veja Como ligar.`;
  }
  // O cofre não foi lido agora: o selo é o da última coleta, e a linha diz
  // que a conexão não foi conferida (em vez de "falta conectar").
  if (conexaoDesconhecida(f)) return 'Não deu para conferir a conexão agora; o estado é o da última coleta.';
  const s = situacaoDaFonte(f);
  switch (s.chave) {
    case 'falta_conectar':
      return gestao ? 'Configurado. Falta clicar em Conectar e aceitar na tela do provedor.' : 'Configurado. Falta a gestão do Marketing conectar.';
    case 'reconectar':
      // A fonte por secret (o token da Meta, a chave do Google Ads) não tem
      // Reconectar: quem resolve troca o secret (o aviso diz qual).
      if (f.oauth !== true) return 'A credencial cadastrada parou de valer. Troque o secret no Supabase (veja o aviso e Como ligar).';
      return gestao ? 'A conexão parou de valer. Clique em Reconectar.' : 'A conexão parou de valer. A gestão do Marketing precisa reconectar.';
    case 'erro':
      // Frase fixa, para todos: o erro técnico do diário ("ga4 lote:
      // servidor (HTTP 503); semanas não gravadas (banco: 40001)") não é para
      // gente (revisão de 12/10). A gestão o tem na dica (detalheTecnico).
      return 'A última coleta falhou. O que já estava na tela continua, e a próxima coleta tenta de novo.';
    case 'aguardando_coleta':
    case 'sem_coleta':
    case 'desconhecido':
      return s.texto;
    default:
      return null;
  }
}

// Nome de secret: a régua do servidor (nomeDeSecretValido, sem a lista da casa).
const NOME_DE_SECRET = /^[A-Z][A-Z0-9_]{2,60}$/;

/** Os secrets OPCIONAIS da fonte, como o servidor mandou: [{nome,
 *  cadastrado}]. Só o nome e se existe no servidor; o valor nunca vem.
 *  Nome fora do formato não passa; servidor antigo (sem a lista) dá []. É
 *  o que o "Como ligar" mostra antes dos passos, para o Léo ver se o
 *  opcional que a linha pediu já está cadastrado. */
export function opcionaisDaFonte(f) {
  if (!objeto(f) || !Array.isArray(f.opcionais)) return [];
  const vistos = new Set();
  return f.opcionais
    .filter((o) => objeto(o) && typeof o.nome === 'string' && NOME_DE_SECRET.test(o.nome) && !vistos.has(o.nome) && vistos.add(o.nome))
    .map((o) => ({ nome: o.nome, cadastrado: o.cadastrado === true }));
}

/** O texto técnico do último erro da coleta (o diário: "ga4 lote: servidor
 *  (HTTP 503)"), SÓ para a gestão, e só quando o estado é "erro": vai na
 *  dica da frase da linha, para quem for consertar. Os outros papéis: null. */
export function detalheTecnicoDaLinha(f, papel) {
  if (papel !== 'gestao' || !objeto(f) || situacaoDaFonte(f).chave !== 'erro') return null;
  const e = texto(Array.isArray(f.ultimas) ? f.ultimas[0]?.erro : null);
  return e ? `Detalhe técnico da última coleta: ${e}` : null;
}

/** Tudo o que a linha de uma fonte desenha em Conexões, já pronto:
 *  {fonte, rotulo, nome, oauth, situacao, conta, conectado, coleta, partes,
 *   detalhe, detalheTecnico, avisos, acoes, opcionais}. Fonte inválida
 *  devolve null. */
export function linhaDaConexao(f, papel, hoje) {
  if (!objeto(f) || typeof f.fonte !== 'string' || !f.fonte) return null;
  const situacao = situacaoDaFonte(f);
  const dia = f.oauth === true && objeto(f.conexao) ? fmtDia(f.conexao.conectadoEm, hoje) : null;
  const partes = partesDaLinha(f);
  // O aviso que repete a frase de uma parte que a linha já mostra não vira
  // "1 aviso" (revisão de 12/10: o Google Ads dizia o mesmo motivo duas
  // vezes, na parte e no aviso).
  const ditas = new Set(partes.lista.map((x) => x.motivo).filter(Boolean));
  return {
    fonte: f.fonte,
    rotulo: rotuloDaFonte(f),
    nome: texto(f.nome) || rotuloDaFonte(f),
    oauth: f.oauth === true,
    situacao,
    conta: texto(f.conta) ?? (objeto(f.conexao) ? texto(f.conexao.conta) : null),
    conectado: dia ? `conectado em ${dia}` : conexaoDesconhecida(f) ? 'conexão não conferida agora' : null,
    coleta: textoDaColeta(f, hoje),
    partes,
    detalhe: detalheDaLinha(f, papel),
    detalheTecnico: detalheTecnicoDaLinha(f, papel),
    // Avisos de antes da conexão falam da situação anterior: não vão como
    // atuais (situacaoDaFonte, avisosVelhos).
    avisos: situacao.avisosVelhos || !Array.isArray(f.avisos) ? [] : f.avisos.map(texto).filter((a) => a && !ditas.has(a)),
    acoes: acoesDaFonte(f, papel),
    opcionais: opcionaisDaFonte(f),
  };
}

/** Os botões da linha: no máximo dois à vista (a regra do cartão compacto
 *  da casa, CardCompacto.jsx) e o resto no menu "...". O que resolve o
 *  estado vem primeiro: Conectar ou Reconectar quando a fonte pede; senão,
 *  Atualizar agora. Desconectar vai sempre para o menu: é raro e apaga a
 *  conexão. `primario` é o botão desenhado cheio (Conectar ou Reconectar,
 *  quando pedido), ou null. */
export function botoesDaLinha(acoes, chaveSituacao) {
  const a = objeto(acoes) ? acoes : {};
  const pede = chaveSituacao === 'reconectar' || chaveSituacao === 'falta_conectar';
  const ordem = pede ? ['conectar', 'reconectar', 'atualizar'] : ['atualizar', 'conectar', 'reconectar'];
  const ligados = ordem.filter((k) => a[k] === true);
  const visiveis = ligados.slice(0, 2);
  const primario = visiveis.find((k) => k === 'conectar' || (k === 'reconectar' && pede)) ?? null;
  return { visiveis, menu: [...ligados.slice(2), ...(a.desconectar === true ? ['desconectar'] : [])], primario };
}

/* ------------------------------------------------- a faixa da Visão geral -- */

/** Um selo por fonte, na ordem do servidor: [{fonte, rotulo, info, curto}].
 *  O estado é o mesmo da linha de Conexões (situacaoDaFonte): a faixa e a
 *  linha nunca discordam. `curto` é o rótulo do selo (ROTULO_CURTO: com
 *  "Aguardando a coleta" os seis não cabiam numa linha a 1280 px); o
 *  inteiro (info.rotulo) vai na dica e no aria-label. Sem retrato, null (a
 *  tela diz que não leu). */
export function faixaDasFontes(retrato) {
  if (!objeto(retrato) || !Array.isArray(retrato.lista)) return null;
  return retrato.lista
    .filter((f) => objeto(f) && typeof f.fonte === 'string' && f.fonte)
    .map((f) => {
      const info = situacaoDaFonte(f);
      return { fonte: f.fonte, rotulo: rotuloDaFonte(f), info, curto: ROTULO_CURTO[info.chave] ?? info.rotulo };
    });
}

/* -------------------------------------------------- as respostas dos botões -- */
// O rótulo vem antes de dois-pontos ("Meta: ..."): assim nenhuma frase
// precisa de artigo (o Site, a Meta) para concordar.

/** "Atualizar agora" que terminou dentro da espera do servidor. */
export const textoDaColetaPronta = (f) => `${rotuloDaFonte(f)}: coleta concluída (${situacaoDaFonte(f).rotulo}).`;

/** "Atualizar agora" que voltou {andando: true}: a coleta segue no servidor. */
export const textoDaColetaAndando = (rotulo) => `${rotulo}: a coleta começou e continua no servidor. Esta linha se atualiza sozinha quando ela terminar.`;

/** A releitura desistiu antes de a coleta terminar. */
export const textoDaColetaDemorada = (rotulo) => `${rotulo}: a coleta ainda não terminou. Recarregue a página daqui a pouco para ver o resultado.`;

/** Quando reler as fontes enquanto alguma coleta anda (um "Atualizar agora"
 *  que voltou andando, ou a coleta da manhã que a tela pegou no meio),
 *  segundos depois da leitura anterior: cedo no começo, espaçado depois.
 *  Somam 165 s, a vida de uma coleta (a Edge Function para em 150 s). Quem
 *  relê é a memória única (dados/useFontesMarketing.js), para as três telas:
 *  leve, e só as fontes que andam. */
export const ESPERAS_DA_RELEITURA_S = Object.freeze([5, 10, 15, 30, 45, 60]);
/** Depois disto (desde o pedido), a tela para de esperar aquela coleta. */
export const LIMITE_DA_RELEITURA_MS = 170_000;

/** A coleta acompanhada terminou? A fonte não está mais andando e a data da
 *  coleta mudou desde o pedido (`desde` é a coletadoEm de antes, ou null). */
export function coletaTerminou(f, desde) {
  return objeto(f) && f.andando !== true && !!texto(f.coletadoEm) && f.coletadoEm !== desde;
}

/** A pergunta do Desconectar. No Google, os três caem juntos: a revogação
 *  vale para o projeto inteiro (AVISO_DESCONECTAR_GOOGLE, no servidor). */
export function perguntaDeDesconectar(fonte) {
  const nome = PROVEDORES[fonte]?.nome || ROTULO_FONTE[fonte] || String(fonte);
  const juntos = fonte === 'google' ? ' Isso desliga juntos o Analytics, o Search Console e o Perfil da Empresa: os três usam a mesma conexão.' : '';
  return `Desconectar o ${nome}?${juntos} A coleta para até alguém conectar de novo; os números já coletados ficam.`;
}

/** O aviso depois do Desconectar: {tom, texto}. A frase do servidor
 *  (`aviso`) vai junto. Tom de atenção, e não de "deu certo", quando falta
 *  um passo: a revogação que o Google não confirmou (vale tirar o acesso na
 *  Conta Google) e o retrato do LinkedIn que não saiu do cache (retratoFicou:
 *  o aviso manda desconectar de novo, e o botão continua na linha). O
 *  servidor antigo não manda retratoFicou: fora do Google, todo aviso é um
 *  passo que falta. */
export function avisoDoDesconectar(fonte, r) {
  const nome = PROVEDORES[fonte]?.nome || ROTULO_FONTE[fonte] || String(fonte);
  const extra = texto(r?.aviso);
  const falta = r?.revogado === false || r?.retratoFicou === true || (fonte !== 'google' && !!extra);
  return { tom: falta ? 'aviso' : 'ok', texto: `${nome} desconectado.${extra ? ` ${extra}` : ''}` };
}

/* ---------------------------------------------------- o login e a pessoa -- */

/** A pessoa NÃO tem conta no Painel? Só quando o servidor disse que não
 *  (temContaPainel === false): campo que não veio (servidor antigo) ou
 *  pessoa fora da lista não viram aviso. */
export function semContaNoPainel(pessoas, idPessoa) {
  if (!Array.isArray(pessoas) || !idPessoa) return false;
  return pessoas.find((p) => p?.idPessoa === idPessoa)?.temContaPainel === false;
}

/** O aviso de que o login não está ligado a uma pessoa do RH: quando o
 *  servidor disse (semIdentidade === true), EM QUALQUER PAPEL. O servidor só
 *  manda true para quem não é a direção, e aí o papel é sempre o padrão
 *  (marketing): exigir "gestao" aqui fazia o aviso nunca aparecer (revisão
 *  de 12/10). */
export const avisarSemIdentidade = (painel) => !!painel && painel.semIdentidade === true;

/** A frase do aviso: o que a falta da ligação muda para quem lê (o filtro
 *  Minhas e o papel dado à pessoa, que não alcança este login). */
export const TEXTO_SEM_IDENTIDADE =
  'Seu login não está ligado a uma pessoa do RH: o filtro Minhas não aparece, e vale o papel padrão do Marketing, e não um papel dado a você. Peça à direção para ligar o login à sua ficha.';

/* ------------------------------------------ a rolagem e a volta da página -- */

/** A página de Configurações rola até o grupo pedido (?secao=). Quando a
 *  URL leva a uma LINHA de Conexões (?fonte=, o selo da faixa) ou é a volta
 *  do Conectar (r=), quem rola é o bloco Conexões, até a linha ou até o
 *  aviso, e a página só abre o grupo: a rolagem suave do grupo chegava
 *  depois e desfazia a ida até a linha (revisão de 12/10). */
export function conexoesCuidamDaRolagem(params) {
  if (!params || typeof params.has !== 'function') return false;
  return params.has(PARAMETRO_FOCO) || params.has('r');
}

/** O "ocupado" dos botões depois que a página volta do cache do navegador
 *  (Voltar depois do Conectar): o Conectar e o Reconectar que levaram para o
 *  provedor não estão mais abrindo nada, e o botão não pode ficar preso em
 *  "Abrindo...". O resto (uma coleta em andamento) fica. */
export function ocupadoDepoisDeVoltar(ocupado) {
  if (!objeto(ocupado)) return {};
  return Object.fromEntries(Object.entries(ocupado).filter(([, o]) => o !== 'conectar' && o !== 'reconectar'));
}

/* --------------------------------------- a trava de 2 minutos da coleta -- */

/** As travas do "Atualizar agora" depois de um pedido: {fonte: até (ms)}.
 *  Coleta aceita: o servidor marcou 2 minutos (TRAVA_COLETA_MS) para todo
 *  mundo; recusa 429: o que o servidor disse que falta. O resto não trava.
 *  Devolve um objeto novo (o de entrada não muda). */
export function travasDepois(travas, resultados, agora) {
  const novas = { ...(objeto(travas) ? travas : {}) };
  for (const r of Array.isArray(resultados) ? resultados : []) {
    if (!objeto(r) || typeof r.fonte !== 'string') continue;
    if (r.ok === true) novas[r.fonte] = agora + TRAVA_COLETA_MS;
    else if (r.status === 429 && Number.isFinite(r.aguardarSegundos) && r.aguardarSegundos > 0) novas[r.fonte] = agora + r.aguardarSegundos * 1000;
  }
  return novas;
}

/** Quantos segundos faltam na trava da fonte (0: livre). */
export function segundosDaTrava(travas, fonte, agora) {
  const ate = objeto(travas) && Number.isFinite(travas[fonte]) ? travas[fonte] : 0;
  return ate > agora ? Math.ceil((ate - agora) / 1000) : 0;
}

/** O rótulo do botão travado: "Atualizar em 95 s". */
export const rotuloDaTrava = (segundos) => `Atualizar em ${segundos} s`;

/** O aviso do "Atualizar agora" de várias fontes (a sub-aba Dados): {tom,
 *  texto}, dizendo o que atualizou, o que continua no servidor, o que
 *  espera a trava (as `travadas`, puladas aqui, e as recusadas com 429) e o
 *  que falhou. Só a falha é erro: o caso misto (uma fonte atualizou, outra
 *  espera) não pinta tudo de vermelho (revisão de 12/10).
 *  - resultados: os de atualizarFontes;
 *  - travadas: [{fonte, segundos}] das que nem foram pedidas;
 *  - nome(fonte): o rótulo para gente. */
export function resumoDaAtualizacao(resultados, { travadas = [], nome = (f) => ROTULO_FONTE[f] ?? String(f) } = {}) {
  const lista = Array.isArray(resultados) ? resultados.filter(objeto) : [];
  const prontas = lista.filter((r) => r.ok && !r.andando).map((r) => nome(r.fonte));
  const andando = lista.filter((r) => r.ok && r.andando).map((r) => nome(r.fonte));
  const esperam = [
    ...(Array.isArray(travadas) ? travadas : []).filter(objeto).map((t) => ({ fonte: t.fonte, segundos: t.segundos })),
    ...lista.filter((r) => !r.ok && r.status === 429).map((r) => ({ fonte: r.fonte, segundos: Number.isFinite(r.aguardarSegundos) ? r.aguardarSegundos : null })),
  ];
  const falhas = lista.filter((r) => !r.ok && r.status !== 429);
  const frases = [];
  if (prontas.length) frases.push(`Dados atualizados: ${listaHumana(prontas)}.`);
  if (andando.length) frases.push(`A coleta de ${listaHumana(andando)} continua no servidor; os números entram aqui sozinhos em instantes.`);
  // "Nome: ..." (e não "o Site foi..."): nenhuma frase precisa de artigo.
  for (const e of esperam) frases.push(`${nome(e.fonte)}: uma coleta por fonte a cada 2 minutos${e.segundos ? `; dá para pedir de novo em ${e.segundos} s` : ''}.`);
  for (const f of falhas) frases.push(`${nome(f.fonte)}: ${texto(f.erro)?.replace(/[.\s]+$/, '') ?? 'não foi possível atualizar'}.`);
  const algumBom = prontas.length + andando.length > 0;
  const tom = falhas.length && !algumBom && !esperam.length ? 'erro' : falhas.length || esperam.length ? 'aviso' : 'ok';
  return { tom, texto: frases.join(' ') };
}
