import {UUID,objeto,texto,dataDocumento} from './documentos.mjs';
import {urlCadastro} from './licitacoes-cadastros.mjs';
import {MUNICIPIOS} from './licitacoes-controle.mjs';

export const CAMPOS_ENTIDADE=['nome','tipo','municipios','site','endereco','contato','email','telefone','responsavel','cadastroExigido','cadastroIds','prioridade','proximaAcao','prazoAcao','observacao','situacao'];
export const falhaEntidade=(mensagem,status=422)=>{throw Object.assign(new Error(mensagem),{status});};
export function identidadeEntidade(item){
 objeto(item);const edicao=Object.hasOwn(item,'id');
 if(edicao===Object.hasOwn(item,'novoId'))falhaEntidade('Informe somente ID da edição ou novoId.');
 const id=edicao?item.id:item.novoId;
 if(typeof id!=='string'||!UUID.test(id))falhaEntidade('Identificador da ficha inválido.');
 return {id:id.toLowerCase(),edicao};
}
const municipioValido=new Set(MUNICIPIOS);
export function prepararEntidade(item,anterior,cadastros,titulares){
 objeto(item);const a=anterior||{},vindo=k=>Object.hasOwn(item,k)?item[k]:a[k];
 if(Object.keys(item).some(k=>!['id','novoId',...CAMPOS_ENTIDADE].includes(k)))falhaEntidade('Campo não editável na ficha. Autoria e histórico pertencem ao servidor.');
 const out={};
 for(const [k,max] of Object.entries({nome:200,endereco:800,contato:200,email:254,telefone:80,responsavel:200,proximaAcao:2000,observacao:4000}))out[k]=texto(vindo(k),k,max,k==='nome');
 if(out.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email))falhaEntidade('Informe um e-mail válido.');
 out.site=urlCadastro(vindo('site'),'Site');
 for(const [k,opcoes,padrao] of [['tipo',['orgao','empresa'],'orgao'],['cadastroExigido',['confirmar','sim','nao'],'confirmar'],['prioridade',['alta','media','baixa'],'media'],['situacao',['ativo','arquivado'],'ativo']]){out[k]=vindo(k)??padrao;if(!opcoes.includes(out[k]))falhaEntidade(`${k} inválida.`);}
 const cidades=vindo('municipios');
 if(!Array.isArray(cidades)||!cidades.length||cidades.length>89||cidades.some(c=>typeof c!=='string'||!municipioValido.has(c))||new Set(cidades).size!==cidades.length)falhaEntidade('Selecione cidades diferentes entre os 89 municípios do Norte de Minas.');
 out.municipios=[...cidades];out.prazoAcao=dataDocumento(vindo('prazoAcao'),'Prazo da próxima ação');
 const ids=vindo('cadastroIds')??[],antigos=Array.isArray(a.cadastroIds)?a.cadastroIds:[];
 if(!Array.isArray(ids)||ids.length>50||ids.some(id=>typeof id!=='string'||!UUID.test(id))||new Set(ids).size!==ids.length)falhaEntidade('Selecione até 50 cadastros diferentes por ID.');
 const permitido=id=>{const c=cadastros.get(id);return c&&titulares.get(c.titularId)?.tipo==='empresa';};
 if(ids.some(id=>!permitido(id)&&!antigos.includes(id)))falhaEntidade('Cadastro inexistente ou sem titular empresa.',403);
 // IDs que deixaram de estar disponíveis não são expostos ao formulário nem
 // perdidos ao salvar os vínculos visíveis. Não criamos inscrição externa.
 out.cadastroIds=[...new Set([...ids,...antigos.filter(id=>!permitido(id))])];
 if(out.cadastroIds.length>50)falhaEntidade('A ficha já possui vínculos preservados; o limite total é de 50.');
 return out;
}
export function snapshotEntidade(r){return Object.fromEntries(CAMPOS_ENTIDADE.filter(k=>Object.hasOwn(r||{},k)).map(k=>[k,structuredClone(r[k])]));}
export function entidadePublica(id,r,cadastros,titulares){
 const projetar=s=>{const out=snapshotEntidade(s);out.cadastroIds=(Array.isArray(s?.cadastroIds)?s.cadastroIds:[]).filter(id=>titulares.get(cadastros.get(id)?.titularId)?.tipo==='empresa');return out;};
 const permitidos=projetar(r).cadastroIds;
 return {id,...projetar(r),cadastroIds:permitidos,cadastrosRestritos:permitidos.length<(r.cadastroIds||[]).length,...Object.fromEntries(['criadoEm','criadoPor','atualizadoEm','atualizadoPor'].filter(k=>Object.hasOwn(r,k)).map(k=>[k,r[k]])),historico:(Array.isArray(r.historico)?r.historico:[]).map(h=>({id:h.id,em:h.em,por:h.por,acao:h.acao,antes:h.antes?projetar(h.antes):null,depois:projetar(h.depois)}))};
}
