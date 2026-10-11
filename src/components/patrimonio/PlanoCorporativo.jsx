import {useCallback,useEffect,useMemo,useState} from 'react';
import {FileDown,FileUp,RefreshCw} from 'lucide-react';
import {lerInfra,salvarInfra,guardarContratoInfra,lerContratoInfra} from '../../services/patrimonio-infra.js';
import {lerControles,salvarControle} from '../../services/patrimonio.js';
import ContatoResponsavel,{ContatoLinks} from './ContatoResponsavel.jsx';
import './telefonia.css';

const novo=()=>({id:crypto.randomUUID(),tipo:'plano-corporativo',operadora:'',nome:'',valorMensal:null,quantidadeLinhas:null,franquia:'',inicioVigencia:'',fimVigencia:'',contatoId:'',atualizadoEm:null});
const contatoDo=(mapa,id)=>id&&mapa?.[id]?.tipo==='contato'?{id,...mapa[id]}:null;
const prepararLinha=linha=>({
 tipo:'celulares',numero:linha.numero||'',operadora:linha.operadora||'',pessoaId:linha.pessoaId||'',pessoa:linha.pessoa||'',aparelhoId:linha.aparelhoId||'',modelo:linha.modelo||'',observacao:linha.observacao||'',setorId:linha.setorId||'',status:linha.status||'ativo',planoId:linha.planoId||'',
});
const brl=valor=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(valor);

export default function PlanoCorporativo() {
 const [infra,setInfra]=useState(null),[plano,setPlano]=useState(null),[controles,setControles]=useState(null);
 const [form,setForm]=useState(null),[erro,setErro]=useState(''),[mensagem,setMensagem]=useState(''),[ocupado,setOcupado]=useState(false),[carregando,setCarregando]=useState(false),[conflito,setConflito]=useState(false);
 const carregar=useCallback(async()=>{
  setCarregando(true);setErro('');
  try {
   const [res,c]=await Promise.all([lerInfra(),lerControles()]);
   setInfra(res);setControles(c);
   const planos=Object.entries(res.itens||{}).filter(([,v])=>v.tipo==='plano-corporativo').map(([id,v])=>({id,...v}));
   setPlano(planos[0]||null);
   if(planos.length>1)setMensagem('Há mais de um plano cadastrado. Revise os registros antes de alterar os vínculos.');
  } catch(e){setErro(e.message);}
  finally{setCarregando(false);}
 },[]);
 useEffect(()=>{carregar();},[carregar]);
 const contatos=useMemo(()=>Object.entries(infra?.itens||{}).filter(([,v])=>v.tipo==='contato').map(([id,v])=>({id,...v})),[infra]);
 const linhas=useMemo(()=>Object.entries(controles||{}).filter(([,v])=>v?.tipo==='celulares').map(([id,v])=>({id,...v})),[controles]);
 const vinculadas=linhas.filter(l=>l.planoId===plano?.id);
 const campo=chave=>e=>setForm(v=>({...v,[chave]:e.target.value}));
 function atualizarContato(item) {
  setInfra(v=>({...v,itens:{...v.itens,[item.id]:item}}));
 }
 async function salvar(e) {
  e.preventDefault();setOcupado(true);setErro('');setMensagem('');
  try {
   const dados={tipo:'plano-corporativo',operadora:form.operadora.trim(),nome:form.nome.trim(),franquia:form.franquia.trim(),inicioVigencia:form.inicioVigencia||'',fimVigencia:form.fimVigencia||'',contatoId:form.contatoId||'',quantidadeLinhas:form.quantidadeLinhas===''||form.quantidadeLinhas==null?null:Number(form.quantidadeLinhas)};
   if(infra?.podeValores)dados.valorMensal=form.valorMensal===''||form.valorMensal==null?null:Number(form.valorMensal);
   const {item}=await salvarInfra(form.id,dados,form.atualizadoEm??null);
   setInfra(v=>({...v,itens:{...v.itens,[item.id]:item}}));setPlano(item);setForm(null);
   setMensagem('Plano salvo. Vincule as linhas pelo identificador do plano.');
  } catch(e){setErro(e.message);if(e.status===409)setConflito(true);}
  finally{setOcupado(false);}
 }
 async function vincularTodas() {
  if(!plano||!window.confirm(`Vincular ${linhas.filter(l=>!l.planoId).length} linhas ainda sem plano a “${plano.nome}”? Cada linha mantém seu número, pessoa, aparelho e histórico.`))return;
  setOcupado(true);setErro('');setMensagem('');
  let atual=controles,feitas=0;
  try {
   for(const linha of linhas.filter(l=>!l.planoId)) {
    const corrente=atual[linha.id];
    if(!corrente||corrente.planoId)continue;
    atual=await salvarControle(linha.id,{...prepararLinha(corrente),planoId:plano.id},corrente.atualizadoEm??null);
    feitas++;
    setControles(atual);
   }
   setMensagem(`${feitas} ${feitas===1?'linha vinculada':'linhas vinculadas'} ao plano. Linhas já ligadas a outro plano foram preservadas.`);
  } catch(e){
   setErro(`${feitas} ${feitas===1?'linha vinculada':'linhas vinculadas'} antes de uma falha: ${e.message} Atualize e tente novamente para as restantes.`);
   try{setControles(await lerControles());}catch{return;}
  } finally{setOcupado(false);}
 }
 async function enviarContrato(e) {
  const arquivo=e.target.files?.[0];e.target.value='';
  if(!arquivo||!plano)return;
  if(!['application/pdf','image/jpeg','image/png','image/webp'].includes(arquivo.type)){setErro('Selecione um contrato em PDF ou imagem.');return;}
  if(arquivo.size>3*1024*1024){setErro('O contrato deve ter até 3 MB.');return;}
  setOcupado(true);setErro('');
  try {
   const base64=await new Promise((resolve,reject)=>{const leitor=new FileReader();leitor.onload=()=>resolve(String(leitor.result).split(',')[1]||'');leitor.onerror=()=>reject(new Error('Não foi possível ler o arquivo.'));leitor.readAsDataURL(arquivo);});
   await guardarContratoInfra(plano.id,base64,arquivo.type,arquivo.name,plano.atualizadoEm??null);
   const atualizado=await lerInfra();
   setInfra(atualizado);setPlano({id:plano.id,...atualizado.itens[plano.id]});
   setMensagem('Contrato guardado no cadastro do plano.');
  } catch(e){setErro(e.message);}
  finally{setOcupado(false);}
 }
 async function baixarContrato() {
  setOcupado(true);setErro('');
  try {
   const {base64,mime,nome}=await lerContratoInfra(plano.id);
   const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
   const url=URL.createObjectURL(new Blob([bytes],{type:mime||'application/pdf'}));
   const a=document.createElement('a');a.href=url;a.download=nome||'contrato-plano.pdf';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  } catch(e){setErro(e.message);}
  finally{setOcupado(false);}
 }
 return <section className="tel-section" aria-label="Plano corporativo">
  <header className="info-head"><div><h2>Plano corporativo</h2><p>Um cadastro para a operadora, a vigência, o contato e as linhas vinculadas.</p></div><button className="btn-ghost" aria-label="Atualizar plano corporativo" disabled={carregando||ocupado} onClick={carregar}><RefreshCw size={16}/></button></header>
  {erro&&<p role="alert" className="pat-notice is-error">{erro}</p>}{mensagem&&<p role="status">{mensagem}</p>}
  {carregando&&!infra?<p role="status">Carregando plano…</p>:!infra?<p>Plano indisponível. Atualize para tentar novamente.</p>:<>
   {plano?<article className="tel-plan-card">
    <div className="tel-plan-top"><div><small>{plano.operadora}</small><h3>{plano.nome}</h3></div><button className="btn-outline" onClick={()=>{setForm({...plano});setErro('');setConflito(false);}} disabled={ocupado}>Editar plano</button></div>
    <div className="tel-plan-facts">
     <span><strong>Linhas previstas</strong>{plano.quantidadeLinhas===''||plano.quantidadeLinhas==null?'Não informado':plano.quantidadeLinhas}</span>
     <span><strong>Linhas vinculadas</strong>{vinculadas.length} de {linhas.length} cadastradas</span>
     <span><strong>Franquia</strong>{plano.franquia||'Não informada'}</span>
     <span><strong>Vigência</strong>{plano.inicioVigencia||'Início pendente'} → {plano.fimVigencia||'Fim pendente'}</span>
     {infra.podeValores&&<span><strong>Valor mensal total</strong>{plano.valorMensal===''||plano.valorMensal==null?'Não informado':brl(plano.valorMensal)}</span>}
    </div>
    <div className="tel-plan-bottom"><div><h4>Contato da operadora</h4><ContatoLinks contato={contatoDo(infra.itens,plano.contatoId)}/></div><div className="tel-plan-actions">
     <button className="btn-outline" onClick={vincularTodas} disabled={ocupado||!controles||!linhas.some(l=>!l.planoId)}>Vincular linhas sem plano</button>
     {infra.podeValores&&<>{!plano.contrato&&<label className="btn-outline tel-upload"><FileUp size={15}/> Anexar contrato<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={enviarContrato} disabled={ocupado}/></label>}{plano.contrato&&<button className="btn-ghost" onClick={baixarContrato} disabled={ocupado}><FileDown size={15}/> Baixar contrato</button>}</>}
    </div></div>
    {linhas.some(l=>l.planoId&&l.planoId!==plano.id)&&<small className="tel-muted">Algumas linhas têm vínculo com outro plano. Elas ficam preservadas para conferência.</small>}
   </article>:<div className="pat-empty"><p>Nenhum plano corporativo cadastrado.</p><button className="btn-primary" onClick={()=>setForm(novo())}>Cadastrar plano</button></div>}
   {form&&<div className="tel-plan-editor"><h3>{form.atualizadoEm?'Editar plano':'Novo plano'}</h3><form className="pat-form" onSubmit={salvar}>
    {erro&&<p role="alert" className="pat-notice is-error">{erro}</p>}{conflito&&<p>O plano mudou. Atualize antes de salvar novamente.</p>}
    <fieldset className="tel-form-grid" disabled={ocupado||conflito}>
     <label>Operadora<input className="input" required maxLength={180} value={form.operadora||''} onChange={campo('operadora')}/></label>
     <label>Nome do plano<input className="input" required maxLength={180} value={form.nome||''} onChange={campo('nome')}/></label>
     {infra.podeValores&&<label>Valor mensal total (R$)<input className="input" type="number" min="0" max="1000000000" step=".01" value={form.valorMensal??''} onChange={campo('valorMensal')}/></label>}<label>Quantidade de linhas do contrato<input className="input" type="number" min="0" max="100000" step="1" value={form.quantidadeLinhas??''} onChange={campo('quantidadeLinhas')}/></label>
     <label>Franquia<input className="input" maxLength={180} value={form.franquia||''} onChange={campo('franquia')} placeholder="Ex.: dados e voz compartilhados"/></label>
     <label>Início da vigência<input className="input" type="date" value={form.inicioVigencia||''} onChange={campo('inicioVigencia')}/></label>
     <label>Fim da vigência<input className="input" type="date" value={form.fimVigencia||''} onChange={campo('fimVigencia')}/></label>
     <ContatoResponsavel rotulo="Contato da operadora" valor={form.contatoId||''} contatos={contatos} aoMudar={id=>setForm(v=>({...v,contatoId:id}))} aoContatoSalvo={atualizarContato}/>
    </fieldset>
    <div className="pat-actions"><button className="btn-primary" disabled={ocupado||conflito}>{ocupado?'Salvando…':'Salvar plano'}</button><button type="button" className="btn-ghost" disabled={ocupado} onClick={()=>{setForm(null);setErro('');}}>Cancelar</button></div>
   </form></div>}
  </>}
 </section>;
}
