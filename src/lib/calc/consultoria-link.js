// O segredo permanece no fragmento: não é enviado ao servidor de arquivos.
export function linkConsultoria(token,{origin,base='/',pathname='',review=false}) {
 const raiz=new URL(base,origin);
 return review&&pathname.endsWith('/revisao-local.html')
  ?new URL('revisao-local.html',raiz).href+'#/colaborar?convite='+encodeURIComponent(token)
  :new URL('colaborar',raiz).href+'#convite='+encodeURIComponent(token);
}
export function tokenConsultoria(hash,review=false) {
 const fragmento=hash.startsWith('#convite=')?hash.slice(1):review&&hash.startsWith('#/colaborar?')?hash.slice(hash.indexOf('?')+1):'';
 return new URLSearchParams(fragmento).get('convite')||'';
}
