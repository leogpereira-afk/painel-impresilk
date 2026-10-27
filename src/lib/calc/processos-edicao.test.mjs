import {test} from 'node:test';
import assert from 'node:assert/strict';
import {editarRegistro,prepararProcesso,projetarConvidado,validarAcessoConvite,validarConvite,statusConvite,renovarConvite} from '../../../supabase/functions/_shared/processos.mjs';

const gestor={sub:'gestor-ficticio',nome:'Gestor fictício',master:true};
const colaborador={sub:'convite:c1',nome:'Consultor fictício',externo:true,nivel:'colaborador'};
const registro={id:'a1',tipo:'acao',titulo:'Levantamento fictício',dataAcao:'2026-10-01',texto:'Texto original',resultado:'',proximoPasso:'',etapaId:'e1',por:'outro-autor',nome:'Autora original',em:'2026-10-01T10:00:00Z',compartilhado:true};
const ficha=()=>({id:'f1',tipo:'consultoria',titulo:'Exemplo',objetivo:'Conferir',empresa:'Consultoria fictícia',setor:'empresa',situacao:'analise',prioridade:'normal',prazo:'',analise:'',solucao:'',especialidade:'',responsavelRhId:'rh1',envolvidos:[{rhId:'rh1',nome:'Pessoa fictícia'}],etapas:[{id:'e1',titulo:'Primeira etapa',responsavelRhId:'rh1',situacao:'pendente',prazo:'',dependeDe:[],descricao:'',nota:''}],registros:[{...registro}],convites:[],consultores:[],historico:[],anexos:[{id:'arquivo',compartilhado:true,nome:'Exemplo.pdf'}],versao:'v1',criadoPor:gestor.sub,criadoEm:'2026-10-01T10:00:00Z'});
const dados=(extra={})=>({registroId:'a1',tipo:'acao',titulo:'Levantamento corrigido',dataAcao:'2026-10-02',texto:'Texto corrigido',resultado:'Resultado revisto',proximoPasso:'Validar',etapaId:'e1',...extra});

test('desvincular ação da etapa preserva atividade histórica e impede apagar a etapa',()=>{
 const r=ficha(),editado=editarRegistro(r,dados({etapaId:''}),colaborador,'2026-10-02T10:00:00Z');
 assert.equal(editado.registros[0].revisoes[0].antes.etapaId,'e1');assert.equal(editado.etapas[0].atividadeRegistrada,true);
 assert.throws(()=>prepararProcesso({...editado,versaoAnterior:'v1',etapas:[]},editado,gestor,[]),e=>e.status===422);
 assert.equal(r.etapas[0].atividadeRegistrada,undefined);assert.equal(editado.anexos,r.anexos);assert.equal(editado.registros[0].por,'outro-autor');
});

test('revisões preservam registro legado e nunca aceitam histórico ou identidade enviados pelo cliente',()=>{
 const r=ficha();r.registros[0]={id:'a1',texto:'Andamento antigo',por:'outro-autor',nome:'Autora original',em:'2025-10-01T10:00:00Z',compartilhado:true};
 const primeiro=editarRegistro(r,dados({tipo:'atualizacao',revisoes:[],por:'forjado',nome:'Forjado'}),colaborador,'2026-10-02T10:00:00Z');
 const segundo=editarRegistro(primeiro,dados({tipo:'decisao',texto:'Texto final',revisoes:[]}),gestor,'2026-10-03T10:00:00Z');
 assert.equal(segundo.registros[0].revisoes.length,2);assert.deepEqual(segundo.registros[0].revisoes[0].antes,{texto:'Andamento antigo'});assert.equal(segundo.registros[0].nome,'Autora original');assert.equal(segundo.registros[0].em,'2025-10-01T10:00:00Z');assert.equal(segundo.registros[0].editadoPorNome,'Gestor fictício');
 const externo=projetarConvidado(segundo,{id:'c1',nome:'Consultor fictício',nivel:'colaborador'}).registros[0];
 assert.equal(externo.revisoes[1].nome,'Gestor fictício');assert.equal(externo.revisoes[1].por,undefined);assert.equal(externo.por,undefined);
});

test('limites de revisão e tamanho rejeitam gravação sem perder o conteúdo existente',()=>{
 const r=ficha();r.registros[0].revisoes=Array.from({length:100},()=>({antes:{texto:'Antes'},depois:{texto:'Depois'}}));const original=JSON.stringify(r);
 assert.throws(()=>editarRegistro(r,dados(),colaborador),e=>e.status===422);assert.equal(JSON.stringify(r),original);
 const grande=ficha();grande.anexos[0].descricao='x'.repeat(600000);assert.throws(()=>editarRegistro(grande,dados(),colaborador),e=>e.status===422);assert.equal(grande.registros[0].texto,'Texto original');
});

test('permanente continua ativo no futuro e datas ausentes, flags falsas ou inválidas não o concedem',()=>{
 const permanente={id:'c1',nivel:'colaborador',semValidade:true,expiraEm:null};assert.equal(validarConvite(permanente,'2050-01-01T00:00:00Z'),true);
 for(const c of [{id:'c1',expiraEm:null},{id:'c1'},{...permanente,semValidade:false},{...permanente,semValidade:'true'},{...permanente,expiraEm:''},{...permanente,expiraEm:'2051-01-01'}]){assert.equal(validarConvite(c,'2050-01-01T00:00:00Z'),false);assert.equal(statusConvite({convites:[c]},c,'2050-01-01T00:00:00Z'),'invalido');}
 const r={convites:[{...permanente,id:'pai',nivel:'administrador'},{...permanente,paiId:'pai'}]};assert.equal(validarAcessoConvite(r,r.convites[1],'2050-01-01T00:00:00Z'),true);r.convites[0].revogadoEm='2026-10-03';assert.equal(validarAcessoConvite(r,r.convites[1],'2050-01-01T00:00:00Z'),false);
});

test('converter convite legado para permanente só altera a validade escolhida',()=>{
 const r=ficha();r.convites=[{id:'legado',nivel:'colaborador',nome:'Pessoa fictícia',expiraEm:'2026-10-20T00:00:00Z',hash:'a'.repeat(64)}];
 const x=renovarConvite(r,{conviteId:'legado',semValidade:true,nivel:'administrador',consultorId:'forjado'},gestor,'2026-10-27T10:00:00Z');
 assert.equal(x.convites[0].semValidade,true);assert.equal(x.convites[0].expiraEm,null);assert.equal(x.convites[0].nivel,'colaborador');assert.equal(x.convites[0].hash,'a'.repeat(64));assert.equal(x.convites[0].consultorId,undefined);assert.equal(r.convites[0].expiraEm,'2026-10-20T00:00:00Z');
});
