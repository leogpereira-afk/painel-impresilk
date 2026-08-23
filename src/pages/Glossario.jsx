// Glossario de comunicacao visual: o que a vendedora precisa saber para
// conversar com o cliente sem prometer o que a producao nao entrega.
//
// A tela e de LEITURA rapida -- busca em cima, termos agrupados por categoria,
// cada um com a explicacao e, quando existe, a armadilha que vira retrabalho.
// Editar e secundario (fica atras de um botao), porque o uso do dia a dia e
// procurar um termo no meio de uma conversa com o cliente.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Plus, Pencil, Trash2, Lightbulb, AlertTriangle, BookOpen } from "lucide-react";
import { CATEGORIAS } from "../data/glossarioCategorias.js";
import { lerTermos, salvarTermo, salvarVarios, removerTermo } from "../services/glossario.js";
import { Card, PageTitle, SectionTitle, Empty, CarregandoModulo } from "../components/ui.jsx";

const VAZIO = { id: "", termo: "", categoria: CATEGORIAS[0], texto: "", dica: "" };

// Ignora acento e caixa: quem procura "impressao" acha "Impressão".
const normalizar = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export default function Glossario() {
  const [mapa, setMapa] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState(null); // categoria escolhida
  const [form, setForm] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const cartaoForm = useRef(null);

  useEffect(() => {
    let vivo = true;
    lerTermos()
      .then(async (m) => {
        if (!vivo) return;
        if (Object.keys(m).length > 0) return setMapa(m);
        /* A SEMENTE desce por import() dinâmico, SÓ aqui: são 96 kB que a aba
           inteira pagava em toda abertura -- no telefone, na frente do cliente
           -- para um dado que só é necessário uma vez na vida do sistema
           (servidor vazio). A aba caiu de ~98 kB para ~12 kB de JS. */
        const { GLOSSARIO: SEMENTE } = await import("../data/glossario.js");
        if (!vivo) return;
        const patch = {};
        SEMENTE.forEach((t, i) => {
          patch[`seed-${i + 1}`] = { ...t, ordem: i };
        });
        await salvarVarios(patch);
        if (vivo) setMapa(patch);
      })
      .catch((e) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
  }, []);

  const { grupos, total } = useMemo(() => {
    if (!mapa) return { grupos: [], total: 0 };
    const q = normalizar(busca.trim());
    const itens = Object.entries(mapa)
      .map(([id, t]) => ({ ...t, id }))
      .filter((t) => !filtro || t.categoria === filtro)
      .filter((t) => !q || normalizar(`${t.termo} ${t.categoria} ${t.texto} ${t.dica}`).includes(q))
      .sort((a, b) => (a.ordem ?? 9999) - (b.ordem ?? 9999));

    const lista = [];
    itens.forEach((t) => {
      const nome = t.categoria || "Outros";
      let g = lista.find((x) => x.nome === nome);
      if (!g) {
        g = { nome, itens: [] };
        lista.push(g);
      }
      g.itens.push(t);
    });
    return { grupos: lista, total: itens.length };
  }, [mapa, busca, filtro]);

  const abrirForm = (t) => {
    setAviso(null);
    setForm(t ? { ...VAZIO, ...t } : { ...VAZIO, categoria: filtro || CATEGORIAS[0] });
    setTimeout(() => cartaoForm.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
  };

  const salvar = useCallback(
    async (e) => {
      e.preventDefault();
      setAviso(null);
      if (!form.termo.trim() || !form.texto.trim()) {
        return setAviso({ tom: "erro", texto: "O termo e a explicação são obrigatórios." });
      }
      setSalvando(true);
      try {
        const id = form.id || `gl-${Date.now()}`;
        const ordem =
          form.ordem ?? Math.max(0, ...Object.values(mapa || {}).map((x) => x.ordem ?? 0)) + 1;
        const termo = {
          termo: form.termo.trim(),
          categoria: form.categoria,
          texto: form.texto.trim(),
          dica: form.dica.trim(),
          ordem,
        };
        await salvarTermo(id, termo);
        setMapa((m) => ({ ...(m || {}), [id]: termo }));
        setForm(null);
        setAviso({ tom: "ok", texto: `"${termo.termo}" salvo.` });
      } catch (err) {
        setAviso({ tom: "erro", texto: err.message });
      } finally {
        setSalvando(false);
      }
    },
    [form, mapa]
  );

  const remover = async (t) => {
    setAviso(null);
    try {
      await removerTermo(t.id);
      setMapa((m) => {
        const novo = { ...(m || {}) };
        delete novo[t.id];
        return novo;
      });
      if (form?.id === t.id) setForm(null);
    } catch (err) {
      setAviso({ tom: "erro", texto: err.message });
    }
  };

  if (erro) {
    return (
      <div className="space-y-6">
        <PageTitle titulo="Glossário" descricao="Os termos de comunicação visual explicados." />
        <Card className="flex items-start gap-2 text-sm text-bad-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {erro}
        </Card>
      </div>
    );
  }
  if (mapa === null) return <CarregandoModulo />;

  const categorias = [...new Set(Object.values(mapa).map((t) => t.categoria).filter(Boolean))];

  return (
    <div className="space-y-6">
      <PageTitle
        titulo="Glossário"
        descricao="O que e cada material, acabamento e peça de comunicação visual -- e o que avisar ao cliente antes de vender."
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1 sm:max-w-md">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9 pr-9"
            placeholder="Buscar termo (lona, ACM, ilhós, sangria...)"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          {busca.trim() && (
            <button
              type="button"
              onClick={() => setBusca("")}
              className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-slate-400 hover:text-slate-700"
              aria-label="Limpar busca"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <button type="button" className="btn-ghost" onClick={() => abrirForm(null)}>
          <Plus size={15} strokeWidth={2.4} />
          Novo termo
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setFiltro(null)}
          className={`rounded-full px-3 py-1 font-display text-xs font-semibold transition-colors ${
            filtro === null ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Todos
        </button>
        {categorias.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setFiltro(filtro === c ? null : c)}
            className={`rounded-full px-3 py-1 font-display text-xs font-semibold transition-colors ${
              filtro === c ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {c}
          </button>
        ))}
        <span className="ml-1 text-xs text-slate-400">
          {total} {total === 1 ? "termo" : "termos"}
        </span>
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
            titulo={form.id ? "Editar termo" : "Novo termo"}
            sub="A dica é opcional -- use para o aviso que evita retrabalho."
          />
          <form onSubmit={salvar} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="g-termo">Termo</label>
                <input
                  id="g-termo"
                  className="input"
                  placeholder="ex.: Lona backlight"
                  value={form.termo}
                  onChange={(e) => setForm((f) => ({ ...f, termo: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="g-cat">Categoria</label>
                <input
                  id="g-cat"
                  className="input"
                  list="lista-categorias"
                  value={form.categoria}
                  onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
                />
                <datalist id="lista-categorias">
                  {[...new Set([...CATEGORIAS, ...categorias])].map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="g-texto">Explicação</label>
              <textarea
                id="g-texto"
                className="input min-h-20"
                placeholder="O que e, em palavras que o cliente entende, e quando usar."
                value={form.texto}
                onChange={(e) => setForm((f) => ({ ...f, texto: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="g-dica">Dica de venda (opcional)</label>
              <textarea
                id="g-dica"
                className="input min-h-16"
                placeholder="O que avisar antes de fechar, para não virar retrabalho."
                value={form.dica}
                onChange={(e) => setForm((f) => ({ ...f, dica: e.target.value }))}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn-primary" disabled={salvando}>
                {salvando ? "Salvando..." : form.id ? "Salvar alterações" : "Cadastrar termo"}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setForm(null)}>
                Cancelar
              </button>
            </div>
          </form>
        </Card>
      )}

      {grupos.length === 0 && (
        <Empty>
          {busca.trim()
            ? `Nada com "${busca}".`
            : filtro
              ? `Nenhum termo em ${filtro}.`
              : "Nenhum termo cadastrado ainda."}
        </Empty>
      )}

      {grupos.map((g) => (
        <Card key={g.nome}>
          <SectionTitle titulo={g.nome} sub={`${g.itens.length} ${g.itens.length === 1 ? "termo" : "termos"}`} />
          <div className="grid gap-3 lg:grid-cols-2">
            {g.itens.map((t) => (
              <div
                key={t.id}
                className="group rounded-xl border p-4"
                style={{ borderColor: "var(--hairline)" }}
              >
                <div className="flex items-start gap-2">
                  <BookOpen size={15} className="mt-1 shrink-0 text-brand" />
                  <h4 className="min-w-0 flex-1 font-display text-sm font-semibold text-slate-900">
                    {t.termo}
                  </h4>
                  <span className="flex shrink-0 gap-0.5">
                    <button
                      type="button"
                      onClick={() => abrirForm(t)}
                      className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                      title={`Editar ${t.termo}`}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Remover "${t.termo}" do glossário?`)) remover(t);
                      }}
                      className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 hover:bg-bad-50 hover:text-bad-700"
                      title={`Remover ${t.termo}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </span>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{t.texto}</p>
                {t.dica && (
                  <p className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-warn-50 px-2.5 py-2 text-xs leading-relaxed text-warn-700">
                    <Lightbulb size={13} className="mt-0.5 shrink-0" />
                    <span>{t.dica}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
