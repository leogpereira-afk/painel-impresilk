// O endereço identifica a ferramenta; seus filtros ficam na própria query.
// As permissões continuam sendo as dos módulos originais, inclusive no servidor.
export const SECOES_COMERCIAIS = Object.freeze([
  {id:'visao-geral',nome:'Visão geral',caminho:'/comercial',modulo:'orcamentos',icone:'visao'},
  {id:'bancos',nome:'Bancos e Pix',caminho:'/comercial/bancos',modulo:'bancos',icone:'bancos'},
  {id:'glossario',nome:'Glossário',caminho:'/comercial/glossario',modulo:'glossario',icone:'glossario'},
  {id:'contas-atrasadas',nome:'Contas atrasadas',caminho:'/comercial/contas-atrasadas',modulo:'contas-atrasadas',icone:'contas'},
  // Brief sempre teve entrada para toda sessão e autenticação própria.
  {id:'brief',nome:'Brief',caminho:'/comercial/brief',modulo:null,icone:'brief'},
  {id:'dashboard',nome:'Dashboard',caminho:'/comercial/dashboard',modulo:'orcamentos',icone:'dashboard'},
]);

export function secoesComerciais(pode) {
  return SECOES_COMERCIAIS.filter(s=>!s.modulo||pode(s.modulo));
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
  const id={'/orcamentos':'visao-geral','/bancos':'bancos','/glossario':'glossario','/contas-atrasadas':'contas-atrasadas','/brief':'brief'}[pathname];
  const caminho=SECOES_COMERCIAIS.find(s=>s.id===id)?.caminho||'/comercial';
  return `${caminho}${search.startsWith('?')?search:''}${hash.startsWith('#')?hash:''}`;
}

export function destinoSecaoComercial(secao,memoria={}) {
  const anterior=memoria[secao.id]||{};
  const busca=typeof anterior.search==='string'&&anterior.search.startsWith('?')?anterior.search:'';
  const hash=typeof anterior.hash==='string'&&anterior.hash.startsWith('#')?anterior.hash:'';
  return `${secao.caminho}${busca}${hash}`;
}
