// Fichas fictícias; nenhum protocolo ou documento real entra na prévia.
import {atenderCadastrosLicitacoes} from '../../supabase/functions/_shared/licitacoes-cadastros-handler.mjs';
import {prepararEntidadesDemo} from './licitacoes-entidades.mjs';
import {bancoDocumentosDemo,prepararDocumentosDemo} from './documentos.mjs';
const empresa='73405710-78db-461b-9d33-37a228fd62c0';
const responder=(dados,status=200)=>new Response(JSON.stringify(dados),{status,headers:{'Content-Type':'application/json'}});
const actions=new Set(['listarCadastrosLicitacoes','salvarCadastroLicitacoes','arquivarCadastroLicitacoes']);
let preparado;
async function preparar(sb) {
  const casos=[
    {nome:'Cadastro estadual · demonstração',url:'https://example.com/cadastro-estadual',categoria:'governo',situacao:'em-analise',protocolo:'DEMO-ESTADUAL',enviadoEm:'2026-11-03',prioridade:'alta',proximaAcao:'Acompanhar a análise e a emissão do certificado',documentoIds:['contrato-licitacoes-demo','cnd-licitacoes-demo']},
    {nome:'Portal de compras · demonstração',url:'https://example.com/compras',categoria:'plataforma',situacao:'exigencia',exigencias:'Anexar a certidão fiscal atualizada — exemplo fictício.',prioridade:'alta',proximaAcao:'Renovar a certidão e conferir a documentação',prazoAcao:'2026-11-06',documentoIds:['certidao-demo']},
    {nome:'Cadastro federal · demonstração',url:'https://example.com/federal',categoria:'governo',situacao:'ativo',validade:'2027-03-01',verificadoEm:'2026-11-03',prioridade:'media',proximaAcao:'Conferir exigências de cada edital',documentoIds:[]},
  ];
  for(const c of casos)await atenderCadastrosLicitacoes({sb,sessao:{master:true},corpo:{action:'salvarCadastroLicitacoes',item:{cadastroId:crypto.randomUUID(),titularId:empresa,servicos:'Banners, adesivos e sinalização · exemplo',...c}},resposta:responder,quem:'Conta de demonstração',revalidarSessao:async()=>{}});
}
export async function respostaCadastrosLicitacoes(corpo,sessao,bens=[]) {
  if(!actions.has(corpo.action))return null;
  prepararDocumentosDemo(bens);
  const sb=bancoDocumentosDemo();
  try {
    await prepararEntidadesDemo(bens);
    preparado??=preparar(sb);await preparado;
    return await atenderCadastrosLicitacoes({sb,sessao,corpo,resposta:responder,quem:'Conta de demonstração',revalidarSessao:async()=>{}});
  }catch(e){return responder({ok:false,erro:e.message},e.status||500);}
}
