import { NavLink, useLocation } from 'react-router-dom';
import { CalendarDays, Factory, UsersRound, ListChecks, BriefcaseBusiness } from 'lucide-react';
import { podeAbrir } from '../lib/sessao.js';

export default function CalendarioAbas({sessao}) {
  const {search:busca,state,pathname} = useLocation();
  const planejamentoAtivo=pathname==='/calendario-empresa'&&new URLSearchParams(busca).get('planejamento')==='1';
  const filtros=new URLSearchParams(busca);
  if(filtros.has('processo'))filtros.delete('aba');
  filtros.delete('processo');filtros.delete('encontro');
  filtros.delete('planejamento');filtros.delete('acao');
  const planejamentoFiltros=new URLSearchParams(filtros);planejamentoFiltros.set('planejamento','1');
  if(!planejamentoFiltros.has('ano'))planejamentoFiltros.set('ano',filtros.get('mes')?.slice(0,4)||'2027');
  const search=filtros.size?'?'+filtros.toString():'';
  return <nav aria-label="Calendário" className="flex flex-wrap gap-2 mb-3">
    {[
      ['calendario-empresa','Empresa',CalendarDays],
      ['agenda','Produção',Factory],
      ['reunioes','Reuniões',UsersRound],
      ['demandas','Demandas',ListChecks],
      ['consultorias','Consultorias',BriefcaseBusiness],
    ].filter(([id])=>podeAbrir(id==='consultorias'?'demandas':id,sessao)).map(([id,nome,Icone])=>
      <NavLink key={id} state={state?.origemComercial?state:undefined} to={`/${id}${search}`} className={({isActive})=>isActive&&!planejamentoAtivo?'btn-primary':'btn-outline'}>
        <Icone size={18} aria-hidden="true"/>{nome}
      </NavLink>)}
    {podeAbrir('calendario-empresa',sessao)&&<NavLink to={`/calendario-empresa?${planejamentoFiltros}`} className={planejamentoAtivo?'btn-primary':'btn-outline'} aria-current={planejamentoAtivo?'page':undefined}><CalendarDays size={18} aria-hidden="true"/>Planejamento anual</NavLink>}
  </nav>;
}
