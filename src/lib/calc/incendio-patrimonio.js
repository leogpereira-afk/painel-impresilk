import {dataIncendioValida} from '../../../supabase/functions/_shared/patrimonio-incendio.mjs';
export {dataIncendioValida,vencimentosIncendio,CATEGORIAS_INCENDIO} from '../../../supabase/functions/_shared/patrimonio-incendio.mjs';
export function situacaoValidadeIncendio(item,hoje) {
 const conferencia=['Iluminação de emergência','Sinalização de segurança'].includes(item.categoria);
 if(conferencia){
  if(!dataIncendioValida(item.validade))return {codigo:'pendente',texto:'Conferência pendente'};
  const dias=Math.round((Date.parse(item.validade+'T00:00:00Z')-Date.parse(hoje+'T00:00:00Z'))/86400000);
  return dias<0?{codigo:'vencido',texto:`Conferência atrasada há ${-dias} dias`}:dias===0?{codigo:'hoje',texto:'Conferir hoje'}:{codigo:'vigente',texto:`Conferir em ${dias} dias`};
 }
 if(!dataIncendioValida(item.validade))return {codigo:'pendente',texto:'Validade pendente'};
 const dias=Math.round((Date.parse(item.validade+'T00:00:00Z')-Date.parse(hoje+'T00:00:00Z'))/86400000);
 return dias<0?{codigo:'vencido',texto:`Vencido há ${-dias} dias`}:dias===0?{codigo:'hoje',texto:'Vence hoje'}:{codigo:'vigente',texto:`Vence em ${dias} dias`};
}
