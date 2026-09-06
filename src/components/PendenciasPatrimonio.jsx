import {useEffect,useState} from 'react';
import {resumoFotos} from '../services/fotos.js';
export default function PendenciasPatrimonio({bens,aoEditar,aoFotos}) {
  const [fotos,setFotos]=useState(null),[erro,setErro]=useState(''),[revisao,setRevisao]=useState(0);
  useEffect(()=>{let vivo=true;setErro('');resumoFotos().then(d=>{if(vivo)setFotos(d);}).catch(e=>{if(vivo)setErro(e.message);});return()=>{vivo=false;};},[revisao]);
  const pendentes=bens.map(b=>({bem:b,falta:[!b.codigo&&'Etiqueta',!b.responsavel&&'Responsável',!b.nf&&!b.motivoSemNota&&'Nota ou justificativa',fotos&&!fotos[b.id]&&'Foto'].filter(Boolean)})).filter(b=>b.falta.length).sort((a,b)=>Number(b.bem.valor)-Number(a.bem.valor));
  return <details className="card p-5"><summary className="cursor-pointer font-semibold">Completar cadastros · {pendentes.length} bens com pendências</summary>
    <p className="text-sm text-slate-500 mt-3">Prioridade pelo valor cadastrado. Registre a documentação ou o motivo da ausência e quem vai completar cada ficha.</p>
    <button className="btn-outline my-3" onClick={()=>setRevisao(n=>n+1)}>Conferir fotos novamente</button>
    {erro&&<p role="alert">Não foi possível conferir as fotos. {erro}</p>}{!fotos&&!erro&&<p role="status">Conferindo fotos…</p>}
    <div className="space-y-2">{pendentes.map(({bem:b,falta})=><article key={b.id} className="flex flex-wrap gap-3 items-center border-t py-3"><div className="min-w-0 flex-1"><h3 className="font-semibold">{b.codigo} · {b.nomeGenerico}</h3><p className="text-sm">{falta.join(' · ')}</p><p className="text-xs text-slate-500">Responsável: {b.responsavel || 'a definir'}{b.motivoSemNota&&` · Documento: ${b.motivoSemNota}`}</p></div><button className="btn-outline" onClick={()=>aoEditar(b)}>Completar ficha</button><button className="btn-ghost" onClick={()=>aoFotos(b)}>Fotos</button></article>)}</div>
  </details>;
}
