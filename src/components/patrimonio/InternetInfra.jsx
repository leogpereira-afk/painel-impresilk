import {useCallback,useEffect,useMemo,useState} from 'react';
import {Plus,Pencil,RefreshCw,FileText} from 'lucide-react';
import JanelaFormulario from '../JanelaFormulario.jsx';
import {lerInfra,salvarInfra,guardarContratoInfra,lerContratoInfra} from '../../services/patrimonio-infra.js';
import ContatoResponsavel,{ContatoLinks} from './ContatoResponsavel.jsx';
import {moedaCheia,dataLonga} from '../../lib/format.js';

const VAZIO={tipo:'internet',operadora:'',plano:'',download:'',upload:'',valorMensal:'',inicioVigencia:'',fimVigencia:'',endereco:'',tecnicoId:''};
const campos=[['operadora','Operadora'],['plano','Plano'],['download','Download contratado'],['upload','Upload contratado'],['endereco','Endereço de instalação']];
const contatosDe=itens=>Object.entries(itens||{}).filter(([,item])=>item.tipo==='contato').map(([id,item])=>({...item,id}));
const bytesEmBase64=bytes=>{let binario='';for(let i=0;i<bytes.length;i+=0x8000)binario+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(binario);};

export default function InternetInfra(){
 const [infra,setInfra]=useState(null),[erro,setErro]=useState(''),[mensagem,setMensagem]=useState(''),[form,setForm]=useState(null),[salvando,setSalvando]=useState(false),[conflito,setConflito]=useState(false),[arquivo,setArquivo]=useState(null);
 const carregar=useCallback(async()=>{setErro('');try{setInfra(await lerInfra());}catch(e){setErro(e.message);}},[]);
 useEffect(()=>{carregar();},[carregar]);
 const contatos=useMemo(()=>contatosDe(infra?.itens),[infra]);
 const planos=useMemo(()=>Object.entries(infra?.itens||{}).filter(([,x])=>x.tipo==='internet').map(([id,x])=>({...x,id})).sort((a,b)=>a.operadora.localeCompare(b.operadora,'pt-BR')),[infra]);
 const abrir=item=>{setErro('');setMensagem('');setConflito(false);setArquivo(null);setForm(item?{...item,valorMensal:item.valorMensal??''}:{...VAZIO,id:crypto.randomUUID()});};
 const campo=chave=>e=>setForm(v=>({...v,[chave]:e.target.value}));
 const fechar=()=>{if(!salvando){setForm(null);setArquivo(null);setConflito(false);setErro('');}};
 async function salvar(e){
  e.preventDefault();if(!form||salvando||conflito)return;
  if(form.fimVigencia&&form.inicioVigencia&&form.fimVigencia<form.inicioVigencia){setErro('O fim da vigência não pode ser anterior ao início.');return;}
  const dados=Object.fromEntries(Object.keys(VAZIO).map(k=>[k,form[k]??'']));
  if(!infra.podeValores)delete dados.valorMensal;
  else if(dados.valorMensal!==''){
   const digitado=String(dados.valorMensal).replace(',','.');
   if(!/^\d+(?:\.\d{1,2})?$/.test(digitado)||Number(digitado)>1e9){setErro('Informe um valor mensal válido, com até dois centavos.');return;}
   dados.valorMensal=Number(digitado);
  }
  if(arquivo&&(!['application/pdf','image/jpeg','image/png','image/webp'].includes(arquivo.type)||arquivo.size>3*1024*1024||!arquivo.size)){setErro('Use PDF ou imagem de até 3 MB.');return;}
  setSalvando(true);setErro('');let salvo=null;
  try{
   const resp=await salvarInfra(form.id,dados,form.atualizadoEm??null);
   salvo=resp.item;
   if(arquivo){
    const bytes=new Uint8Array(await arquivo.arrayBuffer());
    const anexo=await guardarContratoInfra(form.id,bytesEmBase64(bytes),arquivo.type,arquivo.name,salvo.atualizadoEm);
    salvo={...salvo,contrato:anexo.contrato};
   }
   setInfra(v=>({...v,itens:{...(v?.itens||{}),[form.id]:salvo}}));setForm(null);setArquivo(null);setMensagem('Plano de internet salvo.');await carregar();
  }catch(e){setErro(salvo?`Plano salvo, mas o contrato não foi anexado: ${e.message}`:e.message);if(salvo)setForm(v=>({...v,atualizadoEm:salvo.atualizadoEm}));if(e.status===409)setConflito(true);if(salvo)carregar();}finally{setSalvando(false);}
 }
 async function abrirContrato(item){
  setErro('');try{const {base64,mime,nome}=await lerContratoInfra(item.id);const binario=atob(base64),bytes=Uint8Array.from(binario,c=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes],{type:mime}));const link=document.createElement('a');link.href=url;link.download=nome||'contrato';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(e){setErro(e.message);}
 }
 return <section className="infra-content" aria-label="Planos de internet">
  <header className="infra-heading"><div><h2>Internet</h2><p>Operadoras, planos, velocidades, vigência, endereço e assistência técnica.</p></div><div className="pat-actions"><button className="btn-ghost" onClick={carregar} aria-label="Atualizar internet"><RefreshCw size={16}/></button><button className="btn-primary" disabled={!infra} onClick={()=>abrir(null)}><Plus size={16}/>Novo plano</button></div></header>
  {erro&&!form&&<p role="alert" className="pat-notice is-error">{erro}</p>}{mensagem&&<p role="status">{mensagem}</p>}
  {!infra?<p role="status">{erro?'Dados indisponíveis.':'Carregando internet…'}</p>:!planos.length?<div className="infra-empty"><h3>Nenhum plano cadastrado</h3><p>Cadastre a operadora, o plano e o endereço de instalação.</p><button className="btn-outline" onClick={()=>abrir(null)}>Cadastrar plano</button></div>:<div className="infra-cards">{planos.map(item=><article className="infra-card" key={item.id}><header><div><small>Plano de internet</small><h3>{item.operadora}</h3></div><button className="btn-ghost" onClick={()=>abrir(item)} aria-label={`Editar plano ${item.operadora}`}><Pencil size={16}/></button></header><p>{item.plano||'Plano não informado'}</p><dl><div><dt>Velocidade</dt><dd>{item.download||'—'} download · {item.upload||'—'} upload</dd></div><div><dt>Endereço</dt><dd>{item.endereco||'Não informado'}</dd></div><div><dt>Vigência</dt><dd>{item.inicioVigencia?dataLonga(item.inicioVigencia):'Início pendente'}{item.fimVigencia?` até ${dataLonga(item.fimVigencia)}`:''}</dd></div>{infra.podeValores&&<div><dt>Valor mensal</dt><dd>{item.valorMensal===''||item.valorMensal==null?'Não informado':moedaCheia(item.valorMensal)}</dd></div>}</dl><details><summary>Técnico responsável</summary>{item.tecnicoId?<ContatoLinks contato={contatos.find(c=>c.id===item.tecnicoId)}/>:<p>Não informado.</p>}</details>{infra.podeValores&&item.contrato?.nome&&<button className="btn-outline" onClick={()=>abrirContrato(item)}><FileText size={16}/>Baixar contrato · {item.contrato.nome}</button>}</article>)}</div>}
  {form&&<JanelaFormulario titulo={form.atualizadoEm?'Editar plano de internet':'Novo plano de internet'} ocupado={salvando} aoFechar={fechar}><form className="infra-form" onSubmit={salvar}>{erro&&<p role="alert" className="pat-notice is-error">{erro}</p>}{conflito&&<p>O cadastro mudou. Seu preenchimento permanece aqui; atualize a lista antes de editar novamente.</p>}<fieldset disabled={salvando||conflito}>
   {campos.map(([chave,rotulo])=><label key={chave}>{rotulo}{chave==='operadora'&&' *'}<input className="input" required={chave==='operadora'} maxLength={chave==='endereco'?300:180} value={form[chave]||''} onChange={campo(chave)}/></label>)}
   <label>Início da vigência<input className="input" type="date" value={form.inicioVigencia||''} onChange={campo('inicioVigencia')}/></label><label>Fim da vigência<input className="input" type="date" value={form.fimVigencia||''} onChange={campo('fimVigencia')}/></label>
   {infra?.podeValores&&<label>Valor mensal (R$)<input className="input" type="number" min="0" step="0.01" value={form.valorMensal??''} onChange={campo('valorMensal')}/></label>}
   <ContatoResponsavel valor={form.tecnicoId||''} contatos={contatos} aoMudar={id=>setForm(v=>({...v,tecnicoId:id}))} aoContatoSalvo={contato=>setInfra(v=>({...v,itens:{...(v?.itens||{}),[contato.id]:contato}}))} rotulo="Técnico responsável"/>
   {infra?.podeValores&&!form.contrato&&<label>Contrato (PDF ou imagem, até 3 MB)<input className="input" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e=>setArquivo(e.target.files?.[0]||null)}/></label>}
   {form.contrato?.nome&&<p>Contrato registrado: {form.contrato.nome}. A versão anexada permanece preservada.</p>}
  </fieldset><div className="infra-actions"><button className="btn-primary" disabled={salvando||conflito}>Salvar plano</button><button type="button" className="btn-ghost" onClick={fechar}>Cancelar</button></div></form></JanelaFormulario>}
 </section>;
}
