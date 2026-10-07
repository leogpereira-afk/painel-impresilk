import {useEffect,useId,useRef,useState} from 'react';
import {Search,Users,ArrowUpRight} from 'lucide-react';
import {chamarComercial} from '../services/comercial.js';
const documentoFormatado=v=>/^\d{14}$/.test(v)?v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5'):v||'Documento não informado';
export default function ConsultaClientes({clientesAutorizados,abrirCliente}){
 const id=useId(),pedido=useRef(null),sequencia=useRef(0);
 const [busca,setBusca]=useState(''),[resultado,setResultado]=useState(null),[erro,setErro]=useState(''),[carregando,setCarregando]=useState(false);
 useEffect(()=>()=>{sequencia.current++;pedido.current?.abort();},[]);
 function mudarBusca(v){sequencia.current++;pedido.current?.abort();setBusca(v);setResultado(null);setErro('');setCarregando(false);}
 async function consultar(pagina=1){
  pedido.current?.abort();const controle=new AbortController(),numero=++sequencia.current;pedido.current=controle;
  setCarregando(true);setErro('');setResultado(null);
  try{const r=await chamarComercial('consultarClientes',{busca:busca.trim(),pagina},controle.signal);if(numero===sequencia.current)setResultado(r);}
  catch(e){if(numero===sequencia.current&&!controle.signal.aborted)setErro(e.message);}
  finally{if(numero===sequencia.current)setCarregando(false);}
 }
 return <section className="com-card com-customer-lookup sem-impressao" aria-labelledby={id+'-titulo'}>
  <div className="com-lookup-heading"><div className="com-lookup-icon"><Users size={23} aria-hidden="true"/></div><div><p className="com-eyebrow">CONSULTA GERAL DE CADASTROS</p><h2 id={id+'-titulo'}>Este cliente já está cadastrado?</h2><p>Pesquise em todas as carteiras, incluindo clientes de outras vendedoras. A consulta independe do período selecionado.</p></div></div>
  <form className="com-lookup-form" onSubmit={e=>{e.preventDefault();consultar();}}>
   <label htmlFor={id+'-busca'}>Nome, razão social ou CNPJ<div className="com-lookup-input"><Search size={18} aria-hidden="true"/><input id={id+'-busca'} aria-label="Nome, razão social ou CNPJ" value={busca} maxLength={160} onChange={e=>mudarBusca(e.target.value)} placeholder="Ex.: nome da empresa ou 00.000.000/0001-00" autoComplete="off" required aria-describedby={id+'-ajuda'}/>{busca&&<button type="button" className="com-link" onClick={()=>mudarBusca('')} aria-label="Limpar consulta de cadastros">Limpar</button>}</div></label>
   <button className="btn-primary" disabled={carregando||!busca.trim()}><Search size={17}/>{carregando?'Consultando…':'Consultar cadastro'}</button>
  </form>
  <p id={id+'-ajuda'} className="com-muted com-lookup-help">Use pelo menos 3 letras ou números. O CNPJ funciona com ou sem pontuação. Encontrar um cadastro não altera seu responsável.</p>
  {erro&&<p role="alert" className="com-alert">{erro}</p>}
  <div aria-live="polite" aria-busy={carregando}>
   {resultado&&<><div className="com-lookup-summary"><strong>{resultado.total===0?'Nenhum cadastro encontrado':`${resultado.total} ${resultado.total===1?'cadastro encontrado':'cadastros encontrados'}`}</strong><small>Base sincronizada: {resultado.atualizadoEm?new Date(resultado.atualizadoEm).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'horário de atualização não disponível'}</small></div>
   {!resultado.total&&<p className="com-empty">Confira o nome ou tente o CNPJ completo. Se o cadastro foi criado recentemente, confirme no Mubisys antes de cadastrar novamente.</p>}
   <div className="com-lookup-results">{resultado.clientes.map(c=>{const autorizado=clientesAutorizados.find(a=>String(a.id)===c.id);return <article className="com-lookup-result" key={c.id}>
    <div><h3>{c.nome}</h3>{c.razaoSocial&&c.razaoSocial!==c.nome&&<p>{c.razaoSocial}</p>}<p className="com-lookup-document">{documentoFormatado(c.documento)} <span>· Cadastro #{c.id}</span></p></div>
    <div className="com-lookup-owner"><span>Responsável atual</span><strong>{c.responsavel||'Não informado no cadastro'}</strong>{c.status&&<small>{c.status}</small>}</div>
    {autorizado?<button className="com-link" onClick={()=>abrirCliente(autorizado)}>Histórico autorizado <ArrowUpRight size={15}/></button>:<small className="com-lookup-basic">Consulta cadastral</small>}
   </article>;})}</div>
   {resultado.paginas>1&&<nav className="com-lookup-pagination" aria-label="Páginas da consulta de clientes"><button className="btn-outline" disabled={resultado.pagina===1||carregando} onClick={()=>consultar(resultado.pagina-1)}>Anterior</button><span>Página {resultado.pagina} de {resultado.paginas}</span><button className="btn-outline" disabled={resultado.pagina===resultado.paginas||carregando} onClick={()=>consultar(resultado.pagina+1)}>Próxima</button></nav>}
   </>}
  </div>
 </section>;
}
