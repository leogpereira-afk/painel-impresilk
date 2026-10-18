import test from 'node:test';
import assert from 'node:assert/strict';
import { ACM_AREAS, areaForStep, productionInput } from './navigation.mjs';
test('installation preserves every previous operation; Layout 3D is penultimate', () => {
  assert.deepEqual(ACM_AREAS.map(area => area.label), ['Projeto', 'Estrutura', 'Corte ACM', 'Fixações', 'Instalação', 'Layout 3D', 'Documentos']);
  assert.equal(ACM_AREAS.at(-2).id, 'layout');
  for (const step of ['measures','materials','modulation','bends','structure','nesting','costs','review','documents','fixing','installation','layout3d']) {
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
