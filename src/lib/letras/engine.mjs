import {letterGeometrySignature} from './input.mjs';
export {letterGeometrySignature} from './input.mjs';
import {FontLoader} from 'three/addons/loaders/FontLoader.js';
import helvetiker from './fonts/helvetiker_regular.typeface.json' with {type:'json'};
import gentilis from './fonts/gentilis_regular.typeface.json' with {type:'json'};
const fonts={helvetiker_regular:helvetiker,gentilis_regular:gentilis};
import {LETTER_FAMILIES} from './model.mjs';
import {cleanRing,contourMetrics,perimeter,validateContours,ringsIntersect,pointInRing,insetContours} from './vectors.mjs';

const positive=n=>Number.isFinite(n)&&n>0;
export function validateLetterProject(p){const errors=[],pending=[];
 const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
 if(!object(p)||!object(p.text)||!object(p.construction)||!object(p.materials))return {errors:['Estrutura de projeto inválida.'],pending};
 const t=p.text,c=p.construction;const vector=p.artwork?.mode==='vector';
 if(typeof p.id!=='string'||!p.id||p.id.length>200||p.product!=='letra-caixa'||p.schemaVersion!==1||!Number.isInteger(p.revision)||p.revision<1||p.unit!=='mm'||p.units!=='mm')errors.push('Identidade, versão ou unidade do projeto inválida.');
 if(!vector&&(typeof t.value!=='string'||!t.value.trim()||t.value.length>200))errors.push('Informe texto de 1 a 200 caracteres.');
 if(!vector&&(typeof t.font!=='string'||!Object.hasOwn(fonts,t.font)))errors.push('Fonte tipográfica ausente ou não suportada; nenhuma substituição aplicada.');
 if(!vector&&(!positive(t.heightMm)||t.heightMm>10000))errors.push('Altura deve estar entre 0 e 10000 mm.');
 if(!vector&&t.widthMm!=null&&(!positive(t.widthMm)||t.widthMm>100000))errors.push('Largura inválida.');
 if(!vector&&(!Number.isFinite(t.letterSpacingMm)||t.letterSpacingMm<0||t.letterSpacingMm>10000||!positive(t.lineSpacing)||t.lineSpacing>10||!['left','center','right'].includes(t.align)))errors.push('Espaçamento ou alinhamento inválido.');
 const family=typeof c.family==='string'?c.family:'';
 if(!LETTER_FAMILIES.includes(family))errors.push('Família construtiva desconhecida.');
 if(!family.startsWith('flat-')&&(!positive(c.depthMm)||c.depthMm>10000))errors.push('Profundidade inválida.');
 const flat=family.startsWith('flat-');
 const specs=flat?c.layers:[p.materials.front,p.materials.side,p.materials.back].filter(s=>s!=null);
 if(flat&&(!Array.isArray(specs)||!specs.length||specs.length>20))errors.push('Informe entre 1 e 20 camadas.');
 if(family.startsWith('galvanized')){
 if(!object(p.materials.side)||(family==='galvanized-acrylic'&&!object(p.materials.front)))errors.push('Material de frente e lateral obrigatório.');
 if(p.materials.side?.material!=='galvanized')errors.push('Corpo galvanizado exige lateral galvanizada.');
 if(family==='galvanized-acrylic'&&p.materials.front?.material!=='acrylic')errors.push('Face acrílica exige material acrílico.');
 if(family==='galvanized-blind'&&p.artwork&&p.materials.front?.material!=='galvanized')errors.push('Caixa cega exige face metálica.');
 }
 for(const material of Array.isArray(specs)?specs:[]){if(!object(material)){errors.push('Camada inválida.');continue;}const {thickness,operation,material:kind}=material;
 if(!positive(thickness)||thickness>1000)errors.push('Espessura em mm obrigatória e limitada a 1000 mm.');
 if(!['mdf','acrylic','pvc','galvanized','acm','polymeric'].includes(kind))errors.push('Material desconhecido.');
 if(flat&&kind!==family.slice(5))errors.push('Material de camada incompatível com família selecionada.');
 if(!['router','laser-co2','laser-fiber','manual-cut'].includes(operation))errors.push('Processo desconhecido.');
 if(['pvc','polymeric'].includes(kind)&&typeof operation==='string'&&operation.startsWith('laser'))errors.push('PVC bloqueado para qualquer laser.');
 if(operation==='laser-fiber'&&kind!=='galvanized'||operation==='laser-co2'&&!['mdf','acrylic'].includes(kind))errors.push('Processo incompatível com material.');
 if(kind==='acm'&&operation!=='router'||kind==='polymeric'&&operation!=='manual-cut'||operation==='manual-cut'&&kind!=='polymeric')errors.push('ACM exige router; lateral polimérica exige corte manual declarado.');
 }
 if(!vector&&typeof t.value==='string'&&Object.hasOwn(fonts,t.font))for(const ch of t.value)if(!/\s/.test(ch)&&!Object.hasOwn(fonts[t.font].glyphs,ch))errors.push(`Glifo não disponível: ${ch}`);
 pending.push('Compatibilidade de máquina, material/espessura e parâmetros de oficina pendentes de conferência.');
 if(!flat){if(!object(p.materials.front)||!object(p.materials.side))errors.push('Face e lateral obrigatórias para corpo tridimensional.');
 if(family==='backlit'&&(p.materials.front?.material!=='galvanized'||p.materials.side?.material!=='galvanized'||p.materials.back?.material!=='acrylic'))errors.push('Retroiluminada exige face e lateral metálicas e fundo acrílico separado.');
 if(family==='acm'&&(p.materials.front?.material!=='acm'||!['galvanized','polymeric'].includes(p.materials.side?.material)))errors.push('ACM exige face ACM e lateral metálica ou polimérica separada.');
 if(family==='polymeric'&&(p.materials.front?.material!=='acrylic'||p.materials.side?.material!=='polymeric'))errors.push('Borda polimérica exige face acrílica e lateral polimérica.');
 for(const key of ['faceClearanceMm','standoffMm'])if(c[key]!=null&&(!Number.isFinite(c[key])||c[key]<0||c[key]>1000))errors.push('Folga ou afastamento inválido.');
 }
 if(p.artwork?.mode&&!['text','vector'].includes(p.artwork.mode))errors.push('Modo de arte inválido.');
 if(vector)errors.push(...validateArtwork(p.artwork));
 if(family==='acm')pending.push('ACM modelado como face plana e borda separada; frisos em V e dobra de curvas não são gerados.');
 if(family==='backlit')pending.push('Retroiluminação: conferir afastamento da parede, difusão do fundo e projeto de fixação; afastadores não dimensionados estruturalmente.');
 return {errors:[...new Set(errors)],pending};}
function hash(s){s=String(s);let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return(h>>>0).toString(16);}
export function validateArtwork(a){
 const errors=[];if(!a||!['svg','dxf'].includes(a.format)||typeof a.fileName!=='string'||a.fileName.length>300||a.scaleConfirmed!==true||!positive(a.widthMm)||!positive(a.heightMm)||a.widthMm>100000||a.heightMm>10000)return ['Arte vetorial inválida ou escala em mm não confirmada.'];
 if(!Array.isArray(a.contours)||!a.contours.length||a.contours.length>200)return ['Arte deve ter entre 1 e 200 formas.'];
 let count=0;const parsed=[];for(const c of a.contours){if(!c||!Array.isArray(c.outer)||!Array.isArray(c.holes)||c.holes.length>100)return ['Estrutura de contorno inválida.'];const contours={outer:[],holes:[]};for(const [i,ring] of [c.outer,...c.holes].entries()){if(!Array.isArray(ring)||ring.length<3||ring.length>2000)return ['Contorno fora do limite de 3 a 2000 pontos.'];count+=ring.length;if(count>8000)return ['Arte excede 8000 pontos.'];if(ring.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||p.some(v=>Math.abs(v)>100000)))return ['Coordenada vetorial inválida.'];const target=ring.map(([x,y])=>({x,y}));if(i===0)contours.outer=target;else contours.holes.push(target);}parsed.push(contours);}
 errors.push(...validateContours(parsed));for(const c of parsed){for(let i=0;i<c.holes.length;i++){if(ringsIntersect(c.outer,c.holes[i]))errors.push('Vazado toca o contorno externo.');for(let j=i+1;j<c.holes.length;j++)if(ringsIntersect(c.holes[i],c.holes[j])||pointInRing(c.holes[i][0],c.holes[j])||pointInRing(c.holes[j][0],c.holes[i]))errors.push('Vazados sobrepostos.');}}
 const contains=(p,c)=>pointInRing(p,c.outer)&&!c.holes.some(h=>pointInRing(p,h));for(let i=0;i<parsed.length;i++)for(let j=i+1;j<parsed.length;j++){const a=parsed[i],b=parsed[j];if([a.outer,...a.holes].some(x=>[b.outer,...b.holes].some(y=>ringsIntersect(x,y)))||contains(a.outer[0],b)||contains(b.outer[0],a))errors.push('Formas vetoriais se sobrepõem.');}
 const pts=parsed.flatMap(c=>c.outer);const w=Math.max(...pts.map(p=>p.x))-Math.min(...pts.map(p=>p.x)),h=Math.max(...pts.map(p=>p.y))-Math.min(...pts.map(p=>p.y));if(!(w>0&&h>0)||Math.abs(a.widthMm/a.heightMm-w/h)>1e-6*Math.max(1,w/h))errors.push('Escala vetorial deve preservar a proporção da arte.');return [...new Set(errors)];
}
function vectorLetters(a){const pts=a.contours.flatMap(c=>c.outer),minX=Math.min(...pts.map(p=>p[0])),minY=Math.min(...pts.map(p=>p[1])),w=Math.max(...pts.map(p=>p[0]))-minX,scale=a.widthMm/w;return a.contours.map((c,index)=>{const left=Math.min(...c.outer.map(p=>p[0])),bottom=Math.min(...c.outer.map(p=>p[1])),right=Math.max(...c.outer.map(p=>p[0])),top=Math.max(...c.outer.map(p=>p[1]));const ring=points=>points.map(([x,y])=>({x:(x-left)*scale,y:(y-bottom)*scale}));return {char:c.label||`Forma ${index+1}`,sourceId:c.id||`shape-${index+1}`,index,line:0,x:(left-minX)*scale,y:(bottom-minY)*scale,width:(right-left)*scale,height:(top-bottom)*scale,contours:[{outer:ring(c.outer),holes:c.holes.map(ring)}]};});}
function textLetters(p){
 const t=p.text;const fontData=fonts[t.font],font=new FontLoader().parse(fontData);const lines=t.value.split('\n');const all=[];let index=0;
 lines.forEach((line,li)=>{let cursor=0;for(const ch of line){const shapes=font.generateShapes(ch,100);const contours=shapes.map(s=>({outer:cleanRing(s.getPoints(32)),holes:s.holes.map(h=>cleanRing(h.getPoints(32)))}));const pts=contours.flatMap(s=>[...s.outer,...s.holes.flat()]);if(pts.length){const minX=Math.min(...pts.map(q=>q.x)),maxX=Math.max(...pts.map(q=>q.x)),minY=Math.min(...pts.map(q=>q.y)),maxY=Math.max(...pts.map(q=>q.y));all.push({char:ch,index:index++,line:li,cursor,minX,maxX,minY,maxY,contours});}cursor+=(fontData.glyphs[ch]?.ha||fontData.glyphs[' '].ha)/fontData.resolution*100;}});
 if(!all.length)return [];
 const firstMin=Math.min(...all.filter(l=>l.line===all[0].line).map(l=>l.minY)),firstMax=Math.max(...all.filter(l=>l.line===all[0].line).map(l=>l.maxY));const scale=t.heightMm/(firstMax-firstMin);const lineMin=lines.map((_,li)=>{const members=all.filter(l=>l.line===li);return members.length?Math.min(...members.map((l,j)=>(l.cursor+l.minX)*scale+j*t.letterSpacingMm)):0;});const widths=lines.map((_,li)=>{const members=all.filter(l=>l.line===li);return members.length?Math.max(...members.map((l,j)=>(l.cursor+l.maxX)*scale+j*t.letterSpacingMm))-lineMin[li]:0;});const maxWidth=Math.max(...widths);
 all.forEach(l=>{const siblings=all.filter(a=>a.line===l.line),j=siblings.indexOf(l),offset=t.align==='center'?(maxWidth-widths[l.line])/2:t.align==='right'?maxWidth-widths[l.line]:0;l.x=(l.cursor+l.minX)*scale+j*t.letterSpacingMm-lineMin[l.line]+offset;l.y=(l.minY-firstMin)*scale-l.line*t.heightMm*t.lineSpacing;l.width=(l.maxX-l.minX)*scale;l.height=(l.maxY-l.minY)*scale;l.contours=l.contours.map(a=>({outer:a.outer.map(q=>({x:(q.x-l.minX)*scale,y:(q.y-l.minY)*scale})),holes:a.holes.map(h=>h.map(q=>({x:(q.x-l.minX)*scale,y:(q.y-l.minY)*scale})))}));});
 const minY=Math.min(...all.map(l=>l.y)),minX=Math.min(...all.map(l=>l.x));const rawWidth=Math.max(...all.map(l=>l.x+l.width))-minX;const sx=t.widthMm?t.widthMm/rawWidth:1; // uniform total scaling preserves proportions
 const uniform=sx;
 for(const l of all){l.x=(l.x-minX)*uniform;l.y=(l.y-minY)*uniform;l.width*=uniform;l.height*=uniform;for(const a of l.contours)for(const ring of [a.outer,...a.holes])for(const q of ring){q.x*=uniform;q.y*=uniform;}}return all;
}
export function calculateLetters(p){const v=validateLetterProject(p);const r={projectId:p?.id,revision:p?.revision,engineVersion:'letters-2',signature:letterGeometrySignature(p),bounds:{width:0,height:0,depth:0},letters:[],components:[],strips:[],totals:{areaMm2:0,perimeterMm:0,volumeMm3:0,stripLengthMm:0},...v};if(v.errors.length)return r;
 const c=p.construction,t=p.text,all=p.artwork?.mode==='vector'?vectorLetters(p.artwork):textLetters(p);if(!all.length){r.errors.push('Arte sem contornos físicos.');return r;}
 for(const l of all){const id=`letter-${l.index}-${hash(JSON.stringify([p.id,l.sourceId||l.char,l.sourceId?'vector':t.font]))}`;r.letters.push({id,char:l.char,index:l.index,line:l.line,x:l.x,y:l.y,width:l.width,height:l.height,contours:l.contours});r.errors.push(...validateContours(l.contours));
 const metrics=contourMetrics(l.contours);const add=(role,s,z,contours=l.contours)=>{const points=contours.flatMap(c=>c.outer),minX=Math.min(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),width=Math.max(...points.map(p=>p.x))-minX,height=Math.max(...points.map(p=>p.y))-minY;const normalize=ring=>ring.map(p=>({x:p.x-minX,y:p.y-minY}));r.components.push({id:`${id}-${role}`,letterId:id,label:`${l.char} · ${role}`,role,...s,depth:s.thickness,z,x:l.x+minX,y:l.y+minY,width,height,contours:contours.map(c=>({outer:normalize(c.outer),holes:c.holes.map(normalize)})),...contourMetrics(contours)});};
 if(c.family.startsWith('flat-')){let z=0;c.layers.forEach((s,i)=>{add(`layer-${i+1}`,s,z);z+=s.thickness;});r.bounds.depth=z;}
 else {const front=c.family==='galvanized-blind'&&!p.artwork?p.materials.side:p.materials.front,side=p.materials.side;let face=l.contours;try{if(c.faceClearanceMm)face=insetContours(l.contours,c.faceClearanceMm);}catch(error){r.errors.push(error.message);continue;}add('front',front,c.depthMm,face);if(p.materials.back)add('back',p.materials.back,0);
 r.components.push({id:`${id}-side`,letterId:id,label:`${l.char} · laterais`,role:'side',...side,depth:c.depthMm,z:0,x:l.x,y:l.y,width:l.width,height:l.height,contours:l.contours,areaMm2:metrics.perimeterMm*c.depthMm,perimeterMm:0});r.bounds.depth=c.depthMm+front.thickness;
 l.contours.forEach((a,ai)=>[a.outer,...a.holes].forEach((ring,ri)=>{const length=perimeter(ring);r.strips.push({id:`${id}-strip-${ai}-${ri}`,letterId:id,contourId:`${id}-contour-${ai}-${ri}`,label:`${l.char} · lateral ${ri?'interna':'externa'}`,role:ri?'inner-side':'outer-side',material:side.material,thickness:side.thickness,operation:side.operation,sku:side.sku,manufacturer:side.manufacturer,lot:side.lot,directional:side.directional,colorId:side.colorId,color:side.color,finish:side.finish,points:ring,x:l.x,y:l.y,z:0,depth:c.depthMm,width:c.depthMm,nominalLengthMm:length,grossLengthMm:null,areaMm2:length*c.depthMm,start:ring[0],direction:'contour-order',marks:[],status:'nominal'});}));}
 }
 if(!c.family.startsWith('flat-')){r.pending.push('Faixas em comprimento nominal: emendas, sobreposição, raio e compensação de conformação pendentes; não são desenvolvimento liberado.');r.pending.push(c.faceClearanceMm?`Folga de face aplicada: ${c.faceClearanceMm} mm por lado, sem compensação de ferramenta. Conferir encaixe e união.`:'Face e fundo no contorno nominal: folga da face ainda não informada. Conferir encaixe e união.');if(!p.materials.back)r.pending.push('Fundo ausente: definir fechamento ou justificar construção sem fundo.');}
 r.bounds.width=Math.max(...r.letters.map(l=>l.x+l.width));r.bounds.height=Math.max(...r.letters.map(l=>l.y+l.height));for(const a of r.components){r.totals.areaMm2+=a.areaMm2;r.totals.perimeterMm+=a.perimeterMm;r.totals.volumeMm3+=a.areaMm2*a.thickness;}for(const s of r.strips)r.totals.stripLengthMm+=s.nominalLengthMm;
 r.pending.push('Curvas aproximadas com 32 subdivisões por curva; tolerância de fabricação e convergência fina pendentes.');if(r.errors.length){r.components=[];r.strips=[];r.totals={areaMm2:0,perimeterMm:0,volumeMm3:0,stripLengthMm:0};}
 for(const item of [...r.letters,...r.components])item.contours=item.contours.map(c=>({outer:c.outer.map(p=>[p.x,p.y]),holes:c.holes.map(h=>h.map(p=>[p.x,p.y]))}));for(const strip of r.strips){strip.points=strip.points.map(p=>[p.x,p.y]);strip.start=strip.points[0];}return r;
}
