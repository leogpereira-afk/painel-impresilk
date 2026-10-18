import { validateTechnicalDrawing, contourErrors, pointInContour, pointDistance, segmentsIntersect, TECHNICAL_LIMITS } from '../../../supabase/functions/_shared/acm-technical.mjs';
export const MAX_TECHNICAL_BYTES = 500000;
export const TECHNICAL_UNITS = Object.freeze({ mm:1, cm:10, m:1000, in:25.4, px:25.4/96 });
const EPS=1e-6, TAU=Math.PI*2;
const diagnostic=(code,message,layer,severity='error')=>({code,message,...(layer?{layer}:{}),severity});
const fail=(code,message)=>{const error=new Error(message);error.code=code;throw error;};
function number(value, fallback) {
  if(value==null && fallback!=null) return fallback;
  if(typeof value!=='string'||!/^[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?$/i.test(value.trim())) fail('NUMBER','Coordenada ou medida inválida.');
  const n=Number(value); if(!Number.isFinite(n)||Math.abs(n)>1e9) fail('NUMBER','Coordenada fora do limite.'); return n;
}
function numbers(value) {
  const matches=value.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/ig)||[];
  if(value.replace(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/ig,'').replace(/[\s,]/g,'')) fail('NUMBER','Lista de coordenadas inválida.');
  return matches.map(v=>number(v));
}
const same=(a,b)=>pointDistance(a,b)<EPS;
function sampleArc(cx,cy,rx,ry,start,span,rotation,tolerance) {
  if(!(rx>0&&ry>0)) fail('ARC','Raio deve ser positivo.');
  const radius=Math.max(rx,ry), step=2*Math.acos(Math.max(-1,Math.min(1,1-tolerance/radius)));
  let n=Math.max(4,Math.ceil(Math.abs(span)/Math.max(step,1e-6)));
  if(Math.abs(Math.abs(span)-TAU)<EPS)n=Math.ceil(n/4)*4;
  if(n>TECHNICAL_LIMITS.vertices-2) fail('GEOMETRY_LIMIT','Curva exige vértices demais; aumente a tolerância ou simplifique o arquivo.');
  const cr=Math.cos(rotation),sr=Math.sin(rotation);
  return Array.from({length:n+1},(_,i)=>{const t=start+span*i/n,x=rx*Math.cos(t),y=ry*Math.sin(t);return [cx+x*cr-y*sr,cy+x*sr+y*cr];});
}
function svgArc(a, params, tolerance) {
  let [rx,ry,angle,large,sweep,x,y]=params; const end=[x,y];
  if(![0,1].includes(large)||![0,1].includes(sweep)) fail('ARC','Flags de arco SVG devem ser 0 ou 1.');
  if(rx<0||ry<0) fail('ARC','Raio de arco SVG não pode ser negativo.');
  if(!rx||!ry) return [a,end]; if(same(a,end)) fail('ARC','Arco SVG com início e fim idênticos é ambíguo; use circle.');
  const phi=angle*Math.PI/180,co=Math.cos(phi),si=Math.sin(phi),dx=(a[0]-x)/2,dy=(a[1]-y)/2;
  const xp=co*dx+si*dy,yp=-si*dx+co*dy,lambda=xp*xp/(rx*rx)+yp*yp/(ry*ry);
  if(lambda>1){rx*=Math.sqrt(lambda);ry*=Math.sqrt(lambda);}
  const ratio=Math.max(0,(rx*rx*ry*ry-rx*rx*yp*yp-ry*ry*xp*xp)/(rx*rx*yp*yp+ry*ry*xp*xp));
  const q=(large===sweep?-1:1)*Math.sqrt(ratio),cxp=q*rx*yp/ry,cyp=-q*ry*xp/rx;
  const cx=co*cxp-si*cyp+(a[0]+x)/2,cy=si*cxp+co*cyp+(a[1]+y)/2;
  const start=Math.atan2((yp-cyp)/ry,(xp-cxp)/rx),finish=Math.atan2((-yp-cyp)/ry,(-xp-cxp)/rx);
  let span=finish-start; if(sweep&&span<0)span+=TAU;if(!sweep&&span>0)span-=TAU;
  const points=sampleArc(cx,cy,rx,ry,start,span,phi,tolerance);points[0]=a;points[points.length-1]=end;return points;
}
function bezier(points,tolerance,depth=0) {
  const [a,b]=[points[0],points.at(-1)];
  const distance=p=>{const dx=b[0]-a[0],dy=b[1]-a[1],d=dx*dx+dy*dy,t=d?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d)):0;return pointDistance(p,[a[0]+t*dx,a[1]+t*dy]);};
  if(points.slice(1,-1).every(p=>distance(p)<=tolerance)) return [a,b];
  if(depth>=16) fail('GEOMETRY_LIMIT','Curva não converge na tolerância solicitada.');
  const rows=[points];while(rows.at(-1).length>1)rows.push(rows.at(-1).slice(1).map((p,i)=>[(p[0]+rows.at(-1)[i][0])/2,(p[1]+rows.at(-1)[i][1])/2]));
  const left=rows.map(row=>row[0]),right=rows.map(row=>row.at(-1)).reverse();
  return [...bezier(left,tolerance,depth+1).slice(0,-1),...bezier(right,tolerance,depth+1)];
}
function paths(d,tolerance) {
  const tokens=d.match(/[a-z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/ig)||[];
  if(d.replace(/[a-z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/ig,'').replace(/[\s,]/g,'')) fail('SVG_PATH','Sintaxe de path inválida.');
  const result=[];let i=0,command='',current=[0,0],chain=null;
  const append=pts=>{chain.points.push(...pts);if(chain.points.length>TECHNICAL_LIMITS.vertices)fail('GEOMETRY_LIMIT','Contorno excede 1.200 vértices.');};
  while(i<tokens.length) {
    if(/^[a-z]$/i.test(tokens[i]))command=tokens[i++];
    const upper=command.toUpperCase(),relative=command!==upper;
    if(!'MLHVQC AZ'.replace(/ /g,'').includes(upper)||!upper)fail('UNSUPPORTED_CURVE',`Comando SVG ${command||'?'} não suportado. Converta para M/L/H/V/Q/C/A/Z.`);
    if(upper==='Z') {if(!chain)fail('SVG_PATH','Fechamento sem início.');chain.closed=true;current=chain.points[0];chain=null;command='';continue;}
    const count={M:2,L:2,H:1,V:1,Q:4,C:6,A:7}[upper];
    if(i+count>tokens.length||tokens.slice(i,i+count).some(v=>/^[a-z]$/i.test(v)))fail('SVG_PATH','Parâmetros incompletos de path.');
    const params=tokens.slice(i,i+count).map(v=>number(v));i+=count;
    const p=(x,y)=>[x+(relative?current[0]:0),y+(relative?current[1]:0)];let next;
    if(upper==='M'){current=p(...params);chain={points:[current],closed:false};result.push(chain);command=relative?'l':'L';continue;}
    if(!chain)fail('SVG_PATH','Path deve começar com M após cada fechamento.');
    if(upper==='L'){next=p(...params);append([next]);}
    if(upper==='H'){next=[params[0]+(relative?current[0]:0),current[1]];append([next]);}
    if(upper==='V'){next=[current[0],params[0]+(relative?current[1]:0)];append([next]);}
    if(upper==='Q'){next=p(params[2],params[3]);append(bezier([current,p(params[0],params[1]),next],tolerance).slice(1));}
    if(upper==='C'){next=p(params[4],params[5]);append(bezier([current,p(params[0],params[1]),p(params[2],params[3]),next],tolerance).slice(1));}
    if(upper==='A'){next=p(params[5],params[6]);append(svgArc(current,[...params.slice(0,5),...next],tolerance).slice(1));}
    current=next;
  }
  if(!result.length)fail('SVG_PATH','Path vazio.');return result;
}
function svgRead(text,options) {
  // This parser never creates a DOM, fetches a resource, evaluates CSS or inserts markup.
  if(/<!DOCTYPE|<!ENTITY|<!\[CDATA\[|<\?(?!xml\s)|\bon[a-z]+\s*=|\b(?:href|src)\s*=|<\s*(?:script|foreignObject|image|use|style|animate\w*|set)\b|url\s*\(/i.test(text))fail('UNSAFE_SVG','SVG ativo, com referência externa ou entidade XML foi bloqueado. Exporte somente geometria vetorial.');
  const cleaned=text.replace(/<\?xml\s[^?]*\?>/gi,'').replace(/<!--[\s\S]*?-->/g,'');
  const tags=cleaned.match(/<[^>]+>|[^<]+/g)||[],stack=[],entities=[],diagnostics=[];let factor=null,root=false,totalPoints=0;
  if(tags.length>6000)fail('GEOMETRY_LIMIT','SVG excede 6.000 elementos/textos.');
  const attributeRx=/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for(const token of tags) {
    if(!token.startsWith('<')){if(token.trim()&&!stack.some(s=>['text','title','desc','metadata'].includes(s.tag)))fail('SVG_XML','Texto fora de elemento SVG.');continue;}
    const match=token.match(/^<\s*(\/?)\s*([\w:.-]+)([\s\S]*?)(\/?)>$/);if(!match)fail('SVG_XML','XML SVG malformado.');
    const [,closing,tag,raw,self]=match;
    if(!closing&&root&&!stack.length)fail('SVG_XML','SVG deve conter apenas uma raiz.');
    if(closing){if(raw.trim()||self||stack.pop()?.tag!==tag)fail('SVG_XML','Fechamento XML incompatível.');continue;}
    const attrs={};let m;attributeRx.lastIndex=0;
    while((m=attributeRx.exec(raw))){if(Object.hasOwn(attrs,m[1]))fail('SVG_XML','Atributo SVG duplicado.');attrs[m[1]]=m[2]??m[3];}
    if(raw.replace(attributeRx,'').trim())fail('SVG_XML','Atributos SVG malformados.');
    if(Object.values(attrs).some(v=>/&(?!(?:amp|quot|apos|lt|gt);)/.test(v)))fail('UNSAFE_SVG','Referência XML não permitida.');
    if(stack.length>32)fail('SVG_XML','SVG excede profundidade permitida.');
    const parent=stack.at(-1),layer=attrs['inkscape:label']||attrs['data-layer']||(tag==='g'&&attrs.id)||parent?.layer||'Geometria';
    if(!root){if(tag!=='svg')fail('SVG_XML','Raiz deve ser svg.');root=true;
      const vb=attrs.viewBox?numbers(attrs.viewBox):null;
      if(vb&&(vb.length!==4||vb[2]<=0||vb[3]<=0))fail('SVG_UNITS','viewBox inválido.');
      const physical=v=>{const mm=v?.match(/^([\d.e+-]+)(mm|cm|m|in|px)$/i);return mm?number(mm[1])*TECHNICAL_UNITS[mm[2].toLowerCase()]:null;};
      const w=physical(attrs.width),h=physical(attrs.height);
      if(options.unit&&options.unit!=='auto')factor=TECHNICAL_UNITS[options.unit];
      else if(vb&&w&&h){if(Math.abs(w/vb[2]-h/vb[3])>1e-6)fail('SVG_UNITS','Escala desigual nos eixos. Exporte escala uniforme antes da importação.');factor=w/vb[2];}
      else {factor=TECHNICAL_UNITS.px;diagnostics.push(diagnostic('ASSUMED_UNIT','SVG sem unidade física inequívoca: adotados pixels a 96 dpi; confirme a medida de referência.',null,'warning'));}
    } else if(tag==='svg')fail('UNSUPPORTED_ENTITY','SVG aninhado não é suportado.');
    const role=options.layers?.[layer];const ignored=role==='ignore';
    if(attrs.transform&&!ignored)diagnostics.push(diagnostic('UNSUPPORTED_TRANSFORM',`Camada ${layer}: aplique a transformação no editor vetorial antes de exportar.`,layer));
    const styles=(attrs.style||'').split(';').filter(v=>v.trim()).map(v=>v.trim().split(':')[0].trim());
    const badAttribute=['display','visibility','clip-path','mask','filter'].some(k=>attrs[k]!=null);
    const badStyle=badAttribute||styles.some(key=>!['fill','stroke','stroke-width','fill-rule','fill-opacity','stroke-opacity','opacity','stroke-linejoin','stroke-linecap','stroke-miterlimit','stroke-dasharray','stroke-dashoffset'].includes(key));
    if(badStyle&&!ignored)diagnostics.push(diagnostic('UNSUPPORTED_STYLE','CSS que altera geometria/visibilidade não é suportado. Aplique o estilo à geometria antes de exportar.',layer));
    const inheritedBad=parent?.bad||!!attrs.transform||badStyle;
    const state={tag,layer,bad:inheritedBad};if(!self)stack.push(state);
    if(['svg','g','title','desc','metadata'].includes(tag))continue;
    if(parent&&['title','desc','metadata'].includes(parent.tag))continue;
    if(inheritedBad&&!ignored){if(parent?.bad&&!attrs.transform&&!badStyle)diagnostics.push(diagnostic('UNSUPPORTED_TRANSFORM','Transformação/estilo herdado não foi aplicado. Converta a geometria no editor.',layer));continue;}
    if(entities.length>=1000)fail('GEOMETRY_LIMIT','Arquivo excede 1.000 entidades.');
    if(ignored){entities.push({layer,unsupported:tag,ignored:true});continue;}
    if(!['rect','circle','ellipse','line','polyline','polygon','path'].includes(tag)){entities.push({layer,unsupported:tag});continue;}
    const length=(key,def)=>{const rawValue=attrs[key];if(rawValue==null&&def!=null)return def;const mm=rawValue?.match(/^([-+\d.e]+)(mm|cm|m|in|px)$/i);return mm?number(mm[1])*TECHNICAL_UNITS[mm[2].toLowerCase()]/factor:number(rawValue);};
    let shapes=[];
    if(tag==='rect'){const x=length('x',0),y=length('y',0),w=length('width'),h=length('height');if(w<=0||h<=0)fail('SVG_SIZE','Retângulo deve ter dimensões positivas.');if(length('rx',0)||length('ry',0)){entities.push({layer,unsupported:'rect arredondado; converta em path'});continue;}shapes=[{closed:true,points:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]]}];}
    if(tag==='circle'||tag==='ellipse'){const x=length('cx',0),y=length('cy',0),rx=length(tag==='circle'?'r':'rx'),ry=tag==='circle'?rx:length('ry');const pts=sampleArc(x,y,rx,ry,0,TAU,0,options.sourceTolerance/factor).slice(0,-1);shapes=[{closed:true,points:pts,...(tag==='circle'?{circle:{x,y,radius:rx}}:{})}];}
    if(tag==='line')shapes=[{closed:false,points:[[length('x1',0),length('y1',0)],[length('x2',0),length('y2',0)]]}];
    if(tag==='polyline'||tag==='polygon'){const values=numbers(attrs.points||'');if(values.length<4||values.length%2)fail('SVG_POINTS','Lista points inválida.');shapes=[{closed:tag==='polygon',points:values.reduce((a,v,i)=>{if(i%2===0)a.push([v,values[i+1]]);return a;},[])}];}
    if(tag==='path')shapes=paths(attrs.d||'',options.sourceTolerance/factor);
    totalPoints+=shapes.reduce((n,shape)=>n+shape.points.length,0);if(totalPoints>TECHNICAL_LIMITS.totalVertices)fail('GEOMETRY_LIMIT','Geometria excede 5.000 vértices.');
    entities.push(...shapes.map(shape=>({...shape,layer})));
    if(entities.length>1000)fail('GEOMETRY_LIMIT','Arquivo excede 1.000 entidades.');
  }
  if(stack.length||!root)fail('SVG_XML','SVG incompleto.');return {entities,diagnostics,factor,flipY:true};
}
function dxfRead(text,options) {
  if(text.startsWith('AutoCAD Binary DXF'))fail('DXF_BINARY','DXF binário não suportado; exporte DXF ASCII 2D.');
  const lines=text.replace(/^\uFEFF/,'').trimEnd().split(/\r?\n/);if(lines.length%2)fail('DXF_SYNTAX','DXF deve ter pares código/valor.');
  const pairs=[];for(let i=0;i<lines.length;i+=2){if(!/^\s*\d+\s*$/.test(lines[i]))fail('DXF_SYNTAX','Código DXF inválido.');pairs.push([Number(lines[i]),lines[i+1].trim()]);}
  if(pairs.at(-1)?.[0]!==0||pairs.at(-1)?.[1]!=='EOF')fail('DXF_SYNTAX','DXF deve terminar com EOF.');
  const entities=[],diagnostics=[];let section='',units=0,found=false,totalPoints=0;
  for(let i=0;i<pairs.length;i++) {
    const [code,value]=pairs[i];
    if(code===0&&value==='SECTION'){if(section)fail('DXF_SYNTAX','Seção DXF aninhada.');if(pairs[i+1]?.[0]!==2)fail('DXF_SYNTAX','Seção DXF sem nome.');section=pairs[++i][1];continue;}
    if(code===0&&value==='ENDSEC'){if(!section)fail('DXF_SYNTAX','ENDSEC sem seção.');section='';continue;}
    if(code===0&&value==='EOF'&&section)fail('DXF_SYNTAX','Seção DXF incompleta.');
    if(section==='HEADER'&&code===9&&value==='$INSUNITS')units=Number(pairs[i+1]?.[1]);
    if(section!=='ENTITIES'||code!==0)continue;
    found=true;const record=[];while(i+1<pairs.length&&pairs[i+1][0]!==0)record.push(pairs[++i]);
    const values=c=>record.filter(p=>p[0]===c).map(p=>p[1]),one=(c,def)=>{const v=values(c);if(v.length>1)fail('DXF_SYNTAX',`Campo DXF ${c} repetido.`);return v.length?number(v[0]):def;};
    if(entities.length>=1000)fail('GEOMETRY_LIMIT','Arquivo excede 1.000 entidades.');
    const layer=values(8)[0]||'0',role=options.layers?.[layer];
    if(role==='ignore'){entities.push({layer,ignored:true,unsupported:value});continue;}
    if([30,31,32,33,38,39,210,220].some(c=>values(c).some(v=>number(v)!==0))||values(230).some(v=>number(v)!==1)) {diagnostics.push(diagnostic('SPATIAL_GEOMETRY',`${value} em ${layer}: geometria espacial/OCS não desenvolvida. Exporte referência plana 2D com Z=0.`,layer));continue;}
    if(!['LINE','LWPOLYLINE','ARC','CIRCLE'].includes(value)){entities.push({layer,unsupported:value});continue;}
    if(value==='LINE')entities.push({layer,closed:false,points:[[one(10),one(20)],[one(11),one(21)]]});
    if(value==='CIRCLE'||value==='ARC') {
      const x=one(10),y=one(20),radius=one(40),start=value==='CIRCLE'?0:one(50)*Math.PI/180;
      let span=value==='CIRCLE'?TAU:(one(51)*Math.PI/180-start+TAU)%TAU;if(!span)fail('ARC','Arco DXF com extensão nula.');
      const factor=options.unit&&options.unit!=='auto'?TECHNICAL_UNITS[options.unit]:({1:25.4,2:304.8,4:1,5:10,6:1000,9:.0254}[units]||1);
      const points=sampleArc(x,y,radius,radius,start,span,0,options.sourceTolerance/factor);
      entities.push({layer,closed:value==='CIRCLE',points:value==='CIRCLE'?points.slice(0,-1):points,...(value==='CIRCLE'?{circle:{x,y,radius}}:{})});
    }
    if(value==='LWPOLYLINE') {
      if([40,41,43].some(c=>values(c).some(v=>number(v)!==0))){entities.push({layer,unsupported:'LWPOLYLINE com largura variável/constante'});continue;}
      const flags=one(70,0);if(flags&~129)fail('SPATIAL_GEOMETRY','Flags da polilinha DXF não suportadas.');
      const verts=[];for(const [c,v] of record){if(c===10)verts.push({x:number(v)});if(c===20){if(!verts.length)fail('DXF_SYNTAX','Y sem X em polilinha.');verts.at(-1).y=number(v);}if(c===42){if(!verts.length)fail('DXF_SYNTAX','Bulge sem vértice.');verts.at(-1).bulge=number(v);}}
      if(verts.length<2||verts.length!==one(90)||verts.some(v=>!Number.isFinite(v.y)))fail('DXF_SYNTAX','Contagem/coordenadas da polilinha inválidas.');
      const points=[],closed=!!(flags&1),factor=options.unit&&options.unit!=='auto'?TECHNICAL_UNITS[options.unit]:({1:25.4,2:304.8,4:1,5:10,6:1000,9:.0254}[units]||1);
      for(let k=0;k<verts.length;k++) {
        const v=verts[k],a=[v.x,v.y],next=verts[(k+1)%verts.length];points.push(a);
        if(!closed&&k===verts.length-1)break;
        if(v.bulge){const b=[next.x,next.y],chord=pointDistance(a,b);if(chord<EPS)fail('ARC','Bulge com segmento nulo.');const bulge=v.bulge,span=4*Math.atan(bulge),radius=chord*(1+bulge*bulge)/(4*Math.abs(bulge)),offset=chord*(1-bulge*bulge)/(4*bulge),cx=(a[0]+b[0])/2-(b[1]-a[1])/chord*offset,cy=(a[1]+b[1])/2+(b[0]-a[0])/chord*offset;points.push(...sampleArc(cx,cy,radius,radius,Math.atan2(a[1]-cy,a[0]-cx),span,0,options.sourceTolerance/factor).slice(1,-1));}
      }
      entities.push({layer,closed,points});
    }
    totalPoints+=entities.at(-1)?.points?.length||0;if(totalPoints>TECHNICAL_LIMITS.totalVertices)fail('GEOMETRY_LIMIT','Geometria excede 5.000 vértices.');
  }
  if(!found)fail('DXF_EMPTY','DXF não contém seção ENTITIES com geometria.');
  const known={1:25.4,2:304.8,4:1,5:10,6:1000,9:.0254};
  if((!options.unit||options.unit==='auto')&&!known[units]){if(units!==0)fail('DXF_UNITS',`INSUNITS ${units} não suportada; selecione a unidade explicitamente.`);diagnostics.push(diagnostic('ASSUMED_UNIT','DXF sem INSUNITS: adotado mm; confirme a medida de referência.',null,'warning'));}
  return {entities,diagnostics,factor:options.unit&&options.unit!=='auto'?TECHNICAL_UNITS[options.unit]:known[units]||1,flipY:false};
}
function connect(open,diagnostics) {
  const remaining=open.map(e=>({...e,points:[...e.points]})),closed=[];
  while(remaining.length) {
    const chain=remaining.shift();let changed=true;
    while(!same(chain.points[0],chain.points.at(-1))&&changed){changed=false;
      const candidates=[];for(let i=0;i<remaining.length;i++){const e=remaining[i];if(e.layer===chain.layer&&(same(chain.points.at(-1),e.points[0])||same(chain.points.at(-1),e.points.at(-1))))candidates.push(i);}
      if(candidates.length>1){diagnostics.push(diagnostic('AMBIGUOUS_CONTOUR','Junção de entidades tem mais de um caminho; remova ramificações/duplicatas.',chain.layer));break;}
      if(candidates.length){const next=remaining.splice(candidates[0],1)[0],pts=same(chain.points.at(-1),next.points[0])?next.points:[...next.points].reverse();chain.points.push(...pts.slice(1));changed=true;}
    }
    if(same(chain.points[0],chain.points.at(-1))){chain.points.pop();chain.closed=true;closed.push(chain);}else diagnostics.push(diagnostic('OPEN_CONTOUR','Contorno aberto; una os extremos no editor ou mapeie a camada como sulco.',chain.layer));
  }
  return closed;
}
const rounds=n=>Math.round(n*1e8)/1e8;
export function parseTechnicalFile(text,options={}) {
  const diagnostics=[];let layers=[],sourceBounds=null;
  try {
    if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_TECHNICAL_BYTES)fail('FILE_LIMIT','Arquivo técnico deve ser texto até 500 kB.');
    const tolerance=options.tolerance??.25,scale=options.scale??1,quantity=options.quantity??1;
    if(!Number.isFinite(tolerance)||tolerance<.01||tolerance>5)fail('TOLERANCE','Tolerância deve ficar entre 0,01 e 5 mm.');
    if(!Number.isFinite(scale)||scale<=0||scale>100000)fail('SCALE','Escala deve ser positiva e até 100.000.');
    if(!Number.isInteger(quantity)||quantity<1||quantity>100)fail('QUANTITY','Quantidade por peça deve ficar entre 1 e 100.');
    if(options.unit&&options.unit!=='auto'&&!Object.hasOwn(TECHNICAL_UNITS,options.unit))fail('UNIT','Unidade não suportada.');
    let referenceFactor=1;
    if(options.reference){const {sourceLength,targetLength}=options.reference;if(!Number.isFinite(sourceLength)||!Number.isFinite(targetLength)||sourceLength<=0||targetLength<=0)fail('REFERENCE','Informe as duas medidas positivas da referência.');referenceFactor=targetLength/sourceLength;}
    const effectiveScale=scale*referenceFactor;
    if(effectiveScale>100000||effectiveScale<1e-8)fail('SCALE','Escala efetiva fora do limite.');
    const format=(options.format||options.name?.split('.').at(-1)||'').toLowerCase();
    const readOptions={...options,sourceTolerance:tolerance/effectiveScale};
    const source=format==='svg'?svgRead(text,readOptions):format==='dxf'?dxfRead(text,readOptions):fail('FORMAT','Selecione SVG ou DXF ASCII.');
    diagnostics.push(...source.diagnostics);const factor=source.factor*effectiveScale;
    const layerSet=new Set(source.entities.map(e=>e.layer));source.diagnostics.forEach(d=>d.layer&&layerSet.add(d.layer));layers=[...layerSet].map(name=>({name,count:source.entities.filter(e=>e.layer===name).length,role:options.layers?.[name]||'contour'}));
    for(const layer of layers)if(!['contour','groove','ignore'].includes(layer.role))fail('LAYER_ROLE','Mapeamento de camada inválido.');
    const contours=[],open=[],grooves=[];let total=0;
    for(const entity of source.entities) {
      const role=options.layers?.[entity.layer]||'contour';
      if(role==='ignore'){continue;}
      if(entity.unsupported){diagnostics.push(diagnostic('UNSUPPORTED_ENTITY',`Entidade ${entity.unsupported} não suportada na camada ${entity.layer}. Converta ou ignore essa camada explicitamente.`,entity.layer));continue;}
      const e={...entity,points:entity.points.map(([x,y])=>{if(!Number.isFinite(x)||!Number.isFinite(y))fail('NUMBER','Coordenada DXF ausente ou inválida.');return [rounds(x*factor),rounds(y*factor*(source.flipY?-1:1))];})};
      if(e.circle)e.circle={x:e.circle.x*factor,y:e.circle.y*factor*(source.flipY?-1:1),radius:e.circle.radius*factor};
      total+=e.points.length;if(total>TECHNICAL_LIMITS.totalVertices)fail('GEOMETRY_LIMIT','Geometria excede 5.000 vértices.');
      if(e.points.length>1&&same(e.points[0],e.points.at(-1))){e.closed=true;e.points.pop();}
      if(role==='groove'){if(e.closed||e.points.length!==2){diagnostics.push(diagnostic('UNSUPPORTED_GROOVE','Sulcos suportados são segmentos retos abertos; curvas/contornos fechados não viram sulcos.',e.layer));continue;}grooves.push(e);}
      else if(e.closed)contours.push(e);else open.push(e);
    }
    for(const layer of layers.filter(l=>l.role==='ignore'))diagnostics.push(diagnostic('LAYER_IGNORED',`Camada ${layer.name} ignorada por escolha explícita (${layer.count} entidades).`,layer.name,'warning'));
    contours.push(...connect(open,diagnostics));
    if(!contours.length)diagnostics.push(diagnostic('NO_CONTOUR','Nenhum contorno fechado de corte disponível.'));
    const bounds=c=>({minX:Math.min(...c.points.map(p=>p[0])),minY:Math.min(...c.points.map(p=>p[1])),maxX:Math.max(...c.points.map(p=>p[0])),maxY:Math.max(...c.points.map(p=>p[1]))});
    if(contours.length){const b=contours.map(bounds);sourceBounds={width:Math.max(...b.map(x=>x.maxX))-Math.min(...b.map(x=>x.minX)),height:Math.max(...b.map(x=>x.maxY))-Math.min(...b.map(x=>x.minY))};}
    const signature=c=>c.points.map(p=>p.map(rounds).join(',')).sort().join('|'),seen=new Set();
    for(const c of contours){const key=signature(c);if(seen.has(key))diagnostics.push(diagnostic('DUPLICATE_GEOMETRY','Contorno duplicado.',c.layer));seen.add(key);for(const code of contourErrors(c.points))diagnostics.push(diagnostic(code,'Contorno cruzado, degenerado ou com vértices duplicados.',c.layer));}
    if(diagnostics.some(d=>d.severity==='error'))return {drawing:null,diagnostics,layers,sourceBounds};
    for(let i=0;i<contours.length;i++)for(let j=i+1;j<contours.length;j++) {
      const a=contours[i],b=contours[j];
      if(a.points.some((p,k)=>b.points.some((q,l)=>segmentsIntersect(p,a.points[(k+1)%a.points.length],q,b.points[(l+1)%b.points.length]))))diagnostics.push(diagnostic('CONTOUR_INTERSECTION','Contornos se cruzam ou são tangentes. Separe/limpe a geometria antes de aplicar.'));
    }
    const depth=c=>contours.filter(other=>other!==c&&pointInContour(c.points[0],other.points)).length;
    const outer=contours.filter(c=>depth(c)===0),parts=outer.map((c,i)=>{const b=bounds(c);return{id:`tecnica-${i+1}`,width:rounds(b.maxX-b.minX),height:rounds(b.maxY-b.minY),contour:c.points.map(p=>[rounds(p[0]-b.minX),rounds(p[1]-b.minY)]),holes:[],grooves:[],quantity};});
    for(const c of contours.filter(c=>depth(c)>0)) {
      if(depth(c)!==1||!c.circle){diagnostics.push(diagnostic('UNSUPPORTED_HOLE','Recortes internos devem ser círculos; ilhas e furos não circulares exigem desenvolvimento específico.',c.layer));continue;}
      const index=outer.findIndex(o=>pointInContour(c.points[0],o.points)),b=bounds(outer[index]);parts[index].holes.push({x:rounds(c.circle.x-b.minX),y:rounds(c.circle.y-b.minY),diameter:rounds(c.circle.radius*2)});
    }
    for(const g of grooves){const [a,b]=g.points,index=outer.findIndex(c=>pointInContour(a,c.points)&&pointInContour(b,c.points));if(index<0){diagnostics.push(diagnostic('GROOVE_OUTSIDE','Sulco fora de uma peça ou cruzando peças.',g.layer));continue;}const box=bounds(outer[index]);parts[index].grooves.push({x1:rounds(a[0]-box.minX),y1:rounds(a[1]-box.minY),x2:rounds(b[0]-box.minX),y2:rounds(b[1]-box.minY)});}
    const drawing={version:1,name:(options.name||'Desenho técnico').slice(0,200),unit:'mm',tolerance,parts};
    diagnostics.push(...validateTechnicalDrawing(drawing).map(d=>({...d,severity:'error'})));
    diagnostics.push(diagnostic('APPROXIMATION',`Curvas aproximadas em segmentos com tolerância de ${tolerance} mm. Furos circulares preservam diâmetro analítico.`,null,'info'));
    return {drawing:diagnostics.some(d=>d.severity==='error')?null:drawing,diagnostics,layers,sourceBounds};
  } catch(error) {diagnostics.push(diagnostic(error.code||'IMPORT_ERROR',error.message||'Falha ao interpretar o arquivo.'));return {drawing:null,diagnostics,layers,sourceBounds};}
}
