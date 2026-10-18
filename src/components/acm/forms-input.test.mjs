import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const require=createRequire(import.meta.url);
const bundle=await build({entryPoints:[fileURLToPath(new URL('./ACMForms.jsx',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node',jsx:'automatic',plugins:[{name:'field-events',setup(b){
 b.onResolve({filter:/^react$/},()=>({path:'controlled-hooks',namespace:'test-field'}));
 b.onLoad({filter:/.*/,namespace:'test-field'},()=>({contents:'export const useEffect=()=>{}; export const useId=()=>"field"; export const useState=initial=>[globalThis.__acmInputQueue.shift()??initial,()=>{}];',loader:'js'}));
 b.onResolve({filter:/^react\/.*/},a=>({path:pathToFileURL(require.resolve(a.path)).href,external:true}));
}}]});
const dir=await mkdtemp(join(tmpdir(),'acm-field-test-'));let Field;
try{const path=join(dir,'field.mjs');await writeFile(path,bundle.outputFiles[0].text);({Field}=await import(pathToFileURL(path).href));}finally{await rm(dir,{recursive:true,force:true});}
function input(text,props={}){globalThis.__acmInputQueue=[text,''];const changes=[];const tree=Field({label:'Medida',value:90,onChange:v=>changes.push(v),...props});return {element:tree.props.children.find(c=>c?.type==='input'),changes};}
test('Enter confirma a medida uma vez: um único passo para Desfazer',()=>{
 const {element,changes}=input('85');let prevented=false;
 element.props.onKeyDown({key:'Enter',preventDefault(){prevented=true},currentTarget:{blur(){element.props.onBlur()}}});
 assert.equal(prevented,true);assert.deepEqual(changes,[85]);
});
test('sair do campo mantém vírgula decimal, vazio opcional e validação',()=>{
 for(const [text,props,expected] of [['12,5',{},[12.5]],['',{},[null]],['',{required:true},[]],['-2',{},[]],['90',{},[]]]){
  const {element,changes}=input(text,props);element.props.onBlur();assert.deepEqual(changes,expected);
 }
});
