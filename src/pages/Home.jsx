import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ChevronDown, ChevronRight, Megaphone } from "lucide-react";
import { listarDocumentos } from "../services/documentos.js";
import { lerCampanhas } from "../services/campanhas.js";
import { lembretesDeCampanha } from "../lib/calc/campanhas.js";
import { statusBackup } from "../services/backup.js";
import { lerCargaAlarme } from "../services/permutas.js";
import { ehDirecao, getSessao, podeAbrir } from "../lib/sessao.js";
import { calcDocumentos, alertasDocumentosLegados } from "../lib/calc/documentos.js";
import { ymdLocal, dataCurta } from "../lib/format.js";
import { Card } from "../components/ui.jsx";
import MeusSistemas from "../components/MeusSistemas.jsx";
import { meusSistemas } from "../lib/entradaUnica.js";
import MissaoValores from "../components/MissaoValores.jsx";
import logoColor from "../assets/brand/logo-color.png";
import logoWhite from "../assets/brand/logo-white.png";
import Silk from "../components/Silk.jsx";

function saudacao() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

// Frases sobre trabalho feito com cuidado e constancia, no tom da casa: uma
// empresa de comunicacao visual que vive de prazo, acabamento e palavra dada.
const FRASES = [
  "Feito com capricho hoje, cobrado com tranquilidade amanhã.",
  "Quem cuida do detalhe não precisa explicar o resultado.",
  "Prazo cumprido é o melhor cartão de visita.",
  "Um cliente bem atendido volta e ainda traz outro.",
  "Trabalho bom aparece de longe. Literalmente, no nosso caso.",
  "Constância vence talento que não aparece.",
  "O que se mede, melhora. O que se acompanha, cresce.",
  "Fazer certo da primeira vez sai mais barato que refazer.",
  "Cada letreiro instalado é a marca de alguém confiando na nossa.",
  "Ordem na casa dá liberdade para crescer.",
  "Não existe atalho para reputação: é um trabalho de cada vez.",
  "Time alinhado entrega mais que time apressado.",
  "O caixa agradece quem cobra no dia certo, sem constrangimento.",
  "Planejar a semana custa uma hora e devolve várias.",
  "Qualidade é o que você entrega quando ninguém está olhando.",
];

function escolherFrase() {
  let anterior = -1;
  try { anterior = Number(sessionStorage.getItem("painel_ultima_frase") ?? -1); } catch { /* armazenamento indisponível */ }
  const opcoes = FRASES.map((_, i) => i).filter(i => i !== anterior);
  return opcoes[Math.floor(Math.random() * opcoes.length)];
}

export default function Home({ sessao = getSessao() } = {}) {
  const navigate = useNavigate();
  const primeiroNome = (sessao?.nome || "").trim().split(/\s+/)[0];
  const chaveSessao = JSON.stringify([sessao?.usuario, sessao?.master, sessao?.permissoes || []]);
  const temDocumentos = podeAbrir('documentos', sessao);
  const sessaoAtual = useRef(chaveSessao);
  sessaoAtual.current = chaveSessao;
  const [frase] = useState(escolherFrase);
  useEffect(() => {
    try { sessionStorage.setItem("painel_ultima_frase", String(frase)); } catch { /* armazenamento indisponível */ }
  }, [frase]);
  const temSistemas = meusSistemas().length > 0;

  // Controles documentais que vencem: a Home usa a mesma fonte autorizada
  // da saudacao, porque e a unica que ninguem lembra de ir olhar sozinho -- um
  // alvara vence em silencio.
  const [vencimentos, setVencimentos] = useState({ chave: '', criticos: [], falhou: false });
  const leituraDocumentos = useRef(0);
  // A permissão pode mudar sem desmontar a Home. Oculta o cache já neste
  // render, antes de o efeito cancelar a consulta da sessão anterior.
  const dadosAutorizados = temDocumentos && vencimentos.chave === chaveSessao;
  const criticos = dadosAutorizados ? vencimentos.criticos : [];
  const falhouVencimentos = dadosAutorizados && vencimentos.falhou;
  useEffect(() => {
    const contador = leituraDocumentos;
    const pedido = ++contador.current;
    const atual = () => pedido === contador.current && sessaoAtual.current === chaveSessao;
    setVencimentos({ chave: chaveSessao, criticos: [], falhou: false });
    if (temDocumentos) listarDocumentos()
      .then(({ itens, bens }) => {
        if (!atual()) return;
        if (!Array.isArray(itens) || !Array.isArray(bens)) throw new Error('Resposta de documentos incompleta.');
        /* O TOTAL INTEIRO fica guardado; quem corta em 4 é a exibição. */
        const hoje = ymdLocal(new Date());
        setVencimentos({ chave: chaveSessao, criticos: [...calcDocumentos(itens, hoje).criticos, ...alertasDocumentosLegados(bens, hoje)], falhou: false });
      })
      .catch(() => { if (atual()) setVencimentos({ chave: chaveSessao, criticos: [], falhou: true }); });
    return () => { contador.current++; };
  }, [chaveSessao, temDocumentos]);
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

  /* O LEMBRETE DA CAMPANHA (sugestão aceita pelo dono, 24/10/2026): um mês
     antes da primeira venda do ano passado, "crie a edição deste ano e comece
     a procurar os clientes". Some sozinho quando a edição nasce. Falha de
     rede não vira aviso aqui: é um lembrete, não um alarme. */
  const temCampanhas = podeAbrir("campanhas", sessao);
  const [lembretes, setLembretes] = useState([]);
  useEffect(() => {
    let vivo = true;
    if (!temCampanhas) { setLembretes([]); return undefined; }
    lerCampanhas()
      .then((mapa) => { if (vivo) setLembretes(lembretesDeCampanha(mapa, { hoje: ymdLocal(new Date()) })); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [temCampanhas, chaveSessao]);
  useEffect(() => {
    let vivo = true;
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
    <div className="mx-auto w-full max-w-6xl px-2 pb-10 pt-3">
        <section className="min-w-0" aria-label="Identidade da empresa">
          <div className="silk-home">
            <Silk/>
            <div className="silk-home-copy">
              <img src={logoColor} alt="Impresilk" className="silk-home-logo dark:hidden" />
              <img src={logoWhite} alt="Impresilk" className="silk-home-logo hidden dark:block" />
              <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                {saudacao()}{primeiroNome ? `, ${primeiroNome}!` : "!"}
              </h1>
              <p className="text-sm leading-snug text-slate-500 sm:text-base">{FRASES[frase]}</p>
              <p className="silk-introduction">Silk, o mascote da Impresilk.</p>
            </div>
          </div>
          <div className="mt-7">
            <MissaoValores />
          </div>
        </section>

      {temSistemas && (
        <section className="mt-8" aria-label="Seus sistemas">
          <details open className="group card overflow-hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-display text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              <span>Seus sistemas</span>
              <ChevronDown
                aria-hidden="true"
                size={17}
                className="shrink-0 text-slate-400 transition-transform group-open:rotate-180"
              />
            </summary>
            <div className="px-3 pb-4 pt-1">
              <MeusSistemas coluna grade mostrarTitulo={false} />
            </div>
          </details>
        </section>
      )}

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
          Não consegui conferir os vencimentos de documentos, garantias e seguros agora — isto NÃO quer
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
                ? "1 documento, garantia ou seguro precisa de atenção"
                : `${criticos.length} documentos, garantias ou seguros precisam de atenção`}
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
      {lembretes.slice(0, 3).map((l) => (
        <button
          key={l.id}
          onClick={() => navigate(`/campanhas?campanha=${encodeURIComponent(l.id)}`)}
          className="card card-hover w-full border-l-4 border-l-brand-600 p-4 text-left"
        >
          <span className="flex items-center gap-2">
            <Megaphone size={16} className="shrink-0 text-brand-700" />
            <span className="flex-1 font-display text-sm font-semibold text-slate-900">
              {l.nome || "Campanha"}: hora de criar a edição de {l.anoNovo}
            </span>
            <ChevronRight size={16} className="shrink-0 text-slate-300" />
          </span>
          <span className="mt-2 block text-sm text-slate-600">
            Em {l.anoAnterior} a primeira venda foi em {dataCurta(l.primeiraVendaAnterior)}. Comece a procurar os clientes até {dataCurta(l.procurarAte)}
            {l.diasAteProcurar > 0 ? ` (faltam ${l.diasAteProcurar} ${l.diasAteProcurar === 1 ? "dia" : "dias"})` : l.diasAteProcurar === 0 ? " (é hoje)" : ` (passaram ${-l.diasAteProcurar} ${-l.diasAteProcurar === 1 ? "dia" : "dias"})`}.
            Toque para abrir a edição de {l.anoAnterior} e criar a próxima com a estratégia.
          </span>
        </button>
      ))}
      {lembretes.length > 3 && (
        <button onClick={() => navigate("/campanhas")} className="card card-hover w-full p-4 text-left text-sm text-slate-600">
          e mais {lembretes.length - 3} {lembretes.length - 3 === 1 ? "campanha espera" : "campanhas esperam"} a edição nova. Toque para abrir Campanhas.
        </button>
      )}

      </div>

    </div>
  );
}
