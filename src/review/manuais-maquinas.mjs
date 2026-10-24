import {atenderManuaisMaquinas} from '../../supabase/functions/_shared/manuais-maquinas-handler.mjs';
import {prepararConteudoManual} from '../../supabase/functions/_shared/manuais-maquinas.mjs';

// Somente demonstração. O mesmo handler/validador da produção atua sobre memória.
const fonte='12212212-1221-4221-8221-122122122140';
const em='2026-10-24T12:00:00.000Z';
const conteudo=prepararConteudoManual({
 identificacaoConfirmada:true,fabricante:'Roland DG',modelo:'SG-540',variante:'Referência visual · demonstração',responsavelId:'rh-demo-bruno',revisarEm:'2027-04-24',
 // Referência pública de fabricante na simulação, sem vínculo com um bem real.
 // Os textos de operação abaixo continuam fictícios e não homologam este modelo.
 foto:{url:'https://image.rolanddga.com/-/media/roland/images/support/product_shots/sg540.jpg?rev=86ec3754662e4da9a85d530d523efdb8&hash=97EDD9A3DE121811D0B4D0BA85D4CFE6',fonteUrl:'https://www.rolanddga.com/en-la/support/products/print-printcut/truevis-sg-540-printer-cutter',legenda:'Roland SG-540 · imagem de referência do fabricante',usoConfirmado:true},
 finalidade:'Exemplo de ficha para treinamento. Este equipamento e estas instruções são fictícios.',
 seguranca:'Demonstração: confira a identificação e receba a orientação do instrutor antes de operar. As instruções reais precisam ser validadas para o equipamento.',
 preparacao:'Demonstração: confira a ordem de serviço, o material e as condições de preparação com o instrutor.',
 operacao:'Demonstração: acompanhe o instrutor, identifique os controles e faça o exercício supervisionado previsto no treinamento.',
 qualidade:'Demonstração: compare a amostra com o padrão aprovado e registre as divergências para revisão.',
 encerramento:'Demonstração: confira o encerramento com o instrutor e registre as ocorrências.',
 limpeza:'Demonstração: use somente o procedimento e os materiais validados para o equipamento.',
 problemas:'Demonstração: interrompa o exercício e procure o responsável quando houver comportamento inesperado.',
 fontes:[{id:fonte,titulo:'Roland SG-540 · central oficial de manuais e suporte',url:'https://www.rolanddga.com/en-la/support/products/print-printcut/truevis-sg-540-printer-cutter',tipo:'fabricante',modelo:'SG-540',versao:'Página pública do fabricante',idioma:'Inglês',conferidoEm:'2026-10-24',pagina:'Página e imagem conferidas; textos operacionais desta simulação são fictícios',situacao:'verificado'}],
 consumiveis:[{id:'12212212-1221-4221-8221-122122122141',nome:'Consumível de exemplo',codigo:'DEMO',uso:'Campo de demonstração, sem recomendação de produto.',compatibilidade:'pendente',armazenamento:'Conferir no documento do fabricante.',fonteId:fonte}],
 assistencias:[{id:'12212212-1221-4221-8221-122122122142',nome:'Assistência de demonstração',especialidade:'Contato fictício para conferir o layout',email:'suporte@example.com',conferidoEm:'2026-10-24'}],
 treinamentos:[{id:'12212212-1221-4221-8221-122122122143',titulo:'Conhecer a máquina',objetivo:'Identificar o equipamento e os limites de operação.',conteudo:'Conferir a placa e localizar o manual com o instrutor.',criterio:'Explicar a identificação e quando pedir ajuda.'},{id:'12212212-1221-4221-8221-122122122144',titulo:'Prática supervisionada',objetivo:'Executar o exercício definido pelo instrutor.',conteudo:'Seguir o roteiro validado para a máquina.',criterio:'Conferência prática registrada na Escola.'}],
});
const registro={id:'ativo:maq-demo',referencia:{tipo:'ativo',id:'maq-demo'},referencias:[{tipo:'ativo',id:'maq-demo'},{tipo:'bem',id:'ex1'}],conteudo,estado:'aprovado',revisao:2,criadoEm:em,atualizadoEm:em,aprovadoEm:em,aprovadoPor:'demo',atualizadoPor:'demo',responsavel:'Bruno Exemplo Atualizado',responsavelIdPessoa:'900003',historico:[{id:'ativo:maq-demo',referencia:{tipo:'ativo',id:'maq-demo'},conteudo:{...conteudo,finalidade:'Primeiro rascunho fictício.'},estado:'rascunho',revisao:1,criadoEm:em,atualizadoEm:'2026-10-23T12:00:00.000Z'}]};
const soldaDemo={...registro,id:'ativo:maq-acabamento-demo',referencia:{tipo:'ativo',id:'maq-acabamento-demo'},referencias:[{tipo:'ativo',id:'maq-acabamento-demo'}],estado:'rascunho',revisao:1,aprovadoEm:undefined,aprovadoPor:undefined,historico:[],conteudo:prepararConteudoManual({...conteudo,fabricante:'Boxer',modelo:'MIGFLEX 250',variante:'Referência visual · demonstração',identificacaoConfirmada:false,foto:{url:'https://boxersoldas.com.br/wp-content/uploads/2025/12/FRENTE-MIGFLEX-250.webp',fonteUrl:'https://boxersoldas.com.br/produtos/maquina-de-solda-migflex-250/',legenda:'Boxer MIGFLEX 250 · imagem de referência do fabricante',usoConfirmado:true},fontes:[{...conteudo.fontes[0],titulo:'Boxer MIGFLEX 250 · página oficial do fabricante',url:'https://boxersoldas.com.br/produtos/maquina-de-solda-migflex-250/',modelo:'MIGFLEX 250',situacao:'pendente'}]})};
const manuais=new Map([[registro.id,registro],[soldaDemo.id,soldaDemo]]);

export async function respostaManuais(corpo,sessao,ativos,bens,pessoas,setores={}) {
 const linhas=()=>[
  ...ativos.map(a=>({colecao:'ativo',id:a.id,registro:a})),
  ...Object.entries(bens).map(([id,b])=>({colecao:'patrimonio',id,registro:b})),
  ...Object.entries(setores).map(([id,b])=>({colecao:'setores',id,registro:b})),
  ...[...manuais].map(([id,m])=>({colecao:'manuais_maquinas',id,registro:m})),
 ];
 const sb={from(){const filtros=[];let de=0,ate=Infinity;const q={select(){return q},eq(k,v){filtros.push([k,v]);return q},order(){return q},range(a,b){de=a;ate=b;return q},then(ok){return Promise.resolve({data:structuredClone(linhas().filter(r=>filtros.every(([k,v])=>r[k]===v)).slice(de,ate+1)),error:null}).then(ok);}};return q;},async rpc(nome,p){
  if(nome!=='painel_registro_gravar')throw new Error('RPC de prévia não implementada.');
  if(JSON.stringify(manuais.get(p.p_id)||null)!==JSON.stringify(p.p_anterior))return {error:{code:'40001'}};
  manuais.set(p.p_id,structuredClone(p.p_registro));return {data:structuredClone(p.p_registro),error:null};
 }};
 return atenderManuaisMaquinas({sb,sessao,corpo,pessoasRH:async()=>pessoas,resposta:(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}})});
}
