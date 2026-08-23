// Esquema tatico: as taticas de 90 dias, agrupadas por objetivo.
//
// COMPONENTE COMPARTILHADO. Ele NAO sabe de onde vem o dado e nao faz query:
// recebe tudo por props e avisa por callback. E o que permite a mesma peca
// servir a tela de Gestao da empresa e, quando a Central do Leo for para React,
// a agenda pessoal -- sem clone.
//
// Props:
//   taticas      lista ja filtrada por quem chama (a tela decide o escopo)
//   objetivos    para agrupar e para o seletor; vazio = sem agrupamento
//   escopo       "empresa" | "pessoal"  -> muda a regra de vinculo (R3)
//   empresaId    obrigatorio quando escopo = "empresa"
//   mostrarVinculoObjetivo  exibe e exige o objetivo no formulario
//   permitirCriar / permitirEditar
//   pessoas      sugestoes de responsavel
//   aoSalvar(tatica) / aoRemover(id)   -> Promise
//
// O componente e "burro" de proposito: quem manda no dado e a tela.

import { useMemo, useState } from "react";
import { Plus, Check, Trash2, Pencil, FileText, AlertTriangle, Filter } from "lucide-react";
import { STATUS_TATICA, porObjetivo, taticasSoltas, atrasada } from "../lib/calc/gestao.js";
import { dataCurta } from "../lib/format.js";
import { Empty } from "./ui.jsx";

const VAZIA = {
  id: "", titulo: "", responsavel: "", prazo: "", status: "aberta", objetivoId: "",
};

// "Jéssica", "jessica" e "Jessica " são a mesma pessoa. O campo `responsavel` é
// texto livre desde sempre e a lista do RH vem acentuada -- comparar cru fazia
// o filtro por pessoa devolver lista vazia.
const semAcento = (v) =>
  String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
const mesmaPessoa = (a, b) => semAcento(a) === semAcento(b);

// Formulario em componente proprio, no escopo do modulo: com ele dentro do pai,
// cada tecla digitada remontaria a arvore e o campo perderia o foco.
function Formulario({ inicial, objetivos, exigeObjetivo, pessoas, salvando, aoSalvar, aoFechar }) {
  const [f, setF] = useState(inicial);
  const [erro, setErro] = useState("");

  const enviar = async (e) => {
    e.preventDefault();
    if (!f.titulo.trim()) return setErro("Escreva o que precisa ser feito.");
    if (exigeObjetivo && !f.objetivoId) {
      return setErro(
        "Toda tática da empresa precisa estar ligada a um objetivo do ano. " +
        "Se nenhum serve, o que você quer fazer ainda não virou plano."
      );
    }
    setErro("");
    await aoSalvar(f);
  };

  return (
    <form onSubmit={enviar} className="mb-3 rounded-xl border p-3" style={{ borderColor: "var(--hairline)" }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="t-titulo">O que precisa ser feito</label>
          <input id="t-titulo" className="input" value={f.titulo} autoFocus
            onChange={(e) => setF((x) => ({ ...x, titulo: e.target.value }))}
            placeholder="ex.: Fechar contrato de manutenção das máquinas" />
        </div>
        {exigeObjetivo && (
          <div className="sm:col-span-2">
            <label className="label" htmlFor="t-objetivo">Objetivo do ano</label>
            <select id="t-objetivo" className="input" value={f.objetivoId}
              onChange={(e) => setF((x) => ({ ...x, objetivoId: e.target.value }))}>
              <option value="">Escolha o objetivo...</option>
              {objetivos.map((o) => <option key={o.id} value={o.id}>{o.titulo}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="label" htmlFor="t-resp">Responsável</label>
          {/* A lista vem do RH. Continua sendo campo de TEXTO, não select: dá
              para responsabilizar quem não está no RH (um fornecedor, um sócio)
              sem que a tela trave. Só o NOME, a pedido do dono. */}
          <input id="t-resp" className="input" list="gestao-pessoas" value={f.responsavel}
            placeholder={pessoas.length ? "escolha na lista ou digite" : "quem vai tocar isso"}
            onChange={(e) => setF((x) => ({ ...x, responsavel: e.target.value }))} />
          <datalist id="gestao-pessoas">
            {pessoas.map((p, i) => {
              const nome = typeof p === "string" ? p : p.nome;
              // key com o índice junto: dois colaboradores de mesmo nome não
              // podem derrubar a lista com key repetida.
              return <option key={`${nome}-${i}`} value={nome} />;
            })}
          </datalist>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="t-prazo">Prazo</label>
            <input id="t-prazo" type="date" className="input" value={f.prazo || ""}
              onChange={(e) => setF((x) => ({ ...x, prazo: e.target.value }))} />
          </div>
          <div>
            <label className="label" htmlFor="t-status">Situação</label>
            <select id="t-status" className="input" value={f.status}
              onChange={(e) => setF((x) => ({ ...x, status: e.target.value }))}>
              {Object.entries(STATUS_TATICA).map(([id, s]) => (
                <option key={id} value={id}>{s.rotulo}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
      {erro && <p className="mt-2 rounded-lg bg-bad-50 px-3 py-2 text-sm text-bad-700">{erro}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn-primary" disabled={salvando}>
          {salvando ? "Salvando..." : f.id ? "Salvar" : "Criar tática"}
        </button>
        <button type="button" className="btn-ghost" onClick={aoFechar}>Cancelar</button>
      </div>
    </form>
  );
}

function Linha({ t, hojeISO, permitirEditar, aoConcluir, aoEditar, aoRemover }) {
  const s = STATUS_TATICA[t.status] || STATUS_TATICA.aberta;
  const venceu = atrasada(t, hojeISO);
  const feita = t.status === "concluida";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border p-3"
      style={{ borderColor: "var(--hairline)" }}>
      {permitirEditar && (
        <button type="button" onClick={() => aoConcluir(t)}
          title={feita ? "Reabrir" : "Marcar como concluída"}
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border transition-colors ${
            feita ? "border-ok-600 bg-ok-600 text-white" : "text-slate-400 hover:border-ok-600 hover:text-ok-700"
          }`}
          style={feita ? undefined : { borderColor: "var(--hairline)" }}>
          <Check size={15} strokeWidth={feita ? 3 : 2} />
        </button>
      )}
      <span className="min-w-0 flex-1 basis-48">
        <span className={`block font-display text-sm font-medium text-slate-900 ${feita ? "line-through opacity-70" : ""}`}>
          {t.titulo}
        </span>
        <span className="block truncate text-xs text-slate-500">
          {[t.responsavel, t.prazo ? dataCurta(t.prazo) : "sem prazo"].filter(Boolean).join(" · ")}
        </span>
      </span>
      {/* Tatica que nasceu de decisao de ata leva marca: quem abre a tela sabe
          que aquilo foi combinado numa reuniao, nao inventado depois. */}
      {t.origem === "ata" && (
        <span className="chip inline-flex shrink-0 items-center gap-1" title="Veio de uma decisão de ata">
          <FileText size={12} /> ata
        </span>
      )}
      {venceu && <span className="chip-bad shrink-0">atrasada</span>}
      <span className={`${s.chip} shrink-0`}>{s.rotulo}</span>
      {permitirEditar && (
        <span className="flex shrink-0 items-center gap-0.5">
          <button type="button" onClick={() => aoEditar(t)} title="Editar"
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900">
            <Pencil size={14} />
          </button>
          <button type="button" onClick={() => aoRemover(t)} title="Apagar"
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-bad-50 hover:text-bad-700">
            <Trash2 size={14} />
          </button>
        </span>
      )}
    </div>
  );
}

export default function EsquemaTatico({
  taticas = [],
  objetivos = [],
  escopo = "empresa",
  empresaId = null,
  mostrarVinculoObjetivo = true,
  permitirCriar = true,
  permitirEditar = true,
  pessoas = [],
  hojeISO,
  aoSalvar,
  aoRemover,
  // Filtro por responsavel CONTROLADO de fora quando vem par: e assim que
  // tocar numa pessoa no quadro do time filtra esta lista. Sem os dois, o
  // componente segue com o estado dele -- a Central do Leo nao passa nada.
  respFiltrado,
  aoFiltrarResp,
}) {
  const [form, setForm] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [fStatus, setFStatus] = useState("");
  const [respInterno, setRespInterno] = useState("");
  const controlado = typeof aoFiltrarResp === "function";
  const fResp = controlado ? (respFiltrado || "") : respInterno;
  const setFResp = controlado ? aoFiltrarResp : setRespInterno;

  // Quem aparece no FILTRO: só quem realmente tem tática. Encher o filtro com
  // as 39 pessoas do RH faria a maioria das opções não devolver nada.
  const responsaveis = useMemo(
    () => [...new Set(taticas.map((t) => t.responsavel).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [taticas]
  );

  const visiveis = useMemo(
    () => taticas.filter((t) =>
      (!fStatus || t.status === fStatus) && (!fResp || mesmaPessoa(t.responsavel, fResp))),
    [taticas, fStatus, fResp]
  );

  const grupos = useMemo(() => porObjetivo(objetivos, [], visiveis), [objetivos, visiveis]);
  const soltas = useMemo(() => taticasSoltas(visiveis), [visiveis]);

  const salvar = async (f) => {
    setSalvando(true);
    try {
      await aoSalvar({
        id: f.id || undefined,
        escopo,
        empresa: escopo === "empresa" ? "Impresilk" : undefined,
        objetivoId: f.objetivoId || null,
        titulo: f.titulo,
        responsavel: f.responsavel,
        prazo: f.prazo || null,
        status: f.status,
      });
      setForm(null);
    } finally {
      setSalvando(false);
    }
  };

  /* O catch de verdade (com o aviso) mora em quem passou aoSalvar -- a Gestao
     mostra a mensagem do servidor. Este catch vazio existe so para a rejeicao
     que ELA relanca nao virar unhandled rejection no console.
     E origem/decisaoId NAO vao no pedido de proposito: o servidor preserva o
     que esta gravado quando o campo nao vem -- mandar daqui recriaria o
     defeito que apagava o vinculo com a decisao da ata. */
  const concluir = (t) =>
    aoSalvar({
      id: t.id, escopo: t.escopo, empresa: escopo === "empresa" ? "Impresilk" : undefined,
      objetivoId: t.objetivo_id, titulo: t.titulo, responsavel: t.responsavel,
      prazo: t.prazo, status: t.status === "concluida" ? "aberta" : "concluida",
    }).catch(() => {});

  const editar = (t) => setForm({
    id: t.id, titulo: t.titulo, responsavel: t.responsavel || "",
    prazo: t.prazo || "", status: t.status, objetivoId: t.objetivo_id || "",
  });

  const remover = async (t) => {
    if (!window.confirm(`Apagar "${t.titulo}"?`)) return;
    await aoRemover(t.id);
  };

  const props = { hojeISO, permitirEditar, aoConcluir: concluir, aoEditar: editar, aoRemover: remover };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {permitirCriar && !form && (
          <button type="button" className="btn-primary" onClick={() => setForm({ ...VAZIA })}>
            <Plus size={15} strokeWidth={2.4} /> Nova tática
          </button>
        )}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <Filter size={14} className="text-slate-400" />
          <select className="input h-9 w-auto py-0 text-sm" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="">Todas as situações</option>
            {Object.entries(STATUS_TATICA).map(([id, s]) => <option key={id} value={id}>{s.rotulo}</option>)}
          </select>
          {(responsaveis.length > 1 || fResp) && (
            <select className="input h-9 w-auto py-0 text-sm" value={fResp} onChange={(e) => setFResp(e.target.value)}>
              <option value="">Todo mundo</option>
              {/* O nome escolhido no quadro do time pode nao estar na lista -- ou
                  estar com OUTRA grafia. A comparacao frouxa serve para filtrar,
                  mas o <select> do DOM casa a option por igualdade EXATA: se a
                  tatica diz "jessica souza" e o quadro manda "Jéssica Souza", sem
                  esta option o campo aparece VAZIO ao lado de uma lista filtrada.
                  Por isso o teste aqui e `includes`, nao `mesmaPessoa`. */}
              {fResp && !responsaveis.includes(fResp) && (
                <option value={fResp}>{fResp}</option>
              )}
              {responsaveis.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
        </span>
      </div>

      {form && (
        <Formulario
          inicial={form}
          objetivos={objetivos}
          exigeObjetivo={escopo === "empresa" && mostrarVinculoObjetivo}
          pessoas={pessoas.length ? pessoas : responsaveis}
          salvando={salvando}
          aoSalvar={salvar}
          aoFechar={() => setForm(null)}
        />
      )}

      {!visiveis.length && (
        <Empty>
          {taticas.length
            ? "Nenhuma tática com esse filtro."
            : "Nenhuma tática ainda. Comece pelo objetivo do ano e quebre em passos de 90 dias."}
        </Empty>
      )}

      {mostrarVinculoObjetivo
        ? grupos.filter((g) => g.taticas.length).map((g) => (
            <div key={g.id} className="mb-4">
              <p className="mb-2 font-display text-sm font-semibold text-slate-700">
                {g.titulo}
                <span className="ml-2 text-xs font-normal text-slate-500">
                  {g.abertas} em aberto · {g.concluidas} {g.concluidas === 1 ? "concluída" : "concluídas"}
                </span>
              </p>
              <div className="space-y-2">
                {g.taticas.map((t) => <Linha key={t.id} t={t} {...props} />)}
              </div>
            </div>
          ))
        : <div className="space-y-2">{visiveis.map((t) => <Linha key={t.id} t={t} {...props} />)}</div>}

      {/* Tatica sem objetivo nao some: ela sobrou de um plano encerrado ou de um
          objetivo apagado, e alguem precisa decidir o destino dela. */}
      {mostrarVinculoObjetivo && soltas.length > 0 && (
        <div className="rounded-xl border border-warn-200 bg-warn-50 p-3">
          <p className="mb-2 flex items-center gap-2 font-display text-sm font-semibold text-warn-700">
            <AlertTriangle size={15} /> Sem objetivo ({soltas.length})
          </p>
          <p className="mb-2 text-xs text-warn-700">
            Vieram de um plano encerrado ou de um objetivo removido. Edite cada uma e escolha
            a que objetivo do ano ela pertence agora.
          </p>
          <div className="space-y-2">
            {soltas.map((t) => <Linha key={t.id} t={t} {...props} />)}
          </div>
        </div>
      )}
    </div>
  );
}
