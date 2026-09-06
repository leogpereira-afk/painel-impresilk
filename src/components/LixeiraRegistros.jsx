import {useState} from 'react';
import {comCracha,mensagemDoStatus} from '../lib/sessao.js';
import {API} from '../lib/api.js';
export default function LixeiraRegistros(){
 const [itens,setItens]=useState(null),[erro,setErro]=useState(''),[ocupado,setOcupado]=useState(false);
 async function chamar(action,id){
  const r=await comCracha(`${API}/painel-config`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,id})});
  const b=await r.json();if(!r.ok)throw new Error(b.erro||mensagemDoStatus(r.status));return b;
 }
 async function carregar(){setOcupado(true);setErro('');try{setItens((await chamar('lixeiraRegistros')).itens||[]);}catch(e){setErro(e.message);}finally{setOcupado(false);}}
 async function recuperar(item){setOcupado(true);setErro('');try{await chamar('recuperarRegistro',item.id);setItens(lista=>lista.filter(x=>x.id!==item.id));}catch(e){setErro(e.message);}finally{setOcupado(false);}}
 return <details className="config-card" onToggle={e=>{if(e.currentTarget.open&&itens===null&&!ocupado)carregar();}}><summary><div><h3>Cadastros retirados</h3><p>Recupere cadastros com seus anexos. Documentos e equipamentos têm a própria lixeira.</p></div></summary><div className="config-card-conteudo">
 {erro&&<p role="alert">{erro}</p>}{ocupado&&<p role="status">Aguarde…</p>}
 {itens?.length===0&&<p>Nenhum cadastro na lixeira.</p>}
 {itens?.map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-3"><div><strong>{item.nome}</strong><p className="text-sm text-slate-500">{item.colecao} · {new Date(item.retiradoEm).toLocaleDateString('pt-BR')}</p></div><button className="btn-outline" disabled={ocupado} onClick={()=>recuperar(item)} aria-label={`Recuperar ${item.nome}`}>Recuperar</button></div>)}
 <button className="btn-ghost mt-3" disabled={ocupado} onClick={carregar}>Atualizar lixeira</button>
 </div></details>;
}
