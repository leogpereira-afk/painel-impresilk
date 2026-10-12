import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
const {code}=await transform(await readFile(new URL('../supabase/functions/_shared/agenda-pcp.ts',import.meta.url),'utf8'),{loader:'ts',format:'esm'});
const {canceladaPCP}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
// A O.S. cancelada a mão no PCP (v141) sai da agenda do Painel, como sai do PCP.
test('cancelada a mão no PCP sai; desfeita, sem motivo ou pedido pendente não',()=>{
 assert.equal(canceladaPCP({cancelamento:{ativo:true,motivo:'Cliente desistiu da fachada',por:'Gestor Teste',em:'2026-09-30T12:00:00Z'}}),true);
 assert.equal(canceladaPCP({cancelamento:{ativo:false,motivo:'Cliente desistiu da fachada',desfeitoEm:'2026-09-30T13:00:00Z'}}),false);
 assert.equal(canceladaPCP({cancelamento:{ativo:true,motivo:'   '}}),false);
 assert.equal(canceladaPCP({cancelamento:{cancelar:true,motivo:'Pedido que o aparelho ainda vai mandar'}}),false,'o servidor só guarda a marca aceita');
 assert.equal(canceladaPCP({}),false);assert.equal(canceladaPCP(null),false);
});
test('a agenda do Painel aplica o filtro na produção do mês',async()=>{
 const src=await readFile(new URL('../supabase/functions/painel-agenda/index.ts',import.meta.url),'utf8');
 assert.match(src,/!encerradaERP\(o\) && !canceladaPCP\(o\) && diasCasa\(o\)/);
});

// A O.S. CANCELADA E ESTADO FINAL (item 19 da fila do PCP de 11/10/2026; o PCP
// v171 devolve "cancelada" no OPERACAO.status). Dados fictícios.
const agenda=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const agendada={id:'os-teste',numero:'90001',cliente:'Cliente Teste',liberadoPCP:true,confirmacao:'Confirmado',equipe:['Ana Exemplo'],instalacao:{data:'2026-10-20',periodo:'Manhã'}};
test('status() devolve cancelada para a cancelada no PCP e para a cancelada no ERP',()=>{
 assert.equal(agenda.status(agendada),'confirmada','sem cancelamento, segue o funil');
 const noPCP={...agendada,cancelamento:{ativo:true,motivo:'Cliente desistiu',por:'Gestor Teste',em:'2026-10-12T12:00:00Z'}};
 assert.equal(agenda.status(noPCP),'cancelada');assert.equal(agenda.rotuloStatus(noPCP,'cancelada'),'Cancelada');
 const noERP={...agendada,finalizadaEm:'2026-10-12T10:00:00Z',baixaAutoERP:{em:'2026-10-12T10:00:00Z',status:'CANCELADO'},finalizadoPor:'Mubisys (baixa automática)'};
 assert.equal(agenda.canceladaNoERP(noERP),true);
 assert.equal(agenda.status(noERP),'cancelada','antes era finalizada, "Encerrada no ERP"');
 assert.equal(agenda.projetarOS(noERP).rotuloStatus,'Cancelada');
 assert.equal(agenda.projetarOS(noPCP).status,'cancelada');
 const interna={...noPCP,tipo:'interno'};assert.equal(agenda.rotuloStatus(interna,agenda.status(interna)),'Cancelada','a retirada cancelada também');
});
test('o caso ruim: não é cancelada a baixa do ERP que concluiu, a marca desfeita nem a baixa antiga de O.S. reaberta',()=>{
 const concluida={...agendada,finalizadaEm:'2026-10-12T10:00:00Z',baixaAutoERP:{em:'2026-10-12T10:00:00Z',status:'CONCLUIDO'},finalizadoPor:'Mubisys (baixa automática)'};
 assert.equal(agenda.canceladaNoERP(concluida),false);assert.equal(agenda.status(concluida),'finalizada');assert.equal(agenda.rotuloStatus(concluida,'finalizada'),'Encerrada no ERP');
 const desfeita={...agendada,cancelamento:{ativo:false,motivo:'Cliente desistiu',desfeitoEm:'2026-10-12T13:00:00Z'}};
 assert.equal(agenda.status(desfeita),'confirmada');
 const pendente={...agendada,cancelamento:{cancelar:true,motivo:'Pedido que o aparelho ainda vai mandar'}};
 assert.equal(agenda.status(pendente),'confirmada','o servidor só lê a marca aceita');
 // reaberta: o marcador do ERP fica como histórico, mas finalizadaEm sumiu
 const reaberta={...agendada,baixaAutoERP:{em:'2026-10-01T10:00:00Z',status:'CANCELADO'},finalizadoPor:''};
 assert.equal(agenda.canceladaNoERP(reaberta),false);assert.equal(agenda.status(reaberta),'confirmada');
 // finalizada à mão depois da baixa antiga do ERP: não é a baixa que vale
 const aMao={...agendada,finalizadaEm:'2026-10-12T15:00:00Z',finalizadoPor:'Instalador Teste',baixaAutoERP:{em:'2026-10-01T10:00:00Z',status:'CANCELADO'}};
 assert.equal(agenda.status(aMao),'finalizada');
});
test('a Situação da operação do Comercial lê a cancelada no ERP como Cancelada',async()=>{
 const {build}=await import('esbuild');
 const r=await build({entryPoints:[new URL('../supabase/functions/_shared/comercial-operacao.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'neutral',logLevel:'silent'});
 const {projetarOperacaoComercial}=await import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));
 const noERP={...agendada,finalizadaEm:'2026-10-12T10:00:00Z',baixaAutoERP:{em:'2026-10-12T10:00:00Z',status:'CANCELADO'},finalizadoPor:'Mubisys (baixa automática)'};
 const op=projetarOperacaoComercial(noERP,'ordem-teste','2026-10-12T18:00:00Z');
 assert.equal(op.status,'cancelada');assert.equal(op.rotuloStatus,'Cancelada');assert.equal(op.entregaRealEm,null,'cancelada não é entrega');
 const noPCP=projetarOperacaoComercial({...agendada,cancelamento:{ativo:true,motivo:'Cliente desistiu'}},'ordem-teste','2026-10-12T18:00:00Z');
 assert.equal(noPCP.rotuloStatus,'Cancelada no PCP');assert.equal(noPCP.cancelada,true);
});
