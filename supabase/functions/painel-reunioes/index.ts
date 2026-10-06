import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { verificarJwt, crachaRevogado } from '../_shared/cripto.ts';
import { COLECAO_REUNIOES, ErroReuniao, idValido, podeEditarReuniao, prepararReuniao, carimbarReuniao, novoRegistro, validarArquivoReuniao } from '../_shared/reunioes.mjs';
const sb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const JWT_SECRET=Deno.env.get('PAINEL_JWT_SECRET')||'',BUCKET='painel-arquivos';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(x:any,status=200)=>new Response(JSON.stringify(x),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
async function obter(id:string){
 if(!idValido(id))throw new ErroReuniao('Encontro inválido.');
 const {data,error}=await sb.from('painel_registros').select('registro').eq('colecao',COLECAO_REUNIOES).eq('id',id).maybeSingle();
 if(error)throw error;return data?.registro||null;
}
async function gravar(r:any,antes:any){
 const {error}=await sb.rpc('painel_registro_gravar',{p_colecao:COLECAO_REUNIOES,p_id:r.id,p_registro:r,p_anterior:antes});
 if(error){if(error.code==='40001')throw new ErroReuniao('Este encontro mudou enquanto você editava. Reabra a ficha e confira.',409);throw error;}
 return r;
}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json({erro:'Use POST.'},405);
 try{
  if(!JWT_SECRET)return json({erro:'Acesso não configurado.'},503);
  const token=(req.headers.get('authorization')||'').match(/^Bearer\s+(.+)$/i)?.[1];
  const s=token?await verificarJwt(token,JWT_SECRET):null;
  if(!s||typeof s.sub!=='string'||!s.sub||await crachaRevogado(sb,'painel',s))return json({erro:'Entre novamente.',semSessao:true},401);
  if(!(s.master===true||s.perms?.includes('*')||s.perms?.includes('reunioes')))return json({erro:'Sem acesso a Reuniões.'},403);
  const raw=await req.text();if(raw.length>7500000)return json({erro:'Conteúdo grande demais.'},413);
  let b:any;try{b=JSON.parse(raw);}catch{return json({erro:'Pedido inválido.'},400);}
  if(!b||typeof b!=='object'||Array.isArray(b))return json({erro:'Pedido inválido.'},400);
  if(b.action==='listar'){
   const itens:any[]=[];
   for(let pag=0;pag<100;pag++){
    const {data,error}=await sb.from('painel_registros').select('id,registro').eq('colecao',COLECAO_REUNIOES).order('id').range(pag*500,pag*500+499);
    if(error)throw error;
    for(const row of data||[])itens.push({...row.registro,id:row.id,podeEditar:podeEditarReuniao(row.registro,s)});
    if((data||[]).length<500)return json({ok:true,itens});
   }
   throw new Error('Limite de consulta atingido.');
  }
  const id=b.item?.id||b.id,antes=await obter(id);
  if(b.action==='salvar'){
   const novo=prepararReuniao(b.item,antes,s);const item=await gravar(carimbarReuniao(novo,s,antes?'Editou o encontro':'Criou o encontro'),antes);
   return json({ok:true,item:{...item,podeEditar:true}});
  }
  if(!antes)return json({erro:'Encontro não encontrado.'},404);
  if(b.action==='arquivo'){
   const a=(antes.anexos||[]).find((x:any)=>x.id===b.arquivoId);
   if(!a||typeof a.chave!=='string'||!a.chave.startsWith('reunioes/'+id+'/'))return json({erro:'Arquivo não encontrado neste encontro.'},404);
   const {data,error}=await sb.storage.from(BUCKET).createSignedUrl(a.chave,300,{download:a.nome});
   if(error)throw error;return json({ok:true,url:data.signedUrl});
  }
  if(!['registro','anexar'].includes(b.action))return json({erro:'Ação inválida.'},400);
  if(!podeEditarReuniao(antes,s))return json({erro:'Somente quem criou ou a direção pode alterar este encontro.'},403);
  if(b.versao!==antes.versao)return json({erro:'Este encontro mudou. Reabra a ficha antes de continuar.'},409);
  if(b.action==='registro'){
   const item=await gravar(carimbarReuniao(novoRegistro(antes,b.texto,s),s,'Acrescentou um registro'),antes);
   return json({ok:true,item:{...item,podeEditar:true}});
  }
  if((antes.anexos||[]).length>=20)return json({erro:'Limite de 20 arquivos por encontro.'},422);
  if(typeof b.base64!=='string'||b.base64.length>7000000||!/^[A-Za-z0-9+/]*={0,2}$/.test(b.base64))return json({erro:'Arquivo inválido.'},422);
  let bin:string;try{bin=atob(b.base64);}catch{return json({erro:'Arquivo inválido.'},422);}
  const a=validarArquivoReuniao(b.nome,b.mime,bin.length),arquivoId=crypto.randomUUID(),chave=`reunioes/${id}/${arquivoId}.${a.ext}`;
  const bytes=Uint8Array.from(bin,c=>c.charCodeAt(0));
  const item=carimbarReuniao({...antes,anexos:[...(antes.anexos||[]),{...a,id:arquivoId,chave,em:new Date().toISOString(),por:s.sub,nomeAutor:s.nome||s.sub}]},s,'Anexou '+a.nome);
  const {error}=await sb.storage.from(BUCKET).upload(chave,bytes,{contentType:a.mime,upsert:false});
  if(error)throw error;
  try{await gravar(item,antes);}catch(e){await sb.storage.from(BUCKET).remove([chave]).catch(()=>{});throw e;}
  return json({ok:true,item:{...item,podeEditar:true}});
 }catch(e){
  if(e instanceof ErroReuniao)return json({erro:e.message},e.status);
  console.error('painel-reunioes',e);return json({erro:'Não foi possível concluir. Tente novamente.'},500);
 }
});
