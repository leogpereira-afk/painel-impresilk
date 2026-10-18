import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTechnicalFile, MAX_TECHNICAL_BYTES } from './technical-import.mjs';
import { validateTechnicalDrawing } from '../../../supabase/functions/_shared/acm-technical.mjs';
const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50">${body}</svg>`;
const rect = '<rect x="0" y="0" width="100" height="50"/>';
const parse = (body, options = {}) => parseTechnicalFile(svg(body), { name: 'ficticio.svg', ...options });
const dxf = entities => `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${entities}0\nENDSEC\n0\nEOF\n`;
const lw = points => `0\nLWPOLYLINE\n8\nCORTE\n90\n${points.length}\n70\n1\n${points.map(([x,y]) => `10\n${x}\n20\n${y}\n`).join('')}`;
const errors = result => result.diagnostics.filter(d => d.severity === 'error').map(d => d.code);
test('SVG physical viewBox maps mm and flips Y with circular inner hole', () => {
  const r = parse(`${rect}<circle cx="20" cy="10" r="3"/>`);
  assert.deepEqual(errors(r), []); assert.equal(r.drawing.parts[0].width, 100);
  assert.deepEqual(r.drawing.parts[0].holes, [{ x:20,y:40,diameter:6 }]);
  assert.deepEqual(validateTechnicalDrawing(r.drawing), []);
});
test('explicit inch unit and scale apply to both dimensions and holes', () => {
  const r = parseTechnicalFile('<svg><rect width="2" height="1"/><circle cx="1" cy=".5" r=".1"/></svg>', {format:'svg',unit:'in',scale:2});
  assert.equal(r.drawing.parts[0].width, 101.6); assert.equal(r.drawing.parts[0].height,50.8);
  assert.ok(Math.abs(r.drawing.parts[0].holes[0].diameter - 10.16) < 1e-8);
});
test('reference measurement corrects source size', () => {
  const r = parse(rect,{reference:{sourceLength:100,targetLength:200}});
  assert.equal(r.drawing.parts[0].width,200);
});
test('SVG closed paths with lines, cubic and quadratic curves are tessellated', () => {
  const r = parse('<path d="M0 0 L100 0 Q100 10 90 20 C80 30 60 50 0 50 Z"/>');
  assert.deepEqual(errors(r), []); assert.ok(r.drawing.parts[0].contour.length > 8);
});
test('SVG circular arc is bounded and joins contour', () => {
  const r = parse('<path d="M0 0 H80 A20 20 0 0 1 100 20 V50 H0 Z"/>');
  assert.deepEqual(errors(r), []); assert.ok(r.drawing.parts[0].contour.length > 8);
});
test('DXF rectangle and hole honor INSUNITS and units', () => {
  const r = parseTechnicalFile(dxf(`${lw([[0,0],[100,0],[100,50],[0,50]])}0\nCIRCLE\n8\nCORTE\n10\n20\n20\n10\n40\n3\n`),{format:'dxf'});
  assert.deepEqual(errors(r), []); assert.deepEqual(r.drawing.parts[0].holes,[{x:20,y:10,diameter:6}]);
});
test('DXF arcs and lines stitch into a closed contour', () => {
  const lines = [[[-10,0],[10,0]],[[10,0],[10,10]],[[-10,10],[-10,0]]].map(([a,b]) => `0\nLINE\n8\nCUT\n10\n${a[0]}\n20\n${a[1]}\n11\n${b[0]}\n21\n${b[1]}\n`).join('');
  const r = parseTechnicalFile(dxf(`${lines}0\nARC\n8\nCUT\n10\n0\n20\n10\n40\n10\n50\n0\n51\n180\n`),{format:'dxf'});
  assert.deepEqual(errors(r), []); assert.equal(r.drawing.parts[0].height,20);
});
test('DXF bulge arcs preserve circular edges', () => {
  const r = parseTechnicalFile(dxf('0\nLWPOLYLINE\n8\nCUT\n90\n2\n70\n1\n10\n0\n20\n0\n42\n1\n10\n20\n20\n0\n42\n1\n'),{format:'dxf'});
  assert.deepEqual(errors(r), []); assert.ok(Math.abs(r.drawing.parts[0].width-20) < .2);
});
test('layer mapping requires explicit ignore and separates straight grooves', () => {
  const source = `${rect}<g id="SULCO"><line x1="10" y1="10" x2="90" y2="10"/></g><g id="NOTA"><text>teste</text></g>`;
  assert.ok(errors(parse(source)).includes('UNSUPPORTED_ENTITY'));
  const r = parse(source,{layers:{SULCO:'groove',NOTA:'ignore'}});
  assert.deepEqual(errors(r),[]); assert.equal(r.drawing.parts[0].grooves.length,1);
  assert.ok(r.diagnostics.some(d => d.code==='LAYER_IGNORED'));
});
test('open and duplicate paths, crossings and internal noncircular holes are blocked', () => {
  assert.ok(errors(parse('<path d="M0 0 L50 0 L50 50"/>')).includes('OPEN_CONTOUR'));
  assert.ok(errors(parse(rect+rect)).includes('DUPLICATE_GEOMETRY'));
  assert.ok(errors(parse('<polygon points="0,0 100,50 0,50 100,0"/>')).includes('SELF_INTERSECTION'));
  assert.ok(errors(parse(`${rect}<rect x="20" y="20" width="5" height="5"/>`)).includes('UNSUPPORTED_HOLE'));
});
test('overlapping contours and holes touching the boundary cannot apply', () => {
  assert.ok(errors(parse(`${rect}<circle cx="0" cy="20" r="5"/>`)).length);
  assert.ok(errors(parse(`${rect}<rect x="80" y="20" width="30" height="40"/>`)).length);
});
test('malicious SVG is blocked even if layer is ignored and raw source never persisted', () => {
  for (const body of ['<script>alert(1)</script>', '<image href="https://example.test/a"/>','<rect width="1" height="1" onload="a()"/>', '<g style="fill:url(https://example.test)">'+rect+'</g>']) assert.ok(errors(parse(body)).includes('UNSAFE_SVG'));
  assert.ok(errors(parseTechnicalFile('<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///secret">]><svg/>',{format:'svg'})).includes('UNSAFE_SVG'));
  assert.equal(JSON.stringify(parse(rect).drawing).includes('<svg'),false);
});
test('spatial DXF, unsupported curves and SVG transforms are explicit errors', () => {
  assert.ok(errors(parseTechnicalFile(dxf('0\nLINE\n10\n0\n20\n0\n30\n3\n11\n10\n21\n0\n31\n3\n'),{format:'dxf'})).includes('SPATIAL_GEOMETRY'));
  assert.ok(errors(parseTechnicalFile(dxf('0\nSPLINE\n8\nCUT\n'),{format:'dxf'})).includes('UNSUPPORTED_ENTITY'));
  assert.ok(errors(parse(`<g transform="rotate(30)">${rect}</g>`)).includes('UNSUPPORTED_TRANSFORM'));
});
test('limits reject excessive bytes, scale, quantity, tiny tolerance and malformed numbers', () => {
  assert.ok(errors(parseTechnicalFile(' '.repeat(MAX_TECHNICAL_BYTES+1),{format:'svg'})).includes('FILE_LIMIT'));
  for (const options of [{scale:0},{scale:NaN},{tolerance:0},{quantity:1000}]) assert.ok(errors(parse(rect,options)).length);
  assert.ok(errors(parse('<rect width="NaN" height="5"/>')).length);
});
test('shared validator independently rejects bypassed schema and out of boundary holes/grooves', () => {
  const drawing = parse(rect).drawing;
  assert.ok(validateTechnicalDrawing({...drawing, unit:'in'}).length);
  assert.ok(validateTechnicalDrawing({...drawing,raw:'<svg/>'}).length);
  for (const patch of [{holes:[{x:1,y:1,diameter:8}]},{grooves:[{x1:1,y1:1,x2:200,y2:1}]},{contour:[[0,0],[100,50],[0,50],[100,0]]},{width:12}]) assert.ok(validateTechnicalDrawing({...drawing,parts:[{...drawing.parts[0],...patch}]}).length);
});
test('SVG geometry-changing CSS and multiple XML roots are blocked', () => {
  assert.ok(errors(parse(`<g style="transform:scale(2)">${rect}</g>`)).includes('UNSUPPORTED_STYLE'));
  assert.ok(errors(parseTechnicalFile(svg(rect)+svg(rect),{format:'svg'})).includes('SVG_XML'));
});
test('DXF polyline widths and malformed termination cannot silently become centerlines', () => {
  assert.ok(errors(parseTechnicalFile(dxf(lw([[0,0],[100,0],[100,50],[0,50]]).replace('90\n4','43\n2\n90\n4')),{format:'dxf'})).includes('UNSUPPORTED_ENTITY'));
  assert.ok(errors(parseTechnicalFile(dxf(lw([[0,0],[100,0],[100,50],[0,50]])).replace('0\nEOF\n',''),{format:'dxf'})).includes('DXF_SYNTAX'));
});
test('safe validator rejects concave-boundary escapes and malformed operation shapes', () => {
  const drawing={version:1,name:'sintetico',unit:'mm',tolerance:.25,parts:[{id:'a',width:100,height:100,quantity:1,contour:[[0,0],[100,0],[100,30],[30,30],[30,100],[0,100]],holes:[],grooves:[]}]};
  assert.deepEqual(validateTechnicalDrawing(drawing),[]);
  assert.ok(validateTechnicalDrawing({...drawing,parts:[{...drawing.parts[0],grooves:[{x1:10,y1:80,x2:80,y2:10}]}]}).some(d=>d.code==='TECHNICAL_GROOVE_BOUNDS'));
  assert.ok(validateTechnicalDrawing({...drawing,parts:[{...drawing.parts[0],holes:[{x:50,y:50,diameter:2}]}]}).some(d=>d.code==='TECHNICAL_HOLE_BOUNDS'));
});
test('hidden SVG geometry and paint-server properties are explicit diagnostics', () => {
  assert.ok(errors(parse(`<g display="none">${rect}</g>`)).includes('UNSUPPORTED_STYLE'));
  assert.ok(errors(parse(`<g clip-path="something">${rect}</g>`)).includes('UNSUPPORTED_STYLE'));
});
test('spatial reference layers can be ignored explicitly without flattening them', () => {
  const source=dxf(`${lw([[0,0],[100,0],[100,50],[0,50]])}0\nLINE\n8\nESPACIAL\n10\n0\n20\n0\n30\n10\n11\n20\n21\n0\n31\n30\n`);
  assert.ok(errors(parseTechnicalFile(source,{format:'dxf'})).includes('SPATIAL_GEOMETRY'));
  const r=parseTechnicalFile(source,{format:'dxf',layers:{ESPACIAL:'ignore'}});
  assert.deepEqual(errors(r),[]);assert.equal(r.drawing.parts[0].width,100);
  assert.ok(r.diagnostics.some(d=>d.code==='LAYER_IGNORED'&&d.layer==='ESPACIAL'));
});
test('missing units have visible assumptions; unknown physical units are not guessed', () => {
  const source=dxf(lw([[0,0],[100,0],[100,50],[0,50]])).replace('$INSUNITS\n70\n4','$INSUNITS\n70\n0');
  assert.ok(parseTechnicalFile(source,{format:'dxf'}).diagnostics.some(d=>d.code==='ASSUMED_UNIT'));
  assert.ok(errors(parseTechnicalFile(source.replace('$INSUNITS\n70\n0','$INSUNITS\n70\n99'),{format:'dxf'})).includes('DXF_UNITS'));
  assert.ok(errors(parseTechnicalFile(source.replace('$INSUNITS\n70\n0','$INSUNITS\n70\n99'),{format:'dxf',unit:'mm'})).length===0);
});
test('confirmed import survives project backup, engine and fabrication exports without losing holes/grooves', async () => {
  const { createProject } = await import('./model.mjs');
  const { buildProject } = await import('./engine.mjs');
  const { serializeProjectJSON, parseProjectJSON } = await import('./storage.mjs');
  const { pieceSVG, pieceDXF } = await import('./documents.mjs');
  const drawing=parse(`${rect}<circle cx="20" cy="10" r="3"/><g id="SULCO"><line x1="10" y1="25" x2="90" y2="25"/></g>`,{layers:{SULCO:'groove'},quantity:2}).drawing;
  const project={...createProject(),technicalDrawing:drawing},restored=parseProjectJSON(serializeProjectJSON(project));
  assert.deepEqual(restored.technicalDrawing,drawing);
  const result=buildProject(restored);assert.equal(result.valid,true);assert.equal(result.pieces.length,2);
  assert.deepEqual(result.pieces[0].blank.holes,drawing.parts[0].holes);
  assert.deepEqual(result.pieces[0].blank.grooves,drawing.parts[0].grooves);
  assert.match(pieceSVG(result.pieces[0]),/<circle/);assert.ok(/\r?\nCIRCLE\r?\n/.test(pieceDXF(result.pieces[0])));
  assert.equal(JSON.stringify(restored).includes('<svg'),false);
});
