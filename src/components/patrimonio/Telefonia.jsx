import {Link,useLocation} from 'react-router-dom';
import Ramais from './Ramais.jsx';
import Celulares from './Celulares.jsx';
import RelacaoNumeros from './RelacaoNumeros.jsx';
import PlanoCorporativo from './PlanoCorporativo.jsx';
import './informatica.css';
import './telefonia-lista.css';
export default function Telefonia({bens=[],setores=[],secaoInicial='ramais'}) {
 const local=useLocation();
 const query=new URLSearchParams(local.search);
 const secao=query.get('telefonia')||secaoInicial;
 const ativa=['relacao','plano','ramais','celulares'].includes(secao)?secao:'ramais';
 const destino=parte=>{const q=new URLSearchParams(local.search);q.set('telefonia',parte);return `${local.pathname}?${q}`;};
 return <section className="info-shell" aria-label="Telefonia"><nav className="info-tabs" aria-label="Divisões de Telefonia">{[['ramais','Ramais'],['celulares','Celulares'],['relacao','Relação de números'],['plano','Plano corporativo']].map(([id,nome])=><Link key={id} className={ativa===id?'is-current':''} aria-current={ativa===id?'page':undefined} to={destino(id)}>{nome}</Link>)}</nav>{ativa==='relacao'?<RelacaoNumeros setores={setores}/>:ativa==='plano'?<PlanoCorporativo/>:ativa==='ramais'?<Ramais bens={bens} setores={setores}/>:<Celulares bens={bens} setores={setores}/>}</section>;
}
