import PainelEtapas from './PainelEtapas.jsx';
import {resumoProcesso} from '../../lib/calc/resumoProcesso.js';
export default function ResumoProcesso({item,ir}){
 const hoje=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date()),r=resumoProcesso(item,hoje);
 return <><PainelEtapas item={item}/><section className="processo-painel"><div className="processo-linha"><div><h2>O que merece atenção</h2><p className="processo-ajuda">Orientações calculadas a partir das etapas e dos registros visíveis para você.</p></div></div>
 <div className="processo-metricas">{[[r.acoes,'Ações registradas','acoes'],[r.implantadas,'Implantadas · informadas','acoes'],[r.atrasadas.length,'Etapas atrasadas','etapas'],[r.validar.length,'Em validação','etapas']].map(([v,n,aba])=><button key={n} onClick={()=>ir(aba)}><strong>{v}</strong><span>{n}</span></button>)}</div>
 {r.encerrado?<p className="processo-vazio">Processo {item.situacao==='cancelada'?'cancelado':'concluído'}. O histórico e os materiais continuam disponíveis.</p>:<><ul className="processo-sinais">{r.sinais.map(s=><li key={s.tipo}><div><strong>{s.titulo}</strong><p>{s.texto}</p></div><button className="btn-outline" onClick={()=>ir(s.aba)}>Conferir</button></li>)}</ul>{r.proxima&&<div className="processo-proxima"><strong>Próxima etapa disponível: {r.proxima.titulo}</strong><p className="processo-ajuda">{r.proxima.situacao==='execucao'?'Já está em execução.':'As dependências estão concluídas.'} Confira o andamento em Etapas.</p><button className="btn-outline" onClick={()=>ir('etapas')}>Ver etapa</button></div>}{!r.sinais.length&&!r.proxima&&<p className="processo-vazio">Nenhum alerta nas informações registradas. Confira os resultados com a equipe.</p>}</>}
 </section></>;
}
