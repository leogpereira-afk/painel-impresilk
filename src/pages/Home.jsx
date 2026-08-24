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
import { statusBackup } from "../services/backup.js";
import { lerCargaAlarme } from "../services/permutas.js";
import { ehDirecao } from "../lib/sessao.js";
import { calcAtivos, TIPOS } from "../lib/calc/ativos.js";
import { ymdLocal } from "../lib/format.js";
import { Card, CarregandoModulo, ErroModulo } from "../components/ui.jsx";
import MeusSistemas from "../components/MeusSistemas.jsx";
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
  const [falhouVencimentos, setFalhouVencimentos] = useState(false);
  /* BACKUP PARADO, na tela que a direção VÊ. O alerta de 36h morava só na
     tela de Acessos — que só se abre para mexer em conta. Aviso que não é
     visto não é aviso: o disparo diário é cego (quem chama não lê a resposta)
     e a casa já teve o backup morto por dias sem ninguém saber. Só a direção
     busca (é assunto dela) e falha da consulta fica muda: o aviso de atraso
     não pode nascer de uma queda de rede. */
  const [backupParadoHoras, setBackupParadoHoras] = useState(null);
  const [backupFalhou, setBackupFalhou] = useState(0);
  /* A CARGA DO ERP: o vigia (pg_cron) grava `carga_alarme` de hora em hora e,
     até esta rodada, NINGUÉM lia -- nem tela nem function. Aqui ele aparece,
     no mesmo lugar em que a direção já olha o backup. */
  const [cargaParada, setCargaParada] = useState(null);
  useEffect(() => {
    let vivo = true;
    listarAtivos()
      .then((itens) => {
        if (!vivo) return;
        // So documento/veiculo/maquina: marketing e licitacao moram na mesma
        // colecao mas nao tem vencimento -- sem este filtro eles entravam aqui
        // como "sem data" e empurravam o alvara de verdade para fora do aviso.
        const doModulo = (itens || []).filter((x) => TIPOS[x.tipo]);
        /* O TOTAL INTEIRO fica guardado; quem corta em 4 é a exibição. Cortar
           aqui fazia o título dizer "4 precisam de atenção" quando eram 6 --
           número mentindo para baixo e contradizendo a tela de Documentos. */
        setCriticos(calcAtivos(doModulo, ymdLocal(new Date())).criticos);
      })
      /* FALHA VISÍVEL. O catch vazio deixava "servidor fora" idêntico a "nada
         vencendo" -- no único card que ninguém confere por conta própria, um
         alvará vencido sumia em silêncio. */
      .catch(() => { if (vivo) setFalhouVencimentos(true); });
    if (ehDirecao()) {
      lerCargaAlarme()
        .then((al) => {
          if (!vivo || !al) return;
          setCargaParada({
            horas: Math.max(1, Math.round((al.atrasoMin || 0) / 60)),
            fontes: Object.keys(al.fontes || {}),
          });
        })
        .catch(() => {}); // sinal de saúde: falha dele não vira aviso falso
      statusBackup()
        .then((st) => {
          if (!vivo || !st) return;
          const sistemas = st?.sistemas || (st?.em ? { painel: st } : {});
          const lista = Object.values(sistemas);
          /* O CARIMBO `em` É ESCRITO TAMBÉM QUANDO O BACKUP FALHA (a Edge
             grava `{ em: agora, ok: false, erro }`). Medindo só a idade, o
             backup que RODA E FALHA todo dia parecia o mais fresco de todos
             -- justo o caso que este aviso existe para pegar. Falha conta
             como parado na hora, sem esperar as 36h. */
          if (lista.some((sx) => sx && sx.ok === false)) {
            setBackupFalhou(lista.filter((sx) => sx?.ok === false).length);
            return;
          }
          const idades = lista
            .map((sx) => Date.parse(sx?.em || "") || 0)
            .filter(Boolean)
            .map((t) => (Date.now() - t) / 36e5);
          const maisVelho = idades.length ? Math.max(...idades) : null;
          if (maisVelho != null && maisVelho > 36) setBackupParadoHoras(Math.round(maisVelho));
        })
        .catch(() => {});
    }
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

      {backupFalhou > 0 && (
        <button
          onClick={() => navigate("/acessos")}
          className="card card-hover mt-6 w-full max-w-lg border-l-4 border-l-bad-600 p-4 text-left"
        >
          <span className="flex items-center gap-2 text-sm">
            <AlertTriangle size={16} className="shrink-0 text-bad-700" />
            <span className="min-w-0 flex-1 text-slate-700">
              <strong className="font-display">Backup falhou.</strong> A última corrida deu erro em{" "}
              {backupFalhou === 1 ? "um sistema" : `${backupFalhou} sistemas`} — rodar não é o mesmo que
              copiar. Toque para ver o erro e rodar de novo.
            </span>
          </span>
        </button>
      )}

      {cargaParada && (
        <div className="card mt-6 w-full max-w-lg border-l-4 border-l-warn-500 p-4 text-left">
          <span className="flex items-center gap-2 text-sm">
            <AlertTriangle size={16} className="shrink-0 text-warn-600" />
            <span className="min-w-0 flex-1 text-slate-700">
              <strong className="font-display">Os números podem estar velhos.</strong>{" "}
              {cargaParada.fontes?.length === 1
                ? `A fonte "${cargaParada.fontes[0]}" não é atualizada`
                : `${cargaParada.fontes?.length ?? "Algumas"} fontes não são atualizadas`}{" "}
              há {cargaParada.horas}h — o normal é a cada 20 minutos. As telas mostram o dado guardado.
            </span>
          </span>
        </div>
      )}

      {backupParadoHoras != null && (
        <button
          onClick={() => navigate("/acessos")}
          className="card card-hover mt-6 w-full max-w-lg border-l-4 border-l-bad-600 p-4 text-left"
        >
          <span className="flex items-center gap-2 text-sm">
            <AlertTriangle size={16} className="shrink-0 text-bad-700" />
            <span className="min-w-0 flex-1 text-slate-700">
              <strong className="font-display">Backup parado.</strong> O mais velho tem{" "}
              {backupParadoHoras}h — o normal é rodar todo dia. Toque para ver e rodar agora.
            </span>
          </span>
        </button>
      )}
      {falhouVencimentos && (
        <Card className="flex items-start gap-2 text-sm text-warn-700">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          Não consegui conferir os vencimentos de documentos e manutenções agora — isto NÃO quer
          dizer que está tudo em dia. Recarregue, ou confira na tela de Documentos.
        </Card>
      )}
      {criticos.length > 0 && (
        <button
          onClick={() => navigate("/documentos")}
          className="card card-hover mt-8 w-full max-w-lg border-l-4 border-l-warn-600 p-4 text-left"
        >
          <span className="flex items-center gap-2">
            <AlertTriangle size={16} className="shrink-0 text-warn-700" />
            <span className="flex-1 font-display text-sm font-semibold text-slate-900">
              {criticos.length === 1
                ? "1 documento ou manutenção precisa de atenção"
                : `${criticos.length} documentos ou manutenções precisam de atenção`}
            </span>
            <ChevronRight size={16} className="shrink-0 text-slate-300" />
          </span>
          <span className="mt-2 block space-y-0.5">
            {/* Quatro linhas bastam para o aviso; o TÍTULO acima carrega o
                total verdadeiro, e este rodapé diz o que ficou de fora. */}
            {criticos.slice(0, 4).map((c) => (
              <span key={c.id} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-slate-600">{c.nome}</span>
                <span className={c.sit.nivel === "vencido" ? "text-bad-700" : "text-warn-700"}>
                  {c.sit.rotulo}
                </span>
              </span>
            ))}
            {criticos.length > 4 && (
              <span className="block text-sm text-slate-400">
                e mais {criticos.length - 4} — toque para ver todos
              </span>
            )}
          </span>
        </button>
      )}

      {/* No celular NAO existe menu ao lado: a lateral vira o botao de tres
          tracos no alto. Mandar "olhe ao lado" para quem esta no telefone e
          mandar olhar para o nada. */}
      <MeusSistemas />

      <p className="mt-8 text-sm text-slate-400">
        <span className="lg:hidden">Toque no menu, no alto a esquerda, para escolher um módulo.</span>
        <span className="hidden lg:inline">Escolha um módulo no menu ao lado para começar.</span>
      </p>
    </div>
  );
}
