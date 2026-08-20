/* CAMPANHAS: quanto vendemos para um evento, e quem comprou.
 *
 * Uma eleição, uma festa da cidade, uma feira. A Impresilk vende para dezenas
 * de compradores diferentes dentro do mesmo evento, cada um com o seu CNPJ, e
 * hoje ninguém responde "quanto a eleição de 2026 rendeu" sem varrer O.S. no
 * ERP uma a uma -- justamente quando a resposta serve para decidir se vale
 * montar equipe para a próxima.
 *
 * A tela é de UMA pergunta, em duas metades:
 *
 *   quanto vendemos para este evento   ·   quem comprou quanto
 *
 * A BASE É A MESMA DA PERMUTA, de propósito: escolher clientes da carteira,
 * aceitar O.S. uma a uma, agrupar por CNPJ. No banco é a MESMA função
 * (`troca_mexer`), e os pedaços de tela vêm de `components/trocas.jsx`. O que
 * muda é a pergunta, e pergunta é conta -- mora em `lib/calc/campanhas.js`.
 *
 * POR ISSO NÃO HÁ SALDO AQUI. Campanha não tem crédito para gastar nem dívida
 * para cobrar: o número é faturamento. Trazer a régua da permuta para cá faria
 * a tela mostrar "saldo negativo" num evento que foi um sucesso.
 *
 * O QUE ELA NÃO FAZ, igual à permuta: não adivinha. Seria tentador dizer "toda
 * O.S. com 'eleição' no nome do cliente é da campanha" -- e aí a primeira
 * gráfica chamada "Eleição Papelaria" entraria sozinha, e ninguém perceberia.
 * Cada O.S. entra por um clique.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Plus, Trash2, Search, X, AlertTriangle, Megaphone, Building2,
  Archive, Paperclip, Download, CalendarRange, Trophy,
} from "lucide-react";
import {
  lerCampanhas, mexerNaCampanha, removerCampanha, anexarNaCampanha, lerAnexoCampanha,
  buscarClientes, buscarOrdensDe, buscarOrdensPorId, lerCobertura,
} from "../services/campanhas.js";
import { fichaDaOS, ordensDosClientes, donoPorOS } from "../lib/calc/permutas.js";
import {
  resumoDaCampanha, resumoGeralCampanhas, totaisDasCampanhas, compradoresDaCampanha,
  extratoDaCampanha,
} from "../lib/calc/campanhas.js";
import { paraNumero, dataLonga } from "../lib/format.js";
import { Card, PageTitle, Empty, CarregandoModulo, BotaoPDF, CabecalhoImpressao } from "../components/ui.jsx";
import {
  dinheiro, dataDaOS, formatarDoc, hojeISO, novoId,
  Aviso, Secao, GrupoCliente, LinhaAceita, LinhaEscolher, Historico,
} from "../components/trocas.jsx";

const ANO_HOJE = new Date().getFullYear();

/* AS FRASES DO HISTÓRICO. A mecânica é a mesma da permuta (o servidor carimba
   quem e quando); o vocabulário é outro -- aqui não se "abate crédito", se
   vende. Ver `Historico` em components/trocas.jsx. */
const CONTA_O_EVENTO = {
  criou: () => "criou a campanha",
  credito: (e) => `mudou a meta de ${dinheiro(e.de)} para ${dinheiro(e.para)}`,
  aceitouOS: (e) => `marcou a O.S. ${e.numero} (${dinheiro(e.valor)})${e.cliente ? ` — ${e.cliente}` : ""}`,
  tirouOS: (e) => `tirou a O.S. ${e.numero} (${dinheiro(e.valor)})`,
  lancou: (e) => `lançou a venda "${e.descricao}" — ${dinheiro(e.valor)}`,
  mudouLanc: (e) => `alterou a venda "${e.descricao}" para ${dinheiro(e.valor)}`,
  tirouLanc: (e) => `tirou a venda "${e.descricao}" (${dinheiro(e.valor)})`,
  anexou: (e) => `anexou "${e.nome}"`,
  encerrou: () => "encerrou a campanha",
  reabriu: () => "reabriu a campanha",
};

/* QUANTO DA META. Só aparece quando há meta -- barra em 0% num evento sem meta
   é uma cobrança que ninguém fez. Passar de 100% não estoura a barra: ela
   enche e o número ao lado diz o quanto passou. */
function Meta({ vendido, meta, pct }) {
  if (!(meta > 0)) return null;
  const cheio = Math.min(1, pct || 0);
  const bateu = (pct || 0) >= 1;
  return (
    <div className="space-y-1">
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${bateu ? "bg-ok-500" : "bg-brand-500"}`}
          style={{ width: `${cheio * 100}%` }}
        />
      </div>
      <div className="text-xs text-slate-500">
        {Math.round((pct || 0) * 100)}% da meta de {dinheiro(meta)}
        {bateu
          ? ` · ${dinheiro(vendido - meta)} acima`
          : ` · faltam ${dinheiro(meta - vendido)}`}
      </div>
    </div>
  );
}

/* O CARTÃO DA LISTA. Responde as duas metades da pergunta sem abrir: quanto
   rendeu e quantos compraram. O nome do maior comprador entra porque é o que
   distingue "um evento" de "um cliente grande com nome de evento". */
function CartaoCampanha({ c, aoAbrir }) {
  const lider = c.porCliente[0] || null;
  return (
    <button
      type="button"
      onClick={() => aoAbrir(c.id)}
      className={`w-full rounded-xl border bg-white p-4 text-left transition hover:border-brand-300 hover:shadow-sm ${
        c.encerrada ? "border-slate-200 opacity-70" : "border-slate-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium text-slate-800">{c.nome || "sem nome"}</div>
          <div className="mt-0.5 text-xs text-slate-500">
            {c.ano || "sem ano"}
            {c.encerrada && " · encerrada"}
            {c.linhas.length > 0 && ` · ${c.linhas.length} O.S.`}
            {c.semOS > 0 && " · tem venda sem O.S."}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-lg font-semibold tabular-nums text-slate-800">{dinheiro(c.vendido)}</div>
          <div className="text-xs text-slate-500">
            {c.compradores} {c.compradores === 1 ? "comprador" : "compradores"}
          </div>
        </div>
      </div>

      {c.meta > 0 && (
        <div className="mt-3">
          <Meta vendido={c.vendido} meta={c.meta} pct={c.pct} />
        </div>
      )}

      {lider && c.compradores > 1 && (
        <div className="mt-2 truncate text-xs text-slate-500">
          Maior: {lider.cliente} · {dinheiro(lider.valor)}
          {c.maiorFatia != null && ` (${Math.round(c.maiorFatia * 100)}%)`}
        </div>
      )}

      {(c.mudaram > 0 || c.sumiram > 0) && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-warn-700">
          <AlertTriangle size={12} className="shrink-0" />
          {c.sumiram > 0 ? `${c.sumiram} O.S. sumiram do ERP` : `${c.mudaram} O.S. mudaram de valor`}
        </div>
      )}
    </button>
  );
}

/* UMA VENDA SEM O.S. -- data, o que foi, quanto, e a nota.
   A nota mora DENTRO da venda: documento solto numa gaveta da campanha não
   diz a qual venda pertence. */
function LinhaVenda({ l, aoTirar, aoAnexar, aoBaixar }) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-100 py-2 text-sm last:border-0">
      <span className="w-20 shrink-0 text-xs tabular-nums text-slate-400">{dataDaOS(l.data)}</span>
      <span className="min-w-0 flex-1 truncate text-slate-700">{l.descricao || "sem descrição"}</span>
      {l.anexo ? (
        <button
          type="button"
          onClick={() => aoBaixar(l.anexo)}
          className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs text-brand-600 hover:bg-brand-50 sem-impressao"
          title={`Baixar ${l.anexo.nome}`}
        >
          <Download size={12} /> <span className="max-w-[8rem] truncate">{l.anexo.nome}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => aoAnexar(l)}
          className="shrink-0 rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600 sem-impressao"
          title="Anexar a nota desta venda"
          aria-label="Anexar a nota desta venda"
        >
          <Paperclip size={13} />
        </button>
      )}
      <span className="w-28 shrink-0 text-right font-medium tabular-nums text-slate-800">{dinheiro(l.valor)}</span>
      <button
        type="button"
        onClick={() => aoTirar(l)}
        className="shrink-0 rounded p-1 text-slate-300 hover:bg-bad-50 hover:text-bad-600 sem-impressao"
        title="Tirar esta venda"
        aria-label="Tirar esta venda"
      >
        <X size={14} />
      </button>
    </div>
  );
}

function FormVenda({ form, setForm, aoSalvar, aoCancelar, salvando }) {
  return (
    <div className="mb-3 grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-[7.5rem_1fr_8rem_auto]">
      <input
        type="date"
        className="input h-9 text-sm"
        value={form.data}
        onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))}
      />
      <input
        className="input h-9 text-sm"
        placeholder="O que foi vendido"
        value={form.descricao}
        autoFocus
        onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
      />
      <input
        className="input h-9 text-right text-sm"
        placeholder="0,00"
        inputMode="decimal"
        value={form.valor}
        onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
      />
      <div className="flex gap-1.5">
        <button type="button" className="btn-primary h-9 px-3 text-sm" onClick={aoSalvar} disabled={salvando}>
          Salvar
        </button>
        <button type="button" className="btn-ghost h-9 px-3 text-sm" onClick={aoCancelar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

/* O RANKING: a metade da pergunta que a tela existe para responder.
   A barra é relativa ao MAIOR, não à soma -- com vinte compradores, barras
   sobre a soma ficam todas invisíveis e a comparação some. */
function Ranking({ itens, semOS }) {
  if (!itens.length) return <Empty>Nenhuma O.S. marcada ainda — sem isso não há quem comprou.</Empty>;
  const teto = itens[0].valor || 1;
  return (
    <div className="space-y-2">
      {itens.map((c, i) => (
        <div key={c.chave} className="flex items-center gap-3 text-sm">
          <span className="w-5 shrink-0 text-right text-xs tabular-nums text-slate-400">{i + 1}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-slate-800">{c.cliente}</span>
            <span className="mt-0.5 block h-1.5 overflow-hidden rounded-full bg-slate-100 sem-impressao">
              <span
                className="block h-full rounded-full bg-brand-400"
                style={{ width: `${Math.max(2, (c.valor / teto) * 100)}%` }}
              />
            </span>
          </span>
          {/* A contagem some no celular: ali a largura toda tem de ir para o
              NOME, que é o que se lê. Ela continua no extrato de papel. */}
          <span className="hidden w-14 shrink-0 text-right text-xs tabular-nums text-slate-400 sm:block">
            {c.qtd} O.S.
          </span>
          <span className="w-28 shrink-0 text-right font-medium tabular-nums text-slate-800">
            {dinheiro(c.valor)}
          </span>
        </div>
      ))}
      {semOS > 0 && (
        /* A venda sem O.S. NÃO entra no ranking: ela não tem comprador
           identificado. Ficaria como uma linha sem nome no meio de gente com
           nome, e alguém somaria a coluna achando que fecha com o total. */
        <div className="border-t border-slate-100 pt-2 text-xs text-slate-500">
          Mais {dinheiro(semOS)} em vendas sem O.S., que não têm comprador identificado e por isso
          não entram no ranking.
        </div>
      )}
    </div>
  );
}

/* O EXTRATO, que SÓ existe no papel.
 *
 * A tela é dividida por tarefa (ligar cliente, escolher O.S.); o papel é
 * dividido pela PERGUNTA -- ranking primeiro, lista depois. Numa eleição com
 * vinte candidaturas, o que se leva para a reunião é o ranking; a lista de
 * O.S. é a prova dele, e é ela que quebra em várias páginas. Por isso
 * `<table>`: quebra de página no meio de trinta linhas é o caso normal, e é o
 * que o navegador sabe fazer.
 */
const th = { textAlign: "left", fontSize: "8pt", fontWeight: 700, padding: "3px 6px", borderBottom: "1px solid #999" };
const td = { fontSize: "8.5pt", padding: "3px 6px", borderBottom: "1px solid #eee" };
const tdN = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };

function ExtratoImpresso({ e }) {
  return (
    <div className="apenas-impressao" style={{ marginTop: 10 }}>
      <h2 style={{ fontSize: "11pt", margin: "10px 0 4px" }}>Quem comprou</h2>
      {e.porCliente.length ? (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...th, width: "2rem" }}>#</th>
              <th style={th}>Comprador</th>
              <th style={{ ...th, width: "10rem" }}>CNPJ / CPF</th>
              <th style={{ ...th, textAlign: "right", width: "4rem" }}>O.S.</th>
              <th style={{ ...th, textAlign: "right", width: "7rem" }}>Valor</th>
              <th style={{ ...th, textAlign: "right", width: "4rem" }}>Fatia</th>
            </tr>
          </thead>
          <tbody>
            {e.porCliente.map((c, i) => (
              <tr key={c.chave}>
                <td style={td}>{i + 1}</td>
                <td style={td}>{c.cliente}</td>
                <td style={td}>{c.cnpj ? formatarDoc(c.cnpj) : "—"}</td>
                <td style={tdN}>{c.qtd}</td>
                <td style={tdN}>{dinheiro(c.valor)}</td>
                <td style={tdN}>{e.vendidoOS > 0 ? `${Math.round((c.valor / e.vendidoOS) * 100)}%` : "—"}</td>
              </tr>
            ))}
            <tr>
              <td style={{ ...td, fontWeight: 700 }} colSpan={4}>Total em O.S.</td>
              <td style={{ ...tdN, fontWeight: 700 }}>{dinheiro(e.vendidoOS)}</td>
              <td style={td} />
            </tr>
          </tbody>
        </table>
      ) : (
        <p style={{ fontSize: "9pt" }}>Nenhuma O.S. marcada nesta campanha.</p>
      )}

      {e.vendasSemOS.length > 0 && (
        <>
          <h2 style={{ fontSize: "11pt", margin: "14px 0 4px" }}>Vendas sem O.S.</h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {e.vendasSemOS.map((l) => (
                <tr key={l.id}>
                  <td style={{ ...td, width: "5.5rem" }}>{dataLonga(l.data)}</td>
                  <td style={td}>{l.descricao}</td>
                  <td style={{ ...td, width: "11rem" }}>{l.anexo?.nome || "—"}</td>
                  <td style={{ ...tdN, width: "7rem" }}>{dinheiro(l.valor)}</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...td, fontWeight: 700 }} colSpan={3}>Total sem O.S.</td>
                <td style={{ ...tdN, fontWeight: 700 }}>{dinheiro(e.semOS)}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      <h2 style={{ fontSize: "11pt", margin: "14px 0 4px" }}>As O.S. da campanha</h2>
      {e.porData.length ? (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...th, width: "5.5rem" }}>Data</th>
              <th style={{ ...th, width: "6rem" }}>O.S.</th>
              <th style={th}>Comprador</th>
              <th style={{ ...th, textAlign: "right", width: "6.5rem" }}>Bruto</th>
              <th style={{ ...th, textAlign: "right", width: "6.5rem" }}>Desconto</th>
              <th style={{ ...th, textAlign: "right", width: "7rem" }}>Valor</th>
            </tr>
          </thead>
          <tbody>
            {e.porData.map((l) => (
              <tr key={l.id}>
                <td style={td}>{dataLonga(l.data)}</td>
                <td style={td}>{l.numero}</td>
                <td style={td}>
                  {l.cliente}
                  {l.sumiu && <span style={{ fontWeight: 700 }}> (sumiu do ERP)</span>}
                  {l.mudou && <span style={{ fontWeight: 700 }}> (valor mudou)</span>}
                </td>
                <td style={tdN}>{l.desconto > 0 ? dinheiro(l.bruto) : "—"}</td>
                <td style={tdN}>{l.desconto > 0 ? `− ${dinheiro(l.desconto)}` : "—"}</td>
                <td style={tdN}>{dinheiro(l.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p style={{ fontSize: "9pt" }}>Nenhuma O.S. marcada.</p>
      )}

      <h2 style={{ fontSize: "11pt", margin: "14px 0 4px" }}>Total da campanha</h2>
      <table style={{ width: "60%", borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={td}>Vendido em O.S.</td>
            <td style={tdN}>{dinheiro(e.vendidoOS)}</td>
          </tr>
          {e.semOS > 0 && (
            <tr>
              <td style={td}>Vendido sem O.S.</td>
              <td style={tdN}>{dinheiro(e.semOS)}</td>
            </tr>
          )}
          <tr>
            <td style={{ ...td, fontWeight: 700, borderTop: "2px solid #333" }}>Total vendido</td>
            <td style={{ ...tdN, fontWeight: 700, borderTop: "2px solid #333" }}>{dinheiro(e.vendido)}</td>
          </tr>
          {e.meta > 0 && (
            <tr>
              <td style={td}>Meta {e.pct >= 1 ? "batida" : "não batida"} ({dinheiro(e.meta)})</td>
              <td style={tdN}>{Math.round(e.pct * 100)}%</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// -------------------------------------------------------------------- tela

const VENDA_VAZIA = { descricao: "", valor: "", data: "" };

export default function Campanhas() {
  const [mapa, setMapa] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  /* O "deu certo" some sozinho; o ERRO fica até a pessoa fechar. Aviso bom que
     gruda vira ruído e ensina a ignorar a faixa — e aí o erro passa batido. */
  useEffect(() => {
    if (aviso?.tom !== "ok") return;
    const t = setTimeout(() => setAviso((a) => (a?.tom === "ok" ? null : a)), 4000);
    return () => clearTimeout(t);
  }, [aviso]);
  const [aberta, setAberta] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const [ordens, setOrdens] = useState([]);
  const [buscandoOS, setBuscandoOS] = useState(false);
  const [buscaCliente, setBuscaCliente] = useState("");
  const [achados, setAchados] = useState([]);
  const [buscaOS, setBuscaOS] = useState("");
  const [formVenda, setFormVenda] = useState(null);
  const [gruposAbertos, setGruposAbertos] = useState({});
  const alternarGrupo = useCallback((k) => setGruposAbertos((g) => ({ ...g, [k]: !g[k] })), []);
  const [abertas, setAbertas] = useState(() => {
    const padrao = { ranking: true, aceitas: true, semOS: false, clientes: true, escolher: true, historico: false };
    try {
      return { ...padrao, ...JSON.parse(localStorage.getItem("campanhas_secoes") || "{}") };
    } catch {
      return padrao;
    }
  });
  const alternar = useCallback((id) => {
    setAbertas((a) => {
      const novo = { ...a, [id]: !a[id] };
      try { localStorage.setItem("campanhas_secoes", JSON.stringify(novo)); } catch { /* aba anônima */ }
      return novo;
    });
  }, []);
  const arquivoRef = useRef(null);

  /* ATÉ ONDE O PAINEL TEM O.S. GUARDADA. Sem isto a tela não distingue "não
     vendemos nada para esse evento" de "o painel ainda não foi buscar esse
     período no ERP" -- as duas dão lista vazia, e a campanha de 2022 pareceria
     um fracasso quando é só dado que não desceu. */
  const [cobertura, setCobertura] = useState(null);

  useEffect(() => {
    let vivo = true;
    lerCampanhas()
      .then((m) => vivo && setMapa(m))
      .catch((e) => vivo && setErro(e.message));
    lerCobertura()
      .then((c) => vivo && setCobertura(c))
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  const campanha = aberta ? mapa?.[aberta] : null;

  /* DE QUANDO PROCURAR: campo DA CAMPANHA. O padrão é 1º de janeiro do ano
     dela -- é a data certa em praticamente todo caso, e sem ela a busca traz a
     carteira inteira desde 2020 para uma eleição de 2026. Continua editável:
     campanha que começa a vender em novembro do ano anterior existe. */
  const desde = String(campanha?.desde || "").slice(0, 10);

  const chavesTexto = (campanha?.clientes || []).map((c) => c.chave).sort().join("|");
  const chavesDaCampanha = useMemo(() => (chavesTexto ? chavesTexto.split("|") : []), [chavesTexto]);

  const idsTexto = Object.values(mapa || {})
    .flatMap((c) => Object.keys(c?.os || {}))
    .sort()
    .join("|");

  useEffect(() => {
    let vivo = true;
    setBuscandoOS(true);
    const pedido = aberta
      ? (chavesDaCampanha.length ? buscarOrdensDe(chavesDaCampanha, desde) : Promise.resolve([]))
      : buscarOrdensPorId(idsTexto ? [...new Set(idsTexto.split("|"))] : []);
    pedido
      .then((os) => vivo && setOrdens(os))
      .catch((e) => vivo && setAviso({ tom: "erro", texto: e.message }))
      .finally(() => vivo && setBuscandoOS(false));
    return () => { vivo = false; };
  }, [aberta, chavesDaCampanha, desde, idsTexto]);

  useEffect(() => {
    const t = buscaCliente.trim();
    if (t.length < 2) { setAchados([]); return undefined; }
    let vivo = true;
    const id = setTimeout(() => {
      buscarClientes(t, desde)
        .then((cs) => vivo && setAchados(cs))
        .catch(() => vivo && setAchados([]));
    }, 280);
    return () => { vivo = false; clearTimeout(id); };
  }, [buscaCliente, desde]);

  /* O MESMO CLIENTE PODE ESTAR EM VÁRIAS CAMPANHAS, e é o normal: o candidato
     comprou na eleição de 2022 e na de 2026. A MESMA O.S., não: ela foi
     vendida para um evento só. `donoPorOS` percorre as CAMPANHAS (não as
     permutas -- são perguntas diferentes) e trava a O.S. que já está em outra,
     senão ela somaria duas vezes no total do ano e ninguém veria de onde veio
     a diferença. A tela diz em qual campanha ela está, para a pessoa poder
     tirar de lá se foi engano. */
  const donos = useMemo(() => donoPorOS(mapa || {}), [mapa]);
  const lista = useMemo(() => resumoGeralCampanhas(mapa || {}, ordens, ANO_HOJE), [mapa, ordens]);
  const totais = useMemo(() => totaisDasCampanhas(lista, ANO_HOJE), [lista]);
  const rankingGeral = useMemo(
    () => compradoresDaCampanha(lista.filter((c) => String(c.ano || "") === String(ANO_HOJE))),
    [lista],
  );
  const resumo = useMemo(() => (campanha ? resumoDaCampanha(campanha, ordens) : null), [campanha, ordens]);
  const extrato = useMemo(() => (campanha ? extratoDaCampanha(campanha, ordens) : null), [campanha, ordens]);

  const mapaRef = useRef(null);
  useEffect(() => { mapaRef.current = mapa; }, [mapa]);

  /* Gravações em FILA, e sempre a partir do pacote que o SERVIDOR devolveu.
     Sem a fila, dois cliques seguidos partem do mesmo retrato e o segundo
     grava por cima do primeiro — o servidor funde raso (`v_reg || p_campos`).
     Foi assim que uma marcação de cliente sumiu na permuta. */
  const filaRef = useRef(Promise.resolve());
  const mexer = useCallback((id, o) => {
    const proxima = filaRef.current.then(async () => {
      setAviso(null);
      setSalvando(true);
      try {
        const novo = typeof o === "function"
          ? await mexerNaCampanha(id, o(mapaRef.current?.[id]))
          : await mexerNaCampanha(id, o);
        mapaRef.current = novo;
        setMapa(novo);
        // Devolve o REGISTRO gravado, não um "true": "não deu erro" nunca foi
        // prova de que gravou.
        return novo?.[id] ?? null;
      } catch (e) {
        setAviso({ tom: "erro", texto: e.message });
        return null;
      } finally {
        setSalvando(false);
      }
    });
    filaRef.current = proxima.then(() => {}, () => {});
    return proxima;
  }, []);

  const criar = useCallback(async () => {
    const id = novoId("campanha");
    const ok = await mexer(id, {
      campos: {
        nome: "Nova campanha", ano: String(ANO_HOJE), meta: 0, clientes: [],
        // Já nasce recortada no ano: ver o comentário do `desde`.
        desde: `${ANO_HOJE}-01-01`,
      },
      criar: true,
    });
    if (ok) setAberta(id);
  }, [mexer]);

  const apagar = useCallback(async (id, nome) => {
    if (!window.confirm(`Apagar a campanha "${nome || "sem nome"}"? O histórico, as vendas e os anexos vão junto.`)) return;
    setAviso(null);
    try {
      await removerCampanha(id);
      setMapa((m) => {
        const novo = { ...(m || {}) };
        delete novo[id];
        return novo;
      });
      setAberta(null);
    } catch (e) {
      setAviso({ tom: "erro", texto: e.message });
    }
  }, []);

  const marcarOS = useCallback(
    async (o, ligar) => {
      if (!aberta) return;
      const bruta = ordens.find((x) => String(x.id) === String(o.id));
      const ficha = ligar ? fichaDaOS(bruta || o) : null;
      /* A O.S. só pode ir como OBJETO. O banco percorre o patch chave a chave
         e só aplica o que for objeto ou nulo — qualquer outra coisa ele PULA
         em silêncio, e o clique não faz nada sem dizer por quê. */
      if (ligar && (!ficha || typeof ficha !== "object")) {
        setAviso({ tom: "erro", texto: `Não consegui montar a ficha da O.S. ${o.numero || o.id}. Recarregue a página e tente de novo.` });
        return;
      }
      const gravado = await mexer(aberta, { osPatch: { [o.id]: ficha } });
      // Confere o EFEITO, não a ausência de erro.
      if (gravado) {
        const tem = !!(gravado.os || {})[o.id];
        if (ligar !== tem) {
          setAviso({
            tom: "erro",
            texto: `Não consegui ${ligar ? "marcar" : "tirar"} a O.S. ${o.numero || o.id}. Tente de novo e, se repetir, me avise.`,
          });
        }
      }
    },
    [aberta, ordens, mexer],
  );

  const ligarCliente = useCallback(
    async (c) => {
      if (!aberta) return;
      const gravado = await mexer(aberta, (atual) => {
        const atuais = atual?.clientes || [];
        if (atuais.some((x) => x.chave === c.chave)) return { campos: {} };
        return { campos: { clientes: [...atuais, { chave: c.chave, nome: c.nome, cnpjs: c.cnpjs || [] }] } };
      });
      if (!gravado) return; // o erro da rede já foi mostrado pelo mexer
      const entrou = (gravado.clientes || []).some((x) => x.chave === c.chave);
      setAviso(entrou
        ? { tom: "ok", texto: `${c.nome} ligado(a). Agora são ${(gravado.clientes || []).length} nesta campanha.` }
        : {
            tom: "erro",
            texto: `Não consegui ligar ${c.nome}. O servidor respondeu sem erro, mas o nome não ficou na campanha — tente de novo e, se repetir, me avise.`,
          });
    },
    [aberta, mexer],
  );

  /* Tirar o cliente NÃO tira as O.S. dele já marcadas: a venda aconteceu, e
     sumir com ela aqui faria o total da campanha encolher sozinho. */
  const desligarCliente = useCallback(
    async (chave) => {
      if (!aberta) return;
      await mexer(aberta, (atual) => ({
        campos: { clientes: (atual?.clientes || []).filter((x) => x.chave !== chave) },
      }));
    },
    [aberta, mexer],
  );

  const salvarVenda = useCallback(async () => {
    if (!aberta || !formVenda) return;
    const valor = paraNumero(formVenda.valor);
    if (!valor) {
      setAviso({ tom: "erro", texto: "Informe um valor." });
      return;
    }
    const id = formVenda.id || novoId("venda");
    const ok = await mexer(aberta, {
      lancPatch: {
        [id]: {
          data: formVenda.data || hojeISO(),
          descricao: String(formVenda.descricao || "").trim().slice(0, 200),
          valor,
        },
      },
    });
    if (ok) setFormVenda(null);
  }, [aberta, formVenda, mexer]);

  /* Um input de arquivo para a tela inteira; `alvoAnexo` diz de qual venda é o
     próximo arquivo. Um input por linha carregaria estado próprio, e um deles
     com o valor antigo anexa o arquivo errado na linha errada. */
  const alvoAnexo = useRef(null);
  const pedirArquivo = useCallback((venda) => {
    alvoAnexo.current = venda?.id || null;
    arquivoRef.current?.click();
  }, []);

  const anexar = useCallback(
    async (file) => {
      const lancId = alvoAnexo.current;
      alvoAnexo.current = null;
      if (!aberta || !file) return;
      setAviso(null);
      setSalvando(true);
      try {
        const buf = new Uint8Array(await file.arrayBuffer());
        let bin = "";
        const BLOCO = 0x8000;
        for (let i = 0; i < buf.length; i += BLOCO) bin += String.fromCharCode(...buf.subarray(i, i + BLOCO));
        setMapa(await anexarNaCampanha(aberta, {
          lancId,
          nome: file.name, mime: file.type || "application/octet-stream", base64: btoa(bin),
        }));
        setAviso({ tom: "ok", texto: `"${file.name}" anexado.` });
      } catch (e) {
        setAviso({ tom: "erro", texto: e.message });
      } finally {
        setSalvando(false);
        if (arquivoRef.current) arquivoRef.current.value = "";
      }
    },
    [aberta],
  );

  const baixar = useCallback(
    async (a) => {
      try {
        const r = await lerAnexoCampanha(aberta, a.chave);
        const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: r.mime }));
        const el = document.createElement("a");
        el.href = url;
        el.download = r.nome || "documento";
        el.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        setAviso({ tom: "erro", texto: e.message });
      }
    },
    [aberta],
  );

  const paraEscolher = useMemo(
    () => ordensDosClientes(ordens, chavesDaCampanha, donos, aberta),
    [ordens, chavesDaCampanha, donos, aberta],
  );
  /* A O.S. JÁ MARCADA SAI DAQUI: esta lista existe para achar o que FALTA. Quem
     já entrou está logo acima e sai de lá pelo botão de tirar. */
  const paraEscolherFiltradas = useMemo(() => {
    const livres = paraEscolher.filter((o) => !o.nesta);
    const t = buscaOS.trim().toLowerCase();
    if (!t) return livres;
    return livres.filter((o) => o.numero.toLowerCase().includes(t) || o.cliente.toLowerCase().includes(t));
  }, [paraEscolher, buscaOS]);
  const jaMarcadasAqui = useMemo(() => paraEscolher.filter((o) => o.nesta).length, [paraEscolher]);

  const clientesAchados = useMemo(() => {
    const jaTem = new Set(chavesDaCampanha);
    return achados.filter((c) => !jaTem.has(c.chave));
  }, [achados, chavesDaCampanha]);

  const gruposMarcadas = useMemo(() => resumo?.porCliente || [], [resumo]);

  if (erro) {
    return (
      <div className="space-y-6">
        <PageTitle titulo="Campanhas" descricao="Quanto vendemos para cada evento, e quem comprou." />
        <Card className="flex items-start gap-2 text-sm text-bad-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {erro}
        </Card>
      </div>
    );
  }
  if (mapa === null) return <CarregandoModulo />;

  // ----------------------------------------------------------- uma campanha
  if (campanha && resumo) {
    const eventos = [...(campanha.historico || [])].reverse();
    return (
      <div className="space-y-5">
        <button
          type="button"
          onClick={() => setAberta(null)}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft size={15} /> Todas as campanhas
        </button>

        <Aviso aviso={aviso} aoFechar={() => setAviso(null)} />

        <input ref={arquivoRef} type="file" className="hidden" onChange={(e) => anexar(e.target.files?.[0])} />

        <Card className="space-y-4">
          {/* SÓ NO PAPEL: na tela o nome está no campo ao lado, que o
              `@media print` esconde por ser `input` — sem isto o PDF sairia
              sem dizer de que campanha é. */}
          <CabecalhoImpressao
            titulo={`Impresilk — Campanha: ${campanha.nome || "sem nome"}${campanha.ano ? ` (${campanha.ano})` : ""}`}
            linhas={[
              `${resumo.compradores} ${resumo.compradores === 1 ? "comprador" : "compradores"} · ${resumo.linhas.length} O.S.`,
              `Emitido em ${dataLonga(hojeISO())}`,
              `Total vendido ${dinheiro(resumo.vendido)}`,
            ]}
          />
          <div className="flex flex-wrap items-start justify-between gap-4">
            {/* NO CELULAR o nome ocupa a linha inteira e os botões vão para a
                linha de baixo. Sem o `w-full`, este bloco recebia `flex-1`
                com `min-w-0` e encolhia para OITO PIXELS: os campos vazavam
                para fora e o "Baixar PDF" era desenhado por cima do nome. */}
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:min-w-0 sm:flex-1">
              <input
                className="input min-w-[12rem] max-w-sm flex-1 text-lg font-medium"
                value={campanha.nome ?? ""}
                placeholder="Qual é o evento?"
                onChange={(e) => setMapa((m) => ({ ...m, [aberta]: { ...m[aberta], nome: e.target.value } }))}
                onBlur={(e) => mexer(aberta, { campos: { nome: e.target.value } })}
              />
              <input
                className="input h-10 w-24 text-center"
                value={campanha.ano ?? ""}
                placeholder="Ano"
                inputMode="numeric"
                maxLength={4}
                onChange={(e) => setMapa((m) => ({ ...m, [aberta]: { ...m[aberta], ano: e.target.value.replace(/\D/g, "") } }))}
                onBlur={(e) => {
                  const ano = e.target.value.replace(/\D/g, "").slice(0, 4);
                  /* O ANO ARRASTA A DATA DE BUSCA -- mas só quando ela ainda é
                     o 1º de janeiro que a criação pôs. Sem isto, trocar o ano
                     para 2022 deixava a busca presa em 2026 e a campanha
                     aparecia VAZIA: a pessoa concluiria que não vendeu nada
                     naquela eleição, quando o painel só estava olhando o ano
                     errado. Data escolhida à mão não é mexida. */
                  const campos = { ano };
                  const padraoAntigo = `${campanha.ano || ANO_HOJE}-01-01`;
                  if (/^\d{4}$/.test(ano) && (!desde || desde === padraoAntigo)) {
                    campos.desde = `${ano}-01-01`;
                  }
                  mexer(aberta, { campos });
                }}
              />
            </div>
            <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
              {/* O PDF é a TELA impressa, não um documento paralelo: um gerador
                  separado vira uma segunda verdade que ninguém lembra de
                  atualizar junto. */}
              <BotaoPDF titulo="Gera um PDF desta campanha" />
              <button
                type="button"
                className="btn-ghost"
                onClick={() => mexer(aberta, { campos: { encerrada: !campanha.encerrada } })}
                title={campanha.encerrada ? "Reabrir a campanha" : "Encerrar: sai do topo da lista, o histórico fica"}
              >
                <Archive size={15} /> {campanha.encerrada ? "Reabrir" : "Encerrar"}
              </button>
              <button
                type="button"
                className="rounded-lg p-2 text-slate-300 hover:bg-bad-50 hover:text-bad-600"
                onClick={() => apagar(aberta, campanha.nome)}
                title="Apagar a campanha"
                aria-label="Apagar a campanha"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <div className="mb-1 text-xs text-slate-500">Vendido nesta campanha</div>
              <div className="text-2xl font-semibold tabular-nums text-slate-800">{dinheiro(resumo.vendido)}</div>
              <div className="text-xs text-slate-500">
                {resumo.linhas.length} O.S.
                {resumo.semOS > 0 && <> · {dinheiro(resumo.semOS)} sem O.S.</>}
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">Compradores</div>
              <div className="text-2xl font-semibold tabular-nums text-slate-800">{resumo.compradores}</div>
              <div className="text-xs text-slate-500">
                {resumo.maiorFatia != null
                  ? `o maior levou ${Math.round(resumo.maiorFatia * 100)}%`
                  : "ninguém marcado ainda"}
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">Meta do evento</div>
              <input
                className="input h-9 w-32 text-right tabular-nums"
                placeholder="0,00"
                inputMode="decimal"
                defaultValue={campanha.meta ? String(campanha.meta).replace(".", ",") : ""}
                key={`meta-${aberta}`}
                onBlur={(e) => {
                  const v = paraNumero(e.target.value);
                  if (v === (campanha.meta || 0)) return;
                  mexer(aberta, { campos: { meta: v } });
                }}
              />
              <div className="mt-1 text-xs text-slate-500">
                {resumo.meta > 0 ? "opcional — em branco, a tela não cobra" : "opcional"}
              </div>
            </div>
          </div>
          <Meta vendido={resumo.vendido} meta={resumo.meta} pct={resumo.pct} />

          {(resumo.mudaram > 0 || resumo.sumiram > 0 || resumo.semConferir) && (
            <div className="rounded-lg bg-warn-50 px-3 py-2 text-xs text-warn-800">
              {resumo.semConferir && "As O.S. não carregaram nesta sessão: o total está usando o valor congelado na marcação. "}
              {resumo.mudaram > 0 && `${resumo.mudaram} O.S. mudaram de valor no ERP depois de marcadas (o total já usa o valor novo). `}
              {resumo.sumiram > 0 && `${resumo.sumiram} O.S. sumiram do ERP (cancelamento) e continuam somando — confira se ainda contam.`}
            </div>
          )}
        </Card>

        {/* ------------------------------------------------- quem comprou */}
        <Secao
          semImpressao
          id="ranking"
          titulo="Quem comprou"
          sub="A metade da pergunta que a campanha existe para responder — por valor, do maior para o menor."
          aberta={abertas.ranking}
          aoAlternar={alternar}
        >
          <Ranking itens={resumo.porCliente} semOS={resumo.semOS} />
        </Secao>

        <Secao
          semImpressao
          id="historico"
          titulo="Histórico da campanha"
          sub="Escrito pelo servidor a cada mudança."
          aberta={abertas.historico}
          aoAlternar={alternar}
        >
          <Historico eventos={eventos} conta={CONTA_O_EVENTO} />
        </Secao>

        {/* ------------------------------------------------- de quem é */}
        <Secao
          id="clientes"
          titulo="Compradores desta campanha"
          sub="Cada candidatura, cada empresa do evento. Ligue aqui para as O.S. dela aparecerem abaixo."
          aberta={abertas.clientes}
          aoAlternar={alternar}
        >
          <div className="flex flex-wrap gap-2">
            {(campanha.clientes || []).map((c) => (
              <span key={c.chave} className="flex items-center gap-1.5 rounded-full bg-slate-100 py-1 pl-3 pr-1.5 text-sm text-slate-700">
                <Building2 size={13} className="text-slate-400" />
                <span>{c.nome}</span>
                {(c.cnpjs || []).length > 0 && (
                  <span className="text-[11px] text-slate-400">{c.cnpjs.map(formatarDoc).join(" · ")}</span>
                )}
                <button
                  type="button"
                  onClick={() => desligarCliente(c.chave)}
                  className="rounded-full p-1 text-slate-400 hover:bg-white hover:text-bad-600"
                  aria-label={`Tirar ${c.nome} desta campanha`}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            {!(campanha.clientes || []).length && (
              <span className="text-sm text-slate-400">Nenhum ainda — procure abaixo.</span>
            )}
          </div>

          <div className="relative max-w-md">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Procurar comprador pelo nome…"
              value={buscaCliente}
              onChange={(e) => setBuscaCliente(e.target.value)}
            />
            {clientesAchados.length > 0 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                {clientesAchados.map((c) => (
                  <button
                    key={c.chave}
                    type="button"
                    /* NÃO travar durante o salvamento: travado, o segundo
                       clique seria IGNORADO em vez de enfileirado. Quem garante
                       que os dois ficam é a fila do `mexer`. */
                    onClick={() => ligarCliente(c)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-slate-800">{c.nome}</span>
                      {(c.cnpjs || []).length > 0 && (
                        <span className="text-[11px] text-slate-400">{c.cnpjs.map(formatarDoc).join(" · ")}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-[11px] text-slate-400">{c.qtd} O.S. · {dinheiro(c.total)}</span>
                  </button>
                ))}
              </div>
            )}
            {buscaCliente.trim().length >= 2 && !clientesAchados.length && (
              <div className="mt-1 text-xs text-slate-400">
                Nenhum cliente com esse nome nas O.S. a partir de {dataLonga(desde)}.
              </div>
            )}
          </div>
        </Secao>

        {/* ------------------------------------------------- as marcadas */}
        <Secao
          semImpressao
          id="aceitas"
          titulo="O.S. desta campanha"
          sub="É o que forma o total. Agrupadas por CNPJ quando há mais de um comprador."
          aberta={abertas.aceitas}
          aoAlternar={alternar}
        >
          {!resumo.linhas.length ? (
            <Empty>Nenhuma O.S. marcada ainda. Marque abaixo as que são deste evento.</Empty>
          ) : gruposMarcadas.length > 1 ? (
            <div>
              {gruposMarcadas.map((g) => (
                <GrupoCliente
                  key={g.chave}
                  g={g}
                  aberto={!!gruposAbertos[g.chave]}
                  aoAlternar={alternarGrupo}
                  aoTirar={(x) => marcarOS(x, false)}
                  onde="campanha"
                />
              ))}
            </div>
          ) : (
            <div>
              {resumo.linhas.map((l) => (
                <LinhaAceita key={l.id} l={l} aoTirar={(x) => marcarOS(x, false)} onde="campanha" />
              ))}
            </div>
          )}
        </Secao>

        {/* ------------------------------------------------- venda sem O.S. */}
        <Secao
          semImpressao
          id="semOS"
          titulo="Vendas sem O.S."
          sub="O que foi deste evento mas não virou ordem de serviço. Sem este lugar, alguém inventa uma O.S. para fechar o total."
          aberta={abertas.semOS}
          aoAlternar={alternar}
          acao={
            !formVenda && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => { if (!abertas.semOS) alternar("semOS"); setFormVenda({ ...VENDA_VAZIA, data: hojeISO() }); }}
              >
                <Plus size={15} strokeWidth={2.4} /> Lançar venda
              </button>
            )
          }
        >
          {formVenda && (
            <FormVenda
              form={formVenda}
              setForm={setFormVenda}
              aoSalvar={salvarVenda}
              aoCancelar={() => setFormVenda(null)}
              salvando={salvando}
            />
          )}
          {resumo.vendasSemOS.length ? (
            <div>
              {resumo.vendasSemOS.map((l) => (
                <LinhaVenda
                  key={l.id}
                  l={l}
                  aoTirar={(x) => mexer(aberta, { lancPatch: { [x.id]: null } })}
                  aoAnexar={pedirArquivo}
                  aoBaixar={baixar}
                />
              ))}
            </div>
          ) : (
            !formVenda && <Empty>Nenhuma venda fora de O.S. — o normal é que tudo passe por O.S.</Empty>
          )}
        </Secao>

        {/* ------------------------------------------------- escolher */}
        <Secao
          id="escolher"
          titulo="Marcar O.S."
          sub="O que ainda NÃO entrou, dos compradores acima. O mesmo cliente também compra fora do evento — por isso cada O.S. entra por um clique."
          aberta={abertas.escolher}
          aoAlternar={alternar}
          acao={
            paraEscolher.length > 8 && (
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  className="input h-8 w-44 pl-8 text-sm"
                  placeholder="nº ou cliente"
                  value={buscaOS}
                  onChange={(e) => setBuscaOS(e.target.value)}
                />
              </div>
            )
          }
        >
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <CalendarRange size={15} className="shrink-0 text-slate-400" />
            <span className="text-slate-600">Procurar O.S. desta campanha a partir de</span>
            <input
              type="date"
              className="input h-8 w-40 text-sm"
              defaultValue={desde}
              key={`desde-${aberta}`}
              onBlur={(e) => {
                const d = e.target.value;
                if (d === desde) return;
                mexer(aberta, { campos: { desde: /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "" } });
              }}
            />
            {!desde && <span className="text-xs text-slate-400">vazio = tudo o que o painel tem</span>}
          </div>

          {/* O QUE O PAINEL REALMENTE TEM: uma campanha de 2022 pode parecer um
              fracasso quando é só dado que ainda não desceu do ERP. */}
          {cobertura?.desde && desde && desde < String(cobertura.desde) && (
            <div className="rounded-lg bg-warn-50 px-3 py-2 text-xs text-warn-800">
              Você pediu a partir de {dataLonga(desde)}, mas o painel só tem O.S. guardada desde{" "}
              {dataLonga(cobertura.desde)}. O que estiver antes disso não aparece aqui até a carga do
              histórico rodar (domingo de madrugada, ou pelo botão “Run workflow” no GitHub).
            </div>
          )}
          {!chavesDaCampanha.length ? (
            <Empty>Ligue um comprador acima para ver as O.S. dele.</Empty>
          ) : buscandoOS ? (
            <Empty>Procurando as O.S. desde {dataLonga(desde)}…</Empty>
          ) : paraEscolherFiltradas.length ? (
            <div>
              {paraEscolherFiltradas.map((o) => (
                <LinhaEscolher key={o.id} o={o} aoMarcar={marcarOS} onde="campanha" />
              ))}
            </div>
          ) : (
            <Empty>
              {buscaOS.trim()
                ? "Nenhuma O.S. com esse número ou nome."
                : jaMarcadasAqui > 0
                  ? `Todas as ${jaMarcadasAqui} O.S. desses compradores já entraram na campanha.`
                  : `Esses compradores não têm O.S. a partir de ${dataLonga(desde)}.`}
            </Empty>
          )}
        </Secao>

        {/* O EXTRATO fica por ÚLTIMO no DOM mas é a única coisa que vai ao
            papel: as seções acima são `sem-impressao`. */}
        {extrato && <ExtratoImpresso e={extrato} />}

        {salvando && <div className="text-xs text-slate-400">salvando…</div>}
      </div>
    );
  }

  // ------------------------------------------------------------- a lista
  return (
    <div className="space-y-5">
      <PageTitle
        titulo="Campanhas"
        descricao="Quanto vendemos para cada evento, e quem comprou."
        acao={
          <button type="button" className="btn-ghost" onClick={criar} disabled={salvando}>
            <Plus size={15} strokeWidth={2.4} /> Nova campanha
          </button>
        }
      />

      <Aviso aviso={aviso} aoFechar={() => setAviso(null)} />

      {/* OS NÚMEROS DO ANO, não de todos os tempos.
          "Quanto a eleição de 2026 rendeu" não se compara com a soma de tudo o
          que já foi vendido em evento desde 2020 — o total geral existe, mas
          como rodapé. Campanha encerrada continua contando no ano dela: ela
          aconteceu. */}
      {lista.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="p-4">
            <div className="text-xs text-slate-500">Vendido em campanhas em {ANO_HOJE}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-800">{dinheiro(totais.vendidoNoAno)}</div>
            <div className="mt-0.5 text-xs text-slate-500">
              {totais.quantasNoAno} {totais.quantasNoAno === 1 ? "campanha" : "campanhas"} · {totais.osNoAno} O.S.
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-xs text-slate-500">Compradores em {ANO_HOJE}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-800">{totais.compradoresNoAno}</div>
            <div className="mt-0.5 text-xs text-slate-500">
              {/* DISTINTOS: o mesmo comprador em duas campanhas conta uma vez.
                  Somar os compradores de cada uma inflaria o número. */}
              empresas diferentes — quem comprou em duas campanhas conta uma vez
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-xs text-slate-500">Todas as campanhas</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-800">{dinheiro(totais.vendidoTotal)}</div>
            <div className="mt-0.5 text-xs text-slate-500">
              {totais.quantas} {totais.quantas === 1 ? "campanha registrada" : "campanhas registradas"}, todos os anos
            </div>
          </Card>
        </div>
      )}

      {/* QUEM MAIS COMPROU NO ANO, somando as campanhas. É a pergunta feita de
          fora para dentro: numa eleição interessa o candidato; no ano todo
          interessa quem sustentou o faturamento de evento. Só aparece com mais
          de uma campanha no ano — com uma só, seria repetir o ranking dela. */}
      {totais.quantasNoAno > 1 && rankingGeral.length > 0 && (
        <Card className="space-y-3">
          <div className="flex items-center gap-2">
            <Trophy size={15} className="text-slate-400" />
            <span className="text-sm font-medium text-slate-800">Quem mais comprou em {ANO_HOJE}</span>
            <span className="text-xs text-slate-400">somando as campanhas do ano</span>
          </div>
          <Ranking itens={rankingGeral.slice(0, 10)} semOS={0} />
        </Card>
      )}

      {lista.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {lista.map((c) => (
            <CartaoCampanha key={c.id} c={c} aoAbrir={setAberta} />
          ))}
        </div>
      ) : (
        <Card className="py-10 text-center">
          <Megaphone size={28} className="mx-auto mb-3 text-slate-300" />
          <div className="text-sm text-slate-500">
            Nenhuma campanha ainda. Crie uma, ligue os compradores e marque as O.S. do evento.
          </div>
        </Card>
      )}
    </div>
  );
}
