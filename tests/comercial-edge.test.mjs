import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';import vm from 'node:vm';import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{buildSync}=createRequire(require.resolve('vite'))('esbuild');
const source=readFileSync(new URL('../supabase/functions/painel-comercial/index.ts',import.meta.url),'utf8').replace(/^import.*createClient.*\n/m,'const createClient=globalThis.createClient;\n').replace(/^import.*verificarJwt.*\n/m,'const {verificarJwt,crachaRevogado}=globalThis;\n');
const code=buildSync({stdin:{contents:source,loader:'ts',resolveDir:fileURLToPath(new URL('../supabase/functions/painel-comercial/',import.meta.url))},bundle:true,write:false,format:'iife',platform:'node'}).outputFiles[0].text;
const sourceDados=readFileSync(new URL('../supabase/functions/painel-dados/index.ts',import.meta.url),'utf8').replace(/^import.*createClient.*\n/m,'const createClient=globalThis.createClient;\n').replace(/^import.*verificarJwt.*\n/m,'const {verificarJwt,crachaRevogado}=globalThis;\n');
const codeDados=buildSync({stdin:{contents:sourceDados,loader:'ts',resolveDir:fileURLToPath(new URL('../supabase/functions/painel-dados/',import.meta.url))},bundle:true,write:false,format:'iife',platform:'node'}).outputFiles[0].text;
const hoje=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}),filtro={de:hoje.slice(0,7)+'-01',ate:hoje};
function setup(){let handler,session={sub:'ana',nome:'Ana',vend:'Ana Silva',perms:['orcamentos']},revoked=false,fail=false;const cache=[
 {chave:'comercial_catalogo',valor:{completo:true,vendedores:[{id:'1',nome:'Ana Silva'},{id:'2',nome:'Bia Costa'}],produtos:[]}},
 {chave:'orcamentos',valor:[{id:'p1',numero:'1',clienteId:'c1',cliente:'Loja A',vendedorNome:'Ana Silva',valor:100,situacao:'aberto',dataCadastro:hoje},{id:'p2',clienteId:'c2',cliente:'Loja B',vendedorNome:'Bia Costa',valor:200,situacao:'aberto',dataCadastro:hoje}]},
 {chave:'crm_clientes',valor:{completo:true,clientes:{c1:{id:'c1',nome:'Loja A',responsavel:'Ana Silva'},c2:{id:'c2',nome:'Loja B',responsavel:'Bia Costa'}}}},
 {chave:'status',valor:{ultimaCompleta:hoje+'T12:00:00Z'}},{chave:'historico_status',valor:{ok:true,desde:'2020-01-01',ate:hoje}},{chave:'ordens',valor:[]}
 ,{chave:'comercial_carga_status',valor:{versao:1,atualizacaoEm:hoje+'T12:00:00Z',janelas:{ordens:[{desde:'2020-01-01',ate:hoje,concluidaEm:hoje+'T12:00:00Z'}]},tentativa:{estado:'concluida'}}}
 ].map(x=>({...x,atualizado_em:hoje+'T12:00:00Z'}));
 const cfg={vinculos:{ana:'1',bia:'2'},equipes:[],diasSemResposta:7,diasVencimento:3,diasReativacao:90};
 const ordens=[{id:'1',cliente:'Loja A',data:hoje,valor:100,vendedor:'Ana Silva',comercial:{tipo:'Normal',clienteId:'c1'}},{id:'2',cliente:'Loja B',data:hoje,valor:200,vendedor:'Bia Costa',comercial:{tipo:'Normal',clienteId:'c2'}}];
 const acoes=[{colecao:'comercial_acoes',id:'b',registro:{id:'b',vendedorId:'2',clienteId:'c2',cliente:'Loja B',data:hoje,descricao:'Segredo da Bia',status:'pendente',versao:1}}];let writes=0;
 const db={painel_cache:cache,painel_registros:[{colecao:'comercial_config',id:'regras',registro:cfg},...acoes],painel_ordens:ordens,painel_comercial_acoes:acoes};
 const sb={from(table){let rows=db[table]||[];const q={select(){return q},eq(k,v){rows=rows.filter(x=>x[k]===v);return q},in(k,vs){rows=rows.filter(x=>vs.includes(k==='registro->>vendedorId'?x.registro.vendedorId:x[k]));return q},gte(k,v){rows=rows.filter(x=>x[k]>=v);return q},lte(k,v){rows=rows.filter(x=>x[k]<=v);return q},order(){return q},range(a,b){return Promise.resolve(fail?{error:{}}:{data:structuredClone(rows.slice(a,b+1))})},maybeSingle(){return Promise.resolve(fail?{error:{}}:{data:structuredClone(rows[0]||null)})},then(fn){return Promise.resolve(fail?{error:{}}:{data:structuredClone(rows)}).then(fn)}};return q},async rpc(n,p){writes++;if(n==='painel_comercial_salvar_acao'){const old=acoes.find(a=>a.id===p.p_id);if(old && p.p_autorizados&&!p.p_autorizados.includes(old.registro.vendedorId))return {error:{}};if((old?.registro.versao??null)!==(p.p_versao??null))return {error:{}};const x={colecao:'comercial_acoes',id:p.p_id,registro:{...p.p_registro,versao:(old?.registro.versao||0)+1}};if(old){acoes[acoes.indexOf(old)]=x;db.painel_registros[db.painel_registros.indexOf(old)]=x;}else {acoes.push(x);db.painel_registros.push(x);}return {data:x.registro};}return {data:{}};}};
 vm.runInNewContext(code,{createClient:()=>sb,verificarJwt:async()=>session,crachaRevogado:async()=>revoked,Deno:{env:{get:()=> 'test'},serve:fn=>handler=fn},Response,Request,crypto,console});
 let handlerDados;const sbDados={...sb,rpc:async(n,p)=>{if(n==='painel_crm_cliente'){const c=cache.find(c=>c.chave==='crm_clientes');return {data:{completo:c.valor.completo,cliente:c.valor.clientes[p.p_id]||null,atualizadoEm:c.atualizado_em}};}return sb.rpc(n,p);}};
 vm.runInNewContext(codeDados,{createClient:()=>sbDados,verificarJwt:async()=>session,crachaRevogado:async()=>revoked,Deno:{env:{get:()=> 'test'},serve:fn=>handlerDados=fn},Response,Request,URL,crypto,console});
 return {db,cache,ordens,acoes,get writes(){return writes},session:s=>session=s,revoke:()=>revoked=true,fail:()=>fail=true,async call360(id){const r=await handlerDados(new Request('http://local?modulo=cliente360&id='+id,{headers:{authorization:'Bearer test'}}));return {status:r.status,...await r.json()}},async call(body={},auth=true){const r=await handler(new Request('http://local',{method:'POST',headers:auth?{authorization:'Bearer test'}:{},body:JSON.stringify({action:'painel',filtro,...body})}));return {status:r.status,...await r.json()}}};}
test('servidor exige sessão, revogação, módulo e vínculo oficial',async()=>{const t=setup();assert.equal((await t.call({},false)).status,401);t.session({sub:'x',perms:['agenda']});assert.equal((await t.call()).status,403);t.session({sub:'x',perms:['orcamentos']});assert.equal((await t.call()).codigo,'VINCULO_PENDENTE');t.revoke();assert.equal((await t.call()).status,401);});
test('resposta inteira só contém registros da vendedora; config privada não sai dentro de base',async()=>{const t=setup(),r=await t.call();assert.equal(r.status,200);assert.equal(r.relatorio.valor,10000);assert.equal(r.relatorio.pedidos,1);assert.equal(r.base.ordens.length,1);assert.equal(r.base.clientes.length,1);assert.equal(r.base.acoes.length,0);assert.equal(r.base.config.vinculos,undefined);assert.equal(r.config.vinculos,undefined);assert.equal(JSON.stringify(r).includes('Loja B'),false);assert.equal(JSON.stringify(r).includes('Segredo da Bia'),false);});
test('manipular filtros de outra vendedora ou equipe é bloqueado',async()=>{const t=setup();assert.equal((await t.call({filtro:{...filtro,vendedor:'2'}})).status,403);assert.equal((await t.call({filtro:{...filtro,equipe:'x'}})).status,403);});
test('gestor consolida e filtra; carteira segue o filtro',async()=>{const t=setup();t.session({sub:'gestor',master:true});assert.equal((await t.call()).relatorio.valor,30000);const r=await t.call({filtro:{...filtro,vendedor:'2'}});assert.equal(r.relatorio.valor,20000);assert.equal(r.base.clientes.length,1);assert.equal(r.base.clientes[0].id,'c2');});
test('ciclo de ação persistida: criar, concluir, reagendar e conflito preserva versão',async()=>{const t=setup(),acao={id:'a',clienteId:'c1',orcamentoId:'p1',vendedorId:'1',descricao:'Confirmar medidas',data:hoje};let r=await t.call({action:'salvarAcao',acao});assert.equal(r.status,200);assert.equal(r.acao.versao,1);assert.equal((await t.call()).relatorio.hojeA.length,1);r=await t.call({action:'salvarAcao',acao:{...acao,status:'concluida'},versao:1});assert.equal(r.status,200);assert.equal((await t.call()).relatorio.hojeA.length,0);r=await t.call({action:'salvarAcao',acao,versao:1});assert.equal(r.status,409);assert.equal(t.acoes.find(x=>x.id==='a').registro.status,'concluida');});
test('não permite sobrescrever ação alheia nem atribuir a outra pessoa nem vínculo de cliente forjado',async()=>{const t=setup(),a={id:'a',clienteId:'c1',orcamentoId:'p1',vendedorId:'1',descricao:'x',data:hoje};for(const acao of [{...a,id:'b'},{...a,vendedorId:'2'},{...a,clienteId:'c2'},{...a,orcamentoId:'p2'}])assert.equal((await t.call({action:'salvarAcao',acao})).status,403);assert.equal(t.writes,0);assert.equal((await t.call({action:'configurar',config:{}})).status,403);});
test('paginação não perde vendas depois de 500 registros; falha não vira zero',async()=>{const t=setup();t.ordens.splice(0,t.ordens.length,...Array.from({length:1001},(_,i)=>({id:String(i),data:hoje,valor:1,vendedor:'Ana Silva',comercial:{tipo:'Normal',clienteId:'c1'}})));const r=await t.call();assert.equal(r.status,200);assert.equal(r.relatorio.pedidos,1001);assert.equal(r.relatorio.valor,100100);t.fail();assert.equal((await t.call()).status,503);});
test('cache recente enriquece tipo e cliente sem duplicar a O.S. histórica',async()=>{const t=setup();t.ordens[0].comercial=null;t.cache.find(c=>c.chave==='ordens').valor=[{id:'1',data:hoje,valor:100,tipo:'Normal',clienteId:'c1',vendedor:'Ana Silva'}];const r=await t.call();assert.equal(r.relatorio.pedidos,1);assert.equal(r.relatorio.incompletas,0);assert.equal(r.relatorio.clientes[0].centavos,10000);});
test('retornos existentes da mesa entram no painel sem ressuscitar negociação encerrada',async()=>{const t=setup();t.db.painel_registros.push({colecao:'ov_orc',id:'p1',registro:{proximoToque:hoje,nota:'Retorno antigo'}});let r=await t.call();assert.equal(r.relatorio.hojeA.length,1);assert.equal(r.relatorio.hojeA[0].origem,'mesa');t.db.painel_registros.at(-1).registro.situacao='perdido';r=await t.call();assert.equal(r.relatorio.hojeA.length,0);assert.equal(r.relatorio.abertas.length,0);assert.equal(r.relatorio.propostas[0].situacaoErp,'aberto');});
test('metas só podem ser cadastradas pela direção e consultas respeitam a vendedora',async()=>{
 const t=setup();assert.equal((await t.call({action:'salvarMeta',meta:{vendedorId:'1',mes:hoje.slice(0,7),valor:1000}})).status,403);
 assert.equal(t.writes,0);
 t.db.painel_registros.push({colecao:'comercial_metas',id:'meta1',registro:{vendedorId:'1',mes:hoje.slice(0,7),valor:1000}},{colecao:'comercial_metas',id:'meta2',registro:{vendedorId:'2',mes:hoje.slice(0,7),valor:2000}});
 const r=await t.call();assert.equal(r.metas.length,1);assert.equal(r.metas[0].vendedorId,'1');
 t.session({sub:'diretor',nome:'Direção',master:true});assert.equal((await t.call({action:'salvarMeta',meta:{vendedorId:'1',mes:hoje.slice(0,7),valor:1000}})).status,200);
 assert.equal((await t.call({action:'salvarMeta',meta:{vendedorId:'inventada',mes:hoje.slice(0,7),valor:1000}})).status,400);
});
test('cliente de compra em 2024 continua na carteira em 2026 sem enviar pedidos antigos à tela',async()=>{
 const t=setup();t.cache.find(c=>c.chave==='crm_clientes').valor.clientes.c3={id:'c3',nome:'Cliente antigo',responsavel:'Bia Costa'};
 t.ordens.push({id:'antiga',cliente:'Cliente antigo',data:'2024-03-10',valor:350,vendedor:'Ana Silva',itens:[{produto:'Produto antigo'}],comercial:{tipo:'Normal',clienteId:'c3'}});
 const r=await t.call({filtro:{de:'2026-10-01',ate:'2026-10-07'}});assert.equal(r.status,200);
 const c=r.base.clientes.find(c=>c.id==='c3');assert.ok(c);assert.equal(c.naCarteira,false);assert.equal(c.temCompraHistorica,true);
 assert.deepEqual(c.origemCarteira,['compra_historica']);assert.equal(c.primeiraCompraHistorica,'2024-03-10');assert.equal(c.ultimaCompraHistorica,'2024-03-10');assert.equal(c.valorHistorico,35000);assert.equal(c.pedidosHistoricos,1);
 assert.equal(r.base.ordens.some(o=>o.id==='antiga'),false);assert.equal(JSON.stringify(r).includes('Produto antigo'),false);
 const outro=await t.call({filtro:{de:'2025-06-01',ate:'2025-06-30'}});assert.deepEqual(outro.base.clientes.find(c=>c.id==='c3'),c);
});
test('registrar contato de cliente histórico usa a mesma autorização da carteira',async()=>{
 const t=setup();t.cache.find(c=>c.chave==='crm_clientes').valor.clientes.c3={id:'c3',nome:'Cliente antigo',responsavel:'Bia Costa'};
 t.ordens.push({id:'antiga',cliente:'Cliente antigo',data:'2024-03-10',valor:350,vendedor:'Ana Silva',comercial:{tipo:'Normal',clienteId:'c3'}});
 const r=await t.call({action:'salvarAcao',acao:{id:'retomar',clienteId:'c3',vendedorId:'1',descricao:'Retomar contato',data:hoje}});
 assert.equal(r.status,200);assert.equal(r.acao.cliente,'Cliente antigo');assert.equal(t.writes,1);
});
test('compra identificada sem cadastro cria ficha mínima e nunca infere cliente pelo nome',async()=>{
 const t=setup();t.ordens.push({id:'sem-cadastro',cliente:'Cliente sem cadastro',data:'2024-03-10',valor:50,vendedor:'Ana Silva',comercial:{tipo:'Normal',clienteId:'c3'}},{id:'sem-id',cliente:'Loja B',data:'2023-02-10',valor:99,vendedor:'Ana Silva',comercial:{tipo:'Normal'}});
 const r=await t.call();assert.equal(r.status,200);const c=r.base.clientes.find(c=>c.id==='c3');assert.ok(c);assert.equal(c.nome,'Cliente sem cadastro');assert.equal(c.cadastroCompleto,false);assert.equal(c.email,undefined);assert.equal(c.telefone,undefined);
 assert.equal(r.base.clientes.some(c=>c.id==='c2'),false);assert.equal(r.base.coberturaHistorica.semCliente,1);assert.equal(r.base.coberturaHistorica.clientesSemCadastro,1);assert.equal(r.base.coberturaHistorica.completo,false);
});
test('histórico compartilhado soma apenas compras próprias elegíveis e falha fechado para nome abreviado',async()=>{
 const t=setup();t.ordens.push({id:'propria',cliente:'Loja A',data:'2024-01-01',valor:40,vendedor:'Ana Silva',comercial:{tipo:'Normal',clienteId:'c1'}},{id:'alheia',cliente:'Loja A',data:'2020-01-01',valor:999,vendedor:'Bia Costa',comercial:{tipo:'Normal',clienteId:'c1'}},{id:'abreviada',cliente:'Cliente sem identidade',data:'2022-01-01',valor:999,vendedor:'Ana',comercial:{tipo:'Normal',clienteId:'c4'}},{id:'cancelada',cliente:'Cliente cancelado',data:'2022-01-01',valor:999,vendedor:'Ana Silva',comercial:{tipo:'Normal',clienteId:'c5',cancelada:true}},{id:'brinde',cliente:'Cliente de brinde',data:'2022-01-01',valor:999,vendedor:'Ana Silva',comercial:{tipo:'Brinde',clienteId:'c6'}},{id:'sem-tipo',cliente:'Cliente incompleto',data:'2022-01-01',valor:999,vendedor:'Ana Silva',comercial:{clienteId:'c7'}});
 const r=await t.call();assert.equal(r.status,200);const c=r.base.clientes.find(c=>c.id==='c1');assert.equal(c.valorHistorico,14000);assert.equal(c.primeiraCompraHistorica,'2024-01-01');assert.equal(c.pedidosHistoricos,2);
 assert.deepEqual(r.base.clientes.map(c=>c.id),['c1']);assert.equal(r.base.coberturaHistorica.semTipo,1);assert.equal(r.base.coberturaHistorica.identificacaoPendente,true);assert.equal(JSON.stringify(r).includes('Cliente sem identidade'),false);
});
test('Cliente 360 abre cadastro e ficha mínima pela compra histórica, mantendo outro cliente bloqueado',async()=>{
 const t=setup();t.cache.find(c=>c.chave==='crm_clientes').valor.clientes['3']={id:'3',nome:'Cliente antigo',telefone:'12345678',responsavel:'Bia Costa'};
 t.ordens.push({id:'antiga',cliente:'Cliente antigo',data:'2024-03-10',valor:350,vendedor:'Ana Silva',comercial:{tipo:'Normal',clienteId:'3'}},{id:'sem-cadastro',cliente:'Cliente sem cadastro',data:'2024-03-11',valor:50,vendedor:'Ana Silva',comercial:{tipo:'Normal',clienteId:'4'}},{id:'alheia',cliente:'Cliente alheio',data:'2024-03-12',valor:90,vendedor:'Bia Costa',comercial:{tipo:'Normal',clienteId:'5'}});
 let r=await t.call360('3');assert.equal(r.status,200);assert.equal(r.cliente.telefone,'12345678');
 r=await t.call360('4');assert.equal(r.status,200);assert.equal(r.cliente.id,'4');assert.equal(r.cliente.cadastroCompleto,false);assert.equal(r.cliente.telefone,undefined);
 r=await t.call360('5');assert.equal(r.status,403);assert.equal(r.cliente,undefined);
 t.session({sub:'diretor',master:true});r=await t.call360('4');assert.equal(r.status,200);assert.equal(r.cliente.cadastroCompleto,false);
});
test('cobertura histórica não vira completa com data, valor ou tipo ausentes',async()=>{
 const t=setup();assert.equal((await t.call()).base.coberturaHistorica.completo,true);
 t.ordens.push({id:'tipo-ausente',cliente:'Loja A',data:'2024-01-01',valor:10,vendedor:'Ana Silva',comercial:{clienteId:'c1'}},{id:'valor-ausente',cliente:'Loja A',data:'2024-01-01',valor:null,vendedor:'Ana Silva',comercial:{tipo:'Normal',clienteId:'c1'}},{id:'data-ausente',cliente:'Loja A',data:null,valor:10,vendedor:'Ana Silva',comercial:{tipo:'Normal',clienteId:'c1'}});
 const r=await t.call(),c=r.base.coberturaHistorica;assert.equal(c.completo,false);assert.equal(c.ordensIncompletas,3);assert.equal(c.semTipo,1);assert.equal(c.semValor,1);assert.equal(c.semData,1);assert.equal(r.base.clientes[0].pedidosHistoricos,1);
});
test('cobertura bruta legada não prova carga comercial e janelas com lacuna continuam parciais',async()=>{
 const t=setup(),idx=t.cache.findIndex(c=>c.chave==='comercial_carga_status'),[carga]=t.cache.splice(idx,1);
 let c=(await t.call()).base.coberturaHistorica;assert.equal(c.completo,false);assert.equal(c.estado,'a_atualizar');assert.equal(c.fonte,'legado');
 carga.valor.janelas.ordens=[{desde:'2020-01-01',ate:'2023-12-31',concluidaEm:hoje},{desde:'2025-01-01',ate:hoje,concluidaEm:hoje}];t.cache.push(carga);
 c=(await t.call()).base.coberturaHistorica;assert.equal(c.completo,false);assert.equal(c.estado,'parcial');assert.equal(c.ate,'2023-12-31');assert.equal(c.janelas.length,2);
});
test('gestão consolidada preserva compra identificada de vendedor antigo sem relaxar filtro de vendedor',async()=>{
 const t=setup();t.ordens.push({id:'antiga',cliente:'Cliente do histórico antigo',data:'2021-03-10',valor:350,vendedor:'Antigo vendedor',comercial:{tipo:'Normal',clienteId:'3'}});
 t.session({sub:'diretor',master:true});let r=await t.call(),c=r.base.clientes.find(c=>c.id==='3');assert.ok(c);assert.equal(c.valorHistorico,35000);assert.equal(c.cadastroCompleto,false);assert.equal(r.base.coberturaHistorica.identificacaoPendente,true);
 r=await t.call({filtro:{...filtro,vendedor:'1'}});assert.equal(r.base.clientes.some(c=>c.id==='3'),false);assert.equal(JSON.stringify(r).includes('Cliente do histórico antigo'),false);
});
test('cobertura comercial por recurso não infere janeiro pelo horário do cache nem atravessa lacunas',async()=>{
 const t=setup(),carga=t.cache.find(c=>c.chave==='comercial_carga_status').valor;
 carga.janelas={ordens:[{desde:'2020-01-01',ate:'2023-12-31',concluidaEm:hoje},{desde:'2025-01-01',ate:hoje,concluidaEm:hoje}],orcamentos:[{desde:'2026-08-01',ate:hoje,concluidaEm:hoje}]};
 const r=await t.call({filtro:{de:'2026-10-01',ate:'2026-10-07'}});assert.equal(r.base.cobertura.desde,'2025-01-01');assert.equal(r.base.cobertura.janelas.length,2);assert.equal(r.base.coberturaOrcamentos.desde,'2026-08-01');
 const lacuna=await t.call({filtro:{de:'2024-06-01',ate:'2024-06-30'}});assert.equal(lacuna.base.cobertura.desde,null);assert.equal(lacuna.base.coberturaOrcamentos.desde,null);assert.equal(lacuna.relatorio.completo,false);assert.equal(lacuna.relatorio.orcamentosCompletos,false);
});

test('consulta cadastral encontra cliente de outra carteira, mas não libera contatos, valores ou ações',async()=>{
 const t=setup(),c=t.cache.find(c=>c.chave==='crm_clientes').valor.clientes.c2;
 Object.assign(c,{razaoSocial:'Comércio Estação',documento:'12345678000190',telefone:'privado',email:'privado@example.com',nota:'segredo',valor:999,historico:['segredo']});
 let r=await t.call({action:'consultarClientes',busca:'comercio estacao'});assert.equal(r.status,200);assert.equal(r.total,1);assert.equal(r.clientes[0].responsavel,'Bia Costa');
 assert.deepEqual(Object.keys(r.clientes[0]).sort(),['documento','id','nome','razaoSocial','responsavel','status']);assert.equal(JSON.stringify(r).includes('segredo'),false);assert.equal(JSON.stringify(r).includes('privado'),false);
 r=await t.call({action:'consultarClientes',busca:'12.345.678/0001-90'});assert.equal(r.total,1);
 assert.equal((await t.call({action:'consultarClientes',busca:'12345678000190'})).total,1);
 assert.equal((await t.call()).base.clientes.some(c=>c.id==='c2'),false);
 assert.equal((await t.call({action:'salvarAcao',acao:{id:'forjada',clienteId:'c2',vendedorId:'1',descricao:'x',data:hoje}})).status,403);assert.equal(t.writes,0);
});
test('consulta global exige sessão, módulo, vínculo e fonte completa; não mascara erro como vazio',async()=>{
 const t=setup(),b={action:'consultarClientes',busca:'Loja'};
 assert.equal((await t.call(b,false)).status,401);t.session({sub:'x',perms:['agenda']});assert.equal((await t.call(b)).status,403);
 t.session({sub:'x',perms:['orcamentos']});assert.equal((await t.call(b)).codigo,'VINCULO_PENDENTE');t.session({sub:'ana',perms:['orcamentos']});
 t.cache.find(c=>c.chave==='crm_clientes').valor.completo=false;assert.equal((await t.call(b)).status,503);
});
test('consulta paginada é independente do período e não repete registros; entradas inválidas são rejeitadas',async()=>{
 const t=setup(),cs=t.cache.find(c=>c.chave==='crm_clientes').valor.clientes;
 for(let i=0;i<43;i++)cs['extra'+i]={id:'extra'+i,nome:'Cadastro '+String(i).padStart(2,'0'),responsavel:'Bia Costa'};
 const a=await t.call({action:'consultarClientes',busca:'cadastro',filtro:{de:'2020-01-01',ate:'2020-01-31'}}),b=await t.call({action:'consultarClientes',busca:'cadastro',pagina:2}),c=await t.call({action:'consultarClientes',busca:'cadastro',pagina:3});
 assert.equal(a.total,43);assert.equal(a.clientes.length,20);assert.equal(c.clientes.length,3);assert.equal(new Set([...a.clientes,...b.clientes,...c.clientes].map(c=>c.id)).size,43);
 for(const args of [{busca:''},{busca:'..'},{busca:'12'},{busca:{}},{busca:'x'.repeat(161)},{busca:'cadastro',pagina:-1},{busca:'cadastro',pagina:1.5},{busca:'cadastro',pagina:99}])assert.equal((await t.call({action:'consultarClientes',...args})).status,400);
 assert.equal((await t.call({action:'consultarClientes',busca:'Inexistente'})).total,0);
});
