import {dataValida} from '../../../supabase/functions/_shared/reunioes.mjs';
const dia=s=>dataValida(s)?Date.parse(s+'T00:00:00Z')/86400000:null;
export function painelEtapas(etapas,hoje){
 const hojeN=dia(hoje),linhas=etapas.map(e=>{
  const inicio=dia(e.inicioReal),fim=dia(e.fimReal),prazo=dia(e.prazo),fechada=['validacao','concluida'].includes(e.situacao);
  const progresso=fechada?100:Math.max(0,Math.min(100,Number(e.progresso)||0));
  return {...e,progresso,pronta:fechada,dias:inicio===null||!fim&&fechada?null:Math.max(0,(fim??hojeN)-inicio+1),atraso:prazo===null||fechada&&fim===null?null:Math.max(0,(fim??hojeN)-prazo)};
 });
 const concluidas=linhas.filter(e=>e.situacao==='concluida').length,prontas=linhas.filter(e=>e.pronta).length,medidas=linhas.filter(e=>e.pronta&&e.dias!==null);
 const datas=linhas.flatMap(e=>[dia(e.inicioPrevisto),dia(e.prazo),dia(e.inicioReal),dia(e.fimReal)]).filter(x=>x!==null);
 const min=Math.min(hojeN,...datas),max=Math.max(hojeN,...datas),amplitude=Math.max(1,max-min);
 const barra=(inicio,fim)=>{const a=dia(inicio),b=dia(fim);if(a===null&&b===null)return null;const ini=a??b,fin=Math.max(ini,b??hojeN);const left=Math.min(99,100*(ini-min)/amplitude);return {left,width:Math.min(100-left,Math.max(1,100*(fin-ini)/amplitude))};};
 const notas=etapas.map(e=>e.avaliacoes?.at(-1)?.pontuacao).filter(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=10);
 return {avaliadas:notas.length,mediaQualidade:notas.length?Math.round(notas.reduce((a,b)=>a+b,0)/notas.length*10)/10:null,precisamMelhorar:notas.filter(n=>n<6).length,total:linhas.length,prontas,concluidas,progresso:linhas.length?Math.round(linhas.reduce((s,e)=>s+e.progresso,0)/linhas.length):0,atrasadas:linhas.filter(e=>!e.pronta&&e.atraso>0).length,mediaDias:medidas.length?Math.round(medidas.reduce((s,e)=>s+e.dias,0)/medidas.length*10)/10:null,medidas:medidas.length,inicio:new Date(min*86400000).toISOString().slice(0,10),fim:new Date(max*86400000).toISOString().slice(0,10),linhas:linhas.map(e=>({...e,previsto:barra(e.inicioPrevisto,e.prazo),real:barra(e.inicioReal,e.fimReal||(!e.pronta?hoje:''))}))};
}
