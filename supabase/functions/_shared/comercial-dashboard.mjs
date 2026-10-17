import {dataISO, dia, dinheiro, normal, pertence, resolverEscopo, metaDoPeriodo, progressoMeta, agruparRevisoes, anteriorEquivalente} from './comercial.mjs';
import {janelasHistoricas, mesclarOrdensComerciais} from './carteira-historica.mjs';
import {numerosDeOSComercial} from './vinculo-financeiro-os.mjs';

// Pure, shared calculation boundary. All monetary amounts leaving this module
// are integer cents; quantities remain separated by their explicitly recorded unit.
export const CRITERIO_DASHBOARD = 'O.S. normal não cancelada, valor líquido na data de cadastro. Venda não equivale a faturamento nem a recebimento.';
const erro = (message, status=400) => Object.assign(new Error(message), {status});
const texto = v => String(v ?? '').trim();
const dias = (a,b) => Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/864e5);
const deslocar = (d,n) => new Date(Date.parse(d+'T12:00:00Z')+n*864e5).toISOString().slice(0,10);
const fimMes = m => new Date(Date.UTC(Number(m.slice(0,4)),Number(m.slice(5,7)),0,12)).toISOString().slice(0,10);
const noPeriodo = (o,p) => o.data>=p.de && o.data<=p.ate;
const centavos = v => {const c=dinheiro(v);return Number.isSafeInteger(c)?c:null;};
const porValor = (a,b) => b.centavos-a.centavos || a.nome.localeCompare(b.nome,'pt-BR') || a.id.localeCompare(b.id);
const somaSegura = xs => {const total=xs.reduce((s,x)=>s+x,0);if(!Number.isSafeInteger(total))throw erro('O total excedeu a precisão monetária suportada.',422);return total;};
const mediana = xs => {if(!xs.length)return null;const n=[...xs].sort((a,b)=>a-b),i=Math.floor(n.length/2);return n.length%2?n[i]:(n[i-1]+n[i])/2;};
const identificador = v => {if(v==null||v==='')return '';if(!['string','number'].includes(typeof v)||texto(v).length>200)throw erro('Filtro comercial inválido.');return texto(v);};

export function validarFiltroDashboard(filtro={},hoje,primeiraData=null) {
 if(!filtro||typeof filtro!=='object'||Array.isArray(filtro)||!dataISO(hoje))throw erro('Filtro comercial inválido.');
 const modo=filtro.modo||'mes';let de,ate;
 if(modo==='mes'){const mes=texto(filtro.mes||hoje.slice(0,7));if(!dataISO(mes+'-01'))throw erro('Escolha um mês válido.');de=mes+'-01';ate=fimMes(mes);}
 else if(modo==='ano'){const ano=texto(filtro.ano||hoje.slice(0,4));if(!/^\d{4}$/.test(ano))throw erro('Escolha um ano válido.');de=ano+'-01-01';ate=ano+'-12-31';}
 else if(modo==='todos'){de=dataISO(primeiraData)?primeiraData:hoje;ate=hoje;}
 else if(modo==='personalizado'){de=texto(filtro.de);ate=texto(filtro.ate);}
 else throw erro('Período comercial desconhecido.');
 if(!dataISO(de)||!dataISO(ate)||de>ate||de<'1900-01-01'||de>hoje||ate>'2199-12-31')throw erro('Escolha datas válidas, sem início no futuro.');
 const abcA=filtro.abcA==null?80:Number(filtro.abcA),abcB=filtro.abcB==null?95:Number(filtro.abcB);
 if(!Number.isFinite(abcA)||!Number.isFinite(abcB)||abcA<=0||abcA>=abcB||abcB>=100)throw erro('Curva ABC: informe limites crescentes entre 0 e 100.');
 return {...Object.fromEntries(['vendedor','cliente','produto','categoria','campanha','equipe'].map(k=>[k,identificador(filtro[k])])),abcA,abcB,
  modo,de,ate,ateEfetivo:ate>hoje?hoje:ate,parcial:ate>hoje};
}

function equivalenteAno(d) {
 const ano=Number(d.slice(0,4))-1,mes=d.slice(5,7),ultimo=fimMes(`${ano}-${mes}`).slice(8);
 return `${ano}-${mes}-${String(Math.min(Number(d.slice(8)),Number(ultimo))).padStart(2,'0')}`;
}
export function periodosComparacao(p) {
 if(p.modo==='todos')return {anterior:null,anoAnterior:null};
 const atual={de:p.de,ate:p.ateEfetivo};let anterior;
 if(p.modo==='mes'){
  const data=new Date(p.de+'T12:00:00Z');data.setUTCMonth(data.getUTCMonth()-1);const mes=data.toISOString().slice(0,7);
  anterior={de:mes+'-01',ate:p.parcial?mes+'-'+String(Math.min(Number(p.ateEfetivo.slice(8)),Number(fimMes(mes).slice(8)))).padStart(2,'0'):fimMes(mes)};
 }else if(p.modo==='ano')anterior={de:equivalenteAno(p.de),ate:equivalenteAno(p.ateEfetivo)};
 else anterior={de:deslocar(p.de,-dias(p.de,p.ateEfetivo)-1),ate:deslocar(p.de,-1)};
 return {anterior:{...anterior,criterio:p.modo==='mes'?'Mesmo intervalo no mês anterior':p.modo==='ano'?'Mesmo intervalo no ano anterior':'Intervalo anterior com a mesma duração'},anoAnterior:{de:equivalenteAno(atual.de),ate:equivalenteAno(atual.ate),criterio:'Datas equivalentes no ano anterior'}};
}

export function coberturaDashboard(janelas,p) {
 if(!p||p.de>p.ate)return false;
 return janelas.some(j=>j.desde<=p.de&&j.ate>=p.ate);
}

function empresaDivergente(o) {
 // Legacy projection has no company identifier. Explicit names are checked;
 // absence is exposed as a source limitation rather than invented proof.
 const nome=texto(o.empresaNome||o.empresa_nome||(typeof o.empresa==='string'?o.empresa:o.empresa?.nome));
 return !!nome&&!['impresilk','impresilk comunicacao visual','impresilk comunicacao visual ltda','impresilk c. v. ltda'].includes(normal(nome));
}

function indexarCatalogo(catalogo){const porId=new Map(),porNome=new Map();for(const item of catalogo){porId.set(String(item.id),item);const nome=normal(item.nome),xs=porNome.get(nome)||[];xs.push(item);porNome.set(nome,xs);}return {porId,porNome};}
export function ratearProdutosDashboard(o,catalogo=[],indice=null) {
 const total=centavos(o.valor),itens=Array.isArray(o.itens)?o.itens:[];
 const validos=itens.length>0&&itens.every(i=>centavos(i.valorTotal)!==null&&centavos(i.valorTotal)>=0&&texto(i.produto||i.nome));
 const soma=validos?somaSegura(itens.map(i=>centavos(i.valorTotal))):0;
 if(total===null)return [];
 if(!validos||soma<=0)return [{id:'__sem_itens',nome:'Itens não disponíveis',categoria:'Não informada',centavos:total,quantidades:{},itensCompletos:false}];
 // Largest remainder preserves cents and is stable even with many small items.
 const denominador=BigInt(soma),partes=itens.map((i,pos)=>{const numerador=BigInt(total)*BigInt(centavos(i.valorTotal));return {i,pos,inteiro:Number(numerador/denominador),resto:numerador%denominador};});
 let faltam=total-partes.reduce((s,p)=>s+p.inteiro,0);
 for(const p of [...partes].sort((a,b)=>a.resto===b.resto?a.pos-b.pos:a.resto>b.resto?-1:1)){p.c=p.inteiro+(faltam-->0?1:0);}
 const indices=indice||indexarCatalogo(catalogo);
 return partes.map(({i,c})=>{
  const candidatos=indices.porNome.get(normal(i.produto||i.nome))||[],encontrado=indices.porId.get(String(i.produtoId||''))||(candidatos.length===1?candidatos[0]:null);
  const id=texto(encontrado?.id||i.produtoId)||`nome:${normal(i.produto||i.nome)}|${normal(i.categoria)}`;
  const unidade=texto(i.unidade),q=i.quantidade==null?null:Number(i.quantidade),quantidades={};
  if(o.unidadesConfirmadas!==false&&unidade&&texto(i.quantidade)!==''&&Number.isFinite(q)&&q>=0)quantidades[unidade]=q;
  return {id,nome:texto(i.produto||i.nome),categoria:texto(i.categoria||encontrado?.categoria)||'Não informada',centavos:c,quantidades,itensCompletos:true,unidadeAusente:!unidade};
 });
}

function vendedorDa(o,catalogo,indice=null) {
 const id=texto(o.vendedorErpId||o.responsavelId),nome=texto(o.vendedorNome||o.vendedor);
 const indices=indice||indexarCatalogo(catalogo),candidato=indices.porId.get(id)||indices.porId.get(String(o.vendedorId||''));
 if(candidato)return {id:String(candidato.id),nome:texto(candidato.nome)};
 const nomes=indices.porNome.get(normal(nome))||[];
 return nomes.length===1?{id:String(nomes[0].id),nome:texto(nomes[0].nome)}:{id:id||`legado:${normal(nome)||'sem-vendedor'}`,nome:nome||'Vendedor não identificado'};
}

export function prepararDashboard(base,filtro,hoje,sessao) {
 const catalogo=base.catalogo||{};
 if(!catalogo.completo)throw erro('O catálogo comercial ainda não está disponível por completo.',503);
 const escopo=resolverEscopo(sessao,catalogo,base.config||{},filtro),escopoSessao=resolverEscopo(sessao,catalogo,base.config||{},{});
 const misturadas=mesclarOrdensComerciais(base.ordens||[],base.recentes||[]),autorizadas=misturadas.filter(o=>pertence(o,escopo));
 const divergentes=autorizadas.filter(empresaDivergente),ordens=autorizadas.filter(o=>!empresaDivergente(o));
 const janelas=janelasHistoricas(base.cargaStatus),datas=ordens.map(o=>dia(o.data)).filter(d=>dataISO(d)&&d<=hoje);
 const primeira=[...datas,...janelas.map(j=>j.desde)].sort()[0]||null,p=validarFiltroDashboard(filtro,hoje,primeira);
 const campanhas=Array.isArray(base.campanhas)?base.campanhas:[],campanha=p.campanha?campanhas.find(c=>String(c.id)===p.campanha):null;
 if(p.campanha&&!campanha)throw erro('Campanha indisponível ou fora do seu acesso.',403);
 const osCampanha=campanha?new Set(Object.keys(campanha.os||{})):null;
 const indiceProdutos=indexarCatalogo(catalogo.produtos||[]),indiceVendedores=indexarCatalogo(catalogo.vendedores||[]);
 const falhas=[],vendas=[],vendasPendentes=[],itensNaoIdentificados=[],produtosCatalogo=new Map(),clientesCatalogo=new Map();
 for(const bruto of ordens){
  const data=dia(bruto.data),tipo=normal(bruto.tipo),valor=bruto.valorConfirmado===false?null:centavos(bruto.valor);
  if(bruto.cancelada||(tipo&&tipo!=='normal')||(dataISO(data)&&data>hoje))continue;
  const clienteId=texto(bruto.clienteId)||'__sem_cliente',vendedor=vendedorDa(bruto,catalogo.vendedores||[],indiceVendedores);
  if(!tipo||valor===null||valor<0||!dataISO(data)){falhas.push({data,clienteId,id:texto(bruto.id)});continue;}
  const produtos=ratearProdutosDashboard(bruto,catalogo.produtos||[],indiceProdutos);
  for(const pr of produtos)produtosCatalogo.set(pr.id,{id:pr.id,nome:pr.nome,categoria:pr.categoria});
  clientesCatalogo.set(clienteId,{id:clienteId,nome:clienteId==='__sem_cliente'?'Cliente não identificado':texto(bruto.cliente)||'Cliente sem nome'});
  if((!p.cliente||p.cliente===clienteId)&&(!osCampanha||osCampanha.has(String(bruto.id)))&&produtos.some(pr=>!pr.itensCompletos))itensNaoIdentificados.push({data});
  const selecionados=produtos.filter(pr=>(!p.produto||pr.id===p.produto)&&(!p.categoria||pr.categoria===p.categoria));
  if(p.cliente&&p.cliente!==clienteId||osCampanha&&!osCampanha.has(String(bruto.id))||!selecionados.length)continue;
  const venda={id:texto(bruto.id),numero:texto(bruto.numero),data,clienteId,cliente:clientesCatalogo.get(clienteId).nome,vendedorId:vendedor.id,vendedor:vendedor.nome,
   empresaConfirmada:!!texto(bruto.empresaNome||bruto.empresa_nome||(typeof bruto.empresa==='string'?bruto.empresa:bruto.empresa?.nome)),centavos:somaSegura(selecionados.map(i=>i.centavos)),totalOS:valor,brutoCentavos:centavos(bruto.valorBruto??bruto.bruto),descontoCentavos:centavos(bruto.desconto),
   sinalPagoCentavos:centavos(bruto.sinalPago)!==null&&centavos(bruto.sinalPago)>=0?centavos(bruto.sinalPago):null,
   produtos:selecionados,itensCompletos:produtos.every(i=>i.itensCompletos),atualizadoEm:bruto.atualizado_em||null};
  if(venda.empresaConfirmada)vendas.push(venda);else vendasPendentes.push(venda);
 }
 // Invalid IDs do not silently create a seemingly empty result.
 for(const [campo,mapa] of [['cliente',clientesCatalogo],['produto',produtosCatalogo]])if(p[campo]&&!mapa.has(p[campo]))throw erro('Filtro fora do histórico comercial autorizado.',400);
 const categorias=[...new Set([...produtosCatalogo.values()].map(p=>p.categoria))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 if(p.categoria&&!categorias.includes(p.categoria))throw erro('Categoria fora do histórico autorizado.',400);
 return {base,p,escopo,janelas,vendas,vendasPendentes,falhas,divergentes,itensNaoIdentificados,ordensGlobais:misturadas,catalogo:{vendedores:escopoSessao.vendedores.map(v=>({id:String(v.id),nome:texto(v.nome)})).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')),produtos:[...produtosCatalogo.values()].sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')),clientes:[...clientesCatalogo.values()].sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')),categorias,campanhas:campanhas.filter(c=>Object.keys(c.os||{}).some(id=>ordens.some(o=>String(o.id)===id))).map(c=>({id:String(c.id),nome:texto(c.nome)||'Campanha'})),anos:[...new Set(datas.map(d=>d.slice(0,4)))].sort().reverse()}};
}

function integridade(ctx,p) {
 const falhas=ctx.falhas.filter(f=>!dataISO(f.data)||noPeriodo(f,p));
 const itensAusentes=ctx.itensNaoIdentificados.some(v=>noPeriodo(v,p));
 const semEmpresa=ctx.vendasPendentes.filter(v=>noPeriodo(v,p)).length;
 const abrangencia=coberturaDashboard(ctx.janelas,p),filtroItens=!!(ctx.p.produto||ctx.p.categoria);
 return {completo:abrangencia&&!falhas.length&&!(filtroItens&&itensAusentes)&&!semEmpresa,abrangencia,falhas:falhas.length,itensAusentes,semEmpresa};
}
function resumir(ctx,p) {
 const vs=ctx.vendas.filter(v=>noPeriodo(v,p)),i=integridade(ctx,p),total=somaSegura(vs.map(v=>v.centavos)),conhecido=i.completo||vs.length>0;
 const brutoCompleto=!ctx.p.produto&&!ctx.p.categoria&&vs.every(v=>v.brutoCentavos!==null&&v.descontoCentavos!==null&&v.brutoCentavos-v.descontoCentavos===v.totalOS);
 const brutoCentavos=conhecido&&brutoCompleto?somaSegura(vs.map(v=>v.brutoCentavos)):null,descontoCentavos=conhecido&&brutoCompleto?somaSegura(vs.map(v=>v.descontoCentavos)):null;
 return {centavos:conhecido?total:null,pedidos:conhecido?vs.length:null,clientes:conhecido?new Set(vs.filter(v=>v.clienteId!=='__sem_cliente').map(v=>v.clienteId)).size:null,ticketMedio:vs.length?Math.round(total/vs.length):null,
  brutoCentavos,descontoCentavos,descontoPercentual:i.completo&&brutoCentavos>0&&descontoCentavos!==null?descontoCentavos/brutoCentavos*100:null,
  certificadoEmpresa:!i.semEmpresa,empresaConfirmadaCentavos:somaSegura(vs.filter(v=>v.empresaConfirmada).map(v=>v.centavos)),empresaNaoIdentificadaCentavos:somaSegura(ctx.vendasPendentes.filter(v=>noPeriodo(v,p)).map(v=>v.centavos)),empresaNaoIdentificadaPedidos:ctx.vendasPendentes.filter(v=>noPeriodo(v,p)).length,completo:i.completo,estado:i.completo?'completo':vs.length?'parcial':'indisponivel',observadas:vs.length,itensAusentes:vs.filter(v=>!v.itensCompletos).length};
}

export function curvaABCDashboard(grupos,limites={abcA:80,abcB:95}) {
 const total=somaSegura(grupos.map(g=>g.centavos)),ordenados=[...grupos].sort(porValor);let acumulado=0;
 return ordenados.map((g,index)=>{const antes=total?acumulado/total*100:0;acumulado+=g.centavos;return {...g,posicao:index+1,participacao:total?g.centavos/total*100:null,acumuladoPercentual:total?acumulado/total*100:null,abc:!total?null:antes<limites.abcA?'A':antes<limites.abcB?'B':'C'};});
}
function agrupar(vendas,dimensao,p) {
 const grupos=new Map();
 for(const v of vendas){const entradas=dimensao==='produtos'?v.produtos:dimensao==='clientes'?[{id:v.clienteId,nome:v.cliente,centavos:v.centavos,quantidades:{}}]:[{id:v.vendedorId,nome:v.vendedor,centavos:v.centavos,quantidades:{}}];
  for(const e of entradas){let g=grupos.get(e.id);if(!g){g={id:e.id,nome:e.nome,categoria:e.categoria||null,centavos:0,quantidades:{},_os:new Set(),_meses:new Map(),_datas:new Set()};grupos.set(e.id,g);}g.centavos+=e.centavos;g._os.add(v.id);g._datas.add(v.data);
   for(const [u,q] of Object.entries(e.quantidades||{}))g.quantidades[u]=(g.quantidades[u]||0)+q;
   const m=v.data.slice(0,7),a=g._meses.get(m)||{mes:m,centavos:0,_os:new Set()};a.centavos+=e.centavos;a._os.add(v.id);g._meses.set(m,a);
  }
 }
 const resultado=curvaABCDashboard([...grupos.values()].map(({_os,_meses,_datas,...g})=>{
  const datas=[..._datas].sort(),meses=[..._meses.values()].map(({_os,...m})=>({...m,pedidos:_os.size})).sort((a,b)=>a.mes.localeCompare(b.mes)),porAno=new Map();
  for(const m of meses){const ano=m.mes.slice(0,4),a=porAno.get(ano)||{ano,centavos:0,pedidos:0};a.centavos+=m.centavos;a.pedidos+=m.pedidos;porAno.set(ano,a);}
  return {...g,pedidos:_os.size,ticketMedio:_os.size?Math.round(g.centavos/_os.size):null,ultimaCompra:datas.at(-1)||null,primeiraCompra:datas[0]||null,diasCompra:datas.length,intervaloMedianoDias:datas.length>=3?mediana(datas.slice(1).map((d,i)=>dias(datas[i],d))):null,meses,anos:[...porAno.values()]};
 }),p);
 for(const [campo,chave] of [['meses','mes'],['anos','ano']]){const periodos=new Map();for(const g of resultado)for(const m of g[campo]){const xs=periodos.get(m[chave])||[];xs.push({g,m});periodos.set(m[chave],xs);}for(const xs of periodos.values()){xs.sort((a,b)=>b.m.centavos-a.m.centavos||a.g.nome.localeCompare(b.g.nome,'pt-BR')||a.g.id.localeCompare(b.g.id));xs.forEach(({m},i)=>m.posicao=i+1);}}
 return resultado;
}
const LIMITE_DIAS_SERIE=366;
function indiceTemporal(ctx,tamanho) {
 // Build each granularity once per request. Daily charts must not repeatedly
 // scan the whole history for every day, and invalid dates affect all buckets.
 ctx.indicesSeries ||= new Map();
 if(ctx.indicesSeries.has(tamanho))return ctx.indicesSeries.get(tamanho);
 const grupos=new Map(),globais=[];
 for(const campo of ['vendas','vendasPendentes','falhas','itensNaoIdentificados'])for(const item of ctx[campo]){
  // Sales/item rows were already date-validated at prepararDashboard. Only
  // rejected source rows can still carry an invalid date here.
  if(campo==='falhas'&&!dataISO(item.data)){globais.push(item);continue;}
  const chave=item.data.slice(0,tamanho);let grupo=grupos.get(chave);
  if(!grupo){grupo={vendas:[],vendasPendentes:[],falhas:[],itensNaoIdentificados:[]};grupos.set(chave,grupo);}
  grupo[campo].push(item);
 }
 const indice={grupos,globais};ctx.indicesSeries.set(tamanho,indice);return indice;
}
function serieTemporal(ctx,p,tipo) {
 const tamanho=tipo==='data'?10:tipo==='mes'?7:4,{grupos,globais}=indiceTemporal(ctx,tamanho),out=[];
 let inicio=p.de,acumulado=0,continuo=true;
 while(inicio<=p.ate){
  const chave=inicio.slice(0,tamanho),fim=tipo==='data'?inicio:tipo==='mes'?fimMes(chave):chave+'-12-31',ate=fim>p.ate?p.ate:fim;
  const grupo=grupos.get(chave)||{vendas:[],vendasPendentes:[],falhas:[],itensNaoIdentificados:[]};
  const resumo=resumir({...ctx,...grupo,falhas:[...grupo.falhas,...globais]},{de:inicio,ate});
  continuo=continuo&&resumo.completo&&resumo.centavos!==null;
  if(continuo)acumulado=somaSegura([acumulado,resumo.centavos]);
  out.push({[tipo]:chave,de:inicio,ate,...resumo,acumuladoCentavos:continuo?acumulado:null});
  inicio=deslocar(ate,1);
 }
 return out;
}
function seriesDashboard(ctx,p) {
 ctx.seriesPorPeriodo ||= new Map();const chave=p.de+'|'+p.ate;
 if(ctx.seriesPorPeriodo.has(chave))return ctx.seriesPorPeriodo.get(chave);
 const diariaDisponivel=dias(p.de,p.ate)+1<=LIMITE_DIAS_SERIE;
 const series={diaria:diariaDisponivel?serieTemporal(ctx,p,'data'):null,mensal:serieTemporal(ctx,p,'mes'),anual:serieTemporal(ctx,p,'ano'),diariaDisponivel,limiteDias:LIMITE_DIAS_SERIE,motivoDiaria:diariaDisponivel?null:`A série diária está disponível para intervalos de até ${LIMITE_DIAS_SERIE} dias. Use mês ou ano neste recorte.`};
 ctx.seriesPorPeriodo.set(chave,series);return series;
}
function comparacao(ctx,periodo,atual) {
 if(!periodo)return {estado:'incompativel',mensagem:'Selecione mês, ano ou intervalo para comparar períodos.',periodo:null,centavos:null,delta:null,percentual:null,completo:false,comparavel:false,series:null};
 const anterior=resumir(ctx,periodo),completo=anterior.completo&&atual.completo;
 return {periodo,centavos:anterior.centavos,valorAtual:atual.centavos,delta:completo?atual.centavos-anterior.centavos:null,percentual:completo&&anterior.centavos>0?(atual.centavos-anterior.centavos)/anterior.centavos*100:null,completo,comparavel:completo,series:seriesDashboard(ctx,periodo),estado:completo?'completo':'parcial',criterio:periodo.criterio};
}

function comparacaoMensalDashboard(ctx,hoje,tipo) {
 const criterio=tipo==='diasUteis'?'Mesmo número de dias úteis, conforme calendário configurado':'Meses completos consecutivos';
 const vazio={estado:'incompativel',mensagem:'Selecione um mês completo para esta comparação.',periodo:null,periodoAtual:null,centavos:null,valorAtual:null,delta:null,percentual:null,completo:false,comparavel:false,series:null,criterio,calendarioConfigurado:null,diasUteisAtual:null,diasUteisAnterior:null};
 if(['todos','ano'].includes(ctx.p.modo)||ctx.p.de.slice(0,7)!==ctx.p.ate.slice(0,7))return vazio;
 const comparativo=anteriorEquivalente({de:ctx.p.de,ate:ctx.p.ate},hoje,tipo,ctx.base.config?.calendario);
 if(!comparativo)return vazio;
 const periodo={de:comparativo.de,ate:comparativo.ate,criterio},periodoAtual={de:comparativo.atualDe,ate:comparativo.atualAte};
 const periodos={periodo,periodoAtual,calendarioConfigurado:comparativo.calendarioConfigurado??null,diasUteisAtual:comparativo.diasUteisAtual??null,diasUteisAnterior:comparativo.diasUteisAnterior??null};
 if(comparativo.indisponivel)return {...vazio,...periodos,estado:'indisponivel',mensagem:comparativo.mensagem};
 const atual=resumir(ctx,periodoAtual),anterior=resumir(ctx,periodo),completo=atual.completo&&anterior.completo;
 return {...vazio,...periodos,estado:completo?'completo':'parcial',completo,comparavel:completo,
  valorAtual:atual.completo?atual.centavos:null,centavos:anterior.completo?anterior.centavos:null,
  delta:completo?atual.centavos-anterior.centavos:null,percentual:completo&&anterior.centavos>0?(atual.centavos-anterior.centavos)/anterior.centavos*100:null,
  mensagem:completo?null:'Comparação indisponível: falta cobertura completa ou confirmação da empresa em uma das janelas.'};
}

function serieMeta(ctx,metas) {
 const periodo={de:ctx.p.de,ate:ctx.p.ate,ateEfetivo:ctx.p.ateEfetivo},criterio='Acumulado real das vendas dos participantes da meta. Meta mensal cadastrada no fim do período, sem rateio diário.';
 const vazio={estado:metas.estado||'indisponivel',periodo,metaCentavos:null,pontos:[],criterio};
 if(ctx.p.cliente||ctx.p.produto||ctx.p.categoria||ctx.p.campanha||ctx.p.de!==ctx.p.de.slice(0,7)+'-01'||ctx.p.ate!==fimMes(ctx.p.de.slice(0,7)))return vazio;
 const participantes=new Set(metas.idsParticipantes||[]);if(!participantes.size)return vazio;
 const contexto={...ctx,indicesSeries:new Map(),vendas:ctx.vendas.filter(v=>participantes.has(v.vendedorId))};
 let pontos=serieTemporal(contexto,{de:ctx.p.de,ate:ctx.p.ateEfetivo},'data');
 if(metas.cobertura?.vinculosCompletos!==true)pontos=pontos.map(p=>({...p,completo:false,estado:p.observadas?'parcial':'indisponivel',acumuladoCentavos:null}));
 const metaCentavos=metas.cobertura?.metasCompleta&&Number.isSafeInteger(metas.valor)?metas.valor:null;
 return {...vazio,estado:metas.cobertura?.completa?'disponivel':'parcial',metaCentavos,pontos};
}

const podeConsultarFinanceiro=sessao=>sessao.master===true||(sessao.perms||[]).some(p=>p==='*'||p==='contas-atrasadas');
const FAIXAS_ATRASO=['1_7','8_30','31_60','61_90','90_mais'];

// Both the chart and its drill-down run this same attribution pipeline. Raw
// title descriptions never supply client/seller identity: confirmed O.S. do.
function apurarFinanceiroDashboard(ctx,hoje,permitido,incluirTitulos=false) {
 const titulos=[],saida=resumo=>({resumo,titulos});
 const vazio={estado:'indisponivel',vencidoCentavos:null,abertoCentavos:null,indiceAtraso:null,titulos:null,clientes:null,faixas:[],completo:false,formula:'Saldo vencido ÷ saldo em aberto dos títulos sincronizados e vinculados integralmente às vendas selecionadas × 100',escopo:'Posição atual da fonte: vencidos desde 2015 e pendentes até 90 dias após a carga. Somente títulos ligados às O.S. do período de venda; não representa saldo histórico nem parcelas futuras além dessa janela.',atualizadoEm:ctx.base.financeiroEm||null};
 if(!permitido)return saida({...vazio,estado:'sem_permissao',mensagem:'Seu acesso não inclui Contas atrasadas.'});
 if(ctx.p.produto||ctx.p.categoria)return saida({...vazio,estado:'filtro_incompativel',mensagem:'Títulos financeiros não possuem vínculo por produto ou categoria; o índice não foi rateado.'});
 if(!Array.isArray(ctx.base.recebiveis))return saida({...vazio,mensagem:'A fonte de títulos em aberto não está disponível.'});
 const porNumero=new Map();for(const o of ctx.ordensGlobais){const n=texto(o.numero);if(n)porNumero.set(n,[...(porNumero.get(n)||[]),o]);}
 const selecionadas=ctx.vendas.filter(v=>noPeriodo(v,{de:ctx.p.de,ate:ctx.p.ateEfetivo})),ids=new Set(selecionadas.map(v=>v.id)),vendasPorId=new Map(selecionadas.map(v=>[v.id,v])),clientes=new Set(),duplicadosContados=new Set();
 // A repeated title ID has no authoritative occurrence, even if amounts match.
 // Index the complete source before filtering, so order and scope cannot pick
 // an arbitrary first record as confirmed. Count uncertainty once per ID.
 const quantidadePorId=new Map();for(const t of ctx.base.recebiveis){const id=texto(t.id);if(id)quantidadePorId.set(id,(quantidadePorId.get(id)||0)+1);}
 let aberto=0,vencido=0,total=0,totalVencidos=0,incertos=0,semVinculo=0;const faixas=[{id:'1_7',nome:'1 a 7 dias',centavos:0,titulos:0},{id:'8_30',nome:'8 a 30 dias',centavos:0,titulos:0},{id:'31_60',nome:'31 a 60 dias',centavos:0,titulos:0},{id:'61_90',nome:'61 a 90 dias',centavos:0,titulos:0},{id:'90_mais',nome:'Mais de 90 dias',centavos:0,titulos:0}];
 for(const t of ctx.base.recebiveis){
  const numeros=numerosDeOSComercial(t.os),tocou=numeros.some(n=>(porNumero.get(n)||[]).some(o=>ids.has(String(o.id))));
  if(!numeros.length){semVinculo++;continue;}if(!tocou)continue;
  const tituloId=texto(t.id);if(!tituloId){incertos++;continue;}
  if(quantidadePorId.get(tituloId)>1){if(!duplicadosContados.has(tituloId)){incertos++;duplicadosContados.add(tituloId);}continue;}
  // Mixed titles are deliberately excluded, instead of distributing a debt to
  // an unconfirmed seller/client or another company by a coincident OS number.
  if(numeros.some(n=>porNumero.get(n)?.length!==1||!ids.has(String(porNumero.get(n)[0].id)))){incertos++;continue;}
  const valor=centavos(t.valor),vencimento=dia(t.vencimento); // normalized valor is the remaining balance, already net of paid amounts
  if(valor===null||valor<0||!dataISO(vencimento)){incertos++;continue;}if(!valor)continue;
  aberto=somaSegura([aberto,valor]);total++;
  if(vencimento<hoje){
   totalVencidos++;vencido=somaSegura([vencido,valor]);const atraso=dias(vencimento,hoje),f=faixas[atraso<=7?0:atraso<=30?1:atraso<=60?2:atraso<=90?3:4];f.centavos=somaSegura([f.centavos,valor]);f.titulos++;
   for(const n of numeros){const c=texto(porNumero.get(n)[0].clienteId);if(c)clientes.add(c);}
   if(incluirTitulos){
    const ordens=numeros.map(n=>vendasPorId.get(String(porNumero.get(n)[0].id))).map(({id,numero,data,clienteId,cliente,vendedorId,vendedor})=>({id,numero,data,clienteId,cliente,vendedorId,vendedor}));
    const pessoas=[...new Map(ordens.map(o=>[o.clienteId,{id:o.clienteId,nome:o.cliente}])).values()];
    titulos.push({id:texto(t.id),os:numeros.join(' / '),cliente:pessoas.map(c=>c.nome).join(' · '),clientes:pessoas,ordens,vencimento,centavos:valor,atrasoDias:atraso,faixa:f.id});
   }
  }
 }
 const completo=integridade(ctx,{de:ctx.p.de,ate:ctx.p.ateEfetivo}).completo&&!incertos&&!semVinculo&&ctx.base.financeiroFalhou!==true;
 return saida({...vazio,estado:completo?'disponivel':total?'parcial':'indisponivel',completo,vencidoCentavos:total||completo?vencido:null,abertoCentavos:total||completo?aberto:null,indiceAtraso:completo&&aberto>0?vencido/aberto*100:null,titulos:total||completo?total:null,titulosVencidos:total||completo?totalVencidos:null,clientes:total||completo?clientes.size:null,faixas,titulosAConferir:incertos,titulosSemVinculo:semVinculo,mensagem:!completo?'Índice indisponível: faltam cobertura ou vínculos financeiros confirmados.':aberto===0?'Sem saldo em aberto nos títulos vinculados.':null});
}

export function financeiroDashboard(ctx,hoje,permitido) {return apurarFinanceiroDashboard(ctx,hoje,permitido).resumo;}

function detalharAtrasosDashboard(ctx,hoje,faixa,pagina,tamanho) {
 if(faixa!=='todos'&&!FAIXAS_ATRASO.includes(faixa))throw erro('Faixa de atraso inválida.');
 const {resumo:financeiro,titulos:todos}=apurarFinanceiroDashboard(ctx,hoje,true,true);
 const titulos=todos.filter(t=>faixa==='todos'||t.faixa===faixa).sort((a,b)=>a.vencimento.localeCompare(b.vencimento)||a.id.localeCompare(b.id));
 const total=titulos.length,paginas=Math.max(1,Math.ceil(total/tamanho));if(pagina>paginas)throw erro('Página fora do detalhamento.');
 const disponivel=financeiro.vencidoCentavos!==null;
 return {tipo:'atrasos',faixa,periodo:ctx.p,referencia:hoje,criterio:financeiro.escopo,
  titulos:titulos.slice((pagina-1)*tamanho,pagina*tamanho),resumo:{centavos:disponivel?somaSegura(titulos.map(t=>t.centavos)):null,titulos:disponivel?total:null},
  paginacao:{pagina,tamanho,total,paginas,temMais:pagina<paginas},
  cobertura:{estado:financeiro.estado,completo:financeiro.completo,mensagem:financeiro.mensagem,titulosAConferir:financeiro.titulosAConferir??null,titulosSemVinculo:financeiro.titulosSemVinculo??null,atualizadoEm:financeiro.atualizadoEm,escopo:financeiro.escopo}};
}

function inteligencia(ctx,vendas,rankings,resumo,hoje) {
 const clientesIdentificados=rankings.clientes.filter(c=>c.id!=='__sem_cliente');
 const concentracao={estado:resumo.completo&&clientesIdentificados.length===rankings.clientes.length?'disponivel':'parcial',maiorCliente:clientesIdentificados[0]||null,top5Percentual:resumo.centavos>0?clientesIdentificados.slice(0,5).reduce((s,c)=>s+c.centavos,0)/resumo.centavos*100:null,criterio:'Participação nas vendas líquidas observadas no período.'};
 const porCliente=new Map();for(const v of ctx.vendas){const xs=porCliente.get(v.clienteId)||[];xs.push(v);porCliente.set(v.clienteId,xs);}
 const recompra=[];
 for(const [id,xs] of porCliente){if(id==='__sem_cliente')continue;const ds=[...new Set(xs.map(x=>x.data))].sort();if(ds.length<3||xs.some(v=>!v.empresaConfirmada)||ctx.vendasPendentes.some(v=>v.clienteId===id))continue;const intervalos=ds.slice(1).map((d,i)=>dias(ds[i],d)).sort((a,b)=>a-b),mediana=intervalos.length%2?intervalos[Math.floor(intervalos.length/2)]:(intervalos[intervalos.length/2-1]+intervalos[intervalos.length/2])/2,ultima=ds.at(-1),decorridos=dias(ultima,hoje);
  if(!mediana||decorridos<Math.ceil(mediana*1.5)||!coberturaDashboard(ctx.janelas,{de:ds[0],ate:hoje})||ctx.falhas.some(f=>f.clienteId===id))continue;
  recompra.push({clienteId:id,nome:xs[0].cliente,ultimaCompra:ultima,intervaloMedianoDias:mediana,diasSemCompra:decorridos,comprasHistoricas:xs.length,criterio:'Ao menos 3 datas de compra; tempo sem compra superior a 1,5 vez a mediana dos intervalos, com cobertura contínua.'});
 }
 const sazonalidade=Array.from({length:12},(_,i)=>({mes:i+1,centavos:0,pedidos:0,anos:new Set()}));for(const v of ctx.vendas){const s=sazonalidade[Number(v.data.slice(5,7))-1];s.centavos+=v.centavos;s.pedidos++;s.anos.add(v.data.slice(0,4));}
 const itensCompletos=vendas.every(v=>v.itensCompletos),mix=new Map();for(const v of vendas){if(v.clienteId==='__sem_cliente')continue;const set=mix.get(v.clienteId)||new Set();for(const pr of v.produtos)if(pr.id!=='__sem_itens')set.add(pr.id);mix.set(v.clienteId,set);}
 const oportunidades=[];
 if(resumo.completo&&itensCompletos){const clientes=[...mix.entries()].slice(0,300);for(const [id,set] of clientes){const pares=clientes.filter(([outro,produtos])=>outro!==id&&[...set].some(p=>produtos.has(p)));if(pares.length<3)continue;const contagem=new Map();for(const [,produtos] of pares)for(const p of produtos)if(!set.has(p))contagem.set(p,(contagem.get(p)||0)+1);for(const [produtoId,compradores] of contagem)if(compradores>=3&&compradores/pares.length>=0.5){oportunidades.push({clienteId:id,cliente:vendas.find(v=>v.clienteId===id)?.cliente,produtoId,produto:ctx.catalogo.produtos.find(p=>p.id===produtoId)?.nome,clientesComparaveis:pares.length,compradores,criterio:'Clientes com ao menos um produto em comum; produto adicional comprado por pelo menos 3 e metade dos comparáveis.'});if(oportunidades.length>=20)break;}if(oportunidades.length>=20)break;}}
 const orcamentos=agruparRevisoes(ctx.base.orcamentos||[]).filter(o=>pertence(o,ctx.escopo)&&!empresaDivergente(o)&&!!texto(o.empresaNome||o.empresa_nome||(typeof o.empresa==='string'?o.empresa:o.empresa?.nome))&&noPeriodo({data:dia(o.dataCadastro||o.dataEnvio)},{de:ctx.p.de,ate:ctx.p.ateEfetivo})&&(!ctx.p.cliente||String(o.clienteId)===ctx.p.cliente));
 const situacoes={aberto:0,ganho:0,perdido:0,conferir:0};for(const o of orcamentos)situacoes[Object.hasOwn(situacoes,o.situacao)?o.situacao:'conferir']++;
 const funilCompativel=!ctx.p.produto&&!ctx.p.categoria&&!ctx.p.campanha;
 return {recompra:{estado:recompra.length?'disponivel':'sem_evidencia_suficiente',itens:recompra.sort((a,b)=>b.diasSemCompra-a.diasSemCompra).slice(0,20),referencia:hoje},concentracao,
  sazonalidade:{estado:ctx.janelas.length?'parcial':'indisponivel',criterio:'Histórico autorizado disponível; meses e anos com cobertura incompleta podem distorcer comparações.',meses:sazonalidade.map(({anos,...m})=>({...m,anos:[...anos].sort()}))},
  oportunidades:{estado:oportunidades.length?'disponivel':!resumo.completo||!itensCompletos?'dados_insuficientes':'sem_padrao_confirmado',itens:oportunidades,limiteClientesAnalisados:300},
  funil:{estado:!funilCompativel?'filtro_incompativel':!Array.isArray(ctx.base.orcamentos)?'indisponivel':'parcial',situacoes:funilCompativel?situacoes:null,total:funilCompativel&&Array.isArray(ctx.base.orcamentos)?orcamentos.length:null,taxaConversao:null,criterio:'Situação dos orçamentos cadastrados no período; conversão por coorte e motivos de perda exigem vínculos de origem confirmados.'},
  margem:{estado:'indisponivel',centavos:null,percentual:null,mensagem:'Custos e devoluções vinculados não estão confirmados nesta fonte; margem não foi estimada.'}};
}

export function apurarDashboard(base,filtro={},hoje,sessao,opcoes={}) {
 const ctx=prepararDashboard(base,filtro,hoje,sessao),p={de:ctx.p.de,ate:ctx.p.ateEfetivo},resumo=resumir(ctx,p),vendas=ctx.vendas.filter(v=>noPeriodo(v,p));
 const rankings=Object.fromEntries(['produtos','clientes','vendedores'].map(k=>[k,agrupar(vendas,k,ctx.p)])),comparacoes=periodosComparacao(ctx.p),series=seriesDashboard(ctx,p);
 const podeFinanceiro=podeConsultarFinanceiro(sessao);
 for(const [dimensao,grupos] of Object.entries(rankings)){const anteriores=comparacoes.anterior?agrupar(ctx.vendas.filter(v=>noPeriodo(v,comparacoes.anterior)),dimensao,ctx.p):[],mapa=new Map(anteriores.map(g=>[g.id,g])),comparavel=comparacoes.anterior&&integridade(ctx,comparacoes.anterior).completo&&resumo.completo&&!(dimensao==='produtos'&&(integridade(ctx,comparacoes.anterior).itensAusentes||integridade(ctx,p).itensAusentes));for(const g of grupos){const anterior=mapa.get(g.id)?.centavos??0;g.comparacaoPeriodo={centavosAnterior:comparavel?anterior:null,delta:comparavel?g.centavos-anterior:null,percentual:comparavel&&anterior>0?(g.centavos-anterior)/anterior*100:null,completo:!!comparavel};}}
 const inteligenciaOut=inteligencia(ctx,vendas,rankings,resumo,hoje),limite=500;
 if(comparacoes.anterior&&resumo.completo&&integridade(ctx,comparacoes.anterior).completo&&!integridade(ctx,comparacoes.anterior).itensAusentes&&!integridade(ctx,p).itensAusentes){
  const atuais=new Map(rankings.produtos.map(g=>[g.id,g])),anteriores=new Map(agrupar(ctx.vendas.filter(v=>noPeriodo(v,comparacoes.anterior)),'produtos',ctx.p).map(g=>[g.id,g]));
  const variacoes=[...new Set([...atuais.keys(),...anteriores.keys()])].filter(id=>id!=='__sem_itens').map(id=>{const a=atuais.get(id),b=anteriores.get(id),atual=a?.centavos||0,anterior=b?.centavos||0;return {id,nome:a?.nome||b.nome,centavos:atual,anteriorCentavos:anterior,delta:atual-anterior,percentual:anterior>0?(atual-anterior)/anterior*100:null};});
  inteligenciaOut.variacaoProdutos={estado:'disponivel',periodo:comparacoes.anterior,altas:variacoes.filter(v=>v.delta>0).sort((a,b)=>b.delta-a.delta).slice(0,20),quedas:variacoes.filter(v=>v.delta<0).sort((a,b)=>a.delta-b.delta).slice(0,20)};
 }else inteligenciaOut.variacaoProdutos={estado:'dados_insuficientes',altas:[],quedas:[]};
 inteligenciaOut.quedas={estado:inteligenciaOut.variacaoProdutos.estado,itens:inteligenciaOut.variacaoProdutos.quedas,periodo:comparacoes.anterior};
 let metas={estado:'filtro_incompativel',mensagem:'Metas mensais por vendedor; selecione um mês completo sem filtros de cliente, produto, categoria ou campanha.'};
 if(!ctx.p.cliente&&!ctx.p.produto&&!ctx.p.categoria&&!ctx.p.campanha){
  const meta=metaDoPeriodo(base.metas,ctx.escopo,base.catalogo,{de:ctx.p.de,ate:ctx.p.ate},base.config||{}),vendasMeta=vendas.filter(v=>meta.idsParticipantes.includes(v.vendedorId));
  // An empty observed subset is not a confirmed zero while coverage is missing.
  const realizado=resumo.completo||vendasMeta.length?somaSegura(vendasMeta.map(v=>v.centavos)):null;
  metas=progressoMeta(meta,realizado,{de:ctx.p.de,ate:ctx.p.ate},hoje,base.config?.calendario,{vendasCompleta:resumo.completo,vinculosCompletos:!vendas.some(v=>!meta.vendedoresConhecidos.some(c=>c.id===v.vendedorId))});
 }
 metas.serieAcumulada=serieMeta(ctx,metas);
 return {versao:2,periodo:ctx.p,criterio:CRITERIO_DASHBOARD,escopo:{gestor:ctx.escopo.gestor,ids:ctx.escopo.ids,tipoEscopo:ctx.escopo.tipoEscopo},catalogo:ctx.catalogo,resumo,
  series,rankings:Object.fromEntries(Object.entries(rankings).map(([k,xs])=>[k,xs.slice(0,limite)])),rankingsCobertura:Object.fromEntries(Object.entries(rankings).map(([k,xs])=>[k,{total:xs.length,exibidos:Math.min(limite,xs.length),completo:xs.length<=limite}])),
  comparacoes:{anterior:comparacao(ctx,comparacoes.anterior,resumo),anoAnterior:comparacao(ctx,comparacoes.anoAnterior,resumo),diasUteis:comparacaoMensalDashboard(ctx,hoje,'diasUteis'),mesCompleto:comparacaoMensalDashboard(ctx,hoje,'mesCompleto')},financeiro:financeiroDashboard(ctx,hoje,podeFinanceiro),inteligencia:inteligenciaOut,
  abc:{a:ctx.p.abcA,b:ctx.p.abcB,criterio:'Classe pela participação acumulada anterior ao item; o item que cruza o limite permanece na classe iniciada.'},
  cobertura:{estado:resumo.estado,completo:resumo.completo,janelas:ctx.janelas,registrosConsultados:ctx.vendas.length,incompletos:ctx.falhas.length,itensAusentes:resumo.itensAusentes,desde:ctx.janelas[0]?.desde||null,ate:ctx.janelas.at(-1)?.ate||null,
   empresa:{estado:resumo.certificadoEmpresa?'origem_preservada':'base_provisoria',verificacaoPorRegistro:resumo.certificadoEmpresa,semEmpresa:ctx.vendasPendentes.filter(v=>noPeriodo(v,p)).length,confirmadas:vendas.filter(v=>v.empresaConfirmada).length,divergenciasExcluidas:ctx.divergentes.length,mensagem:resumo.certificadoEmpresa?'Somente registros com empresa Impresilk explicitamente preservada na origem.':'Registros sem empresa de origem ficam fora dos totais, rankings e gráficos até confirmação.'}},
  metas,
  fontes:{vendas:{fonte:'Mubisys sincronizado em painel_ordens',atualizadoEm:base.atualizadoEm||null,criterio:'Data de cadastro da O.S.'},catalogo:{fonte:'Catálogo comercial sincronizado',atualizadoEm:base.catalogoEm||null},financeiro:{fonte:podeFinanceiro?'Títulos em aberto sincronizados':null,atualizadoEm:podeFinanceiro?base.financeiroEm||null:null}},
  avisos:[...(!resumo.completo?['Consulta parcial: valores observados não comprovam o total do período.']:[]),...(resumo.itensAusentes?['Há vendas sem itens identificados; confira a linha Itens não disponíveis.']:[]),'Quantidades só são somadas na mesma unidade informada na origem.','Devoluções sem vínculo não são abatidas automaticamente.',...(resumo.certificadoEmpresa?[]:['Registros sem empresa de origem foram separados; não compõem os totais e rankings da Impresilk.'])],consultadoEm:opcoes.consultadoEm||new Date().toISOString()};
}

export function detalharDashboard(base,filtro,hoje,sessao,consulta={}) {
 if(consulta.dimensao==='atraso'&&!podeConsultarFinanceiro(sessao))throw erro('Seu acesso não inclui Contas atrasadas.',403);
 const ctx=prepararDashboard(base,filtro,hoje,sessao),dimensao=consulta.dimensao||'',id=identificador(consulta.id),pagina=consulta.pagina??1,tamanho=consulta.tamanho??25;
 if(!['','produto','cliente','vendedor','atraso'].includes(dimensao)||dimensao&&!id||!Number.isInteger(pagina)||pagina<1||!Number.isInteger(tamanho)||tamanho<1||tamanho>50)throw erro('Detalhamento comercial inválido.');
 if(dimensao==='atraso')return detalharAtrasosDashboard(ctx,hoje,id,pagina,tamanho);
 const vendas=ctx.vendas.filter(v=>noPeriodo(v,{de:ctx.p.de,ate:ctx.p.ateEfetivo})&&(!dimensao||dimensao==='cliente'&&v.clienteId===id||dimensao==='vendedor'&&v.vendedorId===id||dimensao==='produto'&&v.produtos.some(p=>p.id===id))).sort((a,b)=>b.data.localeCompare(a.data)||a.id.localeCompare(b.id));
 const paginas=Math.max(1,Math.ceil(vendas.length/tamanho));if(pagina>paginas)throw erro('Página fora do detalhamento.');
 return {criterio:CRITERIO_DASHBOARD,periodo:ctx.p,vendas:vendas.slice((pagina-1)*tamanho,pagina*tamanho).map(v=>({...v,...(dimensao==='produto'?{centavos:somaSegura(v.produtos.filter(p=>p.id===id).map(p=>p.centavos))}:{}),produtos:v.produtos.map(p=>({id:p.id,nome:p.nome,categoria:p.categoria,centavos:p.centavos,quantidades:p.quantidades}))})),paginacao:{pagina,tamanho,total:vendas.length,paginas,temMais:pagina<paginas},cobertura:{completo:integridade(ctx,{de:ctx.p.de,ate:ctx.p.ateEfetivo}).completo}};
}
