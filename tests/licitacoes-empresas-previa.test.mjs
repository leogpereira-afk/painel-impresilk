import test from 'node:test';
import assert from 'node:assert/strict';
import {respostaEntidadesLicitacoes} from '../src/review/licitacoes-entidades.mjs';
import {respostaCadastrosLicitacoes} from '../src/review/licitacoes-cadastros.mjs';

test('primeira leitura paralela da prévia encontra todos os cadastros das empresas',async()=>{
 const [re,rc]=await Promise.all([
  respostaEntidadesLicitacoes({action:'listarEntidadesLicitacoes'},{master:true}),
  respostaCadastrosLicitacoes({action:'listarCadastrosLicitacoes'},{master:true}),
 ]);
 assert.equal(re.status,200);assert.equal(rc.status,200);
 const entidades=await re.json(),cadastros=await rc.json();
 const ids=new Set(cadastros.itens.map(c=>c.id));
 const empresas=entidades.itens.filter(e=>e.tipo==='empresa');
 assert.equal(empresas.length,4);
 for(const empresa of empresas)for(const id of empresa.cadastroIds||[])assert.ok(ids.has(id),`${empresa.nome}: vínculo disponível na primeira leitura`);
});
