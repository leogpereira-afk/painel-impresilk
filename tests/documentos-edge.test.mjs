import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {transformSync} from 'esbuild';
import vm from 'node:vm';
import * as acesso from '../supabase/functions/_shared/patrimonio-acesso.mjs';
import {atenderDocumentos} from '../supabase/functions/_shared/documentos-handler.mjs';
import {temHistoricoPessoal} from '../supabase/functions/_shared/documentos.mjs';
import {validarVinculoPessoa} from '../supabase/functions/_shared/patrimonio-pessoas.mjs';
const empresa='73405710-78db-461b-9d33-37a228fd62c0',pessoa='63405710-78db-461b-9d33-37a228fd62c0',novoId='53405710-78db-461b-9d33-37a228fd62c0',pessoaRH='43405710-78db-461b-9d33-37a228fd62c0';
const linha=(colecao,id,registro)=>({colecao,id,registro:{id,...registro}});
const titulares=[linha('documentos_titulares',empresa,{tipo:'empresa',nome:'Empresa fictícia',atualizadoEm:'v1'}),linha('documentos_titulares',pessoa,{tipo:'pessoa',nome:'Pessoa fictícia',pessoaId:pessoaRH,atualizadoEm:'v1'})];
const controle=(id='controle',patch={})=>linha('ativo',id,{tipo:'documento',nome:'Certidão fictícia',categoria:'Certidão',titularId:empresa,emissao:'2026-10-01',validade:'2027-10-01',atualizadoEm:'v1',...patch});
const arquivo={base64:btoa('%PDF-1.7 exemplo fictício'),mime:'application/pdf',nome:'exemplo.pdf'};
function ambiente(perms=['documentos'],rows=[],opcoes={}){
 let handler;const linhas=structuredClone([...titulares,...rows]),escritas=[],consultas=[],uploads=[],downloads=[],arquivos=new Map(Object.entries(opcoes.arquivos||{}));
 const sb={from(tabela){assert.equal(tabela,'painel_registros');let filtros=[],de=0,ate=Infinity,insert;
  const matches=r=>filtros.every(([k,v])=>(k.startsWith('registro->>')?r.registro[k.slice(11)]:r[k])===v);
  const resultado=()=>{if(opcoes.falhaLeitura)return {data:null,error:{message:'falha leitura'}};if(insert){if(linhas.some(r=>r.colecao===insert.colecao&&r.id===insert.id))return {data:null,error:{code:'23505',message:'duplicado'}};linhas.push(structuredClone(insert));escritas.push({tipo:'insert',insert});insert=undefined;}return {data:structuredClone(linhas.filter(matches).slice(de,ate+1)),error:null};};
  const q={select(c){consultas.push({tabela,campos:c,filtros});return q;},eq(k,v){filtros.push([k,v]);return q;},order(){return q;},range(a,b){de=a;ate=b;return q;},insert(x){insert=x;filtros=[['colecao',x.colecao],['id',x.id]];return q;},async maybeSingle(){const r=resultado();return {...r,data:r.data?.[0]||null};},async single(){return q.maybeSingle();},then(a,b){return Promise.resolve(resultado()).then(a,b);}};return q;
 },async rpc(n,p){
  if(opcoes.antesRpc)await opcoes.antesRpc(n,p,linhas);
  const colecao=n==='painel_registro_gravar'?p.p_colecao:n==='painel_ativo_restaurar'?'ativo_lixeira':'ativo';const r=linhas.find(r=>r.colecao===colecao&&r.id===p.p_id);
  if(JSON.stringify(r?.registro||null)!==JSON.stringify(p.p_anterior||null))return {data:null,error:{code:'40001',message:'conflito'}};
  if(n==='painel_registro_gravar'){r.registro=structuredClone(p.p_registro);escritas.push({tipo:'rpc',n,p});return {data:p.p_registro,error:null};}
  if(n==='painel_documento_retirar'){if(!['documento','seguro','garantia'].includes(r.registro.tipo))return {data:null,error:{code:'23514'}};linhas.push({...r,colecao:'ativo_lixeira',registro:{...r.registro,_apagadoEm:'agora'}});linhas.splice(linhas.indexOf(r),1);escritas.push({tipo:'rpc',n,p});return {data:true,error:null};}
  if(n==='painel_ativo_restaurar'){if(linhas.some(x=>x.colecao==='ativo'&&x.id===r.id))return {data:null,error:{code:'23505'}};const reg={...r.registro};delete reg._apagadoEm;linhas.push({...r,colecao:'ativo',registro:reg});linhas.splice(linhas.indexOf(r),1);escritas.push({tipo:'rpc',n,p});return {data:true,error:null};}
  throw new Error('RPC inesperada '+n);
 },storage:{from(){return {async upload(chave,bytes,opts){uploads.push({chave,opts});assert.equal(opts.upsert,false);if(arquivos.has(chave))return {error:{message:'ocupado'}};arquivos.set(chave,{bytes:new Uint8Array(bytes),type:opts.contentType});return {error:null};},async download(chave){downloads.push(chave);const f=arquivos.get(chave);return {data:f?new Blob([f.bytes],{type:f.type}):null,error:f?null:{message:'ausente'}};},async remove(chaves){for(const chave of chaves)arquivos.delete(chave);return {error:null};}};}}};
 const source=readFileSync(new URL('../supabase/functions/painel-ativos/index.ts',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'');
 vm.runInNewContext(transformSync(source,{loader:'ts',target:'es2022',format:'esm'}).code,{...acesso,atenderDocumentos,temHistoricoPessoal,validarVinculoPessoa,crypto:webcrypto,atob,btoa,Uint8Array,Deno:{env:{get:()=> 'teste'},serve:f=>handler=f},createClient:()=>sb,verificarJwt:async()=>({sub:'teste',nome:'Teste fictício',perms,master:opcoes.master===true}),crachaRevogado:async()=>false,lerPessoasPatrimonio:async()=>opcoes.pessoasRH??[{id:pessoaRH,nome:'Pessoa fictícia',disponivel:true}],Request,Response,console:{error(){}}});
 return {linhas,escritas,consultas,uploads,downloads,arquivos,async chamar(corpo){const r=await handler(new Request('http://test.invalid',{method:'POST',headers:{authorization:'Bearer teste'},body:JSON.stringify(corpo)}));return {status:r.status,body:await r.json()};}};
}
test('listagem exige Documentos e separa controles, AVCB e bens mínimos por origem',async()=>{
 const rows=[controle(),controle('pessoal',{titularId:pessoa,nome:'PESSOAL-SECRETO'}),controle('pendente',{titularId:'',nome:'PENDENTE-SECRETO'}),linha('ativo','avcb',{tipo:'predial',categoria:'AVCB',nome:'AVCB fictício',validade:'2026-11-01',valor:91234,nf:'NF-SECRETA'}),linha('ativo','carro',{tipo:'veiculo',nome:'Carro',valor:9988,nf:'NF-SECRETA',observacao:'SEGREDO',especificacao:{placa:'FIC0000',chassi:'CHASSI-PRIVADO'}}),linha('ativo','cam',{tipo:'seguranca',nome:'CAMERA-SECRETA'}),controle('controle-cam',{ativoIds:['cam'],nome:'CONTROLE-CAMERA-SECRETO'})];
 const a=ambiente(['documentos'],rows),r=await a.chamar({action:'listarDocumentos'});assert.equal(r.status,200);assert.deepEqual(r.body.itens.map(i=>i.id),['controle']);assert.deepEqual(r.body.bens.map(i=>i.id),['carro']);assert.equal(r.body.pessoas[0].id,pessoaRH);assert.doesNotMatch(JSON.stringify(r.body),/PESSOAL|PENDENTE|CAMERA|NF-SECRETA|9988|91234|CHASSI|SEGREDO/);
 const b=await ambiente(['documentos','patrimonio'],rows).chamar({action:'listarDocumentos'});assert.equal(b.body.itens.find(i=>i.id==='avcb').origem,'incendio');assert.equal(b.body.itens.find(i=>i.id==='avcb').classificacaoPendente,true);
 const c=await ambiente(['documentos','documentos-pessoais','seguranca'],rows).chamar({action:'listarDocumentos'});assert.ok(c.body.itens.some(i=>i.id==='pessoal'));assert.ok(c.body.itens.some(i=>i.id==='pendente'));assert.ok(c.body.itens.some(i=>i.id==='controle-cam'));
 assert.equal((await ambiente(['documentos-pessoais'],rows).chamar({action:'listarDocumentos'})).status,403);assert.equal(a.escritas.length,0);
});
test('documentos pessoais e pendentes são protegidos em todas as portas legadas por ID e listagem',async()=>{
 for(const patch of [{titularId:pessoa},{titularId:''}]){
  const r=controle('privado',patch);const rows=[r,linha('ativo_lixeira','lixo',r.registro)];
  const a=ambiente(['documentos'],rows);
  for(const action of ['listar','lixeira']){const ret=await a.chamar({action});assert.equal(ret.status,200);assert.equal(ret.body.itens.length,0);}
  for(const corpo of [{action:'salvar',item:{id:'privado',tipo:'documento',nome:'X'}},{action:'remover',id:'privado'},{action:'guardarArquivo',id:'privado',...arquivo},{action:'lerArquivo',id:'privado'},{action:'restaurar',id:'lixo'}])assert.equal((await a.chamar(corpo)).status,403,JSON.stringify(corpo));
  assert.equal(a.escritas.length,0);assert.equal(a.downloads.length,0);assert.equal(a.uploads.length,0);
 }
});
test('cadastro usa insert, não altera bens, não aceita metadados e preserva referências por ID',async()=>{
 const a=ambiente(['documentos'],[linha('ativo','carro',{tipo:'veiculo',nome:'Carro'})]);
 const r=await a.chamar({action:'salvarControle',item:{cadastroId:novoId,tipo:'garantia',nome:'Garantia fictícia',categoria:'Garantia',titularId:empresa,validade:'2028-01-01',compra:'2026-10-01',ativoIds:['carro']},arquivo});assert.equal(r.status,200);assert.equal(r.body.item.tipo,'garantia');assert.equal(a.escritas[0].tipo,'insert');assert.equal(r.body.item.ativoIds[0],'carro');assert.equal(r.body.item.versoes.length,1);assert.doesNotMatch(JSON.stringify(r.body),/chave|snapshot/);
 assert.equal((await a.chamar({action:'salvarControle',item:{cadastroId:novoId,tipo:'garantia',nome:'Outra'}})).status,409);
 const b=ambiente(['documentos'],[controle()]);assert.equal((await b.chamar({action:'salvarControle',item:{id:'controle',versoes:[]},versao:'v1'})).status,422);assert.equal(b.escritas.length,0);
 const c=ambiente(['documentos'],[linha('ativo','carro',{tipo:'veiculo',nome:'Carro'})]);assert.equal((await c.chamar({action:'salvarControle',item:{id:'carro'},versao:''})).status,403);assert.equal(c.escritas.length,0);
});
test('renovação guarda legado, usa arquivo imutável e baixa versão antiga por ID',async()=>{
 const r=controle('controle',{temArquivo:true,arquivoNome:'antigo.pdf'}),oldBytes=new TextEncoder().encode('%PDF antigo');const a=ambiente(['documentos'],[r,linha('arquivo','controle',{mime:'application/pdf',nome:'antigo.pdf'})],{arquivos:{controle:{bytes:oldBytes,type:'application/pdf'}}});
 const ret=await a.chamar({action:'renovarControle',item:{id:'controle',emissao:'2027-10-01',validade:'2028-10-01'},versao:'v1',arquivo});assert.equal(ret.status,200);assert.equal(ret.body.item.versoes.length,2);assert.equal(ret.body.item.versoes[0].validade,'2027-10-01');assert.equal(ret.body.item.versoes[0].arquivo.nome,'antigo.pdf');assert.ok(a.arquivos.has('controle'));assert.equal(a.uploads[0].opts.upsert,false);
 const antiga=await a.chamar({action:'lerVersaoDocumento',id:'controle',versaoId:ret.body.item.versoes[0].id});assert.equal(antiga.status,200);assert.equal(antiga.body.base64,btoa('%PDF antigo'));assert.equal(antiga.body.nome,'antigo.pdf');
 const vigente=await a.chamar({action:'lerArquivo',id:'controle'});assert.equal(vigente.status,200);assert.equal(vigente.body.base64,arquivo.base64);
});
test('AVCB renova mesma ficha e conserva especificação, valores e anexo anterior',async()=>{
 const r=linha('ativo','avcb',{tipo:'predial',categoria:'AVCB',nome:'AVCB fictício',emissao:'2025-10-01',validade:'2026-10-01',atualizadoEm:'v1',valor:9988,nf:'NF-SECRETA',especificacao:{local:'Sala fictícia'},arquivoIncendio:{chave:'incendio/avcb/antigo',nome:'avcb-antigo.pdf',mime:'application/pdf'}});
 const a=ambiente(['documentos','patrimonio'],[r],{arquivos:{'incendio/avcb/antigo':{bytes:new TextEncoder().encode('%PDF AVCB antigo'),type:'application/pdf'}}});
 const ret=await a.chamar({action:'renovarControle',item:{id:'avcb',tipo:'documento',emissao:'2026-10-01',validade:'2027-10-01'},versao:'v1',arquivo});assert.equal(ret.status,200);assert.equal(ret.body.item.id,'avcb');assert.equal(ret.body.item.origem,'incendio');assert.equal(a.linhas.find(x=>x.id==='avcb').registro.tipo,'predial');assert.equal(a.linhas.find(x=>x.id==='avcb').registro.valor,9988);assert.equal(a.linhas.find(x=>x.id==='avcb').registro.especificacao.local,'Sala fictícia');assert.equal(ret.body.item.versoes.length,2);assert.doesNotMatch(JSON.stringify(ret.body),/9988|NF-SECRETA/);
 assert.equal((await a.chamar({action:'removerControle',id:'avcb',versao:ret.body.item.atualizadoEm})).status,403);
 const antigo=await a.chamar({action:'lerVersaoDocumento',id:'avcb',versaoId:ret.body.item.versoes[0].id});assert.equal(antigo.status,200);
 const origem=await a.chamar({action:'lerArquivoIncendio',id:'avcb'});assert.equal(origem.status,200);assert.equal(origem.body.base64,arquivo.base64);
 assert.equal((await ambiente(['documentos'],[r]).chamar({action:'lerVersaoDocumento',id:'avcb'})).status,403);
});
test('concorrência entre leitura e gravação recusa alteração e remove apenas upload órfão novo',async()=>{
 const a=ambiente(['documentos'],[controle()],{antesRpc(n,p,rows){if(n==='painel_registro_gravar')rows.find(r=>r.id==='controle').registro.atualizadoEm='v2';}});
 const r=await a.chamar({action:'renovarControle',item:{id:'controle',validade:'2028-10-01'},versao:'v1',arquivo});assert.equal(r.status,409);assert.equal(a.escritas.length,0);assert.equal(a.arquivos.size,0);assert.equal(a.linhas.find(r=>r.id==='controle').registro.validade,'2027-10-01');
});
test('retirada exige versão inclusive no legado, preserva versões e restaura com autorização',async()=>{
 const a=ambiente(['documentos'],[controle()]);assert.equal((await a.chamar({action:'removerControle',id:'controle',versao:'antiga'})).status,409);assert.equal(a.escritas.length,0);
 assert.equal((await a.chamar({action:'remover',id:'controle',versao:'v1'})).status,200);assert.ok(a.linhas.some(r=>r.colecao==='ativo_lixeira'));assert.equal((await a.chamar({action:'lixeiraDocumentos'})).body.itens[0].id,'controle');assert.equal((await a.chamar({action:'restaurarControle',id:'controle'})).status,200);assert.ok(a.linhas.some(r=>r.colecao==='ativo'&&r.id==='controle'));
});
test('prévia é read-only, relata legado sem inferência e conserva veículos como bens',async()=>{
 const rows=[controle('pendente',{titularId:'',validade:'',temArquivo:true}),linha('ativo','carro',{tipo:'veiculo',nome:'Empresa fictícia',validade:'2027-01-01'})];const a=ambiente(['documentos','documentos-pessoais'],rows),antes=structuredClone(a.linhas);const r=await a.chamar({action:'previaDocumentos'});assert.equal(r.status,200);assert.equal(r.body.somenteLeitura,true);assert.equal(r.body.itens[0].destino,'controle');assert.match(r.body.itens[0].pendencias[0],/titular/);assert.equal(r.body.itens[1].destino,'bem-fisico');assert.deepEqual(a.linhas,antes);assert.equal(a.escritas.length,0);
});
test('titular tem ID explícito, pessoa RH validada e tipo imutável; requisito vincula documento exato',async()=>{
 const a=ambiente(['documentos','documentos-pessoais'],[controle()]);let r=await a.chamar({action:'salvarTitular',item:{cadastroId:novoId,tipo:'pessoa',nome:'Nome descartado',pessoaId:pessoaRH}});assert.equal(r.status,200);assert.equal(r.body.item.nome,'Pessoa fictícia');assert.equal(a.escritas[0].tipo,'insert');
 assert.equal((await a.chamar({action:'salvarTitular',item:{id:pessoa,tipo:'empresa',nome:'Empresa'},versao:'v1'})).status,409);
 assert.equal((await ambiente(['documentos'],[]).chamar({action:'salvarTitular',item:{cadastroId:novoId,tipo:'pessoa',nome:'Pessoa'}})).status,403);
 r=await a.chamar({action:'salvarRequisito',item:{cadastroId:'33405710-78db-461b-9d33-37a228fd62c0',titularId:empresa,categoria:'Certidão',documentoId:'controle',estado:'aplicavel'}});assert.equal(r.status,200);assert.equal(r.body.item.documentoId,'controle');
 assert.equal((await a.chamar({action:'salvarRequisito',item:{cadastroId:'23405710-78db-461b-9d33-37a228fd62c0',titularId:pessoa,categoria:'Certidão',documentoId:'controle',estado:'aplicavel'}})).status,422);
});
test('validação de arquivo e datas não escreve; erro de leitura não vira lista vazia',async()=>{
 for(const patch of [{validade:'2027-02-30'},{alertaDias:-1},{estado:'outro'},{ativoIds:['nome livre']},{contato:'texto'},{acionamentos:[{id:'livre'}]}]){const a=ambiente(['documentos'],[controle()]);assert.equal((await a.chamar({action:'salvarControle',item:{id:'controle',...patch},versao:'v1'})).status,422);assert.equal(a.escritas.length,0);}
 const a=ambiente(['documentos'],[controle()]);assert.equal((await a.chamar({action:'renovarControle',item:{id:'controle'},versao:'v1',arquivo:{...arquivo,base64:btoa('executável')}})).status,422);assert.equal(a.uploads.length,0);
 assert.equal((await ambiente(['documentos'],[],{falhaLeitura:true}).chamar({action:'listarDocumentos'})).status,500);
});
test('marcas de origem Segurança sobrevivem ao salvamento legado e referências retiradas fecham acesso',async()=>{
 for(const marca of ['origem','origemTipo']){
  const a=ambiente(['documentos','seguranca'],[controle('seguro',{[marca]:'seguranca'})]);const r=await a.chamar({action:'salvar',item:{id:'seguro',tipo:'documento',nome:'Atualizado'},versao:'v1'});assert.equal(r.status,200);assert.equal(a.linhas.find(l=>l.id==='seguro').registro[marca],'seguranca');
  const b=ambiente(['documentos'],[a.linhas.find(l=>l.id==='seguro')]);assert.equal((await b.chamar({action:'listar'})).body.itens.length,0);assert.equal((await b.chamar({action:'listarDocumentos'})).body.itens.length,0);
 }
 const a=ambiente(['documentos'],[controle('sem-origem',{ativoIds:['retirado'],nome:'TITULO-PRIVADO'})]);assert.doesNotMatch(JSON.stringify((await a.chamar({action:'listarDocumentos'})).body),/TITULO-PRIVADO/);assert.equal((await a.chamar({action:'lerArquivo',id:'sem-origem'})).status,403);
});
test('AVCB novo é cadastrado somente na ficha predial, jamais por controle paralelo',async()=>{
 const a=ambiente(['documentos','documentos-pessoais']);for(const action of ['salvarControle','salvar']){const r=await a.chamar({action,item:{cadastroId:novoId,tipo:'documento',nome:'AVCB',categoria:'AVCB',titularId:empresa,validade:'2027-01-01'}});assert.equal(r.status,409);}assert.equal(a.escritas.length,0);
});
test('garantia sem prazo fica pendente e arquivos adicionais permanecem acessíveis sem renovar',async()=>{
 const a=ambiente(['documentos']);let r=await a.chamar({action:'salvarControle',item:{cadastroId:novoId,tipo:'garantia',nome:'Garantia fictícia',categoria:'Garantia',titularId:empresa,validade:'',linkOficial:'https://example.com/garantia',assistencia:{nome:'Assistência fictícia',telefone:'0000'}},arquivo});assert.equal(r.status,200);assert.equal(r.body.item.validade,'');assert.equal(r.body.item.semVencimento,false);
 const primeiro=r.body.item.anexos[0].id;r=await a.chamar({action:'salvarControle',item:{id:novoId},versao:r.body.item.atualizadoEm,arquivo:{...arquivo,nome:'termo.pdf'}});assert.equal(r.status,200);assert.equal(r.body.item.anexos.length,2);assert.equal(r.body.item.versoes.at(-1).anexos.length,2);
 const primeiroDownload=await a.chamar({action:'lerVersaoDocumento',id:novoId,arquivoId:primeiro});assert.equal(primeiroDownload.status,200);assert.equal(primeiroDownload.body.nome,'exemplo.pdf');
 assert.equal((await a.chamar({action:'renovarControle',item:{id:novoId},versao:r.body.item.atualizadoEm,arquivo})).status,422);
 assert.equal((await a.chamar({action:'salvarControle',item:{id:novoId,linkOficial:'javascript:alert(1)'},versao:r.body.item.atualizadoEm})).status,422);
});
test('edição legado mantém RH por ID e recusa trocar responsável somente pelo nome',async()=>{
 const a=ambiente(['documentos'],[controle('rh',{responsavelId:pessoaRH,responsavel:'Pessoa fictícia'})]);let r=await a.chamar({action:'salvar',item:{id:'rh',tipo:'documento',nome:'Editado'},versao:'v1'});assert.equal(r.status,200);assert.equal(r.body.item.responsavelId,pessoaRH);assert.equal(r.body.item.responsavel,'Pessoa fictícia');
 const b=ambiente(['documentos'],[controle('rh',{responsavelId:'',responsavel:'Legado'})]);assert.equal((await b.chamar({action:'salvar',item:{id:'rh',tipo:'documento',nome:'Editado',responsavel:'Nome livre novo'},versao:'v1'})).status,422);assert.equal(b.escritas.length,0);
});
test('AVCB vincula titular confirmado e acionamento resolvido não pode ser reescrito ou apagado',async()=>{
 const a=ambiente(['documentos','patrimonio'],[linha('ativo','avcb',{tipo:'predial',categoria:'AVCB',nome:'AVCB',validade:'2026-10-01',atualizadoEm:'v1'})]);const r=await a.chamar({action:'renovarControle',item:{id:'avcb',titularId:empresa,validade:'2027-10-01'},versao:'v1',arquivo});assert.equal(r.status,200);assert.equal(r.body.item.titularId,empresa);assert.equal(r.body.item.classificacaoPendente,false);
 const encerrado={id:novoId,data:'2026-10-01',estado:'resolvido',problema:'Exemplo',encaminhamento:'',protocolo:'',retorno:'',solucao:'Concluído',observacao:''};
 const b=ambiente(['documentos'],[controle('hist',{acionamentos:[encerrado]})]);assert.equal((await b.chamar({action:'salvarControle',item:{id:'hist',acionamentos:[]},versao:'v1'})).status,422);assert.equal((await b.chamar({action:'salvarControle',item:{id:'hist',acionamentos:[{...encerrado,solucao:'Reescrita'}]},versao:'v1'})).status,422);assert.equal((await b.chamar({action:'salvarControle',item:{id:'hist',nome:'Novo nome'},versao:'v1'})).status,200);
});
test('AVCB nunca classifica pessoa como titular empresarial nem expõe titular pessoal irregular',async()=>{
 const r=linha('ativo','avcb',{tipo:'predial',categoria:'AVCB',nome:'AVCB',validade:'2026-10-01',atualizadoEm:'v1'});const a=ambiente(['documentos','patrimonio','documentos-pessoais'],[r]);assert.equal((await a.chamar({action:'renovarControle',item:{id:'avcb',titularId:pessoa,validade:'2027-10-01'},versao:'v1',arquivo})).status,422);assert.equal(a.escritas.length,0);
 const b=ambiente(['documentos','patrimonio'],[linha('ativo','avcb',{...r.registro,titularId:pessoa})]);assert.equal((await b.chamar({action:'listarDocumentos'})).body.itens.length,0);assert.equal((await b.chamar({action:'lerVersaoDocumento',id:'avcb'})).status,403);
});
test('vínculo retirado não pode ser criado, mas vínculo histórico preserva ID e disponibilidade',async()=>{
 const retirado=linha('ativo_lixeira','carro',{tipo:'veiculo',nome:'Carro antigo'});const a=ambiente(['documentos'],[controle(),retirado]);assert.equal((await a.chamar({action:'salvarControle',item:{id:'controle',ativoIds:['carro']},versao:'v1'})).status,409);assert.equal(a.escritas.length,0);
 const b=ambiente(['documentos'],[controle('controle',{ativoIds:['carro']}),retirado]);assert.equal((await b.chamar({action:'listarDocumentos'})).body.bens[0].disponivel,false);const ret=await b.chamar({action:'salvarControle',item:{id:'controle',nome:'Editado'},versao:'v1'});assert.equal(ret.status,200);assert.deepEqual(ret.body.item.ativoIds,['carro']);
});
test('veículo com documento antigo conserva prazo e consulta de arquivo sob permissão de aquisição',async()=>{
 const carro=linha('ativo','carro',{tipo:'veiculo',nome:'Carro',validade:'2027-01-01',temArquivo:true,arquivoNome:'nf-ou-crlv.pdf'});const a=ambiente(['documentos'],[carro]);const lista=await a.chamar({action:'listarDocumentos'});assert.equal(lista.body.itens.length,0);assert.equal(lista.body.bens[0].documentoLegado,true);assert.equal(lista.body.bens[0].validade,'2027-01-01');assert.ok(!Object.hasOwn(lista.body.bens[0],'arquivoNome'));assert.equal((await a.chamar({action:'lerArquivo',id:'carro'})).status,403);
 const b=ambiente(['documentos','inventario-valores'],[carro,linha('arquivo','carro',{mime:'application/pdf',nome:'nf-ou-crlv.pdf'})],{arquivos:{carro:{bytes:new TextEncoder().encode('%PDF fictício'),type:'application/pdf'}}});assert.equal((await b.chamar({action:'lerArquivo',id:'carro'})).status,200);
});
test('bens técnicos e etiqueta reutilizam inventário por IDs, com aquisição apenas autorizada',async()=>{
 const bem=linha('patrimonio','bem',{codigo:'FIC-001',situacao:'uso',setorSigla:'FIC',origemAtivoId:'maq',valor:1234567,nf:'NF-PRIVADA',dataAquisicao:'2026-10-01',historico:[{segredo:'HISTORICO-PRIVADO'}]});const maq=linha('ativo','maq',{tipo:'maquina',nome:'Máquina fictícia',bemId:'bem',especificacao:{fabricante:'Fictício',modelo:'Modelo fictício',numeroSerie:'FIC0001',senha:'SENHA-PRIVADA'}});
 const a=await ambiente(['documentos'],[bem,maq]).chamar({action:'listarDocumentos'});assert.equal(a.status,200);assert.equal(a.body.bens[0].bemId,'bem');assert.equal(a.body.bens[0].especificacao.numeroSerie,'FIC0001');assert.equal(a.body.bens[0].inventario[0].codigo,'FIC-001');assert.doesNotMatch(JSON.stringify(a.body),/1234567|NF-PRIVADA|HISTORICO-PRIVADO|SENHA-PRIVADA|dataAquisicao/);
 const b=await ambiente(['documentos','inventario-valores'],[bem,maq]).chamar({action:'listarDocumentos'});assert.equal(b.body.bens[0].inventario[0].valor,1234567);assert.equal(b.body.bens[0].inventario[0].nf,'NF-PRIVADA');assert.doesNotMatch(JSON.stringify(b.body),/HISTORICO-PRIVADO|SENHA-PRIVADA/);
});
test('AVCB aceita anexo adicional sem alterar certificado primário e renovação guarda dados anteriores',async()=>{
 const a=ambiente(['documentos','patrimonio'],[linha('ativo','avcb',{tipo:'predial',categoria:'AVCB',nome:'AVCB',validade:'2026-10-01',atualizadoEm:'v1'})]);let r=await a.chamar({action:'renovarControle',item:{id:'avcb',titularId:empresa,validade:'2027-10-01'},versao:'v1',arquivo});assert.equal(r.status,200);const chave=a.linhas.find(l=>l.id==='avcb').registro.arquivoIncendio.chave;
 r=await a.chamar({action:'salvarControle',item:{id:'avcb',titularId:empresa,validade:'2027-10-01'},versao:r.body.item.atualizadoEm,arquivo:{...arquivo,nome:'complemento.pdf'}});assert.equal(r.status,200);assert.equal(a.linhas.find(l=>l.id==='avcb').registro.arquivoIncendio.chave,chave);assert.equal(r.body.item.anexos.length,2);assert.equal((await a.chamar({action:'lerArquivoIncendio',id:'avcb'})).body.nome,'exemplo.pdf');
 const b=ambiente(['documentos']);r=await b.chamar({action:'salvarControle',item:{cadastroId:novoId,tipo:'garantia',nome:'Garantia antiga',categoria:'Garantia',titularId:empresa,validade:'2027-10-01'},arquivo});r=await b.chamar({action:'salvarControle',item:{id:novoId,nome:'Dados antes da renovação'},versao:r.body.item.atualizadoEm});r=await b.chamar({action:'renovarControle',item:{id:novoId,nome:'Dados novos',validade:'2028-10-01'},versao:r.body.item.atualizadoEm,arquivo});assert.equal(r.status,200);const versoes=b.linhas.find(l=>l.id===novoId).registro.versoes;assert.ok(versoes.some(v=>v.snapshot.nome==='Dados antes da renovação'));assert.equal(versoes.at(-1).snapshot.nome,'Dados novos');
});
test('troca explícita de titular conserva restrição dos arquivos pessoais históricos',async()=>{
 const a=ambiente(['documentos','documentos-pessoais'],[controle('pessoal',{titularId:pessoa})]);const r=await a.chamar({action:'salvarControle',item:{id:'pessoal',titularId:empresa},versao:'v1',arquivo});assert.equal(r.status,200);assert.equal(r.body.item.titularId,empresa);const salvo=a.linhas.find(l=>l.id==='pessoal');assert.equal(salvo.registro.pessoalHistorico,true);
 const b=ambiente(['documentos'],[salvo]);assert.equal((await b.chamar({action:'listarDocumentos'})).body.itens.length,0);assert.equal((await b.chamar({action:'listar'})).body.itens.length,0);assert.equal((await b.chamar({action:'lerArquivo',id:'pessoal'})).status,403);
});
test('seguro não informado permanece null e prêmio ou cobertura zero explícitos permanecem zero',async()=>{
 for(const valores of [{},{valor:null,valorSegurado:null},{valor:0,valorSegurado:0}]){
  const a=ambiente(['documentos']);const r=await a.chamar({action:'salvarControle',item:{cadastroId:novoId,tipo:'seguro',nome:'Seguro fictício',categoria:'Seguro',titularId:empresa,...valores}});assert.equal(r.status,200);const esperado=Object.hasOwn(valores,'valor')?valores.valor:null;assert.equal(r.body.item.valor,esperado);assert.equal(r.body.item.valorSegurado,esperado);assert.equal(a.linhas.find(l=>l.id===novoId).registro.valor,esperado);
 }
 const a=ambiente(['documentos'],[controle('seguro',{tipo:'seguro',valor:700,valorSegurado:800})]);const ret=await a.chamar({action:'salvarControle',item:{id:'seguro',valor:null,valorSegurado:0},versao:'v1'});assert.equal(ret.status,200);assert.equal(ret.body.item.valor,null);assert.equal(ret.body.item.valorSegurado,0);
 const b=ambiente(['documentos'],[controle('seguro',{tipo:'seguro',valor:null,valorSegurado:null})]);const legado=await b.chamar({action:'salvar',item:{id:'seguro',tipo:'seguro',nome:'Editado'},versao:'v1'});assert.equal(legado.status,200);assert.equal(legado.body.item.valor,null);assert.equal(legado.body.item.valorSegurado,null);
});
test('documento e garantia não ganham valores padrão nem expõem aquisição legada como prêmio',async()=>{
 for(const tipo of ['documento','garantia']){
  const a=ambiente(['documentos']);const r=await a.chamar({action:'salvarControle',item:{cadastroId:novoId,tipo,nome:'Controle fictício',categoria:'Exemplo',titularId:empresa}});assert.equal(r.status,200);assert.ok(!Object.hasOwn(a.linhas.find(l=>l.id===novoId).registro,'valor'));assert.ok(!Object.hasOwn(r.body.item,'valorSegurado'));
  const b=ambiente(['documentos'],[controle('legado',{tipo,valor:123456,valorSegurado:654321})]);const salvo=await b.chamar({action:'salvarControle',item:{id:'legado',nome:'Atualizado',valor:null},versao:'v1'});assert.equal(salvo.status,200);assert.equal(b.linhas.find(l=>l.id==='legado').registro.valor,123456);assert.doesNotMatch(JSON.stringify(salvo.body),/123456|654321|"valor"|"valorSegurado"/);assert.doesNotMatch(JSON.stringify((await b.chamar({action:'listar'})).body),/123456|654321/);
 }
});
test('snapshot pessoal sem marca derivada restringe também listagem, lixeira e edição legadas',async()=>{
 const historico={id:novoId,snapshot:{titularId:pessoa},arquivo:{id:novoId,chave:`documentos/privado/${novoId}`,nome:'ANEXO-PESSOAL-PRIVADO.pdf',mime:'application/pdf'}};
 const privado=controle('privado',{titularId:empresa,temArquivo:true,arquivoNome:'ANEXO-PESSOAL-PRIVADO.pdf',versoes:[historico]});
 const rows=[privado,linha('ativo_lixeira','privado-lixo',{...privado.registro,id:'privado-lixo'})];
 const a=ambiente(['documentos'],rows),antes=structuredClone(a.linhas);
 for(const action of ['listarDocumentos','listar','lixeiraDocumentos','lixeira']){
  const r=await a.chamar({action});assert.equal(r.status,200);assert.deepEqual(r.body.itens,[]);assert.doesNotMatch(JSON.stringify(r.body),/ANEXO-PESSOAL-PRIVADO/);
 }
 for(const corpo of [{action:'salvar',item:{id:'privado',tipo:'documento',nome:'Alterado'},versao:'v1'},{action:'restaurar',id:'privado-lixo'},{action:'remover',id:'privado',versao:'v1'},{action:'lerArquivo',id:'privado'},{action:'guardarArquivo',id:'privado',versao:'v1',...arquivo}])assert.equal((await a.chamar(corpo)).status,403,corpo.action);
 assert.deepEqual(a.linhas,antes);assert.equal(a.escritas.length,0);assert.equal(a.downloads.length,0);assert.equal(a.uploads.length,0);
 const b=ambiente(['documentos','documentos-pessoais'],rows);assert.equal((await b.chamar({action:'listar'})).body.itens[0].id,'privado');assert.equal((await b.chamar({action:'salvar',item:{id:'privado',tipo:'documento',nome:'Alterado'},versao:'v1'})).status,200);assert.equal((await b.chamar({action:'restaurar',id:'privado-lixo'})).status,200);
});
test('requisito oculto não pode perder vínculo nem revelar dados pela edição direta',async()=>{
 for(const [patch,permissao] of [[{origem:'seguranca'},'seguranca'],[{pessoalHistorico:true},'documentos-pessoais'],[{versoes:[{id:novoId,snapshot:{titularId:pessoa}}]},'documentos-pessoais']])for(const colecao of ['ativo','ativo_lixeira']){
  const documento=controle('restrito',patch);documento.colecao=colecao;
  const requisito=linha('documentos_requisitos',novoId,{titularId:empresa,documentoId:'restrito',categoria:'CATEGORIA-PRIVADA',estado:'aplicavel',observacao:'OBSERVACAO-PRIVADA',atualizadoEm:'v1'});
  const a=ambiente(['documentos'],[documento,requisito]),antes=structuredClone(a.linhas),lista=await a.chamar({action:'listarDocumentos'});assert.equal(lista.status,200);assert.deepEqual(lista.body.requisitos,[]);
  const r=await a.chamar({action:'salvarRequisito',item:{id:novoId,documentoId:''},versao:'v1'});assert.equal(r.status,403);assert.doesNotMatch(JSON.stringify(r.body),/CATEGORIA-PRIVADA|OBSERVACAO-PRIVADA/);assert.deepEqual(a.linhas,antes);assert.equal(a.escritas.length,0);
  const b=ambiente(['documentos',permissao],[documento,requisito]),ret=await b.chamar({action:'salvarRequisito',item:{id:novoId,documentoId:''},versao:'v1'});assert.equal(ret.status,200);assert.equal(ret.body.item.documentoId,'');assert.equal(ret.body.item.observacao,'OBSERVACAO-PRIVADA');assert.deepEqual(b.linhas.find(l=>l.colecao===colecao&&l.id==='restrito').registro,documento.registro);
 }
});
test('responsável retirado do RH conserva ID e nome do servidor na edição de controle',async()=>{
 const retirado='23405710-78db-461b-9d33-37a228fd62c0',antigo=controle('rh-retirado',{responsavelId:retirado,responsavel:'Nome histórico fictício'});
 for(const action of ['salvarControle','salvar']){
  const a=ambiente(['documentos'],[antigo]),r=await a.chamar({action,item:{id:'rh-retirado',tipo:'documento',nome:'Ficha atualizada',responsavel:'Nome enviado pelo cliente'},versao:'v1'});assert.equal(r.status,200);assert.equal(r.body.item.responsavelId,retirado);assert.equal(r.body.item.responsavel,'Nome histórico fictício');assert.equal(a.linhas.find(l=>l.id==='rh-retirado').registro.responsavel,'Nome histórico fictício');
 }
 for(const item of [{cadastroId:novoId,tipo:'documento',nome:'Outra ficha',categoria:'Certidão',titularId:empresa,responsavelId:retirado,responsavel:'Nome histórico fictício'},{id:'outra-ficha',responsavelId:retirado,responsavel:'Nome histórico fictício'}]){
  const a=ambiente(['documentos'],[antigo,controle('outra-ficha')]),antes=structuredClone(a.linhas),r=await a.chamar({action:'salvarControle',item,versao:'v1'});assert.equal(r.status,422);assert.deepEqual(a.linhas,antes);assert.equal(a.escritas.length,0);
 }
});
test('titular conserva pessoa retirada do RH sem permitir novo vínculo nem nome inventado',async()=>{
 const retirado='23405710-78db-461b-9d33-37a228fd62c0',titular='33405710-78db-461b-9d33-37a228fd62c0',antigo=linha('documentos_titulares',titular,{tipo:'pessoa',nome:'Nome histórico do titular',pessoaId:retirado,atualizadoEm:'v1'});
 const a=ambiente(['documentos','documentos-pessoais'],[antigo]),r=await a.chamar({action:'salvarTitular',item:{id:titular,nome:'Nome enviado pelo cliente'},versao:'v1'});assert.equal(r.status,200);assert.equal(r.body.item.pessoaId,retirado);assert.equal(r.body.item.nome,'Nome histórico do titular');
 for(const item of [{cadastroId:novoId,tipo:'pessoa',nome:'Outra pessoa',pessoaId:retirado},{id:pessoa,nome:'Outra pessoa',pessoaId:retirado}]){
  const b=ambiente(['documentos','documentos-pessoais'],[antigo]),antes=structuredClone(b.linhas),ret=await b.chamar({action:'salvarTitular',item,versao:'v1'});assert.equal(ret.status,422);assert.deepEqual(b.linhas,antes);assert.equal(b.escritas.length,0);
 }
});

// Identificadores fictícios: ficha do RH não é necessariamente um UUID.
test('titular aceita ficha RH não UUID e não confunde com o ID da empresa',async()=>{
 const pessoasRH=[{id:'rh-ficha-ficticia',idPessoa:'001234',nome:'Pessoa fictícia',disponivel:true}];
 const a=ambiente(['documentos','documentos-pessoais'],[],{pessoasRH});
 const r=await a.chamar({action:'salvarTitular',item:{cadastroId:novoId,tipo:'pessoa',nome:'Nome enviado',pessoaId:'rh-ficha-ficticia'}});
 assert.equal(r.status,200);assert.equal(r.body.item.pessoaId,'rh-ficha-ficticia');assert.equal(r.body.item.nome,'Pessoa fictícia');
 for(const pessoaId of ['001234','rh-inexistente']){
  const b=ambiente(['documentos','documentos-pessoais'],[],{pessoasRH});
  assert.equal((await b.chamar({action:'salvarTitular',item:{cadastroId:novoId,tipo:'pessoa',nome:'Pessoa fictícia',pessoaId}})).status,422);assert.equal(b.escritas.length,0);
 }
 const b=ambiente(['documentos','documentos-pessoais'],[],{pessoasRH:[{...pessoasRH[0],disponivel:false}]});
 assert.equal((await b.chamar({action:'salvarTitular',item:{cadastroId:novoId,tipo:'pessoa',nome:'Pessoa fictícia',pessoaId:'rh-ficha-ficticia'}})).status,422);assert.equal(b.escritas.length,0);
});
