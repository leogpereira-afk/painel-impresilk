import {resolverEscopo,pertence,gestorComercial} from './comercial.mjs';
export async function contextoComercial(sb:any,sessao:any,filtro:any={}) {
 const {data,error}=await sb.from('painel_cache').select('chave,valor,atualizado_em').in('chave',['comercial_catalogo','orcamentos','crm_clientes','status','historico_status','ordens']);
 if(error)throw Object.assign(new Error('Não foi possível consultar as fontes comerciais.'),{status:503});
 const fontes=Object.fromEntries((data||[]).map((r:any)=>[r.chave,r]));
 const {data:cfg,error:ce}=await sb.from('painel_registros').select('registro').eq('colecao','comercial_config').eq('id','regras').maybeSingle();
 if(ce)throw Object.assign(new Error('Configuração comercial indisponível.'),{status:503});
 const config=cfg?.registro||{},catalogo=fontes.comercial_catalogo?.valor||{};
 const escopo=resolverEscopo(sessao,catalogo,config,filtro);
 const orcamentos=(fontes.orcamentos?.valor||[]).filter((o:any)=>pertence(o,escopo));
 const carteira=Object.values(fontes.crm_clientes?.valor?.clientes||{}).filter((c:any)=>pertence(c,escopo,'responsavel'));
 // Um cliente histórico de uma proposta própria pode ser consultado, sem expor vendas alheias.
 const historicos=new Set(orcamentos.map((o:any)=>String(o.clienteId)));
 const clientes=Object.values(fontes.crm_clientes?.valor?.clientes||{}).filter((c:any)=>escopo.ids===null||carteira.includes(c)||historicos.has(String(c.id))).map((c:any)=>({...c,naCarteira:carteira.includes(c)}));
 return {fontes,config,catalogo,escopo,orcamentos,clientes};
}
export async function escopoLegado(sb:any,sessao:any) {
 if(gestorComercial(sessao))return {ids:null,nomes:[],gestor:true};
 return (await contextoComercial(sb,sessao)).escopo;
}
