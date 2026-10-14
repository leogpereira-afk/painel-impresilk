import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import vm from 'node:vm';
import * as acesso from '../supabase/functions/_shared/patrimonio-acesso.mjs';
import {validarVinculoPessoa,prepararPessoasControle} from '../supabase/functions/_shared/patrimonio-pessoas.mjs';
import {prepararControle,carimbarPatrimonio} from '../supabase/functions/_shared/patrimonio-controles.mjs';

// Handler real do painel-config (chave `patrimonio`); crachá e banco simulados
// com dados fictícios. VINCULO_CONFIG_SOURCE serve ao ciclo vermelho-verde.
const fonte=readFileSync(process.env.VINCULO_CONFIG_SOURCE||new URL('../supabase/functions/painel-config/index.ts',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'');
const codigo=transformSync(fonte,{loader:'ts',format:'esm',target:'es2022'}).code;
const json=x=>JSON.stringify(x??null);
function ambiente(perms,iniciais=[]){
 const linhas=structuredClone(iniciais),gravacoes=[],ganchos=[];let handler;
 const valor=(r,k)=>k.startsWith('registro->>')?r.registro?.[k.slice(11)]:r[k];
 const achar=(c,id)=>linhas.find(r=>r.colecao===c&&r.id===id);
 const sb={from(tabela){
  assert.equal(tabela,'painel_registros');const filtros=[];let inicio=0,fim=Infinity;
  const res=()=>({data:structuredClone(linhas.filter(r=>filtros.every(([k,v])=>valor(r,k)===v)).slice(inicio,fim+1)),error:null});
  const q={select(){return q},eq(k,v){filtros.push([k,v]);return q},order(){return q},range(a,b){inicio=a;fim=b;return q},limit(n){fim=n-1;return q},
   async maybeSingle(){const r=res();return {...r,data:r.data[0]??null}},then(a,b){return Promise.resolve(res()).then(a,b)}};
  return q;
 },async rpc(nome,p){
  gravacoes.push({nome,p:structuredClone(p)});
  for(const g of ganchos){const erro=await g(nome,p);if(erro)return {data:null,error:erro};}
  if(nome==='patrimonio_proxima_etiqueta')return {data:`${p.p_sigla}-900`,error:null};
  if(nome==='painel_registro_gravar'){
   const r=achar(p.p_colecao,p.p_id);if(json(r?.registro)!==json(p.p_anterior))return {error:{code:'40001',message:'versão'}};
   if(r)r.registro=structuredClone(p.p_registro);else linhas.push({colecao:p.p_colecao,id:p.p_id,registro:structuredClone(p.p_registro)});return {data:p.p_registro,error:null};
  }
  if(nome==='painel_registro_retirar'){
   const i=linhas.findIndex(r=>r.colecao===p.p_colecao&&r.id===p.p_id);
   if(i>=0){const [r]=linhas.splice(i,1);linhas.push({colecao:'registro_lixeira',id:`${p.p_colecao}:${p.p_id}`,registro:{colecao:p.p_colecao,id:p.p_id,registro:r.registro}});}
   return {data:null,error:null};
  }
  if(nome==='painel_registro_recuperar'){
   const i=linhas.findIndex(r=>r.colecao==='registro_lixeira'&&r.id===p.p_lixeira_id);if(i<0)return {error:{message:'não está na lixeira'}};
   const [r]=linhas.splice(i,1);linhas.push({colecao:r.registro.colecao,id:r.registro.id,registro:r.registro.registro});return {data:null,error:null};
  }
  throw new Error('RPC inesperada: '+nome);
 }};
 const sessao={sub:'login-ficticio',nome:'Pessoa Fictícia',perms};
 vm.runInNewContext(codigo,{...acesso,previaReclassificacao:()=>[],prepararControle,carimbarPatrimonio,validarVinculoPessoa,prepararPessoasControle,lerPessoasPatrimonio:async()=>[],
  Deno:{env:{get:k=>k==='PAINEL_JWT_SECRET'?'teste':undefined},serve:f=>{handler=f;}},createClient:()=>sb,verificarJwt:async()=>sessao,crachaRevogado:async()=>false,Response,Request,console:{error(){}}});
 return {linhas,gravacoes,ganchos,achar,async chamar(corpo){const r=await handler(new Request('http://local',{method:'POST',headers:{authorization:'Bearer teste','Content-Type':'application/json'},body:JSON.stringify(corpo)}));return {status:r.status,body:await r.json()};}};
}
const L=(colecao,id,registro)=>({colecao,id,registro});
const RAPHAEL=['patrimonio','inventario-valores','manutencoes','seguranca'];

test('merge do patrimônio descarta origemAtivoId vindo da tela: o gravado fica, bem novo nasce sem ele',async()=>{
 const a=ambiente(['inventario-valores'],[L('patrimonio','bem-1',{codigo:'PRO-001',origemAtivoId:'maq-1',nomeGenerico:'Antigo'})]);
 for(const forjado of ['maq-falsa','']){
  const r=await a.chamar({action:'merge',chave:'patrimonio',patch:{'bem-1':{nomeGenerico:'Novo nome',origemAtivoId:forjado}}});
  assert.equal(r.status,200,JSON.stringify(r.body));
  const g=a.gravacoes.filter(x=>x.nome==='painel_registro_gravar').at(-1).p.p_registro;
  assert.equal(g.origemAtivoId,'maq-1');assert.equal(g.nomeGenerico,'Novo nome');
 }
 const r=await a.chamar({action:'merge',chave:'patrimonio',patch:{'bem-2':{nomeGenerico:'Bem novo',setorSigla:'',origemAtivoId:'maq-2'}}});
 assert.equal(r.status,200,JSON.stringify(r.body));
 assert.equal(Object.hasOwn(a.achar('patrimonio','bem-2').registro,'origemAtivoId'),false);
});

test('excluir bem ligado é recusado pelos dois lados, sem retirar; ficha só na lixeira não impede',async()=>{
 const casos=[
  ['pelo bem',[L('patrimonio','bem-1',{origemAtivoId:'maq-1'}),L('ativo','maq-1',{tipo:'maquina',nome:'Máquina fictícia'})],RAPHAEL,'Este bem está ligado a Máquina · Máquina fictícia. Desfaça o vínculo no bloco Ligado a antes de excluir o cadastro.'],
  ['pela ficha',[L('patrimonio','bem-1',{}),L('ativo','pc-1',{tipo:'informatica',categoria:'Computador',nome:'PC fictício',bemId:'bem-1'})],RAPHAEL,'Este bem está ligado a Estrutura · PC fictício. Desfaça o vínculo no bloco Ligado a antes de excluir o cadastro.'],
  ['Segurança oculta',[L('patrimonio','bem-1',{}),L('ativo','cam-1',{tipo:'seguranca',nome:'Câmera fictícia',bemId:'bem-1'})],['inventario-valores'],'Este bem está ligado a uma ficha de Segurança. Desfaça o vínculo no bloco Ligado a antes de excluir o cadastro.'],
  ['origem retirada',[L('patrimonio','bem-1',{origemAtivoId:'maq-1'}),L('ativo_lixeira','maq-1',{tipo:'maquina',nome:'Máquina retirada'})],RAPHAEL,'Este bem está ligado a uma ficha retirada. Desfaça o vínculo no bloco Ligado a antes de excluir o cadastro.'],
 ];
 for(const [nome,linhas,perms,erro] of casos){
  const a=ambiente(perms,linhas);const r=await a.chamar({action:'removerId',chave:'patrimonio',id:'bem-1'});
  assert.equal(r.status,409,nome);assert.equal(r.body.erro,erro,nome);assert.equal(a.gravacoes.length,0,nome);assert.ok(a.achar('patrimonio','bem-1'),nome);
 }
 for(const linhas of [[L('patrimonio','bem-1',{})],[L('patrimonio','bem-1',{}),L('ativo_lixeira','pc-1',{tipo:'informatica',nome:'PC retirado',bemId:'bem-1'})]]){
  const a=ambiente(RAPHAEL,linhas);const r=await a.chamar({action:'removerId',chave:'patrimonio',id:'bem-1'});
  assert.equal(r.status,200,JSON.stringify(r.body));assert.deepEqual(a.gravacoes.map(g=>g.nome),['painel_registro_retirar']);assert.equal(a.achar('patrimonio','bem-1'),undefined);
 }
});

test('excluir bem: se uma ficha for ligada durante a retirada, o bem volta da lixeira e a exclusão é recusada',async()=>{
 const a=ambiente(RAPHAEL,[L('patrimonio','bem-1',{codigo:'PRO-001'}),L('ativo','maq-1',{tipo:'maquina',nome:'Máquina fictícia'})]);
 a.ganchos.push(nome=>{if(nome==='painel_registro_retirar')a.achar('ativo','maq-1').registro.bemId='bem-1';});
 const r=await a.chamar({action:'removerId',chave:'patrimonio',id:'bem-1'});
 assert.equal(r.status,409);assert.equal(r.body.erro,'Este bem está ligado a Máquina · Máquina fictícia. Desfaça o vínculo no bloco Ligado a antes de excluir o cadastro.');
 assert.deepEqual(a.gravacoes.map(g=>g.nome),['painel_registro_retirar','painel_registro_recuperar']);
 assert.equal(a.gravacoes[1].p.p_lixeira_id,'patrimonio:bem-1');assert.deepEqual(a.achar('patrimonio','bem-1').registro,{codigo:'PRO-001'});
});

// Revisão adversarial: o evento de vínculo gravado no bem (Desfazer pelo bem)
// não leva o nome nem o id da ficha de Segurança a quem não tem Segurança, e
// o login (`por`) não desce para ninguém. O get do patrimônio passa por aqui.
test('get do patrimônio: histórico do bem mascara a ficha de Segurança e tira o login dos eventos de vínculo',async()=>{
 const ev=(id,extra={})=>({id,acao:'vinculado',bemId:'bem-1',ativoId:'cam-1',familia:'seguranca',nome:'Câmera do cofre',bemCodigo:'PRO-001',lado:'ficha',via:'vincularFicha',por:'login-secreto',porNome:'Pessoa',em:'2026-10-01T00:00:00.000Z',...extra});
 const sinc={acao:'sincronizado',por:'login-antigo',em:'2026-09-01'};
 const linhas=[L('patrimonio','bem-1',{codigo:'PRO-001',historico:[sinc,ev('e1'),ev('e2',{acao:'desvinculado',ativoId:'maq-1',familia:'maquina',nome:'Máquina fictícia'})]})];
 let r=await ambiente(['patrimonio','inventario-valores'],linhas).chamar({action:'get',chave:'patrimonio'});
 assert.equal(r.status,200,JSON.stringify(r.body));
 const h=r.body.valor['bem-1'].historico;
 assert.doesNotMatch(JSON.stringify(h),/Câmera do cofre|"ativoId":"cam-1"|login-secreto/);
 assert.deepEqual([h[1].nome,h[1].ativoId,h[1].familia],['Ficha de Segurança','','seguranca']);
 assert.deepEqual([h[2].nome,h[2].ativoId],['Máquina fictícia','maq-1']);
 assert.deepEqual(h[0],sinc);
 r=await ambiente(RAPHAEL,linhas).chamar({action:'get',chave:'patrimonio'});
 const comSeguranca=r.body.valor['bem-1'].historico;
 assert.deepEqual([comSeguranca[1].nome,comSeguranca[1].ativoId],['Câmera do cofre','cam-1']);
 assert.doesNotMatch(JSON.stringify(comSeguranca),/login-secreto/);
});

test('área do bem: salvar, ler, trocar e limpar sem ficha; preserva setor, etiqueta e histórico',async()=>{
 const original={codigo:'PRO-900',setorSigla:'PRO',nomeGenerico:'Bem fictício',historico:[{acao:'cadastro',em:'2026-01-01'}]};
 const a=ambiente(['inventario-valores'],[L('patrimonio','bem-area',original)]);
 for(const area of ['maquinas','carros','estrutura','']){
  const r=await a.chamar({action:'merge',chave:'patrimonio',patch:{'bem-area':{areaPatrimonio:area}}});
  assert.equal(r.status,200,JSON.stringify(r.body));
  assert.equal(r.body.valor['bem-area'].areaPatrimonio,area);
  const b=a.achar('patrimonio','bem-area').registro;
  assert.equal(b.codigo,original.codigo);assert.equal(b.setorSigla,original.setorSigla);
  assert.deepEqual(b.historico,original.historico);
  assert.equal(a.linhas.filter(x=>x.colecao==='patrimonio').length,1);
  assert.equal(a.linhas.filter(x=>x.colecao==='ativo').length,0);
  const leitura=await a.chamar({action:'get',chave:'patrimonio'});
  assert.equal(leitura.body.valor['bem-area'].areaPatrimonio,area);
 }
});
test('área inválida recusa o lote antes de gravar; operação continua exigindo Inventário e valores',async()=>{
 for(const area of ['telefone',null,{},['maquinas'],true]){
  const a=ambiente(['inventario-valores'],[L('patrimonio','bem-area',{codigo:'PRO-900'})]);
  const r=await a.chamar({action:'merge',chave:'patrimonio',patch:{'bem-area':{areaPatrimonio:'maquinas'},'outro':{areaPatrimonio:area}}});
  assert.equal(r.status,422,JSON.stringify(r.body));assert.equal(a.gravacoes.length,0);
 }
 const a=ambiente(['patrimonio'],[L('patrimonio','bem-area',{codigo:'PRO-900'})]);
 assert.equal((await a.chamar({action:'merge',chave:'patrimonio',patch:{'bem-area':{areaPatrimonio:'carros'}}})).status,403);
 assert.equal(a.gravacoes.length,0);
});
