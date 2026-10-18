import test from 'node:test';
import assert from 'node:assert/strict';
import { ACM_AREAS, areaForStep, productionInput } from './navigation.mjs';
test('installation preserves every previous operation; Layout 3D is penultimate', () => {
  assert.deepEqual(ACM_AREAS.map(area => area.label), ['Projeto', 'Dobras do ACM', 'Estrutura', 'Planos de corte', 'Parafusos e furos', 'Instalação', 'Layout 3D', 'Documentos']);
  assert.equal(ACM_AREAS.at(-2).id, 'layout');
  for (const step of ['measures','materials','modulation','bends','structure','nesting','metalcut','costs','review','documents','fixing','installation','layout3d']) {
    assert.ok(areaForStep(step).steps.some(([id]) => id === step));
  }
});
test('artwork and product photographs cannot alter production calculation input', () => {
  const project = { revision: 4, front: { width: 1300 }, fixing: { screwProduct: { code: 'TEST', photoDataUrl: 'data:image/png;base64,TEST' } }, visual: { layers: [{ x: 12 }] }, titleBlock: { client: 'Ficticio' } };
  const before = structuredClone(project);
  const input = productionInput(project);
  assert.deepEqual(input, { revision: 4, front: { width: 1300 }, fixing: { screwProduct: { code: 'TEST' } } });
  assert.deepEqual(project, before);
  project.visual.layers[0].x = 800;
  assert.deepEqual(productionInput(project), input);
  project.installation = { space: { width: 10000 }, plate: { width: 4000 }, photos: [{ dataUrl: 'local-photo' }] };
  assert.deepEqual(productionInput(project), input);
});

test('updates reject prototype chains before any mutation and skip inherited objects',async()=>{
 const {setProjectPath}=await import('./navigation.mjs');
 for(const path of ['overrides.__proto__.material.color','constructor.prototype.polluted','a..b']) assert.throws(()=>setProjectPath({},path,true));
 assert.equal(({}).polluted,undefined);assert.equal(({}).material,undefined);
 const inherited={branch:{value:1}},p=Object.create(inherited);setProjectPath(p,'branch.value',2);
 assert.equal(inherited.branch.value,1);assert.equal(p.branch.value,2);
});

test('manufacturing links preserve the exact workspace and reject unknown steps',async()=>{
 const {stepFromLocation}=await import('./navigation.mjs');
 assert.equal(stepFromLocation({hash:'#/ferramenta-ia?ferramenta=acm&acm=metalcut'}),'metalcut');
 assert.equal(stepFromLocation({search:'?ferramenta=acm&acm=fixing'}),'fixing');
 assert.equal(stepFromLocation({hash:'#/ferramenta-ia?acm=invalid'}),'measures');
});

test('finish legacy URL opens unified measures; project has five persistent blocks', async()=>{ const {stepFromLocation}=await import('./navigation.mjs'); assert.equal(stepFromLocation({search:'?acm=finish'}),'measures'); assert.equal(stepFromLocation({}),'measures'); assert.deepEqual(ACM_AREAS[0].steps.map(([id])=>id),['measures','materials','modulation','costs','review']); assert.equal(areaForStep('finish').id,'project'); });
