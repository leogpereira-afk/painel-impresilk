// Fluxo de Caixa: projecao dos proximos 30 dias com a regra D-1. Dois calculos
// memorizados (normal e estresse). O modo estresse zera os recebiveis incertos
// (clientes que ja tem titulo vencido) e mostra o impacto no menor saldo.

import { useMemo, useState } from "react";
import {
  Wallet,
  Clock,
  AlertTriangle,
  ShieldAlert,
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

export default function FluxoCaixa() {
  const { config, dados, pronto, erro, recarregar } = useApp();
  const [modoEstresse, setModoEstresse] = useState(false);

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

  if (erro) return <ErroModulo mensagem={erro} aoTentar={recarregar} />;
  if (!pronto || !base || !estresse) return <CarregandoModulo />;

  // Fonte ativa para KPIs, calendario e linha principal do grafico.
  const vm = modoEstresse ? estresse : base;
  const k = vm.kpis;
  const colchao = k.colchao;
  const abaixoDoColchao = k.menorSaldo < colchao;

  // Sub do saldo de hoje: quantas contas somam o saldo inicial.
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

  const linhasCalendario = vm.projecao;

  return (
    <div className="space-y-8">
      <PageTitle
        titulo="Fluxo de Caixa"
        descricao="Projecao dos proximos 30 dias com a regra D-1."
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          rotulo="Menor saldo previsto"
          valor={moeda(k.menorSaldo)}
          sub={"em " + dataLonga(k.menorSaldoData)}
          tom={abaixoDoColchao ? "bad" : "ok"}
          icone={Wallet}
        />
        <StatCard
          rotulo="Dias abaixo do colchao"
          valor={numero(k.diasAbaixo)}
          sub={"colchao " + moeda(colchao)}
          tom={k.diasAbaixo > 0 ? "warn" : "ok"}
          icone={AlertTriangle}
        />
        <StatCard
          rotulo="Saldo de hoje"
          valor={moeda(k.saldoHoje)}
          sub={subSaldoHoje}
          tom="neutral"
          icone={Wallet}
        />
      </div>

      {/* Regra D-1 */}
      <Card className="bg-brand/5" style={{ borderColor: "rgba(56,64,232,0.18)" }}>
        <div className="flex items-start gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
            <Clock size={22} strokeWidth={2.2} />
          </span>
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900">Regra D-1</h2>
            <p className="mt-1 max-w-2xl text-slate-600">
              O dinheiro precisa estar em caixa um dia antes do vencimento. O recebivel
              do dia precisa ter caido ate a vespera. Por isso a projecao considera cada
              entrada e saida na data prevista, sem folga.
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
      <Card>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900">Calendario</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {modoEstresse
                ? "Cenario de estresse, sem os recebiveis incertos."
                : "Entradas, saidas e saldo dia a dia."}
            </p>
          </div>
          <StatusLine tom={abaixoDoColchao ? "bad" : "ok"}>
            {k.diasAbaixo > 0
              ? `${numero(k.diasAbaixo)} ${k.diasAbaixo === 1 ? "dia abaixo" : "dias abaixo"} do colchao`
              : "Nenhum dia abaixo do colchao"}
          </StatusLine>
        </div>

        {linhasCalendario.length === 0 ? (
          <Empty>Sem projecao para o periodo.</Empty>
        ) : (
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
                {linhasCalendario.map((linha) => (
                  <tr key={linha.data} className={linha.abaixo ? "bg-bad-50/60" : ""}>
                    <td className="td">
                      <span className="inline-flex items-center gap-2">
                        {linha.abaixo && (
                          <AlertTriangle size={14} className="text-bad-600" strokeWidth={2.4} />
                        )}
                        <span
                          className={
                            linha.abaixo ? "font-semibold text-bad-700" : "text-slate-700"
                          }
                        >
                          {linha.rotulo}
                        </span>
                      </span>
                    </td>
                    <td className="td text-right">
                      <span className={linha.entrada > 0 ? "tnum text-ok-700" : "tnum text-slate-300"}>
                        {linha.entrada > 0 ? moeda(linha.entrada) : "-"}
                      </span>
                    </td>
                    <td className="td text-right">
                      <span className={linha.saida > 0 ? "tnum text-bad-700" : "tnum text-slate-300"}>
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
