import {gerarRelatorio} from './licitacoes-controle.mjs';

// Endereço fixo: aceita somente seletor de versão validado, nunca destino ou credencial do cliente.
export const URL_PESQUISA_LICITACOES='https://reoghclxripktzpdwhiy.supabase.co/functions/v1/badboy-telegram?acao=licitacoes-painel';
export const MAX_BYTES_PESQUISA=600*1024;
const CAMPOS_REGISTRO=['id','periodo_de','periodo_ate','gerado_em','recebido_em','versao','dossie','hash_sha256'];
const indisponivel=()=>new Error('Pesquisa do BotImpresilk indisponível. A cobertura não foi inferida; tente atualizar a leitura mais tarde.');
const objeto=value=>value&&typeof value==='object'&&!Array.isArray(value);
const ID_RELATORIO=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/;
const CAMPOS_RESUMO=CAMPOS_REGISTRO.filter(key=>key!=='dossie');
const parametrosInvalidos=()=>Object.assign(new Error('Seleção de relatório inválida.'),{status:400});
export function selecionarConsultaLicitacoes(params) {
  const permitidos=['modulo','acao','pagina','relatorio'];
  if([...params.keys()].some(key=>!permitidos.includes(key)||params.getAll(key).length!==1))throw parametrosInvalidos();
  if(params.has('acao')) {
    if(params.get('acao')!=='historico'||params.has('relatorio')||!/^([1-9][0-9]{0,3}|10000)$/.test(params.get('pagina')||'1'))throw parametrosInvalidos();
    return {historico:true,pagina:Number(params.get('pagina')||'1')};
  }
  if(params.has('pagina')||(params.has('relatorio')&&!ID_RELATORIO.test(params.get('relatorio'))))throw parametrosInvalidos();
  return {id:params.get('relatorio')||undefined};
}
function urlPublica(valor) {
  if(typeof valor!=='string'||/[\s\\\u0000-\u001f\u007f]/.test(valor))return '';
  try {
    const u=new URL(valor),host=u.hostname.toLowerCase();
    if(u.protocol!=='https:'||u.username||u.password||!host.includes('.')||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.startsWith('[')||/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host))return '';
    return u.href;
  }catch{return '';}
}
function detalharRetidos(retidos,dossie) {
  const candidatos=new Map();
  for(const candidato of dossie.candidatos||[])if(!candidatos.has(candidato.id))candidatos.set(candidato.id,candidato);
  return retidos.map(retido=>{
    const c=candidatos.get(retido.id)||{},r={...retido};
    for(const campo of ['processo','orgao','item','lote','produto','prazo','proximaAcao'])if(typeof c[campo]==='string')r[campo]=c[campo];
    r.oficialUrl=urlPublica(c.oficialUrl);
    r.exigencias=Array.isArray(c.exigencias)?[...c.exigencias]:[];
    if(typeof c.justificativa==='string')r.justificativaRegistrada=c.justificativa;
    if(c.localExecucao)r.localExecucaoRegistrado={...c.localExecucao,municipios:[...(c.localExecucao.municipios||[])]};
    return r;
  });
}
export function projetarHistoricoLicitacoes(entrada,pagina) {
  if(!objeto(entrada)||Object.keys(entrada).some(k=>!['estado','registros','pagina','temMais'].includes(k))||entrada.estado!=='historico'||entrada.pagina!==pagina||typeof entrada.temMais!=='boolean'||!Array.isArray(entrada.registros)||entrada.registros.length>20||(entrada.temMais&&entrada.registros.length!==20))throw indisponivel();
  const ids=new Set();
  const registros=entrada.registros.map(row=>{
    if(!objeto(row)||Object.keys(row).some(k=>!CAMPOS_RESUMO.includes(k))||CAMPOS_RESUMO.some(k=>typeof row[k]!=='string')||!ID_RELATORIO.test(row.id)||ids.has(row.id)||!/^[a-f0-9]{64}$/.test(row.hash_sha256)||!row.versao||!Number.isFinite(Date.parse(row.gerado_em))||!Number.isFinite(Date.parse(row.recebido_em)))throw indisponivel();
    for(const k of ['periodo_de','periodo_ate'])if(!/^\d{4}-\d{2}-\d{2}$/.test(row[k])||!Number.isFinite(Date.parse(row[k]))||new Date(row[k]).toISOString().slice(0,10)!==row[k])throw indisponivel();
    if(row.periodo_de>row.periodo_ate)throw indisponivel();
    ids.add(row.id);return Object.fromEntries(CAMPOS_RESUMO.map(k=>[k,row[k]]));
  });
  return {estado:'historico',registros,pagina,temMais:entrada.temMais};
}
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
  if(entrada.estado==='sem_relatorio'&&Object.keys(entrada).every(key=>['estado','bot','mensagem'].includes(key))&&(entrada.mensagem===undefined||typeof entrada.mensagem==='string'))return {estado:'sem_relatorio',...projetarBot(entrada.bot)};
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
    candidatosRetidos:detalharRetidos(report.candidatosRetidos,row.dossie),avisos:report.avisos,pendencias:report.pendencias,limites:report.limites,
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
export async function consultarPesquisaLicitacoes({token,id,historico=false,pagina=1,fetcher=fetch,agora=()=>new Date(),timeoutMs=15000}) {
  if((id!==undefined&&!ID_RELATORIO.test(id))||(historico&&(id!==undefined||!Number.isInteger(pagina)||pagina<1||pagina>10000)))throw parametrosInvalidos();
  if(typeof token!=='string'||!token.trim())throw new Error('A ligação de leitura com o BotImpresilk ainda não está configurada no servidor.');
  const controller=new AbortController();let timer;
  try {
    const expirou=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(indisponivel());},timeoutMs);});
    const leitura=(async()=>{
      const url=new URL(URL_PESQUISA_LICITACOES);
      if(id)url.searchParams.set('id',id);
      if(historico){url.searchParams.set('consulta','historico');url.searchParams.set('pagina',String(pagina));}
      const r=await fetcher(url.href,{method:'GET',headers:{'x-licitacoes-painel-token':token,'accept':'application/json'},redirect:'error',signal:controller.signal});
      if(id&&r.status===404)throw Object.assign(new Error('Relatório não encontrado no acervo. Selecione outra versão.'),{status:404});
      const entrada=await lerJSONLimitado(r);
      if(historico)return projetarHistoricoLicitacoes(entrada,pagina);
      const pesquisa=await projetarPesquisaLicitacoes(entrada,agora());
      if(id&&pesquisa.id!==id)throw indisponivel();
      return pesquisa;
    })();
    return await Promise.race([leitura,expirou]);
  }catch(e) {if(e?.status===404)throw e;throw indisponivel();}
  finally {clearTimeout(timer);controller.abort();}
}
