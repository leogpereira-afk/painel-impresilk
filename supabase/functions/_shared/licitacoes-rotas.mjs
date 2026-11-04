import {UUID,objeto,texto,dataDocumento} from './documentos.mjs';
import {urlCadastro} from './licitacoes-cadastros.mjs';
import {MUNICIPIOS} from './licitacoes-controle.mjs';

// Endereço comercial publicado em https://impresilk.com.br/ (contato).
// A origem integra a identidade: futuras mudanças não sobrescrevem medições antigas.
export const ORIGEM_IMPRESILK='Av. Feliciano Martins de Freitas, 127, Vila Regina, Montes Claros - MG, Brasil';
export const CAMPOS_ROTA=['municipio','distanciaKm','tempoMinutos','consultadoEm','fonteUrl','observacao'];
export const falhaRota=(mensagem,status=422)=>{throw Object.assign(new Error(mensagem),{status});};
const cidades=new Set(MUNICIPIOS);
export function diaBrasiliaRota(agora=new Date()){
 return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(agora);
}
export function prepararRota(item,hoje=diaBrasiliaRota()){
 objeto(item);
 if(Object.keys(item).some(k=>!['id',...CAMPOS_ROTA].includes(k)))falhaRota('Campo não editável na rota. Origem, autoria e histórico pertencem ao servidor.');
 if(Object.hasOwn(item,'id')&&(typeof item.id!=='string'||!UUID.test(item.id)))falhaRota('Identificador da rota inválido.');
 if(typeof item.municipio!=='string'||!cidades.has(item.municipio))falhaRota('Selecione um dos 89 municípios do Norte de Minas.');
 if(typeof item.distanciaKm!=='number'||!Number.isFinite(item.distanciaKm)||item.distanciaKm<0||item.distanciaKm>3000)falhaRota('Informe a distância em quilômetros, de 0 a 3.000.');
 if(!Number.isSafeInteger(item.tempoMinutos)||item.tempoMinutos<0||item.tempoMinutos>4320)falhaRota('Informe o tempo inteiro em minutos, de 0 a 4.320.');
 const consultadoEm=dataDocumento(item.consultadoEm,'Data da consulta');
 if(!consultadoEm||consultadoEm>hoje)falhaRota('Informe uma data de consulta válida, até hoje.');
 return {municipio:item.municipio,distanciaKm:item.distanciaKm,tempoMinutos:item.tempoMinutos,consultadoEm,fonteUrl:urlCadastro(item.fonteUrl,'Fonte da consulta',true),observacao:texto(item.observacao,'Observação',2000)};
}
export async function idRotaLicitacoes(municipio){
 if(!cidades.has(municipio))falhaRota('Município inválido.');
 const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(['licitacoes-rota-v1',ORIGEM_IMPRESILK,municipio]))));
 bytes[6]=(bytes[6]&15)|0x80;bytes[8]=(bytes[8]&63)|0x80;
 const hex=[...bytes.slice(0,16)].map(x=>x.toString(16).padStart(2,'0')).join('');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export function snapshotRota(r){return Object.fromEntries(CAMPOS_ROTA.filter(k=>Object.hasOwn(r||{},k)).map(k=>[k,r[k]]));}
export function rotaPublica(id,r){return {id,...snapshotRota(r),origem:ORIGEM_IMPRESILK,...Object.fromEntries(['criadoEm','criadoPor','atualizadoEm','atualizadoPor'].filter(k=>Object.hasOwn(r,k)).map(k=>[k,r[k]])),historico:(Array.isArray(r.historico)?r.historico:[]).map(h=>({id:h.id,em:h.em,por:h.por,acao:h.acao,antes:h.antes?snapshotRota(h.antes):null,depois:snapshotRota(h.depois)}))};}
