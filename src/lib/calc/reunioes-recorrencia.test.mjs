import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as motor from '../../../supabase/functions/_shared/reunioes-recorrencia.mjs';
import {prepararReuniao,carimbarReuniao,pessoasParaReunioes,agendaReunioes} from '../../../supabase/functions/_shared/reunioes.mjs';
const s={sub:'ana',nome:'Ana'},agora='2026-10-26T11:00:00.000Z';
const base=(extra={})=>({id:'serie-a',titulo:'Planejamento',setor:'financeiro',tipo:'reuniao',situacao:'agendado',data:'2026-10-26',inicio:'09:00',fim:'10:00',responsavel:'Ana',participantes:[],decisoes:[],...extra});
const regra=(extra={})=>({frequencia:'semanal',intervalo:1,diasSemana:[1],termino:'quantidade',quantidade:3,...extra});
const serie=()=>motor.criarSerieReunioes(base(),regra(),s,[],agora);
test('semanal usa datas civis, inclui início compatível e não duplica dias',()=>{
 assert.deepEqual(motor.gerarDatasRecorrencia(base(),regra()),['2026-10-26','2026-11-02','2026-11-09']);
 assert.deepEqual(motor.gerarDatasRecorrencia(base(),regra({diasSemana:[3,1,3],quantidade:4})),['2026-10-26','2026-10-28','2026-11-02','2026-11-04']);
});
test('quinzenal respeita dias da semana e atravessa ano',()=>{
 assert.deepEqual(motor.gerarDatasRecorrencia(base({data:'2026-12-28'}),regra({intervalo:2,diasSemana:[1,3],quantidade:4})),['2026-12-28','2026-12-30','2027-01-11','2027-01-13']);
});
test('mensal pula dias inexistentes e diária inclui 29 de fevereiro',()=>{
 assert.deepEqual(motor.gerarDatasRecorrencia(base({data:'2028-01-31'}),regra({frequencia:'mensal'})),['2028-01-31','2028-03-31','2028-05-31']);
 assert.deepEqual(motor.gerarDatasRecorrencia(base({data:'2028-02-28'}),regra({frequencia:'diaria'})),['2028-02-28','2028-02-29','2028-03-01']);
});
test('término por data é inclusivo, limita 104 ocorrências e horizonte de três anos',()=>{
 assert.deepEqual(motor.gerarDatasRecorrencia(base(),regra({termino:'data',ate:'2026-11-02'})),['2026-10-26','2026-11-02']);
 assert.equal(motor.gerarDatasRecorrencia(base(),regra({frequencia:'diaria',quantidade:104})).length,104);
 for(const r of [regra({quantidade:105}),regra({quantidade:0}),regra({quantidade:1.5}),regra({termino:undefined}),regra({termino:'data',ate:'2029-10-27'}),regra({termino:'data',ate:'2026-10-25'}),regra({frequencia:'diaria',termino:'data',ate:'2027-03-01'}),regra({frequencia:'mensal',quantidade:50}),regra({diasSemana:[]}),regra({diasSemana:[7]}),regra({intervalo:3})])assert.throws(()=>motor.gerarDatasRecorrencia(base(),r),e=>e.status===422);
});
test('resumo explica término e fim de mês sem datas inventadas',()=>{
 assert.match(motor.resumoRecorrencia(regra()),/3 encontros/);
 assert.match(motor.resumoRecorrencia(regra({intervalo:2})),/2 semanas/);
 assert.match(motor.resumoRecorrencia(regra({frequencia:'mensal',termino:'data',ate:'2026-12-31'})),/31\/12\/2026/);
 assert.match(motor.resumoRecorrencia(regra({frequencia:'mensal'})),/inexistentes/);
});
test('série tem IDs determinísticos, metadados próprios e atividade independente',()=>{
 const item=base({ata:'Ata anterior',ataSituacao:'finalizada',participantes:[{id:'p1',nome:'Convidado',presenca:'presente'}],decisoes:[{id:'d1',texto:'Decisão'}],anexos:[{id:'a'}],registros:[{id:'r'}],serieId:'forjado',indice:50,total:100});
 const a=motor.criarSerieReunioes(item,regra(),s,[],agora),b=motor.criarSerieReunioes(item,regra(),s,[],agora);
 assert.deepEqual(a.map(x=>x.id),['serie-a','serie-a_r2','serie-a_r3']);assert.deepEqual(a.map(x=>x.id),b.map(x=>x.id));
 assert.deepEqual(a.map(x=>[x.serieId,x.indice,x.total,x.dataOriginal]),[['serie-a',1,3,'2026-10-26'],['serie-a',2,3,'2026-11-02'],['serie-a',3,3,'2026-11-09']]);
 for(const r of a){assert.equal(r.ata,'');assert.equal(r.ataSituacao,'rascunho');assert.deepEqual(r.ataVersoes,[]);assert.deepEqual(r.decisoes,[]);assert.deepEqual(r.anexos,[]);assert.deepEqual(r.registros,[]);assert.equal(r.participantes[0].presenca,'pendente');assert.equal(r.historico.length,1);assert.ok(r.versao);}
 a[0].participantes[0].nome='Alterado';a[0].regra.diasSemana.push(5);assert.equal(a[1].participantes[0].nome,'Convidado');assert.deepEqual(a[1].regra.diasSemana,[1]);
});
test('edição individual não injeta série e preserva metadados autoritativos',()=>{
 const novo=prepararReuniao(base({serieId:'forjado',indice:5,total:9,regra:regra(),dataOriginal:'2020-01-01'}),null,s,agora);
 for(const key of ['serieId','indice','total','regra','dataOriginal'])assert.equal(novo[key],undefined);
 const atual=serie()[1],editado=prepararReuniao({...atual,serieId:'forjado',indice:99,total:99,regra:{},dataOriginal:'2020-01-01',versaoAnterior:atual.versao},atual,s,agora);
 for(const key of ['serieId','indice','total','regra','dataOriginal'])assert.deepEqual(editado[key],atual[key]);
});
test('próximas desloca dias uniformemente e conserva IDs e regra original',()=>{
 const lista=serie(),atual=lista[1],copia=structuredClone(lista);
 const result=motor.prepararAlteracaoSerie(atual,lista,{...atual,data:'2026-11-03',titulo:'Novo título',versaoAnterior:atual.versao},'proximas',s,[],agora);
 assert.deepEqual(result.alteracoes.map(x=>[x.item.id,x.item.data]),[['serie-a_r2','2026-11-03'],['serie-a_r3','2026-11-10']]);
 assert.equal(result.preservadas,0);assert.deepEqual(result.alteracoes[0].item.regra,regra());assert.equal(result.alteracoes[0].item.dataOriginal,'2026-11-02');assert.deepEqual(lista,copia);
});
test('grupo preserva realizadas, passadas e qualquer ocorrência com atividade',()=>{
 const lista=motor.criarSerieReunioes(base(),regra({quantidade:9}),s,[],agora);
 Object.assign(lista[0],{data:'2026-10-25'});Object.assign(lista[1],{situacao:'realizado'});Object.assign(lista[2],{ata:'Registrada'});Object.assign(lista[3],{participantes:[{id:'p',nome:'Pessoa',presenca:'presente'}]});Object.assign(lista[4],{decisoes:[{id:'d',texto:'Fazer'}]});Object.assign(lista[5],{anexos:[{id:'a'}]});Object.assign(lista[6],{registros:[{id:'r'}]});Object.assign(lista[7],{situacao:'cancelado'});
 const atual=lista[8],result=motor.prepararAlteracaoSerie(atual,lista,{...atual,situacao:'cancelado',versaoAnterior:atual.versao},'serie',s,[],agora);
 assert.equal(result.preservadas,8);assert.equal(result.alteracoes.length,1);assert.equal(result.alteracoes[0].item.situacao,'cancelado');
});
test('grupo usa relógio de Brasília, protege início ocorrido e não copia atividade da seleção',()=>{
 const lista=serie(),atual=lista[0];
 let r=motor.prepararAlteracaoSerie(atual,lista,{...atual,titulo:'Ajuste',ata:'Não replicar',decisoes:[{id:'d',texto:'Não replicar'}],versaoAnterior:atual.versao},'serie',s,[],'2026-10-26T12:00:00Z');
 assert.equal(r.preservadas,1);assert.equal(r.alteracoes.length,2);assert.ok(r.alteracoes.every(x=>x.item.ata===''&&x.item.decisoes.length===0));
 assert.throws(()=>motor.prepararAlteracaoSerie(atual,lista,{...atual,data:'2026-01-01',versaoAnterior:atual.versao},'serie',s,[],agora),e=>e.status===422);
});
test('escopo esta permite ata da ocorrência e grupo rejeita frequência nova, situação realizada e autor alheio',()=>{
 const lista=serie(),atual=lista[0];
 const r=motor.prepararAlteracaoSerie(atual,lista,{...atual,ata:'Ata só desta',versaoAnterior:atual.versao},'esta',s,[],agora);
 assert.equal(r.alteracoes.length,1);assert.equal(r.alteracoes[0].item.ata,'Ata só desta');
 for(const [c,escopo,user] of [[{...atual,regra:regra({frequencia:'mensal'})},'serie',s],[{...atual,situacao:'realizado'},'serie',s],[atual,'inválido',s],[atual,'serie',{sub:'outra'}]])assert.throws(()=>motor.prepararAlteracaoSerie(atual,lista,{...c,versaoAnterior:atual.versao},escopo,user,[],agora));
});
test('conflitos usam RH e intervalos semiabertos, ignoram canceladas, mesmo ID e nomes iguais',()=>{
 const a=base({participantes:[{id:'a',rhId:'rh1',nome:'Ana'}]}),b=base({id:'outra',inicio:'09:30',fim:'10:30',participantes:[{id:'b',rhId:'rh1',nome:'Outro nome'}],ata:'PRIVADO'});
 const conflitos=motor.conflitosReunioes([a],[a,b,{...b,id:'adjacente',inicio:'10:00',fim:'11:00'},{...b,id:'cancelada',situacao:'cancelado'},{...b,id:'homonimo',participantes:[{id:'c',rhId:'rh2',nome:'Ana'}]}]);
 assert.equal(conflitos.length,1);assert.equal(conflitos[0].reuniaoId,'outra');assert.deepEqual(conflitos[0].rhIds,['rh1']);assert.ok(!JSON.stringify(conflitos).includes('PRIVADO'));
 assert.equal(motor.conflitosReunioes([{...a,situacao:'cancelado'}],[b]).length,0);
});
test('conflito considera o responsável RH e outros encontros do próprio lote',()=>{
 const a=base({responsavelRhId:'rh1'}),b=base({id:'b',responsavelRhId:'rh1',inicio:'09:30',fim:'10:30'});
 assert.equal(motor.conflitosReunioes([a,b],[]).length,1);
 assert.equal(motor.conflitosReunioes([a],[{...b,id:'e'}]).length,1);
});
const pessoas=[{id:'rh1',nome:'Pessoa oficial',idPessoa:'123456',area:'Financeiro',cargo:'Analista'}];
test('diretório RH inclui ID oficial somente quando informado e não deriva de ficha',()=>{
 const r=pessoasParaReunioes([{id:'abcdefghijk',nome:'Sem ID',statusId:'ok'},{id:'rh1',nome:'Com ID',idPessoa:'123456',statusId:'ok',cpf:'sigilo'}],[{id:'ok',contaComoAtivo:true}]);
 assert.equal(r.find(x=>x.id==='rh1').idPessoa,'123456');assert.equal(Object.hasOwn(r.find(x=>x.id==='abcdefghijk'),'idPessoa'),false);assert.ok(!JSON.stringify(r).includes('sigilo'));
});
test('responsáveis e participantes usam identificação oficial e preservam snapshots históricos',()=>{
 const r=carimbarReuniao(prepararReuniao(base({responsavel:'Forjado',responsavelRhId:'rh1',responsavelIdPessoa:'999999',participantes:[{id:'p',rhId:'rh1',nome:'Forjado',idPessoa:'999999'}],decisoes:[{id:'d',texto:'Fazer',responsavel:'Forjado',responsavelRhId:'rh1',responsavelIdPessoa:'999999'}]}),null,s,agora,pessoas),s,'Criou',agora);
 assert.equal(r.responsavel,'Pessoa oficial');assert.equal(r.responsavelIdPessoa,'123456');assert.equal(r.participantes[0].idPessoa,'123456');assert.equal(r.decisoes[0].responsavel,'Pessoa oficial');assert.equal(r.decisoes[0].responsavelIdPessoa,'123456');
 const e=prepararReuniao({...r,versaoAnterior:r.versao,responsavel:'Forjado de novo'},r,s,agora,[]);assert.equal(e.responsavel,r.responsavel);assert.equal(e.decisoes[0].responsavelIdPessoa,'123456');
 assert.throws(()=>prepararReuniao(base({responsavelRhId:'inexistente'}),null,s,agora,pessoas),/RH/);
});
test('demanda vinculada não pode ser injetada nem trocada pelo editor',()=>{
 const r=carimbarReuniao(prepararReuniao(base({decisoes:[{id:'d',texto:'Fazer',demandaId:'forjado'}]}),null,s,agora),s,'Criou',agora);
 assert.equal(r.decisoes[0].demandaId,undefined);r.decisoes[0].demandaId='demanda-original';
 const e=prepararReuniao({...r,versaoAnterior:r.versao,decisoes:[{id:'d',texto:'Atualizar',demandaId:'outra'}]},r,s,agora);assert.equal(e.decisoes[0].demandaId,'demanda-original');
});
test('ata versiona conteúdo e finalização no servidor, preservando anterior legado e auditoria',()=>{
 const r=carimbarReuniao(prepararReuniao(base({ata:'Ata inicial',ataVersoes:[{texto:'Forjado'}]}),null,s,agora),s,'Criou',agora);
 assert.equal(r.ataVersoes.length,1);assert.equal(r.ataVersoes[0].texto,'Ata inicial');assert.equal(r.ataVersoes[0].por,'ana');
 const e=carimbarReuniao(prepararReuniao({...r,versaoAnterior:r.versao,ata:'Ata corrigida',ataSituacao:'finalizada',ataVersoes:[]},r,s,'2026-10-26T12:00:00Z'),s,'Editou');
 assert.equal(e.ataVersoes.length,2);assert.equal(e.ataVersoes[0].texto,'Ata inicial');assert.equal(e.ataVersoes[1].situacao,'finalizada');
 const igual=prepararReuniao({...e,versaoAnterior:e.versao,titulo:'Outro título'},e,s,agora);assert.equal(igual.ataVersoes.length,2);
 const legado={...r,ata:'Ata legada',ataVersoes:undefined};const migrado=prepararReuniao({...legado,versaoAnterior:r.versao,ata:'Revisão'},legado,s,agora);assert.deepEqual(migrado.ataVersoes.map(x=>x.texto),['Ata legada','Revisão']);
 assert.throws(()=>prepararReuniao(base({ata:'',ataSituacao:'finalizada'}),null,s,agora),/ata/i);
});
test('agenda mostra vínculo de série sem ata, identificação ou lista de pessoas',()=>{
 const r={...serie()[0],ata:'PRIVADO',responsavelRhId:'SIGILO',participantes:[{id:'p',rhId:'RH-PRIVADO'}]},e=agendaReunioes([r],'2026-10')[0];
 assert.equal(e.recorrente,true);assert.equal(e.serieId,r.serieId);assert.ok(!JSON.stringify(e).includes('PRIVADO'));assert.ok(!JSON.stringify(e).includes('SIGILO'));
});
test('troca explícita para responsável textual remove o vínculo RH sem perder legado',()=>{
 const r=carimbarReuniao(prepararReuniao(base({responsavelRhId:'rh1',decisoes:[{id:'d',texto:'Fazer',responsavelRhId:'rh1'}]}),null,s,agora,pessoas),s,'Criou',agora);
 const e=prepararReuniao({...r,versaoAnterior:r.versao,responsavelRhId:null,responsavel:'Responsável externo',decisoes:[{id:'d',texto:'Fazer',responsavelRhId:null,responsavel:'Externo'}]},r,s,agora,[]);
 assert.equal(e.responsavel,'Responsável externo');assert.equal(e.responsavelRhId,undefined);assert.equal(e.responsavelIdPessoa,undefined);assert.equal(e.decisoes[0].responsavel,'Externo');assert.equal(e.decisoes[0].responsavelRhId,undefined);
 const antigo=carimbarReuniao(prepararReuniao(base(),null,s,agora),s,'Criou');assert.equal(prepararReuniao({...antigo,versaoAnterior:antigo.versao},antigo,s,agora).responsavel,'Ana');
});
test('edição não apaga a decisão que já está vinculada a uma demanda',()=>{
 const r=carimbarReuniao(prepararReuniao(base({decisoes:[{id:'d',texto:'Fazer'}]}),null,s,agora),s,'Criou',agora);r.decisoes[0].demandaId='demanda-original';
 assert.throws(()=>prepararReuniao({...r,versaoAnterior:r.versao,decisoes:[]},r,s,agora),/demanda/i);
});
test('cancelamento coletivo conserva programação individual e não altera convites',()=>{
 const lista=serie(),atual=lista[0];lista[1]={...lista[1],titulo:'Título excepcional',inicio:'14:00',fim:'15:00',participantes:[{id:'p',rhId:null,nome:'Externo',area:'',cargo:'',presenca:'pendente'}]};
 const r=motor.prepararAlteracaoSerie(atual,lista,{...atual,situacao:'cancelado',versaoAnterior:atual.versao},'serie',s,[],agora);
 assert.equal(r.alteracoes[1].item.titulo,'Título excepcional');assert.equal(r.alteracoes[1].item.inicio,'14:00');assert.deepEqual(r.alteracoes[1].item.participantes,lista[1].participantes);
});
test('edição coletiva aplica somente campos alterados, preservando exceções individuais',()=>{
 const lista=serie(),atual=lista[0];lista[1]={...lista[1],titulo:'Título excepcional',inicio:'14:00',fim:'15:00'};
 const r=motor.prepararAlteracaoSerie(atual,lista,{...atual,local:'Sala nova',versaoAnterior:atual.versao},'serie',s,[],agora);
 assert.equal(r.alteracoes[1].item.titulo,'Título excepcional');assert.equal(r.alteracoes[1].item.inicio,'14:00');assert.equal(r.alteracoes[1].item.local,'Sala nova');
});
test('prévia de alcance usa a mesma elegibilidade sem exigir formulário válido',()=>{
 const lista=serie(),atual=lista[0];lista[1]={...lista[1],ata:'Com atividade'};
 const r=motor.selecionarAlvosSerie(atual,lista,'serie',agora);
 assert.deepEqual(r.alvos.map(x=>x.id),['serie-a','serie-a_r3']);assert.equal(r.preservadas,1);
 assert.equal(motor.selecionarAlvosSerie(lista[1],lista,'esta',agora).alvos[0].id,'serie-a_r2');
 assert.throws(()=>motor.selecionarAlvosSerie(atual,lista,'invalido',agora));
});
test('alteração pode partir de encontro realizado preservado e alcançar apenas futuros',()=>{
 const lista=serie();lista[0]={...lista[0],situacao:'realizado',ata:'Ata final',ataSituacao:'finalizada'};
 const atual=lista[0],r=motor.prepararAlteracaoSerie(atual,lista,{...atual,local:'Sala nova',versaoAnterior:atual.versao},'serie',s,[],agora);
 assert.equal(r.preservadas,1);assert.equal(r.alteracoes.length,2);assert.ok(r.alteracoes.every(x=>x.item.situacao==='agendado'&&x.item.local==='Sala nova'));
});
test('grupo recusa participantes malformados em vez de ignorar o pedido',()=>{
 const lista=serie(),atual=lista[0];
 assert.throws(()=>motor.prepararAlteracaoSerie(atual,lista,{...atual,participantes:null,versaoAnterior:atual.versao},'serie',s,[],agora),/participantes/);
});
