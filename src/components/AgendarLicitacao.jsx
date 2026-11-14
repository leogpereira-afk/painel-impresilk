import {useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {CalendarDays} from 'lucide-react';
import JanelaFormulario from './JanelaFormulario.jsx';
import {listarAtivos,salvarAtivo} from '../services/ativos.js';
import {getSessao,podeAbrir} from '../lib/sessao.js';
import {origemDaPesquisa,idAgendamentoLicitacao,dataHoraPrazoBrasilia,validarAgendamentoLicitacao,caminhoPesquisaAgendada} from '../../supabase/functions/_shared/licitacoes-agenda.mjs';
import {urlOficialSegura} from '../lib/licitacoes-pesquisa.mjs';

export default function AgendarLicitacao({item,relatorio,pendente=false,sessao,aoFechar,aoSalvo}){
  const inicial=dataHoraPrazoBrasilia(item.datasEdital?.sessaoPublica?.dataHora || item.prazo,pendente);
  const [titulo,setTitulo]=useState(()=>[pendente?'Conferir licitação':'Licitação',item.orgao||item.processo||item.id,item.produto].filter(Boolean).join(' · ').slice(0,500));
  const [data,setData]=useState(inicial.data),[hora,setHora]=useState(inicial.hora),[diaInteiro,setDiaInteiro]=useState(!inicial.hora);
  const [origem,setOrigem]=useState(null),[cadastroId,setCadastroId]=useState(''),[existente,setExistente]=useState(null),[carregando,setCarregando]=useState(true),[salvando,setSalvando]=useState(false),[erro,setErro]=useState(''),[salvo,setSalvo]=useState(false);
  const montado=useRef(true),emEnvio=useRef(false);
  const chaveSessao=JSON.stringify([sessao?.usuario,sessao?.master,sessao?.permissoes]);
  const autorizado=podeAbrir('licitacoes',sessao)&&podeAbrir('calendario-empresa',sessao);
  useEffect(()=>{
    let vivo=true;montado.current=true;
    (async()=>{
      try{
        if(!autorizado)throw Error('Seu acesso precisa incluir Licitações e Calendário da empresa.');
        const o=origemDaPesquisa(item,relatorio,pendente),id=await idAgendamentoLicitacao(o),itens=await listarAtivos(),anterior=itens.find(x=>x.id===id)||null;
        if(anterior){validarAgendamentoLicitacao(anterior);if(await idAgendamentoLicitacao(anterior.origemPesquisa)!==id)throw Error('Identificador já utilizado em outro acompanhamento. Confira a ficha antes de agendar.');}
        if(vivo){setOrigem(o);setCadastroId(id);setExistente(anterior);setCarregando(false);}
      }catch(e){if(vivo){setErro(e.message);setCarregando(false);}}
    })();
    return()=>{vivo=false;montado.current=false;};
  },[item,relatorio,pendente,autorizado]);
  async function salvar(e){
    e.preventDefault();if(emEnvio.current||carregando||!origem||existente||!autorizado)return;
    const atual=getSessao();if(JSON.stringify([atual?.usuario,atual?.master,atual?.permissoes])!==chaveSessao){setErro('Sua sessão mudou. Feche e abra novamente o agendamento.');return;}
    emEnvio.current=true;setSalvando(true);setErro('');
    try{
      const ficha={cadastroId,tipo:'licitacao',nome:titulo.trim(),identificacao:item.orgao||'',edital:item.processo||'',validade:pendente?'':data,hora:diaInteiro?'':hora,status:'avaliar',url:urlOficialSegura(item.oficialUrl)||'',origemPesquisa:origem,observacao:`Origem: relatório ${relatorio.id}, item ${item.id}. ${pendente?'Evidências pendentes; agendamento somente para conferência.':'Data e horário confirmados ao agendar.'}`,acompanhamento:{proximaAcao:item.proximaAcao||'Conferir edital, anexos e retificações na fonte oficial.',prazoAcao:pendente?data:'',checklist:[]}};
      validarAgendamentoLicitacao(ficha);
      const r=await salvarAtivo(ficha);
      if(!r||r.id!==cadastroId||r.tipo!=='licitacao'||!r.origemPesquisa)throw Error('O agendamento não foi confirmado. Atualize a lista antes de tentar novamente.');
      if(montado.current){setExistente(r);setSalvo(true);aoSalvo?.(r);window.dispatchEvent(new Event('licitacoes-atualizadas'));}
    }catch(e){if(montado.current)setErro(e.message);}
    finally{emEnvio.current=false;if(montado.current)setSalvando(false);}
  }
  const dataExistente=existente?.origemPesquisa?.pendente?existente.acompanhamento?.prazoAcao:existente?.validade;
  const encerrado=existente&&!['avaliar','participar','enviada'].includes(existente.status);
  return <JanelaFormulario titulo={pendente?'Agendar conferência':'Adicionar ao calendário'} ocupado={salvando} aoFechar={aoFechar} classe="lw-dialog janela-estreita">
    <p className="text-sm text-slate-600 mb-4">Ao confirmar, será criada uma ficha em Acompanhamento e o mesmo registro aparecerá no Calendário da empresa. O relatório original permanece como referência.</p>
    {carregando?<p role="status">Conferindo se este item já está agendado…</p>:existente?<div className="space-y-3" role="status"><strong>{encerrado?'Este acompanhamento já foi encerrado.':salvo?'Agendamento confirmado.':'Este item já possui acompanhamento.'}</strong><p>{existente.nome}{dataExistente?` · ${dataExistente.split('-').reverse().join('/')}`:''}{existente.hora?` às ${existente.hora} (Brasília)`:' · sem horário'}</p><p className="text-sm">{encerrado?'A ficha encerrada foi preservada e não aparece no calendário.':existente.preparacaoBot?.prazoImportado?'Prazo importado da pesquisa. Confira o edital vigente no acompanhamento antes de concluir a preparação.':'Use o acompanhamento para alterar a data ou encerrar a participação.'}</p><div className="flex flex-wrap gap-2">{dataExistente&&!encerrado&&<Link className="btn-primary" to={'/calendario-empresa?mes='+dataExistente.slice(0,7)}><CalendarDays size={16}/>Ver no calendário</Link>}<Link className="btn-outline" to={caminhoPesquisaAgendada(existente.origemPesquisa)} onClick={aoFechar}>Abrir relatório de origem</Link><button type="button" className="btn-outline" onClick={aoFechar}>Fechar</button></div></div>:<form onSubmit={salvar} className="space-y-4"><fieldset disabled={salvando||!origem||!autorizado} className="space-y-4">
      {pendente?<p className="text-sm text-amber-800">Defina quando conferir as evidências. Esta data não representa o prazo de propostas nem confirma a oportunidade.</p>:<p className="text-sm text-slate-600">Confira data e horário na fonte oficial, incluindo retificações, antes de confirmar. Horários de Brasília.</p>}
      <label className="block text-sm font-medium">Título<input className="input mt-1 w-full" value={titulo} maxLength={500} required onChange={e=>setTitulo(e.target.value)}/></label>
      <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-medium">{pendente?'Data da conferência':'Data confirmada'}<input className="input mt-1 w-full" type="date" required value={data} onInput={e=>setData(e.currentTarget.value)} onChange={e=>setData(e.target.value)}/></label><label className="block text-sm font-medium">Horário de Brasília<input className="input mt-1 w-full" type="time" required={!diaInteiro} disabled={diaInteiro} value={hora} onInput={e=>setHora(e.currentTarget.value)} onChange={e=>setHora(e.target.value)}/></label></div>
      <label className="lw-check-label flex items-center gap-2 text-sm"><input type="checkbox" checked={diaInteiro} onChange={e=>setDiaInteiro(e.target.checked)}/>Dia inteiro / horário ainda não definido</label>
      <div className="flex flex-wrap gap-2"><button type="button" className="btn-outline" onClick={aoFechar}>Cancelar</button><button type="submit" className="btn-primary">{salvando?'Salvando…':'Confirmar e salvar'}</button></div>
    </fieldset></form>}
    {erro&&<p className="mt-3 text-sm text-red-700" role="alert">{erro}</p>}
  </JanelaFormulario>;
}
