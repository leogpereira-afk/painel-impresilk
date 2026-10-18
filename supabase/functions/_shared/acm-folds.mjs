/** Fold chains are ordered from the visible face out to the cut edge. Millimetres. */
const finite = n => typeof n === 'number' && Number.isFinite(n);
const clean = n => Math.abs(n) < 1e-8 ? 0 : Math.round(n * 1e6) / 1e6;
const obj = v => v && typeof v === 'object' && !Array.isArray(v);
export function edgeFolds(edge) {
  if (typeof edge === 'number') return edge > 0 ? [{ id: '1', length: edge, angle: 90, direction: 'back' }] : [];
  if (!edge || edge.type === 'none' || edge.height === 0 && !edge.folds?.length) return [];
  return edge.folds ?? [{ id: '1', length: edge.height, angle: 90, direction: 'back' }];
}
export function edgeExtent(edge) { return edgeFolds(edge).reduce((sum, op) => sum + op.length, 0); }
export function validateFoldEdge(edge, prefix) {
  const errors = [], add = message => errors.push({ code: 'EDGE_FOLDS', message: `${prefix}: ${message}` });
  if (typeof edge === 'number') return errors;
  if (!obj(edge) || !['none', 'fold'].includes(edge.type)) { add('tipo de borda inválido.'); return errors; }
  for (const key of Object.keys(edge)) if (!['type', 'height', 'folds'].includes(key)) add(`parâmetro de borda não suportado: ${key}.`);
  if (edge.type === 'none') {
    if (edge.height != null && edge.height !== 0 || edge.folds != null && (!Array.isArray(edge.folds) || edge.folds.length)) add('borda sem dobra não pode conter altura ou operações.');
    return errors;
  }
  if (edge.folds == null) return errors;
  if (!Array.isArray(edge.folds) || edge.folds.length < 1 || edge.folds.length > 4) { add('use de uma a quatro dobras por borda.'); return errors; }
  const ids = new Set();
  for (const [index, op] of edge.folds.entries()) {
    if (!obj(op)) { add(`dobra ${index + 1} inválida.`); continue; }
    for (const key of Object.keys(op)) if (!['id', 'length', 'angle', 'direction', 'compensation'].includes(key)) add(`parâmetro da dobra ${index + 1} não suportado: ${key}.`);
    if (typeof op.id !== 'string' || !op.id.trim() || op.id.length > 80 || ids.has(op.id)) add('cada dobra precisa de identificação única.');
    ids.add(op.id);
    if (!finite(op.length) || op.length <= 0 || op.length > 500) add(`dobra ${index + 1}: comprimento deve estar entre 0 e 500 mm, exclusivo de zero.`);
    if (!finite(op.angle) || op.angle <= 0 || op.angle >= 180) add(`dobra ${index + 1}: ângulo deve estar entre 0° e 180°, exclusivos.`);
    if (!['front', 'back'].includes(op.direction)) add(`dobra ${index + 1}: sentido deve ser front ou back.`);
    if (op.compensation != null && (!finite(op.compensation) || Math.abs(op.compensation) > 20)) add(`dobra ${index + 1}: compensação deve estar entre -20 e 20 mm.`);
  }
  if (edge.height !== edge.folds[0]?.length) add('altura deve coincidir com o primeiro segmento da cadeia.');
  return errors;
}
/** x is outward from the face edge; negative z is toward the back. angle is rotation, not cutter angle.
 * Compensation is deducted once from the segment following each operation, from its hinge outward. */
export function foldProfile(edge, fabrication = {}, edgeName = 'left') {
  const inherited = typeof fabrication.compensation === 'number' ? fabrication.compensation : fabrication.compensation?.[edgeName] ?? 0;
  let offset = 0, heading = 0, x = 0, z = 0;
  const points = [{ x: 0, z: 0 }];
  const operations = edgeFolds(edge).map((op, index) => {
    const compensation = op.compensation ?? inherited, developedLength = clean(op.length - compensation);
    const operation = { ...op, number: index + 1, compensation, developedLength, offset: clean(offset) };
    offset += developedLength;
    heading += (op.direction === 'back' ? -1 : 1) * op.angle * Math.PI / 180;
    x = clean(x + op.length * Math.cos(heading)); z = clean(z + op.length * Math.sin(heading));
    points.push({ x, z });
    return operation;
  });
  return { operations, points, totalDeveloped: clean(offset), totalNominal: edgeExtent(edge), inwardExtent: Math.max(0, ...points.map(p => -p.x)) };
}
function cross(a, b, c) { return (b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x); }
function intersects(a,b,c,d) {
  const eps=1e-6, within=(p,q,r)=>Math.abs(cross(p,q,r))<eps && r.x>=Math.min(p.x,q.x)-eps && r.x<=Math.max(p.x,q.x)+eps && r.z>=Math.min(p.z,q.z)-eps && r.z<=Math.max(p.z,q.z)+eps;
  return cross(a,b,c)*cross(a,b,d)<-eps && cross(c,d,a)*cross(c,d,b)<-eps || within(a,b,c)||within(a,b,d)||within(c,d,a)||within(c,d,b);
}
export function foldInterference(profiles, width, height) {
  const errors=[];
  for (const [edge, profile] of Object.entries(profiles)) {
    const points=profile.points, span=['left','right'].includes(edge)?width:height;
    for(let i=1;i<points.length;i++) {
      if(i>1 && intersects(points[i-1],points[i],{x:-span,z:0},{x:0,z:0})) errors.push(`${edge}: retorno cruza ou encosta na face principal.`);
      for(let j=1;j<i-1;j++) if(intersects(points[i-1],points[i],points[j-1],points[j])) errors.push(`${edge}: a cadeia de dobras cruza a si mesma.`);
    }
  }
  for(const [a,b,span] of [['left','right',width],['bottom','top',height]]) {
    const one=profiles[a].points.map(p=>({x:-p.x,z:p.z})), two=profiles[b].points.map(p=>({x:span+p.x,z:p.z}));
    for(let i=1;i<one.length;i++) for(let j=1;j<two.length;j++) if(intersects(one[i-1],one[i],two[j-1],two[j])) errors.push(`${a}/${b}: retornos opostos se interceptam.`);
  }
  return [...new Set(errors)];
}
