// Somente MODE=review. Nenhuma chamada à empresa; dados sintéticos e arquivos
// de ensaio permanecem no IndexedDB deste navegador.
import {validarAcao, projetarAgenda, registrarComentario, anexarMetadados, removerAnexo, prepararImportacao, lerArquivoPlanejamento} from '../../supabase/functions/_shared/planejamento.mjs';
import {idValido} from '../../supabase/functions/_shared/reunioes.mjs';
import {getSessao} from '../lib/sessao.js';

export const PESSOAS_PREVIA = [
  {rhId:'a0000000-0000-4000-8000-000000000001',idPessoa:'900001',nome:'Ana Exemplo',setor:'RH',disponivel:true},
  {rhId:'a0000000-0000-4000-8000-000000000002',idPessoa:'900002',nome:'Bruno Exemplo',setor:'Comercial',disponivel:true},
  {rhId:'a0000000-0000-4000-8000-000000000003',idPessoa:'900003',nome:'Carla Exemplo',setor:'Produção',disponivel:true},
];
export const ATOR_PREVIA = {gestor:true,rhId:'a0000000-0000-4000-8000-000000000001',usuario:'demo',nome:'Gestão · demonstração'};
const DB = 'painel-planejamento-previa-v1';
const erro = (mensagem,status=422) => Object.assign(new Error(mensagem),{status});
const resposta = (dados,status=200) => new Response(JSON.stringify(dados),{status,headers:{'Content-Type':'application/json'}});

export function dadosPlanejamentoPrevia() {
  const titulos = ['Integração da equipe','Encontro de boas-vindas','Oficina criativa','Campanha de relacionamento','Encontro de reconhecimento','Preparação da equipe','Ação de inverno','Oficina de atendimento','Encontro de lideranças','Campanha de cuidado','Relacionamento com clientes','Encontro da produção','Campanha de prevenção','Semana de bem-estar','Ação comercial de novembro','Celebração da equipe'];
  const meses = [1,1,2,3,3,5,6,7,8,9,9,9,10,11,11,12];
  const mensais = new Set([0,9,12,13]);
  const indefinidas = new Set([6,7,11]);
  const itens = titulos.map((titulo,i) => {
    const mes = meses[i], mm = String(mes).padStart(2,'0');
    const periodo = mensais.has(i) ? 'mes' : indefinidas.has(i) ? 'a_definir' : 'data';
    const data = `2027-${mm}-${i===15?'17':'15'}`;
    return validarAcao({id:`10000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,versao:0,ano:2027,mes,titulo,categoria:mensais.has(i)?'saude':i===3||i===10||i===14?'comercial':'colaboradores',descricao:'Exemplo fictício para conferir responsáveis, valores, arquivos e acompanhamento.',observacoes:'Demonstração local. Não representa o planejamento aprovado da empresa.',setores:['RH'],periodo,dataInicio:periodo==='data'?data:'',dataFim:periodo==='data'?data:'',preparacaoInicio:periodo==='data'?`2027-${mm}-05`:'',implantarAte:periodo==='data'?`2027-${mm}-12`:'',preparacaoRegra:indefinidas.has(i)?'30 dias antes do encerramento':'',responsaveis:i<3?PESSOAS_PREVIA.slice(0,i===0?3:2):[],previstoCentavos:i===0?120000:i===1?0:i===2?45000:null,realizadoCentavos:null,situacao:i<3?'preparacao':'aberta',etapas:i===0?[{id:'20000000-0000-4000-8000-000000000001',titulo:'Definir materiais da atividade',prazo:'2027-01-08',responsaveis:[PESSOAS_PREVIA[0]],situacao:'aberta'}]:[],origem:null},null,ATOR_PREVIA,PESSOAS_PREVIA,'2026-11-18T12:00:00.000Z');
  });
  return {itens,lotes:{},arquivos:{}};
}

function atorAtual() {
  const sessao = getSessao();
  if (!sessao) throw erro('Entre novamente.',401);
  if (!sessao.master && !sessao.permissoes?.some(p=>p==='*'||p==='calendario-empresa')) throw erro('Sem acesso ao calendário.',403);
  const perfil = new URLSearchParams(window.location.search).get('perfil');
  const pessoa = perfil === 'planejamento-responsavel' ? PESSOAS_PREVIA[0] : null;
  return {...ATOR_PREVIA,gestor:sessao.master===true,rhId:pessoa?.rhId|| (sessao.master?ATOR_PREVIA.rhId:''),usuario:sessao.usuario,nome:sessao.nome};
}

export function operarPlanejamentoPrevia(estado,b,ator) {
  const itens = estado.itens;
  if (b.action === 'listar') return {ok:true,itens:itens.filter(i=>!b.ano||i.ano===Number(b.ano)),ator};
  if (b.action === 'pessoas') return {ok:true,pessoas:PESSOAS_PREVIA};
  if (b.action === 'agenda') return {ok:true,eventos:projetarAgenda(itens,b.mes)};
  if (b.action === 'importar') {
    if (!ator.gestor) throw erro('Somente a gestão pode importar ações.',403);
    if (!idValido(b.loteId)) throw erro('Identificador da importação inválido.');
    // Comparação síncrona apenas neste armazenamento local: não suspender a
    // transação IndexedDB aguardando um digest. Produção usa SHA-256 no servidor.
    const assinatura=JSON.stringify({itens:b.itens,usuario:ator.usuario});
    const lote=estado.lotes[b.loteId];
    if (lote) {
      if(lote.assinatura!==assinatura) throw erro('Este lote já foi utilizado com outro conteúdo.',409);
      return {ok:true,itens:structuredClone(lote.itens)};
    }
    const resultado = prepararImportacao(b.itens,itens,ator,PESSOAS_PREVIA);
    const novos = (Array.isArray(resultado) ? resultado : resultado.itens).map(op=>op.registro||op);
    for (const item of novos) {
      const pos = itens.findIndex(i=>i.id===item.id);
      if (pos<0) itens.push(item); else itens[pos]=item;
    }
    estado.lotes[b.loteId]={assinatura,itens:structuredClone(novos)};
    return {ok:true,itens:novos};
  }
  const id = b.item?.id||b.id;
  const pos = itens.findIndex(i=>i.id===id);
  const antes = pos>=0 ? itens[pos] : null;
  if (b.action === 'salvar') {
    const item = validarAcao(b.item,antes,ator,PESSOAS_PREVIA);
    if (pos<0) itens.push(item); else itens[pos]=item;
    return {ok:true,item};
  }
  if (!antes) throw erro('Ação não encontrada.',404);
  if (b.action === 'arquivo') {
    const meta = antes.anexos.find(a=>a.id===b.arquivoId);
    if (!meta?.chave?.startsWith(`planejamento/${antes.id}/`)||meta.chave.includes('..')) throw erro('Arquivo indisponível.',404);
    const arquivo = estado.arquivos[b.arquivoId];
    if (!arquivo) throw erro('Este arquivo não está disponível nesta prévia.',404);
    const bytes = Uint8Array.from(atob(arquivo.base64),c=>c.charCodeAt(0));
    return {ok:true,url:URL.createObjectURL(new Blob([bytes],{type:arquivo.mime}))};
  }
  if (b.versao!==antes.versao) throw erro('A ação mudou em outra aba. Atualize antes de continuar. Seu preenchimento permanece aberto.',409);
  let item;
  if (b.action === 'comentar') item = registrarComentario(antes,b.texto,ator);
  else if (b.action === 'removerAnexo') item = removerAnexo(antes,b.arquivoId,ator);
  else if (b.action === 'anexar') {
    const {meta}=lerArquivoPlanejamento(b);
    const arquivoId=crypto.randomUUID();
    item=anexarMetadados(antes,{...meta,id:arquivoId,chave:`planejamento/${antes.id}/${arquivoId}.${meta.ext}`,descricao:b.descricao||'',etapaId:b.etapaId||'',substituiId:b.substituiId||''},ator);
    estado.arquivos[arquivoId]={base64:b.base64,mime:meta.mime};
  } else throw erro('Ação não permitida.',400);
  itens[pos]=item;
  return {ok:true,item};
}

export async function respostaPlanejamento(b) {
  try {
    const ator=atorAtual();
    const resultado=await new Promise((resolve,reject)=> {
      const abrir=indexedDB.open(DB,1);
      abrir.onupgradeneeded=()=>abrir.result.createObjectStore('estado');
      abrir.onerror=()=>reject(erro('Não foi possível abrir o armazenamento da prévia. Seu formulário foi preservado.',503));
      abrir.onsuccess=()=> {
        const db=abrir.result;
        const tx=db.transaction('estado','readwrite');
        const store=tx.objectStore('estado');
        let resultado, falha;
        const ler=store.get('planejamento');
        ler.onsuccess=()=> {
          try {
            const estado=ler.result||dadosPlanejamentoPrevia();
            resultado=operarPlanejamentoPrevia(estado,b,ator);
            store.put(estado,'planejamento');
          } catch(e) {falha=e;tx.abort();}
        };
        tx.oncomplete=()=>{db.close();resolve(resultado);};
        tx.onabort=()=>{db.close();reject(falha||erro('Não foi possível salvar a prévia. Confira o espaço do navegador e tente novamente.',503));};
        tx.onerror=()=>{falha=erro('Não foi possível salvar a prévia. Seu preenchimento foi preservado.',503);};
      };
    });
    return resposta(resultado);
  } catch(e) {return resposta({erro:e.message},e.status||500);}
}
