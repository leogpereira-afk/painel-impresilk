import {useEffect,useState} from 'react';
import {chamarProcesso} from '../services/processos.js';
import {NIVEIS_CONSULTORIA} from '../../supabase/functions/_shared/processos.mjs';
import FichaProcesso from '../components/processos/FichaProcesso.jsx';
// O segredo fica somente em memória. O fragmento nunca é enviado ao servidor web.
const lerToken=()=>new URLSearchParams(import.meta.env.MODE==='review'?window.location.hash.split('?')[1]||'':window.location.hash.slice(1)).get('convite')||'';
export default function ColaborarProcesso(){
 const [token,setToken]=useState(lerToken);
 useEffect(()=>{const receber=()=>{const recebido=lerToken();if(recebido)setToken(recebido);};window.addEventListener('hashchange',receber);return()=>window.removeEventListener('hashchange',receber);},[]);
 const [item,setItem]=useState(null),[erro,setErro]=useState(''),[tentativa,setTentativa]=useState(0);
 useEffect(()=>{if(window.location.hash.startsWith('#convite='))window.history.replaceState(null,'',window.location.pathname+window.location.search);let ativo=true;setItem(null);if(!token){setErro('Abra o link completo recebido do responsável pela consultoria.');return;}chamarProcesso('obter',{},token).then(r=>{if(ativo){setItem(r.item);setErro('');}}).catch(e=>{if(ativo)setErro(e.message);});return()=>{ativo=false;};},[tentativa,token]);
 return <main className="min-h-screen bg-slate-50 p-3 md:p-5"><div className="max-w-6xl mx-auto space-y-3"><header className="border-b pb-3"><p className="font-bold text-indigo-700">Impresilk · Consultorias</p><h1 className="text-xl font-semibold mt-1">Área de colaboração</h1><p className="text-sm text-slate-500">Seu acesso é exclusivo a este trabalho. Acompanhe o trabalho, as etapas e os materiais conforme seu nível de acesso.</p></header>{erro?<div role="alert" className="rounded-xl border bg-white p-4">{erro}{token&&<button className="btn-outline ml-3" onClick={()=>setTentativa(x=>x+1)}>Tentar novamente</button>}</div>:!item?<p role="status">Conferindo o convite…</p>:<><p className="text-sm text-slate-500">{NIVEIS_CONSULTORIA[item.convidado.nivel]} · Convite de {item.convidado.nome}. {item.podeContribuir===false?'Este acesso permite apenas consultar o conteúdo compartilhado.':'Registros enviados ficam identificados com este convite.'} Não compartilhe este link.</p><FichaProcesso item={item} aoAtualizar={setItem} convite={token}/></>}</div></main>;
}
