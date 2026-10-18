import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { importLetterSVG, importLetterDXF } from './importers.mjs';
import { createLetterProject, setLetterFamily } from './model.mjs';
import { calculateLetters } from './engine.mjs';
import { calculateFabrication, createFabricationConfig, validateFabricationConfig, fabricationSignature, fabricationSVG, fabricationHTML } from './fabrication.mjs';

const make = (family = 'galvanized-acrylic', value = {}) => createLetterProject({ id: 'fabricacao-ficticia', name: 'Amostra fictícia', text: { value: 'O', heightMm: 200 }, construction: { family, depthMm: 75 }, materials: { back: { material: 'pvc', thickness: 5, operation: 'router' } }, ...value });
const calc = p => calculateFabrication(p, calculateLetters(p));
const config = value => createFabricationConfig({ overlapMm: 8, compensationMm: 0, joinMethod: 'mechanical', reference: 'Procedimento fictício para teste', joinConfirmed: true, compensationConfirmed: true, ...value });

test('roteiro galvanizado segue arte, fibra, CO2, router, conformação, união, pintura, LEDs e fechamento', () => {
  const p = make(), f = calc(p);
  assert.deepEqual(f.errors, []);
  assert.deepEqual(f.steps.map(step => step.id), ['artwork', 'cut-laser-fiber', 'cut-laser-co2', 'cut-router', 'forming', 'joining', 'painting', 'lighting', 'closing', 'template', 'installation']);
  for (const step of f.steps.filter(item => item.id.startsWith('cut-'))) assert.deepEqual(step.dependsOn, ['artwork']);
  assert.deepEqual(f.steps.find(step => step.id === 'forming').dependsOn, ['cut-laser-fiber']);
  const closing = f.steps.find(step => step.id === 'closing');
  for (const dependency of ['cut-laser-fiber', 'cut-laser-co2', 'cut-router', 'joining', 'painting', 'lighting']) assert.ok(closing.dependsOn.includes(dependency));
  assert.deepEqual(f.steps.find(step => step.id === 'template').dependsOn, ['closing']);
  assert.equal(f.released, false);
  assert.ok(f.steps.every(step => ['planned', 'ready-for-review'].includes(step.status)));
});
test('MDF e acrílico planos cortam CO2; PVC corta router, todos sem solda, conformação ou LEDs', () => {
  for (const material of ['mdf', 'acrylic', 'pvc']) {
    const p = make(`flat-${material}`, { construction: { family: `flat-${material}`, layers: [{ material, thickness: 5, operation: material === 'pvc' ? 'router' : 'laser-co2' }] } });
    const f = calc(p);
    assert.deepEqual(f.errors, []);
    assert.equal(f.strips.length, 0);
    assert.ok(f.steps.some(step => step.id === (material === 'pvc' ? 'cut-router' : 'cut-laser-co2')));
    assert.ok(f.steps.every(step => !['forming', 'joining', 'lighting'].includes(step.id)));
    assert.equal(f.steps.flatMap(step => step.operations).join(' ').includes('Solda'), false);
  }
});
test('letra cega tem face e laterais metálicas, sem LED e sem corte acrílico', () => {
  const f = calc(setLetterFamily(make(), 'galvanized-blind'));
  assert.deepEqual(f.errors, []);
  assert.ok(f.steps.some(step => step.id === 'cut-laser-fiber'));
  assert.ok(f.steps.every(step => !['lighting', 'cut-laser-co2'].includes(step.id)));
});
test('bordas 30, 75 e 150 mm preservam contorno e mudam largura e área das faixas', () => {
  const totals = [];
  for (const depthMm of [30, 75, 150]) {
    const p = make('galvanized-acrylic', { construction: { family: 'galvanized-acrylic', depthMm }, fabrication: config() });
    const f = calc(p);
    assert.ok(f.strips.every(strip => strip.widthMm === depthMm && strip.segments.every(segment => segment.widthMm === depthMm)));
    totals.push(f.totals);
    assert.match(fabricationHTML(p, calculateLetters(p), { stepId: 'forming' }), new RegExp(`profundidade: ${depthMm} mm`));
  }
  assert.equal(totals[0].nominalLengthMm, totals[2].nominalLengthMm);
  assert.ok(Math.abs(totals[2].developedAreaMm2 / totals[0].developedAreaMm2 - 5) < 1e-8);
});
test('desenvolvimento não presume compensação zero nem sobreposição; zero explícito não valida', () => {
  const f = calc(make());
  assert.ok(f.strips.every(strip => strip.grossLengthMm === null));
  assert.equal(f.totals.developedLengthMm, null);
  assert.match(f.pending.join(' '), /não se assume zero/);
  const entered = calc(make('galvanized-acrylic', { fabrication: { compensationMm: 0, overlapMm: 0 } }));
  assert.equal(entered.totals.developedLengthMm, entered.totals.nominalLengthMm);
  assert.ok(entered.strips.every(strip => strip.status === 'planned'));
  assert.match(entered.pending.join(' '), /ainda não validada/);
});
test('limite máximo divide faixas incluindo compensação e sobreposição em cada fechamento', () => {
  const f = calc(make('galvanized-acrylic', { fabrication: config({ compensationMm: 10, maxStripLengthMm: 250 }) }));
  assert.deepEqual(f.errors, []);
  assert.ok(f.totals.segmentCount > 2);
  for (const strip of f.strips) {
    assert.ok(strip.segments.every(segment => segment.grossLengthMm <= 250 + 1e-7));
    assert.ok(Math.abs(strip.grossLengthMm - (strip.nominalLengthMm + 10 + 8 * strip.segments.length)) < 1e-7);
    assert.ok(Math.abs(strip.segments.reduce((sum, segment) => sum + segment.compensationMm, 0) - 10) < 1e-7);
  }
});
test('emendas explícitas prevalecem sobre divisão automática e conservam origem e medidas', () => {
  const p = make(), r = calculateLetters(p), strip = r.strips[0];
  p.fabrication = config({ segmentsPerContour: 8, seamsByStrip: { [strip.id]: [300, 100] } });
  const f = calculateFabrication(p, r), developed = f.strips[0];
  assert.deepEqual(f.errors, []);
  assert.deepEqual(developed.segments.map(segment => segment.startMm), [0, 100, 300]);
  assert.equal(developed.segments[1].nominalLengthMm, 200);
  assert.deepEqual(developed.segments[0].startPoint, strip.points[0]);
});
test('emenda fora do contorno, repetida ou excedendo limite bloqueia exportação', () => {
  const p = make(), r = calculateLetters(p), strip = r.strips[0];
  for (const positions of [[strip.nominalLengthMm], [100, 100], [-1], [Infinity]]) {
    p.fabrication = config({ seamsByStrip: { [strip.id]: positions } });
    assert.ok(calculateFabrication(p, r).errors.length);
    assert.throws(() => fabricationSVG(p, r));
  }
  p.fabrication = config({ maxStripLengthMm: 80, seamsByStrip: { [strip.id]: [100] } });
  assert.match(calculateFabrication(p, r).errors.join(' '), /excede o comprimento máximo/);
});
test('aba adicional muda largura de corte, sem fingir raio, vinco ou compensação calculados', () => {
  const p = make('galvanized-acrylic', { fabrication: config({ flangeMode: 'manual', joinFlangeMm: 12 }) });
  const f = calc(p);
  assert.ok(f.strips.every(strip => strip.depthMm === 75 && strip.widthMm === 87));
  assert.match(f.pending.join(' '), /Nenhum vinco foi calculado/);
  p.fabrication.joinFlangeMm = null;
  assert.ok(calc(p).strips.every(strip => strip.widthMm === null));
  assert.equal(calc(p).totals.developedAreaMm2, null);
});
test('cortes são separados por processo, material e espessura, incluindo faixas metálicas', () => {
  const p = make('galvanized-acrylic', { fabrication: config() }), f = calc(p);
  assert.equal(f.cutGroups.length, 3);
  const metal = f.cutGroups.find(group => group.material === 'galvanized');
  assert.ok(metal.items.every(item => item.kind === 'strip'));
  assert.equal(metal.items.length, 2);
  assert.equal(f.cutGroups.find(group => group.material === 'pvc').operation, 'router');
  const svg = fabricationSVG(p, calculateLetters(p), { stepId: 'cut-router' });
  assert.match(svg, /PVC/);
  assert.equal(svg.includes('data-part-id="' + metal.items[0].id + '"'), false);
});
test('SVG mantém textos e referências fora do corte, preserva vazados, IDs e escala', () => {
  const p = make('galvanized-acrylic', { fabrication: config({ segmentsPerContour: 2 }) }), r = calculateLetters(p);
  const svg = fabricationSVG(p, r, { stepId: 'cut-laser-co2' });
  const cut = svg.match(/<g id="CORTE_NOMINAL"[^>]*>([\s\S]*?)<\/g>/)[1];
  assert.equal(cut.includes('<text'), false);
  assert.equal(cut.includes('<circle'), false);
  assert.ok((cut.match(/M/g) || []).length >= 2);
  assert.match(svg, /REFERENCIAS_NAO_CORTAR/);
  assert.match(svg, /Referência de 100 mm/);
  assert.match(svg, /ANOTACOES_NAO_CORTAR/);
  const strips = fabricationSVG(p, r, { stepId: 'forming' });
  assert.match(strips, /REF 0/);
  assert.match(strips, /-F1/);
  assert.match(strips, /mm do contorno/);
});
test('HTML lista roteiro e dimensões da mesma revisão, escapa texto e nunca declara execução', () => {
  const p = make('galvanized-acrylic', { name: '<img src=x onerror=alert(1)>', fabrication: config({ reference: '<script>bad()</script>' }) }), r = calculateLetters(p);
  const html = fabricationHTML(p, r);
  assert.equal(html.includes('<script>'), false);
  assert.equal(html.includes('<img src=x'), false);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /nenhuma operação é declarada executada/);
  assert.match(html, /sem compensação automática de kerf ou dobra/);
  assert.match(html, /R1/);
  for (const strip of calc(p).strips) for (const segment of strip.segments) assert.ok(html.includes(segment.id));
});
test('exportação rejeita geometria antiga, falha, sem assinatura ou etapa inexistente', () => {
  const p = make(), r = calculateLetters(p);
  for (const bad of [{ ...p, revision: 2 }, { ...p, construction: { ...p.construction, depthMm: 150 } }]) for (const exportFn of [fabricationSVG, fabricationHTML]) assert.throws(() => exportFn(bad, r), /revisão|Assinatura/);
  assert.throws(() => fabricationSVG(p, { ...r, errors: ['falha'] }), /inválida/);
  assert.throws(() => fabricationSVG(p, r, { stepId: 'missing' }), /inexistente/);
  assert.throws(() => fabricationHTML(p, r, { stepId: 'missing' }), /inexistente/);
});
test('pintura dispensada remove etapa e multicamadas inclui montagem sem metalurgia', () => {
  const p = make('flat-mdf', { construction: { family: 'flat-mdf', layers: [{ material: 'mdf', thickness: 5, operation: 'laser-co2' }, { material: 'mdf', thickness: 10, operation: 'router' }] }, painting: { mode: 'none' } });
  const f = calc(p);
  assert.ok(f.steps.some(step => step.id === 'layers'));
  assert.ok(f.steps.every(step => step.id !== 'painting' && step.id !== 'forming'));
  assert.equal(f.cutGroups.length, 2);
});
test('configuração inválida e limites inviáveis retornam erro, sem loop ou resultado inventado', () => {
  for (const fabrication of [null, [], { overlapMm: -1 }, { compensationMm: Infinity }, { segmentsPerContour: 0 }, { seamsByStrip: [] }, { joinMethod: 'magic' }, { compensationConfirmed: 'yes' }, { flangeMode: 'auto' }, { reference: {} }, config({ maxStripLengthMm: 1 }), config({ compensationMm: -10000 })]) {
    assert.ok(calc(make('galvanized-acrylic', { fabrication })).errors.length, JSON.stringify(fabrication));
  }
  assert.ok(calculateFabrication(undefined, undefined).errors.length);
});
test('marcas de emendas obsoletas ficam pendentes e não alteram contorno atual', () => {
  const f = calc(make('galvanized-acrylic', { fabrication: config({ seamsByStrip: { 'letra-antiga': [10] } }) }));
  assert.deepEqual(f.errors, []);
  assert.match(f.pending.join(' '), /contorno ausente/);
  assert.ok(f.strips.every(strip => strip.segments.length === 1));
});
test('cálculo é determinístico e não modifica projeto nem geometria', () => {
  const p = make('galvanized-acrylic', { fabrication: config({ segmentsPerContour: 2 }) }), r = calculateLetters(p), before = JSON.stringify({ p, r });
  assert.deepEqual(calculateFabrication(p, r), calculateFabrication(p, r));
  assert.equal(JSON.stringify({ p, r }), before);
});
test('desenho de montagem conserva posição relativa das letras e identifica faixas internas e externas', () => {
  const p = make('galvanized-acrylic', { text: { value: 'OO' }, fabrication: config() }), r = calculateLetters(p);
  const svg = fabricationSVG(p, r, { stepId: 'template' });
  for (const letter of r.letters) {
    const x = Math.round((24 + letter.x) * 1000) / 1000;
    assert.ok(svg.includes(`data-part-id="${letter.id}" transform="translate(${x} `));
  }
  assert.match(svg, /EXT · F1 · REF 0/);
  assert.match(svg, /INT · F1 · REF 0/);
});
test('novas famílias mantêm roteiro compatível com seus materiais', () => {
  for (const family of ['backlit', 'acm', 'polymeric']) {
    const p = setLetterFamily(createLetterProject({ text: { value: 'O' } }), family), f = calc(p);
    assert.deepEqual(f.errors, []);
    assert.ok(f.steps.length > 5);
    if (family === 'backlit') assert.match(f.steps.find(step => step.id === 'lighting').title, /halo/);
    if (family === 'acm') { assert.ok(f.steps.some(step => step.id === 'cut-router')); assert.match(f.steps.find(step => step.id === 'forming').operations.join(' '), /nenhum friso V/); }
    if (family === 'polymeric') assert.ok(f.steps.some(step => step.id === 'cut-manual-cut'));
  }
});
test('lateral polimérica recusa soldagem metálica', () => {
  const p = setLetterFamily(createLetterProject(), 'polymeric');
  p.fabrication = config({ joinMethod: 'weld' });
  assert.match(calc(p).errors.join(' '), /não metálicas/);
});
test('validador público aceita configuração parcial, rejeita formas inválidas e mantém pendências do motor', () => {
  assert.deepEqual(validateFabricationConfig({}), []);
  assert.deepEqual(validateFabricationConfig(config()), []);
  assert.ok(validateFabricationConfig(null).length);
  assert.ok(validateFabricationConfig({ overlapMm: '10' }).length);
  assert.match(calc(make()).pending.join(' '), /tolerância de fabricação/);
});
test('dependências por família não criam passos ausentes, ciclos ou cortes em série', () => {
  for (const family of ['flat-mdf', 'flat-acrylic', 'flat-pvc', 'galvanized-acrylic', 'galvanized-blind', 'backlit', 'acm', 'polymeric']) {
    for (const painting of [{ mode: 'none' }, { mode: 'pending' }]) {
      const p = { ...setLetterFamily(createLetterProject({ text: { value: 'O' } }), family), painting }, f = calc(p);
      const visited = new Set();
      for (const step of f.steps) {
        assert.ok(step.dependsOn.every(id => visited.has(id)), `${family}: ${step.id} tem dependência ausente, futura ou cíclica`);
        if (step.id.startsWith('cut-')) assert.deepEqual(step.dependsOn, ['artwork']);
        visited.add(step.id);
      }
      if (painting.mode === 'none') assert.ok(f.steps.every(step => !step.dependsOn.includes('painting')));
      if (family === 'polymeric') assert.deepEqual(f.steps.find(step => step.id === 'forming').dependsOn, ['cut-manual-cut']);
      if (family.startsWith('flat-')) assert.ok(f.steps.find(step => step.id === 'fixing').dependsOn.includes('finishing-edges'));
      if (family === 'galvanized-blind') assert.ok(f.steps.find(step => step.id === 'closing').dependsOn.every(id => id !== 'lighting'));
    }
  }
});
test('caderno apresenta nomes das dependências no lugar de IDs internos', () => {
  const p = make(), html = fabricationHTML(p, calculateLetters(p));
  assert.ok(!html.includes('<td>cut-laser-fiber</td>'));
  assert.ok(!html.includes('<td>artwork</td>'));
  assert.match(html, /<td>Conferir arte, escala e vazados<\/td>/);
});


test('origem deslocada percorre o fechamento e reconcilia faixas externas e vazados importados', () => {
  const artwork = importLetterSVG('<svg width="100mm" height="80mm" viewBox="0 0 100 80"><path fill-rule="evenodd" d="M0 0H100V80H0Z M20 20H60V60H20Z"/></svg>', { fileName: 'teste-ficticio.svg' });
  const p = make('galvanized-acrylic', { artwork }), r = calculateLetters(p);
  assert.deepEqual(r.errors, []);
  assert.equal(r.strips.length, 2);
  p.fabrication = config({ segmentsPerContour: 3, startOffsetsByStrip: Object.fromEntries(r.strips.map(strip => [strip.id, strip.nominalLengthMm - 15])) });
  const f = calculateFabrication(p, r);
  assert.deepEqual(f.errors, []);
  for (const strip of f.strips) {
    assert.equal(strip.seams.length, 3);
    assert.equal(strip.seams[0].kind, 'closure');
    assert.equal(strip.seams[0].joins[0], strip.segments.at(-1).id);
    assert.equal(strip.seams[0].joins[1], strip.segments[0].id);
    assert.equal(strip.seams[0].contourOffsetMm, strip.nominalLengthMm - 15);
    assert.ok(Math.abs(strip.audit.pathLengthMm - strip.nominalLengthMm) < 1e-7);
    assert.ok(Math.abs(strip.audit.sumNominalMm - strip.nominalLengthMm) < 1e-7);
    assert.ok(Math.abs(strip.audit.nominalDifferenceMm) < 1e-7);
    assert.equal(strip.audit.sumOverlapMm, 24);
    for (let index = 0; index < strip.segments.length; index++) {
      const segment = strip.segments[index], next = strip.segments[(index + 1) % strip.segments.length];
      assert.ok(segment.pathPoints.length >= 2);
      assert.ok(Math.hypot(segment.endPoint[0] - next.startPoint[0], segment.endPoint[1] - next.startPoint[1]) < 1e-7);
      const pathLength = segment.pathPoints.slice(1).reduce((total, point, i) => total + Math.hypot(point[0] - segment.pathPoints[i][0], point[1] - segment.pathPoints[i][1]), 0);
      assert.ok(Math.abs(pathLength - segment.nominalLengthMm) < 1e-7);
    }
  }
  assert.match(f.steps[0].inputs.join(' '), /teste-ficticio.svg/);
});

test('SVG e DXF importados preservam todos os contornos no roteiro, corte e faixas', () => {
  for (const format of ['svg', 'dxf']) {
    const content = readFileSync(new URL(`../../../public/examples/letras-demo.${format}`, import.meta.url), 'utf8');
    const artwork = (format === 'svg' ? importLetterSVG : importLetterDXF)(content, { fileName: `demonstracao.${format}` });
    const p = make('galvanized-acrylic', { artwork, fabrication: config({ maxStripLengthMm: 125, overlapMm: 5, flangeMode: 'manual', joinFlangeMm: 10 }) });
    const r = calculateLetters(p), f = calculateFabrication(p, r);
    assert.deepEqual(f.errors, []);
    assert.equal(f.strips.length, 5);
    assert.equal(f.strips.filter(strip => strip.role === 'inner-side').length, 3);
    assert.ok(f.strips.every(strip => strip.segments.every(segment => segment.grossLengthMm <= 125 + 1e-7 && segment.widthMm === 85 && segment.flangeMm === 10)));
    for (const strip of f.strips) {
      assert.ok(Math.abs(strip.audit.pathLengthMm - strip.nominalLengthMm) < 1e-7);
      assert.equal(strip.references.filter(mark => mark.kind === 'direction-change').length, 4);
      for (const segment of strip.segments) assert.ok(f.cutGroups.some(group => group.items.some(item => item.id === segment.id)));
    }
    assert.match(fabricationSVG(p, r, { stepId: 'forming' }), /PERCURSOS_NAO_CORTAR/);
    assert.match(fabricationHTML(p, r), /Origens, emendas e reconciliação/);
  }
});

test('origem inválida após redução da arte não é remapeada silenciosamente', () => {
  const p = make(), r = calculateLetters(p), id = r.strips[0].id;
  for (const offset of [-1, Infinity, '10', r.strips[0].nominalLengthMm]) {
    p.fabrication = config({ startOffsetsByStrip: { [id]: offset } });
    assert.ok(calculateFabrication(p, r).errors.length);
    assert.throws(() => fabricationSVG(p, r));
  }
  p.fabrication = config({ startOffsetsByStrip: { [id]: r.strips[0].nominalLengthMm * .75 } });
  p.text.heightMm /= 2;
  assert.match(calculateFabrication(p, calculateLetters(p)).errors.join(' '), /origem deve ser menor/);
  assert.ok(validateFabricationConfig({ startOffsetsByStrip: [] }).length);
});

test('compensação global não inventa posição de cantos no desenvolvimento', () => {
  const p = make('galvanized-acrylic', { text: { value: 'E' }, fabrication: config({ compensationMm: 4, segmentsPerContour: 2 }) }), f = calc(p);
  assert.deepEqual(f.errors, []);
  assert.ok(f.strips.flatMap(strip => strip.segments.flatMap(segment => segment.referenceMarks)).length > 0);
  for (const strip of f.strips) for (const segment of strip.segments) {
    assert.ok(segment.referenceMarks.every(mark => mark.developedOffsetMm === null));
    assert.ok(Math.abs(segment.bodyDevelopedLengthMm + segment.overlapMm - segment.grossLengthMm) < 1e-8);
  }
  p.fabrication.compensationMm = 0;
  const zero = calc(p);
  assert.ok(zero.strips.flatMap(strip => strip.segments.flatMap(segment => segment.referenceMarks)).every(mark => mark.developedOffsetMm === mark.offsetMm));
});

test('marcas geométricas incluem cantos, amostras suaves e orientação, sem instruir dobra', () => {
  const f = calc(make('galvanized-acrylic', { text: { value: 'AO' }, fabrication: config() }));
  const marks = f.strips.flatMap(strip => strip.references);
  assert.ok(marks.some(mark => mark.kind === 'direction-change'));
  assert.ok(marks.some(mark => mark.kind === 'curve-sample'));
  assert.ok(marks.every(mark => Number.isFinite(mark.turnAngleDeg) && Number.isFinite(mark.offsetMm)));
  assert.ok(f.strips.every(strip => ['clockwise', 'counterclockwise'].includes(strip.winding)));
  assert.match(f.steps.find(step => step.id === 'forming').checks.join(' '), /não ângulos de dobra/);
});

test('assinatura de fabricação muda por origem, emendas e compensações sem depender da ordem das chaves', () => {
  const p = make('galvanized-acrylic', { fabrication: config() }), r = calculateLetters(p), signature = fabricationSignature(p), id = r.strips[0].id;
  assert.equal(calculateFabrication(p, r).signature, signature);
  for (const delta of [{ startOffsetsByStrip: { [id]: 20 } }, { seamsByStrip: { [id]: [20] } }, { compensationMm: 4 }, { overlapMm: 0 }, { joinFlangeMm: 3, flangeMode: 'manual' }]) assert.notEqual(fabricationSignature({ ...p, fabrication: { ...p.fabrication, ...delta } }), signature);
  assert.equal(fabricationSignature({ ...p, fabrication: Object.fromEntries(Object.entries(p.fabrication).reverse()) }), signature);
});

test('roteiro de cada família tem entradas, saídas e conferências concretas', () => {
  for (const family of ['flat-mdf', 'flat-acrylic', 'flat-pvc', 'galvanized-acrylic', 'galvanized-blind', 'backlit', 'acm', 'polymeric']) {
    const p = setLetterFamily(createLetterProject({ text: { value: 'O' } }), family), f = calc(p);
    for (const step of f.steps) {
      assert.ok(step.inputs.length > 0, `${family} ${step.id}: entradas`);
      assert.ok(step.outputs.length > 0, `${family} ${step.id}: saídas`);
      assert.ok(step.checks.length > 0, `${family} ${step.id}: conferências`);
    }
    const html = fabricationHTML(p, calculateLetters(p), { stepId: f.steps[1].id });
    assert.match(html, /Conferências antes de avançar/);
    assert.match(html, /Saídas previstas/);
  }
});

test('limite de 100 trechos inclui as emendas explícitas e rejeita perímetro adulterado', () => {
  const p = make(), r = calculateLetters(p), strip = r.strips[0];
  p.fabrication = config({ seamsByStrip: { [strip.id]: Array.from({ length: 100 }, (_, index) => strip.nominalLengthMm * (index + 1) / 101) } });
  assert.ok(calculateFabrication(p, r).errors.length);
  p.fabrication = config();
  const broken = structuredClone(r); broken.strips[0].nominalLengthMm += 10;
  assert.match(calculateFabrication(p, broken).errors.join(' '), /perímetro e pontos/);
});
