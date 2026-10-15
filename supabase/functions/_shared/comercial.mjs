import {contextoDaAcao,validarContato} from './relacionamento-comercial.mjs';
import {contarDiasUteis, fimPorDiasUteis, coberturaComercialContem, revisoesComerciais, ultimoContatoConfirmado, filaComercial, inteligenciaClienteComercial, compararAcoesComerciais, perfilCompraComercialPeriodo, aprovacaoOrcamentosComerciais} from './comercial-calculos.mjs';
// Regra única: usada no servidor, na prévia e nos testes. Sem efeitos colaterais.
export const normal = v => String(v ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ');
export const gestorComercial = s => s?.master === true || (s?.perms || []).includes('*');
export const dinheiro = v => v == null || !['number','string'].includes(typeof v) || typeof v==='string'&&!v.trim() || !Number.isFinite(Number(v)) ? null : Math.round(Number(v)*100);
export const dataISO = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v)) && Number.isFinite(Date.parse(v+'T12:00:00Z')) && new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
export const dia = v => String(v || '').slice(0,10);
const somarDias = (d,n) => {const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);};
const unicos = xs => [...new Map(xs.filter(x=>x?.id).map(x=>[String(x.id),x])).values()];
export function resolverEscopo(sessao, catalogo, config={}, filtro={}) {
 if(!sessao || !(gestorComercial(sessao)||(sessao.perms||[]).includes('orcamentos'))) throw Object.assign(new Error('Você não tem acesso ao Comercial.'),{status:403});
 const vendedores=catalogo?.vendedores || [];
 const gerente=gestorComercial(sessao);
 let id=config.vinculos?.[sessao.sub] || '';
 if(!id && sessao.vend) {
  const porId=vendedores.filter(v=>String(v.id)===String(sessao.vend));
  const porNome=vendedores.filter(v=>normal(v.nome)===normal(sessao.vend));
  const xs=porId.length===1?porId:porNome;
  if(xs.length===1)id=String(xs[0].id);
 }
 if(!gerente && !vendedores.some(v=>String(v.id)===String(id))) throw Object.assign(new Error('Seu vínculo com o vendedor do Mubisys precisa ser conferido pela direção.'),{status:403,codigo:'VINCULO_PENDENTE'});
 if(!gerente && filtro.vendedor && String(filtro.vendedor)!==String(id))throw Object.assign(new Error('Você só pode consultar sua carteira comercial.'),{status:403});
 if(!gerente && filtro.equipe)throw Object.assign(new Error('Filtro de equipe reservado à gestão.'),{status:403});
 let ids=gerente ? (filtro.vendedor ? [String(filtro.vendedor)] : null) : [String(id)];
 if(gerente && filtro.vendedor && !vendedores.some(v=>String(v.id)===String(filtro.vendedor)))throw Object.assign(new Error('Vendedora não encontrada no catálogo.'),{status:400});
 if(filtro.equipe){const eq=(config.equipes||[]).find(e=>e.id===filtro.equipe);if(!eq)throw Object.assign(new Error('Equipe não cadastrada.'),{status:400});ids=ids?ids.filter(i=>eq.vendedores.includes(i)):eq.vendedores;}
 // Nomes ambíguos não autorizam um registro legado; exigem ID na origem.
 const selecionados=vendedores.filter(v=>!ids||ids.includes(String(v.id)));
 const nomes=selecionados.filter(v=>vendedores.filter(x=>normal(x.nome)===normal(v.nome)).length===1).map(v=>normal(v.nome));
 // Um filtro de equipe continua coletivo mesmo que sua interseção tenha um ID.
 const tipoEscopo=!gerente?'individual':filtro.equipe?'equipe':filtro.vendedor?'individual':'consolidado';
 return {gestor:gerente,vendedorId:id || null,ids,nomes,tipoEscopo,vendedores:gerente?vendedores:selecionados};
}
export function pertence(registro,escopo,campo='vendedor') {
 if(escopo.ids===null)return true;
 const id=registro.vendedorErpId ?? registro.responsavelId;
 if(id)return escopo.ids.includes(String(id));
 return escopo.nomes.includes(normal(registro[campo] || registro.vendedorNome || registro.vendedorId));
}
export function validarPeriodo(filtro,hoje) {
 const de=filtro.de || hoje.slice(0,7)+'-01', ate=filtro.ate || hoje;
 if(!dataISO(de)||!dataISO(ate)||de>ate||de<'2020-01-01'||(Date.parse(ate)-Date.parse(de))/864e5>732)throw Object.assign(new Error('Escolha um período válido de até dois anos.'),{status:400});
 return {de,ate};
}
export function anteriorEquivalente({de,ate},hoje,tipo='equivalente',calendario) {
 const mes=de.slice(0,7), inicio=new Date(mes+'-01T12:00:00Z');
 const inicioMes=de.endsWith('-01'), fimMes=new Date(Date.UTC(inicio.getUTCFullYear(),inicio.getUTCMonth()+1,0)).toISOString().slice(0,10);
 if(!inicioMes || (ate!==fimMes && !(mes===hoje.slice(0,7)&&ate>=hoje)))return null;
 if(tipo==='mesCompleto' && mes===hoje.slice(0,7)){
  const atualDe=new Date(Date.UTC(inicio.getUTCFullYear(),inicio.getUTCMonth()-1,1,12)).toISOString().slice(0,10);
  const atualAte=new Date(Date.UTC(inicio.getUTCFullYear(),inicio.getUTCMonth(),0,12)).toISOString().slice(0,10);
  const anterior=anteriorEquivalente({de:atualDe,ate:atualAte},hoje,'equivalente');
  return {...anterior,atualDe,atualAte,parcial:false};
 }
 const desloc=tipo==='anoAnterior'?-12:-1;
 const a=new Date(Date.UTC(inicio.getUTCFullYear(),inicio.getUTCMonth()+desloc,1,12));
 const fim=new Date(Date.UTC(a.getUTCFullYear(),a.getUTCMonth()+1,0,12));
 const b=tipo==='mesCompleto'||mes!==hoje.slice(0,7)?fim:new Date(Date.UTC(a.getUTCFullYear(),a.getUTCMonth(),Math.min(Number(hoje.slice(8)),fim.getUTCDate()),12));
 const comp={atualDe:de,de:a.toISOString().slice(0,10),ate:b.toISOString().slice(0,10),atualAte:tipo==='mesCompleto'?fimMes:(ate>hoje?hoje:ate),parcial:mes===hoje.slice(0,7),criterio:tipo==='anoAnterior'?'Datas equivalentes no ano anterior':'Datas equivalentes no mês anterior'};
 if(tipo!=='diasUteis')return comp;
 const uteis=contarDiasUteis({de,ate:comp.atualAte},calendario);
 if(uteis===null)return {...comp,indisponivel:true,calendarioConfigurado:false,criterio:'Mesmo número de dias úteis',mensagem:'Configure e confira o calendário comercial para comparar dias úteis.'};
 const fimAnterior=fim.toISOString().slice(0,10),diasAnterior=contarDiasUteis({de:comp.de,ate:fimAnterior},calendario);
 if(!uteis||diasAnterior<uteis)return {...comp,indisponivel:true,calendarioConfigurado:true,diasUteisAtual:uteis,diasUteisAnterior:diasAnterior,criterio:'Mesmo número de dias úteis',mensagem:!uteis?'O intervalo atual não contém dias úteis configurados.':'O mês anterior tem menos dias úteis que o intervalo atual; escolha um intervalo menor.'};
 return {...comp,ate:fimPorDiasUteis({de:comp.de,ate:fimAnterior},uteis,calendario),calendarioConfigurado:true,diasUteisAtual:uteis,diasUteisAnterior:uteis,criterio:'Mesmo número de dias úteis, conforme calendário configurado'};
}
export function progressoMeta(meta,valor,periodo,hoje,calendario,apuracao={}) {
 const detalhe={participantes:meta?.participantes||[],faltantes:meta?.faltantes||[],excluidos:meta?.excluidos||[],idsParticipantes:meta?.idsParticipantes||[],idsFaltantes:meta?.idsFaltantes||[],idsExcluidos:meta?.idsExcluidos||[],idsAConferir:meta?.idsAConferir||[],registros:meta?.registros||[],origem:meta?.origem||null,
  realizado:apuracao.realizado??valor,vendas:apuracao.vendas||[],idsVendas:(apuracao.vendas||[]).map(o=>String(o.id)),idsVendasAConferir:apuracao.idsVendasAConferir||[],vendasExcluidas:apuracao.vendasExcluidas||[],idsVendasExcluidas:(apuracao.vendasExcluidas||[]).map(o=>String(o.id)),criterio:'O.S. normal, valor líquido, data de cadastro, dos mesmos participantes da meta'};
 const cobertura={metasCompleta:!!meta&&!meta.indisponivel&&dinheiro(meta.valor)!==null&&meta.criterio==='cadastro_liquido_os_normal',vendasCompleta:apuracao.vendasCompleta!==false,vinculosCompletos:apuracao.vinculosCompletos!==false&&!(meta?.idsAConferir||[]).length,completa:false,estado:'parcial'};
 cobertura.completa=!!meta&&cobertura.metasCompleta&&cobertura.vendasCompleta&&cobertura.vinculosCompletos;
 cobertura.estado=cobertura.completa?'completa':meta?.estadoMeta==='fonte_indisponivel'?'indisponivel':'parcial';
 const saida={...detalhe,cobertura,valor:dinheiro(meta?.valor),percentual:null,falta:null,diasUteis:null,porDia:null};
 if(meta==null)return {...saida,estado:'ausente',mensagem:'Meta ainda não cadastrada'};
 if(meta.indisponivel)return {...saida,estado:meta.estadoMeta||'indisponivel',mensagem:meta.mensagem};
 if(meta.criterio!=='cadastro_liquido_os_normal')return {...saida,estado:'incompativel',mensagem:'Critério da meta precisa ser conferido'};
 const cent=dinheiro(meta.valor);if(cent===null || cent<0)return {...saida,estado:'indisponivel',mensagem:'Meta indisponível'};
 if(!cobertura.completa)return {...saida,estado:!cobertura.vinculosCompletos?'vinculo_pendente':'parcial',mensagem:!cobertura.vinculosCompletos?'Há vendas ou participantes sem vínculo confirmado; percentual indisponível.':'Realizado parcial; percentual e referência diária aguardam cobertura completa.'};
 if(cent===0)return {...saida,estado:'zero',valor:0,falta:0,mensagem:'Meta cadastrada em R$ 0,00'};
 const falta=Math.max(0,cent-saida.realizado),encerrado=hoje>periodo.ate;
 const uteis=contarDiasUteis({de:hoje>periodo.de?hoje:periodo.de,ate:periodo.ate},calendario);
 return {...saida,estado:falta===0?'atingida':encerrado?'encerrada':'andamento',valor:cent,percentual:saida.realizado/cent*100,falta,diasUteis:uteis,porDia:!encerrado&&uteis>0?Math.ceil(falta/uteis):null,mensagem:falta===0?'Meta atingida':encerrado?'Período encerrado':'Em andamento'};
}
export function validarMeta(b,catalogo,autor,agora) {
 const vendedorId=String(b?.vendedorId||''),mes=String(b?.mes||''),centavos=dinheiro(b?.valor);
 if(!catalogo.vendedores?.some(v=>String(v.id)===vendedorId)||!dataISO(mes+'-01')||centavos===null||centavos<0||centavos>1e12)throw Object.assign(new Error('Informe a vendedora, o mês e uma meta válida em reais.'),{status:400});
 return {id:`${vendedorId}_${mes}`,vendedorId,mes,valor:centavos/100,origem:'painel',criterio:'cadastro_liquido_os_normal',atualizadoPor:autor,atualizadoEm:agora};
}
export function metaDoPeriodo(metas,escopo,catalogo,periodo,config={}) {
 const mes=periodo.de.slice(0,7),fim=new Date(Date.UTC(Number(mes.slice(0,4)),Number(mes.slice(5,7)),0)).toISOString().slice(0,10);
 const vendedores=unicos(catalogo?.vendedores||[]),dentro=vendedores.filter(v=>escopo.ids===null||escopo.ids?.includes(String(v.id)));
 const explicitos=Array.isArray(config.participantesMetas)?config.participantesMetas.map(String):null,excluir=(config.excluidosMetas||[]).map(String);
 const configuradosNoEscopo=[...(explicitos||[]),...excluir].filter(id=>escopo.ids===null||escopo.ids?.includes(id));
 const idsAConferir=[...new Set([...configuradosNoEscopo,...(escopo.ids||[])].filter(id=>!vendedores.some(v=>String(v.id)===id)))].sort();
 const fonteDisponivel=Array.isArray(metas),participantes=[],excluidos=[],faltantes=[],registros=[];
 for(const v of dentro){
  const id=String(v.id),nome=String(v.nome||''),status=String(v.status||'');
  const motivo=excluir.includes(id)?'Exclusão explícita da direção':explicitos&&!explicitos.includes(id)?'Fora da participação configurada':!explicitos&&escopo.tipoEscopo!=='individual'&&normal(status)==='inativo'?'Vendedor inativo':'';
  if(motivo){excluidos.push({id,nome,status,motivo});continue;}
  const encontrados=fonteDisponivel?metas.filter(m=>String(m.vendedorId)===id&&m.mes===mes):[];
  const m=encontrados.length===1?encontrados[0]:null,cent=dinheiro(m?.valor);
  const valida=!!m&&cent!==null&&cent>=0&&(!m.criterio||m.criterio==='cadastro_liquido_os_normal');
  participantes.push({id,nome,status,metaId:m?.id||null,metaValor:valida?cent/100:null,origem:m?.origem||null,nomeUnico:vendedores.filter(x=>normal(x.nome)===normal(nome)).length===1});
  if(valida)registros.push(m);
  else faltantes.push({id,nome,motivo:!fonteDisponivel?'Fonte de metas indisponível':encontrados.length>1?'Mais de uma meta para o mesmo ID e mês':!m?'Meta não cadastrada':cent===null?'Valor da meta ausente':cent<0?'Meta inválida':'Critério da meta incompatível'});
 }
 const detalhe={mes,participantes,faltantes,excluidos,idsParticipantes:participantes.map(v=>v.id),idsFaltantes:faltantes.map(v=>v.id),idsExcluidos:excluidos.map(v=>v.id),idsAConferir,registros,origem:'painel',criterio:'cadastro_liquido_os_normal',
  vendedoresConhecidos:dentro.map(v=>({id:String(v.id),nome:String(v.nome||''),nomeUnico:vendedores.filter(x=>normal(x.nome)===normal(v.nome)).length===1})),valor:registros.length?registros.reduce((s,m)=>s+dinheiro(m.valor),0)/100:null};
 if(periodo.de!==mes+'-01'||periodo.ate!==fim)return {...detalhe,indisponivel:true,estadoMeta:'periodo_incompativel',mensagem:'Selecione um mês completo para acompanhar a meta mensal'};
 if(!fonteDisponivel)return {...detalhe,indisponivel:true,estadoMeta:'fonte_indisponivel',mensagem:'A fonte das metas está indisponível; ausência de leitura não significa meta zero.'};
 if(idsAConferir.length)return {...detalhe,indisponivel:true,estadoMeta:'vinculo_pendente',mensagem:'Há IDs de participantes a conferir no catálogo oficial.'};
 if(!participantes.length)return {...detalhe,indisponivel:true,estadoMeta:'sem_participantes',mensagem:'Nenhum participante elegível no escopo da meta.'};
 if(faltantes.length)return {...detalhe,indisponivel:true,estadoMeta:registros.length?'parcial':'ausente',mensagem:participantes.length===1?'Meta ainda não cadastrada':`Meta consolidada incompleta: ${faltantes.length} vendedora(s) sem meta válida no mês`};
 return {...detalhe,indisponivel:false};
}
export function agruparRevisoes(xs) {
 return revisoesComerciais(xs);
}
export function apurarComercial(base,filtro,hoje) {
 const periodo=validarPeriodo(filtro,hoje), fimReal=periodo.ate<hoje?periodo.ate:hoje;
 const noPeriodo=(d,p=periodo)=>dataISO(dia(d))&&dia(d)>=p.de&&dia(d)<=p.ate;
 const cobertura=base.cobertura || {};
 const coberturaContem=(c,p)=>coberturaComercialContem(c,p,hoje);
 const coberto=p=>coberturaContem(cobertura,p);
 const ordens=unicos(base.ordens||[]).map(o=>({...o,centavos:o.valorConfirmado===false?null:dinheiro(o.valor)}));
 const elegivel=o=>!o.cancelada && normal(o.tipo)==='normal' && o.centavos!==null;
 const vendas=ordens.filter(o=>noPeriodo(o.data,{de:periodo.de,ate:fimReal})&&elegivel(o));
 const incompletas=ordens.filter(o=>!o.cancelada&&noPeriodo(o.data,{de:periodo.de,ate:fimReal}) && (!o.tipo||normal(o.tipo)==='normal'&&o.centavos===null));
 const valor=vendas.reduce((s,o)=>s+o.centavos,0), completo=coberto(periodo)&&!incompletas.length;
 const todasAcoes=unicos(base.acoes||[]);
 const propostasDisponiveis=agruparRevisoes(base.orcamentos||[]).map(o=>{
  const aa=todasAcoes.filter(a=>o.orcamentoIds.includes(String(a.orcamentoId))).sort((a,b)=>String(b.atualizadoEm||'').localeCompare(String(a.atualizadoEm||''))||String(a.id).localeCompare(String(b.id)));
  return {...o,valor:o.valorConfirmado===false?null:o.valor,ultimaAcao:aa[0]||null,proximaAcao:aa.filter(a=>a.status!=='concluida'&&dataISO(a.data)).sort(compararAcoesComerciais)[0]||null,acoesVinculadas:aa,ultimoContato:ultimoContatoConfirmado(aa,o.acompanhamento)};
 });
 const propostas=propostasDisponiveis.filter(o=>noPeriodo(o.dataCadastro||o.dataEnvio));
 // A rotina permanece aberta até a conclusão, mesmo após a virada do mês.
 const abertasOperacionais=propostasDisponiveis.filter(o=>o.situacao==='aberto'&&(!dataISO(dia(o.dataCadastro||o.dataEnvio))||dia(o.dataCadastro||o.dataEnvio)<=hoje));
 const semProximaAcao=abertasOperacionais.filter(o=>!o.proximaAcao&&!dataISO(o.acompanhamento?.proximoToque));
 const valorAbertoOperacional=abertasOperacionais.some(o=>dinheiro(o.valor)===null)?null:abertasOperacionais.reduce((s,o)=>s+dinheiro(o.valor),0);
 const coberturaOrc=base.coberturaOrcamentos||{};
 const orcamentosCompletos=coberturaContem(coberturaOrc,periodo);
 // Sem data comprovada, a proposta pode pertencer ao período escolhido.
 // Mantê-la separada da base temporal e impedir um percentual aparentemente completo.
 const propostasSemData=propostasDisponiveis.filter(o=>!dataISO(dia(o.dataCadastro||o.dataEnvio)));
 const aprovacaoOrcamentos=aprovacaoOrcamentosComerciais(propostas,orcamentosCompletos,propostasSemData);
 const abertas=propostas.filter(o=>o.situacao==='aberto');
 const acoes=todasAcoes.filter(a=>noPeriodo(a.data));
 const hojeA=todasAcoes.filter(a=>a.status!=='concluida'&&a.data===hoje), atrasadas=todasAcoes.filter(a=>a.status!=='concluida'&&dataISO(a.data)&&a.data<hoje).sort((a,b)=>a.data.localeCompare(b.data)||String(a.id).localeCompare(String(b.id)));
 const porCliente=new Map(),comprasPorCliente=new Map();
 const clientesHistoricoIncompleto=new Set(ordens.filter(o=>!o.cancelada&&(!o.tipo||normal(o.tipo)==='normal'&&(o.centavos===null||!dataISO(dia(o.data))))).map(o=>String(o.clienteId)));
 for(const c of base.clientes||[])porCliente.set(String(c.id),{...c,vendas:[],orcamentos:[],acoes:[],centavos:0,ultimaCompra:c.ultimaCompraHistorica||null,primeiraCompra:c.primeiraCompraHistorica||null,produtos:[]});
 for(const o of ordens.filter(o=>elegivel(o)&&dataISO(dia(o.data))&&dia(o.data)<=hoje)){
  const c=porCliente.get(String(o.clienteId));if(!c)continue;
  const historicas=comprasPorCliente.get(String(c.id))||[];historicas.push(o);comprasPorCliente.set(String(c.id),historicas);
  const data=dia(o.data);if(!c.ultimaCompra||data>c.ultimaCompra)c.ultimaCompra=data;if(!c.primeiraCompra||data<c.primeiraCompra)c.primeiraCompra=data;
  if(noPeriodo(data)){c.vendas.push(o);c.centavos+=o.centavos;}
 }
 for(const o of propostasDisponiveis){const c=porCliente.get(String(o.clienteId));if(c)c.orcamentos.push(o);}
 for(const a of todasAcoes){const c=porCliente.get(String(a.clienteId));if(c)c.acoes.push(a);}
 for(const c of porCliente.values()){
  c.produtos=[...new Set(c.vendas.flatMap(o=>(o.itens||[]).map(i=>i.produto)))];
  c.acoes.sort((a,b)=>String(b.atualizadoEm).localeCompare(String(a.atualizadoEm)));
  c.proximoContato=c.acoes.filter(a=>a.status!=='concluida'&&dataISO(a.data)).sort((a,b)=>a.data.localeCompare(b.data)||String(a.id).localeCompare(String(b.id)))[0]?.data||null;
  c.ultimoContato=ultimoContatoConfirmado(c.acoes);
  const historicas=comprasPorCliente.get(String(c.id))||[];
  // A cobertura da fonte não prova que o lote enviado contém compras posteriores
  // ao fim escolhido. Não estimar frequência sobre uma consulta histórica truncada.
  const coberturaCompras={...cobertura,ate:cobertura.ate&&cobertura.ate<fimReal?cobertura.ate:fimReal,
   janelas:Array.isArray(cobertura.janelas)?cobertura.janelas.map(j=>({...j,ate:j.ate<fimReal?j.ate:fimReal})):undefined};
  if(clientesHistoricoIncompleto.has(String(c.id)))coberturaCompras.indisponivel=true;
  Object.assign(c,inteligenciaClienteComercial(c,historicas,hoje,base.config,coberturaCompras));
  c.perfilCompraPeriodo=perfilCompraComercialPeriodo(c,historicas,periodo,hoje,base.config,coberturaCompras,base.coberturaHistorica);
  c.perfil=c.ultimaCompra && c.ultimaCompra<somarDias(hoje,-Number(base.config?.diasReativacao??90))?'Sem compra recente':c.primeiraCompra&&c.primeiraCompra<periodo.de&&c.vendas.length?'Recorrente':c.vendas.length?'Primeira compra no histórico disponível':c.temCompraHistorica?'Cliente do histórico':'Sem compra identificada';
 }
 const produtos=new Map();
 for(const o of vendas){
  const itens=(o.itens||[]).filter(i=>dinheiro(i.valorTotal)!==null),soma=itens.reduce((s,i)=>s+dinheiro(i.valorTotal),0);let distribuido=0;
  if(!itens.length||soma<=0){const k='__sem_itens';const p=produtos.get(k)||{id:k,nome:'Itens não disponíveis',categoria:'Não informada',centavos:0,quantidades:{},os:[]};p.centavos+=o.centavos;p.os.push(o.id);produtos.set(k,p);continue;}
  itens.forEach((i,idx)=>{
   const cent=idx===itens.length-1?o.centavos-distribuido:Math.round(o.centavos*dinheiro(i.valorTotal)/soma);distribuido+=cent;
   const k=String(i.produtoId||i.produto)+'|'+String(i.categoria||'Não informada'),p=produtos.get(k)||{id:k,nome:i.produto,categoria:i.categoria||'Não informada',centavos:0,quantidades:{},os:[]};
   p.centavos+=cent;p.os.push(o.id);const u=i.unidade||'Unidade não informada';if(i.quantidade!=null&&Number.isFinite(Number(i.quantidade)))p.quantidades[u]=(p.quantidades[u]||0)+Number(i.quantidade);produtos.set(k,p);
  });
 }
 const categorias=new Map();for(const p of produtos.values()){const c=categorias.get(p.categoria)||{id:p.categoria,nome:p.categoria,centavos:0,quantidades:{},os:[]};c.centavos+=p.centavos;c.os=[...new Set([...c.os,...p.os])];for(const [u,q] of Object.entries(p.quantidades))c.quantidades[u]=(c.quantidades[u]||0)+q;categorias.set(c.id,c);}
 const comp=anteriorEquivalente(periodo,hoje,filtro.comparacao,base.config?.calendario);let comparativo=null;
 if(comp?.indisponivel){comparativo={...comp,valorAtual:null,valorAnterior:null,registros:[],registrosAtuais:[],delta:null,percentual:null,completo:false};}
 else if(comp){
  const vv=ordens.filter(o=>noPeriodo(o.data,comp)&&elegivel(o)),anterior=vv.reduce((s,o)=>s+o.centavos,0),ok=coberto(comp)&&!ordens.some(o=>!o.cancelada&&noPeriodo(o.data,comp)&&(!o.tipo||normal(o.tipo)==='normal'&&o.centavos===null));
  const atual={de:comp.atualDe,ate:comp.atualAte},atuais=ordens.filter(o=>noPeriodo(o.data,atual)&&elegivel(o));
  const totalAtual=atuais.reduce((s,o)=>s+o.centavos,0),atualOk=coberto(atual)&&!ordens.some(o=>!o.cancelada&&noPeriodo(o.data,atual)&&(!o.tipo||normal(o.tipo)==='normal'&&o.centavos===null));
  comparativo={...comp,valorAtual:atualOk?totalAtual:null,valorAnterior:ok?anterior:null,registros:vv,registrosAtuais:atuais,delta:ok&&atualOk?totalAtual-anterior:null,percentual:ok&&atualOk&&anterior!==0?(totalAtual-anterior)/anterior*100:null,completo:ok&&atualOk};
 }
 const meses=new Map();for(const o of vendas){const m=dia(o.data).slice(0,7);if(m<periodo.de.slice(0,7)||m>periodo.ate.slice(0,7))continue;const a=meses.get(m)||{mes:m,centavos:0,pedidos:0};a.centavos+=o.centavos;a.pedidos++;meses.set(m,a);}
 const acumulado=[];let soma=0;for(let d=periodo.de;d<=fimReal;d=somarDias(d,1)){soma+=vendas.filter(v=>dia(v.data)===d).reduce((s,o)=>s+o.centavos,0);acumulado.push({data:d,centavos:soma});}
 const prioridades=filaComercial(abertasOperacionais,todasAcoes,hoje,base.config);
 const participantes=base.meta?.idsParticipantes;
 const vendedorDaVenda=o=>{
  const conhecidos=base.meta?.vendedoresConhecidos||base.meta?.participantes||[];
  const explicito=o.vendedorErpId??o.responsavelId;
  if(explicito!=null&&String(explicito))return conhecidos.some(v=>v.id===String(explicito))?String(explicito):null;
  if(o.vendedorId&&conhecidos.some(v=>v.id===String(o.vendedorId)))return String(o.vendedorId);
  const nome=normal(o.vendedor||o.vendedorNome||o.vendedorId);
  const xs=conhecidos.filter(v=>v.nomeUnico!==false&&normal(v.nome)===nome);
  return nome&&xs.length===1?xs[0].id:null;
 };
 const vendasMeta=Array.isArray(participantes)?vendas.filter(o=>participantes.includes(vendedorDaVenda(o))):vendas;
 const naoVinculadas=Array.isArray(participantes)?vendas.filter(o=>!vendedorDaVenda(o)):[];
 const vendasExcluidas=Array.isArray(participantes)?vendas.filter(o=>vendedorDaVenda(o)&&!participantes.includes(vendedorDaVenda(o))):[];
 const incompletasMeta=Array.isArray(participantes)?incompletas.filter(o=>!vendedorDaVenda(o)||participantes.includes(vendedorDaVenda(o))):incompletas;
 const realizado=vendasMeta.reduce((s,o)=>s+o.centavos,0);
 const meta=progressoMeta(base.meta,realizado,periodo,hoje,base.config?.calendario,{realizado,vendas:vendasMeta,vendasExcluidas,idsVendasAConferir:naoVinculadas.map(o=>String(o.id)),vendasCompleta:coberto(periodo)&&!incompletasMeta.length,vinculosCompletos:!naoVinculadas.length&&!incompletasMeta.some(o=>!vendedorDaVenda(o))});
 return {periodo,hoje,criterio:'O.S. normal, valor líquido, data de cadastro',completo,incompletas:incompletas.length,vendas,valor,pedidos:vendas.length,ticket:vendas.length?Math.round(valor/vendas.length):null,propostas,propostasDisponiveis,aprovacaoOrcamentos,abertasOperacionais,semProximaAcao,valorAbertoOperacional,abertas,orcamentosCompletos,valorAberto:!orcamentosCompletos||abertas.some(o=>dinheiro(o.valor)===null)?null:abertas.reduce((s,o)=>s+dinheiro(o.valor),0),acoes,hojeA,atrasadas,prioridades,clientes:[...porCliente.values()],sugestoesReativacao:[...porCliente.values()].filter(c=>c.reativacao.sugerida),categorias:[...categorias.values()].sort((a,b)=>b.centavos-a.centavos),produtos:[...produtos.values()].sort((a,b)=>b.centavos-a.centavos),meses:[...meses.values()].sort((a,b)=>a.mes.localeCompare(b.mes)),acumulado,comparativo,meta};
}
export function validarAcao(b,escopo,base,autor,agora) {
 if(!b || !/^[\w-]{1,80}$/.test(b.id||''))throw Object.assign(new Error('Identificador inválido.'),{status:400});
 // Campos omitidos numa edição preservam o registro canônico carregado pelo servidor.
 b={...(base.acaoAnterior||{}),...b};
 const vendedorId=String(b.vendedorId||escopo.vendedorId||'');
 if(!escopo.gestor&&!escopo.ids.includes(vendedorId))throw Object.assign(new Error('Responsável fora do seu acesso.'),{status:403});
 if(!(base.vendedores||[]).some(v=>String(v.id)===vendedorId))throw Object.assign(new Error('Escolha uma vendedora do Mubisys.'),{status:400});
 const orcamentoId=String(b.orcamentoId||'');
 const {c,o,...contexto}=contextoDaAcao({...b,vendedorId},base);
 if(!['pendente','concluida'].includes(b.status||'pendente'))throw Object.assign(new Error('Situação inválida.'),{status:400});
 const contato=validarContato(b,base.acaoAnterior||{},autor,agora),data=contato.data||b.data;
 const descricao=b.descricao||contato.esperaJustificada&&`Revisar espera: ${contato.justificativaEspera}`.slice(0,500);
 if(!dataISO(data)||typeof descricao!=='string'||!descricao.trim()||descricao.length>500)throw Object.assign(new Error('Informe a próxima ação e uma data válida.'),{status:400});
 if(b.decisao && !dataISO(b.decisao))throw Object.assign(new Error('Previsão de decisão inválida.'),{status:400});
 return {...contexto,id:b.id,vendedorId,orcamentoId,cliente:c.nome,valor:o?.valor??null,descricao:descricao.trim(),data,status:b.status||'pendente',nota:String(b.nota||'').slice(0,3000),pendencias:String(b.pendencias||'').slice(0,1000),decisao:b.decisao||null,atualizadoPor:autor,atualizadoEm:agora,...contato};
}
