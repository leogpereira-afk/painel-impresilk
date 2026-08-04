// Vocabulario visual do painel. Todos os modulos compoem a partir daqui, para o
// layout ficar consistente. Marca indigo, Poppins nos numeros, Spectral no corpo.

import { forwardRef, useEffect, useState } from "react";
import { clsx } from "clsx";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Download, Minus } from "lucide-react";
// Recebe `atualizadoEm` por prop em vez de chamar useApp() aqui: ui.jsx e o
// vocabulario visual e nao deve depender do store (o Layout ja importa os dois,
// e a dependencia cruzada so espera um descuido para virar ciclo).
import { frescor, idadeEmPalavras } from "../lib/frescor.js";

// Botao "Baixar PDF": dispara a impressora do navegador (Salvar como PDF). Some
// no proprio papel (.sem-impressao). A tela decide, via CSS de impressao, o que
// entra na folha; aqui so mora o gatilho, igual em todas as telas.
export function BotaoPDF({ titulo = "Gera um PDF com o recorte que esta na tela" }) {
  return (
    <button
      className="sem-impressao inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 font-display text-sm font-medium text-slate-600 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
      style={{ borderColor: "var(--hairline)" }}
      onClick={() => window.print()}
      title={titulo}
    >
      <Download size={15} strokeWidth={2.2} /> Baixar PDF
    </button>
  );
}

// Cabecalho que SO existe no papel: sem ele o PDF chega ao destinatario sem
// dizer de quando e nem o que esta olhando. `linhas` sao as sublinhas de
// contexto (emissao, recorte, total).
//
// `atualizadoEm` e a data do DADO, que nao e a data da impressao. Sem ela o
// papel dizia "Emitido em 04/08/2026" em cima de numeros de 03/08 as 10:44 --
// e o unico lugar que sabia a idade do cache era o chip do cabecalho, que tem
// a classe `sem-impressao` e portanto nao vai para a folha. Um PDF de cobranca
// que sai da empresa nao pode carimbar hoje num numero de anteontem.
export function CabecalhoImpressao({ titulo, linhas = [], atualizadoEm }) {
  const f = frescor(atualizadoEm);
  return (
    <div className="apenas-impressao mb-3">
      <h1 style={{ fontSize: "14pt", fontWeight: 700, margin: 0 }}>{titulo}</h1>
      {linhas.filter(Boolean).map((l, i) => (
        <p key={i} style={{ fontSize: "9pt", margin: "2px 0 0" }}>
          {l}
        </p>
      ))}
      {f && (
        <p style={{ fontSize: "9pt", margin: "2px 0 0" }}>
          Dados do ERP de {f.quando}.
        </p>
      )}
      {/* O sentido vai nas PALAVRAS, nao na cor: impressao em cinza mata o
          vermelho, e a folha continua tendo de avisar. */}
      {f?.parado && (
        <p style={{ fontSize: "9pt", margin: "2px 0 0", fontWeight: 700, color: "#b91c1c" }}>
          ATENCAO: a carga automatica do ERP esta parada ({idadeEmPalavras(f.idadeMin)}). Estes
          numeros podem estar desatualizados.
        </p>
      )}
    </div>
  );
}

/* AVISO DE DADO PARADO — no corpo da pagina, junto do dinheiro.
   Em 03-04/08/2026 o cache ficou 30 horas parado. O chip do cabecalho DISSE a
   verdade e passou despercebido: ele tem 12px e mora no canto oposto ao numero
   grande. Este bloco entra ACIMA dos indicadores, na largura da pagina, e so
   aparece no estado `parado` (>3h) -- o "atrasado" de uma rodada perdida
   continua sendo assunto do chip, para isto nao virar ruido diario.

   Relogio proprio: a idade so muda com o tempo passando, nao com os dados. Sem
   o tick, o aviso congelaria no mount e NAO apareceria justamente no caso que
   ele existe para pegar -- o cache travando com a aba ja aberta. (O Layout
   carrega um tick igual, pelo mesmo motivo, com comentario proprio.)

   Vai para o papel de proposito: sem `sem-impressao`, o PDF de cobranca sai com
   o alerta junto. */
export function AvisoDadoParado({ atualizadoEm }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  const f = frescor(atualizadoEm);
  if (!f || !f.parado) return null;

  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-bad-200 border-l-4 border-l-bad-600 bg-bad-50 px-4 py-3">
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-bad-600" />
      <div className="text-sm text-bad-700">
        <p className="font-medium">
          Estes numeros sao de {f.quando} ({idadeEmPalavras(f.idadeMin)}) — nao sao de agora.
        </p>
        <p className="mt-0.5 text-bad-600">
          A carga automatica do ERP esta parada. O botao Sincronizar so rele o mesmo cache: enquanto
          isso nao voltar, nao decida por estes valores.
        </p>
      </div>
    </div>
  );
}

const TOM = {
  brand: { texto: "text-brand", bg: "bg-brand/10", barra: "bg-brand", ponto: "bg-brand" },
  ok: { texto: "text-ok-700", bg: "bg-ok-50", barra: "bg-ok-600", ponto: "bg-ok-600" },
  warn: { texto: "text-warn-700", bg: "bg-warn-50", barra: "bg-warn-600", ponto: "bg-warn-600" },
  bad: { texto: "text-bad-700", bg: "bg-bad-50", barra: "bg-bad-600", ponto: "bg-bad-600" },
  neutral: { texto: "text-slate-600", bg: "bg-slate-100", barra: "bg-slate-400", ponto: "bg-slate-400" },
};

// forwardRef para as paginas conseguirem rolar ate um card (ex.: filtro que
// leva para a lista de titulos).
export const Card = forwardRef(function Card({ className, children, ...rest }, ref) {
  return (
    <div ref={ref} className={clsx("card p-5 sm:p-6", className)} {...rest}>
      {children}
    </div>
  );
});

// KPI. valor ja formatado (string). tom pinta o icone e o sub.
// Com onClick vira botao; `ativo` destaca o card quando o filtro dele esta ligado.
export function StatCard({ rotulo, valor, sub, tom = "neutral", icone: Icone, tendencia, onClick, ativo }) {
  const t = TOM[tom] || TOM.neutral;
  const clicavel = typeof onClick === "function";
  const Comp = clicavel ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      aria-pressed={clicavel ? !!ativo : undefined}
      className={clsx(
        "card p-5 text-left w-full transition-all",
        clicavel && "card-hover cursor-pointer",
        ativo && "ring-2 ring-brand ring-offset-2 ring-offset-transparent"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="label mb-0">{rotulo}</p>
        {Icone && (
          <span className={clsx("grid h-9 w-9 place-items-center rounded-xl", t.bg, t.texto)}>
            <Icone size={18} strokeWidth={2.2} />
          </span>
        )}
      </div>
      <div className="mt-3 flex items-end gap-2">
        <span className="kpi-value text-3xl text-slate-900">{valor}</span>
        {tendencia && <TrendArrow tendencia={tendencia} />}
      </div>
      {sub && <p className={clsx("mt-1.5 text-sm", tom === "neutral" ? "text-slate-500" : t.texto)}>{sub}</p>}
    </Comp>
  );
}

export function TrendArrow({ tendencia }) {
  if (tendencia === "baixa")
    return <ArrowDownRight size={18} className="text-ok-600 mb-1" strokeWidth={2.4} />;
  if (tendencia === "alta")
    return <ArrowUpRight size={18} className="text-bad-600 mb-1" strokeWidth={2.4} />;
  return <Minus size={18} className="text-slate-400 mb-1" strokeWidth={2.4} />;
}

export function SectionTitle({ titulo, sub, acao, className }) {
  return (
    <div className={clsx("mb-4 flex items-end justify-between gap-3", className)}>
      <div>
        <h2 className="font-display text-lg font-semibold text-slate-900">{titulo}</h2>
        {sub && <p className="mt-0.5 text-sm text-slate-500">{sub}</p>}
      </div>
      {acao}
    </div>
  );
}

// Linha de status colorida dos cards da Home. tom: ok | warn | bad | neutral
export function StatusLine({ tom = "neutral", children }) {
  const t = TOM[tom] || TOM.neutral;
  return (
    <span className={clsx("inline-flex items-center gap-2 text-sm font-medium font-display", t.texto)}>
      <span className={clsx("h-2 w-2 rounded-full", t.ponto)} />
      {children}
    </span>
  );
}

// Barra de proporcao horizontal. pct 0..100.
export function BarRow({ rotulo, valorTexto, pct, tom = "brand", sub }) {
  const t = TOM[tom] || TOM.brand;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-slate-700">{rotulo}</span>
        <span className="tnum text-sm font-semibold text-slate-900">{valorTexto}</span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={clsx("h-full rounded-full transition-all duration-500", t.barra)} style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} />
      </div>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

// Alternador de opcoes (ex.: faturamento x volume).
export function Segmented({ opcoes, valor, onChange, className }) {
  return (
    // sem-impressao: e um CONTROLE. No papel ele saia com todas as opcoes lado
    // a lado e nenhuma marcada (a regra de impressao zera o fundo do botao
    // ativo), fazendo o leitor achar que via um dado.
    <div
      className={clsx("sem-impressao inline-flex rounded-xl border bg-white p-1", className)}
      style={{ borderColor: "var(--hairline)" }}
    >
      {opcoes.map((o) => (
        <button
          key={o.valor}
          onClick={() => onChange(o.valor)}
          className={clsx(
            "rounded-lg px-3 py-1.5 font-display text-sm font-medium transition-all",
            valor === o.valor ? "bg-brand text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
          )}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

// Chip de variacao percentual. Por padrao: positivo verde, negativo vermelho.
export function DeltaBadge({ pct, className }) {
  const positivo = pct >= 0;
  const Icone = positivo ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-display text-xs font-semibold",
        positivo ? "bg-ok-50 text-ok-700" : "bg-bad-50 text-bad-700",
        className
      )}
    >
      <Icone size={13} strokeWidth={2.6} />
      {positivo ? "+" : ""}
      {pct}%
    </span>
  );
}

export function Empty({ children, className }) {
  return (
    <div className={clsx("grid place-items-center rounded-xl border border-dashed py-10 text-center text-sm text-slate-500", className)} style={{ borderColor: "var(--hairline)" }}>
      {children}
    </div>
  );
}

export function Skeleton({ className }) {
  return <div className={clsx("animate-pulse rounded-xl bg-slate-100", className)} />;
}

// Cabecalho grande no topo de cada modulo.
export function PageTitle({ titulo, descricao, acao }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{titulo}</h1>
        {descricao && <p className="mt-1 max-w-2xl text-slate-500">{descricao}</p>}
      </div>
      {acao}
    </div>
  );
}

// Estado de carregamento padrao de um modulo.
export function CarregandoModulo() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-9 w-64" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

export function ErroModulo({ mensagem, aoTentar }) {
  return (
    <Card className="text-center">
      <p className="font-display text-lg font-semibold text-bad-700">Nao foi possivel carregar</p>
      <p className="mt-1 text-sm text-slate-500">{mensagem}</p>
      {aoTentar && (
        <button onClick={aoTentar} className="btn-primary mx-auto mt-4">
          Tentar de novo
        </button>
      )}
    </Card>
  );
}

export { TOM };
