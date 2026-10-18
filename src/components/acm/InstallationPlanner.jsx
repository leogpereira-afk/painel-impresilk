import { useEffect, useMemo, useRef, useState } from 'react';
import { createInstallation, calculateInstallation, confirmInstallationDecision, installationReportHTML } from '../../lib/acm/installation.mjs';
import { MAX_PROJECT_BYTES } from '../../lib/acm/storage.mjs';
import { importVisualAsset } from '../../lib/acm/visual-browser.mjs';
import './installation-planner.css';

const id = prefix => `${prefix}-${crypto.randomUUID()}`;
const format = (value, factor = 1000) => Number.isFinite(value) ? new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(value / factor) : '—';
const number = value => Number.isFinite(value);
const textOf = issue => typeof issue === 'string' ? issue : issue?.message || issue?.reason || issue?.label || '';
const categories = { supports: 'Suportes / estrutura auxiliar', fasteners: 'Parafusos / buchas / ancoragens', tape: 'Fita', adhesive: 'Adesivo / selante', tools: 'Ferramentas', other: 'Outros materiais' };
const equipmentNames = { ladder: 'Escada', scaffold: 'Andaime', platform: 'Plataforma', other: 'Outro equipamento' };
const decisionNames = { position: 'Posição da placa', access: 'Acesso e equipamento', fixing: 'Fixação e preparação' };

function TextInput({ label, value, change, multiline = false, type = 'text', placeholder, maxLength = 1000 }) {
  return <label className="acmi-field"><span>{label}</span>{multiline ? <textarea rows={3} value={value ?? ''} maxLength={maxLength} placeholder={placeholder} onChange={event => change(event.target.value)} /> : <input type={type} value={value ?? ''} maxLength={maxLength} placeholder={placeholder} onChange={event => change(event.target.value)} />}</label>;
}
function Choice({ label, value, change, options }) {
  const effectiveOptions = value && !options.some(([key]) => key === value) ? [[value, value], ...options] : options;
  return <label className="acmi-field"><span>{label}</span><select value={value ?? ''} onChange={event => change(event.target.value)}>{effectiveOptions.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>;
}
function Measure({ label, value, change, factor = 1, unit = '', hint }) {
  const [editing, setEditing] = useState(value == null ? '' : String(Math.round(value / factor * 1000000) / 1000000));
  useEffect(() => { setEditing(value == null ? '' : String(Math.round(value / factor * 1000000) / 1000000)); }, [value, factor]);
  function commit(raw) {
    const normalized = raw.trim().replace(',', '.');
    if (!normalized) { if (value != null) change(null); return; }
    if (/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(normalized) && Number.isFinite(Number(normalized))) {
      const next = Math.round(Number(normalized) * factor * 1000) / 1000;
      if (next !== value) change(next);
    }
  }
  return <label className="acmi-field"><span>{label}{unit && <small>{unit}</small>}</span><input type="text" inputMode="decimal" value={editing} placeholder="Não informado" onChange={event => { const raw = event.target.value; setEditing(raw); if (!/[.,+-]$/.test(raw)) commit(raw); }} onBlur={() => commit(editing)} />{hint && <small>{hint}</small>}</label>;
}

function PositionSketch({ installation, calculation, changePosition }) {
  const svg = useRef(null), drag = useRef(null);
  const [preview, setPreview] = useState(null), [announcement, setAnnouncement] = useState('');
  const g = calculation.geometry || {}, unit = installation.displayUnit || 'm', factor = unit === 'cm' ? 10 : 1000;
  const width = g.spaceWidth ?? installation.space.width, height = g.spaceHeight ?? installation.space.height;
  const validSpace = number(width) && number(height) && width > 0 && height > 0;
  const plateWidth = g.width ?? installation.plate.width, plateHeight = g.height ?? installation.plate.height;
  const positionMode = installation.position.mode;
  useEffect(() => {
    setAnnouncement(number(g.left) && number(g.bottomGround) ? `Posição ${positionMode === 'centered' ? 'centralizada' : 'manual'}: esquerda ${format(g.left, factor)} ${unit}, base ao chão ${format(g.bottomGround, factor)} ${unit}.` : 'Posição aguardando medidas e referência do chão.');
  }, [positionMode, g.left, g.bottomGround, unit, factor]);
  const visiblePlate = validSpace && [plateWidth, plateHeight, g.left, g.bottomGround, g.baseGround].every(number) && plateWidth > 0 && plateHeight > 0;
  const left = preview?.left ?? g.left, bottom = preview?.bottomGround ?? g.bottomGround;
  const span = Math.max(width || 1, height || 1), pad = span * 0.16, font = span / 42;
  const plateTop = height - ((bottom ?? 0) - (g.baseGround ?? 0)) - (plateHeight ?? 0);
  const canMove = visiblePlate && plateWidth <= width && plateHeight <= height;
  const point = event => {
    const matrix = svg.current?.getScreenCTM(); if (!matrix) return null;
    const local = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: local.x, y: local.y };
  };
  const clamp = (x, y) => ({ left: Math.round(Math.max(0, Math.min(width - plateWidth, x))), bottomGround: Math.round(Math.max(g.baseGround, Math.min(g.baseGround + height - plateHeight, y))) });
  function start(event) {
    if (!canMove || event.button !== 0) return;
    const at = point(event); if (!at) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, start: at, left: g.left, bottomGround: g.bottomGround };
  }
  function move(event) {
    const current = drag.current; if (!current || current.pointerId !== event.pointerId) return;
    const at = point(event); if (!at) return;
    setPreview(clamp(current.left + at.x - current.start.x, current.bottomGround - at.y + current.start.y));
  }
  function end(event) {
    const current = drag.current; if (!current || current.pointerId !== event.pointerId) return;
    const at = point(event);
    const next = at ? clamp(current.left + at.x - current.start.x, current.bottomGround - at.y + current.start.y) : null;
    drag.current = null; setPreview(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (next) changePosition({ mode: 'manual', ...next });
  }
  function keyboard(event) {
    if (!canMove || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); const step = event.shiftKey ? 100 : 10;
    const next = clamp(g.left + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0), g.bottomGround + (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0));
    changePosition({ mode: 'manual', ...next });
  }
  function dimension(x1, y1, x2, y2, label, key, color = '#667d91') {
    return <g key={key} stroke={color} fill={color} strokeWidth={span / 1100}><line x1={x1} y1={y1} x2={x2} y2={y2} /><line x1={x1 - font / 5} y1={y1 - font / 5} x2={x1 + font / 5} y2={y1 + font / 5} /><line x1={x2 - font / 5} y1={y2 - font / 5} x2={x2 + font / 5} y2={y2 + font / 5} /><text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - font / 2} textAnchor="middle" stroke="none" fontSize={font}>{label}</text></g>;
  }
  if (!validSpace) return <div className="acmi-sketch-empty"><strong>Esquema proporcional do local</strong><p>Informe a largura e a altura do espaço para desenhá-lo. A placa aparece quando suas medidas e referências de posição estiverem disponíveis.</p></div>;
  return <div className="acmi-sketch-wrap"><svg ref={svg} className="acmi-sketch" viewBox={`${-pad} ${-pad} ${width + pad * 2} ${height + pad * 2}`} role="group" aria-label="Esquema proporcional da placa no espaço disponível">
    <rect x={0} y={0} width={width} height={height} fill="#f2f6fa" stroke="#7d90a4" strokeWidth={span / 750} />
    <path d={`M0 ${height / 2}H${width} M${width / 2} 0V${height}`} stroke="#c5d2df" strokeWidth={span / 1400} strokeDasharray={`${font / 3} ${font / 3}`} />
    {dimension(0, -pad * .48, width, -pad * .48, `Espaço ${format(width, factor)} ${unit}`, 'width')}
    <text x={-pad * .45} y={height / 2} textAnchor="middle" fontSize={font} fill="#667d91" transform={`rotate(-90 ${-pad * .45} ${height / 2})`}>Espaço {format(height, factor)} {unit}</text>
    <text x={0} y={height + pad * .45} fontSize={font * .85} fill="#667d91">Base do espaço ao chão: {format(g.baseGround, factor)} {unit}</text>
    {visiblePlate && <>
      <g className={canMove ? 'acmi-draggable' : ''} role="button" tabIndex={canMove ? 0 : -1} aria-label="Mover placa. Setas movem 1 cm; Shift e seta movem 10 cm. Campos de posição disponíveis abaixo." onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={() => { drag.current = null; setPreview(null); }} onKeyDown={keyboard}>
        <rect x={left} y={plateTop} width={plateWidth} height={plateHeight} rx={Math.min(font / 4, plateHeight / 12)} fill="#286b94" stroke="#165577" strokeWidth={span / 650} />
        <text x={left + plateWidth / 2} y={plateTop + plateHeight / 2} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={Math.min(font, plateHeight * .22)}>{format(plateWidth, factor)} × {format(plateHeight, factor)} {unit}</text>
        <circle cx={left + plateWidth / 2} cy={plateTop + plateHeight / 2} r={font * .13} fill="#fff" opacity=".6" />
      </g>
      {dimension(0, height + pad * .11, left, height + pad * .11, `E ${format(left, factor)} ${unit}`, 'left', '#168968')}
      {dimension(left + plateWidth, height + pad * .11, width, height + pad * .11, `D ${format(width - left - plateWidth, factor)} ${unit}`, 'right', '#168968')}
      <g fill="#168968" fontSize={font * .8}><text x={width + font * .4} y={plateTop / 2}>↑ {format(plateTop, factor)} {unit}</text><text x={width + font * .4} y={plateTop + plateHeight + (height - plateTop - plateHeight) / 2}>↓ {format(bottom - g.baseGround, factor)} {unit}</text></g>
      {(calculation.points || []).filter(marker => number(marker.x) && number(marker.yGround)).map(marker => <g key={marker.id}><circle cx={marker.x} cy={height - (marker.yGround - g.baseGround)} r={font * .13} fill="#bc8230" /><title>{`${marker.label} · X ${format(marker.x, factor)} ${unit} · altura ${format(marker.yGround, factor)} ${unit}`}</title></g>)}
    </>}
  </svg><p className="acmi-help">{canMove ? 'Arraste a placa ou use as setas para posicionar. Setas: 1 cm; Shift + seta: 10 cm. O arraste muda para posição manual.' : 'Complete as referências para posicionar a placa.'} Esquema proporcional; não é projeto de acesso ou de ancoragem.</p><span className="acmi-sr" role="status">{announcement}</span></div>;
}

function DecisionCard({ kind, installation, calculation, change }) {
  const decision = installation.decisions[kind], status = calculation.decisions?.[kind] || {};
  const [error, setError] = useState('');
  const confirmed = status.confirmed && status.current;
  const invalidated = decision.confirmed && !status.current;
  const patch = values => change({ ...installation, decisions: { ...installation.decisions, [kind]: { ...decision, ...values, confirmed: false, signature: '' } } });
  function confirm() { try { change(confirmInstallationDecision(installation, kind, { responsible: decision.responsible, date: decision.date })); setError(''); } catch (cause) { setError(cause.message); } }
  return <article className={`acmi-decision${confirmed ? ' confirmed' : invalidated ? ' outdated' : ''}`}><div className="acmi-card-title"><strong>{decisionNames[kind]}</strong><span>{confirmed ? 'Confirmado' : invalidated ? 'Reconfirmar' : 'Pendente'}</span></div><p className="acmi-help">{status.reason || (confirmed ? 'Registro válido para os dados atuais desta etapa.' : 'Registre a conferência dos dados e das condições no local.')}</p><div className="acmi-fields"><TextInput label={`Responsável · ${decisionNames[kind].toLowerCase()}`} value={decision.responsible} change={value => patch({ responsible: value })} maxLength={200} /><TextInput label="Data da conferência" type="date" value={decision.date} change={value => patch({ date: value })} /></div><div className="acmi-actions"><button type="button" disabled={!decision.responsible.trim() || !decision.date || !status.canConfirm} onClick={confirm}>{confirmed ? 'Registrar novamente' : 'Confirmar esta etapa'}</button>{decision.confirmed && <button type="button" onClick={() => patch({})}>Retirar confirmação</button>}</div>{error && <p className="acmi-warning" role="alert">{error}</p>}</article>;
}

export default function InstallationPlanner({ project, update, onExport, orderPicker, productLabel = 'fachada ACM' }) {
  const productReference = productLabel === 'fachada ACM' ? 'da fachada ACM' : `do ${productLabel}`;
  const defaults = createInstallation(project), stored = project.installation || {};
  const installation = { ...defaults, ...stored, ...Object.fromEntries(['space', 'plate', 'position', 'environment', 'preparation'].map(key => [key, { ...defaults[key], ...stored[key] }])), decisions: Object.fromEntries(Object.keys(defaults.decisions).map(key => [key, { ...defaults.decisions[key], ...stored.decisions?.[key] }])), equipment: stored.equipment || [], materials: stored.materials || [], photos: stored.photos || [] };
  // A partial import without a position mode must remain unknown, as in the report.
  if (project.installation && stored.position?.mode == null) installation.position.mode = null;
  const calculation = calculateInstallation(installation);
  const unit = installation.displayUnit || 'm', factor = unit === 'cm' ? 10 : 1000;
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [previewOpen, setPreviewOpen] = useState(false);
  const latest = useRef(project); latest.current = project;
  const change = value => {
    const next = { ...value, updatedAt: new Date().toISOString() };
    if (new TextEncoder().encode(JSON.stringify({ ...project, installation: next })).byteLength > MAX_PROJECT_BYTES) { setMessage('O projeto completo excederia 4 MiB, incluindo imagens do Layout 3D e da instalação. Remova uma foto ou imagem sem uso antes de salvar esta alteração. O estado anterior foi preservado.'); return false; }
    update('installation', next); return true;
  };
  const preview = useMemo(() => {
    if (!previewOpen || !project.installation) return null;
    try { return { html: installationReportHTML(project) }; } catch (error) { return { error: error.message }; }
  }, [previewOpen, project]);
  const set = (section, key, value) => change({ ...installation, [section]: { ...installation[section], [key]: value } });
  const measure = (section, key, label, hint) => <Measure key={`${section}.${key}`} label={label} hint={hint} unit={unit} factor={factor} value={installation[section][key]} change={value => set(section, key, value)} />;
  const changePosition = position => change({ ...installation, position: { ...installation.position, ...position } });
  const patchRow = (section, rowId, values) => change({ ...installation, [section]: installation[section].map(row => row.id === rowId ? { ...row, ...values } : row) });
  function addEquipment(type) { if (installation.equipment.length >= 80) return; change({ ...installation, equipment: [...installation.equipment, { id: id('equipment'), type, characteristics: '', availability: 'unknown', quantity: null, unit: 'un', purpose: '', notes: '' }] }); }
  function addMaterial(category) { if (installation.materials.length >= 80) return; change({ ...installation, materials: [...installation.materials, { id: id('material'), category, quantity: null, width: null, length: null, unit: '', position: '', product: '', purpose: '', preparation: '', cure: '', notes: '' }] }); }
  async function addPhoto(event) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    setBusy(true); setMessage('Preparando a foto local…');
    try {
      if (!['image/png', 'image/jpeg'].includes(file.type)) throw new Error('Use foto PNG ou JPG.');
      const snapshot = latest.current;
      if (installation.photos.length >= 3) throw new Error('Limite de três fotos atingido. Remova uma foto antes de adicionar outra.');
      const asset = await importVisualAsset(file, id('photo'));
      if (latest.current !== snapshot) throw new Error('O projeto mudou durante a leitura da foto. Selecione o arquivo novamente.');
      if (asset.dataUrl.length > 500000 || installation.photos.reduce((sum, photo) => sum + photo.dataUrl.length, 0) + asset.dataUrl.length > 1500000) throw new Error('A foto excede 500 kB incorporados. Reduza a resolução e tente novamente.');
      if (change({ ...installation, photos: [...installation.photos, { id: asset.id, name: asset.name, dataUrl: asset.dataUrl, note: '' }] })) setMessage('Foto incorporada ao planejamento e à cópia JSON.');
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }
  async function exportPlan() {
    setBusy(true);
    try {
      if (!onExport) throw new Error('Arquivo local indisponível. Reabra esta etapa.');
      const snapshot = structuredClone(project);
      const content = installationReportHTML(snapshot);
      const name = `${project.name.replace(/[^\p{L}\p{N}._-]/gu, '-').slice(0, 70)}-r${project.revision}-instalacao-${Date.now()}.html`;
      await onExport({ name, mime: 'text/html;charset=utf-8', content }, snapshot);
      setMessage('Ficha arquivada nesta revisão. Abra o HTML e use Imprimir → Salvar como PDF.');
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }
  const g = calculation.geometry || {}, issues = [...(calculation.errors || []), ...(calculation.pending || []), ...(calculation.warnings || [])];
  return <section className="acmi" aria-label="Planejamento da instalação"><header className="acmi-header"><div><h2>Planejamento da instalação</h2><p>Local, posicionamento, recursos e conferências · revisão {project.revision}</p></div><span className="acmi-status-tag">{calculation.planningComplete ? 'Planejamento preenchido' : 'Planejamento em andamento'}</span></header>
    {orderPicker && <div className="acmi-order">{orderPicker}</div>}
    {!project.installation ? <div className="acmi-intro"><h3>Preparar a instalação no local</h3><p>Registre medidas do espaço, posição da placa, acesso, equipamentos e materiais. Os campos começam sem medidas presumidas.</p><button type="button" onClick={() => change(createInstallation(project))}>Iniciar planejamento da instalação</button><p className="acmi-help">{productLabel} atual: {format(project.front.width)} × {format(project.front.height)} m. As medidas só serão copiadas pelo comando explícito dentro do planejamento.</p></div> : <>
      <div className="acmi-toolbar"><TextInput label="Responsável pelo planejamento" value={installation.responsible} change={responsible => change({ ...installation, responsible })} maxLength={200} /><div className="acmi-unit" aria-label="Unidade dos campos de comprimento">{['m', 'cm'].map(option => <button type="button" key={option} aria-pressed={unit === option} onClick={() => change({ ...installation, displayUnit: option })}>{option}</button>)}</div><button type="button" disabled={busy} onClick={exportPlan}>Baixar ficha · imprimir/PDF</button><button type="button" aria-expanded={previewOpen} onClick={() => setPreviewOpen(!previewOpen)}>{previewOpen ? 'Fechar prévia da ficha' : 'Ver ficha na tela'}</button></div>
      {previewOpen && <section className="acmi-document-preview" aria-label="Prévia da ficha de instalação"><p className="acmi-help">Prévia da revisão {project.revision}. Para gerar PDF, baixe a ficha HTML, abra o arquivo e use Imprimir → Salvar como PDF.</p>{preview?.error ? <p role="alert">{preview.error}</p> : preview?.html && <iframe title={`Ficha de instalação · revisão ${project.revision}`} sandbox="allow-modals" srcDoc={preview.html} />}</section>}
      <div className="acmi-content"><div className="acmi-primary"><details open><summary>1. Local, espaço e placa <span>Informado</span></summary><div className="acmi-fields"><TextInput label="Nome do local / fachada" value={installation.space.label} change={value => set('space', 'label', value)} /><TextInput label="Endereço / acesso ao local" value={installation.space.address} change={value => set('space', 'address', value)} /><TextInput label="Referência de medição / marcos" value={installation.space.reference} change={value => set('space', 'reference', value)} placeholder="Referências conferidas no local" /><TextInput label="Substrato / parede de apoio" value={installation.space.substrate} change={value => set('space', 'substrate', value)} placeholder="Material, condição e observações" /></div><div className="acmi-fields">{measure('space', 'width', 'Largura do espaço disponível')}{measure('space', 'height', 'Altura do espaço disponível')}{measure('space', 'baseGround', 'Base do espaço ao chão', 'Preencha 0 somente se a base coincidir com o chão medido.')}</div>
        {(number(installation.plate.width) && Math.abs(installation.plate.width - project.front.width) > .001 || number(installation.plate.height) && Math.abs(installation.plate.height - project.front.height) > .001) && <p className="acmi-warning">As medidas da placa diferem {productReference} deste projeto. Confira antes de levar à instalação.</p>}<div className="acmi-subhead"><strong>Placa a instalar</strong><button type="button" onClick={() => change({ ...installation, plate: { ...installation.plate, width: project.front.width, height: project.front.height, thickness: project.material.thickness } })}>Copiar medidas {productReference}</button></div><p className="acmi-help">{productLabel} atual: {format(project.front.width)} × {format(project.front.height)} m · {format(project.material.thickness, 1)} mm. Copiar preenche apenas largura, altura e espessura. Peso permanece informado separadamente.</p><div className="acmi-fields">{measure('plate', 'width', 'Largura da placa')}{measure('plate', 'height', 'Altura da placa')}{measure('plate', 'thickness', 'Espessura / profundidade informada')}<Measure label="Peso informado da placa / conjunto" value={installation.plate.weight} unit="kg" change={value => set('plate', 'weight', value)} hint="Não calculado a partir da área. Informe a fonte nas observações." /></div>
      </details><details open><summary>2. Posição e alturas <span>Informado + calculado</span></summary><div className="acmi-actions"><button type="button" aria-pressed={installation.position.mode === 'centered'} onClick={() => changePosition({ mode: 'centered' })}>Centralizar no espaço</button><button type="button" aria-pressed={installation.position.mode === 'manual'} onClick={() => changePosition({ mode: 'manual', left: g.left, bottomGround: g.bottomGround })}>Definir posição manual</button></div><p className="acmi-help">{installation.position.mode === 'centered' ? 'Posição centralizada: recuos iguais de cada lado e acima/abaixo, conforme as dimensões informadas.' : installation.position.mode === 'manual' ? 'Posição manual: distância da borda esquerda do espaço e altura da base da placa em relação ao chão.' : 'Escolha centralizar ou definir uma posição manual. Este planejamento importado ainda não informa o modo.'}</p>{installation.position.mode === 'manual' && <div className="acmi-fields">{measure('position', 'left', 'Distância à borda esquerda')}{measure('position', 'bottomGround', 'Base da placa ao chão')}</div>}
        <PositionSketch installation={installation} calculation={calculation} changePosition={changePosition} />
        <div className="acmi-calculations">{[['left', 'Recuo esquerdo'], ['right', 'Recuo direito'], ['above', 'Acima da placa'], ['below', 'Abaixo da placa'], ['bottomGround', 'Base ao chão'], ['centerGround', 'Centro ao chão'], ['topGround', 'Topo ao chão']].map(([key, name]) => <div key={key} className={number(g[key]) && g[key] < 0 ? 'outside' : ''}><span>{name}</span><strong>{format(g[key], factor)} <small>{unit}</small></strong><small>{number(g[key]) ? 'Calculado' : 'Aguardando medidas'}</small></div>)}</div>
        {!!calculation.points?.length && <details className="acmi-inner"><summary>Marcos de posicionamento</summary><div className="acmi-table"><table><thead><tr><th>Marco</th><th>X desde esquerda ({unit})</th><th>Altura ao chão ({unit})</th></tr></thead><tbody>{calculation.points.map(point => <tr key={point.id}><td>{point.label}</td><td>{format(point.x, factor)}</td><td>{format(point.yGround, factor)}</td></tr>)}</tbody></table></div></details>}
      </details><details><summary>3. Acesso, ambiente e equipamentos <span>Informado</span></summary><div className="acmi-fields"><TextInput label="Terreno / piso / desníveis" value={installation.environment.terrain} change={value => set('environment', 'terrain', value)} /><TextInput label="Acesso e obstáculos" value={installation.environment.access} change={value => set('environment', 'access', value)} multiline /><TextInput label="Exposição / entorno / interferências" value={installation.environment.exposure} change={value => set('environment', 'exposure', value)} multiline /><TextInput label="Duração prevista da atividade" value={installation.environment.duration} change={value => set('environment', 'duration', value)} /><Choice label="Atividade exige as duas mãos?" value={installation.environment.twoHands === null ? '' : installation.environment.twoHands ? 'yes' : 'no'} change={value => set('environment', 'twoHands', value === '' ? null : value === 'yes')} options={[[ '', 'Não informado'], ['yes', 'Sim'], ['no', 'Não']]} /></div><TextInput label="Observações do ambiente" value={installation.environment.notes} change={value => set('environment', 'notes', value)} multiline maxLength={4000} />
        <div className="acmi-subhead"><strong>Equipamentos previstos</strong></div><div className="acmi-actions">{Object.entries(equipmentNames).map(([type, name]) => <button type="button" key={type} disabled={installation.equipment.length >= 80} onClick={() => addEquipment(type)}>+ {name}</button>)}</div><p className="acmi-help">Registre o equipamento escolhido e suas características. A altura da placa não determina um tamanho seguro de escada, andaime ou plataforma.</p>
        {installation.equipment.map((item, index) => <details className="acmi-row" key={item.id} open><summary>{index + 1}. {equipmentNames[item.type] || item.type}<span>{item.characteristics || 'Características pendentes'}</span></summary><div className="acmi-fields"><Choice label="Tipo de equipamento" value={item.type} change={type => patchRow('equipment', item.id, { type })} options={Object.entries(equipmentNames)} /><Choice label="Disponibilidade" value={item.availability} change={availability => patchRow('equipment', item.id, { availability })} options={[[ 'unknown', 'A confirmar'], ['available', 'Disponível'], ['rent', 'Locação prevista'], ['pending', 'A providenciar']]} /><Measure label="Quantidade" value={item.quantity} change={quantity => patchRow('equipment', item.id, { quantity })} /><TextInput label="Unidade" value={item.unit} change={unitValue => patchRow('equipment', item.id, { unit: unitValue })} /><TextInput label="Características / modelo / dimensões informadas" value={item.characteristics} change={characteristics => patchRow('equipment', item.id, { characteristics })} multiline /><TextInput label="Uso previsto / posição" value={item.purpose} change={purpose => patchRow('equipment', item.id, { purpose })} /></div><TextInput label="Observações do equipamento" value={item.notes} change={notes => patchRow('equipment', item.id, { notes })} multiline maxLength={4000} /><button type="button" className="acmi-remove" onClick={() => change({ ...installation, equipment: installation.equipment.filter(row => row.id !== item.id) })}>Remover equipamento</button></details>)}
      </details><details><summary>4. Materiais, fixação e preparação <span>Informado</span></summary><div className="acmi-actions">{Object.entries(categories).map(([category, name]) => <button type="button" key={category} disabled={installation.materials.length >= 80} onClick={() => addMaterial(category)}>+ {name}</button>)}</div>{!installation.materials.length && <p className="acmi-help">Cadastre os materiais e ferramentas previstos para esta instalação. As quantidades não são copiadas do corte nem dimensionadas automaticamente.</p>}
        {installation.materials.map((item, index) => <details className="acmi-row" key={item.id} open><summary>{index + 1}. {categories[item.category]}<span>{item.product || 'Produto pendente'}</span></summary><div className="acmi-fields"><Choice label="Categoria" value={item.category} change={category => patchRow('materials', item.id, { category })} options={Object.entries(categories)} /><TextInput label="Produto / especificação / referência" value={item.product} change={product => patchRow('materials', item.id, { product })} /><Measure label="Quantidade informada" value={item.quantity} change={quantity => patchRow('materials', item.id, { quantity })} /><TextInput label="Unidade" value={item.unit} change={unitValue => patchRow('materials', item.id, { unit: unitValue })} />{item.category === 'tape' && <><Measure label="Largura da fita" unit={unit} factor={factor} value={item.width} change={width => patchRow('materials', item.id, { width })} /><Measure label="Comprimento da fita" unit={unit} factor={factor} value={item.length} change={length => patchRow('materials', item.id, { length })} /></>}<TextInput label="Posição / pontos de aplicação" value={item.position} change={position => patchRow('materials', item.id, { position })} /><TextInput label="Função / finalidade" value={item.purpose} change={purpose => patchRow('materials', item.id, { purpose })} /><TextInput label="Preparação indicada" value={item.preparation} change={preparation => patchRow('materials', item.id, { preparation })} multiline /><TextInput label="Cura / tempo / condições informadas" value={item.cure} change={cure => patchRow('materials', item.id, { cure })} multiline /></div><TextInput label="Observações / fonte técnica" value={item.notes} change={notes => patchRow('materials', item.id, { notes })} multiline maxLength={4000} /><button type="button" className="acmi-remove" onClick={() => change({ ...installation, materials: installation.materials.filter(row => row.id !== item.id) })}>Remover item</button></details>)}
        <div className="acmi-subhead"><strong>Preparação geral da instalação</strong></div><div className="acmi-fields">{[['surface', 'Condição / preparação da superfície'], ['cleaning', 'Limpeza e produto indicado'], ['primer', 'Primer / promotor de aderência'], ['curing', 'Cura / espera antes de esforço']].map(([key, label]) => <TextInput key={key} label={label} value={installation.preparation[key]} change={value => set('preparation', key, value)} multiline />)}</div><TextInput label="Observações de preparação" value={installation.preparation.notes} change={value => set('preparation', 'notes', value)} multiline maxLength={4000} />
      </details><details><summary>5. Fotos e observações do local <span>{installation.photos.length}/3</span></summary><label className="acmi-field"><span>Adicionar foto local · PNG / JPG</span><input type="file" accept="image/png,image/jpeg" disabled={busy || installation.photos.length >= 3} onChange={addPhoto} /></label><p className="acmi-help">Até três fotos locais; cada uma com até 500 kB após redução. Elas acompanham a ficha e a cópia JSON desta revisão.</p><TextInput label="Observações gerais da instalação" value={installation.notes} change={notes => change({ ...installation, notes })} multiline maxLength={4000} /><div className="acmi-photos">{installation.photos.map(photo => <article key={photo.id}><img src={photo.dataUrl} alt={photo.note || photo.name} /><TextInput label="Nome / identificação da foto" value={photo.name} change={name => patchRow('photos', photo.id, { name })} /><TextInput label="O que conferir nesta foto" value={photo.note} change={note => patchRow('photos', photo.id, { note })} multiline /><button type="button" className="acmi-remove" onClick={() => change({ ...installation, photos: installation.photos.filter(row => row.id !== photo.id) })}>Remover foto</button></article>)}</div></details>
      </div><aside className="acmi-review"><details open><summary>Conferências e pendências</summary><p className="acmi-help">Medidas preenchidas são informadas. Recuos e alturas são calculados. Cada confirmação registra responsável e data; mudanças relevantes exigem nova conferência.</p>{issues.length ? <ul className="acmi-pending">{issues.map((issue, index) => <li key={`${issue.code || index}-${index}`}>{textOf(issue)}</li>)}</ul> : <p className="acmi-success">Sem pendências de preenchimento indicadas.</p>}{Object.keys(decisionNames).map(kind => <DecisionCard key={kind} kind={kind} installation={installation} calculation={calculation} change={change} />)}<p className="acmi-scope">Planejamento e conferência registrados não liberam trabalho em altura nem certificam acesso, capacidade dos equipamentos ou fixação. A execução depende da avaliação técnica e das condições reais.</p></details></aside></div>
    </>}{message && <p className="acmi-message" role="status">{message}</p>}</section>;
}
