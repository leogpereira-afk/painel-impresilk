import {caminhoManutencao} from '../../lib/calc/navegacao-patrimonio.js';
import PessoaRH,{usePessoasRH,comNomeRH} from './PessoasRH.jsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Plus, Pencil, Printer, Search, X, RefreshCw, ChevronLeft, ChevronRight, MapPin, UserRound, Wrench, Link2, Check } from 'lucide-react';
import JanelaFormulario from '../JanelaFormulario.jsx';
import BemDaFicha,{mandaBemId,trocarNaLista} from './BemDaFicha.jsx';
import FocoFicha,{useFocoFicha} from './FocoFicha.jsx';
import { vincularFicha } from '../../services/vinculo-patrimonio.js';
import { fichaAceitaBem } from '../../lib/calc/vinculo-patrimonio.js';
import { listarEquipamentosPatrimonio, salvarEstrutura } from '../../services/ativos.js';
import { lerManutencoes } from '../../services/manutencoes.js';
import { podeAbrir } from '../../lib/sessao.js';
import { CATEGORIAS_ESTRUTURA, prepararEstrutura, filtrarEstrutura, GRUPOS_ESTRUTURA, filtrarGrupoEstrutura, historicoEstrutura } from '../../lib/calc/estrutura-patrimonio.js';
import { textoAtualizacao } from '../../lib/calc/controles-patrimonio.js';
import { dataLonga } from '../../lib/format.js';
import './estrutura.css';

const POR_PAGINA = 15;
const dinheiro = valor => Number(valor).toLocaleString('pt-BR', {style:'currency',currency:'BRL'});
const fichaVazia = modo => ({ cadastroId: crypto.randomUUID(), nome: '', categoria: modo === 'eletrica' ? 'Elétrica' : modo === 'hidraulica' ? 'Hidráulica' : '', identificacao: '', responsavel: '', observacao: '', especificacao: { local: '', marcaModelo: '', quantidade: '1', instalacao: '' } });
const fichaDe = item => ({ id: item.id, nome: item.nome, categoria: item.categoria, identificacao: item.identificacao || '', responsavel: item.responsavel || '', responsavelId:item.responsavelId||'', observacao: item.observacao || '', especificacao: { ...item.especificacao, quantidade: item.especificacao?.quantidade || '1' }, atualizadoEm: item.atualizadoEm });
const assinaturaFicha = item => JSON.stringify([
  ...['nome', 'categoria', 'identificacao', 'responsavel', 'responsavelId', 'observacao'].map(campo => String(item[campo] ?? '').trim()),
  ...['local', 'marcaModelo', 'instalacao'].map(campo => String(item.especificacao?.[campo] ?? '').trim()),
  Number(item.especificacao?.quantidade),
]);

// Itens também lista as fichas de incêndio; o AVCB é documento e não se liga a bem.
const aceitaBem = form => fichaAceitaBem({ tipo: 'predial', categoria: form.categoria });
const ehEletrico = item => filtrarGrupoEstrutura([item], 'eletrica').length > 0;
const ehHidraulico = item => filtrarGrupoEstrutura([item], 'hidraulica').length > 0;
const pertenceSecao = (item, modo) => modo === 'eletrica' ? ehEletrico(item) : modo === 'hidraulica' ? ehHidraulico(item) : !ehEletrico(item) && !ehHidraulico(item);
export default function EstruturaLegada({ bens = [], setores = [], aoVerBem, aoMudarVinculo, modo = 'outros' }) {
  const {pessoas}=usePessoasRH();
  const grupo = modo === 'hidraulica' ? 'hidraulica' : modo === 'eletrica' ? 'eletrica' : 'todos';
  const [ledger, setLedger] = useState(null), [erroLedger, setErroLedger] = useState('');
  const pedidoLedger = useRef(0);
  const [ativos, setAtivos] = useState(null), [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(''), [mensagem, setMensagem] = useState('');
  const [busca, setBusca] = useState(''), [categoria, setCategoria] = useState('todos'), [pagina, setPagina] = useState(1);
  const [form, setForm] = useState(null), [salvando, setSalvando] = useState(false), [erroForm, setErroForm] = useState('');
  const [conflito, setConflito] = useState(false), [relatorio, setRelatorio] = useState(null);
  // O bem escolhido fica fora do formulário: salvarEstrutura não leva bemId, e o
  // vínculo é gravado depois, por vincularFicha, só quando a ficha está livre.
  const [bemEscolhido, setBemEscolhido] = useState(''), [erroVinculo, setErroVinculo] = useState('');
  const podeInventario = podeAbrir('inventario-valores');
  const pedido = useRef(0), formulario = useRef(0), podeManutencao = podeAbrir('manutencoes');
  const carregar = useCallback(async () => {
    const numero = ++pedido.current;
    setCarregando(true);setErro('');
    try { const dados = await listarEquipamentosPatrimonio();if (numero !== pedido.current) return null;setAtivos(dados);return dados; }
    catch (e) { if (numero === pedido.current) setErro(e.message);return null; }
    finally { if (numero === pedido.current) setCarregando(false); }
  }, []);
  useEffect(() => { carregar();const ref = pedido, ficha = formulario;return () => { ref.current++;ficha.current++; }; }, [carregar]);
  const carregarLedger = useCallback(async () => {
    if (!podeManutencao) return;
    const numero = ++pedidoLedger.current;setLedger(null);setErroLedger('');
    try { const dados = await lerManutencoes();if (numero === pedidoLedger.current) setLedger(dados); }
    catch (e) { if (numero === pedidoLedger.current) setErroLedger(e.message || 'Não foi possível carregar os serviços.'); }
  }, [podeManutencao]);
  useEffect(() => { if (podeManutencao) carregarLedger();else { setLedger(null);setErroLedger(''); }const ref = pedidoLedger;return () => {ref.current++;}; }, [podeManutencao, carregarLedger]);
  const itens = useMemo(() => prepararEstrutura((ativos || []).map(i=>comNomeRH(i,pessoas)), bens, setores).filter(i => pertenceSecao(i, modo)), [ativos, bens, setores,pessoas,modo]);
  const foco = useFocoFicha(itens);
  const lista = useMemo(() => filtrarEstrutura(filtrarGrupoEstrutura(itens, grupo), { busca, categoria }).filter(i => !foco.id || i.id === foco.id), [itens, busca, categoria, grupo, foco.id]);
  const historico = useMemo(() => ledger === null ? null : historicoEstrutura(ledger, filtrarGrupoEstrutura(itens, grupo)), [ledger, itens, grupo]);
  const categorias = useMemo(() => [...new Set([...CATEGORIAS_ESTRUTURA, ...itens.map(i => i.categoria)])].filter(c => c && pertenceSecao({categoria:c}, modo)), [itens,modo]);
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA)), atual = Math.min(pagina, paginas);
  const recorte = lista.slice((atual - 1) * POR_PAGINA, atual * POR_PAGINA);
  const filtrado = !!busca.trim() || categoria !== 'todos';
  const limpar = () => { setBusca('');setCategoria('todos');setPagina(1); };
  const abrir = item => { formulario.current++;setForm(item ? fichaDe(item) : fichaVazia(modo));setBemEscolhido('');setErroForm('');setConflito(false);setMensagem('');setErroVinculo(''); };
  const desfeito = r => { if (r?.ficha) { setAtivos(ant => trocarNaLista(ant || [], r.ficha));setForm(f => f && f.id === r.ficha.id ? { ...f, atualizadoEm: r.ficha.atualizadoEm } : f); } aoMudarVinculo?.(); };
  const fechar = () => { if (!salvando) { formulario.current++;setForm(null);setErroForm('');setConflito(false); } };
  const campo = nome => e => { formulario.current++;setForm(f => ({ ...f, [nome]: e.target.value })); };
  const especificacao = nome => e => { formulario.current++;setForm(f => ({ ...f, especificacao: { ...f.especificacao, [nome]: e.target.value } })); };
  async function salvar(e) {
    e.preventDefault();if (salvando || conflito) return;
    if (!form.nome.trim() || !form.categoria.trim() || !form.especificacao.local.trim()) { setErroForm('Preencha nome, categoria e local.');return; }
    if (!pertenceSecao({categoria:form.categoria}, modo)) { setErroForm('Escolha uma categoria desta seção.');return; }
    const quantidade = Number(form.especificacao.quantidade);
    if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 1000000) { setErroForm('Informe uma quantidade inteira maior que zero.');return; }
    const geracao = formulario.current;
    const ligar = podeInventario && bemEscolhido && aceitaBem(form) && mandaBemId((ativos || []).find(i => i.id === form.id) || null, bens) ? bemEscolhido : '';
    setSalvando(true);setErroForm('');setErroVinculo('');
    try {
      const { atualizadoEm, ...dados } = form;
      const salvo = await salvarEstrutura(dados, dados.id ? (atualizadoEm ?? '') : null);
      if (geracao !== formulario.current) return;
      ++pedido.current;
      setCarregando(false);
      setAtivos(ant => [...(ant || []).filter(i => i.id !== salvo.id), salvo]);
      // Um reenvio pode confirmar a primeira tentativa que chegou ao servidor.
      // Se houve edição depois da falha de rede, conserva o rascunho e passa a
      // editar o ID confirmado, usando sua versão para a próxima gravação.
      if (!dados.id && assinaturaFicha(dados) !== assinaturaFicha(salvo)) {
        const rascunho = { ...dados };delete rascunho.cadastroId;
        formulario.current++;
        setForm({ ...rascunho, id: salvo.id, atualizadoEm: salvo.atualizadoEm ?? '' });
        setErroForm('O cadastro da primeira tentativa foi confirmado. Seu preenchimento mais recente foi mantido. Clique em “Salvar item” para gravar estas alterações.');
        setConflito(false);setMensagem('');return;
      }
      formulario.current++;
      setForm(null);setMensagem('Item salvo. Ficha e manutenções usam este mesmo cadastro.');
      if (ligar) {
        try {
          const r = await vincularFicha({ bemId: ligar, ativoId: salvo.id, versaoFicha: salvo.atualizadoEm || '', versaoBem: bens.find(b => b.id === ligar)?.atualizadoEm || '', origem: 'ficha' });
          if (r?.ficha) setAtivos(ant => trocarNaLista(ant || [], r.ficha));
          setMensagem('Item salvo e ligado ao bem do inventário.');aoMudarVinculo?.();
        } catch (erroLigar) { setErroVinculo(`Ficha salva, mas o vínculo com o bem não foi feito: ${erroLigar.message}`); }
      }
    } catch (e) { if (geracao === formulario.current) { setErroForm(e.message);if (e.status === 409) setConflito(true); } }
    finally { setSalvando(false); }
  }
  async function carregarVersaoAtual() {
    const id = form?.id;
    if (!id) return;
    if (!window.confirm('Carregar a ficha atual vai substituir o preenchimento deste formulário. Continuar?')) return;
    const geracao = ++formulario.current;
    const dados = await carregar();
    if (geracao !== formulario.current) return;
    const registro = dados?.find(i => i.id === id);
    if (registro) { setForm(fichaDe(registro));setConflito(false);setErroForm('Ficha atual carregada. Confira antes de salvar.'); }
    else setErroForm(dados ? 'Este item foi removido. Feche o formulário e confira a lista atual.' : 'Não foi possível carregar a ficha. Seu preenchimento foi mantido.');
  }
  function abrirRelatorio() {
    setRelatorio({ itens: lista, categoria, grupo: GRUPOS_ESTRUTURA.find(g => g.id === grupo)?.nome, busca: busca.trim(), em: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) });
  }
  if (relatorio) return <div className="pat-print pat-estrutura-report">
    <div className="sem-impressao pat-print-toolbar"><button className="btn-ghost" onClick={() => setRelatorio(null)}><ChevronLeft size={18}/>Voltar à Estrutura</button><button className="btn-primary" onClick={() => window.print()}><Printer size={18}/>Imprimir / salvar PDF</button><p>Escolha “Salvar como PDF”. O relatório inclui todos os itens do filtro, com local, responsável e última atualização.</p></div>
    <header className="pat-report-title"><span>IMPRESILK · PATRIMÔNIO</span><h1>Estrutura</h1><p>{relatorio.itens.length} cadastros · Emitido em {relatorio.em}</p><p>{relatorio.grupo} · {relatorio.categoria === 'todos' ? 'Todas as categorias' : relatorio.categoria}{relatorio.busca ? ` · Busca: ${relatorio.busca}` : ''}</p></header>
    <table className="pat-table pat-estrutura-table"><thead><tr><th>Item / identificação</th><th>Categoria / quantidade</th><th>Local / responsável</th><th>Modelo / instalação</th><th>Observações / atualização</th></tr></thead><tbody>{relatorio.itens.map(item => <tr key={item.id}><td><strong>{item.nome}</strong><small>{item.identificacao || item.codigo || 'Sem identificação'}</small></td><td>{item.categoria}<small>Quantidade: {item.especificacao?.quantidade || 'Não informada'}</small></td><td>{item.local || 'Local não informado'}<small>{item.responsavel || 'Responsável não informado'}</small>{item.setor && <small>Setor: {item.setor}</small>}</td><td>{item.especificacao?.marcaModelo || 'Não informado'}<small>{item.especificacao?.instalacao ? dataLonga(item.especificacao.instalacao) : 'Data não informada'}</small></td><td>{item.observacao || '—'}<small>{textoAtualizacao(item)}</small></td></tr>)}</tbody></table>
  </div>;

  return <section className="pat-estrutura" aria-label="Estrutura da empresa">
    <div className="pat-list-heading"><div className="pat-estrutura-heading"><span aria-hidden="true"><Building2 size={23}/></span><div><h2>{modo === 'eletrica' ? 'Instalações elétricas anteriores' : modo === 'hidraulica' ? 'Hidráulica' : 'Itens'}</h2><p>Fichas e serviços que já estavam cadastrados.</p></div></div><div className="pat-actions"><button className="btn-ghost" disabled={carregando || salvando} onClick={() => {carregarLedger();return carregar();}} aria-label="Atualizar estrutura"><RefreshCw size={17}/></button><button className="btn-outline" disabled={!lista.length || !!erro || carregando} onClick={abrirRelatorio}><Printer size={17}/>Salvar PDF</button><button className="btn-primary" disabled={ativos === null || salvando} onClick={() => abrir()}><Plus size={17}/>Novo item de estrutura</button></div></div>
    <div className="pat-estrutura-intro"><Building2 size={18} aria-hidden="true"/><p>{modo === 'eletrica' ? 'As fichas anteriores de elétrica e iluminação continuam com seus locais e históricos de serviço.' : modo === 'hidraulica' ? 'Instalações hidráulicas e caixas-d’água, com seus locais e históricos de serviço.' : 'Ar-condicionado, ventiladores, bebedouros, cozinha e demais itens, com suas fichas e históricos de serviço.'}</p></div>
    {podeManutencao && <div className="pat-estrutura-totais" aria-live="polite">{erroLedger ? <p role="alert">Histórico indisponível: {erroLedger} <button className="btn-ghost" onClick={carregarLedger}>Tentar novamente</button></p> : !historico ? <p>Consultando histórico e custos…</p> : <><span>Serviços neste mês <strong>{dinheiro(historico.mes)}</strong></span><span>Serviços neste ano <strong>{dinheiro(historico.ano)}</strong></span></>}</div>}
    <div className="pat-estrutura-tools"><div className="pat-search"><Search size={18} aria-hidden="true"/><input className="input" aria-label="Buscar na estrutura" placeholder="Nome, identificação, local ou responsável…" value={busca} onChange={e => { setBusca(e.target.value);setPagina(1); }}/>{busca && <button type="button" aria-label="Limpar busca" onClick={() => { setBusca('');setPagina(1); }}><X size={16}/></button>}</div><label>Categoria<select className="input" value={categoria} onChange={e => { setCategoria(e.target.value);setPagina(1); }}><option value="todos">Todas as categorias</option>{categorias.map(c => <option key={c} value={c}>{c}</option>)}</select></label></div>
    <div className="pat-estrutura-count" aria-live="polite"><span>{ativos === null ? 'Consultando estrutura…' : `${lista.length} de ${itens.length} cadastros`}{filtrado && ' neste filtro'}</span>{filtrado && <button className="btn-ghost" onClick={limpar}>Limpar filtros</button>}</div>
    {erro && <p className="pat-notice is-error" role="alert">{erro}<button className="btn-ghost" onClick={carregar}>Tentar novamente</button></p>}
    {mensagem && <p className="pat-estrutura-success" role="status"><Check size={17}/>{mensagem}</p>}
    {erroVinculo && <p className="pat-notice is-error" role="alert">{erroVinculo}</p>}
    <FocoFicha foco={foco}/>
    {ativos === null ? <p role="status">{carregando ? 'Carregando itens…' : 'Estrutura indisponível.'}</p> : !lista.length ? <div className="pat-empty"><Building2 size={30}/><h3>{filtrado ? 'Nenhum item neste filtro' : 'Organize a estrutura da empresa'}</h3><p>{filtrado ? 'Tente outro nome, local ou categoria.' : 'Comece pelos equipamentos e instalações. Registre o local para encontrar cada item com facilidade.'}</p><button className="btn-outline" onClick={filtrado ? limpar : () => abrir()}>{filtrado ? 'Ver todos' : 'Cadastrar primeiro item'}</button></div> : <>
      <div className="pat-estrutura-cards">{recorte.map(item => <article key={item.id} className="pat-estrutura-card">
        <div className="pat-estrutura-card-heading"><div><strong className="pat-estrutura-name">{item.nome}</strong><span className="pat-estrutura-category">{item.categoria}</span></div><span className="pat-estrutura-detail"><MapPin size={14}/>{item.local || 'Local não informado'}</span></div>
        <details><summary>Detalhes do item</summary><p>{item.identificacao || item.codigo || 'Sem identificação'} · {item.responsavel || 'Responsável não informado'}</p><p>{item.modelo || 'Modelo não informado'} · Quantidade: {item.quantidade || 'Não informada'}</p>{item.instalacao && <p>Instalado em {dataLonga(item.instalacao)}</p>}{item.setor && <p>Setor: {item.setor}</p>}{item.observacao && <p>{item.observacao}</p>}<small>{textoAtualizacao(item)}</small></details>
        {podeManutencao && <details><summary>Histórico de serviços</summary>{erroLedger ? <p>Histórico indisponível.</p> : !historico ? <p>Carregando serviços…</p> : !historico.porItem[item.id]?.length ? <p>Nenhum serviço registrado.</p> : <ul className="pat-estrutura-history">{historico.porItem[item.id].map(r => <li key={r.id}><strong>{dataLonga(r.data)}</strong><span>{r.descricao || 'Serviço não informado'}</span><span>Quem fez: {r.fornecedor || 'Não informado'}</span><strong>{dinheiro(r.valor)}</strong></li>)}</ul>}</details>}
        <div className="pat-estrutura-actions"><button className="btn-outline" onClick={() => abrir(item)} aria-label={`Editar ${item.nome}`}><Pencil size={15}/>Editar</button>{podeManutencao && <Link className="btn-ghost" to={caminhoManutencao({item:item.id, familia:'predial', categoria:item.categoria, lancar:true})} aria-label={`Lançar serviço em ${item.nome}`}><Wrench size={15}/>Lançar serviço</Link>}{item.bem && aoVerBem && <button className="btn-ghost" onClick={() => aoVerBem(item.bem)}><Link2 size={15}/>Ver patrimônio</button>}{item.vinculo === 'conflito' && <small>Vínculo patrimonial a conferir</small>}</div>
      </article>)}</div>
      <div className="pat-pagination"><span>{(atual - 1) * POR_PAGINA + 1}–{Math.min(atual * POR_PAGINA, lista.length)} de {lista.length}</span><div><button className="btn-outline" disabled={atual === 1} onClick={() => setPagina(atual - 1)} aria-label="Página anterior"><ChevronLeft size={17}/></button><span>{atual} / {paginas}</span><button className="btn-outline" disabled={atual === paginas} onClick={() => setPagina(atual + 1)} aria-label="Próxima página"><ChevronRight size={17}/></button></div></div>
    </>}
    {form && <JanelaFormulario titulo={form.id ? 'Editar item de estrutura' : 'Novo item de estrutura'} aoFechar={fechar} ocupado={salvando}>
      <form className="pat-estrutura-form" onSubmit={salvar}>
        <p className="pat-estrutura-hint">Nome, categoria e local são obrigatórios. Os demais campos ajudam a identificar e cuidar do item.</p>
        {erroForm && <div role="alert" className="pat-notice is-error">{erroForm}{conflito && <button type="button" className="btn-outline" onClick={carregarVersaoAtual} disabled={carregando}>Carregar ficha atual</button>}</div>}
        <fieldset disabled={salvando}><div className="pat-estrutura-form-grid">
          <label className="pat-estrutura-wide" htmlFor="estrutura-nome">Nome do item *<input className="input" id="estrutura-nome" value={form.nome} onChange={campo('nome')} maxLength={180} required placeholder="Ex.: Ar-condicionado da sala de reunião"/></label>
          <label htmlFor="estrutura-categoria">Categoria *<input className="input" id="estrutura-categoria" list="estrutura-categorias" value={form.categoria} onChange={campo('categoria')} maxLength={120} required placeholder="Escolha ou escreva"/><datalist id="estrutura-categorias">{categorias.map(c => <option key={c} value={c}/>)}</datalist></label>
          <label htmlFor="estrutura-identificacao">Número / identificação<input className="input" id="estrutura-identificacao" value={form.identificacao} onChange={campo('identificacao')} maxLength={120} placeholder="Ex.: AR-01, PORTÃO-02"/></label>
          <label htmlFor="estrutura-local">Local onde fica *<input className="input" id="estrutura-local" list="estrutura-locais" value={form.especificacao.local || ''} onChange={especificacao('local')} maxLength={120} required placeholder="Ex.: Administrativo · sala de reunião"/><datalist id="estrutura-locais">{[...new Set(setores.map(s => s.nome).filter(Boolean))].map(local => <option key={local} value={local}/>)}</datalist></label>
          <PessoaRH valor={form.responsavelId||''} nome={form.responsavel||''} aoMudar={(responsavelId,responsavel)=>{formulario.current++;setForm(f=>({...f,responsavelId,responsavel}));}}/>
          <label htmlFor="estrutura-modelo">Marca / modelo<input className="input" id="estrutura-modelo" value={form.especificacao.marcaModelo || ''} onChange={especificacao('marcaModelo')} maxLength={120} placeholder="Ex.: Marca, modelo, capacidade"/></label>
          <label htmlFor="estrutura-quantidade">Quantidade<input className="input" id="estrutura-quantidade" type="number" min="1" max="1000000" step="1" value={form.especificacao.quantidade} onChange={especificacao('quantidade')} required/></label>
          <label htmlFor="estrutura-instalacao">Data da instalação<input className="input" id="estrutura-instalacao" type="date" value={form.especificacao.instalacao || ''} onChange={especificacao('instalacao')}/></label>
          {podeInventario && aceitaBem(form) && <BemDaFicha classe="pat-estrutura-wide" ficha={(ativos || []).find(i => i.id === form.id) || null} valor={bemEscolhido} aoMudar={setBemEscolhido} bens={bens} fichas={ativos || []} aoVerBem={aoVerBem ? b => { fechar();aoVerBem(b); } : undefined} aoDesfeito={desfeito}/>}
          <label className="pat-estrutura-wide" htmlFor="estrutura-observacao">Observações<textarea className="input" id="estrutura-observacao" rows={3} value={form.observacao} onChange={campo('observacao')} maxLength={2000} placeholder="Capacidade, tensão, cuidados ou outras informações úteis"/></label>
        </div></fieldset>
        <p className="pat-estrutura-hint">Para acompanhar cada equipamento separadamente, cadastre uma ficha por item. Use quantidade quando os itens forem iguais e estiverem no mesmo local.</p>
        {form.atualizadoEm && <small className="pat-updated">Versão carregada: {new Date(form.atualizadoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</small>}
        <div className="pat-estrutura-form-footer"><button type="button" className="btn-outline" onClick={fechar} disabled={salvando}>Cancelar</button><button type="submit" className="btn-primary" disabled={salvando || conflito}>{salvando ? 'Salvando…' : 'Salvar item'}</button></div>
      </form>
    </JanelaFormulario>}
  </section>;
}
