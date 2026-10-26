import {resumoProcesso} from './resumoProcesso.js';

const normalizar = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
export function filtrarProcessos(itens, filtros = {}) {
 const {busca='', setor='todos', responsavel='todos', prioridade='todas'}=filtros;
 return itens.filter(x => (setor==='todos'||x.setor===setor) &&
  (responsavel==='todos'||x.responsavelRhId===responsavel) &&
  (prioridade==='todas'||x.prioridade===prioridade) &&
  normalizar([x.titulo,x.empresa,x.especialidade,...(x.envolvidos||[]).map(p=>p.nome)].join(' ')).includes(normalizar(busca.trim())));
}
export function sinalProcesso(item, hoje) {
 const r=resumoProcesso(item,hoje), datas=r.encerrado?[]:[item.prazo,...(item.etapas||[]).filter(e=>!['concluida','validacao'].includes(e.situacao)).map(e=>e.prazo)].filter(Boolean).sort();
 return {...r,proximoPrazo:datas[0]||'',atrasado:!r.encerrado&&(r.atrasadas.length>0||!!item.prazo&&item.prazo<hoje)};
}
export function selecionarProcessos(itens, filtro, hoje) {
 return itens.filter(x=>{const r=sinalProcesso(x,hoje);
  if(filtro==='todos')return true;
  if(filtro==='abertos')return !r.encerrado;
  if(filtro==='atrasados')return r.atrasado;
  if(filtro==='bloqueados')return r.bloqueadas.length>0;
  if(filtro==='validacao')return !r.encerrado&&(r.validar.length>0||x.situacao==='validacao');
  return x.situacao===filtro;
 }).sort((a,b)=>{
  const ra=sinalProcesso(a,hoje),rb=sinalProcesso(b,hoje), pesos={urgente:0,alta:1,normal:2,baixa:3};
  return Number(rb.atrasado)-Number(ra.atrasado)||(ra.proximoPrazo||'9999').localeCompare(rb.proximoPrazo||'9999')||(pesos[a.prioridade]??2)-(pesos[b.prioridade]??2)||a.titulo.localeCompare(b.titulo,'pt-BR');
 });
}
