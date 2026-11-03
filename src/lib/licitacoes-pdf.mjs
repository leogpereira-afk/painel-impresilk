import { formatarData, resumoCobertura, urlOficialSegura } from './licitacoes-pesquisa.mjs';

// PDF A4 vetorial, sem dependências ou consultas. Recebe o relatório integral,
// nunca os resultados filtrados/paginados da interface. Fontes PDF WinAnsi.
const WIDTH = 595, HEIGHT = 842, LEFT = 44, RIGHT = 551, BOTTOM = 778;
const INK = '0.12 0.18 0.25', MUTED = '0.36 0.42 0.48', ACCENT = '0.26 0.24 0.70';
const CP = { '€': 128, '…': 133, '‘': 145, '’': 146, '“': 147, '”': 148, '•': 149 };
const textValue = value => String(value ?? '').replace(/[–—‑]/g, '-').replace(/[^\x20-\x7e\x80-\xff\n]/g, c => CP[c] ? String.fromCharCode(CP[c]) : ' ');
const escapePDF = value => textValue(value).replace(/([\\()])/g, '\\$1').replace(/\n/g, ' ');
const array = value => Array.isArray(value) ? value : [];
const filled = value => typeof value === 'string' && value.trim() !== '';
const count = value => Number.isInteger(value) && value >= 0 ? value : 0;
const safeID = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/.test(value);

// Helvetica regular and bold widths (AFM units). Accented Latin letters use
// their base-letter width; extra safety margin keeps unusual glyphs in bounds.
const REGULAR = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
function measure(value, size, bold = false) {
  const widths = bold ? BOLD : REGULAR;
  return [...textValue(value)].reduce((sum, char) => {
    const code = char.normalize('NFD')[0].charCodeAt(0);
    return sum + (widths[code - 32] ?? 900) * size / 1000;
  }, 0);
}
function wrap(value, width, size, bold = false) {
  const lines = [];
  for (const paragraph of textValue(value).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && measure(`${line} ${word}`, size, bold) > width - 4) { lines.push(line); line = ''; }
      for (const char of word) {
        if (line && measure(line + char, size, bold) > width - 4) { lines.push(line); line = ''; }
        line += char;
      }
      line += ' ';
    }
    if (line.trim()) lines.push(line.trim());
  }
  return lines;
}
function checkAbort(signal) {
  if (signal?.aborted) throw new DOMException('Exportação cancelada.', 'AbortError');
}

function encodePDF(pages, title) {
  const objects = ['', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
  const push = body => (objects.push(body), objects.length);
  const pageIDs = pages.map(({ commands, links }) => {
    const stream = commands.join('\n');
    const contentID = push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const annotations = links.map(({ x, top, width, size, url }) => push(`<< /Type /Annot /Subtype /Link /Rect [${x} ${HEIGHT-top-3} ${x+width} ${HEIGHT-top+size}] /Border [0 0 0] /A << /S /URI /URI (${escapePDF(url)}) >> >>`));
    return push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${WIDTH} ${HEIGHT}] /Resources << /Font << /FN 3 0 R /FB 4 0 R >> >> /Contents ${contentID} 0 R ${annotations.length ? `/Annots [${annotations.map(id => `${id} 0 R`).join(' ')}]` : ''} >>`);
  });
  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[1] = `<< /Type /Pages /Kids [${pageIDs.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIDs.length} >>`;
  const infoID = push(`<< /Title (${escapePDF(title)}) /Author (Impresilk) /Subject (Resumo do relatorio de licitacoes) >>`);
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => { offsets.push(pdf.length); pdf += `${i+1} 0 obj\n${body}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R /Info ${infoID} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Uint8Array.from(pdf, char => char.charCodeAt(0) & 255);
}

/** Side-effect-free renderer. Pass exportadoEm for a reproducible artifact. */
export function gerarResumoLicitacoesPDF(dados, { exportadoEm = new Date().toISOString(), signal } = {}) {
  checkAbort(signal);
  if (!dados || dados.estado !== 'disponivel' || !safeID(dados.id)) throw new Error('Abra um relatório disponível antes de baixar o resumo PDF.');
  if (!Number.isFinite(Date.parse(exportadoEm))) throw new Error('Data de exportação inválida.');
  const opportunities = array(dados.oportunidades), withheld = array(dados.candidatosRetidos);
  const coverage = resumoCobertura(dados.cobertura), institutions = dados.coberturaInstituicoes || {};
  const original = formatarData(dados.geradoEm, true), exported = formatarData(exportadoEm, true);
  const archiveURL = `https://leogpereira-afk.github.io/painel-impresilk/licitacoes?relatorio=${encodeURIComponent(dados.id)}`;
  const pages = []; let page, y, continuation = '';
  const draw = (value, x, top, size = 9.5, bold = false, color = INK) => page.commands.push(`BT /${bold ? 'FB' : 'FN'} ${size} Tf ${color} rg 1 0 0 1 ${x.toFixed(2)} ${(HEIGHT-top).toFixed(2)} Tm (${escapePDF(value)}) Tj ET`);
  const rectangle = (x, top, width, height, color) => page.commands.push(`${color} rg ${x} ${HEIGHT-top-height} ${width} ${height} re f`);
  function newPage() {
    checkAbort(signal);
    page = { commands: [], links: [] }; pages.push(page);
    draw('IMPRESILK', LEFT, 37, 10, true, ACCENT);
    draw('Relatório de licitações', LEFT, 63, 20, true);
    y = 82;
    for (const line of wrap(`Resumo PDF | ID: ${dados.id}`, RIGHT-LEFT, 8.2)) { draw(line, LEFT, y, 8.2, false, MUTED); y += 11; }
    rectangle(LEFT, y+1, RIGHT-LEFT, 2, ACCENT); y += 24;
    if (continuation) {
      for (const line of wrap(`${continuation} (continuação)`, RIGHT-LEFT, 9, true)) { draw(line, LEFT, y, 9, true, ACCENT); y += 13; }
      y += 3;
    }
  }
  function room(height) { if (y + height > BOTTOM) newPage(); }
  function lines(value, { size = 9.5, bold = false, color = INK, indent = 0, gap = 13, url } = {}) {
    for (const line of wrap(value, RIGHT-LEFT-indent, size, bold)) {
      room(gap); draw(line, LEFT+indent, y, size, bold, color);
      if (url) page.links.push({ x: LEFT+indent, top: y, width: Math.min(RIGHT-LEFT-indent, measure(line,size,bold)), size, url });
      y += gap;
    }
  }
  function section(title, minimum = 58) {
    continuation = ''; room(minimum); y += 6;
    lines(title, { size: 12, bold: true, color: ACCENT, gap: 16 }); y += 5;
  }
  const rowHeight = ({value, options = {}}) => wrap(value,RIGHT-LEFT-(options.indent || 0),options.size || 9.5,options.bold).length * (options.gap || 13);
  function recordRows(item, index, pending) {
    const rows = [], add = (value, options) => rows.push({value,options});
    const field = (label, value) => { if (filled(value)) add(`${label}: ${value}`); };
    const status = pending ? 'PENDENTE DE CONFERÊNCIA' : (item.classificacao || 'Classificação não informada');
    const title = `${index+1}. ${status} | ${item.processo || item.id || 'Processo não informado'}`;
    add(title, { bold: true, indent: 10, gap: 14 });
    field('ID', item.id); field('Órgão', item.orgao); field('Produto', item.produto);
    field('Item', item.item); field('Lote', item.lote);
    const destinations = array(pending ? item.localExecucaoRegistrado?.municipios : item.municipiosAbrangidos);
    if (destinations.length) field(pending ? 'Destinos registrados (a conferir)' : 'Destinos regionais', destinations.join(', '));
    const place = pending ? item.localExecucaoRegistrado : item.localExecucao;
    field(pending ? 'Evidência de local registrada (a conferir)' : 'Evidência de local', place?.evidencia);
    const placeFlags = [['apenasSede','Apenas sede'],['misto','Execução mista'],['logisticaViavel','Logística viável']]
      .filter(([key]) => typeof place?.[key] === 'boolean').map(([key,label]) => `${label}: ${place[key] ? 'sim' : 'não'}`);
    if (placeFlags.length) field(pending ? 'Declarações de local (a conferir)' : 'Declarações de local', placeFlags.join(' | '));
    // The stored deadline may be descriptive, not an ISO timestamp. Do not
    // parse it or relabel a retained candidate as an open bidding opportunity.
    field('Prazo registrado', filled(item.prazo) ? item.prazo : 'Não informado; confirmar no portal oficial.');
    if (pending) for (const reason of array(item.motivos)) field('Pendência', reason);
    field(pending ? 'Justificativa registrada (a conferir)' : 'Justificativa', pending ? item.justificativaRegistrada : item.justificativa);
    const requirements = array(item.exigencias).filter(filled);
    if (requirements.length) for (const requirement of requirements) field('Exigência', requirement);
    else add('Exigências: não informadas no relatório.');
    field('Próxima ação', filled(item.proximaAcao) ? item.proximaAcao : 'Conferir documentos, prazo e retificações na fonte oficial.');
    const officialURL = urlOficialSegura(item.oficialUrl);
    if (officialURL) add(`Fonte oficial: ${officialURL}`, { size: 8.5, color: ACCENT, gap: 12, url: officialURL });
    else add('Fonte oficial: endereço não disponível para abertura segura.', { size: 8.5, color: MUTED, gap: 12 });
    return rows;
  }
  const recordSpace = rows => Math.min(600,rows.reduce((total,row) => total+rowHeight(row),15));
  function record(item, index, pending) {
    const rows = recordRows(item,index,pending);
    continuation = ''; room(recordSpace(rows));
    rectangle(LEFT, y-10, 3, 14, ACCENT);
    lines(rows[0].value,rows[0].options); y += 3;
    continuation = `${pending ? 'Candidato retido' : 'Oportunidade'} ${index+1} | ${item.id || 'sem ID'}`;
    for (const row of rows.slice(1)) lines(row.value,row.options);
    continuation = ''; y += 12;
  }

  newPage();
  lines(`Pesquisa original: ${original} (Brasília)`, { bold: true });
  lines(`Período: ${formatarData(dados.periodo?.inicio)} a ${formatarData(dados.periodo?.fim)}`);
  lines(`PDF exportado em: ${exported} (Brasília)`, { size: 8.5, color: MUTED, gap: 12 }); y += 8;
  lines('A exportação preserva a pesquisa original; não executa nova consulta aos portais.', { size: 8.5, color: MUTED, gap: 12 });
  lines('Inclui todas as oportunidades e todos os candidatos retidos deste relatório, independentemente dos filtros da tela.', { size: 8.5, color: MUTED, gap: 12 });
  section('Cobertura registrada', 100);
  lines(`Municípios: ${coverage.concluidos} de 89 concluídos (${coverage.coberturaPercentual.toLocaleString('pt-BR')}%).`, { bold: true });
  lines(`${coverage.parciais} parciais | ${coverage.naoConsultados} não consultados.`, { color: MUTED });
  lines(`Órgãos e instituições: ${count(institutions.concluidos)} de ${count(institutions.totalRegistros)} registros concluídos.`, { bold: true });
  lines(`${count(institutions.parciais)} parciais | ${count(institutions.naoConsultados)} não consultados. Coberturas independentes.`, { color: MUTED });
  if (coverage.inconsistente) lines('Atenção: totais municipais inconsistentes; confira o relatório completo.', { bold: true });
  y += 5;
  lines(`${opportunities.length} ${opportunities.length === 1 ? 'oportunidade registrada' : 'oportunidades registradas'} | ${withheld.length} ${withheld.length === 1 ? 'candidato retido' : 'candidatos retidos'} para conferência.`, { bold: true });
  if (!opportunities.length && (coverage.concluidos < 89 || count(institutions.concluidos) < count(institutions.totalRegistros))) lines('A ausência de oportunidades validadas não comprova ausência de licitações na região.', { size: 8.5, color: MUTED, gap: 12 });

  section(`Oportunidades registradas (${opportunities.length})`, opportunities.length ? Math.min(640,recordSpace(recordRows(opportunities[0],0,false))+32) : 58);
  if (!opportunities.length) lines('Nenhuma oportunidade validada para apresentação neste relatório.');
  opportunities.forEach((item,index) => record(item,index,false));
  section(`Candidatos retidos (${withheld.length})`, withheld.length ? Math.min(640,recordSpace(recordRows(withheld[0],0,true))+62) : 58);
  if (withheld.length) {
    lines('Pendentes de conferência. Não são oportunidades verificadas e não autorizam proposta ou lance.', { size: 9, color: MUTED }); y += 7;
    withheld.forEach((item,index) => record(item,index,true));
  } else lines('Nenhum candidato retido neste relatório.');

  section('Notas e acesso ao relatório completo');
  const notices = array(dados.avisos).filter(filled), limits = array(dados.limites).filter(filled);
  for (const notice of notices.slice(0,3)) lines(`Ressalva: ${notice}`, { size: 8.5, color: MUTED, gap: 12 });
  if (notices.length > 3) lines(`${notices.length-3} ressalva(s) adicional(is) no relatório completo.`, { size: 8.5, color: MUTED, gap: 12 });
  for (const limit of limits.slice(0,4)) lines(`Limite: ${limit}`, { size: 8.5, color: MUTED, gap: 12 });
  if (limits.length > 4) lines(`${limits.length-4} limite(s) adicional(is) no relatório completo.`, { size: 8.5, color: MUTED, gap: 12 });
  lines(`Pendências gerais registradas: ${array(dados.pendencias).length}. Este resumo PDF não reproduz as matrizes completas nem os recibos de consulta.`, { size: 8.5, color: MUTED, gap: 12 });
  lines('Confira documentos, prazos e retificações nos portais oficiais antes de decidir. GO não equivale a aprovação de proposta ou autorização de lance.', { size: 8.5, color: MUTED, gap: 12 }); y += 5;
  room(13+wrap(archiveURL,RIGHT-LEFT,8).length*11);
  lines('Relatório completo no Painel (requer acesso):', { size: 9, bold: true, color: ACCENT, url: archiveURL });
  lines(archiveURL, { size: 8, color: ACCENT, gap: 11, url: archiveURL });
  const finalPage = page;
  pages.forEach((current,index) => {
    page = current; rectangle(LEFT, 797, RIGHT-LEFT, .5, '0.83 0.86 0.89');
    draw(`Resumo PDF | Pesquisa original: ${original}`, LEFT, 813, 7.5, false, MUTED);
    const pagination = `${index+1} / ${pages.length}`;
    draw(pagination, RIGHT-measure(pagination,8), 813, 8, false, MUTED);
  });
  page = finalPage;
  checkAbort(signal);
  return encodePDF(pages, 'Impresilk - Relatório de licitações');
}

export async function baixarResumoLicitacoesPDF(dados, options = {}) {
  checkAbort(options.signal);
  // Let pending navigation/unmount/session events cancel before the renderer.
  await new Promise(resolve => setTimeout(resolve, 0));
  checkAbort(options.signal);
  const bytes = gerarResumoLicitacoesPDF(dados, options);
  // A task (not only a microtask) lets UI events queued during generation run
  // before a real download is started.
  await new Promise(resolve => setTimeout(resolve, 0));
  checkAbort(options.signal);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  try {
    anchor.href = url;
    anchor.download = `Impresilk-licitacoes-${dados.id.replace(/[^A-Za-z0-9_.-]/g,'-')}.pdf`;
    document.body.append(anchor);
    checkAbort(options.signal);
    anchor.click();
  } catch (error) { URL.revokeObjectURL(url); throw error; }
  finally { anchor.remove(); }
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
