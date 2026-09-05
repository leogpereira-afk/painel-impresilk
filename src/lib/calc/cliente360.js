// Identidade explícita: homônimos nunca são unidos por nome.
const id = x => String(x ?? '').trim();
export const documentoCliente = x => String(x ?? '').replace(/\D/g, '');
const documentoValido = x => /^(\d{11}|\d{14})$/.test(x);
const valor = x => Number.isFinite(Number(x)) ? Number(x) : 0;
const unico = lista => [...new Map(lista.filter(x => id(x.id)).map(x => [id(x.id), x])).values()];
export function fichaCliente360(alvo, dados = {}, cadastro = null, hoje = '') {
 const clienteId = id(alvo.clienteId);
 const confirmado = cadastro && clienteId && id(cadastro.id) === clienteId ? cadastro : null;
 const documento = documentoCliente(confirmado?.documento || alvo.cnpj);
 const temDocumento = documentoValido(documento);
 const combina = x => clienteId && id(x.clienteId) ? id(x.clienteId) === clienteId : temDocumento && documentoCliente(x.cnpj) === documento;
 const propostas = unico((dados.orcamentos || []).filter(x => clienteId ? id(x.clienteId) === clienteId : id(x.id) === id(alvo.id)))
   .sort((a,b) => String(b.dataEnvio || b.envio || '').localeCompare(String(a.dataEnvio || a.envio || '')));
 const ordens = unico((dados.ordens || []).filter(x => !x.cancelada && combina(x))).sort((a,b) => String(b.data).localeCompare(String(a.data)));
 const titulos = unico((dados.recebiveis || []).filter(combina));
 const vencidos = titulos.filter(x => /^\d{4}-\d{2}-\d{2}/.test(x.vencimento || '') && x.vencimento.slice(0,10) < hoje);
 const abertos = propostas.filter(x => x.situacao === 'aberto');
 const ganhos = propostas.filter(x => x.situacao === 'ganho');
 const perdidos = propostas.filter(x => x.situacao === 'perdido');
 const contatos = confirmado?.contatos?.length ? confirmado.contatos : unico(propostas.filter(x => x.celular || x.email).map(x => ({id:`${x.celular || ''}|${x.email || ''}`,nome:x.contatoNome || '',celular:x.celular || '',email:x.email || '',fonte:'Orçamento'})));
 return {clienteId,documento:temDocumento?documento:'',cadastro:confirmado,propostas,ordens,titulos,vencidos,contatos,abertos,ganhos,perdidos,
  valorAberto:abertos.reduce((s,x)=>s+valor(x.valor),0),valorGanho:ganhos.reduce((s,x)=>s+valor(x.valor),0),saldo:titulos.reduce((s,x)=>s+Math.max(0,valor(x.valor)),0),saldoVencido:vencidos.reduce((s,x)=>s+Math.max(0,valor(x.valor)),0),
  conversao:ganhos.length+perdidos.length?ganhos.length/(ganhos.length+perdidos.length):null,
  vinculoFinanceiro:temDocumento || titulos.some(x=>id(x.clienteId)===clienteId && clienteId),
  vinculoOrdens:temDocumento || ordens.some(x=>id(x.clienteId)===clienteId && clienteId)};
}
