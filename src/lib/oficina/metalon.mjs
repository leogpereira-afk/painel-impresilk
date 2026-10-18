import {diagonalMembers} from './diagonals.mjs';
import {createStructureFrame,buildStructureFrame,FRAME_GROUPS,frameFaceWidth,frameDepth} from '../acm/structure.mjs';
import {rectangle,transform} from './geometry.mjs';
const valid=(n,min=0,max=100000)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
export const frameGeometrySignature=cfg=>JSON.stringify([cfg.width,cfg.height,cfg.profile,cfg.horizontalProfile,cfg.verticalProfile,cfg.crossProfile,cfg.crossbars,cfg.overrides,cfg.diagonals,cfg.sheet?.followFrame,cfg.sheet?.width,cfg.sheet?.height,cfg.sheet?.offsetX,cfg.sheet?.offsetY]);
const spec=p=>({...p,id:p.id??`${p.width}x${p.depth}`,orientation:p.orientation==='depth'?'depth':'width',gauge:'',material:p.material||'steel',sku:p.sku||'',finish:p.finish||''});
export function buildMetalon(project){
 const cfg=project.components.metalon,errors=[],warnings=[],pieces=[],assembly=['Montar horizontais inteiras; verticais entre as horizontais.','Conferir esquadro, solda e fixações no detalhamento de oficina.'];
 const dimensions={width:cfg.width,depth:frameDepth(spec(cfg.profile)),height:cfg.height};
 if(!valid(cfg.width,.01)||!valid(cfg.height,.01)||!valid(cfg.barLength,100,30000)||!valid(cfg.sawKerf,0,30))errors.push('Dimensões do quadro, barra ou perda de serra inválidas.');
 if(cfg.joint&&cfg.joint!=='butt')errors.push('Esta oficina emite barras somente com cortes retos a 90°. Meia-esquadria não está habilitada neste editor.');
 if(!Array.isArray(cfg.crossbars)||cfg.crossbars.length>100||!Array.isArray(cfg.holes)||cfg.holes.length>200)errors.push('Limite de 100 travessas e 200 furos por quadro.');
 if(errors.length)return{pieces,errors,warnings,assembly,dimensions};
 const base=spec(cfg.profile),horizontal=spec({...base,...cfg.horizontalProfile}),vertical=spec({...base,...cfg.verticalProfile}),cross=spec({...base,...cfg.crossProfile});
 dimensions.depth=Math.max(frameDepth(base),frameDepth(horizontal),frameDepth(vertical),frameDepth(cross),...cfg.crossbars.map(p=>frameDepth(spec({...cross,...p.profile}))));
 const frame=createStructureFrame({structure:{barLength:cfg.barLength,kerf:cfg.sawKerf}});
 Object.assign(frame,{spacingX:100000,spacingY:100000,trimStart:cfg.trimStart??0,trimEnd:cfg.trimEnd??0,gap:cfg.gap??0,overrides:cfg.overrides??{}});
 for(const key of FRAME_GROUPS)frame.groups[key]={profile:key==='externalHorizontal'?horizontal:key==='externalVertical'?vertical:cross,barLength:cfg.barLength,pricePerM:cfg.barPrice==null?null:cfg.barPrice/(cfg.barLength/1000)};
 const inner={width:cfg.width-2*frameFaceWidth(vertical),depth:frameDepth(base),height:cfg.height-2*frameFaceWidth(horizontal)};
 frame.reinforcements=cfg.crossbars.map((item,i)=>({id:item.id||`T${i+1}`,surface:'front',axis:item.axis||'horizontal',position:item.position,start:item.start??(item.axis==='vertical'?frameFaceWidth(horizontal):frameFaceWidth(vertical)),end:item.end??(item.axis==='vertical'?cfg.height-frameFaceWidth(horizontal):cfg.width-frameFaceWidth(vertical)),profile:item.profile?spec({...cross,...item.profile}):cross}));
 const acm={assemblyMode:'tray',structure:{frame},material:{thickness:0},fixing:{type:'screw',thickness:0},openings:[]};
 const e=[],w=[],structure=buildStructureFrame(acm,[{id:'front',label:'Quadro',width:cfg.width,height:cfg.height,transform:transform([0,0,0],[1,0,0],[0,0,1],[0,-1,0])}],e,w);
 // Stock capacity is checked by this adapter; lack of bars does not invalidate geometry.
 errors.push(...e.filter(x=>x.code!=='BAR_LENGTH').map(x=>x.message));warnings.push(...w.map(x=>x.message));
 if(errors.length)return{pieces,errors,warnings,assembly,dimensions,inner,structure};
 const edges=Object.fromEntries(structure.segments.filter(s=>s.group.startsWith('external')).map(s=>[s.id.slice(-1),s]));
 inner.width=cfg.width-(edges.L?.faceWidth??0)-(edges.R?.faceWidth??0);inner.height=cfg.height-(edges.B?.faceWidth??0)-(edges.T?.faceWidth??0);
 dimensions.depth=Math.max(dimensions.depth,...structure.segments.map(s=>s.depth));
 if(structure.orphanedOverrides?.length)warnings.push('Edições de elementos ausentes preservadas: '+structure.orphanedOverrides.join(', ')+'. Reveja após redistribuir apoios.');
 try{const diagonals=diagonalMembers(cfg,structure);structure.segments.push(...diagonals);structure.totalLength+=diagonals.reduce((sum,s)=>sum+s.length,0);if(diagonals.length)assembly.push('Diagonais por vão livre: pontas paralelas cortadas contra os perfis verticais. Conferir ângulos e folgas na oficina.')}catch(error){errors.push(error.message);return{pieces,errors,warnings,assembly,dimensions,inner,structure}}
 for(const s of structure.segments){
   const b=s.bounds;
   pieces.push({id:`metalon-${s.id}`,componentId:'metalon',label:s.id.replace('front-','Perfil '),width:b.width,height:b.height,thickness:s.depth,wall:s.wall,face:'front',kind:'bar',perSet:1,quantity:project.quantity,extraQuantity:0,contour:s.diagonal?s.contour.map(([x,y])=>({x:x-b.x,y:y-b.y})):rectangle(b.width,b.height),holes:[],material:{id:'metalon',kind:'metalon',sku:s.sku,finish:s.finish,color:cfg.color||'#7a8995',thickness:s.wall,process:'saw',source:'manual'},transform:transform([b.x,0,b.y],[1,0,0],[0,0,1],[0,1,0]),segment:s,rotations:[0]});
 }
 const sheet=cfg.sheet;
 if(sheet.enabled){
   const width=sheet.followFrame?cfg.width:sheet.width,height=sheet.followFrame?cfg.height:sheet.height;
   if(!valid(width,.01)||!valid(height,.01)||!valid(sheet.thickness,.01,100)||!valid(sheet.offsetX,-100000)||!valid(sheet.offsetY,-100000))errors.push('Chapa galvanizada: largura, altura, espessura ou posição inválida.');
   else pieces.push({id:'metalon-sheet',componentId:'metalon',label:'Chapa galvanizada frontal plana',width,height,thickness:sheet.thickness,face:'front-sheet',kind:'sheet',perSet:1,quantity:project.quantity,extraQuantity:0,contour:rectangle(width,height),holes:[],material:{id:'galvanized',kind:'galvanized',sku:sheet.sku||'',finish:sheet.finish||'galvanizado',color:sheet.color||'#bac6cf',thickness:sheet.thickness,process:sheet.process||'laser',directional:false,source:'manual'},transform:transform([sheet.offsetX,-sheet.thickness,sheet.offsetY],[1,0,0],[0,0,1],[0,1,0]),rotations:[0,90]});
   assembly.push('Fixar chapa frontal inteira e plana; furos na chapa não criam furos no tubo ou na parede.');
 }
 const seen=new Set();
 for(const h of cfg.holes){
   if(!h||typeof h.id!=='string'||!h.id.trim()||seen.has(h.id)){errors.push('Furo sem identificação ou com ID repetido.');continue;}seen.add(h.id);
   if(!valid(h.x)||!valid(h.y)||!valid(h.diameter,.01,500)||!['drill','laser'].includes(h.operation)||typeof h.through!=='boolean'||(!h.through&&!valid(h.depth,.01,500))){errors.push(`${h.id}: coordenadas, diâmetro, operação ou profundidade inválidos.`);continue;}
   const target=h.component==='sheet'?pieces.find(p=>p.id==='metalon-sheet'):pieces.find(p=>p.id===h.component||p.segment?.id===h.component);
   if(!target){errors.push(`${h.id}: componente de furação indisponível.`);continue;}
   if(target.kind==='bar'&&h.operation!=='drill'){errors.push(`${h.id}: furo no tubo exige operação de furadeira.`);continue;}
   if(target.kind==='bar'&&h.through&&(!Array.isArray(h.walls)||!h.walls.length||h.walls.some(w=>!['front','back'].includes(w)))){errors.push(`${h.id}: identifique as paredes frontal/traseira atingidas no tubo.`);continue;}
   if(!h.through&&h.operation==='laser'){errors.push(`${h.id}: recorte laser não representa furo cego.`);continue;}
   const wall=target.kind==='bar'?target.wall:target.thickness;
   if(!h.through&&(!valid(wall,.01)||h.depth>=wall)){errors.push(`${h.id}: profundidade cega atravessa a parede/espessura do componente.`);continue;}
   const radius=h.diameter/2;
   if(h.x-radius<0||h.y-radius<0||h.x+radius>target.width||h.y+radius>target.height){errors.push(`${h.id}: furo cruza a borda do componente.`);continue;}
   if(target.holes.some(q=>Math.hypot(q.x-h.x,q.y-h.y)<(q.diameter+h.diameter)/2)){errors.push(`${h.id}: sobreposição entre furos.`);continue;}
   const globalX=h.x+target.transform.origin[0],globalY=h.y+target.transform.origin[2];
   const support=structure.segments.filter(s=>!s.diagonal&&globalX-radius>=s.bounds.x-1e-7&&globalX+radius<=s.bounds.x+s.bounds.width+1e-7&&globalY-radius>=s.bounds.y-1e-7&&globalY+radius<=s.bounds.y+s.bounds.height+1e-7);
   const supported=support.length>0;
   if(h.purpose==='sheet-frame'&&!supported)errors.push(`${h.id}: fixação chapa–quadro sem perfil atrás de todo o furo.`);
   if(h.basisSignature&&h.basisSignature!==frameGeometrySignature(cfg))errors.push(`${h.id}: quadro/chapa alterado; confirme novamente a posição do furo.`);
   target.holes.push({...h,supported,supportIds:support.map(s=>s.id),face:h.face||'front',tolerance:h.tolerance??null});
 }
 if(cfg.holes.length)warnings.push('Acesso, fixadores e interferências com soldas permanecem pendentes até informar sua geometria.');
 return{pieces:errors.length?[]:pieces,errors,warnings,assembly,dimensions,inner,structure,frame};
}
