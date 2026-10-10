// Porta painel-marketing de mentira, só na compilação review: as ações vivem
// nesta memória e recarregar restaura o exemplo. As regras de campo e a trava
// de orçamento são as MESMAS do servidor (_shared/marketing.mjs).
import {prepararAcao,acaoParaTela,ErroMarketing} from '../../supabase/functions/_shared/marketing.mjs';
const acoes=new Map(),vinculo=new Map();
const exemplo={id:'7b0f6a52-1c2d-4e5f-8a9b-0c1d2e3f4a5b',nome:'Apresentação de fachadas (exemplo)',objetivo:'Gerar oportunidades de sinalização para lojas',publico:'Comércio local',canal_texto:'Portfólio e redes sociais',responsavel_texto:'Ana Exemplo',prazo:new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}),situacao:'Produção',investimento:500,url:null,versao:1};
acoes.set(exemplo.id,exemplo);
const lista=()=>[...acoes.values()].map(a=>acaoParaTela(a,[...vinculo].filter(([,id])=>id===a.id).map(([o])=>o)));
export function respostaMarketing(b){
 let dados;try{
  if(b.action==='acoes')dados={acoes:lista(),legado:{pendentes:0},podeMigrar:true};
  else if(b.action==='salvarAcao'){
   const {dados:d,orcamentos}=prepararAcao(b.acao),antes=b.acao?.id?acoes.get(b.acao.id):null;
   if(b.novo&&antes){dados={acao:acaoParaTela(antes,[...vinculo].filter(([,id])=>id===antes.id).map(([o])=>o))};return new Response(JSON.stringify({ok:true,...dados}),{headers:{'Content-Type':'application/json'}});}
   if(b.acao?.id&&!b.novo&&!antes)throw new ErroMarketing('Esta ação não existe mais. Recarregue a página.',404);
   if(antes&&antes.versao!==b.versao)throw new ErroMarketing('Esta ação mudou enquanto você editava. Reabra e confira.',409);
   const id=antes?.id||crypto.randomUUID();
   const ocupado=orcamentos.find(o=>vinculo.has(o)&&vinculo.get(o)!==id);
   if(ocupado)throw new ErroMarketing(`O orçamento ${ocupado} já está na ação "${acoes.get(vinculo.get(ocupado))?.nome}". Um orçamento só pode estar numa ação, para a venda não ser contada duas vezes.`,409);
   for(const [o,a] of [...vinculo])if(a===id&&!orcamentos.includes(o))vinculo.delete(o);
   for(const o of orcamentos)vinculo.set(o,id);
   const linha={...antes,...d,id,versao:(antes?.versao||0)+1};acoes.set(id,linha);
   dados={acao:acaoParaTela(linha,orcamentos)};
  }else if(b.action==='retirarAcao'){
   const a=acoes.get(b.id);if(!a)throw new ErroMarketing('Esta ação não existe mais. Recarregue a página.',404);
   if(a.versao!==b.versao)throw new ErroMarketing('Esta ação mudou enquanto você editava. Reabra e confira.',409);
   for(const [o,x] of [...vinculo])if(x===b.id)vinculo.delete(o);acoes.delete(b.id);dados={};
  }else if(b.action==='migrarLegado')dados={resultado:{total:0,migradas:0,vinculos:0}};
  else throw new ErroMarketing('Ação inválida.',400);
 }catch(e){return new Response(JSON.stringify({erro:e.message}),{status:e.status||400,headers:{'Content-Type':'application/json'}});}
 return new Response(JSON.stringify({ok:true,...dados}),{headers:{'Content-Type':'application/json'}});
}
