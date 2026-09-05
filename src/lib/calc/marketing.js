export function resolverOrcamentosMarketing(texto,orcamentos,atuais=[]){
 return [...new Set(String(texto||'').split(',').map(n=>n.trim()).filter(Boolean).map(n=>{
  const encontrados=orcamentos.filter(o=>n.startsWith('id:')?String(o.id)===n.slice(3):String(o.numero)===n);
  if(encontrados.length===1)return String(encontrados[0].id);
  if(!encontrados.length&&n.startsWith('id:')&&atuais.includes(n.slice(3)))return n.slice(3);
  throw new Error(`Orçamento ${n}: não encontrado ou número ambíguo na base disponível.`);
 }))];
}
