import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {apurarDashboard,detalharDashboard,ratearProdutosDashboard} from '../supabase/functions/_shared/comercial-dashboard.mjs';

const require=createRequire(import.meta.url),{buildSync}=createRequire(require.resolve('vite'))('esbuild');
const bundle=buildSync({entryPoints:[fileURLToPath(new URL('../supabase/functions/_shared/comercial-dashboard-consulta.ts',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node'}).outputFiles[0].text;
const {lerPaginasDashboard}=await import('data:text/javascript;base64,'+Buffer.from(bundle).toString('base64'));
const hoje='2026-10-17',filtro={modo:'mes',mes:'2026-10'},gestor={sub:'direcao',master:true};
const os=(id,extra={})=>({id,numero:'900'+id,clienteId:'cliente-'+id,cliente:'Cliente fictício '+id,vendedor:'Ana Exemplo',vendedorErpId:'1',data:'2026-10-01',tipo:'Normal',empresaNome:'Impresilk',valor:100,bruto:100,desconto:0,itens:[{produto:'Produto fictício',valorTotal:100,quantidade:1,unidade:'un'}],...extra});
const base=(extra={})=>({catalogo:{completo:true,vendedores:[{id:'1',nome:'Ana Exemplo'},{id:'2',nome:'Beatriz Exemplo'}],produtos:[{id:'p',nome:'Produto fictício'}]},config:{vinculos:{ana:'1',beatriz:'2'}},ordens:[os('1')],recentes:[],cargaStatus:{janelas:{ordens:[{desde:'2026-01-01',ate:hoje,concluidaEm:hoje}]}},recebiveis:[],metas:[],orcamentos:[],...extra});
const run=(b,session=gestor,filter=filtro)=>apurarDashboard(b,filter,hoje,session);

test('leitura paginada limita concorrência; falha e teto não devolvem histórico truncado',async()=>{
 let ativos=0,max=0;const rows=Array.from({length:7},(_,id)=>({id})),criar=()=>({async range(a,b){ativos++;max=Math.max(max,ativos);await Promise.resolve();ativos--;return {data:rows.slice(a,b+1)};}});
 assert.deepEqual(await lerPaginasDashboard(criar,3,12),rows);assert.equal(max,4);
 await assert.rejects(lerPaginasDashboard(()=>({range:async(a,b)=>({data:Array.from({length:b-a+1},(_,i)=>({id:a+i}))})}),3,12),e=>e.status===503);
 await assert.rejects(lerPaginasDashboard(()=>({range:async a=>a===3?{error:{message:'falha simulada'}}:{data:rows.slice(a,a+3)}}),3,12),e=>e.status===503);
});

test('ausência de valor confirmado não vira zero; zero explícito com origem e cobertura é venda conhecida',()=>{
 const r=run(base({ordens:[os('1',{valorConfirmado:false}),os('2',{valor:null})]}));
 assert.equal(r.resumo.centavos,null);assert.equal(r.resumo.pedidos,null);assert.equal(r.resumo.completo,false);assert.equal(r.rankings.produtos.length,0);
 const z=run(base({ordens:[os('zero',{valor:0,bruto:0,desconto:0})]}));
 assert.equal(z.resumo.centavos,0);assert.equal(z.resumo.pedidos,1);assert.equal(z.resumo.completo,true);assert.equal(z.comparacoes.anterior.percentual,null);
});

test('empresa não é inferida por prefixo ou cliente; número igual em empresas distintas bloqueia vínculo financeiro',()=>{
 const b=base({ordens:[os('1'),os('2',{empresaNome:'Impresilk Outra Empresa',cliente:'Impresilk',numero:'9001',valor:10000})],recebiveis:[{id:'titulo-1',os:'9001',valor:50,vencimento:'2026-10-01'}]});
 const r=run(b);assert.equal(r.resumo.centavos,10000);assert.equal(r.resumo.completo,true);assert.equal(r.cobertura.empresa.divergenciasExcluidas,1);
 assert.equal(r.financeiro.indiceAtraso,null);assert.equal(r.financeiro.vencidoCentavos,null);assert.equal(r.financeiro.titulosAConferir,1);
 assert.equal(r.catalogo.clientes.some(c=>c.id==='cliente-2'),false);
});

test('permissão individual fecha total, nome, IDs e detalhe; gestor pode trocar vendedor após filtrar',()=>{
 const b=base({ordens:[os('1'),os('sigiloso',{vendedor:'Beatriz Exemplo',vendedorErpId:'2',cliente:'Comprador restrito'})]}),ana={sub:'ana',perms:['orcamentos']};
 const r=run(b,ana);assert.equal(r.resumo.centavos,10000);assert.equal(JSON.stringify(r).includes('Comprador restrito'),false);assert.equal(JSON.stringify(r).includes('Beatriz Exemplo'),false);
 assert.equal(detalharDashboard(b,filtro,hoje,ana,{dimensao:'cliente',id:'cliente-sigiloso'}).paginacao.total,0);
 assert.throws(()=>run(b,ana,{...filtro,equipe:'qualquer'}),e=>e.status===403);
 assert.throws(()=>run(b,{sub:'sem-vinculo',perms:['orcamentos']}),e=>e.status===403);
 assert.deepEqual(run(b,gestor,{...filtro,vendedor:'1'}).catalogo.vendedores.map(v=>v.id).sort(),['1','2']);
});

test('rateio de valores altos preserva centavos e desempata resíduos na ordem dos itens',()=>{
 const total=90000000000000,itens=[199999999.91,299999999.73,499999999.87],partes=ratearProdutosDashboard({valor:total/100,itens:itens.map((valorTotal,i)=>({produto:'P'+i,valorTotal}))});
 const cs=itens.map(v=>BigInt(Math.round(v*100))),soma=cs.reduce((s,n)=>s+n,0n),esperadas=cs.map((c,i)=>({i,inteiro:BigInt(total)*c/soma,resto:BigInt(total)*c%soma}));
 let sobra=BigInt(total)-esperadas.reduce((s,p)=>s+p.inteiro,0n);
 for(const p of [...esperadas].sort((a,b)=>a.resto===b.resto?a.i-b.i:a.resto>b.resto?-1:1))if(sobra>0n){p.inteiro++;sobra--;}
 assert.deepEqual(partes.map(p=>p.centavos),esperadas.map(p=>Number(p.inteiro)));assert.equal(partes.reduce((s,p)=>s+p.centavos,0),total);
 const iguais=ratearProdutosDashboard({valor:0.02,itens:['A','B','C'].map(produto=>({produto,valorTotal:1}))});
 assert.deepEqual(iguais.map(p=>p.centavos),[1,1,0]);
});
