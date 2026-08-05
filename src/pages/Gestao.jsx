// Gestao: a tela de direcao da Impresilk. Cinco blocos num acordeao, na ordem
// em que um sustenta o outro -- identidade, plano do ano, taticas de 90 dias,
// atas e fechamento de ciclo.
//
// NAO e painel de producao nem lista de tarefa do dia: isso ja existe em
// Compromissos e nos outros modulos. Aqui e decisao e direcao, e por isso a
// tela abre no bloco 3 (o uso semanal) com o resto recolhido.
//
// O que cada pessoa ve e decidido no SERVIDOR (painel-gestao): colaborador
// recebe so a identidade, gestor recebe o plano e as taticas e apenas as atas
// em que participou. A tela nao esconde cartao de dado que ela recebeu.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown, Compass, Target, Swords, FileText, Flag, Plus, Pencil, Trash2,
  Check, AlertTriangle, Lock,
} from "lucide-react";
import {
  lerGestao, salvarIdentidade, salvarValor, removerValor,
  salvarPlano, salvarObjetivo, removerObjetivo, salvarIndicador, removerIndicador,
  salvarTatica, removerTatica, salvarReuniao, aprovarAta, salvarDecisao, gerarAcoes,
  encerrarCiclo, gravarPreferencia,
} from "../services/gestao.js";
import {
  SITUACOES, porObjetivo, alertaDeCiclo, cumprimentoDecisoes, pautaSugerida,
} from "../lib/calc/gestao.js";
import { dataCurta, dataLonga, ymdLocal, numero } from "../lib/format.js";
import { Card, PageTitle, Empty, CarregandoModulo, ErroModulo } from "../components/ui.jsx";
import EsquemaTatico from "../components/EsquemaTatico.jsx";

const BLOCOS = [
  { id: "identidade", titulo: "Identidade", sub: "missao, visao e valores", icone: Compass, padrao: false },
  { id: "plano", titulo: "Planejamento do ano", sub: "tese, objetivos e indicadores", icone: Target, padrao: false },
  { id: "tatico", titulo: "Esquema tatico 90 dias", sub: "o que esta sendo feito agora", icone: Swords, padrao: true },
  { id: "atas", titulo: "Reunioes e atas", sub: "o que foi decidido e por quem", icone: FileText, padrao: false },
  { id: "ciclo", titulo: "Fechamento de ciclo", sub: "planejado, realizado e desvio", icone: Flag, padrao: false },
];

const TIPOS_REUNIAO = {
  semanal_gestao: "Semanal de gestao",
  mensal_resultado: "Mensal de resultado",
  extraordinaria: "Extraordinaria",
};

function Acordeao({ bloco, aberto, alternar, destaque, children }) {
  const Icone = bloco.icone;
  return (
    <Card className={`p-0 ${destaque ? "ring-2 ring-warn-600" : ""}`}>
      <button
        type="button"
        onClick={alternar}
        aria-expanded={aberto}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        <Icone size={18} strokeWidth={2.2} className="shrink-0 text-brand" />
        <span className="min-w-0 flex-1">
          <span className="block font-display text-base font-semibold text-slate-900">{bloco.titulo}</span>
          <span className="block text-sm text-slate-500">{bloco.sub}</span>
        </span>
        {destaque && <span className="chip-warn shrink-0">precisa de atencao</span>}
        <ChevronDown size={18} className={`shrink-0 text-slate-400 transition-transform ${aberto ? "" : "-rotate-90"}`} />
      </button>
      {aberto && <div className="border-t px-5 pb-5 pt-4" style={{ borderColor: "var(--hairline)" }}>{children}</div>}
    </Card>
  );
}

/* ── 1. IDENTIDADE ────────────────────────────────────────────────────────── */
function CartaoValor({ v, podeEditar, aoEditar, aoRemover }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="rounded-xl border" style={{ borderColor: "var(--hairline)" }}>
      <button type="button" onClick={() => setAberto((a) => !a)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <span className="min-w-0 flex-1 font-display text-sm font-semibold text-slate-900">{v.nome}</span>
        <ChevronDown size={15} className={`shrink-0 text-slate-400 transition-transform ${aberto ? "" : "-rotate-90"}`} />
      </button>
      {aberto && (
        <div className="space-y-3 border-t px-4 py-3 text-sm" style={{ borderColor: "var(--hairline)" }}>
          {v.significado && <p className="text-slate-700">{v.significado}</p>}
          {v.comportamento_esperado && (
            <p className="rounded-lg bg-ok-50 px-3 py-2 text-ok-700">
              <b className="font-display">O que se espera:</b> {v.comportamento_esperado}
            </p>
          )}
          {v.comportamento_inaceitavel && (
            <p className="rounded-lg bg-bad-50 px-3 py-2 text-bad-700">
              <b className="font-display">O que nao se aceita:</b> {v.comportamento_inaceitavel}
            </p>
          )}
          {podeEditar && (
            <div className="flex gap-2">
              <button type="button" className="btn-ghost h-8 px-2 text-xs" onClick={() => aoEditar(v)}>
                <Pencil size={13} /> Editar
              </button>
              <button type="button" className="btn-ghost h-8 px-2 text-xs text-bad-700" onClick={() => aoRemover(v)}>
                <Trash2 size={13} /> Remover
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BlocoIdentidade({ dados, podeEditar, aoRecarregar, aoAvisar }) {
  const { identidade, valores } = dados;
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState({ missao: "", visao: "", visaoPrazo: "" });
  const [valor, setValor] = useState(null);

  const abrir = () => {
    setF({
      missao: identidade?.missao || "",
      visao: identidade?.visao || "",
      visaoPrazo: identidade?.visao_prazo || "",
    });
    setEditando(true);
  };

  const gravar = async (e) => {
    e.preventDefault();
    try {
      await salvarIdentidade(f);
      setEditando(false);
      await aoRecarregar();
      aoAvisar({ tom: "ok", texto: "Identidade atualizada." });
    } catch (err) { aoAvisar({ tom: "erro", texto: err.message }); }
  };

  const gravarValor = async (e) => {
    e.preventDefault();
    try {
      await salvarValor(valor);
      setValor(null);
      await aoRecarregar();
    } catch (err) { aoAvisar({ tom: "erro", texto: err.message }); }
  };

  if (editando) {
    return (
      <form onSubmit={gravar} className="space-y-4">
        <div>
          <label className="label" htmlFor="i-missao">Missao</label>
          <textarea id="i-missao" className="input min-h-[80px]" value={f.missao}
            onChange={(e) => setF((x) => ({ ...x, missao: e.target.value }))}
            placeholder="Por que a empresa existe" />
        </div>
        <div>
          <label className="label" htmlFor="i-visao">Visao</label>
          <textarea id="i-visao" className="input min-h-[80px]" value={f.visao}
            onChange={(e) => setF((x) => ({ ...x, visao: e.target.value }))}
            placeholder="Onde a empresa quer chegar" />
        </div>
        <div className="max-w-xs">
          <label className="label" htmlFor="i-prazo">Prazo da visao</label>
          <input id="i-prazo" type="date" className="input" value={f.visaoPrazo || ""}
            onChange={(e) => setF((x) => ({ ...x, visaoPrazo: e.target.value }))} />
        </div>
        <div className="flex gap-2">
          <button className="btn-primary">Salvar</button>
          <button type="button" className="btn-ghost" onClick={() => setEditando(false)}>Cancelar</button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      {identidade?.missao || identidade?.visao ? (
        <>
          {identidade.missao && (
            <div>
              <p className="label">Missao</p>
              <p className="text-lg leading-relaxed text-slate-800">{identidade.missao}</p>
            </div>
          )}
          {identidade.visao && (
            <div>
              <p className="label">Visao{identidade.visao_prazo ? ` ate ${dataCurta(identidade.visao_prazo)}` : ""}</p>
              <p className="text-lg leading-relaxed text-slate-800">{identidade.visao}</p>
            </div>
          )}
        </>
      ) : (
        <Empty>
          Missao e visao ainda nao foram escritas. Elas servem para decidir quando nao ha regra:
          e o que sobra quando o manual nao cobre o caso.
        </Empty>
      )}

      <div>
        <p className="label mb-2">Valores</p>
        {valores.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {valores.map((v) => (
              <CartaoValor key={v.id} v={v} podeEditar={podeEditar}
                aoEditar={(x) => setValor({
                  id: x.id, nome: x.nome, significado: x.significado,
                  comportamentoEsperado: x.comportamento_esperado,
                  comportamentoInaceitavel: x.comportamento_inaceitavel, ordem: x.ordem,
                })}
                aoRemover={async (x) => {
                  if (!window.confirm(`Remover o valor "${x.nome}"?`)) return;
                  await removerValor(x.id); await aoRecarregar();
                }} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            Nenhum valor escrito. Valor sem comportamento descrito vira quadro na parede.
          </p>
        )}
      </div>

      {valor && (
        <form onSubmit={gravarValor} className="space-y-3 rounded-xl border p-3" style={{ borderColor: "var(--hairline)" }}>
          <div>
            <label className="label" htmlFor="v-nome">Nome do valor</label>
            <input id="v-nome" className="input" value={valor.nome} autoFocus
              onChange={(e) => setValor((x) => ({ ...x, nome: e.target.value }))} />
          </div>
          <div>
            <label className="label" htmlFor="v-sig">O que significa aqui dentro</label>
            <textarea id="v-sig" className="input" value={valor.significado || ""}
              onChange={(e) => setValor((x) => ({ ...x, significado: e.target.value }))} />
          </div>
          <div>
            <label className="label" htmlFor="v-esp">Comportamento esperado</label>
            <textarea id="v-esp" className="input" value={valor.comportamentoEsperado || ""}
              onChange={(e) => setValor((x) => ({ ...x, comportamentoEsperado: e.target.value }))} />
          </div>
          <div>
            <label className="label" htmlFor="v-ina">Comportamento inaceitavel</label>
            <textarea id="v-ina" className="input" value={valor.comportamentoInaceitavel || ""}
              onChange={(e) => setValor((x) => ({ ...x, comportamentoInaceitavel: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <button className="btn-primary">Salvar valor</button>
            <button type="button" className="btn-ghost" onClick={() => setValor(null)}>Cancelar</button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: "var(--hairline)" }}>
        {podeEditar && !valor && (
          <>
            <button type="button" className="btn-ghost h-8 px-2 text-xs" onClick={abrir}>
              <Pencil size={13} /> Editar missao e visao
            </button>
            <button type="button" className="btn-ghost h-8 px-2 text-xs"
              onClick={() => setValor({ nome: "", significado: "", comportamentoEsperado: "", comportamentoInaceitavel: "", ordem: valores.length })}>
              <Plus size={13} /> Novo valor
            </button>
          </>
        )}
        {identidade?.atualizado_por && (
          <span className="ml-auto text-xs text-slate-400">
            atualizado em {dataLonga(String(identidade.atualizado_em).slice(0, 10))} por {identidade.atualizado_por}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── 2. PLANEJAMENTO DO ANO ───────────────────────────────────────────────── */
function BlocoPlano({ dados, podeEditar, aoRecarregar, aoAvisar }) {
  const { plano, objetivos, indicadores, taticas } = dados;
  const [tese, setTese] = useState("");
  const [editTese, setEditTese] = useState(false);
  const [obj, setObj] = useState(null);
  const [ind, setInd] = useState(null);

  const grupos = useMemo(() => porObjetivo(objetivos, indicadores, taticas), [objetivos, indicadores, taticas]);

  const gravarTese = async (e) => {
    e.preventDefault();
    try {
      await salvarPlano({ ano: plano?.ano || new Date().getFullYear(), tese });
      setEditTese(false); await aoRecarregar();
    } catch (err) { aoAvisar({ tom: "erro", texto: err.message }); }
  };

  if (!plano && !podeEditar) {
    return <Empty>O plano do ano ainda nao foi montado pela diretoria.</Empty>;
  }

  return (
    <div className="space-y-5">
      {editTese ? (
        <form onSubmit={gravarTese} className="space-y-3">
          <div>
            <label className="label" htmlFor="p-tese">Tese do ano</label>
            <textarea id="p-tese" className="input min-h-[80px]" value={tese} autoFocus
              onChange={(e) => setTese(e.target.value)}
              placeholder="A aposta central do ano, numa frase" />
          </div>
          <div className="flex gap-2">
            <button className="btn-primary">Salvar</button>
            <button type="button" className="btn-ghost" onClick={() => setEditTese(false)}>Cancelar</button>
          </div>
        </form>
      ) : (
        <div className="rounded-xl bg-brand/5 p-4">
          <p className="label">Tese de {plano?.ano || new Date().getFullYear()}</p>
          <p className="font-display text-lg font-semibold leading-snug text-slate-900">
            {plano?.tese || "Sem tese escrita."}
          </p>
          {podeEditar && (
            <button type="button" className="btn-ghost mt-2 h-8 px-2 text-xs"
              onClick={() => { setTese(plano?.tese || ""); setEditTese(true); }}>
              <Pencil size={13} /> {plano ? "Editar tese" : "Criar o plano do ano"}
            </button>
          )}
        </div>
      )}

      {!grupos.length && <Empty>Nenhum objetivo ainda. De tres a cinco bastam: mais que isso nao e foco, e lista.</Empty>}

      {grupos.map((g) => {
        const sit = SITUACOES[g.situacao] || SITUACOES.no_rumo;
        return (
          <div key={g.id} className="rounded-xl border p-4" style={{ borderColor: "var(--hairline)" }}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${sit.ponto}`} />
              <span className="min-w-0 flex-1 font-display text-sm font-semibold text-slate-900">{g.titulo}</span>
              <span className={sit.chip}>{sit.rotulo}</span>
              {podeEditar && (
                <>
                  <button type="button" className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
                    onClick={() => setObj({ id: g.id, titulo: g.titulo, responsavel: g.responsavel, situacao: g.situacao, ordem: g.ordem })}>
                    <Pencil size={13} />
                  </button>
                  <button type="button" className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 hover:bg-bad-50 hover:text-bad-700"
                    onClick={async () => {
                      if (!window.confirm(`Remover o objetivo "${g.titulo}"? As taticas dele ficam sem objetivo, nao sao apagadas.`)) return;
                      await removerObjetivo(g.id); await aoRecarregar();
                    }}>
                    <Trash2 size={13} />
                  </button>
                </>
              )}
            </div>
            <p className="mb-3 text-xs text-slate-500">
              {g.responsavel ? `Responsavel: ${g.responsavel} · ` : ""}
              {g.abertas} tatica(s) em aberto · {g.concluidas} concluida(s)
            </p>

            {g.indicadores.map((i) => {
              const pct = i.meta ? Math.min(100, Math.round((Number(i.atual) / Number(i.meta)) * 100)) : 0;
              return (
                <div key={i.id} className="mb-2">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-slate-700">{i.nome}</span>
                    <span className="shrink-0 tabular-nums text-slate-600">
                      {numero(i.atual)} / {numero(i.meta)} {i.unidade}
                    </span>
                    {podeEditar && (
                      <button type="button" className="shrink-0 text-slate-400 hover:text-slate-700"
                        onClick={() => setInd({ id: i.id, objetivoId: g.id, nome: i.nome, unidade: i.unidade, meta: i.meta, atual: i.atual, ordem: i.ordem })}>
                        <Pencil size={12} />
                      </button>
                    )}
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${pct >= 100 ? "bg-ok-600" : pct >= 60 ? "bg-brand" : "bg-warn-600"}`}
                      style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}

            {podeEditar && (
              <button type="button" className="btn-ghost mt-2 h-8 px-2 text-xs"
                onClick={() => setInd({ objetivoId: g.id, nome: "", unidade: "", meta: 0, atual: 0, ordem: g.indicadores.length })}>
                <Plus size={13} /> Indicador
              </button>
            )}
          </div>
        );
      })}

      {podeEditar && plano && !obj && (
        <button type="button" className="btn-ghost h-9 px-3 text-sm"
          onClick={() => setObj({ planoAnoId: plano.id, titulo: "", responsavel: "", situacao: "no_rumo", ordem: objetivos.length })}>
          <Plus size={14} /> Novo objetivo
        </button>
      )}

      {obj && (
        <form className="space-y-3 rounded-xl border p-3" style={{ borderColor: "var(--hairline)" }}
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await salvarObjetivo({ ...obj, planoAnoId: obj.planoAnoId || plano.id });
              setObj(null); await aoRecarregar();
            } catch (err) { aoAvisar({ tom: "erro", texto: err.message }); }
          }}>
          <div>
            <label className="label" htmlFor="o-titulo">Objetivo</label>
            <input id="o-titulo" className="input" value={obj.titulo} autoFocus
              onChange={(e) => setObj((x) => ({ ...x, titulo: e.target.value }))} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="o-resp">Responsavel</label>
              <input id="o-resp" className="input" value={obj.responsavel || ""}
                onChange={(e) => setObj((x) => ({ ...x, responsavel: e.target.value }))} />
            </div>
            <div>
              <label className="label" htmlFor="o-sit">Situacao</label>
              <select id="o-sit" className="input" value={obj.situacao}
                onChange={(e) => setObj((x) => ({ ...x, situacao: e.target.value }))}>
                {Object.entries(SITUACOES).map(([id, s]) => <option key={id} value={id}>{s.rotulo}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary">Salvar objetivo</button>
            <button type="button" className="btn-ghost" onClick={() => setObj(null)}>Cancelar</button>
          </div>
        </form>
      )}

      {ind && (
        <form className="space-y-3 rounded-xl border p-3" style={{ borderColor: "var(--hairline)" }}
          onSubmit={async (e) => {
            e.preventDefault();
            try { await salvarIndicador(ind); setInd(null); await aoRecarregar(); }
            catch (err) { aoAvisar({ tom: "erro", texto: err.message }); }
          }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="n-nome">Indicador</label>
              <input id="n-nome" className="input" value={ind.nome} autoFocus
                onChange={(e) => setInd((x) => ({ ...x, nome: e.target.value }))} />
            </div>
            <div>
              <label className="label" htmlFor="n-meta">Meta</label>
              <input id="n-meta" className="input" inputMode="decimal" value={ind.meta}
                onChange={(e) => setInd((x) => ({ ...x, meta: e.target.value }))} />
            </div>
            <div>
              <label className="label" htmlFor="n-atual">Hoje</label>
              <input id="n-atual" className="input" inputMode="decimal" value={ind.atual}
                onChange={(e) => setInd((x) => ({ ...x, atual: e.target.value }))} />
            </div>
            <div>
              <label className="label" htmlFor="n-un">Unidade</label>
              <input id="n-un" className="input" value={ind.unidade || ""} placeholder="R$, %, un"
                onChange={(e) => setInd((x) => ({ ...x, unidade: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary">Salvar indicador</button>
            <button type="button" className="btn-ghost" onClick={() => setInd(null)}>Cancelar</button>
            {ind.id && (
              <button type="button" className="btn-ghost text-bad-700"
                onClick={async () => { await removerIndicador(ind.id); setInd(null); await aoRecarregar(); }}>
                Remover
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

/* ── 4. REUNIOES E ATAS ───────────────────────────────────────────────────── */
function BlocoAtas({ dados, papel, aoRecarregar, aoAvisar }) {
  const { reunioes, decisoes, objetivos, taticas } = dados;
  const [aberta, setAberta] = useState(null);
  const [nova, setNova] = useState(null);
  const [dec, setDec] = useState(null);

  const cumpre = useMemo(() => cumprimentoDecisoes(decisoes, taticas), [decisoes, taticas]);
  const r = aberta ? reunioes.find((x) => x.id === aberta) : null;
  const minhasDecisoes = r ? decisoes.filter((d) => d.reuniao_id === r.id) : [];
  const travada = r?.status === "aprovada";

  const criar = async (e) => {
    e.preventDefault();
    try {
      const criada = await salvarReuniao(nova);
      setNova(null); setAberta(criada.id); await aoRecarregar();
    } catch (err) { aoAvisar({ tom: "erro", texto: err.message }); }
  };

  if (r) {
    return (
      <div className="space-y-4">
        <button type="button" className="btn-ghost h-8 px-2 text-xs" onClick={() => setAberta(null)}>
          ← Voltar para a lista
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-base font-semibold text-slate-900">
            {TIPOS_REUNIAO[r.tipo]} · {dataCurta(r.data)}
          </span>
          {travada && (
            <span className="chip-ok inline-flex items-center gap-1">
              <Lock size={12} /> aprovada por {r.aprovada_por}
            </span>
          )}
        </div>

        {r.pauta && (
          <div>
            <p className="label">Pauta</p>
            <p className="whitespace-pre-wrap text-sm text-slate-700">{r.pauta}</p>
          </div>
        )}

        <div>
          <label className="label" htmlFor="r-registro">Registro da reuniao</label>
          <textarea id="r-registro" className="input min-h-[120px]" defaultValue={r.registro} disabled={travada}
            onBlur={async (e) => {
              if (travada || e.target.value === r.registro) return;
              try { await salvarReuniao({ ...r, reuniaoId: r.id, id: r.id, registro: e.target.value, participantes: r.participantes }); await aoRecarregar(); }
              catch (err) { aoAvisar({ tom: "erro", texto: err.message }); }
            }} />
        </div>

        <div>
          <p className="label mb-2">Decisoes</p>
          {minhasDecisoes.length ? (
            <div className="space-y-2">
              {minhasDecisoes.map((d) => (
                <div key={d.id} className="rounded-xl border p-3" style={{ borderColor: "var(--hairline)" }}>
                  <p className="text-sm text-slate-800">{d.texto}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {[d.responsavel, d.prazo ? `ate ${dataCurta(d.prazo)}` : null].filter(Boolean).join(" · ") || "sem responsavel"}
                    {taticas.some((t) => t.decisao_id === d.id) && " · virou tatica"}
                  </p>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-slate-500">Nenhuma decisao registrada.</p>}
        </div>

        {!travada && (
          <>
            {dec ? (
              <form className="space-y-3 rounded-xl border p-3" style={{ borderColor: "var(--hairline)" }}
                onSubmit={async (e) => {
                  e.preventDefault();
                  try { await salvarDecisao({ ...dec, reuniaoId: r.id }); setDec(null); await aoRecarregar(); }
                  catch (err) { aoAvisar({ tom: "erro", texto: err.message }); }
                }}>
                <div>
                  <label className="label" htmlFor="d-texto">O que ficou decidido</label>
                  <textarea id="d-texto" className="input" value={dec.texto} autoFocus
                    onChange={(e) => setDec((x) => ({ ...x, texto: e.target.value }))} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="d-resp">Responsavel</label>
                    <input id="d-resp" className="input" value={dec.responsavel}
                      onChange={(e) => setDec((x) => ({ ...x, responsavel: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label" htmlFor="d-prazo">Prazo</label>
                    <input id="d-prazo" type="date" className="input" value={dec.prazo || ""}
                      onChange={(e) => setDec((x) => ({ ...x, prazo: e.target.value }))} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="btn-primary">Salvar decisao</button>
                  <button type="button" className="btn-ghost" onClick={() => setDec(null)}>Cancelar</button>
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap gap-2 border-t pt-3" style={{ borderColor: "var(--hairline)" }}>
                <button type="button" className="btn-ghost h-9 px-3 text-sm"
                  onClick={() => setDec({ texto: "", responsavel: "", prazo: "" })}>
                  <Plus size={14} /> Nova decisao
                </button>
                {/* R4: as decisoes viram taticas. O objetivo e perguntado aqui
                    porque R3 vale tambem para o que nasce de ata. */}
                <GerarAcoes reuniao={r} objetivos={objetivos} aoRecarregar={aoRecarregar} aoAvisar={aoAvisar} />
                {papel === "diretoria" && (
                  <button type="button" className="btn-ghost h-9 px-3 text-sm"
                    onClick={async () => {
                      if (!window.confirm("Aprovar esta ata? Depois disso ela nao pode mais ser alterada.")) return;
                      try { await aprovarAta(r.id); await aoRecarregar(); aoAvisar({ tom: "ok", texto: "Ata aprovada." }); }
                      catch (err) { aoAvisar({ tom: "erro", texto: err.message }); }
                    }}>
                    <Check size={14} /> Aprovar ata
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {cumpre.geral.total > 0 && (
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="label">Decisoes cumpridas no prazo</p>
          <p className="font-display text-2xl font-bold text-slate-900">
            {cumpre.geral.pct}% <span className="text-sm font-normal text-slate-500">
              ({cumpre.geral.noPrazo} de {cumpre.geral.total})
            </span>
          </p>
          {cumpre.porPessoa.length > 1 && (
            <div className="mt-2 space-y-1">
              {cumpre.porPessoa.map((p) => (
                <div key={p.nome} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate text-slate-700">{p.nome}</span>
                  <span className="shrink-0 tabular-nums text-slate-600">{p.pct}% ({p.noPrazo}/{p.total})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {nova ? (
        <form onSubmit={criar} className="space-y-3 rounded-xl border p-3" style={{ borderColor: "var(--hairline)" }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="nr-tipo">Tipo</label>
              <select id="nr-tipo" className="input" value={nova.tipo}
                onChange={(e) => {
                  const tipo = e.target.value;
                  setNova((x) => ({ ...x, tipo, pauta: pautaSugerida(reunioes, decisoes, tipo) }));
                }}>
                {Object.entries(TIPOS_REUNIAO).map(([id, t]) => <option key={id} value={id}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="nr-data">Data</label>
              <input id="nr-data" type="date" className="input" value={nova.data}
                onChange={(e) => setNova((x) => ({ ...x, data: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="nr-part">Participantes (separados por virgula)</label>
            <input id="nr-part" className="input" value={nova.participantesTexto}
              onChange={(e) => setNova((x) => ({ ...x, participantesTexto: e.target.value }))} />
            <p className="mt-1 text-xs text-slate-500">
              Quem nao esta aqui nao ve esta ata. A separacao e feita no servidor.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="nr-pauta">Pauta</label>
            <textarea id="nr-pauta" className="input min-h-[100px]" value={nova.pauta}
              onChange={(e) => setNova((x) => ({ ...x, pauta: e.target.value }))} />
            <p className="mt-1 text-xs text-slate-500">
              Ja veio preenchida com o que ficou em aberto nas reunioes anteriores deste mesmo tipo.
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary">Criar reuniao</button>
            <button type="button" className="btn-ghost" onClick={() => setNova(null)}>Cancelar</button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn-primary"
          onClick={() => setNova({
            tipo: "semanal_gestao", data: ymdLocal(new Date()), participantesTexto: "",
            pauta: pautaSugerida(reunioes, decisoes, "semanal_gestao"),
          })}>
          <Plus size={15} strokeWidth={2.4} /> Nova reuniao
        </button>
      )}

      {reunioes.length ? (
        <div className="space-y-2">
          {reunioes.map((x) => {
            const abertas = decisoes.filter((d) => d.reuniao_id === x.id && d.status === "aberta").length;
            return (
              <button key={x.id} type="button" onClick={() => setAberta(x.id)}
                className="flex w-full flex-wrap items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-slate-50"
                style={{ borderColor: "var(--hairline)" }}>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-sm font-medium text-slate-900">
                    {TIPOS_REUNIAO[x.tipo]}
                  </span>
                  <span className="block text-xs text-slate-500">{dataLonga(x.data)}</span>
                </span>
                {abertas > 0 && <span className="chip-warn shrink-0">{abertas} em aberto</span>}
                {x.status === "aprovada" && <span className="chip-ok shrink-0">aprovada</span>}
              </button>
            );
          })}
        </div>
      ) : (
        <Empty>Nenhuma reuniao registrada. A ata e o que faz a decisao sobreviver a semana.</Empty>
      )}
    </div>
  );
}

// Botao separado porque ele precisa perguntar o objetivo antes de gerar (R3).
function GerarAcoes({ reuniao, objetivos, aoRecarregar, aoAvisar }) {
  const [escolhendo, setEscolhendo] = useState(false);
  const [objetivoId, setObjetivoId] = useState("");

  if (!escolhendo) {
    return (
      <button type="button" className="btn-ghost h-9 px-3 text-sm" onClick={() => setEscolhendo(true)}>
        <Swords size={14} /> Gerar acoes
      </button>
    );
  }
  return (
    <div className="w-full rounded-xl border p-3" style={{ borderColor: "var(--hairline)" }}>
      <p className="mb-2 text-sm text-slate-700">
        As decisoes em aberto viram taticas. A qual objetivo do ano elas pertencem?
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select className="input h-9 w-auto py-0 text-sm" value={objetivoId} onChange={(e) => setObjetivoId(e.target.value)}>
          <option value="">Escolha o objetivo...</option>
          {objetivos.map((o) => <option key={o.id} value={o.id}>{o.titulo}</option>)}
        </select>
        <button type="button" className="btn-primary h-9 px-3 text-sm" disabled={!objetivoId}
          onClick={async () => {
            try {
              const r = await gerarAcoes(reuniao.id, objetivoId);
              setEscolhendo(false);
              await aoRecarregar();
              aoAvisar({
                tom: r.criadas ? "ok" : "aviso",
                texto: r.criadas ? `${r.criadas} tatica(s) criada(s) a partir das decisoes.`
                                 : "Nenhuma decisao nova para virar tatica.",
              });
            } catch (err) { aoAvisar({ tom: "erro", texto: err.message }); }
          }}>
          Gerar
        </button>
        <button type="button" className="btn-ghost h-9 px-3 text-sm" onClick={() => setEscolhendo(false)}>Cancelar</button>
      </div>
    </div>
  );
}

/* ── 5. FECHAMENTO DE CICLO ───────────────────────────────────────────────── */
function BlocoCiclo({ dados, podeEditar, hojeISO, aoRecarregar, aoAvisar }) {
  const { plano, objetivos, indicadores, taticas, decisoes, ciclos } = dados;
  const alerta = alertaDeCiclo(hojeISO);
  const [f, setF] = useState({ realizado: "", desvios: "", aprendizados: "" });
  const [verHistorico, setVerHistorico] = useState(false);

  const concluidas = taticas.filter((t) => t.status === "concluida");
  const naoConcluidas = taticas.filter((t) => t.status === "aberta" || t.status === "em_andamento");
  const decisoesPendentes = decisoes.filter((d) => d.status === "aberta");

  if (!plano) return <Empty>Sem plano do ano, nao ha ciclo para fechar.</Empty>;

  return (
    <div className="space-y-5">
      <div className={`rounded-xl p-3 text-sm ${alerta.destaque ? "bg-warn-50 text-warn-700" : "bg-slate-50 text-slate-600"}`}>
        {alerta.destaque
          ? `Faltam ${alerta.dias} dia(s) para o fim do ${alerta.tipo === "anual" ? "ano" : "trimestre"}. Hora de fechar o ciclo.`
          : `Proximo fechamento de trimestre em ${alerta.dias} dia(s).`}
      </div>

      {/* Tres colunas: planejado, realizado, desvio. Os dois primeiros vem do
          banco; o desvio e o unico que precisa de gente para explicar. */}
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-xl border p-3" style={{ borderColor: "var(--hairline)" }}>
          <p className="label">Planejado</p>
          <p className="mt-1 text-sm text-slate-700">{objetivos.length} objetivo(s)</p>
          <p className="text-sm text-slate-700">{indicadores.length} indicador(es)</p>
          <p className="text-sm text-slate-700">{taticas.length} tatica(s)</p>
        </div>
        <div className="rounded-xl border p-3" style={{ borderColor: "var(--hairline)" }}>
          <p className="label">Realizado</p>
          <p className="mt-1 text-sm text-ok-700">{concluidas.length} tatica(s) concluida(s)</p>
          <p className="text-sm text-slate-700">
            {indicadores.filter((i) => Number(i.atual) >= Number(i.meta) && Number(i.meta) > 0).length} indicador(es) na meta
          </p>
        </div>
        <div className="rounded-xl border p-3" style={{ borderColor: "var(--hairline)" }}>
          <p className="label">Desvio</p>
          <p className="mt-1 text-sm text-bad-700">{naoConcluidas.length} tatica(s) nao concluida(s)</p>
          <p className="text-sm text-bad-700">{decisoesPendentes.length} decisao(oes) de ata pendente(s)</p>
        </div>
      </div>

      {podeEditar && (
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="c-realizado">O que de fato aconteceu</label>
            <textarea id="c-realizado" className="input min-h-[70px]" value={f.realizado}
              onChange={(e) => setF((x) => ({ ...x, realizado: e.target.value }))} />
          </div>
          <div>
            <label className="label" htmlFor="c-desvios">Desvios e por que aconteceram</label>
            <textarea id="c-desvios" className="input min-h-[70px]" value={f.desvios}
              onChange={(e) => setF((x) => ({ ...x, desvios: e.target.value }))} />
          </div>
          <div>
            <label className="label" htmlFor="c-aprend">Aprendizados e ajustes de rota</label>
            <textarea id="c-aprend" className="input min-h-[70px]" value={f.aprendizados}
              onChange={(e) => setF((x) => ({ ...x, aprendizados: e.target.value }))} />
          </div>
          <div className="flex flex-wrap gap-2">
            {["trimestral", "anual"].map((tipo) => (
              <button key={tipo} type="button"
                className={tipo === "anual" ? "btn-ghost" : "btn-primary"}
                onClick={async () => {
                  const aviso = tipo === "anual"
                    ? "Encerrar o ANO? O plano atual e congelado, um plano novo e criado e as taticas pendentes atravessam sem objetivo, para voce religar."
                    : "Fechar o trimestre? O retrato de hoje fica guardado e o plano do ano continua ativo.";
                  if (!window.confirm(aviso)) return;
                  try {
                    const r = await encerrarCiclo({
                      tipo, periodo: tipo === "anual" ? String(plano.ano) : `${plano.ano} T${Math.ceil(Number(hojeISO.slice(5, 7)) / 3)}`,
                      ...f,
                    });
                    setF({ realizado: "", desvios: "", aprendizados: "" });
                    await aoRecarregar();
                    aoAvisar({
                      tom: "ok",
                      texto: r.encerrouPlano
                        ? `Ano encerrado. Plano novo criado; ${r.taticasQueAtravessaram} tatica(s) atravessaram.`
                        : "Trimestre fechado e guardado no historico.",
                    });
                  } catch (err) { aoAvisar({ tom: "erro", texto: err.message }); }
                }}>
                <Flag size={14} /> {tipo === "anual" ? "Encerrar o ano" : "Fechar o trimestre"}
              </button>
            ))}
          </div>
        </div>
      )}

      {ciclos.length > 0 && (
        <div className="border-t pt-3" style={{ borderColor: "var(--hairline)" }}>
          <button type="button" className="btn-ghost h-8 px-2 text-xs" onClick={() => setVerHistorico((v) => !v)}>
            <ChevronDown size={13} className={verHistorico ? "" : "-rotate-90"} />
            Ciclos anteriores ({ciclos.length})
          </button>
          {verHistorico && (
            <div className="mt-2 space-y-2">
              {ciclos.map((c) => (
                <div key={c.id} className="rounded-xl border p-3 text-sm" style={{ borderColor: "var(--hairline)" }}>
                  <p className="font-display font-semibold text-slate-900">
                    {c.periodo} · {c.tipo === "anual" ? "anual" : "trimestral"}
                  </p>
                  {c.realizado && <p className="mt-1 text-slate-700"><b>Realizado:</b> {c.realizado}</p>}
                  {c.desvios && <p className="text-slate-700"><b>Desvios:</b> {c.desvios}</p>}
                  {c.aprendizados && <p className="text-slate-700"><b>Aprendizados:</b> {c.aprendizados}</p>}
                  <p className="mt-1 text-xs text-slate-400">
                    congelado com {(c.snapshot_planejado?.taticas || []).length} tatica(s) ·
                    {" "}{dataLonga(String(c.criado_em).slice(0, 10))}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── TELA ─────────────────────────────────────────────────────────────────── */
export default function Gestao() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [abertos, setAbertos] = useState(() =>
    Object.fromEntries(BLOCOS.map((b) => [b.id, b.padrao])));
  const hojeISO = ymdLocal(new Date());

  const carregar = useCallback(async () => {
    try {
      const d = await lerGestao();
      setDados(d);
      setErro(null);
      // A escolha de cada pessoa vence o padrao; bloco nunca visitado fica no
      // padrao (tatico aberto, resto recolhido).
      if (d.preferencias && Object.keys(d.preferencias).length) {
        setAbertos((a) => ({ ...a, ...d.preferencias }));
      }
    } catch (e) { setErro(e.message); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const alterna = (id) => {
    setAbertos((a) => {
      const novo = { ...a, [id]: !a[id] };
      gravarPreferencia(id, novo[id]);
      return novo;
    });
  };

  if (erro) return <ErroModulo mensagem={erro} aoTentar={carregar} />;
  if (!dados) return <CarregandoModulo />;

  const papel = dados.papel;
  const ehDiretoria = papel === "diretoria";
  const alerta = alertaDeCiclo(hojeISO);

  // Colaborador recebe so a identidade -- e o servidor que corta. A tela mostra
  // o que recebeu, sem fingir que existe mais.
  if (papel === "colaborador") {
    return (
      <div className="space-y-6">
        <PageTitle titulo="Gestao" descricao="A identidade da Impresilk: por que existimos e o que nao se negocia." />
        <Card>
          <BlocoIdentidade dados={dados} podeEditar={false} aoRecarregar={carregar} aoAvisar={setAviso} />
        </Card>
      </div>
    );
  }

  const conteudo = {
    identidade: <BlocoIdentidade dados={dados} podeEditar={ehDiretoria} aoRecarregar={carregar} aoAvisar={setAviso} />,
    plano: <BlocoPlano dados={dados} podeEditar={ehDiretoria} aoRecarregar={carregar} aoAvisar={setAviso} />,
    tatico: (
      <EsquemaTatico
        taticas={dados.taticas}
        objetivos={dados.objetivos}
        escopo="empresa"
        empresaId={dados.empresaId}
        mostrarVinculoObjetivo
        permitirCriar
        permitirEditar
        hojeISO={hojeISO}
        aoSalvar={async (t) => { await salvarTatica(t); await carregar(); }}
        aoRemover={async (id) => { await removerTatica(id); await carregar(); }}
      />
    ),
    atas: <BlocoAtas dados={dados} papel={papel} aoRecarregar={carregar} aoAvisar={setAviso} />,
    ciclo: <BlocoCiclo dados={dados} podeEditar={ehDiretoria} hojeISO={hojeISO} aoRecarregar={carregar} aoAvisar={setAviso} />,
  };

  return (
    <div className="space-y-4">
      <PageTitle
        titulo="Gestao"
        descricao="Identidade, plano do ano, o que esta sendo feito agora e o que ficou decidido. Nao e painel de producao: e direcao."
      />

      {aviso && (
        <p className={`rounded-lg px-3 py-2 text-sm ${
          aviso.tom === "ok" ? "bg-ok-50 text-ok-700"
            : aviso.tom === "aviso" ? "bg-warn-50 text-warn-700" : "bg-bad-50 text-bad-700"
        }`}>
          {aviso.texto}
        </p>
      )}

      {BLOCOS.map((b) => (
        <Acordeao key={b.id} bloco={b} aberto={!!abertos[b.id]} alternar={() => alterna(b.id)}
          destaque={b.id === "ciclo" && alerta.destaque}>
          {conteudo[b.id]}
        </Acordeao>
      ))}
    </div>
  );
}
