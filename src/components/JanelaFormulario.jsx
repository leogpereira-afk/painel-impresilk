import {useEffect,useId,useRef} from 'react';
import {X} from 'lucide-react';
import './janela-formulario.css';
import {avisoNovo} from '../lib/aviso-na-vista.js';
// `classe` e acrescentada ao className do dialog (ex.: "janela-estreita"). Vazia
// por padrao: Patrimonio e Licitacoes nao mudam.
export default function JanelaFormulario({titulo,ocupado=false,aoFechar,classe='',children}) {
  const ref=useRef(null),id=useId();
  useEffect(()=>{
    const anterior=document.activeElement,el=ref.current,overflow=document.body.style.overflow;
    el.showModal();document.body.style.overflow='hidden';
    el.querySelector('input:not([type="hidden"]),textarea,select')?.focus();
    return ()=>{el.close();document.body.style.overflow=overflow;if(anterior?.isConnected)anterior.focus();};
  },[]);
  // Erro novo dentro da janela (ex.: recusa do servidor depois de Salvar) rola até ficar à vista: no celular o aviso fica no topo do formulário.
  useEffect(()=>{
    const el=ref.current;if(!el||typeof MutationObserver==='undefined')return;
    const obs=new MutationObserver(registros=>{const a=avisoNovo(registros);if(!a)return;const r=a.getBoundingClientRect();if(r.top<0||r.bottom>window.innerHeight)a.scrollIntoView({block:'center'});});
    obs.observe(el,{childList:true,subtree:true,characterData:true});
    return ()=>obs.disconnect();
  },[]);
  return <dialog ref={ref} aria-labelledby={id} className={`janela-formulario ${classe}`.trim()} onCancel={e=>{e.preventDefault();if(!ocupado)aoFechar();}}>
    <header><h2 id={id}>{titulo}</h2><button type="button" className="btn-ghost" disabled={ocupado} onClick={aoFechar} aria-label="Fechar formulário"><X size={22}/></button></header>
    <div className="janela-formulario-corpo">{children}</div>
  </dialog>;
}
