import {gerarRelatorio} from './licitacoes-controle.mjs';

// Endereço fixo: não aceita destino, ID de relatório ou credencial do cliente.
export const URL_PESQUISA_LICITACOES='https://reoghclxripktzpdwhiy.supabase.co/functions/v1/badboy-telegram?acao=licitacoes-painel';
export const MAX_BYTES_PESQUISA=250*1024;
const CAMPOS_REGISTRO=['id','periodo_de','periodo_ate','gerado_em','recebido_em','versao','dossie','hash_sha256'];
const indisponivel=()=>new Error('Pesquisa do BotImpresilk indisponível. A cobertura não foi inferida; tente atualizar a leitura mais tarde.');
const objeto=value=>value&&typeof value==='object'&&!Array.isArray(value);
function canonico(value) {
  if(value===null||['string','boolean'].includes(typeof value))return JSON.stringify(value);
  if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonico).join(',')+']';
  if(objeto(value))return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonico(value[key])).join(',')+'}';
  throw indisponivel();
}
export async function hashPesquisa(value) {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonico(value)));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
function projetarBot(bot) {
  if(bot===undefined)return {};
  if(!objeto(bot)||Object.keys(bot).some(key=>!['nome','username','url'].includes(key))||bot.nome!=='BotImpresilk'||typeof bot.username!=='string'||!/^[A-Za-z0-9_]{5,32}$/.test(bot.username))throw indisponivel();
  // O username vem do serviço autenticado/getMe. A URL é construída aqui,
  // nunca aceita um endereço livre enviado junto com o relatório.
  return {bot:{nome:'BotImpresilk',username:bot.username,url:`https://t.me/${bot.username}`}};
}
export async function projetarPesquisaLicitacoes(entrada,agora=new Date()) {
  if(!objeto(entrada))throw indisponivel();
  if(entrada.estado==='sem_relatorio'&&Object.keys(entrada).every(key=>['estado','bot'].includes(key)))return {estado:'sem_relatorio',...projetarBot(entrada.bot)};
  if(entrada.estado!=='disponivel'||Object.keys(entrada).some(key=>!['estado','registro','bot'].includes(key)))throw indisponivel();
  const bot=projetarBot(entrada.bot);
  const row=entrada.registro;
  if(!objeto(row)||Object.keys(row).some(key=>!CAMPOS_REGISTRO.includes(key))||CAMPOS_REGISTRO.some(key=>!(key in row)))throw indisponivel();
  if(typeof row.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/.test(row.id)||typeof row.hash_sha256!=='string'||!/^[a-f0-9]{64}$/.test(row.hash_sha256))throw indisponivel();
  let report;
  try {
    if(typeof row.dossie?.geradoEm!=='string'||!row.dossie?.periodo)throw indisponivel();
    report=gerarRelatorio(row.dossie);
    if(await hashPesquisa(row.dossie)!==row.hash_sha256||row.versao!==report.versao||row.periodo_de!==report.periodo.inicio||row.periodo_ate!==report.periodo.fim||Date.parse(row.gerado_em)!==Date.parse(report.geradoEm))throw indisponivel();
    if(!Number.isFinite(Date.parse(row.recebido_em))||!Number.isFinite(agora.getTime())||Date.parse(report.geradoEm)>agora.getTime()+300000)throw indisponivel();
  }catch {throw indisponivel();}
  return {
    estado:'disponivel',origem:'relatorio_publico_licitacoes',somenteLeitura:true,...bot,
    id:row.id,hash:row.hash_sha256,versao:report.versao,periodo:report.periodo,geradoEm:report.geradoEm,
    consultadoEm:agora.toISOString(),antigo:agora.getTime()-Date.parse(report.geradoEm)>=8*86400000,
    pesquisaIniciada:report.recibos.length>0,cobertura:report.resumo,coberturaInstituicoes:report.resumoInstituicoes,
    municipios:report.municipios,instituicoes:report.instituicoes,oportunidades:report.oportunidades,
    candidatosRetidos:report.candidatosRetidos,avisos:report.avisos,pendencias:report.pendencias,limites:report.limites,
  };
}
async function lerJSONLimitado(response) {
  if(!response.ok||response.redirected||!response.body)throw indisponivel();
  const length=response.headers.get('content-length');
  if(length!==null&&(!/^\d+$/.test(length)||Number(length)>MAX_BYTES_PESQUISA))throw indisponivel();
  const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});
  let bytes=0,conteudo='';
  try {
    while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>MAX_BYTES_PESQUISA){await reader.cancel();throw indisponivel();}conteudo+=decoder.decode(chunk.value,{stream:true});}
    return JSON.parse(conteudo+decoder.decode());
  }finally {reader.releaseLock();}
}
export async function consultarPesquisaLicitacoes({token,fetcher=fetch,agora=()=>new Date(),timeoutMs=15000}) {
  if(typeof token!=='string'||!token.trim())throw new Error('A ligação de leitura com o BotImpresilk ainda não está configurada no servidor.');
  const controller=new AbortController();let timer;
  try {
    const expirou=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(indisponivel());},timeoutMs);});
    const leitura=(async()=>{
      const r=await fetcher(URL_PESQUISA_LICITACOES,{method:'GET',headers:{'x-licitacoes-painel-token':token,'accept':'application/json'},redirect:'error',signal:controller.signal});
      return projetarPesquisaLicitacoes(await lerJSONLimitado(r),agora());
    })();
    return await Promise.race([leitura,expirou]);
  }catch {throw indisponivel();}
  finally {clearTimeout(timer);controller.abort();}
}
