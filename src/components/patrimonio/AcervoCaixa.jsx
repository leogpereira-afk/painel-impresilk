import {useMemo, useState} from 'react';
import {Archive, ArrowDownLeft, ArrowUpRight, Check, ClipboardCheck, ChevronLeft, Package, Pencil, Plus, Printer, RefreshCw} from 'lucide-react';
import JanelaFormulario from '../JanelaFormulario.jsx';
import {lerControles, salvarControle} from '../../services/patrimonio.js';
import {quantidadeEmUso, saldoDisponivelCaixa} from '../../../supabase/functions/_shared/patrimonio-caixas.mjs';
import './acervo-caixa.css';

const ESTADOS = {bom:'Bom', desgaste:'Com desgaste', danificado:'Danificado', nao_verificado:'Não verificado'};
const ABAS = {acervo:'Acervo da caixa', movimentacoes:'Entregas e devoluções', avaliacoes:'Conferências mensais'};
const hoje = () => new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date());
const dataTexto = data => data ? new Date(`${data}T12:00:00Z`).toLocaleDateString('pt-BR', {timeZone:'America/Sao_Paulo'}) : '—';
const instanteTexto = data => data ? new Date(data).toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'}) : '—';
const ativosDaCaixa = registro => (registro.acervo || []).filter(item => !item.arquivado);
const chavePessoa = pessoa => pessoa.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
const autor = registro => registro.criadoPorNome || registro.criadoPor || 'Autor não informado';

function proximoMes(data) {
 const [ano, mes, dia] = data.split('-').map(Number);
 const limite = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
 return new Date(Date.UTC(ano, mes, Math.min(dia, limite))).toISOString().slice(0, 10);
}

function ultimaAvaliacao(registro) {
 return [...(registro.avaliacoes || [])].sort((a, b) => b.data.localeCompare(a.data) || String(b.criadoEm).localeCompare(String(a.criadoEm)))[0];
}

export function ResumoConferenciaCaixa({registro}) {
 const ultima = ultimaAvaliacao(registro);
 if (!ultima) return <div className="pat-caixa-check-summary"><span className="pat-caixa-badge is-pending">Sem conferência</span><small>Primeira conferência pendente</small></div>;
 const vencida = ultima.proximaData < hoje(), venceHoje = ultima.proximaData === hoje();
 const divergentes = ultima.itens.filter(i => i.quantidadeConferida !== i.quantidadeEsperada).length;
 const danificados = ultima.itens.filter(i => i.estado === 'danificado').length;
 return <div className="pat-caixa-check-summary">
  <strong>{dataTexto(ultima.data)}</strong><small>Por {autor(ultima)}</small>
  <span className={`pat-caixa-badge ${vencida ? 'is-overdue' : venceHoje ? 'is-pending' : 'is-ok'}`}>{vencida ? 'Atrasada desde' : venceHoje ? 'Conferir hoje ·' : 'Próxima:'} {dataTexto(ultima.proximaData)}</span>
  {divergentes > 0 && <small className="pat-caixa-check-alert">{divergentes} {divergentes === 1 ? 'item com diferença' : 'itens com diferença'} na última conferência</small>}
  {danificados > 0 && <small className="pat-caixa-check-alert">{danificados} {danificados === 1 ? 'item danificado' : 'itens danificados'} na última conferência</small>}
 </div>;
}

function EstadoCampo({valor, aoMudar, rotulo='Estado do item'}) {
 return <label className="label">{rotulo}<select className="input" value={valor} onChange={aoMudar} required>{Object.entries(ESTADOS).map(([valor, nome]) => <option key={valor} value={valor}>{nome}</option>)}</select></label>;
}

function TabelaMovimentos({movimentos}) {
 if (!movimentos.length) return <p className="pat-caixa-empty-note">Nenhuma entrega ou devolução registrada.</p>;
 return <div className="pat-table-wrap"><table className="pat-table pat-caixa-table"><thead><tr><th>Data / movimento</th><th>Item</th><th>Qtd.</th><th>Pessoa</th><th>Estado / observação</th><th>Registrado por</th></tr></thead><tbody>{[...movimentos].sort((a,b) => b.data.localeCompare(a.data) || String(b.criadoEm).localeCompare(String(a.criadoEm))).map(m => <tr key={m.id}>
  <td data-label="Data / movimento">{dataTexto(m.data)}<small className={m.tipo === 'entrega' ? 'pat-caixa-out' : 'pat-caixa-in'}>{m.tipo === 'entrega' ? 'Entrega' : 'Devolução'}</small></td>
  <td data-label="Item">{m.itemNome}</td><td data-label="Quantidade">{m.quantidade}</td><td data-label="Pessoa">{m.pessoa}</td>
  <td data-label="Estado / observação">{ESTADOS[m.estado] || m.estado}{m.observacao && <small>{m.observacao}</small>}</td><td data-label="Registrado por">{autor(m)}<small>{instanteTexto(m.criadoEm)}</small></td>
 </tr>)}</tbody></table></div>;
}

function ItensAvaliacao({avaliacao}) {
 return <div className="pat-table-wrap"><table className="pat-table pat-caixa-table"><thead><tr><th>Item</th><th>Esperado na caixa</th><th>Encontrado</th><th>Diferença</th><th>Estado / observação</th></tr></thead><tbody>{avaliacao.itens.map(i => <tr key={i.itemId}>
  <td data-label="Item">{i.itemNome}</td><td data-label="Esperado na caixa">{i.quantidadeEsperada}</td><td data-label="Encontrado">{i.quantidadeConferida}</td>
  <td data-label="Diferença"><span className={i.quantidadeConferida !== i.quantidadeEsperada ? 'pat-caixa-difference' : ''}>{i.quantidadeConferida - i.quantidadeEsperada > 0 ? '+' : ''}{i.quantidadeConferida - i.quantidadeEsperada}</span></td>
  <td data-label="Estado / observação">{ESTADOS[i.estado] || i.estado}{i.observacao && <small>{i.observacao}</small>}</td>
 </tr>)}</tbody></table></div>;
}

function Avaliacoes({avaliacoes, imprimir=false}) {
 if (!avaliacoes.length) return <p className="pat-caixa-empty-note">Nenhuma conferência registrada. A primeira conferência está pendente.</p>;
 return <div className="pat-caixa-evaluations">{[...avaliacoes].sort((a,b) => b.data.localeCompare(a.data) || String(b.criadoEm).localeCompare(String(a.criadoEm))).map(a => {
  const divergencias = a.itens.filter(i => i.quantidadeConferida !== i.quantidadeEsperada).length;
  const cabecalho = <><strong>Conferência de {dataTexto(a.data)}</strong><span>Por {autor(a)} · Próxima: {dataTexto(a.proximaData)}</span><span>{divergencias ? `${divergencias} ${divergencias === 1 ? 'item com diferença' : 'itens com diferença'}` : 'Quantidades conferidas sem diferenças'}</span></>;
  const conteudo = <div className="pat-caixa-evaluation-body"><p className="pat-caixa-help">Registro criado em {instanteTexto(a.criadoEm)}. Quantidades esperadas consideram as entregas e devoluções registradas até aquele momento.</p>{a.observacao && <p className="pat-caixa-observation">{a.observacao}</p>}<ItensAvaliacao avaliacao={a}/></div>;
  return imprimir ? <article className="pat-caixa-evaluation-print" key={a.id}><header>{cabecalho}</header>{conteudo}</article> : <details className="pat-caixa-evaluation" key={a.id}><summary>{cabecalho}</summary>{conteudo}</details>;
 })}</div>;
}

function TabelaAcervoRelatorio({registro}) {
 return <div className="pat-table-wrap"><table className="pat-table pat-caixa-table"><thead><tr><th>Item</th><th>Total</th><th>Na caixa</th><th>Entregue</th><th>Estado / observação</th><th>Última atualização</th></tr></thead><tbody>{(registro.acervo || []).map(i => <tr key={i.id}>
  <td>{i.nome}{i.arquivado && <small>Arquivado</small>}</td><td>{i.quantidade}</td><td>{i.arquivado ? '—' : saldoDisponivelCaixa(registro, i.id)}</td><td>{quantidadeEmUso(registro.movimentacoes || [], i.id)}</td>
  <td>{ESTADOS[i.estado] || i.estado}{i.observacao && <small>{i.observacao}</small>}</td><td>{i.atualizadoPorNome || 'Autor não informado'}<small>{instanteTexto(i.atualizadoEm)}</small></td>
 </tr>)}</tbody></table></div>;
}

function RelatorioCaixa({relatorio, aoVoltar}) {
 const [escopo, setEscopo] = useState(relatorio.escopo);
 const r = relatorio.registro;
 return <div className="pat-print pat-controle-relatorio pat-caixa-report">
  <div className="sem-impressao pat-print-toolbar"><button className="btn-ghost" onClick={aoVoltar}><ChevronLeft size={18}/>Voltar à caixa</button><label className="pat-caixa-report-choice">Conteúdo<select className="input" value={escopo} onChange={e => setEscopo(e.target.value)}><option value="completo">Relatório completo</option>{Object.entries(ABAS).map(([id,nome]) => <option value={id} key={id}>{nome}</option>)}</select></label><button className="btn-primary" onClick={() => window.print()}><Printer size={18}/>Imprimir / salvar PDF</button><p>Escolha “Salvar como PDF” na impressão. O relatório inclui todos os registros da área selecionada.</p></div>
  <header className="pat-report-title"><span>IMPRESILK · PATRIMÔNIO</span><h1>Caixa de ferramentas {r.numero}</h1><p>Responsável: {r.pessoa || 'Não informado'}</p><p>{escopo === 'completo' ? 'Acervo, entregas, devoluções e conferências' : ABAS[escopo]} · Emitido em {relatorio.em}</p>{r.observacao && <p>{r.observacao}</p>}</header>
  <section className="pat-caixa-report-check"><h2>Última conferência e próxima avaliação</h2><ResumoConferenciaCaixa registro={r}/></section>
  {(escopo === 'completo' || escopo === 'acervo') && <section><h2>Acervo da caixa</h2><p>Saldo calculado pelas quantidades cadastradas e pelo histórico de entregas e devoluções.</p>{r.acervo?.length ? <TabelaAcervoRelatorio registro={r}/> : <p>Nenhum item cadastrado.</p>}</section>}
  {(escopo === 'completo' || escopo === 'movimentacoes') && <section><h2>Entregas e devoluções</h2><TabelaMovimentos movimentos={r.movimentacoes || []}/></section>}
  {(escopo === 'completo' || escopo === 'avaliacoes') && <section><h2>Conferências mensais</h2><Avaliacoes avaliacoes={r.avaliacoes || []} imprimir/></section>}
 </div>;
}

export default function AcervoCaixa({registro, atualizarControles, aoVoltar}) {
 const [aba,setAba] = useState('acervo'), [form,setForm] = useState(null), [erro,setErro] = useState(''), [mensagem,setMensagem] = useState(''), [ocupado,setOcupado] = useState(false), [relatorio,setRelatorio] = useState(null);
 const ativos = ativosDaCaixa(registro), movimentos = registro.movimentacoes || [], avaliacoes = registro.avaliacoes || [];
 const arquivados = (registro.acervo || []).filter(i => i.arquivado);
 const totais = ativos.reduce((a,i) => ({total:a.total + i.quantidade, disponivel:a.disponivel + saldoDisponivelCaixa(registro,i.id), entregue:a.entregue + quantidadeEmUso(movimentos,i.id)}), {total:0, disponivel:0, entregue:0});
 const pendentes = useMemo(() => {
  const pessoas = new Map();
  for (const m of registro.movimentacoes || []) {
   const chave = `${m.itemId}:${chavePessoa(m.pessoa)}`;
   const existente = pessoas.get(chave) || {itemId:m.itemId, pessoa:m.pessoa, quantidade:0};
   existente.quantidade += m.tipo === 'entrega' ? m.quantidade : -m.quantidade;
   pessoas.set(chave, existente);
  }
  return [...pessoas.values()].filter(p => p.quantidade > 0);
 },[registro.movimentacoes]);
 const itemForm = form?.itemId ? ativos.find(i => i.id === form.itemId) : null;
 const pessoasItem = pendentes.filter(p => p.itemId === form?.itemId);
 const limiteMovimento = !itemForm ? 0 : form?.tipo === 'entrega' ? saldoDisponivelCaixa(registro,itemForm.id) : quantidadeEmUso(movimentos,itemForm.id,form?.pessoa || '');
 const dataMinima = [...avaliacoes,...movimentos.filter(m => form?.tipo === 'avaliar' || m.itemId === form?.itemId)].reduce((maior,r) => r.data > maior ? r.data : maior,'');

 function abrir(novo) { setMensagem(''); setErro(''); setForm(novo); }
 function abrirItem(item) { abrir({tipo:'itemSalvar', item:{id:item?.id, nome:item?.nome || '', quantidade:item?.quantidade ?? '', estado:item?.estado || 'nao_verificado', observacao:item?.observacao || ''}}); }
 function abrirMovimento(tipo, item, pessoa='') {
  const inicial = item || ativos.find(i => tipo === 'entrega' ? saldoDisponivelCaixa(registro,i.id) > 0 : quantidadeEmUso(movimentos,i.id) > 0);
  abrir({tipo,itemId:inicial?.id || '',quantidade:'',pessoa,data:hoje(),estado:'nao_verificado',observacao:''});
 }
 function abrirAvaliacao() { abrir({tipo:'avaliar',data:hoje(),proximaData:proximoMes(hoje()),observacao:'',itens:ativos.map(i => ({itemId:i.id,quantidadeConferida:'',estado:'nao_verificado',observacao:''}))}); }
 const campo = chave => e => setForm(f => ({...f,[chave]:e.target.value}));
 const campoItem = chave => e => setForm(f => ({...f,item:{...f.item,[chave]:e.target.value}}));
 const campoConferencia = (id,chave) => e => setForm(f => ({...f,itens:f.itens.map(i => i.itemId === id ? {...i,[chave]:e.target.value} : i)}));
 const fechar = () => { if (!ocupado) { setForm(null); setErro(''); } };

 async function recarregar() {
  setOcupado(true); setErro('');
  try { atualizarControles(await lerControles()); setMensagem('Caixa atualizada.'); }
  catch(e) { setErro(e.message); }
  finally { setOcupado(false); }
 }

 async function gravar(operacao) {
  setOcupado(true); setErro(''); setMensagem('');
  try {
   const dados = {tipo:registro.tipo,numero:registro.numero,modelo:registro.modelo || '',telefone:registro.telefone || '',pessoa:registro.pessoa || '',observacao:registro.observacao || '',operacaoCaixa:operacao};
   atualizarControles(await salvarControle(registro.id,dados,registro.atualizadoEm ?? null));
   setForm(null); setMensagem(operacao.tipo === 'avaliar' ? 'Conferência registrada com data, avaliador e próxima avaliação.' : operacao.tipo === 'itemArquivar' ? 'Item arquivado. O histórico foi preservado.' : operacao.tipo === 'itemSalvar' ? 'Item salvo no acervo.' : operacao.tipo === 'entrega' ? 'Entrega registrada.' : 'Devolução registrada.');
  } catch(e) {
   if (e.status === 409 || /outro usu.rio|conflito|atualizad[oa].*recarreg|alterad[oa].*atualiz/i.test(e.message)) {
    try {
     const dados = await lerControles(), novaCaixa = dados[registro.id];
     atualizarControles(dados);
     if (novaCaixa) setForm(f => f?.tipo === 'avaliar' ? {...f,itens:ativosDaCaixa(novaCaixa).map(i => f.itens.find(a => a.itemId === i.id) || {itemId:i.id,quantidadeConferida:'',estado:'nao_verificado',observacao:''})} : f);
     setErro('Esta caixa foi alterada por outra pessoa. Os dados foram atualizados e seu preenchimento foi preservado. Confira os saldos e as informações antes de salvar novamente.');
    } catch { setErro('Esta caixa foi alterada por outra pessoa. Não foi possível recarregar os dados. Seu preenchimento foi preservado; tente salvar novamente para atualizar.'); }
   } else setErro(e.message || 'Não foi possível salvar. Tente novamente.');
  } finally { setOcupado(false); }
 }

 function salvar(e) {
  e.preventDefault();
  const operacao = form.tipo === 'itemSalvar' ? {...form,item:{...form.item,quantidade:Number(form.item.quantidade)}} : form.tipo === 'avaliar' ? {...form,itens:form.itens.map(i => ({...i,quantidadeConferida:Number(i.quantidadeConferida)}))} : {...form,quantidade:Number(form.quantidade)};
  gravar(operacao);
 }
 function arquivar(item) { abrir({tipo:'itemArquivar',itemId:item.id,itemNome:item.nome}); }

 if (relatorio) return <RelatorioCaixa relatorio={relatorio} aoVoltar={() => setRelatorio(null)}/>;
 return <section className="pat-caixa" aria-label={`Caixa de ferramentas ${registro.numero}`}>
  <div className="pat-caixa-heading"><div><button className="btn-ghost pat-caixa-back" onClick={aoVoltar} disabled={ocupado}><ChevronLeft size={17}/>Todas as caixas</button><h2><Package size={23}/>Caixa {registro.numero}</h2><p>Responsável: <strong>{registro.pessoa || 'Não informado'}</strong></p>{registro.observacao && <p>{registro.observacao}</p>}</div><div className="pat-actions"><button className="btn-ghost" onClick={recarregar} disabled={ocupado} aria-label="Atualizar caixa"><RefreshCw size={17}/></button><button className="btn-outline" onClick={() => setRelatorio({registro:structuredClone(registro),escopo:aba,em:new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})})} disabled={ocupado}><Printer size={17}/>Salvar PDF</button><button className="btn-primary" onClick={abrirAvaliacao} disabled={ocupado || !ativos.length}><ClipboardCheck size={17}/>Conferir caixa</button></div></div>
  <div className="pat-caixa-overview"><div className="pat-caixa-numbers"><div><strong>{ativos.length}</strong><span>Tipos de itens</span></div><div><strong>{totais.total}</strong><span>Unidades no acervo</span></div><div><strong>{totais.disponivel}</strong><span>Disponíveis na caixa</span></div><div><strong>{totais.entregue}</strong><span>Entregues às pessoas</span></div></div><div className="pat-caixa-next"><h3>Conferência mensal</h3><ResumoConferenciaCaixa registro={registro}/></div></div>
  <nav className="pat-caixa-tabs" aria-label="Áreas da caixa">{Object.entries(ABAS).map(([id,nome]) => <button type="button" key={id} onClick={() => setAba(id)} aria-current={aba === id ? 'page' : undefined}>{nome}<span>{id === 'acervo' ? ativos.length : id === 'movimentacoes' ? movimentos.length : avaliacoes.length}</span></button>)}</nav>
  {erro && !form && <p className="pat-notice is-error" role="alert">{erro}</p>}{mensagem && <p className="pat-control-feedback" role="status"><Check size={16}/>{mensagem}</p>}
  {aba === 'acervo' && <>
   <div className="pat-caixa-section-heading"><p>Cadastre o total de cada ferramenta. As entregas reduzem o saldo disponível na caixa.</p><button className="btn-primary" disabled={ocupado} onClick={() => abrirItem()}><Plus size={17}/>Adicionar item</button></div>
   {!ativos.length ? <div className="pat-empty"><Package size={30}/><h3>O que tem nesta caixa?</h3><p>Cadastre as ferramentas, as quantidades e o estado de cada item para começar o acompanhamento.</p><button className="btn-outline" disabled={ocupado} onClick={() => abrirItem()}><Plus size={17}/>Cadastrar primeiro item</button></div> : <div className="pat-table-wrap"><table className="pat-table pat-caixa-table"><thead><tr><th>Item / estado</th><th>Total</th><th>Na caixa</th><th>Entregue</th><th>Ações</th></tr></thead><tbody>{ativos.map(i => <tr key={i.id}>
    <td data-label="Item / estado"><strong>{i.nome}</strong><small>{ESTADOS[i.estado] || i.estado}</small>{i.observacao && <small>{i.observacao}</small>}<small>Atualizado por {i.atualizadoPorNome || 'autor não informado'} · {instanteTexto(i.atualizadoEm)}</small></td><td data-label="Total">{i.quantidade}</td><td data-label="Na caixa"><strong>{saldoDisponivelCaixa(registro,i.id)}</strong></td><td data-label="Entregue">{quantidadeEmUso(movimentos,i.id)}</td>
    <td data-label="Ações"><div className="pat-actions"><button className="btn-outline" disabled={ocupado || saldoDisponivelCaixa(registro,i.id) < 1} onClick={() => abrirMovimento('entrega',i)} aria-label={`Entregar ${i.nome}`}><ArrowUpRight size={15}/>Entregar</button><button className="btn-ghost" disabled={ocupado || quantidadeEmUso(movimentos,i.id) < 1} onClick={() => abrirMovimento('devolucao',i)} aria-label={`Devolver ${i.nome}`}><ArrowDownLeft size={15}/>Devolver</button><button className="btn-ghost" disabled={ocupado} onClick={() => abrirItem(i)} aria-label={`Editar ${i.nome}`}><Pencil size={15}/></button><button className="btn-ghost" disabled={ocupado || quantidadeEmUso(movimentos,i.id) > 0} onClick={() => arquivar(i)} aria-label={`Arquivar ${i.nome}`} title={quantidadeEmUso(movimentos,i.id) > 0 ? 'Devolva os itens entregues antes de arquivar' : 'Arquivar item preservando histórico'}><Archive size={15}/></button></div></td>
   </tr>)}</tbody></table></div>}
   {arquivados.length > 0 && <details className="pat-caixa-archived"><summary>{arquivados.length} {arquivados.length === 1 ? 'item arquivado' : 'itens arquivados'} · histórico preservado</summary><ul>{arquivados.map(i => <li key={i.id}><strong>{i.nome}</strong><span>{i.quantidade} unidades · {ESTADOS[i.estado]}</span><small>{i.atualizadoPorNome || 'Autor não informado'} · {instanteTexto(i.atualizadoEm)}</small></li>)}</ul></details>}
  </>}
  {aba === 'movimentacoes' && <>
   <div className="pat-caixa-section-heading"><p>Quem recebeu, quanto recebeu e o que já voltou para a caixa.</p><div className="pat-actions"><button className="btn-primary" disabled={ocupado || totais.disponivel < 1} onClick={() => abrirMovimento('entrega')}><ArrowUpRight size={17}/>Registrar entrega</button><button className="btn-outline" disabled={ocupado || totais.entregue < 1} onClick={() => abrirMovimento('devolucao')}><ArrowDownLeft size={17}/>Registrar devolução</button></div></div>
   {pendentes.length > 0 && <section className="pat-caixa-pending"><h3>Itens com as pessoas</h3><div>{pendentes.map(p => <article key={`${p.itemId}:${p.pessoa}`}><div><strong>{(registro.acervo || []).find(i => i.id === p.itemId)?.nome || 'Item'}</strong><span>{p.quantidade} {p.quantidade === 1 ? 'unidade' : 'unidades'} com {p.pessoa}</span></div><button className="btn-ghost" disabled={ocupado} onClick={() => abrirMovimento('devolucao',ativos.find(i => i.id === p.itemId),p.pessoa)} aria-label={`Registrar devolução de ${p.pessoa}`}><ArrowDownLeft size={16}/>Devolver</button></article>)}</div></section>}
   <TabelaMovimentos movimentos={movimentos}/>
  </>}
  {aba === 'avaliacoes' && <><div className="pat-caixa-section-heading"><p>Confira a quantidade física na caixa, o estado de cada item e agende a próxima avaliação. O histórico guarda quem avaliou e quando.</p><button className="btn-primary" disabled={ocupado || !ativos.length} onClick={abrirAvaliacao}><ClipboardCheck size={17}/>Nova conferência</button></div><Avaliacoes avaliacoes={avaliacoes}/></>}
  {form && <JanelaFormulario titulo={form.tipo === 'itemSalvar' ? form.item.id ? 'Editar item do acervo' : 'Adicionar item à caixa' : form.tipo === 'avaliar' ? `Conferir caixa ${registro.numero}` : form.tipo === 'itemArquivar' ? 'Arquivar item' : form.tipo === 'entrega' ? 'Registrar entrega' : 'Registrar devolução'} ocupado={ocupado} aoFechar={fechar} classe="pat-caixa-modal">
   <form className="pat-form pat-control-form pat-caixa-form" onSubmit={form.tipo === 'itemArquivar' ? e => {e.preventDefault();gravar({tipo:'itemArquivar',itemId:form.itemId});} : salvar}>
    {erro && <p className="pat-notice is-error" role="alert">{erro}</p>}
    <fieldset disabled={ocupado} className="pat-control-fields">
     {form.tipo === 'itemSalvar' && <>
      <label className="label pat-control-wide">Nome da ferramenta<input className="input" required maxLength={160} value={form.item.nome} onChange={campoItem('nome')} placeholder="Ex.: Chave de fenda"/></label>
      <label className="label">Quantidade total no acervo<input className="input" type="number" min={form.item.id ? quantidadeEmUso(movimentos,form.item.id) : 0} max={1000000} step="1" inputMode="numeric" required value={form.item.quantidade} onChange={campoItem('quantidade')}/><small>Inclua também as unidades entregues às pessoas.</small></label>
      <EstadoCampo valor={form.item.estado} aoMudar={campoItem('estado')}/>
      <label className="label pat-control-wide">Observação <small>Opcional</small><textarea className="input" rows={2} maxLength={1000} value={form.item.observacao} onChange={campoItem('observacao')}/></label>
     </>}
     {(form.tipo === 'entrega' || form.tipo === 'devolucao') && <>
      <label className="label pat-control-wide">Item<select className="input" value={form.itemId} required onChange={e => setForm(f => ({...f,itemId:e.target.value,pessoa:f.tipo === 'devolucao' ? '' : f.pessoa,quantidade:''}))}><option value="">Selecione o item</option>{ativos.filter(i => i.id === form.itemId || (form.tipo === 'entrega' ? saldoDisponivelCaixa(registro,i.id) > 0 : quantidadeEmUso(movimentos,i.id) > 0)).map(i => <option value={i.id} key={i.id}>{i.nome}</option>)}</select></label>
      <label className="label">{form.tipo === 'entrega' ? 'Entregue para' : 'Devolvido por'}{form.tipo === 'entrega' ? <input className="input" required maxLength={120} value={form.pessoa} onChange={campo('pessoa')} placeholder="Nome da pessoa"/> : <select className="input" required value={form.pessoa} onChange={campo('pessoa')}><option value="">Selecione a pessoa</option>{pessoasItem.map(p => <option key={p.pessoa} value={p.pessoa}>{p.pessoa} · {p.quantidade} em uso</option>)}</select>}</label>
      <label className="label">Quantidade<input className="input" type="number" min={1} max={limiteMovimento} step="1" inputMode="numeric" required value={form.quantidade} onChange={campo('quantidade')}/><small>{form.tipo === 'entrega' ? `${limiteMovimento} disponíveis na caixa` : form.pessoa ? `${limiteMovimento} em uso por esta pessoa` : 'Selecione quem está devolvendo'}</small></label>
      <label className="label">Data {form.tipo === 'entrega' ? 'da entrega' : 'da devolução'}<input className="input" type="date" required min={dataMinima || undefined} max={hoje()} value={form.data} onChange={campo('data')}/>{dataMinima && <small>Último registro relevante: {dataTexto(dataMinima)}.</small>}</label><EstadoCampo valor={form.estado} aoMudar={campo('estado')}/>
      <label className="label pat-control-wide">Observação <small>Opcional</small><textarea className="input" rows={2} maxLength={1000} value={form.observacao} onChange={campo('observacao')}/></label>
     </>}
     {form.tipo === 'avaliar' && <>
      <p className="pat-caixa-help pat-control-wide">Conte apenas as unidades fisicamente dentro da caixa. O saldo esperado exclui o que está entregue às pessoas. Esta conferência registra diferenças sem alterar automaticamente o acervo.</p>
      <label className="label">Data da conferência<input className="input" type="date" required min={dataMinima || undefined} max={hoje()} value={form.data} onChange={e => setForm(f => ({...f,data:e.target.value,proximaData:e.target.value ? proximoMes(e.target.value) : ''}))}/>{dataMinima && <small>Último registro da caixa: {dataTexto(dataMinima)}.</small>}</label>
      <label className="label">Próxima avaliação<input className="input" type="date" required min={form.data} value={form.proximaData} onChange={campo('proximaData')}/><small>Sugerida para o mesmo dia do próximo mês.</small></label>
      <div className="pat-caixa-count-heading pat-control-wide"><strong>Contagem física de todos os itens</strong><button className="btn-outline" type="button" onClick={() => setForm(f => ({...f,itens:f.itens.map(i => ({...i,quantidadeConferida:saldoDisponivelCaixa(registro,i.itemId)}))}))}><Check size={16}/>Todos conferidos: usar quantidades esperadas</button><small>Use o botão somente após contar todos os itens. O estado de conservação deve ser informado em cada item.</small></div>
      <div className="pat-caixa-counts pat-control-wide">{form.itens.map(i => {const item = ativos.find(a => a.id === i.itemId);if (!item) return null;return <fieldset key={i.itemId} className="pat-caixa-count-item"><legend>{item.nome}</legend><p>Esperado na caixa: <strong>{saldoDisponivelCaixa(registro,item.id)}</strong> · Entregue: {quantidadeEmUso(movimentos,item.id)}</p><div><label className="label">Quantidade encontrada<input className="input" aria-label={`Quantidade encontrada de ${item.nome}`} type="number" min={0} max={1000000} step="1" inputMode="numeric" required value={i.quantidadeConferida} onChange={campoConferencia(i.itemId,'quantidadeConferida')} placeholder="Informe a contagem"/></label><EstadoCampo rotulo={`Estado de ${item.nome}`} valor={i.estado} aoMudar={campoConferencia(i.itemId,'estado')}/><label className="label pat-control-wide">Observação do item<textarea className="input" aria-label={`Observação de ${item.nome}`} rows={1} maxLength={1000} value={i.observacao} onChange={campoConferencia(i.itemId,'observacao')}/></label></div></fieldset>;})}</div>
      <label className="label pat-control-wide">Observação geral da conferência <small>Opcional</small><textarea className="input" rows={2} maxLength={1000} value={form.observacao} onChange={campo('observacao')}/></label>
      <p className="pat-caixa-help pat-control-wide">O nome do avaliador e o horário do registro serão preenchidos com a sua sessão ao salvar.</p>
     </>}
     {form.tipo === 'itemArquivar' && <p className="pat-control-wide">Arquivar <strong>{form.itemNome}</strong>? O item sai do acervo ativo e das próximas conferências. As entregas, devoluções e conferências anteriores continuam no histórico.</p>}
    </fieldset>
    <div className="pat-form-footer pat-actions"><button className="btn-primary" disabled={ocupado}>{ocupado ? 'Salvando…' : form.tipo === 'avaliar' ? 'Salvar conferência' : form.tipo === 'itemArquivar' ? 'Arquivar item' : form.tipo === 'itemSalvar' ? 'Salvar item' : form.tipo === 'entrega' ? 'Salvar entrega' : 'Salvar devolução'}</button><button type="button" className="btn-ghost" onClick={fechar} disabled={ocupado}>Cancelar</button></div>
   </form>
  </JanelaFormulario>}
 </section>;
}
