import {buscarComRetentativa} from './repetir-http.ts';
export async function vigiarCache(sb:any) {
  const token=Deno.env.get('PAINEL_GH_ACTIONS_TOKEN') || Deno.env.get('GITHUB_TOKEN') || '';
  const repo=Deno.env.get('PAINEL_GH_REPO') || 'leogpereira-afk/painel-impresilk';
  const fontes=['recebiveis','pagar','bancos','orcamentos','ordens','recebidos_os'];
  const {data,error}=await sb.from('painel_cache').select('chave,atualizado_em').in('chave',fontes);
  if(error) throw new Error('Falha ao verificar atualização.');
  const atrasadas=fontes.filter(chave=>{const f=data?.find((x:any)=>x.chave===chave);return !f || Date.now()-Date.parse(f.atualizado_em)>25*60000;});
  if(!atrasadas.length) return {ok:true,motivo:'Fontes atualizadas.'};
  const registrar=async(valor:any)=>{const {error}=await sb.from('painel_meta').upsert({chave:'carga_disparo',valor:{...valor,em:new Date().toISOString(),fontes:atrasadas},atualizado_em:new Date().toISOString()},{onConflict:'chave'});if(error)throw new Error('Não foi possível registrar a solicitação de atualização.');};
  if(!token) {await registrar({ok:false,erro:'Token de atualização não configurado.'});throw new Error('Token de atualização não configurado.');}
  const headers={Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','User-Agent':'impresilk-painel'};
  const base=`https://api.github.com/repos/${repo}/actions/workflows/cache-mubisys.yml`;
  const consulta=await buscarComRetentativa(`${base}/runs?per_page=5`,{headers});
  if(!consulta.ok){await registrar({ok:false,erro:`Consulta de execução respondeu ${consulta.status}`});throw new Error('Não foi possível consultar a atualização no GitHub.');}
  const r=await consulta.json();
  const ativa=r.workflow_runs?.find((x:any)=>['queued','in_progress','waiting','pending','requested'].includes(x.status));
  if(ativa){await registrar({ok:true,estado:'em_andamento',execucao:ativa.id});return{ok:true,motivo:'Atualização já está em andamento.'};}
  const {data:ultimo}=await sb.from('painel_meta').select('valor').eq('chave','carga_disparo').maybeSingle();
  if(ultimo?.valor?.estado==='solicitada' && Date.now()-Date.parse(ultimo.valor.em)<10*60000)return{ok:true,motivo:'Solicitação recente; aguardando início.'};
  const disparo=await buscarComRetentativa(`${base}/dispatches`,{method:'POST',headers,body:JSON.stringify({ref:'main'})});
  await registrar({ok:disparo.ok,estado:disparo.ok?'solicitada':'falhou',http:disparo.status});
  if(!disparo.ok) throw new Error('Solicitação de atualização recusada pelo GitHub: '+disparo.status);
  return{ok:true,motivo:'Atualização solicitada.',fontes:atrasadas};
}
