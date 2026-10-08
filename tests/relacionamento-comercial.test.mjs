import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validarAcao,apurarComercial} from '../supabase/functions/_shared/comercial.mjs';
import {resumirRelacionamento,clienteBasico,alertasComerciais} from '../supabase/functions/_shared/relacionamento-comercial.mjs';

const hoje='2026-10-08',agora=hoje+'T12:00:00Z';
const escopo={gestor:false,ids:['1'],vendedorId:'1'};
const base={vendedores:[{id:'1',nome:'Ana'}],clientes:[{id:'c1',nome:'Loja A',documento:'11222333000181'}],clientesConsulta:[{id:'c2',nome:'Loja B',documento:'19131243000197',responsavel:'Outra consultora'}],orcamentos:[{id:'o1',clienteId:'c1',valor:1200}],vendasCliente:[{id:'v1',numero:'10',clienteId:'c1',data:'2023-02-01',tipo:'Normal',valor:500}],cadastroCompleto:true};
const entrada={id:'acao-1',vendedorId:'1',clienteId:'c1',descricao:'Confirmar resultado da instalação',data:hoje,status:'pendente'};
const validar=b=>validarAcao({...entrada,...b},escopo,base,'Ana',agora);

test('pós-venda vincula uma venda histórica do cliente e preserva o objetivo',()=>{
 const a=validar({tipoAcao:'pos_venda',ordemId:'v1',objetivo:'Conferir qualidade',estrategia:'Entender a experiência',canal:'ligacao'});
 assert.equal(a.ordemId,'v1');assert.equal(a.ordemNumero,'10');assert.equal(a.clienteDocumento,'11222333000181');assert.equal(a.tipoAcao,'pos_venda');
 assert.equal(a.objetivo,'Conferir qualidade');assert.equal(a.estrategia,'Entender a experiência');
});
test('venda e orçamento nunca podem ser vinculados a outro cliente',()=>{
 assert.throws(()=>validar({tipoAcao:'pos_venda',clienteId:'c2',ordemId:'v1',objetivo:'Teste'}),/acesso|cliente/i);
 assert.throws(()=>validar({tipoAcao:'prospeccao',clienteId:'c2',orcamentoId:'o1',objetivo:'Teste'}),/acesso|cliente/i);
 assert.throws(()=>validar({tipoAcao:'pos_venda',ordemId:'invisivel',objetivo:'Teste'}),/acesso|venda/i);
});
test('prospecção usa somente o cadastro básico de outra carteira e não muda sua titularidade',()=>{
 const a=validar({tipoAcao:'prospeccao',clienteId:'c2',objetivo:'Apresentar soluções de fachada'});
 assert.equal(a.vendedorId,'1');assert.equal(a.cliente,'Loja B');assert.equal(a.responsavelCarteira,'Outra consultora');
 assert.equal(a.telefone,undefined);assert.throws(()=>validar({clienteId:'c2'}),/acesso/);
 assert.throws(()=>validar({tipoAcao:'prospeccao',vendedorId:'2',objetivo:'Teste'}),/acesso/);
});
test('prospecto local exige identidade e não pode duplicar CNPJ já cadastrado',()=>{
 const prospecto={id:'p-local',nome:'Empresa Nova',documento:'04.252.011/0001-10'};
 const a=validar({clienteId:'',tipoAcao:'prospeccao',prospecto,objetivo:'Conquistar a conta'});
 assert.equal(a.clienteId,'prospecto:p-local');assert.equal(a.prospecto.documento,'04252011000110');
 assert.throws(()=>validar({clienteId:'',tipoAcao:'prospeccao',prospecto:{...prospecto,documento:'11222333000181'},objetivo:'Teste'}),/cadastro/);
 assert.throws(()=>validar({clienteId:'',tipoAcao:'prospeccao',prospecto:{...prospecto,documento:'123'},objetivo:'Teste'}),/CNPJ/);
 assert.throws(()=>validar({clienteId:'',tipoAcao:'pos_venda',prospecto,ordemId:'v1',objetivo:'Teste'}),/venda|cadastro|prospecto/i);
});
test('concluir ação de relacionamento requer resultado e briefing aceita somente campos conhecidos',()=>{
 assert.throws(()=>validar({tipoAcao:'relacionamento',objetivo:'Ampliar conta',status:'concluida'}),/resultado/i);
 const a=validar({tipoAcao:'relacionamento',objetivo:'Ampliar conta',status:'concluida',resultado:'Cliente pediu visita',briefing:{medidas:'3 x 2 m',aprovador:'Equipe do cliente',invasor:'não entra'}});
 assert.equal(a.resultado,'Cliente pediu visita');assert.equal(a.briefing.medidas,'3 x 2 m');assert.equal(a.briefing.invasor,undefined);
 assert.throws(()=>validar({tipoAcao:'invalido'}),/tipo/i);
});
test('ações antigas continuam válidas e projeção cadastral não vaza dados privados',()=>{
 assert.equal(validar({status:'concluida'}).tipoAcao,'acompanhamento');
 const c=clienteBasico({id:'1',nome:'Cliente',telefone:'segredo',historico:['privado'],documento:'123',responsavel:'Ana'});
 assert.equal(JSON.stringify(c).includes('segredo'),false);assert.equal(JSON.stringify(c).includes('privado'),false);
});
test('fila mostra sem próxima ação, respeita retornos futuros e inclui relacionamento de meses anteriores',()=>{
 const b={ordens:[],clientes:base.clientes,config:{},orcamentos:[{id:'o1',clienteId:'c1',situacao:'aberto',dataCadastro:hoje,valor:100},{id:'o2',clienteId:'c1',situacao:'aberto',dataCadastro:hoje,valor:200}],acoes:[{id:'a1',orcamentoId:'o2',clienteId:'c1',data:'2026-11-01',status:'pendente'},{id:'rel',clienteId:'c1',tipoAcao:'prospeccao',descricao:'Retomar',data:'2026-09-01',status:'pendente'}]};
 const r=apurarComercial(b,{de:'2026-10-01',ate:'2026-10-31'},hoje);
 assert.equal(r.semProximaAcao.length,1);assert.equal(r.semProximaAcao[0].id,'o1');
 assert.ok(r.prioridades.some(a=>a.tipo==='Sem próxima ação'&&a.orcamentoId==='o1'));
 assert.ok(r.atrasadas.some(a=>a.id==='rel'));assert.equal(r.prioridades.some(a=>a.orcamentoId==='o2'),false);
});
test('filtros de relacionamento encontram CNPJ formatado e preservam conclusões',()=>{
 const a=validar({tipoAcao:'prospeccao',objetivo:'Visita'}),concluida={...a,id:'2',status:'concluida'};
 const r=resumirRelacionamento([a,concluida],{busca:'11.222.333/0001-81',situacao:'todas'},hoje);
 assert.equal(r.itens.length,2);assert.equal(r.abertas,1);assert.equal(r.concluidas,1);
 assert.equal(resumirRelacionamento([a,concluida],{situacao:'concluidas'},hoje).itens.length,1);
});
test('confiabilidade distingue fonte atrasada, histórico parcial e venda negativa sem mudar os valores',()=>{
 const avisos=alertasComerciais({fontes:{orcamentos:{atualizadoEm:'2026-10-07T00:00:00Z'}},base:{coberturaHistorica:{completo:false}},relatorio:{vendas:[{numero:'10',centavos:-100}]}},Date.parse(agora));
 assert.ok(avisos.some(a=>a.id==='orcamentos'));assert.ok(avisos.some(a=>a.id==='historico'));assert.ok(avisos.some(a=>a.id==='negativas'));
});

test('CNPJ numérico e alfanumérico preservam letras na validação, busca e relacionamento',async()=>{
 const {cnpjValido}=await import('../supabase/functions/_shared/relacionamento-comercial.mjs');
 const {clienteCorresponde}=await import('../supabase/functions/_shared/consulta-clientes.mjs');
 assert.equal(cnpjValido('04.252.011/0001-10'),true);
 assert.equal(cnpjValido('12.ABC.345/01DE-35'),true);
 assert.equal(cnpjValido('12.ABC.345/01DE-36'),false);
 assert.equal(cnpjValido('12.ABC.345/01DE-3?'),false);
 const a=validar({tipoAcao:'prospeccao',prospecto:{id:'alfa',nome:'Empresa Alfa Teste',documento:'12.abc.345/01de-35'},objetivo:'Apresentar sinalização'});
 assert.equal(a.prospecto.documento,'12ABC34501DE35');assert.equal(clienteCorresponde({nome:'Empresa Alfa Teste',documento:'12ABC34501DE35'},'12.abc.345/01de-35'),true);
 assert.equal(resumirRelacionamento([a],{busca:'12.abc.345/01de-35'},hoje).itens.length,1);
});
