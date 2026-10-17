import Silk from './Silk.jsx';
import './silk-header.css';

/** Cabeçalho visual: ações e estados continuam sob controle da tela de origem. */
export default function SilkHeader({titulo, descricao, contexto='IMPRESILK', tom='marinho', acao, retrato=true, animado=true, className=''}) {
  return <header className={`silk-header ${className}`} data-tom={tom}>
    <Silk portrait={retrato} decorative className={`silk-header__mascote ${animado?'silk-header__entrada':''}`}/>
    <div className="silk-header__texto">
      {contexto&&<p className="silk-header__contexto">{contexto}</p>}
      <h1>{titulo}</h1>
      {descricao&&<p className="silk-header__descricao">{descricao}</p>}
    </div>
    {acao&&<div className="silk-header__acoes sem-impressao">{acao}</div>}
  </header>;
}
