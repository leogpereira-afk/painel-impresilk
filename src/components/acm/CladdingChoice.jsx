import {Field,SelectField} from './ACMForms.jsx';
import {claddingState,PANEL_FORMS,JOINT_TYPES,EXPOSURES} from '../../lib/acm/cladding.mjs';
import './cladding-choice.css';

export default function CladdingChoice({project,result,update,onFlat,onFixing,onStep}) {
 const state=claddingState(project,result?.pieces);
 const change=(key,value)=>update('cladding',{panelForm:'unspecified',joint:'unspecified',exposure:'unspecified',fixingConfirmed:false,...project.cladding,[key]:value});
 return <section className="acm-panel acm-cladding" aria-label="Escolher acabamento e montagem">
  <header><div><h2>Como será o acabamento do ACM?</h2><p>Escolha a peça, a junta e a fixação antes de detalhar o corte.</p></div><span className="acm-cladding-status">{state.incomplete?'Escolhas a completar':'Escolhas registradas'}</span></header>
  <div className="acm-cladding-grid">
   <section><h3>↪️ 1. Tipo de peça</h3><SelectField label="Forma da peça" value={state.panelForm} options={PANEL_FORMS} onChange={v=>change('panelForm',v)}/><p>Bandeja é a peça com abas dobradas. Junta seca é um acabamento entre peças: as duas escolhas podem existir juntas.</p>{state.panelForm==='flat'&&state.hasFolds&&<button onClick={onFlat}>Aplicar chapa plana · remover dobras</button>}{['tray','wrap'].includes(state.panelForm)&&<button onClick={()=>onStep('bends')}>Configurar abas e retornos</button>}</section>
   <section><h3>↔️ 2. Junta entre as peças</h3><SelectField label="Acabamento da junta" value={state.joint} options={JOINT_TYPES} onChange={v=>change('joint',v)}/><Field label="Largura da junta no estudo" value={project.layout.joint} min={0} required onChange={v=>update('layout.joint',v)}/><p>{state.joint==='dry'?'Sem selante entre as chapas. Defina também o fundo e o detalhe que ficará aparente.':state.joint==='sealed'?'O selante, o corpo de apoio e a seção devem corresponder ao detalhe escolhido. A seleção não calcula consumo nem resistência.':'Não presumimos junta zero. O espaçamento continua sendo a medida cadastrada acima.'}</p></section>
   <section><h3>🔩 3. Fixação</h3><SelectField label="Como a peça será fixada?" value={state.fixingConfirmed?project.fixing.type:'unspecified'} onChange={v=>{if(v==='unspecified'){change('fixingConfirmed',false);return}if(!state.fixingConfirmed||project.fixing.type!==v)onFixing(v)}} options={[{value:'unspecified',label:'Escolha a fixação'},{value:'screws',label:'Parafusos nas abas'},{value:'tape',label:'Fita nos apoios'},{value:'hybrid',label:'Híbrido · parafusos nas abas e fita'}]}/><p>Os parafusos automáticos ficam nas abas; a frente aparente permanece sem furos. Sem aba, não se cria furação automática.</p><button onClick={()=>onStep('fixing')}>Ver parafusos, furos e fita</button></section>
   <section><h3>☀️ 4. Exposição</h3><SelectField label="Ambiente da instalação" value={state.exposure} options={EXPOSURES} onChange={v=>change('exposure',v)}/><p>Sol, chuva, dilatação e acesso influenciam o detalhe. Junta, bandeja e fita são escolhas diferentes; registrar estas opções não libera a instalação.</p><button onClick={()=>onStep('installation')}>Planejar a instalação</button></section>
  </div>
  {state.notices.length>0&&<div className="acm-notice" role="status">{state.notices.map(message=><p key={message}>{message}</p>)}</div>}
  <footer><p>Escolher o tipo não apaga medidas nem dobras existentes. Alterações explícitas podem ser desfeitas.</p><a href="https://www.youtube.com/watch?v=8v-h4S_6AsY" target="_blank" rel="noreferrer">Referência: tipos de juntas ↗</a><button onClick={()=>onStep('measures')}>Ver medidas abaixo ↓</button></footer>
 </section>
}
