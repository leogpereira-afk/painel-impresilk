// A porta painel-marketing, executada de verdade (esbuild + vm), com banco de
// mentira. Confere quem entra, o PAPEL de quem entra (a2), o que chega no
// banco e o que volta para a tela.
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';import vm from 'node:vm';import {fileURLToPath} from 'node:url';
import {hojeSP,somarDias,segundaDaSemana} from '../supabase/functions/_shared/marketing.mjs';
const require=createRequire(import.meta.url),{buildSync}=createRequire(require.resolve('vite'))('esbuild');
const source=readFileSync(new URL('../supabase/functions/painel-marketing/index.ts',import.meta.url),'utf8').replace(/^import.*createClient.*\n/m,'const createClient=globalThis.createClient;\n').replace(/^import.*verificarJwt.*\n/m,'const {verificarJwt,crachaRevogado}=globalThis;\n');
const code=buildSync({stdin:{contents:source,loader:'ts',resolveDir:fileURLToPath(new URL('../supabase/functions/painel-marketing/',import.meta.url))},bundle:true,write:false,format:'iife',platform:'node'}).outputFiles[0].text;
const ID='7b0f6a52-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const CANAL='c0000000-0000-4000-8000-000000000002',ITEM='d0000000-0000-4000-8000-000000000001',ROTINA='d0000000-0000-4000-8000-000000000002',PUB='e0000000-0000-4000-8000-000000000001';
const hoje=hojeSP(),segunda=segundaDaSemana(hoje);

// Quem é quem no banco de mentira:
//  ana  conta com id_pessoa, sem linha de papel      -> marketing (o padrão)
//  bia  conta com id_pessoa, papel visualizacao      -> visualizacao
//  gil  conta com id_pessoa, papel gestao            -> gestao
//  dup  duas contas (direta e pelo papel do painel)  -> sem id_pessoa -> marketing
//  leo  direção, mesmo com linha "visualizacao"      -> gestao
const ANA={sub:'ana',nome:'Ana',perms:['marketing']},BIA={sub:'bia',perms:['marketing']},GIL={sub:'gil',perms:['marketing']},DUP={sub:'dup',perms:['marketing']},LEO={sub:'leo',master:true};

function setup(){
 let handler,session=ANA,revoked=false;const chamadas=[];let rpcErro=null;
 const db={
  painel_mkt_acoes:[{id:ID,nome:'Reel',canal_texto:'Instagram',responsavel_texto:'Ana',prazo:'2026-10-20',situacao:'Ideia',investimento:'0',versao:2,retirada_em:null,legado_id:null},{id:'aaaaaaaa-1c2d-4e5f-8a9b-0c1d2e3f4a5b',nome:'Retirada',prazo:'2026-10-01',situacao:'Ideia',investimento:'0',versao:1,retirada_em:'2026-10-02',legado_id:null}],
  painel_mkt_orcamento_vinculo:[{orcamento_id:'123',acao_id:ID}],
  painel_registros:[{colecao:'marketing',id:'mkt-velha',registro:{tipo:'acao',nome:'Antiga'}},{colecao:'marketing',id:'ml-1',registro:{nome:'Drive',url:'https://x.com'}}],
  acesso_conta:[{id:'c-ana',usuario:'ana',id_pessoa:'123456'},{id:'c-bia',usuario:'bia',id_pessoa:'222222'},{id:'c-gil',usuario:'gil',id_pessoa:'555555'},
   {id:'c-dup1',usuario:'dup',id_pessoa:'333333'},{id:'c-dup2',usuario:'outra',id_pessoa:'444444'},{id:'c-leo',usuario:'leo',id_pessoa:'999999'}],
  acesso_papel:[{conta_id:'c-dup2',sistema:'painel',login:'dup'},{conta_id:'c-gil',sistema:'pcp',login:'outro'}],
  painel_mkt_papeis:[{id_pessoa:'222222',papel:'visualizacao'},{id_pessoa:'555555',papel:'gestao'},{id_pessoa:'999999',papel:'visualizacao'},{id_pessoa:'333333',papel:'gestao'}],
  painel_mkt_canais:[
   {id:CANAL,codigo:'instagram',nome:'Instagram',grupo:'digital',icone:'instagram',cor:'#c13584',ordem:20,ativo:true,em_implantacao:false,url_perfil:null,url_gerenciador:null,mensagem_whatsapp:null,dias_parado:7,comercial_canal:null,versao:3},
   {id:'c0000000-0000-4000-8000-000000000001',codigo:'site',nome:'Site',grupo:'digital',icone:'globe',cor:'#0f766e',ordem:10,ativo:true,em_implantacao:false,url_perfil:'https://impresilk.com.br',dias_parado:7,versao:1}],
  painel_mkt_playbook:[
   {id:ITEM,canal_id:CANAL,codigo:'instagram-1',tipo:'unica',titulo:'Bio com UTM',instrucao:null,responsavel_id:null,recorrencia:null,a_cada_dias:null,meta_quantidade:null,prazo_dias:null,prioridade:'media',checklist:['a'],evidencia:'link',gatilho:null,implantacao:false,ativo:true,ordem:10,versao:2},
   {id:ROTINA,canal_id:CANAL,codigo:'instagram-4',tipo:'rotina',titulo:'Stories diários',recorrencia:'diaria',meta_quantidade:1,prioridade:'media',checklist:[],evidencia:'nenhuma',implantacao:false,ativo:true,ordem:40,versao:1}],
  painel_mkt_publicacoes:[
   {id:PUB,canal_id:CANAL,data:somarDias(hoje,-3),titulo:'Reel',url:'https://example.com/p/1',acao_id:null,alcance:100,impressoes:null,engajamento:5,cliques:null,leads:0,fonte:'manual',retirada_em:null,versao:1},
   {id:'e0000000-0000-4000-8000-000000000002',canal_id:CANAL,data:somarDias(hoje,-500),url:null,alcance:1,fonte:'manual',retirada_em:null,versao:1},
   {id:'e0000000-0000-4000-8000-000000000003',canal_id:CANAL,data:somarDias(hoje,-1),url:'https://example.com/p/2',fonte:'manual',retirada_em:'2026-10-01',versao:2}],
  painel_mkt_metricas_canal:[{id:'m1',canal_id:CANAL,semana:segunda,seguidores:5230,alcance:null,fonte:'manual',versao:1},{id:'m2',canal_id:CANAL,semana:somarDias(segunda,-7*40),seguidores:4000,fonte:'manual',versao:1}],
  registros:[
   {colecao:'colaboradores',apagado:false,id:'r1',nome:'Ana Exemplo',cpf:'123.456.789-01',areaId:'mk',statusId:'ativo'},
   {colecao:'colaboradores',apagado:false,id:'r2',nome:'Sem Cpf',cpf:'',statusId:'ativo'},
   {colecao:'colaboradores',apagado:true,id:'r3',nome:'Apagada',cpf:'77788899900',statusId:'ativo'},
   {colecao:'status',apagado:false,id:'ativo',contaComoAtivo:'true'},
   {colecao:'areas',apagado:false,id:'mk',nome:'Marketing'}],
 };
 const campo=(x,k)=>k==='registro->>tipo'?x.registro?.tipo:x[k];
 const sb={from(table){let rows=(db[table]||[]).map(r=>structuredClone(r));const q={
   select(){return q},eq(k,v){rows=rows.filter(x=>campo(x,k)===v);return q},is(k,v){rows=rows.filter(x=>(x[k]??null)===v);return q},
   not(k,op,v){rows=rows.filter(x=>(x[k]??null)!==v);return q},in(k,vs){rows=rows.filter(x=>vs.includes(x[k]));return q},
   gte(k,v){rows=rows.filter(x=>x[k]!=null&&x[k]>=v);return q},order(){return q},
   range(a,b){return Promise.resolve({data:rows.slice(a,b+1)})},maybeSingle(){return Promise.resolve({data:rows[0]??null})},
   then(ok,erro){return Promise.resolve({data:rows}).then(ok,erro)}};return q},
  async rpc(n,p){chamadas.push({n,p});if(rpcErro)return {error:rpcErro};
   const novoId='bbbbbbbb-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
   if(n==='painel_mkt_salvar_acao')return {data:{id:p.p_id||novoId,...p.p_dados,versao:(p.p_versao||0)+1,orcamentos:p.p_orcamentos}};
   if(n==='painel_mkt_salvar_canal')return {data:{id:p.p_id||novoId,codigo:'instagram',...Object.fromEntries(Object.entries(p.p_dados).filter(([,v])=>v!=null)),versao:(p.p_versao||0)+1}};
   if(n==='painel_mkt_salvar_playbook'||n==='painel_mkt_salvar_publicacao')return {data:{id:p.p_id||novoId,...p.p_dados,versao:(p.p_versao||0)+1}};
   if(n==='painel_mkt_concluir_playbook')return {data:{...db.painel_mkt_playbook.find(i=>i.id===p.p_id),concluido_em:p.p_feito?'2026-10-10T12:00:00Z':null,evidencia_valor:p.p_evidencia,versao:p.p_versao+1}};
   if(n==='painel_mkt_importar_publicacoes'){const ret=p.p_linhas.filter(l=>/retirada/.test(l.url||'')).map(l=>l.linha);return {data:{inseridas:p.p_linhas.length-ret.length,atualizadas:0,iguais:0,retiradas:ret}};}
   if(n==='painel_mkt_salvar_metricas')return {data:{id:'m9',canal_id:p.p_canal,semana:p.p_semana,...p.p_dados,versao:1}};
   if(n==='painel_mkt_carregar_padrao')return {data:{canais:p.p_padrao.canais.length,itens:p.p_padrao.playbook.length}};
   if(n==='painel_mkt_definir_papel')return {data:null};
   if(n==='painel_mkt_migrar_legado')return {data:{total:1,migradas:1,vinculos:0}};
   return {data:{}};}};
 vm.runInNewContext(code,{createClient:()=>sb,verificarJwt:async()=>session,crachaRevogado:async()=>revoked,Deno:{env:{get:()=> 'test'},serve:fn=>handler=fn},Response,Request,crypto,console,URL});
 return {db,chamadas,session:s=>session=s,revoke:()=>revoked=true,erro:e=>rpcErro=e,
  async call(body={},auth=true){const r=await handler(new Request('http://local',{method:'POST',headers:auth?{authorization:'Bearer test'}:{},body:typeof body==='string'?body:JSON.stringify(body)}));return {status:r.status,...await r.json()}}};
}
const rpcs=t=>t.chamadas.map(c=>c.n);
// O que sai do vm é de outro "mundo" (outro Object.prototype): compara pela cópia.
const simples=x=>JSON.parse(JSON.stringify(x));

// ---- a1 ----

test('porta: sem crachá 401, crachá revogado 401, sem o módulo 403', async()=>{
 const t=setup();assert.equal((await t.call({action:'acoes'},false)).status,401);
 t.session({sub:'x',perms:['orcamentos']});assert.equal((await t.call({action:'acoes'})).status,403);
 t.session({sub:'x',perms:['marketing']});t.revoke();assert.equal((await t.call({action:'acoes'})).status,401);
 assert.equal(t.chamadas.length,0);
});

test('lista só as ações não retiradas, com os orçamentos, e conta as antigas pendentes', async()=>{
 const t=setup(),r=await t.call({action:'acoes'});
 assert.equal(r.status,200);assert.equal(r.acoes.length,1);assert.equal(r.acoes[0].nome,'Reel');
 assert.deepEqual(r.acoes[0].orcamentos,['123']);assert.equal(r.acoes[0].canal,'Instagram');
 assert.equal(r.legado.pendentes,1);assert.equal(r.podeMigrar,false);
 t.db.painel_mkt_acoes.push({id:'cccccccc-1c2d-4e5f-8a9b-0c1d2e3f4a5b',nome:'Migrada',prazo:'2026-10-01',situacao:'Ideia',investimento:0,versao:1,retirada_em:null,legado_id:'mkt-velha'});
 assert.equal((await t.call({action:'acoes'})).legado.pendentes,0);
});

test('salvar: campos conferidos ANTES do banco; edição exige versão', async()=>{
 const t=setup();
 assert.equal((await t.call({action:'salvarAcao',acao:{nome:'',responsavel:'Ana',prazo:'2026-10-20'}})).status,422);
 assert.equal((await t.call({action:'salvarAcao',acao:{id:ID,nome:'Reel',responsavel:'Ana',prazo:'2026-10-20'}})).status,409);
 assert.equal((await t.call({action:'salvarAcao',acao:{id:'mkt-1',nome:'Reel',responsavel:'Ana',prazo:'2026-10-20'},versao:1})).status,400);
 assert.equal(t.chamadas.length,0);
 const r=await t.call({action:'salvarAcao',acao:{id:ID,nome:'Reel',responsavel:'Ana',prazo:'2026-10-20',orcamentos:['9','1','9'],investimento:10},versao:2});
 assert.equal(r.status,200);const c=t.chamadas[0];
 assert.equal(c.n,'painel_mkt_salvar_acao');assert.equal(c.p.p_id,ID);assert.equal(c.p.p_versao,2);assert.equal(c.p.p_quem,'ana');
 assert.deepEqual([...c.p.p_orcamentos],['1','9']);assert.equal(c.p.p_dados.responsavel_texto,'Ana');assert.equal(r.acao.versao,3);
});

test('nova ação vai sem id e sem versão (o banco gera o UUID)', async()=>{
 const t=setup(),r=await t.call({action:'salvarAcao',acao:{nome:'Outdoor',responsavel:'Bia',prazo:'2026-11-01'}});
 assert.equal(r.status,200);assert.equal(t.chamadas[0].p.p_id,null);assert.equal(t.chamadas[0].p.p_versao,null);
});

test('ação nova com o id da tela vai como criação (novo), sem versão', async()=>{
 const t=setup(),r=await t.call({action:'salvarAcao',novo:true,acao:{id:ID,nome:'Outdoor',responsavel:'Bia',prazo:'2026-11-01'}});
 assert.equal(r.status,200);assert.equal(t.chamadas[0].p.p_id,ID);assert.equal(t.chamadas[0].p.p_versao,null);
});

test('o caso ruim: orçamento de outra ação volta como 409 com o nome dela', async()=>{
 const t=setup();t.erro({code:'23505',message:'Orçamento já vinculado',details:JSON.stringify({orcamento:'123',acao:'Outdoor Fenics'})});
 const r=await t.call({action:'salvarAcao',acao:{nome:'Reel',responsavel:'Ana',prazo:'2026-10-20',orcamentos:['123']}});
 assert.equal(r.status,409);assert.match(r.erro,/123.*Outdoor Fenics/);
 t.erro({code:'40001',message:'Conflito de versão'});
 assert.equal((await t.call({action:'salvarAcao',acao:{id:ID,nome:'Reel',responsavel:'Ana',prazo:'2026-10-20'},versao:1})).status,409);
 t.erro({code:'XX000',message:'falha interna com dado sensível'});
 const r500=await t.call({action:'salvarAcao',acao:{nome:'Reel',responsavel:'Ana',prazo:'2026-10-20'}});
 assert.equal(r500.status,500);assert.equal(r500.erro.includes('sensível'),false);
});

test('retirar exige id válido e versão; migrar é só da direção', async()=>{
 const t=setup();
 assert.equal((await t.call({action:'retirarAcao',id:ID})).status,409);
 assert.equal((await t.call({action:'retirarAcao',id:ID,versao:2})).status,200);
 assert.equal(t.chamadas.at(-1).n,'painel_mkt_retirar_acao');
 assert.equal((await t.call({action:'migrarLegado'})).status,403);
 t.session({sub:'leo',master:true});const r=await t.call({action:'migrarLegado'});
 assert.equal(r.status,200);assert.equal(r.resultado.migradas,1);
 assert.equal((await t.call({action:'apagarTudo'})).status,400);
});

// ---- a2: o papel efetivo ----

test('papel efetivo: direção é gestão (mesmo com linha na tabela), a tabela manda, sem linha é marketing', async()=>{
 const t=setup(),papel=async s=>{t.session(s);const r=await t.call({action:'painel'});return [r.papel,r.idPessoa];};
 assert.deepEqual(await papel(LEO),['gestao','999999']);
 assert.deepEqual(await papel(ANA),['marketing','123456']);
 assert.deepEqual(await papel(BIA),['visualizacao','222222']);
 assert.deepEqual(await papel(GIL),['gestao','555555']);
 // Duas contas para o mesmo login: ninguém (nem a linha "gestao" do 333333 vale).
 assert.deepEqual(await papel(DUP),['marketing',null]);
 // Login sem conta nenhuma também cai no padrão.
 assert.deepEqual(await papel({sub:'semconta',perms:['marketing']}),['marketing',null]);
});

test('o caso ruim: visualização não grava NADA, e nenhuma função de escrita chega ao banco', async()=>{
 const t=setup();t.session(BIA);
 const pedidos=[
  {action:'salvarAcao',acao:{nome:'X',responsavel:'Bia',prazo:'2026-10-20'}},{action:'retirarAcao',id:ID,versao:2},
  {action:'salvarCanal',canal:{nome:'TikTok',grupo:'digital',icone:'globe',cor:'#000000'}},{action:'salvarPlaybook',item:{canalId:CANAL,tipo:'unica',titulo:'X'}},
  {action:'retirarPlaybook',id:ITEM,versao:2},{action:'concluirPlaybook',id:ITEM,versao:2,feito:true,evidencia:'https://example.com/x'},
  {action:'salvarPublicacao',publicacao:{canalId:CANAL,data:hoje}},{action:'retirarPublicacao',id:PUB,versao:1},
  {action:'importarPublicacoes',linhas:[{canalId:CANAL,data:hoje}]},{action:'salvarMetricas',canalId:CANAL,semana:segunda,numeros:{alcance:1}},
  {action:'definirPapel',idPessoa:'222222',papel:'gestao'},{action:'carregarPadrao'},{action:'migrarLegado'}];
 for(const p of pedidos)assert.equal((await t.call(p)).status,403,p.action);
 assert.deepEqual(rpcs(t),[]);
 // Ler continua podendo.
 assert.equal((await t.call({action:'painel'})).status,200);assert.equal((await t.call({action:'pessoas'})).status,200);
});

test('marketing lança e conclui, mas canal, playbook, papéis e carga padrão são só da gestão', async()=>{
 const t=setup();t.session(ANA);
 for(const p of [{action:'salvarCanal',canal:{nome:'TikTok',grupo:'digital',icone:'globe',cor:'#000000'}},{action:'salvarPlaybook',item:{canalId:CANAL,tipo:'unica',titulo:'X'}},
  {action:'retirarPlaybook',id:ITEM,versao:2},{action:'definirPapel',idPessoa:'222222',papel:'gestao'},{action:'carregarPadrao'}]){
  const r=await t.call(p);assert.equal(r.status,403,p.action);assert.match(r.erro,/gestão/);
 }
 assert.deepEqual(rpcs(t),[]);
 assert.equal((await t.call({action:'salvarPublicacao',publicacao:{canalId:CANAL,data:hoje}})).status,200);
 assert.equal((await t.call({action:'concluirPlaybook',id:ITEM,versao:2,feito:true,evidencia:'https://example.com/bio'})).status,200);
 // A gestão pela tabela (não direção) mexe no canal.
 t.session(GIL);assert.equal((await t.call({action:'carregarPadrao'})).status,200);
});

// ---- a2: leituras ----

test('painel: canais em ordem, publicações dos últimos 400 dias sem as retiradas, 26 semanas de números, papéis só para a gestão', async()=>{
 const t=setup();t.session(ANA);
 const r=await t.call({action:'painel'});
 assert.equal(r.status,200);assert.equal(r.hoje,hoje);
 assert.deepEqual(r.canais.map(c=>c.codigo),['site','instagram']);
 assert.equal(r.canais[1].emImplantacao,false);assert.equal(r.canais[1].versao,3);
 assert.deepEqual(r.playbook.map(i=>i.codigo),['instagram-1','instagram-4']);
 assert.deepEqual(r.publicacoes.map(p=>p.id),[PUB]);
 assert.equal(r.publicacoes[0].impressoes,null,'número não informado continua nulo');assert.equal(r.publicacoes[0].leads,0);
 assert.deepEqual(r.metricas.map(m=>m.id),['m1']);
 assert.equal(r.acoes.length,1);assert.equal(r.acoes[0].canalId,null);assert.equal(r.legado.pendentes,1);assert.equal(r.podeMigrar,false);
 assert.deepEqual(r.papeis,[]);
 t.session(GIL);const g=await t.call({action:'painel'});
 assert.equal(g.papeis.length,4);assert.deepEqual(Object.keys(g.papeis[0]).sort(),['definidoEm','definidoPor','idPessoa','papel']);
});

test('o caso ruim: a lista de pessoas não leva CPF; id calculado no servidor; apagada e sem CPF ficam fora', async()=>{
 const t=setup(),r=await t.call({action:'pessoas'});
 assert.equal(r.status,200);
 assert.deepEqual(r.pessoas,[{idPessoa:'123456',nome:'Ana Exemplo',area:'Marketing'}]);
 assert.equal(r.semId,1);
 const texto=JSON.stringify(r);
 assert.equal(texto.includes('12345678901'),false);assert.equal(texto.includes('789'),false);assert.equal(/cpf/i.test(texto),false);
});

// ---- a2: canais ----

test('canal novo: código sai do nome, conferido antes do banco; edição junta o que veio com o que está gravado', async()=>{
 const t=setup();t.session(LEO);
 assert.equal((await t.call({action:'salvarCanal',canal:{nome:'TikTok',grupo:'digital',icone:'foguete',cor:'#000000'}})).status,422);
 assert.equal((await t.call({action:'salvarCanal',canal:'x'})).status,400);
 assert.deepEqual(rpcs(t),[]);
 const novo=await t.call({action:'salvarCanal',canal:{nome:'Google Meu Negócio',grupo:'digital',icone:'map-pin',cor:'#34A853'}});
 assert.equal(novo.status,200);
 let c=t.chamadas.at(-1);assert.equal(c.p.p_id,null);assert.equal(c.p.p_versao,null);assert.equal(c.p.p_dados.codigo,'google-meu-negocio');assert.equal(c.p.p_dados.cor,'#34a853');
 // Só a ordem: o resto vem do banco, nada é zerado.
 const r=await t.call({action:'salvarCanal',canal:{id:CANAL,ordem:5},versao:3});
 assert.equal(r.status,200);c=t.chamadas.at(-1);
 assert.equal(c.p.p_versao,3);assert.equal(c.p.p_dados.nome,'Instagram');assert.equal(c.p.p_dados.ordem,5);assert.equal(c.p.p_dados.cor,'#c13584');assert.equal(c.p.p_dados.ativo,true);
 assert.equal(r.canal.ordem,5);
 assert.equal((await t.call({action:'salvarCanal',canal:{id:CANAL,ordem:5}})).status,409);
 assert.equal((await t.call({action:'salvarCanal',canal:{id:CANAL,codigo:'insta'},versao:3})).status,422);
 assert.equal((await t.call({action:'salvarCanal',canal:{id:'c0000000-0000-4000-8000-0000000000ff',ordem:1},versao:1})).status,404);
 // Criação com o id da tela: sem versão.
 await t.call({action:'salvarCanal',novo:true,canal:{id:'c0000000-0000-4000-8000-0000000000aa',nome:'Loja',grupo:'offline',icone:'store',cor:'#111111'}});
 c=t.chamadas.at(-1);assert.equal(c.p.p_id,'c0000000-0000-4000-8000-0000000000aa');assert.equal(c.p.p_versao,null);
 t.erro({code:'23505',message:'duplicate key value violates unique constraint "painel_mkt_canais_codigo"'});
 const dup=await t.call({action:'salvarCanal',canal:{nome:'Instagram',grupo:'digital',icone:'instagram',cor:'#c13584'}});
 assert.equal(dup.status,409);assert.match(dup.erro,/código/);
});

// ---- a2: playbook ----

test('playbook: criar, editar só um campo sem perder o resto, retirar com versão', async()=>{
 const t=setup();t.session(GIL);
 assert.equal((await t.call({action:'salvarPlaybook',item:{canalId:CANAL,tipo:'rotina',titulo:'Pins'}})).status,422);
 assert.deepEqual(rpcs(t),[]);
 const r=await t.call({action:'salvarPlaybook',item:{canalId:CANAL,tipo:'rotina',titulo:'10 pins',recorrencia:'semanal',metaQuantidade:10}});
 assert.equal(r.status,200);assert.equal(r.item.metaQuantidade,10);
 const e=await t.call({action:'salvarPlaybook',item:{id:ITEM,titulo:'Bio com UTM e WhatsApp'},versao:2});
 assert.equal(e.status,200);const c=t.chamadas.at(-1);
 assert.equal(c.p.p_dados.titulo,'Bio com UTM e WhatsApp');assert.equal(c.p.p_dados.evidencia,'link');assert.deepEqual(simples(c.p.p_dados.checklist),['a']);assert.equal(c.p.p_dados.canal_id,CANAL);
 assert.equal((await t.call({action:'salvarPlaybook',item:{id:ITEM,titulo:'X'}})).status,409);
 assert.equal((await t.call({action:'retirarPlaybook',id:ITEM})).status,409);
 assert.equal((await t.call({action:'retirarPlaybook',id:'instagram-1',versao:2})).status,400);
 assert.equal((await t.call({action:'retirarPlaybook',id:ITEM,versao:2})).status,200);
 assert.equal(t.chamadas.at(-1).n,'painel_mkt_retirar_playbook');
});

test('o caso ruim: concluir item que pede link sem o link não chega ao banco; rotina não se conclui aqui', async()=>{
 const t=setup();
 const sem=await t.call({action:'concluirPlaybook',id:ITEM,versao:2,feito:true});
 assert.equal(sem.status,422);assert.match(sem.erro,/link/);
 assert.equal((await t.call({action:'concluirPlaybook',id:ROTINA,versao:1,feito:true})).status,422);
 assert.equal((await t.call({action:'concluirPlaybook',id:ITEM,feito:true,evidencia:'https://example.com/x'})).status,409);
 assert.equal((await t.call({action:'concluirPlaybook',id:'d0000000-0000-4000-8000-0000000000ff',versao:1,feito:true})).status,404);
 assert.deepEqual(rpcs(t),[]);
 const ok=await t.call({action:'concluirPlaybook',id:ITEM,versao:2,feito:true,evidencia:'https://example.com/bio'});
 assert.equal(ok.status,200);assert.equal(ok.item.evidenciaValor,'https://example.com/bio');assert.ok(ok.item.concluidoEm);
 const c=t.chamadas.at(-1);assert.equal(c.p.p_feito,true);assert.equal(c.p.p_quem,'ana');
 // Desmarcar não pede evidência.
 assert.equal((await t.call({action:'concluirPlaybook',id:ITEM,versao:3,feito:false})).status,200);
 assert.equal(t.chamadas.at(-1).p.p_evidencia,null);
});

// ---- a2: publicações ----

test('publicação: link normalizado, fonte manual, edição junta com o gravado, retirada não se edita', async()=>{
 const t=setup();
 const r=await t.call({action:'salvarPublicacao',publicacao:{canalId:CANAL,data:hoje,url:'https://example.com/p/9/?igsh=abc',alcance:'250'}});
 assert.equal(r.status,200);let c=t.chamadas.at(-1);
 assert.equal(c.p.p_dados.url,'https://example.com/p/9');assert.equal(c.p.p_dados.fonte,'manual');assert.equal(c.p.p_dados.alcance,250);assert.equal(c.p.p_dados.impressoes,null);
 const e=await t.call({action:'salvarPublicacao',publicacao:{id:PUB,cliques:12},versao:1});
 assert.equal(e.status,200);c=t.chamadas.at(-1);
 assert.equal(c.p.p_dados.cliques,12);assert.equal(c.p.p_dados.alcance,100);assert.equal(c.p.p_dados.impressoes,null);assert.equal(c.p.p_dados.url,'https://example.com/p/1');
 assert.equal((await t.call({action:'salvarPublicacao',publicacao:{id:'e0000000-0000-4000-8000-000000000003',cliques:1},versao:2})).status,404);
 assert.equal((await t.call({action:'salvarPublicacao',publicacao:{canalId:CANAL,data:hoje,alcance:-5}})).status,422);
 t.erro({code:'23505',message:'duplicate key value violates unique constraint "painel_mkt_publicacoes_canal_url"'});
 const dup=await t.call({action:'salvarPublicacao',publicacao:{canalId:CANAL,data:hoje,url:'https://example.com/p/1'}});
 assert.equal(dup.status,409);assert.equal(dup.erro,'Esta publicação já foi lançada neste canal. Procure no Histórico do canal e edite por lá.');
 t.erro(null);
 assert.equal((await t.call({action:'retirarPublicacao',id:PUB})).status,409);
 assert.equal((await t.call({action:'retirarPublicacao',id:PUB,versao:1})).status,200);
});

test('o caso ruim: CSV com linha ruim, canal desconhecido e link repetido; as boas entram e as ruins voltam com motivo', async()=>{
 const t=setup();
 const linhas=[
  {linha:2,canalId:CANAL,data:hoje,url:'https://example.com/p/1',alcance:'10'},
  {linha:3,canalId:CANAL,data:hoje,url:'https://example.com/p/1/?utm_source=x'},          // o mesmo link da linha 2
  {linha:4,canalId:'c0000000-0000-4000-8000-0000000000ff',data:hoje},                       // canal que não existe
  {linha:5,canalId:CANAL,data:'31/02/2026'},                                               // data ruim
  {linha:6,canalId:CANAL,data:hoje,alcance:'mil'},                                         // número ruim
  {linha:7,canalId:CANAL,data:hoje,titulo:'sem link'},
  {linha:8,canalId:CANAL,data:hoje,url:'https://example.com/retirada'}];
 const r=await t.call({action:'importarPublicacoes',linhas});
 assert.equal(r.status,200);assert.equal(r.inseridas,2);
 assert.deepEqual(r.recusadas.map(x=>x.linha),[3,4,5,6,8]);
 assert.match(r.recusadas[0].motivo,/linha 2/);assert.match(r.recusadas[1].motivo,/Canal não encontrado/);
 assert.match(r.recusadas[2].motivo,/data/);assert.match(r.recusadas[3].motivo,/alcance/);assert.match(r.recusadas[4].motivo,/retirada/);
 const c=t.chamadas.at(-1);
 assert.equal(c.n,'painel_mkt_importar_publicacoes');assert.deepEqual(simples(c.p.p_linhas.map(l=>l.linha)),[2,7,8]);
 assert.ok(c.p.p_linhas.every(l=>!('acao_id' in l)));
 // Tudo ruim: nada vai ao banco.
 const n=t.chamadas.length;
 const ruim=await t.call({action:'importarPublicacoes',linhas:[{canalId:CANAL,data:'x'}]});
 assert.equal(ruim.status,200);assert.equal(ruim.inseridas,0);assert.deepEqual(ruim.recusadas.map(x=>x.linha),[1]);assert.equal(t.chamadas.length,n);
 assert.equal((await t.call({action:'importarPublicacoes',linhas:[]})).status,422);
 assert.equal((await t.call({action:'importarPublicacoes',linhas:Array.from({length:2001},()=>({canalId:CANAL,data:hoje}))})).status,422);
});

test('pedido grande demais é recusado antes de ler', async()=>{
 const t=setup();
 const r=await t.call(JSON.stringify({action:'importarPublicacoes',linhas:[{titulo:'x'.repeat(2000001)}]}));
 assert.equal(r.status,413);assert.deepEqual(rpcs(t),[]);
});

// ---- a2: números da semana, papéis e carga padrão ----

test('números da semana: só os números que vieram, fonte manual; semana que não é segunda é recusada', async()=>{
 const t=setup();
 assert.equal((await t.call({action:'salvarMetricas',canalId:CANAL,semana:somarDias(segunda,2),numeros:{alcance:1}})).status,422);
 assert.equal((await t.call({action:'salvarMetricas',canalId:CANAL,semana:segunda,numeros:{}})).status,422);
 assert.deepEqual(rpcs(t),[]);
 const r=await t.call({action:'salvarMetricas',canalId:CANAL,semana:segunda,numeros:{seguidores:'5300',leads:null}});
 assert.equal(r.status,200);const c=t.chamadas.at(-1);
 assert.deepEqual(simples(c.p.p_dados),{seguidores:5300,leads:null,fonte:'manual'});assert.equal(c.p.p_semana,segunda);assert.equal(c.p.p_canal,CANAL);
 assert.equal(r.metricas.seguidores,5300);assert.equal(r.metricas.alcance,null);
 t.erro({code:'P0002',message:'Canal não encontrado'});
 const sumiu=await t.call({action:'salvarMetricas',canalId:CANAL,semana:segunda,numeros:{alcance:1}});
 assert.equal(sumiu.status,404);assert.match(sumiu.erro,/canal/);
});

test('papel: a gestão define e tira; papel ausente não apaga ninguém', async()=>{
 const t=setup();t.session(GIL);
 assert.equal((await t.call({action:'definirPapel',idPessoa:'222222'})).status,422);
 assert.equal((await t.call({action:'definirPapel',idPessoa:'222222',papel:'dono'})).status,422);
 assert.deepEqual(rpcs(t),[]);
 assert.equal((await t.call({action:'definirPapel',idPessoa:'222222',papel:'marketing'})).status,200);
 assert.deepEqual(simples(t.chamadas.at(-1).p),{p_id_pessoa:'222222',p_papel:'marketing',p_quem:'gil'});
 assert.equal((await t.call({action:'definirPapel',idPessoa:'222222',papel:null})).status,200);
 assert.equal(t.chamadas.at(-1).p.p_papel,null);
});

test('carga padrão: vai a da especificação, já conferida, com os itens apontando para o canal pelo código', async()=>{
 const t=setup();t.session(LEO);
 const r=await t.call({action:'carregarPadrao'});
 assert.equal(r.status,200);assert.equal(r.canais,11);assert.ok(r.itens>20);
 const p=t.chamadas.at(-1).p.p_padrao;
 assert.equal(p.canais.length,11);assert.ok(p.playbook.every(i=>i.canal&&i.codigo&&!('canal_id' in i)));
});

test('ação com canal e responsável por id; canal que sumiu volta 404 dizendo que é o canal', async()=>{
 const t=setup();
 const r=await t.call({action:'salvarAcao',acao:{id:ID,nome:'Reel',responsavelId:'123456',prazo:'2026-10-20',canalId:CANAL},versao:2});
 assert.equal(r.status,200);const c=t.chamadas.at(-1);
 assert.equal(c.p.p_dados.canal_id,CANAL);assert.equal(c.p.p_dados.responsavel_id,'123456');assert.equal('responsavel_texto' in c.p.p_dados,false);
 assert.equal(r.acao.canalId,CANAL);assert.equal(r.acao.responsavelId,'123456');
 t.erro({code:'P0002',message:'Canal não encontrado'});
 const sumiu=await t.call({action:'salvarAcao',acao:{nome:'Reel',responsavelId:'123456',prazo:'2026-10-20',canalId:CANAL}});
 assert.equal(sumiu.status,404);assert.match(sumiu.erro,/canal não existe/);
});
