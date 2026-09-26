// Missao, visao e os doze valores, na porta de entrada do painel.
//
// Pedido do Leo (23/09/2026): "aqui na tela de inicio abrir com nossa missao
// visao e valores e os 12 valores; os botoes de sistemas fica a esquerda".
//
// O texto vem de lib/identidade.js -- fonte unica, porque os mesmos doze vao
// para o Welcome Kit do RH e para a parede da producao.
//
// O "Se quebra" SAIU DA TELA E DO PDF a pedido do Leo (26/09/2026): "tirar
// esse se quebra, o salvar em pdf descer e justificar o texto e deixar ele
// imponente". O campo "quebra" continua em lib/identidade.js, que e a fonte
// do Welcome Kit do RH e da parede da producao; so nao e exibido aqui.

import { useState } from "react";
import { ChevronDown, Download } from "lucide-react";
import { imprimirIdentidade } from "../lib/imprimirIdentidade.js";
import "./missao-valores.css";
import { MISSAO, VISAO, VALORES } from "../lib/identidade.js";

export default function MissaoValores() {
  const [abertos, setAbertos] = useState(false);
  return (
    <section className="identidade text-left">
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Frase rotulo="Missão" texto={MISSAO} />
        <Frase rotulo="Visão" texto={VISAO} />
      </div>

      <h2 className="identidade-titulo">Nossos valores</h2>
      <ol className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {VALORES.map((v) => (
          <details
            key={v.n}
            open={abertos}
            className="group rounded-xl border bg-white px-4 py-3"
            style={{ "--identidade-cor": ["#007ba7", "#bb2872", "#25835b", "#b27600"][(v.n - 1) % 4] }}
          >
            <summary
              onClick={(event) => {
                event.preventDefault();
                setAbertos((atual) => !atual);
              }}
              className="flex cursor-pointer list-none items-start justify-between gap-2 font-display text-[15px] font-bold leading-snug text-slate-900"
            >
              <span className="flex min-w-0 gap-2">
                <span className="shrink-0 text-brand tabular-nums">{v.n}.</span>
                <span>{v.titulo}</span>
              </span>
              <ChevronDown
                aria-hidden="true"
                size={16}
                className="mt-0.5 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
              />
            </summary>
            <div className="mt-2 border-t border-slate-100 pt-2">
              <p className="text-[15px] leading-relaxed text-slate-700">{v.texto}</p>
            </div>
          </details>
        ))}
      </ol>

      {/* O PDF e o fecho, nao a porta: embaixo, depois dos doze. */}
      <div className="identidade-actions"><button className="btn-ghost" onClick={imprimirIdentidade}><Download size={17}/> Salvar missão, visão e valores em PDF</button></div>
    </section>
  );
}

function Frase({ rotulo, texto }) {
  return (
    <div
      className={`identidade-frase identidade-${rotulo === "Missão" ? "missao" : "visao"} rounded-xl border bg-white px-5 py-4`}
      style={{ borderColor: "var(--hairline)" }}
    >
      <p className="label">{rotulo}</p>
      <p className="identidade-frase-texto mt-1.5 font-display font-bold text-slate-900">
        {texto}
      </p>
    </div>
  );
}
