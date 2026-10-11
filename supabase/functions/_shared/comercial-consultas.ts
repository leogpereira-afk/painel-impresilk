import {pertence,dataISO} from './comercial.mjs';
import {mesclarOrdensComerciais} from './carteira-historica.mjs';
import {financeiroDasOS} from './financeiro-os.ts';
export async function lerTodasComerciais(criar:any) {
 const xs:any[]=[];
 for(let inicio=0;inicio<100000;inicio+=500){const {data,error}=await criar().range(inicio,inicio+499);if(error||!Array.isArray(data))throw Object.assign(new Error('Não foi possível ler todos os registros.'),{status:503});xs.push(...data);if(data.length<500)return xs;}
 throw Object.assign(new Error('Consulta excedeu o limite. A cobertura não foi apresentada como completa.'),{status:503});
}
export async function detalharVendasCliente(sb:any,vendas:any[],recentes:any[],escopo:any,clienteId:string|null,hoje:string) {
 const ids=[...new Set(vendas.map(o=>String(o.id)))],historico:any[]=[];
 for(let de=0;de<ids.length;de+=200)historico.push(...await lerTodasComerciais(()=>sb.from('painel_ordens').select('id,numero,cliente,data,valor,bruto,desconto,vendedor,itens,comercial,atualizado_em').in('id',ids.slice(de,de+200)).order('id')));
 const permitidos=new Set(ids);
 return mesclarOrdensComerciais(historico.map(o=>({...o,valorBruto:o.bruto})),recentes.filter(o=>permitidos.has(String(o.id))))
  .filter((o:any)=>(clienteId===null||String(o.clienteId)===String(clienteId))&&pertence(o,escopo)&&String(o.tipo||'').toLowerCase()==='normal'&&!o.cancelada&&dataISO(String(o.data||'').slice(0,10))&&String(o.data).slice(0,10)<=hoje);
}
// Apenas campos comerciais autorizados. O registro sincronizado nunca passa
// inteiro pelo detalhe: metadados futuros não ampliam esta porta sozinhos.
export function projetarVendaCliente(o:any) {
 const itens=Array.isArray(o.itens)?o.itens.map((i:any)=>Object.fromEntries(['id','produtoId','produto','categoriaId','categoria','quantidade','unidade','valor','valorUnitario','subtotal','desconto'].filter(k=>Object.hasOwn(i,k)).map(k=>[k,i[k]]))):[];
 return {id:String(o.id),numero:o.numero||'',data:o.data,clienteId:String(o.clienteId||''),cliente:o.cliente||'',trabalho:itens.map((i:any)=>i.produto).filter(Boolean).slice(0,3).join(' · '),valor:o.valorConfirmado===false?null:o.valor??null,valorBruto:o.valorBruto??o.bruto??null,desconto:o.desconto??null,valorConfirmado:o.valorConfirmado!==false&&o.valor!=null,itens,itensDisponiveis:Array.isArray(o.itens),vendedorId:o.vendedorErpId||o.vendedorId||null,vendedorNome:o.vendedorNome||o.vendedor||'',tipo:o.tipo||null,cancelada:o.cancelada===true,atualizadoEm:o.atualizado_em||null,entregaRealEm:o.entregaRealEm||null,elegivelPosVenda:o.elegivelPosVenda===true,operacao:o.operacao||null};
}
export function paginarVendasCliente(vendas:any[],pagina:any=1,tamanho:any=20) {
 if(!Number.isInteger(pagina)||pagina<1||!Number.isInteger(tamanho)||tamanho<1||tamanho>100)throw Object.assign(new Error('Página de histórico inválida.'),{status:400});
 const ordenadas=[...vendas].sort((a,b)=>String(b.data).localeCompare(String(a.data))||String(a.id).localeCompare(String(b.id)));
 const paginas=Math.max(1,Math.ceil(ordenadas.length/tamanho));if(pagina>paginas)throw Object.assign(new Error('Página de histórico inválida.'),{status:400});
 return {vendas:ordenadas.slice((pagina-1)*tamanho,pagina*tamanho).map(projetarVendaCliente),paginacao:{pagina,tamanho,total:ordenadas.length,paginas,temMais:pagina<paginas}};
}
export function timelineContatosCliente(acoes:any[]) {
 return acoes.flatMap(a=>Array.isArray(a.contatos)?a.contatos.filter((c:any)=>c&&c.em&&Number.isFinite(Date.parse(c.em))).map((c:any)=>({acaoId:String(a.id),em:c.em,autor:c.autor||'',resultado:c.resultado||'',nota:c.nota||'',resultadoContato:c.resultadoContato||null,motivoPerda:c.motivoPerda||null,observacaoPerda:c.observacaoPerda||'',canal:c.canal||null,proximoPasso:c.proximoPasso||null,espera:c.espera||null,concluida:c.concluida===true,origem:'comercial'})):[]).sort((a,b)=>String(b.em).localeCompare(String(a.em))||a.acaoId.localeCompare(b.acaoId));
}
export function pedidosPosVendaPendentes(vendas:any[],acoes:any[]) {
 const elegiveis=vendas.filter(o=>o.elegivelPosVenda===true&&o.entregaRealEm).sort((a,b)=>String(b.entregaRealEm).localeCompare(String(a.entregaRealEm))||String(a.id).localeCompare(String(b.id))),pedidos:any[]=[];
 for(const o of elegiveis){
  const relacionadas=acoes.filter(a=>a.tipoAcao==='pos_venda'&&String(a.ordemId)===String(o.id));
  const concluido=relacionadas.some(a=>a.status==='concluida'&&a.contatoEm&&Array.isArray(a.contatos)&&a.contatos.some((c:any)=>c.em===a.contatoEm));
  if(concluido)continue;
  const aberta=relacionadas.filter(a=>a.status!=='concluida').sort((a,b)=>String(a.data).localeCompare(String(b.data))||String(a.id).localeCompare(String(b.id)))[0];
  const legadoConcluido=relacionadas.some(a=>a.status==='concluida');
  pedidos.push({...projetarVendaCliente(o),posVendaPendente:true,posVendaEstado:aberta?'em_acompanhamento':legadoConcluido?'a_conferir':'sem_acao',acaoPosVenda:aberta?Object.fromEntries(['id','tipoAcao','clienteId','ordemId','descricao','data','status','versao'].map(k=>[k,aberta[k]??null])):null,criterioPosVenda:'Entrega efetiva comprovada no PCP e sem pós-venda concluído com contato confirmado.'});
 }
 return {pedidos,elegiveisNaPagina:elegiveis.length,pendentesNaPagina:pedidos.length};
}
export async function consultarFinanceiroComercial(sb:any,vendas:any[],consultadoEm=new Date().toISOString()) {
 const vazio={abertos:[],pagos:[],permutaDaOS:{},consultadas:[],temPagos:false,desdeDados:null,atualizadoEm:null,pagosEm:null,fonte:'Financeiro do Painel',consultadoEm};
 const candidatos=[...new Set(vendas.map(o=>String(o.numero||'')))].filter(n=>/^\d{1,12}$/.test(n)).slice(0,600);
 if(!candidatos.length)return {...vazio,estado:'a_conferir',codigo:'OS_SEM_NUMERO',erro:null};
 try{
  const mesmos=await lerTodasComerciais(()=>sb.from('painel_ordens').select('id,numero,vendedor,comercial').in('numero',candidatos).order('id'));
  const contagens=new Map<string,number>();for(const o of mesmos)contagens.set(String(o.numero),(contagens.get(String(o.numero))||0)+1);
  const vendasPorNumero=new Map<string,any[]>();for(const o of vendas){const n=String(o.numero);vendasPorNumero.set(n,[...(vendasPorNumero.get(n)||[]),o]);}
  const seguros=candidatos.filter(n=>contagens.get(n)===1&&vendasPorNumero.get(n)?.length===1&&mesmos.some(o=>String(o.numero)===n&&String(o.id)===String(vendasPorNumero.get(n)![0].id)));
  if(!seguros.length)return {...vazio,estado:'a_conferir',codigo:'VINCULO_FINANCEIRO_AMBIGUO',erro:null};
  const ids=vendas.filter(o=>seguros.includes(String(o.numero))).map(o=>String(o.id));
  const lerCacheComData=async(chave:string)=>{const {data,error}=await sb.from('painel_cache').select('valor,atualizado_em').eq('chave',chave).maybeSingle();if(error)throw error;return {valor:data?.valor??null,em:data?.atualizado_em??null};};
  const f=await financeiroDasOS(new Set(seguros),ids,{sb,lerCacheComData});
  const incompletas=vendas.filter(o=>!seguros.includes(String(o.numero))).map(o=>String(o.id));
  return {...vazio,...f,consultadas:seguros,estado:incompletas.length?'a_conferir':'disponivel',idsAConferir:incompletas,codigo:incompletas.length?'VINCULO_FINANCEIRO_PARCIAL':null,erro:null};
 }catch{return {...vazio,estado:'indisponivel',codigo:'FINANCEIRO_INDISPONIVEL',erro:'Não foi possível consultar a fonte financeira. Atualize para tentar novamente.'};}
}
