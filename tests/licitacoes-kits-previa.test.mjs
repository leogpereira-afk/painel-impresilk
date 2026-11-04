import test from 'node:test';
import assert from 'node:assert/strict';
import {criarZip} from '../src/lib/zip.mjs';

const payloadExistente=kit=>({id:kit.id,nome:kit.nome,licitacaoId:kit.licitacaoId,titularId:kit.titularId,requisitos:kit.requisitos.map(r=>Object.fromEntries(['id','categoria','descricao','documentoId','versaoId','arquivoId','dispensado','justificativa'].map(k=>[k,r[k]])))});

async function contextoLixeiraDemo(sufixo){
 globalThis.location={search:'?cenario=licitacoes-workspace'};
 const {listarLicitacoesDemo}=await import('../src/review/licitacoes-agenda.mjs');
 const {respostaKitsLicitacoes}=await import('../src/review/licitacoes-kits.mjs');
 const {respostaDocumentos,bancoDocumentosDemo}=await import('../src/review/documentos.mjs');
 const sessao={master:true},licitacoes=listarLicitacoesDemo(sessao);
 const edital={...licitacoes.find(l=>l.id==='demo-trabalho-1'),id:`edital-lixeira-${sufixo}`,nome:`Edital fictício de lixeira ${sufixo}`};
 licitacoes.push(edital);
 const solicitar=async corpo=>{const r=await respostaKitsLicitacoes(corpo,sessao,[],licitacoes);assert.ok(r,'A prévia deve encaminhar a ação para o handler real');return {status:r.status,body:await r.json()};};
 const chamar=async(corpo,status=200)=>{const r=await solicitar(corpo);assert.equal(r.status,status,JSON.stringify(r.body));return r.body;};
 const doc=async corpo=>{const r=await respostaDocumentos(corpo,sessao,[]);const b=await r.json();assert.equal(r.status,200,JSON.stringify(b));return b;};
 const item={cadastroId:crypto.randomUUID(),nome:`Kit fictício de lixeira ${sufixo}`,licitacaoId:edital.id,titularId:'73405710-78db-461b-9d33-37a228fd62c0',requisitos:[
  {id:`req-lixeira-${sufixo}`,categoria:'Contrato social',descricao:'Documento fictício para conferir restauração',documentoId:'contrato-licitacoes-demo'},
 ]};
 const kit=(await chamar({action:'salvarKitLicitacoes',item})).item;
 const linhas=async()=>{const {data,error}=await bancoDocumentosDemo().from('painel_registros').select('id,registro').eq('colecao','ativo');assert.equal(error,null);return data;};
 return {chamar,solicitar,doc,item,kit,linhas};
}

test('prévia usa handler real: kit, download e renovação preservam versão preparada',async()=>{
 globalThis.location={search:'?cenario=licitacoes-workspace'};
 const {listarLicitacoesDemo}=await import('../src/review/licitacoes-agenda.mjs');
 const {respostaKitsLicitacoes}=await import('../src/review/licitacoes-kits.mjs');
 const {respostaDocumentos}=await import('../src/review/documentos.mjs');
 const sessao={master:true},licitacoes=listarLicitacoesDemo(sessao);
 const chamarKit=async corpo=>{const r=await respostaKitsLicitacoes(corpo,sessao,[],licitacoes);const b=await r.json();assert.equal(r.status,200,JSON.stringify(b));return b;};
 const chamarDoc=async corpo=>{const r=await respostaDocumentos(corpo,sessao,[]);const b=await r.json();assert.equal(r.status,200,JSON.stringify(b));return b;};
 const lista=await chamarKit({action:'listarKitsLicitacoes'}),kit=lista.itens[0];
 assert.equal(kit.requisitos.length,3);assert.equal(kit.licitacaoId,'demo-trabalho-1');assert.ok(kit.pendencias.some(p=>p.includes('Documento não vinculado')));
 const download=await chamarKit({action:'prepararDownloadKitLicitacoes',id:kit.id,versao:kit.atualizadoEm});assert.equal(download.arquivos.length,2);
 const refs=download.arquivos,arquivos=[];
 for(const ref of refs){const doc=await chamarDoc({action:'lerVersaoDocumento',id:ref.documentoId,versaoId:ref.versaoId,arquivoId:ref.arquivoId});arquivos.push({nome:ref.nome,bytes:new Uint8Array(Buffer.from(doc.base64,'base64'))});}
 assert.ok(criarZip(arquivos).length>100);assert.equal(arquivos[0].bytes.slice(0,4).toString(),'37,80,68,70');
 const acervo=await chamarDoc({action:'listarDocumentos'}),documento=acervo.itens.find(d=>d.id==='cnd-licitacoes-demo');
 const antigo=refs.find(r=>r.documentoId===documento.id),bytesAntes=await chamarDoc({action:'lerVersaoDocumento',id:documento.id,versaoId:antigo.versaoId,arquivoId:antigo.arquivoId});
 const novos=Buffer.concat([Buffer.from(bytesAntes.base64,'base64'),Buffer.from('\n% renovacao ficticia\n')]);
 await chamarDoc({action:'renovarControle',item:{id:documento.id,emissao:'2026-11-03',validade:'2027-11-03'},versao:documento.atualizadoEm,arquivo:{nome:'cnd-renovada-ficticia.pdf',mime:'application/pdf',base64:novos.toString('base64')}});
 const depois=await chamarKit({action:'prepararDownloadKitLicitacoes',id:kit.id,versao:kit.atualizadoEm});assert.deepEqual(depois.arquivos,refs);
 const bytesDepois=await chamarDoc({action:'lerVersaoDocumento',id:documento.id,versaoId:antigo.versaoId,arquivoId:antigo.arquivoId});assert.equal(bytesDepois.base64,bytesAntes.base64);
 const atual=await chamarDoc({action:'lerVersaoDocumento',id:documento.id});assert.notEqual(atual.base64,bytesAntes.base64);
});

test('prévia: lixeira e restauração preservam documentos, versões, validades, downloads e histórico',async()=>{
 const {chamar,doc,item,kit,linhas}=await contextoLixeiraDemo('preservacao');
 const antes=await linhas(),requisitos=structuredClone(kit.requisitos),historico=structuredClone(kit.historico);
 const manifesto=await chamar({action:'prepararDownloadKitLicitacoes',id:kit.id,versao:kit.atualizadoEm});
 const ref=manifesto.arquivos[0];assert.ok(ref);
 const arquivoAntes=await doc({action:'lerVersaoDocumento',id:ref.documentoId,versaoId:ref.versaoId,arquivoId:ref.arquivoId});
 const removido=(await chamar({action:'arquivarKitLicitacoes',id:kit.id,versao:kit.atualizadoEm})).item;
 assert.equal(removido.id,kit.id);assert.equal(removido.estado,'lixeira');assert.ok(removido.lixeiraEm);assert.equal(removido.lixeiraPor,'Conta de demonstração');
 assert.deepEqual(removido.requisitos,requisitos);assert.deepEqual(removido.historico.slice(0,-1),historico);assert.equal(removido.historico.at(-1).acao,'mover_lixeira');
 let lista=(await chamar({action:'listarKitsLicitacoes'})).itens.filter(k=>k.id===kit.id);
 assert.equal(lista.length,1);assert.equal(lista[0].estado,'lixeira');
 const duplicado=await chamar({action:'salvarKitLicitacoes',item:{...item,cadastroId:crypto.randomUUID()}},409);
 assert.match(duplicado.erro,/lixeira|restaur/i);
 await chamar({action:'salvarKitLicitacoes',item:{id:kit.id,nome:'Edição indevida'},versao:removido.atualizadoEm},409);
 const arquivado=await chamar({action:'prepararDownloadKitLicitacoes',id:kit.id,versao:removido.atualizadoEm});
 assert.deepEqual(arquivado.arquivos,manifesto.arquivos);
 const restaurado=(await chamar({action:'restaurarKitLicitacoes',id:kit.id,versao:removido.atualizadoEm})).item;
 assert.equal(restaurado.estado,'ativo');assert.equal(restaurado.id,kit.id);assert.deepEqual(restaurado.requisitos,requisitos);
 assert.deepEqual(restaurado.historico.slice(0,-1),removido.historico);assert.equal(restaurado.historico.at(-1).acao,'restaurar');
 lista=(await chamar({action:'listarKitsLicitacoes'})).itens.filter(k=>k.id===kit.id);assert.equal(lista.length,1);assert.equal(lista[0].estado,'ativo');
 assert.deepEqual(await linhas(),antes,'Nenhuma ficha documental ou versão deve ser escrita pela movimentação do kit');
 const arquivoDepois=await doc({action:'lerVersaoDocumento',id:ref.documentoId,versaoId:ref.versaoId,arquivoId:ref.arquivoId});
 assert.equal(arquivoDepois.base64,arquivoAntes.base64,'O mesmo arquivo continua baixável após restaurar');
 const final=await chamar({action:'prepararDownloadKitLicitacoes',id:kit.id,versao:restaurado.atualizadoEm});assert.deepEqual(final.arquivos,manifesto.arquivos);
});

test('prévia: duas abas não sobrescrevem a movimentação e não duplicam o kit',async()=>{
 const {chamar,solicitar,kit}=await contextoLixeiraDemo('concorrencia');
 const primeira=await chamar({action:'arquivarKitLicitacoes',id:kit.id,versao:kit.atualizadoEm});
 await chamar({action:'restaurarKitLicitacoes',id:kit.id,versao:kit.atualizadoEm},409);
 await chamar({action:'salvarKitLicitacoes',item:{id:kit.id,nome:'Rascunho antigo'},versao:kit.atualizadoEm},409);
 let salvo=(await chamar({action:'listarKitsLicitacoes'})).itens.find(k=>k.id===kit.id);
 assert.equal(salvo.estado,'lixeira');assert.deepEqual(salvo.historico,primeira.item.historico);
 const restaurado=(await chamar({action:'restaurarKitLicitacoes',id:kit.id,versao:salvo.atualizadoEm})).item;
 const resultados=await Promise.all([
  solicitar({action:'arquivarKitLicitacoes',id:kit.id,versao:restaurado.atualizadoEm}),
  solicitar({action:'salvarKitLicitacoes',item:{...payloadExistente(restaurado),nome:'Rascunho concorrente'},versao:restaurado.atualizadoEm}),
 ]);
 assert.deepEqual(resultados.map(r=>r.status).sort(),[200,409],'Uma operação vence e a outra recebe conflito, sem sobrescrever o vencedor');
 const vencedor=resultados.find(r=>r.status===200).body.item;
 salvo=(await chamar({action:'listarKitsLicitacoes'})).itens.filter(k=>k.id===kit.id);
 assert.equal(salvo.length,1);assert.deepEqual(salvo[0],vencedor);
 assert.equal(salvo[0].historico.length,restaurado.historico.length+1);
 if(salvo[0].estado==='lixeira')await chamar({action:'restaurarKitLicitacoes',id:kit.id,versao:salvo[0].atualizadoEm});
});
