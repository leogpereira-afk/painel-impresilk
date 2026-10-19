import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {BellRing,CalendarDays} from 'lucide-react';
import {listarAvisosReunioes} from '../services/reunioes.js';
import './aviso-reunioes.css';

export default function AvisoReunioes(){
 const [avisos,setAvisos]=useState([]),[erro,setErro]=useState(''),[tentativa,setTentativa]=useState(0);
 useEffect(()=>{
  let ativo=true,controller,ultimo=0;
  async function atualizar(evento){
   if(document.hidden)return;
   if(evento?.type==='focus'&&Date.now()-ultimo<10000)return;
   ultimo=Date.now();controller?.abort();const pedido=new AbortController();controller=pedido;
   try{const resposta=await listarAvisosReunioes(pedido.signal);if(ativo&&!pedido.signal.aborted){setAvisos(resposta.avisos);setErro(resposta.aviso||'');}}
   catch{if(ativo&&!pedido.signal.aborted){setAvisos([]);setErro('Não foi possível conferir seus avisos de reunião.');}}
  }
  atualizar();const timer=setInterval(atualizar,60000);
  window.addEventListener('focus',atualizar);window.addEventListener('reunioes-atualizadas',atualizar);document.addEventListener('visibilitychange',atualizar);
  return ()=>{ativo=false;controller?.abort();clearInterval(timer);window.removeEventListener('focus',atualizar);window.removeEventListener('reunioes-atualizadas',atualizar);document.removeEventListener('visibilitychange',atualizar);};
 },[tentativa]);
 if(erro)return <aside className="aviso-reunioes aviso-reunioes-erro" aria-label="Avisos de reuniões"><CalendarDays size={18}/><span>{erro}</span><button type="button" onClick={()=>setTentativa(n=>n+1)}>Atualizar</button><Link to="/reunioes">Ver reuniões</Link></aside>;
 if(!avisos.length)return null;
 const linha=r=><div className="aviso-reuniao-linha" key={r.id}><BellRing size={20} aria-hidden="true"/><div><strong>{r.quando} · {r.inicio}–{r.fim} — {r.titulo}</strong><p>{r.local||'Local a combinar'}{r.pendente?' · Sua presença está a confirmar.':' · Você está na lista de participantes.'}</p></div><Link className="btn-primary" to={'/reunioes?encontro='+encodeURIComponent(r.id)}>{r.pendente?'Ver reunião e confirmar':'Ver reunião'}</Link></div>;
 return <aside className="aviso-reunioes" aria-label="Suas próximas reuniões" aria-live="polite">{linha(avisos[0])}{avisos.length>1&&<details><summary>Mais {avisos.length-1} encontro(s) nos próximos 7 dias</summary>{avisos.slice(1).map(linha)}</details>}</aside>;
}
