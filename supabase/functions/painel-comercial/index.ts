import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {verificarJwt,crachaRevogado} from '../_shared/cripto.ts';
import {consultarClientes} from '../_shared/consulta-clientes.mjs';
import {clienteBasico,vendedorOriginalPosVenda} from '../_shared/relacionamento-comercial.mjs';
import {contextoComercial} from '../_shared/comercial-contexto.ts';
import {mesclarOrdensComerciais,janelasHistoricas} from '../_shared/carteira-historica.mjs';
import {consultarFinanceiroComercial,detalharVendasCliente,paginarVendasCliente,projetarVendaCliente,timelineContatosCliente,pedidosPosVendaPendentes} from '../_shared/comercial-consultas.ts';
import {consultarOperacoesComerciais,enriquecerVendasOperacao} from '../_shared/comercial-operacao.ts';
import {validarFichasProdutos} from '../_shared/fichas-produtos.mjs';
import {pertence,validarPeriodo,validarAcao,gestorComercial,dataISO,apurarComercial,validarMeta,metaDoPeriodo} from '../_shared/comercial.mjs';
const sb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const secret=Deno.env.get('PAINEL_JWT_SECRET')||'';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const json=(v:any,status=200)=>new Response(JSON.stringify(v),{status,headers});
async function todas(criar:any){const xs:any[]=[];for(let inicio=0;inicio<100000;inicio+=500){const {data,error}=await criar().range(inicio,inicio+499);if(error)throw Object.assign(new Error('Não foi possível ler todos os registros.'),{status:503});xs.push(...data);if(data.length<500)return xs;}throw Object.assign(new Error('Consulta excedeu o limite. Reduza o período.'),{status:422});}
const hojeLocal=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});if(req.method!=='POST')return json({erro:'Use POST.'},405);
 const token=(req.headers.get('authorization')||'').match(/^Bearer\s+(.+)$/i)?.[1];
 const sessao=secret&&token?await verificarJwt(token,secret):null;
 if(!sessao||await crachaRevogado(sb,'painel',sessao))return json({erro:'Entre novamente no Painel.',semSessao:true},401);
 if(!sessao.master && !(sessao.perms||[]).includes('*') && !(sessao.perms||[]).includes('orcamentos'))return json({erro:'Seu acesso não inclui o Comercial.'},403);
 try{
  const b=await req.json();if(!b||typeof b!=='object')return json({erro:'Solicitação inválida.'},400);const filtro=b.filtro||{},hoje=hojeLocal(),periodo=validarPeriodo(filtro,hoje);
  let anteriorAcao:any=null;
  if(b.action==='salvarAcao'){const {data,error}=await sb.from('painel_registros').select('registro').eq('colecao','comercial_acoes').eq('id',String(b.acao?.id||'')).maybeSingle();if(error)throw error;anteriorAcao=data;}
  const ctx=await contextoComercial(sb,sessao,filtro,{hoje,clienteId:b.clienteId||b.acao?.clienteId||anteriorAcao?.registro?.clienteId,pedidoId:b.ordemId,posVenda:b.action==='consultarPosVenda',detalharCliente:b.action==='contextoRelacionamento',operacaoCliente:['contextoRelacionamento','salvarAcao'].includes(b.action),historico:!['salvarMeta','configurar','consultarClientes'].includes(b.action)});const {escopo,catalogo,config,orcamentos,clientes,fontes,coberturaHistorica}=ctx;
  if(!catalogo.completo)return json({erro:'O catálogo de vendedores e produtos ainda não foi sincronizado. A direção pode conferir a integração.'},503);
  if(b.action==='consultarClientes')return json(consultarClientes(fontes.crm_clientes,{busca:b.busca,pagina:b.pagina}));
  if(b.action==='salvarMeta'){
   if(!gestorComercial(sessao))return json({erro:'Somente a direção pode cadastrar metas.'},403);
   const meta=validarMeta(b.meta,catalogo,String(sessao.nome||sessao.sub),new Date().toISOString());
   const {error}=await sb.rpc('painel_registro_gravar',{p_colecao:'comercial_metas',p_id:meta.id,p_registro:meta,p_anterior:b.anterior||null});
   if(error)return json({erro:'A meta mudou em outro acesso. Atualize antes de salvar.'},409);
   return json({meta});
  }
  if(b.action==='configurar'){
   if(!gestorComercial(sessao))return json({erro:'Configuração restrita à direção.'},403);
   const c=b.config;
   if(!c||![c.diasSemResposta,c.diasVencimento,c.diasReativacao].every(n=>Number.isInteger(n)&&n>=0&&n<=730))return json({erro:'Informe os prazos entre 0 e 730 dias.'},400);
   const ids=new Set((catalogo.vendedores||[]).map((v:any)=>String(v.id)));
   if(Object.values(c.vinculos||{}).some(id=>!ids.has(String(id))))return json({erro:'Vínculo de vendedor inválido.'},400);
   if(!Array.isArray(c.equipes||[])||(c.equipes||[]).some((e:any)=>!e.id||!e.nome||!Array.isArray(e.vendedores)||e.vendedores.some((id:string)=>!ids.has(id))))return json({erro:'Equipe inválida.'},400);
   if(c.calendario?.configurado && (!Array.isArray(c.calendario.diasSemana)||!c.calendario.diasSemana.every((n:number)=>Number.isInteger(n)&&n>=0&&n<=6)||!Array.isArray(c.calendario.feriados)||!c.calendario.feriados.every(dataISO)||Object.entries(c.calendario.excecoes||{}).some(([d,v])=>!dataISO(d)||typeof v!=='boolean')))return json({erro:'Calendário inválido.'},400);
   for(const campo of ['participantesMetas','excluidosMetas'])if(Object.hasOwn(c,campo)&&!(campo==='participantesMetas'&&c[campo]===null)&&(!Array.isArray(c[campo])||c[campo].some((id:any)=>typeof id!=='string'||!ids.has(id))||new Set(c[campo]).size!==c[campo].length))return json({erro:'Participantes e exclusões das metas devem usar IDs únicos do catálogo.'},400);
   const agora=new Date().toISOString();
   let fichasProdutos=config.fichasProdutos||{};
   if(Object.hasOwn(c,'fichasProdutos'))try{fichasProdutos=validarFichasProdutos(c.fichasProdutos,catalogo.produtos||[],String(sessao.nome||sessao.sub),agora,config.fichasProdutos||{});}catch(e){return json({erro:e.message||'Fichas de produtos inválidas.'},400);}
   const registro={diasSemResposta:c.diasSemResposta,diasVencimento:c.diasVencimento,diasReativacao:c.diasReativacao,vinculos:c.vinculos||{},equipes:c.equipes||[],calendario:c.calendario||null,participantesMetas:Object.hasOwn(c,'participantesMetas')?c.participantesMetas:config.participantesMetas??null,excluidosMetas:Object.hasOwn(c,'excluidosMetas')?c.excluidosMetas:config.excluidosMetas||[],fichasProdutos,atualizadoEm:agora,atualizadoPor:sessao.sub};
   const {error}=await sb.rpc('painel_registro_gravar',{p_colecao:'comercial_config',p_id:'regras',p_registro:registro,p_anterior:b.anterior||null});if(error)return json({erro:'As regras mudaram. Atualize e confira antes de salvar.'},409);return json({ok:true,config:registro});
  }
  const carregarAcoes=()=>todas(()=>{let q=sb.from('painel_registros').select('id,registro').eq('colecao','comercial_acoes').order('id');if(escopo.ids!==null)q=q.in('registro->>vendedorId',escopo.ids);return q;});
  if(b.action==='consultarPosVenda'){
   const consultadoEm=new Date().toISOString(),candidatos=ctx.vendasHistoricasAutorizadas||[];
   const pagina=paginarVendasCliente(candidatos,b.pagina??1,b.tamanho??20),ids=new Set(pagina.vendas.map((o:any)=>o.id)),daPagina=candidatos.filter((o:any)=>ids.has(String(o.id)));
   const detalhadas=await detalharVendasCliente(sb,daPagina,fontes.ordens?.valor||[],escopo,null,hoje);
   const operacoes=await consultarOperacoesComerciais(sb,detalhadas,consultadoEm),vendas=enriquecerVendasOperacao(detalhadas,operacoes);
   const porOrdem=new Map(vendas.map((o:any)=>[String(o.id),o]));
   // Só as O.S. autorizadas desta página podem localizar ações divergentes.
   // A vendedora recebe apenas um impedimento; os dados da outra carteira
   // continuam restritos. A direção pode conferir e corrigir o vínculo legado.
   const registros=porOrdem.size?await todas(()=>sb.from('painel_registros').select('id,registro').eq('colecao','comercial_acoes').eq('registro->>tipoAcao','pos_venda').in('registro->>ordemId',[...porOrdem.keys()]).order('id')):[];
   const acoes=registros.map((r:any)=>{
    const a=r.registro,o:any=porOrdem.get(String(a.ordemId)),visivel=escopo.gestor||escopo.ids?.includes(String(a.vendedorId)),vendedorOriginal=vendedorOriginalPosVenda(o,catalogo.vendedores||[]);
    if(!visivel||String(a.clienteId)!==String(o.clienteId))return {tipoAcao:'pos_venda',ordemId:String(o.id),clienteId:String(o.clienteId),acaoOculta:true,vinculoPosVendaDivergente:true};
    return {...a,vinculoPosVendaDivergente:!vendedorOriginal||String(a.vendedorId)!==vendedorOriginal};
   });
   const resultado=pedidosPosVendaPendentes(vendas,acoes,{incluirConcluidos:b.incluirConcluidos===true}),indisponiveis=vendas.filter((o:any)=>o.operacao?.estado==='indisponivel').length,semVinculo=vendas.filter((o:any)=>o.operacao?.estado==='sem_vinculo').length;
   return json({...resultado,incluiConcluidos:b.incluirConcluidos===true,paginacao:{...pagina.paginacao,criterio:'Candidatos comerciais autorizados, independentemente do mês das vendas.'},cobertura:{totalCandidatos:pagina.paginacao.total,candidatosNaPagina:daPagina.length,verificadosNaPagina:detalhadas.length,elegiveisNaPagina:resultado.elegiveisNaPagina,pendentesNaPagina:resultado.pendentesNaPagina,concluidosNaPagina:resultado.concluidosNaPagina,operacaoIndisponivel:indisponiveis,semVinculo,completa:!indisponiveis&&!semVinculo&&detalhadas.length===daPagina.length,criterio:'Entrega efetiva comprovada no PCP; pós-venda concluído exige contato confirmado com resultado e relato do atendimento. A paginação conta candidatos, não um total definitivo de pós-vendas.'},coberturaHistorica,fontes:{vendas:{fonte:'Histórico comercial do Painel',atualizadoEm:coberturaHistorica?.atualizadoEm||null},operacao:{fonte:'PCP',consultadoEm}},consultadoEm});
  }
  if(b.action==='contextoRelacionamento'){
   if(!fontes.crm_clientes?.valor?.completo)return json({erro:'O cadastro de clientes ainda não foi sincronizado por completo.'},503);
   const c=Object.values(fontes.crm_clientes.valor.clientes||{}).find((c:any)=>String(c.id)===String(b.clienteId))||clientes.find((c:any)=>String(c.id)===String(b.clienteId));
   if(!c)return json({erro:'Cliente não localizado. Consulte novamente.'},404);
   const consultadoEm=new Date().toISOString(),autorizado=clientes.some((x:any)=>String(x.id)===String(b.clienteId));
   const {vendas,paginacao}=paginarVendasCliente(ctx.vendasCliente||[],b.pagina??1,b.tamanho??20);
   const acoes=(await carregarAcoes()).map((a:any)=>a.registro).filter((a:any)=>String(a.clienteId)===String(b.clienteId));
   return json({cliente:{...clienteBasico(c),...(autorizado?{telefone:String((c as any).telefone||''),celular:String((c as any).celular||''),email:String((c as any).email||'')}: {})},autorizado,orcamentos:orcamentos.filter((o:any)=>String(o.clienteId)===String(b.clienteId)).map((o:any)=>({id:o.id,numero:o.numero,trabalho:o.trabalho,situacao:o.situacao,clienteId:o.clienteId,valor:o.valorConfirmado===false?null:o.valor??null})),vendas,vendasCliente:vendas,paginacao,acoes,timelineContatos:timelineContatosCliente(acoes),coberturaHistorica,fontes:{clientes:{fonte:'Mubisys sincronizado',atualizadoEm:fontes.crm_clientes.atualizado_em||null},vendas:{fonte:'Histórico comercial do Painel',atualizadoEm:coberturaHistorica?.atualizadoEm||null},operacao:{fonte:'PCP',consultadoEm}},consultadoEm});
  }
  if(b.action==='consultarPedido'){
   if(typeof b.ordemId!=='string'||!b.ordemId.trim()||b.ordemId.length>100)return json({erro:'Identificador de pedido inválido.'},400);
   const autorizada=(ctx.ordensAutorizadas||[]).find((o:any)=>String(o.id)===b.ordemId);
   if(!autorizada)return json({erro:'Pedido fora do seu acesso ou não localizado.'},403);
   const consultadoEm=new Date().toISOString();
   const detalhadas=await detalharVendasCliente(sb,[autorizada],fontes.ordens?.valor||[],escopo,String(autorizada.clienteId),hoje);
   if(!detalhadas.length)return json({erro:'Este pedido não possui identificação comercial verificável.'},422);
   const operacoes=await consultarOperacoesComerciais(sb,detalhadas,consultadoEm),pedido=enriquecerVendasOperacao(detalhadas,operacoes)[0];
   return json({pedido:projetarVendaCliente(pedido),operacao:operacoes.get(b.ordemId),financeiro:await consultarFinanceiroComercial(sb,[pedido],consultadoEm),fontes:{comercial:{fonte:'Histórico comercial do Painel',atualizadoEm:pedido.atualizado_em||null},operacao:{fonte:'PCP',consultadoEm}},consultadoEm});
  }
  if(b.action==='salvarAcao'){
   const anterior=anteriorAcao;if(anterior && !escopo.gestor&&!escopo.ids.includes(anterior.registro.vendedorId))return json({erro:'Esta ação pertence a outra vendedora.'},403);
   if(anterior?.registro?.tipoAcao==='pos_venda'){
    const alterouVinculo=['tipoAcao','clienteId','ordemId'].some(k=>Object.hasOwn(b.acao||{},k)&&String(b.acao[k]??'')!==String(anterior.registro[k]??''));
    if(alterouVinculo)return json({erro:'O vínculo de pós-venda preserva o tipo, o cliente e a O.S. original. Edite o atendimento nesta ação.'},400);
   }else if(anterior&&b.acao?.tipoAcao==='pos_venda')return json({erro:'Crie o pós-venda a partir da O.S. entregue.'},400);
   const entrada={...anterior?.registro,...b.acao,...(b.acao?.confirmarContato===true?{resultado:b.acao.resultado??'',resultadoContato:b.acao.resultadoContato??null,relatoAtendimento:b.acao.relatoAtendimento??'',nota:b.acao.nota??'',motivoPerda:b.acao.motivoPerda??'',observacaoPerda:b.acao.observacaoPerda??''}: {})};
   const a=validarAcao(entrada,escopo,{acaoAnterior:anterior?.registro||{},vendedores:catalogo.vendedores,orcamentos,clientes,vendasCliente:ctx.vendasCliente||[],clientesConsulta:Object.values(fontes.crm_clientes?.valor?.clientes||{}).map(clienteBasico),cadastroCompleto:fontes.crm_clientes?.valor?.completo===true},String(sessao.nome||sessao.sub),new Date().toISOString());
   if(anterior?.registro?.compromissoId)a.compromissoId=anterior.registro.compromissoId;
   const novoPosVenda=!anterior&&a.tipoAcao==='pos_venda',conflitoPosVenda='Já existe uma ação de pós-venda para este pedido. Atualize e abra a ação existente para registrar o atendimento.';
   if(novoPosVenda){
    // Validar cliente, carteira e entrega vem antes desta consulta. Todas as
    // criações para a mesma O.S. disputam o mesmo ID e a trava/versionamento
    // já existentes na RPC; nunca reaproveitamos o registro silenciosamente.
    const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(a.ordemId));
    a.id='pv-'+Array.from(new Uint8Array(hash)).map(n=>n.toString(16).padStart(2,'0')).join('').slice(0,48);
    const [{data:canonica,error:erroCanonica},legadas]=await Promise.all([
     sb.from('painel_registros').select('id').eq('colecao','comercial_acoes').eq('id',a.id).maybeSingle(),
     todas(()=>sb.from('painel_registros').select('id,status:registro->>status').eq('colecao','comercial_acoes').eq('registro->>tipoAcao','pos_venda').eq('registro->>ordemId',a.ordemId).order('id')),
    ]);
    if(erroCanonica)throw Object.assign(new Error('Não foi possível conferir a ação de pós-venda existente.'),{status:503});
    if(canonica||legadas.some((x:any)=>x.status!=='concluida'))return json({erro:conflitoPosVenda},409);
   }
   const {data,error}=await sb.rpc('painel_comercial_salvar_acao',{p_id:a.id,p_vendedor:a.vendedorId,p_registro:a,p_versao:novoPosVenda?null:b.versao??null,p_autor:String(sessao.sub),p_autorizados:escopo.gestor?null:escopo.ids});
   if(error)return json({erro:novoPosVenda?conflitoPosVenda:'A atividade mudou em outro acesso. Atualize antes de salvar.'},409);return json({acao:data});
  }
  if(b.action!=='painel')return json({erro:'Ação inválida.'},400);
  if(!fontes.orcamentos || !fontes.crm_clientes?.valor?.completo)return json({erro:'As fontes de orçamentos e clientes ainda não estão disponíveis.'},503);
  const inicio=`${Number(periodo.de.slice(0,4))-1}-01-01`;
  const ordensBrutas=await todas(()=>{let q=sb.from('painel_ordens').select('id,numero,cliente,data,valor,bruto,desconto,vendedor,itens,comercial,atualizado_em').gte('data',inicio).lte('data',periodo.ate).order('id');
   // Nomes de origem são legados. O segundo filtro, por identidade, é obrigatório.
   return q;});
  // A tabela conserva o histórico; o cache normalizado traz tipo e cliente das O.S. recentes.
  const recentes=(fontes.ordens?.valor||[]).filter((o:any)=>o.data>=inicio&&o.data<=periodo.ate);
  const ordens=mesclarOrdensComerciais(ordensBrutas.map((o:any)=>({...o,valorBruto:o.bruto})),recentes,fontes.ordens?.atualizado_em).filter((o:any)=>pertence(o,escopo));
  const acoes=(await carregarAcoes()).map((a:any)=>({...a.registro}));
  const marcacoes=await todas(()=>sb.from('painel_registros').select('id,registro').eq('colecao','ov_orc').order('id'));
  const permitidos=new Map(orcamentos.map((o:any)=>[String(o.id),o]));
  for(const m of marcacoes){const o:any=permitidos.get(String(m.id)),v=m.registro||{};if(!o)continue;
   Object.assign(o,{situacaoErp:o.situacao,situacaoLocal:['ganho','perdido'].includes(v.situacao)?v.situacao:null,situacao:['ganho','perdido'].includes(v.situacao)?v.situacao:o.situacao,acompanhamento:{nota:v.nota||'',ultimoContato:v.contatoEm||null,contatoEm:v.contatoEm||null,contatoConfirmado:!!v.contatoEm,origemContatoLegado:v.chamadoEm?'abertura_canal_legada':null,proximoToque:v.proximoToque||null,motivoPerdaId:v.motivoPerdaId||null}});
   if(dataISO(v.proximoToque)&&!['ganho','perdido'].includes(v.situacao)&&o.situacao==='aberto')acoes.push({id:'mesa-'+m.id,origem:'mesa',compromissoId:v.compromissoId||null,vendedorId:o.vendedorErpId||o.vendedorId||null,clienteId:o.clienteId,cliente:o.cliente,orcamentoId:o.id,valor:o.valor,descricao:v.nota||'Retorno combinado na mesa de orçamentos',nota:v.nota||'',data:v.proximoToque,status:'pendente',atualizadoEm:v.atualizadoEm||null,contatoEm:v.contatoEm||null,vendedorNome:o.vendedorNome});
  }
  const atualizado=ordensBrutas.map((o:any)=>o.atualizado_em).sort().at(-1)||null;
  const status=fontes.historico_status?.valor || {};
  const plena=fontes.status?.valor?.ultimaCompleta;
  const recenteEm=fontes.ordens?.atualizado_em?.slice(0,10);
  const historicoOk=status.ok===true;
  const porJanelas=(recurso:string,legado:any)=>{
   const carga=fontes.comercial_carga_status?.valor;if(!carga)return {...legado,fonte:'legado'};
   const janelas=janelasHistoricas(carga,recurso),janela=janelas.find((j:any)=>j.desde<=periodo.de&&j.ate>=periodo.de);
   return {desde:janela?.desde||null,ate:janela?.ate||null,janelas,fonte:'comercial_carga_status'};
  };
  const cobertura=porJanelas('ordens',{desde:historicoOk?status.desde:(plena?'2025-01-01':null),ate:plena&&recenteEm?recenteEm:(historicoOk?status.ate:null)});
  const coberturaOrcamentos=porJanelas('orcamentos',{desde:fontes.orcamentos.atualizado_em?.slice(0,4)+'-01-01',ate:fontes.orcamentos.atualizado_em?.slice(0,10)});
  const configPublica=escopo.gestor?config:{diasSemResposta:config.diasSemResposta,diasVencimento:config.diasVencimento,diasReativacao:config.diasReativacao,calendario:config.calendario,fichasProdutos:config.fichasProdutos||{}};
  const metas=(await todas(()=>{let q=sb.from('painel_registros').select('id,registro').eq('colecao','comercial_metas').order('id');if(escopo.ids!==null)q=q.in('registro->>vendedorId',escopo.ids);return q;})).map((r:any)=>r.registro);
  const meta=metaDoPeriodo(metas,escopo,catalogo,periodo,config);
  const bases={ordens,orcamentos,clientes,acoes,meta,config:configPublica,cobertura,coberturaHistorica,coberturaOrcamentos};
  const relatorio=apurarComercial(bases,filtro,hoje);
  const financeiro=await consultarFinanceiroComercial(sb,relatorio.vendas);
  return json({base:bases,relatorio,financeiro,metas,escopo:{...escopo,nomes:undefined},catalogo:{produtos:catalogo.produtos||[],vendedores:escopo.vendedores},config:escopo.gestor?config:{diasSemResposta:config.diasSemResposta,diasVencimento:config.diasVencimento,diasReativacao:config.diasReativacao,calendario:config.calendario,fichasProdutos:config.fichasProdutos||{}},fontes:Object.fromEntries(Object.entries(fontes).map(([k,v]:any)=>[k,{atualizadoEm:v.atualizado_em}])),ordensEm:atualizado,avisos:[...(fontes.status?.valor?.fontesQueFalharam?.length?['A sincronização teve falhas. Confira os horários das fontes; os últimos dados válidos foram preservados.']:[]),'Metas cadastradas pela direção no Painel, por vendedora e mês. Realizado por O.S. normal, líquida, na data de cadastro. Não são metas importadas do Mubisys.','Devoluções sem vínculo não são abatidas automaticamente.','Histórico sem tipo da O.S. requer nova leitura do ERP; não compõe o realizado verificável.','A cobertura dos orçamentos é informada pelas janelas de sincronização. Datas de envio, versões e conversão em pedido não foram confirmadas pela integração.'],atualizadoEm:fontes.orcamentos.atualizado_em});
 }catch(e){return json({erro:e?.status?e.message:'A consulta comercial não foi concluída. Tente atualizar.',codigo:e?.codigo||null},e?.status||503);}
});
