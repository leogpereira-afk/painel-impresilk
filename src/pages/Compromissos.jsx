// Compromissos: a agenda de campo da vendedora -- visita, medicao, entrega,
// instalacao, retorno de orcamento -- e as situacoes a resolver que nao tem
// data marcada.
//
// A tela abre pelo que esta ATRASADO e depois por hoje: e assim que o problema
// chega. Cada vendedora enxerga so os dela (o servidor separa por dono); a
// direcao ve os de todo mundo e pode filtrar por pessoa.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarCheck,
  RefreshCw,
  Plus,
  X,
  Check,
  Trash2,
  Pencil,
  AlertTriangle,
  Search,
  MoreHorizontal,
  CalendarClock,
  ArrowRight,
  Clock3,
  Users,
  Ruler,
  Truck,
  Wrench,
  Phone,
  FileText,
  HandCoins,
  CircleDot,
  Forward,
  MessageCircle,
  Paperclip,
} from "lucide-react";
import {
  lerCompromissos,
  salvarCompromisso,
  removerCompromisso,
  encaminharCompromisso,
  mandarRecado,
  lerAnexo,
  arquivoParaBase64,
  abrirBase64,
  lerPessoas,
} from "../services/compromissos.js";
import { pdfDaConversa, textoDaConversa, nomeDoArquivo } from "../lib/pdfConversa.js";
import './compromissos-modal.css';
import './compromissos.css';
import { montarAgenda, numeroWhatsApp } from '../lib/calc/agendaCompromissos.js';
import {AgendaMubisys} from '../components/AcoesMubisys.jsx';
import { getSessao } from "../lib/sessao.js";
import { dataCurta, diaLocalISO, diasEntre, ymdLocal } from "../lib/format.js";
import { CarregandoModulo, ErroModulo, AvisoAtualizacao } from "../components/ui.jsx";

// Cada tipo tem icone proprio: numa lista de 20 linhas, o icone diz o que e
// antes de a pessoa ler o titulo.
const TIPOS = {
  visita: { rotulo: "Visita", icone: Users, cor: "text-brand" },
  medicao: { rotulo: "Medição", icone: Ruler, cor: "text-brand" },
  retorno: { rotulo: "Retorno de orçamento", icone: Phone, cor: "text-warn-700" },
  entrega: { rotulo: "Entrega", icone: Truck, cor: "text-ok-700" },
  instalacao: { rotulo: "Instalação", icone: Wrench, cor: "text-ok-700" },
  cobranca: { rotulo: "Cobrança", icone: HandCoins, cor: "text-bad-700" },
  documento: { rotulo: "Documento / arte", icone: FileText, cor: "text-slate-500" },
  outro: { rotulo: "Outro", icone: CircleDot, cor: "text-slate-500" },
};

const VAZIO = {
  id: "",
  titulo: "",
  tipo: "visita",
  cliente: "",
  data: "",
  hora: "",
  telefone: "",
  obs: "",
  feito: false,
};

const PRIORIDADES = [
  { id: 'abertos', campo: 'emAberto', nome: 'Em aberto', apoio: 'Toda a agenda', icone: CircleDot, tom: 'marca' },
  { id: 'atrasados', campo: 'atrasados', nome: 'Atrasados', apoio: 'Prioridade de ação', icone: AlertTriangle, tom: 'atrasado' },
  { id: 'hoje', campo: 'hoje', nome: 'Hoje', apoio: 'Programação do dia', icone: CalendarCheck, tom: 'hoje' },
  { id: 'proximos', campo: 'proximos', nome: 'Próximos 7 dias', apoio: 'A partir de amanhã', icone: CalendarClock, tom: 'futuro' },
  { id: 'semData', campo: 'semData', nome: 'Sem data', apoio: 'Falta programar', icone: Clock3, tom: 'neutro' },
  { id: 'feitos', campo: 'concluidos', nome: 'Resolvidos', apoio: 'Histórico completo', icone: Check, tom: 'resolvido' },
];
const iniciais = nome => String(nome || '?').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase();

  // Eventos seguidos da MESMA pessoa viram um bloco so, com o nome uma vez no
  // topo -- e o que faz o histórico parecer conversa e nao log de sistema.
function blocosDaConversa(c) {
    const hist = Array.isArray(c.historico) ? c.historico : [];
    const blocos = [];
    for (const ev of hist) {
      const ultimo = blocos[blocos.length - 1];
      if (ultimo && ultimo.quem === ev.quem) ultimo.eventos.push(ev);
      else blocos.push({ quem: ev.quem, nome: ev.quemNome || ev.quem, eventos: [ev] });
    }
  return blocos;
}

function Conversa({ c, sessao, enviando, aoEnviar, aoBaixar, aoWhatsApp }) {
    const blocos = blocosDaConversa(c);
    const meu = (quem) => quem === sessao?.usuario;
    return (
      <div className="mt-2 rounded-xl border p-3" style={{ borderColor: "var(--hairline)" }}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="font-display text-sm font-semibold text-slate-900">Conversa</span>
          <button
            type="button"
            onClick={() => aoWhatsApp(c)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-ok-700 px-3 font-display text-xs font-semibold text-white transition-all hover:brightness-90"
            title="Manda o histórico em PDF pelo WhatsApp"
          >
            <MessageCircle size={14} strokeWidth={2.4} />
            Mandar no WhatsApp
          </button>
        </div>

        {blocos.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nada registrado ainda. Escreva abaixo o que foi feito — quem receber este compromisso
            vai ler.
          </p>
        ) : (
          <div className="space-y-3">
            {blocos.map((b, i) => (
              <div key={i} className={`flex flex-col ${meu(b.quem) ? "items-end" : "items-start"}`}>
                <span className="mb-1 font-display text-xs font-semibold text-slate-500">
                  {meu(b.quem) ? "Você" : b.nome}
                </span>
                <div className="max-w-[85%] space-y-1">
                  {b.eventos.map((ev, j) => (
                    <div
                      key={j}
                      className={`rounded-xl px-3 py-2 text-sm ${
                        meu(b.quem) ? "bg-brand/10 text-slate-900" : "bg-slate-100 text-slate-900"
                      }`}
                    >
                      {ev.tipo !== "recado" && (
                        <span className="block font-display text-xs font-semibold text-slate-600">
                          {ev.tipo === "criou" && "abriu o compromisso"}
                          {ev.tipo === "passou" && `passou para ${ev.paraNome || ev.para}`}
                          {ev.tipo === "concluiu" && "marcou como resolvido"}
                          {ev.tipo === "reabriu" && "reabriu"}
                        </span>
                      )}
                      {ev.texto && <span className="block whitespace-pre-wrap">{ev.texto}</span>}
                      {ev.arquivo && (
                        <button
                          type="button"
                          onClick={() => aoBaixar(c, ev.arquivo)}
                          className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-white/70 px-2 py-1 font-display text-xs font-medium text-brand hover:underline"
                        >
                          <Paperclip size={12} />
                          {ev.arquivo.nome}
                        </button>
                      )}
                      <span className="mt-0.5 block text-[11px] tabular-nums text-slate-400">
                        {ev.em ? new Date(ev.em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* `enviando` JA CHEGA AQUI COMO BOOLEANO (a pagina compara com o id
            antes de passar). Comparar de novo com c.id dava sempre false: o
            botao Enviar nunca desabilitava e, no 3G da rua, dois toques
            mandavam recado e anexo em DOBRO -- e o "Enviando..." nunca
            aparecia. */}
        <Compositor enviando={enviando} aoEnviar={(t, a) => aoEnviar(c, t, a)} />
    </div>
  );
}



// O campo de escrever tem estado PROPRIO. Se o texto morasse no componente da
// pagina, cada tecla re-renderizaria a lista inteira -- e como Linha/Conversa
// eram criadas dentro da pagina, o React trocava o tipo do componente a cada
// render e o campo perdia o foco a cada letra digitada.
function Compositor({ enviando, aoEnviar }) {
  const [texto, setTexto] = useState("");
  const [arquivo, setArquivo] = useState(null);
  const campoArquivo = useRef(null);

  const enviar = async () => {
    if (!texto.trim() && !arquivo) return;
    const ok = await aoEnviar(texto.trim(), arquivo);
    if (ok) {
      setTexto("");
      setArquivo(null);
      if (campoArquivo.current) campoArquivo.current.value = "";
    }
  };

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          className="input h-9 min-w-0 flex-1 basis-48 py-0 text-sm"
          placeholder="Escreva o que foi feito, o que falta..."
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              enviar();
            }
          }}
        />
        <label
          className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-3 font-display text-xs font-medium text-slate-600 hover:bg-slate-100"
          style={{ borderColor: "var(--hairline)" }}
          title="Anexar foto ou PDF (até 3 MB)"
        >
          <Paperclip size={14} />
          {arquivo ? "1 arquivo" : "Anexar"}
          <input
            ref={campoArquivo}
            type="file"
            className="hidden"
            accept="image/*,application/pdf"
            onChange={(e) => setArquivo(e.target.files?.[0] || null)}
          />
        </label>
        <button
          type="button"
          onClick={enviar}
          disabled={enviando || (!texto.trim() && !arquivo)}
          className="btn-primary h-9 shrink-0 px-3 text-xs disabled:opacity-40"
        >
          {enviando ? "Enviando..." : "Enviar"}
        </button>
      </div>
      {arquivo && (
        <p className="mt-1 text-xs text-slate-500">
          Anexo escolhido: {arquivo.name}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => {
              setArquivo(null);
              if (campoArquivo.current) campoArquivo.current.value = "";
            }}
          >
            tirar
          </button>
        </p>
      )}
    </>
  );
}

// As datas do remarcar rápido. Local, nunca UTC: `new Date().toISOString()`
// devolve o dia de AMANHÃ depois das 21h aqui, e o compromisso nasceria um dia
// à frente sem ninguém entender.
function maisDias(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return ymdLocal(d);
}
function proximaSegunda() {
  const d = new Date();
  // 1 = segunda. Se hoje já é segunda, vai para a semana que vem.
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return ymdLocal(d);
}

function FormularioModal({titulo,descricao="Só o título é obrigatório. Você pode definir a data depois.",salvando,aoFechar,children}) {
  const dialogo = useRef(null);
  useEffect(() => {
    const anterior = document.activeElement;
    const el = dialogo.current;
    const overflow = document.body.style.overflow;
    el.showModal();
    document.body.style.overflow = "hidden";
    el.querySelector("input, select, textarea")?.focus();
    return () => {
      el.close();
      document.body.style.overflow = overflow;
      if (anterior instanceof HTMLElement && anterior.isConnected) anterior.focus();
    };
  }, []);
  return <dialog ref={dialogo} className="compromisso-modal" aria-labelledby="compromisso-modal-titulo" onCancel={e => { e.preventDefault(); if (!salvando) aoFechar(); }}>
    <header className="compromisso-modal-cabecalho"><div><h2 id="compromisso-modal-titulo">{titulo}</h2><p>{descricao}</p></div><button type="button" className="btn-ghost" aria-label="Fechar formulário de compromisso" disabled={salvando} onClick={aoFechar}><X size={22}/></button></header>
    {children}
  </dialog>;
}

function MenuAcoes({ c, equipe, ocupado, acoes }) {
  const [aberto, setAberto] = useState(false);
  const menu = useRef(null);
  const botao = useRef(null);
  useEffect(() => {
    if (!aberto) return;
    const fechar = e => { if (!menu.current?.contains(e.target)) setAberto(false); };
    const teclado = e => { if (e.key === 'Escape') { setAberto(false); botao.current?.focus(); } };
    document.addEventListener('pointerdown', fechar);
    document.addEventListener('keydown', teclado);
    return () => { document.removeEventListener('pointerdown', fechar); document.removeEventListener('keydown', teclado); };
  }, [aberto]);
  const executar = fn => { setAberto(false); fn(); };
  return <div className="cp-menu" ref={menu}>
    <button type="button" ref={botao} className="cp-icon-button" aria-label={`Mais ações: ${c.titulo}`} aria-expanded={aberto} disabled={ocupado} onClick={() => setAberto(v => !v)}><MoreHorizontal size={19}/></button>
    {aberto && <div className="cp-menu-lista">
      <button type="button" onClick={() => executar(() => acoes.abrirForm(c))}><Pencil size={16}/>Editar compromisso</button>
      {equipe.length > 1 && <button type="button" onClick={() => executar(() => acoes.prepararEncaminhamento(c))}><Forward size={16}/>Encaminhar</button>}
      {c.telefone && <><a href={`tel:${String(c.telefone).replace(/[^+\d]/g, '')}`}><Phone size={16}/>Ligar para o cliente</a><a href={`https://wa.me/${numeroWhatsApp(c.telefone)}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={16}/>WhatsApp do cliente</a></>}
      <button type="button" className="cp-acao-excluir" onClick={() => executar(() => acoes.remover(c))}><Trash2 size={16}/>Excluir compromisso</button>
    </div>}
  </div>;
}

function Linha({ c, sessao, equipe, ocupado, bloqueado, remarcando, setRemarcando,
                 conversaAberta, setConversaAberta, enviando, acoes, hojeISO }) {
  const tipo = TIPOS[c.tipo] || TIPOS.outro, Icone = tipo.icone;
  const hist = Array.isArray(c.historico) ? c.historico : [];
  const ult = hist[hist.length - 1];
  const diasSemNovidade = ult?.em ? diasEntre(diaLocalISO(ult.em), hojeISO) : null;
  const parado = !c.feito && (c.dias === null || c.dias < 0) && diasSemNovidade >= 3;
  const quantos = hist.filter(e => e.tipo === 'recado' || e.tipo === 'passou').length;
  const aberta = conversaAberta === c.id;
  return <article className={`cp-item cp-item--${c.feito ? 'resolvido' : c.pz.tom}`} aria-label={c.titulo} aria-busy={ocupado || enviando}>
    <div className="cp-item-linha">
      <span className={`cp-tipo-icon cp-tipo--${c.tipo}`} title={tipo.rotulo}><Icone size={20}/></span>
      <div className="cp-item-conteudo">
        <div className="cp-item-meta"><span>{tipo.rotulo}</span>{c.cliente && <><span aria-hidden="true">·</span><span>{c.cliente}</span></>}</div>
        <h3><button type="button" onClick={() => setConversaAberta(aberta ? null : c.id)} aria-expanded={aberta}>{c.titulo}</button></h3>
        <div className="cp-item-contexto"><span className="cp-responsavel"><span aria-hidden="true">{iniciais(c.donoNome || sessao?.nome)}</span>{c.donoNome || sessao?.nome || 'Responsável não informado'}</span>
          {parado && <span className="cp-sem-retorno"><Clock3 size={12}/>Sem atualização há {diasSemNovidade} dias</span>}
          {c.crmOperacao && <span className="cp-origem">Mubisys</span>}{c.cobrancaOrigem && <span className="cp-origem">Cobrança</span>}
        </div>
        {ult && <p className="cp-ultima" title={ult.texto || ''}>{ult.quemNome || ult.quem}{diasSemNovidade !== null ? ` · ${diasSemNovidade <= 0 ? 'hoje' : `há ${diasSemNovidade}d`}` : ''}{ult.texto ? `: ${ult.texto}` : ''}</p>}
      </div>
      <div className="cp-item-prazo"><span className={`cp-situacao cp-situacao--${c.feito ? 'resolvido' : c.pz.tom}`}>{c.feito ? 'Resolvido' : c.pz.texto}</span>
        <span>{c.data && c.dias !== null ? `${dataCurta(c.data)}${c.hora ? ` às ${c.hora}` : ' · sem horário'}` : 'Definir programação'}</span>
      </div>
      <div className="cp-item-acoes">
        <button type="button" className={`cp-acao ${aberta ? 'cp-acao--ativa' : ''}`} onClick={() => setConversaAberta(aberta ? null : c.id)} aria-expanded={aberta}><MessageCircle size={16}/>Conversa{quantos > 0 && <span className="cp-contador">{quantos}</span>}</button>
        {!c.feito && <button type="button" className="cp-icon-button" aria-label={`Reagendar: ${c.titulo}`} title="Reagendar" disabled={bloqueado} onClick={() => setRemarcando(remarcando === c.id ? null : c.id)} aria-expanded={remarcando === c.id}><CalendarClock size={18}/></button>}
        <button type="button" className={`cp-acao ${c.feito ? '' : 'cp-acao--concluir'}`} disabled={bloqueado} onClick={() => acoes.alternarFeito(c)}><Check size={16}/>{ocupado ? 'Salvando…' : c.feito ? 'Reabrir' : 'Concluir'}</button>
        <MenuAcoes c={c} equipe={equipe} ocupado={bloqueado} acoes={acoes}/>
      </div>
    </div>
    {remarcando === c.id && <div className="cp-reagendar"><span><CalendarClock size={16}/>Reagendar para</span>
      {[['Hoje',maisDias(0)],['Amanhã',maisDias(1)],['Segunda',proximaSegunda()],['Daqui a 7 dias',maisDias(7)]].map(([nome,data]) => <button type="button" key={nome} disabled={bloqueado} onClick={() => acoes.remarcar(c,data)}>{nome}</button>)}
      <button type="button" disabled={bloqueado} onClick={() => { setRemarcando(null); acoes.abrirForm(c); }}>Escolher data e horário</button>
      <button type="button" className="cp-icon-button" aria-label="Fechar reagendamento" onClick={() => setRemarcando(null)}><X size={16}/></button>
    </div>}
    {aberta && <div className="cp-detalhe">
      {(c.obs || c.encaminhadoPor || c.crmOperacao || c.cobrancaOrigem) && <div className="cp-notas">{c.obs && <p><strong>Observação:</strong> {c.obs}</p>}{c.encaminhadoPor && <p>Encaminhado por {c.encaminhadoPor}</p>}{c.crmOperacao && <p>Origem: Mubisys. Conclusão e reagendamento são controlados nesta agenda.</p>}{c.cobrancaOrigem && <p>Acompanhamento de cobrança. Confirme o recebimento no ERP.</p>}</div>}
      <Conversa c={c} sessao={sessao} enviando={enviando} aoEnviar={acoes.enviarRecado} aoBaixar={acoes.baixarAnexo} aoWhatsApp={acoes.mandarWhatsApp}/>
      <span className="cp-registro-id">Identificação do registro: {c.id}</span>
    </div>}
  </article>;
}

export default function Compromissos() {
  const sessao = getSessao();
  const ehDirecao = !!sessao?.master;

  const [mapa, setMapaLido] = useState(null);
  const pedidoLeitura = useRef(0);
  const ultimaCarga = useRef(0);
  const [atualizando,setAtualizando] = useState(false);
  const setMapa = useCallback((valor) => {
    pedidoLeitura.current++;
    setAtualizando(false);
    setMapaLido(valor);
  }, []);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [form, setForm] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [dePessoa, setDePessoa] = useState(null); // filtro da direcao
  const [busca, setBusca] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('');
  const [transferencia, setTransferencia] = useState(null);
  const [ocupado, setOcupado] = useState(null);
  const mutacao = useRef(false);
  const [equipe, setEquipe] = useState([]);
  const [remarcando, setRemarcando] = useState(null);     // id da linha remarcando
  // Os indicadores filtram a lista. Em aberto reúne todos os itens pendentes.
  const [recorte, setRecorte] = useState("abertos");
  const [conversaAberta, setConversaAberta] = useState(null); // id da conversa expandida
  const [enviando, setEnviando] = useState(null); // id do recado em envio
  // Item sem dono so acontece em registro antigo (anterior ao carimbo do
  // servidor). Nesse caso o dono e quem esta vendo -- e o servidor so mostra o
  // que e dela. Sem isso, o "passar para..." oferecia a PROPRIA pessoa.
  const donoDe = (c) => c.dono ?? sessao?.usuario ?? "";
  // "Hoje" precisa ser ESTADO, nao um calculo do render: esta e uma tela que
  // fica aberta. A vendedora deixa o painel no computador e volta no dia
  // seguinte -- com o dia congelado, o compromisso de hoje continuava
  // aparecendo como "amanha" e o atrasado nao virava atrasado.
  const [hojeISO, setHojeISO] = useState(() => ymdLocal(new Date()));

  const recarregar = useCallback(async () => {
    const pedido = ++pedidoLeitura.current;
    ultimaCarga.current = Date.now();
    setAtualizando(true);
    setHojeISO(ymdLocal(new Date()));
    try {
      const m = await lerCompromissos();
      if (pedido !== pedidoLeitura.current) return;
      setMapaLido(m);
      setErro(null);
    } catch(e) {
      if (pedido === pedidoLeitura.current) setErro(e.message);
    } finally {
      if (pedido === pedidoLeitura.current) setAtualizando(false);
    }
  }, []);

  useEffect(() => {
    const controle = pedidoLeitura;
    let vivo = true;
    recarregar();
    lerPessoas().then(p => vivo && setEquipe(p)).catch(() => {});
    return () => { vivo = false; controle.current++; };
  }, [recarregar]);

  // Voltou para a aba: refaz a conta do dia e busca o que chegou enquanto ela
  // estava em outro lugar (um compromisso encaminhado por uma colega, por
  // exemplo, so aparecia depois de recarregar a pagina na mao).
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === "visible" && Date.now() - ultimaCarga.current > 1500) recarregar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [recarregar]);

  const vm = useMemo(() => montarAgenda(mapa, {
    hoje: hojeISO, pessoa: dePessoa, usuario: sessao?.usuario, busca, tipo: tipoFiltro, recorte,
  }), [mapa, hojeISO, dePessoa, sessao?.usuario, busca, tipoFiltro, recorte]);

  // Tem texto digitado que ainda nao foi salvo? Comparar com o item de origem
  // (ou com o formulario vazio) e o unico jeito de saber -- e sem isso um
  // clique no lapis de outra linha apagava o que a pessoa estava escrevendo,
  // sem perguntar nada.
  const formSujo = () => {
    if (!form) return false;
    const base = form.id ? { ...VAZIO, ...(mapa?.[form.id] ?? {}), id: form.id } : VAZIO;
    return ["titulo", "tipo", "cliente", "telefone", "data", "hora", "obs"].some(
      (k) => String(form[k] ?? "") !== String(base[k] ?? "")
    );
  };

  const abrirForm = (c) => {
    if (mutacao.current) return;
    if (formSujo() && !window.confirm("Você tem um compromisso pela metade. Descartar o que escreveu?")) return;
    setAviso(null);
    setForm(c ? { ...VAZIO, ...c } : { ...VAZIO, cadastroId:crypto.randomUUID() });
  };

  const fecharForm = () => {
    if (salvando) return;
    if (formSujo() && !window.confirm("Descartar as alterações deste compromisso?")) return;
    setForm(null);
    setAviso(null);
  };

  const salvar = useCallback(
    async (e) => {
      e.preventDefault();
      if (mutacao.current) return;
      setAviso(null);
      if (!form.titulo.trim()) return setAviso({ tom: "erro", texto: "Escreva o que precisa ser feito." });
      mutacao.current = true;
      setSalvando(true);
      try {
        // Id com o usuario e um sufixo aleatorio: `cp-<milissegundo>` sozinho e
        // compartilhado por toda a equipe -- duas pessoas cadastrando no mesmo
        // instante caiam na MESMA linha, e o servidor recusava a segunda por
        // ser de outro dono.
        const novo = !form.id;
        const id = form.id || form.cadastroId;
        const dados = {
          titulo: form.titulo.trim(),
          tipo: form.tipo,
          cliente: form.cliente.trim(),
          /* O TELEFONE VAI JUNTO. O campo existia no formulario e nunca entrava
             aqui: a vendedora digitava o numero, ele evaporava no salvar, e os
             botoes Ligar/WhatsApp da linha (que dependem de c.telefone) nunca
             apareciam para nada cadastrado por esta tela -- um recurso inteiro
             anunciado no formulario e morto em silencio. */
          telefone: String(form.telefone || "").trim(),
          data: form.data,
          hora: form.hora,
          obs: form.obs.trim(),
          criadoEm: form.criadoEm || new Date().toISOString(),
          // feito/feitoEm NAO entram aqui de proposito: quem manda neles e o
          // botao de concluir. Mandando-os, salvar uma edicao aberta antes de
          // concluir o item DESFAZIA o "concluir" feito no meio do caminho.
          ...(novo ? { feito: false, feitoEm: "" } : {}),
        };
        const mapaNovo = await salvarCompromisso(id, dados);
        setMapa(mapaNovo);
        // A direcao filtrando por uma pessoa e cadastrando um compromisso
        // proprio: sem isto o item nascia e sumia da tela no mesmo instante.
        if (novo && dePessoa && mapaNovo?.[id]?.dono !== dePessoa) setDePessoa(null);
        if (novo) { setRecorte('abertos'); setBusca(''); setTipoFiltro(''); }
        setForm(null);
        setAviso({ tom: "ok", texto: "Compromisso salvo." });
      } catch (err) {
        setAviso({ tom: "erro", texto: err.message });
      } finally {
        mutacao.current = false;
        setSalvando(false);
      }
    },
    [form, dePessoa, setMapa]
  );

  const executarMutacao = async (c, trabalho, mensagem) => {
    if (mutacao.current) return false;
    mutacao.current = true;
    setOcupado(c.id);
    setAviso(null);
    try {
      setMapa(await trabalho());
      setAviso({ tom: 'ok', texto: mensagem });
      return true;
    } catch (err) {
      setAviso({ tom: 'erro', texto: err.message });
      return false;
    } finally { mutacao.current = false; setOcupado(null); }
  };
  const alternarFeito = c => executarMutacao(c,
    () => salvarCompromisso(c.id, { feito: !c.feito, feitoEm: !c.feito ? new Date().toISOString() : '' }),
    c.feito ? 'Compromisso reaberto. Confira em Em aberto.' : 'Compromisso concluído. Ele está no histórico de Resolvidos.');
  const prepararEncaminhamento = c => { setAviso(null); setTransferencia({ c, usuario: '', recado: '' }); };
  const encaminhar = async e => {
    e.preventDefault();
    const { c, usuario, recado } = transferencia;
    if (!usuario || usuario === donoDe(c)) return;
    const nome = equipe.find(p => p.usuario === usuario)?.nome || usuario;
    const ok = await executarMutacao(c, () => encaminharCompromisso(c.id, usuario, recado.trim()), `Compromisso encaminhado para ${nome}.`);
    if (ok) setTransferencia(null);
  };

  // ---- conversa ----------------------------------------------------------
  // Devolve true quando gravou -- e o sinal para o Compositor limpar o campo.
  // Limpar sem confirmacao apagaria o que a pessoa escreveu quando a rede cai.
  const enviarRecado = async (c, texto, file) => {
    if ((!texto && !file) || mutacao.current) return false;
    if (file && file.size > 3 * 1024 * 1024) {
      setAviso({
        tom: "erro",
        texto: `"${file.name}" tem ${(file.size / 1024 / 1024).toFixed(1)} MB. O limite e 3 MB -- mande o PDF ou reduza a foto.`,
      });
      return false;
    }
    mutacao.current = true;
    setEnviando(c.id);
    setAviso(null);
    try {
      const arquivo = file
        ? { base64: await arquivoParaBase64(file), nome: file.name, mime: file.type || "application/octet-stream" }
        : null;
      setMapa(await mandarRecado(c.id, { texto, arquivo }));
      return true;
    } catch (err) {
      setAviso({ tom: "erro", texto: err.message });
      return false;
    } finally {
      mutacao.current = false;
      setEnviando(null);
    }
  };

  const baixarAnexo = async (c, arquivo) => {
    try {
      const a = await lerAnexo(c.id, arquivo.chave);
      abrirBase64(a.base64, a.mime, a.nome || arquivo.nome);
    } catch (err) {
      setAviso({ tom: "erro", texto: err.message });
    }
  };

  // Manda a conversa pelo WhatsApp. No celular (que e onde a vendedora esta) o
  // navegador abre a folha de compartilhamento COM o PDF anexado. No
  // computador isso nao existe: baixa o PDF e abre o WhatsApp com o texto, e a
  // pessoa anexa o arquivo que acabou de cair na pasta de downloads.
  const mandarWhatsApp = async (c) => {
    const dados = { ...c, tipoRotulo: (TIPOS[c.tipo] || TIPOS.outro).rotulo };
    try {
      const blob = pdfDaConversa(dados);
      const arquivo = new File([blob], nomeDoArquivo(dados), { type: "application/pdf" });
      const texto = textoDaConversa(dados);
      if (navigator.canShare?.({ files: [arquivo] })) {
        await navigator.share({ files: [arquivo], title: c.titulo, text: texto });
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = arquivo.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
      setAviso({
        tom: "ok",
        texto: "PDF baixado e WhatsApp aberto com o texto. Anexe o PDF na conversa se precisar do papel.",
      });
    } catch (err) {
      // AbortError = a pessoa fechou a folha de compartilhamento. Nao e erro.
      if (err?.name !== "AbortError") setAviso({ tom: "erro", texto: "Não consegui montar o PDF da conversa." });
    }
  };

  const remover = async (c) => {
    if (mutacao.current) return;
    if (!window.confirm(`Apagar "${c.titulo}"?`)) return;
    mutacao.current = true; setOcupado(c.id);
    setAviso(null);
    try {
      await removerCompromisso(c.id);
      setMapa((m) => {
        const novo = { ...(m || {}) };
        delete novo[c.id];
        return novo;
      });
      if (form?.id === c.id) setForm(null);
      setAviso({ tom: "ok", texto: "Compromisso excluído." });
    } catch (err) {
      setAviso({ tom: "erro", texto: err.message });
    } finally { mutacao.current = false; setOcupado(null); }
  };

  const remarcar = async (c, novaData) => {
    const ok = await executarMutacao(c, () => salvarCompromisso(c.id, { data: novaData }), `Compromisso reagendado para ${dataCurta(novaData)}.`);
    if (ok) setRemarcando(null);
  };
  const acoes = { alternarFeito, abrirForm, remover, prepararEncaminhamento, enviarRecado, baixarAnexo, mandarWhatsApp, remarcar };
  const limparFiltros = () => { setBusca(''); setTipoFiltro(''); setDePessoa(null); setRecorte('abertos'); };
  const temFiltros = !!(busca || tipoFiltro || dePessoa || recorte !== 'abertos');
  const prioridade = PRIORIDADES.find(p => p.id === recorte);

  if (erro && mapa === null) return <ErroModulo mensagem={erro} aoTentar={recarregar}/>;
  if (mapa === null) return <CarregandoModulo />;


  return (
    <div className="cp-page">
      <AvisoAtualizacao erro={erro} aoTentar={recarregar}/>
      <header className="cp-cabecalho">
        <div><p className="cp-eyebrow">OPERAÇÃO · {ehDirecao ? 'AGENDA DA EQUIPE' : 'MINHA AGENDA'}</p><h1>Compromissos</h1><p>Clareza sobre o que fazer, com quem e até quando.</p></div>
        <div className="cp-cabecalho-acoes"><button type="button" className="cp-atualizar" disabled={atualizando} onClick={recarregar}><RefreshCw size={17} className={atualizando ? 'animate-spin' : ''}/>{atualizando ? 'Atualizando…' : 'Atualizar'}</button><button type="button" className="btn-primary" onClick={() => abrirForm(null)}><Plus size={18}/>Novo compromisso</button></div>
      </header>
      <section className="cp-prioridades" aria-label="Filtrar compromissos por prioridade">
        {PRIORIDADES.map(p => { const Icone = p.icone; return <button type="button" key={p.id} className={`cp-prioridade cp-prioridade--${p.tom} ${recorte === p.id ? 'selecionada' : ''}`} aria-pressed={recorte === p.id} onClick={() => setRecorte(p.id)}>
          <span className="cp-prioridade-topo"><span>{p.nome}</span><Icone size={17}/></span><strong>{vm[p.campo]}</strong><span className="cp-prioridade-apoio">{p.apoio}<ArrowRight size={14}/></span>
        </button>; })}
      </section>
      <section className="cp-filtros" aria-label="Busca e responsáveis">
        <div className="cp-filtros-principal"><label className="cp-busca"><Search size={18}/><input aria-label="Buscar compromisso" placeholder="Buscar compromisso, cliente ou responsável…" value={busca} onChange={e => setBusca(e.target.value)}/>{busca && <button type="button" aria-label="Limpar busca" onClick={() => setBusca('')}><X size={16}/></button>}</label>
          <label className="cp-tipo-filtro"><span>Tipo</span><select value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)} aria-label="Tipo de compromisso"><option value="">Todos os tipos</option>{Object.entries(TIPOS).map(([id,t]) => <option value={id} key={id}>{t.rotulo}</option>)}</select></label>
          {temFiltros && <button type="button" className="cp-limpar" onClick={limparFiltros}>Limpar filtros</button>}
        </div>
        {ehDirecao && vm.pessoas.length > 1 && <div className="cp-equipe"><span className="cp-equipe-label">Responsável<small>Em aberto por pessoa</small></span><div className="cp-pessoas" aria-label="Filtrar por responsável">
          <button type="button" className={`cp-pessoa ${!dePessoa ? 'selecionada' : ''}`} aria-pressed={!dePessoa} onClick={() => setDePessoa(null)}><Users size={17}/>Equipe toda</button>
          {vm.pessoas.map(p => <button type="button" key={p.dono} className={`cp-pessoa ${dePessoa === p.dono ? 'selecionada' : ''}`} aria-pressed={dePessoa === p.dono} onClick={() => setDePessoa(dePessoa === p.dono ? null : p.dono)} title={`${p.nome}: ${p.emAberto} em aberto, ${p.atrasados} atrasados`}><span className="cp-avatar">{iniciais(p.nome)}</span><span>{p.nome}</span><span className="cp-contador">{p.emAberto}</span>{p.atrasados > 0 && <span className="cp-pessoa-atraso" aria-label={`${p.atrasados} atrasados`}><AlertTriangle size={12}/>{p.atrasados}</span>}</button>)}
        </div></div>}
      </section>
      <div className="cp-integracao"><AgendaMubisys aoConcluir={recarregar}/></div>
      {aviso && <div role={aviso.tom === 'erro' ? 'alert' : 'status'} className={`cp-aviso cp-aviso--${aviso.tom}`}><span>{aviso.texto}</span>{aviso.tom === 'ok' && <button type="button" aria-label="Fechar mensagem" onClick={() => setAviso(null)}><X size={16}/></button>}</div>}
      <div className="cp-lista-cabecalho"><div><h2>{prioridade.nome}{dePessoa ? ` · ${vm.pessoas.find(p => p.dono === dePessoa)?.nome || dePessoa}` : ''}</h2><span>{vm.exibidos} {vm.exibidos === 1 ? 'compromisso' : 'compromissos'}{busca || tipoFiltro ? ' neste filtro' : ''}</span></div><span className="cp-ordem"><Clock3 size={14}/>{recorte === 'feitos' ? 'Últimas conclusões primeiro' : 'Prioridade e horário'}</span></div>
      {transferencia && <FormularioModal titulo="Encaminhar compromisso" descricao="O histórico e os anexos seguem com o compromisso para o novo responsável." salvando={!!ocupado} aoFechar={() => !ocupado && setTransferencia(null)}>
        <form className="compromisso-modal-form space-y-4" onSubmit={encaminhar}><p className="cp-encaminhar-titulo">{transferencia.c.titulo}</p>{aviso?.tom === 'erro' && <p role="alert" className="text-bad-700">{aviso.texto}</p>}
          <label className="label" htmlFor="cp-destino">Novo responsável</label><select id="cp-destino" className="input" required value={transferencia.usuario} onChange={e => setTransferencia(t => ({...t, usuario:e.target.value}))}><option value="">Selecione uma pessoa</option>{equipe.filter(p => p.usuario !== donoDe(transferencia.c)).map(p => <option key={p.usuario} value={p.usuario}>{p.nome}</option>)}</select>
          <label className="label" htmlFor="cp-recado">O que a pessoa precisa saber? (opcional)</label><textarea id="cp-recado" className="input" rows={3} value={transferencia.recado} onChange={e => setTransferencia(t => ({...t, recado:e.target.value}))}/>
          <div className="cp-modal-acoes"><button type="button" className="btn-outline" disabled={!!ocupado} onClick={() => setTransferencia(null)}>Cancelar</button><button type="submit" className="btn-primary" disabled={!!ocupado || !transferencia.usuario}>{ocupado ? 'Encaminhando…' : 'Encaminhar compromisso'}</button></div>
        </form>
      </FormularioModal>}
      {form && (
        <FormularioModal titulo={form.id ? "Editar compromisso" : "Novo compromisso"} salvando={salvando} aoFechar={fecharForm}>
          {aviso?.tom === "erro" && <p role="alert" className="mx-6 mb-4 rounded-lg bg-bad-50 p-3 text-sm text-bad-700">{aviso.texto}</p>}
          <form onSubmit={salvar} className="compromisso-modal-form space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="c-titulo">O que precisa ser feito</label>
                <input
                  id="c-titulo"
                  className="input"
                  placeholder="ex.: Medir a fachada da loja nova"
                  value={form.titulo}
                  onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="c-tipo">Tipo</label>
                <select
                  id="c-tipo"
                  className="input"
                  value={form.tipo}
                  onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}
                >
                  {Object.entries(TIPOS).map(([id, t]) => (
                    <option key={id} value={id}>
                      {t.rotulo}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="c-cliente">Cliente (opcional)</label>
                <input
                  id="c-cliente"
                  className="input"
                  placeholder="ex.: Padaria São Jose"
                  value={form.cliente}
                  onChange={(e) => setForm((f) => ({ ...f, cliente: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="c-data">Data</label>
                  <input
                    id="c-data"
                    type="date"
                    className="input"
                    value={form.data}
                    onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="c-hora">Hora</label>
                  <input
                    id="c-hora"
                    type="time"
                    className="input"
                    value={form.hora}
                    onChange={(e) => setForm((f) => ({ ...f, hora: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                {/* TELEFONE TEM LUGAR PRÓPRIO.
                    Retorno de orçamento, cobrança e visita terminam em falar
                    com o cliente, e o telefone só cabia dentro da observação,
                    em texto livre -- de onde ninguém liga: é copiar, sair da
                    tela, colar. Com campo próprio, a linha ganha os botões. */}
                <label className="label" htmlFor="c-tel">Telefone do cliente</label>
                <input
                  id="c-tel"
                  className="input"
                  inputMode="tel"
                  placeholder="(38) 99999-0000"
                  value={form.telefone || ""}
                  onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))}
                />
              </div>
              <div>
                <label className="label" htmlFor="c-obs">Observação</label>
                <textarea
                  rows={3}
                  id="c-obs"
                  className="input"
                  placeholder="Endereço, materiais e o que precisa ser preparado…"
                  value={form.obs}
                  onChange={(e) => setForm((f) => ({ ...f, obs: e.target.value }))}
                />
              </div>
            </div>
            <div className="cp-modal-acoes">
              <button className="btn-primary" disabled={salvando}>
                {salvando ? "Salvando..." : form.id ? "Salvar alterações" : "Cadastrar"}
              </button>
              <button type="button" className="btn-ghost" disabled={salvando} onClick={fecharForm}>
                Cancelar
              </button>
            </div>
          </form>
        </FormularioModal>
      )}

      {vm.grupos.length === 0 ? <div className="cp-vazio"><CalendarCheck size={30}/><h3>{vm.total === 0 ? 'Sua agenda começa aqui' : recorte === 'atrasados' ? 'Nenhum compromisso atrasado neste filtro' : 'Nenhum compromisso neste filtro'}</h3><p>{vm.total === 0 ? 'Registre uma visita, medição, retorno ou algo que precisa resolver.' : 'Escolha outra prioridade ou ajuste a busca para encontrar o que precisa.'}</p><button type="button" className="btn-outline" onClick={vm.total === 0 ? () => abrirForm(null) : limparFiltros}>{vm.total === 0 ? 'Criar compromisso' : 'Ver todos em aberto'}</button></div> :
        <div className="cp-grupos">{vm.grupos.map(g => <section className="cp-grupo" key={g.nome} aria-label={g.nome}>
          {recorte === 'abertos' && <header className="cp-grupo-cabecalho"><h3>{g.nome}</h3><span>{g.itens.length}</span></header>}
          <div className="cp-lista">{g.itens.map(c => <Linha key={c.id} c={c} sessao={sessao} equipe={equipe} ocupado={ocupado === c.id} bloqueado={!!ocupado || !!enviando || salvando} remarcando={remarcando} setRemarcando={setRemarcando} conversaAberta={conversaAberta} setConversaAberta={setConversaAberta} enviando={enviando === c.id} acoes={acoes} hojeISO={hojeISO}/>)}</div>
        </section>)}</div>}
    </div>
  );
}
