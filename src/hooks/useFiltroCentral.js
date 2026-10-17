import {createContext,useContext,useEffect,useState} from 'react';

// Só preferências de visualização, nunca respostas do servidor nem formulários.
// A Central destrói o Map ao sair ou trocar usuário/permissões. Nada vai para
// localStorage, URL ou outra sessão. Fora da Central funciona como useState.
export const FiltrosCentralContext=createContext(null);

export function useFiltroCentral(chave,inicial) {
  const memoria=useContext(FiltrosCentralContext);
  const [valor,setValor]=useState(()=>memoria?.has(chave)?memoria.get(chave):typeof inicial==='function'?inicial():inicial);
  useEffect(()=>{memoria?.set(chave,valor);},[memoria,chave,valor]);
  return [valor,setValor];
}
