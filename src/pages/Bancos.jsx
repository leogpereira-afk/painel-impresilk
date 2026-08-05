// Bancos e Pix: contas, CNPJs e chaves de todas as empresas.
//
// O que a tela precisa fazer bem: alguem pede os dados no WhatsApp e voce
// responde em DOIS cliques. Por isso o botao verde e o principal de cada
// cartao -- ele abre o WhatsApp com a conta ja escrita e voce so escolhe para
// quem mandar. Copiar valor a valor continua ali para preencher formulario.
//
// As contas vivem SO no servidor (painel-config, chave "bancos"), atras de
// login e do modulo "bancos". Nada de conta bancaria no arquivo publico.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Copy,
  Check,
  Search,
  X,
  Plus,
  Pencil,
  Trash2,
  MessageCircle,
  AlertTriangle,
} from "lucide-react";
import { lerBancos, salvarBanco, removerBanco } from "../services/bancos.js";
import { Card, PageTitle, SectionTitle, CarregandoModulo } from "../components/ui.jsx";

const ABERTOS_KEY = "painel_bancos_abertos";

const TIPOS_PIX = ["CNPJ", "CPF", "E-mail", "Telefone", "Aleatoria", "Conta e agencia"];

const VAZIO = {
  id: "",
  grupo: "",
  banco: "",
  titular: "",
  doc: "",
  agencia: "",
  conta: "",
  pix: "",
  pixTipo: "CNPJ",
};

const ehCPF = (doc) => /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(String(doc || ""));

// O texto que chega para quem pediu os dados. Negrito do WhatsApp = *asteriscos*.
function textoWhatsApp(b) {
  const rotuloDoc = ehCPF(b.doc) ? "CPF" : "CNPJ";
  return [
    `*${b.banco} - ${b.titular}*`,
    b.doc && `${rotuloDoc}: ${b.doc}`,
    b.agencia && `Agencia: ${b.agencia}`,
    b.conta && `Conta: ${b.conta}`,
    b.pix ? `Pix (${b.pixTipo}): ${b.pix}` : b.pixTipo && `Pix: ${b.pixTipo}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function Valor({ rotulo, valor, aoCopiar, copiado }) {
  if (!valor) return null;
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="shrink-0 font-display text-xs font-medium uppercase tracking-wide text-slate-400">
        {rotulo}
      </span>
      <button
        type="button"
        onClick={aoCopiar}
        title={`Copiar ${rotulo}`}
        className="group flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-right font-mono text-sm text-slate-700 transition-colors hover:bg-brand/10 hover:text-brand"
      >
        <span className="min-w-0 truncate">{valor}</span>
        {copiado ? (
          <Check size={13} className="shrink-0 text-ok-600" />
        ) : (
          <Copy size={13} className="shrink-0 text-slate-300 group-hover:text-brand" />
        )}
      </button>
    </div>
  );
}

export default function Bancos() {
  const [mapa, setMapa] = useState(null); // {id: conta}
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [busca, setBusca] = useState("");
  const [copiado, setCopiado] = useState(null);
  const [form, setForm] = useState(null); // null = formulario fechado
  const [salvando, setSalvando] = useState(false);
  const timer = useRef(null);
  const cartaoForm = useRef(null);

  useEffect(() => {
    let vivo = true;
    // As contas vem SO do servidor. Elas ja moraram no codigo como semente, e
    // isso significava que qualquer pessoa na internet baixava o arquivo do
    // painel e lia 19 contas, 9 CPF/CNPJ (inclusive o do dono) e 15 chaves Pix
    // sem nenhum login. Plantada a semente, o arquivo virou so risco.
    lerBancos()
      .then((m) => vivo && setMapa(m))
      .catch((e) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
  }, []);

  const [abertos, setAbertos] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(ABERTOS_KEY) || "null") || {};
    } catch {
      return {};
    }
  });

  const grupos = useMemo(() => {
    if (!mapa) return [];
    const q = busca.trim().toLowerCase();
    const itens = Object.entries(mapa)
      .map(([id, b]) => ({ ...b, id }))
      .filter((b) => {
        if (!q) return true;
        return `${b.grupo} ${b.banco} ${b.titular} ${b.doc} ${b.agencia} ${b.conta} ${b.pix} ${b.pixTipo}`
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => (a.ordem ?? 9999) - (b.ordem ?? 9999));

    const lista = [];
    itens.forEach((b) => {
      const nome = b.grupo || "Sem grupo";
      let g = lista.find((x) => x.nome === nome);
      if (!g) {
        g = { nome, itens: [] };
        lista.push(g);
      }
      g.itens.push(b);
    });
    return lista;
  }, [mapa, busca]);

  const buscando = !!busca.trim();

  const estaAberto = (nome, i) => {
    if (buscando) return true;
    if (nome in abertos) return !!abertos[nome];
    return i === 0;
  };

  const alternar = (nome, i) => {
    // Durante a busca todos ficam abertos a forca; gravar aqui mudaria a
    // preferencia sem efeito visivel e o grupo fecharia ao limpar a busca.
    if (buscando) return;
    const novo = { ...abertos, [nome]: !estaAberto(nome, i) };
    setAbertos(novo);
    try {
      localStorage.setItem(ABERTOS_KEY, JSON.stringify(novo));
    } catch {}
  };

  const copiar = async (texto, chave) => {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = texto;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      } catch {
        return;
      }
    }
    setCopiado(chave);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopiado(null), 1600);
  };

  const mandarNoWhats = (b) => {
    const url = `https://wa.me/?text=${encodeURIComponent(textoWhatsApp(b))}`;
    window.open(url, "_blank", "noopener");
  };

  const abrirForm = (b) => {
    setAviso(null);
    setForm(b ? { ...VAZIO, ...b } : { ...VAZIO, grupo: grupos[0]?.nome || "" });
    setTimeout(() => cartaoForm.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
  };

  const salvar = useCallback(
    async (e) => {
      e.preventDefault();
      setAviso(null);
      if (!form.banco.trim() || !form.titular.trim()) {
        return setAviso({ tom: "erro", texto: "Banco e titular sao obrigatorios." });
      }
      setSalvando(true);
      try {
        const id = form.id || `bc-${Date.now()}`;
        const ordem =
          form.ordem ??
          Math.max(0, ...Object.values(mapa || {}).map((x) => x.ordem ?? 0)) + 1;
        const conta = {
          grupo: form.grupo.trim() || "Sem grupo",
          banco: form.banco.trim(),
          titular: form.titular.trim(),
          doc: form.doc.trim(),
          agencia: form.agencia.trim(),
          conta: form.conta.trim(),
          pix: form.pix.trim(),
          pixTipo: form.pixTipo,
          ordem,
        };
        await salvarBanco(id, conta);
        setMapa((m) => ({ ...(m || {}), [id]: conta }));
        setForm(null);
        setAviso({ tom: "ok", texto: `${conta.banco} - ${conta.titular} salvo.` });
      } catch (err) {
        setAviso({ tom: "erro", texto: err.message });
      } finally {
        setSalvando(false);
      }
    },
    [form, mapa]
  );

  const remover = async (b) => {
    setAviso(null);
    try {
      await removerBanco(b.id);
      setMapa((m) => {
        const novo = { ...(m || {}) };
        delete novo[b.id];
        return novo;
      });
      if (form?.id === b.id) setForm(null);
      setAviso({ tom: "ok", texto: `${b.banco} - ${b.titular} removido.` });
    } catch (err) {
      setAviso({ tom: "erro", texto: err.message });
    }
  };

  if (erro) {
    return (
      <div className="space-y-6">
        <PageTitle titulo="Bancos e Pix" descricao="Contas, CNPJs e chaves de todas as empresas." />
        <Card className="flex items-start gap-2 text-sm text-bad-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {erro}
        </Card>
      </div>
    );
  }
  if (mapa === null) return <CarregandoModulo />;

  const nomesDeGrupo = [...new Set(Object.values(mapa).map((b) => b.grupo).filter(Boolean))];

  return (
    <div className="space-y-6">
      <PageTitle
        titulo="Bancos e Pix"
        descricao="Alguem pediu os dados? Mande no WhatsApp em dois cliques. Ou clique em qualquer valor para copiar."
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1 sm:max-w-md">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9 pr-9"
            placeholder="Buscar banco, titular, CNPJ, conta ou chave"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          {buscando && (
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
        <button type="button" className="btn-primary" onClick={() => abrirForm(null)}>
          <Plus size={15} strokeWidth={2.4} />
          Nova conta
        </button>
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
            titulo={form.id ? "Editar conta" : "Nova conta"}
            sub="Deixe a chave Pix em branco e escolha 'Conta e agencia' quando nao houver chave."
          />
          <form onSubmit={salvar} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="label" htmlFor="b-grupo">Grupo</label>
                <input
                  id="b-grupo"
                  className="input"
                  list="lista-grupos"
                  placeholder="ex.: Impresilk e Universo"
                  value={form.grupo}
                  onChange={(e) => setForm((f) => ({ ...f, grupo: e.target.value }))}
                />
                <datalist id="lista-grupos">
                  {nomesDeGrupo.map((g) => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="label" htmlFor="b-banco">Banco</label>
                <input
                  id="b-banco"
                  className="input"
                  placeholder="ex.: Sicoob Credinor"
                  value={form.banco}
                  onChange={(e) => setForm((f) => ({ ...f, banco: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="b-titular">Titular</label>
                <input
                  id="b-titular"
                  className="input"
                  placeholder="ex.: Impresilk"
                  value={form.titular}
                  onChange={(e) => setForm((f) => ({ ...f, titular: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="b-doc">CNPJ ou CPF</label>
                <input
                  id="b-doc"
                  className="input"
                  placeholder="00.000.000/0000-00"
                  value={form.doc}
                  onChange={(e) => setForm((f) => ({ ...f, doc: e.target.value }))}
                />
              </div>
              <div>
                <label className="label" htmlFor="b-ag">Agencia</label>
                <input
                  id="b-ag"
                  className="input"
                  value={form.agencia}
                  onChange={(e) => setForm((f) => ({ ...f, agencia: e.target.value }))}
                />
              </div>
              <div>
                <label className="label" htmlFor="b-cc">Conta</label>
                <input
                  id="b-cc"
                  className="input"
                  value={form.conta}
                  onChange={(e) => setForm((f) => ({ ...f, conta: e.target.value }))}
                />
              </div>
              <div>
                <label className="label" htmlFor="b-pixtipo">Tipo da chave Pix</label>
                <select
                  id="b-pixtipo"
                  className="input"
                  value={form.pixTipo}
                  onChange={(e) => setForm((f) => ({ ...f, pixTipo: e.target.value }))}
                >
                  {TIPOS_PIX.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="b-pix">Chave Pix</label>
                <input
                  id="b-pix"
                  className="input"
                  placeholder="deixe em branco se a conta nao tem chave"
                  value={form.pix}
                  onChange={(e) => setForm((f) => ({ ...f, pix: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button className="btn-primary" disabled={salvando}>
                {salvando ? "Salvando..." : form.id ? "Salvar alteracoes" : "Cadastrar conta"}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setForm(null)}>
                Cancelar
              </button>
            </div>
          </form>
        </Card>
      )}

      {grupos.length === 0 && (
        <p className="text-sm text-slate-500">
          {buscando ? `Nada com "${busca}" - confira a grafia.` : "Nenhuma conta cadastrada ainda."}
        </p>
      )}

      {grupos.map((g, i) => {
        const aberto = estaAberto(g.nome, i);
        return (
          <Card key={g.nome} className="p-0">
            <button
              type="button"
              onClick={() => alternar(g.nome, i)}
              aria-expanded={aberto}
              className="flex w-full items-center gap-2.5 px-5 py-4 text-left"
            >
              <ChevronDown
                size={16}
                className={`shrink-0 text-slate-400 transition-transform ${aberto ? "" : "-rotate-90"}`}
              />
              <span className="min-w-0 flex-1 truncate font-display text-base font-semibold text-slate-900">
                {g.nome}
              </span>
              <span className="chip">
                {g.itens.length} {g.itens.length === 1 ? "conta" : "contas"}
              </span>
            </button>

            {aberto && (
              <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-3">
                {g.itens.map((b) => (
                  <div
                    key={b.id}
                    className="flex flex-col rounded-xl border p-3.5"
                    style={{ borderColor: "var(--hairline)" }}
                  >
                    <div className="flex items-start gap-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-sm font-semibold text-slate-900">
                          {b.banco}
                        </span>
                        <span className="block truncate text-xs text-slate-500">{b.titular}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => abrirForm(b)}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                        title={`Editar ${b.banco}`}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => remover(b)}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-bad-50 hover:text-bad-700"
                        title={`Remover ${b.banco}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    <div className="mt-1.5 flex-1">
                      <Valor
                        rotulo={ehCPF(b.doc) ? "CPF" : "CNPJ"}
                        valor={b.doc}
                        copiado={copiado === `${b.id}-doc`}
                        aoCopiar={() => copiar(b.doc, `${b.id}-doc`)}
                      />
                      <Valor
                        rotulo="Agencia"
                        valor={b.agencia}
                        copiado={copiado === `${b.id}-ag`}
                        aoCopiar={() => copiar(b.agencia, `${b.id}-ag`)}
                      />
                      <Valor
                        rotulo="Conta"
                        valor={b.conta}
                        copiado={copiado === `${b.id}-cc`}
                        aoCopiar={() => copiar(b.conta, `${b.id}-cc`)}
                      />
                      {b.pix ? (
                        <Valor
                          rotulo={`Pix (${b.pixTipo})`}
                          valor={b.pix}
                          copiado={copiado === `${b.id}-pix`}
                          aoCopiar={() => copiar(b.pix, `${b.id}-pix`)}
                        />
                      ) : (
                        <div className="flex items-baseline justify-between gap-3 py-1">
                          <span className="font-display text-xs font-medium uppercase tracking-wide text-slate-400">
                            Pix
                          </span>
                          <span className="text-sm text-slate-400">{b.pixTipo}</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-3 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => mandarNoWhats(b)}
                        // ok-700, e o hover ESCURECE: voltar para ok-600 no hover
                        // devolvia os 3,3:1 que este botao existe para evitar.
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-ok-700 px-3 py-2 font-display text-sm font-semibold text-white transition-all hover:brightness-90"
                        title="Abrir o WhatsApp com estes dados prontos"
                      >
                        <MessageCircle size={15} strokeWidth={2.4} />
                        Mandar no WhatsApp
                      </button>
                      <button
                        type="button"
                        onClick={() => copiar(textoWhatsApp(b), `${b.id}-tudo`)}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                        style={{ borderColor: "var(--hairline)" }}
                        title="Copiar a conta inteira"
                      >
                        {copiado === `${b.id}-tudo` ? (
                          <Check size={15} className="text-ok-600" />
                        ) : (
                          <Copy size={15} />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
