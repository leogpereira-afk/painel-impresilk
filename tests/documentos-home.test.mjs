import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {transformSync} from 'esbuild';
import {alertasDocumentosLegados,calcDocumentos} from '../src/lib/calc/documentos.js';
test('Home conserva prazo documental legado sem contar físicos sem data como documentos',()=>{
 const bens=[{id:'carro',tipo:'veiculo',nome:'Carro fictício',documentoLegado:true,validade:'2026-10-05'}, {id:'maquina',tipo:'maquina',nome:'Máquina fictícia'}, {id:'fora',tipo:'veiculo',documentoLegado:true,validade:'2026-10-06',disponivel:false}, {id:'errado',documentoLegado:true,validade:'2026-02-30'}];
 const alertas=alertasDocumentosLegados(bens,'2026-10-11');
 assert.equal(alertas.length,1);assert.equal(alertas[0].bemId,'carro');assert.equal(alertas[0].sit.nivel,'vencido');
 assert.equal(calcDocumentos(bens,'2026-10-11').kpis.total,0);
 assert.deepEqual(alertasDocumentosLegados([{id:'a',documentoLegado:true,validade:'2027-01-01'}],'2026-10-11'),[]);
});

// Executa os componentes reais com efeitos controlados, para conferir a tela
// antes da limpeza dos efeitos e resolver consultas antigas fora de ordem.
function tela(caminho) {
 const hooks=[],pendentes=[],pedidos=[];let cursor=0,sessao;
 const iguais=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 const useState=inicial=>{
  const indice=cursor++;if(!hooks[indice])hooks[indice]={valor:typeof inicial==='function'?inicial():inicial};
  return [hooks[indice].valor,valor=>{hooks[indice].valor=typeof valor==='function'?valor(hooks[indice].valor):valor;}];
 };
 const useRef=inicial=>{const indice=cursor++;return hooks[indice]??(hooks[indice]={current:inicial});};
 const useCallback=(fn,deps)=>{const indice=cursor++;if(!iguais(hooks[indice]?.deps,deps))hooks[indice]={deps,fn};return hooks[indice].fn;};
 const useEffect=(fn,deps)=>{
  const indice=cursor++,anterior=hooks[indice];
  if(!iguais(anterior?.deps,deps)){hooks[indice]={deps,limpar:anterior?.limpar};pendentes.push(()=>{hooks[indice].limpar?.();hooks[indice].limpar=fn();});}
 };
 const listarDocumentos=()=>new Promise((resolve,reject)=>pedidos.push({resolve,reject}));
 const podeAbrir=(modulo,atual=sessao)=>!!atual&&(atual.master||atual.permissoes?.includes('*')||atual.permissoes?.includes(modulo));
 const componente=nome=>Object.defineProperty(()=>null,'name',{value:nome});
 const jsx=(type,props,key)=>({type:typeof type==='function'?type.name:type,props,key});
 const fonte=readFileSync(new URL(caminho,import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'');
 const js=transformSync(fonte,{loader:'jsx',format:'cjs',jsx:'automatic',target:'es2022'}).code;
 const contexto={module:{exports:{}},require:()=>({jsx,jsxs:jsx}),useState,useRef,useCallback,useEffect,
  useNavigate:()=>()=>{},getSessao:()=>sessao,podeAbrir,ehDirecao:atual=>(atual??sessao)?.master===true,
  listarDocumentos,api:{listarDocumentos},calcDocumentos,alertasDocumentosLegados,
  ymdLocal:()=> '2026-10-11',statusBackup:async()=>null,lerCargaAlarme:async()=>null,
  meusSistemas:()=>[],sessionStorage:{getItem:()=>null,setItem:()=>{}},logoColor:'logo',logoWhite:'logo'};
 for(const nome of ['AlertTriangle','ChevronDown','ChevronRight','Card','MeusSistemas','MissaoValores','Silk','FileCheck2','Car','ShieldCheck','Wrench','PessoasRHProvider','CarregandoModulo','ErroModulo'])contexto[nome]=componente(nome);
 vm.runInNewContext(js,contexto);
 return {pedidos,render(atual,{efeitos=true}={}){sessao=atual;cursor=0;const arvore=contexto.module.exports.default({sessao});if(efeitos)this.efeitos();return arvore;},efeitos(){for(const fn of pendentes.splice(0))fn();}};
}
const pessoal={usuario:'consulta',master:false,permissoes:['documentos','documentos-pessoais']};
const empresa={...pessoal,permissoes:['documentos']};
const nomePessoal='TITULO-PESSOAL-FICTICIO';
const nomeEmpresa='ALVARA-EMPRESA-FICTICIO';
const lista=nome=>({itens:[{id:nome,tipo:'documento',nome,estado:'ativo',validade:'2026-10-01'}],bens:[],titulares:[],pessoas:[],requisitos:[]});
const textoTela=arvore=>JSON.stringify(arvore);
const aguardar=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
function buscar(arvore,tipo){if(arvore?.type===tipo)return arvore;if(!arvore||typeof arvore!=='object')return;for(const valor of Object.values(arvore)){const encontrado=buscar(valor,tipo);if(encontrado)return encontrado;}}

test('Home oculta título PF na perda parcial de permissão antes de rodar efeitos',async()=>{
 const home=tela('../src/pages/Home.jsx');home.render(pessoal);home.pedidos[0].resolve(lista(nomePessoal));await aguardar();
 assert.match(textoTela(home.render(pessoal)),new RegExp(nomePessoal));
 assert.doesNotMatch(textoTela(home.render(empresa,{efeitos:false})),new RegExp(nomePessoal));
 home.efeitos();assert.equal(home.pedidos.length,2);
 home.pedidos[1].resolve(lista(nomeEmpresa));await aguardar();
 assert.match(textoTela(home.render(empresa)),new RegExp(nomeEmpresa));
});
test('Home descarta resposta PF atrasada após consultar com a nova permissão',async()=>{
 const home=tela('../src/pages/Home.jsx');home.render(pessoal);home.render(empresa);
 assert.equal(home.pedidos.length,2);
 home.pedidos[1].resolve(lista(nomeEmpresa));await aguardar();
 home.pedidos[0].resolve(lista(nomePessoal));await aguardar();
 const texto=textoTela(home.render(empresa));assert.match(texto,new RegExp(nomeEmpresa));assert.doesNotMatch(texto,new RegExp(nomePessoal));
});
test('Home não transforma resposta incompleta em ausência de vencimentos',async()=>{
 const home=tela('../src/pages/Home.jsx');home.render(empresa);home.pedidos[0].resolve({ok:true});await aguardar();
 assert.match(textoTela(home.render(empresa)),/Não consegui conferir os vencimentos/);
});
test('Documentos oculta lista PF na perda parcial de permissão e remonta o conteúdo',async()=>{
 const documentos=tela('../src/pages/Ativos.jsx');documentos.render(pessoal);documentos.pedidos[0].resolve(lista(nomePessoal));await aguardar();
 const antes=documentos.render(pessoal),conteudoAntes=buscar(antes,'DocumentosConteudo');assert.ok(conteudoAntes);assert.match(textoTela(antes),new RegExp(nomePessoal));
 assert.doesNotMatch(textoTela(documentos.render(empresa,{efeitos:false})),new RegExp(nomePessoal));
 documentos.efeitos();assert.equal(documentos.pedidos.length,2);documentos.pedidos[1].resolve(lista(nomeEmpresa));await aguardar();
 const depois=documentos.render(empresa),conteudoDepois=buscar(depois,'DocumentosConteudo');assert.ok(conteudoDepois);assert.notEqual(conteudoAntes.key,conteudoDepois.key);assert.match(textoTela(depois),new RegExp(nomeEmpresa));
 // Um formulário desmontado também não pode recolocar a resposta antiga.
 conteudoAntes.props.setDados(()=>lista(nomePessoal));await conteudoAntes.props.carregar();
 assert.equal(documentos.pedidos.length,2);assert.doesNotMatch(textoTela(documentos.render(empresa)),new RegExp(nomePessoal));
});
test('Documentos descarta resposta PF atrasada depois da nova consulta',async()=>{
 const documentos=tela('../src/pages/Ativos.jsx');documentos.render(pessoal);documentos.render(empresa);assert.equal(documentos.pedidos.length,2);
 documentos.pedidos[1].resolve(lista(nomeEmpresa));await aguardar();documentos.pedidos[0].resolve(lista(nomePessoal));await aguardar();
 const texto=textoTela(documentos.render(empresa));assert.match(texto,new RegExp(nomeEmpresa));assert.doesNotMatch(texto,new RegExp(nomePessoal));
});
test('resposta anterior é recusada também antes da limpeza do efeito',async()=>{
 for(const caminho of ['Home','Ativos']){
  const pagina=tela(`../src/pages/${caminho}.jsx`);pagina.render(pessoal);pagina.render(empresa,{efeitos:false});
  pagina.pedidos[0].resolve(lista(nomePessoal));await aguardar();
  assert.doesNotMatch(textoTela(pagina.render(empresa,{efeitos:false})),new RegExp(nomePessoal));
  pagina.efeitos();pagina.pedidos[1].resolve(lista(nomeEmpresa));await aguardar();
  assert.match(textoTela(pagina.render(empresa)),new RegExp(nomeEmpresa));
 }
});
test('perda de acesso total ou de Documentos invalida títulos e não consulta sem acesso',async()=>{
 for(const caminho of ['Home','Ativos'])for(const inicial of [{...pessoal,master:true,permissoes:[]},{...pessoal,permissoes:['*']}]){
  const pagina=tela(`../src/pages/${caminho}.jsx`);pagina.render(inicial);pagina.pedidos[0].resolve(lista(nomePessoal));await aguardar();
  assert.doesNotMatch(textoTela(pagina.render(empresa,{efeitos:false})),new RegExp(nomePessoal));
  pagina.efeitos();assert.equal(pagina.pedidos.length,2);pagina.pedidos[1].resolve(lista(nomeEmpresa));await aguardar();
  assert.doesNotMatch(textoTela(pagina.render({...empresa,permissoes:[]})),new RegExp(`${nomePessoal}|${nomeEmpresa}`));
  assert.equal(pagina.pedidos.length,2);
 }
});
test('Documentos mostra falha quando a consulta completa vem truncada',async()=>{
 const documentos=tela('../src/pages/Ativos.jsx');documentos.render(empresa);documentos.pedidos[0].resolve({itens:[],bens:[]});await aguardar();
 const arvore=documentos.render(empresa);assert.equal(arvore.type,'ErroModulo');assert.match(arvore.props.mensagem,/lista completa/);
});
test('troca de usuário invalida dados mesmo conservando todas as permissões',async()=>{
 for(const caminho of ['Home','Ativos']){
  const pagina=tela(`../src/pages/${caminho}.jsx`);pagina.render(pessoal);pagina.pedidos[0].resolve(lista(nomePessoal));await aguardar();
  assert.doesNotMatch(textoTela(pagina.render({...pessoal,usuario:'outra-consulta'},{efeitos:false})),new RegExp(nomePessoal));
 }
});
