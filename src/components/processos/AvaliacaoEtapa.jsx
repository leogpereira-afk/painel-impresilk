import {useState} from 'react';
import {Campo} from './EditorProcesso.jsx';
export const qualidade=nota=>nota<6?{classe:'melhorar',texto:'Precisa melhorar'}:nota<9?{classe:'bom',texto:'Bom'}:{classe:'excelente',texto:'Excelente'};
export default function AvaliacaoEtapa({etapa,podeAvaliar,ocupado,executar}){
 const historico=etapa.avaliacoes||[],atual=historico.at(-1),[editar,setEditar]=useState(false),[nota,setNota]=useState(''),[comentario,setComentario]=useState('');
 const q=atual?qualidade(atual.pontuacao):null;
 return <div className="processo-avaliacao">
  <div className="processo-linha"><span className={'processo-qualidade '+(q?.classe||'')}><strong>{atual?`${atual.pontuacao.toLocaleString('pt-BR')}/10 · ${q.texto}`:'Ainda sem avaliação'}</strong></span>{podeAvaliar&&!editar&&<button className="btn-outline" disabled={ocupado} onClick={()=>{setNota(atual?.pontuacao??'');setComentario(atual?.comentario||'');setEditar(true);}}>Avaliar qualidade</button>}</div>
  {atual&&<p className="text-sm whitespace-pre-wrap">{atual.comentario}</p>}
  {editar&&<form className="processo-form mt-2" onSubmit={e=>{e.preventDefault();executar('avaliarEtapa',{etapaId:etapa.id,pontuacao:Number(nota),comentario}).then(ok=>{if(ok)setEditar(false);});}}><Campo nome="Nota da qualidade (0 a 10)"><input className="input" type="number" min="0" max="10" step="0.1" required value={nota} disabled={ocupado} onChange={e=>setNota(e.target.value)}/></Campo><Campo nome="O que ficou bom e o que precisa melhorar"><textarea className="input" required maxLength={3000} value={comentario} disabled={ocupado} onChange={e=>setComentario(e.target.value)}/></Campo><p className="processo-ajuda">Abaixo de 6: precisa melhorar · de 6 a 8,9: bom · de 9 a 10: excelente. Avaliar não altera o progresso nem conclui a etapa. O consultor vê este retorno.</p><div className="processo-linha"><button className="btn-primary" disabled={ocupado}>Salvar avaliação</button><button className="btn-outline" type="button" disabled={ocupado} onClick={()=>setEditar(false)}>Cancelar avaliação</button></div></form>}
  {!!historico.length&&<details className="mt-2"><summary className="text-xs cursor-pointer">Histórico de avaliações · {historico.length}</summary>{historico.slice().reverse().map((a,i)=><p key={i} className="text-xs mt-2 whitespace-pre-wrap">{new Date(a.em).toLocaleString('pt-BR')} · {a.nome} · {a.pontuacao}/10 — {a.comentario}</p>)}</details>}
 </div>;
}
