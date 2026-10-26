import {resumoProcesso} from '../../lib/calc/resumoProcesso.js';

const data=v=>v?v.slice(0,10).split('-').reverse().join('/'):'Sem prazo';
const destino={etapas:'Ver etapas',acoes:'Ver ações',arquivos:'Ver arquivos'};

export default function ResumoDemanda({item,ir}){
 const hoje=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date()),r=resumoProcesso(item,hoje);
 const responsavel=r.proxima&&(r.proxima.responsavel||item.envolvidos?.find(p=>p.rhId===r.proxima.responsavelRhId)?.nome);
 return <section className="demanda-resumo" aria-label="Acompanhamento da demanda">
  {r.encerrado?<div className="demanda-encerrada"><h2>Demanda {item.situacao==='cancelada'?'cancelada':'concluída'}</h2><p>O histórico, as ações e os materiais continuam disponíveis nas seções da ficha.</p></div>:<>
   {r.proxima&&<div className="demanda-proxima"><div><p className="demanda-identificacao">Próxima etapa disponível</p><h2>{r.proxima.titulo}</h2><p className="demanda-proxima-dados">{responsavel&&<span>{responsavel}</span>}<span>{r.proxima.prazo?'Prazo: ':''}{data(r.proxima.prazo)}</span><span>{r.proxima.situacao==='execucao'?'Em execução':'Pendente'}</span></p></div><button type="button" className="btn-primary" onClick={()=>ir('etapas')}>Ver etapa</button></div>}
   {r.sinais.length>0&&<div className="demanda-atencao"><h2>O que merece atenção</h2><ul>{r.sinais.map(s=><li key={s.tipo} className={'demanda-sinal sinal-'+s.tipo}><div><h3>{s.titulo}</h3><p>{s.texto}</p></div><button type="button" className="btn-outline" onClick={()=>ir(s.aba)}>{destino[s.aba]}</button></li>)}</ul></div>}
   {!r.sinais.length&&!r.proxima&&<div className="demanda-sem-alerta"><h2>Nenhum alerta nas informações registradas</h2><p>Confira o andamento e os resultados com a equipe.</p><button type="button" className="btn-outline" onClick={()=>ir('etapas')}>Ver etapas</button></div>}
  </>}
 </section>;
}
