import {useEffect,useMemo,useRef,useState} from 'react';
import {X,UserRound,ArrowUpRight} from 'lucide-react';
import {fichaCliente360} from '../lib/calc/cliente360.js';
import {getCadastroCliente} from '../services/crm.js';
import {moeda,dataCurta} from '../lib/format.js';
import './cliente360.css';
import AcoesMubisys from './AcoesMubisys.jsx';
export default function Cliente360({alvo,dados,hoje,indisponiveis=[],crm,erroCrm,aoFechar,aoOrcamento,aoVincular}){
 const [salvando,setSalvando]=useState(false),[erroVinculo,setErroVinculo]=useState('');
 const [res,setRes]=useState(null),[erro,setErro]=useState(''),[tentativa,setTentativa]=useState(0),[limite,setLimite]=useState(8);const cab=useRef(null);
 useEffect(()=>{cab.current?.focus();},[]);
 useEffect(()=>{let ativo=true;const ctl=new AbortController();setRes(null);setErro('');
  if(alvo.clienteId)getCadastroCliente(alvo.clienteId,ctl.signal).then(r=>{if(ativo)setRes(r);}).catch(e=>{if(ativo)setErro(e.message);});
  return()=>{ativo=false;ctl.abort();};
 },[alvo.clienteId,tentativa]);
 const semPropostas=indisponiveis.includes('orcamentos');
 const f=useMemo(()=>fichaCliente360(alvo,dados,res?.cliente,hoje),[alvo,dados,res,hoje]);
 const oportunidades=(crm?.cards||[]).filter(c=>f.clienteId&&c.clienteId===f.clienteId);
 return <section className="cliente360 sem-impressao" aria-labelledby="cliente360-titulo">
  <header><div><span className="c360-eyebrow"><UserRound size={16}/> Cliente 360</span><h2 id="cliente360-titulo" ref={cab} tabIndex={-1}>{alvo.cliente}</h2><p>{f.cadastro?.responsavel?`Carteira: ${f.cadastro.responsavel}`:'Histórico comercial do cliente'}{f.cadastro?.origem&&` · Origem: ${f.cadastro.origem}`}</p></div><button className="btn-ghost" onClick={aoFechar} aria-label="Fechar Cliente 360"><X size={20}/></button></header>
  {!f.clienteId&&<p className="c360-notice">O orçamento não informa o cadastro do cliente. Exibimos apenas esta proposta para evitar misturar empresas com nomes iguais.</p>}
  {erro&&<p className="c360-notice" role="status">Cadastro complementar indisponível: {erro} <button className="btn-ghost" onClick={()=>setTentativa(t=>t+1)}>Tentar novamente</button></p>}
  {f.clienteId&&!res&&!erro&&<p role="status">Consultando cadastro do cliente…</p>}
  {res&&!res.cliente&&<p className="c360-notice">Cadastro não localizado na última atualização. Os orçamentos continuam disponíveis abaixo.</p>}
  <div className="c360-numeros"><div><span>Propostas abertas</span><strong>{semPropostas?'—':moeda(f.valorAberto)}</strong><small>{f.abertos.length} propostas</small></div><div><span>Propostas ganhas</span><strong>{semPropostas?'—':moeda(f.valorGanho)}</strong><small>{f.ganhos.length} aprovadas · não representa recebimento</small></div><div><span>Conversão por quantidade</span><strong>{semPropostas||f.conversao===null?'—':`${Math.round(f.conversao*100)}%`}</strong><small>Ganhos ÷ propostas concluídas</small></div></div>
  <p className="c360-coverage">{semPropostas?"A fonte de orçamentos está indisponível nesta consulta. ":""}Base carregada de Orçamentos, respeitando o vendedor selecionado. Propostas alternativas podem pertencer ao mesmo negócio.</p>
  <div className="c360-grid"><div><h3>Contato e cadastro</h3>{f.documento&&<p>CPF/CNPJ: {f.documento}</p>}{f.cadastro?.classificacao&&<p>{f.cadastro.classificacao}</p>}{!f.contatos.length&&<p>{f.cadastro?.telefone||f.cadastro?.email||'Sem contato disponível nos dados consultados.'}</p>}{f.contatos.slice(0,10).map(c=><div className="c360-contact" key={c.id}><b>{c.nome||'Contato'}{c.financeiro?' · Financeiro':''}</b><span>{c.celular}</span><span>{c.email}</span><small>{c.fonte||'Cadastro Mubisys'}</small></div>)}{res?.atualizadoEm&&<small>Cadastro atualizado em {new Date(res.atualizadoEm).toLocaleString('pt-BR')}</small>}</div>
  <div><h3>Financeiro e serviços</h3>{indisponiveis.includes('recebiveis')?<p>Recebíveis indisponíveis para esta consulta.</p>:!f.vinculoFinanceiro?<p>Saldo não associado: falta um vínculo por cadastro ou documento.</p>:<><p>Saldo em aberto: <b>{moeda(f.saldo)}</b></p><p>Vencido: <b>{moeda(f.saldoVencido)}</b> · {f.vencidos.length} títulos</p></>}{indisponiveis.includes('ordens')?<p>Ordens de serviço indisponíveis para esta consulta.</p>:!f.vinculoOrdens?<p>Serviços ainda sem vínculo confirmado com este cadastro.</p>:<p>{f.ordens.length} ordens na base carregada{f.ordens[0]?.data&&` · última em ${dataCurta(f.ordens[0].data)}`}</p>}<small>Cobertura limitada às fontes carregadas. Nenhuma quitação é presumida pela ausência de títulos.</small></div></div>
  <h3>Oportunidades ativas no Mubisys</h3>{erroCrm&&<p className="c360-notice">{erroCrm}</p>}{crm?.atualizadoEm&&<p className="c360-coverage">Oportunidades atualizadas em {new Date(crm.atualizadoEm).toLocaleString('pt-BR')}{Date.now()-Date.parse(crm.atualizadoEm)>3*3600000?' · carga atrasada':''}</p>}{!crm?<p>O CRM ainda não está disponível nesta consulta.</p>:!oportunidades.length?<p>Nenhuma oportunidade ativa vinculada a este cadastro na última carga.</p>:oportunidades.map(c=><article className="c360-item" key={c.id}><div><b>{c.titulo}</b><small>{c.fase} · {c.responsavel||'Responsável não localizado'}</small></div><span>{c.valor===null?'—':moeda(c.valor)}</span></article>)}
  {res?.cliente&&f.clienteId&&<AcoesMubisys clienteId={f.clienteId} cliente={alvo.cliente}/>}
  <h3>Vínculos com propostas</h3><p className="c360-coverage">Selecione a oportunidade do mesmo cadastro. O vínculo mostra a fase do Mubisys; não altera o ERP nem soma os valores.</p>
  {erroVinculo&&<p role="alert" className="c360-notice">{erroVinculo}</p>}
  {f.propostas.filter(o=>o.situacao==='aberto'||o.crmCardId).slice(0,limite).map(o=><label className="label block mb-3" key={o.id}>Proposta #{o.numero||o.id}<select className="input mt-1" aria-label={`Oportunidade da proposta ${o.numero||o.id}`} value={o.crmCardId||''} disabled={salvando||!crm} onChange={async e=>{setSalvando(true);setErroVinculo('');try{await aoVincular(o,e.target.value);}catch(err){setErroVinculo(err.message||'Não foi possível salvar o vínculo.');}finally{setSalvando(false);}}}><option value="">Sem vínculo · acompanhamento no painel</option>{o.crmCardId&&!oportunidades.some(c=>c.id===o.crmCardId)&&<option value={o.crmCardId}>Vínculo fora da última carga ativa</option>}{oportunidades.map(c=><option key={c.id} value={c.id}>{c.titulo} · {c.fase}</option>)}</select></label>)}
  <h3>Histórico de propostas</h3>{!f.propostas.length&&<p>Nenhuma proposta deste cadastro na base e no vendedor selecionados.</p>}{f.propostas.slice(0,limite).map(o=><button className="c360-item c360-proposta" key={o.id} onClick={()=>aoOrcamento(o)}><div><b>#{o.numero||o.id} · {o.trabalho||'Proposta'}</b><small>{dataCurta(o.dataEnvio||o.envio)} · {o.situacao==='ganho'?'Ganha':o.situacao==='perdido'?'Perdida':'Aberta'}{o.proximoToque&&` · retorno ${dataCurta(o.proximoToque)}`}</small></div><span>{moeda(o.valor)} <ArrowUpRight size={15}/></span></button>)}{f.propostas.length>limite&&<button className="btn-outline" onClick={()=>setLimite(n=>n+10)}>Ver mais propostas</button>}
 </section>;
}
