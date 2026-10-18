import {useState} from 'react';
import {LED_CATALOG,SUPPLY_CATALOG,WIRE_CATALOG,applyLedCatalog,applySupplyCatalog,applyWireCatalog,catalogStatus} from '../../lib/letras/lighting-catalog.mjs';

const fmt=v=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3}).format(v);
function Reference({group,kind}) {
 const {record,modified}=catalogStatus(group,kind);
 if(!record)return <small>Cadastro manual ou demonstrativo. Escolha uma referência para preencher a ficha.</small>;
 return <><small className={modified?'led-reference-edited':'led-reference-ok'}>{modified?'Dados alterados após a escolha do catálogo':'Dados nominais da ficha preservados'} · consulta {record.checkedAt}</small><a href={record.datasheet} target="_blank" rel="noreferrer">Abrir ficha do fabricante ↗</a></>;
}
export default function LightingCatalog({config,onChange,depthMm}) {
 const [error,setError]=useState('');
 const [guideIndex,setGuideIndex]=useState('');
 const selected=catalogStatus(config.model,'led');
 const guides=selected.record?.opticalGuides||[];
 const apply=(fn,id)=>{if(!id)return;try{onChange(fn(config,id));setError('');setGuideIndex('');}catch(e){setError(e.message);}};
 const rotation=config.model.rotationDeg||0;
 const bodyX=rotation===90?config.model.heightMm:config.model.widthMm,bodyY=rotation===90?config.model.widthMm:config.model.heightMm;
 const useGuide=()=>{const guide=guides[Number(guideIndex)];if(!guide||guideIndex==='')return;onChange({...config,grid:{...config.grid,pitchXmm:rotation===90?guide.rowPitchMm:guide.pitchMm,pitchYmm:rotation===90?guide.pitchMm:guide.rowPitchMm}});};
 return <section className="led-card led-catalog" aria-label="Catálogo de LEDs, fontes e fios">
  <div className="led-heading"><h4>1. Escolha os componentes</h4><span className="led-catalog-badge">Fichas de fabricantes</span></div>
  <div className="led-catalog-item"><label className="led-field"><span>Módulo LED de referência</span><select value={selected.record?.id||''} onChange={e=>apply(applyLedCatalog,e.target.value)}><option value="">Manter cadastro atual</option>{LED_CATALOG.map(item=><option key={item.id} value={item.id}>{item.name} · {fmt(item.cctK)} K · {fmt(item.powerW)} W</option>)}</select></label><p><strong>{config.model.name}</strong><br/>{fmt(config.model.voltageV)} V · {fmt(config.model.powerW)} W por módulo · {fmt(config.model.cctK)} K · até {config.model.maxPerRun} módulos por ramal</p><Reference group={config.model} kind="led"/>
   {selected.record&&<small>SKU {selected.record.sku} · {fmt(selected.record.widthMm)} × {fmt(selected.record.heightMm)} × {fmt(selected.record.depthMm)} mm · {selected.record.ip}. Referência técnica; estoque e fornecedor ainda não confirmados.</small>}
  </div>
  <div className="led-catalog-item"><label className="led-field"><span>Fonte de referência</span><select value={catalogStatus(config.supply,'supply').record?.id||''} onChange={e=>apply(applySupplyCatalog,e.target.value)}><option value="">Manter cadastro atual</option>{SUPPLY_CATALOG.map(item=><option key={item.id} value={item.id} disabled={item.voltageV!==config.model.voltageV}>{item.manufacturer} {item.name} · {fmt(item.powerW)} W / {fmt(item.ratedCurrentA)} A</option>)}</select></label><p><strong>{config.supply.name}</strong><br/>{fmt(config.supply.voltageV)} V · {fmt(config.supply.powerW)} W nominais{config.supply.ratedCurrentA?` · ${fmt(config.supply.ratedCurrentA)} A`:''}</p><Reference group={config.supply} kind="supply"/>
   {config.supply.distributionMode==='external'&&<small>Uma saída DC por fonte. Até {config.supply.branches} ramais em distribuição externa é uma premissa deste estudo; bornes, conexões e proteções precisam ser especificados.</small>}
  </div>
  <div className="led-catalog-item"><label className="led-field"><span>Condutor para calcular a queda</span><select value={catalogStatus(config.wire,'wire').record?.id||''} onChange={e=>apply(applyWireCatalog,e.target.value)}><option value="">Manter cadastro atual</option>{WIRE_CATALOG.map(item=><option key={item.id} value={item.id}>{item.manufacturer} BWF · {fmt(item.sectionMm2)} mm²</option>)}</select></label><Reference group={config.wire} kind="wire"/>{config.wire.sectionMm2&&<small>{fmt(config.wire.sectionMm2)} mm² · resistência máxima a {config.wire.resistanceTemperatureC} °C. Dois condutores isolados: um positivo e um negativo. Corrente admissível e adequação ao ambiente ainda precisam de conferência.</small>}</div>
  <div className="led-catalog-item"><h4>2. Ajuste a posição dos módulos</h4><div className="led-actions"><button type="button" aria-pressed={rotation===0} onClick={()=>onChange({...config,model:{...config.model,rotationDeg:0}})}>Horizontal</button><button type="button" aria-pressed={rotation===90} onClick={()=>onChange({...config,model:{...config.model,rotationDeg:90}})}>Vertical</button></div><p>Corpo orientado: {fmt(bodyX)} × {fmt(bodyY)} mm. O módulo inteiro precisa caber dentro da letra.</p>
   {(config.grid.pitchXmm<bodyX||config.grid.pitchYmm<bodyY)&&<div className="led-inline-alert"><p>A malha atual é menor que o novo módulo. Ajuste o espaçamento antes de calcular.</p><button type="button" onClick={()=>onChange({...config,grid:{...config.grid,pitchXmm:Math.max(config.grid.pitchXmm,bodyX+2*config.grid.clearanceMm),pitchYmm:Math.max(config.grid.pitchYmm,bodyY+2*config.grid.clearanceMm)}})}>Ajustar malha para não sobrepor</button><small>Este ajuste só evita sobreposição; não define a densidade luminosa.</small></div>}
   {!!guides.length&&<details><summary>Consultar espaçamentos do fabricante</summary><p>Profundidade externa do projeto: {fmt(depthMm)} mm. Confira a distância real LED–face antes de escolher uma referência; não há interpolação automática.</p><label className="led-field"><span>Referência por profundidade</span><select value={guideIndex} onChange={e=>setGuideIndex(e.target.value)}><option value="">Escolher referência</option>{guides.map((g,index)=><option value={index} key={`${selected.record.id}-${index}`}>{fmt(g.depthMm)} mm · passo {fmt(g.pitchMm)} / fileiras {fmt(g.rowPitchMm)} mm</option>)}</select></label><button type="button" disabled={guideIndex===''} onClick={useGuide}>Aplicar espaçamentos escolhidos</button><p>O passo acompanha a orientação do módulo. Acrílico, película, interior e contorno alteram o efeito. A malha é geométrica e exige amostra física; não é previsão de uniformidade.</p></details>}
  </div>
  {error&&<p role="alert">{error}</p>}
 </section>;
}
