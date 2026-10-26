import {useState} from 'react';
import {CalendarDays} from 'lucide-react';
import JanelaFormulario from '../JanelaFormulario.jsx';
import ParticipantesReuniao from '../ParticipantesReuniao.jsx';
import {SETORES_REUNIAO} from '../../../supabase/functions/_shared/reunioes.mjs';
import {gerarDatasRecorrencia,selecionarAlvosSerie,conflitosReunioes} from '../../../supabase/functions/_shared/reunioes-recorrencia.mjs';
import ProgramacaoReuniao,{regraInicial} from './ProgramacaoReuniao.jsx';
import ResponsavelReuniao from './ResponsavelReuniao.jsx';
import AtaReuniao from './AtaReuniao.jsx';
import {usePessoasReunioes} from './pessoas.js';

export function CampoReuniao({titulo,children,amplo=false}){return <label className={amplo?'reu-amplo':''}><span>{titulo}</span>{children}</label>;}
const dia=s=>Date.parse(s+'T12:00:00Z'),DIA=86400000;
export function previsaoEditor(item,original,lista,recorrente,regra,escopo,agora=new Date().toISOString()){
 let datas=[item.data],alvos=[original],preservadas=0,candidatos=[];
 if(!original.versaoAnterior&&recorrente){datas=gerarDatasRecorrencia(item,regra);candidatos=datas.map((data,i)=>({...item,id:i?`${item.id}-previa-${i}`:item.id,data}));}
 else if(original.serieId&&escopo!=='esta'){
  ({alvos,preservadas}=selecionarAlvosSerie(original,lista,escopo,agora));alvos=[...alvos].sort((a,b)=>a.data.localeCompare(b.data)||a.inicio.localeCompare(b.inicio));
  const deslocamento=(dia(item.data)-dia(original.data))/DIA;
  candidatos=alvos.map(r=>{const c={...r,data:Number.isFinite(deslocamento)?new Date(dia(r.data)+deslocamento*DIA).toISOString().slice(0,10):r.data};for(const k of ['inicio','fim','situacao','responsavelRhId','participantes'])if(JSON.stringify(item[k])!==JSON.stringify(original[k]))c[k]=item[k];return c;});
  datas=candidatos.map(r=>r.data);
 }else candidatos=[item];
 return {datas,alvos,preservadas,conflitos:conflitosReunioes(candidatos,lista)};
}
export default function EditorReuniao({item,itens=[],aoFechar,aoSalvar,desatualizado}){
 const [f,setF]=useState(()=>structuredClone(item)),[listaBase]=useState(()=>structuredClone(itens)),[ocupado,setOcupado]=useState(false),[erro,setErro]=useState(''),[recorrente,setRecorrente]=useState(false),[regra,setRegra]=useState(()=>regraInicial(item.data)),[escopo,setEscopo]=useState('esta'),[confirmacao,setConfirmacao]=useState('');
 const catalogo=usePessoasReunioes(),grupo=!!item.serieId&&escopo!=='esta',novaSerie=!item.versaoAnterior&&recorrente;
 const mudar=campos=>setF(atual=>({...atual,...campos})),campo=k=>({value:f[k]||'',onChange:e=>mudar({[k]:e.target.value}),...(['data','inicio','fim'].includes(k)?{onInput:e=>mudar({[k]:e.currentTarget.value})}:{})});
 const decisao=(id,campos)=>setF(atual=>({...atual,decisoes:atual.decisoes.map(d=>d.id===id?{...d,...campos}:d)}));
 let previa={datas:[],alvos:[],preservadas:0,conflitos:[]},erroPrevia='';
 try{previa=previsaoEditor(f,item,listaBase,recorrente,regra,escopo);}catch(e){erroPrevia=e.message;}
 const assinatura=JSON.stringify({f,recorrente,regra,escopo}),confirmando=confirmacao===assinatura;
 async function salvar(e){e.preventDefault();setErro('');if(erroPrevia){setErro(erroPrevia);return;}if(grupo&&!previa.alvos.length){setErro('Nenhum encontro elegível. Escolha só este encontro para editar os seus registros.');return;}if((novaSerie||grupo)&&!confirmando){setConfirmacao(assinatura);return;}setOcupado(true);try{await aoSalvar(f,novaSerie?{recorrencia:regra}:grupo?{escopo,versoesAnteriores:Object.fromEntries(previa.alvos.map(r=>[r.id,r.versao]))}:{});}catch(e){setErro(e.message);}finally{setOcupado(false);}}
 return <JanelaFormulario titulo={item.versaoAnterior?'Editar encontro':'Novo encontro'} ocupado={ocupado} aoFechar={aoFechar} classe="reu-editor"><form onSubmit={salvar}><fieldset disabled={ocupado}>
 {desatualizado&&<p className="reu-alerta" role="status">Este encontro recebeu uma atualização. Seu rascunho continua aqui. Copie os ajustes que deseja manter e reabra a ficha para conferir a versão atual.</p>}
 <div className="reu-form"><CampoReuniao titulo="Título *" amplo><input required placeholder="Ex.: Alinhamento do PCP" maxLength={180} {...campo('titulo')}/></CampoReuniao>
 <CampoReuniao titulo="Data *"><input type="date" required {...campo('data')}/></CampoReuniao><div className="reu-horas"><CampoReuniao titulo="Início *"><input type="time" required {...campo('inicio')}/></CampoReuniao><CampoReuniao titulo="Fim *"><input type="time" required {...campo('fim')}/></CampoReuniao></div><ResponsavelReuniao valor={f} aoMudar={mudar} catalogo={catalogo} obrigatorio/><CampoReuniao titulo="Setor do encontro"><select {...campo('setor')}>{Object.entries(SETORES_REUNIAO).map(([k,n])=><option key={k} value={k}>{n}</option>)}</select></CampoReuniao></div>
 <details className="reu-opcoes-encontro"><summary><strong>Pauta, local e outras opções</strong><span>{f.tipo==='treinamento'?'Treinamento':'Reunião'} · {{agendado:'Agendado',realizado:'Realizado',cancelado:'Cancelado'}[f.situacao]||'Agendado'}{f.local?' · Local definido':''}{f.pauta?' · Com pauta':''}</span></summary><div className="reu-form">
 <CampoReuniao titulo="Local ou link da chamada" amplo><input maxLength={250} {...campo('local')}/></CampoReuniao><CampoReuniao titulo="Pauta e objetivo" amplo><textarea rows={3} maxLength={20000} {...campo('pauta')}/></CampoReuniao><CampoReuniao titulo="Tipo"><select {...campo('tipo')}><option value="reuniao">Reunião</option><option value="treinamento">Treinamento</option></select></CampoReuniao><CampoReuniao titulo="Situação"><select {...campo('situacao')}><option value="agendado">Agendado</option><option value="realizado" disabled={grupo||novaSerie}>Realizado</option><option value="cancelado" disabled={novaSerie}>Cancelado</option></select></CampoReuniao></div></details>
 <ProgramacaoReuniao item={f} recorrente={recorrente} aoRecorrente={setRecorrente} regra={regra} aoRegra={setRegra} datas={previa.datas} erro={erroPrevia} escopo={escopo} aoEscopo={setEscopo} alvos={previa.alvos} preservadas={previa.preservadas}/>
 <ParticipantesReuniao participantes={f.participantes} aoMudar={participantes=>mudar({participantes})} catalogo={catalogo} presencaEditavel={!grupo&&!novaSerie}/>
 {!!previa.conflitos.length&&<aside className="reu-alerta" role="status"><strong>{previa.conflitos.length} possível(is) conflito(s) de horário</strong><p>Há pessoas do RH convidadas para encontros no mesmo horário. Confira antes de salvar.</p><details><summary>Ver conflitos</summary><ul>{previa.conflitos.map((c,i)=><li key={i}>{c.data.split('-').reverse().join('/')} · {c.inicio}–{c.fim} · {c.titulo}</li>)}</ul></details></aside>}
 <p className="reu-calendario-info"><CalendarDays size={17}/>Os mesmos encontros aparecem no calendário da empresa. Cada ocorrência mantém seus próprios registros.</p>
 {grupo||novaSerie?<p className="reu-ajuda">Atas, presenças e encaminhamentos são registrados individualmente. Salve a programação e abra o encontro desejado.</p>:<><AtaReuniao item={f} aoMudar={mudar}/><details className="reu-editor-secao reu-encaminhamentos-editor" open={f.decisoes.length>0}><summary><strong>Encaminhamentos</strong><span>{f.decisoes.length}</span></summary>{f.decisoes.map((d,i)=><div className="reu-decisao-form" key={d.id}><CampoReuniao titulo={`Encaminhamento ${i+1}`} amplo><input required maxLength={2000} value={d.texto} onChange={e=>decisao(d.id,{texto:e.target.value})}/></CampoReuniao><ResponsavelReuniao valor={d} aoMudar={campos=>decisao(d.id,campos)} catalogo={catalogo} titulo={`Responsável pelo encaminhamento ${i+1}`}/><CampoReuniao titulo="Até quando"><input type="date" value={d.prazo||''} onInput={e=>decisao(d.id,{prazo:e.currentTarget.value})} onChange={e=>decisao(d.id,{prazo:e.target.value})}/></CampoReuniao><label className="reu-check"><input type="checkbox" checked={!!d.concluida} onChange={e=>decisao(d.id,{concluida:e.target.checked})}/>Concluído</label>{d.demandaId?<small>Demanda vinculada. A edição deste encaminhamento não altera a demanda.</small>:<button type="button" onClick={()=>mudar({decisoes:f.decisoes.filter(x=>x.id!==d.id)})}>Remover encaminhamento</button>}</div>)}<button type="button" className="btn-outline" disabled={f.decisoes.length>=100} onClick={()=>mudar({decisoes:[...f.decisoes,{id:crypto.randomUUID(),texto:'',responsavel:'',prazo:'',concluida:false}]})}>+ Encaminhamento</button><p className="reu-ajuda">Depois de salvar, use Criar demanda na ficha para encaminhar uma decisão. Essa ação exige acesso a Demandas.</p></details></>}
 {confirmando&&<div className="reu-confirmacao" role="status"><strong>{novaSerie?`Criar ${previa.datas.length} encontros?`:`${f.situacao==='cancelado'?'Cancelar':'Alterar'} ${previa.alvos.length} encontros?`}</strong><p>{novaSerie?'Confira as datas e os participantes acima.':`${previa.preservadas} encontro(s) com histórico ou fora do período serão preservados.`} A confirmação salva todo o grupo de uma vez.</p></div>}
 {erro&&<p role="alert" className="reu-erro">{erro}</p>}<footer className="reu-acoes"><button type="button" className="btn-outline" onClick={aoFechar}>Cancelar</button><button className="btn-primary" type="submit" disabled={!!erroPrevia||desatualizado}>{ocupado?'Salvando…':confirmando?'Confirmar e salvar':novaSerie?'Revisar criação da série':grupo?'Revisar alteração da série':'Salvar encontro'}</button></footer>
 </fieldset></form></JanelaFormulario>;
}
