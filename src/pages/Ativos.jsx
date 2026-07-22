// Documentos, veiculos e maquinas -- tres lentes do mesmo controle: coisas com
// data que alguem precisa renovar antes de vencer.
//
// A tela abre pelo que esta pior (vencido primeiro) porque e assim que o
// problema chega: ninguem entra aqui para admirar o que esta em dia.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FileCheck2,
  Car,
  Cog,
  Plus,
  Trash2,
  Upload,
  Download,
  AlertTriangle,
  Check,
  Search,
  X,
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
import { calcAtivos, TIPOS, CATEGORIAS } from "../lib/calc/ativos.js";
import { dataLonga, numero, ymdLocal } from "../lib/format.js";
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

const ICONE = { documento: FileCheck2, veiculo: Car, maquina: Cog };

const TOM = {
  vencido: { chip: "chip-bad", barra: "bg-bad-600", texto: "text-bad-700" },
  urgente: { chip: "chip-warn", barra: "bg-warn-600", texto: "text-warn-700" },
  atencao: { chip: "chip", barra: "bg-slate-300", texto: "text-slate-600" },
  ok: { chip: "chip-ok", barra: "bg-ok-600", texto: "text-ok-700" },
  sem: { chip: "chip", barra: "bg-slate-200", texto: "text-slate-400" },
};

const vazio = (tipo) => ({
  tipo,
  nome: "",
  categoria: "",
  identificacao: "",
  responsavel: "",
  emissao: "",
  validade: "",
  medidorAtual: "",
  medidorProximo: "",
  unidadeMedidor: tipo === "veiculo" ? "km" : "horas",
  observacao: "",
});

export default function Ativos() {
  const [itens, setItens] = useState(null);
  const [erro, setErro] = useState(null);
  const [tipo, setTipo] = useState("documento");
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState(null); // null = formulario fechado
  const [arquivo, setArquivo] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState(null);

  const carregar = useCallback(async () => {
    try {
      setItens(await listarAtivos());
      setErro(null);
    } catch (e) {
      setErro(e.message);
      setItens([]);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const hojeISO = ymdLocal(new Date());
  const vm = useMemo(() => calcAtivos(itens || [], hojeISO), [itens, hojeISO]);

  const daLente = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return vm.lista
      .filter((x) => x.tipo === tipo)
      .filter((x) =>
        !q
          ? true
          : `${x.nome} ${x.categoria} ${x.identificacao} ${x.responsavel}`.toLowerCase().includes(q)
      );
  }, [vm, tipo, busca]);

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    setMsg(null);
    try {
      const item = await salvarAtivo({ ...form, temArquivo: !!arquivo || !!form.temArquivo });
      if (arquivo) {
        const b64 = await arquivoParaBase64(arquivo);
        await guardarArquivo(item.id, b64, arquivo.type, arquivo.name);
        await salvarAtivo({ ...item, temArquivo: true, arquivoNome: arquivo.name });
      }
      setMsg({ tom: "ok", texto: `${item.nome} salvo.` });
      setForm(null);
      setArquivo(null);
      carregar();
    } catch (err) {
      setMsg({ tom: "erro", texto: err.message });
    } finally {
      setSalvando(false);
    }
  }

  async function baixar(item) {
    try {
      const a = await lerArquivo(item.id);
      abrirBase64(a.base64, a.mime, a.nome || item.arquivoNome);
    } catch (err) {
      setMsg({ tom: "erro", texto: err.message });
    }
  }

  async function apagar(item) {
    setMsg(null);
    try {
      await removerAtivo(item.id);
      setMsg({ tom: "aviso", texto: `${item.nome} removido.` });
      carregar();
    } catch (err) {
      setMsg({ tom: "erro", texto: err.message });
    }
  }

  if (erro && !itens?.length) return <ErroModulo mensagem={erro} aoTentar={carregar} />;
  if (itens === null) return <CarregandoModulo />;

  const k = vm.kpis;
  const ehVeicMaq = tipo !== "documento";

  return (
    <div className="space-y-8">
      <PageTitle
        titulo="Documentos e ativos"
        descricao="O que vence e precisa ser renovado: certidoes da empresa, manutencao dos veiculos e das maquinas."
        acao={
          <button className="btn-primary" onClick={() => setForm(vazio(tipo))}>
            <Plus size={16} strokeWidth={2.4} />
            Novo {TIPOS[tipo].singular.toLowerCase()}
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard rotulo="Vencidos" valor={numero(k.vencidos)} sub="precisam de acao hoje" tom={k.vencidos ? "bad" : "ok"} icone={AlertTriangle} />
        <StatCard rotulo="Vencem em 30 dias" valor={numero(k.urgentes)} sub="renovar ja" tom={k.urgentes ? "warn" : "ok"} icone={AlertTriangle} />
        <StatCard rotulo="Cadastrados" valor={numero(k.total)} sub="documentos, veiculos e maquinas" tom="neutral" icone={FileCheck2} />
        <StatCard rotulo="Sem data" valor={numero(k.semControle)} sub="ninguem sera avisado" tom={k.semControle ? "warn" : "ok"} icone={AlertTriangle} />
      </div>

      {msg && (
        <p
          className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
            msg.tom === "ok" ? "bg-ok-50 text-ok-700" : msg.tom === "erro" ? "bg-bad-50 text-bad-700" : "bg-warn-50 text-warn-700"
          }`}
        >
          {msg.tom === "ok" ? <Check size={15} className="mt-0.5 shrink-0" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0" />}
          {msg.texto}
        </p>
      )}

      {form && (
        <Card>
          <SectionTitle
            titulo={form.id ? `Editar ${TIPOS[form.tipo].singular.toLowerCase()}` : `Novo ${TIPOS[form.tipo].singular.toLowerCase()}`}
            sub="A data de validade e o que faz o painel avisar antes de vencer."
            acao={
              <button className="btn-ghost" onClick={() => { setForm(null); setArquivo(null); }}>
                <X size={15} /> Fechar
              </button>
            }
          />
          <form onSubmit={salvar} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="label">Nome</label>
                <input
                  className="input"
                  value={form.nome}
                  onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                  placeholder={form.tipo === "veiculo" ? "ex: Fiorino branca" : form.tipo === "maquina" ? "ex: Router CNC" : "ex: Alvara de funcionamento"}
                  required
                />
              </div>
              <div>
                <label className="label">Categoria</label>
                <input
                  className="input"
                  list="cats"
                  value={form.categoria}
                  onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
                  placeholder="escolha ou digite"
                />
                <datalist id="cats">
                  {(CATEGORIAS[form.tipo] || []).map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="label">
                  {form.tipo === "veiculo" ? "Placa" : form.tipo === "maquina" ? "Patrimonio" : "Numero do documento"}
                </label>
                <input
                  className="input"
                  value={form.identificacao}
                  onChange={(e) => setForm((f) => ({ ...f, identificacao: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Emissao</label>
                <input type="date" className="input" value={form.emissao} onChange={(e) => setForm((f) => ({ ...f, emissao: e.target.value }))} />
              </div>
              <div>
                <label className="label">Validade / proxima acao</label>
                <input type="date" className="input" value={form.validade} onChange={(e) => setForm((f) => ({ ...f, validade: e.target.value }))} />
              </div>
              <div>
                <label className="label">Responsavel</label>
                <input className="input" value={form.responsavel} onChange={(e) => setForm((f) => ({ ...f, responsavel: e.target.value }))} placeholder="quem cuida disso" />
              </div>

              {ehVeicMaq && (
                <>
                  <div>
                    <label className="label">{form.unidadeMedidor === "km" ? "Km atual" : "Horas atuais"}</label>
                    <input type="number" className="input" value={form.medidorAtual} onChange={(e) => setForm((f) => ({ ...f, medidorAtual: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Proxima manutencao em</label>
                    <input type="number" className="input" value={form.medidorProximo} onChange={(e) => setForm((f) => ({ ...f, medidorProximo: e.target.value }))} placeholder={form.unidadeMedidor === "km" ? "ex: 90000" : "ex: 1200"} />
                  </div>
                </>
              )}
            </div>

            <div>
              <label className="label">Observacao</label>
              <input className="input" value={form.observacao} onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))} placeholder="onde renovar, orgao, telefone do contato..." />
            </div>

            <div>
              <label className="label">Arquivo (PDF ou imagem, ate ~3 MB)</label>
              <input
                type="file"
                accept="application/pdf,image/*"
                onChange={(e) => setArquivo(e.target.files?.[0] || null)}
                className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:font-display file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
              />
              {form.temArquivo && !arquivo && (
                <p className="mt-1 text-xs text-slate-500">
                  Ja tem arquivo guardado ({form.arquivoNome || "documento"}). Escolher outro substitui.
                </p>
              )}
            </div>

            <button className="btn-primary" disabled={salvando}>
              <Upload size={16} strokeWidth={2.4} />
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </form>
        </Card>
      )}

      <Card>
        <SectionTitle
          titulo={TIPOS[tipo].rotulo}
          sub="Ordenado pelo que esta pior: vencido primeiro."
          acao={
            <Segmented
              opcoes={Object.entries(TIPOS).map(([id, t]) => ({ valor: id, rotulo: t.rotulo }))}
              valor={tipo}
              onChange={(v) => {
                setTipo(v);
                setBusca("");
              }}
            />
          }
        />

        <div className="sem-impressao mb-4 relative max-w-sm">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, categoria ou responsavel" />
        </div>

        {daLente.length === 0 ? (
          <Empty>
            Nenhum {TIPOS[tipo].singular.toLowerCase()} cadastrado ainda.{" "}
            <button className="btn-ghost ml-1" onClick={() => setForm(vazio(tipo))}>
              Cadastrar o primeiro
            </button>
          </Empty>
        ) : (
          <div className="space-y-2">
            {daLente.map((it) => {
              const Ic = ICONE[it.tipo];
              const t = TOM[it.sit.nivel] || TOM.sem;
              return (
                <div
                  key={it.id}
                  className={`card flex flex-wrap items-center gap-3 border-l-4 p-4 ${
                    it.sit.nivel === "vencido" ? "border-l-bad-600" : it.sit.nivel === "urgente" ? "border-l-warn-600" : "border-l-transparent"
                  }`}
                >
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 ${t.texto}`}>
                    <Ic size={18} strokeWidth={2.2} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="font-display text-sm font-semibold text-slate-900">
                      {it.nome}
                      {it.identificacao && <span className="ml-2 font-normal text-slate-400">{it.identificacao}</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {[it.categoria, it.responsavel && `resp. ${it.responsavel}`, it.validade && `validade ${dataLonga(it.validade)}`]
                        .filter(Boolean)
                        .join(" · ") || "sem detalhes"}
                    </p>
                    {it.observacao && <p className="mt-0.5 text-xs text-slate-400">{it.observacao}</p>}
                  </div>

                  <span className={`${t.chip} shrink-0`}>{it.sit.rotulo}</span>

                  <div className="flex shrink-0 items-center gap-1">
                    {it.temArquivo && (
                      <button onClick={() => baixar(it)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-brand" title="Abrir o arquivo" aria-label={`Abrir o arquivo de ${it.nome}`}>
                        <Download size={15} />
                      </button>
                    )}
                    <button onClick={() => { setForm({ ...it, medidorAtual: it.medidorAtual || "", medidorProximo: it.medidorProximo || "" }); setArquivo(null); }} className="rounded-lg px-2 py-1 font-display text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800">
                      Editar
                    </button>
                    <button onClick={() => apagar(it)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-bad-50 hover:text-bad-700" title="Remover" aria-label={`Remover ${it.nome}`}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
