import {objeto,texto,identidade,dataDocumento,temHistoricoPessoal,autorizadoDocumento} from './documentos.mjs';

export const COLECAO_KITS_LICITACOES='licitacoes_kits';
export const AVISO_KIT_LICITACOES='Kit de preparação interna. O download não representa envio, inscrição nem confirmação de habilitação.';
export const falhaKit=(mensagem,status=422)=>{throw Object.assign(new Error(mensagem),{status});};
const ID=/^[a-zA-Z0-9_-]{1,180}$/;
export function idReferenciaKit(v,nome,obrigatorio=false){const s=texto(v,nome,180,obrigatorio);if(s&&!ID.test(s))falhaKit(`${nome} inválido.`);return s;}
export async function idKitLicitacoes(licitacaoId,titularId){
 const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(['licitacoes-kit-v1',licitacaoId,titularId]))));
 bytes[6]=(bytes[6]&15)|0x80;bytes[8]=(bytes[8]&63)|0x80;
 const hex=[...bytes.slice(0,16)].map(x=>x.toString(16).padStart(2,'0')).join('');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export function prepararKit(item,anterior){
 const identidadeKit=identidade(item),a=anterior||{},vindo=k=>Object.hasOwn(item,k)?item[k]:a[k];
 if(Object.keys(item).some(k=>!['id','cadastroId','nome','licitacaoId','titularId','requisitos'].includes(k)))falhaKit('Campo não editável no kit. Histórico e snapshots pertencem ao servidor.');
 const out={nome:texto(vindo('nome'),'nome do kit',200,true),licitacaoId:idReferenciaKit(vindo('licitacaoId'),'edital',true),titularId:idReferenciaKit(vindo('titularId'),'titular',true)};
 if(anterior&&(out.licitacaoId!==a.licitacaoId||out.titularId!==a.titularId))falhaKit('Edital e empresa identificam o kit. Crie outro kit para trocar essa identidade.',409);
 const requisitos=vindo('requisitos')??[];
 if(!Array.isArray(requisitos)||requisitos.length>60)falhaKit('O kit aceita até 60 requisitos.');
 out.requisitos=requisitos.map(r=>{
  objeto(r,'Requisito');if(Object.keys(r).some(k=>!['id','categoria','descricao','documentoId','versaoId','arquivoId','dispensado','justificativa'].includes(k)))falhaKit('Campo não editável no requisito.');
  if(r.dispensado!==undefined&&typeof r.dispensado!=='boolean')falhaKit('Dispensa inválida.');
  const req={id:idReferenciaKit(r.id,'ID do requisito',true),categoria:texto(r.categoria,'categoria',200,true),descricao:texto(r.descricao,'descrição',2000),documentoId:idReferenciaKit(r.documentoId,'documento'),versaoId:idReferenciaKit(r.versaoId,'versão'),arquivoId:idReferenciaKit(r.arquivoId,'anexo'),dispensado:r.dispensado===true,justificativa:texto(r.justificativa,'justificativa',2000)};
  if(req.dispensado&&!req.justificativa)falhaKit('Informe a justificativa da dispensa.');
  if(req.dispensado&&(req.documentoId||req.versaoId||req.arquivoId))falhaKit('Requisito dispensado não pode apontar documento.');
  if(!req.documentoId&&(req.versaoId||req.arquivoId))falhaKit('Versão e anexo exigem documento.');
  return req;
 });
 if(new Set(out.requisitos.map(r=>r.id)).size!==out.requisitos.length)falhaKit('IDs de requisitos duplicados.');
 return {...identidadeKit,campos:out};
}
export function documentoEmpresarialKit(r,titularId,titulares,ativos,sessao){
 return r?.tipo==='documento'&&r.origem!=='incendio'&&r.origemTipo!=='incendio'&&String(r.categoria||'').trim().toUpperCase()!=='AVCB'&&r.usoLicitacoes===true&&r.titularId===titularId&&titulares.get(titularId)?.tipo==='empresa'&&!temHistoricoPessoal(r,titulares)&&autorizadoDocumento(r,titulares,sessao,ativos);
}
const CAMPOS_SNAPSHOT=['nome','categoria','titularId','emissao','validade','semVencimento','estado','atualizadoEm'];
export function snapshotKitDocumento(r,arquivoNome=''){return {...Object.fromEntries(CAMPOS_SNAPSHOT.filter(k=>Object.hasOwn(r||{},k)).map(k=>[k,r[k]])),arquivoNome};}
export function anexosVersaoKit(versao,arquivoId=''){
 const anexos=Array.isArray(versao?.anexos)&&versao.anexos.length?versao.anexos:[versao?.arquivo].filter(Boolean);
 return arquivoId?anexos.filter(a=>a.id===arquivoId):anexos;
}
export const hojeBrasiliaKit=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function chaveAnexoKit(documentoId,a){return !!a?.chave&&(a.chave===documentoId&&a.legado===true||String(a.chave).startsWith(`documentos/${encodeURIComponent(documentoId)}/`));}
export function pendenciasRequisitoKit(r,{disponivel=true,arquivoDisponivel=true,hoje=hojeBrasiliaKit()}={}){
 if(r.dispensado)return [];
 const out=[];
 if(!r.documentoId)return ['Documento não vinculado'];
 if(!disponivel)out.push('Documento indisponível ou acesso restrito');
 if(!r.versaoId||!arquivoDisponivel)out.push('Anexo da versão selecionada indisponível');
 const s=r.snapshot||{};
 if(!s.emissao)out.push('Emissão não informada');
 for(const campo of ['emissao','validade']){try{dataDocumento(s[campo],campo);}catch{out.push(campo==='emissao'?'Emissão inválida':'Validade inválida');}}
 if(s.semVencimento&&s.validade)out.push('Conferir validade e indicação de sem vencimento');
 if(s.emissao&&s.validade&&s.validade<s.emissao)out.push('Validade anterior à emissão');
 if(!s.semVencimento&&!s.validade)out.push('Validade não informada');
 if(!s.semVencimento&&s.validade&&s.validade<hoje)out.push('Documento vencido');
 if(s.emissao&&s.emissao>hoje)out.push('Emissão em data futura');
 if(s.estado&&s.estado!=='ativo')out.push(`Situação documental: ${s.estado}`);
 return out;
}
export const estadoKit=r=>r?.estado==='lixeira'?'lixeira':'ativo';
export function snapshotKit(r){return {nome:r.nome,licitacaoId:r.licitacaoId,titularId:r.titularId,estado:estadoKit(r),requisitos:structuredClone(r.requisitos||[])};}
// A projeção é fechada: metadados futuros e caminhos privados nunca saem da API.
export function kitPublico(id,r,{titulares,ativos,sessao,hoje}={}){
 const requisitos=(r.requisitos||[]).map(req=>{
  const doc=ativos.get(req.documentoId),permitido=!req.documentoId||documentoEmpresarialKit(doc,r.titularId,titulares,ativos,sessao);
  const versao=doc?.versoes?.find(v=>v.id===req.versaoId),arquivoDisponivel=!!versao&&anexosVersaoKit(versao,req.arquivoId).length>0&&anexosVersaoKit(versao,req.arquivoId).every(a=>chaveAnexoKit(req.documentoId,a));
  const out={id:req.id,categoria:req.categoria,descricao:req.descricao,dispensado:req.dispensado===true,justificativa:req.justificativa||'',documentoId:permitido?req.documentoId||'':'',versaoId:permitido?req.versaoId||'':'',arquivoId:permitido?req.arquivoId||'':'',snapshot:permitido&&req.snapshot?snapshotKitDocumento(req.snapshot,req.snapshot.arquivoNome):null,restrito:!permitido};
  out.pendencias=pendenciasRequisitoKit(req,{disponivel:permitido&&!doc?._documentosRetirado,arquivoDisponivel,hoje});return out;
 });
 const pendencias=requisitos.flatMap(req=>req.pendencias.map(p=>`${req.categoria}: ${p}`));if(!requisitos.length)pendencias.push('Nenhum requisito cadastrado');
 const edital=ativos.get(r.licitacaoId);if(edital?.tipo!=='licitacao'||edital._documentosRetirado)pendencias.push('Edital indisponível ou retirado do acompanhamento');
 return {id,nome:r.nome,licitacaoId:r.licitacaoId,titularId:r.titularId,estado:estadoKit(r),lixeiraEm:r.lixeiraEm||'',lixeiraPor:r.lixeiraPor||'',titularNome:titulares.get(r.titularId)?.nome||'',criadoEm:r.criadoEm,criadoPor:r.criadoPor,atualizadoEm:r.atualizadoEm,atualizadoPor:r.atualizadoPor,requisitos,pendencias,aviso:AVISO_KIT_LICITACOES,
  historico:(r.historico||[]).map(h=>({id:h.id,em:h.em,por:h.por,acao:h.acao}))};
}
