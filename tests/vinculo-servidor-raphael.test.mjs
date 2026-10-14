import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import vm from 'node:vm';
import * as acesso from '../supabase/functions/_shared/patrimonio-acesso.mjs';
import {prepararFisico} from '../supabase/functions/_shared/patrimonio-fisico.mjs';
import {validarVinculoPessoa,prepararPessoasControle} from '../supabase/functions/_shared/patrimonio-pessoas.mjs';
import {prepararControle,carimbarPatrimonio} from '../supabase/functions/_shared/patrimonio-controles.mjs';
import {temHistoricoPessoal} from '../supabase/functions/_shared/documentos.mjs';

// Garantia do pedido do Léo: as quatro marcações do almoxarifado bastam para
// tudo do vínculo. Sem master e sem acesso total. Os dois handlers reais
// (painel-ativos e painel-config) falam com o MESMO banco falso, fictício.
const PERMS=['patrimonio','inventario-valores','manutencoes','seguranca'];
const carregar=nome=>transformSync(readFileSync(new URL(`../supabase/functions/${nome}/index.ts`,import.meta.url),'utf8').replace(/^import .*;\s*$/gm,''),{loader:'ts',format:'esm',target:'es2022'}).code;
const json=x=>JSON.stringify(x??null);
function sistema(iniciais){
 const linhas=structuredClone(iniciais),gravacoes=[];
 const valor=(r,k)=>k.startsWith('registro->>')?r.registro?.[k.slice(11)]:r[k];
 const achar=(c,id)=>linhas.find(r=>r.colecao===c&&r.id===id);
 const sb={from(){const c={f:[],i:0,j:Infinity};
  const res=()=>({data:structuredClone(linhas.filter(r=>c.f.every(([k,v,op])=>op==='in'?v.includes(valor(r,k)):valor(r,k)===v)).sort((a,b)=>a.id.localeCompare(b.id)).slice(c.i,c.j+1)),error:null});
  const q={select(){return q},eq(k,v){c.f.push([k,v]);return q},in(k,v){c.f.push([k,v,'in']);return q},order(){return q},range(a,b){c.i=a;c.j=b;return q},limit(n){c.j=n-1;return q},
   async maybeSingle(){const r=res();return {...r,data:r.data[0]??null}},then(a,b){return Promise.resolve(res()).then(a,b)}};return q;
 },async rpc(nome,p){
  gravacoes.push(nome);
  if(nome==='painel_registro_gravar'){
   const r=achar(p.p_colecao,p.p_id);if(json(r?.registro)!==json(p.p_anterior))return {error:{code:'40001',message:'versão'}};
   if(r)r.registro=structuredClone(p.p_registro);else linhas.push({colecao:p.p_colecao,id:p.p_id,registro:structuredClone(p.p_registro)});return {data:structuredClone(p.p_registro),error:null};
  }
  if(nome==='painel_registro_retirar'){const i=linhas.findIndex(r=>r.colecao===p.p_colecao&&r.id===p.p_id);if(i>=0)linhas.splice(i,1);return {error:null};}
  throw new Error('RPC inesperada: '+nome);
 }};
 const sessao={sub:'almoxarifado-ficticio',nome:'Pessoa do almoxarifado',perms:PERMS};
 const handlers={};
 for(const nome of ['painel-ativos','painel-config'])vm.runInNewContext(carregar(nome),{...acesso,prepararFisico,validarVinculoPessoa,prepararPessoasControle,prepararControle,carimbarPatrimonio,temHistoricoPessoal,
  previaReclassificacao:()=>[],lerPessoasPatrimonio:async()=>[],atenderDocumentos:async()=>{throw new Error('fora do escopo')},papelNoMarketing:async()=>null,papelGrava:()=>false,
  Deno:{env:{get:()=> 'teste'},serve:f=>{handlers[nome]=f;}},createClient:()=>sb,verificarJwt:async()=>sessao,crachaRevogado:async()=>false,Request,Response,console:{error(){}}});
 const respostas=[];
 return {linhas,gravacoes,achar,respostas,async chamar(nome,corpo){const r=await handlers[nome](new Request('http://teste.invalid',{method:'POST',headers:{authorization:'Bearer teste'},body:JSON.stringify(corpo)}));const out={status:r.status,body:await r.json()};respostas.push(out);return out;}};
}
const L=(colecao,id,registro)=>({colecao,id,registro:{id,...registro}});
const FICHAS=[
 L('ativo','car-1',{tipo:'veiculo',nome:'Carro fictício',atualizadoEm:'v1'}),
 L('ativo','maq-1',{tipo:'maquina',nome:'Máquina fictícia',atualizadoEm:'v1'}),
 L('ativo','hid-1',{tipo:'predial',categoria:'Hidráulica',nome:'Bomba fictícia',especificacao:{local:'Pátio',quantidade:'1'},atualizadoEm:'v1'}),
 L('ativo','ramal-1',{tipo:'informatica',categoria:'Telefone',nome:'Ramal fictício',atualizadoEm:'v1'}),
 L('ativo','cam-1',{tipo:'seguranca',categoria:'Câmera',nome:'Câmera fictícia',atualizadoEm:'v1'}),
 L('ativo','ext-1',{tipo:'predial',categoria:'Extintor',nome:'Extintor fictício',atualizadoEm:'v1'}),
];
const BENS=FICHAS.map((_,i)=>L('patrimonio',`bem-${i}`,{codigo:`GER-00${i}`,nomeGenerico:`Bem ${i}`,situacao:'uso',atualizadoEm:'b1'}));

test('as quatro marcações ligam e desfazem as seis famílias, leem o histórico e nunca recebem 403',async()=>{
 const s=sistema([...FICHAS,...BENS]);
 const lista=await s.chamar('painel-ativos',{action:'listarPatrimonio'});
 assert.equal(lista.status,200);assert.deepEqual(lista.body.vinculosOcultos,[]);assert.equal(lista.body.itens.length,6);
 for(const [i,ficha] of FICHAS.entries()){
  const bemId=`bem-${i}`;
  const ligar=await s.chamar('painel-ativos',{action:'vincularFicha',bemId,ativoId:ficha.id,versaoFicha:'v1',versaoBem:'b1',origem:'bem'});
  assert.equal(ligar.status,200,`${ficha.registro.nome}: ${JSON.stringify(ligar.body)}`);assert.equal(s.achar('ativo',ficha.id).registro.bemId,bemId);
  // Ligado, o bem não sai do inventário.
  const excluir=await s.chamar('painel-config',{action:'removerId',chave:'patrimonio',id:bemId});
  assert.equal(excluir.status,409);assert.match(excluir.body.erro,/^Este bem está ligado a /);assert.ok(s.achar('patrimonio',bemId));
  const versaoFicha=s.achar('ativo',ficha.id).registro.atualizadoEm;
  const desfazer=await s.chamar('painel-ativos',{action:'desvincularFicha',bemId,ativoId:ficha.id,versaoFicha,versaoBem:'b1',origem:'bem'});
  assert.equal(desfazer.status,200,`${ficha.registro.nome}: ${JSON.stringify(desfazer.body)}`);assert.equal(s.achar('ativo',ficha.id).registro.bemId,'');
  const historico=await s.chamar('painel-ativos',{action:'historicoVinculo',bemId});
  assert.equal(historico.status,200);assert.deepEqual(historico.body.eventos.map(e=>e.acao),['desvinculado','vinculado']);
  assert.equal(historico.body.eventos[0].nome,ficha.registro.nome);assert.equal(historico.body.eventos[0].porNome,'Pessoa do almoxarifado');
 }
 // Livre, o bem pode ser excluído.
 const livre=await s.chamar('painel-config',{action:'removerId',chave:'patrimonio',id:'bem-0'});
 assert.equal(livre.status,200,JSON.stringify(livre.body));assert.equal(s.achar('patrimonio','bem-0'),undefined);
 assert.equal(s.respostas.filter(r=>r.status===403).length,0,'nenhuma resposta 403');
});
