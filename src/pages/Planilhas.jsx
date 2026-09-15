// Planilhas: as do Google que a casa mexe, abertas AQUI DENTRO.
//
// O molde é a aba Planilhas da Central do Léo, que ele já usa todo dia -- e o
// que se copia dela não é o desenho, é a inteligência:
//   1. o link colado vira id + aba, e o id nunca aparece no bundle público;
//   2. o quadro embutido é o editor do Google (`rm=minimal`), então quem pode
//      escrever escreve sem sair; quem quiser o Google inteiro tem o botão;
//   3. quando o Google RECUSA ser embutido, o quadro fica em `about:blank` e o
//      navegador NÃO avisa -- por isso a conferência, senão é tela branca muda.
//
// O que a Central não precisa e aqui é o ponto: o SETOR. Lá existe uma pessoa;
// aqui, dez contas. A lista que chega já vem podada pelo servidor -- esta tela
// desenha o que recebeu e não filtra nada, porque filtro de tela é conforto,
// não separação.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Pencil, Plus, Table2, Trash2 } from "lucide-react";
import { ehDirecao } from "../lib/sessao.js";
import { lerSetores } from "../services/patrimonio.js";
import {
  lerPlanilhas, salvarPlanilha, removerPlanilha,
  lerLinkDePlanilha, urlNoQuadro, urlNoGoogle, emOrdem,
} from "../services/planilhas.js";
import { Card, PageTitle, Empty, CarregandoModulo, ErroModulo } from "../components/ui.jsx";

/* O QUADRO. A conferência do `about:blank` é a peça que não se pode cortar:
   iframe recusado não dispara erro nenhum -- nem `onerror`, nem console. O que
   dá para ler é que o documento ficou em `about:blank`, que é mesma origem.
   Duas conferências: uma logo após o `onload` (recusa rápida) e outra aos 9s
   (o Google às vezes redireciona antes de desistir). */
function Quadro({ planilha, aoVoltar, aoEditar, podeEditar }) {
  const [recusado, setRecusado] = useState(false);
  const quadro = useRef(null);
  const frame = useRef(null);

  useEffect(() => {
    setRecusado(false);
    const f = frame.current;
    if (!f) return;
    let vivo = true;
    const conferir = () => {
      if (!vivo || !f.isConnected) return;
      try {
        const doc = f.contentDocument;
        if (doc && doc.location && doc.location.href === "about:blank") setRecusado(true);
      } catch { /* origem cruzada = o Google ACEITOU: é o caso bom */ }
    };
    const t1 = setTimeout(conferir, 400);
    const t2 = setTimeout(conferir, 9000);
    f.addEventListener("load", () => setTimeout(conferir, 400));
    return () => { vivo = false; clearTimeout(t1); clearTimeout(t2); };
  }, [planilha.docId, planilha.gid]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-ghost" onClick={aoVoltar}>← Todas as planilhas</button>
        <span className="flex-1 min-w-0" />
        {podeEditar && (
          <button className="btn-ghost" onClick={aoEditar}>
            <Pencil size={16} aria-hidden /> Editar atalho
          </button>
        )}
        <a className="btn-ghost" href={urlNoGoogle(planilha)} target="_blank" rel="noopener noreferrer">
          Abrir no Google <ArrowUpRight size={16} aria-hidden />
        </a>
      </div>

      <div ref={quadro} className="rounded-xl border border-slate-200 overflow-hidden bg-white" style={{ height: "72vh" }}>
        {recusado ? (
          <div className="h-full grid place-content-center gap-3 p-6 text-center">
            <p className="text-slate-600">O Google não deixou esta planilha ser aberta aqui dentro.</p>
            <a className="btn-primary justify-self-center" href={urlNoGoogle(planilha)} target="_blank" rel="noopener noreferrer">
              Abrir no Google <ArrowUpRight size={16} aria-hidden />
            </a>
          </div>
        ) : (
          <iframe
            ref={frame}
            title={`Planilha ${planilha.nome || ""}`}
            src={urlNoQuadro(planilha)}
            referrerPolicy="no-referrer-when-downgrade"
            style={{ width: "100%", height: "100%", border: 0 }}
          />
        )}
      </div>

      {/* A SEGUNDA TRANCA, dita onde ela morde. Sem esta frase a tela promete um
          controle que ela não tem: o Painel escolheu quem vê o atalho, mas quem
          libera o CONTEÚDO é o Google. */}
      <p className="text-sm text-slate-500">
        A edição usa a conta Google deste navegador — não o acesso que o Painel guarda.
        Se pedir permissão, entre no Google com uma conta que tenha a planilha.
      </p>
    </div>
  );
}

function Formulario({ inicial, setores, aoSalvar, aoFechar, aoRemover, salvando }) {
  const novo = !inicial;
  const [nome, setNome] = useState(inicial?.nome || "");
  const [setor, setSetor] = useState(inicial?.setor || "");
  const [link, setLink] = useState(inicial ? urlNoGoogle(inicial) : "");
  const [aviso, setAviso] = useState("");

  const enviar = (e) => {
    e.preventDefault();
    const dados = lerLinkDePlanilha(link);
    if (!nome.trim()) return setAviso("Dê um nome para reconhecer a planilha na lista.");
    if (!setor) return setAviso("Escolha o setor: é ele que decide quem enxerga esta planilha.");
    if (!dados) return setAviso("Esse link não é de uma planilha do Google. Abra a planilha e copie o endereço da barra do navegador.");
    setAviso("");
    aoSalvar({ nome: nome.trim(), setor, ...dados });
  };

  return (
    <Card>
      <form onSubmit={enviar} className="grid gap-4">
        <h3 className="font-semibold">{novo ? "Nova planilha" : "Editar planilha"}</h3>
        <fieldset disabled={salvando} className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1">
            Nome que aparece na lista
            <input className="input" required maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Caixinha" />
          </label>
          <label className="grid gap-1">
            Setor
            <select className="input" required value={setor} onChange={(e) => setSetor(e.target.value)}>
              <option value="">Escolha…</option>
              {setores.map((s) => (
                <option key={s.id} value={s.id}>{s.sigla} — {s.nome}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 sm:col-span-2">
            Link da planilha
            <input className="input" required value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" />
            {/* Dito no lugar onde a decisão acontece, não num rodapé. */}
            <span className="text-sm text-slate-500">
              O endereço fica guardado no servidor, nunca no código do site — que é público.
              Quem enxerga esta planilha no Painel é quem tiver o setor escolhido acima.
            </span>
          </label>
        </fieldset>
        {aviso && <p role="alert" className="text-sm text-rose-700">{aviso}</p>}
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
          <button type="button" className="btn-ghost" onClick={aoFechar} disabled={salvando}>Cancelar</button>
          {!novo && (
            <button type="button" className="btn-ghost text-rose-700" disabled={salvando} onClick={aoRemover}>
              <Trash2 size={16} aria-hidden /> Tirar da lista
            </button>
          )}
        </div>
      </form>
    </Card>
  );
}

export default function Planilhas({ sessao }) {
  const [mapa, setMapa] = useState(null);
  const [setoresMapa, setSetoresMapa] = useState(null);
  const [erro, setErro] = useState(null);
  const [aberta, setAberta] = useState(null);   // id
  const [form, setForm] = useState(null);       // {id} | {novo:true} | null
  const [salvando, setSalvando] = useState(false);
  // `ehDirecao` e master-only (sessao.js:138) -- e e exatamente o que a porta
  // exige para cadastrar planilha e conceder setor. As duas reguas batem.
  const direcao = ehDirecao(sessao);

  const pedido = useRef(0);
  const carregar = useCallback(async () => {
    const meu = ++pedido.current;
    try {
      const [p, s] = await Promise.all([lerPlanilhas(), lerSetores()]);
      if (meu !== pedido.current) return;
      setMapa(p); setSetoresMapa(s); setErro(null);
    } catch (e) {
      if (meu !== pedido.current) return;
      setErro(e.message);
    }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const setores = useMemo(
    () => Object.entries(setoresMapa || {})
      .map(([id, s]) => ({ id, sigla: s?.sigla || id, nome: s?.nome || "" }))
      .sort((a, b) => a.sigla.localeCompare(b.sigla, "pt-BR", { sensitivity: "base" })),
    [setoresMapa],
  );
  const nomeDoSetor = useCallback(
    (id) => { const s = setores.find((x) => x.id === id); return s ? `${s.sigla} — ${s.nome}` : id || "sem setor"; },
    [setores],
  );

  const lista = useMemo(
    () => emOrdem(Object.entries(mapa || {}).map(([id, p]) => ({ id, ...p }))),
    [mapa],
  );
  // Agrupa por setor, na ordem da sigla. Quem tem um setor só vê um grupo — e é
  // por isso que o cabeçalho de grupo aparece mesmo com um: ele diz POR QUE
  // aquela planilha está ali.
  const grupos = useMemo(() => {
    const por = new Map();
    for (const p of lista) {
      const k = p.setor || "";
      if (!por.has(k)) por.set(k, []);
      por.get(k).push(p);
    }
    return [...por.entries()].sort((a, b) => nomeDoSetor(a[0]).localeCompare(nomeDoSetor(b[0]), "pt-BR", { sensitivity: "base" }));
  }, [lista, nomeDoSetor]);

  async function gravar(dados) {
    setSalvando(true);
    try {
      const id = form?.id || `pl-${crypto.randomUUID()}`;
      setMapa(await salvarPlanilha(id, dados));
      setForm(null); setErro(null);
    } catch (e) { setErro(e.message); }
    finally { setSalvando(false); }
  }

  async function tirar(id, nome) {
    if (!window.confirm(`Tirar “${nome || "esta planilha"}” da lista?\n\nA planilha continua no Google, intacta. Sai só o atalho daqui.`)) return;
    setSalvando(true);
    try {
      await removerPlanilha(id);
      if (aberta === id) setAberta(null);
      setForm(null);
      await carregar();
    } catch (e) { setErro(e.message); }
    finally { setSalvando(false); }
  }

  if (erro && mapa === null) return <ErroModulo mensagem={erro} aoTentar={carregar} />;
  if (mapa === null || setoresMapa === null) return <CarregandoModulo />;

  const planilhaAberta = lista.find((p) => p.id === aberta);
  const emEdicao = form?.id ? lista.find((p) => p.id === form.id) : null;

  return (
    <div className="grid gap-4">
      <PageTitle
        titulo="Planilhas"
        descricao="As planilhas do Google que a casa mexe, abertas aqui dentro. Cada uma pertence a um setor, e só quem tem o setor a enxerga."
      />
      {erro && <p role="alert" className="text-sm text-rose-700">{erro}</p>}

      {planilhaAberta ? (
        <Quadro
          planilha={planilhaAberta}
          podeEditar={direcao}
          aoVoltar={() => setAberta(null)}
          aoEditar={() => { setAberta(null); setForm({ id: planilhaAberta.id }); }}
        />
      ) : form ? (
        <Formulario
          inicial={emEdicao}
          setores={setores}
          salvando={salvando}
          aoSalvar={gravar}
          aoFechar={() => setForm(null)}
          aoRemover={() => tirar(emEdicao.id, emEdicao.nome)}
        />
      ) : (
        <>
          {direcao && (
            <div>
              <button className="btn-primary" onClick={() => setForm({ novo: true })}>
                <Plus size={16} aria-hidden /> Nova planilha
              </button>
            </div>
          )}

          {!lista.length ? (
            <Empty>
              <p className="font-medium text-slate-700">
                {direcao ? "Nenhuma planilha cadastrada" : "Nenhuma planilha no seu setor"}
              </p>
              <p className="mt-1">
                {direcao
                  ? "Clique em “Nova planilha”, cole o link e escolha o setor — ela passa a abrir por aqui."
                  : "Aparecem aqui as planilhas dos setores que a direção liberou para você."}
              </p>
            </Empty>
          ) : (
            grupos.map(([setorId, itens]) => (
              <section key={setorId || "sem-setor"} className="grid gap-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  {nomeDoSetor(setorId)}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {itens.map((p) => (
                    <Card key={p.id} className="flex items-center gap-3">
                      <button className="flex flex-1 min-w-0 items-center gap-3 text-left" onClick={() => setAberta(p.id)}>
                        <Table2 size={20} aria-hidden className="shrink-0 text-emerald-600" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{p.nome || "sem nome"}</span>
                          <span className="block text-sm text-slate-500">abrir e editar aqui</span>
                        </span>
                      </button>
                      {direcao && (
                        <button
                          className="btn-ghost shrink-0"
                          aria-label={`Editar ${p.nome || "planilha"}`}
                          title="Renomear, trocar o setor ou o link"
                          onClick={() => setForm({ id: p.id })}
                        >
                          <Pencil size={16} aria-hidden />
                        </button>
                      )}
                    </Card>
                  ))}
                </div>
              </section>
            ))
          )}
        </>
      )}
    </div>
  );
}
