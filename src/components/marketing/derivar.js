/* O QUE A PÁGINA DO MARKETING MONTA A PARTIR DA RESPOSTA DO "painel".
 *
 * Cálculo puro, sem React e sem rede: recebe o que o servidor mandou (canais,
 * playbook, ações, publicações, métricas) e o dia de hoje, e devolve as listas
 * que a tela desenha. Fica fora dos componentes para o teste
 * (tests/marketing-pagina.test.mjs) provar as regras sem abrir navegador, e
 * para a Visão geral e o canal aberto usarem a MESMA régua: uma tarefa não
 * pode estar pendente num lugar e sumida no outro.
 *
 * As contas de prazo, semáforo e indicador moram em
 * src/lib/calc/marketing-canais.js; aqui só se escolhe O QUE entra em cada
 * lista.
 */
import { SITUACOES_FEITAS } from '../../../supabase/functions/_shared/marketing.mjs';
import {
  gruposFazer,
  indicadorCanal,
  paraDia,
  semaforoCanal,
  semanaDe,
  somarDias,
  ultimaPublicacao,
} from '../../lib/calc/marketing-canais.js';

/** As sub-abas do canal aberto, na ordem da tela. */
export const SUBS_CANAL = [
  { valor: 'fazer', rotulo: 'Fazer' },
  { valor: 'resultados', rotulo: 'Resultados' },
  { valor: 'calendario', rotulo: 'Calendário' },
  { valor: 'historico', rotulo: 'Histórico' },
];

/* Concluir uma AÇÃO na linha do Fazer põe a situação em "Encerrada", a
   última da lista. "Publicada" também é feita, mas nem toda ação publica
   (ligação, visita, presença); encerrada vale para todas. Quem quer outra
   situação abre a ação e escolhe. */
export const SITUACAO_AO_CONCLUIR = 'Encerrada';

export const lista = (x) => (Array.isArray(x) ? x : []);
export const acaoAberta = (a) => !!a && !SITUACOES_FEITAS.includes(a.status);
/** Item único pendente: só ação única ativa e não concluída. Rotina e
 *  gatilho não se concluem aqui (entram na agenda na etapa a3). */
export const itemPendente = (i) => !!i && i.ativo !== false && i.tipo === 'unica' && !i.concluidoEm;

/** Os canais da fileira de chips: ativo ou em implantação (o contrato da a2
 *  diz os dois), na ordem que o servidor mandou (ordem, depois nome). Para
 *  sumir da fileira, o canal precisa estar desativado E fora de implantação. */
export function canaisDaFileira(canais) {
  return lista(canais).filter((c) => c && c.id && (c.ativo || c.emImplantacao));
}

/* Os nomes dos grupos de canal (a mesma lista do check de painel_mkt_canais),
   para o leitor de tela ouvir em que grupo da fileira está. */
export const ROTULO_GRUPO_CANAL = { digital: 'Canais digitais', contato: 'Canais de contato', offline: 'Canais offline' };

/** A fileira em trechos de um grupo só (digital, contato, offline), para a
 *  tela pôr um fio entre um grupo e outro. A ORDEM CADASTRADA MANDA: se a
 *  gestão puser o WhatsApp entre o Site e o Instagram, a fileira fica nessa
 *  ordem e ganha um trecho a mais, em vez de a tela reordenar os chips
 *  calada. Grupo vazio ou desconhecido vira trecho próprio (nunca some). */
export function trechosDaFileira(canais) {
  const trechos = [];
  for (const c of lista(canais)) {
    if (!c) continue;
    const grupo = typeof c.grupo === 'string' && c.grupo ? c.grupo : 'sem-grupo';
    const ultimo = trechos[trechos.length - 1];
    if (ultimo && ultimo.grupo === grupo) ultimo.canais.push(c);
    else trechos.push({ grupo, canais: [c] });
  }
  return trechos;
}

/** As linhas do Fazer, no formato que a FilaFazer desenha.
 *  - canalId: só as do canal (nulo = todos os canais, a Visão geral);
 *  - mantidos: chaves que ficam na lista mesmo já feitas, enquanto o
 *    "Desfazer" da LinhaTarefa está na tela (a linha só sai no onSair);
 *  - semImplantacao: tira os itens do checklist de implantação (no canal em
 *    implantação eles já aparecem no checklist do topo, e duas linhas do
 *    mesmo item confundem);
 *  - idPessoa: só as dessa pessoa (filtro "Minhas");
 *  - canaisDoPlaybook: os ids dos canais da fileira. Item do playbook de
 *    canal desativado não é tarefa de ninguém (o canal saiu da fileira e
 *    o item ficaria órfão no Fazer). A AÇÃO continua: ela tem prazo e dono,
 *    e desativar o canal não a cumpre.
 *  Ações retiradas nem chegam do servidor. */
export function linhasFazer({ acoes, playbook, canalId = null, mantidos = new Set(), semImplantacao = false, idPessoa = null, canaisDoPlaybook = null } = {}) {
  const linhas = [];
  for (const a of lista(acoes)) {
    if (!a?.id || (canalId && a.canalId !== canalId)) continue;
    const chave = `acao:${a.id}`;
    if (!acaoAberta(a) && !mantidos.has(chave)) continue;
    if (idPessoa && a.responsavelId !== idPessoa) continue;
    linhas.push({
      chave,
      tipo: 'acao',
      id: a.id,
      titulo: a.nome,
      prazo: a.prazo || null,
      canalId: a.canalId || null,
      responsavelId: a.responsavelId || null,
      responsavelTexto: a.responsavel || '',
      feito: !acaoAberta(a),
    });
  }
  for (const i of lista(playbook)) {
    if (!i?.id || i.tipo !== 'unica' || i.ativo === false || (canalId && i.canalId !== canalId)) continue;
    if (semImplantacao && i.implantacao) continue;
    if (canaisDoPlaybook && !canaisDoPlaybook.has(i.canalId)) continue;
    const chave = `item:${i.id}`;
    if (i.concluidoEm && !mantidos.has(chave)) continue;
    if (idPessoa && i.responsavelId !== idPessoa) continue;
    linhas.push({
      chave,
      tipo: 'item',
      id: i.id,
      titulo: i.titulo,
      // O item do playbook ainda não tem data: o prazo relativo (prazoDias)
      // só vira dia quando o motor da etapa a3 gerar a tarefa. Até lá ele
      // fica no grupo "Sem prazo", e nunca como atrasado.
      prazo: null,
      canalId: i.canalId || null,
      responsavelId: i.responsavelId || null,
      responsavelTexto: '',
      feito: !!i.concluidoEm,
    });
  }
  return linhas;
}

/** O que cada chip mostra: indicador, pendentes e semáforo, por canal.
 *  Publicações que não chegaram (null) dão indicador nulo e não julgam
 *  "parado": sem dado, ninguém é acusado.
 *  "Parado" só conta para canal do grupo digital: ligação, visita e e-mail
 *  não publicam, e ficariam vermelhos à toa. O grupo é editável. */
export function resumoDosCanais({ canais, acoes, playbook, publicacoes } = {}, hoje) {
  const fora = new Map();
  const temPublicacoes = Array.isArray(publicacoes);
  for (const canal of lista(canais)) {
    if (!canal?.id) continue;
    const pendentes = linhasFazer({ acoes, playbook, canalId: canal.id }).filter((l) => !l.feito);
    const pubs = temPublicacoes ? publicacoes.filter((p) => p?.canalId === canal.id) : null;
    fora.set(canal.id, {
      pendentes: pendentes.length,
      indicador: indicadorCanal(pubs, hoje),
      semaforo: semaforoCanal(
        {
          itensPendentes: pendentes,
          ultimaPublicacao: ultimaPublicacao(pubs, hoje),
          diasParado: canal.diasParado,
          emImplantacao: !!canal.emImplantacao,
          contaParado: canal.grupo === 'digital',
        },
        hoje
      ),
    });
  }
  return fora;
}

/** Os quatro números do topo da Visão geral. Lista que não chegou dá null
 *  no número dela (a tela mostra "sem dado", nunca 0). */
export function kpisGerais({ acoes, playbook, publicacoes } = {}, hoje) {
  const temAcoes = Array.isArray(acoes);
  const abertas = temAcoes ? acoes.filter(acaoAberta) : null;
  const grupos = temAcoes ? gruposFazer(linhasFazer({ acoes, playbook }), hoje) : null;
  const mes = String(hoje).slice(0, 7);
  return {
    abertas: abertas ? abertas.length : null,
    atrasadas: grupos ? grupos.atrasadas.length : null,
    publicacoes: indicadorCanal(publicacoes, hoje),
    mes,
    // Investimento das ações com prazo neste mês (a mesma régua do filtro
    // "Mês do prazo" da lista de ações).
    investimentoMes: temAcoes
      ? acoes.filter((a) => String(a?.prazo || '').startsWith(mes)).reduce((s, a) => s + (Number(a.investimento) || 0), 0)
      : null,
  };
}

/** O histórico do canal: ações concluídas, itens do playbook feitos e
 *  publicações, da mais recente para a mais antiga. */
export function historicoDoCanal({ acoes, playbook, publicacoes } = {}, canalId) {
  const fora = [];
  for (const a of lista(acoes)) {
    if (a?.canalId !== canalId || acaoAberta(a)) continue;
    fora.push({ chave: `acao:${a.id}`, tipo: 'acao', id: a.id, dia: paraDia(a.prazo), titulo: a.nome, sub: a.status });
  }
  for (const i of lista(playbook)) {
    if (i?.canalId !== canalId || !i.concluidoEm) continue;
    fora.push({ chave: `item:${i.id}`, tipo: 'item', id: i.id, dia: paraDia(i.concluidoEm), titulo: i.titulo, sub: 'Item do playbook feito' });
  }
  for (const p of lista(publicacoes)) {
    if (p?.canalId !== canalId || p.retiradaEm) continue;
    fora.push({ chave: `pub:${p.id}`, tipo: 'publicacao', id: p.id, dia: paraDia(p.data), titulo: p.titulo || p.url || 'Publicação sem título', sub: 'Publicação' });
  }
  // Sem dia vai para o fim; no mesmo dia, a ordem de chegada.
  return fora
    .map((x, n) => ({ ...x, n }))
    .sort((x, y) => (x.dia && y.dia ? (x.dia < y.dia ? 1 : x.dia > y.dia ? -1 : x.n - y.n) : x.dia ? -1 : y.dia ? 1 : x.n - y.n))
    .map(({ n: _n, ...x }) => x);
}

/** O mês do calendário do canal, dia a dia (só os dias com alguma coisa):
 *  as ações pelo prazo (abertas e feitas) e as publicações pela data. */
export function calendarioDoMes({ acoes, publicacoes } = {}, canalId, mes) {
  const porDia = new Map();
  const por = (dia, entrada) => {
    if (!dia || !dia.startsWith(mes)) return;
    porDia.set(dia, [...(porDia.get(dia) || []), entrada]);
  };
  for (const a of lista(acoes)) {
    if (a?.canalId !== canalId) continue;
    por(paraDia(a.prazo), { chave: `acao:${a.id}`, tipo: 'acao', id: a.id, titulo: a.nome, sub: a.status, feito: !acaoAberta(a) });
  }
  for (const p of lista(publicacoes)) {
    if (p?.canalId !== canalId || p.retiradaEm) continue;
    por(paraDia(p.data), { chave: `pub:${p.id}`, tipo: 'publicacao', id: p.id, titulo: p.titulo || p.url || 'Publicação sem título', sub: 'Publicação', feito: true });
  }
  return [...porDia.entries()].sort(([x], [y]) => (x < y ? -1 : 1)).map(([dia, entradas]) => ({ dia, entradas }));
}

/** O mês vizinho de "AAAA-MM" (delta -1 ou +1). */
export function mesVizinho(mes, delta) {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export const MES_VALIDO = (v) => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) && v >= '2000-01' && v <= '2100-12';

/** A semana que os Resultados comparam: a mais recente com número lançado
 *  para o canal (na segunda-feira, a semana que começou hoje quase nunca tem
 *  número ainda). Sem nada lançado, a semana de hoje. */
export function semanaParaComparar(metricas, canalId, hoje) {
  let maior = null;
  for (const m of lista(metricas)) {
    if (m?.canalId !== canalId) continue;
    const s = semanaDe(m.semana);
    if (s && (!maior || s > maior)) maior = s;
  }
  return maior || semanaDe(hoje);
}

/** A semana em que "Lançar números da semana" abre quando a pessoa não
 *  escolheu nenhuma: a semana passada, se ainda não tem número; senão, a
 *  desta semana. Nunca a última com número (abrir nela convidava a
 *  sobrescrever números já lançados). */
export function semanaParaLancar(metricas, canalId, hoje) {
  const [atual, passada] = semanasRecentes(hoje, 2);
  if (!atual) return null;
  const temNumero = lista(metricas).some((m) => m?.canalId === canalId && semanaDe(m.semana) === passada);
  return passada && !temNumero ? passada : atual;
}

/** As segundas-feiras que se pode escolher para lançar números: a desta
 *  semana e as anteriores. Semana futura o servidor recusa. */
export function semanasRecentes(hoje, quantas = 8) {
  const atual = semanaDe(hoje);
  if (!atual) return [];
  return Array.from({ length: quantas }, (_, n) => somarDias(atual, -7 * n));
}

/** As semanas que dá para escolher nos Resultados: as que têm número
 *  lançado para o canal, da mais nova para a mais velha, e a desta semana
 *  (mesmo vazia: é nela que se lança). */
export function semanasDoCanal(metricas, canalId, hoje) {
  const fora = new Set();
  const atual = semanaDe(hoje);
  if (atual) fora.add(atual);
  for (const m of lista(metricas)) {
    if (m?.canalId !== canalId) continue;
    const s = semanaDe(m.semana);
    if (s) fora.add(s);
  }
  return [...fora].sort((x, y) => (x < y ? 1 : x > y ? -1 : 0));
}

/** Nome para mostrar de um responsável: a pessoa da lista do RH pelo id;
 *  sem id, o texto antigo. Pessoa com id que não está mais na lista (saiu,
 *  ficou sem CPF) aparece assim, e não com o número dela na tela. */
export function nomeDoResponsavel({ responsavelId, responsavelTexto }, pessoas) {
  if (responsavelId) {
    // Lista ainda chegando (ou o RH fora do ar): o texto antigo, ou só
    // "Responsável". Vazio viraria "Sem responsável", que seria mentira.
    if (!Array.isArray(pessoas)) return responsavelTexto || 'Responsável';
    return pessoas.find((p) => p.idPessoa === responsavelId)?.nome || 'Pessoa fora da lista do RH';
  }
  return responsavelTexto || '';
}

/** O checklist de implantação do canal: itens únicos marcados como
 *  implantação, ativos, na ordem do playbook. Os feitos ficam na lista (com
 *  o check marcado), para a pessoa ver o caminho inteiro e poder desmarcar. */
export function itensDeImplantacao(playbook, canalId) {
  return lista(playbook)
    .filter((i) => i?.canalId === canalId && i.tipo === 'unica' && i.implantacao && i.ativo !== false)
    .map((i, n) => ({ i, n }))
    .sort((x, y) => (Number(x.i.ordem) || 0) - (Number(y.i.ordem) || 0) || x.n - y.n)
    .map(({ i }) => i);
}

/** Rotinas e gatilhos ativos do canal, na ordem do playbook. Ficam só
 *  listados: viram tarefa na agenda na etapa a3. */
export function rotinasDoCanal(playbook, canalId) {
  const ativos = lista(playbook)
    .filter((i) => i?.canalId === canalId && i.ativo !== false)
    .map((i, n) => ({ i, n }))
    .sort((x, y) => (Number(x.i.ordem) || 0) - (Number(y.i.ordem) || 0) || x.n - y.n)
    .map(({ i }) => i);
  return { rotinas: ativos.filter((i) => i.tipo === 'rotina'), gatilhos: ativos.filter((i) => i.tipo === 'gatilho') };
}

/** As publicações mais recentes do canal (as que ainda podem ganhar número),
 *  da data mais nova para a mais velha. */
export function ultimasPublicacoes(publicacoes, canalId, n = 5) {
  return lista(publicacoes)
    .filter((p) => p?.canalId === canalId && !p.retiradaEm)
    .map((p, i) => ({ p, dia: paraDia(p.data) || '', i }))
    .sort((x, y) => (x.dia < y.dia ? 1 : x.dia > y.dia ? -1 : x.i - y.i))
    .slice(0, n)
    .map(({ p }) => p);
}

const MESES_POR_EXTENSO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "2026-10" vira "outubro de 2026". */
export function nomeDoMes(mes) {
  if (!MES_VALIDO(mes)) return '';
  const [a, m] = mes.split('-').map(Number);
  return `${MESES_POR_EXTENSO[m - 1]} de ${a}`;
}

const DIAS_DA_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** "2026-10-12" vira "segunda". Conta em UTC sobre o dia (sem fuso). */
export function diaDaSemana(dia) {
  const d = paraDia(dia);
  if (!d) return '';
  const [a, m, n] = d.split('-').map(Number);
  return DIAS_DA_SEMANA[new Date(Date.UTC(a, m - 1, n)).getUTCDay()];
}

/** O número do WhatsApp da empresa, tirado do link do perfil do canal
 *  WhatsApp (wa.me/<número>, api.whatsapp.com/send?phone=<número> ou só os
 *  dígitos, com ou sem +, espaço e traço). Só dígitos, de 10 a 15. Sem canal
 *  WhatsApp ativo ou sem número que preste, null. */
export function numeroDoWhatsapp(canais) {
  const canal = (canais ?? []).find((c) => c?.codigo === 'whatsapp' && c.ativo !== false);
  const v = String(canal?.urlPerfil ?? '').trim();
  if (!v) return null;
  let bruto = v;
  if (/^https?:\/\//i.test(v)) {
    let u;
    try { u = new URL(v); } catch { return null; }
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'wa.me') bruto = u.pathname.split('/').filter(Boolean)[0] ?? '';
    else if (host === 'api.whatsapp.com' || host === 'web.whatsapp.com') bruto = u.searchParams.get('phone') ?? '';
    else return null;
  } else if (!/^[\d\s()+.-]+$/.test(v)) {
    return null;
  }
  const n = bruto.replace(/\D/g, '');
  return /^\d{10,15}$/.test(n) ? n : null;
}

/** O link do WhatsApp com a mensagem do canal já escrita: abre a conversa
 *  com o número da empresa (o do canal WhatsApp), pronto para ir na bio, no
 *  status ou numa conversa. Sem mensagem ou sem número, não há link: o wa.me
 *  sem número abria a lista de contatos de quem clicava, e o cliente não
 *  chegava ao comercial. */
export function linkWhatsapp(mensagem, numero) {
  const t = String(mensagem ?? '').trim();
  const n = String(numero ?? '').replace(/\D/g, '');
  if (!t || !/^\d{10,15}$/.test(n)) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(t)}`;
}

/** Link que a tela pode abrir: só http(s). Qualquer outra coisa (inclusive
 *  "javascript:") não vira link. */
export const linkSeguro = (v) => (/^https?:\/\/[^\s]+$/i.test(String(v ?? '').trim()) ? String(v).trim() : null);

/** Troca (ou acrescenta) uma linha pelo id. Devolve lista nova; a velha não
 *  é tocada (o React compara por referência). */
export function trocarPorId(lst, linha) {
  const base = lista(lst);
  if (!linha?.id) return base;
  return base.some((x) => x?.id === linha.id) ? base.map((x) => (x?.id === linha.id ? linha : x)) : [...base, linha];
}

/** Os números da semana são um por (canal, semana): a linha nova toma o
 *  lugar da que havia, mesmo se o id mudou (backup restaurado). */
export function trocarMetricas(lst, linha) {
  const base = lista(lst);
  if (!linha?.canalId || !linha.semana) return base;
  return [...base.filter((m) => !(m?.canalId === linha.canalId && m.semana === linha.semana)), linha];
}

/** O que mandar ao servidor para mudar SÓ a situação de uma ação (concluir
 *  na linha do Fazer, ou desfazer). Vai a ação inteira como o servidor
 *  devolveu: a regra do servidor (prepararAcao) confere tudo de novo, e a
 *  versão otimista recusa se outra pessoa mexeu no meio. Os carimbos ficam
 *  fora (o servidor não os aceita do cliente). */
export function acaoComSituacao(acao, status) {
  const { versao: _v, criadoEm: _c, atualizadoEm: _a, migrada: _m, ...resto } = acao;
  return { ...resto, status, orcamentos: lista(acao.orcamentos) };
}
