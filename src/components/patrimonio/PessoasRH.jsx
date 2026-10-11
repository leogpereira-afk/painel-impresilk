import {createContext,useCallback,useContext,useEffect,useMemo,useState,useId,useRef} from 'react';
import {lerPessoasPatrimonio} from '../../services/patrimonio.js';

const Contexto=createContext({pessoas:[],carregando:true,erro:''});
export function PessoasRHProvider({children,pessoasFornecidas}) {
 if(pessoasFornecidas!==undefined) {
  const pessoas=Array.isArray(pessoasFornecidas)?pessoasFornecidas:[];
  return <Contexto.Provider value={{pessoas,carregando:false,erro:'',carregar:()=>{}}}>{children}</Contexto.Provider>;
 }
 return <PessoasRHRemotasProvider>{children}</PessoasRHRemotasProvider>;
}
function PessoasRHRemotasProvider({children}) {
 const [pessoas,setPessoas]=useState([]),[carregando,setCarregando]=useState(true),[erro,setErro]=useState('');
 const consulta=useRef(0);
 const carregar=useCallback(async()=>{
  const atual=++consulta.current;
  setCarregando(true);setErro('');
  try{const lista=await lerPessoasPatrimonio();if(atual===consulta.current)setPessoas(lista);}
  catch(e){if(atual===consulta.current)setErro(e.message);}
  finally{if(atual===consulta.current)setCarregando(false);}
 },[]);
 useEffect(()=>{const contador=consulta;carregar();return()=>{contador.current++;};},[carregar]);
 const valor=useMemo(()=>({pessoas,carregando,erro,carregar}),[pessoas,carregando,erro,carregar]);
 return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}
export const usePessoasRH=()=>useContext(Contexto);
export function comNomeRH(registro,pessoas,campo='responsavel') {
 const id=registro?.[campo+'Id'];
 const pessoa=id?pessoas.find(p=>p.id===id):null;
 return pessoa?{...registro,[campo]:pessoa.nome}:registro;
}

export default function PessoaRH({rotulo='Responsável',valor='',nome='',aoMudar,obrigatorio=false}) {
 const {pessoas,carregando,erro,carregar}=usePessoasRH(),id=useId();
 const existe=pessoas.some(p=>p.id===valor),legado=!valor&&!!nome;
 const selecionado=legado?'__legado__':valor;
 return <div className="pat-person-rh">
  <label className="label" htmlFor={id}>{rotulo}</label>
  <select className="input" id={id} value={selecionado} required={obrigatorio} disabled={carregando||!!erro} onChange={e=>{
   const escolhido=pessoas.find(p=>p.id===e.target.value);
   if(e.target.value==='__legado__')return;
   aoMudar(escolhido?.id||'',escolhido?.nome||'');
  }}>
   <option value="">{carregando?'Consultando RH…':'Sem pessoa vinculada'}</option>
   {legado&&<option value="__legado__" disabled>{nome} · cadastro antigo, vincule ao RH</option>}
   {valor&&!existe&&<option value={valor}>{nome||'Pessoa vinculada'} · indisponível no RH</option>}
   {pessoas.filter(p=>p.disponivel||p.id===valor).map(p=><option key={p.id} value={p.id}>{p.nome}{!p.disponivel?' · fora do quadro':''}{pessoas.filter(o=>o.nome===p.nome).length>1?' · ID '+p.id:''}</option>)}
  </select>
  {erro?<small role="alert">{erro} <button type="button" className="btn-ghost" onClick={carregar}>Tentar novamente</button></small>:<small>{legado?'Escolha o colaborador para confirmar o vínculo.':'Pessoas cadastradas no RH.'}</small>}
 </div>;
}
