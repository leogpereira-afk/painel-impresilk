import test from 'node:test';
import assert from 'node:assert/strict';
import {atenderKitsLicitacoes} from '../supabase/functions/_shared/licitacoes-kits-handler.mjs';
import {pendenciasRequisitoKit} from '../supabase/functions/_shared/licitacoes-kits.mjs';
import {atenderDocumentos} from '../supabase/functions/_shared/documentos-handler.mjs';

const empresa='73405710-78db-461b-9d33-37a228fd62c0',outra='63405710-78db-461b-9d33-37a228fd62c0',cadastroId='53405710-78db-461b-9d33-37a228fd62c0';
const row=(colecao,id,registro)=>({colecao,id,registro:{id,...registro}});
const anexo=(id='versao-antiga')=>({id,chave:`documentos/doc/${id}`,nome:`${id}.pdf`,mime:'application/pdf'});
const doc=(patch={})=>row('ativo','doc',{tipo:'documento',nome:'Certidão original',categoria:'Regularidade',titularId:empresa,usoLicitacoes:true,estado:'ativo',emissao:'2026-01-01',validade:'2027-01-01',atualizadoEm:'v1',temArquivo:true,anexos:[anexo()],versoes:[{id:'versao-antiga',emissao:'2026-01-01',validade:'2027-01-01',arquivo:anexo(),anexos:[anexo()],snapshot:{nome:'Certidão original',categoria:'Regularidade',titularId:empresa,usoLicitacoes:true,emissao:'2026-01-01',validade:'2027-01-01',estado:'ativo',atualizadoEm:'v1'}}],...patch});
const req=(patch={})=>({id:'req-ficticio',categoria:'Regularidade',descricao:'Conferência interna',documentoId:'doc',...patch});
const item=(patch={})=>({cadastroId,nome:'Kit de ensaio',licitacaoId:'edital',titularId:empresa,requisitos:[req()],...patch});
function ambiente(options={}){
 const state={rows:structuredClone([row('documentos_titulares',empresa,{tipo:'empresa',nome:'Empresa fictícia'}),row('documentos_titulares',outra,{tipo:'empresa',nome:'Outra empresa fictícia'}),row('documentos_titulares','pessoa',{tipo:'pessoa',nome:'Pessoa fictícia'}),row('ativo','edital',{tipo:'licitacao',nome:'Edital fictício'}),...(options.rows||[doc()])]),writes:[],files:new Map([[anexo().chave,new TextEncoder().encode('%PDF original')]]),checks:0,revogado:false};
 const sb={from(table){assert.equal(table,'painel_registros');const filtros=[];let de=0,ate=Infinity;const query={select(){return query;},eq(k,v){filtros.push([k,v]);return query;},order(){return query;},range(a,b){de=a;ate=b;return query;},async maybeSingle(){const r=run();return {...r,data:r.data[0]||null};},then(a,b){return Promise.resolve(run()).then(a,b);}};function run(){if(options.onRead)options.onRead(state,filtros);return {data:structuredClone(state.rows.filter(r=>filtros.every(([k,v])=>r[k]===v)).slice(de,ate+1)),error:null};}return query;},async rpc(name,p){assert.equal(name,'painel_registro_gravar');if(options.beforeRpc)await options.beforeRpc(state,p);const anterior=state.rows.find(r=>r.colecao===p.p_colecao&&r.id===p.p_id);if(JSON.stringify(anterior?.registro||null)!==JSON.stringify(p.p_anterior))return {data:null,error:{code:'40001',message:'conflito'}};if(anterior)anterior.registro=structuredClone(p.p_registro);else state.rows.push(row(p.p_colecao,p.p_id,structuredClone(p.p_registro)));state.writes.push(structuredClone(p));if(options.revokeAfterCommit)state.revogado=true;return options.commitSemResposta?{data:null,error:{code:'NETWORK',message:'resposta perdida'}}:{data:structuredClone(p.p_registro),error:null};},storage:{from(){return {async upload(chave,bytes){state.files.set(chave,new Uint8Array(bytes));return {error:null};},async download(chave){const bytes=state.files.get(chave);return {data:bytes?new Blob([bytes]):null,error:bytes?null:{message:'ausente'}};},async remove(chaves){chaves.forEach(chave=>state.files.delete(chave));return {error:null};}};}}};
 const sessao=options.sessao??{sub:'ficticio',perms:['licitacoes','documentos']};
 const revalidarSessao=async()=>{state.checks++;if(state.revogado||options.revokeAt===state.checks)throw Object.assign(new Error('Sessão encerrada'),{status:401});};
 const call=async(corpo,handler=atenderKitsLicitacoes)=>{try{return await handler({sb,sessao,corpo,quem:'Operador fictício',resposta:(body,status=200)=>({body,status}),revalidarSessao,pessoasRH:async()=>[],bytesParaB64:bytes=>Buffer.from(bytes).toString('base64')});}catch(e){return {status:e.status||(['40001','23505'].includes(e.code)?409:500),body:{erro:e.message}};}};
 return {state,sb,call,save:(it=item(),versao)=>call({action:'salvarKitLicitacoes',item:it,versao}),list:()=>call({action:'listarKitsLicitacoes'}),download:kit=>call({action:'prepararDownloadKitLicitacoes',id:kit.id,versao:kit.atualizadoEm})};
}
const payload=r=>({id:r.id,nome:r.nome,licitacaoId:r.licitacaoId,titularId:r.titularId,requisitos:r.requisitos.map(({id,categoria,descricao,documentoId,versaoId,arquivoId,dispensado,justificativa})=>({id,categoria,descricao,documentoId,versaoId,arquivoId,dispensado,justificativa}))});

test('kit cria por edital/titular, congela versão e repete cadastro sem novo histórico',async()=>{
 const a=ambiente(),r=await a.save();assert.equal(r.status,200);const k=r.body.item;assert.equal(k.requisitos[0].versaoId,'versao-antiga');assert.equal(k.requisitos[0].snapshot.nome,'Certidão original');assert.equal(k.historico.length,1);assert.doesNotMatch(JSON.stringify(k),/chave|_criacao|documentos\/doc/);
 assert.deepEqual((await a.save()).body.item,k);assert.equal(a.state.writes.length,1);assert.equal((await a.save(item({cadastroId:crypto.randomUUID()}))).status,409);assert.equal((await a.list()).body.itens.length,1);
 const manifest=await a.download(k);assert.equal(manifest.status,200);assert.deepEqual(manifest.body.arquivos,[{documentoId:'doc',versaoId:'versao-antiga',arquivoId:'versao-antiga',nome:'versao-antiga.pdf'}]);assert.match(manifest.body.kit.aviso,/não representa envio/);
});
test('kit exige ambas permissões, callback e sessão antes de leituras',async()=>{
 for(const perms of [[],['licitacoes'],['documentos']]){const a=ambiente({sessao:{perms}});assert.equal((await a.save()).status,403);assert.equal(a.state.writes.length,0);}
 const a=ambiente({revokeAt:1});assert.equal((await a.list()).status,401);assert.equal(a.state.writes.length,0);
 await assert.rejects(atenderKitsLicitacoes({sessao:{perms:['licitacoes','documentos']}}),e=>e.status===503);
});
test('documento pessoal, histórico pessoal, segurança sem permissão, outra empresa e bens recusados',async()=>{
 for(const patch of [{titularId:'pessoa'},{pessoalHistorico:true},{versoes:[{id:'secreta',snapshot:{titularId:'pessoa'}}]},{origem:'seguranca'},{titularId:outra},{tipo:'maquina'},{usoLicitacoes:false}]){const a=ambiente({rows:[doc(patch)]}),r=await a.save();assert.equal(r.status,403,JSON.stringify(patch));assert.equal(a.state.writes.length,0);}
});
test('versão ou anexo forjados, caminho privado e metadados cliente são recusados',async()=>{
 for(const patch of [{versaoId:'inexistente'},{versaoId:'versao-antiga',arquivoId:'de-outro-documento'}]){const a=ambiente();assert.equal((await a.save(item({requisitos:[req(patch)]}))).status,404);assert.equal(a.state.writes.length,0);}
 for(const r of [req({chave:'documentos/privado'}),req({snapshot:{validade:'2099-01-01'}})]){const a=ambiente();assert.equal((await a.save(item({requisitos:[r]}))).status,422);assert.equal(a.state.writes.length,0);}
});
test('CAS impede edição concorrente e conserva histórico e metadados desconhecidos',async()=>{
 const a=ambiente(),k=(await a.save()).body.item,stored=a.state.rows.find(r=>r.colecao==='licitacoes_kits');stored.registro.campoFuturo={preservar:true};
 const edited=await a.save({...payload(k),nome:'Kit conferido'},k.atualizadoEm);assert.equal(edited.status,200);assert.equal(stored.registro.historico.length,2);assert.deepEqual(stored.registro.campoFuturo,{preservar:true});assert.equal(stored.registro.historico[1].antes.nome,'Kit de ensaio');
 assert.equal((await a.save({...payload(k),nome:'Edição obsoleta'},k.atualizadoEm)).status,409);assert.equal(stored.registro.nome,'Kit conferido');assert.equal((await a.download(k)).status,409);
});
test('concorrência depois da leitura é negada pela RPC sem substituir vencedor',async()=>{
 const a=ambiente(),k=(await a.save()).body.item;
 a.state.rows.find(r=>r.colecao==='licitacoes_kits').registro.atualizadoEm='concorrente';assert.equal((await a.save(payload(k),k.atualizadoEm)).status,409);
 const b=ambiente({beforeRpc(state,p){if(p.p_colecao==='licitacoes_kits')state.rows.push(row('licitacoes_kits',p.p_id,{nome:'Vencedor fictício',atualizadoEm:'concorrente'}));}});assert.equal((await b.save()).status,409);assert.equal(b.state.writes.length,0);assert.equal(b.state.rows.find(r=>r.colecao==='licitacoes_kits').registro.nome,'Vencedor fictício');
});
test('renovação conserva snapshot, datas e bytes da versão selecionada do kit',async()=>{
 const a=ambiente(),k=(await a.save()).body.item;
 const renewal=await a.call({action:'renovarControle',item:{id:'doc',nome:'Certidão renovada',emissao:'2027-01-01',validade:'2028-01-01'},versao:'v1',arquivo:{nome:'renovada.pdf',mime:'application/pdf',base64:btoa('%PDF renovado')}},atenderDocumentos);assert.equal(renewal.status,200);
 const listed=(await a.list()).body.itens[0];assert.equal(listed.requisitos[0].snapshot.validade,'2027-01-01');assert.equal(listed.requisitos[0].snapshot.nome,'Certidão original');
 const manifest=(await a.download(listed)).body;assert.equal(manifest.arquivos[0].versaoId,'versao-antiga');const file=await a.call({action:'lerVersaoDocumento',id:'doc',versaoId:manifest.arquivos[0].versaoId,arquivoId:manifest.arquivos[0].arquivoId},atenderDocumentos);assert.equal(file.body.base64,btoa('%PDF original'));
 const edited=await a.save({...payload(listed),nome:'Outro nome'},listed.atualizadoEm);assert.equal(edited.body.item.requisitos[0].snapshot.validade,'2027-01-01');
});
test('legado recebe referência imutável no acervo antes do kit e continua baixando após primeira renovação',async()=>{
 const a=ambiente({rows:[doc({versoes:[],anexos:[],arquivoNome:'antigo.pdf',campoFuturo:'preservado'}),row('arquivo','doc',{nome:'antigo.pdf',mime:'application/pdf'})]});a.state.files.set('doc',new TextEncoder().encode('%PDF legado'));
 const r=await a.save();assert.equal(r.status,200);assert.equal(a.state.writes.length,2);const k=r.body.item,ref=k.requisitos[0],current=a.state.rows.find(r=>r.colecao==='ativo'&&r.id==='doc').registro;assert.ok(ref.versaoId);assert.equal(current.campoFuturo,'preservado');assert.equal(current.versoes[0].arquivo.chave,'doc');
 const renewal=await a.call({action:'renovarControle',item:{id:'doc',validade:'2028-01-01'},versao:current.atualizadoEm,arquivo:{nome:'novo.pdf',mime:'application/pdf',base64:btoa('%PDF novo')}},atenderDocumentos);assert.equal(renewal.status,200);
 const manifest=(await a.download(k)).body.arquivos[0];assert.equal(manifest.versaoId,ref.versaoId);const old=await a.call({action:'lerVersaoDocumento',id:'doc',versaoId:manifest.versaoId,arquivoId:manifest.arquivoId},atenderDocumentos);assert.equal(old.body.base64,btoa('%PDF legado'));assert.equal(a.state.files.has('doc'),true);
});
test('kit parcial indica documento/anexo/validade pendentes e dispensa exige motivo',async()=>{
 const a=ambiente({rows:[doc({temArquivo:false,versoes:[],anexos:[],validade:''})]}),r=await a.save(item({requisitos:[req(),req({id:'sem-doc',documentoId:''}),req({id:'dispensa',documentoId:'',dispensado:true,justificativa:'Não exigido neste edital fictício'})]}));assert.equal(r.status,200);assert.match(r.body.item.pendencias.join(' '),/Anexo.*Validade.*Documento não vinculado/);assert.equal((await a.download(r.body.item)).body.arquivos.length,0);
 assert.equal((await ambiente().save(item({requisitos:[req({documentoId:'',dispensado:true})]}))).status,422);
 assert.equal((await ambiente().save(item({requisitos:[req({dispensado:true,justificativa:'Motivo'})]}))).status,422);
});
test('anexos completos, referências repetidas e seleção explícita sem duplicar arquivos',async()=>{
 const first=anexo(),second=anexo('versao-anexo'),a=ambiente({rows:[doc({versoes:[{id:'versao-antiga',arquivo:first,anexos:[first,second],snapshot:{titularId:empresa,semVencimento:true}}]})]});
 a.state.files.set(second.chave,new TextEncoder().encode('%PDF segundo anexo'));
 const k=(await a.save(item({requisitos:[req({versaoId:'versao-antiga'}),req({id:'outro',versaoId:'versao-antiga',arquivoId:'versao-anexo'})]}))).body.item;const manifest=(await a.download(k)).body;assert.equal(manifest.arquivos.length,2);assert.equal(new Set(manifest.arquivos.map(f=>f.arquivoId)).size,2);
});
test('resultado incerto preserva kit e reenvio recupera sem duplicar histórico',async()=>{
 const a=ambiente({commitSemResposta:true});assert.equal((await a.save()).status,503);const r=await a.save();assert.equal(r.status,200);assert.equal(r.body.item.historico.length,1);assert.equal(a.state.writes.length,1);
});
test('revogação antes de commit impede escrita e depois do commit impede exposição',async()=>{
 const a=ambiente({revokeAt:2});assert.equal((await a.save()).status,401);assert.equal(a.state.writes.length,0);
 const b=ambiente({revokeAfterCommit:true});const r=await b.save();assert.equal(r.status,401);assert.equal(b.state.writes.length,1);assert.equal('item' in r.body,false);
 const c=ambiente();const k=(await c.save()).body.item;c.state.revogado=true;assert.equal((await c.download(k)).status,401);
});
test('documento tornado pessoal não vaza snapshot, não entra no download e bloqueia edição destrutiva',async()=>{
 const a=ambiente(),k=(await a.save()).body.item,documento=a.state.rows.find(r=>r.id==='doc').registro;documento.titularId='pessoa';
 const listado=(await a.list()).body.itens[0];assert.equal(listado.requisitos[0].restrito,true);assert.equal(listado.requisitos[0].snapshot,null);assert.equal(listado.requisitos[0].documentoId,'');assert.equal((await a.download(listado)).body.arquivos.length,0);assert.equal((await a.save(payload(listado),listado.atualizadoEm)).status,403);assert.equal(a.state.rows.find(r=>r.colecao==='licitacoes_kits').registro.requisitos[0].documentoId,'doc');
});


test('arquivo ausente ou caminho inválido gera pendência explícita, nunca chave interna',async()=>{
 for(const invalid of [false,true]){
  const a=ambiente(),k=(await a.save()).body.item;
  if(invalid)a.state.rows.find(r=>r.id==='doc').registro.versoes[0].arquivo.chave='outro/segredo';else a.state.files.clear();
  if(invalid)a.state.rows.find(r=>r.id==='doc').registro.versoes[0].anexos[0].chave='outro/segredo';
  const d=await a.download(k);assert.equal(d.status,200);assert.equal(d.body.arquivos.length,0);assert.match(d.body.pendencias.join(' '),invalid?/inválida/:/não encontrado/);assert.doesNotMatch(JSON.stringify(d.body),/outro\/segredo/);
 }
});
test('datas incompletas, inválidas, futuras ou contraditórias não ficam silenciosamente regulares',()=>{
 const base={documentoId:'doc',versaoId:'v',snapshot:{emissao:'2026-10-01',validade:'2026-11-03',estado:'ativo'}};
 assert.deepEqual(pendenciasRequisitoKit(base,{hoje:'2026-11-03'}),[]);assert.match(pendenciasRequisitoKit(base,{hoje:'2026-11-04'}).join(' '),/vencido/);
 for(const [patch,re] of [[{emissao:''},/Emissão não informada/],[{validade:'2026-02-30'},/Validade inválida/],[{emissao:'2026-11-05'},/futura/],[{semVencimento:true},/sem vencimento/]])assert.match(pendenciasRequisitoKit({...base,snapshot:{...base.snapshot,...patch}},{hoje:'2026-11-03'}).join(' '),re);
});
test('AVCB e origem incêndio ficam exclusivamente na ficha de Patrimônio',async()=>{
 for(const patch of [{categoria:'AVCB'},{origem:'incendio'},{origemTipo:'incendio'}]){const a=ambiente({rows:[doc(patch)]});assert.equal((await a.save()).status,403);assert.equal(a.state.writes.length,0);}
});
test('revogação durante verificação dos bytes impede manifest com referências',async()=>{
 const a=ambiente(),k=(await a.save()).body.item;
 a.sb.storage.from=()=>({async download(){a.state.revogado=true;return {data:new Blob(['%PDF ficticio']),error:null};}});
 const r=await a.download(k);assert.equal(r.status,401);assert.equal('arquivos' in r.body,false);
});


test('versão primária sem lista de anexos ainda baixa por ID; anexo secundário sem ID fica pendente',async()=>{
 const primary=anexo(),secondary={chave:'documentos/doc/secundario',nome:'secundario.pdf',mime:'application/pdf'};
 const a=ambiente({rows:[doc({versoes:[{id:'versao-antiga',arquivo:primary,anexos:[],snapshot:{titularId:empresa,emissao:'2026-01-01',semVencimento:true}}]})]}),k=(await a.save(item({requisitos:[req({versaoId:'versao-antiga'})]}))).body.item;
 const manifest=(await a.download(k)).body;assert.equal(manifest.arquivos.length,1);
 const r=await a.call({action:'lerVersaoDocumento',id:'doc',versaoId:'versao-antiga',arquivoId:primary.id},atenderDocumentos);assert.equal(r.status,200);assert.equal(r.body.base64,btoa('%PDF original'));
 a.state.rows.find(r=>r.id==='doc').registro.versoes[0].anexos=[primary,secondary,null];
 const pending=await a.download(k);assert.equal(pending.status,200);assert.equal(pending.body.arquivos.length,1);assert.match(pending.body.pendencias.join(' '),/sem identificador|inválida/);
});

test('Atual congela metadados corrigidos sem reupload e conserva kits e versões anteriores',async()=>{
 const a=ambiente(),antigo=(await a.save(item({requisitos:[req({versaoId:'versao-antiga'})]}))).body.item;
 const bytesAntes=[...a.state.files],versaoAntes=structuredClone(a.state.rows.find(r=>r.id==='doc').registro.versoes[0]);
 const correcao=await a.call({action:'salvarControle',item:{id:'doc',nome:'Certidão com prazo corrigido',validade:'2026-01-02'},versao:'v1'},atenderDocumentos);assert.equal(correcao.status,200);
 a.state.rows.push(row('ativo','edital-novo',{tipo:'licitacao',nome:'Outro edital fictício'}));
 const r=await a.save(item({cadastroId:crypto.randomUUID(),licitacaoId:'edital-novo'}));assert.equal(r.status,200);const atual=r.body.item;
 assert.equal(atual.requisitos[0].snapshot.validade,'2026-01-02');assert.equal(atual.requisitos[0].snapshot.nome,'Certidão com prazo corrigido');assert.match(atual.pendencias.join(' '),/vencido/);assert.notEqual(atual.requisitos[0].versaoId,'versao-antiga');
 const documento=a.state.rows.find(r=>r.id==='doc').registro;assert.deepEqual(documento.versoes[0],versaoAntes);assert.equal(documento.versoes.at(-1).snapshot.validade,'2026-01-02');assert.deepEqual([...a.state.files],bytesAntes);
 const lista=(await a.list()).body.itens;assert.equal(lista.find(k=>k.id===antigo.id).requisitos[0].snapshot.validade,'2027-01-01');assert.equal((await a.download(antigo)).body.arquivos[0].versaoId,'versao-antiga');
 const manifest=(await a.download(atual)).body.arquivos[0],arquivo=await a.call({action:'lerVersaoDocumento',id:manifest.documentoId,versaoId:manifest.versaoId,arquivoId:manifest.arquivoId},atenderDocumentos);assert.equal(arquivo.body.base64,btoa('%PDF original'));
 a.state.rows.push(row('ativo','edital-terceiro',{tipo:'licitacao',nome:'Terceiro edital fictício'}));
 const semNovaCorrecao=await a.save(item({cadastroId:crypto.randomUUID(),licitacaoId:'edital-terceiro'}));assert.equal(semNovaCorrecao.status,200);assert.equal(semNovaCorrecao.body.item.requisitos[0].versaoId,atual.requisitos[0].versaoId);assert.equal(a.state.rows.find(r=>r.id==='doc').registro.versoes.length,documento.versoes.length);
 const atualizarAntigo=payload(antigo);atualizarAntigo.requisitos[0].versaoId='';const editado=await a.save(atualizarAntigo,antigo.atualizadoEm);assert.equal(editado.status,200);assert.equal(editado.body.item.requisitos[0].snapshot.validade,'2026-01-02');assert.equal(editado.body.item.requisitos[0].versaoId,atual.requisitos[0].versaoId);
 const historico=a.state.rows.find(r=>r.id===antigo.id&&r.colecao==='licitacoes_kits').registro.historico;assert.equal(historico.at(-1).antes.requisitos[0].snapshot.validade,'2027-01-01');assert.equal(historico.at(-1).depois.requisitos[0].snapshot.validade,'2026-01-02');
});
