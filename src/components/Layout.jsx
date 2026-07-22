// App shell: barra LATERAL com a navegacao e os atalhos para os outros sistemas
// da Impresilk. So navegacao: os numeros ficam dentro de cada modulo, para a
// lateral nao virar um painel dentro do painel.
//
// Celular: a lateral vira gaveta (menu no topo). Impressao: some (.sem-impressao).

import { useEffect, useState } from "react";
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
  ClipboardList,
  Ruler,
  ArrowUpRight,
  LogOut,
  RefreshCw,
  KeyRound,
  FileCheck2,
} from "lucide-react";
import logoColor from "../assets/brand/logo-color.png";
import logoWhite from "../assets/brand/logo-white.png";
import { useApp } from "../config/store.jsx";
import { podeAbrir, sair } from "../lib/sessao.js";

const NAV = [
  { to: "/", rotulo: "Inicio", icone: Home, exato: true },
  { to: "/contas-atrasadas", rotulo: "Contas Atrasadas", icone: AlertTriangle, modulo: "contas-atrasadas" },
  { to: "/fluxo-caixa", rotulo: "Fluxo de Caixa", icone: Wallet, modulo: "fluxo-caixa" },
  { to: "/produtos", rotulo: "Produtos", icone: Package, modulo: "produtos" },
  { to: "/orcamentos", rotulo: "Orcamentos", icone: FileText, modulo: "orcamentos" },
  { to: "/documentos", rotulo: "Documentos e ativos", icone: FileCheck2 },
];

// Outros sistemas da Impresilk. Abrem em outra aba: o painel fica aberto atras.
//
// PCP aponta para pcpimpresilk (o endereco de producao documentado no kit de
// sincronizacao) e NAO para impresilk-instalacao, que e a copia antiga.
const SISTEMAS = [
  { rotulo: "DRE", icone: BarChart3, href: "https://impresilk-dre.netlify.app/" },
  { rotulo: "RH", icone: Users, href: "https://impresilkrh.netlify.app/" },
  { rotulo: "PCP", icone: ClipboardList, href: "https://pcpimpresilk.netlify.app/" },
  { rotulo: "Brief de Medicao", icone: Ruler, href: "https://brief-impresilk.netlify.app/" },
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

function ConteudoLateral({ aoNavegar, sessao }) {
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
        {NAV.filter((n) => !n.modulo || podeAbrir(n.modulo, sessao)).map((n) => (
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
          </NavLink>
        ))}
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

      {/* Rodape: ajuste (nao rotina) e a identidade de quem esta logado. */}
      <div className="mt-auto space-y-0.5 pt-6">
        <NavLink
          to="/acessos"
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
          <KeyRound size={17} strokeWidth={2.2} className="shrink-0" />
          {sessao?.master ? "Acessos" : "Minha senha"}
        </NavLink>

        {podeAbrir("configuracoes", sessao) && (
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
        )}

        {sessao && (
          <div
            className="mt-2 flex items-center gap-2 border-t px-3 pt-3"
            style={{ borderColor: "var(--hairline)" }}
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand/10 font-display text-xs font-bold text-brand">
              {String(sessao.nome || sessao.usuario).slice(0, 2).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display text-sm font-medium text-slate-800">
                {sessao.nome || sessao.usuario}
              </span>
              <span className="block text-xs text-slate-400">
                {sessao.master ? "Direcao" : "Acesso limitado"}
              </span>
            </span>
            <button
              onClick={sair}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-bad-700"
              title="Sair do painel"
              aria-label="Sair do painel"
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
      </div>
    </>
  );
}

export default function Layout({ children, sessao }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [escuro, alternarTema] = useTema();
  const { modoDemo, atualizadoEm, recarregar, carregando } = useApp();
  const [menuAberto, setMenuAberto] = useState(false);
  const naHome = location.pathname === "/";
  const f = modoDemo ? null : frescor(atualizadoEm);

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
        <ConteudoLateral sessao={sessao} />
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
            <ConteudoLateral sessao={sessao} aoNavegar={() => setMenuAberto(false)} />
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
              {/* Sincronizar: rebusca os dados agora. O cache do servidor se
                  atualiza sozinho a cada 20 min, mas quem acabou de mexer no
                  ERP quer ver o efeito sem esperar (ou sem apertar F5). */}
              <button
                onClick={() => recarregar()}
                disabled={carregando}
                className="btn-ghost h-9 w-9 rounded-lg p-0 disabled:opacity-50"
                title={carregando ? "Sincronizando..." : "Sincronizar os dados agora"}
                aria-label="Sincronizar os dados"
              >
                <RefreshCw size={17} className={carregando ? "animate-spin" : ""} />
              </button>
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
