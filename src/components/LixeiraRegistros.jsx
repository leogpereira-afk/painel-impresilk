import {useCallback,useEffect,useState} from 'react';
import {comCracha,mensagemDoStatus} from '../lib/sessao.js';
import {API} from '../lib/api.js';
// A lixeira dos cadastros. Mora dentro do grupo "Cadastros retirados" das
// Configuracoes, e so e montada quando o grupo abre pela primeira vez: a lista
// so e pedida ao servidor quando alguem quer ve-la.
async function chamar(action,id){
 const r=await comCracha(`${API}/painel-config`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,id})});
 const b=await r.json();if(!r.ok)throw new Error(b.erro||mensagemDoStatus(r.status));return b;
}
export default function LixeiraRegistros(){
 const [itens,setItens]=useState(null),[erro,setErro]=useState(''),[ocupado,setOcupado]=useState(false);
 const carregar=useCallback(async()=>{setOcupado(true);setErro('');try{setItens((await chamar('lixeiraRegistros')).itens||[]);}catch(e){setErro(e.message);}finally{setOcupado(false);}},[]);
 async function recuperar(item){setOcupado(true);setErro('');try{await chamar('recuperarRegistro',item.id);setItens(lista=>lista.filter(x=>x.id!==item.id));}catch(e){setErro(e.message);}finally{setOcupado(false);}}
 useEffect(()=>{carregar();},[carregar]);
 return <div className="space-y-2">
 {erro&&<p role="alert" className="rounded-xl bg-bad-50 px-4 py-3 text-sm text-bad-700">{erro}</p>}
 {ocupado&&<p role="status" className="text-sm text-slate-500">Aguarde…</p>}
 {itens?.length===0&&<p className="text-sm text-slate-500">Nenhum cadastro na lixeira.</p>}
 {itens?.length>0&&<ul className="area-linhas">{itens.map(item=><li key={item.id} className="flex min-h-14 flex-wrap items-center justify-between gap-3 py-2"><div className="min-w-0"><p className="text-sm font-semibold text-slate-900">{item.nome}</p><p className="text-sm text-slate-500">{item.colecao} · {new Date(item.retiradoEm).toLocaleDateString('pt-BR')}</p></div><button type="button" className="btn-outline h-10" disabled={ocupado} onClick={()=>recuperar(item)} aria-label={`Recuperar ${item.nome}`}>Recuperar</button></li>)}</ul>}
 <button type="button" className="btn-ghost h-10" disabled={ocupado} onClick={carregar}>Atualizar lixeira</button>
 </div>;
}
