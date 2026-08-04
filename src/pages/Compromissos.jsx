// Compromissos: a agenda de campo da vendedora -- visita, medicao, entrega,
// instalacao, retorno de orcamento -- e as situacoes a resolver que nao tem
// data marcada.
//
// A tela abre pelo que esta ATRASADO e depois por hoje: e assim que o problema
// chega. Cada vendedora enxerga so os dela (o servidor separa por dono); a
// direcao ve os de todo mundo e pode filtrar por pessoa.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarCheck,
  Plus,
  Check,
  Trash2,
  Pencil,
  Undo2,
  AlertTriangle,
  ChevronDown,
  Users,
  Ruler,
  Truck,
  Wrench,
  Phone,
  FileText,
  HandCoins,
  CircleDot,
  Forward,
} from "lucide-react";
import {
  lerCompromissos,
  salvarCompromisso,
  removerCompromisso,
  encaminharCompromisso,
  lerPessoas,
} from "../services/compromissos.js";
import { getSessao } from "../lib/sessao.js";
import { dataCurta, diasEntre, ymdLocal } from "../lib/format.js";
import { Card, PageTitle, SectionTitle, StatCard, Empty, CarregandoModulo } from "../components/ui.jsx";

// Cada tipo tem icone proprio: numa lista de 20 linhas, o icone diz o que e
// antes de a pessoa ler o titulo.
const TIPOS = {
  visita: { rotulo: "Visita", icone: Users, cor: "text-brand" },
  medicao: { rotulo: "Medicao", icone: Ruler, cor: "text-brand" },
  retorno: { rotulo: "Retorno de orcamento", icone: Phone, cor: "text-warn-700" },
  entrega: { rotulo: "Entrega", icone: Truck, cor: "text-ok-700" },
  instalacao: { rotulo: "Instalacao", icone: Wrench, cor: "text-ok-700" },
  cobranca: { rotulo: "Cobranca", icone: HandCoins, cor: "text-bad-700" },
  documento: { rotulo: "Documento / arte", icone: FileText, cor: "text-slate-500" },
  outro: { rotulo: "Outro", icone: CircleDot, cor: "text-slate-500" },
};

const VAZIO = {
  id: "",
  titulo: "",
  tipo: "visita",
  cliente: "",
  data: "",
  hora: "",
  obs: "",
  feito: false,
};

// A frase que a pessoa le antes do numero. Prazo em palavras vale mais que data.
function prazo(dias) {
  if (dias === null) return { texto: "sem data", chip: "chip", peso: 5000, grupo: "Sem data marcada" };
  if (dias < 0) {
    const d = -dias;
    return { texto: `atrasado ${d} ${d === 1 ? "dia" : "dias"}`, chip: "chip-bad", peso: -1000 + dias, grupo: "Atrasados" };
  }
  if (dias === 0) return { texto: "HOJE", chip: "chip-bad", peso: 0, grupo: "Hoje" };
  if (dias === 1) return { texto: "amanha", chip: "chip-warn", peso: 1, grupo: "Amanha" };
  if (dias <= 7) return { texto: `em ${dias} dias`, chip: "chip-warn", peso: dias, grupo: "Proximos 7 dias" };
  return { texto: dataCurta(null) ? `em ${dias} dias` : "", chip: "chip", peso: dias, grupo: "Mais para frente" };
}

const ORDEM_GRUPOS = ["Atrasados", "Hoje", "Amanha", "Proximos 7 dias", "Mais para frente", "Sem data marcada"];

export default function Compromissos() {
  const sessao = getSessao();
  const ehDirecao = !!sessao?.master;

  const [mapa, setMapa] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [form, setForm] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [dePessoa, setDePessoa] = useState(null); // filtro da direcao
  const [verFeitos, setVerFeitos] = useState(false);
  const [equipe, setEquipe] = useState([]);
  const [encaminhando, setEncaminhando] = useState(null); // id da linha aberta
  const cartaoForm = useRef(null);
  const hojeISO = ymdLocal(new Date());

  useEffect(() => {
    let vivo = true;
    lerCompromissos()
      .then((m) => vivo && setMapa(m))
      .catch((e) => vivo && setErro(e.message));
    // A equipe e so para o "encaminhar". Se falhar, a tela continua
    // funcionando -- so o encaminhamento fica indisponivel.
    lerPessoas()
      .then((p) => vivo && setEquipe(p))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  const vm = useMemo(() => {
    if (!mapa) return { grupos: [], feitos: [], hoje: 0, atrasados: 0, semData: 0, pessoas: [] };
    const todos = Object.entries(mapa)
      .map(([id, c]) => {
        const dias = c.data ? diasEntre(hojeISO, c.data) : null;
        return { ...c, id, dias, pz: prazo(dias), t: TIPOS[c.tipo] || TIPOS.outro };
      })
      .filter((c) => !dePessoa || c.dono === dePessoa);

    const abertos = todos.filter((c) => !c.feito).sort((a, b) => a.pz.peso - b.pz.peso);
    const feitos = todos
      .filter((c) => c.feito)
      .sort((a, b) => String(b.feitoEm || "").localeCompare(String(a.feitoEm || "")));

    const grupos = [];
    abertos.forEach((c) => {
      let g = grupos.find((x) => x.nome === c.pz.grupo);
      if (!g) {
        g = { nome: c.pz.grupo, itens: [] };
        grupos.push(g);
      }
      g.itens.push(c);
    });
    grupos.sort((a, b) => ORDEM_GRUPOS.indexOf(a.nome) - ORDEM_GRUPOS.indexOf(b.nome));

    const pessoas = [...new Set(Object.values(mapa).map((c) => c.dono).filter(Boolean))].map((d) => ({
      dono: d,
      nome: Object.values(mapa).find((c) => c.dono === d)?.donoNome || d,
    }));

    return {
      grupos,
      feitos,
      hoje: abertos.filter((c) => c.dias === 0).length,
      atrasados: abertos.filter((c) => c.dias !== null && c.dias < 0).length,
      semData: abertos.filter((c) => c.dias === null).length,
      pessoas,
    };
  }, [mapa, hojeISO, dePessoa]);

  const abrirForm = (c) => {
    setAviso(null);
    setForm(c ? { ...VAZIO, ...c } : { ...VAZIO });
    setTimeout(() => cartaoForm.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
  };

  const salvar = useCallback(
    async (e) => {
      e.preventDefault();
      setAviso(null);
      if (!form.titulo.trim()) return setAviso({ tom: "erro", texto: "Escreva o que precisa ser feito." });
      setSalvando(true);
      try {
        const id = form.id || `cp-${Date.now()}`;
        const dados = {
          titulo: form.titulo.trim(),
          tipo: form.tipo,
          cliente: form.cliente.trim(),
          data: form.data,
          hora: form.hora,
          obs: form.obs.trim(),
          feito: !!form.feito,
          feitoEm: form.feitoEm || "",
          criadoEm: form.criadoEm || new Date().toISOString(),
        };
        await salvarCompromisso(id, dados);
        setMapa((m) => ({ ...(m || {}), [id]: { ...(m?.[id] || {}), ...dados } }));
        setForm(null);
        setAviso({ tom: "ok", texto: "Compromisso salvo." });
      } catch (err) {
        setAviso({ tom: "erro", texto: err.message });
      } finally {
        setSalvando(false);
      }
    },
    [form]
  );

  const alternarFeito = async (c) => {
    setAviso(null);
    const feito = !c.feito;
    const patch = { feito, feitoEm: feito ? new Date().toISOString() : "" };
    setMapa((m) => ({ ...(m || {}), [c.id]: { ...m[c.id], ...patch } })); // otimista
    try {
      await salvarCompromisso(c.id, patch);
    } catch (err) {
      setMapa((m) => ({ ...(m || {}), [c.id]: { ...m[c.id], feito: c.feito, feitoEm: c.feitoEm || "" } }));
      setAviso({ tom: "erro", texto: err.message });
    }
  };

  const encaminhar = async (c, paraUsuario) => {
    setEncaminhando(null);
    if (!paraUsuario || paraUsuario === c.dono) return;
    const nome = equipe.find((p) => p.usuario === paraUsuario)?.nome || paraUsuario;
    setAviso(null);
    try {
      const mapaNovo = await encaminharCompromisso(c.id, paraUsuario);
      // A resposta ja vem no escopo de quem pediu: se voce nao e a direcao, o
      // item encaminhado simplesmente sai da sua lista.
      setMapa(mapaNovo);
      setAviso({ tom: "ok", texto: `"${c.titulo}" foi para ${nome}.` });
    } catch (err) {
      setAviso({ tom: "erro", texto: err.message });
    }
  };

  const remover = async (c) => {
    if (!window.confirm(`Apagar "${c.titulo}"?`)) return;
    setAviso(null);
    try {
      await removerCompromisso(c.id);
      setMapa((m) => {
        const novo = { ...(m || {}) };
        delete novo[c.id];
        return novo;
      });
      if (form?.id === c.id) setForm(null);
    } catch (err) {
      setAviso({ tom: "erro", texto: err.message });
    }
  };

  if (erro) {
    return (
      <div className="space-y-6">
        <PageTitle titulo="Compromissos" descricao="O que voce tem para fazer e resolver." />
        <Card className="flex items-start gap-2 text-sm text-bad-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {erro}
        </Card>
      </div>
    );
  }
  if (mapa === null) return <CarregandoModulo />;

  const Linha = ({ c }) => {
    const Icone = c.t.icone;
    return (
      <div
        className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border p-3 transition-colors ${
          c.feito ? "opacity-60" : ""
        }`}
        style={{ borderColor: "var(--hairline)" }}
      >
        <button
          type="button"
          onClick={() => alternarFeito(c)}
          title={c.feito ? "Reabrir" : "Marcar como feito"}
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border transition-colors ${
            c.feito
              ? "border-ok-600 bg-ok-600 text-white"
              : "text-slate-400 hover:border-ok-600 hover:text-ok-700"
          }`}
          style={c.feito ? undefined : { borderColor: "var(--hairline)" }}
        >
          {c.feito ? <Check size={15} strokeWidth={3} /> : <Check size={15} />}
        </button>

        <Icone size={17} strokeWidth={2.2} className={`shrink-0 ${c.t.cor}`} title={c.t.rotulo} />

        <span className="min-w-0 flex-1 basis-48">
          <span
            className={`block truncate font-display text-sm font-medium text-slate-900 ${
              c.feito ? "line-through" : ""
            }`}
          >
            {c.titulo}
          </span>
          <span className="block truncate text-xs text-slate-500">
            {[
              c.t.rotulo,
              c.cliente,
              ehDirecao && !dePessoa ? c.donoNome : null,
              c.encaminhadoPor && c.encaminhadoPor !== c.donoNome
                ? `veio de ${c.encaminhadoPor}`
                : null,
              c.obs,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>

        <span className="shrink-0 text-right">
          {!c.feito && <span className={`${c.pz.chip} whitespace-nowrap`}>{c.pz.texto}</span>}
          <span className="mt-0.5 block text-xs tabular-nums text-slate-500">
            {c.data ? `${dataCurta(c.data)}${c.hora ? ` as ${c.hora}` : ""}` : "sem data"}
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-0.5">
          {encaminhando === c.id ? (
            // Seletor no lugar do botao: escolher ja encaminha. E o gesto mais
            // curto para "isso aqui e da fulana".
            <select
              autoFocus
              className="input h-8 w-40 py-0 text-xs"
              defaultValue=""
              onChange={(e) => encaminhar(c, e.target.value)}
              onBlur={() => setEncaminhando(null)}
            >
              <option value="" disabled>
                Passar para...
              </option>
              {equipe
                .filter((p) => p.usuario !== c.dono)
                .map((p) => (
                  <option key={p.usuario} value={p.usuario}>
                    {p.nome}
                  </option>
                ))}
            </select>
          ) : (
            equipe.length > 1 && (
              <button
                type="button"
                onClick={() => setEncaminhando(c.id)}
                className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-brand"
                title="Encaminhar para outra pessoa"
              >
                <Forward size={14} />
              </button>
            )
          )}
          <button
            type="button"
            onClick={() => abrirForm(c)}
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            title="Editar"
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            onClick={() => remover(c)}
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-bad-50 hover:text-bad-700"
            title="Apagar"
          >
            <Trash2 size={14} />
          </button>
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageTitle
        titulo="Compromissos"
        descricao={
          ehDirecao
            ? "A agenda da equipe: visitas, medicoes, retornos e o que ficou para resolver."
            : "Suas visitas, medicoes, retornos e o que voce tem para resolver. So voce ve esta lista."
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          rotulo="Atrasados"
          valor={String(vm.atrasados)}
          sub={vm.atrasados ? "passaram da data" : "nada atrasado"}
          tom={vm.atrasados ? "bad" : "ok"}
          icone={AlertTriangle}
        />
        <StatCard
          rotulo="Hoje"
          valor={String(vm.hoje)}
          sub={vm.hoje ? "marcados para hoje" : "sem compromisso hoje"}
          tom={vm.hoje ? "warn" : "neutral"}
          icone={CalendarCheck}
        />
        <StatCard
          rotulo="A resolver"
          valor={String(vm.semData)}
          sub="sem data marcada"
          tom="neutral"
          icone={CircleDot}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary" onClick={() => abrirForm(null)}>
          <Plus size={15} strokeWidth={2.4} />
          Novo compromisso
        </button>

        {ehDirecao && vm.pessoas.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => setDePessoa(null)}
              className={`rounded-full px-3 py-1 font-display text-xs font-semibold transition-colors ${
                dePessoa === null ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Equipe toda
            </button>
            {vm.pessoas.map((p) => (
              <button
                key={p.dono}
                type="button"
                onClick={() => setDePessoa(dePessoa === p.dono ? null : p.dono)}
                className={`rounded-full px-3 py-1 font-display text-xs font-semibold transition-colors ${
                  dePessoa === p.dono ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {p.nome}
              </button>
            ))}
          </>
        )}
      </div>

      {aviso && (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            aviso.tom === "ok" ? "bg-ok-50 text-ok-700" : "bg-bad-50 text-bad-700"
          }`}
        >
          {aviso.texto}
        </p>
      )}

      {form && (
        <Card ref={cartaoForm}>
          <SectionTitle
            titulo={form.id ? "Editar compromisso" : "Novo compromisso"}
            sub="So o titulo e obrigatorio. Sem data, ele entra em 'A resolver'."
          />
          <form onSubmit={salvar} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="c-titulo">O que precisa ser feito</label>
                <input
                  id="c-titulo"
                  className="input"
                  placeholder="ex.: Medir a fachada da loja nova"
                  value={form.titulo}
                  onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="c-tipo">Tipo</label>
                <select
                  id="c-tipo"
                  className="input"
                  value={form.tipo}
                  onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}
                >
                  {Object.entries(TIPOS).map(([id, t]) => (
                    <option key={id} value={id}>
                      {t.rotulo}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="c-cliente">Cliente (opcional)</label>
                <input
                  id="c-cliente"
                  className="input"
                  placeholder="ex.: Padaria Sao Jose"
                  value={form.cliente}
                  onChange={(e) => setForm((f) => ({ ...f, cliente: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="c-data">Data</label>
                  <input
                    id="c-data"
                    type="date"
                    className="input"
                    value={form.data}
                    onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="c-hora">Hora</label>
                  <input
                    id="c-hora"
                    type="time"
                    className="input"
                    value={form.hora}
                    onChange={(e) => setForm((f) => ({ ...f, hora: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="c-obs">Observacao</label>
                <input
                  id="c-obs"
                  className="input"
                  placeholder="endereco, telefone, o que levar..."
                  value={form.obs}
                  onChange={(e) => setForm((f) => ({ ...f, obs: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn-primary" disabled={salvando}>
                {salvando ? "Salvando..." : form.id ? "Salvar alteracoes" : "Cadastrar"}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setForm(null)}>
                Cancelar
              </button>
            </div>
          </form>
        </Card>
      )}

      {vm.grupos.length === 0 ? (
        <Card>
          <Empty>
            Nada em aberto{dePessoa ? " para esta pessoa" : ""}. Use &quot;Novo compromisso&quot; para
            anotar uma visita, uma medicao ou algo a resolver.
          </Empty>
        </Card>
      ) : (
        vm.grupos.map((g) => (
          <Card key={g.nome}>
            <SectionTitle
              titulo={g.nome}
              sub={`${g.itens.length} ${g.itens.length === 1 ? "compromisso" : "compromissos"}`}
            />
            <div className="space-y-2">
              {g.itens.map((c) => (
                <Linha key={c.id} c={c} />
              ))}
            </div>
          </Card>
        ))
      )}

      {vm.feitos.length > 0 && (
        <Card className="p-0">
          <button
            type="button"
            onClick={() => setVerFeitos((v) => !v)}
            aria-expanded={verFeitos}
            className="flex w-full items-center gap-2.5 px-5 py-4 text-left"
          >
            <ChevronDown
              size={16}
              className={`shrink-0 text-slate-400 transition-transform ${verFeitos ? "" : "-rotate-90"}`}
            />
            <span className="min-w-0 flex-1 font-display text-base font-semibold text-slate-900">
              Concluidos
            </span>
            <span className="chip-ok">{vm.feitos.length}</span>
          </button>
          {verFeitos && (
            <div className="space-y-2 px-5 pb-5">
              {vm.feitos.map((c) => (
                <Linha key={c.id} c={c} />
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
