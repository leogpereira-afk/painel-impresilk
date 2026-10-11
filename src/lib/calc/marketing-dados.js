/* A SUB-ABA "DADOS" DO CANAL: AS PEÇAS COMUNS (integrações, 11/10/2026).
 *
 * O canal aberto (?v=<canal>&sub=dados) mostra TODO o "dados" que as fontes
 * mandam (a ação "fontes", formato da seção FORMATO de cada conector em
 * supabase/functions/_shared/mkt-fontes/<fonte>.mjs), em quadros compactos e
 * recolhíveis. Este arquivo tem o que todos os quadros dividem; o que cada
 * fonte mostra mora em marketing-dados-<fonte>.js, e quem escolhe o quadro de
 * cada ligação canal-fonte é marketing-dados-canal.js.
 *
 * O QUADRO É DADO, NÃO DESENHO. Cada função de fonte devolve objetos simples
 * (o "Quadro" abaixo) com o texto JÁ FORMATADO; a tela (components/marketing/
 * dados/) só desenha. Assim o teste prova, sem abrir navegador, que o número
 * não medido aparece como "não medido" (ou o traço da casa na tabela) e nunca
 * como 0, e que nenhum link perigoso vira link.
 *
 *   Quadro = { id, titulo, rotuloFonte, legenda, estado, temDado, destaque,
 *              topo: [Bloco], secoes: [Secao], notas: [texto], vazio }
 *   Secao  = { id, titulo, resumo, aberta, blocos: [Bloco] }
 *   Bloco  = { tipo: 'numeros', titulo, itens: [Numero] }
 *          | { tipo: 'grafico', titulo, pontos: [{ x, rotulo, y, texto, fraco }], resumo }
 *          | { tipo: 'tabela', titulo, colunas: [{ id, rotulo, alinhar }], linhas: [{ id, celulas }], total, limite, nota }
 *          | { tipo: 'pares', itens: [{ rotulo, texto, link, vazio }] }
 *          | { tipo: 'lista', itens: [{ id, titulo, sub, texto, tom, link }] }
 *          | { tipo: 'barras', titulo, itens: [{ rotulo, texto, fracao }] }
 *          | { tipo: 'texto', texto, tom }
 *          | { tipo: 'avisos', itens: [{ nivel, texto }] }
 *   Numero = { id, rotulo, texto, titulo, vazio, nota: { texto, antes, tom, direcao } | null }
 *   Celula = { texto, titulo, vazio, link, tom, marca }
 *
 * TRÊS REGRAS:
 *  1. NULO NÃO VIRA ZERO. Soma de lista onde ninguém mediu é null (somaDisponivel);
 *     o total de um dia que perdeu uma das partes é null (somaEstrita). O
 *     número de quadro vazio diz "não medido"; a célula de tabela mostra o
 *     traço de dado ausente da casa (components/lista.jsx), com "não medido"
 *     no title.
 *  2. TODO TEXTO VEM DE FORA (o HTML do site, o título do post, o nome da
 *     campanha): a tela escreve como texto (o React escapa) e link só sai do
 *     linkSeguro (http ou https absoluto).
 *  3. O ESTADO VEM ANTES DO NÚMERO. Parte que não está ok mostra o estado,
 *     com a frase do que fazer, em vez de números vazios; o dado velho que o
 *     cache ainda guarda aparece embaixo, com a data dele.
 */
import {
  NAO_MEDIDO,
  ROTULO_FONTE,
  estadoDeAntesDaConexao,
  fmtDataHora,
  fmtDecimal,
  fmtDuracao,
  fmtFaixa,
  fmtMoeda,
  fmtMs,
  fmtNumero,
  fmtPercentual,
  fmtPorcento,
  infoEstado,
  legendaDaColeta,
  motivoLegivel,
  rotuloParte,
} from './marketing-fontes.js';
import { diaValido, numeroOuNulo, paraDia } from './marketing-canais.js';
import { dataCurta, dataLonga } from '../format.js';
import { linkSeguro } from '../../components/marketing/derivar.js';

export { NAO_MEDIDO, linkSeguro };

/** O traço de dado ausente da casa (components/lista.jsx: "Dado ausente é
 *  travessão, nunca N/A, null nem R$ 0"). Só em célula de tabela, com o
 *  "não medido" no title; frase nunca leva travessão. */
export const AUSENTE = '\u2014';
export const NAO_INFORMADO = 'não informado';

export const objeto = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
export const lista = (x) => (Array.isArray(x) ? x : []);
export const medida = (v) => numeroOuNulo(v);

/** Texto que veio de fora, aparado e com teto; vazio é null. */
export function texto(v, max = 300) {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t ? (t.length > max ? `${t.slice(0, max - 1)}…` : t) : null;
}

const plural = (n, um, varios) => `${fmtNumero(n)} ${n === 1 ? um : varios}`;
export { plural };

/** Uma lista de textos de fora numa linha só ("a, b, c"), com teto; lista
 *  vazia ou ausente é null (a célula mostra o traço, nunca "nenhum"
 *  inventado: quem chama decide se a lista vazia é "nenhum"). */
export function juntar(itens, { max = 400, rotular = (x) => x } = {}) {
  const l = lista(itens).map((x) => texto(rotular(x), 200)).filter(Boolean);
  return l.length ? texto(l.join(', '), max) : null;
}

/* ------------------------------------------------------------- somas -- */

/** Soma do que foi medido. Nada medido devolve null (e não 0): uma semana em
 *  que o canal não apareceu é ausência, a soma de vinte ausências também. */
export function somaDisponivel(valores) {
  let s = null;
  for (const v of lista(valores)) {
    const n = medida(v);
    if (n !== null) s = (s ?? 0) + n;
  }
  return s;
}

/** Soma que só vale com TODAS as parcelas medidas (as quatro visualizações
 *  do Perfil da Empresa num dia): uma faltando, o total é null, porque a
 *  soma parcial passaria por total. */
export function somaEstrita(valores) {
  const l = lista(valores);
  if (!l.length) return null;
  let s = 0;
  for (const v of l) {
    const n = medida(v);
    if (n === null) return null;
    s += n;
  }
  return s;
}

/** a ÷ b, com nulo e zero no divisor devolvendo null. */
export function razao(a, b) {
  const x = medida(a), y = medida(b);
  if (x === null || y === null || y === 0) return null;
  return x / y;
}

/** Ordena por um campo, do maior para o menor, com o não medido no fim. */
export function ordenar(linhas, campo, { crescente = false } = {}) {
  const valor = typeof campo === 'function' ? campo : (l) => l?.[campo];
  return [...lista(linhas)].sort((a, b) => {
    const x = medida(valor(a)), y = medida(valor(b));
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return crescente ? x - y : y - x;
  });
}

/** Junta linhas pela chave (o mesmo canal do GA4 em várias semanas), somando
 *  os campos com somaDisponivel. `extra(primeira)` copia os campos de texto
 *  da primeira linha do grupo. A ordem é a da primeira aparição. */
export function agrupar(linhas, chave, campos, extra = () => ({})) {
  const pegar = typeof chave === 'function' ? chave : (l) => l?.[chave];
  const grupos = new Map();
  for (const l of lista(linhas)) {
    if (!objeto(l)) continue;
    const k = pegar(l);
    if (k == null || k === '') continue;
    if (!grupos.has(k)) grupos.set(k, { primeira: l, linhas: [] });
    grupos.get(k).linhas.push(l);
  }
  return [...grupos.entries()].map(([k, g]) => ({
    chave: k,
    ...extra(g.primeira),
    ...Object.fromEntries(campos.map((c) => [c, somaDisponivel(g.linhas.map((l) => l[c]))])),
    semanas: g.linhas.length,
  }));
}

/** O mapa {chave: n} da API numa linha ("curtir 26, amei 4"), do maior para
 *  o menor. Chave sem número fica de fora (não vira 0); mapa vazio ou
 *  ausente é null. */
export function textoDoMapa(mapa, { rotular = (k) => k, tipo = 'int', moeda, max = 400 } = {}) {
  if (!objeto(mapa)) return null;
  const itens = ordenar(
    Object.entries(mapa).map(([k, v]) => ({ k, v: medida(v) })).filter((x) => x.v !== null),
    'v'
  );
  return itens.length ? texto(itens.map((x) => `${rotular(x.k)} ${formatar(tipo, x.v, { moeda })}`).join(', '), max) : null;
}

/** Soma os mapas {chave: n} (as ações da Meta, os eventos do Pixel). */
export function somarMapas(mapas) {
  const total = new Map();
  for (const m of lista(mapas)) {
    if (!objeto(m)) continue;
    for (const [k, v] of Object.entries(m)) {
      const n = medida(v);
      if (n === null) continue;
      total.set(k, (total.get(k) ?? 0) + n);
    }
  }
  return [...total.entries()].map(([chave, valor]) => ({ chave, valor }));
}

/** As duas últimas linhas que servem para comparar (a semana fechada mais
 *  nova e a de antes), pela chave de data. `serve` filtra (semana fechada,
 *  semana madura). Devolve {atual, anterior} (cada um pode ser null). */
export function ultimasDuas(linhas, chave = 'semana', serve = () => true) {
  const l = lista(linhas).filter((x) => objeto(x) && typeof x[chave] === 'string' && serve(x));
  l.sort((a, b) => a[chave].localeCompare(b[chave]));
  return { atual: l[l.length - 1] ?? null, anterior: l[l.length - 2] ?? null };
}

/* ------------------------------------------------------------- textos -- */

/* As datas chegam em quatro formas: "2026-10-08" (dia), "2026-10-08T14:00:00Z"
   e "2026-10-08T14:00:00+0000" (instante; a Meta manda o fuso sem os dois
   pontos, que o Safari não lê) e "2026-10-07 16:20:00" (o Google Ads manda a
   hora no fuso da conta, sem fuso nenhum). LER_DATA separa as partes. */
const LER_DATA = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?)?$/i;

/** O instante com fuso no formato que todo navegador lê, ou null. */
function isoComFuso(dia, h, m, fuso) {
  const f = fuso.toUpperCase() === 'Z' ? 'Z' : fuso.includes(':') ? fuso : `${fuso.slice(0, 3)}:${fuso.slice(3)}`;
  return `${dia}T${h}:${m}:00${f}`;
}

/** O dia de uma data em qualquer das quatro formas: o dia que veio (sem
 *  fuso, é o dia da conta) ou o dia local do instante. Lixo é null. */
export function diaDe(v) {
  if (v instanceof Date) return paraDia(v);
  if (typeof v !== 'string') return null;
  const m = LER_DATA.exec(v.trim());
  if (!m) return null;
  const [, dia, h, min, fuso] = m;
  if (!diaValido(dia)) return null;
  if (!h || !fuso) return dia;
  return paraDia(isoComFuso(dia, h, min, fuso));
}

/** O dia para gente: "10/08", com o ano quando não é o de `hoje`. */
export function rotuloDia(v, hoje) {
  const dia = diaDe(v);
  if (!dia) return null;
  const h = paraDia(hoje);
  return h && h.slice(0, 4) === dia.slice(0, 4) ? dataCurta(dia) : dataLonga(dia);
}

/** O instante para gente: "08/10 às 11:00" no fuso de quem olha; sem fuso
 *  (Google Ads), a hora como veio; só o dia, só o dia. */
export function rotuloInstante(v, hoje) {
  if (typeof v !== 'string') return null;
  const m = LER_DATA.exec(v.trim());
  if (!m || !diaValido(m[1])) return null;
  const [, dia, h, min, fuso] = m;
  if (!h) return rotuloDia(dia, hoje);
  if (!fuso) return `${rotuloDia(dia, hoje)} às ${h}:${min}`;
  return fmtDataHora(isoComFuso(dia, h, min, fuso), hoje, { vazio: null });
}

/** "de 10/08 a 10/10" (ou só uma ponta, quando a outra faltou). */
export function rotuloPeriodo(de, ate, hoje) {
  const a = rotuloDia(de, hoje), b = rotuloDia(ate, hoje);
  if (a && b) return `de ${a} a ${b}`;
  if (a) return `desde ${a}`;
  if (b) return `até ${b}`;
  return null;
}

/** O nome que vem em código da API (ENABLED, MOBILE, AGE_RANGE_25_34): o que
 *  a tabela conhece vira palavra; o que não conhece aparece como veio (um
 *  código novo não some calado). */
export function traduzir(mapa, v) {
  if (v == null || v === '') return null;
  const k = String(v);
  return Object.hasOwn(mapa, k) ? mapa[k] : k;
}

/* ------------------------------------------------------- formatação -- */

/** A parcela de impressões GANHA do Google Ads ({valor, menosDe10} do
 *  conector, ou a fração pura). O Google informa de 10% a 100% e manda
 *  0,0999 para dizer "abaixo de 10%" sem dizer quanto: abaixo de 0,1 a tela
 *  escreve "menos de 10%", nunca "10%" (o arredondamento de 0,0999) nem
 *  "9,99%", mesmo quando a marca do conector não veio. Nulo é `vazio`. */
export function textoParcela(p, { vazio = NAO_MEDIDO } = {}) {
  const obj = objeto(p);
  if (obj && p.menosDe10 === true) return 'menos de 10%';
  const v = medida(obj ? p.valor : p);
  if (v === null) return vazio;
  if (v < 0.1) return 'menos de 10%';
  return fmtPercentual(v, { casas: 0, vazio });
}

/** A parcela PERDIDA ({valor, maisDe90}, por orçamento ou classificação): o
 *  Google informa de 0% a 90% e manda 0,9001 para "acima de 90%". Abaixo
 *  disso o número vale como veio (perder 5% é 5%). */
export function textoPerdida(p, { vazio = NAO_MEDIDO } = {}) {
  const obj = objeto(p);
  if (obj && p.maisDe90 === true) return 'mais de 90%';
  const v = medida(obj ? p.valor : p);
  if (v === null) return vazio;
  if (v > 0.9) return 'mais de 90%';
  return fmtPercentual(v, { casas: 0, vazio });
}

/* Os tipos de célula e de número. `vazio` é o que aparece no lugar do nulo:
   o traço na tabela, "não medido" no número grande. */
const FORMATOS = {
  int: (v, o) => fmtNumero(v, { vazio: o.vazio }),
  num2: (v, o) => fmtNumero(v, { casas: 2, vazio: o.vazio }),
  dec1: (v, o) => fmtDecimal(v, { casas: 1, vazio: o.vazio }),
  dec2: (v, o) => fmtDecimal(v, { casas: 2, vazio: o.vazio }),
  dec3: (v, o) => fmtDecimal(v, { casas: 3, vazio: o.vazio }),
  moeda: (v, o) => fmtMoeda(v, { moeda: o.moeda || 'BRL', vazio: o.vazio }),
  fracao: (v, o) => fmtPercentual(v, { casas: o.casas ?? 1, vazio: o.vazio }),
  pct: (v, o) => fmtPorcento(v, { casas: o.casas ?? 1, vazio: o.vazio }),
  dur: (v, o) => fmtDuracao(v, { vazio: o.vazio }),
  // Tempo somado em milissegundos (o tempo total assistido): de um minuto
  // para cima em horas, minutos e segundos (e não "2.440 s"); abaixo, em
  // milissegundos e segundos, sem arredondar 440 ms para "0 s".
  durms: (v, o) => (medida(v) === null ? o.vazio : medida(v) < 60_000 ? fmtMs(v, { vazio: o.vazio }) : fmtDuracao(medida(v) / 1000, { vazio: o.vazio })),
  ms: (v, o) => fmtMs(v, { vazio: o.vazio }),
  horas: (v, o) => (medida(v) === null ? o.vazio : `${fmtDecimal(v, { casas: 1 })} h`),
  parcela: (v, o) => textoParcela(v, { vazio: o.vazio }),
  perdida: (v, o) => textoPerdida(v, { vazio: o.vazio }),
  faixa: (v, o) => fmtFaixa(v, { vazio: o.vazio }),
  texto: (v, o) => texto(v, o.max ?? 300) ?? o.vazio,
  dia: (v, o) => rotuloDia(v, o.hoje) ?? o.vazio,
  instante: (v, o) => rotuloInstante(v, o.hoje) ?? o.vazio,
  sim: (v, o) => (v === true ? 'sim' : v === false ? 'não' : o.vazio),
};
const NUMERICOS = new Set(['int', 'num2', 'dec1', 'dec2', 'dec3', 'moeda', 'fracao', 'pct', 'dur', 'durms', 'ms', 'horas', 'parcela', 'perdida']);
export const ehNumerico = (tipo) => NUMERICOS.has(tipo);

/** O valor formatado; `vazio` é o que volta quando não há o que formatar. */
export function formatar(tipo, v, opcoes = {}) {
  const f = FORMATOS[tipo] || FORMATOS.texto;
  return f(v, { vazio: NAO_MEDIDO, ...opcoes });
}

/** Está vazio para este tipo? (número não medido, texto ausente, sim/não
 *  desconhecido). */
export function estaVazio(tipo, v) {
  return formatar(tipo, v, { vazio: null }) === null;
}

/** Uma célula de tabela: o traço quando vazio, com "não medido" (número) ou
 *  "não informado" (texto) no title. `numerico` força a régua do número
 *  numa coluna de texto ("menos de 15" pessoas). */
export function celula(tipo, v, opcoes = {}) {
  const vazio = estaVazio(tipo, v);
  const t = vazio ? AUSENTE : formatar(tipo, v, opcoes);
  const c = { texto: t, vazio };
  if (vazio) c.titulo = (opcoes.numerico ?? ehNumerico(tipo)) ? NAO_MEDIDO : NAO_INFORMADO;
  else if (opcoes.titulo) c.titulo = opcoes.titulo;
  if (opcoes.link) {
    const link = linkSeguro(opcoes.link);
    if (link) c.link = link;
  }
  if (opcoes.tom) c.tom = opcoes.tom;
  if (opcoes.marca) c.marca = opcoes.marca;
  return c;
}

/* ----------------------------------------------------------- números -- */

// Tipos em que a diferença é dita em pontos (taxa, posição) e não em %.
const EM_PONTOS = new Set(['fracao', 'pct', 'dec1', 'dec2', 'dec3']);

/** A comparação com o período anterior: {texto, antes, tom, direcao}.
 *  - um dos dois não medido: sem seta, só "antes: ...";
 *  - taxa e posição: a diferença em pontos ("+0,4 p.p.", "-0,9");
 *  - contagem e dinheiro: a variação em % (com o anterior zero, a diferença
 *    absoluta, porque "de 0 para 5" não tem porcentagem).
 *  `subirE`: 'bom' (mais é melhor), 'ruim' (posição, rejeição, custo) ou
 *  'neutro' (gasto: subir não é bom nem ruim por si). */
export function comparacao(tipo, atual, anterior, { subirE = 'bom', moeda, rotuloAntes = 'antes' } = {}) {
  const a = medida(atual), b = medida(anterior);
  const antes = `${rotuloAntes}: ${formatar(tipo, anterior, { moeda, vazio: NAO_MEDIDO })}`;
  if (a === null || b === null) return { texto: null, antes, tom: 'neutral', direcao: null };
  const d = a - b;
  const direcao = Math.abs(d) < 1e-9 ? 'igual' : d > 0 ? 'sobe' : 'desce';
  const tom = direcao === 'igual' || subirE === 'neutro' ? 'neutral' : (direcao === 'sobe') === (subirE === 'bom') ? 'ok' : 'bad';
  let t;
  if (direcao === 'igual') t = 'igual';
  else if (EM_PONTOS.has(tipo)) {
    const casas = tipo === 'dec2' || tipo === 'dec3' ? 2 : 1;
    const valor = tipo === 'fracao' ? d * 100 : d;
    const n = fmtDecimal(Math.abs(valor), { casas });
    t = `${d > 0 ? '+' : '-'}${n}${tipo === 'fracao' || tipo === 'pct' ? ' p.p.' : ''}`;
  } else if (b === 0) t = `${d > 0 ? '+' : '-'}${formatar(tipo, Math.abs(d), { moeda })}`;
  else {
    const f = d / Math.abs(b);
    t = fmtPercentual(f, { casas: Math.abs(f) < 0.1 ? 1 : 0, sinal: true });
  }
  return { texto: t, antes, tom, direcao };
}

/** Um número grande do quadro. `anterior` (quando existe a chave) liga a
 *  comparação; `titulo` é o texto exato que vai no title. */
export function numero({ id, rotulo, tipo = 'int', valor, anterior, subirE = 'bom', moeda, hoje, titulo, rotuloAntes } = {}) {
  const vazio = estaVazio(tipo, valor);
  const t = formatar(tipo, valor, { moeda, hoje, vazio: NAO_MEDIDO });
  const n = { id: id || rotulo, rotulo, texto: t, vazio, titulo: titulo ? `${rotulo}: ${t}. ${titulo}` : `${rotulo}: ${t}`, nota: null };
  if (anterior !== undefined) n.nota = comparacao(tipo, valor, anterior, { subirE, moeda, rotuloAntes });
  return n;
}

/* ------------------------------------------------------------ blocos -- */

export const blocoNumeros = (itens, titulo = null) => ({ tipo: 'numeros', titulo, itens: lista(itens).filter(Boolean) });
export const blocoTexto = (t, tom = 'neutral') => ({ tipo: 'texto', texto: t, tom });
/** Os avisos de um quadro ({nivel, texto}); sem aviso nenhum, nada (null). */
export function blocoAvisos(itens) {
  const l = lista(itens).filter((a) => a && a.texto);
  return l.length ? { tipo: 'avisos', itens: l } : null;
}

/** Os pares rótulo: valor ("Fuso: America/Sao_Paulo"). `vazio` diz
 *  "não informado"; link só pelo linkSeguro. Par sem rótulo sai. */
export function blocoPares(itens) {
  return {
    tipo: 'pares',
    itens: lista(itens)
      .filter((p) => p && p.rotulo)
      .map((p) => {
        const tipo = p.tipo || 'texto';
        const vazio = estaVazio(tipo, p.valor);
        const out = { rotulo: p.rotulo, texto: vazio ? (ehNumerico(tipo) ? NAO_MEDIDO : NAO_INFORMADO) : formatar(tipo, p.valor, p), vazio };
        const link = p.link ? linkSeguro(p.link) : null;
        if (link) out.link = link;
        return out;
      }),
  };
}

/** Barras deitadas (demografia, distribuição): cada item {rotulo, valor},
 *  a fração em relação ao maior. Valor não medido fica sem barra e com o
 *  "não medido" no lugar do número. */
export function blocoBarras(itens, { tipo = 'int', titulo = null, moeda, total = null } = {}) {
  const l = lista(itens).filter((i) => i && i.rotulo != null);
  const max = Math.max(0, ...l.map((i) => medida(i.valor) ?? 0));
  const soma = total ?? null;
  return {
    tipo: 'barras',
    titulo,
    itens: l.map((i) => {
      const v = medida(i.valor);
      const parte = soma && v !== null ? ` (${fmtPercentual(v / soma, { casas: 0 })})` : '';
      return {
        rotulo: String(i.rotulo),
        texto: v === null ? NAO_MEDIDO : `${formatar(tipo, v, { moeda })}${parte}`,
        fracao: v === null || max === 0 ? null : v / max,
      };
    }),
  };
}

/** Coluna de tabela. `valor(linha)` pega o dado (padrão: linha[id]); `link`,
 *  `tom`, `marca` e `titulo` são funções da linha. */
export function col(id, rotulo, tipo = 'texto', opcoes = {}) {
  const numerico = opcoes.numerico ?? ehNumerico(tipo);
  return { id, rotulo, tipo, valor: opcoes.valor || ((l) => l?.[id]), ...opcoes, numerico, alinhar: numerico ? 'dir' : 'esq' };
}

/** A tabela pronta: o texto de cada célula já formatado. `limite` é quantas
 *  linhas aparecem antes do "Ver todas" (o resto continua na tabela, a tela
 *  só esconde). */
export function blocoTabela(linhas, colunas, { limite = 10, chave = null, nota = null, hoje, moeda, titulo = null } = {}) {
  const l = lista(linhas).filter((x) => x != null);
  return {
    tipo: 'tabela',
    // O título só vai na tabela que divide a seção com outra (a seção já
    // tem o nome dela).
    titulo,
    colunas: colunas.map((c) => ({ id: c.id, rotulo: c.rotulo, alinhar: c.alinhar })),
    linhas: l.map((linha, i) => ({
      id: String((chave && (typeof chave === 'function' ? chave(linha, i) : linha?.[chave])) ?? i),
      celulas: colunas.map((c) =>
        celula(c.tipo, c.valor(linha), {
          hoje,
          moeda: c.moeda ?? moeda,
          max: c.max,
          casas: c.casas,
          numerico: c.numerico,
          link: c.link ? c.link(linha) : null,
          tom: c.tom ? c.tom(linha) : null,
          marca: c.marca ? c.marca(linha) : null,
          titulo: c.titulo ? c.titulo(linha) : null,
        })
      ),
    })),
    total: l.length,
    limite,
    nota,
  };
}

/** Uma seção (o pedaço recolhível de dentro do quadro). */
export function secao(id, titulo, blocos, { resumo = null, aberta = false } = {}) {
  return { id, titulo, resumo, aberta, blocos: lista(blocos).filter(Boolean) };
}

/** Seção de uma tabela só, com as três situações ditas: lista null (a fonte
 *  não mediu: "não medido" ou o texto de `semDado`), lista vazia (medida e
 *  vazia: `vazio`), e a tabela. O resumo padrão é a contagem de linhas. */
export function secaoTabela(id, titulo, linhas, colunas, opcoes = {}) {
  const { resumo, aberta = false, vazio = 'Nenhuma linha.', semDado = 'Não medido nesta coleta.', antes = [], depois = [], unidade = ['linha', 'linhas'] } = opcoes;
  if (!Array.isArray(linhas)) return secao(id, titulo, [...antes, blocoTexto(semDado), ...depois], { resumo: resumo ?? 'não medido', aberta });
  // Lista medida e vazia é um zero medido: "0 países" (e a frase de `vazio`).
  if (!linhas.length) return secao(id, titulo, [...antes, blocoTexto(vazio), ...depois], { resumo: resumo ?? plural(0, unidade[0], unidade[1]), aberta });
  return secao(id, titulo, [...antes, blocoTabela(linhas, colunas, opcoes), ...depois], {
    resumo: resumo ?? plural(linhas.length, unidade[0], unidade[1]),
    aberta,
  });
}

/** O gráfico de barras pequeno: pontos {x, rotulo, y, texto, fraco}. y nulo
 *  é "não medido" (a tela desenha a marca de ausência, nunca uma barra
 *  zerada). `resumo` é a frase para o leitor de tela. */
export function blocoGrafico(linhas, { x, y, titulo, tipo = 'int', unidade = '', hoje, moeda, fraco = () => false } = {}) {
  const pegarX = typeof x === 'function' ? x : (l) => l?.[x];
  const pegarY = typeof y === 'function' ? y : (l) => l?.[y];
  const pontos = lista(linhas)
    .filter((l) => objeto(l) && typeof pegarX(l) === 'string')
    .map((l) => {
      const valor = medida(pegarY(l));
      const rot = rotuloDia(pegarX(l), hoje) ?? pegarX(l);
      return {
        x: pegarX(l),
        rotulo: rot,
        y: valor,
        texto: `${rot}: ${valor === null ? NAO_MEDIDO : `${formatar(tipo, valor, { moeda })}${unidade ? ` ${unidade}` : ''}`}`,
        fraco: !!fraco(l),
      };
    })
    .sort((a, b) => a.x.localeCompare(b.x));
  if (!pontos.length || pontos.every((p) => p.y === null)) return null;
  const medidos = pontos.filter((p) => p.y !== null);
  const maior = medidos.reduce((m, p) => (p.y > m.y ? p : m), medidos[0]);
  const ultimo = medidos[medidos.length - 1];
  const faltam = pontos.length - medidos.length;
  const resumo = `${titulo}, ${rotuloPeriodo(pontos[0].x, pontos[pontos.length - 1].x, hoje) ?? ''}: o maior foi ${maior.texto}; o último medido, ${ultimo.texto}.${faltam ? ` ${plural(faltam, 'ponto', 'pontos')} sem medida.` : ''}`;
  return { tipo: 'grafico', titulo, pontos, resumo };
}

/* ------------------------------------------------------------ estado -- */

// Estados que o servidor decide AGORA por cima do que a coleta gravou (sem
// os secrets, sem a conexão) e o que a tela calcula (conexão mais nova que a
// coleta): valem para a fonte inteira, e o motivo guardado da parte é velho.
const POR_CIMA = new Set(['falta_configurar', 'falta_conectar', 'aguardando_coleta']);
// Os estados em que a parte tem dado desta coleta.
export const COM_DADO = new Set(['ok', 'parcial']);
// Do que mais pede ação ao que menos pede (o pior estado entre as partes de
// um quadro é o que ele mostra).
const PIOR_PRIMEIRO = ['reconectar', 'erro', 'falta_conectar', 'falta_configurar', 'aguardando_aprovacao', 'aguardando_coleta', 'parcial', 'ok'];

/** O motivo de uma parte, nas duas formas que o servidor manda: a frase em
 *  `motivo` (com o código curto em `codigo`, revisão 2 dos conectores) ou,
 *  no formato de antes, o código em `motivo`. Devolve {texto, codigo}: texto
 *  é a frase para gente (ou null, quando só veio um código que esta tela não
 *  conhece). O código NUNCA vai para a tela (nem no title): serve só para
 *  separar um caso do outro. */
export function motivoDaParte(p) {
  if (!objeto(p)) return { texto: null, codigo: null };
  const bruto = typeof p.motivo === 'string' ? p.motivo.trim() : '';
  const codigo = texto(p.codigo, 80) ?? (bruto && !/\s/.test(bruto) ? bruto.slice(0, 80) : null);
  return { texto: motivoLegivel(bruto) ?? motivoLegivel(p.codigo), codigo };
}

const instante = (v) => (typeof v === 'string' && v ? Date.parse(v) : NaN);
const extremo = (datas, maisNova) => {
  const ok = datas.filter((d) => Number.isFinite(instante(d)));
  if (!ok.length) return null;
  return ok.reduce((m, d) => ((maisNova ? instante(d) > instante(m) : instante(d) < instante(m)) ? d : m), ok[0]);
};

const NAO_LIDO = Object.freeze({ chave: 'nao_lido', rotulo: 'Não lido', tom: 'neutral', texto: 'O servidor não mandou esta fonte na última leitura. Tente atualizar a página.' });

/**
 * O estado de um quadro: `l` é a ligação canal-fonte (fontesDoCanal) e
 * `partes` as partes da fonte que o quadro mostra (só nas ligações de fonte
 * inteira: site, google_ads, linkedin, pinterest).
 *  - ligação de uma parte (ga4, pagina...), ou fonte parada inteira: o estado
 *    da ligação;
 *  - fonte inteira com dado: o pior estado entre as partes do quadro (parte
 *    que nunca falou vale o estado da fonte);
 *  - o motivo é o da parte que puxou o estado (com o nome dela quando o
 *    quadro tem mais de uma parte), e some quando o estado é dos que valem
 *    por cima (o motivo guardado é de antes);
 *  - parte ok que veio com motivo (revisão 2 dos conectores) não muda o
 *    estado: a frase vai em `ressalvas`, que o quadro mostra como nota;
 *  - coletadoEm é a data do dado que está na tela (a mais antiga entre as
 *    partes), tentadoEm a tentativa que falhou depois dele.
 * Devolve {chave, info: {rotulo, tom, texto}, comDado, motivo, codigo,
 * ressalvas, coletadoEm, tentadoEm}. O `codigo` é só para separar casos:
 * nunca vai para a tela.
 */
export function estadoDoQuadro(l, partes = null) {
  if (!objeto(l) || l.carregada === false) {
    return { chave: NAO_LIDO.chave, info: { ...NAO_LIDO }, comDado: false, motivo: null, codigo: null, ressalvas: [], coletadoEm: null, tentadoEm: null };
  }
  const mapa = objeto(l.partes) ? l.partes : {};
  const daFonte = l.parte == null && Array.isArray(partes) && partes.length ? partes : null;
  let estado = l.estado ?? null;
  let parteDoMotivo = l.parte ?? null;
  let coletadoEm = l.coletadoEm ?? null;
  let tentadoEm = l.tentadoEm ?? null;
  if (daFonte) {
    const datas = daFonte.map((p) => mapa[p]?.coletadoEm).filter(Boolean);
    coletadoEm = extremo(datas, false) ?? l.coletadoEm ?? null;
    tentadoEm = extremo(daFonte.map((p) => mapa[p]?.tentadoEm).filter(Boolean), true);
    if (COM_DADO.has(estado)) {
      const estados = daFonte.map((p) => (objeto(mapa[p]) ? mapa[p].estado : estado));
      estado = PIOR_PRIMEIRO.find((e) => estados.includes(e)) ?? estado;
    }
    parteDoMotivo = daFonte.find((p) => objeto(mapa[p]) && mapa[p].estado !== 'ok' && (mapa[p].estado === estado || !COM_DADO.has(estado))) ?? null;
  }
  const porCima = POR_CIMA.has(estado);
  // O motivo acompanha o estado que pede ação; parte ok não tem motivo para
  // o selo (o que ela trouxer vira ressalva, abaixo).
  const m = porCima || !parteDoMotivo || estado === 'ok' ? { texto: null, codigo: null } : motivoDaParte(mapa[parteDoMotivo]);
  const comNome = daFonte && daFonte.length > 1 && m.texto ? `${rotuloParte(l.fonte, parteDoMotivo)}: ${m.texto}` : m.texto;
  // A RESSALVA: parte ok que veio com motivo (revisão 2: a CrUX "sem dados",
  // o WordPress com a REST fechada, as versões "nada a conferir"). Não muda o
  // estado; vira nota do quadro.
  const ressalvas = porCima
    ? []
    : (daFonte || (l.parte ? [l.parte] : []))
      .filter((p) => objeto(mapa[p]) && mapa[p].estado === 'ok')
      .map((p) => motivoDaParte(mapa[p]).texto)
      .filter(Boolean);
  const info = infoEstado(estado);
  return {
    chave: info.chave,
    info: { rotulo: info.rotulo, tom: info.tom, texto: info.texto },
    comDado: COM_DADO.has(estado),
    motivo: comNome,
    codigo: porCima ? null : m.codigo,
    ressalvas: [...new Set(ressalvas)],
    coletadoEm,
    tentadoEm,
  };
}

/**
 * Monta um quadro: o estado, a legenda (a fonte e a data, à vista em todo
 * quadro) e o corpo. `corpo()` só roda quando há dado (`temDado`), e devolve
 * {topo, secoes, notas, destaque, vazio}.
 */
export function montarQuadro({ id, titulo, rotuloFonte, ligacao, partes = null, temDado, corpo, hoje, vazio = null }) {
  const estado = estadoDoQuadro(ligacao, partes);
  const legenda = legendaDaColeta({ rotulo: rotuloFonte, coletadoEm: estado.coletadoEm, tentadoEm: estado.tentadoEm }, hoje);
  const base = { id, titulo, rotuloFonte, legenda, estado, temDado: !!temDado, destaque: null, topo: [], secoes: [], notas: [], vazio: null };
  if (!temDado) {
    // Sem dado: o quadro é o estado (o selo do cabeçalho e a frase do que
    // fazer). Fonte ok e sem nada é dado vazio de verdade: a ressalva do
    // servidor diz o porquê ("o Chrome ainda não tem visitas suficientes");
    // sem ela, a frase de `vazio` de quem chama.
    return { ...base, vazio: estado.comDado ? estado.ressalvas[0] || vazio || 'Nada medido nesta coleta.' : null };
  }
  const c = corpo() || {};
  return {
    ...base,
    destaque: c.destaque ?? null,
    topo: lista(c.topo).filter(Boolean),
    secoes: lista(c.secoes).filter(Boolean),
    notas: [...estado.ressalvas, ...lista(c.notas)].filter(Boolean),
    vazio: c.vazio ?? null,
  };
}

/** A coluna "Situação" das semanas: fechada, ou ainda não (a semana aberta
 *  vem com os números nulos, e a tabela diz o porquê). */
export const colSemanaFechada = (campo = 'fechada', rotuloAberta = 'ainda não fechada') =>
  col(campo, 'Situação', 'texto', {
    valor: (s) => (s?.[campo] === true ? 'fechada' : s?.[campo] === false ? rotuloAberta : null),
    tom: (s) => (s?.[campo] === false ? 'warn' : null),
  });

/* De que parte é um aviso da fonte: os conectores começam a frase pelo nome
   da parte ("Search Console: há sitemap com erro", "Pixel: ..."). Aviso sem
   esse começo é da fonte inteira e vai para todo canal dela. */
const PREFIXOS_DO_AVISO = Object.freeze({
  google: Object.freeze({ ga4: ['GA4', 'Google Analytics'], search_console: ['Search Console'], perfil: ['Perfil da Empresa'] }),
  meta: Object.freeze({ pagina: ['Página'], instagram: ['Instagram'], anuncios: ['Anúncios'], pixel: ['Pixel'] }),
});
export function parteDoAviso(fonte, t) {
  const mapa = PREFIXOS_DO_AVISO[fonte];
  if (!mapa || typeof t !== 'string') return null;
  for (const [parte, prefixos] of Object.entries(mapa)) if (prefixos.some((p) => t.startsWith(`${p}:`))) return parte;
  return null;
}

/** Os avisos da última coleta das fontes que alimentam o canal (o `avisos`
 *  de cada fonte, frases do servidor, e os avisos gerais da resposta), num
 *  quadro só no topo da aba. Aviso de antes da conexão (a coleta é mais
 *  velha que a conexão nova) não entra: fala de uma situação que já mudou.
 *  Sem aviso nenhum: null. */
export function quadroDeAvisos(ligacoes, porFonte, { avisosGerais = [], jaDitos = [], hoje } = {}) {
  const fontes = [...new Set(lista(ligacoes).map((l) => l?.fonte).filter(Boolean))];
  const comNome = fontes.length > 1;
  const nomes = fontes.map((f) => ROTULO_FONTE[f] ?? f);
  const ultima = extremo(fontes.map((f) => (objeto(porFonte?.[f]) ? porFonte[f].coletadoEm : null)).filter(Boolean), true);
  // O aviso que repete o motivo já escrito num quadro (o servidor manda a
  // mesma frase nos dois lugares) não aparece duas vezes na aba.
  const ditos = lista(jaDitos).map((d) => texto(d, 600)).filter(Boolean);
  const repetido = (t) => ditos.some((d) => d === t || d.endsWith(`: ${t}`));
  const itens = [];
  for (const f of fontes) {
    const fonte = objeto(porFonte) && objeto(porFonte[f]) ? porFonte[f] : null;
    if (!fonte || estadoDeAntesDaConexao(fonte)) continue;
    // As partes desta fonte que o canal mostra (null: a fonte inteira).
    const daFonte = lista(ligacoes).filter((l) => l?.fonte === f);
    const partes = daFonte.some((l) => l.parte == null) ? null : new Set(daFonte.map((l) => l.parte));
    for (const a of lista(fonte.avisos)) {
      const t = texto(a, 400);
      if (!t || repetido(t)) continue;
      // "Search Console: ..." é do canal site, e não do Google Meu Negócio.
      const p = parteDoAviso(f, t);
      if (p && partes && !partes.has(p)) continue;
      itens.push({ nivel: 'atencao', texto: comNome ? `${ROTULO_FONTE[f] ?? f}: ${t}` : t });
    }
  }
  for (const a of lista(avisosGerais)) {
    const t = texto(a, 400);
    if (t) itens.push({ nivel: 'info', texto: t });
  }
  if (!itens.length) return null;
  return {
    id: 'avisos-coleta',
    titulo: 'Avisos da última coleta',
    rotuloFonte: nomes.join(', '),
    legenda: legendaDaColeta({ rotulo: nomes.join(', '), coletadoEm: ultima }, hoje),
    estado: { chave: 'ok', info: { rotulo: 'Funcionando', tom: 'ok', texto: '' }, comDado: true, motivo: null, codigo: null, ressalvas: [], coletadoEm: null, tentadoEm: null },
    temDado: true,
    destaque: plural(itens.length, 'aviso', 'avisos'),
    topo: [blocoAvisos(itens)],
    secoes: [],
    notas: [],
    vazio: null,
  };
}

/** Os motivos (frases) das partes que a aba mostra: a parte da ligação, ou
 *  todas na ligação de fonte inteira. Servem ao quadroDeAvisos para não
 *  repetir, nos avisos da coleta, a frase que um quadro já escreveu. */
export function motivosDasLigacoes(ligacoes) {
  const fora = [];
  for (const l of lista(ligacoes)) {
    const mapa = objeto(l?.partes) ? l.partes : {};
    for (const p of l?.parte ? [l.parte] : Object.keys(mapa)) {
      const t = motivoDaParte(mapa[p]).texto;
      if (t) fora.push(t);
    }
  }
  return fora;
}

/** A frase da seção cuja parte não veio (fonte inteira, como o Google Ads,
 *  em que cada seção é uma parte): o estado e o motivo da parte, ou "não
 *  veio" quando ela nem falou. */
export function semDadoDaParte(l, parte) {
  const p = objeto(l?.partes) ? l.partes[parte] : null;
  if (!objeto(p) || COM_DADO.has(p.estado)) return 'Não veio nesta coleta.';
  const m = motivoDaParte(p).texto;
  return `${infoEstado(p.estado).rotulo}${m ? `: ${m}` : '.'}`;
}

/** O nível do aviso para o tom da casa (as conferências do site, os avisos
 *  das fontes). */
export const TOM_DO_NIVEL = Object.freeze({ alerta: 'bad', atencao: 'warn', info: 'neutral' });
