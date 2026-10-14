import {useSearchParams} from 'react-router-dom';

// "Abrir ficha" (na ficha do bem) chega com ?item=<id>. A aba mostra só aquela
// ficha enquanto o item existir na própria lista; "Ver todas" tira o item da URL.
export function useFocoFicha(lista) {
 const [params,setParams]=useSearchParams();
 const pedido=params.get('item')||'';
 const id=pedido&&(lista||[]).some(i=>i?.id===pedido)?pedido:'';
 const limpar=()=>setParams(p=>{const n=new URLSearchParams(p);n.delete('item');return n;},{replace:true});
 return {id,pedido,limpar};
}
export default function FocoFicha({foco}) {
 if(!foco?.id)return null;
 return <p className="pat-notice pat-foco-ficha" role="status">Mostrando só esta ficha. <button type="button" className="btn-ghost" onClick={foco.limpar}>Ver todas</button></p>;
}
