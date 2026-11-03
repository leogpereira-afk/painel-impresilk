import { dataValida, situacaoDocumento } from './documentos.js';

export function hojeBrasilia(instante = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instante);
  const parte = tipo => partes.find(p => p.type === tipo).value;
  return `${parte('year')}-${parte('month')}-${parte('day')}`;
}

export const documentoEmpresa = item => item?.tipo === 'documento' && item.titularTipo === 'empresa' && item.origem !== 'incendio';
export const documentoLicitacoes = item => documentoEmpresa(item) && item.usoLicitacoes === true;

// A situação descreve o arquivo cadastrado; a habilitação depende do edital.
export function situacaoArquivoLicitacoes(item, hoje) {
  const prazo = situacaoDocumento(item, hoje);
  if (prazo.nivel === 'encerrado') return { ...prazo, grupo: 'encerrado' };
  if (!item.temArquivo) return { nivel: 'sem', grupo: 'conferir', rotulo: 'Arquivo pendente', dias: prazo.dias };
  if (!dataValida(hoje)) return { nivel: 'sem', grupo: 'conferir', rotulo: 'Data de referência inválida', dias: null };
  if (item.semVencimento && item.validade) return { nivel: 'sem', grupo: 'conferir', rotulo: 'Conferir validade', dias: null };
  if (!dataValida(item.emissao)) return { nivel: 'sem', grupo: 'conferir', rotulo: item.emissao ? 'Emissão inválida' : 'Emissão não informada', dias: prazo.dias };
  if (item.emissao > hoje) return { nivel: 'sem', grupo: 'conferir', rotulo: 'Emissão futura', dias: prazo.dias };
  if (item.validade && dataValida(item.validade) && item.validade < item.emissao) return { nivel: 'sem', grupo: 'conferir', rotulo: 'Datas divergentes', dias: prazo.dias };
  if (prazo.nivel === 'semVencimento') return { ...prazo, grupo: 'ok' };
  return { ...prazo, grupo: { ok: 'ok', urgente: 'urgente', vencido: 'vencido' }[prazo.nivel] || 'conferir' };
}

export function resumirDocumentosLicitacoes(itens, hoje) {
  const ordem = { vencido: 0, urgente: 1, conferir: 2, ok: 3, encerrado: 4 };
  const lista = (itens || []).filter(documentoLicitacoes).map(item => ({ ...item, sit: situacaoArquivoLicitacoes(item, hoje) }));
  lista.sort((a, b) => ordem[a.sit.grupo] - ordem[b.sit.grupo] || (a.sit.dias ?? Infinity) - (b.sit.dias ?? Infinity) || String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
  return { lista, contagens: Object.fromEntries(Object.keys(ordem).map(grupo => [grupo, lista.filter(i => i.sit.grupo === grupo).length])) };
}
