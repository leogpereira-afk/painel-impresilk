import { useRef, useState } from 'react';
import { importVectorArtwork } from '../../lib/letras/importers.mjs';
import DecimalInput from './DecimalInput.jsx';
import {fromMillimeters,toMillimeters} from '../../lib/letras/display-units.mjs';
import './vector-import-panel.css';
const fmt = n => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(n);
function Preview({ artwork }) {
  return <svg className="vector-import-preview" viewBox={`-4 -4 ${artwork.widthMm + 8} ${artwork.heightMm + 8}`} role="img" aria-label="Prévia dos contornos importados e vazados"><g transform={`translate(0 ${artwork.heightMm}) scale(1 -1)`}>{artwork.contours.map((c, i) => <path key={c.id || i} d={[c.outer, ...c.holes].map(r => `M${r.map(p => p.join(',')).join('L')}Z`).join(' ')} fill="#163c5e" fillRule="evenodd" stroke="#81a9c5" strokeWidth={Math.max(0.2, artwork.widthMm / 800)} />)}</g></svg>;
}
export default function VectorImportPanel({ project, onChange, simple = true, unit = 'mm' }) {
  const [source, setSource] = useState(null); const [candidate, setCandidate] = useState(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [width, setWidth] = useState(null); const [confirmed, setConfirmed] = useState(false); const sequence = useRef(0);
  const active = project.artwork?.mode === 'vector' ? project.artwork : null;
  async function choose(file) {
    const seq = ++sequence.current; setError(''); setCandidate(null); setSource(null); setConfirmed(false); setWidth(null);
    if (!file) return;
    if (file.size > 2_000_000) { setError('O limite de importação é 2 MB. Simplifique as curvas e tente novamente.'); return; }
    setBusy(true);
    try { const content = await file.text(); if (seq !== sequence.current) return; const parsed = importVectorArtwork(content, { fileName: file.name }); if (parsed.errors.length) setError(parsed.errors.join(' ')); else { setSource({ content, fileName: file.name }); setCandidate(parsed); setWidth(parsed.needsScale ? null : parsed.widthMm); } }
    catch (e) { if (seq === sequence.current) setError(e.message || 'Não foi possível ler o arquivo.'); }
    finally { if (seq === sequence.current) setBusy(false); }
  }
  function scale(value) {
    setWidth(value); setConfirmed(false); if (!source) return;
    if (!Number.isFinite(value) || value <= 0) { setError('Informe uma largura maior que zero.'); return; }
    const parsed = importVectorArtwork(source.content, { fileName: source.fileName, widthMm: value });
    if (parsed.errors.length) setError(parsed.errors.join(' ')); else { setError(''); setCandidate(parsed); }
  }
  function apply() {
    if (!candidate || candidate.errors.length || candidate.needsScale || !confirmed || error) return;
    const { errors: _errors, needsScale: _needsScale, ...artwork } = candidate;
    onChange({ ...artwork, scaleConfirmed: true }); setCandidate(null); setSource(null); setConfirmed(false);
  }
  function resizeActive(value) {
    if (!Number.isFinite(value) || value <= 0 || value > 100000 || !active) return;
    const height = value * active.heightMm / active.widthMm; if (height > 10000) return;
    const factor = value / active.widthMm, ring = points => points.map(([x, y]) => [x * factor, y * factor]);
    onChange({ ...active, widthMm: value, heightMm: height, contours: active.contours.map(c => ({ ...c, outer: ring(c.outer), holes: c.holes.map(ring) })) });
  }
  return <section className="vector-import-panel" aria-label="Importar arte vetorial pronta">
    <div className="vector-import-title"><strong>Importar arte pronta</strong><span>SVG ou DXF ASCII · até 2 MB</span></div>
    <details open={!simple}><summary>Formatos aceitos e arquivos de exemplo</summary><p>Exporte textos em curvas e feche os contornos. Vazados permanecem abertos. PDF, CDR, AI, imagens e referências externas precisam ser convertidos antes.</p>

    <div className="vector-import-examples"><span>Exemplos fictícios:</span><a href={`${import.meta.env.BASE_URL}examples/letras-demo.svg`} download="letras-demo.svg">Baixar SVG com vazados</a><a href={`${import.meta.env.BASE_URL}examples/letras-demo.dxf`} download="letras-demo.dxf">Baixar DXF fechado</a><a href={`${import.meta.env.BASE_URL}examples/letras-fabricacao-v5.svg`} download="letras-fabricacao-v5.svg">SVG de fabricação · 3 formas e 1 vazado</a></div></details>
    <label className="vector-import-file">Escolher arquivo SVG ou DXF<input type="file" accept=".svg,.dxf,image/svg+xml,application/dxf" onChange={e => { choose(e.target.files?.[0]); e.target.value = ''; }} disabled={busy} /></label>
    {busy && <p role="status">Conferindo arquivo e contornos…</p>}{error && <p className="vector-import-error" role="alert">{error}</p>}
    {candidate && <div className="vector-import-candidate"><Preview artwork={candidate} /><div><strong>{candidate.fileName}</strong><p>{candidate.contours.length} formas · {candidate.contours.reduce((s, c) => s + c.holes.length, 0)} vazados</p>{candidate.needsScale ? <p className="vector-import-error">Unidade física ausente. Defina a largura real abaixo antes de aplicar.</p> : <p>{fmt(fromMillimeters(candidate.widthMm,unit))} × {fmt(fromMillimeters(candidate.heightMm,unit))} {unit}{candidate.sourceWidthMm ? ` · original ${fmt(candidate.sourceWidthMm)} × ${fmt(candidate.sourceHeightMm)} mm` : ' · escala informada'}</p>}<label>Largura total da arte ({unit})<DecimalInput key={unit} value={fromMillimeters(width,unit)} onChange={v=>scale(toMillimeters(v,unit))} aria-label={`Largura física da arte importada (${unit})`} /></label><p>A altura acompanha a proporção original; medidas usam os limites dos contornos, sem margens do documento.</p><label className="vector-import-confirm"><input type="checkbox" checked={confirmed} disabled={candidate.needsScale || !!error} onChange={e => setConfirmed(e.target.checked)} /> Conferi a medida final e os vazados da prévia.</label><button type="button" disabled={!confirmed || candidate.needsScale || !!error} onClick={apply}>Aplicar arte ao projeto</button></div></div>}
    {active && !candidate && <div className="vector-import-active"><Preview artwork={active} /><div><strong>Arte aplicada: {active.fileName}</strong><p>{active.contours.length} formas · {fmt(fromMillimeters(active.widthMm,unit))} × {fmt(fromMillimeters(active.heightMm,unit))} {unit}</p><label>Largura da arte aplicada ({unit})<DecimalInput key={unit} value={fromMillimeters(active.widthMm,unit)} onChange={v=>resizeActive(toMillimeters(v,unit))} aria-label={`Largura da arte aplicada (${unit})`} /></label><p>Alterar a largura mantém a proporção e recalcula peças, LEDs e documentos.</p><button type="button" onClick={() => onChange({ mode: 'text' })}>Voltar ao texto digitado</button></div></div>}
    <p className="vector-import-note">Curvas são aproximadas em segmentos. Contornos abertos, sobrepostos e recursos não suportados são bloqueados; confira a tolerância antes de liberar o corte.</p>
  </section>;
}
