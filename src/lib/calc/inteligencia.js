const valor = n => Number.isFinite(Number(n)) ? Number(n) : 0;
const nome = n => String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
export const ETAPAS_CRM = [{id:'proposta',nome:'Proposta enviada'},{id:'negociacao',nome:'Em negociação'},{id:'decisao',nome:'Aguardando decisão'}];
export function sugestaoVenda(o,hoje){
 if(o.situacao!=='aberto'&&!o.recall)return null;
 if(o.proximoToque&&o.proximoToque>hoje)return null;
 if(o.proximoToque&&o.proximoToque<hoje)return {ordem:0,motivo:'O retorno combinado venceu.',acao:'Retomar o contato e combinar o próximo passo'};
 if(o.proximoToque===hoje)return {ordem:1,motivo:'Existe retorno combinado para hoje.',acao:'Cumprir o retorno de hoje'};
 if(o.vencido)return {ordem:2,motivo:'A validade da proposta terminou.',acao:'Confirmar interesse e revisar a proposta'};
 if(o.recall)return {ordem:3,motivo:'Compra futura sem nova data.',acao:'Confirmar quando o cliente pretende comprar'};
 if(o.chamadoEm===hoje)return {ordem:4,motivo:'Contato registrado hoje, sem próximo passo.',acao:'Registrar o combinado; evitar novo contato repetido'};
 return {ordem:5,motivo:o.chamadoEm?'Já houve contato, mas falta uma próxima ação.':'Não há contato nem retorno registrados.',acao:o.chamadoEm?'Definir o próximo passo com o cliente':'Confirmar recebimento e entender o prazo de decisão'};
}
export function filaComercial(lista,hoje){
 const grupos=new Map();
 for(const o of lista||[]){
  const sugestao=sugestaoVenda(o,hoje);if(!sugestao)continue;
  const normal=nome(o.cliente);const chave=o.clienteId?`id:${o.clienteId}`:normal&&normal!=='cliente'?`nome:${normal}`:`orc:${o.id}`;
  const g=grupos.get(chave);
  if(!g)grupos.set(chave,{chave,cliente:o.cliente,valor:valor(o.valor),itens:[o],principal:o,...sugestao});
  else{g.valor+=valor(o.valor);g.itens.push(o);if(sugestao.ordem<g.ordem)Object.assign(g,sugestao,{principal:o});}
 }
 return [...grupos.values()].sort((a,b)=>a.ordem-b.ordem||b.valor-a.valor);
}
export function mesesDaDivida(titulos){
 const mapa=new Map();let semData=0;
 for(const t of titulos||[]){const mes=String(t.vencimento||'').slice(0,7);if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)){semData++;continue;}
 const m=mapa.get(mes)||{mes,valor:0,quantidade:0};m.valor+=valor(t.valor);m.quantidade++;mapa.set(mes,m);}
 return {meses:[...mapa.values()].sort((a,b)=>b.mes.localeCompare(a.mes)),semData};
}
export function sugestaoCobranca(c,hoje){
 const desfecho=(c.chamados||[]).find(x=>x.situacao);
 if(desfecho?.situacao==='pagou')return 'Conferir o comprovante e a baixa no ERP antes de cobrar novamente.';
 if(desfecho?.situacao==='contestou')return 'Conferir a contestação e os documentos antes de novo pedido de pagamento.';
 if(desfecho?.situacao==='prometeu'&&desfecho.promessa>=hoje)return `Acompanhar o pagamento combinado para ${desfecho.promessa.split('-').reverse().join('/')}.`;
 if(c.promessaVencida)return 'Conferir se entrou o pagamento; se não, retomar o combinado vencido.';
 if(c.semChamado)return 'Conferir títulos e contato; iniciar uma abordagem objetiva com o cliente.';
 if(desfecho?.situacao==='negociar')return 'Preparar uma proposta de negociação conforme as condições autorizadas pela direção.';
 return 'Revisar o último contato e registrar o próximo combinado.';
}
