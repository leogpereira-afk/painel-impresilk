import React from 'react';
import { ArrowUpRight, CalendarClock, CalendarDays, Clock3, IdCard } from 'lucide-react';
import { formatarData, prazoOportunidade, urlOficialSegura } from '../lib/licitacoes-pesquisa.mjs';
import './datas-licitacao.css';

function DataOficial({ rotulo, icone: Icone, registro, destaque = false, prazo = false }) {
  const data = registro?.dataHora;
  const horario = prazoOportunidade(data);
  const dia = typeof data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data) && prazoOportunidade(`${data}T12:00:00Z`).valido;
  const valor = horario.valido || dia ? formatarData(data, horario.valido) : 'Não informado';
  const definida = valor !== 'Não informado';
  const fonte = definida && urlOficialSegura(registro?.fonteUrl);

  return <div className={`lic-data${destaque ? ' lic-data-sessao' : ''}`}>
    <dt><Icone size={15} aria-hidden="true" />{rotulo}</dt>
    <dd>
      {definida ? <time dateTime={data} title={horario.valido ? 'Horário de Brasília' : undefined}>{valor}</time> : <span className="lic-data-pendente">A confirmar na fonte oficial</span>}
      {definida && dia && <span className="lic-data-pendente">Horário a confirmar</span>}
      {prazo && horario.encerrado && <span className="lic-data-encerrado">Prazo encerrado</span>}
      {fonte && <a href={fonte} target="_blank" rel="noopener noreferrer" aria-label={`Fonte oficial de ${rotulo.toLocaleLowerCase('pt-BR')}${registro.referencia ? `, ${registro.referencia}` : ''}`}>
        {registro.referencia || 'Fonte oficial'}<ArrowUpRight size={12} aria-hidden="true" />
      </a>}
    </dd>
  </div>;
}

export default function DatasLicitacao({ item }) {
  const situacao = item.situacaoEdital;
  const fonteSituacao = urlOficialSegura(situacao?.fonteUrl);
  if (situacao && fonteSituacao) return <div className="lic-data lic-data-situacao">
    <strong>Situação no PNCP: {situacao.nome}</strong>
    <a href={fonteSituacao} target="_blank" rel="noopener noreferrer">Ver situação oficial<ArrowUpRight size={13} aria-hidden="true" /></a>
  </div>;
  const { sessaoPublica, envioProposta, credenciamento } = item.datasEdital || {};
  const prazoLegado = !envioProposta && prazoOportunidade(item.prazo).valido && item.prazo !== sessaoPublica?.dataHora && item.prazo !== credenciamento?.dataHora;
  return <dl className="lic-datas" aria-label="Datas da licitação">
    <DataOficial rotulo="Sessão pública" icone={CalendarDays} registro={sessaoPublica} destaque />
    <DataOficial rotulo="Prazo para proposta" icone={Clock3} registro={envioProposta} prazo />
    {credenciamento && <DataOficial rotulo="Prazo de credenciamento" icone={IdCard} registro={credenciamento} prazo />}
    {prazoLegado && <DataOficial rotulo="Prazo registrado" icone={CalendarClock} registro={{ dataHora: item.prazo }} prazo />}
  </dl>;
}
