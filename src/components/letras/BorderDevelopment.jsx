import { useState } from 'react';
import DecimalInput from './DecimalInput.jsx';
const fmt = value => Number.isFinite(value) ? value.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : 'a definir';
const colors = ['#176b91', '#be5c1e', '#6d55a7', '#178068', '#b33b68', '#666825'];
const path = points => points?.length ? `M${points.map(p => p.join(',')).join('L')}` : '';
function OriginInput({ value, limit, onChange, disabled }) {
  const [draft, setDraft] = useState(null), [error, setError] = useState('');
  const apply = () => {
    if (draft === null) return;
    const next = Number(draft.trim().replace(',', '.'));
    if (!draft.trim() || !Number.isFinite(next) || next < 0 || next >= limit) { setError(`Informe de 0 até menos de ${fmt(limit)} mm.`); return; }
    setError(''); setDraft(null); onChange(next);
  };
  return <label className="lf-seams">Início REF 0 no contorno (mm)<input disabled={disabled} inputMode="decimal" value={draft ?? value} aria-invalid={!!error} onChange={e => setDraft(e.target.value)} onBlur={apply} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />{error && <span role="alert">{error}</span>}</label>;
}
function SeamEditor({ strip, value, onChange, disabled }) {
  const [draft, setDraft] = useState(null), [error, setError] = useState('');
  const commit = () => {
    if (draft === null) return;
    const values = draft.trim() ? draft.split(';').map(v => Number(v.trim().replace(',', '.'))) : [];
    if (values.some(v => !Number.isFinite(v) || v <= 0 || v >= strip.nominalLengthMm) || new Set(values).size !== values.length || values.length > 99) {
      setError('Use distâncias únicas entre 0 e o comprimento do contorno, separadas por ponto e vírgula.'); return;
    }
    setError(''); setDraft(null); onChange(values);
  };
  return <label className="lf-seams">Emendas a partir de REF 0 (mm)<input disabled={disabled} aria-invalid={!!error} value={draft ?? value.join('; ')} placeholder="Ex.: 200; 450 — vazio usa divisão automática" onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />{error && <span role="alert">{error}</span>}</label>;
}
export default function BorderDevelopment({ project, result, fabrication, config, onChange, onDepth, onExport, current = true }) {
  const [stripId, setStripId] = useState(''), [segmentId, setSegmentId] = useState('');
  const strips = fabrication.strips || [], strip = strips.find(s => s.id === stripId) || strips[0];
  const selected = strip?.segments.find(s => s.id === segmentId) || strip?.segments[0];
  const letter = result?.letters.find(l => l.id === strip?.letterId);
  const change = (key, value) => onChange({ ...config, [key]: value, joinConfirmed: false, compensationConfirmed: false });
  const hollow = !project.construction.family.startsWith('flat-');
  const depthEditor = hollow && <label>Borda / profundidade (mm)<DecimalInput value={project.construction.depthMm} onChange={onDepth} disabled={!onDepth} /></label>;
  if (!strip) return <div className="lf-card"><div className="lf-fields">{depthEditor}</div><h3>{hollow ? 'Corrija as regras para desenvolver as bordas' : 'Este produto usa camadas recortadas'}</h3><p>{hollow ? 'Confira os avisos acima. As medidas permanecem editáveis enquanto a geometria é recalculada.' : 'Sem faixas laterais para desenvolver. Confira as espessuras em Corpo e bordas e siga as etapas de corte, acabamento, união de camadas e fixação.'}</p>{hollow && <button onClick={() => onChange({ ...config, seamsByStrip: {}, startOffsetsByStrip: {}, joinConfirmed: false })}>Reiniciar posições das emendas</button>}</div>;
  const width = letter?.width || 1, height = letter?.height || 1, pad = Math.max(width, height) * 0.12;
  const line = Math.max(width, height) / 100;
  const perimeter = strip.nominalLengthMm;
  return <div className={`lf-border-workbench ${!current ? 'lf-recalculating' : ''}`}>
    <div className="lf-card lf-border-settings">
      <div className="lf-heading"><div><small>EXTERNA E VAZADOS INDEPENDENTES</small><h3>Desenvolvimento da borda</h3></div><span className="lf-state">{strips.length} contornos</span></div>
      <div className="lf-fields">
        <label>Contorno a desenvolver<select disabled={!current} value={strip.id} onChange={e => { setStripId(e.target.value); setSegmentId(''); }}>{strips.map(s => <option key={s.id} value={s.id}>{s.label} · {s.role === 'inner-side' ? 'vazado' : 'externo'} · {fmt(s.nominalLengthMm)} mm</option>)}</select></label>
        {depthEditor}
        <OriginInput disabled={!current} key={`${strip.id}-${config.startOffsetsByStrip?.[strip.id] ?? 0}`} value={config.startOffsetsByStrip?.[strip.id] ?? 0} limit={perimeter} onChange={value => change('startOffsetsByStrip', { ...config.startOffsetsByStrip, [strip.id]: value })} />
      </div>
      <SeamEditor disabled={!current} key={`${strip.id}-${project.revision}`} strip={strip} value={config.seamsByStrip?.[strip.id] || []} onChange={values => change('seamsByStrip', { ...config.seamsByStrip, [strip.id]: values })} />
      <p>REF 0 é o fechamento escolhido, medido desde o primeiro ponto do vetor original. As demais emendas usam distâncias a partir dele. Vazio usa a divisão por quantidade ou comprimento máximo.</p>
      <div className="lf-mini-metrics"><div><small>Contorno</small><strong>{fmt(perimeter)} mm</strong></div><div><small>Largura de corte</small><strong>{fmt(strip.widthMm)} mm</strong></div><div><small>Faixas / uniões</small><strong>{strip.segments.length} / {strip.seamCount}</strong></div></div>
      <p className="lf-note">Largura de corte = borda + aba informada. A sobreposição aumenta o comprimento. O traçado representa geometria; raios, ferramentas e compensação precisam do procedimento de oficina.</p>
    </div>
    <div className="lf-card lf-contour-card">
      <div className="lf-heading"><div><small>{strip.role === 'inner-side' ? 'VAZADO INTERNO' : 'CONTORNO EXTERNO'}</small><h3>Emendas no contorno</h3></div><span className="lf-state">{strip.winding === 'clockwise' ? '↻ Sentido horário' : '↺ Sentido anti-horário'}</span></div>
      <svg viewBox={`${-pad} ${-pad} ${width + pad * 2} ${height + pad * 2}`} role="img" aria-label="Contorno da letra com início e emendas das faixas">
        <g transform={`translate(0 ${height}) scale(1 -1)`}>
          {letter?.contours.map((c, i) => <path key={i} d={[c.outer, ...c.holes].map(r => `${path(r)}Z`).join(' ')} fill="#e8eef3" fillRule="evenodd" stroke="#bacbd5" strokeWidth={line * .5} />)}
          {strip.segments.map((segment, i) => <path key={segment.id} d={path(segment.pathPoints || strip.points)} fill="none" stroke={colors[i % colors.length]} strokeWidth={selected?.id === segment.id ? line * 1.5 : line * .7} strokeLinejoin="round" />)}
        </g>
        {strip.segments.map((segment, i) => <g key={segment.id} role="button" tabIndex={0} aria-label={`Selecionar faixa F${segment.index}`} onClick={() => current && setSegmentId(segment.id)} onKeyDown={e => { if (current && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setSegmentId(segment.id); } }}>
          <circle cx={segment.startPoint[0]} cy={height - segment.startPoint[1]} r={line * 4} fill={colors[i % colors.length]} stroke="white" strokeWidth={line * .45} />
          <text x={segment.startPoint[0]} y={height - segment.startPoint[1]} textAnchor="middle" dominantBaseline="central" fill="white" fontSize={line * 3.8} fontWeight="700">{segment.index}</text>
          <title>{`F${segment.index} · REF ${fmt(segment.startMm)} → ${fmt(segment.endMm)} mm`}</title>
        </g>)}
      </svg>
      <div className="lf-segment-buttons" role="group" aria-label="Selecionar faixa desenvolvida">{strip.segments.map((s, i) => <button disabled={!current} key={s.id} aria-pressed={selected?.id === s.id} style={{ '--segment-color': colors[i % colors.length] }} onClick={() => setSegmentId(s.id)}>F{s.index}<small>{fmt(s.nominalLengthMm)} mm</small></button>)}</div>
      <p>Os pontos numerados marcam início e união de cada faixa. F1 começa em REF 0. Selecione uma faixa para comparar o percurso com o desenvolvimento abaixo.</p>
    </div>
    {selected && <div className="lf-card lf-developed-card">
      <div className="lf-heading"><div><small>{strip.label} · F{selected.index}</small><h3>Faixa aberta · {fmt(selected.grossLengthMm ?? selected.nominalLengthMm)} × {fmt(selected.widthMm ?? selected.depthMm)} mm</h3></div><span className="lf-state">{selected.grossLengthMm === null ? 'Nominal · medidas pendentes' : 'Desenvolvimento informado'}</span></div>
      <div className="lf-flat-strip"><svg viewBox="0 0 1000 200" role="img" aria-label="Faixa aberta com borda, aba e sobreposição">
        {(() => {
          const length = selected.grossLengthMm ?? selected.nominalLengthMm;
          const overlap = selected.grossLengthMm !== null ? (selected.overlapMm || 0) / length * 900 : 0;
          const extra = selected.widthMm != null ? (selected.widthMm - selected.depthMm) / selected.widthMm * 90 : 0;
          return <><rect x="50" y="45" width="900" height="90" fill="#e5f1f8" stroke="#176b91" strokeWidth="2" />
            {extra > 0 && <rect x="50" y={135 - extra} width="900" height={extra} fill="#d6caf0" />}
            {overlap > 0 && <rect x={950 - overlap} y="45" width={overlap} height="90" fill="#ffdcb2" stroke="#b7651a" strokeDasharray="5 4" />}
            {(selected.referenceMarks || []).filter(mark => Number.isFinite(mark.developedOffsetMm) && mark.kind === 'direction-change').map((mark, i) => <path key={i} d={`M${50 + mark.developedOffsetMm / length * 900} 45v10`} stroke="#7492a4" strokeWidth="1" />)}
            <text x="50" y="25" fontSize="16" fill="#163c50">Início · REF {fmt(selected.startMm)} mm</text><text x="950" y="25" textAnchor="end" fontSize="16" fill="#163c50">Até REF {fmt(selected.endMm)} mm</text>
            <text x="500" y="170" textAnchor="middle" fontSize="18" fill="#163c50">Borda {fmt(selected.depthMm)} mm · aba {fmt(selected.widthMm == null ? null : selected.widthMm - selected.depthMm)} mm · sobreposição {fmt(selected.overlapMm)} mm</text></>;
        })()}
      </svg></div>
      <div className="lf-strip-formula"><span>Contorno <b>{fmt(selected.nominalLengthMm)} mm</b></span><span>+</span><span>Compensação <b>{fmt(selected.compensationMm)} mm</b></span><span>+</span><span>Sobreposição <b>{fmt(selected.overlapMm)} mm</b></span><span>=</span><span>Comprimento de corte <b>{fmt(selected.grossLengthMm)} mm</b></span></div>
      <p className="lf-note">Esquema de leitura, sem escala proporcional entre comprimento e largura. Marcas curtas são referências geométricas, não instruções de dobra. Use a prancha em mm para conferir o desenvolvimento.</p>
      <details><summary>Identificação e tabela de todas as faixas deste contorno</summary><p className="lf-ids">{strip.id}</p><div className="lf-table-scroll"><table><thead><tr><th>Faixa</th><th>De → até (mm)</th><th>Contorno (mm)</th><th>Comp. (mm)</th><th>Sobreposição (mm)</th><th>Corte × largura (mm)</th></tr></thead><tbody>{strip.segments.map(s => <tr key={s.id}><td><button disabled={!current} aria-pressed={s.id === selected.id} onClick={() => setSegmentId(s.id)}>F{s.index}</button></td><td>{fmt(s.startMm)} → {fmt(s.endMm)}</td><td>{fmt(s.nominalLengthMm)}</td><td>{fmt(s.compensationMm)}</td><td>{fmt(s.overlapMm)}</td><td>{fmt(s.grossLengthMm)} × {fmt(s.widthMm)}</td></tr>)}</tbody></table></div></details>
      <div className="lf-actions"><button disabled={!onExport} onClick={() => onExport?.('svg', { kind: 'strips' })}>Baixar faixas e emendas · SVG</button></div>
    </div>}
  </div>;
}
