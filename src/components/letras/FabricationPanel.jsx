import { useMemo, useState } from 'react';
import DecimalInput from './DecimalInput';
import BorderDevelopment from './BorderDevelopment.jsx';
import CutPlanPanel from './CutPlanPanel.jsx';
import { calculateFabrication, createFabricationConfig, fabricationSVG, FABRICATION_JOIN_METHODS } from '../../lib/letras/fabrication.mjs';
import './fabrication-panel.css';

const mm = value => Number.isFinite(value) ? value.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : 'a definir';
function NumberField({ label, value, onChange }) { return <label>{label}<DecimalInput value={value} onChange={onChange} /></label>; }
function Checklist({ title, items }) { return items?.length ? <div className="lf-stage-checklist"><h4>{title}</h4><ul>{items.map((item, i) => <li key={i}>{item}</li>)}</ul></div> : null; }
export default function FabricationPanel({ project, result, fabrication: supplied, nesting, onChange, onDepth, onExport, onDocument, onStage, current = true, simple = true }) {
  const calculated = useMemo(() => supplied || calculateFabrication(project, result), [project, result, supplied]);
  const fabrication = calculated;
  const [selected, setSelected] = useState('artwork'), [view, setView] = useState('steps');
  const config = createFabricationConfig(project.fabrication);
  const step = fabrication.steps.find(item => item.id === selected) || fabrication.steps[0];
  const svg = useMemo(() => {
    if (!step || fabrication.errors.length || !current) return '';
    try { return fabricationSVG(project, result, { stepId: step.id }); } catch { return ''; }
  }, [project, result, step, fabrication.errors.length, current]);
  const change = (key, value) => onChange({ ...config, [key]: value, ...(['joinMethod', 'overlapMm', 'flangeMode', 'joinFlangeMm', 'segmentsPerContour', 'maxStripLengthMm'].includes(key) ? { joinConfirmed: false } : {}), ...(key === 'compensationMm' ? { compensationConfirmed: false } : {}) });
  const source = project.artwork?.mode === 'vector' ? `Arte importada · ${project.artwork.fileName}` : 'Texto convertido em contornos';
  const setup = <section className="lf-card"><div className="lf-heading"><div><small>REGRAS DE OFICINA</small><h3>União, divisão e compensação</h3></div></div><p>Defina como a borda será dividida e fechada. Campos vazios mantêm o desenvolvimento nominal.</p><div className="lf-fields">
    <label>União das laterais<select value={config.joinMethod} onChange={event => change('joinMethod', event.target.value)}>{FABRICATION_JOIN_METHODS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
    <NumberField label="Sobreposição por emenda (mm)" value={config.overlapMm} onChange={value => change('overlapMm', value)} />
    <NumberField label="Comprimento máximo da faixa (mm)" value={config.maxStripLengthMm} onChange={value => change('maxStripLengthMm', value)} />
    <NumberField label="Mínimo de faixas por contorno" value={config.segmentsPerContour} onChange={value => change('segmentsPerContour', value)} />
  </div><details open={!simple}><summary>Aba, compensação e procedimento</summary><div className="lf-fields">
    <NumberField label="Compensação total por contorno (mm)" value={config.compensationMm} onChange={value => change('compensationMm', value)} />
    <label>Aba de união<select value={config.flangeMode} onChange={event => change('flangeMode', event.target.value)}><option value="none">Sem aba adicional selecionada</option><option value="manual">Adicionar largura conforme procedimento</option></select></label>
    {config.flangeMode === 'manual' && <NumberField label="Largura adicional da aba (mm)" value={config.joinFlangeMm} onChange={value => change('joinFlangeMm', value)} />}
    <label>Procedimento / teste de oficina<input value={config.reference} onChange={event => onChange({ ...config, reference: event.target.value, joinConfirmed: false, compensationConfirmed: false })} placeholder="Referência que sustenta a união e compensação" /></label>
  </div><div className="lf-checks"><label><input type="checkbox" checked={config.joinConfirmed} onChange={event => change('joinConfirmed', event.target.checked)} />União e sobreposição conferidas com o procedimento</label><label><input type="checkbox" checked={config.compensationConfirmed} onChange={event => change('compensationConfirmed', event.target.checked)} />Compensação conferida com o procedimento</label></div></details>
  <p className="lf-note">Zero precisa ser informado quando aplicável. Divisões automáticas são iguais; posições manuais prevalecem. Cada faixa inclui sua sobreposição de fechamento. Aba não cria vinco ou alívio automaticamente.</p></section>;
  return <div className="lf-panel">
    <header className="lf-hero"><div><small>DA ARTE À EXPEDIÇÃO · R{project.revision}</small><h2>Planejamento de fabricação</h2><p>{source}</p></div><div className="lf-actions"><button onClick={() => onStage?.('text')}>Importar / conferir arte</button><button disabled={!current || !onExport || !!fabrication.errors.length} onClick={() => onExport?.('html', {})}>Caderno de fabricação</button></div></header>
    <div className={`lf-overview ${!current ? 'lf-recalculating' : ''}`}><div><small>Etapas previstas</small><strong>{fabrication.steps.length}</strong></div><div><small>Borda / profundidade</small><strong>{!project.construction.family.startsWith('flat-') ? `${mm(project.construction.depthMm)} mm` : 'Camadas planas'}</strong></div><div><small>Contornos / faixas</small><strong>{fabrication.totals.stripCount} / {fabrication.totals.segmentCount}</strong></div><div><small>Comprimento desenvolvido</small><strong>{mm(fabrication.totals.developedLengthMm)} mm</strong></div></div>
    <nav className="lf-view-tabs" aria-label="Visualização da fabricação">{[['steps', '1 · Etapas de fabricação'], ['borders', '2 · Bordas e emendas'], ['sheets', '3 · Plano de corte']].map(([id, label]) => <button key={id} aria-pressed={view === id} onClick={() => setView(id)}>{label}</button>)}</nav>
    {!current && <p role="status">Atualizando a geometria e os quantitativos desta revisão…</p>}
    {!!fabrication.errors.length && <div className="lf-card lf-issues" role="alert"><h3>Fabricação aguardando correção</h3>{fabrication.errors.map(message => <p key={message}>{message}</p>)}<button onClick={() => onChange({ ...config, seamsByStrip: {}, startOffsetsByStrip: {}, joinConfirmed: false })}>Reiniciar origens e emendas</button></div>}
    {config.resetReason && <p className="lf-revision-note">{config.resetReason}</p>}
    {view === 'steps' && <div className="lf-route-layout"><nav className="lf-route-nav" aria-label="Etapas de fabricação">{fabrication.steps.map(item => <button type="button" key={item.id} aria-pressed={step?.id === item.id} onClick={() => setSelected(item.id)}><span>{item.order}</span><div><strong>{item.title}</strong><small>{item.sector}</small></div></button>)}</nav>
      {step && <section className="lf-card lf-phase"><div className="lf-heading"><div><small>{step.sector}</small><h3>{step.order}. {step.title}</h3></div><span className="lf-state">Planejamento · não executado</span></div>
        <p className="lf-dependency">Depois de: {step.dependsOn.map(id => fabrication.steps.find(item => item.id === id)?.title).join(' · ') || 'conferência inicial do projeto'}.</p>
        <div className="lf-stage-io"><Checklist title="Receber / conferir" items={step.inputs} /><Checklist title="Entregar à próxima etapa" items={step.outputs} /></div>
        <h4 className="lf-section-label">Como preparar esta etapa</h4><ol className="lf-operations">{step.operations.map(operation => <li key={operation}>{operation}</li>)}</ol>
        <div className="lf-stage-io"><Checklist title="Conferências de qualidade" items={step.checks} /><Checklist title="Material e processo" items={step.materialNotes} /></div>
        <div className="lf-actions">{(step.id === 'forming' || step.id === 'joining') && <button onClick={() => setView('borders')}>Abrir bordas e emendas</button>}{step.id.startsWith('cut-') && <button onClick={() => setView('sheets')}>Ver peças nas chapas</button>}{step.id === 'lighting' && <button onClick={() => onStage?.('electric')}>Abrir LEDs e ligações</button>}{step.id === 'painting' && <button onClick={() => onStage?.('paint')}>Abrir pintura e cura</button>}{step.id === 'installation' && <button onClick={() => onStage?.('layout')}>Abrir layout e instalação</button>}</div>
        <details className="lf-stage-drawing"><summary>Desenho e IDs desta etapa · {step.componentIds.length} peça(s)</summary><div className="lf-drawing" aria-label={`Prancha 2D: ${step.title}`} dangerouslySetInnerHTML={{ __html: svg }} /><p className="lf-ids">{step.componentIds.join(' · ')}</p></details>
        {step.pending.length > 0 && <details className="lf-stage-pending"><summary>Conferências ainda necessárias · {step.pending.length}</summary><ul className="lf-issues">{step.pending.map(message => <li key={message}>{message}</li>)}</ul></details>}
        <div className="lf-actions"><button disabled={!current || !onExport || !!fabrication.errors.length} onClick={() => onExport?.('svg', { stepId: step.id })}>Baixar prancha da etapa</button>{fabrication.steps[step.order] && <button className="lf-next-step" onClick={() => setSelected(fabrication.steps[step.order].id)}>Próxima etapa →</button>}</div>
      </section>}
    </div>}
    {view === 'borders' && <>{!project.construction.family.startsWith('flat-') && setup}<BorderDevelopment project={project} result={result} fabrication={fabrication} config={config} onChange={onChange} onDepth={onDepth} current={current} onExport={current && !fabrication.errors.length ? onExport : null} /></>}
    {view === 'sheets' && <><div className="lf-card lf-heading"><p>O plano usa os contornos e as faixas desta revisão. Formato atual: {mm(project.stock.width)} × {mm(project.stock.length)} mm.</p><button onClick={() => onStage?.('cut')}>Ajustar chapa e refilo</button></div><CutPlanPanel project={project} result={result} fabrication={fabrication} nesting={nesting} onExport={onDocument} current={current} /></>}
    <p className="lf-note">Roteiro de preparação: não registra serviço concluído nem libera fabricação. A origem é a mesma para texto e arquivo importado; aprovações técnicas permanecem com o responsável.</p>
  </div>;
}
