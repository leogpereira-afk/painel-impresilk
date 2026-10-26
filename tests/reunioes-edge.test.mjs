import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';import vm from 'node:vm';import {fileURLToPath} from 'node:url';
import {gerarPdfPresenca} from '../src/lib/pdfPresenca.js';
const require=createRequire(import.meta.url),{buildSync}=createRequire(require.resolve('vite'))('esbuild');
const source=readFileSync(new URL('../supabase/functions/painel-reunioes/index.ts',import.meta.url),'utf8').replace(/^import.*createClient.*\n/m,'const createClient=globalThis.createClient;\n').replace(/^import.*verificarJwt.*\n/m,'const {verificarJwt,crachaRevogado}=globalThis;\n');
const code=buildSync({stdin:{contents:source,loader:'ts',resolveDir:fileURLToPath(new URL('../supabase/functions/painel-reunioes/',import.meta.url))},bundle:true,write:false,format:'iife',platform:'node'}).outputFiles[0].text;
function setup(){
 let handler,session={sub:'ana',nome:'Ana',perms:['reunioes']},revoked=false,conflict=false,collision=null;
 const rows=new Map(),processos=new Map(),files=new Map(),rpcCalls=[];let uploads=0;
 const rh={colaboradores:[{id:'rh-1',nome:'Pessoa RH',statusId:'ativo',areaId:'fin',cargoId:'analista'}],status:[{id:'ativo',contaComoAtivo:'true'}],areas:[{id:'fin',nome:'Financeiro'}],cargos:[{id:'analista',nome:'Analista'}]},queries=[],accounts=[{id:'c1',usuario:'ana',colaborador_id:'rh-1',ativo:true}],aliases=[];
 const mapFor=c=>c==='processos_empresa'?processos:rows;
 const sb={from(tabela){
  let id,colecao,colunasQuery='',de,ate,contido;const filters=[];
  const result=()=>({data:(tabela==='acesso_conta'?accounts:tabela==='acesso_papel'?aliases:[]).filter(x=>filters.every(([k,v])=>String(x[k]).toLowerCase()===String(v).toLowerCase()))});
  const q={select(colunas){colunasQuery=colunas;queries.push({tabela,colunas});return q},eq(k,v){filters.push([k,v]);if(k==='id')id=v;if(k==='colecao')colecao=v;return q},ilike(k,v){filters.push([k,v.replace(/\\([\\%_])/g,'$1')]);return q},gte(k,v){de=v;return q},lte(k,v){ate=v;return q},contains(k,v){contido=v;return q},limit(){return Promise.resolve(result())},order(){return q},range(a,b){
   const data=tabela==='registros'?(rh[colecao]||[]).slice(a,b+1):[...mapFor(colecao)].filter(([,r])=>filters.every(([k,v])=>!k.startsWith('registro->>')||r[k.slice(11)]===v)&&(!contido||(r.situacao==='agendado'&&r.data>=de&&r.data<=ate&&r.participantes.some(p=>p.rhId===contido.participantes[0].rhId)))).slice(a,b+1).map(([id,registro])=>colunasQuery.includes('titulo:')?{...registro,id}:{id,registro});
   return Promise.resolve({data:structuredClone(data)});
  },maybeSingle(){return Promise.resolve(structuredClone(tabela==='acesso_conta'?{data:result().data[0]||null}:{data:mapFor(colecao).has(id)?{registro:mapFor(colecao).get(id)}:null}));}};return q;
 },async rpc(n,p){
  rpcCalls.push({n,p:structuredClone(p)});
  if(collision){const mutate=collision;collision=null;mutate(rows,processos,p);return {error:{code:'40001'}};}
  const entradas=n==='painel_reunioes_gravar_lote'?p.p_itens:[{colecao:p.p_colecao,id:p.p_id,registro:p.p_registro,anterior:p.p_anterior}];
  if(conflict||entradas.some(e=>JSON.stringify(mapFor(e.colecao).get(e.id)||null)!==JSON.stringify(e.anterior)))return {error:{code:'40001'}};
  for(const e of entradas)mapFor(e.colecao).set(e.id,structuredClone(e.registro));return {};
 },storage:{from(){return {async upload(k,v){uploads++;files.set(k,v);return {}},async remove(ks){ks.forEach(k=>files.delete(k));return {}},async createSignedUrl(k){return {data:{signedUrl:'https://private.example/'+k}}}}}}};
 vm.runInNewContext(code,{createClient:()=>sb,verificarJwt:async()=>session,crachaRevogado:async()=>revoked,Deno:{env:{get:()=> 'test'},serve:fn=>handler=fn},Response,Request,crypto,atob,Uint8Array,TextEncoder,structuredClone,console});
 return {rows,processos,files,rh,queries,accounts,aliases,rpcCalls,collide:fn=>collision=fn,get uploads(){return uploads},session:s=>session=s,revoke:()=>revoked=true,conflict:()=>conflict=true,async call(body,auth=true){const r=await handler(new Request('http://local',{method:'POST',headers:auth?{authorization:'Bearer test'}:{},body:JSON.stringify(body)}));return {status:r.status,...await r.json()}}};
}
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

const regra={frequencia:'diaria',intervalo:1,termino:'quantidade',quantidade:3};
const criarSerie=t=>t.call({action:'salvarSerie',item:{...item(),data:'2090-01-02'},recorrencia:regra});
const versoes=itens=>Object.fromEntries(itens.map(r=>[r.id,r.versao]));
const editarSerie=(r,itens,extra={})=>({action:'salvarSerie',item:{...r,versaoAnterior:r.versao,titulo:'Título ajustado'},escopo:'serie',versoesAnteriores:versoes(itens),...extra});
test('série usa um lote, IDs determinísticos e retry não recria nem altera encontros',async()=>{
 const t=setup(),r=await criarSerie(t);assert.equal(r.status,200);assert.deepEqual(r.itens.map(x=>x.id),['r1','r1_r2','r1_r3']);assert.equal(t.rows.size,3);assert.equal(t.rpcCalls.length,1);assert.equal(t.rpcCalls[0].n,'painel_reunioes_gravar_lote');
 const snapshot=JSON.stringify([...t.rows]);const retry=await t.call({action:'salvarSerie',item:{...item(),titulo:'Ignorar retry alterado'},recorrencia:regra});assert.equal(retry.status,200);assert.equal(JSON.stringify([...t.rows]),snapshot);assert.equal(t.rpcCalls.length,1);
 t.session({sub:'bia',perms:['*']});assert.equal((await criarSerie(t)).status,403);
 t.session({sub:'direcao',master:true});assert.equal((await criarSerie(t)).status,200);
});
test('criação de série não toma ID de reunião única e colisão numa ocorrência não grava lote parcial',async()=>{
 const t=setup();await t.call({action:'salvar',item:item()});const snapshot=JSON.stringify([...t.rows]);assert.equal((await criarSerie(t)).status,409);assert.equal(JSON.stringify([...t.rows]),snapshot);
 const u=setup();u.rows.set('r1_r2',{...item(),id:'r1_r2',versao:'ocupado',criadoPor:'ana'});assert.equal((await criarSerie(u)).status,409);assert.equal(u.rows.size,1);assert.equal(u.rows.get('r1_r2').versao,'ocupado');
});
test('salvar individual ignora metadados forjados e preserva os originais de uma série',async()=>{
 const t=setup(),forjado={serieId:'outra',indice:10,total:20,regra,dataOriginal:'2026-01-01'};
 const avulsa=await t.call({action:'salvar',item:{...item(),...forjado}});assert.equal(avulsa.status,200);assert.ok(!Object.hasOwn(avulsa.item,'serieId'));
 const u=setup(),serie=await criarSerie(u),r=serie.itens[1];const antes=JSON.stringify(u.rows.get('r1'));
 const salvo=await u.call({action:'salvar',item:{...r,...forjado,titulo:'Só esta',versaoAnterior:r.versao}});assert.equal(salvo.status,200);assert.equal(salvo.item.serieId,'r1');assert.equal(salvo.item.indice,2);assert.equal(salvo.item.total,3);assert.equal(salvo.item.dataOriginal,r.dataOriginal);assert.equal(JSON.stringify(u.rows.get('r1')),antes);
});
test('edição coletiva exige versão de todos os alvos e CAS rejeita concorrência sem perda parcial',async()=>{
 const t=setup(),r=await criarSerie(t),snapshot=JSON.stringify([...t.rows]);
 assert.equal((await t.call(editarSerie(r.item,r.itens,{versoesAnteriores:{r1:r.item.versao}}))).status,409);assert.equal(JSON.stringify([...t.rows]),snapshot);
 const antiga=versoes(r.itens);antiga.r1_r2='velha';assert.equal((await t.call(editarSerie(r.item,r.itens,{versoesAnteriores:antiga}))).status,409);
 t.collide(rows=>rows.set('r1_r3',{...rows.get('r1_r3'),versao:'concorrente',ata:'Ata simultânea'}));
 assert.equal((await t.call(editarSerie(r.item,r.itens))).status,409);assert.equal(t.rows.get('r1').titulo,r.item.titulo);assert.equal(t.rows.get('r1_r2').titulo,r.item.titulo);assert.equal(t.rows.get('r1_r3').ata,'Ata simultânea');
});
test('próximas altera só alvos futuros sem atividade e devolve preservadas',async()=>{
 const t=setup(),r=await criarSerie(t);const primeiro=JSON.stringify(t.rows.get('r1'));t.rows.get('r1_r3').ata='Já registrada';
 const edit=await t.call(editarSerie(r.itens[1],r.itens,{escopo:'proximas'}));assert.equal(edit.status,200);assert.equal(edit.itens.length,1);assert.equal(edit.itens[0].id,'r1_r2');assert.equal(edit.preservadas,1);assert.equal(JSON.stringify(t.rows.get('r1')),primeiro);assert.equal(t.rows.get('r1_r3').titulo,r.item.titulo);
});
test('scope esta usa CAS explícito; módulo, proprietário e versões limitam os lotes',async()=>{
 const t=setup(),r=await criarSerie(t);const one=await t.call(editarSerie(r.itens[1],r.itens,{escopo:'esta'}));assert.equal(one.status,200);assert.equal(one.itens.length,1);assert.equal(t.rows.get('r1').titulo,r.item.titulo);
 t.session({sub:'bia',perms:['reunioes']});assert.equal((await t.call(editarSerie(r.item,r.itens))).status,403);
 t.session({sub:'ana',perms:['demandas']});assert.equal((await criarSerie(t)).status,403);
});
test('retry após corrida de criação recupera série do mesmo criador sem nova escrita',async()=>{
 const t=setup();t.collide((rows,processos,p)=>{for(const e of p.p_itens)rows.set(e.id,e.registro);});const r=await criarSerie(t);assert.equal(r.status,200);assert.equal(t.rows.size,3);assert.equal(t.rpcCalls.length,1);
});
async function reuniaoComDecisao(t,extra={}){
 return (await t.call({action:'salvar',item:{...item(),decisoes:[{id:'d1',texto:'Acompanhar o plano fictício',responsavelRhId:'rh-1',prazo:'2090-01-10',...extra}]}})).item;
}
const converter=r=>({action:'demanda',id:r.id,versao:r.versao,decisaoId:'d1'});
test('encaminhar decisão cria demanda e vínculo juntos; repetições retornam a mesma sem histórico extra',async()=>{
 const t=setup();t.session({sub:'ana',nome:'Ana',perms:['reunioes','demandas']});const r=await reuniaoComDecisao(t);const result=await t.call(converter(r));assert.equal(result.status,200);assert.equal(t.processos.size,1);const d=t.processos.get(result.demandaId);
 assert.equal(d.tipo,'demanda');assert.equal(d.objetivo,r.decisoes[0].texto);assert.equal(d.prazo,'2090-01-10');assert.equal(d.responsavelRhId,'rh-1');assert.equal(d.envolvidos[0].nome,'Pessoa RH');assert.equal(d.origemReuniaoId,r.id);assert.equal(d.origemDecisaoId,'d1');assert.equal(result.item.decisoes[0].demandaId,d.id);
 const snapshot=JSON.stringify([...t.rows,...t.processos]);assert.equal((await t.call(converter(r))).demandaId,d.id);assert.equal(JSON.stringify([...t.rows,...t.processos]),snapshot);
});
test('encaminhar exige módulo Demandas e edição da reunião; responsável textual não vira identidade',async()=>{
 const t=setup(),r=await reuniaoComDecisao(t);assert.equal((await t.call(converter(r))).status,403);t.session({sub:'bia',perms:['reunioes','demandas']});assert.equal((await t.call(converter(r))).status,403);t.session({sub:'ana',perms:['reunioes','demandas']});assert.equal((await t.call({...converter(r),versao:'velha'})).status,409);assert.equal(t.processos.size,0);
 const u=setup();u.session({sub:'ana',perms:['reunioes','demandas']});const texto=await reuniaoComDecisao(u,{responsavelRhId:null,responsavel:'Pessoa RH'});assert.equal((await u.call(converter(texto))).status,422);assert.equal(u.processos.size,0);
 t.rh.colaboradores=[];assert.equal((await t.call(converter(r))).status,422);
});
test('conflito no encaminhamento preserva reunião e não cria demanda órfã; retry simultâneo é idempotente',async()=>{
 const t=setup();t.session({sub:'ana',perms:['reunioes','demandas']});const r=await reuniaoComDecisao(t);t.collide(rows=>rows.set(r.id,{...rows.get(r.id),versao:'nova',ata:'Outra edição'}));assert.equal((await t.call(converter(r))).status,409);assert.equal(t.processos.size,0);assert.ok(!t.rows.get(r.id).decisoes[0].demandaId);
 const u=setup();u.session({sub:'ana',perms:['reunioes','demandas']});const a=await reuniaoComDecisao(u);const results=await Promise.all([u.call(converter(a)),u.call(converter(a))]);assert.ok(results.every(r=>r.status===200));assert.equal(results[0].demandaId,results[1].demandaId);assert.equal(u.processos.size,1);assert.equal(u.rows.get(a.id).historico.length,a.historico.length+1);
});
test('demanda existente com ID ocupado não é sobrescrita nem ligada; vínculo removido não recria',async()=>{
 const t=setup();t.session({sub:'ana',perms:['reunioes','demandas']});const r=await reuniaoComDecisao(t);
 t.collide((rows,processos,p)=>{const d=p.p_itens.find(x=>x.colecao==='processos_empresa');processos.set(d.id,{id:d.id,tipo:'consultoria',versao:'ocupado'});});assert.equal((await t.call(converter(r))).status,409);assert.ok(!t.rows.get(r.id).decisoes[0].demandaId);assert.equal([...t.processos.values()][0].tipo,'consultoria');
 const u=setup();u.session({sub:'ana',perms:['reunioes','demandas']});const a=await reuniaoComDecisao(u),saved=await u.call(converter(a));u.processos.clear();assert.equal((await u.call(converter(saved.item))).status,409);assert.equal(u.processos.size,0);
});
test('RH mínimo inclui somente ID oficial validado e resolve responsável da reunião mesmo sem participantes',async()=>{
 const t=setup();t.rh.colaboradores[0].idPessoa='123456';const r=await t.call({action:'pessoas'});assert.equal(r.pessoas[0].idPessoa,'123456');assert.ok(t.queries.some(q=>q.colunas.includes('idPessoa:registro->>idPessoa')));
 const salvo=await t.call({action:'salvar',item:{...item(),responsavelRhId:'rh-1',responsavel:'Forjado'}});assert.equal(salvo.status,200);assert.equal(salvo.item.responsavel,'Pessoa RH');assert.equal(salvo.item.responsavelIdPessoa,'123456');
 assert.ok(t.queries.every(q=>!q.colunas.includes('cpf')&&!q.colunas.includes('salario')&&q.colunas!=='*'));
});
