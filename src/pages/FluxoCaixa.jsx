// Fluxo de Caixa: projecao dos proximos 30 dias com a regra D-1. Dois calculos
// memorizados (normal e estresse). O modo estresse zera os recebiveis incertos
// (clientes que ja tem titulo vencido) e mostra o impacto no menor saldo.
//
// A tela e navegavel: os KPIs do topo sao FILTROS clicaveis do calendario, ha
// busca por lancamento, e cada dia expande mostrando o que exatamente cai nele.

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  Wallet,
  Clock,
  AlertTriangle,
  ShieldAlert,
  Landmark,
  ChevronRight,
  Search,
  X,
  ArrowDownCircle,
  ArrowUpCircle,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  Legend,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { useApp } from "../config/store.jsx";
import { calcFluxoCaixa } from "../lib/calc/fluxoCaixa.js";
import { getFluxoMensal } from "../services/mubi.js";
import { moeda, moedaCheia, numero, dataLonga, ymdLocal } from "../lib/format.js";
import {
  Card,
  PageTitle,
  StatCard,
  StatusLine,
  Empty,
  CarregandoModulo,
  ErroModulo,
  BotaoPDF,
  CabecalhoImpressao,
  AvisoDadoParado,
} from "../components/ui.jsx";

const MARCA = "#3840E8";
const VERMELHO = "#dc2626";
const AMBAR = "#d97706";

const LOTE = 25;

// Normaliza para busca (sem acento, minusculo).
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

// Data local no formato AAAA-MM-DD (mesma forma das datas da projecao).
const diaISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Um lancamento casa com a busca por nome (fornecedor/cliente), descricao ou categoria.
const itemCasa = (item, q) =>
  !!q && norm(`${item.fornecedor || ""} ${item.descricao} ${item.categoria || ""}`).includes(q);

export default function FluxoCaixa() {
  const { config, dados, pronto, erro, recarregar, frescorDe , fontesNegadas = [] } = useApp();
  // `pagar` e a fonte desta tela (o realizado mensal tem carimbo proprio).
  const atualizadoEm = frescorDe("fluxo-caixa");
  const [modoEstresse, setModoEstresse] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtroKpi, setFiltroKpi] = useState(null); // null | "abaixo" | "menor"
  const [verBancos, setVerBancos] = useState(false);
  const [expandido, setExpandido] = useState(null); // data (AAAA-MM-DD) do dia aberto
  const [visiveis, setVisiveis] = useState(LOTE);
  const calendarioRef = useRef(null);

  // Fluxo REALIZADO mes a mes (contas pagas), carregado sob demanda desta tela.
  const [mensal, setMensal] = useState(null); // { anos, disponiveis }
  const [anoSel, setAnoSel] = useState(null);
  useEffect(() => {
    let vivo = true;
    getFluxoMensal()
      .then((r) => {
        if (!vivo) return;
        setMensal(r);
        const anos = r.disponiveis || [];
        setAnoSel((a) => a ?? (anos.length ? anos[0] : new Date().getFullYear()));
      })
      .catch((e) => console.warn("fluxo mensal: sem dados ainda:", e?.message || e));
    return () => {
      vivo = false;
    };
  }, []);

  // O calendario mostra em lotes (Ver mais). Antes de imprimir, revela todos os
  // dias -- senao o PDF sairia truncado sem avisar.
  // Impressao mostra a lista INTEIRA (a tela pagina em lotes).
  //
  // `beforeprint` sozinho nao basta: a atualizacao de estado do React e
  // assincrona e o diálogo de impressao captura a pagina antes do redesenho --
  // o PDF saia truncado no lote. `matchMedia("print")` avisa quando o modo de
  // impressao entra E quando sai, dando o quadro extra que faltava, e devolve o
  // limite ao normal no fim (senao a tela ficava com centenas de linhas
  // renderizadas e o "mostrar mais" sumia para sempre).
  useEffect(() => {
    const mm = window.matchMedia?.("print");
    const entrar = () => setVisiveis(Number.MAX_SAFE_INTEGER);
    const sair = () => setVisiveis(LOTE);
    const aoMudar = (e) => (e.matches ? entrar() : sair());
    mm?.addEventListener?.("change", aoMudar);
    window.addEventListener("beforeprint", entrar);
    window.addEventListener("afterprint", sair);
    return () => {
      mm?.removeEventListener?.("change", aoMudar);
      window.removeEventListener("beforeprint", entrar);
      window.removeEventListener("afterprint", sair);
    };
  }, []);

  // Sem os recebiveis (a conta nao tem o modulo Contas Atrasadas), projetar
  // seria mostrar 30 dias sem UMA entrada -- um caixa catastrofico apresentado
  // como verdade. Melhor nao mostrar numero nenhum e dizer por que.
  const semEntradas = fontesNegadas.includes("recebiveis");

  const base = useMemo(
    () =>
      dados && !semEntradas
        ? calcFluxoCaixa(
            { pagar: dados.pagar, recebiveis: dados.recebiveis, bancos: dados.bancos },
            config,
            { horizonte: 30 }
          )
        : null,
    [dados, config, semEntradas]
  );

  const estresse = useMemo(
    () =>
      dados
        ? calcFluxoCaixa(
            { pagar: dados.pagar, recebiveis: dados.recebiveis, bancos: dados.bancos },
            config,
            { horizonte: 30, estresse: true }
          )
        : null,
    [dados, config]
  );

  // Serie do realizado mes a mes para o ano selecionado (+ previsto dos proximos
  // 30 dias no ano corrente, agregado do calculo base da projecao).
  const serieMensal = useMemo(() => {
    if (!mensal || !anoSel) return null;
    const dadosAno = mensal.anos?.[anoSel] || mensal.anos?.[String(anoSel)] || null;
    const ent = dadosAno?.entradas || {};
    const sai = dadosAno?.saidas || {};
    const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    const hoje = new Date();
    const anoAtual = hoje.getFullYear();
    const mesAtual = hoje.getMonth(); // 0-based

    let acumulado = 0;
    let temAlgum = false;
    const meses = nomes.map((rot, i) => {
      const chave = `${anoSel}-${String(i + 1).padStart(2, "0")}`;
      const entradas = ent[chave] || 0;
      const saidas = sai[chave] || 0;
      const saldo = entradas - saidas;
      const houve = entradas > 0 || saidas > 0;
      if (houve) temAlgum = true;
      // Mes futuro (ainda nao aconteceu) no ano corrente: sem realizado.
      const futuro = anoSel > anoAtual || (anoSel === anoAtual && i > mesAtual);
      const corrente = anoSel === anoAtual && i === mesAtual;
      acumulado += saldo;
      return { mes: rot, chave, entradas, saidas, saldo, acumulado, houve, futuro, corrente };
    });

    // Previsto dos proximos 30 dias (so faz sentido no ano corrente).
    let previsto = null;
    if (base && anoSel === anoAtual) {
      const futuros = base.projecao.filter((d) => d.data > diaISO(hoje));
      const pe = futuros.reduce((s, d) => s + d.entrada, 0);
      const ps = futuros.reduce((s, d) => s + d.saida, 0);
      if (pe > 0 || ps > 0) previsto = { entradas: pe, saidas: ps, saldo: pe - ps };
    }

    const totalEnt = meses.reduce((s, m) => s + m.entradas, 0);
    const totalSai = meses.reduce((s, m) => s + m.saidas, 0);
    return { meses, previsto, temAlgum, totalEnt, totalSai, saldoAno: totalEnt - totalSai };
  }, [mensal, anoSel, base]);

  // Fonte ativa para KPIs, calendario e linha principal do grafico.
  const vm = modoEstresse ? estresse : base;

  const diasFiltrados = useMemo(() => {
    if (!vm) return [];
    const q = norm(busca.trim());
    return vm.projecao.filter((d) => {
      if (filtroKpi === "abaixo" && !d.abaixo) return false;
      if (filtroKpi === "menor" && d.data !== vm.kpis.menorSaldoData) return false;
      if (q) {
        const casa =
          d.entradas.some((i) => itemCasa(i, q)) || d.saidas.some((i) => itemCasa(i, q));
        if (!casa) return false;
      }
      return true;
    });
  }, [vm, busca, filtroKpi]);

  if (erro) return <ErroModulo mensagem={erro} aoTentar={recarregar} />;
  // Dizer POR QUE nao ha numero e melhor que girar para sempre -- e muito
  // melhor que projetar o caixa sem as entradas.
  if (semEntradas)
    return (
      <div className="space-y-6">
        <PageTitle titulo="Fluxo de Caixa" descricao="Caixa de hoje e a projecao dos proximos dias." />
        <Card className="flex items-start gap-2.5 text-sm text-warn-700">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <span>
            Esta projecao depende das contas a receber, e o seu acesso nao inclui esse modulo.
            Sem elas o caixa apareceria sem nenhuma entrada -- um numero errado e assustador --,
            entao preferimos nao mostrar. Fale com a direcao se precisar do Fluxo de Caixa.
          </span>
        </Card>
      </div>
    );
  if (!pronto || !vm || !base || !estresse) return <CarregandoModulo />;

  const k = vm.kpis;
  const colchao = k.colchao;
  const abaixoDoColchao = k.menorSaldo < colchao;

  // Composicao do saldo de hoje: as contas bancarias vem sempre do calculo base.
  const bancos = base.bancos || [];
  const subSaldoHoje =
    bancos.length > 0
      ? `${bancos.length} ${bancos.length === 1 ? "conta bancaria" : "contas bancarias"}`
      : "saldo inicial informado";

  // Incertos vem sempre do calculo base (no estresse eles foram zerados).
  const qtdIncertos = base.incertos.length;
  const valorIncertos = base.kpis.incertosValor;
  const menorNormal = base.kpis.menorSaldo;
  const menorEstresse = estresse.kpis.menorSaldo;
  const impacto = menorNormal - menorEstresse;

  // Dados do grafico. Sempre inclui o saldo normal; no modo estresse, casa o
  // saldo de estresse pelo mesmo indice de dia (as duas projecoes tem o mesmo
  // horizonte e a mesma ordem de datas).
  const dadosGrafico = base.projecao.map((linha, i) => ({
    rotulo: linha.rotulo,
    saldo: linha.saldo,
    saldoEstresse: estresse.projecao[i] ? estresse.projecao[i].saldo : null,
  }));

  const q = norm(busca.trim());
  const temFiltro = !!filtroKpi || !!busca;
  const limparTudo = () => {
    setFiltroKpi(null);
    setBusca("");
    setVisiveis(LOTE);
  };
  const irParaCalendario = () =>
    calendarioRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  // Clique num KPI liga/desliga o filtro do calendario e leva ate a lista.
  // Limpa a busca para o KPI ser um filtro previsivel (senao o clique podia
  // cair num "0 dias" por causa de um texto ainda digitado na busca).
  const alternarFiltro = (novo) => {
    setFiltroKpi((f) => (f === novo ? null : novo));
    setBusca("");
    setVisiveis(LOTE);
    irParaCalendario();
  };

  const lista = diasFiltrados.slice(0, visiveis);
  const restantes = diasFiltrados.length - lista.length;
  const somaEntradas = diasFiltrados.reduce((s, d) => s + d.entrada, 0);
  const somaSaidas = diasFiltrados.reduce((s, d) => s + d.saida, 0);

  const alternarDia = (data) => setExpandido((e) => (e === data ? null : data));
  const teclaNaLinha = (e, data) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      alternarDia(data);
    }
  };

  return (
    <div className="space-y-8">
      <PageTitle
        titulo="Fluxo de Caixa"
        descricao="Projecao dos proximos 30 dias com a regra D-1. Clique nos numeros para filtrar o calendario."
        acao={<BotaoPDF titulo="Gera um PDF do fluxo (realizado do ano + projecao)" />}
      />

      <AvisoDadoParado atualizadoEm={atualizadoEm} />

      <CabecalhoImpressao
        atualizadoEm={atualizadoEm}
        titulo="Impresilk - Fluxo de Caixa"
        linhas={[
          `Emitido em ${dataLonga(ymdLocal(new Date()))}`,
          `Realizado mes a mes de ${anoSel || ""} e projecao dos proximos 30 dias`,
          // Sem isto o PDF do cenario de estresse era identico ao real: mesmos
          // rotulos, numeros piores, e ninguem sabia que estava lendo simulacao.
          modoEstresse
            ? "ATENCAO: cenario de ESTRESSE -- os recebiveis de clientes ja inadimplentes foram desconsiderados. Nao e a projecao real."
            : null,
        ]}
      />

      {/* KPIs: clicaveis, filtram o calendario -- viram cartoes mortos no papel */}
      <div className="sem-impressao grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          rotulo="Menor saldo previsto"
          valor={moeda(k.menorSaldo)}
          sub={"em " + dataLonga(k.menorSaldoData)}
          tom={abaixoDoColchao ? "bad" : "ok"}
          icone={Wallet}
          ativo={filtroKpi === "menor"}
          onClick={() => alternarFiltro("menor")}
        />
        <StatCard
          rotulo="Dias abaixo do colchao"
          valor={numero(k.diasAbaixo)}
          sub={"colchao " + moeda(colchao)}
          tom={k.diasAbaixo > 0 ? "warn" : "ok"}
          icone={AlertTriangle}
          ativo={filtroKpi === "abaixo"}
          onClick={() => alternarFiltro("abaixo")}
        />
        <StatCard
          rotulo="Saldo de hoje"
          valor={moeda(k.saldoHoje)}
          sub={subSaldoHoje}
          tom="neutral"
          icone={Landmark}
          ativo={verBancos}
          onClick={() => setVerBancos((v) => !v)}
        />
      </div>

      {/* Composicao do saldo de hoje, por conta bancaria */}
      {verBancos && (
        <Card>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900">
                Saldo de hoje por conta
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Composicao do saldo inicial da projecao.
              </p>
            </div>
            <button className="btn-ghost" onClick={() => setVerBancos(false)}>
              <X size={15} /> Fechar
            </button>
          </div>

          {bancos.length ? (
            <>
              <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
                {bancos.map((b) => (
                  <li
                    key={b.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="font-display text-sm font-semibold text-slate-900">
                        {b.banco}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {b.conta || "conta nao informada"}
                      </p>
                    </div>
                    {b.saldo < 0 ? (
                      <span className="chip chip-bad tnum shrink-0">{moeda(b.saldo)}</span>
                    ) : (
                      <span className="tnum text-sm font-semibold text-slate-900">
                        {moeda(b.saldo)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <div
                className="mt-3 flex items-center justify-between border-t pt-3"
                style={{ borderColor: "var(--hairline)" }}
              >
                <span className="label mb-0">Total em caixa</span>
                <span className="tnum font-display font-semibold text-slate-900">
                  {moeda(base.saldoInicial)}
                </span>
              </div>
            </>
          ) : (
            <Empty>
              Nenhuma conta bancaria integrada. O saldo inicial de{" "}
              {moeda(base.saldoInicial)} vem do valor manual de Configuracoes.
            </Empty>
          )}
        </Card>
      )}

      {/* Realizado mes a mes (o que de fato entrou e saiu), com seletor de ano */}
      <Card>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Realizado mes a mes
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              O que de fato entrou e saiu do caixa em cada mes (contas pagas). Escolha o ano.
            </p>
          </div>
          {mensal?.disponiveis?.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="label mb-0" htmlFor="ano-fluxo">
                Ano
              </label>
              <select
                id="ano-fluxo"
                value={anoSel ?? ""}
                onChange={(e) => setAnoSel(Number(e.target.value))}
                className="input w-auto"
              >
                {mensal.disponiveis.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {!(mensal?.disponiveis?.length > 0) || !serieMensal ? (
          <Empty>
            O historico mensal esta sendo montado (roda uma vez por dia de madrugada, e na
            primeira vez logo apos a atualizacao). Volte daqui a pouco.
          </Empty>
        ) : !serieMensal.temAlgum ? (
          <Empty>Nenhuma conta paga registrada em {anoSel}.</Empty>
        ) : (
          <>
            {/* Resumo do ano */}
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <ResumoMes rotulo="Entrou no ano" valor={serieMensal.totalEnt} tom="ok" />
              <ResumoMes rotulo="Saiu no ano" valor={serieMensal.totalSai} tom="bad" />
              <ResumoMes rotulo="Saldo do ano" valor={serieMensal.saldoAno} tom="saldo" />
            </div>

            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer>
                <BarChart
                  data={serieMensal.meses.filter((m) => m.houve || !m.futuro)}
                  margin={{ top: 8, right: 8, left: 4, bottom: 0 }}
                  barGap={2}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef1f6" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                  <YAxis
                    tickFormatter={(v) => moeda(v)}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={64}
                  />
                  <Tooltip
                    formatter={(v, nome) => [moedaCheia(v), nome]}
                    labelFormatter={(l) => `Mes: ${l}`}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="entradas" name="Entrou" fill="#16a34a" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="saidas" name="Saiu" fill={VERMELHO} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Tabela: mes a mes com saldo e acumulado */}
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left" style={{ borderColor: "var(--hairline)" }}>
                    <th className="label py-2">Mes</th>
                    <th className="label py-2 text-right">Entrou</th>
                    <th className="label py-2 text-right">Saiu</th>
                    <th className="label py-2 text-right">Saldo</th>
                    <th className="label py-2 text-right">Acumulado</th>
                  </tr>
                </thead>
                <tbody>
                  {serieMensal.meses
                    .filter((m) => m.houve)
                    .map((m) => (
                      <tr key={m.chave} className="border-b" style={{ borderColor: "var(--hairline)" }}>
                        <td className="py-2 font-medium text-slate-700">
                          {m.mes}
                          {m.corrente && (
                            <span className="ml-2 text-xs font-normal text-slate-400">
                              (mes atual, parcial)
                            </span>
                          )}
                        </td>
                        <td className="tnum py-2 text-right text-ok-700">{moeda(m.entradas)}</td>
                        <td className="tnum py-2 text-right text-bad-700">{moeda(m.saidas)}</td>
                        <td
                          className={
                            "tnum py-2 text-right font-semibold " +
                            (m.saldo < 0 ? "text-bad-700" : "text-slate-900")
                          }
                        >
                          {moeda(m.saldo)}
                        </td>
                        <td
                          className={
                            "tnum py-2 text-right " +
                            (m.acumulado < 0 ? "text-bad-700" : "text-slate-500")
                          }
                        >
                          {moeda(m.acumulado)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {serieMensal.previsto && (
              <div
                className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl border border-dashed p-3 text-sm"
                style={{ borderColor: "rgba(56,64,232,0.35)" }}
              >
                <span className="label mb-0 text-brand">Previsto (proximos 30 dias)</span>
                <span className="text-slate-600">
                  entra <strong className="tnum text-ok-700">{moeda(serieMensal.previsto.entradas)}</strong>
                </span>
                <span className="text-slate-600">
                  sai <strong className="tnum text-bad-700">{moeda(serieMensal.previsto.saidas)}</strong>
                </span>
                <span className="text-slate-600">
                  saldo{" "}
                  <strong
                    className={"tnum " + (serieMensal.previsto.saldo < 0 ? "text-bad-700" : "text-slate-900")}
                  >
                    {moeda(serieMensal.previsto.saldo)}
                  </strong>
                </span>
                <span className="text-xs text-slate-400">detalhe dia a dia no calendario abaixo</span>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Regra D-1 */}
      <Card className="bg-brand/5" style={{ borderColor: "rgba(56,64,232,0.18)" }}>
        <div className="flex items-start gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
            <Clock size={22} strokeWidth={2.2} />
          </span>
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900">Regra D-1</h2>
            <p className="mt-1 max-w-2xl text-slate-600">
              O dinheiro precisa estar em caixa um dia antes do vencimento. Por isso a
              projecao reserva cada saida na vespera do vencimento, e conta a entrada so
              na data prevista (nunca antes). Contas que ja venceram e seguem em aberto
              entram hoje, nao somem da conta.
            </p>
          </div>
        </div>
      </Card>

      {/* Teste de estresse */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span
              className={
                "grid h-11 w-11 shrink-0 place-items-center rounded-xl " +
                (modoEstresse ? "bg-bad-50 text-bad-700" : "bg-slate-100 text-slate-500")
              }
            >
              <ShieldAlert size={22} strokeWidth={2.2} />
            </span>
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900">
                Teste de estresse
              </h2>
              <p className="mt-1 max-w-xl text-slate-600">
                Zera os recebiveis de clientes que ja tem titulo vencido. Sao{" "}
                <span className="font-semibold text-slate-900">{numero(qtdIncertos)}</span>{" "}
                {qtdIncertos === 1 ? "recebivel incerto" : "recebiveis incertos"}, somando{" "}
                <span className="font-semibold text-slate-900">{moeda(valorIncertos)}</span>.
              </p>
            </div>
          </div>
          <button
            onClick={() => setModoEstresse((v) => !v)}
            className={modoEstresse ? "btn-danger" : "btn-outline"}
          >
            {modoEstresse ? "Estresse ligado" : "Ligar teste de estresse"}
          </button>
        </div>

        {qtdIncertos === 0 ? (
          <div className="mt-4">
            <StatusLine tom="ok">
              Nenhum recebivel incerto, o cenario nao muda no estresse.
            </StatusLine>
          </div>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border p-4" style={{ borderColor: "var(--hairline)" }}>
              <p className="label mb-1">Menor saldo, cenario normal</p>
              <p className="kpi-value text-2xl text-slate-900">{moeda(menorNormal)}</p>
            </div>
            <div
              className={"rounded-xl border p-4 " + (modoEstresse ? "bg-bad-50" : "")}
              style={{
                borderColor: modoEstresse ? "rgba(220,38,38,0.28)" : "var(--hairline)",
              }}
            >
              <p className="label mb-1">Menor saldo, cenario de estresse</p>
              <p
                className={
                  "kpi-value text-2xl " +
                  (menorEstresse < colchao ? "text-bad-700" : "text-slate-900")
                }
              >
                {moeda(menorEstresse)}
              </p>
            </div>
          </div>
        )}

        {qtdIncertos > 0 && (
          <div className="mt-4">
            {impacto > 0 ? (
              <StatusLine tom="bad">
                Sem esses recebiveis, o menor saldo cai {moeda(impacto)}
                {menorEstresse < colchao ? ", furando o colchao." : "."}
              </StatusLine>
            ) : (
              <StatusLine tom="ok">
                Mesmo sem esses recebiveis, o menor saldo se mantem.
              </StatusLine>
            )}
          </div>
        )}
      </Card>

      {/* Projecao diaria */}
      <Card>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900">Projecao diaria</h2>
            <p className="mt-0.5 text-sm text-slate-500">Saldo ao fim de cada dia.</p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: MARCA }} />
              Saldo previsto
            </span>
            {modoEstresse && (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="h-0.5 w-4 rounded-full"
                  style={{
                    backgroundImage: `repeating-linear-gradient(90deg, ${VERMELHO} 0 4px, transparent 4px 7px)`,
                  }}
                />
                Estresse
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-0.5 w-4 rounded-full"
                style={{
                  backgroundImage: `repeating-linear-gradient(90deg, ${AMBAR} 0 4px, transparent 4px 7px)`,
                }}
              />
              Colchao
            </span>
          </div>
        </div>

        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dadosGrafico} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
              <CartesianGrid stroke="#eef2f7" vertical={false} />
              <XAxis
                dataKey="rotulo"
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "#e2e8f0" }}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              <YAxis
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={64}
                tickFormatter={(v) => moeda(v)}
              />
              <Tooltip
                formatter={(v, nome) => [moedaCheia(v), nome]}
                labelStyle={{ color: "#0f172a", fontWeight: 600 }}
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid #e2e8f0",
                  fontSize: 13,
                  boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
                }}
              />
              <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={1} />
              <ReferenceLine
                y={colchao}
                stroke={AMBAR}
                strokeDasharray="5 5"
                label={{ value: "colchao", position: "insideTopLeft", fill: AMBAR, fontSize: 11 }}
              />
              <Line
                type="monotone"
                dataKey="saldo"
                name="Saldo previsto"
                stroke={MARCA}
                strokeWidth={2.4}
                dot={false}
                activeDot={{ r: 4 }}
              />
              {modoEstresse && (
                <Line
                  type="monotone"
                  dataKey="saldoEstresse"
                  name="Estresse"
                  stroke={VERMELHO}
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Calendario */}
      <Card ref={calendarioRef}>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900">Calendario</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {modoEstresse
                ? "Cenario de estresse, sem os recebiveis incertos. Clique no dia para ver o que cai nele."
                : "Entradas, saidas e saldo dia a dia. Clique no dia para ver o que cai nele."}
            </p>
          </div>
          <StatusLine tom={abaixoDoColchao ? "bad" : "ok"}>
            {k.diasAbaixo > 0
              ? `${numero(k.diasAbaixo)} ${k.diasAbaixo === 1 ? "dia abaixo" : "dias abaixo"} do colchao`
              : "Nenhum dia abaixo do colchao"}
          </StatusLine>
        </div>

        {/* Busca por lancamento */}
        <div className="sem-impressao mb-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="search"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setVisiveis(LOTE);
              }}
              placeholder="Buscar cliente, fornecedor ou categoria"
              className="input pl-9"
              aria-label="Buscar lancamento"
            />
          </div>

          {temFiltro && (
            <button className="btn-ghost" onClick={limparTudo}>
              <X size={15} /> Limpar filtros
            </button>
          )}
        </div>

        {/* Resumo do que esta na tela */}
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <span>
            Mostrando{" "}
            <strong className="tnum text-slate-900">{numero(diasFiltrados.length)}</strong> de{" "}
            {numero(vm.projecao.length)} dias
            {diasFiltrados.length > 0 && (
              <>
                {" "}
                · a receber{" "}
                <strong className="tnum text-slate-900">{moeda(somaEntradas)}</strong> · a pagar{" "}
                <strong className="tnum text-slate-900">{moeda(somaSaidas)}</strong>
              </>
            )}
          </span>
          {filtroKpi === "abaixo" && (
            <button className="chip chip-warn" onClick={() => setFiltroKpi(null)}>
              so dias abaixo do colchao <X size={12} />
            </button>
          )}
          {filtroKpi === "menor" && (
            <button className="chip chip-bad" onClick={() => setFiltroKpi(null)}>
              menor saldo: {dataLonga(k.menorSaldoData)} <X size={12} />
            </button>
          )}
          {busca && (
            <button className="chip" onClick={() => setBusca("")}>
              busca: {busca} <X size={12} />
            </button>
          )}
        </div>

        {diasFiltrados.length === 0 ? (
          <Empty>
            {temFiltro ? "Nenhum dia neste filtro." : "Sem projecao para o periodo."}
            {temFiltro && (
              <button className="btn-ghost ml-2" onClick={limparTudo}>
                Limpar filtros
              </button>
            )}
          </Empty>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse">
                <thead>
                  <tr>
                    <th className="th text-left">Dia</th>
                    <th className="th text-right">A receber</th>
                    <th className="th text-right">A pagar</th>
                    <th className="th text-right">Saldo projetado</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((linha) => {
                    const aberto = expandido === linha.data;
                    const vazio = linha.entradas.length === 0 && linha.saidas.length === 0;
                    return (
                      <Fragment key={linha.data}>
                        <tr
                          role="button"
                          tabIndex={0}
                          aria-expanded={aberto}
                          onClick={() => alternarDia(linha.data)}
                          onKeyDown={(e) => teclaNaLinha(e, linha.data)}
                          className={
                            "cursor-pointer transition-colors hover:bg-slate-50 " +
                            (linha.abaixo ? "bg-bad-50/60" : "")
                          }
                        >
                          <td className="td">
                            <span className="inline-flex items-center gap-2">
                              <ChevronRight
                                size={16}
                                strokeWidth={2.4}
                                className={
                                  "shrink-0 text-slate-400 transition-transform " +
                                  (aberto ? "rotate-90" : "")
                                }
                              />
                              {linha.abaixo && (
                                <AlertTriangle
                                  size={14}
                                  className="shrink-0 text-bad-600"
                                  strokeWidth={2.4}
                                />
                              )}
                              <span
                                className={
                                  linha.abaixo ? "font-semibold text-bad-700" : "text-slate-700"
                                }
                              >
                                {linha.rotulo}
                              </span>
                              {linha.data === vm.kpis.menorSaldoData && (
                                <span className="chip chip-bad shrink-0">menor saldo</span>
                              )}
                            </span>
                          </td>
                          <td className="td text-right">
                            <span
                              className={
                                linha.entrada > 0 ? "tnum text-ok-700" : "tnum text-slate-300"
                              }
                            >
                              {linha.entrada > 0 ? moeda(linha.entrada) : "-"}
                            </span>
                          </td>
                          <td className="td text-right">
                            <span
                              className={
                                linha.saida > 0 ? "tnum text-bad-700" : "tnum text-slate-300"
                              }
                            >
                              {linha.saida > 0 ? moeda(linha.saida) : "-"}
                            </span>
                          </td>
                          <td className="td text-right">
                            <span
                              className={
                                "tnum font-semibold " +
                                (linha.abaixo ? "text-bad-700" : "text-slate-900")
                              }
                            >
                              {moeda(linha.saldo)}
                            </span>
                          </td>
                        </tr>

                        {aberto && (
                          <tr>
                            <td colSpan={4} className="px-4 pb-4 pt-0">
                              <div
                                className="rounded-xl border bg-slate-50 p-4"
                                style={{ borderColor: "var(--hairline)" }}
                              >
                                <p className="label mb-3">{dataLonga(linha.data)}</p>

                                {vazio ? (
                                  <p className="text-sm text-slate-500">
                                    Sem lancamentos neste dia. O saldo segue em{" "}
                                    <span className="tnum font-semibold text-slate-900">
                                      {moeda(linha.saldo)}
                                    </span>
                                    .
                                  </p>
                                ) : (
                                  <div className="grid gap-5 sm:grid-cols-2">
                                    <Lado
                                      titulo="Entradas"
                                      icone={ArrowDownCircle}
                                      tom="ok"
                                      total={linha.entrada}
                                      vazioTexto="Nenhuma entrada prevista."
                                      itens={linha.entradas}
                                      renderItem={(i) => (
                                        <>
                                          <div className="min-w-0">
                                            <p className="truncate text-sm text-slate-800">
                                              {i.descricao}
                                            </p>
                                            {i.incerto && (
                                              <span className="chip chip-warn mt-1">incerto</span>
                                            )}
                                          </div>
                                          <span className="tnum shrink-0 text-sm font-semibold text-ok-700">
                                            {moeda(i.valor)}
                                          </span>
                                        </>
                                      )}
                                      q={q}
                                    />
                                    <Lado
                                      titulo="Saidas"
                                      icone={ArrowUpCircle}
                                      tom="bad"
                                      total={linha.saida}
                                      vazioTexto="Nenhuma saida prevista."
                                      itens={linha.saidas}
                                      renderItem={(i) => (
                                        <>
                                          <div className="min-w-0">
                                            <p className="truncate text-sm font-medium text-slate-800">
                                              {i.fornecedor || i.descricao}
                                            </p>
                                            <p className="mt-0.5 truncate text-xs text-slate-500">
                                              {i.fornecedor ? `${i.descricao} · ` : ""}
                                              {i.categoria || "sem categoria"}
                                              {i.tipo === "provisao" ? " · provisao" : ""}
                                            </p>
                                            {i.vencida && (
                                              <span className="chip chip-bad mt-1">
                                                vencida em {dataLonga(i.vencimento)}
                                              </span>
                                            )}
                                          </div>
                                          <span className="tnum shrink-0 text-sm font-semibold text-bad-700">
                                            {moeda(i.valor)}
                                          </span>
                                        </>
                                      )}
                                      q={q}
                                    />
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {restantes > 0 && (
              <div className="mt-4 text-center">
                <button className="btn-outline" onClick={() => setVisiveis((v) => v + LOTE)}>
                  Mostrar mais ({numero(restantes)} {restantes === 1 ? "restante" : "restantes"})
                </button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

// Cartao de resumo do ano no realizado mes a mes.
function ResumoMes({ rotulo, valor, tom }) {
  const cor =
    tom === "ok"
      ? "text-ok-700"
      : tom === "bad"
        ? "text-bad-700"
        : valor < 0
          ? "text-bad-700"
          : "text-slate-900";
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "var(--hairline)" }}>
      <p className="label mb-1">{rotulo}</p>
      <p className={"tnum font-display text-xl font-semibold " + cor}>{moeda(valor)}</p>
    </div>
  );
}

// Coluna de lancamentos do dia expandido (entradas ou saidas). Destaca os itens
// que casam com a busca ativa.
function Lado({ titulo, icone: Icone, tom, total, itens, renderItem, vazioTexto, q }) {
  const cor = tom === "ok" ? "text-ok-700" : "text-bad-700";
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className={"inline-flex items-center gap-1.5 font-display text-sm font-semibold " + cor}>
          <Icone size={15} strokeWidth={2.2} />
          {titulo}
        </span>
        <span className={"tnum text-sm font-semibold " + cor}>{moeda(total)}</span>
      </div>
      {itens.length ? (
        <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
          {itens.map((i) => (
            <li
              key={i.id}
              className={
                "flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0 " +
                (itemCasa(i, q) ? "rounded-lg bg-brand/5 px-2" : "")
              }
            >
              {renderItem(i)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">{vazioTexto}</p>
      )}
    </div>
  );
}
