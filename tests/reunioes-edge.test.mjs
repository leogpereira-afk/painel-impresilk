import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';import vm from 'node:vm';import {fileURLToPath} from 'node:url';
import {gerarPdfPresenca} from '../src/lib/pdfPresenca.js';
const require=createRequire(import.meta.url),{buildSync}=createRequire(require.resolve('vite'))('esbuild');
const source=readFileSync(new URL('../supabase/functions/painel-reunioes/index.ts',import.meta.url),'utf8').replace(/^import.*createClient.*\n/m,'const createClient=globalThis.createClient;\n').replace(/^import.*verificarJwt.*\n/m,'const {verificarJwt,crachaRevogado}=globalThis;\n');
const code=buildSync({stdin:{contents:source,loader:'ts',resolveDir:fileURLToPath(new URL('../supabase/functions/painel-reunioes/',import.meta.url))},bundle:true,write:false,format:'iife',platform:'node'}).outputFiles[0].text;
function setup(){let handler,session={sub:'ana',nome:'Ana',perms:['reunioes']},revoked=false,conflict=false,collision=null;const rows=new Map(),files=new Map();let uploads=0;const rh={colaboradores:[{id:'rh-1',nome:'Pessoa RH',statusId:'ativo',areaId:'fin',cargoId:'analista'}],status:[{id:'ativo',contaComoAtivo:'true'}],areas:[{id:'fin',nome:'Financeiro'}],cargos:[{id:'analista',nome:'Analista'}]},queries=[],accounts=[{id:'c1',usuario:'ana',colaborador_id:'rh-1',ativo:true}],aliases=[];
 const sb={from(tabela){let id,colecao,colunasQuery='',de,ate,contido;const filters=[];const result=()=>({data:(tabela==='acesso_conta'?accounts:tabela==='acesso_papel'?aliases:[]).filter(x=>filters.every(([k,v])=>String(x[k]).toLowerCase()===String(v).toLowerCase()))});const q={select(colunas){colunasQuery=colunas;queries.push({tabela,colunas});return q},eq(k,v){filters.push([k,v]);if(k==='id')id=v;if(k==='colecao')colecao=v;return q},ilike(k,v){filters.push([k,v.replace(/\\([\\%_])/g,'$1')]);return q},gte(k,v){de=v;return q},lte(k,v){ate=v;return q},contains(k,v){contido=v;return q},limit(){return Promise.resolve(result())},order(){return q},range(a,b){return Promise.resolve({data:tabela==='registros'?(rh[colecao]||[]).slice(a,b+1):[...rows].filter(([,r])=>!contido||(r.situacao==='agendado'&&r.data>=de&&r.data<=ate&&r.participantes.some(p=>p.rhId===contido.participantes[0].rhId))).slice(a,b+1).map(([id,registro])=>colunasQuery.includes('titulo:')?{...registro,id}:{id,registro})})},maybeSingle(){return Promise.resolve(tabela==='acesso_conta'?{data:result().data[0]||null}:{data:rows.has(id)?{registro:rows.get(id)}:null})}};return q},async rpc(n,p){if(collision){const mutate=collision;collision=null;mutate(rows);return {error:{code:'40001'}};}if(conflict||JSON.stringify(rows.get(p.p_id)||null)!==JSON.stringify(p.p_anterior))return {error:{code:'40001'}};rows.set(p.p_id,p.p_registro);return {}},storage:{from(){return {async upload(k,v){uploads++;files.set(k,v);return {}},async remove(ks){ks.forEach(k=>files.delete(k));return {}},async createSignedUrl(k){return {data:{signedUrl:'https://private.example/'+k}}}}}}};
 vm.runInNewContext(code,{createClient:()=>sb,verificarJwt:async()=>session,crachaRevogado:async()=>revoked,Deno:{env:{get:()=> 'test'},serve:fn=>handler=fn},Response,Request,crypto,atob,Uint8Array,console});
 return {rows,files,rh,queries,accounts,aliases,collide:fn=>collision=fn,get uploads(){return uploads},session:s=>session=s,revoke:()=>revoked=true,conflict:()=>conflict=true,async call(body,auth=true){const r=await handler(new Request('http://local',{method:'POST',headers:auth?{authorization:'Bearer test'}:{},body:JSON.stringify(body)}));return {status:r.status,...await r.json()}}};}
const item=()=>({id:'r1',titulo:'Reunião',tipo:'reuniao',situacao:'agendado',data:'2026-10-06',inicio:'09:00',fim:'10:00',responsavel:'Ana',participantes:[],decisoes:[]});
test('servidor exige sessão e módulo para consultar ou alterar',async()=>{const t=setup();assert.equal((await t.call({action:'listar'},false)).status,401);t.session({sub:'bia',perms:['agenda']});assert.equal((await t.call({action:'listar'})).status,403);t.session({sub:'ana',perms:['reunioes']});t.revoke();assert.equal((await t.call({action:'listar'})).status,401);});
test('ciclo persistido: cadastro, edição, ata, registros e anexo privado',async()=>{const t=setup();let r=(await t.call({action:'salvar',item:item()})).item;assert.equal(r.criadoPor,'ana');assert.equal((await t.call({action:'listar'})).itens.length,1);r=(await t.call({action:'salvar',item:{...r,ata:'Ata aprovada',versaoAnterior:r.versao}})).item;assert.equal(r.ata,'Ata aprovada');r=(await t.call({action:'registro',id:r.id,versao:r.versao,texto:'Ação concluída'})).item;assert.equal(r.registros[0].nome,'Ana');r=(await t.call({action:'anexar',id:r.id,versao:r.versao,nome:'ata.pdf',mime:'application/pdf',base64:btoa('%PDF-test')})).item;assert.equal(t.files.size,1);assert.equal((await t.call({action:'arquivo',id:r.id,arquivoId:r.anexos[0].id})).status,200);assert.equal((await t.call({action:'arquivo',id:r.id,arquivoId:'outra'})).status,404);});
test('outro leitor não altera ata nem anexa; conflito não sobrescreve e limpa upload',async()=>{const t=setup(),r=(await t.call({action:'salvar',item:item()})).item;t.session({sub:'bia',perms:['reunioes']});assert.equal((await t.call({action:'listar'})).itens[0].podeEditar,false);assert.equal((await t.call({action:'registro',id:r.id,versao:r.versao,texto:'x'})).status,403);assert.equal((await t.call({action:'salvar',item:{...r,versaoAnterior:r.versao}})).status,403);t.session({sub:'ana',perms:['reunioes']});t.conflict();assert.equal((await t.call({action:'anexar',id:r.id,versao:r.versao,nome:'ata.pdf',mime:'application/pdf',base64:btoa('%PDF-test')})).status,409);assert.equal(t.files.size,0);assert.equal(t.rows.get(r.id).anexos.length,0);});
test('paginação recupera mais de 500 encontros; corpo inválido retorna 400',async()=>{const t=setup();for(let i=0;i<501;i++)t.rows.set('r'+i,{...item(),id:'r'+i,criadoPor:'ana'});assert.equal((await t.call({action:'listar'})).itens.length,501);assert.equal((await t.call(null)).status,400);});

test('diretório RH é autenticado, mínimo e salva vínculos confirmados pelo servidor',async()=>{
 const t=setup();t.session({sub:'bia',perms:['agenda']});assert.equal((await t.call({action:'pessoas'})).status,403);assert.equal(t.queries.length,0);
 t.session({sub:'ana',nome:'Ana',perms:['reunioes']});const r=await t.call({action:'pessoas'});assert.deepEqual(JSON.parse(JSON.stringify(r.pessoas)),[{id:'rh-1',nome:'Pessoa RH',areaId:'fin',area:'Financeiro',cargo:'Analista'}]);
 assert.ok(t.queries.every(q=>!q.colunas.includes('cpf')&&!q.colunas.includes('salario')&&q.colunas!=='*'));
 const save=await t.call({action:'salvar',item:{...item(),setor:'financeiro',participantes:[{id:'p1',rhId:'rh-1',nome:'Forjado',presenca:'presente'}]}});assert.equal(save.status,200);assert.equal(save.item.participantes[0].nome,'Pessoa RH');assert.equal(save.item.participantes[0].rhId,'rh-1');
 const agenda=await t.call({action:'agenda',mes:'2026-10'});assert.equal(agenda.eventos.length,1);assert.equal(agenda.eventos[0].setor,'Financeiro');assert.ok(!JSON.stringify(agenda).includes('Pessoa RH'));
 t.session({sub:'bia',perms:['calendario-empresa']});assert.equal((await t.call({action:'agenda',mes:'2026-10'})).status,403);
});
test('diretório RH percorre mais de 500 pessoas e agenda rejeita mês inválido',async()=>{
 const t=setup();t.rh.colaboradores=Array.from({length:501},(_,i)=>({id:'rh-'+i,nome:'Pessoa '+i,statusId:'ativo'}));
 assert.equal((await t.call({action:'pessoas'})).pessoas.length,501);assert.equal((await t.call({action:'agenda',mes:'2026-13'})).status,422);
});

const seedPresence=t=>{t.rows.set('r1',{...item(),versao:'v1',criadoPor:'organizador',ata:'Ata preservada',anexos:[],registros:[],historico:[],participantes:[{id:'p1',rhId:'rh-1',nome:'Ana Exemplo',presenca:'pendente'},{id:'p2',rhId:'rh-2',nome:'Bia Exemplo',presenca:'pendente'}]});};
const confirm={action:'presenca',id:'r1',presencaAnterior:'pendente'};
test('convidado confirma a própria presença, sem edição da ata, com histórico e repetição idempotente',async()=>{
 const t=setup();seedPresence(t);const before=structuredClone(t.rows.get('r1'));
 const listed=(await t.call({action:'listar'})).itens[0];assert.equal(listed.podeEditar,false);assert.equal(listed.minhaPresenca.participanteId,'p1');
 const r=await t.call(confirm);assert.equal(r.status,200);assert.equal(r.item.participantes[0].presenca,'presente');assert.equal(r.item.participantes[1].presenca,'pendente');assert.equal(r.item.ata,before.ata);assert.equal(r.item.historico.length,1);assert.equal(r.item.historico[0].por,'ana');assert.match(r.item.historico[0].acao,/própria presença/);
 assert.equal((await t.call(confirm)).item.versao,r.item.versao);assert.equal(t.rows.get('r1').historico.length,1);assert.equal(t.rows.get('r1').minhaPresenca,undefined);
 const pdf=Buffer.from(await gerarPdfPresenca(r.item,'presentes').arrayBuffer()).toString('latin1');assert.ok(pdf.includes('Ana Exemplo'));assert.ok(!pdf.includes('Bia Exemplo'));
});
test('identidade usa conta e alias; não permite indicar outra pessoa, nem usar nome coincidente',async()=>{
 const t=setup();seedPresence(t);assert.equal((await t.call({...confirm,participanteId:'p2'})).status,403);
 t.session({sub:'alias',nome:'Ana Exemplo',perms:['reunioes']});assert.equal((await t.call(confirm)).status,403);
 t.aliases.push({conta_id:'c1',login:'alias',sistema:'painel',ativo:true});assert.equal((await t.call(confirm)).status,200);
 assert.ok(t.queries.every(q=>!q.colunas.includes('cpf')&&!q.colunas.includes('salario')&&q.colunas!=='*'));
});
test('contas inativas, vínculos ambíguos e pessoas fora dos convidados não confirmam',async()=>{
 for(const change of [t=>t.accounts[0].ativo=false,t=>t.accounts[0].colaborador_id=null,t=>t.accounts[0].colaborador_id='rh-outro',t=>t.accounts.push({...t.accounts[0],id:'outra'}),t=>t.aliases.push({conta_id:'outra',login:'ana',sistema:'painel',ativo:true}),t=>t.aliases.push({conta_id:'c1',login:'ana',sistema:'painel',ativo:false})]){
 const t=setup();seedPresence(t);change(t);assert.equal((await t.call(confirm)).status,403);assert.equal(t.rows.get('r1').participantes[0].presenca,'pendente');const listed=await t.call({action:'listar'});assert.equal(listed.status,200);assert.equal(listed.itens[0].minhaPresenca.participanteId,null);
 }
});
test('responsável marca convidado sem vínculo; leitores não ganham esse acesso; cancelada não aceita presença',async()=>{
 const t=setup();seedPresence(t);t.rows.get('r1').participantes[1].rhId=null;
 t.session({sub:'gestor',master:true});assert.equal((await t.call({...confirm,participanteId:'p2'})).status,200);
 t.rows.get('r1').situacao='cancelado';assert.equal((await t.call(confirm)).status,422);assert.equal((await t.call({...confirm,participanteId:'p1'})).status,422);
});
test('confirmações simultâneas preservam a outra presença e a ata mais recente',async()=>{
 const t=setup();seedPresence(t);t.collide(rows=>{const r=rows.get('r1');rows.set('r1',{...r,versao:'v2',ata:'Ata atualizada',participantes:r.participantes.map(p=>p.id==='p2'?{...p,presenca:'presente'}:p)});});
 const r=await t.call(confirm);assert.equal(r.status,200);assert.equal(r.item.ata,'Ata atualizada');assert.ok(r.item.participantes.every(p=>p.presenca==='presente'));
});
test('alteração concorrente da mesma presença e conflito persistente não são sobrescritos',async()=>{
 const t=setup();seedPresence(t);t.collide(rows=>{rows.get('r1').participantes[0].presenca='ausente';});assert.equal((await t.call(confirm)).status,409);assert.equal(t.rows.get('r1').participantes[0].presenca,'ausente');
 seedPresence(t);t.conflict();assert.equal((await t.call(confirm)).status,409);assert.equal(t.rows.get('r1').participantes[0].presenca,'pendente');
});

test('atualização concorrente que cancela o encontro ou remove o convidado interrompe a confirmação',async()=>{
 for(const [mutate,status] of [[r=>r.situacao='cancelado',422],[r=>r.participantes=r.participantes.filter(p=>p.id!=='p1'),403]]){
 const t=setup();seedPresence(t);t.collide(rows=>mutate(rows.get('r1')));assert.equal((await t.call(confirm)).status,status);assert.equal(t.rows.get('r1').historico.length,0);
 }
});
test('criador pode marcar presença; curinga de módulos não concede acesso a outras pessoas',async()=>{
 const t=setup();seedPresence(t);t.session({sub:'leitor',perms:['*']});assert.equal((await t.call({...confirm,participanteId:'p2'})).status,403);
 t.session({sub:'organizador',perms:['reunioes']});assert.equal((await t.call({...confirm,participanteId:'p2'})).status,200);
});

test('avisos autenticados consultam só o período e o vínculo da conta e retornam projeção mínima',async()=>{
 const t=setup();seedPresence(t);t.rows.get('r1').data=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});t.rows.get('r1').fim='23:59';
 const r=await t.call({action:'avisos',rhId:'rh-2'});assert.equal(r.status,200);assert.equal(r.avisos.length,1);assert.equal(r.avisos[0].id,'r1');assert.ok(!JSON.stringify(r).includes('Ata preservada'));assert.ok(!JSON.stringify(r).includes('Bia Exemplo'));
 assert.ok(t.queries.filter(q=>q.tabela==='painel_registros').every(q=>!/(?:^|,|->>?)(?:ata|anexos)(?:,|$)/.test(q.colunas)&&q.colunas!=='id,registro'));
 t.accounts[0].colaborador_id='rh-fora';assert.equal((await t.call({action:'avisos'})).avisos.length,0);
 t.accounts[0].colaborador_id=null;assert.match((await t.call({action:'avisos'})).aviso,/vinculada/);
 t.session({sub:'ana',perms:['agenda']});assert.equal((await t.call({action:'avisos'})).status,403);
});
