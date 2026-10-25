import {assinarMidias,salvarMidiaManual,validarMidiasConteudo} from './manuais-midias.mjs';
import {temPermissao} from './patrimonio-acesso.mjs';
import {validarVinculoPessoa} from './patrimonio-pessoas.mjs';
import {COLECAO_MANUAIS,camposManuais,falhaManual,prepararConteudoManual,validarReferenciaManual,resolverReferenciaManual,catalogoMaquinasManual,chaveReferenciaManual,validarAprovacaoManual,snapshotManual,manualVisivel} from './manuais-maquinas.mjs';

// Só a porta autenticada do painel-config chama este handler. Esta coleção
// deliberadamente NÃO faz parte dos get/merge/removerId genéricos.
export async function atenderManuaisMaquinas({sb,sessao,corpo,resposta,pessoasRH}){
 try{
  if(!sessao)return resposta({erro:'Entre no sistema.',semSessao:true},401);
  if(!temPermissao(sessao,'patrimonio'))falhaManual('Sem acesso ao Patrimônio.',403);
  const gestor=temPermissao(sessao,'manutencoes')||temPermissao(sessao,'configuracoes');
  const midia=corpo.action==='manuaisMaquinasMidiaSalvar';
  const salvar=corpo.action==='manuaisMaquinasSalvar',aprovar=corpo.action==='manuaisMaquinasAprovar';
  if((salvar||aprovar||midia)&&!gestor)falhaManual('Editar manuais exige Patrimônio e Manutenções ou Configurações.',403);
  if(aprovar&&!temPermissao(sessao,'configuracoes'))falhaManual('Aprovar manuais exige Configurações.',403);
  const catalogo=corpo.action==='manuaisMaquinasCatalogo',listagem=catalogo||corpo.action==='manuaisMaquinasListar';
  const permitidos=listagem?['action']:['action','referencia',...(midia?['mime','base64','restrita']:salvar?['conteudo','versaoAnterior']:aprovar?['versaoAnterior']:[])];
  camposManuais(corpo,permitidos,'Pedido');
  if(!listagem)validarReferenciaManual(corpo.referencia);
  if((salvar||aprovar)&&(!Object.hasOwn(corpo,'versaoAnterior')||(corpo.versaoAnterior!==null&&typeof corpo.versaoAnterior!=='string')))falhaManual('Informe a versão anterior do manual.');
  const carregar=async colecao=>{const linhas=[];for(let de=0;;de+=1000){const {data,error}=await sb.from('painel_registros').select('id,registro').eq('colecao',colecao).order('id').range(de,de+999);if(error)throw error;linhas.push(...(data||[]));if((data||[]).length<1000)break;}return linhas;};
  const [as,bs,ms,ss]=await Promise.all([carregar('ativo'),carregar('patrimonio'),catalogo?Promise.resolve([]):carregar(COLECAO_MANUAIS),catalogo?carregar('setores'):Promise.resolve([])]);
  const ativos=new Map(as.map(r=>[r.id,r.registro])),bens=new Map(bs.map(r=>[r.id,r.registro]));
  if(catalogo)return resposta({itens:catalogoMaquinasManual(ativos,bens,new Map(ss.map(r=>[r.registro?.sigla,r.registro])))});
  // Resolve pelas referências atuais, nunca por nome ou por aliases antigos
  // de um vínculo desfeito. Dois manuais que passaram a representar a mesma
  // máquina são um conflito explícito: não escolhemos um deles silenciosamente.
  const indice=new Map(),manuais=[];
  for(const row of ms){
   let resolvido;try{resolvido=resolverReferenciaManual(row.registro.referencia,ativos,bens);}catch(e){if(e.status===404)continue;throw e;}
   const m={...row.registro,id:row.id,referencias:resolvido.referencias};
   for(const ref of resolvido.referencias){const k=chaveReferenciaManual(ref);if(indice.has(k))falhaManual('Há dois manuais para a mesma máquina. Confira os vínculos antes de continuar.',409);indice.set(k,{row,manual:m});}
   manuais.push(m);
  }
  const visivel=async m=>assinarMidias(sb,manualVisivel(m,gestor),temPermissao(sessao,'inventario-valores'));
  if(corpo.action==='manuaisMaquinasListar')return resposta({itens:await Promise.all(manuais.map(visivel)).then(ms=>ms.filter(Boolean))});
  const resolvido=resolverReferenciaManual(corpo.referencia,ativos,bens),encontrado=indice.get(chaveReferenciaManual(corpo.referencia));
  const anterior=encontrado?.row.registro||null;
  if(corpo.action==='manuaisMaquinasLer')return resposta({manual:await visivel(encontrado?.manual)});
  if(midia)return resposta(await salvarMidiaManual(sb,corpo,anterior?.referencia||resolvido.referencia,temPermissao(sessao,'inventario-valores')));
  if(!salvar&&!aprovar)falhaManual('Ação desconhecida.',400);
  if(aprovar&&!anterior)falhaManual('Manual não encontrado.',404);
  if(corpo.versaoAnterior!==(anterior?.atualizadoEm??null))falhaManual('O manual mudou. Recarregue antes de salvar.',409);
  const conteudo=prepararConteudoManual(salvar?corpo.conteudo:anterior.conteudo);
  validarMidiasConteudo(conteudo,anterior?.referencia||resolvido.referencia);
  const pessoas=await pessoasRH();
  const responsavel=validarVinculoPessoa({responsavelId:conteudo.responsavelId,...(!conteudo.responsavelId?{responsavel:''}:{})},{responsavelId:anterior?.conteudo?.responsavelId,...(anterior?{responsavel:anterior.responsavel,responsavelIdPessoa:anterior.responsavelIdPessoa}:{})},pessoas,'responsavel');
  if(aprovar)validarAprovacaoManual(conteudo,pessoas);
  const agora=new Date(Math.max(Date.now(),(Date.parse(anterior?.atualizadoEm)||0)+1)).toISOString();
  const id=encontrado?.row.id||chaveReferenciaManual(resolvido.referencia);
  const novo={id,referencia:anterior?.referencia||resolvido.referencia,referencias:resolvido.referencias,conteudo,estado:aprovar?'aprovado':'rascunho',revisao:(anterior?.revisao||0)+1,criadoEm:anterior?.criadoEm||agora,atualizadoEm:agora,atualizadoPor:String(sessao.sub||''),responsavel:responsavel.responsavel,responsavelIdPessoa:responsavel.responsavelIdPessoa,historico:anterior?[...(anterior.historico||[]),snapshotManual(anterior)]:[],...(aprovar?{aprovadoEm:agora,aprovadoPor:String(sessao.sub||'')}:{})};
  // A RPC vigente compara TODO o JSON e grava sob advisory lock. A criação
  // usa o mesmo CAS com p_anterior=null: duas primeiras gravações não vencem.
  const {data,error}=await sb.rpc('painel_registro_gravar',{p_colecao:COLECAO_MANUAIS,p_id:id,p_registro:novo,p_anterior:anterior});
  if(error)throw error;
  return resposta({manual:await visivel(data)});
 }catch(e){
  if(e?.code==='40001'||e?.code==='23505')return resposta({erro:'O manual mudou. Recarregue antes de salvar.'},409);
  if([400,403,404,409,422,503].includes(e?.status))return resposta({erro:e.message},e.status);
  throw e;
 }
}
