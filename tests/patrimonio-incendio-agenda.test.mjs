import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import vm from 'node:vm';
import {vencimentosIncendio,CATEGORIAS_INCENDIO} from '../supabase/functions/_shared/patrimonio-incendio.mjs';
import {incendioAgendaPermitido} from '../supabase/functions/_shared/documentos-agenda.mjs';
function ambiente(perms,linhas=[],falha=false,revogado=false) {
 let handler;const consultas=[];
 const sb={from(tabela){assert.equal(tabela,'painel_registros');const filtros=[];let ini=0,fim=Infinity,selecionado='';
  const resultado=()=>({data:falha?null:linhas.filter(l=>filtros.every(([k,v])=>k==='colecao'?v==='ativo':k==='registro->>tipo'?(Array.isArray(v)?v.includes(l.tipo):l.tipo===v):k==='registro->>categoria'?v.includes(l.categoria):k==='id'?v.includes(l.id):true)).slice(ini,fim+1),error:falha?{message:'Falha sintética'}:null});
  const q={select(campos){selecionado=campos;consultas.push({tabela,campos});return q;},eq(k,v){filtros.push([k,v]);return q;},in(k,v){filtros.push([k,v]);return q;},order(){return q;},range(a,b){ini=a;fim=b;return q;},then(a,b){assert.ok(selecionado);return Promise.resolve(resultado()).then(a,b);}};return q;}};
 const source=readFileSync(new URL('../supabase/functions/painel-agenda/index.ts',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'');
 vm.runInNewContext(transformSync(source,{loader:'ts',target:'es2022',format:'esm'}).code,{Deno:{env:{get:()=> 'teste'},serve:f=>handler=f},createClient:()=>sb,verificarJwt:async()=>({sub:'teste',perms}),crachaRevogado:async()=>revogado,hojeSP:()=> '2026-10-11',vencimentosIncendio,CATEGORIAS_INCENDIO,incendioAgendaPermitido,Request,Response,console:{error(){}}});
 return {consultas,async chamar(corpo={action:'patrimonio',mes:'2026-10'},method='POST'){const r=await handler(new Request('http://test.invalid',{method,headers:{authorization:'Bearer teste'},...(method==='POST'?{body:JSON.stringify(corpo)}:{})}));return {status:r.status,body:await r.json()};}};
}
const item={id:'extintor-teste',tipo:'predial',categoria:'Extintor',nome:'Exemplo',validade:'2026-10-25',numero:'01',valor:91234,nf:'NOTA-PRIVADA'};
test('handler real de agenda fornece vencimentos com consulta mínima e paginada',async()=>{
 const linhas=Array.from({length:501},(_,i)=>({...item,id:`item-${i}`}));
 const a=ambiente(['patrimonio'],linhas);const r=await a.chamar();assert.equal(r.status,200);assert.equal(r.body.eventos.length,501);assert.equal(a.consultas.filter(q=>q.campos.includes('nome:')).length,3);
 assert.doesNotMatch(JSON.stringify(r.body),/91234|NOTA-PRIVADA|"valor"|"nf"/);
 assert.ok(a.consultas.every(q=>!q.campos.includes('valor')&&!q.campos.includes('nf')&&!q.campos.includes('arquivo')));
});
test('sem Patrimônio não lê vencimentos, inclusive usuário só com calendário',async()=>{
 for(const perms of [[],['calendario-empresa'],['seguranca'],['manutencoes']]){const a=ambiente(perms,[item]);assert.equal((await a.chamar()).status,403);assert.equal(a.consultas.length,0);}
 const a=ambiente(['patrimonio'],[item],false,true);assert.equal((await a.chamar()).status,401);assert.equal(a.consultas.length,0);
 assert.equal((await ambiente(['inventario-valores'],[item]).chamar()).status,200);
});
test('agenda é somente leitura, falha não vira zero e mês inválido é recusado',async()=>{
 assert.equal((await ambiente(['patrimonio'],[item],true).chamar()).status,500);
 const a=ambiente(['patrimonio']);assert.equal((await a.chamar({action:'salvar',mes:'2026-10'})).status,400);assert.equal((await a.chamar({action:'patrimonio',mes:'2026-13'})).status,400);assert.equal((await a.chamar({},'GET')).status,405);assert.equal(a.consultas.length,0);
});
