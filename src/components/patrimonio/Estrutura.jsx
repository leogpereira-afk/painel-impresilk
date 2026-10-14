import {Link,useLocation} from 'react-router-dom';
import Computadores from './Computadores.jsx';
import InternetInfra from './InternetInfra.jsx';
import EletricaInfra from './EletricaInfra.jsx';
import EstruturaLegada from './EstruturaLegada.jsx';
import './estrutura-infra.css';

const SECOES = [
  ['outros','Itens'],
  ['hidraulica','Hidráulica'],
  ['internet','Internet'],
  ['computadores','Computadores e servidores'],
  ['eletrica','Parte elétrica'],
];
export default function EstruturaPatrimonio({bens=[],setores=[],aoVerBem,aoMudarVinculo,secaoInicial='outros'}) {
  const local=useLocation();
  const query=new URLSearchParams(local.search);
  const secao=SECOES.some(([id])=>id===query.get('estrutura'))?query.get('estrutura'):secaoInicial;
  const destino=id=>{const q=new URLSearchParams(local.search);q.delete('item');q.set('aba','estrutura');q.set('estrutura',id);return `${local.pathname}?${q}`;};
  return <section className="infra-shell" aria-label="Estrutura">
    <nav className="infra-secoes" aria-label="Divisões da Estrutura">{SECOES.map(([id,nome])=><Link key={id} to={destino(id)} aria-current={secao===id?'page':undefined} className={secao===id?'is-current':''}>{nome}</Link>)}</nav>
    {secao==='internet'&&<InternetInfra/>}
    {secao==='computadores'&&<Computadores bens={bens} setores={setores} aoVerBem={aoVerBem} aoMudarVinculo={aoMudarVinculo}/>}
    {secao==='eletrica'&&<EletricaInfra bens={bens} setores={setores} aoVerBem={aoVerBem} aoMudarVinculo={aoMudarVinculo}/>}
    {['outros','hidraulica'].includes(secao)&&<EstruturaLegada key={secao} modo={secao} bens={bens} setores={setores} aoVerBem={aoVerBem} aoMudarVinculo={aoMudarVinculo}/>}
  </section>;
}
