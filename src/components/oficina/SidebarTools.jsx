import {useEffect,useRef,useState} from 'react';
import './sidebar-tools.css';
const normalize=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export default function SidebarTools({scopeKey}){
 const root=useRef(null),[query,setQuery]=useState('');
 useEffect(()=>setQuery(''),[scopeKey]);
 useEffect(()=>{const panel=root.current?.parentElement;if(!panel)return;const sections=[...panel.querySelectorAll('details.of-block,details.op-block')];for(const section of sections){const match=!query||normalize(section.textContent).includes(normalize(query));section.hidden=!match;if(query&&match)section.open=true;}return()=>{for(const section of sections)section.hidden=false}},[query,scopeKey]);
 function expand(open){setQuery('');root.current?.parentElement.querySelectorAll('details.of-block,details.op-block').forEach(section=>{section.hidden=false;section.open=open})}
 return <div className="workshop-sidebar-tools" ref={root}><label><span>Encontrar configuração</span><input type="search" value={query} placeholder="Medidas, encaixes, material…" onChange={e=>setQuery(e.target.value)}/></label><div><button onClick={()=>expand(false)}>Recolher seções</button><button onClick={()=>expand(true)}>Expandir seções</button></div></div>;
}
