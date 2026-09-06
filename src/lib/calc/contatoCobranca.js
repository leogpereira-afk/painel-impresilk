export function contatosFinanceiros(cliente){
 const ativos=(cliente?.contatos||[]).filter(c=>!['inativo','inativa','2','false'].includes(String(c.status||'').toLowerCase())&&(c.celular||c.email));
 const financeiros=ativos.filter(c=>c.financeiro);
 return financeiros.length?financeiros:ativos.length?ativos:[{id:'cadastro',nome:'Contato geral do cadastro',celular:cliente?.telefone||'',email:cliente?.email||''}].filter(c=>c.celular||c.email);
}
export function titulosPorDocumento(titulos){const vistos=new Set();return (titulos||[]).filter(t=>{const d=String(t.cnpj||'').replace(/\D/g,'');if(![11,14].includes(d.length)||vistos.has(d))return false;vistos.add(d);return true;});}
export function proximaConferencia(promessa,hoje){if(!/^\d{4}-\d{2}-\d{2}$/.test(promessa||'')||promessa<hoje)return hoje;const d=new Date(promessa+'T12:00:00Z');if(!Number.isFinite(d.getTime()))return hoje;d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);}
