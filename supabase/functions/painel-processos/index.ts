import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {verificarJwt,crachaRevogado} from '../_shared/cripto.ts';
import {ErroReuniao,idValido,pessoasParaReunioes} from '../_shared/reunioes.mjs';
import {COLECAO_PROCESSOS,dadosConvite,revogarAcesso,editarTrabalho,podeAdministrarConsultoria,permiteAcaoConsultoria,validarAcessoConvite,avaliarEtapa,planejarEtapa,cadastrarConsultor,atualizarImplantacao,prepararProcesso,podeGerir,podeLer,agendaProcessos,carimbarProcesso,registrarProcesso,atualizarEtapa,projetarConvidado,projetarInterno,validarArquivoProcesso,falhar} from '../_shared/processos.mjs';
const sb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const SECRET=Deno.env.get('PAINEL_JWT_SECRET')||'',BUCKET='painel-arquivos';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info, x-convite','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(x:any,status=200)=>new Response(JSON.stringify(x),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
const digest=async(t:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t)))).map(b=>b.toString(16).padStart(2,'0')).join('');
async function lerRH(colecao:string,colunas:string){
 const itens:any[]=[];
 for(let pag=0;pag<100;pag++){
  const {data,error}=await sb.from('registros').select(colunas).eq('colecao',colecao).eq('apagado',false).order('id').range(pag*500,pag*500+499);
  if(error)throw error;itens.push(...(data||[]));if((data||[]).length<500)return itens;
 }
 throw new Error('Limite de leitura do RH atingido.');
}
async function pessoasRH(){
 const [pessoas,status,areas,cargos]=await Promise.all([
  lerRH('colaboradores','id,nome:registro->>nome,areaId:registro->>areaId,cargoId:registro->>cargoId,statusId:registro->>statusId,dataDesligamento:registro->>dataDesligamento,ehDirecao:registro->>ehDirecao'),
  lerRH('status','id,contaComoAtivo:registro->>contaComoAtivo'),
  lerRH('areas','id,nome:registro->>nome'),lerRH('cargos','id,nome:registro->>nome'),
 ]);
 return pessoasParaReunioes(pessoas,status,areas,cargos);
}
async function identidadeRH(s:any){
 const [{data:diretas,error:e1},{data:papeis,error:e2}]=await Promise.all([sb.from('acesso_conta').select('id,colaborador_id').eq('usuario',s.sub),sb.from('acesso_papel').select('conta_id').eq('sistema','painel').eq('login',s.sub)]);
 if(e1||e2)throw e1||e2;
 const ids=[...new Set([...(diretas||[]).map((x:any)=>x.id),...(papeis||[]).map((x:any)=>x.conta_id)])];
 if(!ids.length)return '';
 const {data,error}=await sb.from('acesso_conta').select('id,colaborador_id').in('id',ids);if(error)throw error;
 const rhs=[...new Set((data||[]).map((x:any)=>x.colaborador_id).filter(Boolean))];return ids.length===1&&rhs.length===1?String(rhs[0]):'';
}
async function obter(id:string){if(!idValido(id))falhar('Identificador inválido.');const {data,error}=await sb.from('painel_registros').select('registro').eq('colecao',COLECAO_PROCESSOS).eq('id',id).maybeSingle();if(error)throw error;return data?.registro||null;}
async function gravar(item:any,antes:any){const {error}=await sb.rpc('painel_registro_gravar',{p_colecao:COLECAO_PROCESSOS,p_id:item.id,p_registro:item,p_anterior:antes});if(error){if(error.code==='40001')falhar('A ficha mudou. Atualize antes de continuar.',409);throw error;}return item;}
async function listar(s:any){const itens:any[]=[];for(let p=0;p<100;p++){const {data,error}=await sb.from('painel_registros').select('id,registro').eq('colecao',COLECAO_PROCESSOS).order('id').range(p*500,p*500+499);if(error)throw error;for(const row of data||[]){const r={...row.registro,id:row.id};if(podeLer(r,s))itens.push(r);}if((data||[]).length<500)return itens;}throw Error('Limite de consulta.');}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});if(req.method!=='POST')return json({erro:'Use POST.'},405);
 try{
  const raw=await req.text();if(raw.length>7500000)return json({erro:'Conteúdo grande demais.'},413);
  let b:any;try{b=JSON.parse(raw);}catch{return json({erro:'Pedido inválido.'},400);}if(!b||typeof b!=='object'||Array.isArray(b))return json({erro:'Pedido inválido.'},400);
  let s:any,antes:any=null,convite:any=null;const externo=req.headers.get('x-convite');
  if(externo){
   if(!/^[a-zA-Z0-9_-]{1,80}\.[a-f0-9]{64}$/.test(externo))return json({erro:'Convite inválido ou encerrado.'},401);
   const [id,segredo]=externo.split('.');antes=await obter(id);const hash=await digest(segredo);convite=antes?.convites?.find((c:any)=>c.hash===hash);
   if(!validarAcessoConvite(antes,convite)||antes.situacao==='cancelada')return json({erro:'Convite inválido ou encerrado.'},401);
   if(!permiteAcaoConsultoria(convite,b.action)||b.id&&b.id!==id)return json({erro:'Este convite não permite essa ação.'},403);
   s={sub:'convite:'+convite.id,nome:convite.nome,externo:true,consultorId:convite.consultorId||null,nivel:convite.nivel??'colaborador',conviteId:convite.id};
  }else{
   if(!SECRET)return json({erro:'Acesso não configurado.'},503);
   const token=(req.headers.get('authorization')||'').match(/^Bearer\s+(.+)$/i)?.[1];s=token?await verificarJwt(token,SECRET):null;
   if(!s?.sub||await crachaRevogado(sb,'painel',s))return json({erro:'Entre novamente.',semSessao:true},401);
   if(!(s.master===true||s.perms?.includes('*')||s.perms?.includes('demandas')))return json({erro:'Sem acesso a Demandas e Consultorias.'},403);
   s={...s,rhId:await identidadeRH(s)};
   if(b.action==='pessoas')return json({ok:true,pessoas:await pessoasRH()});
   if(['listar','agenda'].includes(b.action)){const itens=await listar(s);return json(b.action==='agenda'?{ok:true,eventos:agendaProcessos(itens,b.mes)}:{ok:true,itens:itens.map(r=>projetarInterno(r,s))});}
   if(!['obter','salvar','registro','etapa','anexar','arquivo','compartilhar','convidar','revogar','consultor','implantacao','planejarEtapa','avaliarEtapa','trabalho'].includes(b.action))return json({erro:'Ação inválida.'},400);
   antes=await obter(b.item?.id||b.id);
   if(antes&&!podeLer(antes,s))return json({erro:'Processo não encontrado.'},404);
  }
  const apresentar=(r:any)=>externo?projetarConvidado(r,convite):projetarInterno(r,s);
  if(b.action==='salvar'){const item=carimbarProcesso(prepararProcesso(b.item,antes,s,await pessoasRH()),s,antes?'Atualizou a ficha':'Criou o processo');return json({ok:true,item:apresentar(await gravar(item,antes))});}
  if(!antes)return json({erro:'Processo não encontrado.'},404);
  if(b.action==='obter')return json({ok:true,item:apresentar(antes)});
  if(b.action==='arquivo'){
   const a=antes.anexos.find((x:any)=>x.id===b.arquivoId&&(!externo||x.compartilhado));if(!a?.chave?.startsWith('processos/'+antes.id+'/'))return json({erro:'Arquivo não encontrado.'},404);
   const {data,error}=await sb.storage.from(BUCKET).createSignedUrl(a.chave,300,{download:a.nome});if(error)throw error;return json({ok:true,url:data.signedUrl});
  }
  if(b.versao!==antes.versao)return json({erro:'A ficha mudou. Atualize antes de continuar.'},409);
  if((b.action==='compartilhar'&&!podeGerir(antes,s))||(['convidar','revogar','consultor'].includes(b.action)&&!podeAdministrarConsultoria(antes,s)))return json({erro:'Apenas o gestor pode administrar o compartilhamento.'},403);
  if(b.action==='trabalho'){const item=carimbarProcesso(editarTrabalho(antes,b,s),s,'Organizou o trabalho da consultoria');return json({ok:true,item:apresentar(await gravar(item,antes))});}
  if(b.action==='avaliarEtapa'){const item=carimbarProcesso(avaliarEtapa(antes,b,s),s,'Avaliou a qualidade da etapa');return json({ok:true,item:apresentar(await gravar(item,antes))});}
  if(b.action==='planejarEtapa'){const item=carimbarProcesso(planejarEtapa(antes,b,s),s,'Planejou ou atualizou datas da etapa');return json({ok:true,item:apresentar(await gravar(item,antes))});}
  if(b.action==='consultor'){const item=carimbarProcesso(cadastrarConsultor(antes,b,s),s,'Cadastrou ou atualizou consultor');return json({ok:true,item:apresentar(await gravar(item,antes))});}
  if(b.action==='implantacao'){const item=carimbarProcesso(atualizarImplantacao(antes,b,s),s,'Atualizou implantação de ação');return json({ok:true,item:apresentar(await gravar(item,antes))});}
  if(b.action==='convidar'){
   if(antes.tipo!=='consultoria'||antes.situacao==='cancelada')falhar('Convites estão disponíveis para consultorias ativas.');
   if(antes.convites.length>=100)falhar('Limite de 100 convites atingido.');
   const acesso=dadosConvite(antes,b,s);
   const segredo=Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join('');
   const c={id:crypto.randomUUID(),...acesso,hash:await digest(segredo),criadoEm:new Date().toISOString(),criadoPor:s.sub};
   const item=await gravar(carimbarProcesso({...antes,convites:[...antes.convites,c]},s,'Criou convite para '+c.nome),antes);return json({ok:true,item:apresentar(item),convite:antes.id+'.'+segredo});
  }
  if(b.action==='revogar'){
   const item=await gravar(carimbarProcesso(revogarAcesso(antes,b,s),s,'Revogou convite'),antes);return json({ok:true,item:apresentar(item)});
  }
  if(b.action==='compartilhar'){
   if(!antes.anexos.some((x:any)=>x.id===b.arquivoId))falhar('Arquivo não encontrado.',404);
   const item=await gravar(carimbarProcesso({...antes,anexos:antes.anexos.map((x:any)=>x.id===b.arquivoId?{...x,compartilhado:b.compartilhado===true}:x)},s,b.compartilhado?'Compartilhou arquivo no portal':'Restringiu arquivo à equipe'),antes);return json({ok:true,item:apresentar(item)});
  }
  if(b.action==='registro'||b.action==='etapa'){
   const item=carimbarProcesso(b.action==='registro'?registrarProcesso(antes,b,s):atualizarEtapa(antes,b,s),s,b.action==='registro'?'Acrescentou registro':'Atualizou etapa');return json({ok:true,item:apresentar(await gravar(item,antes))});
  }
  if(b.action!=='anexar')return json({erro:'Ação inválida.'},400);
  if(antes.anexos.length>=20)falhar('Limite de 20 arquivos por processo.');
  if(typeof b.base64!=='string'||b.base64.length>7000000||!/^[A-Za-z0-9+/]*={0,2}$/.test(b.base64))falhar('Arquivo inválido.');
  let bin:string;try{bin=atob(b.base64);}catch{falhar('Arquivo inválido.');}
  const a=validarArquivoProcesso(b.nome,b.mime,bin!.length),id=crypto.randomUUID(),chave=`processos/${antes.id}/${id}.${a.ext}`;
  const item=carimbarProcesso({...antes,anexos:[...antes.anexos,{...a,id,chave,compartilhado:!!externo,por:s.sub,nomeAutor:s.nome,em:new Date().toISOString()}]},s,'Anexou '+a.nome);
  const {error}=await sb.storage.from(BUCKET).upload(chave,Uint8Array.from(bin!,c=>c.charCodeAt(0)),{contentType:a.mime,upsert:false});if(error)throw error;
  try{await gravar(item,antes);}catch(e){await sb.storage.from(BUCKET).remove([chave]).catch(()=>{});throw e;}
  return json({ok:true,item:apresentar(item)});
 }catch(e){if(e instanceof ErroReuniao)return json({erro:e.message},e.status);console.error('painel-processos: falha na operação');return json({erro:'Não foi possível concluir. Tente novamente.'},500);}
});
