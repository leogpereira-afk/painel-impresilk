import {resumoFinanceiroComercial} from './financeiroComercial.js';

const normal=v=>String(v||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().trim();
const empresas=new Set(['impresilk','impresilk comunicacao visual','impresilk comunicacao visual ltda']);

// Operational lookups have a shorter date window. A single order lookup uses its
// own date and preserves seller scope; it never changes the Dashboard's filters.
export function filtroConsultaPedido(pedido,filtro={}) {
 const data=String(pedido.data||'').slice(0,10);
 // Legacy signatures reject dates before 2020, although lookup is by typed ID.
 // This adapter affects only that unused window, never the order or report date.
 const referencia=data<'2020-01-01'?'2020-01-01':data;
 return {de:referencia,ate:referencia,vendedor:filtro.vendedor||'',equipe:filtro.equipe||''};
}

export function conciliarPedidoResultado(venda,resposta,hoje) {
 const pedido=resposta?.pedido;
 if(!pedido||String(pedido.id)!==String(venda.id)||String(pedido.numero)!==String(venda.numero))throw new Error('A consulta retornou outro pedido. Os dados financeiros não foram associados.');
 const empresa=normal(pedido.empresaNome||pedido.empresa_nome||(typeof pedido.empresa==='string'?pedido.empresa:pedido.empresa?.nome));
 if(empresa&&!empresas.has(empresa))throw new Error('A origem da empresa divergiu nesta consulta. Confira o pedido antes de usar os valores.');
 const financeiro=resumoFinanceiroComercial([pedido],resposta.financeiro,hoje)[String(pedido.numero)]||null;
 return {pedido,financeiro,operacao:resposta.operacao,consultadoEm:resposta.consultadoEm};
}

export function metasNoPeriodo(metas,periodo={}) {
 if(!periodo.de||!periodo.ate)return [];
 return (metas||[]).filter(m=>m.mes>=periodo.de.slice(0,7)&&m.mes<=periodo.ate.slice(0,7))
  .sort((a,b)=>b.mes.localeCompare(a.mes)||String(a.vendedorId).localeCompare(String(b.vendedorId)));
}
