import {temPermissao,bemPermitido} from './patrimonio-acesso.mjs';
import {TIPOS_DOCUMENTO,ehAVCB,texto,identidade,conferirVersao,novoInstante,autorizadoDocumento,documentoPublico,bemDocumento,prepararControle,arquivoDocumento,snapshotDocumento} from './documentos.mjs';
import {validarVinculoPessoa} from './patrimonio-pessoas.mjs';

// Apenas o handler autenticado chama esta porta com o cliente de serviço.
export async function atenderDocumentos({sb,sessao,corpo,resposta,quem,pessoasRH,bytesParaB64,bucket='painel-arquivos'}){
 const falha=(mensagem,status=422)=>{throw Object.assign(new Error(mensagem),{status});};
 if(!temPermissao(sessao,'documentos'))falha('Sem acesso a Documentos.',403);
 const carregar=async colecao=>{const linhas=[];for(let de=0;;de+=1000){const {data,error}=await sb.from('painel_registros').select('id,registro').eq('colecao',colecao).order('id').range(de,de+999);if(error)throw error;linhas.push(...(data||[]));if((data||[]).length<1000)break;}return linhas;};
 const ler=async(colecao,id)=>{const {data,error}=await sb.from('painel_registros').select('id,registro').eq('colecao',colecao).eq('id',id).maybeSingle();if(error)throw error;return data?.registro||null;};
 let mapaTitulares,mapaAtivos;
 const titulares=async()=>mapaTitulares ||= new Map((await carregar('documentos_titulares')).map(r=>[r.id,{...r.registro,id:r.id}]));
 const ativos=async()=>mapaAtivos ||= new Map([...(await carregar('ativo_lixeira')).map(r=>({...r,registro:{...r.registro,_documentosRetirado:true}})),...(await carregar('ativo'))].map(r=>[r.id,{...r.registro,id:r.id}]));
 const autorizar=async r=>{if(!autorizadoDocumento(r,await titulares(),sessao,await ativos()))falha('Sem acesso a este documento.',403);};
 const publico=async(id,r)=>documentoPublico(id,r,await titulares());
 const titularPermitido=t=>t?.tipo==='empresa'||temPermissao(sessao,'documentos-pessoais');
 const requisitoPermitido=(r,ts,as)=>{const alvo=as.get(r?.documentoId);return titularPermitido(ts.get(r?.titularId))&&(!alvo||autorizadoDocumento(alvo,ts,sessao,as));};
 const gravar=async(colecao,id,novo,anterior)=>{
  if(!anterior){const {data,error}=await sb.from('painel_registros').insert({colecao,id,registro:novo,atualizado_em:novo.atualizadoEm}).select('registro').single();if(error)throw error;return data?.registro||novo;}
  // A RPC vigente bloqueia a linha e compara o JSON completo sob o mesmo lock.
  const {data,error}=await sb.rpc('painel_registro_gravar',{p_colecao:colecao,p_id:id,p_registro:novo,p_anterior:anterior});if(error)throw error;return data;
 };
 const controle=async(id,colecao='ativo')=>{if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,180}$/.test(id))falha('ID inválido.');const r=await ler(colecao,id);if(!r)falha('Controle não encontrado.',404);await autorizar(r);return r;};
 const metadadoLegado=async(id,r,lixeira=false)=>{
  if(ehAVCB(r))return r.arquivoIncendio||null;
  const meta=await ler(lixeira?'arquivo_lixeira':'arquivo',id);
  return meta?{chave:id,nome:meta.nome||r.arquivoNome||'documento',mime:meta.mime||'application/pdf',legado:true}:r.temArquivo?{chave:id,nome:r.arquivoNome||'documento',mime:'application/pdf',legado:true}:null;
 };
 const guardarAnterior=async(id,r,versoes,capturar=false)=>{
  if(!r)return versoes;
  if(versoes.length){
   if(!capturar||JSON.stringify(versoes.at(-1).snapshot)===JSON.stringify(snapshotDocumento(r)))return versoes;
   const vigente=versoes.at(-1),arquivo=ehAVCB(r)?r.arquivoIncendio:vigente.arquivo,anexos=r.anexos||vigente.anexos||[arquivo].filter(Boolean);
   return [...versoes,{id:crypto.randomUUID(),emissao:r.emissao||'',validade:r.validade||'',arquivo,anexos,criadoEm:r.atualizadoEm||novoInstante(),criadoPor:r.atualizadoPor||'',snapshot:snapshotDocumento(r)}];
  }
  const arquivo=await metadadoLegado(id,r);
  if(!arquivo)return versoes;
  const vid=crypto.randomUUID(),anexo={...arquivo,id:vid,criadoEm:r.atualizadoEm||r.criadoEm||novoInstante(),criadoPor:r.atualizadoPor||''};
  return [{id:vid,emissao:r.emissao||'',validade:r.validade||'',arquivo:anexo,anexos:[anexo],criadoEm:anexo.criadoEm,criadoPor:anexo.criadoPor,snapshot:snapshotDocumento(r)}];
 };
 switch(corpo.action){
  case 'listarDocumentos':{
   const ts=await titulares(),as=await ativos(),linhas=await carregar('ativo');
   const itens=linhas.filter(r=>autorizadoDocumento(r.registro,ts,sessao,as)).map(r=>documentoPublico(r.id,r.registro,ts));
   const requisitos=(await carregar('documentos_requisitos')).filter(r=>requisitoPermitido(r.registro,ts,as)).map(r=>({...r.registro,id:r.id}));
   const projetar=(r,campos)=>Object.fromEntries(campos.filter(k=>Object.hasOwn(r,k)).map(k=>[k,r[k]]));
   const idsVinculados=new Set(itens.flatMap(i=>i.ativoIds||[]));const bens=linhas.map(r=>bemDocumento(r.id,r.registro,sessao)).filter(Boolean);
   for(const id of idsVinculados){const ativo=as.get(id);if(ativo?._documentosRetirado===true){const bem=bemDocumento(id,ativo,sessao);if(bem)bens.push(bem);}}
   const inventario=await carregar('patrimonio');
   for(const bem of bens){
    const ligados=inventario.filter(r=>r.id===bem.bemId||r.registro?.origemAtivoId===bem.id);
    bem.inventario=ligados.map(r=>{const permitido=bemPermitido({...r.registro,id:r.id},sessao);return projetar(permitido,['id','codigo','situacao','setorSigla','origemAtivoId',...(temPermissao(sessao,'inventario-valores')?['nomeGenerico','descricaoTecnica','dataAquisicao','valor','nf']:[])]);});
    if(ligados.length>1)bem.pendencias=[...(bem.pendencias||[]),'Conferir vínculos de inventário divergentes por ID'];
   }
   return resposta({ok:true,itens,titulares:[...ts.values()].filter(titularPermitido).map(t=>projetar(t,['id','tipo','nome','pessoaId','atualizadoEm'])),bens,requisitos:requisitos.map(r=>projetar(r,['id','titularId','categoria','estabelecimento','documentoId','estado','observacao','atualizadoEm'])),pessoas:await pessoasRH()});
  }
  case 'salvarControle':
  case 'renovarControle':{
   const {id,edicao}=identidade(corpo.item),anterior=await ler('ativo',id),renovar=corpo.action==='renovarControle';
   if(edicao&&!anterior)falha('Este controle foi retirado. Atualize a lista.',409);
   if(!edicao&&anterior)falha('Este ID já está cadastrado.',409);
   if(renovar&&!edicao)falha('Renovação exige controle existente.');
   if(anterior){await autorizar(anterior);conferirVersao(anterior,corpo.versao);}
   else if(await ler('ativo_lixeira',id))falha('Este cadastro está na lixeira.',409);
   const t=await titulares(),as=await ativos(),campos=prepararControle(corpo.item,anterior,t,as,sessao,await pessoasRH());
   if(ehAVCB(anterior)&&!renovar&&(!corpo.arquivo||campos.emissao!==(anterior.emissao||'')||campos.validade!==(anterior.validade||'')||Object.hasOwn(campos,'titularId')&&campos.titularId!==(anterior.titularId||'')))falha('Atualize o AVCB pela renovação ou ficha do Patrimônio.',409);
   if(renovar&&!campos.validade&&!campos.semVencimento)falha('Informe novo prazo ou marque sem vencimento.');
   if(renovar&&!corpo.arquivo)falha('Anexe o documento renovado.');
   const agora=novoInstante(anterior);let versoes=Array.isArray(anterior?.versoes)?[...anterior.versoes]:[],anexos=Array.isArray(anterior?.anexos)?[...anterior.anexos]:[],chave;
   if(corpo.arquivo){
    const arquivo=arquivoDocumento(corpo.arquivo);versoes=await guardarAnterior(id,anterior,versoes,renovar);const versaoId=crypto.randomUUID();chave=`documentos/${encodeURIComponent(id)}/${versaoId}`;
    const {error}=await sb.storage.from(bucket).upload(chave,arquivo.bytes,{contentType:arquivo.mime,upsert:false});if(error)throw error;
    const anexo={id:versaoId,chave,nome:arquivo.nome,mime:arquivo.mime,criadoEm:agora,criadoPor:quem};
    if(!anexos.length&&versoes.length)anexos=versoes.at(-1).anexos||[versoes.at(-1).arquivo].filter(Boolean);
    anexos=renovar?[anexo]:[...anexos,anexo];
    versoes.push({id:versaoId,emissao:campos.emissao||'',validade:campos.validade||'',arquivo:anexo,anexos,criadoEm:agora,criadoPor:quem,snapshot:snapshotDocumento({...anterior,...campos,criadoEm:anterior?.criadoEm||agora,atualizadoEm:agora,atualizadoPor:quem})});
   }
   const pessoalHistorico=anterior?.pessoalHistorico===true||t.get(anterior?.titularId)?.tipo==='pessoa'||t.get(campos.titularId??anterior?.titularId)?.tipo==='pessoa'||versoes.some(v=>t.get(v.snapshot?.titularId)?.tipo==='pessoa');
   const novo={...(anterior||{}),...campos,id,criadoEm:anterior?.criadoEm||agora,atualizadoEm:agora,atualizadoPor:quem,versoes,anexos,pessoalHistorico};
   if(chave){const arquivo=versoes.at(-1).arquivo;novo.temArquivo=true;novo.arquivoNome=arquivo.nome;if(ehAVCB(anterior)&&renovar)novo.arquivoIncendio={...arquivo,criadoEm:agora,criadoPor:quem};}
   let salvo;try{salvo=await gravar('ativo',id,novo,anterior);}catch(e){if(chave)await sb.storage.from(bucket).remove([chave]);throw e;}
   return resposta({ok:true,item:await publico(id,salvo)});
  }
  case 'lerVersaoDocumento':{
   const id=corpo.id,r=await controle(id),versoes=Array.isArray(r.versoes)?r.versoes:[];
   const v=corpo.versaoId?versoes.find(v=>v.id===corpo.versaoId):versoes.at(-1);
   if(corpo.versaoId&&!v)falha('Versão não encontrada.',404);
   const anexos=corpo.versaoId?(v?.anexos||[v?.arquivo].filter(Boolean)):[...(r.anexos||[]),...versoes.flatMap(v=>v.anexos||[v.arquivo].filter(Boolean))];
   const meta=corpo.arquivoId?anexos.find(a=>a.id===corpo.arquivoId):ehAVCB(r)&&!corpo.versaoId?r.arquivoIncendio:v?.arquivo||await metadadoLegado(id,r);
   if(corpo.arquivoId&&!meta)falha('Anexo não encontrado.',404);
   // Caminhos internos nunca são aceitos no pedido e precisam pertencer à ficha.
   if(!meta?.chave||!(meta.chave===id&&meta.legado===true||String(meta.chave).startsWith(`documentos/${encodeURIComponent(id)}/`)||ehAVCB(r)&&String(meta.chave).startsWith(`incendio/${encodeURIComponent(id)}/`)))falha('Anexo não encontrado.',404);
   const {data,error}=await sb.storage.from(bucket).download(meta.chave);if(error||!data)falha('Anexo não encontrado.',404);
   return resposta({ok:true,base64:bytesParaB64(await data.arrayBuffer()),mime:meta.mime,nome:meta.nome});
  }
  case 'removerControle':{
   const anterior=await controle(corpo.id);if(!TIPOS_DOCUMENTO.includes(anterior.tipo))falha('Bens físicos não podem ser retirados por Documentos.',403);
   conferirVersao(anterior,corpo.versao);
   const {error}=await sb.rpc('painel_documento_retirar',{p_id:corpo.id,p_anterior:anterior,p_por:quem});if(error)throw error;
   return resposta({ok:true,lixeira:true});
  }
  case 'lixeiraDocumentos':{
   const t=await titulares(),as=await ativos();const itens=(await carregar('ativo_lixeira')).filter(r=>TIPOS_DOCUMENTO.includes(r.registro?.tipo)&&autorizadoDocumento(r.registro,t,sessao,as)).map(r=>documentoPublico(r.id,r.registro,t));return resposta({ok:true,itens});
  }
  case 'restaurarControle':{
   const r=await controle(corpo.id,'ativo_lixeira');if(!TIPOS_DOCUMENTO.includes(r.tipo))falha('Restaure bens na área de Patrimônio.',403);
   const {error}=await sb.rpc('painel_ativo_restaurar',{p_id:corpo.id,p_anterior:r});if(error)throw error;return resposta({ok:true});
  }
  case 'salvarTitular':{
   const {id,edicao}=identidade(corpo.item),a=await ler('documentos_titulares',id),it=corpo.item;
   if(edicao&&!a||!edicao&&a)falha('O titular mudou. Atualize a lista.',409);
   const tipo=it.tipo??a?.tipo;if(!['empresa','pessoa'].includes(tipo))falha('Tipo de titular inválido.');if(a&&tipo!==a.tipo)falha('Não é possível trocar o tipo do titular.',409);
   if(!titularPermitido({tipo}))falha('Sem acesso a Documentos pessoais.',403);if(a)conferirVersao(a,corpo.versao);
   let nome=texto(it.nome??a?.nome,'nome do titular',200,true),pessoaId=texto(it.pessoaId??a?.pessoaId,'pessoa do RH');
   if(tipo==='empresa'&&pessoaId)falha('Empresa não pode receber vínculo de pessoa.');
   if(pessoaId){nome=validarVinculoPessoa({pessoaId,pessoa:nome},a?{pessoaId:a.pessoaId,pessoa:a.nome}:null,await pessoasRH()).pessoa;}
   const agora=novoInstante(a),novo={id,tipo,nome,pessoaId:tipo==='pessoa'?pessoaId:'',criadoEm:a?.criadoEm||agora,atualizadoEm:agora};
   return resposta({ok:true,item:await gravar('documentos_titulares',id,novo,a)});
  }
  case 'salvarRequisito':{
   const {id,edicao}=identidade(corpo.item),a=await ler('documentos_requisitos',id),it=corpo.item;
   if(edicao&&!a||!edicao&&a)falha('O requisito mudou. Atualize a lista.',409);if(a)conferirVersao(a,corpo.versao);
   const t=await titulares();if(a&&!requisitoPermitido(a,t,await ativos()))falha('Sem acesso a este requisito.',403);
   const vindo=k=>Object.hasOwn(it,k)?it[k]:a?.[k];const titularId=texto(vindo('titularId'),'titular',180,true),tit=t.get(titularId);if(!tit)falha('Titular não encontrado.');if(!titularPermitido(tit))falha('Sem acesso a Documentos pessoais.',403);
   const estado=vindo('estado')??'aplicavel';if(!['aplicavel','nao-se-aplica'].includes(estado))falha('Aplicabilidade inválida.');
   const documentoId=texto(vindo('documentoId'),'documento');if(documentoId){const r=await controle(documentoId);if(r.titularId!==titularId)falha('O documento deve pertencer ao titular selecionado.');if(estado==='nao-se-aplica')falha('Um requisito não aplicável não pode apontar documento.');}
   const agora=novoInstante(a),novo={id,titularId,categoria:texto(vindo('categoria'),'categoria',200,true),estabelecimento:texto(vindo('estabelecimento'),'estabelecimento',200),documentoId,estado,observacao:texto(vindo('observacao'),'observação',2000),criadoEm:a?.criadoEm||agora,atualizadoEm:agora};
   return resposta({ok:true,item:await gravar('documentos_requisitos',id,novo,a)});
  }
  case 'previaDocumentos':{
   const ts=await titulares(),as=await ativos(),itens=[];
   for(const {id,registro:r} of await carregar('ativo')){
    if(TIPOS_DOCUMENTO.includes(r?.tipo)||ehAVCB(r)){if(!autorizadoDocumento(r,ts,sessao,as))continue;const pendencias=[];if(!ts.has(r.titularId))pendencias.push('Confirmar titular por ID');if(!r.semVencimento&&!r.validade)pendencias.push('Confirmar validade ou ausência de vencimento');if(!Array.isArray(r.versoes)&&r.temArquivo||ehAVCB(r)&&r.arquivoIncendio&&!r.versoes?.length)pendencias.push('Preservar anexo antigo na primeira renovação');itens.push({id,origem:ehAVCB(r)?'incendio':'ativo',destino:ehAVCB(r)?'mesma-ficha-avcb':'controle',pendencias});}
    else if(['veiculo','maquina'].includes(r?.tipo)&&bemDocumento(id,r,sessao))itens.push({id,origem:'ativo',destino:'bem-fisico',pendencias:r.validade||r.temArquivo?['Conferir documento legado e vincular controle por ID sem transformar a ficha']:[]});
   }
   return resposta({ok:true,somenteLeitura:true,itens});
  }
  default:falha('Ação desconhecida.',400);
 }
}
