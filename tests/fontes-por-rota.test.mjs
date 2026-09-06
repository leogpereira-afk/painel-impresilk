import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fontesDaRota} from '../src/lib/fontes-por-rota.js';
test('início, conta e central não dependem de cargas financeiras',()=>{
  for(const rota of ['/','/acessos','/minha-conta','/backups','/configuracoes']) assert.deepEqual(fontesDaRota(rota),[]);
});
test('cobrança carrega títulos e suas ordens; vendas compartilham somente orçamentos',()=>{
  assert.deepEqual(fontesDaRota('/contas-atrasadas'),['recebiveis','ordens']);
  assert.deepEqual(fontesDaRota('/orcamentos'),['orcamentos']);
  assert.deepEqual(fontesDaRota('/marketing'),['orcamentos']);
});
