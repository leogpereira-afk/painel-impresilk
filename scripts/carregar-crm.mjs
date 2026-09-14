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
 }catch(e){
  falhas++;
  /* A CAUSA VAI JUNTO. Este `catch` era sem parâmetro -- ele descartava o erro e
     imprimia só "não foi possível concluir". O freio funcionava (a cópia boa fica
     preservada), mas o log não dizia POR QUÊ, e descobrir exigia ir ao banco
     conferir o que tinha sido gravado e a que horas. Duas execuções seguidas
     falharam em 14/09/2026 sem deixar uma linha aproveitável.

     Só `e.message`, nunca o erro inteiro nem a pilha: a `MUBI_PUBLIC_KEY` viaja
     no CAMINHO da URL, e o log do Actions é público neste repositório. As
     mensagens do cliente do ERP citam o recurso ("funil-vendas-grupo"), não a
     URL montada -- conferido antes de abrir isto. Do `cause` sai só o CÓDIGO
     (ECONNREFUSED, ENOTFOUND, UND_ERR_CONNECT_TIMEOUT): é constante, não carrega
     host nem caminho, e é o que separa "o ERP recusou" de "o guarda barrou". */
  const codigo = e?.cause?.code ? ` (${e.cause.code})` : '';
  console.error(`${chave}: não foi possível concluir; cópia anterior preservada — causa: ${e?.message ?? e}${codigo}`);
 }
}
if(falhas)process.exitCode=1;
