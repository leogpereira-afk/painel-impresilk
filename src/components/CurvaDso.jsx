/* A CURVA DO DSO, DESENHADA À MÃO — sem a recharts.
 *
 * A biblioteca custava 105 kB gzip (MAIOR que o painel inteiro de entrada) e
 * existia por causa deste único gráfico de linha: doze pontos, uma meta
 * tracejada e um tooltip. Contas Atrasadas é a tela que o CEO mais abre no 4G
 * da rua — 105 kB ali é a diferença entre abrir e esperar. O resto do painel
 * já desenhava barras e curvas à mão; este era o último consumidor, e com ele
 * sai a dependência inteira (atualização, vulnerabilidade, peso).
 *
 * O que o SVG faz igual: linha suave, pontos, eixo com meses, linha da meta,
 * valor ao tocar/passar o mouse. O que deixou de fazer de propósito: animação
 * de entrada — ninguém decide nada com ela.
 */
import { useMemo, useState } from "react";

const W = 720, H = 260;
const M = { top: 18, right: 44, bottom: 26, left: 34 };

export default function CurvaDso({ dados, meta, cor }) {
  const [ativo, setAtivo] = useState(null);

  const g = useMemo(() => {
    const pts = (dados || []).filter((d) => Number.isFinite(Number(d.dso)));
    if (pts.length < 2) return null;
    const ys = pts.map((d) => Number(d.dso));
    // A meta entra na régua do eixo: fora dela, a linha tracejada sumiria do
    // quadro exatamente quando o DSO está muito acima (o caso de olhar).
    const lo = Math.min(...ys, Number(meta) || Infinity);
    const hi = Math.max(...ys, Number(meta) || -Infinity);
    const folga = Math.max(2, (hi - lo) * 0.15);
    const yMin = Math.max(0, Math.floor(lo - folga));
    const yMax = Math.ceil(hi + folga);
    const x = (i) => M.left + (i * (W - M.left - M.right)) / (pts.length - 1);
    const y = (v) => M.top + (H - M.top - M.bottom) * (1 - (v - yMin) / (yMax - yMin || 1));
    return { pts, x, y, yMin, yMax };
  }, [dados, meta]);

  if (!g) return null;
  const { pts, x, y, yMin, yMax } = g;
  const linha = pts.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(Number(d.dso)).toFixed(1)}`).join(" ");
  const yMeta = Number.isFinite(Number(meta)) ? y(Number(meta)) : null;
  // Grade horizontal em 4 linhas redondas.
  const grade = [0, 1, 2, 3].map((i) => yMin + ((yMax - yMin) * i) / 3);

  return (
    <div style={{ width: "100%" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        role="img"
        aria-label={`Evolução do DSO, de ${pts[0].mes} a ${pts[pts.length - 1].mes}`}
        onMouseLeave={() => setAtivo(null)}
      >
        {grade.map((v) => (
          <g key={v}>
            <line x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} stroke="#eef2f7" />
            <text x={M.left - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#94a3b8">
              {Math.round(v)}
            </text>
          </g>
        ))}
        {yMeta != null && (
          <g>
            <line x1={M.left} x2={W - M.right} y1={yMeta} y2={yMeta} stroke="#94a3b8" strokeDasharray="4 4" />
            <text x={W - M.right + 4} y={yMeta + 4} fontSize="11" fill="#94a3b8">meta</text>
          </g>
        )}
        <path d={linha} fill="none" stroke={cor} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((d, i) => (
          <g key={d.mes}>
            <circle cx={x(i)} cy={y(Number(d.dso))} r={ativo === i ? 5 : 3} fill={cor} />
            {/* Alvo de toque largo e invisível: no celular ninguém acerta um
                ponto de 3px. */}
            <rect
              x={x(i) - (W - M.left - M.right) / (2 * (pts.length - 1))}
              y={M.top}
              width={(W - M.left - M.right) / (pts.length - 1)}
              height={H - M.top - M.bottom}
              fill="transparent"
              onMouseEnter={() => setAtivo(i)}
              onClick={() => setAtivo(ativo === i ? null : i)}
            />
            {/* Rótulo do mês: todos quando cabem, senão alternados. */}
            {(pts.length <= 8 || i % 2 === 0) && (
              <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#94a3b8">{d.mes}</text>
            )}
          </g>
        ))}
        {ativo != null && (
          <g pointerEvents="none">
            <rect
              x={Math.min(Math.max(x(ativo) - 44, M.left), W - M.right - 88)}
              y={Math.max(y(Number(pts[ativo].dso)) - 40, 2)}
              width="88" height="26" rx="8"
              fill="white" stroke="#e2e8f0"
            />
            <text
              x={Math.min(Math.max(x(ativo) - 44, M.left), W - M.right - 88) + 44}
              y={Math.max(y(Number(pts[ativo].dso)) - 40, 2) + 17}
              textAnchor="middle" fontSize="12" fill="#334155"
            >
              {pts[ativo].mes}: {pts[ativo].dso} dias
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
