import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {verificarJwt,crachaRevogado} from '../_shared/cripto.ts';
import {consultarClientes} from '../_shared/consulta-clientes.mjs';
import {contextoComercial} from '../_shared/comercial-contexto.ts';
import {mesclarOrdensComerciais,janelasHistoricas} from '../_shared/carteira-historica.mjs';
import {financeiroDasOS} from '../_shared/financeiro-os.ts';
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
  const ctx=await contextoComercial(sb,sessao,filtro,{hoje,historico:!['salvarMeta','configurar','consultarClientes'].includes(b.action)});const {escopo,catalogo,config,orcamentos,clientes,fontes,coberturaHistorica}=ctx;
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
   const registro={diasSemResposta:c.diasSemResposta,diasVencimento:c.diasVencimento,diasReativacao:c.diasReativacao,vinculos:c.vinculos||{},equipes:c.equipes||[],calendario:c.calendario||null,atualizadoEm:new Date().toISOString(),atualizadoPor:sessao.sub};
   const {error}=await sb.rpc('painel_registro_gravar',{p_colecao:'comercial_config',p_id:'regras',p_registro:registro,p_anterior:b.anterior||null});if(error)return json({erro:'As regras mudaram. Atualize e confira antes de salvar.'},409);return json({ok:true,config:registro});
  }
  const carregarAcoes=()=>todas(()=>{let q=sb.from('painel_registros').select('id,registro').eq('colecao','comercial_acoes').order('id');if(escopo.ids!==null)q=q.in('registro->>vendedorId',escopo.ids);return q;});
  if(b.action==='salvarAcao'){
   const a=validarAcao(b.acao,escopo,{vendedores:catalogo.vendedores,orcamentos,clientes},String(sessao.nome||sessao.sub),new Date().toISOString());
   const {data:anterior,error:er}=await sb.from('painel_registros').select('registro').eq('colecao','comercial_acoes').eq('id',a.id).maybeSingle();
   if(er)throw er;if(anterior && !escopo.gestor&&!escopo.ids.includes(anterior.registro.vendedorId))return json({erro:'Esta ação pertence a outra vendedora.'},403);
   const {data,error}=await sb.rpc('painel_comercial_salvar_acao',{p_id:a.id,p_vendedor:a.vendedorId,p_registro:a,p_versao:b.versao??null,p_autor:String(sessao.sub),p_autorizados:escopo.gestor?null:escopo.ids});
   if(error)return json({erro:'A atividade mudou em outro acesso. Atualize antes de salvar.'},409);return json({acao:data});
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
   Object.assign(o,{situacaoErp:o.situacao,situacaoLocal:['ganho','perdido'].includes(v.situacao)?v.situacao:null,situacao:['ganho','perdido'].includes(v.situacao)?v.situacao:o.situacao,acompanhamento:{nota:v.nota||'',ultimoContato:v.chamadoEm||null,proximoToque:v.proximoToque||null,motivoPerdaId:v.motivoPerdaId||null}});
   if(dataISO(v.proximoToque)&&!['ganho','perdido'].includes(v.situacao)&&o.situacao==='aberto')acoes.push({id:'mesa-'+m.id,origem:'mesa',clienteId:o.clienteId,cliente:o.cliente,orcamentoId:o.id,valor:o.valor,descricao:v.nota||'Retorno combinado na mesa de orçamentos',nota:v.nota||'',data:v.proximoToque,status:'pendente',atualizadoEm:v.chamadoEm||null,vendedorNome:o.vendedorNome});
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
  const configPublica=escopo.gestor?config:{diasSemResposta:config.diasSemResposta,diasVencimento:config.diasVencimento,diasReativacao:config.diasReativacao,calendario:config.calendario};
  const metas=(await todas(()=>{let q=sb.from('painel_registros').select('id,registro').eq('colecao','comercial_metas').order('id');if(escopo.ids!==null)q=q.in('registro->>vendedorId',escopo.ids);return q;})).map((r:any)=>r.registro);
  const meta=metaDoPeriodo(metas,escopo,catalogo,periodo);
  const bases={ordens,orcamentos,clientes,acoes,meta,config:configPublica,cobertura,coberturaHistorica,coberturaOrcamentos};
  const relatorio=apurarComercial(bases,filtro,hoje);
  // Só as O.S. visíveis à vendedora podem solicitar títulos. Número repetido
  // na tabela é ambíguo: não atribuímos o mesmo pagamento a duas linhas.
  const candidatos=[...new Set(relatorio.vendas.map((o:any)=>String(o.numero||'')))].filter((n:string)=>/^\d{1,12}$/.test(n)).slice(0,600);
  let financeiro:any={abertos:[],pagos:[],permutaDaOS:{},consultadas:[],temPagos:false,desdeDados:null};
  if(candidatos.length){
   try{
    const mesmos=await todas(()=>sb.from('painel_ordens').select('id,numero,vendedor,comercial').in('numero',candidatos).order('id'));
    const contagens=new Map<string,number>();for(const o of mesmos)contagens.set(String(o.numero),(contagens.get(String(o.numero))||0)+1);
    const vendasPorNumero=new Map<string,any[]>();for(const o of relatorio.vendas){const n=String(o.numero);vendasPorNumero.set(n,[...(vendasPorNumero.get(n)||[]),o]);}
    const seguros=candidatos.filter((n:string)=>contagens.get(n)===1&&vendasPorNumero.get(n)?.length===1&&mesmos.some((o:any)=>String(o.numero)===n&&String(o.id)===String(vendasPorNumero.get(n)[0].id)));
    if(seguros.length){
     const ids=relatorio.vendas.filter((o:any)=>seguros.includes(String(o.numero))).map((o:any)=>String(o.id));
     const lerCacheComData=async(chave:string)=>{const {data,error}=await sb.from('painel_cache').select('valor,atualizado_em').eq('chave',chave).maybeSingle();if(error)throw error;return {valor:data?.valor??null,em:data?.atualizado_em??null};};
     const f=await financeiroDasOS(new Set(seguros),ids,{sb,lerCacheComData});
     financeiro={...f,consultadas:seguros};
    }
   }catch{ /* A tela comercial continua disponível; dinheiro sem fonte fica sem confirmação. */ }
  }
  return json({base:bases,relatorio,financeiro,metas,escopo:{...escopo,nomes:undefined},catalogo:{produtos:catalogo.produtos||[],vendedores:escopo.vendedores},config:escopo.gestor?config:{diasSemResposta:config.diasSemResposta,diasVencimento:config.diasVencimento,diasReativacao:config.diasReativacao,calendario:config.calendario},fontes:Object.fromEntries(Object.entries(fontes).map(([k,v]:any)=>[k,{atualizadoEm:v.atualizado_em}])),ordensEm:atualizado,avisos:[...(fontes.status?.valor?.fontesQueFalharam?.length?['A sincronização teve falhas. Confira os horários das fontes; os últimos dados válidos foram preservados.']:[]),'Metas cadastradas pela direção no Painel, por vendedora e mês. Realizado por O.S. normal, líquida, na data de cadastro. Não são metas importadas do Mubisys.','Devoluções sem vínculo não são abatidas automaticamente.','Histórico sem tipo da O.S. requer nova leitura do ERP; não compõe o realizado verificável.','A cobertura dos orçamentos é informada pelas janelas de sincronização. Datas de envio, versões e conversão em pedido não foram confirmadas pela integração.'],atualizadoEm:fontes.orcamentos.atualizado_em});
 }catch(e){return json({erro:e?.status?e.message:'A consulta comercial não foi concluída. Tente atualizar.',codigo:e?.codigo||null},e?.status||503);}
});
