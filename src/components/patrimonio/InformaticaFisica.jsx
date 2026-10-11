import {Link} from 'react-router-dom';
import {podeAbrir} from '../../lib/sessao.js';
import {moedaCheia as brl,dataLonga} from '../../lib/format.js';
import {caminhoManutencao} from '../../lib/calc/navegacao-patrimonio.js';
import {SITUACOES_INFORMATICA,manutencoesDoAtivo,alertaManutencao} from '../../lib/calc/informatica-patrimonio.js';
import {vinculoDoEquipamento} from '../../lib/calc/equipamentos-patrimonio.js';
import PessoaRH from './PessoasRH.jsx';
import JanelaFormulario from '../JanelaFormulario.jsx';

export function BemExplicito({item,bens=[]}) {
 const {bem,vinculo}=vinculoDoEquipamento(item,bens);
 return <span>{vinculo==='conflito'?'Vínculo com inventário em conflito':bem?`Vinculado · etiqueta ${bem.codigo||'pendente'}`:item.bemId?'Vínculo com bem a conferir':'Sem vínculo com inventário'}</span>;
}
export function HistoricoInformatica({item,mapa,erro,bens=[],limite=null,mostrarAlerta=true}) {
 if(!podeAbrir('manutencoes'))return null;
 if(erro)return <p role="alert" className="pat-notice is-error">Manutenções indisponíveis: {erro}</p>;
 const {bem,vinculo}=vinculoDoEquipamento(item,bens);
 const resumo=manutencoesDoAtivo(mapa,item.id,new Date(),vinculo==='vinculado'?bem.dataAquisicao:'');
 const bemComValor=mostrarAlerta&&podeAbrir('inventario-valores')&&vinculo==='vinculado'?bem:null;
 const aviso=bemComValor&&resumo?alertaManutencao(resumo.custo,bemComValor.valor,limite):null;
 return <details className="info-history"><summary>Manutenções {resumo?`(${resumo.total})`:'(carregando)'}</summary>{resumo?<><p>{resumo.ultimos12} nos últimos 12 meses · Última: {resumo.ultimo?.data?dataLonga(resumo.ultimo.data):'nenhuma com data válida'}</p><p>Custo informado {resumo.inicio?'desde a aquisição':'no histórico'}: {brl(resumo.custo)} · Últimos 12 meses: {brl(resumo.custo12)}</p>{(resumo.pendentesValor>0||resumo.pendentesData>0||resumo.foraPeriodo>0)&&<p>{resumo.pendentesValor} valores pendentes · {resumo.pendentesData} datas inválidas ou vazias · {resumo.foraPeriodo} fora do período considerado</p>}{bemComValor&&limite==null&&<p>Limite percentual pendente nas Configurações.</p>}{aviso?.excedido&&<p role="status" className="pat-notice is-error">Manutenções somam {aviso.percentual.toFixed(1)}% da aquisição e ultrapassaram o limite configurado.</p>}{resumo.registros.length?<ol>{resumo.registros.map(m=><li key={m.id}>{m.data&&/^\d{4}-\d{2}-\d{2}$/.test(m.data)?dataLonga(m.data):'Data pendente'} · {m.descricao||m.defeito||'Serviço pendente'} · {m.valor==null||m.valor===''?'Valor pendente':brl(Number(m.valor))}</li>)}</ol>:<p>Nenhuma manutenção lançada.</p>}</>:<p role="status">Carregando histórico…</p>}</details>;
}
export function LinksManutencao({item}) {return podeAbrir('manutencoes')?<div className="info-actions"><Link className="btn-outline" to={caminhoManutencao({item:item.id,familia:'informatica',aba:'historico'})}>Ver histórico</Link><Link className="btn-outline" to={caminhoManutencao({item:item.id,familia:'informatica',lancar:true})}>Lançar manutenção</Link></div>:null;}
const CAMPO_COMUM=[['local','Local'],['fabricante','Fabricante'],['modelo','Modelo'],['marcaModelo','Marca e modelo'],['numeroSerie','Número de série']];
export function FormFisico({item,setItem,bens=[],setores=[],categorias=[],titulo,aoSalvar,aoFechar,erro='',conflito=false,ocupado=false,extras=[],children}) {
 const e=item.especificacao||{};
 const campo=(nome)=>ev=>setItem(v=>({...v,[nome]:ev.target.value}));
 const detalhe=(nome)=>ev=>setItem(v=>({...v,especificacao:{...v.especificacao,[nome]:ev.target.value}}));
 return <JanelaFormulario titulo={titulo} ocupado={ocupado} aoFechar={aoFechar}><form className="pat-form" onSubmit={aoSalvar}>{erro&&<p role="alert" className="pat-notice is-error">{erro}</p>}{conflito&&<p>Outra alteração foi salva. Seu preenchimento permanece aqui; feche e atualize antes de editar novamente.</p>}<fieldset disabled={ocupado||conflito} className="info-form">
 <label>Categoria<select className="input" value={item.categoria} disabled={!!item.id} onChange={campo('categoria')}>{categorias.map(c=><option key={c}>{c}</option>)}</select></label>
 <label>Nome para identificar<input className="input" required maxLength={180} value={item.nome||''} onChange={campo('nome')}/></label>
 <label>Identificação interna<input className="input" maxLength={120} value={item.identificacao||''} onChange={campo('identificacao')}/></label>
 {CAMPO_COMUM.map(([chave,rotulo])=><label key={chave}>{rotulo}<input className="input" maxLength={120} value={e[chave]||''} onChange={detalhe(chave)}/></label>)}
 {extras.map(([chave,rotulo])=><label key={chave}>{rotulo}<input className="input" type={chave==='instalacao'?'date':chave==='quantidade'?'number':'text'} min={chave==='quantidade'?0:undefined} step={chave==='quantidade'?1:undefined} maxLength={chave==='instalacao'||chave==='quantidade'?undefined:120} value={e[chave]||''} onChange={detalhe(chave)}/></label>)}
 {children}
 <label>Setor<select className="input" value={e.setorId||''} onChange={detalhe('setorId')}><option value="">Setor pendente</option>{e.setorId&&!setores.some(s=>s.id===e.setorId)&&<option value={e.setorId}>Setor antigo a conferir</option>}{setores.map(s=><option key={s.id} value={s.id}>{s.nome}</option>)}</select></label>
 <label>Situação<select className="input" value={e.situacao||''} onChange={detalhe('situacao')}><option value="">Pendente</option>{Object.entries(SITUACOES_INFORMATICA).map(([id,nome])=><option key={id} value={id}>{nome}</option>)}</select></label>
 <PessoaRH rotulo="Responsável no RH" valor={item.responsavelId||''} nome={item.responsavel||''} aoMudar={(responsavelId,responsavel)=>setItem(v=>({...v,responsavelId,responsavel}))}/>
 {podeAbrir('inventario-valores')&&<label>Bem do inventário<select className="input" value={item.bemId||''} onChange={campo('bemId')}><option value="">Sem vínculo</option>{item.bemId&&!bens.some(b=>b.id===item.bemId)&&<option value={item.bemId}>Vínculo anterior a conferir</option>}{bens.map(b=><option key={b.id} value={b.id}>{b.codigo||'Etiqueta pendente'} · {b.nomeGenerico||'Bem'}</option>)}</select></label>}
 </fieldset><div className="info-actions"><button className="btn-primary" disabled={ocupado||conflito}>{ocupado?'Salvando…':'Salvar ficha'}</button><button type="button" className="btn-ghost" onClick={aoFechar} disabled={ocupado}>Cancelar</button></div></form></JanelaFormulario>;
}
