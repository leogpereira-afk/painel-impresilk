/* AS FONTES DE DADOS DO MARKETING VISTAS PELA TELA (integrações, 11/10/2026).
 *
 * Contrato em docs/marketing/integracoes-contrato.md, seções 6 e 7. A tela
 * recebe da painel-marketing (ação "fontes") um retrato por fonte (site,
 * google, meta, google_ads, linkedin, pinterest), montado pelo fonteParaTela
 * de supabase/functions/_shared/mkt-fontes/info.mjs. O "dados" de cada fonte
 * segue a seção FORMATO do conector dela (_shared/mkt-fontes/<fonte>.mjs).
 *
 * Tudo aqui é cálculo puro: recebe o que o servidor mandou e devolve o que a
 * tela desenha. Sem rede, sem relógio escondido (quem precisa de "agora"
 * recebe por parâmetro). Três regras que este arquivo segura:
 *
 * 1. NÚMERO NÃO INFORMADO NÃO VIRA ZERO. Os conectores mandam null quando a
 *    API não mediu; os formatadores daqui devolvem "não medido" (ou o texto
 *    que quem chama pedir), e zero só quando o zero veio medido.
 *
 * 2. O ESTADO PODE SER DE ANTES DA CONEXÃO. O servidor só reescreve o estado
 *    de uma fonte na coleta seguinte: logo depois de Conectar (ou Reconectar),
 *    a fonte volta com a conexão nova e o estado velho ("falta conectar",
 *    "reconectar", com os avisos de antes). situacaoDaFonte percebe isso pela
 *    data (coleta anterior à conexão) e diz "aguardando a primeira coleta".
 *
 * 3. A TELA SÓ ESCONDE BOTÃO. Quem decide é o servidor (403 para o papel que
 *    não pode); acoesDaFonte só tira da tela o que ia ser recusado ou não ia
 *    funcionar (Conectar sem os secrets do app, Atualizar sem conexão).
 */
import { ESTADOS, FONTES, NOMES_FONTE, SECRETS_OPCIONAIS_PADRAO, SECRETS_PADRAO } from '../../../supabase/functions/_shared/mkt-fontes/info.mjs';
import { PROVEDORES } from '../../../supabase/functions/_shared/mkt-oauth.mjs';
import { dataCurta, dataLonga, numeroCompacto } from '../format.js';
import { diaValido, numeroOuNulo, paraDia } from './marketing-canais.js';

export { FONTES };

const objeto = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const instante = (v) => (typeof v === 'string' && v ? Date.parse(v) : NaN);

/* ------------------------------------------------------------- os nomes -- */

/** O nome curto de cada fonte, para linha de tabela e chip. O nome longo
 *  (com o que vem junto, "Google (Analytics, Search Console e Perfil da
 *  Empresa)") vem do servidor em `nome` e é o NOMES_FONTE do info.mjs. */
export const ROTULO_FONTE = Object.freeze({
  site: 'Site',
  google: 'Google',
  meta: 'Meta',
  google_ads: 'Google Ads',
  linkedin: 'LinkedIn',
  pinterest: 'Pinterest',
});

export const nomeLongoDaFonte = (fonte) => NOMES_FONTE[fonte] || ROTULO_FONTE[fonte] || String(fonte ?? '');

/** O nome de cada PARTE de cada fonte (as chaves de `partes` e de `dados`,
 *  na seção FORMATO de cada conector). */
export const ROTULO_PARTE = Object.freeze({
  site: Object.freeze({
    paginas: 'Páginas e etiquetas', robots: 'robots.txt', sitemap: 'Sitemap', wordpress: 'WordPress', dns: 'DNS e e-mail',
    versoes: 'Versões do WordPress', pagespeed: 'PageSpeed', crux: 'Experiência real (Chrome)',
  }),
  google: Object.freeze({ ga4: 'Google Analytics', search_console: 'Search Console', perfil: 'Perfil da Empresa' }),
  meta: Object.freeze({ pagina: 'Página do Facebook', instagram: 'Instagram', anuncios: 'Anúncios da Meta', pixel: 'Pixel da Meta' }),
  google_ads: Object.freeze({
    conta: 'Conta', resumo: 'Resumo', campanhas: 'Campanhas', grupos: 'Grupos de anúncios', anuncios: 'Anúncios', palavras: 'Palavras-chave',
    termos: 'Termos de pesquisa', conversoes: 'Conversões', chamadas: 'Ligações', leads: 'Leads de formulário', publico: 'Público',
    locais: 'Cidades', paginas: 'Páginas de destino', horarios: 'Dias e horários', pmax: 'Performance Max', organico: 'Busca orgânica',
    alteracoes: 'Alterações na conta',
  }),
  linkedin: Object.freeze({ pagina: 'Página', seguidores: 'Seguidores', visitas: 'Visitas à página', conteudo: 'Conteúdo', posts: 'Posts' }),
  pinterest: Object.freeze({
    perfil: 'Perfil', conta: 'Números da conta', top: 'Melhores Pins', pins: 'Pins', pastas: 'Pastas', anuncios: 'Anúncios',
    analise_pins: 'Análise por Pin',
  }),
});

/** O nome de uma parte para gente; parte desconhecida (um conector novo)
 *  aparece com o próprio nome, nunca some. */
export function rotuloParte(fonte, parte) {
  return ROTULO_PARTE[fonte]?.[parte] || String(parte ?? '').replace(/_/g, ' ');
}

/* ------------------------------------------------------------ o estado -- */

/** Rótulo, tom e frase de cada estado de fonte (os ESTADOS do info.mjs). O
 *  tom é o da casa: ok (verde), warn (âmbar), bad (vermelho), neutral
 *  (cinza). A tela sempre mostra o rótulo junto da cor.
 *  - falta_configurar e aguardando_aprovacao ficam cinza: nada quebrou, é
 *    um passo de ligação (do dono) ou uma fila (do provedor);
 *  - falta_conectar fica âmbar: é um clique da gestão;
 *  - reconectar e erro ficam vermelhos: funcionava e parou. */
export const ESTADOS_FONTE = Object.freeze({
  ok: Object.freeze({ rotulo: 'Funcionando', tom: 'ok', texto: 'A última coleta trouxe tudo.' }),
  parcial: Object.freeze({ rotulo: 'Parcial', tom: 'warn', texto: 'Parte dos dados veio; o que faltou ficou com a coleta anterior ou sem número.' }),
  falta_configurar: Object.freeze({ rotulo: 'Falta configurar', tom: 'neutral', texto: 'Faltam os secrets desta fonte no Supabase. Veja como ligar.' }),
  falta_conectar: Object.freeze({ rotulo: 'Falta conectar', tom: 'warn', texto: 'A conta ainda não foi conectada (ou perdeu uma permissão). A gestão conecta em Configurações, Marketing.' }),
  // Vale também para as fontes por secret (o token da Meta, a chave do
  // Google Ads), que não têm botão Reconectar: troca-se o secret.
  reconectar: Object.freeze({ rotulo: 'Reconectar', tom: 'bad', texto: 'A conexão parou de valer. A gestão reconecta (ou troca o secret) em Configurações, Marketing.' }),
  // "Não há o que fazer até lá" brigava com o motivo da parte, que diz onde
  // pedir o acesso (revisão de 12/10): o pedido é do dono, uma vez; depois,
  // é esperar o provedor.
  aguardando_aprovacao: Object.freeze({ rotulo: 'Aguardando aprovação', tom: 'neutral', texto: 'O provedor ainda não liberou o acesso à API. Se o pedido de acesso já foi feito (veja Como ligar), é só esperar a aprovação.' }),
  erro: Object.freeze({ rotulo: 'Erro na coleta', tom: 'bad', texto: 'A última coleta falhou. O que já estava na tela continua.' }),
});

/* O RÓTULO CURTO de cada estado, para a faixa "Fontes" da Visão geral
   (revisão de 12/10): com "Aguardando a coleta" (185 px) os seis selos não
   cabiam numa linha a 1280 px. O rótulo inteiro vai na dica e no
   aria-label do selo; o curto nunca fica sozinho como a única informação
   para quem usa leitor de tela. */
export const ROTULO_CURTO = Object.freeze({
  ok: 'Funcionando', parcial: 'Parcial', falta_configurar: 'Configurar', falta_conectar: 'Conectar', reconectar: 'Reconectar',
  aguardando_aprovacao: 'Em aprovação', erro: 'Erro', aguardando_coleta: 'Aguardando', sem_coleta: 'Sem coleta', desconhecido: 'Desconhecido',
});

// Os estados que não vêm do servidor e a tela precisa dizer.
const SEM_COLETA = Object.freeze({ chave: 'sem_coleta', rotulo: 'Sem coleta ainda', tom: 'neutral', texto: 'Esta fonte ainda não foi coletada nenhuma vez.' });
// "Aguardando a coleta" vale para três casos, com a frase de cada um (ver
// situacaoDaFonte): conectado agora (a coleta é de antes da conexão),
// configurado agora (a porta viu o secret cadastrado depois da coleta) e a
// parte que ficou para a próxima coleta.
const AGUARDANDO_COLETA = Object.freeze({
  chave: 'aguardando_coleta', rotulo: 'Aguardando a coleta', tom: 'neutral',
  texto: 'Os números chegam na próxima coleta (todo dia de manhã) ou em Atualizar agora.',
});
const CONECTADO_AGORA = `Conectado. ${AGUARDANDO_COLETA.texto}`;
const CONFIGURADO_AGORA = `Configurado. ${AGUARDANDO_COLETA.texto}`;
const DESCONHECIDO = Object.freeze({ chave: 'desconhecido', rotulo: 'Estado desconhecido', tom: 'neutral', texto: 'O servidor mandou um estado que esta tela não conhece.' });

/** O estado de uma fonte ou parte para gente: {chave, rotulo, tom, texto}.
 *  null (a fonte nunca foi coletada) é "Sem coleta ainda"; um estado que
 *  esta tela não conhece aparece como tal, cinza, nunca como "Funcionando".
 *  Aceita também os dois estados que só a tela calcula: "aguardando_coleta"
 *  (situacaoDaFonte, fontesDoCanal) e "sem_coleta". */
export function infoEstado(estado) {
  if (estado == null || estado === SEM_COLETA.chave) return { ...SEM_COLETA };
  if (estado === AGUARDANDO_COLETA.chave) return { ...AGUARDANDO_COLETA };
  if (typeof estado === 'string' && Object.hasOwn(ESTADOS_FONTE, estado)) return { chave: estado, ...ESTADOS_FONTE[estado] };
  return { ...DESCONHECIDO };
}

/** Quando COMEÇOU a coleta que gravou o retrato que a tela tem (ISO), ou
 *  null quando não há retrato. É contra ela que a conexão se compara: uma
 *  coleta que começou com o token velho e terminou depois do Reconectar
 *  gravou o estado do token velho (revisão de 12/10; antes a régua era o
 *  FIM, coletadoEm). Na ordem:
 *  - iniciadoEm, o carimbo que a coletora grava no retrato;
 *  - retrato sem o carimbo (de antes dele): a execução do diário (ultimas)
 *    que começou antes do fim do retrato e terminou depois dele (ou ainda
 *    não tem fim), a mais nova delas;
 *  - sem nada disso: o próprio fim (a régua de antes). */
export function inicioDaColeta(f) {
  if (!objeto(f)) return null;
  const fim = instante(f.coletadoEm);
  if (!Number.isFinite(fim)) return null;
  const carimbo = instante(f.iniciadoEm);
  if (Number.isFinite(carimbo) && carimbo <= fim) return f.iniciadoEm;
  let melhor = null;
  for (const e of Array.isArray(f.ultimas) ? f.ultimas : []) {
    const ini = instante(e?.inicio), fimDela = instante(e?.fim);
    if (!Number.isFinite(ini) || ini > fim || (Number.isFinite(fimDela) && fimDela < fim)) continue;
    if (!melhor || ini > instante(melhor)) melhor = e.inicio;
  }
  return melhor ?? f.coletadoEm;
}

/** A conexão é mais nova que a última coleta? Então o estado e os avisos que
 *  o servidor mandou são de ANTES dela (ver a regra 2 do topo). A régua é o
 *  COMEÇO da coleta (inicioDaColeta). Sem data de coleta (nunca coletou)
 *  conta como mais nova. */
export function estadoDeAntesDaConexao(f) {
  if (!objeto(f) || f.oauth !== true || !objeto(f.conexao) || f.configurado === false) return false;
  const conectado = instante(f.conexao.conectadoEm);
  if (!Number.isFinite(conectado)) return false;
  const coletado = instante(inicioDaColeta(f));
  return !Number.isFinite(coletado) || coletado < conectado;
}

/** O retrato da fonte é de ANTES de uma mudança que a coleta ainda não viu:
 *  a conexão nova (estadoDeAntesDaConexao) ou o secret cadastrado depois
 *  da coleta (o servidor manda o estado "aguardando_coleta"). Aí o estado de
 *  cada parte também é velho, e a tela não o mostra como atual. */
export const retratoDeAntes = (f) => estadoDeAntesDaConexao(f) || (objeto(f) && f.estado === AGUARDANDO_COLETA.chave);

/** O servidor não conseguiu ler a conexão (o cofre falhou) e disse isso
 *  (conexaoDesconhecida, revisão de 12/10)? Aí a conexão veio null porque
 *  NÃO SE SABE: a tela não deduz "falta conectar", não esconde o Atualizar
 *  agora (a coleta lê o cofre sozinha) e mostra o estado da última coleta. */
export const conexaoDesconhecida = (f) => objeto(f) && f.oauth === true && !objeto(f.conexao) && f.conexaoDesconhecida === true;

/** A fonte por OAuth está sem conexão, sabido (o cofre foi lido)? */
export const semConexao = (f) => objeto(f) && f.oauth === true && !objeto(f.conexao) && f.conexaoDesconhecida !== true;

/** A situação da fonte, para o selo da linha e da faixa:
 *  {chave, rotulo, tom, texto, andando, avisosVelhos}.
 *  - estado de antes da conexão: "Aguardando a coleta" (e avisosVelhos true:
 *    os avisos da fonte falam da situação anterior, a tela não os mostra
 *    como atuais), com a frase de quem acabou de conectar;
 *  - a porta viu o secret cadastrado depois da coleta (estado
 *    "aguardando_coleta" vindo do servidor): o mesmo selo, com a frase de
 *    quem acabou de configurar (os avisos velhos a porta já tirou);
 *  - senão, o estado do servidor (infoEstado).
 *  `andando` vem à parte: a coleta pode estar rodando sobre qualquer estado,
 *  e o selo continua dizendo o último resultado. */
export function situacaoDaFonte(f) {
  if (!objeto(f)) return { ...DESCONHECIDO, andando: false, avisosVelhos: false };
  const andando = f.andando === true;
  if (estadoDeAntesDaConexao(f)) return { ...AGUARDANDO_COLETA, texto: CONECTADO_AGORA, andando, avisosVelhos: true };
  if (f.estado === AGUARDANDO_COLETA.chave) return { ...AGUARDANDO_COLETA, texto: CONFIGURADO_AGORA, andando, avisosVelhos: false };
  return { ...infoEstado(f.estado ?? null), andando, avisosVelhos: false };
}

/* --------------------------------------------------- que fonte alimenta -- */

/** QUE FONTE E QUE PARTE ALIMENTAM CADA CANAL (código do canal em
 *  painel_mkt_canais). `parte` null quer dizer a fonte inteira. A ordem é a
 *  dos quadros na sub-aba "Dados" do canal, menos no site, que abre pelo
 *  tráfego (ORDEM_NA_ABA em marketing-dados-canal.js).
 *  - site: o conector do site (etiquetas, velocidade, WordPress), o GA4 e o
 *    Search Console do google, e o Google Ads (que não tem canal próprio:
 *    o gasto aparece no site e na Visão geral);
 *  - facebook: a Página, os anúncios e o Pixel da Meta;
 *  - instagram: a parte instagram da Meta;
 *  - google (Google Meu Negócio): o Perfil da Empresa;
 *  - linkedin e pinterest: a fonte inteira de cada um.
 *  Canal fora desta lista (WhatsApp, Ligação, E-mail...) não tem integração. */
export const FONTES_DO_CANAL = Object.freeze({
  site: Object.freeze([
    Object.freeze({ fonte: 'site', parte: null }),
    Object.freeze({ fonte: 'google', parte: 'ga4' }),
    Object.freeze({ fonte: 'google', parte: 'search_console' }),
    Object.freeze({ fonte: 'google_ads', parte: null }),
  ]),
  facebook: Object.freeze([
    Object.freeze({ fonte: 'meta', parte: 'pagina' }),
    Object.freeze({ fonte: 'meta', parte: 'anuncios' }),
    Object.freeze({ fonte: 'meta', parte: 'pixel' }),
  ]),
  instagram: Object.freeze([Object.freeze({ fonte: 'meta', parte: 'instagram' })]),
  google: Object.freeze([Object.freeze({ fonte: 'google', parte: 'perfil' })]),
  linkedin: Object.freeze([Object.freeze({ fonte: 'linkedin', parte: null })]),
  pinterest: Object.freeze([Object.freeze({ fonte: 'pinterest', parte: null })]),
});

/** O canal tem integração? */
export const canalTemFonte = (codigo) => Object.hasOwn(FONTES_DO_CANAL, codigo);

/** As fontes que a sub-aba "Dados" de um canal precisa ler com os dados, sem
 *  repetir e na ordem de FONTES: o site lê site, google e google_ads; o
 *  facebook e o instagram, só a meta. Canal sem integração: []. É o que a
 *  sub-aba pede ao servidor (a ação "fontes" com a lista), em vez do retrato
 *  das seis. */
export function fontesQueAlimentam(codigo) {
  const ligacoes = Object.hasOwn(FONTES_DO_CANAL, codigo ?? '') ? FONTES_DO_CANAL[codigo] : [];
  const usadas = new Set(ligacoes.map((l) => l.fonte));
  return FONTES.filter((f) => usadas.has(f));
}

/** Os canais que uma fonte alimenta (para a linha da fonte em Configurações:
 *  "alimenta Site e Google Meu Negócio"), na ordem de FONTES_DO_CANAL. */
export function canaisDaFonte(fonte) {
  return Object.entries(FONTES_DO_CANAL).filter(([, lista]) => lista.some((x) => x.fonte === fonte)).map(([codigo]) => codigo);
}

/** O rótulo de uma ligação canal-fonte: "Google Analytics", "Site" (a fonte
 *  inteira), "Pixel da Meta". */
export const rotuloDaLigacao = ({ fonte, parte }) => (parte ? rotuloParte(fonte, parte) : ROTULO_FONTE[fonte] || String(fonte));

// A fonte inteira está parada por um motivo que vale para todas as partes?
// São os dois estados que o servidor decide AGORA, por cima do que a coleta
// gravou (fonteParaTela): sem os secrets e, nas fontes por OAuth, sem a
// conexão. Aí o estado de cada parte guardado no cache é velho.
function travadaInteira(f) {
  if (f.configurado === false) return 'falta_configurar';
  // Conexão que não se sabe (o cofre não foi lido) não é falta de conexão.
  if (semConexao(f)) return 'falta_conectar';
  return null;
}

/** O que alimenta um canal, já com o estado e os dados de cada ligação:
 *  [{fonte, parte, rotulo, estado, info, dados, coletadoEm, tentadoEm,
 *    motivo, partes, carregada}].
 *  - `fontes`: o mapa {site: {...}, google: {...}} da resposta "fontes";
 *  - fonte que não veio na resposta: carregada false, estado null, dados
 *    null (a tela diz que não leu, e não "sem dados");
 *  - fonte travada inteira (sem secrets, sem conexão): o estado é o dela,
 *    mesmo que o cache ainda tenha a parte "ok" de antes;
 *  - estado de antes da conexão: "aguardando_coleta";
 *  - parte que nunca veio: o estado da fonte;
 *  - coletadoEm: a data do DADO que está na tela (a da parte; na fonte
 *    inteira, a última coleta boa). Parte que falhou mantém a data do dado
 *    anterior, que é exatamente o que continua na tela.
 *  Canal sem integração devolve []. */
export function fontesDoCanal(codigo, fontes) {
  const ligacoes = FONTES_DO_CANAL[codigo];
  if (!ligacoes) return [];
  return ligacoes.map(({ fonte, parte }) => {
    const rotulo = rotuloDaLigacao({ fonte, parte });
    const f = objeto(fontes) && objeto(fontes[fonte]) ? fontes[fonte] : null;
    if (!f) return { fonte, parte, rotulo, estado: null, info: infoEstado(null), dados: null, coletadoEm: null, tentadoEm: null, motivo: null, partes: {}, carregada: false };
    const partes = objeto(f.partes) ? f.partes : {};
    const p = parte && objeto(partes[parte]) ? partes[parte] : null;
    const dadosFonte = objeto(f.dados) ? f.dados : {};
    const dados = parte ? (dadosFonte[parte] ?? null) : dadosFonte;
    // O estado da parte só vale quando nada por cima dele mudou depois da
    // coleta (a trava de agora, ou uma conexão mais nova que ela). Aí o
    // motivo guardado da parte também é velho e não vai para a tela.
    const porCima = travadaInteira(f) ?? (retratoDeAntes(f) ? 'aguardando_coleta' : null);
    const estado = porCima ?? (p ? p.estado : (f.estado ?? null));
    const info = infoEstado(estado);
    return {
      fonte, parte, rotulo, estado, info, dados,
      coletadoEm: parte ? (p?.coletadoEm ?? null) : (f.ultimaBoaEm ?? null),
      tentadoEm: parte ? (p?.tentadoEm ?? null) : null,
      motivo: porCima ? null : (p?.motivo ?? null),
      partes,
      carregada: true,
    };
  });
}

/** O estado de um canal juntando as fontes dele (a faixa da Visão geral e
 *  o selo da sub-aba "Dados"): tudo ok é ok; alguma ligação com dado (ok ou
 *  parcial) e outra sem é parcial; nenhuma com dado, o estado que mais pede
 *  ação, na ordem reconectar, erro, falta_conectar, falta_configurar,
 *  aguardando_aprovacao, aguardando_coleta, sem coleta. Canal sem
 *  integração: null. */
export function estadoDoCanal(codigo, fontes) {
  const ligacoes = fontesDoCanal(codigo, fontes);
  if (!ligacoes.length) return null;
  const estados = ligacoes.map((l) => l.estado);
  let estado;
  if (estados.every((e) => e === 'ok')) estado = 'ok';
  else if (estados.some((e) => e === 'ok' || e === 'parcial')) estado = 'parcial';
  else estado = ['reconectar', 'erro', 'falta_conectar', 'falta_configurar', 'aguardando_aprovacao', 'aguardando_coleta'].find((e) => estados.includes(e)) ?? null;
  return infoEstado(estado);
}

/* ------------------------------------------------------------- os botões -- */

const PAPEIS = ['gestao', 'marketing', 'visualizacao'];

/** O LinkedIn ainda tem números no retrato do servidor? É o caso do
 *  Desconectar em que o cache não deixou apagar o retrato (a regra de guarda
 *  do LinkedIn): a conexão saiu, os números ficaram, e o aviso manda
 *  desconectar de novo. A régua é ultimaBoaEm (alguma coleta trouxe dado), e
 *  não coletadoEm: a coleta de cada manhã sem conexão também grava retrato,
 *  sem número nenhum. */
export const linkedinComNumeros = (f) => objeto(f) && f.fonte === 'linkedin' && !!f.ultimaBoaEm;

/** Os botões de uma fonte para um papel (o `papel` que o servidor mandou):
 *  - atualizar ("Atualizar agora"): gestão e marketing, com a fonte
 *    configurada e, nas fontes por OAuth, conectada (senão a coleta só
 *    repetiria "falta configurar" ou "falta conectar"). Com a conexão
 *    desconhecida (o cofre não foi lido), aparece: a coleta lê o cofre
 *    sozinha e diz a verdade;
 *  - conectar: gestão, fonte por OAuth, configurada e sem conexão (sabido);
 *  - reconectar: gestão, fonte por OAuth, configurada e com conexão (ou com
 *    a conexão desconhecida: reconectar vale nos dois casos);
 *  - desconectar: gestão, fonte por OAuth e com conexão (sem os secrets do
 *    app também: apagar do cofre não depende deles); no LinkedIn, também
 *    enquanto o retrato tiver números (linkedinComNumeros), porque o
 *    Desconectar é que leva o retrato junto.
 *  Papel desconhecido vale o menor: só ver. */
export function acoesDaFonte(f, papel) {
  const p = PAPEIS.includes(papel) ? papel : 'visualizacao';
  const nada = { atualizar: false, conectar: false, reconectar: false, desconectar: false };
  if (!objeto(f) || !FONTES.includes(f.fonte)) return nada;
  const grava = p === 'gestao' || p === 'marketing';
  const gestao = p === 'gestao';
  const oauth = f.oauth === true;
  const configurada = f.configurado === true;
  const conectada = objeto(f.conexao);
  const incerta = conexaoDesconhecida(f);
  return {
    atualizar: grava && configurada && (!oauth || conectada || incerta),
    conectar: gestao && oauth && configurada && !conectada && !incerta,
    reconectar: gestao && oauth && configurada && (conectada || incerta),
    desconectar: gestao && oauth && (conectada || linkedinComNumeros(f)),
  };
}

/** Os NOMES dos secrets que ligam cada fonte (nunca o valor: a tela não tem
 *  e não pede). obrigatorios: sem eles a fonte fica "falta_configurar"
 *  (o SECRETS do conector, mais o ID e a chave do app OAuth); opcionais: o
 *  que liga uma parte só, ou escolhe a conta (o SECRETS_OPCIONAIS do
 *  conector). As duas listas vêm do info.mjs, o mesmo arquivo da porta (o
 *  teste dos conectores confere que batem com eles): nenhuma cópia aqui. Se
 *  estão cadastrados, só o servidor sabe (o `opcionais` de cada fonte, na
 *  resposta "fontes"). */
export function secretsDaFonte(fonte) {
  const app = PROVEDORES[fonte] ? [PROVEDORES[fonte].secrets.id, PROVEDORES[fonte].secrets.segredo] : [];
  return {
    obrigatorios: [...new Set([...(SECRETS_PADRAO[fonte] || []), ...app])],
    opcionais: [...(SECRETS_OPCIONAIS_PADRAO[fonte] || [])],
  };
}

/* ---------------------------------------------------------- a resposta -- */

/** A resposta da ação "fontes" no formato que a tela usa:
 *  {papel, lista (na ordem do servidor), porFonte, avisos, motivos}.
 *  Resposta sem o mapa de fontes devolve null (a tela diz que não leu, e
 *  não "nenhuma fonte"). Papel desconhecido vale o menor: só ver. Fonte que
 *  o servidor listou e não mandou fica de fora; fonte que veio sem estar na
 *  ordem entra no fim (um conector novo não some calado). */
export function normalizarFontes(r) {
  if (!objeto(r) || !objeto(r.fontes)) return null;
  const vistas = new Set();
  const ordem = [...(Array.isArray(r.ordem) ? r.ordem : []), ...Object.keys(r.fontes)].filter((f) => {
    if (typeof f !== 'string' || vistas.has(f) || !objeto(r.fontes[f])) return false;
    vistas.add(f);
    return true;
  });
  return {
    papel: PAPEIS.includes(r.papel) ? r.papel : 'visualizacao',
    lista: ordem.map((f) => r.fontes[f]),
    porFonte: Object.fromEntries(ordem.map((f) => [f, r.fontes[f]])),
    avisos: Array.isArray(r.avisos) ? r.avisos.filter((a) => typeof a === 'string' && a) : [],
    motivos: objeto(r.motivos) ? r.motivos : {},
  };
}

/** Troca uma fonte no retrato normalizado (o "Atualizar agora" devolve só a
 *  fonte coletada): devolve um retrato NOVO, sem mexer no de entrada. Fonte
 *  inválida devolve o mesmo retrato. */
export function trocarFonte(normalizado, fonte) {
  if (!normalizado || !objeto(fonte) || typeof fonte.fonte !== 'string') return normalizado;
  const porFonte = { ...normalizado.porFonte, [fonte.fonte]: fonte };
  const lista = normalizado.lista.some((f) => f.fonte === fonte.fonte)
    ? normalizado.lista.map((f) => (f.fonte === fonte.fonte ? fonte : f))
    : [...normalizado.lista, fonte];
  return { ...normalizado, lista, porFonte };
}

/* A volta do Conectar (?conexao=&r=ok|erro&confirmar=|motivo=) é lida por
   lerVoltaDoOAuth, em marketing-conexoes.js, com a confirmação do protocolo
   de 11/10/2026. A leitura antiga daqui (voltaDaConexao) dava "conectado"
   sem confirmação nenhuma e saiu em 11/10/2026: nenhuma tela a usava. */

/** O endereço que o Conectar abre, conferido: só a tela de permissão do
 *  provedor daquela fonte (o urlAutorizacao de mkt-oauth.mjs) ou um caminho
 *  do próprio Painel (a prévia volta direto para Configurações). Qualquer
 *  outra coisa devolve null e a tela não navega. */
export function urlDeConexaoSegura(fonte, url) {
  if (typeof url !== 'string' || !url || url.length > 4096) return null;
  if (/^\/(?!\/)/.test(url) && !/[\s\\]/.test(url)) return url;
  const p = Object.hasOwn(PROVEDORES, fonte ?? '') ? PROVEDORES[fonte] : null;
  if (!p) return null;
  let u, base;
  try { u = new URL(url); base = new URL(p.urlAutorizacao); } catch { return null; }
  if (u.protocol !== 'https:' || u.origin !== base.origin || u.pathname !== base.pathname || u.username || u.password) return null;
  return u.toString();
}

/* -------------------------------------------------------- os números -- */

/** O texto de número que a API não mediu. */
export const NAO_MEDIDO = 'não medido';

const medida = (v) => numeroOuNulo(v);
// O que arredonda para zero sai "0", e não "-0" (-0,3 com zero casas).
const semMenosZero = (n, casas) => (Math.abs(n) < 0.5 * 10 ** -casas ? 0 : n);

/** Número inteiro ou com casas, em pt-BR: 1.234; null, vazio e lixo viram
 *  `vazio` ("não medido"), nunca "0". */
export function fmtNumero(v, { casas = 0, vazio = NAO_MEDIDO } = {}) {
  const n = medida(v);
  if (n === null) return vazio;
  return semMenosZero(n, casas).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas });
}

/** Número curto ("1,2 mil") para chip e quadro pequeno; o exato vai no
 *  title, por fmtNumero. */
export function fmtCompacto(v, { vazio = NAO_MEDIDO } = {}) {
  const t = numeroCompacto(v);
  return t === '' ? vazio : t;
}

/** Fração em porcentagem: 0,125 vira "12,5%". As taxas dos conectores vêm
 *  em fração (ctr do Google Ads, taxa de engajamento do GA4 e do
 *  Pinterest). O ctr da Meta já vem em % (ver FORMATO do meta): use
 *  fmtPorcento. `sinal` põe o "+" na variação. */
export function fmtPercentual(fracao, { casas = 1, vazio = NAO_MEDIDO, sinal = false } = {}) {
  const n = medida(fracao);
  if (n === null) return vazio;
  return fmtPorcento(n * 100, { casas, vazio, sinal });
}

/** Número que já está em porcentagem (0 a 100): 4,5 vira "4,5%". */
export function fmtPorcento(v, { casas = 1, vazio = NAO_MEDIDO, sinal = false } = {}) {
  const m = medida(v);
  if (m === null) return vazio;
  const n = semMenosZero(m, casas);
  const t = n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas });
  return `${sinal && n > 0 ? '+' : ''}${t}%`;
}

/** Dinheiro na moeda da conta (o Google Ads, a Meta e o Pinterest mandam a
 *  moeda junto: dados.conta.moeda, contas[].moeda). Moeda que o navegador
 *  não conhece aparece como código ("12,50 XYZ"), sem quebrar. */
export function fmtMoeda(v, { moeda = 'BRL', casas = 2, vazio = NAO_MEDIDO } = {}) {
  const m = medida(v);
  if (m === null) return vazio;
  const n = semMenosZero(m, casas);
  const codigo = typeof moeda === 'string' && /^[A-Z]{3}$/.test(moeda) ? moeda : 'BRL';
  try {
    return n.toLocaleString('pt-BR', { style: 'currency', currency: codigo, minimumFractionDigits: casas, maximumFractionDigits: casas });
  } catch {
    return `${n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })} ${codigo}`;
  }
}

/** Número com casas fixas (CLS "0,05", posição média "14,2"). */
export function fmtDecimal(v, { casas = 2, vazio = NAO_MEDIDO } = {}) {
  const n = medida(v);
  if (n === null) return vazio;
  return semMenosZero(n, casas).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/** Duração em segundos: "45 s", "2 min 5 s", "1 h 3 min". */
export function fmtDuracao(segundos, { vazio = NAO_MEDIDO } = {}) {
  const n = medida(segundos);
  if (n === null || n < 0) return vazio;
  const s = Math.round(n);
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}`;
  // Acima de uma hora, os minutos arredondados (1 h 59 min 30 s vira 2 h, e
  // não "1 h 60 min").
  const minutos = Math.round(s / 60);
  return `${Math.floor(minutos / 60)} h${minutos % 60 ? ` ${minutos % 60} min` : ''}`;
}

/** Tempo em milissegundos (LCP, INP, TTFB): "850 ms", "2,4 s". */
export function fmtMs(ms, { vazio = NAO_MEDIDO } = {}) {
  const n = medida(ms);
  if (n === null || n < 0) return vazio;
  // 999,6 ms arredonda para 1000: vira "1 s", e não "1000 ms".
  if (Math.round(n) < 1000) return `${Math.round(n)} ms`;
  return `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s`;
}

/** A parcela de impressões do Google Ads ({valor, menosDe10}) e a parcela
 *  perdida ({valor, maisDe90}). O Google manda 0,0999 para dizer "abaixo de
 *  10%" sem dizer quanto, e 0,9001 para "acima de 90%": a tela escreve
 *  isso, e não "9,99%". Aceita também a fração pura. */
export function fmtParcela(p, { vazio = NAO_MEDIDO } = {}) {
  if (objeto(p)) {
    if (p.menosDe10 === true) return 'menos de 10%';
    if (p.maisDe90 === true) return 'mais de 90%';
    return fmtPercentual(p.valor, { casas: 0, vazio });
  }
  return fmtPercentual(p, { casas: 0, vazio });
}

/** Faixa de volume ({min, max}, as categorias de busca do Google Ads):
 *  "entre 1.000 e 10.000". Nunca vira um número só. */
export function fmtFaixa(f, { vazio = NAO_MEDIDO } = {}) {
  if (!objeto(f)) return vazio;
  const min = medida(f.min), max = medida(f.max);
  if (min === null && max === null) return vazio;
  if (min === null) return `até ${fmtNumero(max)}`;
  if (max === null) return `${fmtNumero(min)} ou mais`;
  return `entre ${fmtNumero(min)} e ${fmtNumero(max)}`;
}

/** Contagem que o provedor só dá como teto (os termos de pesquisa do Perfil
 *  da Empresa: {usuarios} exato ou {abaixo_de} "menos que N"). */
export function fmtAbaixoDe({ usuarios, abaixo_de: abaixoDe } = {}, { vazio = NAO_MEDIDO } = {}) {
  if (medida(usuarios) !== null) return fmtNumero(usuarios);
  if (medida(abaixoDe) !== null) return `menos de ${fmtNumero(abaixoDe)}`;
  return vazio;
}

/* ------------------------------------------------- a fonte e a data -- */

const hora = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Instante (ISO) para gente, no fuso de quem olha: "11/10 às 06:11", com o
 *  ano quando não é o de `hoje` (AAAA-MM-DD do mesmo render). Data fora de
 *  2000 a 2100 (um carimbo estragado) também é "sem data". */
export function fmtDataHora(iso, hoje, { vazio = 'sem data' } = {}) {
  const t = instante(iso);
  if (!Number.isFinite(t)) return vazio;
  const d = new Date(t);
  // O paraDia de um Date não confere a faixa de anos (só o de texto confere).
  const dia = paraDia(d);
  if (!dia || !diaValido(dia)) return vazio;
  const h = paraDia(hoje);
  const data = h && dia.slice(0, 4) === h.slice(0, 4) ? dataCurta(dia) : dataLonga(dia);
  return `${data} às ${hora(d)}`;
}

/** A legenda de todo número que veio de uma fonte: de onde veio e de quando
 *  ("Google Analytics, coletado em 11/10 às 06:11"). Dado que nunca chegou:
 *  "ainda sem coleta"; parte que falhou depois: a data do dado que continua
 *  na tela, mais a tentativa ("última tentativa em ..."). */
export function legendaDaColeta({ rotulo, coletadoEm = null, tentadoEm = null } = {}, hoje) {
  const nome = rotulo || 'Fonte';
  const coletado = fmtDataHora(coletadoEm, hoje, { vazio: null });
  const tentado = fmtDataHora(tentadoEm, hoje, { vazio: null });
  return `${nome}, ${coletado ? `coletado em ${coletado}` : 'ainda sem coleta'}${tentado ? `; última tentativa em ${tentado}` : ''}`;
}

/** A legenda do quadro "Avisos da última coleta" da sub-aba Dados (revisão
 *  de 12/10). Antes ela levava as fontes todas do canal e a coleta MAIS NOVA
 *  delas, e a tentativa sem dado do Google Ads (09:23) carimbava como
 *  "coletado em 09:23" os avisos do Google (09:11). Agora:
 *  - entram só as fontes que têm aviso (fora as de retrato de antes de uma
 *    conexão ou de um cadastro, cujos avisos não aparecem); sem nenhuma, as
 *    fontes do quadro;
 *  - "coletado em" é a coleta que trouxe dado; a que não trouxe só aparece
 *    como "última tentativa", e só quando é mais nova que a coleta boa. */
export function legendaDosAvisos(fontes, porFonte, hoje) {
  const lista = [...new Set(Array.isArray(fontes) ? fontes : [])].map((k) => (objeto(porFonte) && objeto(porFonte[k]) ? porFonte[k] : null)).filter(Boolean);
  const comAviso = lista.filter((f) => !retratoDeAntes(f) && Array.isArray(f.avisos) && f.avisos.some((a) => typeof a === 'string' && a.trim()));
  const usadas = comAviso.length ? comAviso : lista;
  const maisNova = (xs) => xs.filter((x) => Number.isFinite(instante(x))).sort((a, b) => instante(b) - instante(a))[0] ?? null;
  const trouxe = (f) => Number.isFinite(instante(f.ultimaBoaEm)) && instante(f.ultimaBoaEm) >= instante(f.coletadoEm);
  const coletadoEm = maisNova(usadas.filter(trouxe).map((f) => f.coletadoEm));
  const tentou = maisNova(usadas.filter((f) => !trouxe(f)).map((f) => f.coletadoEm));
  const tentadoEm = tentou && (!coletadoEm || instante(tentou) > instante(coletadoEm)) ? tentou : null;
  return legendaDaColeta({ rotulo: usadas.map((f) => ROTULO_FONTE[f.fonte] ?? String(f.fonte)).join(', ') || 'Fontes', coletadoEm, tentadoEm }, hoje);
}

/* ------------------------------------------------------ os motivos -- */

/* Os motivos de parte que vêm em CÓDIGO (site, meta e google_ads; os do
   google, linkedin e pinterest já vêm em frase). A frase é curta: o aviso
   da fonte, quando há, explica o resto. */
const MOTIVOS_DE_PARTE = Object.freeze({
  // site.mjs (FORMATO, motivos)
  sem_endereco: 'O canal Site não tem endereço cadastrado.',
  sem_chave: 'Falta a chave do Google (GOOGLE_API_KEY) nos Secrets.',
  chave_recusada: 'O Google recusou a chave cadastrada.',
  api_bloqueada: 'A API está bloqueada para esta chave no Google Cloud.',
  prazo: 'O tempo da coleta acabou antes desta parte.',
  cota: 'A cota do provedor acabou por agora.',
  servidor: 'O servidor do provedor falhou.',
  sem_resposta: 'O provedor não respondeu.',
  recusado: 'O pedido foi recusado.',
  sem_dados: 'Ainda não há visitas suficientes para medir.',
  medicao_falhou: 'A medição falhou nesta coleta.',
  grande_demais: 'A resposta passou do tamanho que a coleta lê.',
  rede: 'Falha de rede.',
  certificado: 'O certificado do site não confere.',
  tempo_esgotado: 'O site não respondeu a tempo.',
  dns: 'O nome do site não foi encontrado.',
  laco: 'O endereço redireciona em círculo.',
  saltos_demais: 'Redirecionamentos demais.',
  redireciona_para_fora: 'O endereço redireciona para outro domínio.',
  rest_fechada: 'A REST do WordPress está fechada.',
  sem_wordpress: 'O site não respondeu como WordPress.',
  algumas_paginas: 'Algumas páginas não abriram.',
  nada_a_conferir: 'Não havia o que conferir.',
  ip_interno: 'O endereço aponta para um IP interno: nada foi pedido ao site.',
  sem_ip: 'O DNS público não mostrou um IP para o endereço.',
  falha_interna: 'Falha interna da coleta.',
  // meta.mjs
  sem_token: 'Falta o META_TOKEN nos Secrets.',
  token_invalido: 'A Meta recusou o token.',
  sem_dado: 'A Meta não trouxe dado nesta coleta.',
  pagina_nao_atribuida: 'A Página não está atribuída ao usuário do sistema.',
  pixel_nao_atribuido: 'O Pixel não está atribuído ao usuário do sistema.',
  sem_conta_de_anuncios: 'O usuário do sistema não enxerga nenhuma conta de anúncios.',
  instagram_nao_ligado: 'O Instagram não está ligado à Página.',
  sem_permissao: 'Sem permissão para ler parte dos dados.',
  limite_de_chamadas: 'A Meta pediu calma (limite de chamadas).',
  falha_provedor: 'A Meta não entregou os dados.',
  sem_tarefa_insights: 'Falta a tarefa de Insights na Página.',
  sem_tarefa_conteudo: 'Falta a tarefa de Conteúdo na Página.',
  estatisticas_recusadas: 'A Meta recusou as estatísticas do Pixel.',
  // google_ads.mjs (status de consulta e os códigos do AVISO)
  parada: 'A coleta parou antes desta parte.',
  falhou: 'Esta parte falhou nesta coleta.',
  sem_tempo: 'O tempo da coleta acabou antes desta parte.',
  limite_segundo: 'O Google Ads pediu para ir mais devagar.',
  recusada: 'A API recusou esta consulta.',
  sem_secret: 'Falta o GOOGLE_ADS_SA_JSON nos Secrets.',
  json_invalido: 'O GOOGLE_ADS_SA_JSON não é o arquivo da conta de serviço.',
  chave_formato: 'A chave da conta de serviço não pôde ser lida.',
  token_recusado: 'O Google recusou o acesso da conta de serviço.',
  token_pedido_invalido: 'O Google não aceitou o pedido de acesso.',
  token_sem_valor: 'O Google respondeu sem o token.',
  api_desativada: 'A Google Ads API está desligada no Google Cloud.',
  projeto_sem_aprovacao: 'O projeto ainda não tem o nível Explorer da Google Ads API.',
  sem_contas: 'A conta de serviço não tem acesso a nenhuma conta do Google Ads.',
  sem_acesso_na_conta: 'A conta de serviço não tem acesso à conta do Google Ads.',
  id_cliente_invalido: 'O GOOGLE_ADS_CUSTOMER_ID não confere.',
  conta_desativada: 'A conta do Google Ads está desativada.',
  sem_conta_comum: 'A conta de serviço só alcança contas de administrador.',
  permissao: 'O Google recusou o acesso à conta do Google Ads.',
  outro: 'O provedor devolveu um erro desconhecido.',
});

/** O motivo de uma parte para gente. Frase (o google, o linkedin e o
 *  pinterest já mandam frase; frase é o que tem espaço) passa como veio;
 *  código conhecido vira a frase; http_<n> vira "respondeu com erro <n>";
 *  código desconhecido e vazio devolvem null (a tela mostra só o estado e os
 *  avisos da fonte, em vez de um "projeto_sem_aprovacao" cru). */
export function motivoLegivel(motivo) {
  if (typeof motivo !== 'string' || !motivo.trim()) return null;
  const m = motivo.trim();
  if (/\s/.test(m)) return m;
  if (Object.hasOwn(MOTIVOS_DE_PARTE, m)) return MOTIVOS_DE_PARTE[m];
  const http = /^http_(\d{3})$/.exec(m);
  if (http) return `O provedor respondeu com erro ${http[1]}.`;
  return null;
}

export { ESTADOS };
