// Regras de campo do Centro de Comando do Marketing (_shared/marketing.mjs).
// Começa pelo caso ruim: o que deixaria uma venda contada duas vezes ou um
// dado errado passar calado.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepararAcao,acaoParaTela,erroDoBanco,idAcao,ehDirecaoMarketing,podeMarketing,ErroMarketing,SITUACOES_ACAO} from '../supabase/functions/_shared/marketing.mjs';

const base={nome:'Reel da fachada',responsavel:'Ana',prazo:'2026-10-20',status:'Produção',investimento:150.555,orcamentos:['123','123',' 456 ',''],canal:'Instagram',url:'https://instagram.com/p/x'};

test('o caso ruim: orçamento repetido na mesma ação vira um só, e a ordem não importa', ()=>{
 assert.deepEqual(prepararAcao(base).orcamentos,['123','456']);
 assert.deepEqual(prepararAcao({...base,orcamentos:['456','123']}).orcamentos,['123','456']);
});

test('o caso ruim: orçamento com formato estranho é recusado, não gravado', ()=>{
 assert.throws(()=>prepararAcao({...base,orcamentos:['12; drop']}),ErroMarketing);
 assert.throws(()=>prepararAcao({...base,orcamentos:'123'}),ErroMarketing);
 assert.throws(()=>prepararAcao({...base,orcamentos:Array.from({length:301},(_,i)=>String(i))}),ErroMarketing);
});

test('campos obrigatórios, prazo real e situação da lista', ()=>{
 assert.throws(()=>prepararAcao({...base,nome:'   '}),/nome da ação/);
 assert.throws(()=>prepararAcao({...base,responsavel:''}),/responsável/);
 assert.throws(()=>prepararAcao({...base,prazo:'2026-02-30'}),/prazo/);
 assert.throws(()=>prepararAcao({...base,prazo:'20/10/2026'}),/prazo/);
 assert.throws(()=>prepararAcao({...base,status:'Feito'}),/Situação/);
 assert.equal(prepararAcao({...base,status:''}).dados.situacao,'Ideia');
 assert.deepEqual(SITUACOES_ACAO,['Ideia','Produção','Aprovação','Programada','Publicada','Encerrada']);
});

test('dinheiro: negativo recusado, centavos arredondados, vazio é zero', ()=>{
 assert.throws(()=>prepararAcao({...base,investimento:-1}),/negativo/);
 assert.throws(()=>prepararAcao({...base,investimento:'abc'}),/negativo/);
 assert.equal(prepararAcao(base).dados.investimento,150.56);
 assert.equal(prepararAcao({...base,investimento:''}).dados.investimento,0);
});

test('link só http(s), e espaços sobrando somem', ()=>{
 assert.throws(()=>prepararAcao({...base,url:'javascript:alert(1)'}),/http/);
 assert.equal(prepararAcao({...base,url:''}).dados.url,null);
 assert.equal(prepararAcao({...base,nome:'  Reel   da  fachada '}).dados.nome,'Reel da fachada');
});

test('a tela recebe os nomes de campo de antes', ()=>{
 const t=acaoParaTela({id:'a',nome:'X',canal_texto:'Instagram',responsavel_texto:'Ana',prazo:'2026-10-20',situacao:'Ideia',investimento:'10.50',versao:3,legado_id:'mkt-1'},['9','1']);
 assert.equal(t.canal,'Instagram');assert.equal(t.responsavel,'Ana');assert.equal(t.status,'Ideia');
 assert.equal(t.investimento,10.5);assert.deepEqual(t.orcamentos,['1','9']);assert.equal(t.migrada,true);assert.equal(t.versao,3);
});

test('erro do banco vira mensagem para gente, com o nome da outra ação', ()=>{
 const e=erroDoBanco({code:'23505',details:JSON.stringify({orcamento:'123',acao:'Outdoor Fenics'})});
 assert.equal(e.status,409);assert.match(e.message,/123.*Outdoor Fenics/);
 assert.equal(erroDoBanco({code:'23505',details:null}).status,409);
 assert.equal(erroDoBanco({code:'40001'}).status,409);
 assert.equal(erroDoBanco({code:'P0002'}).status,404);
 assert.equal(erroDoBanco({code:'XX000'}),null);
});

test('id de ação só UUID; direção é master ou "*"', ()=>{
 assert.equal(idAcao('7B0F6A52-1C2D-4E5F-8A9B-0C1D2E3F4A5B'),'7b0f6a52-1c2d-4e5f-8a9b-0c1d2e3f4a5b');
 assert.throws(()=>idAcao('mkt-1'),ErroMarketing);
 assert.equal(ehDirecaoMarketing({master:true}),true);assert.equal(ehDirecaoMarketing({perms:['*']}),true);
 assert.equal(ehDirecaoMarketing({perms:['marketing']}),false);assert.equal(podeMarketing({perms:['marketing']}),true);
 assert.equal(podeMarketing({perms:['orcamentos']}),false);assert.equal(podeMarketing(null),false);
});

// ---- Etapa a2 (11/10/2026): canais, playbook, publicações, números e papéis ----
import {prepararCanal,canalParaTela,codigoDoNome,prepararItemPlaybook,itemParaTela,prepararConclusao,prepararPublicacao,prepararLinhaCsv,
 publicacaoParaTela,prepararMetricas,metricasParaTela,prepararPapel,papelEfetivo,idPessoaDasContas,pessoasParaMarketing,padraoParaBanco,
 normalizarLink,segundaDaSemana,hojeSP,ICONES_CANAL} from '../supabase/functions/_shared/marketing.mjs';
import {CANAIS_PADRAO,PLAYBOOK_PADRAO} from '../supabase/functions/_shared/marketing-padrao.mjs';

const CANAL='c0000000-0000-4000-8000-000000000002';
const canalBase={nome:'Instagram',grupo:'digital',icone:'instagram',cor:'#C13584'};

test('o caso ruim: número não informado continua NULO; zero é zero; lixo é recusado', ()=>{
 const p=prepararPublicacao({canalId:CANAL,data:'2026-10-05',alcance:'',impressoes:null,engajamento:0,cliques:'12',leads:undefined});
 assert.equal(p.alcance,null);assert.equal(p.impressoes,null);assert.equal(p.engajamento,0);assert.equal(p.cliques,12);assert.equal(p.leads,null);
 for(const ruim of [-1,1.5,'1.234','12a',1e9+1,'abc',true])assert.throws(()=>prepararPublicacao({canalId:CANAL,data:'2026-10-05',alcance:ruim}),ErroMarketing,String(ruim));
 const t=publicacaoParaTela({id:'x',canal_id:CANAL,data:'2026-10-05',alcance:null,leads:0,fonte:'manual'});
 assert.equal(t.alcance,null);assert.equal(t.leads,0);
});

test('o caso ruim: o mesmo post colado de dois jeitos vira o MESMO link (o CSV não duplica)', ()=>{
 const a=normalizarLink('https://www.instagram.com/p/ABC123/?igsh=xyz&utm_source=ig_web#comentarios');
 const b=normalizarLink('  https://WWW.instagram.com/p/ABC123  ');
 assert.equal(a,b);assert.equal(a,'https://www.instagram.com/p/ABC123');
 // Parâmetro que muda a página fica (o site usa ?page_id=).
 assert.equal(normalizarLink('https://impresilk.com.br/?page_id=144&fbclid=1'),'https://impresilk.com.br/?page_id=144');
 assert.throws(()=>normalizarLink('javascript:alert(1)'),/http/);
 assert.throws(()=>normalizarLink('ftp://x.com/a'),/http/);
 assert.throws(()=>normalizarLink('https://localhost/a'),/http/);
 assert.equal(normalizarLink(''),null);
});

test('o caso ruim: canal com código, cor, ícone ou grupo fora da régua é recusado', ()=>{
 assert.throws(()=>prepararCanal({...canalBase,nome:''}),/nome do canal/);
 assert.throws(()=>prepararCanal({...canalBase,nome:'x'.repeat(61)}),/60/);
 assert.throws(()=>prepararCanal({...canalBase,cor:'vermelho'}),/#RRGGBB/);
 assert.throws(()=>prepararCanal({...canalBase,icone:'foguete'}),/ícone/);
 assert.throws(()=>prepararCanal({...canalBase,grupo:'social'}),/grupo/);
 assert.throws(()=>prepararCanal({...canalBase,codigo:'Instagram!'}),/código/);
 assert.throws(()=>prepararCanal({...canalBase,diasParado:0}),/1 a 90/);
 assert.throws(()=>prepararCanal({...canalBase,diasParado:91}),/1 a 90/);
 assert.throws(()=>prepararCanal({...canalBase,urlPerfil:'instagram.com/impresilk'}),/http/);
 assert.throws(()=>prepararCanal({...canalBase,mensagemWhatsapp:'x'.repeat(301)}),/300/);
 assert.throws(()=>prepararCanal({...canalBase,comercialCanal:'telepatia'}),/Comercial/);
 assert.throws(()=>prepararCanal({...canalBase,ativo:'sim'}),/ativo/);
 assert.throws(()=>prepararCanal(null),e=>e.status===400);
});

test('canal: código sai do nome, cor em minúscula, padrões e o código não muda na edição', ()=>{
 const c=prepararCanal({...canalBase,nome:'Google Meu Negócio'});
 assert.equal(c.codigo,'google-meu-negocio');assert.equal(c.cor,'#c13584');
 assert.equal(c.ativo,true);assert.equal(c.em_implantacao,false);assert.equal(c.dias_parado,7);assert.equal(c.ordem,0);
 assert.equal(codigoDoNome('  Ligação / Visita  '),'ligacao-visita');
 assert.equal(prepararCanal({...canalBase,comercialCanal:'whatsapp',mensagemWhatsapp:'Olá!\r\nQuero orçamento'}).mensagem_whatsapp,'Olá!\nQuero orçamento');
 // Edição: o código vem do que está gravado; outro código é recusado.
 const atual=canalParaTela({id:CANAL,codigo:'instagram',nome:'Instagram',grupo:'digital',icone:'instagram',cor:'#c13584',ordem:20,ativo:true,em_implantacao:false,dias_parado:7,versao:3});
 assert.equal(prepararCanal({...atual,ordem:5},{novo:false,codigoAtual:'instagram'}).codigo,null);
 assert.throws(()=>prepararCanal({...atual,codigo:'insta'},{novo:false,codigoAtual:'instagram'}),/não muda/);
 assert.equal(atual.urlPerfil,'');assert.equal(atual.emImplantacao,false);assert.equal(atual.versao,3);
});

test('o caso ruim: rotina sem recorrência, gatilho sem evento e implantação que não é ação única', ()=>{
 const base={canalId:CANAL,titulo:'Stories diários'};
 assert.throws(()=>prepararItemPlaybook({...base,tipo:'rotina'}),/recorrência/);
 assert.throws(()=>prepararItemPlaybook({...base,tipo:'rotina',recorrencia:'cada_n_dias'}),/intervalo/);
 assert.throws(()=>prepararItemPlaybook({...base,tipo:'rotina',recorrencia:'cada_n_dias',aCadaDias:366}),/1 a 365/);
 assert.throws(()=>prepararItemPlaybook({...base,tipo:'gatilho'}),/evento/);
 assert.throws(()=>prepararItemPlaybook({...base,tipo:'rotina',recorrencia:'semanal',implantacao:true}),/implantação/);
 assert.throws(()=>prepararItemPlaybook({...base,tipo:'tarefa'}),/tipo/);
 assert.throws(()=>prepararItemPlaybook({...base,tipo:'unica',canalId:'instagram'}),/canal/);
 assert.throws(()=>prepararItemPlaybook({...base,tipo:'unica',titulo:''}),/título/);
 assert.throws(()=>prepararItemPlaybook({...base,tipo:'unica',responsavelId:'Ana'}),/pessoa da lista/);
 assert.throws(()=>prepararItemPlaybook({...base,tipo:'unica',checklist:Array.from({length:31},(_,i)=>'passo '+i)}),/30/);
 assert.throws(()=>prepararItemPlaybook({...base,tipo:'unica',checklist:['x'.repeat(201)]}),/200/);
 assert.throws(()=>prepararItemPlaybook({...base,tipo:'unica',evidencia:'video'}),/evidência/);
 assert.throws(()=>prepararItemPlaybook({...base,tipo:'unica',prioridade:'urgente'}),/prioridade/);
 assert.throws(()=>prepararItemPlaybook({...base,tipo:'rotina',recorrencia:'semanal',metaQuantidade:1000}),/1 a 999/);
});

test('playbook: o que não combina com o tipo é descartado, não recusado; meta padrão 1', ()=>{
 const u=prepararItemPlaybook({canalId:CANAL,tipo:'unica',titulo:'Bio com UTM',recorrencia:'semanal',aCadaDias:5,metaQuantidade:4,gatilho:'x',checklist:[' a ','','b']});
 assert.equal(u.recorrencia,null);assert.equal(u.a_cada_dias,null);assert.equal(u.meta_quantidade,null);assert.equal(u.gatilho,null);
 assert.deepEqual(u.checklist,['a','b']);assert.equal(u.prioridade,'media');assert.equal(u.evidencia,'nenhuma');assert.equal(u.canal_id,CANAL);
 const r=prepararItemPlaybook({canalId:CANAL,tipo:'rotina',titulo:'Pins',recorrencia:'semanal',metaQuantidade:'10',aCadaDias:3});
 assert.equal(r.meta_quantidade,10);assert.equal(r.a_cada_dias,null);
 assert.equal(prepararItemPlaybook({canalId:CANAL,tipo:'rotina',titulo:'X',recorrencia:'diaria'}).meta_quantidade,1);
 const g=prepararItemPlaybook({canalId:CANAL,tipo:'gatilho',titulo:'Responder avaliação',gatilho:'avaliacao_nova',prazoDias:1});
 assert.equal(g.gatilho,'avaliacao_nova');assert.equal(g.prazo_dias,1);
 const t=itemParaTela({id:'i',canal_id:CANAL,tipo:'unica',titulo:'X',prioridade:'media',checklist:['a'],evidencia:'link',implantacao:true,ativo:true,ordem:3,versao:2});
 assert.equal(t.canalId,CANAL);assert.deepEqual(t.checklist,['a']);assert.equal(t.implantacao,true);assert.equal(t.evidenciaValor,'');assert.equal(t.concluidoEm,null);
});

test('o caso ruim: concluir item que pede link sem o link, ou rotina pela conclusão única', ()=>{
 assert.throws(()=>prepararConclusao({tipo:'unica',evidencia:'link'},{feito:true}),/link/);
 assert.throws(()=>prepararConclusao({tipo:'unica',evidencia:'link'},{feito:true,evidencia:'olhei'}),/http/);
 assert.throws(()=>prepararConclusao({tipo:'unica',evidencia:'texto'},{feito:true,evidencia:'  '}),/o que foi feito/);
 assert.throws(()=>prepararConclusao({tipo:'rotina',evidencia:'nenhuma'},{feito:true}),/agenda/);
 assert.throws(()=>prepararConclusao({tipo:'unica',evidencia:'nenhuma'},{feito:'sim'}),e=>e.status===400);
 assert.equal(prepararConclusao({tipo:'unica',evidencia:'link'},{feito:true,evidencia:'https://instagram.com/x'}),'https://instagram.com/x');
 assert.equal(prepararConclusao({tipo:'unica',evidencia:'nenhuma'},{feito:true}),null);
 // Desmarcar não pede evidência.
 assert.equal(prepararConclusao({tipo:'unica',evidencia:'link'},{feito:false}),null);
});

test('o caso ruim: semana que não é segunda, semana que ainda não começou, número desconhecido', ()=>{
 const hoje='2026-10-10'; // sábado
 assert.throws(()=>prepararMetricas({canalId:CANAL,semana:'2026-10-07',numeros:{alcance:1}},hoje),/segunda/);
 assert.throws(()=>prepararMetricas({canalId:CANAL,semana:'2026-10-12',numeros:{alcance:1}},hoje),/não começou/);
 assert.throws(()=>prepararMetricas({canalId:CANAL,semana:'2026-10-05',numeros:{curtidas:1}},hoje),/desconhecido/);
 assert.throws(()=>prepararMetricas({canalId:CANAL,semana:'2026-10-05',numeros:{}},hoje),/ao menos um/);
 assert.throws(()=>prepararMetricas({canalId:CANAL,semana:'2026-10-05',numeros:{alcance:-3}},hoje),/alcance/);
 const m=prepararMetricas({canalId:CANAL,semana:'2026-10-05',numeros:{seguidores:'5230',leads:null}},hoje);
 // Só o que veio vai para o banco (o resto fica como estava).
 assert.deepEqual(m,{canal:CANAL,semana:'2026-10-05',dados:{seguidores:5230,leads:null}});
 assert.equal(segundaDaSemana('2026-10-11'),'2026-10-05');assert.equal(segundaDaSemana('2026-10-05'),'2026-10-05');
 assert.equal(hojeSP(new Date('2026-10-12T02:00:00Z')),'2026-10-11'); // 23h de domingo em São Paulo
 const t=metricasParaTela({id:'m',canal_id:CANAL,semana:'2026-10-05',seguidores:5230,alcance:null,fonte:'manual',versao:1});
 assert.equal(t.seguidores,5230);assert.equal(t.alcance,null);assert.equal(t.canalId,CANAL);
});

test('CSV: a linha é uma publicação sem ação; aceita "link" no lugar de "url"', ()=>{
 const l=prepararLinhaCsv({canalId:CANAL,data:'2026-10-01',link:'https://example.com/p/1/',alcance:'300',acaoId:'7b0f6a52-1c2d-4e5f-8a9b-0c1d2e3f4a5b'});
 assert.equal(l.url,'https://example.com/p/1');assert.equal(l.alcance,300);assert.equal('acao_id' in l,false);
 assert.throws(()=>prepararLinhaCsv({canalId:CANAL,data:'01/10/2026'}),/data/);
 assert.throws(()=>prepararLinhaCsv('linha solta'),e=>e.status===400);
});

test('o caso ruim: papel ausente não apaga ninguém; papel fora da lista é recusado', ()=>{
 assert.throws(()=>prepararPapel({idPessoa:'123456'}),/papel/);
 assert.throws(()=>prepararPapel({idPessoa:'123456',papel:'dono'}),/gestão, marketing ou visualização/);
 assert.throws(()=>prepararPapel({idPessoa:'12345',papel:'gestao'}),/pessoa/);
 assert.throws(()=>prepararPapel({idPessoa:'Ana',papel:'gestao'}),/pessoa/);
 assert.deepEqual(prepararPapel({idPessoa:'123456',papel:null}),{id_pessoa:'123456',papel_escolhido:null});
 assert.deepEqual(prepararPapel({idPessoa:' 123456 ',papel:'visualizacao'}),{id_pessoa:'123456',papel_escolhido:'visualizacao'});
});

test('papel efetivo: direção é sempre gestão; sem linha é marketing; a linha manda nos outros', ()=>{
 assert.equal(papelEfetivo({master:true},{papel:'visualizacao'}),'gestao');
 assert.equal(papelEfetivo({perms:['*']},null),'gestao');
 assert.equal(papelEfetivo({perms:['marketing']},null),'marketing');
 assert.equal(papelEfetivo({perms:['marketing']},{papel:'visualizacao'}),'visualizacao');
 assert.equal(papelEfetivo({perms:['marketing']},{papel:'gestao'}),'gestao');
 assert.equal(papelEfetivo({perms:['marketing']},{papel:'inventado'}),'marketing');
});

test('o caso ruim: login com duas pessoas possíveis não vira nenhuma das duas', ()=>{
 assert.equal(idPessoaDasContas([{id_pessoa:'123456'},{id_pessoa:'654321'}]),null);
 assert.equal(idPessoaDasContas([]),null);
 assert.equal(idPessoaDasContas([{id_pessoa:null}]),null);
 assert.equal(idPessoaDasContas([{id_pessoa:'12'}]),null);
 assert.equal(idPessoaDasContas([{id_pessoa:'123456'},{id_pessoa:'123456'}]),'123456');
});

test('o caso ruim: o CPF nunca sai na lista de pessoas; id repetido ou sem CPF fica fora e é contado', ()=>{
 const status=[{id:'ativo',contaComoAtivo:'true'},{id:'fora',contaComoAtivo:'false'}];
 const areas=[{id:'mk',nome:'Marketing'}];
 const colab=[
  {id:'1',nome:'Ana Exemplo',cpf:'123.456.789-01',areaId:'mk',statusId:'ativo'},
  {id:'2',nome:'Bruno Exemplo',cpf:'98765432100',statusId:'ativo'},
  {id:'3',nome:'Carla Exemplo',cpf:'',statusId:'ativo'},                       // sem CPF
  {id:'4',nome:'Davi Exemplo',cpf:'111.222.333-44',statusId:'ativo'},          // mesmo prefixo da Eva (desligada)
  {id:'5',nome:'Eva Exemplo',cpf:'11122233355',statusId:'fora',dataDesligamento:'2025-01-01'},
  {id:'6',nome:'Fábio Exemplo',cpf:'55566677788',statusId:'fora'},             // inativo: nem entra, nem conta
 ];
 const r=pessoasParaMarketing(colab,status,areas,[]);
 assert.deepEqual(r.pessoas,[{idPessoa:'123456',nome:'Ana Exemplo',area:'Marketing'},{idPessoa:'987654',nome:'Bruno Exemplo',area:'Sem setor no RH'}]);
 assert.equal(r.semId,2);
 const texto=JSON.stringify(r);
 for(const c of colab)if(c.cpf)assert.equal(texto.includes(c.cpf.replace(/\D/g,'')),false,'CPF inteiro vazou');
 assert.equal(/cpf/i.test(texto),false);
});

test('a ação ganha canal e responsável por id; só vai para o banco o campo que veio', ()=>{
 const nova=prepararAcao({nome:'Reel',responsavelId:'123456',prazo:'2026-10-20',canalId:CANAL.toUpperCase()});
 assert.equal(nova.dados.responsavel_id,'123456');assert.equal(nova.dados.canal_id,CANAL);
 assert.equal('canal_texto' in nova.dados,false);assert.equal('responsavel_texto' in nova.dados,false);
 // Aba antiga (só textos) não manda os ids, e o banco mantém os que estavam.
 const velha=prepararAcao(base);
 assert.equal('canal_id' in velha.dados,false);assert.equal('responsavel_id' in velha.dados,false);
 assert.equal(prepararAcao({...base,canalId:null}).dados.canal_id,null);
 assert.throws(()=>prepararAcao({...base,responsavel:'',responsavelId:null}),/responsável/);
 assert.throws(()=>prepararAcao({...base,responsavelId:'Ana'}),/pessoa da lista/);
 assert.throws(()=>prepararAcao({...base,canalId:'instagram'}),/canal/);
 const t=acaoParaTela({id:'a',nome:'X',canal_id:CANAL,responsavel_id:'123456',prazo:'2026-10-20',situacao:'Ideia',investimento:0,versao:1});
 assert.equal(t.canalId,CANAL);assert.equal(t.responsavelId,'123456');assert.equal(t.responsavel,'');
});

test('erro do banco das tabelas novas vira mensagem para gente', ()=>{
 assert.match(erroDoBanco({code:'23505',message:'duplicate key value violates unique constraint "painel_mkt_publicacoes_canal_url"'},'publicacao').message,/já foi lançada neste canal/);
 assert.match(erroDoBanco({code:'23505',message:'duplicate key value violates unique constraint "painel_mkt_canais_codigo"'},'canal').message,/código/);
 assert.match(erroDoBanco({code:'P0002',message:'Canal não encontrado'},'acao').message,/canal não existe/);
 assert.match(erroDoBanco({code:'P0002',message:'Item do playbook não encontrado'},'playbook').message,/item do playbook/);
 assert.match(erroDoBanco({code:'40001',message:'Conflito de versão'},'publicacao').message,/publicação mudou/);
 const e=erroDoBanco({code:'22023',message:'Informe a evidência para concluir este item.'},'playbook');
 assert.equal(e.status,422);assert.match(e.message,/evidência/);
 assert.equal(erroDoBanco({code:'23514',message:'violates check constraint'},'canal').status,422);
 // O orçamento continua com a mensagem da a1.
 assert.match(erroDoBanco({code:'23505',details:null}).message,/orçamentos/);
});

test('a carga padrão passa pelos mesmos validadores e é a da especificação', ()=>{
 const {canais,playbook}=padraoParaBanco(CANAIS_PADRAO,PLAYBOOK_PADRAO);
 assert.deepEqual(canais.map(c=>c.codigo),['site','instagram','linkedin','facebook','pinterest','google','whatsapp','ligacao','email','visita','offline']);
 assert.ok(canais.every(c=>ICONES_CANAL.includes(c.icone)));
 const porCodigo=Object.fromEntries(canais.map(c=>[c.codigo,c]));
 assert.equal(porCodigo.pinterest.em_implantacao,true);assert.equal(porCodigo.site.url_perfil,'https://impresilk.com.br');
 assert.ok(canais.filter(c=>c.codigo!=='site').every(c=>c.url_perfil===null),'só o site tem link público na especificação');
 assert.deepEqual(canais.filter(c=>c.comercial_canal).map(c=>[c.codigo,c.comercial_canal]),[['whatsapp','whatsapp'],['ligacao','ligacao'],['visita','visita']]);
 // Playbook: os 8 canais da seção 6, códigos <canal>-<n>, sem responsável.
 assert.deepEqual([...new Set(playbook.map(i=>i.canal))],['site','instagram','linkedin','facebook','pinterest','google','whatsapp','offline']);
 assert.ok(playbook.every(i=>i.codigo.startsWith(i.canal+'-')&&i.responsavel_id===null));
 const item=c=>playbook.find(i=>i.codigo===c);
 assert.deepEqual([item('instagram-3').recorrencia,item('instagram-3').meta_quantidade],['semanal',4]);
 assert.equal(item('instagram-4').recorrencia,'diaria');
 assert.deepEqual([item('pinterest-4').recorrencia,item('pinterest-4').meta_quantidade],['semanal',10]);
 assert.deepEqual([item('linkedin-3').recorrencia,item('linkedin-3').meta_quantidade],['mensal',1]);
 assert.deepEqual([item('offline-1').recorrencia,item('offline-1').a_cada_dias],['cada_n_dias',15]);
 assert.deepEqual([item('offline-2').recorrencia,item('offline-2').a_cada_dias],['cada_n_dias',90]);
 assert.ok(playbook.filter(i=>i.canal==='pinterest'&&i.tipo==='unica').every(i=>i.implantacao));
 assert.ok(playbook.filter(i=>i.canal!=='pinterest').every(i=>!i.implantacao));
 // Repositório público: nenhum valor em R$ nem telefone na carga.
 assert.equal(/R\$|\(\d{2}\)\s?\d{4}/.test(JSON.stringify({CANAIS_PADRAO,PLAYBOOK_PADRAO})),false);
 // E a carga torta falha alto, não grava.
 assert.throws(()=>padraoParaBanco([...CANAIS_PADRAO,CANAIS_PADRAO[0]],[]),/repetido/);
 assert.throws(()=>padraoParaBanco(CANAIS_PADRAO,[{...PLAYBOOK_PADRAO[0],canal:'tiktok'}]),/não existe/);
});

// ==== Consertos da revisão da a2 ====
test('o caso ruim: canal chamado "Geral" ou "Materiais" não toma o lugar de uma vista da página', ()=>{
 const base={grupo:'digital',icone:'globe',cor:'#112233'};
 assert.throws(()=>prepararCanal({...base,nome:'Geral'}),/vista da página/);
 assert.throws(()=>prepararCanal({...base,nome:'X',codigo:'materiais'}),/vista da página/);
 // Outro código com o mesmo nome passa.
 assert.equal(prepararCanal({...base,nome:'Geral',codigo:'geral-loja'}).codigo,'geral-loja');
});

test('o caso ruim: caractere nulo colado no título não derruba a gravação; o banco recusando vira 422 para gente', ()=>{
 const p=prepararPublicacao({canalId:'11111111-1111-4111-8111-111111111111',data:'2026-10-05',titulo:'Ru\u0000im\u0007 post'});
 assert.equal(p.titulo,'Ruim post');
 const e=erroDoBanco({code:'22P05',message:'unsupported Unicode escape sequence'},'publicacao');
 assert.ok(e instanceof ErroMarketing);assert.equal(e.status,422);assert.match(e.message,/caractere inválido/);
});
