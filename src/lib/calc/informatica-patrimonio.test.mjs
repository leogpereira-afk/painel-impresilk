import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {manutencoesDoAtivo,resumoComputadores,alertaManutencao,corte12Meses,hojeEmSaoPaulo,dataValida,idBemParaEdicao} from './informatica-patrimonio.js';
import {vinculoDoEquipamento} from './equipamentos-patrimonio.js';
import {caminhoManutencao} from './navegacao-patrimonio.js';
import {podeAbrir} from '../sessao.js';
test('data em São Paulo e corte de doze meses têm bordas de calendário estáveis',()=>{
 assert.equal(hojeEmSaoPaulo(new Date('2026-10-11T02:30:00Z')),'2026-10-10');
 assert.equal(corte12Meses('2024-02-29'),'2023-02-28');
 assert.equal(dataValida('2026-02-30'),false);
});
test('custo total e 12 meses vêm do mesmo razão; aquisição, futuro e pendências são explícitos',()=>{
 const mapa={a:{ativoId:'um',data:'2026-10-11',valor:50},b:{ativoId:'um',data:'2025-10-11',valor:20},c:{ativoId:'um',data:'2025-10-10',valor:40},d:{ativoId:'um',data:'2027-01-01',valor:90},e:{ativoId:'um',data:'',valor:10},f:{ativoId:'um',data:'2026-08-01',valor:''},g:{ativoId:'dois',data:'2026-08-01',valor:100}};
 const r=manutencoesDoAtivo(mapa,'um','2026-10-11','2025-10-11');
 assert.deepEqual([r.total,r.ultimos12,r.ultimo.id,r.custo,r.custo12,r.pendentesValor,r.pendentesData,r.foraPeriodo],[6,3,'a',70,70,1,1,2]);
 assert.equal(manutencoesDoAtivo(null,'um'),null);
});
test('vínculo inverso por ID é válido; conflito não se resolve pelo nome',()=>{
 assert.equal(vinculoDoEquipamento({id:'a',nome:'Mesmo nome'},[{id:'b',origemAtivoId:'a',codigo:'PC-1'}]).bem.id,'b');
 assert.equal(idBemParaEdicao({id:'a'},[{id:'b',origemAtivoId:'a'}]),'b');
 assert.equal(vinculoDoEquipamento({id:'a',bemId:'c'},[{id:'b',origemAtivoId:'a'},{id:'c'}]).vinculo,'conflito');
 assert.equal(idBemParaEdicao({id:'a',bemId:'c'},[{id:'b',origemAtivoId:'a'},{id:'c'}]),'c');
});
test('links de manutenção dependem da permissão e apontam para o mesmo ativo',()=>{
 const sem={permissoes:['patrimonio']},com={permissoes:['patrimonio','manutencoes']};
 assert.equal(podeAbrir('manutencoes',sem),false);
 assert.equal(podeAbrir('manutencoes',com),true);
 const url=caminhoManutencao({item:'ativo-1',familia:'informatica',lancar:true});
 assert.equal(new URL(url,'https://local.invalid').searchParams.get('item'),'ativo-1');
 assert.equal(new URL(url,'https://local.invalid').searchParams.get('lancar'),'1');
});
test('resumos de tipo e setor mantêm custos de cada período; limite exige ultrapassar',()=>{
 const a={id:'a',categoria:'Notebook',especificacao:{setorId:'s'}};
 const resumo={custo:80,custo12:20,pendentesValor:1,pendentesData:2,foraPeriodo:3};
 const grupos=resumoComputadores([a],[{id:'s',nome:'Vendas'}],{a:resumo});
 assert.deepEqual(grupos.tipo.Notebook,{quantidade:1,...resumo});
 assert.deepEqual(grupos.setor.Vendas,grupos.tipo.Notebook);
 assert.equal(alertaManutencao(70,100,70).excedido,false);
 assert.equal(alertaManutencao(71,100,70).excedido,true);
 assert.equal(alertaManutencao(80,100,null),null);
});
