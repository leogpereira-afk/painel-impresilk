import {useId,useState} from 'react';
import {Search,UserRound,X} from 'lucide-react';
import {normalizar} from './modelo-ui.mjs';
export function ChipsPessoas({pessoas=[],limite=3}){
 return <span className="plan-pessoas-mini">{pessoas.slice(0,limite).map(p=><span key={p.rhId} title={`${p.nome} · ID ${p.idPessoa}`}><UserRound size={12}/>{p.nome}</span>)}{pessoas.length>limite&&<span title={pessoas.slice(limite).map(p=>p.nome).join(', ')}>+{pessoas.length-limite}</span>}{!pessoas.length&&<span className="plan-sem-responsavel">Sem responsável</span>}</span>;
}
export default function Responsaveis({valor=[],pessoas=[],onChange,disabled=false,erro='',rotulo='Responsáveis da ação'}){
 const [busca,setBusca]=useState(''),[aberto,setAberto]=useState(false),id=useId(),texto=normalizar(busca);
 const opcoes=pessoas.filter(p=>p.disponivel!==false&&/^\d{6}$/.test(String(p.idPessoa||''))&&!valor.some(v=>v.rhId===p.rhId)&&normalizar([p.nome,p.idPessoa,p.setor].join(' ')).includes(texto));
 return <div className="plan-responsaveis"><label htmlFor={id}>{rotulo}</label><div className="plan-chips-pessoas">{valor.map(p=><span className="plan-pessoa-chip" key={p.rhId}><UserRound size={15}/><span>{p.nome}<small>ID {p.idPessoa||'a conferir'}{p.setor?` · ${p.setor}`:''}</small></span>{!disabled&&<button type="button" aria-label={`Retirar ${p.nome} de ${rotulo.toLowerCase()}`} onClick={()=>onChange(valor.filter(v=>v.rhId!==p.rhId))}><X size={14}/></button>}</span>)}{!valor.length&&<p className="plan-muted">Nenhuma pessoa selecionada.</p>}</div>
 {!disabled&&<><div className="plan-pesquisa-pessoas"><Search size={16}/><input id={id} type="search" value={busca} placeholder="Buscar nome ou ID do RH" onFocus={()=>setAberto(true)} onChange={e=>{setBusca(e.target.value);setAberto(true);}} disabled={!!erro} aria-expanded={aberto} aria-controls={`${id}-lista`}/><button type="button" className="plan-text-button" onClick={()=>setAberto(!aberto)} disabled={!!erro}>{aberto?'Recolher':'Ver pessoas'}</button></div>{erro?<p className="plan-alert" role="alert">{erro}</p>:aberto&&<div id={`${id}-lista`} className="plan-pessoas-opcoes">{opcoes.slice(0,40).map(p=><button key={p.rhId} type="button" onClick={()=>{onChange([...valor,{rhId:p.rhId,idPessoa:p.idPessoa,nome:p.nome,setor:p.setor||''}]);setBusca('');}}><span>{p.nome}<small>ID {p.idPessoa}{p.setor?` · ${p.setor}`:''}</small></span><b aria-hidden="true">+</b></button>)}{!opcoes.length&&<p>Nenhuma pessoa disponível para adicionar.</p>}{opcoes.length>40&&<p>Refine a busca para encontrar outras pessoas.</p>}</div>}</>}
 </div>;
}
