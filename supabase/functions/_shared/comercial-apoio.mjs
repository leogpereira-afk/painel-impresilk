import {resolverEscopo} from './comercial.mjs';

const indisponivel=mensagem=>Object.assign(new Error(mensagem),{status:503});
async function registrosAutorizados(sb,colecao,escopo) {
 const registros=[];
 for(let inicio=0;inicio<100000;inicio+=500){
  let q=sb.from('painel_registros').select('id,registro').eq('colecao',colecao).order('id');
  if(escopo.ids!==null)q=q.in('registro->>vendedorId',escopo.ids);
  const {data,error}=await q.range(inicio,inicio+499);
  if(error||!Array.isArray(data))throw indisponivel('Não foi possível consultar os cadastros comerciais.');
  registros.push(...data.map(l=>l.registro));
  if(data.length<500)return registros;
 }
 throw indisponivel('A consulta de cadastros excedeu o limite seguro.');
}

// Support data for existing edit forms. This deliberately does not query sales,
// receivables or the full client history; the Dashboard owns those boundaries.
export async function consultarApoioComercial(sb,sessao,filtro={}) {
 const [fonte,regras]=await Promise.all([
  sb.from('painel_cache').select('chave,valor,atualizado_em').eq('chave','comercial_catalogo').maybeSingle(),
  sb.from('painel_registros').select('registro').eq('colecao','comercial_config').eq('id','regras').maybeSingle(),
 ]);
 if(fonte.error||regras.error)throw indisponivel('Não foi possível consultar o catálogo e as regras comerciais.');
 const catalogo=fonte.data?.valor,config=regras.data?.registro||{};
 if(!catalogo?.completo)throw indisponivel('O catálogo comercial ainda não está disponível por completo.');
 const escopo=resolverEscopo(sessao,catalogo,config,{vendedor:filtro.vendedor||'',equipe:filtro.equipe||''});
 const [metas,acoes]=await Promise.all([
  registrosAutorizados(sb,'comercial_metas',escopo),registrosAutorizados(sb,'comercial_acoes',escopo),
 ]);
 const configPublica=escopo.gestor?config:{diasSemResposta:config.diasSemResposta,diasVencimento:config.diasVencimento,diasReativacao:config.diasReativacao,calendario:config.calendario,fichasProdutos:config.fichasProdutos||{}};
 return {catalogo:{vendedores:escopo.vendedores,produtos:catalogo.produtos||[]},config:configPublica,
  metas,escopo:{...escopo,nomes:undefined},base:{acoes,clientes:[],orcamentos:[]},
  fontes:{comercial_catalogo:{atualizadoEm:fonte.data.atualizado_em||null}},consultadoEm:new Date().toISOString()};
}
