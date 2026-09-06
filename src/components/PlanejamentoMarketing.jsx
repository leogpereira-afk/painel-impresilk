import {useMemo,useState} from 'react';
import {useApp} from '../config/store.jsx';
import {resolverOrcamentosMarketing} from '../lib/calc/marketing.js';
import {calcOrcamentos} from '../lib/calc/orcamentos.js';
import {moeda,paraNumero,paraCampo,ymdLocal,dataLonga} from '../lib/format.js';
import {salvarAcaoMarketing} from '../services/marketing.js';
import {Card,SectionTitle} from './ui.jsx';
const ETAPAS=['Ideia','Produção','Aprovação','Programada','Publicada','Encerrada'];
const vazio={nome:'',objetivo:'',publico:'',canal:'',responsavel:'',prazo:'',status:'Ideia',investimento:'',numeros:'',url:''};
export default function PlanejamentoMarketing({mapa,aoAtualizar}){
 const {dados,overridesOrcamentos,config}=useApp();
 const [form,setForm]=useState(null),[salvando,setSalvando]=useState(false),[erro,setErro]=useState(''),[mes,setMes]=useState(()=>ymdLocal(new Date()).slice(0,7));
 const orcs=useMemo(()=>dados?.orcamentos?calcOrcamentos(dados.orcamentos,overridesOrcamentos,config,{hoje:ymdLocal(new Date())}).lista:[],[dados,overridesOrcamentos,config]);
 const acoes=Object.entries(mapa||{}).filter(([,v])=>v.tipo==='acao').map(([id,v])=>({id,...v})).sort((a,b)=>(a.prazo||'9999').localeCompare(b.prazo||'9999'));
 const campo=k=>e=>setForm(f=>({...f,[k]:e.target.value}));
 const abrir=a=>{setErro('');setForm(a?{...vazio,...a,investimento:paraCampo(a.investimento),numeros:(a.orcamentos||[]).map(id=>orcs.find(o=>String(o.id)===id)?.numero || `id:${id}`).join(', ')}:{...vazio,id:`mkt-${crypto.randomUUID()}`});};
 async function salvar(e){e.preventDefault();setErro('');setSalvando(true);try{
  const ids=resolverOrcamentosMarketing(form.numeros,orcs,form.orcamentos||[]);
  if(acoes.some(a=>a.id!==form.id&&(a.orcamentos||[]).some(id=>ids.includes(id))))throw new Error('Um desses orçamentos já está vinculado a outra ação. Revise a origem para evitar contar a venda duas vezes.');
  const investimento=paraNumero(form.investimento);if(investimento<0)throw new Error('O investimento não pode ser negativo.');
  const {numeros:_,...registro}=form;
  aoAtualizar(await salvarAcaoMarketing(form.id,{...registro,orcamentos:ids,investimento}));setForm(null);
 }catch(e){setErro(e.message);}finally{setSalvando(false);}}
 return <Card><SectionTitle titulo="Marketing em execução" sub="Objetivo, responsável, prazo e oportunidades geradas por cada ação." acao={<button className="btn-primary" onClick={()=>abrir(null)}>Nova ação</button>}/>
 <label className="label mb-4">Mês do prazo<input className="input max-w-xs" type="month" value={mes} onChange={e=>setMes(e.target.value)}/></label>{mes?<button className="btn-ghost mb-3" onClick={()=>setMes('')}>Ver todos os meses</button>:<button className="btn-ghost mb-3" onClick={()=>setMes(ymdLocal(new Date()).slice(0,7))}>Mês atual</button>}
 {erro&&<p role="alert" className="rounded-lg bg-bad-50 p-3 text-bad-700 mb-3">{erro}</p>}
 {form&&<form className="rounded-xl border p-4 mb-5 space-y-4" onSubmit={salvar}><div className="grid gap-4 sm:grid-cols-2">
 {['nome','objetivo','publico','canal','responsavel'].map(k=><label className="label" key={k}>{{nome:'Ação',objetivo:'Objetivo',publico:'Público',canal:'Canal',responsavel:'Responsável'}[k]}<input className="input" required={['nome','responsavel'].includes(k)} value={form[k]} onChange={campo(k)}/></label>)}
 <label className="label">Prazo<input className="input" type="date" required value={form.prazo} onChange={campo('prazo')}/></label>
 <label className="label">Situação<select className="input" value={form.status} onChange={campo('status')}>{ETAPAS.map(s=><option key={s}>{s}</option>)}</select><small>Escolha a situação desta ação. Não é preciso passar por todas as etapas.</small></label>
 <label className="label">Investimento realizado (R$)<input className="input" inputMode="decimal" value={form.investimento} onChange={campo('investimento')}/></label>
 <label className="label">Orçamentos atribuídos à ação<input className="input" placeholder="Números separados por vírgula" value={form.numeros} onChange={campo('numeros')}/><small>Use os números do ERP. Associe somente quando a origem estiver confirmada.</small></label>
 <label className="label">Link da publicação ou material<input className="input" type="url" value={form.url} onChange={campo('url')}/></label>
 </div><button className="btn-primary" disabled={salvando}>{salvando?'Salvando…':'Salvar ação'}</button> <button type="button" className="btn-ghost" disabled={salvando} onClick={()=>setForm(null)}>Cancelar</button></form>}
 <div className="grid gap-3 lg:grid-cols-2">{acoes.filter(a=>(!mes||a.prazo?.startsWith(mes))).map(a=>{
 const vinculados=orcs.filter(o=>(a.orcamentos||[]).includes(String(o.id))),ganhos=vinculados.filter(o=>o.situacao==='ganho');const completa=vinculados.length===(a.orcamentos||[]).length;
 return <article key={a.id} className="rounded-xl border p-4 space-y-2"><div className="flex justify-between gap-3"><h3 className="font-semibold">{a.nome}</h3><span className="chip">{a.status}</span></div><p className="text-sm text-slate-600">{a.objetivo || 'Defina o objetivo desta ação.'}</p><p className="text-sm">{a.responsavel || 'Sem responsável'} · {a.canal || 'Sem canal'} · {a.prazo?dataLonga(a.prazo):'Sem prazo'}</p>{a.prazo<ymdLocal(new Date())&&!['Publicada','Encerrada'].includes(a.status)&&<p className="text-bad-700 text-sm">Prazo vencido · atualizar o próximo passo</p>}
 <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800">Investimento: <b>{moeda(a.investimento)}</b><br/>{completa?`${vinculados.length} propostas atribuídas · ${ganhos.length} ganhas · ${moeda(ganhos.reduce((s,o)=>s+o.valor,0))} em propostas ganhas`:'Parte dos orçamentos não está na base disponível; resultado incompleto.'}{completa&&vinculados.length>0&&<p>Custo por proposta: {moeda(a.investimento/vinculados.length)} · Conversão: {Math.round(ganhos.length/vinculados.length*100)}%</p>}</div>
 <button className="btn-outline" onClick={()=>abrir(a)}>Editar ação</button>{/^https?:\/\//i.test(a.url||'')&&<a className="btn-ghost" href={a.url} target="_blank" rel="noopener noreferrer">Abrir material ↗</a>}</article>;
 })}</div>{!acoes.filter(a=>(!mes||a.prazo?.startsWith(mes))).length&&<p className="text-sm text-slate-500 py-4">Nenhuma ação neste recorte. Cadastre uma ação com responsável e prazo para começar.</p>}
 <p className="text-xs text-slate-500 mt-4">Os resultados seguem os orçamentos vinculados e o estado atual da base. Proposta ganha não significa pagamento recebido; investimento é informado pela equipe.</p>
 </Card>;
}
