import rolandSg540 from '../assets/manuais/roland-sg540-recorte.png';
import boxerMigflex250 from '../assets/manuais/boxer-migflex250-referencia.webp';
import schulzSrp3010 from '../assets/manuais/schulz-srp3010-iii-referencia.jpg';
import {urlManualSegura} from './calc/manuais-maquinas.js';

// Referências públicas identificadas. Não há associação por nome: só a URL
// exata confirmada no manual escolhe um arquivo local, tratado ou original.
const RECORTES = new Map([
  ['https://image.rolanddga.com/-/media/roland/images/support/product_shots/sg540.jpg?rev=86ec3754662e4da9a85d530d523efdb8&hash=97EDD9A3DE121811D0B4D0BA85D4CFE6', {url:rolandSg540,tratada:true,local:true}],
  ['https://boxersoldas.com.br/wp-content/uploads/2025/12/FRENTE-MIGFLEX-250.webp', {url:boxerMigflex250,tratada:false,local:true,rotulo:'Referência do fabricante'}],
  ['https://www.schulz.com.br/cnp/970.3140-0_1.jpg', {url:schulzSrp3010,tratada:false,local:true,rotulo:'Referência do fabricante'}],
]);

export function fotoReferenciaManual(foto) {
  const original=foto?.usoConfirmado?urlManualSegura(foto.url):'';
  if(!original)return {url:'',tratada:false};
  const recorte=RECORTES.get(foto.url);
  return recorte?{...recorte}:{url:original,tratada:false};
}

// URLs assinadas da galeria são transitórias e nunca entram no conteúdo salvo.
function urlFotoPatrimonio(valor) {
  try {const u=new URL(valor);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}
}

export function galeriaFotosManual(foto, patrimonio=[]) {
  const referencia=fotoReferenciaManual(foto);
  const principal=referencia.url?[{...referencia,tipo:'referencia',fonteUrl:urlManualSegura(foto?.fonteUrl),legenda:referencia.tratada?'Referência visual · imagem tratada':referencia.rotulo||foto?.legenda||'Imagem de referência'}]:[];
  const reais=patrimonio.flatMap(f=>{const url=urlFotoPatrimonio(f.url);return url?[{url,tipo:'inventario',tratada:false,legenda:'Foto do patrimônio',fonteUrl:''}]:[];});
  const ordenadas=foto?.principal==='referencia'?[...principal,...reais]:[...reais,...principal];
  return ordenadas.filter((f,n)=>ordenadas.findIndex(o=>o.url===f.url)===n);
}
