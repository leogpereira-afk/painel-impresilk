import JanelaFormulario from "../components/JanelaFormulario.jsx";
import PesquisaLicitacoes from "../components/PesquisaLicitacoes.jsx";
import DocumentosLicitacoes from "../components/DocumentosLicitacoes.jsx";
import CadastrosLicitacoes from "../components/CadastrosLicitacoes.jsx";
import RegioesLicitacoes from "../components/RegioesLicitacoes.jsx";
import EmpresasLicitacoes from "../components/EmpresasLicitacoes.jsx";
import '../components/licitacoes-acervo.css';
import AgendarLicitacao from "../components/AgendarLicitacao.jsx";
import {prepararParticipacaoLicitacao} from "../services/licitacoes-participacao.js";
import {formatarDataRegiao} from "../lib/licitacoes-regioes.mjs";
import {obterPesquisaLicitacoes, obterHistoricoLicitacoes, obterExecucaoLicitacoes, iniciarPesquisaLicitacoes, criarControleExecucaoLicitacoes} from "../services/licitacoes.js";
import {getSessao, getToken, aoMudarSessao,podeAbrir} from "../lib/sessao.js";
import {Link,useSearchParams} from "react-router-dom";
import {criarLeituraLicitacoes, criarExportacaoLicitacoes} from "../lib/licitacoes-leitura.mjs";
// Licitacoes: os editais em que a Impresilk vai (ou pode) entrar, com O DIA da
// sessao na cara -- o valor da tela e ninguem perder prazo. Ordena pelo que
// vence primeiro, avisa "HOJE"/"amanha" e guarda o edital em PDF.
//
// Mesma infra dos Documentos (painel-ativos, tipo "licitacao"): item + arquivo.

import { FormPreparacao, pendenciasEdital } from "../components/PreparacaoLicitacao.jsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  CalendarClock,
  Plus,
  Trash2,
  Download,
  Upload,
  ArrowUpRight,
  AlertTriangle,
  Pencil,
  FolderOpen,
} from "lucide-react";
import {
  listarAtivos,
  salvarAtivo,
  removerAtivo,
  lerArquivo,
  arquivoParaBase64,
  abrirBase64,
} from "../services/ativos.js";
import { moedaCheia, dataCurta, diasEntre, ymdLocal, paraNumero, paraCampo } from "../lib/format.js";
import { Card, CarregandoModulo, ErroModulo } from "../components/ui.jsx";

import {visaoLicitacoes, filtrarAcompanhamento, pendenteAcompanhamento, erroPreparacao, revisarRascunhoLicitacao} from "../lib/licitacoes-workspace.mjs";
import "../components/licitacoes-workspace.css";
import "../components/licitacoes-cadastros-compacto.css";

const MAX_BYTES = 3 * 1024 * 1024;
const normalizarIdentidade=v=>String(v||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
function mesmaOportunidade(origem,item,relatorio){
  if(!origem||!item)return false;
  if(origem.relatorioId===relatorio?.id&&origem.itemId===item.id)return true;
  return !!(item.orgao?.trim()&&item.processo?.trim()&&(item.item?.trim()||item.lote?.trim()))&&['orgao','processo','item','lote'].every(k=>normalizarIdentidade(origem[k])===normalizarIdentidade(item[k]));
}


const MODALIDADES = [
  "Pregao Eletronico",
  "Pregao Presencial",
  "Concorrencia",
  "Dispensa",
  "Inexigibilidade",
  "Credenciamento",
  "Tomada de Precos",
  "RDC",
  "Leilao",
];

// Situacoes: as tres primeiras estao VIVAS (aparecem em "Na mesa"); as demais
// contam historia. A cor segue o dinheiro: ganhou verde, perdeu vermelho.
const STATUS = {
  avaliar: { rotulo: "Avaliando", chip: "chip", vivo: true },
  participar: { rotulo: "Vou participar", chip: "chip-warn", vivo: true },
  enviada: { rotulo: "Proposta enviada", chip: "chip", vivo: true },
  ganha: { rotulo: "Ganha", chip: "chip-ok", vivo: false },
  perdida: { rotulo: "Perdida", chip: "chip-bad", vivo: false },
  fora: { rotulo: "Não participei", chip: "chip", vivo: false },
};

const VAZIA = {
  id: "",
  versao: null,
  nome: "",
  identificacao: "",
  categoria: "",
  edital: "",
  validade: "",
  hora: "",
  url: "",
  valor: "",
  status: "avaliar",
  observacao: "",
  responsavel: "",
  acompanhamento: {checklist: []},
};

// Quanto falta para a sessao, em palavras -- e a informacao mais importante da tela.
function prazo(dias) {
  if (dias === null) return { texto: "sem data", chip: "chip", peso: 9000 };
  if (dias < 0) return { texto: `passou há ${-dias} ${-dias === 1 ? "dia" : "dias"}`, chip: "chip-bad", peso: 8000 - dias };
  if (dias === 0) return { texto: "HOJE", chip: "chip-bad", peso: 0 };
  if (dias === 1) return { texto: "amanhã", chip: "chip-bad", peso: 1 };
  if (dias <= 7) return { texto: `em ${dias} dias`, chip: "chip-warn", peso: dias };
  return { texto: `em ${dias} dias`, chip: "chip", peso: dias };
}

/* FORA do componente da página, de propósito: definida dentro, o React via um
   TIPO novo a cada render e destruía/recriava o DOM de toda linha — a família
   do "campo que perde o foco" que a casa já pagou duas vezes. A regra
   react/no-unstable-nested-components (ligada em 23/08) pega; esta era a única
   ocorrência viva. Os handlers entram por props. */
function Linha({ it, baixarEdital, editar, remover, abrirDocumentos, resultados }) {
  return (
    <div
      className="lw-row"
      style={{ borderColor: "var(--hairline)" }}
    >
      <span className="lw-row-main">
        <strong>{it.nome}</strong>
        <span className="lw-row-context">{it.responsavel || "Sem responsável"} · {it.acompanhamento?.checklist?.length ? `${pendenciasEdital(it)} ${pendenciasEdital(it)===1?"pendência":"pendências"}` : "Checklist opcional"}</span>
        {it.acompanhamento?.proximaAcao && <span className="lw-next">{it.acompanhamento.proximaAcao}{it.acompanhamento.prazoAcao ? ` · até ${dataCurta(it.acompanhamento.prazoAcao)}` : " · sem prazo"}</span>}
        <span className="lw-row-context">
          {[it.identificacao, it.categoria, it.edital && `edital ${it.edital}`].filter(Boolean).join(" · ") || "—"}
        </span>
      </span>

      <span className="lw-row-deadline">
        <span className={`${it.pz.chip} whitespace-nowrap`}>{it.pz.texto}</span>
        <span className="mt-0.5 block text-xs tabular-nums text-slate-500">
          {it.origemPesquisa?.pendente?'Conferência: ':it.preparacaoBot?.prazoImportado?'Prazo da pesquisa: ':''}{it.dataAcompanhamento ? `${dataCurta(it.dataAcompanhamento)}${it.hora ? ` às ${it.hora}` : ""}` : "marque a data"}
        </span>
      </span>

      <span className={`lw-row-status ${it.st.chip}`}>{it.st.rotulo}</span>

      {(
        <span className="lw-row-value">
          {resultados&&<><small>Contratado confirmado</small><strong>{Number(it.acompanhamento?.valorContratado)>0?moedaCheia(it.acompanhamento.valorContratado):'Não informado'}</strong></>}
          <small>Estimado</small>{it.valor>0?moedaCheia(it.valor):'Não informado'}
        </span>
      )}

      <span className="lw-row-actions">
        {it.url && (
          <a
            href={it.url}
            target="_blank"
            rel="noopener noreferrer"
            className="grid h-11 w-11 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-brand"
            title="Abrir o portal da licitação"
          >
            <ArrowUpRight size={15} />
          </a>
        )}
        {it.temArquivo && (
          <button
            type="button"
            onClick={() => baixarEdital(it)}
            className="grid h-11 w-11 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-brand"
            title="Baixar o edital"
          >
            <Download size={15} />
          </button>
        )}
        {abrirDocumentos&&<button type="button" className="inline-flex h-11 items-center gap-1 rounded-lg px-2 text-slate-600 hover:bg-slate-100" onClick={()=>abrirDocumentos(it)} aria-label={`Documentos e kit de ${it.nome}`} title="Documentos e kit do edital"><FolderOpen size={15}/><span>Kit</span></button>}
        <button
          type="button"
          onClick={() => editar(it)}
          className="inline-flex h-11 items-center rounded-lg px-3 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          aria-label={`Editar ${it.nome}`} title={`Editar ${it.nome}`}
        >
          <Pencil size={15} /><span>Editar</span>
        </button>
        <button
          type="button"
          onClick={() => remover(it)}
          className="grid h-11 w-11 place-items-center rounded-lg text-slate-400 hover:bg-bad-50 hover:text-bad-700"
          title={`Remover ${it.nome}`}
        >
          <Trash2 size={15} />
        </button>
      </span>
    </div>
  );
}

function formularioLicitacao(it) {
  return {
      id: it.id,
      versao:it.atualizadoEm||'',
      arquivosEdital:it.arquivosEdital||[],
      agendaPendente:it.origemPesquisa?.pendente===true,
      preparacaoBot:it.preparacaoBot,
      nome: it.nome || "",
      identificacao: it.identificacao || "",
      categoria: it.categoria || "",
      edital: it.edital || "",
      validade: it.validade || "",
      hora: it.hora || "",
      url: it.url || "",
      // pt-BR, e nao String(numero): devolver "1500.5" fazia o parser tratar o
      // ponto como milhar e o valor virava 15005 a cada edicao.
      valor: paraCampo(it.valor),
      status: it.status || "avaliar",
      observacao: it.observacao || "",
      responsavel: it.responsavel || "",
      acompanhamento: {...(it.acompanhamento || VAZIA.acompanhamento), valorContratado: paraCampo(it.acompanhamento?.valorContratado || 0)},
  };
}
function CompararLicitacao({atual,revisao,aoEscolher}) {
  const texto=valor=>Array.isArray(valor)?valor.map(c=>`${c.feito?'✓':'☐'} ${c.texto}`).join('\n'):String(valor||'—');
  return <div className="space-y-3"><p className="text-sm">Última gravação: {atual.atualizadoEm||'versão legada'} · {atual.atualizadoPor||'responsável não informado'}. Anexo atual: {atual.arquivoNome||'sem arquivo'}.</p>{revisao.diferencas.length?revisao.diferencas.map(d=><div key={d.campo} className="rounded border bg-white p-3"><strong>{d.rotulo}</strong><div className="grid gap-3 sm:grid-cols-2"><p className="text-sm whitespace-pre-wrap break-words"><b>Salvo agora:</b>{'\n'}{texto(d.remoto)}</p><p className="text-sm whitespace-pre-wrap break-words"><b>Seu rascunho:</b>{'\n'}{texto(d.local)}</p></div>{d.conflito?<label className="label mt-2">Alterado nas duas versões<select className="input" aria-label={`Versão para ${d.rotulo}`} value={d.escolha||''} onChange={e=>aoEscolher(d.campo,e.target.value)}><option value="" disabled>Escolha o conteúdo a manter</option><option value="atual">Manter o que está salvo agora</option><option value="rascunho">Usar meu rascunho neste campo</option></select></label>:<p className="text-sm text-slate-600">{d.escolha==='atual'?'Você não editou este campo; a atualização do servidor será mantida.':'Sua edição neste campo será mantida.'}</p>}</div>):<p>Os campos do rascunho coincidem com a versão salva.</p>}</div>;
}

export default function Licitacoes() {
  const [geracao,setGeracao]=useState(0);
  useEffect(()=>aoMudarSessao(()=>setGeracao(g=>g+1)),[]);
  return <EspacoLicitacoes key={geracao}/>;
}
function EspacoLicitacoes() {
  const [parametros,setParametros]=useSearchParams();
  const visao=visaoLicitacoes(parametros);
  const [busca,setBusca]=useState('');
  const [filtro,setFiltro]=useState('todos');
  const listaRef=useRef(null);
  const mudarVisao=(valor)=>setParametros(atuais=>{const copia=new URLSearchParams(atuais);copia.set('visao',valor);copia.delete('aba');return copia;});
  const filtrarLista=valor=>{setBusca('');setFiltro(valor);mudarVisao('acompanhamento');requestAnimationFrame(()=>listaRef.current?.focus());};
  const relatorioSelecionado=parametros.get('relatorio')||'';
  const [sessao,setSessao]=useState(getSessao);
  const [agendamento,setAgendamento]=useState(null);
  const [pesquisa,setPesquisa]=useState({dados:null,carregando:true,erro:null});
  const [historico,setHistorico]=useState({dados:null,carregando:true,erro:null});
  const [paginaHistorico,setPaginaHistorico]=useState(1);
  const [pdf,setPDF]=useState({carregando:false,erro:null});
  const [execucao,setExecucao]=useState({dados:null,carregando:false,iniciando:false,erro:null});
  const leituraPesquisa=useMemo(()=>criarLeituraLicitacoes({consultar:(signal,id)=>sessao?obterPesquisaLicitacoes(signal,id):Promise.reject(new Error("Entre no sistema para consultar a pesquisa.")),receber:setPesquisa}),[sessao]);
  const leituraHistorico=useMemo(()=>criarLeituraLicitacoes({consultar:(signal,pagina)=>sessao?obterHistoricoLicitacoes(signal,pagina):Promise.reject(new Error("Entre no sistema para consultar o histórico.")),receber:setHistorico}),[sessao]);
  const controlePDF=useMemo(()=>criarExportacaoLicitacoes({gerar:async(dados,opcoes)=>{
    const {baixarResumoLicitacoesPDF}=await import('../lib/licitacoes-pdf.mjs');
    if(!opcoes.signal.aborted)await baixarResumoLicitacoesPDF(dados,opcoes);
  },receber:setPDF}),[]);
  const controleExecucao=useMemo(()=>criarControleExecucaoLicitacoes({consultar:signal=>sessao?obterExecucaoLicitacoes(signal):Promise.reject(new Error("Entre no sistema para consultar a execução.")),iniciar:signal=>sessao?iniciarPesquisaLicitacoes(signal):Promise.reject(new Error("Entre no sistema para iniciar uma pesquisa.")),receber:setExecucao}),[sessao]);
  useEffect(()=>{
    void leituraPesquisa.atualizar(relatorioSelecionado);
    controlePDF.cancelar();setPDF({carregando:false,erro:null});
    return ()=>{leituraPesquisa.cancelar();controlePDF.cancelar();};
  },[leituraPesquisa,controlePDF,relatorioSelecionado]);
  useEffect(()=>{
    void leituraHistorico.atualizar(paginaHistorico);
    return ()=>leituraHistorico.cancelar();
  },[leituraHistorico,paginaHistorico]);
  useEffect(()=>{void controleExecucao.atualizar();return ()=>controleExecucao.cancelar();},[controleExecucao]);
  useEffect(()=>aoMudarSessao(()=>{
    // Cancelamento síncrono: nenhum retorno antigo sobrevive à troca de crachá.
    leituraPesquisa.cancelar();leituraHistorico.cancelar();controleExecucao.cancelar();controlePDF.cancelar();
    setPesquisa({dados:null,carregando:true,erro:null});
    setHistorico({dados:null,carregando:true,erro:null});setPaginaHistorico(1);
    setPDF({carregando:false,erro:null});
    setExecucao({dados:null,carregando:false,iniciando:false,erro:null});
    setAgendamento(null);
    setSessao(getSessao());
  }),[leituraPesquisa,leituraHistorico,controleExecucao,controlePDF]);
  const selecionarRelatorio=id=>{
    leituraPesquisa.cancelar();controlePDF.cancelar();
    setPDF({carregando:false,erro:null});
    const proximos=new URLSearchParams(parametros);
    proximos.delete('item');setAgendamento(null);
    if(id)proximos.set('relatorio',id);else proximos.delete('relatorio');
    proximos.set('visao','pesquisa');
    setParametros(proximos);
  };
  const podeRodar=(sessao?.master===true||(sessao?.permissoes||[]).includes('*'))&&execucao.dados?.podeIniciar!==false;
  // Uma mudança de URL nunca exibe o relatório anterior enquanto o efeito inicia.
  const pesquisaAtual=pesquisa.chave===relatorioSelecionado?pesquisa:{dados:null,carregando:true,erro:null};
  const historicoAtual=historico.chave===paginaHistorico?historico:{dados:null,carregando:true,erro:null};
  const propsPesquisa={...pesquisaAtual,historico:historicoAtual,paginaHistorico,relatorioSelecionado,itemSelecionado:parametros.get('item')||'',pdf,aoBaixarPDF:controlePDF.baixar,
    aoAgendar:podeAbrir('licitacoes',sessao)&&podeAbrir('calendario-empresa',sessao)?(item,{pendente,relatorio})=>setAgendamento({item:structuredClone(item),relatorio:{id:relatorio.id},pendente}):undefined,
    aoSelecionarRelatorio:selecionarRelatorio,aoPaginarHistorico:setPaginaHistorico,aoAtualizarHistorico:()=>leituraHistorico.atualizar(paginaHistorico),
    execucao,podeRodar,aoRodar:()=>{if(podeRodar)void controleExecucao.rodar();},aoConsultarExecucao:controleExecucao.atualizar,
    aoAtualizar:()=>{controlePDF.cancelar();setPDF({carregando:false,erro:null});void leituraPesquisa.atualizar(relatorioSelecionado);void leituraHistorico.atualizar(paginaHistorico);void controleExecucao.atualizar();}};
  const [itens, setItens] = useState(null);
  const [participacoes,setParticipacoes]=useState({});
  const enviosParticipacao=useRef(new Map());
  useEffect(()=>{const envios=enviosParticipacao.current;return()=>{for(const controle of envios.values())controle.abort();envios.clear();};},[]);

  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [form, setForm] = useState(VAZIA);
  const [salvando, setSalvando] = useState(false);
  const inputArquivo = useRef(null);
  const [formAberto,setFormAberto]=useState(false);
  const cadastroId=useRef(crypto.randomUUID());
  const instanciaEdicao=useRef(0),envioEmCurso=useRef(false),baseEdicao=useRef(VAZIA);
  const cicloTela=useRef(0),downloadsEdital=useRef(new Set());
  const [conflito,setConflito]=useState(null),[relendo,setRelendo]=useState(false);
  useEffect(()=>{
    const downloads=downloadsEdital.current;
    const invalidar=()=>{instanciaEdicao.current+=1;cicloTela.current+=1;for(const controle of downloads)controle.abort();downloads.clear();};
    const parar=aoMudarSessao(invalidar);
    return()=>{parar();invalidar();};
  },[]);
  const abrirDocumentos=it=>setParametros(p=>{const n=new URLSearchParams(p);n.set('visao','documentos');n.set('edital',it.id);return n;});
  // O dia em ESTADO, nao no render: numa tela de prazo de edital, a aba
  // esquecida aberta de um dia para o outro continuava dizendo "amanha" para a
  // sessao que era HOJE. Refeito toda vez que a aba volta ao primeiro plano.
  const [hojeISO, setHojeISO] = useState(() => ymdLocal(new Date()));

  useEffect(() => {
    let vivo = true;
    listarAtivos()
      .then((l) => vivo && setItens(l.filter((x) => x.tipo === "licitacao")))
      .catch((e) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === "visible") setHojeISO(ymdLocal(new Date()));
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, []);

  const vm = useMemo(() => {
    const todos = (itens || []).map((it) => {
      const dataAcompanhamento=it.origemPesquisa?.pendente?it.acompanhamento?.prazoAcao:it.validade;
      const dias = dataAcompanhamento ? diasEntre(hojeISO, dataAcompanhamento) : null;
      const st = STATUS[it.status] || STATUS.avaliar;
      return { ...it, dataAcompanhamento, dias, st, pz: prazo(dias) };
    });
    const naMesa = todos.filter((x) => x.st.vivo).sort((a, b) => a.pz.peso - b.pz.peso);
    const encerradas = todos
      .filter((x) => !x.st.vivo)
      .sort((a, b) => String(b.validade).localeCompare(String(a.validade)));
    const proxima = naMesa.find((x) => !x.origemPesquisa?.pendente && x.dias !== null && x.dias >= 0) || null;
    return {
      naMesa,
      encerradas,
      proxima,
      ganhas: encerradas.filter((x) => x.status === "ganha").length,
      atrasadas: naMesa.filter((x) => x.dias !== null && x.dias < 0).length,
    };
  }, [itens, hojeISO]);

  const editar = (it) => {
    if(envioEmCurso.current)return;
    instanciaEdicao.current+=1;setConflito(null);setAviso(null);
    const ficha=formularioLicitacao(it);baseEdicao.current=structuredClone(ficha);setForm(ficha);
    // Arquivo escolhido e nao enviado ficava no input e grudava no PROXIMO item
    // editado -- trocando o edital de quem nao pediu.
    if (inputArquivo.current) inputArquivo.current.value = "";
    setFormAberto(true);
  };

  const podePreparar=podeAbrir('licitacoes',sessao)&&podeAbrir('calendario-empresa',sessao);
  const estadoParticipacao=(item,relatorio)=>({
    ...participacoes[`${relatorio?.id}:${item.id}`],
    item:(itens||[]).find(it=>mesmaOportunidade(it.origemPesquisa,item,relatorio)),
  });
  const abrirParticipacao=item=>{
    setBusca(item.edital||item.nome||'');setFiltro('todos');
    mudarVisao(['ganha','perdida','fora'].includes(item.status)?'resultados':'acompanhamento');
    editar(item);
  };
  const participar=async(item,relatorio)=>{
    if(!podePreparar||!relatorio?.id)return;
    const chave=`${relatorio.id}:${item.id}`;
    if(enviosParticipacao.current.has(chave))return;
    const controller=new AbortController();enviosParticipacao.current.set(chave,controller);
    setParticipacoes(p=>({...p,[chave]:{ocupado:true,erro:''}}));
    try{
      const r=await prepararParticipacaoLicitacao({relatorioId:relatorio.id,itemId:item.id},controller.signal);
      if(controller.signal.aborted)return;
      setItens(xs=>[...(xs||[]).filter(it=>it.id!==r.item.id),r.item]);
      setAviso({tom:'sucesso',texto:r.repetido?'Este edital já está em acompanhamento. A ficha existente foi preservada.':'Preparação salva a partir do acervo do BotImpresilk. Confira o prazo importado e complete o checklist.'});
      setParticipacoes(p=>({...p,[chave]:{ocupado:false,erro:''}}));
      window.dispatchEvent(new Event('licitacoes-atualizadas'));
      abrirParticipacao(r.item);
    }catch(e){if(!controller.signal.aborted)setParticipacoes(p=>({...p,[chave]:{ocupado:false,erro:e.message||'Não foi possível preparar. Tente novamente.'}}));}
    finally{if(enviosParticipacao.current.get(chave)===controller)enviosParticipacao.current.delete(chave);}
  };

  const fecharForm = () => {
    if(envioEmCurso.current)return;
    instanciaEdicao.current+=1;setConflito(null);setRelendo(false);
    setFormAberto(false);
    cadastroId.current=crypto.randomUUID();
    setForm(VAZIA);baseEdicao.current=VAZIA;
    if (inputArquivo.current) inputArquivo.current.value = "";
  };

  const relerConflito=async()=>{
    if(envioEmCurso.current||relendo)return;
    const instancia=instanciaEdicao.current,id=form.id||cadastroId.current;
    setRelendo(true);
    try{
      const atuais=(await listarAtivos()).filter(it=>it.tipo==='licitacao');
      if(instancia!==instanciaEdicao.current)return;
      const atual=atuais.find(it=>it.id===id);
      setItens(atuais);setConflito({atual:atual||null,lido:true,escolhas:{}});
      setAviso({tom:'erro',texto:atual?'Versão atual consultada. Revise os dados abaixo antes de aplicar seu rascunho.':'Esta ficha não está na lista atual. Seu rascunho e arquivo continuam aqui; não é possível sobrescrever uma ficha retirada.'});
    }catch(err){if(instancia===instanciaEdicao.current)setAviso({tom:'erro',texto:err.message});}
    finally{if(instancia===instanciaEdicao.current)setRelendo(false);}
  };

  const salvar = useCallback(
    async (e) => {
      e.preventDefault();
      if(envioEmCurso.current||conflito)return;
      setAviso(null);
      if (!form.nome.trim()) return setAviso({ tom: "erro", texto: "Dê um nome ao objeto da licitação." });
      const invalido=erroPreparacao(form.acompanhamento);
      if(invalido)return setAviso({tom:'erro',texto:invalido});
      const file = inputArquivo.current?.files?.[0];
      if (file && file.size > MAX_BYTES) return setAviso({ tom: "erro", texto: "Edital acima de 3 MB - guarde no Drive e cole o link no campo do portal." });
      const instancia=instanciaEdicao.current;
      envioEmCurso.current=true;setSalvando(true);
      try {
        const arquivo=file?{base64:await arquivoParaBase64(file),mime:file.type||'application/pdf',nome:file.name}:null;
        if(instancia!==instanciaEdicao.current)return;
        const item = await salvarAtivo({
          ...(form.id ? { id: form.id } : {cadastroId:cadastroId.current}),
          tipo: "licitacao",nome:form.nome.trim(),identificacao:form.identificacao.trim(),categoria:form.categoria.trim(),
          edital:form.edital.trim(),validade:form.validade,hora:form.hora,
          url:form.url.trim()&&!/^https?:\/\//i.test(form.url.trim())?'https://'+form.url.trim():form.url.trim(),
          valor:paraNumero(form.valor),status:form.status,observacao:form.observacao.trim(),responsavel:form.responsavel.trim(),
          acompanhamento:{...form.acompanhamento,valorContratado:paraNumero(form.acompanhamento?.valorContratado||0)},
        },form.versao,arquivo);
        if(instancia!==instanciaEdicao.current)return;
        setItens(l=>[...(l||[]).filter(x=>x.id!==item.id),item]);
        setForm(VAZIA);setFormAberto(false);setConflito(null);
        cadastroId.current=crypto.randomUUID();
        if(inputArquivo.current)inputArquivo.current.value='';
        setAviso({tom:'ok',texto:`"${item.nome}" salva.`});
      } catch (err) {
        if(instancia!==instanciaEdicao.current)return;
        // Falha de rede pode ocorrer depois do commit. Nunca compensar apagando
        // a ficha ou o anexo; a releitura explícita resolve o resultado incerto.
        if(!err.status||err.status===409||err.status>=500)setConflito({atual:null,lido:false});
        setAviso({tom:'erro',texto:`${err.message} Seu rascunho e o arquivo escolhido foram mantidos. Releia a ficha antes de tentar novamente.`});
      } finally {
        // Uma resposta antiga nunca altera a instância seguinte do formulário.
        if(instancia===instanciaEdicao.current){envioEmCurso.current=false;setSalvando(false);}
      }
    },
    [form, conflito]
  );

  const remover = async (it) => {
    // Apagava edital e historico sem volta -- inclusive de licitacao GANHA,
    // que e registro de negocio. O Glossario ao lado ja confirmava.
    if (!window.confirm(`Apagar a licitação "${it.nome || it.orgao || "sem nome"}"? O edital anexado vai junto.`)) return;
    setAviso(null);
    try {
      await removerAtivo(it.id);
      setItens((l) => (l || []).filter((x) => x.id !== it.id));
      if (form.id === it.id) fecharForm();
    } catch (err) {
      setAviso({ tom: "erro", texto: err.message });
    }
  };

  const baixarEdital = async (it,arquivoId) => {
    const ciclo=cicloTela.current,token=getToken(),controller=new AbortController();
    downloadsEdital.current.add(controller);
    const vigente=()=>!controller.signal.aborted&&ciclo===cicloTela.current&&token===getToken();
    setAviso(null);
    try {
      const r = await lerArquivo(it.id,arquivoId,controller.signal);
      if(!vigente())return;
      if (!r?.base64) throw new Error("Edital nao encontrado no servidor.");
      abrirBase64(r.base64, r.mime, r.nome || it.arquivoNome);
    } catch (err) {
      if(vigente())setAviso({ tom: "erro", texto: err.message });
    } finally {
      downloadsEdital.current.delete(controller);
    }
  };

  const modalAgendamento=agendamento&&<AgendarLicitacao key={agendamento.relatorio.id+':'+agendamento.item.id} {...agendamento} sessao={sessao} aoFechar={()=>setAgendamento(null)} aoSalvo={item=>setItens(xs=>[...(xs||[]).filter(x=>x.id!==item.id),item])}/>;
  const lista=filtrarAcompanhamento(visao==='resultados'?vm.encerradas:vm.naMesa,{busca,filtro:visao==='resultados'?'todos':filtro,hoje:hojeISO});
  const proximos=vm.naMesa.filter(it=>it.dias!==null&&it.dias>=0&&it.dias<=7).length;
  const pendentes=vm.naMesa.filter(it=>pendenteAcompanhamento(it,hojeISO)).length;
  const revisaoConflito=conflito?.atual?revisarRascunhoLicitacao({base:baseEdicao.current,rascunho:form,atual:formularioLicitacao(conflito.atual),escolhas:conflito.escolhas}):null;
  const confirmarRevisao=()=>{
    if(!revisaoConflito||revisaoConflito.pendentes)return;
    const atual=formularioLicitacao(conflito.atual);
    baseEdicao.current=structuredClone(atual);
    setForm({...revisaoConflito.form,id:atual.id,versao:atual.versao,arquivosEdital:atual.arquivosEdital});setConflito(null);setAviso(null);
  };
  return (
    <div className={`licitacoes-workspace${visao==='cadastros'?' lic-cadastros-view':''}`}>
      <header className="lw-header">
        <div><span className="lw-eyebrow">IMPRESILK · GESTÃO COMERCIAL</span><h1>Licitações &amp; Indústrias</h1><p>Decida o próximo passo. Acompanhe prazos, documentos e participações.</p></div>
        <div className="lw-header-actions">
          {podeAbrir('calendario-empresa',sessao)&&<Link className="btn-outline" to="/calendario-empresa"><CalendarClock size={16}/>Calendário</Link>}
          {!['documentos','cadastros','regioes','empresas'].includes(visao)&&<button className="btn-primary" disabled={itens===null||!!erro} onClick={()=>{fecharForm();setFormAberto(true);}}><Plus size={16}/>Nova licitação</button>}
        </div>
      </header>
      <label className="lw-tabs-mobile">Área de Licitações &amp; Indústrias<select value={visao} onChange={e=>mudarVisao(e.target.value)}>{[['acompanhamento','Acompanhamento'],['pesquisa','Pesquisar oportunidades'],['regioes','Regiões'],['empresas','Empresas'],['resultados','Resultados'],['documentos','Documentos'],['cadastros','Cadastros']].map(([valor,nome])=><option key={valor} value={valor}>{nome}</option>)}</select></label>
      <nav className="lw-tabs" aria-label="Áreas de licitações">
        {[['acompanhamento','Acompanhamento'],['pesquisa','Pesquisar oportunidades'],['regioes','Regiões'],['empresas','Empresas'],['resultados','Resultados'],['documentos','Documentos'],['cadastros','Cadastros']].map(([valor,nome])=><button key={valor} type="button" aria-current={visao===valor?'page':undefined} onClick={()=>mudarVisao(valor)}>{nome}</button>)}
      </nav>
      {modalAgendamento}
      {aviso&&['acompanhamento','resultados'].includes(visao)&&<p role={aviso.tom==='erro'?'alert':'status'} className="lw-notice">{aviso.texto}</p>}
      <div hidden={visao!=='pesquisa'}><PesquisaLicitacoes {...propsPesquisa} aoParticipar={podePreparar?participar:undefined} estadoParticipacao={estadoParticipacao} aoAbrirParticipacao={abrirParticipacao}/></div>
      {visao==='documentos'&&<DocumentosLicitacoes sessao={sessao} licitacoes={itens||[]} licitacaoSelecionada={(itens||[]).find(it=>it.id===parametros.get('edital'))||null} aoLimparSelecao={()=>setParametros(p=>{const n=new URLSearchParams(p);n.delete('edital');return n;})}/>}
      {visao==='empresas'&&<EmpresasLicitacoes sessao={sessao} empresaSelecionada={parametros.get('empresa')||''}
        aoEmpresa={id=>setParametros(p=>{const n=new URLSearchParams(p);if(id)n.set('empresa',id);else n.delete('empresa');return n;})}
        aoCidade={cidade=>setParametros(p=>{const n=new URLSearchParams(p);n.set('visao','regioes');n.set('municipio',cidade);return n;})}/>}
      {visao==='cadastros'&&<CadastrosLicitacoes sessao={sessao} cadastroSelecionado={parametros.get('cadastro')||''} aoLimparSelecao={()=>setParametros(p=>{const n=new URLSearchParams(p);n.delete('cadastro');return n;})} aoVoltarRegiao={parametros.get('municipio')?()=>mudarVisao('regioes'):undefined}/>}
      {visao==='regioes'&&<RegioesLicitacoes sessao={sessao} pesquisa={pesquisaAtual.dados} carregandoPesquisa={pesquisaAtual.carregando} erroPesquisa={pesquisaAtual.erro} municipio={parametros.get('municipio')||''} aoParticipar={podePreparar?participar:undefined} estadoParticipacao={estadoParticipacao} aoAbrirParticipacao={abrirParticipacao}
        aoMunicipio={cidade=>setParametros(p=>{const n=new URLSearchParams(p);if(cidade)n.set('municipio',cidade);else n.delete('municipio');return n;})}
        aoOportunidade={id=>setParametros(p=>{const n=new URLSearchParams(p);n.set('visao','pesquisa');n.set('item',id);if(pesquisaAtual.dados?.id)n.set('relatorio',pesquisaAtual.dados.id);return n;})}
        aoVerCadastro={id=>setParametros(p=>{const n=new URLSearchParams(p);n.set('visao','cadastros');if(id)n.set('cadastro',id);else n.delete('cadastro');return n;})}/>}
      {['acompanhamento','resultados'].includes(visao)&&<>
        {erro?<ErroModulo mensagem={erro} aoTentar={()=>window.location.reload()}/>:itens===null?<CarregandoModulo/>:<>
          <div className="lw-metrics" aria-label="Resumo do acompanhamento cadastrado">
            <button className="lw-metric" onClick={()=>filtrarLista('todos')}><small>Em acompanhamento</small><strong>{vm.naMesa.length}</strong><span>Avaliação, participação e propostas</span></button>
            <button className="lw-metric" onClick={()=>filtrarLista('semana')}><small>Próximos 7 dias</small><strong>{proximos}</strong><span>Sessões e conferências agendadas</span></button>
            <button className="lw-metric" data-tone="warning" onClick={()=>filtrarLista('pendentes')}><small>Precisam de atenção</small><strong>{pendentes}</strong><span>Prazo passado ou preparação incompleta</span></button>
            <button className="lw-metric" data-tone="success" onClick={()=>mudarVisao('resultados')}><small>Participações ganhas</small><strong>{vm.ganhas}</strong><span>Consultar resultados e contratos</span></button>
          </div>
          {visao==='resultados'&&<div className="lw-notice"><strong>{moedaCheia(vm.encerradas.filter(i=>i.status==='ganha').reduce((v,i)=>v+(Number(i.acompanhamento?.valorContratado)||0),0))} em contratos informados</strong><p>{vm.ganhas} ganhas · {vm.encerradas.filter(i=>i.status==='perdida').length} perdidas · {vm.encerradas.filter(i=>i.status==='fora').length} sem participação. Soma dos valores contratados preenchidos; separada do valor estimado dos editais.</p></div>}
          <Card>
            <div className="lw-section-heading"><div><h2>{visao==='resultados'?'Participações encerradas':'Agenda de trabalho'}</h2><p>{visao==='resultados'?'Resultados, documentos e histórico de cada participação.':'Editais da equipe em ordem de prazo, com responsável e próxima ação.'}</p></div><span>{lista.length} registro{lista.length===1?'':'s'}</span></div>
            <div className="lw-toolbar">
              <label>Buscar no acompanhamento<input type="search" placeholder="Objeto, órgão, edital ou responsável" value={busca} onChange={e=>setBusca(e.target.value)}/></label>
              {visao!=='resultados'&&<label>Exibir<select value={filtro} onChange={e=>setFiltro(e.target.value)}><option value="todos">Todas em acompanhamento</option><option value="semana">Próximos 7 dias</option><option value="pendentes">Precisam de atenção</option><option value="avaliar">Avaliando</option><option value="participar">Vou participar</option><option value="enviada">Proposta enviada</option></select></label>}
              {(busca||filtro!=='todos')&&<button className="btn-outline" onClick={()=>{setBusca('');setFiltro('todos');}}>Limpar filtros</button>}
            </div>
            <div ref={listaRef} tabIndex={-1} className="lw-list" aria-label="Lista de licitações">
              {lista.map(it=><Linha key={it.id} it={it} baixarEdital={baixarEdital} editar={editar} remover={remover} resultados={visao==='resultados'} abrirDocumentos={podeAbrir('documentos',sessao)?abrirDocumentos:undefined}/>)}
              {!lista.length&&<div className="lw-empty"><Search size={24}/><h3>{busca||filtro!=='todos'?'Nenhum edital neste recorte':visao==='resultados'?'Nenhuma participação encerrada':'Comece pelo próximo edital'}</h3><p>{busca||filtro!=='todos'?'Altere a busca ou os filtros para consultar os demais registros.':visao==='resultados'?'Os resultados aparecerão aqui quando a situação da participação for atualizada.':'Pesquise oportunidades ou cadastre uma licitação para definir responsável, prazo e documentos.'}</p>{visao!=='resultados'&&<button className="btn-outline" onClick={()=>mudarVisao('pesquisa')}>Pesquisar oportunidades<ArrowUpRight size={15}/></button>}</div>}
            </div>
            <p className="lw-footer-links">Somente editais cadastrados pela equipe. A pesquisa pública é consultada separadamente.</p>
          </Card>
        </>}
      </>}

      {formAberto && <JanelaFormulario titulo={form.id?"Editar licitação":"Nova licitação"} ocupado={salvando} aoFechar={fecharForm} classe="lw-dialog">
      {aviso?.tom==="erro" && <p role="alert" className="text-bad-700 mb-4">{aviso.texto}</p>}
        {form.preparacaoBot&&<div className="lpt-prepared">
          <strong>Preparação a partir do BotImpresilk</strong>
          <p>Informações importadas da pesquisa. Confira o prazo no edital vigente e complete as etapas abaixo.</p>
          <p>Classificação do relatório: <strong>{form.preparacaoBot.classificacao}</strong></p>
          <p>Relatório: {form.preparacaoBot.relatorioId} · Consulta: {formatarDataRegiao(form.preparacaoBot.consultadoEm)}</p>
          {form.preparacaoBot.exigencias?.length>0&&<details><summary>Exigências completas do relatório ({form.preparacaoBot.exigencias.length})</summary><ul>{form.preparacaoBot.exigencias.map((t,i)=><li key={i}>{t}</li>)}</ul></details>}
          {form.preparacaoBot.avisos?.length>0&&<details><summary>Condições da preparação</summary><ul>{form.preparacaoBot.avisos.map((t,i)=><li key={i}>{t}</li>)}</ul></details>}
        </div>}
        <p className="mb-4 text-sm text-slate-600">Informe o objeto e organize o responsável, os prazos e a preparação do edital.</p>
        {conflito&&<div className="rounded-xl border border-amber-300 bg-amber-50 p-4 mb-4 space-y-3">
          <strong>Confira a versão atual antes de gravar</strong>
          <p className="text-sm">O rascunho e o arquivo escolhido continuam no formulário. A releitura não os substitui.</p>
          <button type="button" className="btn-outline" disabled={relendo||salvando} onClick={relerConflito}>{relendo?'Consultando…':'Reler versão atual'}</button>
          {conflito.lido&&conflito.atual&&<>
            <CompararLicitacao atual={conflito.atual} revisao={revisaoConflito} aoEscolher={(campo,valor)=>setConflito(c=>({...c,escolhas:{...c.escolhas,[campo]:valor}}))}/>
            <p className="text-sm">Campos que você não editou conservarão a atualização do servidor. Escolha cada campo alterado nas duas versões. O arquivo selecionado continua no formulário.</p>
            <button type="button" className="btn-outline" disabled={revisaoConflito.pendentes>0} onClick={confirmarRevisao}>Concluir revisão e voltar ao formulário</button>
          </>}
          {conflito.lido&&!conflito.atual&&!form.id&&<button type="button" className="btn-outline" onClick={()=>{setConflito(null);setAviso(null);}}>Revisado; tentar cadastrar novamente</button>}
        </div>}
        <form onSubmit={salvar} className="space-y-4">
          <fieldset disabled={salvando||relendo} className="space-y-4 min-w-0">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="l-nome">Objeto</label>
              <input
                id="l-nome"
                className="input"
                placeholder="ex.: Comunicação visual das escolas municipais"
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="l-orgao">Órgão</label>
              <input
                id="l-orgao"
                className="input"
                placeholder="ex.: Prefeitura de Montes Claros"
                value={form.identificacao}
                onChange={(e) => setForm((f) => ({ ...f, identificacao: e.target.value }))}
              />
            </div>
            <div>
              <label className="label" htmlFor="l-mod">Modalidade</label>
              <input
                id="l-mod"
                className="input"
                list="lista-modalidades"
                placeholder="ex.: Pregão Eletrônico"
                value={form.categoria}
                onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
              />
              <datalist id="lista-modalidades">
                {MODALIDADES.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="label" htmlFor="l-edital">Número do edital</label>
              <input
                id="l-edital"
                className="input"
                placeholder="ex.: 042/2026"
                value={form.edital}
                onChange={(e) => setForm((f) => ({ ...f, edital: e.target.value }))}
              />
            </div>
            <div className="lw-session-fields grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="l-data">{form.agendaPendente?'Data da conferência':'Dia da sessão'}</label>
                <input
                  id="l-data"
                  type="date"
                  className="input"
                  value={form.agendaPendente?form.acompanhamento?.prazoAcao||'':form.validade}
                  onChange={(e) => setForm((f) => form.agendaPendente?{...f,acompanhamento:{...f.acompanhamento,prazoAcao:e.target.value}}:{ ...f, validade: e.target.value })}
                />
              </div>
              <div>
                <label className="label" htmlFor="l-hora">Hora</label>
                <input
                  id="l-hora"
                  type="time"
                  className="input"
                  value={form.hora}
                  onChange={(e) => setForm((f) => ({ ...f, hora: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="l-url">Portal (link)</label>
              <input
                id="l-url"
                className="input"
                placeholder="ex.: portaldecompraspublicas.com.br/..."
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              />
            </div>
            <div>
              <label className="label" htmlFor="l-valor">Valor estimado (R$)</label>
              <input
                id="l-valor"
                className="input"
                inputMode="decimal"
                placeholder="ex.: 85000"
                value={form.valor}
                onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
              />
            </div>
            <div>
              <label className="label" htmlFor="l-status">Situação</label>
              <select
                id="l-status"
                className="input"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              >
                {Object.entries(STATUS).map(([id, s]) => (
                  <option key={id} value={id}>
                    {s.rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="l-obs">Observações</label>
              <textarea
                id="l-obs"
                className="input min-h-16"
                placeholder="garantia exigida, visita técnica, documentos que faltam..."
                value={form.observacao}
                onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))}
              />
            </div>
            <FormPreparacao form={form} setForm={setForm}/>
            <div className="sm:col-span-2">
              {!!form.arquivosEdital?.length&&<details className="mb-3"><summary>Editais anteriores ({form.arquivosEdital.length})</summary><div className="flex flex-wrap gap-2 mt-2">{form.arquivosEdital.map(a=><button key={a.id||'legado'} type="button" className="btn-outline" onClick={()=>baixarEdital(form,a.id||'legado')}>Baixar {a.nome||'edital anterior'}</button>)}</div></details>}
              <label className="label" htmlFor="l-arq">Edital (PDF até 3 MB)</label>
              <input
                id="l-arq"
                ref={inputArquivo}
                type="file"
                className="input file:mr-2 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary" disabled={salvando||relendo||!!conflito}>
              {form.id ? <Upload size={15} strokeWidth={2.4} /> : <Plus size={15} strokeWidth={2.4} />}
              {salvando ? "Salvando..." : form.id ? "Salvar alterações" : "Cadastrar licitação"}
            </button>
            {(
              <button type="button" className="btn-ghost" disabled={salvando||relendo} onClick={fecharForm}>
                Cancelar edição
              </button>
            )}
          </div>
          </fieldset>
        </form>
      </JanelaFormulario>}

    </div>
  );
}
