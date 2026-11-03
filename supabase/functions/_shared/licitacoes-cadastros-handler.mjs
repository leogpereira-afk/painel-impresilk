import {temPermissao} from './patrimonio-acesso.mjs';
import {conferirVersao,novoInstante} from './documentos.mjs';
import {falhaCadastro,identidadeCadastro,prepararCadastro,idCadastroLicitacoes,documentosCadastro,documentoDoCadastro,cadastroPublico,snapshotCadastro} from './licitacoes-cadastros.mjs';

export async function atenderCadastrosLicitacoes({sb,sessao,corpo,resposta,quem,revalidarSessao}){
 if(!sessao)falhaCadastro('Entre no sistema.',401);
 if(!temPermissao(sessao,'licitacoes'))falhaCadastro('Sem acesso a Licitações.',403);
 if(typeof revalidarSessao!=='function')falhaCadastro('Conferência de acesso indisponível.',503);
 await revalidarSessao();
 const colecao='licitacoes_cadastros';
 const carregar=async nome=>{const rows=[];for(let de=0;;de+=1000){const {data,error}=await sb.from('painel_registros').select('id,registro').eq('colecao',nome).order('id').range(de,de+999);if(error)throw error;rows.push(...(data||[]));if((data||[]).length<1000)return rows;}};
 const ler=async id=>{const {data,error}=await sb.from('painel_registros').select('registro').eq('colecao',colecao).eq('id',id).maybeSingle();if(error)throw error;return data?.registro||null;};
 const titulares=new Map((await carregar('documentos_titulares')).map(r=>[r.id,{...r.registro,id:r.id}]));
 // Não lemos o acervo para quem não tem Documentos. Para os demais, a projeção
 // exclui pessoais, históricos pessoais, bens e arquivos de armazenamento.
 const ativos=temPermissao(sessao,'documentos')?new Map([...(await carregar('ativo_lixeira')).map(r=>({...r,registro:{...r.registro,_documentosRetirado:true}})),...(await carregar('ativo'))].map(r=>[r.id,{...r.registro,id:r.id}])):new Map();
 const publico=(id,r)=>cadastroPublico(id,r,titulares,ativos,sessao);
 const responder=async body=>{await revalidarSessao();return resposta(body);};
 const empresaValida=r=>titulares.get(r?.titularId)?.tipo==='empresa';
 switch(corpo.action){
  case 'listarCadastrosLicitacoes':{
   const itens=(await carregar(colecao)).filter(r=>empresaValida(r.registro)).map(r=>publico(r.id,r.registro));
   const documentos=[...ativos].filter(([id,r])=>!r._documentosRetirado&&documentoDoCadastro(id,r,r.titularId,titulares,ativos,sessao)).map(([id,r])=>({id,nome:r.nome||'',titularId:r.titularId,categoria:r.categoria||'',validade:r.validade||'',semVencimento:r.semVencimento===true,estado:r.estado||'',temArquivo:r.temArquivo===true||!!r.anexos?.length||!!r.versoes?.length}));
   return responder({ok:true,itens,titulares:[...titulares.values()].filter(t=>t.tipo==='empresa').map(t=>({id:t.id,tipo:'empresa',nome:t.nome||''})),documentos,podeVincularDocumentos:temPermissao(sessao,'documentos')});
  }
  case 'salvarCadastroLicitacoes':
  case 'arquivarCadastroLicitacoes':{
   const arquivar=corpo.action==='arquivarCadastroLicitacoes',item=arquivar?{id:corpo.id,situacao:'arquivado'}:corpo.item,{id:pedidoId,edicao}=identidadeCadastro(item);
   const anterior=edicao?await ler(pedidoId):null;
   if(edicao&&!anterior)falhaCadastro('Cadastro não encontrado. Atualize a lista.',409);
   if(anterior&&!empresaValida(anterior))falhaCadastro('Cadastro indisponível para este titular.',403);
   if(anterior)conferirVersao(anterior,corpo.versao);
   const campos=prepararCadastro(item,anterior,titulares),id=edicao?pedidoId:await idCadastroLicitacoes(campos.titularId,campos.url);
   if(!edicao&&await ler(id))falhaCadastro('Já existe um cadastro deste portal para esta empresa, inclusive se arquivado. Edite ou reative a ficha existente.',409);
   campos.documentoIds=documentosCadastro(item,anterior,campos.titularId,titulares,ativos,sessao);
   const agora=novoInstante(anterior),novo={...campos,id,criadoEm:anterior?.criadoEm||agora,criadoPor:anterior?.criadoPor||quem,atualizadoEm:agora,atualizadoPor:quem,historico:[...(Array.isArray(anterior?.historico)?anterior.historico:[]),{id:crypto.randomUUID(),em:agora,por:quem,acao:arquivar?'arquivar':edicao?'editar':'criar',antes:anterior?snapshotCadastro(anterior):null,depois:snapshotCadastro(campos)}]};
   await revalidarSessao();
   // A mesma RPC serializa criação por ID determinístico e compara a edição
   // inteira sob lock. Não há upsert direto que possa apagar o vencedor.
   const {data,error}=await sb.rpc('painel_registro_gravar',{p_colecao:colecao,p_id:id,p_registro:novo,p_anterior:anterior});
   if(error){if(!edicao&&['23505','40001'].includes(error.code))falhaCadastro('Outro cadastro deste portal para esta empresa foi salvo. Atualize a lista para editá-lo.',409);throw error;}
   return responder({ok:true,item:publico(id,data||novo)});
  }
  default:falhaCadastro('Ação desconhecida.',400);
 }
}
