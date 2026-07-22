// Home: a porta de entrada. Saudacao e uma frase do dia, so isso.
//
// Nao ha numero nem resumo aqui de proposito: cada modulo tem os seus, e a
// lateral leva a eles. A entrada e para respirar antes de trabalhar, nao para
// levar um susto com o caixa.
//
// A frase muda por DIA (nao a cada carregamento): recarregar a pagina tres
// vezes e ver tres frases diferentes faria o painel parecer instavel. O indice
// vem do dia do ano, entao e a mesma o dia inteiro, em qualquer aparelho.

import { useApp } from "../config/store.jsx";
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

      <p className="mt-8 text-sm text-slate-400">
        Escolha um modulo no menu ao lado para comecar.
      </p>
    </div>
  );
}
