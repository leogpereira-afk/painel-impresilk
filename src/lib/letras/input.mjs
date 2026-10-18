// Shared boundary: presentation/technical cards cannot invalidate nominal geometry.
export function geometryInput(p){return Object.fromEntries(['id','revision','product','schemaVersion','unit','units','text','artwork','construction','materials','stock'].map(k=>[k,p?.[k]]));}
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export function letterGeometrySignature(p){const input=JSON.stringify(canonical(geometryInput(p)));let hash=2166136261;for(let i=0;i<input.length;i++)hash=Math.imul(hash^input.charCodeAt(i),16777619);return `letters-2:${input.length}:${(hash>>>0).toString(16)}`;}
