import {dataISO,dia,dinheiro,normal,pertence} from './comercial.mjs';

const idOrigem=v=>v==null?'':String(v).trim();
const falha=()=>Object.assign(new Error('Não foi possível consultar o histórico comercial completo.'),{status:503});

export function janelasHistoricas(status,recurso='ordens') {
 const janelas=(status?.janelas?.[recurso]||[]).filter(j=>dataISO(j.desde)&&dataISO(j.ate)&&j.desde<=j.ate&&j.concluidaEm).map(j=>({desde:j.desde,ate:j.ate})).sort((a,b)=>a.desde.localeCompare(b.desde));
 const unidas=[];
 for(const janela of janelas){
  const ultima=unidas.at(-1),diaSeguinte=ultima?new Date(Date.parse(ultima.ate+'T12:00:00Z')+864e5).toISOString().slice(0,10):null;
  if(ultima&&janela.desde<=diaSeguinte){if(janela.ate>ultima.ate)ultima.ate=janela.ate;}
  else unidas.push({...janela});
 }
 return unidas;
}

// Projeção compacta: o histórico da carteira não precisa de itens nem de valores
// brutos. Paginação estável e concorrência limitada evitam o corte padrão de 1.000.
export async function lerHistoricoComercial(sb) {
 const tamanho=1000,limite=100000,resultado=[];
 const pagina=async inicio=>{
  const {data,error}=await sb.from('painel_ordens').select('id,cliente,data,valor,vendedor,comercial,atualizado_em').order('id').range(inicio,inicio+tamanho-1);
  if(error||!Array.isArray(data))throw falha();
  return data;
 };
 const primeira=await pagina(0);resultado.push(...primeira);if(primeira.length<tamanho)return resultado;
 for(let inicio=tamanho;inicio<limite;inicio+=tamanho*4){
  const inicios=Array.from({length:Math.min(4,(limite-inicio)/tamanho)},(_,i)=>inicio+i*tamanho);
  const paginas=await Promise.all(inicios.map(pagina));
  for(const registros of paginas){resultado.push(...registros);if(registros.length<tamanho)return resultado;}
 }
 throw Object.assign(new Error('O histórico comercial ultrapassou o limite de leitura. A consulta não foi apresentada como completa.'),{status:503});
}

export function mesclarOrdensComerciais(historico,recentes) {
 const normalizar=o=>({...o,...(o.comercial||{})});
 const mapa=new Map(historico.filter(o=>idOrigem(o.id)).map(o=>[idOrigem(o.id),normalizar(o)]));
 for(const o of recentes||[]){
  const id=idOrigem(o.id);if(!id)continue;
  const anterior=mapa.get(id),recente=normalizar(o),emHistorico=Date.parse(anterior?.atualizado_em),emRecente=Date.parse(o.atualizado_em);
  const temMetadados=anterior?.comercial&&(anterior.comercial.tipo||anterior.comercial.clienteId||anterior.comercial.cancelada===true);
  const historicoMaisNovo=temMetadados&&Number.isFinite(emHistorico)&&(!Number.isFinite(emRecente)||emHistorico>emRecente);
  // A carga comercial pode confirmar cancelamento ou alterar o vendedor após
  // o último cache. O carimbo global da carga não prova consulta desta O.S.:
  // o incremental republica também registros antigos. Só um carimbo próprio
  // mais recente pode substituir metadados já confirmados na tabela.
  if(historicoMaisNovo)mapa.set(id,{...recente,...anterior,vendedorErpId:anterior.vendedorErpId??null,vendedorNome:anterior.vendedorNome??null,vendedorId:anterior.vendedorId??null});
  else mapa.set(id,{...anterior,...recente});
 }
 return [...mapa.values()];
}

export function apurarCarteiraHistorica({ordens,clientes,orcamentos,escopo,catalogo,fontes,hoje}) {
 const cadastros=new Map(clientes.filter(c=>idOrigem(c.id)).map(c=>[idOrigem(c.id),c]));
 const compras=new Map(),propostas=new Map(),carteira=new Set();
 for(const c of cadastros.values())if(pertence(c,escopo,'responsavel'))carteira.add(idOrigem(c.id));
 for(const o of orcamentos){const id=idOrigem(o.clienteId);if(id)propostas.set(id,o);}
 const vendedores=catalogo.vendedores||[];
 const identificaveis={ids:vendedores.map(v=>String(v.id)),nomes:vendedores.filter(v=>vendedores.filter(x=>normal(x.nome)===normal(v.nome)).length===1).map(v=>normal(v.nome))};
 const cobertura={desde:null,ate:null,completo:false,ordensElegiveis:0,ordensIncompletas:0,semTipo:0,semCliente:0,semValor:0,semData:0,clientesSemCadastro:0,identificacaoPendente:false,atualizadoEm:null,estado:'a_atualizar',fonte:'legado',cargaEm:null,janelas:[]};
 for(const o of ordens){
  const data=dia(o.data),tipo=normal(o.tipo);
  if(dataISO(data)&&data>hoje)continue;
  if(o.cancelada||(tipo&&tipo!=='normal'))continue;
  const identificada=pertence(o,identificaveis);
  if(!identificada)cobertura.identificacaoPendente=true;
  if(!pertence(o,escopo))continue;
  const id=idOrigem(o.clienteId),centavos=o.valorConfirmado===false?null:dinheiro(o.valor);
  const semTipo=!tipo,semCliente=!id,semValor=centavos===null,semData=!dataISO(data);
  if(semTipo||semCliente||semValor||semData||(!identificada&&escopo.ids!==null)){
   cobertura.ordensIncompletas++;cobertura.semTipo+=Number(semTipo);cobertura.semCliente+=Number(semCliente);cobertura.semValor+=Number(semValor);cobertura.semData+=Number(semData);continue;
  }
  const c=compras.get(id)||{nome:String(o.cliente||'').trim(),primeiraCompraHistorica:data,ultimaCompraHistorica:data,valorHistorico:0,pedidosHistoricos:0};
  if(data<c.primeiraCompraHistorica)c.primeiraCompraHistorica=data;
  if(data>c.ultimaCompraHistorica){c.ultimaCompraHistorica=data;if(o.cliente)c.nome=String(o.cliente).trim();}
  c.valorHistorico+=centavos;c.pedidosHistoricos++;compras.set(id,c);cobertura.ordensElegiveis++;
 }
 const ids=new Set([...carteira,...compras.keys(),...propostas.keys()]);
 const saida=[...ids].map(id=>{
  const cadastro=cadastros.get(id),compra=compras.get(id),proposta=propostas.get(id);
  if(!cadastro)cobertura.clientesSemCadastro++;
  return {...(cadastro||{id,nome:compra?.nome||String(proposta?.cliente||'').trim()||`Cliente ${id}`}),naCarteira:carteira.has(id),cadastroCompleto:!!cadastro,
   origemCarteira:[...(carteira.has(id)?['carteira_atual']:[]),...(compra?['compra_historica']:[]),...(proposta?['proposta']:[])],temCompraHistorica:!!compra,
   primeiraCompraHistorica:compra?.primeiraCompraHistorica||null,ultimaCompraHistorica:compra?.ultimaCompraHistorica||null,valorHistorico:compra?.valorHistorico??0,pedidosHistoricos:compra?.pedidosHistoricos??0};
 });
 const status=fontes.historico_status?.valor||{},plena=fontes.status?.valor?.ultimaCompleta,recente=fontes.ordens?.atualizado_em?.slice(0,10);
 cobertura.desde=status.ok===true&&dataISO(status.desde)?status.desde:plena?'2025-01-01':null;
 cobertura.ate=plena&&dataISO(recente)?recente:status.ok===true&&dataISO(status.ate)?status.ate:null;
 cobertura.atualizadoEm=[fontes.ordens?.atualizado_em,...ordens.filter(o=>pertence(o,escopo)).map(o=>o.atualizado_em)].filter(Boolean).sort().at(-1)||null;
 // Cobertura bruta não prova que tipo/cliente foram identificados. Só janelas
 // da carga comercial concluída comprovam a extensão do histórico enriquecido.
 const carga=fontes.comercial_carga_status?.valor,janelas=janelasHistoricas(carga);
 if(carga){
  cobertura.fonte='comercial_carga_status';cobertura.cargaEm=carga.atualizacaoEm||null;cobertura.janelas=janelas;
  cobertura.desde=janelas[0]?.desde||null;cobertura.ate=janelas[0]?.ate||null;
  const desdeEsperado=dataISO(status.desde)?status.desde:'2020-01-01';
  cobertura.completo=!!cobertura.desde&&!!cobertura.ate&&cobertura.desde<=desdeEsperado&&cobertura.ate>=hoje&&!cobertura.ordensIncompletas&&!cobertura.identificacaoPendente;
  cobertura.estado=carga.tentativa?.estado==='executando'?'atualizando':carga.tentativa?.estado==='falhou'?'falhou':cobertura.completo?'completo':janelas.length?'parcial':'a_atualizar';
 }
 return {clientes:saida,coberturaHistorica:cobertura};
}
