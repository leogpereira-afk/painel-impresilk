// Sonda GET: logs contêm apenas estrutura, tipos e contagens autorizados.
const base=process.env.MUBI_BASE_URL,pub=process.env.MUBI_PUBLIC_KEY,token=process.env.MUBI_TOKEN;
if(!base||!pub||!token)throw new Error('Credenciais ausentes');
const itens=b=>Array.isArray(b)?b:Array.isArray(b?.data)?b.data:[];
function forma(v,n=0){if(v===null)return 'null';if(Array.isArray(v))return {lista:v.length,amostra:v.length?forma(v[0],n+1):null};if(typeof v==='object')return n>3?'objeto':Object.fromEntries(Object.entries(v).map(([k,x])=>[k,forma(x,n+1)]));return typeof v;}
async function get(p,q={}){const u=new URL(`${base.replace(/\/$/,'')}/${pub}/${p}`);for(const[k,v]of Object.entries(q))u.searchParams.set(k,v);const t=Date.now();const r=await fetch(u,{headers:{'Access-Token':token,Accept:'application/json'},signal:AbortSignal.timeout(90000)});if(!r.ok)throw new Error(`HTTP ${r.status}`);const b=await r.json();console.log(JSON.stringify({rota:p.replace(/\/\d+/g,'/{id}'),ms:Date.now()-t,estrutura:forma(b),amostra:itens(b).length,preenchimento:Object.fromEntries([...new Set(itens(b).flatMap(x=>Object.keys(x)))].map(k=>[k,itens(b).filter(x=>x[k]!=null&&x[k]!==''&&(!Array.isArray(x[k])||x[k].length)).length]))}));return b;}
const pg={page:1,per_page:2};
await get('ordem-servico',{...pg,status:'TODOS',filtrodata:'CADASTRO',datainicial:'2026-08-01',datafinal:'2026-09-07'});
for(const p of ['cliente','origem-cliente','classificacao-cliente','usuario/vendedor']){try{await get(p,pg);}catch(e){console.log(JSON.stringify({rota:p,erro:e.name==='TimeoutError'?'timeout':/^HTTP/.test(e.message)?e.message:'falha de conexão'}));}}
const gs=itens(await get('funil-vendas-grupo',pg));
for(const g of gs.slice(0,2)){if(!g.id)continue;const fs=itens(await get(`funil-vendas-fase/grupo/${g.id}`));for(const f of fs.slice(0,2)){if(!f.id)continue;const cards=itens(await get('funil-vendas-card',{...pg,grupo_id:g.id,fase_id:f.id,status:'ATIVO'}));if(cards[0]?.id)await get(`funil-vendas-card/${cards[0].id}`);}}
