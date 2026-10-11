import {test} from 'node:test';
import assert from 'node:assert/strict';
import {metaDoPeriodo,apurarComercial,anteriorEquivalente,validarAcao,resolverEscopo} from '../supabase/functions/_shared/comercial.mjs';
import {contarDiasUteis,coberturaComercialContem,ultimoContatoConfirmado} from '../supabase/functions/_shared/comercial-calculos.mjs';

const hoje='2026-10-11',periodo={de:'2026-10-01',ate:'2026-10-31'};
const vendedores=[{id:'1',nome:'Ana Fictícia',status:'ativo'},{id:'2',nome:'Bia Fictícia',status:'inativo'},{id:'3',nome:'Cris Fictícia',status:'ativo'}];
const catalogo={vendedores},escopo={gestor:true,ids:null};
const metas=vendedores.map(v=>({id:`${v.id}_2026-10`,vendedorId:v.id,mes:'2026-10',valor:100,criterio:'cadastro_liquido_os_normal',origem:'painel'}));
const os=(id,vendedorId='1',extra={})=>({id,data:'2026-10-06',tipo:'Normal',valor:50,vendedorErpId:vendedorId,clienteId:'c',...extra});
const orc=(id,extra={})=>({id,clienteId:'c',cliente:'Empresa Fictícia',dataCadastro:'2026-09-01',situacao:'aberto',valor:120,...extra});
const acao=(id,extra={})=>({id,clienteId:'c',vendedorId:'1',descricao:'Próximo passo fictício',data:hoje,status:'pendente',...extra});
const base=(extra={})=>({ordens:[],clientes:[{id:'c',nome:'Empresa Fictícia'}],orcamentos:[],acoes:[],cobertura:{desde:'2020-01-01',ate:hoje},coberturaOrcamentos:{desde:'2020-01-01',ate:hoje},config:{},...extra});
const calendario={configurado:true,diasSemana:[1,2,3,4,5],feriados:['2026-10-02','2026-09-03'],excecoes:{'2026-10-03':true,'2026-10-05':false}};

test('meta e realizado usam exatamente os participantes ativos e excluem os mesmos IDs',()=>{
 const meta=metaDoPeriodo(metas,escopo,catalogo,periodo);
 const r=apurarComercial(base({meta,ordens:[os('a'),os('b','2',{valor:999}),os('c','3')]}),periodo,hoje);
 assert.equal(r.valor,109900);
 assert.deepEqual(r.meta.idsParticipantes,['1','3']);assert.deepEqual(r.meta.idsExcluidos,['2']);
 assert.equal(r.meta.valor,20000);assert.equal(r.meta.realizado,10000);assert.equal(r.meta.percentual,50);
 assert.deepEqual(r.meta.idsVendas,['a','c']);assert.deepEqual(r.meta.idsVendasExcluidas,['b']);
 assert.equal(r.meta.vendas.reduce((s,v)=>s+v.centavos,0),r.meta.realizado);assert.equal(r.meta.cobertura.completa,true);
 assert.equal(r.meta.participantes[0].origem,'painel');
});
test('participação explícita, exclusão e consulta individual de inativo têm regra visível',()=>{
 const configurada=metaDoPeriodo(metas,escopo,catalogo,periodo,{participantesMetas:['1','2'],excluidosMetas:['1']});
 assert.deepEqual(configurada.idsParticipantes,['2']);assert.deepEqual(configurada.idsExcluidos,['1','3']);
 assert.match(configurada.excluidos[0].motivo,/Exclusão explícita/);
 assert.deepEqual(metaDoPeriodo(metas,{ids:['2'],tipoEscopo:'individual'},catalogo,periodo).idsParticipantes,['2']);
 const desconhecida=metaDoPeriodo(metas,escopo,catalogo,periodo,{participantesMetas:['999']});
 assert.equal(desconhecida.estadoMeta,'vinculo_pendente');assert.deepEqual(desconhecida.idsAConferir,['999']);
 const individual=metaDoPeriodo(metas,{ids:['1']},catalogo,periodo,{participantesMetas:['1','999']});
 assert.deepEqual(individual.idsAConferir,[]);assert.equal(individual.indisponivel,false);
});
test('meta de equipe exclui inativo por padrão e conserva consulta individual ou participação explícita',()=>{
 const equipe={ids:['1','2'],tipoEscopo:'equipe'},meta=metaDoPeriodo(metas,equipe,catalogo,periodo);
 assert.deepEqual(meta.idsParticipantes,['1']);assert.deepEqual(meta.idsExcluidos,['2']);
 assert.match(meta.excluidos[0].motivo,/inativo/);
 const r=apurarComercial(base({meta,ordens:[os('ativa'),os('inativa','2',{valor:999})]}),periodo,hoje);
 assert.equal(r.meta.realizado,5000);assert.equal(r.meta.valor,10000);assert.equal(r.meta.percentual,50);
 assert.deepEqual(r.meta.idsVendasExcluidas,['inativa']);
 assert.deepEqual(metaDoPeriodo(metas,{ids:['2'],tipoEscopo:'individual'},catalogo,periodo).idsParticipantes,['2']);
 assert.deepEqual(metaDoPeriodo(metas,equipe,catalogo,periodo,{participantesMetas:['1','2']}).idsParticipantes,['1','2']);
});
test('tipo de escopo distingue equipe de um membro, consulta individual e carteira própria',()=>{
 const config={equipes:[{id:'equipe-inativa',vendedores:['2']}]};
 const equipe=resolverEscopo({master:true},catalogo,config,{equipe:'equipe-inativa'});
 assert.deepEqual(equipe.ids,['2']);
 assert.deepEqual(metaDoPeriodo(metas,equipe,catalogo,periodo).idsParticipantes,[]);
 assert.equal(equipe.tipoEscopo,'equipe');
 assert.deepEqual(metaDoPeriodo(metas,equipe,catalogo,periodo).idsExcluidos,['2']);
 const intersecao=resolverEscopo({master:true},catalogo,config,{equipe:'equipe-inativa',vendedor:'2'});
 assert.equal(intersecao.tipoEscopo,'equipe');assert.deepEqual(metaDoPeriodo(metas,intersecao,catalogo,periodo).idsParticipantes,[]);
 const individual=resolverEscopo({master:true},catalogo,config,{vendedor:'2'});
 assert.equal(individual.tipoEscopo,'individual');assert.deepEqual(metaDoPeriodo(metas,individual,catalogo,periodo).idsParticipantes,['2']);
 const propria=resolverEscopo({sub:'bia',vend:'2',perms:['orcamentos']},catalogo);
 assert.equal(propria.tipoEscopo,'individual');assert.deepEqual(metaDoPeriodo(metas,propria,catalogo,periodo).idsParticipantes,['2']);
 assert.equal(resolverEscopo({master:true},catalogo).tipoEscopo,'consolidado');
 assert.deepEqual(metaDoPeriodo(metas,{ids:['2']},catalogo,periodo).idsParticipantes,[]);
 assert.deepEqual(metaDoPeriodo(metas,equipe,catalogo,periodo,{participantesMetas:['2']}).idsParticipantes,['2']);
});
test('ausência, zero, fonte indisponível e consolidado parcial permanecem distintos',()=>{
 const apurar=m=>apurarComercial(base({meta:m,ordens:[os('a')]}),periodo,hoje).meta;
 assert.equal(apurar(metaDoPeriodo([],escopo,catalogo,periodo)).estado,'ausente');
 assert.equal(apurar(metaDoPeriodo(metas.map(m=>({...m,valor:0})),escopo,catalogo,periodo)).estado,'zero');
 assert.equal(apurar(metaDoPeriodo(null,escopo,catalogo,periodo)).estado,'fonte_indisponivel');
 const parcial=apurar(metaDoPeriodo([metas[0]],escopo,catalogo,periodo));
 assert.equal(parcial.estado,'parcial');assert.deepEqual(parcial.idsFaltantes,['3']);assert.equal(parcial.realizado,5000);
 assert.equal(parcial.percentual,null);assert.equal(parcial.falta,null);assert.equal(parcial.porDia,null);
 assert.equal(parcial.cobertura.metasCompleta,false);
});
test('metas inválidas e duplicadas não convertem ausência em zero nem completam o consolidado',()=>{
 for(const ms of [null,'',' ',false,true,[],{}].map(valor=>[{...metas[0],valor}]).concat([[{...metas[0],criterio:'outro'}],[metas[0],{...metas[0],id:'duplicada'}]])){
  const m=metaDoPeriodo(ms,{ids:['1']},catalogo,periodo);
  assert.equal(m.indisponivel,true);assert.equal(m.valor,null);assert.equal(m.registros.length,0);assert.equal(m.faltantes.length,1);
 }
});
test('comparação mantém o critério das vendas e não exige valores de cancelamento ou retrabalho',()=>{
 const r=apurarComercial(base({ordens:[os('atual'),os('anterior','1',{data:'2026-09-01',valor:25}),os('cancelado','1',{data:'2026-09-02',tipo:'',valor:null,cancelada:true}),os('retrabalho','1',{data:hoje,tipo:'Retrabalho',valor:null})]}),periodo,hoje);
 assert.equal(r.completo,true);assert.equal(r.comparativo.completo,true);assert.equal(r.comparativo.valorAnterior,2500);assert.equal(r.comparativo.valorAtual,5000);
 assert.deepEqual(r.comparativo.registros.map(o=>o.id),['anterior']);
});
test('cobertura incompleta bloqueia percentual mesmo com realizado acima da meta',()=>{
 const meta=metaDoPeriodo(metas,{ids:['1']},catalogo,periodo);
 for(const extra of [{cobertura:{desde:'2026-10-05',ate:hoje}}, {ordens:[os('a','1',{valor:1000}),os('incerta','1',{valor:null})]}]){
  const m=apurarComercial(base({meta,ordens:[os('a','1',{valor:1000})],...extra}),periodo,hoje).meta;
  assert.equal(m.estado,'parcial');assert.equal(m.percentual,null);assert.equal(m.falta,null);assert.equal(m.porDia,null);assert.equal(m.cobertura.vendasCompleta,false);
 }
});
test('identidade ambígua ou ID desconhecido não inflaciona o realizado dos participantes',()=>{
 const meta=metaDoPeriodo(metas,escopo,{vendedores:[...vendedores,{id:'4',nome:'Ana Fictícia',status:'inativo'}]},periodo);
 const r=apurarComercial(base({meta,ordens:[os('id'),os('nome','',{vendedor:'Ana Fictícia'}),os('desconhecida','999')]}),periodo,hoje);
 assert.equal(r.meta.realizado,5000);assert.equal(r.meta.estado,'vinculo_pendente');assert.equal(r.meta.percentual,null);
 assert.deepEqual(r.meta.idsVendasAConferir,['nome','desconhecida']);
 const unica=metaDoPeriodo(metas,{ids:['1']},catalogo,periodo);
 assert.equal(apurarComercial(base({meta:unica,ordens:[os('nome',null,{vendedor:'Ana Fictícia'})]}),periodo,hoje).meta.realizado,5000);
});
test('feriados e exceções valem para o ritmo e a equivalência por dias úteis',()=>{
 assert.equal(contarDiasUteis({de:'2026-10-01',ate:'2026-10-06'},calendario),3);
 const c=anteriorEquivalente(periodo,'2026-10-06','diasUteis',calendario);
 assert.equal(c.atualAte,'2026-10-06');assert.equal(c.ate,'2026-09-04');assert.equal(c.diasUteisAtual,3);assert.equal(c.diasUteisAnterior,3);
 const r=apurarComercial(base({config:{calendario},ordens:[os('atual'),os('passado','1',{data:'2026-09-04',valor:25}),os('fora','1',{data:'2026-09-05',valor:100})]}),{...periodo,comparacao:'diasUteis'},'2026-10-06');
 assert.equal(r.comparativo.valorAnterior,2500);assert.deepEqual(r.comparativo.registros.map(o=>o.id),['passado']);
 assert.equal(r.comparativo.diasUteisAtual,r.comparativo.diasUteisAnterior);
});
test('sem calendário, sem dia útil ou anterior mais curto não fabrica equivalência',()=>{
 const c=anteriorEquivalente(periodo,hoje,'diasUteis');assert.equal(c.indisponivel,true);assert.equal(c.calendarioConfigurado,false);
 const r=apurarComercial(base(),{...periodo,comparacao:'diasUteis'},hoje);assert.equal(r.comparativo.percentual,null);assert.equal(r.comparativo.completo,false);
 assert.equal(anteriorEquivalente(periodo,hoje,'diasUteis',{configurado:true,diasSemana:[],feriados:[]}).indisponivel,true);
 assert.equal(anteriorEquivalente({de:'2026-03-01',ate:'2026-03-31'},'2026-04-01','diasUteis',{configurado:true,diasSemana:[0,1,2,3,4,5,6],feriados:[]}).indisponivel,true);
});
test('cobertura une janelas adjacentes mas mantém qualquer lacuna explícita',()=>{
 const p={de:'2026-09-30',ate:'2026-10-03'},c={janelas:[{desde:'2026-10-01',ate:hoje},{desde:'2026-09-01',ate:'2026-09-30'}]};
 assert.equal(coberturaComercialContem(c,p,hoje),true);
 assert.equal(coberturaComercialContem({...c,janelas:[c.janelas[0],{...c.janelas[1],ate:'2026-09-29'}]},p,hoje),false);
});
test('fila mantém validade vencida e pendência com retorno futuro em uma linha explicável',()=>{
 const r=apurarComercial(base({orcamentos:[orc('p',{validadeData:'2026-10-09'})],acoes:[acao('futura',{orcamentoId:'p',data:'2026-10-20',pendencias:'Conferir material'})]}),{de:'2026-09-01',ate:'2026-09-30'},hoje);
 assert.equal(r.prioridades.length,1);const f=r.prioridades[0];
 assert.deepEqual(f.motivos.map(m=>m.codigo),['validade_vencida','pendencia','retorno_programado']);assert.deepEqual(f.acaoIds,['futura']);
 assert.equal(f.proximaAcaoData,'2026-10-20');assert.equal(f.valor,120);assert.equal(f.tipo,'Validade vencida');
});
test('retorno atrasado, validade e ausência de resposta coexistem sem duplicar valor ou ação',()=>{
 const a=acao('atrasada',{orcamentoId:'p',data:'2026-09-30'});
 const r=apurarComercial(base({orcamentos:[orc('p',{validade:2})],acoes:[a,a]}),periodo,hoje);
 assert.equal(r.atrasadas.length,1);assert.equal(r.prioridades.length,1);assert.equal(r.valorAbertoOperacional,12000);
 assert.deepEqual(r.prioridades[0].motivos.map(m=>m.codigo),['retorno_atrasado','validade_vencida','sem_resposta']);
 assert.deepEqual(r.prioridades[0].acaoIds,['atrasada']);
});
test('edição recente e abertura de canal legado não simulam contato; confirmação posterior sim',()=>{
 const o=orc('p',{dataAtualizacao:hoje,acompanhamento:{ultimoContato:hoje+'T12:00:00Z'}});
 const a=acao('editada',{orcamentoId:'p',data:hoje,atualizadoEm:hoje+'T13:00:00Z'});
 let r=apurarComercial(base({orcamentos:[o],acoes:[a]}),periodo,hoje);
 assert.equal(r.clientes[0].ultimoContato,null);assert.ok(r.prioridades[0].motivos.some(m=>m.codigo==='sem_resposta'));
 r=apurarComercial(base({orcamentos:[o],acoes:[{...a,contatoEm:'2026-10-10T12:00:00Z'}]}),periodo,hoje);
 assert.equal(r.clientes[0].ultimoContato,'2026-10-10T12:00:00Z');assert.ok(!r.prioridades[0].motivos.some(m=>m.codigo==='sem_resposta'));
 assert.equal(ultimoContatoConfirmado([{contatoEm:'2026-10-01T12:00:00Z',contatos:[{em:'2026-10-09T12:00:00Z'}]}]),'2026-10-09T12:00:00Z');
});
test('revisões explícitas preservam tarefas antigas, última revisão e histórico sem colisão de IDs',()=>{
 const r=apurarComercial(base({orcamentos:[orc('p1',{negociacaoId:'n',revisao:1,valor:100}),orc('p2',{negociacaoId:'n',revisao:2,valor:120}),orc('n',{valor:120})],acoes:[acao('antiga',{orcamentoId:'p1',data:'2026-10-08'}),acao('nova',{orcamentoId:'p2',data:'2026-10-20'})]}),periodo,hoje);
 assert.equal(r.propostasDisponiveis.length,2);assert.equal(r.valorAbertoOperacional,24000);
 const o=r.propostasDisponiveis.find(o=>o.id==='p2');assert.deepEqual(o.orcamentoIds,['p1','p2']);assert.equal(o.revisoes.length,2);assert.equal(o.proximaAcao.id,'antiga');
 assert.deepEqual(o.acoesVinculadas.map(a=>a.id).sort(),['antiga','nova']);
 const f=r.prioridades.find(f=>f.orcamentoId==='p2');assert.deepEqual(f.acaoIds,['antiga','nova']);assert.equal(f.id,'antiga');
});
test('frequência depende de três datas e cobertura; a sugestão expõe a regra e não cria ação',()=>{
 const compras=[os('a','1',{data:'2026-06-01'}),os('b','1',{data:'2026-07-01'}),os('c','1',{data:'2026-08-01'}),os('mesmo-dia','1',{data:'2026-08-01'})];
 const r=apurarComercial(base({ordens:compras}),periodo,hoje),c=r.clientes[0];
 assert.equal(c.frequenciaCompra.dias,31);assert.equal(c.frequenciaCompra.amostra,3);assert.equal(c.reativacao.prazoDias,47);
 assert.equal(c.reativacao.sugerida,true);assert.match(c.reativacao.criterio,/mediana/);assert.equal(c.reativacao.criarAcao,false);assert.equal(r.sugestoesReativacao.length,1);
 const parcial=apurarComercial(base({ordens:compras,cobertura:{desde:'2026-07-01',ate:hoje}}),periodo,hoje).clientes[0];
 assert.equal(parcial.frequenciaCompra.estado,'historico_parcial');assert.equal(parcial.frequenciaCompra.dias,null);assert.equal(parcial.reativacao.prazoDias,90);
 const resumo=apurarComercial(base({clientes:[{id:'c',ultimaCompraHistorica:'2026-07-01',pedidosHistoricos:10}]}),periodo,hoje).clientes[0];
 assert.equal(resumo.frequenciaCompra.estado,'historico_insuficiente');assert.equal(resumo.frequenciaCompra.dias,null);
});
test('proposta aberta ou reativação já planejada evita sugerir uma ação duplicada',()=>{
 const compras=[os('a','1',{data:'2026-06-01'}),os('b','1',{data:'2026-07-01'}),os('c','1',{data:'2026-08-01'})];
 for(const extra of [{orcamentos:[orc('p')]},{acoes:[acao('reativar',{tipoAcao:'reativacao',data:'2026-10-20'})]}]){
  const r=apurarComercial(base({ordens:compras,...extra}),periodo,hoje);
  assert.equal(r.clientes[0].reativacao.sugerida,false);assert.equal(r.sugestoesReativacao.length,0);
 }
});
test('filtro de mês antigo e compra incompleta não recebem frequência habitual definitiva',()=>{
 const compras=[os('a','1',{data:'2026-06-01'}),os('b','1',{data:'2026-07-01'}),os('c','1',{data:'2026-08-01'})];
 const antigo=apurarComercial(base({ordens:compras}),{de:'2026-08-01',ate:'2026-08-31'},hoje).clientes[0];
 assert.equal(antigo.frequenciaCompra.estado,'historico_parcial');assert.equal(antigo.frequenciaCompra.dias,null);
 const incompleto=apurarComercial(base({ordens:[...compras,os('sem-tipo','1',{tipo:'',data:'2026-08-12'})]}),periodo,hoje).clientes[0];
 assert.equal(incompleto.frequenciaCompra.estado,'historico_parcial');assert.equal(incompleto.frequenciaCompra.dias,null);
});
test('tarefa com data inválida não substitui uma próxima ação confirmada',()=>{
 const r=apurarComercial(base({orcamentos:[orc('p')],acoes:[acao('sem-data',{orcamentoId:'p',data:'invalida'})]}),periodo,hoje);
 assert.equal(r.semProximaAcao.length,1);assert.ok(r.prioridades[0].motivos.some(m=>m.codigo==='sem_proxima_acao'));
});
test('retornos programados usam a fila canônica uma vez por negociação ou ação sem orçamento',()=>{
 const r=apurarComercial(base({orcamentos:[orc('p')],acoes:[acao('futura1',{orcamentoId:'p',data:'2026-10-20'}),acao('futura2',{orcamentoId:'p',data:'2026-10-21'}),acao('cliente',{data:'2026-10-22'})]}),periodo,hoje);
 assert.equal(r.prioridades.length,2);assert.ok(r.prioridades.every(p=>p.tipo==='Retorno programado'));
 assert.deepEqual(r.prioridades.find(p=>p.orcamentoId==='p').acaoIds,['futura1','futura2']);
 assert.equal(r.prioridades.find(p=>p.orcamentoId==='p').motivos[0].codigo,'retorno_programado');
 assert.deepEqual(r.prioridades.find(p=>p.id==='cliente').acaoIds,['cliente']);
});
test('fila desempata prioridade alta depois do motivo e da data e conserva a ordem dos IDs',()=>{
 const acoes=[acao('a-normal',{data:'2026-10-10',prioridade:'normal'}),acao('z-alta',{data:'2026-10-10',prioridade:'alta'}),acao('antiga',{data:'2026-10-09',prioridade:'normal'}),acao('hoje-alta',{data:hoje,prioridade:'alta'}),acao('b-normal',{data:'2026-10-10',prioridade:'normal'})];
 const r=apurarComercial(base({acoes}),periodo,hoje);
 assert.deepEqual(r.prioridades.map(a=>a.id),['antiga','z-alta','a-normal','b-normal','hoje-alta']);
 assert.deepEqual(apurarComercial(base({acoes:[...acoes].reverse()}),periodo,hoje).prioridades.map(a=>a.id),r.prioridades.map(a=>a.id));
});
test('ações representativas na mesma data preferem alta na fila e no próximo passo do orçamento',()=>{
 const r=apurarComercial(base({orcamentos:[orc('p')],acoes:[acao('a-normal',{orcamentoId:'p',prioridade:'normal'}),acao('z-alta',{orcamentoId:'p',prioridade:'alta'})]}),periodo,hoje);
 assert.equal(r.prioridades.length,1);assert.equal(r.prioridades[0].id,'z-alta');assert.equal(r.prioridades[0].prioridade,'alta');
 assert.equal(r.propostasDisponiveis[0].proximaAcao.id,'z-alta');assert.deepEqual(r.prioridades[0].acaoIds,['a-normal','z-alta']);
});
test('validarAcao confirma contato no servidor e edição parcial preserva carimbo e histórico',()=>{
 const esc={gestor:false,ids:['1'],vendedorId:'1'},b={vendedores,clientes:[{id:'c',nome:'Empresa Fictícia'}],orcamentos:[]};
 const entrada=acao('registro',{resultadoContato:'avaliando',confirmarContato:true});
 const gravada=validarAcao(entrada,esc,b,'autora','2026-10-11T12:00:00Z');
 assert.equal(gravada.contatoEm,'2026-10-11T12:00:00Z');assert.equal(gravada.contatoPor,'autora');assert.equal(gravada.contatos.length,1);assert.equal('confirmarContato' in gravada,false);
 const editada=validarAcao({id:'registro',data:'2026-10-20',contatoEm:'forjado',contatos:[]},esc,{...b,acaoAnterior:gravada},'editora','2026-10-11T13:00:00Z');
 assert.equal(editada.contatoEm,gravada.contatoEm);assert.deepEqual(editada.contatos,gravada.contatos);assert.equal(editada.resultado,gravada.resultado);
 assert.equal(editada.clienteId,'c');assert.equal(editada.descricao,entrada.descricao);assert.equal(editada.data,'2026-10-20');
});
test('espera justificada agenda revisão e concluir acompanhamento exige resultado',()=>{
 const esc={gestor:false,ids:['1'],vendedorId:'1'},b={vendedores,clientes:[{id:'c',nome:'Empresa Fictícia'}],orcamentos:[]};
 const espera=validarAcao({...acao('espera'),data:'',descricao:'',confirmarContato:true,resultadoContato:'avaliando',esperaJustificada:true,justificativaEspera:'Cliente aguarda decisão interna',revisaoEm:'2026-10-18'},esc,b,'autora',hoje+'T12:00:00Z');
 assert.equal(espera.data,'2026-10-18');assert.match(espera.descricao,/Revisar espera/);assert.equal(espera.contatos[0].espera.revisaoEm,espera.data);
 assert.throws(()=>validarAcao({...acao('concluir'),status:'concluida'},esc,b,'autora',hoje+'T12:00:00Z'),/resultado/);
});

test('compra no período é reativada somente pelo intervalo desde a última O.S. anterior confirmada',()=>{
 const compras=[os('antiga','1',{data:'2026-06-01'}),os('primeira','1',{data:'2026-10-05'}),os('segunda','1',{data:'2026-10-06'})];
 const c=apurarComercial(base({ordens:compras}),periodo,hoje).clientes[0];
 assert.equal(c.perfil,'Recorrente');assert.equal(c.perfilCompraPeriodo.estado,'reativado');assert.equal(c.perfilCompraPeriodo.rotulo,'Reativado');
 assert.equal(c.perfilCompraPeriodo.compraAnterior,'2026-06-01');assert.equal(c.perfilCompraPeriodo.primeiraCompraPeriodo,'2026-10-05');assert.equal(c.perfilCompraPeriodo.intervaloDias,126);
 assert.deepEqual(c.perfilCompraPeriodo.idsVendas,['primeira','segunda']);assert.equal(c.perfilCompraPeriodo.coberturaCompleta,true);assert.match(c.perfilCompraPeriodo.criterio,/90 dias/);
 const recente=apurarComercial(base({ordens:[...compras,os('anterior-recente','1',{data:'2026-09-25'})]}),periodo,hoje).clientes[0];
 assert.equal(recente.perfilCompraPeriodo.estado,'recorrente');assert.equal(recente.perfilCompraPeriodo.compraAnterior,'2026-09-25');assert.equal(recente.perfilCompraPeriodo.intervaloDias,10);
});
test('reativado respeita limite inclusivo configurado e não usa dias desde hoje',()=>{
 const analisar=(anterior,config={})=>apurarComercial(base({config,ordens:[os('anterior','1',{data:anterior}),os('atual','1',{data:'2026-10-05'})]}),periodo,hoje).clientes[0].perfilCompraPeriodo;
 assert.equal(analisar('2026-07-07').estado,'reativado');assert.equal(analisar('2026-07-07').intervaloDias,90);
 assert.equal(analisar('2026-07-08').estado,'recorrente');assert.equal(analisar('2026-07-07',{diasReativacao:120}).estado,'recorrente');
 const historico=apurarComercial(base({ordens:[os('anterior','1',{data:'2026-05-01'}),os('retorno','1',{data:'2026-08-05'})]}),{de:'2026-08-01',ate:'2026-08-31'},hoje).clientes[0].perfilCompraPeriodo;
 assert.equal(historico.estado,'reativado');assert.equal(historico.primeiraCompraPeriodo,'2026-08-05');assert.equal(historico.intervaloDias,96);
});
test('resumo histórico ou consulta truncada não provam a compra anterior necessária à reativação',()=>{
 const atuais=[os('atual','1',{data:'2026-10-05'})];
 const resumo=apurarComercial(base({ordens:atuais,clientes:[{id:'c',primeiraCompraHistorica:'2022-01-01',ultimaCompraHistorica:'2026-10-05',temCompraHistorica:true}],coberturaHistorica:{completo:true}}),periodo,hoje).clientes[0].perfilCompraPeriodo;
 assert.equal(resumo.estado,'indisponivel');assert.equal(resumo.compraAnterior,null);assert.equal(resumo.intervaloDias,null);assert.equal(resumo.coberturaCompleta,false);
 const truncada=apurarComercial(base({ordens:[os('anterior','1',{data:'2026-06-01'}),...atuais],cobertura:{janelas:[{desde:'2026-06-01',ate:'2026-06-30'},{desde:'2026-10-01',ate:hoje}]}}),periodo,hoje).clientes[0].perfilCompraPeriodo;
 assert.equal(truncada.estado,'indisponivel');assert.equal(truncada.intervaloDias,null);assert.equal(truncada.coberturaCompleta,false);
 for(const incerta of [os('sem-tipo','1',{data:'2026-09-25',tipo:''}),os('sem-data','1',{data:''})]){
  const incompleta=apurarComercial(base({ordens:[os('anterior','1',{data:'2026-06-01'}),incerta,...atuais]}),periodo,hoje).clientes[0].perfilCompraPeriodo;
  assert.equal(incompleta.estado,'indisponivel');assert.equal(incompleta.coberturaCompleta,false);
 }
});
test('novo exige primeira compra histórica confirmada com cobertura; ausência no lote não basta',()=>{
 const extra={ordens:[os('primeira','1',{data:'2026-10-05'})],clientes:[{id:'c',primeiraCompraHistorica:'2026-10-05',ultimaCompraHistorica:'2026-10-05',temCompraHistorica:true}]};
 let c=apurarComercial(base({...extra,coberturaHistorica:{completo:true}}),periodo,hoje).clientes[0].perfilCompraPeriodo;
 assert.equal(c.estado,'novo');assert.equal(c.rotulo,'Novo');assert.equal(c.coberturaCompleta,true);
 c=apurarComercial(base({...extra,coberturaHistorica:{completo:false}}),periodo,hoje).clientes[0].perfilCompraPeriodo;
 assert.equal(c.estado,'indisponivel');
 c=apurarComercial(base({ordens:extra.ordens}),periodo,hoje).clientes[0].perfilCompraPeriodo;
 assert.equal(c.estado,'indisponivel');assert.equal(c.coberturaCompleta,false);
});
test('sem compra no período é explícito quando coberto e fica indisponível quando a fonte é parcial',()=>{
 let c=apurarComercial(base({ordens:[os('antiga','1',{data:'2026-09-01'})]}),periodo,hoje).clientes[0].perfilCompraPeriodo;
 assert.equal(c.estado,'sem_compra_periodo');assert.deepEqual(c.idsVendas,[]);assert.equal(c.primeiraCompraPeriodo,null);
 c=apurarComercial(base({cobertura:{desde:'2026-10-05',ate:hoje}}),periodo,hoje).clientes[0].perfilCompraPeriodo;
 assert.equal(c.estado,'indisponivel');assert.equal(c.coberturaCompleta,false);
});
test('aprovação divide ganhos por todos os orçamentos de situação conhecida do mesmo período',()=>{
 const noMes=(id,situacao,extra={})=>orc(id,{dataCadastro:'2026-10-02',situacao,...extra});
 const r=apurarComercial(base({orcamentos:[noMes('aberto','aberto'),noMes('perdido','perdido'),noMes('versao1','ganho',{negociacaoId:'n',revisao:1}),noMes('versao2','ganho',{negociacaoId:'n',revisao:2}),noMes('fora','ganho',{dataCadastro:'2026-09-01'})]}),periodo,hoje);
 assert.equal(r.aprovacaoOrcamentos.denominador,3);assert.equal(r.aprovacaoOrcamentos.aprovados,1);assert.ok(Math.abs(r.aprovacaoOrcamentos.percentual-100/3)<1e-12);assert.equal(r.aprovacaoOrcamentos.completo,true);
 assert.deepEqual(r.aprovacaoOrcamentos.idsBase,['aberto','perdido','versao2']);assert.deepEqual(r.aprovacaoOrcamentos.idsAprovados,['versao2']);assert.match(r.aprovacaoOrcamentos.criterio,/aprovação registrada/);assert.match(r.aprovacaoOrcamentos.criterio,/conversão em pedido/);
});
test('situação desconhecida, falha de cobertura e base vazia não inventam percentual de aprovação',()=>{
 const noMes=(id,situacao)=>orc(id,{dataCadastro:'2026-10-02',situacao});
 for(const situacao of ['conferir','',null,'estado_novo']){
  const r=apurarComercial(base({orcamentos:[noMes('aprovado','ganho'),noMes('aberto','aberto'),noMes('desconhecido',situacao)]}),periodo,hoje).aprovacaoOrcamentos;
  assert.equal(r.denominador,2);assert.equal(r.aprovados,1);assert.equal(r.percentual,null);assert.equal(r.completo,false);assert.deepEqual(r.idsBase,['aberto','aprovado']);
 }
 const parcial=apurarComercial(base({orcamentos:[noMes('aprovado','ganho')],coberturaOrcamentos:{desde:'2026-10-05',ate:hoje}}),periodo,hoje).aprovacaoOrcamentos;
 assert.equal(parcial.aprovados,1);assert.equal(parcial.percentual,null);assert.equal(parcial.completo,false);
 const vazia=apurarComercial(base(),periodo,hoje).aprovacaoOrcamentos;
 assert.equal(vazia.denominador,0);assert.equal(vazia.aprovados,0);assert.equal(vazia.percentual,null);assert.equal(vazia.completo,true);
});
test('orçamento sem data não entra no período e bloqueia o percentual de aprovação',()=>{
 for(const situacao of ['perdido','aberto','ganho','conferir']){
  const r=apurarComercial(base({orcamentos:[orc('ganho',{dataCadastro:'2026-10-02',situacao:'ganho'}),orc('sem-data',{dataCadastro:null,dataEnvio:null,situacao})]}),periodo,hoje);
  assert.deepEqual(r.propostas.map(o=>o.id),['ganho']);
  assert.equal(r.aprovacaoOrcamentos.denominador,1);assert.equal(r.aprovacaoOrcamentos.aprovados,1);
  assert.equal(r.aprovacaoOrcamentos.percentual,null);assert.equal(r.aprovacaoOrcamentos.completo,false);
  assert.equal(r.aprovacaoOrcamentos.coberturaTemporalCompleta,false);
  assert.deepEqual(r.aprovacaoOrcamentos.idsSemData,['sem-data']);assert.equal(r.aprovacaoOrcamentos.quantidadeSemData,1);
  assert.deepEqual(r.aprovacaoOrcamentos.idsBase,['ganho']);assert.match(r.aprovacaoOrcamentos.causa,/data|período/);
 }
 const invalida=apurarComercial(base({orcamentos:[orc('data-invalida',{dataCadastro:'2026-02-30',situacao:'perdido'})]}),periodo,hoje).aprovacaoOrcamentos;
 assert.deepEqual(invalida.idsSemData,['data-invalida']);assert.equal(invalida.denominador,0);assert.equal(invalida.percentual,null);assert.equal(invalida.completo,false);
});
test('datas comprovadas preservam aprovação e não tratam propostas fora do período como sem data',()=>{
 const r=apurarComercial(base({orcamentos:[orc('ganho',{dataCadastro:'2026-10-02',situacao:'ganho'}),orc('perdido',{dataCadastro:null,dataEnvio:'2026-10-03T12:00:00Z',situacao:'perdido'}),orc('fora',{dataCadastro:'2026-09-02',situacao:'perdido'})]}),periodo,hoje).aprovacaoOrcamentos;
 assert.equal(r.denominador,2);assert.equal(r.aprovados,1);assert.equal(r.percentual,50);assert.equal(r.completo,true);
 assert.equal(r.coberturaTemporalCompleta,true);assert.deepEqual(r.idsSemData,[]);assert.equal(r.quantidadeSemData,0);assert.equal(r.causa,null);
 assert.deepEqual(r.idsBase,['ganho','perdido']);
});
test('conferência temporal conta uma vez a revisão canônica da negociação',()=>{
 const versao=(id,revisao,dataCadastro)=>orc(id,{negociacaoId:'n',revisao,dataCadastro,dataEnvio:null,situacao:'perdido'});
 let r=apurarComercial(base({orcamentos:[orc('ganho',{dataCadastro:'2026-10-02',situacao:'ganho'}),versao('antiga',1,null),versao('atual',2,null)]}),periodo,hoje).aprovacaoOrcamentos;
 assert.equal(r.percentual,null);assert.deepEqual(r.idsSemData,['atual']);assert.equal(r.quantidadeSemData,1);assert.deepEqual(r.idsBase,['ganho']);
 r=apurarComercial(base({orcamentos:[orc('ganho',{dataCadastro:'2026-10-02',situacao:'ganho'}),versao('antiga',1,null),versao('atual',2,'2026-10-03')]}),periodo,hoje).aprovacaoOrcamentos;
 assert.equal(r.percentual,50);assert.equal(r.completo,true);assert.deepEqual(r.idsSemData,[]);assert.deepEqual(r.idsBase,['atual','ganho']);
});
