// Exemplos fictícios para validar a agenda. Escritas ficam apenas na memória da prévia.
const dia = deslocamento => { const d=new Date(); d.setDate(d.getDate()+deslocamento); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
export const pessoasAgenda = [{usuario:'demo',nome:'Conta de demonstração'},{usuario:'ana-exemplo',nome:'Ana Exemplo'},{usuario:'bruno-exemplo',nome:'Bruno Exemplo'}];
const base = [
 ['fachada','Confirmar instalação da fachada','instalacao','Mercado do Sol',-4,'09:00','ana-exemplo','Cliente aguarda confirmação da equipe e do material.'],
 ['proposta','Retornar a proposta de sinalização interna','retorno','Clínica Azul',-2,'14:00','demo','Conferir as duas opções de acabamento antes de ligar.'],
 ['arte','Aprovar a arte do painel da recepção','documento','Hotel Horizonte',-1,'11:00','bruno-exemplo','Enviar a versão revisada.'],
 ['medicao','Medir a fachada e conferir o ponto de energia','medicao','Loja Jardim',0,'08:30','ana-exemplo','Levar trena e registrar as medidas.'],
 ['visita','Apresentar materiais para a nova unidade','visita','Café da Praça',0,'15:00','demo','Levar amostras de ACM e adesivo.'],
 ['entrega','Combinar retirada das placas de identificação','entrega','Studio Norte',1,'10:00','bruno-exemplo','Cliente retira na empresa.'],
 ['retorno','Revisar escopo e prazo com o cliente','retorno','Mercado do Sol',4,'16:00','ana-exemplo',''],
 ['pendente','Conferir documentos para liberar o pedido','documento','Escola Caminhos',null,'','demo','Aguardando os dados da unidade.'],
 ['resolvido','Confirmar o recebimento dos adesivos','entrega','Loja Jardim',-3,'10:00','demo',''],
 ['feito','Conferir medidas do letreiro','medicao','Studio Norte',-5,'09:00','ana-exemplo',''],
];
const mapa=Object.fromEntries(base.map(([id,titulo,tipo,cliente,dias,hora,dono,obs]) => [id,{titulo,tipo,cliente,data:dias===null?'':dia(dias),hora,dono,donoNome:pessoasAgenda.find(p=>p.usuario===dono).nome,obs,telefone:id==='fachada'?'(38) 99999-0000':'',feito:['resolvido','feito'].includes(id),feitoEm:dia(-1)+'T15:00:00-03:00',historico:[{tipo:'criou',quem:dono,quemNome:pessoasAgenda.find(p=>p.usuario===dono).nome,em:dia(-5)+'T09:00:00-03:00'},{tipo:'recado',quem:dono,quemNome:pessoasAgenda.find(p=>p.usuario===dono).nome,em:dia(dias===-4?-4:-1)+'T15:00:00-03:00',texto:id==='fachada'?'Material pronto. Falta alinhar a instalação.':'Próximo passo registrado para acompanhamento.'}]}]));
export function respostaAgenda(corpo) {
 const {action,id}=corpo;
 if(action==='get')return {valor:structuredClone(mapa)};
 if(action==='merge') {
  for(const [chave,patch] of Object.entries(corpo.patch||{})) {
   const anterior=mapa[chave];
   mapa[chave]={dono:'demo',donoNome:'Conta de demonstração',...anterior,...patch};
   if(patch.dono)mapa[chave].donoNome=pessoasAgenda.find(p=>p.usuario===patch.dono)?.nome||patch.dono;
   const tipo=!anterior?'criou':patch.dono?'passou':'feito' in patch?(patch.feito?'concluiu':'reabriu'):null;
   if(tipo)mapa[chave].historico=[...(anterior?.historico||[]),{tipo,quem:'demo',quemNome:'Conta de demonstração',em:new Date().toISOString(),texto:patch.recado||'',para:patch.dono,paraNome:mapa[chave].donoNome}];
  }
  return {valor:structuredClone(mapa)};
 }
 if(action==='removerId'){delete mapa[id];return {};}
 if(action==='evento'&&corpo.base64)return {erro:'Anexos não são gravados nesta demonstração local.'};
 if(action==='evento'&&mapa[id]){
  mapa[id].historico.push({tipo:'recado',quem:'demo',quemNome:'Conta de demonstração',em:new Date().toISOString(),texto:corpo.texto});
  return {valor:structuredClone(mapa)};
 }
 return {erro:'Ação não disponível nesta demonstração.'};
}
