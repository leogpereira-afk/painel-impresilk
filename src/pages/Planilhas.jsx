// Planilhas: as do Google que a casa mexe, abertas AQUI DENTRO.
//
// O molde é a aba Planilhas da Central do Léo, que ele já usa todo dia -- e o
// que se copia dela não é o desenho, é a inteligência:
//   1. o link colado vira id + aba, e o id nunca aparece no bundle público;
//   2. o link colado vira id + aba, e a lista mora no servidor;
//   3. a ordem alfabética numa CÓPIA, para não mexer no que veio guardado.
//
// O QUE NÃO SE COPIA DELA: o quadro embutido. Medido em 16/09/2026, no mesmo
// navegador e com a mesma conta: a planilha abre inteira como ABA, e fica em
// BRANCO dentro de um iframe -- nas cinco formas (`/edit`, `/edit?rm=minimal`,
// `/preview`, `/htmlembed`, `/pubhtml`), com HTTP 200 e sem uma linha de erro no
// console. O Google não roda o editor dentro de outro site. A aba Planilhas da
// Central tem o mesmo quadro branco embaixo da frase "editando aqui dentro" --
// ninguém percebeu porque branco parece "carregando".
//
// `pubhtml` é o único que embeda de verdade, e exige PUBLICAR NA WEB: tornaria a
// Caixinha pública para a internet. É o contrário do que este módulo existe para
// fazer. Então o cartão abre numa ABA, que é o que funciona -- e a tela diz isso
// antes do clique, em vez de entregar um retângulo branco.
//
// O que a Central não precisa e aqui é o ponto: o SETOR. Lá existe uma pessoa;
// aqui, dez contas. A lista que chega já vem podada pelo servidor -- esta tela
// desenha o que recebeu e não filtra nada, porque filtro de tela é conforto,
// não separação.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import "./planilhas.css";
import { ehDirecao } from "../lib/sessao.js";
import { lerSetores } from "../services/patrimonio.js";
import {
  lerPlanilhas, salvarPlanilha, removerPlanilha,
  lerLinkDePlanilha, urlNoGoogle, emOrdem,
} from "../services/planilhas.js";
import { Card, PageTitle, Empty, CarregandoModulo, ErroModulo } from "../components/ui.jsx";

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
      setForm(null);
      await carregar();
    } catch (e) { setErro(e.message); }
    finally { setSalvando(false); }
  }

  if (erro && mapa === null) return <ErroModulo mensagem={erro} aoTentar={carregar} />;
  if (mapa === null || setoresMapa === null) return <CarregandoModulo />;

  const emEdicao = form?.id ? lista.find((p) => p.id === form.id) : null;

  return (
    <div className="grid gap-4">
      <PageTitle
        titulo="📊 Planilhas"
        descricao="As que a casa mexe, reunidas por setor — só quem tem o setor enxerga a planilha. O clique abre no Google, numa aba nova: o Google não roda o editor dentro de outro site."
      />
      {erro && <p role="alert" className="text-sm text-rose-700">{erro}</p>}

      {form ? (
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
                <Plus size={16} aria-hidden /> Planilha
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
                  ? "Clique em “Planilha”, cole o link e escolha o setor — ela passa a aparecer aqui para quem tiver o setor."
                  : "Aparecem aqui as planilhas dos setores que a direção liberou para você."}
              </p>
            </Empty>
          ) : (
            grupos.map(([setorId, itens]) => (
              <section key={setorId || "sem-setor"} className="grid gap-2">
                <h3 className="pl-setor">
                  {nomeDoSetor(setorId)}
                </h3>
                <div className="pl-grade">
                  {itens.map((p) => (
                    /* DOIS BOTÕES IRMÃOS, nunca um dentro do outro: botão dentro
                       de botão o navegador desmonta, e o clique passa a cair em
                       lugar errado. É a mesma montagem da Central. */
                    <div key={p.id} className="pl-cel">
                      {/* LINK DE VERDADE, não botão: assim valem cmd+clique,
                          "abrir em nova aba", copiar o endereço e favoritar --
                          hábitos de quem abre a mesma planilha todo dia. */}
                      <a className="pl-cartao" title={p.nome || ""}
                         href={urlNoGoogle(p)} target="_blank" rel="noopener noreferrer">
                        <span className="ic" aria-hidden>📊</span>
                        <span style={{ minWidth: 0 }}>
                          <span className="nm block">{p.nome || "sem nome"}</span>
                          <span className="sub block">abrir no Google ↗</span>
                        </span>
                      </a>
                      {direcao && (
                        <button
                          className="pl-lapis"
                          aria-label={`Editar “${p.nome || "sem nome"}”`}
                          title="Renomear, trocar o setor ou o link"
                          onClick={() => setForm({ id: p.id })}
                        >✏️</button>
                      )}
                    </div>
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
