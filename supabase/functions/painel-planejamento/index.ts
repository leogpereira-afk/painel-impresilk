import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {verificarJwt,crachaRevogado} from '../_shared/cripto.ts';
import {identidadePresenca} from '../_shared/reunioes-presenca.mjs';
import {idValido} from '../_shared/reunioes.mjs';
import {COLECAO,ErroPlanejamento,autorizarModulo,validarAcao,projetarAgenda,registrarComentario,anexarMetadados,removerAnexo,exigirVersao,prepararImportacao,lerArquivoPlanejamento} from '../_shared/planejamento.mjs';

const sb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const SECRET=Deno.env.get('PAINEL_JWT_SECRET')||'',BUCKET='painel-arquivos';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
const erro=(m:string,s=422)=>{throw new ErroPlanejamento(m,s);};
const MAX_BODY=7*1024*1024+50000;

async function lerCorpo(req:Request){
 if(Number(req.headers.get('content-length'))>MAX_BODY)erro('Conteúdo grande demais.',413);
 const reader=req.body?.getReader();if(!reader)erro('Pedido inválido.',400);
 const partes:Uint8Array[]=[];let total=0;
 try{while(true){const r=await reader!.read();if(r.done)break;total+=r.value.length;if(total>MAX_BODY){await reader!.cancel();erro('Conteúdo grande demais.',413);}partes.push(r.value);}}finally{reader!.releaseLock();}
 const bytes=new Uint8Array(total);let offset=0;for(const p of partes){bytes.set(p,offset);offset+=p.length;}
 try{const b=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!b||typeof b!=='object'||Array.isArray(b))throw Error();return b;}catch{erro('Pedido inválido.',400);}
}
async function paginas(colecao:string,colunas:string){
 const itens:any[]=[];
 for(let i=0;i<10000;i+=500){const {data,error}=await sb.from('registros').select(colunas).eq('colecao',colecao).eq('apagado',false).order('id').range(i,i+499);if(error)erro('Não foi possível consultar o diretório do RH. Tente novamente.',503);itens.push(...(data||[]));if((data||[]).length<500)return itens;}
 erro('O diretório do RH excedeu o limite de consulta.',503);
}
async function pessoasRH(){
 const [pessoas,status,areas]=await Promise.all([
  paginas('colaboradores','id,nome:registro->>nome,idPessoa:registro->>idPessoa,idPessoaBloqueado:registro->>idPessoaBloqueado,areaId:registro->>areaId,statusId:registro->>statusId,saiu:registro->>dataDesligamento,ehDirecao:registro->>ehDirecao'),
  paginas('status','id,ativo:registro->>contaComoAtivo'),paginas('areas','id,nome:registro->>nome'),
 ]);
 const ativos=new Set(status!.filter(s=>s.ativo===true||s.ativo==='true').map(s=>s.id));
 return pessoas!.map(p=>({rhId:p.id,idPessoa:String(p.idPessoa||''),nome:String(p.nome||''),setor:String(areas!.find(a=>a.id===p.areaId)?.nome||''),disponivel:!!p.id&&!!p.nome&&!p.saiu&&p.idPessoaBloqueado!==true&&p.idPessoaBloqueado!=='true'&&/^\d{6}$/.test(p.idPessoa||'')&&(ativos.has(p.statusId)||p.ehDirecao===true||p.ehDirecao==='true')})).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
}
async function obter(id:string,colecao=COLECAO){
 if(!idValido(id))erro('Identificador inválido.');
 const {data,error}=await sb.from('painel_registros').select('registro').eq('colecao',colecao).eq('id',id).maybeSingle();if(error)erro('Não foi possível consultar a ação.',503);return data?.registro||null;
}
async function listar(){
 const itens:any[]=[];
 for(let i=0;i<50000;i+=500){const {data,error}=await sb.from('painel_registros').select('id,registro').eq('colecao',COLECAO).order('id').range(i,i+499);if(error)erro('Não foi possível carregar o planejamento.',503);for(const row of data||[])itens.push({...row.registro,id:row.id});if((data||[]).length<500)return itens;}
 erro('A consulta excedeu o limite de ações. Solicite suporte.',503);
}
async function gravar(item:any,antes:any){
 let resposta;
 try{resposta=await sb.rpc('painel_registro_gravar',{p_colecao:COLECAO,p_id:item.id,p_registro:item,p_anterior:antes});}
 catch{
  // Uma resposta perdida não autoriza apagar o arquivo que já pode estar salvo.
  const salvo=await obter(item.id);if(salvo?.versao===item.versao&&salvo?.historico?.at(-1)?.id===item.historico?.at(-1)?.id)return salvo;
  erro('Não foi possível confirmar a gravação. Atualize para conferir antes de tentar novamente.',503);
 }
 if(resposta!.error){if(['40001','23505'].includes(resposta!.error.code))erro('Esta ação mudou ou já foi importada. Atualize antes de continuar.',409);erro('Não foi possível salvar a ação. Tente novamente.',503);}
 return item;
}
async function hash(value:any){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))).map(x=>x.toString(16).padStart(2,'0')).join('');}

Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});if(req.method!=='POST')return json({erro:'Use POST.'},405);
 try{
  if(!SECRET)erro('Acesso não configurado.',503);
  const token=(req.headers.get('authorization')||'').match(/^Bearer\s+(.+)$/i)?.[1];
  const s=token?await verificarJwt(token,SECRET):null;
  if(!s?.sub||await crachaRevogado(sb,'painel',s,true))return json({erro:'Entre novamente.',semSessao:true},401);
  autorizarModulo(s);const b=await lerCorpo(req);
  if(!['listar','pessoas','salvar','agenda','comentar','anexar','arquivo','removerAnexo','importar'].includes(b.action))erro('Ação inválida.',400);
  const identidade=await identidadePresenca(sb,s.sub);if(identidade.indisponivel)erro(identidade.motivo,503);
  const ator={gestor:s.master===true,rhId:identidade.rhId,usuario:s.sub,nome:s.nome||s.sub};
  if(b.action==='pessoas')return json({ok:true,pessoas:await pessoasRH()});
  if(b.action==='listar'){
   if(!Number.isInteger(b.ano)||b.ano<2000||b.ano>2100)erro('Informe um ano válido.');
   return json({ok:true,itens:(await listar())!.filter(a=>a.ano===b.ano),ator});
  }
  if(b.action==='agenda')return json({ok:true,eventos:projetarAgenda((await listar())!,b.mes)});
  if(b.action==='importar'){
   if(!ator.gestor)erro('Somente a gestão pode importar.',403);if(!idValido(b.loteId))erro('Identificador da importação inválido.');
   const requestHash=await hash({itens:b.itens,usuario:s.sub});const anterior=await obter(b.loteId,'planejamento_importacoes');
   if(anterior){if(anterior.hash!==requestHash)erro('Este lote já foi utilizado com outro conteúdo.',409);return json({ok:true,itens:anterior.itens});}
   const operacoes=prepararImportacao(b.itens,(await listar())!,ator,await pessoasRH());
   const {data,error}=await sb.rpc('painel_planejamento_importar',{p_lote_id:b.loteId,p_hash:requestHash,p_itens:operacoes});
   if(error){if(['40001','23505'].includes(error.code))erro('O planejamento mudou. Confira novamente a importação.',409);erro('Não foi possível confirmar a importação. Tente novamente com o mesmo lote.',503);}
   return json({ok:true,itens:data});
  }
  const antes=await obter(b.action==='salvar'?b.item?.id:b.id);
  if(b.action==='salvar')return json({ok:true,item:await gravar(validarAcao(b.item,antes,ator,await pessoasRH()),antes)});
  if(!antes)erro('Ação não encontrada.',404);
  if(b.action==='arquivo'){
   const arquivo=antes.anexos.find((a:any)=>a.id===b.arquivoId);
   if(!arquivo?.chave?.startsWith(`planejamento/${antes.id}/`)||arquivo.chave.includes('..'))erro('Arquivo não encontrado.',404);
   const {data,error}=await sb.storage.from(BUCKET).createSignedUrl(arquivo.chave,300,{download:arquivo.nome});if(error)erro('Não foi possível abrir o arquivo.',503);return json({ok:true,url:data.signedUrl});
  }
  exigirVersao(antes,b.versao);
  if(b.action==='comentar')return json({ok:true,item:await gravar(registrarComentario(antes,b.texto,ator),antes)});
  if(b.action==='removerAnexo')return json({ok:true,item:await gravar(removerAnexo(antes,b.arquivoId,ator),antes)});
  const {bytes,meta}=lerArquivoPlanejamento(b),id=crypto.randomUUID(),chave=`planejamento/${antes.id}/${id}.${meta.ext}`;
  const item=anexarMetadados(antes,{...meta,id,chave,descricao:b.descricao,etapaId:b.etapaId,substituiId:b.substituiId},ator);
  const {error}=await sb.storage.from(BUCKET).upload(chave,bytes,{contentType:meta.mime,upsert:false});if(error)erro('Não foi possível enviar o arquivo. Tente novamente.',503);
  try{return json({ok:true,item:await gravar(item,antes)});}catch(e){if(e.status===409)await sb.storage.from(BUCKET).remove([chave]).catch(()=>{});throw e;}
 }catch(e){if(e instanceof ErroPlanejamento)return json({erro:e.message},e.status);console.error('painel-planejamento: falha na operação');return json({erro:'Não foi possível concluir. Seu preenchimento deve ser mantido para nova tentativa.'},500);}
});
