import {useCallback,useEffect,useMemo,useState} from 'react';
import {Link} from 'react-router-dom';
import {Plus,Pencil,RefreshCw,Wrench} from 'lucide-react';
import JanelaFormulario from '../JanelaFormulario.jsx';
import PessoaRH from './PessoasRH.jsx';
import ContatoResponsavel,{ContatoLinks} from './ContatoResponsavel.jsx';
import {BemExplicito,HistoricoInformatica} from './InformaticaFisica.jsx';
import EstruturaLegada from './EstruturaLegada.jsx';
import BemDaFicha,{mandaBemId,trocarNaLista,conflitoDeVersao} from './BemDaFicha.jsx';
import FocoFicha,{useFocoFicha} from './FocoFicha.jsx';
import {listarEquipamentosPatrimonio} from '../../services/ativos.js';
import {salvarFisico} from '../../services/patrimonio-evolucao.js';
import {lerInfra} from '../../services/patrimonio-infra.js';
import {lerManutencoes} from '../../services/manutencoes.js';
import {podeAbrir} from '../../lib/sessao.js';
import {caminhoManutencao} from '../../lib/calc/navegacao-patrimonio.js';
import {idBemParaEdicao} from '../../lib/calc/informatica-patrimonio.js';
import {vinculoDoEquipamento} from '../../lib/calc/equipamentos-patrimonio.js';

const TIPOS=['Padrão de energia','Transformador','Usina fotovoltaica'];
const CAMPOS={
 'Padrão de energia':[['endereco','Endereço'],['unidadeConsumidora','Unidade consumidora'],['tensao','Tensão'],['potencia','Potência']],
 'Transformador':[['endereco','Endereço'],['kva','Capacidade (kVA)']],
 'Usina fotovoltaica':[['endereco','Endereço'],['potenciaInstalada','Potência instalada'],['placas','Placas'],['inversores','Inversores']],
};
const contatosDe=itens=>Object.entries(itens||{}).filter(([,x])=>x.tipo==='contato').map(([id,x])=>({...x,id}));
const vazio=()=>({cadastroId:crypto.randomUUID(),tipo:'predial',categoria:'Padrão de energia',nome:'',identificacao:'',responsavelId:'',bemId:'',especificacao:{local:'',setorId:'',situacao:'uso',unidadesConsumidoras:[]}});

export default function EletricaInfra({bens=[],setores=[],aoVerBem,aoMudarVinculo}){
 const podeManutencao=podeAbrir('manutencoes'),podeInventario=podeAbrir('inventario-valores');
 const [ativos,setAtivos]=useState(null),[todas,setTodas]=useState([]),[infra,setInfra]=useState(null),[erroInfra,setErroInfra]=useState(''),[mapa,setMapa]=useState(null),[erro,setErro]=useState(''),[erroMapa,setErroMapa]=useState(''),[mensagem,setMensagem]=useState(''),[form,setForm]=useState(null),[ocupado,setOcupado]=useState(false),[conflito,setConflito]=useState(false),[aba,setAba]=useState('todos'),[legadoAberto,setLegadoAberto]=useState(false);
 const carregar=useCallback(async()=>{setErro('');setErroInfra('');try{const [lista,rede]=await Promise.all([listarEquipamentosPatrimonio(),lerInfra().catch(e=>{setErroInfra(e.message);return null;})]);setTodas(lista);setAtivos(lista.filter(x=>x.tipo==='predial'&&TIPOS.includes(x.categoria)));setInfra(rede);}catch(e){setErro(e.message);}if(podeManutencao){try{setMapa(await lerManutencoes());setErroMapa('');}catch(e){setErroMapa(e.message);}}},[podeManutencao]);
 useEffect(()=>{carregar();},[carregar]);
 const contatos=useMemo(()=>contatosDe(infra?.itens),[infra]);
 // A ficha pedida que não é desta lista é uma instalação anterior: abre o bloco delas.
 const foco=useFocoFicha(ativos),legadoPedido=!!foco.pedido&&!!ativos&&!foco.id;
 useEffect(()=>{if(legadoPedido)setLegadoAberto(true);},[legadoPedido]);
 const padroes=useMemo(()=>(ativos||[]).filter(x=>x.categoria==='Padrão de energia'),[ativos]);
 const padroesAtivos=useMemo(()=>padroes.filter(x=>x.especificacao?.situacao!=='baixado'),[padroes]);
 const lista=useMemo(()=>(ativos||[]).filter(x=>(!foco.id||x.id===foco.id)&&(aba==='todos'||x.categoria===aba)).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')),[ativos,aba,foco.id]);
 const abrir=item=>{setErro('');setMensagem('');setConflito(false);setForm(item?{...item,bemId:idBemParaEdicao(item,bens),especificacao:{...item.especificacao,unidadesConsumidoras:Array.isArray(item.especificacao?.unidadesConsumidoras)?[...item.especificacao.unidadesConsumidoras]:item.especificacao?.unidadesConsumidoras}}:vazio());};
 const campo=chave=>e=>setForm(v=>({...v,[chave]:e.target.value}));
 const especificacao=chave=>e=>setForm(v=>({...v,especificacao:{...v.especificacao,[chave]:e.target.value}}));
 const alterarCategoria=e=>setForm(v=>({...v,categoria:e.target.value,especificacao:{local:v.especificacao?.local||'',setorId:v.especificacao?.setorId||'',situacao:v.especificacao?.situacao||'uso',unidadesConsumidoras:[]}}));
 const alternarPadrao=id=>setForm(v=>{const anteriores=Array.isArray(v.especificacao?.unidadesConsumidoras)?v.especificacao.unidadesConsumidoras:[];return {...v,especificacao:{...v.especificacao,unidadesConsumidoras:anteriores.includes(id)?anteriores.filter(x=>x!==id):[...anteriores,id]}};});
 const desfeito=r=>{if(r?.ficha){setAtivos(v=>trocarNaLista(v||[],r.ficha));setTodas(v=>trocarNaLista(v,r.ficha));setForm(f=>f&&f.id===r.ficha.id?{...f,atualizadoEm:r.ficha.atualizadoEm,bemId:r.ficha.bemId||''}:f);}aoMudarVinculo?.();};
 async function salvar(e){e.preventDefault();if(ocupado||conflito)return;setErro('');setOcupado(true);try{
  const spec={local:form.especificacao?.local||'',setorId:form.especificacao?.setorId||'',situacao:form.especificacao?.situacao||'',tecnicoId:form.especificacao?.tecnicoId||''};
  for(const [chave] of CAMPOS[form.categoria])spec[chave]=form.especificacao?.[chave]||'';
  if(form.categoria==='Usina fotovoltaica'&&Array.isArray(form.especificacao?.unidadesConsumidoras))spec.unidadesConsumidoras=form.especificacao.unidadesConsumidoras;
  const item={...(form.id?{id:form.id}:{cadastroId:form.cadastroId}),tipo:'predial',categoria:form.categoria,nome:form.nome,identificacao:form.identificacao||'',responsavelId:form.responsavelId||'',especificacao:spec};
  const salva=(ativos||[]).find(x=>x.id===form.id)||null;
  if(podeInventario&&mandaBemId(salva,bens))item.bemId=form.bemId||'';
  const novo=await salvarFisico(item,form.id?form.atualizadoEm:null);
  setAtivos(v=>trocarNaLista(v||[],novo));setTodas(v=>trocarNaLista(v,novo));setForm(null);setMensagem('Instalação elétrica salva.');
  if(item.bemId!==undefined&&item.bemId!==(salva?.bemId||''))aoMudarVinculo?.();
 }catch(e){setErro(e.message);if(conflitoDeVersao(e))setConflito(true);}finally{setOcupado(false);}}
 return <section className="infra-content" aria-label="Parte elétrica"><header className="infra-heading"><div><h2>Parte elétrica</h2><p>Padrões de energia, transformadores, usinas e instalações já cadastradas.</p></div><div className="pat-actions"><button className="btn-ghost" onClick={carregar} aria-label="Atualizar parte elétrica"><RefreshCw size={16}/></button><button className="btn-primary" disabled={!ativos} onClick={()=>abrir(null)}><Plus size={16}/>Nova instalação</button></div></header>
 {erro&&!form&&<p role="alert" className="pat-notice is-error">{erro}</p>}{mensagem&&<p role="status">{mensagem}</p>}{erroInfra&&<p role="alert" className="pat-notice is-error">Contatos indisponíveis: {erroInfra}</p>}<FocoFicha foco={foco}/>
 {!ativos?<p role="status">{erro?'Dados indisponíveis.':'Carregando instalações…'}</p>:<><nav className="infra-filtros" aria-label="Tipos de instalação"><button className="btn-outline" aria-pressed={aba==='todos'} onClick={()=>setAba('todos')}>Todos</button>{TIPOS.map(tipo=><button className="btn-outline" key={tipo} aria-pressed={aba===tipo} onClick={()=>setAba(tipo)}>{tipo}</button>)}</nav>{!lista.length?<div className="infra-empty"><h3>{aba==='todos'?'Nenhuma instalação cadastrada':'Nenhuma instalação deste tipo'}</h3><p>Cadastre uma instalação e escolha o técnico responsável.</p></div>:<div className="infra-cards">{lista.map(item=>{const e=item.especificacao||{},contato=contatos.find(c=>c.id===e.tecnicoId);return <article className="infra-card" key={item.id}><header><div><small>{item.categoria}</small><h3>{item.nome}</h3></div><button className="btn-ghost" onClick={()=>abrir(item)} aria-label={`Editar ${item.nome}`}><Pencil size={16}/></button></header><p>{item.identificacao||'Sem identificação'} · {e.endereco||e.local||'Endereço pendente'}</p><dl>{CAMPOS[item.categoria].filter(([chave])=>chave!=='endereco').map(([chave,rotulo])=><div key={chave}><dt>{rotulo}</dt><dd>{e[chave]||'Não informado'}</dd></div>)}{item.categoria==='Usina fotovoltaica'&&<div><dt>Unidades consumidoras</dt><dd>{Array.isArray(e.unidadesConsumidoras)&&e.unidadesConsumidoras.length?e.unidadesConsumidoras.map(id=>padroes.find(x=>x.id===id)?.nome||'Padrão anterior a conferir').join(' · '):e.unidadesConsumidoras?'Padrões anteriores a conferir':'Nenhuma vinculada'}</dd></div>}</dl><BemExplicito item={item} bens={bens}/><details><summary>Técnico responsável</summary>{contato?<ContatoLinks contato={contato}/>:<p>{e.tecnicoId?(erroInfra?'Técnico vinculado; contatos indisponíveis.':'Técnico anterior a conferir.'):'Não informado.'}</p>}</details>{podeManutencao&&<><HistoricoInformatica item={item} mapa={mapa} erro={erroMapa} bens={bens} mostrarAlerta={false}/><div className="infra-actions"><Link className="btn-outline" to={caminhoManutencao({item:item.id,familia:'predial',aba:'historico'})}>Ver histórico</Link><Link className="btn-outline" to={caminhoManutencao({item:item.id,familia:'predial',lancar:true})}><Wrench size={15}/>Lançar serviço</Link></div></>}{aoVerBem&&vinculoDoEquipamento(item,bens).vinculo==='vinculado'&&<button className="btn-ghost" onClick={()=>aoVerBem(vinculoDoEquipamento(item,bens).bem)}>Ver bem do inventário</button>}</article>;})}</div>}</>}
 <details className="infra-legado" open={legadoAberto} onToggle={e=>setLegadoAberto(e.currentTarget.open)}><summary>Instalações elétricas anteriores (Elétrica e Iluminação)</summary>{legadoAberto&&<EstruturaLegada modo="eletrica" bens={bens} setores={setores} aoVerBem={aoVerBem} aoMudarVinculo={aoMudarVinculo}/>}</details>
 {form&&<JanelaFormulario titulo={form.id?'Editar instalação elétrica':'Nova instalação elétrica'} ocupado={ocupado} aoFechar={()=>{if(!ocupado){setForm(null);setErro('');}}}><form className="infra-form" onSubmit={salvar}>{erro&&<p role="alert" className="pat-notice is-error">{erro}</p>}{conflito&&<p>Esta ficha mudou. Seu preenchimento foi preservado; atualize a lista antes de editar novamente.</p>}<fieldset disabled={ocupado||conflito}>
  <label>Tipo<select className="input" disabled={!!form.id} value={form.categoria} onChange={alterarCategoria}>{TIPOS.map(tipo=><option key={tipo}>{tipo}</option>)}</select></label>
  <label>Nome da instalação *<input className="input" required maxLength={180} value={form.nome||''} onChange={campo('nome')}/></label>
  <label>Identificação interna<input className="input" maxLength={120} value={form.identificacao||''} onChange={campo('identificacao')}/></label>
  <label>Local<input className="input" maxLength={180} value={form.especificacao?.local||''} onChange={especificacao('local')}/></label>
  <label>Setor<select className="input" value={form.especificacao?.setorId||''} onChange={especificacao('setorId')}><option value="">Não informado</option>{form.especificacao?.setorId&&!setores.some(s=>s.id===form.especificacao.setorId)&&<option value={form.especificacao.setorId}>Setor anterior a conferir</option>}{setores.map(s=><option key={s.id} value={s.id}>{s.nome}</option>)}</select></label>
  <label>Situação<select className="input" value={form.especificacao?.situacao||''} onChange={especificacao('situacao')}><option value="">Não informada</option><option value="uso">Em uso</option><option value="reserva">Reserva</option><option value="conserto">Em conserto</option><option value="baixado">Baixado</option></select></label>
  {CAMPOS[form.categoria].map(([chave,rotulo])=><label key={chave}>{rotulo}<input className="input" maxLength={chave==='endereco'?180:180} value={form.especificacao?.[chave]||''} onChange={especificacao(chave)}/></label>)}
  {form.categoria==='Usina fotovoltaica'&&<fieldset className="infra-unidades"><legend>Padrões de energia atendidos</legend>{padroesAtivos.length?padroesAtivos.map(item=><label key={item.id}><input type="checkbox" checked={Array.isArray(form.especificacao?.unidadesConsumidoras)&&form.especificacao.unidadesConsumidoras.includes(item.id)} onChange={()=>alternarPadrao(item.id)}/>{item.nome}{item.especificacao?.unidadeConsumidora?` · UC ${item.especificacao.unidadeConsumidora}`:''}</label>):<p>Cadastre primeiro um padrão de energia ativo para fazer o vínculo.</p>}{(Array.isArray(form.especificacao?.unidadesConsumidoras)?form.especificacao.unidadesConsumidoras:[]).filter(id=>!padroesAtivos.some(x=>x.id===id)).map(id=><p key={id}>Padrão anterior ou baixado a conferir: {padroes.find(x=>x.id===id)?.nome||id}</p>)}</fieldset>}
  <ContatoResponsavel valor={form.especificacao?.tecnicoId||''} contatos={contatos} contatosIndisponiveis={!!erroInfra} aoMudar={id=>setForm(v=>({...v,especificacao:{...v.especificacao,tecnicoId:id}}))} aoContatoSalvo={contato=>setInfra(v=>({...v,itens:{...(v?.itens||{}),[contato.id]:contato}}))} rotulo="Técnico responsável"/>
  <PessoaRH rotulo="Responsável interno no RH" valor={form.responsavelId||''} nome={form.responsavel||''} aoMudar={(responsavelId,responsavel)=>setForm(v=>({...v,responsavelId,responsavel}))}/>
  {podeInventario&&<BemDaFicha ficha={(ativos||[]).find(x=>x.id===form.id)||null} valor={form.bemId||''} aoMudar={id=>setForm(v=>({...v,bemId:id}))} bens={bens} fichas={todas} aoVerBem={aoVerBem?b=>{setForm(null);aoVerBem(b);}:undefined} aoDesfeito={desfeito}/>}
 </fieldset><div className="infra-actions"><button className="btn-primary" disabled={ocupado||conflito}>Salvar instalação</button><button type="button" className="btn-ghost" onClick={()=>setForm(null)} disabled={ocupado}>Cancelar</button></div></form></JanelaFormulario>}
 </section>;
}
