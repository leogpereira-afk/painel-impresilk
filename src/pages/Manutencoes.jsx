// Manutencoes: o que a empresa gasta para as coisas continuarem funcionando --
// os carros, as maquinas e o predio (cameras, ar condicionado, eletrica,
// hidraulica, portoes).
//
// A tela abre pelo DINHEIRO e pelo ATRASO, nessa ordem: e o que ninguem
// consegue responder hoje sem procurar nota fiscal na gaveta. O historico por
// item existe para a conta que decide -- o carro que vai ao mecanico todo mes
// custa mais que a parcela de um novo, e isso so aparece somando.
//
// Veiculo e maquina NAO sao cadastrados aqui: ja moram em "Documentos e
// ativos". Duplicar cadastro criaria duas verdades sobre o mesmo carro. O que
// nasce nesta tela e o item PREDIAL, que nao tem vencimento de documento.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Wrench,
  Plus,
  Trash2,
  Pencil,
  AlertTriangle,
  Search,
  X,
  ChevronDown,
  Car,
  Cog,
  Building2,
  ShoppingCart,
  CalendarClock,
  Coins,
} from "lucide-react";
import { listarAtivos, salvarAtivo, removerAtivo } from "../services/ativos.js";
import { lerManutencoes, salvarManutencao, removerManutencao } from "../services/manutencoes.js";
import {
  calcManutencoes,
  FAMILIAS,
  CATEGORIAS_PREDIAL,
  TIPOS_SERVICO,
} from "../lib/calc/manutencoes.js";
import { moeda, moedaCheia, numero, dataLonga, ymdLocal, paraNumero, paraCampo } from "../lib/format.js";
import {
  Card,
  PageTitle,
  SectionTitle,
  StatCard,
  Empty,
  CarregandoModulo,
  ErroModulo,
  Segmented,
} from "../components/ui.jsx";

const ICONE_FAMILIA = { veiculo: Car, maquina: Cog, predial: Building2 };

const TOM_SIT = {
  vencida: { chip: "chip-bad", texto: "text-bad-700" },
  perto: { chip: "chip-warn", texto: "text-warn-700" },
  ok: { chip: "chip-ok", texto: "text-ok-700" },
  sem: { chip: "chip", texto: "text-slate-400" },
};

const LANCAMENTO_VAZIO = {
  id: "",
  ativoId: "",
  data: "",
  valor: "",
  tipo: "preventiva",
  descricao: "",
  fornecedor: "",
  pedido: "",
  medidor: "",
  proxima: "",
};

const ITEM_VAZIO = {
  id: "",
  tipo: "predial",
  nome: "",
  categoria: "",
  identificacao: "",
  responsavel: "",
  observacao: "",
};

// ---------------------------------------------------------------- formularios
//
// Fora do componente da pagina de proposito: componente declarado dentro de
// outro vira um TIPO NOVO a cada render, o React remonta a subarvore e o campo
// perde o foco a cada letra digitada. Ja custou caro na tela de Compromissos.

function FormLancamento({ inicial, itens, salvando, aoSalvar, aoFechar }) {
  const [f, setF] = useState(inicial);
  const trocar = (campo) => (e) => setF((v) => ({ ...v, [campo]: e.target.value }));
  const item = itens.find((i) => i.id === f.ativoId);
  const unidade = item?.unidadeMedidor || (item?.tipo === "veiculo" ? "km" : "horas");

  return (
    <Card>
      <SectionTitle
        titulo={f.id ? "Editar manutencao" : "Nova manutencao"}
        sub="O valor e a data sao o que faz a conta do ano fechar. O resto ajuda a lembrar depois."
        acao={
          <button className="btn-ghost" onClick={aoFechar}>
            <X size={15} /> Fechar
          </button>
        }
      />
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          aoSalvar(f);
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="m-item">No que foi feito</label>
            <select id="m-item" className="input" value={f.ativoId} onChange={trocar("ativoId")} required>
              <option value="">escolha o carro, a maquina ou o item do predio</option>
              {Object.entries(FAMILIAS).map(([fam, meta]) => {
                const doGrupo = itens.filter((i) => i.tipo === fam);
                if (!doGrupo.length) return null;
                return (
                  <optgroup key={fam} label={meta.rotulo}>
                    {doGrupo.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.nome}
                        {i.identificacao ? ` (${i.identificacao})` : ""}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="m-data">Data do servico</label>
            <input id="m-data" type="date" className="input" value={f.data} onChange={trocar("data")} required />
          </div>

          <div>
            {/* Campo de TEXTO, nao type=number: quem digita 1.250,00 num input
                numerico entrega lixo. paraNumero/paraCampo fazem ida e volta. */}
            <label className="label" htmlFor="m-valor">Valor pago (R$)</label>
            <input
              id="m-valor"
              inputMode="decimal"
              className="input"
              placeholder="ex: 1.250,00"
              value={f.valor}
              onChange={trocar("valor")}
              onBlur={(e) => setF((v) => ({ ...v, valor: paraCampo(paraNumero(e.target.value)) }))}
            />
          </div>

          <div>
            <label className="label" htmlFor="m-tipo">Tipo</label>
            <select id="m-tipo" className="input" value={f.tipo} onChange={trocar("tipo")}>
              {Object.entries(TIPOS_SERVICO).map(([id, t]) => (
                <option key={id} value={id}>
                  {t.rotulo} — {t.ajuda}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="label" htmlFor="m-descricao">O que foi feito</label>
            <input
              id="m-descricao"
              className="input"
              placeholder="ex: troca de oleo e filtros / limpeza das 4 evaporadoras"
              value={f.descricao}
              onChange={trocar("descricao")}
            />
          </div>

          <div>
            <label className="label" htmlFor="m-fornecedor">Quem fez</label>
            <input
              id="m-fornecedor"
              className="input"
              placeholder="oficina, tecnico, empresa"
              value={f.fornecedor}
              onChange={trocar("fornecedor")}
            />
          </div>

          <div>
            {/* A ponte com o Compras: o numero do pedido ou da NF. Nao e
                integracao automatica -- e a referencia que permite achar a
                compra depois, sem inventar sincronizacao que ninguem pediu. */}
            <label className="label" htmlFor="m-pedido">Pedido de compra / NF</label>
            <input
              id="m-pedido"
              className="input"
              placeholder="numero do pedido ou da nota"
              value={f.pedido}
              onChange={trocar("pedido")}
            />
          </div>

          <div>
            <label className="label" htmlFor="m-medidor">
              {unidade === "km" ? "Km na data" : "Horas na data"} (opcional)
            </label>
            <input
              id="m-medidor"
              inputMode="decimal"
              className="input"
              placeholder={unidade === "km" ? "ex: 92.400" : "ex: 1.340"}
              value={f.medidor}
              onChange={trocar("medidor")}
              onBlur={(e) => setF((v) => ({ ...v, medidor: paraCampo(paraNumero(e.target.value)) }))}
            />
          </div>

          <div>
            <label className="label" htmlFor="m-proxima">Proxima manutencao (opcional)</label>
            <input id="m-proxima" type="date" className="input" value={f.proxima} onChange={trocar("proxima")} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-primary" disabled={salvando}>
            {salvando ? "Salvando..." : f.id ? "Salvar alteracoes" : "Lancar manutencao"}
          </button>
          <button type="button" className="btn-ghost" onClick={aoFechar}>
            Cancelar
          </button>
        </div>
      </form>
    </Card>
  );
}

function FormItem({ inicial, salvando, aoSalvar, aoFechar }) {
  const [f, setF] = useState(inicial);
  const trocar = (campo) => (e) => setF((v) => ({ ...v, [campo]: e.target.value }));
  return (
    <Card>
      <SectionTitle
        titulo={f.id ? "Editar item do predio" : "Novo item do predio"}
        sub="Camera, ar condicionado, quadro eletrico, bomba, portao — o que precisa de manutencao."
        acao={
          <button className="btn-ghost" onClick={aoFechar}>
            <X size={15} /> Fechar
          </button>
        }
      />
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          aoSalvar(f);
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="label" htmlFor="i-nome">Nome</label>
            <input
              id="i-nome"
              className="input"
              placeholder="ex: Ar condicionado da producao"
              value={f.nome}
              onChange={trocar("nome")}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="i-categoria">Categoria</label>
            <input
              id="i-categoria"
              className="input"
              list="cats-predial"
              placeholder="escolha ou digite"
              value={f.categoria}
              onChange={trocar("categoria")}
            />
            <datalist id="cats-predial">
              {CATEGORIAS_PREDIAL.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="label" htmlFor="i-identificacao">Onde fica / identificacao</label>
            <input
              id="i-identificacao"
              className="input"
              placeholder="ex: sala da producao, 3 andar"
              value={f.identificacao}
              onChange={trocar("identificacao")}
            />
          </div>
          <div>
            <label className="label" htmlFor="i-responsavel">Responsavel</label>
            <input
              id="i-responsavel"
              className="input"
              placeholder="quem cuida disso"
              value={f.responsavel}
              onChange={trocar("responsavel")}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="i-observacao">Observacao</label>
            <input
              id="i-observacao"
              className="input"
              placeholder="marca, modelo, telefone da assistencia..."
              value={f.observacao}
              onChange={trocar("observacao")}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-primary" disabled={salvando}>
            {salvando ? "Salvando..." : f.id ? "Salvar" : "Cadastrar item"}
          </button>
          <button type="button" className="btn-ghost" onClick={aoFechar}>
            Cancelar
          </button>
        </div>
      </form>
    </Card>
  );
}

function Historico({ item, aoEditar, aoApagar }) {
  if (!item.historico.length) {
    return (
      <p className="px-3 pb-3 text-sm text-slate-500">
        Nenhuma manutencao lancada ainda para este item.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto px-3 pb-3">
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr>
            <th className="th text-left">Data</th>
            <th className="th text-left">O que foi feito</th>
            <th className="th text-left">Quem fez</th>
            <th className="th text-left">Pedido / NF</th>
            <th className="th text-right">Valor</th>
            <th className="th text-right"></th>
          </tr>
        </thead>
        <tbody>
          {item.historico.map((l) => (
            <tr key={l.id}>
              <td className="td whitespace-nowrap tabular-nums">{l.data ? dataLonga(l.data) : "-"}</td>
              <td className="td">
                <span className="block text-slate-900">{l.descricao || TIPOS_SERVICO[l.tipo]?.rotulo || "-"}</span>
                <span className="block text-xs text-slate-500">
                  {[
                    TIPOS_SERVICO[l.tipo]?.rotulo,
                    l.medidor ? `${numero(l.medidor)} ${item.unidadeMedidor || (item.tipo === "veiculo" ? "km" : "h")}` : null,
                    l.proxima ? `proxima em ${dataLonga(l.proxima)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </td>
              <td className="td text-slate-600">{l.fornecedor || "-"}</td>
              <td className="td text-slate-600">{l.pedido || "-"}</td>
              {/* moedaCheia aqui: este numero e conferido contra a nota fiscal,
                  e R$ 1.251 no lugar de R$ 1.250,50 faz a conferencia falhar. */}
              <td className="td text-right tabular-nums font-medium text-slate-900">{moedaCheia(l.valor)}</td>
              <td className="td text-right">
                <span className="inline-flex gap-0.5">
                  <button
                    type="button"
                    onClick={() => aoEditar(l)}
                    className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    title="Editar"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => aoApagar(l)}
                    className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-bad-50 hover:text-bad-700"
                    title="Apagar"
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LinhaItem({ item, aberto, aoAbrir, aoLancar, aoEditarItem, aoApagarItem, aoEditar, aoApagar }) {
  const Icone = ICONE_FAMILIA[item.familia] || Wrench;
  const tom = TOM_SIT[item.sit.nivel];
  return (
    <div className="rounded-xl border" style={{ borderColor: "var(--hairline)" }}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
        <button
          type="button"
          onClick={aoAbrir}
          aria-expanded={aberto}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"
          title={aberto ? "Fechar historico" : "Ver historico"}
        >
          <ChevronDown size={16} className={`transition-transform ${aberto ? "" : "-rotate-90"}`} />
        </button>
        <Icone size={17} strokeWidth={2.2} className="shrink-0 text-slate-500" />

        <span className="min-w-0 flex-1 basis-48">
          <span className="block truncate font-display text-sm font-medium text-slate-900">{item.nome}</span>
          <span className="block truncate text-xs text-slate-500">
            {[item.categoria, item.identificacao, item.responsavel].filter(Boolean).join(" · ") || "sem categoria"}
          </span>
        </span>

        <span className="shrink-0 text-right">
          <span className="block font-display text-sm font-semibold tabular-nums text-slate-900">
            {moeda(item.total)}
          </span>
          <span className="block text-xs text-slate-500">
            {item.quantos === 0
              ? "nada lancado"
              : `${item.quantos} ${item.quantos === 1 ? "servico" : "servicos"} · ${moeda(item.noAno)} no ano`}
          </span>
        </span>

        <span className={`${tom.chip} shrink-0 whitespace-nowrap`}>{item.sit.rotulo}</span>

        <span className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={aoLancar}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 font-display text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-brand"
            title="Lancar uma manutencao neste item"
          >
            <Plus size={14} strokeWidth={2.6} />
            Lancar
          </button>
          {item.familia === "predial" && (
            <>
              <button
                type="button"
                onClick={aoEditarItem}
                className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                title="Editar item"
              >
                <Pencil size={14} />
              </button>
              <button
                type="button"
                onClick={aoApagarItem}
                className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-bad-50 hover:text-bad-700"
                title="Retirar item"
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
        </span>
      </div>
      {aberto && <Historico item={item} aoEditar={aoEditar} aoApagar={aoApagar} />}
    </div>
  );
}

// ---------------------------------------------------------------- pagina

export default function Manutencoes() {
  const [itens, setItens] = useState(null);
  const [mapa, setMapa] = useState(null);
  const [erro, setErro] = useState(null);
  const [msg, setMsg] = useState(null);
  const [familia, setFamilia] = useState("tudo");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(null);
  const [formLanc, setFormLanc] = useState(null);
  const [formItem, setFormItem] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const topoForm = useRef(null);

  // "Hoje" em estado e refeito ao voltar para a aba: numa tela de prazo, o dia
  // congelado faz "atrasada" continuar dizendo "em 1 dia" no dia seguinte.
  const [hojeISO, setHojeISO] = useState(() => ymdLocal(new Date()));

  const carregar = useCallback(async () => {
    try {
      const [lista, m] = await Promise.all([listarAtivos(), lerManutencoes()]);
      setItens(lista.filter((x) => FAMILIAS[x.tipo]));
      setMapa(m);
      setErro(null);
    } catch (e) {
      setErro(e.message);
      setItens([]);
      setMapa({});
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === "visible") setHojeISO(ymdLocal(new Date()));
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, []);

  const vm = useMemo(
    () => calcManutencoes(itens || [], mapa || {}, hojeISO),
    [itens, mapa, hojeISO]
  );

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return vm.lista
      .filter((i) => familia === "tudo" || i.familia === familia)
      .filter((i) =>
        !q ? true : `${i.nome} ${i.categoria} ${i.identificacao} ${i.responsavel}`.toLowerCase().includes(q)
      )
      // Atrasado primeiro; depois o que mais consumiu no ano.
      .sort((a, b) => {
        const peso = { vencida: 0, perto: 1, ok: 2, sem: 3 };
        const d = peso[a.sit.nivel] - peso[b.sit.nivel];
        return d !== 0 ? d : b.noAno - a.noAno;
      });
  }, [vm, familia, busca]);

  const rolarAoForm = () =>
    setTimeout(() => topoForm.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);

  const abrirLancamento = (ativoId = "", lancamento = null) => {
    setFormItem(null);
    setFormLanc(
      lancamento
        ? {
            ...LANCAMENTO_VAZIO,
            ...lancamento,
            valor: paraCampo(lancamento.valor),
            medidor: paraCampo(lancamento.medidor),
          }
        : { ...LANCAMENTO_VAZIO, ativoId, data: hojeISO }
    );
    rolarAoForm();
  };

  const abrirItem = (item = null) => {
    setFormLanc(null);
    setFormItem(item ? { ...ITEM_VAZIO, ...item } : { ...ITEM_VAZIO });
    rolarAoForm();
  };

  async function gravarLancamento(f) {
    if (!f.ativoId) return setMsg({ tom: "erro", texto: "Escolha em que item o servico foi feito." });
    if (!f.data) return setMsg({ tom: "erro", texto: "Informe a data do servico." });
    setSalvando(true);
    setMsg(null);
    try {
      const id = f.id || `mnt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const item = (itens || []).find((i) => i.id === f.ativoId);
      const dados = {
        ativoId: f.ativoId,
        // Nome desnormalizado: se o item for retirado, o gasto continua
        // identificavel no historico em vez de virar "(sem item)".
        ativoNome: item?.nome || "",
        data: f.data,
        valor: paraNumero(f.valor),
        tipo: f.tipo,
        descricao: f.descricao.trim(),
        fornecedor: f.fornecedor.trim(),
        pedido: f.pedido.trim(),
        medidor: paraNumero(f.medidor),
        proxima: f.proxima,
      };
      setMapa(await salvarManutencao(id, dados));
      setFormLanc(null);
      setAberto(f.ativoId);
      setMsg({ tom: "ok", texto: "Manutencao lancada." });
    } catch (e) {
      setMsg({ tom: "erro", texto: e.message });
    } finally {
      setSalvando(false);
    }
  }

  async function apagarLancamento(l) {
    if (!window.confirm(`Apagar o lancamento de ${moedaCheia(l.valor)} de ${l.data ? dataLonga(l.data) : "sem data"}?`)) return;
    setMsg(null);
    try {
      await removerManutencao(l.id);
      setMapa((m) => {
        const novo = { ...(m || {}) };
        delete novo[l.id];
        return novo;
      });
      setMsg({ tom: "aviso", texto: "Lancamento apagado." });
    } catch (e) {
      setMsg({ tom: "erro", texto: e.message });
    }
  }

  async function gravarItem(f) {
    setSalvando(true);
    setMsg(null);
    try {
      const salvo = await salvarAtivo({ ...f, tipo: "predial" });
      setItens((l) => {
        const outros = (l || []).filter((x) => x.id !== salvo.id);
        return [...outros, salvo];
      });
      setFormItem(null);
      setMsg({ tom: "ok", texto: `${salvo.nome} cadastrado.` });
    } catch (e) {
      setMsg({ tom: "erro", texto: e.message });
    } finally {
      setSalvando(false);
    }
  }

  async function apagarItem(item) {
    const quantos = item.quantos;
    const aviso = quantos
      ? `Retirar "${item.nome}"?\n\nEle tem ${quantos} ${quantos === 1 ? "manutencao lancada" : "manutencoes lancadas"} (${moeda(item.total)}). O historico continua no total da empresa, mas deixa de ficar ligado a este item.`
      : `Retirar "${item.nome}"?`;
    if (!window.confirm(aviso)) return;
    setMsg(null);
    try {
      await removerAtivo(item.id);
      setItens((l) => (l || []).filter((x) => x.id !== item.id));
      if (formItem?.id === item.id) setFormItem(null);
      setMsg({ tom: "aviso", texto: `${item.nome} retirado.` });
    } catch (e) {
      setMsg({ tom: "erro", texto: e.message });
    }
  }

  if (erro && !itens?.length) return <ErroModulo mensagem={erro} aoTentar={carregar} />;
  if (itens === null || mapa === null) return <CarregandoModulo />;

  const k = vm.kpis;

  return (
    <div className="space-y-8">
      <PageTitle
        titulo="Manutencoes"
        descricao="O que os carros, as maquinas e o predio custam para continuar funcionando -- e o que ja esta atrasado."
        acao={
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => abrirLancamento()}>
              <Plus size={16} strokeWidth={2.4} />
              Nova manutencao
            </button>
            <button className="btn-ghost" onClick={() => abrirItem()}>
              <Building2 size={16} strokeWidth={2.2} />
              Item do predio
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          rotulo="Gasto no mes"
          valor={moeda(k.gastoMes)}
          sub="somando tudo o que foi lancado"
          tom="neutral"
          icone={Coins}
        />
        <StatCard
          rotulo="Gasto no ano"
          valor={moeda(k.gastoAno)}
          sub={`${numero(k.lancamentosAno)} ${k.lancamentosAno === 1 ? "servico" : "servicos"}`}
          tom="neutral"
          icone={Wrench}
        />
        <StatCard
          rotulo="Atrasadas"
          valor={numero(k.atrasadas)}
          sub={k.atrasadas ? "passaram da data prevista" : "nada atrasado"}
          tom={k.atrasadas ? "bad" : "ok"}
          icone={AlertTriangle}
        />
        <StatCard
          rotulo="Itens"
          valor={numero(k.itens)}
          sub={k.semPrevisao ? `${k.semPrevisao} sem proxima data` : "todos com previsao"}
          tom="neutral"
          icone={CalendarClock}
        />
      </div>

      {msg && (
        <p
          className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
            msg.tom === "ok"
              ? "bg-ok-50 text-ok-700"
              : msg.tom === "aviso"
                ? "bg-warn-50 text-warn-700"
                : "bg-bad-50 text-bad-700"
          }`}
        >
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          {msg.texto}
        </p>
      )}

      <div ref={topoForm}>
        {formLanc && (
          <FormLancamento
            key={formLanc.id || "novo"}
            inicial={formLanc}
            itens={itens}
            salvando={salvando}
            aoSalvar={gravarLancamento}
            aoFechar={() => setFormLanc(null)}
          />
        )}
        {formItem && (
          <FormItem
            key={formItem.id || "novo-item"}
            inicial={formItem}
            salvando={salvando}
            aoSalvar={gravarItem}
            aoFechar={() => setFormItem(null)}
          />
        )}
      </div>

      {vm.ranking.length > 0 && (
        <Card>
          <SectionTitle
            titulo="Quem mais consumiu no ano"
            sub="A conta que decide trocar um veiculo ou renegociar um contrato de assistencia."
          />
          <div className="space-y-2">
            {vm.ranking.map((i) => {
              const maior = vm.ranking[0].noAno || 1;
              const Icone = ICONE_FAMILIA[i.familia] || Wrench;
              return (
                <div key={i.id} className="flex items-center gap-3">
                  <Icone size={15} className="shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{i.nome}</span>
                  <div className="hidden h-2 w-40 shrink-0 overflow-hidden rounded-full bg-slate-100 sm:block">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${(i.noAno / maior) * 100}%` }} />
                  </div>
                  <span className="w-28 shrink-0 text-right text-sm font-medium tabular-nums text-slate-900">
                    {moeda(i.noAno)}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card>
        <SectionTitle
          titulo="Itens e historico"
          sub="Atrasados primeiro. Clique na seta para ver todos os servicos e quanto custaram."
          acao={
            <Segmented
              opcoes={[
                { valor: "tudo", rotulo: "Tudo" },
                ...Object.entries(FAMILIAS).map(([id, f]) => ({ valor: id, rotulo: f.rotulo })),
              ]}
              valor={familia}
              onChange={setFamilia}
            />
          }
        />

        <div className="sem-impressao mb-4 relative max-w-sm">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, categoria ou responsavel"
          />
        </div>

        {visiveis.length === 0 ? (
          <Empty>
            {busca.trim()
              ? `Nada com "${busca}".`
              : familia === "predial"
                ? "Nenhum item do predio cadastrado. Use 'Item do predio' para incluir cameras, ar condicionado, quadro eletrico."
                : "Nenhum item aqui. Veiculos e maquinas vem de 'Documentos e ativos'."}
          </Empty>
        ) : (
          <div className="space-y-2">
            {visiveis.map((i) => (
              <LinhaItem
                key={i.id}
                item={i}
                aberto={aberto === i.id}
                aoAbrir={() => setAberto(aberto === i.id ? null : i.id)}
                aoLancar={() => abrirLancamento(i.id)}
                aoEditarItem={() => abrirItem(i)}
                aoApagarItem={() => apagarItem(i)}
                aoEditar={(l) => abrirLancamento(i.id, l)}
                aoApagar={apagarLancamento}
              />
            ))}
          </div>
        )}

        {vm.orfaos.length > 0 && (
          <p className="mt-4 rounded-lg bg-warn-50 px-3 py-2 text-sm text-warn-700">
            {vm.orfaos.length} {vm.orfaos.length === 1 ? "lancamento" : "lancamentos"} de itens que foram
            retirados ({moeda(vm.orfaos.reduce((s, l) => s + l.valor, 0))}). O dinheiro continua contado
            nos totais.
          </p>
        )}
      </Card>

      <Card>
        <SectionTitle
          titulo="Comprou peca ou contratou servico?"
          sub="O pedido de compra e a nota ficam no sistema de Compras. Aqui guarde o numero no campo 'Pedido / NF' -- e o que liga uma coisa a outra na hora de conferir."
        />
        <a
          href="https://impresilk.com.br/compras"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 font-display text-sm font-medium text-slate-700 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
          style={{ borderColor: "var(--hairline)" }}
        >
          <ShoppingCart size={16} strokeWidth={2.2} />
          Abrir o Compras
        </a>
      </Card>
    </div>
  );
}
