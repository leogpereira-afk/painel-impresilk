import {Field} from './ACMForms.jsx';
import {claddingState} from '../../lib/acm/cladding.mjs';
import './cladding-choice.css';

function Choices({label,value,onChange,options}) {
 return <div className="acm-quick-choices" role="group" aria-label={label}>
  {options.map(([id,icon,title,caption])=><button key={id} type="button" aria-pressed={value===id} onClick={()=>{if(value!==id)onChange(id)}}>
   <span className="acm-choice-icon" aria-hidden="true">{icon}</span><span><strong>{title}</strong><small>{caption}</small></span><span className="acm-choice-check" aria-hidden="true">{value===id?'✓':''}</span>
  </button>)}
 </div>;
}

export default function CladdingChoice({project,result,update,onFlat,onFixing,onStep}) {
 const state=claddingState(project,result?.pieces);
 const change=(key,value)=>update('cladding',{panelForm:'unspecified',joint:'unspecified',exposure:'unspecified',fixingConfirmed:false,...project.cladding,[key]:value});
 const completed=[state.panelForm!=='unspecified',state.joint!=='unspecified',state.fixingConfirmed===true,state.exposure!=='unspecified'].filter(Boolean).length;
 return <section className="acm-panel acm-cladding" aria-label="Escolher acabamento e montagem">
  <header><div><h2>Como será sua placa?</h2><p>Toque nas opções. Depois, informe as medidas.</p></div><span className="acm-cladding-status" role="status">{completed} de 4 escolhas</span></header>
  <div className="acm-cladding-grid">
   <section><h3><span>1</span> Tipo de peça</h3><Choices label="Forma da peça" value={state.panelForm} onChange={v=>change('panelForm',v)} options={[
    ['tray','↪️','Bandeja dobrada','Com abas nas bordas'],['flat','▱','Chapa plana','Sem dobras'],['wrap','🔲','Encapamento','Ao redor de um perfil'],
   ]}/>{state.panelForm==='flat'&&state.hasFolds&&<button className="acm-cladding-action" type="button" onClick={onFlat}>Aplicar chapa plana · remover dobras</button>}{['tray','wrap'].includes(state.panelForm)&&<button className="acm-cladding-action" type="button" onClick={()=>onStep('bends')}>Ajustar dobras →</button>}</section>
   <section><h3><span>2</span> Junta entre as peças</h3><Choices label="Acabamento da junta" value={state.joint} onChange={v=>change('joint',v)} options={[
    ['dry','↔️','Junta seca','Sem selante'],['sealed','〰️','Junta selada','Com selante'],['butt','▥','Encostadas','Sem junta aparente'],
   ]}/><div className="acm-cladding-joint"><Field label="Espaço entre peças" value={project.layout.joint} min={0} required onChange={v=>update('layout.joint',v)}/><span>Use a medida definida para a obra.</span></div></section>
   <section><h3><span>3</span> Como fixar?</h3><Choices label="Como a peça será fixada?" value={state.fixingConfirmed?project.fixing.type:'unspecified'} onChange={onFixing} options={[
    ['screws','🔩','Parafusos','Somente nas abas'],['tape','🟩','Fita','Nos apoios'],['hybrid','🔩＋','Os dois','Parafusos e fita'],
   ]}/><button className="acm-cladding-action" type="button" onClick={()=>onStep('fixing')}>Ver furos e quantidades →</button></section>
   <section><h3><span>4</span> Onde será instalada?</h3><Choices label="Ambiente da instalação" value={state.exposure} onChange={v=>change('exposure',v)} options={[
    ['indoor','🏠','Área interna','Dentro do ambiente'],['outdoor','☀️','Área externa','Exposta ao tempo'],
   ]}/><button className="acm-cladding-action" type="button" onClick={()=>onStep('installation')}>Planejar instalação →</button></section>
  </div>
  {state.notices.length>0&&<div className="acm-notice" role="status">{state.notices.map(message=><p key={message}>{message}</p>)}</div>}
  <details className="acm-details acm-cladding-more"><summary>Mais detalhes sobre estas escolhas</summary>
   <p>Bandeja é a peça com abas dobradas. Junta seca ou selada é o acabamento entre peças. Você pode combinar essas escolhas.</p>
   <p>A seleção conserva as medidas e dobras existentes. Para chapa plana, remova as dobras pelo botão específico. O espaçamento entre peças não muda ao trocar o tipo de junta.</p>
   <p>Na junta seca, confira o fundo aparente. Na junta selada, confira selante, corpo de apoio e seção. As escolhas não dimensionam resistência nem consumo.</p>
   <p>Os furos automáticos ficam somente nas abas, nunca na frente. Sem aba, não se cria furação automática. Fita, parafusos e acesso precisam de conferência técnica antes da instalação.</p>
   <div className="acm-cladding-reset" role="group" aria-label="Deixar uma escolha para depois"><span>Limpar escolha:</span>{[['panelForm','Tipo de peça'],['joint','Junta'],['fixingConfirmed','Fixação'],['exposure','Ambiente']].map(([key,label])=><button type="button" key={key} onClick={()=>change(key,key==='fixingConfirmed'?false:'unspecified')}>{label}</button>)}</div>
   <a href="https://www.youtube.com/watch?v=8v-h4S_6AsY" target="_blank" rel="noreferrer">Referência: tipos de juntas ↗</a>
  </details>
  <footer><span>As escolhas podem ser ajustadas a qualquer momento.</span><button className="acm-cladding-continue" type="button" onClick={()=>onStep('measures')}>Continuar para medidas →</button></footer>
 </section>;
}
