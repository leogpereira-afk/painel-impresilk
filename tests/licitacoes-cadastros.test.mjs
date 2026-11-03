import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {transformSync} from 'esbuild';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import * as acesso from '../supabase/functions/_shared/patrimonio-acesso.mjs';
import {atenderCadastrosLicitacoes} from '../supabase/functions/_shared/licitacoes-cadastros-handler.mjs';
import {idCadastroLicitacoes,normalizarUrlPortal,prepararCadastro} from '../supabase/functions/_shared/licitacoes-cadastros.mjs';

const empresa='73405710-78db-461b-9d33-37a228fd62c0',outraEmpresa='83405710-78db-461b-9d33-37a228fd62c0',pessoa='63405710-78db-461b-9d33-37a228fd62c0',novoId='53405710-78db-461b-9d33-37a228fd62c0';
const linha=(colecao,id,registro)=>({colecao,id,registro:{id,...registro}});
const titulares=[linha('documentos_titulares',empresa,{tipo:'empresa',nome:'Empresa fictícia'}),linha('documentos_titulares',outraEmpresa,{tipo:'empresa',nome:'Outra empresa fictícia'}),linha('documentos_titulares',pessoa,{tipo:'pessoa',nome:'PESSOA-PRIVADA',pessoaId:'PESSOA-ID-PRIVADO'})];
const cadastro=(patch={})=>({cadastroId:novoId,nome:'Portal fictício',url:'https://fornecedores.example/portal',titularId:empresa,...patch});
const documento=(id='doc-ficticio',patch={})=>linha('ativo',id,{tipo:'documento',usoLicitacoes:true,titularId:empresa,nome:'Certidão fictícia',categoria:'Certidão',validade:'2027-01-01',temArquivo:true,anexos:[{nome:'ARQUIVO-PRIVADO',chave:'CAMINHO-PRIVADO'}],...patch});
function banco(rows=[],options={}){
 const estado={linhas:structuredClone([...titulares,...rows]),escritas:[],consultas:[]};
 const sb={from(tabela){assert.equal(tabela,'painel_registros');let filtros=[],de=0,ate=Infinity;const q={select(){return q;},eq(k,v){filtros.push([k,v]);return q;},order(){return q;},range(a,b){de=a;ate=b;return q;},async maybeSingle(){const r=run();return {...r,data:r.data?.[0]||null};},then(a,b){return Promise.resolve(run()).then(a,b);}};
  function run(){estado.consultas.push(structuredClone(filtros));if(options.falhaLeitura)return {error:{message:'DETALHE-PRIVADO'},data:null};return {data:structuredClone(estado.linhas.filter(r=>filtros.every(([k,v])=>r[k]===v)).sort((a,b)=>a.id.localeCompare(b.id)).slice(de,ate+1)),error:null};}return q;
 },async rpc(n,p){assert.equal(n,'painel_registro_gravar');if(options.antesRpc)await options.antesRpc(n,p,estado);const r=estado.linhas.find(r=>r.colecao===p.p_colecao&&r.id===p.p_id);if(JSON.stringify(r?.registro||null)!==JSON.stringify(p.p_anterior||null))return {data:null,error:{code:'40001',message:'DETALHE-PRIVADO'}};const reg=structuredClone(p.p_registro);if(r)r.registro=reg;else estado.linhas.push(linha(p.p_colecao,p.p_id,reg));estado.escritas.push(structuredClone(p));return {data:reg,error:null};}};
 return {sb,...estado};
}
function ambiente({perms=['licitacoes','documentos'],rows=[],options={},db=banco(rows,options),sessao=true,revogado=()=>false,jwt}={}){
 let handler;const source=readFileSync(new URL('../supabase/functions/painel-ativos/index.ts',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'');
 vm.runInNewContext(transformSync(source,{loader:'ts',target:'es2022'}).code,{...acesso,atenderCadastrosLicitacoes,Deno:{env:{get:()=> 'teste'},serve:f=>handler=f},createClient:()=>db.sb,verificarJwt:jwt||async function(){return sessao?{sub:'operador-ficticio',nome:'Operador fictício',perms}:null;},crachaRevogado:revogado,crypto:webcrypto,Request,Response,URL,TextEncoder,console:{error(){}}});
 return {...db,async chamar(corpo,token=true){const r=await handler(new Request('https://test.invalid',{method:'POST',headers:token?{authorization:'Bearer teste'}:{},body:JSON.stringify(corpo)}));return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control')};}};
}
const gravar=(a,item=cadastro(),versao)=>a.chamar({action:'salvarCadastroLicitacoes',item,versao});

test('cadastros exigem sessão e Licitações; Documentos isolado não concede acesso',async()=>{
 for(const a of [ambiente({sessao:false}),ambiente({perms:['documentos']}),ambiente({perms:[]})])for(const action of ['listarCadastrosLicitacoes','salvarCadastroLicitacoes','arquivarCadastroLicitacoes']){const r=await a.chamar({action,item:cadastro(),id:novoId});assert.ok([401,403].includes(r.status));assert.equal(a.consultas.length,0);assert.equal(a.escritas.length,0);}
 assert.equal((await ambiente().chamar({action:'listarCadastrosLicitacoes'},false)).status,401);
});
test('revogação estrita inicial, antes da gravação e após leitura bloqueia dados',async()=>{
 for(const bloqueio of [1,2]){let n=0;const a=ambiente({revogado:async(_sb,_s,_sessao,estrito)=>estrito&&++n===bloqueio}),r=await gravar(a);assert.equal(r.status,401);assert.equal(a.escritas.length,0);assert.equal('item' in r.body,false);}
 let n=0;const a=ambiente({revogado:async(_sb,_s,_sessao,estrito)=>estrito&&++n===2}),r=await a.chamar({action:'listarCadastrosLicitacoes'});assert.equal(r.status,401);assert.equal('itens' in r.body,false);
});
test('JWT expirado durante consulta não entrega lista ou grava',async()=>{
 let n=0;const a=ambiente({jwt:async()=>++n<3?{sub:'ficticio',perms:['licitacoes']}:null});const r=await gravar(a);assert.equal(r.status,401);assert.equal(a.escritas.length,0);
});
test('criação não concede ativo; servidor define ID, datas, autoria e histórico',async()=>{
 const a=ambiente(),r=await gravar(a);assert.equal(r.status,200);assert.equal(r.cache,'no-store');const {item}=r.body;assert.equal(item.id,await idCadastroLicitacoes(empresa,cadastro().url));assert.notEqual(item.id,novoId);assert.equal(item.situacao,'planejado');assert.equal(item.criadoPor,'Operador fictício');assert.equal(item.criadoEm,item.atualizadoEm);assert.equal(item.historico.length,1);assert.equal(item.historico[0].antes,null);assert.equal(item.historico[0].depois.situacao,'planejado');assert.equal(a.escritas[0].p_anterior,null);assert.equal(a.escritas[0].p_colecao,'licitacoes_cadastros');
});
test('ID determinístico une protocolo, query, hash, barra final e host sem caixa',async()=>{
 const primeiro=await idCadastroLicitacoes(empresa,'https://EXAMPLE.com:443/portal/?utm_source=ficticio#cadastro');
 assert.equal(primeiro,await idCadastroLicitacoes(empresa,'http://example.com/portal?etapa=1'));
 assert.notEqual(primeiro,await idCadastroLicitacoes(outraEmpresa,'https://example.com/portal'));
 assert.equal(normalizarUrlPortal('https://EXAMPLE.com:443/portal/?x=1#ficha'),'example.com/portal');
});
test('duplicidade retorna conflito claro, mesmo com cadastroId diferente, sem alterar vencedor',async()=>{
 const a=ambiente(),first=await gravar(a),antes=structuredClone(a.linhas);const r=await gravar(a,cadastro({cadastroId:outraEmpresa,nome:'Não sobrescrever',url:cadastro().url+'/?filtro=1'}));assert.equal(r.status,409);assert.match(r.body.erro,/Já existe.*portal.*empresa/);assert.deepEqual(a.linhas,antes);assert.equal(a.escritas.length,1);assert.equal(first.body.item.nome,'Portal fictício');
});
test('duas criações simultâneas preservam apenas o vencedor',async()=>{
 const a=ambiente(),rs=await Promise.all([gravar(a),gravar(a,cadastro({cadastroId:outraEmpresa,nome:'Segunda sessão'}))]);assert.deepEqual(rs.map(r=>r.status).sort(),[200,409]);assert.equal(a.escritas.length,1);assert.equal(a.linhas.filter(r=>r.colecao==='licitacoes_cadastros').length,1);
});
test('editar exige versão, preserva histórico e campos omitidos; nunca cria por id',async()=>{
 const a=ambiente(),first=(await gravar(a,cadastro({protocolo:'PROTOCOLO-FICTICIO',situacao:'enviado',enviadoEm:'2026-10-01'}))).body.item;
 assert.equal((await gravar(a,{id:first.id,nome:'Sem versão'})).status,409);
 assert.equal((await gravar(a,{id:novoId,nome:'Não criar'},'')).status,409);
 const r=await gravar(a,{id:first.id,nome:'Novo nome',situacao:'em-analise'},first.atualizadoEm);assert.equal(r.status,200);assert.equal(r.body.item.protocolo,first.protocolo);assert.equal(r.body.item.historico.length,2);assert.deepEqual(r.body.item.historico[0],first.historico[0]);assert.equal(r.body.item.historico[1].antes.situacao,'enviado');assert.equal(r.body.item.historico[1].depois.situacao,'em-analise');assert.notEqual(r.body.item.atualizadoEm,first.atualizadoEm);assert.equal(r.body.item.criadoEm,first.criadoEm);
 assert.equal((await gravar(a,{id:first.id,nome:'Edição antiga'},first.atualizadoEm)).status,409);
});
test('concorrência entre leitura e RPC recusa sobrescrever outra edição',async()=>{
 let correr=false;const a=ambiente({options:{antesRpc(_n,p,db){if(correr)db.linhas.find(r=>r.id===p.p_id).registro.atualizadoEm='outra-versao';}}}),first=(await gravar(a)).body.item;correr=true;const r=await gravar(a,{id:first.id,nome:'Edição vencida'},first.atualizadoEm);assert.equal(r.status,409);assert.equal(a.escritas.length,1);assert.equal(a.linhas.find(r=>r.id===first.id).registro.nome,'Portal fictício');
});
test('arquivar e reativar são edições versionadas e preservam os dados',async()=>{
 const a=ambiente(),first=(await gravar(a,cadastro({situacao:'ativo',protocolo:'FICTICIO'}))).body.item;
 assert.equal((await a.chamar({action:'arquivarCadastroLicitacoes',id:first.id,versao:'errada'})).status,409);
 const archived=(await a.chamar({action:'arquivarCadastroLicitacoes',id:first.id,versao:first.atualizadoEm})).body.item;assert.equal(archived.situacao,'arquivado');assert.equal(archived.historico.at(-1).acao,'arquivar');assert.equal((await gravar(a)).status,409);
 const r=await gravar(a,{id:first.id,situacao:'ativo'},archived.atualizadoEm);assert.equal(r.status,200);assert.equal(r.body.item.protocolo,'FICTICIO');assert.equal(r.body.item.historico.length,3);assert.equal(a.linhas.filter(x=>x.colecao==='licitacoes_cadastros').length,1);
});
test('empresa e portal são identidade imutável; variantes da mesma URL são editáveis',async()=>{
 const a=ambiente(),first=(await gravar(a)).body.item;
 for(const patch of [{titularId:outraEmpresa},{url:'https://outro.example/portal'}])assert.equal((await gravar(a,{id:first.id,...patch},first.atualizadoEm)).status,409);
 assert.equal((await gravar(a,{id:first.id,url:cadastro().url+'/?pagina=2#formulario'},first.atualizadoEm)).status,200);
});
test('campos fechados recusam histórico, storage, data/autoria e metadados forjados',async()=>{
 for(const patch of [{historico:[]},{criadoEm:'2026-01-01'},{criadoPor:'Outro'},{atualizadoEm:'forjada'},{atualizadoPor:'Outro'},{arquivo:{chave:'segredo'}},{anexos:[]},{titularNome:'Nome livre'},{temArquivo:true},{valor:1}]){const a=ambiente();assert.equal((await gravar(a,cadastro(patch))).status,422);assert.equal(a.escritas.length,0);}
});
test('identificadores, enums, texto, datas e booleano inválidos não escrevem',async()=>{
 for(const patch of [{cadastroId:'nome livre'},{id:novoId},{categoria:'outro'},{situacao:'vencido'},{prioridade:'urgente'},{nome:''},{nome:'x'.repeat(201)},{abrangencia:'x'.repeat(501)},{servicos:'x'.repeat(1001)},{protocolo:'x'.repeat(181)},{observacao:'x'.repeat(4001)},{exigencias:'x'.repeat(4001)},{proximaAcao:'x'.repeat(2001)},{semVencimento:'sim'},{enviadoEm:'2026-02-30'},{validade:'0000-01-01'},{prazoAcao:'amanhã'},{verificadoEm:123},{validade:'2026-01-01',enviadoEm:'2026-02-01'}]){const a=ambiente();assert.equal((await gravar(a,cadastro(patch))).status,422,JSON.stringify(patch));assert.equal(a.escritas.length,0);}
});
test('links aceitam somente HTTP/HTTPS sem credenciais e sem caracteres de controle',async()=>{
 for(const campo of ['url','fonteUrl'])for(const valor of ['javascript:alert(1)','data:text/plain,oi','https://usuario:senha@example.com','/relativo','https://example.com/\nsecreto','https://example.com/'+ 'x'.repeat(2000),'https:\\example.com']){const a=ambiente();assert.equal((await gravar(a,cadastro({[campo]:valor}))).status,422,valor);assert.equal(a.escritas.length,0);}
});
test('titular é empresa confirmada por ID, nunca nome livre, pessoa ou ausente',async()=>{
 for(const titularId of ['',pessoa,'Empresa fictícia',novoId]){const a=ambiente();assert.equal((await gravar(a,cadastro({titularId}))).status,422);assert.equal(a.escritas.length,0);}
});
test('sem vencimento limpa validade, mas prazo antigo não muda situação escolhida',async()=>{
 const a=ambiente(),r=await gravar(a,cadastro({validade:'2020-01-01',semVencimento:true,situacao:'ativo',prazoAcao:'2020-01-01'}));assert.equal(r.status,200);assert.equal(r.body.item.validade,'');assert.equal(r.body.item.situacao,'ativo');assert.equal(r.body.item.prazoAcao,'2020-01-01');
});
test('Documentos permite vínculo somente de controle canônico empresarial marcado e do titular',async()=>{
 const privados=[documento('pessoal',{titularId:pessoa,nome:'PESSOAL-PRIVADO'}),documento('seguro',{tipo:'seguro'}),documento('garantia',{tipo:'garantia'}),documento('avcb',{tipo:'predial',categoria:'AVCB'}),documento('sem-marca',{usoLicitacoes:false}),documento('outra',{titularId:outraEmpresa}),documento('hist-pessoal',{pessoalHistorico:true}),documento('origem-pessoal',{versoes:[{snapshot:{titularId:pessoa}}]}),documento('seguranca',{origem:'seguranca'}),documento('bem-ausente',{ativoIds:['nao-existe']})];
 for(const doc of privados){const a=ambiente({rows:[doc]});assert.equal((await gravar(a,cadastro({documentoIds:[doc.id]}))).status,403,doc.id);assert.equal(a.escritas.length,0);}
 const a=ambiente({rows:[documento()]}),r=await gravar(a,cadastro({documentoIds:['doc-ficticio']}));assert.equal(r.status,200);assert.deepEqual(r.body.item.documentoIds,['doc-ficticio']);
});
test('pessoais históricos permanecem fora mesmo com documentos-pessoais e master',async()=>{
 const rows=[documento('pessoal',{titularId:pessoa}),documento('historico',{pessoalHistorico:true})];const a=ambiente({perms:['*'],rows}),r=await a.chamar({action:'listarCadastrosLicitacoes'});assert.deepEqual(r.body.documentos,[]);for(const id of ['pessoal','historico'])assert.equal((await gravar(a,cadastro({documentoIds:[id]}))).status,403);
});
test('sem Documentos pode salvar cadastro, mas não consultar o acervo nem vincular IDs',async()=>{
 const a=ambiente({perms:['licitacoes'],rows:[documento()]});assert.equal((await gravar(a)).status,200);const r=await a.chamar({action:'listarCadastrosLicitacoes'});assert.equal(r.body.podeVincularDocumentos,false);assert.deepEqual(r.body.documentos,[]);assert.ok(a.consultas.every(fs=>!fs.some(([k,v])=>k==='colecao'&&['ativo','ativo_lixeira'].includes(v))));
 assert.equal((await gravar(ambiente({perms:['licitacoes']}),cadastro({documentoIds:['doc-ficticio']}))).status,403);
});
test('IDs documentais inválidos, duplicados ou acima do limite não escrevem',async()=>{
 for(const documentoIds of ['doc',{},['nome livre'],['doc','doc'],[123],Array.from({length:31},(_,i)=>'doc-'+i)]){const a=ambiente();assert.equal((await gravar(a,cadastro({documentoIds}))).status,422);assert.equal(a.escritas.length,0);}
});
test('projeção fechada não expõe nomes pessoais, arquivos, snapshots livres ou ID restrito',async()=>{
 const a=ambiente({rows:[documento(),documento('ID-RESTRITO',{pessoalHistorico:true,nome:'PESSOAL-PRIVADO'})]}),first=(await gravar(a,cadastro({documentoIds:['doc-ficticio']}))).body.item;
 const row=a.linhas.find(r=>r.id===first.id);row.registro.documentoIds.push('ID-RESTRITO');row.registro.extra='EXTRA-PRIVADO';row.registro.historico[0].depois.segredo='SEGREDO-PRIVADO';
 const r=await a.chamar({action:'listarCadastrosLicitacoes'});assert.equal(r.status,200);assert.equal(r.body.itens[0].documentosRestritos,true);assert.deepEqual(r.body.itens[0].documentoIds,['doc-ficticio']);assert.equal(r.body.documentos.length,1);assert.doesNotMatch(JSON.stringify(r.body),/PESSOA-PRIVADA|PESSOA-ID-PRIVADO|PESSOAL-PRIVADO|ID-RESTRITO|ARQUIVO-PRIVADO|CAMINHO-PRIVADO|EXTRA-PRIVADO|SEGREDO-PRIVADO/);
 const semDocs=ambiente({db:a,perms:['licitacoes']}),s=await semDocs.chamar({action:'listarCadastrosLicitacoes'});assert.deepEqual(s.body.itens[0].documentoIds,[]);assert.equal(s.body.itens[0].documentosRestritos,true);assert.doesNotMatch(JSON.stringify(s.body),/doc-ficticio|Certidão fictícia|ID-RESTRITO/);
});
test('edição sem IDs preserva vínculos sem acesso; seleção parcial preserva os restritos',async()=>{
 const a=ambiente({rows:[documento(),documento('restrito')]}),first=(await gravar(a,cadastro({documentoIds:['doc-ficticio','restrito']}))).body.item;a.linhas.find(r=>r.id==='restrito').registro.usoLicitacoes=false;
 const semDocs=ambiente({db:a,perms:['licitacoes']}),edit=(await gravar(semDocs,{id:first.id,nome:'Alteração sem Documentos'},first.atualizadoEm)).body.item;assert.deepEqual(a.linhas.find(r=>r.id===first.id).registro.documentoIds,['doc-ficticio','restrito']);assert.deepEqual(edit.documentoIds,[]);
 const r=await gravar(a,{id:first.id,documentoIds:[]},edit.atualizadoEm);assert.equal(r.status,200);assert.deepEqual(a.linhas.find(r=>r.id===first.id).registro.documentoIds,['restrito']);assert.equal(r.body.item.documentosRestritos,true);
 assert.equal((await gravar(semDocs,{id:first.id,documentoIds:[]},r.body.item.atualizadoEm)).status,403);
});
test('documento retirado mantém vínculo histórico restrito e não recebe novo vínculo',async()=>{
 const a=ambiente({rows:[documento()]}),first=(await gravar(a,cadastro({documentoIds:['doc-ficticio']}))).body.item;a.linhas.find(r=>r.id==='doc-ficticio').colecao='ativo_lixeira';const r=await gravar(a,{id:first.id,documentoIds:[]},first.atualizadoEm);assert.equal(r.status,200);assert.equal(r.body.item.documentosRestritos,true);assert.deepEqual(a.linhas.find(r=>r.id===first.id).registro.documentoIds,['doc-ficticio']);
 assert.equal((await gravar(a,cadastro({url:'https://outro.example',documentoIds:['doc-ficticio']}))).status,403);
});
test('listagem pagina acervo completo e falha de leitura não vira sucesso vazio',async()=>{
 const rows=Array.from({length:1001},(_,i)=>documento('doc-'+String(i).padStart(4,'0'))),a=ambiente({rows});const r=await a.chamar({action:'listarCadastrosLicitacoes'});assert.equal(r.body.documentos.length,1001);assert.equal(a.escritas.length,0);
 const falha=await ambiente({options:{falhaLeitura:true}}).chamar({action:'listarCadastrosLicitacoes'});assert.equal(falha.status,500);assert.equal('itens' in falha.body,false);assert.doesNotMatch(JSON.stringify(falha.body),/DETALHE-PRIVADO/);
});
test('cadastro irregular pessoal não é listado nem editável',async()=>{
 const a=ambiente({rows:[linha('licitacoes_cadastros',novoId,{titularId:pessoa,nome:'CADASTRO-PESSOAL',atualizadoEm:'v1'})]});const r=await a.chamar({action:'listarCadastrosLicitacoes'});assert.deepEqual(r.body.itens,[]);assert.doesNotMatch(JSON.stringify(r.body),/CADASTRO-PESSOAL/);assert.equal((await gravar(a,{id:novoId,nome:'Não mover'},'v1')).status,403);
});
test('PostgreSQL local: RPC existente serializa cadastro determinístico e recusa edição vencida',async()=>{
 const db=new PGlite();try{await db.exec('create table painel_registros(colecao text,id text,registro jsonb,atualizado_em timestamptz default now(),primary key(colecao,id));');await db.exec(readFileSync(new URL('../supabase/migrations/20260906_proteger_registro_retirado.sql',import.meta.url),'utf8'));
 const id=await idCadastroLicitacoes(empresa,cadastro().url),original={id,nome:'Primeiro fictício',atualizadoEm:'v1',historico:[{situacao:'planejado'}]};await db.query('select painel_registro_gravar($1,$2,$3,$4)',['licitacoes_cadastros',id,original,null]);
 await assert.rejects(db.query('select painel_registro_gravar($1,$2,$3,$4)',['licitacoes_cadastros',id,{...original,nome:'Segundo'},null]),e=>e.code==='40001');const novo={...original,atualizadoEm:'v2',historico:[...original.historico,{situacao:'ativo'}]};await db.query('select painel_registro_gravar($1,$2,$3,$4)',['licitacoes_cadastros',id,novo,original]);await assert.rejects(db.query('select painel_registro_gravar($1,$2,$3,$4)',['licitacoes_cadastros',id,original,original]),e=>e.code==='40001');assert.deepEqual((await db.query('select registro from painel_registros')).rows[0].registro,novo);
 }finally{await db.close();}
});
test('validação pura não modifica campos recebidos nem o registro anterior',()=>{
 const item=cadastro(),antes=structuredClone(item);prepararCadastro(item,null,new Map(titulares.map(r=>[r.id,r.registro])));assert.deepEqual(item,antes);
});
