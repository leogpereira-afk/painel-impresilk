const normal=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const abortar=signal=>{if(signal?.aborted)throw Object.assign(new Error('Consulta cancelada.'),{name:'AbortError'});};
// Consulta por carteira, com recorte explícito e confirmado pelo servidor.
export async function carregarEntregasPosVenda(consultar,{filtro={},vendasDesde=null,signal,aoAtualizar}={}){
 const pedidos=new Map();let pagina=1,verificados=0,totalCandidatos=null,coberturaCompleta=true,ultima=null;
 while(pagina<=1000){
  abortar(signal);
  const d=await consultar('consultarPosVenda',{filtro:{vendedor:filtro.vendedor||'',equipe:filtro.equipe||''},pagina,tamanho:100,incluirConcluidos:true,...(vendasDesde?{vendasDesde}:{})},signal);
  abortar(signal);
  if(d?.incluiConcluidos!==true)throw new Error('A versão do serviço de pós-venda precisa ser atualizada para consultar concluídos. A direção pode conferir a publicação do servidor.');
  if(vendasDesde&&d?.vendasDesde!==vendasDesde)throw new Error('O serviço ainda não confirmou o recorte das vendas. Atualize o servidor antes de consultar.');
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

// IDs mantêm vendedores homônimos separados; o nome só identifica legado sem ID.
export const chaveVendedorPosVenda=p=>p.vendedorId?`id:${p.vendedorId}`:p.vendedorNome?`nome:${normal(p.vendedorNome)}`:'sem_vendedor';
export function vendedoresPosVenda(pedidos,catalogo=[]){
 const grupos=new Map();
 for(const p of pedidos){
  const id=chaveVendedorPosVenda(p);
  const nome=catalogo.find(v=>String(v.id)===String(p.vendedorId))?.nome||p.vendedorNome||'Vendedor a conferir';
  const grupo=grupos.get(id)||{id,nome,total:0};grupo.total++;grupos.set(id,grupo);
 }
 return [...grupos.values()].sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')||a.id.localeCompare(b.id));
}

export const VENDAS_DESDE_POS_VENDA='2026-10-12';
export function diasDesdeEntrega(entrega,hoje){
 const valido=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
 if(!entrega||!valido(hoje))return null;
 let dia=entrega;
 if(typeof entrega==='string'&&entrega.includes('T')){
  if(!Number.isFinite(Date.parse(entrega)))return null;
  const partes=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(entrega));
  const valor=t=>partes.find(p=>p.type===t)?.value;
  dia=`${valor('year')}-${valor('month')}-${valor('day')}`;
 }
 if(!valido(dia)||dia>hoje)return null;
 return Math.round((Date.parse(hoje)-Date.parse(dia))/86400000);
}
