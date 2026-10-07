import {resolverEscopo,pertence,gestorComercial} from './comercial.mjs';
import {lerHistoricoComercial,mesclarOrdensComerciais,apurarCarteiraHistorica} from './carteira-historica.mjs';
export async function contextoComercial(sb:any,sessao:any,filtro:any={},opcoes:any={}) {
 const {data,error}=await sb.from('painel_cache').select('chave,valor,atualizado_em').in('chave',['comercial_catalogo','comercial_carga_status','orcamentos','crm_clientes','status','historico_status','ordens']);
 if(error)throw Object.assign(new Error('Não foi possível consultar as fontes comerciais.'),{status:503});
 const fontes=Object.fromEntries((data||[]).map((r:any)=>[r.chave,r]));
 const {data:cfg,error:ce}=await sb.from('painel_registros').select('registro').eq('colecao','comercial_config').eq('id','regras').maybeSingle();
 if(ce)throw Object.assign(new Error('Configuração comercial indisponível.'),{status:503});
 const config=cfg?.registro||{},catalogo=fontes.comercial_catalogo?.valor||{};
 const escopo=resolverEscopo(sessao,catalogo,config,filtro);
 const orcamentos=(fontes.orcamentos?.valor||[]).filter((o:any)=>pertence(o,escopo));
 if(opcoes.historico===false)return {fontes,config,catalogo,escopo,orcamentos,clientes:[],coberturaHistorica:null};
 // Carteira e autorização usam todo o histórico disponível, nunca o mês da tela.
 // A consulta compacta é agregada no servidor; os pedidos antigos não saem no JSON.
 const historico=await lerHistoricoComercial(sb);
 const ordens=mesclarOrdensComerciais(historico,fontes.ordens?.valor||[],fontes.ordens?.atualizado_em);
 const hoje=opcoes.hoje||new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const carteira=apurarCarteiraHistorica({ordens,clientes:Object.values(fontes.crm_clientes?.valor?.clientes||{}),orcamentos,escopo,catalogo,fontes,hoje});
 return {fontes,config,catalogo,escopo,orcamentos,...carteira};
}
export async function escopoLegado(sb:any,sessao:any) {
 if(gestorComercial(sessao))return {ids:null,nomes:[],gestor:true};
 return (await contextoComercial(sb,sessao,{}, {historico:false})).escopo;
}
