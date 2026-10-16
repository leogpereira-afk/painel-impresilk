import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepararNewsletter,publicoDaEdicao,taxaNewsletter} from '../supabase/functions/_shared/newsletter.mjs';
import {atenderNewsletter} from '../supabase/functions/_shared/newsletter-handler.mjs';
const L='10000000-0000-4000-8000-000000000001';
const contato={email:' PESSOA@EXAMPLE.COM ',listas:[L,L],situacao:'inscrito',origem:'Formulário de exemplo',autorizacao:'Aceite registrado'};
test('normaliza e-mail, deduplica listas e recusa ativo sem autorização',()=>{
 const r=prepararNewsletter('contato',contato);assert.equal(r.email,'pessoa@example.com');assert.deepEqual(r.listas,[L]);
 assert.throws(()=>prepararNewsletter('contato',{...contato,autorizacao:''}),/autorização/);
 assert.throws(()=>prepararNewsletter('contato',{...contato,email:'inválido'}),/e-mail/);
});
test('público exclui bloqueados e evita duplicação entre listas',()=>{
 const c=prepararNewsletter('contato',contato);
 assert.equal(publicoDaEdicao([c,c,{...c,email:'b@example.com',situacao:'descadastrado'}],[L]).length,1);
});
test('pronta exige conteúdo e público; não aceita status enviado pelo cliente',()=>{
 assert.throws(()=>prepararNewsletter('edicao',{titulo:'Teste',situacao:'pronta'}),/conteúdo/);
 assert.throws(()=>prepararNewsletter('edicao',{titulo:'Teste',situacao:'enviada'}),/situação/);
 assert.throws(()=>prepararNewsletter('edicao',{titulo:'Teste',imagem:'javascript:alert(1)'}),/HTTPS/);
});
test('métricas distinguem ausente de zero, exigem fonte e validam totais e data',()=>{
 const d={titulo:'Teste',fonteMetricas:'Relatório exemplo',dataResultados:'2026-10-15',metricas:{enviados:10,entregues:8,cliques:0}};
 const r=prepararNewsletter('edicao',d);assert.equal(r.metricas.cliques,0);assert.equal(r.metricas.aberturas,null);
 assert.throws(()=>prepararNewsletter('edicao',{...d,dataResultados:'2026-02-30'}),/data válida/);
 assert.throws(()=>prepararNewsletter('edicao',{...d,fonteMetricas:''}),/fonte/);
 assert.throws(()=>prepararNewsletter('edicao',{...d,metricas:{enviados:1,entregues:2}}),/superar/);
 assert.equal(taxaNewsletter(null,8),null);assert.equal(taxaNewsletter(0,8),0);assert.equal(taxaNewsletter(1,0),null);
});
test('visualização não grava, marketing não configura remetente e nenhum papel dispara sem provedor',async()=>{
 const db={rpc(){throw Error('Não deve acessar banco')}};
 await assert.rejects(atenderNewsletter(db,{action:'newsletterSalvar'},{papel:'visualizacao',quem:'exemplo'}),e=>e.status===403);
 await assert.rejects(atenderNewsletter(db,{action:'newsletterSalvar',tipo:'remetente'},{papel:'marketing',quem:'exemplo'}),e=>e.status===403);
 await assert.rejects(atenderNewsletter(db,{action:'newsletterEnviar'},{papel:'gestao',quem:'exemplo'}),/Nenhum e-mail/);
});
import {lerContatosNewsletter} from '../src/lib/calc/newsletter-csv.js';
test('CSV lida com aspas, duplicados e entradas pendentes sem inventar autorização',()=>{
 const r=lerContatosNewsletter('nome;email;empresa\n"Pessoa; Exemplo";a@example.com;Loja\nOutro;A@example.com;Outra\nRuim;sememail;X',[L]);
 assert.equal(r.validos.length,1);assert.equal(r.erros.length,2);assert.equal(r.validos[0].dados.situacao,'pendente');assert.equal(r.validos[0].dados.autorizacao,'');
 assert.throws(()=>lerContatosNewsletter('nome;email\n"não fecha;a@example.com'),/Aspas/);
});
