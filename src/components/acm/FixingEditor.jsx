import { useState } from 'react';
import { Field, SelectField, TextField } from './ACMForms.jsx';
import { assemblyFaceGeometry, assemblyFaceSVG, documentGeometry } from '../../lib/acm/documents.mjs';
import { fixingQuantities, isSafeFixingPhoto, resolveFixing, MAX_FIXING_PHOTO_CHARS } from '../../../supabase/functions/_shared/acm-fixing.mjs';
import { edgeFolds } from '../../lib/acm/model.mjs';
import { PieceDrawing } from './ACMViews.jsx';
import './fixing-editor.css';

const edgeLabels = {left:'Esquerda',right:'Direita',top:'Superior',bottom:'Inferior'};
const supportLabel = group => group.supportStatus === 'unverified' || group.role?.startsWith('Aba →') ? 'Cantoneira a detalhar · apoio não verificado' : group.supportId || 'Apoio não informado';
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
  return <details className="acm-details"><summary>{screw ? 'Parafuso e arruela · produto e detalhes' : 'Fita · produto e detalhes'}<small>{product.code||product.name||'Produto não identificado'}{screw?(product.drillDiameter?` · Ø ${format(product.drillDiameter)} mm`:' · Ø de furação não informado'):` · ${format(product.width)} × ${format(product.thickness)} mm`}</small></summary>
    <div className="acm-form-grid"><TextField label="Fabricante" value={product.manufacturer} onChange={v => set('manufacturer', v)} maxLength={200}/><TextField label="Código / referência comercial" value={product.code} onChange={v => set('code', v)} maxLength={200}/><TextField label="Nome do produto" value={product.name ?? legacyName} onChange={v => set('name', v)} maxLength={200}/><TextField label="Função na montagem" value={product.function} onChange={v => set('function', v)} placeholder={screw?'Ex.: aba à cantoneira (a detalhar)':'Ex.: ACM ao apoio'} maxLength={300}/>
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
  const f = resolveFixing(project, target ?? {});
  const rawFixing = target ? mergedDetails(project.fixing, project.overrides?.[target.id]?.fixing ?? {}) : project.fixing;
  const legacySignoff = ['screws','hybrid'].includes(rawFixing.type) && rawFixing.validated === true && rawFixing.pattern?.surface !== 'flange';
  const disabled = scope === 'piece' && !piece || scope === 'surface' && !facePieces.length;
  function change(key, value) {
    if (disabled) return;
    if (scope === 'all') {
      const next = { ...project.fixing, [key]: value, validated: key === 'validated' ? value : false };
      if (key === 'screwProduct' && Object.hasOwn(value ?? {},'drillDiameter')) next.drillDiameter = null;
      if (key === 'validated' && value === true) next.pattern = { ...project.fixing.pattern, surface:'flange' };
      update('fixing', next); return;
    }
    const ids = scope === 'piece' ? [piece.id] : facePieces.map(p => p.id);
    const overrides = { ...project.overrides };
    for (const id of ids) {
      const current = overrides[id] ?? {};
      const partial = { [key]: value, validated: key === 'validated' ? value : false };
      if (key === 'screwProduct' && Object.hasOwn(value ?? {},'drillDiameter')) partial.drillDiameter = null;
      if (key === 'validated' && value === true) partial.pattern = { ...resolveFixing(project,{id}).pattern, surface:'flange' };
      overrides[id] = { ...current, fixing: mergedDetails(current.fixing, partial) };
    }
    update('overrides', overrides);
  }
  const pattern = f.pattern ?? {}, setPattern = (key, value) => change('pattern', { ...pattern, surface:'flange', [key]: value });
  const edgeDefinitions = target?.edgeDefinitions ?? { ...project.edges, ...project.overrides?.[target?.id]?.edges };
  const setFlangeFold = (edge, value) => setPattern('flangeFoldByEdge', {...pattern.flangeFoldByEdge,[edge]:Number(value)});
  const scopePieces = scope === 'piece' ? piece ? [piece] : [] : scope === 'surface' ? facePieces : result.pieces;
  const scopeIds = new Set(scopePieces.map(p => p.id));
  const quantities = fixingQuantities(result).filter(g => scopeIds.has(g.pieceId));
  const total = quantities.reduce((a, g) => ({ screws: a.screws + g.screws, tapeLength: a.tapeLength + g.tapeLength, tapeBands: a.tapeBands + g.tapeBands }), { screws: 0, tapeLength: 0, tapeBands: 0 });
  const tapeProduct = { width: f.tapeWidth, thickness: f.thickness, ...f.tapeProduct };
  const rollLength = tapeProduct.rollLength, buyLength = total.tapeLength * (1 + (tapeProduct.wastePercent ?? 0) / 100);
  const hasScrews = f.type !== 'tape', hasTape = f.type !== 'screws';
  const flangeSummary = Object.entries(edgeLabels).map(([edge,label])=>`${label}: ${(pattern.flangeFoldByEdge?.[edge]??1)===0?'sem furação':`D${pattern.flangeFoldByEdge?.[edge]??1}`}`).join(' · ');
  const missingFlanges = hasScrews&&!project.technicalDrawing?Object.entries(edgeLabels).filter(([edge])=>{const selectedNumber=pattern.flangeFoldByEdge?.[edge]??1;return selectedNumber>0&&!edgeFolds(edgeDefinitions[edge])[selectedNumber-1]}).map(([,label])=>label):[];
  const referenceComplete = !!pattern.source?.trim()&&!!pattern.responsible?.trim()&&!!pattern.validatedAt;
  const systemChoices = [{value:'screws',label:'Parafusos',hint:'Pontos somente nas abas'},{value:'tape',label:'Fita',hint:'Faixas no apoio do painel'},{value:'hybrid',label:'Híbrido',hint:'Fita + parafusos nas abas'}];
  return <div className="acm-fixing-editor">
    <h3>Fixação da bandeja</h3>
    <div className="acm-fixing-scope-summary"><strong>{total.screws} parafusos</strong><strong>{total.tapeBands} faixas · {format(total.tapeLength / 1000)} m de fita</strong><small>Quantidade gerada no escopo escolhido</small></div>
    <SelectField label="Aplicar alterações a" value={scope} onChange={setScope} options={[{ value: 'all', label: 'Padrão do projeto' }, { value: 'surface', label: 'Todas as peças desta face' }, { value: 'piece', label: 'Peça selecionada' }]}/>
    {scope === 'surface' && <><SelectField label="Face / região" value={surfaceId} onChange={setSurfaceId} options={result.surfaces.map(item => ({ value: item.id, label: item.label }))}/><p className="acm-help">Aplica a {facePieces.length} peças atuais desta face. Ao remodular, confira as novas peças.</p></>}
    {scope === 'piece' && <p className="acm-help">{piece ? `Peça ${piece.id} · ${labels[piece.surface]}` : 'Selecione uma peça no desenho.'}</p>}
    {legacySignoff&&<p className="acm-notice">A conferência anterior requer revisão: a distribuição agora usa as abas. Confira o novo padrão antes de registrar novamente.</p>}
    <fieldset disabled={disabled}>
      <div className="acm-fixing-choices" role="group" aria-label="Sistema de fixação">{systemChoices.map(choice=><button key={choice.value} type="button" aria-pressed={f.type===choice.value} onClick={()=>{if(choice.value!==f.type)change('type',choice.value)}}><strong>{choice.label}</strong><small>{choice.hint}</small></button>)}</div>
      <div className="acm-fixing-essentials">
        {hasScrews&&<><h4>Posição dos furos</h4><div className="acm-form-grid"><Field label="Distância máxima entre furos" value={pattern.maxPitch ?? f.screwPitch} onChange={value=>setPattern('maxPitch',value)} min={.1}/><Field label="Distância do furo ao canto" value={pattern.cornerOffset ?? f.edgeOffset} onChange={value=>setPattern('cornerOffset',value)}/><Field label="Diâmetro do furo" value={f.drillDiameter} onChange={value=>change('screwProduct',{...f.screwProduct,drillDiameter:value})} hint="Vazio: somente posição informativa, sem Ø deduzido do parafuso."/></div><p className="acm-help">Parafusos somente nas abas. A face aparente permanece sem furos automáticos; cantoneiras e apoios ainda precisam de detalhe.</p></>}
        {hasTape&&<><h4>Medidas da fita</h4><div className="acm-form-grid"><Field label="Largura da fita" value={tapeProduct.width} onChange={value=>change('tapeProduct',{...tapeProduct,width:value})}/><Field label="Espessura da fita" value={tapeProduct.thickness} onChange={value=>change('tapeProduct',{...tapeProduct,thickness:value})}/></div></>}
      </div>
      {!!missingFlanges.length&&<p className="acm-notice"><strong>Sem faixa válida na referência: {missingFlanges.join(', ')}.</strong> Essas bordas não geram furação automática. Confira as abas e operações escolhidas.</p>}
      {project.technicalDrawing&&<p className="acm-notice">O desenho técnico permanece plano. Furos explícitos do arquivo são preservados; este modo não cria abas ou furação automática na face.</p>}
      {hasScrews&&!project.technicalDrawing&&<details className="acm-details acm-fixing-advanced"><summary>Abas e operações de dobra<small>{flangeSummary}{pattern.flangeOffset!=null?` · posição na faixa: ${format(pattern.flangeOffset)} mm`:' · posição no centro da faixa'}</small></summary><section className="acm-flange-settings"><h4>Parafusos somente nas abas</h4><p>Escolha a faixa desenvolvida de cada borda. Zero desativa a furação naquela borda.</p><div className="acm-form-grid">{Object.entries(edgeLabels).map(([edge,label])=>{const operations=edgeFolds(edgeDefinitions[edge]),selectedNumber=pattern.flangeFoldByEdge?.[edge]??1;return <div className="acm-flange-edge" key={edge}><SelectField label={`Aba ${label.toLowerCase()} · operação de dobra`} value={selectedNumber} onChange={value=>setFlangeFold(edge,value)} options={[{value:0,label:'Sem furação nesta borda'},...[1,2,3,4].map(number=>({value:number,label:`Operação ${number}${operations[number-1]?` · segmento nominal ${format(operations[number-1].length)} mm`:' · não existe nesta referência'}`}))]}/><small>{operations.length?`${operations.length} operação(ões) nesta referência. ${selectedNumber>operations.length?'Operação ausente: não há faixa disponível para furar.':''}`:'Borda sem aba: não gera furação automática.'}</small></div>})}<Field label="Posição transversal na aba · desde o início da faixa" value={pattern.flangeOffset} onChange={value=>setPattern('flangeOffset',value)} hint="Vazio: centro da faixa desenvolvida. Valor em mm a partir do eixo inicial da operação, no sentido da borda cortada."/></div><p className="acm-help">Referência mostrada: {target?.id??'padrão do projeto'}. Em configurações por projeto ou face, confira também as variações individuais. As bordas seguem a referência do projeto; esquerda e direita aparecem espelhadas no verso. A cantoneira, o contato e a ancoragem ainda precisam de detalhamento.</p></section></details>}
      <details className="acm-details acm-fixing-advanced"><summary>Especificação e restrições técnicas<small>{referenceComplete?`Fonte registrada · ${pattern.responsible} · ${pattern.validatedAt}`:'Fonte, responsável ou data pendentes'}</small></summary><div className="acm-form-grid"><Field label="Distância mínima à borda · ficha" value={pattern.minEdgeDistance} onChange={value=>setPattern('minEdgeDistance',value)}/><TextField label="Restrições / movimentação / interferências" value={pattern.constraints} onChange={value=>setPattern('constraints',value)}/><TextField label="Fonte técnica do padrão" value={pattern.source} onChange={value=>setPattern('source',value)}/><TextField label="Responsável pela conferência" value={pattern.responsible} onChange={value=>setPattern('responsible',value)}/><TextField label="Data da conferência" type="date" value={pattern.validatedAt} onChange={value=>setPattern('validatedAt',value)}/></div></details>
      <div className="acm-fixing-validation"><label className="acm-check"><input type="checkbox" checked={f.validated === true} disabled={!referenceComplete} onChange={event=>change('validated',event.target.checked)}/>Conferência do padrão registrada</label>{!referenceComplete&&<p>Para registrar, informe fonte, responsável e data em Especificação técnica.</p>}<p>Passo, afastamento e quantidades não comprovam apoio ou capacidade de carga. Este registro não dimensiona cantoneiras, estrutura ou ancoragem.</p></div>
      {hasScrews&&<ProductFields kind="screwProduct" product={{...f.screwProduct,drillDiameter:f.drillDiameter}} legacyName={f.product} change={change}/>}
      {hasTape&&<ProductFields kind="tapeProduct" product={tapeProduct} legacyName={f.product} change={change}/>}
    </fieldset>
    {hasTape&&<p className="acm-help">Fita para compra, incluindo perda: {format(buyLength/1000)} m. {rollLength>0?`${Math.ceil(buyLength/rollLength)} rolos de ${format(rollLength/1000)} m (produto deste escopo; confira variantes por peça).`:'Comprimento comercial do rolo não informado.'}</p>}
    <details className="acm-details"><summary>Contagem por função e apoio · {quantities.length} grupos</summary><div className="acm-fixing-table"><table><thead><tr><th>Peça / apoio</th><th>Função</th><th>Parafusos</th><th>Fita (m)</th></tr></thead><tbody>{quantities.slice(0,150).map(group=><tr key={`${group.pieceId}-${group.supportId}-${group.role}`}><td>{group.pieceId}<small>{supportLabel(group)}</small></td><td>{group.role}</td><td>{group.screws}</td><td>{format(group.tapeLength/1000)}</td></tr>)}</tbody></table></div>{quantities.length>150&&<p>Prévia limitada a 150 grupos. O caderno contém todos os grupos.</p>}</details>
  </div>;
}


/** Large main-workspace view; settings stay in FixingEditor beside this map. */
export function FixingMap({ project, result, selectedId, onSelect, onConfigure }) {
  const [faceId,setFaceId]=useState(()=>result.pieces.find(item=>item.id===selectedId)?.surface??'front'),[view,setView]=useState('piece'),[zoom,setZoom]=useState(1),[localPieceId,setLocalPieceId]=useState('');
  const surface=result.surfaces.find(s=>s.id===faceId)??result.surfaces[0];
  const facePieces=result.pieces.filter(p=>p.surface===surface?.id);
  const piece=facePieces.find(p=>p.id===selectedId)??facePieces.find(p=>p.id===localPieceId)??facePieces[0];
  // Blank coordinates describe the opened flange; they have no confirmed projection onto the visible face.
  const frontReference={...result,pieces:result.pieces.map(item=>({...item,fixings:{...item.fixings,screws:(item.fixings?.screws??[]).filter(screw=>screw.coordinateSpace!=='blank')}}))};
  const geometry=surface?assemblyFaceGeometry(surface,frontReference):null;
  const developed=piece?documentGeometry(piece,{back:true}):null;
  const quantities=fixingQuantities(result),total=quantities.reduce((sum,item)=>({screws:sum.screws+item.screws,tapeBands:sum.tapeBands+item.tapeBands,tapeLength:sum.tapeLength+item.tapeLength}),{screws:0,tapeBands:0,tapeLength:0});
  const flangeScrews=result.pieces.flatMap(item=>(item.fixings?.screws??[]).filter(screw=>screw.coordinateSpace==='blank'&&screw.edge).map(screw=>({...screw,pieceId:item.id})));
  const selectedFlangeScrews=flangeScrews.filter(screw=>screw.pieceId===piece?.id);
  const flangeGroups=new Map();for(const screw of selectedFlangeScrews){const key=`${screw.edge}-${screw.foldNumber??screw.foldId}`;if(!flangeGroups.has(key))flangeGroups.set(key,{edge:screw.edge,foldNumber:screw.foldNumber,foldId:screw.foldId,count:0});flangeGroups.get(key).count++;}
  const hasAutomaticScrews=piece&&!piece.technical&&['screws','hybrid'].includes(resolveFixing(project,piece).type);
  const rows=quantities.filter(item=>view==='piece'?item.pieceId===piece?.id:item.surface===surface?.id);
  return <section className="acm-panel acm-fixing-workspace"><div className="acm-section-heading"><div><h3>Mapa e quantidades de fixação</h3><p className="acm-help">{piece?.technical?'Desenho técnico plano · furos explícitos preservados do arquivo.':'Bandeja dobrada · posições automáticas nas abas · cantoneiras e apoio ainda a detalhar.'}</p></div>{onConfigure&&<button onClick={onConfigure}>Configurar fixações</button>}</div>
    <div className="acm-fixing-totals" aria-label="Quantidades totais do projeto"><div><strong>{total.screws}</strong><span>posições de parafuso no projeto</span></div><div><strong>{total.tapeBands}</strong><span>faixas de fita</span></div><div><strong>{format(total.tapeLength/1000)} m</strong><span>fita aplicada</span></div></div>
    <div className="acm-plan-toolbar" aria-label="Visualização do mapa de fixações"><div className="acm-segment"><button aria-pressed={view==='face'} onClick={()=>{setView('face');setZoom(1)}}>Frente · referência sem furação das abas</button><button aria-pressed={view==='piece'} onClick={()=>{setView('piece');setZoom(1)}}>Verso · abas e coordenadas</button></div><button aria-label="Reduzir mapa de fixação" onClick={()=>setZoom(z=>Math.max(1,z-.25))}>−</button><output>{Math.round(zoom*100)}%</output><button aria-label="Ampliar mapa de fixação" onClick={()=>setZoom(z=>Math.min(4,z+.25))}>+</button><button onClick={()=>setZoom(1)}>Enquadrar</button></div>
    <div className="acm-form-grid"><SelectField label="Face do mapa" value={surface?.id??''} onChange={id=>{setFaceId(id);setZoom(1)}} options={result.surfaces.map(s=>({value:s.id,label:s.label}))}/>{view==='piece'&&<SelectField label="Peça no verso" value={piece?.id??''} onChange={id=>{setLocalPieceId(id);onSelect?.(id);setZoom(1)}} options={facePieces.map(p=>({value:p.id,label:`${p.id} · ${format(p.blank.width)} × ${format(p.blank.height)} mm`}))}/>}</div>
    <p className="acm-map-reference"><strong>{view==='face'?`FRENTE · ${surface?.label??'Sem face'}`:`VERSO · ${piece?.id??'Sem peça'}`}</strong> · {view==='face'?'Referência visual de montagem. Pontos das abas não são projetados na face. Apoios em cinza por transparência.':'Usinagem no desenvolvimento · origem inferior esquerda (0,0) · +X à direita e +Y acima · mm.'}</p>
    <div className="acm-fixing-map-scroll"><div className="acm-fixing-map-scale" style={{width:`${zoom*100}%`,height:`${zoom*100}%`}} ref={element=>{for(const svg of element?.querySelectorAll('svg')??[])svg.setAttribute('preserveAspectRatio','xMidYMid meet')}}>{view==='face'?(geometry?<div className="acm-fixing-map" dangerouslySetInnerHTML={{__html:assemblyFaceSVG(surface,geometry)}}/>:<p className="acm-plan-empty">Nenhuma face disponível para desenhar.</p>):piece?<PieceDrawing piece={piece} project={project} back/>:<p className="acm-plan-empty">Nenhuma peça nesta face.</p>}</div></div>
    <div className="acm-technical-legend"><span><i style={{background:'#15803d'}}/> Fita verde</span><span><i className="drill"/> Azul: furo com Ø ou posição informativa</span>{view==='piece'&&<><span><i/> Corte preto</span><span><i className="groove"/> Fresagem vermelha</span></>}</div>
    <p className="acm-help">Os pontos automáticos pertencem às abas da bandeja e aparecem no desenvolvimento pelo verso. A frente não projeta esses pontos nem recebe furação automática. Círculos mostram Ø informado; cruzes sem Ø são posições informativas. Furos explícitos do desenho importado são preservados. A cantoneira e o apoio não foram confirmados por esta distribuição.</p>
    {!!flangeScrews.length&&<p className="acm-flange-support-note"><strong>{flangeScrews.length} posição(ões) nas abas do projeto.</strong> Interface prevista: aba → cantoneira a detalhar. Apoio não verificado; nenhuma cantoneira foi inventada no modelo.</p>}
    {view==='piece'&&hasAutomaticScrews&&!selectedFlangeScrews.length&&<p className="acm-notice">Nenhuma posição automática gerada nesta peça. Confira a existência de abas, a operação escolhida e os avisos do projeto.</p>}
    {view==='piece'&&!!flangeGroups.size&&<div className="acm-fixing-table"><table><caption>Posições automáticas por aba · {piece.id}</caption><thead><tr><th>Borda do projeto</th><th>Operação</th><th>Posições</th><th>Interface / apoio</th></tr></thead><tbody>{[...flangeGroups.values()].map(group=><tr key={`${group.edge}-${group.foldNumber??group.foldId}`}><td>{edgeLabels[group.edge]??group.edge}</td><td>{group.foldNumber??group.foldId}</td><td>{group.count}</td><td>Cantoneira a detalhar · não verificado</td></tr>)}</tbody></table></div>}
    {!!geometry?.missingSupports.length&&<p role="alert" className="acm-error">Apoios referenciados ausentes: {geometry.missingSupports.join(', ')}. Confira a estrutura antes de fabricar.</p>}
    <div className="acm-fixing-table"><table><caption>Contagem calculada por peça e apoio · {view==='piece'?piece?.id:surface?.label}</caption><thead><tr><th>Peça / apoio</th><th>Função</th><th>Parafusos</th><th>Faixas</th><th>Fita aplicada</th></tr></thead><tbody>{rows.map(g=><tr key={`${g.pieceId}-${g.supportId}-${g.role}`}><td>{onSelect?<button onClick={()=>{setLocalPieceId(g.pieceId);onSelect(g.pieceId);setView('piece');setZoom(1)}}>{g.pieceId}</button>:g.pieceId}<small>{supportLabel(g)}</small></td><td>{g.role}</td><td>{g.screws}</td><td>{g.tapeBands}</td><td>{format(g.tapeLength/1000)} m</td></tr>)}</tbody></table>{!rows.length&&<p className="acm-help">Nenhum ponto ou faixa gerado nesta seleção. Confira o sistema de fixação e os apoios.</p>}</div>
    {view==='piece'&&developed&&<div className="acm-fixing-table"><table><caption>Coordenadas no VERSO do desenvolvimento · {piece.id} · milímetros</caption><thead><tr><th>Posição</th><th>Aba / operação</th><th>X no verso · desde a esquerda</th><th>Y no verso · desde a base</th><th>Diâmetro especificado</th><th>Apoio</th></tr></thead><tbody>{developed.drills.map(h=><tr key={h.number}><td>F{h.number}</td><td>{h.edge?`${edgeLabels[h.edge]??h.edge} · operação ${h.foldNumber??h.foldId??'—'}`:piece.technical?'Furo explícito importado':'Origem explícita / a conferir'}</td><td>{format(h.x)}</td><td>{format(h.y)}</td><td>{h.diameter?`Ø ${format(h.diameter)} mm`:'A definir · ponto informativo'}</td><td>{h.supportStatus==='unverified'||h.edge?'Cantoneira a detalhar · não verificado':'Não especificado'}</td></tr>)}</tbody></table>{!developed.drills.length&&<p className="acm-help">Não há posições de parafuso ou furos definidos nesta peça.</p>}{!!developed.tape.length&&<table><caption>Fita no verso · coordenadas de início e fim em mm</caption><thead><tr><th>Faixa</th><th>Início X / Y</th><th>Fim X / Y</th><th>Largura</th></tr></thead><tbody>{developed.tape.map((line,i)=><tr key={i}><td>{i+1}</td><td>{format(line.x1)} / {format(line.y1)}</td><td>{format(line.x2)} / {format(line.y2)}</td><td>{format(line.width)} mm</td></tr>)}</tbody></table>}</div>}
  </section>;
}
