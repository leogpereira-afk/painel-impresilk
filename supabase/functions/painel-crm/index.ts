import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {verificarJwt,crachaRevogado} from '../_shared/cripto.ts';
import {pedidoCrm,codigo} from './contrato.ts';
const sb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const SECRET=Deno.env.get('PAINEL_JWT_SECRET')||'';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers});
const lista=(v:any)=>Array.isArray(v)?v:Array.isArray(v?.data)?v.data:[];
const normal=(s:any)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
async function credenciais(){
 let pk=Deno.env.get('MUBI_PUBLIC_KEY')||'',token=Deno.env.get('MUBI_TOKEN')||'';
 if(!pk||!token){const {data,error}=await sb.from('pcp_meta').select('valor').eq('chave','mubisys').maybeSingle();if(error)throw new Error('Conexão indisponível.');pk=data?.valor?.publicKey||'';token=data?.valor?.accessToken||'';}
 if(!pk||!token)throw new Error('Conexão Mubisys não configurada.');return {pk,token};
}
async function mubi(c:any,rota:string,method='GET',payload?:any){return fetch(`https://api.mubisys.com/api/${encodeURIComponent(c.pk)}/${rota}`,{method,redirect:'error',headers:{'Access-Token':c.token,Accept:'application/json',...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{}),signal:AbortSignal.timeout(45000)});}
async function consultar(c:any,rota:string){const r=await mubi(c,rota);if(!r.ok)throw new Error('Mubisys não confirmou a consulta.');return r.json();}
async function todos(c:any,rota:string){const out:any[]=[];for(let page=1;page<=20;page++){const b=await consultar(c,`${rota}${rota.includes('?')?'&':'?'}page=${page}&per_page=500`);out.push(...lista(b));if(b?.pagination?.last_page!=null ? page>=Number(b.pagination.last_page):lista(b).length<500)return out;}throw new Error('Lista incompleta.');}
async function finalizar(id:string,estado:string,resultado:any,compromisso:any=null){const {data,error}=await sb.rpc('painel_crm_finalizar',{p_id:id,p_estado:estado,p_resultado:resultado,p_compromisso:compromisso});if(error)throw new Error('Resultado pendente de conferência.');return data;}
const resumo=(r:any,id:string)=>({id,action:r.action,estado:r.estado,criadoEm:r.criadoEm,titulo:r.titulo,resultado:r.resultado||null,cardId:r.cardId||null});
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});if(req.method!=='POST')return json({erro:'Use POST.'},405);
 // Diagnóstico somente de leitura, pelo mesmo segredo da carga. Não autoriza ações.
 const cargaToken=Deno.env.get('PAINEL_TOKEN')||'';
 if(cargaToken&&req.headers.get('x-token')===cargaToken){
  const d=await req.json().catch(()=>null);if(d?.action!=='diagnostico')return json({erro:'Diagnóstico somente de leitura.'},403);
  try{const c=await credenciais();const {data:cache}=await sb.from('painel_cache').select('valor').eq('chave','crm_funil').maybeSingle();const id=cache?.valor?.cards?.[0]?.id;const rotas=['usuario','grupo-tarefa',...(id?[`funil-vendas-card/${codigo(id)}`]:[])];const consultas=await Promise.all(rotas.map(async rota=>{try{const r=await mubi(c,rota+'?page=1&per_page=2');const b=await r.json().catch(()=>null);return {rota:rota.replace(/\/\d+/g,'/{id}'),status:r.status,contagem:lista(b).length,campos:Object.keys(lista(b)[0]||(!Array.isArray(b)&&b)||{})};}catch{return {rota:rota.replace(/\/\d+/g,'/{id}'),status:'indisponivel'};}}));return json({configurado:true,consultas});}catch{return json({configurado:false});}
 }
 const token=(req.headers.get('authorization')||'').match(/^Bearer\s+(.+)$/i)?.[1];
 const sessao=SECRET&&token?await verificarJwt(token,SECRET):null;
 if(!sessao||await crachaRevogado(sb,'painel',sessao))return json({erro:'Entre no sistema.',semSessao:true},401);
 const pode=(m:string)=>sessao.master===true||(sessao.perms||[]).includes('*')||(sessao.perms||[]).includes(m);
 let enviado=false;
 let b:any;try{b=await req.json();}catch{return json({erro:'Pedido inválido.'},400);}
 const action=String(b?.action||'');
 if(action==='contatoCobranca'?!pode('contas-atrasadas'):!pode('orcamentos')&&!(pode('compromissos')&&['opcoes','historico','detalhe','tarefa'].includes(action)))return json({erro:'Você não tem acesso a esta ação.'},403);
 if(action==='tarefa'&&!pode('compromissos'))return json({erro:'Criar tarefa exige acesso a Compromissos.'},403);
 try{
  if(action==='contatoCobranca'){
   if(!/^[1-9]\d{0,12}$/.test(String(b.tituloId||'')))return json({erro:'Título inválido.'},400);
   const {data,error}=await sb.rpc('painel_crm_contato_cobranca',{p_titulo:String(b.tituloId)});if(error)throw error;return json(data||{estado:'indisponivel'});
  }
  if(action==='resolver'){
   if(!sessao.master&&!(sessao.perms||[]).includes('*'))return json({erro:'A direção precisa conferir este envio no Mubisys.'},403);
   if(!['aplicado','naoAplicado'].includes(b.conferencia)||typeof b.justificativa!=='string'||b.justificativa.trim().length<20||b.justificativa.length>1000)return json({erro:'Informe o resultado e descreva o que conferiu no Mubisys (20 a 1.000 caracteres).'},400);
   const {data,error}=await sb.rpc('painel_crm_resolver',{p_id:String(b.operacaoId),p_quem:String(sessao.sub),p_aplicado:b.conferencia==='aplicado',p_justificativa:b.justificativa.trim()});if(error)return json({erro:'Este envio ainda está em andamento ou já foi conferido. Aguarde três minutos e atualize.'},409);return json({operacao:resumo(data,String(b.operacaoId))});
  }
  if(action==='historico'){
   let q=sb.from('painel_registros').select('id,registro').eq('colecao','crm_operacoes');
   if(!sessao.master&&!(sessao.perms||[]).includes('*'))q=q.eq('registro->>dono',sessao.sub);
   const {data,error}=await q.order('atualizado_em',{ascending:false}).limit(50);if(error)throw error;
   return json({operacoes:(data||[]).map((x:any)=>resumo(x.registro,x.id))});
  }
  let pedido:any=null;
  if(['mover','criar','anotar','tarefa'].includes(action)){
   try{pedido=pedidoCrm(action,b);}catch(e){return json({erro:(e as Error).message},400);}
   if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(b.operacaoId||'')))return json({erro:'Identificador de envio inválido.'},400);
   // Repetições devolvem o primeiro resultado ANTES de consultar uma fase que pode ter mudado.
   const {data:ant,error}=await sb.from('painel_registros').select('registro').eq('colecao','crm_operacoes').eq('id',b.operacaoId).maybeSingle();if(error)throw error;
   if(ant){if(ant.registro.dono!==String(sessao.sub)||JSON.stringify(ant.registro.pedido)!==JSON.stringify(pedido)){
     // jsonb muda a ordem das chaves; compare valores em ordem canônica.
     const canon=(v:any):any=>Array.isArray(v)?v.map(canon):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canon(v[k])])):v;
     if(ant.registro.dono!==String(sessao.sub)||JSON.stringify(canon(ant.registro.pedido))!==JSON.stringify(canon(pedido)))return json({erro:'Identificador já utilizado em outro envio.'},409);
    }return json({operacao:resumo(ant.registro,String(b.operacaoId)),repetida:true});}
  }else if(!['opcoes','detalhe'].includes(action))return json({erro:'Ação inválida.'},400);
  const creds=await credenciais();
  if(action==='opcoes'){
   const [us,tarefas]=await Promise.all([todos(creds,'usuario'),todos(creds,'grupo-tarefa').then(gs=>({gs,aviso:''})).catch(()=>({gs:[],aviso:'O Mubisys não disponibilizou grupos de tarefas. Confira o cadastro de grupos e o acesso à API no ERP. As outras ações continuam disponíveis.'}))]);const gs=tarefas.gs;
   const meus=us.filter((u:any)=>normal(u.nome)===normal(sessao.vend||sessao.nome));
   const {data:cache,error}=await sb.from('painel_cache').select('valor').eq('chave','crm_funil').maybeSingle();if(error)throw error;
   const equipe=sessao.master===true||(sessao.perms||[]).includes('*');
   const cards=(cache?.valor?.cards||[]).filter((c:any)=>equipe||meus.length===1&&String(c.responsavelId)===String(meus[0].id));
   return json({configurado:true,avisoTarefas:tarefas.aviso,grupos:cache?.valor?.grupos||[],cards:cards.map((c:any)=>({id:c.id,titulo:c.titulo,cliente:c.cliente,clienteId:c.clienteId})),usuarios:us.map((u:any)=>({id:String(u.id),nome:String(u.nome||'')})),gruposTarefa:gs.map((g:any)=>({id:String(g.id),nome:String(g.nome||g.descricao||'Grupo')})),meuUsuarioId:meus.length===1?String(meus[0].id):null});
  }
  const cardId=action==='criar'?null:String(codigo(b.cardId));
  let card:any=null;
  if(cardId){card=await consultar(creds,`funil-vendas-card/${cardId}`);if(String(card?.id)!==cardId)throw new Error('Oportunidade não localizada.');}
  // Consulta e escrita respeitam o responsável; direção pode operar a equipe.
  const equipe=sessao.master===true||(sessao.perms||[]).includes('*');
  let meuId:string|null=null;
  if(!equipe){const us=await todos(creds,'usuario');const meus=us.filter((u:any)=>normal(u.nome)===normal(sessao.vend||sessao.nome));meuId=meus.length===1?String(meus[0].id):null;
   if(!meuId||card&&(String(card.responsavel)!==meuId))return json({erro:'Esta oportunidade não está atribuída a você no Mubisys.'},403);
   if(action==='criar'&&String(b.responsavelId)!==meuId)return json({erro:'Escolha seu próprio responsável no Mubisys.'},403);
  }
  if(action==='detalhe')return json({card:{id:String(card.id),titulo:card.titulo,cliente:card.cliente?.nome||card.nome_cliente||'',fase:card.fase,grupo:card.grupo,status:card.status,tarefasExistentes:lista(card.tarefas).length}});
  if(action==='mover'||action==='criar'){
   const fases=await todos(creds,`funil-vendas-fase/grupo/${codigo(b.grupoId)}`);if(!fases.some((f:any)=>String(f.id)===String(b.faseId)))return json({erro:'Fase não pertence ao funil escolhido.'},400);
   if(action==='mover'&&(String(card.fase?.id)!==String(b.faseAnterior)||String(card.grupo?.id)!==String(b.grupoAnterior)))return json({erro:'A oportunidade mudou de fase. Atualize antes de mover.'},409);
  }
  if(action==='criar'){
   const cliente=await consultar(creds,`cliente/${codigo(b.clienteId)}`);if(String(cliente.id)!==String(b.clienteId))return json({erro:'Cliente não localizado.'},400);
   const us=await todos(creds,'usuario');if(!us.some((u:any)=>String(u.id)===String(b.responsavelId)))return json({erro:'Responsável não localizado.'},400);
  }
  if(action==='tarefa'){const gs=await todos(creds,'grupo-tarefa');if(!gs.some((g:any)=>String(g.id)===String(b.grupoTarefaId)))return json({erro:'Grupo de tarefa inválido.'},400);}
  const compromisso=action==='tarefa'?{titulo:pedido.payload.titulo,cliente:String(card.cliente?.nome||card.nome_cliente||''),tipo:'retorno',data:b.data,hora:b.hora,obs:pedido.payload.descricao,feito:false,crmCardId:cardId,crmEstado:'enviado'}:null;
  const id=String(b.operacaoId),registro={action,pedido,cardId,compromisso,donoNome:String(sessao.nome||sessao.sub),titulo:String(b.titulo||card?.titulo||'Ação comercial').slice(0,200)};
  const {data:reserva,error}=await sb.rpc('painel_crm_reservar',{p_id:id,p_dono:String(sessao.sub),p_registro:registro});
  if(error)return json({erro:'Há um envio anterior ou pendente. Confira o histórico de ações.'},409);
  if(!reserva.nova)return json({operacao:resumo(reserva.registro,id),repetida:true});
  enviado=true;
  let r:Response;
  try{r=await mubi(creds,pedido.rota,pedido.method,pedido.payload);}catch{await finalizar(id,'incerto',{mensagem:'Sem confirmação do Mubisys. Confira o registro no ERP antes de uma nova ação.'});return json({operacao:{id,estado:'incerto'}});}
  if(!r.ok){const estado=r.status>=500||[408,409,429].includes(r.status)?'incerto':'recusado';await finalizar(id,estado,{mensagem:estado==='incerto'?'Mubisys respondeu com falha. Confira antes de repetir.':`Mubisys recusou o envio (${r.status}). Confira os dados.`,httpStatus:r.status});return json({operacao:{id,estado}});}
  const resposta=await r.json().catch(()=>null);const externo=resposta?.id??resposta?.data?.id??null;
  if(resposta?.error||resposta?.erro||resposta?.success===false){await finalizar(id,'incerto',{mensagem:'Resposta inesperada. Confira a ação no Mubisys.'});return json({operacao:{id,estado:'incerto'}});}
  if(compromisso&&externo)(compromisso as any).crmTarefaId=String(externo);
  const final=await finalizar(id,'concluido',{idExterno:externo?String(externo):null,mensagem:'Mubisys confirmou o envio.'},compromisso);
  return json({operacao:resumo(final,id)});
 }catch{return json({erro:enviado?'Não foi possível concluir. Consulte o histórico antes de repetir um envio.':'A conexão com o Mubisys está indisponível. Nenhuma ação foi enviada.',enviado},503);}
});
