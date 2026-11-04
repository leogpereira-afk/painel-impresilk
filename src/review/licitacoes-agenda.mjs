import {erroPreparacao} from '../lib/licitacoes-workspace.mjs';
import {atenderParticipacaoLicitacao} from '../../supabase/functions/_shared/licitacoes-participacao-handler.mjs';
import {pesquisaLicitacoesDemo} from './licitacoes.mjs';
import {idAgendamentoLicitacao,validarAgendamentoLicitacao,validarOrigemPesquisa,projetarLicitacoesAgenda} from '../../supabase/functions/_shared/licitacoes-agenda.mjs';
import {temPermissao} from '../../supabase/functions/_shared/patrimonio-acesso.mjs';
// Somente fichas fictícias da prévia. Navegação preserva; recarga reinicia.
const itens=new Map(),arquivos=new Map();
if(new URLSearchParams(globalThis.location?.search||'').get('cenario')==='licitacoes-workspace'){
 const data=dias=>{const d=new Date();d.setDate(d.getDate()+dias);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
 [
  {id:'demo-trabalho-1',nome:'Sinalização dos espaços de atendimento · exemplo',identificacao:'Instituto Municipal Exemplo',responsavel:'Equipe comercial',status:'participar',validade:data(1),hora:'09:00',valor:42000,acompanhamento:{proximaAcao:'Conferir medidas e finalizar a proposta',prazoAcao:data(0),checklist:[{id:'demo-check-1',texto:'Conferir medidas do anexo',feito:false}]}},
  {id:'demo-trabalho-2',nome:'Adesivos para veículos da frota · exemplo',identificacao:'Fundação Modelo',responsavel:'Equipe técnica',status:'avaliar',validade:data(4),hora:'14:00',valor:18000,acompanhamento:{proximaAcao:'Validar material e prazo de instalação',checklist:[]}},
  {id:'demo-trabalho-3',nome:'Totens e letras para recepção · exemplo',identificacao:'Órgão Demonstrativo',responsavel:'',status:'avaliar',validade:'',valor:0,acompanhamento:{proximaAcao:'Definir responsável e conferir o edital',checklist:[]}},
  {id:'demo-trabalho-4',nome:'Impressos institucionais · exemplo',identificacao:'Instituto Municipal Exemplo',responsavel:'Equipe comercial',status:'enviada',validade:data(-1),hora:'10:00',valor:9500,acompanhamento:{proximaAcao:'Consultar resultado no portal',checklist:[]}},
  {id:'demo-trabalho-5',nome:'Placas de identificação · exemplo encerrado',identificacao:'Fundação Modelo',responsavel:'Equipe comercial',status:'ganha',validade:data(-10),valor:12000,acompanhamento:{valorContratado:10800,checklist:[]}},
 ].forEach(item=>itens.set(item.id,{tipo:'licitacao',categoria:'Pregão eletrônico',edital:item.id.toUpperCase(),...item}));
}
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
export const listarLicitacoesDemo=sessao=>temPermissao(sessao,'licitacoes')?structuredClone([...itens.values()]):[];
export function agendaLicitacoesDemo(mes,sessao){
  if(!temPermissao(sessao,'licitacoes')||!temPermissao(sessao,'calendario-empresa'))return json({erro:'Sem acesso a Licitações e Calendário da empresa.'},403);
  return json({ok:true,eventos:projetarLicitacoesAgenda([...itens.values()],mes)});
}
function bancoParticipacaoDemo(){
 return {from(){let colecao,id;const q={select(){return q;},eq(k,v){if(k==='colecao')colecao=v;if(k==='id')id=v;return q;},async maybeSingle(){const r=colecao==='ativo'?itens.get(id):null;return {data:r?{registro:structuredClone(r)}:null,error:null};}};return q;},async rpc(nome,p){
  if(nome!=='painel_licitacao_preparar')return {error:{code:'40001'}};
  const anterior=itens.get(p.p_id)||null;if(anterior)return {data:{item:structuredClone(anterior),repetido:true},error:null};
  itens.set(p.p_id,structuredClone(p.p_registro));return {data:{item:structuredClone(p.p_registro),repetido:false},error:null};
 }};
}
export async function salvarLicitacaoDemo(corpo,sessao){
  if(corpo.action==='prepararParticipacaoLicitacao'){try{return await atenderParticipacaoLicitacao({sb:bancoParticipacaoDemo(),sessao,corpo,resposta:json,quem:'Conta de demonstração',revalidarSessao:async()=>{},consultar:id=>pesquisaLicitacoesDemo(undefined,id)});}catch(e){return json({erro:e.message},e.status||500);}}
  if(['lerArquivo','guardarArquivo','remover'].includes(corpo.action)&&itens.has(corpo.id)){
    if(!temPermissao(sessao,'licitacoes'))return json({erro:'Sem acesso a Licitações.'},403);
    const anterior=itens.get(corpo.id);
    if(corpo.action==='lerArquivo'){const referencia=corpo.arquivoId?[anterior.arquivoEdital,...(anterior.arquivosEdital||[])].find(a=>a?.id===corpo.arquivoId):anterior.arquivoEdital;const arquivo=arquivos.get(referencia?.chave);return arquivo?json({ok:true,...arquivo}):json({erro:'Arquivo não encontrado.'},404);}
    if(corpo.action==='remover'){itens.delete(corpo.id);return json({ok:true});}
    corpo={action:'salvar',item:{id:anterior.id,tipo:'licitacao',nome:anterior.nome},versao:corpo.versao,arquivo:{base64:corpo.base64,mime:corpo.mime,nome:corpo.nome}};
  }
  if(corpo.action!=='salvar'||corpo.item?.tipo!=='licitacao')return null;
  if(!temPermissao(sessao,'licitacoes'))return json({erro:'Sem acesso a Licitações.'},403);
  try{
    const f=corpo.item,id=f.id||f.cadastroId||crypto.randomUUID(),ant=itens.get(id),origem=f.origemPesquisa||ant?.origemPesquisa;
    if(origem){
      if(!temPermissao(sessao,'calendario-empresa'))return json({erro:'Sem acesso ao Calendário da empresa.'},403);
      validarOrigemPesquisa(origem);
      if(await idAgendamentoLicitacao(origem)!==id)return json({erro:'Identificador inválido.'},422);
      if(ant&&!f.id)return json({ok:true,item:structuredClone(ant),repetido:true});
      if(ant&&f.origemPesquisa&&JSON.stringify(validarOrigemPesquisa(ant.origemPesquisa))!==JSON.stringify(validarOrigemPesquisa(f.origemPesquisa)))return json({erro:'A origem não pode ser alterada.'},409);
    }
    if(Object.hasOwn(f,'preparacaoBot')&&(!ant?.preparacaoBot||JSON.stringify(f.preparacaoBot)!==JSON.stringify(ant.preparacaoBot)))return json({erro:'A preparação do BotImpresilk não pode ser alterada pelo formulário.'},422);
    if(f.id&&!ant)return json({erro:'Registro não encontrado.'},409);
    if(ant&&corpo.versao!==(ant.atualizadoEm||''))return json({erro:'Esta licitação mudou. Releia a versão atual e confira as diferenças antes de salvar.'},409);
    const invalido=erroPreparacao(f.acompanhamento);if(invalido)return json({erro:invalido},422);
    const r={...ant,...f,id,temArquivo:!!ant?.temArquivo,arquivoNome:ant?.arquivoNome||'',...(origem?{origemPesquisa:origem}:{}),atualizadoEm:new Date(Math.max(Date.now(),(Date.parse(ant?.atualizadoEm||'')||0)+1)).toISOString()};delete r.cadastroId;
    if(corpo.arquivo){
      if(String(corpo.arquivo.base64||'').length>4*1024*1024)return json({erro:'Edital acima de 3 MB.'},413);
      const arquivoId=crypto.randomUUID(),chave=`licitacoes/${id}/${arquivoId}`;
      arquivos.set(chave,structuredClone(corpo.arquivo));
      r.arquivosEdital=[...(ant?.arquivosEdital||[]),...(ant?.arquivoEdital?[ant.arquivoEdital]:[])];
      r.arquivoEdital={id:arquivoId,chave,nome:corpo.arquivo.nome,mime:corpo.arquivo.mime};r.arquivoNome=corpo.arquivo.nome;r.temArquivo=true;
    }
    if(origem)validarAgendamentoLicitacao(r);
    if(origem&&!ant){const {data,error}=await bancoParticipacaoDemo().rpc('painel_licitacao_preparar',{p_id:id,p_registro:r});if(error)return json({erro:'O acompanhamento mudou. Atualize a lista.'},409);return json({ok:true,item:data.item,...(data.repetido?{repetido:true}:{})});}
    itens.set(id,structuredClone(r));return json({ok:true,item:structuredClone(r)});
  }catch(e){return json({erro:e.message},e.status||422);}
}
