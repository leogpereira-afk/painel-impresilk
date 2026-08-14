// As contas dos sistemas — o bloco de Assinaturas da tela de Gestão.
//
// A pergunta que ele responde é uma só: "paguei o Supabase deste mês?". Por
// isso o eixo é o MÊS (com setas para andar), o selo diz o estado daquela
// competência, e marcar como pago é um toque.
//
// O que a tela NUNCA faz é inventar número: dia e valor entram só quando o dono
// digita. Enquanto não entram, a linha diz que falta -- e o total do mês avisa
// quantas contas estão fora dele.
//
// Moeda não se soma: dólar e real aparecem lado a lado, nunca num total só.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, X, Trash2, ExternalLink, Check, ChevronLeft, ChevronRight, Undo2 } from "lucide-react";
import {
  lerAssinaturas,
  salvarAssinatura,
  removerAssinatura,
} from "../services/assinaturas.js";
import {
  calcAssinaturas,
  dinheiro,
  mesDe,
  nomeDoMes,
  MOEDAS,
  SUGESTOES,
} from "../lib/calc/assinaturas.js";
import { numero, dataLonga, ymdLocal } from "../lib/format.js";
import { Selo, FaixaNumeros, LinhaLista } from "./lista.jsx";
import { SectionTitle, Empty, CarregandoModulo, ErroModulo } from "./ui.jsx";

const VAZIA = { nome: "", oQue: "", diaVencimento: "", valor: "", moeda: "USD", url: "", ativa: true };

// Mês anterior/seguinte a partir de "AAAA-MM", sem passar por Date (dezembro
// virava janeiro do mesmo ano em algumas contas ingênuas).
function andarMes(mes, passo) {
  const [a, m] = mes.split("-").map(Number);
  const total = a * 12 + (m - 1) + passo;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

function FormAssinatura({ inicial, salvando, aoSalvar, aoFechar }) {
  const [f, setF] = useState(inicial);
  const trocar = (campo) => (e) => setF((v) => ({ ...v, [campo]: e.target.value }));
  return (
    <form
      className="mb-4 space-y-4 rounded-xl bg-slate-50 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        aoSalvar(f);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="label" htmlFor="as-nome">Serviço</label>
          <input id="as-nome" className="input" value={f.nome} onChange={trocar("nome")} placeholder="ex: Supabase" required />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="as-oque">Para que serve</label>
          <input id="as-oque" className="input" value={f.oQue} onChange={trocar("oQue")} placeholder="ex: banco e Edge Functions dos 8 sistemas" />
        </div>
        <div>
          <label className="label" htmlFor="as-dia">Dia do vencimento</label>
          <input
            id="as-dia"
            type="number"
            min="1"
            max="31"
            className="input"
            value={f.diaVencimento}
            onChange={trocar("diaVencimento")}
            placeholder="1 a 31"
          />
          <p className="mt-1 text-xs text-slate-500">O dia do mês em que a cobrança cai.</p>
        </div>
        <div>
          <label className="label" htmlFor="as-valor">Valor por mês</label>
          <div className="flex gap-2">
            <select className="input w-auto" value={f.moeda} onChange={trocar("moeda")} aria-label="Moeda">
              {Object.entries(MOEDAS).map(([id, m]) => (
                <option key={id} value={id}>{m.simbolo}</option>
              ))}
            </select>
            <input
              id="as-valor"
              inputMode="decimal"
              className="input"
              value={f.valor}
              onChange={trocar("valor")}
              placeholder="ex: 25"
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="as-url">Link da cobrança</label>
          <input id="as-url" className="input" value={f.url} onChange={trocar("url")} placeholder="onde se vê a fatura" />
        </div>
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand-200"
          checked={f.ativa !== false}
          onChange={(e) => setF((v) => ({ ...v, ativa: e.target.checked }))}
        />
        Assinatura ativa (desmarque quando cancelar — o histórico continua aqui)
      </label>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={salvando || !f.nome.trim()}>
          {salvando ? "Salvando..." : f.id ? "Salvar" : "Cadastrar"}
        </button>
        <button type="button" className="btn-ghost" onClick={aoFechar}>Cancelar</button>
      </div>
    </form>
  );
}

export default function BlocoAssinaturas({ podeEditar }) {
  const [mapa, setMapa] = useState(null);
  const [erro, setErro] = useState(null);
  const [mes, setMes] = useState(() => mesDe(ymdLocal(new Date())));
  const [recorte, setRecorte] = useState("todas");
  const [form, setForm] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState(null);

  const carregar = useCallback(async () => {
    try {
      setMapa(await lerAssinaturas());
      setErro(null);
    } catch (e) {
      setErro(e.message);
    }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const vm = useMemo(() => calcAssinaturas(mapa || {}, { mes }), [mapa, mes]);

  const naTela = useMemo(() => {
    const l = vm.lista;
    if (recorte === "aPagar") return l.filter((a) => a.ativa && !a.pagoEm);
    if (recorte === "vencidas") return l.filter((a) => a.ativa && !a.pagoEm && a.temDia && a.dias < 0);
    if (recorte === "pagas") return l.filter((a) => a.pagoEm);
    return l;
  }, [vm, recorte]);

  if (erro) return <ErroModulo mensagem={erro} aoTentar={carregar} />;
  if (mapa === null) return <CarregandoModulo />;

  const k = vm.kpis;
  const mesAtual = mesDe(ymdLocal(new Date()));

  async function gravar(id, dados) {
    setSalvando(true);
    setAviso(null);
    try {
      const novo = await salvarAssinatura(id, dados);
      setMapa(novo);
      return true;
    } catch (e) {
      setAviso({ tom: "erro", texto: e.message });
      return false;
    } finally {
      setSalvando(false);
    }
  }

  async function salvar(f) {
    const id = f.id || `as-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const ok = await gravar(id, {
      nome: f.nome.trim(),
      oQue: (f.oQue || "").trim(),
      diaVencimento: Number(f.diaVencimento) || "",
      valor: Number(String(f.valor).replace(",", ".")) || 0,
      moeda: f.moeda,
      url: (f.url || "").trim(),
      ativa: f.ativa !== false,
      // `pagos` vai junto no merge: o servidor funde CAMPO a campo no registro,
      // então um patch sem ele apagaria o histórico de pagamentos.
      pagos: (mapa[id] && mapa[id].pagos) || {},
    });
    if (ok) {
      setForm(null);
      setAviso({ tom: "ok", texto: `${f.nome} salvo.` });
    }
  }

  // Marcar/desmarcar o pagamento DAQUELE mês. Manda o objeto `pagos` inteiro
  // porque o merge do servidor troca o campo por completo.
  function alternarPago(a) {
    const pagos = { ...a.pagos };
    if (pagos[mes]) delete pagos[mes];
    else pagos[mes] = ymdLocal(new Date());
    gravar(a.id, { pagos });
  }

  async function apagar(a) {
    if (!window.confirm(`Tirar ${a.nome} da lista? O histórico de pagamentos vai junto.`)) return;
    setSalvando(true);
    try {
      await removerAssinatura(a.id);
      setMapa((m) => {
        const novo = { ...m };
        delete novo[a.id];
        return novo;
      });
    } catch (e) {
      setAviso({ tom: "erro", texto: e.message });
    } finally {
      setSalvando(false);
    }
  }

  const totalTexto = (campo) =>
    k.porMoeda.length === 0
      ? dinheiro(0, "BRL")
      : k.porMoeda.map((m) => dinheiro(m[campo], m.moeda)).join(" + ");

  return (
    <div className="space-y-4">
      <SectionTitle
        titulo="O que os sistemas custam"
        sub="Supabase, GitHub, Claude e as outras contas mensais: quando vence e se já foi pago."
        acao={
          podeEditar && (
            <button className="btn-primary sem-impressao" onClick={() => setForm({ ...VAZIA })}>
              <Plus size={16} strokeWidth={2.4} /> Nova conta
            </button>
          )
        }
      />

      {/* O mês é o eixo: a pergunta é "paguei o de agosto?", não "paguei?". */}
      <div className="sem-impressao flex flex-wrap items-center gap-2">
        <button className="btn-outline !px-2.5" onClick={() => setMes((m) => andarMes(m, -1))} title="Mês anterior">
          <ChevronLeft size={16} strokeWidth={2.4} />
        </button>
        {/* `capitalize` do Tailwind põe maiúscula em TODA palavra: saía
            "Agosto De 2026". Só a primeira letra. */}
        <span className="font-display text-sm font-semibold text-slate-900 first-letter:uppercase">
          {nomeDoMes(mes)}
        </span>
        <button className="btn-outline !px-2.5" onClick={() => setMes((m) => andarMes(m, 1))} title="Próximo mês">
          <ChevronRight size={16} strokeWidth={2.4} />
        </button>
        {mes !== mesAtual && (
          <button className="btn-ghost" onClick={() => setMes(mesAtual)}>
            <Undo2 size={14} strokeWidth={2.4} /> Voltar para o mês atual
          </button>
        )}
      </div>

      {aviso && (
        <p className={`rounded-lg px-3 py-2 text-sm ${aviso.tom === "erro" ? "bg-bad-50 text-bad-700" : "bg-ok-50 text-ok-700"}`}>
          {aviso.texto}
        </p>
      )}

      {vm.lista.length > 0 && (
        <FaixaNumeros
          ativo={recorte}
          aoEscolher={setRecorte}
          celulas={[
            {
              id: "todas",
              rotulo: "Custo do mês",
              valor: totalTexto("mensal"),
              sub: `${numero(k.qtd)} ${k.qtd === 1 ? "assinatura ativa" : "assinaturas ativas"}${k.semValor ? ` · ${k.semValor} sem valor cadastrado` : ""}`,
              curto: `${numero(k.qtd)} ativas`,
            },
            {
              id: "aPagar",
              rotulo: "A pagar",
              valor: totalTexto("aPagar"),
              sub: `${numero(k.aPagarQtd)} ${k.aPagarQtd === 1 ? "conta" : "contas"} sem marcação de pagamento`,
              curto: `${numero(k.aPagarQtd)} contas`,
              cor: k.aPagarQtd ? "text-warn-700" : undefined,
            },
            {
              id: "vencidas",
              rotulo: "Vencidas",
              valor: numero(k.vencidasQtd),
              sub: k.vencidasQtd ? "passaram do dia e não estão marcadas" : "nenhuma passou do dia",
              curto: k.vencidasQtd ? "passou do dia" : "nenhuma",
              cor: k.vencidasQtd ? "text-bad-700" : undefined,
            },
            {
              id: "pagas",
              rotulo: "Pagas",
              valor: `${numero(k.pagasQtd)} de ${numero(k.qtd)}`,
              sub: totalTexto("pago"),
              curto: totalTexto("pago"),
              cor: k.qtd > 0 && k.pagasQtd === k.qtd ? "text-ok-700" : undefined,
            },
          ]}
        />
      )}

      {form && podeEditar && (
        <FormAssinatura
          key={form.id || "nova"}
          inicial={form}
          salvando={salvando}
          aoSalvar={salvar}
          aoFechar={() => setForm(null)}
        />
      )}

      {vm.lista.length === 0 ? (
        <Empty>
          Nenhuma conta cadastrada.
          {podeEditar && (
            <span className="mt-3 block">
              <span className="mb-2 block text-sm text-slate-500">Começar pelas que sustentam os sistemas:</span>
              <span className="flex flex-wrap justify-center gap-2">
                {SUGESTOES.map((sg) => (
                  <button
                    key={sg.nome}
                    className="btn-outline"
                    disabled={salvando}
                    onClick={() => setForm({ ...VAZIA, ...sg })}
                  >
                    <Plus size={14} strokeWidth={2.4} /> {sg.nome}
                  </button>
                ))}
              </span>
              <span className="mt-2 block text-xs text-slate-400">
                O dia e o valor você preenche — o painel não inventa número de cobrança.
              </span>
            </span>
          )}
        </Empty>
      ) : (
        <div className="-mx-5 sm:-mx-6">
          {naTela.map((a) => (
            <LinhaLista key={a.id} tom={a.estado.tom}>
              <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_180px_150px_150px] xl:items-center xl:gap-3">
                <div className="min-w-0">
                  <p className="truncate font-display text-[15px] font-semibold leading-tight text-slate-900">
                    {a.nome}
                    {a.url && (
                      <a
                        className="sem-impressao ml-1.5 inline-flex text-slate-400 hover:text-brand"
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Abrir a página de cobrança"
                      >
                        <ExternalLink size={13} strokeWidth={2.4} />
                      </a>
                    )}
                  </p>
                  <p className="truncate text-sm text-slate-500">{a.oQue || "sem descrição"}</p>
                </div>

                <div className="mt-2 xl:mt-0">
                  <Selo tom={a.estado.tom}>{a.estado.rotulo}</Selo>
                </div>

                <p className="mt-1 text-right text-sm xl:mt-0">
                  {a.semValor ? (
                    <span className="text-slate-400">valor —</span>
                  ) : (
                    <span className="tnum font-semibold text-slate-900">{dinheiro(a.valor, a.moeda)}</span>
                  )}
                  <span className="block text-xs text-slate-400">por mês</span>
                </p>

                <div className="sem-impressao mt-2.5 grid grid-cols-2 gap-2 xl:mt-0 xl:flex xl:justify-end">
                  <button
                    className={`btn-outline min-h-[44px] justify-center xl:min-h-[40px] ${
                      a.pagoEm ? "!border-ok-200 !text-ok-700" : ""
                    }`}
                    disabled={salvando}
                    onClick={() => alternarPago(a)}
                    title={a.pagoEm ? `Pago em ${dataLonga(a.pagoEm)} — desmarcar` : `Marcar como pago em ${nomeDoMes(mes)}`}
                  >
                    {a.pagoEm ? <Undo2 size={15} strokeWidth={2.4} /> : <Check size={15} strokeWidth={2.4} />}
                    <span className="xl:hidden">{a.pagoEm ? "Desmarcar" : "Paguei"}</span>
                  </button>
                  {podeEditar && (
                    <span className="flex gap-2">
                      <button
                        className="btn-outline min-h-[44px] flex-1 justify-center xl:min-h-[40px] xl:!px-2.5"
                        onClick={() => setForm({ ...a })}
                      >
                        <span className="xl:hidden">Editar</span>
                        <span className="hidden xl:inline">Editar</span>
                      </button>
                      <button
                        className="btn-ghost min-h-[44px] justify-center text-slate-400 hover:text-bad-700 xl:min-h-[40px] xl:!px-2"
                        onClick={() => apagar(a)}
                        title={`Tirar ${a.nome} da lista`}
                      >
                        <Trash2 size={15} strokeWidth={2.2} />
                      </button>
                    </span>
                  )}
                </div>
              </div>

              <span className="apenas-impressao text-xs">
                {[a.estado.rotulo, !a.semValor && dinheiro(a.valor, a.moeda)].filter(Boolean).join(" · ")}
              </span>
            </LinhaLista>
          ))}
        </div>
      )}

      {vm.lista.length > 0 && (k.semValor > 0 || k.semDia > 0) && (
        <p className="text-xs text-slate-500">
          {[
            k.semDia > 0 && `${numero(k.semDia)} sem o dia do vencimento`,
            k.semValor > 0 && `${numero(k.semValor)} sem valor — ficam fora do custo do mês`,
          ]
            .filter(Boolean)
            .join(" · ")}
          .
        </p>
      )}
    </div>
  );
}
