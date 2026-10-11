/* AS FONTES DO MARKETING NA PRÉVIA: as ações "fontes", "conectarInicio",
 * "conectarConfirmar", "desconectar" e "coletarAgora" da painel-marketing de
 * mentira (só na compilação review; quem chama é src/review/marketing.mjs).
 *
 * OS DADOS SÃO DOS CONECTORES DE VERDADE: fontes-ficticias.json e
 * fontes-ficticias-cheias.json são a resposta da ação "fontes" gerada pelos
 * seis conectores, pela coletora e pela porta de verdade, com a rede de
 * mentira das fixtures (ver tests/gerar-fontes-ficticias.mjs, que diz o
 * comando para gerar de novo). Nada de dado real.
 *
 * AS REGRAS SÃO AS DA PORTA DE VERDADE (supabase/functions/painel-marketing):
 *  - "fontes": todos os papéis; as chaves "restrito" (dado pessoal) só para
 *    a gestão (o mesmo tirarRestrito do info.mjs). {leve: true} manda cada
 *    fonte sem a chave "dados"; {fontes: [...]} manda só as pedidas, na
 *    ordem do servidor (a desconhecida é ignorada; o que não é lista vale
 *    como "não mandou");
 *  - "conectarInicio" e "desconectar": só a gestão, e só Google, LinkedIn e
 *    Pinterest; Conectar sem os secrets do app: 422 com faltaConfigurar;
 *  - "coletarAgora": gestão e marketing; um pedido por fonte a cada 2
 *    minutos (429 com aguardarSegundos);
 *  - o estado que a tela vê segue o fonteParaTela: sem os secrets é
 *    "falta_configurar"; fonte por OAuth sem conexão é "falta_conectar"; com
 *    conexão, o estado da última coleta (mesmo que ela seja de antes da
 *    conexão: a tela de verdade recebe isso, e lib/calc/marketing-fontes.js
 *    trata). As frases são as da porta (o teste confere uma a uma).
 *
 * O QUE A PRÉVIA SIMULA SEM PROVEDOR:
 *  - Conectar devolve {url, nonce}: no lugar da tela de permissão, o
 *    endereço da volta do protocolo com confirmação (11/10/2026),
 *    /configuracoes?secao=marketing&conexao=<fonte>&r=ok&confirmar=<nonce>
 *    (a consulta base é a do destinoDoRetorno de mkt-oauth.mjs), e o nonce,
 *    que a tela guarda na aba. Como no servidor, a conexão fica só PEDIDA:
 *    passa a valer quando a tela chama "conectarConfirmar" com o nonce, uma
 *    vez, dentro de 10 minutos (VALIDADE_STATE_S), com o mesmo login que
 *    pediu. Senão: 404 com motivo pedido_vencido, ou 403 com motivo
 *    outra_pessoa; 403 sem motivo para quem não é gestão; 422 para fonte
 *    fora do OAuth. Para sobreviver à recarga da página que a navegação
 *    faz, o PEDIDO (o lado do servidor) fica guardado na aba, numa chave
 *    própria (quem guarda é marketing.mjs);
 *  - Atualizar agora espera 1,5 s e devolve a fonte com a data nova. Fonte
 *    conectada na prévia depois da última coleta traz os dados completos
 *    dela (os do arquivo "cheias").
 *
 * PARÂMETROS DA PRÉVIA, na URL (antes ou depois do # da prévia compilada):
 *  - papel=gestao | marketing | visualizacao. Sem ele, quem revisa é a
 *    direção (gestão que também traz as ações antigas), como sempre foi;
 *  - cenario=<um ou mais, separados por vírgula>:
 *     fontes-cheias   as seis fontes ok, com todos os quadros;
 *     fontes-andando  o Atualizar agora devolve {andando: true} e a fonte
 *                     fica "coletando" por 8 s (a tela relê depois);
 *     fontes-erro     a ação "fontes" falha (500);
 *     fontes-antigo   as quatro ações respondem "Ação inválida." (a função
 *                     antiga ainda no ar);
 *     conexao-negada  o Conectar volta com r=erro&motivo=negado;
 *     pedido-vencido  a confirmação da volta responde 404 pedido_vencido;
 *     outra-pessoa    a confirmação da volta responde 403 outra_pessoa;
 *     confirmar-falhou a PRIMEIRA confirmação de cada pedido responde 500
 *                     (o servidor fora do ar); a segunda funciona, para
 *                     ver o "Tentar de novo" da tela;
 *     revogar-falhou  o Desconectar do Google volta revogado false, com o
 *                     aviso de tirar o acesso na Conta Google;
 *     sem-identidade  (o "painel", em marketing.mjs) o login não está
 *                     ligado a uma pessoa do RH: semIdentidade true. Como no
 *                     servidor, isso só acontece com quem não é a direção, e
 *                     aí o papel é o padrão (marketing): o cenário força o
 *                     papel marketing na prévia inteira (revisão de 12/10;
 *                     antes ele combinava com a direção, o que o servidor
 *                     nunca manda, e o aviso só aparecia na prévia).
 *  Exemplo: /configuracoes?secao=marketing&papel=marketing&cenario=fontes-andando
 */
import { FONTES, TRAVA_COLETA_MS, tirarRestrito } from '../../supabase/functions/_shared/mkt-fontes/info.mjs';
import { AVISO_DESCONECTAR_GOOGLE, FONTES_OAUTH, MOTIVOS, PROVEDORES, VALIDADE_STATE_S, destinoDoRetorno } from '../../supabase/functions/_shared/mkt-oauth.mjs';

export const ACOES_FONTES = Object.freeze(['fontes', 'conectarInicio', 'conectarConfirmar', 'desconectar', 'coletarAgora']);
export const PAPEIS_DA_PREVIA = Object.freeze(['gestao', 'marketing', 'visualizacao']);
export const CENARIOS_DA_PREVIA = Object.freeze([
  'fontes-cheias', 'fontes-andando', 'fontes-erro', 'fontes-antigo', 'conexao-negada', 'pedido-vencido', 'outra-pessoa', 'confirmar-falhou', 'revogar-falhou',
  'sem-identidade',
]);

/* As frases da porta de verdade, copiadas de painel-marketing/index.ts. O
   teste tests/mkt-fontes-previa.test.mjs confere que cada uma continua lá,
   igual: frase copiada que envelhece calada faria a prévia ensinar a tela a
   mostrar um texto que o servidor não manda mais. */
export const FRASES = Object.freeze({
  soVer: 'Seu papel no Marketing é só de visualização.',
  soGestao: 'Só a gestão do Marketing mexe nisso.',
  naoConecta: 'Esta fonte não se conecta por aqui.',
  fonteInvalida: 'Fonte inválida.',
  acaoInvalida: 'Ação inválida.',
  falhou: 'Não foi possível concluir. Tente novamente.',
  revogarFalhou: 'A conexão saiu do Painel, mas o Google não confirmou a revogação. Para garantir, tire o acesso do app na sua Conta Google (myaccount.google.com, na parte de segurança).',
});
export const faltaApp = (fonte) => `Falta cadastrar ${PROVEDORES[fonte].secrets.id} e ${PROVEDORES[fonte].secrets.segredo} nos Secrets do Supabase.`;
export const travaTexto = (segundos) => `Esta fonte foi atualizada há pouco. Tente de novo em ${segundos} segundos.`;

/* AS FRASES DA RECUSA DA CONFIRMAÇÃO vêm do MESMO lugar que as da porta: a
   painel-marketing responde {erro: MOTIVOS.pedido_vencido} e {erro:
   MOTIVOS.outra_pessoa} (o MOTIVOS de _shared/mkt-oauth.mjs, que também vai
   inteiro na ação "fontes"). Lidas daqui, e não copiadas, elas não ficam
   para trás quando a porta muda a frase; o teste confere que a porta
   continua respondendo com o MOTIVOS. */
export const FRASES_CONFIRMAR = Object.freeze({
  pedidoVencido: MOTIVOS.pedido_vencido,
  outraPessoa: MOTIVOS.outra_pessoa,
});

// O nonce de cada clique em Conectar: 16 bytes em base64url (22 letras), o
// mesmo formato do novoNonce do servidor.
function nonceAleatorio() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Quanto vale o token que o provedor devolve ao conectar (a mesma régua do
// mkt-oauth.mjs: Google 1 hora, LinkedIn 60 dias, Pinterest 30 dias com o
// refresh de 60).
const DIA = 86_400_000;
const VALIDADE = { google: { token: 3599_000, refresh: null }, linkedin: { token: 60 * DIA, refresh: 365 * DIA }, pinterest: { token: 30 * DIA, refresh: 60 * DIA } };
// A coleta simulada: quanto o "Atualizar agora" espera e quanto a fonte fica
// "andando" no cenário fontes-andando.
export const ESPERA_COLETA_MS = 1500;
export const DURACAO_ANDANDO_MS = 8000;

const objeto = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const copia = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const iso = (ms) => new Date(ms).toISOString();
const boa = (e) => e === 'ok' || e === 'parcial';

/** Os parâmetros da prévia na URL: {papel, direcao, cenarios}. A prévia
 *  compilada (revisao-local.html) usa HashRouter, e o que vem depois do #
 *  também conta. Papel e cenário desconhecidos são ignorados. */
export function parametrosDaPrevia(href) {
  let u;
  try { u = new URL(href); } catch { return { papel: 'gestao', direcao: true, cenarios: new Set() }; }
  const doHash = u.hash.includes('?') ? new URLSearchParams(u.hash.slice(u.hash.indexOf('?') + 1)) : new URLSearchParams();
  const ler = (k) => [...u.searchParams.getAll(k), ...doHash.getAll(k)];
  const papel = ler('papel').find((p) => PAPEIS_DA_PREVIA.includes(p)) || null;
  const cenarios = new Set(ler('cenario').flatMap((c) => c.split(',')).map((c) => c.trim()).filter((c) => CENARIOS_DA_PREVIA.includes(c)));
  // Login sem pessoa do RH: o servidor só manda isso para quem não é a
  // direção, e o papel é o padrão (papelEfetivo sem a linha da pessoa).
  if (cenarios.has('sem-identidade')) return { papel: 'marketing', direcao: false, cenarios };
  return { papel: papel || 'gestao', direcao: !papel, cenarios };
}

/** A conexão que a prévia "grava" ao Conectar: os campos sem token que a
 *  painel_mkt_conexao_info devolve, no formato da tela. A conta fica vazia
 *  até a primeira coleta (é a coletora que descobre o nome da conta). */
export function conexaoDaPrevia(fonte, quando, quem = 'demo') {
  const v = VALIDADE[fonte];
  return {
    conectadoEm: iso(quando),
    conectadoPor: quem,
    conta: null,
    escopos: [...PROVEDORES[fonte].escopos],
    expiraEm: iso(quando + v.token),
    refreshExpiraEm: v.refresh ? iso(quando + v.refresh) : null,
  };
}

/** O pedido de conexão guardado para a recarga da volta vale? É o que o
 *  Conectar da prévia guardou ({fonte, nonce, em, quem}): fonte por OAuth,
 *  nonce no formato do servidor e data de verdade. */
export function pedidoValido(p) {
  return objeto(p) && FONTES_OAUTH.includes(p.fonte) && typeof p.nonce === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(p.nonce)
    && Number.isFinite(p.em) && typeof p.quem === 'string' && !!p.quem;
}

/**
 * A porta de mentira das fontes.
 *  - carregar / carregarCheias: devolvem a resposta "fontes" dos dois
 *    arquivos (no navegador, um import() de cada JSON, só quando precisa);
 *  - papel, direcao, cenarios: de parametrosDaPrevia;
 *  - pedidoGuardado: o pedido de conexão feito antes da recarga ({fonte,
 *    nonce, em, quem}), ou null. Ele volta a ser um pedido pendente: a
 *    conexão só vale depois do "conectarConfirmar", como no servidor;
 *  - guardarPedido(pedido): guarda o pedido para a recarga (sessionStorage);
 *    null apaga;
 *  - enderecoDeVolta(consulta): o endereço de Configurações da prévia;
 *  - agora e esperar: o relógio (o teste passa um de mentira);
 *  - gerarNonce: o nonce de cada Conectar (o teste passa um fixo).
 * responder(acao, corpo) devolve {status, corpo}.
 */
export function criarFontesDaPrevia({
  carregar, carregarCheias = null, papel = 'gestao', cenarios = new Set(), pedidoGuardado = null, guardarPedido = () => {},
  enderecoDeVolta = (consulta) => `/configuracoes?${consulta}`, agora = () => Date.now(), esperar = (ms) => new Promise((r) => setTimeout(r, ms)), quem = 'demo',
  gerarNonce = nonceAleatorio,
} = {}) {
  const cen = cenarios instanceof Set ? cenarios : new Set(cenarios);
  const grava = papel === 'gestao' || papel === 'marketing';
  let base = null;
  let carregando = null;
  // Por fonte: `tela` (o objeto da resposta, como a gestão vê) e `retrato`
  // (o estado e os avisos que a última coleta gravou no cache, antes das
  // trocas que a porta faz por cima).
  const fontes = new Map();
  const pedidos = new Map();
  const andandoAte = new Map();
  // Os pedidos de conexão à espera da confirmação, por nonce.
  const pendentes = new Map();
  // Os nonces que já tiveram a primeira confirmação recusada com 500
  // (cenário confirmar-falhou).
  const falharamUmaVez = new Set();
  if (pedidoValido(pedidoGuardado)) pendentes.set(pedidoGuardado.nonce, { ...pedidoGuardado });

  async function carregarUmaVez() {
    if (base) return;
    carregando ??= (async () => {
      const r = cen.has('fontes-cheias') && carregarCheias ? await carregarCheias() : await carregar();
      const dados = copia(r);
      for (const f of dados.ordem) fontes.set(f, { tela: dados.fontes[f], retrato: { estado: dados.fontes[f].estado, avisos: [...(dados.fontes[f].avisos || [])] } });
      // O mapa de motivos é o que a porta manda: o MOTIVOS do servidor, com
      // os dois da confirmação (o arquivo gerado traz o mesmo; o teste dos
      // dados fictícios confere).
      base = { ordem: [...dados.ordem], avisos: dados.avisos || [], motivos: { ...MOTIVOS } };
    })();
    await carregando;
  }

  /** O que a tela vê de uma fonte: as duas trocas do fonteParaTela por
   *  cima do retrato, e o "andando". `leve`: sem a chave "dados" (a
   *  leitura leve da porta). */
  function vista(fonte, { leve = false } = {}) {
    const { tela, retrato } = fontes.get(fonte);
    const t = { ...tela };
    if (!t.configurado) { t.estado = 'falta_configurar'; t.avisos = []; }
    else if (t.oauth && !t.conexao) { t.estado = 'falta_conectar'; t.avisos = []; }
    else { t.estado = retrato.estado; t.avisos = [...retrato.avisos]; }
    t.andando = (andandoAte.get(fonte) ?? 0) > agora();
    // Como a porta: o erro técnico do diário só vai para a gestão.
    if (papel !== 'gestao' && Array.isArray(t.ultimas)) t.ultimas = t.ultimas.map((e) => ({ ...e, erro: null }));
    if (leve) {
      delete t.dados;
      return copia(t);
    }
    return papel === 'gestao' ? copia(t) : { ...copia(t), dados: tirarRestrito(copia(t.dados)) };
  }

  /** A coleta da prévia. Sem os secrets ou sem conexão, a coleta de verdade
   *  para na porta: o mesmo estado, nada pedido, só a data anda. Fonte
   *  conectada depois da última coleta (estado de antes da conexão) traz os
   *  dados completos do arquivo "cheias". O resto: os mesmos dados, com a
   *  data nova nas partes que vieram e a tentativa nas que falharam (a
   *  regra do juntarRetrato da coletora). A data da coleta é a do FIM, como
   *  na coletora (coletado_em é gravado depois que o conector termina). */
  async function coletar(fonte, inicio, fim) {
    const item = fontes.get(fonte);
    const t = item.tela;
    let chamadas = t.ultimas?.[0]?.chamadas ?? 0;
    if (!t.configurado) { item.retrato = { estado: 'falta_configurar', avisos: [] }; chamadas = 0; }
    else if (t.oauth && !t.conexao) { item.retrato = { estado: 'falta_conectar', avisos: [] }; chamadas = 0; }
    else {
      if (t.oauth && ['falta_conectar', 'reconectar'].includes(item.retrato.estado) && carregarCheias) {
        const cheia = copia((await carregarCheias()).fontes[fonte]);
        item.tela = { ...cheia, conexao: { ...t.conexao, conta: cheia.conta ?? null }, configurado: t.configurado, ultimas: t.ultimas || [] };
        item.retrato = { estado: cheia.estado, avisos: [...(cheia.avisos || [])] };
        chamadas = cheia.ultimas?.[0]?.chamadas ?? chamadas;
      }
      const agoraIso = iso(fim);
      item.tela.partes = Object.fromEntries(Object.entries(item.tela.partes || {}).map(([k, p]) => [k, boa(p.estado) ? { ...p, coletadoEm: agoraIso, tentadoEm: null } : { ...p, tentadoEm: agoraIso }]));
      if (boa(item.retrato.estado)) item.tela.ultimaBoaEm = agoraIso;
    }
    item.tela.coletadoEm = iso(fim);
    // O começo da coleta, como a coletora carimba (iniciado_em): é contra ele
    // que a tela compara uma conexão nova.
    item.tela.iniciadoEm = iso(inicio);
    item.tela.ultimas = [{ inicio: iso(inicio), fim: iso(fim), estado: item.retrato.estado, chamadas, erro: null }, ...(item.tela.ultimas || [])].slice(0, 5);
  }

  // As coletas do cenário fontes-andando que já "terminaram".
  async function terminarAsAndando() {
    for (const [fonte, ate] of [...andandoAte]) {
      if (ate > agora()) continue;
      andandoAte.delete(fonte);
      await coletar(fonte, ate - DURACAO_ANDANDO_MS, ate);
    }
  }

  const resposta = (status, corpo) => ({ status, corpo });
  const recusa = (status, erro, extra = {}) => resposta(status, { erro, ...extra });

  const ACOES = {
    async fontes(b) {
      if (cen.has('fontes-erro')) return recusa(500, FRASES.falhou);
      await carregarUmaVez();
      await terminarAsAndando();
      // Como a porta: leve só com true; a lista só quando é lista.
      const leve = b?.leve === true;
      const pedidas = Array.isArray(b?.fontes) ? base.ordem.filter((f) => b.fontes.includes(f)) : [...base.ordem];
      // Lista vazia: a porta nem vai ao banco, e o aviso das conexões não vem.
      return resposta(200, { ok: true, papel, ordem: pedidas, fontes: Object.fromEntries(pedidas.map((f) => [f, vista(f, { leve })])), avisos: pedidas.length ? [...base.avisos] : [], motivos: { ...base.motivos } });
    },
    async conectarInicio(b) {
      if (papel !== 'gestao') return recusa(403, FRASES.soGestao);
      const fonte = FONTES_OAUTH.includes(b?.fonte) ? b.fonte : null;
      if (!fonte) return recusa(422, FRASES.naoConecta);
      await carregarUmaVez();
      const item = fontes.get(fonte);
      if (!item?.tela.configurado) return recusa(422, faltaApp(fonte), { faltaConfigurar: true });
      const negada = cen.has('conexao-negada');
      const consulta = destinoDoRetorno(fonte, negada ? 'negado' : null).split('?')[1];
      if (negada) return resposta(200, { ok: true, url: enderecoDeVolta(consulta) });
      // O provedor "aceitou" na hora: a conexão fica PEDIDA (como a
      // painel-mkt-oauth deixa) e guardada para a recarga que a navegação
      // faz. Só vale depois da confirmação, com este nonce.
      const pedido = { fonte, nonce: gerarNonce(), em: agora(), quem };
      pendentes.set(pedido.nonce, pedido);
      guardarPedido(pedido);
      // Como a porta: a url e o nonce, que a tela guarda na aba antes de ir.
      return resposta(200, { ok: true, url: enderecoDeVolta(`${consulta}&confirmar=${encodeURIComponent(pedido.nonce)}`), nonce: pedido.nonce });
    },
    /* A confirmação da volta. A ordem das recusas é a do protocolo: papel,
       fonte, o pedido (existe, é desta fonte, está no prazo e não foi usado)
       e quem pediu. O pedido vale UMA vez: confirmado, sai da lista. */
    async conectarConfirmar(b) {
      if (papel !== 'gestao') return recusa(403, FRASES.soGestao);
      const fonte = FONTES_OAUTH.includes(b?.fonte) ? b.fonte : null;
      if (!fonte) return recusa(422, FRASES.naoConecta);
      await carregarUmaVez();
      const nonce = typeof b?.nonce === 'string' ? b.nonce : '';
      const pedido = pendentes.get(nonce) ?? null;
      const vencido = !pedido || pedido.fonte !== fonte || agora() - pedido.em > VALIDADE_STATE_S * 1000;
      if (cen.has('pedido-vencido') || vencido) {
        if (pedido && agora() - pedido.em > VALIDADE_STATE_S * 1000) pendentes.delete(nonce);
        return recusa(404, FRASES_CONFIRMAR.pedidoVencido, { motivo: 'pedido_vencido' });
      }
      if (cen.has('outra-pessoa') || pedido.quem !== quem) return recusa(403, FRASES_CONFIRMAR.outraPessoa, { motivo: 'outra_pessoa' });
      // O servidor fora do ar na primeira vez: o pedido continua de pé.
      if (cen.has('confirmar-falhou') && !falharamUmaVez.has(nonce)) {
        falharamUmaVez.add(nonce);
        return recusa(500, FRASES.falhou);
      }
      pendentes.delete(nonce);
      guardarPedido(null);
      const item = fontes.get(fonte);
      if (!item?.tela.configurado) return recusa(422, faltaApp(fonte), { faltaConfigurar: true });
      item.tela.conexao = conexaoDaPrevia(fonte, agora(), quem);
      return resposta(200, { ok: true, fonte: vista(fonte) });
    },
    async desconectar(b) {
      if (papel !== 'gestao') return recusa(403, FRASES.soGestao);
      const fonte = FONTES_OAUTH.includes(b?.fonte) ? b.fonte : null;
      if (!fonte) return recusa(422, FRASES.naoConecta);
      await carregarUmaVez();
      const item = fontes.get(fonte);
      const tinha = objeto(item?.tela.conexao);
      if (item) item.tela.conexao = null;
      guardarPedido(null);
      // Como a porta: só o Google revoga por API, e só se havia conexão.
      const revogado = PROVEDORES[fonte].urlRevogar && tinha ? !cen.has('revogar-falhou') : null;
      // retratoFicou: a prévia não tem o cache do LinkedIn que falha.
      return resposta(200, { ok: true, revogado, retratoFicou: false, aviso: revogado === false ? FRASES.revogarFalhou : fonte === 'google' ? AVISO_DESCONECTAR_GOOGLE : null });
    },
    async coletarAgora(b) {
      if (!grava) return recusa(403, FRASES.soVer);
      const fonte = FONTES.includes(b?.fonte) ? b.fonte : null;
      if (!fonte) return recusa(422, FRASES.fonteInvalida);
      await carregarUmaVez();
      if (!fontes.has(fonte)) return recusa(422, FRASES.fonteInvalida);
      const ultimo = pedidos.get(fonte);
      if (ultimo != null && agora() - ultimo < TRAVA_COLETA_MS) {
        const aguardar = Math.max(1, Math.ceil((TRAVA_COLETA_MS - (agora() - ultimo)) / 1000));
        return recusa(429, travaTexto(aguardar), { aguardarSegundos: aguardar });
      }
      const inicio = agora();
      pedidos.set(fonte, inicio);
      if (cen.has('fontes-andando')) {
        andandoAte.set(fonte, inicio + DURACAO_ANDANDO_MS);
        return resposta(200, { ok: true, andando: true });
      }
      await esperar(ESPERA_COLETA_MS);
      await coletar(fonte, inicio, Math.max(agora(), inicio + 1));
      return resposta(200, { ok: true, andando: false, fonte: vista(fonte) });
    },
  };

  return {
    async responder(acao, corpo) {
      if (!Object.hasOwn(ACOES, acao)) return recusa(400, FRASES.acaoInvalida);
      if (cen.has('fontes-antigo')) return recusa(400, FRASES.acaoInvalida);
      return ACOES[acao](corpo);
    },
  };
}
