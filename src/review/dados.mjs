import {doSistema} from "../lib/sistemas.js";
const papel = (sistema, usuario, temporaria = false, permissoes = ['orcamentos']) => {
 const cargo=doSistema(sistema).papelInicial || '';
 return {sistema,login:usuario,papel:cargo,permissoes,real:{existe:true,ativo:true,login:usuario,papel:cargo,temporaria,permissoes}};
};
const sistemas = ['painel','rh','pcp','brief','dre','compras','pops','central','bosques','domo'];
const conta = (usuario,nome,papeis,tipo='pessoa') => ({usuario,nome,tipo,ativo:true,colaborador:nome,papeis,senhas:[]});
const initial = {
  sistemas, contas:[
    conta('ana.exemplo','Ana · demonstração',[papel('painel','ana.exemplo'),papel('compras','ana.exemplo',true)]),
    conta('bruno.exemplo','Bruno · demonstração',[papel('painel','bruno.exemplo',false,[]),papel('pcp','bruno.exemplo',true)]),
    conta('carla.exemplo','Carla · demonstração',[papel('rh','carla.exemplo'),papel('brief','carla.exemplo')]),
    conta('equipe.exemplo','Equipe · demonstração',[papel('pops','equipe.exemplo')],'funcao'),
  ],
  soltas:{}, elenco:{rh:[{nome:'Outra ficha · demonstração',como:'cadastro',detalhe:''}]},
  vendedores:[], colaboradores:['Ana · demonstração','Bruno · demonstração','Carla · demonstração'], contratos:[], pendencias:[],
  naPorta:[{usuario:'ana.exemplo',sistema:'compras',falhas:2,entradas:1,motivo:'senha incorreta',ultimaFalha:'2026-09-04T12:00:00Z',ultimaEntrada:'2026-09-04T12:05:00Z'}],
  fontes:Object.fromEntries(sistemas.map(s=>[s,{estado:['domo','bosques'].includes(s)?'nao_integrado':'consultado'}])),
};
let dados = structuredClone(initial);
export async function simularAcesso(action) {
  if (action !== 'listar') throw new Error('Esta prévia permite apenas consultar. Nenhuma conta ou senha será alterada.');
  await new Promise(resolve => setTimeout(resolve,700));
  if (new URLSearchParams(location.search).get('cenario') === 'erro') throw new Error('Falha de conexão simulada para revisão.');
  if (new URLSearchParams(location.search).get('cenario') === 'vazio') dados = {...structuredClone(initial),contas:[],naPorta:[],elenco:{}};
  return structuredClone(dados);
}

export async function simularBackup(action) {
  if(action !== 'status') throw new Error('Prévia local: operação de backup não executada. Nenhum dado foi enviado ou restaurado.');
  return {status:{capacidades:{restauroAtomico:true,arquivos:true,individual:true},atualizadoEm:new Date().toISOString(),sistemas:Object.fromEntries(sistemas.filter(s=>!['central','dre'].includes(s)).map((s,i)=>[s,{ok:s!=='pops',em:new Date(Date.now()-3600000).toISOString(),registros:120+i*15,erro:s==='pops'?'Falha simulada de conexão':undefined,porColecao:{'registros de demonstração':120+i*15}}]))}};
}
