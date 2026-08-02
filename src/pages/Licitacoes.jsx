// Licitacoes: os editais em que a Impresilk vai (ou pode) entrar, com O DIA da
// sessao na cara -- o valor da tela e ninguem perder prazo. Ordena pelo que
// vence primeiro, avisa "HOJE"/"amanha" e guarda o edital em PDF.
//
// Mesma infra dos Documentos (painel-ativos, tipo "licitacao"): item + arquivo.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Gavel,
  CalendarClock,
  Trophy,
  Plus,
  Trash2,
  Download,
  Upload,
  ArrowUpRight,
  AlertTriangle,
  Pencil,
} from "lucide-react";
import {
  listarAtivos,
  salvarAtivo,
  removerAtivo,
  guardarArquivo,
  lerArquivo,
  arquivoParaBase64,
  abrirBase64,
} from "../services/ativos.js";
import { moedaCheia, dataCurta, diasEntre, ymdLocal } from "../lib/format.js";
import { Card, PageTitle, SectionTitle, StatCard, Empty, CarregandoModulo } from "../components/ui.jsx";

const MAX_BYTES = 3 * 1024 * 1024;

const MODALIDADES = [
  "Pregao Eletronico",
  "Pregao Presencial",
  "Concorrencia",
  "Dispensa",
  "Inexigibilidade",
  "Credenciamento",
  "Tomada de Precos",
  "RDC",
  "Leilao",
];

// Situacoes: as tres primeiras estao VIVAS (aparecem em "Na mesa"); as demais
// contam historia. A cor segue o dinheiro: ganhou verde, perdeu vermelho.
const STATUS = {
  avaliar: { rotulo: "Avaliando", chip: "chip", vivo: true },
  participar: { rotulo: "Vou participar", chip: "chip-warn", vivo: true },
  enviada: { rotulo: "Proposta enviada", chip: "chip", vivo: true },
  ganha: { rotulo: "Ganha", chip: "chip-ok", vivo: false },
  perdida: { rotulo: "Perdida", chip: "chip-bad", vivo: false },
  fora: { rotulo: "Nao participei", chip: "chip", vivo: false },
};

const VAZIA = {
  id: "",
  nome: "",
  identificacao: "",
  categoria: "",
  edital: "",
  validade: "",
  hora: "",
  url: "",
  valor: "",
  status: "avaliar",
  observacao: "",
};

// Quanto falta para a sessao, em palavras -- e a informacao mais importante da tela.
function prazo(dias) {
  if (dias === null) return { texto: "sem data", chip: "chip", peso: 9000 };
  if (dias < 0) return { texto: `passou ha ${-dias} ${-dias === 1 ? "dia" : "dias"}`, chip: "chip-bad", peso: 8000 - dias };
  if (dias === 0) return { texto: "HOJE", chip: "chip-bad", peso: 0 };
  if (dias === 1) return { texto: "amanha", chip: "chip-bad", peso: 1 };
  if (dias <= 7) return { texto: `em ${dias} dias`, chip: "chip-warn", peso: dias };
  return { texto: `em ${dias} dias`, chip: "chip", peso: dias };
}

export default function Licitacoes() {
  const [itens, setItens] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [form, setForm] = useState(VAZIA);
  const [salvando, setSalvando] = useState(false);
  const inputArquivo = useRef(null);
  const hojeISO = ymdLocal(new Date());

  useEffect(() => {
    let vivo = true;
    listarAtivos()
      .then((l) => vivo && setItens(l.filter((x) => x.tipo === "licitacao")))
      .catch((e) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
  }, []);

  const vm = useMemo(() => {
    const todos = (itens || []).map((it) => {
      const dias = it.validade ? diasEntre(hojeISO, it.validade) : null;
      const st = STATUS[it.status] || STATUS.avaliar;
      return { ...it, dias, st, pz: prazo(dias) };
    });
    const naMesa = todos.filter((x) => x.st.vivo).sort((a, b) => a.pz.peso - b.pz.peso);
    const encerradas = todos
      .filter((x) => !x.st.vivo)
      .sort((a, b) => String(b.validade).localeCompare(String(a.validade)));
    const proxima = naMesa.find((x) => x.dias !== null && x.dias >= 0) || null;
    return {
      naMesa,
      encerradas,
      proxima,
      ganhas: encerradas.filter((x) => x.status === "ganha").length,
      atrasadas: naMesa.filter((x) => x.dias !== null && x.dias < 0).length,
    };
  }, [itens, hojeISO]);

  const editar = (it) =>
    setForm({
      id: it.id,
      nome: it.nome || "",
      identificacao: it.identificacao || "",
      categoria: it.categoria || "",
      edital: it.edital || "",
      validade: it.validade || "",
      hora: it.hora || "",
      url: it.url || "",
      valor: it.valor ? String(it.valor) : "",
      status: it.status || "avaliar",
      observacao: it.observacao || "",
    });

  const salvar = useCallback(
    async (e) => {
      e.preventDefault();
      setAviso(null);
      if (!form.nome.trim()) return setAviso({ tom: "erro", texto: "De um nome ao objeto da licitacao." });
      const file = inputArquivo.current?.files?.[0];
      if (file && file.size > MAX_BYTES) {
        return setAviso({ tom: "erro", texto: "Edital acima de 3 MB - guarde no Drive e cole o link no campo do portal." });
      }
      setSalvando(true);
      try {
        const item = await salvarAtivo({
          ...(form.id ? { id: form.id } : {}),
          tipo: "licitacao",
          nome: form.nome.trim(),
          identificacao: form.identificacao.trim(),
          categoria: form.categoria.trim(),
          edital: form.edital.trim(),
          validade: form.validade,
          hora: form.hora,
          url: form.url.trim() && !/^https?:\/\//i.test(form.url.trim()) ? "https://" + form.url.trim() : form.url.trim(),
          valor: Number(String(form.valor).replace(/\./g, "").replace(",", ".")) || 0,
          status: form.status,
          observacao: form.observacao.trim(),
          // Com arquivo novo, ele manda; sem, uma edicao reenvia o anexo que o
          // item ja tinha (o servidor regrava o registro inteiro).
          ...(file
            ? { arquivoNome: file.name, temArquivo: true }
            : (() => {
                const atual = form.id ? (itens || []).find((x) => x.id === form.id) : null;
                return atual ? { arquivoNome: atual.arquivoNome, temArquivo: atual.temArquivo } : {};
              })()),
        });
        if (file) {
          const base64 = await arquivoParaBase64(file);
          await guardarArquivo(item.id, base64, file.type, file.name);
        }
        setItens((l) => {
          const outros = (l || []).filter((x) => x.id !== item.id);
          return [...outros, item];
        });
        setForm(VAZIA);
        if (inputArquivo.current) inputArquivo.current.value = "";
        setAviso({ tom: "ok", texto: `"${item.nome}" salva.` });
      } catch (err) {
        setAviso({ tom: "erro", texto: err.message });
      } finally {
        setSalvando(false);
      }
    },
    [form, itens]
  );

  const remover = async (it) => {
    setAviso(null);
    try {
      await removerAtivo(it.id);
      setItens((l) => (l || []).filter((x) => x.id !== it.id));
      if (form.id === it.id) setForm(VAZIA);
    } catch (err) {
      setAviso({ tom: "erro", texto: err.message });
    }
  };

  const baixarEdital = async (it) => {
    setAviso(null);
    try {
      const r = await lerArquivo(it.id);
      if (!r?.base64) throw new Error("Edital nao encontrado no servidor.");
      abrirBase64(r.base64, r.mime, r.nome || it.arquivoNome);
    } catch (err) {
      setAviso({ tom: "erro", texto: err.message });
    }
  };

  if (erro) {
    return (
      <div className="space-y-6">
        <PageTitle titulo="Licitacoes" descricao="Editais, prazos e sessoes." />
        <Card className="flex items-start gap-2 text-sm text-bad-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {erro}
        </Card>
      </div>
    );
  }
  if (itens === null) return <CarregandoModulo />;

  const Linha = ({ it }) => (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border p-3.5"
      style={{ borderColor: "var(--hairline)" }}
    >
      <span className="min-w-0 flex-1 basis-52">
        <span className="block truncate font-display text-sm font-semibold text-slate-900">{it.nome}</span>
        <span className="block truncate text-xs text-slate-500">
          {[it.identificacao, it.categoria, it.edital && `edital ${it.edital}`].filter(Boolean).join(" · ") || "—"}
        </span>
      </span>

      <span className="shrink-0 text-right">
        <span className={`${it.pz.chip} whitespace-nowrap`}>{it.pz.texto}</span>
        <span className="mt-0.5 block text-xs tabular-nums text-slate-500">
          {it.validade ? `${dataCurta(it.validade)}${it.hora ? ` as ${it.hora}` : ""}` : "marque a data"}
        </span>
      </span>

      <span className={`${it.st.chip} shrink-0 whitespace-nowrap`}>{it.st.rotulo}</span>

      {it.valor > 0 && (
        <span className="shrink-0 font-display text-sm font-medium tabular-nums text-slate-700">
          {moedaCheia(it.valor)}
        </span>
      )}

      <span className="ml-auto flex shrink-0 items-center gap-0.5">
        {it.url && (
          <a
            href={it.url}
            target="_blank"
            rel="noopener noreferrer"
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-brand"
            title="Abrir o portal da licitacao"
          >
            <ArrowUpRight size={15} />
          </a>
        )}
        {it.temArquivo && (
          <button
            type="button"
            onClick={() => baixarEdital(it)}
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-brand"
            title="Baixar o edital"
          >
            <Download size={15} />
          </button>
        )}
        <button
          type="button"
          onClick={() => editar(it)}
          className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-900"
          title={`Editar ${it.nome}`}
        >
          <Pencil size={15} />
        </button>
        <button
          type="button"
          onClick={() => remover(it)}
          className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-bad-50 hover:text-bad-700"
          title={`Remover ${it.nome}`}
        >
          <Trash2 size={15} />
        </button>
      </span>
    </div>
  );

  return (
    <div className="space-y-8">
      <PageTitle
        titulo="Licitacoes"
        descricao="Os editais na mesa, com o dia da sessao na frente para ninguem perder prazo."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          rotulo="Proxima sessao"
          valor={vm.proxima ? `${dataCurta(vm.proxima.validade)}${vm.proxima.hora ? ` ${vm.proxima.hora}` : ""}` : "—"}
          sub={vm.proxima ? vm.proxima.nome : "nenhuma marcada"}
          tom={vm.proxima && vm.proxima.dias <= 2 ? "bad" : vm.proxima && vm.proxima.dias <= 7 ? "warn" : "neutral"}
          icone={CalendarClock}
        />
        <StatCard
          rotulo="Na mesa"
          valor={String(vm.naMesa.length)}
          sub={vm.atrasadas ? `${vm.atrasadas} com a data passada - atualize a situacao` : "avaliando, participando ou aguardando"}
          tom={vm.atrasadas ? "bad" : "neutral"}
          icone={Gavel}
        />
        <StatCard rotulo="Ganhas" valor={String(vm.ganhas)} sub="historico de vitorias" tom={vm.ganhas ? "ok" : "neutral"} icone={Trophy} />
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

      <Card>
        <SectionTitle titulo="Na mesa" sub="Ordenado pelo que vence primeiro." />
        {vm.naMesa.length === 0 ? (
          <Empty>Nenhuma licitacao na mesa. Cadastre a primeira abaixo.</Empty>
        ) : (
          <div className="space-y-2.5">
            {vm.naMesa.map((it) => (
              <Linha key={it.id} it={it} />
            ))}
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle
          titulo={form.id ? "Editar licitacao" : "Nova licitacao"}
          sub="So o objeto e obrigatorio - de preferencia ja marque a data da sessao."
        />
        <form onSubmit={salvar} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="l-nome">Objeto</label>
              <input
                id="l-nome"
                className="input"
                placeholder="ex.: Comunicacao visual das escolas municipais"
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="l-orgao">Orgao</label>
              <input
                id="l-orgao"
                className="input"
                placeholder="ex.: Prefeitura de Montes Claros"
                value={form.identificacao}
                onChange={(e) => setForm((f) => ({ ...f, identificacao: e.target.value }))}
              />
            </div>
            <div>
              <label className="label" htmlFor="l-mod">Modalidade</label>
              <input
                id="l-mod"
                className="input"
                list="lista-modalidades"
                placeholder="ex.: Pregao Eletronico"
                value={form.categoria}
                onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
              />
              <datalist id="lista-modalidades">
                {MODALIDADES.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="label" htmlFor="l-edital">Numero do edital</label>
              <input
                id="l-edital"
                className="input"
                placeholder="ex.: 042/2026"
                value={form.edital}
                onChange={(e) => setForm((f) => ({ ...f, edital: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="l-data">Dia da sessao</label>
                <input
                  id="l-data"
                  type="date"
                  className="input"
                  value={form.validade}
                  onChange={(e) => setForm((f) => ({ ...f, validade: e.target.value }))}
                />
              </div>
              <div>
                <label className="label" htmlFor="l-hora">Hora</label>
                <input
                  id="l-hora"
                  type="time"
                  className="input"
                  value={form.hora}
                  onChange={(e) => setForm((f) => ({ ...f, hora: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="l-url">Portal (link)</label>
              <input
                id="l-url"
                className="input"
                placeholder="ex.: portaldecompraspublicas.com.br/..."
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              />
            </div>
            <div>
              <label className="label" htmlFor="l-valor">Valor estimado (R$)</label>
              <input
                id="l-valor"
                className="input"
                inputMode="decimal"
                placeholder="ex.: 85000"
                value={form.valor}
                onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
              />
            </div>
            <div>
              <label className="label" htmlFor="l-status">Situacao</label>
              <select
                id="l-status"
                className="input"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              >
                {Object.entries(STATUS).map(([id, s]) => (
                  <option key={id} value={id}>
                    {s.rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="l-obs">Observacoes</label>
              <textarea
                id="l-obs"
                className="input min-h-16"
                placeholder="garantia exigida, visita tecnica, documentos que faltam..."
                value={form.observacao}
                onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="l-arq">Edital (PDF ate 3 MB)</label>
              <input
                id="l-arq"
                ref={inputArquivo}
                type="file"
                className="input file:mr-2 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary" disabled={salvando}>
              {form.id ? <Upload size={15} strokeWidth={2.4} /> : <Plus size={15} strokeWidth={2.4} />}
              {salvando ? "Salvando..." : form.id ? "Salvar alteracoes" : "Cadastrar licitacao"}
            </button>
            {form.id && (
              <button type="button" className="btn-ghost" onClick={() => setForm(VAZIA)}>
                Cancelar edicao
              </button>
            )}
          </div>
        </form>
      </Card>

      {vm.encerradas.length > 0 && (
        <Card>
          <SectionTitle titulo="Encerradas" sub="Ganhas, perdidas e as que ficaram de fora." />
          <div className="space-y-2.5">
            {vm.encerradas.map((it) => (
              <Linha key={it.id} it={it} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
