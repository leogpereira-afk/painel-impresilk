import {useCallback,useEffect,useRef,useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {PageTitle,Card} from '../components/ui.jsx';
import {SITUACOES,SETORES} from '../../supabase/functions/_shared/processos.mjs';
import {chamarProcesso} from '../services/processos.js';
import EditorProcesso from '../components/processos/EditorProcesso.jsx';
import FichaProcesso from '../components/processos/FichaProcesso.jsx';
export default function Processos({tipo}){
 const [params,setParams]=useSearchParams(),id=params.get('processo');
 const [itens,setItens]=useState([]),[pessoas,setPessoas]=useState([]),[carregando,setCarregando]=useState(true),[erro,setErro]=useState(''),[ocupado,setOcupado]=useState(false),[editor,setEditor]=useState(null),[busca,setBusca]=useState(''),[filtro,setFiltro]=useState('abertos');
 const seq=useRef(0);
 const carregar=useCallback(async()=>{const atual=++seq.current;setCarregando(true);setErro('');try{const [r,p]=await Promise.all([chamarProcesso('listar'),chamarProcesso('pessoas')]);if(seq.current===atual){setItens(r.itens);setPessoas(p.pessoas);}}catch(e){if(seq.current===atual)setErro(e.message);}finally{if(seq.current===atual)setCarregando(false);}},[]);
 useEffect(()=>{carregar();},[carregar]);
 const mudarId=id=>setParams(p=>{const n=new URLSearchParams(p);if(id)n.set('processo',id);else n.delete('processo');return n;});
 const atualizar=item=>setItens(xs=>xs.some(x=>x.id===item.id)?xs.map(x=>x.id===item.id?item:x):[item,...xs]);
 const selecionado=itens.find(x=>x.id===id&&x.tipo===tipo);
 const lista=itens.filter(x=>x.tipo===tipo),abertos=lista.filter(x=>!['concluida','cancelada'].includes(x.situacao));
 const hoje=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
 const visiveis=lista.filter(x=>(filtro==='todos'||filtro==='abertos'&&!['concluida','cancelada'].includes(x.situacao)||x.situacao===filtro)&&[x.titulo,x.empresa,...x.envolvidos.map(p=>p.nome)].join(' ').toLocaleLowerCase().includes(busca.toLocaleLowerCase()));
 async function salvar(item){setOcupado(true);setErro('');try{const r=await chamarProcesso('salvar',{item});atualizar(r.item);setEditor(null);mudarId(r.item.id);}catch(e){setErro(e.message);}finally{setOcupado(false);}}
 return <div className="space-y-4"><PageTitle titulo={tipo==='consultoria'?'Consultorias':'Demandas'} descricao={tipo==='consultoria'?'Consultorias, pessoas e plano de trabalho. Cada etapa com responsável e prazo.':'Do problema à solução: reúna pessoas, materiais, decisões e etapas.'} acao={<button className="btn-primary" disabled={carregando||!!editor} onClick={()=>{setErro('');setEditor({novo:true});}}>+ Nova {tipo==='consultoria'?'consultoria':'demanda'}</button>}/>
 {erro&&<div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">{erro}<button className="underline ml-3" disabled={carregando} onClick={carregar}>Atualizar</button></div>}
 {carregando&&<p role="status">Carregando pessoas e processos…</p>}
 {editor?<Card><EditorProcesso item={editor.novo?null:editor} tipo={tipo} pessoas={pessoas} aoSalvar={salvar} aoCancelar={()=>{setEditor(null);setErro('');}} ocupado={ocupado}/></Card>:selecionado?<FichaProcesso key={selecionado.id} item={selecionado} aoAtualizar={atualizar} aoVoltar={()=>mudarId(null)} aoEditar={()=>{setErro('');setEditor(selecionado);}}/>:<>
 {id&&!carregando&&<p role="alert" className="text-sm text-amber-800">Processo não encontrado ou sem acesso. <button className="underline" onClick={()=>mudarId(null)}>Voltar à lista</button></p>}
 <div className="grid grid-cols-3 gap-3">{[[abertos.length,'Em andamento'],[abertos.filter(x=>x.prazo&&x.prazo<hoje||x.etapas.some(e=>e.prazo&&e.prazo<hoje&&e.situacao!=='concluida')).length,'Com prazo vencido'],[lista.filter(x=>x.situacao==='concluida').length,'Concluídas']].map(([v,n])=><div key={n} className="rounded-xl border bg-white p-3"><strong className="text-2xl">{v}</strong><span className="block text-xs text-slate-500">{n}</span></div>)}</div>
 <div className="flex flex-wrap gap-2"><input className="input flex-1 min-w-48" aria-label="Buscar processo" placeholder="Buscar assunto, consultoria ou pessoa…" value={busca} onChange={e=>setBusca(e.target.value)}/><select className="input" aria-label="Filtrar situação" value={filtro} onChange={e=>setFiltro(e.target.value)}><option value="abertos">Em andamento</option><option value="todos">Todas as situações</option>{Object.entries(SITUACOES).map(([k,n])=><option key={k} value={k}>{n}</option>)}</select><button className="btn-outline" disabled={carregando} onClick={carregar}>Atualizar</button></div>
 {!carregando&&!visiveis.length&&<Card><h2 className="font-semibold">Nenhuma {tipo==='consultoria'?'consultoria':'demanda'} neste filtro</h2><p className="text-sm text-slate-500 mt-1">Crie uma ficha, selecione as pessoas do RH e organize as etapas. Os prazos entram no calendário.</p></Card>}
 <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{visiveis.sort((a,b)=>(a.prazo||'9999').localeCompare(b.prazo||'9999')).map(x=><article key={x.id} className="rounded-2xl border bg-white p-4 space-y-3"><div className="flex justify-between gap-2 text-xs text-slate-500"><span>{SETORES[x.setor]}</span><span>{SITUACOES[x.situacao]}</span></div><h2 className="font-semibold text-lg">{x.titulo}</h2>{x.empresa&&<p className="text-sm text-teal-700">{x.empresa}</p>}<p className="text-sm text-slate-500">{x.envolvidos.find(p=>p.rhId===x.responsavelRhId)?.nome} · {x.envolvidos.length} envolvidos</p><p className="text-sm">{x.etapas.filter(e=>e.situacao==='concluida').length}/{x.etapas.length} etapas concluídas · {x.prazo?x.prazo.split('-').reverse().join('/'):'Sem prazo geral'}</p><button className="btn-outline w-full" onClick={()=>mudarId(x.id)}>Abrir processo</button></article>)}</div></>}
 </div>;
}
