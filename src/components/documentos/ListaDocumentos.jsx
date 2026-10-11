import {Link} from 'react-router-dom';
import {Fragment,useEffect,useId,useRef,useState} from 'react';
import {podeAbrir} from '../../lib/sessao.js';
import { ChevronDown, Download, Pencil, RefreshCw, Trash2, Phone, Mail, MessageCircle, ShieldCheck, FileCheck2, Wrench } from 'lucide-react';
import { ESTADOS_CONTROLE, ESTADOS_ACIONAMENTO, PAGAMENTOS, nomeTitular } from '../../lib/calc/documentos.js';
import { dataLonga, moeda } from '../../lib/format.js';

const TONS = { vencido:'chip-bad', urgente:'chip-warn', ok:'chip-ok', futuro:'chip', semVencimento:'chip', encerrado:'chip', sem:'chip-warn', faltante:'chip-warn', 'nao-se-aplica':'chip' };
export function ChipPrazo({sit}) { return <span className={`chip ${TONS[sit?.nivel] || 'chip'}`}>{sit?.rotulo || 'Prazo não informado'}</span>; }
const fone = valor => String(valor || '').replace(/[^\d+]/g,'').replace(/(?!^)\+/g,'');
export function ContatoDocumento({contato}) {
  if (!contato || !Object.values(contato).some(Boolean)) return null;
  const telefone = fone(contato.telefone), whatsapp = fone(contato.whatsapp).replace(/\D/g,'');
  return <div className="doc-contact"><strong>{contato.nome || 'Contato de atendimento'}</strong><div className="doc-actions">
    {telefone && <a href={`tel:${telefone}`}><Phone size={14}/>{contato.telefone}</a>}
    {whatsapp && <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={14}/>WhatsApp · {contato.whatsapp}</a>}
    {contato.email && <a href={`mailto:${encodeURIComponent(contato.email)}`}><Mail size={14}/>{contato.email}</a>}
  </div>{contato.endereco && <p>{contato.endereco}</p>}</div>;
}
function Dado({rotulo,valor}) { return valor !== '' && valor != null ? <div><dt>{rotulo}</dt><dd>{valor}</dd></div> : null; }
function Ficha({item,titulares,pessoas,bens,aoBaixar,ocupado,impressao}) {
  const titular = titulares.find(t => t.id === item.titularId);
  const responsavel = pessoas.find(p => p.id === item.responsavelId);
  return <div className="doc-detail">
    <dl className="doc-data">
      <Dado rotulo="Titular" valor={nomeTitular(titular,pessoas)}/><Dado rotulo="Tipo de titular" valor={titular && (titular.tipo === 'pessoa' ? 'Pessoa' : 'Empresa')}/>
      <Dado rotulo="Identificação" valor={item.identificacao}/><Dado rotulo="Estabelecimento" valor={item.estabelecimento}/>
      <Dado rotulo="Emissão / início" valor={item.emissao && dataLonga(item.emissao)}/><Dado rotulo="Vencimento" valor={item.semVencimento ? 'Sem vencimento' : item.validade ? dataLonga(item.validade) : 'Prazo não informado'}/>
      <Dado rotulo="Alerta" valor={`${item.alertaDias ?? 30} dias antes`}/><Dado rotulo="Estado" valor={ESTADOS_CONTROLE[item.estado] || item.estado}/>
      <Dado rotulo="Órgão emissor" valor={item.orgaoEmissor}/><Dado rotulo="Responsável" valor={responsavel?.nome || item.responsavel || 'Não informado'}/>
      {item.tipo === 'documento' && item.obrigacaoPagamento && <><Dado rotulo="Obrigação de pagamento" valor={item.obrigacaoPagamento}/><Dado rotulo="Pagamento (independente do arquivo)" valor={PAGAMENTOS[item.pagamentoSituacao] || 'Não informado'}/></>}
      {item.responsavelId && <Dado rotulo="Responsável RH (ID)" valor={item.responsavelId}/>}
      {item.tipo === 'seguro' && <><Dado rotulo="Seguradora" valor={item.seguradora}/><Dado rotulo="Prêmio" valor={item.valor == null ? 'Não informado' : moeda(item.valor)}/><Dado rotulo="Importância segurada" valor={item.valorSegurado == null ? 'Não informado' : moeda(item.valorSegurado)}/><Dado rotulo="Cobertura / franquia" valor={item.cobertura}/><Dado rotulo="Obrigação de pagamento" valor={item.obrigacaoPagamento}/><Dado rotulo="Pagamento" valor={PAGAMENTOS[item.pagamentoSituacao] || item.pagamentoSituacao}/></>}
      {item.tipo === 'garantia' && <><Dado rotulo="Fornecedor" valor={item.fornecedor}/><Dado rotulo="Fabricante" valor={item.fabricante}/><Dado rotulo="Compra" valor={item.compra && dataLonga(item.compra)}/><Dado rotulo="Tipo da garantia" valor={item.tipoGarantia}/><Dado rotulo="Condições" valor={item.condicoes}/></>}
      <Dado rotulo="Observações" valor={item.observacao}/>
    </dl>
    <ContatoDocumento contato={item.contato}/>{item.tipo === 'seguro' && item.assistencia && <div><h4>Assistência em caso de sinistro</h4><ContatoDocumento contato={item.assistencia}/></div>}{item.linkOficial && /^https?:\/\//i.test(item.linkOficial) && <a className="doc-official-link" href={item.linkOficial} target="_blank" rel="noopener noreferrer">Consulta / emissão no órgão oficial</a>}
    {!!item.anexos?.length && <div><h4>Arquivos vigentes</h4><ul className="doc-versions">{item.anexos.map(a => <li key={a.id}><strong>{a.nome}</strong>{!impressao && <button className="btn-outline" disabled={ocupado} onClick={() => aoBaixar(item,undefined,a.id)}><Download size={15}/>Abrir anexo</button>}</li>)}</ul></div>}
    {!!item.ativoIds?.length && <div><h4>{item.tipo === 'seguro' ? 'Bens segurados' : 'Bens relacionados'}</h4><ul className="doc-linked-assets">{item.ativoIds.map(id => {const bem=bens.find(b => b.id === id);return <li key={id}>{bem?.nome || 'Bem vinculado indisponível'}{bem?.especificacao?.placa && ` · ${bem.especificacao.placa}`} <small>ID {id}</small></li>;})}</ul></div>}
    {item.origem === 'incendio' && <p className="doc-note">AVCB da ficha predial, mesmo registro e origem. <Link to={`/patrimonio?aba=incendio&item=${encodeURIComponent(item.id)}`}>Abrir prevenção contra incêndio</Link></p>}
    {(item.acionamentos || []).length > 0 && <div><h4>Acionamentos da garantia</h4>{item.acionamentos.map(a => <article className="doc-history-entry" key={a.id}><div><strong>{dataLonga(a.data)}</strong><span className="chip">{ESTADOS_ACIONAMENTO[a.estado] || a.estado}</span></div><dl className="doc-data">{['problema','encaminhamento','protocolo','retorno','solucao','observacao'].map(c => <Dado key={c} rotulo={{problema:'Problema',encaminhamento:'Encaminhamento',protocolo:'Protocolo',retorno:'Retorno',solucao:'Solução',observacao:'Observação'}[c]} valor={a[c]}/>)}</dl></article>)}</div>}
    {(item.versoes || []).length > 0 && <div><h4>Histórico de versões</h4><ul className="doc-versions">{[...item.versoes].reverse().map((v,i) => <li key={v.id || i}><div><strong>{v.anexos?.length ? v.anexos.map(a => a.nome).join(' · ') : v.arquivo?.nome || v.nome || v.arquivoNome || 'Versão anterior'}</strong><small>Emissão: {v.emissao ? dataLonga(v.emissao) : 'não informada'} · Vencimento: {v.semVencimento ? 'sem vencimento' : v.validade ? dataLonga(v.validade) : 'não informado'}</small>{v.criadoEm && <small>Registrada em {new Date(v.criadoEm).toLocaleString('pt-BR')}</small>}</div>{!impressao && v.id && <div className="doc-actions">{v.anexos?.length ? v.anexos.map(a => <button key={a.id} className="btn-outline" disabled={ocupado} onClick={() => aoBaixar(item,v.id,a.id)}><Download size={15}/>{a.nome}</button>) : <button className="btn-outline" disabled={ocupado} onClick={() => aoBaixar(item,v.id)} aria-label={`Baixar versão ${v.arquivo?.nome || v.nome || i+1}`}><Download size={15}/>Abrir versão</button>}</div>}</li>)}</ul></div>}
  </div>;
}
export default function ListaDocumentos({itens,titulares,pessoas,bens,aoEditar,aoRenovar,aoExcluir,aoBaixar,ocupado,impressao=false,alvo}) {
  const prefixo=useId(),destino=useRef(null),ultimo=useRef('');
  const [abertos,setAbertos]=useState(()=>new Set(alvo?[alvo]:[]));
  useEffect(()=>{
    if(!alvo){ultimo.current='';return;}
    if(!impressao&&ultimo.current!==alvo&&destino.current){
      ultimo.current=alvo;
      setAbertos(atuais=>new Set([...atuais,alvo]));
      destino.current.scrollIntoView({block:'center'});
      destino.current.focus({preventScroll:true});
    }
  },[alvo,itens,impressao]);
  function alternar(id){
    setAbertos(atuais=>{const proximos=new Set(atuais);if(proximos.has(id))proximos.delete(id);else proximos.add(id);return proximos;});
  }
  return <div className="doc-controls-table-wrap"><table className="doc-controls-table" aria-label="Lista de documentos e controles">
    <thead><tr><th scope="col">Documento / controle</th><th scope="col">Titular</th><th scope="col">Responsável</th><th scope="col">Vencimento / situação</th>{!impressao&&<th scope="col" className="doc-controls-actions-heading">Ações</th>}</tr></thead>
    <tbody>{itens.map(item=>{
      const titular=titulares.find(t=>t.id===item.titularId),responsavel=pessoas.find(p=>p.id===item.responsavelId);
      const Icone=item.tipo==='seguro'?ShieldCheck:item.tipo==='garantia'?Wrench:FileCheck2;
      const nome=item.nome||item.categoria||'Controle sem nome',aberto=impressao||abertos.has(item.id),detalhesId=`${prefixo}-${item.id}`;
      const titulo=<><span className="doc-control-icon" aria-hidden="true"><Icone size={17}/></span><strong>{nome}</strong></>;
      return <Fragment key={item.id}>
        <tr className={`doc-control-row ${aberto?'is-open ':''}${item.id===alvo?'is-requested':''}`}>
          <td data-label="Documento / controle" className="doc-control-name">
            {impressao?<div className="doc-control-title">{titulo}</div>:<button type="button" className="doc-control-toggle" aria-expanded={aberto} aria-controls={detalhesId} onClick={()=>alternar(item.id)} ref={el=>{if(item.id===alvo)destino.current=el;}}>{titulo}<ChevronDown className="doc-control-chevron" size={16} aria-hidden="true"/></button>}
            {[item.categoria,item.identificacao].filter(Boolean).length>0&&<small>{[item.categoria,item.identificacao].filter(Boolean).join(' · ')}</small>}
            {(!item.titularId||item.classificacaoPendente)&&<span className="doc-pending">Titular pendente: registro antigo</span>}
          </td>
          <td data-label="Titular"><span>{nomeTitular(titular,pessoas)}</span></td>
          <td data-label="Responsável"><span>{responsavel?.nome||item.responsavel||'Não informado'}</span>{item.estado==='renovacao'&&!item.responsavelId&&<span className="doc-pending">Renovação sem responsável do RH</span>}</td>
          <td data-label="Vencimento / situação" className="doc-control-deadline"><span>{item.semVencimento?'Sem vencimento':item.validade?dataLonga(item.validade):'Prazo não informado'}</span><ChipPrazo sit={item.sit}/></td>
          {!impressao&&<td data-label="Ações" className="doc-control-actions"><div className="doc-actions">
            {item.temArquivo&&<button type="button" className="btn-ghost" disabled={ocupado} onClick={()=>aoBaixar(item)} aria-label={`Abrir arquivo de ${nome}`} title="Abrir arquivo"><Download size={15}/><span>Arquivo</span></button>}
            {item.origem!=='incendio'&&<button type="button" className="btn-ghost" disabled={ocupado} onClick={()=>aoEditar(item)} aria-label={`Editar ${nome}`} title="Editar"><Pencil size={15}/><span>Editar</span></button>}
            <button type="button" className="btn-outline" disabled={ocupado} onClick={()=>aoRenovar(item)} aria-label={`Renovar ${nome}`} title="Renovar"><RefreshCw size={15}/><span>Renovar</span></button>
            {item.origem!=='incendio'&&<button type="button" className="btn-ghost" disabled={ocupado} onClick={()=>aoExcluir(item)} aria-label={`Mover ${nome} para lixeira`} title="Mover para lixeira"><Trash2 size={15}/></button>}
          </div></td>}
        </tr>
        <tr className="doc-control-detail-row" hidden={!aberto}><td colSpan={impressao?4:5}><div id={detalhesId} role="region" aria-label={`Detalhes de ${nome}`}><Ficha item={item} titulares={titulares} pessoas={pessoas} bens={bens} aoBaixar={aoBaixar} ocupado={ocupado} impressao={impressao}/></div></td></tr>
      </Fragment>;
    })}</tbody>
  </table></div>;
}
export function ListaVeiculos({bens,itens,titulares,pessoas,ocupado,aoNovo,aoEditar,aoRenovar,aoExcluir,aoBaixar,impressao=false,bensRelacionados,aoBaixarLegado,alvo}) {
  return <div className="doc-list">{bens.map(bem => {const controles=itens.filter(i=>i.ativoIds?.includes(bem.id));return <article className="doc-vehicle" key={bem.id}><header><div><strong>{bem.nome || bem.identificacao || 'Veículo'}</strong><p>{[bem.especificacao?.placa,bem.especificacao?.marcaModelo,bem.especificacao?.ano].filter(Boolean).join(' · ') || 'Dados físicos do cadastro patrimonial'}</p><small>ID {bem.id}</small></div><span className="chip">{bem.disponivel === false ? 'Retirado · ' : ''}{controles.length} controles</span></header><details className="doc-subsection" open={impressao||undefined}><summary>Dados do Patrimônio</summary><dl className="doc-data"><Dado rotulo="Identificação" valor={bem.identificacao}/><Dado rotulo="Situação" valor={bem.situacao||bem.especificacao?.situacao}/><Dado rotulo="Modelo" valor={bem.especificacao?.modelo}/><Dado rotulo="Fabricante" valor={bem.especificacao?.fabricante}/><Dado rotulo="Número de série" valor={bem.especificacao?.numeroSerie||bem.especificacao?.serie}/><Dado rotulo="ID do bem" valor={bem.bemId}/></dl>{(bem.inventario || []).map(i=><dl className="doc-data" key={i.id}><Dado rotulo="Código do inventário" valor={i.codigo}/><Dado rotulo="ID do inventário" valor={i.id}/><Dado rotulo="Setor" valor={i.setorSigla}/><Dado rotulo="Situação" valor={i.situacao}/>{podeAbrir('inventario-valores')&&<><Dado rotulo="Nome do inventário" valor={i.nomeGenerico}/><Dado rotulo="Descrição técnica" valor={i.descricaoTecnica}/><Dado rotulo="Aquisição" valor={i.dataAquisicao ? dataLonga(i.dataAquisicao) : null}/><Dado rotulo="Nota fiscal" valor={i.nf}/><Dado rotulo="Valor de aquisição" valor={i.valor==null?null:moeda(i.valor)}/></>}</dl>)}</details>{!!bem.pendencias?.length&&<p className="doc-note">Pendências de origem: {bem.pendencias.join(' · ')}</p>}{bem.documentoLegado && <div className="doc-notice"><strong>Documento antigo preservado na ficha física</strong><p>Emissão: {bem.emissao ? dataLonga(bem.emissao) : 'não informada'} · Validade: {bem.validade ? dataLonga(bem.validade) : 'não informada'}.</p><p>Confira a origem antes de cadastrar o controle pelo ID do veículo.</p>{!impressao && bem.temArquivo && podeAbrir('inventario-valores') && aoBaixarLegado && <button className="btn-ghost" disabled={ocupado} onClick={()=>aoBaixarLegado(bem)}><Download size={15}/>Arquivo da ficha</button>}</div>}{controles.length ? <ListaDocumentos itens={controles} titulares={titulares} pessoas={pessoas} bens={bensRelacionados || bens} ocupado={ocupado} aoEditar={aoEditar} aoRenovar={aoRenovar} aoExcluir={aoExcluir} aoBaixar={aoBaixar} impressao={impressao} alvo={alvo}/> : <p className="doc-note">Nenhum controle vinculado pelo ID deste veículo neste recorte.</p>}{!impressao && <div className="doc-actions"><button className="btn-outline" disabled={ocupado || bem.disponivel === false} onClick={()=>aoNovo('documento',[bem.id])}>Adicionar documento</button><button className="btn-ghost" disabled={ocupado || bem.disponivel === false} onClick={()=>aoNovo('seguro',[bem.id])}>Adicionar seguro</button><Link to={`/patrimonio?aba=carros&item=${encodeURIComponent(bem.id)}`} className="btn-ghost">Ficha no Patrimônio</Link></div>}</article>;})}</div>;
}
