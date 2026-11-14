import {urlOficialSegura} from './licitacoes-pesquisa.mjs';

const texto = valor => typeof valor === 'string' ? valor.trim() : '';
const identidade = valor => texto(valor).normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
const categorias = new Set(['credenciamento', 'habilitacao', 'proposta']);

function codigoPncp(item) {
  const codigos = [...new Set(texto(item.processo).toUpperCase().match(/\b[0-9A-Z]{14}-[12]-\d{6}\/\d{4}\b/g) || [])];
  if (codigos.length > 1) return null;
  const codigo = codigos[0]?.match(/^([0-9A-Z]{14})-([12])-(\d{6})\/(\d{4})$/);
  const url = urlOficialSegura(item.oficialUrl);
  const origem = url && new URL(url);
  const caminho = origem?.origin === 'https://pncp.gov.br'
    ? origem.pathname.match(/^\/app\/(editais|atas)\/([0-9A-Z]{14})\/(\d{4})\/(\d{1,6})\/?$/i) : null;
  const porProcesso = codigo && [codigo[1], codigo[2], Number(codigo[3]), codigo[4]];
  const porLink = caminho && [caminho[2].toUpperCase(), caminho[1].toLowerCase() === 'editais' ? '1' : '2', Number(caminho[4]), caminho[3]];
  return porProcesso && porLink && porProcesso.join() !== porLink.join() ? null : porProcesso || porLink;
}

function identificar(item, relatorioId) {
  const pncp = codigoPncp(item);
  const orgao = identidade(item.orgao);
  const processo = identidade(item.processo);
  const numeroItem = identidade(item.item);
  const lote = identidade(item.lote);
  const grupoId = JSON.stringify(pncp ? ['pncp', ...pncp] : orgao && processo
    ? ['processo', orgao, processo] : ['origem', relatorioId, item.id]);
  const chave = JSON.stringify([grupoId, numeroItem, lote, numeroItem || lote ? '' : item.id]);
  return {grupoId, chave};
}

function normalizarDocumento(doc) {
  const nome = texto(doc?.nome);
  const orientacao = texto(doc?.orientacao);
  const referencia = texto(doc?.referencia);
  const fonteUrl = urlOficialSegura(doc?.fonteUrl);
  if (!nome || !orientacao || !referencia || !fonteUrl || !categorias.has(doc?.categoria)) return null;
  return {nome, orientacao, referencia, fonteUrl, categoria: doc.categoria,
    modeloUrl: urlOficialSegura(doc.modeloUrl), escopo: doc.escopo === 'item' ? 'item' : 'processo'};
}

function selecaoDoItem(item, relatorio) {
  const relatorioId = texto(relatorio?.id);
  if (!relatorioId || !texto(item?.id)) return null;
  const datasEdital = {};
  for (const tipo of ['sessaoPublica', 'envioProposta', 'credenciamento']) {
    const data = item.datasEdital?.[tipo];
    const fonteUrl = urlOficialSegura(data?.fonteUrl);
    if (fonteUrl && Number.isFinite(Date.parse(data?.dataHora))) {
      datasEdital[tipo] = {dataHora: data.dataHora, fonteUrl, referencia: texto(data.referencia)};
    }
  }
  const documentosEdital = Array.isArray(item.documentosEdital)
    ? item.documentosEdital.map(normalizarDocumento).filter(Boolean) : [];
  const arquivosEdital = [];
  for (const arquivo of Array.isArray(item.arquivosEdital) ? item.arquivosEdital : []) {
    const url = urlOficialSegura(arquivo?.url);
    if (url && texto(arquivo.nome)) arquivosEdital.push({nome: texto(arquivo.nome), tipo: texto(arquivo.tipo), url});
  }
  const situacao = item.situacaoEdital;
  const fonteSituacao = urlOficialSegura(situacao?.fonteUrl);
  const situacaoEdital = [2, 3, 4].includes(situacao?.codigo) && fonteSituacao && texto(situacao.nome)
    ? {codigo: situacao.codigo, nome: texto(situacao.nome), fonteUrl: fonteSituacao} : undefined;
  const campos = ['id', 'orgao', 'processo', 'item', 'lote', 'produto', 'prazo', 'classificacao'];
  const ficha = {...Object.fromEntries(campos.map(campo => [campo, texto(item[campo])])),
    oficialUrl: urlOficialSegura(item.oficialUrl), datasEdital, documentosEdital, arquivosEdital, situacaoEdital};
  return {...identificar(ficha, relatorioId), relatorioId, geradoEm: texto(relatorio.geradoEm), item: ficha};
}

export const estadoInicialInteresses = () => ({selecoes: [], prontos: [], requisitos: []});

export function lerInteresses(storage, chave) {
  const dados = JSON.parse(storage.getItem(chave) || 'null');
  if (dados === null) return estadoInicialInteresses();
  if (!Array.isArray(dados?.selecoes) || !Array.isArray(dados?.prontos)) {
    throw new Error('Não foi possível ler as seleções salvas.');
  }
  const unicas = new Map();
  for (const registro of dados.selecoes) {
    const selecao = selecaoDoItem(registro?.item, {id: registro?.relatorioId, geradoEm: registro?.geradoEm});
    if (!selecao) throw new Error('Não foi possível ler as seleções salvas.');
    unicas.set(selecao.chave, selecao);
  }
  const requisitos = [];
  for (const registro of Array.isArray(dados.requisitos) ? dados.requisitos : []) {
    const documento = normalizarDocumento(registro?.documento);
    if (documento && typeof registro.grupoId === 'string' && typeof registro.itemId === 'string') {
      requisitos.push({grupoId: registro.grupoId, itemId: registro.itemId, documento});
    }
  }
  return {selecoes: [...unicas.values()], prontos: dados.prontos.filter(id => typeof id === 'string'), requisitos};
}

export function interesseSelecionado(estado, item, relatorio) {
  return estado.selecoes.some(selecao => corresponde(selecao, item, relatorio));
}

function corresponde(selecao, item, relatorio) {
  return (selecao.relatorioId === relatorio?.id && selecao.item.id === item.id)
    || selecao.chave === identificar(item, relatorio?.id).chave;
}

export function selecionarInteresse(estado, item, relatorio) {
  const nova = selecaoDoItem(item, relatorio);
  if (!nova) throw new Error('A oportunidade está sem identificação no relatório.');
  if (interesseSelecionado(estado, item, relatorio)) return estado;
  return {...estado, selecoes: [...estado.selecoes, nova]};
}

function idDocumento(grupoId, itemId, doc) {
  return JSON.stringify([grupoId, itemId, doc.categoria, identidade(doc.nome),
    identidade(doc.referencia), identidade(doc.orientacao), doc.fonteUrl, doc.modeloUrl]);
}

export function agruparInteresses(estado, relatorio) {
  const grupos = new Map();
  const oportunidades = relatorio?.oportunidades || [];
  const ativas = new Map(oportunidades.map(item => [identificar(item, relatorio.id).chave, item]));
  for (const selecao of estado.selecoes) {
    const atual = ativas.get(selecao.chave);
    const maisRecente = atual && Date.parse(relatorio.geradoEm) >= Date.parse(selecao.geradoEm);
    const exibida = maisRecente ? selecaoDoItem(atual, relatorio) : selecao;
    if (!grupos.has(selecao.grupoId)) grupos.set(selecao.grupoId, []);
    grupos.get(selecao.grupoId).push(exibida);
  }
  const prontos = new Set(estado.prontos);
  return Array.from(grupos, ([id, itens]) => {
    itens.sort((a, b) => b.geradoEm.localeCompare(a.geradoEm));
    const documentos = new Map();
    const incluir = (doc, selecao, manual = false) => {
      const chave = idDocumento(id, selecao?.chave || '', doc);
      if (documentos.has(chave)) return;
      const item = selecao?.item;
      const rotulo = item && ([item.item, item.lote, item.produto].filter(Boolean).join(' · ') || item.id);
      documentos.set(chave, {...doc, id: chave, itens: rotulo ? [rotulo] : [], manual});
    };
    for (const selecao of itens) {
      for (const doc of selecao.item.documentosEdital) incluir(doc, doc.escopo === 'item' ? selecao : null);
    }
    for (const {grupoId, itemId, documento} of estado.requisitos) {
      if (grupoId !== id) continue;
      const selecao = itemId && itens.find(item => item.chave === itemId);
      if (!itemId || selecao) incluir(documento, selecao, true);
    }
    const lista = [...documentos.values()];
    return {id, itens, documentos: lista, prontos: lista.filter(doc => prontos.has(doc.id)).map(doc => doc.id)};
  });
}

export function requisitosConferidos(estado, item, relatorio) {
  const {grupoId, chave} = identificar(item, relatorio.id);
  const publicados = new Set((item.documentosEdital || []).map(normalizarDocumento).filter(Boolean)
    .map(doc => idDocumento(grupoId, doc.escopo === 'item' ? chave : '', doc)));
  return estado.requisitos.filter(({grupoId: processo, itemId, documento}) => processo === grupoId
    && (!itemId || itemId === chave) && !publicados.has(idDocumento(grupoId, itemId, documento)))
    .map(({documento, itemId}) => ({...documento, id: idDocumento(grupoId, itemId, documento), manual: true}));
}

function requisitoInvalido(mensagem) {
  return Object.assign(new Error(mensagem), {name: 'RequisitoInvalido'});
}

export function salvarRequisitos(estado, grupoId, itemId, campos, processo = '') {
  const selecoes = estado.selecoes.filter(selecao => selecao.grupoId === grupoId);
  if (!selecoes.length || (itemId && !selecoes.some(item => item.chave === itemId))) {
    throw requisitoInvalido('Selecione o item antes de incluir um requisito.');
  }
  const pncp = processo && codigoPncp({processo})?.join();
  if (processo && (!pncp || !selecoes.some(({item}) => codigoPncp(item)?.join() === pncp))) {
    throw requisitoInvalido('O arquivo pertence a outro processo do PNCP.');
  }
  if (!Array.isArray(campos) || !campos.length || campos.length > 60) {
    throw requisitoInvalido('O arquivo deve conter de 1 a 60 requisitos.');
  }
  const requisitos = new Map(estado.requisitos.map(r => [idDocumento(r.grupoId, r.itemId, r.documento), r]));
  for (const registro of campos) {
    const especifico = registro?.escopo === 'item' || (registro?.escopo !== 'processo' && itemId);
    if (especifico && !itemId) throw requisitoInvalido('Escolha o item ou lote para importar os requisitos específicos.');
    const chaveItem = especifico ? itemId : '';
    const documento = normalizarDocumento({...registro, escopo: especifico ? 'item' : 'processo'});
    if (!documento || (registro?.modeloUrl && !documento.modeloUrl)) {
      throw requisitoInvalido('Cada requisito precisa de nome, categoria, orientação, referência e link HTTPS do edital.');
    }
    const chave = idDocumento(grupoId, chaveItem, documento);
    if (!requisitos.has(chave)) requisitos.set(chave, {grupoId, itemId: chaveItem, documento});
  }
  return requisitos.size === estado.requisitos.length ? estado : {...estado, requisitos: [...requisitos.values()]};
}

export function removerRequisito(estado, docId) {
  return {...estado, requisitos: estado.requisitos.filter(r => idDocumento(r.grupoId, r.itemId, r.documento) !== docId),
    prontos: estado.prontos.filter(id => id !== docId)};
}

export function marcarDocumento(estado, grupoId, docId, pronto, relatorio) {
  const grupo = agruparInteresses(estado, relatorio).find(item => item.id === grupoId);
  if (!grupo?.documentos.some(doc => doc.id === docId)) return estado;
  const prontos = new Set(estado.prontos);
  if (pronto) prontos.add(docId);
  else prontos.delete(docId);
  return {...estado, prontos: [...prontos]};
}

export function removerInteresse(estado, chave) {
  const retirada = estado.selecoes.find(selecao => selecao.chave === chave);
  if (!retirada) return estado;
  const selecoes = estado.selecoes.filter(selecao => selecao.chave !== chave);
  const grupoMantido = selecoes.some(selecao => selecao.grupoId === retirada.grupoId);
  const retiradaPrefixo = grupoMantido ? [retirada.grupoId, chave] : [retirada.grupoId];
  const prefixo = JSON.stringify(retiradaPrefixo).slice(0, -1) + ',';
  const requisitos = estado.requisitos.filter(registro => registro.grupoId !== retirada.grupoId
    || (grupoMantido && registro.itemId !== chave));
  return {...estado, selecoes, requisitos, prontos: estado.prontos.filter(id => !id.startsWith(prefixo))};
}
