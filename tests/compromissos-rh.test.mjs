import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {lerEquipeCompromissos, enriquecerCompromissosRH, prepararCompromissoRH, autorCompromissoRH} from '../supabase/functions/_shared/compromissos-rh.mjs';

// Só o transporte ao banco é simulado; projeção, identidade e escrita são reais.
function banco({falha, extra=[],aoLerRegistro}={}) {
 const dados={
  painel_contas:[{usuario:'ana',nome:'Nome antigo',permissoes:['compromissos']},{usuario:'bia',nome:'Ana',permissoes:['compromissos']},{usuario:'fora',nome:'Fora',permissoes:['orcamentos']}],
  acesso_conta:[{id:'c1',usuario:'ana',colaborador_id:'rh-101',id_pessoa:'010101',ativo:true},{id:'c2',usuario:'bia-central',colaborador_id:'rh-102',id_pessoa:'010102',ativo:true},...extra],
  acesso_papel:[{conta_id:'c2',login:'bia',ativo:true,sistema:'painel'}],
  registros:[{id:'rh-101',colecao:'colaboradores',apagado:false,nome:'Ana Atual',statusId:'ativo',saiu:null,fotoDataUrl:'data:image/png;base64,aGVsbG8='},{id:'rh-102',colecao:'colaboradores',apagado:false,nome:'Ana Atual',statusId:'ativo',saiu:null,fotoDataUrl:null},{id:'secreto',colecao:'colaboradores',apagado:false,nome:'Não consultar'}],
  painel_registros:[],
 };
 const consultas=[];
 const gravacoes=[];
 return {dados,consultas,gravacoes,revogado:false,async rpc(nome,p){
  if(nome==='acesso_revogado')return {data:this.revogado,error:null};
  assert.equal(nome,'painel_registro_gravar');gravacoes.push(structuredClone(p));
  const antes=dados.painel_registros.find(r=>r.colecao===p.p_colecao&&r.id===p.p_id);
  if(JSON.stringify(antes?.registro??null)!==JSON.stringify(p.p_anterior))return{error:{code:'40001',message:'concorrência'}};
  if(antes)antes.registro=structuredClone(p.p_registro);else dados.painel_registros.push({colecao:p.p_colecao,id:p.p_id,registro:structuredClone(p.p_registro)});
  return {error:null};
 },from(tabela){
  const filtros=[];let de=0,ate=Infinity;const c={tabela};consultas.push(c);
  const resultado=()=>{if(tabela==='painel_registros')aoLerRegistro?.(dados);return {data:falha===tabela?null:structuredClone(dados[tabela].filter(r=>filtros.every(f=>f(r))).slice(de,ate+1)),error:falha===tabela?{message:'falha'}:null};};
  const q={select(colunas){c.colunas=colunas;return q;},eq(k,v){filtros.push(r=>r[k]===v);return q;},in(k,vs){c.ids=vs;filtros.push(r=>vs.includes(r[k]));return q;},order(){return q;},range(a,b){de=a;ate=b;return q;},async maybeSingle(){const r=resultado();return {...r,data:r.data?.[0]??null};},then(ok,erro){return Promise.resolve(resultado()).then(ok,erro);}};return q;
 }};
}
const sessao={sub:'ana',nome:'Nome antigo'};
const agora='2026-10-11T12:00:00Z';
const ler=b=>lerEquipeCompromissos(b,{masterUsuario:'direcao'});

test('usa o vínculo central direto e o login de papel sem confundir homônimos',async()=>{
 const b=banco(),d=await ler(b);
 assert.deepEqual(d.pessoas.filter(p=>p.rhId).map(p=>[p.usuario,p.rhId,p.nome]),[['ana','rh-101','Ana Atual'],['bia','rh-102','Ana Atual']]);
 assert.equal(d.pessoas.some(p=>p.usuario==='fora'),false);
 assert.equal(d.pessoas.find(p=>p.usuario==='ana').rhCodigo,'010101');
 assert.equal(d.pessoas.find(p=>p.usuario==='direcao').vinculo,'sem-vinculo');
 assert.equal(b.consultas.find(c=>c.tabela==='registros').ids.includes('secreto'),false);
 for(const c of b.consultas)assert.doesNotMatch(c.colunas,/\*|cpf|salario|telefone|hash/);
});
test('não escolhe um RH quando dois cadastros centrais disputam o mesmo login',async()=>{
 const d=await ler(banco({extra:[{id:'c3',usuario:'ana',colaborador_id:'rh-102',id_pessoa:'010102',ativo:true}]}));
 assert.equal(d.pessoas.find(p=>p.usuario==='ana').vinculo,'ambiguo');
 assert.equal(d.pessoas.find(p=>p.usuario==='ana').rhId,'');
});
test('equipe paginada conserva pessoas além da primeira página e não usa fichas apagadas',async()=>{
 const b=banco();
 for(let i=0;i<505;i++){
  b.dados.painel_contas.push({usuario:`pessoa-${i}`,permissoes:['compromissos']});
  b.dados.acesso_conta.push({id:`conta-${i}`,usuario:`pessoa-${i}`,colaborador_id:`ficha-${i}`,id_pessoa:String(i).padStart(6,'0'),ativo:true});
  b.dados.registros.push({id:`ficha-${i}`,colecao:'colaboradores',apagado:i===504,nome:`Pessoa ${i}`,statusId:'ativo'});
 }
 const d=await ler(b);
 assert.equal(d.pessoas.find(p=>p.usuario==='pessoa-503').rhCodigo,'000503');
 assert.equal(d.pessoas.find(p=>p.usuario==='pessoa-504').vinculo,'ausente');
 assert.equal(d.pessoas.length,508);
});
test('conta, papel inativo e desligamento não recebem novos compromissos',async()=>{
 for(const origem of ['conta','papel','rh']){
  const b=banco();if(origem==='conta')b.dados.acesso_conta[1].ativo=false;
  if(origem==='papel')b.dados.acesso_papel[0].ativo=false;
  if(origem==='rh')b.dados.registros[1].saiu='2026-10-01';
  const d=await ler(b);assert.equal(d.pessoas.find(p=>p.usuario==='bia').disponivel,false);
  assert.throws(()=>prepararCompromissoRH({dono:'bia'},{dono:'ana'},sessao,d,agora),e=>e.status===422);
 }
});
test('indisponibilidade do RH é erro real, não uma equipe vazia',async()=>{
 await assert.rejects(ler(banco({falha:'registros'})),e=>e.status===503);
});
test('criação ignora identidade e histórico forjados e carimba o RH oficial',async()=>{
 const d=await ler(banco()),r=prepararCompromissoRH({titulo:'Visita',donoRhId:'forjado',donoRH:{nome:'Falso'},historico:[{tipo:'falso'}]},null,sessao,d,agora);
 assert.equal(r.dono,'ana');assert.equal(r.donoRhId,'rh-101');assert.equal(r.donoNome,'Ana Atual');
 assert.equal(r.donoRH,undefined);assert.equal(r.historico.length,1);assert.equal(r.historico[0].quemRhId,'rh-101');
});
test('encaminhamento registra ambos os IDs, conserva conversa e rejeita escolha antiga',async()=>{
 const d=await ler(banco()),ant={dono:'ana',donoRhId:'rh-101',historico:[{quemNome:'Nome antigo',tipo:'recado',texto:'Conservar'}]};
 const r=prepararCompromissoRH({dono:'bia',destinoRhId:'rh-102',recado:'Medir'},ant,sessao,d,agora);
 assert.equal(r.dono,'bia');assert.equal(r.donoRhId,'rh-102');assert.deepEqual(r.historico[0],ant.historico[0]);
 assert.equal(r.historico[1].paraRhId,'rh-102');assert.equal(r.historico[1].paraRhCodigo,'010102');assert.equal(r.historico[1].deRhId,'rh-101');assert.equal(r.recado,undefined);
 assert.throws(()=>prepararCompromissoRH({dono:'bia',destinoRhId:'rh-outro'},ant,sessao,d,agora),e=>e.status===409);
});
test('encaminhar legado resolve o ID de origem somente pelo vínculo central existente',async()=>{
 const d=await ler(banco());
 const r=prepararCompromissoRH({dono:'bia'},{dono:'ana',historico:[]},sessao,d,agora);
 assert.equal(r.historico[0].deRhId,'rh-101');
 assert.equal(r.historico[0].paraRhId,'rh-102');
});
test('editar legado não troca ID já gravado; leitura não reescreve história',async()=>{
 const b=banco(),d=await lerEquipeCompromissos(b,{masterUsuario:'direcao',rhIds:['rh-antigo']});
 const ant={dono:'ana',donoRhId:'rh-antigo',donoNome:'Ana no passado',historico:[{quem:'ana',quemNome:'Ana no passado'}]};
 const r=prepararCompromissoRH({feito:true,donoRhId:'forjado'},ant,sessao,d,agora);
 assert.equal(r.donoRhId,'rh-antigo');assert.equal(r.historico[0].quemNome,'Ana no passado');
 const mapa={cp:ant},l=enriquecerCompromissosRH(mapa,d);
 assert.equal(l.cp.donoRH.vinculo,'divergente');assert.deepEqual(mapa,{cp:ant});
});
test('legado sem vínculo continua editável sem inventar identificação',async()=>{
 const d=await ler(banco()),s={sub:'direcao',nome:'Direção'};
 const r=prepararCompromissoRH({feito:true},{dono:'direcao',titulo:'Antigo'},s,d,agora);
 assert.equal(r.donoRhId,'');assert.equal(r.feito,true);
 assert.equal(autorCompromissoRH(s,d).quemRhId,undefined);
});
test('foto ativa é consultada pelo mesmo ID e URLs arbitrárias não saem na resposta',async()=>{
 const b=banco();b.dados.registros[0].fotoDataUrl='https://externo.invalid/rastrear';const d=await ler(b);
 assert.equal(d.pessoas.find(p=>p.usuario==='ana').fotoDataUrl,'');
 const l=enriquecerCompromissosRH({a:{dono:'ana',historico:[]}},d);
 assert.equal(l.a.donoRhId,'rh-101');assert.equal(l.a.donoRH.nome,'Ana Atual');
 assert.equal(l.a.donoRH.vinculo,'central');
});

async function handler(b,s={sub:'ana',nome:'Nome antigo',perms:['compromissos']}) {
 let servir;globalThis.__compromissosBanco=b;globalThis.__compromissosSessao=s;
 globalThis.Deno={env:{get:k=>k==='PAINEL_AUTH_MASTER_USUARIO'?'direcao':'teste'},serve:f=>{servir=f;}};
 const url=new URL('../supabase/functions/painel-config/',import.meta.url);
 const fonte='const console={...globalThis.console,error:()=>{}};\n'+(await readFile(new URL('index.ts',url),'utf8'))
  .replace(/import \{ createClient \} from [^;]+;/,'const createClient=()=>globalThis.__compromissosBanco;')
  .replace(/import \{ verificarJwt, crachaRevogado \} from [^;]+;/,'const verificarJwt=async()=>globalThis.__compromissosSessao;const crachaRevogado=async()=>false;');
 const bundle=await build({stdin:{contents:fonte,loader:'ts',resolveDir:fileURLToPath(url)},bundle:true,platform:'neutral',format:'esm',write:false});
 await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text+'\n//'+Math.random()).toString('base64'));
 return async corpo=>{const resp=await servir(new Request('https://local.invalid',{method:'POST',headers:{authorization:'Bearer teste'},body:JSON.stringify(corpo)}));return{status:resp.status,body:await resp.json()};};
}
test('handler real cria, conversa, encaminha e mantém acesso separado pelo login',async()=>{
 const b=banco(),chamar=await handler(b);
 let r=await chamar({action:'merge',chave:'compromissos',patch:{cp:{titulo:'Visita',donoRhId:'falso'}}});
 assert.equal(r.status,200);assert.equal(r.body.valor.cp.donoRhId,'rh-101');
 assert.equal(b.gravacoes[0].p_registro.donoRH,undefined);
 r=await chamar({action:'evento',chave:'compromissos',id:'cp',texto:'Medir a fachada'});assert.equal(r.status,200);
 assert.equal(r.body.valor.cp.historico.at(-1).quemRhId,'rh-101');
 r=await chamar({action:'merge',chave:'compromissos',patch:{cp:{dono:'bia',destinoRhId:'rh-102'}}});
 assert.equal(r.status,200);assert.deepEqual(r.body.valor,{});
 assert.equal(b.dados.painel_registros[0].registro.donoRhId,'rh-102');
 const antes=b.gravacoes.length;
 r=await chamar({action:'merge',chave:'compromissos',patch:{cp:{feito:true}}});assert.equal(r.status,403);assert.equal(b.gravacoes.length,antes);
 const receber=await handler(b,{sub:'bia',perms:['compromissos']});r=await receber({action:'get',chave:'compromissos'});
 assert.equal(r.body.valor.cp.historico.at(-1).paraRhId,'rh-102');
});
test('equipe do RH exige módulo e não expõe dados privados; destinatário revogado é recusado',async()=>{
 const b=banco();let chamar=await handler(b,{sub:'fora',perms:['orcamentos']});
 let r=await chamar({action:'pessoasCompromissos'});assert.equal(r.status,403);assert.equal(b.consultas.length,0);
 chamar=await handler(b);r=await chamar({action:'pessoasCompromissos'});assert.equal(r.status,200);
 assert.equal(r.body.pessoas.find(p=>p.usuario==='ana').rhId,'rh-101');
 assert.doesNotMatch(JSON.stringify(r.body),/permissoes|colaborador_id|cpf|salario/);
 b.revogado=true;r=await chamar({action:'merge',chave:'compromissos',patch:{novo:{titulo:'Visita'}}});
 assert.equal(r.status,422);assert.equal(b.gravacoes.length,0);
});
test('troca de dono entre as leituras não permite concluir nem conversar na agenda de outro',async()=>{
 for(const action of ['merge','evento']){
  let leituras=0;
  const b=banco({aoLerRegistro:d=>{if(++leituras===2)d.painel_registros[0].registro.dono='bia';}});
  b.dados.painel_registros.push({id:'cp',colecao:'compromissos',registro:{dono:'ana',titulo:'Visita'}});
  const chamar=await handler(b);
  const r=await chamar(action==='merge'?{action,chave:'compromissos',patch:{cp:{feito:true}}}:{action,chave:'compromissos',id:'cp',texto:'Medir'});
  assert.equal(r.status,403);assert.equal(b.gravacoes.length,0);
 }
});
