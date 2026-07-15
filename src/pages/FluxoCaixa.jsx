// Fluxo de Caixa: projecao dos proximos 30 dias com a regra D-1. Dois calculos
// memorizados (normal e estresse). O modo estresse zera os recebiveis incertos
// (clientes que ja tem titulo vencido) e mostra o impacto no menor saldo.
//
// A tela e navegavel: os KPIs do topo sao FILTROS clicaveis do calendario, ha
// busca por lancamento, e cada dia expande mostrando o que exatamente cai nele.

import { Fragment, useMemo, useRef, useState } from "react";
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
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { useApp } from "../config/store.jsx";
import { calcFluxoCaixa } from "../lib/calc/fluxoCaixa.js";
import { moeda, moedaCheia, numero, dataLonga } from "../lib/format.js";
import {
  Card,
  PageTitle,
  StatCard,
  StatusLine,
  Empty,
  CarregandoModulo,
  ErroModulo,
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

// Um lancamento casa com a busca por descricao ou categoria.
const itemCasa = (item, q) =>
  !!q && norm(`${item.descricao} ${item.categoria || ""}`).includes(q);

export default function FluxoCaixa() {
  const { config, dados, pronto, erro, recarregar } = useApp();
  const [modoEstresse, setModoEstresse] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtroKpi, setFiltroKpi] = useState(null); // null | "abaixo" | "menor"
  const [verBancos, setVerBancos] = useState(false);
  const [expandido, setExpandido] = useState(null); // data (AAAA-MM-DD) do dia aberto
  const [visiveis, setVisiveis] = useState(LOTE);
  const calendarioRef = useRef(null);

  const base = useMemo(
    () =>
      dados
        ? calcFluxoCaixa(
            { pagar: dados.pagar, recebiveis: dados.recebiveis, bancos: dados.bancos },
            config,
            { horizonte: 30 }
          )
        : null,
    [dados, config]
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
      />

      {/* KPIs: clicaveis, filtram o calendario abaixo */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
        <div className="mb-4 flex flex-wrap items-center gap-3">
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
                                            <p className="truncate text-sm text-slate-800">
                                              {i.descricao}
                                            </p>
                                            <p className="mt-0.5 text-xs text-slate-500">
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
