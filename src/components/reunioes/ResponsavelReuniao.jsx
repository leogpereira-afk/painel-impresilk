import {useState} from 'react';
import {filtrarPessoas,identificarPessoa} from './pessoas.js';

export default function ResponsavelReuniao({valor,aoMudar,catalogo,titulo='Responsável',obrigatorio=false}){
 const [busca,setBusca]=useState(''),[aberto,setAberto]=useState(false);
 const {pessoas,carregando,erro}=catalogo,visiveis=filtrarPessoas(pessoas,busca);
 function escolher(p){aoMudar({responsavel:p.nome,responsavelRhId:p.id,responsavelIdPessoa:p.idPessoa||''});setBusca('');setAberto(false);}
 return <div className="reu-responsavel"><label><span>{titulo}{obrigatorio?' *':''}</span><input aria-label={titulo} required={obrigatorio} maxLength={180} value={valor.responsavel||''} onChange={e=>aoMudar({responsavel:e.target.value,responsavelRhId:'',responsavelIdPessoa:''})}/></label>
 <div className="reu-responsavel-identidade"><small>{valor.responsavelRhId?identificarPessoa({rhId:valor.responsavelRhId,idPessoa:valor.responsavelIdPessoa}):'Nome informado · sem vínculo RH'}</small><button type="button" className="btn-ghost" aria-expanded={aberto} onClick={()=>setAberto(v=>!v)}>{aberto?'Fechar busca':'Escolher no RH'}</button></div>
 {aberto&&<div className="reu-responsavel-busca"><input type="search" aria-label={`Buscar ${titulo.toLowerCase()} no RH`} placeholder="Nome, ID oficial ou ficha RH" value={busca} onChange={e=>setBusca(e.target.value)}/>{carregando?<p role="status">Carregando pessoas…</p>:erro?<p className="reu-erro" role="alert">{erro}<button type="button" onClick={catalogo.carregar}>Tentar novamente</button></p>:<ul>{visiveis.slice(0,30).map(p=><li key={p.id}><button type="button" onClick={()=>escolher(p)}><strong>{p.nome}</strong><small>{identificarPessoa(p)} · {p.area}</small></button></li>)}{!visiveis.length&&<li>Nenhuma pessoa encontrada.</li>}{visiveis.length>30&&<li className="reu-ajuda">Refine a busca para encontrar outras pessoas.</li>}</ul>}</div>}
 </div>;
}
