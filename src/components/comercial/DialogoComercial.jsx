import {useEffect,useId,useRef} from 'react';
import {X} from 'lucide-react';
export default function DialogoComercial({titulo,children,fechar}){
 const id=useId(),ref=useRef();
 useEffect(()=>{const anterior=document.activeElement;ref.current.showModal();return()=>anterior?.focus();},[]);
 return <dialog ref={ref} aria-labelledby={id} className="com-dialog" onCancel={e=>{e.preventDefault();fechar();}}><header><h2 id={id}>{titulo}</h2><button type="button" aria-label="Fechar" className="btn-ghost" onClick={fechar}><X size={20}/></button></header><div className="com-dialog-body">{children}</div></dialog>;
}
