// O endereço identifica a ferramenta; seus filtros ficam na própria query.
// As permissões continuam sendo as dos módulos originais, inclusive no servidor.
export const SECOES_COMERCIAIS = Object.freeze([
  {id:'visao-geral',nome:'Visão geral',caminho:'/comercial',modulo:'orcamentos',icone:'visao'},
  {id:'compromissos',nome:'Compromissos',caminho:'/comercial/compromissos',modulo:'compromissos',icone:'compromissos'},
  {id:'bancos',nome:'Bancos e Pix',caminho:'/comercial/bancos',modulo:'bancos',icone:'bancos'},
  {id:'glossario',nome:'Glossário',caminho:'/comercial/glossario',modulos:['glossario','orcamentos'],icone:'glossario'},
  {id:'contas-atrasadas',nome:'Contas atrasadas',caminho:'/comercial/contas-atrasadas',modulo:'contas-atrasadas',icone:'contas'},
  // Brief sempre teve entrada para toda sessão e autenticação própria.
  {id:'brief',nome:'Brief',caminho:'/comercial/brief',modulo:null,icone:'brief'},
  {id:'dashboard',nome:'Dashboard',caminho:'/comercial/dashboard',modulo:'orcamentos',icone:'dashboard'},
]);

export function secoesComerciais(pode) {
  return SECOES_COMERCIAIS.filter(s=>s.modulos?s.modulos.some(pode):!s.modulo||pode(s.modulo));
}

export function destinoCentralComercial(pode) {
  return secoesComerciais(pode)[0]?.caminho||null;
}

export function secaoComercialAtual(pathname='') {
  const path=pathname.replace(/\/$/,'');
  return SECOES_COMERCIAIS.find(s=>s.caminho===path)||null;
}

export function ehRotaComercial(pathname='') {
  return pathname==='/comercial'||pathname.startsWith('/comercial/')||pathname==='/orcamentos'||pathname.startsWith('/orcamentos/');
}

export function redirecionarComercial(pathname,search='',hash='') {
  const migrada=destinoComercialLegado(pathname,search,hash);
  if(migrada)return migrada;
  const id={'/orcamentos':'visao-geral','/compromissos':'compromissos','/bancos':'bancos','/glossario':'glossario','/contas-atrasadas':'contas-atrasadas','/brief':'brief'}[pathname];
  const caminho=SECOES_COMERCIAIS.find(s=>s.id===id)?.caminho||'/comercial';
  return `${caminho}${search.startsWith('?')?search:''}${hash.startsWith('#')?hash:''}`;
}

// Migra só as seções que mudaram de lugar. Os outros parâmetros, incluindo
// filtros e referências de ações, continuam no endereço, e o estado do Router
// é preservado pelo componente que realiza o redirecionamento.
export function destinoComercialLegado(pathname,search='',hash='') {
  const caminho=pathname.replace(/\/$/,'');
  if(!['/comercial','/orcamentos','/comercial/resultados','/comercial/solucoes'].includes(caminho))return null;
  const params=new URLSearchParams(search);
  const aba=params.get('aba')||caminho.split('/').at(-1);
  const destinos={vendas:['dashboard','vendas'],resultados:['dashboard','vendas'],metas:['dashboard','metas'],produtos:['glossario','solucoes'],solucoes:['glossario','solucoes']};
  const destino=destinos[aba];
  if(!destino)return null;
  params.delete('aba');
  params.set(destino[0]==='dashboard'?'analise':'secao',destino[1]);
  if(destino[0]==='dashboard'&&(params.has('de')||params.has('ate'))&&!params.has('modo'))params.set('modo','personalizado');
  return `/comercial/${destino[0]}?${params.toString()}${hash.startsWith('#')?hash:''}`;
}

export function secoesGlossario(pode) {
  return [
    {id:'termos',nome:'Termos e conceitos',modulo:'glossario'},
    {id:'solucoes',nome:'Soluções comerciais',modulo:'orcamentos'},
  ].filter(s=>pode(s.modulo));
}

export function destinoSecaoComercial(secao,memoria={}) {
  const anterior=memoria[secao.id]||{};
  const busca=typeof anterior.search==='string'&&anterior.search.startsWith('?')?anterior.search:'';
  const hash=typeof anterior.hash==='string'&&anterior.hash.startsWith('#')?anterior.hash:'';
  return `${secao.caminho}${busca}${hash}`;
}
