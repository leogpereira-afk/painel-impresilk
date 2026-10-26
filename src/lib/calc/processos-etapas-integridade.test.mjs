import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepararProcesso,atualizarEtapa,planejarEtapa} from '../../../supabase/functions/_shared/processos.mjs';

const gestor={sub:'gestor-ficticio',nome:'Gestor fictício',rhId:'rh1'};
const pessoa={id:'rh1',nome:'Pessoa fictícia',area:'Exemplo',cargo:''};
const etapa=()=>({id:'e1',titulo:'Etapa fictícia',descricao:'Planejamento',responsavelRhId:'rh1',prazo:'2020-01-10',situacao:'pendente',dependeDe:[],nota:'',concluidaEm:null});
const ficha=()=>({id:'p1',tipo:'demanda',titulo:'Demanda fictícia',objetivo:'Conferir integridade',setor:'empresa',situacao:'execucao',prioridade:'normal',prazo:'2020-01-30',analise:'',solucao:'',empresa:'',especialidade:'',responsavelRhId:'rh1',envolvidos:[{rhId:'rh1',nome:pessoa.nome,area:pessoa.area,cargo:''}],etapas:[etapa()],criadoPor:gestor.sub,criadoPorNome:gestor.nome,criadoEm:'2020-01-01T12:00:00Z',versao:'v1',registros:[],anexos:[],historico:[],convites:[],consultores:[]});
const salvar=(r,alteracao={})=>prepararProcesso({...structuredClone(r),versaoAnterior:r.versao,...alteracao},r,gestor,[pessoa]);
const invalida=fn=>assert.throws(fn,e=>e.status===422);

test('retirar etapa com avaliação ou registro vinculado é recusado mesmo ao limpar o restante da entrada',()=>{
 for(const origem of ['avaliacao','registro']){
  const r=ficha();
  if(origem==='avaliacao')r.etapas[0].avaliacoes=[{pontuacao:8,comentario:'Conferência fictícia'}];
  else r.registros=[{id:'registro1',tipo:'acao',etapaId:'e1',texto:'Registro fictício'}];
  const antes=structuredClone(r);
  invalida(()=>salvar(r,{etapas:[],registros:[]}));
  assert.deepEqual(r,antes);
 }
});

test('retirar etapa com andamento preserva evidências, mas uma etapa ainda sem atividade pode sair',()=>{
 for(const alteracao of [{situacao:'execucao'},{inicioReal:'2020-01-02'},{fimReal:'2020-01-03'},{progresso:20},{nota:'Andamento registrado'},{concluidaEm:'2020-01-03T12:00:00Z'}]){
  const r=ficha();Object.assign(r.etapas[0],alteracao);
  invalida(()=>salvar(r,{etapas:[]}));
 }
 assert.deepEqual(salvar(ficha(),{etapas:[]}).etapas,[]);
});

test('editar ficha não conclui etapa ou processo sem início e término reais',()=>{
 const r=ficha();
 for(const situacao of ['execucao','validacao','concluida'])invalida(()=>salvar(r,{etapas:[{...r.etapas[0],situacao}]}));
 invalida(()=>salvar(r,{situacao:'concluida',etapas:[{...r.etapas[0],situacao:'concluida'}]}));
});

test('editar ficha aceita datas informadas e conclui com progresso coerente',()=>{
 const r=ficha();
 const x=salvar(r,{situacao:'concluida',etapas:[{...r.etapas[0],situacao:'concluida',inicioReal:'2020-01-02',fimReal:'2020-01-03',progresso:30}]});
 assert.equal(x.etapas[0].inicioReal,'2020-01-02');
 assert.equal(x.etapas[0].fimReal,'2020-01-03');
 assert.equal(x.etapas[0].progresso,100);
 assert.equal(x.situacao,'concluida');
});

test('editar título preserva etapa legada sem completar datas ou progresso ausentes',()=>{
 const r=ficha();r.etapas[0]={...etapa(),situacao:'concluida',concluidaEm:'2020-01-03T12:00:00Z',avaliacoes:[{pontuacao:8,comentario:'Histórico fictício'}]};
 assert.deepEqual(salvar(r,{titulo:'Título revisto'}).etapas,r.etapas);
});

test('ação legada etapa exige datas ao mudar o estado e aceita datas explicitamente informadas',()=>{
 const r=ficha(),externo={sub:'convite:ficticio',externo:true,nivel:'colaborador'};
 invalida(()=>atualizarEtapa(r,{etapaId:'e1',situacao:'validacao',nota:'Conferir'},externo));
 const x=atualizarEtapa(r,{etapaId:'e1',situacao:'validacao',inicioReal:'2020-01-02',fimReal:'2020-01-03',nota:'Conferir',responsavelRhId:'forjado',prazo:'2099-01-01'},externo);
 assert.equal(x.etapas[0].inicioReal,'2020-01-02');
 assert.equal(x.etapas[0].fimReal,'2020-01-03');
 assert.equal(x.etapas[0].progresso,100);
 assert.equal(x.etapas[0].responsavelRhId,'rh1');
 assert.equal(x.etapas[0].prazo,'2020-01-10');
});

test('os três caminhos recusam datas reais futuras, ordem inválida e progresso incompatível',()=>{
 const r=ficha();
 for(const alteracao of [{situacao:'execucao',inicioReal:'2099-01-01',progresso:10},{situacao:'validacao',inicioReal:'2020-01-03',fimReal:'2020-01-02',progresso:100},{situacao:'pendente',inicioReal:'2020-01-02',progresso:0},{situacao:'pendente',progresso:20},{situacao:'execucao',inicioReal:'2020-01-02',progresso:100},{situacao:'execucao',inicioReal:'2020-01-02',progresso:101}]){
  const e={...r.etapas[0],...alteracao};
  invalida(()=>salvar(r,{etapas:[e]}));
  invalida(()=>atualizarEtapa(r,{...e,etapaId:'e1'},gestor));
  invalida(()=>planejarEtapa(r,{...e,etapaId:'e1'},gestor));
 }
});

test('planejamento conserva legado ao alterar somente a descrição e não fabrica datas',()=>{
 const r=ficha();r.etapas[0]={...etapa(),situacao:'execucao'};
 const x=planejarEtapa(r,{...r.etapas[0],etapaId:'e1',descricao:'Descrição revista'},gestor);
 assert.equal(x.etapas[0].descricao,'Descrição revista');
 assert.equal(x.etapas[0].inicioReal,undefined);
 assert.equal(x.etapas[0].fimReal,undefined);
 assert.equal(x.etapas[0].progresso,undefined);
});

test('reabrir predecessora não deixa uma etapa dependente em execução',()=>{
 const r=ficha();r.etapas=[{...etapa(),situacao:'concluida',inicioReal:'2020-01-01',fimReal:'2020-01-02',progresso:100},{...etapa(),id:'e2',dependeDe:['e1'],situacao:'execucao',inicioReal:'2020-01-03',progresso:20}];
 invalida(()=>atualizarEtapa(r,{etapaId:'e1',situacao:'pendente',inicioReal:'',fimReal:'',progresso:0},gestor));
});

test('voltar a etapa para pendente não permite apagar depois a atividade anterior',()=>{
 const r=ficha();r.etapas[0]={...etapa(),situacao:'execucao',inicioReal:'2020-01-02',progresso:20};
 const reaberta=atualizarEtapa(r,{etapaId:'e1',situacao:'pendente',inicioReal:'',fimReal:'',progresso:0},gestor);
 invalida(()=>salvar(reaberta,{etapas:[]}));
});

test('progresso realizado em etapa bloqueada exige início real nos três caminhos',()=>{
 const r=ficha(),e={...etapa(),situacao:'bloqueada',nota:'Aguardar material',progresso:20};
 invalida(()=>salvar(r,{etapas:[e]}));
 invalida(()=>atualizarEtapa(r,{...e,etapaId:'e1'},gestor));
 invalida(()=>planejarEtapa(r,{...e,etapaId:'e1'},gestor));
});

test('encerrar processo exige conferir datas de etapas legadas concluídas',()=>{
 const r=ficha();r.etapas[0]={...etapa(),situacao:'concluida'};
 invalida(()=>salvar(r,{situacao:'concluida'}));
});

test('planejamento permite corrigir descrição de etapa legada sem prazo',()=>{
 const r=ficha();r.etapas[0].prazo='';
 const x=planejarEtapa(r,{...r.etapas[0],etapaId:'e1',descricao:'Descrição revista'},gestor);
 assert.equal(x.etapas[0].prazo,'');
 assert.equal(x.etapas[0].descricao,'Descrição revista');
 assert.equal(x.etapas[0].inicioReal,undefined);
});

test('corrigir nota de etapa legada concluída não inventa a data de conclusão',()=>{
 const r=ficha();r.etapas[0]={...etapa(),situacao:'concluida'};
 const x=atualizarEtapa(r,{etapaId:'e1',situacao:'concluida',nota:'Nota corrigida'},gestor);
 assert.equal(x.etapas[0].concluidaEm,null);
 const y=planejarEtapa(r,{...r.etapas[0],etapaId:'e1',nota:'Nota corrigida'},gestor);
 assert.equal(y.etapas[0].concluidaEm,null);
});
