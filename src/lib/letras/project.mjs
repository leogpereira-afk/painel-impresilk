import {validateLetterProject} from './engine.mjs';
import {validateTechnicalProject} from './finishing.mjs';
import {validateInstallation} from '../acm/installation.mjs';
import {validateLightLayout} from './light-layout.mjs';
import {validateFabricationConfig} from './fabrication.mjs';
const record=v=>v&&typeof v==='object'&&!Array.isArray(v);
export function validateStudioProject(p){
 let nodes=0;const scan=(v,depth=0)=>{if(++nodes>80000||depth>22)throw Error('Projeto excede a complexidade permitida.');if(typeof v==='number'&&!Number.isFinite(v))throw Error('Número não finito no projeto.');if(v&&typeof v==='object')for(const k of Object.keys(v)){if(['__proto__','prototype','constructor'].includes(k))throw Error('Chave de projeto não permitida.');scan(v[k],depth+1)}};scan(p);
 const errors=validateLetterProject(p).errors;
 if(errors.length)throw Error(errors.join(' '));
 if(typeof p.name!=='string'||p.name.length>300)throw Error('Nome de projeto inválido.');
 for(const key of ['painting','electrical','installation','appearance','stock','prices','fixing'])if(!record(p[key]))throw Error(`Seção ${key} ausente ou inválida.`);
 if(!Array.isArray(p.painting.layers))throw Error('Camadas de pintura inválidas.');
 if(p.lighting!==undefined){const errors=validateLightLayout(p.lighting);if(errors.length)throw Error(errors.join(' '));}
 if(p.fabrication!==undefined){const errors=validateFabricationConfig(p.fabrication);if(errors.length)throw Error(errors.join(' '));}
 const tech=validateTechnicalProject(p);if(tech.length)throw Error(tech.join(' '));
 const installation=validateInstallation(p.installation);if(installation.length)throw Error(installation.map(e=>e.message).join(' '));
 for(const k of ['front','side','back','wall'])if(!/^#[0-9a-f]{6}$/i.test(p.appearance[k]))throw Error('Cor visual inválida.');
 if(!record(p.appearance.overrides))throw Error('Aparências por componente inválidas.');
 for(const a of Object.values(p.appearance.overrides))if(!record(a)||(a.color!=null&&!/^#[0-9a-f]{6}$/i.test(a.color)))throw Error('Cor de componente inválida.');
 for(const k of ['width','length'])if(!Number.isFinite(p.stock[k])||p.stock[k]<=0)throw Error('Formato de chapa inválido.');
 for(const k of ['trim','kerf'])if(!Number.isFinite(p.stock[k])||p.stock[k]<0)throw Error('Refilo ou separação inválidos.');
 for(const v of Object.values(p.prices))if(v!==null&&(!Number.isFinite(v)||v<0))throw Error('Preço inválido.');
 return p;
}
export {geometryInput} from './input.mjs';
