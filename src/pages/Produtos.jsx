// Produtos: o que mais fatura e para onde a tendencia aponta. Conclusao primeiro.

import { useMemo, useState } from "react";
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
import { AlertTriangle, CheckCircle2, TrendingUp, TrendingDown } from "lucide-react";
import { useApp } from "../config/store.jsx";
import { calcProdutos } from "../lib/calc/produtos.js";
import { moeda, numero } from "../lib/format.js";
import { Card, PageTitle, SectionTitle, DeltaBadge, Segmented, BarRow, Empty, CarregandoModulo, ErroModulo } from "../components/ui.jsx";

const VERDE = "#16a34a";
const VERMELHO = "#dc2626";
const CINZA = "#94a3b8";

// Tooltip do grafico de tendencia: valores em R$.
function TooltipTendencia({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-xl border bg-white px-3 py-2 shadow-lg" style={{ borderColor: "var(--hairline)" }}>
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

export default function Produtos() {
  const { config, dados, pronto, erro, recarregar } = useApp();
  const [metrica, setMetrica] = useState("faturamento");

  const vm = useMemo(
    () => (dados ? calcProdutos(dados.ordens, dados.catalogo, config) : null),
    [dados, config]
  );

  if (erro) return <ErroModulo mensagem={erro} aoTentar={recarregar} />;
  if (!pronto || !vm) return <CarregandoModulo />;

  const porFaturamento = metrica === "faturamento";

  // Ranking reordenado conforme a metrica escolhida.
  const lista = porFaturamento ? vm.ranking : [...vm.ranking].sort((a, b) => b.volume - a.volume);
  const topo = lista[0];
  const maxValor = topo ? (porFaturamento ? topo.faturamento : topo.volume) : 0;

  const lider = vm.lider;

  return (
    <div className="space-y-8">
      <PageTitle
        titulo="Produtos"
        descricao="O que mais fatura e para onde a tendencia aponta."
      />

      {/* Alerta condicional sobre o produto lider */}
      {lider && vm.liderEmQueda ? (
        <Card className="border-bad-200 bg-bad-50/60">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-bad-100 text-bad-700">
              <AlertTriangle size={20} strokeWidth={2.2} />
            </span>
            <div>
              <p className="font-display font-semibold text-bad-700">
                Atencao: o produto lider em faturamento ({lider.nome}) esta em queda ({lider.varFat}% desde janeiro).
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Ele responde por {moeda(lider.faturamento)} no ano. Vale investigar antes que a queda pese no total.
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
      <section>
        <SectionTitle
          titulo="Ranking"
          sub={porFaturamento ? "Ordenado por faturamento no ano" : "Ordenado por volume no ano"}
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
          {lista.length === 0 ? (
            <Empty>Nenhum produto com movimento no periodo.</Empty>
          ) : (
            <div className="space-y-5">
              {lista.map((r, i) => {
                const valor = porFaturamento ? r.faturamento : r.volume;
                const varMetrica = porFaturamento ? r.varFat : r.varVol;
                const valorTexto = porFaturamento ? moeda(r.faturamento) : `${numero(r.volume)} un`;
                const barPct = maxValor > 0 ? (valor / maxValor) * 100 : 0;
                return (
                  <div key={r.produtoId}>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="tnum shrink-0 font-display text-sm font-semibold text-slate-400">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="truncate font-display font-semibold text-slate-900">{r.nome}</span>
                        {r.categoria && <span className="chip shrink-0">{r.categoria}</span>}
                      </div>
                      {varMetrica == null ? (
                        <span className="chip-ok shrink-0" title="Produto sem base em janeiro para comparar">
                          novo
                        </span>
                      ) : (
                        <DeltaBadge pct={varMetrica} />
                      )}
                    </div>
                    <BarRow
                      rotulo={
                        i === 0
                          ? "Lider"
                          : Math.round(barPct) < 1
                            ? "menos de 1% do lider"
                            : `${Math.round(barPct)}% do lider`
                      }
                      valorTexto={valorTexto}
                      pct={barPct}
                      tom={i === 0 ? "brand" : "neutral"}
                    />
                  </div>
                );
              })}
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
          {vm.chartData.length === 0 || !vm.maiorAlta || !vm.maiorQueda ? (
            <Empty>Sem historico suficiente para desenhar a tendencia.</Empty>
          ) : (
            <>
              <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <div className="flex items-center gap-3 rounded-xl bg-ok-50/60 p-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ok-100 text-ok-700">
                    <TrendingUp size={18} strokeWidth={2.2} />
                  </span>
                  <div className="min-w-0">
                    <p className="label mb-0">Maior alta</p>
                    <p className="truncate font-display font-semibold text-slate-900">
                      {vm.maiorAlta.nome} <span className="text-ok-700">({vm.maiorAlta.varFat >= 0 ? "+" : ""}{vm.maiorAlta.varFat}%)</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl bg-bad-50/60 p-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-bad-100 text-bad-700">
                    <TrendingDown size={18} strokeWidth={2.2} />
                  </span>
                  <div className="min-w-0">
                    <p className="label mb-0">Maior queda</p>
                    <p className="truncate font-display font-semibold text-slate-900">
                      {vm.maiorQueda.nome} <span className="text-bad-700">({vm.maiorQueda.varFat}%)</span>
                    </p>
                  </div>
                </div>
              </div>
              <div style={{ width: "100%", height: 260 }}>
                <ResponsiveContainer>
                  <LineChart data={vm.chartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
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
                      name={vm.maiorAlta.nome}
                      stroke={VERDE}
                      strokeWidth={2.4}
                      dot={{ r: 3, fill: VERDE }}
                      activeDot={{ r: 5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="queda"
                      name={vm.maiorQueda.nome}
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
