// Cálculos puros: somente os fatos recebidos, sem consulta ou criação de registros.
const dia = v => String(v || '').slice(0, 10);
const dataISO = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v)) && Number.isFinite(Date.parse(v + 'T12:00:00Z')) && new Date(v + 'T12:00:00Z').toISOString().slice(0, 10) === v;
export const somarDiasComerciais = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const diasEntre = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
const porId = xs => [...new Map(xs.filter(x => x?.id).map(x => [String(x.id), x])).values()];
const desempatarPrioridade = (a, b) => Number(b.prioridade === 'alta') - Number(a.prioridade === 'alta');
export const compararAcoesComerciais = (a, b) => String(a.data || '9999').localeCompare(String(b.data || '9999')) || desempatarPrioridade(a, b) || String(a.id).localeCompare(String(b.id));

export function calendarioComercialValido(c) {
 return c?.configurado === true && Array.isArray(c.diasSemana) && c.diasSemana.every(n => Number.isInteger(n) && n >= 0 && n <= 6) &&
  Array.isArray(c.feriados) && c.feriados.every(dataISO) && (!c.excecoes || (typeof c.excecoes === 'object' && !Array.isArray(c.excecoes) && Object.entries(c.excecoes).every(([d, v]) => dataISO(d) && typeof v === 'boolean')));
}
export function diaUtilComercial(d, c) {
 if (!dataISO(d) || !calendarioComercialValido(c)) return null;
 if (Object.hasOwn(c.excecoes || {}, d)) return c.excecoes[d];
 return !c.feriados.includes(d) && c.diasSemana.includes(new Date(d + 'T12:00:00Z').getUTCDay());
}
export function contarDiasUteis({de, ate}, c) {
 if (!calendarioComercialValido(c) || !dataISO(de) || !dataISO(ate)) return null;
 let total = 0;
 for (let d = de; d <= ate; d = somarDiasComerciais(d, 1)) if (diaUtilComercial(d, c)) total++;
 return total;
}
export function fimPorDiasUteis({de, ate}, quantidade, c) {
 if (!calendarioComercialValido(c) || !Number.isInteger(quantidade) || quantidade < 1) return null;
 let total = 0;
 for (let d = de; d <= ate; d = somarDiasComerciais(d, 1)) if (diaUtilComercial(d, c) && ++total === quantidade) return d;
 return null;
}

// Janelas adjacentes podem cobrir o intervalo; lacunas nunca são preenchidas pelo resumo.
export function coberturaComercialContem(c = {}, p, hoje) {
 if (c.indisponivel === true || c.completo === false && !c.desde && !c.janelas) return false;
 const ate = p.ate > hoje ? hoje : p.ate;
 if (ate < p.de) return false;
 const janelas = Array.isArray(c.janelas) ? c.janelas : [{desde: c.desde, ate: c.ate}];
 let cursor = p.de;
 for (const j of janelas.filter(j => dataISO(j?.desde) && dataISO(j?.ate) && j.desde <= j.ate).sort((a, b) => a.desde.localeCompare(b.desde))) {
  if (j.ate < cursor) continue;
  if (j.desde > cursor) return false;
  if (j.ate >= ate) return true;
  cursor = somarDiasComerciais(j.ate, 1);
 }
 return false;
}

// A identidade de negociação vem exclusivamente do vínculo recebido da origem.
// Prefixos evitam colisão entre um ID de negociação e o ID de outro orçamento.
export function revisoesComerciais(xs = []) {
 const grupos = new Map();
 for (const o of porId(xs)) {
  const k = o.negociacaoId != null && String(o.negociacaoId).trim() ? 'negociacao:' + String(o.negociacaoId) : 'orcamento:' + String(o.id);
  const grupo = grupos.get(k) || [];
  grupo.push(o); grupos.set(k, grupo);
 }
 return [...grupos.entries()].map(([k, grupo]) => {
  grupo.sort((a, b) => (Number(b.revisao || 0) - Number(a.revisao || 0)) || String(b.dataAtualizacao || '').localeCompare(String(a.dataAtualizacao || '')) || String(b.id).localeCompare(String(a.id)));
  return {...grupo[0], chaveNegociacao: k, orcamentoIds: grupo.map(o => String(o.id)).sort(), revisoes: grupo.map(o => ({...o})), vinculoRevisoes: k.startsWith('negociacao:') ? 'id_explicito' : 'sem_vinculo'};
 });
}

// contatoEm é emitido pelo validador somente após confirmação. atualizadoEm e
// chamadoEm/ultimoContato legados podem representar uma edição ou abertura de canal.
export function ultimoContatoConfirmado(acoes = [], acompanhamento = {}) {
 const candidatos = acoes.flatMap(a => [a.contatoEm, ...(Array.isArray(a.contatos) ? a.contatos : []).map(c => c?.contatoEm || c?.em)]);
 if (acompanhamento.contatoConfirmado === true) candidatos.push(acompanhamento.contatoEm);
 return candidatos.filter(v => dataISO(dia(v)) && Number.isFinite(Date.parse(v))).sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1) || null;
}

const motivo = (codigo, tipo, prioridade, data = '', descricao = '') => ({codigo, tipo, prioridade, data, descricao});
const ordenarMotivos = xs => xs.sort((a, b) => a.prioridade - b.prioridade || a.data.localeCompare(b.data) || a.codigo.localeCompare(b.codigo));
export function filaComercial(orcamentos, acoes, hoje, config = {}) {
 const limite = Number(config.diasSemResposta ?? 7), validade = Number(config.diasVencimento ?? 3), fila = [], usados = new Set();
 for (const o of orcamentos) {
  const ids = o.orcamentoIds || [String(o.id)];
  const tarefas = porId(acoes.filter(a => ids.includes(String(a.orcamentoId))));
  tarefas.forEach(a => usados.add(String(a.id)));
  const abertas = tarefas.filter(a => a.status !== 'concluida').sort(compararAcoesComerciais);
  const agendadas = abertas.filter(a => dataISO(a.data));
  const venc = dataISO(o.validadeData) ? o.validadeData : o.validade > 0 && dataISO(dia(o.dataCadastro || o.dataEnvio)) ? somarDiasComerciais(dia(o.dataCadastro || o.dataEnvio), Number(o.validade)) : null;
  const contato = ultimoContatoConfirmado(tarefas, o.acompanhamento), referencia = dia(contato) || dia(o.dataEnvio || o.dataCadastro);
  const proximo = agendadas[0]?.data || (dataISO(o.acompanhamento?.proximoToque) ? o.acompanhamento.proximoToque : null);
  const motivos = [];
  if (abertas.some(a => dataISO(a.data) && a.data < hoje)) motivos.push(motivo('retorno_atrasado', 'Retorno atrasado', 10, abertas.find(a => a.data < hoje).data));
  if (venc && venc < hoje) motivos.push(motivo('validade_vencida', 'Validade vencida', 20, venc));
  if (abertas.some(a => a.data === hoje)) motivos.push(motivo('retorno_hoje', 'Retorno de hoje', 30, hoje));
  const pendentes = abertas.filter(a => a.pendencias?.trim());
  if (pendentes.length) motivos.push(motivo('pendencia', 'Negociação com pendência', 40, pendentes[0].data, pendentes.map(a => a.pendencias.trim()).join(' · ')));
  if (venc && venc >= hoje && venc <= somarDiasComerciais(hoje, validade)) motivos.push(motivo('validade_proxima', 'Próxima do vencimento', 50, venc));
  // Um retorno futuro suprime a cobrança por falta de resposta, mas não a validade ou pendências reais.
  if ((!proximo || proximo <= hoje) && dataISO(referencia) && referencia <= somarDiasComerciais(hoje, -limite)) motivos.push(motivo('sem_resposta', 'Proposta sem resposta', 60, referencia, contato ? 'Prazo desde o último contato confirmado.' : 'Prazo desde o cadastro/envio; nenhum contato confirmado.'));
  if (!proximo) motivos.push(motivo('sem_proxima_acao', 'Sem próxima ação', 70));
  if (proximo > hoje) motivos.push(motivo('retorno_programado', 'Retorno programado', 80, proximo));
  if (!motivos.length) continue;
  ordenarMotivos(motivos);
  const primeira = agendadas.find(a => a.data <= hoje) || agendadas[0] || abertas[0];
  fila.push({...primeira, id: primeira?.id || 'orc-' + o.id, orcamentoId: o.id, orcamentoIds: ids, negociacaoId: o.negociacaoId || null, clienteId: o.clienteId, cliente: o.cliente, vendedorNome: o.vendedorNome, valor: o.valor,
   descricao: primeira?.descricao || motivos.find(m => m.descricao)?.descricao || 'Conferir interesse e combinar o próximo passo', tipo: motivos[0].tipo, motivos, data: primeira?.data || '', prioridadeFila: motivos[0].prioridade,
   acaoIds: tarefas.map(a => String(a.id)).sort(), acoesVinculadas: tarefas, ultimaInteracao: contato, ultimoContato: contato, validadeData: venc, proximaAcaoData: proximo});
 }
 for (const a of porId(acoes)) {
  if (usados.has(String(a.id)) || a.status === 'concluida' || !dataISO(a.data)) continue;
  const m = a.data < hoje ? motivo('retorno_atrasado', 'Retorno atrasado', 10, a.data) : a.data === hoje ? motivo('retorno_hoje', 'Retorno de hoje', 30, a.data) : motivo('retorno_programado', 'Retorno programado', 80, a.data);
  fila.push({...a, tipo: m.tipo, motivos: [m], prioridadeFila: m.prioridade, acaoIds: [String(a.id)], acoesVinculadas: [a], ultimaInteracao: ultimoContatoConfirmado([a])});
 }
 return fila.sort((a, b) => a.prioridadeFila - b.prioridadeFila || (a.motivos[0].data || '9999').localeCompare(b.motivos[0].data || '9999') || desempatarPrioridade(a, b) || String(a.orcamentoId || a.id).localeCompare(String(b.orcamentoId || b.id)));
}

export function inteligenciaClienteComercial(cliente, compras, hoje, config = {}, cobertura = {}) {
 const todas = porId(compras).filter(o => dataISO(dia(o.data)) && dia(o.data) <= hoje);
 const datas = [...new Set(todas.map(o => dia(o.data)))].sort();
 const intervalos = datas.slice(1).map((d, i) => diasEntre(datas[i], d));
 const coberturaCompleta = datas.length > 0 && coberturaComercialContem(cobertura, {de: datas[0], ate: hoje}, hoje);
 const suficiente = datas.length >= 3 && coberturaCompleta;
 const ordenados = [...intervalos].sort((a, b) => a - b), meio = Math.floor(ordenados.length / 2);
 const mediana = suficiente ? Math.round(ordenados.length % 2 ? ordenados[meio] : (ordenados[meio - 1] + ordenados[meio]) / 2) : null;
 const frequenciaCompra = {estado: suficiente ? 'calculada' : datas.length >= 3 ? 'historico_parcial' : 'historico_insuficiente', dias: mediana, amostra: datas.length, intervalos, idsVendas: todas.map(o => String(o.id)).sort(), coberturaCompleta,
  criterio: 'Mediana dos intervalos entre pelo menos 3 dias distintos com O.S. normal não cancelada, no histórico coberto.', mensagem: suficiente ? `Intervalo habitual de ${mediana} dias na amostra disponível.` : datas.length >= 3 ? 'A cobertura do histórico precisa ser completada para estimar a frequência.' : 'São necessários pelo menos 3 dias de compra distintos para estimar a frequência.'};
 const ultimaCompra = [cliente.ultimaCompra, ...datas].filter(dataISO).sort().at(-1) || null;
 const diasSemCompra = ultimaCompra ? diasEntre(ultimaCompra, hoje) : null;
 const prazoConfigurado = Number(config.diasReativacao ?? 90);
 const prazoDias = suficiente ? Math.ceil(mediana * 1.5) : prazoConfigurado;
 const propostasAbertas = (cliente.orcamentos || []).filter(o => o.situacao === 'aberto').map(o => String(o.id));
 const existente = (cliente.acoes || []).filter(a => a.status !== 'concluida' && a.tipoAcao === 'reativacao').sort((a, b) => String(a.data).localeCompare(String(b.data)) || String(a.id).localeCompare(String(b.id)))[0];
 const vencido = diasSemCompra != null && diasSemCompra >= prazoDias;
 const reativacao = {sugerida: vencido && !propostasAbertas.length && !existente, diasSemCompra, prazoDias, frequenciaDias: mediana, ultimaCompra, propostasAbertas, acaoExistenteId: existente?.id || null, criarAcao: false, coberturaCompleta,
  criterio: suficiente ? '1,5 vez a mediana dos intervalos de compra confirmados.' : `Referência configurada de ${prazoConfigurado} dias sem compra identificada; frequência ainda não calculada.`,
  motivo: !ultimaCompra ? 'Nenhuma compra identificada.' : existente ? 'Já existe uma ação de reativação aberta.' : propostasAbertas.length ? 'Há proposta aberta para acompanhar antes de sugerir outra ação.' : vencido ? `${diasSemCompra} dias desde a última compra identificada; referência de ${prazoDias} dias.` : 'A última compra está dentro do prazo de referência.'};
 return {frequenciaCompra, reativacao};
}

export function perfilCompraComercialPeriodo(cliente, compras, periodo, hoje, config = {}, cobertura = {}, coberturaHistorica = {}) {
 const ate = periodo.ate < hoje ? periodo.ate : hoje;
 const todas = porId(compras).filter(o => dataISO(dia(o.data)) && dia(o.data) <= ate).sort((a, b) => dia(a.data).localeCompare(dia(b.data)) || String(a.id).localeCompare(String(b.id)));
 const atuais = todas.filter(o => dia(o.data) >= periodo.de), primeiraCompraPeriodo = atuais.length ? dia(atuais[0].data) : null;
 const anteriores = primeiraCompraPeriodo ? todas.filter(o => dia(o.data) < primeiraCompraPeriodo) : [];
 const compraAnterior = anteriores.length ? dia(anteriores.at(-1).data) : null;
 const prazo = Number(config.diasReativacao ?? 90);
 const criterio = `O.S. normal não cancelada, líquido confirmado e data de ${cobertura.criterioVendas==='aprovacao'?'aprovação':'cadastro'}, na carteira autorizada. Intervalo entre a primeira compra do período e a última O.S. anterior confirmada; reativado exige pelo menos ${prazo} dias e cobertura contínua.`;
 const detalhe = {estado: 'indisponivel', rotulo: 'Indisponível', criterio, coberturaCompleta: false, idsVendas: atuais.map(o => String(o.id)), primeiraCompraPeriodo, compraAnterior, intervaloDias: null};
 const periodoCoberto = coberturaComercialContem(cobertura, {de: periodo.de, ate}, hoje);
 if (!periodoCoberto) return {...detalhe, criterio: criterio + ' A cobertura das compras do período está incompleta.'};
 if (!atuais.length) return {...detalhe, estado: 'sem_compra_periodo', rotulo: 'Sem compra no período', coberturaCompleta: true, criterio: 'Nenhuma O.S. normal não cancelada com líquido confirmado no intervalo coberto da carteira autorizada.'};
 if (compraAnterior) {
  if (!coberturaComercialContem(cobertura, {de: compraAnterior, ate}, hoje)) return {...detalhe, criterio: criterio + ' Há uma lacuna de cobertura entre a compra anterior identificada e o período; o intervalo não está comprovado.'};
  const intervaloDias = diasEntre(compraAnterior, primeiraCompraPeriodo), reativado = intervaloDias >= prazo;
  return {...detalhe, estado: reativado ? 'reativado' : 'recorrente', rotulo: reativado ? 'Reativado' : 'Recorrente', coberturaCompleta: true, intervaloDias};
 }
 // Um lote sem compras anteriores pode ser apenas o recorte enviado à tela.
 // A primeira compra histórica confirmada prova "novo"; primeira/última e
 // quantidade nunca substituem uma O.S. anterior para calcular reativação.
 if (coberturaHistorica?.completo === true && dataISO(cliente.primeiraCompraHistorica) && cliente.primeiraCompraHistorica === primeiraCompraPeriodo) {
  return {...detalhe, estado: 'novo', rotulo: 'Novo', coberturaCompleta: true, criterio: 'Primeira compra identificada no histórico completo da carteira autorizada, confirmada pelo resumo histórico e por O.S. elegível do período.'};
 }
 return {...detalhe, criterio: criterio + ' O lote não comprova a compra imediatamente anterior nem a primeira compra histórica; ausência no recorte não significa cliente novo.'};
}

export function aprovacaoOrcamentosComerciais(propostas, coberturaCompleta, propostasSemData = []) {
 const conhecidas = propostas.filter(o => ['aberto', 'ganho', 'perdido'].includes(o.situacao));
 const idsSemData = propostasSemData.map(o => String(o.id)).sort(), quantidadeSemData = idsSemData.length;
 const coberturaTemporalCompleta = coberturaCompleta === true && quantidadeSemData === 0;
 const aprovadas = conhecidas.filter(o => o.situacao === 'ganho'), completo = coberturaTemporalCompleta && conhecidas.length === propostas.length;
 const causa = [quantidadeSemData ? `${quantidadeSemData} orçamento(s) sem data de cadastro ou envio válida; não é possível confirmar se pertencem ao período.` : null,
  coberturaCompleta === true ? null : 'A fonte de orçamentos não comprova a cobertura completa do período.',
  conhecidas.length === propostas.length ? null : 'Há orçamentos do período com situação a conferir.'].filter(Boolean).join(' ') || null;
 return {denominador: conhecidas.length, aprovados: aprovadas.length, percentual: completo && conhecidas.length ? aprovadas.length / conhecidas.length * 100 : null, completo,
  coberturaTemporalCompleta, idsSemData, quantidadeSemData, causa,
  criterio: 'Taxa de aprovação registrada (ERP ou confirmação local): orçamentos ganhos divididos por todos os orçamentos de situação conhecida criados no período, contando somente a última revisão quando há vínculo explícito. Percentual depende de cobertura, situação e datas completas; propostas sem data válida ficam separadas para conferência e não são atribuídas ao período. Não mede conversão em pedido sem vínculo de origem.',
  idsBase: conhecidas.map(o => String(o.id)).sort(), idsAprovados: aprovadas.map(o => String(o.id)).sort()};
}
