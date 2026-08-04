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
  LayoutGrid,
  Globe,
  UserCircle,
  HardHat,
  Building2,
  ChevronDown,
  Landmark,
  Megaphone,
  Gavel,
  ShoppingCart,
  BookOpen,
} from "lucide-react";
import logoColor from "../assets/brand/logo-color.png";
import logoWhite from "../assets/brand/logo-white.png";
import { useApp } from "../config/store.jsx";
import { podeAbrir, sair } from "../lib/sessao.js";

// Inicio fica solto no topo; o resto vive dentro do grupo "Gestao", que abre e
// fecha. Assim a lateral cabe numa tela de celular sem rolagem e os atalhos
// para os outros sistemas ficam sempre visiveis.
const INICIO = { to: "/", rotulo: "Inicio", icone: Home, exato: true };

const GESTAO = [
  { to: "/contas-atrasadas", rotulo: "Contas Atrasadas", icone: AlertTriangle, modulo: "contas-atrasadas" },
  { to: "/fluxo-caixa", rotulo: "Fluxo de Caixa", icone: Wallet, modulo: "fluxo-caixa" },
  { to: "/produtos", rotulo: "Produtos", icone: Package, modulo: "produtos" },
  { to: "/orcamentos", rotulo: "Orcamentos", icone: FileText, modulo: "orcamentos" },
  { to: "/bancos", rotulo: "Bancos e Pix", icone: Landmark, modulo: "bancos" },
  { to: "/marketing", rotulo: "Marketing", icone: Megaphone, modulo: "marketing" },
  { to: "/licitacoes", rotulo: "Licitacoes", icone: Gavel, modulo: "licitacoes" },
  { to: "/documentos", rotulo: "Documentos e ativos", icone: FileCheck2 },
];

// Outros sistemas da Impresilk. Abrem em outra aba: o painel fica aberto atras.
//
// Os enderecos sao os atalhos do dominio da empresa, que redirecionam para o
// GitHub Pages. Passar pelo atalho e de proposito: se um sistema mudar de casa
// de novo, muda so o redirecionamento -- nenhum link aqui dentro envelhece.
const SISTEMAS = [
  { rotulo: "DRE", icone: BarChart3, href: "https://impresilk.com.br/dre" },
  { rotulo: "RH", icone: Users, href: "https://impresilk.com.br/rh" },
  { rotulo: "PCP", icone: ClipboardList, href: "https://impresilk.com.br/pcp" },
  { rotulo: "Compras", icone: ShoppingCart, href: "https://impresilk.com.br/compras" },
  { rotulo: "Brief de Medicao", icone: Ruler, href: "https://impresilk.com.br/brief" },
  { rotulo: "Pops & Fabricacao", icone: BookOpen, href: "https://impresilk.com.br/pops" },
  { rotulo: "Capa dos sistemas", icone: LayoutGrid, href: "https://leogpereira-afk.github.io/" },
  { rotulo: "Site Impresilk", icone: Globe, href: "https://www.impresilk.com.br" },
  // Painel pessoal do dono: so aparece para a direcao, nao e sistema da empresa.
  { rotulo: "Central do Leo", icone: UserCircle, href: "https://leogpereira-afk.github.io/vida-leo/", soDirecao: true },
];

// Outra empresa do dono. Ficam num bloco separado no pe da lateral para nao se
// misturarem com os sistemas da Impresilk -- e so a direcao enxerga.
//
// A Domo mudou de casa em 31/07: o endereco no Netlify hoje e so um aviso de
// mudanca. O Diamond continua no Netlify.
const DOMO = [
  { rotulo: "Domo Construtora", icone: HardHat, href: "https://leogpereira-afk.github.io/domo/" },
  { rotulo: "Diamond Vendas", icone: Building2, href: "https://diamond-vendas.netlify.app" },
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

// Frescor do cache. Mostra so a hora quando e de hoje; a partir de umas horas
// passa a mostrar quanto tempo faz, e acima de um dia mostra a DATA.
//
// Motivo: em 2026-07-22 o cache congelou por 8 horas e o chip continuou dizendo
// so "dados de 14:24" -- que parece recente. O dono percebeu pela conta que nao
// batia, nao pelo painel. Um numero velho tem que se anunciar velho.
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
  const dia = dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });

  let texto;
  if (idadeMin < 60) texto = `dados de ${hhmm}`;
  else if (idadeMin < 60 * 20) texto = `dados de ${hhmm} (ha ${Math.floor(idadeMin / 60)}h)`;
  else texto = `dados de ${dia} as ${hhmm}`;

  return {
    hhmm,
    texto,
    velho: idadeMin > 40,
    // Acima de 3 horas nao e "atrasado", e parado: o cron roda a cada 20 min.
    parado: idadeMin > 180,
    idadeMin,
  };
}

const CLASSE_ITEM =
  "flex items-center gap-2.5 rounded-lg px-3 py-2 font-display text-sm font-medium transition-all";
const CLASSE_TITULO =
  "mb-1.5 mt-6 flex w-full items-center gap-1.5 px-3 font-display text-xs font-semibold uppercase tracking-wide text-slate-400 transition-colors hover:text-slate-600";

// Lembra, por aparelho, se um grupo da lateral fica aberto. Cada grupo tem a
// sua chave: fechar Sistemas nao mexe em Domo.
function useGrupo(id, padraoAberto) {
  const chave = `painel_grupo_${id}`;
  const [aberto, setAberto] = useState(() => {
    try {
      const s = localStorage.getItem(chave);
      return s === null ? padraoAberto : s === "sim";
    } catch {
      return padraoAberto;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(chave, aberto ? "sim" : "nao");
    } catch {}
  }, [chave, aberto]);
  return [aberto, () => setAberto((v) => !v)];
}

// Cabecalho de secao que abre e fecha (SISTEMAS, DOMO).
function TituloRecolhivel({ id, titulo, aberto, alternar }) {
  return (
    <button
      type="button"
      onClick={alternar}
      aria-expanded={aberto}
      aria-controls={`grupo-${id}`}
      className={CLASSE_TITULO}
    >
      <span className="min-w-0 flex-1 truncate text-left">{titulo}</span>
      <ChevronDown
        size={13}
        className={`shrink-0 transition-transform ${aberto ? "" : "-rotate-90"}`}
      />
    </button>
  );
}

// Link que sai do painel (abre em outra aba, com a setinha).
function LinkExterno({ rotulo, icone: Icone, href }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`group ${CLASSE_ITEM} text-slate-600 hover:bg-slate-100 hover:text-slate-900`}
    >
      <Icone size={17} strokeWidth={2.2} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{rotulo}</span>
      <ArrowUpRight
        size={14}
        className="shrink-0 text-slate-300 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand"
      />
    </a>
  );
}

function ConteudoLateral({ aoNavegar, sessao }) {
  const location = useLocation();
  const itensGestao = GESTAO.filter((n) => !n.modulo || podeAbrir(n.modulo, sessao));
  const dentroDaGestao = itensGestao.some((n) => location.pathname.startsWith(n.to));

  // Os tres grupos abrem e fecham, cada um lembrando a sua escolha. Gestao
  // comeca fechada; Sistemas e Domo comecam abertos para nada sumir da tela de
  // quem ja usava -- quem quiser a lateral enxuta fecha uma vez e fica assim.
  //
  // Estando numa pagina de dentro, Gestao abre de qualquer jeito: esconder a
  // pagina em que a pessoa esta seria mentir sobre onde ela esta.
  const [gestaoAberta, alternarGestao] = useGrupo("gestao", false);
  const [sistemasAberto, alternarSistemas] = useGrupo("sistemas", true);
  const [domoAberto, alternarDomo] = useGrupo("domo", true);
  const mostrarGestao = gestaoAberta || dentroDaGestao;

  const sistemas = SISTEMAS.filter((s) => !s.soDirecao || sessao?.master);

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
        <NavLink
          to={INICIO.to}
          end
          onClick={aoNavegar}
          className={({ isActive }) =>
            [
              CLASSE_ITEM,
              isActive ? "bg-brand/10 text-brand" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            ].join(" ")
          }
        >
          <INICIO.icone size={17} strokeWidth={2.2} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">{INICIO.rotulo}</span>
        </NavLink>

        {itensGestao.length > 0 && (
          <>
            <button
              type="button"
              onClick={alternarGestao}
              aria-expanded={mostrarGestao}
              aria-controls="grupo-gestao"
              className={`w-full ${CLASSE_ITEM} text-slate-600 hover:bg-slate-100 hover:text-slate-900`}
            >
              <BarChart3 size={17} strokeWidth={2.2} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left">Gestao</span>
              <ChevronDown
                size={15}
                className={`shrink-0 text-slate-400 transition-transform ${mostrarGestao ? "rotate-180" : ""}`}
              />
            </button>

            {mostrarGestao && (
              <div id="grupo-gestao" className="space-y-0.5 pl-3">
                {itensGestao.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    onClick={aoNavegar}
                    className={({ isActive }) =>
                      [
                        CLASSE_ITEM,
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
              </div>
            )}
          </>
        )}
      </nav>

      {/* Outros sistemas: logo abaixo da navegacao, sempre a um clique. */}
      <TituloRecolhivel
        id="sistemas"
        titulo="Sistemas"
        aberto={sistemasAberto}
        alternar={alternarSistemas}
      />
      {sistemasAberto && (
        <nav id="grupo-sistemas" className="space-y-0.5">
          {sistemas.map((s) => (
            <LinkExterno key={s.rotulo} {...s} />
          ))}
        </nav>
      )}

      {/* Sair fica FORA do grupo: com Sistemas fechado, ninguem acha a saida. */}
      <button
        type="button"
        onClick={sair}
        className={`mt-2 w-full border-t pt-2.5 ${CLASSE_ITEM} text-slate-500 hover:bg-bad-50 hover:text-bad-700`}
        style={{ borderColor: "var(--hairline)", borderRadius: 0 }}
      >
        <LogOut size={17} strokeWidth={2.2} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">Sair do painel</span>
      </button>

      {/* Domo: outra empresa do dono, so para a direcao. */}
      {sessao?.master && (
        <>
          <TituloRecolhivel id="domo" titulo="Domo" aberto={domoAberto} alternar={alternarDomo} />
          {domoAberto && (
            <nav id="grupo-domo" className="space-y-0.5">
              {DOMO.map((s) => (
                <LinkExterno key={s.rotulo} {...s} />
              ))}
            </nav>
          )}
        </>
      )}

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

  // Relogio: sem isto a idade do cache so era recalculada quando os dados
  // mudavam -- ou seja, justamente quando o cache TRAVA o chip congelava junto,
  // escondendo o problema.
  const [, forcarRelogio] = useState(0);
  useEffect(() => {
    const t = setInterval(() => forcarRelogio((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  // Troca de rota fecha a gaveta (senao ela fica por cima do conteudo novo).
  useEffect(() => {
    setMenuAberto(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen lg:flex">
      {/* Lateral fixa no desktop.
          overflow-y-auto e obrigatorio junto com h-screen: sem ele, o que passa
          do fim da tela fica inalcançavel (foi o que aconteceu quando a lateral
          cresceu com as abas novas). overscroll-contain evita que a rolagem,
          ao chegar no fim da lateral, continue na pagina de tras. */}
      <aside
        className="sem-impressao hidden w-60 shrink-0 flex-col border-r bg-white px-3 py-4 lg:sticky lg:top-0 lg:flex lg:h-screen lg:overflow-y-auto lg:overscroll-contain"
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
                  className={`inline-flex items-center gap-1.5 ${f.parado ? "chip-bad" : f.velho ? "chip-warn" : "chip"}`}
                  title={`Dados do cache do Mubisys, ${f.idadeMin} min atras`}
                >
                  <Clock size={13} />
                  {f.texto}
                  {f.parado ? " · parado" : f.velho ? " · atrasado" : ""}
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
