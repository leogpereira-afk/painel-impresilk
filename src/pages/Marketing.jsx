// Marketing: logomarcas e materiais de marca num lugar so, mais os atalhos do
// Drive para o que e grande demais para morar aqui (o servidor aceita ~3 MB
// por arquivo -- logo cabe; video de campanha, nao).
//
// Reusa a infra dos Documentos (painel-ativos) com tipo "marketing": item +
// arquivo. Os atalhos do Drive vivem no painel-config (chave "marketing").

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Upload,
  Download,
  Trash2,
  Plus,
  Link as LinkIcon,
  ArrowUpRight,
  Image as ImageIcon,
  FileText,
  AlertTriangle,
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
import { lerAtalhos, salvarAtalho, removerAtalho } from "../services/marketing.js";
import { Card, PageTitle, SectionTitle, Empty, CarregandoModulo } from "../components/ui.jsx";

const MAX_BYTES = 3 * 1024 * 1024; // o servidor barra ~4 MB de base64 (~3 MB reais)

const ehImagem = (nome) => /\.(png|jpe?g|gif|webp|svg)$/i.test(String(nome || ""));

export default function Marketing() {
  const [itens, setItens] = useState(null);
  const [atalhos, setAtalhos] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);

  // miniaturas: id -> data URL (so para imagens, carregadas depois da lista)
  const [thumbs, setThumbs] = useState({});

  useEffect(() => {
    let vivo = true;
    Promise.all([listarAtivos(), lerAtalhos()])
      .then(([lista, mapa]) => {
        if (!vivo) return;
        setItens(lista.filter((x) => x.tipo === "marketing"));
        setAtalhos(mapa);
      })
      .catch((e) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
  }, []);

  // Busca as miniaturas das imagens uma a uma, sem travar a lista.
  useEffect(() => {
    if (!itens) return;
    let vivo = true;
    (async () => {
      for (const it of itens) {
        if (!it.temArquivo || !ehImagem(it.arquivoNome) || thumbs[it.id]) continue;
        try {
          const r = await lerArquivo(it.id);
          if (!vivo) return;
          if (r?.base64) {
            setThumbs((t) => ({ ...t, [it.id]: `data:${r.mime || "image/png"};base64,${r.base64}` }));
          }
        } catch {
          /* miniatura e conforto; o download continua disponivel */
        }
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens]);

  // ---- materiais (upload / baixar / remover)
  const inputArquivo = useRef(null);
  const [nomeNovo, setNomeNovo] = useState("");
  const [subindo, setSubindo] = useState(false);

  const enviar = useCallback(
    async (e) => {
      e.preventDefault();
      setAviso(null);
      const file = inputArquivo.current?.files?.[0];
      if (!file) return setAviso({ tom: "erro", texto: "Escolha o arquivo." });
      if (file.size > MAX_BYTES) {
        return setAviso({
          tom: "erro",
          texto: "Arquivo acima de 3 MB. Coisas grandes vao para o Drive - use os atalhos ao lado.",
        });
      }
      setSubindo(true);
      try {
        const nome = nomeNovo.trim() || file.name.replace(/\.[^.]+$/, "");
        const item = await salvarAtivo({
          tipo: "marketing",
          nome,
          arquivoNome: file.name,
          temArquivo: true,
        });
        const base64 = await arquivoParaBase64(file);
        await guardarArquivo(item.id, base64, file.type, file.name);
        setItens((l) => [...(l || []), item]);
        setNomeNovo("");
        if (inputArquivo.current) inputArquivo.current.value = "";
        setAviso({ tom: "ok", texto: `"${nome}" guardado.` });
      } catch (err) {
        setAviso({ tom: "erro", texto: err.message });
      } finally {
        setSubindo(false);
      }
    },
    [nomeNovo]
  );

  const baixar = async (it) => {
    setAviso(null);
    try {
      const r = await lerArquivo(it.id);
      if (!r?.base64) throw new Error("Arquivo nao encontrado no servidor.");
      abrirBase64(r.base64, r.mime, r.nome || it.arquivoNome);
    } catch (err) {
      setAviso({ tom: "erro", texto: err.message });
    }
  };

  const remover = async (it) => {
    setAviso(null);
    try {
      await removerAtivo(it.id);
      setItens((l) => (l || []).filter((x) => x.id !== it.id));
    } catch (err) {
      setAviso({ tom: "erro", texto: err.message });
    }
  };

  // ---- atalhos do Drive
  const [nomeLink, setNomeLink] = useState("");
  const [urlLink, setUrlLink] = useState("");
  const [salvandoLink, setSalvandoLink] = useState(false);

  const adicionarLink = async (e) => {
    e.preventDefault();
    setAviso(null);
    const nome = nomeLink.trim();
    let url = urlLink.trim();
    if (!nome || !url) return setAviso({ tom: "erro", texto: "De um nome e cole o endereco do Drive." });
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    setSalvandoLink(true);
    try {
      const id = `ml-${Date.now()}`;
      await salvarAtalho(id, { nome, url });
      setAtalhos((m) => ({ ...(m || {}), [id]: { nome, url } }));
      setNomeLink("");
      setUrlLink("");
    } catch (err) {
      setAviso({ tom: "erro", texto: err.message });
    } finally {
      setSalvandoLink(false);
    }
  };

  const tirarLink = async (id) => {
    setAviso(null);
    try {
      await removerAtalho(id);
      setAtalhos((m) => {
        const novo = { ...(m || {}) };
        delete novo[id];
        return novo;
      });
    } catch (err) {
      setAviso({ tom: "erro", texto: err.message });
    }
  };

  if (erro) {
    return (
      <div className="space-y-6">
        <PageTitle titulo="Marketing" descricao="Logomarcas, materiais de marca e atalhos do Drive." />
        <Card className="flex items-start gap-2 text-sm text-bad-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {erro}
        </Card>
      </div>
    );
  }
  if (itens === null || atalhos === null) return <CarregandoModulo />;

  const listaAtalhos = Object.entries(atalhos)
    .map(([id, a]) => ({ id, ...a }))
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));

  return (
    <div className="space-y-8">
      <PageTitle
        titulo="Marketing"
        descricao="Logomarcas e materiais de marca prontos para baixar, e os atalhos do Drive para o que e maior."
      />

      {aviso && (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            aviso.tom === "ok" ? "bg-ok-50 text-ok-700" : "bg-bad-50 text-bad-700"
          }`}
        >
          {aviso.texto}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Materiais */}
        <Card>
          <SectionTitle
            titulo="Logomarcas e materiais"
            sub="Ate 3 MB por arquivo - logos, papel timbrado, assinaturas de e-mail."
          />

          {itens.length === 0 ? (
            <Empty>Nada guardado ainda. Suba a primeira logomarca abaixo.</Empty>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {itens.map((it) => (
                <div
                  key={it.id}
                  className="overflow-hidden rounded-xl border"
                  style={{ borderColor: "var(--hairline)" }}
                >
                  <div className="grid h-28 place-items-center bg-slate-50 dark:bg-slate-800/40">
                    {thumbs[it.id] ? (
                      <img src={thumbs[it.id]} alt={it.nome} className="max-h-24 max-w-[85%] object-contain" />
                    ) : ehImagem(it.arquivoNome) ? (
                      <ImageIcon size={26} className="text-slate-300" />
                    ) : (
                      <FileText size={26} className="text-slate-300" />
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 p-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-sm font-medium text-slate-800">
                        {it.nome}
                      </span>
                      <span className="block truncate text-xs text-slate-400">{it.arquivoNome}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => baixar(it)}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-brand"
                      title={`Baixar ${it.nome}`}
                    >
                      <Download size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => remover(it)}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-bad-50 hover:text-bad-700"
                      title={`Remover ${it.nome}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={enviar} className="mt-5 grid gap-3 border-t pt-4 sm:grid-cols-[1fr_auto_auto]" style={{ borderColor: "var(--hairline)" }}>
            <input
              className="input"
              placeholder="Nome (ex.: Logo horizontal fundo claro)"
              value={nomeNovo}
              onChange={(e) => setNomeNovo(e.target.value)}
            />
            <input ref={inputArquivo} type="file" className="input file:mr-2 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs" />
            <button className="btn-primary" disabled={subindo}>
              <Upload size={15} strokeWidth={2.4} />
              {subindo ? "Subindo..." : "Guardar"}
            </button>
          </form>
        </Card>

        {/* Atalhos do Drive */}
        <Card className="h-fit">
          <SectionTitle titulo="Atalhos do Drive" sub="Videos, campanhas e pastas grandes." />

          {listaAtalhos.length === 0 ? (
            <Empty>Nenhum atalho ainda.</Empty>
          ) : (
            <div className="space-y-1.5">
              {listaAtalhos.map((a) => (
                <div key={a.id} className="group flex items-center gap-1">
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-2 font-display text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                  >
                    <LinkIcon size={14} className="shrink-0 text-slate-400" />
                    <span className="min-w-0 flex-1 truncate">{a.nome}</span>
                    <ArrowUpRight size={13} className="shrink-0 text-slate-300" />
                  </a>
                  <button
                    type="button"
                    onClick={() => tirarLink(a.id)}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-slate-300 hover:bg-bad-50 hover:text-bad-700"
                    title={`Remover o atalho ${a.nome}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={adicionarLink} className="mt-4 grid gap-2 border-t pt-4" style={{ borderColor: "var(--hairline)" }}>
            <input
              className="input"
              placeholder="Nome (ex.: Fotos de obras)"
              value={nomeLink}
              onChange={(e) => setNomeLink(e.target.value)}
            />
            <input
              className="input"
              placeholder="Endereco no Drive"
              value={urlLink}
              onChange={(e) => setUrlLink(e.target.value)}
            />
            <button className="btn-primary justify-center" disabled={salvandoLink}>
              <Plus size={15} strokeWidth={2.4} />
              {salvandoLink ? "Salvando..." : "Adicionar atalho"}
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}
