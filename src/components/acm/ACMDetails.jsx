import {lazy,Suspense,useMemo,useState} from 'react';
import {COLORS} from '../../lib/acm/model.mjs';
import {buildProject} from '../../lib/acm/engine.mjs';
const Viewport=lazy(()=>import('./ACMViewport.jsx'));
const number=n=>Number.isFinite(n)?n.toLocaleString('pt-BR',{maximumFractionDigits:3}):'não informado';

export function GrooveSection({project,material=project.material}){
 const f=project.fabrication,t=material.thickness,skin=material.skin,depth=f.depth;
 const complete=Number.isFinite(skin)&&Number.isFinite(depth)&&skin>0&&depth>=0&&depth<t-skin;
 const width=Math.max(16,f.grooveWidth*2),sx=320/width,sy=38,cx=180,top=38;
 const theoretical=complete?f.toolFlat+2*depth*Math.tan(f.toolAngle*Math.PI/360):null;
 const opened=complete?Math.min(theoretical,width):0;
 return <section className="acm-panel"><h3>🔬 Corte ampliado do ACM e canal</h3><p className="acm-help">Verso acima, acabamento abaixo. Perfil trapezoidal idealizado; transições e raio real dependem da ferramenta e da amostra.</p>{complete?<svg viewBox={`0 0 360 ${top+t*sy+58}`} role="img" aria-label="Corte do ACM mostrando lâmina traseira, núcleo, canal e lâmina frontal preservada"><rect x="20" y={top} width="320" height={t*sy} fill="#475569"/><rect x="20" y={top+skin*sy} width="320" height={(t-2*skin)*sy} fill="#aab4c2"/><path d={`M ${cx-opened*sx/2} ${top} L ${cx-f.toolFlat*sx/2} ${top+depth*sy} H ${cx+f.toolFlat*sx/2} L ${cx+opened*sx/2} ${top} Z`} fill="#eef2ff" stroke="#6154d8" strokeWidth="2"/><rect x="20" y={top+(t-skin)*sy} width="320" height={skin*sy} fill={material.color}/><text x="20" y="22" fontSize="12" fill="#475569">VERSO · USINAGEM</text><text x="20" y={top+t*sy+25} fontSize="12" fill="#475569">FRENTE · ACABAMENTO</text></svg>:<p className="acm-notice">Preencha lâmina de alumínio e profundidade de usinagem compatíveis para desenhar as camadas em escala.</p>}<dl className="acm-section-values"><div><dt>Espessura total</dt><dd>{number(t)} mm</dd></div><div><dt>Lâmina frontal</dt><dd>{number(skin)} mm</dd></div><div><dt>Núcleo residual informado</dt><dd>{number(f.remainingCore)} mm</dd></div><div><dt>Espessura total restante</dt><dd>{complete?`${number(t-depth)} mm`:'não calculada'}</dd></div><div><dt>Abertura teórica da fresa</dt><dd>{theoretical===null?'não calculada':`${number(theoretical)} mm`}</dd></div><div><dt>Canal adotado no estudo</dt><dd>{number(f.grooveWidth)} mm</dd></div></dl></section>;
}

export function ColorComparison({project,onApply}){
 const [choice,setChoice]=useState(COLORS.find(c=>c.id==='branco')?.id||COLORS[0].id);
 const color=COLORS.find(c=>c.id===choice)||COLORS[0];
 const alternative=useMemo(()=>{const p=structuredClone(project);p.material={...p.material,colorId:color.id,color:color.hex,finish:color.finish,directional:!!color.directional};p.surfaceMaterials={};for(const o of Object.values(p.overrides)){delete o.material;delete o.locked;delete o.geometrySignature}return p},[project,color]);
 const result=useMemo(()=>buildProject(project),[project]);const other=useMemo(()=>buildProject(alternative),[alternative]);
 return <section className="acm-panel"><h3>🎨 Comparar acabamentos</h3><p className="acm-help">Mesmas medidas; simulação da alternativa em todas as faces. Os materiais individuais só mudam ao aplicar.</p><label className="acm-field"><span>Acabamento alternativo</span><select value={choice} onChange={e=>setChoice(e.target.value)}>{COLORS.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><div className="acm-color-comparison"><div><strong>Projeto atual</strong><Suspense fallback={<p>Preparando 3D…</p>}><Viewport project={project} result={result} mode="assembled" view="iso"/></Suspense></div><div><strong>{color.name} · simulação</strong><Suspense fallback={<p>Preparando 3D…</p>}><Viewport project={alternative} result={other} mode="assembled" view="iso"/></Suspense></div></div><button onClick={()=>onApply(alternative.material)}>Aplicar alternativa em todas as faces</button></section>;
}
