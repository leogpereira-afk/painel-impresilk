import {claddingState,PANEL_FORMS,JOINT_TYPES} from './cladding.mjs';
const number=value=>Number.isFinite(value)?value.toLocaleString('pt-BR',{maximumFractionDigits:1}):'—';
const choice=(options,value,fallback)=>options.find(item=>item.value===value&&value!=='unspecified')?.label??fallback;
/** Summaries read the current engine result; they never initialize missing project fields. */
export function workspaceSummaries(project,result,{nesting,costSummary,pending=0,calibrated=false}={}){
 const finish=claddingState(project,result.pieces);
 const finishLabel=`${choice(PANEL_FORMS,finish.panelForm,'Peça a definir')} · ${choice(JOINT_TYPES,finish.joint,'Junta a definir')}`;
 return {
  finish:`${finishLabel} · ${finish.incomplete?'Escolhas pendentes':'Escolhas registradas'}`,
  measures:`${number(project.front?.width)} × ${number(project.front?.height)} mm · ${result.pieces.length} peças · ${choice(PANEL_FORMS,finish.panelForm,'Peça a definir')}`,
  materials:`${project.material?.name||project.material?.colorId||'Cor a definir'} · ${number(project.material?.thickness)} mm · chapa ${number(project.stock?.width)} × ${number(project.stock?.length)} mm`,
  modulation:`${({vertical:'Vertical',horizontal:'Horizontal',mixed:'Mista',manual:'Manual'})[project.layout?.orientation]||'A definir'} · junta ${number(project.layout?.joint)} mm · ${nesting?`${nesting.sheets.length} chapas`:'Corte em cálculo'}`,
  costs:costSummary?`R$ ${number(costSummary.known)} informados · ${costSummary.complete?'Preenchimento completo':'Custos pendentes'}`:'Aguardando plano de corte e custos',
  review:`${pending+(nesting?.unplaced?.length||0)} pendências · ${calibrated?'Calibração registrada':'Calibração pendente'}`,
 };
}
