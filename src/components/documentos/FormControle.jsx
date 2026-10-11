import { useState } from 'react';
import {Link} from 'react-router-dom';
import { Plus, Trash2, Upload } from 'lucide-react';
import PessoaRH from '../patrimonio/PessoasRH.jsx';
import { CATEGORIAS_DOCUMENTOS, ESTADOS_CONTROLE, ESTADOS_ACIONAMENTO, PAGAMENTOS, controleEditavel, nomeTitular, validarControle } from '../../lib/calc/documentos.js';
import { paraCampo, paraNumero, ymdLocal } from '../../lib/format.js';

export const novoControle = (tipo = 'documento', ativoIds = []) => ({ cadastroId: crypto.randomUUID(), tipo, nome: '', titularId: '', categoria: '', identificacao: '', estado: 'ativo', emissao: '', validade: '', semVencimento: false, alertaDias: 30, ativoIds, contato: {}, acionamentos: [] });
function Campo({ rotulo, value = '', onChange, area = false, ...props }) {
  const Comp = area ? 'textarea' : 'input';
  return <label className={`label ${area ? 'doc-wide' : ''}`}>{rotulo}<Comp className="input" value={value ?? ''} onChange={onChange} {...props}/></label>;
}
function Opcoes({rotulo, valor, opcoes, aoMudar}) {
  return <label className="label">{rotulo}<select className="input" value={valor} onChange={aoMudar}>{valor && !opcoes[valor] && <option value={valor}>{valor}</option>}{Object.entries(opcoes).map(([id,nome]) => <option key={id} value={id}>{nome}</option>)}</select></label>;
}

export default function FormControle({ inicial, titulares, pessoas, bens, renovacao, ocupado, erro, aoSalvar, aoFechar }) {
  const [item, setItem] = useState(() => ({ ...novoControle(inicial.tipo), ...controleEditavel(inicial), cadastroId: inicial.id ? undefined : inicial.cadastroId || crypto.randomUUID(), valor: inicial.valor === 0 ? '0' : paraCampo(inicial.valor), valorSegurado: inicial.valorSegurado === 0 ? '0' : paraCampo(inicial.valorSegurado) }));
  const [arquivos, setArquivos] = useState([]), [erroLocal, setErroLocal] = useState('');
  const canonical = inicial.origem === 'incendio';
  const campo = chave => e => setItem(atual => ({ ...atual, [chave]: e.target.value }));
  const titularesPermitidos = canonical ? titulares.filter(t => t.tipo === 'empresa') : titulares;
  const titular = titulares.find(t => t.id === item.titularId);
  const categorias = item.tipo === 'documento' ? [...new Set([...CATEGORIAS_DOCUMENTOS[titular?.tipo || 'empresa'], ...CATEGORIAS_DOCUMENTOS.veiculo])] : CATEGORIAS_DOCUMENTOS[item.tipo] || [];
  const ids = item.ativoIds || [];
  const alternarBem = id => setItem(atual => ({ ...atual, ativoIds: ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id] }));
  const contato = (chave, grupo='contato') => e => setItem(atual => ({ ...atual, [grupo]: { ...atual[grupo], [chave]: e.target.value } }));
  const acaoCampo = (id, chave) => e => setItem(atual => ({ ...atual, acionamentos: (atual.acionamentos || []).map(a => a.id === id ? { ...a, [chave]: e.target.value } : a) }));
  async function salvar(e) {
    e.preventDefault();
    const payload = { ...controleEditavel(item), nome: item.nome.trim(), validade: item.semVencimento ? '' : item.validade, alertaDias: Number(item.alertaDias), ...(item.tipo === 'seguro' ? {valor: String(item.valor??'').trim()?paraNumero(item.valor):null, valorSegurado: String(item.valorSegurado??'').trim()?paraNumero(item.valorSegurado):null} : {}) };
    const mensagem = validarControle(payload, renovacao, arquivos.length > 0);
    if (mensagem) return setErroLocal(mensagem);
    if (!canonical && !inicial.id && item.categoria.trim().toUpperCase() === 'AVCB') return setErroLocal('O AVCB é cadastrado na Prevenção contra incêndio. Abra a ficha no Patrimônio.');
    if (arquivos.some(a => a.size > 3 * 1024 * 1024)) return setErroLocal('Cada arquivo deve ter até 3 MB.');
    setErroLocal('');
    await aoSalvar(payload, arquivos);
  }
  return <form className="doc-form" onSubmit={salvar} onInvalidCapture={e => {let grupo=e.target.closest("details");while(grupo){grupo.open=true;grupo=grupo.parentElement.closest("details");}}}>
    {(erroLocal || erro) && <p className="doc-notice is-error" role="alert">{erroLocal || erro}</p>}
    {renovacao && <p className="doc-note">O arquivo e as datas vigentes serão preservados no histórico. Anexe a nova versão e confira o próximo vencimento.</p>}
    {canonical && <p className="doc-note">AVCB vinculado à ficha de prevenção contra incêndio. A renovação atualiza o mesmo registro patrimonial.</p>}
    <fieldset disabled={ocupado} className="doc-fields">
      <Campo rotulo={item.tipo === 'seguro' ? 'Nome da apólice' : item.tipo === 'garantia' ? 'Nome da garantia' : 'Nome do documento'} value={item.nome} onChange={campo('nome')} required maxLength={200} readOnly={canonical}/>
      <label className="label">Titular<select className="input" required value={item.titularId || ''} onChange={campo('titularId')} disabled={canonical && !renovacao}>
        <option value="">Selecione pelo cadastro</option>
        {item.titularId && !titular && <option value={item.titularId}>Titular vinculado indisponível · ID {item.titularId}</option>}
        {titularesPermitidos.map(t => <option key={t.id} value={t.id}>{nomeTitular(t,pessoas)} · {t.tipo === 'pessoa' ? 'Pessoa' : 'Empresa'}{titulares.filter(o => nomeTitular(o,pessoas) === nomeTitular(t,pessoas)).length > 1 ? ` · ID ${t.id}` : ''}</option>)}
      </select><small>Cadastre os titulares na área “Titulares”. O vínculo usa o ID.</small></label>
      <Campo rotulo="Categoria" value={item.categoria} onChange={campo('categoria')} list="categorias-documentos" required maxLength={160} readOnly={canonical}/>
      <datalist id="categorias-documentos">{categorias.map(c => <option key={c} value={c}/>)}</datalist>
      {!canonical && item.categoria.trim().toUpperCase() === 'AVCB' && <p className="doc-note doc-wide">O AVCB usa a mesma ficha predial. <Link to="/patrimonio?aba=incendio">Abrir Prevenção contra incêndio</Link> para cadastrar o documento; a renovação aparecerá nesta área.</p>}
      <Campo rotulo={item.tipo === 'seguro' ? 'Número da apólice' : 'Número / identificação'} value={item.identificacao} onChange={campo('identificacao')} maxLength={200} readOnly={canonical}/>
      <Campo rotulo="Emissão / início da vigência" value={item.emissao} onChange={campo('emissao')} type="date"/>
      <label className="label">{renovacao ? 'Novo vencimento' : 'Vencimento'}<input className="input" type="date" value={item.validade || ''} onChange={campo('validade')} disabled={item.semVencimento} min={item.emissao || undefined}/><span className="doc-check"><input type="checkbox" checked={!!item.semVencimento} disabled={canonical} onChange={e => setItem(atual => ({ ...atual, semVencimento: e.target.checked, validade: e.target.checked ? '' : atual.validade }))}/>Sem vencimento</span><small>Prazo em branco permanece como pendência de informação.</small></label>
      {!canonical && <><Campo rotulo="Alertar antes (dias)" value={item.alertaDias} onChange={campo('alertaDias')} type="number" min={0} max={365} step={1}/>
      <Opcoes rotulo="Estado do controle" valor={item.estado || 'ativo'} opcoes={ESTADOS_CONTROLE} aoMudar={campo('estado')}/></>}
      <Campo rotulo="Estabelecimento / local" value={item.estabelecimento} onChange={campo('estabelecimento')} maxLength={200} readOnly={canonical}/>
      {item.tipo === 'documento' && !canonical && <Campo rotulo="Órgão emissor" value={item.orgaoEmissor} onChange={campo('orgaoEmissor')} maxLength={200}/>}
      {['documento','seguro'].includes(item.tipo) && !canonical && <Campo rotulo="Link oficial para consulta / emissão" value={item.linkOficial} onChange={campo('linkOficial')} type="url" placeholder="https://" maxLength={2000}/>}
      {item.tipo === 'documento' && !canonical && <details className="doc-subsection doc-wide"><summary>Obrigação de pagamento, quando aplicável</summary><p className="doc-note">O vencimento do controle e o pagamento são informações distintas. Anexar um documento não confirma que a obrigação foi paga.</p><fieldset className="doc-subfields"><Campo rotulo="Obrigação de pagamento" value={item.obrigacaoPagamento} onChange={campo('obrigacaoPagamento')} maxLength={1000}/><Opcoes rotulo="Situação do pagamento" valor={item.pagamentoSituacao || 'nao-se-aplica'} opcoes={PAGAMENTOS} aoMudar={campo('pagamentoSituacao')}/></fieldset></details>}
      {item.tipo === 'seguro' && <>
        <Campo rotulo="Seguradora" value={item.seguradora} onChange={campo('seguradora')} maxLength={200}/>
        <Campo rotulo="Prêmio do seguro (R$)" value={item.valor} onChange={campo('valor')} inputMode="decimal"/>
        <Campo rotulo="Importância segurada (R$)" value={item.valorSegurado} onChange={campo('valorSegurado')} inputMode="decimal"/>
        <Campo rotulo="Cobertura / franquia" value={item.cobertura} onChange={campo('cobertura')} area rows={3} maxLength={4000}/>
        <Campo rotulo="Obrigação de pagamento" value={item.obrigacaoPagamento} onChange={campo('obrigacaoPagamento')} maxLength={1000}/>
        <Opcoes rotulo="Situação do pagamento" valor={item.pagamentoSituacao || 'nao-se-aplica'} opcoes={PAGAMENTOS} aoMudar={campo('pagamentoSituacao')}/>
      </>}
      {item.tipo === 'garantia' && <>
        <Campo rotulo="Fornecedor" value={item.fornecedor} onChange={campo('fornecedor')} maxLength={200}/>
        <Campo rotulo="Fabricante" value={item.fabricante} onChange={campo('fabricante')} maxLength={200}/>
        <Campo rotulo="Data da compra" value={item.compra} onChange={campo('compra')} type="date"/>
        <Campo rotulo="Tipo de garantia" value={item.tipoGarantia} onChange={campo('tipoGarantia')} placeholder="Legal, contratual, estendida…" maxLength={200}/>
        <Campo rotulo="Condições / cobertura da garantia" value={item.condicoes} onChange={campo('condicoes')} area rows={3} maxLength={4000}/>
      </>}
      {!canonical && <><details className="doc-subsection doc-wide"><summary>Contato para renovação ou atendimento</summary><fieldset className="doc-subfields">
        <Campo rotulo="Nome do contato / corretor" value={item.contato?.nome} onChange={contato('nome')} maxLength={200}/>
        <Campo rotulo="Telefone" value={item.contato?.telefone} onChange={contato('telefone')} type="tel" maxLength={40}/>
        <Campo rotulo="WhatsApp (com DDD e país)" value={item.contato?.whatsapp} onChange={contato('whatsapp')} type="tel" maxLength={40}/>
        <Campo rotulo="E-mail" value={item.contato?.email} onChange={contato('email')} type="email" maxLength={200}/>
        <Campo rotulo="Endereço" value={item.contato?.endereco} onChange={contato('endereco')} area rows={2} maxLength={1000}/>
      </fieldset></details>
      {item.tipo === 'seguro' && <details className="doc-subsection doc-wide"><summary>Assistência em caso de sinistro</summary><fieldset className="doc-subfields">
        <Campo rotulo="Nome da assistência" value={item.assistencia?.nome} onChange={contato('nome','assistencia')} maxLength={200}/>
        <Campo rotulo="Telefone de assistência" value={item.assistencia?.telefone} onChange={contato('telefone','assistencia')} type="tel" maxLength={40}/>
        <Campo rotulo="WhatsApp da assistência" value={item.assistencia?.whatsapp} onChange={contato('whatsapp','assistencia')} type="tel" maxLength={40}/>
        <Campo rotulo="E-mail da assistência" value={item.assistencia?.email} onChange={contato('email','assistencia')} type="email" maxLength={200}/>
        <Campo rotulo="Endereço da assistência" value={item.assistencia?.endereco} onChange={contato('endereco','assistencia')} area rows={2} maxLength={1000}/>
      </fieldset></details>}
      <PessoaRH rotulo="Responsável do RH (opcional)" valor={item.responsavelId || ''} nome={item.responsavel || ''} aoMudar={(id,nome) => setItem(atual => ({ ...atual, responsavelId: id, responsavel: nome }))}/>
      <details className="doc-subsection doc-wide"><summary>{item.tipo === 'seguro' ? 'Bens segurados' : 'Bens relacionados'} · {ids.length}</summary><fieldset className="doc-subfields">
        <p className="doc-note doc-wide">Selecione pelo cadastro patrimonial. Uma apólice pode cobrir vários bens.</p>
        <div className="doc-asset-options doc-wide">{bens.map(b => <label className="doc-check" key={b.id}><input type="checkbox" checked={ids.includes(b.id)} disabled={canonical || b.disponivel === false && !ids.includes(b.id)} onChange={() => alternarBem(b.id)}/><span>{b.nome || b.identificacao || 'Bem'} <small>{b.especificacao?.placa || b.identificacao || b.tipo}{b.disponivel === false ? ' · retirado, vínculo existente' : ''} · ID {b.id}</small></span></label>)}
        {ids.filter(id => !bens.some(b => b.id === id)).map(id => <p className="doc-note" key={id}>Vínculo preservado: bem indisponível · ID {id}</p>)}</div>
        {!bens.length && <p className="doc-note doc-wide">Nenhum bem autorizado disponível para seleção.</p>}
      </fieldset></details>
      {item.tipo === 'garantia' && <details className="doc-subsection doc-wide"><summary>Acionamentos da garantia · {(item.acionamentos || []).length}</summary><fieldset className="doc-subfields">
        {(item.acionamentos || []).map(a => <fieldset className="doc-subfields doc-wide" key={a.id} disabled={(inicial.acionamentos || []).some(x => x.id === a.id && x.estado === 'resolvido')}><legend>Atendimento{(inicial.acionamentos || []).some(x => x.id === a.id && x.estado === 'resolvido') ? ' resolvido, histórico preservado' : ''}</legend>
          <Campo rotulo="Data do acionamento" value={a.data} onChange={acaoCampo(a.id,'data')} type="date" required/>
          <Opcoes rotulo="Estado do atendimento" valor={a.estado || 'aberto'} opcoes={ESTADOS_ACIONAMENTO} aoMudar={acaoCampo(a.id,'estado')}/>
          {['problema','encaminhamento','protocolo','retorno','solucao','observacao'].map(c => <Campo key={c} rotulo={{problema:'Problema',encaminhamento:'Encaminhamento',protocolo:'Protocolo',retorno:'Retorno do fornecedor',solucao:'Solução',observacao:'Observação'}[c]} value={a[c]} onChange={acaoCampo(a.id,c)} required={c === 'problema'} area={c !== 'protocolo'} rows={2} maxLength={1000}/>)}
          {!(inicial.acionamentos || []).some(x => x.id === a.id) && <button type="button" className="btn-ghost" onClick={() => setItem(atual => ({ ...atual, acionamentos: atual.acionamentos.filter(x => x.id !== a.id) }))}><Trash2 size={15}/>Remover acionamento do formulário</button>}
        </fieldset>)}
        <button type="button" className="btn-outline" onClick={() => setItem(atual => ({ ...atual, acionamentos: [...(atual.acionamentos || []), { id: crypto.randomUUID(), data: ymdLocal(new Date()), estado: 'aberto', problema: '' }] }))}><Plus size={16}/>Adicionar acionamento</button>
      </fieldset></details>}
      <details className="doc-subsection doc-wide"><summary>Observações</summary><Campo rotulo="Observações" value={item.observacao} onChange={campo('observacao')} area rows={3} maxLength={4000}/></details></>}
      <label className="label doc-wide"><span><Upload size={15}/> {renovacao ? 'Arquivos da nova versão (obrigatório)' : 'Arquivos do controle (opcional)'}</span><input className="input" type="file" multiple={!canonical} accept="application/pdf,image/png,image/jpeg,image/webp" required={renovacao} onChange={e => setArquivos(Array.from(e.target.files || []))}/><small>PDF ou imagem, até 3 MB por arquivo. Para garantia, anexe comprovante e termo. {inicial.arquivoNome && `Arquivo vigente: ${inicial.arquivoNome}.`} Anexos novos acrescentam arquivos ao conjunto vigente; a renovação preserva o conjunto anterior no histórico.</small></label>
    </fieldset>
    <div className="doc-actions doc-footer"><button className="btn-primary" disabled={ocupado}>{ocupado ? 'Salvando…' : renovacao ? 'Salvar renovação' : 'Salvar controle'}</button><button type="button" className="btn-ghost" disabled={ocupado} onClick={aoFechar}>Cancelar</button></div>
  </form>;
}
