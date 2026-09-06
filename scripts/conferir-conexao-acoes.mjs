// Só nomes de campos, contagens e HTTP; jamais imprimir o corpo original ou credenciais.
const token=process.env.PAINEL_TOKEN;if(!token)throw new Error('Segredo da carga ausente');
const r=await fetch('https://heveemylixartyijxewh.supabase.co/functions/v1/painel-crm',{method:'POST',headers:{'content-type':'application/json','x-token':token},body:JSON.stringify({action:'diagnostico'}),signal:AbortSignal.timeout(110000)});
if(!r.ok)throw new Error(`Diagnóstico indisponível (HTTP ${r.status})`);
const b=await r.json();console.log(JSON.stringify({configurado:b.configurado,consultas:(b.consultas||[]).map(c=>({rota:c.rota,status:c.status,contagem:c.contagem,campos:c.campos}))}));
if(!b.configurado||(b.consultas||[]).some(c=>typeof c.status!=='number'||c.status<200||c.status>=300))throw new Error('A conexão ainda não está pronta para as ações.');
