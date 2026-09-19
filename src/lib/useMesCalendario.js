import { useSearchParams } from 'react-router-dom';

export default function useMesCalendario(mesAtual) {
  const [params,setParams] = useSearchParams();
  const valor=params.get('mes');
  const mes=/^\d{4}-(0[1-9]|1[0-2])$/.test(valor||'')?valor:mesAtual();
  const setMes=proximo=>{
    const v=typeof proximo==='function'?proximo(mes):proximo;
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(v))return;
    setParams(prev=>{const copia=new URLSearchParams(prev);copia.set('mes',v);return copia;},{replace:true});
  };
  return [mes,setMes];
}
