const normal=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const abortar=signal=>{if(signal?.aborted)throw Object.assign(new Error('Consulta cancelada.'),{name:'AbortError'});};
// Consulta operacional por carteira. O mês das vendas não limita entregas antigas.
export async function carregarEntregasPosVenda(consultar,{filtro={},signal,aoAtualizar}={}){
 const pedidos=new Map();let pagina=1,verificados=0,totalCandidatos=null,coberturaCompleta=true,ultima=null;
 while(pagina<=1000){
  abortar(signal);
  const d=await consultar('consultarPosVenda',{filtro:{vendedor:filtro.vendedor||'',equipe:filtro.equipe||''},pagina,tamanho:100,incluirConcluidos:true},signal);
  abortar(signal);
  if(d?.incluiConcluidos!==true)throw new Error('A versão do serviço de pós-venda precisa ser atualizada para consultar concluídos. A direção pode conferir a publicação do servidor.');
  const p=d?.paginacao;
  if(!Array.isArray(d?.pedidos)||!Number.isInteger(p?.total)||p.total<0||!Number.isInteger(p?.paginas)||p.paginas<1||p.pagina!==pagina||typeof p.temMais!=='boolean'||(p.temMais&&pagina>=p.paginas)||(!p.temMais&&pagina<p.paginas))throw new Error('Resposta da consulta de pós-venda incompleta. Atualize para conferir as páginas.');
  if(totalCandidatos!==null&&totalCandidatos!==p.total)coberturaCompleta=false;
  totalCandidatos=p.total;
  for(const o of d.pedidos){if(!o?.id)throw new Error('Pedido sem identificação na consulta de pós-venda.');pedidos.set(String(o.id),o);}
  verificados+=Number(d.cobertura?.verificadosNaPagina)||0;
  coberturaCompleta=coberturaCompleta&&d.cobertura?.completa===true&&d.coberturaHistorica?.completo!==false;
  ultima={...d,pedidos:[...pedidos.values()],verificados,totalCandidatos,coberturaCompleta,finalizada:!p.temMais,paginasConsultadas:pagina};
  aoAtualizar?.(ultima);
  if(!p.temMais)return ultima;
  pagina++;
 }
 throw new Error('O histórico excedeu o limite da consulta. A cobertura permanece parcial.');
}
export function estadoPosVenda(p,hoje){
 if(p.posVendaEstado==='concluido')return 'concluidos';
 if(p.posVendaEstado==='a_conferir')return 'a_conferir';
 if(!p.acaoPosVenda)return 'sem_acao';
 return p.acaoPosVenda.data&&p.acaoPosVenda.data<hoje?'atrasados':'programados';
}
export function resumirPosVenda(pedidos,{busca='',situacao='pendentes'}={},hoje){
 const termos=normal(busca).split(/\s+/).filter(Boolean);
 const encontrados=pedidos.filter(p=>termos.every(t=>normal([p.numero,p.cliente,p.vendedorNome,p.acaoPosVenda?.vendedorNome,p.acaoPosVenda?.descricao,p.acaoPosVenda?.resultado,p.ultimaInteracao?.relatoAtendimento].join(' ')).includes(t)));
 const contagens={todos:encontrados.length,pendentes:0,sem_acao:0,programados:0,atrasados:0,concluidos:0,a_conferir:0};
 for(const p of encontrados){const e=estadoPosVenda(p,hoje);contagens[e]++;if(e!=='concluidos')contagens.pendentes++;}
 const ordem={atrasados:0,sem_acao:1,a_conferir:2,programados:3,concluidos:4};
 const itens=encontrados.filter(p=>situacao==='todos'||(situacao==='pendentes'?estadoPosVenda(p,hoje)!=='concluidos':estadoPosVenda(p,hoje)===situacao)).sort((a,b)=>ordem[estadoPosVenda(a,hoje)]-ordem[estadoPosVenda(b,hoje)]||String(a.acaoPosVenda?.data||'').localeCompare(String(b.acaoPosVenda?.data||''))||String(b.entregaRealEm).localeCompare(String(a.entregaRealEm))||String(a.id).localeCompare(String(b.id)));
 return {itens,contagens};
}

export function dataReferenciaPosVenda(p){return p.posVendaEstado==='concluido'?p.ultimaInteracao?.em||p.acaoPosVenda?.contatoEm||null:p.acaoPosVenda?.data||null;}
