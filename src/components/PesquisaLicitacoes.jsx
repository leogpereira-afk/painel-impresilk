import React, { useId, useMemo, useState } from 'react';
import { Bot, RefreshCw, Search, Download, Copy, ArrowUpRight, AlertTriangle, MapPin, CalendarClock, ChevronLeft, ChevronRight, FileSearch } from 'lucide-react';
import { filtrarOportunidades, resumoCobertura, prazoOportunidade, relatorioAntigo, urlOficialSegura, urlBotSegura, exportarCSV, paginar, normalizarBusca, formatarData } from '../lib/licitacoes-pesquisa.mjs';
import './licitacoes-pesquisa.css';

const FILTROS_VAZIOS = { busca: '', classificacao: '', municipio: '', orgao: '', produto: '' };
const LISTA_VAZIA = Object.freeze([]);
const CLASSIFICACOES = ['GO', 'REVISÃO HUMANA', 'NO-GO'];
const NOMES_VALIDACAO = { tecnica: 'Técnica', documental: 'Documental', comercial: 'Comercial', logistica: 'Logística' };
const PERGUNTAS_BOT = [
  'Quais licitações GO do último relatório atendem ao portfólio da Impresilk? Confira os prazos e informe os links oficiais.',
  'Quais municípios e instituições ainda têm pesquisa parcial ou não foram consultados no último relatório?',
  'Quais oportunidades exigem revisão humana e quais documentos ou confirmações estão pendentes?',
];

function baixarCSV(nome, cabecalhos, linhas) {
  const blob = new Blob([exportarCSV(cabecalhos, linhas)], { type: 'text/csv;charset=utf-8' });
  const endereco = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = endereco;
  link.download = `${nome}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(endereco), 30000);
}

function ResultadoChip({ resultado }) {
  const texto = String(resultado ?? 'NÃO CONSULTADO');
  const concluido = texto.startsWith('PESQUISA CONCLUÍDA');
  const parcial = texto.startsWith('PESQUISA PARCIAL');
  return <span className={`lp-chip ${concluido ? 'lp-ok' : parcial ? 'lp-warn' : 'lp-neutral'}`} title={texto}>{concluido ? texto.includes('SEM CANDIDATOS') ? 'Concluída sem candidatos' : 'Concluída com candidatos' : parcial ? 'Pesquisa parcial' : 'Não consultado'}</span>;
}

function FonteLink({ url }) {
  const segura = urlOficialSegura(url);
  if (!segura) return null;
  return <a href={segura} target="_blank" rel="noopener noreferrer" title={segura}>{new URL(segura).hostname}<ArrowUpRight size={12} aria-hidden="true" /></a>;
}

function MatrizCobertura({ titulo, linhas, campoNome, tamanho = 12, nomeArquivo, resumo }) {
  const id = useId();
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState('');
  const [pagina, setPagina] = useState(1);
  const filtradas = useMemo(() => linhas.filter(linha => normalizarBusca(linha[campoNome]).includes(normalizarBusca(busca)) && (!situacao || String(linha.resultado).startsWith(situacao))), [linhas, campoNome, busca, situacao]);
  const paginas = paginar(filtradas, pagina, tamanho);
  function exportar() {
    baixarCSV(nomeArquivo, [campoNome === 'municipio' ? 'Município' : 'Instituição', 'Fontes consultadas', 'Resultado da cobertura', 'Pendência', 'Abrangência demonstrada'], filtradas.map(linha => [linha[campoNome], (linha.fontesConsultadas || []).map(urlOficialSegura).filter(Boolean).join(' | '), linha.resultado, linha.pendencia, (linha.abrangenciaDemonstrada || []).join(' | ')]));
  }
  return <details className="lp-matriz">
    <summary><span>{titulo} <span className="lp-count">{linhas.length}</span></span><span className="lp-matriz-resumo">{resumo}</span></summary>
    <div className="lp-matriz-conteudo">
      <div className="lp-matriz-filtros">
        <label htmlFor={`${id}-busca`}>{campoNome === 'municipio' ? 'Encontrar município' : 'Encontrar instituição'}<input id={`${id}-busca`} value={busca} onChange={e => { setBusca(e.target.value); setPagina(1); }} placeholder="Buscar pelo nome" type="search" /></label>
        <label htmlFor={`${id}-situacao`}>Cobertura<select id={`${id}-situacao`} value={situacao} onChange={e => { setSituacao(e.target.value); setPagina(1); }}><option value="">Todas as situações</option><option value="PESQUISA CONCLUÍDA">Concluída</option><option value="PESQUISA PARCIAL">Parcial</option><option value="NÃO CONSULTADO">Não consultado</option></select></label>
        <button type="button" className="lp-button" onClick={exportar} disabled={!filtradas.length}><Download size={15} aria-hidden="true" />Exportar CSV</button>
      </div>
      {!filtradas.length ? <p className="lp-empty" role="status">Nenhum registro para esses filtros.</p> : <div className="lp-tabela-wrap"><table className="lp-tabela">
        <caption className="sr-only">{titulo}, fontes efetivamente consultadas e pendências</caption>
        <thead><tr><th scope="col">{campoNome === 'municipio' ? 'Município' : 'Instituição'}</th><th scope="col">Fonte(s) consultada(s)</th><th scope="col">Resultado da cobertura</th><th scope="col">Pendência</th></tr></thead>
        <tbody>{paginas.itens.map(linha => <tr key={linha[campoNome]}>
          <th scope="row">{linha[campoNome]}</th>
          <td data-label="Fontes"><div className="lp-fontes">{(linha.fontesConsultadas || []).filter(urlOficialSegura).length ? (linha.fontesConsultadas || []).filter(urlOficialSegura).map(url => <FonteLink key={url} url={url} />) : <span>Sem consulta registrada</span>}</div></td>
          <td data-label="Cobertura"><ResultadoChip resultado={linha.resultado} /></td>
          <td data-label="Pendência">{linha.pendencia || 'Sem pendência registrada'}{linha.abrangenciaDemonstrada?.length > 0 && <details className="lp-abrangencia"><summary>Abrangência registrada</summary><ul>{linha.abrangenciaDemonstrada.map((texto, i) => <li key={i}>{texto}</li>)}</ul></details>}</td>
        </tr>)}</tbody>
      </table></div>}
      <div className="lp-paginacao"><span aria-live="polite">{filtradas.length} registros · página {paginas.pagina} de {paginas.totalPaginas}</span><div><button type="button" className="lp-button" aria-label={`Página anterior de ${titulo}`} disabled={paginas.pagina <= 1} onClick={() => setPagina(paginas.pagina - 1)}><ChevronLeft size={16} aria-hidden="true" />Anterior</button><button type="button" className="lp-button" aria-label={`Próxima página de ${titulo}`} disabled={paginas.pagina >= paginas.totalPaginas} onClick={() => setPagina(paginas.pagina + 1)}>Próxima<ChevronRight size={16} aria-hidden="true" /></button></div></div>
    </div>
  </details>;
}

function Oportunidade({ item, aoCopiarPrompt }) {
  const prazo = prazoOportunidade(item.prazo);
  const link = urlOficialSegura(item.oficialUrl);
  const tom = item.classificacao === 'GO' ? 'lp-ok' : item.classificacao === 'NO-GO' ? 'lp-bad' : 'lp-warn';
  return <article className="lp-oportunidade">
    <div className="lp-oportunidade-topo"><div><p className="lp-eyebrow">{item.processo || 'Identificação pendente'}</p><h4>{item.orgao || 'Órgão a confirmar'}</h4></div><span className={`lp-chip ${tom}`} title="Classificação registrada no relatório">{item.classificacao}</span></div>
    <p className="lp-produto">{item.produto || 'Produto a confirmar'}{item.item ? ` · item ${item.item}` : ''}{item.lote ? ` · lote ${item.lote}` : ''}</p>
    <div className="lp-oportunidade-meta"><span><MapPin size={14} aria-hidden="true" />{item.municipiosAbrangidos?.join(', ') || 'Destino a confirmar'}</span><span className={prazo.encerrado ? 'lp-text-bad' : prazo.proximo ? 'lp-text-warn' : ''}><CalendarClock size={14} aria-hidden="true" />{prazo.texto}</span></div>
    <details className="lp-detalhes-oportunidade"><summary>Ver análise e exigências</summary><div className="lp-detalhes-corpo">
      <p><strong>Classificação registrada:</strong> {item.classificacao}. {item.justificativa || 'Justificativa não detalhada no relatório.'}</p>
      {prazo.encerrado && <p className="lp-aviso lp-warn">O prazo está encerrado na leitura atual. Confira a situação e as retificações no portal oficial.</p>}
      <div className="lp-detalhes-grid"><div><h5>Exigências</h5>{item.exigencias?.length ? <ul>{item.exigencias.map((texto, i) => <li key={i}>{texto}</li>)}</ul> : <p>Não detalhadas neste relatório. Confira o edital e seus anexos.</p>}</div><div><h5>Próxima ação recomendada</h5><p>{item.proximaAcao || 'Conferir o edital vigente e a documentação necessária.'}</p></div></div>
      {item.localExecucao && <p><strong>Execução:</strong> {item.localExecucao.evidencia || 'Evidência territorial não detalhada.'}{item.localExecucao.misto ? ' Lote com atendimento também fora da região.' : ''}{item.localExecucao.misto && item.localExecucao.logisticaViavel !== true ? ' Viabilidade logística pendente de revisão humana.' : ''}</p>}
      {item.validacoes && <div><h5>Conferências registradas</h5><dl className="lp-validacoes">{Object.entries(NOMES_VALIDACAO).map(([chave, nome]) => { const validacao = item.validacoes[chave]; return <div key={chave}><dt>{nome}</dt><dd>{validacao?.estado || 'Pendente'}{validacao?.resumoPublico ? ` · ${validacao.resumoPublico}` : ''}{validacao?.confirmadaEm ? ` · ${formatarData(validacao.confirmadaEm)}` : ''}</dd></div>; })}</dl></div>}
    </div></details>
    <div className="lp-oportunidade-rodape">{link ? <a className="lp-link-oficial" href={link} target="_blank" rel="noopener noreferrer">Abrir fonte oficial<ArrowUpRight size={15} aria-hidden="true" /></a> : <span className="lp-text-warn">Link oficial indisponível</span>}<button type="button" className="lp-button" onClick={() => aoCopiarPrompt(item)}><Copy size={14} aria-hidden="true" />Copiar prompt</button><small>Análise para decisão humana</small></div>
  </article>;
}

function promptParticipacao(item) {
  const contexto=item?`Edital: ${item.processo||'identificação pendente'}; órgão: ${item.orgao||'pendente'}; item: ${item.item||'pendente'}; lote: ${item.lote||'não informado'}; produto: ${item.produto||'pendente'}; destino: ${(item.municipiosAbrangidos||[]).join(', ')||'pendente'}; prazo registrado: ${item.prazo||'pendente'}; fonte: ${urlOficialSegura(item.oficialUrl)||'pendente'}. Exigências públicas: ${(item.exigencias||[]).join('; ')||'ler edital e anexos'}.`:'Examine os editais do último relatório público de licitações, individualmente, com fontes oficiais e itens independentes.';
  return `Coordenador BotImpresilk e especialista de Licitações: preparar análise e minuta para revisão humana. ${contexto}\nReconfirme AGORA status, prazo real de novas propostas em Brasília, anexos e retificações, citando URL, data/hora, arquivo e página/cláusula. Separe proposta, sessão e lances; prazo encerrado significa NO-GO para nova entrada, salvo reabertura oficial comprovada.\nConsolide quatro confirmações documentadas: técnica, documental/elegibilidade, comercial/custos e logística/produção. Peça aos especialistas apenas os dados mínimos do item. Confira atestado compatível, enquadramento exigido, cadastros e CAGEF quando aplicável com sua antecedência; não presuma capacidade, documentos ou cadastro da Impresilk. Confira unidade literal, materiais, amostra, arte, instalação/remoção, garantia, subcontratação e prazos de cada ordem. Preços, custos e margens devem ter fonte e memória de cálculo; não invente valores nem trate quantidade estimada como compra garantida.\nUse somente fontes públicas e dados fornecidos nesta conversa; não acesse memória privada ou sistemas internos por iniciativa própria. Entregue checklist com atende/pendente/evidência/responsável, custo sem valores inventados, cronograma, riscos, perguntas e minuta com lacunas destacadas. Sem as quatro confirmações mantenha REVISÃO HUMANA; GO é parecer interno e não autoriza disputar. Não envie proposta ou documentos, não faça cadastro, contato, lance, assinatura ou compromisso. Qualquer ação externa depende de decisão expressa do responsável para a operação concreta; limite genérico de valor não é autorização.`;
}

function EstadoExecucao({ execucao, aoConsultar }) {
  const dados=execucao?.dados;
  const estado=dados?.estado;
  const rotulos={solicitada:'Pesquisa solicitada',em_andamento:'Pesquisa em andamento',concluida:'Etapa automática concluída',falhou:'Falha na etapa automática',sem_execucao:'Pesquisa pronta para iniciar'};
  const url=urlOficialSegura(dados?.execucao?.url);
  const link=url&&/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/\d+$/.test(url)?url:null;
  return <div className="lp-execucao" aria-busy={execucao?.carregando||execucao?.iniciando||false}>
    <div className="lp-execucao-topo"><strong role="status">{execucao?.iniciando?'Solicitando pesquisa…':rotulos[estado]||'Execução ainda não consultada'}</strong>{aoConsultar&&<button type="button" className="lp-button" disabled={execucao?.carregando||execucao?.iniciando} onClick={aoConsultar}><RefreshCw size={14} aria-hidden="true" />{execucao?.carregando?'Consultando…':'Consultar execução'}</button>}</div>
    <p>Varredura pública automática de propostas no PNCP. Portais municipais, Diário Oficial, anexos e demais consultas pendentes continuam indicados no relatório.</p>
    {dados?.demonstracao&&<p className="lp-text-warn">Prévia demonstrativa. Nenhuma pesquisa real é iniciada.</p>}
    {dados?.mensagem&&<p>{dados.mensagem}</p>}
    {estado==='concluida'&&<p>A conclusão desta etapa não comprova cobertura integral: a cobertura dos 89 municípios continua calculada pelo relatório publicado. Atualize a leitura para consultar o acervo.</p>}
    <div className="lp-execucao-meta">{dados?.solicitadaEm&&<span>Solicitada: {formatarData(dados.solicitadaEm,true)} (Brasília)</span>}{dados?.execucao?.iniciadaEm&&<span>Execução: {formatarData(dados.execucao.iniciadaEm,true)} (Brasília)</span>}{dados?.consultadoEm&&<span>Conferido: {formatarData(dados.consultadoEm,true)} (Brasília)</span>}{link&&<a href={link} target="_blank" rel="noopener noreferrer">Abrir execução<ArrowUpRight size={13} aria-hidden="true" /></a>}</div>
    {(execucao?.erro||dados?.erro)&&<p className="lp-aviso lp-bad" role="alert">{execucao?.erro||dados.erro}{execucao?.erro&&dados?' O estado anterior não foi atualizado.':''}</p>}
    {['solicitada','em_andamento'].includes(estado)&&<p>Use Consultar execução para conferir o andamento.{dados?.podeRepetir?' O início ainda não foi identificado; é possível solicitar novamente após conferir a execução no GitHub.':''}</p>}
    {dados?.cooldownAte&&Date.parse(dados.cooldownAte)>Date.now()&&<p>Próxima solicitação após {formatarData(dados.cooldownAte,true)} (Brasília). Atualize a consulta quando esse horário chegar.</p>}
  </div>;
}

function FiltroSelect({ id, titulo, valor, opcoes, aoMudar }) {
  return <label htmlFor={id}>{titulo}<select id={id} value={valor} onChange={e => aoMudar(e.target.value)}><option value="">Todos</option>{opcoes.map(opcao => <option key={opcao} value={opcao}>{opcao}</option>)}</select></label>;
}

export default function PesquisaLicitacoes({ dados, carregando = false, erro = '', aoAtualizar, execucao, podeRodar = false, aoRodar, aoConsultarExecucao }) {
  const id = useId();
  const emEspera=Date.parse(execucao?.dados?.cooldownAte)>Date.now();
  const ocupada=execucao?.iniciando||emEspera||(['solicitada','em_andamento'].includes(execucao?.dados?.estado)&&execucao?.dados?.podeRepetir!==true);
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS);
  const [pagina, setPagina] = useState(1);
  const [feedback, setFeedback] = useState('');
  const [textoParaCopiar, setTextoParaCopiar] = useState('');
  const oportunidades = dados?.oportunidades || LISTA_VAZIA;
  const municipios = dados?.municipios || LISTA_VAZIA;
  const instituicoes = dados?.instituicoes || LISTA_VAZIA;
  const filtradas = useMemo(() => filtrarOportunidades(oportunidades, filtros), [oportunidades, filtros]);
  const paginaResultados = paginar(filtradas, pagina, 6);
  const opcoes = useMemo(() => {
    const ordenar = valores => [...new Set(valores.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return { municipio: ordenar(oportunidades.flatMap(item => item.municipiosAbrangidos || [])), orgao: ordenar(oportunidades.map(item => item.orgao)), produto: ordenar(oportunidades.map(item => item.produto)) };
  }, [oportunidades]);
  const disponivel = dados?.estado === 'disponivel';
  const linkBot = urlBotSegura(dados?.bot);
  const cobertura = resumoCobertura(dados?.cobertura);
  const coberturaInstituicoes = dados?.coberturaInstituicoes || {};
  const antigo = disponivel && (dados.antigo || relatorioAntigo(dados.geradoEm));
  const nenhumaConsulta = disponivel && cobertura.concluidos === 0 && cobertura.parciais === 0 && !coberturaInstituicoes.concluidos && !coberturaInstituicoes.parciais;
  const mudarFiltro = (chave, valor) => { setFiltros(atual => ({ ...atual, [chave]: valor })); setPagina(1); };
  function exportarResultados() {
    baixarCSV('oportunidades-botimpresilk', ['Processo', 'Órgão', 'Produto', 'Item', 'Lote', 'Municípios', 'Classificação registrada', 'Prazo', 'Link oficial', 'Exigências', 'Próxima ação'], filtradas.map(item => [item.processo, item.orgao, item.produto, item.item, item.lote, (item.municipiosAbrangidos || []).join(' | '), item.classificacao, item.prazo, urlOficialSegura(item.oficialUrl) || '', (item.exigencias || []).join(' | '), item.proximaAcao]));
  }
  async function copiarTexto(texto, descricao) {
    try {
      await navigator.clipboard.writeText(texto);
      setTextoParaCopiar('');
      setFeedback(`${descricao} copiado.`);
    } catch { setTextoParaCopiar(texto); setFeedback('A cópia automática não está disponível. Selecione o texto abaixo e copie manualmente.'); }
  }
  function copiarResumo() {
    return copiarTexto(`Pesquisa do BotImpresilk\nRelatório: ${formatarData(dados.geradoEm, true)}\nPeríodo: ${formatarData(dados.periodo?.inicio)} a ${formatarData(dados.periodo?.fim)}\nCobertura municipal: ${cobertura.concluidos} de 89 (${cobertura.coberturaPercentual.toLocaleString('pt-BR')}%).\nParciais: ${cobertura.parciais}. Não consultados: ${cobertura.naoConsultados}.\nÓrgãos e instituições: ${coberturaInstituicoes.concluidos || 0} concluídos de ${coberturaInstituicoes.totalRegistros || 0} registros.\nOportunidades no acervo: ${oportunidades.length}.\nAtualizar a leitura não inicia pesquisa. Confira prazos e retificações no portal oficial.`, 'Resumo');
  }
  return <section className="lp-pesquisa" aria-labelledby={`${id}-titulo`} aria-busy={carregando}>
    <header className="lp-cabecalho"><div className="lp-titulo"><span className="lp-bot-icon"><Bot size={23} aria-hidden="true" /></span><div><h2 id={`${id}-titulo`}>Pesquisa do BotImpresilk</h2><p>Oportunidades pesquisadas e cobertura documentada do Norte de Minas.</p></div></div><div className="lp-cabecalho-acoes">{podeRodar&&<button type="button" className="lp-button lp-primary" onClick={aoRodar} disabled={ocupada||!aoRodar}><Search size={16} aria-hidden="true" />{execucao?.iniciando?'Solicitando…':'Rodar pesquisa'}</button>}{linkBot && <a className="lp-button" href={linkBot} target="_blank" rel="noopener noreferrer">Conversar com o bot<ArrowUpRight size={15} aria-hidden="true" /></a>}<button type="button" className="lp-button" onClick={aoAtualizar} disabled={carregando || !aoAtualizar}><RefreshCw size={16} aria-hidden="true" className={carregando ? 'lp-girando' : ''} />{carregando ? 'Atualizando leitura' : 'Atualizar leitura'}</button></div></header>
    <p className="lp-contexto">Painel e BotImpresilk consultam o mesmo acervo público. Atualizar leitura carrega o último relatório publicado; não inicia uma nova busca. As licitações acompanhadas pela equipe ficam na seção abaixo.</p>
    <EstadoExecucao execucao={execucao} aoConsultar={aoConsultarExecucao} />
    {erro && <div className="lp-aviso lp-bad" role="alert"><AlertTriangle size={17} aria-hidden="true" /><span>{String(erro)}{disponivel ? ' Exibindo o acervo anterior; a atualização não foi confirmada.' : ''}</span></div>}
    {carregando && <p className="lp-estado" role="status">Carregando o relatório publicado{disponivel ? ', mantendo o acervo anterior visível.' : '.'}</p>}
    {!disponivel ? !carregando && !erro && <div className="lp-vazio"><FileSearch size={28} aria-hidden="true" /><h3>Nenhum relatório publicado</h3><p>A cobertura e as oportunidades aparecerão após a publicação de uma pesquisa validada. Isso não informa se existem licitações na região.</p></div> : <>
      <div className="lp-linha-dados"><span><strong>Relatório:</strong> {formatarData(dados.geradoEm, true)} (Brasília)</span><span><strong>Período:</strong> {formatarData(dados.periodo?.inicio)} a {formatarData(dados.periodo?.fim)}</span>{dados.consultadoEm && <span><strong>Leitura:</strong> {formatarData(dados.consultadoEm, true)}</span>}<span className="lp-chip lp-neutral">Somente consulta</span></div>
      {antigo && <div className="lp-aviso lp-warn" role="status"><AlertTriangle size={17} aria-hidden="true" /><span><strong>Relatório antigo.</strong> Tem oito dias ou mais. Reconfirme prazos, situação e retificações nas fontes oficiais antes de decidir.</span></div>}
      {cobertura.inconsistente && <div className="lp-aviso lp-warn" role="status">Os totais recebidos exigem conferência. O percentual municipal considera sempre 89 municípios.</div>}
      <div className="lp-kpis"><div><span>Municípios concluídos</span><strong>{cobertura.concluidos} <small>de 89</small></strong></div><div><span>Pesquisa parcial</span><strong>{cobertura.parciais}</strong></div><div><span>Não consultados</span><strong>{cobertura.naoConsultados}</strong></div><div><span>Cobertura comprovada</span><strong>{cobertura.coberturaPercentual.toLocaleString('pt-BR')}%</strong></div></div>
      <div className="lp-cobertura-barra"><progress value={cobertura.concluidos} max={89} aria-label="Municípios com pesquisa concluída" /><span>100% exige pesquisa concluída e registrada para os 89 municípios.</span></div>
      {nenhumaConsulta && <div className="lp-aviso lp-neutral"><strong>Pesquisa ainda não executada.</strong> A lista de municípios e instituições define o escopo; não representa consulta aos portais.</div>}
      <details className="lp-perguntas"><summary>Perguntas prontas para usar com o bot</summary><p>Copie uma pergunta e cole no Telegram. O envio acontece quando você confirmar na conversa do bot.</p><p>Preparar um prompt não envia proposta, documentos ou mensagens. Revise o texto na conversa do bot antes de qualquer decisão.</p><button type="button" className="lp-button" onClick={() => copiarTexto(promptParticipacao(), 'Prompt geral')}><Copy size={14} aria-hidden="true" />Copiar prompt geral</button><div>{PERGUNTAS_BOT.map(pergunta => <div key={pergunta}><p>{pergunta}</p><button type="button" className="lp-button" onClick={() => copiarTexto(pergunta, 'Texto da pergunta')}><Copy size={14} aria-hidden="true" />Copiar pergunta</button></div>)}</div></details>
      <p className="lp-feedback" role="status">{feedback}</p>
      {textoParaCopiar && <label className="lp-copia-manual" htmlFor={`${id}-copiar`}>Texto para copiar manualmente<textarea id={`${id}-copiar`} readOnly rows={5} value={textoParaCopiar} onFocus={e => e.target.select()} /></label>}
      <div className="lp-resultados-titulo"><div><h3>Oportunidades no acervo <span className="lp-count">{oportunidades.length}</span></h3><p>GO, NO-GO e REVISÃO HUMANA refletem a análise registrada. Prazos são conferidos também na leitura atual.</p></div><div className="lp-acoes"><button type="button" className="lp-button" onClick={copiarResumo}><Copy size={15} aria-hidden="true" />Copiar resumo</button><button type="button" className="lp-button" onClick={exportarResultados} disabled={!filtradas.length}><Download size={15} aria-hidden="true" />Exportar resultados</button></div></div>
      <div className="lp-filtros"><label htmlFor={`${id}-busca`} className="lp-busca">Buscar oportunidade<span><Search size={16} aria-hidden="true" /><input id={`${id}-busca`} value={filtros.busca} onChange={e => mudarFiltro('busca', e.target.value)} type="search" placeholder="Processo, item, produto ou destino" /></span></label><FiltroSelect id={`${id}-classificacao`} titulo="Classificação" valor={filtros.classificacao} opcoes={CLASSIFICACOES} aoMudar={valor => mudarFiltro('classificacao', valor)} /><FiltroSelect id={`${id}-municipio`} titulo="Município de execução" valor={filtros.municipio} opcoes={opcoes.municipio} aoMudar={valor => mudarFiltro('municipio', valor)} /><FiltroSelect id={`${id}-orgao`} titulo="Órgão" valor={filtros.orgao} opcoes={opcoes.orgao} aoMudar={valor => mudarFiltro('orgao', valor)} /><FiltroSelect id={`${id}-produto`} titulo="Produto" valor={filtros.produto} opcoes={opcoes.produto} aoMudar={valor => mudarFiltro('produto', valor)} /></div>
      {Object.values(filtros).some(Boolean) && <button type="button" className="lp-limpar" onClick={() => { setFiltros(FILTROS_VAZIOS); setPagina(1); }}>Limpar filtros</button>}
      {!oportunidades.length ? <p className="lp-empty">Nenhum candidato validado para apresentação neste relatório. Isso não comprova inexistência de oportunidades, especialmente quando há cobertura parcial ou não consultada.</p> : !filtradas.length ? <p className="lp-empty" role="status">Nenhuma oportunidade corresponde aos filtros escolhidos.</p> : <><div className="lp-oportunidades">{paginaResultados.itens.map(item => <Oportunidade key={item.id} item={item} aoCopiarPrompt={item => copiarTexto(promptParticipacao(item), 'Prompt do edital')} />)}</div><div className="lp-paginacao"><span aria-live="polite">{filtradas.length} resultados · página {paginaResultados.pagina} de {paginaResultados.totalPaginas}</span><div><button type="button" className="lp-button" disabled={paginaResultados.pagina <= 1} onClick={() => setPagina(paginaResultados.pagina - 1)}><ChevronLeft size={16} aria-hidden="true" />Anterior</button><button type="button" className="lp-button" disabled={paginaResultados.pagina >= paginaResultados.totalPaginas} onClick={() => setPagina(paginaResultados.pagina + 1)}>Próxima<ChevronRight size={16} aria-hidden="true" /></button></div></div></>}
      <div className="lp-matrizes"><MatrizCobertura key={`municipios-${dados.id}`} titulo="Cobertura municipal" linhas={municipios} campoNome="municipio" nomeArquivo="cobertura-municipal-botimpresilk" resumo={`${cobertura.concluidos} de 89 concluídos`} /><MatrizCobertura key={`instituicoes-${dados.id}`} titulo="Órgãos e instituições" linhas={instituicoes} campoNome="instituicao" tamanho={15} nomeArquivo="cobertura-instituicoes-botimpresilk" resumo={`${coberturaInstituicoes.concluidos || 0} concluídos · ${coberturaInstituicoes.parciais || 0} parciais · ${coberturaInstituicoes.naoConsultados || 0} não consultados`} /></div>
      {(dados.avisos?.length > 0 || dados.pendencias?.length > 0 || dados.candidatosRetidos?.length > 0 || dados.limites?.length > 0) && <details className="lp-notas"><summary>Pendências, ressalvas e limites do relatório</summary><div>{dados.avisos?.length > 0 && <><h4>Ressalvas</h4><ul>{dados.avisos.map((aviso, i) => <li key={i}>{aviso}</li>)}</ul></>}{dados.pendencias?.length > 0 && <><h4>Próximas verificações</h4><ul>{dados.pendencias.map((pendencia, i) => <li key={i}>{pendencia}</li>)}</ul></>}{dados.candidatosRetidos?.length > 0 && <><h4>Candidatos retidos para conferência</h4><ul>{dados.candidatosRetidos.map(item => <li key={item.id}>{item.id}: {(item.motivos || []).join(' ')}</li>)}</ul></>}{dados.limites?.length > 0 && <><h4>Limites da pesquisa</h4><ul>{dados.limites.map((limite, i) => <li key={i}>{limite}</li>)}</ul></>}</div></details>}
    </>}
  </section>;
}
