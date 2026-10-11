import { NavLink } from 'react-router-dom';
import { Boxes, Wrench } from 'lucide-react';
import { podeAbrir } from '../../lib/sessao.js';
import { ROTA_MANUTENCOES } from '../../lib/calc/navegacao-patrimonio.js';

export default function NavegacaoPatrimonio({ sessao }) {
  return <nav aria-label="Áreas do Patrimônio" className="flex flex-wrap gap-2 mb-3 sem-impressao">
    {(podeAbrir('patrimonio', sessao)||podeAbrir('inventario-valores',sessao)||podeAbrir('seguranca',sessao)) && <NavLink end to="/patrimonio" className={({isActive}) => isActive ? 'btn-primary' : 'btn-outline'}><Boxes size={17}/>Bens e cadastros</NavLink>}
    {podeAbrir('manutencoes', sessao) && <NavLink to={ROTA_MANUTENCOES} className={({isActive}) => isActive ? 'btn-primary' : 'btn-outline'}><Wrench size={17}/>Manutenções</NavLink>}
  </nav>;
}
