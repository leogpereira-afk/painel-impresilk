// Controles documentais usam o registro compartilhado sem copiar os bens físicos.
import {temPermissao,FAMILIAS_EQUIPAMENTO} from './patrimonio-acesso.mjs';
import {validarVinculoPessoa} from './patrimonio-pessoas.mjs';
export const TIPOS_DOCUMENTO=['documento','seguro','garantia'];
export const ESTADOS_DOCUMENTO=['ativo','renovacao','cancelado','encerrado'];
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID=/^[a-zA-Z0-9_-]{1,180}$/;
export const ehAVCB=r=>r?.tipo==='predial'&&r?.categoria==='AVCB';
const falha=(mensagem,status=422)=>{throw Object.assign(new Error(mensagem),{status});};
export function objeto(v,nome='Item'){if(!v||typeof v!=='object'||Array.isArray(v))falha(`${nome} inválido.`);return v;}
export function texto(v,nome,max=180,obrigatorio=false){if(v==null)v='';if(typeof v!=='string')falha(`${nome} inválido.`);const s=v.trim();if(s.length>max||obrigatorio&&!s)falha(`Informe ${nome} com até ${max} caracteres.`);return s;}
export function dataDocumento(v,nome){const s=texto(v,nome,10);if(s&&(!/^\d{4}-\d{2}-\d{2}$/.test(s)||s.startsWith('0000')||!Number.isFinite(Date.parse(s+'T00:00:00Z'))||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s))falha(`${nome} inválida.`);return s;}
export function identidade(item){objeto(item);const edicao=Object.hasOwn(item,'id');if(edicao===Object.hasOwn(item,'cadastroId'))falha('Informe somente ID da edição ou cadastroId.');const id=edicao?item.id:item.cadastroId;if(typeof id!=='string'||!(edicao?ID:UUID).test(id))falha('Identificador inválido.');return {id,edicao};}
export function conferirVersao(anterior,versao){if(typeof versao!=='string'||versao!==String(anterior?.atualizadoEm||''))falha('Este registro mudou. Recarregue antes de salvar.',409);}
export function novoInstante(anterior){return new Date(Math.max(Date.now(),(Date.parse(anterior?.atualizadoEm||'')||0)+1)).toISOString();}
export function temHistoricoPessoal(registro,titulares){return registro?.pessoalHistorico===true||(Array.isArray(registro?.versoes)&&registro.versoes.some(v=>titulares.get(v.snapshot?.titularId)?.tipo==='pessoa'));}
export function autorizadoDocumento(registro,titulares,sessao,ativos=new Map()){
 if(!temPermissao(sessao,'documentos'))return false;
 if(temHistoricoPessoal(registro,titulares)&&!temPermissao(sessao,'documentos-pessoais'))return false;
 if(ehAVCB(registro)){const origem=temPermissao(sessao,'patrimonio')||temPermissao(sessao,'inventario-valores');return origem&&(titulares.get(registro.titularId)?.tipo!=='pessoa'||temPermissao(sessao,'documentos-pessoais'));}
 if(!TIPOS_DOCUMENTO.includes(registro?.tipo))return false;
 if((registro.origem==='seguranca'||registro.origemTipo==='seguranca'||(registro.ativoIds||[]).some(id=>!ativos.has(id)||ativos.get(id)?.tipo==='seguranca'))&&!temPermissao(sessao,'seguranca'))return false;
 const titular=titulares.get(registro.titularId);
 return titular?.tipo==='empresa'||temPermissao(sessao,'documentos-pessoais');
}
const CAMPOS=['nome','categoria','identificacao','titularId','emissao','validade','semVencimento','alertaDias','estado','orgaoEmissor','estabelecimento','responsavel','responsavelId','observacao','fornecedor','fabricante','compra','tipoGarantia','condicoes','cobertura','obrigacaoPagamento','pagamentoSituacao','seguradora','valor','valorSegurado','contato','assistencia','linkOficial','acionamentos','ativoIds','criadoEm','atualizadoEm','atualizadoPor'];
const anexoPublico=a=>({id:a.id,nome:a.nome,mime:a.mime,criadoEm:a.criadoEm,criadoPor:a.criadoPor});
export function snapshotDocumento(r){return Object.fromEntries(CAMPOS.filter(k=>Object.hasOwn(r||{},k)).map(k=>[k,r[k]]));}
export function documentoPublico(id,r,titulares){
 const avcb=ehAVCB(r),campos=avcb?['nome','categoria','identificacao','emissao','validade','criadoEm','atualizadoEm','atualizadoPor']:r.tipo==='seguro'?CAMPOS:CAMPOS.filter(k=>!['valor','valorSegurado'].includes(k));
 const out={id,tipo:avcb?'documento':r.tipo,...Object.fromEntries(campos.filter(k=>Object.hasOwn(r,k)).map(k=>[k,r[k]]))};
 const t=titulares.get(r.titularId);out.titularId=String(r.titularId||'');out.titularTipo=t?.tipo||'';out.titularNome=t?.nome||'';out.classificacaoPendente=!t;
 out.origem=avcb?'incendio':'controle';out.ativoIds=avcb?[id]:(Array.isArray(r.ativoIds)?r.ativoIds:[]);
 out.versoes=(Array.isArray(r.versoes)?r.versoes:[]).map(v=>({id:v.id,emissao:v.emissao||'',validade:v.validade||'',arquivo:v.arquivo?{nome:v.arquivo.nome,mime:v.arquivo.mime}:null,anexos:(Array.isArray(v.anexos)?v.anexos:[]).map(anexoPublico),criadoEm:v.criadoEm,criadoPor:v.criadoPor}));
 out.anexos=(Array.isArray(r.anexos)?r.anexos:[]).map(anexoPublico);
 const vigente=out.versoes.at(-1);out.temArquivo=!!(vigente?.arquivo||avcb&&r.arquivoIncendio||r.temArquivo);out.arquivoNome=(avcb?r.arquivoIncendio?.nome:vigente?.arquivo?.nome)||r.arquivoNome||'';
 return out;
}
export function bemDocumento(id,r,sessao){
 if(!FAMILIAS_EQUIPAMENTO.includes(r?.tipo))return null;
 if(r.tipo==='seguranca'&&!temPermissao(sessao,'seguranca'))return null;
 if(!['veiculo','maquina'].includes(r.tipo)&&r.tipo!=='seguranca'&&!temPermissao(sessao,'patrimonio')&&!temPermissao(sessao,'inventario-valores'))return null;
 const campos=r.tipo==='veiculo'?['placa','marcaModelo','ano']:r.tipo==='maquina'?['fabricante','modelo','numeroSerie','ano']:['fabricante','modelo','marcaModelo','numeroSerie','local'];
 return {id,tipo:r.tipo,nome:String(r.nome||''),categoria:String(r.categoria||''),identificacao:String(r.identificacao||''),bemId:String(r.bemId||''),situacao:String(r.especificacao?.situacao||''),especificacao:Object.fromEntries(campos.filter(k=>typeof r.especificacao?.[k]==='string'||typeof r.especificacao?.[k]==='number').map(k=>[k,String(r.especificacao[k])])),disponivel:r._documentosRetirado!==true&&r.especificacao?.situacao!=='baixado',...(['veiculo','maquina'].includes(r.tipo)&&(r.validade||r.temArquivo)?{documentoLegado:true,emissao:String(r.emissao||''),validade:String(r.validade||''),pendencias:['Conferir documento antigo e vincular controle por ID sem transformar a ficha'],...(temPermissao(sessao,'inventario-valores')?{temArquivo:r.temArquivo===true,arquivoNome:String(r.arquivoNome||'')}:{})}:{})};
}
export function prepararControle(item,anterior,titulares,ativos,sessao,pessoas=[]){
 objeto(item);const a=anterior||{},avcb=ehAVCB(a),tipo=avcb?'predial':item.tipo??a.tipo;
 if(!avcb&&!TIPOS_DOCUMENTO.includes(tipo))falha('Tipo de controle inválido.');
 if(anterior&&!avcb&&tipo!==a.tipo)falha('Não é possível trocar o tipo do controle.');
 // Metadados de anexos, versões e históricos pertencem exclusivamente ao servidor.
 if(['versoes','anexos','arquivo','arquivoIncendio','arquivoNome','temArquivo','historico','pessoalHistorico','criadoEm','atualizadoEm','atualizadoPor','origem','origemTipo','titularTipo','titularNome'].some(k=>Object.hasOwn(item,k)))falha('Metadados de arquivos e históricos não são editáveis.');
 const vindo=k=>Object.hasOwn(item,k)?item[k]:a[k];
 const campos={};
 if(avcb){for(const k of ['emissao','validade'])campos[k]=dataDocumento(vindo(k),k);if(!campos.validade||campos.emissao&&campos.validade<campos.emissao)falha('Informe validade posterior à emissão.');if(Object.hasOwn(item,'titularId')){const id=texto(item.titularId,'titular',180,true),t=titulares.get(id);if(t?.tipo!=='empresa')falha('Selecione titular empresa para o AVCB predial.');campos.titularId=id;}return campos;}
 for(const k of ['nome','categoria','identificacao','titularId','orgaoEmissor','estabelecimento','responsavel','responsavelId','fornecedor','fabricante','tipoGarantia','seguradora'])campos[k]=texto(vindo(k),k,k==='titularId'||k==='responsavelId'?180:200,k==='nome'||k==='categoria'||k==='titularId');
 if(campos.categoria.toUpperCase()==='AVCB'&&String(a.categoria||'').toUpperCase()!=='AVCB')falha('Cadastre o AVCB na Prevenção contra incêndio. Documentos renova a mesma ficha.',409);
 const t=titulares.get(campos.titularId);if(!t)falha('Selecione um titular cadastrado.');if(t.tipo==='pessoa'&&!temPermissao(sessao,'documentos-pessoais'))falha('Sem acesso a Documentos pessoais.',403);
 Object.assign(campos,validarVinculoPessoa(item,a,pessoas,'responsavel'));
 for(const k of ['observacao','condicoes','cobertura','obrigacaoPagamento'])campos[k]=texto(vindo(k),k,4000);
 for(const k of ['emissao','validade','compra'])campos[k]=dataDocumento(vindo(k),k);
 if(vindo('semVencimento')!==undefined&&typeof vindo('semVencimento')!=='boolean')falha('Sem vencimento inválido.');campos.semVencimento=vindo('semVencimento')===true;
 if(campos.semVencimento)campos.validade='';
 if(campos.emissao&&campos.validade&&campos.validade<campos.emissao)falha('Validade não pode anteceder a emissão.');
 const alerta=vindo('alertaDias')??30;if(!Number.isSafeInteger(alerta)||alerta<0||alerta>365)falha('Alerta deve ter de 0 a 365 dias.');campos.alertaDias=alerta;
 campos.estado=vindo('estado')??'ativo';if(!ESTADOS_DOCUMENTO.includes(campos.estado))falha('Estado inválido.');
 campos.pagamentoSituacao=vindo('pagamentoSituacao')??'nao-se-aplica';if(!['pendente','pago','nao-se-aplica'].includes(campos.pagamentoSituacao))falha('Situação do pagamento inválida.');
 if(tipo==='seguro')for(const k of ['valor','valorSegurado']){const v=vindo(k);if(v==null){campos[k]=null;continue;}if(typeof v!=='number'||!Number.isFinite(v)||v<0)falha(`${k} inválido.`);campos[k]=v;}
 for(const chave of ['contato','assistencia']){const contato=vindo(chave)??{};objeto(contato,'Contato');campos[chave]=Object.fromEntries(['nome','telefone','whatsapp','email','endereco'].map(k=>[k,texto(contato[k],k,k==='endereco'?500:180)]));}
 campos.linkOficial=texto(vindo('linkOficial'),'link oficial',2000);if(campos.linkOficial){let url;try{url=new URL(campos.linkOficial);}catch{falha('Link oficial inválido.');}if(!['https:','http:'].includes(url.protocol)||url.username||url.password)falha('Link oficial deve usar HTTP ou HTTPS.');}
 const ids=vindo('ativoIds')??[];if(!Array.isArray(ids)||ids.length>200||ids.some(id=>typeof id!=='string'||!ID.test(id))||new Set(ids).size!==ids.length)falha('Vínculos de bens inválidos.');
 for(const id of ids){const ativo=ativos.get(id),preservado=Array.isArray(a.ativoIds)&&a.ativoIds.includes(id);if(!ativo||!bemDocumento(id,ativo,sessao))falha('Bem inexistente ou não autorizado.',403);if((ativo._documentosRetirado===true||ativo.especificacao?.situacao==='baixado')&&!preservado)falha('Este bem foi retirado e não recebe novo vínculo.',409);}campos.ativoIds=ids;
 const acionamentos=vindo('acionamentos')??[];if(!Array.isArray(acionamentos)||acionamentos.length>300)falha('Acionamentos inválidos.');
 campos.acionamentos=acionamentos.map(x=>{objeto(x,'Acionamento');if(typeof x.id!=='string'||!UUID.test(x.id))falha('ID do acionamento inválido.');if(!['aberto','em-atendimento','resolvido'].includes(x.estado))falha('Estado do acionamento inválido.');return {id:x.id,data:dataDocumento(x.data,'data'),estado:x.estado,...Object.fromEntries(['problema','encaminhamento','protocolo','retorno','solucao','observacao'].map(k=>[k,texto(x[k],k,2000)]))};});
 if(new Set(campos.acionamentos.map(x=>x.id)).size!==campos.acionamentos.length)falha('IDs de acionamentos repetidos.');
 for(const antes of a.acionamentos||[]){const atual=campos.acionamentos.find(x=>x.id===antes.id);if(!atual)falha('Preserve os acionamentos existentes.');if(antes.estado==='resolvido'){if(Object.keys(atual).some(k=>atual[k]!==String(antes[k]??'')))falha('Acionamento resolvido faz parte do histórico e deve ser preservado.');campos.acionamentos[campos.acionamentos.indexOf(atual)]={...antes};}}
 return {tipo,...campos};
}
export function arquivoDocumento(arquivo){
 objeto(arquivo,'Arquivo');const nome=texto(arquivo.nome,'nome do arquivo',180,true),mime=texto(arquivo.mime,'tipo do arquivo',100,true);
 if(!['application/pdf','image/jpeg','image/png','image/webp'].includes(mime))falha('Use PDF ou imagem JPG, PNG ou WebP.');
 const b64=arquivo.base64;if(typeof b64!=='string'||!b64||b64.length>4*1024*1024)falha('Arquivo deve ter até 3 MB.',413);
 if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(b64))falha('Arquivo base64 inválido.');
 let bytes;try{bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));}catch{falha('Arquivo inválido.');}
 const ok=mime==='application/pdf'?bytes[0]===37&&bytes[1]===80&&bytes[2]===68&&bytes[3]===70:mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:mime==='image/png'?bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71:bytes[0]===82&&bytes[1]===73&&bytes[2]===70&&bytes[3]===70&&bytes[8]===87&&bytes[9]===69&&bytes[10]===66&&bytes[11]===80;
 if(!ok)falha('O conteúdo não corresponde ao tipo do arquivo.');return {nome,mime,bytes};
}
