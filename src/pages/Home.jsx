// Home: a porta de entrada. Saudacao e uma frase do dia, so isso.
//
// Nao ha numero nem resumo aqui de proposito: cada modulo tem os seus, e a
// lateral leva a eles. A entrada e para respirar antes de trabalhar, nao para
// levar um susto com o caixa.
//
// A frase muda por DIA (nao a cada carregamento): recarregar a pagina tres
// vezes e ver tres frases diferentes faria o painel parecer instavel. O indice
// vem do dia do ano, entao e a mesma o dia inteiro, em qualquer aparelho.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { useApp } from "../config/store.jsx";
import { listarAtivos } from "../services/ativos.js";
import { calcAtivos, TIPOS } from "../lib/calc/ativos.js";
import { ymdLocal } from "../lib/format.js";
import { CarregandoModulo, ErroModulo } from "../components/ui.jsx";
import logoColor from "../assets/brand/logo-color.png";
import logoWhite from "../assets/brand/logo-white.png";

function saudacao() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

// Frases sobre trabalho feito com cuidado e constancia, no tom da casa: uma
// empresa de comunicacao visual que vive de prazo, acabamento e palavra dada.
const FRASES = [
  "Feito com capricho hoje, cobrado com tranquilidade amanha.",
  "Quem cuida do detalhe nao precisa explicar o resultado.",
  "Prazo cumprido e o melhor cartao de visita.",
  "Um cliente bem atendido volta e ainda traz outro.",
  "Trabalho bom aparece de longe. Literalmente, no nosso caso.",
  "Constancia vence talento que nao aparece.",
  "O que se mede, melhora. O que se acompanha, cresce.",
  "Fazer certo da primeira vez sai mais barato que refazer.",
  "Cada letreiro instalado e a marca de alguem confiando na nossa.",
  "Ordem na casa da liberdade para crescer.",
  "Nao existe atalho para reputacao: e um trabalho de cada vez.",
  "Time alinhado entrega mais que time apressado.",
  "O caixa agradece quem cobra no dia certo, sem constrangimento.",
  "Planejar a semana custa uma hora e devolve varias.",
  "Qualidade e o que voce entrega quando ninguem esta olhando.",
];

function fraseDoDia() {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), 0, 0);
  const diaDoAno = Math.floor((hoje - inicio) / 86400000);
  return FRASES[diaDoAno % FRASES.length];
}

export default function Home() {
  const { pronto, erro, recarregar } = useApp();
  const navigate = useNavigate();

  // Documentos e manutencoes que vencem: e a unica coisa que a Home mostra alem
  // da saudacao, porque e a unica que ninguem lembra de ir olhar sozinho -- um
  // alvara vence em silencio.
  const [criticos, setCriticos] = useState([]);
  useEffect(() => {
    let vivo = true;
    listarAtivos()
      .then((itens) => {
        if (!vivo) return;
        // So documento/veiculo/maquina: marketing e licitacao moram na mesma
        // colecao mas nao tem vencimento -- sem este filtro eles entravam aqui
        // como "sem data" e empurravam o alvara de verdade para fora do aviso.
        const doModulo = (itens || []).filter((x) => TIPOS[x.tipo]);
        setCriticos(calcAtivos(doModulo, ymdLocal(new Date())).criticos.slice(0, 4));
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  if (erro) return <ErroModulo mensagem={erro} aoTentar={recarregar} />;
  if (!pronto) return <CarregandoModulo />;

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-2 text-center">
      <img src={logoColor} alt="Impresilk" className="h-12 w-auto dark:hidden sm:h-14" />
      <img src={logoWhite} alt="Impresilk" className="hidden h-12 w-auto dark:block sm:h-14" />

      <h1 className="mt-7 font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
        {saudacao()}
      </h1>

      <p className="mt-4 max-w-xl text-lg leading-relaxed text-slate-500 sm:text-xl">
        {fraseDoDia()}
      </p>

      {criticos.length > 0 && (
        <button
          onClick={() => navigate("/documentos")}
          className="card card-hover mt-8 w-full max-w-lg border-l-4 border-l-warn-600 p-4 text-left"
        >
          <span className="flex items-center gap-2">
            <AlertTriangle size={16} className="shrink-0 text-warn-700" />
            <span className="flex-1 font-display text-sm font-semibold text-slate-900">
              {criticos.length === 1
                ? "1 documento ou manutencao precisa de atencao"
                : `${criticos.length} documentos ou manutencoes precisam de atencao`}
            </span>
            <ChevronRight size={16} className="shrink-0 text-slate-300" />
          </span>
          <span className="mt-2 block space-y-0.5">
            {criticos.map((c) => (
              <span key={c.id} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-slate-600">{c.nome}</span>
                <span className={c.sit.nivel === "vencido" ? "text-bad-700" : "text-warn-700"}>
                  {c.sit.rotulo}
                </span>
              </span>
            ))}
          </span>
        </button>
      )}

      {/* No celular NAO existe menu ao lado: a lateral vira o botao de tres
          tracos no alto. Mandar "olhe ao lado" para quem esta no telefone e
          mandar olhar para o nada. */}
      <p className="mt-8 text-sm text-slate-400">
        <span className="lg:hidden">Toque no menu, no alto a esquerda, para escolher um modulo.</span>
        <span className="hidden lg:inline">Escolha um modulo no menu ao lado para comecar.</span>
      </p>
    </div>
  );
}
