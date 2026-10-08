import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarAgenda, numeroWhatsApp } from './agendaCompromissos.js';
const mapa = {
  atraso: { titulo: 'Instalar fachada', cliente: 'São José', dono: 'ana', donoNome: 'Ana', tipo: 'instalacao', data: '2026-10-01' },
  tarde: { titulo: 'Visita', dono: 'ana', donoNome: 'Ana', tipo: 'visita', data: '2026-10-08', hora: '15:00' },
  cedo: { titulo: 'Medição', dono: 'bruno', donoNome: 'Bruno', tipo: 'medicao', data: '2026-10-08', hora: '08:00' },
  amanha: { titulo: 'Retorno', dono: 'bruno', data: '2026-10-09' },
  semana: { titulo: 'Entrega', dono: 'ana', data: '2026-10-15' },
  depois: { titulo: 'Planejar', dono: 'ana', data: '2026-10-16' },
  semData: { titulo: 'Conferir arte', dono: 'ana', data: '' },
  feito: { titulo: 'Finalizado', dono: 'ana', data: '2026-09-01', feito: true, feitoEm: '2026-10-07' },
};
const agenda = op => montarAgenda(mapa, { hoje: '2026-10-08', ...op });
const ids = vm => vm.grupos.flatMap(g => g.itens.map(c => c.id));
test('prioridades contam o mesmo universo sem tratar resolvido como atrasado', () => {
  const vm = agenda();
  assert.equal(vm.emAberto, 7); assert.equal(vm.atrasados, 1); assert.equal(vm.hoje, 2);
  assert.equal(vm.proximos, 2); assert.equal(vm.semData, 1); assert.equal(vm.concluidos, 1);
  assert.deepEqual(ids(vm), ['atraso', 'cedo', 'tarde', 'amanha', 'semana', 'depois', 'semData']);
});
test('cada prioridade mostra exatamente os registros contados', () => {
  for (const [recorte, campo] of [['abertos','emAberto'], ['atrasados','atrasados'], ['hoje','hoje'], ['proximos','proximos'], ['semData','semData'], ['feitos','concluidos']]) {
    const vm = agenda({recorte}); assert.equal(vm.exibidos, vm[campo]);
  }
});
test('pessoa restringe indicadores e lista; chips continuam mostrando toda a equipe autorizada', () => {
  const vm = agenda({ pessoa: 'bruno', recorte: 'hoje' });
  assert.deepEqual(ids(vm), ['cedo']); assert.equal(vm.emAberto, 2); assert.equal(vm.atrasados, 0);
  assert.equal(vm.pessoas.find(p => p.dono === 'ana').emAberto, 5);
});
test('busca por cliente, título, responsável e ID ignora acentos e combina termos', () => {
  assert.deepEqual(ids(agenda({busca:'sao fachada'})), ['atraso']);
  assert.deepEqual(ids(agenda({busca:'cedo'})), ['cedo']);
  assert.equal(agenda({busca:'Ana',tipo:'visita'}).exibidos, 1);
  assert.equal(agenda({busca:'não existe'}).exibidos, 0);
});
test('sem data nunca puxa os resolvidos e próxima semana exclui hoje e o oitavo dia', () => {
  assert.deepEqual(ids(agenda({recorte:'semData'})), ['semData']);
  assert.deepEqual(ids(agenda({recorte:'proximos'})), ['amanha','semana']);
  assert.deepEqual(ids(agenda({recorte:'feitos'})), ['feito']);
});
test('virada de dia recalcula também os atrasos por responsável', () => {
  const vm = agenda({hoje:'2026-10-09'});
  assert.equal(vm.atrasados, 3); assert.equal(vm.pessoas.find(p => p.dono === 'bruno').atrasados, 1);
});
test('horário vazio fica depois dos horários marcados; legado mantém o dono da sessão', () => {
  const vm = montarAgenda({a:{data:'2026-10-08'},b:{data:'2026-10-08',hora:'10:00'}}, {hoje:'2026-10-08',usuario:'eu',pessoa:'eu'});
  assert.deepEqual(ids(vm), ['b','a']); assert.equal(vm.pessoas[0].emAberto, 2);
});
test('datas inválidas são pendências sem data e não somem da lista', () => {
  const vm = montarAgenda({a:{data:'2026-02-30'},b:{data:'errada'}}, {hoje:'2026-10-08',recorte:'semData'});
  assert.equal(vm.semData,2); assert.equal(vm.exibidos,2);
});
test('mapa vazio e pessoa sem resultado não inventam pendências', () => {
  assert.equal(montarAgenda(null,{hoje:'2026-10-08'}).exibidos,0);
  assert.equal(agenda({pessoa:'fora-do-escopo'}).exibidos,0);
});
test('WhatsApp mantém DDI informado sem duplicar o 55', () => {
  assert.equal(numeroWhatsApp('(38) 99999-0000'),'5538999990000');
  assert.equal(numeroWhatsApp('+55 38 99999-0000'),'5538999990000');
});
