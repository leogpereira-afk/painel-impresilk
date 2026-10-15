import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validarContato,contextoDaAcao,RESULTADOS_CONTATO,elegivelPosVenda} from '../supabase/functions/_shared/relacionamento-comercial.mjs';
import {validarAcao} from '../supabase/functions/_shared/comercial.mjs';
import * as relacionamento from '../supabase/functions/_shared/relacionamento-comercial.mjs';

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

test('conclusão exige resultado em qualquer tipo e ações gerais preservam o contato anterior',()=>{
 for(const tipoAcao of ['acompanhamento','prospeccao','pos_venda','relacionamento','reativacao'])assert.throws(()=>validarContato({...acao,tipoAcao,status:'concluida'},{},'Consultora fictícia',agora),/resultado/i);
 const r=validarContato({...acao,status:'concluida',resultado:'Cliente desistiu da obra'},anterior,'Consultora fictícia',agora);
 assert.equal(r.contatoEm,anterior.contatoEm);assert.equal(r.contatos.length,1);
 const confirmada=validarContato({...acao,status:'concluida',confirmarContato:true,resultadoContato:'recusou',motivoPerda:'prazo'},{},'Consultora fictícia',agora);
 assert.equal(confirmada.resultado,'Recusou');assert.equal(confirmada.contatos[0].concluida,true);assert.equal(confirmada.contatos[0].proximoPasso,null);
});

test('pós-venda exige relato do que foi feito em cada contato confirmado',()=>{
 const pos={...acao,tipoAcao:'pos_venda',confirmarContato:true,resultadoContato:'avaliando'};
 for(const relatoAtendimento of [undefined,'','   ',15,'x'.repeat(3001)])assert.throws(()=>validarContato({...pos,relatoAtendimento},{},'Consultora fictícia',agora),/relato|feito|caracteres/i);
 const r=validarContato({...pos,relatoAtendimento:'  Conferi a instalação e ouvi o retorno da cliente.  '},{},'Consultora fictícia',agora);
 assert.equal(r.relatoAtendimento,'Conferi a instalação e ouvi o retorno da cliente.');assert.equal(r.contatos[0].relatoAtendimento,r.relatoAtendimento);
 assert.equal(r.contatos[0].autor,'Consultora fictícia');assert.equal(r.contatos[0].em,agora);
 assert.doesNotThrow(()=>validarContato({...pos,relatoAtendimento:'x'.repeat(3000)},{},'Consultora fictícia',agora));
});

test('pós-venda preserva relato canônico em edições e exige um novo relato no contato seguinte',()=>{
 const pos={...acao,tipoAcao:'pos_venda',relatoAtendimento:'Conferi os acabamentos.',contatos:[{em:anterior.contatoEm,relatoAtendimento:'Conferi os acabamentos.'}],contatoEm:anterior.contatoEm};
 const r=validarContato({...pos,data:'2026-11-01',relatoAtendimento:'FORJADO',contatos:[{em:agora,relatoAtendimento:'FORJADO'}]},pos,'Consultora fictícia',agora);
 assert.equal(r.relatoAtendimento,'Conferi os acabamentos.');assert.deepEqual(r.contatos,pos.contatos);
 const semAnterior=validarContato({...pos,relatoAtendimento:'FORJADO'},{},'Consultora fictícia',agora);assert.equal(semAnterior.relatoAtendimento,'');assert.deepEqual(semAnterior.contatos,[]);
 assert.throws(()=>validarContato({...pos,confirmarContato:true,resultadoContato:'avaliando',relatoAtendimento:''},pos,'Consultora fictícia',agora),/relato|feito/i);
});

test('concluir pós-venda exige contato confirmado com relato, sem burlar pelo planejamento',()=>{
 const pos={...acao,tipoAcao:'pos_venda',status:'concluida',resultado:'Cliente satisfeito'};
 assert.throws(()=>validarContato(pos,{},'Consultora fictícia',agora),/contato confirmado/i);
 assert.throws(()=>validarContato({...pos,confirmarContato:false,contatoEm:agora,relatoAtendimento:'Forjado',contatos:[{em:agora,concluida:true}]},{},'Consultora fictícia',agora),/contato confirmado/i);
 assert.throws(()=>validarContato(pos,{...pos,status:'pendente',contatoEm:anterior.contatoEm,contatos:[{em:anterior.contatoEm,concluida:false,relatoAtendimento:'Contato anterior'}]},'Consultora fictícia',agora),/contato confirmado/i);
 const r=validarContato({...pos,confirmarContato:true,resultadoContato:'aprovou',relatoAtendimento:'Ouvi o retorno e confirmei a entrega sem pendências.'},{},'Consultora fictícia',agora);assert.equal(r.contatos[0].concluida,true);
 const legado={...pos,contatos:[]};const editado=validarContato({...pos,descricao:'Descrição corrigida'},legado,'Consultora fictícia',agora);assert.equal(editado.contatoEm,null);assert.deepEqual(editado.contatos,[]);
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
 const entregue={...venda,vendedorId:'v-ficticio',elegivelPosVenda:true,entregaRealEm:'2026-10-10T13:00:00Z'};
 assert.equal(contextoDaAcao(entrada,{...base,vendasCliente:[entregue]}).ordemId,venda.id);
 assert.throws(()=>contextoDaAcao(entrada,{...base,vendasCliente:[{...entregue,clienteId:'outro-ficticio'}]}),/cliente|acesso/i);
 assert.equal(contextoDaAcao({...entrada,tipoAcao:'acompanhamento'},{...base,vendasCliente:[venda]}).ordemId,venda.id);
});

test('vendedor original do pós-venda usa ID conhecido ou nome exato único, sem abreviação nem fallback de ID inválido',()=>{
 assert.equal(typeof relacionamento.vendedorOriginalPosVenda,'function');
 const catalogo=[{id:'v1',nome:'Ana Exemplo'},{id:'v2',nome:'Bia Exemplo'}],resolver=relacionamento.vendedorOriginalPosVenda;
 assert.equal(resolver({vendedorErpId:'v1',vendedor:'Bia Exemplo'},catalogo),'v1');assert.equal(resolver({vendedorId:'v2'},catalogo),'v2');assert.equal(resolver({vendedorNome:'Ána Exemplo'},catalogo),'v1');assert.equal(resolver({vendedor:'Ana'},catalogo),null);assert.equal(resolver({vendedorErpId:'inexistente',vendedor:'Ana Exemplo'},catalogo),null);assert.equal(resolver({vendedor:'Ana Exemplo'},[...catalogo,{id:'v3',nome:'Ana Exemplo'}]),null);
});


test('recusa exige motivo e outro exige observação; não encerra oportunidade por ausência de resposta',()=>{
 assert.throws(()=>validarContato({...acao,confirmarContato:true,resultadoContato:'recusou'},{},'Consultora fictícia',agora),/motivo/i);
 assert.throws(()=>validarContato({...acao,confirmarContato:true,resultadoContato:'recusou',motivoPerda:'outro'},{},'Consultora fictícia',agora),/explique/i);
 const recusou=validarContato({...acao,confirmarContato:true,resultadoContato:'recusou',motivoPerda:'outro',observacaoPerda:'Obra cancelada'},{},'Consultora fictícia',agora);
 assert.equal(recusou.motivoPerda,'outro');assert.equal(recusou.contatos[0].observacaoPerda,'Obra cancelada');assert.equal(recusou.status,undefined);
 const editada=validarContato({...acao,data:'2026-11-01'},recusou,'Consultora fictícia',agora);assert.equal(editada.motivoPerda,'outro');assert.equal(editada.observacaoPerda,'Obra cancelada');
 const tentativa=validarAcao({...acao,confirmarContato:true,resultadoContato:'nao_atendeu'},escopo,base,'Consultora fictícia',agora);assert.equal(tentativa.status,'pendente');
});
