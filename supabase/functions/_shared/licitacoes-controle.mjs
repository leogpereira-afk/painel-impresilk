// Pure ECMAScript core: usable from Node and Deno without filesystem, process or network access.
// municipios.json is the human-editable canonical registry; the CLI checks that this bundled copy matches it.
export const MUNICIPIOS = Object.freeze([
  'Águas Vermelhas', 'Berizal', 'Bocaiúva', 'Bonito de Minas', 'Botumirim', 'Brasília de Minas', 'Buritizeiro', 'Campo Azul', 'Capitão Enéas', 'Catuti',
  'Chapada Gaúcha', 'Claro dos Poções', 'Cônego Marinho', 'Coração de Jesus', 'Cristália', 'Curral de Dentro', 'Divisa Alegre', 'Engenheiro Navarro', 'Espinosa', 'Francisco Dumont',
  'Francisco Sá', 'Fruta de Leite', 'Gameleiras', 'Glaucilândia', 'Grão Mogol', 'Guaraciama', 'Ibiaí', 'Ibiracatu', 'Icaraí de Minas', 'Indaiabira',
  'Itacambira', 'Itacarambi', 'Jaíba', 'Janaúba', 'Januária', 'Japonvar', 'Jequitaí', 'Josenópolis', 'Juramento', 'Juvenília',
  'Lagoa dos Patos', 'Lassance', 'Lontra', 'Luislândia', 'Mamonas', 'Manga', 'Matias Cardoso', 'Mato Verde', 'Mirabela', 'Miravânia',
  'Montalvânia', 'Monte Azul', 'Montes Claros', 'Montezuma', 'Ninheira', 'Nova Porteirinha', 'Novorizonte', 'Olhos-d’Água', 'Padre Carvalho', 'Pai Pedro',
  'Patis', 'Pedras de Maria da Cruz', 'Pintópolis', 'Pirapora', 'Ponto Chique', 'Porteirinha', 'Riachinho', 'Riacho dos Machados', 'Rio Pardo de Minas', 'Rubelita',
  'Salinas', 'Santa Cruz de Salinas', 'Santa Fé de Minas', 'Santo Antônio do Retiro', 'São Francisco', 'São João da Lagoa', 'São João da Ponte', 'São João das Missões', 'São João do Pacuí', 'São João do Paraíso',
  'São Romão', 'Serranópolis de Minas', 'Taiobeiras', 'Ubaí', 'Urucuia', 'Vargem Grande do Rio Pardo', 'Várzea da Palma', 'Varzelândia', 'Verdelândia',
]);
export const ETAPAS_PADRAO = Object.freeze(['PNCP', 'PORTAIS_MUNICIPAIS', 'DIARIO_OFICIAL', 'COMPRAS_CENTRALIZADAS']);
export const INSTITUICOES_PADRAO = Object.freeze([
  'SAMU 192 / CISRUN / SAMU Macro Norte', 'Sebrae Minas', 'Sesi', 'Senai', 'Sesc', 'Senac', 'Senar', 'Sest', 'Senat',
  'Codanorte', 'CIMAMS', 'Outros consórcios públicos e de saúde', 'Hospitais públicos e unidades públicas de saúde',
  'Secretarias e fundos estaduais de saúde', 'Unimontes', 'IFNMG', 'IFMG', 'UFMG / ICA', 'Outras unidades públicas de ensino e compras centralizadas',
  'Órgãos estaduais e federais com atendimento regional', 'Polícia Militar', 'Polícia Civil', 'Corpo de Bombeiros', 'Unidades prisionais',
  'Órgãos de justiça', 'Ministério Público', 'Defensoria Pública', 'Conselhos profissionais', 'Cemig', 'Copasa', 'Correios',
  'Outras instituições com compras destinadas ao Norte de Minas',
]);
export const STATUS = Object.freeze({ COM: 'PESQUISA CONCLUÍDA COM CANDIDATOS.', SEM: 'PESQUISA CONCLUÍDA SEM CANDIDATOS LOCALIZADOS.', PARCIAL: 'PESQUISA PARCIAL.', NAO: 'NÃO CONSULTADO' });

export const PORTFOLIO = Object.freeze(['COMUNICACAO_VISUAL', 'ACM', 'LETRAS_CAIXA', 'LETREIROS', 'TOTENS', 'SINALIZACAO', 'PLACAS', 'LONAS', 'BANNERS', 'ADESIVOS', 'ENVELOPAMENTO', 'IMPRESSAO_DIGITAL', 'IMPRESSAO_UV', 'DISPLAYS', 'OUTRO_APROVADO']);
export const ESQUEMA_PUBLICO = Object.freeze({
  dossie: ['periodo', 'geradoEm', 'escopoMunicipal', 'plano', 'fontes', 'recibos', 'candidatos', 'instituicoes', 'coberturaDeclarada'],
  periodo: ['inicio', 'fim'], plano: ['etapasMunicipais', 'justificativa'],
  fonte: ['id', 'url', 'oficial', 'verificadaEm', 'evidenciaOficial'],
  recibo: ['id', 'fonteId', 'consultadoEm', 'atualizadoEm', 'periodo', 'consulta', 'municipios', 'instituicoes', 'etapa', 'etapasEquivalentes', 'escopoEvidencia', 'resultado', 'conclusao', 'resumo', 'itensExaminadosIntegralmente', 'paginacao', 'coberturaEntes', 'coberturaInstituicoes', 'criterioTerritorial', 'pendencia', 'alternativaPara'],
  paginacao: ['completa', 'total', 'paginasConsultadas'],
  coberturaEntes: ['prefeituraUnidades', 'camara', 'entesIndiretos', 'evidencia'],
  coberturaInstituicoes: ['unidades', 'escopoCompleto', 'evidencia'],
  instituicao: ['nome', 'etapasObrigatorias', 'justificativaPlano'],
  candidato: ['id', 'processo', 'orgao', 'item', 'lote', 'familiaPortfolio', 'produto', 'evidenciaPortfolio', 'referenciaAprovacaoPortfolio', 'reciboIds', 'oficialUrl', 'prazo', 'exigencias', 'proximaAcao', 'classificacao', 'justificativa', 'localExecucao', 'validacoes'],
  localExecucao: ['municipios', 'apenasSede', 'misto', 'logisticaViavel', 'evidencia'],
  validacoes: ['tecnica', 'documental', 'comercial', 'logistica'],
  validacao: ['estado', 'confirmadaEm', 'referenciaPublicavel', 'resumoPublico'],
});
function assertObject(value, schema, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`${path}: precisa ser objeto JSON público.`);
  for (const key of Object.keys(value)) if (!ESQUEMA_PUBLICO[schema].includes(key)) throw new Error(`${path}.${key}: campo não permitido no dossiê público.`);
}
function assertArray(value, path, primitive = null) {
  if (!Array.isArray(value)) throw new Error(`${path}: precisa ser lista.`);
  if (primitive && value.some(item => typeof item !== primitive)) throw new Error(`${path}: lista deve conter somente ${primitive}.`);
}
function assertScalars(value, path, strings = [], booleans = [], numbers = []) {
  for (const key of strings) if (key in value && typeof value[key] !== 'string') throw new Error(`${path}.${key}: precisa ser texto público.`);
  for (const key of booleans) if (key in value && typeof value[key] !== 'boolean') throw new Error(`${path}.${key}: precisa ser booleano.`);
  for (const key of numbers) if (key in value && (typeof value[key] !== 'number' || !Number.isFinite(value[key]))) throw new Error(`${path}.${key}: precisa ser número finito.`);
}
export function validarDossiePublico(dossie) {
  assertObject(dossie, 'dossie', 'dossie');
  assertScalars(dossie, 'dossie', ['geradoEm'], [], ['coberturaDeclarada']);
  if (dossie.periodo !== undefined && dossie.periodo !== null) { assertObject(dossie.periodo, 'periodo', 'periodo'); assertScalars(dossie.periodo, 'periodo', ['inicio', 'fim']); }
  if (dossie.escopoMunicipal !== undefined) assertArray(dossie.escopoMunicipal, 'escopoMunicipal', 'string');
  if (dossie.plano !== undefined) {
    assertObject(dossie.plano, 'plano', 'plano'); assertScalars(dossie.plano, 'plano', ['justificativa']);
    if (dossie.plano.etapasMunicipais !== undefined) assertArray(dossie.plano.etapasMunicipais, 'plano.etapasMunicipais', 'string');
  }
  for (const collection of ['fontes', 'recibos', 'candidatos', 'instituicoes']) if (collection in dossie) assertArray(dossie[collection], collection);
  for (const [i, source] of (dossie.fontes || []).entries()) {
    const path = `fontes[${i}]`; assertObject(source, 'fonte', path); assertScalars(source, path, ['id', 'url', 'verificadaEm', 'evidenciaOficial'], ['oficial']);
  }
  for (const [i, institution] of (dossie.instituicoes || []).entries()) {
    const path = `instituicoes[${i}]`; assertObject(institution, 'instituicao', path); assertScalars(institution, path, ['nome', 'justificativaPlano']);
    if (institution.etapasObrigatorias !== undefined) assertArray(institution.etapasObrigatorias, `${path}.etapasObrigatorias`, 'string');
  }
  for (const [i, receipt] of (dossie.recibos || []).entries()) {
    const path = `recibos[${i}]`; assertObject(receipt, 'recibo', path);
    assertScalars(receipt, path, ['id', 'fonteId', 'consultadoEm', 'atualizadoEm', 'consulta', 'etapa', 'escopoEvidencia', 'resultado', 'conclusao', 'resumo', 'criterioTerritorial', 'pendencia'], ['itensExaminadosIntegralmente']);
    if (receipt.periodo !== undefined) { assertObject(receipt.periodo, 'periodo', `${path}.periodo`); assertScalars(receipt.periodo, `${path}.periodo`, ['inicio', 'fim']); }
    for (const key of ['municipios', 'instituicoes', 'alternativaPara', 'etapasEquivalentes']) if (key in receipt) assertArray(receipt[key], `${path}.${key}`, 'string');
    if (receipt.paginacao !== undefined) {
      assertObject(receipt.paginacao, 'paginacao', `${path}.paginacao`); assertScalars(receipt.paginacao, `${path}.paginacao`, [], ['completa'], ['total']);
      if (receipt.paginacao.paginasConsultadas !== undefined) assertArray(receipt.paginacao.paginasConsultadas, `${path}.paginacao.paginasConsultadas`, 'number');
    }
    if (receipt.coberturaEntes !== undefined) { assertObject(receipt.coberturaEntes, 'coberturaEntes', `${path}.coberturaEntes`); assertScalars(receipt.coberturaEntes, `${path}.coberturaEntes`, ['entesIndiretos', 'evidencia'], ['prefeituraUnidades', 'camara']); }
    if (receipt.coberturaInstituicoes !== undefined) {
      assertObject(receipt.coberturaInstituicoes, 'coberturaInstituicoes', `${path}.coberturaInstituicoes`);
      assertScalars(receipt.coberturaInstituicoes, `${path}.coberturaInstituicoes`, ['evidencia'], ['escopoCompleto']);
      if (receipt.coberturaInstituicoes.unidades !== undefined) assertArray(receipt.coberturaInstituicoes.unidades, `${path}.coberturaInstituicoes.unidades`, 'string');
    }
  }
  for (const [i, candidate] of (dossie.candidatos || []).entries()) {
    const path = `candidatos[${i}]`; assertObject(candidate, 'candidato', path);
    assertScalars(candidate, path, ['id', 'processo', 'orgao', 'item', 'lote', 'familiaPortfolio', 'produto', 'evidenciaPortfolio', 'referenciaAprovacaoPortfolio', 'oficialUrl', 'prazo', 'proximaAcao', 'classificacao', 'justificativa']);
    for (const key of ['reciboIds', 'exigencias']) if (key in candidate) assertArray(candidate[key], `${path}.${key}`, 'string');
    if (candidate.localExecucao !== undefined) {
      assertObject(candidate.localExecucao, 'localExecucao', `${path}.localExecucao`); assertScalars(candidate.localExecucao, `${path}.localExecucao`, ['evidencia'], ['apenasSede', 'misto', 'logisticaViavel']);
      if (candidate.localExecucao.municipios !== undefined) assertArray(candidate.localExecucao.municipios, `${path}.localExecucao.municipios`, 'string');
    }
    if (candidate.validacoes !== undefined) {
      assertObject(candidate.validacoes, 'validacoes', `${path}.validacoes`);
      for (const key of ESQUEMA_PUBLICO.validacoes) if (candidate.validacoes[key] !== undefined) {
        const confirmation = candidate.validacoes[key];
        assertObject(confirmation, 'validacao', `${path}.validacoes.${key}`);
        assertScalars(confirmation, `${path}.validacoes.${key}`, ['estado', 'confirmadaEm', 'referenciaPublicavel', 'resumoPublico']);
      }
    }
  }
  return true;
}
const text = value => typeof value === 'string' && value.trim().length > 0;
const unique = values => [...new Set(values)];
const array = value => Array.isArray(value) ? value : [];
const samePeriod = (a, b) => a?.inicio === b?.inicio && a?.fim === b?.fim;
const coversStage = (receipt, stage) => receipt.etapa === stage || array(receipt.etapasEquivalentes).includes(stage);
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(value) && validDay(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
const validDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
function url(value) {
  try { const parsed = new URL(value); return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed : null; } catch { return null; }
}
function sourceReasons(source) {
  const reasons = [];
  if (!source || !text(source.id) || !url(source.url)) reasons.push('Fonte ausente ou URL HTTPS inválida.');
  if (source?.oficial !== true || !text(source?.evidenciaOficial) || !validDate(source?.verificadaEm)) reasons.push('Oficialidade e data de verificação da fonte não documentadas.');
  return reasons;
}
function receiptReasons(receipt, source) {
  const reasons = sourceReasons(source);
  if (!validDate(receipt.consultadoEm)) reasons.push('Data/hora da consulta inválida ou ausente.');
  if (!text(receipt.consulta)) reasons.push('Consulta/filtros não registrados.');
  if (!text(receipt.escopoEvidencia)) reasons.push('Evidência de abrangência explícita ausente.');
  if (!text(receipt.resumo)) reasons.push('Resultado examinado sem resumo ou evidência registrada.');
  if (receipt.resultado !== 'CONCLUÍDA') reasons.push(`Consulta ${receipt.resultado || 'sem resultado'}: ${receipt.pendencia || 'registrar falha e próxima verificação'}.`);
  if (!['COM_CANDIDATOS', 'SEM_CANDIDATOS'].includes(receipt.conclusao)) reasons.push('Conclusão da consulta ausente ou indeterminada.');
  if (receipt.itensExaminadosIntegralmente !== true) reasons.push('Exame integral dos resultados não concluído.');
  const p = receipt.paginacao;
  if (!p || p.completa !== true || !Number.isInteger(p.total) || p.total < 1 || array(p.paginasConsultadas).some(n => !Number.isInteger(n) || n < 1 || n > p.total) || unique(array(p.paginasConsultadas)).length !== p.total) reasons.push('Paginação não concluída ou não demonstrada.');
  if (coversStage(receipt, 'PORTAIS_MUNICIPAIS')) {
    const c = receipt.coberturaEntes;
    if (c?.prefeituraUnidades !== true || c?.camara !== true || !['ABRANGIDOS', 'NÃO_APLICÁVEL'].includes(c?.entesIndiretos) || !text(c?.evidencia)) reasons.push('Escopo dos entes municipais/câmara/administração indireta incompleto.');
  }
  if (coversStage(receipt, 'COMPRAS_CENTRALIZADAS') && receipt.criterioTerritorial !== 'ENTREGA_EXECUCAO') reasons.push('Busca centralizada não demonstrou destinos de entrega/execução; sede é insuficiente.');
  if (array(receipt.instituicoes).length > 0) {
    const c = receipt.coberturaInstituicoes;
    if (c?.escopoCompleto !== true || array(c?.unidades).length === 0 || array(c?.unidades).some(unit => !text(unit)) || !text(c?.evidencia)) reasons.push('Abrangência das unidades/bases/compras institucionais não demonstrada integralmente.');
  }
  return reasons;
}
function baseReceiptValid(receipt, source) {
  return sourceReasons(source).length === 0 && validDate(receipt.consultadoEm) && text(receipt.consulta) && text(receipt.escopoEvidencia) && receipt.resultado !== 'INACESSÍVEL';
}
function stagePlan(value, fallback, justification) {
  if (value === undefined) return [...fallback];
  if (!Array.isArray(value) || value.length === 0 || value.some(item => !text(item)) || unique(value).length !== value.length) throw new Error('Plano de etapas precisa de lista não vazia e sem duplicatas.');
  if (fallback.some(stage => !value.includes(stage)) && !text(justification)) throw new Error('Etapas padrão omitidas exigem justificativa explícita do plano e evidência equivalente nos recibos.');
  return [...value];
}
function latestReceipts(records, period, warnings) {
  const current = new Map();
  for (const receipt of records) {
    if (!receipt || !text(receipt.id)) throw new Error('Todo recibo precisa de ID estável.');
    if (!samePeriod(receipt.periodo, period)) { warnings.push(`Recibo ${receipt.id} de outro período foi ignorado; não fornece cobertura atual.`); continue; }
    const scopes = array(receipt.municipios);
    if (scopes.some(municipio => !MUNICIPIOS.includes(municipio))) throw new Error(`Recibo ${receipt.id} contém município fora do escopo obrigatório de 89 municípios.`);
    if (!text(receipt.etapa) || !Array.isArray(receipt.municipios) || !Array.isArray(receipt.instituicoes)) throw new Error(`Recibo ${receipt.id}: etapa e listas explícitas de municípios/instituições são obrigatórias.`);
    const prior = current.get(receipt.id);
    if (!prior) { current.set(receipt.id, structuredClone(receipt)); continue; }
    const newTime = Date.parse(receipt.atualizadoEm || receipt.consultadoEm) || 0;
    const oldTime = Date.parse(prior.atualizadoEm || prior.consultadoEm) || 0;
    if (newTime > oldTime) current.set(receipt.id, structuredClone(receipt));
    else if (newTime === oldTime && JSON.stringify(prior) !== JSON.stringify(receipt)) throw new Error(`Versões conflitantes do recibo ${receipt.id}; informe uma atualização com data/hora posterior.`);
  }
  return [...current.values()];
}
function institutionRegistry(provided) {
  const defaults = new Map(INSTITUICOES_PADRAO.map(nome => [nome, { nome, etapasObrigatorias: ['PORTAL_PROPRIO', 'COMPRAS_CENTRALIZADAS'] }]));
  for (const item of provided) {
    if (!item || !text(item.nome)) throw new Error('Instituição precisa de nome explícito.');
    const etapasObrigatorias = stagePlan(item.etapasObrigatorias, ['PORTAL_PROPRIO', 'COMPRAS_CENTRALIZADAS'], item.justificativaPlano);
    if (['Sebrae Minas', 'Sesi', 'Senai', 'Sesc', 'Senac', 'Senar', 'Sest', 'Senat'].includes(item.nome) && !etapasObrigatorias.includes('PORTAL_PROPRIO')) throw new Error(`Sebrae e Sistema S exigem consulta própria: ${item.nome}.`);
    defaults.set(item.nome, { ...item, etapasObrigatorias });
  }
  return [...defaults.values()];
}
function classifyCandidate(candidate, receipts, sources, reference) {
  const reasons = [];
  if (!text(candidate.id) || !text(candidate.processo) || !text(candidate.orgao)) reasons.push('Identificação de oportunidade/processo/órgão incompleta.');
  if (!text(candidate.item) && !text(candidate.lote)) reasons.push('Item ou lote específico ausente.');
  if (!PORTFOLIO.includes(candidate.familiaPortfolio) || !text(candidate.produto) || !text(candidate.evidenciaPortfolio)) reasons.push('Aderência ao portfólio no item/lote não comprovada.');
  if (candidate.familiaPortfolio === 'OUTRO_APROVADO' && !text(candidate.referenciaAprovacaoPortfolio)) reasons.push('Produto adicional sem referência da aprovação no portfólio.');
  if (!['GO', 'NO-GO', 'REVISÃO HUMANA'].includes(candidate.classificacao) || !text(candidate.justificativa)) reasons.push('Classificação ou justificativa ausente.');
  const links = array(candidate.reciboIds).map(id => receipts.find(receipt => receipt.id === id));
  if (links.length === 0 || links.some(receipt => !receipt || !baseReceiptValid(receipt, sources.get(receipt.fonteId)))) reasons.push('Vínculo com consulta oficial atual e evidenciada ausente ou inválido.');
  const official = url(candidate.oficialUrl);
  if (!official || ![...sources.values()].some(source => sourceReasons(source).length === 0 && url(source.url)?.hostname === official.hostname)) reasons.push('Link oficial não consta do registro de fontes oficiais verificadas.');
  if (!validDate(candidate.prazo)) reasons.push('Prazo com data, hora e fuso não registrado.');
  if (!Array.isArray(candidate.exigencias) || candidate.exigencias.length === 0 || candidate.exigencias.some(value => !text(value))) reasons.push('Exigências do item/lote não registradas.');
  if (!text(candidate.proximaAcao)) reasons.push('Próxima ação recomendada ausente.');
  const place = candidate.localExecucao;
  const destinations = array(place?.municipios);
  const regional = destinations.filter(municipio => MUNICIPIOS.includes(municipio));
  if (place?.apenasSede !== false || !text(place?.evidencia) || regional.length === 0) reasons.push('Destino regional de entrega/execução não comprovado; sede do órgão isoladamente é insuficiente.');
  if (regional.some(municipio => !links.some(receipt => array(receipt?.municipios).includes(municipio)))) reasons.push('Município de execução sem recibo que documente abrangência.');
  if (reasons.length) return { valid: false, id: candidate.id || null, motivos: reasons };
  const result = structuredClone(candidate);
  result.localExecucao.municipios = unique(destinations);
  result.municipiosAbrangidos = unique(regional);
  const pendingChecks = ESQUEMA_PUBLICO.validacoes.filter(key => {
    const confirmation = candidate.validacoes?.[key];
    return confirmation?.estado !== 'CONFIRMADA' || !validDate(confirmation?.confirmadaEm) || Date.parse(confirmation.confirmadaEm) > Date.parse(reference) || !text(confirmation?.referenciaPublicavel) || !text(confirmation?.resumoPublico);
  });
  if (result.classificacao === 'GO' && pendingChecks.length > 0) {
    result.classificacao = 'REVISÃO HUMANA';
    result.justificativa += ` Viabilidade pendente de confirmação/evidência publicável: ${pendingChecks.join(', ')}. Aderência ao portfólio não comprova GO.`;
  }
  if ((place.misto === true || destinations.some(municipio => !MUNICIPIOS.includes(municipio))) && place.logisticaViavel !== true && result.classificacao !== 'NO-GO') {
    result.classificacao = 'REVISÃO HUMANA';
    result.justificativa += ' Obrigações logísticas fora da região sem viabilidade comprovada; revisão humana necessária.';
  }
  if (Date.parse(result.prazo) < Date.parse(reference)) {
    result.classificacao = 'NO-GO';
    result.justificativa += ' Prazo encerrado na data/hora de referência do relatório.';
  }
  return { valid: true, candidate: result };
}
function coverageRow(label, field, stages, receipts, sources, opportunities) {
  const relevant = receipts.filter(receipt => array(receipt[field === 'municipio' ? 'municipios' : 'instituicoes']).includes(label));
  const urls = unique(relevant.map(receipt => sources.get(receipt.fonteId)?.url).filter(Boolean));
  const row = { [field]: label, fontesConsultadas: urls, resultado: STATUS.NAO, pendencia: '', recibos: relevant.map(receipt => receipt.id), etapas: [], observacoes: [] };
  if (field === 'instituicao') row.abrangenciaDemonstrada = unique(relevant.filter(receipt => receipt.coberturaInstituicoes).map(receipt => `${receipt.id}: ${array(receipt.coberturaInstituicoes.unidades).join(', ')}. ${receipt.coberturaInstituicoes.evidencia || 'Evidência ausente.'} Escopo ${receipt.coberturaInstituicoes.escopoCompleto === true ? 'declarado completo' : 'parcial'}.`));
  if (relevant.length === 0) {
    row.pendencia = `Executar e registrar: ${stages.join(', ')}.`;
    return row;
  }
  const baseline = field === 'municipio' ? ETAPAS_PADRAO : ['PORTAL_PROPRIO', 'COMPRAS_CENTRALIZADAS'];
  for (const stage of unique([...stages, ...baseline])) {
    const records = relevant.filter(receipt => coversStage(receipt, stage));
    const valid = records.filter(receipt => receiptReasons(receipt, sources.get(receipt.fonteId)).length === 0);
    const unresolved = records.filter(receipt => !valid.includes(receipt) && !valid.some(alt => array(alt.alternativaPara).includes(receipt.id)));
    const missingCandidates = valid.filter(receipt => receipt.conclusao === 'COM_CANDIDATOS' && !opportunities.some(candidate => candidate.reciboIds.includes(receipt.id)));
    const conflictingCandidates = valid.filter(receipt => receipt.conclusao === 'SEM_CANDIDATOS' && opportunities.some(candidate => candidate.reciboIds.includes(receipt.id)));
    const done = valid.length > 0 && unresolved.length === 0 && missingCandidates.length === 0 && conflictingCandidates.length === 0;
    const reasons = unique([
      ...(records.length === 0 ? [`${stage}: etapa não consultada${stages.includes(stage) ? '' : '; fonte equivalente para o escopo omitido não demonstrada'}.`] : []),
      ...unresolved.flatMap(receipt => receiptReasons(receipt, sources.get(receipt.fonteId)).map(reason => `${stage}/${receipt.id}: ${reason}`)),
      ...missingCandidates.map(receipt => `${stage}/${receipt.id}: declarou candidatos, mas nenhum item/lote foi validado para apresentação; revisar retidos e completar evidências.`),
      ...conflictingCandidates.map(receipt => `${stage}/${receipt.id}: conclusão sem candidatos contradiz candidato válido vinculado.`),
    ]);
    row.etapas.push({ etapa: stage, concluida: done, recibos: records.map(receipt => receipt.id), pendencias: reasons });
    for (const alternative of valid) {
      const replaced = records.filter(receipt => array(alternative.alternativaPara).includes(receipt.id));
      if (replaced.length) row.observacoes.push(`Alternativa oficial ${alternative.id} resolveu ${replaced.map(receipt => receipt.id).join(', ')} com abrangência explícita para ${label}.`);
    }
  }
  const confirmed = opportunities.filter(candidate => field === 'municipio' ? candidate.municipiosAbrangidos.includes(label) : candidate.reciboIds.some(id => relevant.some(receipt => receipt.id === id)));
  row.candidatos = confirmed.map(candidate => candidate.id);
  const done = row.etapas.every(stage => stage.concluida);
  row.resultado = done ? (confirmed.length ? STATUS.COM : STATUS.SEM) : STATUS.PARCIAL;
  row.pendencia = done ? '' : row.etapas.filter(stage => !stage.concluida).flatMap(stage => stage.pendencias).join(' ');
  if (!done && !row.pendencia) row.pendencia = 'Concluir e documentar as etapas pendentes.';
  return row;
}

export function gerarRelatorio(dossie = {}) {
  validarDossiePublico(dossie);
  if (MUNICIPIOS.length !== 89 || unique(MUNICIPIOS).length !== 89) throw new Error('Registro canônico precisa conter exatamente os 89 municípios obrigatórios.');
  if (dossie.escopoMunicipal !== undefined && (!Array.isArray(dossie.escopoMunicipal) || dossie.escopoMunicipal.length !== 89 || unique(dossie.escopoMunicipal).length !== 89 || MUNICIPIOS.some(name => !dossie.escopoMunicipal.includes(name)))) throw new Error('Escopo fornecido deve conter exatamente os 89 municípios obrigatórios, sem ausências ou extras.');
  const period = dossie.periodo || null;
  if ((period !== null || array(dossie.recibos).length || array(dossie.candidatos).length) && (!period || !validDay(period.inicio) || !validDay(period.fim) || period.inicio > period.fim)) throw new Error('Dossiê fornecido exige período de referência válido, sem misturar semanas.');
  const reference = dossie.geradoEm || new Date().toISOString();
  if (!validDate(reference)) throw new Error('geradoEm precisa ser data/hora ISO 8601 com fuso.');
  const warnings = [];
  const sourceMap = new Map();
  for (const source of array(dossie.fontes)) {
    if (!source || !text(source.id)) throw new Error('Fonte precisa de ID explícito.');
    if (sourceMap.has(source.id)) throw new Error(`Fonte repetida: ${source.id}.`);
    sourceMap.set(source.id, structuredClone(source));
  }
  const institutions = institutionRegistry(array(dossie.instituicoes));
  const records = latestReceipts(array(dossie.recibos), period, warnings);
  for (const record of records) {
    if (array(record.instituicoes).some(name => !institutions.some(item => item.nome === name))) throw new Error(`Recibo ${record.id} cita instituição não cadastrada no plano; cadastre-a explicitamente.`);
  }
  const opportunities = [], withheld = [], candidateIds = new Set(), lotKeys = new Set();
  for (const candidate of array(dossie.candidatos)) {
    if (candidateIds.has(candidate.id)) { warnings.push(`Candidato repetido ${candidate.id} foi ignorado; não infla oportunidades.`); continue; }
    candidateIds.add(candidate.id);
    const classified = classifyCandidate(candidate, records, sourceMap, reference);
    if (!classified.valid) { withheld.push(classified); continue; }
    const key = [candidate.orgao, candidate.processo, candidate.item || '', candidate.lote || ''].join('\u0000');
    if (lotKeys.has(key)) { warnings.push(`Item/lote repetido ${candidate.id} foi ignorado; não infla oportunidades.`); continue; }
    lotKeys.add(key);
    opportunities.push(classified.candidate);
  }
  const stages = stagePlan(dossie.plano?.etapasMunicipais, ETAPAS_PADRAO, dossie.plano?.justificativa);
  const municipios = MUNICIPIOS.map(municipio => coverageRow(municipio, 'municipio', stages, records, sourceMap, opportunities));
  const instituicoes = institutions.map(item => coverageRow(item.nome, 'instituicao', item.etapasObrigatorias, records, sourceMap, opportunities));
  const totals = rows => ({ concluidos: rows.filter(row => [STATUS.COM, STATUS.SEM].includes(row.resultado)).length, parciais: rows.filter(row => row.resultado === STATUS.PARCIAL).length, naoConsultados: rows.filter(row => row.resultado === STATUS.NAO).length });
  const summary = { totalMunicipios: 89, ...totals(municipios) };
  summary.coberturaPercentual = Math.round(summary.concluidos / 89 * 10000) / 100;
  if (dossie.coberturaDeclarada !== undefined && Number(dossie.coberturaDeclarada) !== summary.coberturaPercentual) throw new Error(`Cobertura declarada (${dossie.coberturaDeclarada}%) diverge da comprovada (${summary.coberturaPercentual}%); 100% exige 89 pesquisas concluídas.`);
  return {
    versao: '2026.10.12-cobertura-2-educacao', periodo: period, geradoEm: reference, plano: { etapasMunicipais: stages, justificativa: dossie.plano?.justificativa || null },
    resumo: summary, resumoInstituicoes: { totalRegistros: instituicoes.length, ...totals(instituicoes) },
    municipios, instituicoes, oportunidades: opportunities, candidatosRetidos: withheld, avisos: unique(warnings),
    recibos: records, fontes: [...sourceMap.values()],
    pendencias: [...municipios.filter(row => row.pendencia).map(row => `${row.municipio}: ${row.pendencia}`), ...instituicoes.filter(row => row.pendencia).map(row => `${row.instituicao}: ${row.pendencia}`)],
    limites: ['Validação documental dos recibos fornecidos; este script não acessa portais nem confirma por conta própria a veracidade das consultas.', 'Cobertura municipal e institucional são independentes. Registro planejado de fonte não representa consulta.', 'Família de portfólio e logística dependem de evidência técnica documentada; GO não equivale a aprovação de proposta ou autorização de lance.'],
  };
}

const escapeMD = value => String(value ?? '').replaceAll('|', '\\|').replaceAll('\r', ' ').replaceAll('\n', ' ');
const escapeCSV = value => `"${String(value ?? '').replaceAll('\r', ' ').replaceAll('\n', ' ').replaceAll('"', '""')}"`;
export function renderMarkdown(report) {
  const parts = [
    '# Licitações Impresilk — cobertura registrada',
    `Período: ${escapeMD(report.periodo ? `${report.periodo.inicio} a ${report.periodo.fim}` : 'Pesquisa ainda não iniciada')}. Data/hora: ${escapeMD(report.geradoEm)}.`,
    `Municípios concluídos: ${report.resumo.concluidos}/89. Parciais: ${report.resumo.parciais}. Não consultados: ${report.resumo.naoConsultados}. Cobertura concluída: ${report.resumo.coberturaPercentual}%.`,
    '## Municípios',
    '| Município | Fonte(s) consultada(s) | Resultado da cobertura | Pendência |\n|---|---|---|---|\n' + report.municipios.map(row => `| ${escapeMD(row.municipio)} | ${escapeMD(row.fontesConsultadas.join('; '))} | ${escapeMD(row.resultado)} | ${escapeMD(row.pendencia)} |`).join('\n'),
    '## Órgãos e instituições',
    `Este quadro representa os registros do plano; não comprova cobertura de todos os órgãos existentes na região. Registros concluídos: ${report.resumoInstituicoes.concluidos}/${report.resumoInstituicoes.totalRegistros}.`,
    '| Órgão/instituição | Fonte(s) consultada(s) | Abrangência demonstrada | Resultado da cobertura | Pendência |\n|---|---|---|---|---|\n' + report.instituicoes.map(row => `| ${escapeMD(row.instituicao)} | ${escapeMD(row.fontesConsultadas.join('; '))} | ${escapeMD(array(row.abrangenciaDemonstrada).join('; ') || 'Nenhuma abrangência registrada.')} | ${escapeMD(row.resultado)} | ${escapeMD(row.pendencia)} |`).join('\n'),
    '## Oportunidades por item/lote',
    report.oportunidades.length ? report.oportunidades.map(candidate => `### ${escapeMD(candidate.classificacao)} — ${escapeMD(candidate.processo)} / ${escapeMD(candidate.item || candidate.lote)}\n\nÓrgão: ${escapeMD(candidate.orgao)}. Produto: ${escapeMD(candidate.produto)}. Destinos regionais: ${escapeMD(candidate.municipiosAbrangidos.join(', '))}.\n\nLink oficial: ${escapeMD(candidate.oficialUrl)}. Prazo: ${escapeMD(candidate.prazo)}.\n\nExigências: ${escapeMD(candidate.exigencias.join('; '))}.\n\nJustificativa: ${escapeMD(candidate.justificativa)}. Próxima ação: ${escapeMD(candidate.proximaAcao)}.`).join('\n\n') : 'Nenhuma oportunidade validada para apresentação.',
    '## Pendências para a próxima execução', report.pendencias.map(pending => `- ${escapeMD(pending)}`).join('\n') || 'Nenhuma pendência registrada.',
    '## Limites da evidência', report.limites.map(limit => `- ${escapeMD(limit)}`).join('\n'),
  ];
  if (report.avisos.length) parts.push(`Avisos: ${report.avisos.map(escapeMD).join(' ')}`);
  return parts.join('\n\n') + '\n';
}
export function renderCSV(rows, field) {
  const institutional = field === 'instituicao';
  return [institutional ? 'Órgão/instituição,Fonte(s) consultada(s),Abrangência demonstrada,Resultado da cobertura,Pendência' : 'Município,Fonte(s) consultada(s),Resultado da cobertura,Pendência', ...rows.map(row => [row[field], row.fontesConsultadas.join('; '), ...(institutional ? [array(row.abrangenciaDemonstrada).join('; ') || 'Nenhuma abrangência registrada.'] : []), row.resultado, row.pendencia].map(escapeCSV).join(','))].join('\n') + '\n';
}
