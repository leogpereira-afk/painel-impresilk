import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileText, FolderOpen, Link2, Plus, RefreshCw, Search, Users } from 'lucide-react';
import { podeAbrir } from '../lib/sessao.js';
import { dataLonga } from '../lib/format.js';
import { CATEGORIAS_DOCUMENTOS, ESTADOS_CONTROLE, controleEditavel, dataValida, validarControle } from '../lib/calc/documentos.js';
import { documentoEmpresa, hojeBrasilia, resumirDocumentosLicitacoes } from '../lib/calc/documentos-licitacoes.js';
import * as api from '../services/documentos.js';
import JanelaFormulario from './JanelaFormulario.jsx';
import { FormTitular } from './documentos/FormCadastros.jsx';
import './documentos/documentos.css';
import './documentos-licitacoes.css';

const GRUPOS = { ok: 'Em dia', urgente: 'Vencendo', vencido: 'Vencidos', conferir: 'A conferir' };
const TONS = { ok: 'chip-ok', urgente: 'chip-warn', vencido: 'chip-bad', conferir: 'chip-warn' };
const data = valor => !valor ? 'Não informada' : dataValida(valor) ? dataLonga(valor) : 'Data inválida';

export default function DocumentosLicitacoes({ sessao }) {
  const chave = JSON.stringify([sessao?.usuario, sessao?.id, sessao?.master, sessao?.permissoes || []]);
  const atual = useRef(chave);
  atual.current = chave;
  const sessaoVigente = useCallback(() => atual.current === chave, [chave]);
  if (!podeAbrir('licitacoes', sessao) || !podeAbrir('documentos', sessao)) return <section className="documentos"><p className="doc-notice is-error" role="alert">É necessário acesso a Licitações e Documentos para consultar os documentos da empresa.</p></section>;
  return <AcervoDocumentos key={chave} sessaoVigente={sessaoVigente}/>;
}

function AcervoDocumentos({ sessaoVigente }) {
  const [dados, setDados] = useState(null), [erro, setErro] = useState(''), [mensagem, setMensagem] = useState('');
  const [erroConsulta, setErroConsulta] = useState('');
  const [carregando, setCarregando] = useState(true), [ocupado, setOcupado] = useState(false), [janela, setJanela] = useState(null);
  const [hoje, setHoje] = useState(hojeBrasilia), [busca, setBusca] = useState(''), [grupo, setGrupo] = useState(''), [titularId, setTitularId] = useState(''), [categoria, setCategoria] = useState('');
  const montado = useRef(false), leitura = useRef(0), abortador = useRef(null);
  const vigente = useCallback(() => montado.current && sessaoVigente(), [sessaoVigente]);
  const carregar = useCallback(async () => {
    if (!vigente()) return;
    const pedido = ++leitura.current;
    setCarregando(true);
    try {
      const resposta = await api.listarDocumentos({ signal: abortador.current?.signal });
      if (!vigente() || pedido !== leitura.current) return;
      if (!Array.isArray(resposta.itens) || !Array.isArray(resposta.titulares)) throw new Error('Não foi possível conferir o acervo. Atualize para tentar novamente.');
      setDados({ itens: resposta.itens.filter(documentoEmpresa), titulares: resposta.titulares.filter(t => t.tipo === 'empresa') });
      setErroConsulta('');
    } catch (e) { if (vigente() && pedido === leitura.current) setErroConsulta(e.message); }
    finally { if (vigente() && pedido === leitura.current) setCarregando(false); }
  }, [vigente]);
  useEffect(() => {
    montado.current = true;
    const contador = leitura;
    const controle = new AbortController();
    abortador.current = controle;
    void carregar();
    return () => { montado.current = false; contador.current++; controle.abort(); };
  }, [carregar]);
  useEffect(() => {
    const atualizarDia = () => setHoje(hojeBrasilia());
    const aoFocar = () => atualizarDia();
    const aoVisivel = () => { if (document.visibilityState === 'visible') atualizarDia(); };
    const timer = window.setInterval(atualizarDia, 30000);
    window.addEventListener('focus', aoFocar);
    document.addEventListener('visibilitychange', aoVisivel);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', aoFocar); document.removeEventListener('visibilitychange', aoVisivel); };
  }, []);
  const vm = useMemo(() => resumirDocumentosLicitacoes(dados?.itens, hoje), [dados?.itens, hoje]);
  const q = busca.trim().toLocaleLowerCase('pt-BR');
  const lista = vm.lista.filter(i => (!grupo ? i.sit.grupo !== 'encerrado' : i.sit.grupo === grupo) && (!titularId || i.titularId === titularId) && (!categoria || i.categoria === categoria) && (!q || [i.nome, i.categoria, i.titularNome, i.orgaoEmissor].join(' ').toLocaleLowerCase('pt-BR').includes(q)));
  const candidatos = (dados?.itens || []).filter(i => i.usoLicitacoes !== true && !['cancelado', 'encerrado'].includes(i.estado));
  const categorias = [...new Set(vm.lista.map(i => i.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const options = () => ({ signal: abortador.current?.signal });
  function abrir(valor) { setErro(''); setMensagem(''); setJanela(valor); }
  function fechar() { if (!ocupado) { setJanela(null); setErro(''); } }
  function atualizarItem(item) { if (vigente()) setDados(d => ({ ...d, itens: [...d.itens.filter(i => i.id !== item.id), item] })); }
  async function gravar(operacao, sucesso) {
    if (!vigente() || ocupado) return;
    leitura.current++; setCarregando(false);
    setOcupado(true); setErro(''); setMensagem('');
    try {
      await operacao();
      if (!vigente()) return;
      setJanela(null); setMensagem(sucesso);
    } catch (e) { if (vigente()) setErro(e.status === 409 ? `${e.message} O preenchimento foi preservado. Feche o formulário e atualize o acervo antes de tentar novamente.` : e.message); }
    finally { if (vigente()) setOcupado(false); }
  }
  const salvarDocumento = (item, arquivo) => gravar(async () => {
    const preparado = arquivo ? await api.prepararArquivo(arquivo) : undefined;
    if (!vigente()) return;
    const salvar = janela.renovacao ? api.renovarControle : api.salvarControle;
    const salvo = await salvar({ ...item, usoLicitacoes: true }, janela.item?.atualizadoEm ?? null, preparado, options());
    atualizarItem(salvo);
  }, janela?.renovacao ? 'Renovação salva. O histórico anterior foi preservado.' : 'Documento salvo no acervo da empresa.');
  const vincular = id => gravar(async () => {
    const existente = candidatos.find(i => i.id === id);
    if (!existente) throw new Error('Selecione um documento disponível da empresa.');
    const salvo = await api.salvarControle({ id: existente.id, usoLicitacoes: true }, existente.atualizadoEm ?? null, undefined, options());
    atualizarItem(salvo);
  }, 'Documento vinculado. O arquivo e o histórico permanecem no mesmo cadastro.');
  const salvarEmpresa = item => gravar(async () => {
    const salvo = await api.salvarTitular({ ...item, tipo: 'empresa', pessoaId: '' }, undefined, options());
    if (vigente()) setDados(d => ({ ...d, titulares: [...d.titulares, salvo] }));
  }, 'Titular empresa cadastrado.');
  async function baixar(item, versaoId, arquivoId) {
    if (!vigente() || ocupado) return;
    setOcupado(true); setErro('');
    try { await api.baixarDocumento(item, versaoId, arquivoId, { ...options(), podeAbrirArquivo: vigente }); }
    catch (e) { if (vigente()) setErro(e.message); }
    finally { if (vigente()) setOcupado(false); }
  }
  return <section className="documentos lic-docs">
    <header className="lic-docs-header"><div><h2><FolderOpen size={21}/>Documentos da empresa</h2><p>Validade do arquivo; confira as exigências de cada edital.</p></div><div className="doc-actions">
      <button type="button" className="btn-ghost" onClick={carregar} disabled={carregando || ocupado} aria-label="Atualizar documentos da empresa"><RefreshCw size={16}/></button>
      <button type="button" className="btn-ghost" onClick={() => abrir({ tipo: 'titular' })} disabled={!dados || ocupado}><Users size={16}/>Cadastrar empresa</button>
      <button type="button" className="btn-outline" onClick={() => abrir({ tipo: 'vinculo' })} disabled={!dados || ocupado}><Link2 size={16}/>Vincular documento existente</button>
      <button type="button" className="btn-primary" onClick={() => abrir({ tipo: 'documento', item: { cadastroId: crypto.randomUUID(), tipo: 'documento', usoLicitacoes: true, titularId: dados.titulares.length === 1 ? dados.titulares[0].id : '', alertaDias: 30, estado: 'ativo' } })} disabled={!dados || ocupado}><Plus size={16}/>Novo documento</button>
    </div></header>
    {erroConsulta && <p className="doc-notice is-error" role="alert">{erroConsulta}{dados && ' Os itens abaixo são da última consulta; a atualização não foi concluída.'}</p>}
    {erro && !janela && <p className="doc-notice is-error" role="alert">{erro}</p>}{mensagem && <p className="doc-notice is-ok" role="status">{mensagem}</p>}
    {!dados ? <p role="status" className="doc-note">{carregando ? 'Carregando documentos…' : 'Não foi possível carregar o acervo. Use Atualizar para tentar novamente.'}</p> : <>
      <div className="doc-kpis lic-docs-counts">{Object.entries(GRUPOS).map(([id, rotulo]) => <button type="button" key={id} className={`doc-kpi ${id === 'vencido' ? 'is-bad' : ['urgente', 'conferir'].includes(id) ? 'is-warn' : ''}`} aria-pressed={grupo === id} onClick={() => setGrupo(g => g === id ? '' : id)}><span>{rotulo}</span><strong>{vm.contagens[id]}</strong></button>)}</div>
      <div className="doc-filters lic-docs-filters">
        <label className="label doc-search"><span><Search size={14}/>Buscar documento</span><input className="input" type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome, categoria ou empresa"/></label>
        <label className="label">Empresa<select className="input" value={titularId} onChange={e => setTitularId(e.target.value)}><option value="">Todas as empresas</option>{dados.titulares.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}</select></label>
        <label className="label">Categoria<select className="input" value={categoria} onChange={e => setCategoria(e.target.value)}><option value="">Todas as categorias</option>{categorias.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
        <label className="label">Situação<select className="input" value={grupo} onChange={e => setGrupo(e.target.value)}><option value="">Documentos ativos</option>{Object.entries(GRUPOS).map(([id, rotulo]) => <option key={id} value={id}>{rotulo}</option>)}<option value="encerrado">Cancelados / encerrados ({vm.contagens.encerrado})</option></select></label>
        {(busca || titularId || categoria || grupo) && <button type="button" className="btn-ghost" onClick={() => { setBusca(''); setTitularId(''); setCategoria(''); setGrupo(''); }}>Limpar filtros</button>}
      </div>
      <p className="doc-note" aria-live="polite">{lista.length} documento{lista.length === 1 ? '' : 's'} no recorte · referência {data(hoje)} (Brasília){carregando ? ' · Atualizando…' : ''}</p>
      <div className="lic-docs-list">{lista.map(item => <article key={item.id} className="lic-docs-row">
        <div className="lic-docs-main"><div className="lic-docs-title"><FileText size={18}/><strong>{item.nome}</strong></div><small>{item.categoria} · {item.titularNome || dados.titulares.find(t => t.id === item.titularId)?.nome}</small>{item.estado === 'renovacao' && <span className="chip">Em renovação</span>}</div>
        <dl className="lic-docs-dates"><div><dt>Emissão</dt><dd>{data(item.emissao)}</dd></div><div><dt>Validade</dt><dd>{item.semVencimento ? 'Sem vencimento' : data(item.validade)}</dd></div></dl>
        <div className="lic-docs-status"><span className={`chip ${TONS[item.sit.grupo] || ''}`}>{item.sit.rotulo}</span>{!item.temArquivo && item.validade && <small>Validade declarada; arquivo ausente</small>}</div>
        <div className="doc-actions lic-docs-actions">{item.temArquivo && <button type="button" className="btn-outline" disabled={ocupado} onClick={() => baixar(item)} aria-label={`Abrir arquivo de ${item.nome}`}><Download size={15}/>Abrir arquivo</button>}<button type="button" className="btn-ghost" disabled={ocupado} onClick={() => abrir({ tipo: 'documento', item })} aria-label={`Editar ${item.nome}`}>Editar</button>{item.sit.grupo !== 'encerrado' && <button type="button" className="btn-ghost" disabled={ocupado} onClick={() => abrir({ tipo: 'documento', item, renovacao: true })} aria-label={`Renovar ${item.nome}`}><RefreshCw size={14}/>Renovar</button>}</div>
        <details className="lic-docs-details"><summary>Detalhes e histórico{item.versoes?.length ? ` · ${item.versoes.length} versões` : ''}</summary><dl className="doc-data"><div><dt>Órgão emissor</dt><dd>{item.orgaoEmissor || 'Não informado'}</dd></div><div><dt>Estado do controle</dt><dd>{ESTADOS_CONTROLE[item.estado] || 'Ativo'}</dd></div></dl>{item.observacao && <p className="doc-note">{item.observacao}</p>}{/^https?:\/\//i.test(item.linkOficial || '') && <a className="doc-official-link" href={item.linkOficial} target="_blank" rel="noopener noreferrer">Consulta no órgão emissor</a>}
          {!!item.anexos?.length && <div className="doc-actions">{item.anexos.map(a => <button type="button" key={a.id} className="btn-outline" disabled={ocupado} onClick={() => baixar(item, undefined, a.id)}><Download size={14}/>{a.nome}</button>)}</div>}
          {item.versoes?.length ? <ul className="doc-versions">{[...item.versoes].reverse().map(v => <li key={v.id}><div><strong>{v.arquivo?.nome || 'Versão anterior'}</strong><small>Emissão: {data(v.emissao)} · Validade: {data(v.validade)}</small></div><div className="doc-actions">{v.anexos?.length ? v.anexos.map(a => <button type="button" key={a.id} className="btn-outline" disabled={ocupado} onClick={() => baixar(item, v.id, a.id)}><Download size={14}/>{a.nome}</button>) : v.arquivo && <button type="button" className="btn-outline" disabled={ocupado} onClick={() => baixar(item, v.id)}>Abrir versão</button>}</div></li>)}</ul> : <p className="doc-note">As versões anteriores aparecerão aqui após uma renovação.</p>}
        </details>
      </article>)}</div>
      {!lista.length && <div className="lic-docs-empty"><FolderOpen size={26}/><strong>{vm.lista.length ? 'Nenhum documento neste recorte' : 'A pasta da empresa está vazia'}</strong><p>{vm.lista.length ? 'Ajuste a busca ou os filtros para conferir o acervo.' : 'Cadastre um documento ou vincule um arquivo existente da empresa.'}</p></div>}
    </>}
    {janela && <JanelaFormulario titulo={janela.tipo === 'titular' ? 'Cadastrar empresa titular' : janela.tipo === 'vinculo' ? 'Vincular documento existente' : janela.renovacao ? 'Renovar documento' : janela.item?.id ? 'Editar documento' : 'Novo documento'} classe="doc-modal" ocupado={ocupado} aoFechar={fechar}>
      {janela.tipo === 'documento' && <FormDocumento inicial={janela.item} titulares={dados.titulares} renovacao={janela.renovacao} ocupado={ocupado} erro={erro} aoSalvar={salvarDocumento} aoFechar={fechar}/>}
      {janela.tipo === 'titular' && <FormTitular pessoalPermitido={false} ocupado={ocupado} erro={erro} aoSalvar={salvarEmpresa} aoFechar={fechar}/>}
      {janela.tipo === 'vinculo' && <FormVinculo itens={candidatos} ocupado={ocupado} erro={erro} aoSalvar={vincular} aoFechar={fechar}/>}
    </JanelaFormulario>}
  </section>;
}

function FormVinculo({ itens, ocupado, erro, aoSalvar, aoFechar }) {
  const [id, setId] = useState('');
  return <form className="doc-form" onSubmit={e => { e.preventDefault(); aoSalvar(id); }}>
    {erro && <p className="doc-notice is-error" role="alert">{erro}</p>}
    <p className="doc-note">Selecione um documento da empresa já cadastrado. O arquivo e seu histórico continuam no mesmo registro.</p>
    <label className="label">Documento existente<select className="input" required disabled={ocupado} value={id} onChange={e => setId(e.target.value)}><option value="">Selecione pelo cadastro</option>{itens.map(i => <option key={i.id} value={i.id}>{i.nome} · {i.titularNome} · ID {i.id}</option>)}</select></label>
    {!itens.length && <p className="doc-note">Nenhum outro documento de empresa disponível para vincular neste acesso.</p>}
    <div className="doc-actions doc-footer"><button className="btn-primary" disabled={ocupado || !id}>{ocupado ? 'Vinculando…' : 'Vincular documento'}</button><button type="button" className="btn-ghost" disabled={ocupado} onClick={aoFechar}>Cancelar</button></div>
  </form>;
}

function FormDocumento({ inicial, titulares, renovacao, ocupado, erro, aoSalvar, aoFechar }) {
  const [item, setItem] = useState(() => ({ alertaDias: 30, estado: 'ativo', ...controleEditavel(inicial) }));
  const [arquivo, setArquivo] = useState(null), [erroLocal, setErroLocal] = useState('');
  const campo = chave => e => setItem(i => ({ ...i, [chave]: e.target.value }));
  function salvar(e) {
    e.preventDefault();
    const payload = { ...item, nome: String(item.nome || '').trim(), tipo: 'documento', usoLicitacoes: true, validade: item.semVencimento ? '' : item.validade || '', alertaDias: Number(item.alertaDias) };
    const falha = validarControle(payload, renovacao, !!arquivo);
    if (falha) return setErroLocal(falha);
    if (!titulares.some(t => t.id === item.titularId)) return setErroLocal('Selecione uma empresa cadastrada.');
    if (!inicial.id && String(item.categoria || '').trim().toUpperCase() === 'AVCB') return setErroLocal('O AVCB deve ser cadastrado na Prevenção contra incêndio, na área Patrimônio.');
    if (arquivo?.size > 3 * 1024 * 1024) return setErroLocal('O arquivo deve ter até 3 MB.');
    setErroLocal(''); aoSalvar(payload, arquivo);
  }
  return <form className="doc-form" onSubmit={salvar} onInvalidCapture={e => { const detalhe = e.target.closest('details'); if (detalhe) detalhe.open = true; }}>
    {(erroLocal || erro) && <p className="doc-notice is-error" role="alert">{erroLocal || erro}</p>}
    {renovacao && <p className="doc-note">Anexe a nova versão. O arquivo e as datas anteriores serão preservados no histórico.</p>}
    <fieldset className="doc-fields" disabled={ocupado}>
      <label className="label">Nome do documento<input className="input" required maxLength={200} value={item.nome || ''} onChange={campo('nome')}/></label>
      <label className="label">Empresa titular<select className="input" required value={item.titularId || ''} onChange={campo('titularId')}><option value="">Selecione a empresa</option>{titulares.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}</select>{!titulares.length && <small>Feche o formulário e use “Cadastrar empresa” para incluir o titular.</small>}</label>
      <label className="label">Categoria<input className="input" required maxLength={200} list="categorias-licitacoes-documentos" value={item.categoria || ''} onChange={campo('categoria')}/><datalist id="categorias-licitacoes-documentos">{CATEGORIAS_DOCUMENTOS.empresa.map(c => <option key={c} value={c}/>)}</datalist></label>
      <label className="label">Arquivo {renovacao ? '(obrigatório)' : '(opcional)'}<input className="input" type="file" required={renovacao} accept="application/pdf,image/png,image/jpeg,image/webp" onChange={e => setArquivo(e.target.files?.[0] || null)}/><small>PDF ou imagem, até 3 MB.{inicial.arquivoNome ? ` Atual: ${inicial.arquivoNome}.` : ' Sem arquivo, permanece a conferir.'}</small></label>
      <label className="label">Data de emissão<input className="input" type="date" value={item.emissao || ''} onChange={campo('emissao')}/></label>
      <div className="label"><label>{renovacao ? 'Nova validade' : 'Validade'}<input className="input" type="date" min={item.emissao || undefined} disabled={item.semVencimento} value={item.validade || ''} onChange={campo('validade')}/></label><label className="doc-check"><input type="checkbox" checked={!!item.semVencimento} onChange={e => setItem(i => ({ ...i, semVencimento: e.target.checked, validade: e.target.checked ? '' : i.validade }))}/>Sem vencimento</label><small>Ausência de data não confirma que o documento está em dia.</small></div>
      <details className="doc-subsection doc-wide"><summary>Órgão, consulta e observações</summary><div className="doc-subfields">
        <label className="label">Órgão emissor<input className="input" maxLength={200} value={item.orgaoEmissor || ''} onChange={campo('orgaoEmissor')}/></label>
        <label className="label">Link de consulta<input className="input" type="url" placeholder="https://" maxLength={2000} value={item.linkOficial || ''} onChange={campo('linkOficial')}/></label>
        <label className="label">Alerta antes (dias)<input className="input" type="number" min={0} max={365} step={1} required value={item.alertaDias} onChange={campo('alertaDias')}/></label>
        <label className="label">Estado do controle<select className="input" value={item.estado} onChange={campo('estado')}>{Object.entries(ESTADOS_CONTROLE).map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}</select></label>
        <label className="label doc-wide">Observação<textarea className="input" rows={3} maxLength={4000} value={item.observacao || ''} onChange={campo('observacao')}/></label>
      </div></details>
    </fieldset>
    <div className="doc-actions doc-footer"><button className="btn-primary" disabled={ocupado}>{ocupado ? 'Salvando…' : renovacao ? 'Salvar renovação' : 'Salvar documento'}</button><button type="button" className="btn-ghost" disabled={ocupado} onClick={aoFechar}>Cancelar</button></div>
  </form>;
}
