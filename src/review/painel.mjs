import {respostaComercial} from './comercial.mjs';
import {respostaReunioes} from './reunioes.mjs';
// Respostas fictícias, carregadas apenas na compilação review. Estrutura pode
// ser criada/editada SOMENTE nesta memória; recarregar restaura os exemplos.
const configs = {
 compromissos:{ex1:{titulo:'Conferir prioridades da semana',tipo:'visita',data:'2026-09-08',hora:'09:00',dono:'demo',donoNome:'Conta de demonstração',feito:false},ex2:{titulo:'Revisar proposta com o cliente exemplo',tipo:'outro',data:'2026-09-03',dono:'demo',donoNome:'Conta de demonstração',feito:false}},
 /* Contas FICTÍCIAS (CNPJ e chaves de teste, de ninguém): a tela só mostra titular Impresilk ou Universo.
    A ex4 tem o tipo da chave errado de propósito, para a prévia mostrar o aviso. */
 bancos:{ex1:{grupo:'Impresilk',banco:'BTG 208',titular:'Impresilk',doc:'11.222.333/0001-81',agencia:'0050',conta:'000000-1',pix:'123e4567-e12b-12d1-a456-426655440000',pixTipo:'Aleatoria',ordem:0},ex2:{grupo:'Impresilk',banco:'Sicoob Credinor',titular:'Impresilk',doc:'11.222.333/0001-81',agencia:'0000',conta:'00.000-0',pix:'11.222.333/0001-81',pixTipo:'CNPJ',codigoBanco:'756',ordem:1},ex3:{grupo:'Impresilk',banco:'BB',titular:'Impresilk',doc:'11.222.333/0001-81',agencia:'0000-0',conta:'00000-0',pix:'',pixTipo:'Conta e agencia',ordem:2},ex4:{grupo:'Universo',banco:'Sicoob Credinosso',titular:'Universo',doc:'11.444.777/0001-61',agencia:'0000',conta:'00.000-0',pix:'123e4567-e12b-12d1-a456-426655440001',pixTipo:'CNPJ',ordem:3}},
 marketing:{ex1:{nome:'Biblioteca da marca (exemplo)',url:'https://example.com'},acao1:{tipo:'acao',nome:'Apresentação de fachadas (exemplo)',objetivo:'Gerar oportunidades de sinalização para lojas',publico:'Comércio local',canal:'Portfólio e redes sociais',responsavel:'Ana Exemplo',prazo:'2026-09-15',status:'Produção',investimento:500,orcamentos:[],url:''}},
 patrimonio:{ex1:{nomeGenerico:'Impressora',descricaoTecnica:'Equipamento de demonstração',origemAtivoId:'maq-demo',setorSigla:'PRO',codigo:'PRO-001',valor:10000,situacao:'uso',dataAquisicao:'2026-01-10'}},
 setores:{ex1:{sigla:'PRO',nome:'Produção',area:'Operações'}},
 patrimonio_controles:Object.fromEntries(['ramais','armarios','ferramentas','camas','celulares'].map((tipo,i)=>['controle-'+tipo,{tipo,numero:tipo==='celulares'?'(38) 99999-0000':String(i+1).padStart(2,'0'),modelo:tipo==='celulares'?'Samsung Galaxy A15':'',telefone:'(38) 3000-0000',pessoa:'Ana Exemplo',observacao:'Cadastro de demonstração',atualizadoEm:'2026-10-05T12:00:00Z',atualizadoPorNome:'Conta de demonstração'}])),
 manutencoes:{},permutas:{},campanhas:{},grupos_clientes:{},
};
// Acervo fictício: permite revisar entrega parcial e avaliação mensal sem gravar no servidor.
Object.assign(configs.patrimonio_controles['controle-ferramentas'], {
 acervo:[{id:'item-alicate',nome:'Alicate universal',quantidade:3,estado:'bom',observacao:'Isolação íntegra'},{id:'item-chave',nome:'Chave de fenda',quantidade:2,estado:'desgaste',observacao:'Conferir cabo'}],
 movimentacoes:[{id:'entrega-demo',tipo:'entrega',itemId:'item-alicate',itemNome:'Alicate universal',quantidade:1,pessoa:'Bruno Exemplo',data:'2026-10-01',estado:'bom',observacao:'Instalação externa',criadoEm:'2026-10-01T12:00:00Z',criadoPorNome:'Conta de demonstração'}],
 avaliacoes:[{id:'avaliacao-demo',data:'2026-10-01',proximaData:'2026-11-01',observacao:'Conferência mensal de demonstração',criadoEm:'2026-10-01T15:00:00Z',criadoPorNome:'Ana Exemplo',itens:[{itemId:'item-alicate',itemNome:'Alicate universal',quantidadeConferida:2,quantidadeEsperada:2,estado:'bom',observacao:''},{itemId:'item-chave',itemNome:'Chave de fenda',quantidadeConferida:1,quantidadeEsperada:2,estado:'desgaste',observacao:'Uma chave não encontrada'}]}]
});
const equipamentosDemo=[
 {id:'car-demo',tipo:'veiculo',nome:'Utilitário de demonstração',categoria:'Utilitário',identificacao:'VEI-01',responsavel:'Ana Exemplo',especificacao:{placa:'EXE1A23',marcaModelo:'Utilitário exemplo',ano:'2024',motorista:'Ana Exemplo'},atualizadoEm:'2026-10-05T12:00:00Z',atualizadoPor:'Conta de demonstração'},
 {id:'maq-demo',tipo:'maquina',nome:'Impressora de demonstração',categoria:'Impressão',responsavel:'Bruno Exemplo',setorSigla:'PRO',especificacao:{fabricante:'Fabricante exemplo',modelo:'Impressora UV',numeroSerie:'DEMO-001',setor:'Produção'},atualizadoEm:'2026-10-05T12:00:00Z',atualizadoPor:'Conta de demonstração'}
];
const estruturasDemo = [
 {id:'predial-ac-demo',nome:'Ar-condicionado da recepção · exemplo',categoria:'Ar-condicionado',identificacao:'AC-DEMO-01',responsavel:'Ana Exemplo',especificacao:{local:'Recepção de demonstração',marcaModelo:'Fabricante exemplo · 12.000 BTU',quantidade:'1',instalacao:'2025-04-10'}},
 {id:'predial-fan-demo',nome:'Ventiladores da produção · exemplo',categoria:'Ventilador',identificacao:'VT-DEMO-01',responsavel:'Bruno Exemplo',especificacao:{local:'Produção de demonstração',marcaModelo:'Ventilador de parede exemplo',quantidade:'3',instalacao:'2025-06-15'}},
 {id:'predial-agua-demo',nome:'Caixa d’água principal · exemplo',categoria:'Caixa-d’água',identificacao:'CX-DEMO-01',responsavel:'Ana Exemplo',especificacao:{local:'Cobertura de demonstração',marcaModelo:'Reservatório exemplo · 1.000 L',quantidade:'1',instalacao:'2024-02-20'}},
 {id:'predial-portao-demo',nome:'Portão de acesso · exemplo',categoria:'Portão',identificacao:'PT-DEMO-01',responsavel:'Bruno Exemplo',especificacao:{local:'Entrada de demonstração',marcaModelo:'Portão deslizante exemplo',quantidade:'1',instalacao:'2024-03-12'}},
].map(item=>({...item,tipo:'predial',bemId:'',observacao:'Dados inteiramente fictícios para revisão local.',atualizadoEm:'2026-10-05T12:00:00Z',atualizadoPor:'Conta de demonstração'}));
const erroPreview = (erro,status=400) => new Response(JSON.stringify({erro}),{status,headers:{'Content-Type':'application/json'}});
function salvarEstruturaPreview(corpo){
 const item=corpo.item;
 if(!item || typeof item!=='object' || Array.isArray(item))return erroPreview('Informe a estrutura.');
 if(item.tipo && item.tipo!=='predial')return erroPreview('Tipo inválido para Estrutura.');
 const limpar=(valor,max=180)=>String(valor??'').trim().slice(0,max);
 const nome=limpar(item.nome),categoria=limpar(item.categoria),local=limpar(item.especificacao?.local,120);
 if(!nome || !categoria || !local)return erroPreview('Informe nome, categoria e local.');
 const quantidade=limpar(item.especificacao?.quantidade,120);
 if(!/^\d+$/.test(quantidade) || !Number.isInteger(Number(quantidade)) || Number(quantidade)<1 || Number(quantidade)>1000000)return erroPreview('Informe uma quantidade inteira entre 1 e 1.000.000.',422);
 const instalacao=limpar(item.especificacao?.instalacao,120);
 if(instalacao && (!/^\d{4}-\d{2}-\d{2}$/.test(instalacao) || instalacao.startsWith('0000') || !Number.isFinite(Date.parse(instalacao+'T00:00:00Z')) || new Date(instalacao+'T00:00:00Z').toISOString().slice(0,10)!==instalacao))return erroPreview('Informe uma data de instalação válida.',422);
 if(!item.id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.cadastroId||''))return erroPreview('Identificador de cadastro inválido.');
 const id=limpar(item.id || item.cadastroId);
 const indice=estruturasDemo.findIndex(estrutura=>estrutura.id===id),anterior=estruturasDemo[indice];
 if(item.id && !anterior)return erroPreview('Estrutura não encontrada.',404);
 if(!item.id && anterior)return {item:structuredClone(anterior)};
 if(anterior && corpo.versao!==anterior.atualizadoEm)return erroPreview('Este cadastro mudou. Atualize a lista e confira antes de salvar.',409);
 const atualizadoEm=new Date(Math.max(Date.now(),Date.parse(anterior?.atualizadoEm||'')+1||0)).toISOString();
 const salvo={id,tipo:'predial',nome,categoria,identificacao:limpar(item.identificacao),responsavel:limpar(item.responsavel),observacao:limpar(item.observacao,2000),bemId:anterior?.bemId||'',especificacao:Object.fromEntries(['local','marcaModelo','quantidade','instalacao'].map(campo=>[campo,campo==='quantidade' && quantidade?String(Number(quantidade)):limpar(item.especificacao?.[campo],120)])),atualizadoEm,atualizadoPor:'Conta de demonstração'};
 if(indice>=0)estruturasDemo[indice]=salvo;else estruturasDemo.push(salvo);
 return {item:structuredClone(salvo)};
}
export async function respostaPreview(url,opcoes={}){
 const u=new URL(url,location.origin), corpo=opcoes.body ? JSON.parse(opcoes.body) : {};
 const endpoint=u.pathname.split('/').pop();
 if(endpoint==='painel-comercial')return respostaComercial(corpo);
 if(endpoint==='painel-reunioes')return respostaReunioes(corpo);
 let dados;
 if(endpoint==='painel-config' && corpo.action==='lixeiraRegistros') dados={itens:[]};
 else if(endpoint==='painel-fotos' && corpo.action==='resumo') dados={porBem:{}};
 else if(endpoint==='painel-fotos' && corpo.action==='listar') dados={fotos:[]};
 else if(endpoint==='painel-config' && corpo.action==='get'){
   if(corpo.chave==='glossario'){
     const {GLOSSARIO}=await import('../data/glossario.js');
     dados={valor:Object.fromEntries(GLOSSARIO.map((t,i)=>[`demo-${i}`,{...t,ordem:i}]))};
   }else dados={valor:structuredClone(configs[corpo.chave] || {})};
 }else if(endpoint==='painel-ativos' && corpo.action==='listarPatrimonio') dados={itens:structuredClone([...equipamentosDemo,...estruturasDemo])};
 else if(endpoint==='painel-ativos' && corpo.action==='salvarEstrutura'){
   dados=salvarEstruturaPreview(corpo);
   if(dados instanceof Response)return dados;
 }
 else if(endpoint==='painel-ativos' && ['listar','lixeira'].includes(corpo.action)) dados={itens:corpo.action==='lixeira'?[]:[
  {id:'doc-demo',tipo:'documento',nome:'Certidão de demonstração',categoria:'Certidão',validade:'2026-09-20',responsavel:'Ana Exemplo'},
  ...structuredClone(equipamentosDemo),...structuredClone(estruturasDemo),
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
