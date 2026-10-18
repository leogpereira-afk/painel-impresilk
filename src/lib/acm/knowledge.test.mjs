import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, calibrationSignature } from './model.mjs';
import { buildProject } from './engine.mjs';
import { TECHNICAL_SOURCES, TECHNICAL_GUIDANCE, machiningLayerEvidence, projectKnowledgeChecks } from './knowledge.mjs';

const check = (project, id, result) => projectKnowledgeChecks(project, result).find(item => item.id === id);

test('sobra total includes the front skin and does not rename it residual core', () => {
  const evidence = machiningLayerEvidence({ thickness: 3, skin: .3 }, { depth: 2.5, remainingCore: .2 });
  assert.equal(evidence.remainingThickness, .5);
  assert.equal(evidence.frontSkin, .3);
  assert.equal(evidence.residualCore, .2);
  assert.ok(Math.abs(evidence.residualCore + evidence.frontSkin - evidence.remainingThickness) < 1e-9);
});

test('unknown machining values stay unknown while a deliberately zero residual stays zero', () => {
  assert.deepEqual(machiningLayerEvidence({ thickness: 3 }, {}), { remainingThickness: null, residualCore: null, frontSkin: null });
  assert.equal(machiningLayerEvidence({ thickness: 3, skin: .3 }, { depth: 3 }).remainingThickness, null);
  assert.equal(machiningLayerEvidence({ thickness: 3, skin: .3 }, { depth: 2.7, remainingCore: 0 }).residualCore, 0);
});

test('supplier-specific tape dimensions never become a global minimum or change project data', () => {
  const p = createProject(), before = structuredClone(p);
  assert.equal(check(p, 'tape').status, 'review');
  assert.deepEqual(p, before);
  p.material.manufacturer = 'Alucomaxx';
  assert.equal(check(p, 'tape').status, 'attention');
  p.material.manufacturer = 'Outro fornecedor';
  assert.equal(check(p, 'tape').status, 'review');
  assert.equal(p.fixing.tapeWidth, before.fixing.tapeWidth);
  assert.equal(p.fixing.thickness, before.fixing.thickness);
});

test('soffit tape warning respects effective per-piece override rather than assuming global tape applies', () => {
  const p = createProject(); p.soffit.enabled = true;
  const result = { pieces: [{ id: 'front-test', surface: 'front', material: p.material }, { id: 'soffit-test', surface: 'soffit', material: p.material }] };
  assert.equal(check(p, 'tape', result).status, 'attention');
  p.overrides['soffit-test'] = { fixing: { type: 'screws' } };
  assert.equal(check(p, 'tape', result).status, 'review');
  p.overrides['front-test'] = { fixing: { type: 'screws' } };
  assert.equal(check(p, 'tape', result), undefined);
});

test('nominal screw diameter never supplies a drilling diameter in the evidence checklist', () => {
  const p = createProject(); p.fixing.type = 'screws'; p.fixing.screwProduct = { nominalDiameter: 4.2 };
  assert.equal(check(p, 'screws').status, 'missing');
  assert.match(check(p, 'screws').detail, /sem Ø/);
  p.fixing.screwProduct.drillDiameter = 5;
  assert.equal(check(p, 'screws').status, 'missing');
  p.fixing.pattern = { source: 'Ficha sintética de teste', responsible: 'Responsável fictício', validatedAt: '2026-01-01' };
  assert.equal(check(p, 'screws').status, 'recorded');
  assert.match(check(p, 'screws').detail, /Conferir/);
});

test('calibration record does not clear structure, joints, installation or geometry questions', () => {
  const p = createProject(); p.material.skin = .3; p.fabrication.depth = 2.5; p.fabrication.remainingCore = .2;
  p.fabrication.calibration = { approved: true, responsible: 'Teste fictício', date: '2026-01-01', targetWidth: 100, targetHeight: 100, measuredWidth: 100, measuredHeight: 100, tolerance: .5, angle: 90, visualApproved: true, fitApproved: true, signature: calibrationSignature(p) };
  const before = structuredClone(p), checks = projectKnowledgeChecks(p, { errors: [{ code: 'SYNTHETIC' }] });
  assert.equal(checks.find(item => item.id === 'fold-chain').status, 'recorded');
  assert.equal(checks.find(item => item.id === 'structure').status, 'review');
  assert.equal(checks.find(item => item.id === 'sealant').status, 'review');
  assert.match(checks.find(item => item.id === 'survey').evidence, /1 erro/);
  assert.deepEqual(p, before);
  assert.ok(checks.every(item => ['missing', 'attention', 'review', 'recorded'].includes(item.status)));
  assert.ok(checks.every(item => !Object.hasOwn(item, 'approved') && !Object.hasOwn(item, 'productionReady')));
});

test('a material override with missing skin remains a machining question', () => {
  const p = createProject(); p.material.skin = .3; p.fabrication.depth = 2.5; p.fabrication.remainingCore = .2;
  const result = { pieces: [{ id: 'a', material: p.material }, { id: 'b', material: { ...p.material, thickness: 4, skin: null } }] };
  assert.equal(check(p, 'machining', result).status, 'missing');
  assert.match(check(p, 'machining', result).evidence, /ACM 4 mm/);
});

test('every guidance item is attributed to supplied PDF page positions within the actual file bounds', () => {
  for (const item of TECHNICAL_GUIDANCE) {
    assert.ok(item.scope.length > 20 && item.refs.length > 0);
    for (const reference of item.refs) {
      const source = TECHNICAL_SOURCES[reference.source];
      assert.ok(source);
      assert.ok(reference.pages.length > 0 && reference.pages.every(page => Number.isInteger(page) && page >= 1 && page <= source.pages));
    }
  }
  assert.match(TECHNICAL_SOURCES.alucomaxx.revision, /2023/);
  assert.match(TECHNICAL_GUIDANCE.find(item => item.id === 'fold-chain').scope, /não é uma tolerância geral/i);
});


test('real engine double folds use full edge definitions even though legacy edge heights are numeric', () => {
  const p = createProject(); p.front = {width: 400, height: 300};
  p.edges = {left: {type:'fold',height:30,folds:[{id:'1',length:30,angle:90,direction:'back'},{id:'2',length:20,angle:90,direction:'back'}]},right:0,top:0,bottom:0};
  const first = buildProject(p);
  assert.equal(first.valid,true,JSON.stringify(first.errors));
  assert.equal(typeof first.pieces[0].edges.left,'number');
  assert.match(check(p,'fold-chain',first).evidence,/1 borda/);
  p.overrides[first.pieces[0].id] = {edges:{right:{type:'fold',height:25,folds:[{id:'1',length:25,angle:90,direction:'back'},{id:'2',length:12,angle:90,direction:'front'}]}}};
  const second = buildProject(p);
  assert.equal(second.valid,true,JSON.stringify(second.errors));
  assert.match(check(p,'fold-chain',second).evidence,/2 borda/);
  const legacy = {...second,pieces:second.pieces.map(({edgeDefinitions,...piece})=>piece)};
  assert.match(check(p,'fold-chain',legacy).evidence,/2 borda/);
});

test('flat technical pieces never inherit fold chains from a parametric project', () => {
  const p = createProject(); p.edges.left = {type:'fold',height:30,folds:[{id:'1',length:30,angle:90,direction:'back'},{id:'2',length:20,angle:90,direction:'back'}]};
  const result = {pieces:[{id:'flat-test',technical:true,edges:{left:0},material:p.material}]};
  assert.match(check(p,'fold-chain',result).evidence,/0 borda/);
});

test('identity checklist retains unknown lots and distinguishes recorded identity from receiving inspection', () => {
  const p = createProject(),before=structuredClone(p);
  assert.equal(check(p,'traceability').status,'missing');
  assert.match(check(p,'traceability').evidence,/lote não informado/);
  assert.deepEqual(p,before);
  Object.assign(p.material,{manufacturer:'Fornecedor fictício',sku:'SKU-SINTETICO',lot:'LOTE-FICTICIO'});
  assert.equal(check(p,'traceability').status,'recorded');
  assert.match(check(p,'traceability').detail,/Conferir as etiquetas/);
});

test('a stated installation weight stays an entered value while absent weight is never calculated from area', () => {
  const p=createProject(),before=structuredClone(p),result={totals:{visibleArea:12000000},pieces:[]};
  assert.equal(check(p,'weight',result).status,'missing');
  assert.match(check(p,'weight',result).evidence,/desconhecido/);
  assert.deepEqual(p,before);
  p.installation={plate:{weight:7.25},environment:{access:'Acesso fictício'}};
  assert.equal(check(p,'weight',result).status,'recorded');
  assert.match(check(p,'weight',result).evidence,/7,25 kg/);
  assert.match(check(p,'weight',result).detail,/não representa capacidade/);
  assert.equal(p.installation.plate.weight,7.25);
});

test('protection evidence uses effective profile records and does not equate finish with electrical isolation', () => {
  const p=createProject();
  const result={structure:{segments:[{profileSpec:{material:'aço carbono',finish:''}},{profileSpec:{material:'alumínio',finish:'anodizado'}}]}};
  assert.equal(check(p,'coating',result).status,'missing');
  assert.match(check(p,'structure',result).detail,/Há aço/);
  result.structure.segments[0].profileSpec.finish='pintura informada';
  assert.equal(check(p,'coating',result).status,'review');
  assert.match(check(p,'coating',result).detail,/não comprova.*isolamento/);
});

test('cleaning and final inspection never infer chemical compatibility or site acceptance', () => {
  const p=createProject();p.installation={preparation:{cleaning:'Procedimento fictício a conferir'},environment:{access:'Descrição fictícia'}};
  const before=structuredClone(p),checks=projectKnowledgeChecks(p);
  assert.equal(checks.find(item=>item.id==='liner-cleaning').status,'review');
  assert.match(checks.find(item=>item.id==='liner-cleaning').evidence,/não foi validado quimicamente/);
  assert.equal(checks.find(item=>item.id==='final-inspection').status,'review');
  assert.match(checks.find(item=>item.id==='maintenance').evidence,/não comprova.*manutenção/);
  assert.match(TECHNICAL_GUIDANCE.find(item=>item.id==='liner-cleaning').scope,/não recomenda solvente/);
  assert.deepEqual(p,before);
});
