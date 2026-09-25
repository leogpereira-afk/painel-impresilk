// Missao, visao e os doze valores, na porta de entrada do painel.
//
// Pedido do Leo (23/09/2026): "aqui na tela de inicio abrir com nossa missao
// visao e valores e os 12 valores; os botoes de sistemas fica a esquerda".
//
// O texto vem de lib/identidade.js -- fonte unica, porque os mesmos doze vao
// para o Welcome Kit do RH e para a parede da producao.
//
// CADA VALOR MOSTRA O "quebra". Um valor que ninguem consegue desobedecer e
// decoracao; o "quebra" e o que prova que ha regra ali. Na tela ele fica
// discreto, em cinza, embaixo -- quem passa o olho le os doze titulos, quem
// para para ler entende o que esta sendo cobrado.

import { useState } from "react";
import { ChevronDown, Download } from "lucide-react";
import { imprimirIdentidade } from "../lib/imprimirIdentidade.js";
import "./missao-valores.css";
import { MISSAO, VISAO, VALORES } from "../lib/identidade.js";

export default function MissaoValores() {
  const [abertos, setAbertos] = useState(false);
  return (
    <section className="identidade text-left">
      <div className="identidade-actions"><button className="btn-ghost" onClick={imprimirIdentidade}><Download size={17}/> Salvar missão, visão e valores em PDF</button></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Frase rotulo="Missão" texto={MISSAO} />
        <Frase rotulo="Visão" texto={VISAO} />
      </div>

      <p className="label mb-3 mt-8">Nossos valores</p>
      <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {VALORES.map((v) => (
          <details
            key={v.n}
            open={abertos}
            className="group rounded-2xl border bg-white p-4"
            style={{ "--identidade-cor": ["#007ba7", "#bb2872", "#25835b", "#b27600"][(v.n - 1) % 4] }}
          >
            <summary
              onClick={(event) => {
                event.preventDefault();
                setAbertos((atual) => !atual);
              }}
              className="flex cursor-pointer list-none items-start justify-between gap-3 font-display text-sm font-semibold text-slate-900"
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
            <div className="mt-3 border-t border-slate-100 pt-3">
              <p className="text-sm leading-relaxed text-slate-600">{v.texto}</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                <span className="font-semibold">Se quebra:</span> {v.quebra}
              </p>
            </div>
          </details>
        ))}
      </ol>
    </section>
  );
}

function Frase({ rotulo, texto }) {
  return (
    <div
      className={`identidade-frase identidade-${rotulo === "Missão" ? "missao" : "visao"} rounded-2xl border bg-white p-5`}
      style={{ borderColor: "var(--hairline)" }}
    >
      <p className="label">{rotulo}</p>
      <p className="mt-2 font-display text-lg font-semibold leading-snug text-slate-900">
        {texto}
      </p>
    </div>
  );
}
