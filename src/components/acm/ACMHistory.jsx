import {useMemo} from 'react';
import {buildProject} from '../../lib/acm/engine.mjs';

const LABELS={name:'Nome',front:'Frente',left:'Lateral esquerda',right:'Lateral direita',soffit:'Forro',material:'Material padrão',surfaceMaterials:'Materiais por face',layout:'Modulação',edges:'Bordas',overrides:'Ajustes por peça',fabrication:'Fabricação',stock:'Chapas e retalhos',structure:'Estrutura',fixing:'Fixação',costs:'Custos',openings:'Aberturas',width:'Largura',height:'Altura',depth:'Profundidade',enabled:'Presença',thickness:'Espessura',color:'Cor',colorId:'Cor do catálogo',finish:'Acabamento',manufacturer:'Fabricante',skin:'Lâmina de alumínio',core:'Núcleo',lot:'Lote',orientation:'Orientação',joint:'Junta',maxWidth:'Dimensão A',maxHeight:'Dimensão B',profile:'Perfil',spacing:'Espaçamento',length:'Comprimento',quantity:'Quantidade',rotation:'Rotação',kerf:'Separação de corte',trim:'Refilo',type:'Tipo',product:'Produto',compensation:'Compensação',calibration:'Calibração',source:'Fonte'};
const format=value=>value===undefined?'Não informado':value===true?'Sim':value===false?'Não':value===null?'Não informado':typeof value==='object'?JSON.stringify(value):String(value);
function changedFields(previous,current,prefix=''){
 const rows=[];
 for(const key of new Set([...Object.keys(previous||{}),...Object.keys(current||{})])){
  if(!prefix&&['id','revision','schemaVersion'].includes(key))continue;
  const a=previous?.[key],b=current?.[key],path=prefix?`${prefix}.${key}`:key;
  if(JSON.stringify(a)===JSON.stringify(b))continue;
  if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b))rows.push(...changedFields(a,b,path));
  else rows.push({path,label:path.split('.').map(x=>LABELS[x]||x).join(' / '),before:format(a),after:format(b)});
 }
 return rows;
}
export function RevisionComparison({previous,current,onClose}){
 const rows=useMemo(()=>changedFields(previous,current),[previous,current]);
 const old=useMemo(()=>buildProject(previous),[previous]);
 const now=useMemo(()=>buildProject(current),[current]);
 return <section className="acm-panel acm-revision-diff"><div className="acm-section-heading"><h3>🔎 Comparar R{previous.revision} com R{current.revision} atual</h3><button onClick={onClose}>Fechar comparação</button></div><p className="acm-help">Comparação somente de leitura. Os documentos da revisão anterior permanecem preservados.</p><p>{old.pieces.length} → {now.pieces.length} peças · {rows.length} parâmetro(s) alterado(s).</p>{rows.length?<div className="acm-table-scroll"><table><thead><tr><th>Parâmetro</th><th>Revisão guardada</th><th>Projeto atual</th></tr></thead><tbody>{rows.map(row=><tr className="changed" key={row.path}><th scope="row">{row.label}</th><td>{row.before}</td><td>{row.after}</td></tr>)}</tbody></table></div>:<p>Nenhuma diferença nos parâmetros deste projeto.</p>}</section>;
}
