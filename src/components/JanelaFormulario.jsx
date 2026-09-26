import {useEffect,useId,useRef} from 'react';
import {X} from 'lucide-react';
import './janela-formulario.css';
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
  return <dialog ref={ref} aria-labelledby={id} className={`janela-formulario ${classe}`.trim()} onCancel={e=>{e.preventDefault();if(!ocupado)aoFechar();}}>
    <header><h2 id={id}>{titulo}</h2><button type="button" className="btn-ghost" disabled={ocupado} onClick={aoFechar} aria-label="Fechar formulário"><X size={22}/></button></header>
    <div className="janela-formulario-corpo">{children}</div>
  </dialog>;
}
