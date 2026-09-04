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
  Archive, Paperclip, Download, CalendarRange, TrendingUp, TrendingDown, Minus,
  Crown, Check, Link2, Copy, RotateCw,
} from "lucide-react";
import {
  lerCampanhas, mexerNaCampanha, removerCampanha, anexarNaCampanha, lerAnexoCampanha,
  buscarClientes, buscarOrdensDe, buscarOrdensPorId, lerCobertura,
  lerAnosPanorama, lerAnosMes, lerAnosMesCal, lerOsFinanceiro,
} from "../services/campanhas.js";
import { financeiroDasLinhas } from "../lib/calc/financeiroOS.js";
import { fichaDaOS, ordensDosClientes, donoPorOS, unirOrdens } from "../lib/calc/permutas.js";
import {
  resumoDaCampanha, resumoGeralCampanhas, compradoresDaCampanha, extratoDaCampanha,
  anosDasCampanhas, totaisDoAno, comparativoPorAno, edicoesDoMesmoEvento, anosRepetidos,
  maiorComprador, comprasPorMes, produtosDaCampanha, categoriasDosProdutos, porProduto,
  membrosDoEvento, candidatasAVincular, comparativoDeEdicoes, eventosVinculados,
  panoramaPorAno, epocaDoAno, semCampanhas, mesCalendarioComparado,
} from "../lib/calc/campanhas.js";
import { paraNumero, dataLonga } from "../lib/format.js";
import { MES_CURTO, rotuloMes, mil, BarrasAno } from "../components/barras.jsx";
import { AbaVendedores, AbaClientes, AbaProdutos } from "../components/analiseVendas.jsx";
import { Card, PageTitle, Empty, CarregandoModulo, BotaoPDF, CabecalhoImpressao, AvisoDadoParado, Segmented } from "../components/ui.jsx";
import { useApp } from "../config/store.jsx";
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
  /* AS DATAS DECIDEM QUAIS O.S. ENTRAM, então mudá-las muda o total do evento.
     Uma linha de histórico que diz só "mudou o período" não deixa reconstruir
     por que o número era outro semana passada -- por isso a data vai junto. */
  periodo: (e) => (e.para ? `mudou o início da campanha para ${dataLonga(e.para)}` : "tirou a data de início"),
  periodoFim: (e) => (e.para ? `mudou o fim da campanha para ${dataLonga(e.para)}` : "tirou a data de fim"),
  ligouEvento: () => "ligou esta campanha às outras edições do mesmo evento",
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

/* OS DOIS CARTÕES DE COBRANÇA da campanha aberta: Recebido × Em aberto.
   O dado vem dos títulos do contas a receber (a conta está em
   lib/calc/financeiroOS.js, com teste). As notas de rodapé são as ressalvas
   honestas — o que ainda não tem título, o que o mapa não cobre, o corte —
   porque cartão sem ressalva vira afirmação que o dado não sustenta. */
function CartoesFinanceiro({ financeiro, erro, dados }) {
  /* SEM DADO E COM ERRO: o aviso é tudo o que se pode dizer.
     COM DADO E COM ERRO (uma atualização falhou depois de uma boa): mostra os
     números, que continuam respondendo a esta campanha, e avisa embaixo -- o
     aviso sozinho escondia número certo, que é o oposto de informar. */
  if (erro && !financeiro) {
    return (
      <div className="rounded-lg bg-warn-50 px-3 py-2 text-xs text-warn-800">
        Não deu para conferir os títulos das O.S. no contas a receber: {erro} O botão
        “Atualizar” da lista de O.S. tenta de novo.
      </div>
    );
  }
  if (!financeiro) {
    return <div className="text-xs text-slate-400">Conferindo os títulos no contas a receber…</div>;
  }
  const t = financeiro.totais;
  const semMapa = !dados?.temPagos;
  const s = (n) => (n === 1 ? "" : "s");
  /* O TERCEIRO QUADRO só existe quando há troca. Ele não é dinheiro (não entra
     no Recebido) nem cobrança (não entra no Em aberto) -- é a venda que já foi
     acertada com o parceiro. Sem ele, essas O.S. apareciam como "sem título" e
     o financeiro sairia cobrando quem não deve. */
  const temPermuta = t.permutadoValor > 0;
  return (
    <div className="space-y-1.5">
      <div className={`grid gap-3 ${temPermuta ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        <div className="rounded-xl border border-ok-200 bg-ok-50 px-4 py-3">
          <div className="text-xs font-medium text-ok-700">Recebido</div>
          <div className="mt-0.5 text-xl font-semibold tabular-nums text-ok-700">
            {semMapa ? "—" : dinheiro(t.recebido)}
          </div>
          <div className="mt-0.5 text-[11px] text-ok-700/80">
            {semMapa
              ? "o mapa de pagamentos ainda está sendo montado pela carga — volte em alguns minutos"
              : `${t.pagas} O.S. quitada${s(t.pagas)}${dados?.desdeDados ? ` · pagamentos desde ${dataLonga(dados.desdeDados)}` : ""}`}
          </div>
        </div>
        <div
          className={`rounded-xl border px-4 py-3 ${
            t.vencidas > 0
              ? "border-bad-200 bg-bad-50"
              : t.aberto > 0
                ? "border-warn-200 bg-warn-50"
                : "border-slate-200 bg-slate-50"
          }`}
        >
          <div className={`text-xs font-medium ${t.vencidas > 0 ? "text-bad-700" : t.aberto > 0 ? "text-warn-800" : "text-slate-500"}`}>
            Em aberto
          </div>
          <div className={`mt-0.5 text-xl font-semibold tabular-nums ${t.vencidas > 0 ? "text-bad-700" : t.aberto > 0 ? "text-warn-800" : "text-slate-600"}`}>
            {dinheiro(t.aberto)}
          </div>
          <div className={`mt-0.5 text-[11px] ${t.vencidas > 0 ? "text-bad-700/80" : t.aberto > 0 ? "text-warn-800/80" : "text-slate-400"}`}>
            {t.abertas > 0
              ? `${t.abertas} O.S. com título em aberto${t.vencidas > 0 ? ` · ${t.vencidas} vencida${s(t.vencidas)} (${dinheiro(t.vencidoValor)})` : ""}`
              : "nenhum título em aberto"}
          </div>
        </div>
        {temPermuta && (
          <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
            <div className="text-xs font-medium text-brand-700">Em permuta</div>
            <div className="mt-0.5 text-xl font-semibold tabular-nums text-brand-700">
              {dinheiro(t.permutadoValor)}
            </div>
            <div className="mt-0.5 text-[11px] text-brand-600">
              {t.permutadas} O.S. quitada{s(t.permutadas)} em troca — sem cobrança no ERP
            </div>
            {/* NÃO SOMEI EM "RECEBIDO", E DIGO POR QUÊ. O ERP registra
                pagamento nessas O.S. mas não diz se foi dinheiro ou a baixa da
                própria troca; somar inflaria o caixa, calar esconderia o
                número. */}
            {t.permutaPagoNoErp > 0 && (
              <div className="mt-1 text-[11px] text-brand-600">
                {dinheiro(t.permutaPagoNoErp)} {t.permutadas === 1 ? "dela" : "delas"} consta como pago
                no ERP (provável baixa da troca) — fora do “Recebido” para o número continuar sendo caixa.
              </div>
            )}
          </div>
        )}
      </div>
      {(t.semTituloValor > 0 || (t.semDado > 0 && !semMapa) || (dados?.cortados ?? 0) > 0 || t.compartilhadas > 0 || t.naoConsultadas > 0) && (
        <div className="text-[11px] text-slate-500">
          {t.compartilhadas > 0 && (
            <>
              {t.compartilhadas} O.S. (marcada{t.compartilhadas === 1 ? "" : "s"} ∗)
              {t.compartilhadas === 1 ? " é cobrada" : " são cobradas"} em título que junta várias — o
              valor mostrado em cada uma é a parte dela, repartida pelo valor da O.S.
              {t.incertas > 0 && (t.incertas === 1
                ? " 1 dessas foi dividida por igual (falta o valor de alguma O.S. do título)."
                : ` ${t.incertas} dessas foram divididas por igual (falta o valor de alguma O.S. do título).`)}{" "}
            </>
          )}
          {t.semTituloValor > 0 && (
            <>
              {dinheiro(t.semTituloValor)} de {t.semTitulo} O.S. ainda sem título de cobrança no ERP
              (nota não emitida) — não é “pago” nem “em aberto”.{" "}
            </>
          )}
          {t.semDado > 0 && !semMapa && (
            <>{t.semDado} O.S. anterior{t.semDado === 1 ? "" : "es"} a {dados?.desdeDados ? dataLonga(dados.desdeDados) : "2025"} fica{t.semDado === 1 ? "" : "m"} sem selo: o mapa de pagamentos não cobre a época.{" "}</>
          )}
          {t.naoConsultadas > 0 ? (
            /* O QUE NAO FOI PERGUNTADO. Antes estas O.S. levavam selo de "sem
               título no ERP" e o valor delas entrava no total de não-faturado
               -- afirmação de ausência sobre pergunta que não foi feita. Agora
               ficam sem selo e aparecem só aqui. */
            <>
              {t.naoConsultadas} O.S. ({dinheiro(t.naoConsultadoValor)}) não foram conferidas nesta
              consulta — a cobrança desce em lotes de 600 por vez, e essas ficaram de fora. Elas não
              recebem selo: o painel não afirma nada sobre o que não perguntou.
            </>
          ) : (dados?.cortados ?? 0) > 0 && (
            <>A conferência cobriu as primeiras 600 O.S. — {dados.cortados} ficaram de fora.</>
          )}
        </div>
      )}
      {erro && (
        <div className="text-[11px] text-warn-800">
          A última tentativa de atualizar a cobrança falhou ({erro}) — os valores acima são da
          conferência anterior desta campanha.
        </div>
      )}
    </div>
  );
}

/* O CARTÃO DA LISTA. Responde as duas metades da pergunta sem abrir: quanto
   rendeu e quantos compraram. O nome do maior comprador entra porque é o que
   distingue "um evento" de "um cliente grande com nome de evento". */
function CartaoCampanha({ c, aoAbrir, contra, aoDuplicar }) {
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
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium text-slate-800">{c.nome || "sem nome"}</span>
            {/* span-botão porque o cartão inteiro já é <button> e botão dentro
                de botão é HTML inválido. stopPropagation para o toque duplicar
                sem abrir. */}
            {aoDuplicar && (
              <span
                role="button"
                tabIndex={0}
                title={`Duplicar “${c.nome}” para outro ano — leva compradores e meta, sem as O.S.`}
                aria-label={`Duplicar ${c.nome}`}
                className="shrink-0 rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600"
                onClick={(e) => { e.stopPropagation(); aoDuplicar(c); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); aoDuplicar(c); } }}
              >
                <Copy size={13} />
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            {c.ano || "sem ano"}
            {c.encerrada && " · encerrada"}
            {c.linhas.length > 0 && ` · ${c.linhas.length} O.S.`}
            {c.semOS > 0 && " · tem venda sem O.S."}
          </div>
          {(c.desde || c.ate) && (
            <div className="mt-0.5 text-[11px] text-slate-400">
              {c.desde ? dataDaOS(c.desde) : "início não informado"} — {c.ate ? dataDaOS(c.ate) : "hoje"}
            </div>
          )}
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

      {/* A COMPARAÇÃO NA ÚLTIMA LINHA: "cresceu?" é a pergunta que se faz
          batendo o olho na lista, e até aqui ela obrigava a abrir a campanha.
          Só aparece quando existe edição anterior LIGADA -- e é por isso que
          vincular precisa ser possível à mão: na base real o ano está dentro do
          nome ("Política 2026 - Deputados"), então elas nunca se acham
          sozinhas pelo nome. */}
      {contra && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 border-t border-slate-100 pt-2">
          <Variacao variacao={contra.variacao} anoAnterior={contra.anoAnterior} diferenca={contra.diferenca} />
          <span className="truncate text-[11px] text-slate-400">
            {contra.anoAnterior} fez {dinheiro(contra.vendidoAnterior)} · {contra.edicoes} edições
          </span>
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

/* A VARIAÇÃO CONTRA A EDIÇÃO ANTERIOR.
 *
 * Sempre com o ANO ao lado do percentual: "+50%" sozinho faz o leitor supor
 * que a comparação é com o ano passado, e no caso dele quase nunca é --
 * eleição é de dois em dois anos. "+50% vs 2022" não deixa supor nada.
 *
 * Sem edição anterior não aparece nada. "0%" ali seria afirmar estabilidade
 * que ninguém mediu. */
function Variacao({ variacao, anoAnterior, diferenca }) {
  if (anoAnterior == null) return <span className="text-xs text-slate-400">primeira edição</span>;
  const subiu = (diferenca || 0) > 0;
  const desceu = (diferenca || 0) < 0;
  const Icone = subiu ? TrendingUp : desceu ? TrendingDown : Minus;
  const tom = subiu ? "text-ok-700" : desceu ? "text-bad-700" : "text-slate-500";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium tabular-nums ${tom}`}>
      <Icone size={13} className="shrink-0" />
      {variacao != null
        ? `${subiu ? "+" : ""}${Math.round(variacao * 100)}%`
        : `${subiu ? "+" : ""}${dinheiro(diferenca || 0)}`}
      <span className="font-normal text-slate-400">vs {anoAnterior}</span>
    </span>
  );
}

/* O SELETOR DE ANO. Chips, não um `<select>`: são poucos anos, e a lista deles
   é informação -- ver de cara que existe campanha em 2022 e em 2026, e nenhuma
   em 2023, já responde meia pergunta. Um menu fechado esconderia isso.

   "Todos" existe porque a história inteira também é uma pergunta legítima. */
function SeletorAno({ anos, valor, aoEscolher, temSemAno }) {
  /* SÓ SOME quando não há o que escolher: um ano e nenhuma campanha fora dele.
     A régua era `anos.length < 2`, e com isso apagar o ano de uma campanha (o
     campo aceita vazio) fazia o seletor INTEIRO sumir -- inclusive o chip
     "Todos os anos", que era o único caminho até ela. A campanha ficava
     inalcançável, e a faixa amarela mandava clicar num botão que não existia
     mais na tela. */
  if (anos.length < 2 && !temSemAno) return null;
  const chip = (id, rotulo, sub) => (
    <button
      key={id}
      type="button"
      onClick={() => aoEscolher(id)}
      aria-pressed={valor === id}
      className={`rounded-full px-3 py-1.5 text-sm transition ${
        valor === id
          ? "bg-brand-600 text-white"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {rotulo}
      {sub != null && (
        <span className={`ml-1.5 text-[11px] ${valor === id ? "text-white/70" : "text-slate-400"}`}>{sub}</span>
      )}
    </button>
  );
  return (
    <div className="flex flex-wrap items-center gap-2 sem-impressao">
      {anos.map((a) => chip(a.ano, a.ano, a.quantas))}
      {chip("todos", "Todos os anos", null)}
      {temSemAno > 0 && (
        <span className="text-xs text-warn-700">
          {temSemAno === 1 ? "1 campanha sem ano" : `${temSemAno} campanhas sem ano`} — só aparece em “Todos os anos”
        </span>
      )}
    </div>
  );
}

/* O QUADRO COMPARATIVO: uma linha por ano, sempre TODOS os anos.
 *
 * Fica fora do recorte de propósito. O seletor acima foca, mas nada pode
 * sumir sem a pessoa mandar: se o comparativo também filtrasse, escolher 2026
 * deixaria a tela sem nada com que comparar -- justamente o que ela veio
 * fazer aqui. */
function Comparativo({ linhas, anoSel, aoEscolher }) {
  if (linhas.length < 2) return null;
  const teto = Math.max(...linhas.map((l) => l.vendido), 1);
  /* Sem Card nem título próprios: a Secao recolhível da aba Análise embrulha
     este quadro -- preferência do dono, todo quadro de análise recolhe. */
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="pb-1 font-normal">Ano</th>
              <th className="pb-1 font-normal">Vendido</th>
              <th className="pb-1 text-right font-normal">Campanhas</th>
              <th className="pb-1 text-right font-normal">Compradores</th>
              <th className="pb-1 text-right font-normal">O.S.</th>
              <th className="pb-1 text-right font-normal">Contra a anterior</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr
                key={l.ano}
                onClick={() => aoEscolher(l.ano)}
                className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${
                  anoSel === l.ano ? "bg-brand-50/60" : ""
                }`}
              >
                <td className="py-2 font-medium text-slate-800">{l.ano}</td>
                <td className="py-2">
                  {/* NADA MARCADO ≠ VENDEU ZERO. Cinco campanhas cadastradas
                      estão sem nenhuma O.S.; o ano delas mostrava R$ 0,00 com
                      a mesma cara de um ano ruim -- e puxava "-100%" para o
                      ano seguinte. */}
                  <span className="block tabular-nums text-slate-800">
                    {l.medido ? dinheiro(l.vendido) : <span className="text-slate-400">nada marcado</span>}
                  </span>
                  {/* A barra é relativa ao MAIOR ano, não à soma: com seis anos,
                      barras sobre a soma ficam todas invisíveis. */}
                  {l.medido && (
                    <span className="mt-0.5 block h-1.5 w-full max-w-[10rem] overflow-hidden rounded-full bg-slate-100 sem-impressao">
                      <span className="block h-full rounded-full bg-brand-400" style={{ width: `${Math.max(2, (l.vendido / teto) * 100)}%` }} />
                    </span>
                  )}
                </td>
                <td className="py-2 text-right tabular-nums text-slate-600">{l.quantas}</td>
                <td className="py-2 text-right tabular-nums text-slate-600">{l.compradores}</td>
                <td className="py-2 text-right tabular-nums text-slate-600">{l.os}</td>
                <td className="py-2 text-right">
                  <Variacao variacao={l.variacao} anoAnterior={l.anoAnterior} diferenca={l.diferenca} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ESTA EDIÇÃO CONTRA AS ANTERIORES.
 *
 * Casa pelo NOME -- e isso é uma dedução, do mesmo tipo que já criou sósia na
 * Central de Acessos. A diferença está no que se faz com ela: aqui ninguém é
 * somado nem ganha acesso, é só uma comparação ao lado, e a tela DIZ que o
 * critério é o nome. Se o evento foi cadastrado como "Eleições 2022" num ano e
 * "Eleição Municipal" no outro, as duas não se encontram -- e o rodapé explica
 * o que fazer em vez de deixar a pessoa achando que não houve edição anterior.
 */
function Edicoes({ edicoes, atual, aoAbrir, repetidos = [] }) {
  if (!edicoes.length) return null;
  /* As outras edições podem estar com o valor CONGELADO na marcação: com uma
     campanha aberta, o painel só busca as O.S. dos compradores dela, e as
     demais não têm contra o que conferir. O comentário antigo prometia o
     oposto ("usa exatamente os números da tela de fora"). */
  /* A RESSALVA NUNCA APARECIA. `semConferir` só é verdade quando a busca veio
     VAZIA -- e com uma campanha aberta ela vem cheia, só que apenas das O.S.
     DELA: as outras edições caem no valor congelado com `semConferir: false`.
     `sumiram > 0` numa outra edição significa, na prática, "as O.S. dela não
     foram carregadas", que é exatamente o que o rodapé explica. */
  const temCongelado = edicoes.some((e) => e.semConferir || e.sumiram > 0);
  /* Do mais ANTIGO para o mais novo: a comparação se lê descendo, e cada linha
     mede contra a de cima. Com a ordem invertida, "anterior" tinha de olhar
     para baixo -- e virar uma sem virar a outra trocaria o sinal de todas. */
  const todas = [{ ...atual, ehAtual: true }, ...edicoes].sort((a, b) =>
    String(a.ano || "").localeCompare(String(b.ano || "")));
  const teto = Math.max(...todas.map((e) => e.vendido), 1);
  return (
    <div className="space-y-2">
      {todas.map((e, i) => {
        /* O ANTERIOR DE ANO DIFERENTE, olhando para TRÁS. Com um cadastro
           duplicado (duas campanhas com o mesmo nome no mesmo ano), o vizinho
           direto era a própria gêmea e a linha imprimia "-33% vs 2022" contra
           ela mesma. */
        const anterior = [...todas.slice(0, i)].reverse()
          .find((x) => String(x.ano || "") !== String(e.ano || "")) || null;
        const dif = anterior ? Math.round((e.vendido - anterior.vendido) * 100) / 100 : null;
        const varia = anterior && anterior.vendido > 0 ? (e.vendido - anterior.vendido) / anterior.vendido : null;
        return (
          <div key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <button
              type="button"
              onClick={() => !e.ehAtual && aoAbrir(e.id)}
              disabled={e.ehAtual}
              className={`w-14 shrink-0 text-left font-medium tabular-nums ${
                e.ehAtual ? "text-slate-800" : "text-brand-600 hover:underline"
              }`}
            >
              {e.ano || "—"}
            </button>
            {/* A BARRA SOME NO CELULAR. Com as três colunas fixas ao lado ela
                sobrava com uns 8px de largura: um sliver que não compara nada e
                ainda empurra o resto. Os números continuam todos ali. */}
            <span className="hidden min-w-0 flex-1 sm:block">
              <span className="block h-1.5 overflow-hidden rounded-full bg-slate-100 sem-impressao">
                <span
                  className={`block h-full rounded-full ${e.ehAtual ? "bg-brand-500" : "bg-slate-300"}`}
                  style={{ width: `${Math.max(2, (e.vendido / teto) * 100)}%` }}
                />
              </span>
            </span>
            <span className="ml-auto w-24 shrink-0 text-right text-xs tabular-nums text-slate-400 sm:ml-0">
              {e.compradores} {e.compradores === 1 ? "comprador" : "compradores"}
            </span>
            <span className="w-28 shrink-0 text-right font-medium tabular-nums text-slate-800">
              {dinheiro(e.vendido)}
            </span>
            <span className="w-28 shrink-0 text-right">
              <Variacao variacao={varia} anoAnterior={anterior ? anterior.ano : null} diferenca={dif} />
            </span>
          </div>
        );
      })}
      {repetidos.length > 0 && (
        <div className="rounded-lg bg-warn-50 px-3 py-2 text-xs text-warn-800">
          Há mais de uma campanha com este nome em {repetidos.join(", ")} — provavelmente cadastro
          duplicado. Junte as duas, senão o mesmo evento conta duas vezes no ano.
        </div>
      )}
      <div className="border-t border-slate-100 pt-2 text-xs text-slate-400">
        As edições criadas pelo botão “Outra edição” ficam ligadas de verdade — o vínculo sobrevive a
        renomear. As cadastradas soltas se encontram pelo NOME; se uma edição antiga foi cadastrada com
        outro nome, renomeie as duas igual, ou crie a nova por aqui.
        {temCongelado && (
          <>
            {" "}Com uma campanha aberta o painel só carrega as O.S. dos compradores DELA, então as outras
            edições aparecem com o valor congelado na marcação — feche a campanha para conferi-las contra o ERP.
          </>
        )}
      </div>
    </div>
  );
}

/* CRIAR OUTRA EDIÇÃO DESTE EVENTO, de dentro dele.
 *
 * É o caminho certo por dois motivos. O prático: não se redigita o nome, o ano
 * já vem com as datas do ano inteiro, e cai direto na ficha nova. O que importa
 * mais: as duas passam a carregar o mesmo `evento`, então o vínculo é
 * DECLARADO. Criadas soltas, elas só se achavam pelo nome — e bastava escrever
 * "Eleição Municipal" num ano e "Eleições 2022" no outro para a comparação
 * sumir sem uma palavra.
 */
function FormEdicao({ anoAtual, anosUsados, aoCriar, aoCancelar, salvando }) {
  const [ano, setAno] = useState("");
  const limpo = ano.replace(/\D/g, "").slice(0, 4);
  const completo = /^\d{4}$/.test(limpo);
  const jaExiste = completo && anosUsados.includes(limpo);
  const eDoAtual = completo && limpo === String(anoAtual || "");
  return (
    <div className="mb-3 space-y-2 rounded-lg bg-slate-50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-600">Nova edição deste evento, no ano de</span>
        <input
          className="input h-9 w-24 text-center"
          placeholder="AAAA"
          inputMode="numeric"
          maxLength={4}
          autoFocus
          value={ano}
          onChange={(e) => setAno(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && completo && !jaExiste && !eDoAtual) aoCriar(limpo); }}
        />
        <button
          type="button"
          className="btn-primary h-9 px-3 text-sm"
          disabled={!completo || jaExiste || eDoAtual || salvando}
          onClick={() => aoCriar(limpo)}
        >
          Criar e abrir
        </button>
        <button type="button" className="btn-ghost h-9 px-3 text-sm" onClick={aoCancelar}>
          Cancelar
        </button>
      </div>
      {/* AVISAR ANTES, não depois: criar a segunda de 2022 é o cadastro
          duplicado que a própria tela já denuncia mais abaixo. Melhor não
          deixar acontecer do que explicar depois que aconteceu. */}
      {eDoAtual && (
        <div className="text-xs text-bad-700">
          {limpo} é o ano desta campanha — escolha outro ano para a nova edição.
        </div>
      )}
      {jaExiste && !eDoAtual && (
        <div className="text-xs text-bad-700">
          Já existe uma edição deste evento em {limpo}. Abra ela na lista acima em vez de criar outra.
        </div>
      )}
      {completo && !jaExiste && !eDoAtual && (
        <div className="text-xs text-slate-500">
          Vai nascer com o mesmo nome, de 01/01/{limpo} a 31/12/{limpo}, e ligada a esta —
          é só ajustar as datas para as do evento.
        </div>
      )}
    </div>
  );
}

/* VINCULAR UMA CAMPANHA QUE JÁ EXISTE a este evento.
 *
 * O botão "Outra edição" cria uma nova. Este resolve o caso que é a regra na
 * base real: as edições JÁ estão cadastradas, com o ano dentro do nome
 * ("Política 2026 - Deputados" e "Política 2022 - Deputados"). Nomes
 * diferentes, nenhum vínculo — e a tela dizia "esta é a única edição" para um
 * evento com quatro.
 *
 * Mostra o nome COM o ano e o valor: é assim que ele reconhece qual é qual
 * numa lista de vinte campanhas com nomes parecidos.
 */
function FormVincular({ candidatas, aoVincular, aoCancelar, salvando }) {
  const [busca, setBusca] = useState("");
  const t = busca.trim().toLowerCase();
  const filtradas = t
    ? candidatas.filter((c) => `${c.nome} ${c.ano}`.toLowerCase().includes(t))
    : candidatas;
  if (!candidatas.length) {
    return (
      <div className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
        Não há outra campanha para vincular — todas as que existem já estão neste evento.
        <button type="button" className="ml-2 underline hover:text-slate-800" onClick={aoCancelar}>
          Fechar
        </button>
      </div>
    );
  }
  return (
    <div className="mb-3 space-y-2 rounded-lg bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-slate-600">Qual campanha é a mesma coisa, em outro ano?</span>
        <button type="button" className="btn-ghost h-8 px-3 text-sm" onClick={aoCancelar}>Cancelar</button>
      </div>
      {candidatas.length > 6 && (
        <input
          className="input h-9 text-sm"
          placeholder="filtrar pelo nome ou ano…"
          value={busca}
          autoFocus
          onChange={(e) => setBusca(e.target.value)}
        />
      )}
      <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white">
        {filtradas.length ? filtradas.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={salvando}
            onClick={() => aoVincular(c)}
            className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-slate-50 disabled:opacity-50"
          >
            <span className="min-w-0">
              <span className="block truncate text-slate-800">{c.nome || "sem nome"}</span>
              <span className="text-[11px] text-slate-400">
                {c.ano || "sem ano"} · {c.linhas.length} O.S.
                {/* Já ligada a outras: vincular arrasta o GRUPO inteiro, e ele
                    precisa saber disso antes de clicar. */}
                {c.jaLigadas > 1 && ` · já ligada a ${c.jaLigadas - 1} outra${c.jaLigadas > 2 ? "s" : ""}`}
              </span>
            </span>
            <span className="shrink-0 tabular-nums text-slate-700">{dinheiro(c.vendido)}</span>
          </button>
        )) : (
          <div className="px-3 py-2 text-sm text-slate-400">Nenhuma com esse nome ou ano.</div>
        )}
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

/* QUANDO A CAMPANHA VENDEU, mês a mês.
 *
 * Uma campanha não vende parelho: a eleição concentra em agosto e setembro, a
 * festa da cidade na semana dela. O total do evento esconde isso inteiro, e é
 * a curva que diz quando montar equipe na próxima.
 *
 * Meses vazios NO MEIO aparecem: sem eles, compras em janeiro e abril viram
 * duas barras coladas e a campanha parece contínua.
 */


function CurvaMensal({ meses }) {
  if (meses.length < 2) return null;
  const teto = Math.max(...meses.map((m) => m.valor), 1);
  const pico = meses.reduce((p, m) => (m.valor > p.valor ? m : p), meses[0]);
  return (
    <div className="space-y-2">
      <div className="flex items-end gap-1 overflow-x-auto pb-1" style={{ minHeight: "5rem" }}>
        {meses.map((m) => (
          <div key={m.mes} className="flex min-w-[2.2rem] flex-1 flex-col items-center gap-1">
            <span className="text-[10px] tabular-nums text-slate-400">
              {m.valor > 0 ? dinheiro(m.valor).replace("R$ ", "") : ""}
            </span>
            <span
              className={`w-full rounded-t ${m.mes === pico.mes ? "bg-brand-500" : "bg-brand-200"}`}
              /* Altura mínima de 2px só para o mês COM venda: mês zerado tem de
                 ficar visivelmente vazio, senão a curva mente sobre a pausa. */
              style={{ height: `${m.valor > 0 ? Math.max(2, (m.valor / teto) * 56) : 0}px` }}
              title={`${rotuloMes(m.mes)}: ${dinheiro(m.valor)} em ${m.qtd} O.S.`}
            />
            <span className="whitespace-nowrap text-[10px] text-slate-400">{rotuloMes(m.mes)}</span>
          </div>
        ))}
      </div>
      <div className="text-xs text-slate-500">
        Mês mais forte: <span className="font-medium text-slate-700">{rotuloMes(pico.mes)}</span> com{" "}
        {dinheiro(pico.valor)} em {pico.qtd} {pico.qtd === 1 ? "O.S." : "O.S."}
      </div>
    </div>
  );
}

/* AS COMPRAS EM ORDEM DE DATA. A lista de cima está agrupada por CNPJ (para
   conferir com cada comprador); esta é a linha do tempo do evento -- o que
   entrou, e quando. São as mesmas O.S. lidas por duas perguntas diferentes. */
function LinhaCompra({ l }) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-100 py-2 text-sm last:border-0">
      <span className="w-20 shrink-0 text-xs tabular-nums text-slate-400">{dataDaOS(l.data)}</span>
      <span className="w-20 shrink-0 font-medium text-slate-700">{l.numero}</span>
      <span className="min-w-0 flex-1 truncate text-slate-600">{l.cliente}</span>
      {l.sumiu && (
        <span className="shrink-0 rounded bg-bad-50 px-1.5 py-0.5 text-[11px] text-bad-700">cancelada</span>
      )}
      <span className="w-28 shrink-0 text-right tabular-nums text-slate-800">{dinheiro(l.valor)}</span>
    </div>
  );
}

/* O RANKING DOS PRODUTOS.
 *
 * A cobertura vai JUNTO, sempre. Um ranking pela metade parece completo, e a
 * direção decidiria o estoque da próxima eleição com metade da venda
 * invisível. "Sem item" e "ainda não carregado" são causas opostas que na tela
 * apareceriam iguais -- zero não é resultado.
 */
/* TRÊS GRÃOS, e o mais FINO é o padrão.
 *
 * "Material Político 2026 · 192.778 un. · R$ 227.292" era uma linha só, 94% da
 * campanha, e não respondia nada: no ERP esse é o nome da LINHA DO CATÁLOGO. O
 * que foi comprado está no modelo -- Adesivo Perfurado 60x33, Bandeira 140X90,
 * Adesivo Parachoque 30x10. É esse detalhe que diz o que cotar e o que estocar.
 *
 * Os dois rollups continuam existindo porque respondem outra coisa: o peso da
 * linha inteira, e o peso da categoria. Mas nenhum deles soma QUANTIDADE --
 * adesivo com bandeira não tem unidade comum, e "192.778 un." era exatamente
 * essa soma sem sentido.
 */
const GRAOS = [
  ["item", "Detalhado", "o que foi comprado, item a item"],
  ["produto", "Por produto", "a linha do catálogo do ERP"],
  ["categoria", "Por categoria", "placa, lona, adesivo"],
];

function Produtos({ produtos, categorias, grao, aoTrocar }) {
  const { cobertura } = produtos;
  const lista = grao === "categoria" ? categorias
    : grao === "produto" ? porProduto(produtos)
      : produtos.itens;
  const teto = Math.max(...lista.map((x) => x.valor), 1);
  const detalhado = grao === "item";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 sem-impressao">
        {GRAOS.map(([id, rot, dica]) => (
          <button
            key={id}
            type="button"
            onClick={() => aoTrocar(id)}
            aria-pressed={grao === id}
            title={dica}
            className={`rounded-full px-3 py-1 text-xs transition ${
              grao === id ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {rot}
          </button>
        ))}
      </div>

      {lista.length ? (
        <div className="space-y-2">
          {lista.slice(0, 30).map((x) => (
            <div key={x.chave || x.categoria} className="flex items-center gap-3 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-slate-800">{x.rotulo || x.categoria}</span>
                <span className="mt-0.5 block h-1.5 overflow-hidden rounded-full bg-slate-100 sem-impressao">
                  <span className="block h-full rounded-full bg-brand-400" style={{ width: `${Math.max(2, (x.valor / teto) * 100)}%` }} />
                </span>
                {/* No detalhe, a linha de baixo diz de QUE produto do catálogo o
                    item saiu -- sem isso "Adesivo Perfurado 60x33" fica solto e
                    não dá para achar no ERP. */}
                {(x.produto && x.produto !== x.rotulo) || x.categoria ? (
                  <span className="truncate text-[11px] text-slate-400">
                    {[x.produto !== x.rotulo ? x.produto : null, x.categoria || null]
                      .filter(Boolean).join(" · ")}
                  </span>
                ) : null}
              </span>
              <span className="w-24 shrink-0 text-right text-xs tabular-nums text-slate-400">
                {/* QUANTIDADE só no detalhe: nos rollups ela somaria adesivo com
                    bandeira. Ali o que conta é quantos itens diferentes. */}
                {detalhado
                  ? `${x.quantidade % 1 === 0 ? x.quantidade.toLocaleString("pt-BR") : x.quantidade.toFixed(2)} un.`
                  : `${x.itens ?? x.produtos} ${(x.itens ?? x.produtos) === 1 ? "item" : "itens"}`}
              </span>
              <span className="w-28 shrink-0 text-right font-medium tabular-nums text-slate-800">
                {dinheiro(x.valor)}
              </span>
            </div>
          ))}
          {lista.length > 30 && (
            <div className="text-xs text-slate-400">
              e mais {lista.length - 30} — o PDF traz a lista inteira.
            </div>
          )}

        </div>
      ) : (
        <Empty>
          {cobertura.aceitas === 0
            ? "Marque as O.S. da campanha para ver o que foi vendido."
            : "Nenhum item lido nas O.S. desta campanha."}
        </Empty>
      )}

      {/* O QUE ESTE RANKING NÃO COBRE. Sem esta linha, um ranking de metade da
          campanha se apresenta como o todo. */}
      {/* SEM LISTA NÃO SE CONCLUI CAUSA. Quando a busca não respondeu (ou
          falhou), esta caixa afirmava "o comprador sumiu do ERP" com nome e
          tudo -- mandando a direção desfazer o vínculo certo -- enquanto a
          faixa do topo, na mesma tela, dizia que as O.S. não carregaram. */}
      {cobertura.semConferir ? (
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          As O.S. desta campanha não carregaram nesta sessão — não dá para conferir os itens agora.
        </div>
      ) : (cobertura.semItens > 0 || cobertura.foraDaBusca > 0) && (
        <div className="rounded-lg bg-warn-50 px-3 py-2 text-xs text-warn-800">
          Lido de {cobertura.comItens} das {cobertura.aceitas} O.S. desta campanha.
          {cobertura.semItens > 0 && (
            <>
              {" "}
              {cobertura.itensNaoPedidos ? (
                <>
                  {cobertura.semItens} {cobertura.semItens === 1 ? "está" : "estão"} sem os itens porque
                  esta carga não os pediu — abra de novo em alguns segundos.
                </>
              ) : (
                <>
                  {cobertura.semItens} ainda não {cobertura.semItens === 1 ? "teve" : "tiveram"} os itens
                  carregados do ERP — a carga do histórico roda domingo de madrugada e preenche.
                </>
              )}
            </>
          )}
          {/* O MOTIVO CERTO, e não uma lista de suspeitos. A versão antiga dizia
              só "cancelada ou fora do período", e na campanha real as 4 O.S.
              estavam DENTRO do período: o comprador é que tinha saído da lista,
              e a busca de O.S. é por cliente. Motivo errado manda procurar no
              lugar errado -- eu mesmo fui conferir o período primeiro. */}
          {cobertura.semComprador > 0 && (
            <>
              {" "}
              {cobertura.semComprador}{" "}
              {cobertura.semComprador === 1 ? "é de um comprador" : "são de compradores"} que a busca não
              alcança mais: <strong>{cobertura.compradores.slice(0, 3).join(", ")}</strong>
              {cobertura.compradores.length > 3 && ` e mais ${cobertura.compradores.length - 3}`}.
              {" "}Ou saiu da lista, ou <strong>o nome dele mudou no ERP</strong> e o vínculo ficou com o
              nome velho. As O.S. continuam contando no total — para os itens voltarem, tire o nome
              velho em “Compradores desta campanha” e procure o atual.
            </>
          )}
          {cobertura.foraDaBusca > cobertura.semComprador && (
            <>
              {" "}
              {cobertura.foraDaBusca - cobertura.semComprador}{" "}
              {cobertura.foraDaBusca - cobertura.semComprador === 1
                ? "não apareceu na busca — ou foi cancelada"
                : "não apareceram na busca — ou foram canceladas"} no ERP, ou{" "}
              {cobertura.foraDaBusca - cobertura.semComprador === 1 ? "está" : "estão"} fora do período
              da campanha.
            </>
          )}
        </div>
      )}
      {/* O QUE NÃO CHEGOU A PRODUTO NENHUM. A linha antiga dizia só "soma dos
          itens: X", o que fazia parecer que X era a campanha inteira. Em 146
          O.S. da base a soma dos itens dá MENOS que o cabeçalho (união do ERP
          sem sub-item nomeado) -- e numa delas isso é 61% da O.S. */}
      {produtos.naoAtribuido > 0 && (
        <div className="rounded-lg bg-warn-50 px-3 py-2 text-xs text-warn-800">
          {dinheiro(produtos.naoAtribuido)} das O.S. lidas não estão em produto nenhum — no ERP são
          itens agrupados sem o produto nomeado dentro. O ranking acima soma {dinheiro(produtos.total)}
          {" "}de {dinheiro(produtos.brutoDasLidas)}. Não inventei um “Outros” para o resto: valor sem
          dono aparece como valor sem dono.
        </div>
      )}
      {produtos.total > 0 && produtos.fecha && (
        <div className="text-xs text-slate-400">
          Soma dos itens: {dinheiro(produtos.total)} — fecha com o bruto das O.S. lidas (antes do
          desconto de cada uma).
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

function ExtratoImpresso({ e, produtos, categorias, meses }) {
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

      {/* OS PRODUTOS VÃO INTEIROS NO PAPEL, sem o corte de 20 da tela: a folha
          é onde se decide o estoque da próxima edição, e um "e mais 34
          produtos" ali não decide nada. */}
      {produtos && produtos.itens.length > 0 && (
        <>
          <h2 style={{ fontSize: "11pt", margin: "14px 0 4px" }}>Produtos vendidos</h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...th, width: "2rem" }}>#</th>
                {/* O QUE FOI COMPRADO vem primeiro; a linha do catálogo do ERP
                    fica ao lado, para achar lá dentro. */}
                <th style={th}>Item</th>
                <th style={{ ...th, width: "12rem" }}>Produto no ERP</th>
                <th style={{ ...th, width: "9rem" }}>Categoria</th>
                <th style={{ ...th, textAlign: "right", width: "5rem" }}>Qtd.</th>
                <th style={{ ...th, textAlign: "right", width: "4rem" }}>O.S.</th>
                <th style={{ ...th, textAlign: "right", width: "7rem" }}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {produtos.itens.map((p, i) => (
                <tr key={p.chave}>
                  <td style={td}>{i + 1}</td>
                  <td style={td}>{p.rotulo}</td>
                  <td style={td}>{p.produto !== p.rotulo ? p.produto : "—"}</td>
                  <td style={td}>{p.categoria || "—"}</td>
                  <td style={tdN}>{p.quantidade % 1 === 0 ? p.quantidade : p.quantidade.toFixed(2)}</td>
                  <td style={tdN}>{p.os}</td>
                  <td style={tdN}>{dinheiro(p.valor)}</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...td, fontWeight: 700 }} colSpan={6}>Soma dos itens (bruto, antes do desconto)</td>
                <td style={{ ...tdN, fontWeight: 700 }}>{dinheiro(produtos.total)}</td>
              </tr>
            </tbody>
          </table>
          {/* A RESSALVA VAI NO PAPEL TAMBÉM. Um ranking pela metade impresso
              parece completo, e a folha circula sem a tela ao lado. */}
          {!produtos.completo && (
            <p style={{ fontSize: "8.5pt", marginTop: 4 }}>
              Lido de {produtos.cobertura.comItens} das {produtos.cobertura.aceitas} O.S. desta campanha
              {produtos.cobertura.semItens > 0 &&
                (produtos.cobertura.itensNaoPedidos
                  ? ` — ${produtos.cobertura.semItens} sem os itens nesta carga`
                  : ` — ${produtos.cobertura.semItens} sem itens carregados do ERP`)}
              {produtos.cobertura.foraDaBusca > 0 && ` — ${produtos.cobertura.foraDaBusca} fora do período ou canceladas`}
              {/* A ressalva vai ao PAPEL também: a folha circula sem a tela ao
                  lado, e um ranking pela metade impresso parece completo. */}
              {produtos.naoAtribuido > 0 && ` — ${dinheiro(produtos.naoAtribuido)} em itens agrupados sem produto nomeado no ERP, fora do ranking`}.
            </p>
          )}
        </>
      )}

      {categorias && categorias.length > 1 && (
        <>
          <h2 style={{ fontSize: "11pt", margin: "14px 0 4px" }}>Por categoria</h2>
          <table style={{ width: "60%", borderCollapse: "collapse" }}>
            <tbody>
              {categorias.map((x) => (
                <tr key={x.categoria}>
                  <td style={td}>{x.categoria}</td>
                  <td style={tdN}>{x.produtos} {x.produtos === 1 ? "produto" : "produtos"}</td>
                  <td style={tdN}>{dinheiro(x.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {meses && meses.length > 1 && (
        <>
          <h2 style={{ fontSize: "11pt", margin: "14px 0 4px" }}>Quando vendeu</h2>
          <table style={{ width: "60%", borderCollapse: "collapse" }}>
            <tbody>
              {meses.map((m) => (
                <tr key={m.mes}>
                  <td style={td}>{rotuloMes(m.mes)}</td>
                  <td style={tdN}>{m.qtd} {m.qtd === 1 ? "O.S." : "O.S."}</td>
                  <td style={tdN}>{dinheiro(m.valor)}</td>
                </tr>
              ))}
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

/* ------------------------------------------------------------- a aba "Anos"
 *
 * O padrão de consumo da casa, AUTOMÁTICO (pedido do dono, 23/08): "você já
 * lança automático todos os clientes que compraram de janeiro de 2020 até
 * hoje... e as vendas de campanha entram ACUMULADAS dentro do mês, para eu
 * saber que naquele mês as vendas foram de campanha".
 *
 * Nada aqui é marcado à mão: o servidor soma a base inteira (painel_ordens)
 * e desce ~80 linhas de panorama; o detalhe de um mês -- quem comprou e o que
 * foi vendido -- só desce quando o mês é clicado. A fatia âmbar de cada barra
 * é o acumulado das O.S. que a direção marcou nas campanhas: quando o pico é
 * eleição, a cor diz na hora.
 */

/* Rótulo curto para caber em cima de 12 barras: R$ 852.028,46 vira "852 mil".
   O número exato mora no title e no detalhe do mês. */


/* As 12 barras de um ano (ou das médias), empilhadas: dia a dia embaixo,
   campanha em âmbar por cima da base. Mês `fora` não é barra zerada -- o
   painel NÃO TEM aquele mês, e ele aparece apagado com a explicação no title. */

function LegendaAnos({ temParcial, semCampanha }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm bg-brand-300" /> vendas do dia a dia
      </span>
      {/* No modo "sem as campanhas" a cor âmbar não PODE aparecer -- a
          legenda prometendo-a faria quem olha procurar campanha escondida. */}
      {!semCampanha && (
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-warn-400" /> vendas de campanha, acumuladas no mês
        </span>
      )}
      {temParcial && <span>* mês pela metade</span>}
    </div>
  );
}

/* As casas que as barras consomem, já com o title pronto -- conta pura. */
function casasDoAno(a) {
  return a.meses.map((m) => ({
    chave: m.mes,
    rotulo: MES_CURTO[m.n - 1],
    valor: m.valor,
    valorCampanha: m.valorCampanha,
    fora: m.fora,
    parcial: m.parcial,
    titulo: m.fora
      ? `${rotuloMes(m.mes)}: o painel não tem este mês`
      : `${rotuloMes(m.mes)}: ${dinheiro(m.valor)} em ${m.os} O.S.${
          m.clientes == null ? "" : ` · ${m.clientes} ${m.clientes === 1 ? "cliente" : "clientes"}`
        }${m.valorCampanha > 0 ? ` · ${dinheiro(m.valorCampanha)} de campanha` : ""}${
          m.parcial ? " · mês pela metade" : ""}`,
  }));
}

function casasDaEpoca(epoca) {
  return epoca.map((e) => ({
    chave: String(e.n),
    rotulo: MES_CURTO[e.n - 1],
    valor: e.media,
    valorCampanha: e.mediaCampanha,
    fora: e.anos === 0,
    parcial: false,
    titulo:
      e.anos === 0
        ? `${MES_CURTO[e.n - 1]}: nenhum ano cheio ainda`
        : `${MES_CURTO[e.n - 1]}: média de ${dinheiro(e.media)}${
            e.mediaClientes == null ? "" : ` · ~${e.mediaClientes} clientes`
          } · sobre ${e.anos} ${e.anos === 1 ? "ano" : "anos"}${
            e.mediaCampanha > 0 ? ` · ${dinheiro(e.mediaCampanha)} de campanha em média` : ""
          }`,
  }));
}

/* O MÊS ABERTO: quem comprou e o que foi vendido, vindo do servidor só agora.
   A linha âmbar cumpre o pedido ao pé da letra: o acumulado de campanha do
   mês, para a leitura ser "esse pico foi eleição" sem abrir nada mais. */
function MesDetalhe({ mes, detalhe, erro, semCampanha, aoFechar }) {
  const pctCamp =
    detalhe && detalhe.total > 0 && detalhe.campanha?.valor > 0
      ? Math.round((detalhe.campanha.valor / detalhe.total) * 100)
      : 0;
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="font-display text-sm font-medium text-slate-800">
          {rotuloMes(mes)}
          {detalhe && (
            <span className="ml-2 font-sans text-xs font-normal text-slate-500">
              {dinheiro(detalhe.total)} em {detalhe.os} O.S. · {detalhe.clientesQtd}{" "}
              {detalhe.clientesQtd === 1 ? "cliente" : "clientes"}
            </span>
          )}
          {/* O detalhe é sempre o mês INTEIRO (a caixa âmbar diz a fatia).
              Com o seletor em "sem as campanhas", as barras acima mostram o
              valor subtraído -- sem este selo, seriam duas réguas na mesma
              seção a um clique de distância. */}
          {semCampanha && (
            <span className="ml-2 rounded bg-slate-200 px-1.5 py-px font-sans text-[10px] font-normal text-slate-600">
              mês completo, com as campanhas
            </span>
          )}
        </span>
        <button type="button" onClick={aoFechar} className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Fechar o mês">
          <X size={14} />
        </button>
      </div>

      {erro ? (
        <div className="text-xs text-bad-600">{erro}</div>
      ) : !detalhe ? (
        <div className="text-xs text-slate-400">Buscando o mês no servidor…</div>
      ) : (
        <>
          {detalhe.campanha?.valor > 0 && (
            <div className="rounded-lg bg-warn-50 px-3 py-2 text-xs text-warn-800">
              <span className="font-medium">{dinheiro(detalhe.campanha.valor)}</span> em {detalhe.campanha.os} O.S.
              foram vendas de campanha acumuladas neste mês — {pctCamp}% do mês.
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Quem comprou</div>
              <div className="max-h-72 space-y-0.5 overflow-y-auto pr-1">
                {detalhe.clientes.map((c) => (
                  <div key={c.chave || c.nome} className="flex items-baseline gap-2 text-xs">
                    <span className="min-w-0 flex-1 truncate text-slate-700" title={c.nome}>
                      {c.nome}
                      {c.valorCampanha > 0 && (
                        <span
                          className="ml-1.5 rounded bg-warn-100 px-1 py-px text-[10px] text-warn-800"
                          title={`${dinheiro(c.valorCampanha)} deste cliente foram vendas de campanha`}
                        >
                          campanha
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-500">
                      {c.os > 1 ? `${c.os} O.S. · ` : ""}
                      {dinheiro(c.valor)}
                    </span>
                  </div>
                ))}
              </div>
              {detalhe.clientesFora > 0 && (
                <div className="text-[11px] text-slate-400">
                  e mais {detalhe.clientesFora} {detalhe.clientesFora === 1 ? "comprador" : "compradores"} no mês.
                </div>
              )}
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-400">O que foi vendido</div>
              <div className="max-h-72 space-y-0.5 overflow-y-auto pr-1">
                {detalhe.produtos.map((pr) => (
                  <div key={`${pr.produto}|${pr.rotulo}`} className="flex items-baseline gap-2 text-xs">
                    <span className="min-w-0 flex-1 truncate text-slate-700" title={pr.produto !== pr.rotulo ? `${pr.produto} — ${pr.rotulo}` : pr.rotulo}>
                      {pr.rotulo}
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-500">
                      {pr.quantidade > 0 ? `${Math.round(pr.quantidade).toLocaleString("pt-BR")} un. · ` : ""}
                      {dinheiro(pr.valor)}
                    </span>
                  </div>
                ))}
              </div>
              {detalhe.produtosForaValor > 0 && (
                <div className="text-[11px] text-slate-400">e mais {dinheiro(detalhe.produtosForaValor)} em outros produtos.</div>
              )}
              {!detalhe.produtos.length && (
                <div className="text-[11px] text-slate-400">
                  {detalhe.produtosCobertura?.osComItens === 0
                    ? "Nenhuma O.S. deste mês tem itens carregados do ERP — o ranking não tem de onde ler."
                    : "Nenhum item com produto nomeado neste mês."}
                </div>
              )}
              {/* A COBERTURA DO RANKING, dita: O.S. sem itens carregados e
                  uniões do ERP sem sub-item nomeado não entram nele. A régua
                  da conferência é o BRUTO das O.S. lidas (os itens somam o
                  bruto rateado; o total do mês é líquido de desconto). */}
              {detalhe.produtosCobertura?.osSemItens > 0 && (
                <div className="text-[11px] text-warn-800">
                  {detalhe.produtosCobertura.osSemItens}{" "}
                  {detalhe.produtosCobertura.osSemItens === 1 ? "O.S. deste mês está" : "O.S. deste mês estão"}{" "}
                  sem itens carregados do ERP — o ranking não as vê.
                </div>
              )}
              {detalhe.produtos.length > 0 && (
                <div className="text-[11px] text-slate-400">
                  {/* A COLUNA DA ESQUERDA É LÍQUIDA e esta é BRUTA (os itens
                      somam antes do desconto). Em fevereiro de 2026 isso são
                      R$ 149 mil de diferença entre duas colunas vizinhas --
                      sem uma palavra, parecia erro de conta. */}
                  Os valores dos produtos são brutos, antes do desconto — os de “Quem comprou”, ao lado, já
                  são líquidos.
                </div>
              )}
              {detalhe.produtosCobertura &&
                detalhe.produtosCobertura.brutoComItens - detalhe.produtosCobertura.valorLido > 0.05 && (
                <div className="text-[11px] text-slate-400">
                  {dinheiro(detalhe.produtosCobertura.brutoComItens - detalhe.produtosCobertura.valorLido)} vieram
                  do ERP sem produto nomeado e ficam fora do ranking.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const MES_LONGO = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
                   "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/* "TODOS OS JANEIROS COMPARADOS" (pedido do dono, 23/08): clicar num mês da
   época abre o mês-calendário através dos anos -- valor ano a ano com a
   variação contra o último ano cheio, e os produtos da época com a
   distribuição por ano, para o comportamento parecido saltar sozinho. */
function MesCalendario({ n, linhas, detalhe, erro, semCampanha, aoFechar }) {
  const teto = Math.max(...linhas.map((l) => l.valor), 1);
  const anosEixo = linhas.filter((l) => !l.fora).map((l) => l.ano);
  /* A RECORRÊNCIA ("em X de Y") só conta ano CHEIO: o mês corrente pela
     metade diria "quebrou a sequência" de um produto que fecha no fim do
     mês. A coluna do ano parcial aparece, marcada -- dado visível, nunca
     denominador. */
  const anosCheios = linhas.filter((l) => !l.fora && !l.parcial).map((l) => l.ano);
  const parciais = new Set(linhas.filter((l) => l.parcial).map((l) => l.ano));
  const semItens = detalhe?.cobertura?.anosSemItens || {};
  const sobraSemNome = detalhe?.cobertura
    ? Math.round((detalhe.cobertura.brutoComItens - detalhe.cobertura.valorLido) * 100) / 100
    : 0;
  const temParcialAqui = linhas.some((l) => l.parcial);
  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="font-display text-sm font-medium capitalize text-slate-800">
          {MES_LONGO[n - 1]}, ano a ano
          {semCampanha && <span className="ml-2 font-sans text-xs font-normal text-slate-500">sem as campanhas</span>}
        </span>
        <button type="button" onClick={aoFechar} className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Fechar o mês comparado">
          <X size={14} />
        </button>
      </div>

      <div className="space-y-1">
        {temParcialAqui && <div className="text-[11px] text-slate-400">* mês pela metade — fica fora das comparações.</div>}
        {linhas.map((l) => (
          <div key={l.ano} className="flex items-center gap-3 text-xs">
            <span className="w-10 shrink-0 font-medium tabular-nums text-brand-600">{l.ano}</span>
            {l.fora ? (
              <span className="flex-1 text-slate-400">o painel não tem este mês</span>
            ) : (
              <>
                <span className="h-3 min-w-0 flex-1 overflow-hidden rounded bg-slate-100">
                  <span className="flex h-full" style={{ width: `${(l.valor / teto) * 100}%` }}>
                    <span className="h-full bg-brand-300" style={{ width: l.valor > 0 ? `${((l.valor - l.valorCampanha) / l.valor) * 100}%` : 0 }} />
                    {l.valorCampanha > 0 && <span className="h-full flex-1 bg-warn-400" />}
                  </span>
                </span>
                <span className="w-24 shrink-0 text-right tabular-nums text-slate-800">
                  {dinheiro(l.valor)}
                  {l.parcial ? "*" : ""}
                </span>
                <span className="w-24 shrink-0 text-right">
                  {/* `Variacao` diz "primeira edição" quando não há anterior --
                      vocabulário de campanha; aqui o primeiro ano só não tem
                      com quem comparar, e nada é a resposta honesta. */}
                  {l.anoAnterior != null && (
                    <Variacao variacao={l.variacao} anoAnterior={l.anoAnterior} diferenca={l.diferenca} />
                  )}
                </span>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="space-y-1">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Os produtos desta época, ano a ano
        </div>
        {erro ? (
          <div className="text-xs text-bad-600">{erro}</div>
        ) : !detalhe ? (
          <div className="text-xs text-slate-400">Comparando os {MES_LONGO[n - 1]}s no servidor…</div>
        ) : !detalhe.produtos.length ? (
          <div className="text-xs text-slate-400">Nenhum item com produto nomeado nesta época.</div>
        ) : (
          <>
            <div className="space-y-1.5">
              {detalhe.produtos.slice(0, 15).map((pr) => {
                const tetoP = Math.max(...anosEixo.map((a2) => pr.anos[a2] || 0), 1);
                return (
                  <div key={`${pr.produto}|${pr.rotulo}`} className="flex items-end gap-3 text-xs">
                    <span className="min-w-0 flex-1 self-center truncate text-slate-700" title={pr.produto !== pr.rotulo ? `${pr.produto} — ${pr.rotulo}` : pr.rotulo}>
                      {pr.rotulo}
                    </span>
                    <span className="shrink-0 self-center whitespace-nowrap text-[10px] text-slate-400">
                      em {anosCheios.filter((a2) => (pr.anos[a2] || 0) > 0).length} de {anosCheios.length}
                    </span>
                    {/* A recorrência DESENHADA: uma coluna por ano, altura pelo
                        próprio produto -- buraco visível é ano em que ele não
                        vendeu nesta época. */}
                    <span className="flex shrink-0 items-end gap-px">
                      {anosEixo.map((a2) => {
                        const v = pr.anos[a2] || 0;
                        /* Zero só é "não vendeu" quando o ano está inteiro E
                           com os itens carregados -- senão o painel não sabe. */
                        const descoberto = v <= 0 && semItens[a2] > 0;
                        const marca = parciais.has(a2) ? " · mês pela metade" : "";
                        return (
                          <span
                            key={a2}
                            className={`w-2.5 rounded-sm ${v > 0 ? "bg-brand-400" : descoberto ? "bg-warn-200" : "bg-slate-200"}`}
                            style={{ height: v > 0 ? `${Math.max(3, (v / tetoP) * 24)}px` : "2px" }}
                            title={`${MES_CURTO[n - 1]}/${a2.slice(2)}: ${
                              v > 0 ? dinheiro(v)
                              : descoberto ? `${semItens[a2]} O.S. sem itens carregados — o painel não sabe`
                              : parciais.has(a2) ? "nada até agora"
                              : "não vendeu"
                            }${v > 0 ? marca : ""}`}
                          />
                        );
                      })}
                    </span>
                    <span className="w-20 shrink-0 self-center text-right tabular-nums text-slate-500">{dinheiro(pr.total)}</span>
                  </div>
                );
              })}
            </div>
            {detalhe.produtosQtd > Math.min(detalhe.produtos.length, 15) && (
              <div className="text-[11px] text-slate-400">
                {/* O corte fala, medido contra o que a TELA mostra -- não
                    contra um 15 fixo que calaria se o servidor mandasse menos. */}
                e mais {detalhe.produtosQtd - Math.min(detalhe.produtos.length, 15)} produtos nesta época,
                somando {dinheiro(detalhe.produtos.slice(15).reduce((t, x) => t + x.total, 0) + detalhe.produtosForaValor)}.
              </div>
            )}
            {Object.keys(semItens).length > 0 && (
              <div className="text-[11px] text-warn-800">
                {Object.entries(semItens)
                  .map(([a2, q]) => `${q} O.S. de ${MES_CURTO[n - 1]}/${a2.slice(2)}`)
                  .join(", ")}{" "}
                sem itens carregados do ERP — o ranking não as vê.
              </div>
            )}
            {sobraSemNome > 0.05 && (
              <div className="text-[11px] text-slate-400">
                {dinheiro(sobraSemNome)} vieram do ERP sem produto nomeado e ficam fora do ranking.
              </div>
            )}
            <div className="text-[11px] text-slate-400">
              Os valores dos produtos são brutos, antes do desconto — as linhas dos anos, acima, são líquidas.
              Cada linha de colunas usa a escala do próprio produto; para comparar produtos, leia os totais.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function Campanhas() {
  /* O MESMO frescor do chip global: as O.S. daqui vêm da tabela alimentada
     pela mesma carga do cache. Com a carga parada 30h, o saldo apresentado ao
     parceiro estaria velho com só o chip de 12px avisando no canto -- o furo
     que o AvisoDadoParado existe para fechar, e que só Contas Atrasadas e
     Orçamentos tinham coberto. */
  const { atualizadoEm } = useApp();
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
  /* O BOTÃO DE ATUALIZAR incrementa isto e o efeito rebusca. Sem ele, quem
     ficava com a tela aberta enquanto pedidos novos desciam do ERP (a carga
     traz de 20 em 20 minutos) só via a lista nova fechando e reabrindo. */
  const [versaoBusca, setVersaoBusca] = useState(0);
  const [buscaCliente, setBuscaCliente] = useState("");
  const [achados, setAchados] = useState([]);
  const [buscaOS, setBuscaOS] = useState("");
  const [formVenda, setFormVenda] = useState(null);
  // Nasce no grão MAIS FINO: é o que responde "o que foi comprado".
  const [graoProduto, setGraoProduto] = useState("item");
  const [criandoEdicao, setCriandoEdicao] = useState(false);
  const [vinculando, setVinculando] = useState(false);
  /* O ANO ESCOLHIDO na lista. Nasce vazio e vira o ano corrente assim que os
     dados chegam SE houver campanha nele -- num 2027 sem nada cadastrado,
     abrir num ano vazio faria a tela parecer quebrada. Ver o efeito abaixo. */
  const [anoSel, setAnoSel] = useState("");
  /* AS DUAS ABAS DA LISTA (pedido do dono, 23/08): "dentro de cada ano ficar
     só do ano" -- a soma de campanhas diferentes no topo não fazia sentido
     (Fenics + eleição no mesmo número não responde nada) -- e TODA a
     comparação concentrada numa aba própria: ano a ano, eventos vinculados e
     ranking. */
  const [abaLista, setAbaLista] = useState("campanhas");
  /* PREFERÊNCIA DO DONO (23/08): em análise, TODO quadro recolhe -- e a tela
     lembra a escolha. Chave por seção, para uma seção nova não apagar o que
     já estava configurado. */
  const [abertasAnalise, setAbertasAnalise] = useState(() => {
    const padrao = { anoAAno: true, eventos: true, ranking: true };
    try {
      return { ...padrao, ...JSON.parse(localStorage.getItem("campanhas_analise_secoes") || "{}") };
    } catch {
      return padrao;
    }
  });
  const alternarAnalise = useCallback((id) => {
    setAbertasAnalise((a) => {
      const novo = { ...a, [id]: !a[id] };
      try { localStorage.setItem("campanhas_analise_secoes", JSON.stringify(novo)); } catch { /* aba anônima */ }
      return novo;
    });
  }, []);
  /* A ABA "ANOS": o panorama automático. Só desce quando a aba abre, e o
     detalhe de um mês só quando o mês é clicado -- a base são 20 mil O.S. e
     este é o único jeito de a aba abrir leve. */
  const [panorama, setPanorama] = useState(null);
  const [erroPanorama, setErroPanorama] = useState("");
  const [mesAberto, setMesAberto] = useState(null);
  const [detalhesMes, setDetalhesMes] = useState({});
  /* O MODO DA ABA (pedido do dono, 23/08): "um seletor para ver completo os
     valores e sem as campanhas" -- o negócio de base sem o efeito eleição.
     Escolha persistida, como toda preferência de análise. */
  const [modoAnos, setModoAnos] = useState(() => {
    try { return localStorage.getItem("campanhas_anos_modo") === "sem" ? "sem" : "tudo"; } catch { return "tudo"; }
  });
  const trocarModoAnos = useCallback((m) => {
    setModoAnos(m);
    try { localStorage.setItem("campanhas_anos_modo", m); } catch { /* aba anônima */ }
  }, []);
  /* O mês-calendário aberto ("todos os janeiros") e os produtos dele, em
     cache POR mês+modo -- trocar o seletor rebusca sem apagar o que já veio. */
  const [mesCalAberto, setMesCalAberto] = useState(null);
  const [mesCalCache, setMesCalCache] = useState({});
  const [errosMesCal, setErrosMesCal] = useState({});
  /* Erro POR MES, como o cache. Uma string unica vazava: o erro de mai/2023
     ficava de pe ao reabrir abr/2023 (cacheado, o efeito retorna cedo) e
     cobria dados perfeitamente carregados. */
  const [errosMes, setErrosMes] = useState({});
  /* Mesma preferência do dono: cada quadro recolhe e a escolha fica. As
     chaves são dinâmicas (uma por ano), então o padrão é ABERTO e só o que
     a pessoa fechou é gravado. */
  const [abertasAnos, setAbertasAnos] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("campanhas_anos_secoes") || "{}");
    } catch {
      return {};
    }
  });
  const alternarAnos = useCallback((id) => {
    setAbertasAnos((a) => {
      const novo = { ...a, [id]: a[id] === false };
      try { localStorage.setItem("campanhas_anos_secoes", JSON.stringify(novo)); } catch { /* aba anônima */ }
      return novo;
    });
  }, []);
  const abrirMes = useCallback((mes) => setMesAberto((atual) => (atual === mes ? null : mes)), []);

  useEffect(() => {
    if (abaLista !== "anos" || panorama || erroPanorama) return;
    let vivo = true;
    lerAnosPanorama()
      .then((pan) => { if (vivo) setPanorama(pan); })
      .catch((e) => { if (vivo) setErroPanorama(e.message); });
    return () => { vivo = false; };
  }, [abaLista, panorama, erroPanorama]);

  useEffect(() => {
    if (!mesAberto || mesAberto in detalhesMes) return;
    const mes = mesAberto;
    setErrosMes((x) => (x[mes] ? { ...x, [mes]: "" } : x));
    lerAnosMes(mes)
      .then((d) => setDetalhesMes((x) => ({ ...x, [mes]: d })))
      .catch((e) => setErrosMes((x) => ({ ...x, [mes]: e.message })));
  }, [mesAberto, detalhesMes]);

  useEffect(() => {
    if (!mesCalAberto) return;
    const chave = `${mesCalAberto}|${modoAnos}`;
    if (chave in mesCalCache) return;
    setErrosMesCal((x) => (x[chave] ? { ...x, [chave]: "" } : x));
    lerAnosMesCal(mesCalAberto, modoAnos === "sem")
      .then((d) => setMesCalCache((x) => ({ ...x, [chave]: d })))
      .catch((e) => setErrosMesCal((x) => ({ ...x, [chave]: e.message })));
  }, [mesCalAberto, modoAnos, mesCalCache]);

  const [gruposAbertos, setGruposAbertos] = useState({});
  const alternarGrupo = useCallback((k) => setGruposAbertos((g) => ({ ...g, [k]: !g[k] })), []);
  const [abertas, setAbertas] = useState(() => {
    const padrao = { edicoes: true, ranking: true, produtos: true, quando: true, aceitas: true,
                     semOS: false, clientes: true, escolher: true, historico: false };
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
  /* ATÉ QUANDO. Uma campanha ACABA: a eleição termina em outubro, e a O.S. de
     dezembro para o mesmo candidato é outra venda. Sem este corte, a lista de
     escolher trazia a carteira inteira dele até hoje, e cada O.S. de fora do
     evento era uma chance de marcar errado. Vazio = até hoje. */
  const ate = String(campanha?.ate || "").slice(0, 10);

  const chavesTexto = (campanha?.clientes || []).map((c) => c.chave).sort().join("|");
  const chavesDaCampanha = useMemo(() => (chavesTexto ? chavesTexto.split("|") : []), [chavesTexto]);

  const idsTodos = Object.values(mapa || {})
    .flatMap((c) => Object.keys(c?.os || {}))
    .sort()
    .join("|");
  /* SÓ IMPORTA NA LISTA. Com uma campanha aberta o efeito abaixo usa
     `buscarOrdensDe`, e `idsTexto` não entra na conta -- mas estava nas
     dependências assim mesmo: cada O.S. marcada mudava a string, o efeito
     rodava de novo e a seção "Marcar O.S." piscava "Procurando as O.S." a
     cada clique, com a lista sumindo debaixo do cursor. */
  const idsTexto = aberta ? "" : idsTodos;
  /* AS JÁ ACEITAS, pelo id. A busca por cliente e período alimenta "escolher",
     mas não serve para CONFERIR o que já entrou: estreitar o período, ou tirar
     um comprador da lista, tirava a O.S. aceita da resposta e a tela passava a
     afirmar "cancelada no ERP" sobre venda viva -- afirmação sobre dinheiro,
     feita a partir de uma pergunta que nem foi feita. */
  const idsAceitasTexto = aberta ? Object.keys(mapa?.[aberta]?.os || {}).sort().join("|") : "";

  useEffect(() => {
    let vivo = true;
    setBuscandoOS(true);
    const aceitas = idsAceitasTexto ? [...new Set(idsAceitasTexto.split("|"))] : [];
    const pedido = aberta
      ? Promise.all([
          chavesDaCampanha.length ? buscarOrdensDe(chavesDaCampanha, desde, ate) : Promise.resolve([]),
          buscarOrdensPorId(aceitas),
        ]).then(([doPeriodo, porId]) => unirOrdens(doPeriodo, porId))
      : buscarOrdensPorId(idsTexto ? [...new Set(idsTexto.split("|"))] : []);
    pedido
      .then((os) => vivo && setOrdens(os))
      .catch((e) => vivo && setAviso({ tom: "erro", texto: e.message }))
      .finally(() => vivo && setBuscandoOS(false));
    return () => { vivo = false; };
  }, [aberta, chavesDaCampanha, desde, ate, idsTexto, idsAceitasTexto, versaoBusca]);

  useEffect(() => {
    const t = buscaCliente.trim();
    if (t.length < 2) { setAchados([]); return undefined; }
    let vivo = true;
    const id = setTimeout(() => {
      /* O período da campanha vale também aqui: o total ao lado do nome tem de
         ser o do EVENTO, não o da carteira inteira do cliente. */
      buscarClientes(t, desde, ate)
        .then((cs) => vivo && setAchados(cs))
        .catch(() => vivo && setAchados([]));
    }, 280);
    return () => { vivo = false; clearTimeout(id); };
  }, [buscaCliente, desde, ate]);

  /* O MESMO CLIENTE PODE ESTAR EM VÁRIAS CAMPANHAS, e é o normal: o candidato
     comprou na eleição de 2022 e na de 2026. A MESMA O.S., não: ela foi
     vendida para um evento só. `donoPorOS` percorre as CAMPANHAS (não as
     permutas -- são perguntas diferentes) e trava a O.S. que já está em outra,
     senão ela somaria duas vezes no total do ano e ninguém veria de onde veio
     a diferença. A tela diz em qual campanha ela está, para a pessoa poder
     tirar de lá se foi engano. */
  const donos = useMemo(() => donoPorOS(mapa || {}), [mapa]);
  const lista = useMemo(() => resumoGeralCampanhas(mapa || {}, ordens, ANO_HOJE), [mapa, ordens]);

  const anos = useMemo(() => anosDasCampanhas(lista), [lista]);
  /* ABRIR NO ANO CORRENTE, mas só se ele existir. Sem esta escolha, quem
     abrisse a tela num ano sem campanha veria zeros e concluiria que perdeu
     tudo -- quando o certo é mostrar o ano mais recente que tem. Roda uma vez:
     depois disso o ano é do Leonardo, e recarregar dado não pode arrastar a
     escolha dele. */
  const escolheuAno = useRef(false);
  useEffect(() => {
    if (escolheuAno.current || !anos.length) return;
    escolheuAno.current = true;
    // Os anos vêm em ordem crescente, então o mais RECENTE é o último.
    setAnoSel(anos.some((a) => a.ano === String(ANO_HOJE)) ? String(ANO_HOJE) : anos[anos.length - 1].ano);
  }, [anos]);

  /* O ANO ESCOLHIDO PODE DEIXAR DE EXISTIR -- basta corrigir o ano da última
     campanha dele, ou apagá-la. O recorte ficava apontando para o vazio: zero
     cartões, zero reais, e nenhuma pista de que a escolha é que estava velha.
     Cai para "todos", que é o único destino em que nada some. */
  useEffect(() => {
    if (!anoSel || anoSel === "todos" || !anos.length) return;
    if (!anos.some((a) => a.ano === anoSel)) setAnoSel("todos");
  }, [anos, anoSel]);

  const totais = useMemo(() => totaisDoAno(lista, anoSel), [lista, anoSel]);
  const comparativo = useMemo(() => comparativoPorAno(lista), [lista]);
  /* A lista de cartões segue o recorte. O quadro comparativo NÃO -- ele é o
     que dá a comparação, e filtrá-lo deixaria a tela sem contra o que
     comparar justamente quando se escolhe um ano. */
  const listaDoAno = useMemo(
    () => (!anoSel || anoSel === "todos" ? lista : lista.filter((c) => String(c.ano || "") === anoSel)),
    [lista, anoSel],
  );
  // O ranking mora na aba Análise e cobre a história inteira -- comparação de
  // gente, não de ano.
  const rankingGeral = useMemo(() => compradoresDaCampanha(lista), [lista]);

  const totalGeral = useMemo(() => totaisDoAno(lista, "todos"), [lista]);
  /* Cada cartão contra a edição anterior DELE. Uma passada para a lista inteira:
     por cartão seria refazer o agrupamento de eventos N vezes. */
  const contraAnterior = useMemo(() => comparativoDeEdicoes(lista), [lista]);
  const eventos = useMemo(() => eventosVinculados(lista), [lista]);

  /* O panorama automático organizado: 12 casas por ano (fora ≠ zero) e a
     média de cada época do ano. Conta pura, testada em campanhas.test.mjs. */
  const anosAuto = useMemo(
    () => (panorama
      ? panoramaPorAno(panorama.meses, panorama.anos, {
          desde: panorama.cobertura?.desde,
          ate: panorama.cobertura?.ate,
          hoje: hojeISO(),
        })
      : []),
    [panorama],
  );
  /* O seletor da aba: "tudo" ou o negócio de base sem as campanhas. A conta
     é pura e roda sobre o MESMO panorama -- nada volta ao servidor. */
  const anosVistos = useMemo(
    () => (modoAnos === "sem" ? semCampanhas(anosAuto) : anosAuto),
    [anosAuto, modoAnos],
  );
  const epoca = useMemo(() => epocaDoAno(anosVistos), [anosVistos]);
  const picoEpoca = useMemo(
    () => epoca.filter((e) => e.anos > 0).reduce((pi, e) => (pi && pi.media >= e.media ? pi : e), null),
    [epoca],
  );
  const linhasMesCal = useMemo(
    () => (mesCalAberto ? mesCalendarioComparado(anosVistos, mesCalAberto) : []),
    [anosVistos, mesCalAberto],
  );
  const semAno = totalGeral.semAno;
  /* A O.S. REPETIDA INFLA OS DOIS NÚMEROS, e o controle só olhava o recorte.
     Escolhendo 2026, o cartão "Todas as campanhas" continuava somando a mesma
     O.S. de 2022 e 2026 sem uma palavra -- exatamente o número que fica
     grande na tela. Agora os dois são conferidos. */
  const repetidasGeral = totalGeral.repetidas;
  /* O ano que mais vendeu. Empate fica com o mais RECENTE: entre dois anos
     iguais, o que interessa à direção é o de agora. */

  const resumo = useMemo(() => (campanha ? resumoDaCampanha(campanha, ordens) : null), [campanha, ordens]);
  const extrato = useMemo(() => (campanha ? extratoDaCampanha(campanha, ordens) : null), [campanha, ordens]);
  /* As outras edições do MESMO evento. Saem da mesma `lista` da tela de fora,
     MAS com uma campanha aberta o painel só carrega as O.S. dos compradores
     DELA -- as outras edições não têm contra o que conferir e caem no valor
     congelado na marcação (`semConferir`). Está certo para comparar (é o valor
     que valia quando a O.S. entrou), e o rodapé do bloco diz isso. O
     comentário antigo prometia "exatamente os números que a tela de fora
     mostra", que é justamente o que não são. */
  const lider = useMemo(() => (resumo ? maiorComprador(resumo) : null), [resumo]);
  const meses = useMemo(() => comprasPorMes(resumo?.linhas || []), [resumo]);

  /* PAGO × EM ABERTO das O.S. marcadas. A fatia desce da porta (títulos do
     contas a receber, que apontam a O.S. pelo número); a conta é feita aqui,
     em lib/calc/financeiroOS.js, onde tem teste. A chave do efeito é a LISTA
     DE NÚMEROS (string estável), não `resumo` -- senão cada renomeada da
     campanha rebuscaria títulos à toa. `versaoBusca` entra para o botão
     Atualizar rebuscar também a cobrança. */
  const [finResp, setFinResp] = useState(null);
  const [finErro, setFinErro] = useState("");
  const numerosTexto = useMemo(
    () => (resumo?.linhas || []).map((l) => l.numero).filter(Boolean).sort().join("|"),
    [resumo],
  );
  /* OS IDS viajam junto: é por id que a permuta registra a O.S. que consumiu.
     Entram na MESMA chave do efeito (`para`) para a resposta continuar
     amarrada à pergunta inteira. */
  const idsTextoFin = useMemo(
    () => (resumo?.linhas || []).map((l) => l.id).filter(Boolean).sort().join("|"),
    [resumo],
  );
  const perguntaFin = `${numerosTexto}#${idsTextoFin}`;
  useEffect(() => {
    if (!aberta || !numerosTexto) { setFinResp(null); setFinErro(""); return undefined; }
    let vivo = true;
    setFinErro("");
    lerOsFinanceiro(numerosTexto.split("|"), idsTextoFin ? idsTextoFin.split("|") : [])
      /* A RESPOSTA VIAJA COM A PERGUNTA (`para`). Sem isso, abrir outra edição
         pelo quadro "Edições" trocava a campanha sem passar pela lista, e o
         primeiro render pareava as O.S. da nova com os títulos da anterior:
         nenhum número casava, e a tela carimbava "sem título no ERP" em O.S.
         PAGA e "Recebido R$ 0,00" como se fosse resultado. O mesmo valia
         depois de uma falha de rede, que só acendia o aviso sem largar o dado
         velho -- e os selos, o chip do grupo e o PDF seguiam mentindo. */
      .then((d) => vivo && setFinResp({ para: perguntaFin, dados: d }))
      .catch((e) => vivo && setFinErro(e.message));
    return () => { vivo = false; };
  }, [aberta, numerosTexto, idsTextoFin, perguntaFin, versaoBusca]);
  /* Só vale o que responde à pergunta ATUAL. Resposta de outra campanha (ou de
     antes de marcar/tirar O.S.) não vira selo nem cartão: a tela volta a
     "conferindo", que é a verdade enquanto a nova não chega. */
  const finDados = finResp?.para === perguntaFin ? finResp.dados : null;
  const financeiro = useMemo(
    () => (finDados && resumo ? financeiroDasLinhas(resumo.linhas, finDados, hojeISO()) : null),
    [finDados, resumo],
  );
  /* Por DATA, do começo do evento para o fim -- a MESMA direção da curva
     mensal logo acima. Estavam opostas: a curva ia de jan para out da esquerda
     para a direita, e a lista embaixo dela começava em out. Ler as duas juntas
     obrigava a inverter o tempo no meio do caminho. */
  const porData = useMemo(
    () => [...(resumo?.linhas || [])].sort((a, b) => String(a.data).localeCompare(String(b.data))),
    [resumo],
  );
  const produtos = useMemo(
    () => (campanha ? produtosDaCampanha(campanha, ordens) : null),
    [campanha, ordens],
  );
  const categorias = useMemo(() => (produtos ? categoriasDosProdutos(produtos) : []), [produtos]);

  /* As que ainda podem ser vinculadas, com quantas cada uma já arrasta junto. */
  const candidatas = useMemo(() => {
    if (!aberta || !campanha) return [];
    const eu = { id: aberta, nome: campanha.nome, ano: campanha.ano, evento: campanha.evento };
    return candidatasAVincular(lista, eu).map((c) => ({
      ...c,
      jaLigadas: membrosDoEvento(lista, c).length,
    }));
  }, [lista, aberta, campanha]);

  const edicoes = useMemo(
    () => (aberta ? edicoesDoMesmoEvento(lista, { id: aberta, nome: campanha?.nome, ano: campanha?.ano }) : []),
    [lista, aberta, campanha],
  );

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
        /* A aba Anos lê a MESMA marcação que acabou de mudar (a fatia âmbar
           vem das O.S. das campanhas). Sem zerar, marcar 50 O.S. e abrir a
           aba mostraria o estado de antes -- duas abas da mesma tela em
           desacordo. O efeito rebusca sozinho na próxima visita. */
        setPanorama(null);
        setDetalhesMes({});
        setMesCalCache({});
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
    /* NASCE NO ANO QUE ESTÁ NA TELA. Nascia sempre no ano de hoje, e quem
       estava revendo 2022 criava a campanha, preenchia tudo, voltava para a
       lista -- e ela não estava lá, porque o recorte continuava em 2022 e ela
       tinha nascido em 2026. Some sem erro nenhum: o pior tipo. */
    const ano = /^\d{4}$/.test(anoSel) ? anoSel : String(ANO_HOJE);
    const ok = await mexer(id, {
      campos: {
        nome: "Nova campanha", ano, meta: 0, clientes: [],
        // Já nasce recortada no ano: ver o comentário do `desde`.
        desde: `${ano}-01-01`,
      },
      criar: true,
    });
    if (ok) setAberta(id);
  }, [mexer, anoSel]);

  /* CRIAR OUTRA EDIÇÃO, ligada a esta.
   *
   * Duas gravações, nesta ordem e pela FILA do `mexer` (a segunda precisa ler o
   * registro que a primeira deixou):
   *   1. carimba `evento` na campanha aberta, se ela ainda não tiver. A primeira
   *      edição criada vira a âncora do evento, e o id dela é a chave.
   *   2. cria a nova com o mesmo `evento` e o mesmo nome.
   *
   * O ano vem do formulário. As datas nascem no ano inteiro (01/01 a 31/12)
   * porque para uma edição antiga isso é o certo: sem o corte de cima, ligar um
   * comprador traria tudo o que ele comprou daquele ano ATÉ HOJE.
   */
  const criarEdicao = useCallback(
    async (ano) => {
      if (!aberta) return;
      const atual = mapaRef.current?.[aberta];
      const evento = atual?.evento || aberta;
      if (!atual?.evento) {
        const ok = await mexer(aberta, { campos: { evento } });
        /* Se a âncora não gravou, PARA. Criar a nova assim mesmo deixaria as
           duas ligadas só pelo nome — que é exatamente o vínculo frágil que
           este botão existe para substituir, e ninguém veria a diferença. */
        if (!ok || ok.evento !== evento) {
          setAviso({ tom: "erro", texto: "Não consegui ligar as duas edições. Tente de novo e, se repetir, me avise." });
          return;
        }
      }
      const id = novoId("campanha");
      const nova = await mexer(id, {
        campos: {
          nome: atual?.nome || "Nova campanha",
          ano, evento, meta: 0, clientes: [],
          desde: `${ano}-01-01`,
          ate: `${ano}-12-31`,
        },
        criar: true,
      });
      if (nova) {
        setCriandoEdicao(false);
        setAberta(id);
        setAviso({ tom: "ok", texto: `Edição de ${ano} criada e ligada a esta. Ajuste as datas para as do evento.` });
      }
    },
    [aberta, mexer],
  );

  /* VINCULAR UMA CAMPANHA QUE JÁ EXISTE a este evento.
   *
   * CARIMBA O GRUPO INTEIRO DELA, não só ela. Se a outra já estava ligada a uma
   * terceira, mexer só nela arrancaria a terceira do grupo e o vínculo antigo
   * sumiria calado -- o tipo de perda que ninguém percebe até a comparação
   * ficar errada meses depois.
   *
   * Em fila (o `mexer` já é), uma gravação por campanha: são poucas, e cada uma
   * precisa do seu próprio evento de histórico dizendo que foi ligada.
   */
  const vincular = useCallback(
    async (outra) => {
      if (!aberta) return;
      const atual = mapaRef.current?.[aberta];
      const ancora = atual?.evento || aberta;
      if (!atual?.evento) {
        const ok = await mexer(aberta, { campos: { evento: ancora } });
        if (!ok || ok.evento !== ancora) {
          setAviso({ tom: "erro", texto: "Não consegui preparar o vínculo. Tente de novo e, se repetir, me avise." });
          return;
        }
      }
      /* O grupo da OUTRA sai da lista mais nova, não do render: entre abrir o
         seletor e clicar, outra aba pode ter mexido. */
      const listaAgora = resumoGeralCampanhas(mapaRef.current || {}, ordens, ANO_HOJE);
      const alvos = membrosDoEvento(listaAgora, outra);
      let falharam = 0;
      for (const alvo of alvos) {
        const ok = await mexer(alvo.id, { campos: { evento: ancora } });
        if (!ok || ok.evento !== ancora) falharam += 1;
      }
      setVinculando(false);
      if (falharam) {
        setAviso({ tom: "erro", texto: `${alvos.length - falharam} de ${alvos.length} ficaram ligadas. Abra de novo e vincule a que faltou.` });
      } else {
        setAviso({
          tom: "ok",
          texto: alvos.length === 1
            ? `“${outra.nome || "sem nome"}” (${outra.ano || "sem ano"}) agora é edição deste evento.`
            : `${alvos.length} campanhas ligadas a este evento.`,
        });
      }
    },
    [aberta, ordens, mexer],
  );

  /* DUPLICAR: a estrutura viaja, as O.S. não. "Pra não precisar ficar criando
     toda vez": a nova nasce com o mesmo nome, os MESMOS compradores (numa
     eleição municipal são 30 candidaturas -- religar um a um era o grosso do
     trabalho), a meta, o vínculo de evento e o período no ano escolhido.
     O.S., lançamentos e anexos NÃO vão: são fatos da edição antiga. */
  const duplicar = useCallback(async (c) => {
    const sugestao = /^\d{4}$/.test(String(c.ano || "")) ? String(Number(c.ano) + 2) : String(ANO_HOJE);
    const resposta = window.prompt(
      `Duplicar “${c.nome || "sem nome"}” para qual ano?\n(Leva compradores, meta e vínculo — as O.S. ficam na original.)`,
      sugestao,
    );
    if (resposta == null) return;
    const ano = resposta.replace(/\D/g, "").slice(0, 4);
    if (!/^\d{4}$/.test(ano)) {
      setAviso({ tom: "erro", texto: "Ano inválido — use 4 dígitos (ex.: 2028)." });
      return;
    }
    const atual = mapaRef.current?.[c.id] || c;
    /* DUAS EDIÇÕES DO MESMO ANO SÃO CADASTRO DUPLICADO -- a trava existe no
       "Outra edição" (com mensagem própria) e faltava aqui. Sem ela, o
       atalho de copiar sugeria "ano + 2", a pessoa confirmava, e a mesma tela
       passava a acusar o estado que o botão acabou de criar: "há mais de uma
       campanha com este nome em 2026". A conferência é a mesma do vincular, e
       vem ANTES de gravar a âncora `evento`, para não deixar escrita solta
       numa duplicação recusada. */
    // Sem `ordens`: aqui só interessam os ANOS do grupo, não os valores --
    // e depender delas prenderia a duplicação à busca ter respondido.
    const listaAgora = resumoGeralCampanhas(mapaRef.current || {}, [], ANO_HOJE);
    const doEvento = membrosDoEvento(listaAgora, listaAgora.find((x) => x.id === c.id) || c);
    const colide = doEvento.find((x) => String(x.ano || "").trim() === ano);
    if (colide) {
      setAviso({
        tom: "erro",
        texto: `Este evento já tem a edição de ${ano} (“${colide.nome || "sem nome"}”). Abra a que existe em vez de criar outra.`,
      });
      return;
    }
    const evento = atual?.evento || c.id;
    if (!atual?.evento) {
      const ok = await mexer(c.id, { campos: { evento } });
      if (!ok || ok.evento !== evento) {
        setAviso({ tom: "erro", texto: "Não consegui ligar as duas edições. Tente de novo." });
        return;
      }
    }
    const id = novoId("campanha");
    const clientes = atual?.clientes || [];
    const nova = await mexer(id, {
      campos: {
        nome: atual?.nome || "Nova campanha", ano, evento,
        meta: atual?.meta || 0, clientes,
        desde: `${ano}-01-01`, ate: `${ano}-12-31`,
      },
      criar: true,
    });
    if (nova) {
      setAberta(id);
      setAviso({ tom: "ok", texto: `“${c.nome}” duplicada para ${ano}, com ${clientes.length} compradores e sem as O.S. Tire quem não voltou e marque as novas.` });
    }
  }, [mexer]);

  const apagar = useCallback(async (id, nome) => {
    if (!window.confirm(`Apagar a campanha "${nome || "sem nome"}"? O histórico, as vendas e os anexos vão junto.`)) return;
    setAviso(null);
    try {
      await removerCampanha(id);
      setPanorama(null); // a fatia âmbar da aba Anos inclui as O.S. desta campanha
      setDetalhesMes({});
      setMesCalCache({});
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

  /* MARCAR (OU TIRAR) VÁRIAS DE UMA VEZ.
   *
   * Continua sendo um ATO da direção, não uma regra: o que muda é que o ato
   * cobre a lista que está na tela em vez de uma linha. A tela nunca deduz
   * quais O.S. são do evento -- ela só deixa dizer "estas todas são".
   *
   * UMA GRAVAÇÃO SÓ, com o patch inteiro. Em laço, cada pedido parte do
   * registro que leu e o seguinte grava por cima: foi assim que marcações do
   * painel se atropelaram (ov_orc/ov_rec) e que uma marcação de cliente sumiu
   * na permuta. O `osPatch` já aceita o mapa inteiro, e o banco percorre chave
   * a chave dentro da MESMA transação com a linha travada.
   */
  const marcarVarias = useCallback(
    async (linhas, ligar) => {
      if (!aberta || !linhas.length) return;
      const patch = {};
      for (const o of linhas) {
        if (!ligar) { patch[o.id] = null; continue; }
        const bruta = ordens.find((x) => String(x.id) === String(o.id));
        const ficha = fichaDaOS(bruta || o);
        /* Uma ficha ruim no meio faria o banco PULAR aquela chave em silêncio
           (ele só aplica objeto ou nulo) -- e o lote voltaria "sem erro" com
           uma O.S. a menos. Melhor não gravar nada e dizer qual. */
        if (!ficha || typeof ficha !== "object") {
          setAviso({ tom: "erro", texto: `Não consegui montar a ficha da O.S. ${o.numero || o.id}. Recarregue a página e tente de novo.` });
          return;
        }
        patch[o.id] = ficha;
      }
      const gravado = await mexer(aberta, { osPatch: patch });
      if (!gravado) return;   // erro de rede já avisado pelo mexer
      /* CONFERE O EFEITO, uma a uma. "Não deu erro" nunca foi prova de que
         gravou, e num lote de quarenta uma que não entrou passaria batido --
         a conta ficaria menor e ninguém saberia de quanto. */
      const os = gravado.os || {};
      const faltaram = linhas.filter((o) => !!os[o.id] !== ligar);
      if (faltaram.length) {
        setAviso({
          tom: "erro",
          texto: `${linhas.length - faltaram.length} de ${linhas.length} ${ligar ? "entraram" : "saíram"}. Não consegui ${ligar ? "marcar" : "tirar"}: ${faltaram.slice(0, 5).map((o) => o.numero || o.id).join(", ")}${faltaram.length > 5 ? ` e mais ${faltaram.length - 5}` : ""}. Tente de novo.`,
        });
      } else {
        setAviso({
          tom: "ok",
          texto: ligar
            ? `${linhas.length} O.S. entraram na campanha.`
            : `${linhas.length} O.S. saíram da campanha.`,
        });
      }
    },
    [aberta, ordens, mexer],
  );

  const ligarCliente = useCallback(
    async (c) => {
      if (!aberta) return;
      /* PATCH, não o array inteiro. Mandando a lista montada aqui, duas
         pessoas ligando compradores ao mesmo tempo apagavam o nome uma da
         outra -- e a checagem de efeito logo abaixo aprovava, porque o array
         volta exatamente como foi mandado. O banco funde chave a chave dentro
         da transação travada (migração 20260824d). */
      const gravado = await mexer(aberta, (atual) => {
        const atuais = atual?.clientes || [];
        if (atuais.some((x) => x.chave === c.chave)) return { campos: {} };
        return { campos: { clientesPatch: { [c.chave]: { nome: c.nome, cnpjs: c.cnpjs || [] } } } };
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
      await mexer(aberta, () => ({ campos: { clientesPatch: { [chave]: null } } }));
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
  /* O QUE O BOTÃO "MARCAR TODAS" REALMENTE PEGA: o que está na tela AGORA,
     menos as presas em outra campanha (que nem clicáveis são). O valor vai no
     rótulo porque marcar quarenta O.S. muda o número do evento na hora. */
  const podeMarcarTodas = useMemo(
    () => paraEscolherFiltradas.filter((o) => !o.presaEm),
    [paraEscolherFiltradas],
  );
  const presasNaLista = paraEscolherFiltradas.length - podeMarcarTodas.length;
  const valorParaMarcar = useMemo(
    () => Math.round(podeMarcarTodas.reduce((s, o) => s + (Number(o.valor) || 0), 0) * 100) / 100,
    [podeMarcarTodas],
  );

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
        <AvisoDadoParado atualizadoEm={atualizadoEm} />

        <input ref={arquivoRef} type="file" className="hidden" onChange={(e) => anexar(e.target.files?.[0])} />

        <Card className="space-y-4">
          {/* SÓ NO PAPEL: na tela o nome está no campo ao lado, que o
              `@media print` esconde por ser `input` — sem isto o PDF sairia
              sem dizer de que campanha é. */}
          <CabecalhoImpressao
            titulo={`Impresilk — Campanha: ${campanha.nome || "sem nome"}${campanha.ano ? ` (${campanha.ano})` : ""}`}
            linhas={[
              desde || ate
                ? `Período: ${desde ? dataLonga(desde) : "início não informado"} a ${ate ? dataLonga(ate) : "hoje"}`
                : "Período não informado",
              `${resumo.compradores} ${resumo.compradores === 1 ? "comprador" : "compradores"} · ${resumo.linhas.length} O.S.`,
              lider ? `Quem comprou mais: ${lider.cliente} — ${dinheiro(lider.valor)}` : null,
              `Emitido em ${dataLonga(hojeISO())}`,
              `Total vendido ${dinheiro(resumo.vendido)}`,
              /* A cobrança vai no papel: é com o PDF na mão que se confere com
                 o cliente. Só entra quando o dado desceu — papel não carrega
                 "carregando". */
              financeiro && finDados?.temPagos
                ? `Recebido ${dinheiro(financeiro.totais.recebido)} · Em aberto ${dinheiro(financeiro.totais.aberto)}`
                : null,
            ]}
          />
          <div className="flex flex-wrap items-start justify-between gap-4">
            {/* NO CELULAR o nome ocupa a linha inteira e os botões vão para a
                linha de baixo. Sem o `w-full`, este bloco recebia `flex-1`
                com `min-w-0` e encolhia para OITO PIXELS: os campos vazavam
                para fora e o "Baixar PDF" era desenhado por cima do nome. */}
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:min-w-0 sm:flex-1">
              {/* NÃO-CONTROLADOS, com `key` -- o mesmo padrão da meta e das
                  datas logo abaixo. Controlados por `mapa`, a resposta da
                  gravação anterior chegava DURANTE a digitação e devolvia o
                  campo ao valor do servidor: renomear, dar Tab e digitar o ano
                  fazia o ano voltar para o antigo, com `maxLength` comendo os
                  dígitos restantes -- gravava o ano errado sem erro nenhum, e
                  o ano decide o recorte da lista e a comparação entre
                  edições. */}
              <input
                key={`nome-${aberta}`}
                className="input min-w-[12rem] max-w-sm flex-1 text-lg font-medium"
                defaultValue={campanha.nome ?? ""}
                placeholder="Qual é o evento?"
                onBlur={(e) => {
                  const nome = e.target.value;
                  if (nome !== (campanha.nome ?? "")) mexer(aberta, { campos: { nome } });
                }}
              />
              <input
                key={`ano-${aberta}`}
                className="input h-10 w-24 text-center"
                defaultValue={campanha.ano ?? ""}
                placeholder="Ano"
                inputMode="numeric"
                maxLength={4}
                onBlur={(e) => {
                  const ano = e.target.value.replace(/\D/g, "").slice(0, 4);
                  if (ano === (campanha.ano ?? "")) return;   // nada mudou, nada grava
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
              <div className="mb-1 text-xs text-slate-500">Quem comprou mais</div>
              {lider ? (
                <>
                  <div className="flex items-baseline gap-1.5">
                    <Crown size={15} className="shrink-0 self-center text-warn-500" />
                    <span className="truncate text-lg font-semibold text-slate-800" title={lider.cliente}>
                      {lider.cliente}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {dinheiro(lider.valor)}
                    {lider.fatia != null && ` · ${Math.round(lider.fatia * 100)}% do que passou por O.S.`}
                    {/* A distância para o segundo é o que responde "esta
                        campanha é um cliente só ou é um mercado". O percentual
                        sozinho não responde. */}
                    {lider.sobreOSegundo != null && (
                      <> · {dinheiro(lider.sobreOSegundo)} à frente do 2º</>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    de {resumo.compradores} {resumo.compradores === 1 ? "comprador" : "compradores"}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-2xl font-semibold tabular-nums text-slate-800">0</div>
                  <div className="text-xs text-slate-500">nenhuma O.S. marcada ainda</div>
                </>
              )}
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

          {/* PAGO × EM ABERTO — só faz sentido com O.S. marcadas. */}
          {resumo.linhas.length > 0 && (
            <CartoesFinanceiro financeiro={financeiro} erro={finErro} dados={finDados} />
          )}

          {(resumo.mudaram > 0 || resumo.sumiram > 0 || resumo.semConferir) && (
            <div className="rounded-lg bg-warn-50 px-3 py-2 text-xs text-warn-800">
              {resumo.semConferir && "As O.S. não carregaram nesta sessão: o total está usando o valor congelado na marcação. "}
              {resumo.mudaram > 0 && `${resumo.mudaram} O.S. mudaram de valor no ERP depois de marcadas (o total já usa o valor novo). `}
              {resumo.sumiram > 0 && `${resumo.sumiram} O.S. sumiram do ERP (cancelamento) e continuam somando — confira se ainda contam.`}
            </div>
          )}
        </Card>

        {/* ------------------------------------------- as outras edições */}
        {/* A SEÇÃO EXISTE MESMO SEM EDIÇÃO NENHUMA: é aqui que mora o botão de
            criar a próxima (ou a antiga), e escondê-la enquanto não houver a
            segunda deixaria o caminho invisível justo na hora de abrir o
            evento pela primeira vez. */}
        <Secao
          semImpressao
          id="edicoes"
          titulo="Edições deste evento"
          sub="O mesmo evento em outros anos — é a comparação que diz se cresceu."
          aberta={abertas.edicoes}
          aoAlternar={alternar}
          acao={
            !criandoEdicao && !vinculando && (
              <div className="flex items-center gap-1.5">
                {/* VINCULAR vem primeiro porque é o caso mais comum na base
                    real: as edições já estão cadastradas, só não se acham (o
                    ano mora dentro do nome). Criar é para a que ainda não
                    existe. */}
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => { if (!abertas.edicoes) alternar("edicoes"); setVinculando(true); }}
                >
                  <Link2 size={15} /> Vincular existente
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => { if (!abertas.edicoes) alternar("edicoes"); setCriandoEdicao(true); }}
                >
                  <Plus size={15} strokeWidth={2.4} /> Outra edição
                </button>
              </div>
            )
          }
        >
          {vinculando && (
            <FormVincular
              candidatas={candidatas}
              aoVincular={vincular}
              aoCancelar={() => setVinculando(false)}
              salvando={salvando}
            />
          )}
          {criandoEdicao && (
            <FormEdicao
              anoAtual={campanha.ano}
              anosUsados={edicoes.map((e) => String(e.ano || ""))}
              aoCriar={criarEdicao}
              aoCancelar={() => setCriandoEdicao(false)}
              salvando={salvando}
            />
          )}
          {edicoes.length > 0 ? (
            <Edicoes
              edicoes={edicoes}
              atual={{ id: aberta, ano: campanha.ano, vendido: resumo.vendido, compradores: resumo.compradores }}
              aoAbrir={setAberta}
              repetidos={anosRepetidos(edicoes)}
            />
          ) : (
            !criandoEdicao && !vinculando && (
              <Empty>
                Esta é a única edição deste evento. Se a de outro ano já está cadastrada, use
                “Vincular existente” — o nome com o ano dentro (“Política 2026 — Deputados”) faz com
                que elas não se achem sozinhas. Se ainda não existe, use “Outra edição”.
              </Empty>
            )
          )}
        </Secao>

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

        {/* ------------------------------------------- o que foi vendido */}
        <Secao
          semImpressao
          id="produtos"
          titulo="Produtos vendidos"
          sub="O que a campanha vendeu de verdade — é o que diz o que estocar e quem escalar na próxima."
          aberta={abertas.produtos}
          aoAlternar={alternar}
        >
          {produtos && (
            <Produtos
              produtos={produtos}
              categorias={categorias}
              grao={graoProduto}
              aoTrocar={setGraoProduto}
            />
          )}
        </Secao>

        {/* ------------------------------------------------- quando vendeu */}
        <Secao
          semImpressao
          id="quando"
          titulo="Compras por data"
          sub="A linha do tempo do evento — quando entrou cada O.S."
          aberta={abertas.quando}
          aoAlternar={alternar}
        >
          {!porData.length ? (
            <Empty>Nenhuma O.S. marcada ainda.</Empty>
          ) : (
            <>
              <CurvaMensal meses={meses} />
              <div>
                {porData.map((l) => (
                  <LinhaCompra key={l.id} l={l} />
                ))}
              </div>
            </>
          )}
        </Secao>

        <Secao
          semImpressao
          id="historico"
          titulo="Histórico da campanha"
          sub="Escrito pelo servidor a cada mudança."
          aberta={abertas.historico}
          aoAlternar={alternar}
        >
          <Historico eventos={eventos} conta={CONTA_O_EVENTO} cortados={campanha?.historicoCortado || 0} />
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
            {achados.length >= 200 && (
              <div className="mt-1 text-xs text-warn-700">
                A busca trouxe 200 nomes e pode haver mais — digite mais letras para refinar.
              </div>
            )}
            {/* FILTRADO NÃO É INEXISTENTE. Quem já é comprador da campanha sai
                da lista de sugestões -- e a tela respondia "não existe cliente
                com esse nome", sobre alguém que está a dois centímetros dali,
                no chip acima. Digitar o nome para conferir se já foi ligado é
                gesto diário. */}
            {buscaCliente.trim().length >= 2 && !clientesAchados.length && (
              <div className="mt-1 text-xs text-slate-400">
                {achados.length > 0 ? (
                  achados.length === 1
                    ? `“${achados[0].nome}” já está nesta campanha — veja os compradores acima.`
                    : `Os ${achados.length} clientes com esse nome já estão nesta campanha.`
                ) : (
                  <>
                    Nenhum cliente com esse nome nas O.S. de {desde ? dataLonga(desde) : "todo o período"}
                    {ate ? ` a ${dataLonga(ate)}` : ""}.
                  </>
                )}
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
          acao={
            /* A VÁLVULA DO LOTE. Marcar quarenta de uma vez é um clique;
               desmarcar uma a uma seriam quarenta. Sem isto, um "marcar todas"
               no cliente errado vira meia hora de conserto. */
            resumo.linhas.length > 1 && (
              <button
                type="button"
                className="btn-ghost"
                disabled={salvando}
                onClick={() => {
                  if (!window.confirm(
                    `Tirar as ${resumo.linhas.length} O.S. de “${campanha.nome || "esta campanha"}”? Elas voltam para a lista de marcar.`
                  )) return;
                  marcarVarias(resumo.linhas, false);
                }}
              >
                <X size={15} /> Tirar todas
              </button>
            )
          }
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
                  finPorNumero={financeiro?.porNumero}
                />
              ))}
            </div>
          ) : (
            <div>
              {resumo.linhas.map((l) => (
                <LinhaAceita
                  key={l.id}
                  l={l}
                  aoTirar={(x) => marcarOS(x, false)}
                  onde="campanha"
                  fin={financeiro?.porNumero?.[String(l.numero)]}
                />
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

        {/* ------------------------------------------------- escolher
            FORA DO PAPEL (`semImpressao`): esta lista é o que NÃO entrou.
            Ia junto no PDF -- o comentário do extrato já dizia que "as seções
            acima são sem-impressao", e justo esta não era -- e o documento que
            prova o que o evento vendeu saía com páginas de O.S. alheias. */}
        <Secao
          id="escolher"
          titulo="Marcar O.S."
          semImpressao
          sub="O que ainda NÃO entrou, dos compradores acima. O mesmo cliente também compra fora do evento — por isso cada O.S. entra por um clique."
          aberta={abertas.escolher}
          aoAlternar={alternar}
          acao={
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="btn-ghost"
                disabled={buscandoOS}
                title="Busca de novo as O.S. no painel — pedidos novos descem do ERP a cada 20 minutos"
                onClick={() => setVersaoBusca((v) => v + 1)}
              >
                <RotateCw size={14} className={buscandoOS ? "animate-spin" : ""} />
                {buscandoOS ? "Atualizando…" : "Atualizar"}
              </button>
              {paraEscolher.length > 8 && (
                <div className="relative">
                  <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    className="input h-8 w-44 pl-8 text-sm"
                    placeholder="nº ou cliente"
                    value={buscaOS}
                    onChange={(e) => setBuscaOS(e.target.value)}
                  />
                </div>
              )}
            </div>
          }
        >
          {/* O PERÍODO DO EVENTO, e não só o começo. A eleição acaba em
              outubro; sem o corte de cima, a lista trazia a carteira inteira do
              candidato até hoje e cada O.S. de fora do evento era uma chance de
              marcar errado. As duas datas são as MESMAS que limitam a busca --
              uma data só para "quando foi" e outra para "o que procurar" seriam
              duas verdades para a mesma coisa. */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <CalendarRange size={15} className="shrink-0 text-slate-400" />
            <span className="text-slate-600">A campanha vai de</span>
            <input
              type="date"
              className="input h-8 w-40 text-sm"
              defaultValue={desde}
              key={`desde-${aberta}`}
              aria-label="Data em que a campanha começou"
              onBlur={(e) => {
                const d = e.target.value;
                if (d === desde) return;
                mexer(aberta, { campos: { desde: /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "" } });
              }}
            />
            <span className="text-slate-600">até</span>
            <input
              type="date"
              className="input h-8 w-40 text-sm"
              defaultValue={ate}
              key={`ate-${aberta}`}
              aria-label="Data em que a campanha acabou"
              onBlur={(e) => {
                const d = e.target.value;
                if (d === ate) return;
                mexer(aberta, { campos: { ate: /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "" } });
              }}
            />
            {!ate && <span className="text-xs text-slate-400">vazio = até hoje</span>}
            {/* PERÍODO INVERTIDO não é bloqueado, é DITO: travar o campo faria
                o Leonardo brigar com a tela ao corrigir as duas datas em
                ordem. Mas em silêncio a lista viria vazia sem motivo aparente. */}
            {desde && ate && ate < desde && (
              <span className="text-xs text-bad-700">
                o fim está antes do começo — nenhuma O.S. vai aparecer
              </span>
            )}
          </div>

          {/* O QUE O PAINEL REALMENTE TEM: uma campanha de 2022 pode parecer um
              fracasso quando é só dado que ainda não desceu do ERP. */}
          {(ordens.clientesCortados > 0 || ordens.linhasNoTeto) && (
            <div className="rounded-lg bg-bad-50 px-3 py-2 text-xs text-bad-700">
              {ordens.clientesCortados > 0
                ? `Esta campanha tem clientes demais para uma busca só: as O.S. de ${ordens.clientesCortados} deles NÃO estão na lista abaixo.`
                : "Há mais O.S. do que a busca consegue trazer de uma vez — a lista abaixo está incompleta."}{" "}
              Me avise para aumentar o limite.
            </div>
          )}
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
            <>
              {/* MARCAR TODAS = todas as que ESTÃO NA TELA, e o botão diz
                  quantas e quanto. "Todas" sem número é a promessa que faz
                  alguém marcar quarenta achando que eram doze -- e com o filtro
                  de busca ligado, "todas" quer dizer outra coisa a cada letra
                  digitada. As presas em outra campanha ficam de fora: elas nem
                  são clicáveis uma a uma. */}
              {podeMarcarTodas.length > 1 && (
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-xs text-slate-600">
                    {buscaOS.trim()
                      ? `${podeMarcarTodas.length} O.S. casam com “${buscaOS.trim()}”`
                      : `${podeMarcarTodas.length} O.S. ainda fora da campanha`}
                    {" · "}
                    <span className="tabular-nums">{dinheiro(valorParaMarcar)}</span>
                    {presasNaLista > 0 && (
                      <span className="text-slate-400">
                        {" "}({presasNaLista} {presasNaLista === 1 ? "está" : "estão"} em outra campanha e fica
                        {presasNaLista === 1 ? "" : "m"} de fora)
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    className="btn-ghost h-8 px-3 text-sm"
                    disabled={salvando}
                    onClick={() => {
                      /* CONFIRMA porque isto mexe direto no número do evento, e
                         desfazer quarenta uma a uma seria pior que o problema
                         que o botão resolve (por isso existe o "Tirar todas"
                         na seção de cima). */
                      if (!window.confirm(
                        `Marcar ${podeMarcarTodas.length} O.S. (${dinheiro(valorParaMarcar)}) como parte de “${campanha.nome || "esta campanha"}”?`
                      )) return;
                      marcarVarias(podeMarcarTodas, true);
                    }}
                  >
                    <Check size={15} strokeWidth={2.4} /> Marcar as {podeMarcarTodas.length}
                  </button>
                </div>
              )}
              <div>
                {paraEscolherFiltradas.map((o) => (
                  <LinhaEscolher key={o.id} o={o} aoMarcar={marcarOS} onde="campanha" />
                ))}
              </div>
            </>
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
        {extrato && (
          <ExtratoImpresso e={extrato} produtos={produtos} categorias={categorias} meses={meses} />
        )}

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
        <AvisoDadoParado atualizadoEm={atualizadoEm} />

      {/* SEIS ABAS: as três primeiras são o trabalho das campanhas; as três
          últimas são as análises AUTOMÁTICAS (pedido do dono, 24/08) --
          vendedores, clientes na curva ABC e produtos. No celular a régua
          rola de lado em vez de espremer os rótulos. */}
      <div className="overflow-x-auto pb-1">
        <Segmented
          opcoes={[
            { valor: "campanhas", rotulo: "Campanhas" },
            { valor: "analise", rotulo: "Análise dos anos" },
            { valor: "anos", rotulo: "Anos" },
            { valor: "vendedores", rotulo: "Vendedores" },
            { valor: "clientes", rotulo: "Clientes" },
            { valor: "produtos", rotulo: "Produtos" },
          ]}
          valor={abaLista}
          onChange={setAbaLista}
          className="whitespace-nowrap"
        />
      </div>

      {abaLista === "campanhas" && (
        <>
          <SeletorAno anos={anos} valor={anoSel} aoEscolher={setAnoSel} temSemAno={semAno} />

          {(totais.repetidas > 0 || repetidasGeral > 0) && (
            <div className="rounded-lg bg-bad-50 px-3 py-2 text-xs text-bad-700">
              {totais.repetidas > 0 ? (
                <>
                  {totais.repetidas === 1
                    ? "1 O.S. está em mais de uma campanha deste recorte"
                    : `${totais.repetidas} O.S. estão em mais de uma campanha deste recorte`}{" "}
                  e por isso os totais somam {dinheiro(totais.valorRepetido)} a mais.{" "}
                </>
              ) : null}
              {repetidasGeral > totais.repetidas && (
                <>
                  Somando todos os anos são {repetidasGeral} O.S. repetidas ({dinheiro(totalGeral.valorRepetido)} a mais).{" "}
                </>
              )}
              Abra as campanhas e tire a O.S. de uma delas — cada venda pertence a um evento só.
            </div>
          )}
          {semAno > 0 && (
            <div className="rounded-lg bg-warn-50 px-3 py-2 text-xs text-warn-800">
              {semAno === 1 ? "Há 1 campanha sem ano preenchido" : `Há ${semAno} campanhas sem ano preenchido`}
              {anoSel !== "todos" && " — ela não aparece neste recorte"}.{" "}
              <button
                type="button"
                className="underline hover:text-warn-900"
                onClick={() => setAnoSel("todos")}
                disabled={anoSel === "todos"}
              >
                {anoSel === "todos" ? "Está em “Todos os anos”" : "Ver em “Todos os anos”"}
              </button>{" "}
              e preencha o ano na ficha.
            </div>
          )}
        </>
      )}

      {abaLista === "analise" && (
        <>
          {/* PREFERÊNCIA DO DONO: todo quadro de análise recolhe, e a escolha
              fica no aparelho. Clicar num ano do quadro LEVA ao ano: troca o
              recorte e volta para a aba de campanhas. */}
          <Secao
            id="anoAAno"
            titulo="Ano a ano"
            sub="Total de cada ano contra o ano anterior que teve campanha — para comparar o mesmo evento entre anos, veja os eventos abaixo."
            aberta={abertasAnalise.anoAAno}
            aoAlternar={alternarAnalise}
          >
            <Comparativo
              linhas={comparativo}
              anoSel={anoSel}
              aoEscolher={(a) => { setAnoSel(a); setAbaLista("campanhas"); }}
            />
          </Secao>

          {/* OS EVENTOS VINCULADOS: cada evento com suas edições e a evolução
              -- a comparação que faz sentido, mesmo evento contra ele mesmo. */}
          <Secao
            id="eventos"
            titulo="Eventos e suas edições"
            sub="Ligados pelo vínculo ou pelo nome — toque numa edição para abrir."
            aberta={abertasAnalise.eventos}
            aoAlternar={alternarAnalise}
          >
            {eventos.length ? eventos.map((ev) => (
              <div key={ev.rotulo + ev.total} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-medium text-slate-800">{ev.rotulo}</span>
                  <span className="shrink-0 text-xs tabular-nums text-slate-400">
                    {ev.edicoes.length} {ev.edicoes.length === 1 ? "edição" : "edições"} · {dinheiro(ev.total)}
                  </span>
                </div>
                <div className="space-y-1">
                  {ev.edicoes.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setAberta(e.id)}
                      className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50"
                    >
                      <span className="w-12 shrink-0 font-medium tabular-nums text-brand-600">{e.ano || "—"}</span>
                      <span className="min-w-0 flex-1 truncate text-xs text-slate-400">
                        {e.compradores} {e.compradores === 1 ? "comprador" : "compradores"} · {e.os} O.S.
                        {e.encerrada && " · encerrada"}
                      </span>
                      <span className="w-28 shrink-0 text-right tabular-nums text-slate-800">{dinheiro(e.vendido)}</span>
                      <span className="w-28 shrink-0 text-right">
                        <Variacao variacao={e.variacao} anoAnterior={e.anoAnterior} diferenca={e.diferenca} />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )) : (
              <Empty>Nenhuma campanha ainda.</Empty>
            )}
          </Secao>

          {/* Quem mais comprou, na história inteira -- comparação de gente,
              não de ano. O recorte por ano mora na outra aba. */}
          {rankingGeral.length > 0 && (
            <Secao
              id="ranking"
              titulo="Quem mais comprou, todos os anos"
              sub="Somando todas as campanhas."
              aberta={abertasAnalise.ranking}
              aoAlternar={alternarAnalise}
            >
              <Ranking itens={rankingGeral.slice(0, 10)} semOS={0} />
              {rankingGeral.length > 10 && (
                <div className="text-xs text-slate-400">e mais {rankingGeral.length - 10} compradores.</div>
              )}
            </Secao>
          )}
        </>
      )}

      {abaLista === "anos" && (
        <>
          {/* O QUE ESTA ABA É -- dita uma vez, no topo: automática, base
              inteira, e o que a cor âmbar significa. */}
          <div className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
            Automática: soma <span className="font-medium">todas</span> as O.S. do painel
            {panorama?.cobertura?.desde ? ` desde ${dataLonga(panorama.cobertura.desde)}` : ""} — aqui nada
            precisa ser marcado.{" "}
            {modoAnos === "sem"
              ? "As vendas marcadas nas campanhas estão FORA desta visão — é o negócio de base."
              : "A fatia âmbar é o acumulado das vendas marcadas nas campanhas."}{" "}
            Toque num mês para ver quem comprou e o que foi vendido.
          </div>
          {/* CARGA ATRASADA NAO PODE PASSAR POR "VENDEU ZERO": se a última
              carga parou dias atrás, os dias seguintes não existem na base e
              a régua já os apaga -- mas quem olha precisa saber o porquê. */}
          {panorama?.cobertura?.ate && panorama.cobertura.ate < hojeISO() && (
            <div className="rounded-lg bg-warn-50 px-3 py-2 text-xs text-warn-800">
              A base vai até <span className="font-medium">{dataLonga(panorama.cobertura.ate)}</span> — a carga
              ainda não trouxe os dias seguintes, e eles aparecem apagados, não como venda zero.
            </div>
          )}

          {/* O SELETOR DO MODO: o pico de eleição esconde o negócio de base;
              tirar as campanhas da conta mostra o que a casa vende sozinha. */}
          <Segmented
            opcoes={[
              { valor: "tudo", rotulo: "Valores completos" },
              { valor: "sem", rotulo: "Sem as campanhas" },
            ]}
            valor={modoAnos}
            onChange={trocarModoAnos}
          />

          {erroPanorama ? (
            <Card className="space-y-2 py-6 text-center">
              <div className="text-sm text-bad-600">{erroPanorama}</div>
              <button
                type="button"
                className="text-xs text-brand-600 underline hover:text-brand-700"
                onClick={() => setErroPanorama("")}
              >
                Tentar de novo
              </button>
            </Card>
          ) : !panorama ? (
            <Card className="py-8 text-center text-sm text-slate-400">Somando a base inteira no servidor…</Card>
          ) : (
            <>
              <Secao
                id="epoca"
                titulo="A época do ano"
                sub="Média de cada mês somando os anos cobertos — meses pela metade (o primeiro da base e o atual) ficam de fora da média."
                aberta={abertasAnos.epoca !== false}
                aoAlternar={alternarAnos}
              >
                <BarrasAno
                  casas={casasDaEpoca(epoca)}
                  aoClicar={(chave) => setMesCalAberto((atual) => (atual === Number(chave) ? null : Number(chave)))}
                  ativo={mesCalAberto == null ? null : String(mesCalAberto)}
                />
                {picoEpoca && (
                  <div className="text-xs text-slate-500">
                    Época mais forte: <span className="font-medium text-slate-700">{MES_CURTO[picoEpoca.n - 1]}</span>, com{" "}
                    {dinheiro(picoEpoca.media)} de média sobre {picoEpoca.anos} {picoEpoca.anos === 1 ? "ano" : "anos"}
                    {picoEpoca.mediaCampanha > 0 && <> — {dinheiro(picoEpoca.mediaCampanha)} disso é campanha</>}.
                  </div>
                )}
                <div className="text-[11px] text-slate-400">
                  Toque num mês para comparar todos os janeiros (ou fevereiros…) entre si, com os produtos da época.
                </div>
                <LegendaAnos temParcial={false} semCampanha={modoAnos === "sem"} />
                {mesCalAberto != null && (
                  <MesCalendario
                    n={mesCalAberto}
                    linhas={linhasMesCal}
                    detalhe={mesCalCache[`${mesCalAberto}|${modoAnos}`]}
                    erro={errosMesCal[`${mesCalAberto}|${modoAnos}`]}
                    semCampanha={modoAnos === "sem"}
                    aoFechar={() => setMesCalAberto(null)}
                  />
                )}
              </Secao>

              {anosVistos.map((a) => {
                const idSec = `a${a.ano}`;
                const pctCamp = a.valor > 0 && a.valorCampanha > 0 ? Math.round((a.valorCampanha / a.valor) * 100) : 0;
                const temParcial = a.meses.some((m) => m.parcial && !m.fora);
                return (
                  <Secao
                    key={a.ano}
                    id={idSec}
                    titulo={a.ano}
                    sub={`${dinheiro(a.valor)} em ${a.os} O.S.${
                      a.clientes == null ? "" : ` · ${a.clientes} clientes diferentes`
                    }${a.valorCampanha > 0 ? ` · ${dinheiro(a.valorCampanha)} de campanha (${pctCamp}%)` : ""}`}
                    aberta={abertasAnos[idSec] !== false}
                    aoAlternar={alternarAnos}
                  >
                    <BarrasAno casas={casasDoAno(a)} aoClicar={abrirMes} ativo={mesAberto} />
                    {a.pico && (
                      <div className="text-xs text-slate-500">
                        Mês mais forte: <span className="font-medium text-slate-700">{rotuloMes(a.pico.mes)}</span> com{" "}
                        {dinheiro(a.pico.valor)} em {a.pico.os} O.S.
                        {a.pico.valorCampanha > 0 && <> — {dinheiro(a.pico.valorCampanha)} disso foi campanha</>}
                      </div>
                    )}
                    <LegendaAnos temParcial={temParcial} semCampanha={modoAnos === "sem"} />
                    {mesAberto?.startsWith(`${a.ano}-`) && (
                      <MesDetalhe
                        mes={mesAberto}
                        detalhe={detalhesMes[mesAberto]}
                        erro={errosMes[mesAberto]}
                        semCampanha={modoAnos === "sem"}
                        aoFechar={() => setMesAberto(null)}
                      />
                    )}
                  </Secao>
                );
              })}
            </>
          )}
        </>
      )}

      {abaLista === "vendedores" && <AbaVendedores />}
      {abaLista === "clientes" && <AbaClientes />}
      {abaLista === "produtos" && <AbaProdutos />}

      {abaLista === "campanhas" && (listaDoAno.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {listaDoAno.map((c) => (
            <CartaoCampanha key={c.id} c={c} aoAbrir={setAberta} contra={contraAnterior.get(c.id)} aoDuplicar={duplicar} />
          ))}
        </div>
      ) : lista.length ? (
        /* Tem campanha, só não NESTE ano. Dizer isso evita a leitura errada
           ("sumiram") e mostra a saída no mesmo lugar. */
        <Card className="py-8 text-center">
          <div className="text-sm text-slate-500">
            Nenhuma campanha em {anoSel}.{" "}
            <button type="button" className="underline hover:text-slate-800" onClick={() => setAnoSel("todos")}>
              Ver todos os anos
            </button>
          </div>
        </Card>
      ) : (
        <Card className="py-10 text-center">
          <Megaphone size={28} className="mx-auto mb-3 text-slate-300" />
          <div className="text-sm text-slate-500">
            Nenhuma campanha ainda. Crie uma, ligue os compradores e marque as O.S. do evento.
          </div>
        </Card>
      ))}
    </div>
  );
}
