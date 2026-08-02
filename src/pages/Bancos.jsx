// Bancos e Pix: contas, CNPJs e chaves de todas as empresas (e do Leo PF) para
// copiar com um clique no dia a dia -- pagar, receber, preencher cadastro.
//
// Espelho da aba Bancos do DRE. Os dados moram em src/data/bancos.js (que tem
// um gemeo no DRE -- ver o aviso la). Nada vem do servidor: e consulta pura.

import { useMemo, useRef, useState } from "react";
import { ChevronDown, Copy, Check, Search, X } from "lucide-react";
import { BANCOS } from "../data/bancos.js";
import { Card, PageTitle } from "../components/ui.jsx";

const ABERTOS_KEY = "painel_bancos_abertos";

const ehCPF = (doc) => /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(doc);

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
  const [busca, setBusca] = useState("");
  const [copiado, setCopiado] = useState(null); // chave "idx-rotulo" do ultimo copiado
  const timer = useRef(null);

  const [abertos, setAbertos] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(ABERTOS_KEY) || "null") || {};
    } catch {
      return {};
    }
  });

  const grupos = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const lista = [];
    BANCOS.forEach((b, idx) => {
      const blob = `${b.grupo} ${b.banco} ${b.titular} ${b.doc} ${b.agencia} ${b.conta} ${b.pix} ${b.pixTipo}`.toLowerCase();
      if (q && !blob.includes(q)) return;
      let g = lista.find((x) => x.nome === b.grupo);
      if (!g) {
        g = { nome: b.grupo, itens: [] };
        lista.push(g);
      }
      g.itens.push({ ...b, idx });
    });
    return lista;
  }, [busca]);

  const buscando = !!busca.trim();

  // O 1o grupo (a empresa) comeca aberto; o resto lembra a escolha do aparelho.
  const estaAberto = (nome, i) => {
    if (buscando) return true; // busca sem abrir o grupo seria achar e esconder
    if (nome in abertos) return !!abertos[nome];
    return i === 0;
  };

  const alternar = (nome, i) => {
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
        return; // sem clipboard nao ha o que fazer; o valor esta na tela
      }
    }
    setCopiado(chave);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopiado(null), 1600);
  };

  return (
    <div className="space-y-6">
      <PageTitle
        titulo="Bancos e Pix"
        descricao="Contas, CNPJs e chaves de todas as empresas. Clique em qualquer valor para copiar."
      />

      <div className="relative max-w-md">
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

      {grupos.length === 0 && (
        <p className="text-sm text-slate-500">Nada com &quot;{busca}&quot; — confira a grafia.</p>
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
              <span className="chip">{g.itens.length} {g.itens.length === 1 ? "conta" : "contas"}</span>
            </button>

            {aberto && (
              <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-3">
                {g.itens.map((b) => (
                  <div
                    key={b.idx}
                    className="rounded-xl border p-3.5"
                    style={{ borderColor: "var(--hairline)" }}
                  >
                    <p className="font-display text-sm font-semibold text-slate-900">{b.banco}</p>
                    <p className="mb-2 text-xs text-slate-500">{b.titular}</p>
                    <Valor
                      rotulo={ehCPF(b.doc) ? "CPF" : "CNPJ"}
                      valor={b.doc}
                      copiado={copiado === `${b.idx}-doc`}
                      aoCopiar={() => copiar(b.doc, `${b.idx}-doc`)}
                    />
                    <Valor
                      rotulo="Agencia"
                      valor={b.agencia}
                      copiado={copiado === `${b.idx}-ag`}
                      aoCopiar={() => copiar(b.agencia, `${b.idx}-ag`)}
                    />
                    <Valor
                      rotulo="Conta"
                      valor={b.conta}
                      copiado={copiado === `${b.idx}-cc`}
                      aoCopiar={() => copiar(b.conta, `${b.idx}-cc`)}
                    />
                    {b.pix ? (
                      <Valor
                        rotulo={`Pix (${b.pixTipo})`}
                        valor={b.pix}
                        copiado={copiado === `${b.idx}-pix`}
                        aoCopiar={() => copiar(b.pix, `${b.idx}-pix`)}
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
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
