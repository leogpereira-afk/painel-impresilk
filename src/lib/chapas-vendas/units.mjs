// UI in centimetres; the geometry engine always receives millimetres.
export const formatCM=value=>Number.isFinite(value)?(value/10).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2,useGrouping:false}):'';
export function parseCM(text){
 const value=String(text).trim();
 if(!/^\d+(?:[,.]\d{0,2})?$/.test(value))return null;
 const cm=Number(value.replace(',','.'));
 return Number.isFinite(cm)?Math.round(cm*100)/10:null;
}
