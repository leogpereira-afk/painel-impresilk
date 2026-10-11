// Projeção de vencimentos: a agenda recebe só identidade, nome e data.
export function dataIncendioValida(data) {
 return typeof data==='string' && /^\d{4}-\d{2}-\d{2}$/.test(data) && !data.startsWith('0000') &&
 Number.isFinite(Date.parse(data+'T00:00:00Z')) && new Date(data+'T00:00:00Z').toISOString().slice(0,10)===data;
}
export const CATEGORIAS_INCENDIO=['Extintor','AVCB','Iluminação de emergência','Sinalização de segurança'];
export function vencimentosIncendio(itens,mes) {
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes))return [];
 return itens.filter(i=>i.tipo==='predial'&&CATEGORIAS_INCENDIO.includes(i.categoria)&&i.situacao!=='baixado'&&i.especificacao?.situacao!=='baixado'&&dataIncendioValida(i.validade)&&i.validade.startsWith(mes))
 .map(i=>({id:`incendio-${i.id}-${i.validade}`,ativoId:i.id,data:i.validade,titulo:`${['Extintor','AVCB'].includes(i.categoria)?'Vencimento':'Inspeção'} · ${i.categoria}${i.categoria==='AVCB'?'':' '+(i.numero||i.especificacao?.numero||'sem número')} · ${String(i.nome||'Cadastro pendente').slice(0,180)}`,tipo:'Prevenção contra incêndio',cor:'#d97706',categoria:i.categoria,origem:'patrimonio'}))
 .sort((a,b)=>a.data.localeCompare(b.data)||a.id.localeCompare(b.id));
}
