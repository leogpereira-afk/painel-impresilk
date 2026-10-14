import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as acesso from '../supabase/functions/_shared/patrimonio-acesso.mjs';
import * as vinculo from '../supabase/functions/_shared/patrimonio-vinculo.mjs';

const {familiaVinculo,fichaAceitaBem,fichaBaixada,moduloDoVinculo,podeMexerNoVinculo,mensagemSemPermissaoVinculo,
 rotuloFichaVinculo,eventoVinculo,eventoPublicoVinculo,comEventoVinculo,MSG_VINCULO,ROTULO_FAMILIA_VINCULO,ROTULO_MODULO_VINCULO}=vinculo;

// Fichas fictícias, uma por caso da tabela de famílias (PLANO-VINCULO.md, seção 0).
const FICHAS={
 carro:{tipo:'veiculo',nome:'Carro exemplo'},
 maquina:{tipo:'maquina',nome:'Máquina exemplo'},
 estruturaPredial:{tipo:'predial',categoria:'Ar condicionado',nome:'Ar exemplo'},
 estruturaRede:{tipo:'informatica',categoria:'Rede e internet',nome:'Roteador exemplo'},
 estruturaPc:{tipo:'informatica',categoria:'Computador',nome:'PC exemplo'},
 telefone:{tipo:'informatica',categoria:'Telefone',nome:'Ramal exemplo'},
 central:{tipo:'informatica',categoria:'Central telefônica',nome:'Central exemplo'},
 celular:{tipo:'informatica',categoria:'Celular',nome:'Celular exemplo'},
 camera:{tipo:'seguranca',categoria:'Câmera',nome:'Câmera exemplo'},
 extintor:{tipo:'predial',categoria:'Extintor',nome:'Extintor exemplo'},
 avcb:{tipo:'predial',categoria:'AVCB',nome:'AVCB exemplo'},
 iluminacao:{tipo:'predial',categoria:'Iluminação de emergência',nome:'Luz exemplo'},
 sinalizacao:{tipo:'predial',categoria:'Sinalização de segurança',nome:'Placa exemplo'},
};
const RAPHAEL={sub:'raphael-ficticio',nome:'Pessoa do almoxarifado',perms:['patrimonio','inventario-valores','manutencoes','seguranca']};

test('patrimonio-acesso re-exporta as regras do vínculo, sem ciclo',()=>{
 for(const nome of ['familiaVinculo','fichaAceitaBem','fichaBaixada','moduloDoVinculo','podeMexerNoVinculo','eventoVinculo','comEventoVinculo','MSG_VINCULO','ROTULO_FAMILIA_VINCULO','ROTULO_MODULO_VINCULO'])
  assert.equal(acesso[nome],vinculo[nome],nome);
});

test('tabela de famílias: AVCB fica fora, Rede e internet é Estrutura, Celular é Celulares e Ramais',()=>{
 const esperado={carro:'carro',maquina:'maquina',estruturaPredial:'estrutura',estruturaRede:'estrutura',estruturaPc:'estrutura',telefone:'telefonia',central:'telefonia',celular:'telefonia',camera:'seguranca',extintor:'incendio',avcb:'incendio',iluminacao:'incendio',sinalizacao:'incendio'};
 for(const [k,familia] of Object.entries(esperado))assert.equal(familiaVinculo(FICHAS[k]),familia,k);
 for(const tipo of ['documento','seguro','garantia','marketing','licitacao','inventado',undefined])assert.equal(familiaVinculo({tipo}),null,String(tipo));
 assert.equal(familiaVinculo(null),null);
 for(const k of Object.keys(FICHAS))assert.equal(fichaAceitaBem(FICHAS[k]),k!=='avcb',k);
 assert.equal(fichaAceitaBem({tipo:'documento'}),false);
 const modulos={carro:'manutencoes',maquina:'manutencoes',estruturaPredial:'patrimonio',estruturaRede:'patrimonio',telefone:'patrimonio',celular:'patrimonio',camera:'seguranca',extintor:'patrimonio'};
 for(const [k,m] of Object.entries(modulos))assert.equal(moduloDoVinculo(FICHAS[k]),m,k);
 assert.equal(moduloDoVinculo({tipo:'documento'}),null);
 assert.deepEqual(ROTULO_FAMILIA_VINCULO,{carro:'Carro',maquina:'Máquina',estrutura:'Estrutura',telefonia:'Celulares e Ramais',seguranca:'Segurança',incendio:'Prevenção contra incêndio'});
 assert.deepEqual(ROTULO_MODULO_VINCULO,{manutencoes:'Patrimônio · Manutenções',seguranca:'Segurança',patrimonio:'Patrimônio'});
});

test('ficha baixada só pela situação da especificação',()=>{
 assert.equal(fichaBaixada({tipo:'informatica',especificacao:{situacao:'baixado'}}),true);
 for(const f of [{tipo:'veiculo'},{tipo:'maquina',especificacao:{}},{tipo:'predial',especificacao:{situacao:'uso'}},null])assert.equal(fichaBaixada(f),false);
});

test('permissões: as quatro marcações passam nas seis famílias; faltando o módulo, não passa',()=>{
 const seis=['carro','maquina','estruturaPredial','telefone','camera','extintor'].map(k=>FICHAS[k]);
 for(const f of seis)assert.equal(podeMexerNoVinculo(RAPHAEL,f),true,f.nome);
 for(const sessao of [{master:true},{perms:['*']}])for(const f of seis)assert.equal(podeMexerNoVinculo(sessao,f),true);
 for(const f of seis)assert.equal(podeMexerNoVinculo({perms:['inventario-valores']},f),false,f.nome);
 const comPatrimonio={perms:['inventario-valores','patrimonio']};
 for(const k of ['carro','maquina','camera'])assert.equal(podeMexerNoVinculo(comPatrimonio,FICHAS[k]),false,k);
 for(const k of ['estruturaPredial','telefone','extintor'])assert.equal(podeMexerNoVinculo(comPatrimonio,FICHAS[k]),true,k);
 // Sem Inventário e valores, nenhum módulo basta.
 assert.equal(podeMexerNoVinculo({perms:['patrimonio','manutencoes','seguranca']},FICHAS.carro),false);
 assert.equal(podeMexerNoVinculo(null,FICHAS.carro),false);
 assert.equal(podeMexerNoVinculo(RAPHAEL,{tipo:'documento'}),false);
 assert.equal(mensagemSemPermissaoVinculo(FICHAS.carro),'Ligar ou desfazer vínculo de Carro exige a permissão Patrimônio · Manutenções.');
 assert.equal(mensagemSemPermissaoVinculo(FICHAS.camera),'Ligar ou desfazer vínculo de Segurança exige a permissão Segurança.');
 assert.equal(mensagemSemPermissaoVinculo(FICHAS.celular),'Ligar ou desfazer vínculo de Celulares e Ramais exige a permissão Patrimônio.');
 assert.equal(MSG_VINCULO.semPermissaoFamilia(FICHAS.extintor),'Ligar ou desfazer vínculo de Prevenção contra incêndio exige a permissão Patrimônio.');
});

test('rótulo da ficha esconde Segurança e marca retirada',()=>{
 assert.equal(rotuloFichaVinculo(FICHAS.maquina,RAPHAEL),'Máquina · Máquina exemplo');
 assert.equal(rotuloFichaVinculo(FICHAS.camera,RAPHAEL),'Segurança · Câmera exemplo');
 assert.equal(rotuloFichaVinculo(FICHAS.camera,{perms:['inventario-valores']}),'uma ficha de Segurança');
 assert.equal(rotuloFichaVinculo(FICHAS.camera,RAPHAEL,{retirada:true}),'uma ficha retirada');
 assert.equal(rotuloFichaVinculo(null,RAPHAEL),'uma ficha retirada');
 assert.equal(MSG_VINCULO.bemJaLigado('Carro · Carro exemplo'),'Este bem já está ligado a Carro · Carro exemplo. Desfaça esse vínculo antes de ligar de novo.');
 assert.equal(MSG_VINCULO.excluirLigado('uma ficha retirada'),'Este bem está ligado a uma ficha retirada. Desfaça o vínculo no bloco Ligado a antes de excluir o cadastro.');
});

test('evento tem id próprio, autor da sessão e sai sem o login; lista guarda os 200 últimos',()=>{
 const e=eventoVinculo({acao:'vinculado',ficha:{...FICHAS.carro,id:'car-1'},bemId:'bem-1',bemCodigo:'VEC-001',sessao:RAPHAEL,via:'vincularFicha',lado:'ficha',tela:'bem',agora:'2026-10-14T12:00:00.000Z'});
 assert.match(e.id,/^[0-9a-f-]{36}$/);
 assert.deepEqual({...e,id:'x'},{id:'x',acao:'vinculado',bemId:'bem-1',ativoId:'car-1',familia:'carro',nome:'Carro exemplo',bemCodigo:'VEC-001',lado:'ficha',via:'vincularFicha',tela:'bem',por:'raphael-ficticio',porNome:'Pessoa do almoxarifado',em:'2026-10-14T12:00:00.000Z'});
 assert.notEqual(eventoVinculo({acao:'vinculado',ficha:FICHAS.carro,bemId:'b',sessao:RAPHAEL}).id,e.id);
 const publico=eventoPublicoVinculo(e);assert.equal(Object.hasOwn(publico,'por'),false);assert.equal(publico.porNome,'Pessoa do almoxarifado');
 assert.equal(Object.hasOwn(eventoVinculo({acao:'vinculado',ficha:FICHAS.carro,bemId:'b',sessao:RAPHAEL,tela:'outra'}),'tela'),false);
 assert.equal(eventoVinculo({acao:'vinculado',ficha:FICHAS.carro,bemId:'b',sessao:{sub:'login'}}).porNome,'login');
 let lista;for(let i=0;i<205;i++)lista=comEventoVinculo(lista,{id:String(i)});
 assert.equal(lista.length,200);assert.equal(lista[0].id,'5');assert.equal(lista.at(-1).id,'204');
 const original=[{id:'a'}];assert.equal(comEventoVinculo(original,{id:'b'}).length,2);assert.equal(original.length,1);
 assert.deepEqual(comEventoVinculo('lixo',{id:'c'}),[{id:'c'}]);
});

test('bemPermitido: eventos de vínculo saem sem login; ficha de Segurança só para quem tem Segurança; o registro não muda',()=>{
 const ev={id:'e1',acao:'vinculado',bemId:'b1',ativoId:'cam-1',familia:'seguranca',nome:'Câmera do cofre',por:'login-secreto',porNome:'Pessoa',em:'x'};
 const original={id:'b1',codigo:'PRO-001',valor:10,historico:[{acao:'sincronizado',por:'login',em:'x'},ev,{...ev,id:'e2',acao:'desvinculado',familia:'maquina',ativoId:'maq-1',nome:'Máquina'}]};
 const copia=structuredClone(original);
 const sem=acesso.bemPermitido(original,{perms:['inventario-valores']});
 assert.deepEqual(sem.historico,[{acao:'sincronizado',por:'login',em:'x'},{id:'e1',acao:'vinculado',bemId:'b1',ativoId:'',familia:'seguranca',nome:'Ficha de Segurança',porNome:'Pessoa',em:'x'},{id:'e2',acao:'desvinculado',bemId:'b1',ativoId:'maq-1',familia:'maquina',nome:'Máquina',porNome:'Pessoa',em:'x'}]);
 assert.equal(sem.valor,10);
 const com=acesso.bemPermitido(original,RAPHAEL);
 assert.deepEqual([com.historico[1].nome,com.historico[1].ativoId,Object.hasOwn(com.historico[1],'por')],['Câmera do cofre','cam-1',false]);
 assert.deepEqual(original,copia);
 assert.deepEqual(acesso.bemPermitido({id:'b2',codigo:'X'},{perms:['inventario-valores']}),{id:'b2',codigo:'X'});
 assert.deepEqual(acesso.bemPermitido(original,{perms:['patrimonio']}),{id:'b1',codigo:'PRO-001'});
});

test('recusa do vínculo vem marcada com recusaVinculo; conflito de versão e corrida não',()=>{
 for(const codigo of ['trocaPeloFormulario','fichaNaoLiga','fichaBaixada','bemNaoEncontrado','bemExcluido','bemBaixado','fichaJaLigada','bemJaLigado','outroBemNaFicha'])
  assert.equal(vinculo.erroVinculo(codigo,'Rótulo').corpo.recusaVinculo,true,codigo);
 for(const codigo of ['cmVersao','fichaMudou','bemMudou','corrida','removerVinculoMudou','fichaRetirada','idInvalido','versaoInvalida','excluirLigado','parcial'])
  assert.equal(Object.hasOwn(vinculo.erroVinculo(codigo,'Rótulo').corpo,'recusaVinculo'),false,codigo);
});
