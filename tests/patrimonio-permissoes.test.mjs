import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {transformSync} from 'esbuild';
import vm from 'node:vm';
import * as acesso from '../supabase/functions/_shared/patrimonio-acesso.mjs';
import {previaReclassificacao} from '../supabase/functions/_shared/patrimonio-migracao.mjs';
import {temHistoricoPessoal} from '../supabase/functions/_shared/documentos.mjs';
import {abasPatrimonio,abaPatrimonioAtual,secaoEstruturaInicial} from '../src/lib/calc/navegacao-patrimonio.js';
import {calcManutencoes, agruparGastos} from '../src/lib/calc/manutencoes.js';
// Testamos Request -> handler real -> Response. Apenas JWT e banco são simulados.
function ambiente(nome,perms,linhas=[],master=false){
 let handler;const escritas=[];
 const sb={from(){let filtros=[],inicio=0,fim=Infinity;
  const resultado=()=>({data:structuredClone(linhas.filter(r=>filtros.every(([k,v,op])=>{const x=k.startsWith('registro->>')?r.registro[k.slice(11)]:r[k];return op==='in'?v.includes(x):x===v;})).slice(inicio,fim+1)),error:null});
  const q={select(){return q;},eq(k,v){filtros.push([k,v]);return q;},in(k,v){filtros.push([k,v,'in']);return q;},order(){return q;},range(a,b){inicio=a;fim=b;return q;},limit(n){fim=n-1;return q;},async maybeSingle(){const r=resultado();return {...r,data:r.data[0]||null};},then(a,b){return Promise.resolve(resultado()).then(a,b);}};return q;
 },async rpc(n,p){escritas.push({n,p});return {data:p.p_registro,error:null};},storage:{from(){throw new Error('Não pode acessar arquivo sem permissão');}}};
 const source=readFileSync(new URL(`../supabase/functions/${nome}/index.ts`,import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'');
 const code=transformSync(source,{loader:'ts',target:'es2022',format:'esm'}).code;
 vm.runInNewContext(code,{...acesso,previaReclassificacao,temHistoricoPessoal,crypto:webcrypto, Deno:{env:{get:()=> 'teste'},serve:f=>handler=f},createClient:()=>sb,verificarJwt:async()=>({sub:'teste',perms,master}),crachaRevogado:async()=>false,validarVinculoPessoa:()=>({}),lerPessoasPatrimonio:async()=>[],Request,Response,console:{error(){}}});
 return {escritas,async chamar(body){const r=await handler(new Request('http://test.invalid',{method:'POST',headers:{authorization:'Bearer teste'},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()};}};
}
const registro=(colecao,id,registro)=>({colecao,id,registro:{id,...registro}});
const BEM=registro('patrimonio','bem-1',{codigo:'EQ-001',origemAtivoId:'maq-1',setorSigla:'PRO',situacao:'uso',valor:12345,nf:'NOTA-PRIVADA',historico:[{valor:9876}],observacao:'DADO-PRIVADO',campoFuturo:{valor:555}});
const EQUIP=registro('ativo','maq-1',{tipo:'maquina',nome:'Máquina exemplo',bemId:'bem-1',valor:12345,nf:'NOTA-PRIVADA',arquivoNome:'nota.pdf',temArquivo:true,observacao:'DADO-PRIVADO',especificacao:{modelo:'Exemplo',notaFiscal:'NOTA-PRIVADA',valorCompra:12345}});
for(const perm of ['patrimonio','manutencoes','seguranca'])test(`HTTP inventário sem valores para ${perm}`,async()=>{
 const a=ambiente('painel-config',[perm],[BEM]);const r=await a.chamar({action:'get',chave:'patrimonio'});
 assert.equal(r.status,200);assert.deepEqual(r.body.valor['bem-1'],{id:'bem-1',codigo:'EQ-001',origemAtivoId:'maq-1',setorSigla:'PRO',situacao:'uso'});
 assert.doesNotMatch(JSON.stringify(r.body),/12345|NOTA-PRIVADA|9876|DADO-PRIVADO|555|campoFuturo/);
});
test('HTTP inventário autorizado preserva valores e campos existentes',async()=>{
 const r=await ambiente('painel-config',['inventario-valores'],[BEM]).chamar({action:'get',chave:'patrimonio'});
 assert.equal(r.status,200);assert.equal(r.body.valor['bem-1'].valor,12345);assert.equal(r.body.valor['bem-1'].nf,'NOTA-PRIVADA');
});
test('HTTP leitura sem nenhuma permissão e escrita forjada são negadas',async()=>{
 for(const action of ['get','merge','removerId']){
 const a=ambiente('painel-config',action==='get'?[]:['patrimonio'],[BEM]);
 const r=await a.chamar({action,chave:'patrimonio',id:'bem-1',patch:{'bem-1':{valor:1}}});assert.equal(r.status,403);assert.equal(a.escritas.length,0);
 }
});
test('HTTP ativos e lixeira não entregam aquisição nem documentos',async()=>{
 const rows=[EQUIP,registro('ativo_lixeira','maq-2',{...EQUIP.registro,id:'maq-2'})];
 for(const action of ['listar','lixeira']){
  const r=await ambiente('painel-ativos',['manutencoes'],rows).chamar({action});assert.equal(r.status,200);assert.equal(r.body.itens.length,1);
  assert.doesNotMatch(JSON.stringify(r.body),/12345|NOTA-PRIVADA|nota.pdf|temArquivo|DADO-PRIVADO/);
 }
});
test('HTTP equipamento preserva manutenção sem autorizar aquisição/anexos',async()=>{
 for(const body of [{action:'salvar',item:{id:'maq-1',tipo:'maquina',nome:'X',valor:0}}, {action:'lerArquivo',id:'maq-1'},{action:'guardarArquivo',id:'maq-1',base64:'AAAA'},{action:'remover',id:'maq-1',bemId:'bem-1'},{action:'salvar',item:{id:'maq-1',tipo:'maquina',nome:'X'},patrimonio:{valor:100}}]){
 const a=ambiente('painel-ativos',['manutencoes'],[EQUIP]);const r=await a.chamar(body);assert.equal(r.status,403,JSON.stringify(r));assert.equal(a.escritas.length,0);
 }
 const a=ambiente('painel-ativos',['manutencoes'],[EQUIP]);const r=await a.chamar({action:'salvar',item:{id:'maq-1',tipo:'maquina',nome:'Atualizada'}});
 assert.equal(r.status,200);assert.equal(a.escritas[0].p.p_registro.valor,12345);assert.equal(r.body.item.nome,'Atualizada');assert.equal(r.body.item.bemId,'bem-1');assert.ok(!Object.hasOwn(r.body.item,'valor'));
});
test('Segurança requer acesso próprio, inclusive para o histórico e alteração direta',async()=>{
 const cam=registro('ativo','cam-1',{tipo:'seguranca',nome:'Câmera exemplo'});
 const hist=registro('manutencoes','hist-1',{ativoId:'cam-1',valor:54321});
 for(const action of ['listar','listarPatrimonio']){
 const r=await ambiente('painel-ativos',['patrimonio','manutencoes'],[cam]).chamar({action});assert.equal(r.status,200);assert.equal(r.body.itens.length,0);
 }
 const a=ambiente('painel-config',['manutencoes'],[cam,hist]);
 assert.deepEqual((await a.chamar({action:'get',chave:'manutencoes'})).body.valor,{});
 for(const body of [{action:'merge',patch:{'hist-1':{ativoId:'maq-1'}}},{action:'merge',patch:{'novo':{ativoId:'cam-1',valor:1}}},{action:'removerId',id:'hist-1'}]){
  assert.equal((await a.chamar({...body,chave:'manutencoes'})).status,403);
 }
 assert.equal(a.escritas.length,0);
 const r=await ambiente('painel-config',['manutencoes','seguranca'],[cam,hist]).chamar({action:'get',chave:'manutencoes'});assert.equal(r.body.valor['hist-1'].valor,54321);
});
test('prévia é só leitura e usa apenas categorias exatas; identidade e origem preservadas',async()=>{
 const linhas=['Câmeras / CFTV','Alarme','Portão / automatizador','Portão','Rede e internet','Combate a incêndio','Câmera parecida'].map((categoria,i)=>registro('ativo',`id-${i}`,{tipo:'predial',categoria,nome:'Mesmo nome',bemId:`bem-${i}`}));
 const a=ambiente('painel-ativos',[],linhas,true);const r=await a.chamar({action:'previaMigracaoPatrimonio'});
 assert.equal(r.status,200);assert.equal(r.body.somenteLeitura,true);assert.equal(r.body.itens.length,5);assert.equal(r.body.itens[4].para,'informatica');assert.equal(r.body.itens[0].bemId,'bem-0');assert.equal(a.escritas.length,0);
 assert.equal((await ambiente('painel-ativos',['patrimonio'],linhas).chamar({action:'previaMigracaoPatrimonio'})).status,403);
 assert.equal(previaReclassificacao([registro('ativo','id',{tipo:'seguranca',categoria:'Alarme'})]).length,0);
});
test('chips seguem a ordem e a primeira permissão permitida, sem promoção de acesso',()=>{
 assert.deepEqual(abasPatrimonio(()=>true),['estrutura','telefonia','seguranca','incendio','armarios','ferramentas','camas','carros','maquinas','outros','setores','inventario']);
 assert.deepEqual(abasPatrimonio(p=>p==='seguranca'),['seguranca']);assert.deepEqual(abasPatrimonio(p=>p==='inventario-valores'),['inventario']);assert.equal(abasPatrimonio(p=>p==='patrimonio')[0],'estrutura');
 assert.equal(abaPatrimonioAtual('computadores'),'estrutura');assert.equal(secaoEstruturaInicial('computadores'),'computadores');
 assert.equal(abaPatrimonioAtual('ramais'),'telefonia');assert.equal(abaPatrimonioAtual('celulares'),'telefonia');
});

test('custos das famílias novas entram nos totais sem misturar com Prédio',()=>{
 const itens=[{id:'pc',tipo:'informatica',nome:'Computador'},{id:'cam',tipo:'seguranca',nome:'Câmera'}];
 const mapa={a:{ativoId:'pc',data:'2026-10-01',valor:150},b:{ativoId:'cam',data:'2026-10-02',valor:75}};
 const v=calcManutencoes(itens,mapa,'2026-10-11');
 const h=agruparGastos(v.lancamentos,itens);
 assert.equal(h.anos[0].porFamilia.informatica,150);assert.equal(h.anos[0].porFamilia.seguranca,75);assert.equal(h.anos[0].porFamilia.predial,0);
});

test('telefonia compartilha ativo sem valores, respeita versão e não muda tipo',async()=>{
 const id='73405710-78db-461b-9d33-37a228fd62c0';
 const telefone=registro('ativo',id,{tipo:'informatica',categoria:'Telefone',nome:'Telefone A',valor:987,nf:'PRIVADO',bemId:'bem-1',atualizadoEm:'2026-10-01T12:00:00Z'});
 let a=ambiente('painel-ativos',['patrimonio'],[telefone]);
 let r=await a.chamar({action:'salvarTelefonia',item:{id,nome:'Telefone B',categoria:'Telefone',especificacao:{marcaModelo:'Exemplo',senha:'NUNCA'}},versao:telefone.registro.atualizadoEm});
 assert.equal(r.status,200);assert.equal(r.body.item.id,id);assert.equal(r.body.item.tipo,'informatica');assert.doesNotMatch(JSON.stringify(r.body),/987|PRIVADO|NUNCA/);assert.equal(a.escritas[0].p.p_registro.valor,987);
 r=await a.chamar({action:'salvarTelefonia',item:{id,nome:'X',categoria:'Central telefônica'},versao:telefone.registro.atualizadoEm});assert.equal(r.status,422);
 r=await a.chamar({action:'salvarTelefonia',item:{id,nome:'X',categoria:'Telefone',bemId:'outro'},versao:telefone.registro.atualizadoEm});assert.equal(r.status,403);
 r=await a.chamar({action:'salvarTelefonia',item:{id,nome:'X',categoria:'Telefone'},versao:'antiga'});assert.equal(r.status,409);
 r=await ambiente('painel-ativos',[],[]).chamar({action:'salvarTelefonia',item:{cadastroId:id,nome:'Central',categoria:'Central telefônica'}});assert.equal(r.status,403);
 a=ambiente('painel-ativos',['patrimonio'],[]);r=await a.chamar({action:'salvarTelefonia',item:{cadastroId:id,nome:'Central',categoria:'Central telefônica'}});assert.equal(r.status,200);assert.equal(r.body.item.tipo,'informatica');
});

test('telefonia não desfaz origem inversa, inclusive legado sem bemId',async()=>{
 for(const bemId of ['bem-1',undefined])for(const pedido of ['','bem-2']){
  const tel=registro('ativo','tel',{tipo:'informatica',categoria:'Telefone',nome:'Telefone',bemId,atualizadoEm:'v1'});
  const a=ambiente('painel-ativos',['patrimonio','inventario-valores'],[tel,registro('patrimonio','bem-1',{origemAtivoId:'tel'})]);
  const r=await a.chamar({action:'salvarTelefonia',item:{id:'tel',nome:'Telefone',categoria:'Telefone',bemId:pedido},versao:'v1'});
  // Legado já vazio não muda vínculo, permanece editável sem remover origem.
  if(!bemId&&!pedido){assert.equal(r.status,200);}else{assert.equal(r.status,409);assert.equal(a.escritas.length,0);}
 }
});

test('manutencao nova exige ficha fisica cadastrada por ID, antes de qualquer escrita',async()=>{
 for(const ativoId of ['',null,'inexistente','Mesmo nome','retirado','documento']){
  const rows=[registro('ativo','real',{tipo:'maquina',nome:'Mesmo nome'}),registro('ativo_lixeira','retirado',{tipo:'maquina'}),registro('ativo','documento',{tipo:'documento'})];
  const a=ambiente('painel-config',['manutencoes'],rows);
  const r=await a.chamar({action:'merge',chave:'manutencoes',patch:{novo:{ativoId,data:'2026-10-11',valor:50}}});
  assert.ok([409,422].includes(r.status),JSON.stringify(r));assert.equal(a.escritas.length,0);
 }
 for(const tipo of ['veiculo','maquina','predial','informatica','seguranca']){
  const a=ambiente('painel-config',['manutencoes','seguranca'],[registro('ativo','real',{tipo})]);
  const r=await a.chamar({action:'merge',chave:'manutencoes',patch:{novo:{ativoId:'real',valor:50}}});assert.equal(r.status,200);assert.equal(a.escritas.length,1);
 }
});
test('lote de manutencoes com referencia invalida nao grava nem o primeiro item valido',async()=>{
 const a=ambiente('painel-config',['manutencoes'],[registro('ativo','real',{tipo:'maquina'})]);
 const r=await a.chamar({action:'merge',chave:'manutencoes',patch:{primeiro:{ativoId:'real'},segundo:{ativoId:'inexistente'}}});assert.equal(r.status,409);assert.equal(a.escritas.length,0);
});
test('historico de item retirado continua corrigivel mas nao recebe novas manutencoes nem novo vinculo inexistente',async()=>{
 const h=registro('manutencoes','hist',{ativoId:'retirado',valor:42});
 let a=ambiente('painel-config',['manutencoes'],[h]);
 assert.equal((await a.chamar({action:'merge',chave:'manutencoes',patch:{hist:{valor:43}}})).status,200);
 a=ambiente('painel-config',['manutencoes'],[h]);assert.equal((await a.chamar({action:'merge',chave:'manutencoes',patch:{hist:{ativoId:'retirado',valor:43}}})).status,200);
 a=ambiente('painel-config',['manutencoes'],[h]);assert.equal((await a.chamar({action:'merge',chave:'manutencoes',patch:{hist:{ativoId:'outro'}}})).status,409);assert.equal(a.escritas.length,0);
});
