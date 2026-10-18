import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MM_TO_SCENE as S, CAMERA_VIEWS, cameraFrame, contourWallVertices, componentPresentation, disposeSceneGroup, componentAppearance } from '../../lib/fabrication/scene-geometry.mjs';
import './letter-viewport.css';

const EMPTY_COMPONENTS = [];
const views = { iso: 'Perspectiva', front: 'Frente', back: 'Trás', left: 'Esquerda', right: 'Direita', top: 'Topo', bottom: 'Base' };
const roles = { front: 'Frente', side: 'Laterais', back: 'Fundo' };
const fmt = value => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value || 0);
const electricalNumber = value => Number.isFinite(value) ? new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(value) : 'pendente';
const sourceDescription = source => `${source.id} · ${source.name || 'Fonte'} · nominal ${electricalNumber(source.nominalPowerW)} W · carga ${electricalNumber(source.powerW)} W (${electricalNumber(source.usedPercent)}%) · folga do estudo ${electricalNumber(source.availableW)} W · ${source.branchCount ?? source.circuitIds?.length ?? 'pendente'} ramais`;
function sceneLabel(text, x, y, z, height) {
  const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
  ctx.font = '600 28px system-ui'; canvas.width = Math.ceil(ctx.measureText(text).width + 24); canvas.height = 44;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, 44); ctx.fillStyle = '#17212e'; ctx.font = '600 28px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, canvas.width / 2, 22);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthTest: false, depthWrite: false }));
  sprite.position.set(x, y, z); sprite.scale.set(height * canvas.width / 44, height, 1); sprite.renderOrder = 10; return sprite;
}
const makeShape = contour => {
  const shape = new THREE.Shape(contour.outer.map(([x, y]) => new THREE.Vector2(x * S, y * S)));
  for (const hole of contour.holes || []) shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x * S, y * S))));
  return shape;
};

export default function LetterViewport({ project, result, selectedId, onSelect, onCapture, lighting, showLighting = false, fill = false }) {
  const host = useRef(null); const api = useRef(null); const callbacks = useRef({ onSelect, onCapture });
  const [showIds, setShowIds] = useState(false); const [showDimensions, setShowDimensions] = useState(true); const [showWall, setShowWall] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [interior, setInterior] = useState(true); const [night, setNight] = useState(false); const [ledVisible, setLedVisible] = useState(true);
  const lightsVisible = showLighting && ledVisible && lighting?.applicable && lighting?.config?.enabled;
  const [view, setView] = useState('iso'); const [exploded, setExploded] = useState(false); const [transparent, setTransparent] = useState(false);
  const [hidden, setHidden] = useState({}); const [fallback, setFallback] = useState(false); const [captureError, setCaptureError] = useState('');
  useEffect(() => { callbacks.current = { onSelect, onCapture }; }, [onSelect, onCapture]);
  const components = result?.components || EMPTY_COMPONENTS;
  const flatWidth=result?.bounds?.width||1000,flatHeight=result?.bounds?.height||500;
  const visibleSources=lightsVisible ? lighting?.sources||[] : [];
  const flatMinX=Math.min(0,...visibleSources.map(source=>source.x-20)),flatMaxX=Math.max(flatWidth,...visibleSources.map(source=>source.x+20));
  const flatMinY=Math.min(0,...visibleSources.map(source=>source.y-15)),flatMaxY=Math.max(flatHeight,...visibleSources.map(source=>source.y+15));
  const flatPad=Math.max(flatWidth,flatHeight)*0.14;

  useEffect(() => {
    const container = host.current;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); }
    catch { setFallback(true); return; }
    const scene = new THREE.Scene(); scene.background = new THREE.Color(night && showLighting ? '#101827' : project?.appearance?.wall || '#e7ebef');
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); container.appendChild(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.001, 10000); const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.screenSpacePanning = true;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x536171, night && showLighting ? 0.35 : 2.6));
    const light = new THREE.DirectionalLight(0xffffff, night && showLighting ? 0.5 : 3); light.position.set(2, 3, 5); scene.add(light);
    const group = new THREE.Group(); scene.add(group); const sourceMeshes=[];
    for (const component of components) {
      if (lightsVisible && interior && (component.role === 'front' || component.role?.startsWith('layer'))) continue;
      if (hidden[component.role?.startsWith('layer') ? 'front' : component.role]) continue;
      const { color, finish } = componentAppearance(project?.appearance, component);
      const material = new THREE.MeshStandardMaterial({ color, roughness: ({ matte: 0.8, satin: 0.5, semigloss: 0.3, glossy: 0.15, metallic: 0.28 }[finish] ?? 0.6), metalness: finish === 'metallic' ? 0.8 : 0.1, side: THREE.DoubleSide, transparent, opacity: transparent ? 0.35 : 1, depthWrite: !transparent, emissive: '#000000', emissiveIntensity: 0.45 });
      const part = new THREE.Group(); part.position.fromArray(componentPresentation(component, exploded));
      const geometries = component.role === 'side'
        ? [new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(contourWallVertices(component.contours, component.depth || 0), 3))]
        : (component.contours || []).filter(c => c.outer?.length > 2).map(c => new THREE.ExtrudeGeometry(makeShape(c), { depth: Math.max(0.01, component.thickness || 0.01) * S, bevelEnabled: false, steps: 1 }));
      if (!geometries.length) material.dispose();
      for (const geometry of geometries) { geometry.computeVertexNormals(); const mesh = new THREE.Mesh(geometry, material); mesh.userData.componentId = component.id; part.add(mesh); }
      group.add(part);
      if (showIds) {
        const pos = componentPresentation(component, exploded);
        group.add(sceneLabel(component.id, pos[0] + (component.width || 0) * S / 2, pos[1] + (component.height || 0) * S / 2, pos[2] + ((component.depth || component.thickness || 0) + 2) * S, Math.max(0.015, (result?.bounds?.height || 300) * S * 0.045)));
      }
    }
    if (lightsVisible) {
      for (const led of lighting.modules || []) {
        const material = new THREE.MeshStandardMaterial({color: night ? '#fff5d6' : led.color || '#f59e0b', emissive: night ? '#fff1b8' : '#000000', emissiveIntensity: night ? 1.5 : 0, roughness: 0.45, side:THREE.DoubleSide});
        const depthMm=Number.isFinite(led.depthMm)&&led.depthMm>0?led.depthMm:null;
        const geometry=depthMm===null?new THREE.PlaneGeometry(led.widthMm*S,led.heightMm*S):new THREE.BoxGeometry(led.widthMm*S,led.heightMm*S,depthMm*S);
        const mesh = new THREE.Mesh(geometry,material);
        mesh.position.set(led.x*S,led.y*S,(led.z+(depthMm??0)/2)*S);mesh.userData.ledId=led.id;group.add(mesh);
      }
      for (const wire of lighting.wires || []) {
        const color=lighting.circuits.find(c=>c.id===wire.circuitId)?.color || '#f59e0b';
        const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(wire.points.map(p=>new THREE.Vector3(...p.map(v=>v*S)))),new THREE.LineBasicMaterial({color}));group.add(line);
      }
      for (const source of lighting.sources || []) {
        const mesh=new THREE.Mesh(new THREE.BoxGeometry(30*S,20*S,10*S),new THREE.MeshStandardMaterial({color:'#475569'}));mesh.position.set(source.x*S,source.y*S,source.z*S);mesh.userData.sourceDescription=sourceDescription(source);sourceMeshes.push(mesh);group.add(mesh);
        group.add(sceneLabel(source.id,source.x*S,source.y*S,(source.z+7)*S,12*S));
      }
    }
    const width = (result?.bounds?.width || 0) * S; const height = (result?.bounds?.height || 0) * S;
    const gap = Math.max(width, height, 0.1) * 0.08;
    if (showDimensions && width > 0 && height > 0) {
      const points = [[0, -gap, 0], [width, -gap, 0], [0, 0, 0], [0, -gap * 1.2, 0], [width, 0, 0], [width, -gap * 1.2, 0], [-gap, 0, 0], [-gap, height, 0], [0, 0, 0], [-gap * 1.2, 0, 0], [0, height, 0], [-gap * 1.2, height, 0]];
      group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p))), new THREE.LineBasicMaterial({ color: '#17212e' })));
      group.add(sceneLabel(`${fmt(width / S)} mm`, width / 2, -gap * 1.5, 0, gap * 0.55));
      group.add(sceneLabel(`${fmt(height / S)} mm`, -gap * 1.8, height / 2, 0, gap * 0.55));
    }
    if (showWall && width > 0 && height > 0) {
      const wallGeometry = new THREE.PlaneGeometry(width + gap * 4, height + gap * 4);
      const wall = new THREE.Mesh(wallGeometry, new THREE.MeshStandardMaterial({ color: project?.appearance?.wall || '#e7ebef', side: THREE.DoubleSide }));
      wall.position.set(width / 2, height / 2, -0.01); group.add(wall);
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(wallGeometry), new THREE.LineBasicMaterial({ color: '#64748b' })); edge.position.copy(wall.position); group.add(edge);
    }
    const fit = () => {
      const box = new THREE.Box3().setFromObject(group);
      if (box.isEmpty()) { box.min.set(-0.1, -0.1, 0); box.max.set(0.1, 0.1, 0.1); }
      const frame = cameraFrame(box.min.toArray(), box.max.toArray(), CAMERA_VIEWS[view], camera.aspect);
      controls.target.fromArray(frame.center); camera.position.fromArray(frame.center).add(new THREE.Vector3(...frame.forward).multiplyScalar(frame.distance)); camera.lookAt(controls.target); controls.update();
    };
    const resize = () => { const width = Math.max(container.clientWidth, 1); const height = Math.max(container.clientHeight, 1); renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix(); fit(); };
    const observer = new ResizeObserver(resize); observer.observe(container); resize();
    const raycaster = new THREE.Raycaster(); let down;
    const pointerDown = event => { down = [event.clientX, event.clientY]; };
    const pointerUp = event => { if (!down || Math.hypot(event.clientX - down[0], event.clientY - down[1]) > 6) return; const rect = renderer.domElement.getBoundingClientRect(); raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera); const hit = raycaster.intersectObjects(group.children, true)[0]; if (hit?.object.userData.componentId) callbacks.current.onSelect?.(hit.object.userData.componentId); };
    const pointerMove = event => { if(!sourceMeshes.length)return;const rect=renderer.domElement.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);const hit=raycaster.intersectObjects(sourceMeshes,false)[0];renderer.domElement.title=hit?.object.userData.sourceDescription||''; };
    renderer.domElement.addEventListener('pointerdown', pointerDown); renderer.domElement.addEventListener('pointerup', pointerUp);
    renderer.domElement.addEventListener('pointermove', pointerMove);
    api.current = { select: id => group.traverse(object => { if (object.isMesh && object.userData.componentId) object.material.emissive.set(object.userData.componentId === id ? '#246696' : '#000000'); }), fit, capture: () => { renderer.render(scene, camera); return renderer.domElement.toDataURL('image/png'); } };
    renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
    return () => { api.current = null; observer.disconnect(); renderer.setAnimationLoop(null); renderer.domElement.removeEventListener('pointermove',pointerMove);controls.dispose(); disposeSceneGroup(group); renderer.dispose(); renderer.domElement.remove(); };
  }, [components, project?.appearance, view, exploded, transparent, hidden, showIds, showDimensions, showWall, result?.bounds, lighting, lightsVisible, interior, night, showLighting]);
  useEffect(() => { api.current?.select(selectedId); }, [selectedId, components, project?.appearance, view, exploded, transparent, hidden, showIds, showDimensions, showWall, result?.bounds, lighting, lightsVisible, interior, night, showLighting]);
  const capture = () => { try { let data = fallback ? null : api.current?.capture(); if (!data) { const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 600; const ctx = canvas.getContext('2d'); ctx.fillStyle = project?.appearance?.wall || '#e7ebef'; ctx.fillRect(0, 0, 1200, 600); const b = result?.bounds || {}; const scale = Math.min(1100 / (flatMaxX-flatMinX+40), 500 / (flatMaxY-flatMinY+40)); ctx.translate(50-(flatMinX-20)*scale, 550+(flatMinY-20)*scale); ctx.scale(scale, -scale); for (const c of components.filter(c => !(lightsVisible && interior && (c.role === 'front' || c.role?.startsWith('layer'))) && !hidden[c.role?.startsWith('layer') ? 'front' : c.role])) { ctx.beginPath(); for (const contour of c.contours || []) for (const ring of [contour.outer, ...(contour.holes || [])]) { ring.forEach(([x, y], i) => i ? ctx.lineTo(x + (c.x || 0), y + (c.y || 0)) : ctx.moveTo(x + (c.x || 0), y + (c.y || 0))); ctx.closePath(); } ctx.fillStyle = componentAppearance(project?.appearance, c).color; if (c.role !== 'side') ctx.fill('evenodd'); } if (lightsVisible) { for (const w of lighting.wires || []) {ctx.beginPath();w.points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.strokeStyle=lighting.circuits.find(c=>c.id===w.circuitId)?.color||'#f59e0b';ctx.lineWidth=1;ctx.stroke();}for(const m of lighting.modules || []){ctx.fillStyle=night?'#fff1b8':m.color||'#f59e0b';ctx.fillRect(m.x-m.widthMm/2,m.y-m.heightMm/2,m.widthMm,m.heightMm);}for(const source of lighting.sources || []){ctx.fillStyle='#475569';ctx.fillRect(source.x-15,source.y-10,30,20);}} ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.font = '16px system-ui'; ctx.fillStyle = '#17212e'; if (showDimensions) ctx.fillText(`${fmt(b.width)} × ${fmt(b.height)} mm · nominal`, 20, 25); if (showIds) ctx.fillText(components.map(c => c.id).join(' · '), 20, 580); data = canvas.toDataURL('image/png'); } callbacks.current.onCapture?.(data); const link = document.createElement('a'); link.download = 'letra-caixa-previa.png'; link.href = data; link.click(); setCaptureError(''); } catch { setCaptureError('Não foi possível capturar a prévia.'); } };
  return <section className={`letter-viewport${fill ? ' letter-viewport-fill' : ''}`} aria-label="Prévia das letras">
    <div className="letter-viewport-tools letter-viewport-primary"><select aria-label="Vista da simulação" value={view} onChange={e=>setView(e.target.value)}>{Object.entries(views).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select><button type="button" onClick={() => api.current?.fit()}>Enquadrar</button><button type="button" onClick={capture}>PNG</button><button type="button" onClick={() => setFallback(!fallback)}>{fallback ? 'Ver 3D' : 'Alternativa 2D'}</button><button type="button" aria-expanded={advanced} onClick={()=>setAdvanced(!advanced)}>Exibição {advanced?'▴':'▾'}</button><span className="letter-viewport-dimensions">{fmt(result?.bounds?.width)} × {fmt(result?.bounds?.height)} mm</span></div>
    {advanced && <div className="letter-viewport-tools"><label><input type="checkbox" checked={exploded} onChange={e => setExploded(e.target.checked)} /> Explosão</label><label><input type="checkbox" checked={transparent} onChange={e => setTransparent(e.target.checked)} /> Transparência</label>{Object.entries(roles).map(([id, label]) => <label key={id}><input type="checkbox" checked={!hidden[id]} onChange={e => setHidden({ ...hidden, [id]: !e.target.checked })} /> {label}</label>)}</div>}
    {advanced && <div className="letter-viewport-tools"><label><input type="checkbox" checked={showIds} onChange={e => setShowIds(e.target.checked)} /> IDs</label><label><input type="checkbox" checked={showDimensions} onChange={e => setShowDimensions(e.target.checked)} /> Cotas gerais</label><label><input type="checkbox" checked={showWall} onChange={e => setShowWall(e.target.checked)} /> Plano de parede ilustrativo</label>{showDimensions && <span>{fmt(result?.bounds?.width)} × {fmt(result?.bounds?.height)} mm</span>}</div>}
    {showLighting && <div className="letter-viewport-tools letter-lighting-tools"><label><input type="checkbox" checked={ledVisible} onChange={e=>setLedVisible(e.target.checked)}/> Módulos e cabos</label><button type="button" aria-pressed={interior} onClick={()=>setInterior(!interior)}>{interior?'Interior aberto':'Exterior fechado'}</button><button type="button" aria-pressed={night} onClick={()=>setNight(!night)}>{night?'Noite ilustrativa':'Dia'}</button></div>}
    {showLighting && lighting?.applicable && lighting?.config?.enabled && <div className="letter-lighting-summary" aria-label="Resumo elétrico da simulação">
      <div className="letter-lighting-model"><strong>{lighting.config.model.name}</strong><span>{electricalNumber(lighting.config.model.voltageV)} V DC · {electricalNumber(lighting.config.model.cctK)} K{lighting.config.model.sku?` · ${lighting.config.model.sku}`:''}{lighting.demonstration?' · demonstração':''}</span></div>
      {!!lighting.errors?.length && <div className="letter-lighting-issue" role="status">Cálculo com {lighting.errors.length} erro(s): valores parciais. Confira as pendências antes de usar.</div>}
      <div className="letter-lighting-figures">
        <div><small>Módulos × potência unitária</small><strong>{electricalNumber(lighting.totals?.moduleCount)} × {electricalNumber(lighting.config.model.powerW)} W</strong><span>= {electricalNumber(lighting.totals?.powerW)} W de carga</span></div>
        <div title={(lighting.sources||[]).map(sourceDescription).join('\n')}><small>Fontes · potência nominal</small><strong>{electricalNumber(lighting.totals?.sourceCount)} × {electricalNumber(lighting.config.supply.powerW)} W</strong><span>{lighting.config.supply.name}</span></div>
        <div><small>Ligações DC em paralelo</small><strong>{electricalNumber(lighting.totals?.circuitCount)} ramais</strong><span>Fontes independentes · par +/−</span></div>
        <div><small>Fiação com reserva</small><strong>{electricalNumber(lighting.totals?.cableM)} m de percurso/par</strong><span>{electricalNumber(lighting.totals?.conductorM)} m de condutor (2 vias)</span></div>
      </div>
      <div className="letter-lighting-wire">{lighting.config.wire.name||lighting.config.wire.productName||'Condutor a especificar'} · seção {electricalNumber(lighting.config.wire.sectionMm2)} mm² · corrente admissível {Number.isFinite(lighting.config.wire.maxCurrentA)?`${electricalNumber(lighting.config.wire.maxCurrentA)} A informada`:'a confirmar'}</div>
    </div>}
    <div ref={host} className="letter-viewport-canvas" hidden={fallback} />
    {fallback && <div className="letter-viewport-flat"><svg style={{background:night && showLighting?'#101827':'#e7ebef'}} viewBox={`${flatMinX-flatPad} ${flatHeight-flatMaxY-flatPad} ${flatMaxX-flatMinX+flatPad*2} ${flatMaxY-flatMinY+flatPad*2}`} role="img" aria-label="Vista frontal nominal em 2D">{showDimensions && <g fill="#17212e" stroke="#64748b" strokeWidth="1"><line x1="0" y1={-(result?.bounds?.height || 500) * 0.06} x2={result?.bounds?.width || 1000} y2={-(result?.bounds?.height || 500) * 0.06} /><text stroke="none" textAnchor="middle" fontSize={(result?.bounds?.height || 500) * 0.045} x={(result?.bounds?.width || 1000) / 2} y={-(result?.bounds?.height || 500) * 0.09}>{fmt(result?.bounds?.width)} mm</text><text stroke="none" textAnchor="middle" fontSize={(result?.bounds?.height || 500) * 0.045} x={(result?.bounds?.width || 1000) / 2} y={(result?.bounds?.height || 500) * 1.1}>Altura {fmt(result?.bounds?.height)} mm</text></g>}<g transform={`translate(0 ${result?.bounds?.height || 500}) scale(1 -1)`}>{lightsVisible && interior && (result?.letters||[]).map(l=><path key={`body-${l.id}`} transform={`translate(${l.x} ${l.y})`} d={l.contours.flatMap(c=>[c.outer,...c.holes]).map(ring=>`M${ring.map(p=>p.join(',')).join('L')}Z`).join(' ')} fill={night?'#273445':'#e2e8f0'} fillRule="evenodd" stroke="#64748b"/>)}{components.filter(c => c.role !== 'side' && !(lightsVisible && interior && (c.role === 'front' || c.role?.startsWith('layer'))) && !hidden[c.role?.startsWith('layer') ? 'front' : c.role]).map(c => <path key={c.id} tabIndex="0" role="button" aria-label={c.label || c.id} aria-pressed={c.id === selectedId} onClick={() => onSelect?.(c.id)} onKeyDown={e => { if (['Enter', ' '].includes(e.key)) { e.preventDefault(); onSelect?.(c.id); } }} transform={`translate(${c.x || 0} ${c.y || 0})`} d={(c.contours || []).flatMap(contour => [contour.outer, ...(contour.holes || [])]).map(ring => `M${ring.map(p => p.join(',')).join('L')}Z`).join(' ')} fill={componentAppearance(project?.appearance, c).color} fillRule="evenodd" stroke={c.id === selectedId ? '#0057b8' : '#555'} strokeWidth={c.id === selectedId ? 3 : 0.4} />) }{lightsVisible && <g>{(lighting.wires||[]).map(w=><polyline key={w.id} points={w.points.map(p=>p.slice(0,2).join(',')).join(' ')} fill="none" stroke={lighting.circuits.find(c=>c.id===w.circuitId)?.color||'#f59e0b'} strokeWidth="1.5" strokeDasharray="4 2"/>)}{(lighting.modules||[]).map(m=><rect key={m.id} x={m.x-m.widthMm/2} y={m.y-m.heightMm/2} width={m.widthMm} height={m.heightMm} fill={night?'#fff1b8':m.color||'#f59e0b'} stroke="#fff" strokeWidth="0.5"><title>{m.id} · {m.circuitId} · {m.sourceId}</title></rect>)}{(lighting.sources||[]).map(s=><g key={s.id} transform={`translate(${s.x} ${s.y})`}><title>{sourceDescription(s)}</title><rect x="-15" y="-10" width="30" height="20" fill="#fff" stroke="#111"/><text transform="scale(1 -1)" textAnchor="middle" y="4" fontSize="10">{s.id}</text></g>)}</g>}</g></svg></div>}
    {showIds && <div className="letter-viewport-id-list" aria-label="IDs dos componentes">{components.map(c => <button type="button" key={c.id} aria-pressed={selectedId === c.id} onClick={() => onSelect?.(c.id)}>{c.id} · {c.label || c.role}</button>)}</div>}
    <p>{showLighting ? `LEDs e ligações derivados da distribuição. ${lighting?.modules?.some(m=>!Number.isFinite(m.depthMm)||m.depthMm<=0)?'Módulos sem profundidade informada aparecem como símbolos planos. ':''}Dia/noite é ilustrativo, sem cálculo fotométrico; dimensões das fontes no desenho são simbólicas. ` : ''}Plano de parede ilustrativo sem medidas de levantamento. Cotas referem-se ao conjunto nominal. Prévia visual em mm · arraste para girar, botão direito para deslocar e roda para zoom. Cor e acabamento dependem de amostra. {project?.construction?.family === 'backlit' ? 'Iluminação traseira depende do projeto elétrico; esta prévia não simula fotometria.' : ''}</p>{captureError && <p role="alert">{captureError}</p>}
  </section>;
}
