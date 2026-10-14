import {equipamentosComBens} from '../../lib/calc/area-bem.js';
import {usePessoasRH,comNomeRH} from './PessoasRH.jsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link,useSearchParams } from 'react-router-dom';
import { Car, Cog, Search, X, Printer, RefreshCw, ChevronLeft, ChevronRight, ArrowUpRight, Link2, Plus, Pencil } from 'lucide-react';
import { listarEquipamentosPatrimonio,listarAtivos } from '../../services/ativos.js';
import { podeAbrir } from '../../lib/sessao.js';
import { projetarEquipamentos, filtrarEquipamentos, vinculoDoEquipamento, bensParaFicha } from '../../lib/calc/equipamentos-patrimonio.js';
import { textoAtualizacao } from '../../lib/calc/controles-patrimonio.js';
import {caminhoManutencao} from '../../lib/calc/navegacao-patrimonio.js';
import CadastroEquipamento from './CadastroEquipamento.jsx';
import './equipamentos.css';

const POR_PAGINA = 15;
const TIPOS = {
  veiculo: { titulo: 'Carros', singular: 'carro', identificacao: 'Placa', icone: Car },
  maquina: { titulo: 'Máquinas', singular: 'máquina', identificacao: 'Número de série', icone: Cog },
};
const rotuloVinculo = item => item.vinculo === 'conflito' ? 'Vínculo a conferir'
  : item.bem ? (item.codigo || 'Ficha vinculada') : 'Sem vínculo no inventário';


export default function EquipamentosPatrimonio({ tipo, bens = [], setores = [], aoVerBem, aoMudarVinculo, vinculos=null, erroVinculos, aoTentarVinculos }) {
  const [params,setParams]=useSearchParams();
  const [form,setForm]=useState(null);
  const meta = TIPOS[tipo], Icone = meta.icone;
  const {pessoas}=usePessoasRH();
  const [ativos, setAtivos] = useState(null), [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false), [busca, setBusca] = useState(''), [mensagem, setMensagem] = useState('');
  const [vinculo, setVinculo] = useState('todos'), [pagina, setPagina] = useState(1), [relatorio, setRelatorio] = useState(null);
  const pedido = useRef(0);
  const gerenciar = podeAbrir('manutencoes');
  const cadastro=params.get('cadastro'),fichaId=params.get('ficha'),itemId=params.get('item');
  const limparPedido=()=>setParams(p=>{const n=new URLSearchParams(p);n.delete('cadastro');n.delete('ficha');return n;},{replace:true});
  const fecharFormulario=()=>{setForm(null);limparPedido();};
  const novo=()=>{setErro('');setForm({cadastroId:crypto.randomUUID(),tipo,nome:'',especificacao:{}});};
  const editar=async id=>{setErro('');setCarregando(true);try{const lista=await listarAtivos();const item=lista.find(i=>i.id===id&&i.tipo===tipo);if(!item)throw new Error('Ficha indisponível para edição. Confira o cadastro e suas permissões.');setForm(item);}catch(e){setErro(e.message);}finally{setCarregando(false);}};
  useEffect(()=>{setForm(null);if(!gerenciar)return;if(cadastro==='novo'){setForm({cadastroId:crypto.randomUUID(),tipo,nome:'',especificacao:{}});}else if(fichaId){let vivo=true;listarAtivos().then(lista=>{if(!vivo)return;const item=lista.find(i=>i.id===fichaId&&i.tipo===tipo);if(item)setForm(item);else setErro('Ficha indisponível para edição.');}).catch(e=>{if(vivo)setErro(e.message);});return()=>{vivo=false;};}},[tipo,cadastro,fichaId,gerenciar]);
  const carregar = useCallback(async () => {
    const numero = ++pedido.current;
    setCarregando(true);setErro('');
    try {
      const dados = await listarEquipamentosPatrimonio();
      if (pedido.current === numero) setAtivos(dados);
    } catch (e) {
      if (pedido.current === numero) setErro(e.message);
    } finally {
      if (pedido.current === numero) setCarregando(false);
    }
  }, []);
  useEffect(() => { carregar(); const ref = pedido; return () => { ref.current++; }; }, [carregar]);
  useEffect(() => { setBusca('');setVinculo('todos');setPagina(1);setRelatorio(null); }, [tipo]);

  const equipamentos = useMemo(() => equipamentosComBens(projetarEquipamentos((ativos || []).map(i=>comNomeRH(i,pessoas)), bens, setores), aoVerBem?bens:[], setores, vinculos, tipo), [ativos, bens, setores,pessoas,vinculos,tipo,aoVerBem]);
  const todos = equipamentos.filter(item => item.tipo === tipo);
  const lista = useMemo(() => filtrarEquipamentos(equipamentos, { tipo, busca, vinculo }).filter(item=>!itemId||item.id===itemId), [equipamentos, tipo, busca, vinculo,itemId]);
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA)), atual = Math.min(pagina, paginas);
  const recorte = lista.slice((atual - 1) * POR_PAGINA, atual * POR_PAGINA);
  const comFiltro = Boolean(busca.trim()) || vinculo !== 'todos' || Boolean(itemId);
  const limpar = () => { setBusca('');setVinculo('todos');setPagina(1);if(itemId)setParams(p=>{const n=new URLSearchParams(p);n.delete('item');return n;},{replace:true}); };
  const abrirRelatorio = () => setRelatorio({
    itens: lista, busca: busca.trim(), filtro: vinculo === 'todos' ? 'Todos' : vinculo === 'vinculado' ? 'Com ficha no inventário' : 'Sem vínculo confirmado',
    em: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
  });

  if (relatorio) return <div className="pat-print pat-controle-relatorio pat-equip-report">
    <div className="sem-impressao pat-print-toolbar">
      <button className="btn-ghost" onClick={() => setRelatorio(null)}><ChevronLeft size={18}/>Voltar</button>
      <button className="btn-primary" onClick={() => window.print()}><Printer size={18}/>Imprimir / salvar PDF</button>
      <p>Escolha “Salvar como PDF” na impressão. O relatório inclui todos os registros da busca e do filtro.</p>
    </div>
    <header className="pat-report-title"><span>IMPRESILK · PATRIMÔNIO</span><h1>{meta.titulo}</h1><p>Base compartilhada com Manutenções · {relatorio.itens.length} {relatorio.itens.length === 1 ? 'registro' : 'registros'}</p><p>Emitido em {relatorio.em} · Filtro: {relatorio.filtro}{relatorio.busca ? ` · Busca: ${relatorio.busca}` : ''}</p></header>
    <div className="pat-table-wrap"><table className="pat-table pat-equip-table"><thead><tr><th>Equipamento / atualização</th><th>{meta.identificacao} / modelo</th><th>Setor</th><th>Responsável</th><th>Inventário</th></tr></thead>
      <tbody>{relatorio.itens.map(item => <tr key={item.id}><td><strong>{item.nome || 'Sem nome'}</strong><small>{textoAtualizacao(item)}</small></td><td>{item.identificacao || 'Não informado'}<small>{[item.modelo, item.ano].filter(Boolean).join(' · ') || 'Modelo não informado'}</small></td><td>{item.setor || 'Não informado'}</td><td>{item.responsavel || 'Não informado'}</td><td>{rotuloVinculo(item)}{item.bem?.situacao === 'baixado' && <small>Baixado no inventário</small>}</td></tr>)}</tbody>
    </table></div>
  </div>;

  return <section className="pat-equipamentos" aria-label={meta.titulo}>
    <div className="pat-list-heading">
      <div className="pat-equip-title"><span aria-hidden="true"><Icone size={23}/></span><div><h2>{meta.titulo}</h2><p>Todos os equipamentos desta área, com ou sem dados técnicos complementares.</p></div></div>
      <div className="pat-actions">
        <button className="btn-ghost" onClick={carregar} disabled={carregando} aria-label={`Atualizar ${meta.titulo.toLowerCase()}`} title="Atualizar cadastros"><RefreshCw size={17}/></button>
        <button className="btn-outline" onClick={abrirRelatorio} disabled={!lista.length || carregando || !!erro}><Printer size={17}/>Salvar PDF</button>
        {gerenciar && <button className="btn-primary" onClick={novo} disabled={carregando}><Plus size={17}/>Cadastrar {meta.singular}</button>}
      </div>
    </div>
    {form&&<CadastroEquipamento key={form.id||form.cadastroId} inicial={form} setores={setores} bensLivres={bensParaFicha(bens,ativos||[],form.id||form.cadastroId)} bemAtual={form.id?vinculoDoEquipamento(form,bens).bem:null} aoFechar={fecharFormulario} aoConcluir={async()=>{fecharFormulario();setMensagem('');await carregar();aoMudarVinculo?.();}} aoDesvincular={async()=>{fecharFormulario();await carregar();aoMudarVinculo?.();setMensagem('Vínculo desfeito. O bem e a ficha continuam cadastrados.');}}/>}
    <p className="pat-equip-shared"><Link2 size={16} aria-hidden="true"/><span><strong>Um cadastro por equipamento.</strong> Bens do inventário aparecem aqui ao escolher a área. Complete os dados técnicos no próprio bem quando precisar de manutenção.</span></p>
    <div className="pat-equip-tools">
      <div className="pat-search"><Search size={18} aria-hidden="true"/><input className="input" aria-label={`Buscar ${meta.titulo.toLowerCase()}`} placeholder={tipo === 'veiculo' ? 'Nome, placa, modelo, setor ou responsável…' : 'Nome, série, modelo, setor ou responsável…'} value={busca} onChange={e => { setBusca(e.target.value);setPagina(1); }}/>{busca && <button type="button" aria-label="Limpar busca" onClick={() => { setBusca('');setPagina(1); }}><X size={16}/></button>}</div>
      <label>Vínculo com o inventário<select className="input" value={vinculo} onChange={e => { setVinculo(e.target.value);setPagina(1); }}><option value="todos">Todos</option><option value="vinculado">Com ficha no inventário</option><option value="sem-vinculo">Sem vínculo confirmado</option></select></label>
    </div>
    <div className="pat-equip-count" aria-live="polite"><span>{ativos === null ? 'Consultando a base compartilhada…' : `${lista.length} de ${todos.length} ${todos.length === 1 ? meta.singular : meta.titulo.toLowerCase()}`}</span>{comFiltro && <button type="button" onClick={limpar}>Limpar filtros</button>}</div>
    {erroVinculos&&<p className="pat-notice is-error" role="alert">A lista dos bens do inventário não foi confirmada. <button className="btn-ghost" onClick={aoTentarVinculos}>Atualizar bens</button></p>}{aoVerBem&&!vinculos&&!erroVinculos&&<p role="status">Conferindo bens do inventário…</p>}
    {mensagem && <p className="pat-notice" role="status">{mensagem}</p>}
    {erro && <p className="pat-notice is-error" role="alert">{erro}<button className="btn-ghost" onClick={carregar} disabled={carregando}>Tentar novamente</button></p>}
    {ativos === null ? <p role="status">{carregando ? 'Carregando equipamentos…' : 'Não foi possível consultar os equipamentos.'}</p> : !lista.length ? <div className="pat-empty"><Icone size={28}/><h3>{comFiltro ? 'Nenhum equipamento encontrado' : `Nenhum ${meta.singular} cadastrado`}</h3><p>{comFiltro ? 'Tente outro nome, identificação ou filtro.' : `Os registros de ${meta.titulo.toLowerCase()} aparecerão aqui após o cadastro.`}</p>{comFiltro && <button className="btn-outline" onClick={limpar}>Ver todos</button>}</div> : <>
      <div className="pat-table-wrap"><table className="pat-table pat-equip-table"><thead><tr><th>Equipamento</th><th>{meta.identificacao} / modelo</th><th>Setor</th><th>Responsável</th><th>Inventário</th>{gerenciar && <th>Manutenção</th>}</tr></thead>
        <tbody>{recorte.map(item => <tr key={item.id}>
          <td data-label="Equipamento"><strong className="pat-equip-name">{item.nome || 'Sem nome'}</strong><small className="pat-updated">{item.somenteBem?"Bem do inventário · dados técnicos opcionais":textoAtualizacao(item)}</small></td>
          <td data-label={`${meta.identificacao} / modelo`}><strong>{item.identificacao || 'Não informado'}</strong><small>{[item.modelo, item.ano].filter(Boolean).join(' · ') || 'Modelo não informado'}</small></td>
          <td data-label="Setor">{item.setor || 'Não informado'}</td><td data-label="Responsável">{item.responsavel || 'Não informado'}</td>
          <td data-label="Inventário">{item.bem && aoVerBem ? <button className="pat-equip-inventory" onClick={() => aoVerBem(item.bem)} aria-label={`Ver ficha de ${item.nome} no inventário`}><Link2 size={14}/>{rotuloVinculo(item)}</button> : <span className={item.vinculo === 'conflito' ? 'pat-equip-conflict' : 'pat-equip-unlinked'}>{rotuloVinculo(item)}</span>}{item.bem?.situacao === 'baixado' && <small>Baixado no inventário</small>}</td>
          {gerenciar && <td data-label="Manutenção">{item.somenteBem?<button className="btn-outline" onClick={()=>aoVerBem?.(item.bem)}>Completar dados técnicos</button>:<><button className="btn-ghost" aria-label={`Editar cadastro de ${item.nome}`} onClick={()=>editar(item.id)} disabled={carregando}><Pencil size={14}/>Editar</button><Link className="pat-equip-manage" to={caminhoManutencao({item:item.id})} aria-label={`Abrir ${item.nome} em Manutenções`}>Abrir ficha<ArrowUpRight size={15}/></Link></>}</td>}
        </tr>)}</tbody>
      </table></div>
      <div className="pat-pagination"><span>{(atual - 1) * POR_PAGINA + 1}–{Math.min(atual * POR_PAGINA, lista.length)} de {lista.length}</span><div><button className="btn-outline" disabled={atual === 1} onClick={() => setPagina(atual - 1)} aria-label="Página anterior"><ChevronLeft size={17}/></button><span>{atual} / {paginas}</span><button className="btn-outline" disabled={atual === paginas} onClick={() => setPagina(atual + 1)} aria-label="Próxima página"><ChevronRight size={17}/></button></div></div>
    </>}
  </section>;
}
