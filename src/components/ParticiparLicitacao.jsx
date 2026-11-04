import {ArrowUpRight,Check,LoaderCircle,Plus} from 'lucide-react';
import {prazoOportunidade} from '../lib/licitacoes-pesquisa.mjs';
import './licitacoes-participacao.css';

// Só envia os identificadores. O servidor relê e valida o acervo do bot.
export default function ParticiparLicitacao({item,estado={},aoParticipar,aoAbrir}) {
  const prazo=prazoOportunidade(item.prazo);
  const elegivel=['GO','REVISÃO HUMANA'].includes(item.classificacao)&&prazo.valido&&!prazo.encerrado;
  if(!aoParticipar&&!estado.item)return null;
  return <div className="lpt-action">
    {estado.item?<button type="button" className="btn-outline lpt-open" onClick={()=>aoAbrir?.(estado.item)}><Check size={15}/>Ver acompanhamento<ArrowUpRight size={14}/></button>:<button type="button" className="btn-primary lpt-start" disabled={estado.ocupado||!elegivel} onClick={()=>aoParticipar(item)} title={elegivel?'Preparar a ficha e acompanhar este edital internamente':prazo.encerrado?'O prazo deste relatório está encerrado':'Confira a classificação e o prazo antes de participar'}>{estado.ocupado?<LoaderCircle size={15} className="lpt-spinner"/>:<Plus size={15}/>} {estado.ocupado?'Preparando…':'Participar'}</button>}
    {estado.erro&&<p className="lpt-error" role="alert">{estado.erro}</p>}
  </div>;
}
