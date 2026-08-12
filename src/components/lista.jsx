// O PADRÃO DA LISTA DE TRABALHO — o mesmo desenho em toda tela onde a pessoa
// olha uma lista e decide onde mexer (Orçamentos, Contas Atrasadas, e o que
// vier).
//
// Ele nasceu da tela de Orçamentos refeita em 12/08/2026, e as regras vieram de
// medir (não de achismo) como Linear, Geist/Vercel e Attio desenham lista densa:
//
//   · UM selo por linha, nunca dois. Se a linha precisa de dois, falta uma
//     coluna -- não cabe mais um selo.
//   · O valor é o único número forte: tabular, com o "R$" em cinza. O segundo
//     número (margem, saldo) entra abaixo, menor.
//   · Dado ausente é travessão "—", nunca "N/A", "null" nem R$ 0.
//   · Sem zebra e sem borda grossa entre linhas: fio bem claro e ritmo vertical.
//     Uma borda por linha × 80 linhas são 80 traços competindo com o conteúdo.
//   · Cor só marca ESTADO e a ação primária; o resto é cinza. O trilho colorido
//     de 3px na borda esquerda é o que deixa varrer a lista com o olho sem ler
//     selo por selo.
//   · A faixa de números do topo não usa cartão: cartão custa 60px de altura
//     para não dizer nada. Células divididas por fio, e cada uma RECORTA a lista.
//
// Nada aqui conhece orçamento nem título: recebe texto pronto.

const SELO = {
  bad: { caixa: "bg-bad-50 text-bad-700", ponto: "bg-bad-600" },
  warn: { caixa: "bg-warn-50 text-warn-700", ponto: "bg-warn-600" },
  ok: { caixa: "bg-ok-50 text-ok-700", ponto: "bg-ok-600" },
  brand: { caixa: "bg-brand-50 text-brand-700", ponto: "bg-brand" },
  neutral: { caixa: "bg-slate-100 text-slate-600", ponto: "bg-slate-400" },
};

// Só os estados que pedem ação ganham trilho. Trilho em tudo é trilho em nada.
export const TRILHO = {
  bad: "bg-bad-600",
  warn: "bg-warn-500",
  ok: "bg-transparent",
  brand: "bg-transparent",
  neutral: "bg-transparent",
};

export function Selo({ tom = "neutral", children, title }) {
  const s = SELO[tom] || SELO.neutral;
  return (
    <span
      title={title}
      className={`inline-flex max-w-full items-center gap-1.5 truncate rounded-full px-2.5 py-1 font-display text-xs font-medium ${s.caixa}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.ponto}`} />
      <span className="truncate">{children}</span>
    </span>
  );
}

// Iniciais num círculo: o olho reconhece a pessoa antes de ler o nome.
export function Avatar({ nome, tamanho = "h-7 w-7 text-[10px]" }) {
  const ini = String(nome || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((x) => x[0])
    .join("")
    .toUpperCase();
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full bg-brand-50 font-semibold text-brand-ink ${tamanho}`}
      title={nome}
    >
      {ini}
    </span>
  );
}

/* O dinheiro da linha. `abaixo` é o segundo número (margem, saldo, o que for) e
   entra menor -- se vier vazio, o lugar dele fica em branco em vez de mostrar
   um zero que ninguém escreveu. */
export function Dinheiro({ valor, abaixo, classe = "text-[17px]", formatar }) {
  return (
    <div className="text-right">
      <p className={`tnum font-semibold text-slate-900 ${classe}`}>
        <span className="text-sm font-normal text-slate-400">R$ </span>
        {formatar(Math.round(valor))}
      </p>
      {abaixo ? <p className="tnum text-xs text-slate-500">{abaixo}</p> : null}
    </div>
  );
}

/* A faixa de números: cada célula é um RECORTE da lista, não um enfeite.
   `celulas` = [{ id, rotulo, valor, sub, curto, cor }]. `curto` é o que aparece
   no celular no lugar do `sub` (que quebra em três linhas em 390px). */
export function FaixaNumeros({ celulas, ativo, aoEscolher }) {
  return (
    <div
      className="grid grid-cols-2 overflow-hidden rounded-xl border bg-white lg:grid-cols-4"
      style={{ borderColor: "var(--hairline)" }}
    >
      {celulas.map((c, i) => {
        const sel = ativo === c.id;
        return (
          <button
            key={c.id}
            onClick={() => aoEscolher(c.id)}
            aria-pressed={sel}
            className={`border-t px-4 py-3 text-left transition-colors first:border-t-0 sm:border-t-0 ${
              i % 2 === 1 ? "border-l" : ""
            } lg:border-l lg:first:border-l-0 ${sel ? "bg-brand-50" : "hover:bg-slate-50"}`}
            style={{ borderColor: "var(--hairline)" }}
          >
            <span className="block truncate text-xs text-slate-500">{c.rotulo}</span>
            <span
              className={`tnum mt-0.5 block text-[22px] font-semibold leading-tight ${c.cor || "text-slate-900"}`}
            >
              {c.valor}
            </span>
            {c.sub && (
              <span className="mt-0.5 hidden line-clamp-2 text-xs text-slate-400 sm:block">
                {c.sub}
              </span>
            )}
            {c.curto && (
              <span className="mt-0.5 block truncate text-xs text-slate-400 sm:hidden">
                {c.curto}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* A moldura de uma linha: fio claro em cima, trilho colorido à esquerda e o
   desbotado de quem acabou de sair. Quem usa põe o conteúdo dentro. */
export function LinhaLista({ tom = "neutral", saindo, children }) {
  return (
    <div
      className={`relative border-t px-4 py-3 transition-colors first:border-0 hover:bg-slate-50/60 ${
        saindo ? "opacity-50" : ""
      }`}
      style={{ borderColor: "#f0f0f5" }}
    >
      <span className={`absolute inset-y-0 left-0 w-[3px] ${TRILHO[tom] || TRILHO.neutral}`} aria-hidden="true" />
      {children}
    </div>
  );
}
