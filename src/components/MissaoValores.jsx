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

import { MISSAO, VISAO, VALORES } from "../lib/identidade.js";

export default function MissaoValores() {
  return (
    <section className="text-left">
      <div className="grid gap-4 sm:grid-cols-2">
        <Frase rotulo="Missão" texto={MISSAO} />
        <Frase rotulo="Visão" texto={VISAO} />
      </div>

      <p className="label mb-3 mt-8">Nossos valores</p>
      <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {VALORES.map((v) => (
          <li
            key={v.n}
            className="rounded-2xl border bg-white p-4"
            style={{ borderColor: "var(--hairline)" }}
          >
            <p className="flex gap-2 font-display text-sm font-semibold text-slate-900">
              <span className="text-brand tabular-nums">{v.n}.</span>
              <span>{v.titulo}</span>
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{v.texto}</p>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              <span className="font-semibold">Se quebra:</span> {v.quebra}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Frase({ rotulo, texto }) {
  return (
    <div
      className="rounded-2xl border bg-white p-5"
      style={{ borderColor: "var(--hairline)" }}
    >
      <p className="label">{rotulo}</p>
      <p className="mt-2 font-display text-lg font-semibold leading-snug text-slate-900">
        {texto}
      </p>
    </div>
  );
}
