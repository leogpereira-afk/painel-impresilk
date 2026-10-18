import { useState } from 'react';
import { Field, SelectField, TextField } from './ACMForms.jsx';
import { assemblyFaceGeometry, assemblyFaceSVG } from '../../lib/acm/documents.mjs';
import { fixingQuantities, isSafeFixingPhoto, resolveFixing, MAX_FIXING_PHOTO_CHARS } from '../../../supabase/functions/_shared/acm-fixing.mjs';
import './fixing-editor.css';

const labels = { front: 'Frente', left: 'Lateral esquerda', right: 'Lateral direita', soffit: 'Forro' };
const format = value => Number.isFinite(value) ? value.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '—';
function mergedDetails(base, partial) {
  const result = { ...base, ...partial };
  for (const key of ['pattern', 'screwProduct', 'tapeProduct']) if (base?.[key] || partial?.[key]) result[key] = { ...base?.[key], ...partial?.[key] };
  return result;
}
function ProductFields({ kind, product = {}, change, legacyName }) {
  const [error, setError] = useState('');
  const screw = kind === 'screwProduct';
  const set = (key, value) => change(kind, { ...product, [key]: value });
  async function photo(event) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    try {
      if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 374950) throw new Error('Selecione PNG ou JPEG até 365 kB. Reduza a foto antes de cadastrar.');
      const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
      if (dataUrl.length > MAX_FIXING_PHOTO_CHARS || !isSafeFixingPhoto(dataUrl)) throw new Error('Arquivo de foto inválido.');
      change(kind, { ...product, photoDataUrl: dataUrl, photoSource: file.name }); setError('');
    } catch (err) { setError(err.message || 'Não foi possível carregar a foto.'); }
  }
  return <details className="acm-details" open><summary>{screw ? 'Parafuso e arruela · cadastro do produto' : 'Fita · cadastro do produto'}</summary>
    <div className="acm-form-grid"><TextField label="Fabricante" value={product.manufacturer} onChange={v => set('manufacturer', v)} maxLength={200}/><TextField label="Código / referência comercial" value={product.code} onChange={v => set('code', v)} maxLength={200}/><TextField label="Nome do produto" value={product.name ?? legacyName} onChange={v => set('name', v)} maxLength={200}/><TextField label="Função na montagem" value={product.function} onChange={v => set('function', v)} placeholder="Ex.: ACM à estrutura" maxLength={300}/>
    {screw ? <><TextField label="Tipo de cabeça" value={product.head} onChange={v => set('head', v)}/><Field label="Diâmetro nominal do parafuso" value={product.nominalDiameter} onChange={v => set('nominalDiameter', v)}/><Field label="Comprimento do parafuso" value={product.length} onChange={v => set('length', v)}/><Field label="Diâmetro de furação especificado" value={product.drillDiameter} onChange={v => set('drillDiameter', v)} hint="Vazio: exporta apenas um ponto informativo. Não é deduzido do parafuso."/><TextField label="Material do parafuso" value={product.material} onChange={v => set('material', v)}/><TextField label="Revestimento / proteção" value={product.coating} onChange={v => set('coating', v)}/><Field label="Preço do parafuso" unit="R$/un" value={product.unitPrice} onChange={v => set('unitPrice', v)}/><TextField label="Arruela · material e dimensões" value={product.washer} onChange={v => set('washer', v)}/></> : <><Field label="Largura da fita" value={product.width} onChange={v => set('width', v)}/><Field label="Espessura da fita" value={product.thickness} onChange={v => set('thickness', v)}/><Field label="Comprimento do rolo" value={product.rollLength} onChange={v => set('rollLength', v)}/><Field label="Perda para compra" unit="%" value={product.wastePercent ?? 0} onChange={v => set('wastePercent', v)}/><Field label="Preço da fita por metro" unit="R$/m" value={product.pricePerM} onChange={v => set('pricePerM', v)}/><Field label="Preço do rolo" unit="R$/rolo" value={product.rollPrice} onChange={v => set('rollPrice', v)}/><TextField label="Preparação / limpeza / primer" value={product.preparation} onChange={v => set('preparation', v)}/><TextField label="Substratos e aplicação indicada" value={product.surface} onChange={v => set('surface', v)}/></>}
    </div><div className="acm-fixing-photo">{isSafeFixingPhoto(product.photoDataUrl) ? <><img src={product.photoDataUrl} alt={`Foto cadastrada: ${product.manufacturer || ''} ${product.code || product.name || 'produto'}`}/><p>Foto enviada pelo usuário · {product.photoSource || 'origem não informada'}</p><button type="button" onClick={() => change(kind, { ...product, photoDataUrl: '', photoSource: '' })}>Remover foto</button></> : <p>Foto real do produto não cadastrada.</p>}<label className="acm-field"><span>Adicionar foto real · PNG / JPEG até 365 kB</span><input type="file" accept="image/png,image/jpeg" onChange={photo}/></label><p className="acm-help">A foto identifica o produto cadastrado. Medidas, capacidade e espaçamento dependem de ficha técnica e conferência.</p>{error && <p className="acm-error" role="alert">{error}</p>}</div>
  </details>;
}

export function ProjectTitleBlock({ project, update }) {
  const block = project.titleBlock ?? {};
  return <details className="acm-details"><summary>Carimbo dos documentos</summary><div className="acm-form-grid">{[['drawingNumber', 'Número do desenho'], ['client', 'Cliente'], ['site', 'Obra / local'], ['designedBy', 'Elaborado por'], ['checkedBy', 'Conferido por'], ['revisionNotes', 'Descrição desta revisão']].map(([key, label]) => <TextField key={key} label={label} value={block[key]} onChange={v => update(`titleBlock.${key}`, v)} maxLength={300}/>)}<TextField label="Data do desenho" type="date" value={block.date} onChange={v => update('titleBlock.date', v)}/></div><p className="acm-help">Carimbo acompanha a revisão exportada. Campos vazios ficam identificados como não informados.</p></details>;
}

export default function FixingEditor({ project, result, update, selectedId }) {
  const [scope, setScope] = useState('all'), [surfaceId, setSurfaceId] = useState('front');
  const piece = result.pieces.find(p => p.id === selectedId), facePieces = result.pieces.filter(p => p.surface === surfaceId);
  const target = scope === 'piece' ? piece : scope === 'surface' ? facePieces[0] : null;
  const f = target ? resolveFixing(project, target) : project.fixing;
  const disabled = scope === 'piece' && !piece || scope === 'surface' && !facePieces.length;
  function change(key, value) {
    if (disabled) return;
    if (scope === 'all') { update('fixing', { ...project.fixing, [key]: value, validated: key === 'validated' ? value : false }); return; }
    const ids = scope === 'piece' ? [piece.id] : facePieces.map(p => p.id);
    const overrides = { ...project.overrides };
    for (const id of ids) {
      const current = overrides[id] ?? {};
      const partial = { [key]: value, validated: key === 'validated' ? value : false };
      overrides[id] = { ...current, fixing: mergedDetails(current.fixing, partial) };
    }
    update('overrides', overrides);
  }
  const pattern = f.pattern ?? {}, setPattern = (key, value) => change('pattern', { ...pattern, [key]: value });
  const scopePieces = scope === 'piece' ? piece ? [piece] : [] : scope === 'surface' ? facePieces : result.pieces;
  const scopeIds = new Set(scopePieces.map(p => p.id));
  const quantities = fixingQuantities(result).filter(g => scopeIds.has(g.pieceId));
  const total = quantities.reduce((a, g) => ({ screws: a.screws + g.screws, tapeLength: a.tapeLength + g.tapeLength, tapeBands: a.tapeBands + g.tapeBands }), { screws: 0, tapeLength: 0, tapeBands: 0 });
  const tapeProduct = { width: f.tapeWidth, thickness: f.thickness, ...f.tapeProduct };
  const rollLength = tapeProduct.rollLength, buyLength = total.tapeLength * (1 + (tapeProduct.wastePercent ?? 0) / 100);
  const surface = result.surfaces.find(s => s.id === (scope === 'piece' ? piece?.surface : surfaceId));
  const geometry = surface ? assemblyFaceGeometry(surface, result) : null;
  return <div className="acm-fixing-editor"><h3>Fixações e produtos</h3><SelectField label="Aplicar alterações a" value={scope} onChange={setScope} options={[{ value: 'all', label: 'Padrão do projeto' }, { value: 'surface', label: 'Todas as peças desta face' }, { value: 'piece', label: 'Peça selecionada' }]}/>{scope === 'surface' && <><SelectField label="Face / região" value={surfaceId} onChange={setSurfaceId} options={result.surfaces.map(s => ({ value: s.id, label: s.label }))}/><p className="acm-help">Aplica a {facePieces.length} peças atuais desta face. Ao remodular, confira as novas peças.</p></>}{scope === 'piece' && <p>{piece ? `Peça ${piece.id} · ${labels[piece.surface]}` : 'Selecione uma peça no desenho.'}</p>}
    <fieldset disabled={disabled}><SelectField label="Sistema de fixação" value={f.type} onChange={v => change('type', v)} options={[{ value: 'tape', label: 'Fita' }, { value: 'screws', label: 'Parafusos' }, { value: 'hybrid', label: 'Híbrido · fita e parafusos' }]}/>
    <details className="acm-details" open><summary>Distribuição geométrica e critérios</summary><div className="acm-form-grid"><Field label="Passo máximo configurado · estudo" value={pattern.maxPitch ?? f.screwPitch} onChange={v => setPattern('maxPitch', v)} min={.1}/><Field label="Afastamento de borda / canto" value={pattern.cornerOffset ?? f.edgeOffset} onChange={v => setPattern('cornerOffset', v)}/><Field label="Distância mínima à borda · ficha" value={pattern.minEdgeDistance} onChange={v => setPattern('minEdgeDistance', v)}/><TextField label="Restrições / movimentação / interferências" value={pattern.constraints} onChange={v => setPattern('constraints', v)}/><TextField label="Fonte técnica do padrão" value={pattern.source} onChange={v => setPattern('source', v)}/><TextField label="Responsável pela conferência" value={pattern.responsible} onChange={v => setPattern('responsible', v)}/><TextField label="Data da conferência" type="date" value={pattern.validatedAt} onChange={v => setPattern('validatedAt', v)}/></div><label className="acm-check"><input type="checkbox" checked={f.validated === true} disabled={!pattern.source?.trim() || !pattern.responsible?.trim() || !pattern.validatedAt} onChange={e => change('validated', e.target.checked)}/>Conferência do padrão registrada</label><p className="acm-help">O passo limita a distribuição gerada; não determina capacidade de carga. Conferência do padrão e dimensionamento estrutural são independentes.</p></details>
    {f.type !== 'tape' && <ProductFields kind="screwProduct" product={f.screwProduct} legacyName={f.product} change={change}/>}
    {f.type !== 'screws' && <ProductFields kind="tapeProduct" product={tapeProduct} legacyName={f.product} change={change}/>}
    </fieldset><h4>Quantidade gerada neste escopo</h4><p>{total.screws} parafusos · {total.tapeBands} faixas · {format(total.tapeLength / 1000)} m de fita</p>{f.type !== 'screws' && <p className="acm-help">Fita com perda: {format(buyLength / 1000)} m. {rollLength > 0 ? `${Math.ceil(buyLength / rollLength)} rolos de ${format(rollLength / 1000)} m (produto mostrado; confira variantes por peça).` : 'Comprimento comercial do rolo não informado.'}</p>}
    {geometry && <details className="acm-details"><summary>Mapa · {surface.label}</summary><div className="acm-fixing-map" dangerouslySetInnerHTML={{ __html: assemblyFaceSVG(surface, geometry) }}/><p className="acm-help">Referência frontal da face, apoios por transparência. Verde: fita; laranja: pontos. Diâmetros são informados na ficha Router.</p></details>}
    <details className="acm-details"><summary>Contagem por função e apoio · {quantities.length} grupos</summary><div className="acm-fixing-table"><table><thead><tr><th>Peça / apoio</th><th>Função</th><th>Parafusos</th><th>Fita (m)</th></tr></thead><tbody>{quantities.slice(0, 150).map(g => <tr key={`${g.pieceId}-${g.supportId}-${g.role}`}><td>{g.pieceId}<small>{g.supportId}</small></td><td>{g.role}</td><td>{g.screws}</td><td>{format(g.tapeLength / 1000)}</td></tr>)}</tbody></table></div>{quantities.length > 150 && <p>Prévia limitada a 150 grupos. O caderno contém todos os grupos.</p>}</details>
  </div>;
}
