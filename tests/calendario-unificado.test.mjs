import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {celebracoesRH} from '../supabase/functions/_shared/calendario-celebracoes.mjs';
const status=[{id:'ativo',contaComoAtivo:true},{id:'inativo',contaComoAtivo:false}];
const pessoa={id:'a',nome:'Pessoa teste',statusId:'ativo',dataNascimento:'1992-02-29',dataAdmissao:'2020-02-12',salario:999,cpf:'sigilo'};
test('Aniversários e tempo de empresa usam o mesmo mês e não expõem a ficha',()=>{
 const eventos=celebracoesRH([pessoa],status,'2027-02');
 assert.equal(eventos.length,2);assert.equal(eventos[0].data,'2027-02-28');
 assert.equal(eventos[1].descricao,'7 anos de empresa');
 assert.ok(!JSON.stringify(eventos).includes('1992'));assert.ok(!JSON.stringify(eventos).includes('sigilo'));
 assert.deepEqual(Object.keys(eventos[0]).sort(),['id','titulo','tipo','cor','data','descricao','recorrenteAnual','hora'].sort());
 assert.equal(celebracoesRH([pessoa],status,'2028-02')[0].data,'2028-02-29');
});
test('Respeita os status do RH, desligamento, direção, datas inválidas e outro mês',()=>{
 for(const alteracao of [{statusId:'inativo'},{statusId:'desconhecido'},{dataDesligamento:'2026-01-01'},{ehDirecao:true}])assert.equal(celebracoesRH([{...pessoa,...alteracao}],status,'2027-02').length,0);
 assert.equal(celebracoesRH([pessoa],status,'2027-03').length,0);
 assert.equal(celebracoesRH([{...pessoa,dataNascimento:'1991-02-29',dataAdmissao:'2030-02-12'}],status,'2027-02').length,0);
 assert.equal(celebracoesRH([pessoa],status,'2027-13').length,0);
});
test('Navegação reúne as duas rotas sem retirar suas permissões',()=>{
 const shell=readFileSync(new URL('../src/components/CentralShell.jsx',import.meta.url),'utf8');
 const abas=readFileSync(new URL('../src/components/CalendarioAbas.jsx',import.meta.url),'utf8');
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 assert.ok(shell.indexOf('>Calendário</Link>')<shell.indexOf('>Sistemas e configurações</Link>'));
 assert.ok(abas.includes('podeAbrir(id,sessao)'));assert.ok(abas.includes('${search}'));
 for(const modulo of ['agenda','calendario-empresa'])assert.ok(app.includes(`<Restrito modulo="${modulo}"`));
});
