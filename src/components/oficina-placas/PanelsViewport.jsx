import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ArrowLeft, Box, Grid2X2, Maximize2, Minimize2, Expand, Play, RotateCcw, Plus, Minus } from 'lucide-react';
import { pieceRings, pieceDepthLayers, fittedCameraDistance } from '../oficina/scene.mjs';
import { pieceColor, pieceOpacity, contourPath, facePath, markingRings, markingsFor, localBounds, captureFlatView, displayTransform } from './viewerGeometry.mjs';
import './PanelsViewport.css';

const EMPTY = [];
const fmt = value => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(Number(value) || 0);
const VIEW_LABELS = [['iso', 'Perspectiva'], ['front', 'Frente'], ['side', 'Lateral'], ['top', 'Topo']];

function FaceDrawing({ piece, materialId, markings }) {
  const stroke = Math.max(piece.width, piece.height) / 350;
  return <g transform={`translate(0 ${piece.height}) scale(1 -1)`}>
    <path d={facePath(piece)} fillRule="evenodd" fill={pieceColor(piece, materialId)} fillOpacity={pieceOpacity(piece)} stroke="#d9e9f3" strokeWidth={stroke} />
    {(piece.holes || []).filter(h => h.through === false).map((hole, index) => <circle key={hole.id || index} cx={hole.x} cy={hole.y} r={hole.diameter / 2} fill="#b4823c55" stroke="#ffcc7e" strokeWidth={stroke} strokeDasharray={`${stroke * 4} ${stroke * 3}`}><title>Furo cego · Ø {fmt(hole.diameter)} · profundidade {fmt(hole.depth)} mm</title></circle>)}
    {markingsFor(markings, piece.id).map((marking, index) => <path key={marking.id || index} d={contourPath(markingRings(marking))} fill="none" stroke={marking.operation === 'annotation' ? '#d7b6ff' : '#ffbd62'} strokeWidth={stroke * 1.5} strokeDasharray={marking.operation === 'annotation' ? `${stroke * 4} ${stroke * 3}` : undefined} />)}
  </g>;
}

function FlatDetail({ piece, materialId, markings }) {
  const [windowBox, setWindowBox] = useState(() => localBounds(piece));
  const drag = useRef(null), svgHost = useRef(null);
  useEffect(() => {
    setWindowBox(localBounds(piece));
    const svg = svgHost.current;
    const wheel = event => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect(), anchor = [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height];
      setWindowBox(current => {
        const base = localBounds(piece), width = Math.min(base.width * 8, Math.max(base.width / 20, current.width * (event.deltaY > 0 ? 1.12 : .89))), height = current.height * width / current.width;
        return { x: current.x + (current.width - width) * anchor[0], y: current.y + (current.height - height) * anchor[1], width, height };
      });
    };
    svg.addEventListener('wheel', wheel, { passive: false });
    return () => svg.removeEventListener('wheel', wheel);
  }, [piece]);
  const zoom = (factor, anchor = [.5, .5]) => setWindowBox(current => {
    const base = localBounds(piece), width = Math.min(base.width * 8, Math.max(base.width / 20, current.width * factor));
    const ratio = width / current.width, height = current.height * ratio;
    return { x: current.x + (current.width - width) * anchor[0], y: current.y + (current.height - height) * anchor[1], width, height };
  });
  return <div className="opv-flat-detail">
    <div className="opv-detail-title"><strong>{piece.label || piece.name || 'Peça selecionada'}</strong><span>{fmt(piece.width)} × {fmt(piece.height)} × {fmt(piece.thickness)} mm</span></div>
    <svg ref={svgHost} viewBox={`${windowBox.x} ${windowBox.y} ${windowBox.width} ${windowBox.height}`} role="img" aria-label={`Face local de ${piece.label || piece.name}, largura ${fmt(piece.width)} e altura ${fmt(piece.height)} milímetros`}
      onPointerDown={event => { const r = event.currentTarget.getBoundingClientRect(); drag.current = { x: event.clientX, y: event.clientY, box: windowBox, scale: Math.max(windowBox.width / r.width, windowBox.height / r.height) }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => { const start = drag.current; if (start) setWindowBox({ ...start.box, x: start.box.x - (event.clientX - start.x) * start.scale, y: start.box.y - (event.clientY - start.y) * start.scale }); }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <FaceDrawing piece={piece} materialId={materialId} markings={markings} />
    </svg>
    <div className="opv-detail-tools"><span>Face local · X largura / Y altura · mm</span><button onClick={() => zoom(1.25)} aria-label="Afastar desenho"><Minus size={15} /></button><button onClick={() => zoom(.8)} aria-label="Aproximar desenho"><Plus size={15} /></button><button onClick={() => setWindowBox(localBounds(piece))} aria-label="Enquadrar desenho"><Maximize2 size={15} /></button></div>
  </div>;
}

export default function PanelsViewport({ result, selected, onSelect, onCaptureReady, onBack }) {
  const host = useRef(null), sceneHost = useRef(null), api = useRef(null), snapshot = useRef(null), callbacks = useRef({ onSelect, selected });
  const [mode, setMode] = useState('3d'), [view, setView] = useState('iso'), [expanded, setExpanded] = useState(false), [exploded, setExploded] = useState(false), [fallback, setFallback] = useState(false), [notice, setNotice] = useState('');
  const explodedRef = useRef(exploded); explodedRef.current = exploded;
  callbacks.current = { onSelect, selected };
  const pieces = result?.displayPieces || result?.pieces || EMPTY, markings = result?.markings || EMPTY;
  const dimensions = result?.dimensions || {}, materialId = result?.materialId;
  const flat = pieces.find(piece => piece.id === selected) || pieces[0];

  useEffect(() => {
    const container = host.current; if (!container || mode !== '3d') return;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); }
    catch { setFallback(true); setMode('2d'); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#131c28');
    const camera = new THREE.PerspectiveCamera(36, 1, .05, 1000000); camera.up.set(0, 0, 1);
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = false; controls.screenSpacePanning = true;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x5b6a89, 2.5));
    const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(900, -700, 1800); scene.add(light);
    const group = new THREE.Group(), parts = []; scene.add(group);
    for (const piece of pieces) {
      if (!piece.transform) continue;
      const rings = pieceRings(piece); if (rings[0].length < 3) continue;
      const shapeFor = holes => {
        const shape = new THREE.Shape(rings[0].map(([x, y]) => new THREE.Vector2(x, y)));
        for (const ring of rings.slice(1)) shape.holes.push(new THREE.Path(ring.map(([x, y]) => new THREE.Vector2(x, y))));
        for (const hole of holes) { const path = new THREE.Path(); path.absarc(hole.x, hole.y, hole.diameter / 2, 0, Math.PI * 2, true); shape.holes.push(path); }
        return shape;
      };
      const opacity = pieceOpacity(piece), mdf = (piece.material?.id || materialId) === 'mdf';
      const faceMaterial = new THREE.MeshStandardMaterial({ color: pieceColor(piece, materialId), roughness: mdf ? .88 : .2, metalness: 0, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, side: THREE.DoubleSide });
      const cutMaterial = faceMaterial.clone(); if (mdf && piece.material?.process === 'laser') cutMaterial.color.set('#63432c');
      const part = new THREE.Group(), t = displayTransform(piece);
      part.matrixAutoUpdate = false; part.matrix.makeBasis(new THREE.Vector3(...t.u), new THREE.Vector3(...t.v), new THREE.Vector3(...t.normal)); part.matrix.setPosition(new THREE.Vector3(...t.origin));
      for (const slab of pieceDepthLayers(piece)) {
        const geometry = new THREE.ExtrudeGeometry(shapeFor(slab.holes), { depth: slab.depth, bevelEnabled: false, curveSegments: 48 }); geometry.translate(0, 0, slab.start);
        const mesh = new THREE.Mesh(geometry, [faceMaterial, cutMaterial]); mesh.userData.id = piece.id; part.add(mesh);
      }
      const outline = new THREE.ExtrudeGeometry(shapeFor((piece.holes || []).filter(h => h.through !== false && h.diameter > 0)), { depth: Math.max(.05, piece.thickness || .1), bevelEnabled: false, curveSegments: 48 });
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(outline, 25), new THREE.LineBasicMaterial({ color: '#c9dce9', transparent: true, opacity: .55 })); outline.dispose(); part.add(edge);
      for (const marking of markingsFor(markings, piece.id)) {
        for (const ring of markingRings(marking)) {
          const points = ring.map(([x, y]) => new THREE.Vector3(x, y, Math.max(.05, piece.thickness || .1) + .025));
          const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: marking.operation === 'annotation' ? '#d7b6ff' : '#ffbd62', depthTest: false }));
          line.renderOrder = 10; part.add(line);
        }
      }
      part.userData = { piece, base: [...t.origin], materials: [faceMaterial, cutMaterial], edge }; group.add(part); parts.push(part);
    }
    for (const marking of markings.filter(item => !item.targetPieceId && item.visible !== false && item.transform)) {
      const annotation = new THREE.Group(), t = marking.transform;
      annotation.matrixAutoUpdate = false; annotation.matrix.makeBasis(new THREE.Vector3(...t.u), new THREE.Vector3(...t.v), new THREE.Vector3(...t.normal)); annotation.matrix.setPosition(new THREE.Vector3(...t.origin));
      for (const ring of markingRings(marking)) {
        const geometry = new THREE.BufferGeometry().setFromPoints(ring.map(([x, y]) => new THREE.Vector3(x, y, .025)));
        const line = new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({ color: '#d7b6ff' })); annotation.add(line);
      }
      group.add(annotation);
    }
    const bounds = new THREE.Box3().setFromObject(group), center = bounds.isEmpty() ? new THREE.Vector3() : bounds.getCenter(new THREE.Vector3());
    const extent = bounds.isEmpty() ? new THREE.Vector3(300, 200, 150) : bounds.getSize(new THREE.Vector3());
    const size = Math.max(1, extent.x, extent.y, extent.z), boundsKey = [...center.toArray(), ...extent.toArray()].map(n => n.toFixed(2)).join(':');
    const grid = new THREE.GridHelper(size * 4, 40, '#3c4e63', '#233246'); grid.rotateX(Math.PI / 2); grid.position.set(center.x, center.y, bounds.isEmpty() ? -1 : bounds.min.z - size * .008); scene.add(grid);
    const axes = new THREE.AxesHelper(size * .18); axes.position.set(center.x - extent.x / 2 - size * .08, center.y - extent.y / 2 - size * .08, grid.position.z + .2); scene.add(axes);
    let animationFrame = 0, disposed = false, animationStart = null, amount = explodedRef.current ? 1 : 0;
    const render = () => { if (!disposed) renderer.render(scene, camera); };
    const present = value => { amount = value; for (const part of parts) {
      const { piece, base } = part.userData;
      const partCenter = new THREE.Vector3(...base).addScaledVector(new THREE.Vector3(...displayTransform(piece).u), piece.width / 2).addScaledVector(new THREE.Vector3(...displayTransform(piece).v), piece.height / 2);
      const away = partCenter.sub(center); if (away.lengthSq() < .001) away.fromArray(piece.transform.normal);
      away.normalize().multiplyScalar(size * .35 * value);
      part.matrix.setPosition(new THREE.Vector3(...base).add(away)); part.matrixWorldNeedsUpdate = true;
    } render(); };
    const fit = () => {
      const activeBounds = new THREE.Box3().setFromObject(group), activeCenter = activeBounds.isEmpty() ? center : activeBounds.getCenter(new THREE.Vector3()), activeExtent = activeBounds.isEmpty() ? extent : activeBounds.getSize(new THREE.Vector3());
      const direction = new THREE.Vector3(...(view === 'front' ? [0, -1, .001] : view === 'side' ? [1, 0, .001] : view === 'top' ? [0, -.001, 1] : [1, -1, .8])).normalize();
      const distance = fittedCameraDistance(activeExtent.toArray(), direction.toArray(), camera.aspect, camera.fov, 1.24);
      controls.target.copy(activeCenter); camera.position.copy(activeCenter).addScaledVector(direction, distance); camera.near = Math.max(.01, size / 10000); camera.far = Math.max(100000, size * 100); camera.updateProjectionMatrix(); controls.update(); render();
    };
    let firstResize = true;
    const resize = () => {
      const w = container.clientWidth, h = container.clientHeight; if (w < 2 || h < 2) return;
      renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
      if (firstResize) { fit(); const saved = snapshot.current; if (saved?.view === view && saved.boundsKey === boundsKey && Math.abs(saved.aspect - camera.aspect) < .15) { camera.position.fromArray(saved.position); controls.target.fromArray(saved.target); controls.update(); } firstResize = false; } else fit(); render();
    };
    const observer = new ResizeObserver(resize); observer.observe(container);
    const change = () => render(); controls.addEventListener('change', change);
    const select = id => { for (const part of parts) { const active = part.userData.piece.id === id; part.userData.materials.forEach(material => material.emissive.set(active ? '#193c60' : '#000000')); part.userData.edge.material.color.set(active ? '#62c7ff' : '#c9dce9'); part.userData.edge.material.opacity = active ? 1 : .55; } render(); };
    const ray = new THREE.Raycaster(); let down;
    const pointerDown = event => { down = [event.clientX, event.clientY]; };
    const pointerUp = event => { if (!down || Math.hypot(event.clientX - down[0], event.clientY - down[1]) > 5) return; const rect = renderer.domElement.getBoundingClientRect(); ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera); const hit = ray.intersectObjects(group.children, true).find(item => item.object.userData.id); if (hit) callbacks.current.onSelect?.(hit.object.userData.id); };
    renderer.domElement.addEventListener('pointerdown', pointerDown); renderer.domElement.addEventListener('pointerup', pointerUp);
    const stopAnimation = () => { cancelAnimationFrame(animationFrame); animationStart = null; };
    api.current = {
      capture: () => { render(); return renderer.domElement.toDataURL('image/png'); }, select,
      explode: value => { stopAnimation(); present(value ? 1 : 0); fit(); },
      animate: () => { stopAnimation(); animationStart = performance.now(); present(1); fit(); const tick = time => { if (animationStart === null || disposed) return; const progress = Math.min(1, (time - animationStart) / 1800); present(1 - progress * progress * (3 - 2 * progress)); if (progress < 1) animationFrame = requestAnimationFrame(tick); else { animationStart = null; setNotice('Montagem concluída.'); } }; animationFrame = requestAnimationFrame(tick); },
      reset: () => { stopAnimation(); present(0); fit(); }
    };
    present(amount); resize(); select(callbacks.current.selected);
    return () => {
      snapshot.current = { view, boundsKey, aspect: camera.aspect, position: camera.position.toArray(), target: controls.target.toArray() };
      disposed = true; stopAnimation(); observer.disconnect(); controls.dispose(); api.current = null;
      const geometries = new Set(), materials = new Set(); scene.traverse(object => { if (object.geometry) geometries.add(object.geometry); (Array.isArray(object.material) ? object.material : [object.material]).filter(Boolean).forEach(material => materials.add(material)); }); geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); renderer.dispose(); renderer.domElement.remove();
    };
  }, [pieces, markings, materialId, view, mode]);
  useEffect(() => { api.current?.select(selected); }, [selected, pieces, mode]);
  useEffect(() => { onCaptureReady?.(() => mode === '2d' ? captureFlatView(sceneHost.current) : api.current?.capture()); return () => onCaptureReady?.(null); }, [onCaptureReady, mode]);
  useEffect(() => { if (!expanded) return; const escape = event => { if (event.key === 'Escape') setExpanded(false); }; document.addEventListener('keydown', escape); return () => document.removeEventListener('keydown', escape); }, [expanded]);
  const reset = () => { snapshot.current = null; setExploded(false); setView('iso'); api.current?.reset(); setNotice('Vista e montagem restauradas.'); };
  return <section className={`opv-viewer${expanded ? ' opv-expanded' : ''}`} aria-label="Composição de acrílico e MDF">
    <header className="opv-head">{onBack && <button onClick={onBack} aria-label="Voltar às ferramentas"><ArrowLeft size={17} /></button>}<div className="opv-title"><strong>Composição</strong><span>{pieces.length} {pieces.length === 1 ? 'peça visível' : 'peças visíveis'} · mm</span></div><div className="opv-segment"><button aria-pressed={mode === '3d'} onClick={() => setMode('3d')}><Box size={16} />3D</button><button aria-pressed={mode === '2d'} onClick={() => setMode('2d')}><Grid2X2 size={16} />2D</button></div><button onClick={() => setExpanded(!expanded)} aria-label={expanded ? 'Reduzir prévia' : 'Ampliar prévia'}>{expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button></header>
    <div className="opv-toolbar"><div className="opv-segment">{VIEW_LABELS.map(([id, label]) => <button key={id} disabled={mode === '2d'} aria-pressed={view === id} onClick={() => { snapshot.current = null; setView(id); }}>{label}</button>)}</div><span className="opv-physical">{fmt(dimensions.width)} L × {fmt(dimensions.depth)} P × {fmt(dimensions.height)} A <small>mm</small></span></div>
    <div className="opv-scene-wrap" ref={sceneHost}>{mode === '3d' ? <><div className="opv-scene" ref={host} /><span className="opv-axis-key"><i>X · largura</i><i>Y · profundidade</i><i>Z · altura</i></span></> : <div className="opv-flat-layout"><div className="opv-overview" aria-label="Todas as peças visíveis">{pieces.map(piece => <button key={piece.id} aria-pressed={flat?.id === piece.id} onClick={() => onSelect?.(piece.id)}><svg viewBox={`-${Math.max(piece.width, piece.height) * .05} -${Math.max(piece.width, piece.height) * .05} ${piece.width + Math.max(piece.width, piece.height) * .1} ${piece.height + Math.max(piece.width, piece.height) * .1}`} aria-hidden="true"><FaceDrawing piece={piece} materialId={materialId} markings={markings} /></svg><strong>{piece.label || piece.name}</strong><span>{fmt(piece.width)} × {fmt(piece.height)} mm</span></button>)}{markings.filter(marking => !marking.targetPieceId && marking.visible !== false).map(marking => {
      const rings = markingRings(marking), points = rings.flat(), xs = points.map(point => point[0]), ys = points.map(point => point[1]);
      const minX = Math.min(0, ...xs), minY = Math.min(0, ...ys), width = Math.max(1, ...xs) - minX, height = Math.max(1, ...ys) - minY;
      return <div className="opv-annotation" key={marking.id}><svg viewBox={`${minX - width * .05} ${minY - height * .05} ${width * 1.1} ${height * 1.1}`} aria-label="Anotação sem material"><g transform={`translate(0 ${minY * 2 + height}) scale(1 -1)`}><path d={contourPath(rings)} fill="none" stroke="#d7b6ff" strokeWidth={Math.max(width, height) / 180} /></g></svg><strong>Anotação</strong><span>{marking.text || 'Referência visual'}</span></div>;
    })}</div>{flat && <FlatDetail piece={flat} materialId={materialId} markings={markings} />}</div>}
      {!pieces.length && <span className="opv-empty">Adicione um objeto para visualizar as peças.</span>}
      {result && !result.valid && <span className="opv-invalid">Prévia parcial · confira os avisos de geometria</span>}
    </div>
    <div className="opv-hint">{mode === '3d' ? 'Arraste para girar · botão direito para mover · role para aproximar · toque para selecionar' : 'Todas as peças à esquerda · arraste a face para mover · role para aproximar'}{fallback && ' · WebGL indisponível: usando desenho 2D'}</div>
    <div className="opv-parts-strip">{pieces.map(piece => <button key={piece.id} aria-pressed={flat?.id === piece.id} onClick={() => onSelect?.(piece.id)}><i style={{ background: pieceColor(piece, materialId), opacity: pieceOpacity(piece) }} /><span>{piece.label || piece.name}<small>{fmt(piece.width)} × {fmt(piece.height)} × {fmt(piece.thickness)} mm</small></span></button>)}</div>
    <footer className="opv-actions"><button disabled={pieces.length < 2 || mode !== '3d'} aria-pressed={exploded} onClick={() => { const next = !exploded; setExploded(next); api.current?.explode(next); }}><Expand size={16} />Explodir</button><button disabled={pieces.length < 2 || mode !== '3d'} onClick={() => { setExploded(false); api.current?.animate(); setNotice('Animação da montagem em andamento.'); }}><Play size={16} />Montar</button><button onClick={reset}><RotateCcw size={16} />Restaurar</button><span>Âmbar: gravação · lilás: anotação</span></footer>
    <span className="opv-sr" role="status">{notice}</span>
  </section>;
}
