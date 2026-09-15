import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';

async function funcao(nome,{revogada=false,erroBanco=false,linhas=[]}={}) {
 let handler;const operacoes=[];
 const banco={storage:{from:()=>({})},rpc:async (nome,args)=>{operacoes.push({nome,args});return erroBanco?{data:null,error:{message:'falha de gravação simulada'}}:{data:{gravou:2,contas:0,verificado:true},error:null};},from:tabela=>{let q; q=new Proxy({}, {get(_,key){if(key==='then')return(resolve,reject)=>Promise.resolve(erroBanco?{data:null,error:{message:'falha de gravação simulada'}}:{data:globalThis.__testeLinhas??[],error:null}).then(resolve,reject);if(key==='maybeSingle')return async()=>({data:null,error:null});return()=>q;}});operacoes.push({tabela});return q;}};
 globalThis.__testeBanco=banco;globalThis.__testeRevogada=revogada;globalThis.__testeLinhas=linhas;
 globalThis.Deno={env:{get:()=> 'teste',toObject:()=>({})},serve:fn=>handler=fn};
 let s=await readFile(new URL(`../supabase/functions/${nome}/index.ts`,import.meta.url),'utf8');
 s=s.replace(/import \{ createClient \} from [^;]+;/,'const createClient=()=>globalThis.__testeBanco;')
 .replace(/import \{ verificarJwt, crachaRevogado \} from [^;]+;/,`const verificarJwt=async token=>token==='direcao'?{master:true,sub:'direcao'}:token==='glossario'?{sub:'pessoa',perms:['glossario']}:token==='vendas'?{sub:'vendas',perms:['orcamentos']}:token==='cobranca'?{sub:'cobranca',perms:['contas-atrasadas']}:token==='documentos'?{sub:'documentos',perms:['documentos']}:token==='manutencao'?{sub:'manutencao',perms:['manutencoes']}:null;const crachaRevogado=async()=>globalThis.__testeRevogada;`);
 s='const console={...globalThis.console,error:()=>{}};\n'+s;
 const bundle=await build({stdin:{contents:s,loader:'ts',resolveDir:fileURLToPath(new URL('../supabase/functions/'+nome+'/',import.meta.url))},bundle:true,format:'esm',platform:'neutral',write:false});const code=bundle.outputFiles[0].text;await import('data:text/javascript;base64,'+Buffer.from(code+'\n//'+Math.random()).toString('base64'));
 return {operacoes,chamar:async (token,body)=>{const r=await handler(new Request('https://teste.invalid',{method:'POST',headers:{authorization:`Bearer ${token}`},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()};}};
}
test('restauração não informa sucesso quando o banco recusa a gravação',async()=>{
 const f=await funcao('painel-backup',{erroBanco:true});
 const r=await f.chamar('direcao',{action:'restaurar',backup:{versao:2,sistema:'painel',painel:{config:{parametros:{teste:1}}}}});
 assert.equal(r.status,500);assert.notEqual(r.body.ok,true);
});
test('todas as operações privilegiadas de backup recusam sessão revogada',async()=>{
 const f=await funcao('painel-backup',{revogada:true});
 for(const action of ['status','restaurar','registrarManual','exportar','backupAgora']) {
  const r=await f.chamar('direcao',{action,backup:{versao:2,sistema:'painel',painel:{}}});
  assert.equal(r.status,401,action);assert.equal(r.body.semSessao,true,action);
 }
 assert.equal(f.operacoes.length,0,'sessão revogada não chega aos dados');
});
test('perfil de Glossário não lê nem escreve marcações comerciais e financeiras',async()=>{
 const f=await funcao('painel-config');
 for(const chave of ['ov_rec','ov_orc'])for(const action of ['get','merge']){
  const r=await f.chamar('glossario',{action,chave,patch:{exemplo:{motivo:'fictício'}}});assert.equal(r.status,403,`${action} ${chave}`);
 }
});
test('perfil autorizado mantém acesso às próprias marcações de orçamentos',async()=>{
 const f=await funcao('painel-config');const r=await f.chamar('vendas',{action:'get',chave:'ov_orc'});assert.equal(r.status,200);
});

test('substituição integral antiga é recusada sem apagar registros',async()=>{
 const f=await funcao('painel-config');
 for(const chave of ['config','ov_rec','ov_orc','compromissos','patrimonio'])assert.equal((await f.chamar('direcao',{action:'set',chave,valor:{}})).status,403);
 assert.equal(f.operacoes.length,0);
});

test('matriz de permissões confirma direção, vendas, cobrança e Glossário',async()=>{
 for(const perfil of ['direcao','vendas','cobranca','glossario']){
  const f=await funcao('painel-config');
  for(const chave of ['ov_rec','ov_orc'])for(const action of ['get','merge']){
   const permitido=perfil==='direcao'||(perfil==='vendas'&&chave==='ov_orc')||(perfil==='cobranca'&&chave==='ov_rec');
   const r=await f.chamar(perfil,{action,chave,patch:{ficticio:{motivo:'exemplo'}}});
   assert.equal(r.status,permitido?200:403,`${perfil}: ${action} ${chave}`);
  }
 }
});

/* DOCUMENTOS E ATIVOS — a tela nao tinha modulo nenhum ate 14/09/2026.
   A rota abria sem `Restrito`, o item entrava no menu fora do filtro, e o
   `MODULO_DO_TIPO` do painel-ativos so cobria marketing/licitacao/predial:
   documento, veiculo, maquina e seguro caiam no `if (!mod) return true`.
   Uma conta com um unico modulo de consulta lia E APAGAVA as certidoes da
   empresa, o contrato social, as apolices com a importancia segurada e a
   ficha dos carros. Esconder o item no menu nao resolvia nada: o corte que
   vale e este aqui, na porta de dados.

   `vendas` abaixo e exatamente o cenario do relatorio: a direcao criou a
   conta e marcou so "Orcamentos". */
const ABERTOS = ['documento', 'veiculo', 'maquina', 'seguro'];

test('conta com um módulo só não GRAVA documento, veículo, máquina nem seguro', async () => {
 const f = await funcao('painel-ativos');
 for (const tipo of ABERTOS) {
  const r = await f.chamar('vendas', {action:'salvar', item:{tipo, nome:'Certidão fictícia'}});
  assert.equal(r.status, 403, `salvar ${tipo} devia ser recusado`);
 }
 assert.equal(f.operacoes.filter(o=>o.nome).length, 0, 'recusa não chega a gravar');
});

test('conta com um módulo só não LISTA documento, veículo, máquina nem seguro', async () => {
 const f = await funcao('painel-ativos', {linhas: [
  ...ABERTOS.map(tipo => ({registro:{id:`${tipo}-1`, tipo, nome:`${tipo} da casa`}})),
  // tipo que o mapa nao conhece: tem de cair fora tambem (recusa por padrao).
  {registro:{id:'x-1', tipo:'inventado', nome:'tipo sem dono'}},
 ]});
 const r = await f.chamar('vendas', {action:'listar'});
 assert.equal(r.status, 200);
 assert.deepEqual(r.body.itens, [], 'nada desses tipos pode atravessar a listagem');
});

test('quem recebeu Documentos e ativos grava e lê os quatro tipos', async () => {
 const f = await funcao('painel-ativos', {linhas: ABERTOS.map(tipo => ({registro:{id:`${tipo}-1`, tipo, nome:'x'}}))});
 for (const tipo of ABERTOS) {
  const r = await f.chamar('documentos', {action:'salvar', item:{tipo, nome:'Alvará'}});
  assert.notEqual(r.status, 403, `${tipo} devia passar para quem tem o módulo`);
 }
 const l = await f.chamar('documentos', {action:'listar'});
 assert.deepEqual(l.body.itens.map(i=>i.tipo).sort(), [...ABERTOS].sort());
});

test('quem cuida de Manutenções continua cadastrando veículo e máquina — e só isso', async () => {
 const f = await funcao('painel-ativos');
 // O mesmo carro tem duas telas: a validade do IPVA em Documentos e o gasto
 // em Manutencoes. Exigir so `documentos` trancaria a manutencao fora do
 // proprio cadastro dela.
 for (const tipo of ['veiculo','maquina','predial']) {
  const r = await f.chamar('manutencao', {action:'salvar', item:{tipo, nome:'Van'}});
  assert.notEqual(r.status, 403, `${tipo} devia passar para Manutenções`);
 }
 for (const tipo of ['documento','seguro']) {
  const r = await f.chamar('manutencao', {action:'salvar', item:{tipo, nome:'CND'}});
  assert.equal(r.status, 403, `${tipo} não é de Manutenções`);
 }
});

test('sem crachá nenhum a porta de ativos não responde', async () => {
 const f = await funcao('painel-ativos');
 for (const action of ['listar','salvar','remover','lixeira','restaurar','guardarArquivo','lerArquivo']) {
  const r = await f.chamar('nenhum', {action, id:'documento-1', item:{tipo:'documento',nome:'x'}, base64:'AA'});
  assert.equal(r.status, 401, action);
 }
});

/* SETOR: MANUTENÇÕES LÊ, PATRIMÔNIO MANDA.
 *
 * Até 15/09/2026 a chave `setores` valia só para `patrimonio`, e `barraChave`
 * respondia a mesma coisa para ler e para gravar. Quem tinha Manutenções e não
 * tinha Patrimônio levava 403 ao LER a lista de setores; o `Promise.all` de
 * src/pages/Manutencoes.jsx caía inteiro, `itens` ficava null, e a tela virava
 * a página de erro dizendo "Você não tem acesso a este módulo" — sobre um
 * módulo que a pessoa TEM. Eram 2 das 10 contas.
 *
 * O conserto abre a LEITURA e mantém a escrita fechada: setor apagado desmancha
 * a etiqueta de todo bem que estava nele, e isso continua sendo do Patrimônio.
 * O teste do caso ruim vem primeiro de propósito — é ele que falha se alguém
 * "simplificar" o LEITORES_EXTRA para valer nos dois sentidos.
 */
test('quem tem Manutenções LÊ os setores mas não os altera', async () => {
 const f = await funcao('painel-config');
 // O caso ruim: a leitura liberada não pode ter levado a escrita junto.
 for (const [action, corpo] of [
   ['merge', { patch: { qualquer: { sigla: 'XXX', nome: 'Inventado' } } }],
   ['removerId', { id: 'qualquer' }],
 ]) {
  const r = await f.chamar('manutencao', { action, chave: 'setores', ...corpo });
  assert.equal(r.status, 403, `${action} em setores tinha de ser recusado`);
 }
 // E o que o conserto existe para permitir.
 assert.equal((await f.chamar('manutencao', { action: 'get', chave: 'setores' })).status, 200,
   'ler setores com o módulo Manutenções é o motivo deste conserto');
});

test('o leitor extra de setores não vale para quem não tem nenhum dos dois módulos', async () => {
 const f = await funcao('painel-config');
 for (const action of ['get', 'merge'])
  assert.equal((await f.chamar('glossario', { action, chave: 'setores', patch: {} })).status, 403,
    `${action} em setores sem Patrimônio nem Manutenções`);
});

test('a leitura afrouxada não contaminou as outras chaves', async () => {
 const f = await funcao('painel-config');
 // `manutencoes` é leitor extra de `setores` e de mais nada. Se um dia alguém
 // trocar `LEITORES_EXTRA[chave]` por uma lista global, estas três caem.
 for (const chave of ['ov_orc', 'ov_rec', 'bancos'])
  assert.equal((await f.chamar('manutencao', { action: 'get', chave })).status, 403, `get ${chave}`);
});
