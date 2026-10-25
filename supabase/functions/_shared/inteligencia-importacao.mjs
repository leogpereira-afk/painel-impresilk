export const FONTES=['nfe','compras','detalhes'];
export function validarPeriodo(desde,ate){
 const data=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 if(!data(desde)||!data(ate)||desde>ate||(Date.parse(ate)-Date.parse(desde))/86400000>92)throw new Error('Período inválido: máximo de 93 dias.');
}
export function direcaoAutorizada(s,agora=Date.now()){return s?.master===true&&typeof s.sub==='string'&&!!s.sub.trim()&&Number.isFinite(s.exp)&&s.exp>Math.floor(agora/1000);}
export function incorporarPagina(job,bruto,normalizar){
 const a=Array.isArray(bruto)?bruto:Array.isArray(bruto?.data)?bruto.data:Array.isArray(bruto?.dados)?bruto.dados:null;
 if(!a)throw new Error('Formato da resposta não reconhecido.');
 const page=job.pagina||1,p=bruto?.pagination||bruto?.meta||(bruto?.current_page!=null?bruto:null);
 let ultima=job.ultima??null,total=job.total??null;
 if(p){
  const atual=Number(p.current_page),fim=Number(p.last_page);
  if(atual!==page||!Number.isInteger(fim)||fim<page||fim>100)throw new Error('Paginação inconsistente.');
  if(ultima!==null&&ultima!==fim)throw new Error('Paginação mudou durante a consulta.');ultima=fim;
  if(p.total!=null){const t=Number(p.total);if(!Number.isInteger(t)||t<0||(total!==null&&total!==t))throw new Error('Contagem mudou durante a consulta.');total=t;}
 }
 const itens=[...(job.itens||[])],ids=new Set(itens.map(i=>String(i.id)));
 for(const item of a){const n=normalizar(item);if(!n.id||ids.has(n.id))throw new Error('Identificador ausente ou repetido.');ids.add(n.id);itens.push(n);}
 const pronto=p?page===ultima:a.length<500;
 if(!pronto&&!a.length)throw new Error('Página intermediária vazia.');
 if(!pronto&&page>=100)throw new Error('Limite de páginas atingido.');
 if(pronto&&total!==null&&itens.length!==total)throw new Error('Faltam registros para fechar a contagem.');
 return {...job,itens,pagina:page+1,paginas:page,ultima,total,pronto};
}
export function snapshot(job,em){return {versao:1,completo:true,em,desde:job.desde,ate:job.ate,corte:job.corte??job.ate,paginas:job.paginas||0,total:job.itens.length,consultados:job.itens.length,escopo:job.fonte==='detalhes'?'O.S. cadastradas no período e O.S. vinculadas às NF-e desse período':'Emissão de notas no período',itens:job.itens};}
export function mesclarListaDetalhes(job,lista){
 if(!lista.pronto)throw new Error('Lista de O.S. ainda incompleta.');
 const mapa=new Map((job.itens||[]).map(o=>[o.id,o]));
 for(const o of lista.itens)mapa.set(o.id,o);
 const ids=[...new Set([...(job.ids||[]),...lista.itens.map(o=>o.id)])].sort();
 // Coloca primeiro os já consultados: o cursor continua sendo itens.length.
 const prontos=ids.filter(id=>mapa.has(id)),pendentes=ids.filter(id=>!mapa.has(id));
 return {...job,listaConferida:true,lista:undefined,ids:[...prontos,...pendentes],total:ids.length,itens:prontos.map(id=>mapa.get(id)),pronto:pendentes.length===0};
}


export function janelaConsulta(desde,ate,agora=new Date()){
 validarPeriodo(desde,ate);
 const hoje=new Date(agora.getTime()-3*3600000).toISOString().slice(0,10);
 if(desde>hoje)throw new Error("O período ainda não começou.");
 const corte=ate<hoje?ate:hoje;
 const fim=new Date(corte+"T00:00:00Z");fim.setUTCDate(fim.getUTCDate()+1);
 return {corte,datainicial:desde,datafinal:fim.toISOString().slice(0,10)};
}
