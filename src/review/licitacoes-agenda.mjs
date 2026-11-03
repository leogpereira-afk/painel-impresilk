import {idAgendamentoLicitacao,validarAgendamentoLicitacao,validarOrigemPesquisa,projetarLicitacoesAgenda} from '../../supabase/functions/_shared/licitacoes-agenda.mjs';
import {temPermissao} from '../../supabase/functions/_shared/patrimonio-acesso.mjs';
// Somente fichas fictícias da prévia. Navegação preserva; recarga reinicia.
const itens=new Map();
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
export const listarLicitacoesDemo=sessao=>temPermissao(sessao,'licitacoes')?structuredClone([...itens.values()]):[];
export function agendaLicitacoesDemo(mes,sessao){
  if(!temPermissao(sessao,'licitacoes')||!temPermissao(sessao,'calendario-empresa'))return json({erro:'Sem acesso a Licitações e Calendário da empresa.'},403);
  return json({ok:true,eventos:projetarLicitacoesAgenda([...itens.values()],mes)});
}
export async function salvarLicitacaoDemo(corpo,sessao){
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
    if(f.id&&!ant)return json({erro:'Registro não encontrado.'},409);
    const r={...ant,...f,id,...(origem?{origemPesquisa:origem}:{}),atualizadoEm:new Date().toISOString()};delete r.cadastroId;
    if(origem)validarAgendamentoLicitacao(r);
    itens.set(id,structuredClone(r));return json({ok:true,item:structuredClone(r)});
  }catch(e){return json({erro:e.message},e.status||422);}
}
