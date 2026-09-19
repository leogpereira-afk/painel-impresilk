import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filtrarInventario, pendenciasBem, bensParaImpressao} from './inventario.js';
const setores=[{sigla:'PRO',nome:'Produção'},{sigla:'ADM',nome:'Administração'}];
const bens=[
 {id:'a',codigo:'PRO-2',nomeGenerico:'Impressora',descricaoTecnica:'Laser X10',setorSigla:'PRO',situacao:'uso',valor:12000,nf:'123',responsavel:'José',dataAquisicao:'2026-01-01'},
 {id:'b',codigo:'PRO-10',nomeGenerico:'Mesa',descricaoTecnica:'Bancada da impressora',setorSigla:'PRO',situacao:'manutencao',valor:600,nf:'',motivoSemNota:'Doação',responsavel:'Ana',dataAquisicao:'2025-01-01'},
 {id:'c',codigo:'ADM-1',nomeGenerico:'Monitor',setorSigla:'ADM',situacao:'baixado',valor:400},
 {id:'d',codigo:'ANT-1',nomeGenerico:'Computador',setorSigla:'EXTINTO',valor:0},
];
const fotos={a:2,b:1};
const filtrar=f=>filtrarInventario(bens,setores,fotos,f).map(b=>b.id);
test('inventário ativo exclui baixados e mantém bens sem setor',()=>assert.deepEqual(filtrar({}),['d','a','b']));
test('pesquisa combina palavras sem depender dos acentos e busca por responsável',()=>assert.deepEqual(filtrar({busca:'producao jose laser'}),['a']));
test('tipo usa igualdade, não uma palavra na descrição de outro equipamento',()=>assert.deepEqual(filtrar({tipo:'Impressora'}),['a']));
test('situação e setor são filtros combináveis',()=>assert.deepEqual(filtrar({situacao:'manutencao',setor:'PRO'}),['b']));
test('baixados têm consulta própria',()=>assert.deepEqual(filtrar({situacao:'baixado'}),['c']));
test('todos inclui o histórico',()=>assert.equal(filtrar({situacao:'todos'}).length,4));
test('setores removidos continuam encontráveis',()=>assert.deepEqual(filtrar({setor:'__sem_setor'}),['d']));
test('ordem numérica da etiqueta não põe 10 antes de 2',()=>assert.deepEqual(filtrar({setor:'PRO'}),['a','b']));
test('ordena por valor e pela data real, sem atribuir hoje a compras antigas',()=>{assert.deepEqual(filtrar({ordem:'valor'}),['a','b','d']);assert.deepEqual(filtrar({ordem:'recentes'}),['a','b','d']);});
test('justificativa da NF resolve documentação, mas espaços não resolvem',()=>{assert.equal(pendenciasBem(bens[1],setores,fotos).some(p=>p.id==='documento'),false);assert.equal(pendenciasBem({...bens[1],motivoSemNota:'  '},setores,fotos).some(p=>p.id==='documento'),true);});
test('foto desconhecida não é tratada como ausência',()=>{assert.equal(pendenciasBem(bens[0],setores,null).some(p=>p.id==='foto'),false);assert.equal(pendenciasBem(bens[0],setores,{}).some(p=>p.id==='foto'),true);});
test('filtro de pendências inclui foto, valor e setor, sem baixados',()=>{assert.deepEqual(filtrar({pendencia:'foto'}),['d']);assert.deepEqual(filtrar({pendencia:'valor'}),['d']);assert.deepEqual(filtrar({pendencia:'todas'}),['d']);});
test('relatório usa apenas seleção visível ou todo o recorte, independente da paginação',()=>{assert.deepEqual(bensParaImpressao(bens,['a','inexistente']).map(b=>b.id),['a']);assert.equal(bensParaImpressao(bens,[]).length,4);assert.equal(bensParaImpressao(bens,['inexistente']).length,4);});
