/** Public manufacturer references. A catalog match is not installation approval. */
const freeze = value => {
 if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
 return value;
};
const checkedAt = '2026-10-17';
const ledSheet = 'https://principalsloan.com/uploads/qwik-mod-12v-gen-2-datasheet.pdf';
const densitySheet = 'https://principalsloan.com/uploads/principal-sloan-channel-letter-density-guidelines.pdf';
const opticalConditions = 'Referências por profundidade e largura do traço. Não interpoladas nem aplicadas automaticamente. Conferir distância LED–face, material, película, interior e amostra física; não é garantia de uniformidade.';
const guide = (depthMm, pitchMm, rowPitchMm, strokeMm, maximumBrightnessRowPitchMm = null) => ({ depthMm, pitchMm, rowPitchMm, strokeMm, maximumBrightnessRowPitchMm });
const led = (size, sku, powerW, widthMm, maxPerRun, referenceMaxModules60W, harnessPitchMm, opticalGuides) => ({
 id:`qwik-gen2-${size.toLowerCase()}-6500k`, label:`Qwik Mod Gen 2 ${size} · 6500 K · ${powerW} W`,
 name:`Qwik Mod 12V Gen 2 ${size}`,manufacturer:'Principal Sloan',sku,widthMm,heightMm:16.002,depthMm:11.938,
 voltageV:12,powerW,maxPerRun,cctK:6500,ip:'IP67',datasheet:ledSheet,revision:'F · 2026-10-12',checkedAt,demonstration:false,
 referenceMaxModules60W,opticalGuides,opticalConditions,opticalGuideSource:densitySheet,opticalGuideRevision:'D · 2026-03-09',
 harnessPitchMm,harnessPitchNote:'Cadência nominal inferida de módulos/pé; comprimento livre e tolerâncias do fio de fábrica não confirmados. Conferir extensões e emendas.'
});
export const LED_CATALOG = freeze([
 led('Small','M-QMG2S-12-65',0.74,53.848,40,80,203.2,[guide(50.8,76.2,76.2,127),guide(76.2,152.4,152.4,203.2),guide(101.6,203.2,254,304.8),guide(127,203.2,304.8,355.6)]),
 led('Medium','M-QMG2M-12-65',0.90,53.848,30,60,203.2,[guide(101.6,203.2,254,304.8),guide(127,203.2,330.2,406.4,304.8),guide(152.4,203.2,406.4,457.2,304.8)]),
 led('Large','M-QMG2L-12-65',1.25,77.9018,24,48,304.8/1.35,[guide(101.6,304.8/1.35,203.2,254),guide(127,304.8/1.35,304.8,355.6),guide(152.4,304.8/1.35,355.6,457.2,304.8),guide(177.8,304.8/1.35,406.4,558.8,304.8),guide(203.2,304.8/1.35,457.2,609.6,304.8)])
]);
const supply = (id, sku, powerW, ratedCurrentA, dimensionsMm, family) => ({
 id,label:`MEAN WELL ${sku} · ${powerW} W · 12 V`,name:sku,manufacturer:'MEAN WELL',sku,voltageV:12,powerW,ratedCurrentA,outputs:1,
 dimensionsMm,ip:'IP67',datasheet:`https://www.meanwell.com/Upload/PDF/${family}/${family}-SPEC.PDF`,revision:'2026-09-07',checkedAt,demonstration:false,
 conditionsNote:'Conferir redução de carga por temperatura, entrada, orientação e altitude. Uma saída DC; ramais externos não são saídas independentes. Não conectar fontes em paralelo.'
});
export const SUPPLY_CATALOG = freeze([
 supply('meanwell-lpv-60-12','LPV-60-12',60,5,{length:162.5,width:42.5,height:32},'LPV-60'),
 supply('meanwell-lpv-100-12','LPV-100-12',102,8.5,{length:190,width:52,height:37},'LPV-100')
]);
const wire = (id, sectionMm2, resistanceOhmPerM) => ({
 id,label:`Corfio BWF 750 V · ${sectionMm2} mm²`,name:'Cabo Flexível BWF 750 V',manufacturer:'Corfio',sectionMm2,resistanceOhmPerM,resistanceTemperatureC:20,
 datasheet:'https://www.corfio.com.br/public/pt/produto/cabo-flexivel-bwf-750v',checkedAt,unit:'conductor-m',demonstration:false,
 conditionsNote:'Condutor avulso: duas vias por percurso DC. Resistência máxima a 20 °C; conferir proteção, ambiente, conexões e corrente admissível da instalação.'
});
export const WIRE_CATALOG = freeze([wire('corfio-bwf-075',0.75,0.026),wire('corfio-bwf-150',1.5,0.0133),wire('corfio-bwf-250',2.5,0.00798)]);
const collections = {led:LED_CATALOG,model:LED_CATALOG,supply:SUPPLY_CATALOG,wire:WIRE_CATALOG};
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const configCopy = config => {
 if (!object(config) || !object(config.model) || !object(config.supply) || !object(config.wire)) throw new Error('Configuração de iluminação inválida.');
 return structuredClone(config);
};
const find = (catalog,id) => {
 const record = catalog.find(item=>item.id===id);
 if(!record) throw new Error('Modelo de catálogo desconhecido.');
 return structuredClone(record);
};
const compatible = (left,right) => {
 if(left!==right)throw new Error('A tensão do módulo LED deve ser igual à tensão da fonte.');
};
const fields = record => { const {id,label,...rest}=record; void label; return {...rest,catalogId:id}; };
export function applyLedCatalog(config,id) {
 const next=configCopy(config),record=find(LED_CATALOG,id);
 compatible(record.voltageV,next.supply.voltageV);
 const rotationDeg=next.model.rotationDeg===90?90:0;
 next.model={...fields(record),rotationDeg};
 return next;
}
export function applySupplyCatalog(config,id) {
 const next=configCopy(config),record=find(SUPPLY_CATALOG,id);
 compatible(record.voltageV,next.model.voltageV);
 next.supply={...next.supply,...fields(record),outputMaxCurrentA:record.ratedCurrentA,conditionsConfirmed:false,distributionMode:'external',branches:8};
 return next;
}
export function applyWireCatalog(config,id) {
 const next=configCopy(config),record=find(WIRE_CATALOG,id);
 next.wire={...next.wire,...fields(record)};
 return next;
}
/** Catalog provenance only. Operating settings and LED rotation do not change identity. */
export function catalogStatus(group,kind) {
 const catalog=collections[kind];
 if(!catalog)throw new Error('Tipo de catálogo desconhecido.');
 if(!object(group)||!group.catalogId)return {record:null,modified:false};
 const record=catalog.find(item=>item.id===group.catalogId)??null;
 if(!record)return {record:null,modified:true};
 const modified=Object.entries(record).some(([key,value])=>!['id','label'].includes(key)&&JSON.stringify(group[key])!==JSON.stringify(value));
 return {record,modified};
}
