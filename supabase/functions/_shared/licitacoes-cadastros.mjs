import {UUID,objeto,texto,dataDocumento,temHistoricoPessoal,autorizadoDocumento} from './documentos.mjs';
import {temPermissao} from './patrimonio-acesso.mjs';

export const CATEGORIAS_CADASTRO=['governo','instituicao','plataforma'];
export const SITUACOES_CADASTRO=['planejado','preparacao','enviado','em-analise','exigencia','ativo','indeferido','inativo','arquivado'];
export const PRIORIDADES_CADASTRO=['alta','media','baixa'];
export const CAMPOS_CADASTRO=['nome','categoria','url','titularId','abrangencia','servicos','situacao','protocolo','enviadoEm','validade','semVencimento','proximaAcao','prazoAcao','exigencias','observacao','prioridade','fonteUrl','verificadoEm'];
const ID_DOCUMENTO=/^[a-zA-Z0-9_-]{1,180}$/;
export const falhaCadastro=(mensagem,status=422)=>{throw Object.assign(new Error(mensagem),{status});};
export function identidadeCadastro(item){
 objeto(item);const edicao=Object.hasOwn(item,'id');
 if(edicao===Object.hasOwn(item,'cadastroId'))falhaCadastro('Informe somente ID da edição ou cadastroId.');
 const id=edicao?item.id:item.cadastroId;if(typeof id!=='string'||!UUID.test(id))falhaCadastro('Identificador de cadastro inválido.');
 return {id:id.toLowerCase(),edicao};
}
export function urlCadastro(v,nome='URL do portal',obrigatorio=false){
 const s=texto(v,nome,2000,obrigatorio);if(!s)return '';
 let url;try{url=new URL(s);}catch{falhaCadastro(`${nome} inválida.`);}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||/[\u0000-\u0020\\]/.test(s))falhaCadastro(`${nome} deve usar HTTP ou HTTPS, sem credenciais.`);
 return url.href;
}
// O portal é identificado pelo host + caminho. Protocolo HTTP/HTTPS, query,
// fragmento e barra final são variantes da mesma entrada, não novas inscrições.
export function normalizarUrlPortal(v){const u=new URL(urlCadastro(v,'URL do portal',true));return u.host+u.pathname.replace(/\/+$/,'');}
export async function idCadastroLicitacoes(titularId,url){
 const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(['licitacoes-cadastro-v1',titularId,normalizarUrlPortal(url)]))));
 bytes[6]=(bytes[6]&15)|0x80;bytes[8]=(bytes[8]&63)|0x80;
 const hex=[...bytes.slice(0,16)].map(x=>x.toString(16).padStart(2,'0')).join('');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export function prepararCadastro(item,anterior,titulares){
 objeto(item);const a=anterior||{},vindo=k=>Object.hasOwn(item,k)?item[k]:a[k];
 if(Object.keys(item).some(k=>!['id','cadastroId','documentoIds',...CAMPOS_CADASTRO].includes(k)))falhaCadastro('Campo não editável no cadastro. Histórico, autoria e arquivos pertencem ao servidor.');
 const out={};
 for(const [k,max] of Object.entries({nome:200,titularId:180,abrangencia:500,servicos:1000,protocolo:180,proximaAcao:2000,exigencias:4000,observacao:4000}))out[k]=texto(vindo(k),k,max,['nome','titularId'].includes(k));
 if(titulares.get(out.titularId)?.tipo!=='empresa')falhaCadastro('Selecione uma empresa cadastrada pelo ID do titular.');
 out.url=urlCadastro(vindo('url'),'URL do portal',true);out.fonteUrl=urlCadastro(vindo('fonteUrl'),'URL da fonte');
 for(const [k,valores,padrao] of [['categoria',CATEGORIAS_CADASTRO,'governo'],['situacao',SITUACOES_CADASTRO,'planejado'],['prioridade',PRIORIDADES_CADASTRO,'media']]){out[k]=vindo(k)??padrao;if(!valores.includes(out[k]))falhaCadastro(`${k} inválida.`);}
 for(const k of ['enviadoEm','validade','prazoAcao','verificadoEm'])out[k]=dataDocumento(vindo(k),k);
 if(vindo('semVencimento')!==undefined&&typeof vindo('semVencimento')!=='boolean')falhaCadastro('Sem vencimento inválido.');out.semVencimento=vindo('semVencimento')===true;
 if(out.semVencimento)out.validade='';
 if(out.enviadoEm&&out.validade&&out.validade<out.enviadoEm)falhaCadastro('Validade não pode anteceder o envio.');
 if(anterior&&(out.titularId!==a.titularId||normalizarUrlPortal(out.url)!==normalizarUrlPortal(a.url)))falhaCadastro('Portal e empresa identificam este cadastro. Arquive-o e crie outro para trocar essa identidade.',409);
 return out;
}
export function documentoDoCadastro(id,r,titularId,titulares,ativos,sessao){
 return ID_DOCUMENTO.test(id)&&r?.tipo==='documento'&&!r._documentosRetirado&&r.usoLicitacoes===true&&r.titularId===titularId&&titulares.get(r.titularId)?.tipo==='empresa'&&!temHistoricoPessoal(r,titulares)&&autorizadoDocumento(r,titulares,sessao,ativos);
}
export function documentosCadastro(item,anterior,titularId,titulares,ativos,sessao){
 const antigos=Array.isArray(anterior?.documentoIds)?anterior.documentoIds:[];
 if(!Object.hasOwn(item,'documentoIds'))return [...antigos];
 const ids=item.documentoIds;
 if(!Array.isArray(ids)||ids.length>30||ids.some(id=>typeof id!=='string'||!ID_DOCUMENTO.test(id))||new Set(ids).size!==ids.length)falhaCadastro('Vínculos documentais inválidos (máximo de 30 IDs diferentes).');
 if(!temPermissao(sessao,'documentos')){if(ids.length||antigos.length)falhaCadastro('Vincular documentos exige acesso a Documentos.',403);return [];}
 const permitido=id=>documentoDoCadastro(id,ativos.get(id),titularId,titulares,ativos,sessao);
 if(ids.some(id=>!permitido(id)&&!antigos.includes(id)))falhaCadastro('Documento inexistente, não autorizado ou fora do acervo de licitações desta empresa.',403);
 // O formulário não conhece os IDs restritos. Mantê-los evita apagar um vínculo
 // histórico ao salvar apenas os documentos que a sessão pode selecionar.
 const preservados=antigos.filter(id=>!permitido(id)),todos=[...new Set([...ids,...preservados])];
 if(todos.length>30)falhaCadastro('O cadastro já possui vínculos preservados; o limite é de 30 documentos.');
 return todos;
}
export function snapshotCadastro(r){return Object.fromEntries(['situacao','protocolo','prazoAcao','validade','semVencimento'].map(k=>[k,r?.[k]??(k==='semVencimento'?false:'')]));}
export function cadastroPublico(id,r,titulares,ativos,sessao){
 const ids=Array.isArray(r.documentoIds)?r.documentoIds:[],permitidos=ids.filter(x=>documentoDoCadastro(x,ativos.get(x),r.titularId,titulares,ativos,sessao));
 return {id,...Object.fromEntries([...CAMPOS_CADASTRO,'criadoEm','criadoPor','atualizadoEm','atualizadoPor'].filter(k=>Object.hasOwn(r,k)).map(k=>[k,r[k]])),titularNome:titulares.get(r.titularId)?.nome||'',documentoIds:permitidos,documentosRestritos:permitidos.length<ids.length,
  historico:(Array.isArray(r.historico)?r.historico:[]).map(h=>({id:h.id,em:h.em,por:h.por,acao:h.acao,antes:h.antes?snapshotCadastro(h.antes):null,depois:snapshotCadastro(h.depois)}))};
}
