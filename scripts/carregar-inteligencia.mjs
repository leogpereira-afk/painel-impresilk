import {pathToFileURL} from 'node:url';
import {FONTES,janelaConsulta} from '../supabase/functions/_shared/inteligencia-importacao.mjs';
const esperar=ms=>new Promise(r=>setTimeout(r,ms));

// Uma etapa só confirma sucesso depois que o servidor devolve o estado persistido.
export async function carregarInteligencia({desde,ate,corte,call,pausa=esperar,log=()=>{},maxEtapas=1500}){
 const igual=j=>j&&j.desde===desde&&j.ate===ate&&(j.corte??j.ate)===corte;
 let j=(await call({action:'status'})).carga;
 if(j&&j.situacao!=='concluida'&&!igual(j))throw Error('Há outra carga em andamento; preserve e conclua esse período primeiro.');
 let inicio=igual(j)?FONTES.indexOf(j.fonte):0;
 if(inicio<0)throw Error('Fonte do estado não reconhecida.');
 if(igual(j)&&j.situacao==='concluida')inicio++;
 for(let i=inicio;i<FONTES.length;i++){
  const fonte=FONTES[i];
  if(!igual(j)||j.fonte!==fonte){
   try{j=(await call({action:'iniciar',fonte,desde,ate})).carga;}
   catch{j=(await call({action:'status'})).carga;if(!igual(j)||j.fonte!==fonte)throw Error('Início não confirmado; nenhuma carga foi reiniciada.');}
  }
  if(!igual(j)||j.fonte!==fonte)throw Error('A carga mudou durante a execução.');
  let falhas=0,etapas=0;
  while(j.situacao!=='concluida'){
   if(++etapas>maxEtapas)throw Error('Limite de etapas atingido; cursor preservado para retomada.');
   await pausa(5000);
   try{
    const r=await call({action:'avancar'});
    if(!r.carga)throw Error('Etapa sem confirmação.');
    j=r.carga;falhas=0;
   }catch{
    if(++falhas>3)throw Error('Carga interrompida após tentativas; cursor e última carga completa preservados.');
    await pausa(30000);
    j=(await call({action:'status'})).carga;
   }
   if(!igual(j)||j.fonte!==fonte)throw Error('A carga mudou durante a execução.');
   log({fonte,situacao:j.situacao,paginas:j.paginas??0,consultados:j.consultados??0});
  }
 }
 return {concluida:true,desde,ate,corte};
}

async function main(){
 const hoje=new Date(Date.now()-3*3600000).toISOString().slice(0,10);
 const mes=process.env.INTEL_MES||hoje.slice(0,7);
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes))throw Error('Mês inválido: use AAAA-MM.');
 const desde=mes+'-01',ate=new Date(Date.UTC(Number(mes.slice(0,4)),Number(mes.slice(5)),0)).toISOString().slice(0,10);
 const {corte}=janelaConsulta(desde,ate);
 const token=process.env.PAINEL_TOKEN;if(!token)throw Error('Credencial de carga indisponível.');
 const call=async body=>{
  const r=await fetch('https://heveemylixartyijxewh.supabase.co/functions/v1/painel-inteligencia',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','x-token':token},body:JSON.stringify(body),signal:AbortSignal.timeout(130000)});
  if(!r.ok)throw Error(`Etapa HTTP ${r.status}.`);
  const data=await r.json();if(data.erro)throw Error('Etapa não confirmada.');return data;
 };
 const r=await carregarInteligencia({desde,ate,corte,call,log:d=>console.log(JSON.stringify(d))});
 console.log(JSON.stringify(r));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
