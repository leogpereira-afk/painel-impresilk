import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {buildSync} from 'esbuild';
import {combinarCompromissosComerciais,projetarAcoesComerciais,vinculosMesaComercial} from '../supabase/functions/_shared/comercial-agenda.mjs';

const dia=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}),mes=dia.slice(0,7);
const fonte=name=>{
 const url=new URL(`../supabase/functions/${name}/index.ts`,import.meta.url);
 const contents=readFileSync(url,'utf8').replace(/^import.*createClient.*\n/m,'const createClient=globalThis.createClient;\n').replace(/^import.*verificarJwt.*\n/m,'const {verificarJwt,crachaRevogado}=globalThis;\n');
 return buildSync({stdin:{contents,loader:'ts',resolveDir:fileURLToPath(new URL('.',url))},bundle:true,write:false,format:'iife',platform:'node'}).outputFiles[0].text;
};
const comercial=fonte('painel-comercial'),agenda=fonte('painel-agenda');
const campo=(o,k)=>k.split(/->>?/).reduce((a,k)=>a?.[k],o);
const projetar=(o,campos)=>Object.fromEntries(campos.split(',').map(c=>{const i=c.indexOf(':'),chave=i<0?c:c.slice(0,i),path=i<0?c:c.slice(i+1);return [chave,campo(o,path)];}));

function ambiente(){
 let sessao={sub:'ana-exemplo',nome:'Ana Exemplo',perms:['orcamentos','compromissos','calendario-empresa']},handler,handlerAgenda,falha='';
 const carimbo=dia+'T12:00:00Z',consultas=[],gravacoes=[];
 const banco={
  painel_cache:[
   {chave:'comercial_catalogo',valor:{completo:true,vendedores:[{id:'v1',nome:'Ana Exemplo',ativo:true},{id:'v2',nome:'Bia Exemplo',ativo:true}],produtos:[{id:'produto-exemplo',nome:'Placa fictícia'}]}},
   {chave:'crm_clientes',valor:{completo:true,clientes:{c1:{id:'c1',nome:'Loja fictícia A',responsavel:'Ana Exemplo',telefone:'00000000000'},c2:{id:'c2',nome:'Loja fictícia B',responsavel:'Bia Exemplo',telefone:'TELEFONE-PRIVADO'}}}},
   {chave:'orcamentos',valor:[{id:'o1',numero:'101',clienteId:'c1',cliente:'Loja fictícia A',vendedorId:'v1',vendedorNome:'Ana Exemplo',situacao:'aberto',dataCadastro:dia}]},
   {chave:'ordens',valor:[]},{chave:'status',valor:{ultimaCompleta:carimbo}},{chave:'historico_status',valor:{ok:true,desde:'2020-01-01',ate:dia}},
   {chave:'comercial_carga_status',valor:{janelas:{ordens:[{desde:'2020-01-01',ate:dia,concluidaEm:carimbo}]},tentativa:{estado:'concluida'}}},
   {chave:'recebiveis',valor:[]},{chave:'recebidos_os',valor:{desde:'2020-01-01',titulos:{}}},
  ].map(r=>({...r,atualizado_em:carimbo})),
  painel_registros:[{colecao:'comercial_config',id:'regras',registro:{vinculos:{'ana-exemplo':'v1','bia-exemplo':'v2'},diasSemResposta:7,diasVencimento:3,diasReativacao:90,excluidosMetas:['v2'],fichasProdutos:{}}},
   {colecao:'comercial_acoes',id:'acao-original',registro:{id:'acao-original',vendedorId:'v1',clienteId:'c1',cliente:'Loja fictícia A',data:dia,descricao:'Retorno combinado',status:'pendente',versao:3,contatoEm:carimbo,contatos:[{em:carimbo,autor:'Ana Exemplo',resultado:'Está avaliando',resultadoContato:'esta_avaliando',proximoPasso:{data:dia,descricao:'Retorno combinado'}}]}},
   {colecao:'comercial_acoes',id:'acao-outra',registro:{id:'acao-outra',vendedorId:'v2',clienteId:'c2',cliente:'SEGREDO-OUTRA-CARTEIRA',data:dia,descricao:'SEGREDO-OUTRA-CARTEIRA',status:'pendente',versao:1}},
   {colecao:'ov_orc',id:'o1',registro:{compromissoId:'legado-original',proximoToque:dia,nota:'Nota legada'}},
  ],
  painel_ordens:[{id:'erp-original',numero:'111',cliente:'Loja fictícia A',data:'2024-01-02',valor:150,bruto:200,desconto:50,vendedor:'Ana Exemplo',itens:[{produtoId:'produto-exemplo',produto:'Placa fictícia',quantidade:2,unidade:'un',subtotal:200,fotos:'ANEXO-PRIVADO'}],comercial:{clienteId:'c1',tipo:'Normal',vendedorId:'v1'},atualizado_em:carimbo},
   {id:'erp-outra',numero:'222',cliente:'Loja fictícia B',data:dia,valor:990,vendedor:'Bia Exemplo',comercial:{clienteId:'c2',tipo:'Normal',vendedorId:'v2'},atualizado_em:carimbo}],
  pcp_registros:[{colecao:'os',id:'pcp-original',apagado:false,atualizado_em:carimbo,registro:{id:'pcp-original',numero:'111',responsavelPCP:'Gestão fictícia',previsaoEntrega:dia,instalacao:{data:dia,periodo:'Manhã',duracaoDias:2},equipe:['pessoa-ficticia'],confirmacao:'Confirmado',liberadoPCP:true,finalizadaEm:dia+'T10:00:00Z',finalizadoPor:'Gestão Exemplo',valorTotal:999999,whatsapp:'PCP-CONTATO-PRIVADO',observacoes:'PCP-NOTA-PRIVADA',itens:[{subtotal:99999,fotos:['PCP-ANEXO-PRIVADO']}]} }],
 };
 const sb={from(tabela){let linhas=banco[tabela]||[],selecao='',inicio=0,fim=Infinity;const q={
  select(campos){selecao=campos;consultas.push({tabela,campos});return q;},eq(k,v){linhas=linhas.filter(o=>campo(o,k)===v);return q;},in(k,vs){linhas=linhas.filter(o=>vs.includes(campo(o,k)));return q;},gte(k,v){linhas=linhas.filter(o=>campo(o,k)>=v);return q;},lte(k,v){linhas=linhas.filter(o=>campo(o,k)<=v);return q;},order(){linhas=[...linhas].sort((a,b)=>String(a.id).localeCompare(String(b.id)));return q;},range(a,b){inicio=a;fim=b;return q;},
  maybeSingle(){return Promise.resolve(falha===tabela?{error:{message:'ERRO-PRIVADO'}}:{data:linhas[0]?projetar(linhas[0],selecao):null});},then(resolve,reject){return Promise.resolve(falha===tabela?{error:{message:'ERRO-PRIVADO'}}:{data:linhas.slice(inicio,fim+1).map(o=>projetar(o,selecao))}).then(resolve,reject);},
 };return q;},async rpc(nome,p){gravacoes.push({nome,p});if(nome==='painel_comercial_salvar_acao'){const old=banco.painel_registros.find(r=>r.colecao==='comercial_acoes'&&r.id===p.p_id);if((old?.registro.versao??null)!==p.p_versao)return {error:{}};const registro={...p.p_registro,versao:(old?.registro.versao||0)+1};if(old)old.registro=registro;else banco.painel_registros.push({colecao:'comercial_acoes',id:p.p_id,registro});return {data:registro};}return {data:{}};}};
 const contexto={createClient:()=>sb,verificarJwt:async()=>sessao,crachaRevogado:async()=>false,Deno:{env:{get:()=> 'ficticio'},serve:fn=>handler=fn},Request,Response,URL,crypto,console:{error(){}}};
 vm.runInNewContext(comercial,contexto);vm.runInNewContext(agenda,{...contexto,Deno:{...contexto.Deno,serve:fn=>handlerAgenda=fn}});
 const call=async(fn,b)=>{const r=await fn(new Request('https://test.invalid',{method:'POST',headers:{authorization:'Bearer ficticio'},body:JSON.stringify(b)}));return {status:r.status,...await r.json()};};
 return {banco,consultas,gravacoes,sessao:s=>sessao=s,falha:t=>falha=t,call:b=>call(handler,{filtro:{de:mes+'-01',ate:dia},...b}),agenda:b=>call(handlerAgenda,{action:'comercial',...b})};
}

test('agendas preservam ID comercial, link original, carteira e referência legada sem escrever',async()=>{
 const a=ambiente(),r=await a.agenda({mes});assert.equal(r.status,200);assert.deepEqual(r.eventos.map(e=>e.id),['acao-original']);assert.equal(r.eventos[0].href,'/comercial?acao=acao-original');assert.equal(r.eventos[0].versao,3);assert.equal(r.vinculosLegados[0].compromissoId,'legado-original');assert.doesNotMatch(JSON.stringify(r),/SEGREDO|contatos|nota|TELEFONE/);assert.equal(a.gravacoes.length,0);
 a.sessao({sub:'bia-exemplo',perms:['orcamentos','compromissos']});assert.deepEqual((await a.agenda()).eventos.map(e=>e.id),['acao-outra']);
 a.sessao({sub:'gestor-ficticio',master:true});assert.equal((await a.agenda()).eventos.length,2);
});
test('agendas exigem origem e destino autorizados; não fazem concessão de módulos',async()=>{
 for(const perms of [['orcamentos'],['compromissos'],['calendario-empresa'],[]]){const a=ambiente();a.sessao({sub:'ana-exemplo',perms});assert.equal((await a.agenda()).status,403);assert.equal(a.consultas.length,0);}
 const a=ambiente();assert.equal((await a.agenda({mes:'2026-99'})).status,400);a.falha('painel_registros');assert.equal((await a.agenda()).status,500);
});
test('agenda lê mais de 500 ações e histórico lê mais de 1000 pedidos sem corte padrão',async()=>{
 const a=ambiente(),modelo=a.banco.painel_registros.find(r=>r.id==='acao-original');
 a.banco.painel_registros.push(...Array.from({length:501},(_,i)=>({...modelo,id:'acao-extra-'+i,registro:{...modelo.registro,id:'acao-extra-'+i}})));
 const r=await a.agenda({mes});assert.equal(r.status,200);assert.equal(r.eventos.length,502);assert.equal(new Set(r.eventos.map(e=>e.id)).size,502);
 const pedido=a.banco.painel_ordens[0];a.banco.painel_ordens.push(...Array.from({length:1001},(_,i)=>({...pedido,id:'pedido-extra-'+String(i).padStart(4,'0'),numero:String(1000+i)})));
 const h=await a.call({action:'contextoRelacionamento',clienteId:'c1',pagina:11,tamanho:100});assert.equal(h.status,200);assert.equal(h.paginacao.total,1002);assert.equal(h.vendas.length,2);
});
test('projeção canônica substitui só referência explícita consistente e conserva conflito legado',()=>{
 const escopo={ids:['v1'],vendedores:[{id:'v1',nome:'Ana Exemplo'}]},acao={id:'id-original',vendedorId:'v1',cliente:'Cliente fictício',descricao:'Retorno',data:dia,status:'pendente',compromissoId:'id-legado'};
 const eventos=projetarAcoesComerciais([acao,{...acao,id:'outra',vendedorId:'v2'}],escopo,mes);assert.equal(eventos.length,1);
 const antigo={data:dia,feito:false,titulo:'Retorno antigo',dono:'ana-exemplo',versao:7};
 const igual=combinarCompromissosComerciais({'id-legado':antigo},eventos);assert.deepEqual(Object.keys(igual.mapa),['id-original']);assert.equal(igual.mapa['id-original'].acaoId,'id-original');assert.equal(antigo.versao,7);
 const conflito=combinarCompromissosComerciais({'id-legado':{...antigo,feito:true}},eventos);assert.equal(Object.keys(conflito.mapa).length,2);assert.equal(conflito.conflitos[0].codigo,'VINCULO_DIVERGENTE');assert.ok(conflito.mapa['id-legado'].conflitoComercial);
 const mesa=vinculosMesaComercial([{id:'o1',registro:{compromissoId:'id-legado',proximoToque:dia}},{id:'o2',registro:{compromissoId:'privado',proximoToque:dia}}],[{id:'o1'}]);assert.equal(mesa.length,1);
 const c=combinarCompromissosComerciais({'id-legado':{...antigo,data:'2024-01-01'}},[],mesa);assert.equal(c.conflitos.length,1);assert.equal(c.mapa['id-legado'].versao,7);
});
test('histórico sob demanda mantém valores, itens, cobertura, contatos confirmados e exclui a carteira alheia',async()=>{
 const a=ambiente(),r=await a.call({action:'contextoRelacionamento',clienteId:'c1'});assert.equal(r.status,200);assert.equal(r.vendas[0].id,'erp-original');assert.equal(r.vendas[0].valor,150);assert.equal(r.vendas[0].valorBruto,200);assert.equal(r.vendas[0].itens[0].unidade,'un');assert.equal(r.vendas[0].elegivelPosVenda,true);assert.equal(r.coberturaHistorica.fonte,'comercial_carga_status');assert.equal(r.paginacao.total,1);assert.equal(r.timelineContatos[0].acaoId,'acao-original');assert.equal(r.timelineContatos[0].proximoPasso.data,dia);assert.equal(r.cliente.telefone,'00000000000');assert.doesNotMatch(JSON.stringify(r),/SEGREDO|ANEXO|PCP-CONTATO|999999/);
 const externo=await a.call({action:'contextoRelacionamento',clienteId:'c2'});assert.equal(externo.autorizado,false);assert.deepEqual(externo.vendas,[]);assert.equal(externo.cliente.telefone,undefined);
});
test('histórico antigo pagina de forma estável e consulta indisponível não vira lista vazia',async()=>{
 const a=ambiente(),modelo=a.banco.painel_ordens[0];a.banco.painel_ordens.push(...Array.from({length:23},(_,i)=>({...modelo,id:'extra-'+String(i).padStart(2,'0'),numero:String(300+i),data:'2024-01-02'})));
 const p1=await a.call({action:'contextoRelacionamento',clienteId:'c1'}),p2=await a.call({action:'contextoRelacionamento',clienteId:'c1',pagina:2});assert.equal(p1.vendas.length,20);assert.equal(p2.vendas.length,4);assert.equal(new Set([...p1.vendas,...p2.vendas].map(v=>v.id)).size,24);assert.equal(p2.paginacao.total,24);assert.equal((await a.call({action:'contextoRelacionamento',clienteId:'c1',pagina:3})).status,400);
 a.falha('painel_ordens');assert.equal((await a.call({action:'contextoRelacionamento',clienteId:'c1'})).status,503);
});
test('pedido autoriza ordemId antes de ler PCP e usa o ID original comprovado por unicidade',async()=>{
 const a=ambiente(),bloqueado=await a.call({action:'consultarPedido',ordemId:'erp-outra'});assert.equal(bloqueado.status,403);assert.equal(a.consultas.some(q=>q.tabela==='pcp_registros'),false);
 const r=await a.call({action:'consultarPedido',ordemId:'erp-original'});assert.equal(r.status,200);assert.equal(r.operacao.pcpId,'pcp-original');assert.equal(r.operacao.vinculo.metodo,'numero_unico');assert.equal(r.operacao.vinculo.ordemId,'erp-original');assert.equal(r.operacao.previsaoEstimada,dia);assert.ok(r.operacao.previsaoConfirmada);assert.ok(r.operacao.entregaRealEm);assert.equal(r.financeiro.estado,'disponivel');assert.equal(r.financeiro.abertos.length,0);assert.doesNotMatch(JSON.stringify(r),/PCP-NOTA|PCP-CONTATO|PCP-ANEXO|999999/);
 assert.equal(r.operacao.responsavelPCP,'Gestão fictícia');assert.equal(r.operacao.pendencias.estado,'nao_informado');assert.deepEqual(r.operacao.pendencias.itens,[]);
});
test('número comercial repetido e PCP duplicado são ambiguidade sem vínculo silencioso',async()=>{
 const a=ambiente();a.banco.painel_ordens[1].numero='111';let r=await a.call({action:'consultarPedido',ordemId:'erp-original'});assert.equal(r.operacao.estado,'sem_vinculo');assert.equal(r.operacao.codigo,'PCP_IDENTIDADE_COMERCIAL_AMBIGUA');assert.equal(r.pedido.elegivelPosVenda,false);assert.equal(a.consultas.some(q=>q.tabela==='pcp_registros'),false);
 a.banco.painel_ordens[1].numero='222';a.banco.pcp_registros.push({...a.banco.pcp_registros[0],id:'outro-id-original'});r=await a.call({action:'consultarPedido',ordemId:'erp-original'});assert.equal(r.operacao.codigo,'PCP_VINCULO_AMBIGUO');assert.equal(r.operacao.entregaRealEm,null);
});
test('previsão não confirmada, baixa ERP e declaração do campo não autorizam pós-venda',async()=>{
 const a=ambiente(),o=a.banco.pcp_registros[0].registro;o.confirmacao='';let r=await a.call({action:'consultarPedido',ordemId:'erp-original'});assert.equal(r.operacao.previsaoConfirmada,null);assert.equal(r.operacao.previsaoEstimada,dia);
 o.baixaAutoERP={em:o.finalizadaEm};r=await a.call({action:'consultarPedido',ordemId:'erp-original'});assert.equal(r.operacao.encerradaERP,true);assert.equal(r.operacao.entregaRealEm,null);assert.equal(r.pedido.elegivelPosVenda,false);
 delete o.baixaAutoERP;o.finalizadaPorCampo={finalizadaEm:o.finalizadaEm};r=await a.call({action:'consultarPedido',ordemId:'erp-original'});assert.equal(r.operacao.estadoEntrega,'declarada');assert.equal(r.pedido.elegivelPosVenda,false);
 o.itens=[{entregas:[{id:'conferencia-original',tipo:'conferido',dia,alvo:'fim:'+o.finalizadaEm}]}];r=await a.call({action:'consultarPedido',ordemId:'erp-original'});assert.equal(r.pedido.elegivelPosVenda,true);
 o.itens[0].entregas.push({id:'desfazer-original',tipo:'desfeito',dia,alvo:'conferencia-original'});r=await a.call({action:'consultarPedido',ordemId:'erp-original'});assert.equal(r.pedido.elegivelPosVenda,false);
});
test('cancelamento ativo prevalece sobre agenda confirmada e finalização na projeção comercial',async()=>{
 const a=ambiente(),o=a.banco.pcp_registros[0].registro;o.cancelamento={ativo:true,motivo:'A pedido do cliente'};
 const r=await a.call({action:'consultarPedido',ordemId:'erp-original'});assert.equal(r.status,200);assert.equal(r.operacao.cancelada,true);assert.equal(r.operacao.status,'cancelada');assert.equal(r.operacao.rotuloStatus,'Cancelada no PCP');assert.equal(r.operacao.estadoEntrega,'cancelada');assert.equal(r.operacao.previsaoConfirmada,null);assert.equal(r.operacao.entregaRealEm,null);assert.equal(r.pedido.elegivelPosVenda,false);
 const pos=await a.call({action:'consultarPosVenda'});assert.equal(pos.pedidos.length,0);assert.equal(pos.cobertura.elegiveisNaPagina,0);
});
test('fontes PCP e financeira falham explicitamente, distintas de consulta disponível sem títulos',async()=>{
 const a=ambiente();a.falha('pcp_registros');let r=await a.call({action:'consultarPedido',ordemId:'erp-original'});assert.equal(r.status,200);assert.equal(r.operacao.estado,'indisponivel');assert.equal(r.operacao.codigo,'PCP_INDISPONIVEL');assert.equal(r.pedido.elegivelPosVenda,false);
 a.falha('');a.banco.painel_cache.find(c=>c.chave==='recebiveis').valor=null;r=await a.call({action:'consultarPedido',ordemId:'erp-original'});assert.equal(r.financeiro.estado,'indisponivel');assert.equal(r.financeiro.codigo,'FINANCEIRO_INDISPONIVEL');assert.ok(r.financeiro.erro);assert.doesNotMatch(JSON.stringify(r),/ERRO-PRIVADO/);
});
test('configuração preserva participantes/exclusões/fichas omitidos e recusa IDs fora do catálogo',async()=>{
 const a=ambiente(),cfg={diasSemResposta:5,diasVencimento:3,diasReativacao:90};assert.equal((await a.call({action:'configurar',config:cfg})).status,403);a.sessao({sub:'gestor-ficticio',master:true});let r=await a.call({action:'configurar',config:cfg});assert.equal(r.status,200);assert.deepEqual(r.config.excluidosMetas,['v2']);assert.deepEqual(r.config.fichasProdutos,{});
 for(const extra of [{participantesMetas:['v1','v1']},{excluidosMetas:['fora']},{excluidosMetas:null}])assert.equal((await a.call({action:'configurar',config:{...cfg,...extra}})).status,400);
 assert.equal((await a.call({action:'configurar',config:{...cfg,fichasProdutos:{'fora':{}}}})).status,400);
});
test('editar ação conserva compromissoId legado e contato anterior, versão divergente não grava',async()=>{
 const a=ambiente(),anterior=a.banco.painel_registros.find(r=>r.id==='acao-original').registro;anterior.compromissoId='legado-original';
 const body={action:'salvarAcao',acao:{id:'acao-original',descricao:'Retorno reagendado'},versao:3};let r=await a.call(body);assert.equal(r.status,200);assert.equal(r.acao.id,'acao-original');assert.equal(r.acao.compromissoId,'legado-original');assert.equal(r.acao.contatoEm,anterior.contatoEm);assert.equal(r.acao.contatos.length,1);assert.equal(r.acao.versao,4);
 r=await a.call(body);assert.equal(r.status,409);assert.equal(a.banco.painel_registros.filter(r=>r.id==='acao-original').length,1);
 r=await a.call({...body,versao:4,acao:{...body.acao,confirmarContato:true}});assert.equal(r.status,400);assert.equal(a.banco.painel_registros.find(r=>r.id==='acao-original').registro.contatos.length,1);
});
test('consulta de pós-venda inclui entrega histórica fora do período e reutiliza ação pendente original',async()=>{
 const a=ambiente();let r=await a.call({action:'consultarPosVenda'});assert.equal(r.status,200);assert.equal(r.pedidos.length,1);assert.equal(r.pedidos[0].id,'erp-original');assert.equal(r.pedidos[0].posVendaEstado,'sem_acao');assert.equal(r.cobertura.totalCandidatos,1);assert.equal(r.cobertura.elegiveisNaPagina,1);assert.ok(r.coberturaHistorica);assert.doesNotMatch(JSON.stringify(r),/erp-outra|SEGREDO|PCP-NOTA|PCP-CONTATO|PCP-ANEXO|999999/);
 const pos={colecao:'comercial_acoes',id:'pos-original',registro:{id:'pos-original',tipoAcao:'pos_venda',vendedorId:'v1',clienteId:'c1',ordemId:'erp-original',descricao:'Consultar satisfação',data:dia,status:'pendente',versao:2}};a.banco.painel_registros.push(pos);
 r=await a.call({action:'consultarPosVenda'});assert.equal(r.pedidos[0].acaoPosVenda.id,'pos-original');assert.equal(r.pedidos[0].acaoPosVenda.versao,2);assert.equal(r.pedidos[0].posVendaEstado,'em_acompanhamento');assert.equal(a.gravacoes.length,0);
 pos.registro.status='concluida';r=await a.call({action:'consultarPosVenda'});assert.equal(r.pedidos[0].posVendaEstado,'a_conferir');
 Object.assign(pos.registro,{contatoEm:dia+'T12:00:00Z',contatos:[{em:dia+'T12:00:00Z',resultado:'Cliente satisfeito'}]});r=await a.call({action:'consultarPosVenda'});assert.equal(r.pedidos.length,0);assert.equal(r.cobertura.elegiveisNaPagina,1);
});
test('paginação de pós-venda conta candidatos e mostra cobertura incompleta sem inventar entrega',async()=>{
 const a=ambiente();a.banco.painel_ordens.push({...a.banco.painel_ordens[0],id:'pedido-sem-operacao',numero:'333',data:'2025-01-03'});
 let r=await a.call({action:'consultarPosVenda',tamanho:1});assert.equal(r.pedidos.length,0);assert.equal(r.paginacao.total,2);assert.equal(r.paginacao.temMais,true);assert.equal(r.cobertura.semVinculo,1);assert.equal(r.cobertura.completa,false);
 r=await a.call({action:'consultarPosVenda',pagina:2,tamanho:1});assert.equal(r.pedidos.length,1);assert.equal(r.pedidos[0].id,'erp-original');assert.equal(r.paginacao.temMais,false);
 a.falha('pcp_registros');r=await a.call({action:'consultarPosVenda'});assert.equal(r.status,200);assert.equal(r.pedidos.length,0);assert.equal(r.cobertura.operacaoIndisponivel,2);assert.equal(r.cobertura.completa,false);assert.equal(a.gravacoes.length,0);
});
