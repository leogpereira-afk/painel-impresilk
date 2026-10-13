import {createContext,useCallback,useContext,useEffect,useMemo,useState,useId,useRef} from 'react';
import {lerPessoasPatrimonio} from '../../services/patrimonio.js';
import {rotuloPessoa,pessoaDoVinculo,sugerirPessoa,MOTIVO_SEM_SUGESTAO} from '../../lib/calc/pessoas-rh.js';

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
// Nome e ID da empresa sempre do RH. Se a ficha sumiu (unificada ou recriada), o ID
// da empresa gravado no vínculo acha a ficha viva da mesma pessoa.
export function comNomeRH(registro,pessoas,campo='responsavel') {
 const pessoa=pessoaDoVinculo(pessoas,registro?.[campo+'Id'],registro?.[campo+'IdPessoa']);
 return pessoa?{...registro,[campo+'Id']:pessoa.id,[campo]:pessoa.nome,[campo+'IdPessoa']:pessoa.idPessoa||''}:registro;
}

// Só funcionários ativos no RH (a régua oficial vem do servidor em `disponivel`).
// Quem já estava ligado e saiu aparece só na própria ficha, marcado.
export default function PessoaRH({rotulo='Responsável',valor='',nome='',aoMudar,obrigatorio=false}) {
 const {pessoas,carregando,erro,carregar}=usePessoasRH(),id=useId();
 const atual=valor?pessoas.find(p=>p.id===valor):null,legado=!valor&&!!nome;
 const selecionado=legado?'__legado__':valor;
 const sugestao=legado&&!carregando&&!erro?sugerirPessoa(nome,pessoas):null;
 // Sem ID da empresa, o homônimo ainda precisa de algo que o diferencie.
 const textoOpcao=p=>rotuloPessoa(p)+(!p.idPessoa&&pessoas.filter(o=>o.nome===p.nome).length>1?' · ficha '+p.id:'');
 return <div className="pat-person-rh">
  <label className="label" htmlFor={id}>{rotulo}</label>
  <select className="input" id={id} value={selecionado} required={obrigatorio} disabled={carregando||!!erro} onChange={e=>{
   const escolhido=pessoas.find(p=>p.id===e.target.value);
   if(e.target.value==='__legado__')return;
   aoMudar(escolhido?.id||'',escolhido?.nome||'');
  }}>
   <option value="">{carregando?'Consultando RH…':'Sem pessoa vinculada'}</option>
   {legado&&<option value="__legado__" disabled>{nome} · nome digitado, sem ID do RH</option>}
   {valor&&!atual&&<option value={valor}>{nome||'Pessoa vinculada'} · indisponível no RH</option>}
   {pessoas.filter(p=>p.disponivel||p.id===valor).map(p=><option key={p.id} value={p.id}>{textoOpcao(p)}{!p.disponivel?' · fora do quadro':''}</option>)}
  </select>
  {erro?<small role="alert">{erro} <button type="button" className="btn-ghost" onClick={carregar}>Tentar novamente</button></small>
   :legado?<small>{sugestao?.pessoa?<>Sugestão pelo nome: <strong>{rotuloPessoa(sugestao.pessoa)}</strong> <button type="button" className="btn-ghost" onClick={()=>aoMudar(sugestao.pessoa.id,sugestao.pessoa.nome)}>Usar</button></>:(MOTIVO_SEM_SUGESTAO[sugestao?.motivo]||'Escolha a pessoa no RH para gravar pelo ID.')}</small>
   :<small>{atual&&!atual.disponivel?'Esta pessoa não está ativa no RH. Troque por quem está com o item.':'Só funcionários ativos no RH, com o ID da empresa.'}</small>}
 </div>;
}
