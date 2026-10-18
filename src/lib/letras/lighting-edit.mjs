/** A source approval belongs to its current specification, not its editable row. */
export function updateLightingSupply(config,patch) {
 const changed=Object.entries(patch).some(([key,value])=>key!=='conditionsConfirmed'&&config.supply[key]!==value);
 const supply={...config.supply,...patch,...(changed?{conditionsConfirmed:false}:{})};
 if(supply.ratedCurrentA===null)delete supply.ratedCurrentA;
 return {...config,supply};
}
export function updateLightingField(config,group,key,value) {
 return group==='supply'?updateLightingSupply(config,{[key]:value}):{...config,[group]:{...config[group],[key]:value}};
}
