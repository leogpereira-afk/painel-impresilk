import { useState } from 'react';
import { validarPlanejamento } from '../../supabase/functions/_shared/campanhas-planejamento.mjs';

export default function CampanhaPlanejamento({ campanha, aoSalvar }) {
  const [aberto,setAberto]=useState(false);
  const [rascunho,setRascunho]=useState(null);
  const [salvando,setSalvando]=useState(false);
  const [aviso,setAviso]=useState('');
  const plano=rascunho || campanha.planejamento || {consideracoes:'',estrategia:'',proximaCampanha:'',acoes:[]};
  const mudar=(campos)=>{setAviso('');setRascunho({...plano,...campos});};
  const mudarAcao=(id,campos)=>mudar({acoes:plano.acoes.map(a=>a.id===id?{...a,...campos}:a)});
  async function salvar(){
    setAviso('');setSalvando(true);
    try {
      const planejamento=validarPlanejamento(plano);
      const salvo=await aoSalvar(planejamento);
      if(!salvo?.planejamento || JSON.stringify(validarPlanejamento(salvo.planejamento))!==JSON.stringify(planejamento)) throw Error('Não foi possível confirmar o planejamento salvo. Seus campos foram preservados; tente novamente.');
      setRascunho(null);setAviso('Planejamento salvo. As ações vinculadas aparecem no Calendário da empresa.');
    } catch(e){setAviso(e.message);} finally {setSalvando(false);}
  }
  return <section className="rounded-xl border border-slate-200 bg-white p-4 print:hidden">
    <button type="button" className="btn-outline" aria-expanded={aberto} onClick={()=>setAberto(!aberto)}>Planejamento e estratégia {aberto?'▴':'▾'} · {plano.acoes?.length||0} {plano.acoes?.length===1?'ação':'ações'}{rascunho?' · alterações não salvas':''}</button>
    {aberto&&<div className="mt-4 space-y-4">
      <div className="grid gap-4 md:grid-cols-3">{[['consideracoes','Considerações e aprendizados'],['estrategia','Estratégia aplicada'],['proximaCampanha','O que fazer na próxima campanha']].map(([campo,rotulo])=><label key={campo} className="text-sm font-medium">{rotulo}<textarea disabled={salvando} className="input mt-1 min-h-28 w-full" maxLength={10000} value={plano[campo]||''} onChange={e=>mudar({[campo]:e.target.value})}/></label>)}</div>
      <p className="text-sm text-slate-500">Vincule as datas ao Calendário da empresa. Ações concluídas, canceladas e campanhas encerradas saem do calendário.</p>
      {plano.acoes.map(a=><fieldset key={a.id} className="grid gap-3 rounded-lg border p-3 md:grid-cols-2" disabled={salvando}>
        <label className="text-sm">Próxima ação<input className="input mt-1 w-full" maxLength={200} value={a.titulo} onChange={e=>mudarAcao(a.id,{titulo:e.target.value})}/></label>
        <label className="text-sm">Responsável<input className="input mt-1 w-full" maxLength={120} value={a.responsavel} onChange={e=>mudarAcao(a.id,{responsavel:e.target.value})}/></label>
        <label className="text-sm">Data<input type="date" className="input mt-1 w-full" value={a.data} onChange={e=>mudarAcao(a.id,{data:e.target.value})}/></label>
        <label className="text-sm">Situação<select className="input mt-1 w-full" value={a.status} onChange={e=>mudarAcao(a.id,{status:e.target.value})}><option value="pendente">Pendente</option><option value="concluida">Concluída</option><option value="cancelada">Cancelada</option></select></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={a.calendario} onChange={e=>mudarAcao(a.id,{calendario:e.target.checked})}/>Vincular ao calendário</label>
        <button type="button" className="btn-ghost justify-self-end" onClick={()=>mudar({acoes:plano.acoes.filter(x=>x.id!==a.id)})}>Remover ação</button>
      </fieldset>)}
      <div className="flex flex-wrap gap-2"><button type="button" className="btn-outline" disabled={salvando||plano.acoes.length>=100} onClick={()=>mudar({acoes:[...plano.acoes,{id:crypto.randomUUID(),titulo:'',responsavel:'',data:'',status:'pendente',calendario:false}]})}>+ Adicionar ação</button><button type="button" className="btn-primary" disabled={salvando||!rascunho} onClick={salvar}>{salvando?'Salvando…':'Salvar planejamento'}</button></div>
      {aviso&&<p role="status" className="text-sm">{aviso}</p>}
    </div>}
  </section>;
}
