import { useEffect, useId, useRef, useState } from 'react';
import { consultInstallationOrder, installationOrderKey, latestInstallationRequest, linkInstallationOrder, searchInstallationOrders, validInstallationOrder } from '../../services/acm-installation-orders.js';

export default function InstallationOrderPicker({ value, onChange }) {
  const inputId = useId(), [query, setQuery] = useState(''), [search, setSearch] = useState(null), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [detail, setDetail] = useState(null), [detailLoading, setDetailLoading] = useState(false), [detailError, setDetailError] = useState('');
  const pending = useRef(null), detailPending = useRef(null);
  if (!pending.current) pending.current = latestInstallationRequest();
  if (!detailPending.current) detailPending.current = latestInstallationRequest();
  const selectedKey = installationOrderKey(value), valid = validInstallationOrder(value);
  useEffect(() => {
    const request = pending.current, originRequest = detailPending.current;
    return () => { request.cancel(); originRequest.cancel(); };
  }, []);
  useEffect(() => { detailPending.current.cancel(); setDetail(null); setDetailError(''); setDetailLoading(false); }, [selectedKey]);

  const changeQuery = text => { pending.current.cancel(); setQuery(text); setSearch(null); setError(''); setLoading(false); };
  async function lookup(page = 1) {
    setLoading(true); setError(''); setSearch(null);
    const response = await pending.current.run(signal => searchInstallationOrders(query.trim(), page, signal));
    if (!response.current) return;
    setLoading(false);
    if (response.error) setError(response.error.message);
    else setSearch(response.value);
  }
  async function consult() {
    setDetailLoading(true); setDetailError(''); setDetail(null);
    const response = await detailPending.current.run(signal => consultInstallationOrder(value, signal));
    if (!response.current) return;
    setDetailLoading(false);
    if (response.error) setDetailError(response.error.message);
    else setDetail(response.value);
  }
  function choose(order) { onChange(linkInstallationOrder(order)); pending.current.cancel(); setSearch(null); setLoading(false); }
  function clear() { detailPending.current.cancel(); setDetail(null); setDetailError(''); setDetailLoading(false); onChange(null); }

  return <section className="acm-order-picker" aria-label="Vincular O.S. existente">
    <h3>O.S. do sistema</h3>
    <p className="acm-help">Busque uma O.S. já sincronizada por número completo ou cliente. A consulta respeita seu acesso comercial e exige identificação da empresa na origem.</p>
    {value && <div className="acm-notice">
      {valid ? <><strong>O.S. #{value.number} vinculada</strong><p>{value.client} · {value.company}</p><small>ID da origem: {value.id}{value.linkedAt ? ` · vinculada em ${new Date(value.linkedAt).toLocaleString('pt-BR')}` : ''}</small></> : <p role="alert">O vínculo salvo está incompleto. Selecione uma O.S. na consulta.</p>}
      <div className="acm-actions">{valid && <button type="button" onClick={consult} disabled={detailLoading}>{detailLoading ? 'Conferindo…' : 'Conferir registro da O.S.'}</button>}<button type="button" onClick={clear}>Limpar vínculo da O.S.</button></div>
    </div>}
    {detailError && <p role="alert" className="acm-error">{detailError}</p>}
    {detail && <div className="acm-notice" role="status"><strong>Registro consultado: O.S. #{detail.pedido.numero}</strong><p>{detail.pedido.cliente}</p><p>{detail.pedido.trabalho || 'Descrição do trabalho não informada na consulta.'}</p><p>{detail.operacao?.rotuloStatus || 'Andamento não disponível.'}</p>{!detail.companyVerified && <p className="acm-help">A empresa permanece a registrada no vínculo; a consulta de detalhes não informa esse campo.</p>}<small>Consulta autorizada do Painel · {detail.consultadoEm ? new Date(detail.consultadoEm).toLocaleString('pt-BR') : 'horário não informado'}</small></div>}
    <form onSubmit={event => { event.preventDefault(); lookup(); }} className="acm-form-grid">
      <label className="acm-field" htmlFor={inputId}><span>Número da O.S. ou cliente</span><input id={inputId} value={query} onChange={event => changeQuery(event.target.value)} maxLength={120} placeholder="Número completo ou parte do nome" autoComplete="off" /></label>
      <button type="submit" disabled={loading || !query.trim()}>{loading ? 'Buscando…' : 'Buscar O.S.'}</button>
    </form>
    {loading && <p role="status">Consultando as O.S. autorizadas…</p>}
    {error && <p role="alert" className="acm-error">{error}</p>}
    {search && <div aria-live="polite"><p className="acm-help">{search.total} O.S. com empresa identificada no seu acesso. Confirme o cliente, a empresa e o número antes de vincular.</p>
      {!search.orders.length && <p>Nenhuma O.S. disponível para esta busca.</p>}
      {search.orders.map(order => <article className="acm-notice" key={installationOrderKey(order)}><strong>O.S. #{order.number}</strong><p>{order.client} · {order.company}</p><small>ID da origem: {order.id}</small><div><button type="button" disabled={selectedKey === installationOrderKey(order)} onClick={() => choose(order)}>{selectedKey === installationOrderKey(order) ? 'O.S. vinculada' : 'Vincular esta O.S.'}</button></div></article>)}
      {search.pages > 1 && <div className="acm-actions"><button type="button" disabled={loading || search.page <= 1} onClick={() => lookup(search.page - 1)}>Anterior</button><span>Página {search.page} de {search.pages}</span><button type="button" disabled={loading || search.page >= search.pages} onClick={() => lookup(search.page + 1)}>Próxima</button></div>}
    </div>}
  </section>;
}
