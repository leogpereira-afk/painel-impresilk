/* A CURVA DO DSO, NUM ARQUIVO SO DELA — e o motivo e o peso, nao a organizacao.
 *
 * A `recharts` custa ~100 kB comprimidos: um terco de tudo que o Painel baixava.
 * Ela existia por causa deste UNICO grafico, no fim de uma pagina de mil e
 * trezentas linhas, quase sempre abaixo da dobra. Quem abre "Contas atrasadas"
 * quer ver quanto tem a receber -- e esperava a biblioteca de grafico inteira
 * descer antes da primeira linha da tabela aparecer.
 *
 * Separado, o `import()` so acontece quando a pagina monta, e a tabela nao espera
 * por ele. A pagina caiu de 116 kB para 16 kB.
 */

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

export default function CurvaDso({ dados, meta, cor }) {
  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer>
        <LineChart data={dados} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
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
            y={meta}
            stroke="#94a3b8"
            strokeDasharray="4 4"
            label={{ value: "meta", position: "right", fontSize: 11, fill: "#94a3b8" }}
          />
          <Line
            type="monotone"
            dataKey="dso"
            stroke={cor}
            strokeWidth={2.4}
            dot={{ r: 3, fill: cor }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
