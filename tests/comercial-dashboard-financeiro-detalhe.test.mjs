import {test} from 'node:test';
import assert from 'node:assert/strict';
import {apurarDashboard,detalharDashboard} from '../supabase/functions/_shared/comercial-dashboard.mjs';

const hoje='2026-10-17',sessao={sub:'gestor',master:true},filtro={modo:'mes',mes:'2026-10'};
const venda=(id,extra={})=>({id,numero:'90'+id,clienteId:'c1',cliente:'Cliente Exemplo',vendedor:'Vendedora Alfa',tipo:'Normal',empresaNome:'Impresilk',data:'2026-10-05',valor:100,bruto:100,desconto:0,itens:[{produto:'Produto Exemplo',valorTotal:100}],...extra});
const base=(extra={})=>({catalogo:{completo:true,vendedores:[{id:'v1',nome:'Vendedora Alfa'},{id:'v2',nome:'Vendedora Beta'}],produtos:[{id:'p1',nome:'Produto Exemplo'}]},config:{vinculos:{alfa:'v1',beta:'v2'}},ordens:[venda('1')],recentes:[],cargaStatus:{janelas:{ordens:[{desde:'2018-01-01',ate:hoje,concluidaEm:hoje+'T12:00:00Z'}]}},recebiveis:[],orcamentos:[],metas:[],...extra});
const detalhe=(b,consulta={},f=filtro,s=sessao)=>detalharDashboard(b,f,hoje,s,{dimensao:'atraso',id:'todos',...consulta});
const apurar=(b,f=filtro,s=sessao)=>apurarDashboard(b,f,hoje,s);

test('detalhe de atraso reconcilia cada faixa, preserva saldo normalizado e exclui a vencer',()=>{
 const recebiveis=[['t1','2026-10-16',10],['t2','2026-10-09',20],['t3','2026-09-16',30],['t4','2026-08-17',40],['t5','2026-07-17',50],['t6',hoje,60],['t7','2026-11-01',70]].map(([id,vencimento,valor])=>({id,os:'901',vencimento,valor,pago:8}));
 const b=base({recebiveis}),resumo=apurar(b).financeiro,d=detalhe(b);
 assert.equal(d.tipo,'atrasos');assert.equal(d.periodo.ateEfetivo,hoje);assert.equal(d.referencia,hoje);assert.equal(d.cobertura.completo,true);
 assert.equal(d.resumo.centavos,resumo.vencidoCentavos);assert.equal(d.resumo.titulos,resumo.titulosVencidos);assert.equal(d.titulos.length,5);
 assert.equal(d.titulos.reduce((s,t)=>s+t.centavos,0),15000);
 for(const faixa of resumo.faixas){const f=detalhe(b,{id:faixa.id});assert.equal(f.resumo.centavos,faixa.centavos);assert.equal(f.resumo.titulos,faixa.titulos);assert.ok(f.titulos.every(t=>t.faixa===faixa.id));}
 assert.equal(d.titulos.find(t=>t.id==='t1').centavos,1000);
});

test('detalhe financeiro preserva vendedor, cliente, campanha e datas da seleção de vendas',()=>{
 const b=base({ordens:[venda('1'),venda('2',{data:'2026-09-15'}),venda('3',{clienteId:'c3',cliente:'Outro cliente'}),venda('4',{vendedor:'Vendedora Beta'}),venda('5')],campanhas:[{id:'cp',nome:'Campanha Exemplo',os:{1:true,2:true,3:true,4:true}}],recebiveis:['1','2','3','4','5'].map(id=>({id:'t'+id,os:'90'+id,valor:50,vencimento:'2026-10-01'}))});
 const f={...filtro,cliente:'c1',vendedor:'v1',campanha:'cp'},d=detalhe(b,{},f);
 assert.deepEqual(d.titulos.map(t=>t.id),['t1']);assert.equal(d.resumo.centavos,apurar(b,f).financeiro.vencidoCentavos);
 assert.equal(d.titulos[0].ordens[0].data,'2026-10-05');assert.equal(d.titulos[0].ordens[0].vendedorId,'v1');
});

test('títulos ambíguos, mistos e com empresa divergente não expõem registros nem nomes da fonte financeira',()=>{
 const b=base({ordens:[venda('1'),venda('2',{numero:'902'}),venda('3',{numero:'902',empresaNome:'Empresa Externa',cliente:'Cliente Externo'}),venda('4',{vendedor:'Vendedora Beta',cliente:'Cliente Sigiloso'})],recebiveis:[{id:'bom',os:'901',valor:10,vencimento:'2026-10-01',cliente:'Nome não autorizado do título'},{id:'ambiguo',os:'902',valor:500,vencimento:'2026-10-01'},{id:'misto',os:'901 / 904',valor:500,vencimento:'2026-10-01'},{id:'sem',os:'sem OS',valor:500,vencimento:'2026-10-01',cliente:'Sigiloso sem OS'}]});
 const f={...filtro,vendedor:'v1'},d=detalhe(b,{},f),r=apurar(b,f).financeiro;
 assert.deepEqual(d.titulos.map(t=>t.id),['bom']);assert.equal(d.resumo.centavos,r.vencidoCentavos);assert.equal(d.cobertura.completo,false);assert.equal(d.cobertura.titulosAConferir,2);
 assert.equal(d.titulos[0].cliente,'Cliente Exemplo');assert.equal(d.titulos[0].os,'901');
 assert.doesNotMatch(JSON.stringify(d),/Sigiloso|Externo|Nome não autorizado/);
});

test('título ligado a duas O.S. autorizadas aparece uma vez, com as duas origens confirmadas',()=>{
 const b=base({ordens:[venda('1'),venda('2',{clienteId:'c2',cliente:'Cliente Beta'})],recebiveis:[{id:'unico',os:'901 / 902',valor:75,vencimento:'2026-10-01'}]}),d=detalhe(b);
 assert.equal(d.titulos.length,1);assert.equal(d.resumo.centavos,7500);assert.deepEqual(d.titulos[0].ordens.map(o=>o.numero),['901','902']);assert.deepEqual(d.titulos[0].clientes.map(c=>c.id),['c1','c2']);
});

test('detalhe exige permissão financeira e mantém carteira individual fechada',()=>{
 const b=base({ordens:[venda('1'),venda('2',{vendedor:'Vendedora Beta',cliente:'Cliente Sigiloso'})],recebiveis:[{id:'t1',os:'901',valor:50,vencimento:'2026-10-01'},{id:'t2',os:'902',valor:500,vencimento:'2026-10-01'}]});
 assert.throws(()=>detalhe(b,{},filtro,{sub:'alfa',perms:['orcamentos']}),e=>e.status===403);
 const s={sub:'alfa',perms:['orcamentos','contas-atrasadas']},d=detalhe(b,{},filtro,s);
 assert.equal(d.resumo.centavos,5000);assert.equal(d.titulos.length,1);assert.doesNotMatch(JSON.stringify(d),/Sigiloso|Beta/);
 assert.throws(()=>detalhe(b,{},{...filtro,vendedor:'v2'},s),e=>e.status===403);
});

test('fonte ausente, filtro de produto e lacunas não são apresentados como dívida zero confirmada',()=>{
 for(const b of [base({recebiveis:null}),base({recebiveis:[{id:'t1',os:'sem OS',valor:100,vencimento:'2026-10-01'}]})]){const d=detalhe(b);assert.equal(d.resumo.centavos,null);assert.equal(d.resumo.titulos,null);assert.equal(d.cobertura.completo,false);assert.deepEqual(d.titulos,[]);}
 const d=detalhe(base(),{},{...filtro,produto:'p1'});assert.equal(d.cobertura.estado,'filtro_incompativel');assert.equal(d.resumo.centavos,null);assert.deepEqual(d.titulos,[]);
 const vazio=detalhe(base());assert.equal(vazio.resumo.centavos,0);assert.equal(vazio.cobertura.completo,true);
});

test('detalhe paginado limita retorno, mantém total selecionado e valida faixa/página',()=>{
 const b=base({recebiveis:Array.from({length:61},(_,i)=>({id:'t'+String(i).padStart(3,'0'),os:'901',valor:1,vencimento:'2026-10-01'}))}),d=detalhe(b,{pagina:2});
 assert.equal(d.titulos.length,25);assert.equal(d.paginacao.total,61);assert.equal(d.paginacao.temMais,true);assert.equal(d.resumo.centavos,6100);
 const ids=[1,2,3].flatMap(pagina=>detalhe(b,{pagina}).titulos.map(t=>t.id));assert.equal(new Set(ids).size,61);
 for(const consulta of [{id:'faixa_inventada'},{tamanho:51},{pagina:0},{pagina:4}])assert.throws(()=>detalhe(b,consulta),e=>e.status===400);
});

test('ID financeiro repetido exclui todas as ocorrências, com valores iguais ou conflitantes em qualquer ordem',()=>{
 for(const valor of [10,999])for(const inverter of [false,true]){
  const recebiveis=[{id:'duplicado',os:'901',valor:10,vencimento:'2026-10-01'},{id:'duplicado',os:'901',valor,vencimento:'2026-10-01'},{id:'confirmado',os:'901',valor:5,vencimento:'2026-10-01'}];
  const b=base({recebiveis:inverter?recebiveis.reverse():recebiveis}),r=apurar(b).financeiro,d=detalhe(b);
  assert.equal(r.vencidoCentavos,500);assert.equal(r.abertoCentavos,500);assert.equal(r.titulosAConferir,1);assert.equal(r.titulosVencidos,1);assert.equal(r.completo,false);assert.equal(r.indiceAtraso,null);
  assert.deepEqual(d.titulos.map(t=>t.id),['confirmado']);assert.equal(d.resumo.centavos,r.vencidoCentavos);assert.equal(d.cobertura.titulosAConferir,1);
  for(const faixa of r.faixas){const f=detalhe(b,{id:faixa.id});assert.equal(f.resumo.centavos,faixa.centavos);assert.equal(f.resumo.titulos,faixa.titulos);}
 }
});

test('ID repetido ligado a outra carteira não confirma a ocorrência local nem expõe o outro título',()=>{
 const b=base({ordens:[venda('1'),venda('2',{vendedor:'Vendedora Beta',cliente:'Cliente Sigiloso'})],recebiveis:[{id:'duplicado',os:'901',valor:10,vencimento:'2026-10-01'},{id:'duplicado',os:'902',valor:20,vencimento:'2026-10-01',cliente:'Cliente Sigiloso'}]});
 const s={sub:'alfa',perms:['orcamentos','contas-atrasadas']},d=detalhe(b,{},filtro,s),r=apurar(b,filtro,s).financeiro;
 assert.deepEqual(d.titulos,[]);assert.equal(d.resumo.centavos,null);assert.equal(r.vencidoCentavos,null);assert.equal(d.cobertura.titulosAConferir,1);assert.doesNotMatch(JSON.stringify(d),/Sigiloso/);
});
