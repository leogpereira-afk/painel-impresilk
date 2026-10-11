import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import vm from 'node:vm';
import {UUID_INFRA,prepararInfra,infraPermitida} from '../supabase/functions/_shared/patrimonio-infra.mjs';
import {prepararControle,carimbarPatrimonio} from '../supabase/functions/_shared/patrimonio-controles.mjs';
import {prepararConferencia,prepararFisico} from '../supabase/functions/_shared/patrimonio-fisico.mjs';
import {validarVinculoPessoa,prepararPessoasControle} from '../supabase/functions/_shared/patrimonio-pessoas.mjs';
import * as acesso from '../supabase/functions/_shared/patrimonio-acesso.mjs';
const C='be26ec80-27ce-42b2-b927-8f3a0ce51c70', I='78a671f9-7fe9-4372-b7ad-9f9e949ff600', P='8cb02b69-0da0-4f36-b3e6-a490bb17e9fb';
const fonte=readFileSync(new URL('../supabase/functions/painel-config/index.ts',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'');
const codigo=transformSync(fonte,{loader:'ts',format:'esm',target:'es2022'}).code;
function ambiente(perms=['patrimonio','inventario-valores']){
 let handler,antesRpc=null;const linhas=[],arquivos=new Map();
 const sb={from(tabela){assert.equal(tabela,'painel_registros');const filtros=[];let inicio=0,fim=Infinity;
   const q={select(){return q},eq(k,v){filtros.push([k,v]);return q},order(){return q},range(a,b){inicio=a;fim=b;return q},
   async maybeSingle(){return {data:resultado()[0]??null,error:null}},then(ok){return Promise.resolve({data:resultado().slice(inicio,fim+1),error:null}).then(ok)}};
   function resultado(){return structuredClone(linhas.filter(r=>filtros.every(([k,v])=>r[k]===v)));}return q;
  },async rpc(nome,p){assert.equal(nome,'painel_registro_gravar');if(antesRpc)await antesRpc();
    const i=linhas.findIndex(r=>r.colecao===p.p_colecao&&r.id===p.p_id),atual=linhas[i]?.registro??null;
    if(JSON.stringify(atual)!==JSON.stringify(p.p_anterior))return {error:{code:'40001',message:'conflito'}};
    if(p.p_colecao==='patrimonio_infra'&&p.p_registro.tipo==='plano-corporativo'&&linhas.some((r,j)=>j!==i&&r.colecao===p.p_colecao&&r.registro.tipo==='plano-corporativo'))return {error:{code:'23505',message:'singleton'}};
    const row={colecao:p.p_colecao,id:p.p_id,registro:structuredClone(p.p_registro)};if(i<0)linhas.push(row);else linhas[i]=row;return {data:row.registro,error:null};
  },storage:{from(){return{async upload(chave,bytes){arquivos.set(chave,bytes);return{error:null}},async download(chave){return {data:arquivos.has(chave)?new Blob([arquivos.get(chave)]):null,error:arquivos.has(chave)?null:{message:'ausente'}}},async remove(chaves){for(const chave of chaves)arquivos.delete(chave);return{error:null}}}}}};
 const sessao=perms===null?null:{sub:'ana',nome:'Ana',perms};
 vm.runInNewContext(codigo,{...acesso,UUID_INFRA,prepararInfra,infraPermitida,prepararControle,carimbarPatrimonio,prepararConferencia,validarVinculoPessoa,prepararPessoasControle,lerPessoasPatrimonio:async()=>[],Deno:{env:{get:()=> 'teste'},serve:f=>handler=f},createClient:()=>sb,verificarJwt:async()=>sessao,crachaRevogado:async()=>false,Request,Response,console:{error(){}},crypto,atob,btoa,Uint8Array,Blob});
 return {linhas,arquivos,antesRpc:f=>antesRpc=f,async chamar(body){const r=await handler(new Request('http://local',{method:'POST',headers:{authorization:'Bearer teste'},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()}}};
}
const contato={tipo:'contato',nome:'Suporte',telefone:'3130000000',whatsapp:'',email:'suporte@example.test',endereco:'Rua Teste'};
const internet={tipo:'internet',operadora:'Operadora',plano:'Fibra',download:'500 Mbps',upload:'250 Mbps',valorMensal:19.99,inicioVigencia:'2026-10-11',fimVigencia:'2027-10-11',endereco:'Unidade',tecnicoId:C};
const salvar=(a,id,dados,versaoAnterior=null)=>a.chamar({action:'salvarInfra',id,dados,versaoAnterior});
test('infra cria contato e internet por UUID; preço centesimal, limpeza explícita e CAS',async()=>{
 const a=ambiente();assert.equal((await salvar(a,C,contato)).status,200);
 let r=await salvar(a,I,internet);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.item.valorMensal,19.99);
 const antes=r.body.item.atualizadoEm;
 r=await salvar(a,I,{tipo:'internet',valorMensal:null,fimVigencia:null},antes);assert.equal(r.status,200,JSON.stringify(r.body));
 assert.equal(r.body.item.valorMensal,'');assert.equal(r.body.item.fimVigencia,'');assert.equal(r.body.item.operadora,'Operadora');
 assert.equal((await salvar(a,I,{tipo:'internet',plano:'Antigo'},antes)).status,409);
 assert.equal((await salvar(a,'nome-livre',internet)).status,422);
});
test('leitura operacional poda preço/contrato e escrita de valores exige permissão',async()=>{
 const a=ambiente(['patrimonio']);a.linhas.push({colecao:'patrimonio_infra',id:I,registro:{...internet,contrato:{chave:'infra/x',nome:'privado.pdf'},atualizadoEm:'2026-10-11T10:00:00Z'}});
 const r=await a.chamar({action:'lerInfra'});assert.equal(r.status,200);assert.equal(r.body.podeValores,false);
 assert.equal(r.body.itens[I].plano,'Fibra');assert.equal(r.body.itens[I].valorMensal,undefined);assert.equal(r.body.itens[I].contrato,undefined);
 assert.equal((await salvar(a,I,{tipo:'internet',valorMensal:20},'2026-10-11T10:00:00Z')).status,403);
 assert.equal((await a.chamar({action:'lerContratoInfra',id:I})).status,403);
 assert.equal((await salvar(a,I,{tipo:'internet',plano:'Fibra 2'},'2026-10-11T10:00:00Z')).status,200); // vínculo antigo intacto
 a.linhas.push({colecao:'patrimonio_infra',id:C,registro:contato});
 const ok=await salvar(a,I,{tipo:'internet',plano:'Fibra 2'},a.linhas.find(x=>x.id===I).registro.atualizadoEm);assert.equal(ok.status,200,JSON.stringify(ok.body));
 assert.equal(a.linhas.find(x=>x.id===I).registro.valorMensal,19.99);
});
test('plano único e vínculos tipados recusam contato/plano inexistente',async()=>{
 const a=ambiente();const plano={tipo:'plano-corporativo',operadora:'Telecom',nome:'Corporativo',valorMensal:200,quantidadeLinhas:5,franquia:'20 GB',inicioVigencia:'',fimVigencia:'',contatoId:C};
 assert.equal((await salvar(a,P,plano)).status,409);
 await salvar(a,C,contato);assert.equal((await salvar(a,P,plano)).status,200);
 assert.equal((await salvar(a,I,{...plano,contatoId:P})).status,409);
 assert.equal((await salvar(a,I,{...plano,contatoId:C})).status,409);
 assert.equal((await salvar(a,I,{...internet,tecnicoId:P})).status,409);
});
test('contrato privado aceita PDF assinado uma vez, confere versão e conserva arquivo no conflito',async()=>{
 const a=ambiente();await salvar(a,C,contato);let r=await salvar(a,I,internet);const versao=r.body.item.atualizadoEm,base64=btoa('%PDF-1.4 exemplo');
 const req={action:'guardarContratoInfra',id:I,mime:'application/pdf',nome:'contrato.pdf',base64,versaoAnterior:versao};
 assert.equal((await a.chamar({...req,base64:btoa('arquivo falso')})).status,422);
 assert.equal((await a.chamar({...req,versaoAnterior:'antiga'})).status,409);
 r=await a.chamar(req);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(a.arquivos.size,1);
 assert.equal((await a.chamar({action:'lerContratoInfra',id:I})).body.base64,base64);
 assert.equal((await a.chamar(req)).status,409);
});
test('fichas de servidor e energia validam técnico, categoria e IDs de unidades',()=>{
 const server={tipo:'informatica',categoria:'Servidor',nome:'Servidor teste',especificacao:{rede:'LAN',enderecoIP:'10.0.0.1',backup:'Diário',tecnicoId:C}};
 assert.equal(prepararFisico(server,null,{tecnico:true}).especificacao.backup,'Diário');
 assert.throws(()=>prepararFisico(server,null,{}),/contato técnico/);
 assert.throws(()=>prepararFisico({...server,especificacao:{...server.especificacao,senha:'secreta'}},null,{tecnico:true}),/não permitido/);
 const usina={tipo:'predial',categoria:'Usina fotovoltaica',nome:'Usina',especificacao:{local:'Telhado',unidadesConsumidoras:[P],tecnicoId:C}};
 assert.equal(prepararFisico(usina,null,{tecnico:true,unidadesConsumidoras:[P]}).especificacao.unidadesConsumidoras[0],P);
 assert.throws(()=>prepararFisico(usina,null,{tecnico:true,unidadesConsumidoras:[]}),/padrões de energia/);
 assert.throws(()=>prepararFisico({...usina,especificacao:{...usina.especificacao,unidadesConsumidoras:['nome']}},null,{tecnico:true}),/Unidades consumidoras/);
 assert.equal(prepararFisico({tipo:'predial',categoria:'Transformador',nome:'Transformador',especificacao:{kva:'75',endereco:'Unidade'}},null,{}).especificacao.kva,'75');
});
test('linha disponível dispensa aparelho e modelo, mantém legado e exige plano UUID válido',()=>{
 const sessao={sub:'ana',nome:'Ana'},agora='2026-10-11T10:00:00.000Z';
 const disponivel=prepararControle({tipo:'celulares',numero:'31999990000',status:'disponivel',planoId:P,versaoAnterior:null},null,sessao,agora,{plano:true});
 assert.equal(disponivel.modelo,'');assert.equal(disponivel.planoId,P);
 assert.throws(()=>prepararControle({tipo:'celulares',numero:'31999990000',status:'disponivel',planoId:C,versaoAnterior:null},null,sessao,agora,{plano:false}),/plano corporativo/);
 const legado={...disponivel,operadora:'Legado',historico:[{acao:'teste'}],modelo:'A15'};
 const editado=prepararControle({tipo:'celulares',numero:disponivel.numero,status:'inativo',versaoAnterior:disponivel.atualizadoEm},legado,sessao,'2026-10-11T11:00:00.000Z',{plano:true});
 assert.equal(editado.operadora,'Legado');assert.equal(editado.modelo,'A15');assert.equal(editado.historico[0].acao,'teste');
});
test('linha ativa mantém pessoa do RH e plano sem exigir aparelho ou modelo',()=>{
 const sessao={sub:'ana'},agora='2026-10-11T10:00:00.000Z';
 const disponivel=prepararControle({tipo:'celulares',numero:'31999990000',status:'disponivel',planoId:P,versaoAnterior:null},null,sessao,agora,{plano:true});
 const ativo=prepararControle({status:'ativo',pessoaId:'rh-1',pessoa:'Ana',versaoAnterior:disponivel.atualizadoEm},disponivel,sessao,'2026-10-11T11:00:00.000Z',{});
 assert.equal(ativo.status,'ativo');assert.equal(ativo.pessoaId,'rh-1');assert.equal(ativo.planoId,P);assert.equal(ativo.modelo,'');assert.equal(ativo.aparelhoId,'');
 assert.equal(ativo.historicoAparelhos.at(-1).pessoaId,'rh-1');
 const legado={...ativo,planoId:'plano-legado'};
 assert.equal(prepararControle({observacao:'Editada',planoId:'plano-legado',versaoAnterior:ativo.atualizadoEm},legado,sessao,'2026-10-11T12:00:00.000Z',{}).planoId,'plano-legado');
 assert.throws(()=>prepararControle({planoId:'plano-novo',versaoAnterior:ativo.atualizadoEm},ativo,sessao,'2026-10-11T12:00:00.000Z',{}),/plano corporativo/);
});
test('edições preservam referências órfãs intactas e recusam novas referências inválidas',async()=>{
 const usina={tipo:'predial',categoria:'Usina fotovoltaica',nome:'Usina',especificacao:{tecnicoId:C,unidadesConsumidoras:[P]}};
 assert.equal(prepararFisico({nome:'Usina 2'},usina,{}).especificacao.unidadesConsumidoras[0],P);
 assert.equal(prepararFisico({nome:'Usina 2'},{...usina,especificacao:{unidadesConsumidoras:'legado'}},{}).especificacao.unidadesConsumidoras,'legado');
 assert.equal(prepararFisico({nome:'Usina 2',especificacao:{tecnicoId:C,unidadesConsumidoras:[P]}},usina,{}).especificacao.tecnicoId,C);
 const usinaDois={...usina,especificacao:{...usina.especificacao,unidadesConsumidoras:[C,P]}};
 assert.deepEqual(prepararFisico({especificacao:{unidadesConsumidoras:[P,C]}},usinaDois,{}).especificacao.unidadesConsumidoras,[C,P]);
 assert.throws(()=>prepararFisico({especificacao:{unidadesConsumidoras:[P,P]}},usinaDois,{unidadesConsumidoras:[P]}),/Unidades consumidoras inválidas/);
 assert.throws(()=>prepararFisico({especificacao:{unidadesConsumidoras:[P,I]}},usinaDois,{unidadesConsumidoras:[P]}),/padrões de energia/);
 assert.throws(()=>prepararFisico({especificacao:{unidadesConsumidoras:[I]}},usina,{}),/padrões de energia/);
 assert.throws(()=>prepararFisico({especificacao:{tecnicoId:'invalido'}},usina,{}),/contato técnico/);
 assert.throws(()=>prepararFisico({especificacao:{tecnicoId:` ${I} `}},usina,{tecnico:true}),/contato técnico/);
 const antigo={...internet,atualizadoEm:'2026-10-11T10:00:00Z'};
 assert.equal(prepararInfra({tipo:'internet',plano:'Novo'},antigo,{}).tecnicoId,C);
 assert.equal(prepararInfra({...internet,plano:'Novo'},antigo,{}).tecnicoId,C);
 assert.throws(()=>prepararInfra({tipo:'internet',tecnicoId:P},antigo,{}),/contato cadastrado/);
 assert.throws(()=>prepararInfra({tipo:'internet',tecnicoId:` ${C} `},antigo,{tecnicoId:true}),/contato cadastrado/);
 const planoAntigo={tipo:'plano-corporativo',operadora:'Telecom',nome:'Plano',contatoId:C};
 assert.equal(prepararInfra({tipo:'plano-corporativo',nome:'Plano 2'},planoAntigo,{}).contatoId,C);
 const a=ambiente();a.linhas.push({colecao:'patrimonio_infra',id:I,registro:antigo});
 assert.equal((await salvar(a,I,{tipo:'internet',plano:'Novo'},antigo.atualizadoEm)).status,200);
 let versao=a.linhas.find(x=>x.id===I).registro.atualizadoEm;
 assert.equal((await salvar(a,I,{...internet,plano:'Outro'},versao)).status,200);
 versao=a.linhas.find(x=>x.id===I).registro.atualizadoEm;
 assert.equal((await salvar(a,I,{tipo:'internet',tecnicoId:P},versao)).status,409);
 a.linhas.push({colecao:'patrimonio_infra',id:P,registro:{...planoAntigo,atualizadoEm:antigo.atualizadoEm}});
 assert.equal((await salvar(a,P,{tipo:'plano-corporativo',nome:'Plano 2'},antigo.atualizadoEm)).status,200);
});
test('handler de linhas confirma plano e setor antes de gravar celular disponível',async()=>{
 const a=ambiente(['patrimonio']);
 a.linhas.push({colecao:'setores',id:'set-1',registro:{nome:'Recepção'}},{colecao:'patrimonio_infra',id:P,registro:{tipo:'plano-corporativo',nome:'Corp'}});
 const enviar=(planoId)=>a.chamar({action:'merge',chave:'patrimonio_controles',patch:{linha1:{tipo:'celulares',numero:'31999990000',status:'disponivel',setorId:'set-1',planoId,versaoAnterior:null}}});
 let r=await enviar(P);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.valor.linha1.planoId,P);assert.equal(r.body.valor.linha1.setorId,'set-1');
 r=await a.chamar({action:'merge',chave:'patrimonio_controles',patch:{linha2:{tipo:'celulares',numero:'31999990001',status:'disponivel',setorId:'set-1',planoId:C,versaoAnterior:null}}});
 assert.equal(r.status,409);assert.equal(a.linhas.filter(x=>x.colecao==='patrimonio_controles').length,1);
});
