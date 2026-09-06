export const CHECKLIST_EDITAL = ['Ler o edital e registrar exigências','Conferir documentos de habilitação','Validar custo e capacidade de entrega','Revisar proposta técnica e comercial','Conferir envio e acesso à sessão'];
export function pendenciasEdital(it){return (it.acompanhamento?.checklist || []).filter(c=>!c.feito).length;}
export function FormPreparacao({form,setForm}){
 const a=form.acompanhamento||{};
 const set=(k,v)=>setForm(f=>({...f,acompanhamento:{...f.acompanhamento,[k]:v}}));
 return <fieldset className="sm:col-span-2 rounded-xl border p-4 space-y-4"><legend className="px-2 font-semibold">Preparação e acompanhamento</legend><div className="grid gap-4 sm:grid-cols-2">
 <label className="label">Responsável<input className="input" value={form.responsavel||''} onChange={e=>setForm(f=>({...f,responsavel:e.target.value}))}/></label>
 <label className="label">Próxima ação<input className="input" value={a.proximaAcao||''} onChange={e=>set('proximaAcao',e.target.value)} placeholder="Ex.: conferir documentação com o contador"/></label>
 <label className="label">Prazo da próxima ação<input className="input" type="date" value={a.prazoAcao||''} onChange={e=>set('prazoAcao',e.target.value)}/></label>
 <label className="label">Decisão e justificativa<textarea className="input" value={a.decisao||''} onChange={e=>set('decisao',e.target.value)} placeholder="Por que participar; capacidade, custo e exigências pendentes"/></label>
 </div><p className="text-sm text-slate-600">Checklist opcional · adicione somente as etapas úteis para este edital.</p>
 {!a.checklist?.length&&<button type="button" className="btn-outline" onClick={()=>set('checklist',CHECKLIST_EDITAL.map((texto,i)=>({id:`base-${i}`,texto,feito:false})))}>Usar modelo de preparação</button>}
 {(a.checklist||[]).map((c,i)=><div key={c.id} className="flex items-center gap-2"><input aria-label={`Concluir ${c.texto}`} type="checkbox" checked={!!c.feito} onChange={e=>set('checklist',a.checklist.map((x,j)=>j===i?{...x,feito:e.target.checked}:x))}/><input aria-label={`Descrição do item ${i+1}`} className="input" value={c.texto} onChange={e=>set('checklist',a.checklist.map((x,j)=>j===i?{...x,texto:e.target.value}:x))}/><button type="button" className="btn-ghost" aria-label={`Remover item ${i+1}`} onClick={()=>set('checklist',a.checklist.filter((_,j)=>i!==j))}>×</button></div>)}
 <button type="button" className="btn-outline" disabled={(a.checklist||[]).length>=30} onClick={()=>set('checklist',[...(a.checklist||[]),{id:crypto.randomUUID(),texto:'',feito:false}])}>Adicionar item</button>
 {['ganha','perdida','fora'].includes(form.status)&&<div className="grid gap-4 sm:grid-cols-2"><label className="label">Resultado e aprendizado<textarea className="input" value={a.resultado||''} onChange={e=>set('resultado',e.target.value)} placeholder="Motivo de perda, desistência ou observação do resultado"/></label><label className="label">Valor contratado confirmado (R$)<input className="input" inputMode="decimal" value={a.valorContratado||''} onChange={e=>set('valorContratado',e.target.value)}/></label></div>}
 </fieldset>;
}
