import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import vm from 'node:vm';
import * as acesso from '../supabase/functions/_shared/patrimonio-acesso.mjs';
import {prepararFisico} from '../supabase/functions/_shared/patrimonio-fisico.mjs';
import {validarVinculoPessoa} from '../supabase/functions/_shared/patrimonio-pessoas.mjs';
import {temHistoricoPessoal} from '../supabase/functions/_shared/documentos.mjs';

// Handler real do painel-ativos; só o crachá e o banco são simulados, com dados
// fictícios. O banco falso confere versão como painel_registro_gravar e imita a
// regra adiada painel_ativo_bem_direto_integro (23503) nas gravações de `ativo`.
// VINCULO_ATIVOS_SOURCE aponta para outra versão do arquivo (ciclo vermelho-verde).
const fonte=readFileSync(process.env.VINCULO_ATIVOS_SOURCE||new URL('../supabase/functions/painel-ativos/index.ts',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'');
const codigo=transformSync(fonte,{loader:'ts',format:'esm',target:'es2022'}).code;
const json=x=>JSON.stringify(x??null);
function banco(iniciais){
 const linhas=structuredClone(iniciais),consultas=[],gravacoes=[],ganchos=[];
 const valor=(r,k)=>k.startsWith('registro->>')?r.registro?.[k.slice(11)]:r[k];
 const achar=(c,id)=>linhas.find(r=>r.colecao===c&&r.id===id);
 const tirar=(c,id)=>{const i=linhas.findIndex(r=>r.colecao===c&&r.id===id);return i<0?null:linhas.splice(i,1)[0];};
 const pôr=(c,id,registro)=>{const r=achar(c,id);if(r)r.registro=structuredClone(registro);else linhas.push({colecao:c,id,registro:structuredClone(registro)});};
 // Mesmas três recusas da regra do banco (20261011120000_ramais_vinculos.sql).
 const regraBemDireto=(id,novo,antigo)=>{
  if(antigo&&(novo.bemId??null)===(antigo.bemId??null))return null;
  const v=novo.bemId||'';
  if(linhas.some(r=>r.colecao==='patrimonio'&&r.registro.origemAtivoId===id&&r.id!==v))return {code:'23503',message:'vínculo inverso'};
  if(!v)return null;
  const bem=achar('patrimonio',v);
  if(!bem||linhas.some(r=>r.colecao==='ativo'&&r.id!==id&&r.registro.bemId===v)||![undefined,null,'',id].includes(bem.registro.origemAtivoId))return {code:'23503',message:'bem inexistente ou já vinculado'};
  return null;
 };
 const sb={from(tabela){
  assert.equal(tabela,'painel_registros');const c={filtros:[],inicio:0,fim:Infinity};consultas.push(c);
  const res=()=>({data:structuredClone(linhas.filter(r=>c.filtros.every(([k,v,op])=>op==='in'?v.includes(valor(r,k)):valor(r,k)===v)).sort((a,b)=>a.id.localeCompare(b.id)).slice(c.inicio,c.fim+1)),error:null});
  const q={select(x){c.campos=x;return q},eq(k,v){c.filtros.push([k,v]);return q},in(k,v){c.filtros.push([k,v,'in']);return q},order(){return q},range(a,b){c.inicio=a;c.fim=b;return q},limit(n){c.fim=n-1;return q},
   async maybeSingle(){const r=res();return {...r,data:r.data[0]??null}},then(a,b){return Promise.resolve(res()).then(a,b)}};
  return q;
 },async rpc(nome,p){
  gravacoes.push({nome,p:structuredClone(p)});
  for(const g of ganchos){const erro=await g(nome,p,linhas);if(erro)return {data:null,error:erro};}
  if(nome==='painel_registro_gravar'){
   const atual=achar(p.p_colecao,p.p_id)?.registro??null;
   if(!atual&&achar('registro_lixeira',`${p.p_colecao}:${p.p_id}`))return {error:{code:'40001',message:'retirado'}};
   if(json(atual)!==json(p.p_anterior)){if(json(atual)===json(p.p_registro))return {data:atual,error:null};return {error:{code:'40001',message:'versão'}};}
   if(p.p_colecao==='ativo'){const erro=regraBemDireto(p.p_id,p.p_registro,atual);if(erro)return {error:erro};}
   pôr(p.p_colecao,p.p_id,p.p_registro);return {data:structuredClone(p.p_registro),error:null};
  }
  if(nome==='painel_ativo_restaurar'){
   const v=achar('ativo_lixeira',p.p_id)?.registro;
   if(!v||json(v)!==json(p.p_anterior))return {error:{code:'40001',message:'lixeira mudou'}};
   const {_apagadoEm,...novo}=v;const erro=regraBemDireto(p.p_id,novo,null);if(erro)return {error:erro};
   tirar('ativo_lixeira',p.p_id);pôr('ativo',p.p_id,novo);return {data:true,error:null};
  }
  if(nome==='painel_ativo_retirar'){
   const v=tirar('ativo',p.p_id);if(!v)return {error:{message:'item não encontrado'}};
   if(p.p_bem_id){const b=achar('patrimonio',p.p_bem_id);b.registro={...b.registro,situacao:'baixado'};}
   pôr('ativo_lixeira',p.p_id,{...v.registro,_apagadoEm:'agora'});return {data:true,error:null};
  }
  if(nome==='painel_equipamento_gravar'){
   if(linhas.some(r=>r.colecao==='patrimonio'&&r.registro.origemAtivoId===p.p_id&&r.id!==p.p_bem_id))return {error:{code:'23503',message:'já utilizado'}};
   const b=achar('patrimonio',p.p_bem_id)?.registro;
   pôr('ativo',p.p_id,{...p.p_ativo,bemId:p.p_bem_id});
   pôr('patrimonio',p.p_bem_id,{...(b||{}),...p.p_bem_patch,origemAtivoId:p.p_id,historico:[...(b?.historico||[]),{acao:'sincronizado',por:p.p_por,em:'agora'}]});
   return {data:{item:{...p.p_ativo,bemId:p.p_bem_id}},error:null};
  }
  throw new Error('RPC inesperada: '+nome);
 }};
 return {sb,linhas,consultas,gravacoes,ganchos,achar};
}
function ambiente(perms,iniciais=[],sessaoExtra={}){
 const b=banco(iniciais);let handler;
 const sessao={sub:'login-ficticio',nome:'Pessoa Fictícia',perms,...sessaoExtra};
 vm.runInNewContext(codigo,{...acesso,prepararFisico,validarVinculoPessoa,temHistoricoPessoal,previaReclassificacao:()=>[],lerPessoasPatrimonio:async()=>[],
  atenderDocumentos:async()=>{throw new Error('fora do escopo')},papelNoMarketing:async()=>null,papelGrava:()=>false,
  Deno:{env:{get:()=> 'teste'},serve:f=>handler=f},createClient:()=>b.sb,verificarJwt:async()=>sessao,crachaRevogado:async()=>false,Request,Response,console:{error(){}}});
 return {...b,sessao,async chamar(corpo){const r=await handler(new Request('http://teste.invalid',{method:'POST',headers:{authorization:'Bearer teste'},body:JSON.stringify(corpo)}));return {status:r.status,body:await r.json()};}};
}

const RAPHAEL=['patrimonio','inventario-valores','manutencoes','seguranca'];
const L=(colecao,id,registro)=>({colecao,id,registro:{id,...registro}});
const FICHAS={
 carro:L('ativo','car-1',{tipo:'veiculo',nome:'Carro fictício',atualizadoEm:'v-car'}),
 maquina:L('ativo','maq-1',{tipo:'maquina',nome:'Máquina fictícia',atualizadoEm:'v-maq'}),
 estrutura:L('ativo','ar-1',{tipo:'predial',categoria:'Ar condicionado',nome:'Ar fictício',especificacao:{local:'Sala',quantidade:'1'},atualizadoEm:'v-ar'}),
 telefonia:L('ativo','cel-1',{tipo:'informatica',categoria:'Celular',nome:'Celular fictício',especificacao:{situacao:'uso'},atualizadoEm:'v-cel'}),
 seguranca:L('ativo','cam-1',{tipo:'seguranca',categoria:'Câmera',nome:'Câmera fictícia',especificacao:{situacao:'uso'},atualizadoEm:'v-cam'}),
 incendio:L('ativo','ext-1',{tipo:'predial',categoria:'Extintor',nome:'Extintor fictício',especificacao:{local:'Corredor',situacao:'uso'},atualizadoEm:'v-ext'}),
};
const bem=(id,extra={})=>L('patrimonio',id,{codigo:`ETQ-${id}`,nomeGenerico:`Bem ${id}`,situacao:'uso',atualizadoEm:`v-${id}`,...extra});
const pedido=(ficha,bemId,extra={})=>({action:'vincularFicha',bemId,ativoId:ficha.id,versaoFicha:ficha.registro.atualizadoEm||'',versaoBem:`v-${bemId}`,origem:'bem',...extra});

test('listarPatrimonio: inventário sem Segurança recebe só o par de ids das fichas de Segurança',async()=>{
 const linhas=[FICHAS.carro,{...FICHAS.seguranca,registro:{...FICHAS.seguranca.registro,bemId:'bem-cam'}},L('ativo','cam-2',{tipo:'seguranca',nome:'Outra câmera'})];
 let a=ambiente(['inventario-valores'],linhas);let r=await a.chamar({action:'listarPatrimonio'});
 assert.equal(r.status,200);assert.deepEqual(r.body.itens.map(i=>i.id),['car-1']);
 assert.deepEqual(r.body.vinculosOcultos,[{ativoId:'cam-1',bemId:'bem-cam'},{ativoId:'cam-2',bemId:''}]);
 assert.doesNotMatch(JSON.stringify(r.body),/Câmera fictícia|Outra câmera/);
 a=ambiente(['inventario-valores','seguranca'],linhas);r=await a.chamar({action:'listarPatrimonio'});
 assert.deepEqual(r.body.vinculosOcultos,[]);assert.ok(r.body.itens.some(i=>i.id==='cam-1'));assert.equal(a.consultas.length,1);
 a=ambiente(['patrimonio'],linhas);r=await a.chamar({action:'listarPatrimonio'});
 assert.deepEqual(r.body.vinculosOcultos,[]);assert.equal(a.consultas.length,1,'sem consulta a mais');
});

test('vincularFicha recusa cada caso ruim antes de qualquer gravação, com o texto exato',async()=>{
 const linhas=[...Object.values(FICHAS),bem('bem-1'),bem('bem-2'),bem('bem-baixado',{situacao:'baixado'}),
  L('ativo','avcb-1',{tipo:'predial',categoria:'AVCB',nome:'AVCB'}),L('ativo','doc-1',{tipo:'documento',nome:'Certidão'}),
  L('ativo','pc-baixado',{tipo:'informatica',categoria:'Computador',nome:'PC antigo',especificacao:{situacao:'baixado'},atualizadoEm:'v-pc'}),
  L('ativo_lixeira','retirada',{tipo:'maquina',nome:'Retirada'}),L('registro_lixeira','patrimonio:bem-excluido',{colecao:'patrimonio',id:'bem-excluido',registro:{}}),
  L('ativo','pc-ligado',{tipo:'informatica',categoria:'Computador',nome:'PC ligado',bemId:'bem-2',atualizadoEm:'v-pcl'}),
  bem('bem-leg',{origemAtivoId:'pc-leg'}),L('ativo','pc-leg',{tipo:'informatica',categoria:'Computador',nome:'PC legado',atualizadoEm:'v-pcleg'}),
  bem('bem-da-maq',{origemAtivoId:'maq-2'}),L('ativo','maq-2',{tipo:'maquina',nome:'Outra máquina',bemId:'bem-da-maq'}),
  bem('bem-cam',{}),L('ativo','cam-2',{tipo:'seguranca',categoria:'Câmera',nome:'Câmera escondida',bemId:'bem-cam'}),
  bem('bem-orfao',{origemAtivoId:'retirada'})];
 const casos=[
  [['inventario-valores'],pedido(FICHAS.carro,'bem 1'),422,'Identificador inválido. Atualize a página.'],
  [RAPHAEL,{...pedido(FICHAS.carro,'bem-1'),ativoId:undefined},422,'Identificador inválido. Atualize a página.'],
  [RAPHAEL,{...pedido(FICHAS.carro,'bem-1'),versaoBem:null},422,'Versão inválida. Atualize a página.'],
  [['patrimonio','manutencoes','seguranca'],pedido(FICHAS.carro,'bem-1'),403,'Esta operação exige Inventário e valores.'],
  [RAPHAEL,{...pedido(FICHAS.carro,'bem-1'),ativoId:'nada'},404,'Ficha não encontrada. Atualize a lista.'],
  [RAPHAEL,{...pedido(FICHAS.carro,'bem-1'),ativoId:'retirada'},409,'Esta ficha foi retirada. Atualize a lista.'],
  [RAPHAEL,{...pedido(FICHAS.carro,'bem-1'),ativoId:'avcb-1'},422,'Este cadastro não se liga a bem do inventário.'],
  [RAPHAEL,{...pedido(FICHAS.carro,'bem-1'),ativoId:'doc-1'},422,'Este cadastro não se liga a bem do inventário.'],
  [['inventario-valores','patrimonio'],pedido(FICHAS.carro,'bem-1'),403,'Ligar ou desfazer vínculo de Carro exige a permissão Patrimônio · Manutenções.'],
  [['inventario-valores','manutencoes'],pedido(FICHAS.seguranca,'bem-1'),403,'Ligar ou desfazer vínculo de Segurança exige a permissão Segurança.'],
  [['inventario-valores','manutencoes'],pedido(FICHAS.estrutura,'bem-1'),403,'Ligar ou desfazer vínculo de Estrutura exige a permissão Patrimônio.'],
  [RAPHAEL,pedido(FICHAS.carro,'bem-x'),404,'Bem não encontrado. Atualize a lista.'],
  [RAPHAEL,pedido(FICHAS.carro,'bem-excluido'),409,'Este bem foi excluído. Atualize a lista.'],
  [RAPHAEL,{...pedido(FICHAS.carro,'bem-1'),ativoId:'pc-baixado',versaoFicha:'v-pc'},409,'Esta ficha está baixada e não pode ser ligada.'],
  [RAPHAEL,pedido(FICHAS.carro,'bem-baixado'),409,'Este bem está baixado e não pode ser ligado.'],
  [RAPHAEL,{...pedido(FICHAS.carro,'bem-1'),versaoFicha:'velha'},409,'Esta ficha mudou. Atualize antes de continuar.'],
  [RAPHAEL,{...pedido(FICHAS.carro,'bem-1'),versaoBem:'velha'},409,'Este bem mudou. Atualize antes de continuar.'],
  [RAPHAEL,{...pedido(FICHAS.carro,'bem-1'),ativoId:'pc-ligado',versaoFicha:'v-pcl'},409,'Esta ficha já está ligada ao bem ETQ-bem-2. Desfaça esse vínculo antes de ligar outro.'],
  [RAPHAEL,{...pedido(FICHAS.carro,'bem-1'),ativoId:'pc-leg',versaoFicha:'v-pcleg'},409,'Esta ficha já está ligada ao bem ETQ-bem-leg. Desfaça esse vínculo antes de ligar outro.'],
  [RAPHAEL,pedido(FICHAS.carro,'bem-da-maq'),409,'Este bem já está ligado a Máquina · Outra máquina. Desfaça esse vínculo antes de ligar de novo.'],
  [RAPHAEL,pedido(FICHAS.carro,'bem-2'),409,'Este bem já está ligado a Estrutura · PC ligado. Desfaça esse vínculo antes de ligar de novo.'],
  [['inventario-valores','manutencoes'],pedido(FICHAS.carro,'bem-cam'),409,'Este bem já está ligado a uma ficha de Segurança. Desfaça esse vínculo antes de ligar de novo.'],
  [RAPHAEL,pedido(FICHAS.carro,'bem-orfao'),409,'Este bem já está ligado a uma ficha retirada. Desfaça esse vínculo antes de ligar de novo.'],
 ];
 for(const [perms,corpo,status,erro] of casos){
  const a=ambiente(perms,linhas);const r=await a.chamar(corpo);
  assert.equal(r.status,status,`${erro}: ${JSON.stringify(r.body)}`);assert.equal(r.body.erro,erro);assert.equal(a.gravacoes.length,0,erro);
 }
});

test('vincularFicha grava só a ficha, uma vez, com bemId, evento e versão nova; repetição não grava',async()=>{
 const a=ambiente(RAPHAEL,[FICHAS.maquina,bem('bem-1')]);
 const r=await a.chamar(pedido(FICHAS.maquina,'bem-1'));
 assert.equal(r.status,200,JSON.stringify(r.body));
 assert.deepEqual(a.gravacoes.map(g=>[g.nome,g.p.p_colecao]),[['painel_registro_gravar','ativo']]);
 const salvo=a.achar('ativo','maq-1').registro;
 assert.equal(salvo.bemId,'bem-1');assert.equal(salvo.historicoVinculo.length,1);assert.notEqual(salvo.atualizadoEm,'v-maq');assert.equal(salvo.atualizadoPor,'Pessoa Fictícia');
 const ev=salvo.historicoVinculo[0];
 assert.deepEqual({...ev,id:'',em:''},{id:'',acao:'vinculado',bemId:'bem-1',ativoId:'maq-1',familia:'maquina',nome:'Máquina fictícia',bemCodigo:'ETQ-bem-1',lado:'ficha',via:'vincularFicha',tela:'bem',por:'login-ficticio',porNome:'Pessoa Fictícia',em:''});
 assert.equal(r.body.ficha.bemId,'bem-1');assert.equal(r.body.ficha.atualizadoEm,salvo.atualizadoEm);
 assert.equal(r.body.evento.id,ev.id);assert.equal(Object.hasOwn(r.body.evento,'por'),false);
 assert.equal(a.achar('patrimonio','bem-1').registro.origemAtivoId,undefined,'o bem não é gravado');
 const de_novo=await a.chamar({...pedido(FICHAS.maquina,'bem-1'),versaoFicha:'qualquer'});
 assert.equal(de_novo.status,200);assert.equal(de_novo.body.jaLigado,true);assert.equal(de_novo.body.ficha.bemId,'bem-1');assert.equal(a.gravacoes.length,1);
 // Legado só pelo bem também conta como já ligado.
 const leg=ambiente(RAPHAEL,[FICHAS.maquina,bem('bem-1',{origemAtivoId:'maq-1'})]);
 const r2=await leg.chamar(pedido(FICHAS.maquina,'bem-1'));assert.equal(r2.body.jaLigado,true);assert.equal(leg.gravacoes.length,0);
});

test('vincularFicha: 23503 e 40001 da gravação viram corrida; outro erro sobe como 500',async()=>{
 for(const [code,status] of [['23503',409],['40001',409],['XX000',500]]){
  const a=ambiente(RAPHAEL,[FICHAS.carro,bem('bem-1')]);a.ganchos.push(()=>({code,message:'simulado'}));
  const r=await a.chamar(pedido(FICHAS.carro,'bem-1'));assert.equal(r.status,status);
  if(status===409)assert.equal(r.body.erro,'O bem ou a ficha mudou durante o vínculo. Atualize e tente de novo.');
  assert.equal(a.achar('ativo','car-1').registro.bemId,undefined);
 }
 // A regra do banco falso recusa de verdade quando alguém liga o bem no meio.
 const a=ambiente(RAPHAEL,[FICHAS.carro,FICHAS.maquina,bem('bem-1')]);
 a.ganchos.push((nome,p,linhas)=>{if(p.p_id==='car-1'&&!a.achar('ativo','maq-1').registro.bemId)a.achar('ativo','maq-1').registro.bemId='bem-1';});
 const r=await a.chamar(pedido(FICHAS.carro,'bem-1'));assert.equal(r.status,409);assert.match(r.body.erro,/mudou durante o vínculo/);
});

const desfazer=(ativoId,bemId,versaoFicha,versaoBem,extra={})=>({action:'desvincularFicha',bemId,ativoId,versaoFicha,versaoBem,origem:'ficha',...extra});
test('desvincularFicha: só ficha, só bem, os dois e ficha na lixeira, na ordem bem e depois ficha',async()=>{
 const maq=(extra={})=>L('ativo','maq-1',{tipo:'maquina',nome:'Máquina fictícia',atualizadoEm:'v-maq',...extra});
 const cenarios=[
  ['só ficha',[maq({bemId:'bem-1'}),bem('bem-1')],[['ativo']],'ficha'],
  ['só bem',[maq(),bem('bem-1',{origemAtivoId:'maq-1'})],[['patrimonio'],['ativo']],'bem'],
  ['os dois',[maq({bemId:'bem-1'}),bem('bem-1',{origemAtivoId:'maq-1'})],[['patrimonio'],['ativo']],'ambos'],
  ['lixeira',[L('ativo_lixeira','maq-1',{tipo:'maquina',nome:'Máquina fictícia',bemId:'bem-1',_apagadoEm:'ontem'}),bem('bem-1',{origemAtivoId:'maq-1'})],[['patrimonio'],['ativo_lixeira']],'ambos'],
 ];
 for(const [nome,linhas,ordem,lado] of cenarios){
  const a=ambiente(RAPHAEL,linhas);const r=await a.chamar(desfazer('maq-1','bem-1','v-maq','v-bem-1'));
  assert.equal(r.status,200,`${nome}: ${JSON.stringify(r.body)}`);
  assert.deepEqual(a.gravacoes.map(g=>[g.p.p_colecao]),ordem,nome);
  assert.equal(r.body.evento.lado,lado,nome);assert.equal(r.body.evento.acao,'desvinculado');assert.equal(Object.hasOwn(r.body.evento,'por'),false);
  const b=a.achar('patrimonio','bem-1').registro;assert.equal(Object.hasOwn(b,'origemAtivoId'),false,nome);
  const f=(a.achar('ativo','maq-1')||a.achar('ativo_lixeira','maq-1')).registro;assert.ok(!f.bemId,nome);
  assert.equal(f.historicoVinculo.at(-1).id,r.body.evento.id,nome);
  if(ordem.length===2&&ordem[0][0]==='patrimonio'){assert.equal(b.historico.at(-1).id,r.body.evento.id,nome);assert.equal(r.body.bem.id,'bem-1');assert.equal(b.atualizadoPor,'login-ficticio');assert.equal(b.atualizadoPorNome,'Pessoa Fictícia');}
  else assert.equal(r.body.bem,null,nome);
  if(nome==='lixeira')assert.equal(r.body.ficha,null);else{assert.equal(r.body.ficha.bemId,'');assert.notEqual(r.body.ficha.atualizadoEm,'v-maq');}
 }
});

test('desvincularFicha: bem excluído limpa só a ficha; ficha sumida limpa só o bem',async()=>{
 let a=ambiente(RAPHAEL,[L('ativo','maq-1',{tipo:'maquina',nome:'M',bemId:'bem-sumido',atualizadoEm:'v-maq'})]);
 let r=await a.chamar(desfazer('maq-1','bem-sumido','v-maq',''));
 assert.equal(r.status,200,JSON.stringify(r.body));assert.deepEqual(a.gravacoes.map(g=>g.p.p_colecao),['ativo']);assert.equal(r.body.bem,null);assert.equal(a.achar('ativo','maq-1').registro.bemId,'');
 a=ambiente(['inventario-valores'],[bem('bem-1',{origemAtivoId:'sumida'})]);
 r=await a.chamar(desfazer('sumida','bem-1','','v-bem-1'));
 assert.equal(r.status,200,JSON.stringify(r.body));assert.deepEqual(a.gravacoes.map(g=>g.p.p_colecao),['patrimonio']);assert.equal(r.body.ficha,null);assert.equal(a.achar('patrimonio','bem-1').registro.origemAtivoId,undefined);
 assert.equal(r.body.evento.lado,'bem');
});

test('desvincularFicha: falha na ficha devolve o bem; falha também na volta responde 500 parcial',async()=>{
 const linhas=[L('ativo','maq-1',{tipo:'maquina',nome:'M',bemId:'bem-1',atualizadoEm:'v-maq'}),bem('bem-1',{origemAtivoId:'maq-1'})];
 let a=ambiente(RAPHAEL,linhas);a.ganchos.push((nome,p)=>p.p_colecao==='ativo'?{code:'XX000',message:'queda'}:null);
 let r=await a.chamar(desfazer('maq-1','bem-1','v-maq','v-bem-1'));
 assert.equal(r.status,409);assert.equal(r.body.erro,'O bem ou a ficha mudou durante o vínculo. Atualize e tente de novo.');
 const noBem=a.gravacoes.filter(g=>g.p.p_colecao==='patrimonio');assert.equal(noBem.length,2);
 assert.deepEqual(noBem[1].p.p_registro,linhas[1].registro);assert.deepEqual(a.achar('patrimonio','bem-1').registro,linhas[1].registro);
 a=ambiente(RAPHAEL,linhas);let gravouBem=false;
 a.ganchos.push((nome,p)=>{if(p.p_colecao==='ativo')return {code:'XX000',message:'queda'};if(p.p_colecao==='patrimonio'){if(gravouBem)return {code:'XX000',message:'queda'};gravouBem=true;}});
 r=await a.chamar(desfazer('maq-1','bem-1','v-maq','v-bem-1'));
 assert.equal(r.status,500);assert.equal(r.body.parcial,true);assert.equal(r.body.erro,'O vínculo foi desfeito só no bem. Atualize a ficha do bem e use Desfazer de novo.');
 // Sobra um vínculo válido só pela ficha; um novo Desfazer resolve com uma gravação.
 assert.equal(a.achar('patrimonio','bem-1').registro.origemAtivoId,undefined);assert.equal(a.achar('ativo','maq-1').registro.bemId,'bem-1');
 a.ganchos.length=0;const antes=a.gravacoes.length;
 r=await a.chamar(desfazer('maq-1','bem-1','v-maq',a.achar('patrimonio','bem-1').registro.atualizadoEm));
 assert.equal(r.status,200);assert.deepEqual(a.gravacoes.slice(antes).map(g=>g.p.p_colecao),['ativo']);
});

test('desvincularFicha: permissão da família, repetição, versões e outro bem na ficha',async()=>{
 const cam=L('ativo','cam-1',{tipo:'seguranca',categoria:'Câmera',nome:'Câmera',bemId:'bem-1',atualizadoEm:'v-cam'});
 let a=ambiente(['inventario-valores','patrimonio','manutencoes'],[cam,bem('bem-1')]);
 let r=await a.chamar(desfazer('cam-1','bem-1','v-cam','v-bem-1'));assert.equal(r.status,403);assert.equal(r.body.erro,'Ligar ou desfazer vínculo de Segurança exige a permissão Segurança.');assert.equal(a.gravacoes.length,0);
 a=ambiente(RAPHAEL,[FICHAS.carro,bem('bem-1')]);r=await a.chamar(desfazer('car-1','bem-1','v-car','v-bem-1'));
 assert.equal(r.status,200);assert.equal(r.body.jaDesfeito,true);assert.equal(a.gravacoes.length,0);
 const ligado=[L('ativo','car-1',{tipo:'veiculo',nome:'C',bemId:'bem-1',atualizadoEm:'v-car'}),bem('bem-1',{origemAtivoId:'car-1'}),bem('bem-2',{origemAtivoId:'car-1'})];
 for(const [corpo,erro] of [[desfazer('car-1','bem-1','velha','v-bem-1'),'Esta ficha mudou. Atualize antes de continuar.'],[desfazer('car-1','bem-1','v-car','velha'),'Este bem mudou. Atualize antes de continuar.'],[desfazer('car-1','bem-1','v-car','v-bem-1'),'Esta ficha também aparece ligada ao bem ETQ-bem-2. Desfaça esse vínculo primeiro.'],[{...desfazer('car-1','bem-1','v-car','v-bem-1'),versaoFicha:1},'Versão inválida. Atualize a página.']]){
  a=ambiente(RAPHAEL,ligado);r=await a.chamar(corpo);assert.ok([409,422].includes(r.status));assert.equal(r.body.erro,erro);assert.equal(a.gravacoes.length,0);
 }
});

test('historicoVinculo junta bem, fichas e lixeira sem repetir, mais novo primeiro, sem login, Segurança oculta',async()=>{
 const ev=(id,em,extra={})=>({id,acao:'vinculado',bemId:'bem-1',ativoId:'maq-1',familia:'maquina',nome:'Máquina',bemCodigo:'ETQ',lado:'ficha',via:'vincularFicha',por:'login-secreto',porNome:'Pessoa',em,...extra});
 const linhas=[
  bem('bem-1',{historico:[{acao:'sincronizado',por:'login-secreto',em:'2026-10-01'},ev('e1','2026-10-02T00:00:00Z'),ev('e3','2026-10-04T00:00:00Z',{acao:'desvinculado'})]}),
  L('ativo','maq-1',{tipo:'maquina',nome:'Máquina',historicoVinculo:[ev('e1','2026-10-02T00:00:00Z'),ev('e3','2026-10-04T00:00:00Z',{acao:'desvinculado'}),ev('outro-bem','2026-10-09T00:00:00Z',{bemId:'bem-9'})]}),
  L('ativo_lixeira','cam-1',{tipo:'seguranca',nome:'Câmera',historicoVinculo:[ev('e2','2026-10-03T00:00:00Z',{ativoId:'cam-1',familia:'seguranca',nome:'Câmera do portão'})]}),
 ];
 let a=ambiente(['inventario-valores'],linhas);let r=await a.chamar({action:'historicoVinculo',bemId:'bem-1'});
 assert.equal(r.status,200,JSON.stringify(r.body));
 assert.deepEqual(r.body.eventos.map(e=>e.id),['e3','e2','e1']);
 assert.doesNotMatch(JSON.stringify(r.body),/login-secreto|sincronizado|Câmera do portão/);
 assert.equal(r.body.eventos[1].nome,'Ficha de Segurança');assert.equal(r.body.eventos[1].ativoId,'');
 assert.deepEqual(Object.keys(r.body.eventos[0]).sort(),['acao','ativoId','bemCodigo','em','familia','id','motivo','nome','porNome','tela','via'].sort());
 assert.equal(a.gravacoes.length,0);
 r=await ambiente(RAPHAEL,linhas).chamar({action:'historicoVinculo',bemId:'bem-1'});assert.equal(r.body.eventos[1].nome,'Câmera do portão');
 const muitos=bem('bem-1',{historico:Array.from({length:130},(_,i)=>ev(`m${i}`,new Date(Date.UTC(2026,0,1,0,i)).toISOString()))});
 r=await ambiente(['inventario-valores'],[muitos]).chamar({action:'historicoVinculo',bemId:'bem-1'});
 assert.equal(r.body.eventos.length,100);assert.equal(r.body.eventos[0].id,'m129');assert.equal(r.body.eventos[99].id,'m30');
 for(const [perms,corpo,status] of [[['patrimonio'],{action:'historicoVinculo',bemId:'bem-1'},403],[['inventario-valores'],{action:'historicoVinculo',bemId:'x y'},422],[['inventario-valores'],{action:'historicoVinculo',bemId:'nada'},404]])
  assert.equal((await ambiente(perms,linhas).chamar(corpo)).status,status);
});

test('historicoVinculo depois de ligar e desfazer mostra cada evento uma vez',async()=>{
 const a=ambiente(RAPHAEL,[FICHAS.maquina,bem('bem-1',{origemAtivoId:'maq-1'})]);
 let r=await a.chamar(desfazer('maq-1','bem-1','v-maq','v-bem-1'));assert.equal(r.status,200);
 const versaoFicha=a.achar('ativo','maq-1').registro.atualizadoEm,versaoBem=a.achar('patrimonio','bem-1').registro.atualizadoEm;
 r=await a.chamar({...pedido(FICHAS.maquina,'bem-1'),versaoFicha,versaoBem});assert.equal(r.status,200,JSON.stringify(r.body));
 r=await a.chamar({action:'historicoVinculo',bemId:'bem-1'});
 assert.deepEqual(r.body.eventos.map(e=>e.acao),['vinculado','desvinculado']);
});

// ── Brechas fechadas nas gravações que já existiam ──
const ID='1b4e28ba-2fa1-41d2-883f-0016d3cca427';
test('salvarFisico e salvarTelefonia recusam bem baixado e bem ligado a outra ficha',async()=>{
 const linhas=[bem('bem-baixado',{situacao:'baixado'}),bem('bem-1'),L('ativo','pc-2',{tipo:'informatica',categoria:'Computador',nome:'Outro PC',bemId:'bem-1'})];
 const fisico={action:'salvarFisico',item:{cadastroId:ID,tipo:'informatica',categoria:'Computador',nome:'PC novo',especificacao:{local:'Sala'},bemId:'bem-baixado'}};
 const tel={action:'salvarTelefonia',item:{cadastroId:ID,nome:'Ramal',categoria:'Telefone',bemId:'bem-baixado'}};
 for(const corpo of [fisico,tel]){
  let a=ambiente(RAPHAEL,linhas);let r=await a.chamar(corpo);
  assert.equal(r.status,409,JSON.stringify(r.body));assert.equal(r.body.erro,'Este bem está baixado e não pode ser ligado.');assert.equal(a.gravacoes.length,0);
  a=ambiente(RAPHAEL,linhas);r=await a.chamar({...corpo,item:{...corpo.item,bemId:'bem-1'}});
  assert.equal(r.status,409);assert.equal(r.body.erro,'Este bem já está ligado a Estrutura · Outro PC. Desfaça esse vínculo antes de ligar de novo.');assert.equal(a.gravacoes.length,0);
  a=ambiente(RAPHAEL,linhas);r=await a.chamar({...corpo,item:{...corpo.item,bemId:'bem-novo'}});assert.equal(r.status,404);assert.equal(r.body.erro,'Bem não encontrado. Atualize a lista.');
 }
 const a=ambiente(RAPHAEL,[bem('bem-2')]);const r=await a.chamar({...fisico,item:{...fisico.item,bemId:'bem-2',especificacao:{local:'Sala',situacao:'baixado'}}});
 assert.equal(r.status,409);assert.equal(r.body.erro,'Esta ficha está baixada e não pode ser ligada.');assert.equal(a.gravacoes.length,0);
});

test('salvarFisico e salvarTelefonia: trocar de bem pelo formulário é recusado; ligar e limpar gravam evento; editar sem bemId não mexe',async()=>{
 const pc=L('ativo','pc-1',{tipo:'informatica',categoria:'Computador',nome:'PC',bemId:'bem-1',atualizadoEm:'v1',especificacao:{local:'Sala'},historicoVinculo:[{id:'antigo',acao:'vinculado',bemId:'bem-1'}]});
 const ramal=L('ativo','tel-1',{tipo:'informatica',categoria:'Telefone',nome:'Ramal',bemId:'bem-1',atualizadoEm:'v1',historicoVinculo:[{id:'antigo',acao:'vinculado',bemId:'bem-1'}]});
 for(const [acao,ficha,base] of [['salvarFisico',pc,{id:'pc-1'}],['salvarTelefonia',ramal,{id:'tel-1',nome:'Ramal',categoria:'Telefone'}]]){
  let a=ambiente(RAPHAEL,[ficha,bem('bem-1'),bem('bem-2')]);
  let r=await a.chamar({action:acao,item:{...base,bemId:'bem-2'},versao:'v1'});
  assert.equal(r.status,409);assert.equal(r.body.erro,'Esta ficha já está ligada a um bem. Para trocar ou tirar, use Desfazer vínculo e depois ligue de novo.');assert.equal(a.gravacoes.length,0);
  r=await a.chamar({action:acao,item:{...base,nome:'Nome novo'},versao:'v1'});
  assert.equal(r.status,200,JSON.stringify(r.body));let salvo=a.achar('ativo',ficha.id).registro;
  assert.equal(salvo.bemId,'bem-1');assert.deepEqual(salvo.historicoVinculo,[{id:'antigo',acao:'vinculado',bemId:'bem-1'}]);
  r=await a.chamar({action:acao,item:{...base,bemId:''},versao:salvo.atualizadoEm});
  assert.equal(r.status,200,JSON.stringify(r.body));salvo=a.achar('ativo',ficha.id).registro;
  assert.equal(salvo.bemId,'');assert.equal(salvo.historicoVinculo.length,2);
  assert.deepEqual([salvo.historicoVinculo[1].acao,salvo.historicoVinculo[1].bemId,salvo.historicoVinculo[1].via,salvo.historicoVinculo[1].bemCodigo],['desvinculado','bem-1',acao,'ETQ-bem-1']);
  r=await a.chamar({action:acao,item:{...base,bemId:'bem-2'},versao:salvo.atualizadoEm});
  assert.equal(r.status,200,JSON.stringify(r.body));salvo=a.achar('ativo',ficha.id).registro;
  assert.equal(salvo.bemId,'bem-2');assert.equal(salvo.historicoVinculo.length,3);
  assert.deepEqual([salvo.historicoVinculo[2].acao,salvo.historicoVinculo[2].bemId,salvo.historicoVinculo[2].lado,salvo.historicoVinculo[2].tela],['vinculado','bem-2','ficha','ficha']);
  assert.equal(a.achar('patrimonio','bem-2').registro.origemAtivoId,undefined,'o bem não é gravado');
 }
});

test('salvar de Carros e Máquinas: versão conferida quando vem, histórico preservado e evento no primeiro vínculo',async()=>{
 const sessao=['inventario-valores','manutencoes'];
 const maq=L('ativo','maq-1',{tipo:'maquina',nome:'Máquina',atualizadoEm:'v-maq',historicoVinculo:[{id:'velho',acao:'desvinculado',bemId:'bem-0'}]});
 let a=ambiente(sessao,[maq,bem('bem-1')]);
 let r=await a.chamar({action:'salvar',item:{id:'maq-1',tipo:'maquina',nome:'Máquina'},patrimonio:{},bemId:'bem-1',versao:'velha'});
 assert.equal(r.status,409);assert.equal(r.body.erro,'Esta ficha mudou. Recarregue antes de salvar.');assert.equal(a.gravacoes.length,0);
 r=await a.chamar({action:'salvar',item:{id:'maq-1',tipo:'maquina',nome:'Máquina'},patrimonio:{},bemId:'bem-1',versao:'v-maq'});
 assert.equal(r.status,200,JSON.stringify(r.body));
 const g=a.gravacoes.at(-1).p;assert.equal(g.p_bem_id,'bem-1');
 assert.equal(g.p_ativo.historicoVinculo.length,2);assert.equal(g.p_ativo.historicoVinculo[0].id,'velho');
 assert.deepEqual([g.p_ativo.historicoVinculo[1].acao,g.p_ativo.historicoVinculo[1].bemId,g.p_ativo.historicoVinculo[1].via,g.p_ativo.historicoVinculo[1].lado,g.p_ativo.historicoVinculo[1].bemCodigo],['vinculado','bem-1','salvar','ambos','ETQ-bem-1']);
 // Já ligada: sem versão segue como antes e não soma evento.
 r=await a.chamar({action:'salvar',item:{id:'maq-1',tipo:'maquina',nome:'Máquina renomeada'},patrimonio:{}});
 assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(a.gravacoes.at(-1).p.p_ativo.historicoVinculo.length,2);
 // Gravação comum (sem inventário) preserva o histórico do vínculo.
 a=ambiente(['manutencoes'],[maq]);r=await a.chamar({action:'salvar',item:{id:'maq-1',tipo:'maquina',nome:'Outro nome'}});
 assert.equal(r.status,200,JSON.stringify(r.body));assert.deepEqual(a.achar('ativo','maq-1').registro.historicoVinculo,maq.registro.historicoVinculo);
});

test('remover: o bem informado tem de ser o vínculo atual da ficha',async()=>{
 const linhas=[L('ativo','maq-1',{tipo:'maquina',nome:'M',bemId:'bem-1'}),bem('bem-1'),bem('bem-2'),L('ativo','maq-2',{tipo:'maquina',nome:'M2'}),bem('bem-3',{origemAtivoId:'maq-2'})];
 let a=ambiente(['inventario-valores','manutencoes'],linhas);
 let r=await a.chamar({action:'remover',id:'maq-1',bemId:'bem-2'});
 assert.equal(r.status,409);assert.equal(r.body.erro,'O vínculo deste equipamento mudou. Atualize a lista antes de retirar.');assert.equal(a.gravacoes.length,0);
 assert.equal(a.achar('patrimonio','bem-2').registro.situacao,'uso');
 r=await a.chamar({action:'remover',id:'maq-1',bemId:'bem-1'});assert.equal(r.status,200);assert.equal(a.gravacoes[0].nome,'painel_ativo_retirar');
 r=await a.chamar({action:'remover',id:'maq-2',bemId:'bem-3'});assert.equal(r.status,200,'legado só pelo bem também vale');
});

test('restaurar: ficha que voltaria para bem excluído ou ocupado volta sem o vínculo e avisa',async()=>{
 const lix=(bemId)=>L('ativo_lixeira','pc-1',{tipo:'informatica',categoria:'Computador',nome:'PC',bemId,_apagadoEm:'ontem'});
 const casos=[['excluído',[lix('bem-1')]],['em outra ficha',[lix('bem-1'),bem('bem-1'),L('ativo','pc-2',{tipo:'informatica',categoria:'Computador',nome:'PC2',bemId:'bem-1'})]],['origem de outra',[lix('bem-1'),bem('bem-1',{origemAtivoId:'pc-9'})]]];
 for(const [nome,linhas] of casos){
  const a=ambiente(['manutencoes'],linhas);const r=await a.chamar({action:'restaurar',id:'pc-1'});
  assert.equal(r.status,200,`${nome}: ${JSON.stringify(r.body)}`);assert.deepEqual(r.body,{ok:true,vinculoDesfeito:true,bemId:'bem-1'});
  assert.deepEqual(a.gravacoes.map(g=>g.nome),['painel_registro_gravar','painel_ativo_restaurar'],nome);
  assert.equal(a.gravacoes[0].p.p_colecao,'ativo_lixeira');assert.deepEqual(a.gravacoes[1].p.p_anterior,a.gravacoes[0].p.p_registro);
  const salvo=a.achar('ativo','pc-1').registro;assert.equal(Object.hasOwn(salvo,'bemId'),false,nome);
  assert.deepEqual([salvo.historicoVinculo[0].acao,salvo.historicoVinculo[0].via,salvo.historicoVinculo[0].motivo],['desvinculado','restaurar','restaurada sem o bem, que foi excluído ou ligado a outra ficha']);
 }
 const a=ambiente(['manutencoes'],[lix('bem-1'),bem('bem-1')]);const r=await a.chamar({action:'restaurar',id:'pc-1'});
 assert.deepEqual(r.body,{ok:true});assert.deepEqual(a.gravacoes.map(g=>g.nome),['painel_ativo_restaurar']);assert.equal(a.achar('ativo','pc-1').registro.bemId,'bem-1');
});

// ── Revisão adversarial do vínculo ──
// Segurança não vaza pelo bem.historico da resposta do Desfazer (nem no
// jaDesfeito, que só pede Inventário e valores); o login nunca desce.
test('desvincularFicha: o bem da resposta sai sem login e mascara a ficha de Segurança para quem não tem Segurança',async()=>{
 const sinc={acao:'sincronizado',por:'login-antigo',em:'2026-09-01'};
 const evSeg={id:'e-seg',acao:'desvinculado',bemId:'bem-1',ativoId:'cam-velha',familia:'seguranca',nome:'Câmera do cofre',bemCodigo:'ETQ-bem-1',lado:'ambos',via:'desvincularFicha',por:'login-secreto',porNome:'Pessoa',em:'2026-10-01T00:00:00.000Z'};
 let a=ambiente(['inventario-valores','patrimonio'],[bem('bem-1',{historico:[sinc,evSeg]})]);
 let r=await a.chamar(desfazer('sumida','bem-1','','v-bem-1'));
 assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.jaDesfeito,true);
 assert.doesNotMatch(JSON.stringify(r.body),/Câmera do cofre|login-secreto|cam-velha/);
 assert.deepEqual(r.body.bem.historico,[sinc,{id:'e-seg',acao:'desvinculado',bemId:'bem-1',ativoId:'',familia:'seguranca',nome:'Ficha de Segurança',bemCodigo:'ETQ-bem-1',lado:'ambos',via:'desvincularFicha',porNome:'Pessoa',em:'2026-10-01T00:00:00.000Z'}]);
 // Quem tem Segurança desfaz pelo bem: o nome fica, o login sai; o banco guarda tudo.
 a=ambiente(RAPHAEL,[L('ativo','cam-1',{tipo:'seguranca',categoria:'Câmera',nome:'Câmera do cofre',atualizadoEm:'v-cam'}),bem('bem-1',{origemAtivoId:'cam-1'})]);
 r=await a.chamar(desfazer('cam-1','bem-1','v-cam','v-bem-1'));
 assert.equal(r.status,200,JSON.stringify(r.body));
 assert.equal(r.body.bem.historico.at(-1).nome,'Câmera do cofre');assert.equal(Object.hasOwn(r.body.bem.historico.at(-1),'por'),false);
 assert.equal(a.achar('patrimonio','bem-1').registro.historico.at(-1).por,'login-ficticio');
});

// Tela antiga em cache manda o bemId do vínculo legado (só pelo bem) em toda
// edição. Bem ou ficha baixados não podem travar essa edição; só a troca de bem.
test('tela antiga: ficha ligada só pelo bem salva com bem ou ficha baixados; trocar de bem segue recusado',async()=>{
 const casos=[
  ['salvarFisico',L('ativo','pc-1',{tipo:'informatica',categoria:'Computador',nome:'PC',atualizadoEm:'v1',especificacao:{local:'Sala'}}),{id:'pc-1',nome:'PC renomeado'}],
  ['salvarTelefonia',L('ativo','tel-1',{tipo:'informatica',categoria:'Telefone',nome:'Ramal',atualizadoEm:'v1'}),{id:'tel-1',nome:'Ramal novo',categoria:'Telefone'}],
 ];
 for(const [acao,ficha,base] of casos){
  let a=ambiente(RAPHAEL,[ficha,bem('bem-1',{situacao:'baixado',origemAtivoId:ficha.id})]);
  let r=await a.chamar({action:acao,item:{...base,bemId:'bem-1'},versao:'v1'});
  assert.equal(r.status,200,`${acao}, bem baixado: ${JSON.stringify(r.body)}`);assert.equal(a.achar('ativo',ficha.id).registro.nome,base.nome);
  a=ambiente(RAPHAEL,[ficha,bem('bem-1',{origemAtivoId:ficha.id})]);
  r=await a.chamar({action:acao,item:{...base,bemId:'bem-1',especificacao:{...(ficha.registro.especificacao||{}),situacao:'baixado'}},versao:'v1'});
  assert.equal(r.status,200,`${acao}, ficha baixada: ${JSON.stringify(r.body)}`);
  a=ambiente(RAPHAEL,[ficha,bem('bem-1',{situacao:'baixado',origemAtivoId:ficha.id}),bem('bem-2')]);
  r=await a.chamar({action:acao,item:{...base,bemId:'bem-2'},versao:'v1'});
  assert.equal(r.status,409,`${acao}, troca: ${JSON.stringify(r.body)}`);assert.equal(a.gravacoes.length,0);
 }
});

// A recusa do vínculo no formulário vem marcada, para a tela mostrar o motivo
// sem travar como se fosse outra gravação.
test('salvarFisico e salvarTelefonia: recusa do vínculo vem com recusaVinculo; versão velha não',async()=>{
 const linhas=[bem('bem-baixado',{situacao:'baixado'}),L('ativo','pc-1',{tipo:'informatica',categoria:'Computador',nome:'PC',atualizadoEm:'v1',especificacao:{local:'Sala',situacao:'baixado'}}),bem('bem-1')];
 let r=await ambiente(RAPHAEL,linhas).chamar({action:'salvarFisico',item:{id:'pc-1',bemId:'bem-1'},versao:'v1'});
 assert.equal(r.status,409);assert.deepEqual(r.body,{erro:'Esta ficha está baixada e não pode ser ligada.',recusaVinculo:true});
 r=await ambiente(RAPHAEL,linhas).chamar({action:'salvarTelefonia',item:{cadastroId:ID,nome:'Ramal',categoria:'Telefone',bemId:'bem-baixado'}});
 assert.equal(r.status,409);assert.deepEqual(r.body,{erro:'Este bem está baixado e não pode ser ligado.',recusaVinculo:true});
 r=await ambiente(RAPHAEL,linhas).chamar({action:'salvarFisico',item:{id:'pc-1',nome:'PC'},versao:'velha'});
 assert.equal(r.status,409);assert.equal(Object.hasOwn(r.body,'recusaVinculo'),false);
});
