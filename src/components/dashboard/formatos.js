export const moeda=v=>Number.isFinite(v)?(v/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'Não disponível';
export const numero=v=>Number.isFinite(v)?v.toLocaleString('pt-BR',{maximumFractionDigits:2}):'—';
export const porcentagem=v=>Number.isFinite(v)?`${numero(v)}%`:'—';
export const dataCurta=v=>/^\d{4}-\d{2}-\d{2}/.test(v||'')?v.slice(0,10).split('-').reverse().join('/'):'—';
export const nomeMes=v=>/^\d{4}-\d{2}$/.test(v||'')?`${v.slice(5)}/${v.slice(0,4)}`:String(v||'');
