import {buildWorkshop,planWorkshop,reoptimizeWorkshopRemaining,workshopProposals,isPlanCurrent} from '../../lib/oficina/model.mjs';
export function calculateWorkshopPlan(project,material,previous){
 const result=buildWorkshop(project,material);
 if(previous&&isPlanCurrent(project,previous)&&previous.sheets?.some(s=>s.placements.some(p=>p.locked))){
  const answer=reoptimizeWorkshopRemaining(project,result,previous);
  if(!answer.valid)throw new Error(answer.errors.join(' '));
  return answer.plan;
 }
 const proposals=workshopProposals(project,result),plan=proposals[0]||planWorkshop(project,result);
 return proposals.length>1?{...plan,proposals}:plan;
}
const csv=value=>'"'+String(value??'').replace(/"/g,'""')+'"';
export function barCutCSV(project,plan){
 if(!isPlanCurrent(project,plan)||!plan.validation?.valid||!plan.bars?.length)throw new Error('Calcule e confira o plano de barras desta revisão.');
 const rows=[['Projeto','Revisão','Barra','Perfil','Comprimento da barra (mm)','Peça','Comprimento da peça (mm)','Ponta curta (mm)','Ângulo A (graus)','Ângulo B (graus)','Início (mm)','Fim (mm)','Serra antes (mm)','Serra após (mm)','Refilo inicial (mm)','Refilo final (mm)','Sobra da barra (mm)']];
 for(const bar of plan.bars)for(const cut of bar.cuts)rows.push([project.name,project.revision,bar.id,bar.stockKey,bar.length,cut.id,cut.length,cut.shortLength,cut.angleA,cut.angleB,cut.start,cut.end,cut.kerfBefore,cut.kerfAfter,bar.trimStart,bar.trimEnd,bar.waste]);
 return '\uFEFF'+rows.map(row=>row.map(csv).join(';')).join('\n');
}
