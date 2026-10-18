import { useId, useMemo, useState } from 'react';
import { MAX_TECHNICAL_BYTES, parseTechnicalFile } from '../../lib/acm/technical-import.mjs';
import './technical-import.css';
const format = n => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
function PiecePreview({ piece }) {
  const margin = Math.max(piece.width, piece.height) * .05, stroke = Math.max(piece.width, piece.height) / 250;
  return <figure className="acm-technical-piece"><svg role="img" aria-label={`Peça ${piece.id}, ${format(piece.width)} por ${format(piece.height)} milímetros`} viewBox={`${-margin} ${-margin} ${piece.width + margin * 2} ${piece.height + margin * 2}`}>
    <g transform={`translate(0 ${piece.height}) scale(1 -1)`} strokeWidth={stroke}>
      <polygon points={piece.contour.map(p => p.join(',')).join(' ')} fill="#f1f5f9" stroke="#000000"/>
      {piece.holes.map((hole, i) => <circle key={i} cx={hole.x} cy={hole.y} r={hole.diameter / 2} fill="white" stroke="#0000ff"/>)}
      {piece.grooves.map((groove, i) => <line key={i} x1={groove.x1} y1={groove.y1} x2={groove.x2} y2={groove.y2} stroke="#ff0000" strokeDasharray={`${stroke * 4} ${stroke * 2}`}/>)}
    </g>
  </svg><figcaption><strong>{piece.id}</strong> · {format(piece.width)} × {format(piece.height)} mm · {piece.quantity} un.<br/>{piece.holes.length} furos · {piece.grooves.length} sulcos</figcaption></figure>;
}
export default function TechnicalImport({ project, onApply, onClose }) {
  const titleId = useId(), [file, setFile] = useState(null), [fileError, setFileError] = useState(''), [confirmed, setConfirmed] = useState(false);
  const [options, setOptions] = useState({ unit: 'auto', scale: 1, tolerance: .25, quantity: 1, layers: {} });
  const [reference, setReference] = useState({ sourceLength: '', targetLength: '' });
  const result = useMemo(() => file ? parseTechnicalFile(file.text, { ...options, name: file.name, format: file.format, ...(reference.sourceLength !== '' || reference.targetLength !== '' ? { reference: { sourceLength: Number(reference.sourceLength), targetLength: Number(reference.targetLength) } } : {}) }) : null, [file, options, reference]);
  const change = (key, value) => { setConfirmed(false); setOptions(old => ({ ...old, [key]: value })); };
  const measure = (key, value) => { setConfirmed(false); setReference(old => ({ ...old, [key]: value })); };
  async function readFile(event) {
    const selected = event.target.files?.[0]; event.target.value = ''; if (!selected) return;
    setConfirmed(false); setFileError(''); setFile(null);
    try {
      const extension = selected.name.split('.').at(-1).toLowerCase();
      if (!['svg', 'dxf'].includes(extension)) throw new Error('Selecione SVG ou DXF ASCII 2D.');
      if (selected.size > MAX_TECHNICAL_BYTES) throw new Error('Arquivo excede 500 kB. Simplifique o desenho antes de importar.');
      const text = await selected.text();
      setOptions({ unit: 'auto', scale: 1, tolerance: .25, quantity: 1, layers: {} }); setReference({ sourceLength: '', targetLength: '' });
      setFile({ text, name: selected.name, format: extension, size: selected.size });
    } catch (error) { setFileError(error.message || 'Não foi possível ler o arquivo local.'); }
  }
  const drawing = result?.drawing, errors = result?.diagnostics.filter(d => d.severity === 'error') || [];
  return <section className="acm-technical-import" aria-labelledby={titleId}>
    <div className="acm-technical-heading"><h3 id={titleId}>Importar desenho técnico 2D</h3>{onClose && <button type="button" onClick={onClose}>Fechar importação</button>}</div>
    <p>SVG vetorial ou DXF ASCII: contornos fechados, furos circulares e sulcos retos. Curvas planas são aproximadas na tolerância indicada. Curvas espaciais, calandragem e modelos 3D precisam de desenvolvimento técnico próprio.</p>
    {project?.technicalDrawing && <p>Desenho atual: <strong>{project.technicalDrawing.name}</strong>. Ao aplicar, o desenho técnico atual será substituído.</p>}
    <label className="acm-field"><span>Arquivo local · até 500 kB</span><input type="file" accept=".svg,.dxf,image/svg+xml,application/dxf" onChange={readFile}/></label>
    {fileError && <p className="acm-error" role="alert">{fileError}</p>}
    {file && <>
      <p><strong>{file.name}</strong> · {format(file.size / 1000)} kB</p>
      <div className="acm-technical-fields">
        <label className="acm-field"><span>Unidade das coordenadas</span><select value={options.unit} onChange={e => change('unit', e.target.value)}><option value="auto">Detectar no arquivo</option><option value="mm">Milímetro</option><option value="cm">Centímetro</option><option value="m">Metro</option><option value="in">Polegada</option><option value="px">Pixel · 96 dpi</option></select></label>
        <label className="acm-field"><span>Fator de escala</span><input type="number" min="0.00001" max="100000" step="any" value={options.scale} onChange={e => change('scale', Number(e.target.value))}/></label>
        <label className="acm-field"><span>Tolerância das curvas (mm)</span><input type="number" min="0.01" max="5" step="0.01" value={options.tolerance} onChange={e => change('tolerance', Number(e.target.value))}/></label>
        <label className="acm-field"><span>Quantidade por contorno externo</span><input type="number" min="1" max="100" step="1" value={options.quantity} onChange={e => change('quantity', Number(e.target.value))}/></label>
      </div>
      <details className="acm-details"><summary>Ajustar por uma medida de referência</summary><p>Informe uma medida do desenho convertido para mm antes do ajuste e a medida real desejada. O fator de correção multiplica a escala acima.</p><div className="acm-technical-fields">
        <label className="acm-field"><span>Medida atual sem correção (mm)</span><input type="number" min="0.001" step="any" value={reference.sourceLength} onChange={e => measure('sourceLength', e.target.value)}/></label>
        <label className="acm-field"><span>Medida real desejada (mm)</span><input type="number" min="0.001" step="any" value={reference.targetLength} onChange={e => measure('targetLength', e.target.value)}/></label>
      </div></details>
      {!!result?.layers.length && <fieldset className="acm-technical-layers"><legend>Operação por camada</legend><p>Camadas começam como corte. Entidades não suportadas só podem ser excluídas escolhendo “Ignorar camada”.</p>{result.layers.map(layer => <label key={layer.name} className="acm-field"><span>{layer.name} · {layer.count} entidades</span><select value={layer.role} onChange={e => change('layers', { ...options.layers, [layer.name]: e.target.value })}><option value="contour">Corte · contorno / furo circular</option><option value="groove">Sulco · segmentos retos</option><option value="ignore">Ignorar camada explicitamente</option></select></label>)}</fieldset>}
      {!!result?.diagnostics.length && <div className="acm-technical-diagnostics" aria-live="polite"><strong>{errors.length ? `${errors.length} impedimentos para aplicar` : 'Diagnóstico da importação'}</strong><ul>{result.diagnostics.map((d, i) => <li key={`${d.code}-${i}`} className={`acm-technical-${d.severity}`}><strong>{d.severity === 'error' ? 'Impedimento' : d.severity === 'warning' ? 'Atenção' : 'Informação'}:</strong> {d.message}</li>)}</ul></div>}
      {result?.sourceBounds && <p>Envelope do desenho após conversão: {format(result.sourceBounds.width)} × {format(result.sourceBounds.height)} mm.</p>}
      {drawing && <><p><strong>{drawing.parts.length} peças distintas · {drawing.parts.reduce((n, p) => n + p.quantity, 0)} unidades</strong>. Preto: corte. Azul: furos. Tracejado vermelho: sulcos retos. Origem de cada peça no canto inferior esquerdo.</p><div className="acm-technical-preview">{drawing.parts.map(piece => <PiecePreview key={piece.id} piece={piece}/>)}</div><label className="acm-technical-confirm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>Conferi a prévia, a unidade, as medidas, os furos, os sulcos e as camadas ignoradas.</label></>}
      <p className="acm-help">O projeto e o backup guardam o nome, a unidade em mm, a tolerância e a geometria confirmada. Os bytes do arquivo original ficam apenas nesta sessão; mantenha seu original separado. A importação é local.</p>
      <button type="button" className="acm-btn-primary" disabled={!drawing || !confirmed} onClick={() => { if (drawing && confirmed) onApply(drawing); }}>Aplicar desenho técnico conferido</button>
    </>}
  </section>;
}
