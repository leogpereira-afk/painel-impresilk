import {ACMError,authorizeACM} from './acm-handler.mjs';
export const FAMILIES={acrylic:'Acrílico',mdf:'MDF',pvc:'PVC'};
const fail=message=>{throw new ACMError('VALIDATION',message);};
const num=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
export function validateCatalogItem(value){
 if(!value||typeof value!=='object'||Array.isArray(value))fail('Cadastro inválido.');
 const {id,kind,family,width,length,thickness,quantity,directional,active}=value;
 if(typeof id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(id))fail('Identificação inválida.');
 if(!['sheet','remnant'].includes(kind)||!Object.hasOwn(FAMILIES,family))fail('Escolha chapa ou retalho e o material.');
 if(!num(width,1,100000)||!num(length,1,100000))fail('Informe as duas medidas da chapa ou retalho.');
 if(!num(thickness,.1,100))fail('Espessura deve ser de 0,1 a 100 mm.');
 if(!Number.isInteger(quantity)||quantity<0||quantity>100)fail('Quantidade deve ser inteira, de 0 a 100.');
 if(typeof directional!=='boolean'||typeof active!=='boolean')fail('Opções de cadastro inválidas.');
 if(typeof value.color!=='string'||!/^#[a-fA-F0-9]{6}$/.test(value.color))fail('Cor inválida.');
 const fields={};for(const key of ['name','colorName','brand','reference','location']){if(typeof value[key]!=='string'||value[key].length>120)fail('Textos devem ter até 120 caracteres.');fields[key]=value[key].trim();}
 if(!fields.name||!fields.colorName)fail('Informe nome e cor do material.');
 return {id,kind,family,width,length,thickness,quantity,directional,active,color:value.color.toLowerCase(),...fields};
}
// Shared within the Ferramenta I.A module. Item-level compare-and-swap avoids lost updates.
export async function handleCatalog(body,{session,repo,now=()=>new Date().toISOString()}){
 const author=authorizeACM(session);
 if(body?.action==='list')return {ok:true,items:await repo.list()};
 if(body?.action!=='save')fail('Ação inválida.');
 const item=validateCatalogItem(body.item);
 if(!Number.isSafeInteger(body.version)||body.version<0)fail('Versão inválida. Atualize o cadastro.');
 const before=await repo.get(item.id);
 if((before?.version??0)!==body.version)throw new ACMError('CONFLICT','Outro vendedor atualizou este item. Atualize a lista e confira antes de salvar.',409);
 const record={...item,version:body.version+1,updatedAt:now(),updatedBy:author};
 await repo.save(record,before);
 return {ok:true,item:record};
}
export function catalogRepository(sb){
 const collection='simulador_placas_catalogo';
 return {
  async list(){const items=[];for(let page=0;page<20;page++){const {data,error}=await sb.from('painel_registros').select('registro').eq('colecao',collection).order('id').range(page*500,page*500+499);if(error)throw error;items.push(...(data??[]).map(r=>r.registro));if((data??[]).length<500)return items;}throw new ACMError('LIMIT','Limite de consulta do catálogo atingido.',503);},
  async get(id){const {data,error}=await sb.from('painel_registros').select('registro').eq('colecao',collection).eq('id',id).maybeSingle();if(error)throw error;return data?.registro??null;},
  async save(item,before){const {error}=await sb.rpc('painel_registro_gravar',{p_colecao:collection,p_id:item.id,p_registro:item,p_anterior:before});if(error?.code==='40001')throw new ACMError('CONFLICT','Cadastro alterado por outra pessoa. Atualize antes de salvar.',409);if(error)throw error;}
 };
}
