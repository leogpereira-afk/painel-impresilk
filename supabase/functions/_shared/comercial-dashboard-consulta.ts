import {apurarDashboard, detalharDashboard, validarFiltroDashboard} from './comercial-dashboard.mjs';
import {resolverEscopo, pertence} from './comercial.mjs';

const indisponivel=(message:string)=>Object.assign(new Error(message),{status:503});

// Called only after the HTTP boundary has authenticated the session. No shared
// response cache: one seller's groups and catalog must never leak to another.
// Four bounded page reads and a compact projection replace the generic context,
// per-client operational lookups and raw order arrays in the response.
export async function lerPaginasDashboard(criar:any, tamanho=1000, limite=100000) {
 const pagina=async(inicio:number)=>{
  const {data,error}=await criar().range(inicio,inicio+tamanho-1);
  if(error||!Array.isArray(data))throw indisponivel('A leitura do histórico comercial falhou. Nenhum resultado foi apresentado como zero.');
  return data;
 };
 const linhas:any[]=[];
 for(let inicio=0;inicio<limite;inicio+=tamanho*4){
  const paginas=await Promise.all(Array.from({length:Math.min(4,Math.ceil((limite-inicio)/tamanho))},(_,i)=>pagina(inicio+i*tamanho)));
  for(const p of paginas){linhas.push(...p);if(p.length<tamanho)return linhas;}
 }
 throw indisponivel('O histórico ultrapassou o limite seguro de leitura; a consulta não foi apresentada como completa.');
}

export async function consultarDashboard(sb:any,sessao:any,corpo:any,hoje:string) {
 const filtro=corpo.filtro||{};
 // Validate early without narrowing the all-years option to the old 2-year cap.
 validarFiltroDashboard(filtro,hoje);
 const financeiro=sessao.master===true||(sessao.perms||[]).some((p:string)=>p==='*'||p==='contas-atrasadas');
 const chaves=['comercial_catalogo','comercial_carga_status','ordens','orcamentos','status',...(financeiro&&corpo.action!=='dashboardDetalhe'?['recebiveis']:[])];
 const [{data:cache,error:cacheError},{data:cfg,error:configError}]=await Promise.all([
  sb.from('painel_cache').select('chave,valor,atualizado_em').in('chave',chaves),
  sb.from('painel_registros').select('registro').eq('colecao','comercial_config').eq('id','regras').maybeSingle(),
 ]);
 if(cacheError||configError)throw indisponivel('Não foi possível consultar a configuração e as fontes do Dashboard.');
 const fontes=Object.fromEntries((cache||[]).map((r:any)=>[r.chave,r])),catalogo=fontes.comercial_catalogo?.valor||{},config=cfg?.registro||{};
 if(!catalogo.completo)throw indisponivel('O catálogo comercial ainda não está disponível por completo.');
 const escopo=resolverEscopo(sessao,catalogo,config,filtro);
 const podeCampanhas=sessao.master===true||(sessao.perms||[]).some((p:string)=>p==='*'||p==='campanhas');
 if(filtro.campanha&&!podeCampanhas)throw Object.assign(new Error('Seu acesso não inclui Campanhas.'),{status:403});
 const [ordens,campanhas,metas]=await Promise.all([
  lerPaginasDashboard(()=>sb.from('painel_ordens').select('id,numero,cliente,data,valor,bruto,desconto,vendedor,itens,comercial,atualizado_em').order('id')),
  podeCampanhas?lerPaginasDashboard(()=>sb.from('painel_registros').select('id,registro').eq('colecao','campanhas').order('id'),500):Promise.resolve([]),
  corpo.action==='dashboardDetalhe'?Promise.resolve([]):lerPaginasDashboard(()=>{let q=sb.from('painel_registros').select('id,registro').eq('colecao','comercial_metas').order('id');if(escopo.ids!==null)q=q.in('registro->>vendedorId',escopo.ids);return q;},500),
 ]);
 const base={catalogo,config,ordens,metas:metas.map((m:any)=>m.registro),recentes:fontes.ordens?.valor||[],cargaStatus:fontes.comercial_carga_status?.valor||{},
  campanhas:campanhas.map((c:any)=>({id:c.id,nome:c.registro?.nome,os:c.registro?.os||{}})),
  // Avoid retaining unrelated clients or action notes. Budget amounts are not
  // returned; only existing status counts are available as a separate funnel.
  orcamentos:Array.isArray(fontes.orcamentos?.valor)?fontes.orcamentos.valor.filter((o:any)=>pertence(o,escopo)):null,
  recebiveis:financeiro?fontes.recebiveis?.valor:null,financeiroEm:financeiro?fontes.recebiveis?.atualizado_em:null,
  financeiroFalhou:(fontes.status?.valor?.fontesQueFalharam||[]).some((s:string)=>/receber|recebiveis/.test(s)),
  atualizadoEm:[fontes.ordens?.atualizado_em,...ordens.filter((o:any)=>pertence({...o,...o.comercial},escopo)).map((o:any)=>o.atualizado_em)].filter(Boolean).sort().at(-1)||null,
  catalogoEm:fontes.comercial_catalogo?.atualizado_em||null};
 return corpo.action==='dashboardDetalhe'?detalharDashboard(base,filtro,hoje,sessao,corpo):apurarDashboard(base,filtro,hoje,sessao);
}
