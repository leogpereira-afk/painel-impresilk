import {prepararConteudoManual,urlManual} from '../../../supabase/functions/_shared/manuais-maquinas.mjs';
import qrcode from '../vendor/qrcode-generator.mjs';

export function referenciaMaquina(item) {
  if(!item?.id)return null;
  return item.somenteBem||item.id.startsWith('bem:')?{tipo:'bem',id:item.bem?.id||item.id.slice(4)}:{tipo:'ativo',id:item.id};
}
export function manualDaMaquina(item,manuais=[]) {
  const ref=referenciaMaquina(item);
  if(!ref)return null;
  const encontrados=manuais.filter(m=>(m.referencias||[m.referencia]).some(r=>r?.tipo===ref.tipo&&r.id===ref.id));
  // Um conflito nunca escolhe silenciosamente uma das versões.
  if(encontrados.length>1)throw new Error('Há manuais conflitantes para esta máquina. Confira os vínculos.');
  return encontrados[0]||null;
}
export const conteudoManualVazio=()=>prepararConteudoManual({});
export function urlManualSegura(url) {try{return urlManual(url);}catch{return '';}}
export function pendenciasManual(c={}) {
  const p=[];
  if(!c.identificacaoConfirmada)p.push('Confirmar a identificação na máquina');
  if(!c.fabricante?.trim())p.push('Informar o fabricante');
  if(!c.modelo?.trim())p.push('Informar o modelo exato');
  if(!c.seguranca?.trim())p.push('Conferir as orientações de segurança');
  if(!c.operacao?.trim())p.push('Documentar a operação');
  if(!c.responsavelId)p.push('Selecionar o responsável no RH');
  if(!c.revisarEm)p.push('Definir a próxima revisão');
  if(!(c.fontes||[]).some(f=>f.titulo&&urlManualSegura(f.url)&&f.situacao==='verificado'&&f.conferidoEm&&f.modelo?.trim().toLocaleLowerCase('pt-BR')===c.modelo?.trim().toLocaleLowerCase('pt-BR')))p.push('Conferir uma fonte para o modelo informado');
  return p;
}
export function caminhoManualMaquina(item) {
  return `/patrimonio?${new URLSearchParams({aba:'maquinas',manual:item?.id||'1'})}`;
}
export function enderecoManualMaquina(item) {
  // Nunca inclui crachá, parâmetros da sessão ou endereço local da prévia.
  return `https://leogpereira-afk.github.io/painel-impresilk${caminhoManualMaquina(item)}`;
}
export function qrManualDataUrl(item) {
  if(!item?.id)return '';
  const qr=qrcode(0,'M');qr.addData(enderecoManualMaquina(item));qr.make();
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr.createSvgTag({cellSize:4,margin:16,scalable:true}))}`;
}
