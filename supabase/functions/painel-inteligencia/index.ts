import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {verificarJwt,crachaRevogado} from '../_shared/cripto.ts';
import {FONTES,direcaoAutorizada,incorporarPagina,snapshot,mesclarListaDetalhes,janelaConsulta} from '../_shared/inteligencia-importacao.mjs';
import {normalizarNota,normalizarDetalhe} from '../_shared/inteligencia-normalizacao.mjs';
const sb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type,x-token','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const json=(v:unknown,s=200)=>new Response(JSON.stringify(v),{status:s,headers:CORS});
const resumo=(j:any)=>j?{fonte:j.fonte,desde:j.desde,ate:j.ate,corte:j.corte??j.ate,situacao:j.situacao,paginas:j.paginas||0,consultados:j.itens?.length||j.consultados||0,total:j.ids?.length??j.total??null,motivo:j.motivo||null,em:j.em}:null;
async function rpc(nome:string,args:any={}){const {data,error}=await sb.rpc(nome,args);if(error)throw new Error('Não foi possível confirmar a etapa da importação.');return data;}
async function cache(chave:string){const {data,error}=await sb.from('painel_cache').select('valor').eq('chave',chave).maybeSingle();if(error)throw new Error('Falha ao consultar a última carga.');return data?.valor??null;}
async function credenciais(){let pk=Deno.env.get('MUBI_PUBLIC_KEY')||'',token=Deno.env.get('MUBI_TOKEN')||'';if(!pk||!token){const {data,error}=await sb.from('pcp_meta').select('valor').eq('chave','mubisys').maybeSingle();if(error)throw new Error('Conexão indisponível.');pk=data?.valor?.publicKey||'';token=data?.valor?.accessToken||'';}if(!pk||!token)throw new Error('Mubisys não configurado.');return {pk,token};}
async function consultar(rota:string,params:any={},timeout=85000){const c=await credenciais(),u=new URL(`https://api.mubisys.com/api/${encodeURIComponent(c.pk)}/${rota}`);for(const [k,v] of Object.entries(params))u.searchParams.set(k,String(v));let r:Response;try{r=await fetch(u,{redirect:'error',headers:{Accept:'application/json','Access-Token':c.token},signal:AbortSignal.timeout(timeout)});}catch{throw new Error('Consulta interrompida. A última carga completa foi preservada.');}if(!r.ok)throw new Error(`Mubisys HTTP ${r.status}; fonte não conferida.`);try{return await r.json();}catch{throw new Error('Resposta do ERP não reconhecida.');}}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:CORS});
 if(!['GET','POST'].includes(req.method))return json({erro:'Método não permitido.'},405);
 const segredo=Deno.env.get('PAINEL_JWT_SECRET')||'',carga=Deno.env.get('PAINEL_TOKEN')||'';
 const token=(req.headers.get('authorization')||'').match(/^Bearer\s+(.+)$/i)?.[1];
 const cargaAutorizada=!!carga&&req.headers.get('x-token')===carga;
 let sessao:any=null;
 if(!cargaAutorizada){sessao=segredo&&token?await verificarJwt(token,segredo):null;if(!sessao)return json({erro:'Entre no sistema.',semSessao:true},401);if(!direcaoAutorizada(sessao))return json({erro:'Conferência disponível apenas para a Direção.'},403);if(await crachaRevogado(sb,'painel',sessao,true))return json({erro:'Acesso não confirmado.',semSessao:true},401);}
 const b=req.method==='GET'?{action:'ler'}:await req.json().catch(()=>null);
 if(!b)return json({erro:'Pedido inválido.'},400);
 try{
  if(b.action==='ler'){
   if(cargaAutorizada)return json({erro:'Use a sessão da Direção para consultar dados.'},403);
   const [nfe,compras,detalhes]=await Promise.all(['intel_nfe','intel_compras','intel_detalhes'].map(cache));
   const {data,error}=await sb.from('painel_inteligencia_carga').select('estado').eq('id',1).maybeSingle();if(error)throw new Error('Não foi possível consultar o estado da carga.');
   return json({nfe,compras,detalhes,carga:resumo(data?.estado),preparando:!nfe&&!compras&&!detalhes});
  }
  if(b.action==='status'){const {data,error}=await sb.from('painel_inteligencia_carga').select('estado').eq('id',1).maybeSingle();if(error)throw new Error('Carga indisponível.');return json({carga:resumo(data?.estado)});}
  if(b.action==='diagnosticoLista'){
   try{janelaConsulta(b.desde,b.ate);}catch{return json({erro:'Período inválido.'},400);}
   const bruto=await consultar('ordem-servico',{status:'TODOS',filtrodata:'CADASTRO',datainicial:b.desde,datafinal:janelaConsulta(b.desde,b.ate).datafinal,page:1,per_page:2});
   const xs=Array.isArray(bruto)?bruto:Array.isArray(bruto?.data)?bruto.data:[];
   return json({quantidade:xs.length,campos:Object.keys(xs[0]||{}),processosPrevistos:Array.isArray(xs[0]?.processos_previstos),processosRealizados:Array.isArray(xs[0]?.processos_realizados),temCusto:xs[0]?.valor_custo!=null,paginacao:bruto?.pagination||bruto?.meta||null});
  }
  if(b.action==='iniciar'){
   if(!FONTES.includes(b.fonte))return json({erro:'Fonte desconhecida.'},400);try{janelaConsulta(b.desde,b.ate);}catch(e){return json({erro:(e as Error).message},400);}
   const j:any={fonte:b.fonte,desde:b.desde,ate:b.ate,corte:janelaConsulta(b.desde,b.ate).corte,pagina:1,itens:[],situacao:'andamento',em:new Date().toISOString()};
   if(b.fonte==='detalhes'){
    const nfe=await cache('intel_nfe');if(!nfe?.completo||nfe.desde!==b.desde||nfe.ate!==b.ate||(nfe.corte??nfe.ate)!==j.corte)return json({erro:'Importe as NF-e deste período e data de corte antes dos detalhes.'},409);
    const ids=new Set<string>(nfe.itens.flatMap((n:any)=>n.osIds||[]));
    for(let offset=0;offset<=5000;offset+=1000){const {data,error}=await sb.from('painel_ordens').select('id').gte('data',b.desde).lte('data',j.corte).order('id').range(offset,offset+999);if(error)throw new Error('Não foi possível conferir a base de O.S.');for(const o of data||[])ids.add(String(o.id));if((data||[]).length<1000)break;if(offset===5000)throw new Error('Recorte muito grande: reduza o período.');}
    j.ids=[...ids].sort();j.total=j.ids.length;
   }
   const salvo=await rpc('inteligencia_iniciar',{p_estado:j});return json({carga:resumo(salvo)});
  }
  if(b.action==='avancar'){
   const reserva=await rpc('inteligencia_reservar');if(reserva.ocupada)return json({ocupada:true},409);if(reserva.vazio)return json({erro:'Inicie uma consulta.'},409);if(reserva.concluida)return json({carga:resumo(reserva.estado)});
   let j=reserva.estado;
   try{
    if(j.fonte==='detalhes'&&!j.listaConferida){
     const lista=j.lista||{pagina:1,itens:[]};
     const bruto=await consultar('ordem-servico',{status:'TODOS',filtrodata:'CADASTRO',datainicial:j.desde,datafinal:janelaConsulta(j.desde,j.corte??j.ate).datafinal,page:lista.pagina,per_page:500});
     const proxima=incorporarPagina(lista,bruto,normalizarDetalhe);
     j=proxima.pronto?mesclarListaDetalhes(j,proxima):{...j,lista:proxima,pronto:false};
    }else if(j.fonte==='detalhes'){
     const inicio=Date.now();
     // Etapas curtas e retomáveis: até 8 detalhes, no máximo 24 partidas/minuto.
     // Uma resposta lenta encerra a etapa dentro da reserva, preservando o já lido.
     for(let i=0;i<8&&j.itens.length<j.ids.length&&Date.now()-inicio<65000;i++){
      if(i>0)await new Promise(r=>setTimeout(r,2500));
      const id=j.ids[j.itens.length];if(!/^\d+$/.test(id))throw new Error('ID de O.S. inválido.');
      const b=await consultar(`ordem-servico/${id}`,{},Math.max(1000,75000-(Date.now()-inicio)));
      const o=normalizarDetalhe(Array.isArray(b?.data)?b.data[0]:b?.data||b);if(o.id!==id)throw new Error('O.S. retornada não corresponde ao pedido.');
      j={...j,itens:[...j.itens,o],paginas:(j.paginas||0)+1};
     }
     j.pronto=j.itens.length===j.ids.length;
    }else{const b=await consultar(j.fonte==='nfe'?'nota-fiscal-produto':'nota-fiscal-recebida',{status:'TODOS',filtrodata:'EMISSAO',datainicial:j.desde,datafinal:janelaConsulta(j.desde,j.corte??j.ate).datafinal,page:j.pagina,per_page:500});j=incorporarPagina(j,b,(n:any)=>normalizarNota(n,j.fonte==='compras'));}
    j={...j,situacao:j.pronto?'concluida':'andamento',motivo:null,em:new Date().toISOString()};const copia=j.pronto?snapshot(j,j.em):null;
    const estado=j.pronto?{...j,consultados:j.itens.length,itens:[],ids:undefined,total:j.itens.length}:j;
    await rpc('inteligencia_finalizar',{p_trava:reserva.trava,p_estado:estado,p_snapshot:copia});return json({carga:resumo(estado)});
   }catch(e){j={...j,situacao:'erro',motivo:(e as Error).message,em:new Date().toISOString()};await rpc('inteligencia_finalizar',{p_trava:reserva.trava,p_estado:j,p_snapshot:null});return json({erro:j.motivo,carga:resumo(j)},502);}
  }
  return json({erro:'Ação desconhecida.'},400);
 }catch{return json({erro:'Etapa não confirmada. Consulte o estado antes de tentar novamente.'},503);}
});

