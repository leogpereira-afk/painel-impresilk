import test from 'node:test';
import assert from 'node:assert/strict';
import {referenciaCadastroEmpresa,encontrarCadastroEmpresa,empresaParaCadastro,vincularCadastroEmpresa,salvarCadastroEmpresa} from '../src/lib/licitacoes-empresa-cadastro.mjs';
import {idCadastroLicitacoes} from '../supabase/functions/_shared/licitacoes-cadastros.mjs';
const titularId='73405710-78db-461b-9d33-37a228fd62c0',empresaId='53405710-78db-461b-9d33-37a228fd62c0';
const empresa=()=>({id:empresaId,nome:'Comprador externo fictício',tipo:'empresa',municipios:['Montes Claros','Salinas'],site:'https://comprador.example/fornecedores',situacao:'ativo',prioridade:'alta',cadastroExigido:'nao',cadastroIds:['outro-vinculo'],contato:'Contato existente',observacao:'Preservar observação',atualizadoEm:'v1'});
const novo=()=>({cadastroId:'63405710-78db-461b-9d33-37a228fd62c0',nome:'Cadastro fictício',titularId,url:'https://comprador.example/fornecedores',situacao:'planejado'});
const cadastro=async patch=>({id:await idCadastroLicitacoes(titularId,novo().url),...novo(),...patch});
function servicos({falhaCadastro,falhaVinculo,falhaLeituraCadastro,aposCadastro}={}){
 const state={empresa:empresa(),cadastros:[],criacoes:0,edicoes:0,vinculos:0,patches:[],lidos:0};
 const s={
  async salvarCadastro(item,versao){if(item.id)state.edicoes++;else state.criacoes++;if(falhaCadastro)throw falhaCadastro;const salvo={...item,id:item.id||await idCadastroLicitacoes(item.titularId,item.url),atualizadoEm:'c1'};delete salvo.cadastroId;state.cadastros=[salvo];if(aposCadastro)aposCadastro(state);return {ok:true,item:structuredClone(salvo)};},
  async listarCadastros(){if(falhaLeituraCadastro)throw falhaLeituraCadastro;return {ok:true,itens:structuredClone(state.cadastros)};},
  async listarEntidades(){state.lidos++;return {ok:true,itens:state.empresa?[structuredClone(state.empresa)]:[]};},
  async salvarEntidade(item,versao){state.vinculos++;state.patches.push({item:structuredClone(item),versao});if(falhaVinculo)throw falhaVinculo;if(versao!==state.empresa.atualizadoEm)throw Object.assign(new Error('Conflito'),{status:409});state.empresa={...state.empresa,...item,atualizadoEm:'v2'};return {ok:true,item:structuredClone(state.empresa)};},
 };return {state,s};
}
const salvar=(s,patch={})=>salvarCadastroEmpresa({item:novo(),empresaId,...s,...patch});

test('referência separa comprador externo de nossa pessoa jurídica e não marca cadastro ativo',()=>{
 const e=empresa(),r=referenciaCadastroEmpresa(e,[{id:titularId,nome:'Nossa empresa fictícia'}]);assert.equal(r.nome,e.nome);assert.equal(r.categoria,'empresa');assert.equal(r.titularId,titularId);assert.notEqual(r.titularId,e.id);assert.equal(r.url,e.site);assert.equal(r.abrangencia,'Montes Claros, Salinas');assert.equal('situacao' in r,false);assert.equal('validade' in r,false);assert.equal(referenciaCadastroEmpresa(e,[]).titularId,'');assert.equal(referenciaCadastroEmpresa(e,[{id:'a'},{id:'b'}]).titularId,'');assert.equal(referenciaCadastroEmpresa({...e,site:''},[]).url,'');
});
test('reconhecimento usa identidade do modelo, nunca nome, e inclui cadastros arquivados',async()=>{
 const c=await cadastro({situacao:'arquivado',nome:'Nome antigo'}),itens=[c];assert.equal(encontrarCadastroEmpresa(itens,{...novo(),url:'http://COMPRADOR.example/fornecedores/?passo=2#cadastro'}),c);assert.equal(encontrarCadastroEmpresa(itens,{...novo(),titularId:'outra'}),null);assert.equal(encontrarCadastroEmpresa(itens,{...novo(),url:'https://outro.example/fornecedores'}),null);assert.equal(encontrarCadastroEmpresa(itens,{...novo(),url:'javascript:alert(1)'}),null);assert.equal(encontrarCadastroEmpresa(itens,{...novo(),url:'https://usuario:senha@comprador.example/fornecedores'}),null);
});
test('cadastro salvo é vinculado via patch mínimo, preservando campos, requisito não e vínculos atuais',async()=>{
 const {s,state}=servicos(),antes=structuredClone(state.empresa),r=await salvar(s);assert.equal(r.etapa,'concluido');assert.equal(state.criacoes,1);assert.equal(state.vinculos,1);assert.deepEqual(Object.keys(state.patches[0].item).sort(),['cadastroIds','id']);assert.equal(state.patches[0].versao,'v1');assert.deepEqual(state.empresa.cadastroIds,['outro-vinculo',r.cadastro.id]);for(const k of ['cadastroExigido','contato','observacao','nome','municipios'])assert.deepEqual(state.empresa[k],antes[k]);
});
test('segunda gravação falha: mantém cadastro confirmado e retry repete só vínculo',async()=>{
 const {s,state}=servicos({falhaVinculo:Object.assign(new Error('Versão mudou'),{status:409})}),r=await salvar(s);assert.equal(r.etapa,'vinculo-pendente');assert.ok(r.cadastro.id);assert.equal(state.cadastros.length,1);assert.equal(state.criacoes,1);assert.deepEqual(state.empresa.cadastroIds,['outro-vinculo']);const novaEmpresa={...state.empresa,cadastroIds:['vinculo-de-outra-sessao'],atualizadoEm:'v4'};state.empresa=novaEmpresa;
 const retry=await vincularCadastroEmpresa({empresaId,cadastroId:r.cadastro.id,listarEntidades:s.listarEntidades,salvarEntidade:async(patch,versao)=>{assert.equal(versao,'v4');assert.deepEqual(patch.cadastroIds,['vinculo-de-outra-sessao',r.cadastro.id]);return {ok:true,item:{...novaEmpresa,...patch}};}});assert.equal(retry.repetido,false);assert.equal(state.criacoes,1);
});
test('resposta de vínculo perdida é recuperada sem nova gravação ou duplicação',async()=>{
 const {s,state}=servicos(),r=await salvar(s),antes=structuredClone(state.empresa);const retry=await vincularCadastroEmpresa({empresaId,cadastroId:r.cadastro.id,...s});assert.equal(retry.repetido,true);assert.equal(state.criacoes,1);assert.equal(state.vinculos,1);assert.deepEqual(state.empresa,antes);
});
test('duplicado conhecido exige escolha explícita sem salvar nem vincular automaticamente',async()=>{
 const {s,state}=servicos(),existente=await cadastro({nome:'Preservar nome',observacao:'Preservar campos'}),r=await salvar(s,{cadastrosConhecidos:[existente]});assert.equal(r.etapa,'existente');assert.deepEqual(r.cadastro,existente);assert.equal(state.criacoes,0);assert.equal(state.vinculos,0);
});
test('primeira resposta perdida recupera cadastro por portal e titular sem sobrescrever seus dados',async()=>{
 const {s,state}=servicos({falhaCadastro:new Error('Conexão interrompida')}),existente=await cadastro({nome:'Texto já salvo',protocolo:'PROTOCOLO-FICTICIO',situacao:'arquivado'});state.cadastros.push(existente);const r=await salvar(s);assert.equal(r.etapa,'existente');assert.deepEqual(r.cadastro,existente);assert.equal(state.vinculos,0);assert.equal(state.criacoes,1);assert.equal(state.cadastros.length,1);
});
test('falha na recuperação mantém erro e nunca cria cadastro ou vínculo extra',async()=>{
 const {s,state}=servicos({falhaCadastro:new Error('Sem confirmação'),falhaLeituraCadastro:new Error('Sem leitura')});await assert.rejects(salvar(s),/preenchimento foi preservado/);assert.equal(state.criacoes,1);assert.equal(state.vinculos,0);assert.equal(state.cadastros.length,0);
});
test('empresa arquivada, removida ou convertida em órgão bloqueia vínculo sem apagar cadastro',async()=>{
 for(const patch of [{situacao:'arquivado'},{tipo:'orgao'},null]){const {s,state}=servicos({aposCadastro:state=>state.empresa=patch?{...state.empresa,...patch}:null}),r=await salvar(s);assert.equal(r.etapa,'vinculo-pendente');assert.equal(state.cadastros.length,1);assert.equal(state.vinculos,0);assert.ok(r.cadastro.id);}
 assert.throws(()=>empresaParaCadastro([],empresaId),/não está disponível/);
});
test('edição envia a versão e não recupera conflito como criação',async()=>{
 const {s,state}=servicos({falhaCadastro:Object.assign(new Error('Versão mudou'),{status:409})}),item=await cadastro();let listou=false;await assert.rejects(salvar(s,{item,versao:'c0',listarCadastros:async()=>{listou=true;return {ok:true,itens:[item]};}}),e=>e.status===409);assert.equal(state.edicoes,1);assert.equal(state.criacoes,0);assert.equal(listou,false);assert.equal(state.vinculos,0);
});
test('sessão ou janela substituída não inicia segunda gravação',async()=>{
 let ativa=true;const {s,state}=servicos({aposCadastro:()=>ativa=false}),r=await salvar(s,{podeContinuar:()=>ativa});assert.equal(r.etapa,'vinculo-pendente');assert.equal(state.criacoes,1);assert.equal(state.vinculos,0);assert.equal(state.cadastros.length,1);
 for(const status of [401,403]){const a=servicos({falhaCadastro:Object.assign(new Error('Sem acesso'),{status})});let listou=false;await assert.rejects(salvar(a.s,{listarCadastros:async()=>{listou=true;}}),e=>e.status===status);assert.equal(listou,false);assert.equal(a.state.vinculos,0);}
});
test('retorno incompleto não anuncia vínculo confirmado',async()=>{
 const {s,state}=servicos(),r=await salvar(s,{salvarEntidade:async()=>({ok:true,item:state.empresa})});assert.equal(r.etapa,'vinculo-pendente');assert.match(r.erro,/não foi confirmado/);assert.equal(state.criacoes,1);
});
