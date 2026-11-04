import {useEffect,useRef,useState} from 'react';
import JanelaFormulario from './JanelaFormulario.jsx';
import {FormCadastro,novaFichaCadastro} from './CadastrosLicitacoes.jsx';
import {podeAbrir} from '../lib/sessao.js';
import {listarCadastrosLicitacoes,salvarCadastroLicitacoes} from '../services/licitacoes-cadastros.js';
import {listarEntidadesLicitacoes,salvarEntidadeLicitacoes} from '../services/licitacoes-entidades.js';
import {referenciaCadastroEmpresa,empresaParaCadastro,salvarCadastroEmpresa,vincularCadastroEmpresa} from '../lib/licitacoes-empresa-cadastro.mjs';
import {situacaoCadastro} from '../lib/licitacoes-cadastros.mjs';

export default function CadastroEmpresaLicitacoes({sessao,empresa,cadastroId='',aoFechar,aoSalvo}){
 const permitido=podeAbrir('licitacoes',sessao),empresaId=empresa.id;
 const [dados,setDados]=useState(null),[form,setForm]=useState(null),[erro,setErro]=useState(''),[ocupado,setOcupado]=useState(false),[carregando,setCarregando]=useState(true),[recarregar,setRecarregar]=useState(0);
 const [conflito,setConflito]=useState(null),[precisaConciliar,setPrecisaConciliar]=useState(false),[etapa,setEtapa]=useState('formulario'),[cadastroSalvo,setCadastroSalvo]=useState(null);
 const geracao=useRef(0),abort=useRef(null),gravacao=useRef(false),empresaInicial=useRef(empresa);
 useEffect(()=>{
  const controle=geracao,g=++controle.current,controller=new AbortController();abort.current=controller;
  setDados(null);setForm(null);setErro('');setOcupado(false);setConflito(null);setPrecisaConciliar(false);setEtapa('formulario');setCadastroSalvo(null);setCarregando(true);gravacao.current=false;
  const carregar=async()=>{if(!permitido){setCarregando(false);return;}try{
   const [d,e]=await Promise.all([listarCadastrosLicitacoes(controller.signal),listarEntidadesLicitacoes(controller.signal)]);
   const atual=empresaParaCadastro(e.itens,empresaId);let inicial;
   if(cadastroId){inicial=d.itens.find(i=>i.id===cadastroId);if(!inicial||!atual.cadastroIds?.includes(cadastroId))throw new Error('Este cadastro não está mais vinculado à empresa. Atualize a ficha para conferir.');}
   else inicial=novaFichaCadastro('',referenciaCadastroEmpresa({...empresaInicial.current,...atual},d.titulares));
   if(g===geracao.current){setDados(d);setForm(inicial);}
  }catch(e){if(g===geracao.current&&e.name!=='AbortError')setErro(e.message||'Não foi possível carregar os cadastros.');}
  finally{if(g===geracao.current)setCarregando(false);}};void carregar();
  return()=>{controle.current++;controller.abort();};
 },[sessao,permitido,empresaId,cadastroId,recarregar]);
 const fechar=()=>{if(!ocupado)aoFechar?.({atualizar:gravacao.current,cadastroSalvo});};
 const confirmar=async(cadastro,g)=>{if(g!==geracao.current)return;setEtapa('concluido');setErro('');try{await aoSalvo?.(cadastro);}catch{if(g===geracao.current)setErro('Cadastro e vínculo salvos. Não foi possível atualizar a lista; feche e atualize a página.');}};
 const servicosVinculo={listarEntidades:listarEntidadesLicitacoes,salvarEntidade:salvarEntidadeLicitacoes};
 const carregarConflito=async(id,g=geracao.current)=>{try{const atual=await listarCadastrosLicitacoes(abort.current?.signal);if(g===geracao.current){setDados(atual);const item=atual.itens.find(i=>i.id===id);if(!item)throw new Error('A ficha atual não está disponível.');setConflito(item);}}catch(e){if(g===geracao.current)setErro(`Não foi possível carregar a versão atual. ${e.message||''} Seu preenchimento continua aberto.`);}};
 const salvar=async(item,versao)=>{
  if(ocupado||etapa!=='formulario')return;if(precisaConciliar){setErro('Confira a versão atual antes de salvar. Seu preenchimento está preservado.');return;}
  const g=geracao.current;setOcupado(true);setErro('');setForm(f=>({...f,...item}));
  try{
   const resultado=await salvarCadastroEmpresa({item,versao,empresaId,cadastrosConhecidos:dados?.itens||[],salvarCadastro:salvarCadastroLicitacoes,listarCadastros:listarCadastrosLicitacoes,podeContinuar:()=>g===geracao.current,...servicosVinculo});
   if(g!==geracao.current)return;setCadastroSalvo(resultado.cadastro);gravacao.current=true;setEtapa(resultado.etapa);
   if(resultado.etapa==='concluido')await confirmar(resultado.cadastro,g);
   else if(resultado.etapa==='vinculo-pendente')setErro(resultado.erro);
  }catch(e){if(g===geracao.current){setErro(e.message||'Não foi possível salvar. Seu preenchimento continua aberto.');if(e.status===409&&item.id){setPrecisaConciliar(true);await carregarConflito(item.id,g);}}}
  finally{if(g===geracao.current)setOcupado(false);}
 };
 const vincular=async()=>{
  if(ocupado||!cadastroSalvo)return;const g=geracao.current;setOcupado(true);setErro('');
  try{await vincularCadastroEmpresa({empresaId,cadastroId:cadastroSalvo.id,podeContinuar:()=>g===geracao.current,...servicosVinculo});if(g===geracao.current){gravacao.current=true;await confirmar(cadastroSalvo,g);}}
  catch(e){if(g===geracao.current){setEtapa('vinculo-pendente');setErro(e.message||'Não foi possível vincular. O cadastro continua salvo.');}}
  finally{if(g===geracao.current)setOcupado(false);}
 };
 const tentarConciliar=async()=>{if(ocupado||!form?.id)return;const g=geracao.current;setOcupado(true);await carregarConflito(form.id,g);if(g===geracao.current)setOcupado(false);};
 const titulo=cadastroId?'Cadastro de fornecedor':'Cadastrar como fornecedor';
 return <JanelaFormulario titulo={titulo} ocupado={ocupado} aoFechar={fechar} classe="le-dialog"><div className="licitacoes-acervo">
  <p className="lac-help"><strong>{empresa.nome}</strong> · A empresa que compra é esta ficha. No campo “Nossa empresa fornecedora”, selecione nossa pessoa jurídica.</p>
  {!permitido?<p className="lac-message is-bad" role="alert">Este acesso não possui permissão para Licitações.</p>:carregando?<p role="status">Carregando cadastros e documentos…</p>:!form?<div className="lac-message is-bad" role="alert"><p>{erro||'Não foi possível abrir o cadastro.'}</p><button type="button" className="btn-outline" onClick={()=>setRecarregar(n=>n+1)}>Tentar novamente</button></div>:<>
   {etapa==='formulario'&&<>
    {!form.id&&<p className="lac-message">O site da empresa é uma sugestão. Confira e informe o endereço do portal de fornecedores. Este controle não envia uma inscrição externa.</p>}
    {precisaConciliar&&!conflito&&<div className="lac-message is-warn" role="alert"><p>A gravação foi interrompida por conflito. Seu preenchimento está mantido; carregue a versão atual antes de continuar.</p><button type="button" className="btn-outline" disabled={ocupado} onClick={tentarConciliar}>Carregar versão atual</button></div>}
    <FormCadastro contextoEmpresa key={form.id||form.cadastroId} inicial={form} titulares={dados?.titulares||[]} documentos={dados?.documentos||[]} podeVincularDocumentos={dados?.podeVincularDocumentos===true} ocupado={ocupado} erro={erro} atual={conflito} aoConciliado={()=>{setConflito(null);setPrecisaConciliar(false);setErro('');}} aoSalvar={salvar} aoFechar={fechar}/>
   </>}
   {etapa==='existente'&&<div className="lac-message is-warn" role="status"><h3>Este cadastro já existe</h3><p>Encontramos a mesma empresa fornecedora e o mesmo portal. Confira a ficha abaixo; vincular preserva os dados já salvos, inclusive se estiver arquivada.</p><dl className="lac-facts"><div><dt>Cadastro</dt><dd>{cadastroSalvo.nome}</dd></div><div><dt>Empresa fornecedora</dt><dd>{cadastroSalvo.titularNome||dados?.titulares?.find(t=>t.id===cadastroSalvo.titularId)?.nome||'Empresa cadastrada'}</dd></div><div><dt>Situação</dt><dd>{situacaoCadastro(cadastroSalvo).rotulo}</dd></div><div><dt>Portal</dt><dd style={{overflowWrap:'anywhere'}}>{cadastroSalvo.url}</dd></div></dl><p>O preenchimento desta tentativa não substituiu a ficha existente.</p><div className="lac-actions"><button className="btn-primary" disabled={ocupado} onClick={vincular}>{ocupado?'Vinculando…':'Vincular cadastro existente'}</button><button className="btn-outline" disabled={ocupado} onClick={()=>{setEtapa('formulario');setCadastroSalvo(null);setErro('');}}>Voltar ao preenchimento</button></div></div>}
   {etapa==='vinculo-pendente'&&<div className="lac-message is-warn" role="alert"><h3>Cadastro salvo; falta vincular à empresa</h3><p>{cadastroSalvo?.nome} continua disponível na aba Cadastros. Nenhum dado foi descartado.</p>{erro&&<p>{erro}</p>}<div className="lac-actions"><button className="btn-primary" disabled={ocupado} onClick={vincular}>{ocupado?'Vinculando…':'Tentar vincular novamente'}</button><button className="btn-outline" disabled={ocupado} onClick={fechar}>Fechar e manter cadastro</button></div></div>}
   {etapa==='concluido'&&<div className="lac-message is-ok" role="status"><strong>Cadastro salvo e vinculado à empresa.</strong>{erro&&<p>{erro}</p>}<button type="button" className="btn-outline" disabled={ocupado} onClick={fechar}>Concluir</button></div>}
  </>}
 </div></JanelaFormulario>;
}
