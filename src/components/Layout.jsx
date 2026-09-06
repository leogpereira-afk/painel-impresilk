import CentralShell from "./CentralShell.jsx";
import {useEffect,useState} from "react";
import {useLocation} from "react-router-dom";
import {Moon,Sun,Clock,RefreshCw} from "lucide-react";
import {useApp} from "../config/store.jsx";
import {sair} from "../lib/sessao.js";
import {frescor} from "../lib/frescor.js";

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

export default function Layout({ children, sessao }) {
  const location = useLocation();
  const [escuro, alternarTema] = useTema();
  const { modoDemo, atualizadoEm, recarregar, carregando, falhaSync, limparFalhaSync,
          fontesQueFalharam = [] } = useApp();
  const mostraErp = ["/contas-atrasadas", "/orcamentos", "/marketing"].includes(location.pathname);
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
    window.scrollTo({top:0,behavior:"instant"});
  }, [location.pathname]);

  return <CentralShell sessao={sessao} aoSair={() => sair()} controles={<>
    {modoDemo && <span className="chip-warn">Demonstração</span>}
    {mostraErp && f && <span className={f.parado ? "chip-bad" : f.velho ? "chip-warn" : "chip"}><Clock size={13}/>{f.texto}{f.parado ? " · parado" : f.velho ? " · atrasado" : ""}</span>}
    {mostraErp && <button type="button" className="btn-ghost" disabled={carregando} onClick={recarregar} aria-label="Sincronizar os dados"><RefreshCw size={18} className={carregando ? "animate-spin" : ""}/></button>}
    <button type="button" className="btn-ghost" onClick={alternarTema} aria-label="Alternar tema">{escuro ? <Sun size={18}/> : <Moon size={18}/>}</button>
  </>}>
    {falhaSync && <div role="alert" className="mb-4 rounded-xl bg-bad-50 p-4 text-sm text-bad-700">{falhaSync.texto} <button type="button" className="underline" onClick={limparFalhaSync}>Fechar aviso</button></div>}
    {mostraErp && fontesQueFalharam.length > 0 && <div role="alert" className="mb-4 rounded-xl border border-warn-200 bg-warn-50 p-4 text-sm text-warn-800"><strong>Algumas fontes não responderam.</strong> {fontesQueFalharam.join(", ")}. Os dados podem estar incompletos. <button type="button" className="underline" onClick={recarregar}>Tentar novamente</button></div>}
    {children}
  </CentralShell>;

}
