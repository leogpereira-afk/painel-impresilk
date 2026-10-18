import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MM_TO_SCENE as S, CAMERA_VIEWS, boundsFrameKey, cameraFrame, structurePrismTransform, withoutEditorOverlays, cutoutContour, unfoldedPanels, foldedPanelTransform, flangeFixingTransform, unfoldedPlacement } from './viewportGeometry.mjs';
import './acm-viewport.css';
import { documentGeometry } from '../../lib/acm/documents.mjs';
import { visualOf } from '../../lib/acm/visual.mjs';
import { renderPieceArtwork, renderPhotoBackground } from '../../lib/acm/visual-browser.mjs';

const fmt = value => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value);
const finishLabel = { matte: 'Fosco', glossy: 'Brilhante', metallic: 'Metálico', brushed: 'Escovado', wood: 'Amadeirado', mirror: 'Espelhado' };

function makeTexture(finish) {
  if (!['brushed', 'wood'].includes(finish)) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const pixels = ctx.createImageData(canvas.width, canvas.height);
  let seed = 43821;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const stripes = Array.from({ length: 256 }, random);
  for (let y = 0; y < 512; y += 1) {
    for (let x = 0; x < 256; x += 1) {
      const index = (y * 256 + x) * 4;
      const wave = Math.sin(x * 0.28 + Math.sin(y * 0.013) * 1.7 + Math.sin(y * 0.033 + x * 0.03) * 0.45);
      const intensity = finish === 'wood' ? 196 + wave * 29 + stripes[x] * 19 : 221 + stripes[x] * 27 + random() * 7;
      pixels.data[index] = intensity;
      pixels.data[index + 1] = intensity;
      pixels.data[index + 2] = intensity;
      pixels.data[index + 3] = 255;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function makeFinish(material, transparent, map) {
  const finish = material.finish || 'matte';
  const roughness = { matte: 0.64, glossy: 0.13, metallic: 0.29, brushed: 0.33, wood: 0.49, mirror: 0.025 }[finish] ?? 0.55;
  return new THREE.MeshPhysicalMaterial({
    color: material.color || '#364152', map,
    roughness, metalness: ['metallic', 'brushed', 'mirror'].includes(finish) ? 0.92 : 0.2,
    clearcoat: ['glossy', 'wood', 'mirror'].includes(finish) ? 0.7 : 0.1,
    clearcoatRoughness: 0.15, envMapIntensity: finish === 'mirror' ? 1.5 : 0.7,
    side: THREE.DoubleSide, transparent, opacity: transparent ? 0.28 : 1,
    depthWrite: !transparent,
  });
}

function shapeFrom(contour, holes = []) {
  const shape = new THREE.Shape(contour.map(([x, y]) => new THREE.Vector2(x * S, y * S)));
  for (const cutout of holes) {
    const points = cutoutContour(cutout);
    if (points.length > 2) shape.holes.push(new THREE.Path(points.map(([x, y]) => new THREE.Vector2(x * S, y * S))));
  }
  return shape;
}

function addPanel(parent, contour, thickness, finish, core, back, pieceId, holes = []) {
  if (contour.length < 3) return;
  const shape = shapeFrom(contour, holes);
  const extrusion = new THREE.ExtrudeGeometry(shape, { depth: thickness * S, bevelEnabled: false, steps: 1, curveSegments: 1 });
  extrusion.translate(0, 0, -thickness * S);
  const sideGroups = extrusion.groups.filter(item => item.materialIndex === 1);
  extrusion.clearGroups();
  for (const item of sideGroups) extrusion.addGroup(item.start, item.count, 0);
  const body = new THREE.Mesh(extrusion, [core]);
  body.castShadow = true; body.receiveShadow = true; body.userData.pieceId = pieceId;
  parent.add(body);
  // Separate skins avoid overlapping coplanar caps and preserve true thickness.
  const faceGeometry = new THREE.ShapeGeometry(shape);
  const reverse = new THREE.Mesh(faceGeometry, back);
  reverse.position.z = -thickness * S; reverse.castShadow = true; reverse.receiveShadow = true; reverse.userData.pieceId = pieceId;
  parent.add(reverse);
  const face = new THREE.Mesh(faceGeometry, finish);
  face.castShadow = true; face.receiveShadow = true; face.userData.pieceId = pieceId;
  parent.add(face);
}

function addLine(parent, points, color, dashed = false) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map(point => new THREE.Vector3(...point)));
  const line = new THREE.Line(geometry, dashed
    ? new THREE.LineDashedMaterial({ color, dashSize: 0.025, gapSize: 0.015, transparent: true, opacity: 0.8 })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 }));
  if (dashed) line.computeLineDistances();
  parent.add(line);
  return line;
}

function addGrainDirection(group, width, height, pieceId) {
  const size = Math.min(width, height) * S * 0.08;
  const x = width * S * 0.83; const y = height * S * 0.1; const z = 0.003;
  const arrow = new THREE.Group(); arrow.userData.pieceId = pieceId;
  addLine(arrow, [[x, y, z], [x, y + size, z]], '#75a9c4');
  addLine(arrow, [[x - size * 0.2, y + size * 0.72, z], [x, y + size, z], [x + size * 0.2, y + size * 0.72, z]], '#75a9c4');
  group.add(arrow);
}

function addText(parent, text, position, size, color = '#4c5d70', background = true, depthTest = false) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const fontSize = 30;
  ctx.font = `600 ${fontSize}px system-ui`;
  canvas.width = Math.ceil(ctx.measureText(text).width + 30); canvas.height = 54;
  ctx.font = `600 ${fontSize}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (background) { ctx.fillStyle = 'rgba(255,255,255,.94)'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  ctx.fillStyle = color; ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 1);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthTest, depthWrite: false }));
  sprite.position.set(...position); sprite.scale.set(size * canvas.width / canvas.height, size, 1); sprite.renderOrder = 9;
  parent.add(sprite);
  return sprite;
}

function addDimension(parent, start, end, text, labelSize, axis = 'x') {
  const offset = labelSize * 0.28;
  addLine(parent, [start, end], '#8292a3');
  for (const point of [start, end]) {
    const a = [...point]; const b = [...point];
    const tickAxis = axis === 'x' ? 1 : 0;
    a[tickAxis] -= offset; b[tickAxis] += offset;
    addLine(parent, [a, b], '#8292a3');
  }
  const middle = start.map((value, index) => (value + end[index]) / 2);
  addText(parent, `${text} mm`, middle, labelSize);
}

function disposeGroup(group) {
  const geometries = new Set(); const materials = new Set(); const textures = new Set();
  group.traverse(child => {
    if (child.geometry) geometries.add(child.geometry);
    for (const material of (Array.isArray(child.material) ? child.material : child.material ? [child.material] : [])) materials.add(material);
  });
  for (const material of materials) {
    for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    material.dispose();
  }
  for (const texture of textures) texture.dispose();
  for (const geometry of geometries) geometry.dispose();
  group.clear();
}

function addStructure(group, segments, surfaces = []) {
  if (!segments.length) return;
  const metal = new THREE.MeshStandardMaterial({ color: '#667b8c', metalness: 0.76, roughness: 0.37 });
  for (const segment of segments) {
    const start = new THREE.Vector3(...segment.start).multiplyScalar(S);
    const end = new THREE.Vector3(...segment.end).multiplyScalar(S);
    const delta = end.clone().sub(start);
    if (delta.length() <= 0) continue;
    const surface = surfaces.find(item => item.id === segment.surface);
    let geometry, mesh;
    if (segment.contour?.length >= 3 && segment.local && surface?.transform) {
      const transform = structurePrismTransform(segment, surface);
      geometry = new THREE.ExtrudeGeometry(shapeFrom(segment.contour), { depth: segment.depth * S, bevelEnabled: false, steps: 1 });
      geometry.translate(0, 0, -segment.depth * S / 2);
      mesh = new THREE.Mesh(geometry, metal);
      mesh.position.fromArray(transform.origin).multiplyScalar(S);
      mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...transform.u), new THREE.Vector3(...transform.v), new THREE.Vector3(...transform.normal)));
    } else {
      geometry = new THREE.BoxGeometry(segment.width * S, delta.length(), segment.depth * S);
      mesh = new THREE.Mesh(geometry, metal);
      mesh.position.copy(start).add(end).multiplyScalar(0.5);
      const along = delta.normalize();
      if (segment.normal) {
        const normal = new THREE.Vector3(...segment.normal).normalize();
        const across = new THREE.Vector3().crossVectors(along, normal).normalize();
        mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(across, along, normal));
      } else mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), along);
    }
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.structureId = segment.id;
    group.add(mesh);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: '#405668', transparent: true, opacity: 0.35 }));
    edges.position.copy(mesh.position); edges.quaternion.copy(mesh.quaternion); group.add(edges);
  }
}

function addFixings(group, piece, project, exploded, onFront = false) {
  const thickness = piece.material?.thickness || project.material.thickness;
  const fixing = piece.fixing || project.fixing;
  const z = onFront ? 0.002 : -(thickness + fixing.thickness / 2) * S - (exploded ? 0.05 : 0);
  const tapeMaterial = new THREE.MeshStandardMaterial({ color: '#18a771', roughness: 0.75, emissive: '#0a3a26', emissiveIntensity: 0.12, side: THREE.DoubleSide });
  for (const strip of piece.fixings?.tape || []) {
    const dx = (strip.x2 - strip.x1) * S; const dy = (strip.y2 - strip.y1) * S;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(strip.width * S, Math.hypot(dx, dy), Math.max(0.0001, (fixing.thickness || 1) * S)), tapeMaterial);
    mesh.position.set((strip.x1 + strip.x2) / 2 * S, (strip.y1 + strip.y2) / 2 * S, z);
    mesh.rotation.z = -Math.atan2(dx, dy); mesh.userData.pieceId = piece.id; group.add(mesh);
  }
  const screwMaterial = new THREE.MeshStandardMaterial({ color: '#d4a34c', metalness: 0.8, roughness: 0.3 });
  for (const screw of piece.fixings?.screws || []) {
    const located=flangeFixingTransform(piece,screw);if(!located)continue;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.003, 10), screwMaterial);
    if(screw.coordinateSpace==='blank') {
      const normal=new THREE.Vector3(...located.normal);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),normal);
      mesh.position.set(...located.position.map((v,i)=>(v-located.normal[i]*(thickness+1))*S));
    } else {mesh.rotation.x = Math.PI / 2; mesh.position.set(screw.x * S, screw.y * S, onFront ? 0.0025 : z);}
    mesh.userData.pieceId = piece.id; group.add(mesh);
  }
  // Materials are otherwise unattached for empty maps.
  if (!piece.fixings?.tape?.length) tapeMaterial.dispose();
  if (!piece.fixings?.screws?.length) screwMaterial.dispose();
}

function setSurfaceTransform(group, piece, exploded) {
  const { origin, u, v, normal } = piece.transform;
  const matrix = new THREE.Matrix4().makeBasis(new THREE.Vector3(...u), new THREE.Vector3(...v), new THREE.Vector3(...normal));
  group.quaternion.setFromRotationMatrix(matrix);
  const separation = exploded ? 220 : 0;
  group.position.set(...origin.map((value, index) => (value + u[index] * piece.x + v[index] * piece.y + normal[index] * separation) * S));
}

function panelDrills(piece,panel) {
  const face=piece.blank.face??{x:0,y:0};
  const generated=(piece.fixings?.screws??[]).filter(h=>h.drillDiameter>0&&(h.coordinateSpace==='blank'?h.edge===panel.edge&&h.foldNumber===panel.number:panel.edge==='center')).map(h=>({x:h.x+(h.coordinateSpace==='blank'?0:face.x),y:h.y+(h.coordinateSpace==='blank'?0:face.y),diameter:h.drillDiameter}));
  return [...(panel.edge==='center'?piece.blank.holes??[]:[]),...generated];
}
function panelHoles(piece, panel) {
  return [...(panel.edge==='center'?piece.blank.cutouts??[]:[]),...panelDrills(piece,panel)]
    .map(h=>cutoutContour(h).map(([x,y])=>[x-panel.pivot[0],y-panel.pivot[1]]));
}
/** Change nominal panel length while keeping every drilled circle circular and its diameter unchanged. */
function compensatePanelGeometry(meshGroup,piece,panel,scale) {
  if(meshGroup.userData.compensationScale===scale)return;
  const axis=panel.axis==='y'?0:1,drills=panelDrills(piece,panel).map(h=>({center:[(h.x-panel.pivot[0])*S,(h.y-panel.pivot[1])*S],radius:h.diameter/2*S})),geometries=new Set();
  meshGroup.traverse(child=>{if(child.geometry)geometries.add(child.geometry)});
  for(const geometry of geometries){const attribute=geometry.attributes.position;if(!attribute)continue;geometry.userData.originalPositions??=new Float32Array(attribute.array);const original=geometry.userData.originalPositions;
    for(let i=0;i<attribute.count;i++){const x=original[i*3],y=original[i*3+1],hole=drills.find(h=>Math.abs(Math.hypot(x-h.center[0],y-h.center[1])-h.radius)<1e-6);attribute.array[i*3+axis]=original[i*3+axis]+(scale-1)*(hole?hole.center[axis]:original[i*3+axis]);}
    attribute.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingSphere();
  }
  meshGroup.userData.compensationScale=scale;
}
function applyFoldTransform(flap, piece, panel, progress) {
  const transform=foldedPanelTransform(piece,panel,progress);
  flap.position.set(...transform.origin.map(v=>v*S));
  if(panel.axis) { flap.rotation[panel.axis]=transform.angle; compensatePanelGeometry(flap.children[0],piece,panel,transform.scale); }
}

function addFoldPanels(group, piece, finish, core, back, progress, state) {
  for(const panel of unfoldedPanels(piece)) {
    const flap=new THREE.Group(), meshGroup=new THREE.Group();
    addPanel(meshGroup,panel.contour.map(([x,y])=>[x-panel.pivot[0],y-panel.pivot[1]]),piece.material.thickness,finish,core,back,piece.id,panelHoles(piece,panel));
    flap.add(meshGroup); applyFoldTransform(flap,piece,panel,progress);group.add(flap);
    if(panel.axis && state) state.foldPivots.push({flap,piece,panel});
  }
}
function addTray(group, piece, finish, core, back) {
  const assembly=new THREE.Group(), face=piece.blank.face??{x:0,y:0};
  assembly.position.set(-face.x*S,-face.y*S,0);
  addFoldPanels(assembly,piece,finish,core,back,1);group.add(assembly);
}

export function SceneFallback({ result, selectedId, onSelect, mode, project }) {
  const selected = result.pieces?.find(piece => piece.id === selectedId);
  const technical = result.pieces?.some(piece => piece.technical);
  const pieces = mode === 'unfolded' && selected ? [selected] : (result.pieces || []).filter(piece => technical || piece.surface === 'front');
  const width = mode === 'unfolded' && selected ? selected.blank.width : technical ? Math.max(1,...pieces.map(p=>p.transform.origin[0]+p.width)) : project.front.width;
  const height = mode === 'unfolded' && selected ? selected.blank.height : technical ? Math.max(1,...pieces.map(p=>p.height)) : project.front.height;
  return <div className="acmv-fallback">
    <span className="acmv-fallback-note">Visualização 2D · WebGL indisponível neste dispositivo</span>
    <svg role="img" aria-label={mode === 'unfolded' ? 'Peça desenvolvida em escala' : 'Elevação frontal em escala'} viewBox={`-80 -80 ${width + 160} ${height + 160}`}>
      <g transform={`translate(0 ${height}) scale(1 -1)`}>
        {pieces.map(piece => { const flat = (mode === 'unfolded' && selected) || technical; const geometry = flat ? documentGeometry(piece, {back:false}) : null; return <g key={piece.id} transform={technical && mode !== 'unfolded' ? `translate(${piece.transform.origin[0]} 0)` : undefined} onClick={() => onSelect?.(piece.id)} role="button" tabIndex={0} aria-label={`Selecionar ${piece.id}`} onKeyDown={event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); onSelect?.(piece.id); } }}>
          {(mode === 'unfolded' && selected) || technical
            ? <polygon points={piece.blank.contour.map(point => point.join(',')).join(' ')} fill={piece.material.color} stroke={selectedId === piece.id ? '#208bc8' : '#66758a'} strokeWidth={5} />
            : <rect x={piece.x} y={piece.y} width={piece.width} height={piece.height} fill={piece.material.color} stroke={selectedId === piece.id ? '#208bc8' : '#66758a'} strokeWidth={selectedId === piece.id ? 8 : 2} />}
          {geometry?.cutouts.map((points,index)=><polygon key={`cutout-${index}`} points={points.map(p=>p.join(',')).join(' ')} fill="#eff3f7" stroke="#000000" strokeWidth={1}/>)}
          {geometry?.drills.map((hole,index)=>hole.diameter?<circle key={`hole-${index}`} cx={hole.x} cy={hole.y} r={hole.diameter/2} fill="#eff3f7" stroke="#0000ff" strokeWidth={1}/>:<path key={`hole-${index}`} d={`M ${hole.x-3} ${hole.y} h 6 M ${hole.x} ${hole.y-3} v 6`} fill="none" stroke="#0000ff"/>)}
          {geometry?.grooves.map((groove, index) => <line key={index} x1={groove.x1} y1={groove.y1} x2={groove.x2} y2={groove.y2} stroke="#ff0000" strokeWidth={1} />)}
        </g>})}
      </g>
    </svg>
    <div>{fmt(width)} × {fmt(height)} mm · {mode === 'unfolded' && selected ? selected.id : 'Frente'}</div>
  </div>;
}

export default function ACMViewport({ project, result, selectedId, onSelect, mode = 'assembled', view = 'iso', showStructure = false, showFixings = false, transparent = false, onCapture, presentation = false, hideArtwork = false, onCameraAPI, onCameraChange, immersive = false }) {
  const hostRef = useRef(null);
  const sceneRef = useRef(null);
  const selectRef = useRef(onSelect);
  const captureRef = useRef(onCapture);
  const viewRef = useRef(view);
  const cameraChangeRef = useRef(onCameraChange);
  const foldRef = useRef(0);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [dimensions, setDimensions] = useState(!presentation);
  const [labels, setLabels] = useState(!presentation);
  const [fold, setFold] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [announce, setAnnounce] = useState('');
  const [optionsOpen, setOptionsOpen] = useState(false);
  selectRef.current = onSelect; captureRef.current = onCapture; cameraChangeRef.current = onCameraChange; viewRef.current = view; foldRef.current = fold;

  useEffect(() => {
    const host = hostRef.current;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    } catch {
      setFailed(true); onCapture?.(null); return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute('aria-label', 'Fachada em 3D. Arraste para girar, use a roda para aproximar, F para enquadrar.');
    renderer.domElement.setAttribute('role', 'img');
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#eff3f7');
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const environment = pmrem.fromScene(room, 0.04);
    scene.environment = environment.texture; room.dispose(); pmrem.dispose();
    const ambient = new THREE.HemisphereLight('#f5faff', '#b8c4cf', 2.1); scene.add(ambient);
    const sun = new THREE.DirectionalLight('#fff5e9', 3.8); sun.position.set(3, 8, 5);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.00012; sun.shadow.normalBias = 0.004;
    scene.add(sun); scene.add(sun.target);
    const fill = new THREE.DirectionalLight('#bedcfa', 1.4); fill.position.set(-6, 2, -3); scene.add(fill);
    const model = new THREE.Group(); const annotations = new THREE.Group(); const surroundings = new THREE.Group();
    scene.add(model, annotations, surroundings);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.001, 10000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false; controls.screenSpacePanning = true; controls.minDistance = 0.03; controls.maxDistance = 500;
    controls.rotateSpeed = 0.6; controls.zoomSpeed = 0.8;
    const state = { renderer, scene, camera, controls, model, annotations, surroundings, sun, ambient, bounds: new THREE.Box3(), frame: 0, stopped: false };
    const render = () => {
      if (state.stopped || state.frame) return;
      state.frame = requestAnimationFrame(() => {
        state.frame = 0;
        if (state.stopped) return;
        // The presentation floor must not cover the underside or its labels.
        surroundings.visible = camera.position.y >= state.bounds.min.y;
        scene.updateMatrixWorld(true);
        for (const label of state.pieceLabels || []) {
          const towardCamera = camera.position.clone().sub(label.getWorldPosition(new THREE.Vector3())).normalize();
          const normal = new THREE.Vector3(0, 0, 1).transformDirection(label.parent.matrixWorld);
          label.visible = towardCamera.dot(normal) > 0.05;
        }
        renderer.render(scene, camera);
      });
    };
    state.render = render;
    state.fit = (namedView = viewRef.current, preserveDirection = false) => {
      if (state.bounds.isEmpty()) return;
      const center = state.bounds.getCenter(new THREE.Vector3());
      const size = state.bounds.getSize(new THREE.Vector3());
      const direction = preserveDirection ? camera.position.clone().sub(controls.target).normalize() : new THREE.Vector3(...(CAMERA_VIEWS[namedView] || CAMERA_VIEWS.iso)).normalize();
      const radius = size.length() / 2;
      const { distance } = cameraFrame(state.bounds.min.toArray(), state.bounds.max.toArray(), direction.toArray(), camera.aspect, camera.fov);
      controls.target.copy(center); camera.position.copy(center).addScaledVector(direction, distance);
      camera.up.set(0, 1, 0); camera.lookAt(center);
      camera.near = Math.max(0.001, distance / 1000); camera.far = Math.max(100, distance * 40); camera.updateProjectionMatrix();
      controls.minDistance = Math.max(0.02, radius * 0.02); controls.maxDistance = Math.max(100, radius * 20); controls.update(); render();
    };
    state.zoom = factor => { camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target); controls.update(); render(); };
    const cameraChanged = () => { render(); cameraChangeRef.current?.({ position: camera.position.toArray(), target: controls.target.toArray(), fov: camera.fov }); };
    controls.addEventListener('change', cameraChanged);
    let pointerStart = null;
    const down = event => { pointerStart = [event.clientX, event.clientY]; };
    const up = event => {
      if (!pointerStart || Math.hypot(event.clientX - pointerStart[0], event.clientY - pointerStart[1]) > 5) return;
      pointerStart = null;
      const rect = renderer.domElement.getBoundingClientRect();
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
      const hit = raycaster.intersectObjects(model.children, true).find(item => item.object.userData.pieceId);
      if (hit) { selectRef.current?.(hit.object.userData.pieceId); setAnnounce(`Peça ${hit.object.userData.pieceId} selecionada`); }
    };
    renderer.domElement.addEventListener('pointerdown', down); renderer.domElement.addEventListener('pointerup', up);
    const contextLost = event => { event.preventDefault(); setFailed(true); setReady(false); captureRef.current?.(null); state.stopped = true; };
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    const resize = () => {
      const width = Math.max(1, host.clientWidth); const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); state.refreshBackground?.(); render();
    };
    const observer = new ResizeObserver(resize); observer.observe(host); resize();
    sceneRef.current = state;
    setReady(true);
    return () => {
      state.stopped = true; cancelAnimationFrame(state.frame); observer.disconnect(); controls.removeEventListener('change', cameraChanged); controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', down); renderer.domElement.removeEventListener('pointerup', up); renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      disposeGroup(model); disposeGroup(annotations); disposeGroup(surroundings); environment.dispose(); state.backgroundTexture?.dispose(); sun.shadow.dispose(); renderer.dispose();
      renderer.domElement.remove(); sceneRef.current = null; captureRef.current?.(null);
    };
    // The WebGL context is mounted once; mutable props are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready || failed) return undefined;
    const capture = (expectedProject, options = {}) => {
      const state = sceneRef.current;
      if (!state || state.stopped) throw new Error('Visualização 3D indisponível.');
      if (state.layoutPending) throw new Error('Aguarde o carregamento das imagens do layout antes de exportar.');
      if (state.layoutError) throw new Error(state.layoutError);
      if (expectedProject && state.projectStamp !== JSON.stringify(expectedProject)) throw new Error('A cena está atualizando. Aguarde o desenho acompanhar o projeto antes de exportar.');
      const previous = { position: state.camera.position.clone(), target: state.controls.target.clone(), background: state.scene.background, surroundings: state.surroundings.visible };
      try {
        if (options.view) state.fit(options.view);
        if (options.transparent) { state.scene.background = null; state.surroundings.visible = false; }
        return withoutEditorOverlays(state.scene, () => {
          state.renderer.render(state.scene, state.camera);
          const source = state.renderer.domElement;
          const canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height;
          const ctx = canvas.getContext('2d'); ctx.drawImage(source, 0, 0);
          if (options.watermark !== false) {
            const unit = Math.max(1, canvas.width / 1100);
            ctx.fillStyle = '#ffffffdd'; ctx.fillRect(0, canvas.height - 40 * unit, canvas.width, 40 * unit);
            ctx.fillStyle = '#52677b'; ctx.font = `${11 * unit}px system-ui`;
            ctx.fillText(`IMPRESILK ACM STUDIO · SIMULAÇÃO VISUAL · ${state.projectName || 'Projeto'} · Rev. ${state.revision || 1}`, 18 * unit, canvas.height - 15 * unit);
          }
          return canvas.toDataURL('image/png');
        });
      } finally {
        state.camera.position.copy(previous.position); state.controls.target.copy(previous.target); state.controls.update();
        state.scene.background = previous.background; state.surroundings.visible = previous.surroundings; state.render();
      }
    };
    onCapture?.(capture);
    return () => onCapture?.(null);
  }, [ready, failed, onCapture]);

  useEffect(() => {
    if (!ready) return;
    const state = sceneRef.current;
    if (!state || state.stopped) return;
    const { model, annotations, surroundings } = state;
    disposeGroup(model); disposeGroup(annotations); disposeGroup(surroundings);
    state.layoutPending = presentation; state.layoutError = '';
    state.foldPivots = []; state.pieceLabels = []; state.projectName = project.name; state.revision = project.revision; state.projectStamp = JSON.stringify(project);
    if (!result.valid || !result.pieces?.length) { state.layoutPending = false; state.bounds.makeEmpty(); state.render(); return; }
    const selected = result.pieces.find(piece => piece.id === selectedId);
    const pieces = mode === 'unfolded' && selected ? [selected] : result.pieces;
    const positions = mode === 'unfolded' ? unfoldedPlacement(pieces) : [];
    const textureCache = new Map();
    const labelSize = Math.max(0.035, Math.min(0.16, (mode === 'unfolded' && selected ? selected.blank.width : project.front.width) * S * 0.019));
    for (let i = 0; i < pieces.length; i += 1) {
      const piece = pieces[i];
      const group = new THREE.Group(); group.userData.pieceId = piece.id;
      const textureKey = piece.material.finish;
      if (!textureCache.has(textureKey)) textureCache.set(textureKey, makeTexture(textureKey));
      const finish = makeFinish(piece.material, transparent, textureCache.get(textureKey));
      const core = new THREE.MeshStandardMaterial({ color: '#23313b', roughness: 0.85, transparent, opacity: transparent ? 0.32 : 1 });
      const back = new THREE.MeshStandardMaterial({ color: '#a9b5bc', metalness: 0.7, roughness: 0.55, side: THREE.DoubleSide, transparent, opacity: transparent ? 0.28 : 1, depthWrite: !transparent });
      if (mode === 'unfolded') {
        group.position.set(positions[i].x * S, positions[i].y * S, 0);
        addFoldPanels(group, piece, finish, core, back, foldRef.current / 90, state);
        for (const groove of piece.blank.grooves) {
          addLine(group, [[groove.x1 * S, groove.y1 * S, 0.002], [groove.x2 * S, groove.y2 * S, 0.002]], '#dc2626', true);
          if (labels && groove.number) addText(group, `${groove.edge} D${groove.number} · ${groove.angle}°`, [(groove.x1 + groove.x2) / 2 * S, (groove.y1 + groove.y2) / 2 * S, 0.004], labelSize * 0.45, '#991b1b');
        }
        if (piece.material.directional) addGrainDirection(group, piece.blank.width, piece.blank.height, piece.id);
        if (labels) state.pieceLabels.push(addText(group, piece.id, [piece.blank.width * S / 2, piece.blank.height * S / 2, 0.005], labelSize, '#28577b', true, false));
        if (dimensions) {
          const offset = labelSize * 1.1;
          addDimension(group, [0, -offset, 0], [piece.blank.width * S, -offset, 0], fmt(piece.blank.width), labelSize);
          addDimension(group, [-offset, 0, 0], [-offset, piece.blank.height * S, 0], fmt(piece.blank.height), labelSize, 'y');
        }
      } else {
        setSurfaceTransform(group, piece, mode === 'exploded');
        addTray(group, piece, finish, core, back);
        if (piece.material.directional) addGrainDirection(group, piece.width, piece.height, piece.id);
        if (showFixings) addFixings(group, piece, project, mode === 'exploded', (piece.fixing || project.fixing).type === 'screws');
        if (labels && (pieces.length <= 40 || selectedId === piece.id)) state.pieceLabels.push(addText(group, piece.id, [piece.width * S / 2, piece.height * S / 2, 0.006], labelSize, '#28577b', true, false));
      }
      if (selectedId === piece.id) {
        const bounds = new THREE.Box3().setFromObject(group);
        const highlight = new THREE.Box3Helper(bounds, '#1398e5');
        highlight.userData.editorOverlay = true;
        highlight.material.depthTest = false; highlight.material.transparent = true; highlight.material.opacity = 0.9; highlight.renderOrder = 10;
        annotations.add(highlight);
      }
      model.add(group);
    }
    if ((showStructure || mode === 'exploded') && mode !== 'unfolded') addStructure(model, result.structure?.segments || [], result.surfaces || []);
    state.bounds.setFromObject(model);
    if (mode !== 'unfolded' && dimensions && !project.technicalDrawing) {
      const width = project.front.width * S; const height = project.front.height * S;
      const gap = labelSize * 1.65; const z = mode === 'exploded' ? 0.245 : 0.025;
      addDimension(annotations, [0, -gap, z], [width, -gap, z], fmt(project.front.width), labelSize);
      addDimension(annotations, [-gap, 0, z], [-gap, height, z], fmt(project.front.height), labelSize, 'y');
    }
    const modelSize = state.bounds.getSize(new THREE.Vector3());
    const center = state.bounds.getCenter(new THREE.Vector3());
    const span = Math.max(modelSize.x, modelSize.y, modelSize.z, 1);
    if (mode !== 'unfolded' && !presentation) {
      const floorY = state.bounds.min.y - Math.max(0.08, span * 0.055);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(span * 6, span * 6), new THREE.ShadowMaterial({ color: '#627890', opacity: 0.15 }));
      ground.rotation.x = -Math.PI / 2; ground.position.set(center.x, floorY, center.z); ground.receiveShadow = true; surroundings.add(ground);
      const grid = new THREE.GridHelper(Math.ceil(span * 2), Math.max(8, Math.min(60, Math.ceil(span * 4))), '#ccd7e1', '#dfe6ed');
      grid.position.set(center.x, floorY - 0.001, center.z); grid.material.transparent = true; grid.material.opacity = 0.45; surroundings.add(grid);
    }
    const shadowSpan = span * 1.2;
    state.sun.position.copy(center).add(new THREE.Vector3(span * 0.2, span * 1.2, span * 0.8)); state.sun.target.position.copy(center);
    Object.assign(state.sun.shadow.camera, { left: -shadowSpan, right: shadowSpan, top: shadowSpan, bottom: -shadowSpan, near: 0.01, far: span * 6 });
    state.sun.shadow.camera.updateProjectionMatrix();
    // Selection/material changes keep the user's camera position.
    const framingKey = boundsFrameKey(mode, selectedId, state.bounds.min.toArray(), state.bounds.max.toArray(), pieces.length);
    if (state.framingKey !== framingKey) { state.framingKey = framingKey; state.fit(mode === 'unfolded' ? 'front' : viewRef.current); }
    let cancelled = false;
    state.refreshBackground = null;
    state.backgroundTexture?.dispose(); state.backgroundTexture = null;
    state.scene.background = new THREE.Color('#eff3f7');
    if (presentation) {
      const visual = visualOf(project), settings = visual.scene;
      state.ambient.intensity = settings.ambient; state.sun.intensity = settings.sun; state.renderer.toneMappingExposure = settings.exposure;
      const azimuth = settings.azimuth * Math.PI / 180, elevation = settings.elevation * Math.PI / 180;
      state.sun.position.copy(center).add(new THREE.Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation)).multiplyScalar(span * 2));
      state.camera.fov = settings.fov; state.camera.updateProjectionMatrix();
      renderPieceArtwork(project, pieces).then(({ canvases, images }) => {
        if (cancelled || state.stopped) return;
        if (settings.camera && state.savedCameraStamp !== JSON.stringify(settings.camera)) {
        state.camera.position.fromArray(settings.camera.position); state.controls.target.fromArray(settings.camera.target);
        state.controls.update(); state.savedCameraStamp = JSON.stringify(settings.camera);
      }
        if (!hideArtwork) for (const piece of pieces) {
          const canvas = canvases.get(piece.id), group = model.children.find(child => child.userData.pieceId === piece.id);
          if (!canvas || !group) continue;
          const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
          const material = new THREE.MeshStandardMaterial({ map: texture, transparent: true, alphaTest: 0.002, roughness: 0.6, metalness: 0.02, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
          const geometry = new THREE.PlaneGeometry(piece.width * S, piece.height * S);
          const artwork = new THREE.Mesh(geometry, material); artwork.position.set(piece.width * S / 2, piece.height * S / 2, 0.0002); artwork.userData.pieceId = piece.id; artwork.userData.layoutArtwork = true;
          group.add(artwork);
        }
        state.refreshBackground = () => {
          const background = visual.background;
          state.backgroundTexture?.dispose(); state.backgroundTexture = null;
          if (background.mode === 'transparent') state.scene.background = null;
          else if (background.mode === 'photo') {
            const size = state.renderer.getSize(new THREE.Vector2());
            const canvas = renderPhotoBackground(background, images.get(background.assetId), size.x, size.y);
            const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
            state.backgroundTexture = texture; state.scene.background = texture;
          } else state.scene.background = new THREE.Color(background.mode === 'color' ? background.color : '#eff3f7');
        };
        state.refreshBackground(); state.layoutPending = false; state.render();
      }).catch(error => { if (!cancelled) { state.layoutPending = false; state.layoutError = error.message; setAnnounce(error.message); } });
    } else state.layoutPending = false;
    state.render();
    return () => { cancelled = true; };
  }, [ready, result, project, selectedId, mode, showStructure, showFixings, transparent, dimensions, labels, presentation, hideArtwork]);

  useEffect(() => {
    if (!ready || failed || !onCameraAPI) return undefined;
    const state = sceneRef.current;
    onCameraAPI({
      getCamera: () => ({ position: state.camera.position.toArray(), target: state.controls.target.toArray(), fov: state.camera.fov }),
      frame: viewName => state.fit(viewName),
      setCamera: value => { state.camera.position.fromArray(value.position); state.controls.target.fromArray(value.target); state.camera.fov = value.fov; state.camera.updateProjectionMatrix(); state.controls.update(); state.render(); },
    });
    return () => onCameraAPI(null);
  }, [ready, failed, onCameraAPI]);

  useEffect(() => { if (ready) sceneRef.current?.fit(mode === 'unfolded' && view === 'iso' ? 'front' : view); }, [view, ready, mode]);
  useEffect(() => {
    const state = sceneRef.current;
    if (!state) return;
    for (const { flap, piece, panel } of state.foldPivots || []) applyFoldTransform(flap, piece, panel, fold / 90);
    state.render();
  }, [fold]);
  useEffect(() => { setFold(0); setPlaying(false); }, [selectedId, mode]);
  useEffect(() => {
    if (!playing || mode !== 'unfolded') return undefined;
    let frame; let start = null;
    const animate = time => {
      if (start === null) start = time;
      const value = Math.min(90, (time - start) / 1800 * 90);
      setFold(value);
      if (value < 90) frame = requestAnimationFrame(animate); else setPlaying(false);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [playing, mode]);

  const keyboard = event => {
    if (['INPUT', 'BUTTON', 'SELECT'].includes(event.target.tagName)) return;
    const state = sceneRef.current;
    if (!state) return;
    if (event.key.toLowerCase() === 'f') { event.preventDefault(); state.fit(view, true); }
    if (['+', '='].includes(event.key)) { event.preventDefault(); state.zoom(0.8); }
    if (event.key === '-') { event.preventDefault(); state.zoom(1.25); }
    if (event.key === '1') state.fit('front');
    if (event.key === '3') state.fit('iso');
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const delta = state.camera.position.clone().sub(state.controls.target);
      const spherical = new THREE.Spherical().setFromVector3(delta);
      if (event.key === 'ArrowLeft') spherical.theta -= 0.12;
      if (event.key === 'ArrowRight') spherical.theta += 0.12;
      if (event.key === 'ArrowUp') spherical.phi -= 0.12;
      if (event.key === 'ArrowDown') spherical.phi += 0.12;
      spherical.makeSafe(); state.camera.position.copy(state.controls.target).add(new THREE.Vector3().setFromSpherical(spherical)); state.controls.update(); state.render();
    }
  };
  const selection = result.pieces?.find(piece => piece.id === selectedId);
  return <div className={`acmv${immersive ? ' acmv-immersive' : ''}`} tabIndex={0} onKeyDown={keyboard} aria-label="Editor visual da fachada. Teclas: setas giram, mais e menos aproximam, F enquadra, 1 frontal, 3 isométrica.">
    <div ref={hostRef} className={`acmv-canvas${failed ? ' acmv-canvas-hidden' : ''}`} />
    {!failed && !ready && <div className="acmv-loading"><span />Preparando a visualização…</div>}
    {failed && <SceneFallback {...{ result, selectedId, onSelect, mode, project }} />}
    {!result.valid && <div className="acmv-empty">Revise as medidas indicadas para visualizar a fachada.</div>}
    <div className="acmv-title"><span className="acmv-dot" />{mode === 'unfolded' ? 'Desenvolvimento da peça' : mode === 'exploded' ? 'Conjunto explodido' : 'Estudo da fachada'}<small>{mode === 'unfolded' ? 'Acabamento aberto · canais em azul · mm' : 'Simulação visual · mm'}</small></div>
    {!failed && <div className="acmv-tools" role="group" aria-label="Controles da visualização">
      <button type="button" onClick={() => sceneRef.current?.fit(mode === 'unfolded' ? 'front' : view, true)} title="Enquadrar (F)" aria-label="Enquadrar desenho">⛶</button>
      <button type="button" onClick={() => sceneRef.current?.zoom(0.8)} title="Aproximar (+)" aria-label="Aproximar desenho">＋</button>
      <button type="button" onClick={() => sceneRef.current?.zoom(1.25)} title="Afastar (-)" aria-label="Afastar desenho">−</button>
      {immersive && <button type="button" className="acmv-options-toggle" aria-expanded={optionsOpen} onClick={() => setOptionsOpen(open => !open)}>Opções</button>}
      <div className="acmv-display-options" hidden={immersive && !optionsOpen}>
      <button type="button" aria-pressed={dimensions} onClick={() => setDimensions(value => !value)} title="Mostrar cotas">Cotas</button>
      <button type="button" aria-pressed={labels} onClick={() => setLabels(value => !value)} title="Identificar peças">IDs</button>
      </div>
    </div>}
    {mode === 'unfolded' && !failed && <div className="acmv-fold">
      <div><strong>Sequência de dobras</strong><span>{Math.round(fold / 90 * 100)}%</span><button type="button" onClick={() => { setFold(0); setPlaying(value => !value); }}>{playing ? 'Pausar' : '▶ Animar'}</button></div>
      <input aria-label="Ângulo da simulação de dobra" type="range" min="0" max="90" step="1" value={fold} onChange={event => { setPlaying(false); setFold(Number(event.target.value)); }} />
      <small>Movimento idealizado nos canais. Raio e retorno dependem da calibração.</small>
    </div>}
    <div className="acmv-bottom">
      <div className="acmv-axis" aria-hidden="true"><span>X</span><span>Y</span><span>Z</span></div>
      <div className="acmv-hint">{failed ? 'Toque em uma peça para selecionar' : 'Arraste para orbitar · role para aproximar · F enquadra'}</div>
      <span className="acmv-finish">{finishLabel[project.material.finish] || project.material.finish}</span>
    </div>
    {selection && <div className="acmv-selected"><span />{selection.id}<small>{fmt(selection.width)} × {fmt(selection.height)} mm</small></div>}
    {showFixings && mode !== 'unfolded' && <div className="acmv-fixing-key"><i />{project.fixing.type === 'tape' ? 'Fita no verso · use vista traseira ou transparência' : 'Pontos de parafuso'}<small>Distribuição preliminar</small></div>}
    <span className="acmv-sr" role="status" aria-live="polite">{announce}</span>
  </div>;
}
