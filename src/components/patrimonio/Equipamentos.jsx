import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Car, Cog, Search, X, Printer, RefreshCw, ChevronLeft, ChevronRight, ArrowUpRight, Link2 } from 'lucide-react';
import { listarEquipamentosPatrimonio } from '../../services/ativos.js';
import { podeAbrir } from '../../lib/sessao.js';
import { projetarEquipamentos, filtrarEquipamentos } from '../../lib/calc/equipamentos-patrimonio.js';
import { textoAtualizacao } from '../../lib/calc/controles-patrimonio.js';
import './equipamentos.css';

const POR_PAGINA = 15;
const TIPOS = {
  veiculo: { titulo: 'Carros', singular: 'carro', identificacao: 'Placa', icone: Car },
  maquina: { titulo: 'Máquinas', singular: 'máquina', identificacao: 'Número de série', icone: Cog },
};
const rotuloVinculo = item => item.vinculo === 'conflito' ? 'Vínculo a conferir'
  : item.bem ? (item.codigo || 'Ficha vinculada') : 'Sem vínculo no inventário';
const caminhoManutencao = id => `/manutencoes?aba=itens&item=${encodeURIComponent(id)}`;

export default function EquipamentosPatrimonio({ tipo, bens = [], setores = [], aoVerBem }) {
  const meta = TIPOS[tipo], Icone = meta.icone;
  const [ativos, setAtivos] = useState(null), [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false), [busca, setBusca] = useState('');
  const [vinculo, setVinculo] = useState('todos'), [pagina, setPagina] = useState(1), [relatorio, setRelatorio] = useState(null);
  const pedido = useRef(0);
  const gerenciar = podeAbrir('manutencoes');
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

  const equipamentos = useMemo(() => projetarEquipamentos(ativos || [], bens, setores), [ativos, bens, setores]);
  const todos = equipamentos.filter(item => item.tipo === tipo);
  const lista = useMemo(() => filtrarEquipamentos(equipamentos, { tipo, busca, vinculo }), [equipamentos, tipo, busca, vinculo]);
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA)), atual = Math.min(pagina, paginas);
  const recorte = lista.slice((atual - 1) * POR_PAGINA, atual * POR_PAGINA);
  const comFiltro = Boolean(busca.trim()) || vinculo !== 'todos';
  const limpar = () => { setBusca('');setVinculo('todos');setPagina(1); };
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
      <div className="pat-equip-title"><span aria-hidden="true"><Icone size={23}/></span><div><h2>{meta.titulo}</h2><p>O mesmo cadastro usado pela Manutenção.</p></div></div>
      <div className="pat-actions">
        <button className="btn-ghost" onClick={carregar} disabled={carregando} aria-label={`Atualizar ${meta.titulo.toLowerCase()}`} title="Atualizar cadastros"><RefreshCw size={17}/></button>
        <button className="btn-outline" onClick={abrirRelatorio} disabled={!lista.length || carregando || !!erro}><Printer size={17}/>Salvar PDF</button>
        {gerenciar && <Link className="btn-primary" to="/manutencoes?aba=itens"><ArrowUpRight size={17}/>Gerenciar em Manutenções</Link>}
      </div>
    </div>
    <p className="pat-equip-shared"><Link2 size={16} aria-hidden="true"/><span><strong>Base compartilhada.</strong> As fichas são cadastradas e alteradas em Manutenções. Aqui você consulta os mesmos equipamentos e seus vínculos com o inventário.</span></p>
    <div className="pat-equip-tools">
      <div className="pat-search"><Search size={18} aria-hidden="true"/><input className="input" aria-label={`Buscar ${meta.titulo.toLowerCase()}`} placeholder={tipo === 'veiculo' ? 'Nome, placa, modelo, setor ou responsável…' : 'Nome, série, modelo, setor ou responsável…'} value={busca} onChange={e => { setBusca(e.target.value);setPagina(1); }}/>{busca && <button type="button" aria-label="Limpar busca" onClick={() => { setBusca('');setPagina(1); }}><X size={16}/></button>}</div>
      <label>Vínculo com o inventário<select className="input" value={vinculo} onChange={e => { setVinculo(e.target.value);setPagina(1); }}><option value="todos">Todos</option><option value="vinculado">Com ficha no inventário</option><option value="sem-vinculo">Sem vínculo confirmado</option></select></label>
    </div>
    <div className="pat-equip-count" aria-live="polite"><span>{ativos === null ? 'Consultando a base compartilhada…' : `${lista.length} de ${todos.length} ${todos.length === 1 ? meta.singular : meta.titulo.toLowerCase()}`}</span>{comFiltro && <button type="button" onClick={limpar}>Limpar filtros</button>}</div>
    {erro && <p className="pat-notice is-error" role="alert">{erro}<button className="btn-ghost" onClick={carregar} disabled={carregando}>Tentar novamente</button></p>}
    {ativos === null ? <p role="status">{carregando ? 'Carregando equipamentos…' : 'Não foi possível consultar os equipamentos.'}</p> : !lista.length ? <div className="pat-empty"><Icone size={28}/><h3>{comFiltro ? 'Nenhum equipamento encontrado' : `Nenhum ${meta.singular} cadastrado`}</h3><p>{comFiltro ? 'Tente outro nome, identificação ou filtro.' : `Os registros de ${meta.titulo.toLowerCase()} da Manutenção aparecerão aqui automaticamente.`}</p>{comFiltro && <button className="btn-outline" onClick={limpar}>Ver todos</button>}</div> : <>
      <div className="pat-table-wrap"><table className="pat-table pat-equip-table"><thead><tr><th>Equipamento</th><th>{meta.identificacao} / modelo</th><th>Setor</th><th>Responsável</th><th>Inventário</th>{gerenciar && <th>Manutenção</th>}</tr></thead>
        <tbody>{recorte.map(item => <tr key={item.id}>
          <td data-label="Equipamento"><strong className="pat-equip-name">{item.nome || 'Sem nome'}</strong><small className="pat-updated">{textoAtualizacao(item)}</small></td>
          <td data-label={`${meta.identificacao} / modelo`}><strong>{item.identificacao || 'Não informado'}</strong><small>{[item.modelo, item.ano].filter(Boolean).join(' · ') || 'Modelo não informado'}</small></td>
          <td data-label="Setor">{item.setor || 'Não informado'}</td><td data-label="Responsável">{item.responsavel || 'Não informado'}</td>
          <td data-label="Inventário">{item.bem && aoVerBem ? <button className="pat-equip-inventory" onClick={() => aoVerBem(item.bem)} aria-label={`Ver ficha de ${item.nome} no inventário`}><Link2 size={14}/>{rotuloVinculo(item)}</button> : <span className={item.vinculo === 'conflito' ? 'pat-equip-conflict' : 'pat-equip-unlinked'}>{rotuloVinculo(item)}</span>}{item.bem?.situacao === 'baixado' && <small>Baixado no inventário</small>}</td>
          {gerenciar && <td data-label="Manutenção"><Link className="pat-equip-manage" to={caminhoManutencao(item.id)} aria-label={`Abrir ${item.nome} em Manutenções`}>Abrir ficha<ArrowUpRight size={15}/></Link></td>}
        </tr>)}</tbody>
      </table></div>
      <div className="pat-pagination"><span>{(atual - 1) * POR_PAGINA + 1}–{Math.min(atual * POR_PAGINA, lista.length)} de {lista.length}</span><div><button className="btn-outline" disabled={atual === 1} onClick={() => setPagina(atual - 1)} aria-label="Página anterior"><ChevronLeft size={17}/></button><span>{atual} / {paginas}</span><button className="btn-outline" disabled={atual === paginas} onClick={() => setPagina(atual + 1)} aria-label="Próxima página"><ChevronRight size={17}/></button></div></div>
    </>}
  </section>;
}
