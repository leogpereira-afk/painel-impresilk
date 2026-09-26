import {doSistema} from "../lib/sistemas.js";
const papel = (sistema, usuario, temporaria = false, permissoes = ['orcamentos']) => {
 const cargo=doSistema(sistema).papelInicial || '';
 return {sistema,login:usuario,papel:cargo,permissoes,real:{existe:true,ativo:true,login:usuario,papel:cargo,temporaria,permissoes}};
};
/* Os estados raros tambem precisam aparecer na previa, senao nunca sao
   fotografados: uma conta que a tela promete e o sistema nao tem (Diego no
   PCP), uma pessoa desativada (Elisa), uma conta sem dono (montagem2 no PCP),
   quem entra sem senha pelo nome (o instalador) e uma pendencia de vinculo. */
const fantasma = (sistema, usuario) => ({sistema,login:usuario,papel:doSistema(sistema).papelInicial||'',permissoes:[],real:{existe:false}});
const desligado = (sistema, usuario) => ({...papel(sistema, usuario), real:{...papel(sistema, usuario).real, ativo:false}});
const sistemas = ['painel','rh','pcp','brief','dre','compras','pops','vof','central','bosques','domo'];
const conta = (usuario,nome,papeis,tipo='pessoa',extra={}) => ({usuario,nome,tipo,ativo:true,colaborador:nome,papeis,senhas:[],...extra});
const initial = {
  sistemas, contas:[
    conta('ana.exemplo','Ana · demonstração',[{...papel('painel','ana.exemplo'),vendedor_id:'ANA EXEMPLO'},papel('compras','ana.exemplo',true)],'pessoa',{trocar_senha:true}),
    conta('bruno.exemplo','Bruno · demonstração',[papel('painel','bruno.exemplo',false,[]),papel('pcp','bruno.exemplo',true)]),
    conta('carla.exemplo','Carla · demonstração',[papel('rh','carla.exemplo'),papel('brief','carla.exemplo'),papel('dre','carla.exemplo')]),
    conta('diego.exemplo','Diego · demonstração',[papel('painel','diego.exemplo',false,['agenda','orcamentos']),fantasma('pcp','diego'),papel('compras','diego.exemplo')]),
    conta('elisa.exemplo','Elisa · demonstração',[desligado('rh','elisa.exemplo')],'pessoa',{ativo:false}),
    conta('equipe.exemplo','Equipe · demonstração',[papel('pops','equipe.exemplo')],'funcao'),
  ],
  soltas:{pcp:[{login:'montagem2',papel:'montagem',nome:'Montagem 2',ativo:true}]},
  elenco:{rh:[{nome:'Outra ficha · demonstração',como:'cadastro',detalhe:''}],pcp:[{nome:'Instalador · demonstração',como:'nome',detalhe:'instalador'}]},
  vendedores:[{nome:'ANA EXEMPLO',n:12}], colaboradores:['Ana · demonstração','Bruno · demonstração','Carla · demonstração','Diego · demonstração'], contratos:[],
  pendencias:[{usuario:'diego.exemplo',nome:'Diego · demonstração',pendencia:'ficha do RH com o nome escrito de outro jeito'}],
  naPorta:[{usuario:'ana.exemplo',sistema:'compras',falhas:2,entradas:1,motivo:'senha incorreta',ultimaFalha:'2026-09-04T12:00:00Z',ultimaEntrada:'2026-09-04T12:05:00Z'},{usuario:'diego',sistema:'pcp',falhas:4,entradas:0,motivo:'usuário não existe',ultimaFalha:'2026-09-24T11:00:00Z'}],
  fontes:Object.fromEntries(sistemas.map(s=>[s,{estado:['domo','bosques'].includes(s)?'nao_integrado':'consultado'}])),
};
let dados = structuredClone(initial);
const cenario = () => new URLSearchParams(location.search).get('cenario');
const espera = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const OBRIGA = new Set(['painel','brief','pcp','pops','vof']);

/* A SENHA PARA TODOS, NA PREVIA: responde no formato do contrato das senhas
   (acao B) sem gravar NADA. A senha e sempre a mesma e diz que nao vale.
   `?cenario=parcial` devolve o RH recusando; `?cenario=erro` continua erro. */
function simularDefinicao(corpo) {
  const c = dados.contas.find(x => x.usuario === corpo.usuario);
  if (!c) throw new Error('Conta não encontrada.');
  const porta = c.tipo === 'funcao';
  const itens = c.papeis.map(p => {
    if (['central','dre'].includes(p.sistema)) return {sistema:p.sistema,resultado:'pela-entrada',obriga:!porta};
    if (doSistema(p.sistema).soLeitura) return {sistema:p.sistema,resultado:'fora',motivo:'senha própria, fora do Painel'};
    if (!p.real?.existe) return {sistema:p.sistema,resultado:'sem-conta',motivo:`não existe conta "${p.login}" ali`};
    if (p.sistema === 'rh' && cenario() === 'parcial') return {sistema:'rh',resultado:'falhou',motivo:'o RH não respondeu (simulado)'};
    return {sistema:p.sistema,resultado:'trocada',login:p.real.login,obriga:!porta && OBRIGA.has(p.sistema)};
  });
  if (cenario() === 'parcial' && !itens.some(i => i.sistema === 'rh')) itens.push({sistema:'rh',resultado:'falhou',motivo:'o RH não respondeu (simulado)'});
  return {ok:true,senha:corpo.senha || 'demonstracao-nao-vale-123',temporaria:!porta,parcial:itens.some(i=>i.resultado==='falhou'),entrada:'trocada',sistemas:itens};
}

export async function simularAcesso(action, corpo = {}) {
  if (action === 'definirSenha') {
    await espera(500);
    if (cenario() === 'erro') throw new Error('Falha de conexão simulada para revisão.');
    return simularDefinicao(corpo);
  }
  if (action !== 'listar') throw new Error('Esta prévia permite apenas consultar. Nenhuma conta ou senha será alterada.');
  await espera(700);
  if (cenario() === 'erro') throw new Error('Falha de conexão simulada para revisão.');
  if (cenario() === 'vazio') dados = {...structuredClone(initial),contas:[],naPorta:[],elenco:{},soltas:{},pendencias:[]};
  return structuredClone(dados);
}

/* A MINHA SENHA, NA PREVIA (acao A): nada e enviado; a resposta e um exemplo
   fixo com os casos que a tela precisa saber mostrar: login diferente no PCP,
   DRE pela entrada, POPs sem conta, e o RH recusando em `?cenario=parcial`. */
export async function simularTrocaDeSenha() {
  await espera(500);
  if (cenario() === 'erro') throw new Error('Não consegui conferir a sua senha agora. Tente de novo em instantes.');
  const parcial = cenario() === 'parcial';
  return {ok:true,parcial,entrada:'trocada',sistemas:[
    {sistema:'painel',resultado:'trocada',login:'direcao.exemplo'},
    {sistema:'pcp',resultado:'trocada',login:'leo'},
    parcial ? {sistema:'rh',resultado:'falhou',motivo:'o RH não respondeu (simulado)'} : {sistema:'rh',resultado:'trocada'},
    {sistema:'dre',resultado:'pela-entrada'},
    {sistema:'pops',resultado:'sem-conta',motivo:'não existe conta "direcao.exemplo" ali'},
  ]};
}

export async function simularBackup(action) {
  if(action !== 'status') throw new Error('Prévia local: operação de backup não executada. Nenhum dado foi enviado ou restaurado.');
  // `?cenario=erro` tambem vale para o Backup: sem isto o estado de erro da tela nunca era fotografado.
  if(cenario() === 'erro') { await espera(300); throw new Error('Falha de conexão simulada para revisão.'); }
  return {status:{capacidades:{restauroAtomico:true,arquivos:true,individual:true},atualizadoEm:new Date().toISOString(),sistemas:Object.fromEntries(sistemas.filter(s=>!['central','dre'].includes(s)).map((s,i)=>[s,{ok:s!=='pops',em:new Date(Date.now()-3600000).toISOString(),registros:120+i*15,erro:s==='pops'?'Falha simulada de conexão':undefined,porColecao:{'registros de demonstração':120+i*15}}]))}};
}
