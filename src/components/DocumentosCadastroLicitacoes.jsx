import {useEffect,useRef,useState} from 'react';
import {Download} from 'lucide-react';
import {baixarDocumento} from '../services/documentos.js';
import {situacaoArquivoLicitacoes} from '../lib/calc/documentos-licitacoes.js';
import {aoMudarSessao,getToken} from '../lib/sessao.js';

export default function DocumentosCadastroLicitacoes({documentos,hoje,mostrarNome=true}){
 const [baixando,setBaixando]=useState(''),[erro,setErro]=useState('');
 const controle=useRef(null);
 useEffect(()=>{const c=new AbortController();controle.current=c;const parar=aoMudarSessao(()=>c.abort());return()=>{parar();c.abort();};},[]);
 async function baixar(d){
  const c=controle.current,token=getToken();if(!c||c.signal.aborted||baixando)return;
  const vigente=()=>!c.signal.aborted&&token===getToken();
  setBaixando(d.id);setErro('');
  try{await baixarDocumento(d,undefined,undefined,{signal:c.signal,podeAbrirArquivo:vigente});}
  catch(e){if(vigente())setErro(e.message);}
  finally{if(vigente())setBaixando('');}
 }
 return <div className="lac-linked-docs">
  {erro&&<p role="alert" className="lac-message is-bad">{erro}</p>}
  {documentos.map(d=>{const sit=situacaoArquivoLicitacoes(d,hoje);return <div className="lac-linked-doc" key={d.id}>
   <div>{mostrarNome&&<strong>{d.nome}</strong>}<small>{d.semVencimento?'Sem vencimento':d.validade?`Validade: ${d.validade.split('-').reverse().join('/')}`:'Validade não informada'} · {sit.rotulo}</small></div>
   {d.temArquivo&&<button type="button" className="btn-ghost" disabled={!!baixando} aria-label={`Baixar documento vinculado ${d.nome}`} onClick={()=>baixar(d)}><Download size={15}/>{baixando===d.id?'Baixando…':'Baixar'}</button>}
  </div>;})}
 </div>;
}
