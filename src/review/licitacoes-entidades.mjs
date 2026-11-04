// Somente dados fictícios da revisão local, sem cadastros externos ou produção.
import {atenderEntidadesLicitacoes} from '../../supabase/functions/_shared/licitacoes-entidades-handler.mjs';
import {bancoDocumentosDemo,prepararDocumentosDemo} from './documentos.mjs';
import {atenderCadastrosLicitacoes} from '../../supabase/functions/_shared/licitacoes-cadastros-handler.mjs';
const responder=(dados,status=200)=>new Response(JSON.stringify(dados),{status,headers:{'Content-Type':'application/json'}});
const actions=new Set(['listarEntidadesLicitacoes','salvarEntidadeLicitacoes','arquivarEntidadeLicitacoes']);
let preparado;
async function preparar(sb){
 const casos=[
  {novoId:'e1382290-bdc0-4b2d-8d9d-15aa12630101',nome:'Órgão municipal · demonstração',tipo:'orgao',municipios:['Montes Claros'],site:'https://example.com/compras',responsavel:'Equipe comercial · exemplo',cadastroExigido:'sim',prioridade:'alta',proximaAcao:'Conferir requisitos para o cadastro de fornecedor',prazoAcao:'2026-11-06'},
  {novoId:'e1382290-bdc0-4b2d-8d9d-15aa12630102',nome:'Empresa de serviços · demonstração',tipo:'empresa',municipios:['Montes Claros','Salinas'],site:'https://example.com/fornecedores',contato:'Compras · exemplo',email:'compras@example.com',cadastroExigido:'confirmar',proximaAcao:'Confirmar se há cadastro de fornecedores',prazoAcao:'2026-11-09'},
  {novoId:'e1382290-bdc0-4b2d-8d9d-15aa12630103',nome:'Instituição regional · demonstração',tipo:'orgao',municipios:['Salinas'],cadastroExigido:'sim',proximaAcao:'Consultar o portal e vincular a ficha de cadastro',prioridade:'media'},
 ];
 for(const item of casos)await atenderEntidadesLicitacoes({sb,sessao:{master:true},corpo:{action:'salvarEntidadeLicitacoes',item},resposta:responder,quem:'Conta de demonstração',revalidarSessao:async()=>{}});
 const dia=mais=>{const d=new Date();d.setDate(d.getDate()+mais);return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);};
 const exemplos=[
  {id:'e1382290-bdc0-4b2d-8d9d-15aa12630104',nome:'Indústria modelo · demonstração',cidade:'Montes Claros',slug:'industria-demo',situacao:'ativo',proximaAcao:'Apresentar soluções de sinalização para a próxima parada de manutenção',prioridade:'media',validade:dia(180),verificadoEm:dia(0)},
  {id:'e1382290-bdc0-4b2d-8d9d-15aa12630105',nome:'Rede de serviços · demonstração',cidade:'Pirapora',slug:'rede-demo',situacao:'em-analise',proximaAcao:'Confirmar o andamento da homologação com o setor de compras',prioridade:'media'},
  {id:'e1382290-bdc0-4b2d-8d9d-15aa12630106',nome:'Construtora exemplo · demonstração',cidade:'Salinas',slug:'construtora-demo',situacao:'exigencia',proximaAcao:'Conferir a documentação e responder à exigência de cadastro',prioridade:'alta',exigencias:'Certidão atualizada e portfólio de sinalização · exemplo fictício.'},
 ];
 for(const e of exemplos){
  const url=`https://example.com/${e.slug}`;
  const respostaCadastro=await atenderCadastrosLicitacoes({sb,sessao:{master:true},corpo:{action:'salvarCadastroLicitacoes',item:{cadastroId:crypto.randomUUID(),titularId:'73405710-78db-461b-9d33-37a228fd62c0',nome:e.nome,categoria:'empresa',url,situacao:e.situacao,protocolo:`DEMO-${e.slug}`,servicos:'Sinalização, adesivos e comunicação visual · demonstração',prioridade:e.prioridade,validade:e.validade||'',verificadoEm:e.verificadoEm||'',exigencias:e.exigencias||'',proximaAcao:e.proximaAcao,prazoAcao:dia(7)}},resposta:responder,quem:'Conta de demonstração',revalidarSessao:async()=>{}});
  const cadastro=await respostaCadastro.json();
  if(!cadastro.item?.id)throw new Error('Não foi possível preparar o cadastro fictício.');
  await atenderEntidadesLicitacoes({sb,sessao:{master:true},corpo:{action:'salvarEntidadeLicitacoes',item:{novoId:e.id,nome:e.nome,tipo:'empresa',municipios:[e.cidade],site:url,responsavel:'Equipe comercial · exemplo',contato:'Compras · exemplo',cadastroExigido:'sim',cadastroIds:[cadastro.item.id],prioridade:e.prioridade,proximaAcao:e.proximaAcao,prazoAcao:dia(7)}},resposta:responder,quem:'Conta de demonstração',revalidarSessao:async()=>{}});
 }
}
export async function prepararEntidadesDemo(bens=[]){
 prepararDocumentosDemo(bens);preparado??=preparar(bancoDocumentosDemo());await preparado;
}
export async function respostaEntidadesLicitacoes(corpo,sessao,bens=[]){
 if(!actions.has(corpo.action))return null;
 prepararDocumentosDemo(bens);const sb=bancoDocumentosDemo();
 try{await prepararEntidadesDemo(bens);return await atenderEntidadesLicitacoes({sb,sessao,corpo,resposta:responder,quem:'Conta de demonstração',revalidarSessao:async()=>{}});}
 catch(e){return responder({ok:false,erro:e.message},e.status||500);}
}
