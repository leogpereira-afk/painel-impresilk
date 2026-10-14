import silk from '../assets/brand/silk/silk-boas-vindas.webp';
import silkCompacto from '../assets/brand/silk/silk-compacto.webp';
import './silk.css';

// Identidade visual da marca. Não simula um chat nem altera dados da operação.
export default function Silk({portrait = false, decorative = false, className = ''}) {
  return <span className={`silk ${portrait ? 'silk-portrait' : 'silk-body'} ${className}`} aria-hidden={decorative || undefined}>
    <img src={portrait ? silkCompacto : silk}
      alt={decorative ? '' : 'Silk, mascote da Impresilk'}
      width={portrait ? 256 : 768} height={portrait ? 256 : 1152}
      decoding="async" draggable="false"/>
  </span>;
}
