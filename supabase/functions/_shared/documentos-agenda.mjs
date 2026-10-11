import { dataIncendioValida, vencimentosIncendio } from './patrimonio-incendio.mjs';
import { temPermissao } from './patrimonio-acesso.mjs';

export const TIPOS_DOCUMENTOS_AGENDA = ['documento', 'seguro', 'garantia'];
const TIPOS = { documento: 'Documentos', seguro: 'Seguros', garantia: 'Garantias' };
const ROTULOS = { documento: 'Documento', seguro: 'Seguro', garantia: 'Garantia' };
const CORES = { documento: '#7c3aed', seguro: '#0284c7', garantia: '#059669' };
const ESTADOS_COM_PRAZO = ['', 'ativo', 'renovacao', 'em_vigor'];
const texto = valor => String(valor ?? '').trim();
const indexarTitulares = titulares => Array.isArray(titulares) ? new Map(titulares.filter(t => texto(t.id)).map(t => [texto(t.id), t])) : titulares;

export function privacidadeDocumentoAgenda(item, titulares, sessao) {
  const porTitular = indexarTitulares(titulares);
  const titular = porTitular.get(texto(item?.titularId));
  const anteriores = [
    ...(Array.isArray(item?.titularHistoricoIds) ? item.titularHistoricoIds : []),
    ...(Array.isArray(item?.versoes) ? item.versoes.map(v => v?.snapshot?.titularId) : []),
  ];
  const pessoal = titular?.tipo === 'pessoa' || item?.pessoalHistorico === true || item?.pessoalHistorico === 'true'
    || anteriores.some(id => porTitular.get(texto(id))?.tipo === 'pessoa');
  return !pessoal || (temPermissao(sessao, 'documentos') && temPermissao(sessao, 'documentos-pessoais'));
}

export function incendioAgendaPermitido(item, titulares, sessao) {
  if (!temPermissao(sessao, 'patrimonio') && !temPermissao(sessao, 'inventario-valores')) return false;
  return item?.categoria !== 'AVCB' || privacidadeDocumentoAgenda(item, titulares, sessao);
}

export function bemLegadoAgendaPermitido(item, titulares, sessao) {
  return temPermissao(sessao, 'documentos') && ['veiculo', 'maquina'].includes(item?.tipo)
    && privacidadeDocumentoAgenda(item, titulares, sessao);
}

// A ausência de titular é uma pendência, nunca uma classificação empresarial.
// Esta mesma regra é aplicada antes de consultar nome e depois da consulta.
export function documentoAgendaPermitido(item, titulares, sessao, bens = []) {
  if (!temPermissao(sessao, 'documentos') || !TIPOS_DOCUMENTOS_AGENDA.includes(item?.tipo)) return false;
  if (!privacidadeDocumentoAgenda(item, titulares, sessao)) return false;
  const porTitular = indexarTitulares(titulares);
  const titular = porTitular.get(texto(item.titularId));
  if (titular?.tipo !== 'empresa' && !temPermissao(sessao, 'documentos-pessoais')) return false;
  const origem = [item.origem, item.origemTipo].map(texto);
  const referencias = Array.isArray(item.ativoIds) ? item.ativoIds : [];
  const tiposBens = Array.isArray(bens) ? new Map(bens.map(b => [texto(b.id), b.tipo])) : bens;
  // Referência ausente/retirada pode ter sido de Segurança. Sem confirmação,
  // conserva a proteção da origem, inclusive para cadastros anteriores.
  const envolveSeguranca = origem.includes('seguranca') || referencias.some(id => !tiposBens.has(texto(id)) || tiposBens.get(texto(id)) === 'seguranca');
  return !envolveSeguranca || temPermissao(sessao, 'seguranca');
}

export function vencimentosDocumentos(itens, titulares, sessao, mes, bens = []) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes) || !temPermissao(sessao, 'documentos')) return [];
  const porTitular = indexarTitulares(titulares);
  const tiposBens = Array.isArray(bens) ? new Map(bens.map(b => [texto(b.id), b.tipo])) : bens;
  const eventos = itens.filter(item => documentoAgendaPermitido(item, porTitular, sessao, tiposBens)
    && texto(item.id) && item.semVencimento !== true && item.semVencimento !== 'true'
    && ESTADOS_COM_PRAZO.includes(texto(item.estado))
    && dataIncendioValida(item.validade) && item.validade.startsWith(mes))
    .map(item => ({
      id: `doc:${item.id}:vencimento`, documentoId: item.id, tipoDocumento: item.tipo,
      data: item.validade, titulo: `Vencimento · ${ROTULOS[item.tipo]} · ${texto(item.nome).slice(0, 180) || 'Cadastro pendente'}`,
      tipo: TIPOS[item.tipo], cor: CORES[item.tipo], origem: 'documentos',
    }));
  // O AVCB continua sendo a própria ficha predial. Sua identidade e data são
  // as da agenda do Patrimônio; nenhum segundo evento é persistido.
  if (temPermissao(sessao, 'patrimonio') || temPermissao(sessao, 'inventario-valores')) {
    eventos.push(...vencimentosIncendio(itens.filter(item => item.categoria === 'AVCB' && incendioAgendaPermitido(item, porTitular, sessao)), mes));
  }
  eventos.push(...itens.filter(item => bemLegadoAgendaPermitido(item, porTitular, sessao)
    && texto(item.id) && item.situacao !== 'baixado' && item.especificacao?.situacao !== 'baixado'
    && item.semVencimento !== true && item.semVencimento !== 'true'
    && dataIncendioValida(item.validade) && item.validade.startsWith(mes))
    .map(item => ({ id: `bem:${item.id}:documento-legado`, ativoId: item.id, tipoBem: item.tipo,
      data: item.validade, titulo: `Documento antigo · ${texto(item.nome).slice(0, 180) || 'Bem cadastrado'}`,
      tipo: 'Documentos', cor: CORES.documento, origem: 'legadoBem' })));
  return eventos.sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id));
}

export function combinarEventosCalendario(fontes, mes) {
  const porId = new Map();
  for (const evento of fontes.flat()) {
    if (evento && typeof evento.id === 'string' && evento.id && typeof evento.data === 'string'
      && evento.data.startsWith(mes) && !porId.has(evento.id)) porId.set(evento.id, evento);
  }
  return [...porId.values()].sort((a, b) => a.data.localeCompare(b.data)
    || String(a.hora || '').localeCompare(String(b.hora || ''))
    || String(a.titulo || '').localeCompare(String(b.titulo || ''), 'pt-BR'));
}

export function destinoEventoCalendario(evento, mes) {
  if (evento.origem === 'legadoBem' && evento.ativoId) return evento.tipoBem === 'veiculo'
    ? `/documentos?aba=veiculo&item=${encodeURIComponent(evento.ativoId)}`
    : `/documentos?aba=maquina&bem=${encodeURIComponent(evento.ativoId)}`;
  if (evento.origem === 'documentos' && evento.documentoId) return `/documentos?item=${encodeURIComponent(evento.documentoId)}&aba=${encodeURIComponent(evento.tipoDocumento)}`;
  if (evento.origem === 'patrimonio' && evento.ativoId) return `/patrimonio?aba=incendio&item=${encodeURIComponent(evento.ativoId)}`;
  if (evento.processoId) return `/${evento.tipoProcesso === 'consultoria' ? 'consultorias' : 'demandas'}?processo=${encodeURIComponent(evento.processoId)}&mes=${mes}`;
  if (evento.reuniaoId) return `/reunioes?encontro=${encodeURIComponent(evento.reuniaoId)}&mes=${mes}`;
  return null;
}
