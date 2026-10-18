import {frameFaceWidth} from '../acm/structure.mjs';
/** Count describes whole supports; crossings may split these into multiple cut pieces. */
export function setCrossbarCount(config,axis,count){
 if(!['horizontal','vertical'].includes(axis)||!Number.isInteger(count)||count<0||count>20)throw new Error('Use uma quantidade inteira entre 0 e 20.');
 const previous=config.crossbars.filter(b=>b.axis===axis),others=config.crossbars.filter(b=>b.axis!==axis);
 const edge=frameFaceWidth((axis==='horizontal'?config.horizontalProfile:config.verticalProfile)||config.profile),span=(axis==='horizontal'?config.height:config.width)-2*edge;
 if(count&&!(span>0))throw new Error('Confira as medidas do vão antes de distribuir travas.');
 const taken=new Set(config.crossbars.map(b=>b.id));
 const crossbars=Array.from({length:count},(_,i)=>{let id=previous[i]?.id;if(!id){let suffix=i+1;do{id=`auto-${axis}-${suffix++}`}while(taken.has(id));taken.add(id)}return{...previous[i],id,axis,position:edge+span*(i+1)/(count+1),start:undefined,end:undefined}});
 const affected=previous.map(b=>`front-R-${b.id}`),kept=new Set(crossbars.map(b=>`front-R-${b.id}`));
 const overrides=Object.fromEntries(Object.entries(config.overrides??{}).flatMap(([id,value])=>{const base=affected.find(key=>id===key||id.startsWith(`${key}-S`));if(!base)return[[id,value]];if(!kept.has(base)||id!==base)return[];const {position,removed,geometrySignature,...rest}=value;void position;void removed;void geometrySignature;return Object.keys(rest).length?[[id,rest]]:[]}));
 return{crossbars:[...others,...crossbars],overrides};
}
