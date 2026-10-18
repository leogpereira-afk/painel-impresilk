import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ArrowLeft, Box, Grid2X2, Maximize2, Minimize2, Expand, Play, RotateCcw } from 'lucide-react';
import { piecePolygon, pieceRings, pieceDepthLayers, createAssemblyMotion, explodeVector, needsCameraRefit, fittedCameraDistance } from './scene.mjs';
const fmt=n=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(n||0);
const EMPTY=[];
export default function WorkshopViewport({result,config,selected,onSelect,onCaptureReady,onBack}){
 const host=useRef(null),api=useRef(null),cameraSnapshot=useRef(null),callbacks=useRef({onSelect});
 const [mode,setMode]=useState('3d'),[view,setView]=useState('iso'),[expanded,setExpanded]=useState(false),[exploded,setExploded]=useState(false),[fallback,setFallback]=useState(false),[notice,setNotice]=useState(''),[layer,setLayer]=useState('all');
 callbacks.current={onSelect};
 const explosionRef=useRef(exploded);explosionRef.current=exploded;
 const pieces=result?.displayPieces||result?.pieces||EMPTY,dimensions=result?.dimensions||{};
 const material=result?.materialId,valid=result?.valid;
 useEffect(()=>{
  const container=host.current;if(!container||mode!=='3d')return;
  let renderer;try{renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});}catch{setFallback(true);setMode('2d');return;}
  const scene=new THREE.Scene();scene.background=new THREE.Color('#181f2b');
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;container.appendChild(renderer.domElement);
  const camera=new THREE.PerspectiveCamera(36,1,0.1,100000);camera.up.set(0,0,1);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;
  scene.add(new THREE.HemisphereLight(0xffffff,0x6b7590,2.4));const light=new THREE.DirectionalLight(0xffffff,3.4);light.position.set(800,-400,1500);scene.add(light);
  const group=new THREE.Group(),partGroups=[];scene.add(group);
  for(const piece of pieces){
   if(!piece.transform||piecePolygon(piece).length<3)continue;
   if(material==='metalon'&&((layer==='frame'&&piece.face==='front-sheet')||(layer==='sheet'&&piece.face!=='front-sheet')))continue;
   const rings=pieceRings(piece),layers=pieceDepthLayers(piece);
   const shapeFor=holes=>{const shape=new THREE.Shape(rings[0].map(([x,y])=>new THREE.Vector2(x,y)));for(const ring of rings.slice(1))shape.holes.push(new THREE.Path(ring.map(([x,y])=>new THREE.Vector2(x,y))));for(const hole of holes){const path=new THREE.Path();path.absarc(hole.x,hole.y,hole.diameter/2,0,Math.PI*2,true);shape.holes.push(path);}return shape};
   const color=material==='mdf'?(config?.color||'#bfa77b'):material==='acrylic'?(config?.color||'#74dce6'):(piece.material?.color||'#9ba8ba');
   const transparent=material==='acrylic';const faceMaterial=new THREE.MeshStandardMaterial({color,roughness:transparent?.17:material==='mdf'?.88:.32,metalness:material==='metalon'?.65:0,transparent,opacity:transparent?.62:1,side:THREE.DoubleSide});
   const cutMaterial=faceMaterial.clone();if(material==='mdf'&&config?.process==='laser')cutMaterial.color.set('#4f3826');
   const t=piece.transform,part=new THREE.Group();const matrix=new THREE.Matrix4().makeBasis(new THREE.Vector3(...t.u),new THREE.Vector3(...t.v),new THREE.Vector3(...t.normal));part.position.fromArray(t.origin);
   for(const layer of layers){const geometry=new THREE.ExtrudeGeometry(shapeFor(layer.holes),{depth:layer.depth,bevelEnabled:false,curveSegments:32});geometry.translate(0,0,layer.start);const mesh=new THREE.Mesh(geometry,[faceMaterial,cutMaterial]);mesh.userData.id=piece.id;mesh.applyMatrix4(matrix);part.add(mesh);}
   const outline=new THREE.ExtrudeGeometry(shapeFor((piece.holes||[]).filter(h=>h.through!==false&&h.diameter>0)),{depth:Math.max(.05,piece.thickness||.1),bevelEnabled:false,curveSegments:32});
   const edge=new THREE.LineSegments(new THREE.EdgesGeometry(outline,25),new THREE.LineBasicMaterial({color:material==='mdf'?'#57472f':'#c6e1f0',transparent:true,opacity:.65}));outline.dispose();edge.applyMatrix4(matrix);part.add(edge);
   for(const hole of (piece.holes||[]).filter(h=>h.through===false&&h.depth>0)){const back=hole.face==='back',mouth=back?piece.thickness:0,bottom=back?piece.thickness-hole.depth:hole.depth;for(const z of [mouth,bottom]){const points=new THREE.EllipseCurve(hole.x,hole.y,hole.diameter/2,hole.diameter/2,0,Math.PI*2).getPoints(64).map(p=>new THREE.Vector3(p.x,p.y,z));const ring=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:'#e4ad55'}));ring.applyMatrix4(matrix);part.add(ring);}}
   const normal=material==='metalon'?(piece.kind==='bar'?[0,0,0]:explodeVector(piece,-Math.max(dimensions.width||300,dimensions.height||150)*.25)):explodeVector(piece,Math.max(dimensions.width||300,dimensions.height||150)*.25);part.userData={piece,normal,base:[...t.origin]};group.add(part);partGroups.push(part);
  }
  const size=Math.max(dimensions.width||300,dimensions.height||150,dimensions.depth||200);
  const grid=new THREE.GridHelper(size*5,30,0x475264,0x2a3444);grid.rotateX(Math.PI/2);grid.position.set((dimensions.width||0)/2,(dimensions.depth||0)/2,-1);scene.add(grid);
  const motion=createAssemblyMotion(explosionRef.current);let shown;
  const present=(time=performance.now())=>{const amount=motion.sample(time);if(amount===shown)return;shown=amount;partGroups.forEach(part=>{part.position.fromArray(part.userData.base).add(new THREE.Vector3(...part.userData.normal).multiplyScalar(amount))})};present();
  const fit=(keepAngle=false)=>{const bounds=new THREE.Box3().setFromObject(group),center=bounds.isEmpty()?new THREE.Vector3((dimensions.width||0)/2,(dimensions.depth||0)/2,(dimensions.height||0)/2):bounds.getCenter(new THREE.Vector3()),extent=bounds.isEmpty()?[dimensions.width||300,dimensions.depth||200,dimensions.height||150]:bounds.getSize(new THREE.Vector3()).toArray();const preset=view==='front'?[0,-1,0.001]:view==='top'?[0,-.001,1]:[1,-1,.8],direction=keepAngle?camera.position.clone().sub(controls.target).normalize():new THREE.Vector3(...preset).normalize();const distance=fittedCameraDistance(extent,direction.toArray(),camera.aspect,camera.fov);controls.target.copy(center);camera.position.copy(center).addScaledVector(direction,distance);camera.far=Math.max(100000,distance+Math.hypot(...extent)*3);camera.updateProjectionMatrix();camera.lookAt(center);controls.update()};
  let first=true,fittedAspect;
  const resize=()=>{const w=container.clientWidth,h=container.clientHeight;if(w<2||h<2)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();if(first){fit();const snapshot=cameraSnapshot.current;if(snapshot?.view===view){camera.position.fromArray(snapshot.position);controls.target.fromArray(snapshot.target);if(needsCameraRefit(snapshot.aspect,camera.aspect))fit(true);else controls.update();}first=false;fittedAspect=camera.aspect;}else if(needsCameraRefit(fittedAspect,camera.aspect)){fit(true);fittedAspect=camera.aspect;}};
  const observer=new ResizeObserver(resize);observer.observe(container);resize();
  const ray=new THREE.Raycaster();let down;const start=e=>{down=[e.clientX,e.clientY]};const end=e=>{if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;const r=renderer.domElement.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);const hit=ray.intersectObjects(group.children,true).find(h=>h.object.userData.id);if(hit)callbacks.current.onSelect?.(hit.object.userData.id)};
  renderer.domElement.addEventListener('pointerdown',start);renderer.domElement.addEventListener('pointerup',end);
  api.current={capture:()=>{renderer.render(scene,camera);return renderer.domElement.toDataURL('image/png')},explode:value=>{motion.explode(value);present()},animate:()=>{motion.animate(performance.now());present()},reset:()=>{motion.reset();present();fit()},select:id=>partGroups.forEach(part=>part.children.filter(child=>child.isMesh).forEach(mesh=>mesh.material.forEach(m=>m.emissive.set(part.userData.piece.id===id?'#27456b':'#000000'))))};
  renderer.setAnimationLoop(time=>{present(time);controls.update();renderer.render(scene,camera)});
  return()=>{cameraSnapshot.current={view,aspect:camera.aspect,position:camera.position.toArray(),target:controls.target.toArray()};api.current=null;observer.disconnect();renderer.setAnimationLoop(null);controls.dispose();scene.traverse(obj=>{obj.geometry?.dispose();if(obj.material){(Array.isArray(obj.material)?obj.material:[obj.material]).forEach(m=>m.dispose())}});renderer.dispose();renderer.domElement.remove()};
 },[pieces,dimensions.width,dimensions.height,dimensions.depth,config?.color,config?.process,material,view,mode,layer]); // explosion changes presentation without rebuilding geometry
 useEffect(()=>{api.current?.select(selected)},[selected,pieces,mode,layer]);
 useEffect(()=>{onCaptureReady?.(()=>api.current?.capture());return()=>onCaptureReady?.(null)},[onCaptureReady]);
 useEffect(()=>{if(!expanded)return;const close=e=>{if(e.key==='Escape')setExpanded(false)};document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close)},[expanded]);
 const canAssemble=pieces.length>1,flat=pieces.find(p=>p.id===selected)||pieces[0];
 function reset(){setExploded(false);setView('iso');cameraSnapshot.current=null;api.current?.reset()}
 function toggleExploded(){const next=!exploded;setExploded(next);api.current?.explode(next)}
 return <section className={`of-viewer ${expanded?'of-viewer-expanded':''}`} aria-label="Prévia do projeto">
  <header className="of-view-head"><button onClick={onBack}><ArrowLeft size={17}/> Ferramentas</button><strong>Prévia do projeto</strong><div className="of-segment"><button aria-pressed={mode==='3d'} onClick={()=>setMode('3d')}><Box size={17}/> 3D</button><button aria-pressed={mode==='2d'} onClick={()=>setMode('2d')}><Grid2X2 size={17}/> 2D</button></div></header>
  <div className="of-view-tools"><div className="of-segment">{[['iso','Perspectiva'],['front','Frente'],['top','Topo']].map(([id,label])=><button key={id} disabled={mode==='2d'} aria-pressed={view===id} onClick={()=>{cameraSnapshot.current=null;setView(id)}}>{label}</button>)}</div><button onClick={()=>setExpanded(!expanded)}>{expanded?<Minimize2 size={17}/>:<Maximize2 size={17}/>} {expanded?'Reduzir':'Ampliar'}</button></div>
  {material==='metalon'&&config?.sheet?.enabled&&<div className="of-layer-chips">{[['all','Conjunto'],['frame','Quadro'],['sheet','Chapa']].map(([id,label])=><button aria-pressed={layer===id} onClick={()=>setLayer(id)} key={id}>{label}</button>)}</div>}
  <div className="of-scene-wrap"><span className="of-dim-badge"><Box size={16}/>{fmt(dimensions.width)} × {fmt(dimensions.depth)} × {fmt(dimensions.height)} mm <small>L × P × A</small></span>
   {mode==='3d'?<div className="of-scene" ref={host}/>:<div className="of-flat-scene">{flat&&<svg viewBox={`-20 -20 ${flat.width+40} ${flat.height+40}`} role="img" aria-label={`Desenvolvimento de ${flat.label}`}><g transform={`translate(0 ${flat.height}) scale(1 -1)`}><path d={pieceRings(flat).map(r=>`M${r.map(p=>p.join(' ')).join('L')}Z`).join(' ')} fillRule="evenodd" fill={material==='mdf'?'#bfa77b':'#577d91'} stroke="#e7edf7" strokeWidth={Math.max(flat.width,flat.height)/600}/>{(flat.holes||[]).map((h,i)=><circle key={i} cx={h.x} cy={h.y} r={h.diameter/2} fill={h.through===false?'#8b682f':'#181f2b'} stroke={h.through===false?'#ffc66b':'#a3d4ed'} strokeWidth={Math.max(flat.width,flat.height)/600} strokeDasharray={h.through===false?`${Math.max(flat.width,flat.height)/120} ${Math.max(flat.width,flat.height)/180}`:undefined}><title>{h.id} · Ø {fmt(h.diameter)} mm · {h.through===false?`cego ${fmt(h.depth)} mm · ${h.face==='back'?'verso':'frente'}`:'passante'}</title></circle>)}</g></svg>}<span>{flat?.label} · {fmt(flat?.width)} × {fmt(flat?.height)} mm · nominal</span>{flat?.holes?.some(h=>h.through===false)&&<span>Tracejado âmbar: furo cego · {flat.holes.filter(h=>h.through===false).slice(0,4).map(h=>`${h.id}: ${fmt(h.depth)} mm (${h.face==='back'?'verso':'frente'})`).join(' · ')}</span>}</div>}
   {!valid&&<span className="of-invalid">Confira as medidas para gerar o projeto</span>}
  </div>
  <div className="of-view-hint">✥ {mode==='3d'?'Arraste para girar · Role para aproximar · Toque na peça para selecionar':'Selecione a peça na faixa abaixo para conferir o desenho plano'}{fallback&&' · WebGL indisponível: vista 2D ativada'}</div>
  <div className="of-parts-strip">{pieces.map((p,i)=><button key={`${p.id}-${i}`} aria-pressed={(selected||pieces[0]?.id)===p.id} onClick={()=>onSelect?.(p.id)}>{p.label}<small>{fmt(p.width)} × {fmt(p.height)}</small></button>)}</div>
  <footer className="of-view-actions"><button disabled={!canAssemble||mode!=='3d'} aria-pressed={exploded} onClick={toggleExploded}><Expand size={17}/> Vista Explodida</button><button disabled={!canAssemble||mode!=='3d'} onClick={()=>{setExploded(false);api.current?.animate();setNotice('Montagem das peças do projeto')}}><Play size={17}/> Animar Montagem</button><button onClick={reset}><RotateCcw size={17}/> Resetar</button>{!canAssemble&&<small>Peça única: montagem não se aplica.</small>}</footer>
  {notice&&<span className="of-sr" role="status">{notice}</span>}
 </section>;
}
