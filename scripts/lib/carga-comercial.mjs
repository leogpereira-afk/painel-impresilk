import { diaSeguinte, fatiasPorAno, normOS, normOrcamento } from './mubi-cache.mjs';

const dataValida = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s;
const chaveCliente = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toUpperCase();
const centavos = (v) => Math.round(Number(v) * 100) / 100;

export function validarCargaComercial({ desde, ate, recurso = 'ambos' }, hoje) {
  if (!dataValida(desde) || !dataValida(ate) || desde > ate || ate > hoje || desde < '2000-01-01') throw new Error('Informe uma janela válida, até hoje, em AAAA-MM-DD.');
  if (!['ordens', 'orcamentos', 'ambos'].includes(recurso)) throw new Error('Recurso deve ser ordens, orcamentos ou ambos.');
  return { desde, ate, recursos: recurso === 'ambos' ? ['ordens', 'orcamentos'] : [recurso] };
}

// Não envia itens: o objetivo é enriquecer o vínculo comercial. O contrato de
// painel-cache preserva os itens e categorias existentes quando a chave falta.
export function ordemComercialParaTabela(o) {
  if (!o.id || !o.valorConfirmado || !Number.isFinite(o.valor) || !Number.isFinite(o.valorBruto)) throw new Error('O.S. sem cabeçalho financeiro confirmado; dados anteriores preservados.');
  return {
    id: o.id, numero: o.numero, cliente: o.cliente, clienteChave: chaveCliente(o.cliente),
    cnpj: o.cnpj, data: o.data.slice(0, 10), valor: centavos(o.valor), bruto: centavos(o.valorBruto),
    desconto: centavos(o.desconto), vendedor: o.vendedor,
    comercial: { clienteId: o.clienteId, tipo: o.tipo, valorConfirmado: o.valorConfirmado, cancelada: false, sinalPago: o.sinalPago },
  };
}

export function mesclarOrcamentosComerciais(anteriores, novos) {
  if (!Array.isArray(anteriores)) throw new Error('Cache de orçamentos ausente ou inválido; uma fatia não pode substituir a base inteira.');
  const mapa = new Map(anteriores.map((o) => [String(o.id), o]));
  for (const novo of novos) mapa.set(String(novo.id), novo);
  return [...mapa.values()];
}

// A unidade de confirmação é uma fatia totalmente lida e gravada. Não declara
// cobertura geral: processar 2020 não confirma 2021..2026 nem muda o status das
// cargas financeiras. Reexecução da mesma fatia substitui só seu comprovante.
export function confirmarJanelaComercial(status, recurso, janela) {
  return { ...status, janelas: { ...status.janelas, [recurso]: [
    ...(status.janelas?.[recurso] || []).filter((j) => j.desde !== janela.desde || j.ate !== janela.ate), janela,
  ].sort((a, b) => a.desde.localeCompare(b.desde) || a.ate.localeCompare(b.ate)) } };
}

export async function executarCargaComercial(opcoes, { getTudo, cache, agora = () => new Date().toISOString(), log = () => {} }) {
  const inicioEm = agora();
  const hoje = new Date(new Date(inicioEm).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  const { desde, ate, recursos } = validarCargaComercial(opcoes, hoje);
  const anterior = (await cache({ action: 'ler', chave: 'comercial_carga_status' })).valor;
  let status = { ...anterior, versao: 1, janelas: { ordens: [], orcamentos: [], ...anterior?.janelas }, tentativa: {
    id: inicioEm, inicioEm, atualizadaEm: inicioEm, desde, ate, recursos, estado: 'executando',
  } };
  const gravarStatus = async () => {
    status.atualizacaoEm = agora(); status.tentativa.atualizadaEm = status.atualizacaoEm;
    await cache({ chave: 'comercial_carga_status', valor: status });
  };
  await gravarStatus();
  try {
    for (const fatia of fatiasPorAno(desde, ate)) for (const recurso of recursos) {
      log(`${recurso}: ${fatia.de} a ${fatia.ate}`);
      // Cliente compartilhado mantém paginação completa, limite de concorrência
      // e recuo para HTTP 429. A mesma consulta das cargas já em produção.
      const brutos = await getTudo(recurso === 'ordens' ? 'ordem-servico' : 'orcamento', {
        status: 'TODOS', filtrodata: 'CADASTRO', datainicial: fatia.de, datafinal: diaSeguinte(fatia.ate),
      }, 100);
      if (!Array.isArray(brutos) || !brutos.length) throw new Error(`${recurso}: fonte vazia; fatia não confirmada e base anterior preservada.`);
      if (brutos.some((r) => r.id == null || String(r.id).trim() === '' || !dataValida(String(r.data_cadastro || '').slice(0, 10)))) throw new Error(`${recurso}: registro sem identificador ou data válida; fatia não confirmada.`);
      const noPeriodo = [...new Map(brutos.filter((r) => {
        const d = String(r.data_cadastro).slice(0, 10); return d >= fatia.de && d <= fatia.ate;
      }).map((r) => [String(r.id), r])).values()];
      if (!noPeriodo.length) throw new Error(`${recurso}: nenhum registro dentro da janela; fatia não confirmada.`);
      let registros = 0, canceladas = 0;
      if (recurso === 'ordens') {
        const normalizadas = noPeriodo.map((r, i) => normOS(r, i, new Map()));
        // Valida antes de escrever qualquer lote da fatia; não transforma valor
        // ausente em zero por cima de um cabeçalho já conferido.
        const linhas = normalizadas.filter((o) => !o.cancelada).map(ordemComercialParaTabela);
        for (let i = 0; i < linhas.length; i += 500) {
          const lote = linhas.slice(i, i + 500);
          const r = await cache({ action: 'ordens', linhas: lote });
          if (r.gravadas !== lote.length) throw new Error('O.S.: gravação incompleta; fatia não confirmada.');
          registros += r.gravadas;
        }
        const ids = normalizadas.filter((o) => o.cancelada).map((o) => o.id);
        for (let i = 0; i < ids.length; i += 500) {
          // Só marca canceladas que já existem; nunca insere nem apaga linhas.
          await cache({ action: 'ordensComercialCanceladas', ids: ids.slice(i, i + 500) });
        }
        canceladas = ids.length;
      } else {
        // Lê a base imediatamente antes da mescla; a trava de concorrência do
        // workflow é compartilhada com cache-mubisys, evitando duas escritas.
        const atual = await cache({ action: 'ler', chave: 'orcamentos' });
        const novas = noPeriodo.map(normOrcamento);
        const valor = mesclarOrcamentosComerciais(atual.valor, novas);
        const r = await cache({ chave: 'orcamentos', valor });
        if (r.recusouVazio || r.pulou) throw new Error('Orçamentos: gravação recusada; fatia não confirmada.');
        registros = novas.length;
      }
      status = confirmarJanelaComercial(status, recurso, {
        desde: fatia.de, ate: fatia.ate, concluidaEm: agora(), registros, ...(recurso === 'ordens' ? { canceladas } : {}),
      });
      await gravarStatus();
      log(`${recurso}: ${registros} registros confirmados${canceladas ? `; ${canceladas} canceladas verificadas` : ''}.`);
    }
    status.tentativa.estado = 'concluida';
    await gravarStatus();
    return status;
  } catch (e) {
    status.tentativa.estado = 'falhou'; status.tentativa.erro = String(e?.message || 'Falha na carga comercial').slice(0, 300);
    try { await gravarStatus(); } catch { log('Não foi possível atualizar o estado da tentativa; as janelas confirmadas anteriormente continuam válidas.'); }
    throw e;
  }
}
