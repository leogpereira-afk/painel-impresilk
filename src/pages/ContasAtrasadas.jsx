// Contas Atrasadas: quem esta devendo, por que, e o que fazer agora.
// Conclusao primeiro. Todo o calculo vem de calcContasAtrasadas e recalcula ao
// vivo quando o usuario marca motivo, marca cobrado ou muda a config.
//
// A tela e navegavel: os KPIs do topo e as faixas de idade sao FILTROS
// clicaveis, ha busca por empresa, e cada linha de titulo expande com os
// detalhes. A lista de titulos vem logo abaixo do painel de numeros.

import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import {
  AlertTriangle,
  Phone,
  CheckCircle2,
  ChevronRight,
  Undo2,
  SlidersHorizontal,
  Search,
  X,
} from "lucide-react";
/* O GRAFICO DESCE SOZINHO, e so quando esta pagina monta. A `recharts` custa
   ~100 kB comprimidos por causa de UM grafico no fim da pagina -- ver
   components/CurvaDso.jsx. Importada aqui em cima, ela entrava na frente da
   tabela: quem abre esta tela quer ver quanto tem a receber, nao a curva. */
const CurvaDso = lazy(() => import("../components/CurvaDso.jsx"));
import { useApp } from "../config/store.jsx";
import { calcContasAtrasadas, agruparDividas } from "../lib/calc/contasAtrasadas.js";
import {
  carteiraDeCobranca, resumoDaCarteira, chaveCliente as chaveCob, SITUACOES, CANAIS,
  ordenarCarteira, filtrarCarteira, ORDENS,
} from "../lib/calc/cobrancas.js";
import { lerCobrancas, salvarChamado } from "../services/cobrancas.js";
import { Secao } from "../components/trocas.jsx";
import { moedaCheia, moeda, numero, dataLonga, dataCurta, rotuloMes, ymdLocal, MESES } from "../lib/format.js";
import { Selo, Avatar, Dinheiro, FaixaNumeros, LinhaLista } from "../components/lista.jsx";
import {
  Card,
  PageTitle,
  SectionTitle,
  BarRow,
  Segmented,
  Empty,
  CarregandoModulo,
  ErroModulo,
  BotaoPDF,
  CabecalhoImpressao,
  AvisoDadoParado,
} from "../components/ui.jsx";

/* UM CARTÃO POR CLIENTE QUE DEVE, com o que já foi tentado.
 *
 * A tela respondia "quem deve". Não respondia "o que eu já tentei com este" --
 * e é essa que trava a cobrança: ligar de novo sem saber que o cliente
 * prometeu pagar dia 20 queima a relação e o tempo. Aqui o histórico sai da
 * cabeça de quem ligou e vira registro, com quem falou e quando carimbados
 * pelo servidor.
 */
function CartaoCobranca({ c, aberto, aoAbrir, aoRegistrar, aoApagar, salvando, erro }) {
  const alerta = c.promessaVencida ? "bad" : c.semChamado ? "warn" : null;
  return (
    <div
      className={`rounded-xl border p-4 ${
        alerta === "bad" ? "border-bad-300 bg-bad-50"
        : alerta === "warn" ? "border-warn-200 bg-warn-50"
        : "border-slate-200 bg-white"
      }`}
    >
      <button type="button" onClick={() => aoAbrir(aberto ? null : c.chave)} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate font-medium text-slate-800">{c.cliente}</div>
            <div className="mt-0.5 text-xs text-slate-500">
              {numero(c.qtd)} {c.qtd === 1 ? "título" : "títulos"} · maior atraso {numero(c.maiorAtraso)} dias
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-xl font-semibold tabular-nums text-slate-800">{moeda(c.valor)}</div>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
          {c.promessaVencida && (
            <Selo tom="bad">prometeu {dataCurta(c.ultimo.promessa)} e não pagou</Selo>
          )}
          {c.semChamado && <Selo tom="warn">nunca chamado</Selo>}
          {!c.semChamado && !c.promessaVencida && c.situacaoRotulo && (
            <Selo tom={c.situacaoTom}>{c.situacaoRotulo}</Selo>
          )}
          {c.diasSemContato !== null && (
            <span className="text-slate-500">
              último contato há {numero(c.diasSemContato)} {c.diasSemContato === 1 ? "dia" : "dias"}
              {c.ultimo?.canal ? ` · ${c.ultimo.canal}` : ""}
            </span>
          )}
        </div>

        {c.ultimo?.resumo && !aberto && (
          <div className="mt-1.5 line-clamp-2 text-xs text-slate-600">“{c.ultimo.resumo}”</div>
        )}
      </button>

      {aberto && (
        <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
          {/* OS TÍTULOS EM ABERTO. Sem eles a ligação é cega: o cliente
              pergunta "qual nota?" e a resposta está em outra aba. Aqui já vem
              nota, O.S., vencimento e quanto atrasou. */}
          <div>
            <div className="mb-1 text-xs font-medium text-slate-600">
              {numero(c.qtd)} {c.qtd === 1 ? "título em aberto" : "títulos em aberto"}
            </div>
            <ol className="rounded-lg bg-white/70">
              {[...c.titulos].sort((a, b) => b.dias - a.dias).map((t) => (
                <li key={t.id} className="flex items-baseline gap-2 border-b border-slate-100 px-2 py-1.5 text-sm last:border-0">
                  <span className="w-28 shrink-0 text-xs text-slate-500">
                    {t.nf ? `NF ${t.nf}` : t.os ? `O.S. ${t.os}` : `#${t.id}`}
                  </span>
                  <span className="w-24 shrink-0 text-xs tabular-nums text-slate-500">
                    {t.vencimento ? dataLonga(t.vencimento) : "sem vencimento"}
                  </span>
                  <span className={`w-24 shrink-0 text-xs tabular-nums ${t.dias > 60 ? "text-bad-700" : "text-slate-500"}`}>
                    {t.dias > 0 ? `${numero(t.dias)} dias` : "a vencer"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-slate-400">
                    {[
                      t.pago > 0 && `de ${moeda(t.valorTitulo)} · ${moeda(t.pago)} já pago`,
                      t.cobrado && "já marcado como cobrado",
                      t.motivoId && t.motivoNome,
                    ].filter(Boolean).join(" · ")}
                  </span>
                  {/* NA TELA o corte do centavo ajuda a varrer; NO PAPEL que
                      vai ao cliente, R$ 7.001 em cima de um titulo de
                      R$ 7.000,50 mina a cobranca inteira. Dois spans, um por
                      midia. */}
                  <span className="sem-impressao shrink-0 tabular-nums text-slate-700">{moeda(t.valor)}</span>
                  <span className="apenas-impressao shrink-0 tabular-nums text-slate-700">{moedaCheia(t.valor)}</span>
                </li>
              ))}
            </ol>
          </div>

          <FormChamado cliente={c} aoSalvar={aoRegistrar} salvando={salvando} erro={erro} />
          {c.chamados.length > 0 && (
            <ol className="space-y-2">
              {c.chamados.map((ch) => (
                <li key={ch.id} className="flex gap-3 text-sm">
                  <span className="w-24 shrink-0 text-[11px] tabular-nums text-slate-400">
                    {ch.data ? dataLonga(ch.data) : "—"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-slate-700">
                      {ch.canal && <b>{ch.canal}</b>}
                      {ch.contato && ` com ${ch.contato}`}
                      {ch.resumo && ` — ${ch.resumo}`}
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      {SITUACOES.find((x) => x.id === ch.situacao)?.rotulo || ch.situacao}
                      {ch.promessa && ` · pagaria em ${dataLonga(ch.promessa)}`}
                      {ch.quemNome && ` · anotado por ${ch.quemNome}`}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => aoApagar(c, ch)}
                    className="shrink-0 self-start rounded p-1 text-slate-300 hover:bg-bad-50 hover:text-bad-600"
                    aria-label="Apagar este chamado"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

const CHAMADO_VAZIO = { data: "", canal: "Ligação", contato: "", resumo: "", situacao: "semResposta", promessa: "" };

/* O formulário de um chamado. `situacao` é escolha fechada de propósito: campo
   livre vira cinco jeitos de escrever "prometeu pagar" e aí não dá para
   filtrar nem contar. Só "Prometeu pagar" pede data. */
function FormChamado({ cliente, aoSalvar, salvando, erro }) {
  const [f, setF] = useState(() => ({ ...CHAMADO_VAZIO, data: ymdLocal(new Date()) }));
  const sit = SITUACOES.find((x) => x.id === f.situacao);
  return (
    <div className="grid gap-2 rounded-lg bg-white/70 p-3 sm:grid-cols-[9rem_9rem_1fr]">
      <input type="date" className="input" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} />
      <select className="input" value={f.canal} onChange={(e) => setF({ ...f, canal: e.target.value })}>
        {CANAIS.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <input
        className="input"
        placeholder="Com quem falou"
        value={f.contato}
        onChange={(e) => setF({ ...f, contato: e.target.value })}
      />
      <select
        className="input sm:col-span-2"
        value={f.situacao}
        onChange={(e) => setF({ ...f, situacao: e.target.value, promessa: "" })}
      >
        {SITUACOES.map((x) => <option key={x.id} value={x.id}>{x.rotulo}</option>)}
      </select>
      {sit?.pedeData ? (
        <input
          type="date"
          className="input"
          title="Data em que prometeu pagar"
          value={f.promessa}
          onChange={(e) => setF({ ...f, promessa: e.target.value })}
        />
      ) : <div className="hidden sm:block" />}
      <input
        className="input sm:col-span-3"
        placeholder="O que ficou combinado"
        value={f.resumo}
        onChange={(e) => setF({ ...f, resumo: e.target.value })}
      />
      <div className="sm:col-span-3">
        {/* O ERRO MORA AQUI, colado no botão -- não no topo da aba. A gravação
            falha no celular, na rua, com o formulário no meio de uma lista
            longa: o aviso lá em cima ficava fora do campo de visão, a pessoa
            achava que anotou a ligação e o registro se perdia calado. */}
        {erro && (
          <div className="mb-2 rounded-lg bg-bad-50 px-3 py-2 text-sm text-bad-700" role="alert">
            Não salvou: {erro} — o chamado ainda está aqui, tente de novo.
          </div>
        )}
        <button
          type="button"
          className="btn"
          disabled={salvando}
          onClick={() => aoSalvar(cliente, f, () => setF({ ...CHAMADO_VAZIO, data: ymdLocal(new Date()) }))}
        >
          Salvar chamado
        </button>
      </div>
    </div>
  );
}

// Cor de barra por grupo de causa.
function tomDoGrupo(grupo) {
  if (grupo === "interna") return "bad";
  if (grupo === "cliente") return "warn";
  if (grupo === "processo") return "brand";
  return "neutral";
}

const MARCA = "#3840E8";

// Normaliza para busca (sem acento, minusculo).
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export default function ContasAtrasadas() {
  const {
    config,
    dados,
    overridesRecebiveis,
    setOverrideRecebivel,
    pronto,
    erro,
    recarregar,
    frescorDe,
    fontesNegadas = [],
  } = useApp();

  // A fonte DESTA tela. Perguntar pelo minimo global carimbaria "de ontem" por
  // causa de `pagar`, que esta tela nem le.
  const atualizadoEm = frescorDe("contas-atrasadas");

  // Duas abas: a lista de cobrança (o trabalho) e a análise (a reunião).
  const [aba, setAba] = useState("lista");
  const [maisFiltros, setMaisFiltros] = useState(false);
  const [filtro, setFiltro] = useState("todos");
  const [diasMin, setDiasMin] = useState(30);
  const [busca, setBusca] = useState("");
  const [faixaSel, setFaixaSel] = useState(null); // {faixa, de, ate}
  const [expandido, setExpandido] = useState(null); // id do titulo aberto
  // Padrao = vencimento mais RECENTE: e o que acabou de vencer, onde a cobranca
  // ainda tem chance real de recuperar. O historico antigo continua a um clique
  // no seletor.
  const [ordem, setOrdem] = useState("recentes"); // valor | recentes | antigos | atraso
  const [venceDe, setVenceDe] = useState(""); // periodo de vencimento (YYYY-MM-DD)
  const [venceAte, setVenceAte] = useState("");
  // A tela abre em "Todos" para TODO MUNDO. Ja tentamos abrir na carteira de
  // quem entrou (lendo o vendedor da sessao) e foi pior: nenhuma conta tem
  // vendedor ligado, entao a pre-selecao nunca acontecia e so restava a
  // aparencia de defeito. Quem quiser a propria carteira escolhe no seletor.
  const [vendedorSel, setVendedorSel] = useState(""); // carteira de um vendedor
  const [anoSel, setAnoSel] = useState(""); // ano de vencimento (AAAA)
  const [mesSel, setMesSel] = useState(""); // mes de vencimento (01-12)
  const [visao, setVisao] = useState("mes"); // dash das dividas: ano | mes | cliente

  /* A CARTEIRA DE COBRANÇA. Carregada uma vez, à parte do cache do ERP: são as
     anotações da direção, não dado do Mubisys. */
  const [cobrancas, setCobrancas] = useState(null);
  const [clienteAberto, setClienteAberto] = useState(null);
  const [buscaCob, setBuscaCob] = useState("");
  const [ordemCob, setOrdemCob] = useState("acao");
  const [deCob, setDeCob] = useState("");
  const [ateCob, setAteCob] = useState("");
  const [salvandoChamado, setSalvandoChamado] = useState(false);
  const [avisoCob, setAvisoCob] = useState(null);
  /* PREFERÊNCIA DO DONO (23/08): em análise, todo quadro recolhe e a tela
     lembra a escolha. Chave por seção; default tudo aberto. */
  const [abertasAnaliseCA, setAbertasAnaliseCA] = useState(() => {
    const padrao = { ondeDivida: true, rankingDevedores: true, porQue: true, porMotivo: true,
                     idade: true, plano: true, cobrarHoje: true, dso: true };
    try {
      return { ...padrao, ...JSON.parse(localStorage.getItem("contas_analise_secoes") || "{}") };
    } catch {
      return padrao;
    }
  });
  const alternarAnaliseCA = useCallback((id) => {
    setAbertasAnaliseCA((a) => {
      const novo = { ...a, [id]: !a[id] };
      try { localStorage.setItem("contas_analise_secoes", JSON.stringify(novo)); } catch { /* aba anônima */ }
      return novo;
    });
  }, []);
  useEffect(() => {
    let vivo = true;
    lerCobrancas()
      .then((c) => vivo && setCobrancas(c))
      .catch((e) => vivo && setAvisoCob(e.message));
    return () => { vivo = false; };
  }, []);
  const titulosRef = useRef(null);

  const vm = useMemo(
    () =>
      dados
        ? calcContasAtrasadas(
            dados.recebiveis,
            overridesRecebiveis,
            config,
            dados.dsoHist,
            dados.ordens
          )
        : null,
    [dados, overridesRecebiveis, config]
  );

  // O vendedor de cada titulo vem do mapa das O.S., que e servido pelo modulo
  // Produtos. Quem nao tem esse modulo recebe 403 e a lista fica com TODOS os
  // titulos sem vendedor -- entao a tela avisa em vez de deixar parecer que
  // ninguem vendeu nada.
  const semVendedor = fontesNegadas.includes("ordens");

  // Pedir um periodo (ano ou intervalo de datas) e o gesto que revela a divida
  // antiga. So o mes nao basta: "junho" sem ano nao e um pedido pelo passado.
  const pediuPeriodo = !!anoSel || !!venceDe || !!venceAte;

  // Frase que descreve o recorte, para carimbar no PDF: sem isto o papel sai
  // sem dizer o que esta (e o que nao esta) na lista.
  const resumoFiltros = useMemo(() => {
    const p = [];
    if (filtro !== "todos") p.push({ pendentes: "so pendentes de cobranca", reincidentes: "so reincidentes", acima: `atraso acima de ${diasMin} dias`, aVencer: "vence nos proximos 7 dias" }[filtro] || filtro);
    if (anoSel) p.push(`ano ${anoSel}`);
    if (mesSel) p.push(`mes ${MESES[Number(mesSel) - 1]}`);
    if (venceDe || venceAte)
      p.push(`vencimento de ${venceDe ? dataCurta(venceDe) : "o inicio"} a ${venceAte ? dataCurta(venceAte) : "hoje"}`);
    if (vendedorSel) p.push(`vendedor ${vendedorSel}`);
    if (faixaSel) p.push(`idade ${faixaSel.faixa}`);
    if (busca) p.push(`busca "${busca}"`);
    return p.length ? p.join(" · ") : "todos os titulos em atraso";
  }, [filtro, diasMin, anoSel, mesSel, venceDe, venceAte, vendedorSel, faixaSel, busca]);

  const titulosFiltrados = useMemo(() => {
    if (!vm) return [];
    const min = Number(diasMin) || 0;
    const q = norm(busca.trim());
    /* O recorte "aVencer" troca a FONTE: são títulos ainda no prazo (não estão
       em vm.titulos). Ganham a forma da linha com o que têm -- sem motivo, sem
       cobrança, vencimento à frente -- e o selo diz "vence em N d". */
    if (filtro === "aVencer") {
      return (vm.aVencer?.lista || [])
        .filter((r) => (!q ? true : norm(`${r.cliente} ${r.cnpj || ""} ${r.nf || ""} ${r.os || ""}`).includes(q)))
        .map((r) => ({
          id: r.id,
          cliente: r.cliente,
          cnpj: r.cnpj || "",
          nf: r.nf || "",
          os: r.os || "",
          vencimento: r.vencimento || "",
          emissao: r.emissao || "",
          valor: r.valor || 0,
          dias: r.dias,
          diasAte: r.diasAte,
          aVencer: true,
          jaDeve: !!r.jaDeve,
          vendedores: [],
          vendedor: "",
          cobrado: false,
          reincidente: false,
          motivoId: null,
          motivoNome: "",
          grupoNome: "no prazo",
          proximaAcao: r.jaDeve
            ? "Ligar antes de vencer: este cliente já tem atraso em aberto."
            : "Lembrete amigável antes do vencimento.",
        }));
    }
    const filtrados = vm.titulos.filter((t) => {
      if (filtro === "pendentes" && t.cobrado) return false;
      if (filtro === "reincidentes" && !t.reincidente) return false;
      if (filtro === "acima" && t.dias < min) return false;
      if (faixaSel && (t.dias < faixaSel.de || t.dias > faixaSel.ate)) return false;
      // Periodo por data de vencimento (inclusivo). Titulo sem vencimento so
      // aparece quando nenhuma ponta do periodo esta preenchida.
      if (venceDe || venceAte) {
        if (!t.vencimento) return false;
        if (venceDe && t.vencimento < venceDe) return false;
        if (venceAte && t.vencimento > venceAte) return false;
      }
      if (vendedorSel && !t.vendedores.includes(vendedorSel)) return false;
      // Divida anterior ao corte (calote velho) fica fora da lista e dos totais
      // ate o gestor pedir aquele periodo de proposito -- por ano ou por data.
      if (t.antiga && !pediuPeriodo) return false;
      // Ano e mes de vencimento: atalhos rapidos que somam ao periodo livre.
      if (anoSel && (t.vencimento || "").slice(0, 4) !== anoSel) return false;
      if (mesSel && (t.vencimento || "").slice(5, 7) !== mesSel) return false;
      if (q) {
        const alvo = norm(`${t.cliente} ${t.cnpj} ${t.nf} ${t.os} ${t.vendedor}`);
        if (!alvo.includes(q)) return false;
      }
      return true;
    });
    // "recentes/antigos" = por vencimento; vazio vai sempre para o fim.
    const porVenc = (dir) => (a, b) => {
      if (!a.vencimento) return 1;
      if (!b.vencimento) return -1;
      return dir * a.vencimento.localeCompare(b.vencimento);
    };
    const ordenadores = {
      valor: (a, b) => b.valor - a.valor,
      recentes: porVenc(-1),
      antigos: porVenc(1),
      atraso: (a, b) => b.dias - a.dias,
    };
    return [...filtrados].sort(ordenadores[ordem] || ordenadores.valor);
  }, [
    vm,
    filtro,
    diasMin,
    busca,
    faixaSel,
    ordem,
    venceDe,
    venceAte,
    vendedorSel,
    anoSel,
    mesSel,
    pediuPeriodo,
  ]);

  // Dash das dividas: sempre sobre a lista JA filtrada, para responder sobre o
  // que o gestor esta olhando (e nao sobre um total que nao esta na tela).
  const dividas = useMemo(() => agruparDividas(titulosFiltrados), [titulosFiltrados]);

  /* A CARTEIRA usa todos os atrasados SEM filtro de tela -- cobrar é percorrer
     a dívida cliente a cliente, e um filtro ligado na aba ao lado esconderia
     gente que precisa de ligação sem dizer que escondeu.

     MAS o corte da dívida antiga (dataCorteAtrasados) NÃO é filtro de tela: é a
     decisão da direção de tirar o calote de 2021-22 dos números. A carteira o
     ignorava e contradizia a aba ao lado -- o cartão mandava "ligue hoje" para
     dívida que a direção cortou, o contador da aba não fechava com a lista, e
     os três números do topo inflavam. Mesma régua nas duas abas. */
  const carteira = useMemo(
    () => (vm ? carteiraDeCobranca(vm.titulos.filter((t) => !t.antiga), cobrancas || {}, ymdLocal(new Date())) : []),
    [vm, cobrancas],
  );
  /* RECORTE E ORDEM, nesta ordem: filtrar antes de ordenar, porque o filtro de
     data RECONTA valor e atraso de cada cartão -- ordenar antes poria a lista
     em ordem de números que o recorte vai mudar. */
  const carteiraVista = useMemo(
    () => ordenarCarteira(filtrarCarteira(carteira, { termo: buscaCob, de: deCob, ate: ateCob }), ordemCob),
    [carteira, buscaCob, deCob, ateCob, ordemCob],
  );
  /* Os números do topo seguem o RECORTE, não a carteira inteira: um resumo que
     ignora o filtro faz a soma da tela não fechar com a lista embaixo dela. */
  const resumoCob = useMemo(() => resumoDaCarteira(carteiraVista), [carteiraVista]);

  /* MARCAR COBRADO ECOA NO DIÁRIO. A lista dizia "cobrado em 20/08" e o
     cartão da Cobrança, do mesmo cliente, dizia "nunca foi chamado · a
     cobrança nem começou" -- duas abas se contradizendo sobre o mesmo fato. O
     eco é um chamado mínimo (data + texto padrão); se a gravação do diário
     falhar, a marcação da lista FICA (é o gesto principal) e o aviso aparece.
     Desmarcar não apaga o chamado: a ligação aconteceu; desfazer a marcação
     não desfaz a conversa. */
  const marcarCobrado = useCallback(async (t) => {
    setOverrideRecebivel(t.id, { cobrado: true, cobradoEm: ymdLocal(new Date()) });
    try {
      const id = `ch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setCobrancas(await salvarChamado(chaveCob(t.cliente), {
        cliente: t.cliente,
        chamadoId: id,
        chamado: {
          data: ymdLocal(new Date()),
          canal: "Ligação",
          contato: "",
          resumo: `Marcado como cobrado na lista (título ${t.documento || t.id})`,
          situacao: "semResposta",
          promessa: "",
        },
      }));
    } catch (e) {
      setAvisoCob(`Marquei como cobrado, mas não consegui anotar no diário de cobrança: ${e.message}`);
    }
  }, [setOverrideRecebivel]);

  const registrarChamado = useCallback(async (c, form, limpar) => {
    setAvisoCob(null);
    setSalvandoChamado(true);
    try {
      const id = `ch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      /* O pacote que o SERVIDOR devolve vira o novo estado -- nunca o objeto
         montado aqui. Duas abas anotando ligações do mesmo dia não se apagam. */
      setCobrancas(await salvarChamado(chaveCob(c.cliente), {
        cliente: c.cliente,
        chamadoId: id,
        chamado: {
          data: form.data || ymdLocal(new Date()),
          canal: form.canal,
          contato: String(form.contato || "").trim().slice(0, 120),
          resumo: String(form.resumo || "").trim().slice(0, 500),
          situacao: form.situacao,
          promessa: form.situacao === "prometeu" ? form.promessa : "",
        },
      }));
      limpar?.();
    } catch (e) {
      setAvisoCob(e.message);
    } finally {
      setSalvandoChamado(false);
    }
  }, []);

  const apagarChamado = useCallback(async (c, ch) => {
    if (!window.confirm("Apagar este chamado do histórico?")) return;
    setAvisoCob(null);
    try {
      setCobrancas(await salvarChamado(chaveCob(c.cliente), {
        cliente: c.cliente, chamadoId: ch.id, chamado: null,
      }));
    } catch (e) {
      setAvisoCob(e.message);
    }
  }, []);

  // Anos disponiveis (dos titulos, nao inventados), para o seletor.
  const anosDisponiveis = useMemo(() => {
    if (!vm) return [];
    return [...new Set(vm.titulos.map((t) => (t.vencimento || "").slice(0, 4)).filter(Boolean))].sort(
      (a, b) => b.localeCompare(a)
    );
  }, [vm]);

  /* Opcoes do seletor de vendedor. "Nao localizado" fica de fora da lista: nao e
     pessoa, e o titulo cuja O.S. nao casou com nenhuma venda.

     FICA ACIMA DOS RETURNS DE ERRO/CARREGANDO de proposito. Hook depois de um
     return so roda em ALGUNS renders, e React conta hooks por posicao: na
     primeira passagem (carregando) sao N, quando os dados chegam viram N+1 e o
     React derruba a tela inteira com "Rendered more hooks than during the
     previous render". Por isso o `vm?.` — aqui `vm` ainda pode ser null. */
  const opcoesVendedor = useMemo(
    () => (vm?.porVendedor || []).filter((v) => v.nome && v.nome !== "Nao localizado"),
    [vm]
  );

  if (erro) return <ErroModulo mensagem={erro} aoTentar={recarregar} />;
  if (!pronto || !vm) return <CarregandoModulo />;

  const k = vm.kpis;
  const tomDso = k.dso <= k.dsoMeta ? "ok" : k.dso <= k.dsoAlerta ? "warn" : "bad";

  const temFiltro =
    filtro !== "todos" ||
    !!busca ||
    !!faixaSel ||
    !!venceDe ||
    !!venceAte ||
    !!vendedorSel ||
    !!anoSel ||
    !!mesSel;
  const limparTudo = () => {
    setFiltro("todos");
    setBusca("");
    setFaixaSel(null);
    setVenceDe("");
    setVenceAte("");
    setVendedorSel("");
    setAnoSel("");
    setMesSel("");
  };
  /* Volta para a aba da lista ANTES de rolar: os cliques da Análise ("ver na
     lista", ranking, plano, idade) chamavam isto com o Card da lista
     desmontado -- o ref era null, o scroll era um no-op e o filtro ficava
     armado em silêncio para a próxima visita. O setTimeout dá o quadro que o
     React precisa para montar o Card. */
  const irParaTitulos = () => {
    setAba("lista");
    setTimeout(() => titulosRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };

  // Clique num KPI liga/desliga o filtro correspondente e leva para a lista.
  // Limpa busca e faixa para o KPI ser um filtro previsivel (senao o clique
  // podia cair num "0 titulos" por causa de um filtro anterior ainda ligado).
  const alternarFiltro = (novo) => {
    setFiltro((f) => (f === novo ? "todos" : novo));
    setFaixaSel(null);
    setBusca("");
    irParaTitulos();
  };
  const somaFiltrada = titulosFiltrados.reduce((s, t) => s + t.valor, 0);

  return (
    <div className="space-y-8">
      <PageTitle
        titulo="Contas Atrasadas"
        descricao="Quem está devendo, e o que fazer agora."
      />

      <AvisoDadoParado atualizadoEm={atualizadoEm} />

      {semVendedor && (
        <p className="flex items-start gap-2 rounded-lg bg-warn-50 px-3 py-2 text-sm text-warn-700">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          O vendedor de cada título vem do módulo Produtos, que não esta liberado para você --
          por isso a coluna de vendedor aparece vazia. Os valores e as datas estão corretos.
        </p>
      )}

      {/* A LISTA VEM PRIMEIRO. Antes eram cinco cartões de 130px cada: no
          celular davam ~430px, e o CEO rolava meia tela antes de ver o primeiro
          título. Agora são quatro células divididas por fio, cada uma
          recortando a lista -- o mesmo desenho de Orçamentos. DSO e maior
          atraso desceram para a aba Análise: são leitura de reunião, não de
          cobrança. */}
      <div className="sem-impressao">
        <Segmented
          opcoes={[
            { valor: "lista", rotulo: `A cobrar (${numero(k.qtd)})` },
            { valor: "cobranca", rotulo: `Cobrança (${numero(carteira.length)})` },
            { valor: "analise", rotulo: "Análise" },
          ]}
          valor={aba}
          onChange={setAba}
        />
      </div>

      {aba === "lista" && (
        <div className="sem-impressao">
          <FaixaNumeros
            // "Total atrasado" só acende quando NADA está filtrado: com a
            // carteira de um vendedor ligada, a célula acesa afirmava um
            // recorte que não era o da tela.
            ativo={filtro !== "todos" ? filtro : temFiltro ? null : "todos"}
            aoEscolher={(id) => {
              if (id === "todos") {
                limparTudo();
              } else if (id === "aVencer") {
                // Vira recorte da própria lista: mandava para a Análise, onde
                // não existe nada sobre a semana -- no celular a informação
                // não estava em lugar NENHUM.
                limparTudo();
                setFiltro("aVencer");
              } else {
                alternarFiltro(id);
              }
              irParaTitulos();
            }}
            celulas={[
              {
                id: "todos",
                rotulo: "Total atrasado",
                valor: moeda(k.totalAtrasado),
                sub: `${numero(k.qtd)} títulos em aberto · maior atraso ${numero(k.maiorAtrasoDias)} dias`,
                curto: `${numero(k.qtd)} títulos · maior ${numero(k.maiorAtrasoDias)}d`,
              },
              {
                id: "pendentes",
                rotulo: "Pendentes de cobrança",
                valor: numero(k.pendentesQtd),
                sub: `${moeda(k.pendentesValor)} sem ninguém ter falado com o cliente`,
                curto: moeda(k.pendentesValor),
                cor: k.pendentesQtd ? "text-warn-700" : undefined,
              },
              {
                id: "reincidentes",
                rotulo: "Reincidentes",
                valor: numero(k.reincidentesQtd),
                sub: `${moeda(k.reincidentesValor)} de quem já atrasou antes`,
                curto: moeda(k.reincidentesValor),
                cor: k.reincidentesQtd ? "text-bad-700" : undefined,
              },
              {
                id: "aVencer",
                rotulo: "Vence em 7 dias",
                valor: numero(vm.aVencer?.qtd || 0),
                sub: `${moeda(vm.aVencer?.valor || 0)} · ${numero(vm.aVencer?.deQuemJaDeve || 0)} de quem já deve`,
                curto: `${moeda(vm.aVencer?.valor || 0)} · ${numero(vm.aVencer?.deQuemJaDeve || 0)} já devem`,
              },
            ]}
          />
        </div>
      )}

      {/* Titulos: logo abaixo do painel de numeros */}
      {aba === "lista" && (
      <Card ref={titulosRef}>
        <CabecalhoImpressao
          atualizadoEm={atualizadoEm}
          titulo="Impresilk - Contas a receber em atraso"
          linhas={[
            `Emitido em ${dataLonga(ymdLocal(new Date()))} · ${numero(titulosFiltrados.length)} titulos · ${moedaCheia(somaFiltrada)}`,
            `Recorte: ${resumoFiltros}${
              vm.antigas.qtd > 0 && !pediuPeriodo
                ? ` · nao inclui ${numero(vm.antigas.qtd)} titulos anteriores a ${dataLonga(vm.antigas.corte)} (${moeda(vm.antigas.valor)})`
                : ""
            }`,
          ]}
        />

        {/* No celular este cabeçalho eram 250px repetindo o que a aba e os
            números já dizem, e empurrava a lista para fora da tela. */}
        <div className="hidden sm:block">
          <SectionTitle
            className="sem-impressao"
            titulo="Títulos"
            sub="Toque na linha para ver a ficha. Marque o que já foi cobrado e diga por que atrasou."
            acao={<BotaoPDF titulo="Gera um PDF com exatamente o recorte que esta na tela" />}
          />
        </div>

        {/* Barra de busca e filtros, em dois niveis.
            NIVEL 1: buscar e ordenar -- o que se usa a toda hora, com a busca
            dominando a largura (ela e a acao principal).
            NIVEL 2: recortes (quando/quem), agrupados numa faixa propria para
            nao competirem com a busca. Filtro ligado acende em indigo. */}
        <div className="sem-impressao mb-4 space-y-2.5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[240px] flex-1">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar empresa, CNPJ, NF, OS ou vendedor"
                className={`input pl-9 ${busca ? "border-brand-300 bg-brand-50/40" : ""}`}
                aria-label="Buscar empresa"
              />
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <label className="label-filtro sr-only sm:not-sr-only" htmlFor="ordem-titulos">
                Ordenar por
              </label>
              <select
                id="ordem-titulos"
                value={ordem}
                onChange={(e) => setOrdem(e.target.value)}
                className={`filtro font-display ${ordem !== "recentes" ? "filtro-ativo" : ""}`}
              >
                <option value="valor">Maior valor</option>
                <option value="recentes">Vencimento mais recente</option>
                <option value="antigos">Vencimento mais antigo</option>
                <option value="atraso">Maior atraso</option>
              </select>
            </div>
          </div>

          {/* A FAIXA "Vence nos próximos 7 dias" SAIU DAQUI: o quarto cartão
              lá em cima já diz o mesmo número, o mesmo valor e o mesmo "3 de
              quem já deve". Era a mesma informação duas vezes, e a segunda
              empurrava a lista para baixo da dobra -- numa tela que existe para
              percorrer títulos. */}

          {/* A CARTEIRA DE CADA VENDEDOR, A UM CLIQUE.
              O filtro por vendedor já existia — dentro de um seletor, escondido
              atrás de outro filtro. Cobrar é conversa por pessoa ("Barbara, o
              que travou nesses três?"), e para isso o caminho tem de ser um
              clique, não abrir uma lista e procurar. O valor vem junto porque é
              ele que decide por quem começar, não a quantidade. */}
          {opcoesVendedor.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setVendedorSel("")}
                aria-pressed={!vendedorSel}
                className={`h-9 whitespace-nowrap rounded-full border px-3.5 font-display text-sm font-medium transition-all ${
                  !vendedorSel
                    ? "border-brand bg-brand text-white"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                Todos
              </button>
              {/* A SOMA DOS CHIPS PASSA DO TOTAL, e agora a tela diz por quê:
                  título que cita várias O.S. entra na carteira de cada
                  vendedor envolvido. O comentário do cálculo já prometia que
                  "o rótulo na tela avisa" -- não avisava, e sobravam R$ 3 mil
                  sem explicação entre dois números vizinhos. */}
              {opcoesVendedor.map((v) => {
                const aberto = vendedorSel === v.nome;
                return (
                  <button
                    key={v.nome}
                    type="button"
                    // Clicar de novo no mesmo tira o filtro: sem isso a saída é
                    // procurar o "Todos", e a pessoa acha que travou.
                    onClick={() => setVendedorSel(aberto ? "" : v.nome)}
                    aria-pressed={aberto}
                    title={`${v.qtd ?? 0} título(s) atrasado(s) — ${moeda(v.valor)}`}
                    className={`h-9 whitespace-nowrap rounded-full border px-3.5 font-display text-sm font-medium transition-all ${
                      aberto
                        ? "border-brand bg-brand text-white"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {v.nome}
                    <span className={`ml-1.5 font-normal ${aberto ? "text-white/80" : "text-slate-400"}`}>
                      {moeda(v.valor)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {/* A SOMA DOS CHIPS PASSA DO TOTAL, e agora a tela diz por quê: um
              título que cita O.S. de dois vendedores entra na carteira dos
              dois. O comentário do cálculo já prometia que "o rótulo na tela
              avisa" — não avisava, e sobravam milhares de reais sem explicação
              entre dois números vizinhos. Só aparece quando sobra de verdade:
              frase fixa vira ruído. */}
          {opcoesVendedor.length > 0 && (() => {
            const somaChips = opcoesVendedor.reduce((t, v) => t + (v.valor || 0), 0);
            const sobra = Math.round((somaChips - (k.totalAtrasado || 0)) * 100) / 100;
            return sobra > 1 ? (
              <p className="mt-1.5 text-xs text-slate-400">
                As carteiras somam {moeda(sobra)} a mais que o total: título que cita O.S. de mais de um
                vendedor entra na carteira de cada um.
              </p>
            ) : null;
          })()}

          {/* No celular a caixa de recortes custava 280px ANTES da primeira
              linha -- e é o que menos se usa com o telefone na mão. Ela vira um
              botão; no computador continua aberta. */}
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setMaisFiltros((v) => !v)}
            aria-expanded={maisFiltros}
          >
            <SlidersHorizontal size={15} strokeWidth={2.4} />
            {maisFiltros ? "Esconder filtros" : "Filtros"}
            {temFiltro && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-brand" />}
          </button>

          {/* A CAIXA CINZA RECOLHE TAMBÉM NO COMPUTADOR. Ela era `sm:flex` --
              escondia no celular e ficava SEMPRE aberta no desktop, que é onde
              a cobrança acontece. Somadas à busca, à faixa de vencimento e aos
              chips de vendedor, eram seis faixas de controle antes do primeiro
              título. Quem cobra abre a tela para ver a LISTA. */}
          <div
            className={`${maisFiltros ? "flex" : "hidden"} w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-slate-50/70 px-3 py-2.5`}
            style={{ borderColor: "var(--hairline)" }}
          >
            {/* "Todos", "Pendentes" e "Reincidentes" saíram daqui: são os
                mesmos recortes dos quatro números lá em cima, e a mesma escolha
                duas vezes na tela é trabalho a mais. Sobrou o corte por tempo,
                que os números não dão. */}
            <button
              type="button"
              onClick={() => setFiltro(filtro === "acima" ? "todos" : "acima")}
              aria-pressed={filtro === "acima"}
              className={`h-9 whitespace-nowrap rounded-lg border px-3 font-display text-sm font-medium transition-all ${
                filtro === "acima"
                  ? "border-brand-300 bg-brand-50 text-brand-700"
                  : "border-transparent text-slate-500 hover:bg-white hover:text-slate-800"
              }`}
            >
              Acima de {diasMin} dias
            </button>

            <span className="hidden h-5 w-px bg-slate-200 sm:block" aria-hidden="true" />

            {/* QUANDO venceu */}
            <div className="flex items-center gap-2">
              <label className="label-filtro" htmlFor="ano-titulos">
                Ano
              </label>
              <select
                id="ano-titulos"
                value={anoSel}
                onChange={(e) => setAnoSel(e.target.value)}
                className={`filtro ${anoSel ? "filtro-ativo" : ""}`}
              >
                <option value="">Todos</option>
                {anosDisponiveis.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>

              <label className="label-filtro ml-1" htmlFor="mes-titulos">
                Mês
              </label>
              <select
                id="mes-titulos"
                value={mesSel}
                onChange={(e) => setMesSel(e.target.value)}
                className={`filtro ${mesSel ? "filtro-ativo" : ""}`}
              >
                <option value="">Todos</option>
                {MESES.map((m, i) => (
                  <option key={m} value={String(i + 1).padStart(2, "0")}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <span className="hidden h-5 w-px bg-slate-200 sm:block" aria-hidden="true" />

            {/* Os dois campos de data + o rótulo somam 454px numa tela de 390:
                era a página inteira rolando de lado. Com flex-wrap eles descem
                para a linha seguinte no celular e continuam lado a lado no
                computador. */}
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <label className="label-filtro" htmlFor="vence-de">
                Vencimento entre
              </label>
              <input
                id="vence-de"
                type="date"
                value={venceDe}
                onChange={(e) => setVenceDe(e.target.value)}
                className={`filtro ${venceDe ? "filtro-ativo" : ""}`}
                aria-label="Vencimento a partir de"
              />
              <span className="text-xs text-slate-400">e</span>
              <input
                type="date"
                value={venceAte}
                onChange={(e) => setVenceAte(e.target.value)}
                className={`filtro ${venceAte ? "filtro-ativo" : ""}`}
                aria-label="Vencimento até"
              />
            </div>

            {/* O SELETOR DE VENDEDOR SAIU DAQUI: os chips logo acima já fazem
                a mesma escolha, e melhor -- mostram o valor de cada carteira,
                que é o que decide por quem começar. Duas formas do mesmo filtro
                na mesma tela é a pessoa tendo de descobrir se são a mesma
                coisa. */}

            {filtro === "acima" && (
              <>
                <span className="hidden h-5 w-px bg-slate-200 sm:block" aria-hidden="true" />
                <div className="flex items-center gap-2">
                  <label className="label-filtro">Atraso a partir de</label>
                  <input
                    type="number"
                    min={1}
                    value={diasMin}
                    onChange={(e) => setDiasMin(e.target.value)}
                    className="filtro w-16"
                  />
                  <span className="text-xs text-slate-400">dias</span>
                </div>
              </>
            )}

            {temFiltro && (
              <button
                className="ml-auto inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 font-display text-sm font-medium text-slate-500 transition-colors hover:bg-white hover:text-slate-800"
                onClick={limparTudo}
              >
                <X size={14} /> Limpar
              </button>
            )}
          </div>
        </div>

        {/* Resumo do que esta na tela (no papel isto ja esta no cabecalho). */}
        <div className="sem-impressao mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <span>
            Mostrando <strong className="tnum text-slate-900">{numero(titulosFiltrados.length)}</strong>{" "}
            de {numero(pediuPeriodo ? vm.titulos.length : vm.qtdAtivos)} títulos
            {titulosFiltrados.length > 0 && (
              <>
                {" "}
                · <strong className="tnum text-slate-900">{moeda(somaFiltrada)}</strong>
              </>
            )}
          </span>
          {/* OS FILTROS LIGADOS SE ANUNCIAM AQUI, e num lugar só. Com a caixa
              cinza recolhida no computador, um filtro ativo ficaria invisível --
              a tela mostrando 12 de 115 títulos sem dizer por quê. Cada um sai
              com o X que o desliga. */}
          {filtro === "acima" && (
            <button className="chip-warn" onClick={() => setFiltro("todos")}>
              acima de {diasMin} dias <X size={12} />
            </button>
          )}
          {anoSel && (
            <button className="chip-warn" onClick={() => setAnoSel("")}>
              ano: {anoSel} <X size={12} />
            </button>
          )}
          {mesSel && (
            <button className="chip-warn" onClick={() => setMesSel("")}>
              mês: {MESES[Number(mesSel) - 1]} <X size={12} />
            </button>
          )}
          {vendedorSel && (
            <button className="chip-warn" onClick={() => setVendedorSel("")}>
              vendedor: {vendedorSel} <X size={12} />
            </button>
          )}
          {faixaSel && (
            <button className="chip-warn" onClick={() => setFaixaSel(null)}>
              idade: {faixaSel.faixa} <X size={12} />
            </button>
          )}
          {(venceDe || venceAte) && (
            <button
              className="chip-warn"
              onClick={() => {
                setVenceDe("");
                setVenceAte("");
              }}
            >
              vencimento: {venceDe ? dataCurta(venceDe) : "início"} a{" "}
              {venceAte ? dataCurta(venceAte) : "hoje"} <X size={12} />
            </button>
          )}

          {/* Dinheiro que existe mas esta fora dos numeros: dito em voz alta e
              a um clique de distancia. Esconder sem avisar seria mentir. */}
          {vm.antigas.qtd > 0 &&
            (pediuPeriodo ? (
              <span className="chip-warn">
                incluindo divida de {vm.antigas.anos.join(", ")} (fora do total do painel)
              </span>
            ) : (
              <button
                className="chip"
                onClick={() => setAnoSel(vm.antigas.anos[vm.antigas.anos.length - 1])}
                title={`Ver a divida de ${vm.antigas.anos.join(", ")}`}
              >
                + {numero(vm.antigas.qtd)} títulos antigos ({moeda(vm.antigas.valor)}) fora da soma
              </button>
            ))}
        </div>

        {titulosFiltrados.length ? (
          /* UMA LINHA POR TÍTULO, sem tabela. A tabela tinha min-w-[760px]
             dentro de um overflow-x: no celular do CEO era preciso arrastar de
             lado para alcançar o motivo e o botão de cobrado -- justamente as
             duas coisas que a tela pede para fazer. Mesma anatomia da tela de
             Orçamentos: título e sub, um selo, quem vendeu, o tempo, o dinheiro
             e as ações na própria linha. */
          <div className="-mx-5 print:mx-0 sm:-mx-6">
            {titulosFiltrados.map((t) => {
              const aberto = expandido === t.id;
              const tom = t.dias >= 90 ? "bad" : t.dias >= 30 ? "warn" : "neutral";
              return (
                <LinhaLista key={t.id} tom={t.cobrado ? "ok" : tom}>
                  <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_140px_120px_92px_150px_132px] xl:items-center xl:gap-3">
                    <button
                      className="block w-full min-w-0 text-left"
                      onClick={() => setExpandido(aberto ? null : t.id)}
                      aria-expanded={aberto}
                    >
                      <p className="truncate font-display text-[15px] font-semibold leading-tight text-slate-900">
                        {t.cliente}
                      </p>
                      <p className="truncate text-sm text-slate-500">
                        NF {t.nf || "—"} · OS {t.os || "—"}
                        {t.vencimento ? ` · venceu em ${dataLonga(t.vencimento)}` : ""}
                      </p>
                    </button>

                    <div className="mt-2 flex flex-wrap items-center gap-2 xl:mt-0 xl:block">
                      {t.aVencer ? (
                        <Selo tom={t.jaDeve ? "warn" : "brand"}>
                          {t.diasAte === 0 ? "Vence hoje" : `Vence em ${t.diasAte} d`}
                          {t.jaDeve ? " · já deve" : ""}
                        </Selo>
                      ) : t.cobrado ? (
                        <Selo tom="ok">
                          {t.cobradoHa == null
                            ? "Cobrado"
                            : t.cobradoHa === 0
                              ? "Cobrado hoje"
                              : `Cobrado há ${t.cobradoHa}d`}
                        </Selo>
                      ) : (
                        <Selo tom={tom}>{t.reincidente ? "Reincidente" : "A cobrar"}</Selo>
                      )}
                      <span className="text-xs text-slate-500 xl:hidden">
                        {t.vendedor || "sem vendedor"} · {numero(t.dias)} {t.dias === 1 ? "dia" : "dias"}
                      </span>
                    </div>

                    <div className="hidden xl:block">
                      {t.vendedor ? (
                        <button
                          type="button"
                          className="flex items-center gap-2 text-sm text-slate-600"
                          onClick={() =>
                            setVendedorSel(vendedorSel === t.vendedores[0] ? "" : t.vendedores[0])
                          }
                          title={`Ver só os títulos de ${t.vendedor}`}
                        >
                          <Avatar nome={t.vendedor} />
                          <span className="truncate">{t.vendedor.split(" ")[0]}</span>
                        </button>
                      ) : (
                        <span className="text-sm text-slate-400">—</span>
                      )}
                    </div>

                    <p
                      className={`hidden text-right text-sm tabular-nums xl:block ${
                        t.dias >= 90 ? "text-bad-700" : t.dias >= 30 ? "text-warn-700" : "text-slate-500"
                      }`}
                    >
                      {t.aVencer ? `em ${numero(t.diasAte)} d` : `${numero(t.dias)} ${t.dias === 1 ? "dia" : "dias"}`}
                    </p>

                    <div className="mt-2 xl:mt-0">
                      <Dinheiro
                        valor={t.valor}
                        formatar={numero}
                        /* "sem motivo" SÓ quando o título já foi cobrado. Antes
                           saía embaixo de TODO valor, e como quase nenhum tem
                           motivo classificado, era a mesma frase cinza repetida
                           115 vezes -- ruído que treina o olho a pular a linha
                           inteira. Em quem já foi cobrado ela é acusação útil:
                           falou-se com o cliente e não se anotou por quê. */
                        /* PAGAMENTO PARCIAL À VISTA. Um título de R$ 28.000
                           com R$ 21.000 pagos vale R$ 7.000 -- e ligar pedindo
                           28 mil é o pior erro que esta tela pode cometer.
                           Mostrar a conta é o que deixa a pessoa conferir com o
                           cliente sem abrir o ERP. */
                        abaixo={
                          t.pago > 0 ? (
                            <span className="text-ok-700">
                              de {moeda(t.valorTitulo)} · {moeda(t.pago)} já pago
                            </span>
                          )
                          : t.motivoId ? t.motivoNome
                          : t.cobrado ? <span className="text-warn-700">cobrado, sem motivo</span>
                          : null
                        }
                      />
                    </div>

                    <div className="sem-impressao mt-2.5 grid grid-cols-2 gap-2 xl:mt-0 xl:flex xl:justify-end">
                      {t.cobrado ? (
                        <button
                          className="btn-outline min-h-[44px] justify-center xl:min-h-[40px] xl:!px-2.5"
                          onClick={() => setOverrideRecebivel(t.id, { cobrado: false, cobradoEm: "" })}
                          title="Desmarcar a cobrança"
                        >
                          <Undo2 size={15} strokeWidth={2.4} />
                          <span className="xl:hidden">Desfazer</span>
                        </button>
                      ) : (
                        <button
                          className="btn-outline min-h-[44px] justify-center !border-ok-200 !text-ok-700 xl:min-h-[40px] xl:!px-2.5"
                          onClick={() => marcarCobrado(t)}
                          title="Marcar como cobrado (anota no diário de cobrança também)"
                        >
                          <CheckCircle2 size={15} strokeWidth={2.4} />
                          <span className="xl:hidden">Cobrado</span>
                        </button>
                      )}
                      <button
                        className={`btn-outline min-h-[44px] justify-center xl:min-h-[40px] xl:!px-2.5 ${
                          aberto ? "!border-brand !text-brand" : ""
                        }`}
                        onClick={() => setExpandido(aberto ? null : t.id)}
                        title="Ver a ficha do título"
                      >
                        <ChevronRight
                          size={15}
                          strokeWidth={2.4}
                          className={`transition-transform ${aberto ? "rotate-90" : ""}`}
                        />
                        <span className="xl:hidden">Ficha</span>
                      </button>
                    </div>
                  </div>

                  {/* No papel o botão some; sobra o que interessa a quem cobra
                      com a lista na mão: já falei com este cliente ou não? */}
                  <span className="apenas-impressao text-xs">
                    {[t.vendedor && `vendedor: ${t.vendedor}`, t.cobrado ? "já cobrado" : "a cobrar", t.motivoNome]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>

                  {aberto && (
                    <div className="mt-3 rounded-xl bg-slate-50 p-3">
                      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
                        <Detalhe rotulo="CNPJ / CPF" valor={t.cnpj || "não informado"} />
                        <Detalhe rotulo="Nota fiscal" valor={t.nf || "sem NF"} />
                        <Detalhe rotulo="Ordem de serviço" valor={t.os || "sem OS"} />
                        <Detalhe
                          rotulo={t.vendedores.length > 1 ? "Vendedores" : "Vendedor"}
                          valor={t.vendedor || "não localizado (OS de outro ano)"}
                        />
                        <Detalhe rotulo="Emissão" valor={t.emissao ? dataLonga(t.emissao) : "não informada"} />
                        <Detalhe
                          rotulo="Vencimento"
                          valor={t.vencimento ? dataLonga(t.vencimento) : "não informado"}
                        />
                        <Detalhe rotulo="Atraso" valor={`${numero(t.dias)} dias`} />
                        <Detalhe rotulo="Classificação" valor={t.grupoNome} />
                      </dl>

                      <div className="sem-impressao mt-3 border-t pt-3" style={{ borderColor: "var(--hairline)" }}>
                        <label className="label mb-1 block" htmlFor={`m-${t.id}`}>
                          Por que está atrasado?
                        </label>
                        <select
                          id={`m-${t.id}`}
                          className="input w-auto"
                          value={t.motivoId || ""}
                          onChange={(e) => setOverrideRecebivel(t.id, { motivoId: e.target.value || null })}
                        >
                          <option value="">Sem motivo</option>
                          {(config.motivosAtraso || []).map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.nome}
                            </option>
                          ))}
                        </select>
                        <p className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                          <Phone size={14} strokeWidth={2.2} className="text-brand" />
                          {t.proximaAcao}
                        </p>
                      </div>
                    </div>
                  )}
                </LinhaLista>
              );
            })}
          </div>
        ) : (
          <Empty>
            Nenhum título neste filtro.
            {temFiltro && (
              <button className="btn-ghost ml-2" onClick={limparTudo}>
                Limpar filtros
              </button>
            )}
          </Empty>
        )}
      </Card>
      )}

      {/* A ANÁLISE INTEIRA ATRÁS DE UMA ABA. Eram sete blocos (onde está a
          dívida, ranking, motivos, padrões, idade, plano, cobrar hoje, DSO)
          empilhados embaixo da lista: leitura de reunião ocupando a tela de
          quem está cobrando. Nada foi apagado -- mudou de lugar. */}
      {/* ------------------------------------------------------- COBRANÇA */}
      {aba === "cobranca" && (
        <div className="space-y-4 sem-impressao">
          {avisoCob && (
            <Card className="text-sm text-bad-700">{avisoCob}</Card>
          )}

          {/* Os QUATRO números que mudam o que se faz agora -- e que SOMAM o
              total da carteira. Eram três, e quem estava "negociando" ou
              "contestou" não aparecia em nenhum: o CEO somava de cabeça e não
              fechava, sem saber que a diferença tinha nome. */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4">
              <div className="text-xs text-slate-500">Prometeram e não pagaram</div>
              <div className={`mt-1 text-2xl font-semibold tabular-nums ${resumoCob.quebradas ? "text-bad-700" : "text-slate-800"}`}>
                {moeda(resumoCob.valorQuebrado)}
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                {numero(resumoCob.quebradas)} {resumoCob.quebradas === 1 ? "cliente" : "clientes"} · ligue hoje
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-slate-500">Nunca foram chamados</div>
              <div className={`mt-1 text-2xl font-semibold tabular-nums ${resumoCob.semChamado ? "text-warn-700" : "text-slate-800"}`}>
                {moeda(resumoCob.valorSemChamado)}
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                {numero(resumoCob.semChamado)} {resumoCob.semChamado === 1 ? "cliente" : "clientes"} · a cobrança nem começou
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-slate-500">Prometeram, data não chegou</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-ok-700">
                {moeda(resumoCob.valorAguardando)}
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                {numero(resumoCob.aguardando)} {resumoCob.aguardando === 1 ? "cliente" : "clientes"} · não ligar, esperar
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-slate-500">Em conversa</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-800">
                {moeda(resumoCob.valorEmConversa)}
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                {numero(resumoCob.emConversa)} {resumoCob.emConversa === 1 ? "cliente" : "clientes"} · negociando, contestou ou sem resposta
              </div>
            </Card>
          </div>

          <SectionTitle
            titulo="Carteira de cobrança"
            sub="Um cartão por cliente que deve. Clique para ver os títulos em aberto, o histórico e anotar a ligação."
          />

          <Card className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1">
              <label className="mb-1 block text-xs text-slate-500" htmlFor="cob-busca">Cliente</label>
              <input
                id="cob-busca"
                className="input"
                placeholder="Procurar pelo nome…"
                value={buscaCob}
                onChange={(e) => setBuscaCob(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500" htmlFor="cob-de">Vence de</label>
              <input id="cob-de" type="date" className="input w-40" value={deCob} onChange={(e) => setDeCob(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500" htmlFor="cob-ate">até</label>
              <input id="cob-ate" type="date" className="input w-40" value={ateCob} onChange={(e) => setAteCob(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500" htmlFor="cob-ordem">Ordenar por</label>
              <select id="cob-ordem" className="input w-52" value={ordemCob} onChange={(e) => setOrdemCob(e.target.value)}>
                {ORDENS.map((o) => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
              </select>
            </div>
            {(buscaCob || deCob || ateCob || ordemCob !== "acao") && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => { setBuscaCob(""); setDeCob(""); setAteCob(""); setOrdemCob("acao"); }}
              >
                Limpar
              </button>
            )}
            {/* O RECORTE TEM DE SE ANUNCIAR. Um filtro de data ligado muda os
                três números do topo, e sem esta linha a direção lê "R$ 245 mil
                a cobrar" achando que é a dívida inteira. */}
            {(deCob || ateCob) && (
              <div className="w-full text-xs text-warn-700">
                Mostrando só títulos que vencem
                {deCob && ` de ${dataLonga(deCob)}`}
                {ateCob && ` até ${dataLonga(ateCob)}`} — os números acima seguem este recorte.
              </div>
            )}
          </Card>

          {cobrancas === null ? (
            <Empty>Carregando o histórico de cobrança…</Empty>
          ) : carteiraVista.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {carteiraVista.map((c) => (
                <CartaoCobranca
                  key={c.chave}
                  c={c}
                  aberto={clienteAberto === c.chave}
                  aoAbrir={setClienteAberto}
                  aoRegistrar={registrarChamado}
                  aoApagar={apagarChamado}
                  salvando={salvandoChamado}
                  erro={clienteAberto === c.chave ? avisoCob : null}
                />
              ))}
            </div>
          ) : (
            <Empty>
              {carteira.length
                ? "Nenhum cliente com esse recorte. Limpe o filtro para ver a carteira inteira."
                : "Nenhum título vencido — nada a cobrar."}
            </Empty>
          )}
        </div>
      )}

      {aba === "analise" && (
      <>
      {/* Onde a divida esta: mesmo recorte da lista acima, visto por tres
          angulos. Clicar numa barra filtra a lista (ano/mes) ou busca o
          cliente, para o gestor ir do "onde" direto para o "quem". */}
      <Secao
          id="ondeDivida"
          titulo="Onde esta a divida"
          sub={`${numero(titulosFiltrados.length)} títulos no recorte atual - ${moeda(
            somaFiltrada
          )}. Clique numa barra para filtrar.`}
          acao={
            <Segmented
              opcoes={[
                { valor: "ano", rotulo: "Por ano" },
                { valor: "mes", rotulo: "Por mês" },
                { valor: "cliente", rotulo: "Por cliente" },
              ]}
              valor={visao}
              onChange={setVisao}
            />
          }
          aberta={abertasAnaliseCA.ondeDivida}
          aoAlternar={alternarAnaliseCA}
        >
        {dividas[visao === "ano" ? "porAno" : visao === "mes" ? "porMes" : "porCliente"].length ? (
          <div className="space-y-4">
            {(() => {
              const lista =
                visao === "ano"
                  ? dividas.porAno
                  : visao === "mes"
                    ? dividas.porMes
                    : dividas.porCliente.slice(0, 12);
              const maior = Math.max(...lista.map((x) => x.valor), 1);
              const rotulo = (x) => (visao === "mes" ? rotuloMes(x.chave) : x.chave);
              return lista.map((x) => (
                <button
                  key={x.chave}
                  type="button"
                  className="block w-full text-left"
                  onClick={() => {
                    if (visao === "ano") {
                      setAnoSel(anoSel === x.chave ? "" : x.chave);
                      setMesSel("");
                    } else if (visao === "mes") {
                      setAnoSel(x.chave.slice(0, 4));
                      setMesSel(mesSel === x.chave.slice(5, 7) ? "" : x.chave.slice(5, 7));
                    } else {
                      setBusca(busca === x.chave ? "" : x.chave);
                    }
                    irParaTitulos();
                  }}
                  title={
                    visao === "cliente"
                      ? `Buscar ${x.chave} na lista`
                      : `Filtrar a lista por ${rotulo(x)}`
                  }
                >
                  <BarRow
                    rotulo={rotulo(x)}
                    valorTexto={moeda(x.valor)}
                    pct={Math.round((x.valor / maior) * 100)}
                    tom={x.dias >= 90 ? "bad" : x.dias >= 30 ? "warn" : "brand"}
                    sub={`${numero(x.qtd)} ${x.qtd === 1 ? "título" : "títulos"} - atraso até ${numero(x.dias)} dias`}
                  />
                </button>
              ));
            })()}
            {visao === "cliente" && dividas.porCliente.length > 12 && (
              <p className="text-xs text-slate-500">
                Mostrando os 12 maiores de {numero(dividas.porCliente.length)} clientes.
              </p>
            )}
          </div>
        ) : (
          <Empty>Nenhum título no recorte atual.</Empty>
        )}
      </Secao>

      {/* Ranking de quem mais deve: a fila de cobranca, na ordem. */}
      <Secao
          id="rankingDevedores"
          titulo="Ranking de devedores"
          sub="Quem mais deve no recorte atual, com o vendedor que atendeu."
          aberta={abertasAnaliseCA.rankingDevedores}
          aoAlternar={alternarAnaliseCA}
        >
        {dividas.porCliente.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse">
              <thead>
                <tr>
                  <th className="th text-left">#</th>
                  <th className="th text-left">Cliente</th>
                  <th className="th text-right">Devendo</th>
                  <th className="th text-right">Títulos</th>
                  <th className="th text-right">Maior atraso</th>
                  <th className="th text-left">Vendedor</th>
                </tr>
              </thead>
              <tbody>
                {dividas.porCliente.slice(0, 15).map((c, i) => {
                  const vends = [
                    ...new Set(
                      titulosFiltrados
                        .filter((t) => t.cliente === c.chave)
                        .flatMap((t) => t.vendedores)
                    ),
                  ];
                  return (
                    <tr
                      key={c.chave}
                      className="cursor-pointer transition-colors hover:bg-slate-50"
                      onClick={() => {
                        setBusca(c.chave);
                        irParaTitulos();
                      }}
                      title={`Ver os títulos de ${c.chave}`}
                    >
                      <td className="td tnum text-slate-400">{i + 1}</td>
                      <td className="td font-display font-medium text-slate-900">{c.chave}</td>
                      <td className="td text-right tnum font-semibold text-slate-900">
                        {moeda(c.valor)}
                      </td>
                      <td className="td text-right tnum text-slate-600">{numero(c.qtd)}</td>
                      <td className="td text-right">
                        <span
                          className={`inline-block rounded-md px-2 py-0.5 tnum text-sm font-semibold ${
                            c.dias >= 90
                              ? "bg-bad-50 text-bad-700"
                              : c.dias >= 30
                                ? "bg-warn-50 text-warn-700"
                                : "text-slate-600"
                          }`}
                        >
                          {numero(c.dias)} dias
                        </span>
                      </td>
                      <td className="td text-sm text-slate-600">
                        {vends.length ? vends.join(", ") : "não localizado"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Nenhum devedor no recorte atual.</Empty>
        )}
      </Secao>

      {/* Por que estao atrasados */}
      <Secao
          id="porQue"
          titulo="Por que estão atrasados"
          sub="Distribuição do valor por origem da causa — sobre TODA a dívida ativa, ignora os filtros da lista."
          aberta={abertasAnaliseCA.porQue}
          aoAlternar={alternarAnaliseCA}
        >
        {vm.porOrigem.some((o) => o.valor > 0) ? (
          <div className="space-y-4">
            {vm.porOrigem.map((o) => (
              <BarRow
                key={o.grupo}
                rotulo={o.nome}
                valorTexto={moeda(o.valor)}
                pct={o.pct}
                tom={tomDoGrupo(o.grupo)}
                sub={`${o.pct}% do total`}
              />
            ))}
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="font-display text-sm font-semibold text-slate-900">
                {vm.resumoOrigem}
              </p>
            </div>
          </div>
        ) : (
          <Empty>Nada classificado por origem ainda.</Empty>
        )}
      </Secao>

      {/* Padroes por motivo */}
      <Secao
          id="porMotivo"
          titulo="Padrões por motivo"
          sub="O que mais trava o recebimento, por valor — sobre TODA a dívida ativa, ignora os filtros da lista."
          aberta={abertasAnaliseCA.porMotivo}
          aoAlternar={alternarAnaliseCA}
        >
        {vm.porMotivo.length ? (
          <div className="space-y-4">
            {vm.porMotivo.map((m) => (
              <BarRow
                key={m.motivoId || "sem"}
                rotulo={m.nome}
                valorTexto={moeda(m.valor)}
                pct={k.totalAtrasado ? Math.round((m.valor / k.totalAtrasado) * 100) : 0}
                tom={tomDoGrupo(m.grupo)}
                sub={`${numero(m.qtd)} ${m.qtd === 1 ? "título" : "títulos"}`}
              />
            ))}
          </div>
        ) : (
          <Empty>Sem motivos registrados.</Empty>
        )}
      </Secao>

      {/* Idade dos atrasos: cada faixa e um filtro clicavel */}
      <Secao
          id="idade"
          titulo="Idade dos atrasos"
          sub="Quanto mais velho o atraso, mais difícil recuperar. Clique numa faixa para ver os títulos. Sobre TODA a dívida ativa, ignora os filtros da lista."
          aberta={abertasAnaliseCA.idade}
          aoAlternar={alternarAnaliseCA}
        >
        {vm.idade.some((f) => f.qtd > 0) ? (
          <div className="space-y-2">
            {vm.idade.map((f) => {
              const maxValor = Math.max(...vm.idade.map((x) => x.valor), 1);
              const sel = faixaSel?.faixa === f.faixa;
              return (
                <button
                  key={f.faixa}
                  disabled={f.qtd === 0}
                  onClick={() => {
                    setFaixaSel(sel ? null : f);
                    setFiltro("todos");
                    irParaTitulos();
                  }}
                  className={`w-full rounded-xl p-2 text-left transition-colors disabled:cursor-default disabled:opacity-60 ${
                    sel ? "bg-brand/5 ring-1 ring-brand/40" : f.qtd > 0 ? "hover:bg-slate-50" : ""
                  }`}
                >
                  <BarRow
                    rotulo={f.faixa}
                    valorTexto={moeda(f.valor)}
                    pct={Math.round((f.valor / maxValor) * 100)}
                    tom={f.alto ? "bad" : "brand"}
                    sub={`${numero(f.qtd)} ${f.qtd === 1 ? "título" : "títulos"}`}
                  />
                </button>
              );
            })}
          </div>
        ) : (
          <Empty>Nenhum título atrasado.</Empty>
        )}
      </Secao>

      {/* Plano de acao -- era <section> cru (por isso escapou da conversao em
          lote dos Cards); a regra vale igual: quadro de analise recolhe. */}
      <Secao
        id="plano"
        titulo="Plano de ação"
        sub="Quatro frentes, cada uma com um próximo passo claro."
        aberta={abertasAnaliseCA.plano}
        aoAlternar={alternarAnaliseCA}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {vm.frentes.map((f) => {
            const vazia = f.soma === 0 && f.qtd === 0;
            return (
              <Card key={f.chave} className="flex flex-col">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-base font-semibold text-slate-900">
                    {f.titulo}
                  </h3>
                  <span className="chip shrink-0">{f.prazo}</span>
                </div>
                <p className="mt-1 text-sm text-slate-500">{f.descricao}</p>

                {vazia ? (
                  <div className="mt-4 flex items-center gap-2 text-sm text-ok-700">
                    <CheckCircle2 size={18} strokeWidth={2.2} />
                    Nada nesta frente.
                  </div>
                ) : (
                  <>
                    <div className="mt-4 flex items-end gap-2">
                      <span className="kpi-value text-2xl text-slate-900">{moeda(f.soma)}</span>
                      <span className="mb-1 text-sm text-slate-500">
                        {numero(f.qtd)} {f.qtd === 1 ? "título" : "títulos"}
                      </span>
                    </div>
                    {f.clientes.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {f.clientes.slice(0, 6).map((c) => (
                          <button
                            key={c}
                            className="chip transition-colors hover:bg-slate-200"
                            onClick={() => {
                              limparTudo();
                              setBusca(c);
                              irParaTitulos();
                            }}
                            title="Ver os títulos deste cliente"
                          >
                            {c}
                          </button>
                        ))}
                        {f.clientes.length > 6 && (
                          <span className="chip">+{f.clientes.length - 6}</span>
                        )}
                      </div>
                    )}
                    <p
                      className="mt-3 border-t pt-3 text-sm text-slate-600"
                      style={{ borderColor: "var(--hairline)" }}
                    >
                      {f.nota}
                    </p>
                  </>
                )}
              </Card>
            );
          })}
        </div>
      </Secao>

      {/* Cobrar hoje */}
      <Secao
          id="cobrarHoje"
          titulo="Cobrar hoje"
          sub="Os pendentes de maior valor, com a ação sugerida."
          aberta={abertasAnaliseCA.cobrarHoje}
          aoAlternar={alternarAnaliseCA}
        >
        {vm.cobrarHoje.length ? (
          <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
            {vm.cobrarHoje.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <button
                    className="font-display text-sm font-semibold text-slate-900 hover:text-brand"
                    onClick={() => {
                      limparTudo();
                      setBusca(c.cliente);
                      setExpandido(c.id);
                      irParaTitulos();
                    }}
                    title="Ver este título na lista"
                  >
                    {c.cliente}
                  </button>
                  <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-500">
                    <Phone size={14} strokeWidth={2.2} className="text-brand" />
                    {c.acao}
                  </p>
                </div>
                <div className="text-right">
                  <p className="tnum text-sm font-semibold text-slate-900">{moeda(c.valor)}</p>
                  <p className="text-xs text-slate-500">{numero(c.dias)} dias</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Nenhuma cobrança pendente. Tudo em dia.</Empty>
        )}
      </Secao>

      {/* Curva do DSO: so com historico REAL acumulado no cache (um ponto/dia). */}
      {vm.dsoHistorico.length >= 2 ? (
        <Secao
          id="dso"
          titulo="Curva do DSO"
            sub="Prazo medio de recebimento ao longo dos dias, contra a meta."
          aberta={abertasAnaliseCA.dso}
          aoAlternar={alternarAnaliseCA}
        >
          <Suspense fallback={<div style={{ height: 260 }} className="grid place-items-center text-sm text-slate-400">Carregando o gráfico…</div>}>
            <CurvaDso dados={vm.dsoHistorico} meta={k.dsoMeta} cor={MARCA} />
          </Suspense>
        </Secao>
      ) : (
        <Secao
          id="dso"
          titulo="Curva do DSO" sub="Prazo medio de recebimento ao longo do tempo."
          aberta={abertasAnaliseCA.dso}
          aoAlternar={alternarAnaliseCA}
        >
          <Empty>
            O histórico de DSO começa a ser registrado agora, um ponto por dia. A curva aparece
            assim que houver alguns dias acumulados.
          </Empty>
        </Secao>
      )}
      </>
      )}
    </div>
  );
}

// Item do painel de detalhes da linha expandida.
function Detalhe({ rotulo, valor }) {
  return (
    <div className="min-w-0">
      <dt className="label mb-0.5">{rotulo}</dt>
      <dd className="truncate text-sm text-slate-800" title={valor}>
        {valor}
      </dd>
    </div>
  );
}
