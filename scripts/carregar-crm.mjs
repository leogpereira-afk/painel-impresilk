import {mubiGetTudo,mubiConfigurado} from '../netlify/functions/lib/mubi.js';
import {carregarClientes,carregarFunil} from './lib/crm-mubi.mjs';
if(!mubiConfigurado()||!process.env.PAINEL_TOKEN)throw new Error('Integração não configurada');
const url='https://heveemylixartyijxewh.supabase.co/functions/v1/painel-cache';
let falhas=0;
for(const [chave,carregar] of [['crm_clientes',carregarClientes],['crm_funil',carregarFunil]]){
 if(chave==='crm_clientes'&&process.env.CRM_SOMENTE_FUNIL==='true')continue;
 try{
  const valor=await carregar(mubiGetTudo);
  const resp=await fetch(url,{method:'POST',headers:{'content-type':'application/json','x-token':process.env.PAINEL_TOKEN},body:JSON.stringify({chave,valor}),signal:AbortSignal.timeout(120000)});
  const b=await resp.json();if(!resp.ok||b.pulou)throw new Error('Gravação não confirmada');
  console.log(`${chave}: cópia atualizada com sucesso`);
 }catch{falhas++;console.error(`${chave}: não foi possível concluir; cópia anterior preservada`);}
}
if(falhas)process.exitCode=1;
