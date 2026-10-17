import { useState } from 'react';
import { buscarOrdensPorId } from '../services/campanhas.js';
import { dinheiro } from './trocas.jsx';
export default function CampanhaResumoOS({id}) {
  const [aberto,setAberto]=useState(false),[dados,setDados]=useState(null),[erro,setErro]=useState(''),[carregando,setCarregando]=useState(false);
  async function carregar(){
    setErro('');setCarregando(true);
    try {const os=await buscarOrdensPorId([id],true); const encontrada=os.find(o=>String(o.id)===String(id)); if(!encontrada)throw Error('Esta O.S. não foi encontrada na consulta. Atualize a lista.');setDados(encontrada);}
    catch(e){setErro(e.message);}finally{setCarregando(false);}
  }
  return <div className="pb-3 pl-7 text-sm"><button type="button" className="text-brand-700 underline" aria-expanded={aberto} onClick={()=>{setAberto(!aberto);if(!aberto&&!dados&&!carregando)void carregar();}}>{aberto?'Recolher resumo':'Ver resumo dos produtos'}</button>
    {aberto&&<div className="mt-2 rounded-lg bg-slate-50 p-3">
      {carregando?<p>Consultando produtos…</p>:erro?<p role="alert">{erro} <button type="button" onClick={carregar} className="underline">Tentar novamente</button></p>:dados&&<>
        {dados.itens?.length?<ul className="space-y-2">{dados.itens.map((item,i)=><li key={i}><strong>{item.modelo||item.produto||'Produto sem descrição'}</strong>{item.modelo&&item.produto&&<span> · {item.produto}</span>}<div className="text-slate-600">{item.quantidade??'Quantidade não informada'}{item.valorTotal!=null?` · ${dinheiro(item.valorTotal)} bruto`:''}{item.categoria?` · ${item.categoria}`:''}</div></li>)}</ul>:<p>Os itens não estão disponíveis nesta consulta. Isso não significa que a O.S. não tenha produtos.</p>}
        <p className="mt-2 text-xs text-slate-500">Resumo da base integrada do ERP. Total da O.S.: {dinheiro(dados.valor)}. Valores dos itens são anteriores ao desconto. Abrir o resumo não marca a O.S.</p>
      </>}
    </div>}
  </div>;
}
