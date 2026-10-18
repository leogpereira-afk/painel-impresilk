import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'esbuild';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createProject} from '../../lib/acm/model.mjs';
import {buildProject} from '../../lib/acm/engine.mjs';
import {nestPieces} from '../../lib/acm/nesting.mjs';
import {projectReportHTML} from '../../lib/acm/documents.mjs';
const require=createRequire(import.meta.url);
const bundled=await build({entryPoints:[fileURLToPath(new URL('./ACMViewport.jsx',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node',jsx:'automatic',loader:{'.css':'empty'},plugins:[{name:'react-runtime',setup(b){b.onResolve({filter:/^react(?:\/.*)?$/},a=>({path:pathToFileURL(require.resolve(a.path)).href,external:true}));}}]});
const temp=await mkdtemp(join(tmpdir(),'acm-fallback-test-'));let SceneFallback;
try{const path=join(temp,'viewport.mjs');await writeFile(path,bundled.outputFiles[0].text);({SceneFallback}=await import(pathToFileURL(path).href));}finally{await rm(temp,{recursive:true,force:true});}
function fixture(){const project=createProject();project.technicalDrawing={version:1,name:'SVG geométrico',unit:'mm',tolerance:.1,parts:[{id:'P',width:100,height:80,contour:[[0,0],[100,0],[100,40],[50,40],[50,80],[0,80]],holes:[{x:20,y:20,diameter:10}],grooves:[{x1:5,y1:35,x2:40,y2:35}],quantity:1}]};const result=buildProject(project);assert.equal(result.valid,true,JSON.stringify(result.errors));return{project,result};}
test('WebGL fallback retains imported hole and machining groove in assembled and unfolded views',()=>{
 const {project,result}=fixture();for(const mode of ['assembled','unfolded']){const html=renderToStaticMarkup(createElement(SceneFallback,{project,result,mode,selectedId:result.pieces[0].id}));assert.match(html,/<circle[^>]*cx="20"[^>]*cy="20"[^>]*r="5"/);assert.match(html,/<line[^>]*x1="5"[^>]*y1="35"[^>]*x2="40"/);assert.match(html,/100,40 50,40 50,80/);}
});
test('WebGL fallback retains explicit internal cutouts of an unfolded piece',()=>{
 const {project,result}=fixture();result.pieces[0].blank.cutouts=[{x:30,y:5,width:10,height:10}];const html=renderToStaticMarkup(createElement(SceneFallback,{project,result,mode:'unfolded',selectedId:result.pieces[0].id}));assert.match(html,/30,5 40,5 40,15 30,15/);
});
test('router sheet page keeps the same blue specified hole as its piece, mirrored exactly once',()=>{
 const {project,result}=fixture(),nesting=nestPieces(result.pieces,project.stock,project.fabrication),html=projectReportHTML(project,result,nesting,{discipline:'router'});
 const section=html.split('<h1>CH1 ·')[1]?.split('</section>')[0];assert.ok(section);assert.match(section,/<circle[^>]*cx="80"[^>]*cy="20"[^>]*r="5"/);assert.match(section,/stroke="#0000ff"/);
});
