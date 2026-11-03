import {normalizarBusca} from './licitacoes-pesquisa.mjs';

// Agrupamento visual do texto recebido. Não declara aderência ao portfólio,
// classificação, capacidade técnica ou existência de serviços não pesquisados.
const CATEGORIAS=Object.freeze([
  {id:'letras',nome:'Letras e totens',icone:'letras',regra:/\b(letras? caixa|letreiros?|totens?|totem)\b/},
  {id:'adesivos',nome:'Adesivos e envelopamento',icone:'adesivos',regra:/\b(adesiv\w*|envelopamento\w*)\b/},
  {id:'sinalizacao',nome:'Placas e sinalização',icone:'sinalizacao',regra:/\b(placas?|sinalizacao|sinalizacoes)\b/},
  {id:'lonas',nome:'Lonas e banners',icone:'lonas',regra:/\b(lonas?|banners?|faixas?)\b/},
  {id:'acm',nome:'ACM',icone:'acm',regra:/\bacm\b/},
  {id:'impressao',nome:'Impressão e displays',icone:'impressao',regra:/\b(impressao|impressoes|displays?)\b/},
]);
const OUTROS=Object.freeze({id:'outros',nome:'Outros itens informados',icone:'outros'});
const SEM_PRODUTO=Object.freeze({id:'a-conferir',nome:'Serviço a conferir',icone:'outros'});
const identidade=valor=>String(valor??'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');

export function categoriaDoServico(produto) {
  const texto=normalizarBusca(produto);
  const categoria=texto?CATEGORIAS.find(item=>item.regra.test(texto))||OUTROS:SEM_PRODUTO;
  return {id:categoria.id,nome:categoria.nome,icone:categoria.icone};
}

export function resumirProduto(produto,limite=110) {
  const texto=String(produto||'Serviço a conferir').trim().replace(/\s+/g,' ');
  if(texto.length<=limite)return texto;
  const trecho=texto.slice(0,limite-1),ultimoEspaco=trecho.lastIndexOf(' ');
  return (ultimoEspaco>limite*.65?trecho.slice(0,ultimoEspaco):trecho).trimEnd()+'…';
}

export function contarServicos(itens=[]) {
  const processos=new Set();let semProcesso=0;
  for(const item of itens){
    const orgao=identidade(item.orgao),processo=identidade(item.processo);
    if(orgao&&processo)processos.add(JSON.stringify([orgao,processo]));
    else semProcesso++;
  }
  return {itens:itens.length,processos:processos.size,semProcesso};
}

export function categoriasDosServicos(itens=[]) {
  const presentes=new Map();
  for(const item of itens){
    const categoria=categoriaDoServico(item.produto);
    if(!presentes.has(categoria.id))presentes.set(categoria.id,{...categoria,itens:[]});
    presentes.get(categoria.id).itens.push(item);
  }
  const ordem=[...CATEGORIAS.map(item=>item.id),OUTROS.id,SEM_PRODUTO.id];
  return [...presentes.values()].sort((a,b)=>ordem.indexOf(a.id)-ordem.indexOf(b.id)).map(({itens,...categoria})=>({...categoria,...contarServicos(itens)}));
}

export function filtrarServicos(itens=[],{categoria='',busca=''}={}) {
  const termos=normalizarBusca(busca).split(' ').filter(Boolean);
  return itens.filter(item=>{
    if(categoria&&categoriaDoServico(item.produto).id!==categoria)return false;
    const texto=normalizarBusca([item.id,item.processo,item.orgao,item.produto,item.item,item.lote,...(item.municipiosAbrangidos||[]),...(item.localExecucaoRegistrado?.municipios||[]),...(item.motivos||[])].filter(Boolean).join(' '));
    return termos.every(termo=>texto.includes(termo));
  });
}
