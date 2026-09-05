// Exercita o código real da função com banco simulado. Não conecta a sistemas reais.
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
import assert from 'node:assert/strict';
let handler, falha='', semEmpresa=false;
let consultas=[];
const base={
 gestao_empresa:{id:'emp'},gestao_identidade:{missao:'Exemplo'},gestao_valor:[],
 gestao_plano_ano:{id:'plano'},gestao_objetivo:[{id:'obj'}],gestao_indicador:[],
 gestao_tatica:[],gestao_preferencia_ui:[],gestao_ciclo_fechamento:[],gestao_decisao:[],
 gestao_reuniao:[
  {id:'minha',participantes:['Ána Exemplo']},
  {id:'homonima',participantes:['Ana Outra']},
  {id:'abreviado',participantes:['Ana']},
  {id:'usuario',participantes:['ana.exemplo']},
 ],
};
function from(tabela){
 const registro={tabela,campos:'',filtros:[]};consultas.push(registro);
 const query=new Proxy({}, {get(_,metodo){
  if(metodo==='then')return (ok,erro)=>{
   let data=structuredClone(base[tabela]??[]);
   if(tabela==='gestao_empresa'&&semEmpresa)data=null;
   if(tabela==='registros'){
    const colecao=registro.filtros.find(x=>x[0]==='colecao')?.[1];
    data=colecao==='colaboradores'?[{pid:'e',nome:'Equipe Exemplo',statusId:'ativo'}]:[];
   }
   return Promise.resolve({data,error:tabela===falha?{message:'falha simulada'}:null}).then(ok,erro);
  };
  if(['insert','update','delete','upsert'].includes(metodo))throw new Error('O teste de leitura detectou tentativa de gravar');
  return (...args)=>{if(metodo==='select')registro.campos=args[0];if(metodo==='eq')registro.filtros.push(args);return query;};
 }});return query;
}
globalThis.__gestaoBanco={from};
globalThis.Deno={env:{get:()=> 'teste'},serve:fn=>{handler=fn;}};
let source=await readFile(new URL('../supabase/functions/painel-gestao/index.ts',import.meta.url),'utf8');
source=source.replace(/import \{ createClient \} from [^;]+;/,'const createClient=()=>globalThis.__gestaoBanco;');
source=source.replace(/import \{ verificarJwt, crachaRevogado \} from [^;]+;/,`const verificarJwt=async token=>token==='direcao'?{master:true,sub:'direcao'}:token==='gestor'?{nome:'Ana Exemplo',sub:'ana.exemplo',perms:['gestao']} :token==='colaborador'?{sub:'colaborador'}:null; const crachaRevogado=async()=>false;`);
const {code}=await transform(source,{loader:'ts',format:'esm',target:'es2022'});
await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const request=(token,action='tudo')=>new Request('https://teste.invalid',{method:'POST',headers:token?{authorization:`Bearer ${token}`}:{},body:JSON.stringify({action})});
assert.equal((await handler(request())).status,401);assert.equal(consultas.length,0);
const colaborador=await (await handler(request('colaborador'))).json();
assert.equal(colaborador.papel,'colaborador');assert.equal(colaborador.taticas,undefined);
assert.deepEqual([...new Set(consultas.map(x=>x.tabela))].sort(),['gestao_empresa','gestao_identidade','gestao_valor']);
consultas=[];
const gestor=await (await handler(request('gestor'))).json();
assert.deepEqual(gestor.reunioes.map(r=>r.id),['minha','usuario'],'primeiro nome não concede acesso a atas de outra pessoa');
assert.equal((await handler(request('colaborador','salvarTatica'))).status,403);
const diretor=await (await handler(request('direcao'))).json();assert.equal(diretor.reunioes.length,4);
assert.ok(consultas.filter(x=>x.tabela==='registros').every(x=>!['*','registro','id, registro'].includes(x.campos)),'não consulta ficha completa do RH');
const log=console.error;console.error=()=>{};
try{
 for(const tabela of Object.keys(base)){
  falha=tabela;
  assert.equal((await handler(request('direcao'))).status,500,`falha em ${tabela} não pode produzir sucesso vazio`);
 }
 falha='registros';
 const r=await handler(request('direcao'));assert.equal(r.status,200);const d=await r.json();assert.equal(d.avisos.length,1);assert.equal(d.equipe.length,0);
}finally{console.error=log;falha='';}
semEmpresa=true;assert.equal((await handler(request('direcao'))).status,404);
console.log('Gestão: 401, escopo do colaborador, atas por identidade completa, 11 falhas de fonte e equipe degradada conferidos. Nenhuma gravação.');
