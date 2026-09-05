import {useEffect,useState} from 'react';
import {listarFotos,adicionarFoto,removerFoto,prepararFoto} from '../services/fotos.js';
import {Card,SectionTitle} from './ui.jsx';
export default function FotosPatrimonio({bemId,nome,aoFechar}){
 const [fotos,setFotos]=useState(null),[erro,setErro]=useState(''),[ocupado,setOcupado]=useState(false),[tentar,setTentar]=useState(0);
 useEffect(()=>{let vivo=true;setFotos(null);setErro('');listarFotos(bemId).then(f=>vivo&&setFotos(f)).catch(e=>vivo&&setErro(e.message));return()=>{vivo=false;};},[bemId,tentar]);
 async function enviar(e){const file=e.target.files?.[0];e.target.value='';if(!file)return;setOcupado(true);setErro('');let salvo=false;try{const base64=await prepararFoto(file);await adicionarFoto(bemId,base64,file.name);salvo=true;setFotos(await listarFotos(bemId));}catch(e){setErro((salvo?'A foto foi salva, mas a galeria não atualizou. Use Atualizar fotos. ':'')+e.message);}finally{setOcupado(false);}}
 async function remover(f){if(!window.confirm(`Remover a foto “${f.nome}” deste equipamento?`))return;setOcupado(true);setErro('');try{await removerFoto(bemId,f.id);setFotos(l=>l.filter(x=>x.id!==f.id));}catch(e){setErro(e.message);}finally{setOcupado(false);}}
 return <Card className="mt-4"><SectionTitle titulo={`Fotos · ${nome}`} sub="Identifique o equipamento, a etiqueta e os detalhes. As imagens são reduzidas antes do envio." acao={<><button className="btn-ghost" disabled={ocupado} onClick={()=>setTentar(n=>n+1)}>Atualizar fotos</button>{aoFechar&&<button className="btn-ghost" disabled={ocupado} onClick={aoFechar}>Fechar galeria</button>}</>}/>
 {erro&&<p role="alert" className="text-bad-700 mb-3">{erro}</p>}
 <label className="label">Adicionar foto<input className="input mt-2" type="file" accept="image/jpeg,image/png,image/webp" disabled={ocupado||fotos===null} onChange={enviar}/></label>
 {ocupado&&<p role="status" className="text-sm mt-2">Processando foto…</p>}
 {fotos===null?<p className="text-sm mt-4">{erro?'A galeria não carregou. Tente atualizar.':'Carregando fotos…'}</p>:!fotos.length?<p className="text-sm text-slate-500 mt-4">Nenhuma foto ainda. Adicione uma visão geral e outra da etiqueta ou número de série.</p>:<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-4">{fotos.map(f=><figure key={f.id} className="rounded-xl border overflow-hidden"><a href={f.url} target="_blank" rel="noopener noreferrer"><img src={f.url} alt={`${nome}: ${f.nome}`} className="w-full h-48 object-contain bg-slate-50" loading="lazy"/></a><figcaption className="p-3 flex items-center gap-2"><span className="text-sm min-w-0 flex-1 truncate">{f.nome}</span><button className="btn-ghost" disabled={ocupado} onClick={()=>remover(f)} aria-label={`Remover foto ${f.nome}`}>Remover</button></figcaption></figure>)}</div>}
 </Card>;
}
