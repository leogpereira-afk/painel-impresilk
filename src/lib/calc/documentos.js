// Controles por data. Bens físicos e medidores continuam no cálculo legado.
export const ABAS_DOCUMENTOS = { documento: 'Documentos', veiculo: 'Veículos', garantia: 'Garantias', seguro: 'Seguros' };
export const ESTADOS_CONTROLE = { ativo: 'Ativo', renovacao: 'Em renovação', cancelado: 'Cancelado', encerrado: 'Encerrado' };
export const ESTADOS_ACIONAMENTO = { aberto: 'Aberto', 'em-atendimento': 'Em atendimento', resolvido: 'Resolvido' };
export const PAGAMENTOS = { pendente: 'Pendente', pago: 'Pago', 'nao-se-aplica': 'Não se aplica' };
export const CATEGORIAS_DOCUMENTOS = {
  empresa: ['Cartão CNPJ', 'Contrato social', 'Inscrição estadual', 'Inscrição municipal', 'Alvará de funcionamento', 'AVCB', 'CND Federal', 'CND Estadual', 'CND Municipal', 'CRF do FGTS', 'Certidão trabalhista', 'Licença ambiental', 'Comprovante de endereço'],
  pessoa: ['RG', 'CPF', 'CNH', 'Comprovante de endereço', 'Certidão pessoal', 'Registro profissional'],
  veiculo: ['CRLV / licenciamento', 'IPVA', 'CNH', 'Seguro', 'Inspeção veicular'],
  garantia: ['Equipamento', 'Veículo', 'Mobiliário', 'Serviço', 'Estrutura'],
  seguro: ['Empresarial / predial', 'Veículos / frota', 'Equipamentos', 'Responsabilidade civil', 'Vida', 'Transporte de carga', 'Incêndio', 'Riscos diversos'],
};

export function dataValida(data) {
  if (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const [ano, mes, dia] = data.split('-').map(Number);
  if (ano < 1900 || ano > 2200 || mes < 1 || mes > 12 || dia < 1) return false;
  return dia <= new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}
const diaUTC = data => { const [ano, mes, dia] = data.split('-').map(Number); return Date.UTC(ano, mes - 1, dia); };
export function situacaoDocumento(item, hoje) {
  if (['cancelado', 'encerrado'].includes(item.estado)) return { nivel: 'encerrado', rotulo: ESTADOS_CONTROLE[item.estado], dias: null };
  if (item.semVencimento === true && !item.validade) return { nivel: 'semVencimento', rotulo: 'Sem vencimento', dias: null };
  if (!dataValida(item.validade)) return { nivel: 'sem', rotulo: item.validade ? 'Data inválida' : 'Prazo não informado', dias: null };
  if (!dataValida(hoje)) return { nivel: 'sem', rotulo: 'Data de referência inválida', dias: null };
  const dias = Math.round((diaUTC(item.validade) - diaUTC(hoje)) / 86400000);
  const alerta = Number.isFinite(Number(item.alertaDias)) && item.alertaDias !== '' && item.alertaDias != null ? Math.max(0, Number(item.alertaDias)) : 30;
  if (dias < 0) return { nivel: 'vencido', rotulo: `Vencido há ${Math.abs(dias)} dias`, dias };
  if (item.tipo === 'seguro' && !dataValida(item.emissao)) return { nivel: 'sem', rotulo: 'Início da vigência não informado', dias };
  if (dataValida(item.emissao) && item.emissao > hoje) return { nivel: 'futuro', rotulo: `A iniciar em ${Math.round((diaUTC(item.emissao) - diaUTC(hoje)) / 86400000)} dias`, dias };
  if (dias <= alerta) return { nivel: 'urgente', rotulo: dias === 0 ? 'Vence hoje' : `Vence em ${dias} dias`, dias };
  return { nivel: 'ok', rotulo: `Vence em ${dias} dias`, dias };
}

export function calcDocumentos(itens, hoje) {
  const peso = { vencido: 0, urgente: 1, sem: 2, futuro: 3, ok: 4, semVencimento: 5, encerrado: 6 };
  const lista = (itens || []).filter(i => ['documento', 'garantia', 'seguro'].includes(i.tipo)).map(i => ({ ...i, sit: situacaoDocumento(i, hoje) }));
  lista.sort((a, b) => peso[a.sit.nivel] - peso[b.sit.nivel] || (a.sit.dias ?? Infinity) - (b.sit.dias ?? Infinity) || String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
  const contar = nivel => lista.filter(i => i.sit.nivel === nivel).length;
  return { lista, kpis: { total: lista.length, vencidos: contar('vencido'), urgentes: contar('urgente'), semPrazo: contar('sem'), semVencimento: contar('semVencimento'), pendencias: lista.filter(i => !i.titularId || i.classificacaoPendente).length }, criticos: lista.filter(i => ['vencido', 'urgente'].includes(i.sit.nivel)) };
}

// Enquanto uma classificação de registros antigos não for aprovada, conservar
// o aviso da data explícita da ficha. Bens sem prazo não viram documentos.
export function alertasDocumentosLegados(bens, hoje) {
  return (bens || []).filter(b => b.documentoLegado === true && b.disponivel !== false && dataValida(b.validade))
    .map(b => ({ id: `legado:${b.id}`, bemId: b.id, bemTipo: b.tipo, origem: 'legado-bem', nome: `Documento antigo · ${b.nome || b.identificacao || 'Bem cadastrado'}`, sit: situacaoDocumento({validade:b.validade},hoje) }))
    .filter(b => ['vencido','urgente'].includes(b.sit.nivel));
}

export function nomeTitular(titular, pessoas = []) {
  const pessoa = titular?.pessoaId ? pessoas.find(p => p.id === titular.pessoaId) : null;
  return pessoa?.nome || titular?.nome || 'Titular pendente';
}
export const controlesDoBem = (itens, id) => (itens || []).filter(i => Array.isArray(i.ativoIds) && i.ativoIds.includes(id));
export const ehVeiculo = bem => ['veiculo', 'carro', 'carros'].includes(bem.tipo) || ['veiculo', 'carro', 'carros'].includes(bem.categoria);
export function filtrarDocumentos(itens, { busca = '', titularId = '', status = '', categoria = '', rh = '' } = {}, titulares = [], pessoas = []) {
  const q = busca.trim().toLocaleLowerCase('pt-BR');
  return itens.filter(item => {
    const titular = titulares.find(t => t.id === item.titularId);
    if (titularId === '__pendente__' ? !!titular : titularId && item.titularId !== titularId) return false;
    if (status && item.sit?.nivel !== status) return false;
    if (categoria && item.categoria !== categoria) return false;
    if (rh === '__com__' && !titular?.pessoaId && !item.responsavelId) return false;
    if (rh === '__sem__' && (titular?.pessoaId || item.responsavelId)) return false;
    if (rh && !rh.startsWith('__') && titular?.pessoaId !== rh && item.responsavelId !== rh) return false;
    return !q || [item.nome, item.identificacao, item.categoria, item.seguradora, item.fornecedor, item.estabelecimento, nomeTitular(titular, pessoas), item.contato?.nome].join(' ').toLocaleLowerCase('pt-BR').includes(q);
  });
}
export function situacaoRequisito(requisito, itens) {
  if (requisito.estado === 'nao-se-aplica') return { nivel: 'nao-se-aplica', rotulo: 'Não se aplica', item: null };
  const item = itens.find(i => i.id === requisito.documentoId && i.titularId === requisito.titularId);
  if (!item) return { nivel: 'faltante', rotulo: requisito.documentoId ? 'Vínculo indisponível' : 'Documento faltante', item: null };
  return { ...item.sit, item };
}

const CAMPOS = ['id', 'cadastroId', 'tipo', 'nome', 'categoria', 'identificacao', 'titularId', 'ativoIds', 'responsavel', 'responsavelId', 'emissao', 'validade', 'semVencimento', 'alertaDias', 'estado', 'orgaoEmissor', 'estabelecimento', 'contato', 'assistencia', 'linkOficial', 'fornecedor', 'fabricante', 'compra', 'tipoGarantia', 'condicoes', 'cobertura', 'obrigacaoPagamento', 'pagamentoSituacao', 'seguradora', 'valor', 'valorSegurado', 'observacao', 'acionamentos'];
export function controleEditavel(item) {
  const payload = Object.fromEntries(CAMPOS.filter(campo => Object.hasOwn(item, campo) && item[campo] !== undefined).map(campo => [campo, item[campo]]));
  if (payload.id) delete payload.cadastroId;
  else delete payload.id;
  if (payload.tipo !== 'seguro') { delete payload.valor; delete payload.valorSegurado; }
  for (const grupo of ['contato', 'assistencia']) if (payload[grupo]) payload[grupo] = Object.fromEntries(['nome','telefone','whatsapp','email','endereco'].filter(campo => Object.hasOwn(payload[grupo], campo)).map(campo => [campo,payload[grupo][campo]]));
  if (payload.acionamentos) payload.acionamentos = payload.acionamentos.map(a => Object.fromEntries(['id','data','problema','encaminhamento','protocolo','retorno','solucao','estado','observacao'].filter(campo => Object.hasOwn(a, campo)).map(campo => [campo,a[campo]])));
  return payload;
}
export function validarControle(item, renovacao = false, temNovoArquivo = false) {
  if (!String(item.nome || '').trim()) return 'Informe o nome do controle.';
  if (!String(item.categoria || '').trim()) return 'Informe a categoria do controle.';
  if (!item.titularId) return 'Selecione o titular pelo cadastro.';
  if (item.semVencimento && item.validade) return 'Escolha uma data de vencimento ou marque sem vencimento.';
  for (const [chave, rotulo] of [['emissao', 'emissão / início'], ['validade', 'vencimento'], ['compra', 'compra']]) if (item[chave] && !dataValida(item[chave])) return `Informe uma data válida para ${rotulo}.`;
  if (item.emissao && item.validade && item.emissao > item.validade) return 'O vencimento deve ser igual ou posterior à emissão / início.';
  if (item.alertaDias !== '' && (!Number.isInteger(Number(item.alertaDias)) || Number(item.alertaDias) < 0 || Number(item.alertaDias) > 365)) return 'O alerta deve ser um número de dias entre 0 e 365.';
  if (item.linkOficial && !/^https?:\/\/[^\s]+$/i.test(item.linkOficial)) return 'O link oficial deve começar com https:// ou http://.';
  if (renovacao && !temNovoArquivo) return 'Anexe o arquivo da renovação para preservar o histórico.';
  if (renovacao && !item.validade && !item.semVencimento) return 'Informe o novo vencimento ou marque sem vencimento.';
  for (const acao of item.acionamentos || []) if (!dataValida(acao.data) || !String(acao.problema || '').trim()) return 'Cada acionamento precisa de data válida e descrição do problema.';
  return '';
}
