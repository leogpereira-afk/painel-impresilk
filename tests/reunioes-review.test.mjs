import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {build} from 'esbuild';

const {outputFiles}=await build({stdin:{contents:`import {respostaReunioes} from './src/review/reunioes.mjs'; import {respostaProcessos} from './src/review/processos.mjs'; globalThis.api={respostaReunioes,respostaProcessos};`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser',target:'es2022'});
function abrir(storage=new Map(),search=''){
 const contexto=vm.createContext({window:{location:{search}},sessionStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},URL,URLSearchParams,Response,TextEncoder,crypto:webcrypto,structuredClone,console,Blob,atob});
 vm.runInContext(outputFiles[0].text,contexto);
 const chamar=async(b,tipo='respostaReunioes')=>{const r=await contexto.api[tipo](b);return {status:r.status,...await r.json()};};
 return {chamar,storage};
}
const unico={id:'teste-2099',titulo:'Reunião fictícia de teste',data:'2099-01-05',inicio:'09:00',fim:'09:30',tipo:'reuniao',setor:'producao',situacao:'agendado',responsavel:'Bruno Exemplo',responsavelRhId:'rh-bruno',pauta:'Pauta fictícia',ata:'',participantes:[{id:'participante-teste',rhId:'rh-bruno',presenca:'pendente'}],decisoes:[],versaoAnterior:null};
const regra={frequencia:'semanal',intervalo:1,diasSemana:[1],termino:'quantidade',quantidade:3};
test('prévia cria série e calendário uma vez, preserva ata e demanda após recarregar',async()=>{
 const a=abrir(),b={action:'salvarSerie',item:unico,recorrencia:regra};
 const criada=await a.chamar(b);assert.equal(criada.status,200);assert.equal(criada.itens.length,3);
 const repetida=await a.chamar(b);assert.deepEqual(repetida.itens,criada.itens);
 const agenda=await a.chamar({action:'agenda',mes:'2099-01'});assert.equal(agenda.eventos.length,3);assert.equal(new Set(agenda.eventos.map(e=>e.id)).size,3);
 const primeiro=criada.item;
 const editada=await a.chamar({action:'salvar',item:{...primeiro,versaoAnterior:primeiro.versao,ata:'Ata fictícia somente deste encontro.',ataSituacao:'finalizada',decisoes:[{id:'decisao-teste',texto:'Conferir o roteiro fictício.',responsavelRhId:'rh-bruno',prazo:'2099-01-15',concluida:false}]}});
 assert.equal(editada.status,200);assert.equal(editada.item.ataVersoes.length,1);
 const convertida=await a.chamar({action:'demanda',id:primeiro.id,versao:editada.item.versao,decisaoId:'decisao-teste'});assert.equal(convertida.status,200);assert.ok(convertida.demandaId.startsWith('reuniao_'));
 const repeticao=await a.chamar({action:'demanda',id:primeiro.id,versao:editada.item.versao,decisaoId:'decisao-teste'});assert.equal(repeticao.demandaId,convertida.demandaId);
 const reaberta=abrir(a.storage),lista=await reaberta.chamar({action:'listar'}),serie=lista.itens.filter(x=>x.serieId===primeiro.id);
 assert.equal(serie.length,3);assert.equal(serie[0].ata,editada.item.ata);assert.ok(serie.slice(1).every(x=>!x.ata&&!x.decisoes.length));
 assert.equal(serie[0].participantes[0].idPessoa,'900002');
 const demandas=await reaberta.chamar({action:'listar'},'respostaProcessos');assert.equal(demandas.itens.filter(x=>x.id===convertida.demandaId).length,1);
 assert.equal(demandas.itens.find(x=>x.id===convertida.demandaId).responsavelRhId,'rh-bruno');
});
test('cancelamento coletivo preserva ata e CAS obsoleto não grava parte da série',async()=>{
 const a=abrir(),criada=await a.chamar({action:'salvarSerie',item:unico,recorrencia:regra});
 const segundo=criada.itens[1];await a.chamar({action:'salvar',item:{...segundo,versaoAnterior:segundo.versao,ata:'Registro fictício protegido.'}});
 const versoes=Object.fromEntries(criada.itens.map(x=>[x.id,x.versao]));versoes[criada.itens[2].id]='obsoleta';
 const antes=JSON.stringify((await a.chamar({action:'listar'})).itens);
 const tentativa=await a.chamar({action:'salvarSerie',item:{...criada.item,versaoAnterior:criada.item.versao,situacao:'cancelado'},escopo:'serie',versoesAnteriores:versoes});assert.equal(tentativa.status,409);
 assert.equal(JSON.stringify((await a.chamar({action:'listar'})).itens),antes);
 versoes[criada.itens[2].id]=criada.itens[2].versao;
 const cancelada=await a.chamar({action:'salvarSerie',item:{...criada.item,versaoAnterior:criada.item.versao,situacao:'cancelado'},escopo:'serie',versoesAnteriores:versoes});assert.equal(cancelada.status,200);assert.equal(cancelada.preservadas,1);assert.equal(cancelada.itens.length,2);
 const agenda=await a.chamar({action:'agenda',mes:'2099-01'});assert.equal(agenda.eventos.length,1);assert.equal(agenda.eventos[0].reuniaoId,segundo.id);
});
test('prévia convidada não altera reunião de outra pessoa nem cria demanda nela',async()=>{
 const a=abrir(new Map(),'?perfil=reuniao-convidado'),lista=await a.chamar({action:'listar'}),r=lista.itens.find(x=>x.id==='encontro-encerramento-demo');
 assert.equal(r.podeEditar,false);
 assert.equal((await a.chamar({action:'salvar',item:{...r,versaoAnterior:r.versao,titulo:'Indevido'}})).status,403);
 assert.equal((await a.chamar({action:'demanda',id:r.id,versao:r.versao,decisaoId:r.decisoes[0].id})).status,403);
});
test('anexo fictício expirado após reload fica identificado e sem promessa de download',async()=>{
 const a=abrir(),lista=await a.chamar({action:'listar'}),r=lista.itens[0];
 const salva=await a.chamar({action:'anexar',id:r.id,versao:r.versao,nome:'exemplo.pdf',mime:'application/pdf',base64:Buffer.from('%PDF-1.4 ficticio').toString('base64')});assert.equal(salva.status,200);
 const anexo=salva.item.anexos[0];assert.equal((await a.chamar({action:'arquivo',id:r.id,arquivoId:anexo.id})).status,200);
 const reaberta=abrir(a.storage),novalista=await reaberta.chamar({action:'listar'});
 assert.equal(novalista.itens.find(x=>x.id===r.id).anexos[0].expiradoNaPrevia,true);
 const download=await reaberta.chamar({action:'arquivo',id:r.id,arquivoId:anexo.id});assert.equal(download.status,410);assert.match(download.erro,/expirou/);
});
