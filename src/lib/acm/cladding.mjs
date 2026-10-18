import {edgeFolds} from './model.mjs';

export const PANEL_FORMS = [{value:'unspecified',label:'Escolha o tipo de peça'}, {value:'tray',label:'Bandeja dobrada'}, {value:'flat',label:'Chapa plana'}, {value:'wrap',label:'Encapamento de perfil'}];
export const JOINT_TYPES = [{value:'unspecified',label:'Escolha o acabamento da junta'}, {value:'dry',label:'Junta seca · sem selante'}, {value:'sealed',label:'Junta selada · com selante'}, {value:'butt',label:'Chapas encostadas · sem junta'}];
export const EXPOSURES = [{value:'unspecified',label:'Escolha o ambiente'}, {value:'indoor',label:'Interno'}, {value:'outdoor',label:'Externo'}];

export function claddingState(project,effectivePieces) {
  const value={panelForm:'unspecified',joint:'unspecified',exposure:'unspecified',fixingConfirmed:false,...project.cladding};
  const hasFolds=effectivePieces?.length?effectivePieces.some(piece=>piece.blank?.grooves?.length>0):Object.values(project.edges??{}).some(edge=>edgeFolds(edge).length>0)||Object.values(project.overrides??{}).some(item=>Object.values(item.edges??{}).some(edge=>edgeFolds(edge).length>0));
  const notices=[];
  if(value.joint==='butt'&&value.exposure==='outdoor')notices.push('Chapas encostadas em área externa: reveja a junta de dilatação antes da fabricação. O sistema não calcula a folga necessária para a obra.');
  if(['dry','sealed'].includes(value.joint)&&!(project.layout?.joint>0))notices.push('A junta escolhida está sem espaçamento positivo na paginação. Informe a largura definida no projeto.');
  if(value.panelForm==='flat'&&hasFolds)notices.push('Você escolheu chapa plana, mas o estudo ainda tem dobras. Remova as dobras pelo comando abaixo ou reveja o tipo de peça.');
  if(value.panelForm==='tray'&&!hasFolds)notices.push('A bandeja ainda está sem abas. Configure as dobras antes de distribuir os parafusos.');
  if(value.panelForm==='wrap'&&project.assemblyMode!=='wrap')notices.push('A escolha de encapamento foi registrada. Configure o desenvolvimento do perfil em Dobras do ACM.');
  return {...value,hasFolds,notices,incomplete:value.panelForm==='unspecified'||value.joint==='unspecified'||value.exposure==='unspecified'||value.fixingConfirmed!==true};
}

/** Explicit user command, applied to a cloned history entry by the shell. */
export function applyFlatCladding(project) {
  project.cladding={...project.cladding,panelForm:'flat'};
  project.assemblyMode='tray';
  project.edges={left:0,right:0,top:0,bottom:0};
  for(const override of Object.values(project.overrides??{})) delete override.edges;
}

/** A change of fixing system invalidates the previous technical confirmation. */
export function selectCladdingFixing(fixing,type) {
 return {...fixing,type,validated:type===fixing.type?fixing.validated:false};
}
