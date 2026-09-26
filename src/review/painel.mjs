// Respostas fictícias e bloqueio de escritas, carregados apenas na compilação review.
const configs = {
 compromissos:{ex1:{titulo:'Conferir prioridades da semana',tipo:'visita',data:'2026-09-08',hora:'09:00',dono:'demo',donoNome:'Conta de demonstração',feito:false},ex2:{titulo:'Revisar proposta com o cliente exemplo',tipo:'outro',data:'2026-09-03',dono:'demo',donoNome:'Conta de demonstração',feito:false}},
 /* Contas FICTÍCIAS (CNPJ e chaves de teste, de ninguém): a tela só mostra titular Impresilk ou Universo.
    A ex4 tem o tipo da chave errado de propósito, para a prévia mostrar o aviso. */
 bancos:{ex1:{grupo:'Impresilk',banco:'BTG 208',titular:'Impresilk',doc:'11.222.333/0001-81',agencia:'0050',conta:'000000-1',pix:'123e4567-e12b-12d1-a456-426655440000',pixTipo:'Aleatoria',ordem:0},ex2:{grupo:'Impresilk',banco:'Sicoob Credinor',titular:'Impresilk',doc:'11.222.333/0001-81',agencia:'0000',conta:'00.000-0',pix:'11.222.333/0001-81',pixTipo:'CNPJ',codigoBanco:'756',ordem:1},ex3:{grupo:'Impresilk',banco:'BB',titular:'Impresilk',doc:'11.222.333/0001-81',agencia:'0000-0',conta:'00000-0',pix:'',pixTipo:'Conta e agencia',ordem:2},ex4:{grupo:'Universo',banco:'Sicoob Credinosso',titular:'Universo',doc:'11.444.777/0001-61',agencia:'0000',conta:'00.000-0',pix:'123e4567-e12b-12d1-a456-426655440001',pixTipo:'CNPJ',ordem:3}},
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
 /* A AGENDA SÓ LÊ, então na prévia ela precisa RESPONDER, não cair no 409 de
    escrita lá embaixo — uma tela de consulta abrindo com "esta ação não grava
    alterações" é uma mensagem que não faz sentido nenhum para quem revisa.
    O mês pedido entra nas datas para a grade não nascer vazia. */
 else if(endpoint==='painel-agenda'){
   const mes=/^\d{4}-(0[1-9]|1[0-2])$/.test(corpo.mes||'') ? corpo.mes : '2026-09';
   const d=n=>`${mes}-${String(n).padStart(2,'0')}`;
   if(corpo.action==='producao') dados={hoje:d(14),consultadoEm:new Date().toISOString(),
     os:[
      {id:'os-demo-1',numero:'23096',cliente:'Cliente de demonstração',servico:'Placa de obra',endereco:'Rua de exemplo, 100',data:d(14),rotuloHora:'07:30',ordemHora:'07:30',duracaoDias:1,equipe:['Ana Exemplo','Bruno Exemplo'],veiculo:'Utilitário de exemplo',dias:[d(14)],status:'confirmada',rotuloStatus:'Confirmada',interno:false,finalizada:false},
      {id:'os-demo-2',numero:'23131',cliente:'Outro cliente de exemplo',servico:'Fachada em ACM',endereco:'Avenida de exemplo, 2000',data:d(16),rotuloHora:'Manhã',ordemHora:'08:00',duracaoDias:2,equipe:['Ana Exemplo'],veiculo:'',dias:[d(16),d(17)],status:'agendada',rotuloStatus:'Agendada',interno:false,finalizada:false},
      {id:'os-demo-3',numero:'23182',cliente:'Retirada de demonstração',servico:'Adesivos',endereco:'',data:d(18),rotuloHora:'—',ordemHora:'23:59',duracaoDias:1,equipe:[],veiculo:'',dias:[d(18)],status:'apto',rotuloStatus:'Pronto p/ retirada',interno:true,finalizada:false},
     ],
     eventos:[{id:'ev-demo',titulo:'Manutenção da impressora (exemplo)',data:d(16)}],
     plantoes:[{id:'pl-demo',data:d(14),tipo:'diarista',quem:'Bruno Exemplo',titulo:'Plantão de exemplo',inicio:'08:00',fim:'17:00'}]};
   else if(corpo.action==='empresa') dados={hoje:d(14),consultadoEm:new Date().toISOString(),
     eventos:[
      {id:'ev-1',titulo:'Feriado de demonstração',data:d(7),tipo:'Feriado',cor:'#dc2626',hora:'',descricao:'',recorrenteAnual:true},
      {id:'ev-2',titulo:'Reunião geral (exemplo)',data:d(14),tipo:'Reunião',cor:'#16334f',hora:'09:00',descricao:'Exemplo para conferir o desenho.',recorrenteAnual:false},
      {id:'ev-3',titulo:'Aniversário da empresa (exemplo)',data:d(22),tipo:'Empresa',cor:'#16a34a',hora:'',descricao:'',recorrenteAnual:true},
     ]};
   else return new Response(JSON.stringify({erro:'Prévia local: ação desconhecida.'}),{status:400,headers:{'Content-Type':'application/json'}});
 }
 else return new Response(JSON.stringify({erro:'Prévia local: esta ação não grava alterações nos sistemas.'}),{status:409,headers:{'Content-Type':'application/json'}});
 return new Response(JSON.stringify({ok:true,...dados}),{status:200,headers:{'Content-Type':'application/json'}});
}
