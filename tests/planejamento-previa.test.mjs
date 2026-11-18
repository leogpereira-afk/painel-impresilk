import test from 'node:test';
import assert from 'node:assert/strict';
import {dadosPlanejamentoPrevia,operarPlanejamentoPrevia,ATOR_PREVIA,PESSOAS_PREVIA} from '../src/review/planejamento.mjs';
import {resumoAcoes} from '../supabase/functions/_shared/planejamento.mjs';

test('prévia conserva múltiplos responsáveis, uma contagem de custo e histórico após serializar',()=>{
 const estado=dadosPlanejamentoPrevia();
 const a=estado.itens[0];
 assert.equal(a.responsaveis.length,3);
 assert.equal(resumoAcoes([a]).previstoCentavos,120000);
 const salvo=operarPlanejamentoPrevia(estado,{action:'salvar',item:{...a,previstoCentavos:155055}},ATOR_PREVIA).item;
 const relido=JSON.parse(JSON.stringify(estado));
 assert.equal(relido.itens[0].previstoCentavos,155055);
 assert.equal(relido.itens[0].responsaveis[0].idPessoa,'900001');
 assert.equal(salvo.historico.length,a.historico.length+1);
 assert.throws(()=>operarPlanejamentoPrevia(relido,{action:'salvar',item:a},ATOR_PREVIA),e=>e.status===409);
});
test('arquivo de teste permanece íntegro após recarga e substituição preserva metadados',()=>{
 const estado=dadosPlanejamentoPrevia(),a=estado.itens[0];
 const bytes=Buffer.from('%PDF-1.4\nArquivo fictício para testar persistência.\n%%EOF');
 const b={action:'anexar',id:a.id,versao:a.versao,nome:'exemplo.pdf',mime:'application/pdf',base64:bytes.toString('base64'),descricao:'Ensaio'};
 const comArquivo=operarPlanejamentoPrevia(estado,b,ATOR_PREVIA).item;
 const relido=JSON.parse(JSON.stringify(estado));
 const primeiro=comArquivo.anexos[0];
 assert.deepEqual(Buffer.from(relido.arquivos[primeiro.id].base64,'base64'),bytes);
 const novo=operarPlanejamentoPrevia(relido,{...b,versao:comArquivo.versao,substituiId:primeiro.id},ATOR_PREVIA).item;
 assert.equal(novo.anexos.length,2);
 assert.ok(novo.anexos[0].removidoEm);
 assert.ok(relido.arquivos[primeiro.id]);
 assert.equal(novo.historico.length,a.historico.length+2);
});
test('leitor não salva nem anexa; responsável atualiza somente a etapa atribuída',()=>{
 const estado=dadosPlanejamentoPrevia(),a=estado.itens[0];
 const leitor={gestor:false,usuario:'leitor',nome:'Leitor',rhId:''};
 assert.throws(()=>operarPlanejamentoPrevia(estado,{action:'salvar',item:{...a,situacao:'execucao'}},leitor),e=>e.status===403);
 const responsavel={...leitor,usuario:'ana',rhId:PESSOAS_PREVIA[0].rhId};
 const salvo=operarPlanejamentoPrevia(estado,{action:'salvar',item:{...a,etapas:a.etapas.map(e=>({...e,situacao:'concluida'}))}},responsavel).item;
 assert.equal(salvo.etapas[0].situacao,'concluida');
 assert.throws(()=>operarPlanejamentoPrevia(estado,{action:'salvar',item:{...salvo,previstoCentavos:1}},responsavel),e=>e.status===403);
});
test('repetir lote devolve o snapshot original; outro conteúdo ou autor não reutiliza lote',()=>{
 const estado=dadosPlanejamentoPrevia(),a=estado.itens[0];
 const b={action:'importar',loteId:'lote-exemplo',itens:[{item:{...a,id:'acao-importada',versao:0,origem:{chave:'fonte-exemplo',campos:{titulo:a.titulo}}},versao:0}]};
 const inicial=operarPlanejamentoPrevia(estado,b,ATOR_PREVIA);
 const item=inicial.itens[0];
 operarPlanejamentoPrevia(estado,{action:'salvar',item:{...item,titulo:'Alteração posterior'}},ATOR_PREVIA);
 const relido=JSON.parse(JSON.stringify(estado));
 assert.deepEqual(operarPlanejamentoPrevia(relido,b,ATOR_PREVIA),inicial);
 assert.throws(()=>operarPlanejamentoPrevia(relido,{...b,itens:[]},ATOR_PREVIA),e=>e.status===409);
 assert.throws(()=>operarPlanejamentoPrevia(relido,b,{...ATOR_PREVIA,usuario:'outro-gestor'}),e=>e.status===409);
 assert.equal(relido.itens.filter(i=>i.id==='acao-importada').length,1);
});
test('prévia recusa conteúdo disfarçado e permite baixar versão removida no histórico',async()=>{
 const estado=dadosPlanejamentoPrevia(),a=estado.itens[0];
 const b={action:'anexar',id:a.id,versao:a.versao,nome:'exemplo.pdf',mime:'application/pdf',base64:Buffer.from('Não é um PDF').toString('base64')};
 assert.throws(()=>operarPlanejamentoPrevia(estado,b,ATOR_PREVIA),e=>e.status===422);
 assert.equal(Object.keys(estado.arquivos).length,0);
 const bytes=Buffer.from('%PDF-1.4\nHistórico fictício\n%%EOF');
 const item=operarPlanejamentoPrevia(estado,{...b,base64:bytes.toString('base64')},ATOR_PREVIA).item;
 const arquivoId=item.anexos[0].id;
 operarPlanejamentoPrevia(estado,{action:'removerAnexo',id:a.id,versao:item.versao,arquivoId},ATOR_PREVIA);
 const r=operarPlanejamentoPrevia(JSON.parse(JSON.stringify(estado)),{action:'arquivo',id:a.id,arquivoId},ATOR_PREVIA);
 try {assert.deepEqual(Buffer.from(await (await fetch(r.url)).arrayBuffer()),bytes);} finally {URL.revokeObjectURL(r.url);}
});
