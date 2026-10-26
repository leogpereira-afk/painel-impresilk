import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import * as norm from '../supabase/functions/_shared/inteligencia-normalizacao.mjs';
const srcImportacao=transformSync(readFileSync(new URL('../supabase/functions/_shared/inteligencia-importacao.mjs',import.meta.url),'utf8'),{format:'cjs'}).code;
const src=transformSync(readFileSync(new URL('../supabase/functions/painel-inteligencia/index.ts',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,''),{loader:'ts',format:'esm'}).code;
function ambiente(fonte='nfe',auth='machine',hoje='2026-10-25T12:00:00Z',nfe=null){
 let handler,estado={fonte,desde:'2026-09-01',ate:'2026-09-30',corte:'2026-09-30',pagina:1,itens:[],situacao:'andamento'},saved=null;const urls=[];
 class Clock extends Date {constructor(...a){super(...(a.length?a:[hoje]))}static now(){return Date.parse(hoje)}}
 // O helper real e o handler precisam compartilhar o relógio da fixture.
 // Importá-lo no host deixa seus parâmetros padrão Date presos ao dia da execução.
 const modulo={exports:{}};vm.runInNewContext(srcImportacao,{module:modulo,exports:modulo.exports,Date:Clock});const imp=modulo.exports;
 const sb={from(tabela){return {select(){return this},eq(){return this},maybeSingle:async()=>({data:tabela==='painel_cache'?{valor:nfe}:{estado}})}},rpc:async(n,a)=>{if(n==='inteligencia_iniciar'){estado=a.p_estado;return {data:estado}}if(n==='inteligencia_reservar')return {data:{estado,trava:'fake'}};saved=a.p_snapshot;estado=a.p_estado;return {data:estado}}};
 const fetch=async u=>{urls.push(new URL(u));return new Response(JSON.stringify({data:[],pagination:{current_page:1,last_page:1,total:0}}));};
 vm.runInNewContext(src,{...imp,...norm,Date:Clock,createClient:()=>sb,verificarJwt:async()=>auth==='restricted'?{sub:'x',master:false,exp:9999999999}:null,crachaRevogado:async()=>false,Deno:{env:{get:k=>({PAINEL_TOKEN:'test',PAINEL_JWT_SECRET:'fake',MUBI_PUBLIC_KEY:'fake',MUBI_TOKEN:'fake'}[k])},serve:f=>handler=f},fetch,URL,Response,Request,AbortSignal,setTimeout});
 return {urls,get saved(){return saved},get estado(){return estado},async call(body){const r=await handler(new Request('https://example.invalid',{method:'POST',headers:auth==='machine'?{'x-token':'test'}:{authorization:'Bearer fake'},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()}}};
}
for(const fonte of ['nfe','compras','detalhes'])test(`último dia incluído na consulta ${fonte}`,async()=>{const a=ambiente(fonte);const r=await a.call({action:'avancar'});assert.equal(r.status,200);assert.equal(a.urls[0].searchParams.get('datafinal'),'2026-10-01');});
test('mês atual registra corte real sem declarar fechamento',async()=>{const a=ambiente();assert.equal((await a.call({action:'iniciar',fonte:'nfe',desde:'2026-10-01',ate:'2026-10-31'})).status,200);assert.equal(a.estado.corte,'2026-10-25');await a.call({action:'avancar'});assert.equal(a.urls[0].searchParams.get('datafinal'),'2026-10-26');assert.equal(a.saved.corte,'2026-10-25');assert.equal(a.saved.ate,'2026-10-31');});
test('mês futuro recusado sem começar carga',async()=>{const a=ambiente();assert.equal((await a.call({action:'iniciar',fonte:'nfe',desde:'2026-11-01',ate:'2026-11-30'})).status,400);});
test('perfil sem Direção não consulta nem grava',async()=>{const a=ambiente('nfe','restricted');assert.equal((await a.call({action:'status'})).status,403);assert.equal((await a.call({action:'iniciar',fonte:'nfe',desde:'2026-09-01',ate:'2026-09-30'})).status,403);assert.equal(a.urls.length,0)});

test('detalhes recusam NF-e de outro corte, sem misturar as fontes',async()=>{const a=ambiente('nfe','machine','2026-10-25T12:00:00Z',{completo:true,desde:'2026-10-01',ate:'2026-10-31',corte:'2026-10-24',itens:[]});const r=await a.call({action:'iniciar',fonte:'detalhes',desde:'2026-10-01',ate:'2026-10-31'});assert.equal(r.status,409);});
