import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lerHistoricoComercial,mesclarOrdensComerciais,janelasHistoricas} from '../supabase/functions/_shared/carteira-historica.mjs';

function banco(registros,erroNaPagina=-1){
 const consultas=[];
 return {consultas,from(tabela){const consulta={tabela};consultas.push(consulta);const q={select(colunas){consulta.colunas=colunas;return q;},order(campo){consulta.ordem=campo;return q;},async range(inicio,fim){consulta.inicio=inicio;consulta.fim=fim;return inicio===erroNaPagina?{error:{message:'Falha simulada'}}:{data:registros.slice(inicio,fim+1)};}};return q;}};
}

test('leitura histórica compacta alcança 21.270 ordens sem carregar itens nem aplicar filtro de mês',async()=>{
 const registros=Array.from({length:21270},(_,i)=>({id:String(i),data:'2024-01-01'})),sb=banco(registros);
 const r=await lerHistoricoComercial(sb);assert.equal(r.length,21270);assert.deepEqual(r,registros);
 assert.ok(sb.consultas.length<=25);assert.ok(sb.consultas.some(q=>q.inicio===21000));
 for(const q of sb.consultas){assert.equal(q.tabela,'painel_ordens');assert.equal(q.ordem,'id');assert.equal(q.fim-q.inicio,999);assert.equal(q.colunas.includes('itens'),false);}
});

test('falha depois da primeira página não apresenta histórico parcial como completo',async()=>{
 const registros=Array.from({length:6000},(_,i)=>({id:String(i)}));
 await assert.rejects(()=>lerHistoricoComercial(banco(registros,5000)),e=>e.status===503);
});

test('cache enriquece a mesma identidade de O.S. e não liga registros pelo nome do cliente',()=>{
 const r=mesclarOrdensComerciais([{id:'1',cliente:'Mesmo nome',valor:10,comercial:{}},{id:'2',cliente:'Mesmo nome',valor:20,comercial:{tipo:'Normal',clienteId:'100'}}],[{id:'1',cliente:'Mesmo nome',tipo:'Normal',clienteId:'200',valor:10}]);
 assert.equal(r.length,2);assert.equal(r.find(o=>o.id==='1').clienteId,'200');assert.equal(r.find(o=>o.id==='2').clienteId,'100');
});

test('cobertura une janelas adjacentes e sobrepostas sem preencher lacunas ou janelas inconclusas',()=>{
 const j=(desde,ate)=>({desde,ate,concluidaEm:'2026-10-07T12:00:00Z'});
 const r=janelasHistoricas({janelas:{ordens:[j('2021-01-01','2021-12-31'),j('2020-01-01','2020-12-31'),j('2021-12-01','2022-02-28'),j('2024-01-01','2024-12-31'),{desde:'2023-01-01',ate:'2023-12-31'}]}});
 assert.deepEqual(r,[{desde:'2020-01-01',ate:'2022-02-28'},{desde:'2024-01-01',ate:'2024-12-31'}]);
});

test('cache antigo não reativa cancelamento nem devolve venda ao vendedor anterior',()=>{
 const historico=[{id:'1',vendedor:'Bia Costa',atualizado_em:'2026-10-07T12:00:00Z',comercial:{tipo:'Normal',clienteId:'100',cancelada:true}}],cache=[{id:'1',vendedor:'Ana Silva',vendedorErpId:'1',tipo:'Normal',clienteId:'100',cancelada:false}];
 let [r]=mesclarOrdensComerciais(historico,cache,'2026-10-07T11:00:00Z');assert.equal(r.cancelada,true);assert.equal(r.vendedor,'Bia Costa');assert.equal(r.vendedorErpId,null);
 [r]=mesclarOrdensComerciais(historico,cache,'2026-10-07T13:00:00Z');assert.equal(r.cancelada,true);assert.equal(r.vendedor,'Bia Costa');assert.equal(r.vendedorErpId,null);
});

test('timestamp próprio mais recente da O.S. pode atualizar identificação e cancelamento',()=>{
 const historico=[{id:'1',vendedor:'Bia Costa',atualizado_em:'2026-10-07T12:00:00Z',comercial:{tipo:'Normal',clienteId:'100',cancelada:true}}];
 const cache=[{id:'1',vendedor:'Ana Silva',vendedorErpId:'1',tipo:'Normal',clienteId:'100',cancelada:false,atualizado_em:'2026-10-07T13:00:00Z'}];
 const [r]=mesclarOrdensComerciais(historico,cache,'2026-10-07T11:00:00Z');
 assert.equal(r.cancelada,false);assert.equal(r.vendedor,'Ana Silva');assert.equal(r.vendedorErpId,'1');
});
