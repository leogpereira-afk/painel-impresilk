import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import vm from 'node:vm';
import {prepararConferencia} from '../supabase/functions/_shared/patrimonio-fisico.mjs';
const fonte=readFileSync(new URL('../supabase/functions/painel-config/index.ts',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'');
const codigo=transformSync(fonte,{loader:'ts',format:'esm',target:'es2022'}).code;
function ambiente(perms=['seguranca']){
 let handler;const linhas=[{colecao:'ativo',id:'cam1',registro:{tipo:'seguranca',categoria:'Câmera',especificacao:{situacao:'uso'}}},{colecao:'ativo',id:'cam2',registro:{tipo:'seguranca',categoria:'Câmera',especificacao:{situacao:'baixado'}}}];
 const cfg={parametros:{patrimonioLimiteManutencaoPercentual:35,senha:'não expor'}};
 const sb={from(tabela){const filtros=[];let inicio=0,fim=Infinity;const q={select(){return q},eq(k,v){filtros.push([k,v]);return q},order(){return q},range(a,b){inicio=a;fim=b;return q},async maybeSingle(){if(tabela==='painel_config_global')return {data:{config:cfg},error:null};return {data:linhas.find(r=>filtros.every(([k,v])=>(k.startsWith('registro->>')?r.registro[k.slice(11)]:r[k])===v))||null,error:null}},then(ok){return Promise.resolve({data:linhas.filter(r=>filtros.every(([k,v])=>(k.startsWith('registro->>')?r.registro[k.slice(11)]:r[k])===v)).slice(inicio,fim+1),error:null}).then(ok)},async insert(x){if(linhas.some(r=>r.colecao===x.colecao&&r.id===x.id))return {error:{code:'23505'}};linhas.push(x);return {error:null}}};return q}};
 const sessao={sub:'ana',nome:'Ana',perms};vm.runInNewContext(codigo,{prepararConferencia,gestorComercial:()=>false,contextoComercial:async()=>({orcamentos:[]}),inventarioPermitido:x=>x,prepararControle:()=>{},carimbarPatrimonio:()=>{},validarVinculoPessoa:()=>{},prepararPessoasControle:()=>{},lerPessoasPatrimonio:async()=>[],Deno:{env:{get:k=>k==='PAINEL_JWT_SECRET'?'teste':undefined},serve:f=>handler=f},createClient:()=>sb,verificarJwt:async()=>sessao,crachaRevogado:async()=>false,Request,Response,console:{error(){}}});
 return {linhas,async chamar(body){const resp=await handler(new Request('http://teste',{method:'POST',headers:{authorization:'Bearer teste'},body:JSON.stringify(body)}));return {status:resp.status,body:await resp.json()}}};
}
test('handler configura limite via projeção e checklist exige cobertura da câmera ativa',async()=>{
 const a=ambiente();let r=await a.chamar({action:'patrimonioParametros'});assert.equal(r.status,200);assert.deepEqual(JSON.parse(JSON.stringify(r.body)),{ok:true,limiteManutencaoPercentual:35});
 const id='42dd7ff2-8065-4d48-b393-b7d2e1f1f7e1';r=await a.chamar({action:'salvarConferencia',id,dados:{data:'2026-10-11',itens:[]}});assert.equal(r.status,422);
 r=await a.chamar({action:'salvarConferencia',id,dados:{data:'2026-10-11',itens:[{cameraId:'cam1',status:'gravando'}],criadoPor:'falso'}});assert.equal(r.status,422);
 r=await a.chamar({action:'salvarConferencia',id,dados:{data:'2026-10-11',itens:[{cameraId:'cam1',status:'gravando'}]}});assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.item.criadoPor,'ana');
 assert.equal((await a.chamar({action:'salvarConferencia',id,dados:{data:'2026-10-11',itens:[{cameraId:'cam1',status:'sem-imagem'}]}})).status,409);
 r=await a.chamar({action:'lerConferencias'});assert.equal(r.status,200);assert.equal(r.body.itens[id].itens[0].status,'gravando');
});
test('sem Segurança não lê nem salva checklist',async()=>{const a=ambiente(['patrimonio']);assert.equal((await a.chamar({action:'lerConferencias'})).status,403);assert.equal((await a.chamar({action:'salvarConferencia',id:'42dd7ff2-8065-4d48-b393-b7d2e1f1f7e1',dados:{}})).status,403)});
