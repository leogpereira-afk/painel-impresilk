/* AS REGRAS DO MARKETING QUE O SERVIDOR E A TELA DIVIDEM.
 *
 * Centro de Comando do Marketing (especificação do Léo, 10/10/2026). Este
 * arquivo mora em _shared porque a Edge Function painel-marketing é quem
 * decide; a tela importa daqui para avisar antes de mandar, e o teste em
 * tests/marketing.test.mjs prova as duas coisas de uma vez.
 *
 * O banco guarda (supabase/migrations/20261010a_marketing_base.sql e
 * 20261011a_marketing_canais.sql); aqui fica o que é regra de campo:
 * tamanho, formato, situação, dinheiro, número.
 *
 * Etapa a2 (11/10/2026): canais, playbook, publicações, números da semana e
 * papéis. Contrato em docs/marketing/a2-contrato.md.
 */
import { CANAIS as CANAIS_COMERCIAL } from './relacionamento-comercial.mjs';
import { pessoasParaReunioes } from './reunioes.mjs';

export class ErroMarketing extends Error {
  constructor(mensagem, status = 422) { super(mensagem); this.status = status; }
}

// As situações de hoje, as mesmas da tela antiga. Ficam no código de
// propósito: o banco confere a mesma lista (check da tabela), e uma situação
// nova muda a régua de "atrasada" e os relatórios, não é ajuste de tela.
export const SITUACOES_ACAO = ['Ideia', 'Produção', 'Aprovação', 'Programada', 'Publicada', 'Encerrada'];
export const SITUACOES_FEITAS = ['Publicada', 'Encerrada'];

// As listas abaixo são ESTRUTURA (o banco confere as mesmas), não conteúdo:
// quais canais existem, com que nome, cor e ordem, isso é da casa e se edita
// em Configurações. Ícone novo entra aqui e no ChipCanal.jsx juntos.
export const GRUPOS_CANAL = ['digital', 'contato', 'offline'];
export const ICONES_CANAL = ['globe', 'instagram', 'linkedin', 'facebook', 'pin', 'map-pin', 'message-circle', 'phone', 'mail', 'handshake', 'megaphone', 'youtube', 'store'];
export const TIPOS_PLAYBOOK = ['unica', 'rotina', 'gatilho'];
export const RECORRENCIAS = ['diaria', 'semanal', 'mensal', 'cada_n_dias'];
export const PRIORIDADES = ['alta', 'media', 'baixa'];
export const EVIDENCIAS = ['nenhuma', 'link', 'foto', 'texto'];
export const PAPEIS_MARKETING = ['gestao', 'marketing', 'visualizacao'];
export const NUMEROS_PUBLICACAO = ['alcance', 'impressoes', 'engajamento', 'cliques', 'leads'];
export const NUMEROS_SEMANA = ['seguidores', 'alcance', 'impressoes', 'engajamento', 'cliques', 'conversas', 'leads'];
// Uma importação de CSV por vez não passa disso (o pedido inteiro cabe na
// porta e a transação do banco não vira uma fila de minutos).
export const LIMITE_LINHAS_CSV = 2000;

const ROTULO_NUMERO = {
  seguidores: 'os seguidores', alcance: 'o alcance', impressoes: 'as impressões', engajamento: 'o engajamento',
  cliques: 'os cliques', conversas: 'as conversas', leads: 'os leads',
};

const ID_ORCAMENTO = /^[A-Za-z0-9_.-]{1,40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_PESSOA = /^[0-9]{6,11}$/;
const CODIGO_CANAL = /^[a-z0-9_-]{2,30}$/;
// Valores fixos do ?v= da página Marketing: um canal com esse código tomaria o
// lugar da vista (ou nunca abriria). O check do banco repete a lista.
export const CODIGOS_RESERVADOS = ['geral', 'materiais'];
const CODIGO_ITEM = /^[a-z0-9_-]{2,40}$/;
const MAX_NUMERO = 1e9;

const maiuscula = (t) => t[0].toUpperCase() + t.slice(1);
const objeto = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const tem = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// Caractere de controle (o nulo U+0000 sobretudo) que veio colado ou num CSV:
// o jsonb do banco recusa o pedido INTEIRO por causa dele, então sai antes.
const CONTROLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

// Texto de uma linha: espaços repetidos viram um.
function texto(valor, max, rotulo, obrigatorio = false) {
  const t = valor == null ? '' : String(valor).replace(CONTROLE, '').replace(/\s+/g, ' ').trim();
  if (obrigatorio && !t) throw new ErroMarketing(`Preencha ${rotulo}.`);
  if (t.length > max) throw new ErroMarketing(`${maiuscula(rotulo)} passou de ${max} letras.`);
  return t || null;
}

// Texto de várias linhas (instrução, mensagem do WhatsApp): a quebra de
// linha é conteúdo, não sujeira.
function textoLongo(valor, max, rotulo, obrigatorio = false) {
  const t = valor == null ? '' : String(valor).replace(CONTROLE, '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
  if (obrigatorio && !t) throw new ErroMarketing(`Preencha ${rotulo}.`);
  if (t.length > max) throw new ErroMarketing(`${maiuscula(rotulo)} passou de ${max} letras.`);
  return t || null;
}

function dataValida(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [a, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return a >= 2000 && a <= 2100 && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function escolha(valor, lista, mensagem) {
  if (!lista.includes(valor)) throw new ErroMarketing(mensagem);
  return valor;
}

function booleano(valor, padrao, rotulo) {
  if (valor == null) return padrao;
  if (typeof valor !== 'boolean') throw new ErroMarketing(`Valor inválido em ${rotulo}.`);
  return valor;
}

// Inteiro de formulário: aceita número ou texto só com dígitos. Vazio vale
// o padrão; sem padrão (undefined), é obrigatório.
function inteiro(valor, rotulo, min, max, padrao) {
  if (valor == null || valor === '') {
    if (padrao === undefined) throw new ErroMarketing(`Informe ${rotulo}.`);
    return padrao;
  }
  const n = typeof valor === 'number' ? valor : /^\s*-?\d+\s*$/.test(String(valor)) ? Number(String(valor).trim()) : NaN;
  if (!Number.isInteger(n) || n < min || n > max) throw new ErroMarketing(`${maiuscula(rotulo)} vai de ${min} a ${max}.`);
  return n;
}

// NÚMERO MEDIDO (alcance, cliques...): vazio é NULO, "ninguém mediu", e
// nunca vira zero. Zero é resultado; nulo é ausência de medida.
function numero(valor, rotulo) {
  if (valor == null || valor === '') return null;
  const n = typeof valor === 'number' ? valor : /^\s*\d+\s*$/.test(String(valor)) ? Number(String(valor).trim()) : NaN;
  if (!Number.isInteger(n) || n < 0 || n > MAX_NUMERO) throw new ErroMarketing(`${maiuscula(rotulo)} precisa ser um número inteiro, de 0 a 1 bilhão.`);
  return n;
}

function idPessoaOpcional(valor, rotulo) {
  if (valor == null || valor === '') return null;
  const t = String(valor).trim();
  if (!ID_PESSOA.test(t)) throw new ErroMarketing(`${maiuscula(rotulo)} precisa ser uma pessoa da lista.`);
  return t;
}

function uuidObrigatorio(valor, mensagem, status = 422) {
  if (typeof valor !== 'string' || !UUID.test(valor)) throw new ErroMarketing(mensagem, status);
  return valor.toLowerCase();
}
const uuidOpcional = (valor, mensagem) => (valor == null || valor === '' ? null : uuidObrigatorio(valor, mensagem));

// Link de perfil ou de gerenciador: só http(s), como o da ação (a1).
function linkSimples(valor, rotulo, max = 500) {
  const url = texto(valor, max, rotulo);
  if (url && !/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(url)) throw new ErroMarketing(`${maiuscula(rotulo)} precisa começar com http:// ou https://.`);
  return url;
}

// LINK DE PUBLICAÇÃO: é a chave que impede o CSV de lançar a mesma
// publicação duas vezes no mesmo canal. O mesmo post colado de dois jeitos
// ("...?igsh=abc" pelo celular, ".../p/X/" pelo computador) tem de dar o
// mesmo link. Sai só o que é rastreio (utm_*, igsh, fbclid, gclid...), o
// "#" e a barra do fim; parâmetro que muda a página (?page_id=140 do site)
// fica.
const RASTREIO = /^(utm_[a-z_]+|igsh|igshid|fbclid|gclid|si|mibextid)$/i;
// Só o site do Pinterest de cada país (com ou sem www, ou com as 2 letras do
// país na frente); ads., developers. e pin.it ficam como estão.
const PINTEREST_PAIS = /^(?:(?:www|[a-z]{2})\.)?pinterest\.(?:com(?:\.[a-z]{2})?|co\.[a-z]{2}|[a-z]{2})$/i;
export function normalizarLink(valor, rotulo = 'o link') {
  const bruto = texto(valor, 500, rotulo);
  if (!bruto) return null;
  let u;
  try { u = new URL(bruto); } catch { u = null; }
  if (!u || !/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) {
    throw new ErroMarketing(`${maiuscula(rotulo)} precisa começar com http:// ou https://.`);
  }
  u.hash = '';
  // O mesmo Pin tem um endereço por país (br.pinterest.com, pinterest.com.br,
  // pinterest.pt...). A API manda sempre www.pinterest.com (linkDoPin do
  // conector); o link copiado do navegador no Brasil vem com br. Sem isto, o
  // lançado à mão e o coletado viravam duas publicações do mesmo Pin.
  if (PINTEREST_PAIS.test(u.hostname)) { u.protocol = 'https:'; u.hostname = 'www.pinterest.com'; }
  for (const k of [...u.searchParams.keys()]) if (RASTREIO.test(k)) u.searchParams.delete(k);
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.replace(/\/+$/, '');
  const fora = u.toString();
  if (fora.length > 500) throw new ErroMarketing(`${maiuscula(rotulo)} passou de 500 letras.`);
  return fora;
}

/* DATAS. O dia da casa é o de São Paulo (o servidor roda em UTC: às 22h de
   domingo aqui já é segunda lá). */
export const hojeSP = (agora = new Date()) => agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
export function somarDias(iso, dias) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
/** Segunda-feira da semana de `iso` (a semana do lançamento de números). */
export function segundaDaSemana(iso) {
  const dia = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return somarDias(iso, -((dia + 6) % 7));
}

// ------------------------------------------------------------------ ações --

/** Confere e normaliza o que a tela mandou. Devolve os campos no formato da
 *  tabela e a lista de orçamentos (ids do ERP, sem repetição).
 *
 *  Desde a a2 a ação tem canal (canalId) e responsável (responsavelId, a
 *  pessoa pelo id_pessoa). O texto antigo (canal, responsavel) continua
 *  guardado. Só vai para o banco o campo que veio no pedido: na edição, o
 *  que não veio fica como estava (uma aba antiga não apaga o canal escolhido
 *  numa aba nova, nem o contrário). */
export function prepararAcao(entrada) {
  if (!objeto(entrada)) throw new ErroMarketing('Ação inválida.', 400);
  const nome = texto(entrada.nome, 200, 'o nome da ação', true);
  const responsavel = texto(entrada.responsavel, 120, 'o responsável');
  const responsavelId = idPessoaOpcional(entrada.responsavelId, 'o responsável');
  if (!responsavel && !responsavelId) throw new ErroMarketing('Preencha o responsável.');
  const prazo = String(entrada.prazo ?? '');
  if (!dataValida(prazo)) throw new ErroMarketing('Informe um prazo válido.');
  const situacao = entrada.status == null || entrada.status === '' ? 'Ideia' : String(entrada.status);
  if (!SITUACOES_ACAO.includes(situacao)) throw new ErroMarketing('Situação inválida.');
  const investimento = entrada.investimento == null || entrada.investimento === '' ? 0 : Number(entrada.investimento);
  if (!Number.isFinite(investimento) || investimento < 0) throw new ErroMarketing('O investimento não pode ser negativo.');
  if (investimento > 1e9) throw new ErroMarketing('Investimento alto demais. Confira o valor.');
  const url = texto(entrada.url, 500, 'o link');
  if (url && !/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(url)) throw new ErroMarketing('O link precisa começar com http:// ou https://.');
  const lista = entrada.orcamentos == null ? [] : entrada.orcamentos;
  if (!Array.isArray(lista) || lista.length > 300) throw new ErroMarketing('Lista de orçamentos inválida.');
  const orcamentos = [...new Set(lista.map((o) => String(o ?? '').trim()).filter(Boolean))];
  if (orcamentos.some((o) => !ID_ORCAMENTO.test(o))) throw new ErroMarketing('Orçamento inválido na lista.');
  const dados = {
    nome,
    objetivo: texto(entrada.objetivo, 500, 'o objetivo'),
    publico: texto(entrada.publico, 300, 'o público'),
    prazo,
    situacao,
    investimento: Math.round(investimento * 100) / 100,
    url,
  };
  if (tem(entrada, 'canal')) dados.canal_texto = texto(entrada.canal, 120, 'o canal');
  if (tem(entrada, 'canalId')) dados.canal_id = uuidOpcional(entrada.canalId, 'Escolha um canal da lista.');
  if (tem(entrada, 'responsavel')) dados.responsavel_texto = responsavel;
  if (tem(entrada, 'responsavelId')) dados.responsavel_id = responsavelId;
  return { dados, orcamentos: orcamentos.sort() };
}

export function idAcao(id) {
  if (typeof id !== 'string' || !UUID.test(id)) throw new ErroMarketing('Ação inválida.', 400);
  return id.toLowerCase();
}

/** Id de qualquer linha do Marketing (canal, item, publicação): só UUID. */
export function idMarketing(id, mensagem = 'Registro inválido.') {
  return uuidObrigatorio(id, mensagem, 400);
}

/** Linha do banco no formato que a tela usa (os nomes de campo da tela
 *  antiga, para nada mudar para quem já usava). */
export function acaoParaTela(linha, orcamentos = []) {
  return {
    id: linha.id,
    nome: linha.nome,
    objetivo: linha.objetivo ?? '',
    publico: linha.publico ?? '',
    canal: linha.canal_texto ?? '',
    canalId: linha.canal_id ?? null,
    responsavel: linha.responsavel_texto ?? '',
    responsavelId: linha.responsavel_id ?? null,
    prazo: linha.prazo,
    status: linha.situacao,
    investimento: Number(linha.investimento ?? 0),
    url: linha.url ?? '',
    orcamentos: [...orcamentos].sort(),
    versao: linha.versao,
    criadoEm: linha.criado_em ?? null,
    atualizadoEm: linha.atualizado_em ?? null,
    migrada: !!linha.legado_id,
  };
}

// ----------------------------------------------------------------- canais --

/** Código a partir do nome ("Google Meu Negócio" vira "google-meu-negocio"),
 *  para quem cria um canal sem pensar em código. */
export function codigoDoNome(nome) {
  return String(nome ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/, '');
}

/** Canal da tela para a tabela. O canal vai INTEIRO (a Edge Function junta o
 *  que veio com o que está no banco antes de chamar aqui). O código só vale
 *  na criação: é a chave da carga padrão, do endereço (?v=instagram) e da
 *  ligação com o Comercial, e por isso não muda depois. */
export function prepararCanal(entrada, { novo = true, codigoAtual = null } = {}) {
  if (!objeto(entrada)) throw new ErroMarketing('Canal inválido.', 400);
  const nome = texto(entrada.nome, 60, 'o nome do canal', true);
  let codigo = null;
  if (novo) {
    codigo = entrada.codigo == null || String(entrada.codigo).trim() === '' ? codigoDoNome(nome) : String(entrada.codigo).trim().toLowerCase();
    if (!CODIGO_CANAL.test(codigo)) throw new ErroMarketing('O código do canal usa de 2 a 30 letras minúsculas, números, "-" ou "_".');
    if (CODIGOS_RESERVADOS.includes(codigo)) throw new ErroMarketing(`O código "${codigo}" é o nome de uma vista da página. Escolha outro código para o canal.`);
  } else if (entrada.codigo != null && entrada.codigo !== codigoAtual) {
    throw new ErroMarketing('O código do canal não muda depois de criado. Mude o nome à vontade.');
  }
  const cor = String(entrada.cor ?? '').trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(cor)) throw new ErroMarketing('A cor precisa estar no formato #RRGGBB.');
  const comercial = entrada.comercialCanal == null || entrada.comercialCanal === '' ? null : String(entrada.comercialCanal);
  if (comercial && !tem(CANAIS_COMERCIAL, comercial)) throw new ErroMarketing('Canal do Comercial inválido.');
  return {
    codigo,
    nome,
    grupo: escolha(entrada.grupo, GRUPOS_CANAL, 'Escolha o grupo do canal: digital, contato ou offline.'),
    icone: escolha(entrada.icone, ICONES_CANAL, 'Escolha um ícone da lista.'),
    cor,
    ordem: inteiro(entrada.ordem, 'a ordem', 0, 9999, 0),
    ativo: booleano(entrada.ativo, true, 'ativo'),
    em_implantacao: booleano(entrada.emImplantacao, false, 'em implantação'),
    url_perfil: linkSimples(entrada.urlPerfil, 'o link do perfil'),
    url_gerenciador: linkSimples(entrada.urlGerenciador, 'o link do gerenciador'),
    mensagem_whatsapp: textoLongo(entrada.mensagemWhatsapp, 300, 'a mensagem do WhatsApp'),
    dias_parado: inteiro(entrada.diasParado, 'os dias para o canal ficar parado', 1, 90, 7),
    comercial_canal: comercial,
  };
}

export function canalParaTela(linha) {
  return {
    id: linha.id,
    codigo: linha.codigo,
    nome: linha.nome,
    grupo: linha.grupo,
    icone: linha.icone,
    cor: linha.cor,
    ordem: Number(linha.ordem ?? 0),
    ativo: linha.ativo !== false,
    emImplantacao: linha.em_implantacao === true,
    urlPerfil: linha.url_perfil ?? '',
    urlGerenciador: linha.url_gerenciador ?? '',
    mensagemWhatsapp: linha.mensagem_whatsapp ?? '',
    diasParado: Number(linha.dias_parado ?? 7),
    comercialCanal: linha.comercial_canal ?? null,
    versao: linha.versao,
    atualizadoEm: linha.atualizado_em ?? null,
  };
}

// --------------------------------------------------------------- playbook --

/** Item do playbook da tela para a tabela, inteiro. Campo que não combina
 *  com o tipo (recorrência numa ação única, evento numa rotina) é descartado
 *  em vez de recusado: o formulário guarda o que a pessoa digitou antes de
 *  trocar o tipo, e isso não é erro dela.
 *  `padrao: true` é a carga padrão: o item aponta para o canal pelo código. */
export function prepararItemPlaybook(entrada, { padrao = false } = {}) {
  if (!objeto(entrada)) throw new ErroMarketing('Item do playbook inválido.', 400);
  const tipo = escolha(entrada.tipo, TIPOS_PLAYBOOK, 'Escolha o tipo do item: ação única, rotina ou gatilho.');
  const recorrencia = tipo === 'rotina' ? escolha(entrada.recorrencia, RECORRENCIAS, 'Escolha a recorrência da rotina.') : null;
  const implantacao = booleano(entrada.implantacao, false, 'implantação');
  if (implantacao && tipo !== 'unica') throw new ErroMarketing('Só ação única entra no checklist de implantação.');
  const lista = entrada.checklist == null ? [] : entrada.checklist;
  if (!Array.isArray(lista)) throw new ErroMarketing('Checklist inválido.');
  const checklist = lista.map((x) => texto(x, 200, 'o item do checklist')).filter(Boolean);
  if (checklist.length > 30) throw new ErroMarketing('O checklist vai até 30 itens.');
  const dados = {
    tipo,
    titulo: texto(entrada.titulo, 160, 'o título do item', true),
    instrucao: textoLongo(entrada.instrucao, 2000, 'a instrução'),
    responsavel_id: idPessoaOpcional(entrada.responsavelId, 'o responsável'),
    recorrencia,
    a_cada_dias: recorrencia === 'cada_n_dias' ? inteiro(entrada.aCadaDias, 'o intervalo em dias', 1, 365) : null,
    meta_quantidade: tipo === 'rotina' ? inteiro(entrada.metaQuantidade, 'a meta', 1, 999, 1) : null,
    prazo_dias: inteiro(entrada.prazoDias, 'o prazo em dias', 0, 365, null),
    prioridade: entrada.prioridade == null || entrada.prioridade === '' ? 'media' : escolha(entrada.prioridade, PRIORIDADES, 'Escolha a prioridade: alta, média ou baixa.'),
    checklist,
    evidencia: entrada.evidencia == null || entrada.evidencia === '' ? 'nenhuma' : escolha(entrada.evidencia, EVIDENCIAS, 'Escolha a evidência: nenhuma, link, foto ou texto.'),
    gatilho: tipo === 'gatilho' ? texto(entrada.gatilho, 60, 'o evento do gatilho', true) : null,
    implantacao,
    ativo: booleano(entrada.ativo, true, 'ativo'),
    ordem: inteiro(entrada.ordem, 'a ordem', 0, 9999, 0),
  };
  if (padrao) {
    const canal = String(entrada.canal ?? '');
    const codigo = String(entrada.codigo ?? '');
    if (!CODIGO_CANAL.test(canal) || !CODIGO_ITEM.test(codigo)) throw new ErroMarketing('Item da carga padrão sem canal ou código.');
    return { canal, codigo, ...dados };
  }
  return { canal_id: uuidObrigatorio(entrada.canalId, 'Escolha o canal do item.'), ...dados };
}

export function itemParaTela(linha) {
  return {
    id: linha.id,
    canalId: linha.canal_id,
    codigo: linha.codigo ?? null,
    tipo: linha.tipo,
    titulo: linha.titulo,
    instrucao: linha.instrucao ?? '',
    responsavelId: linha.responsavel_id ?? null,
    recorrencia: linha.recorrencia ?? null,
    aCadaDias: linha.a_cada_dias ?? null,
    metaQuantidade: linha.meta_quantidade ?? null,
    prazoDias: linha.prazo_dias ?? null,
    prioridade: linha.prioridade,
    checklist: Array.isArray(linha.checklist) ? linha.checklist : [],
    evidencia: linha.evidencia,
    gatilho: linha.gatilho ?? null,
    implantacao: linha.implantacao === true,
    concluidoEm: linha.concluido_em ?? null,
    concluidoPor: linha.concluido_por ?? null,
    evidenciaValor: linha.evidencia_valor ?? '',
    ativo: linha.ativo !== false,
    ordem: Number(linha.ordem ?? 0),
    versao: linha.versao,
    atualizadoEm: linha.atualizado_em ?? null,
  };
}

/** Concluir item único: devolve a evidência que vai para o banco. O item
 *  (linha do banco) diz o que ele pede; link e texto são obrigatórios. */
export function prepararConclusao(item, { feito, evidencia } = {}) {
  if (typeof feito !== 'boolean') throw new ErroMarketing('Informe se o item foi feito.', 400);
  if (item?.tipo !== 'unica') throw new ErroMarketing('Só ação única se conclui por aqui. Rotina e gatilho entram na agenda.');
  if (!feito) return null;
  if (item.evidencia === 'link') {
    const link = linkSimples(evidencia, 'o link da evidência', 1000);
    if (!link) throw new ErroMarketing('Cole o link que comprova o item para concluir.');
    return link;
  }
  if (item.evidencia === 'texto') return textoLongo(evidencia, 1000, 'o que foi feito', true);
  return textoLongo(evidencia, 1000, 'a evidência');
}

// ------------------------------------------------------------ publicações --

/** Publicação lançada à mão (colando o link). O campo do link pode vir como
 *  `url` ou `link` (o nome da coluna no CSV). */
export function prepararPublicacao(entrada) {
  if (!objeto(entrada)) throw new ErroMarketing('Publicação inválida.', 400);
  const data = String(entrada.data ?? '');
  if (!dataValida(data)) throw new ErroMarketing('Informe a data da publicação.');
  const dados = {
    canal_id: uuidObrigatorio(entrada.canalId, 'Escolha o canal da publicação.'),
    data,
    titulo: texto(entrada.titulo, 200, 'o título'),
    url: normalizarLink(entrada.url ?? entrada.link),
    acao_id: uuidOpcional(entrada.acaoId, 'Escolha uma ação da lista.'),
  };
  for (const k of NUMEROS_PUBLICACAO) dados[k] = numero(entrada[k], ROTULO_NUMERO[k]);
  return dados;
}

/** Linha do CSV já lida pela tela (lerCsvPublicacoes): mesma régua da
 *  publicação, sem ligação com ação (o arquivo não sabe dela). */
export function prepararLinhaCsv(entrada) {
  const dados = prepararPublicacao(objeto(entrada) ? { ...entrada, acaoId: null } : entrada);
  delete dados.acao_id;
  return dados;
}

export function publicacaoParaTela(linha) {
  const fora = {
    id: linha.id,
    canalId: linha.canal_id,
    data: linha.data,
    titulo: linha.titulo ?? '',
    url: linha.url ?? '',
    acaoId: linha.acao_id ?? null,
    fonte: linha.fonte,
    coletadoEm: linha.coletado_em ?? null,
    retiradaEm: linha.retirada_em ?? null,
    versao: linha.versao,
    criadoPor: linha.criado_por ?? null,
    atualizadoEm: linha.atualizado_em ?? null,
  };
  for (const k of NUMEROS_PUBLICACAO) fora[k] = linha[k] == null ? null : Number(linha[k]);
  return fora;
}

// ------------------------------------------------------ números da semana --

/** Números da semana de um canal. Só os números que vieram mudam (o banco
 *  mantém os outros); mandar um número vazio apaga só aquele. */
export function prepararMetricas(entrada, hoje = hojeSP()) {
  if (!objeto(entrada)) throw new ErroMarketing('Números inválidos.', 400);
  const canal = uuidObrigatorio(entrada.canalId, 'Escolha o canal.');
  const semana = String(entrada.semana ?? '');
  if (!dataValida(semana)) throw new ErroMarketing('Informe a semana.');
  if (segundaDaSemana(semana) !== semana) throw new ErroMarketing('A semana começa na segunda-feira.');
  if (semana > segundaDaSemana(hoje)) throw new ErroMarketing('Essa semana ainda não começou.');
  if (!objeto(entrada.numeros)) throw new ErroMarketing('Informe os números da semana.');
  const dados = {};
  for (const [k, v] of Object.entries(entrada.numeros)) {
    if (!NUMEROS_SEMANA.includes(k)) throw new ErroMarketing('Número desconhecido na semana.');
    dados[k] = numero(v, ROTULO_NUMERO[k]);
  }
  if (!Object.keys(dados).length) throw new ErroMarketing('Informe ao menos um número da semana.');
  return { canal, semana, dados };
}

export function metricasParaTela(linha) {
  const fora = {
    id: linha.id,
    canalId: linha.canal_id,
    semana: linha.semana,
    fonte: linha.fonte,
    coletadoEm: linha.coletado_em ?? null,
    versao: linha.versao,
    atualizadoPor: linha.atualizado_por ?? null,
  };
  for (const k of NUMEROS_SEMANA) fora[k] = linha[k] == null ? null : Number(linha[k]);
  return fora;
}

// ------------------------------------------------------------------ papéis --

/** Papel nulo tira a pessoa da tabela (volta ao padrão, marketing). Papel
 *  ausente é recusado: apagar tem de ser pedido, não acontecer por omissão. */
export function prepararPapel(entrada) {
  if (!objeto(entrada)) throw new ErroMarketing('Pedido inválido.', 400);
  const idPessoa = String(entrada.idPessoa ?? '').trim();
  if (!ID_PESSOA.test(idPessoa)) throw new ErroMarketing('Escolha a pessoa.');
  if (!tem(entrada, 'papel')) throw new ErroMarketing('Escolha o papel.');
  // (o nome "escolhido" é de propósito: aqui se confere o VALOR pedido, não
  // o papel de quem pede, e o scripts/conferir-papel.mjs não deve confundir)
  const escolhido = entrada.papel;
  if (escolhido !== null && !PAPEIS_MARKETING.includes(escolhido)) throw new ErroMarketing('Escolha um papel: gestão, marketing ou visualização.');
  return { id_pessoa: idPessoa, papel_escolhido: escolhido };
}

export const papelParaTela = (linha) => ({ idPessoa: linha.id_pessoa, papel: linha.papel, definidoPor: linha.definido_por ?? null, definidoEm: linha.definido_em ?? null });

/** Direção: quem tem o painel inteiro. A mesma régua da lixeira de
 *  cadastros (master ou "*"). */
export const ehDirecaoMarketing = (s) => s?.master === true || (Array.isArray(s?.perms) && s.perms.includes('*'));
export const podeMarketing = (s) => ehDirecaoMarketing(s) || (Array.isArray(s?.perms) && s.perms.includes('marketing'));

/** O PAPEL DENTRO DO MARKETING. A direção é sempre gestão (não fica
 *  trancada fora do que é dela por uma linha esquecida na tabela). Os
 *  outros: o que a tabela diz; sem linha, marketing (quem tem o módulo
 *  trabalha nele, como era na a1). */
export function papelEfetivo(s, linha) {
  if (ehDirecaoMarketing(s)) return 'gestao';
  return PAPEIS_MARKETING.includes(linha?.papel) ? linha.papel : 'marketing';
}

/** O id_pessoa de quem entrou, a partir das contas achadas para o login.
 *  Mais de uma pessoa possível (ou nenhuma) dá nulo: na dúvida, ninguém;
 *  nunca a pessoa errada. */
export function idPessoaDasContas(contas) {
  const ids = [...new Set((contas || []).map((c) => String(c?.id_pessoa ?? '').trim()).filter(Boolean))];
  return ids.length === 1 && ID_PESSOA.test(ids[0]) ? ids[0] : null;
}

/** AS PESSOAS PARA ESCOLHER COMO RESPONSÁVEL, do RH. Ativas pela mesma régua
 *  das Reuniões (pessoasParaReunioes). O id_pessoa (6 primeiros dígitos do
 *  CPF) é calculado AQUI, no servidor, e o CPF não sai: a resposta só tem
 *  id, nome e setor. Ficha sem CPF, ou com os 6 dígitos iguais aos de outra
 *  ficha (mesmo de quem já saiu), fica fora: id ambíguo ligaria a tarefa de
 *  uma pessoa à outra. `semId` conta quantas ativas ficaram fora. */
export function pessoasParaMarketing(colaboradores = [], status = [], areas = [], cargos = []) {
  const idDe = (c) => {
    const d = String(c?.cpf ?? '').replace(/\D/g, '');
    return d.length === 11 ? d.slice(0, 6) : null;
  };
  const conta = new Map(), idPorFicha = new Map();
  for (const c of colaboradores) {
    const id = idDe(c);
    idPorFicha.set(String(c?.id), id);
    if (id) conta.set(id, (conta.get(id) || 0) + 1);
  }
  const pessoas = [];
  let semId = 0;
  for (const p of pessoasParaReunioes(colaboradores, status, areas, cargos)) {
    const id = idPorFicha.get(p.id);
    if (!id || conta.get(id) !== 1) { semId++; continue; }
    pessoas.push({ idPessoa: id, nome: p.nome, area: p.area });
  }
  return { pessoas, semId };
}

// ------------------------------------------------------------ carga padrão --

/** A carga padrão (_shared/marketing-padrao.mjs) passa pelos MESMOS
 *  validadores da tela antes de ir ao banco: um canal ou item mal escrito lá
 *  falha aqui (e no teste), não grava torto. */
export function padraoParaBanco(canais, itens) {
  const c = canais.map((x) => prepararCanal(x, { novo: true }));
  const codigos = new Set(c.map((x) => x.codigo));
  if (codigos.size !== c.length) throw new ErroMarketing('Carga padrão com código de canal repetido.');
  const p = itens.map((x) => prepararItemPlaybook(x, { padrao: true }));
  if (p.some((x) => !codigos.has(x.canal))) throw new ErroMarketing('Item da carga padrão aponta para canal que não existe.');
  if (new Set(p.map((x) => x.codigo)).size !== p.length) throw new ErroMarketing('Carga padrão com código de item repetido.');
  return { canais: c, playbook: p };
}

// ------------------------------------------------------- erro do banco --

const MUDOU = {
  acao: 'Esta ação mudou enquanto você editava. Reabra e confira.',
  canal: 'Este canal mudou enquanto você editava. Reabra e confira.',
  playbook: 'Este item do playbook mudou enquanto você editava. Reabra e confira.',
  publicacao: 'Esta publicação mudou enquanto você editava. Reabra e confira.',
};
const SUMIU = {
  acao: 'Esta ação não existe mais. Recarregue a página.',
  canal: 'Este canal não existe mais. Recarregue a página.',
  playbook: 'Este item do playbook não existe mais. Recarregue a página.',
  publicacao: 'Esta publicação não existe mais. Recarregue a página.',
};

/** Erro do banco em mensagem para gente. `contexto` é o que a porta estava
 *  gravando (acao, canal, playbook, publicacao, metricas, papel); a mensagem
 *  do banco (raise exception) diz o que sumiu quando não é o próprio. */
export function erroDoBanco(error, contexto = 'acao') {
  const code = error?.code;
  const msg = String(error?.message || '');
  if (code === '40001') return new ErroMarketing(MUDOU[contexto] || 'Este registro mudou enquanto você editava. Reabra e confira.', 409);
  if (code === 'P0002') {
    const qual = /^Canal/i.test(msg) ? 'canal' : /playbook/i.test(msg) ? 'playbook' : /^Publica/i.test(msg) ? 'publicacao' : /^A[çc][ãa]o/i.test(msg) ? 'acao' : contexto;
    return new ErroMarketing(SUMIU[qual] || 'Este registro não existe mais. Recarregue a página.', 404);
  }
  if (code === '23505') {
    let d = null;
    try { d = JSON.parse(error.details || 'null'); } catch { d = null; }
    if (d?.orcamento) return new ErroMarketing(`O orçamento ${d.orcamento} já está na ação "${d.acao}". Um orçamento só pode estar numa ação, para a venda não ser contada duas vezes.`, 409);
    if (/repetido/i.test(msg)) return new ErroMarketing(msg, 409);
    const tudo = `${msg} ${error?.details || ''}`;
    if (/painel_mkt_publicacoes_canal_url|\(canal_id, url\)/.test(tudo)) return new ErroMarketing('Esta publicação já foi lançada neste canal. Procure no Histórico do canal e edite por lá.', 409);
    if (/painel_mkt_canais_codigo|\(codigo\)/.test(tudo) && contexto === 'canal') return new ErroMarketing('Já existe um canal com este código. Escolha outro nome ou outro código.', 409);
    if (/painel_mkt_metricas_canal_semana|\(canal_id, semana\)/.test(tudo)) return new ErroMarketing('Outra pessoa acabou de lançar os números desta semana. Recarregue e confira.', 409);
    if (contexto === 'acao') return new ErroMarketing('Um desses orçamentos já está ligado a outra ação. Recarregue e confira.', 409);
    return new ErroMarketing('Este registro já existe. Recarregue e confira.', 409);
  }
  // Mensagens escritas por nós nas funções do banco (22023), já para gente.
  if (code === '22023') return new ErroMarketing(msg || 'Pedido inválido.', 422);
  // Regra do banco (check) que o servidor deixou passar: o campo é recusado,
  // não vira erro 500 sem explicação.
  if (code === '23514') return new ErroMarketing('Algum campo ficou fora do permitido. Confira e tente de novo.', 422);
  // Caractere que o banco não guarda (o texto() já limpa; isto é a rede).
  if (code === '22P05' || code === '22021') return new ErroMarketing('Algum texto tem um caractere inválido. Apague e digite de novo.', 422);
  return null;
}
