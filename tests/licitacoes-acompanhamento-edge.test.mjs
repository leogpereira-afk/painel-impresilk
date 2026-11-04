import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {transformSync} from 'esbuild';
import * as acesso from '../supabase/functions/_shared/patrimonio-acesso.mjs';
import * as agenda from '../supabase/functions/_shared/licitacoes-agenda.mjs';
import * as documentos from '../supabase/functions/_shared/documentos.mjs';

const codigo=transformSync(readFileSync(new URL('../supabase/functions/painel-ativos/index.ts',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,''),{loader:'ts',format:'esm',target:'es2022'}).code;
const inicial={id:'edital-ficticio',tipo:'licitacao',nome:'Edital fictício',status:'avaliar',responsavel:'Equipe fictícia',validade:'2026-11-20',atualizadoEm:'2026-11-01T10:00:00.000Z',campoFuturo:{manter:true},acompanhamento:{proximaAcao:'Revisar',prazoAcao:'2026-11-04',checklist:[{id:'doc',texto:'Conferir documento',feito:false}],decisao:'',resultado:'',valorContratado:0,campoFuturo:'preservar'}};
function ambiente({uploadFalha=false,rpcFalha=false,respostaPerdida=false,revogarAoEnviar=false}={}){
 let handler,revogado=false;const registros=new Map([[inicial.id,structuredClone(inicial)]]),arquivos=new Map([[inicial.id,new Uint8Array([1,2,3])]]),uploads=[];
 const sb={from(){const filtros=[];const resultado=()=>({error:null,data:[...registros.values()].map(registro=>({id:registro.id,colecao:'ativo',registro})).filter(r=>filtros.every(([k,v])=>r[k]===v))});const q={select(){return q;},eq(k,v){filtros.push([k,v]);return q;},order(){return q;},range(){return q;},maybeSingle:async()=>({...resultado(),data:resultado().data[0]??null}),then:(a,b)=>Promise.resolve(resultado()).then(a,b),upsert:async()=>({error:{message:'metadados recusados'}})};return q;},
 async rpc(nome,args){assert.equal(nome,'painel_registro_gravar');const atual=registros.get(args.p_id)||null;if(rpcFalha)return {error:{code:'40001',message:'concorrência'}};if(JSON.stringify(atual)!==JSON.stringify(args.p_anterior))return {error:{code:'40001',message:'conflito'}};registros.set(args.p_id,structuredClone(args.p_registro));if(respostaPerdida)throw new Error('Resposta perdida após commit');return {error:null,data:structuredClone(args.p_registro)};},
 storage:{from(){return {async upload(chave,bytes,opcoes){uploads.push({chave,opcoes});if(uploadFalha)return {error:{message:'upload recusado'}};arquivos.set(chave,new Uint8Array(bytes));if(revogarAoEnviar)revogado=true;return {error:null};},async download(chave){const bytes=arquivos.get(chave);return bytes?{data:{type:'application/pdf',arrayBuffer:async()=>bytes.buffer},error:null}:{error:{message:'ausente'}};},async remove(){assert.fail('Não remover bytes quando o commit é incerto');}};}}};
 vm.runInNewContext(codigo,{...acesso,...agenda,...documentos,Deno:{env:{get:()=>'teste'},serve:fn=>handler=fn},createClient:()=>sb,verificarJwt:async()=>({sub:'pessoa-ficticia',perms:['licitacoes','calendario-empresa']}),crachaRevogado:async()=>revogado,Response,Request,crypto,atob,btoa,Uint8Array,console:{error(){}}});
 return {registros,arquivos,uploads,async chamar(corpo){const r=await handler(new Request('https://teste.invalid',{method:'POST',headers:{authorization:'Bearer teste','content-type':'application/json'},body:JSON.stringify(corpo)}));return {status:r.status,body:await r.json()};}};
}
const salvar=(a,item,arquivo)=>a.chamar({action:'salvar',item,versao:item.atualizadoEm,arquivo});
const arquivo={base64:'BAUG',mime:'application/pdf',nome:'novo.pdf'};
test('duas fichas abertas: a segunda não desfaz decisão/checklist da primeira; campos futuros permanecem',async()=>{
 const a=ambiente(),abaA=structuredClone(inicial),abaB=structuredClone(inicial);abaA.acompanhamento.checklist[0].feito=true;abaA.acompanhamento.decisao='Conferido';
 const r=await salvar(a,abaA);assert.equal(r.status,200);assert.deepEqual(r.body.item.campoFuturo,{manter:true});assert.equal(r.body.item.acompanhamento.campoFuturo,'preservar');
 abaB.responsavel='Equipe B';assert.equal((await salvar(a,abaB)).status,409);assert.equal(a.registros.get(inicial.id).acompanhamento.checklist[0].feito,true);
 assert.equal((await a.chamar({action:'salvar',item:inicial})).status,409);
});
test('limites de preparação recusam sem truncar e sem gravar',async()=>{
 for(const [campo,texto] of [['proximaAcao','x'.repeat(501)],['decisao','x'.repeat(2001)],['resultado','x'.repeat(2001)],['checklist',[{id:'c',texto:'x'.repeat(301),feito:false}]]]){const a=ambiente(),item=structuredClone(inicial);item.acompanhamento[campo]=texto;const r=await salvar(a,item);assert.equal(r.status,422,campo);assert.deepEqual(a.registros.get(inicial.id),inicial);}
});
test('anexo só é anunciado junto do commit e preserva bytes e ponteiro anterior',async()=>{
 const a=ambiente();a.registros.get(inicial.id).temArquivo=true;a.registros.get(inicial.id).arquivoNome='anterior.pdf';const item=structuredClone(a.registros.get(inicial.id));
 const r=await salvar(a,item,arquivo);assert.equal(r.status,200);assert.equal(r.body.item.arquivoNome,'novo.pdf');assert.equal(r.body.item.temArquivo,true);assert.notEqual(r.body.item.arquivoEdital.chave,inicial.id);assert.equal(a.uploads[0].opcoes.upsert,false);assert.deepEqual([...a.arquivos.get(inicial.id)],[1,2,3]);assert.equal(r.body.item.arquivosEdital[0].chave,inicial.id);
 const l=await a.chamar({action:'lerArquivo',id:inicial.id});assert.equal(l.status,200);assert.equal(l.body.base64,arquivo.base64);assert.equal(l.body.nome,'novo.pdf');
 const anterior=await a.chamar({action:'lerArquivo',id:inicial.id,arquivoId:'legado'});assert.equal(anterior.status,200);assert.equal(anterior.body.base64,'AQID');assert.equal(anterior.body.nome,'anterior.pdf');
 assert.equal((await a.chamar({action:'lerArquivo',id:inicial.id,arquivoId:'caminho-de-outro-documento'})).status,404);
});
test('falha de upload ou CAS mantém ficha anterior; resposta perdida não apaga arquivo confirmado',async()=>{
 for(const opcoes of [{uploadFalha:true},{rpcFalha:true},{respostaPerdida:true}]){const a=ambiente(opcoes),r=await salvar(a,structuredClone(inicial),arquivo);assert.ok(r.status>=400);assert.equal(a.uploads.length,1);assert.deepEqual([...a.arquivos.get(inicial.id)],[1,2,3]);if(opcoes.respostaPerdida){const salvo=a.registros.get(inicial.id);assert.equal(salvo.arquivoNome,'novo.pdf');assert.ok(a.arquivos.has(salvo.arquivoEdital.chave));}else assert.deepEqual(a.registros.get(inicial.id),inicial);}
});
test('anexo avulso exige versão e revogação após upload impede o commit',async()=>{
 const a=ambiente();assert.equal((await a.chamar({action:'guardarArquivo',id:inicial.id,...arquivo})).status,409);assert.equal(a.uploads.length,0);
 const b=ambiente({revogarAoEnviar:true});assert.equal((await salvar(b,structuredClone(inicial),arquivo)).status,401);assert.deepEqual(b.registros.get(inicial.id),inicial);
});
