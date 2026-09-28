import {test} from 'node:test';
import assert from 'node:assert/strict';
import {avancarCopia, reconstituirCopia, base64} from '../supabase/functions/_shared/backup-partes.mjs';

test('cópia grande retoma do ponto salvo e reúne todas as partes conferidas',async()=>{
 const origem=Array.from({length:13},(_,id)=>({id,descricao:'Exemplo '+id}));const arquivos=new Map();
 let estado={sistema:'exemplo',operacao:'ensaio',partes:[],registros:0,paginas:0,after:null,terminou:false};
 const ler=async after=>{const de=after||0;return{registros:origem.slice(de,de+2),nextAfter:de+2<origem.length?de+2:null};};
 const guardar=async(caminho,bytes)=>{arquivos.set(caminho,bytes);};
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
 const arquivos=new Map();const estado=await avancarCopia({sistema:'exemplo',operacao:'ensaio',partes:[],registros:0,paginas:0,after:null,terminou:false},async()=>({registros:[{id:1}],nextAfter:null}),async(c,b)=>arquivos.set(c,b));
 await assert.rejects(reconstituirCopia(estado,async()=>null),/ausente/);
 await assert.rejects(reconstituirCopia({...estado,registros:2},async c=>arquivos.get(c)),/contagem/);
});

test('manifesto não pode direcionar a recuperação para caminhos fora da cópia',async()=>{
 let leu=false;
 await assert.rejects(reconstituirCopia({sistema:'/fora',operacao:'ensaio',terminou:true,partes:[{numero:1,caminho:'/fora/partes/ensaio/arquivo.json'}]},async()=>{leu=true;return null;}),/Identificação/);
 assert.equal(leu,false);
});

test('parte respeita o teto de tamanho: a página que passaria dele fica para a próxima parte',async()=>{
 // Como no Bosques: páginas pequenas seguidas de uma que sozinha passa do teto.
 const paginas=[10,10,10,300,10,10,120,120,10].map((t,id)=>[{id,anexo:'x'.repeat(t)}]);
 const origem=paginas.flat(),arquivos=new Map(),lidas=[];
 const ler=async after=>{const p=after||0;lidas.push(p);return{registros:paginas[p],nextAfter:p+1<paginas.length?p+1:null};};
 let estado={sistema:'exemplo',operacao:'ensaio',partes:[],registros:0,paginas:0,after:null,terminou:false};
 while(!estado.terminou)estado=await avancarCopia(estado,ler,async(c,b)=>{arquivos.set(c,b);},4,200);
 assert.deepEqual(estado.partes.map(p=>p.registros),[3,1,3,2]);
 // Cada página que ficou de fora é relida uma vez, no começo da parte seguinte.
 assert.deepEqual(lidas,[0,1,2,3,3,4,4,5,6,7,7,8]);
 assert.equal(estado.paginas,paginas.length);assert.equal(estado.registros,origem.length);
 assert.deepEqual(await reconstituirCopia(estado,async c=>arquivos.get(c)),origem);
});
test('a parte gravada é o mesmo texto de JSON.stringify da parte, com acentos e página vazia',async()=>{
 const paginas=[[{id:'a',nome:'Condomínio São José',valor:1.5,tags:['ç','€'],sub:{x:null}}],[],[{id:'b',texto:'linha\n"aspas"'}]];
 const ler=async after=>{const p=after||0;return{registros:paginas[p],nextAfter:p+1<paginas.length?p+1:null};};
 let gravado;
 const estado=await avancarCopia({sistema:'exemplo',operacao:'ensaio',partes:[],registros:0,paginas:0,after:null,terminou:false},ler,async(c,b)=>{gravado=b;});
 assert.equal(new TextDecoder().decode(gravado),JSON.stringify({sistema:'exemplo',numero:1,registros:paginas.flat()}));
 assert.equal(estado.partes[0].bytes,gravado.length);assert.equal(estado.registros,2);assert.equal(estado.terminou,true);
});
test('base64 em blocos é igual ao base64 do arquivo inteiro',()=>{
 for(const n of [0,1,2,3,24575,24576,24577,3*24576+2,100000]) {
  const bytes=Uint8Array.from({length:n},(_,i)=>(i*7919+n)%256);
  assert.equal(base64(bytes),Buffer.from(bytes).toString('base64'),`tamanho ${n}`);
 }
});
