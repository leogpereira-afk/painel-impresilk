import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from './model.mjs';
import { buildProject } from './engine.mjs';
import { nestPieces } from './nesting.mjs';
import { estimateCosts, sheetReference } from './costs.mjs';
import { documentGeometry, assemblyFaceGeometry, MAX_REPORT_PREVIEW_BYTES, pieceSVG, pieceDXF, materialsCSV, projectReportHTML, structureCSV, routerCSV, structureCutSVG } from './documents.mjs';

const asymmetricalPiece = () => ({
  id: 'F-01', revision: 7, projectId: 'p-1', surface: 'front', x: 0, y: 0, width: 90, height: 50,
  material: { color: '#123456', thickness: 3, directional: true }, calibrated: false,
  blank: { width: 120, height: 100, face: { x: 10, y: 20, width: 90, height: 50 }, contour: [[0, 0], [120, 0], [120, 90], [105, 100], [0, 100]], grooves: [{ x1: 10, y1: 20, x2: 10, y2: 70, edge: 'left' }], cutouts: [{ x: 30, y: 40, width: 12, height: 8 }] },
  fixings: { screws: [{ x: 7, y: 11 }], tape: [{ x1: 9, y1: 3, x2: 9, y2: 40, width: 19 }] },
});

function projectFixture() {
  const project = createProject(); project.front.width = 900; project.front.height = 500; project.revision = 3;
  const result = buildProject(project);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  const nesting = nestPieces(result.pieces, project.stock, project.fabrication);
  return { project, result, nesting };
}

function dxfRecords(source) {
  const lines = source.trimEnd().split(/\r?\n/); assert.equal(lines.length % 2, 0);
  const groups = []; for (let i = 0; i < lines.length; i += 2) { assert.match(lines[i], /^\d+$/); groups.push([Number(lines[i]), lines[i + 1]]); }
  const entities = []; let current;
  for (const group of groups) {
    if (group[0] === 0) { current = { type: group[1], groups: [] }; entities.push(current); }
    else if (current) current.groups.push(group);
  }
  return { groups, entities };
}
const field = (entity, group) => entity.groups.find(([code]) => code === group)?.[1];

test('front/back mirror the asymmetric contour, cuts, channels, holes, tape and material direction together', () => {
  const piece = asymmetricalPiece(), back = documentGeometry(piece), front = documentGeometry(piece, { back: false });
  for (let i = 0; i < back.contour.length; i++) { assert.equal(front.contour[i][0] + back.contour[i][0], 120); assert.equal(front.contour[i][1], back.contour[i][1]); }
  assert.deepEqual(back.drills[0], { x: 103, y: 31, diameter: null, number: 1 });
  assert.deepEqual(front.drills[0], { x: 17, y: 31, diameter: null, number: 1 });
  assert.equal(front.cutouts[0][0][0], 30); assert.equal(front.grooves[0].x1, 10);
  assert.equal(front.tape[0].x1, 19); assert.equal(back.tape[0].x1, 101);
  assert.equal(front.direction, -back.direction);
  assert.deepEqual(piece.blank.contour[3], [105, 100]);
});

test('SVG explicitly declares mm, real 1:1 geometry, side/revision, information layers and escapes markup', () => {
  const piece = asymmetricalPiece(); piece.id = '<script>alert("x")</script>';
  const svg = pieceSVG(piece, { back: false });
  assert.match(svg, /width="120mm" height="100mm" viewBox="0 0 120 100"/);
  for (const layer of ['CUT', 'GROOVE', 'FOLD', 'DRILL', 'FIXING', 'DIMENSIONS', 'TEXT']) assert.match(svg, new RegExp(`id="${layer}"`));
  assert.match(svg, /data-side="front"/); assert.match(svg, /data-revision="7"/); assert.match(svg, /RASCUNHO/);
  assert.doesNotMatch(svg, /<script>/); assert.match(svg, /&lt;script&gt;/);
  assert.match(svg, /data-diameter="unspecified"/); assert.match(svg, /M 0 0 L 120 0 L 120 90 L 105 100 L 0 100 Z/);
});

test('DXF group records are ASCII, use mm metadata, named layers, actual cut contours and mirrored drill point', () => {
  const piece = asymmetricalPiece(); piece.id = 'Peça\n0\nLINE';
  const source = pieceDXF(piece, { back: true });
  assert.match(source, /\$ACADVER\r\n1\r\nAC1015/); assert.match(source, /\$INSUNITS\r\n70\r\n4/);
  assert.doesNotMatch(source, /[^\x00-\x7f]/);
  const parsed = dxfRecords(source);
  assert.equal(parsed.entities.at(-1).type, 'EOF');
  for (const layer of ['CUT', 'GROOVE', 'FOLD', 'DRILL', 'FIXING', 'DIMENSIONS', 'TEXT']) assert.ok(parsed.entities.some(e => e.type === 'LAYER' && field(e, 2) === layer));
  const cut = parsed.entities.find(e => e.type === 'LWPOLYLINE'); assert.equal(field(cut, 90), '5'); assert.equal(field(cut, 70), '1');
  assert.deepEqual(cut.groups.filter(([c]) => c === 10).map(([, value]) => Number(value)), [120, 0, 0, 15, 120]);
  const drill = parsed.entities.find(e => e.type === 'POINT'); assert.equal(field(drill, 8), 'DRILL'); assert.equal(field(drill, 10), '103'); assert.equal(field(drill, 20), '31');
  assert.equal(parsed.entities.filter(e => e.type === 'CIRCLE').length, 0);
  assert.ok(parsed.entities.filter(e => e.type === 'TEXT').some(e => field(e, 1).includes('Pe\\U+00E7a 0 LINE')));
});

test('explicit drilled diameter uses CIRCLE, while standalone blank holes do not receive face offset', () => {
  const piece = asymmetricalPiece(); piece.blank.holes = [{ x: 5, y: 8, diameter: 6 }];
  const g = documentGeometry(piece); assert.deepEqual(g.drills[0], { x: 115, y: 8, diameter: 6, number: 1 });
  const circle = dxfRecords(pieceDXF(piece)).entities.find(e => e.type === 'CIRCLE');
  assert.equal(field(circle, 40), '3'); assert.equal(field(circle, 10), '115');
});

test('CSV protects formula cells, quotes separators and identifies costs/revision', () => {
  const { project, result, nesting } = projectFixture(); project.name = '=HYPERLINK("https://bad")';
  project.costs.sheet = 100;
  project.costs.sheetReference = sheetReference(project);
  result.warnings.push({ code: '@SUM(1;2)', message: 'Texto; com "aspas"' });
  const csv = materialsCSV(project, result, nesting);
  assert.match(csv, /^\uFEFF/); assert.match(csv, /"'=HYPERLINK\(""https:\/\/bad""\)"/);
  assert.match(csv, /"'@SUM\(1;2\)"/); assert.match(csv, /"Pendência: Texto; com ""aspas"""/);
  assert.match(csv, /"3";"Chapas novas";"1";"un";"100";"100";"Estimativa"/);
});

test('report derives all pages from one revision and escapes hostile names, materials and warnings', () => {
  const { project, result, nesting } = projectFixture();
  project.name = '<img src=x onerror=alert(1)>'; project.material.manufacturer = '</td><script>bad()</script>';
  result.warnings.push({ code: 'X', message: '<svg onload=alert(2)>' });
  const html = projectReportHTML(project, result, nesting);
  assert.doesNotMatch(html, /<script|<img|onload="|onerror="/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /&lt;\/td&gt;&lt;script&gt;bad\(\)&lt;\/script&gt;/);
  for (const title of ['Apresentação e conferência', 'Lista de materiais', 'Ficha de fabricação', 'Plano de corte', 'Montagem e estrutura', 'Etiquetas']) assert.ok(html.includes(title), title);
  assert.match(html, /R3/); assert.match(html, /default-src 'none'/); assert.match(html, /@page\{size:A4/);
  assert.ok(html.includes(result.pieces[0].id)); assert.match(html, /Estimativa incompleta/);
});

test('stale revisions or outdated nesting never generate current fabrication documents', () => {
  const { project, result, nesting } = projectFixture();
  assert.throws(() => pieceSVG(result.pieces[0], { project: { ...project, revision: 4 } }), /outra revisão/);
  assert.throws(() => materialsCSV({ ...project, revision: 4 }, result, nesting), /outra revisão/);
  nesting.sheets[0].placements[0].width += 10;
  assert.throws(() => projectReportHTML(project, result, nesting), /desatualizado/);
  assert.throws(() => pieceSVG({ ...result.pieces[0], revision: undefined }), /revisão/);
});

test('report uses nesting percentage once and counts actual remnant sources without a new sheet charge', () => {
  const { project, result } = projectFixture();
  project.stock.remnants = [{ id: 'example-remnant', width: 1500, length: 1000, material: project.material }]; project.costs.sheet = 100;
  const nesting = nestPieces(result.pieces, project.stock, project.fabrication);
  assert.equal(nesting.sheets[0].source, 'remnant');
  const html = projectReportHTML(project, result, nesting);
  assert.ok(html.includes(`${nesting.utilization.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% aproveitamento`));
  const csv = materialsCSV(project, result, nesting);
  assert.doesNotMatch(csv, /"Chapas novas"/);
  assert.match(csv, /"Retalhos consumidos";"1";"un";"";"";"Preço não informado"/);
});

test('CSV and report costs exactly match the shared budget with whole bars and attributed remnants', () => {
  const { project, result } = projectFixture();
  project.stock.remnants = [{ id: 'priced-remnant', width: 1500, length: 1000, material: project.material }];
  project.costs = { sheet: 100, remnant: 23, metalPerM: 10, tapePerM: 2, screw: null, work: 80 };
  const nesting = nestPieces(result.pieces, project.stock, project.fabrication), costs = estimateCosts(project, result, nesting);
  const csv = materialsCSV(project, result, nesting), html = projectReportHTML(project, result, nesting);
  const bars = costs.items.find(item => item.name === 'Metalon em barras');
  assert.match(csv, new RegExp(`"Metalon em barras";"${bars.quantity}";"m";"10";"${bars.total}"`));
  assert.ok(csv.includes(`"Soma dos custos disponíveis";"";"BRL";"";"${Number(costs.known.toFixed(5))}"`));
  assert.ok(html.includes(`Soma dos custos disponíveis: R$ ${costs.known.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`));
  assert.match(html, /Retalhos exigem custo atribuído/);
});

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lWQAAAAASUVORK5CYII=';

test('commercial report embeds one bounded PNG from the exact project revision, keeping text escaped and costs unchanged', () => {
  const { project, result, nesting } = projectFixture();
  project.name = '"><script>hostile()</script>';
  const before = JSON.stringify({ project, result, nesting });
  const html = projectReportHTML(project,result,nesting,{previewImage:{projectId:project.id,revision:project.revision,dataUrl:png}});
  assert.equal((html.match(/<img /g)||[]).length, 1);
  assert.ok(html.includes(`src="${png}"`));
  assert.match(html,/Vista 3D do estudo · R3/);
  assert.match(html,/montada, explodida ou aberta/);
  assert.match(html,/data-project-id="acm-estudo" data-revision="3"/);
  assert.doesNotMatch(html,/<script|src="https?:|onload="|onerror="/);
  assert.match(html,/&lt;script&gt;hostile\(\)&lt;\/script&gt;/);
  assert.equal(JSON.stringify({ project, result, nesting }),before);
  const costs=estimateCosts(project,result,nesting);
  assert.ok(html.includes(`Soma dos custos disponíveis: R$ ${costs.known.toLocaleString('pt-BR',{maximumFractionDigits:2})}`));
});

test('commercial preview refuses remote images, SVG payloads, malformed PNG, excessive dimensions and stale revision', () => {
  const { project, result, nesting } = projectFixture();
  const preview={projectId:project.id,revision:project.revision,dataUrl:png};
  for(const dataUrl of ['https://example.com/image.png','data:image/svg+xml,<svg onload="alert(1)"></svg>',png+'" onerror="alert(1)','data:image/png;base64,aGVsbG8=',png.slice(0,-12)]) {
    assert.throws(()=>projectReportHTML(project,result,nesting,{previewImage:{...preview,dataUrl}}),/PNG|incorporada/);
  }
  for(const changed of [{revision:2},{projectId:'other-project'}]) assert.throws(()=>projectReportHTML(project,result,nesting,{previewImage:{...preview,...changed}}),/outro projeto ou revisão/);
  assert.throws(()=>projectReportHTML(project,result,nesting,{previewImage:png}),/outro projeto ou revisão/);
  assert.throws(()=>projectReportHTML(project,result,nesting,{previewImage:{...preview,dataUrl:`data:image/png;base64,${'A'.repeat(MAX_REPORT_PREVIEW_BYTES)}`}}),/10 MiB/);
  const huge=Buffer.from(png.split(',')[1],'base64');huge.writeUInt32BE(12001,16);
  assert.throws(()=>projectReportHTML(project,result,nesting,{previewImage:{...preview,dataUrl:`data:image/png;base64,${huge.toString('base64')}`}}),/Dimensões/);
});

test('assembly maps project world supports and local fixings onto all four real engine faces without depth offsets', () => {
  const project=createProject();project.front={width:1800,height:700};project.left={enabled:true,depth:450,height:650};project.right={enabled:true,depth:350,height:550};project.soffit={enabled:true,width:1700,depth:420,x:40,y:30};project.layout.maxWidth=600;project.layout.maxHeight=800;project.fixing.type='screws';
  let result=buildProject(project);assert.equal(result.valid,true,JSON.stringify(result.errors));
  const left=result.pieces.find(piece=>piece.surface==='left');project.overrides[left.id]={fixing:{type:'tape'}};
  result=buildProject(project);assert.equal(result.valid,true,JSON.stringify(result.errors));
  const nesting=nestPieces(result.pieces,project.stock,project.fabrication);
  const html=projectReportHTML(project,result,nesting);
  for(const surface of result.surfaces){
    const geometry=assemblyFaceGeometry(surface,result),piece=geometry.pieces[0],support=geometry.supports[0];
    assert.ok(geometry.supports.length>0);assert.equal(geometry.missingSupports.length,0);
    assert.equal(support.x1,piece.x+project.fixing.edgeOffset);assert.equal(support.y1,piece.y+project.fixing.edgeOffset);
    for(const item of [...geometry.tape,...geometry.screws])assert.ok(geometry.supports.some(s=>s.id===item.supportId));
    assert.ok(html.includes(`data-surface="${surface.id}" data-units="mm"`));
    assert.ok(html.includes(`Mapa de montagem · ${surface.label}`));
  }
  const leftMap=assemblyFaceGeometry(result.surfaces.find(s=>s.id==='left'),result);
  assert.equal(leftMap.tape[0].x1, left.x+result.pieces.find(p=>p.id===left.id).fixings.tape[0].x1);
  assert.equal(leftMap.tape[0].y1, left.y+result.pieces.find(p=>p.id===left.id).fixings.tape[0].y1);
  const front=assemblyFaceGeometry(result.surfaces[0],result),firstPiece=result.pieces[0];
  assert.equal(front.screws[0].x,firstPiece.x+firstPiece.fixings.screws[0].x);
  assert.match(html,/data-layer="supports"/);assert.match(html,/data-layer="tape"/);assert.match(html,/data-layer="screws"/);
  assert.doesNotMatch(html,/Sequência orientativa:/);assert.match(html,/não define uma sequência executiva/);
});

test('assembly maps handle absent geometry explicitly and reject invalid projections while escaping support labels', () => {
  const { project, result, nesting } = projectFixture();
  assert.equal(assemblyFaceGeometry({id:'front'},result),null);
  const invalid=structuredClone(result.surfaces[0]);invalid.transform.u=[1,1,0];
  assert.throws(()=>assemblyFaceGeometry(invalid,result),/Referência de montagem/);
  result.structure.segments[0].id='<script>support()</script>';
  const html=projectReportHTML(project,result,nesting);
  assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;support\(\)&lt;\/script&gt;/);
  assert.match(html,/Apoios referenciados sem geometria disponível/);
  result.structure.segments[0].start[0]=NaN;
  assert.throws(()=>projectReportHTML(project,result,nesting),/Coordenada de estrutura/);
});

test('physically asymmetric front flange and screw are mirrored exactly once in the machining back', () => {
  const p=createProject();p.front={width:300,height:150};p.edges={left:20,right:40,top:30,bottom:10};p.fixing.type='screws';
  const result=buildProject(p);assert.equal(result.valid,true,JSON.stringify(result.errors));
  const piece=result.pieces[0],front=documentGeometry(piece,{back:false}),back=documentGeometry(piece,{back:true});
  assert.equal(front.grooves.find(x=>x.edge==='left').x1,20);
  assert.equal(back.grooves.find(x=>x.edge==='left').x1,340);
  assert.equal(back.grooves.find(x=>x.edge==='right').x1,40);
  assert.equal(front.drills[0].x,piece.blank.face.x+piece.fixings.screws[0].x);
  assert.equal(back.drills[0].x,360-front.drills[0].x);
  const svg=pieceSVG(piece,{project:p});
  assert.match(svg,/data-side="back"/);assert.match(svg,/VERSO — USINAGEM/);
  assert.doesNotMatch(svg,/scale\(-1/); // Mirror is in coordinates, never a second SVG transform.
});

test('CUT is black and FRESA red in SVG, DXF and nested router documents, with readable origin', () => {
  const {project,result,nesting}=projectFixture(),piece=result.pieces[0];
  const svg=pieceSVG(piece,{project});assert.match(svg,/<g id="CUT" stroke="#000000"/);assert.match(svg,/<g id="GROOVE" stroke="#ff0000" data-label="FRESA"/);assert.match(svg,/id="AXIS_LABELS"/);
  const dxf=dxfRecords(pieceDXF(piece,{project}));
  const cut=dxf.entities.find(e=>e.type==='LAYER'&&field(e,2)==='CUT'),groove=dxf.entities.find(e=>e.type==='LAYER'&&field(e,2)==='GROOVE');
  assert.equal(field(cut,62),'7');assert.equal(field(cut,420),'0');assert.equal(field(groove,62),'1');assert.equal(field(groove,420),'16711680');
  const report=projectReportHTML(project,result,nesting,{discipline:'router'});
  assert.match(report,/Corte preto \(CUT\) · Fresa vermelha \(GROOVE\)/);assert.match(report,/data-discipline="router"/);assert.doesNotMatch(report,/data-discipline="montagem"/);
});

test('explicit drill diameter is independent of the nominal screw and applies to developed coordinates', () => {
  const piece=asymmetricalPiece();piece.fixing={screwProduct:{nominalDiameter:4.2}};
  assert.equal(documentGeometry(piece).drills[0].diameter,null);
  piece.fixings.screws[0].drillDiameter=6;
  assert.equal(documentGeometry(piece).drills[0].diameter,6);
  assert.equal(field(dxfRecords(pieceDXF(piece)).entities.find(e=>e.type==='CIRCLE'),40),'3');
});

test('cadernos include escaped title block, explicit missing photos, structure gauge and actual end cuts', () => {
  const {project,result,nesting}=projectFixture();
  project.titleBlock={drawingNumber:'A-01',client:'<script>x</script>',site:'Estudo',designedBy:'Equipe',date:'2026-10-17'};
  result.structure.segments[0]={...result.structure.segments[0],gauge:'Chapa 18 informada',wall:1.2,angleA:45,angleB:90,longLength:870,shortLength:840,faceWidth:30,joint:'butt'};
  const html=projectReportHTML(project,result,nesting);
  assert.match(html,/Serralheria/);assert.match(html,/Foto real do produto não cadastrada/);assert.match(html,/Chapa 18 informada/);assert.match(html,/data-angle-a="45" data-angle-b="90"/);assert.match(html,/&lt;script&gt;x&lt;\/script&gt;/);assert.doesNotMatch(html,/<script/);
  const cut=structureCutSVG(result.structure.segments[0]);assert.match(cut,/M 0 0 H 870 L 870 30 H 30 Z/);
  const csv=structureCSV(project,result,nesting);assert.match(csv,/"Chapa 18 informada"/);assert.match(csv,/"45° \/ 90°"/);assert.match(csv,/"870";"1"/);
  const router=routerCSV(project,result,nesting);assert.match(router,/"VERSO";"CUT";"Preto"/);assert.match(router,/"GROOVE \/ FRESA";"Vermelho"/);
});

test('fixation product photographs only embed registered raster data, no remote resources or simulated photo', () => {
  const {project,result,nesting}=projectFixture();
  result.pieces[0].fixing={...result.pieces[0].fixing,type:'hybrid',screwProduct:{code:'Example-screw',manufacturer:'Example',photoDataUrl:png,nominalDiameter:4.2,drillDiameter:6},tapeProduct:{photoDataUrl:'https://untrusted.invalid/product.jpg'}};
  const report=projectReportHTML(project,result,nesting,{discipline:'montagem'});
  assert.match(report,/Foto enviada pelo usuário/);assert.ok(report.includes(`src="${png}"`));assert.match(report,/Foto real do produto não cadastrada/);assert.doesNotMatch(report,/src="https?:/);assert.match(report,/Diâmetro nominal/);assert.match(report,/Furo especificado/);
});
