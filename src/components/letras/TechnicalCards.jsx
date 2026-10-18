import {createPainting,calculatePainting,validatePainting} from '../../lib/letras/finishing.mjs';
import {createElectrical,calculateElectrical,validateElectrical} from '../../lib/letras/electrical.mjs';
import DecimalInput from './DecimalInput.jsx';
import './technical-cards.css';
const roles={preparation:'Preparação e limpeza',primer:'Fundo / primer',paint:'Tinta de acabamento',varnish:'Verniz'};
function Field({label,value,onChange,type='text',options}){return <label className="lt-field"><span>{label}</span>{options?<select aria-label={label} value={value??''} onChange={e=>onChange(e.target.value)}>{options.map(([v,t])=><option key={v} value={v}>{t}</option>)}</select>:type==='number'?<DecimalInput aria-label={label} value={value} onChange={onChange}/>:<input aria-label={label} type={type} value={value??''} onChange={e=>onChange(e.target.value)}/>}</label>;}
function Issues({result}){return <div className="lt-issues" aria-live="polite">{result.errors?.map((x,i)=><p key={`e${i}`} role="alert">Erro: {x}</p>)}{result.pending?.map((x,i)=><p key={`p${i}`}>Pendente: {x}</p>)}</div>;}
export function PaintingCards({value,onChange,areaMm2,components=[],simple=true}) {
  const shapeErrors=value===undefined?[]:validatePainting(value);
  if(shapeErrors.length)return <Issues result={{errors:shapeErrors}}/>;
  const p={...createPainting(),...value,layers:value?.layers||createPainting().layers};
  const selected=components.filter(c=>p.surfaces?.includes(c.id));
  const selectedArea=selected.length?selected.reduce((sum,c)=>sum+Number(c.areaMm2||0),0):null;
  const result=calculatePainting(p,components.length?selectedArea:(p.surfaces?.length?areaMm2:null));
  const update=(id,key,v)=>onChange({...p,layers:p.layers.map(l=>l.id===id?{...l,[key]:v,releaseConfirmed:false}:l)});
  return <div className="lt-technical">
    <div className="lt-card"><h3>Pintura técnica</h3>
      <Field label="Sistema" value={p.mode} onChange={mode=>onChange({...p,mode})} options={[["pending","A definir"],["none","Sem pintura"],["specified","Pintura especificada"]]}/>
      <p>A cor visual não define produto, código técnico ou amostra aprovada.</p>
      <details open={!simple}><summary>Componentes e superfícies · {selected.length} selecionados</summary>
        <p>Selecionar explicitamente os componentes a pintar. Áreas nominais por componente; faces e bordas específicas exigem conferência.</p>
        {components.map(c=><label className="lt-surface" key={c.id}><input type="checkbox" checked={!!p.surfaces?.includes(c.id)} onChange={evt=>onChange({...p,surfaces:evt.target.checked?[...(p.surfaces||[]),c.id]:(p.surfaces||[]).filter(id=>id!==c.id),layers:p.layers.map(l=>({...l,releaseConfirmed:false}))})}/>{c.label||c.id} · {c.material} · {(Number(c.areaMm2||0)/1e6).toLocaleString('pt-BR')} m²</label>)}
        {!selected.length&&<p>Área pintada pendente: selecione os componentes.</p>}
      </details>
      <p>Área selecionada: {result.areaM2?.toLocaleString('pt-BR')??'pendente'} m²</p>
    </div>
    {p.mode!=='none'&&p.layers.map(l=>{
      const applying=l.selection==='apply';
      const waived=l.selection==='waived';
      const showTechnical=applying||!simple;
      const layerResult=result.layers.find(x=>x.id===l.id);
      const field=(key,label,type='text')=><Field key={key} label={label} type={type} value={l[key]} onChange={v=>update(l.id,key,v)}/>;
      return <details className="lt-card" key={l.id} open={!simple}>
        <summary>{roles[l.role]||l.role} · {applying?(l.sku||'Produto pendente'):waived?'Dispensado':'A definir'}</summary>
        <div className="lt-fields">
          <Field label="Aplicação" value={l.selection} onChange={v=>update(l.id,'selection',v)} options={[["pending","A definir"],["apply","Aplicar"],["waived","Dispensado conforme sistema validado"]]}/>
          {showTechnical&&l.role==='paint'&&<Field label="Tipo de tinta" value={l.paintType||''} onChange={v=>update(l.id,'paintType',v)} options={[["","A definir"],["pu","Poliuretano (PU)"],["polyester","Poliéster"],["synthetic","Esmalte sintético"],["epoxy","Epóxi"],["acrylic","Acrílica"],["other","Outro sistema especificado"]]}/>}
          {showTechnical&&field('manufacturer','Fabricante')}
          {showTechnical&&field('sku','Produto / SKU')}
          {(showTechnical||waived)&&field('datasheet','Ficha técnica e revisão')}
          {(waived||!simple)&&field('waiverReason','Justificativa de dispensa')}
          {showTechnical&&(!simple||['paint','varnish'].includes(l.role))&&field('physicalColor','Cor física / código confirmado')}
          {showTechnical&&(!simple||['paint','varnish'].includes(l.role))&&field('gloss','Brilho técnico')}
        </div>
        {simple&&!applying&&!waived&&<p>Defina se esta etapa será aplicada ou dispensada. Os campos correspondentes aparecem após a escolha.</p>}
        {waived&&<p>A dispensa exige justificativa e ficha técnica do sistema. Os dados já preenchidos são preservados.</p>}
        {showTechnical&&<>
          <details open={!simple}><summary>Consumo · {layerResult?.theoreticalLitres?.toLocaleString('pt-BR')??'a definir'} L</summary>
            <div className="lt-fields">
              {field('coats','Demãos','number')}
              {field('coverageM2PerL','Rendimento (m²/L)','number')}
              {field('lossPercent','Perda cadastrada (%)','number')}
              <Field label="Base do rendimento" value={l.coverageBasis} onChange={v=>update(l.id,'coverageBasis',v)} options={[["coat","Por demão"],["system","Sistema completo"]]}/>
            </div>
          </details>
          <details open={!simple}><summary>Tempos de aplicação e cura</summary>
            <div className="lt-fields">
              {field('applicationEndedAt','Fim real de aplicação','datetime-local')}
              {['touchHours','handlingHours','finalHours','cureHours','recoatMinHours','recoatMaxHours'].map((key,i)=><Field key={key} label={['Toque (h)','Manuseio (h)','Secagem final (h)','Cura total (h)','Repintura mínima (h)','Repintura máxima (h)'][i]} type="number" value={l.times?.[key]} onChange={v=>update(l.id,'times',{...l.times,[key]:v})}/>)}
            </div>
            <p>Tempo decorrido não confirma cura. A liberação depende de conferência real.</p>
          </details>
          <details open={!simple}><summary>Mistura e condições do sistema</summary>
            <div className="lt-fields">
              <Field label="Base da mistura" value={l.mix?.basis} onChange={v=>update(l.id,'mix',{...l.mix,basis:v})} options={[["volume","Volume"],["mass","Massa"]]}/>
              <Field label="Proporção (partes separadas por :)" value={l.mix?.parts?.join(':')} onChange={v=>update(l.id,'mix',{...l.mix,parts:v.split(':').filter(Boolean).map(Number)})}/>
              <Field label="Mistura realizada em" type="datetime-local" value={l.mix?.mixedAt} onChange={v=>update(l.id,'mix',{...l.mix,mixedAt:v})}/>
              <Field label="Vida útil da mistura (h)" type="number" value={l.mix?.potLifeHours} onChange={v=>update(l.id,'mix',{...l.mix,potLifeHours:v})}/>
              {['conditionsConfirmed','compatibilityConfirmed'].map((key,i)=><label key={key}><input type="checkbox" checked={!!l[key]} onChange={e=>update(l.id,key,e.target.checked)}/>{['Condições reais conferidas com ficha','Compatibilidade do sistema conferida'][i]}</label>)}
            </div>
          </details>
        </>}
      </details>;
    })}
    <Issues result={{errors:result.errors}}/>
    {!!result.pending.length&&<details className="lt-card" open={!simple}><summary>Conferências técnicas pendentes · {result.pending.length}</summary><Issues result={{pending:result.pending}}/></details>}
  </div>;
}

const sets=[['models','Modelos LED',[['name','Nome opcional'],['manufacturer','Fabricante'],['sku','SKU'],['datasheet','Ficha técnica'],['voltageV','Tensão (V)','number'],['powerW','Potência por módulo (W)','number'],['maxModulesPerCircuit','Limite de módulos por ramal','number']]],['modules','Módulos LED',[['name','Nome opcional'],['modelId','ID do modelo'],['circuitId','ID do circuito'],['letterId','ID da letra']]],['supplies','Fontes',[['name','Nome opcional'],['manufacturer','Fabricante'],['sku','SKU'],['datasheet','Ficha técnica / curva'],['voltageV','Tensão de saída (V)','number'],['ratedPowerW','Potência nominal (W)','number'],['usablePowerW','Capacidade utilizável (W)','number'],['usableCurrentA','Corrente utilizável (A)','number']]],['circuits','Circuitos',[['name','Nome opcional'],['supplyId','ID da fonte'],['voltageV','Tensão (V)','number']]],['segments','Trechos de cabo',[['circuitId','ID circuito'],['fromNode','Origem'],['toNode','Destino'],['lengthM','Comprimento informado (m)','number'],['conductors','Número de vias','number'],['currentA','Corrente neste trecho (A)','number'],['resistanceOhmPerM','Resistência do condutor (Ω/m)','number'],['resistanceSource','Fonte da resistência']]]];
const idPrefixes={models:'MODELO',modules:'LED',supplies:'FONTE',circuits:'CIRCUITO',segments:'CABO'};
function nextTechnicalId(rows,group){let index=1;while(rows.some(row=>row.id===`${idPrefixes[group]}-${String(index).padStart(2,'0')}`))index++;return `${idPrefixes[group]}-${String(index).padStart(2,'0')}`;}
function referenceOptions(e,key,current){const group={modelId:'models',circuitId:'circuits',supplyId:'supplies'}[key];if(!group)return undefined;const rows=e[group]||[];return [['','Selecionar…'],...(current&&!rows.some(row=>row.id===current)?[[current,`${current} · referência ausente`]]:[]),...rows.map(row=>[row.id,[row.name||row.sku||row.id,row.name||row.sku?row.id:null].filter(Boolean).join(' · ')])];}
export function ElectricalCards({value,onChange,enabled=true}){const shapeErrors=value===undefined?[]:validateElectrical(value);if(shapeErrors.length)return <Issues result={{errors:shapeErrors}}/>;const e=value||createElectrical();const result=calculateElectrical(e);const update=(group,id,key,v)=>onChange({...e,[group]:(e[group]||[]).map(x=>x.id===id?{...x,[key]:v}:x)});if(!enabled)return <div className="lt-card">Elétrica não aplicável à construção selecionada.</div>;return <div className="lt-technical"><div className="lt-card"><h3>Elétrica · estudo de tensão constante</h3><p>{result.totals.moduleCount} módulos · {result.totals.powerW??'—'} W · {result.totals.cableM} m de cabo / {result.totals.conductorM} m de condutores</p><p>Cadastro manual confirmado por ficha. Distribuição óptica e projeto elétrico permanecem sujeitos a revisão.</p></div>{sets.map(([group,title,fields])=><details key={group} className="lt-card"><summary>{title} · {(e[group]||[]).length}</summary>{(e[group]||[]).map(row=><fieldset key={row.id}><legend>{row.id}</legend><div className="lt-fields">{fields.map(([key,label,type])=><Field key={key} label={label.replace("ID do modelo","Modelo LED").replace("ID do circuito","Circuito").replace("ID da fonte","Fonte de alimentação").replace("ID circuito","Circuito")} type={type} value={row[key]} options={referenceOptions(e,key,row[key])} onChange={v=>update(group,row.id,key,v)}/>)}{group==='segments'&&<Field label="Base do comprimento" value={row.lengthBasis} onChange={v=>update(group,row.id,'lengthBasis',v)} options={[["oneWay","Percurso de ida (retorno calculado)"],["loop","Soma ida e retorno"]]}/>} {group==='supplies'&&<label><input type="checkbox" checked={!!row.conditionsConfirmed} onChange={evt=>update(group,row.id,'conditionsConfirmed',evt.target.checked)}/>Capacidade nas condições reais conferida</label>}</div><button type="button" onClick={()=>onChange({...e,[group]:e[group].filter(x=>x.id!==row.id)})}>Remover {row.id}</button></fieldset>)}<button type="button" onClick={()=>onChange({...e,[group]:[...(e[group]||[]),{id:nextTechnicalId(e[group]||[],group),...(group==='segments'?{lengthBasis:'oneWay'}:{})}]})}>Adicionar {title.toLowerCase()}</button></details>)}<Issues result={result}/></div>;}
export function FixingCards({value={},onChange}){
 if(!value||typeof value!=='object'||Array.isArray(value))return <Issues result={{errors:['Fixação inválida.']}}/>;
 const methods=['Pinos / prisioneiros e afastadores','Parafusos em fundo ou suportes','Trilho / estrutura auxiliar','Buchas e chumbadores especificados','Fita estrutural especificada','Adesivo especificado','Combinação conforme projeto'];
 const options=[['','A definir'],...methods.map(x=>[x,x]),...(value.wallMethod&&!methods.includes(value.wallMethod)?[[value.wallMethod,value.wallMethod]]:[])];
 return <details className="lt-card"><summary>Fixação · {value.wallMethod||'A definir'}</summary><div className="lt-fields"><Field label="Método letra–parede" value={value.wallMethod} options={options} onChange={v=>onChange({...value,wallMethod:v,confirmed:false})}/>{[['faceMethod','Método face–corpo'],['substrate','Substrato resistente'],['cladding','Revestimento'],['source','Procedimento / fonte'],['points','Quantidade de pontos definida','number'],['offsetMm','Afastamento da parede (mm)','number'],['fastener','Modelo de parafuso / bucha / chumbador'],['adhesive','Produto adesivo / fita'],['surfacePreparation','Preparo da superfície'],['cure','Cura / condições conforme ficha']].map(([key,label,type])=><Field key={key} label={label} type={type} value={value[key]} onChange={v=>onChange({...value,[key]:v,confirmed:false})}/>)}</div><p>Defina o produto e a capacidade compatível com peso, substrato e exposição. A lista não aprova fita ou cola como fixação suficiente. Quantidade não gera coordenadas de furos automaticamente; use o planejamento da instalação.</p></details>;
}
