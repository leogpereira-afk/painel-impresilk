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
