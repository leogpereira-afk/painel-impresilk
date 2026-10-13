import PessoaRH,{usePessoasRH,comNomeRH} from './PessoasRH.jsx';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Plus, Pencil, Trash2, Printer, Search, RefreshCw, ChevronLeft, ChevronRight, Smartphone, Phone, Archive, Wrench, BedDouble, List, UserCheck, CircleCheck, X, Check, Package, Link2} from 'lucide-react';
import {lerControles,salvarControle,removerControle} from '../../services/patrimonio.js';
import JanelaFormulario from '../JanelaFormulario.jsx';
import AcervoCaixa, {ResumoConferenciaCaixa} from './AcervoCaixa.jsx';
import {CONTROLES, listarControles, resumirControles, temResponsavel, textoAtualizacao, nomeSemId, semIdDoRH} from '../../lib/calc/controles-patrimonio.js';
import {rotuloPessoa, sugerirPessoa, MOTIVO_SEM_SUGESTAO} from '../../lib/calc/pessoas-rh.js';
import './controles.css';

const ICONES={celulares:Smartphone,ramais:Phone,armarios:Archive,ferramentas:Wrench,camas:BedDouble};
const POR_PAGINA=15;

export function AtualizacaoPatrimonio({registro}) {
 return <small className="pat-updated">{textoAtualizacao(registro)}</small>;
}

export default function ControlesPatrimonio({tipo}) {
 const {pessoas}=usePessoasRH();
 const meta=CONTROLES[tipo], Icone=ICONES[tipo];
 const [mapa,setMapa]=useState(null), [erro,setErro]=useState(''), [mensagem,setMensagem]=useState('');
 const [busca,setBusca]=useState(''), [situacao,setSituacao]=useState('todos'), [pagina,setPagina]=useState(1);
 const [form,setForm]=useState(null), [ocupado,setOcupado]=useState(false), [carregando,setCarregando]=useState(false), [relatorio,setRelatorio]=useState(null);
 const [caixaId,setCaixaId]=useState(null);
 const [vinculos,setVinculos]=useState(null);
 const pedido=useRef(0);
 const semResponsavel=tipo==='ramais'?'Sem pessoa / local':'Disponível';
 const filtros=[
  {id:'todos',rotulo:'Todos',campo:'total',icone:List},
  {id:'atribuidos',rotulo:tipo==='ramais'?'Com pessoa / local':'Com responsável',campo:'atribuidos',icone:UserCheck},
  {id:'disponiveis',rotulo:tipo==='ramais'?'Sem pessoa / local':'Disponíveis',campo:'disponiveis',icone:CircleCheck},
 ];
 const tituloNumero=tipo==='celulares'?'Número do telefone':'Número';

 async function carregar(){
  const n=++pedido.current;
  setCarregando(true);setErro('');
  try{const dados=await lerControles();if(n===pedido.current)setMapa(dados);}
  catch(e){if(n===pedido.current)setErro(e.message);}
  finally{if(n===pedido.current)setCarregando(false);}
 }
 useEffect(()=>{carregar();const ref=pedido;return()=>{ref.current++;};},[]);
 const mapaComRH=useMemo(()=>Object.fromEntries(Object.entries(mapa||{}).map(([id,r])=>[id,comNomeRH(r,pessoas,'pessoa')])),[mapa,pessoas]);
 const resumo=useMemo(()=>resumirControles(mapaComRH,tipo),[mapaComRH,tipo]);
 const lista=useMemo(()=>listarControles(mapaComRH,tipo,busca,situacao),[mapaComRH,tipo,busca,situacao]);
 // Nome digitado antes do vínculo pelo RH: a tela converte para o vínculo pelo ID, com confirmação.
 const pendentesId=useMemo(()=>semIdDoRH(mapa,tipo),[mapa,tipo]);
 const pessoasAtivas=pessoas.filter(p=>p.disponivel);
 const paginas=Math.max(1,Math.ceil(lista.length/POR_PAGINA)), atual=Math.min(pagina,paginas);
 const recorte=lista.slice((atual-1)*POR_PAGINA,atual*POR_PAGINA);
 const comFiltro=Boolean(busca.trim())||situacao!=='todos';
 const limparFiltros=()=>{setBusca('');setSituacao('todos');setPagina(1);};
 const abrir=r=>{
  setErro('');setMensagem('');
  setForm(r?{...r}:{id:crypto.randomUUID(),tipo,numero:'',modelo:'',telefone:'',pessoa:'',observacao:'',atualizadoEm:null});
 };
 const fechar=()=>{setForm(null);setErro('');};
 async function salvar(e){
  e.preventDefault();setOcupado(true);setErro('');
  try{
   setMapa(await salvarControle(form.id,{tipo,numero:form.numero,modelo:form.modelo,telefone:form.telefone,pessoa:form.pessoa,pessoaId:form.pessoaId||'',local:form.local||'',observacao:form.observacao},form.atualizadoEm??null));
   if(tipo==='ferramentas'&&!form.atualizadoEm)setCaixaId(form.id);
   setForm(null);setMensagem('Cadastro salvo.');
  }catch(e){
   if(e.status===409){
    try{const dados=await lerControles();setMapa(dados);setForm(f=>f?{...f,atualizadoEm:dados[f.id]?.atualizadoEm??null}:f);setErro('Este cadastro foi alterado por outra pessoa. Os dados foram atualizados e seu preenchimento foi preservado. Confira as informações antes de salvar novamente.');}
    catch{setErro('Este cadastro foi alterado por outra pessoa. Não foi possível atualizar os dados; seu preenchimento foi preservado. Tente salvar novamente.');}
   }else setErro(e.message);
  }finally{setOcupado(false);}
 }
 async function remover(r){
  if(!window.confirm(`Remover ${meta.singular.toLowerCase()} ${r.numero}?`))return;
  setOcupado(true);setErro('');setMensagem('');
  try{
   await removerControle(r.id);
   setMapa(m=>{const copia={...m};delete copia[r.id];return copia;});
   setMensagem('Cadastro removido.');
  }catch(e){setErro(e.message);}finally{setOcupado(false);}
 }
 const abrirVinculos=()=>{
  setErro('');setMensagem('');
  setVinculos({erro:'',linhas:pendentesId.map(r=>{const s=sugerirPessoa(r.pessoa,pessoas);return {id:r.id,numero:r.numero,nomeAntigo:r.pessoa,local:r.local||'',escolha:s.pessoa?.id||'',sugestao:s.pessoa?.id||'',motivo:s.motivo,erro:''};})});
 };
 // Grava um por um pelo mesmo caminho do formulário: o servidor confere a pessoa no RH e grava o ID da empresa.
 // Embaixo de cada seletor, o ID da empresa de quem foi escolhido: é por ele que se confere.
 const textoEscolha=l=>{
  const p=pessoasAtivas.find(x=>x.id===l.escolha);
  if(p)return `${p.idPessoa?'ID '+p.idPessoa:'Sem ID da empresa no RH'}${l.escolha===l.sugestao?' · sugestão pelo nome, confira':''}`;
  if(l.escolha==='__local__')return 'Vai para Local de atendimento.';
  return MOTIVO_SEM_SUGESTAO[l.motivo]||'';
 };
 async function salvarVinculos(){
  if(!vinculos)return;
  setOcupado(true);setMensagem('');
  let atual=mapa,feitos=0;const falhas={};
  for(const l of vinculos.linhas){
   if(!l.escolha)continue;
   const r=atual?.[l.id];
   if(!r||!nomeSemId(r)){falhas[l.id]='Este cadastro mudou. Feche e abra de novo.';continue;}
   const pessoa=l.escolha==='__local__'?null:pessoas.find(p=>p.id===l.escolha&&p.disponivel);
   if(l.escolha!=='__local__'&&!pessoa){falhas[l.id]='Pessoa indisponível no RH.';continue;}
   const campos={tipo,numero:r.numero,modelo:r.modelo||'',telefone:r.telefone||'',observacao:r.observacao||'',
    ...(pessoa?{pessoaId:pessoa.id,pessoa:pessoa.nome,local:r.local||''}:{pessoaId:'',pessoa:'',local:r.pessoa})};
   try{atual=await salvarControle(l.id,campos,r.atualizadoEm??null);feitos++;}
   catch(e){falhas[l.id]=e.message;}
  }
  if(atual!==mapa)setMapa(atual);
  setOcupado(false);
  if(feitos)setMensagem(`${feitos} ${feitos===1?'vínculo gravado':'vínculos gravados'} pelo ID do RH.`);
  const quantasFalhas=Object.keys(falhas).length;
  if(!quantasFalhas)setVinculos(null);
  else setVinculos(v=>({erro:`${quantasFalhas} ${quantasFalhas===1?'cadastro não foi gravado':'cadastros não foram gravados'}. Veja o motivo na linha.`,linhas:v.linhas.filter(l=>!l.escolha||falhas[l.id]).map(l=>({...l,erro:falhas[l.id]||''}))}));
 }
 const campo=nome=>e=>setForm(f=>({...f,[nome]:e.target.value}));
 const abrirRelatorio=()=>setRelatorio({
  itens:lista,busca:busca.trim(),filtro:filtros.find(f=>f.id===situacao).rotulo,
  em:new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}),
 });

 if(relatorio)return <div className="pat-print pat-controle-relatorio">
  <div className="sem-impressao pat-print-toolbar">
   <button className="btn-ghost" onClick={()=>setRelatorio(null)}><ChevronLeft size={18}/>Voltar</button>
   <button className="btn-primary" onClick={()=>window.print()}><Printer size={18}/>Imprimir / salvar PDF</button>
   <p>Escolha “Salvar como PDF” na impressão. O relatório inclui todos os registros do filtro e da busca, não apenas a página atual.</p>
  </div>
  <header className="pat-report-title"><span>IMPRESILK · PATRIMÔNIO</span><h1>{meta.titulo}</h1><p>{relatorio.itens.length} registros · Emitido em {relatorio.em}</p><p>Filtro: {relatorio.filtro}{relatorio.busca?` · Busca: ${relatorio.busca}`:''}</p></header>
  <table className="pat-table pat-controles-table"><thead><tr><th>{tituloNumero}</th>{tipo==='celulares'&&<th>Modelo</th>}{tipo==='ramais'&&<th>Telefone</th>}<th>{meta.pessoa}</th>{tipo==='ferramentas'&&<th>Última / próxima conferência</th>}<th>Observações</th><th>Última atualização</th></tr></thead>
   <tbody>{relatorio.itens.map(r=><tr key={r.id}><td>{r.numero}</td>{tipo==='celulares'&&<td>{r.modelo}</td>}{tipo==='ramais'&&<td>{r.telefone||'—'}</td>}<td>{[r.local,r.pessoa].filter(Boolean).join(' · ')||semResponsavel}{r.pessoaIdPessoa?` · ID ${r.pessoaIdPessoa}`:''}{nomeSemId(r)?' · sem ID do RH':''}</td>{tipo==='ferramentas'&&<td><ResumoConferenciaCaixa registro={r}/></td>}<td>{r.observacao||'—'}</td><td>{textoAtualizacao(r)}</td></tr>)}</tbody>
  </table>
 </div>;

 if(tipo==='ferramentas'&&caixaId&&mapa?.[caixaId])return <AcervoCaixa registro={{...mapa[caixaId],id:caixaId}} atualizarControles={setMapa} aoVoltar={()=>{setCaixaId(null);setMensagem('');}}/>;

 return <section className={`pat-controles pat-controles-polished${tipo==='ferramentas'?' pat-controles-caixas':''}`} aria-label={meta.titulo}>
  <div className="pat-list-heading">
   <div className="pat-control-title"><span className="pat-control-icon" aria-hidden="true"><Icone size={24}/></span><div><h2>{meta.titulo}</h2><p>{tipo==='ferramentas'?'Acervo de cada caixa, entregas às pessoas e conferência mensal.':meta.descricao}</p></div></div>
   <div className="pat-actions">
    <button className="btn-ghost pat-control-refresh" onClick={carregar} disabled={carregando||ocupado} aria-label={`Atualizar ${meta.titulo}`} title="Atualizar cadastros"><RefreshCw size={17}/></button>
    <button className="btn-outline" disabled={!lista.length||ocupado||!!erro} onClick={abrirRelatorio}><Printer size={17}/>Salvar PDF</button>
    <button className="btn-primary" disabled={mapa===null||ocupado} onClick={()=>abrir()}><Plus size={17}/>{meta.novo}</button>
   </div>
  </div>
  <div className="pat-control-tools">
   <div className="pat-control-summary" role="group" aria-label="Filtrar por responsável">
    {filtros.map(({id,rotulo,campo:chave,icone:IconeFiltro})=><button key={id} type="button" aria-pressed={situacao===id} onClick={()=>{setSituacao(id);setPagina(1);}}><IconeFiltro size={17} aria-hidden="true"/><span>{rotulo}</span><strong>{mapa===null?'—':resumo[chave]}</strong></button>)}
   </div>
   <label className="pat-search pat-control-search"><Search size={18} aria-hidden="true"/><input className="input" aria-label={`Buscar em ${meta.titulo}`} placeholder={tipo==='celulares'?'Número, modelo ou pessoa…':'Número, nome ou observação…'} value={busca} onChange={e=>{setBusca(e.target.value);setPagina(1);}}/>{busca&&<button type="button" aria-label="Limpar busca" onClick={()=>{setBusca('');setPagina(1);}}><X size={16}/></button>}</label>
  </div>
  <div className="pat-control-result" aria-live="polite"><span>{mapa===null?'Preparando cadastros…':`${lista.length} ${lista.length===1?'cadastro encontrado':'cadastros encontrados'}`}{comFiltro&&' neste filtro'}</span>{comFiltro&&<button type="button" onClick={limparFiltros}>Limpar filtros</button>}</div>
  {erro&&!form&&<p className="pat-notice is-error" role="alert">{erro}<button className="btn-ghost" onClick={carregar}>Tentar novamente</button></p>}
  {mensagem&&<p role="status" className="pat-control-feedback"><Check size={16}/>{mensagem}</p>}
  {mapa!==null&&pendentesId.length>0&&<div className="pat-control-pendente" role="note"><span><strong>{pendentesId.length}</strong> {pendentesId.length===1?'cadastro está':'cadastros estão'} só com o nome digitado, sem o ID do RH.</span><button type="button" className="btn-outline" disabled={ocupado||!pessoasAtivas.length} onClick={abrirVinculos}><Link2 size={16}/>Vincular pelo ID</button></div>}
  {mapa===null?<p role="status">{carregando?'Carregando cadastros…':'Cadastros indisponíveis.'}</p>:!lista.length?<div className="pat-empty"><Icone size={30}/><h3>{comFiltro?'Nenhum cadastro encontrado':'Tudo começa pelo primeiro cadastro'}</h3><p>{comFiltro?'Experimente outro número, nome ou situação.':`Organize ${meta.titulo.toLowerCase()} e acompanhe quem está responsável por cada um.`}</p>{comFiltro?<button className="btn-outline" onClick={limparFiltros}>Ver todos os cadastros</button>:<button className="btn-outline" disabled={ocupado} onClick={()=>abrir()}><Plus size={16}/>{meta.novo}</button>}</div>:<>
   <div className="pat-table-wrap"><table className="pat-table pat-controles-table"><thead><tr><th>{tituloNumero}</th>{tipo==='celulares'&&<th>Modelo</th>}{tipo==='ramais'&&<th>Telefone</th>}<th>{meta.pessoa}</th>{tipo==='ferramentas'&&<th>Última / próxima conferência</th>}<th>Observação / atualização</th><th className="sem-impressao">Ações</th></tr></thead>
    <tbody>{recorte.map(r=><tr key={r.id}>
     <td data-label={tituloNumero}>{tipo==='ferramentas'?<button className="pat-caixa-open" onClick={()=>setCaixaId(r.id)} aria-label={`Abrir acervo da caixa ${r.numero}`}><strong className="pat-control-number">{r.numero}</strong><small>{(r.acervo||[]).filter(i=>!i.arquivado).length} tipos de itens</small></button>:<strong className="pat-control-number">{r.numero}</strong>}</td>
     {tipo==='celulares'&&<td data-label="Modelo">{r.modelo}</td>}{tipo==='ramais'&&<td data-label="Telefone">{r.telefone||'—'}</td>}
     <td data-label={meta.pessoa}>{temResponsavel(r)?<span className="pat-control-person"><UserCheck size={15} aria-hidden="true"/><span>{[r.local,r.pessoa].filter(Boolean).join(' · ')}{r.pessoaIdPessoa&&<small className="pat-control-id">ID {r.pessoaIdPessoa}</small>}{nomeSemId(r)&&<small className="pat-control-sem-id">sem ID do RH</small>}</span></span>:<span className="pat-control-available">{semResponsavel}</span>}</td>
     {tipo==='ferramentas'&&<td data-label="Última / próxima conferência"><ResumoConferenciaCaixa registro={r}/></td>}
     <td data-label="Observação / atualização">{r.observacao&&<span className="pat-control-note">{r.observacao}</span>}<AtualizacaoPatrimonio registro={r}/></td>
     <td data-label="Ações"><div className="pat-actions">{tipo==='ferramentas'&&<button className="btn-outline" disabled={ocupado} onClick={()=>setCaixaId(r.id)} aria-label={`Abrir acervo da caixa ${r.numero}`}><Package size={16}/>Acervo</button>}<button className="btn-ghost" disabled={ocupado} onClick={()=>abrir(r)} aria-label={`Editar ${meta.singular} ${r.numero}`}><Pencil size={16}/>Editar</button><button className="btn-ghost pat-control-remove" disabled={ocupado} onClick={()=>remover(r)} aria-label={`Remover ${meta.singular} ${r.numero}`} title="Remover cadastro"><Trash2 size={16}/></button></div></td>
    </tr>)}</tbody>
   </table></div>
   <div className="pat-pagination"><span>{(atual-1)*POR_PAGINA+1}–{Math.min(atual*POR_PAGINA,lista.length)} de {lista.length}</span><div><button className="btn-outline" aria-label="Página anterior" disabled={atual===1} onClick={()=>setPagina(atual-1)}><ChevronLeft size={18}/></button><span>{atual} / {paginas}</span><button className="btn-outline" aria-label="Próxima página" disabled={atual===paginas} onClick={()=>setPagina(atual+1)}><ChevronRight size={18}/></button></div></div>
  </>}
  {vinculos&&<JanelaFormulario titulo="Vincular pelo ID do RH" ocupado={ocupado} aoFechar={()=>{if(!ocupado)setVinculos(null);}}>
   <div className="pat-control-vinculos">
    <p className="pat-control-form-help">Cada nome digitado vira o vínculo com a ficha do RH, gravado pelo ID da empresa. A sugestão aparece só quando uma única pessoa ativa tem esse nome: confira antes de salvar. Linha em “Deixar como está” não muda.</p>
    {vinculos.erro&&<p className="pat-notice is-error" role="alert">{vinculos.erro}</p>}
    <div className="pat-table-wrap"><table className="pat-table pat-controles-table"><thead><tr><th>{tituloNumero}</th><th>Nome digitado</th><th>Pessoa no RH</th></tr></thead>
     <tbody>{vinculos.linhas.map(l=><tr key={l.id}>
      <td data-label={tituloNumero}><strong className="pat-control-number">{l.numero}</strong></td>
      <td data-label="Nome digitado">{l.nomeAntigo}</td>
      <td data-label="Pessoa no RH"><select className="input" aria-label={`Pessoa do RH para ${meta.singular.toLowerCase()} ${l.numero}`} value={l.escolha} disabled={ocupado} onChange={e=>{const v=e.target.value;setVinculos(x=>({...x,linhas:x.linhas.map(y=>y.id===l.id?{...y,escolha:v,erro:''}:y)}));}}>
        <option value="">Deixar como está</option>
        {tipo==='ramais'&&!l.local&&<option value="__local__">É um local: mover para Local de atendimento</option>}
        {pessoasAtivas.map(p=><option key={p.id} value={p.id}>{rotuloPessoa(p)}</option>)}
       </select>
       <small className={l.erro?'pat-control-erro':undefined}>{l.erro||textoEscolha(l)}</small></td>
     </tr>)}</tbody>
    </table></div>
    <div className="pat-form-footer pat-actions"><button type="button" className="btn-primary" disabled={ocupado||!vinculos.linhas.some(l=>l.escolha)} onClick={salvarVinculos}>{ocupado?'Salvando…':`Salvar ${vinculos.linhas.filter(l=>l.escolha).length} ${vinculos.linhas.filter(l=>l.escolha).length===1?'vínculo':'vínculos'}`}</button><button type="button" className="btn-ghost" disabled={ocupado} onClick={()=>setVinculos(null)}>Fechar</button></div>
   </div>
  </JanelaFormulario>}
  {form&&<JanelaFormulario titulo={form.atualizadoEm?`Editar ${meta.singular.toLowerCase()} ${form.numero}`:meta.novo} ocupado={ocupado} aoFechar={fechar}>
   <form className="pat-form pat-control-form" onSubmit={salvar}>
    <p className="pat-control-form-help">{tipo==='celulares'?'Identifique o aparelho e quem está com ele.':`Mantenha o número e a pessoa responsável sempre atualizados.`}</p>
    {erro&&<p className="pat-notice is-error" role="alert">{erro}</p>}
    <fieldset disabled={ocupado} className="pat-control-fields">
     <label className="label">{tituloNumero}<input className="input" required type={tipo==='celulares'?'tel':'text'} inputMode={tipo==='celulares'?'tel':'numeric'} pattern={tipo==='celulares'?undefined:'[0-9]{1,12}'} maxLength={tipo==='celulares'?40:12} placeholder={tipo==='celulares'?'(38) 99999-0000':'Ex.: 01'} value={form.numero} onChange={campo('numero')}/></label>
     {tipo==='celulares'&&<label className="label">Modelo<input className="input" required maxLength={120} placeholder="Marca e modelo do aparelho" value={form.modelo||''} onChange={campo('modelo')}/></label>}
     {tipo==='ramais'&&<label className="label">Telefone do ramal (opcional)<input className="input" type="tel" maxLength={40} value={form.telefone} onChange={campo('telefone')}/></label>}
     <PessoaRH rotulo={tipo==='ramais'?'Pessoa responsável':meta.pessoa} valor={form.pessoaId||''} nome={form.pessoa||''} aoMudar={(pessoaId,pessoa)=>setForm(f=>({...f,pessoaId,pessoa}))}/>
     {tipo==='ramais'&&<label className="label">Local de atendimento (opcional)<input className="input" maxLength={120} value={form.local||''} onChange={campo('local')} placeholder="Ex.: Recepção"/></label>}
     <label className="label pat-control-wide">Observações <small>Opcional</small><textarea className="input" rows={2} maxLength={1000} placeholder="Informações úteis para a próxima conferência" value={form.observacao} onChange={campo('observacao')}/></label>
    </fieldset>
    {form.atualizadoEm&&<AtualizacaoPatrimonio registro={form}/>}
    <div className="pat-form-footer pat-actions"><button className="btn-primary" disabled={ocupado}>{ocupado?'Salvando…':'Salvar cadastro'}</button><button type="button" className="btn-ghost" disabled={ocupado} onClick={fechar}>Cancelar</button></div>
   </form>
  </JanelaFormulario>}
 </section>;
}
