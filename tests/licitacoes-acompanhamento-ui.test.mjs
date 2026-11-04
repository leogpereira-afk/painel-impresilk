import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {erroPreparacao} from '../src/lib/licitacoes-workspace.mjs';
const fonte=readFileSync(new URL('../src/pages/Licitacoes.jsx',import.meta.url),'utf8');
const salvarInicio=fonte.indexOf('    async (e) => {',fonte.indexOf('  const salvar = useCallback('));
const salvarFim=fonte.indexOf('\n    },\n    [form, conflito]',salvarInicio);
const fecharInicio=fonte.indexOf('  const fecharForm = () => {'),fecharFim=fonte.indexOf('\n  };',fecharInicio);
const relerInicio=fonte.indexOf('  const relerConflito=async()=>{'),relerFim=fonte.indexOf('\n  };',relerInicio);
const baixarInicio=fonte.indexOf('  const baixarEdital = async'),baixarFim=fonte.indexOf('\n  };',baixarInicio);
function ambiente(salvarAtivo){
 const file={name:'edital-ficticio.pdf',size:3,type:'application/pdf'},form={id:'ficticio',versao:'versao-aberta',nome:'Rascunho fictício',identificacao:'',categoria:'',edital:'',validade:'',hora:'',url:'',valor:'',status:'avaliar',observacao:'',responsavel:'Equipe',acompanhamento:{decisao:'Decisão ainda não salva'}};
 const estado={form,aberto:true,itens:[],aviso:null,conflito:null};
 const escopo={form,conflito:null,relendo:false,erroPreparacao,MAX_BYTES:3*1024*1024,VAZIA:{id:'',nome:''},inputArquivo:{current:{files:[file],value:'arquivo-escolhido'}},cadastroId:{current:'cadastro-ficticio'},instanciaEdicao:{current:1},envioEmCurso:{current:false},crypto,paraNumero:v=>Number(v)||0,arquivoParaBase64:async()=>'AQID',salvarAtivo,listarAtivos:async()=>[{...form,tipo:'licitacao',nome:'Mudança do outro operador',atualizadoEm:'versao-nova'}]};
 for(const [nome,chave] of [['setForm','form'],['setFormAberto','aberto'],['setItens','itens'],['setAviso','aviso'],['setSalvando','salvando'],['setConflito','conflito'],['setRelendo','relendo']])escopo[nome]=v=>estado[chave]=typeof v==='function'?v(estado[chave]):v;
 const salvar=vm.runInNewContext('('+fonte.slice(salvarInicio,salvarFim)+'\n    })',escopo);
 const fechar=vm.runInNewContext('('+fonte.slice(fecharInicio,fecharFim).replace('  const fecharForm = ','')+'\n  })',escopo);
 const reler=vm.runInNewContext('('+fonte.slice(relerInicio,relerFim).replace('  const relerConflito=','')+'\n  })',escopo);
 return {estado,escopo,file,salvar,fechar,reler};
}
test('cancelar e reenvio durante gravação são bloqueados; versão aberta e arquivo viajam na mesma operação',async()=>{
 let resolver,chamadas=0,pedido;const pendente=new Promise(r=>resolver=r),a=ambiente((...args)=>{chamadas++;pedido=args;return pendente;});
 const envio=a.salvar({preventDefault(){}});await Promise.resolve();a.fechar();await a.salvar({preventDefault(){}});
 assert.equal(a.estado.aberto,true);assert.equal(a.estado.form.nome,'Rascunho fictício');assert.equal(chamadas,1);assert.equal(pedido[1],'versao-aberta');assert.equal(pedido[2].base64,'AQID');assert.equal('temArquivo' in pedido[0],false);
 resolver({id:'ficticio',nome:'Salva'});await envio;assert.equal(a.estado.aberto,false);assert.equal(a.estado.salvando,false);assert.equal(a.escopo.inputArquivo.current.value,'');
});
test('resposta de instância anterior não apaga novo rascunho',async()=>{
 let resolver,avisar;const chamado=new Promise(r=>avisar=r),a=ambiente(()=>{avisar();return new Promise(r=>resolver=r);}),envio=a.salvar({preventDefault(){}});await chamado;
 a.escopo.instanciaEdicao.current+=1;a.estado.form={nome:'Rascunho seguinte'};resolver({id:'ficticio',nome:'Resposta velha'});await envio;
 assert.equal(a.estado.aberto,true);assert.equal(a.estado.form.nome,'Rascunho seguinte');assert.equal(a.escopo.inputArquivo.current.value,'arquivo-escolhido');
});
test('conflito e releitura preservam arquivo, rascunho e versão aberta até revisão explícita',async()=>{
 const a=ambiente(async()=>{throw Object.assign(new Error('Conflito'),{status:409});});await a.salvar({preventDefault(){}});
 assert.equal(a.estado.form.versao,'versao-aberta');assert.equal(a.estado.form.acompanhamento.decisao,'Decisão ainda não salva');assert.equal(a.escopo.inputArquivo.current.files[0],a.file);assert.ok(a.estado.conflito);
 await a.reler();assert.equal(a.estado.conflito.atual.atualizadoEm,'versao-nova');assert.equal(a.estado.form.versao,'versao-aberta');assert.equal(a.estado.form.nome,'Rascunho fictício');assert.equal(a.escopo.inputArquivo.current.files[0],a.file);
});
test('prévia aplica o mesmo CAS e permite baixar a versão anterior do edital',async()=>{
 const {salvarLicitacaoDemo}=await import('../src/review/licitacoes-agenda.mjs'),sessao={perms:['licitacoes']};
 const enviar=async corpo=>{const r=await salvarLicitacaoDemo(corpo,sessao);return {status:r.status,body:await r.json()};};
 const criado=await enviar({action:'salvar',item:{cadastroId:'regressao-anexo-ficticio',tipo:'licitacao',nome:'Ensaio fictício'},arquivo:{base64:'AQID',nome:'primeiro.pdf',mime:'application/pdf'}});
 assert.equal(criado.status,200);
 const atualizado=await enviar({action:'salvar',versao:criado.body.item.atualizadoEm,item:{id:criado.body.item.id,tipo:'licitacao',nome:'Ensaio revisado'},arquivo:{base64:'BAUG',nome:'segundo.pdf',mime:'application/pdf'}});
 assert.equal(atualizado.status,200);
 assert.equal((await enviar({action:'salvar',versao:criado.body.item.atualizadoEm,item:{id:criado.body.item.id,tipo:'licitacao',nome:'Formulário antigo'}})).status,409);
 const primeiro=await enviar({action:'lerArquivo',id:criado.body.item.id,arquivoId:criado.body.item.arquivoEdital.id});assert.equal(primeiro.body.base64,'AQID');
 const segundo=await enviar({action:'lerArquivo',id:criado.body.item.id});assert.equal(segundo.body.base64,'BAUG');
});
test('download de edital após logout, troca de sessão ou desmontagem não abre arquivo nem mostra erro antigo',async()=>{
 for(const modo of ['logout','troca','desmontagem','erro-antigo']){
  let resolver,rejeitar,token='sessao-original';const abertos=[],avisos=[];
  const escopo={cicloTela:{current:1},downloadsEdital:{current:new Set()},getToken:()=>token,AbortController,lerArquivo:()=>new Promise((resolve,reject)=>{resolver=resolve;rejeitar=reject;}),abrirBase64:(...args)=>abertos.push(args),setAviso:a=>avisos.push(a)};
  const baixar=vm.runInNewContext('('+fonte.slice(baixarInicio,baixarFim).replace('  const baixarEdital = ','')+'\n  })',escopo),operacao=baixar({id:'edital-ficticio'});
  if(modo==='logout')token=null;else if(modo==='troca')token='sessao-seguinte';else escopo.cicloTela.current+=1;
  if(modo==='erro-antigo')rejeitar(new Error('Falha da sessão anterior'));else resolver({base64:'AQID',mime:'application/pdf',nome:'teste.pdf'});
  await operacao;assert.equal(abertos.length,0,modo);assert.deepEqual(avisos,[null],modo);assert.equal(escopo.downloadsEdital.current.size,0);
 }
});
test('ciclo da tela invalida downloads sincronamente na troca de sessão e aborta ao desmontar',()=>{
 const inicio=fonte.indexOf('  useEffect(()=>{\n    const downloads=downloadsEdital.current;'),fim=fonte.indexOf('\n  },[]);',inicio);
 let aoTrocar,desinscrito=0;const controle=new AbortController(),escopo={downloadsEdital:{current:new Set([controle])},instanciaEdicao:{current:1},cicloTela:{current:1},aoMudarSessao:fn=>{aoTrocar=fn;return()=>desinscrito++;}};
 const montar=vm.runInNewContext('('+fonte.slice(inicio,fim).replace('  useEffect(','')+'\n  })',escopo),desmontar=montar();
 aoTrocar();assert.equal(controle.signal.aborted,true);assert.equal(escopo.cicloTela.current,2);assert.equal(escopo.instanciaEdicao.current,2);
 const seguinte=new AbortController();escopo.downloadsEdital.current.add(seguinte);desmontar();assert.equal(seguinte.signal.aborted,true);assert.equal(desinscrito,1);assert.equal(escopo.downloadsEdital.current.size,0);
});
