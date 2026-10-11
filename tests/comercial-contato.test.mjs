import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validarContato,contextoDaAcao,RESULTADOS_CONTATO,elegivelPosVenda} from '../supabase/functions/_shared/relacionamento-comercial.mjs';
import {validarAcao} from '../supabase/functions/_shared/comercial.mjs';

const agora='2026-10-11T15:00:00Z';
const acao={id:'acao-ficticia',clienteId:'cliente-ficticio',vendedorId:'v-ficticio',tipoAcao:'acompanhamento',descricao:'Apresentar revisão da proposta',data:'2026-10-14',status:'pendente',canal:'ligacao'};
const anterior={...acao,versao:3,contatoEm:'2026-10-08T11:00:00Z',contatoPor:'Consultora fictícia',resultadoContato:'avaliando',resultado:'Está avaliando',contatos:[{em:'2026-10-08T11:00:00Z',autor:'Consultora fictícia',resultadoContato:'avaliando',resultado:'Está avaliando'}]};
const base={vendedores:[{id:'v-ficticio',nome:'Consultora fictícia'}],clientes:[{id:'cliente-ficticio',nome:'Loja fictícia'}],orcamentos:[],vendasCliente:[],cadastroCompleto:true};
const escopo={ids:['v-ficticio'],gestor:false,vendedorId:'v-ficticio'};

test('confirmar contato grava resultado, autoria, horário e próximo passo uma única vez',()=>{
 const antes=structuredClone(anterior);
 const r=validarContato({...acao,confirmarContato:true,resultadoContato:'pediu_revisao',nota:'Solicitou duas medidas'},anterior,'Consultora fictícia',agora);
 assert.equal(r.contatoEm,agora);assert.equal(r.contatoPor,'Consultora fictícia');assert.equal(r.resultado,'Pediu revisão');assert.equal(r.contatos.length,2);
 assert.deepEqual(r.contatos[1].proximoPasso,{descricao:acao.descricao,data:acao.data});assert.equal(r.contatos[1].nota,'Solicitou duas medidas');assert.deepEqual(anterior,antes);
 assert.equal(r.confirmarContato,undefined);
});

test('edição e reagendamento preservam contato; entrada não pode forjar carimbo ou histórico',()=>{
 const r=validarContato({...acao,data:'2026-11-01',contatoEm:agora,contatoPor:'Forjado',resultadoContato:'aprovou',contatos:[{em:agora}],resultado:'Observação editada'},anterior,'Outra autoria',agora);
 assert.equal(r.contatoEm,anterior.contatoEm);assert.equal(r.contatoPor,anterior.contatoPor);assert.equal(r.resultadoContato,'avaliando');assert.deepEqual(r.contatos,anterior.contatos);
 const novo=validarContato({...acao,contatoEm:agora,contatos:[{em:agora}]},{},'Outra autoria',agora);
 assert.equal(novo.contatoEm,null);assert.deepEqual(novo.contatos,[]);
});

test('resultado padronizado é obrigatório somente ao confirmar, outro requer explicação',()=>{
 assert.throws(()=>validarContato({...acao,confirmarContato:true},{},'Consultora fictícia',agora),/resultado/i);
 assert.throws(()=>validarContato({...acao,confirmarContato:true,resultadoContato:'inventado'},{},'Consultora fictícia',agora),/resultado/i);
 assert.throws(()=>validarContato({...acao,confirmarContato:true,resultadoContato:'outro'},{},'Consultora fictícia',agora),/explique/i);
 const r=validarContato({...acao,confirmarContato:true,resultadoContato:'outro',nota:'A pessoa responsável está em férias'},{},'Consultora fictícia',agora);
 assert.equal(r.resultado,'A pessoa responsável está em férias');
 for(const resultadoContato of Object.keys(RESULTADOS_CONTATO).filter(x=>x!=='outro'))assert.equal(validarContato({...acao,confirmarContato:true,resultadoContato,motivoPerda:'preco'},{},'Consultora fictícia',agora).resultado,RESULTADOS_CONTATO[resultadoContato]);
});

test('ação aberta exige próximo passo ou espera com justificativa e revisão válida',()=>{
 assert.throws(()=>validarContato({...acao,descricao:'',confirmarContato:true,resultadoContato:'nao_atendeu'},{},'Consultora fictícia',agora),/próximo passo/i);
 assert.throws(()=>validarContato({...acao,esperaJustificada:true,confirmarContato:true,resultadoContato:'aguarda_informacao'},{},'Consultora fictícia',agora),/aguardar/i);
 assert.throws(()=>validarContato({...acao,esperaJustificada:true,justificativaEspera:'Depende de medidas',revisaoEm:'2026-02-30'},{},'Consultora fictícia',agora),/data válida/i);
 assert.throws(()=>validarContato({...acao,esperaJustificada:true,justificativaEspera:'Depende de medidas',revisaoEm:'2026-99-01'},{},'Consultora fictícia',agora),/data válida/i);
 const r=validarContato({...acao,esperaJustificada:true,justificativaEspera:'Cliente enviará medidas',revisaoEm:'2026-10-19',confirmarContato:true,resultadoContato:'aguarda_informacao'},{},'Consultora fictícia',agora);
 assert.equal(r.data,'2026-10-19');assert.equal(r.contatos[0].proximoPasso,null);assert.deepEqual(r.contatos[0].espera,{justificativa:'Cliente enviará medidas',revisaoEm:'2026-10-19'});
});

test('conclusão exige resultado em qualquer tipo e não exige contato realizado',()=>{
 for(const tipoAcao of ['acompanhamento','prospeccao','pos_venda','relacionamento','reativacao'])assert.throws(()=>validarContato({...acao,tipoAcao,status:'concluida'},{},'Consultora fictícia',agora),/resultado/i);
 const r=validarContato({...acao,status:'concluida',resultado:'Cliente desistiu da obra'},anterior,'Consultora fictícia',agora);
 assert.equal(r.contatoEm,anterior.contatoEm);assert.equal(r.contatos.length,1);
 const confirmada=validarContato({...acao,status:'concluida',confirmarContato:true,resultadoContato:'recusou',motivoPerda:'prazo'},{},'Consultora fictícia',agora);
 assert.equal(confirmada.resultado,'Recusou');assert.equal(confirmada.contatos[0].concluida,true);assert.equal(confirmada.contatos[0].proximoPasso,null);
});

test('validação canônica mantém identidade e usa o anterior do servidor para reagendar',()=>{
 const r=validarAcao({...acao,data:'2026-10-20',contatoEm:agora},escopo,{...base,acaoAnterior:anterior},'Consultora fictícia',agora);
 assert.equal(r.id,acao.id);assert.equal(r.data,'2026-10-20');assert.equal(r.contatoEm,anterior.contatoEm);assert.equal(r.atualizadoEm,agora);assert.deepEqual(r.contatos,anterior.contatos);
 const contato=validarAcao({...acao,confirmarContato:true,resultadoContato:'avaliando'},escopo,{...base,acaoAnterior:anterior},'Consultora fictícia',agora);
 assert.equal(contato.id,acao.id);assert.equal(contato.contatoEm,agora);assert.equal(contato.contatos.length,2);
});

test('pós-venda aceita somente entrega comprovada, com cliente e pedido autorizados',()=>{
 const entrada={...acao,tipoAcao:'pos_venda',ordemId:'pedido-ficticio',objetivo:'Conferir satisfação'};
 const venda={id:'pedido-ficticio',numero:'101',clienteId:acao.clienteId,data:'2026-10-01'};
 assert.throws(()=>contextoDaAcao(entrada,{...base,vendasCliente:[venda]}),/entrega/i);
 assert.throws(()=>contextoDaAcao(entrada,{...base,vendasCliente:[{...venda,situacao:'baixada',finalizadoPor:'Mubisys'}]}),/entrega/i);
 assert.equal(elegivelPosVenda({...venda,elegivelPosVenda:true}),false);
 const entregue={...venda,elegivelPosVenda:true,entregaRealEm:'2026-10-10T13:00:00Z'};
 assert.equal(contextoDaAcao(entrada,{...base,vendasCliente:[entregue]}).ordemId,venda.id);
 assert.throws(()=>contextoDaAcao(entrada,{...base,vendasCliente:[{...entregue,clienteId:'outro-ficticio'}]}),/cliente|acesso/i);
 assert.equal(contextoDaAcao({...entrada,tipoAcao:'acompanhamento'},{...base,vendasCliente:[venda]}).ordemId,venda.id);
});


test('recusa exige motivo e outro exige observação; não encerra oportunidade por ausência de resposta',()=>{
 assert.throws(()=>validarContato({...acao,confirmarContato:true,resultadoContato:'recusou'},{},'Consultora fictícia',agora),/motivo/i);
 assert.throws(()=>validarContato({...acao,confirmarContato:true,resultadoContato:'recusou',motivoPerda:'outro'},{},'Consultora fictícia',agora),/explique/i);
 const recusou=validarContato({...acao,confirmarContato:true,resultadoContato:'recusou',motivoPerda:'outro',observacaoPerda:'Obra cancelada'},{},'Consultora fictícia',agora);
 assert.equal(recusou.motivoPerda,'outro');assert.equal(recusou.contatos[0].observacaoPerda,'Obra cancelada');assert.equal(recusou.status,undefined);
 const editada=validarContato({...acao,data:'2026-11-01'},recusou,'Consultora fictícia',agora);assert.equal(editada.motivoPerda,'outro');assert.equal(editada.observacaoPerda,'Obra cancelada');
 const tentativa=validarAcao({...acao,confirmarContato:true,resultadoContato:'nao_atendeu'},escopo,base,'Consultora fictícia',agora);assert.equal(tentativa.status,'pendente');
});
