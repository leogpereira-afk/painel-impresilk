import {respostaAgenda,pessoasAgenda} from './compromissos.mjs';
import {respostaComercial,agendaComercialDemo} from './comercial.mjs';
import {respostaReunioes} from './reunioes.mjs';
import {respostaMarketing} from './marketing.mjs';
import {respostaDocumentos,agendaDocumentosDemo} from './documentos.mjs';
import {validarVinculoPessoa,prepararPessoasControle} from '../../supabase/functions/_shared/patrimonio-pessoas.mjs';
import {prepararControle} from '../../supabase/functions/_shared/patrimonio-controles.mjs';
import {prepararFisico,prepararConferencia} from '../../supabase/functions/_shared/patrimonio-fisico.mjs';
import {vencimentosIncendio} from '../../supabase/functions/_shared/patrimonio-incendio.mjs';
import {inventarioPermitido,bemPermitido,ativoPermitido,temPermissao} from '../../supabase/functions/_shared/patrimonio-acesso.mjs';
import {getSessao} from '../lib/sessao.js';
import {prepararInfra,infraPermitida} from '../../supabase/functions/_shared/patrimonio-infra.mjs';
import {criarVinculoPrevia,projetarFicha} from './vinculo.mjs';
const pessoasPatrimonioDemo=[
 {id:'rh-demo-ana-1',nome:'Ana Exemplo',idPessoa:'900001',disponivel:true},
 {id:'rh-demo-ana-2',nome:'Ana Exemplo',idPessoa:'900002',disponivel:true},
 {id:'rh-demo-bruno',nome:'Bruno Exemplo Atualizado',idPessoa:'900003',disponivel:true},
 {id:'rh-demo-inativo',nome:'Colaborador desligado · exemplo',idPessoa:'900004',disponivel:false},
];
// Respostas fictícias, carregadas apenas na compilação review. Estrutura pode
// e os controles podem ser editados SOMENTE nesta memória; recarregar restaura os exemplos.
const configs = {
 /* Contas FICTÍCIAS (CNPJ e chaves de teste, de ninguém): a tela só mostra titular Impresilk ou Universo.
    A ex4 tem o tipo da chave errado de propósito, para a prévia mostrar o aviso.
    A ex5 junta os casos raros do cartão compacto: banco sem número conhecido,
    titular diferente do nome da seção, CPF, agência e conta compridas e chave
    por e-mail. */
 bancos:{ex1:{grupo:'Impresilk',banco:'BTG 208',titular:'Impresilk',doc:'11.222.333/0001-81',agencia:'0050',conta:'000000-1',pix:'123e4567-e12b-12d1-a456-426655440000',pixTipo:'Aleatoria',ordem:0},ex2:{grupo:'Impresilk',banco:'Sicoob Credinor',titular:'Impresilk',doc:'11.222.333/0001-81',agencia:'0000',conta:'00.000-0',pix:'11.222.333/0001-81',pixTipo:'CNPJ',codigoBanco:'756',ordem:1},ex3:{grupo:'Impresilk',banco:'BB',titular:'Impresilk',doc:'11.222.333/0001-81',agencia:'0000-0',conta:'00000-0',pix:'',pixTipo:'Conta e agencia',ordem:2},ex4:{grupo:'Universo',banco:'Sicoob Credinosso',titular:'Universo',doc:'11.444.777/0001-61',agencia:'0000',conta:'00.000-0',pix:'123e4567-e12b-12d1-a456-426655440001',pixTipo:'CNPJ',ordem:3},ex5:{grupo:'Universo',banco:'Cooperativa Exemplo',titular:'Universo Holding Exemplo',doc:'111.444.777-35',agencia:'1234-5',conta:'12345678-9',pix:'financeiro@exemplo.com.br',pixTipo:'E-mail',ordem:4}},
 marketing:{ex1:{nome:'Biblioteca da marca (exemplo)',url:'https://example.com'}},
 patrimonio:{ex1:{nomeGenerico:'Impressora',descricaoTecnica:'Equipamento de demonstração',origemAtivoId:'maq-demo',setorSigla:'PRO',codigo:'PRO-001',valor:10000,situacao:'uso',dataAquisicao:'2026-01-10',responsavelId:'rh-demo-bruno',responsavel:'Bruno Exemplo'}},
 setores:{ex1:{sigla:'PRO',nome:'Produção',area:'Operações'}},
 patrimonio_controles:Object.fromEntries(['ramais','armarios','ferramentas','camas','celulares'].map((tipo,i)=>['controle-'+tipo,{tipo,numero:tipo==='celulares'?'(38) 99999-0000':String(i+1).padStart(2,'0'),modelo:tipo==='celulares'?'Samsung Galaxy A15':'',telefone:'(38) 3000-0000',pessoa:'Ana Exemplo',observacao:'Cadastro de demonstração',atualizadoEm:'2026-10-05T12:00:00Z',atualizadoPorNome:'Conta de demonstração'}])),
 manutencoes:{
  'servico-car-demo':{ativoId:'car-demo',data:'2026-10-01',valor:120,tipo:'preventiva',descricao:'Revisão de demonstração',proxima:'2026-11-01'},
  'servico-maq-demo':{ativoId:'maq-demo',data:'2026-10-02',valor:350,tipo:'corretiva',descricao:'Ajuste de demonstração',proxima:'2026-10-05'},
  'servico-removido-demo':{ativoId:'retirado-demo',data:'2026-10-03',valor:80,tipo:'corretiva',descricao:'Serviço histórico de demonstração'},
 },permutas:{},campanhas:{},grupos_clientes:{},
};
// Acervo fictício: permite revisar entrega parcial e avaliação mensal sem gravar no servidor.
Object.assign(configs.patrimonio_controles['controle-ferramentas'], {
 acervo:[{id:'item-alicate',nome:'Alicate universal',quantidade:3,estado:'bom',observacao:'Isolação íntegra'},{id:'item-chave',nome:'Chave de fenda',quantidade:2,estado:'desgaste',observacao:'Conferir cabo'}],
 movimentacoes:[{id:'entrega-demo',tipo:'entrega',itemId:'item-alicate',itemNome:'Alicate universal',quantidade:1,pessoa:'Bruno Exemplo',data:'2026-10-01',estado:'bom',observacao:'Instalação externa',criadoEm:'2026-10-01T12:00:00Z',criadoPorNome:'Conta de demonstração'}],
 avaliacoes:[{id:'avaliacao-demo',data:'2026-10-01',proximaData:'2026-11-01',observacao:'Conferência mensal de demonstração',criadoEm:'2026-10-01T15:00:00Z',criadoPorNome:'Ana Exemplo',itens:[{itemId:'item-alicate',itemNome:'Alicate universal',quantidadeConferida:2,quantidadeEsperada:2,estado:'bom',observacao:''},{itemId:'item-chave',itemNome:'Chave de fenda',quantidadeConferida:1,quantidadeEsperada:2,estado:'desgaste',observacao:'Uma chave não encontrada'}]}]
});
const equipamentosDemo=[
 {id:'car-demo',tipo:'veiculo',nome:'Utilitário de demonstração',categoria:'Utilitário',identificacao:'VEI-01',responsavel:'Ana Exemplo',responsavelId:'rh-demo-ana-1',especificacao:{placa:'EXE1A23',marcaModelo:'Utilitário exemplo',ano:'2024',motorista:'Ana Exemplo',motoristaId:'rh-demo-ana-1'},atualizadoEm:'2026-10-05T12:00:00Z',atualizadoPor:'Conta de demonstração'},
 {id:'maq-demo',tipo:'maquina',nome:'Impressora de demonstração',categoria:'Impressão',responsavel:'Bruno Exemplo',responsavelId:'rh-demo-bruno',setorSigla:'PRO',especificacao:{fabricante:'Fabricante exemplo',modelo:'Impressora UV',numeroSerie:'DEMO-001',setor:'Produção'},atualizadoEm:'2026-10-05T12:00:00Z',atualizadoPor:'Conta de demonstração'}
];
equipamentosDemo.push(
 {id:'telefonia-demo-1',tipo:'informatica',categoria:'Telefone',nome:'Telefone de demonstração A',especificacao:{marcaModelo:'Modelo A de exemplo',numeroSerie:'DEMO-TEL-01'},atualizadoEm:'2026-10-01T12:00:00Z'},
 {id:'telefonia-demo-2',tipo:'informatica',categoria:'Telefone',nome:'Telefone de demonstração B',especificacao:{marcaModelo:'Modelo B de exemplo'},atualizadoEm:'2026-10-01T12:00:00Z'},
 {id:'central-demo',tipo:'informatica',categoria:'Central telefônica',nome:'Central de demonstração',especificacao:{marcaModelo:'PABX exemplo',local:'Sala técnica de exemplo'},atualizadoEm:'2026-10-01T12:00:00Z'}
);
Object.assign(configs.patrimonio_controles['controle-ramais'],{setorId:'ex1',local:'Bancada de exemplo',aparelhoId:'telefonia-demo-1',pessoaId:'rh-demo-ana-1'});
const extrasDemo=[
 {id:'pc-demo',tipo:'informatica',categoria:'Computador',nome:'Computador da produção · exemplo',responsavelId:'rh-demo-bruno',bemId:'bem-pc-demo',especificacao:{marcaModelo:'Computador de exemplo',numeroSerie:'PC-DEMO-01',setorId:'ex1',situacao:'uso',processador:'Processador exemplo',memoria:'16 GB',armazenamento:'512 GB'}},
 {id:'celular-demo',tipo:'informatica',categoria:'Celular',nome:'Celular de demonstração A',bemId:'bem-celular-demo',especificacao:{marcaModelo:'Modelo celular exemplo',imei:'000000000000001',situacao:'uso'}},
 {id:'celular-demo-2',tipo:'informatica',categoria:'Celular',nome:'Celular de demonstração B',especificacao:{marcaModelo:'Outro modelo exemplo',situacao:'reserva'}},
 {id:'dvr-demo',tipo:'seguranca',categoria:'DVR/NVR',nome:'Gravador de exemplo',especificacao:{marcaModelo:'NVR exemplo',canaisTotais:'8',diasGravacao:'15',local:'Sala técnica',situacao:'uso'}},
 {id:'camera-demo',tipo:'seguranca',categoria:'Câmera',nome:'Câmera da entrada · exemplo',especificacao:{numero:'01',posicao:'Entrada de exemplo',local:'Recepção',setorId:'ex1',ambiente:'interna',gravadorId:'dvr-demo',canal:'1',situacao:'uso'}},
 {id:'facial-demo',tipo:'seguranca',categoria:'Acesso facial',nome:'Acesso da recepção · exemplo',especificacao:{local:'Recepção',libera:'Porta de entrada',situacao:'uso',autorizados:[{id:'794f9907-29a1-4ff8-a4d0-086fc4d89112',pessoaId:'rh-demo-inativo',liberadoEm:'2026-10-01',bloqueadoEm:''}]}},
 {id:'chave-demo',tipo:'seguranca',categoria:'Chave',nome:'Chave da sala · exemplo',especificacao:{local:'Sala técnica',situacao:'uso',copias:[{id:'794f9907-29a1-4ff8-a4d0-086fc4d89113',numero:'01',tipo:'chave',pessoaId:'rh-demo-ana-1',entrega:'2026-10-01',devolucao:''}]}},
 {id:'alarme-demo',tipo:'seguranca',categoria:'Alarme',nome:'Central de alarme · exemplo',especificacao:{local:'Recepção',situacao:'uso'}},
 {id:'portao-demo',tipo:'seguranca',categoria:'Portão',nome:'Motor do portão · exemplo',especificacao:{local:'Entrada',automatizador:'Motor de exemplo',situacao:'uso'}},
 {id:'ponto-demo',tipo:'seguranca',categoria:'Relógio de ponto',nome:'Relógio de ponto · exemplo',especificacao:{local:'Recepção',numeroSerie:'DEMO-PONTO-01',situacao:'uso'}},
 {id:'extintor-demo',tipo:'predial',categoria:'Extintor',nome:'Extintor da produção · exemplo',validade:'2026-10-25',especificacao:{numero:'01',tipoExtintor:'Pó ABC de exemplo',capacidade:'4 kg',local:'Parede da entrada',setorId:'ex1',situacao:'uso'}},
 {id:'avcb-demo',tipo:'predial',categoria:'AVCB',nome:'AVCB · documento de exemplo',identificacao:'EXEMPLO-01',validade:'2027-10-11',especificacao:{local:'Prédio de demonstração',situacao:'uso'}},
 {id:'luz-demo',tipo:'predial',categoria:'Iluminação de emergência',nome:'Luminária de emergência · exemplo',validade:'2026-10-24',especificacao:{numero:'01',local:'Saída de exemplo',testeAutonomiaMinutos:'60',situacao:'uso'}},
 {id:'placa-demo',tipo:'predial',categoria:'Sinalização de segurança',nome:'Placa da saída · exemplo',validade:'2026-11-01',especificacao:{numero:'01',local:'Saída de exemplo',tipoSinalizacao:'Saída',situacao:'uso'}},
].map(i=>({...i,atualizadoEm:'2026-10-05T12:00:00Z',atualizadoPor:'Conta de demonstração'}));
equipamentosDemo.push(...extrasDemo);
configs.patrimonio['bem-pc-demo']={codigo:'PRO-002',origemAtivoId:'pc-demo',nomeGenerico:'Computador exemplo',valor:5000,nf:'NF-FICTICIA-PC',dataAquisicao:'2025-01-01',situacao:'uso',setorSigla:'PRO'};
configs.patrimonio['bem-celular-demo']={codigo:'PRO-003',origemAtivoId:'celular-demo',nomeGenerico:'Celular exemplo',valor:1000,nf:'NF-FICTICIA-CEL',situacao:'uso',setorSigla:'PRO'};
Object.assign(configs.patrimonio_controles['controle-celulares'],{operadora:'Operadora exemplo',pessoaId:'rh-demo-ana-1',aparelhoId:'celular-demo'});
configs.patrimonio_seguranca_checklists={};
// Infraestrutura fictícia: nomes, contatos, contratos e valores só existem
// nesta memória da prévia. Não são uma cópia de registros da empresa.
const infraDemoIds={tecnico:'12212212-1221-4221-8221-122122122121',comercial:'12212212-1221-4221-8221-122122122122',internet:'12212212-1221-4221-8221-122122122123',plano:'12212212-1221-4221-8221-122122122124',energia:'12212212-1221-4221-8221-122122122125',solar:'12212212-1221-4221-8221-122122122126',servidor:'12212212-1221-4221-8221-122122122127',transformador:'12212212-1221-4221-8221-122122122128'};
const versaoInfra='2026-10-05T12:00:00Z';
configs.patrimonio_infra={
 [infraDemoIds.tecnico]:{tipo:'contato',nome:'Técnico de demonstração',telefone:'(38) 3000-0000',whatsapp:'(38) 99999-0000',email:'tecnico@example.com',endereco:'Endereço fictício da revisão',atualizadoEm:versaoInfra},
 [infraDemoIds.comercial]:{tipo:'contato',nome:'Contato comercial de demonstração',telefone:'(38) 3000-0001',whatsapp:'(38) 99999-0001',email:'comercial@example.com',endereco:'Endereço fictício do plano',atualizadoEm:versaoInfra},
 [infraDemoIds.internet]:{tipo:'internet',operadora:'Operadora de demonstração',plano:'Link empresarial de exemplo',download:'600 Mbps',upload:'300 Mbps',valorMensal:299.90,inicioVigencia:'2026-01-01',fimVigencia:'2027-01-01',endereco:'Prédio de demonstração',tecnicoId:infraDemoIds.tecnico,atualizadoEm:versaoInfra},
 [infraDemoIds.plano]:{tipo:'plano-corporativo',operadora:'Operadora de demonstração',nome:'Plano corporativo de exemplo',valorMensal:199.99,quantidadeLinhas:3,franquia:'20 GB por linha · exemplo',inicioVigencia:'2026-01-01',fimVigencia:'2027-01-01',contatoId:infraDemoIds.comercial,atualizadoEm:versaoInfra},
};
Object.assign(configs.patrimonio_controles['controle-celulares'],{setorId:'ex1',status:'ativo',planoId:infraDemoIds.plano});
Object.assign(configs.patrimonio_controles['controle-ramais'],{status:'ativo'});
configs.patrimonio_controles['12212212-1221-4221-8221-122122122129']={tipo:'celulares',numero:'(38) 99999-0002',modelo:'',pessoaId:'',aparelhoId:'',setorId:'',status:'disponivel',planoId:infraDemoIds.plano,atualizadoEm:versaoInfra};
// Nomes digitados antes do vínculo pelo RH (todos fictícios): um com sugestão única,
// um ambíguo e um que é lugar, não pessoa. E um armário já ligado pelo ID.
for(const [id,numero,pessoa] of [['armario-nome-1','07','Bruno'],['armario-nome-2','08','Ana'],['armario-nome-3','10','Recepção']])
 configs.patrimonio_controles[id]={tipo:'armarios',numero,pessoa,pessoaId:'',observacao:'',atualizadoEm:'2026-10-05T12:00:00Z',atualizadoPorNome:'Conta de demonstração'};
configs.patrimonio_controles['ramal-nome-local']={tipo:'ramais',numero:'205',telefone:'',pessoa:'Recepção',pessoaId:'',local:'',setorId:'ex1',status:'ativo',aparelhoId:'',observacao:'',atualizadoEm:'2026-10-05T12:00:00Z',atualizadoPorNome:'Conta de demonstração'};
configs.patrimonio_controles['armario-ligado']={tipo:'armarios',numero:'09',pessoa:'Bruno Exemplo Atualizado',pessoaId:'rh-demo-bruno',pessoaIdPessoa:'900003',observacao:'',atualizadoEm:'2026-10-05T12:00:00Z',atualizadoPorNome:'Conta de demonstração'};
Object.assign(configs.patrimonio,{
 ex2:{nomeGenerico:'Veiculo',descricaoTecnica:'Utilitário exemplo',setorSigla:'PRO',codigo:'PRO-010',valor:50000,situacao:'uso',dataAquisicao:'2025-03-01'},
 ex3:{nomeGenerico:'Laser',descricaoTecnica:'Laser de demonstração',setorSigla:'PRO',codigo:'PRO-011',valor:30000,situacao:'uso',dataAquisicao:'2025-04-01'},
});
equipamentosDemo.push(
 {id:infraDemoIds.energia,tipo:'predial',categoria:'Padrão de energia',nome:'Entrada de energia · exemplo',especificacao:{local:'Entrada técnica',endereco:'Endereço fictício',unidadeConsumidora:'UC-DEMO-01',tensao:'220/380 V',potencia:'75 kW',tecnicoId:infraDemoIds.tecnico,situacao:'uso'},atualizadoEm:versaoInfra},
 {id:infraDemoIds.solar,tipo:'predial',categoria:'Usina fotovoltaica',nome:'Usina solar · exemplo',especificacao:{local:'Cobertura de demonstração',potenciaInstalada:'25 kWp',placas:'50 módulos · exemplo',inversores:'2 inversores · exemplo',unidadesConsumidoras:[infraDemoIds.energia],tecnicoId:infraDemoIds.tecnico,situacao:'uso'},atualizadoEm:versaoInfra},
 {id:infraDemoIds.transformador,tipo:'predial',categoria:'Transformador',nome:'Transformador · exemplo',identificacao:'TR-DEMO-01',especificacao:{local:'Área técnica',kva:'112.5',tecnicoId:infraDemoIds.tecnico,situacao:'uso'},atualizadoEm:versaoInfra},
 {id:infraDemoIds.servidor,tipo:'informatica',categoria:'Servidor',nome:'Servidor de demonstração',responsavelId:'rh-demo-bruno',especificacao:{local:'Sala técnica',setorId:'ex1',fabricante:'Fabricante de exemplo',modelo:'Servidor de exemplo',processador:'Processador de demonstração',memoria:'64 GB',armazenamento:'2 TB',rede:'Rede local de exemplo',enderecoIP:'192.0.2.10',backup:'Cópia diária de demonstração, sem credenciais',tecnicoId:infraDemoIds.tecnico,situacao:'uso'},atualizadoEm:versaoInfra}
);
// Vínculo bem ↔ ficha (tudo fictício), com os quatro estados do bloco Ligado a:
// sem ficha (ex2, ex3), ligado só pela ficha (luminária), ligado pelos dois lados
// (computador e celular) e a conferir (compressor cuja ficha foi retirada). A
// câmera mostra a ficha oculta para quem não tem Segurança.
configs.setores.ex2={sigla:'ADM',nome:'Administração',area:'Escritório'};
Object.assign(configs.patrimonio,{
 'bem-luz-demo':{codigo:'ADM-001',nomeGenerico:'Luminária de emergência',descricaoTecnica:'Ligada só pela ficha · exemplo',valor:300,nf:'NF-FICTICIA-LUZ',situacao:'uso',setorSigla:'ADM',responsavel:'Ana Exemplo'},
 'bem-conferir-demo':{codigo:'PRO-005',nomeGenerico:'Compressor',descricaoTecnica:'Ficha retirada · exemplo',origemAtivoId:'retirado-demo',valor:2000,nf:'NF-FICTICIA-CMP',situacao:'uso',setorSigla:'PRO',responsavel:'Bruno Exemplo'},
 'bem-camera-demo':{codigo:'PRO-006',nomeGenerico:'Câmera',descricaoTecnica:'Ligada a uma ficha de Segurança · exemplo',valor:400,nf:'NF-FICTICIA-CAM',situacao:'uso',setorSigla:'PRO',responsavel:'Ana Exemplo'},
 'bem-baixado-demo':{codigo:'PRO-007',nomeGenerico:'Monitor antigo',descricaoTecnica:'Baixado · exemplo',valor:0,situacao:'baixado',setorSigla:'PRO'},
});
Object.assign(equipamentosDemo.find(i=>i.id==='luz-demo'),{bemId:'bem-luz-demo'});
equipamentosDemo.find(i=>i.id==='luz-demo').especificacao.setorId='ex1';
Object.assign(equipamentosDemo.find(i=>i.id==='camera-demo'),{bemId:'bem-camera-demo'});
equipamentosDemo.find(i=>i.id==='pc-demo').historicoVinculo=[{id:'evento-demo-pc',acao:'vinculado',bemId:'bem-pc-demo',ativoId:'pc-demo',familia:'estrutura',nome:'Computador da produção · exemplo',bemCodigo:'PRO-002',lado:'ambos',via:'salvarFisico',por:'demo',porNome:'Conta de demonstração',em:'2026-10-05T12:00:00.000Z'}];
equipamentosDemo.push({id:'pc-baixado-demo',tipo:'informatica',categoria:'Computador',nome:'Computador baixado · exemplo',especificacao:{marcaModelo:'Modelo antigo de exemplo',situacao:'baixado'},atualizadoEm:'2026-10-05T12:00:00Z',atualizadoPor:'Conta de demonstração'});
const fichasDemo=()=>[...equipamentosDemo,...estruturasDemo];
const vinculoPrevia=criarVinculoPrevia({
 fichas:fichasDemo,
 gravarFicha:registro=>{for(const lista of [equipamentosDemo,estruturasDemo]){const i=lista.findIndex(f=>f.id===registro.id);if(i>=0){lista[i]=registro;return;}}equipamentosDemo.push(registro);},
 bens:configs.patrimonio,
 lixeiraFichas:new Map([['retirado-demo',{id:'retirado-demo',tipo:'maquina',nome:'Máquina retirada · exemplo',bemId:'',especificacao:{}}]]),
});
const contratosInfraDemo=new Map();
configs.manutencoes['pc-servico-demo']={ativoId:'pc-demo',data:'2026-10-01',valor:350,descricao:'Manutenção exemplo do computador',fornecedor:'Prestador de exemplo'};
configs.manutencoes['camera-servico-demo']={ativoId:'camera-demo',data:'2026-10-01',valor:75,descricao:'Conferência do enquadramento · exemplo',fornecedor:'Prestador de exemplo'};
configs.manutencoes['telefone-servico-demo']={ativoId:'telefonia-demo-1',data:'2026-10-01',valor:65,descricao:'Troca do cabo de exemplo',fornecedor:'Prestador de demonstração'};
const estruturasDemo = [
 {id:'predial-ac-demo',nome:'Ar-condicionado da recepção · exemplo',categoria:'Ar-condicionado',identificacao:'AC-DEMO-01',responsavel:'Ana Exemplo',especificacao:{local:'Recepção de demonstração',marcaModelo:'Fabricante exemplo · 12.000 BTU',quantidade:'1',instalacao:'2025-04-10'}},
 {id:'predial-fan-demo',nome:'Ventiladores da produção · exemplo',categoria:'Ventilador',identificacao:'VT-DEMO-01',responsavel:'Bruno Exemplo',especificacao:{local:'Produção de demonstração',marcaModelo:'Ventilador de parede exemplo',quantidade:'3',instalacao:'2025-06-15'}},
 {id:'predial-agua-demo',nome:'Caixa d’água principal · exemplo',categoria:'Caixa-d’água',identificacao:'CX-DEMO-01',responsavel:'Ana Exemplo',especificacao:{local:'Cobertura de demonstração',marcaModelo:'Reservatório exemplo · 1.000 L',quantidade:'1',instalacao:'2024-02-20'}},
 {id:'predial-portao-demo',nome:'Portão de acesso · exemplo',categoria:'Portão',identificacao:'PT-DEMO-01',responsavel:'Bruno Exemplo',especificacao:{local:'Entrada de demonstração',marcaModelo:'Portão deslizante exemplo',quantidade:'1',instalacao:'2024-03-12'}},
].map(item=>({...item,tipo:'predial',bemId:'',observacao:'Dados inteiramente fictícios para revisão local.',atualizadoEm:'2026-10-05T12:00:00Z',atualizadoPor:'Conta de demonstração'}));
const erroPreview = (erro,status=400,extra={}) => new Response(JSON.stringify({erro,...extra}),{status,headers:{'Content-Type':'application/json'}});
// Recusa do vínculo vai marcada, como no painel-ativos (erroVinculo).
const erroVinculoPreview = e => erroPreview(e.message,e.status||422,e.recusaVinculo?{recusaVinculo:true}:{});
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
 let pessoa;
 try{pessoa=validarVinculoPessoa(item,anterior,pessoasPatrimonioDemo,'responsavel');}catch(e){return erroPreview(e.message,e.status||422);}
 const salvo={id,tipo:'predial',nome,categoria,identificacao:limpar(item.identificacao),...pessoa,observacao:limpar(item.observacao,2000),bemId:anterior?.bemId||'',especificacao:Object.fromEntries(['local','marcaModelo','quantidade','instalacao'].map(campo=>[campo,campo==='quantidade' && quantidade?String(Number(quantidade)):limpar(item.especificacao?.[campo],120)])),atualizadoEm,atualizadoPor:'Conta de demonstração'};
 if(indice>=0)estruturasDemo[indice]=salvo;else estruturasDemo.push(salvo);
 return {item:structuredClone(salvo)};
}
// Máquina e carro na prévia: a mesma regra do painel_equipamento_gravar, só em memória.
function salvarEquipamentoPreview(corpo){
 const it=corpo.item,id=it.id||it.cadastroId,indice=equipamentosDemo.findIndex(a=>a.id===id),ant=equipamentosDemo[indice]||null;
 const falhar=(m,status=409)=>{throw Object.assign(new Error(m),{status});};
 if(corpo.patrimonio&&ant&&corpo.versao!==undefined&&corpo.versao!==(ant.atualizadoEm||''))falhar('Esta ficha mudou. Recarregue antes de salvar.');
 const item={...(ant||{}),...it,...validarVinculoPessoa(it,ant,pessoasPatrimonioDemo,'responsavel'),id,atualizadoEm:new Date().toISOString(),atualizadoPor:'Conta de demonstração'};
 delete item.cadastroId;
 if(corpo.patrimonio){
  const origens=Object.entries(configs.patrimonio).filter(([,b])=>b.origemAtivoId===id).map(([k])=>k);
  const ids=[...new Set([corpo.bemId,ant?.bemId,...origens].filter(Boolean))];
  if(ids.length>1)falhar('Vínculos de inventário divergentes. Confira antes de salvar.');
  const bemId=ids[0]||'bem-'+crypto.randomUUID().slice(0,8),bem=configs.patrimonio[bemId];
  if(bem?.origemAtivoId&&bem.origemAtivoId!==id)falhar('Bem já vinculado a outro equipamento.');
  if(equipamentosDemo.some(a=>a.id!==id&&a.bemId===bemId))falhar('Vínculo de inventário já utilizado.');
  const novo={...(bem||{}),...corpo.patrimonio,origemAtivoId:id};
  if(!novo.codigo){const sigla=novo.setorSigla||'GER';novo.codigo=`${sigla}-${String(Object.values(configs.patrimonio).filter(b=>String(b.codigo||'').startsWith(sigla+'-')).length+1).padStart(3,'0')}`;}
  configs.patrimonio[bemId]=novo;item.bemId=bemId;
 }
 if(indice>=0)equipamentosDemo[indice]=item;else equipamentosDemo.push(item);
 return structuredClone(item);
}
export async function respostaPreview(url,opcoes={}){
 const u=new URL(url,location.origin), corpo=opcoes.body ? JSON.parse(opcoes.body) : {};
 const endpoint=u.pathname.split('/').pop();
 const ss=getSessao(),sessao={sub:'demo',nome:'Conta de demonstração',master:ss?.master,perms:ss?.permissoes||[]};
 if(endpoint==='painel-ativos'){
  const documentos=await respostaDocumentos(corpo,sessao,[...equipamentosDemo,...estruturasDemo]);
  if(documentos)return documentos;
 }
 if(endpoint==='painel-comercial')return respostaComercial(corpo,{...ss,sub:ss?.usuario||'demo',perms:ss?.permissoes||[]});
 if(endpoint==='painel-reunioes')return respostaReunioes(corpo);
 if(endpoint==='painel-marketing')return respostaMarketing(corpo);
 let dados;
 if(endpoint==='painel-config' && corpo.chave==='compromissos'){const agenda=respostaAgenda(corpo);return new Response(JSON.stringify({ok:!agenda.erro,...agenda}),{status:agenda.erro?409:200,headers:{'Content-Type':'application/json'}});}
 if(endpoint==='painel-config' && corpo.action==='pessoasCompromissos')dados={pessoas:structuredClone(pessoasAgenda)};
 else if(endpoint==='painel-config' && corpo.action==='pessoasPatrimonio')dados={pessoas:structuredClone(pessoasPatrimonioDemo)};
 else if(endpoint==='painel-config' && corpo.action==='patrimonioParametros')dados={limiteManutencaoPercentual:null};
 else if(endpoint==='painel-config'&&corpo.action==='lerInfra'){
  if(!temPermissao(sessao,'patrimonio'))return erroPreview('Sem acesso à infraestrutura.',403);
  const podeValores=temPermissao(sessao,'inventario-valores');dados={itens:Object.fromEntries(Object.entries(configs.patrimonio_infra).map(([id,r])=>[id,infraPermitida(r,podeValores)])),podeValores};
 }
 else if(endpoint==='painel-config'&&corpo.action==='salvarInfra'){
  if(!temPermissao(sessao,'patrimonio'))return erroPreview('Sem acesso à infraestrutura.',403);
  const anterior=configs.patrimonio_infra[corpo.id];
  if(corpo.versaoAnterior!==(anterior?.atualizadoEm??null))return erroPreview('Cadastro alterado. Atualize.',409);
  if(corpo.dados.tipo==='plano-corporativo'&&Object.entries(configs.patrimonio_infra).some(([id,r])=>id!==corpo.id&&r.tipo==='plano-corporativo'))return erroPreview('Já existe um plano corporativo.',409);
  if(Object.hasOwn(corpo.dados,'valorMensal')&&!temPermissao(sessao,'inventario-valores'))return erroPreview('Valor exige Inventário e valores.',403);
  try{const registro=prepararInfra(corpo.dados,anterior,{tecnicoId:configs.patrimonio_infra[corpo.dados.tecnicoId||anterior?.tecnicoId]?.tipo==='contato',contatoId:configs.patrimonio_infra[corpo.dados.contatoId||anterior?.contatoId]?.tipo==='contato'},sessao,new Date().toISOString());configs.patrimonio_infra[corpo.id]=registro;dados={item:{id:corpo.id,...infraPermitida(registro,temPermissao(sessao,'inventario-valores'))}};}catch(e){return erroPreview(e.message,e.status||422);}
 }
 else if(endpoint==='painel-config'&&['guardarContratoInfra','lerContratoInfra'].includes(corpo.action)){
  if(!temPermissao(sessao,'patrimonio')||!temPermissao(sessao,'inventario-valores'))return erroPreview('Contrato exige Inventário e valores.',403);
  const item=configs.patrimonio_infra[corpo.id];if(!item||!['internet','plano-corporativo'].includes(item.tipo))return erroPreview('Contrato não encontrado.',404);
  if(corpo.action==='guardarContratoInfra'){
   if(corpo.versaoAnterior!==item.atualizadoEm||item.contrato)return erroPreview('Cadastro alterado ou contrato já anexado.',409);
   contratosInfraDemo.set(corpo.id,{base64:corpo.base64,mime:corpo.mime,nome:corpo.nome});item.contrato={nome:corpo.nome,mime:corpo.mime};item.atualizadoEm=new Date().toISOString();dados={contrato:structuredClone(item.contrato)};
  }else {const contrato=contratosInfraDemo.get(corpo.id);if(!contrato)return erroPreview('Contrato não encontrado.',404);dados=structuredClone(contrato);}
 }
 else if(endpoint==='painel-config' && corpo.action==='lerConferencias')dados={itens:structuredClone(configs.patrimonio_seguranca_checklists)};
 else if(endpoint==='painel-config' && corpo.action==='salvarConferencia'){
  try{const item=prepararConferencia(corpo.dados,configs.patrimonio_seguranca_checklists[corpo.id],equipamentosDemo.filter(i=>i.tipo==='seguranca'&&i.categoria==='Câmera'&&i.especificacao?.situacao!=='baixado').map(i=>i.id),sessao,new Date().toISOString());configs.patrimonio_seguranca_checklists[corpo.id]=item;dados={item};}catch(e){return erroPreview(e.message,e.status||422);}
 }
 // Classificação em memória de um bem fictício existente; não habilita
 // gravação genérica nem chamadas à produção pela prévia.
 else if(endpoint==='painel-config' && corpo.action==='merge' && corpo.chave==='patrimonio'){
  if(!temPermissao(sessao,'inventario-valores'))return erroPreview('Esta operação exige Inventário e valores.',403);
  const entradas=Object.entries(corpo.patch||{});
  if(!entradas.length||entradas.some(([id,c])=>!configs.patrimonio[id]||!c||Object.keys(c).length!==1||!Object.hasOwn(c,'areaPatrimonio')))
   return erroPreview('Prévia: somente a área de bens fictícios existentes pode ser alterada.',409);
  if(entradas.some(([,c])=>!['','maquinas','carros','estrutura','outros'].includes(c.areaPatrimonio)))
   return erroPreview('Escolha Máquinas, Carros, Estrutura ou Somente no inventário.',422);
  for(const [id,c] of entradas)configs.patrimonio[id]={...configs.patrimonio[id],areaPatrimonio:c.areaPatrimonio};
  dados={valor:inventarioPermitido(structuredClone(configs.patrimonio),sessao)};
 }
 else if(endpoint==='painel-config' && corpo.action==='merge' && corpo.chave==='patrimonio_controles'){
   try{
     const proximo=structuredClone(configs.patrimonio_controles);
     for(const [id,campos] of Object.entries(corpo.patch||{}))proximo[id]=prepararControle(prepararPessoasControle(campos,proximo[id],pessoasPatrimonioDemo),proximo[id],{sub:'demo',nome:'Conta de demonstração'},new Date().toISOString(),{setor:configs.setores[campos.setorId],aparelho:equipamentosDemo.find(a=>a.id===campos.aparelhoId),plano:configs.patrimonio_infra[campos.planoId]?.tipo==='plano-corporativo',ocupado:Object.entries(proximo).some(([rid,r])=>rid!==id&&campos.aparelhoId&&r.aparelhoId===campos.aparelhoId)});
     configs.patrimonio_controles=proximo;dados={valor:structuredClone(proximo)};
   }catch(e){return erroPreview(e.message,e.status||422);}
 }
 else if(endpoint==='painel-config' && corpo.action==='lixeiraRegistros') dados={itens:[]};
 else if(endpoint==='painel-fotos' && corpo.action==='resumo') dados={porBem:{}};
 else if(endpoint==='painel-fotos' && corpo.action==='listar') dados={fotos:[]};
 else if(endpoint==='painel-config' && corpo.action==='get'){
   if(corpo.chave==='glossario'){
     const {GLOSSARIO}=await import('../data/glossario.js');
     dados={valor:Object.fromEntries(GLOSSARIO.map((t,i)=>[`demo-${i}`,{...t,ordem:i}]))};
   }else {let valor=structuredClone(configs[corpo.chave]||{});if(corpo.chave==='patrimonio')valor=inventarioPermitido(valor,sessao);if(corpo.chave==='manutencoes'&&!temPermissao(sessao,'seguranca'))valor=Object.fromEntries(Object.entries(valor).filter(([,r])=>!equipamentosDemo.some(i=>i.tipo==='seguranca'&&i.id===r.ativoId)));dados={valor};}
 }else if(endpoint==='painel-ativos' && corpo.action==='listarPatrimonio') dados={itens:fichasDemo().filter(i=>i.tipo==='seguranca'?temPermissao(sessao,'seguranca'):temPermissao(sessao,'patrimonio')||temPermissao(sessao,'inventario-valores')).map(i=>ativoPermitido(projetarFicha(i),sessao)),vinculosOcultos:vinculoPrevia.ocultos(sessao)};
 else if(endpoint==='painel-ativos' && ['vincularFicha','desvincularFicha','historicoVinculo'].includes(corpo.action)){
  try{dados=corpo.action==='vincularFicha'?vinculoPrevia.vincular(corpo,sessao):corpo.action==='desvincularFicha'?vinculoPrevia.desvincular(corpo,sessao):vinculoPrevia.historico(corpo,sessao);if(dados.bem)dados.bem=bemPermitido(dados.bem,sessao);}
  catch(e){return erroVinculoPreview(e);}
 }
 else if(endpoint==='painel-ativos' && corpo.action==='listar') dados={itens:structuredClone(equipamentosDemo.filter(i=>['veiculo','maquina'].includes(i.tipo)))};
 else if(endpoint==='painel-ativos' && corpo.action==='salvar' && ['veiculo','maquina'].includes(corpo.item?.tipo)){
  try{dados={item:salvarEquipamentoPreview(corpo)};}catch(e){return erroPreview(e.message,e.status||422);}
 }
 else if(endpoint==='painel-ativos' && corpo.action==='salvarFisico'){
  try{
   const it=corpo.item,id=it.id||it.cadastroId,indice=equipamentosDemo.findIndex(a=>a.id===id),ant=equipamentosDemo[indice];
   if(it.id&&(!ant||corpo.versao!==ant.atualizadoEm))return erroPreview('Este cadastro mudou. Atualize.',409);
   const fisico=prepararFisico(it,ant,{inventario:temPermissao(sessao,'inventario-valores'),bem:configs.patrimonio[it.bemId],setor:configs.setores[it.especificacao?.setorId],setorId:it.especificacao?.setorId,gravador:equipamentosDemo.find(a=>a.id===it.especificacao?.gravadorId),gravadorId:it.especificacao?.gravadorId,pessoas:pessoasPatrimonioDemo,tecnico:configs.patrimonio_infra[it.especificacao?.tecnicoId]?.tipo==='contato',unidadesConsumidoras:equipamentosDemo.filter(a=>a.categoria==='Padrão de energia'&&it.especificacao?.unidadesConsumidoras?.includes(a.id)).map(a=>a.id)});
   const responsavel=validarVinculoPessoa(it,ant,pessoasPatrimonioDemo,'responsavel');
   const vinculo=vinculoPrevia.conferirFormulario(it,ant,sessao,'salvarFisico');
   const item={...ant,...fisico,...responsavel,...vinculo,id,bemId:it.bemId??ant?.bemId??'',atualizadoEm:new Date().toISOString(),atualizadoPor:sessao.nome};
   if(indice>=0)equipamentosDemo[indice]=item;else equipamentosDemo.push(item);dados={item:projetarFicha(item)};
  }catch(e){return erroVinculoPreview(e);}
 }
 else if(endpoint==='painel-ativos'&&corpo.action==='guardarArquivoIncendio'){
  const i=equipamentosDemo.find(a=>a.id===corpo.id);if(!i)return erroPreview('Item não encontrado.',404);i.arquivoIncendio={nome:corpo.nome,mime:corpo.mime};dados={arquivoIncendio:i.arquivoIncendio};
 }
 else if(endpoint==='painel-ativos' && corpo.action==='salvarEstrutura'){
   dados=salvarEstruturaPreview(corpo);
   if(dados instanceof Response)return dados;
 }
 else if(endpoint==='painel-ativos' && corpo.action==='salvarTelefonia'){
  const i=corpo.item,id=i.id||i.cadastroId,anterior=equipamentosDemo.find(a=>a.id===id);
  if(i.id && corpo.versao!==(anterior?.atualizadoEm||''))return erroPreview('Ficha alterada. Atualize.',409);
  let vinculo;try{vinculo=vinculoPrevia.conferirFormulario(i,anterior,sessao,'salvarTelefonia');}catch(e){return erroVinculoPreview(e);}
  const item={...anterior,...i,...vinculo,id,tipo:'informatica',atualizadoEm:new Date().toISOString()};
  const ix=equipamentosDemo.findIndex(a=>a.id===id);if(ix>=0)equipamentosDemo[ix]=item;else equipamentosDemo.push(item);
  dados={item:projetarFicha(item)};
 }
 else if(endpoint==='painel-config' && corpo.action==='removerId' && corpo.chave==='patrimonio_controles'){delete configs.patrimonio_controles[corpo.id];dados={};}
 else if(endpoint==='painel-ativos' && ['listar','lixeira'].includes(corpo.action)) dados={itens:corpo.action==='lixeira'?[]:[
  {id:'doc-demo',tipo:'documento',nome:'Certidão de demonstração',categoria:'Certidão',validade:'2026-09-20',responsavel:'Ana Exemplo'},
  ...structuredClone(equipamentosDemo),...structuredClone(estruturasDemo),
  {id:'lic-demo',tipo:'licitacao',nome:'Sinalização de demonstração',identificacao:'Órgão de exemplo',edital:'Exemplo 01/2026',validade:'2026-09-15',hora:'10:00',status:'avaliar',valor:15000},
  {id:'mkt-demo',tipo:'marketing',nome:'Manual da marca (exemplo)',categoria:'Manual',observacao:'Exemplo para conferir a organização dos materiais',temArquivo:false}
 ]};
 else if(endpoint==='painel-auth' && corpo.action==='listarPessoas')dados={pessoas:pessoasAgenda};
 else if(endpoint==='painel-dados' && (!opcoes.method || opcoes.method==='GET')) dados={itens:[],meses:[],anos:[],linhas:[],cobertura:{desde:null,ate:null}};
 /* A AGENDA SÓ LÊ, então na prévia ela precisa RESPONDER, não cair no 409 de
    escrita lá embaixo — uma tela de consulta abrindo com "esta ação não grava
    alterações" é uma mensagem que não faz sentido nenhum para quem revisa.
    O mês pedido entra nas datas para a grade não nascer vazia. */
 else if(endpoint==='painel-agenda'){
   const mes=/^\d{4}-(0[1-9]|1[0-2])$/.test(corpo.mes||'') ? corpo.mes : '2026-09';
   const d=n=>`${mes}-${String(n).padStart(2,'0')}`;
   if(corpo.action==='comercial')dados=agendaComercialDemo(corpo.mes||'',{...ss,sub:ss?.usuario||'demo',perms:ss?.permissoes||[]});
   else if(corpo.action==='producao') dados={hoje:d(14),consultadoEm:new Date().toISOString(),
     os:[
      {id:'os-demo-1',numero:'23096',cliente:'Cliente de demonstração',servico:'Placa de obra',endereco:'Rua de exemplo, 100',data:d(14),rotuloHora:'07:30',ordemHora:'07:30',duracaoDias:1,equipe:['Ana Exemplo','Bruno Exemplo'],veiculo:'Utilitário de exemplo',dias:[d(14)],status:'confirmada',rotuloStatus:'Confirmada',interno:false,finalizada:false},
      {id:'os-demo-2',numero:'23131',cliente:'Outro cliente de exemplo',servico:'Fachada em ACM',endereco:'Avenida de exemplo, 2000',data:d(16),rotuloHora:'Manhã',ordemHora:'08:00',duracaoDias:2,equipe:['Ana Exemplo'],veiculo:'',dias:[d(16),d(17)],status:'agendada',rotuloStatus:'Agendada',interno:false,finalizada:false},
      {id:'os-demo-3',numero:'23182',cliente:'Retirada de demonstração',servico:'Adesivos',endereco:'',data:d(18),rotuloHora:'—',ordemHora:'23:59',duracaoDias:1,equipe:[],veiculo:'',dias:[d(18)],status:'apto',rotuloStatus:'Pronto p/ retirada',interno:true,finalizada:false},
     ],
     eventos:[{id:'ev-demo',titulo:'Manutenção da impressora (exemplo)',data:d(16)}],
     plantoes:[{id:'pl-demo',data:d(14),tipo:'diarista',quem:'Bruno Exemplo',titulo:'Plantão de exemplo',inicio:'08:00',fim:'17:00'}]};
   else if(corpo.action==='documentos')dados={eventos:agendaDocumentosDemo(mes,sessao,[...equipamentosDemo,...estruturasDemo])};
   else if(corpo.action==='patrimonio')dados={eventos:vencimentosIncendio(equipamentosDemo,mes)};
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
