import {RESULTADOS_CONTATO} from './relacionamento-comercial.mjs';
// Apenas campos comerciais autorizados. O registro sincronizado nunca passa
// inteiro pelo detalhe: metadados futuros não ampliam esta porta sozinhos.
export function projetarVendaCliente(o) {
 const itens=Array.isArray(o.itens)?o.itens.map((i)=>Object.fromEntries(['id','produtoId','produto','categoriaId','categoria','quantidade','unidade','valor','valorUnitario','subtotal','desconto'].filter(k=>Object.hasOwn(i,k)).map(k=>[k,i[k]]))):[];
 return {id:String(o.id),numero:o.numero||'',data:o.data,clienteId:String(o.clienteId||''),cliente:o.cliente||'',trabalho:itens.map((i)=>i.produto).filter(Boolean).slice(0,3).join(' · '),valor:o.valorConfirmado===false?null:o.valor??null,valorBruto:o.valorBruto??o.bruto??null,desconto:o.desconto??null,valorConfirmado:o.valorConfirmado!==false&&o.valor!=null,itens,itensDisponiveis:Array.isArray(o.itens),vendedorId:o.vendedorErpId||o.vendedorId||null,vendedorNome:o.vendedorNome||o.vendedor||'',tipo:o.tipo||null,cancelada:o.cancelada===true,atualizadoEm:o.atualizado_em||null,entregaRealEm:o.entregaRealEm||null,elegivelPosVenda:o.elegivelPosVenda===true,operacao:o.operacao||null};
}
const projetarInteracaoPosVenda=(c)=>c?Object.fromEntries(['em','autor','resultadoContato','resultado','relatoAtendimento','nota'].map(k=>[k,c[k]??null])):null;
export function pedidosPosVendaPendentes(vendas,acoes,{incluirConcluidos=false}={}) {
 const elegiveis=vendas.filter(o=>o.elegivelPosVenda===true&&o.entregaRealEm).sort((a,b)=>String(b.entregaRealEm).localeCompare(String(a.entregaRealEm))||String(a.id).localeCompare(String(b.id))),pedidos=[];
 let pendentesNaPagina=0,concluidosNaPagina=0;
 for(const o of elegiveis){
  const relacionadas=acoes.filter(a=>a.tipoAcao==='pos_venda'&&String(a.ordemId)===String(o.id)&&String(a.clienteId)===String(o.clienteId));
  const visiveis=relacionadas.filter(a=>!a.acaoOculta),vinculoAConferir=relacionadas.some(a=>a.vinculoPosVendaDivergente),posVendaBloqueado=relacionadas.some(a=>a.acaoOculta);
  const interacoes=visiveis.flatMap(a=>(Array.isArray(a.contatos)?a.contatos:[]).map((c,indice)=>({acao:a,contato:c,indice})).filter((x)=>x.contato&&typeof x.contato.em==='string'&&Number.isFinite(Date.parse(x.contato.em)))).sort((a,b)=>Date.parse(b.contato.em)-Date.parse(a.contato.em)||(a.acao.id===b.acao.id?b.indice-a.indice:String(a.acao.id).localeCompare(String(b.acao.id))));
  const ultima=interacoes[0]||null;
  const aberta=visiveis.filter(a=>a.status!=='concluida').sort((a,b)=>String(a.data).localeCompare(String(b.data))||String(a.id).localeCompare(String(b.id)))[0];
  const concluido=!vinculoAConferir&&!aberta&&ultima?.acao.status==='concluida'&&ultima.acao.contatoEm===ultima.contato.em&&ultima.contato.concluida===true&&Object.hasOwn(RESULTADOS_CONTATO,ultima.contato.resultadoContato)&&typeof ultima.contato.resultado==='string'&&!!ultima.contato.resultado.trim()&&typeof ultima.contato.relatoAtendimento==='string'&&!!ultima.contato.relatoAtendimento.trim();
  if(concluido)concluidosNaPagina++;else pendentesNaPagina++;
  if(concluido&&!incluirConcluidos)continue;
  const legadoConcluido=visiveis.some(a=>a.status==='concluida');
  const acao=aberta||ultima?.acao||visiveis.filter(a=>a.status==='concluida').sort((a,b)=>String(b.data).localeCompare(String(a.data))||String(a.id).localeCompare(String(b.id)))[0]||null;
  const ultimaInteracao=projetarInteracaoPosVenda(ultima?.contato);
  const acaoPosVenda=acao?{...Object.fromEntries(['id','tipoAcao','clienteId','cliente','vendedorId','vendedorNome','ordemId','ordemNumero','descricao','data','status','versao','fase','canal','prioridade','objetivo','resultado','contatoEm','relatoAtendimento'].map(k=>[k,acao[k]??null])),ultimaInteracao}:null;
  pedidos.push({...projetarVendaCliente(o),posVendaPendente:!concluido,posVendaEstado:vinculoAConferir?'a_conferir':aberta?'em_acompanhamento':concluido?'concluido':legadoConcluido?'a_conferir':'sem_acao',posVendaBloqueado,motivoPosVenda:vinculoAConferir?'Existe um vínculo de pós-venda que precisa ser conferido pela direção.':null,acaoPosVenda,ultimaInteracao,criterioPosVenda:'Entrega efetiva comprovada no PCP; conclusão exige contato confirmado com resultado e relato do atendimento.'});
 }
 return {pedidos,elegiveisNaPagina:elegiveis.length,pendentesNaPagina,concluidosNaPagina};
}
