import {useEffect,useState} from 'react';
import {chamarComercial} from '../../services/comercial.js';

export default function useApoioComercial(filtro={},revisao=0) {
 const chave=JSON.stringify({vendedor:filtro.vendedor||'',equipe:filtro.equipe||''});
 const [carga,setCarga]=useState(null),[erro,setErro]=useState(''),[carregando,setCarregando]=useState(true);
 useEffect(()=>{
  const ctl=new AbortController();setCarregando(true);setErro('');
  chamarComercial('apoioComercial',{filtro:JSON.parse(chave)},ctl.signal)
   .then(dados=>{if(!ctl.signal.aborted)setCarga({chave,dados});})
   .catch(e=>{if(!ctl.signal.aborted)setErro(e.message);})
   .finally(()=>{if(!ctl.signal.aborted)setCarregando(false);});
  return()=>ctl.abort();
 },[chave,revisao]);
 return {dados:carga?.chave===chave?carga.dados:null,erro,carregando};
}
