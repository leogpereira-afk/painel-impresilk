import { useCallback, useEffect, useRef, useState } from 'react';
import ACMViewport from './ACMViewport';
import { visualOf, faceBounds, faceNames, alignLayer, resizedLayer, availableAssetBytes, validateVisual, VISUAL_LIMITS, presentationHTML } from '../../lib/acm/visual.mjs';
import { importVisualAsset } from '../../lib/acm/visual-browser.mjs';
import './layout3d.css';

const uid = prefix => `${prefix}-${globalThis.crypto.randomUUID()}`;
const round = value => Math.round(value * 1000) / 1000;
function NumberControl({ label, value, change, min, max, step = 1, disabled = false }) {
  return <label><span>{label}</span><input type="number" value={round(value)} min={min} max={max} step={step} disabled={disabled} onChange={event => { if (event.target.value !== '') { const number = Number(event.target.value); if (Number.isFinite(number) && number >= min && number <= max) change(number); } }} /></label>;
}

export default function Layout3D({ project, result, update, onSelect, selectedId, onExport, immersive = false, onToggleImmersive }) {
  const visual = visualOf(project), pieces = result.pieces || [];
  const [activeId, setActiveId] = useState(null), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [compare, setCompare] = useState(false), [full, setFull] = useState(false), [editorOpen, setEditorOpen] = useState(false), [exportOpen, setExportOpen] = useState(false), [viewName, setViewName] = useState('Vista de apresentação');
  const upload = useRef(null), uploadPurpose = useRef('layer'), capture = useRef(null), camera = useRef(null), beforeCamera = useRef(null), latest = useRef(project);
  latest.current = project;
  const isImmersive = immersive || full;
  const toggleImmersive = () => onToggleImmersive ? onToggleImmersive() : setFull(value => !value);
  useEffect(() => {
    if (!full || onToggleImmersive) return undefined;
    const escape = event => { if (event.key === 'Escape') setFull(false); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [full, onToggleImmersive]);
  const registerCapture = useCallback(fn => { capture.current = fn; }, []);
  const registerCamera = useCallback(api => { camera.current = api; }, []);
  const registerBeforeCamera = useCallback(api => { beforeCamera.current = api; if (api && camera.current) api.setCamera(camera.current.getCamera()); }, []);
  const syncComparison = useCallback(value => { beforeCamera.current?.setCamera(value); }, []);
  const layer = visual.layers.find(item => item.id === activeId) || null;
  const selected = pieces.find(piece => piece.id === selectedId) || pieces[0];
  const targets = [...new Set(pieces.map(piece => piece.surface))];
  const targetBounds = target => target.type === 'piece' ? pieces.find(piece => piece.id === target.id) || { width: 1000, height: 1000 } : faceBounds(pieces, target.id);
  const apply = next => {
    const errors = validateVisual(next);
    if (errors.length) { setMessage(errors[0].message); return false; }
    update('visual', next); setMessage(''); return true;
  };
  const change = (key, value) => apply({ ...visual, [key]: value });
  const patchLayer = patch => { if (!layer || layer.locked) return; change('layers', visual.layers.map(item => item.id === layer.id ? { ...item, ...patch } : item)); };
  const addLayer = (type, asset, baseVisual = visual) => {
    if (baseVisual.layers.length >= VISUAL_LIMITS.layers) throw new Error('Limite de 80 camadas atingido.');
    const target = { type: 'surface', id: selected?.surface || 'front' }, bounds = targetBounds(target);
    const width = Math.min(bounds.width * 0.7, asset ? bounds.height * 0.7 * asset.width / asset.height : bounds.width * 0.7);
    const height = asset ? width * asset.height / asset.width : Math.min(bounds.height * 0.35, 300);
    const next = { id: uid('layer'), name: asset?.name || 'Texto', type, target, x: (bounds.width - width) / 2, y: (bounds.height - height) / 2, width, height, rotation: 0, opacity: 1, hidden: false, locked: false, keepAspect: true,
      ...(type === 'image' ? { assetId: asset.id, crop: { x: 0, y: 0, width: 1, height: 1 } } : { text: 'SUA MARCA', fontFamily: 'sans-serif', fontWeight: 700, color: '#ffffff', align: 'center' }) };
    if (apply({ ...baseVisual, layers: [...baseVisual.layers, next] })) setActiveId(next.id);
  };
  const importImage = async event => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    setBusy(true); setMessage('Preparando imagem local…');
    try {
      const initial = latest.current, snapshot = visualOf(initial);
      if (snapshot.assets.length >= VISUAL_LIMITS.assets) throw new Error('Limite de 12 imagens atingido. Remova uma imagem sem uso.');
      const asset = await importVisualAsset(file, uid('asset'));
      if (latest.current !== initial) throw new Error('O projeto mudou durante a leitura. Importe novamente para preservar suas alterações.');
      if (asset.dataUrl.length > availableAssetBytes(snapshot)) throw new Error('Limite de 2 MiB em imagens atingido. Remova uma imagem sem uso.');
      const next = { ...snapshot, assets: [...snapshot.assets, asset] };
      if (uploadPurpose.current === 'background') apply({ ...next, background: { ...next.background, mode: 'photo', assetId: asset.id } });
      else addLayer('image', asset, next);
      setMessage(`${file.name}: incorporada ao projeto (${Math.ceil(asset.dataUrl.length / 1024)} KiB). SVG, quando usado, é convertido em PNG.`);
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  };
  const chooseImage = purpose => { uploadPurpose.current = purpose; upload.current?.click(); };
  const reorder = direction => {
    const index = visual.layers.findIndex(item => item.id === layer.id), destination = index + direction;
    if (destination < 0 || destination >= visual.layers.length || layer.locked) return;
    const layers = [...visual.layers]; [layers[index], layers[destination]] = [layers[destination], layers[index]]; change('layers', layers);
  };
  const saveCamera = asView => {
    const current = camera.current?.getCamera();
    if (!current) { setMessage('Aguarde a cena 3D ficar disponível.'); return; }
    const scene = { ...visual.scene, camera: current, fov: current.fov };
    const next = { ...visual, scene };
    if (asView) {
      if (visual.savedViews.length >= VISUAL_LIMITS.views) { setMessage('Limite de 12 vistas atingido.'); return; }
      next.savedViews = [...visual.savedViews, { id: uid('view'), name: viewName.trim() || 'Vista', camera: current, lighting: Object.fromEntries(Object.entries(scene).filter(([key]) => key !== 'camera')) }];
    }
    if (apply(next)) setMessage(asView ? 'Vista e iluminação guardadas nesta revisão.' : 'Posição atual da câmera guardada no projeto.');
  };
  const exportLayout = async kind => {
    setBusy(true);
    try {
      if (!onExport) throw new Error('Arquivo local indisponível. Reabra esta etapa.');
      if (!result.valid || !capture.current) throw new Error('Aguarde uma cena válida antes de exportar.');
      const snapshot = structuredClone(project), prefix = `${project.name.replace(/[^\p{L}\p{N}._-]/gu, '-').slice(0, 70)}-r${project.revision}-layout-${kind}-${Date.now()}`;
      const image = capture.current(project, { view: kind === 'front' ? 'front' : undefined, transparent: kind === 'transparent', watermark: kind !== 'transparent' });
      const document = kind === 'presentation' ? { name: `${prefix}.html`, mime: 'text/html;charset=utf-8', content: presentationHTML(snapshot, image) } : { name: `${prefix}.png`, mime: 'image/png', content: image };
      await onExport(document, snapshot);
      setExportOpen(false);
      setMessage(`Layout R${snapshot.revision} arquivado localmente. ${kind === 'presentation' ? 'Abra a apresentação e use Imprimir → Salvar como PDF.' : 'PNG pronto para baixar.'}`);
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  };
  const background = visual.background, scene = visual.scene;
  const setBackground = patch => change('background', { ...background, ...patch });
  const setScene = patch => change('scene', { ...scene, ...patch });
  const activeAsset = visual.assets.find(asset => asset.id === layer?.assetId);
  const crop = (key, value) => {
    const next = { ...layer.crop, [key]: value / 100 };
    if (next.x + next.width > 1) next.width = 1 - next.x;
    if (next.y + next.height > 1) next.height = 1 - next.y;
    patchLayer({ crop: next, ...(layer.keepAspect && activeAsset ? { height: layer.width * activeAsset.height * next.height / (activeAsset.width * next.width) } : {}) });
  };
  return <section className={`acml${full ? ' acml-fullscreen' : ''}${isImmersive ? ' acml-immersive' : ''}${editorOpen ? ' acml-editor-open' : ''}`} aria-label="Layout 3D e apresentação">
    <header className="acml-header"><div className="acml-heading"><h2>Layout 3D</h2><p>Arte e apresentação · R{project.revision}</p></div><div className="acml-actions"><button type="button" aria-pressed={compare} onClick={() => setCompare(!compare)}>Antes / depois</button>{isImmersive && <button type="button" className="acml-editor-toggle" aria-expanded={editorOpen} onClick={() => setEditorOpen(open => !open)}>{editorOpen ? 'Ocultar controles' : 'Arte e ambiente'}</button>}<div className="acml-export-menu"><button type="button" aria-expanded={exportOpen} onClick={() => setExportOpen(open => !open)}>Exportar</button><div className="acml-export" hidden={!exportOpen}><strong>Exportar esta revisão</strong><button disabled={busy || !result.valid} onClick={() => exportLayout('front')}>PNG frontal</button><button disabled={busy || !result.valid} onClick={() => exportLayout('transparent')}>PNG transparente</button><button disabled={busy || !result.valid} onClick={() => exportLayout('scene')}>Cena atual PNG</button><button disabled={busy || !result.valid} onClick={() => exportLayout('presentation')}>Apresentação / PDF</button></div></div><button type="button" className="acml-size-toggle" onClick={toggleImmersive}>{isImmersive ? 'Reduzir' : 'Ocupar tela'}</button></div></header>
    <div className="acml-body"><div className="acml-stage">
      <div className={`acml-scenes${compare ? ' acml-compare' : ''}`}>
        {compare && <div className="acml-scene"><span className="acml-badge">Antes · sem arte</span><ACMViewport project={project} result={result} view="front" immersive={isImmersive} presentation hideArtwork onCameraAPI={registerBeforeCamera} /></div>}
        <div className="acml-scene"><span className="acml-badge">{compare ? 'Depois · ' : ''}Simulação visual</span><ACMViewport {...{ project, result, selectedId, onSelect }} view="front" immersive={isImmersive} presentation onCapture={registerCapture} onCameraAPI={registerCamera} onCameraChange={syncComparison} />
          {visual.guides && <div className="acml-guides" aria-hidden="true"><i /><i /><i /><i /><span>Guias de composição · não calibram medidas</span></div>}
        </div>
      </div>
      <div className="acml-camera-presets" aria-label="Vistas de apresentação">{[['front', 'Frente'], ['iso', 'Perspectiva'], ['left', 'Esquerda'], ['right', 'Direita'], ['bottom', 'Forro']].map(([value, name]) => <button type="button" key={value} onClick={() => camera.current?.frame(value)}>{name}</button>)}<button type="button" onClick={() => saveCamera(false)}>Guardar câmera atual</button></div>
      <p className="acml-note acml-simulation-note">Simulação de aparência. A foto e os ajustes de perspectiva não medem a obra. As artes não alteram dimensões, cortes ou calibração.</p>
      <div className="acml-feedback">
        {visual.layers.some(item => !pieces.some(piece => item.target.type === 'piece' ? piece.id === item.target.id : piece.surface === item.target.id)) && <p className="acml-status">Há camadas cujo destino foi removido da geometria. Selecione a camada e escolha outra face ou peça.</p>}
        {message && <p className="acml-status" role="status">{message}</p>}
      </div>
    </div><aside className="acml-editor" hidden={isImmersive && !editorOpen} aria-label="Controles de arte e ambiente">
      {isImmersive && <div className="acml-drawer-heading"><div><strong>Arte e ambiente</strong><span>Controles do layout</span></div><button type="button" aria-label="Fechar controles de arte e ambiente" onClick={() => setEditorOpen(false)}>Fechar ×</button></div>}
      <details open><summary>Camadas de arte <span>{visual.layers.length}/80</span></summary>
        <div className="acml-actions"><button disabled={busy || !pieces.length} onClick={() => chooseImage('layer')}>+ Imagem / logo</button><button disabled={!pieces.length} onClick={() => { try { addLayer('text'); } catch (error) { setMessage(error.message); } }}>+ Texto</button></div>
        <input ref={upload} type="file" hidden accept="image/png,image/jpeg,image/svg+xml,.svg" onChange={importImage} />
        {!visual.layers.length && <p className="acml-empty">Adicione texto ou PNG/JPG/SVG. A aplicação contínua atravessa as juntas da face sem reiniciar a imagem.</p>}
        <div className="acml-layer-list">{[...visual.layers].reverse().map(item => <div key={item.id} className={activeId === item.id ? 'active' : ''}>
          <button className="acml-layer-name" aria-pressed={activeId === item.id} onClick={() => { setActiveId(item.id); if (item.target.type === 'piece') onSelect?.(item.target.id); }}><span>{item.type === 'text' ? 'T' : '▧'}</span>{item.name}<small>{item.target.type === 'piece' ? item.target.id : faceNames[item.target.id]}</small></button>
          <button title={item.hidden ? 'Mostrar camada' : 'Ocultar camada'} aria-label={`${item.hidden ? 'Mostrar' : 'Ocultar'} ${item.name}`} aria-pressed={!item.hidden} disabled={item.locked} onClick={() => change('layers', visual.layers.map(current => current.id === item.id ? { ...current, hidden: !item.hidden } : current))}>{item.hidden ? '○' : '●'}</button>
          <button title={item.locked ? 'Desbloquear camada' : 'Bloquear camada'} aria-label={`${item.locked ? 'Desbloquear' : 'Bloquear'} ${item.name}`} aria-pressed={item.locked} onClick={() => change('layers', visual.layers.map(current => current.id === item.id ? { ...current, locked: !item.locked } : current))}>{item.locked ? '🔒' : '◇'}</button>
        </div>)}</div>
        {layer && <div className="acml-layer-editor"><label>Nome da camada<input maxLength={180} value={layer.name} disabled={layer.locked} onChange={event => patchLayer({ name: event.target.value })} /></label>
          <div className="acml-actions"><button disabled={layer.locked || visual.layers.at(-1)?.id === layer.id} onClick={() => reorder(1)}>Subir</button><button disabled={layer.locked || visual.layers[0]?.id === layer.id} onClick={() => reorder(-1)}>Descer</button><button disabled={layer.locked || visual.layers.length >= 80} onClick={() => { const duplicate = { ...structuredClone(layer), id: uid('layer'), name: `${layer.name.slice(0, 170)} cópia`, x: layer.x + 20, y: layer.y + 20 }; if (change('layers', [...visual.layers, duplicate])) setActiveId(duplicate.id); }}>Duplicar</button><button disabled={layer.locked} onClick={() => { change('layers', visual.layers.filter(item => item.id !== layer.id)); setActiveId(null); }}>Remover</button></div>
          {layer.locked && <p className="acml-note">Camada bloqueada. Desbloqueie pelo cadeado para editar.</p>}
          <fieldset disabled={layer.locked}><legend>Aplicação da arte</legend><label>Destino<select value={`${layer.target.type}:${layer.target.id}`} onChange={event => { const [type, ...rest] = event.target.value.split(':'); patchLayer({ target: { type, id: rest.join(':') } }); }}><optgroup label="Contínua por face">{targets.map(id => <option key={id} value={`surface:${id}`}>{faceNames[id]} · todas as peças</option>)}</optgroup><optgroup label="Uma peça">{pieces.map(piece => <option key={piece.id} value={`piece:${piece.id}`}>{piece.id}</option>)}</optgroup></select></label>
            {layer.type === 'image' && <label>Imagem<select value={layer.assetId} onChange={event => patchLayer({ assetId: event.target.value })}>{visual.assets.map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>}
            {layer.type === 'text' && <><label>Texto<textarea rows={3} value={layer.text} maxLength={1000} onChange={event => patchLayer({ text: event.target.value })} /></label><div className="acml-fields"><label>Fonte<select value={layer.fontFamily} onChange={event => patchLayer({ fontFamily: event.target.value })}><option value="sans-serif">Sem serifa</option><option value="serif">Serifada</option><option value="monospace">Monoespaçada</option></select></label><label>Peso<select value={layer.fontWeight} onChange={event => patchLayer({ fontWeight: Number(event.target.value) })}><option value={400}>Regular</option><option value={700}>Negrito</option></select></label><label>Cor<input type="color" value={layer.color} onChange={event => patchLayer({ color: event.target.value })} /></label><label>Texto alinhado<select value={layer.align} onChange={event => patchLayer({ align: event.target.value })}><option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option></select></label></div></>}
            <div className="acml-fields"><NumberControl label="X a partir da esquerda (mm)" value={layer.x} min={-100000} max={100000} change={x => patchLayer({ x })} /><NumberControl label="Y a partir do topo (mm)" value={layer.y} min={-100000} max={100000} change={y => patchLayer({ y })} /><NumberControl label="Largura visual (mm)" value={layer.width} min={0.01} max={200000} change={width => patchLayer(resizedLayer(layer, 'width', width))} /><NumberControl label="Altura visual (mm)" value={layer.height} min={0.01} max={200000} change={height => patchLayer(resizedLayer(layer, 'height', height))} /><NumberControl label="Rotação (°)" value={layer.rotation} min={-360} max={360} change={rotation => patchLayer({ rotation })} /><NumberControl label="Opacidade (%)" value={layer.opacity * 100} min={0} max={100} change={opacity => patchLayer({ opacity: opacity / 100 })} /></div>
            <label className="acml-check"><input type="checkbox" checked={layer.keepAspect} onChange={event => patchLayer({ keepAspect: event.target.checked })} />Preservar proporção ao redimensionar</label><div className="acml-actions"><span>Escala</span><button onClick={() => patchLayer({ width: layer.width * 0.9, height: layer.height * 0.9 })}>−10%</button><button onClick={() => patchLayer({ width: layer.width * 1.1, height: layer.height * 1.1 })}>+10%</button></div>
            <div className="acml-align">{[['left', 'Esquerda'], ['center', 'Centro'], ['right', 'Direita'], ['top', 'Topo'], ['middle', 'Meio'], ['bottom', 'Base']].map(([value, name]) => <button key={value} onClick={() => patchLayer(alignLayer(layer, value, targetBounds(layer.target)))}>{name}</button>)}</div>
            {layer.type === 'image' && <details><summary>Recortar imagem (%)</summary><div className="acml-fields"><NumberControl label="Início X" value={layer.crop.x * 100} min={0} max={99.9} step={0.1} change={value => crop('x', value)} /><NumberControl label="Início Y" value={layer.crop.y * 100} min={0} max={99.9} step={0.1} change={value => crop('y', value)} /><NumberControl label="Largura do recorte" value={layer.crop.width * 100} min={0.1} max={100} step={0.1} change={value => crop('width', value)} /><NumberControl label="Altura do recorte" value={layer.crop.height * 100} min={0.1} max={100} step={0.1} change={value => crop('height', value)} /></div><button onClick={() => patchLayer({ crop: { x: 0, y: 0, width: 1, height: 1 } })}>Restaurar imagem inteira</button></details>}
          </fieldset>
        </div>}
      </details>
      <details><summary>Ambiente e foto do local</summary><label>Fundo<select value={background.mode} onChange={event => { if (event.target.value === 'photo' && !background.assetId) chooseImage('background'); else setBackground({ mode: event.target.value }); }}><option value="neutral">Neutro</option><option value="color">Cor sólida</option><option value="transparent">Transparente</option><option value="photo">Foto do local</option></select></label>{background.mode !== 'transparent' && <label>Cor do fundo<input type="color" value={background.color} onChange={event => setBackground({ color: event.target.value })} /></label>}
        <button disabled={busy} onClick={() => chooseImage('background')}>Carregar foto do local</button>
        {background.mode === 'photo' && <><label>Foto incorporada<select value={background.assetId} onChange={event => setBackground({ assetId: event.target.value })}>{visual.assets.map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label><div className="acml-fields"><NumberControl label="Deslocamento X (%)" value={background.x} min={-200} max={200} change={x => setBackground({ x })} /><NumberControl label="Deslocamento Y (%)" value={background.y} min={-200} max={200} change={y => setBackground({ y })} /><NumberControl label="Escala da foto" value={background.scale} min={0.1} max={5} step={0.05} change={scale => setBackground({ scale })} /><NumberControl label="Rotação (°)" value={background.rotation} min={-180} max={180} change={rotation => setBackground({ rotation })} /><NumberControl label="Inclinação X (°)" value={background.skewX} min={-60} max={60} change={skewX => setBackground({ skewX })} /><NumberControl label="Inclinação Y (°)" value={background.skewY} min={-60} max={60} change={skewY => setBackground({ skewY })} /><NumberControl label="Opacidade da foto (%)" value={background.opacity * 100} min={0} max={100} change={opacity => setBackground({ opacity: opacity / 100 })} /></div><p className="acml-note">Use a órbita da câmera e o campo de visão para combinar a perspectiva. Arraste com o botão direito para posicionar o modelo sobre a foto.</p></>}
        <label className="acml-check"><input type="checkbox" checked={visual.guides} onChange={event => change('guides', event.target.checked)} />Mostrar guias de composição</label>
      </details>
      <details><summary>Câmera, iluminação e vistas</summary><div className="acml-fields"><NumberControl label="Campo de visão (°)" value={scene.fov} min={10} max={100} change={fov => setScene({ fov })} /><NumberControl label="Luz ambiente" value={scene.ambient} min={0} max={8} step={0.1} change={ambient => setScene({ ambient })} /><NumberControl label="Luz principal" value={scene.sun} min={0} max={12} step={0.1} change={sun => setScene({ sun })} /><NumberControl label="Exposição" value={scene.exposure} min={0.2} max={3} step={0.1} change={exposure => setScene({ exposure })} /><NumberControl label="Direção da luz (°)" value={scene.azimuth} min={-180} max={180} change={azimuth => setScene({ azimuth })} /><NumberControl label="Altura da luz (°)" value={scene.elevation} min={5} max={85} change={elevation => setScene({ elevation })} /></div>
        <label>Nome da vista<input value={viewName} maxLength={180} onChange={event => setViewName(event.target.value)} /></label><button onClick={() => saveCamera(true)}>Salvar vista e luz atuais</button><div className="acml-saved-views">{visual.savedViews.map(saved => <div key={saved.id}><button onClick={() => { camera.current?.setCamera(saved.camera); change('scene', { ...scene, ...saved.lighting, camera: saved.camera, fov: saved.camera.fov }); }}>{saved.name}</button><button aria-label={`Excluir vista ${saved.name}`} onClick={() => change('savedViews', visual.savedViews.filter(item => item.id !== saved.id))}>×</button></div>)}</div>
      </details>
      <details><summary>Imagens incorporadas <span>{visual.assets.length}/12</span></summary><p className="acml-note">Até 512 KiB por imagem; {Math.round((VISUAL_LIMITS.totalAssetBytes - availableAssetBytes(visual)) / 1024)} / 2048 KiB no projeto. PNG mantém transparência. A cópia JSON inclui todas as imagens.</p><div className="acml-assets">{visual.assets.map(asset => { const used = visual.layers.some(item => item.assetId === asset.id) || (background.mode === 'photo' && background.assetId === asset.id); return <div key={asset.id}><img src={asset.dataUrl} alt="" /><span>{asset.name}<small>{asset.width} × {asset.height} px</small></span><button disabled={used} title={used ? 'Remova o uso nas camadas/fundo primeiro' : 'Remover imagem sem uso'} onClick={() => change('assets', visual.assets.filter(item => item.id !== asset.id))}>Remover</button></div>; })}</div></details>
    </aside></div>
  </section>;
}
