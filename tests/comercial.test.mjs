import {test} from 'node:test';import assert from 'node:assert/strict';
import {resolverEscopo,pertence,validarPeriodo,progressoMeta,apurarComercial,validarAcao,anteriorEquivalente} from '../supabase/functions/_shared/comercial.mjs';
const vendedores=[{id:'1',nome:'Ana Silva'},{id:'2',nome:'Bia Costa'}],sessao={sub:'ana',vend:'Ana Silva',perms:['orcamentos']},periodo={de:'2026-10-01',ate:'2026-10-31'},hoje='2026-10-07';
const os=(id,extra={})=>({id,numero:id,data:hoje,tipo:'Normal',valor:90,vendedor:'Ana Silva',clienteId:'c',itens:[{produtoId:'p1',produto:'Placa',categoria:'Sinalização',valorTotal:60,quantidade:2,unidade:'un'},{produtoId:'p2',produto:'Adesivo',categoria:'Sinalização',valorTotal:40,quantidade:3,unidade:'m²'}],...extra});
const base=(extra={})=>({ordens:[os('a')],orcamentos:[],clientes:[{id:'c',nome:'Cliente',responsavel:'Ana Silva'}],acoes:[],cobertura:{desde:'2020-01-01',ate:hoje},coberturaOrcamentos:{desde:'2026-01-01',ate:hoje},...extra});
test('escopo requer módulo, identidade exata ou vínculo explícito; não aceita outro filtro',()=>{assert.throws(()=>resolverEscopo({sub:'a',perms:[]},{vendedores}),/acesso/);assert.throws(()=>resolverEscopo({...sessao,vend:'Ana'},{vendedores}),/vínculo/);const e=resolverEscopo(sessao,{vendedores});assert.deepEqual(e.ids,['1']);assert.throws(()=>resolverEscopo(sessao,{vendedores},{},{vendedor:'2'}),/carteira/);assert.throws(()=>resolverEscopo(sessao,{vendedores},{},{equipe:'x'}),/gestão/);assert.equal(resolverEscopo({...sessao,vend:null},{vendedores},{vinculos:{ana:'2'}}).vendedorId,'2');});
test('nome duplicado não autoriza registros; ID explícito tem precedência sobre nome',()=>{const cat={vendedores:[...vendedores,{id:'3',nome:'Ana Silva'}]};assert.throws(()=>resolverEscopo(sessao,cat),/vínculo/);const e=resolverEscopo(sessao,cat,{vinculos:{ana:'1'}});assert.equal(pertence({vendedor:'Ana Silva'},e),false);assert.equal(pertence({vendedorErpId:'1',vendedor:'outro'},e),true);assert.equal(pertence({vendedorErpId:'2',vendedor:'Ana Silva'},e),false);});
test('gestão filtra interseção de equipe e vendedora, inclusive vazia',()=>{const e=resolverEscopo({master:true},{vendedores},{equipes:[{id:'x',vendedores:['1']}]},{vendedor:'2',equipe:'x'});assert.deepEqual(e.ids,[]);assert.equal(pertence(os('a'),e),false);assert.equal(pertence(os('a'),resolverEscopo({master:true},{vendedores})),true);});
test('datas impossíveis, invertidas e janela excessiva são recusadas',()=>{for(const p of [{de:'2026-02-30',ate:hoje},{de:'2026-10-08',ate:hoje},{de:'2020-01-01',ate:hoje}])assert.throws(()=>validarPeriodo(p,hoje));});
test('venda líquida exclui cancelamento, retrabalho, amostra e falta de tipo, sem duplicar IDs',()=>{const r=apurarComercial(base({ordens:[os('a'),os('a'),os('b',{cancelada:true}),os('c',{tipo:'Retrabalho'}),os('d',{tipo:'Amostra'}),os('e',{tipo:''}),os('f',{valor:null})]}),periodo,hoje);assert.equal(r.valor,9000);assert.equal(r.pedidos,1);assert.equal(r.incompletas,2);assert.equal(r.completo,false);});
test('zero e valor ausente não são confundidos',()=>{let r=apurarComercial(base({ordens:[os('a',{valor:0})]}),periodo,hoje);assert.equal(r.valor,0);assert.equal(r.pedidos,1);assert.equal(r.completo,true);r=apurarComercial(base({ordens:[os('a',{valor:''})]}),periodo,hoje);assert.equal(r.incompletas,1);});
test('itens líquidos reconciliam centavos com vendas e quantidades mantêm unidades separadas',()=>{const r=apurarComercial(base({ordens:[os('a',{valor:89.99}),os('b',{valor:33.33})]}),periodo,hoje);assert.equal(r.produtos.reduce((s,p)=>s+p.centavos,0),r.valor);assert.deepEqual(r.categorias[0].quantidades,{un:4,'m²':6});assert.equal(r.categorias[0].centavos,r.valor);});
test('O.S. sem itens aparece explicitamente na análise e fecha o total',()=>{const r=apurarComercial(base({ordens:[os('a',{itens:[]})]}),periodo,hoje);assert.equal(r.produtos[0].nome,'Itens não disponíveis');assert.equal(r.produtos[0].centavos,9000);});
test('gráfico mensal, acumulado, cards e detalhes respeitam o mesmo intervalo personalizado',()=>{const r=apurarComercial(base({ordens:[os('a',{data:'2026-10-01'}),os('b',{data:'2026-10-05'}),os('c',{data:'2026-10-10'})]}),{de:'2026-10-03',ate:'2026-10-06'},hoje);assert.equal(r.valor,9000);assert.equal(r.meses[0].centavos,r.valor);assert.equal(r.acumulado.at(-1).centavos,r.valor);assert.equal(r.vendas.length,r.pedidos);});
test('revisões só são agrupadas por vínculo, propostas iguais sem vínculo permanecem distintas',()=>{const props=[{id:'p1',negociacaoId:'n',revisao:1,valor:100,situacao:'aberto',dataCadastro:hoje},{id:'p2',negociacaoId:'n',revisao:2,valor:120,situacao:'aberto',dataCadastro:hoje},{id:'p3',valor:120,situacao:'aberto',dataCadastro:hoje}];const r=apurarComercial(base({orcamentos:props}),periodo,hoje);assert.equal(r.propostas.length,2);assert.equal(r.valorAberto,24000);});
test('ações de hoje e atraso, concluir, reagendar e histórico de cliente',()=>{const acao={id:'a',clienteId:'c',status:'pendente',data:hoje,descricao:'Retornar'};let r=apurarComercial(base({acoes:[acao,{...acao,id:'b',data:'2026-10-02'}]}),periodo,hoje);assert.equal(r.hojeA.length,1);assert.equal(r.atrasadas.length,1);assert.equal(r.clientes[0].proximoContato,'2026-10-02');r=apurarComercial(base({acoes:[{...acao,status:'concluida'},{...acao,id:'b',data:'2026-10-10'}]}),periodo,hoje);assert.equal(r.hojeA.length,0);assert.equal(r.atrasadas.length,0);assert.equal(r.clientes[0].proximoContato,'2026-10-10');});
test('mês parcial compara mesmo dia, mês completo e ano anterior ficam explícitos',()=>{assert.equal(anteriorEquivalente(periodo,hoje).ate,'2026-09-07');assert.equal(anteriorEquivalente(periodo,hoje,'mesCompleto').ate,'2026-08-31');assert.equal(anteriorEquivalente(periodo,hoje,'anoAnterior').ate,'2025-10-07');assert.equal(anteriorEquivalente({de:'2026-03-01',ate:'2026-03-31'},'2026-03-31').ate,'2026-02-28');});
test('comparação sem base ou zero não inventa percentual',()=>{let r=apurarComercial(base(),periodo,hoje);assert.equal(r.comparativo.percentual,null);assert.equal(r.comparativo.delta,9000);r=apurarComercial(base({cobertura:{desde:'2026-10-01',ate:hoje}}),periodo,hoje);assert.equal(r.comparativo.valorAnterior,null);assert.equal(r.comparativo.delta,null);});
test('meta ausente, zero, critério incompatível, atingida e encerrada são distintos',()=>{const calc=(m,h=hoje)=>progressoMeta(m,9000,periodo,h);assert.equal(calc(null).estado,'indisponivel');assert.equal(calc({valor:0,criterio:'cadastro_liquido_os_normal'}).estado,'zero');assert.equal(calc({valor:100,criterio:'aprovacao'}).estado,'incompativel');assert.equal(calc({valor:80,criterio:'cadastro_liquido_os_normal'}).estado,'atingida');assert.equal(calc({valor:100,criterio:'cadastro_liquido_os_normal'},'2026-11-01').porDia,null);});
test('ritmo diário usa calendário configurado, feriados e exceções sem dividir por zero',()=>{const m={valor:100,criterio:'cadastro_liquido_os_normal'},p={de:'2026-10-07',ate:'2026-10-09'};assert.equal(progressoMeta(m,9000,p,hoje,null).porDia,null);let r=progressoMeta(m,9000,p,hoje,{configurado:true,diasSemana:[1,2,3,4,5],feriados:['2026-10-08']});assert.equal(r.diasUteis,2);assert.equal(r.porDia,500);r=progressoMeta(m,9000,p,hoje,{configurado:true,diasSemana:[],feriados:[]});assert.equal(r.porDia,null);});
test('ação rejeita vendedor, cliente ou orçamento alheio e carimba autor no servidor',()=>{const esc=resolverEscopo(sessao,{vendedores}),b={vendedores,clientes:[{id:'c',nome:'Cliente'}],orcamentos:[{id:'p',clienteId:'c',valor:12}]},a={id:'a',vendedorId:'1',clienteId:'c',orcamentoId:'p',descricao:'Retornar',data:hoje};assert.throws(()=>validarAcao({...a,vendedorId:'2'},esc,b,'Ana','now'),/acesso/);assert.throws(()=>validarAcao({...a,clienteId:'outro'},esc,b,'Ana','now'),/acesso/);assert.throws(()=>validarAcao({...a,orcamentoId:'outro'},esc,b,'Ana','now'),/acesso/);const ok=validarAcao({...a,atualizadoPor:'forjado'},esc,b,'Ana','now');assert.equal(ok.atualizadoPor,'Ana');assert.equal(ok.valor,12);});
test('comparar meses completos durante mês aberto usa os dois últimos meses fechados',()=>{const r=apurarComercial(base({ordens:[os('a',{data:'2026-10-07',valor:90}),os('b',{data:'2026-09-15',valor:120}),os('c',{data:'2026-08-15',valor:100})]}),{...periodo,comparacao:'mesCompleto'},hoje);assert.equal(r.comparativo.atualDe,'2026-09-01');assert.equal(r.comparativo.atualAte,'2026-09-30');assert.equal(r.comparativo.de,'2026-08-01');assert.equal(r.comparativo.delta,2000);assert.equal(r.valor,9000);});
test('orçamentos fora da cobertura não apresentam total zero como histórico completo',()=>{const r=apurarComercial(base({orcamentos:[]}),{de:'2025-10-01',ate:'2025-10-31'},hoje);assert.equal(r.orcamentosCompletos,false);assert.equal(r.valorAberto,null);});

test('catálogo preserva a origem e recusa cargas vazias, parciais ou sem identificador',async()=>{
 const {carregarCatalogoComercial}=await import('../scripts/lib/comercial-catalogo.mjs');
 const vendedores=[{id:15,nome:'Vendedora Oficial',status:'ATIVO'}],produtos=[{id:32,nome:'Placa',categoria:'Sinalização'}];
 const chamadas=[];const resultado=await carregarCatalogoComercial(async rota=>{chamadas.push(rota);return rota==='usuario/vendedor'?vendedores:produtos;});
 assert.deepEqual(chamadas,['usuario/vendedor','produto']);assert.equal(resultado.vendedores[0].id,'15');assert.equal(resultado.produtos[0].unidade,null);assert.equal(resultado.metas.disponivel,false);
 for(const dados of [[],[{nome:'Sem ID'}],[produtos[0],produtos[0]]])await assert.rejects(()=>carregarCatalogoComercial(async rota=>rota==='usuario/vendedor'?vendedores:dados));
 await assert.rejects(()=>carregarCatalogoComercial(async rota=>{if(rota==='produto')throw new Error('Página indisponível');return vendedores;}));
});
test('pedidos com cadastro futuro não entram na carteira nem divergem do total vendido',()=>{
 const r=apurarComercial(base({ordens:[os('real'),os('futura',{data:'2026-10-20'})]}),periodo,hoje);
 assert.equal(r.clientes[0].centavos,r.valor);assert.equal(r.clientes[0].ultimaCompra,hoje);assert.equal(r.clientes[0].vendas.length,1);
});
test('contato recente impede alerta indevido de proposta sem resposta',()=>{
 const o={id:'p',clienteId:'c',valor:10,situacao:'aberto',dataCadastro:'2026-10-01',acompanhamento:{ultimoContato:'2026-10-06T12:00:00Z'}};
 const r=apurarComercial(base({config:{diasSemResposta:3},orcamentos:[o]}),periodo,hoje);
 assert.equal(r.prioridades.length,0);
});

test('metas manuais têm vínculo oficial, centavos e autoria; não aceitam valor ausente',async()=>{
 const {validarMeta}=await import('../supabase/functions/_shared/comercial.mjs');
 const m=validarMeta({vendedorId:'1',mes:'2026-10',valor:'120000.01',atualizadoPor:'forjado'},{vendedores},'Direção','agora');
 assert.equal(m.id,'1_2026-10');assert.equal(m.valor,120000.01);assert.equal(m.origem,'painel');assert.equal(m.atualizadoPor,'Direção');
 for(const b of [{...m,valor:''},{...m,valor:-1},{...m,mes:'2026-13'},{...m,vendedorId:'999'}])assert.throws(()=>validarMeta(b,{vendedores},'Direção','agora'));
});
test('meta por vendedora e mês não distribui meta geral nem trata ausente como zero',async()=>{
 const {metaDoPeriodo}=await import('../supabase/functions/_shared/comercial.mjs');
 const ms=[{vendedorId:'1',mes:'2026-10',valor:100},{vendedorId:'2',mes:'2026-09',valor:200}];
 let m=metaDoPeriodo(ms,{ids:['1']},{vendedores},periodo);assert.equal(m.valor,100);
 m=metaDoPeriodo(ms,{ids:null},{vendedores},periodo);assert.equal(m.indisponivel,true);assert.match(m.mensagem,/1 vendedora/);
 ms.push({vendedorId:'2',mes:'2026-10',valor:0});assert.equal(metaDoPeriodo(ms,{ids:null},{vendedores},periodo).valor,100);
 assert.equal(metaDoPeriodo(ms,{ids:['1']},{vendedores},{de:'2026-10-02',ate:'2026-10-31'}).indisponivel,true);
});
test('carga não transforma ausência de valor da origem em venda zero confirmada',async()=>{
 const {normOS,normOrcamento}=await import('../scripts/lib/mubi-cache.mjs');
 const sem=normOS({id:1,tipo:'Normal',data_cadastro:hoje},0,new Map()),zero=normOS({id:2,tipo:'Normal',data_cadastro:hoje,valor_total:0},1,new Map());
 assert.equal(sem.valorConfirmado,false);assert.equal(zero.valorConfirmado,true);
 const r=apurarComercial(base({ordens:[{...sem,data:hoje},{...zero,data:hoje}]}),periodo,hoje);assert.equal(r.pedidos,1);assert.equal(r.incompletas,1);
 assert.equal(normOrcamento({id:1,status:'ABERTO',data_cadastro:hoje},0).valorConfirmado,false);
});


test('virada do mês preserva pendências antigas sem misturar vendas e propostas do período',()=>{
 const antiga={id:'p-antiga',clienteId:'c',cliente:'Cliente',valor:850,situacao:'aberto',dataCadastro:'2026-09-10',validade:5};
 const r=apurarComercial(base({orcamentos:[antiga,{...antiga,id:'p-futura',dataCadastro:'2026-12-01'},{...antiga,id:'p-incerta',situacao:'conferir'}],acoes:[{id:'retorno',clienteId:'c',status:'pendente',data:'2026-09-30'},{id:'feito',clienteId:'c',status:'concluida',data:'2026-09-29'}]}),periodo,hoje);
 assert.equal(r.propostas.length,0);assert.equal(r.valorAberto,0);
 assert.equal(r.abertasOperacionais.length,1);assert.equal(r.valorAbertoOperacional,85000);
 assert.deepEqual(r.atrasadas.map(a=>a.id),['retorno']);
 assert.ok(r.prioridades.some(a=>a.orcamentoId==='p-antiga'));
 assert.ok(!r.prioridades.some(a=>a.orcamentoId==='p-incerta'||a.orcamentoId==='p-futura'));
 assert.equal(r.valor,9000);
});
test('resumo da carteira preserva compra antiga mesmo sem pedidos no período carregado',()=>{
 const r=apurarComercial(base({ordens:[],clientes:[{id:'c',nome:'Cliente antigo',naCarteira:false,temCompraHistorica:true,primeiraCompraHistorica:'2022-04-10',ultimaCompraHistorica:'2024-08-22',valorHistorico:420000,pedidosHistoricos:3}]}),periodo,hoje);
 const c=r.clientes[0];assert.equal(c.ultimaCompra,'2024-08-22');assert.equal(c.primeiraCompra,'2022-04-10');assert.equal(c.valorHistorico,420000);assert.equal(c.centavos,0);assert.equal(c.perfil,'Sem compra recente');
});

test('cobertura por janelas não atravessa anos ainda não lidos',()=>{
 const c={desde:'2020-01-01',ate:hoje,janelas:[{desde:'2020-01-01',ate:'2020-12-31'},{desde:'2026-01-01',ate:hoje}]};
 const r=apurarComercial(base({cobertura:c,coberturaOrcamentos:c}),{de:'2024-01-01',ate:'2024-12-31'},hoje);
 assert.equal(r.completo,false);assert.equal(r.orcamentosCompletos,false);assert.equal(r.valorAberto,null);
 assert.equal(apurarComercial(base({cobertura:c}),periodo,hoje).completo,true);
});
