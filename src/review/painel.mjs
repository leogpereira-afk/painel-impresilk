// Respostas fictícias e bloqueio de escritas, carregados apenas na compilação review.
const configs = {
 compromissos:{ex1:{titulo:'Conferir prioridades da semana',tipo:'visita',data:'2026-09-08',hora:'09:00',dono:'demo',donoNome:'Conta de demonstração',feito:false},ex2:{titulo:'Revisar proposta com o cliente exemplo',tipo:'outro',data:'2026-09-03',dono:'demo',donoNome:'Conta de demonstração',feito:false}},
 bancos:{ex1:{grupo:'Empresa de demonstração',banco:'Banco de exemplo',titular:'Empresa de demonstração',agencia:'Exemplo',conta:'Exemplo',pix:'exemplo@invalid.test',pixTipo:'E-mail'}},
 marketing:{ex1:{nome:'Biblioteca da marca (exemplo)',url:'https://example.com'},acao1:{tipo:'acao',nome:'Apresentação de fachadas (exemplo)',objetivo:'Gerar oportunidades de sinalização para lojas',publico:'Comércio local',canal:'Portfólio e redes sociais',responsavel:'Ana Exemplo',prazo:'2026-09-15',status:'Produção',investimento:500,orcamentos:[],url:''}},
 patrimonio:{ex1:{nomeGenerico:'Impressora',descricaoTecnica:'Equipamento de demonstração',setorSigla:'PRO',codigo:'PRO-001',valor:10000,situacao:'uso',dataAquisicao:'2026-01-10'}},
 setores:{ex1:{sigla:'PRO',nome:'Produção',area:'Operações'}},
 manutencoes:{},permutas:{},campanhas:{},grupos_clientes:{},
};
export async function respostaPreview(url,opcoes={}){
 const u=new URL(url,location.origin), corpo=opcoes.body ? JSON.parse(opcoes.body) : {};
 const endpoint=u.pathname.split('/').pop();
 let dados;
 if(endpoint==='painel-config' && corpo.action==='lixeiraRegistros') dados={itens:[]};
 else if(endpoint==='painel-fotos' && corpo.action==='resumo') dados={porBem:{}};
 else if(endpoint==='painel-fotos' && corpo.action==='listar') dados={fotos:[]};
 else if(endpoint==='painel-config' && corpo.action==='get'){
   if(corpo.chave==='glossario'){
     const {GLOSSARIO}=await import('../data/glossario.js');
     dados={valor:Object.fromEntries(GLOSSARIO.map((t,i)=>[`demo-${i}`,{...t,ordem:i}]))};
   }else dados={valor:structuredClone(configs[corpo.chave] || {})};
 }else if(endpoint==='painel-ativos' && ['listar','lixeira'].includes(corpo.action)) dados={itens:corpo.action==='lixeira'?[]:[
  {id:'doc-demo',tipo:'documento',nome:'Certidão de demonstração',categoria:'Certidão',validade:'2026-09-20',responsavel:'Ana Exemplo'},
  {id:'maq-demo',tipo:'maquina',nome:'Impressora de demonstração',categoria:'Impressão',validade:'2026-09-18',responsavel:'Bruno Exemplo',setorSigla:'PRO'},
  {id:'lic-demo',tipo:'licitacao',nome:'Sinalização de demonstração',identificacao:'Órgão de exemplo',edital:'Exemplo 01/2026',validade:'2026-09-15',hora:'10:00',status:'avaliar',valor:15000},
  {id:'mkt-demo',tipo:'marketing',nome:'Manual da marca (exemplo)',categoria:'Manual',observacao:'Exemplo para conferir a organização dos materiais',temArquivo:false}
 ]};
 else if(endpoint==='painel-auth' && corpo.action==='listarPessoas')dados={pessoas:[{usuario:'demo',nome:'Conta de demonstração'},{usuario:'ana-exemplo',nome:'Ana Exemplo'}]};
 else if(endpoint==='painel-dados' && (!opcoes.method || opcoes.method==='GET')) dados={itens:[],meses:[],anos:[],linhas:[],cobertura:{desde:null,ate:null}};
 else return new Response(JSON.stringify({erro:'Prévia local: esta ação não grava alterações nos sistemas.'}),{status:409,headers:{'Content-Type':'application/json'}});
 return new Response(JSON.stringify({ok:true,...dados}),{status:200,headers:{'Content-Type':'application/json'}});
}
