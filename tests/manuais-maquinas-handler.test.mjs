import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {transformSync} from 'esbuild';
import {atenderManuaisMaquinas} from '../supabase/functions/_shared/manuais-maquinas-handler.mjs';
const fonte=readFileSync(new URL('../supabase/functions/painel-config/index.ts',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'');
const codigo=transformSync(fonte,{loader:'ts',format:'esm',target:'es2022'}).code;
const ref={tipo:'ativo',id:'maquina-legada'},bem={tipo:'bem',id:'pat-legado'};
const conteudo=()=>({identificacaoConfirmada:true,fabricante:'Exemplo',modelo:'M1',responsavelId:'rh-1',revisarEm:'2027-01-01',seguranca:'Segurança validada fictícia.',operacao:'Procedimento fictício.',fontes:[{id:'20bc7ba9-9bd4-44d7-8954-706d66f2447a',titulo:'Manual fictício',url:'https://example.com/manual.pdf',tipo:'fabricante',modelo:'M1',situacao:'verificado',conferidoEm:'2026-10-24'}]});
function ambiente(perms=['patrimonio','manutencoes','configuracoes']){
 let handler,antesRpc=null,sessao=perms===null?null:{sub:'gestor-teste',perms};
 const linhas=[{colecao:'ativo',id:ref.id,registro:{tipo:'maquina',nome:'Máquina fictícia',bemId:bem.id}},{colecao:'patrimonio',id:bem.id,registro:{areaPatrimonio:'maquinas',origemAtivoId:ref.id,valor:999999,nf:'não deve sair'}}],escritas=[],pessoas=[{id:'rh-1',nome:'Pessoa fictícia',idPessoa:'123456',disponivel:true}];
 const sb={from(t){assert.equal(t,'painel_registros');const filtros=[];let de=0,ate=Infinity;const q={select(){return q},eq(k,v){filtros.push([k,v]);return q},order(){return q},range(a,b){de=a;ate=b;return q},then(ok){return Promise.resolve({data:structuredClone(linhas.filter(r=>filtros.every(([k,v])=>r[k]===v)).slice(de,ate+1)),error:null}).then(ok)}};return q;},async rpc(nome,p){assert.equal(nome,'painel_registro_gravar');if(antesRpc)await antesRpc();const idx=linhas.findIndex(r=>r.colecao===p.p_colecao&&r.id===p.p_id),atual=linhas[idx]?.registro??null;if(JSON.stringify(atual)!==JSON.stringify(p.p_anterior))return {error:{code:'40001'}};const row={colecao:p.p_colecao,id:p.p_id,registro:structuredClone(p.p_registro)};if(idx<0)linhas.push(row);else linhas[idx]=row;escritas.push(p);return {data:structuredClone(p.p_registro),error:null};}};
 vm.runInNewContext(codigo,{atenderManuaisMaquinas,lerPessoasPatrimonio:async()=>pessoas,Deno:{env:{get:()=> 'teste'},serve:f=>handler=f},createClient:()=>sb,verificarJwt:async()=>sessao,crachaRevogado:async()=>false,Request,Response,console:{error(){}}});
 return {linhas,pessoas,escritas,antesRpc:f=>antesRpc=f,sessao:p=>sessao=p===null?null:{sub:'gestor-teste',perms:p},async chamar(body){const r=await handler(new Request('http://local',{method:'POST',headers:{authorization:'Bearer teste'},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()};}};
}
const salvar=(a,c=conteudo(),versaoAnterior=null,referencia=ref)=>a.chamar({action:'manuaisMaquinasSalvar',referencia,conteudo:c,versaoAnterior});
const ler=(a,referencia=ref)=>a.chamar({action:'manuaisMaquinasLer',referencia});
const aprovar=(a,m)=>a.chamar({action:'manuaisMaquinasAprovar',referencia:ref,versaoAnterior:m.atualizadoEm});
test('foto de consumível segue aprovação, permissões e histórico integral com CAS',async()=>{
 const a=ambiente(),foto={url:'https://example.com/peca-v1.png',fonteUrl:'https://example.com/catalogo',legenda:'Peça fictícia',usoConfirmado:true};
 const c={...conteudo(),foto:{...foto,url:'https://example.com/maquina.png',principal:'referencia'},consumiveis:[{id:'6a595e14-2b16-41bd-b6a5-2a375d21463c',nome:'Consumível de teste',foto}]};
 let r=await salvar(a,c);assert.equal(r.status,200,JSON.stringify(r.body));let m=r.body.manual;
 a.sessao(['patrimonio']);assert.equal((await ler(a)).body.manual,null);assert.deepEqual((await a.chamar({action:'manuaisMaquinasListar'})).body.itens,[]);assert.equal((await salvar(a,c,m.atualizadoEm)).status,403);
 a.sessao(['patrimonio','manutencoes','configuracoes']);m=(await aprovar(a,m)).body.manual;const aprovado=structuredClone(m);
 const revisado={...c,foto:{...c.foto,principal:'inventario'},consumiveis:[{...c.consumiveis[0],foto:{...foto,url:'https://example.com/peca-v2.png'}}]};m=(await salvar(a,revisado,m.atualizadoEm)).body.manual;
 assert.equal(m.conteudo.foto.principal,'inventario');assert.equal(m.historico.find(v=>v.estado==='aprovado').conteudo.foto.principal,'referencia');
 assert.deepEqual(m.historico.find(v=>v.estado==='aprovado').conteudo.consumiveis[0].foto,foto);assert.equal((await salvar(a,c,aprovado.atualizadoEm)).status,409);
 a.sessao(['patrimonio']);const leitor=(await ler(a,bem)).body.manual;assert.deepEqual(leitor.conteudo.consumiveis[0].foto,foto);assert.equal(leitor.conteudo.foto.principal,'referencia');assert.equal(leitor.historico,undefined);assert.deepEqual((await a.chamar({action:'manuaisMaquinasListar'})).body.itens[0].conteudo.consumiveis[0].foto,foto);
 a.sessao(['patrimonio','manutencoes','configuracoes']);const antes=a.escritas.length;
 const invalido={...c,consumiveis:[{...c.consumiveis[0],foto:{...foto,fonteUrl:''}}]};assert.equal((await salvar(a,invalido,m.atualizadoEm)).status,422);assert.equal(a.escritas.length,antes);assert.deepEqual((await ler(a)).body.manual.conteudo.consumiveis[0].foto,revisado.consumiveis[0].foto);
});
test('porteiro real exige sessão e permissões em leitura, edição, aprovação e verbos genéricos',async()=>{
 for(const action of ['manuaisMaquinasCatalogo','manuaisMaquinasListar','manuaisMaquinasLer','manuaisMaquinasSalvar','manuaisMaquinasAprovar']){
  assert.equal((await ambiente(null).chamar({action,referencia:ref})).status,401);
  assert.equal((await ambiente(['manutencoes']).chamar({action,referencia:ref})).status,403);
 }
 const a=ambiente(['patrimonio']);assert.equal((await salvar(a)).status,403);assert.equal((await ler(a)).status,200);assert.equal(a.escritas.length,0);
 assert.equal((await aprovar(ambiente(['patrimonio','manutencoes']),{atualizadoEm:'teste'})).status,403);
 for(const body of [{action:'get',chave:'manuais_maquinas'},{action:'merge',chave:'manuais_maquinas',patch:{x:{}}},{action:'removerId',chave:'manuais_maquinas',id:'x'}])assert.equal((await ambiente().chamar(body)).status,body.action==='get'?400:403);
});
test('catálogo operacional inclui bem sem ficha para Patrimônio e omite campos privados',async()=>{
 const a=ambiente();a.linhas.push({colecao:'patrimonio',id:'sem-ficha',registro:{areaPatrimonio:'maquinas',nomeGenerico:'Máquina sem ficha',descricaoTecnica:'Descrição operacional',codigo:'TESTE',setorSigla:'TEC',valor:999,nf:'NF-PRIVADA',historico:[{valor:888}],foto:'PRIVADA',responsavel:'Pessoa privada'}},{colecao:'setores',id:'setor',registro:{sigla:'TEC',nome:'Setor fictício'}});
 const novoRef={tipo:'bem',id:'sem-ficha'};let m=(await salvar(a,conteudo(),null,novoRef)).body.manual;
 m=(await a.chamar({action:'manuaisMaquinasAprovar',referencia:novoRef,versaoAnterior:m.atualizadoEm})).body.manual;
 a.sessao(['patrimonio']);const r=await a.chamar({action:'manuaisMaquinasCatalogo'});assert.equal(r.status,200);assert.equal(r.body.itens.length,2);
 const item=r.body.itens.find(x=>x.id==='bem:sem-ficha');assert.deepEqual(item,{id:'bem:sem-ficha',tipo:'maquina',nome:'Descrição operacional',codigo:'TESTE',modelo:'',identificacao:'',setor:'Setor fictício',categoria:'',somenteBem:true,bem:{id:'sem-ficha'}});
 for(const segredo of ['NF-PRIVADA','PRIVADA','Pessoa privada','999999','888'])assert.equal(JSON.stringify(r.body).includes(segredo),false);
 assert.equal((await ler(a,novoRef)).body.manual.id,m.id);assert.equal((await a.chamar({action:'manuaisMaquinasListar'})).body.itens[0].id,m.id);assert.equal(a.escritas.length,2);
});
test('catálogo não duplica bens ligados, exclui baixados/órfãos e isola conflito de vínculo',async()=>{
 const a=ambiente(['patrimonio']);a.linhas.push(
  {colecao:'patrimonio',id:'baixado',registro:{areaPatrimonio:'maquinas',situacao:'baixado',nomeGenerico:'Retirado'}},
  {colecao:'patrimonio',id:'orfao',registro:{areaPatrimonio:'maquinas',origemAtivoId:'ausente',nomeGenerico:'Órfão'}},
  {colecao:'patrimonio',id:'outros',registro:{areaPatrimonio:'outros',nomeGenerico:'Ferramenta'}},
  {colecao:'ativo',id:'cam',registro:{tipo:'seguranca',nome:'Segurança restrita'}},
  {colecao:'ativo',id:'maquina-livre',registro:{tipo:'maquina',nome:'Livre',especificacao:{fabricante:'Teste',modelo:'M1',numeroSerie:'XYZ',setor:'Área',senha:'não expor'}}});
 let r=await a.chamar({action:'manuaisMaquinasCatalogo'});assert.deepEqual(r.body.itens.map(x=>x.id).sort(),[ref.id,'maquina-livre'].sort());assert.equal(JSON.stringify(r.body).includes('não expor'),false);assert.equal(JSON.stringify(r.body).includes('Segurança restrita'),false);
 a.linhas.push({colecao:'ativo',id:'conflito',registro:{tipo:'maquina',nome:'Conflito',bemId:bem.id}});r=await a.chamar({action:'manuaisMaquinasCatalogo'});assert.equal(r.status,200);assert.equal(r.body.itens.length,3);
 const ambigua=r.body.itens.find(x=>x.id===ref.id);assert.equal(ambigua.conflitoVinculo,true);assert.equal(ambigua.bem,undefined);assert.equal(ambigua.codigo,'');assert.equal(r.body.itens.find(x=>x.id==='maquina-livre').conflitoVinculo,undefined);assert.equal(a.escritas.length,0);
});
test('criar, ler pelos dois lados e editar usa uma só linha com histórico integral e CAS',async()=>{
 const a=ambiente();let r=await salvar(a);assert.equal(r.status,200,JSON.stringify(r.body));let m=r.body.manual;assert.equal(m.estado,'rascunho');assert.equal(m.revisao,1);assert.equal((await ler(a,bem)).body.manual.id,m.id);
 r=await salvar(a,{...conteudo(),finalidade:'Revisão seguinte'},m.atualizadoEm,bem);assert.equal(r.status,200,JSON.stringify(r.body));const novo=r.body.manual;assert.deepEqual(novo.historico[0],Object.fromEntries(Object.entries(m).filter(([k])=>k!=='historico')));assert.equal(novo.revisao,2);
 assert.equal(a.linhas.filter(x=>x.colecao==='manuais_maquinas').length,1);assert.equal(JSON.stringify(novo).includes('999999'),false);assert.equal((await salvar(a,conteudo(),m.atualizadoEm)).status,409);
 assert.equal((await a.chamar({action:'manuaisMaquinasSalvar',referencia:ref,conteudo:conteudo()})).status,422);
});
test('última aprovação permanece visível durante revisão e história completa é restrita',async()=>{
 const a=ambiente();let m=(await salvar(a)).body.manual;a.sessao(['patrimonio']);assert.equal((await ler(a)).body.manual,null);assert.deepEqual((await a.chamar({action:'manuaisMaquinasListar'})).body.itens,[]);
 a.sessao(['patrimonio','configuracoes']);m=(await aprovar(a,m)).body.manual;const aprovado=structuredClone(m);m=(await salvar(a,{...conteudo(),operacao:'Operação rascunho'},m.atualizadoEm)).body.manual;
 assert.equal(m.historico.length,2);a.sessao(['patrimonio']);const v=(await ler(a,bem)).body.manual;assert.equal(v.estado,'aprovado');assert.equal(v.revisao,aprovado.revisao);assert.equal(v.conteudo.operacao,aprovado.conteudo.operacao);assert.equal(v.historico,undefined);assert.equal(v.atualizadoPor,undefined);
 a.sessao(['patrimonio','configuracoes']);m=(await aprovar(a,m)).body.manual;a.sessao(['patrimonio']);assert.equal((await ler(a)).body.manual.conteudo.operacao,'Operação rascunho');assert.equal(m.historico.length,3);
});
test('responsável RH e requisitos aprovação não são forjáveis; edição pode retirar responsável',async()=>{
 const a=ambiente();assert.equal((await salvar(a,{...conteudo(),responsavelId:'Pessoa fictícia'})).status,422);let m=(await salvar(a)).body.manual;assert.equal(m.responsavel,'Pessoa fictícia');assert.equal(m.responsavelIdPessoa,'123456');
 a.pessoas[0].disponivel=false;assert.equal((await aprovar(a,m)).status,422);m=(await salvar(a,{...conteudo(),responsavelId:''},m.atualizadoEm)).body.manual;assert.equal(m.conteudo.responsavelId,'');assert.equal(m.responsavel,'');assert.equal((await aprovar(a,m)).status,422);
 assert.equal((await salvar(a,{...conteudo(),historico:[]},m.atualizadoEm)).status,422);assert.equal((await a.chamar({action:'manuaisMaquinasAprovar',referencia:ref,versaoAnterior:m.atualizadoEm,conteudo:conteudo()})).status,422);
});
test('referência inexistente, tipo indevido e vínculo divergente falham antes da escrita',async()=>{
 const a=ambiente();assert.equal((await ler(a,{tipo:'ativo',id:'ausente'})).status,404);assert.equal((await ler(a,{tipo:'arquivo',id:ref.id})).status,422);
 a.linhas[0].registro.tipo='veiculo';assert.equal((await salvar(a)).status,422);a.linhas[0].registro.tipo='maquina';a.linhas[0].registro.bemId='ausente';assert.equal((await salvar(a)).status,409);a.linhas[0].registro.bemId=bem.id;a.linhas.push({colecao:'ativo',id:'outra',registro:{tipo:'maquina',bemId:bem.id}});assert.equal((await salvar(a)).status,409);assert.equal(a.escritas.length,0);
});
test('manual de bem ganha alias de ficha sem duplicação e aliases retirados não vazam',async()=>{
 const a=ambiente();a.linhas.splice(0,1);delete a.linhas[0].registro.origemAtivoId;const m=(await salvar(a,conteudo(),null,bem)).body.manual;assert.equal(m.referencia.tipo,'bem');
 a.linhas.push({colecao:'ativo',id:ref.id,registro:{tipo:'maquina',bemId:bem.id}});assert.equal((await ler(a,ref)).body.manual.id,m.id);assert.equal((await salvar(a,conteudo(),m.atualizadoEm,ref)).body.manual.id,m.id);
 delete a.linhas.find(r=>r.colecao==='ativo').registro.bemId;assert.equal((await ler(a,ref)).body.manual,null);assert.equal((await ler(a,bem)).body.manual.id,m.id);
});
test('máquina vinculada identifica bem legado sem área explícita em ambos os sentidos',async()=>{
 for(const lado of ['bem','ficha','ambos']){
  const a=ambiente();delete a.linhas[1].registro.areaPatrimonio;
  if(lado==='bem')delete a.linhas[0].registro.bemId;
  if(lado==='ficha')delete a.linhas[1].registro.origemAtivoId;
  const salvo=await salvar(a,conteudo(),null,bem);assert.equal(salvo.status,200,`${lado}: ${JSON.stringify(salvo.body)}`);
  assert.equal((await ler(a,ref)).body.manual.id,salvo.body.manual.id);
  assert.equal((await a.chamar({action:'manuaisMaquinasListar'})).body.itens.length,1);
 }
 const semFicha=ambiente();semFicha.linhas.splice(0,1);delete semFicha.linhas[0].registro.areaPatrimonio;delete semFicha.linhas[0].registro.origemAtivoId;
 assert.equal((await salvar(semFicha,conteudo(),null,bem)).status,422);
});
test('aprovação histórica usa aliases atuais após vínculo novo e remove alias desfeito',async()=>{
 const a=ambiente();a.linhas.splice(0,1);delete a.linhas[0].registro.origemAtivoId;
 let m=(await salvar(a,conteudo(),null,bem)).body.manual;
 m=(await a.chamar({action:'manuaisMaquinasAprovar',referencia:bem,versaoAnterior:m.atualizadoEm})).body.manual;const publicado=structuredClone(m);
 a.linhas.push({colecao:'ativo',id:ref.id,registro:{tipo:'maquina',bemId:bem.id,nome:'Máquina ligada'}});
 m=(await salvar(a,{...conteudo(),operacao:'Rascunho reservado'},m.atualizadoEm,ref)).body.manual;
 a.sessao(['patrimonio']);let lista=(await a.chamar({action:'manuaisMaquinasListar'})).body.itens;
 assert.equal(lista[0].revisao,publicado.revisao);assert.equal(lista[0].conteudo.operacao,publicado.conteudo.operacao);assert.deepEqual(lista[0].referencias,[ref,bem]);
 assert.equal((await a.chamar({action:'manuaisMaquinasCatalogo'})).body.itens[0].id,ref.id);
 delete a.linhas.find(r=>r.colecao==='ativo').registro.bemId;
 lista=(await a.chamar({action:'manuaisMaquinasListar'})).body.itens;assert.deepEqual(lista[0].referencias,[bem]);assert.equal((await ler(a,ref)).body.manual,null);
});
test('colisão de dois manuais após vínculo falha fechado',async()=>{
 const a=ambiente();delete a.linhas[0].registro.bemId;delete a.linhas[1].registro.origemAtivoId;assert.equal((await salvar(a)).status,200);assert.equal((await salvar(a,conteudo(),null,bem)).status,200);a.linhas[0].registro.bemId=bem.id;assert.equal((await ler(a)).status,409);assert.equal((await a.chamar({action:'manuaisMaquinasListar'})).status,409);assert.equal(a.escritas.length,2);
});
test('mudança concorrente após leitura é recusada pelo CAS sem sobrescrever histórico',async()=>{
 const a=ambiente();const m=(await salvar(a)).body.manual;a.antesRpc(()=>{const atual=a.linhas.find(r=>r.colecao==='manuais_maquinas');atual.registro={...atual.registro,atualizadoEm:'concorrente',historico:[{conteudo:{operacao:'história concorrente'}}]};});assert.equal((await salvar(a,conteudo(),m.atualizadoEm)).status,409);assert.equal(a.linhas.find(r=>r.colecao==='manuais_maquinas').registro.historico[0].conteudo.operacao,'história concorrente');assert.equal(a.escritas.length,1);
});
test('histórico com mais de 200 versões nunca é cortado',async()=>{
 const a=ambiente();const m=(await salvar(a)).body.manual;const linha=a.linhas.find(r=>r.colecao==='manuais_maquinas');linha.registro.historico=Array.from({length:205},(_,i)=>({revisao:i,conteudo:{operacao:`versão ${i}`},estado:'rascunho'}));const r=await salvar(a,conteudo(),m.atualizadoEm);assert.equal(r.status,200);assert.equal(r.body.manual.historico.length,206);assert.equal(r.body.manual.historico[0].conteudo.operacao,'versão 0');
});
