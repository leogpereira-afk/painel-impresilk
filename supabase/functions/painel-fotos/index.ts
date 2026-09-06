// Fotos privadas dos bens. Metadados separados não viajam na lista do patrimônio.
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {verificarJwt,crachaRevogado} from '../_shared/cripto.ts';
const sb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const JWT_SECRET=Deno.env.get('PAINEL_JWT_SECRET') || '';
const BUCKET='painel-arquivos', COLECAO='patrimonio_foto';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const resposta=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers});
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST')return resposta({erro:'Use POST.'},405);
 const token=(req.headers.get('authorization')||'').match(/^Bearer\s+(.+)$/i)?.[1];
 const sessao=token&&JWT_SECRET?await verificarJwt(token,JWT_SECRET):null;
 if(!sessao||await crachaRevogado(sb,"painel",sessao))return resposta({erro:"Entre no sistema.",semSessao:true},401);
 if(!sessao.master&&!sessao.perms?.includes('*')&&!sessao.perms?.includes('patrimonio'))return resposta({erro:'Você não tem acesso ao Patrimônio.'},403);
 try{
 const corpo=await req.json(),bemId=String(corpo.bemId||'');
 if(corpo.action==='resumo') {
  const porBem:Record<string,number>={};
  for(let de=0;;de+=1000) {
   const {data,error}=await sb.from('painel_registros').select('registro').eq('colecao',COLECAO).order('id').range(de,de+999);
   if(error)throw error;
   for(const f of data || []) {const id=f.registro?.bemId;if(id)porBem[id]=(porBem[id]||0)+1;}
   if(!data||data.length<1000)break;
  }
  return resposta({ok:true,porBem});
 }
 if(!bemId||bemId.length>180)return resposta({erro:'Informe o equipamento.'},400);
 const {data:bem,error:erroBem}=await sb.from('painel_registros').select('id').eq('colecao','patrimonio').eq('id',bemId).maybeSingle();
 if(erroBem)throw erroBem;if(!bem)return resposta({erro:'Equipamento não encontrado.'},404);
 switch(corpo.action){
 case "listar": {
  const {data,error}=await sb.from('painel_registros').select('id,registro').eq('colecao',COLECAO).eq('registro->>bemId',bemId).order('id').limit(100);
  if(error)throw error;
  const fotos=await Promise.all((data||[]).map(async(f:any)=>{
   const caminho=String(f.registro.caminho||'');
   if(!caminho.startsWith(`patrimonio/${encodeURIComponent(bemId)}/`))throw new Error('Referência de foto inválida');
   const {data:link,error}=await sb.storage.from(BUCKET).createSignedUrl(caminho,600);if(error)throw error;
   return {id:f.id,nome:f.registro.nome,criadoEm:f.registro.criadoEm,url:link.signedUrl};
  }));return resposta({ok:true,fotos});
 }
 case "adicionar": {
  const base64=String(corpo.base64||'');
  if(!base64||base64.length>4*1024*1024)return resposta({erro:'Escolha uma foto de até 3 MB.'},400);
  let bytes:Uint8Array;try{bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));}catch{return resposta({erro:'Foto inválida.'},400);}
  // O navegador converte a foto em JPEG, removendo metadados e reduzindo o tamanho.
  if(bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)return resposta({erro:'A foto precisa ser JPEG.'},400);
  const id=crypto.randomUUID(),caminho=`patrimonio/${encodeURIComponent(bemId)}/${id}.jpg`;
  const {error:up}=await sb.storage.from(BUCKET).upload(caminho,bytes,{contentType:'image/jpeg',upsert:false});if(up)throw up;
  const registro={bemId,caminho,nome:String(corpo.nome||'Foto do equipamento').slice(0,180),mime:'image/jpeg',criadoEm:new Date().toISOString(),criadoPor:String(sessao.sub||'')};
  const {error}=await sb.from('painel_registros').insert({colecao:COLECAO,id,registro,atualizado_em:registro.criadoEm});
  if(error){await sb.storage.from(BUCKET).remove([caminho]);throw error;}
  return resposta({ok:true,id});
 }
 case "remover": {
  const id=String(corpo.id||'');
  const {data,error}=await sb.from('painel_registros').select('registro').eq('colecao',COLECAO).eq('id',id).maybeSingle();
  if(error)throw error;
  if(!data||data.registro.bemId!==bemId)return resposta({erro:'Foto não encontrada neste equipamento.'},404);
  const caminho=String(data.registro.caminho||'');
  if(!caminho.startsWith(`patrimonio/${encodeURIComponent(bemId)}/`))return resposta({erro:'Referência inválida.'},400);
  const {error:del}=await sb.storage.from(BUCKET).remove([caminho]);if(del)throw del;
  const {error:meta}=await sb.from('painel_registros').delete().eq('colecao',COLECAO).eq('id',id);if(meta)throw meta;
  return resposta({ok:true});
 }
 default:return resposta({erro:'Ação desconhecida.'},400);
 }
 }catch(e){console.error('[painel-fotos]',e);return resposta({erro:'Não foi possível concluir. Tente novamente.'},500);}
});
