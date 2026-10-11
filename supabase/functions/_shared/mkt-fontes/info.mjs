/* AS FONTES DO MARKETING VISTAS DE FORA DOS CONECTORES.
 *
 * Contrato: docs/marketing/integracoes-contrato.md, seções 4 e 6. Este
 * arquivo é o que a painel-marketing (a porta da tela) precisa saber das
 * fontes SEM importar os conectores: a lista, as chaves do cache e o formato
 * que vai para a tela.
 *
 * POR QUE A TELA NÃO IMPORTA O registro.mjs: ele puxa os seis conectores, e
 * um conector com defeito no carregamento derrubaria a porta inteira do
 * Marketing (ações, canais, playbook), não só a coleta. Quem roda conector é
 * a painel-mkt-fontes.
 *
 * E os nomes dos secrets que dizem se a fonte está "configurada"? Quem manda
 * é o SECRETS de cada conector. A coletora grava esses NOMES (nunca o valor)
 * no cache da fonte a cada execução, e a porta da tela lê de lá. A lista
 * abaixo só vale até a primeira coleta: uma lista copiada envelhece calada,
 * e assim a cópia só é usada enquanto o conector ainda não falou. Os
 * OPCIONAIS (SECRETS_OPCIONAIS do conector: ligam uma parte, ou escolhem a
 * conta, e a fonte funciona sem eles) seguem a mesma regra.
 */

export const FONTES = Object.freeze(['site', 'google', 'meta', 'google_ads', 'linkedin', 'pinterest']);

export const NOMES_FONTE = Object.freeze({
  site: 'Site',
  google: 'Google (Analytics, Search Console e Perfil da Empresa)',
  meta: 'Meta (Facebook e Instagram)',
  google_ads: 'Google Ads',
  linkedin: 'LinkedIn',
  pinterest: 'Pinterest',
});

// Ponto de partida, igual ao SECRETS de cada conector (o teste confere).
// O site não precisa de secret para ler o HTML: a GOOGLE_API_KEY do
// PageSpeed e do CrUX é opcional, e a falta dela aparece na parte dela.
export const SECRETS_PADRAO = Object.freeze({
  site: Object.freeze([]),
  google: Object.freeze(['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET']),
  meta: Object.freeze(['META_TOKEN']),
  google_ads: Object.freeze(['GOOGLE_ADS_SA_JSON']),
  linkedin: Object.freeze(['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET']),
  pinterest: Object.freeze(['PINTEREST_CLIENT_ID', 'PINTEREST_CLIENT_SECRET']),
});

// Ponto de partida dos opcionais, igual ao SECRETS_OPCIONAIS de cada conector
// (o teste confere). Sem eles a fonte fica "configurada" do mesmo jeito:
//  - site: a GOOGLE_API_KEY liga o PageSpeed e a CrUX;
//  - meta: o META_APP_SECRET só é preciso quando o app da Meta exige o
//    segredo do app em cada chamada;
//  - google_ads: os dois IDs escolhem a conta quando a conta de serviço
//    alcança mais de uma (ou só a de uma agência).
export const SECRETS_OPCIONAIS_PADRAO = Object.freeze({
  site: Object.freeze(['GOOGLE_API_KEY']),
  google: Object.freeze([]),
  meta: Object.freeze(['META_APP_SECRET']),
  google_ads: Object.freeze(['GOOGLE_ADS_CUSTOMER_ID', 'GOOGLE_ADS_LOGIN_CUSTOMER_ID']),
  linkedin: Object.freeze([]),
  pinterest: Object.freeze([]),
});

export const ESTADOS =Object.freeze(['ok', 'parcial', 'falta_configurar', 'falta_conectar', 'reconectar', 'aguardando_aprovacao', 'erro']);
// O estado que só a PORTA escreve (nunca o conector, nunca o cache): a
// última coleta parou porque faltava um secret, e o secret já existe. O
// retrato é de antes do cadastro; os números chegam na próxima coleta (ver
// fonteParaTela). A tela já conhece este estado (infoEstado).
export const AGUARDANDO_COLETA = 'aguardando_coleta';

// Os códigos de parte que querem dizer "este secret faltava" (o FORMATO de
// cada conector): parte com um deles foi coletada SEM o secret, por
// definição, e fica velha quando ele é cadastrado.
const CODIGO_DO_SECRET = Object.freeze({ sem_chave: 'GOOGLE_API_KEY', sem_token: 'META_TOKEN', sem_secret: 'GOOGLE_ADS_SA_JSON' });

export const CHAVE_DIARIO = 'mkt_coleta_diario';
// Os pedidos do botão "Atualizar agora", para a trava de 2 minutos. Quem
// lê e grava esta linha é o banco (painel_mkt_coleta_pedir), num passo só.
export const CHAVE_PEDIDOS = 'mkt_coleta_pedidos';
export const chaveDaFonte = (fonte) => `mkt_fonte_${fonte}`;

// Um pedido por fonte a cada 2 minutos: o botão apertado três vezes não
// vira três coletas gastando a cota do provedor (o LinkedIn dá 100 chamadas
// por dia).
export const TRAVA_COLETA_MS = 2 * 60 * 1000;
// Uma execução "andando" há mais que isto morreu sem terminar: a Edge
// Function não passa de 150 s.
export const JANELA_ANDANDO_MS = 150 * 1000;

export const fonteValida = (f) => (typeof f === 'string' && FONTES.includes(f) ? f : null);

// Nome de secret que a porta aceita perguntar se existe. Os da casa
// (SUPABASE_*, PAINEL_*) ficam de fora: "existe ou não" já é informação.
const NOME_SECRET = /^[A-Z][A-Z0-9_]{2,60}$/;
const SECRET_DA_CASA = /^(SUPABASE|PAINEL|SB)_|SERVICE_ROLE|JWT/;
export const nomeDeSecretValido = (n) => typeof n === 'string' && NOME_SECRET.test(n) && !SECRET_DA_CASA.test(n);

/** Os nomes de secret que dizem se a fonte está configurada: os que o
 *  conector declarou (gravados pela coletora no cache), ou a lista padrão
 *  antes da primeira coleta. */
export function secretsDaFonte(fonte, valorCache) {
  const doConector = valorCache && Array.isArray(valorCache.secrets) ? valorCache.secrets : null;
  if (doConector && doConector.every(nomeDeSecretValido)) return [...doConector];
  return [...(SECRETS_PADRAO[fonte] || [])];
}

/** Os nomes dos secrets OPCIONAIS da fonte: os que o conector declarou
 *  (gravados pela coletora no cache, em secretsOpcionais), ou a lista padrão
 *  antes da primeira coleta. Nome fora da régua (ou da casa) não passa: a
 *  lista do cache inteira é trocada pela padrão, como nos obrigatórios. */
export function opcionaisDaFonte(fonte, valorCache) {
  const doConector = valorCache && Array.isArray(valorCache.secretsOpcionais) ? valorCache.secretsOpcionais : null;
  if (doConector && doConector.every(nomeDeSecretValido)) return [...new Set(doConector)];
  return [...(SECRETS_OPCIONAIS_PADRAO[fonte] || [])];
}

const objeto = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const textoOuNulo = (v, max = 300) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const dataOuNula = (v) => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null);

/** Os secrets que FALTAVAM quando a última coleta rodou, como a coletora
 *  anotou no retrato (só os NOMES): {obrigatorios, opcionais}, cada um uma
 *  lista, ou null quando o retrato não anotou (gravado antes de 12/10/2026).
 *  Lista com nome fora da régua vale como "não anotou". */
export function secretsQueFaltavam(valorCache) {
  const ler = (v) => (Array.isArray(v) && v.every(nomeDeSecretValido) ? [...new Set(v)] : null);
  return { obrigatorios: ler(valorCache?.faltavam), opcionais: ler(valorCache?.opcionaisFaltavam) };
}

/** As últimas execuções de uma fonte, da mais nova para a mais velha. */
export function execucoesDaFonte(diario, fonte) {
  const lista = objeto(diario) && Array.isArray(diario.execucoes) ? diario.execucoes : [];
  return lista.filter((e) => objeto(e) && e.fonte === fonte);
}

/** Tem coleta desta fonte andando agora? */
export function andandoAgora(diario, fonte, agora = Date.now()) {
  const ultima = execucoesDaFonte(diario, fonte)[0];
  const inicio = Date.parse(ultima?.inicio || '');
  return ultima?.estado === 'andando' && Number.isFinite(inicio) && agora - inicio < JANELA_ANDANDO_MS;
}

/** Cópia do retrato sem nenhuma chave "restrito", em qualquer nível. É onde
 *  os conectores põem dado pessoal (no google_ads: leads de formulário, DDD de
 *  quem ligou, e-mail de quem mexeu na conta). Só a gestão vê (LGPD): para os
 *  outros papéis a chave nem sai do servidor. Tirar aqui, e não na tela, é o
 *  que garante isso: o que a porta manda, o navegador mostra a quem abrir as
 *  ferramentas do desenvolvedor. */
export function tirarRestrito(valor, fundo = 0) {
  if (fundo > 40 || valor == null || typeof valor !== 'object') return valor;
  if (Array.isArray(valor)) return valor.map((x) => tirarRestrito(x, fundo + 1));
  const fora = {};
  for (const [k, v] of Object.entries(valor)) if (k !== 'restrito') fora[k] = tirarRestrito(v, fundo + 1);
  return fora;
}

/** O formato que a tela recebe de cada fonte (ação "fontes" da
 *  painel-marketing). Campo a campo, nunca um espalhamento do que veio do
 *  cofre ou do cache: o que não está escrito aqui não sai.
 *
 *  - estado: o do cache, menos em três casos em que a verdade de AGORA
 *    manda: sem os secrets é "falta_configurar"; fonte por OAuth sem
 *    conexão no cofre é "falta_conectar"; a coleta que parou por falta de um
 *    secret que agora existe é "aguardando_coleta" (ver abaixo). Nunca
 *    coletada: null.
 *  - dados: o retrato da fonte, no formato da seção FORMATO de cada
 *    conector (_shared/mkt-fontes/<fonte>.mjs).
 *  - conexao: só para Google, LinkedIn e Pinterest, e só os campos sem
 *    token (a painel_mkt_conexao_info já não devolve token; aqui é a rede).
 *  - verRestrito: só a gestão recebe as chaves "restrito" de dados (ver
 *    tirarRestrito). O padrão é NÃO ver: esquecer de passar fecha a porta, em
 *    vez de abrir.
 *  - leve: a fonte sai SEM a chave "dados" (nem vazia: a tela separa "não
 *    pedi os dados" de "a fonte não tem dados"). É o que a faixa da Visão
 *    geral e o bloco Conexões leem: o estado, as partes, os avisos, a
 *    conexão, os opcionais e as últimas execuções, sem as centenas de KB do
 *    retrato. Sem "dados" também não sai "restrito", para papel nenhum.
 *  - opcionais: [{nome, cadastrado}] dos secrets opcionais (só o NOME e se
 *    existe no servidor; o valor nunca sai daqui).
 *  - conexaoDesconhecida (12/10/2026): true quando a fonte é por OAuth e a
 *    leitura das conexões (painel_mkt_conexao_info) falhou. Aí a conexão
 *    vai null porque NÃO SE SABE, e não porque falta: a tela não pode
 *    deduzir "falta conectar" (nem esconder o Atualizar agora).
 *  - iniciadoEm (12/10/2026): quando COMEÇOU a coleta que gravou o retrato
 *    (a coletora carimba; coletadoEm é o fim). Uma conexão feita durante a
 *    coleta é mais nova que ela, mesmo que a coleta termine depois.
 *  - SECRET CADASTRADO DEPOIS DA COLETA (12/10/2026): a coletora anota no
 *    retrato os secrets que faltavam (secretsQueFaltavam). Se a coleta parou
 *    por falta de um secret (falta_configurar) e agora ele existe, o estado
 *    vira "aguardando_coleta" (AGUARDANDO_COLETA) e os avisos daquela coleta
 *    saem: todos falavam da falta. Também sai o aviso que cita um secret que
 *    faltava e agora existe, e a parte coletada sem ele (o código de falta,
 *    ou a frase com o nome) vira "aguardando_coleta". Um falta_configurar com
 *    os secrets todos presentes na coleta (o JSON da conta de serviço
 *    torto, a API desligada) é verdade de agora e fica como veio.
 */
export function fonteParaTela(fonte, { linha = null, conexaoInfo = null, infoOk = true, diario = null, env = () => null, oauth = false, secretsExtras = [], verRestrito = false, leve = false, agora = Date.now() } = {}) {
  const valor = objeto(linha?.valor) ? linha.valor : null;
  // secretsExtras: o ID e a chave do app OAuth, que a renovação usa mesmo
  // que o conector não os declare.
  const obrigatorios = new Set([...secretsDaFonte(fonte, valor), ...secretsExtras]);
  const configurado = [...obrigatorios].every((n) => !!env(n));
  // O opcional que também é obrigatório da fonte não aparece duas vezes.
  const opcionais = opcionaisDaFonte(fonte, valor).filter((n) => !obrigatorios.has(n)).map((nome) => ({ nome, cadastrado: !!env(nome) }));
  // Os secrets que faltavam na coleta e agora existem (só os nomes).
  const faltavam = secretsQueFaltavam(valor);
  const chegaram = [...(faltavam.obrigatorios ?? []), ...(faltavam.opcionais ?? [])].filter((n) => !!env(n));
  const conexao = oauth && objeto(conexaoInfo)
    ? {
      conectadoEm: dataOuNula(conexaoInfo.conectado_em),
      conectadoPor: textoOuNulo(conexaoInfo.conectado_por, 100),
      conta: textoOuNulo(conexaoInfo.conta, 200),
      escopos: Array.isArray(conexaoInfo.escopos) ? conexaoInfo.escopos.filter((e) => typeof e === 'string').slice(0, 40) : [],
      expiraEm: dataOuNula(conexaoInfo.expira_em),
      refreshExpiraEm: dataOuNula(conexaoInfo.refresh_expira_em),
    }
    : null;
  let estado = valor && ESTADOS.includes(valor.estado) ? valor.estado : null;
  let avisos = valor && Array.isArray(valor.avisos) ? valor.avisos.filter((a) => typeof a === 'string').slice(0, 30) : [];
  // A coleta parou na porta por falta de secret, e ele já foi cadastrado.
  // Retrato sem a anotação (de antes de 12/10/2026) conta como parado por
  // falta quando a fonte tem secret obrigatório (o site não tem: o
  // falta_configurar dele é o endereço do canal); a coleta seguinte, que
  // anota, desfaz a dúvida.
  const configuradoDepois = configurado && estado === 'falta_configurar'
    && (faltavam.obrigatorios === null ? obrigatorios.size > 0 : faltavam.obrigatorios.length > 0);
  if (!configurado) { estado = 'falta_configurar'; avisos = []; }
  else if (oauth && infoOk && !conexao) { estado = 'falta_conectar'; avisos = []; }
  else if (configuradoDepois) { estado = AGUARDANDO_COLETA; avisos = []; }
  // O aviso que cita um secret que faltava na coleta e agora existe só
  // podia falar da falta dele (sem o secret, nem dava para ele estar
  // errado): sai.
  else if (chegaram.length) avisos = avisos.filter((a) => !chegaram.some((n) => a.includes(n)));
  const partes = {};
  // Os secrets que uma parte pode ter perdido: os dos códigos de falta e os
  // que faltavam na coleta.
  const candidatos = [...new Set([...Object.values(CODIGO_DO_SECRET), ...chegaram])];
  if (valor && objeto(valor.partes)) {
    for (const [nome, p] of Object.entries(valor.partes)) {
      if (!objeto(p)) continue;
      const codigo = typeof p.codigo === 'string' && /^[a-z0-9_]{1,60}$/.test(p.codigo) ? p.codigo : null;
      const motivo = textoOuNulo(p.motivo, 300);
      let estadoParte = ESTADOS.includes(p.estado) ? p.estado : 'erro';
      // A parte que a coleta pulou por falta de um secret que agora existe:
      // a de uma coleta parada inteira na porta, a do código de falta (que
      // quer dizer "coletada sem ele") ou a que cita pelo nome um secret que
      // faltava naquela coleta. O motivo dela falava da falta.
      const semOSecret = (n) => !!env(n) && (CODIGO_DO_SECRET[codigo] === n || CODIGO_DO_SECRET[motivo] === n
        || (chegaram.includes(n) && typeof motivo === 'string' && motivo.includes(n)));
      const velha = estadoParte === 'falta_configurar' && configurado && (configuradoDepois || candidatos.some(semOSecret));
      if (velha) estadoParte = AGUARDANDO_COLETA;
      partes[nome] = {
        estado: estadoParte,
        motivo: velha ? null : motivo,
        // O código técnico da parte (contrato, seção 4): é por ele que a
        // tela separa um caso do outro (reconectar, cota...), sem comparar
        // frase; nunca para mostrar. Só [a-z0-9_], a mesma régua da coletora.
        codigo: velha ? null : codigo,
        coletadoEm: dataOuNula(p.coletado_em),
        tentadoEm: dataOuNula(p.tentado_em),
      };
    }
  }
  const execucoes = execucoesDaFonte(diario, fonte);
  return {
    fonte,
    nome: NOMES_FONTE[fonte] || fonte,
    oauth,
    estado,
    conta: textoOuNulo(valor?.conta, 200),
    partes,
    // No mesmo lugar de sempre quando vai (a ordem das chaves do arquivo da
    // prévia não muda); na leitura leve, a chave nem existe.
    ...(leve ? {} : { dados: valor && objeto(valor.dados) ? (verRestrito ? valor.dados : tirarRestrito(valor.dados)) : {} }),
    avisos,
    coletadoEm: dataOuNula(valor?.coletado_em),
    ultimaBoaEm: dataOuNula(valor?.ultima_boa_em),
    configurado,
    opcionais,
    conexao,
    // Só nas fontes por OAuth, e só quando o cofre não pôde ser lido.
    conexaoDesconhecida: oauth && !infoOk,
    iniciadoEm: dataOuNula(valor?.iniciado_em),
    andando: andandoAgora(diario, fonte, agora),
    ultimas: execucoes.slice(0, 5).map((e) => ({
      inicio: dataOuNula(e.inicio),
      fim: dataOuNula(e.fim),
      estado: typeof e.estado === 'string' ? e.estado : null,
      chamadas: Number.isInteger(e.chamadas) ? e.chamadas : null,
      // O erro do diário é técnico ("ga4 lote: servidor (HTTP 503)"): só a
      // gestão recebe, para quem for consertar; a tela mostra a todos uma
      // frase fixa (revisão de 12/10).
      erro: verRestrito ? textoOuNulo(e.erro, 300) : null,
    })),
  };
}
