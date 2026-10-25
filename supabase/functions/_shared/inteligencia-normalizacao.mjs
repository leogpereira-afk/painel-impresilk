// Análises de consulta. Nunca escreve no ERP nem recalcula o saldo financeiro.
const txt = v => String(v ?? '').trim();
const dobrar = v => txt(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function numeroInformado(v) {
  if (v == null || txt(v) === '') return null;
  const s = txt(v);
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(n) ? n : null;
}
const centavos = v => { const n = numeroInformado(v); return n === null ? null : Math.round(n * 100); };
export function idsFiscais(v) {
  const s = txt(v);
  // Hífen é lista de IDs, nunca intervalo nem número comercial de O.S.
  if (!/^\d+(?:\s*[-,;]\s*\d+)*$/.test(s)) return [];
  return [...new Set(s.split(/\s*[-,;]\s*/))];
}
export function normalizarNota(n, recebida = false) {
  if (!n?.id || !txt(n.status)) throw new Error('Nota sem identificador ou situação');
  const valor = centavos(recebida ? n.valor_nota : n.valor_total);
  if (valor === null || valor < 0) throw new Error('Nota sem valor válido');
  return {id:txt(n.id), numero:txt(n.numero ?? n.nota_fiscal), chave:txt(n.chave),
    emitente:txt(n.emitente), emitenteDoc:txt(n.emitente_cnpj).replace(/\D/g,''),
    destinatario:txt(n.destinatario), destinatarioDoc:txt(n.destinatario_cnpj).replace(/\D/g,''),
    em:txt(n.data_emissao).slice(0,10), status:txt(n.status), cancelada:!!n.data_cancelamento || /cancel/.test(dobrar(n.status)),
    normal:dobrar(n.finalidade)==='nf-e normal', saida:dobrar(n.tipo ?? n.tipo_operacao)==='saida',
    valor, faturado:centavos(n.valor_faturado), referencia:txt(n.ordem_servico), osIds:idsFiscais(n.ordem_servico),
    itens:(Array.isArray(n.itens)?n.itens:[]).map(i=>({codigo:txt(i.codigo),descricao:txt(i.descricao),
      unidade:txt(i.unidade_custo ?? i.unidade).toUpperCase(),ncm:txt(i.ncm),quantidade:numeroInformado(i.quantidade),
      unitario:numeroInformado(i.valor_unitario),total:centavos(i.valor_total)}))};
}
export function normalizarDetalhe(o) {
  if (!o?.id || !o.sequencial_ordem) throw new Error('O.S. sem ID e número comercial');
  const bruto=centavos(o.valor_total),desconto=centavos(o.valor_desconto);
  const processos = xs => Array.isArray(xs) ? xs.map(p=>({nome:txt(p.processo),tempo:numeroInformado(p.tempo)})) : null;
  return {id:txt(o.id),numero:txt(o.sequencial_ordem),cliente:txt(o.cliente),clienteId:txt(o.cliente_id),
    empresa:txt(o.empresa),documento:txt(o.cliente_cnpj_cpf).replace(/\D/g,''),tipo:txt(o.tipo),
    status:txt(o.status),financeiro:txt(o.status_financeiro),entregueEm:txt(o.data_entregue).slice(0,10),
    cancelada:!!o.data_cancelamento || /cancel/.test(dobrar(o.status)),
    venda:bruto===null||desconto===null?null:bruto-desconto,desconto,sinal:centavos(o.valor_sinal),
    custo:centavos(o.valor_custo),margem:centavos(o.valor_margem),
    previstos:processos(o.processos_previstos),realizados:processos(o.processos_realizados),
    contatosConferidos:Array.isArray(o.cliente_contato),enderecosConferidos:Array.isArray(o.cliente_endereco),
    contatoFinanceiro:(o.cliente_contato||[]).some(c=>dobrar(c.contato_financeiro)==='sim' && dobrar(c.status)==='ativo'),
    enderecoFinanceiro:(o.cliente_endereco||[]).some(e=>dobrar(e.endereco_financeiro)==='sim' || dobrar(e.endereco_cobranca)==='sim')};
}

