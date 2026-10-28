import {useEffect, useMemo, useRef, useState} from 'react';
import {ArrowLeft, Download, Printer, Save} from 'lucide-react';
import {getSessao} from '../lib/sessao.js';
import {createFabricationStorage} from '../lib/fabrication/storage.mjs';
import {createPrintProject, validatePrintProject, geometrySignature, PRINTER_PROFILES, LIMITS} from '../lib/impressao3d/model.mjs';
import {createPrintClient} from '../lib/impressao3d/client.mjs';
import {partSTL, frontSVG, projectReportJSON} from '../lib/impressao3d/exports.mjs';
import {PRINT_LICENSES_URL} from '../lib/impressao3d/notices.mjs';
import {getPending, keepPending, clearPending, finishPendingSave, trackOwnerSave, waitForOwnerSave} from './impressao3d-session.mjs';
import PrintViewport from '../components/impressao3d/PrintViewport.jsx';
import './Impressao3D.css';

const fmt = n => new Intl.NumberFormat('pt-BR', {maximumFractionDigits:2}).format(n);
const dimensions = values => values.map(fmt).join(' × ');
const fileName = value => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 100) || 'projeto';
const parameterNames = {height:'Altura do texto', depth:'Profundidade', wall:'Parede', floor:'Fundo', front:'Frente de acrílico', support:'Largura do apoio', supportHeight:'Altura do apoio', clearancePerSide:'Folga por lado'};
function download(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], {type}));
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function NumberField({label, value, onChange}) {
  return <label className="p3d-field"><span>{label} <small>mm</small></span><input type="number" step="any" value={value} onChange={event => onChange(event.target.value === '' ? '' : Number(event.target.value))}/></label>;
}

export default function Impressao3D({onBack}) {
  const owner = getSessao()?.usuario;
  const storage = useMemo(() => createFabricationStorage({product:'impressao-3d', validate:validatePrintProject}), []);
  const [project, setProject] = useState(createPrintProject);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedSignature, setSavedSignature] = useState('');
  const [message, setMessage] = useState('Carregando rascunho local…');
  const client = useRef(null), generation = useRef(0), fileRead = useRef(0), version = useRef(0), mounted = useRef(false), savePending = useRef(false);
  const projectRef = useRef(project); projectRef.current = project;
  const sessionSnapshot = useRef(null);
  sessionSnapshot.current = {project, savedSignature, storageError, version:version.current, loaded};
  let signature = '', invalid = '';
  try { signature = geometrySignature(project); } catch (err) { invalid = err.message; }
  const current = Boolean(result && signature && result.signature === signature);
  const dirty = signature !== savedSignature || !signature;

  useEffect(() => {
    mounted.current = true;
    const generationRef = generation, fileReadRef = fileRead;
    client.current = createPrintClient();
    let active = true;
    waitForOwnerSave(owner).then(() => storage.load(owner)).then(draft => {
      if (!active) return;
      const pending = getPending(owner);
      if (pending) {
        clearPending(owner);
        version.current = pending.version; setProject(pending.project); setSavedSignature(pending.savedSignature); setStorageError(pending.storageError);
        setLoaded(true); setMessage('Edição pendente recuperada desta sessão. Salve para preservar ao recarregar.'); return;
      }
      version.current = draft?.version || 0;
      if (draft) { const p = validatePrintProject(draft.project); setProject(p); setSavedSignature(geometrySignature(p)); }
      setLoaded(true); setMessage(draft ? 'Rascunho recuperado deste navegador.' : 'Novo projeto. Use Salvar rascunho para guardar neste navegador.');
    }).catch(err => { if (active) { const pending = owner ? getPending(owner) : null; if (pending) { setProject(pending.project); setSavedSignature(pending.savedSignature); version.current = pending.version; } setStorageError(err.message); setLoaded(true); setMessage('Salvamento indisponível. Você pode exportar uma cópia JSON.'); } });
    return () => {
      active = false; mounted.current = false; generationRef.current++; fileReadRef.current++; client.current?.dispose();
      if (owner) keepPending(owner, sessionSnapshot.current);
    };
  }, [storage, owner]);

  useEffect(() => {
    if (!dirty || !loaded) return;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, loaded]);

  function invalidate() {
    generation.current++; fileRead.current++; client.current?.cancel();
    setBusy(false); setReading(false); setResult(null); setError('');
  }
  function edit(change) {
    invalidate();
    setProject(previous => ({...change(previous), revision:previous.revision + 1}));
    setMessage('Alterações ainda não salvas. Gere novamente para atualizar as peças.');
  }
  const parameter = (key, value) => edit(p => ({...p, parameters:{...p.parameters, [key]:value}}));
  async function generate() {
    invalidate(); const token = generation.current;
    setBusy(true); setMessage('Gerando e conferindo as peças…');
    try {
      const next = await client.current.generate(projectRef.current);
      if (!mounted.current || token !== generation.current) return;
      setResult(next); setMessage(`${next.parts.length} peças geradas. Verificação digital concluída.`);
    } catch (err) {
      if (mounted.current && token === generation.current && err.code !== 'CANCELLED') { setError(err.message); setMessage('O modelo não foi liberado para exportação.'); }
    } finally { if (mounted.current && token === generation.current) setBusy(false); }
  }
  async function save() {
    if (!loaded || storageError || savePending.current) return;
    savePending.current = true; setSaving(true);
    try {
      const p = validatePrintProject(projectRef.current);
      const expectedVersion = version.current;
      await trackOwnerSave(owner, storage.save(owner, p, expectedVersion).then(next => {
        finishPendingSave(owner, expectedVersion, p, next.version);
        version.current = next.version;
        return next;
      }));
      if (!mounted.current) return;
      setSavedSignature(geometrySignature(p));
      let stillCurrent = false;
      try { stillCurrent = geometrySignature(projectRef.current) === geometrySignature(p); } catch { /* An incomplete edit must not turn a successful save into a storage failure. */ }
      setMessage(stillCurrent ? 'Rascunho salvo neste navegador, para sua conta.' : 'Versão anterior salva. Há novas alterações pendentes.');
    } catch (err) { if (mounted.current) { setStorageError(err.message); setMessage('Não foi possível salvar. Exporte sua cópia antes de recarregar.'); } }
    finally { savePending.current = false; if (mounted.current) setSaving(false); }
  }
  async function reloadSaved() {
    invalidate(); setLoaded(false); setStorageError('');
    try {
      const draft = await storage.load(owner);
      if (!mounted.current) return;
      const p = draft ? validatePrintProject(draft.project) : createPrintProject();
      version.current = draft?.version || 0; setProject(p); setSavedSignature(draft ? geometrySignature(p) : ''); setMessage('Rascunho local recarregado.');
    } catch (err) { if (mounted.current) setStorageError(err.message); }
    finally { if (mounted.current) setLoaded(true); }
  }
  async function readFile(file, backup = false) {
    if (!file) return;
    invalidate(); const token = fileRead.current;
    if (file.size > (backup ? 1024 * 1024 : LIMITS.fileBytes)) { setError(backup ? 'Projeto JSON acima de 1 MiB.' : 'Arquivo acima de 256 KiB.'); return; }
    setReading(true);
    try {
      const content = await file.text();
      if (!mounted.current || token !== fileRead.current) return;
      if (backup) setProject(validatePrintProject(storage.parse(content)));
      else {
        const kind = file.name.split('.').pop().toLowerCase();
        if (!['svg', 'dxf'].includes(kind)) throw Error('Selecione um arquivo SVG ou DXF.');
        setProject(p => ({...p, revision:p.revision + 1, source:{kind, content, name:file.name}}));
      }
      setMessage('Arquivo carregado. Gere o modelo para conferir a geometria.');
    } catch (err) { if (mounted.current && token === fileRead.current) setError(`Arquivo não aberto: ${err.message}`); }
    finally { if (mounted.current && token === fileRead.current) setReading(false); }
  }
  function exportFile(action) { try { action(); setError(''); } catch (err) { setError(err.message); } }
  function leave() {
    onBack();
  }

  return <div className="p3d" data-testid="print-page">
    <header className="p3d-heading"><div><button type="button" className="p3d-back" onClick={leave}><ArrowLeft size={16}/> Ferramenta I.A</button><h1><Printer size={26}/> Impressão 3D <span>Piloto</span></h1><p>Letras caixa com corpo, fundo integrado e apoio para frente de acrílico.</p></div><div className="p3d-project-actions"><button type="button" onClick={save} disabled={!loaded || saving || Boolean(storageError) || Boolean(invalid)}><Save size={16}/>{saving ? 'Salvando…' : 'Salvar rascunho'}</button><button type="button" disabled={!loaded || Boolean(invalid)} onClick={() => exportFile(() => download(storage.serialize(validatePrintProject(project)), `${fileName(project.name)}.json`, 'application/json'))}>Exportar projeto JSON</button><label className="p3d-file-button">Abrir projeto JSON<input aria-label="Abrir projeto JSON" type="file" accept=".json,application/json" disabled={!loaded || reading} onChange={e => {readFile(e.target.files[0], true); e.target.value = '';}}/></label></div></header>
    <div className="p3d-status" role="status">{message}{loaded && <span>{dirty ? ' • Edição pendente' : ' • Salvo'}</span>}</div>
    {storageError && <div className="p3d-error" role="alert"><strong>Rascunho preservado</strong><p>{storageError}</p><button type="button" disabled={saving || !loaded} onClick={reloadSaved}>Recarregar salvo e descartar edição atual</button></div>}
    {error && <div className="p3d-error" role="alert">{error}</div>}
    <div className="p3d-layout">
      <fieldset className="p3d-editor" disabled={!loaded}>
        <section className="p3d-card"><h2>1. Desenho</h2><label className="p3d-field">Nome do projeto<input maxLength={100} value={project.name} onChange={e => edit(p => ({...p, name:e.target.value}))}/></label>
          <label className="p3d-field">Origem<select value={project.source.kind === 'text' ? 'text' : 'file'} onChange={e => edit(p => ({...p, source:e.target.value === 'text' ? {kind:'text', text:'A', font:'helvetiker'} : {kind:'svg', content:'', name:'Selecione um arquivo.svg'}}))}><option value="text">Digitar texto</option><option value="file">Importar SVG ou DXF</option></select></label>
          {project.source.kind === 'text' ? <><label className="p3d-field">Texto<input value={project.source.text} maxLength={64} onChange={e => edit(p => ({...p, source:{...p.source, text:e.target.value}}))}/><small>Até 32 caracteres. Cada ilha do desenho vira uma peça.</small></label><label className="p3d-field">Fonte<select value={project.source.font} onChange={e => edit(p => ({...p, source:{...p.source, font:e.target.value}}))}><option value="helvetiker">Helvetiker · sem serifa</option><option value="gentilis">Gentilis · com serifa</option></select></label></> : <><label className="p3d-field">Arquivo vetorial<input type="file" accept=".svg,.dxf" disabled={reading} onChange={e => {readFile(e.target.files[0]); e.target.value = '';}}/></label><p className="p3d-hint">{project.source.content ? project.source.name : 'Selecione um arquivo com medidas físicas explícitas.'}</p><details><summary>Formatos aceitos neste piloto</summary><p>SVG: um caminho fechado, com largura e altura em mm. Furos em caminho composto com regra par–ímpar. Aceita transformação matrix no caminho; sem imagens, texto, grupos ou traços de corte.</p><p>DXF: polilinhas LWPOLYLINE fechadas, retas, unidade INSUNITS explícita; apenas HEADER e ENTITIES. Exporte um arquivo simplificado, sem blocos ou tabelas.</p><p>Limite: 256 KiB. A escala do arquivo é preservada; recursos não aceitos são apontados ao gerar.</p></details></>}
        </section>
        <section className="p3d-card"><h2>2. Construção <small>milímetros</small></h2><div className="p3d-fields">{(project.source.kind === 'text' ? ['height','depth','wall','front'] : ['depth','wall','front']).map(key => <NumberField key={key} label={parameterNames[key]} value={project.parameters[key]} onChange={value => parameter(key,value)}/>)}</div><details><summary>Fundo, apoio e folga</summary><div className="p3d-fields">{['floor','support','supportHeight','clearancePerSide'].map(key => <NumberField key={key} label={parameterNames[key]} value={project.parameters[key]} onChange={value => parameter(key,value)}/>)}</div><p>A folga é aplicada de cada lado. Confira o encaixe em uma amostra antes da produção.</p></details></section>
        <section className="p3d-card"><h2>3. Impressora</h2><label className="p3d-field">Perfil<select value={PRINTER_PROFILES.some(p => p.id === project.bed.id && p.x === project.bed.x && p.y === project.bed.y && p.z === project.bed.z) ? project.bed.id : 'imported'} onChange={e => edit(p => ({...p, bed:{...PRINTER_PROFILES.find(profile => profile.id === e.target.value)}}))}>{PRINTER_PROFILES.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}<option value="imported" disabled>Perfil do projeto importado</option></select></label><p className="p3d-hint">Volume nominal: {dimensions([project.bed.x,project.bed.y,project.bed.z])} mm. Margem XY inicial de 5 mm adotada para o piloto.</p><NumberField label="Margem em cada borda XY" value={project.bed.margin} onChange={value => edit(p => ({...p, bed:{...p.bed, margin:value}}))}/><label className="p3d-field">Material do corpo<select value={project.material} onChange={e => edit(p => ({...p,material:e.target.value}))}><option value="not-informed">Ainda não informado</option>{['PLA','PETG','ASA','ABS'].map(material => <option key={material}>{material}</option>)}<option value="other">Outro material</option></select></label><p className="p3d-hint">O perfil confere o volume disponível. Temperatura, suportes e orientação final serão definidos no fatiador.</p></section>
        {invalid && <p className="p3d-invalid" role="status">{invalid}</p>}
        <div className="p3d-generate"><button className="p3d-primary" type="button" disabled={busy || reading || Boolean(invalid)} onClick={generate}>{busy ? 'Gerando…' : 'Gerar e conferir 3D'}</button>{busy && <button type="button" onClick={() => {invalidate(); setMessage('Geração cancelada.');}}>Cancelar</button>}</div>
      </fieldset>
      <main className="p3d-output"><PrintViewport result={current ? result : null} printer={project.bed}/>
        {current ? <section className="p3d-card p3d-results" data-testid="print-results"><div className="p3d-result-heading"><div><h2>Peças e arquivos</h2><p>{result.parts.length} peças · conjunto {dimensions(result.dimensionsMm)} mm</p></div><button type="button" onClick={() => exportFile(() => download(projectReportJSON(project,result), `${fileName(project.name)}-conferencia.json`, 'application/json'))}><Download size={16}/>Relatório JSON</button></div>
          <p className={result.bedFit.allFit ? 'p3d-fit' : 'p3d-invalid'}>{result.bedFit.allFit ? 'Todas as peças cabem individualmente no volume configurado.' : 'Há peças maiores que o volume configurado. Seus STLs estão bloqueados.'} A conferência usa a orientação atual, sem rotação ou distribuição automática na mesa.</p>
          <div className="p3d-parts">{result.parts.map(part => {const fits = result.bedFit.parts.find(check => check.id === part.id)?.fits; return <article className="p3d-part" key={part.id}><div><strong>{part.label}</strong><span>{dimensions(part.dimensionsMm)} mm</span><small>{fits ? 'Cabe individualmente' : 'Excede o volume'}{part.role === 'front' ? ' · acrílico nominal' : ' · fundo integrado'}</small></div><div className="p3d-part-actions"><button type="button" disabled={!fits} onClick={() => exportFile(() => download(partSTL(project,result,part.id), `${fileName(project.name)}-${part.id}.stl`, 'model/stl'))}>{part.role === 'front' ? 'STL para inspeção' : 'Baixar STL do corpo'}</button>{part.role === 'front' && <button type="button" onClick={() => exportFile(() => download(frontSVG(project,result,part.id), `${fileName(project.name)}-${part.id}.svg`, 'image/svg+xml'))}>SVG para corte</button>}</div></article>;})}</div>
          <details className="p3d-checks"><summary>O que foi conferido e o que falta validar</summary><ul>{result.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul><p>STL: coordenadas em milímetros; cada peça começa em XYZ mínimo zero. A frente SVG representa a medida nominal sem compensação da largura do corte.</p></details>
        </section> : <section className="p3d-card p3d-empty"><h2>Do desenho às peças</h2><p>Defina o texto ou importe um vetor, ajuste a construção e gere a prévia. Os arquivos só ficam disponíveis para a configuração conferida.</p><p>Este piloto entrega corpo STL, frente nominal SVG e relatório. O ensaio na impressora ainda está pendente.</p></section>}
        <p className="p3d-hint"><a href={PRINT_LICENSES_URL} target="_blank" rel="noreferrer">Licenças do motor e das fontes</a></p>
      </main>
    </div>
  </div>;
}
