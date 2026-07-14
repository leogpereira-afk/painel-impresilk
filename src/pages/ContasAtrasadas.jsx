// Contas Atrasadas: quem esta devendo, por que, e o que fazer agora.
// Conclusao primeiro. Todo o calculo vem de calcContasAtrasadas e recalcula ao
// vivo quando o usuario marca motivo, marca cobrado ou muda a config.

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Clock,
  Repeat,
  Timer,
  Gauge,
  Phone,
  CheckCircle2,
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
import { moeda, numero } from "../lib/format.js";
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

  const vm = useMemo(
    () =>
      dados
        ? calcContasAtrasadas(dados.recebiveis, overridesRecebiveis, config)
        : null,
    [dados, overridesRecebiveis, config]
  );

  const titulosFiltrados = useMemo(() => {
    if (!vm) return [];
    const min = Number(diasMin) || 0;
    return vm.titulos.filter((t) => {
      if (filtro === "pendentes") return !t.cobrado;
      if (filtro === "reincidentes") return t.reincidente;
      if (filtro === "acima") return t.dias >= min;
      return true;
    });
  }, [vm, filtro, diasMin]);

  if (erro) return <ErroModulo mensagem={erro} aoTentar={recarregar} />;
  if (!pronto || !vm) return <CarregandoModulo />;

  const k = vm.kpis;
  const tomDso =
    k.dso <= k.dsoMeta ? "ok" : k.dso <= k.dsoAlerta ? "warn" : "bad";

  const opcoesFiltro = [
    { valor: "todos", rotulo: "Todos" },
    { valor: "pendentes", rotulo: "Pendentes" },
    { valor: "reincidentes", rotulo: "Reincidentes" },
    { valor: "acima", rotulo: "Acima de X dias" },
  ];

  return (
    <div className="space-y-8">
      <PageTitle
        titulo="Contas Atrasadas"
        descricao="Quem esta devendo, por que, e o que fazer agora."
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard
          rotulo="Total atrasado"
          valor={moeda(k.totalAtrasado)}
          sub={`${numero(k.qtd)} titulos em aberto`}
          tom="brand"
          icone={AlertTriangle}
        />
        <StatCard
          rotulo="Pendentes de cobranca"
          valor={numero(k.pendentesQtd)}
          sub={moeda(k.pendentesValor)}
          tom="warn"
          icone={Clock}
        />
        <StatCard
          rotulo="Reincidentes"
          valor={numero(k.reincidentesQtd)}
          sub={moeda(k.reincidentesValor)}
          tom="bad"
          icone={Repeat}
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
          sub={k.maiorAtrasoCliente || "sem atrasos"}
          tom="neutral"
          icone={Timer}
        />
      </div>

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
                pct={
                  k.totalAtrasado
                    ? Math.round((m.valor / k.totalAtrasado) * 100)
                    : 0
                }
                tom={tomDoGrupo(m.grupo)}
                sub={`${numero(m.qtd)} ${m.qtd === 1 ? "titulo" : "titulos"}`}
              />
            ))}
          </div>
        ) : (
          <Empty>Sem motivos registrados.</Empty>
        )}
      </Card>

      {/* Idade dos atrasos */}
      <Card>
        <SectionTitle
          titulo="Idade dos atrasos"
          sub="Quanto mais velho o atraso, mais dificil recuperar."
        />
        {vm.idade.some((f) => f.qtd > 0) ? (
          <div className="space-y-4">
            {vm.idade.map((f) => {
              const maxValor = Math.max(...vm.idade.map((x) => x.valor), 1);
              return (
                <BarRow
                  key={f.faixa}
                  rotulo={f.faixa}
                  valorTexto={moeda(f.valor)}
                  pct={Math.round((f.valor / maxValor) * 100)}
                  tom={f.alto ? "bad" : "brand"}
                  sub={`${numero(f.qtd)} ${f.qtd === 1 ? "titulo" : "titulos"}`}
                />
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
                      <span className="kpi-value text-2xl text-slate-900">
                        {moeda(f.soma)}
                      </span>
                      <span className="mb-1 text-sm text-slate-500">
                        {numero(f.qtd)} {f.qtd === 1 ? "titulo" : "titulos"}
                      </span>
                    </div>
                    {f.clientes.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {f.clientes.slice(0, 6).map((c) => (
                          <span key={c} className="chip">
                            {c}
                          </span>
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
                  <p className="font-display text-sm font-semibold text-slate-900">
                    {c.cliente}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-500">
                    <Phone size={14} strokeWidth={2.2} className="text-brand" />
                    {c.acao}
                  </p>
                </div>
                <div className="text-right">
                  <p className="tnum text-sm font-semibold text-slate-900">
                    {moeda(c.valor)}
                  </p>
                  <p className="text-xs text-slate-500">{numero(c.dias)} dias</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Nenhuma cobranca pendente. Tudo em dia.</Empty>
        )}
      </Card>

      {/* Titulos */}
      <Card>
        <SectionTitle
          titulo="Titulos"
          sub="Classifique o motivo e marque o que ja foi cobrado."
          acao={
            <Segmented
              opcoes={opcoesFiltro}
              valor={filtro}
              onChange={setFiltro}
            />
          }
        />

        {filtro === "acima" && (
          <div className="mb-4 flex items-center gap-2">
            <label className="label mb-0">Atraso a partir de</label>
            <input
              type="number"
              min={1}
              value={diasMin}
              onChange={(e) => setDiasMin(e.target.value)}
              className="input w-24"
            />
            <span className="text-sm text-slate-500">dias</span>
          </div>
        )}

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
                {titulosFiltrados.map((t) => (
                  <tr key={t.id}>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <span className="font-display font-medium text-slate-900">
                          {t.cliente}
                        </span>
                        {t.reincidente && (
                          <span className="chip chip-warn shrink-0">
                            reincidente
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        NF {t.nf}, OS {t.os}
                      </p>
                    </td>
                    <td className="td text-right tnum font-semibold text-slate-900">
                      {moeda(t.valor)}
                    </td>
                    <td className="td text-right tnum text-slate-700">
                      {numero(t.dias)} dias
                    </td>
                    <td className="td">
                      <select
                        className="select"
                        value={t.motivoId || ""}
                        onChange={(e) =>
                          setOverrideRecebivel(t.id, {
                            motivoId: e.target.value || null,
                          })
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
                    <td className="td text-sm text-slate-600">
                      {t.proximaAcao}
                    </td>
                    <td className="td text-right">
                      {t.cobrado ? (
                        <span className="chip chip-ok inline-flex items-center gap-1">
                          <CheckCircle2 size={13} strokeWidth={2.4} />
                          Cobrado
                        </span>
                      ) : (
                        <button
                          className="btn-outline"
                          onClick={() =>
                            setOverrideRecebivel(t.id, { cobrado: true })
                          }
                        >
                          Marcar cobrado
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Nenhum titulo neste filtro.</Empty>
        )}
      </Card>

      {/* Curva do DSO */}
      <Card>
        <SectionTitle
          titulo="Curva do DSO"
          sub="Prazo medio de recebimento nos ultimos meses, contra a meta."
        />
        <div style={{ width: "100%", height: 260 }}>
          <ResponsiveContainer>
            <LineChart
              data={vm.dsoHistorico}
              margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
            >
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
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid #e2e8f0",
                  fontSize: 13,
                }}
              />
              <ReferenceLine
                y={k.dsoMeta}
                stroke="#94a3b8"
                strokeDasharray="4 4"
                label={{
                  value: "meta",
                  position: "right",
                  fontSize: 11,
                  fill: "#94a3b8",
                }}
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
    </div>
  );
}
