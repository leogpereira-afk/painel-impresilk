import {test} from 'node:test';
import assert from 'node:assert/strict';
import {avancarCopia, reconstituirCopia} from '../supabase/functions/_shared/backup-partes.mjs';

test('cópia grande retoma do ponto salvo e reúne todas as partes conferidas',async()=>{
 const origem=Array.from({length:13},(_,id)=>({id,descricao:'Exemplo '+id}));const arquivos=new Map();
 let estado={sistema:'exemplo',operacao:'ensaio',partes:[],registros:0,paginas:0,after:null,terminou:false};
 const ler=async after=>{const de=after||0;return{registros:origem.slice(de,de+2),nextAfter:de+2<origem.length?de+2:null};};
 const guardar=async(caminho,corpo)=>{arquivos.set(caminho,new TextEncoder().encode(JSON.stringify(corpo)));};
 estado=await avancarCopia(estado,ler,guardar,2);assert.equal(estado.registros,4);assert.equal(estado.terminou,false);
 while(!estado.terminou)estado=await avancarCopia(estado,ler,guardar,2);
 assert.equal(estado.partes.length,4);assert.equal(estado.registros,13);
 assert.deepEqual(await reconstituirCopia(estado,async caminho=>arquivos.get(caminho)),origem);
 arquivos.set(estado.partes[1].caminho,new TextEncoder().encode('{}'));
 await assert.rejects(reconstituirCopia(estado,async caminho=>arquivos.get(caminho)),/integridade/);
});
test('falha ao guardar não avança a cópia e cursor repetido é recusado',async()=>{
 const estado={sistema:'exemplo',operacao:'ensaio',partes:[],registros:0,paginas:0,after:null,terminou:false};
 await assert.rejects(avancarCopia(estado,async()=>({registros:[{id:1}],nextAfter:null}),async()=>{throw new Error('Gravação recusada');}),/Gravação recusada/);
 assert.equal(estado.registros,0);assert.equal(estado.partes.length,0);
 await assert.rejects(avancarCopia({...estado,after:2},async()=>({registros:[],nextAfter:2}),async()=>{}),/cursor/);
});
test('reconstituição recusa cópia incompleta, parte ausente e contagem diferente',async()=>{
 await assert.rejects(reconstituirCopia({terminou:false,partes:[]},async()=>null),/incompleta/);
 const arquivos=new Map();const estado=await avancarCopia({sistema:'exemplo',operacao:'ensaio',partes:[],registros:0,paginas:0,after:null,terminou:false},async()=>({registros:[{id:1}],nextAfter:null}),async(c,b)=>arquivos.set(c,new TextEncoder().encode(JSON.stringify(b))));
 await assert.rejects(reconstituirCopia(estado,async()=>null),/ausente/);
 await assert.rejects(reconstituirCopia({...estado,registros:2},async c=>arquivos.get(c)),/contagem/);
});

test('manifesto não pode direcionar a recuperação para caminhos fora da cópia',async()=>{
 let leu=false;
 await assert.rejects(reconstituirCopia({sistema:'/fora',operacao:'ensaio',terminou:true,partes:[{numero:1,caminho:'/fora/partes/ensaio/arquivo.json'}]},async()=>{leu=true;return null;}),/Identificação/);
 assert.equal(leu,false);
});
