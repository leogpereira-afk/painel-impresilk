import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gerarRelatorio,validarDossiePublico} from '../../supabase/functions/_shared/licitacoes-controle.mjs';
import {coletarPropostasPNCP,integrarColetaPublica} from './coleta-publica.mjs';
const ENDPOINT='https://reoghclxripktzpdwhiy.supabase.co/functions/v1/badboy-telegram';
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
async function identidade(){
  const url=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL??'https://invalid.invalid');
  if(url.protocol!=='https:'||!url.hostname.endsWith('.actions.githubusercontent.com')||!process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN)throw Error('Identidade temporária do executor indisponível.');
  url.searchParams.set('audience','impresilk-licitacoes');
  const r=await fetch(url,{headers:{Authorization:'Bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN},redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error('Identidade do executor HTTP '+r.status);
  const b=await r.json();if(typeof b.value!=='string')throw Error('Identidade não conferida.');return b.value;
}
async function service(acao,body){
  const token=await identidade();const method=body===undefined?'GET':'POST';
  const r=await fetch(ENDPOINT+'?acao='+acao,{method,headers:{'x-impresilk-executor-oidc':token,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',signal:AbortSignal.timeout(60000)});
  const text=await r.text();if(Buffer.byteLength(text)>650000)throw Error('Resposta da ponte acima do limite.');
  if(!r.ok)throw Error('Ponte de licitações HTTP '+r.status+'; conferir ID antes de repetir.');return JSON.parse(text);
}
async function main(){
  if(process.env.GITHUB_REPOSITORY!=='leogpereira-afk/painel-impresilk'||process.env.GITHUB_REF!=='refs/heads/main'||process.env.GITHUB_EVENT_NAME!=='workflow_dispatch'||!/^\d+$/.test(process.env.GITHUB_RUN_ID??''))throw Error('Execução fora do workflow principal autorizado.');
  const runId=process.env.GITHUB_RUN_ID,id='painel-pncp-'+runId;
  // Antes de qualquer coleta, consulta o ID para recuperar execução incerta.
  const prior=await service('licitacoes-relatorio',{id,secao:'resumo',pagina:1});
  if(prior.estado==='disponivel'){console.log(JSON.stringify({ok:true,id,estado:'ja_publicado',cobertura:prior.cobertura}));return;}
  const base=await service('licitacoes-executor-base');
  if(base.dossie){
    validarDossiePublico(base.dossie);
    if(createHash('sha256').update(canonical(base.dossie)).digest('hex')!==base.hash)throw Error('Dossiê anterior não confirmou checksum; nenhuma nova publicação.');
  }
  const coleta=await coletarPropostasPNCP();
  if(!coleta.paginas.length)throw Error('PNCP não respondeu; o relatório anterior foi preservado.');
  const dossie=integrarColetaPublica(base.dossie,coleta);
  validarDossiePublico(dossie);const report=gerarRelatorio(dossie);
  if(Buffer.byteLength(JSON.stringify({id,dossie}))>512*1024)throw Error('Dossiê acima do limite; relatório anterior preservado. Revisão humana para compactar referências.');
  const hash=createHash('sha256').update(canonical(dossie)).digest('hex');
  const r=await service('licitacoes-publicar',{id,dossie});
  if(!r.ok||r.id!==id||r.hash!==hash)throw Error('Recibo de publicação divergente.');
  const check=await service('licitacoes-relatorio',{id,secao:'resumo',pagina:1});
  if(check.estado!=='disponivel'||check.id!==id||check.hash!==hash||canonical(check.cobertura)!==canonical(report.resumo))throw Error('Leitura de retorno divergente.');
  console.log(JSON.stringify({ok:true,id,estado:'publicado_e_conferido',paginas:coleta.paginas.length,registros:coleta.registros.length,cobertura:report.resumo,coletaParcial:true}));
  if(process.env.GITHUB_STEP_SUMMARY)await writeFile(process.env.GITHUB_STEP_SUMMARY,`Pesquisa pública publicada e conferida por ID e SHA-256.\n\nMunicípios: ${report.resumo.concluidos}/89 concluídos; ${report.resumo.parciais} parciais. Execução automática concluída não equivale a cobertura integral. Prazos, itens e documentos exigem conferência.\n`,{flag:'a'});
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
