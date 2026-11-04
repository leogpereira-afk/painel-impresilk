import {temPermissao} from './patrimonio-acesso.mjs';
import {conferirVersao,novoInstante,snapshotDocumento} from './documentos.mjs';
import {COLECAO_KITS_LICITACOES as colecao,falhaKit,idReferenciaKit,idKitLicitacoes,prepararKit,documentoEmpresarialKit,snapshotKitDocumento,anexosVersaoKit,chaveAnexoKit,snapshotKit,kitPublico} from './licitacoes-kits.mjs';

export async function atenderKitsLicitacoes({sb,sessao,corpo,resposta,quem,revalidarSessao}){
 if(!sessao)falhaKit('Entre no sistema.',401);
 if(!temPermissao(sessao,'licitacoes')||!temPermissao(sessao,'documentos'))falhaKit('O kit exige acesso a Licitações e Documentos.',403);
 if(typeof revalidarSessao!=='function')falhaKit('Conferência de acesso indisponível.',503);
 await revalidarSessao();
 const carregar=async nome=>{const rows=[];for(let de=0;;de+=1000){const {data,error}=await sb.from('painel_registros').select('id,registro').eq('colecao',nome).order('id').range(de,de+999);if(error)throw error;rows.push(...(data||[]));if((data||[]).length<1000)return rows;}};
 const ler=async(nome,id)=>{const {data,error}=await sb.from('painel_registros').select('registro').eq('colecao',nome).eq('id',id).maybeSingle();if(error)throw error;return data?.registro||null;};
 const titulares=new Map((await carregar('documentos_titulares')).map(r=>[r.id,{...r.registro,id:r.id}]));
 const ativos=new Map([...(await carregar('ativo_lixeira')).map(r=>({...r,registro:{...r.registro,_documentosRetirado:true}})),...(await carregar('ativo'))].map(r=>[r.id,{...r.registro,id:r.id}]));
 const publico=(id,r)=>kitPublico(id,r,{titulares,ativos,sessao});
 const responder=async body=>{await revalidarSessao();return resposta(body);};
 const validarKit=r=>{if(titulares.get(r?.titularId)?.tipo!=='empresa')falhaKit('Empresa do kit indisponível.',403);const edital=ativos.get(r?.licitacaoId);if(edital?.tipo!=='licitacao'||edital._documentosRetirado)falhaKit('Edital do kit indisponível.',409);};
 const gravar=async(nome,id,novo,anterior)=>{
  await revalidarSessao();
  const {data,error}=await sb.rpc('painel_registro_gravar',{p_colecao:nome,p_id:id,p_registro:novo,p_anterior:anterior});
  if(error){if(['40001','23505'].includes(error.code))falhaKit('Este registro mudou. Recarregue a lista antes de salvar.',409);if(!['23514','23503','22P02','42501'].includes(error.code))falhaKit('Não foi possível confirmar o salvamento. Recarregue a lista antes de tentar novamente; os registros foram preservados.',503);throw error;}
  return data||novo;
 };
 const resolver=async(req,anterior,titularId)=>{
  if(!req.documentoId)return {...req,snapshot:null};
  let doc=ativos.get(req.documentoId);
  if(!documentoEmpresarialKit(doc,titularId,titulares,ativos,sessao))falhaKit('Documento inexistente, pessoal, restrito ou de outra empresa.',403);
  const igual=anterior&&anterior.documentoId===req.documentoId&&(anterior.versaoId||'')===req.versaoId&&(anterior.arquivoId||'')===req.arquivoId;
  // Um kit parcial ou uma referência antiga não é atualizado ao renovar o acervo.
  if(igual)return {...anterior,...req,snapshot:anterior.snapshot};
  if(doc._documentosRetirado)falhaKit('Documento retirado do acervo. Escolha um documento disponível.',409);
  let versoes=Array.isArray(doc.versoes)?doc.versoes:[];
  if(!versoes.length&&!req.versaoId){
   const meta=await ler('arquivo',req.documentoId);
   if(meta||doc.temArquivo||doc.anexos?.length){
    // Materializa apenas a referência do legado no acervo canônico. A futura
    // renovação conserva esta versão e a chave original, sem copiar o arquivo.
    const raw=await ler('ativo',req.documentoId);
    if(!raw||raw.atualizadoEm!==doc.atualizadoEm)falhaKit('O documento mudou. Recarregue a lista.',409);
    const id=crypto.randomUUID(),anexo={id,chave:req.documentoId,legado:true,nome:meta?.nome||doc.arquivoNome||'documento.pdf',mime:meta?.mime||'application/pdf',criadoEm:doc.atualizadoEm||doc.criadoEm||novoInstante(),criadoPor:doc.atualizadoPor||''};
    const anexos=doc.anexos?.length?doc.anexos.map(a=>({...a,id:a.id||crypto.randomUUID()})):[anexo],principal=anexos.at(-1);
    const versao={id,emissao:doc.emissao||'',validade:doc.validade||'',arquivo:principal,anexos,criadoEm:anexo.criadoEm,criadoPor:anexo.criadoPor,snapshot:snapshotDocumento(doc)};
    const novo={...raw,versoes:[versao],anexos,atualizadoEm:novoInstante(raw),atualizadoPor:quem};
    doc={...await gravar('ativo',req.documentoId,novo,raw),id:req.documentoId};ativos.set(req.documentoId,doc);versoes=doc.versoes;
   }
  }
  if(!req.versaoId&&versoes.length){
   // Atual significa a ficha vigente, inclusive correções sem novo arquivo.
   // A versão selecionada por ID continua intacta para os kits já preparados.
   const vigente=versoes.at(-1),comparavel=r=>Object.fromEntries(Object.entries(snapshotDocumento(r)).filter(([k])=>!['atualizadoEm','atualizadoPor'].includes(k)));
   const registrado=vigente.snapshot?{...vigente.snapshot,emissao:vigente.emissao??vigente.snapshot.emissao,validade:vigente.validade??vigente.snapshot.validade}:null;
   if(!registrado||JSON.stringify(comparavel(registrado))!==JSON.stringify(comparavel(doc))){
    const raw=await ler('ativo',req.documentoId);
    if(!raw||raw.atualizadoEm!==doc.atualizadoEm)falhaKit('O documento mudou. Recarregue a lista.',409);
    if(!documentoEmpresarialKit(raw,titularId,titulares,ativos,sessao))falhaKit('Documento indisponível para este kit.',403);
    const anexos=Array.isArray(raw.anexos)&&raw.anexos.length?raw.anexos:anexosVersaoKit(vigente);
    const novaVersao={id:crypto.randomUUID(),emissao:raw.emissao||'',validade:raw.validade||'',arquivo:vigente.arquivo,anexos,criadoEm:raw.atualizadoEm||novoInstante(),criadoPor:raw.atualizadoPor||quem,snapshot:snapshotDocumento(raw)};
    const novo={...raw,versoes:[...versoes,novaVersao],atualizadoEm:novoInstante(raw),atualizadoPor:quem};
    doc={...await gravar('ativo',req.documentoId,novo,raw),id:req.documentoId};ativos.set(req.documentoId,doc);versoes=doc.versoes;
   }
  }
  const versao=req.versaoId?versoes.find(v=>v.id===req.versaoId):versoes.at(-1);
  if(req.versaoId&&!versao)falhaKit('Versão documental não encontrada.',404);
  if(req.arquivoId&&(!versao||!anexosVersaoKit(versao,req.arquivoId).length))falhaKit('Anexo não pertence à versão selecionada.',404);
  const origem=versao?.snapshot||doc;
  if(origem.titularId&&origem.titularId!==titularId)falhaKit('A versão selecionada pertence a outro titular.',403);
  return {...req,versaoId:versao?.id||'',snapshot:snapshotKitDocumento({...origem,emissao:versao?.emissao??origem.emissao,validade:versao?.validade??origem.validade},versao?.arquivo?.nome||'')};
 };
 switch(corpo.action){
  case 'listarKitsLicitacoes':{
   const itens=(await carregar(colecao)).filter(r=>titulares.get(r.registro?.titularId)?.tipo==='empresa').map(r=>publico(r.id,r.registro));return responder({ok:true,itens});
  }
  case 'salvarKitLicitacoes':{
   const edicao=Object.hasOwn(corpo.item||{},'id'),anterior=edicao?await ler(colecao,idReferenciaKit(corpo.item.id,'kit',true)):null;
   if(edicao&&!anterior)falhaKit('Kit não encontrado. Recarregue a lista.',409);
   const {id:pedidoId,campos}=prepararKit(corpo.item,anterior);validarKit(campos);
   const id=edicao?pedidoId:await idKitLicitacoes(campos.licitacaoId,campos.titularId),assinatura=JSON.stringify(campos);
   if(!edicao){const existe=await ler(colecao,id);if(existe){if(existe._criacao?.cadastroId===pedidoId&&existe._criacao.assinatura===assinatura)return responder({ok:true,item:publico(id,existe)});falhaKit('Já existe um kit para este edital e empresa. Recarregue para editar o kit existente.',409);}}
   if(anterior)conferirVersao(anterior,corpo.versao);
   // Referências ocultas não podem desaparecer ao editar uma projeção restrita.
   if(anterior?.requisitos?.some(r=>r.documentoId&&!documentoEmpresarialKit(ativos.get(r.documentoId),anterior.titularId,titulares,ativos,sessao)))falhaKit('O kit contém documentos restritos. Recupere o acesso antes de editá-lo.',403);
   const requisitos=[];for(const req of campos.requisitos)requisitos.push(await resolver(req,anterior?.requisitos?.find(r=>r.id===req.id),campos.titularId));
   const agora=novoInstante(anterior),novo={...(anterior||{}),...campos,requisitos,id,criadoEm:anterior?.criadoEm||agora,criadoPor:anterior?.criadoPor||quem,atualizadoEm:agora,atualizadoPor:quem,_criacao:anterior?._criacao||{cadastroId:pedidoId,assinatura},historico:[...(anterior?.historico||[]),{id:crypto.randomUUID(),em:agora,por:quem,acao:edicao?'editar':'criar',antes:anterior?snapshotKit(anterior):null,depois:snapshotKit({...campos,requisitos})}]};
   const salvo=await gravar(colecao,id,novo,anterior);return responder({ok:true,item:publico(id,salvo)});
  }
  case 'prepararDownloadKitLicitacoes':{
   const id=idReferenciaKit(corpo.id,'kit',true),kit=await ler(colecao,id);if(!kit)falhaKit('Kit não encontrado.',404);validarKit(kit);conferirVersao(kit,corpo.versao);
   const arquivos=[],vistos=new Set(),out=publico(id,kit);
   const pendencia=(req,mensagem)=>{const aviso=`${req.categoria}: ${mensagem}`;if(!out.pendencias.includes(aviso))out.pendencias.push(aviso);const publicoReq=out.requisitos.find(r=>r.id===req.id);if(publicoReq&&!publicoReq.pendencias.includes(mensagem))publicoReq.pendencias.push(mensagem);};
   for(const req of kit.requisitos||[]){
    if(req.dispensado||!req.documentoId||!req.versaoId)continue;
    const doc=ativos.get(req.documentoId);if(!documentoEmpresarialKit(doc,kit.titularId,titulares,ativos,sessao)||doc._documentosRetirado)continue;
    const versao=doc.versoes?.find(v=>v.id===req.versaoId);for(const arquivo of anexosVersaoKit(versao,req.arquivoId)){
     if(!arquivo?.id&&arquivo?.chave!==versao?.arquivo?.chave){pendencia(req,'Anexo sem identificador de versão; conferir o acervo');continue;}
     if(!chaveAnexoKit(req.documentoId,arquivo)){pendencia(req,'Referência do anexo inválida');continue;}
     await revalidarSessao();
     const {data,error}=await sb.storage.from('painel-arquivos').download(arquivo.chave);if(error||!data){pendencia(req,'Arquivo da versão selecionada não encontrado no acervo');continue;}
     const ref={documentoId:req.documentoId,versaoId:req.versaoId,...(arquivo.id?{arquivoId:arquivo.id}:{}),nome:arquivo.nome||'documento.pdf'},chave=JSON.stringify([ref.documentoId,ref.versaoId,ref.arquivoId||'']);if(vistos.has(chave))continue;vistos.add(chave);arquivos.push(ref);
    }
   }
   return responder({ok:true,kit:out,arquivos,pendencias:out.pendencias});
  }
  default:falhaKit('Ação desconhecida.',400);
 }
}
