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

// Busca consistente com e sem acentos, incluindo razão social e responsável.
export const textoBuscaDocumento = valor => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
export const correspondeBuscaDocumento = (item, busca) => !textoBuscaDocumento(busca) || textoBuscaDocumento([item.nome, item.categoria, item.titularNome, item.orgaoEmissor, item.responsavel].join(' ')).includes(textoBuscaDocumento(busca));

const igualMescla = (a, b) => {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const as = Object.keys(a), bs = Object.keys(b);
  return as.length === bs.length && as.every(k => Object.hasOwn(b, k) && igualMescla(a[k], b[k]));
};
function mesclarCampos(base, local, remoto, campos, prefixo = []) {
  const item = {}, conflitos = [];
  for (const campo of campos) {
    const antes = base?.[campo], meu = local?.[campo], salvo = remoto?.[campo];
    if (igualMescla(meu, antes)) { if (salvo !== undefined) item[campo] = salvo; }
    else {
      if (meu !== undefined) item[campo] = meu;
      if (!igualMescla(salvo, antes) && !igualMescla(salvo, meu)) conflitos.push({ caminho: [...prefixo, campo], local: meu, remoto: salvo });
    }
  }
  return { item, conflitos };
}
const camposPrazoDocumento = ['validade', 'semVencimento'];
const camposResponsavelDocumento = ['responsavelId', 'responsavel'];
const prazoDocumento = item => Object.fromEntries(camposPrazoDocumento.filter(campo => Object.hasOwn(item, campo)).map(campo => [campo, item[campo]]));
export function mesclarDocumentoEmConflito(base, local, remoto) {
  // A data e a indicação de ausência de vencimento são uma decisão única.
  // Mesclá-las separadamente poderia apagar a data escolhida ao salvar.
  const normalizar = item => ({ ...item, prazoDocumento: prazoDocumento(item), responsavelDocumento: Object.fromEntries(camposResponsavelDocumento.filter(campo => Object.hasOwn(item, campo)).map(campo => [campo, item[campo]])) });
  const campos = [...new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remoto), 'prazoDocumento', 'responsavelDocumento'])].filter(k => !['id', 'cadastroId', ...camposPrazoDocumento, ...camposResponsavelDocumento].includes(k));
  const mescla = mesclarCampos(normalizar(base), normalizar(local), normalizar(remoto), campos);
  const { prazoDocumento: prazo, responsavelDocumento: responsavel, ...restante } = mescla.item;
  return { ...mescla, item: { ...restante, ...prazo, ...responsavel, ...(remoto.id ? { id: remoto.id } : { cadastroId: local.cadastroId }) } };
}
const vinculoRequisito = r => ({ documentoId: r?.documentoId || '', versaoId: r?.versaoId || '', arquivoId: r?.arquivoId || '', dispensado: r?.dispensado === true, justificativa: r?.justificativa || '' });
const requisitoMesclavel = r => r ? { id: r.id, categoria: r.categoria || '', descricao: r.descricao || '', documentacao: vinculoRequisito(r) } : undefined;
export function mesclarKitEmConflito(base, local, remoto) {
  const resultado = mesclarCampos(base, local, remoto, ['nome', 'licitacaoId', 'titularId']);
  const requisitos = [], conflitos = resultado.conflitos;
  const ids = [...new Set([...(remoto.requisitos || []).map(r => r.id), ...(local.requisitos || []).map(r => r.id), ...(base.requisitos || []).map(r => r.id)])];
  for (const id of ids) {
    const b = base.requisitos?.find(r => r.id === id), l = local.requisitos?.find(r => r.id === id), r = remoto.requisitos?.find(r => r.id === id);
    const bn = requisitoMesclavel(b), ln = requisitoMesclavel(l), rn = requisitoMesclavel(r);
    if (!l || !r) {
      if (igualMescla(ln, bn)) { if (r) requisitos.push(r); }
      else if (igualMescla(rn, bn) || igualMescla(ln, rn)) { if (l) requisitos.push(l); }
      else { if (l) requisitos.push(l); conflitos.push({ caminho: ['requisitos', id], local: l, remoto: r }); }
      continue;
    }
    const mescla = mesclarCampos(bn, ln, rn, ['categoria', 'descricao', 'documentacao'], ['requisitos', id]);
    const referencia = igualMescla(mescla.item.documentacao, rn.documentacao) ? r : l;
    requisitos.push({ id, categoria: mescla.item.categoria, descricao: mescla.item.descricao, ...mescla.item.documentacao, snapshot: referencia.snapshot });
    conflitos.push(...mescla.conflitos.map(c => ({ ...c, ...(c.caminho.at(-1) === 'documentacao' ? { snapshotLocal: l.snapshot, snapshotRemoto: r.snapshot } : {}) })));
  }
  return { item: { ...local, ...resultado.item, ...(remoto.id ? { id: remoto.id } : {}), requisitos }, conflitos };
}
export function aplicarEscolhaConflito(item, conflito, escolha) {
  const valor = conflito[escolha], [campo, id, detalhe] = conflito.caminho;
  if (['prazoDocumento', 'responsavelDocumento'].includes(campo)) {
    const campos = campo === 'prazoDocumento' ? camposPrazoDocumento : camposResponsavelDocumento;
    const proximo = { ...item }; for (const chave of campos) delete proximo[chave]; return { ...proximo, ...valor };
  }
  if (campo !== 'requisitos') {
    const proximo = { ...item }; if (valor === undefined) delete proximo[campo]; else proximo[campo] = valor; return proximo;
  }
  if (!detalhe) return { ...item, requisitos: [...item.requisitos.filter(r => r.id !== id), ...(valor ? [valor] : [])] };
  return { ...item, requisitos: item.requisitos.map(r => r.id !== id ? r : detalhe === 'documentacao' ? { ...r, ...valor, snapshot: escolha === 'local' ? conflito.snapshotLocal : conflito.snapshotRemoto } : { ...r, [detalhe]: valor }) };
}
export const rotuloCampoConflito = conflito => {
  const nomes = { nome: 'Nome', categoria: 'Categoria', descricao: 'Descrição do requisito', documentacao: 'Documento, versão e dispensa', emissao: 'Emissão', prazoDocumento: 'Validade e indicação de sem vencimento', validade: 'Validade', semVencimento: 'Sem vencimento', responsavel: 'Responsável', responsavelDocumento: 'Responsável do RH', titularId: 'Titular', observacao: 'Observação', estado: 'Estado', orgaoEmissor: 'Órgão emissor', arquivo: 'Arquivo selecionado' };
  return conflito.caminho[0] === 'requisitos' ? conflito.caminho.length === 2 ? 'Requisito retirado em uma das versões' : nomes[conflito.caminho.at(-1)] || conflito.caminho.at(-1) : nomes[conflito.caminho[0]] || conflito.caminho[0];
};
export const textoValorConflito = valor => {
  if (valor && typeof valor === 'object' && camposResponsavelDocumento.some(campo => Object.hasOwn(valor, campo))) return valor.responsavel ? `${valor.responsavel}${valor.responsavelId ? '' : ' · nome legado sem vínculo ao RH'}` : valor.responsavelId ? 'Pessoa vinculada ao RH' : 'Sem responsável vinculado';
  if (valor && typeof valor === 'object' && camposPrazoDocumento.some(campo => Object.hasOwn(valor, campo))) {
    const data = dataValida(valor.validade) ? valor.validade.split('-').reverse().join('/') : valor.validade;
    if (valor.semVencimento) return data ? `Sem vencimento marcado; data informada: ${data} (conferir)` : 'Sem vencimento';
    return data ? `Validade: ${data}` : 'Validade não informada';
  }
  return valor === undefined ? 'Retirado' : typeof valor === 'boolean' ? valor ? 'Sim' : 'Não' : typeof valor === 'object' ? valor.categoria ? `${valor.categoria}: ${valor.descricao || ''}` : Object.entries(valor).filter(([, v]) => v !== '' && v !== undefined).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'Sem vínculo' : String(valor || 'Não informado');
};
