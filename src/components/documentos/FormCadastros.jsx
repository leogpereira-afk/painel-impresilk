import {useState} from 'react';
import PessoaRH from '../patrimonio/PessoasRH.jsx';
import {CATEGORIAS_DOCUMENTOS, nomeTitular} from '../../lib/calc/documentos.js';

export function FormTitular({inicial, pessoalPermitido, ocupado, erro, aoSalvar, aoFechar}) {
  const [item,setItem] = useState(() => inicial || {cadastroId:crypto.randomUUID(),tipo:'empresa',nome:'',pessoaId:''});
  function salvar(e) { e.preventDefault();aoSalvar({...(item.id ? {id:item.id} : {cadastroId:item.cadastroId}),tipo:item.tipo,nome:item.nome.trim(),pessoaId:item.tipo === 'pessoa' ? item.pessoaId || '' : ''}); }
  return <form className="doc-form" onSubmit={salvar}>
    {erro && <p className="doc-notice is-error" role="alert">{erro}</p>}
    <fieldset className="doc-fields" disabled={ocupado}>
      <label className="label">Tipo de titular<select className="input" value={item.tipo} disabled={!!item.id} onChange={e => setItem(i => ({...i,tipo:e.target.value,pessoaId:''}))}><option value="empresa">Empresa</option>{pessoalPermitido && <option value="pessoa">Pessoa</option>}</select></label>
      <label className="label">Nome do titular<input className="input" required maxLength={200} value={item.nome || ''} onChange={e => setItem(i => ({...i,nome:e.target.value}))}/></label>
      {item.tipo === 'pessoa' && <PessoaRH rotulo="Vincular a pessoa do RH (opcional)" valor={item.pessoaId || ''} nome={item.pessoaId ? item.nome : ''} aoMudar={(id,nome) => setItem(i => ({...i,pessoaId:id,nome:id ? nome : i.nome}))}/>}
      <p className="doc-note doc-wide">O cadastro confirma quem é o titular. Pessoas de mesmo nome continuam distintas pelo ID. Cadastre apenas informações confirmadas.</p>
    </fieldset>
    <div className="doc-actions doc-footer"><button className="btn-primary" disabled={ocupado}>{ocupado?'Salvando…':'Salvar titular'}</button><button type="button" className="btn-ghost" disabled={ocupado} onClick={aoFechar}>Cancelar</button></div>
  </form>;
}
export function FormRequisito({inicial,titulares,itens,pessoas,ocupado,erro,aoSalvar,aoFechar}) {
  const [item,setItem] = useState(() => inicial || {cadastroId:crypto.randomUUID(),titularId:'',categoria:'',estabelecimento:'',documentoId:'',estado:'aplicavel',observacao:''});
  const campo = chave => e => setItem(i => ({...i,[chave]:e.target.value}));
  const titular = titulares.find(t => t.id === item.titularId);
  const documentos = itens.filter(i => i.tipo === 'documento' && i.titularId === item.titularId);
  return <form className="doc-form" onSubmit={e => {e.preventDefault();aoSalvar({...(item.id ? {id:item.id} : {cadastroId:item.cadastroId}),titularId:item.titularId,categoria:item.categoria.trim(),estabelecimento:item.estabelecimento,documentoId:item.estado === 'nao-se-aplica' ? '' : item.documentoId,estado:item.estado,observacao:item.observacao});}}>
    {erro && <p className="doc-notice is-error" role="alert">{erro}</p>}
    <fieldset disabled={ocupado} className="doc-fields">
      <label className="label">Titular<select className="input" required value={item.titularId} onChange={e => setItem(i => ({...i,titularId:e.target.value,documentoId:''}))}><option value="">Selecione pelo cadastro</option>{titulares.map(t => <option key={t.id} value={t.id}>{nomeTitular(t,pessoas)} · ID {t.id}</option>)}</select></label>
      <label className="label">Categoria exigida<input className="input" required maxLength={160} value={item.categoria} onChange={campo('categoria')} list="categorias-requisito"/><datalist id="categorias-requisito">{CATEGORIAS_DOCUMENTOS[titular?.tipo || 'empresa'].map(c => <option key={c} value={c}/>)}</datalist></label>
      <label className="label">Estabelecimento / local<input className="input" maxLength={200} value={item.estabelecimento || ''} onChange={campo('estabelecimento')}/></label>
      <label className="label">Aplicabilidade<select className="input" value={item.estado} onChange={campo('estado')}><option value="aplicavel">Aplicável</option><option value="nao-se-aplica">Não se aplica</option></select></label>
      {item.estado === 'aplicavel' && <label className="label doc-wide">Documento que atende ao requisito<select className="input" value={item.documentoId || ''} onChange={campo('documentoId')}><option value="">Faltante: sem documento vinculado</option>{item.documentoId && !documentos.some(i => i.id === item.documentoId) && <option value={item.documentoId}>Vínculo indisponível · ID {item.documentoId}</option>}{documentos.map(i => <option key={i.id} value={i.id}>{i.nome} · ID {i.id}</option>)}</select><small>Somente documentos do mesmo titular. A categoria não cria vínculos automáticos.</small></label>}
      <label className="label doc-wide">Observação<textarea className="input" rows={2} maxLength={1000} value={item.observacao || ''} onChange={campo('observacao')}/></label>
    </fieldset>
    <div className="doc-actions doc-footer"><button className="btn-primary" disabled={ocupado}>{ocupado?'Salvando…':'Salvar requisito'}</button><button type="button" className="btn-ghost" disabled={ocupado} onClick={aoFechar}>Cancelar</button></div>
  </form>;
}
