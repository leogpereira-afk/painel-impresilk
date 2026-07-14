// Contas Atrasadas: quem esta devendo, por que, e o que fazer agora.
// Conclusao primeiro. Todo o calculo vem de calcContasAtrasadas e recalcula ao
// vivo quando o usuario marca motivo, marca cobrado ou muda a config.
//
// A tela e navegavel: os KPIs do topo e as faixas de idade sao FILTROS
// clicaveis, ha busca por empresa, e cada linha de titulo expande com os
// detalhes. A lista de titulos vem logo abaixo do painel de numeros.

import { Fragment, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Clock,
  Repeat,
  Timer,
  Gauge,
  Phone,
  CheckCircle2,
  ChevronRight,
  Search,
  X,
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
import { calcContasAtrasadas } from "../lib/calc/contasAtrasadas.js";
import { moeda, numero, dataLonga } from "../lib/format.js";
import {
  Card,
  PageTitle,
  SectionTitle,
  StatCard,
  BarRow,
  Segmented,
  Empty,
  CarregandoModulo,
  ErroModulo,
} from "../components/ui.jsx";

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
  } = useApp();

  const [filtro, setFiltro] = useState("todos");
  const [diasMin, setDiasMin] = useState(30);
  const [busca, setBusca] = useState("");
  const [faixaSel, setFaixaSel] = useState(null); // {faixa, de, ate}
  const [expandido, setExpandido] = useState(null); // id do titulo aberto
  const titulosRef = useRef(null);

  const vm = useMemo(
    () =>
      dados
        ? calcContasAtrasadas(dados.recebiveis, overridesRecebiveis, config, dados.dsoHist)
        : null,
    [dados, overridesRecebiveis, config]
  );

  const titulosFiltrados = useMemo(() => {
    if (!vm) return [];
    const min = Number(diasMin) || 0;
    const q = norm(busca.trim());
    return vm.titulos.filter((t) => {
      if (filtro === "pendentes" && t.cobrado) return false;
      if (filtro === "reincidentes" && !t.reincidente) return false;
      if (filtro === "acima" && t.dias < min) return false;
      if (faixaSel && (t.dias < faixaSel.de || t.dias > faixaSel.ate)) return false;
      if (q) {
        const alvo = norm(`${t.cliente} ${t.cnpj} ${t.nf} ${t.os}`);
        if (!alvo.includes(q)) return false;
      }
      return true;
    });
  }, [vm, filtro, diasMin, busca, faixaSel]);

  if (erro) return <ErroModulo mensagem={erro} aoTentar={recarregar} />;
  if (!pronto || !vm) return <CarregandoModulo />;

  const k = vm.kpis;
  const tomDso = k.dso <= k.dsoMeta ? "ok" : k.dso <= k.dsoAlerta ? "warn" : "bad";

  const opcoesFiltro = [
    { valor: "todos", rotulo: "Todos" },
    { valor: "pendentes", rotulo: "Pendentes" },
    { valor: "reincidentes", rotulo: "Reincidentes" },
    { valor: "acima", rotulo: "Acima de X dias" },
  ];

  const temFiltro = filtro !== "todos" || !!busca || !!faixaSel;
  const limparTudo = () => {
    setFiltro("todos");
    setBusca("");
    setFaixaSel(null);
  };
  const irParaTitulos = () =>
    titulosRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

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
        descricao="Quem esta devendo, por que, e o que fazer agora. Clique nos numeros para filtrar a lista."
      />

      {/* KPIs: clicaveis, filtram a lista de titulos abaixo */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard
          rotulo="Total atrasado"
          valor={moeda(k.totalAtrasado)}
          sub={`${numero(k.qtd)} titulos em aberto`}
          tom="brand"
          icone={AlertTriangle}
          ativo={!temFiltro}
          onClick={() => {
            limparTudo();
            irParaTitulos();
          }}
        />
        <StatCard
          rotulo="Pendentes de cobranca"
          valor={numero(k.pendentesQtd)}
          sub={moeda(k.pendentesValor)}
          tom="warn"
          icone={Clock}
          ativo={filtro === "pendentes"}
          onClick={() => alternarFiltro("pendentes")}
        />
        <StatCard
          rotulo="Reincidentes"
          valor={numero(k.reincidentesQtd)}
          sub={moeda(k.reincidentesValor)}
          tom="bad"
          icone={Repeat}
          ativo={filtro === "reincidentes"}
          onClick={() => alternarFiltro("reincidentes")}
        />
        <StatCard
          rotulo="DSO"
          valor={`${k.dso} dias`}
          sub={`meta ${k.dsoMeta} dias`}
          tom={tomDso}
          icone={Gauge}
          tendencia={k.dsoTendencia}
        />
        <StatCard
          rotulo="Maior atraso"
          valor={`${numero(k.maiorAtrasoDias)} dias`}
          sub={k.maiorAtrasoCliente}
          tom="neutral"
          icone={Timer}
          ativo={!!busca && busca === k.maiorAtrasoCliente}
          onClick={() => {
            setFiltro("todos");
            setFaixaSel(null);
            setBusca((b) => (b === k.maiorAtrasoCliente ? "" : k.maiorAtrasoCliente));
            irParaTitulos();
          }}
        />
      </div>

      {/* Titulos: logo abaixo do painel de numeros */}
      <Card ref={titulosRef}>
        <SectionTitle
          titulo="Titulos"
          sub="Clique na linha para ver os detalhes. Classifique o motivo e marque o que ja foi cobrado."
          acao={
            <Segmented opcoes={opcoesFiltro} valor={filtro} onChange={setFiltro} />
          }
        />

        {/* Busca por empresa */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar empresa, CNPJ, NF ou OS"
              className="input pl-9"
              aria-label="Buscar empresa"
            />
          </div>

          {filtro === "acima" && (
            <div className="flex items-center gap-2">
              <label className="label mb-0">A partir de</label>
              <input
                type="number"
                min={1}
                value={diasMin}
                onChange={(e) => setDiasMin(e.target.value)}
                className="input w-20"
              />
              <span className="text-sm text-slate-500">dias</span>
            </div>
          )}

          {temFiltro && (
            <button className="btn-ghost" onClick={limparTudo}>
              <X size={15} /> Limpar filtros
            </button>
          )}
        </div>

        {/* Resumo do que esta na tela */}
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <span>
            Mostrando <strong className="tnum text-slate-900">{numero(titulosFiltrados.length)}</strong>{" "}
            de {numero(vm.titulos.length)} titulos
            {titulosFiltrados.length > 0 && (
              <>
                {" "}
                · <strong className="tnum text-slate-900">{moeda(somaFiltrada)}</strong>
              </>
            )}
          </span>
          {faixaSel && (
            <button className="chip-warn" onClick={() => setFaixaSel(null)}>
              idade: {faixaSel.faixa} <X size={12} />
            </button>
          )}
        </div>

        {titulosFiltrados.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr>
                  <th className="th text-left">Cliente</th>
                  <th className="th text-right">Valor</th>
                  <th className="th text-right">Atraso</th>
                  <th className="th text-left">Motivo</th>
                  <th className="th text-left">Proxima acao</th>
                  <th className="th text-right">Acao</th>
                </tr>
              </thead>
              <tbody>
                {titulosFiltrados.map((t) => {
                  const aberto = expandido === t.id;
                  return (
                    <Fragment key={t.id}>
                      <tr
                        onClick={() => setExpandido(aberto ? null : t.id)}
                        className="cursor-pointer transition-colors hover:bg-slate-50"
                        aria-expanded={aberto}
                      >
                        <td className="td">
                          <div className="flex items-center gap-2">
                            <ChevronRight
                              size={16}
                              strokeWidth={2.4}
                              className={`shrink-0 text-slate-400 transition-transform ${aberto ? "rotate-90" : ""}`}
                            />
                            <span className="font-display font-medium text-slate-900">
                              {t.cliente}
                            </span>
                            {t.reincidente && (
                              <span className="chip chip-warn shrink-0">reincidente</span>
                            )}
                          </div>
                          <p className="mt-0.5 pl-6 text-xs text-slate-500">
                            NF {t.nf || "-"}, OS {t.os || "-"}
                          </p>
                        </td>
                        <td className="td text-right tnum font-semibold text-slate-900">
                          {moeda(t.valor)}
                        </td>
                        <td className="td text-right tnum text-slate-700">
                          {numero(t.dias)} dias
                        </td>
                        <td className="td" onClick={(e) => e.stopPropagation()}>
                          <select
                            className="select"
                            value={t.motivoId || ""}
                            onChange={(e) =>
                              setOverrideRecebivel(t.id, { motivoId: e.target.value || null })
                            }
                          >
                            <option value="">Sem motivo</option>
                            {(config.motivosAtraso || []).map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.nome}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="td text-sm text-slate-600">{t.proximaAcao}</td>
                        <td className="td text-right" onClick={(e) => e.stopPropagation()}>
                          {t.cobrado ? (
                            <span className="chip chip-ok inline-flex items-center gap-1">
                              <CheckCircle2 size={13} strokeWidth={2.4} />
                              Cobrado
                            </span>
                          ) : (
                            <button
                              className="btn-outline"
                              onClick={() => setOverrideRecebivel(t.id, { cobrado: true })}
                            >
                              Marcar cobrado
                            </button>
                          )}
                        </td>
                      </tr>

                      {aberto && (
                        <tr>
                          <td colSpan={6} className="px-4 pb-4 pt-0">
                            <div
                              className="rounded-xl border bg-slate-50 p-4"
                              style={{ borderColor: "var(--hairline)" }}
                            >
                              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
                                <Detalhe rotulo="CNPJ / CPF" valor={t.cnpj || "nao informado"} />
                                <Detalhe rotulo="Nota fiscal" valor={t.nf || "sem NF"} />
                                <Detalhe rotulo="Ordem de servico" valor={t.os || "sem OS"} />
                                <Detalhe
                                  rotulo="Emissao"
                                  valor={t.emissao ? dataLonga(t.emissao) : "nao informada"}
                                />
                                <Detalhe
                                  rotulo="Vencimento"
                                  valor={t.vencimento ? dataLonga(t.vencimento) : "nao informado"}
                                />
                                <Detalhe rotulo="Atraso" valor={`${numero(t.dias)} dias`} />
                                <Detalhe rotulo="Classificacao" valor={t.grupoNome} />
                                <Detalhe rotulo="Motivo" valor={t.motivoNome} />
                                <Detalhe
                                  rotulo="Situacao"
                                  valor={t.cobrado ? "ja cobrado" : "pendente de cobranca"}
                                />
                              </dl>
                              <div
                                className="mt-3 border-t pt-3"
                                style={{ borderColor: "var(--hairline)" }}
                              >
                                <p className="label mb-1">Proxima acao sugerida</p>
                                <p className="flex items-center gap-2 text-sm text-slate-700">
                                  <Phone size={14} strokeWidth={2.2} className="text-brand" />
                                  {t.proximaAcao}
                                </p>
                              </div>
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
        ) : (
          <Empty>
            Nenhum titulo neste filtro.
            {temFiltro && (
              <button className="btn-ghost ml-2" onClick={limparTudo}>
                Limpar filtros
              </button>
            )}
          </Empty>
        )}
      </Card>

      {/* Por que estao atrasados */}
      <Card>
        <SectionTitle
          titulo="Por que estao atrasados"
          sub="Distribuicao do valor por origem da causa."
        />
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
      </Card>

      {/* Padroes por motivo */}
      <Card>
        <SectionTitle
          titulo="Padroes por motivo"
          sub="O que mais trava o recebimento, por valor."
        />
        {vm.porMotivo.length ? (
          <div className="space-y-4">
            {vm.porMotivo.map((m) => (
              <BarRow
                key={m.motivoId || "sem"}
                rotulo={m.nome}
                valorTexto={moeda(m.valor)}
                pct={k.totalAtrasado ? Math.round((m.valor / k.totalAtrasado) * 100) : 0}
                tom={tomDoGrupo(m.grupo)}
                sub={`${numero(m.qtd)} ${m.qtd === 1 ? "titulo" : "titulos"}`}
              />
            ))}
          </div>
        ) : (
          <Empty>Sem motivos registrados.</Empty>
        )}
      </Card>

      {/* Idade dos atrasos: cada faixa e um filtro clicavel */}
      <Card>
        <SectionTitle
          titulo="Idade dos atrasos"
          sub="Quanto mais velho o atraso, mais dificil recuperar. Clique numa faixa para ver os titulos."
        />
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
                    sub={`${numero(f.qtd)} ${f.qtd === 1 ? "titulo" : "titulos"}`}
                  />
                </button>
              );
            })}
          </div>
        ) : (
          <Empty>Nenhum titulo atrasado.</Empty>
        )}
      </Card>

      {/* Plano de acao */}
      <section>
        <SectionTitle
          titulo="Plano de acao"
          sub="Quatro frentes, cada uma com um proximo passo claro."
        />
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
                        {numero(f.qtd)} {f.qtd === 1 ? "titulo" : "titulos"}
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
                            title="Ver os titulos deste cliente"
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
      </section>

      {/* Cobrar hoje */}
      <Card>
        <SectionTitle
          titulo="Cobrar hoje"
          sub="Os pendentes de maior valor, com a acao sugerida."
        />
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
                    title="Ver este titulo na lista"
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
          <Empty>Nenhuma cobranca pendente. Tudo em dia.</Empty>
        )}
      </Card>

      {/* Curva do DSO: so com historico REAL acumulado no cache (um ponto/dia). */}
      {vm.dsoHistorico.length >= 2 ? (
        <Card>
          <SectionTitle
            titulo="Curva do DSO"
            sub="Prazo medio de recebimento ao longo dos dias, contra a meta."
          />
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={vm.dsoHistorico} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#eef2f7" vertical={false} />
                <XAxis
                  dataKey="mes"
                  tick={{ fontSize: 12, fill: "#94a3b8" }}
                  tickLine={false}
                  axisLine={{ stroke: "#e2e8f0" }}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "#94a3b8" }}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                />
                <Tooltip
                  formatter={(v) => [`${v} dias`, "DSO"]}
                  contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
                />
                <ReferenceLine
                  y={k.dsoMeta}
                  stroke="#94a3b8"
                  strokeDasharray="4 4"
                  label={{ value: "meta", position: "right", fontSize: 11, fill: "#94a3b8" }}
                />
                <Line
                  type="monotone"
                  dataKey="dso"
                  stroke={MARCA}
                  strokeWidth={2.4}
                  dot={{ r: 3, fill: MARCA }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      ) : (
        <Card>
          <SectionTitle titulo="Curva do DSO" sub="Prazo medio de recebimento ao longo do tempo." />
          <Empty>
            O historico de DSO comeca a ser registrado agora, um ponto por dia. A curva aparece
            assim que houver alguns dias acumulados.
          </Empty>
        </Card>
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
