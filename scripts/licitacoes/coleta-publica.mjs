import {MUNICIPIOS} from '../../supabase/functions/_shared/licitacoes-controle.mjs';
const API='https://pncp.gov.br/api/consulta/v1/contratacoes/proposta';
const normalize=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const TERMS=/comunicacao visual|letras? ?caixa|letreiro|totem|sinaliza|placa|lona|banner|adesiv|envelopamento|impressao digital|impressao uv|display|\bacm\b/;
export function janelaPublica(agora=new Date()){
  const fim=agora.toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'}),d=new Date(fim+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-89);
  return {inicio:d.toISOString().slice(0,10),fim};
}
export async function coletarPropostasPNCP({fetcher=fetch,agora=()=>new Date(),pausar=ms=>new Promise(r=>setTimeout(r,ms)),tentativas=3,maxPaginas=500}={}){
  const periodo=janelaPublica(agora()),horizon=new Date(periodo.fim+'T12:00:00Z');horizon.setUTCFullYear(horizon.getUTCFullYear()+1);
  const horizonte=horizon.toISOString().slice(0,10),map=new Map(),paginas=[],erros=[],contagens=[];
  let totalPaginas=1,baseMutavel=false;
  for(let pagina=1;pagina<=Math.min(totalPaginas,maxPaginas);pagina++){
    const url=new URL(API);for(const [key,value] of Object.entries({dataFinal:horizonte.replaceAll('-',''),uf:'MG',pagina,tamanhoPagina:50}))url.searchParams.set(key,String(value));
    let body,success=false;
    for(let tentativa=0;tentativa<tentativas;tentativa++){
      try{
        const r=await fetcher(url.href,{redirect:'error',signal:AbortSignal.timeout(40000)});
        if(r.status===204){body={data:[],totalPaginas:1,totalRegistros:0};success=true;break;}
        if(!r.ok||r.redirected)throw Error('HTTP '+r.status);
        const raw=await r.text();if(new TextEncoder().encode(raw).byteLength>5*1024*1024)throw Error('Resposta acima de 5 MiB');body=JSON.parse(raw);
        if(!Array.isArray(body.data)||!Number.isSafeInteger(body.totalPaginas)||body.totalPaginas<1)throw Error('Formato PNCP não confirmado');
        success=true;break;
      }catch(e){if(tentativa+1===tentativas)erros.push(`Página ${pagina}: ${String(e.message).slice(0,120)}`);else await pausar((tentativa+1)*5000);}
    }
    if(!success)break;
    if(contagens.length&&(contagens.at(-1)!==body.totalRegistros||totalPaginas!==body.totalPaginas))baseMutavel=true;
    totalPaginas=Math.max(totalPaginas,body.totalPaginas);contagens.push(body.totalRegistros);paginas.push(pagina);
    for(const row of body.data){if(typeof row.numeroControlePNCP==='string')map.set(row.numeroControlePNCP,row);}
    if(pagina<totalPaginas)await pausar(1100);
  }
  if(totalPaginas>maxPaginas)erros.push(`Limite operacional de ${maxPaginas} páginas; ${totalPaginas} informadas pela API.`);
  return {registros:[...map.values()],paginas,totalPaginas,paginacaoCompleta:paginas.length===totalPaginas&&!erros.length,erros,baseMutavel,consultadoEm:agora().toISOString(),horizonte};
}
export function integrarColetaPublica(base,coleta,agora=new Date()){
  const d=structuredClone(base??{fontes:[],recibos:[],candidatos:[],instituicoes:[]});
  d.periodo=janelaPublica(agora);d.geradoEm=agora.toISOString();d.escopoMunicipal=[...MUNICIPIOS];delete d.coberturaDeclarada;
  d.fontes??=[];d.recibos??=[];d.candidatos??=[];
  const fonteId='pncp-automatico-oficial';
  d.fontes=d.fontes.filter(f=>f.id!==fonteId);d.fontes.push({id:fonteId,url:API,oficial:true,verificadaEm:coleta.consultadoEm,evidenciaOficial:'API pública no domínio governamental PNCP; rotas oficiais de consulta de propostas.'});
  const id='pncp-auto-'+d.periodo.fim;
  const pistas=coleta.registros.filter(r=>TERMS.test(normalize(r.objetoCompra))&&(MUNICIPIOS.some(m=>normalize(r.unidadeOrgao?.municipioNome)===normalize(m))||MUNICIPIOS.some(m=>normalize(r.objetoCompra).includes(normalize(m)))));
  const links=pistas.slice(0,15).map(r=>`https://pncp.gov.br/app/editais/${r.orgaoEntidade?.cnpj}/${r.anoCompra}/${r.sequencialCompra}`);
  d.recibos=d.recibos.filter(r=>r.id!==id);
  d.recibos.push({id,fonteId,consultadoEm:coleta.consultadoEm,periodo:d.periodo,consulta:`GET ${API}; uf=MG; propostas até ${coleta.horizonte}; tamanhoPagina=50; páginas ${coleta.paginas.join(',')||'não confirmadas'}. Triagem por famílias do portfólio; período de publicações e processos anteriores abertos separados.`,municipios:[...MUNICIPIOS],instituicoes:[],etapa:'PNCP',escopoEvidencia:`Consulta estadual explicitamente filtrada em MG, incluindo os 89 municípios canônicos por nome normalizado. ${coleta.registros.length} IDs únicos de metadados. Não cobre compradores fora de MG nem comprova destino pelo nome da unidade. Bases mutáveis: ${coleta.baseMutavel?'sim':'não detectada'}. A janela de publicações de 90 dias não foi esgotada por esta consulta de propostas.`,resultado:'PARCIAL',conclusao:'INDETERMINADA',resumo:`${pistas.length} pistas textuais, sem análise integral de itens, anexos, destinos ou habilitação. ${links.length?'Pistas não verificadas: '+links.join(' ; '):'Nenhuma pista textual localizada neste recorte; isso não comprova ausência de oportunidades.'}`,itensExaminadosIntegralmente:false,paginacao:{completa:coleta.paginacaoCompleta,total:Math.max(1,coleta.totalPaginas),paginasConsultadas:coleta.paginas},pendencia:`Conferir publicações 90 dias, itens, anexos, retificações, destino real, demais portais, Diário e compras fora de MG; horizonte de propostas limitado a ${coleta.horizonte}. ${coleta.erros.join('; ')}`});
  // Oportunidades anteriores conservam recibos e datas. O controle ignora
  // consultas de outra janela, sem fabricar atualização nem substituir PDFs.
  return d;
}
