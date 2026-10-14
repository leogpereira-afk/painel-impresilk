import {useEffect,useState} from 'react';
import {caminhoManutencao} from '../../lib/calc/navegacao-patrimonio.js';
import {Link} from 'react-router-dom';
import {podeAbrir} from '../../lib/sessao.js';
import {lerManutencoes} from '../../services/manutencoes.js';
import {moedaCheia,dataLonga} from '../../lib/format.js';

// `fichaId` vem do vínculo resolvido (ficha.bemId ou bem.origemAtivoId), não
// só da origem gravada no bem: computador, câmera ou extintor ligados pela
// ficha também mostram os serviços. Indefinido enquanto as fichas carregam;
// vazio sem ficha; nulo quando a ficha existe mas não aparece aqui (Segurança
// oculta ou vínculo a conferir).
export default function HistoricoBem({fichaId}) {
  const [aberto,setAberto]=useState(false);
  const [dados,setDados]=useState(null);
  const [erro,setErro]=useState('');
  const [tentativa,setTentativa]=useState(0);
  const permitido=podeAbrir('manutencoes');
  useEffect(()=>{
    if(!aberto || !permitido || !fichaId)return;
    let vivo=true;
    setDados(null);setErro('');
    lerManutencoes().then(m=>{
      if(vivo)setDados(Object.entries(m).map(([id,l])=>({...l,id})).filter(l=>l.ativoId===fichaId).sort((a,b)=>String(b.data||'').localeCompare(String(a.data||''))));
    }).catch(e=>{if(vivo)setErro(e.message);});
    return ()=>{vivo=false;};
  },[aberto,permitido,fichaId,tentativa]);
  if(!permitido)return null;
  return <section className="mt-4 rounded-xl border p-3" aria-label="Histórico integrado do bem">
    <button type="button" className="font-semibold text-sm" aria-expanded={aberto} onClick={()=>setAberto(v=>!v)}>Manutenções vinculadas {aberto?'▴':'▾'}</button>
    {aberto&&<div className="mt-3 space-y-2 text-sm">
      {fichaId===undefined?<p role="status">Conferindo as fichas ligadas…</p>:fichaId===null?<p>Os serviços ficam na ficha ligada a este bem, que não aparece aqui. Confira o bloco Ligado a.</p>:!fichaId?<p>Este bem ainda não está ligado a uma ficha de equipamento. Ligue no bloco Ligado a; os serviços ficam registrados na ficha.</p>:erro?<p role="alert">{erro} <button className="btn-outline" onClick={()=>setTentativa(v=>v+1)}>Tentar novamente</button></p>:dados===null?<p role="status">Consultando histórico…</p>:<>
        <p><strong>{dados.length} serviços · {moedaCheia(dados.reduce((s,l)=>s+(Number(l.valor)||0),0))}</strong> em custos registrados.</p>
        {!dados.length&&<p>Nenhum lançamento vinculado encontrado nesta consulta.</p>}
        {dados.map(l=><div key={l.id} className="flex flex-wrap justify-between gap-2 border-t py-2"><div>{l.data?dataLonga(l.data):'Sem data'} · {l.descricao||'Serviço sem descrição'}{l.fornecedor&&<p className="text-slate-500">{l.fornecedor}</p>}</div><strong>{moedaCheia(Number(l.valor)||0)}</strong></div>)}
      </>}
      {fichaId && <Link className="btn-outline" to={caminhoManutencao({item:fichaId})}>Gerenciar manutenção deste bem</Link>}
    </div>}
  </section>;
}
