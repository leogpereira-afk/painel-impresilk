import { NavLink, useLocation } from 'react-router-dom';
import { CalendarDays, Factory } from 'lucide-react';
import { podeAbrir } from '../lib/sessao.js';

export default function CalendarioAbas({sessao}) {
  const {search} = useLocation();
  return <nav aria-label="Calendário" className="flex flex-wrap gap-2 mb-3">
    {[
      ['calendario-empresa','Empresa',CalendarDays],
      ['agenda','Produção',Factory],
    ].filter(([id])=>podeAbrir(id,sessao)).map(([id,nome,Icone])=>
      <NavLink key={id} to={`/${id}${search}`} className={({isActive})=>isActive?'btn-primary':'btn-outline'}>
        <Icone size={18} aria-hidden="true"/>{nome}
      </NavLink>)}
  </nav>;
}
