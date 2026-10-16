import {test} from 'node:test';
import assert from 'node:assert/strict';
const {carregarEntregasPosVenda,resumirPosVenda}=await import('../src/lib/calc/posVendaComercial.js').catch(()=>({}));
const pedido=(id,estado,acao)=>({id,numero:id,cliente:'Cliente exemplo '+id,vendedorNome:'Ana Exemplo',entregaRealEm:'2026-10-01T12:00:00Z',posVendaEstado:estado,acaoPosVenda:acao||null});

test('fila confere páginas vazias e alcança entregas antigas, sem usar mês das vendas',async()=>{
 assert.equal(typeof carregarEntregasPosVenda,'function');
 const chamadas=[],progresso=[];
 const consulta=async(action,b)=>{chamadas.push({action,b});return {incluiConcluidos:true,pedidos:b.pagina===1?[]:[pedido('antiga','sem_acao')],paginacao:{pagina:b.pagina,paginas:2,total:101,temMais:b.pagina===1},cobertura:{verificadosNaPagina:b.pagina===1?100:1,completa:true},coberturaHistorica:{completo:true},consultadoEm:'2026-10-15T12:00:00Z'};};
 const r=await carregarEntregasPosVenda(consulta,{filtro:{de:'2026-10-01',ate:'2026-10-31',vendedor:'101'},aoAtualizar:d=>progresso.push(d)});
 assert.deepEqual(r.pedidos.map(p=>p.id),['antiga']);assert.equal(r.finalizada,true);assert.equal(r.verificados,101);assert.equal(r.totalCandidatos,101);
 assert.equal(progresso[0].finalizada,false);assert.equal(chamadas.length,2);assert.deepEqual(chamadas[0].b.filtro,{vendedor:'101',equipe:''});assert.equal(chamadas[0].b.incluirConcluidos,true);
});

test('falha posterior conserva progresso consultado e não transforma integração indisponível em vazio',async()=>{
 assert.equal(typeof carregarEntregasPosVenda,'function');let parcial;
 await assert.rejects(carregarEntregasPosVenda(async(action,b)=>{if(b.pagina===2)throw new Error('Fonte indisponível');return {incluiConcluidos:true,pedidos:[pedido('1','sem_acao')],paginacao:{pagina:1,paginas:2,total:120,temMais:true},cobertura:{verificadosNaPagina:100,completa:true}};},{aoAtualizar:d=>parcial=d}),/Fonte indisponível/);
 assert.deepEqual(parcial.pedidos.map(p=>p.id),['1']);assert.equal(parcial.finalizada,false);
});

test('cancelamento interrompe consulta ao trocar carteira, sem carregar página do acesso anterior',async()=>{
 assert.equal(typeof carregarEntregasPosVenda,'function');const ctl=new AbortController();let chamadas=0;
 await assert.rejects(carregarEntregasPosVenda(async()=>{chamadas++;ctl.abort();return {incluiConcluidos:true,pedidos:[],paginacao:{pagina:1,paginas:2,total:120,temMais:true},cobertura:{verificadosNaPagina:100,completa:true}};},{signal:ctl.signal}),e=>e.name==='AbortError');assert.equal(chamadas,1);
});

test('resposta incompleta não certifica cobertura; IDs repetidos não duplicam entregas',async()=>{
 assert.equal(typeof carregarEntregasPosVenda,'function');
 await assert.rejects(carregarEntregasPosVenda(async()=>({incluiConcluidos:true,pedidos:[],paginacao:{pagina:1,temMais:true}})),/consulta|resposta|página/i);
 const r=await carregarEntregasPosVenda(async(a,b)=>({incluiConcluidos:true,pedidos:[pedido('mesma','sem_acao')],paginacao:{pagina:b.pagina,paginas:2,total:101,temMais:b.pagina===1},cobertura:{verificadosNaPagina:b.pagina===1?100:1,completa:b.pagina===1}}));
 assert.equal(r.pedidos.length,1);assert.equal(r.coberturaCompleta,false);assert.equal(r.finalizada,true);
});

test('resumos e filtros usam as mesmas O.S.; concluídas, atrasadas e pendências antigas não se misturam',()=>{
 assert.equal(typeof resumirPosVenda,'function');
 const xs=[pedido('1','sem_acao'),pedido('2','em_acompanhamento',{data:'2026-10-10',descricao:'Ligar e conferir acabamento'}),pedido('3','em_acompanhamento',{data:'2026-10-15',descricao:'Conferir instalação'}),pedido('4','concluido'),pedido('5','a_conferir')];
 const r=resumirPosVenda(xs,{situacao:'pendentes'},'2026-10-15');assert.deepEqual(r.itens.map(p=>p.id),['2','1','5','3']);assert.deepEqual(r.contagens,{todos:5,pendentes:4,sem_acao:1,programados:1,atrasados:1,concluidos:1,a_conferir:1});
 assert.deepEqual(resumirPosVenda(xs,{situacao:'concluidos'},'2026-10-15').itens.map(p=>p.id),['4']);
 assert.deepEqual(resumirPosVenda(xs,{situacao:'todos',busca:'acabamento'},'2026-10-15').itens.map(p=>p.id),['2']);
 assert.equal(resumirPosVenda(xs,{situacao:'todos',busca:'ninguém'},'2026-10-15').contagens.todos,0);
});


test('tela não apresenta concluídos como zero quando servidor ainda não suporta consulta completa',async()=>{
 await assert.rejects(carregarEntregasPosVenda(async()=>({pedidos:[],paginacao:{pagina:1,paginas:1,total:0,temMais:false},cobertura:{verificadosNaPagina:0,completa:true}})),/atualiza|versão|concluídos/i);
});

test('conclusão mostra a data do atendimento confirmado e não o prazo futuro da ação planejada',async()=>{
 const {dataReferenciaPosVenda}=await import('../src/lib/calc/posVendaComercial.js');assert.equal(typeof dataReferenciaPosVenda,'function');
 assert.equal(dataReferenciaPosVenda({posVendaEstado:'concluido',ultimaInteracao:{em:'2026-10-15T15:00:00Z'},acaoPosVenda:{data:'2026-10-20'}}),'2026-10-15T15:00:00Z');
 assert.equal(dataReferenciaPosVenda({posVendaEstado:'em_acompanhamento',acaoPosVenda:{data:'2026-10-20'}}),'2026-10-20');
 assert.equal(dataReferenciaPosVenda({posVendaEstado:'concluido',acaoPosVenda:{data:'2026-10-20'}}),null);
});

test('chips usam somente vendedores das O.S. recebidas e não misturam homônimos',async()=>{
 const {vendedoresPosVenda,chaveVendedorPosVenda}=await import('../src/lib/calc/posVendaComercial.js');
 const xs=[{vendedorId:'a',vendedorNome:'Nome antigo'},{vendedorId:'a'},{vendedorId:'b',vendedorNome:'Consultor exemplo'},{}];
 const grupos=vendedoresPosVenda(xs,[{id:'a',nome:'Consultor exemplo'},{id:'nao-autorizado',nome:'Não mostrar'}]);
 assert.equal(grupos.length,3);assert.equal(grupos.find(v=>v.id==='id:a').total,2);
 assert.equal(grupos.find(v=>v.id==='id:a').nome,'Consultor exemplo');
 assert.equal(grupos.find(v=>v.id==='id:b').total,1);assert.equal(grupos.some(v=>v.id==='id:nao-autorizado'),false);
 assert.equal(chaveVendedorPosVenda({}),'sem_vendedor');
});

test('idade da entrega usa dias de calendário de São Paulo e rejeita datas futuras ou inválidas',async()=>{
 const {diasDesdeEntrega}=await import('../src/lib/calc/posVendaComercial.js');
 assert.equal(diasDesdeEntrega('2026-10-12','2026-10-15'),3);
 assert.equal(diasDesdeEntrega('2026-10-15','2026-10-15'),0);
 assert.equal(diasDesdeEntrega('2026-10-15T01:00:00Z','2026-10-15'),1);
 for(const d of [null,'erro','2026-02-31','2026-10-16'])assert.equal(diasDesdeEntrega(d,'2026-10-15'),null);
});
test('recorte é enviado em cada página e servidor antigo não pode ignorá-lo',async()=>{
 const desde='2026-10-12';let chamadas=0;
 const resposta=b=>({incluiConcluidos:true,pedidos:[],vendasDesde:desde,paginacao:{pagina:b.pagina,paginas:2,total:101,temMais:b.pagina===1},cobertura:{completa:true}});
 await carregarEntregasPosVenda(async(a,b)=>{chamadas++;assert.equal(b.vendasDesde,desde);return resposta(b);},{vendasDesde:desde});assert.equal(chamadas,2);
 await assert.rejects(carregarEntregasPosVenda(async(a,b)=>({...resposta(b),vendasDesde:null}),{vendasDesde:desde}),/recorte/);
});
