import { useState } from 'react';
import ACMViewport from './ACMViewport.jsx';
import { flangeSection } from './viewportGeometry.mjs';
const edges = { left:'Esquerda', right:'Direita', top:'Superior', bottom:'Inferior' };
const fmt = value => Number(value.toFixed(2)).toLocaleString('pt-BR');

/** Engine-derived close-up. A nearby frame is context, never evidence of an attachment. */
export default function AssemblyDetail({ project, result, selectedId, onSelect, selectedStructureId, onSelectStructure }) {
  const [edge,setEdge]=useState('right'), [exploded,setExploded]=useState(false), [transparent,setTransparent]=useState(true), [view,setView]=useState('backIso'), [section,setSection]=useState(false);
  const piece=result.pieces.find(p=>p.id===selectedId)??result.pieces[0];
  const profile=piece?flangeSection(piece,edge):null;
  const points=[[-35,0],[0,0],...(profile?.segments.flatMap(s=>[s.start,s.end])??[])];
  const minX=Math.min(...points.map(p=>p[0]))-12,maxX=Math.max(...points.map(p=>p[0]))+12,minY=Math.min(...points.map(p=>p[1]))-12,maxY=Math.max(...points.map(p=>p[1]))+12;
  return <section className="acm-assembly-detail" aria-label="Detalhe construtivo do encaixe">
    <div className="acm-plan-toolbar"><label>Peça <select aria-label="Peça do detalhe" value={piece?.id??''} onChange={event=>onSelect?.(event.target.value)}>{result.pieces.map(p=><option key={p.id} value={p.id}>{p.id}</option>)}</select></label><label>Borda <select aria-label="Borda do detalhe" value={edge} onChange={event=>setEdge(event.target.value)}>{Object.entries(edges).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><button aria-pressed={exploded} onClick={()=>setExploded(v=>!v)}>Explodido</button><button aria-pressed={transparent} onClick={()=>setTransparent(v=>!v)}>Transparência</button><button aria-pressed={section} onClick={()=>setSection(v=>!v)}>Corte central</button><label>Vista <select aria-label="Vista do detalhe" value={view} onChange={event=>setView(event.target.value)}>{[['backIso','Isométrica pelo verso'],['iso','Isométrica frontal'],['back','Verso'],['right','Direita'],['top','Superior'],['left','Esquerda']].map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label></div>
    <p className="acm-help">Close pelo verso da borda selecionada. Transparência permite acompanhar a aba e o retorno junto ao perfil; use Corte central para abrir a seção.</p>
    <div className="acm-fixing-scene"><ACMViewport {...{project,result,onSelect,selectedStructureId,onSelectStructure,transparent,view,section}} selectedId={piece?.id} mode={exploded?'exploded':'assembled'} showStructure showFixings focusPiece focusEdge={edge}/></div>
    <details className="acm-details" open><summary>Seção da borda {edges[edge]?.toLowerCase()} · espessura {fmt(profile?.thickness??0)} mm · {profile?.segments.length??0} dobra(s)</summary>
      <svg role="img" aria-label="Seção calculada das dobras da borda selecionada" viewBox={`${minX} ${-maxY} ${maxX-minX} ${maxY-minY}`} style={{width:'100%',height:190}}><g transform="scale(1 -1)"><path d="M -35 0 H 0" fill="none" stroke="#364152" strokeWidth={profile?.thickness??1}/>{profile?.segments.map(s=><path key={s.number} d={`M ${s.start.join(' ')} L ${s.end.join(' ')}`} fill="none" stroke={s.number===1?'#1398e5':'#b7791f'} strokeWidth={profile.thickness}/>)}</g></svg>
      <p className="acm-help">Face à esquerda; profundidade e retorno seguem as operações do motor. {profile?.segments.map(s=>`D${s.number}: ${fmt(s.length)} mm · ${s.angle}° · ${s.direction==='front'?'frente':'verso'}`).join(' / ')||'Sem dobra nesta borda.'} A espessura é nominal; raios de dobra dependem de calibração.</p>
    </details>
    <p className="acm-notice"><strong>Encaixe a detalhar.</strong> Os perfis exibidos pertencem à estrutura calculada; o vão interno só é desenhado quando a espessura da parede está informada. Incidência, contato, cantoneira e ancoragem não foram especificados; a proximidade visual não confirma ligação ou capacidade estrutural.</p>
  </section>;
}
