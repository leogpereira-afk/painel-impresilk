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
import { listarAtivos } from "../services/ativos.js";
import { statusBackup } from "../services/backup.js";
import { lerCargaAlarme } from "../services/permutas.js";
import { ehDirecao } from "../lib/sessao.js";
import { calcAtivos, TIPOS } from "../lib/calc/ativos.js";
import { ymdLocal } from "../lib/format.js";
import { Card } from "../components/ui.jsx";
import MeusSistemas from "../components/MeusSistemas.jsx";
import { meusSistemas } from "../lib/entradaUnica.js";
import MissaoValores from "../components/MissaoValores.jsx";
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
  const navigate = useNavigate();
  const temSistemas = meusSistemas().length > 0;

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
  const [cargaDegradada, setCargaDegradada] = useState(null);
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
        .then((r) => {
          if (!vivo || !r) return;
          if (r.alarme) {
            /* CADA FONTE TEM A SUA CADÊNCIA — e o aviso fala a dela. A régua
               vem do próprio vigia ({min, limite} por fonte): a versão
               anterior dizia "o normal é a cada 20 minutos" para o histórico
               SEMANAL, acusando atraso num domingo perfeitamente em dia. */
            const NOME_FONTE = {
              recebiveis: "contas a receber", pagar: "contas a pagar", bancos: "bancos",
              orcamentos: "orçamentos", ordens: "ordens de serviço",
              dso_hist: "prazo médio de recebimento", fluxo_mensal: "fluxo realizado",
              historico_status: "histórico de O.S.", status: "carimbo da carga",
              recebidos_os: "títulos pagos por O.S.",
            };
            const regua = (min) =>
              min >= 1440 * 2 ? `${Math.round(min / 1440)} dias`
              : min >= 120 ? `${Math.round(min / 60)}h`
              : `${min} minutos`;
            const fontes = Object.entries(r.alarme.fontes || {}).map(([chave, f]) => ({
              nome: NOME_FONTE[chave] || chave,
              horas: Math.max(1, Math.round(((f?.min ?? r.alarme.atrasoMin) || 0) / 60)),
              normal: f?.limite ? regua(f.limite) : null,
            }));
            setCargaParada({ fontes });
          }
          // Carga que RODOU mas veio pela metade: o dado entra torto (item
          // novo sem categoria, por exemplo) e nada dizia.
          if (r.degradada) setCargaDegradada(r.degradada);
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
          if (lista.some((sx) => sx && sx.ok === false && !sx.emAndamento)) {
            setBackupFalhou(lista.filter((sx) => sx?.ok === false && !sx.emAndamento).length);
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


  return (
    <div className="mx-auto w-full max-w-6xl px-2">
      {/* TOPO EM UMA LINHA (pedido do Leo, 23/09/2026: "essa parte de cima da
          pra ficar mais reduzida"). Logo, saudacao e frase ocupavam ~680px
          antes de o conteudo comecar -- a entrada virava um scroll obrigatorio
          ate os valores. Empilhado so no celular, onde nao cabe de lado. */}
      <div className="flex flex-col items-center gap-3 pt-3 text-center sm:flex-row sm:justify-center sm:gap-5 sm:text-left">
        <img src={logoColor} alt="Impresilk" className="h-9 w-auto shrink-0 dark:hidden" />
        <img src={logoWhite} alt="Impresilk" className="hidden h-9 w-auto shrink-0 dark:block" />
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            {saudacao()}
          </h1>
          <p className="text-sm leading-snug text-slate-500 sm:text-base">{fraseDoDia()}</p>
        </div>
      </div>

      {/* Os avisos lado a lado no desktop: empilhados em coluna de 32rem eles
          sozinhos empurravam os valores para fora da primeira tela. */}
      <div className="mt-5 grid gap-3 md:grid-cols-2">

      {backupFalhou > 0 && (
        <button
          onClick={() => navigate("/backups")}
          className="card card-hover w-full border-l-4 border-l-bad-600 p-4 text-left"
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

      {cargaDegradada && (
        <div className="card w-full border-l-4 border-l-warn-500 p-4 text-left">
          <span className="flex items-center gap-2 text-sm">
            <AlertTriangle size={16} className="shrink-0 text-warn-600" />
            <span className="min-w-0 flex-1 text-slate-700">
              <strong className="font-display">A última carga veio pela metade.</strong> Falhou:{" "}
              {(cargaDegradada.fontes || []).join(", ") || "uma fonte do ERP"} — o que entrou nesse
              período pode estar sem classificação. Some sozinho quando o ERP voltar.
            </span>
          </span>
        </div>
      )}

      {cargaParada && cargaParada.fontes?.length > 0 && (
        <div className="card w-full border-l-4 border-l-warn-500 p-4 text-left">
          <span className="flex items-center gap-2 text-sm">
            <AlertTriangle size={16} className="shrink-0 text-warn-600" />
            <span className="min-w-0 flex-1 text-slate-700">
              <strong className="font-display">Os números podem estar velhos.</strong>{" "}
              {cargaParada.fontes.map((f, i) => (
                <span key={f.nome}>
                  {i > 0 && "; "}
                  {f.nome} está há {f.horas}h sem atualizar
                  {f.normal ? ` (o normal dela é até ${f.normal})` : ""}
                </span>
              ))}
              . As telas mostram o dado guardado.
            </span>
          </span>
        </div>
      )}

      {backupParadoHoras != null && (
        <button
          onClick={() => navigate("/backups")}
          className="card card-hover w-full border-l-4 border-l-bad-600 p-4 text-left"
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
          className="card card-hover w-full border-l-4 border-l-warn-600 p-4 text-left"
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

      </div>

      {/* A ENTRADA ABRE COM A IDENTIDADE (pedido do Leo, 23/09/2026): missao,
          visao e os doze valores ocupam o corpo da pagina, e os atalhos dos
          sistemas passam para a coluna da esquerda.

          No CELULAR a ordem inverte: a identidade vem primeiro e os sistemas
          depois -- "abrir com missao, visao e valores" nao pode virar "role
          uma tela e meia ate achar os valores". */}
      <div
        className={
          "mt-10 grid gap-8 pb-10 " +
          /* Sem crachá da entrada única não HÁ atalhos, e a coluna da esquerda
             fica um vão de 15rem com uma frase solta no alto. Quem entrou pela
             porta antiga via isso. Sem sistemas, os valores ocupam a largura. */
          (temSistemas ? "lg:grid-cols-[15rem_minmax(0,1fr)]" : "")
        }
      >
        <aside
          className={
            "order-last lg:order-first lg:sticky lg:top-6 lg:self-start " +
            (temSistemas ? "" : "lg:hidden")
          }
        >
          <MeusSistemas coluna />
          <p className="mt-6 text-sm text-slate-400">
            {/* No celular NAO existe menu ao lado: a lateral vira o botao de
                tres tracos no alto. Mandar "olhe ao lado" para quem esta no
                telefone e mandar olhar para o nada. */}
            <span className="lg:hidden">Toque no menu, no alto à esquerda, para escolher um módulo.</span>
            <span className="hidden lg:inline">Escolha um módulo no menu ao lado para começar.</span>
          </p>
        </aside>

        <MissaoValores />
      </div>
    </div>
  );
}
