import {useState} from 'react';
import {ArrowUpRight,Clock3,MapPinned,Route} from 'lucide-react';
import JanelaFormulario from './JanelaFormulario.jsx';
import {conciliarCadastro,diaBrasilia,urlPortalSegura} from '../lib/licitacoes-cadastros.mjs';
import {dataValida} from '../lib/calc/documentos.js';
import './licitacoes-rota-cidade.css';

const CAMPOS=['distanciaKm','tempoMinutos','consultadoEm','fonteUrl','observacao'];
const ROTULOS={distanciaKm:'Distância',tempoMinutos:'Tempo estimado',consultadoEm:'Data da consulta',fonteUrl:'Fonte',observacao:'Observação'};
const data=v=>dataValida(v)?v.split('-').reverse().join('/'):'Não informada';
const km=v=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(v);
const tempo=v=>{const horas=Math.floor(v/60),minutos=v%60;return horas?`${horas} h${minutos?` ${minutos} min`:''}`:`${minutos} min`;};
const converterForm=r=>({distanciaKm:r.distanciaKm??'',horas:r.tempoMinutos===undefined?'':Math.floor(r.tempoMinutos/60),minutos:r.tempoMinutos===undefined?'':r.tempoMinutos%60,consultadoEm:r.consultadoEm||diaBrasilia(),fonteUrl:r.fonteUrl||'',observacao:r.observacao||''});
const valoresForm=f=>({distanciaKm:Number(String(f.distanciaKm).replace(',','.')),tempoMinutos:Number(f.horas||0)*60+Number(f.minutos||0),consultadoEm:f.consultadoEm,fonteUrl:f.fonteUrl.trim(),observacao:f.observacao});

function FormRota({municipio,inicial,rota,fontePadrao,ocupado,erroExterno,aoSalvar,aoFechar,aoOcupar,aoRecarregar}) {
  const [base,setBase]=useState(()=>inicial||{distanciaKm:'',tempoMinutos:'',consultadoEm:diaBrasilia(),fonteUrl:fontePadrao,observacao:''});
  const [form,setForm]=useState(()=>converterForm(inicial||{fonteUrl:fontePadrao}));
  const [erro,setErro]=useState(''),[conflito,setConflito]=useState(false),[ignorarErroExterno,setIgnorarErroExterno]=useState(false),[recarregando,setRecarregando]=useState(false);
  const recarregar=async()=>{if(ocupado||recarregando||!aoRecarregar)return;setRecarregando(true);setErro('');try{await aoRecarregar();}catch(e){setErro(`${e.message||'Não foi possível carregar a versão atual.'} Seu preenchimento continua aberto.`);}finally{setRecarregando(false);}};
  const campo=k=>e=>setForm(f=>({...f,[k]:e.target.value}));
  const atuais=rota?.atualizadoEm&&rota.atualizadoEm!==base.atualizadoEm?rota:null;
  const conciliacao=conflito&&atuais?conciliarCadastro(base,valoresForm(form),atuais,CAMPOS):null;
  const rotuloValor=(k,v)=>k==='distanciaKm'?`${km(v)} km`:k==='tempoMinutos'?tempo(v):k==='consultadoEm'?data(v):String(v||'Não informado');
  const salvar=async e=>{
    e.preventDefault();if(ocupado||conflito)return;
    const valores=valoresForm(form),horas=Number(form.horas||0),minutos=Number(form.minutos||0);
    if(String(form.distanciaKm).trim()===''||!Number.isFinite(valores.distanciaKm)||valores.distanciaKm<0||valores.distanciaKm>3000){setErro('Informe uma distância entre 0 e 3.000 km.');return;}
    if((String(form.horas).trim()===''&&String(form.minutos).trim()==='')||!Number.isInteger(horas)||horas<0||!Number.isInteger(minutos)||minutos<0||minutos>59||valores.tempoMinutos>4320){setErro('Informe o tempo em horas e minutos, até 72 horas.');return;}
    if(!dataValida(valores.consultadoEm)||valores.consultadoEm>diaBrasilia()){setErro('Informe a data em que consultou a rota, sem usar uma data futura.');return;}
    if(!urlPortalSegura(valores.fonteUrl)){setErro('Informe o link da fonte consultada, começando por https:// ou http://.');return;}
    setErro('');setIgnorarErroExterno(false);aoOcupar(true);
    try{await aoSalvar({municipio,...valores,...(base.id?{id:base.id}:{})},base.atualizadoEm);aoFechar();}
    catch(e){setErro(e.message||'Não foi possível salvar. Seu preenchimento foi mantido.');if(e.status===409)setConflito(true);}
    finally{aoOcupar(false);}
  };
  return <form className="lrc-form" onSubmit={salvar}>
    {(erro||(!ignorarErroExterno&&erroExterno))&&<p className="lrc-message is-bad" role="alert">{erro||erroExterno}</p>}
    {conflito&&<div className="lrc-message is-warn" role="alert"><strong>Outra pessoa atualizou esta rota.</strong><p>Seu preenchimento foi mantido. Revise a versão atual antes de salvar novamente.</p>{conciliacao?<><dl className="lrc-conflicts">{conciliacao.alterados.map(k=><div key={k}><dt>{ROTULOS[k]}</dt><dd><strong>Salvo:</strong> {rotuloValor(k,atuais[k])}</dd><dd><strong>Seu preenchimento:</strong> {rotuloValor(k,valoresForm(form)[k])}</dd></div>)}</dl><button type="button" className="btn-outline" disabled={ocupado} onClick={()=>{setForm(converterForm(conciliacao.item));setBase(atuais);setConflito(false);setErro('');setIgnorarErroExterno(true);}}>Revisar com a versão atual</button></>:<><p>Não foi possível carregar a versão atual. Seu preenchimento continua aberto.</p>{aoRecarregar&&<button type="button" className="btn-outline" disabled={ocupado||recarregando} onClick={recarregar}>{recarregando?'Carregando versão atual…':'Tentar carregar versão atual'}</button>}</>}</div>}
    <p className="lrc-help">Registre a distância e o tempo mostrados na consulta até {municipio}. O trânsito atual continua disponível no Google Maps.</p>
    <fieldset className="lrc-fields" disabled={ocupado||conflito}>
      <label className="label">Distância (km)<input className="input" required inputMode="decimal" value={form.distanciaKm} onChange={campo('distanciaKm')} placeholder="Ex.: 142,5" maxLength={12}/></label>
      <label className="label">Tempo · horas<input className="input" type="number" min="0" max="72" step="1" value={form.horas} onChange={campo('horas')} placeholder="0"/></label>
      <label className="label">Tempo · minutos<input className="input" type="number" min="0" max="59" step="1" value={form.minutos} onChange={campo('minutos')} placeholder="0"/></label>
      <label className="label lrc-wide">Data da consulta<input className="input" required type="date" max={diaBrasilia()} value={form.consultadoEm} onChange={campo('consultadoEm')}/></label>
      <label className="label lrc-wide">Link da fonte consultada<input className="input" required type="url" maxLength={2000} value={form.fonteUrl} onChange={campo('fonteUrl')}/></label>
      <label className="label lrc-wide">Observação<textarea className="input" rows={2} maxLength={2000} value={form.observacao} onChange={campo('observacao')} placeholder="Ex.: trajeto escolhido ou condição observada"/></label>
    </fieldset>
    <footer className="lrc-actions"><button className="btn-primary" disabled={ocupado||conflito}>{ocupado?'Salvando…':'Salvar distância e tempo'}</button><button type="button" className="btn-ghost" disabled={ocupado} onClick={aoFechar}>Cancelar</button></footer>
  </form>;
}

export default function RotaCidadeLicitacoes({municipio,rota,origemRota='',aoSalvar,aoRecarregar,ocupado=false,erro=''}) {
  const [editor,setEditor]=useState(null),[salvando,setSalvando]=useState(false),[mensagem,setMensagem]=useState('');
  const bloqueado=ocupado||salvando;
  const link=origemRota.trim()&&municipio?`https://www.google.com/maps/dir/?${new URLSearchParams({api:'1',origin:origemRota.trim(),destination:`${municipio}, MG, Brasil`,travelmode:'driving'})}`:'';
  const salvo=rota&&Number.isFinite(rota.distanciaKm)&&Number.isInteger(rota.tempoMinutos);
  const fonte=urlPortalSegura(rota?.fonteUrl);
  const salvar=async(item,versao)=>{await aoSalvar(item,versao);setMensagem('Distância e tempo salvos para esta cidade.');};
  return <section className="licitacoes-rota-cidade" aria-label={`Rota para ${municipio}`}>
    <header><span className="lrc-icon"><MapPinned size={21}/></span><div><h3>Distância e rota</h3><p>Saída da sede da Impresilk · Montes Claros</p></div></header>
    {salvo?<div className="lrc-values"><div><span><Route size={14}/>Distância registrada</span><strong>{km(rota.distanciaKm)} <small>km</small></strong></div><div><span><Clock3 size={14}/>Tempo estimado registrado</span><strong>{tempo(rota.tempoMinutos)}</strong></div></div>:<p className="lrc-not-verified">Distância ainda não conferida</p>}
    {salvo?<p className="lrc-help">Consulta de {data(rota.consultadoEm)}{fonte&&<> · <a href={fonte} target="_blank" rel="noopener noreferrer">Ver fonte <ArrowUpRight size={12}/></a></>}. Valores salvos no painel; o trânsito pode mudar.</p>:<p className="lrc-help">Confira o trajeto no Google Maps e registre os quilômetros e o tempo estimado para acompanhar aqui.</p>}
    {rota?.observacao&&<details className="lrc-notes"><summary>Observação da rota</summary><p>{rota.observacao}</p></details>}
    {mensagem&&<p role="status" className="lrc-message is-ok">{mensagem}</p>}{erro&&!editor&&<p role="alert" className="lrc-message is-bad">{erro}</p>}
    <footer className="lrc-actions">{link?<a className="btn-outline" href={link} target="_blank" rel="noopener noreferrer">Conferir no Google Maps <ArrowUpRight size={15}/></a>:<span className="lrc-help">Origem da rota indisponível.</span>}<button type="button" className="btn-primary" disabled={bloqueado||!link} onClick={()=>{setMensagem('');setEditor({inicial:rota||null});}}>{salvo?'Atualizar distância':'Registrar distância'}</button></footer>
    {editor&&<JanelaFormulario titulo={`Distância e tempo · ${municipio}`} ocupado={bloqueado} aoFechar={()=>!bloqueado&&setEditor(null)} classe="lrc-dialog janela-estreita"><FormRota inicial={editor.inicial} rota={rota} municipio={municipio} fontePadrao={link} ocupado={bloqueado} erroExterno={erro} aoSalvar={salvar} aoFechar={()=>setEditor(null)} aoOcupar={setSalvando} aoRecarregar={aoRecarregar}/></JanelaFormulario>}
  </section>;
}
