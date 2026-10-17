import {CalendarDays,ChevronLeft,ChevronRight,SlidersHorizontal,RotateCcw,ChevronDown,Users,UserRound,Package,Tags,Megaphone,Layers} from 'lucide-react';
import './filtros-dashboard.css';

const MESES=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MODOS=[['mes','Mês','📅'],['ano','Ano','🗓️'],['todos','Todos os anos','🗂️'],['personalizado','Personalizado','🎯']];
const CAMPOS=[['vendedor','Vendedor','vendedores',UserRound],['cliente','Cliente','clientes',Users],['produto','Produto','produtos',Package],['categoria','Categoria','categorias',Tags],['campanha','Campanha','campanhas',Megaphone]];
const anoValido=v=>/^20\d{2}$/.test(String(v))||String(v)==='2100';

export default function FiltrosDashboard({filtro,alterar,catalogo={},abc=false}){
 const hoje=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}),mesAtual=hoje.slice(0,7);
 const mes=/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(filtro.mes||'')?filtro.mes:mesAtual;
 const ano=anoValido(filtro.ano)?String(filtro.ano):hoje.slice(0,4);
 const anoSelecionado=filtro.modo==='mes'?mes.slice(0,4):ano;
 const anos=[...new Set([...(catalogo.anos||[]),hoje.slice(0,4),anoSelecionado].map(String).filter(anoValido))].sort().reverse();
 const anosHistorico=[...new Set((catalogo.anos||[]).map(String).filter(anoValido))].sort();
 const ativos=['vendedor','cliente','produto','categoria','campanha','equipe'].filter(c=>filtro[c]).length;
 const campos=catalogo.equipes?.length?[...CAMPOS,['equipe','Equipe','equipes',Layers]]:CAMPOS;
 function trocarModo(modo){alterar({modo,...(modo==='ano'&&filtro.modo==='mes'?{ano:mes.slice(0,4)}:{}),...(modo==='mes'&&filtro.modo==='ano'?{mes:`${ano}-${mes.slice(5)}`}:{})});}
 function trocarAno(valor){alterar(filtro.modo==='mes'?{mes:`${valor}-${mes.slice(5)}`,ano:valor}:{ano:valor});}
 function navegar(passo){
  if(filtro.modo==='mes'){
   const data=new Date(Date.UTC(Number(mes.slice(0,4)),Number(mes.slice(5))-1+passo,1));
   const proximo=data.toISOString().slice(0,7);alterar({mes:proximo,ano:proximo.slice(0,4)});
  }else alterar({ano:String(Number(ano)+passo)});
 }
 const anterior=filtro.modo==='mes'?mes<='2000-01':Number(ano)<=2000;
 const proximo=filtro.modo==='mes'?mes>='2100-12':Number(ano)>=2100;
 const atual=filtro.modo==='mes'?mes===mesAtual:ano===hoje.slice(0,4);
 const seletorAno=<label>Ano<select aria-label="Ano" value={anoSelecionado} onChange={e=>trocarAno(e.target.value)}>{anos.map(a=><option key={a} value={a}>{a}</option>)}</select></label>;
 return <div className="dash-filter-panel">
  <section className="dash-period" aria-label="Período da análise">
   <div className="dash-period-head"><span className="dash-period-title"><CalendarDays size={17} aria-hidden="true"/>Período da análise</span><span className="dash-period-hint">Vale para os indicadores e gráficos</span></div>
   <div className="dash-period-content">
    <div className="dash-period-modes" role="group" aria-label="Período">{MODOS.map(([id,nome,emoji])=><button type="button" key={id} aria-pressed={filtro.modo===id} onClick={()=>trocarModo(id)}><span className="dash-period-emoji" aria-hidden="true">{emoji}</span>{nome}</button>)}</div>
    {['mes','ano'].includes(filtro.modo)&&<div className="dash-period-picker">
     <button className="dash-period-arrow" type="button" aria-label={filtro.modo==='mes'?'Mês anterior':'Ano anterior'} disabled={anterior} onClick={()=>navegar(-1)}><ChevronLeft size={19} aria-hidden="true"/></button>
     {filtro.modo==='mes'&&<label>Mês<select aria-label="Mês" value={mes.slice(5)} onChange={e=>alterar({mes:`${mes.slice(0,4)}-${e.target.value}`,ano:mes.slice(0,4)})}>{MESES.map((m,i)=><option key={m} value={String(i+1).padStart(2,'0')}>{m}</option>)}</select></label>}
     {seletorAno}
     <button className="dash-period-arrow" type="button" aria-label={filtro.modo==='mes'?'Próximo mês':'Próximo ano'} disabled={proximo} onClick={()=>navegar(1)}><ChevronRight size={19} aria-hidden="true"/></button>
     <button type="button" className="dash-period-now" disabled={atual} onClick={()=>alterar({ano:hoje.slice(0,4),...(filtro.modo==='mes'?{mes:mesAtual}:{})})}><RotateCcw size={13} aria-hidden="true"/>{filtro.modo==='mes'?'Este mês':'Este ano'}</button>
    </div>}
    {filtro.modo==='todos'&&<div className="dash-period-all"><span aria-hidden="true">🗂️</span><div><strong>Histórico disponível</strong><small>{anosHistorico.length?`${anosHistorico.join(' · ')} · a cobertura é informada abaixo`:'Os anos aparecem conforme a fonte de dados.'}</small></div></div>}
    {filtro.modo==='personalizado'&&<div className="dash-period-dates"><label>De<input type="date" aria-label="De" value={filtro.de} onChange={e=>alterar({de:e.target.value})}/></label><span aria-hidden="true">→</span><label>Até<input type="date" aria-label="Até" value={filtro.ate} onChange={e=>alterar({ate:e.target.value})}/></label></div>}
   </div>
  </section>
  <details className="dash-filters"><summary><SlidersHorizontal size={16} aria-hidden="true"/><span>Filtros avançados</span><span className="dash-filter-count">{ativos?`${ativos} selecionado${ativos===1?'':'s'}`:'Vendedor, cliente, produto…'}</span><ChevronDown size={16} className="dash-filter-chevron" aria-hidden="true"/></summary>
   <div className="dash-filter-grid">{campos.map(([campo,rotulo,colecao,Icone])=><label key={campo}><span className="dash-filter-label"><Icone size={14} aria-hidden="true"/>{rotulo}</span><select aria-label={rotulo} value={filtro[campo]||''} onChange={e=>alterar({[campo]:e.target.value})}><option value="">Todos</option>{(catalogo[colecao]||[]).map(o=><option key={o.id??o.nome??o} value={o.id??o.nome??o}>{o.nome??o}</option>)}</select></label>)}
    {abc&&<><label>Faixa A · até (%)<input type="number" min="1" max="98" value={filtro.abcA} onChange={e=>alterar({abcA:Number(e.target.value)})}/></label><label>Faixa B · até (%)<input type="number" min="2" max="99" value={filtro.abcB} onChange={e=>alterar({abcB:Number(e.target.value)})}/></label></>}
    <button type="button" className="dash-clear" onClick={()=>alterar({vendedor:'',cliente:'',produto:'',categoria:'',campanha:'',equipe:''})}><RotateCcw size={14} aria-hidden="true"/>Limpar filtros de seleção</button>
   </div>
  </details>
 </div>;
}
