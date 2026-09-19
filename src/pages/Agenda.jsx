import useMesCalendario from '../lib/useMesCalendario.js';
// ============================================================================
// Agenda da producao — o Calendario e a Programacao do PCP, SO PARA VER.
//
// Por que existe: as duas telas ja moram no PCP (instalacao/casa.js), mas so
// abrem para quem tem cracha do PCP. Quem precisa APENAS saber o que sai
// amanha -- comercial, direcao, quem atende o cliente -- tinha de pedir para
// alguem olhar. Aqui a mesma agenda fica visivel no Painel, concedida pessoa a
// pessoa pelo modulo "agenda".
//
// SO PARA VER, DE VERDADE: nao ha botao de programar, de adicionar O.S. ao dia,
// de registrar evento nem de mandar a mensagem do dia -- e nao e a tela que
// esconde. A function painel-agenda nao tem acao de escrita nenhuma. Esconder
// botao no cliente nao fecha porta: o endereco continua ai.
//
// O QUE NAO APARECE AQUI, de proposito: o VALOR da O.S. (a Programacao do PCP
// mostra; esta nao, e por isso o modulo fica fora do COM_DINHEIRO), o CNPJ/CPF
// e o WhatsApp do cliente. Clicar numa linha nao abre ficha nenhuma -- no PCP
// abre o modal completo da O.S., e era por ali que o dado que esta porta corta
// voltaria a aparecer.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Eye, Clock3, Users, Truck } from "lucide-react";
import {
  PageTitle, Card, StatCard, Segmented, Empty,
  CarregandoModulo, ErroModulo, AvisoAtualizacao,
} from "../components/ui.jsx";
import { Selo } from "../components/lista.jsx";
import { lerProducao } from "../services/agenda.js";

const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/* So o TOM (a cor) mora aqui. O ROTULO vem pronto da porta, em `rotuloStatus`:
   o PCP troca o texto quando a O.S. e interna ("Apto" vira "Pronto p/ retirada",
   "Finalizada" vira "Retirado") e tambem quando a baixa foi do ERP. Escrever a
   lista de rotulos aqui de novo era ter duas telas chamando a mesma coisa por
   nomes diferentes -- ver _shared/agenda-pcp.ts:rotuloStatus. */
const TOM_STATUS = {
  aguardando_producao: "neutral",
  apto: "neutral",
  agendada: "warn",
  confirmada: "brand",
  em_andamento: "brand",
  finalizada: "ok",
};
const TIPO_PLANTAO = { diarista: "Diarista", sobreaviso: "Sobreaviso", folga: "Folga" };
const TOM_PLANTAO = { diarista: "ok", sobreaviso: "warn", folga: "neutral" };

/* Datas SEM horario pertencem ao calendario local: montar `new Date("2026-09-01")`
   cria meia-noite UTC, que no Brasil ainda e dia 31 -- e a grade inteira
   andaria um dia. Por isso todo mes vira (ano, mes) e volta por partes. */
const ymd = (ano, mes, dia) =>
  `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
/* O MES DE ABERTURA vem do calendario de SAO PAULO, nao do fuso do aparelho.
   A porta ja responde `hoje` em Sao Paulo; se a tela pedisse o mes pelo relogio
   local, um aparelho em UTC as 21h30 de 30/09 abriria outubro enquanto o
   servidor dissesse hoje=30/09 -- nenhuma celula marcada como hoje, e quem
   abriu para ver o fim de setembro veria outubro vazio. */
const hojeLocalSP = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date());
const mesAtual = () => hojeLocalSP().slice(0, 7);
function mesVizinho(mes, passo) {
  const ano = Number(mes.slice(0, 4));
  const m = Number(mes.slice(5, 7)) + passo;
  const d = new Date(Date.UTC(ano, m - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
/* Data que casa o formato mas nao existe (um mes 13 digitado no Firefox, que
   nao tem seletor de mes) vira Invalid Date, e DOW[NaN] imprimiria
   "undefined 05/13". Devolve so o dia. Mesma guarda de CalendarioEmpresa.jsx. */
const porExtenso = (iso) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const d = new Date(iso + "T12:00:00Z");
  const curto = `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  return Number.isFinite(+d) ? `${DOW[d.getUTCDay()]} ${curto}` : curto;
};

/* A ordem do dia e a do PCP, calculada na porta (ordemHora) e so aplicada
   aqui. Desempate por numero, como em casa.js:1548. */
const porHora = (a, b) =>
  a.ordemHora.localeCompare(b.ordemHora) || String(a.numero).localeCompare(String(b.numero));

function SoLeitura() {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
      <Eye size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>
        Esta tela é <strong>somente para consulta</strong>. Programar O.S., lançar
        plantão, registrar evento e mandar a mensagem do dia continuam no PCP.
      </span>
    </p>
  );
}

/* Uma O.S. na lista do dia. E a MESMA peca no calendario e na programacao --
   a diferenca entre as duas telas e o recorte, nao o desenho da linha. */
function LinhaOS({ o, comEndereco }) {
  return (
    <li className="border-t border-[var(--fio-lista,#f0f0f5)] py-3 first:border-0 first:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 text-sm">
            <span className="inline-flex items-center gap-1 font-medium tabular-nums text-slate-500">
              <Clock3 size={13} aria-hidden="true" />{o.rotuloHora}
            </span>
            <span className="font-semibold text-slate-900">O.S {o.numero || "—"}</span>
          </p>
          <p className="mt-0.5 truncate font-medium text-slate-800">{o.cliente || "—"}</p>
          <p className="text-sm text-slate-500">{o.servico || "—"}</p>
          {comEndereco && o.endereco && <p className="text-sm text-slate-400">📍 {o.endereco}</p>}
        </div>
        <Selo tom={TOM_STATUS[o.status] || "neutral"}>{o.rotuloStatus}</Selo>
      </div>
      {/* RETIRADA NAO TEM EQUIPE NEM CARRO: o cliente vem buscar no balcao, e o
          PCP nem pergunta. Escrever "equipe a definir · veículo a definir" numa
          retirada faria quem le o Painel achar que falta escalar gente e carro
          para um servico que ninguem vai fazer. */}
      {!o.interno && (
        <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Users size={13} aria-hidden="true" />{o.equipe.length ? o.equipe.join(" · ") : "equipe a definir"}
          </span>
          <span className="inline-flex items-center gap-1">
            <Truck size={13} aria-hidden="true" />{o.veiculo || "veículo a definir"}
          </span>
        </p>
      )}
    </li>
  );
}

export default function Agenda() {
  const [mes, setMes] = useMesCalendario(mesAtual);
  const [aba, setAba] = useState("calendario");
  /* O dia NASCE em hoje, e nao vazio. Com "" o efeito abaixo rodava a primeira
     vez antes de a porta responder (quando `hoje` ainda e ""), gravava
     `${mes}-01`, e na segunda passagem a propria guarda via um dia que ja
     pertencia ao mes e mantinha o dia 1 -- a tela abria sempre em 01, com a
     grade marcando hoje. `hojeLocalSP` e o mesmo relogio que a porta usa. */
  const [dia, setDia] = useState(hojeLocalSP);
  const [vistaMes, setVistaMes] = useState(false);
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [atualizando, setAtualizando] = useState(false);
  const pedido = useRef(0);

  const recarregar = useCallback(async () => {
    const meu = ++pedido.current;
    setAtualizando(true);
    try {
      const r = await lerProducao(mes);
      /* Resposta fora de ordem NAO pinta a tela: trocar de mes tres vezes
         depressa fazia a leitura mais lenta chegar por ultimo e sobrescrever
         o mes que esta na frente da pessoa. */
      if (meu !== pedido.current) return;
      setDados(r);
      setErro("");
    } catch (e) {
      if (meu === pedido.current) setErro(e.message || "Não foi possível ler a agenda.");
    } finally {
      if (meu === pedido.current) setAtualizando(false);
    }
  }, [mes]);

  useEffect(() => {
    void recarregar();
    return () => { pedido.current++; };
  }, [recarregar]);

  const hoje = dados?.hoje || "";
  /* O dia so e REPOSICIONADO quando ele nao pertence mais ao mes na tela. E a
     guarda que o PCP tem (casa.js:1237) e que faltava aqui: sem ela, o efeito
     reescrevia o dia a CADA troca de mes, e como os controles da Programacao
     mudam dia e mes no mesmo clique, quem pedia "dia anterior" em 01/09 era
     jogado para 01/08 em vez de 31/08. */
  useEffect(() => {
    setDia((atual) => {
      if (atual && atual.startsWith(mes)) return atual;
      // `hoje` so chega com a resposta; ate la vale o relogio local, que e o
      // mesmo fuso -- assim a troca de mes nunca cai no dia 1 por espera.
      const h = hoje || hojeLocalSP();
      return h.startsWith(mes) ? h : `${mes}-01`;
    });
  }, [mes, hoje]);

  const porDia = useMemo(() => {
    const m = new Map();
    for (const o of dados?.os ?? []) {
      for (const d of o.dias) {
        if (!d.startsWith(mes)) continue;
        if (!m.has(d)) m.set(d, []);
        m.get(d).push(o);
      }
    }
    for (const lista of m.values()) lista.sort(porHora);
    return m;
  }, [dados, mes]);

  const eventosPorDia = useMemo(() => {
    const m = new Map();
    for (const e of dados?.eventos ?? []) m.set(e.data, [...(m.get(e.data) || []), e]);
    return m;
  }, [dados]);
  const plantoesPorDia = useMemo(() => {
    const m = new Map();
    for (const p of dados?.plantoes ?? []) m.set(p.data, [...(m.get(p.data) || []), p]);
    return m;
  }, [dados]);

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

  const osDoDia = porDia.get(dia) || [];
  const diasComOS = useMemo(() => [...porDia.entries()].sort((a, b) => a[0].localeCompare(b[0])), [porDia]);

  if (erro && dados === null) return <ErroModulo mensagem={erro} aoTentar={recarregar} />;
  if (dados === null) return <CarregandoModulo />;

  /* RETIRADA FORA DA CONTA: ela nao tem equipe nem veiculo por desenho, e
     somando-a um dia so de retiradas exibia "0 pessoas escaladas" em ambar,
     como se faltasse escalar alguem. */
  const saidas = osDoDia.filter((o) => !o.interno);
  const pessoasNoDia = new Set(saidas.flatMap((o) => o.equipe)).size;
  const veiculosNoDia = new Set(saidas.map((o) => o.veiculo).filter(Boolean)).size;

  return (
    <div className="space-y-6">
      <AvisoAtualizacao erro={erro} aoTentar={recarregar} />
      <PageTitle
        titulo="Agenda da produção"
        descricao="O que a produção tem programado: as O.S de cada dia, os plantões e a grade de saída."
        acao={
          <button type="button" className="btn-outline" disabled={atualizando} onClick={recarregar}>
            <RefreshCw size={16} className={atualizando ? "animate-spin" : ""} />
            {atualizando ? "Atualizando…" : "Atualizar"}
          </button>
        }
      />
      <SoLeitura />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          opcoes={[{ valor: "calendario", rotulo: "Calendário" }, { valor: "programacao", rotulo: "Programação" }]}
          valor={aba}
          onChange={setAba}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-ghost" aria-label="Mês anterior" onClick={() => setMes((m) => mesVizinho(m, -1))}>
            <ChevronLeft size={18} />
          </button>
          <input
            type="month"
            className="input w-40"
            aria-label="Mês"
            value={mes}
            onChange={(e) => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)) setMes(e.target.value); }}
          />
          <button type="button" className="btn-ghost" aria-label="Próximo mês" onClick={() => setMes((m) => mesVizinho(m, 1))}>
            <ChevronRight size={18} />
          </button>
          {/* Leva o mes E o dia. So setMes era inerte no caso mais comum -- ja
                estando no mes corrente, a string nao muda, nenhum efeito roda e
                a selecao ficava presa no dia que a pessoa tinha clicado. */}
          <button type="button" className="btn-outline" onClick={() => { setMes(mesAtual()); setDia(hoje || hojeLocalSP()); }}>Hoje</button>
        </div>
      </div>

      {aba === "calendario" ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Card className="overflow-hidden p-0">
            <div className="grid grid-cols-7 border-b border-[var(--hairline,#eceaf3)] text-center text-xs font-semibold uppercase tracking-wide text-slate-400">
              {DOW.map((d) => <div key={d} className="py-2">{d}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {celulas.map((iso, i) => {
                if (!iso) return <div key={`v${i}`} className="min-h-[5.5rem] border-b border-r border-[var(--hairline,#eceaf3)] bg-slate-50/60" />;
                const lista = porDia.get(iso) || [];
                const evs = eventosPorDia.get(iso) || [];
                const pls = plantoesPorDia.get(iso) || [];
                const sel = iso === dia;
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => setDia(iso)}
                    aria-pressed={sel}
                    className={`min-h-[5.5rem] min-w-0 overflow-hidden border-b border-r border-[var(--hairline,#eceaf3)] p-1.5 text-left align-top transition hover:bg-slate-50 ${sel ? "ring-2 ring-inset ring-brand-500" : ""}`}
                  >
                    <span className={`text-xs font-semibold tabular-nums ${iso === hoje ? "rounded bg-brand-600 px-1.5 py-0.5 text-white" : "text-slate-500"}`}>
                      {Number(iso.slice(8, 10))}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {lista.length > 0 && (
                        <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700">
                          {lista.length} O.S
                        </span>
                      )}
                      {pls.length > 0 && (
                        <span className="rounded bg-ok-50 px-1.5 py-0.5 text-[11px] font-semibold text-ok-700">
                          {pls.length} plantão
                        </span>
                      )}
                      {evs.length > 0 && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                          {evs.length} ev.
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card>
            <h3 className="font-display text-lg font-semibold text-slate-900">
              {porExtenso(dia)}{dia === hoje ? " · hoje" : ""}
            </h3>
            <p className="mt-0.5 text-sm text-slate-500">
              {osDoDia.length} O.S · {(plantoesPorDia.get(dia) || []).length} plantão · {(eventosPorDia.get(dia) || []).length} evento
            </p>

            {osDoDia.length === 0
              ? <Empty className="mt-4">Nada programado neste dia.</Empty>
              : <ul className="mt-3">{osDoDia.map((o) => <LinhaOS key={o.id} o={o} />)}</ul>}

            {(plantoesPorDia.get(dia) || []).length > 0 && (
              <div className="mt-5 border-t border-[var(--hairline,#eceaf3)] pt-4">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Plantão</h4>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {(plantoesPorDia.get(dia) || []).map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-2">
                      <Selo tom={TOM_PLANTAO[p.tipo] || "neutral"}>{TIPO_PLANTAO[p.tipo] || p.tipo}</Selo>
                      <span className="font-medium text-slate-800">{p.quem || "—"}</span>
                      <span className="text-slate-500">{p.titulo}</span>
                      {(p.inicio || p.fim) && <span className="tabular-nums text-slate-400">{p.inicio}–{p.fim}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(eventosPorDia.get(dia) || []).length > 0 && (
              <div className="mt-5 border-t border-[var(--hairline,#eceaf3)] pt-4">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Eventos</h4>
                <ul className="mt-2 space-y-1 text-sm text-slate-700">
                  {(eventosPorDia.get(dia) || []).map((e) => <li key={e.id}>• {e.titulo}</li>)}
                </ul>
              </div>
            )}
          </Card>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented
              opcoes={[{ valor: "dia", rotulo: "Um dia" }, { valor: "mes", rotulo: "Mês inteiro" }]}
              valor={vistaMes ? "mes" : "dia"}
              onChange={(v) => setVistaMes(v === "mes")}
            />
            {!vistaMes && (
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="btn-ghost" aria-label="Dia anterior"
                  onClick={() => { const d = new Date(dia + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - 1); const n = d.toISOString().slice(0, 10); setDia(n); if (!n.startsWith(mes)) setMes(n.slice(0, 7)); }}>
                  <ChevronLeft size={18} />
                </button>
                <input type="date" className="input w-44" aria-label="Dia" value={dia}
                  onChange={(e) => { const v = e.target.value; if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { setDia(v); if (!v.startsWith(mes)) setMes(v.slice(0, 7)); } }} />
                <button type="button" className="btn-ghost" aria-label="Próximo dia"
                  onClick={() => { const d = new Date(dia + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); const n = d.toISOString().slice(0, 10); setDia(n); if (!n.startsWith(mes)) setMes(n.slice(0, 7)); }}>
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </div>

          {vistaMes ? (
            diasComOS.length === 0
              ? <Card><Empty>Nenhuma O.S programada em {MESES[Number(mes.slice(5, 7)) - 1]}.</Empty></Card>
              : diasComOS.map(([d, lista]) => (
                <Card key={d}>
                  <button type="button" className="text-left" onClick={() => { setDia(d); setVistaMes(false); }}>
                    <h3 className="font-display font-semibold text-slate-900 hover:text-brand-700">
                      {porExtenso(d)}{d === hoje ? " · hoje" : ""}
                    </h3>
                  </button>
                  <p className="mt-0.5 text-sm text-slate-500">{lista.length} O.S</p>
                  <ul className="mt-2">{lista.map((o) => <LinhaOS key={o.id} o={o} comEndereco />)}</ul>
                </Card>
              ))
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <StatCard rotulo="O.S no dia" valor={String(osDoDia.length)} sub={porExtenso(dia)} tom="neutral" />
                <StatCard rotulo="Pessoas escaladas" valor={String(pessoasNoDia)} sub={pessoasNoDia ? "na agenda do dia" : (saidas.length ? "ninguém escalado" : "nenhuma saída no dia")} tom={pessoasNoDia || !saidas.length ? "neutral" : "warn"} icone={Users} />
                <StatCard rotulo="Veículos" valor={String(veiculosNoDia)} sub={veiculosNoDia ? "na rua" : (saidas.length ? "nenhum definido" : "nenhuma saída no dia")} tom={veiculosNoDia || !saidas.length ? "neutral" : "warn"} icone={Truck} />
              </div>
              {(plantoesPorDia.get(dia) || []).length > 0 && (
                <Card>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Plantão do dia</h3>
                  <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
                    {(plantoesPorDia.get(dia) || []).map((p) => (
                      <li key={p.id} className="flex items-center gap-2">
                        <Selo tom={TOM_PLANTAO[p.tipo] || "neutral"}>{TIPO_PLANTAO[p.tipo] || p.tipo}</Selo>
                        <span className="font-medium text-slate-800">{p.quem || "—"}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
              <Card>
                {osDoDia.length === 0
                  ? <Empty>Nenhuma O.S programada em {porExtenso(dia)}.</Empty>
                  : <ul>{osDoDia.map((o) => <LinhaOS key={o.id} o={o} comEndereco />)}</ul>}
              </Card>
            </>
          )}
        </div>
      )}
    </div>
  );
}
