/* IMPORTAR PUBLICAÇÕES POR CSV (etapa a2 do Centro de Comando).
 *
 * A planilha vem de gente: Excel em português salva com ";" (porque "," é a
 * vírgula decimal), Google Planilhas salva com ",", o cabeçalho tem acento
 * ("Impressões") ou não tem, o número vem "1.234". Este leitor aceita tudo
 * isso e devolve, linha a linha, o que entra e o que fica de fora com o
 * motivo. A tela mostra a prévia antes de gravar; o servidor confere de novo
 * (prepararLinhaCsv em _shared/marketing.mjs): aqui é aviso, lá é a regra.
 *
 * OS BURACOS QUE ESTE ARQUIVO FECHA, cada um com teste:
 * - número vazio virando 0. Célula em branco é "não informado" (null), e o
 *   banco guarda null. "-" também é não informado (exportação costuma pôr);
 * - texto com o separador dentro e sem aspas empurra as colunas: o alcance
 *   cai na coluna de engajamento e ninguém vê. Linha com mais ou menos
 *   colunas que o cabeçalho é recusada, nunca "ajeitada";
 * - "1,234" é ambíguo (mil duzentos e trinta e quatro nos EUA, um vírgula
 *   dois três quatro aqui). Recusado com o motivo, em vez de adivinhado;
 * - o mesmo link duas vezes no arquivo: o banco grava por (canal, link) e
 *   duas linhas iguais no mesmo lote derrubam a importação inteira;
 * - BOM do Excel (o caractere invisível U+FEFF grudado no primeiro nome de coluna) e arquivo em
 *   Windows-1252 (o "Impressões" vira "Impress?es"): ver textoDoArquivo.
 */

import { diaValido, paraDia } from './marketing-canais.js';

/** O mesmo teto da ação importarPublicacoes do servidor. */
export const LIMITE_LINHAS_CSV = 2000;

const TITULO_MAX = 200;
const URL_MAX = 500;
const NUMERO_MAX = 1e9;

/** Os números de uma publicação, na ordem da tabela painel_mkt_publicacoes. */
export const NUMEROS_PUBLICACAO = ['alcance', 'impressoes', 'engajamento', 'cliques', 'leads'];

const ROTULO = {
  canal: 'Canal',
  data: 'Data',
  titulo: 'Título',
  url: 'Link',
  alcance: 'Alcance',
  impressoes: 'Impressões',
  engajamento: 'Engajamento',
  cliques: 'Cliques',
  leads: 'Leads',
};

/* Nome de coluna (já sem acento e sem caixa) para o campo. "link" é o nome
   da especificação; "url" entra junto porque é o que muita exportação usa. */
const COLUNA = {
  canal: 'canal',
  data: 'data',
  titulo: 'titulo',
  link: 'url',
  url: 'url',
  alcance: 'alcance',
  impressoes: 'impressoes',
  engajamento: 'engajamento',
  cliques: 'cliques',
  leads: 'leads',
};

/** Sem acento, sem caixa, espaços juntos: "Google Meu Negócio " e
 *  "google meu negocio" são o mesmo nome. */
export function normalizarNome(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Os bytes do arquivo em texto. Primeiro tenta UTF-8 estrito; se o arquivo
 *  não for UTF-8 (Excel antigo salva em Windows-1252), lê como Windows-1252
 *  em vez de trocar cada acento por "?". O BOM do UTF-8 sai aqui. */
export function textoDoArquivo(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/* Separa o texto em registros e células, respeitando aspas: dentro de aspas
   o separador e a quebra de linha são texto, e "" é uma aspa. Cada registro
   guarda a linha do arquivo onde COMEÇA, para o motivo apontar a linha que a
   pessoa enxerga no Excel. */
export function separarRegistros(texto, sep) {
  const registros = [];
  let celulas = [];
  let celula = '';
  let entreAspas = false;
  let linhaAtual = 1;
  let inicio = 1;
  let aspasAbertasEm = null;
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i];
    if (entreAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          celula += '"';
          i += 1;
        } else entreAspas = false;
      } else {
        if (c === '\n') linhaAtual += 1;
        celula += c;
      }
      continue;
    }
    if (c === '"' && celula === '') {
      entreAspas = true;
      aspasAbertasEm = linhaAtual;
    } else if (c === sep) {
      celulas.push(celula);
      celula = '';
    } else if (c === '\n') {
      celulas.push(celula);
      registros.push({ linha: inicio, celulas });
      celulas = [];
      celula = '';
      linhaAtual += 1;
      inicio = linhaAtual;
    } else celula += c;
  }
  if (entreAspas) return { registros, aspasAbertasEm };
  if (celula !== '' || celulas.length) {
    celulas.push(celula);
    registros.push({ linha: inicio, celulas });
  }
  return { registros, aspasAbertasEm: null };
}

/* Qual separador: o que mais aparece no cabeçalho, fora de aspas. */
export function escolherSeparador(texto) {
  const fim = texto.indexOf('\n');
  const cabecalho = (fim === -1 ? texto : texto.slice(0, fim)).replace(/"[^"]*"/g, '');
  const pv = (cabecalho.match(/;/g) || []).length;
  const v = (cabecalho.match(/,/g) || []).length;
  return v > pv ? ',' : ';';
}

/** Número inteiro escrito por gente, do jeito brasileiro.
 *  Devolve {valor} (null quando não informado) ou {erro}. */
export function lerInteiro(bruto) {
  const s = String(bruto ?? '').replace(/[\s\u00a0\u202f]/g, '');
  // Vazio e traço sozinho (hífen, meia-risca ou travessão, como a exportação
  // costuma marcar "sem dado") são não informado.
  if (s === '' || /^[-\u2013\u2014]$/.test(s)) return { valor: null };
  let n = null;
  if (/^\d+$/.test(s)) n = Number(s);
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) n = Number(s.replace(/\./g, ''));
  else if (/^\d+,0+$/.test(s)) n = Number(s.split(',')[0]);
  else if (/^\d{1,3}(\.\d{3})+,0+$/.test(s)) n = Number(s.split(',')[0].replace(/\./g, ''));
  else if (/^\d{1,3}(,\d{3})+$/.test(s)) return { erro: `"${bruto}" é ambíguo: escreva 1234 ou 1.234` };
  else if (/^-/.test(s)) return { erro: `"${bruto}" é negativo` };
  else if (/^\d+([.,]\d+)+$/.test(s)) return { erro: `"${bruto}" não é número inteiro` };
  else return { erro: `"${bruto}" não é número` };
  if (n > NUMERO_MAX) return { erro: `"${bruto}" passa de 1 bilhão` };
  return { valor: n };
}

/** Data da planilha: dd/mm/aaaa (com ou sem hora depois) ou aaaa-mm-dd.
 *  Devolve AAAA-MM-DD ou null. Timestamp com fuso vira o dia local de quem
 *  importa (a mesma régua de paraDia). */
export function lerData(bruto) {
  const s = String(bruto ?? '').trim();
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/);
  if (br) {
    const dia = `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
    return diaValido(dia) ? dia : null;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return diaValido(s) ? s : null;
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/);
  if (iso) {
    // Sem fuso, a hora é a de quem exportou: vale o dia escrito. Com fuso, é
    // um instante, e o dia é o local.
    if (!iso[2]) return diaValido(iso[1]) ? iso[1] : null;
    return paraDia(s.replace(' ', 'T'));
  }
  return null;
}

function mapaDeCanais(canais) {
  const porCodigo = new Map();
  const porNome = new Map();
  for (const c of Array.isArray(canais) ? canais : []) {
    if (!c || !c.id) continue;
    if (c.codigo) porCodigo.set(normalizarNome(c.codigo), c);
    const nome = normalizarNome(c.nome);
    if (nome) porNome.set(nome, [...(porNome.get(nome) || []), c]);
  }
  return { porCodigo, porNome };
}

/** Lê o CSV de publicações.
 *  - `canais`: a lista de canais (id, codigo, nome) para casar a coluna
 *    "canal" pelo código ou pelo nome, sem acento e sem caixa;
 *  - `canalId` (opcional): o canal de quem importa de dentro de um canal.
 *    Vale para a linha sem coluna "canal" ou com a célula vazia;
 *  - `hoje` (opcional): recusa data no futuro (pega dia e mês trocados, o
 *    erro mais comum de planilha exportada em inglês);
 *  - `limite`: quantas linhas de dados por vez.
 *  Devolve { linhas, erros: [{linha, motivo}], ignoradas: [nomes de coluna] }.
 *  Cada linha boa: { linha, canalId, data, titulo, url, alcance, impressoes,
 *  engajamento, cliques, leads }. A fonte ("csv") quem carimba é o servidor. */
export function lerCsvPublicacoes(texto, canais, { canalId = null, hoje = null, limite = LIMITE_LINHAS_CSV } = {}) {
  const linhas = [];
  const erros = [];
  const ignoradas = [];
  const limpo = String(texto ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (!limpo.trim()) return { linhas, erros: [{ linha: 1, motivo: 'O arquivo está vazio.' }], ignoradas };
  if (limpo.includes('\uFFFD')) {
    return {
      linhas,
      erros: [{ linha: 1, motivo: 'O arquivo tem letras estragadas (acentos trocados por sinais). Salve de novo como "CSV UTF-8" e importe outra vez.' }],
      ignoradas,
    };
  }
  const sep = escolherSeparador(limpo);
  const { registros, aspasAbertasEm } = separarRegistros(limpo, sep);
  const vazio = (r) => r.celulas.every((c) => !c.trim());
  const comDados = registros.filter((r) => !vazio(r));
  if (!comDados.length) return { linhas, erros: [{ linha: 1, motivo: 'O arquivo está vazio.' }], ignoradas };

  // Cabeçalho: a primeira linha com conteúdo.
  const [cab, ...corpo] = comDados;
  const campos = cab.celulas.map((c) => COLUNA[normalizarNome(c)] || null);
  cab.celulas.forEach((c, i) => {
    if (!campos[i] && c.trim()) ignoradas.push(c.trim());
  });
  const repetido = campos.find((c, i) => c && campos.indexOf(c) !== i);
  if (repetido) return { linhas, erros: [{ linha: cab.linha, motivo: `A coluna "${ROTULO[repetido]}" aparece duas vezes no cabeçalho.` }], ignoradas };
  if (!campos.includes('data')) return { linhas, erros: [{ linha: cab.linha, motivo: 'Falta a coluna "data" no cabeçalho.' }], ignoradas };
  // O canal de quem importa só vale se for um dos canais conhecidos: id
  // desconhecido não vira canal de ninguém.
  const canalPadrao = canalId && (Array.isArray(canais) ? canais : []).some((c) => c?.id === canalId) ? canalId : null;
  if (!campos.includes('canal') && !canalPadrao) return { linhas, erros: [{ linha: cab.linha, motivo: 'Falta a coluna "canal" no cabeçalho.' }], ignoradas };
  if (corpo.length > limite) {
    return { linhas, erros: [{ linha: cab.linha, motivo: `O arquivo tem ${corpo.length} linhas e o limite é ${limite} por vez. Divida em partes.` }], ignoradas };
  }

  const { porCodigo, porNome } = mapaDeCanais(canais);
  const hojeDia = hoje == null ? null : paraDia(hoje);
  const linksVistos = new Map();

  for (const reg of corpo) {
    const motivos = [];
    if (reg.celulas.length !== cab.celulas.length) {
      erros.push({
        linha: reg.linha,
        motivo: `A linha tem ${reg.celulas.length} colunas e o cabeçalho tem ${cab.celulas.length}. Algum texto com "${sep}" ficou sem aspas?`,
      });
      continue;
    }
    const v = {};
    campos.forEach((campo, i) => {
      if (campo) v[campo] = reg.celulas[i];
    });

    // Canal: código primeiro (é único), depois o nome. Nome repetido em dois
    // canais não é adivinhado.
    let canal = null;
    const nomeCanal = String(v.canal ?? '').trim();
    if (nomeCanal) {
      const chave = normalizarNome(nomeCanal);
      const pelosNomes = porNome.get(chave) || [];
      if (porCodigo.has(chave)) canal = porCodigo.get(chave).id;
      else if (pelosNomes.length === 1) canal = pelosNomes[0].id;
      else if (pelosNomes.length > 1) motivos.push(`Há mais de um canal chamado "${nomeCanal}": use o código do canal`);
      else motivos.push(`O canal "${nomeCanal}" não existe: use o código ou o nome de um canal cadastrado`);
    } else if (canalPadrao) canal = canalPadrao;
    else motivos.push('Falta o canal');

    const dataBruta = String(v.data ?? '').trim();
    const data = lerData(dataBruta);
    if (!dataBruta) motivos.push('Falta a data');
    else if (!data) motivos.push(`Data "${dataBruta}" inválida: use dd/mm/aaaa ou aaaa-mm-dd`);
    else if (hojeDia && data > hojeDia) motivos.push(`Data ${dataBruta} está no futuro: confira se o dia e o mês não estão trocados`);

    // Título é só rótulo: o que passar de 200 letras é cortado (a legenda
    // inteira de um post costuma vir nesta coluna), e a prévia mostra o corte.
    // O corte conta como o servidor conta (unidades do JavaScript) e nunca
    // parte um emoji ao meio.
    // Caractere de controle (o nulo, sobretudo) sai: o banco recusaria o
    // arquivo inteiro por causa dele. O servidor limpa do mesmo jeito.
    let titulo = String(v.titulo ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim() || null;
    if (titulo && titulo.length > TITULO_MAX) {
      let corte = TITULO_MAX - 1;
      const antes = titulo.charCodeAt(corte - 1);
      if (antes >= 0xd800 && antes <= 0xdbff) corte -= 1;
      titulo = `${titulo.slice(0, corte)}…`;
    }

    let url = String(v.url ?? '').trim() || null;
    if (url) {
      if (url.length > URL_MAX) motivos.push(`O link passou de ${URL_MAX} letras`);
      else if (!/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(url)) motivos.push('O link precisa começar com http:// ou https://');
    }

    const numeros = {};
    for (const campo of NUMEROS_PUBLICACAO) {
      const r = lerInteiro(v[campo]);
      if (r.erro) motivos.push(`${ROTULO[campo]}: ${r.erro}`);
      numeros[campo] = r.erro ? null : r.valor;
    }

    if (!motivos.length && url && canal) {
      const chave = `${canal}\n${url}`;
      if (linksVistos.has(chave)) motivos.push(`Link repetido no arquivo (já está na linha ${linksVistos.get(chave)})`);
      else linksVistos.set(chave, reg.linha);
    }

    if (motivos.length) {
      erros.push({ linha: reg.linha, motivo: `${motivos.join('; ')}.` });
      continue;
    }
    linhas.push({ linha: reg.linha, canalId: canal, data, titulo, url, ...numeros });
  }

  if (aspasAbertasEm !== null) {
    erros.push({
      linha: aspasAbertasEm,
      motivo: 'Aspas abertas que nunca fecham: o resto do arquivo ficou dentro de um texto e não foi lido.',
    });
  }
  return { linhas, erros, ignoradas };
}
