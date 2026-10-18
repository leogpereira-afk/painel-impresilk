import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createProject} from '../../lib/acm/model.mjs';
import {buildProject} from '../../lib/acm/engine.mjs';
import {documentGeometry} from '../../lib/acm/documents.mjs';
import {resolveFixing} from '../../../supabase/functions/_shared/acm-fixing.mjs';

const require=createRequire(import.meta.url);
const entry=fileURLToPath(new URL('./FixingEditor.jsx',import.meta.url));
// Control only the editor's scope hooks. JSX, event handlers and model/document helpers are real.
const bundle=await build({
  entryPoints:[entry],bundle:true,write:false,format:'esm',platform:'node',jsx:'automatic',loader:{'.css':'empty'},
  plugins:[{name:'editor-events',setup(builder){
    builder.onResolve({filter:/^react$/},args=>args.importer===entry?{path:'editor-hooks',namespace:'test-fixing'}:undefined);
    builder.onLoad({filter:/.*/,namespace:'test-fixing'},()=>({contents:'export function useState(initial){const queue=globalThis.__acmFixingEditorState;return [queue.length?queue.shift():typeof initial==="function"?initial():initial,()=>{}]}',loader:'js'}));
    builder.onResolve({filter:/^react(?:\/.*)?$/},args=>({path:pathToFileURL(require.resolve(args.path)).href,external:true}));
  }}],
});
const directory=await mkdtemp(join(tmpdir(),'acm-fixing-editor-test-'));
let FixingEditor;
try{
  const path=join(directory,'editor.mjs');
  await writeFile(path,bundle.outputFiles[0].text);
  ({default:FixingEditor}=await import(pathToFileURL(path).href));
}finally{
  await rm(directory,{recursive:true,force:true});
}

function find(element,predicate){
  if(Array.isArray(element)){for(const child of element){const found=find(child,predicate);if(found)return found;}return null;}
  if(!element||typeof element!=='object')return null;
  return predicate(element)?element:find(element.props?.children,predicate);
}
function fixture(){
  const project=createProject();
  project.front={width:800,height:300};
  project.layout.maxWidth=400;
  project.fixing={...project.fixing,type:'screws',validated:true,pattern:{surface:'flange',source:'Ficha sintética',responsible:'Responsável fictício',validatedAt:'2026-01-01',maxPitch:200}};
  const result=buildProject(project);
  assert.equal(result.valid,true,JSON.stringify(result.errors));
  assert.ok(result.pieces.length>1,'The fixture must exercise scoped edits on a multi-piece face');
  const pieceId=result.pieces[0].id;
  project.overrides[pieceId]={fixing:{pattern:{constraints:'Restrição fictícia preservada'},screwProduct:{coating:'Proteção fictícia'}}};
  project.overrides['outra-peca-sintetica']={locked:false,fixing:{product:'Produto que deve permanecer'}};
  return {project,pieceId};
}
function renderEditor(project,pieceId,scope){
  const result=buildProject(project);
  assert.equal(result.valid,true,JSON.stringify(result.errors));
  const before=structuredClone(project),updates=[];
  globalThis.__acmFixingEditorState=[scope,'front'];
  let tree;
  try{tree=FixingEditor({project,result,selectedId:pieceId,update:(path,value)=>updates.push({path,value})});}
  finally{delete globalThis.__acmFixingEditorState;}
  assert.deepEqual(project,before,'Opening the editor must not normalize or change project data');
  return {tree,updates};
}
function apply(project,updates){
  assert.equal(updates.length,1,'An explicit edit must be one atomic project update');
  assert.ok(['fixing','overrides'].includes(updates[0].path));
  return {...structuredClone(project),[updates[0].path]:updates[0].value};
}
function typeSelect(tree){
  const select=find(tree,node=>node.props?.label==='Sistema de fixação'&&typeof node.props.onChange==='function');
  assert.ok(select);
  assert.deepEqual(select.props.options.map(option=>option.value),['tape','screws','hybrid']);
  return select;
}

for(const scope of ['all','piece','surface']){
  test(`selected fixing type is a no-op and a real change invalidates signoff (${scope})`,()=>{
    const {project,pieceId}=fixture(),before=structuredClone(project);
    assert.equal(resolveFixing(project,{id:pieceId}).validated,true);
    const {tree,updates}=renderEditor(project,pieceId,scope);
    const selected=typeSelect(tree);
    assert.equal(selected.props.value,'screws');
    selected.props.onChange('screws');
    assert.equal(updates.length,0,'The selected choice must not create an undo step or invalidate signoff');
    assert.equal(resolveFixing(project,{id:pieceId}).validated,true);
    assert.deepEqual(project,before);
    selected.props.onChange('hybrid');
    const next=apply(project,updates),effective=resolveFixing(next,{id:pieceId});
    assert.equal(effective.type,'hybrid');assert.equal(effective.validated,false);
    assert.deepEqual(next.overrides['outra-peca-sintetica'],before.overrides['outra-peca-sintetica']);
    assert.equal(effective.pattern.constraints,'Restrição fictícia preservada');
    assert.deepEqual(project,before,'Handlers must send updates without mutating the rendered project');
  });

  test(`legacy diameter loads as 6, changes to 8 and clears without reviving fallback (${scope})`,()=>{
    let {project,pieceId}=fixture();
    project.fixing.drillDiameter=6;
    project.fixing.screwProduct={code:'PARAFUSO-SINTETICO',manufacturer:'Fornecedor fictício',washer:'Arruela fictícia'};
    const original=structuredClone(project);
    for(const [expected,nextDiameter] of [[6,8],[8,null]]){
      const initial=buildProject(project),initialHoles=documentGeometry(initial.pieces[0]).drills;
      assert.ok(initialHoles.length>0);assert.ok(initialHoles.every(hole=>hole.diameter===expected));
      const before=structuredClone(project),{tree,updates}=renderEditor(project,pieceId,scope);
      const input=find(tree,node=>node.props?.label==='Diâmetro do furo');
      assert.ok(input);assert.equal(input.props.value,expected);
      const product=find(tree,node=>node.props?.kind==='screwProduct'&&typeof node.props.change==='function');
      assert.ok(product);assert.equal(product.props.product.drillDiameter,expected);
      input.props.onChange(nextDiameter);
      assert.deepEqual(project,before);
      project=apply(project,updates);
      const built=buildProject(project);assert.equal(built.valid,true,JSON.stringify(built.errors));
      const effective=resolveFixing(project,{id:pieceId}),holes=documentGeometry(built.pieces[0]).drills;
      assert.equal(effective.drillDiameter,nextDiameter);
      assert.ok(holes.length>0);assert.ok(holes.every(hole=>hole.diameter===nextDiameter));
      for(const candidate of built.pieces){const expectedDiameter=scope==='piece'&&candidate.id!==pieceId?6:nextDiameter;assert.ok(documentGeometry(candidate).drills.every(hole=>hole.diameter===expectedDiameter),'Face edits must reach every face piece; piece edits must leave other pieces unchanged');}
      assert.equal(effective.screwProduct.code,'PARAFUSO-SINTETICO');
      assert.equal(effective.screwProduct.manufacturer,'Fornecedor fictício');
      assert.equal(effective.screwProduct.washer,'Arruela fictícia');
      assert.equal(effective.screwProduct.coating,'Proteção fictícia');
      assert.equal(effective.pattern.constraints,'Restrição fictícia preservada');
      assert.equal(effective.validated,false);
      assert.deepEqual(project.overrides['outra-peca-sintetica'],original.overrides['outra-peca-sintetica']);
      if(scope==='all'){
        assert.equal(project.fixing.drillDiameter,null);
        assert.deepEqual(project.overrides,original.overrides);
      }else{
        assert.equal(project.overrides[pieceId].fixing.drillDiameter,null);
        assert.deepEqual(project.fixing,original.fixing,'Scoped edits must preserve the base fixing/product');
      }
    }
  });
}
