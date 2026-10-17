// Exclusivamente MODE=review. Dados fictícios, motor de cálculo de produção;
// sem rede, credenciais, clientes reais ou persistência.
import {apurarDashboard,detalharDashboard} from '../../supabase/functions/_shared/comercial-dashboard.mjs';

const diaLocal=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
const deslocar=(data,dias)=>new Date(Date.parse(data+'T12:00:00Z')+dias*864e5).toISOString().slice(0,10);
const produtos=[
 ['p1','Fachada em ACM','Fachadas','m²'],['p2','Adesivo impresso','Adesivos','m²'],
 ['p3','Placa de sinalização','Sinalização','un'],['p4','Letra caixa','Fachadas','un'],
 ['p5','Lona para eventos','Eventos','m²'],['p6','Envelopamento de veículo','Adesivos','m²'],
 ['p7','Totem de identificação','Sinalização','un'],['p8','Painel de exposição','Eventos','un'],
 ['p9','Adesivo de vitrine','Adesivos','m²'],['p10','Display de balcão','Sinalização','un'],
].map(([id,nome,categoria,unidade])=>({id,nome,categoria,unidade}));
const vendedores=[{id:'101',nome:'Ana Exemplo'},{id:'102',nome:'Beatriz Exemplo'}];
const nomes=['Café Horizonte','Clínica Aurora','Loja Estação','Mercado Primavera','Hotel Jardins','Ateliê Raízes','Escola Caminhos','Farmácia Alameda'];

export function baseDashboardDemo(hoje=diaLocal()) {
 const ano=Number(hoje.slice(0,4)),mes=Number(hoje.slice(5,7)),ordens=[],orcamentos=[];
 for(let a=ano-2;a<=ano;a++)for(let m=1;m<=(a===ano?mes:12);m++)for(let n=0;n<12;n++){
  const data=`${a}-${String(m).padStart(2,'0')}-${String(1+n%3*6).padStart(2,'0')}`;
  if(data>hoje)continue;
  const cliente=n%nomes.length,vendedor=vendedores[cliente%2],produto=produtos[(m+n)%produtos.length],complemento=produtos[(m+n+3)%produtos.length];
  const brutoCentavos=(120000+n*25700+m*5900)*(a-ano+5),descontoCentavos=Math.round(brutoCentavos*(n%3+1)/100);
  const itemCentavos=Math.round(brutoCentavos*0.7),id=`demo-${a}-${m}-${n}`;
  ordens.push({id,numero:String(900000+(a-ano+2)*1000+m*20+n),data,clienteId:`dc${cliente}`,cliente:`${nomes[cliente]} · exemplo`,vendedorErpId:vendedor.id,vendedor:vendedor.nome,
   empresaNome:'Impresilk',empresaId:null,tipo:'Normal',valorConfirmado:true,unidadesConfirmadas:true,valor:(brutoCentavos-descontoCentavos)/100,valorBruto:brutoCentavos/100,desconto:descontoCentavos/100,atualizado_em:hoje+'T08:00:00Z',
   itens:[{produtoId:produto.id,produto:produto.nome,categoria:produto.categoria,unidade:produto.unidade,quantidade:8+n,valorTotal:itemCentavos/100},{produtoId:complemento.id,produto:complemento.nome,categoria:complemento.categoria,unidade:complemento.unidade,quantidade:3+n,valorTotal:(brutoCentavos-itemCentavos)/100}],
  });
  orcamentos.push({id:'orc-'+id,numero:'O-'+id,clienteId:`dc${cliente}`,cliente:`${nomes[cliente]} · exemplo`,vendedorErpId:vendedor.id,vendedorNome:vendedor.nome,empresaNome:'Impresilk',dataCadastro:data,situacao:n%4===0?'perdido':n%3===0?'ganho':'aberto',valor:brutoCentavos/100});
 }
 // A Visão mensal tem origem confirmada; "todos os anos" permite conferir
 // exclusão de outra empresa e transparência do histórico sem identificação.
 const molde=ordens[0];
 ordens.push({...molde,id:'demo-outra-empresa',numero:'999901',empresaNome:'Empresa Beta · demonstração',valor:15000,valorBruto:15000,desconto:0});
 ordens.push({...molde,id:'demo-sem-empresa',numero:'999902',empresaNome:null,valor:420,valorBruto:420,desconto:0});
 const atuais=ordens.filter(o=>o.data.startsWith(hoje.slice(0,7))),recebiveis=atuais.slice(0,6).map((o,i)=>({id:'titulo-'+o.id,os:o.numero,origem:o.cliente,valor:Math.round(o.valor*(i%2?0.3:0.5)*100)/100,pago:0,vencimento:deslocar(hoje,i<4?-(i+1)*9:7+i)}));
 const campanhas=[{id:'campanha-demo',nome:'Renovação de fachadas · exemplo',os:Object.fromEntries(atuais.slice(0,5).map(o=>[o.id,{data:o.data}]))}];
 const metas=vendedores.map(v=>({id:`${v.id}_${hoje.slice(0,7)}`,vendedorId:v.id,mes:hoje.slice(0,7),valor:120000,criterio:'cadastro_liquido_os_normal',origem:'painel',atualizadoPor:'Conta de demonstração'}));
 return {catalogo:{completo:true,vendedores,produtos},config:{vinculos:{'ana-exemplo':'101','beatriz-exemplo':'102'},participantesMetas:['101','102'],calendario:{configurado:true,diasSemana:[1,2,3,4,5],feriados:[]},equipes:[{id:'com1',nome:'Equipe comercial · exemplo',vendedores:['101','102']}]},
  metas,
  ordens,recentes:[],orcamentos,campanhas,recebiveis,financeiroEm:hoje+'T08:00:00Z',financeiroFalhou:false,
  cargaStatus:{janelas:{ordens:[{desde:`${ano-2}-01-01`,ate:hoje,concluidaEm:hoje+'T08:00:00Z'}]}},atualizadoEm:hoje+'T08:00:00Z',catalogoEm:hoje+'T08:00:00Z'};
}

export function respostaDashboardDemo(b,sessao={sub:'demo',master:true},hoje=diaLocal()) {
 try {
  if(!sessao.master&&!(sessao.perms||[]).some(p=>p==='*'||p==='orcamentos'))return Response.json({erro:'Seu acesso não inclui o Comercial.'},{status:403});
  const podeCampanhas=sessao.master||(sessao.perms||[]).some(p=>p==='*'||p==='campanhas'),base=baseDashboardDemo(hoje);
  if(!podeCampanhas){if(b.filtro?.campanha)return Response.json({erro:'Seu acesso não inclui Campanhas.'},{status:403});base.campanhas=[];}
  const resposta=b.action==='dashboardDetalhe'?detalharDashboard(base,b.filtro||{},hoje,sessao,b):apurarDashboard(base,b.filtro||{},hoje,sessao,{consultadoEm:hoje+'T09:00:00Z'});
  return Response.json(resposta);
 } catch(e){return Response.json({erro:e.message},{status:e.status||400});}
}
