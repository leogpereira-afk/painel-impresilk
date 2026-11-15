import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarAcao, atorDoCiclo, apresentarCiclo, autorizarModulo, arquivoAutorizado, validarFoto, MAX_FOTO } from '../supabase/functions/_shared/virada.mjs';
const master = {sub:'direcao_teste',nome:'Direção Exemplo',master:true,perms:['*']};
const sessao = n => ({sub:'pessoa_'+n,nome:'Pessoa Exemplo '+n,perms:['virada']});
const pessoa = n => ({rhId:'rh-'+n});
const rh = [1,2,3,4].map(n=>({id:'rh-'+n,nome:'Pessoa Exemplo '+n,funcao:'Função fictícia'}));
function setup() {
 let count=1;
 const uuid=()=>`00000000-0000-4000-8000-${String(count++).padStart(12,'0')}`;
 const contexto={uuid,em:'2026-01-01T12:00:00Z',pessoas:rh};
 let ciclo=aplicarAcao(null,{action:'salvarCiclo',versao:0,item:{nome:'Ciclo fictício',inicio:'2026-01-01',participantes:[{rhId:'rh-1',mentorId:'rh-2'},{rhId:'rh-2'},{rhId:'rh-3'},{rhId:'rh-4'}]}},master,pessoa(4),contexto);
 const run=(b,s=master,i=pessoa(4),ctx={})=>ciclo=aplicarAcao(ciclo,{idCiclo:ciclo.id,versao:ciclo.versao,...b},s,i,{...contexto,...ctx});
 const mission=(n=1)=>run({action:'salvarMissao',item:{participanteId:ciclo.participantes[n-1].id,titulo:'Conferência de exemplo',objetivo:'Conferir passagem de informação',criterio:'Critério conferido pelo mentor',tipo:'melhoria',fase:30,prazo:'2026-01-20'}}).missoes.at(-1);
 const view=(s,i)=>apresentarCiclo(ciclo,atorDoCiclo(ciclo,s,i));
 return {run,mission,view,contexto,get ciclo(){return ciclo;}};
}
const failure=(fn,status)=>assert.throws(fn,e=>e.status===status);
test('autenticação, módulo e curinga não dão papel de direção',()=>{
 failure(()=>autorizarModulo(null),401);failure(()=>autorizarModulo({sub:'x',perms:['agenda']}),403);
 autorizarModulo({sub:'x',perms:['*']});assert.equal(atorDoCiclo(null,{sub:'x',perms:['*']},{}).direcao,false);
});
test('ciclo usa RH confirmado, ID servidor, início opcional e rejeita vínculos duplicados',()=>{
 const t=setup();assert.equal(t.ciclo.dias,90);assert.equal(t.ciclo.participantes[0].mentorId,t.ciclo.participantes[1].id);
 assert.equal(t.ciclo.participantes[0].nome,'Pessoa Exemplo 1');
 failure(()=>t.run({action:'salvarCiclo',item:{nome:'Ciclo',participantes:[{rhId:'rh-1'},{rhId:'rh-1'}]}}),422);
 failure(()=>t.run({action:'salvarCiclo',item:{nome:'Ciclo',participantes:[{rhId:'inexistente'}]}}),422);
 failure(()=>t.run({action:'salvarCiclo',item:{nome:'Ciclo',participantes:[{rhId:'rh-1',mentorId:'rh-1'}]}}),422);
 t.run({action:'salvarCiclo',item:{nome:'Ciclo',inicio:null,participantes:t.ciclo.participantes}});assert.equal(t.ciclo.inicio,null);
});
test('próprio e mentor leem o PDI; demais participantes e curinga não veem registros privados',()=>{
 const t=setup(),m=t.mission();t.mission(3);
 t.run({action:'comentar',missaoId:m.id,texto:'Feedback reservado'},sessao(1),pessoa(1));
 assert.equal(t.view(sessao(1),pessoa(1)).missoes.length,1);assert.equal(t.view(sessao(2),pessoa(2)).missoes.length,1);
 assert.equal(t.view({...sessao(3),perms:['*']},pessoa(3)).missoes.length,1);
 assert.ok(!JSON.stringify(t.view(sessao(3),pessoa(3))).includes('Feedback reservado'));
 failure(()=>t.view(sessao(8),pessoa(8)),403);
 failure(()=>t.run({action:'comentar',missaoId:m.id,texto:'Invasão'},sessao(3),pessoa(3)),404);
});
test('participante não pactua missão nem altera atribuição ou configuração',()=>{
 const t=setup(),m=t.mission();
 failure(()=>t.run({action:'salvarMissao',item:{...m,titulo:'Alteração'}},sessao(1),pessoa(1)),403);
 failure(()=>t.run({action:'salvarMissao',item:{...m,participanteId:t.ciclo.participantes[2].id}}),422);
 failure(()=>t.run({action:'salvarCiclo',item:{nome:'Outro',participantes:[]}},sessao(1),pessoa(1)),403);
 failure(()=>t.run({action:'salvarCiclo',item:{nome:'Outro',participantes:[]}}),422);
});
test('uma prioridade ativa por pessoa; pausa com motivo preserva histórico e abre espaço',()=>{
 const t=setup(),a=t.mission(),b=t.mission();
 t.run({action:'estado',missaoId:a.id,status:'em_andamento'});
 failure(()=>t.run({action:'estado',missaoId:b.id,status:'em_andamento'}),409);
 t.run({action:'estado',missaoId:a.id,status:'bloqueada',motivo:'Aguardar informação'});
 failure(()=>t.run({action:'estado',missaoId:b.id,status:'em_andamento'}),409);
 failure(()=>t.run({action:'estado',missaoId:a.id,status:'planejada'}),422);
 t.run({action:'estado',missaoId:a.id,status:'planejada',motivo:'Pausa pactuada'});
 t.run({action:'estado',missaoId:b.id,status:'em_andamento'});assert.equal(t.ciclo.missoes[0].historico.at(-1).motivo,'Pausa pactuada');
});
test('evidência textual obrigatória; validação depende de mentor diferente, nunca autoaprovação',()=>{
 const t=setup(),m=t.mission();failure(()=>t.run({action:'estado',missaoId:m.id,status:'em_validacao'}),422);
 t.run({action:'evidencia',missaoId:m.id,texto:'Executado',resultado:'Resultado observado'},sessao(1),pessoa(1));
 t.run({action:'estado',missaoId:m.id,status:'em_validacao'},sessao(1),pessoa(1));
 failure(()=>t.run({action:'validar',missaoId:m.id,parecer:'Confere'},sessao(1),pessoa(1)),403);
 failure(()=>t.run({action:'validar',missaoId:m.id,parecer:'Confere'},master,pessoa(1)),403);
 failure(()=>t.run({action:'validar',missaoId:m.id,parecer:'Confere'},master,{}),403);
 failure(()=>t.run({action:'validar',missaoId:m.id,parecer:'Confere'},sessao(3),pessoa(3)),404);
 t.run({action:'validar',missaoId:m.id,parecer:'Efeito verificado'},sessao(2),pessoa(2));assert.equal(t.view(sessao(1),pessoa(1)).missoes[0].xp,10);
});
test('reabertura estorna XP derivado; revalidação restaura uma única recompensa',()=>{
 const t=setup(),m=t.mission();t.run({action:'evidencia',missaoId:m.id,texto:'Execução',resultado:'Resultado'});t.run({action:'estado',missaoId:m.id,status:'em_validacao'});
 t.run({action:'validar',missaoId:m.id,parecer:'Conferido'},sessao(2),pessoa(2));
 failure(()=>t.run({action:'validar',missaoId:m.id,parecer:'Duplicado'},sessao(2),pessoa(2)),409);
 failure(()=>t.run({action:'estado',missaoId:m.id,status:'em_andamento'}),409);
 t.run({action:'reabrir',missaoId:m.id,motivo:'Rever aplicação'},sessao(2),pessoa(2));assert.equal(t.view(sessao(1),pessoa(1)).missoes[0].xp,0);
 t.run({action:'estado',missaoId:m.id,status:'em_validacao'});t.run({action:'validar',missaoId:m.id,parecer:'Nova conferência'},sessao(2),pessoa(2));assert.equal(t.view(sessao(1),pessoa(1)).missoes[0].xp,10);
 assert.equal(t.ciclo.missoes[0].historico.reduce((s,e)=>s+(e.xp||0),0),10);
});
test('reabertura respeita outra prioridade ativa',()=>{
 const t=setup(),a=t.mission(),b=t.mission();t.run({action:'evidencia',missaoId:a.id,texto:'Execução',resultado:'Resultado'});t.run({action:'estado',missaoId:a.id,status:'em_validacao'});t.run({action:'validar',missaoId:a.id,parecer:'Conferido'});t.run({action:'estado',missaoId:b.id,status:'em_andamento'});
 failure(()=>t.run({action:'reabrir',missaoId:a.id,motivo:'Revisar'}),409);assert.equal(t.ciclo.missoes[0].status,'validada');
});
test('edição preserva prazo original, evidências e mudanças de critério no histórico',()=>{
 const t=setup(),m=t.mission();t.run({action:'evidencia',missaoId:m.id,texto:'Execução',resultado:'Resultado'});
 t.run({action:'salvarMissao',item:{...m,prazo:'2026-01-25',criterio:'Novo critério',motivo:'Informação técnica atualizada'}});
 const atual=t.ciclo.missoes[0];assert.equal(atual.prazoOriginal,'2026-01-20');assert.equal(atual.evidencias.length,1);
 assert.deepEqual(atual.historico.at(-1).alteracoes.prazo,{anterior:'2026-01-20',novo:'2026-01-25'});
 assert.equal(atual.historico.at(-1).alteracoes.criterio.novo,'Novo critério');
});
test('mural publica só resumo/fotos selecionadas; não vaza relato, feedback ou caminho privado',()=>{
 const t=setup(),m=t.mission();t.run({action:'evidencia',missaoId:m.id,texto:'Relato confidencial',resultado:'Resultado reservado'});
 const e=t.ciclo.missoes[0].evidencias[0],a={id:t.contexto.uuid(),nome:'foto.jpg',mime:'image/jpeg',tamanho:10,chave:`virada/${t.ciclo.id}/${m.id}/foto.jpg`};
 t.run({action:'anexar',missaoId:m.id,evidenciaId:e.id},master,pessoa(4),{arquivo:a});
 t.run({action:'comentar',missaoId:m.id,texto:'Feedback confidencial'});
 t.run({action:'publicar',missaoId:m.id,titulo:'Melhoria',texto:'Resumo para equipe',evidenciaIds:[e.id]});
 const view=t.view(sessao(3),pessoa(3)),post=view.mural[0];
 assert.equal(post.fotos.length,1);assert.equal(view.missoes.length,0);
 for(const secret of ['Relato confidencial','Resultado reservado','Feedback confidencial',a.chave,'origemMissaoId'])assert.ok(!JSON.stringify(view).includes(secret));
 const ator=atorDoCiclo(t.ciclo,sessao(3),pessoa(3));assert.equal(arquivoAutorizado(t.ciclo,{postId:post.id,arquivoId:a.id},ator).chave,a.chave);
 failure(()=>arquivoAutorizado(t.ciclo,{missaoId:m.id,arquivoId:a.id},ator),404);
});
test('versão antiga e IDs arbitrários não sobrescrevem estado nem criam autoria do navegador',()=>{
 const t=setup(),m=t.mission();const anterior=structuredClone(t.ciclo);
 failure(()=>t.run({action:'comentar',versao:1,missaoId:m.id,texto:'Antigo'}),409);assert.deepEqual(t.ciclo,anterior);
 t.run({action:'comentar',missaoId:m.id,texto:'Registro',autor:{usuario:'forjado'},xp:999},sessao(1),pessoa(1));
 assert.equal(t.ciclo.missoes[0].comentarios[0].autor.usuario,'pessoa_1');assert.equal(t.view(sessao(1),pessoa(1)).missoes[0].xp,0);
 failure(()=>t.run({action:'comentar',missaoId:'invalido',texto:'x'}),422);
});
test('datas e limites não truncam entradas silenciosamente',()=>{
 const t=setup(),m=t.mission();failure(()=>t.run({action:'salvarMissao',item:{...m,prazo:'2026-02-30'}}),422);
 failure(()=>t.run({action:'salvarMissao',item:{...m,prazo:'2026-05-01'}}),422);
 failure(()=>t.run({action:'comentar',missaoId:m.id,texto:'x'.repeat(3001)}),422);
});
test('assinatura, tipo e limite das fotos são conferidos pelos bytes',()=>{
 const jpeg=new Uint8Array([255,216,255,224,0,255,217]);assert.equal(validarFoto('ensaio.jpg','image/jpeg',jpeg).ext,'jpg');
 failure(()=>validarFoto('ensaio.png','image/png',jpeg),422);failure(()=>validarFoto('../ensaio.jpg','image/jpeg',jpeg),422);
 failure(()=>validarFoto('ensaio.jpg','image/jpeg',new Uint8Array(MAX_FOTO+1)),422);
 failure(()=>validarFoto('ensaio.svg','image/svg+xml',new TextEncoder().encode('<svg/>')),422);
});

test('conhecimento compartilhado exige confirmação do revisor e some com reabertura',()=>{
 const t=setup(),m=t.mission();t.run({action:'salvarMissao',item:{...m,tipo:'aprendizado'}});t.run({action:'evidencia',missaoId:m.id,texto:'Orientação prática',resultado:'Outra pessoa demonstrou'});t.run({action:'estado',missaoId:m.id,status:'em_validacao'});
 t.run({action:'validar',missaoId:m.id,parecer:'Conferi a demonstração',conhecimentoCompartilhado:true},sessao(2),pessoa(2));
 assert.equal(t.ciclo.missoes[0].conhecimentoCompartilhado,true);assert.equal(t.ciclo.missoes[0].validacao.autor.rhId,'rh-2');
 t.run({action:'reabrir',missaoId:m.id,motivo:'Conferir outro aspecto'},sessao(2),pessoa(2));assert.equal(t.ciclo.missoes[0].conhecimentoCompartilhado,false);assert.equal(t.ciclo.missoes[0].validacao,null);
 t.run({action:'estado',missaoId:m.id,status:'em_validacao'});t.run({action:'validar',missaoId:m.id,parecer:'Validação sem confirmação adicional'},sessao(2),pessoa(2));assert.equal(t.ciclo.missoes[0].conhecimentoCompartilhado,false);
});
test('ajuste de prazo/critério/objetivo exige motivo e não perde o anterior se rejeitado',()=>{
 const t=setup(),m=t.mission(),antes=structuredClone(t.ciclo);
 failure(()=>t.run({action:'salvarMissao',item:{...m,prazo:'2026-01-25'}}),422);assert.deepEqual(t.ciclo,antes);
 failure(()=>t.run({action:'salvarMissao',item:{...m,criterio:'Outro critério'}}),422);assert.deepEqual(t.ciclo,antes);
});
