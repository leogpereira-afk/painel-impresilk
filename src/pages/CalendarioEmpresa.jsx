import useMesCalendario from '../lib/useMesCalendario.js';
// Consulta a base do RH: eventos, aniversários e tempo de empresa.
// Edição dos registros permanece na origem.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Eye, CalendarDays } from "lucide-react";
import {
  PageTitle, Card, Empty, CarregandoModulo, ErroModulo, AvisoAtualizacao,
} from "../components/ui.jsx";
import { lerEmpresa } from "../services/agenda.js";

const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const ymd = (ano, mes, dia) =>
  `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
/* Mes de abertura pelo calendario de SAO PAULO, nao pelo fuso do aparelho --
   a porta responde `hoje` em Sao Paulo, e as duas datas se encontram na
   marcacao da celula de hoje. Ver Agenda.jsx. */
const hojeLocalSP = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date());
const mesAtual = () => hojeLocalSP().slice(0, 7);
function mesVizinho(mes, passo) {
  const d = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) + passo - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
/* Data que casa o formato mas nao existe (29/02 em ano comum) vira Invalid
   Date, e DOW[NaN] sairia como "undefined 29/02" na tela. Devolve so o dia. */
const porExtenso = (iso) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const d = new Date(iso + "T12:00:00Z");
  const curto = `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  return Number.isFinite(+d) ? `${DOW[d.getUTCDay()]} ${curto}` : curto;
};

export default function CalendarioEmpresa() {
  const [mes, setMes] = useMesCalendario(mesAtual);
  const [foco, setFoco] = useState("");
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [atualizando, setAtualizando] = useState(false);
  const pedido = useRef(0);

  const recarregar = useCallback(async () => {
    const meu = ++pedido.current;
    setAtualizando(true);
    try {
      const r = await lerEmpresa(mes);
      // Resposta fora de ordem não pinta a tela (ver Agenda.jsx).
      if (meu !== pedido.current) return;
      setDados(r);
      setErro("");
    } catch (e) {
      if (meu === pedido.current) setErro(e.message || "Não foi possível ler o calendário.");
    } finally {
      if (meu === pedido.current) setAtualizando(false);
    }
  }, [mes]);

  useEffect(() => {
    void recarregar();
    return () => { pedido.current++; };
  }, [recarregar]);

  const hoje = dados?.hoje || "";
  const eventos = useMemo(
    () => [...(dados?.eventos ?? [])].sort((a, b) => a.data.localeCompare(b.data) || a.titulo.localeCompare(b.titulo, "pt-BR")),
    [dados],
  );

  /* A legenda É o filtro, como no RH: clicar num tipo mostra só ele. Os tipos
     saem do que veio no mês, não de uma lista fixa -- a empresa cria tipo novo
     no RH, e um tipo que o Painel não conhecesse apareceria sem entrada na
     legenda e sem como filtrar. */
  const tipos = useMemo(() => {
    const m = new Map();
    for (const e of eventos) if (!m.has(e.tipo)) m.set(e.tipo, e.cor);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  }, [eventos]);

  const visiveis = useMemo(() => (foco ? eventos.filter((e) => e.tipo === foco) : eventos), [eventos, foco]);

  const porDia = useMemo(() => {
    const m = new Map();
    for (const e of visiveis) m.set(e.data, [...(m.get(e.data) || []), e]);
    return m;
  }, [visiveis]);

  const celulas = useMemo(() => {
    const ano = Number(mes.slice(0, 4)), m = Number(mes.slice(5, 7));
    const primeiro = new Date(Date.UTC(ano, m - 1, 1)).getUTCDay();
    const noMes = new Date(Date.UTC(ano, m, 0)).getUTCDate();
    const total = Math.ceil((primeiro + noMes) / 7) * 7;
    return Array.from({ length: total }, (_, i) => {
      const n = i - primeiro + 1;
      return n >= 1 && n <= noMes ? ymd(ano, m, n) : "";
    });
  }, [mes]);

  if (erro && dados === null) return <ErroModulo mensagem={erro} aoTentar={recarregar} />;
  if (dados === null) return <CarregandoModulo />;

  return (
    <div className="space-y-6">
      <AvisoAtualizacao erro={erro} aoTentar={recarregar} />
      <PageTitle
        titulo="Calendário da empresa"
        descricao="Aniversários, tempo de empresa, feriados, reuniões e eventos do RH."
        acao={
          <button type="button" className="btn-outline" disabled={atualizando} onClick={recarregar}>
            <RefreshCw size={16} className={atualizando ? "animate-spin" : ""} />
            {atualizando ? "Atualizando…" : "Atualizar"}
          </button>
        }
      />

      <p className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
        <Eye size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          Dados compartilhados com o RH. Aniversários e tempo de empresa são atualizados
          a partir dos cadastros; eventos continuam sendo registrados no RH.
        </span>
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-ghost" aria-label="Mês anterior" onClick={() => setMes((m) => mesVizinho(m, -1))}>
            <ChevronLeft size={18} />
          </button>
          <strong className="font-display text-lg">{MESES[Number(mes.slice(5, 7)) - 1]} de {mes.slice(0, 4)}</strong>
          <button type="button" className="btn-ghost" aria-label="Próximo mês" onClick={() => setMes((m) => mesVizinho(m, 1))}>
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="month"
            className="input w-40"
            aria-label="Mês"
            value={mes}
            onChange={(e) => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)) setMes(e.target.value); }}
          />
          <button type="button" className="btn-outline" onClick={() => setMes(mesAtual())}>Hoje</button>
        </div>
      </div>

      {(tipos.length > 0 || foco) && (
        <div className="flex flex-wrap items-center gap-2">
          {tipos.map(([tipo, cor]) => (
            <button
              key={tipo}
              type="button"
              aria-pressed={foco === tipo}
              onClick={() => setFoco((f) => (f === tipo ? "" : tipo))}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-display text-xs font-medium transition ${foco === tipo ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: cor }} />
              {tipo}
            </button>
          ))}
          {/* O botao acompanha o FOCO, nao a legenda: num mes sem nenhum evento a
              legenda fica vazia, e se ele sumisse junto nao haveria como desligar
              um filtro ligado noutro mes -- a grade ficaria vazia sem saida. */}
          {foco && <button type="button" className="btn-ghost text-sm" onClick={() => setFoco("")}>Ver todos</button>}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-7 border-b border-[var(--hairline,#eceaf3)] text-center text-xs font-semibold uppercase tracking-wide text-slate-400">
            {DOW.map((d) => <div key={d} className="py-2">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {celulas.map((iso, i) => {
              if (!iso) return <div key={`v${i}`} className="min-h-[5.5rem] border-b border-r border-[var(--hairline,#eceaf3)] bg-slate-50/60" />;
              const lista = porDia.get(iso) || [];
              return (
                <div key={iso} className="min-h-[5.5rem] min-w-0 overflow-hidden border-b border-r border-[var(--hairline,#eceaf3)] p-1.5 align-top">
                  <span className={`text-xs font-semibold tabular-nums ${iso === hoje ? "rounded bg-brand-600 px-1.5 py-0.5 text-white" : "text-slate-500"}`}>
                    {Number(iso.slice(8, 10))}
                  </span>
                  <span className="mt-1 flex flex-col gap-1">
                    {lista.slice(0, 3).map((e) => (
                      <span key={e.id} title={`${e.tipo}: ${e.titulo}`} className="flex items-center gap-1 truncate text-[11px] text-slate-600">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: e.cor }} />
                        <span className="truncate">{e.titulo}</span>
                      </span>
                    ))}
                    {lista.length > 3 && <span className="text-[11px] text-slate-400">+{lista.length - 3} mais</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <h3 className="font-display text-lg font-semibold text-slate-900">
            Agenda de {MESES[Number(mes.slice(5, 7)) - 1]}
          </h3>
          <p className="mt-0.5 text-sm text-slate-500">
            {visiveis.length} {visiveis.length === 1 ? "evento" : "eventos"}{foco ? ` · só "${foco}"` : ""}
          </p>
          {visiveis.length === 0 ? (
            <Empty className="mt-4">
              {foco
                ? `Nenhum evento do tipo "${foco}" neste mês.`
                : "Nenhum evento lançado neste mês. Quem lança é o RH."}
            </Empty>
          ) : (
            <ul className="mt-3">
              {visiveis.map((e) => (
                <li key={e.id} className="flex items-start gap-3 border-t border-[var(--fio-lista,#f0f0f5)] py-2.5 first:border-0 first:pt-0">
                  <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xs font-semibold tabular-nums text-white" style={{ backgroundColor: e.cor }}>
                    {e.data.slice(8, 10)}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800">{e.titulo}</p>
                    <p className="text-sm text-slate-500">
                      {porExtenso(e.data)} · {e.tipo}
                      {e.hora ? ` · ${e.hora}` : ""}
                      {e.recorrenteAnual ? " · todo ano" : ""}
                    </p>
                    {e.descricao && <p className="mt-0.5 text-sm text-slate-500">{e.descricao}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-400">
            <CalendarDays size={13} aria-hidden="true" />
            Fonte: RH · eventos e cadastros.
          </p>
        </Card>
      </div>
    </div>
  );
}
