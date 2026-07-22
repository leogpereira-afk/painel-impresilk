// App shell: barra LATERAL com a navegacao, os numeros de cada modulo e os
// atalhos para os outros sistemas da Impresilk.
//
// Por que lateral: com o numero de cada modulo ao lado do nome, o CEO ve o
// estado da empresa inteira de qualquer tela -- nao so na Home. Foi o que
// permitiu aposentar os quatro cartoes grandes: eles eram navegacao E numero,
// e a lateral faz os dois o tempo todo, sem ocupar a tela de trabalho.
//
// Celular: a lateral vira gaveta (menu no topo). Impressao: some (.sem-impressao).

import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate, Link } from "react-router-dom";
import {
  ChevronLeft,
  Home,
  AlertTriangle,
  Wallet,
  Package,
  FileText,
  Settings,
  Moon,
  Sun,
  Clock,
  Menu,
  X,
  Users,
  BarChart3,
  ArrowUpRight,
} from "lucide-react";
import logoColor from "../assets/brand/logo-color.png";
import logoWhite from "../assets/brand/logo-white.png";
import { useApp } from "../config/store.jsx";
import { calcContasAtrasadas } from "../lib/calc/contasAtrasadas.js";
import { calcFluxoCaixa } from "../lib/calc/fluxoCaixa.js";
import { calcProdutos } from "../lib/calc/produtos.js";
import { calcOrcamentos } from "../lib/calc/orcamentos.js";
import { moeda } from "../lib/format.js";

const NAV = [
  { to: "/", rotulo: "Inicio", icone: Home, exato: true },
  { to: "/contas-atrasadas", rotulo: "Contas Atrasadas", icone: AlertTriangle, chave: "contas" },
  { to: "/fluxo-caixa", rotulo: "Fluxo de Caixa", icone: Wallet, chave: "fluxo" },
  { to: "/produtos", rotulo: "Produtos", icone: Package, chave: "produtos" },
  { to: "/orcamentos", rotulo: "Orcamentos", icone: FileText, chave: "orcamentos" },
];

// Outros sistemas da Impresilk. Abrem em outra aba: o painel fica aberto atras.
const SISTEMAS = [
  { rotulo: "DRE", icone: BarChart3, href: "https://impresilk-dre.netlify.app/" },
  { rotulo: "RH", icone: Users, href: "https://impresilkrh.netlify.app/" },
];

function useTema() {
  const [escuro, setEscuro] = useState(() => {
    const s = localStorage.getItem("painel_tema");
    if (s) return s === "escuro";
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches || false;
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", escuro);
    localStorage.setItem("painel_tema", escuro ? "escuro" : "claro");
  }, [escuro]);
  return [escuro, () => setEscuro((v) => !v)];
}

// Frescor do cache: HH:MM de Sao Paulo e se ja passou de 40 min (fica ambar).
function frescor(iso) {
  if (!iso) return null;
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return null;
  const idadeMin = Math.round((Date.now() - dt.getTime()) / 60000);
  const hhmm = dt.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
  return { hhmm, velho: idadeMin > 40, idadeMin };
}

// Numero-resumo de cada modulo, para a lateral. `tom` pinta so quando ha algo
// errado: se tudo fosse colorido, nada saltaria.
function useResumos() {
  const { config, dados, overridesRecebiveis, overridesOrcamentos } = useApp();
  return useMemo(() => {
    if (!dados) return null;
    try {
      const contas = calcContasAtrasadas(
        dados.recebiveis,
        overridesRecebiveis,
        config,
        dados.dsoHist,
        dados.ordens
      );
      const fluxo = calcFluxoCaixa(
        { pagar: dados.pagar, recebiveis: dados.recebiveis, bancos: dados.bancos },
        config
      );
      const produtos = calcProdutos(dados.ordens, dados.catalogo, config);
      const orcamentos = calcOrcamentos(dados.orcamentos, overridesOrcamentos, config);
      const menor15 = fluxo.kpis.menorSaldo15;
      return {
        contas: {
          valor: moeda(contas.kpis.totalAtrasado),
          tom: contas.kpis.totalAtrasado > 0 ? "bad" : "ok",
        },
        fluxo: {
          valor: moeda(menor15),
          tom: menor15 < config.parametros.colchaoMinimo ? "bad" : "ok",
        },
        produtos: {
          valor: produtos.lider ? produtos.lider.nome : "-",
          tom: produtos.liderEmQueda ? "bad" : "ok",
        },
        orcamentos: {
          valor: moeda(orcamentos.kpis.naMesaValor),
          tom: orcamentos.kpis.conversao >= 40 ? "ok" : "warn",
        },
      };
    } catch {
      return null; // um calculo quebrado nao pode derrubar a navegacao
    }
  }, [dados, config, overridesRecebiveis, overridesOrcamentos]);
}

const TOM_TEXTO = {
  bad: "text-bad-700",
  warn: "text-warn-700",
  ok: "text-slate-500",
};

function ConteudoLateral({ resumos, aoNavegar }) {
  return (
    <>
      <Link to="/" onClick={aoNavegar} className="flex items-center gap-2.5 px-3 py-1">
        <img src={logoColor} alt="Impresilk" className="h-7 w-auto dark:hidden" />
        <img src={logoWhite} alt="Impresilk" className="hidden h-7 w-auto dark:block" />
      </Link>
      <p className="mb-4 mt-2 px-3 font-display text-xs font-semibold uppercase tracking-wide text-slate-400">
        Painel de Gestao
      </p>

      <nav className="space-y-0.5">
        {NAV.map((n) => {
          const r = n.chave && resumos ? resumos[n.chave] : null;
          return (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.exato}
              onClick={aoNavegar}
              className={({ isActive }) =>
                [
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 font-display text-sm font-medium transition-all",
                  isActive
                    ? "bg-brand/10 text-brand"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                ].join(" ")
              }
            >
              <n.icone size={17} strokeWidth={2.2} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">{n.rotulo}</span>
              {r && (
                <span
                  className={`shrink-0 tnum text-xs font-semibold ${TOM_TEXTO[r.tom] || TOM_TEXTO.ok}`}
                  title={r.valor}
                >
                  {r.valor}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Outros sistemas: logo abaixo da navegacao, sempre a um clique. */}
      <p className="mb-1.5 mt-6 px-3 font-display text-xs font-semibold uppercase tracking-wide text-slate-400">
        Sistemas
      </p>
      <nav className="space-y-0.5">
        {SISTEMAS.map((s) => (
          <a
            key={s.rotulo}
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-2.5 rounded-lg px-3 py-2 font-display text-sm font-medium text-slate-600 transition-all hover:bg-slate-100 hover:text-slate-900"
          >
            <s.icone size={17} strokeWidth={2.2} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">{s.rotulo}</span>
            <ArrowUpRight
              size={14}
              className="shrink-0 text-slate-300 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand"
            />
          </a>
        ))}
      </nav>

      {/* Configuracoes fica no rodape da lateral: e ajuste, nao rotina. */}
      <div className="mt-auto pt-6">
        <NavLink
          to="/configuracoes"
          onClick={aoNavegar}
          className={({ isActive }) =>
            [
              "flex items-center gap-2.5 rounded-lg px-3 py-2 font-display text-sm font-medium transition-all",
              isActive
                ? "bg-brand/10 text-brand"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
            ].join(" ")
          }
        >
          <Settings size={17} strokeWidth={2.2} className="shrink-0" />
          Configuracoes
        </NavLink>
      </div>
    </>
  );
}

export default function Layout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [escuro, alternarTema] = useTema();
  const { modoDemo, atualizadoEm } = useApp();
  const [menuAberto, setMenuAberto] = useState(false);
  const naHome = location.pathname === "/";
  const f = modoDemo ? null : frescor(atualizadoEm);
  const resumos = useResumos();

  // Troca de rota fecha a gaveta (senao ela fica por cima do conteudo novo).
  useEffect(() => {
    setMenuAberto(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen lg:flex">
      {/* Lateral fixa no desktop */}
      <aside
        className="sem-impressao hidden w-60 shrink-0 flex-col border-r bg-white px-3 py-4 lg:sticky lg:top-0 lg:flex lg:h-screen"
        style={{ borderColor: "var(--hairline)" }}
      >
        <ConteudoLateral resumos={resumos} />
      </aside>

      {/* Gaveta no celular */}
      {menuAberto && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setMenuAberto(false)}
            aria-hidden="true"
          />
          <aside
            className="absolute left-0 top-0 flex h-full w-64 flex-col overflow-y-auto border-r bg-white px-3 py-4"
            style={{ borderColor: "var(--hairline)" }}
          >
            <button
              onClick={() => setMenuAberto(false)}
              className="btn-ghost absolute right-2 top-2 h-9 w-9 rounded-lg p-0"
              aria-label="Fechar menu"
            >
              <X size={18} />
            </button>
            <ConteudoLateral resumos={resumos} aoNavegar={() => setMenuAberto(false)} />
          </aside>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <header
          className="glass sem-impressao sticky top-0 z-30 border-b"
          style={{ borderColor: "var(--hairline)" }}
        >
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <button
                onClick={() => setMenuAberto(true)}
                className="btn-ghost -ml-2 h-9 w-9 shrink-0 rounded-lg p-0 lg:hidden"
                aria-label="Abrir menu"
              >
                <Menu size={20} />
              </button>
              {/* Logo so no celular: no desktop ela ja esta na lateral. */}
              <Link to="/" className="flex items-center gap-2 lg:hidden">
                <img src={logoColor} alt="Impresilk" className="h-6 w-auto dark:hidden" />
                <img src={logoWhite} alt="Impresilk" className="hidden h-6 w-auto dark:block" />
              </Link>
              {!naHome && (
                <button
                  onClick={() => navigate(-1)}
                  className="btn-ghost hidden h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm lg:inline-flex"
                  aria-label="Voltar"
                >
                  <ChevronLeft size={18} /> Voltar
                </button>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {modoDemo && <span className="chip-warn hidden sm:inline-flex">Modo demonstracao</span>}
              {f && (
                <span
                  className={`hidden items-center gap-1.5 sm:inline-flex ${f.velho ? "chip-warn" : "chip"}`}
                  title={`Dados do cache do Mubisys, ${f.idadeMin} min atras`}
                >
                  <Clock size={13} />
                  {f.velho ? `dados de ${f.hhmm} (atrasado)` : `dados de ${f.hhmm}`}
                </span>
              )}
              <button
                onClick={alternarTema}
                className="btn-ghost h-9 w-9 rounded-lg p-0"
                aria-label="Alternar tema"
              >
                {escuro ? <Sun size={18} /> : <Moon size={18} />}
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl animate-fade-in px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>

        <footer className="sem-impressao mx-auto max-w-6xl px-4 pb-8 pt-4 sm:px-6">
          <p className="text-center text-xs text-slate-400">
            Impresilk Solucoes Visuais · Painel de Gestao · dados do ERP Mubi (somente leitura)
          </p>
        </footer>
      </div>
    </div>
  );
}
