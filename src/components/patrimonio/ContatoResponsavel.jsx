import {useId,useState} from 'react';
import {Mail,MessageCircle,Phone,Plus,Pencil} from 'lucide-react';
import {salvarInfra} from '../../services/patrimonio-infra.js';
import JanelaFormulario from '../JanelaFormulario.jsx';
import './telefonia.css';

const telefoneUrl=valor=>String(valor||'').replace(/[^+\d]/g,'');
const whatsappUrl=valor=>{
 const digitos=String(valor||'').replace(/\D/g,'');
 return digitos.length===10||digitos.length===11?'55'+digitos:digitos;
};

export function ContatoLinks({contato}) {
 if(!contato)return <span className="tel-muted">Contato ainda não vinculado.</span>;
 return <div className="tel-contact-links">
  <strong>{contato.nome}</strong>
  {contato.telefone&&<a href={`tel:${telefoneUrl(contato.telefone)}`}><Phone size={15}/> {contato.telefone}</a>}
  {contato.whatsapp&&<a href={`https://wa.me/${whatsappUrl(contato.whatsapp)}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={15}/> WhatsApp</a>}
  {contato.email&&<a href={`mailto:${encodeURIComponent(contato.email)}`}><Mail size={15}/> {contato.email}</a>}
  {contato.endereco&&<span>{contato.endereco}</span>}
 </div>;
}

export default function ContatoResponsavel({valor='',contatos=[],aoMudar,aoContatoSalvo,rotulo='Contato responsável',contatosIndisponiveis=false}) {
 const id=useId();
 const [edicao,setEdicao]=useState(null),[erro,setErro]=useState(''),[ocupado,setOcupado]=useState(false),[conflito,setConflito]=useState(false);
 const selecionado=contatos.find(c=>c.id===valor);
 const abrir=contato=>{setErro('');setConflito(false);setEdicao(contato?{...contato}:{id:crypto.randomUUID(),tipo:'contato',nome:'',telefone:'',whatsapp:'',email:'',endereco:'',atualizadoEm:null});};
 const campo=nome=>e=>setEdicao(v=>({...v,[nome]:e.target.value}));
 async function salvar() {
  if(!edicao.nome.trim()){setErro('Informe o nome do contato.');return;}
  setOcupado(true);setErro('');
  try {
   const {item}=await salvarInfra(edicao.id,{tipo:'contato',nome:edicao.nome,telefone:edicao.telefone,whatsapp:edicao.whatsapp,email:edicao.email,endereco:edicao.endereco},edicao.atualizadoEm??null);
   aoContatoSalvo?.(item);
   aoMudar?.(item.id);
   setEdicao(null);
  } catch(e){setErro(e.message);if(e.status===409)setConflito(true);}
  finally{setOcupado(false);}
 }
 return <div className="tel-contact-picker">
  <label htmlFor={id}>{rotulo}</label>
  <div className="tel-contact-picker-row">
   <select id={id} className="input" value={valor} onChange={e=>aoMudar?.(e.target.value)}>
    <option value="">Sem contato vinculado</option>
    {valor&&!selecionado&&<option value={valor}>{contatosIndisponiveis?'Contato vinculado; consulta indisponível':'Contato anterior a conferir'}</option>}
    {contatos.slice().sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')).map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}
   </select>
   <button type="button" className="btn-outline" onClick={()=>abrir()} aria-label="Cadastrar contato"><Plus size={16}/> Novo</button>
   {selecionado&&<button type="button" className="btn-ghost" onClick={()=>abrir(selecionado)} aria-label={`Editar contato ${selecionado.nome}`}><Pencil size={15}/></button>}
  </div>
  {selecionado&&<ContatoLinks contato={selecionado}/>}
  {edicao&&<JanelaFormulario titulo={edicao.atualizadoEm?'Editar contato':'Novo contato'} ocupado={ocupado} aoFechar={()=>setEdicao(null)}>
   <div className="pat-form" onKeyDown={e=>{if(e.key==='Enter')e.preventDefault();}}>
    {erro&&<p role="alert" className="pat-notice is-error">{erro}</p>}
    {conflito&&<p>Este contato mudou. Feche, atualize os dados e abra novamente.</p>}
    <fieldset className="tel-form-grid" disabled={ocupado||conflito}>
     <label>Nome<input className="input" required maxLength={180} value={edicao.nome} onChange={campo('nome')}/></label>
     <label>Telefone<input className="input" type="tel" maxLength={180} value={edicao.telefone||''} onChange={campo('telefone')}/></label>
     <label>WhatsApp<input className="input" type="tel" maxLength={180} value={edicao.whatsapp||''} onChange={campo('whatsapp')}/></label>
     <label>E-mail<input className="input" type="email" maxLength={180} value={edicao.email||''} onChange={campo('email')}/></label>
     <label className="tel-wide">Endereço<input className="input" maxLength={300} value={edicao.endereco||''} onChange={campo('endereco')}/></label>
    </fieldset>
    <div className="pat-actions"><button type="button" className="btn-primary" disabled={ocupado||conflito} onClick={salvar}>{ocupado?'Salvando…':'Salvar contato'}</button><button type="button" className="btn-ghost" disabled={ocupado} onClick={()=>setEdicao(null)}>Cancelar</button></div>
   </div>
  </JanelaFormulario>}
 </div>;
}
