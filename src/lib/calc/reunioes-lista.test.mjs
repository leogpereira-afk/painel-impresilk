import {test} from 'node:test';
import assert from 'node:assert/strict';
import {momentoReunioes, filaReuniao, rotuloNaLista, organizarReunioes, rascunhoReuniaoDesatualizado, criarConsultaReunioes} from './reunioes-lista.js';

const momento = {dia: '2026-10-26', hora: '10:00'};
const encontro = (extra = {}) => ({id:'r1', titulo:'Reunião de instalação', setor:'producao', tipo:'reuniao', situacao:'agendado', data:'2026-10-26', inicio:'09:00', fim:'10:00', responsavel:'Ana Exemplo', local:'Sala', pauta:'', participantes:[], decisoes:[], ...extra});

test('a fila separa agendados passados e encerrados hoje das próximas e em andamento', () => {
  assert.equal(filaReuniao(encontro({data:'2026-10-25'}), momento), 'encerramento');
  assert.equal(filaReuniao(encontro(), momento), 'encerramento');
  assert.equal(filaReuniao(encontro({fim:'11:00'}), momento), 'proximos');
  assert.equal(rotuloNaLista(encontro({fim:'11:00'}), momento), 'Em andamento');
  assert.equal(filaReuniao(encontro({data:'2026-10-27'}), momento), 'proximos');
  assert.equal(rotuloNaLista(encontro({data:'2026-10-27'}), momento), 'Agendado');
  for (const situacao of ['realizado','cancelado']) assert.equal(filaReuniao(encontro({situacao}), momento), 'historico');
});

test('a virada do dia segue São Paulo, sem deslocar o encontro pela data UTC', () => {
  const local = momentoReunioes(new Date('2026-10-27T01:30:00Z'));
  assert.deepEqual(local, {dia:'2026-10-26', hora:'22:30'});
  assert.equal(filaReuniao(encontro({inicio:'22:00',fim:'23:00'}), local), 'proximos');
});

test('contagens respeitam setor, tipo e busca sem acento em todas as filas', () => {
  const itens = [encontro(), encontro({id:'r2',data:'2026-10-27'}), encontro({id:'r3',situacao:'realizado'}), encontro({id:'r4',setor:'financeiro'}), encontro({id:'r5',tipo:'treinamento'})];
  const lista = organizarReunioes(itens, {setor:'producao',tipo:'reuniao',busca:'instalacao',vista:'proximos'}, momento);
  assert.deepEqual(lista.contagens, {proximos:1,encerramento:1,historico:1,todos:3});
  assert.deepEqual(lista.mostrados.map(r=>r.id), ['r2']);
  assert.equal(organizarReunioes(itens,{busca:'inexistente'},momento).contagens.todos, 0);
});

test('meus convites depende do participante identificado pelo servidor e não de nome ou autoria', () => {
  const itens = [encontro({id:'sem-vinculo',criadoPor:'ana',participantes:[{id:'p1',nome:'Ana Exemplo'}]}), encontro({id:'vinculado',participantes:[{id:'p2',nome:'Outro nome'}],minhaPresenca:{participanteId:'p2'}}), encontro({id:'fora-da-lista',participantes:[],minhaPresenca:{participanteId:'p3'}})];
  assert.deepEqual(organizarReunioes(itens,{minhas:true,vista:'todos'},momento).mostrados.map(r=>r.id), ['vinculado']);
});

test('encaminhamentos e vencidos pertencem à vista atual e excluem encontros cancelados', () => {
  const decisoes = [{id:'d1',concluida:false,prazo:'2026-10-25'},{id:'d2',concluida:false,prazo:'2026-10-26'},{id:'d3',concluida:true,prazo:'2026-10-24'}];
  const itens = [encontro({decisoes}),encontro({id:'r2',situacao:'cancelado',decisoes}),encontro({id:'r3',data:'2026-10-27',decisoes})];
  assert.equal(organizarReunioes(itens,{vista:'encerramento'},momento).encaminhamentos,2);
  assert.equal(organizarReunioes(itens,{vista:'encerramento'},momento).vencidos,1);
  assert.equal(organizarReunioes(itens,{vista:'historico'},momento).encaminhamentos,0);
  assert.equal(organizarReunioes(itens,{vista:'todos'},momento).encaminhamentos,4);
});

test('listas ordenam próximas por data e histórico do mais recente, sem alterar os registros', () => {
  const itens = [encontro({id:'b',data:'2026-10-28'}),encontro({id:'a',data:'2026-10-27'})], antes = structuredClone(itens);
  assert.deepEqual(organizarReunioes(itens,{},momento).mostrados.map(r=>r.id),['a','b']);
  assert.deepEqual(organizarReunioes(itens.map(r=>({...r,situacao:'realizado'})),{vista:'historico'},momento).mostrados.map(r=>r.id),['b','a']);
  assert.deepEqual(itens,antes);
});

test('a atualização avisa sobre versão nova sem alterar o rascunho aberto', () => {
  const editor = {...encontro(),versaoAnterior:'v1',ata:'Rascunho ainda não salvo'}, antes = structuredClone(editor);
  assert.equal(rascunhoReuniaoDesatualizado(editor,[{...encontro(),versao:'v2',ata:'Ata do servidor'}]),true);
  assert.deepEqual(editor,antes);
  assert.equal(rascunhoReuniaoDesatualizado({...editor,versaoAnterior:null},[]),false);
  assert.equal(rascunhoReuniaoDesatualizado(editor,[{...encontro(),versao:'v1'}]),false);
});

const pendente = () => { let resolve,reject; const promise = new Promise((sim,nao)=>{resolve=sim;reject=nao;}); return {promise,resolve,reject}; };
test('consulta lenta anterior não substitui a resposta mais recente', async () => {
  const a=pendente(),b=pendente(),fila=[a,b],consulta=criarConsultaReunioes(()=>fila.shift().promise);
  const primeira=consulta.buscar(),segunda=consulta.buscar();
  b.resolve([{id:'novo'}]); assert.deepEqual(await segunda,[{id:'novo'}]);
  a.resolve([{id:'antigo'}]); assert.equal(await primeira,null);
});

test('gravação ou desmontagem invalida consultas pendentes e seus erros', async () => {
  const a=pendente(),consulta=criarConsultaReunioes(()=>a.promise),leitura=consulta.buscar();
  consulta.invalidar(); a.reject(new Error('falha antiga')); assert.equal(await leitura,null);
  await assert.rejects(criarConsultaReunioes(async()=>{throw new Error('falha atual');}).buscar(),/falha atual/);
});
