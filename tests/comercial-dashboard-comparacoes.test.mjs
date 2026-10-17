import {test} from 'node:test';
import assert from 'node:assert/strict';
import {apurarDashboard} from '../supabase/functions/_shared/comercial-dashboard.mjs';
import {anteriorEquivalente} from '../supabase/functions/_shared/comercial.mjs';

const hoje='2026-10-17',sessao={sub:'gestor',master:true},filtro={modo:'mes',mes:'2026-10'},calendario={configurado:true,diasSemana:[1,2,3,4,5],feriados:['2026-10-12']};
const venda=(id,data,valor,extra={})=>({id,numero:'90'+id,clienteId:'c1',cliente:'Cliente Exemplo',vendedor:'Vendedora Alfa',tipo:'Normal',empresaNome:'Impresilk',data,valor,bruto:valor,desconto:0,itens:[{produto:'Produto Exemplo',valorTotal:valor}],...extra});
const base=(extra={})=>({catalogo:{completo:true,vendedores:[{id:'v1',nome:'Vendedora Alfa'},{id:'v2',nome:'Vendedora Beta'}],produtos:[{id:'p1',nome:'Produto Exemplo'}]},config:{vinculos:{alfa:'v1',beta:'v2'},calendario},ordens:[venda('1','2026-10-05',90),venda('2','2026-09-05',100),venda('3','2026-09-25',20),venda('4','2026-08-10',80)],recentes:[],cargaStatus:{janelas:{ordens:[{desde:'2018-01-01',ate:hoje,concluidaEm:hoje+'T12:00:00Z'}]}},recebiveis:[],orcamentos:[],metas:[],...extra});
const run=(b=base(),f=filtro,s=sessao)=>apurarDashboard(b,f,hoje,s);

test('meses completos com mês atual aberto comparam os dois últimos meses fechados',()=>{
 const r=run(),c=r.comparacoes.mesCompleto;
 assert.deepEqual(c.periodoAtual,{de:'2026-09-01',ate:'2026-09-30'});assert.equal(c.periodo.de,'2026-08-01');assert.equal(c.periodo.ate,'2026-08-31');
 assert.equal(c.valorAtual,12000);assert.equal(c.centavos,8000);assert.equal(c.delta,4000);assert.equal(c.percentual,50);assert.equal(c.comparavel,true);assert.equal(c.series,null);assert.equal(r.resumo.centavos,9000);
 const passado=run(base(),{modo:'mes',mes:'2026-09'}).comparacoes.mesCompleto;assert.equal(passado.valorAtual,12000);assert.equal(passado.centavos,8000);
});

test('dias úteis reutilizam calendário conferido e encerram o intervalo anterior na quantidade equivalente',()=>{
 const legado=anteriorEquivalente({de:'2026-10-01',ate:'2026-10-31'},hoje,'diasUteis',calendario),r=run(),c=r.comparacoes.diasUteis;
 assert.deepEqual(c.periodoAtual,{de:legado.atualDe,ate:legado.atualAte});assert.equal(c.periodo.ate,legado.ate);assert.equal(c.diasUteisAtual,c.diasUteisAnterior);assert.equal(c.diasUteisAtual,11);
 assert.equal(c.valorAtual,9000);assert.equal(c.centavos,10000);assert.equal(c.percentual,-10);assert.equal(c.calendarioConfigurado,true);assert.equal(c.comparavel,true);assert.equal(c.series,null);
});

test('calendário ausente ou sem dias equivalentes mantém comparação indisponível sem valores inventados',()=>{
 for(const cal of [null,{configurado:true,diasSemana:[],feriados:[]}]){const b=base({config:{calendario:cal}}),c=run(b).comparacoes.diasUteis;assert.equal(c.comparavel,false);assert.equal(c.centavos,null);assert.equal(c.valorAtual,null);assert.equal(c.percentual,null);assert.ok(c.mensagem);}
});

test('comparações preservam filtros, carteira e empresa confirmada sem copiar totais legados',()=>{
 const b=base();b.ordens.push(venda('outra','2026-09-05',999,{empresaNome:'Empresa Externa'}),venda('beta','2026-09-05',500,{vendedor:'Vendedora Beta',cliente:'Cliente Sigiloso'}),venda('cliente2','2026-09-05',400,{clienteId:'c2',cliente:'Cliente Beta'}));
 b.campanhas=[{id:'cp',nome:'Campanha Exemplo',os:{1:true,2:true,3:true,4:true,outra:true,beta:true,cliente2:true}}];
 const r=run(b,{...filtro,vendedor:'v1',cliente:'c1',campanha:'cp'});
 assert.equal(r.comparacoes.mesCompleto.valorAtual,12000);assert.equal(r.comparacoes.diasUteis.centavos,10000);
 const s={sub:'alfa',perms:['orcamentos']},a=run(b,filtro,s);assert.equal(a.comparacoes.diasUteis.centavos,50000);assert.doesNotMatch(JSON.stringify(a.comparacoes),/Sigiloso/);
 assert.throws(()=>run(b,{...filtro,vendedor:'v2'},s),e=>e.status===403);
});

test('cobertura parcial e empresa sem origem anulam comparações, base zero não gera percentual',()=>{
 const b=base({cargaStatus:{janelas:{ordens:[{desde:'2026-10-01',ate:hoje,concluidaEm:hoje}]}}}),c=run(b).comparacoes.diasUteis;
 assert.equal(c.valorAtual,9000);assert.equal(c.centavos,null);assert.equal(c.delta,null);assert.equal(c.percentual,null);assert.equal(c.comparavel,false);
 b.cargaStatus=base().cargaStatus;b.ordens.push(venda('sem','2026-09-10',30,{empresaNome:null}));assert.equal(run(b).comparacoes.diasUteis.centavos,null);
 const z=run(base({ordens:[venda('1','2026-10-05',90)]})).comparacoes.diasUteis;assert.equal(z.centavos,0);assert.equal(z.delta,9000);assert.equal(z.percentual,null);assert.equal(z.comparavel,true);
});

test('ano, todos e intervalo incompatível não recebem comparação mensal ou calendário por suposição',()=>{
 for(const f of [{modo:'todos'},{modo:'ano',ano:'2026'},{modo:'personalizado',de:'2026-09-20',ate:'2026-10-10'}])for(const c of ['diasUteis','mesCompleto']){const r=run(base(),f).comparacoes[c];assert.equal(r.estado,'incompativel');assert.equal(r.comparavel,false);assert.equal(r.periodo,null);assert.equal(r.periodoAtual,null);assert.equal(r.valorAtual,null);}
});
