// Regra única: usada no servidor, na prévia e nos testes. Sem efeitos colaterais.
export const normal = v => String(v ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ');
export const gestorComercial = s => s?.master === true || (s?.perms || []).includes('*');
export const dinheiro = v => v == null || v === '' || !Number.isFinite(Number(v)) ? null : Math.round(Number(v)*100);
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
 return {gestor:gerente,vendedorId:id || null,ids,nomes,vendedores:gerente?vendedores:selecionados};
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
export function anteriorEquivalente({de,ate},hoje,tipo='equivalente') {
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
 return {atualDe:de,de:a.toISOString().slice(0,10),ate:b.toISOString().slice(0,10),atualAte:tipo==='mesCompleto'?fimMes:(ate>hoje?hoje:ate),parcial:mes===hoje.slice(0,7)};
}
export function progressoMeta(meta,valor,periodo,hoje,calendario) {
 if(meta==null)return {estado:'indisponivel',mensagem:'Meta ainda não cadastrada'};
 if(meta.indisponivel)return {estado:'indisponivel',mensagem:meta.mensagem};
 if(meta.criterio!=='cadastro_liquido_os_normal')return {estado:'incompativel',mensagem:'Critério da meta precisa ser conferido'};
 const cent=dinheiro(meta.valor);if(cent===null || cent<0)return {estado:'indisponivel',mensagem:'Meta indisponível'};
 if(cent===0)return {estado:'zero',valor:0,percentual:null,falta:0,porDia:null,mensagem:'Meta cadastrada em R$ 0,00'};
 const falta=Math.max(0,cent-valor),encerrado=hoje>periodo.ate;
 let uteis=null;
 if(calendario?.configurado===true && Array.isArray(calendario.diasSemana)){
  uteis=0;for(let d=hoje>periodo.de?hoje:periodo.de;d<=periodo.ate;d=somarDias(d,1)) {
   const excecao=calendario.excecoes?.[d];
   if(excecao===true || (excecao!==false && !calendario.feriados?.includes(d) && calendario.diasSemana.includes(new Date(d+'T12:00:00Z').getUTCDay())))uteis++;
  }
 }
 return {estado:falta===0?'atingida':encerrado?'encerrada':'andamento',valor:cent,percentual:valor/cent*100,falta,diasUteis:uteis,porDia:!encerrado&&uteis>0?Math.ceil(falta/uteis):null,mensagem:falta===0?'Meta atingida':encerrado?'Período encerrado':'Em andamento'};
}
export function validarMeta(b,catalogo,autor,agora) {
 const vendedorId=String(b?.vendedorId||''),mes=String(b?.mes||''),centavos=dinheiro(b?.valor);
 if(!catalogo.vendedores?.some(v=>String(v.id)===vendedorId)||!dataISO(mes+'-01')||centavos===null||centavos<0||centavos>1e12)throw Object.assign(new Error('Informe a vendedora, o mês e uma meta válida em reais.'),{status:400});
 return {id:`${vendedorId}_${mes}`,vendedorId,mes,valor:centavos/100,origem:'painel',criterio:'cadastro_liquido_os_normal',atualizadoPor:autor,atualizadoEm:agora};
}
export function metaDoPeriodo(metas,escopo,catalogo,periodo) {
 const mes=periodo.de.slice(0,7),fim=new Date(Date.UTC(Number(mes.slice(0,4)),Number(mes.slice(5,7)),0)).toISOString().slice(0,10);
 if(periodo.de!==mes+'-01'||periodo.ate!==fim)return {indisponivel:true,mensagem:'Selecione um mês completo para acompanhar a meta mensal'};
 const ids=escopo.ids??catalogo.vendedores.filter(v=>normal(v.status)!=='inativo').map(v=>String(v.id));
 const registros=ids.map(id=>metas.find(m=>m.vendedorId===id&&m.mes===mes));
 const faltantes=registros.filter(m=>!m).length;
 if(!ids.length||faltantes)return {indisponivel:true,mensagem:ids.length===1?'Meta ainda não cadastrada':`Meta consolidada incompleta: ${faltantes} vendedora(s) sem meta no mês`};
 return {valor:registros.reduce((s,m)=>s+dinheiro(m.valor),0)/100,criterio:'cadastro_liquido_os_normal',origem:'painel',mes,registros};
}
export function agruparRevisoes(xs) {
 const mapa=new Map();for(const o of unicos(xs)) {
  const k=String(o.negociacaoId || o.id);const anterior=mapa.get(k);
  if(!anterior || Number(o.revisao||0)>Number(anterior.revisao||0) || (Number(o.revisao||0)===Number(anterior.revisao||0)&&String(o.dataAtualizacao||'')>String(anterior.dataAtualizacao||'')))mapa.set(k,o);
 }return [...mapa.values()];
}
export function apurarComercial(base,filtro,hoje) {
 const periodo=validarPeriodo(filtro,hoje), fimReal=periodo.ate<hoje?periodo.ate:hoje;
 const noPeriodo=(d,p=periodo)=>dia(d)>=p.de&&dia(d)<=p.ate;
 const cobertura=base.cobertura || {};
 const coberto=p=>!!cobertura.desde&&!!cobertura.ate&&cobertura.desde<=p.de&&cobertura.ate>=(p.ate>hoje?hoje:p.ate);
 const ordens=unicos(base.ordens||[]).map(o=>({...o,centavos:o.valorConfirmado===false?null:dinheiro(o.valor)}));
 const elegivel=o=>!o.cancelada && normal(o.tipo)==='normal' && o.centavos!==null;
 const vendas=ordens.filter(o=>noPeriodo(o.data,{de:periodo.de,ate:fimReal})&&elegivel(o));
 const incompletas=ordens.filter(o=>noPeriodo(o.data,{de:periodo.de,ate:fimReal}) && (!o.tipo||o.centavos===null));
 const valor=vendas.reduce((s,o)=>s+o.centavos,0), completo=coberto(periodo)&&!incompletas.length;
 const propostas=agruparRevisoes(base.orcamentos||[]).filter(o=>noPeriodo(o.dataCadastro||o.dataEnvio)).map(o=>{const aa=(base.acoes||[]).filter(a=>String(a.orcamentoId)===String(o.id)).sort((a,b)=>String(b.atualizadoEm).localeCompare(String(a.atualizadoEm)));return {...o,valor:o.valorConfirmado===false?null:o.valor,ultimaAcao:aa[0]||null,proximaAcao:aa.filter(a=>a.status!=='concluida').sort((a,b)=>a.data.localeCompare(b.data))[0]||null};});
 const coberturaOrc=base.coberturaOrcamentos||{};
 const orcamentosCompletos=!!coberturaOrc.desde&&coberturaOrc.desde<=periodo.de&&!!coberturaOrc.ate&&coberturaOrc.ate>=fimReal;
 const abertas=propostas.filter(o=>o.situacao==='aberto');
 const acoes=(base.acoes||[]).filter(a=>noPeriodo(a.data));
 const hojeA=acoes.filter(a=>a.status!=='concluida'&&a.data===hoje), atrasadas=acoes.filter(a=>a.status!=='concluida'&&a.data<hoje);
 const porCliente=new Map();
 for(const c of base.clientes||[])porCliente.set(String(c.id),{...c,vendas:[],orcamentos:[],acoes:[],centavos:0,ultimaCompra:null,primeiraCompra:null,produtos:[]});
 for(const o of ordens.filter(o=>elegivel(o)&&dia(o.data)<=hoje)){
  const c=porCliente.get(String(o.clienteId));if(!c)continue;
  const data=dia(o.data);if(!c.ultimaCompra||data>c.ultimaCompra)c.ultimaCompra=data;if(!c.primeiraCompra||data<c.primeiraCompra)c.primeiraCompra=data;
  if(noPeriodo(data)){c.vendas.push(o);c.centavos+=o.centavos;}
 }
 for(const o of propostas){const c=porCliente.get(String(o.clienteId));if(c)c.orcamentos.push(o);}
 for(const a of base.acoes||[]){const c=porCliente.get(String(a.clienteId));if(c)c.acoes.push(a);}
 for(const c of porCliente.values()){
  c.produtos=[...new Set(c.vendas.flatMap(o=>(o.itens||[]).map(i=>i.produto)))];
  c.acoes.sort((a,b)=>String(b.atualizadoEm).localeCompare(String(a.atualizadoEm)));
  c.proximoContato=c.acoes.filter(a=>a.status!=='concluida').sort((a,b)=>a.data.localeCompare(b.data))[0]?.data||null;
  c.perfil=c.ultimaCompra && c.ultimaCompra<somarDias(hoje,-Number(base.config?.diasReativacao??90))?'Sem compra recente':c.primeiraCompra&&c.primeiraCompra<periodo.de&&c.vendas.length?'Recorrente':c.vendas.length?'Primeira compra no histórico disponível':'Sem compra no recorte';
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
 const comp=anteriorEquivalente(periodo,hoje,filtro.comparacao);let comparativo=null;
 if(comp){
  const vv=ordens.filter(o=>noPeriodo(o.data,comp)&&elegivel(o)),anterior=vv.reduce((s,o)=>s+o.centavos,0),ok=coberto(comp)&&!ordens.some(o=>noPeriodo(o.data,comp)&&(!o.tipo||o.centavos===null));
  const atual={de:comp.atualDe,ate:comp.atualAte},atuais=ordens.filter(o=>noPeriodo(o.data,atual)&&elegivel(o));
  const totalAtual=atuais.reduce((s,o)=>s+o.centavos,0),atualOk=coberto(atual)&&!ordens.some(o=>noPeriodo(o.data,atual)&&(!o.tipo||o.centavos===null));
  comparativo={...comp,valorAtual:atualOk?totalAtual:null,valorAnterior:ok?anterior:null,registros:vv,registrosAtuais:atuais,delta:ok&&atualOk?totalAtual-anterior:null,percentual:ok&&atualOk&&anterior!==0?(totalAtual-anterior)/anterior*100:null,completo:ok&&atualOk};
 }
 const meses=new Map();for(const o of vendas){const m=dia(o.data).slice(0,7);if(m<periodo.de.slice(0,7)||m>periodo.ate.slice(0,7))continue;const a=meses.get(m)||{mes:m,centavos:0,pedidos:0};a.centavos+=o.centavos;a.pedidos++;meses.set(m,a);}
 const acumulado=[];let soma=0;for(let d=periodo.de;d<=fimReal;d=somarDias(d,1)){soma+=vendas.filter(v=>dia(v.data)===d).reduce((s,o)=>s+o.centavos,0);acumulado.push({data:d,centavos:soma});}
 const limite=Number(base.config?.diasSemResposta ?? 7),validade=Number(base.config?.diasVencimento ?? 3);
 const prioridades=[...hojeA,...atrasadas].map(a=>({...a,tipo:a.data<hoje?'Retorno atrasado':'Retorno de hoje'}));
 for(const o of abertas){
  const tarefas=(base.acoes||[]).filter(a=>String(a.orcamentoId)===String(o.id)).sort((a,b)=>String(b.atualizadoEm).localeCompare(String(a.atualizadoEm)));
  const ultima=tarefas[0], venc=o.validadeData || (o.validade>0 && dataISO(dia(o.dataCadastro||o.dataEnvio))?somarDias(dia(o.dataCadastro||o.dataEnvio),o.validade):null);
  const parada=[ultima?.atualizadoEm,o.acompanhamento?.ultimoContato,o.dataAtualizacao,o.dataCadastro||o.dataEnvio].map(dia).filter(dataISO).sort().at(-1);let tipo='';
  if(ultima?.pendencias)tipo='Negociação com pendência';else if(venc && venc<=somarDias(hoje,validade))tipo=venc<hoje?'Validade vencida':'Próxima do vencimento';else if(parada && parada<=somarDias(hoje,-limite))tipo='Proposta sem resposta';
  if(tipo&&!prioridades.some(a=>String(a.orcamentoId)===String(o.id)))prioridades.push({id:'orc-'+o.id,orcamentoId:o.id,clienteId:o.clienteId,cliente:o.cliente,vendedorNome:o.vendedorNome,valor:o.valor,descricao:ultima?.pendencias||'Conferir interesse e combinar o próximo passo',tipo,data:ultima?.data||'',ultimaInteracao:ultima?.atualizadoEm||null});
 }
 return {periodo,hoje,criterio:'O.S. normal, valor líquido, data de cadastro',completo,incompletas:incompletas.length,vendas,valor,pedidos:vendas.length,ticket:vendas.length?Math.round(valor/vendas.length):null,propostas,abertas,orcamentosCompletos,valorAberto:!orcamentosCompletos||abertas.some(o=>dinheiro(o.valor)===null)?null:abertas.reduce((s,o)=>s+dinheiro(o.valor),0),acoes,hojeA,atrasadas,prioridades,clientes:[...porCliente.values()],categorias:[...categorias.values()].sort((a,b)=>b.centavos-a.centavos),produtos:[...produtos.values()].sort((a,b)=>b.centavos-a.centavos),meses:[...meses.values()].sort((a,b)=>a.mes.localeCompare(b.mes)),acumulado,comparativo,meta:progressoMeta(base.meta,valor,periodo,hoje,base.config?.calendario)};
}
export function validarAcao(b,escopo,base,autor,agora) {
 if(!b || !/^[\w-]{1,80}$/.test(b.id||''))throw Object.assign(new Error('Identificador inválido.'),{status:400});
 const vendedorId=String(b.vendedorId||escopo.vendedorId||'');
 if(!escopo.gestor&&!escopo.ids.includes(vendedorId))throw Object.assign(new Error('Responsável fora do seu acesso.'),{status:403});
 if(!(base.vendedores||[]).some(v=>String(v.id)===vendedorId))throw Object.assign(new Error('Escolha uma vendedora do Mubisys.'),{status:400});
 const orcamentoId=String(b.orcamentoId||''),clienteId=String(b.clienteId||'');
 const o=orcamentoId?(base.orcamentos||[]).find(o=>String(o.id)===orcamentoId):null;
 const c=(base.clientes||[]).find(c=>String(c.id)===clienteId);
 if(!c || (orcamentoId&&(!o||String(o.clienteId)!==clienteId)))throw Object.assign(new Error('Cliente ou orçamento fora do seu acesso.'),{status:403});
 if(!dataISO(b.data)||typeof b.descricao!=='string'||!b.descricao.trim()||b.descricao.length>500)throw Object.assign(new Error('Informe a próxima ação e uma data válida.'),{status:400});
 if(!['pendente','concluida'].includes(b.status||'pendente'))throw Object.assign(new Error('Situação inválida.'),{status:400});
 if(b.decisao && !dataISO(b.decisao))throw Object.assign(new Error('Previsão de decisão inválida.'),{status:400});
 return {id:b.id,vendedorId,orcamentoId,clienteId,cliente:c.nome,valor:o?.valor??null,descricao:b.descricao.trim(),data:b.data,status:b.status||'pendente',nota:String(b.nota||'').slice(0,3000),pendencias:String(b.pendencias||'').slice(0,1000),decisao:b.decisao||null,atualizadoPor:autor,atualizadoEm:agora};
}
