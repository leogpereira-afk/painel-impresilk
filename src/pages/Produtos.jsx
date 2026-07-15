// Produtos: o que mais fatura e para onde a tendencia aponta. Conclusao primeiro.
//
// A tela e navegavel: os KPIs do topo sao FILTROS clicaveis, ha busca por nome,
// os chips de categoria filtram o ranking e cada produto expande com o detalhe
// (janeiro contra o ultimo mes fechado, serie mensal e participacao no total).

import { Fragment, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  ChevronRight,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { useApp } from "../config/store.jsx";
import { calcProdutos } from "../lib/calc/produtos.js";
import { moeda, numero, pct } from "../lib/format.js";
import {
  Card,
  PageTitle,
  SectionTitle,
  StatCard,
  DeltaBadge,
  Segmented,
  BarRow,
  Empty,
  CarregandoModulo,
  ErroModulo,
} from "../components/ui.jsx";

const MARCA = "#3840E8";
const VERDE = "#16a34a";
const VERMELHO = "#dc2626";
const CINZA = "#94a3b8";

const LOTE = 25;

// Normaliza para busca (sem acento, minusculo).
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

// Tooltip do grafico de tendencia: valores em R$.
function TooltipTendencia({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div
      className="rounded-xl border bg-white px-3 py-2 shadow-lg"
      style={{ borderColor: "var(--hairline)" }}
    >
      <p className="mb-1 font-display text-xs font-semibold text-slate-500">{label}</p>
      {payload.map((s) => (
        <div key={s.dataKey} className="flex items-center gap-2 text-sm">
          <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
          <span className="text-slate-600">{s.name}</span>
          <span className="tnum ml-auto font-semibold text-slate-900">{moeda(s.value)}</span>
        </div>
      ))}
    </div>
  );
}

// Tooltip do mini grafico da linha expandida.
function TooltipMini({ active, payload, label, porFaturamento }) {
  if (!active || !payload || !payload.length) return null;
  const v = payload[0].value;
  return (
    <div
      className="rounded-xl border bg-white px-3 py-2 shadow-lg"
      style={{ borderColor: "var(--hairline)" }}
    >
      <p className="font-display text-xs font-semibold text-slate-500">{label}</p>
      <p className="tnum text-sm font-semibold text-slate-900">
        {porFaturamento ? moeda(v) : `${numero(v)} un`}
      </p>
    </div>
  );
}

export default function Produtos() {
  const { config, dados, pronto, erro, recarregar } = useApp();

  const [dimensao, setDimensao] = useState("produto"); // produto | familia
  const [metrica, setMetrica] = useState("faturamento");
  const [filtro, setFiltro] = useState("todos"); // todos | queda | novos
  const [categoria, setCategoria] = useState(null);
  const [busca, setBusca] = useState("");
  const [expandido, setExpandido] = useState(null);
  const [limite, setLimite] = useState(LOTE);
  const rankingRef = useRef(null);

  const vm = useMemo(
    () => (dados ? calcProdutos(dados.ordens, dados.catalogo, config) : null),
    [dados, config]
  );

  const porFaturamento = metrica === "faturamento";

  // Dimensao ativa: produto (item do cadastro) ou familia (a categoria/segmento).
  // Um produto pode vender bem e a familia dele nao, por isso as duas visoes.
  const dim = vm ? (dimensao === "familia" ? vm.familias : vm.produtos) : null;
  const ehFamilia = dimensao === "familia";
  const termo = ehFamilia ? "familias" : "produtos";

  // Ranking reordenado conforme a metrica escolhida, com a posicao original
  // preservada para o numero e a barra "% do lider" nao mudarem com o filtro.
  const listaOrdenada = useMemo(() => {
    if (!dim) return [];
    const base = porFaturamento
      ? dim.ranking
      : [...dim.ranking].sort((a, b) => b.volume - a.volume);
    return base.map((r, i) => ({ ...r, posicao: i + 1 }));
  }, [dim, porFaturamento]);

  const listaFiltrada = useMemo(() => {
    const q = norm(busca.trim());
    return listaOrdenada.filter((r) => {
      if (filtro === "queda" && !(r.varFat != null && r.varFat < 0)) return false;
      if (filtro === "novos" && r.varFat != null) return false;
      if (categoria && r.categoria !== categoria) return false;
      if (q && !norm(r.nome).includes(q)) return false;
      return true;
    });
  }, [listaOrdenada, filtro, categoria, busca]);

  if (erro) return <ErroModulo mensagem={erro} aoTentar={recarregar} />;
  if (!pronto || !vm || !dim) return <CarregandoModulo />;

  const topo = listaOrdenada[0];
  const maxValor = topo ? (porFaturamento ? topo.faturamento : topo.volume) : 0;
  const lider = dim.lider;

  const qtdEmQueda = dim.ranking.filter((r) => r.varFat != null && r.varFat < 0).length;
  const qtdNovos = dim.ranking.filter((r) => r.varFat == null).length;

  const temFiltro = filtro !== "todos" || !!categoria || !!busca;
  const limparTudo = () => {
    setFiltro("todos");
    setCategoria(null);
    setBusca("");
    setLimite(LOTE);
  };
  const irParaRanking = () =>
    rankingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  // Clique num KPI liga/desliga o filtro correspondente e leva para o ranking.
  // Limpa categoria e busca para o KPI ser um filtro previsivel.
  const alternarFiltro = (novo) => {
    setFiltro((f) => (f === novo ? "todos" : novo));
    setCategoria(null);
    setBusca("");
    setLimite(LOTE);
    irParaRanking();
  };

  const alternarCategoria = (cat) => {
    setCategoria((c) => (c === cat ? null : cat));
    setLimite(LOTE);
  };

  const somaFiltrada = listaFiltrada.reduce(
    (s, r) => s + (porFaturamento ? r.faturamento : r.volume),
    0
  );
  const visiveis = listaFiltrada.slice(0, limite);
  const restantes = listaFiltrada.length - visiveis.length;

  return (
    <div className="space-y-8">
      <PageTitle
        titulo="Produtos"
        descricao="O que mais fatura e para onde a tendencia aponta. Clique nos numeros para filtrar o ranking."
        acao={
          <Segmented
            opcoes={[
              { valor: "produto", rotulo: "Produtos" },
              { valor: "familia", rotulo: "Familias" },
            ]}
            valor={dimensao}
            onChange={(v) => {
              setDimensao(v);
              // Os filtros sao da outra dimensao: comecar limpo evita "0 itens".
              limparTudo();
              setExpandido(null);
            }}
          />
        }
      />

      {/* Explica a leitura da familia: um produto pode vender e o segmento nao. */}
      {ehFamilia && (
        <p className="-mt-4 text-sm text-slate-500">
          Faturamento por familia (o segmento do cadastro do Mubisys). Serve para ver se o
          segmento inteiro sustenta, e nao so um produto dentro dele.
        </p>
      )}

      {/* KPIs: clicaveis, filtram o ranking abaixo */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard
          rotulo="Faturamento no ano"
          valor={moeda(dim.totalFaturamento)}
          sub={`${numero(dim.totalVolume)} unidades no ano`}
          tom="brand"
          icone={DollarSign}
          ativo={porFaturamento}
          onClick={() => {
            setMetrica(porFaturamento ? "volume" : "faturamento");
            irParaRanking();
          }}
        />
        <StatCard
          rotulo={ehFamilia ? "Familias com movimento" : "Produtos com movimento"}
          valor={numero(dim.ranking.length)}
          sub={temFiltro ? "clique para ver todos" : "todos no ranking"}
          tom="neutral"
          icone={Package}
          ativo={!temFiltro}
          onClick={() => {
            limparTudo();
            irParaRanking();
          }}
        />
        <StatCard
          rotulo="Em queda"
          valor={numero(qtdEmQueda)}
          sub={`${numero(qtdNovos)} sem base em janeiro`}
          tom="bad"
          icone={TrendingDown}
          ativo={filtro === "queda"}
          onClick={() => alternarFiltro("queda")}
        />
      </div>

      {/* Alerta condicional sobre o produto lider */}
      {lider && dim.liderEmQueda ? (
        <Card className="border-bad-200 bg-bad-50/60">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-bad-100 text-bad-700">
              <AlertTriangle size={20} strokeWidth={2.2} />
            </span>
            <div>
              <p className="font-display font-semibold text-bad-700">
                Atencao: {ehFamilia ? "a familia lider" : "o produto lider"} em faturamento ({lider.nome}) esta em queda (
                {lider.varFat}% desde janeiro).
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Ele responde por {moeda(lider.faturamento)} no ano. Vale investigar antes que a
                queda pese no total.
              </p>
            </div>
          </div>
        </Card>
      ) : lider ? (
        <Card className="border-ok-200 bg-ok-50/50">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ok-100 text-ok-700">
              <CheckCircle2 size={20} strokeWidth={2.2} />
            </span>
            <div>
              <p className="font-display font-semibold text-ok-700">
                Lider saudavel: {lider.nome} segue no topo
                {lider.varFat == null
                  ? " (produto novo, sem base em janeiro para comparar)."
                  : ` (${lider.varFat >= 0 ? "+" : ""}${lider.varFat}% desde janeiro).`}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Responde por {moeda(lider.faturamento)} do faturamento no ano.
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      {/* Ranking */}
      <section ref={rankingRef}>
        <SectionTitle
          titulo="Ranking"
          sub={
            porFaturamento
              ? `Ordenado por faturamento no ano. Clique n${ehFamilia ? "a familia" : "o produto"} para ver o detalhe.`
              : `Ordenado por volume no ano. Clique n${ehFamilia ? "a familia" : "o produto"} para ver o detalhe.`
          }
          acao={
            <Segmented
              opcoes={[
                { valor: "faturamento", rotulo: "Faturamento" },
                { valor: "volume", rotulo: "Volume" },
              ]}
              valor={metrica}
              onChange={setMetrica}
            />
          }
        />
        <Card>
          {/* Busca e atalhos */}
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
                  setLimite(LOTE);
                }}
                placeholder={ehFamilia ? "Buscar familia" : "Buscar produto"}
                className="input pl-9"
                aria-label={ehFamilia ? "Buscar familia" : "Buscar produto"}
              />
            </div>

            {qtdNovos > 0 && (
              <button
                className={
                  filtro === "novos"
                    ? "btn-primary"
                    : "btn-outline"
                }
                aria-pressed={filtro === "novos"}
                onClick={() => alternarFiltro("novos")}
                title="Produtos sem base em janeiro para comparar"
              >
                <Sparkles size={15} /> Novos ({numero(qtdNovos)})
              </button>
            )}

            {temFiltro && (
              <button className="btn-ghost" onClick={limparTudo}>
                <X size={15} /> Limpar filtros
              </button>
            )}
          </div>

          {/* Resumo do que esta na tela */}
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span>
              Mostrando{" "}
              <strong className="tnum text-slate-900">{numero(listaFiltrada.length)}</strong> de{" "}
              {numero(listaOrdenada.length)} {termo}
              {listaFiltrada.length > 0 && (
                <>
                  {" "}
                  ·{" "}
                  <strong className="tnum text-slate-900">
                    {porFaturamento ? moeda(somaFiltrada) : `${numero(somaFiltrada)} un`}
                  </strong>
                </>
              )}
            </span>
            {filtro === "queda" && (
              <button className="chip-bad" onClick={() => setFiltro("todos")}>
                em queda <X size={12} />
              </button>
            )}
            {filtro === "novos" && (
              <button className="chip-ok" onClick={() => setFiltro("todos")}>
                novos <X size={12} />
              </button>
            )}
            {categoria && (
              <button className="chip-warn" onClick={() => setCategoria(null)}>
                categoria: {categoria} <X size={12} />
              </button>
            )}
            {busca && (
              <button className="chip" onClick={() => setBusca("")}>
                busca: {busca} <X size={12} />
              </button>
            )}
          </div>

          {listaOrdenada.length === 0 ? (
            <Empty>Nenhum{ehFamilia ? "a familia" : " produto"} com movimento no periodo.</Empty>
          ) : listaFiltrada.length === 0 ? (
            <Empty>
              Nenhum produto neste filtro.
              <button className="btn-ghost ml-2" onClick={limparTudo}>
                Limpar filtros
              </button>
            </Empty>
          ) : (
            <div className="space-y-5">
              {visiveis.map((r) => {
                const aberto = expandido === r.produtoId;
                const valor = porFaturamento ? r.faturamento : r.volume;
                const varMetrica = porFaturamento ? r.varFat : r.varVol;
                const valorTexto = porFaturamento
                  ? moeda(r.faturamento)
                  : `${numero(r.volume)} un`;
                const barPct = maxValor > 0 ? (valor / maxValor) * 100 : 0;
                return (
                  <Fragment key={r.produtoId}>
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={aberto}
                      onClick={() => setExpandido(aberto ? null : r.produtoId)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setExpandido(aberto ? null : r.produtoId);
                        }
                      }}
                      className="-mx-2 cursor-pointer rounded-xl px-2 py-2 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <ChevronRight
                            size={16}
                            strokeWidth={2.4}
                            className={`shrink-0 text-slate-400 transition-transform ${aberto ? "rotate-90" : ""}`}
                          />
                          <span className="tnum shrink-0 font-display text-sm font-semibold text-slate-400">
                            {String(r.posicao).padStart(2, "0")}
                          </span>
                          <span className="truncate font-display font-semibold text-slate-900">
                            {r.nome}
                          </span>
                          {/* Na visao de familia a linha JA e a categoria: chip seria redundante. */}
                          {!ehFamilia && r.categoria && (
                            <span onClick={(e) => e.stopPropagation()}>
                              <button
                                className={`chip shrink-0 transition-colors hover:bg-slate-200 ${categoria === r.categoria ? "ring-1 ring-brand" : ""}`}
                                aria-pressed={categoria === r.categoria}
                                onClick={() => alternarCategoria(r.categoria)}
                                title="Filtrar por esta familia"
                              >
                                {r.categoria}
                              </button>
                            </span>
                          )}
                          {/* Balde de itens sem cadastro no ERP: aparece (o valor e real),
                              mas nunca e eleito lider, senao o destaque perde o sentido. */}
                          {r.balde && (
                            <span
                              className="chip-warn shrink-0"
                              title="Itens sem produto cadastrado no Mubisys (frete, servicos avulsos). Nao e um produto nem um segmento."
                            >
                              sem cadastro
                            </span>
                          )}
                        </div>
                        {varMetrica == null ? (
                          <span
                            className="chip-ok shrink-0"
                            title="Produto sem base em janeiro para comparar"
                          >
                            novo
                          </span>
                        ) : (
                          <DeltaBadge pct={varMetrica} />
                        )}
                      </div>
                      <BarRow
                        rotulo={
                          r.posicao === 1
                            ? "Lider"
                            : Math.round(barPct) < 1
                              ? "menos de 1% do lider"
                              : `${Math.round(barPct)}% do lider`
                        }
                        valorTexto={valorTexto}
                        pct={barPct}
                        tom={r.posicao === 1 ? "brand" : "neutral"}
                      />
                    </div>

                    {aberto && (
                      <div
                        className="rounded-xl border bg-slate-50 p-4"
                        style={{ borderColor: "var(--hairline)" }}
                      >
                        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
                          <Detalhe rotulo="Faturamento no ano" valor={moeda(r.faturamento)} />
                          <Detalhe rotulo="Volume no ano" valor={`${numero(r.volume)} un`} />
                          <Detalhe
                            rotulo="Participacao no faturamento"
                            valor={
                              dim.totalFaturamento > 0
                                ? pct((r.faturamento / dim.totalFaturamento) * 100, 1)
                                : "sem base"
                            }
                          />
                          <Detalhe
                            rotulo="Faturamento: janeiro x ultimo mes fechado"
                            valor={`${moeda(r.fatJaneiro)} para ${moeda(r.fatAtual)}`}
                          />
                          <Detalhe
                            rotulo="Volume: janeiro x ultimo mes fechado"
                            valor={`${numero(r.volJaneiro)} un para ${numero(r.volAtual)} un`}
                          />
                          <Detalhe
                            rotulo="Variacao desde janeiro"
                            valor={
                              porFaturamento
                                ? r.varFat == null
                                  ? "produto novo, sem base em janeiro"
                                  : `${r.varFat >= 0 ? "+" : ""}${r.varFat}% no faturamento`
                                : r.varVol == null
                                  ? "produto novo, sem base em janeiro"
                                  : `${r.varVol >= 0 ? "+" : ""}${r.varVol}% no volume`
                            }
                          />
                          <Detalhe rotulo="Categoria" valor={r.categoria || "sem categoria"} />
                        </dl>

                        <div
                          className="mt-3 border-t pt-3"
                          style={{ borderColor: "var(--hairline)" }}
                        >
                          <p className="label mb-1">
                            {porFaturamento
                              ? "Faturamento mes a mes"
                              : "Volume mes a mes"}
                          </p>
                          {r.serie.length >= 2 ? (
                            <div style={{ width: "100%", height: 140 }}>
                              <ResponsiveContainer>
                                <LineChart
                                  data={r.serie}
                                  margin={{ top: 8, right: 12, left: 4, bottom: 0 }}
                                >
                                  <CartesianGrid
                                    strokeDasharray="3 3"
                                    stroke="#eef1f6"
                                    vertical={false}
                                  />
                                  <XAxis
                                    dataKey="mes"
                                    tick={{ fontSize: 11, fill: CINZA }}
                                    axisLine={{ stroke: "#e2e8f0" }}
                                    tickLine={false}
                                  />
                                  <YAxis
                                    tick={{ fontSize: 11, fill: CINZA }}
                                    axisLine={false}
                                    tickLine={false}
                                    width={porFaturamento ? 64 : 40}
                                    tickFormatter={(v) => (porFaturamento ? moeda(v) : numero(v))}
                                  />
                                  <Tooltip
                                    content={<TooltipMini porFaturamento={porFaturamento} />}
                                  />
                                  <Line
                                    type="monotone"
                                    dataKey={porFaturamento ? "faturamento" : "volume"}
                                    stroke={MARCA}
                                    strokeWidth={2.4}
                                    dot={{ r: 3, fill: MARCA }}
                                    activeDot={{ r: 5 }}
                                  />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          ) : (
                            <Empty>Ainda nao ha meses fechados suficientes para a serie.</Empty>
                          )}
                        </div>
                      </div>
                    )}
                  </Fragment>
                );
              })}

              {restantes > 0 && (
                <button
                  className="btn-outline mx-auto flex"
                  onClick={() => setLimite((l) => l + LOTE)}
                >
                  Mostrar mais ({numero(restantes)} restantes)
                </button>
              )}
            </div>
          )}
        </Card>
      </section>

      {/* Tendencia mes a mes */}
      <section>
        <SectionTitle
          titulo="Tendencia mes a mes"
          sub="Maior alta contra maior queda desde janeiro"
        />
        <Card>
          {dim.chartData.length === 0 || !dim.maiorAlta || !dim.maiorQueda ? (
            <Empty>Sem historico suficiente para desenhar a tendencia.</Empty>
          ) : (
            <>
              <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <button
                  className="flex items-center gap-3 rounded-xl bg-ok-50/60 p-3 text-left transition-colors hover:bg-ok-50"
                  onClick={() => {
                    limparTudo();
                    setBusca(dim.maiorAlta.nome);
                    setExpandido(dim.maiorAlta.produtoId);
                    irParaRanking();
                  }}
                  title="Ver este produto no ranking"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ok-100 text-ok-700">
                    <TrendingUp size={18} strokeWidth={2.2} />
                  </span>
                  <div className="min-w-0">
                    <p className="label mb-0">Maior alta</p>
                    <p className="truncate font-display font-semibold text-slate-900">
                      {dim.maiorAlta.nome}{" "}
                      <span className="text-ok-700">
                        ({dim.maiorAlta.varFat >= 0 ? "+" : ""}
                        {dim.maiorAlta.varFat}%)
                      </span>
                    </p>
                  </div>
                </button>
                <button
                  className="flex items-center gap-3 rounded-xl bg-bad-50/60 p-3 text-left transition-colors hover:bg-bad-50"
                  onClick={() => {
                    limparTudo();
                    setBusca(dim.maiorQueda.nome);
                    setExpandido(dim.maiorQueda.produtoId);
                    irParaRanking();
                  }}
                  title="Ver este produto no ranking"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-bad-100 text-bad-700">
                    <TrendingDown size={18} strokeWidth={2.2} />
                  </span>
                  <div className="min-w-0">
                    <p className="label mb-0">Maior queda</p>
                    <p className="truncate font-display font-semibold text-slate-900">
                      {dim.maiorQueda.nome}{" "}
                      <span className="text-bad-700">({dim.maiorQueda.varFat}%)</span>
                    </p>
                  </div>
                </button>
              </div>
              <div style={{ width: "100%", height: 260 }}>
                <ResponsiveContainer>
                  <LineChart data={dim.chartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef1f6" vertical={false} />
                    <XAxis
                      dataKey="mes"
                      tick={{ fontSize: 12, fill: CINZA }}
                      axisLine={{ stroke: "#e2e8f0" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: CINZA }}
                      axisLine={false}
                      tickLine={false}
                      width={64}
                      tickFormatter={(v) => moeda(v)}
                    />
                    <Tooltip content={<TooltipTendencia />} />
                    <Legend iconType="plainline" wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
                    <Line
                      type="monotone"
                      dataKey="alta"
                      name={dim.maiorAlta.nome}
                      stroke={VERDE}
                      strokeWidth={2.4}
                      dot={{ r: 3, fill: VERDE }}
                      activeDot={{ r: 5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="queda"
                      name={dim.maiorQueda.nome}
                      stroke={VERMELHO}
                      strokeWidth={2.4}
                      dot={{ r: 3, fill: VERMELHO }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </Card>
      </section>
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
