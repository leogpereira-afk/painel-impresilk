// App shell: cabecalho fixo com a logomarca da Impresilk, navegacao, botao voltar
// e alternador de tema. Celular primeiro.

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
} from "lucide-react";
import logoColor from "../assets/brand/logo-color.png";
import logoWhite from "../assets/brand/logo-white.png";
import { useApp } from "../config/store.jsx";

const NAV = [
  { to: "/", rotulo: "Inicio", icone: Home, exato: true },
  { to: "/contas-atrasadas", rotulo: "Contas Atrasadas", icone: AlertTriangle },
  { to: "/fluxo-caixa", rotulo: "Fluxo de Caixa", icone: Wallet },
  { to: "/produtos", rotulo: "Produtos", icone: Package },
  { to: "/orcamentos", rotulo: "Orcamentos", icone: FileText },
  { to: "/configuracoes", rotulo: "Configuracoes", icone: Settings },
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

export default function Layout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [escuro, alternarTema] = useTema();
  const { modoDemo, atualizadoEm } = useApp();
  const naHome = location.pathname === "/";
  const f = modoDemo ? null : frescor(atualizadoEm);

  return (
    <div className="min-h-screen">
      <header className="glass sticky top-0 z-30 border-b" style={{ borderColor: "var(--hairline)" }}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex h-16 items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {!naHome && (
                <button
                  onClick={() => navigate(-1)}
                  className="btn-ghost -ml-2 h-9 w-9 shrink-0 rounded-lg p-0"
                  aria-label="Voltar"
                >
                  <ChevronLeft size={20} />
                </button>
              )}
              <Link to="/" className="flex items-center gap-3 min-w-0">
                <img src={logoColor} alt="Impresilk" className="h-7 w-auto dark:hidden" />
                <img src={logoWhite} alt="Impresilk" className="hidden h-7 w-auto dark:block" />
                <span className="hidden h-6 w-px bg-slate-200 sm:block" />
                <span className="hidden font-display text-sm font-semibold text-slate-500 sm:block">
                  Painel de Gestao
                </span>
              </Link>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {modoDemo && (
                <span className="chip-warn hidden sm:inline-flex">Modo demonstracao</span>
              )}
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

          {/* Navegacao: rola na horizontal no celular */}
          <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 [scrollbar-width:none]">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.exato}
                className={({ isActive }) =>
                  [
                    "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 font-display text-sm font-medium transition-all",
                    isActive
                      ? "bg-brand/10 text-brand"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-800",
                  ].join(" ")
                }
              >
                <n.icone size={16} strokeWidth={2.2} />
                {n.rotulo}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 animate-fade-in">{children}</main>

      <footer className="mx-auto max-w-6xl px-4 pb-8 pt-4 sm:px-6">
        <p className="text-center text-xs text-slate-400">
          Impresilk Solucoes Visuais · Painel de Gestao · dados do ERP Mubi (somente leitura)
        </p>
      </footer>
    </div>
  );
}
