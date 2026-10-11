import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import vm from 'node:vm';
import * as acesso from '../supabase/functions/_shared/patrimonio-acesso.mjs';
import {prepararFisico,prepararConferencia} from '../supabase/functions/_shared/patrimonio-fisico.mjs';
import {validarVinculoPessoa} from '../supabase/functions/_shared/patrimonio-pessoas.mjs';
import {temHistoricoPessoal} from '../supabase/functions/_shared/documentos.mjs';
const ID='68e0bdaf-75ac-4cb8-8295-e86d8adf7656';
const fonte=readFileSync(process.env.PATRIMONIO_ATIVOS_SOURCE||new URL('../supabase/functions/painel-ativos/index.ts',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'');
const codigo=transformSync(fonte,{loader:'ts',format:'esm',target:'es2022'}).code;
function ambiente(perms=['patrimonio'],rpcError=null){
 let handler;const linhas=[];let gravacoes=0;const arquivos=new Map();
 const sb={from(){const filtros=[];let excluir=false;const q={async upsert(){return {error:rpcError}},delete(){excluir=true;return q},select(){return q},eq(k,v){filtros.push([k,v]);return q},async maybeSingle(){return {data:linhas.find(r=>filtros.every(([k,v])=>(k.startsWith('registro->>')?r.registro[k.slice(11)]:r[k])===v))||null,error:null}},then(ok){if(excluir)for(let i=linhas.length-1;i>=0;i--)if(filtros.every(([k,v])=>linhas[i][k]===v))linhas.splice(i,1);return Promise.resolve({data:linhas.filter(r=>filtros.every(([k,v])=>(k.startsWith('registro->>')?r.registro[k.slice(11)]:r[k])===v)),error:null}).then(ok)}};return q},async rpc(name,p){gravacoes++;if(rpcError){assert.ok(['painel_ativo_restaurar','painel_ativo_retirar'].includes(name));return {error:rpcError};}assert.equal(name,'painel_registro_gravar');const old=linhas.find(r=>r.colecao===p.p_colecao&&r.id===p.p_id);if(JSON.stringify(old?.registro??null)!==JSON.stringify(p.p_anterior))return {error:{code:'40001'}};if(old)old.registro=structuredClone(p.p_registro);else linhas.push({colecao:p.p_colecao,id:p.p_id,registro:structuredClone(p.p_registro)});return {data:p.p_registro,error:null}},storage:{from(){return {async upload(k,bytes){arquivos.set(k,bytes);return {error:null}},async download(k){return {data:arquivos.has(k)?new Blob([arquivos.get(k)]):null,error:arquivos.has(k)?null:{message:'missing'}}},async remove(keys){for(const k of keys)arquivos.delete(k);return {error:null}}}}}};
 const sessao={sub:'ana',nome:'Ana',perms};vm.runInNewContext(codigo,{...acesso,temHistoricoPessoal,prepararFisico,validarVinculoPessoa,lerPessoasPatrimonio:async()=>[{id:'rh1',nome:'Pessoa RH',disponivel:true}],previaReclassificacao:()=>[],Deno:{env:{get:()=> 'teste'},serve:f=>handler=f},createClient:()=>sb,verificarJwt:async()=>sessao,crachaRevogado:async()=>false,Request,Response,console:{error(){}},crypto,atob,btoa,Uint8Array,Blob});
 return {linhas,arquivos,get gravacoes(){return gravacoes},async pedido(body){const response=await handler(new Request('http://teste',{method:'POST',headers:{authorization:'Bearer teste'},body:JSON.stringify(body)}));return {status:response.status,body:await response.json()}},async chamar(action,item,versao){return this.pedido({action,item,versao})}};
}
const extintor={cadastroId:ID,tipo:'predial',categoria:'Extintor',nome:'Extintor recepção',identificacao:'EX-01',responsavelId:'rh1',especificacao:{local:'Recepção',numero:'01',setorId:'setor-1',tipoExtintor:'PQS',capacidade:'6 kg',situacao:'uso'},validade:'2027-10-11'};
test('handler salvarFisico grava extintor fechado, preserva dados privados e valida versão',async()=>{
 const a=ambiente();a.linhas.push({colecao:'setores',id:'setor-1',registro:{nome:'Recepção'}});
 let r=await a.chamar('salvarFisico',extintor);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.item.validade,'2027-10-11');assert.equal(r.body.item.responsavel,'Pessoa RH');
 const antigo=a.linhas.find(x=>x.id===ID).registro;antigo.valor=1000;antigo.arquivoNome='nota.pdf';
 r=await a.chamar('salvarFisico',{id:ID,especificacao:{capacidade:'4 kg'}},antigo.atualizadoEm);assert.equal(r.status,200,JSON.stringify(r.body));
 const atual=a.linhas.find(x=>x.id===ID).registro;assert.equal(atual.valor,1000);assert.equal(atual.especificacao.local,'Recepção');assert.equal(atual.especificacao.capacidade,'4 kg');assert.doesNotMatch(JSON.stringify(r.body),/nota.pdf|1000/);
 assert.equal((await a.chamar('salvarFisico',{id:ID,nome:'antigo'},antigo.atualizadoEm)).status,409);
});
test('handler recusa campo livre, categoria alterada e permissão inadequada',async()=>{
 for(const item of [{...extintor,senha:'123'},{...extintor,especificacao:{...extintor.especificacao,senha:'123'}},{...extintor,validade:'2026-02-30'}]){const a=ambiente();a.linhas.push({colecao:'setores',id:'setor-1',registro:{}});const r=await a.chamar('salvarFisico',item);assert.equal(r.status,422,JSON.stringify(r.body));assert.equal(a.gravacoes,0)}
 const a=ambiente();a.linhas.push({colecao:'setores',id:'setor-1',registro:{}});const r=await a.chamar('salvarFisico',extintor);assert.equal(r.status,200);assert.equal((await a.chamar('salvarFisico',{id:ID,categoria:'AVCB'},r.body.item.atualizadoEm)).status,422);
 const negado=ambiente(['seguranca']);assert.equal((await negado.chamar('salvarFisico',extintor)).status,403);
});
test('checklist fechado exige todas as câmeras e preserva conferência encerrada',()=>{
 const s={sub:'ana',nome:'Ana'};const d={data:'2026-10-11',itens:[{cameraId:'cam1',status:'gravando'},{cameraId:'cam2',status:'sem-imagem'}]};
 const r=prepararConferencia(d,null,['cam1','cam2'],s,'2026-10-11T10:00:00Z');assert.equal(r.criadoPor,'ana');
 assert.throws(()=>prepararConferencia(d,r,['cam1','cam2'],s,'2026-10-11T11:00:00Z'),/imutável/);
 assert.throws(()=>prepararConferencia({...d,itens:d.itens.slice(0,1)},null,['cam1','cam2'],s,''),/todas/);
});
test('listas de segurança preservam IDs, referências e histórico encerrado',()=>{
 const zona='6f7c96ea-3c45-4afa-a848-c84001e61732',sensor='1301996c-b880-4e9b-84c7-6f705402724f';
 const base={tipo:'seguranca',categoria:'Alarme',nome:'Alarme',especificacao:{zonas:[{id:zona,nome:'Entrada',local:'Porta'}],sensores:[{id:sensor,nome:'Contato',local:'Porta',zonaId:zona}],autorizados:[]}};
 const novo=prepararFisico(base,null,{pessoas:[]});assert.equal(novo.especificacao.zonas[0].id,zona);assert.equal(novo.especificacao.sensores[0].zonaId,zona);
 const auth='dd2e74eb-35f3-4798-8c66-fc36607294b6';const antes={...base,especificacao:{...novo.especificacao,autorizados:[{id:auth,pessoaId:'rh1',liberadoEm:'2026-10-11',bloqueadoEm:'2026-10-12'}]}};
 assert.throws(()=>prepararFisico({tipo:'seguranca',categoria:'Alarme',especificacao:{autorizados:[]}},antes,{pessoas:[{id:'rh1',disponivel:true}]}),/não pode ser alterada/);
 const posse={tipo:'seguranca',categoria:'Chave',nome:'Chave',especificacao:{copias:[{id:auth,numero:'1',tipo:'chave',pessoaId:'rh1',entrega:'2026-10-11',devolucao:''}]}};
 assert.throws(()=>prepararFisico({especificacao:{copias:[]}},posse,{pessoas:[{id:'rh1',disponivel:true}]}),/não pode ser alterada/);
 assert.throws(()=>prepararFisico({especificacao:{copias:[{...posse.especificacao.copias[0],pessoaId:'rh2'}]}},posse,{pessoas:[{id:'rh1',disponivel:true},{id:'rh2',disponivel:true}]}),/não pode ser alterada/);
 assert.throws(()=>prepararFisico({especificacao:{copias:[{...posse.especificacao.copias[0],devolucao:'2026-10-10'}]}},posse,{pessoas:[{id:'rh1',disponivel:true}]}),/anterior à entrega/);
 const fechado=prepararFisico({especificacao:{copias:[{...posse.especificacao.copias[0],devolucao:'2026-10-12'}]}},posse,{pessoas:[{id:'rh1',disponivel:true}]});assert.equal(fechado.especificacao.copias[0].devolucao,'2026-10-12');
});
test('câmera valida canal contra gravador e ocupação; campos numéricos são inteiros',()=>{
 const cam={tipo:'seguranca',categoria:'Câmera',nome:'Câmera 1',especificacao:{gravadorId:'dvr1',canal:'5'}};
 const refs={gravadorId:'dvr1',gravador:{tipo:'seguranca',categoria:'DVR/NVR',especificacao:{canaisTotais:'4'}}};
 assert.throws(()=>prepararFisico(cam,null,refs),/capacidade/);
 assert.throws(()=>prepararFisico({...cam,especificacao:{...cam.especificacao,canal:'1.5'}},null,refs),/inteiro/);
 assert.throws(()=>prepararFisico({...cam,especificacao:{...cam.especificacao,canal:'2'}},null,{...refs,ocupadoCanal:true}),/ocupado/);
 assert.equal(prepararFisico({...cam,especificacao:{...cam.especificacao,canal:'2'}},null,refs).especificacao.canal,'2');
});
test('anexo de incêndio usa ação privada com assinatura validada e sem acesso à nota fiscal',async()=>{
 const a=ambiente();a.linhas.push({colecao:'ativo',id:ID,registro:{id:ID,tipo:'predial',categoria:'Extintor',nome:'Extintor',atualizadoEm:'2026-10-11T10:00:00.000Z'}});
 const pdf=btoa('%PDF-1.4 teste');
 assert.equal((await a.pedido({action:'guardarArquivoIncendio',id:ID,base64:btoa('falso'),mime:'application/pdf',nome:'inspeção.pdf'})).status,422);
 const r=await a.pedido({action:'guardarArquivoIncendio',id:ID,base64:pdf,mime:'application/pdf',nome:'inspeção.pdf'});assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(a.arquivos.size,1);
 const l=await a.pedido({action:'lerArquivoIncendio',id:ID});assert.equal(l.status,200);assert.equal(l.body.base64,pdf);
 assert.equal((await a.pedido({action:'guardarArquivoIncendio',id:ID,base64:pdf,mime:'application/pdf',nome:'outra.pdf'})).status,409);
 const sem=ambiente(['manutencoes']);sem.linhas.push(...a.linhas);assert.equal((await sem.pedido({action:'lerArquivoIncendio',id:ID})).status,403);
});
test('salvar genérico conserva listas físicas e anexo de incêndio',async()=>{
 const a=ambiente(['patrimonio','manutencoes','seguranca']);
 const copia='e6da2a66-aa58-4d6b-b72e-67879411e3ed';
 a.linhas.push({colecao:'ativo',id:'chave1',registro:{id:'chave1',tipo:'seguranca',categoria:'Chave',nome:'Chave',especificacao:{local:'Portaria',copias:[{id:copia,numero:'1',pessoaId:'rh1',entrega:'2026-10-11',devolucao:''}]}}});
 a.linhas.push({colecao:'ativo',id:'ext1',registro:{id:'ext1',tipo:'predial',categoria:'Extintor',nome:'Extintor',especificacao:{local:'Portaria',numero:'1'},arquivoIncendio:{chave:'incendio/ext1/doc',mime:'application/pdf',nome:'laudo.pdf'}}});
 assert.equal((await a.pedido({action:'salvar',item:{id:'chave1',tipo:'seguranca',categoria:'Chave',nome:'Chave atualizada'}})).status,200);
 assert.equal(a.linhas.find(x=>x.id==='chave1').registro.especificacao.copias[0].id,copia);
 assert.equal((await a.pedido({action:'salvar',item:{id:'ext1',tipo:'predial',categoria:'Extintor',nome:'Extintor atualizado'}})).status,200);
 assert.equal(a.linhas.find(x=>x.id==='ext1').registro.arquivoIncendio.nome,'laudo.pdf');
});

test('revisão: vínculo inverso impede troca e limpeza inclusive legado só inverso',async()=>{
 for(const direto of ['bemA',''])for(const destino of ['bemB','']){
  const a=ambiente(['patrimonio','inventario-valores']);
  a.linhas.push({colecao:'ativo',id:'pc1',registro:{id:'pc1',tipo:'informatica',categoria:'Computador',nome:'PC',bemId:direto,atualizadoEm:'v1',especificacao:{}}},{colecao:'patrimonio',id:'bemA',registro:{origemAtivoId:'pc1'}},{colecao:'patrimonio',id:'bemB',registro:{}});
  const r=await a.chamar('salvarFisico',{id:'pc1',bemId:destino},'v1');assert.equal(r.status,409,JSON.stringify(r.body));assert.equal(a.gravacoes,0);assert.equal(a.linhas[0].registro.bemId,direto);
 }
});
test('revisão: roundtrip 180 e legado longo conservam texto ao editar outro campo e salvar genérico',async()=>{
 for(const tamanho of [180,220]){
  const a=ambiente(['seguranca','manutencoes']);const local='x'.repeat(tamanho);
  if(tamanho>180)a.linhas.push({colecao:'ativo',id:ID,registro:{id:ID,tipo:'seguranca',categoria:'Chave',nome:'Chave',especificacao:{local},atualizadoEm:'v1'}});
  let r=await a.chamar('salvarFisico',tamanho>180?{id:ID,nome:'Nome novo'}:{cadastroId:ID,tipo:'seguranca',categoria:'Chave',nome:'Chave',especificacao:{local}},tamanho>180?'v1':undefined);
  assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.item.especificacao.local,local);
  r=await a.chamar('salvarFisico',{id:ID,nome:'Nome atualizado',especificacao:r.body.item.especificacao},r.body.item.atualizadoEm);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(a.linhas[0].registro.especificacao.local,local);
  r=await a.pedido({action:'salvar',item:{id:ID,tipo:'seguranca',categoria:'Chave',nome:'Nome genérico'}});assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(a.linhas[0].registro.especificacao.local,local);
  r=await a.pedido({action:'salvar',item:{id:ID,tipo:'seguranca',categoria:'Chave',nome:'Nome genérico',especificacao:{local:local+'y'}}});assert.equal(r.status,422);assert.equal(a.linhas[0].registro.especificacao.local,local);
 }
});
test('revisão: restaurar propaga conflito da transação sem escritas independentes',async()=>{
 const a=ambiente(['seguranca','manutencoes'],{code:'23505',message:'conflito'});
 a.linhas.push({colecao:'ativo_lixeira',id:'cam1',registro:{id:'cam1',tipo:'seguranca',categoria:'Câmera',especificacao:{numero:'1'},_apagadoEm:'ontem'}},{colecao:'arquivo_lixeira',id:'cam1',registro:{nome:'foto.pdf'}});
 const antes=structuredClone(a.linhas);const r=await a.pedido({action:'restaurar',id:'cam1'});assert.equal(r.status,409);assert.deepEqual(a.linhas,antes);assert.equal(a.gravacoes,1);
});
test('revisão: legado de setor/gravador ausente permite edição sem inventar vínculo; novo vínculo inválido falha',()=>{
 const antes={tipo:'seguranca',categoria:'Câmera',nome:'Legado',especificacao:{setorId:'ausente',gravadorId:'ausente'}};
 assert.equal(prepararFisico({nome:'Atualizado',especificacao:{...antes.especificacao}},antes).especificacao.setorId,'ausente');
 assert.throws(()=>prepararFisico({especificacao:{setorId:'outro'}},antes),/setor/);
});

test('revisão: retirada com referência retorna conflito e orientação sem remover ficha',async()=>{
 const a=ambiente(['seguranca','manutencoes'],{code:'23503',message:'gravador em uso'});
 a.linhas.push({colecao:'ativo',id:'dvr',registro:{id:'dvr',tipo:'seguranca',categoria:'DVR/NVR'}});
 const antes=structuredClone(a.linhas);const r=await a.pedido({action:'remover',id:'dvr'});assert.equal(r.status,409);assert.match(r.body.erro,/Troque ou desvincule/);assert.deepEqual(a.linhas,antes);
});
