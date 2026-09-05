import test from 'node:test';
import assert from 'node:assert/strict';
import {estadoDoPapel,temPendencia,contarAcessos,situacaoEntrada} from './acesso-state.mjs';
import {agruparEntradas,elencoRh} from '../../supabase/functions/_shared/acesso-leitura.mjs';

test('contagem inclui conta existente sem módulos e coincide com filtro',()=>{
 const p={sistema:'painel',real:{existe:true,ativo:true,permissoes:[]},permissoes:['*']};
 assert.equal(estadoDoPapel(p).chave,'vazia'); assert.equal(temPendencia(p),true);
 assert.equal(contarAcessos({contas:[{papeis:[p]}]}).foraDoLugar,1);
});
test('uma pessoa com dois acessos temporários não vira duas pessoas',()=>{
 const p={sistema:'pcp',real:{existe:true,temporaria:true}};
 const n=contarAcessos({contas:[{papeis:[p,{...p,sistema:'brief'}]}]});
 assert.equal(n.temporarias,2); assert.equal(n.pessoasTemporarias,1);
});
test('sistema não integrado não vira conta ausente',()=>{
 assert.equal(temPendencia({sistema:'domo',fonte:'nao_integrado'}),false);
});
test('histórico fora de ordem preserva último sucesso e última falha',()=>{
 const events=[{usuario:'ana',sistema:'rh',acao:'entrou',em:'2026-09-05T12:05:00Z'},{usuario:'ana',sistema:'rh',acao:'login-falhou',em:'2026-09-05T12:00:00Z'}];
 const [e]=agruparEntradas(events.reverse()); assert.equal(situacaoEntrada(e),'Entrou após a falha');
 const [f]=agruparEntradas([...events,{usuario:'ana',sistema:'rh',acao:'login-falhou',em:'2026-09-05T12:10:00Z'}]);
 assert.equal(situacaoEntrada(f),'Última tentativa falhou');
});
test('elenco usa os campos projetados do RH',()=>{
 assert.deepEqual(elencoRh([{nome:'Pessoa exemplo',situacao:'ativo'},{nome:' ',situacao:'inativo'}]),[{nome:'Pessoa exemplo',como:'cadastro',detalhe:''}]);
});
