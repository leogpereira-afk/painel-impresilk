import { useEffect, useState } from 'react';
import { lerConferenciasBaixas, mesclarOverrideRecebivel } from '../services/marcacoes.js';
import { MOTIVOS_BAIXA, chaveBaixa, baixaConferida, prepararConferencia } from '../lib/calc/conferenciaBaixas.js';
import { moedaCheia } from '../lib/format.js';

export default function ConferenciaBaixas({ linhas }) {
  const [registros,setRegistros]=useState(null),[erro,setErro]=useState(''),[editando,setEditando]=useState(null);
  const [motivo,setMotivo]=useState(''),[nota,setNota]=useState(''),[salvando,setSalvando]=useState(false),[reler,setReler]=useState(0);
  useEffect(()=>{let vivo=true;setRegistros(null);setErro('');lerConferenciasBaixas().then(r=>{if(vivo)setRegistros(r)}).catch(e=>{if(vivo)setErro(e.message)});return()=>{vivo=false}},[reler]);
  const pendentes=linhas.filter(l=>!baixaConferida(l,registros?.[chaveBaixa(l)]));
  const conferidas=linhas.filter(l=>baixaConferida(l,registros?.[chaveBaixa(l)]));
  async function gravar(l,reabrir=false){
    setErro('');setSalvando(true);
    try{
      const patch=reabrir?{conferenciaBaixa:{...registros?.[chaveBaixa(l)]?.conferenciaBaixa,status:'pendente'}}:prepararConferencia(l,motivo,nota);
      await mesclarOverrideRecebivel(chaveBaixa(l),patch);
      setRegistros(r=>({...r,[chaveBaixa(l)]:{...r?.[chaveBaixa(l)],...patch}}));setEditando(null);
    }catch(e){setErro(e.message||'Não foi possível salvar. Tente novamente.')}finally{setSalvando(false)}
  }
  return <details className="rounded-xl border border-warn-200 bg-warn-50 p-4 text-sm text-warn-700">
    <summary className="cursor-pointer font-medium">Conferir baixas: {registros?`${pendentes.length} pendentes · ${moedaCheia(pendentes.reduce((s,l)=>s+l.diferenca,0))}`:'carregando conferências…'} · {conferidas.length} conferidas</summary>
    <p className="my-2">Diferenças de até 2% após pagamentos, sem título aberto. Confira o motivo antes de registrar. Esta ação organiza a pendência no painel; não altera pagamentos no Mubisys nem confirma quitação.</p>
    {erro&&<p role="alert" className="my-2 text-red-700">{erro} {!registros&&<button className="btn" onClick={()=>setReler(x=>x+1)}>Tentar novamente</button>}</p>}
    {registros&&pendentes.map(l=><div key={l.numero} className="border-t py-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><p>O.S. {l.numero} · {l.cliente}: líquido {moedaCheia(l.valor)}, recebido {moedaCheia(l.recebido)}, diferença <b>{moedaCheia(l.diferenca)}</b></p><button type="button" className="btn sem-impressao" disabled={salvando} onClick={()=>{setEditando(l.numero);setMotivo('');setNota('');setErro('')}}>Conferir O.S. {l.numero}</button></div>
      {registros[chaveBaixa(l)]?.conferenciaBaixa?.status==='conferida'&&<p>Os valores mudaram desde a última conferência. Confira novamente.</p>}
      {editando===l.numero&&<form className="mt-3 grid gap-3 sem-impressao" onSubmit={e=>{e.preventDefault();gravar(l)}}>
        <label>Motivo da diferença<select className="input w-full" required value={motivo} disabled={salvando} onChange={e=>setMotivo(e.target.value)}><option value="">Selecione</option>{MOTIVOS_BAIXA.map(m=><option key={m}>{m}</option>)}</select></label>
        <label>Como foi confirmado<textarea className="input w-full" required maxLength={2000} value={nota} disabled={salvando} onChange={e=>setNota(e.target.value)} placeholder="Documento, informação do financeiro ou ajuste conferido no ERP" /></label>
        <div className="flex gap-2"><button className="btn" disabled={salvando}>{salvando?'Salvando…':'Confirmar conferência'}</button><button type="button" className="btn" disabled={salvando} onClick={()=>setEditando(null)}>Cancelar</button></div>
      </form>}
    </div>)}
    {registros&&!pendentes.length&&<p className="py-3">Todas as diferenças atuais foram conferidas.</p>}
    {conferidas.length>0&&<details className="mt-3"><summary className="cursor-pointer">Ver conferidas ({conferidas.length})</summary>{conferidas.map(l=>{const c=registros[chaveBaixa(l)].conferenciaBaixa;return <div key={l.numero} className="border-t py-3"><p>O.S. {l.numero} · {l.cliente} · {moedaCheia(l.diferenca)} · {c.motivo}</p><p className="whitespace-pre-wrap">{c.nota}</p><button type="button" className="btn sem-impressao" disabled={salvando} onClick={()=>gravar(l,true)}>Reabrir conferência</button></div>})}</details>}
  </details>;
}
