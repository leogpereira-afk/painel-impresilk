/* PERMUTAS: quanto o parceiro ainda tem de crédito conosco.
 *
 * Permuta é troca -- o parceiro nos dá um espaço, um serviço, uma mercadoria, e
 * passa a gastar o valor disso em comunicação visual. Hoje esse controle vive
 * na cabeça e num papel: ninguém consegue responder "quanto sobra da permuta do
 * fulano" sem procurar O.S. uma a uma no ERP.
 *
 * A tela é de UMA pergunta: o saldo. Tudo o mais existe para sustentá-lo.
 *
 * DUAS COISAS QUE A TELA NÃO FAZ, DE PROPÓSITO:
 *
 * 1. Não adivinha quais O.S. são da permuta. O mesmo cliente compra na permuta
 *    e compra pagando; só a direção sabe separar. Por isso cada O.S. entra por
 *    um clique, e o que fica guardado é a LISTA das aceitas -- nunca uma regra
 *    que as deduza depois. (Deduzir pelo nome já criou sósia na Central de
 *    Acessos; aqui criaria saldo falso.)
 *
 * 2. Não esconde divergência. Se o valor de uma O.S. mudou no ERP depois do
 *    aceite, ou se ela sumiu (foi cancelada), a linha diz. Um saldo que se
 *    corrige em silêncio é pior que um saldo errado: ninguém vai conferir.
 *
 * VÁRIOS CNPJs, UMA PERMUTA: a permuta guarda uma LISTA de clientes. É comum a
 * troca abranger mais de uma empresa do mesmo dono -- ele consome pela holding
 * numa O.S. e pela operadora na outra, e o crédito é um só.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Plus, Trash2, Search, X, Check, AlertTriangle, Handshake, Building2, Archive,
} from "lucide-react";
import { useApp } from "../config/store.jsx";
import { lerPermutas, salvarPermuta, mexerNasOS, removerPermuta } from "../services/permutas.js";
import {
  chaveCliente, clientesDasOrdens, fichaDaOS, resumoDaPermuta, resumoGeral,
  ordensDosClientes, donoPorOS,
} from "../lib/calc/permutas.js";
import { moeda, paraNumero, paraCampo, dataCurta } from "../lib/format.js";
import { Card, PageTitle, SectionTitle, Empty, CarregandoModulo } from "../components/ui.jsx";

const novoId = () => `permuta-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/* CNPJ só para conferir com o olho, não para copiar em documento: o cache pode
   trazer CPF de pessoa física no mesmo campo. Formata os dois. */
const formatarDoc = (d) => {
  const s = String(d || "");
  if (s.length === 14) return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (s.length === 11) return s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return s;
};

// ------------------------------------------------------------------ pedaços

function Aviso({ aviso, aoFechar }) {
  if (!aviso) return null;
  const erro = aviso.tom === "erro";
  return (
    <Card
      className={`flex items-start justify-between gap-3 text-sm ${
        erro ? "border-bad-200 bg-bad-50 text-bad-700" : "border-ok-200 bg-ok-50 text-ok-700"
      }`}
    >
      <span className="flex items-start gap-2">
        {erro ? <AlertTriangle size={16} className="mt-0.5 shrink-0" /> : <Check size={16} className="mt-0.5 shrink-0" />}
        {aviso.texto}
      </span>
      <button type="button" onClick={aoFechar} className="shrink-0 text-current opacity-60 hover:opacity-100" aria-label="Fechar aviso">
        <X size={14} />
      </button>
    </Card>
  );
}

/* O número que a tela existe para dar. Positivo = o parceiro ainda tem crédito;
   negativo = ele já consumiu além, e a diferença é nossa a receber. */
function Saldo({ valor, grande }) {
  const positivo = valor >= 0;
  return (
    <div>
      <div className={`${grande ? "text-3xl" : "text-xl"} font-semibold tabular-nums ${positivo ? "text-ok-700" : "text-bad-700"}`}>
        {moeda(valor)}
      </div>
      <div className="text-xs text-slate-500">{positivo ? "ainda tem para gastar" : "consumiu além do crédito"}</div>
    </div>
  );
}

function Barra({ pct }) {
  if (pct === null) return null;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className={`h-full rounded-full ${pct >= 1 ? "bg-bad-500" : "bg-brand-500"}`}
        style={{ width: `${Math.max(2, pct * 100)}%` }}
      />
    </div>
  );
}

function CartaoPermuta({ p, aoAbrir }) {
  return (
    <button
      type="button"
      onClick={() => aoAbrir(p.id)}
      className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-brand-300 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-slate-800">{p.nome || "Sem nome"}</span>
            {p.encerrada && (
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">encerrada</span>
            )}
          </div>
          <div className="mt-0.5 truncate text-xs text-slate-500">
            {(p.clientes || []).length
              ? (p.clientes || []).map((c) => c.nome).join(" · ")
              : "sem cliente ligado ainda"}
          </div>
        </div>
        <Saldo valor={p.saldo} />
      </div>
      <div className="mt-3 space-y-1.5">
        <Barra pct={p.pct} />
        <div className="flex justify-between text-[11px] text-slate-500">
          <span>
            {moeda(p.consumido)} usados de {moeda(p.credito)}
          </span>
          <span>
            {p.linhas.length} {p.linhas.length === 1 ? "O.S." : "O.S."}
            {p.mudaram > 0 && <span className="ml-2 text-warn-700">· {p.mudaram} mudou no ERP</span>}
            {p.sumiram > 0 && <span className="ml-2 text-bad-700">· {p.sumiram} sumiu</span>}
          </span>
        </div>
      </div>
    </button>
  );
}

function LinhaAceita({ l, aoTirar }) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-100 py-2.5 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium text-slate-800">O.S. {l.numero}</span>
          <span className="truncate text-xs text-slate-500">{l.cliente}</span>
          {l.mudou && (
            <span className="rounded bg-warn-50 px-1.5 py-0.5 text-[11px] text-warn-700">
              era {moeda(l.congelado)} no aceite
            </span>
          )}
          {l.sumiu && (
            <span className="rounded bg-bad-50 px-1.5 py-0.5 text-[11px] text-bad-700">
              cancelada no ERP — ainda abate
            </span>
          )}
          {l.semConferir && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">valor do aceite</span>
          )}
        </div>
        <div className="text-[11px] text-slate-400">{dataCurta(l.data)}</div>
      </div>
      <span className="shrink-0 tabular-nums text-slate-700">{moeda(l.valor)}</span>
      <button
        type="button"
        onClick={() => aoTirar(l)}
        className="shrink-0 rounded p-1 text-slate-300 hover:bg-bad-50 hover:text-bad-600"
        title="Tirar esta O.S. da permuta"
        aria-label={`Tirar a O.S. ${l.numero} da permuta`}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}

function LinhaEscolher({ o, aoMarcar }) {
  const presa = !!o.presaEm;
  return (
    <label
      className={`flex items-center gap-3 border-b border-slate-100 py-2.5 last:border-0 ${
        presa ? "cursor-not-allowed opacity-55" : "cursor-pointer"
      }`}
    >
      <input
        type="checkbox"
        className="h-4 w-4 shrink-0 accent-brand-600"
        checked={o.nesta}
        disabled={presa}
        onChange={(e) => aoMarcar(o, e.target.checked)}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2">
          <span className="font-medium text-slate-800">O.S. {o.numero}</span>
          <span className="truncate text-xs text-slate-500">{o.cliente}</span>
          {presa && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
              já está na permuta “{o.presaEm}”
            </span>
          )}
        </div>
        <div className="text-[11px] text-slate-400">{dataCurta(o.data)}</div>
      </div>
      <span className="shrink-0 tabular-nums text-slate-700">{moeda(o.valor)}</span>
    </label>
  );
}

// -------------------------------------------------------------------- tela

export default function Permutas() {
  const { dados, pronto, fontesNegadas } = useApp();
  const [mapa, setMapa] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [aberta, setAberta] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [buscaCliente, setBuscaCliente] = useState("");
  const [buscaOS, setBuscaOS] = useState("");

  useEffect(() => {
    let vivo = true;
    lerPermutas()
      .then((m) => vivo && setMapa(m))
      .catch((e) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
  }, []);

  const ordens = useMemo(() => dados?.ordens || [], [dados]);
  const semOrdens = fontesNegadas?.includes("ordens");
  const clientes = useMemo(() => clientesDasOrdens(ordens), [ordens]);
  const donos = useMemo(() => donoPorOS(mapa || {}), [mapa]);
  const lista = useMemo(() => resumoGeral(mapa || {}, ordens), [mapa, ordens]);
  const permuta = aberta ? mapa?.[aberta] : null;
  const resumo = useMemo(
    () => (permuta ? resumoDaPermuta(permuta, ordens) : null),
    [permuta, ordens],
  );

  /* Toda gravação usa o pacote que o SERVIDOR devolveu, nunca o objeto montado
     aqui: se outra aba mexeu na permuta ao lado, o retorno já traz as duas. */
  const gravarCampos = useCallback(async (id, campos) => {
    setAviso(null);
    setSalvando(true);
    try {
      setMapa(await salvarPermuta(id, campos));
      return true;
    } catch (e) {
      setAviso({ tom: "erro", texto: e.message });
      return false;
    } finally {
      setSalvando(false);
    }
  }, []);

  const criar = useCallback(async () => {
    const id = novoId();
    const ok = await gravarCampos(id, {
      nome: "Nova permuta",
      credito: 0,
      clientes: [],
      criadaEm: new Date().toISOString(),
    });
    if (ok) setAberta(id);
  }, [gravarCampos]);

  const apagar = useCallback(
    async (id, nome) => {
      if (!window.confirm(`Apagar a permuta "${nome || "sem nome"}"? O histórico de O.S. aceitas vai junto.`)) return;
      setAviso(null);
      try {
        await removerPermuta(id);
        setMapa((m) => {
          const novo = { ...(m || {}) };
          delete novo[id];
          return novo;
        });
        setAberta(null);
      } catch (e) {
        setAviso({ tom: "erro", texto: e.message });
      }
    },
    [],
  );

  /* Marcar e desmarcar mandam O.S. a O.S. (`osPatch`), não o mapa inteiro. Duas
     abas aceitando O.S. diferentes ao mesmo tempo não se apagam. */
  const marcarOS = useCallback(
    async (o, ligar) => {
      if (!aberta) return;
      setAviso(null);
      setSalvando(true);
      try {
        const bruta = ordens.find((x) => String(x.id) === String(o.id));
        setMapa(await mexerNasOS(aberta, { [o.id]: ligar ? fichaDaOS(bruta || o) : null }));
      } catch (e) {
        setAviso({ tom: "erro", texto: e.message });
      } finally {
        setSalvando(false);
      }
    },
    [aberta, ordens],
  );

  const ligarCliente = useCallback(
    async (c) => {
      if (!aberta || !permuta) return;
      const atuais = permuta.clientes || [];
      if (atuais.some((x) => x.chave === c.chave)) return;
      await gravarCampos(aberta, {
        clientes: [...atuais, { chave: c.chave, nome: c.nome, cnpjs: c.cnpjs }],
      });
      setBuscaCliente("");
    },
    [aberta, permuta, gravarCampos],
  );

  /* Tirar o cliente NÃO tira as O.S. dele que já foram aceitas: o crédito foi
     gasto de verdade, e sumir com ele aqui faria o saldo subir sozinho. As O.S.
     continuam na lista de aceitas, para a direção tirar uma a uma se quiser. */
  const desligarCliente = useCallback(
    async (chave) => {
      if (!aberta || !permuta) return;
      await gravarCampos(aberta, { clientes: (permuta.clientes || []).filter((x) => x.chave !== chave) });
    },
    [aberta, permuta, gravarCampos],
  );

  const chavesDaPermuta = useMemo(() => (permuta?.clientes || []).map((c) => c.chave), [permuta]);
  const paraEscolher = useMemo(
    () => ordensDosClientes(ordens, chavesDaPermuta, donos, aberta),
    [ordens, chavesDaPermuta, donos, aberta],
  );
  const paraEscolherFiltradas = useMemo(() => {
    const t = buscaOS.trim().toLowerCase();
    if (!t) return paraEscolher;
    return paraEscolher.filter(
      (o) => o.numero.toLowerCase().includes(t) || o.cliente.toLowerCase().includes(t),
    );
  }, [paraEscolher, buscaOS]);

  const clientesAchados = useMemo(() => {
    const t = chaveCliente(buscaCliente);
    if (t.length < 2) return [];
    const jaTem = new Set(chavesDaPermuta);
    return clientes.filter((c) => !jaTem.has(c.chave) && c.chave.includes(t)).slice(0, 8);
  }, [buscaCliente, clientes, chavesDaPermuta]);

  if (erro) {
    return (
      <div className="space-y-6">
        <PageTitle titulo="Permutas" descricao="O que o parceiro nos deu e o que ele já gastou." />
        <Card className="flex items-start gap-2 text-sm text-bad-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {erro}
        </Card>
      </div>
    );
  }
  if (mapa === null || !pronto) return <CarregandoModulo />;

  // ------------------------------------------------------------ uma permuta
  if (permuta && resumo) {
    return (
      <div className="space-y-5">
        <button
          type="button"
          onClick={() => setAberta(null)}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft size={15} /> Todas as permutas
        </button>

        <Aviso aviso={aviso} aoFechar={() => setAviso(null)} />

        <Card className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <input
              className="input max-w-sm flex-1 text-lg font-medium"
              value={permuta.nome ?? ""}
              placeholder="De quem é esta permuta?"
              onChange={(e) => setMapa((m) => ({ ...m, [aberta]: { ...m[aberta], nome: e.target.value } }))}
              onBlur={(e) => gravarCampos(aberta, { nome: e.target.value })}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => gravarCampos(aberta, { encerrada: !permuta.encerrada })}
                title={permuta.encerrada ? "Reabrir a permuta" : "Encerrar: sai do topo da lista, o histórico fica"}
              >
                <Archive size={15} /> {permuta.encerrada ? "Reabrir" : "Encerrar"}
              </button>
              <button
                type="button"
                className="rounded-lg p-2 text-slate-300 hover:bg-bad-50 hover:text-bad-600"
                onClick={() => apagar(aberta, permuta.nome)}
                title="Apagar a permuta"
                aria-label="Apagar a permuta"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-slate-500" htmlFor="credito-permuta">
                Crédito do parceiro
              </label>
              <input
                id="credito-permuta"
                className="input tabular-nums"
                inputMode="decimal"
                placeholder="0,00"
                defaultValue={paraCampo(resumo.credito)}
                key={`credito-${aberta}`}
                onBlur={(e) => gravarCampos(aberta, { credito: paraNumero(e.target.value) })}
              />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">Já usou em O.S.</div>
              <div className="text-xl font-semibold tabular-nums text-slate-800">{moeda(resumo.consumido)}</div>
              <div className="text-xs text-slate-500">{resumo.linhas.length} O.S. aceitas</div>
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">Saldo</div>
              <Saldo valor={resumo.saldo} grande />
            </div>
          </div>
          <Barra pct={resumo.pct} />

          {(resumo.mudaram > 0 || resumo.sumiram > 0 || resumo.semConferir) && (
            <div className="rounded-lg bg-warn-50 px-3 py-2 text-xs text-warn-800">
              {resumo.semConferir && "As O.S. não carregaram nesta sessão: o saldo está usando o valor congelado no aceite. "}
              {resumo.mudaram > 0 && `${resumo.mudaram} O.S. mudaram de valor no ERP depois do aceite (o saldo já usa o valor novo). `}
              {resumo.sumiram > 0 && `${resumo.sumiram} O.S. sumiram do ERP (cancelamento) e continuam abatendo — confira se o crédito deve voltar.`}
            </div>
          )}
        </Card>

        {/* ------------------------------------------------- de quem é */}
        <Card className="space-y-3">
          <SectionTitle
            titulo="Clientes desta permuta"
            sub="Uma permuta pode abranger mais de um CNPJ do mesmo dono — some todos aqui."
          />
          <div className="flex flex-wrap gap-2">
            {(permuta.clientes || []).map((c) => (
              <span key={c.chave} className="flex items-center gap-1.5 rounded-full bg-slate-100 py-1 pl-3 pr-1.5 text-sm text-slate-700">
                <Building2 size={13} className="text-slate-400" />
                <span>{c.nome}</span>
                {(c.cnpjs || []).length > 0 && (
                  <span className="text-[11px] text-slate-400">{c.cnpjs.map(formatarDoc).join(" · ")}</span>
                )}
                <button
                  type="button"
                  onClick={() => desligarCliente(c.chave)}
                  className="rounded-full p-1 text-slate-400 hover:bg-white hover:text-bad-600"
                  aria-label={`Tirar ${c.nome} desta permuta`}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            {!(permuta.clientes || []).length && (
              <span className="text-sm text-slate-400">Nenhum ainda — procure abaixo.</span>
            )}
          </div>

          {semOrdens ? (
            <div className="rounded-lg bg-bad-50 px-3 py-2 text-xs text-bad-700">
              Sua conta não tem acesso às ordens de serviço, então a lista de clientes não carregou.
            </div>
          ) : (
            <div className="relative max-w-md">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="input pl-9"
                placeholder="Procurar cliente pelo nome…"
                value={buscaCliente}
                onChange={(e) => setBuscaCliente(e.target.value)}
              />
              {clientesAchados.length > 0 && (
                <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                  {clientesAchados.map((c) => (
                    <button
                      key={c.chave}
                      type="button"
                      onClick={() => ligarCliente(c)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-slate-800">{c.nome}</span>
                        {c.cnpjs.length > 0 && (
                          <span className="text-[11px] text-slate-400">{c.cnpjs.map(formatarDoc).join(" · ")}</span>
                        )}
                      </span>
                      <span className="shrink-0 text-[11px] text-slate-400">
                        {c.qtd} O.S. · {moeda(c.total)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {buscaCliente.trim().length >= 2 && !clientesAchados.length && (
                <div className="mt-1 text-xs text-slate-400">Nenhum cliente com esse nome nas O.S. desde 2025.</div>
              )}
            </div>
          )}
        </Card>

        {/* ------------------------------------------------- as aceitas */}
        <Card className="space-y-2">
          <SectionTitle titulo="O.S. que entram nesta permuta" sub="É o que abate o crédito." />
          {resumo.linhas.length ? (
            <div>
              {resumo.linhas.map((l) => (
                <LinhaAceita key={l.id} l={l} aoTirar={(x) => marcarOS(x, false)} />
              ))}
            </div>
          ) : (
            <Empty>Nenhuma O.S. aceita ainda. Marque abaixo as que fazem parte da troca.</Empty>
          )}
        </Card>

        {/* ------------------------------------------------- escolher */}
        <Card className="space-y-3">
          <SectionTitle
            titulo="Escolher O.S."
            sub="Só as dos clientes acima. Marque as que fazem parte da permuta — o mesmo cliente também compra pagando."
            acao={
              paraEscolher.length > 8 && (
                <div className="relative">
                  <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    className="input h-8 w-44 pl-8 text-sm"
                    placeholder="nº ou cliente"
                    value={buscaOS}
                    onChange={(e) => setBuscaOS(e.target.value)}
                  />
                </div>
              )
            }
          />
          {!chavesDaPermuta.length ? (
            <Empty>Ligue um cliente acima para ver as O.S. dele.</Empty>
          ) : paraEscolherFiltradas.length ? (
            <div>
              {paraEscolherFiltradas.map((o) => (
                <LinhaEscolher key={o.id} o={o} aoMarcar={marcarOS} />
              ))}
            </div>
          ) : (
            <Empty>
              {buscaOS.trim()
                ? "Nenhuma O.S. com esse número ou nome."
                : "Esses clientes não têm O.S. no período que o painel carrega (a partir de 2025)."}
            </Empty>
          )}
        </Card>

        {salvando && <div className="text-xs text-slate-400">salvando…</div>}
      </div>
    );
  }

  // ------------------------------------------------------------- a lista
  return (
    <div className="space-y-5">
      <PageTitle
        titulo="Permutas"
        descricao="O que cada parceiro nos deu, o que ele já gastou em O.S. e quanto ainda sobra."
        acao={
          <button type="button" className="btn-ghost" onClick={criar} disabled={salvando}>
            <Plus size={15} strokeWidth={2.4} /> Nova permuta
          </button>
        }
      />

      <Aviso aviso={aviso} aoFechar={() => setAviso(null)} />

      {semOrdens && (
        <Card className="flex items-start gap-2 text-sm text-warn-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          Sua conta não tem acesso às ordens de serviço. Os saldos abaixo usam o valor congelado no aceite e não dá
          para acrescentar O.S.
        </Card>
      )}

      {lista.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {lista.map((p) => (
            <CartaoPermuta key={p.id} p={p} aoAbrir={setAberta} />
          ))}
        </div>
      ) : (
        <Card className="py-10 text-center">
          <Handshake size={28} className="mx-auto mb-3 text-slate-300" />
          <div className="text-sm text-slate-500">
            Nenhuma permuta ainda. Crie uma, ligue o cliente e marque as O.S. que entram na troca.
          </div>
        </Card>
      )}
    </div>
  );
}
