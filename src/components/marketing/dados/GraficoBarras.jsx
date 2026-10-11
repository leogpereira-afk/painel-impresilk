/* O GRÁFICO PEQUENO DA SUB-ABA DADOS: barras por dia ou por semana.
 *
 * Desenhado à mão, em SVG, como a CurvaDso: a recharts saiu do Painel (105 kB
 * comprimidos por um gráfico só) e não volta por causa de barras simples.
 *
 * TRÊS MARCAS DIFERENTES, PORQUE SÃO TRÊS COISAS DIFERENTES:
 *  - barra: o número medido;
 *  - risco fino na cor da barra: o zero MEDIDO (a API disse zero);
 *  - risco cinza mais grosso: NÃO MEDIDO (a API não mandou). Nunca uma barra
 *    zerada no lugar do que ninguém mediu.
 * O ponto ainda provisório (Search Console, Pinterest) vai mais claro.
 *
 * Tocar ou passar o mouse mostra o ponto na linha do título ("29/09: 80
 * sessões"); sem toque, o último medido. O leitor de tela ouve o resumo
 * (maior, último e quantos ficaram sem medida); os números todos estão na
 * tabela "Por dia" da mesma fonte.
 *
 * As cores moram no dados.css, com o par do tema escuro.
 */
import { useState } from 'react';
import { clsx } from 'clsx';

const LARGURA = 10; // cada casa no viewBox
const ALTURA = 48;
const BARRA_MAXIMA = 36; // px por casa: oito semanas não viram oito tijolos

export default function GraficoBarras({ bloco }) {
  const { pontos, titulo, resumo } = bloco;
  const [ativo, setAtivo] = useState(null);
  const n = pontos.length;
  if (!n) return null;
  const maior = Math.max(0, ...pontos.map((p) => p.y ?? 0)) || 1;
  const ultimoMedido = [...pontos].reverse().find((p) => p.y !== null);
  const mostrado = ativo !== null ? pontos[ativo] : ultimoMedido;

  const escolher = (e) => {
    const caixa = e.currentTarget.getBoundingClientRect();
    if (!caixa.width) return;
    const i = Math.floor(((e.clientX - caixa.left) / caixa.width) * n);
    setAtivo(Math.min(n - 1, Math.max(0, i)));
  };

  return (
    <figure className="mkt-dados-grafico">
      <figcaption className="mkt-dados-grafico-topo">
        <span className="truncate">{titulo}</span>
        {/* aria-live: quem toca nas barras com leitor de tela ouve o ponto. */}
        <span className="tnum shrink-0 text-slate-700" aria-live="polite">
          {mostrado?.texto}
        </span>
      </figcaption>
      <div className="mkt-dados-grafico-area" style={{ maxWidth: n * BARRA_MAXIMA }}>
        <svg
          viewBox={`0 0 ${n * LARGURA} ${ALTURA}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={resumo}
          onPointerMove={escolher}
          onPointerDown={escolher}
          onPointerLeave={() => setAtivo(null)}
        >
          {pontos.map((p, i) => {
            const x = i * LARGURA;
            if (p.y === null) {
              return (
                <rect key={p.x} x={x + 2} y={ALTURA - 3} width={LARGURA - 4} height={3} className="mkt-dados-vazio">
                  <title>{p.texto}</title>
                </rect>
              );
            }
            const h = p.y === 0 ? 1 : Math.max(1.5, (p.y / maior) * (ALTURA - 2));
            return (
              <rect
                key={p.x}
                x={x + 1.5}
                y={ALTURA - h}
                width={LARGURA - 3}
                height={h}
                className={clsx('mkt-dados-coluna', p.fraco && 'fraca', i === ativo && 'ativa')}
              >
                <title>{p.texto}</title>
              </rect>
            );
          })}
        </svg>
        <div className="mkt-dados-eixo" aria-hidden="true">
          <span>{pontos[0].rotulo}</span>
          {n > 1 && <span>{pontos[n - 1].rotulo}</span>}
        </div>
      </div>
    </figure>
  );
}
