/* AS CONTAS DOS CANAIS DO MARKETING (etapa a2 do Centro de Comando).
 *
 * Tudo aqui é cálculo puro: recebe o que o servidor mandou e o dia de hoje,
 * devolve o que a tela desenha. Nada de rede, nada de relógio escondido. O
 * `hoje` entra por parâmetro para o teste fixar o dia e para a tela inteira
 * usar o MESMO dia num render (um chip calculado às 23:59 e o vizinho às
 * 00:00 já discordaram uma vez na casa).
 *
 * TRÊS REGRAS QUE ESTE ARQUIVO SEGURA:
 *
 * 1. DIA É TEXTO AAAA-MM-DD, CONTADO EM UTC. `new Date("2026-10-12")` nasce
 *    meia-noite UTC, e em São Paulo isso ainda é dia 11 às 21h: quem lê com
 *    getDate() perde um dia. Por isso a conta de dias aqui é feita com
 *    Date.UTC sobre os três números, e o resultado é igual em qualquer fuso
 *    (o teste roda a mesma conta em São Paulo e em Tóquio para provar).
 *    Timestamp (com "T") é outra coisa: vira o dia LOCAL de quem olha, pela
 *    mesma régua do diaLocalISO de format.js.
 *
 * 2. LISTA QUE NÃO CHEGOU NÃO É LISTA VAZIA. Se as publicações não
 *    carregaram, o indicador devolve null, e não "0 publicações": zero é uma
 *    medida, e a tela não pode afirmar uma medida que não fez.
 *
 * 3. NÚMERO NULO NÃO VIRA ZERO. Alcance não informado é "não sei", e não
 *    "ninguém viu". Ordenar, comparar e variar ignoram o nulo em vez de
 *    tratá-lo como zero.
 */

import { ymdLocal, dataCurta, dataLonga } from '../format.js';

/* A antecedência do âmbar ("vence em até 48h"). O plano prevê essa régua
   editável em painel_mkt_regras, numa etapa seguinte; até lá ela entra por
   parâmetro com este padrão, para a troca ser só passar outro número. */
export const DIAS_AVISO_PADRAO = 2;

/* "Semana" no Fazer é de amanhã até daqui a 7 dias: a mesma régua do
   "Próximos 7 dias" da agenda de Compromissos, para as duas telas nunca
   discordarem sobre a mesma tarefa. */
export const DIAS_SEMANA_FAZER = 7;

const UM_DIA = 86400000;
const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Dia real do calendário (30/02 não passa), entre 2000 e 2100, a mesma
 *  faixa que o servidor aceita. */
export function diaValido(dia) {
  if (typeof dia !== 'string' || !DIA_ISO.test(dia)) return false;
  const [a, m, d] = dia.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return a >= 2000 && a <= 2100 && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Qualquer coisa que pareça uma data vira AAAA-MM-DD, ou null.
 *  - "AAAA-MM-DD" fica como está (é um dia, não um instante);
 *  - timestamp ("...T...") vira o dia local de quem olha;
 *  - Date vira o dia local.
 *  O que não for data devolve null, e null nunca vira "hoje" nem "atrasada". */
export function paraDia(valor) {
  if (valor instanceof Date) return Number.isFinite(valor.getTime()) ? ymdLocal(valor) : null;
  if (typeof valor !== 'string') return null;
  const s = valor.trim();
  if (DIA_ISO.test(s)) return diaValido(s) ? s : null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    if (!Number.isFinite(d.getTime())) return null;
    const dia = ymdLocal(d);
    return diaValido(dia) ? dia : null;
  }
  return null;
}

const emMs = (dia) => {
  const [a, m, d] = dia.split('-').map(Number);
  return Date.UTC(a, m - 1, d);
};

/** Quantos dias de `de` até `ate` (positivo se `ate` vem depois). */
export function diasEntreDias(de, ate) {
  return Math.round((emMs(ate) - emMs(de)) / UM_DIA);
}

/** Soma dias a um dia. O slice do toISOString é seguro AQUI porque a data foi
 *  montada em UTC: não há fuso para deslocar o dia. */
export function somarDias(dia, n) {
  return new Date(emMs(dia) + n * UM_DIA).toISOString().slice(0, 10);
}

/** O dia de São Paulo num instante (o mesmo hojeSP do servidor). */
export function diaEmSaoPaulo(agora = new Date()) {
  return agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

/** O "hoje" da tela do Marketing. A régua é o dia que o servidor mandou com
 *  o painel (é ele quem recusa data "no futuro" e conta as semanas): um
 *  aparelho com a data errada não pinta tarefa de atrasada nem esconde a de
 *  hoje. O relógio do aparelho só serve para a tela virar o dia à meia-noite
 *  sem recarregar, e mesmo assim preso entre o dia do servidor e esse dia
 *  mais os dias que passaram desde a leitura. `passouMs` vem de um relógio
 *  que só anda (performance.now), que mudar a data do aparelho não mexe.
 *  Sem dia do servidor (painel ainda não chegou), vale o dia de São Paulo. */
export function hojeDaTela(hojeServidor, { agora = new Date(), passouMs = 0 } = {}) {
  const local = diaEmSaoPaulo(agora);
  if (!diaValido(hojeServidor)) return local;
  const passou = Number.isFinite(passouMs) && passouMs > 0 ? passouMs : 0;
  const teto = somarDias(hojeServidor, Math.ceil(passou / UM_DIA));
  if (!diaValido(local) || local < hojeServidor) return hojeServidor;
  return local > teto ? teto : local;
}

/** O `hoje` de cada função. Sem parâmetro, é o dia local de agora. Com
 *  parâmetro inválido, quebra alto: um "hoje" errado calado pinta a tela
 *  inteira de vermelho ou de verde, e ninguém desconfia. */
function exigirHoje(hoje) {
  const dia = paraDia(hoje === undefined ? new Date() : hoje);
  if (!dia) throw new TypeError(`"hoje" inválido: ${String(hoje)}`);
  return dia;
}

/** Número que veio do banco ou da tela. Nulo, vazio e lixo devolvem null
 *  (nunca 0). String só se for número de verdade. */
export function numeroOuNulo(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v.trim());
  return null;
}

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/** O prazo curto da linha de tarefa: "hoje", "amanhã", "3 dias atrasada",
 *  "12/11" (e "12/11/2027" quando o ano não é o de hoje, porque 12/11 sozinho
 *  num janeiro é ambíguo). O tom segue a mesma régua do semáforo do canal:
 *  vermelho se passou, âmbar se vence dentro do aviso. */
export function prazoCurto(prazo, hoje, { diasAviso = DIAS_AVISO_PADRAO } = {}) {
  const h = exigirHoje(hoje);
  const p = paraDia(prazo);
  if (!p) return { texto: 'sem prazo', tom: 'neutral', dias: null };
  const dias = diasEntreDias(h, p);
  if (dias < 0) return { texto: `${plural(-dias, 'dia', 'dias')} atrasada`, tom: 'bad', dias };
  const tom = dias <= diasAviso ? 'warn' : 'neutral';
  if (dias === 0) return { texto: 'hoje', tom, dias };
  if (dias === 1) return { texto: 'amanhã', tom, dias };
  return { texto: p.slice(0, 4) === h.slice(0, 4) ? dataCurta(p) : dataLonga(p), tom, dias };
}

/** A central Fazer: separa os itens pelo prazo.
 *  - atrasadas: prazo antes de hoje (a mais antiga primeiro);
 *  - hoje;
 *  - semana: de amanhã até 7 dias;
 *  - proximas: depois disso;
 *  - semData: sem prazo ou com prazo que não é data. Fica num grupo próprio
 *    de propósito: comparar "" < "2026-10-10" como texto dá verdadeiro, e foi
 *    assim que tarefa sem prazo já apareceu como atrasada em outra tela.
 *  NÃO filtra o que está feito: quem chama decide o que é pendente. A linha
 *  concluída precisa continuar no lugar durante o "Desfazer" da LinhaTarefa.
 *  Lista que não chegou (não é array) devolve null, e não cinco grupos vazios
 *  (que a tela leria como "nada a fazer"). */
export function gruposFazer(itens, hoje) {
  if (!Array.isArray(itens)) return null;
  const h = exigirHoje(hoje);
  const grupos = { atrasadas: [], hoje: [], semana: [], proximas: [], semData: [] };
  const comDia = [];
  for (const item of itens) {
    if (!item || typeof item !== 'object') continue;
    const dia = paraDia(item.prazo);
    if (!dia) grupos.semData.push(item);
    else comDia.push({ item, dia });
  }
  // Ordem estável por prazo: no mesmo dia, fica a ordem que o servidor mandou.
  comDia.sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0));
  for (const { item, dia } of comDia) {
    const d = diasEntreDias(h, dia);
    if (d < 0) grupos.atrasadas.push(item);
    else if (d === 0) grupos.hoje.push(item);
    else if (d <= DIAS_SEMANA_FAZER) grupos.semana.push(item);
    else grupos.proximas.push(item);
  }
  return grupos;
}

/** O dia da última publicação que conta: não retirada e não no futuro (uma
 *  publicação agendada para amanhã ainda não tirou o canal do "parado").
 *  - lista que não chegou: undefined (não sei);
 *  - lista sem nenhuma que conte: null (nenhuma publicação lançada). */
export function ultimaPublicacao(publicacoes, hoje) {
  if (!Array.isArray(publicacoes)) return undefined;
  const h = exigirHoje(hoje);
  let ultima = null;
  for (const p of publicacoes) {
    if (!p || p.retiradaEm) continue;
    const dia = paraDia(p.data);
    if (dia && dia <= h && (!ultima || dia > ultima)) ultima = dia;
  }
  return ultima;
}

/** O semáforo do chip. Sempre devolve texto junto da cor (a tela nunca
 *  mostra só a cor). Ordem, do mais grave para o mais leve:
 *  1. atrasada: vermelho, "2 atrasadas". Vence até a implantação: canal em
 *     implantação com prazo estourado precisa gritar, não ficar âmbar;
 *  2. em implantação: âmbar, "em implantação". Vem antes do "parado" porque
 *     canal em implantação ainda não publica, e ficaria vermelho à toa;
 *  3. parado (só quando `contaParado`): vermelho, "parado há 12 dias" quando
 *     passou de `diasParado` (exatamente `diasParado` dias ainda não é
 *     parado: a regra é "há mais que isso"); "sem publicação" quando nenhuma
 *     foi lançada (`ultimaPublicacao` null). Se `ultimaPublicacao` for
 *     undefined (as publicações não carregaram) ou `diasParado` não for um
 *     número válido, o semáforo NÃO julga parado: sem dado não se acusa
 *     ninguém;
 *  4. vence dentro do aviso: âmbar, "vence hoje", "vence amanhã",
 *     "vence em 2 dias";
 *  5. senão: verde, "em dia".
 *  Pendências que não chegaram (não é array) devolvem null: a tela não pinta
 *  de verde um canal cujas tarefas ela não leu. */
export function semaforoCanal(
  { itensPendentes, ultimaPublicacao: ultima, diasParado, emImplantacao, contaParado, diasAviso = DIAS_AVISO_PADRAO } = {},
  hoje
) {
  if (!Array.isArray(itensPendentes)) return null;
  const h = exigirHoje(hoje);
  const dias = itensPendentes
    .map((i) => paraDia(i?.prazo))
    .filter(Boolean)
    .map((p) => diasEntreDias(h, p));
  const atrasadas = dias.filter((d) => d < 0).length;
  if (atrasadas) return { tom: 'bad', texto: plural(atrasadas, 'atrasada', 'atrasadas') };
  if (emImplantacao) return { tom: 'warn', texto: 'em implantação' };
  const lim = numeroOuNulo(diasParado);
  const limite = Number.isInteger(lim) && lim > 0 ? lim : null;
  if (contaParado && limite) {
    // null = nenhuma publicação lançada (fato); undefined ou data estragada =
    // não sei (não julga).
    if (ultima === null) return { tom: 'bad', texto: 'sem publicação' };
    const dia = paraDia(ultima);
    const parado = dia ? diasEntreDias(dia, h) : null;
    if (parado !== null && parado > limite) return { tom: 'bad', texto: `parado há ${plural(parado, 'dia', 'dias')}` };
  }
  const logo = dias.filter((d) => d >= 0 && d <= diasAviso);
  if (logo.length) {
    const d = Math.min(...logo);
    return { tom: 'warn', texto: d === 0 ? 'vence hoje' : d === 1 ? 'vence amanhã' : `vence em ${d} dias` };
  }
  return { tom: 'ok', texto: 'em dia' };
}

/** O número do chip: publicações dos últimos 7 dias (hoje e os 6 anteriores)
 *  contra os 7 dias antes disso. `variacao` é a DIFERENÇA em publicações (com
 *  número pequeno, "+2" diz mais que "+66%", e não divide por zero).
 *  Retiradas e agendadas para depois de hoje não contam.
 *  Lista que não chegou devolve null (o chip não mostra "0"). Lista vazia é
 *  medida de verdade: 0 contra 0. */
export function indicadorCanal(publicacoes, hoje) {
  if (!Array.isArray(publicacoes)) return null;
  const h = exigirHoje(hoje);
  let valor = 0;
  let anterior = 0;
  for (const p of publicacoes) {
    if (!p || p.retiradaEm) continue;
    const dia = paraDia(p.data);
    if (!dia) continue;
    const d = diasEntreDias(h, dia);
    if (d <= 0 && d >= -6) valor += 1;
    else if (d <= -7 && d >= -13) anterior += 1;
  }
  return { valor, anterior, variacao: valor - anterior, rotulo: 'publicações nos últimos 7 dias' };
}

/** Os campos que dão "top": os dois que a especificação pede. */
export const CAMPOS_TOP = ['engajamento', 'leads'];

/** As melhores publicações por engajamento ou por leads. Quem não tem o
 *  número informado fica FORA (nulo não é zero: não pode aparecer como a
 *  pior nem empurrar ninguém). Zero informado entra, porque é medida.
 *  Empate: a mais recente primeiro. Lista que não chegou devolve null. */
export function topPublicacoes(publicacoes, campo, n = 5) {
  if (!CAMPOS_TOP.includes(campo)) throw new TypeError(`Campo de ordenação inválido: ${String(campo)}`);
  if (!Array.isArray(publicacoes)) return null;
  const quantos = Number.isInteger(n) && n > 0 ? n : 0;
  return publicacoes
    .filter((p) => p && !p.retiradaEm && numeroOuNulo(p[campo]) !== null)
    .map((p, i) => ({ p, v: numeroOuNulo(p[campo]), dia: paraDia(p.data) || '', i }))
    .sort((a, b) => b.v - a.v || (a.dia < b.dia ? 1 : a.dia > b.dia ? -1 : 0) || a.i - b.i)
    .slice(0, quantos)
    .map((x) => x.p);
}

/** A segunda-feira da semana do dia (a semana do lançamento semanal começa na
 *  segunda, como a chave `semana` da tabela). Domingo pertence à semana que
 *  começou seis dias antes. Data inválida devolve null. */
export function semanaDe(data) {
  const dia = paraDia(data);
  if (!dia) return null;
  const diaDaSemana = new Date(emMs(dia)).getUTCDay(); // 0 = domingo
  return somarDias(dia, -((diaDaSemana + 6) % 7));
}

/** Os números do lançamento semanal, com o rótulo que a tela mostra. A lista
 *  é a das colunas da tabela painel_mkt_metricas_canal: mudar aqui é mudar o
 *  banco, por isso fica no código. */
export const CAMPOS_METRICAS = [
  { campo: 'seguidores', rotulo: 'Seguidores' },
  { campo: 'alcance', rotulo: 'Alcance' },
  { campo: 'impressoes', rotulo: 'Impressões' },
  { campo: 'engajamento', rotulo: 'Engajamento' },
  { campo: 'cliques', rotulo: 'Cliques' },
  { campo: 'conversas', rotulo: 'Conversas' },
  { campo: 'leads', rotulo: 'Leads' },
];

/** A semana pedida contra a anterior, número a número.
 *  `metricas` são as linhas de UM canal; `semana` pode ser qualquer dia (vira
 *  a segunda-feira dele). Para cada campo:
 *  - atual e anterior: o número lançado, ou null se não foi informado;
 *  - diferenca: atual menos anterior, só quando os dois existem;
 *  - variacao: a fração (0,25 = subiu 25%), só quando os dois existem e o
 *    anterior não é zero (de 0 para 10 não é "infinito por cento").
 *  Lista que não chegou ou semana inválida devolvem null. */
export function compararSemanas(metricas, semana) {
  if (!Array.isArray(metricas)) return null;
  const s = semanaDe(semana);
  if (!s) return null;
  const a = somarDias(s, -7);
  // A tabela tem uma linha por semana; se vierem duas (cópia velha), vale a
  // de coleta mais recente.
  const achar = (alvo) =>
    metricas
      .filter((m) => m && semanaDe(m.semana) === alvo)
      .sort((x, y) => String(y.coletadoEm || '').localeCompare(String(x.coletadoEm || '')))[0] || null;
  const atual = achar(s);
  const anterior = achar(a);
  const numeros = CAMPOS_METRICAS.map(({ campo, rotulo }) => {
    const x = numeroOuNulo(atual?.[campo]);
    const y = numeroOuNulo(anterior?.[campo]);
    const diferenca = x !== null && y !== null ? x - y : null;
    const variacao = diferenca !== null && y !== 0 ? diferenca / y : null;
    return { campo, rotulo, atual: x, anterior: y, diferenca, variacao };
  });
  return { semana: s, semanaAnterior: a, atual, anterior, numeros };
}

const ORIGEM = {
  manual: 'Lançado à mão',
  csv: 'Importado de CSV',
  api: 'Lido automaticamente',
};

/** A legenda de todo número: de onde veio e de quando ("Lançado à mão em
 *  12/10"). O dia é o LOCAL de quem olha: coletado às 22h30 de 12/10 em São
 *  Paulo é 01h30 de 13/10 em UTC, e a legenda tem de dizer 12/10. Ano
 *  diferente do de hoje aparece por extenso. */
export function fonteDoNumero({ fonte, coletadoEm } = {}, hoje) {
  const origem = ORIGEM[fonte] || 'Origem não informada';
  const dia = paraDia(coletadoEm);
  if (!dia) return origem;
  const h = exigirHoje(hoje);
  return `${origem} em ${dia.slice(0, 4) === h.slice(0, 4) ? dataCurta(dia) : dataLonga(dia)}`;
}
