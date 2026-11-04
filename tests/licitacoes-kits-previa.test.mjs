import test from 'node:test';
import assert from 'node:assert/strict';
import {criarZip} from '../src/lib/zip.mjs';

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
