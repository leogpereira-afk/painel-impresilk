import React, { useId } from 'react';
import { ArrowUpRight, ClipboardCheck, FileText, Info, KeyRound } from 'lucide-react';
import { urlOficialSegura } from '../lib/licitacoes-pesquisa.mjs';
import './documentos-edital.css';

const CATEGORIAS = [
  { id: 'credenciamento', titulo: 'Credenciamento', Icone: KeyRound },
  { id: 'habilitacao', titulo: 'Habilitação', Icone: ClipboardCheck },
  { id: 'proposta', titulo: 'Proposta', Icone: FileText },
];

function Documento({ documento, pronto, aoMarcar, aoRemoverRequisito }) {
  const idEscopo = useId();
  const fonte = urlOficialSegura(documento.fonteUrl);
  const modelo = urlOficialSegura(documento.modeloUrl);
  const especifico = documento.escopo === 'item';
  return <li className="lde-documento">
    <div className="lde-identificacao">
      {aoMarcar ? <label className="lde-controle">
        <input type="checkbox" aria-describedby={especifico ? idEscopo : undefined} checked={pronto} onChange={evento => aoMarcar(documento.id, evento.target.checked)} />
        <span>{documento.nome}</span>
      </label> : <strong>{documento.nome}</strong>}
      {aoMarcar && <span className="lde-status" data-pronto={pronto}>{pronto ? 'Pronto' : 'Pendente'}</span>}
    </div>
    {especifico && <p className="lde-escopo" id={idEscopo}>{documento.itens?.join(' · ') || 'Exigência específica do item ou lote'}</p>}
    {documento.orientacao && <p>{documento.orientacao}</p>}
    <div className="lde-fontes">
      {fonte ? <a href={fonte} target="_blank" rel="noopener noreferrer">
        {documento.referencia || 'Fonte no edital'}<ArrowUpRight size={14} aria-hidden="true" />
      </a> : documento.referencia && <span>{documento.referencia}</span>}
      {modelo && modelo !== fonte && <a href={modelo} target="_blank" rel="noopener noreferrer">
        Abrir modelo<ArrowUpRight size={14} aria-hidden="true" />
      </a>}
      {documento.manual && <span>Conferência manual</span>}
      {documento.manual && aoRemoverRequisito && <button className="lie-acao" type="button"
        aria-label={`Remover requisito ${documento.nome}`} onClick={() => aoRemoverRequisito(documento.id)}>Remover requisito</button>}
    </div>
  </li>;
}

function ArquivosEdital({ arquivos }) {
  const links = new Map();
  for (const arquivo of arquivos) {
    const url = urlOficialSegura(arquivo.url);
    if (url && !links.has(url)) links.set(url, arquivo.nome || arquivo.tipo || 'Arquivo oficial');
  }
  if (!links.size) return null;
  return <section className="lde-arquivos" aria-label="Edital e anexos oficiais">
    <strong>Edital e anexos oficiais</strong>
    <ul>{Array.from(links, ([url, nome]) => <li key={url}>
      <a href={url} target="_blank" rel="noopener noreferrer"><FileText size={15} aria-hidden="true" />{nome}<ArrowUpRight size={14} aria-hidden="true" /></a>
    </li>)}</ul>
  </section>;
}

export default function DocumentosEdital({ documentos = [], arquivosEdital = [], prontos = [], aoMarcar, oficialUrl, aoRemoverRequisito }) {
  const grupos = CATEGORIAS.map(categoria => ({
    ...categoria,
    documentos: documentos.filter(documento => documento.categoria === categoria.id),
  })).filter(categoria => categoria.documentos.length);
  const oficial = urlOficialSegura(oficialUrl);
  return <div className="lde-grupos">
    {!grupos.length && <div className="lde-aviso">
      <Info size={17} aria-hidden="true" />
      <div><p>Documentos a confirmar no edital e nos anexos oficiais.</p>
        {oficial && <a href={oficial} target="_blank" rel="noopener noreferrer">Consultar fonte oficial<ArrowUpRight size={14} aria-hidden="true" /></a>}
      </div>
    </div>}
    {grupos.map(({ id, titulo, Icone, documentos: itens }) => <section className="lde-grupo" key={id} aria-label={titulo}>
      <header><Icone size={16} aria-hidden="true" /><span>{titulo}</span></header>
      <ul>{itens.map(documento => <Documento
        key={documento.id || JSON.stringify([documento.nome, documento.referencia, documento.fonteUrl, documento.escopo])}
        documento={documento}
        pronto={prontos.includes(documento.id)}
        aoMarcar={aoMarcar}
        aoRemoverRequisito={aoRemoverRequisito}
      />)}</ul>
    </section>)}
    <ArquivosEdital arquivos={arquivosEdital} />
  </div>;
}
