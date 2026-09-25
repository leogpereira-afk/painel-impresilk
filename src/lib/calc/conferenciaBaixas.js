// A conferência é válida somente para os valores que a pessoa conferiu.
export const MOTIVOS_BAIXA = ['Desconto confirmado', 'Arredondamento confirmado', 'Retenção confirmada', 'Ajuste confirmado no ERP', 'Outro motivo'];
export const chaveBaixa = l => `conferencia-baixa:${l.numero}`;
export const assinaturaBaixa = l => JSON.stringify([String(l.numero),l.cliente,...[l.valor,l.recebido,l.diferenca].map(v=>Math.round(Number(v)*100))]);
export const baixaConferida = (l, registro) => registro?.conferenciaBaixa?.assinatura === assinaturaBaixa(l) && registro.conferenciaBaixa.status === 'conferida';
export function prepararConferencia(l,motivo,nota){
  if(!MOTIVOS_BAIXA.includes(motivo))throw Error('Escolha o motivo da diferença.');
  if(!String(nota||'').trim())throw Error('Informe como você confirmou a diferença.');
  if(![l.valor,l.recebido,l.diferenca].every(Number.isFinite)||l.diferenca<=0)throw Error('Os valores precisam ser conferidos novamente.');
  return {conferenciaBaixa:{status:'conferida',assinatura:assinaturaBaixa(l),motivo,nota:String(nota).trim(),numero:String(l.numero),cliente:l.cliente,valor:l.valor,recebido:l.recebido,diferenca:l.diferenca}};
}
