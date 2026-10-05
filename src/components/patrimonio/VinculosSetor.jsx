import {useState} from 'react';
import {AtualizacaoPatrimonio} from './Controles.jsx';
export default function VinculosSetor({setor,bens,setores,salvando,aoVincular}) {
 const [busca,setBusca]=useState(''),[selecionado,setSelecionado]=useState('');
 const atuais=bens.filter(b=>b.setorSigla===setor.sigla);
 const outros=bens.filter(b=>b.setorSigla!==setor.sigla&&`${b.codigo} ${b.nomeGenerico} ${b.descricaoTecnica}`.toLocaleLowerCase('pt-BR').includes(busca.toLocaleLowerCase('pt-BR')));
 const bem=bens.find(b=>b.id===selecionado);
 return <div className="pat-sector-links"><p>Vincule os bens que ficam em <strong>{setor.nome}</strong>. Ao transferir, a etiqueta do bem permanece a mesma.</p>
  <form onSubmit={async e=>{e.preventDefault();if(await aoVincular(bem,setor))setSelecionado('');}}>
   <fieldset disabled={salvando}><label className="label">Encontrar bem<input className="input" placeholder="Etiqueta ou equipamento" value={busca} onChange={e=>{setBusca(e.target.value);setSelecionado('');}}/></label>
   <label className="label">Bem para vincular<select className="input" required value={selecionado} onChange={e=>setSelecionado(e.target.value)}><option value="">Selecione um bem</option>{outros.map(b=><option key={b.id} value={b.id}>{b.codigo||'Sem etiqueta'} · {b.nomeGenerico} · {setores.find(s=>s.sigla===b.setorSigla)?.nome||'Sem setor'}{b.situacao==='baixado'?' · Baixado':''}</option>)}</select></label>
   {bem&&<p className="pat-footnote">{setores.find(s=>s.sigla===bem.setorSigla)?.nome||'Sem setor'} → {setor.nome}</p>}
   <button className="btn-primary" disabled={!bem||salvando}>{salvando?'Salvando…':'Confirmar vínculo'}</button></fieldset>
  </form><h3>Bens neste setor · {atuais.length}</h3>{atuais.length?<ul className="pat-sector-assets">{atuais.map(b=><li key={b.id}><strong>{b.codigo} · {b.nomeGenerico}</strong><span>{b.descricaoTecnica}{b.situacao==='baixado'?' · Baixado':''}</span><AtualizacaoPatrimonio registro={b}/></li>)}</ul>:<p>Nenhum bem vinculado.</p>}
 </div>;
}
