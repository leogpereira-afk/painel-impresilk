import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import vm from 'node:vm';
import {prepararControle,carimbarPatrimonio} from '../supabase/functions/_shared/patrimonio-controles.mjs';

// Exercita o handler real; apenas autenticação e transporte ao banco são simulados.
function ambiente(sessao={sub:'ana',nome:'Ana Exemplo',perms:['patrimonio']}) {
 const linhas=[],lixeira=[];let handler;let erroRpc=null,antesGravar=null;
 const sb={from(tabela){
  assert.equal(tabela,'painel_registros');const filtros=[];let inicio=0,fim=Infinity;
  const q={select(){return q;},eq(k,v){filtros.push([k,v]);return q;},order(){return q;},range(a,b){inicio=a;fim=b;return q;},limit(n){fim=n-1;return q;},
   async maybeSingle(){return {data:resultado()[0]??null,error:null};},then(a,b){return Promise.resolve({data:resultado().slice(inicio,fim+1),error:null}).then(a,b);}};
  function resultado(){return structuredClone(linhas.filter(r=>filtros.every(([k,v])=>(k.startsWith('registro->>')?r.registro[k.slice(11)]:r[k])===v)));}return q;
 },async rpc(nome,p){
  if(erroRpc)return{error:erroRpc};
  if(antesGravar&&nome==='painel_registro_gravar')await antesGravar();
  const i=linhas.findIndex(r=>r.colecao===p.p_colecao&&r.id===p.p_id);
  if(nome==='painel_registro_retirar'){if(i>=0)lixeira.push(linhas.splice(i,1)[0]);return{error:null};}
  assert.equal(nome,'painel_registro_gravar');
  if(JSON.stringify(linhas[i]?.registro??null)!==JSON.stringify(p.p_anterior))return{error:{code:'40001',message:'concorrência'}};
  if(p.p_colecao==='patrimonio_controles'&&linhas.some((r,j)=>j!==i&&r.colecao===p.p_colecao&&r.registro.tipo===p.p_registro.tipo&&r.registro.numeroChave===p.p_registro.numeroChave))return{error:{code:'23505',message:'número duplicado'}};
  const r={colecao:p.p_colecao,id:p.p_id,registro:structuredClone(p.p_registro)};if(i>=0)linhas[i]=r;else linhas.push(r);return{error:null};
 }};
 const fonte=readFileSync(new URL('../supabase/functions/painel-config/index.ts',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'');
 vm.runInNewContext(transformSync(fonte,{loader:'ts',format:'esm',target:'es2022'}).code,{Deno:{env:{get:k=>k==='PAINEL_JWT_SECRET'?'teste':undefined},serve:f=>{handler=f;}},createClient:()=>sb,verificarJwt:async()=>sessao,crachaRevogado:async()=>false,prepararControle,carimbarPatrimonio,Response,Request,console});
 return {linhas,lixeira,falharRpc:erro=>{erroRpc=erro;},antesGravar:acao=>{antesGravar=acao;},async chamar(corpo){const resp=await handler(new Request('http://local',{method:'POST',headers:{authorization:'Bearer teste','Content-Type':'application/json'},body:JSON.stringify(corpo)}));return{status:resp.status,body:await resp.json()};}};
}
const novo={tipo:'celulares',numero:'(38) 99999-0000',modelo:'Galaxy A15',pessoa:'Ana',versaoAnterior:null};
const salvar=(a,id,campos=novo)=>a.chamar({action:'merge',chave:'patrimonio_controles',patch:{[id]:campos}});
test('handler cria, edita, lista e retira um celular com autoria da sessão',async()=>{
 const a=ambiente();let r=await salvar(a,'cel1',{...novo,atualizadoPorNome:'Falso'});assert.equal(r.status,200);
 const criado=r.body.valor.cel1;assert.equal(criado.atualizadoPorNome,'Ana Exemplo');assert.equal(criado.modelo,'Galaxy A15');
 r=await salvar(a,'cel1',{...novo,pessoa:'Bruno',versaoAnterior:criado.atualizadoEm});assert.equal(r.status,200);assert.equal(r.body.valor.cel1.pessoa,'Bruno');
 r=await a.chamar({action:'get',chave:'patrimonio_controles'});assert.equal(Object.keys(r.body.valor).length,1);
 r=await a.chamar({action:'removerId',chave:'patrimonio_controles',id:'cel1'});assert.equal(r.status,200);assert.equal(a.linhas.length,0);assert.equal(a.lixeira.length,1);
});
test('handler recusa usuário sem módulo e sessão ausente em leitura, edição e remoção',async()=>{
 for(const sessao of [null,{sub:'outro',perms:['orcamentos']}])for(const action of ['get','merge','removerId','set']){
  const a=ambiente(sessao);const r=await a.chamar({action,chave:'patrimonio_controles',patch:{cel1:novo},id:'cel1',valor:{cel1:novo}});
  assert.ok([401,403].includes(r.status),`${action}: ${r.status}`);assert.equal(a.linhas.length,0);
 }
});
test('handler traduz duplicidade e rejeita edição desatualizada sem perder dados',async()=>{
 const a=ambiente();await salvar(a,'cel1');let r=await salvar(a,'cel2',{...novo,numero:'38999990000'});assert.equal(r.status,409);assert.match(r.body.erro,/número/);
 r=await salvar(a,'cel1',{...novo,pessoa:'Não gravar'});assert.equal(r.status,409);assert.equal(a.linhas[0].registro.pessoa,'Ana');
 r=await salvar(a,'arm1',{tipo:'armarios',numero:'1',pessoa:'Ana',versaoAnterior:null});assert.equal(r.status,200);
 r=await salvar(a,'cama1',{tipo:'camas',numero:'1',pessoa:'Ana',versaoAnterior:null});assert.equal(r.status,200);
});
test('transferência preserva etiqueta e valor; setor com bens não pode ser removido',async()=>{
 const a=ambiente();a.linhas.push({colecao:'setores',id:'s2',registro:{sigla:'ADM',nome:'Administrativo'}},{colecao:'setores',id:'s1',registro:{sigla:'PRO',nome:'Produção'}},{colecao:'patrimonio',id:'b1',registro:{codigo:'PRO-001',setorSigla:'PRO',valor:100,situacao:'baixado'}});
 let r=await a.chamar({action:'removerId',chave:'setores',id:'s1'});assert.equal(r.status,409);
 r=await a.chamar({action:'merge',chave:'patrimonio',patch:{b1:{setorSigla:'ADM'}}});assert.equal(r.status,200);assert.equal(r.body.valor.b1.codigo,'PRO-001');assert.equal(r.body.valor.b1.valor,100);assert.equal(r.body.valor.b1.atualizadoPor,'ana');
});


test('setor inexistente não recebe vínculo, e legado sem setor pode editar outro campo',async()=>{
 const a=ambiente();a.linhas.push({colecao:'patrimonio',id:'b1',registro:{codigo:'PRO-001',setorSigla:'ANTIGO',valor:100}});
 let r=await a.chamar({action:'merge',chave:'patrimonio',patch:{b1:{setorSigla:'APAGADO'}}});
 assert.equal(r.status,409);assert.match(r.body.erro,/setor.*não existe/);assert.equal(a.linhas[0].registro.setorSigla,'ANTIGO');
 r=await a.chamar({action:'merge',chave:'patrimonio',patch:{b1:{valor:200}}});assert.equal(r.status,200);assert.equal(a.linhas[0].registro.valor,200);assert.equal(a.linhas[0].registro.setorSigla,'ANTIGO');
 r=await a.chamar({action:'merge',chave:'patrimonio',patch:{b1:{setorSigla:'ANTIGO',valor:300}}});assert.equal(r.status,200);assert.equal(a.linhas[0].registro.valor,300);
});

test('conflito de vínculo no banco volta como 409, inclusive após validação inicial',async()=>{
 const a=ambiente();a.linhas.push({colecao:'setores',id:'s1',registro:{sigla:'ADM',nome:'Administrativo'}},{colecao:'patrimonio',id:'b1',registro:{codigo:'PRO-001',setorSigla:'ANTIGO'}});
 a.falharRpc({code:'23503',message:'setor removido durante o vínculo'});
 const r=await a.chamar({action:'merge',chave:'patrimonio',patch:{b1:{setorSigla:'ADM'}}});
 assert.equal(r.status,409);assert.match(r.body.erro,/vínculo com o setor/);assert.equal(a.linhas[1].registro.setorSigla,'ANTIGO');
});

test('handler mantém acervo, entrega e avaliação da caixa ao trocar responsável e rejeita autoria forjada',async()=>{
 const a=ambiente();const base={tipo:'ferramentas',numero:'1',pessoa:'Ana',versaoAnterior:null};
 let r=await salvar(a,'cx1',{...base,operacaoCaixa:{tipo:'itemSalvar',item:{nome:'Alicate',quantidade:3,estado:'bom',atualizadoPorNome:'Falso'}}});
 assert.equal(r.status,200);let caixa=r.body.valor.cx1;const itemId=caixa.acervo[0].id;
 r=await salvar(a,'cx1',{...base,versaoAnterior:caixa.atualizadoEm,operacaoCaixa:{tipo:'entrega',itemId,quantidade:1,pessoa:'Bruno',data:'2026-01-01',estado:'bom',criadoPor:'outro'}});
 assert.equal(r.status,200);caixa=r.body.valor.cx1;assert.equal(caixa.movimentacoes[0].criadoPor,'ana');
 r=await salvar(a,'cx1',{...base,versaoAnterior:caixa.atualizadoEm,operacaoCaixa:{tipo:'avaliar',data:'2026-01-01',proximaData:'2026-02-01',itens:[{itemId,quantidadeConferida:2,estado:'bom'}],criadoPorNome:'Falso'}});
 assert.equal(r.status,200);caixa=r.body.valor.cx1;assert.equal(caixa.avaliacoes[0].criadoPorNome,'Ana Exemplo');assert.equal(caixa.avaliacoes[0].itens[0].quantidadeEsperada,2);
 r=await salvar(a,'cx1',{...base,pessoa:'Maria',numero:'2',versaoAnterior:caixa.atualizadoEm,acervo:[],movimentacoes:[],avaliacoes:[]});
 assert.equal(r.status,200);const editada=r.body.valor.cx1;assert.equal(editada.pessoa,'Maria');assert.equal(editada.numero,'2');
 for(const campo of ['acervo','movimentacoes','avaliacoes'])assert.deepEqual(editada[campo],caixa[campo]);
 const antes=structuredClone(editada);
 r=await salvar(a,'cx1',{...base,versaoAnterior:editada.atualizadoEm,operacaoCaixa:{tipo:'devolucao',itemId,quantidade:1,pessoa:'Maria',data:'2026-01-01',estado:'bom'}});
 assert.equal(r.status,422);assert.deepEqual(a.linhas[0].registro,antes);
});

test('duas entregas concorrentes usam CAS: somente uma grava; reenvio antigo e saldo excedido são recusados',async()=>{
 const a=ambiente();const base={tipo:'ferramentas',numero:'1',pessoa:'Ana',versaoAnterior:null};
 const criado=await salvar(a,'cx1',{...base,operacaoCaixa:{tipo:'itemSalvar',item:{nome:'Alicate',quantidade:2,estado:'bom'}}});
 assert.equal(criado.status,200);const caixa=criado.body.valor.cx1,itemId=caixa.acervo[0].id;
 let chegadas=0,liberar;const todosProntos=new Promise(resolve=>{liberar=resolve;});
 a.antesGravar(async()=>{if(++chegadas===2)liberar();await todosProntos;});
 const campos={...base,versaoAnterior:caixa.atualizadoEm,operacaoCaixa:{tipo:'entrega',itemId,quantidade:2,pessoa:'Bruno',data:'2026-01-01',estado:'bom'}};
 const respostas=await Promise.all([salvar(a,'cx1',campos),salvar(a,'cx1',{...campos,operacaoCaixa:{...campos.operacaoCaixa,pessoa:'Maria'}})]);
 assert.deepEqual(respostas.map(r=>r.status).sort(),[200,409]);
 assert.equal(a.linhas[0].registro.movimentacoes.length,1);
 a.antesGravar(null);
 let r=await salvar(a,'cx1',campos);assert.equal(r.status,409);
 r=await salvar(a,'cx1',{...campos,versaoAnterior:a.linhas[0].registro.atualizadoEm});assert.equal(r.status,422);assert.match(r.body.erro,/saldo disponível/);
 assert.equal(a.linhas[0].registro.movimentacoes.length,1);
});

test('handler recusa datas anteriores ao histórico sem tentar gravar e permite eventos no mesmo dia',async()=>{
 const a=ambiente(),base={tipo:'ferramentas',numero:'1',pessoa:'Ana',versaoAnterior:null};
 let r=await salvar(a,'cx1',{...base,operacaoCaixa:{tipo:'itemSalvar',item:{nome:'Alicate',quantidade:3,estado:'bom'}}});
 assert.equal(r.status,200);let caixa=r.body.valor.cx1;const itemId=caixa.acervo[0].id;
 const movimento={tipo:'entrega',itemId,quantidade:1,pessoa:'Bruno',data:'2026-01-02',estado:'bom'};
 r=await salvar(a,'cx1',{...base,versaoAnterior:caixa.atualizadoEm,operacaoCaixa:movimento});
 assert.equal(r.status,200);caixa=r.body.valor.cx1;
 let tentativas=0;a.antesGravar(()=>{tentativas++;});
 for(const tipo of ['entrega','devolucao']){
  r=await salvar(a,'cx1',{...base,versaoAnterior:caixa.atualizadoEm,operacaoCaixa:{...movimento,tipo,data:'2026-01-01'}});
  assert.equal(r.status,422);assert.match(r.body.erro,/anterior/);assert.deepEqual(a.linhas[0].registro,caixa);
 }
 const avaliacao={tipo:'avaliar',data:'2026-01-01',proximaData:'2026-02-01',itens:[{itemId,quantidadeConferida:2,estado:'bom'}]};
 r=await salvar(a,'cx1',{...base,versaoAnterior:caixa.atualizadoEm,operacaoCaixa:avaliacao});
 assert.equal(r.status,422);assert.equal(tentativas,0);assert.deepEqual(a.linhas[0].registro,caixa);
 r=await salvar(a,'cx1',{...base,versaoAnterior:caixa.atualizadoEm,operacaoCaixa:{...avaliacao,data:'2026-01-03'}});
 assert.equal(r.status,200);caixa=r.body.valor.cx1;tentativas=0;
 for(const operacaoCaixa of [{...movimento,tipo:'devolucao'},{...avaliacao,data:'2026-01-02'}]){
  r=await salvar(a,'cx1',{...base,versaoAnterior:caixa.atualizadoEm,operacaoCaixa});
  assert.equal(r.status,422);assert.match(r.body.erro,/anterior/);assert.deepEqual(a.linhas[0].registro,caixa);
 }
 assert.equal(tentativas,0);
 r=await salvar(a,'cx1',{...base,versaoAnterior:caixa.atualizadoEm,operacaoCaixa:{...movimento,tipo:'devolucao',data:'2026-01-03'}});
 assert.equal(r.status,200);assert.equal(tentativas,1);assert.equal(r.body.valor.cx1.movimentacoes.length,2);
});
