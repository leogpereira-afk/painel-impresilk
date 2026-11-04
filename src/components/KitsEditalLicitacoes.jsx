import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, FolderOpen, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { CATEGORIAS_DOCUMENTOS, dataValida } from '../lib/calc/documentos.js';
import { aplicarEscolhaConflito, mesclarKitEmConflito, rotuloCampoConflito, textoValorConflito, hojeBrasilia, situacaoArquivoLicitacoes } from '../lib/calc/documentos-licitacoes.js';
import { dataLonga } from '../lib/format.js';
import * as kitsApi from '../services/licitacoes-kits.js';
import JanelaFormulario from './JanelaFormulario.jsx';
import './kits-edital-licitacoes.css';

const data = valor => dataValida(valor) ? dataLonga(valor) : 'Não informada';
const nomeEdital = item => item?.nome || item?.titulo || item?.numeroEdital || item?.orgao || 'Edital';
const vazio = (licitacaoId = '', titularId = '') => ({ cadastroId: crypto.randomUUID(), nome: 'Kit documental', licitacaoId, titularId, requisitos: [] });

function dadosRequisito(requisito, documentos) {
  const doc = documentos.find(d => d.id === requisito.documentoId), versoes = doc?.versoes || [];
  const versao = requisito.versaoId ? versoes.find(v => v.id === requisito.versaoId) : null;
  const snapshot = requisito.snapshot || versao?.snapshot || (requisito.versaoId ? versao : doc);
  const anexos = (requisito.versaoId ? versao?.anexos : doc?.anexos) || [];
  const sit = !requisito.dispensado && snapshot ? situacaoArquivoLicitacoes({ ...snapshot, tipo: 'documento', temArquivo: !!(doc?.temArquivo || versao?.arquivo) }, hojeBrasilia()) : null;
  const incompleto = !requisito.categoria?.trim() || !requisito.descricao?.trim();
  const pendente = incompleto || (requisito.dispensado ? !requisito.justificativa?.trim() : !requisito.documentoId || !snapshot || sit?.grupo !== 'ok');
  const rotulo = incompleto ? 'Completar requisito' : requisito.dispensado ? requisito.justificativa?.trim() ? 'Não se aplica' : 'Justificar dispensa' : sit?.rotulo || 'Documento pendente';
  return { doc, versoes, snapshot, anexos, sit, pendente, rotulo };
}
export function payloadKit(item) {
  const campos = ['id', 'cadastroId', 'nome', 'licitacaoId', 'titularId'];
  const payload = Object.fromEntries(campos.filter(c => item[c] !== undefined && !(c === 'cadastroId' && item.id)).map(c => [c, item[c]]));
  payload.requisitos = (item.requisitos || []).map(r => Object.fromEntries(['id', 'categoria', 'descricao', 'documentoId', 'versaoId', 'arquivoId', 'dispensado', 'justificativa'].filter(c => r[c] !== undefined).map(c => [c, r[c]])));
  return payload;
}
export function validarKit(item) {
  if (!item.nome?.trim() || !item.licitacaoId || !item.titularId) return 'Informe o nome, o edital e a empresa titular.';
  if (!item.requisitos?.length) return 'Adicione ao menos um requisito que você conferiu no edital.';
  if (item.requisitos.length > 60) return 'O kit permite até 60 requisitos.';
  for (const r of item.requisitos) {
    if (!r.categoria?.trim() || !r.descricao?.trim()) return 'Informe a categoria e a descrição de cada requisito.';
    if (r.dispensado && !r.justificativa?.trim()) return 'Explique por que cada requisito marcado não se aplica a este edital.';
  }
  return '';
}

export default function KitsEditalLicitacoes({ documentos = [], titulares = [], licitacoes = [], licitacaoSelecionada, aoLimparSelecao, vigente = () => true }) {
  const [itens, setItens] = useState(null), [erro, setErro] = useState(''), [mensagem, setMensagem] = useState('');
  const [janela, setJanela] = useState(null), [ocupado, setOcupado] = useState(false), [carregando, setCarregando] = useState(false), [conflito, setConflito] = useState(false);
  const ciclo = useRef(0), ativo = useRef(false), abortador = useRef(null), operacao = useRef(false), instanteJanela = useRef(0);
  const vivo = useCallback(() => ativo.current && vigente(), [vigente]);
  const carregar = useCallback(async () => {
    if (!vivo() || operacao.current) return;
    const pedido = ++ciclo.current;
    setCarregando(true);
    try {
      const lista = await kitsApi.listarKits({ signal: abortador.current?.signal, vigente: vivo });
      if (!vivo() || pedido !== ciclo.current) return;
      if (!Array.isArray(lista)) throw new Error('Não foi possível conferir os kits cadastrados.');
      setItens(lista); setErro('');
    } catch (e) { if (vivo() && pedido === ciclo.current) setErro(e.message); }
    finally { if (vivo() && pedido === ciclo.current) setCarregando(false); }
  }, [vivo]);
  useEffect(() => {
    ativo.current = true; const contador = ciclo, instancia = instanteJanela; const controlador = new AbortController(); abortador.current = controlador;
    void carregar();
    return () => { ativo.current = false; contador.current++; instancia.current++; controlador.abort(); };
  }, [carregar]);
  const selecionadaId = typeof licitacaoSelecionada === 'string' ? licitacaoSelecionada : licitacaoSelecionada?.id;
  const editais = licitacaoSelecionada && typeof licitacaoSelecionada === 'object' && !licitacoes.some(l => l.id === selecionadaId) ? [licitacaoSelecionada, ...licitacoes] : licitacoes;
  const lista = (itens || []).filter(k => !selecionadaId || k.licitacaoId === selecionadaId);
  function abrir(kit) { if (operacao.current) return; instanteJanela.current++; setJanela(kit); setErro(''); setMensagem(''); setConflito(false); }
  function fechar() { if (!operacao.current) { instanteJanela.current++; setJanela(null); setErro(''); setConflito(false); } }
  async function salvar(item) {
    if (!vivo() || operacao.current) return;
    const instancia = instanteJanela.current;
    operacao.current = true; ciclo.current++; setOcupado(true); setErro('');
    try {
      const salvo = await kitsApi.salvarKit(payloadKit(item), janela?.atualizadoEm ?? null, { signal: abortador.current?.signal, vigente: vivo });
      if (!vivo() || instancia !== instanteJanela.current) return;
      setItens(anteriores => [...(anteriores || []).filter(k => k.id !== salvo.id), salvo]);
      setJanela(null); setMensagem('Kit salvo. Os vínculos preservam as versões escolhidas.'); setConflito(false);
    } catch (e) { if (vivo() && instancia === instanteJanela.current) { setConflito(e.status === 409); if (e.status === 409) setJanela(j => ({ ...j, licitacaoId: item.licitacaoId, titularId: item.titularId })); setErro(e.status === 409 ? `${e.message} Seu preenchimento está preservado. Releia a versão salva antes de reaplicar alterações.` : e.message); } }
    finally { operacao.current = false; if (vivo()) { setOcupado(false); setCarregando(false); } }
  }
  async function reler() {
    if (!vivo() || operacao.current) return;
    operacao.current = true; setOcupado(true);
    try {
      const lista = await kitsApi.listarKits({ signal: abortador.current?.signal, vigente: vivo });
      if (!vivo()) return;
      if (!Array.isArray(lista)) throw new Error('Não foi possível conferir os kits cadastrados.');
      const atual = lista.find(k => janela.id ? k.id === janela.id : k.licitacaoId === janela.licitacaoId && k.titularId === janela.titularId);
      if (!atual) throw new Error('Este kit não está mais disponível. O preenchimento foi preservado.');
      setItens(lista); setJanela(atual); setConflito(false);
      setErro(`Versão salva relida: “${atual.nome}”, ${atual.requisitos.length} requisitos. Confira o preenchimento preservado antes de salvar novamente.`);
    } catch (e) { if (vivo()) setErro(e.message); }
    finally { operacao.current = false; if (vivo()) setOcupado(false); }
  }
  async function baixar(kit) {
    if (!vivo() || operacao.current) return;
    operacao.current = true; setOcupado(true); setErro(''); setMensagem('Preparando kit…');
    try {
      const manifesto = await kitsApi.baixarKit(kit, { signal: abortador.current?.signal, vigente: vivo, progresso: msg => { if (vivo()) setMensagem(msg); } });
      if (vivo()) setMensagem(`Download do ZIP iniciado: ${manifesto.arquivos.length} arquivo(s) e índice. ${manifesto.pendencias?.length ? `${manifesto.pendencias.length} pendência(s) registradas no índice.` : 'Confira o edital antes de usar.'}`);
    } catch (e) { if (vivo()) { setErro(e.message); setMensagem(''); } }
    finally { operacao.current = false; if (vivo()) setOcupado(false); }
  }
  return <section className="lic-kits" aria-label="Kits por edital">
    <header className="lic-kits-header"><div><h2><FolderOpen size={19}/>Kits por edital</h2><p>Requisitos conferidos por você, com versões preservadas e pendências explícitas.</p></div><div className="doc-actions"><button className="btn-ghost" type="button" aria-label="Atualizar kits" disabled={ocupado || carregando} onClick={carregar}><RefreshCw size={16}/></button><button className="btn-primary" type="button" disabled={ocupado || !itens || !editais.length || !titulares.length} onClick={() => abrir(vazio(selecionadaId || '', titulares.length === 1 ? titulares[0].id : ''))}><Plus size={16}/>Novo kit</button></div></header>
    {selecionadaId && <p className="lic-kits-filter">Edital: <strong>{nomeEdital(editais.find(l => l.id === selecionadaId))}</strong>{aoLimparSelecao && <button type="button" className="btn-ghost" onClick={aoLimparSelecao}>Ver todos os kits</button>}</p>}
    {erro && !janela && <p className="doc-notice is-error" role="alert">{erro}{itens && ' A lista abaixo é da última consulta.'}</p>}
    {mensagem && <p className="doc-note" role="status">{mensagem}</p>}
    {!editais.length && <p className="doc-note">Cadastre um edital em Acompanhamento para montar seu kit.</p>}
    {!titulares.length && <p className="doc-note">Cadastre a empresa titular abaixo para montar o kit.</p>}
    {!itens && <p className="doc-note" role="status">{carregando ? 'Carregando kits…' : 'Use Atualizar kits para tentar novamente.'}</p>}
    {itens && !lista.length && <p className="doc-note">Nenhum kit neste recorte. Adicione os requisitos aplicáveis do edital; o catálogo não define obrigatoriedade.</p>}
    <div className="lic-kits-list">{lista.map(kit => <article className="lic-kit-row" key={kit.id}><div><strong>{kit.nome}</strong><small>{nomeEdital(editais.find(l => l.id === kit.licitacaoId))} · {titulares.find(t => t.id === kit.titularId)?.nome || 'Titular indisponível'}</small><small>{kit.requisitos.length} requisito(s) · {kit.requisitos.filter(r => r.dispensado).length} não aplicável(is)</small></div><span className={`chip ${kit.pendencias?.length ? 'chip-warn' : ''}`}>{kit.pendencias?.length ? `${kit.pendencias.length} pendência(s)` : 'Conferir edital'}</span><div className="doc-actions"><button type="button" className="btn-outline" disabled={ocupado} onClick={() => abrir(kit)}>Abrir kit</button><button type="button" className="btn-outline" disabled={ocupado} onClick={() => baixar(kit)}><Download size={15}/>Baixar ZIP</button></div><details><summary>Pendências, versões e histórico</summary>{kit.pendencias?.length ? <ul>{kit.pendencias.map((p, i) => <li key={i}>{p}</li>)}</ul> : <p>Nenhuma pendência identificada nos vínculos cadastrados. Confira o edital.</p>}<ul>{kit.requisitos.map(r => <li key={r.id}><strong>{r.categoria}</strong> — {r.dispensado ? `Não se aplica: ${r.justificativa}` : `${r.snapshot?.nome || 'Documento faltante'} · emissão ${data(r.snapshot?.emissao)} · validade ${r.snapshot?.semVencimento ? 'sem vencimento declarado' : data(r.snapshot?.validade)}`}<small>{r.descricao}</small></li>)}</ul><p>{kit.historico?.length || 0} revisão(ões) · última atualização: {kit.atualizadoEm || 'Não informada'}</p></details></article>)}</div>
    <p className="doc-note lic-kit-note">ZIP de até 40 MiB e 79 documentos + índice. Pacotes com pendências são identificados no índice; o download não representa habilitação ou envio.</p>
    {janela && <JanelaFormulario titulo={janela.id ? 'Editar kit do edital' : 'Novo kit do edital'} classe="doc-modal lic-doc-modal lic-kit-modal" ocupado={ocupado} aoFechar={fechar}>{conflito && <button className="btn-outline" type="button" disabled={ocupado} onClick={reler}>Recarregar versão sem apagar preenchimento</button>}<FormKit inicial={janela} documentos={documentos} titulares={titulares} editais={editais} ocupado={ocupado} erro={erro} aoSalvar={salvar} aoFechar={fechar}/></JanelaFormulario>}
  </section>;
}

export function FormKit({ inicial, documentos, titulares, editais, ocupado, erro, aoSalvar, aoFechar }) {
  const [item, setItem] = useState(() => structuredClone(inicial)), [erroLocal, setErroLocal] = useState('');
  const [conflitosCampos, setConflitosCampos] = useState([]), [mesclado, setMesclado] = useState(false);
  const [abertos, setAbertos] = useState(() => Object.fromEntries(inicial.requisitos.map(r => [r.id, dadosRequisito(r, documentos).pendente])));
  const base = useRef(inicial), rascunho = useRef(item);
  rascunho.current = item;
  useEffect(() => {
    if (base.current.atualizadoEm === inicial.atualizadoEm && base.current.id === inicial.id) return;
    const resultado = mesclarKitEmConflito(base.current, rascunho.current, inicial);
    setItem(resultado.item); setConflitosCampos(resultado.conflitos); setMesclado(true); setErroLocal(''); base.current = inicial;
  }, [inicial]);
  function resumoConflito(conflito, lado) {
    const valor = conflito[lado];
    if (conflito.caminho.at(-1) !== 'documentacao') return textoValorConflito(valor);
    if (valor?.dispensado) return `Não se aplica: ${valor.justificativa || 'Motivo não informado'}`;
    const doc = documentos.find(d => d.id === valor?.documentoId);
    const snapshot = lado === 'local' ? conflito.snapshotLocal : conflito.snapshotRemoto;
    if (!valor?.documentoId) return 'Pendente — sem documento';
    const versao = doc?.versoes?.find(v => v.id === valor.versaoId);
    const dados = snapshot || versao?.snapshot || versao || doc;
    return `${snapshot?.nome || doc?.nome || 'Documento indisponível'} · ${valor.versaoId ? 'versão preservada' : 'versão atual'} · emissão ${data(dados?.emissao)} · validade ${dados?.semVencimento ? 'sem vencimento' : data(dados?.validade)}${dados?.arquivoNome ? ` · ${dados.arquivoNome}` : ''}`;
  }
  function escolherConflito(conflito, escolha) {
    setItem(i => aplicarEscolhaConflito(i, conflito, escolha));
    setConflitosCampos(atuais => atuais.filter(c => c !== conflito)); setErroLocal('');
  }
  const alterar = (chave, valor) => setItem(i => ({ ...i, [chave]: valor }));
  const requisito = (id, valores) => setItem(i => ({ ...i, requisitos: i.requisitos.map(r => r.id === id ? { ...r, ...valores } : r) }));
  const disponiveis = documentos.filter(d => d.usoLicitacoes === true && d.titularId === item.titularId && !['cancelado', 'encerrado'].includes(d.estado));
  function salvar(e) {
    e.preventDefault();
    if (conflitosCampos.length) return setErroLocal('Escolha como resolver os campos alterados nas duas versões antes de salvar.');
    const falha = validarKit(item); if (falha) return setErroLocal(falha);
    setErroLocal(''); aoSalvar({ ...item, ...(inicial.id ? { id: inicial.id } : {}) });
  }
  return <form className="doc-form lic-kit-form" onSubmit={salvar} onInvalidCapture={e => {
    const detalhe = e.target.closest('details[data-requisito-id]');
    if (detalhe) { detalhe.open = true; setAbertos(atuais => ({ ...atuais, [detalhe.dataset.requisitoId]: true })); }
  }}>
    {(erroLocal || erro) && <p className="doc-notice is-error" role="alert">{erroLocal || erro}</p>}
    {mesclado && <p className="doc-notice" role="status">Alterações do servidor em campos e requisitos que você não modificou foram incorporadas. Diferenças que exigem sua escolha aparecem abaixo.</p>}
    {!!conflitosCampos.length && <section className="lic-doc-conflitos" aria-label="Campos em conflito"><strong>Escolha o conteúdo alterado nas duas versões</strong>{conflitosCampos.map((c, i) => <div key={`${c.caminho.join(':')}:${i}`}><strong>{rotuloCampoConflito(c)}</strong>{c.caminho[0] === 'requisitos' && <small>Requisito: {item.requisitos.find(r => r.id === c.caminho[1])?.categoria || c.remoto?.categoria || c.local?.categoria || 'Retirado'}</small>}<p>Meu preenchimento: {resumoConflito(c, 'local')}</p><p>Versão do servidor: {resumoConflito(c, 'remoto')}</p><div className="doc-actions"><button type="button" className="btn-outline" disabled={ocupado} onClick={() => escolherConflito(c, 'local')}>Manter meu preenchimento</button><button type="button" className="btn-outline" disabled={ocupado} onClick={() => escolherConflito(c, 'remoto')}>Usar versão do servidor</button></div></div>)}</section>}
    <fieldset className="doc-fields" disabled={ocupado}>
      <label className="label doc-wide">Nome do kit<input className="input" required maxLength={200} value={item.nome} onChange={e => alterar('nome', e.target.value)}/></label>
      <label className="label">Edital<select className="input" aria-label="Edital" required disabled={!!inicial.id} value={item.licitacaoId} onChange={e => alterar('licitacaoId', e.target.value)}><option value="">Selecione o edital</option>{editais.map(l => <option key={l.id} value={l.id}>{nomeEdital(l)}</option>)}{item.licitacaoId && !editais.some(l => l.id === item.licitacaoId) && <option value={item.licitacaoId}>Edital indisponível</option>}</select>{item.licitacaoId && <small className="lic-kit-selection-name">{editais.some(l => l.id === item.licitacaoId) ? nomeEdital(editais.find(l => l.id === item.licitacaoId)) : 'Edital indisponível'}</small>}</label>
      <label className="label">Empresa titular<select className="input" aria-label="Empresa titular" required disabled={!!inicial.id || item.requisitos.length > 0} value={item.titularId} onChange={e => alterar('titularId', e.target.value)}><option value="">Selecione a empresa</option>{titulares.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}</select>{item.titularId && <small className="lic-kit-selection-name">{titulares.find(t => t.id === item.titularId)?.nome || 'Titular indisponível'}</small>}<small>O kit mantém uma empresa titular. Defina-a antes dos requisitos.</small></label>
    </fieldset>
    <p className="doc-note">Adicione somente o que conferiu no edital. Documento ausente permanece pendente. “Não se aplica” exige justificativa. Para usar outro documento do acervo, salve primeiro o kit parcial e depois use “Vincular documento existente”.</p>
    <datalist id="categorias-kit-edital">{CATEGORIAS_DOCUMENTOS.empresa.map(c => <option key={c} value={c}/>)}</datalist>
    <div className="lic-kit-requisitos">{item.requisitos.map((r, n) => {
      const { doc, versoes, snapshot, anexos, sit, pendente, rotulo } = dadosRequisito(r, documentos);
      return <details className="lic-kit-requisito" key={r.id} data-requisito-id={r.id} open={abertos[r.id] ?? pendente} onToggle={e => {
        const aberto = e.currentTarget.open;
        setAbertos(atuais => atuais[r.id] === aberto ? atuais : { ...atuais, [r.id]: aberto });
      }}><summary><span className="lic-kit-requisito-resumo"><strong>{n + 1}. {r.categoria || 'Novo requisito'}</strong><small>{r.dispensado ? r.justificativa?.trim() ? 'Não se aplica conforme justificativa' : 'Justificativa a preencher' : snapshot?.nome || doc?.nome || 'Documento a selecionar'}</small><span className={`chip ${pendente ? 'chip-warn' : ''}`}>{rotulo}</span></span></summary><fieldset disabled={ocupado} className="lic-kit-requisito-campos"><legend className="sr-only">Requisito {n + 1}</legend><div className="doc-fields">
        <label className="label">Categoria<input className="input" required list="categorias-kit-edital" maxLength={200} value={r.categoria} onChange={e => requisito(r.id, { categoria: e.target.value })}/></label>
        <label className="label">Exigência / referência no edital<textarea className="input" required rows={2} maxLength={2000} value={r.descricao} onChange={e => requisito(r.id, { descricao: e.target.value })}/></label>
        <label className="doc-check doc-wide"><input type="checkbox" checked={!!r.dispensado} onChange={e => requisito(r.id, { dispensado: e.target.checked, ...(e.target.checked ? { documentoId: '', versaoId: '', arquivoId: '', snapshot: undefined } : {}) })}/>Não se aplica a este edital</label>
        {r.dispensado ? <label className="label doc-wide">Justificativa da não aplicabilidade<textarea className="input" rows={2} required maxLength={2000} value={r.justificativa || ''} onChange={e => requisito(r.id, { justificativa: e.target.value })}/></label> : <>
          <label className="label">Documento da empresa<select className="input" value={r.documentoId || ''} onChange={e => requisito(r.id, { documentoId: e.target.value, versaoId: '', arquivoId: '', snapshot: undefined })}><option value="">Pendente — sem documento</option>{disponiveis.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}{r.documentoId && !disponiveis.some(d => d.id === r.documentoId) && <option value={r.documentoId}>{r.snapshot?.nome || 'Documento indisponível'} — conferir</option>}</select></label>
          {r.documentoId && <label className="label">Versão do documento<select className="input" value={r.versaoId || ''} onChange={e => requisito(r.id, { versaoId: e.target.value, arquivoId: '', snapshot: undefined })}><option value="">Atual — será preservada ao salvar</option>{versoes.map((v, i) => <option key={v.id} value={v.id}>Versão {i + 1} · validade {data(v.snapshot?.validade || v.validade)} · {v.arquivo?.nome || 'Arquivo'}</option>)}{r.versaoId && !versoes.some(v => v.id === r.versaoId) && <option value={r.versaoId}>Versão preservada — {data(r.snapshot?.validade)}</option>}</select></label>}
          {anexos.length > 1 && <label className="label doc-wide">Anexos da versão<select className="input" value={r.arquivoId || ''} onChange={e => requisito(r.id, { arquivoId: e.target.value })}><option value="">Todos os anexos desta versão</option>{anexos.map(a => <option value={a.id} key={a.id}>{a.nome}</option>)}</select></label>}
          <p className="doc-note doc-wide">{snapshot ? `${snapshot.nome || doc?.nome || 'Documento'} · emissão ${data(snapshot.emissao)} · validade ${snapshot.semVencimento ? 'sem vencimento declarado' : data(snapshot.validade)} · ${sit?.rotulo || 'Conferir arquivo'}` : 'Documento faltante. Você pode salvar o kit parcial e completar depois.'}{r.snapshot && ' · Versão preservada neste kit.'}</p>
        </>}
      </div><button className="btn-ghost" type="button" onClick={() => alterar('requisitos', item.requisitos.filter(a => a.id !== r.id))}><Trash2 size={14}/>Retirar requisito {n + 1}</button></fieldset></details>;
    })}</div>
    <button type="button" className="btn-outline" disabled={ocupado || !item.titularId || item.requisitos.length >= 60} onClick={() => alterar('requisitos', [...item.requisitos, { id: crypto.randomUUID(), categoria: '', descricao: '', documentoId: '', dispensado: false, justificativa: '' }])}><Plus size={15}/>Adicionar requisito do edital</button>
    <div className="doc-actions doc-footer"><button className="btn-primary" disabled={ocupado || conflitosCampos.length > 0}>{ocupado ? 'Salvando…' : 'Salvar kit'}</button><button className="btn-ghost" type="button" disabled={ocupado} onClick={aoFechar}>Cancelar</button></div>
  </form>;
}
