import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, BookmarkCheck, Building2, ClipboardList, Package, Plus, Search, X } from 'lucide-react';
import { urlOficialSegura } from '../lib/licitacoes-pesquisa.mjs';
import { resumirProduto } from '../lib/licitacoes-servicos.mjs';
import DatasLicitacao from './DatasLicitacao.jsx';
import DocumentosEdital from './DocumentosEdital.jsx';
import ConferirRequisitosLicitacao from './ConferirRequisitosLicitacao.jsx';
import './interesses-licitacoes.css';

function identificarParte(rotulo, valor) {
  if (!valor) return '';
  return valor.toLocaleLowerCase('pt-BR').startsWith(`${rotulo.toLowerCase()} `) ? valor : `${rotulo} ${valor}`;
}

function ItemSelecionado({ selecao, aoRemover, acompanhamento }) {
  const { chave, item } = selecao;
  const produto = resumirProduto(item.produto);
  const registro = acompanhamento?.(selecao);
  const referencia = [identificarParte('Item', item.item), identificarParte('Lote', item.lote)].filter(Boolean).join(' · ');
  return <li className="lie-item">
    <span className="lie-item-icone"><Package size={17} aria-hidden="true" /></span>
    <div className="lie-item-texto">
      <strong>{produto}</strong>
      {referencia && <p>{referencia}</p>}
      {registro?.erro && <p className="lie-item-erro" role="alert">{registro.erro}</p>}
    </div>
    <div className="lie-item-acoes">
      {registro && <button type="button" className="lie-acao" disabled={registro.ocupado} onClick={registro.acionar}>
        {registro.rotulo}
      </button>}
      <button type="button" className="lie-acao lie-remover" aria-label={`Remover ${produto} dos selecionados`} onClick={() => aoRemover(chave)}>
        <X size={16} aria-hidden="true" /> Remover
      </button>
    </div>
  </li>;
}

function ProcessoSelecionado({ grupo, aoMarcar, aoRemover, aoIncluirRequisitos, aoRemoverRequisito, acompanhamento }) {
  const { id, itens, documentos, prontos } = grupo;
  const [editando, setEditando] = useState(false);
  const primeiro = itens[0].item;
  const oficial = itens.map(({ item }) => urlOficialSegura(item.oficialUrl)).find(Boolean);
  const versaoMaisRecente = itens[0].geradoEm;
  const versoes = itens.filter(selecao => selecao.geradoEm === versaoMaisRecente).map(selecao => selecao.item);
  const datasEdital = Object.assign({}, ...versoes.map(item => item.datasEdital));
  const arquivosEdital = versoes.flatMap(item => item.arquivosEdital || []);
  const situacaoEdital = versoes.find(item => item.situacaoEdital)?.situacaoEdital;
  const total = documentos.length;
  const concluidos = documentos.filter(documento => prontos.includes(documento.id)).length;
  return <article className="lie-processo">
    <header className="lie-processo-cabecalho">
      <span className="lie-icone"><Building2 size={20} aria-hidden="true" /></span>
      <div className="lie-identidade">
        <h3>{primeiro.orgao || 'Órgão a confirmar'}</h3>
        <p>{primeiro.processo || 'Processo a confirmar'}</p>
      </div>
      {oficial && <a className="lie-acao lie-fonte" href={oficial} target="_blank" rel="noopener noreferrer">
        Fonte oficial <ArrowUpRight size={16} aria-hidden="true" />
      </a>}
    </header>

    <DatasLicitacao item={{ ...primeiro, datasEdital, situacaoEdital }} />

    <section className="lie-itens" aria-label="Itens selecionados">
      <h4>{itens.length === 1 ? 'Item selecionado' : `${itens.length} itens selecionados`}</h4>
      <ul>{itens.map(selecao => <ItemSelecionado key={selecao.chave} selecao={selecao} aoRemover={aoRemover} acompanhamento={acompanhamento} />)}</ul>
    </section>

    <details className="lie-checklist">
      <summary>
        <ClipboardList size={19} aria-hidden="true" />
        <span>Checklist de documentos</span>
        {total > 0 && <span className="lie-checklist-progresso">
          <span>{concluidos} de {total} prontos</span>
          <progress value={concluidos} max={total} aria-label="Documentos prontos neste processo" />
        </span>}
      </summary>
      <div className="lie-checklist-corpo">
        <DocumentosEdital documentos={documentos} arquivosEdital={arquivosEdital} prontos={prontos} oficialUrl={oficial}
          aoMarcar={(docId, pronto) => aoMarcar(id, docId, pronto)} aoRemoverRequisito={aoRemoverRequisito} />
        {aoIncluirRequisitos && <button type="button" className="lie-acao lie-incluir" onClick={() => setEditando(true)}>
          <Plus size={16} aria-hidden="true" /> Incluir requisitos do edital
        </button>}
      </div>
    </details>
    {editando && <ConferirRequisitosLicitacao grupo={grupo} aoSalvar={aoIncluirRequisitos} aoFechar={() => setEditando(false)} />}
  </article>;
}

export default function InteressesLicitacoes({ grupos, aoMarcar, aoRemover, aoPesquisar, aoIncluirRequisitos, aoRemoverRequisito, acompanhamento }) {
  const titulo = useRef(null);
  useEffect(() => { titulo.current?.focus(); }, []);
  const totalItens = grupos.reduce((total, grupo) => total + grupo.itens.length, 0);
  return <section className="lie-area" aria-labelledby="lie-titulo">
    <header className="lie-capa">
      <span className="lie-icone lie-capa-icone"><BookmarkCheck size={26} aria-hidden="true" /></span>
      <div className="lie-capa-texto">
        <h2 id="lie-titulo" ref={titulo} tabIndex={-1}>Quero participar</h2>
        <p>Acompanhe os prazos e prepare os documentos de cada processo.</p>
      </div>
      {totalItens > 0 && <dl className="lie-contagem" aria-label="Resumo da seleção">
        <div><dt>Processos</dt><dd>{grupos.length}</dd></div>
        <div><dt>Itens selecionados</dt><dd>{totalItens}</dd></div>
      </dl>}
    </header>
    {grupos.length ? <div className="lie-processos">
      {grupos.map(grupo => <ProcessoSelecionado key={grupo.id} grupo={grupo} aoMarcar={aoMarcar} aoRemover={aoRemover}
        aoIncluirRequisitos={aoIncluirRequisitos} aoRemoverRequisito={aoRemoverRequisito} acompanhamento={acompanhamento} />)}
    </div> : <div className="lie-vazio">
      <span className="lie-icone"><Search size={24} aria-hidden="true" /></span>
      <h3>Nenhum item selecionado</h3>
      <p>Use <strong>Quero participar</strong> no cartão de uma oportunidade para salvá-la aqui.</p>
      <button type="button" className="btn-primary" onClick={aoPesquisar}>Pesquisar oportunidades <ArrowUpRight size={16} aria-hidden="true" /></button>
    </div>}
  </section>;
}
