import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { cameraFrame, disposeSceneGroup } from '../../lib/fabrication/scene-geometry.mjs';
import { inspectPreviewParts, previewOffset, visiblePreviewBounds } from './viewport-geometry.mjs';
import './print-viewport.css';

const EMPTY_PARTS = [];
const ROLE_LABELS = { body: 'Corpo', front: 'Frente nominal', back: 'Fundo' };
const ROLE_COLORS = { body: '#315c74', front: '#56bcc8', back: '#879ba9' };
const VIEWS = { perspective: [0.55, -0.5, 1.5], front: [0, 0, 1] };
const fmt = value => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value);

export default function PrintViewport({ result, printer }) {
  const host = useRef(null);
  const api = useRef(null);
  const [view, setView] = useState('perspective');
  const [exploded, setExploded] = useState(false);
  const [hidden, setHidden] = useState({});
  const [rendererError, setRendererError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const parts = result?.parts || EMPTY_PARTS;
  const inspection = useMemo(() => {
    try { return { bounds: inspectPreviewParts(parts), error: '' }; }
    catch (error) { return { bounds: null, error: error.message }; }
  }, [parts]);
  const roles = useMemo(() => [...new Set(parts.map(part => part.role))], [parts]);
  const settings = useRef({ parts, view, exploded, hidden, bounds: inspection.bounds });
  settings.current = { parts, view, exploded, hidden, bounds: inspection.bounds };
  const error = inspection.error || rendererError;
  const hasModel = Boolean(inspection.bounds);
  const noneVisible = hasModel && roles.every(role => hidden[role]);

  useEffect(() => {
    const container = host.current;
    let renderer;
    let frame = 0;
    let disposed = false;
    let contextLost = false;
    setRendererError('');
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setRendererError('O navegador não conseguiu iniciar a prévia 3D (WebGL). Os arquivos podem ser baixados pelos controles da página.');
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', 'Geometria das peças em milímetros. Arraste para girar; use os controles para mudar a vista e o zoom.');
    renderer.domElement.dataset.testid = 'print-model-canvas';
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#eef4f7');
    scene.add(new THREE.HemisphereLight(0xffffff, 0x6d8594, 2.5));
    const key = new THREE.DirectionalLight(0xffffff, 3.2);
    key.position.set(-150, 220, 400);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xc4efff, 1.2);
    fill.position.set(250, -80, 180);
    scene.add(fill);
    const assembly = new THREE.Group();
    scene.add(assembly);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 10000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    const requestRender = () => {
      if (disposed || contextLost || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (disposed || contextLost) return;
        controls.update();
        renderer.render(scene, camera);
      });
    };
    const fit = () => {
      const current = settings.current;
      if (!current.bounds) return;
      const bounds = visiblePreviewBounds(current.parts, current.hidden, current.exploded, current.bounds.dimensions[2]) || current.bounds;
      const next = cameraFrame(bounds.min, bounds.max, VIEWS[current.view], camera.aspect, camera.fov, 1.2);
      const extent = Math.max(...bounds.max.map((value, axis) => value - bounds.min[axis]), 1);
      controls.target.fromArray(next.center);
      camera.position.fromArray(next.center).addScaledVector(new THREE.Vector3(...next.forward), next.distance);
      controls.minDistance = Math.max(extent * 0.04, 0.5);
      controls.maxDistance = Math.max(next.distance * 12, 1000);
      camera.near = Math.max(extent / 10000, 0.01);
      camera.far = Math.max(next.distance * 50, 10000);
      camera.updateProjectionMatrix();
      camera.lookAt(controls.target);
      controls.update();
      requestRender();
    };
    const updatePresentation = () => {
      const current = settings.current;
      for (const mesh of assembly.children) {
        mesh.visible = !current.hidden[mesh.userData.role];
        mesh.position.z = previewOffset(mesh.userData.role, current.exploded, current.bounds?.dimensions[2]);
      }
      fit();
      requestRender();
    };
    const load = () => {
      disposeSceneGroup(assembly);
      const current = settings.current;
      if (current.bounds) {
        for (const part of current.parts) {
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.Float32BufferAttribute(part.mesh.positions, 3));
          geometry.setIndex(Array.from(part.mesh.indices));
          geometry.computeVertexNormals();
          const material = new THREE.MeshStandardMaterial({ color: ROLE_COLORS[part.role] || '#879ba9', metalness: 0.1, roughness: part.role === 'front' ? 0.4 : 0.66, flatShading: true });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.userData = { id: part.id, role: part.role };
          assembly.add(mesh);
        }
      }
      updatePresentation();
    };
    const zoom = factor => {
      const offset = camera.position.clone().sub(controls.target);
      const distance = THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance);
      if (!offset.length()) return;
      camera.position.copy(controls.target).add(offset.normalize().multiplyScalar(distance));
      controls.update();
      requestRender();
    };
    const resize = () => {
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      fit();
      requestRender();
    };
    const onContextLost = event => {
      event.preventDefault();
      contextLost = true;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      setRendererError('A prévia 3D perdeu a conexão com a placa gráfica. Tente abrir a prévia novamente. Os arquivos permanecem disponíveis na página.');
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    controls.addEventListener('change', requestRender);
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    api.current = { load, updatePresentation, fit, zoom };
    resize();
    return () => {
      disposed = true;
      api.current = null;
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      controls.removeEventListener('change', requestRender);
      controls.dispose();
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      disposeSceneGroup(assembly);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [attempt]);

  useEffect(() => { api.current?.load(); }, [parts, inspection, attempt]);
  useEffect(() => { api.current?.updatePresentation(); }, [view, exploded, hidden, attempt]);
  const selectView = next => {
    if (view === next) api.current?.fit();
    else setView(next);
  };

  return <section className="print-viewport" aria-label="Prévia da impressão 3D" data-testid="print-viewport">
    <div className="print-viewport-toolbar">
      <div className="print-viewport-button-group" role="group" aria-label="Montagem das peças">
        <button type="button" aria-pressed={!exploded} onClick={() => setExploded(false)} disabled={!hasModel || Boolean(error)}>Montada</button>
        <button type="button" aria-pressed={exploded} onClick={() => setExploded(true)} disabled={!hasModel || Boolean(error)}>Separada</button>
      </div>
      <div className="print-viewport-button-group" role="group" aria-label="Vista do modelo">
        <button type="button" aria-pressed={view === 'perspective'} onClick={() => selectView('perspective')} disabled={!hasModel || Boolean(error)}>Perspectiva</button>
        <button type="button" aria-pressed={view === 'front'} onClick={() => selectView('front')} disabled={!hasModel || Boolean(error)}>Frente</button>
      </div>
      <button type="button" onClick={() => api.current?.fit()} disabled={!hasModel || Boolean(error)}>Enquadrar</button>
      <div className="print-viewport-button-group" role="group" aria-label="Zoom">
        <button type="button" aria-label="Afastar modelo" onClick={() => api.current?.zoom(1.25)} disabled={!hasModel || Boolean(error)}>−</button>
        <button type="button" aria-label="Aproximar modelo" onClick={() => api.current?.zoom(0.8)} disabled={!hasModel || Boolean(error)}>+</button>
      </div>
    </div>
    <div className="print-viewport-parts" aria-label="Peças visíveis">
      {roles.map(role => <label key={role}><input type="checkbox" checked={!hidden[role]} onChange={event => setHidden(current => ({ ...current, [role]: !event.target.checked }))} /><span className="print-viewport-swatch" style={{ backgroundColor: ROLE_COLORS[role] || '#879ba9' }} aria-hidden="true" />{ROLE_LABELS[role] || role}</label>)}
      {hasModel && <span className="print-viewport-dimensions" data-testid="print-assembly-dimensions">{inspection.bounds.dimensions.map(fmt).join(' × ')} mm · conjunto</span>}
    </div>
    <div className="print-viewport-stage">
      <div ref={host} className="print-viewport-canvas" aria-hidden={Boolean(error) || !hasModel} />
      {(error || !hasModel || noneVisible) && <div className="print-viewport-message" role={error ? 'alert' : 'status'}>
        <strong>{error ? 'Prévia indisponível' : noneVisible ? 'Todas as peças estão ocultas' : 'Gere um modelo para ver as peças'}</strong>
        <span>{error || (noneVisible ? 'Marque Corpo ou Frente nominal acima para voltar a visualizar.' : 'O corpo e a frente aparecerão nas dimensões calculadas.')}</span>
        {rendererError && !inspection.error && <button type="button" onClick={() => setAttempt(value => value + 1)}>Tentar prévia novamente</button>}
      </div>}
    </div>
    <div className="print-viewport-caption">
      <p>Arraste para girar · botão direito para deslocar · roda ou botões para zoom. A vista separada afasta a frente apenas na tela.</p>
      {printer && <p><strong>{printer.name || 'Perfil de impressão'}</strong>{[printer.x, printer.y, printer.z].every(Number.isFinite) ? ` · volume nominal ${[printer.x, printer.y, printer.z].map(fmt).join(' × ')} mm` : ''}. A orientação e o encaixe precisam de conferência no fatiador e na impressora.</p>}
    </div>
  </section>;
}
