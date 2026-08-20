/* PERMUTAS: quanto o parceiro ainda tem de crédito conosco.
 *
 * Permuta é troca -- o parceiro nos dá um espaço, um serviço, uma mercadoria, e
 * passa a gastar o valor disso em comunicação visual. Hoje esse controle vive
 * na cabeça e num papel: ninguém consegue responder "quanto sobra da permuta do
 * fulano" sem procurar O.S. uma a uma no ERP.
 *
 * A tela é de UMA pergunta: o saldo. Tudo o mais existe para sustentá-lo.
 *
 *   saldo = crédito − O.S. aceitas − lançamentos de consumo + lançamentos de crédito
 *
 * O QUE ELA NÃO FAZ, DE PROPÓSITO:
 *
 * 1. Não adivinha quais O.S. são da permuta. O mesmo cliente compra na permuta
 *    e compra pagando; só a direção sabe separar. Cada O.S. entra por um
 *    clique, e o que fica guardado é a LISTA das aceitas -- nunca uma regra que
 *    as deduza depois. (Deduzir pelo nome já criou sósia na Central de Acessos;
 *    aqui criaria saldo falso.)
 *
 * 2. Não esconde divergência. Se o valor de uma O.S. mudou no ERP depois do
 *    aceite, ou se ela sumiu (foi cancelada), a linha diz. Um saldo que se
 *    corrige em silêncio é pior que um saldo errado: ninguém vai conferir.
 *
 * 3. Não escreve o próprio histórico. Quem carimba quem fez, quando e o quê é
 *    o servidor, comparando o registro antigo com o pedido. Histórico que a
 *    parte interessada escreve não serve para conferir com o parceiro.
 *
 * DE ONDE VÊM AS O.S.: da tabela `painel_ordens`, buscadas NO SERVIDOR, por
 * cliente. Não do pacote que o painel carrega no login -- esse vai de 2025 em
 * diante porque viaja inteiro para o navegador, e o histórico desde 2020 são
 * ~19.500 O.S. e ~10 MB. Aqui desce só o cliente escolhido.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Plus, Trash2, Search, X, Check, AlertTriangle, Handshake, Building2,
  Archive, Paperclip, History, Download, CalendarRange, ChevronDown,
} from "lucide-react";
import {
  lerPermutas, mexerNaPermuta, removerPermuta, anexarNaPermuta, lerAnexo,
  buscarClientes, buscarOrdensDe, buscarOrdensPorId, lerCobertura,
} from "../services/permutas.js";
import {
  fichaDaOS, resumoDaPermuta, resumoGeral, totaisDasPermutas, ordensDosClientes, donoPorOS,
  extratoDaPermuta, linhasPorCliente,
} from "../lib/calc/permutas.js";
import { moedaCheia, paraNumero, dataCurta, dataLonga } from "../lib/format.js";
import { Card, PageTitle, Empty, CarregandoModulo, BotaoPDF, CabecalhoImpressao } from "../components/ui.jsx";

const novoId = (p) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/* AQUI O CENTAVO CONTA, ao contrário do resto do painel.
   Nas outras telas o dinheiro é grandeza -- R$ 1,2 milhão a receber, e o
   `moeda()` corta os centavos porque eles não mudam decisão nenhuma. A permuta
   é uma CONTA, que tem que fechar com o parceiro: crédito de R$ 12.000,50
   aparecendo como "R$ 12.001" é meio real inventado, e a primeira coisa que o
   parceiro faz é conferir. */
const dinheiro = moedaCheia;

/* A DATA AQUI PRECISA DO ANO. As outras telas olham o mês corrente e dd/MM
   basta. Uma permuta dura o que o crédito durar, e a busca vai a 2020: "30/09"
   ao lado de "05/08" parece anterior quando é cinco anos depois. */
const dataDaOS = (iso) => {
  if (!iso) return "";
  const ano = String(iso).slice(0, 4);
  return ano === String(new Date().getFullYear()) ? dataCurta(iso) : dataLonga(iso);
};

const hojeISO = () => new Date().toISOString().slice(0, 10);

/* CNPJ só para conferir com o olho: o cadastro pode trazer CPF de pessoa
   física no mesmo campo. Formata os dois. */
const formatarDoc = (d) => {
  const s = String(d || "");
  if (s.length === 14) return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (s.length === 11) return s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return s;
};

// ------------------------------------------------------------------ pedaços

function Aviso({ aviso, aoFechar }) {
  if (!aviso) return null;
  const erro = aviso.tom === "erro";
  return (
    /* GRUDADO NO TOPO DA TELA. O aviso ficava no fluxo da página, e a página
       de permuta é longa: quem estava rolando na lista de O.S. lá embaixo
       recebia um erro que aparecia fora do campo de visão, e o clique parecia
       simplesmente não ter feito nada. Erro que não é visto é erro que não
       existe para quem usa. */
    <Card
      role="status"
      aria-live="polite"
      className={`sticky top-2 z-20 flex items-start justify-between gap-3 text-sm shadow-lg ${
        erro ? "border-bad-200 bg-bad-50 text-bad-700" : "border-ok-200 bg-ok-50 text-ok-700"
      }`}
    >
      <span className="flex items-start gap-2">
        {erro ? <AlertTriangle size={16} className="mt-0.5 shrink-0" /> : <Check size={16} className="mt-0.5 shrink-0" />}
        {aviso.texto}
      </span>
      <button type="button" onClick={aoFechar} className="shrink-0 text-current opacity-60 hover:opacity-100" aria-label="Fechar aviso">
        <X size={14} />
      </button>
    </Card>
  );
}

/* O número que a tela existe para dar, E O QUE ELE QUER DIZER.
 *
 * Positivo: o parceiro ainda tem crédito conosco -- ele pode gastar.
 * Negativo: entregamos mais do que ele nos deu, então ELE ESTÁ NOS DEVENDO.
 *
 * A primeira versão dizia "consumiu além do crédito". Está correto e é inútil:
 * descreve o que aconteceu, não o que fazer. Quem lê a tela precisa saber que
 * aquilo é dinheiro A RECEBER, com nome e valor, para poder cobrar. "Consumiu
 * além" some no meio de uma lista; "está devendo" faz alguém pegar o telefone.
 */
function Saldo({ valor, grande }) {
  const positivo = valor >= 0;
  return (
    <div>
      <div className={`${grande ? "text-3xl" : "text-xl"} font-semibold tabular-nums ${positivo ? "text-ok-700" : "text-bad-700"}`}>
        {dinheiro(Math.abs(valor))}
      </div>
      <div className={`text-xs ${positivo ? "text-slate-500" : "text-bad-700"}`}>
        {positivo ? "ainda tem para gastar" : "está nos devendo"}
      </div>
    </div>
  );
}

function Barra({ pct }) {
  if (pct === null) return null;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className={`h-full rounded-full ${pct >= 1 ? "bg-bad-500" : "bg-brand-500"}`}
        style={{ width: `${Math.max(2, pct * 100)}%` }}
      />
    </div>
  );
}

function CartaoPermuta({ p, aoAbrir }) {
  /* ESTOUROU O CRÉDITO: o cartão INTEIRO fica vermelho, não só o número.
     Numa lista de permutas a direção passa o olho pelo conjunto -- um número
     vermelho de 20px no meio de um cartão branco some no meio dos outros, e
     o parceiro DEVENDO é exatamente o estado que não pode passar despercebido:
     é dinheiro a receber e ninguém está cobrando. Encerrada não conta: ali o
     negativo já foi resolvido. */
  const estourou = p.saldo < 0 && !p.encerrada;
  return (
    <button
      type="button"
      onClick={() => aoAbrir(p.id)}
      className={`w-full rounded-xl border p-4 text-left transition hover:shadow-sm ${
        estourou
          ? "border-bad-300 bg-bad-50 hover:border-bad-400"
          : "border-slate-200 bg-white hover:border-brand-300"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`truncate font-medium ${estourou ? "text-bad-800" : "text-slate-800"}`}>
              {p.nome || "Sem nome"}
            </span>
            {p.encerrada && (
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">encerrada</span>
            )}
          </div>
          <div className={`mt-0.5 truncate text-xs ${estourou ? "text-bad-700" : "text-slate-500"}`}>
            {(p.clientes || []).length
              ? (p.clientes || []).map((c) => c.nome).join(" · ")
              : "sem cliente ligado ainda"}
          </div>
        </div>
        <Saldo valor={p.saldo} />
      </div>
      <div className="mt-3 space-y-1.5">
        <Barra pct={p.pct} />
        <div className={`flex flex-wrap justify-between gap-x-3 text-[11px] ${estourou ? "text-bad-700" : "text-slate-500"}`}>
          <span>{dinheiro(p.consumido)} usados de {dinheiro(p.credito)}</span>
          <span>
            {p.linhas.length} O.S.
            {/* Crédito e consumo contados SEPARADOS. Somados viravam "1 manual"
                num lançamento que era crédito -- e ler "manual" ao lado do que
                foi gasto sugere gasto. */}
            {p.creditos.length > 0 && <span> · {p.creditos.length} crédito</span>}
            {p.consumos.length > 0 && <span> · {p.consumos.length} consumo</span>}
            {(p.anexos || []).length > 0 && <span> · {p.anexos.length} anexo</span>}
            {p.mudaram > 0 && <span className="ml-1 text-warn-700">· {p.mudaram} mudou</span>}
            {p.sumiram > 0 && <span className="ml-1 text-bad-700">· {p.sumiram} sumiu</span>}
          </span>
        </div>
      </div>
    </button>
  );
}

/* UM PAINEL POR CNPJ nas O.S. aceitas.
 *
 * Uma permuta grande abrange várias empresas do mesmo dono -- a do material
 * político tem cinco candidaturas, cada uma com o seu CNPJ. Numa lista corrida
 * as O.S. das cinco ficam intercaladas por data, e "quanto saiu por esta
 * candidatura" -- a pergunta que se faz conferindo com o parceiro -- exige
 * somar à mão.
 *
 * NASCE RECOLHIDO quando há mais de um grupo: aí a primeira coisa que se vê são
 * cinco linhas com cinco totais, em vez de vinte e cinco linhas misturadas. Com
 * um grupo só, agrupar não separa nada e ele já abre.
 */
function GrupoCliente({ g, aberto, aoAlternar, aoTirar }) {
  return (
    <div className="border-b border-slate-100 last:border-0">
      <button
        type="button"
        onClick={() => aoAlternar(g.chave)}
        aria-expanded={aberto}
        className="flex w-full items-center gap-2 py-2.5 text-left hover:bg-slate-50"
      >
        <ChevronDown
          size={15}
          className={`shrink-0 text-slate-400 transition-transform ${aberto ? "" : "-rotate-90"}`}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-slate-800">{g.cliente}</span>
          <span className="text-[11px] text-slate-400">
            {g.cnpj ? formatarDoc(g.cnpj) : "sem CNPJ no cadastro"} · {g.qtd} O.S.
          </span>
        </span>
        <span className="shrink-0 font-medium tabular-nums text-slate-700">{dinheiro(g.valor)}</span>
      </button>
      {aberto && (
        <div className="pb-1 pl-6">
          {g.linhas.map((l) => (
            <LinhaAceita key={l.id} l={l} aoTirar={aoTirar} />
          ))}
        </div>
      )}
    </div>
  );
}

function LinhaAceita({ l, aoTirar }) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-100 py-2.5 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium text-slate-800">O.S. {l.numero}</span>
          <span className="truncate text-xs text-slate-500">{l.cliente}</span>
          {l.mudou && (
            <span className="rounded bg-warn-50 px-1.5 py-0.5 text-[11px] text-warn-700">
              era {dinheiro(l.congelado)} no aceite
            </span>
          )}
          {l.sumiu && (
            <span className="rounded bg-bad-50 px-1.5 py-0.5 text-[11px] text-bad-700">
              cancelada no ERP — ainda abate
            </span>
          )}
          {l.semConferir && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">valor do aceite</span>
          )}
        </div>
        <div className="text-[11px] text-slate-400">
          {dataDaOS(l.data)}
          {/* A CONTA À VISTA quando houve desconto. "R$ 2.000,00" sozinho não
              responde de onde saiu, e foi guardar só o resultado que deixou o
              desconto passar batido. Assim a direção confere contra o PDF do
              ERP na frente do parceiro, sem abrir o ERP. */}
          {l.desconto > 0 && (
            <span className="ml-2">
              {dinheiro(l.bruto)} − {dinheiro(l.desconto)} de desconto
            </span>
          )}
        </div>
      </div>
      <span className="shrink-0 tabular-nums text-slate-700">{dinheiro(l.valor)}</span>
      <button
        type="button"
        onClick={() => aoTirar(l)}
        className="shrink-0 rounded p-1 text-slate-300 hover:bg-bad-50 hover:text-bad-600"
        title="Tirar esta O.S. da permuta"
        aria-label={`Tirar a O.S. ${l.numero} da permuta`}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}

/* Uma entrada do razão da permuta: data, o que foi, quanto, e a nota.
   A NOTA MORA AQUI, não numa gaveta da permuta. Um documento solto não diz a
   qual entrada pertence -- e é justamente isso que o parceiro pergunta quando
   confere: "esses R$ 7.000 são de quê?". */
function LinhaLancamento({ l, aoTirar, aoAnexar, aoBaixar }) {
  const credito = l.tipo === "credito";
  return (
    <div className="flex items-center gap-3 border-b border-slate-100 py-2.5 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate font-medium text-slate-800">{l.descricao || "(sem descrição)"}</span>
          {l.anexo ? (
            <button
              type="button"
              onClick={() => aoBaixar(l.anexo)}
              className="flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600 hover:bg-slate-200"
              title={`Baixar ${l.anexo.nome}`}
            >
              <Download size={11} />
              <span className="max-w-40 truncate">{l.anexo.nome}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => aoAnexar(l)}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="Anexar a nota deste lançamento"
            >
              <Paperclip size={11} /> anexar nota
            </button>
          )}
        </div>
        <div className="text-[11px] text-slate-400">{dataDaOS(l.data)}</div>
      </div>
      <span className={`shrink-0 tabular-nums ${credito ? "text-ok-700" : "text-slate-700"}`}>
        {credito ? "+" : "−"} {dinheiro(l.valor)}
      </span>
      <button
        type="button"
        onClick={() => aoTirar(l)}
        className="shrink-0 rounded p-1 text-slate-300 hover:bg-bad-50 hover:text-bad-600"
        title="Tirar este lançamento"
        aria-label={`Tirar o lançamento ${l.descricao}`}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}

/* O formulário de uma entrada. Mesmo para os dois lados: o que muda é o rótulo
   e o `tipo` já fixado por quem abriu -- lançar crédito na lista de consumo é
   um erro que ninguém percebe olhando um saldo. */
function FormLancamento({ form, setForm, aoSalvar, aoCancelar, salvando }) {
  const credito = form.tipo === "credito";
  return (
    <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_9rem_10rem]">
      <input
        className="input"
        autoFocus
        placeholder={credito ? "O que ele nos deu? (ex.: projeto arquitetônico)" : "O que foi? (ex.: 200 canecas entregues)"}
        value={form.descricao}
        onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
      />
      <input
        className="input tabular-nums"
        inputMode="decimal"
        placeholder="0,00"
        value={form.valor}
        onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
      />
      <input
        type="date"
        className="input"
        value={form.data}
        onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))}
      />
      <div className="flex items-center gap-2 sm:col-span-3">
        <button type="button" className="btn" onClick={aoSalvar} disabled={salvando}>
          {credito ? "Lançar crédito" : "Lançar consumo"}
        </button>
        <button type="button" className="btn-ghost" onClick={aoCancelar}>Cancelar</button>
        <span className="text-xs text-slate-400">a nota você anexa na linha, depois de salvar</span>
      </div>
    </div>
  );
}

function LinhaEscolher({ o, aoMarcar }) {
  const presa = !!o.presaEm;
  return (
    <label
      className={`flex items-center gap-3 border-b border-slate-100 py-2.5 last:border-0 ${
        presa ? "cursor-not-allowed opacity-55" : "cursor-pointer"
      }`}
    >
      <input
        type="checkbox"
        className="h-4 w-4 shrink-0 accent-brand-600"
        checked={o.nesta}
        disabled={presa}
        onChange={(e) => aoMarcar(o, e.target.checked)}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2">
          <span className="font-medium text-slate-800">O.S. {o.numero}</span>
          <span className="truncate text-xs text-slate-500">{o.cliente}</span>
          {presa && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
              já está na permuta “{o.presaEm}”
            </span>
          )}
        </div>
        <div className="text-[11px] text-slate-400">{dataDaOS(o.data)}</div>
      </div>
      <span className="shrink-0 tabular-nums text-slate-700">{dinheiro(o.valor)}</span>
    </label>
  );
}

/* O QUE ACONTECEU NESTA PERMUTA, escrito pelo servidor.
   Existe para a conversa com o parceiro: "o crédito passou de X para Y em tal
   dia, e quem mexeu fui eu" é o que responde uma dúvida seis meses depois. */
const CONTA_O_EVENTO = {
  criou: () => "criou a permuta",
  credito: (e) => `mudou o crédito de ${dinheiro(e.de)} para ${dinheiro(e.para)}`,
  aceitouOS: (e) => `aceitou a O.S. ${e.numero} (${dinheiro(e.valor)})${e.cliente ? ` — ${e.cliente}` : ""}`,
  tirouOS: (e) => `tirou a O.S. ${e.numero} (${dinheiro(e.valor)})`,
  lancou: (e) => `lançou "${e.descricao}" — ${dinheiro(e.valor)} ${e.lado === "credito" ? "aumentando" : "abatendo"} o crédito`,
  mudouLanc: (e) => `alterou o lançamento "${e.descricao}" para ${dinheiro(e.valor)}`,
  tirouLanc: (e) => `tirou o lançamento "${e.descricao}" (${dinheiro(e.valor)})`,
  anexou: (e) => `anexou "${e.nome}"`,
  encerrou: () => "encerrou a permuta",
  reabriu: () => "reabriu a permuta",
};

/* Data E HORA no fuso de quem lê.
   O servidor carimba em UTC. A primeira versão misturava as duas réguas --
   `dataLonga` converte para o fuso local, mas a hora saía do texto cru
   ("18/08/2026 00:29" quando aqui eram 21:29 do dia 18). Num histórico que
   existe para conferir com o parceiro, hora errada é pior que hora nenhuma. */
const quandoFoi = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${dataLonga(iso)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/* SEÇÃO QUE RECOLHE. A tela de uma permuta é alta -- crédito, consumo, O.S.
   aceitas, o que falta escolher, histórico -- e a direção quase sempre quer o
   saldo, não tudo. Clicar no título recolhe.

   O CONTEÚDO CONTINUA MONTADO, escondido pela classe `.recolhido`, e não
   desmontado por um `&&`. Duas razões: recolher e reabrir não perde o que
   estava digitado no formulário aberto ali dentro; e, principalmente, o PDF
   sai completo -- `.recolhido` volta a aparecer no `@media print`. Recolher é
   um gesto de leitura, não uma decisão sobre o que o parceiro recebe.

   A escolha fica guardada no aparelho: quem trabalha com o consumo recolhido
   não quer reabri-lo a cada visita. */
function Secao({ id, titulo, sub, acao, aberta, aoAlternar, semImpressao, children }) {
  return (
    <Card className={`space-y-3 ${semImpressao ? "sem-impressao" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => aoAlternar(id)}
          aria-expanded={aberta}
          className="group flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          <ChevronDown
            size={16}
            className={`mt-0.5 shrink-0 text-slate-400 transition-transform group-hover:text-slate-600 ${
              aberta ? "" : "-rotate-90"
            }`}
          />
          <span className="min-w-0">
            <span className="block font-display font-medium text-slate-800">{titulo}</span>
            {sub && <span className="block text-xs text-slate-500">{sub}</span>}
          </span>
        </button>
        {acao && <div className="shrink-0 sem-impressao">{acao}</div>}
      </div>
      <div className={aberta ? "space-y-3" : "recolhido"}>{children}</div>
    </Card>
  );
}

function Historico({ eventos }) {
  if (!eventos.length) return <Empty>Nada registrado ainda.</Empty>;
  return (
    <ol className="space-y-2">
      {eventos.map((e, i) => (
        <li key={`${e.em}-${i}`} className="flex gap-3 text-sm">
          <span className="w-32 shrink-0 text-[11px] tabular-nums text-slate-400">
            {quandoFoi(e.em)}
          </span>
          <span className="min-w-0 text-slate-600">
            <span className="font-medium text-slate-800">{e.quemNome || e.quem}</span>{" "}
            {(CONTA_O_EVENTO[e.tipo] || (() => e.tipo))(e)}
          </span>
        </li>
      ))}
    </ol>
  );
}

/* O EXTRATO, que SÓ existe no papel.
 *
 * A tela é dividida por tarefa -- lançar crédito, escolher O.S., ver consumo --
 * porque é assim que se trabalha. O papel é dividido por CONTA, porque é assim
 * que se confere com o parceiro: o que ele nos deu de um lado, tudo o que ele
 * consumiu do outro (O.S. e lançamento manual na MESMA lista, por data), e a
 * balança fechando. Separados, o parceiro teria de somar duas colunas para
 * saber quanto gastou.
 *
 * Tabela HTML de propósito: quebra de página no meio de uma lista de trinta
 * O.S. é o caso normal, e é o que o navegador sabe fazer com `<table>`.
 */
const th = { textAlign: "left", fontSize: "8pt", fontWeight: 700, padding: "3px 6px", borderBottom: "1px solid #999" };
const td = { fontSize: "8.5pt", padding: "3px 6px", borderBottom: "1px solid #eee" };
const tdN = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };

function ExtratoImpresso({ e, permuta }) {
  return (
    <div className="apenas-impressao" style={{ marginTop: 10 }}>
      <h2 style={{ fontSize: "11pt", margin: "10px 0 4px" }}>O que o parceiro nos deu</h2>
      {e.creditos.length ? (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...th, width: "5.5rem" }}>Data</th>
              <th style={th}>O que foi</th>
              <th style={{ ...th, width: "11rem" }}>Documento</th>
              <th style={{ ...th, textAlign: "right", width: "7rem" }}>Valor</th>
            </tr>
          </thead>
          <tbody>
            {e.creditos.map((c, i) => (
              <tr key={i}>
                <td style={td}>{dataLonga(c.data)}</td>
                <td style={td}>{c.descricao}</td>
                <td style={td}>{c.nota || "—"}</td>
                <td style={tdN}>{dinheiro(c.valor)}</td>
              </tr>
            ))}
            <tr>
              <td style={{ ...td, fontWeight: 700 }} colSpan={3}>Total recebido</td>
              <td style={{ ...tdN, fontWeight: 700 }}>{dinheiro(e.balanca.recebemos)}</td>
            </tr>
          </tbody>
        </table>
      ) : (
        <p style={{ fontSize: "9pt" }}>Nenhum crédito lançado.</p>
      )}

      <h2 style={{ fontSize: "11pt", margin: "14px 0 4px" }}>O que ele consumiu</h2>
      {e.consumo.length ? (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...th, width: "5.5rem" }}>Data</th>
              <th style={{ ...th, width: "8rem" }}>Documento</th>
              <th style={th}>Cliente / descrição</th>
              <th style={{ ...th, textAlign: "right", width: "6.5rem" }}>Bruto</th>
              <th style={{ ...th, textAlign: "right", width: "6.5rem" }}>Desconto</th>
              <th style={{ ...th, textAlign: "right", width: "7rem" }}>Valor</th>
            </tr>
          </thead>
          <tbody>
            {e.consumo.map((c, i) => (
              <tr key={i}>
                <td style={td}>{dataLonga(c.data)}</td>
                <td style={td}>{c.documento}</td>
                <td style={td}>
                  {c.descricao}
                  {c.alerta && <span style={{ fontWeight: 700 }}> ({c.alerta})</span>}
                </td>
                <td style={tdN}>{c.desconto > 0 ? dinheiro(c.bruto) : "—"}</td>
                <td style={tdN}>{c.desconto > 0 ? `− ${dinheiro(c.desconto)}` : "—"}</td>
                <td style={tdN}>{dinheiro(c.valor)}</td>
              </tr>
            ))}
            <tr>
              <td style={{ ...td, fontWeight: 700 }} colSpan={5}>Total consumido</td>
              <td style={{ ...tdN, fontWeight: 700 }}>{dinheiro(e.balanca.entregamos)}</td>
            </tr>
          </tbody>
        </table>
      ) : (
        <p style={{ fontSize: "9pt" }}>Nenhum consumo lançado.</p>
      )}

      {/* Por cliente só quando há mais de um: com um só, seria repetir o total. */}
      {(permuta.clientes || []).length > 1 && e.porCliente.length > 1 && (
        <>
          <h2 style={{ fontSize: "11pt", margin: "14px 0 4px" }}>Consumo por empresa</h2>
          <table style={{ width: "60%", borderCollapse: "collapse" }}>
            <tbody>
              {e.porCliente.map((c) => (
                <tr key={c.nome}>
                  <td style={td}>{c.nome}</td>
                  <td style={tdN}>{dinheiro(c.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h2 style={{ fontSize: "11pt", margin: "14px 0 4px" }}>Balança comercial</h2>
      <table style={{ width: "60%", borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={td}>O parceiro nos deu</td>
            <td style={tdN}>{dinheiro(e.balanca.recebemos)}</td>
          </tr>
          <tr>
            <td style={td}>Nós entregamos</td>
            <td style={tdN}>{dinheiro(e.balanca.entregamos)}</td>
          </tr>
          <tr>
            <td style={{ ...td, fontWeight: 700, borderTop: "2px solid #333" }}>
              {e.balanca.lado === "a-receber"
                ? "SALDO DEVEDOR — o parceiro deve à Impresilk"
                : e.balanca.lado === "zerada"
                  ? "Balança zerada"
                  : "Crédito que o parceiro ainda tem"}
            </td>
            <td style={{ ...tdN, fontWeight: 700, borderTop: "2px solid #333" }}>
              {dinheiro(Math.abs(e.balanca.diferenca))}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// -------------------------------------------------------------------- tela

const LANC_VAZIO = { descricao: "", valor: "", data: "", tipo: "consumo" };

export default function Permutas() {
  const [mapa, setMapa] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  /* O "deu certo" some sozinho depois de alguns segundos; o ERRO fica até a
     pessoa fechar. Aviso bom que gruda vira ruído e ensina a ignorar a faixa —
     e aí o erro, quando vier, também passa batido. */
  useEffect(() => {
    if (aviso?.tom !== "ok") return;
    const t = setTimeout(() => setAviso((a) => (a?.tom === "ok" ? null : a)), 4000);
    return () => clearTimeout(t);
  }, [aviso]);
  const [aberta, setAberta] = useState(null);
  const [salvando, setSalvando] = useState(false);

  // As O.S. NÃO vêm mais do pacote do login: são buscadas no servidor, por
  // cliente. `ordens` é o que a tela conhece agora -- só o necessário.
  const [ordens, setOrdens] = useState([]);
  const [buscandoOS, setBuscandoOS] = useState(false);
  const [buscaCliente, setBuscaCliente] = useState("");
  const [achados, setAchados] = useState([]);
  const [buscaOS, setBuscaOS] = useState("");
  const [formLanc, setFormLanc] = useState(null);
  /* Quais grupos de CNPJ estão abertos dentro das O.S. aceitas. Vazio = todos
     recolhidos, que é como a seção nasce quando há mais de um CNPJ. */
  const [gruposAbertos, setGruposAbertos] = useState({});
  const alternarGrupo = useCallback(
    (k) => setGruposAbertos((g) => ({ ...g, [k]: !g[k] })),
    [],
  );
  /* Quais seções estão abertas. Guardado no aparelho porque a preferência é de
     quem trabalha, não da sessão: recolher o consumo e reabri-lo a cada visita
     seria pior que não recolher. Chave por seção, para acrescentar uma nova sem
     mexer no que já estava salvo. */
  const [abertas, setAbertas] = useState(() => {
    const padrao = { credito: true, consumo: true, aceitas: true, clientes: true, escolher: true, historico: false };
    try {
      return { ...padrao, ...JSON.parse(localStorage.getItem("permutas_secoes") || "{}") };
    } catch {
      return padrao;
    }
  });
  const alternar = useCallback((id) => {
    setAbertas((a) => {
      const novo = { ...a, [id]: !a[id] };
      try { localStorage.setItem("permutas_secoes", JSON.stringify(novo)); } catch { /* aba anônima */ }
      return novo;
    });
  }, []);
  const arquivoRef = useRef(null);

  /* ATÉ ONDE O PAINEL TEM O.S. GUARDADA. Sem isto a tela não consegue
     distinguir "esse cliente não comprou nesse período" de "o painel ainda não
     foi buscar esse período no ERP" -- as duas dão lista vazia, e concluir a
     primeira quando é a segunda faz a direção achar que um cliente antigo
     nunca comprou nada. */
  const [cobertura, setCobertura] = useState(null);

  useEffect(() => {
    let vivo = true;
    lerPermutas()
      .then((m) => vivo && setMapa(m))
      .catch((e) => vivo && setErro(e.message));
    lerCobertura()
      .then((c) => vivo && setCobertura(c))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  const permuta = aberta ? mapa?.[aberta] : null;

  /* DE QUANDO PROCURAR: campo DA PERMUTA, não da tela.
     Cada troca tem o seu período -- a permuta do rádio começou em 2021, a da
     gráfica no mês passado, e uma data só servia mal às duas. Vazio quer dizer
     "tudo o que o painel tem". A mais antiga entre todas as permutas é também
     a que manda na carga do histórico (ver `permutas_historico_desde`), então
     escolher aqui é escolher em um lugar só. */
  const desde = String(permuta?.desde || "").slice(0, 10);

  /* As chaves como TEXTO, e não como array, para o efeito abaixo não disparar
     a cada render: um array novo com o mesmo conteúdo é sempre "diferente" nas
     dependências, e isso viraria uma busca no servidor por letra digitada. */
  const chavesTexto = (permuta?.clientes || []).map((c) => c.chave).sort().join("|");
  const chavesDaPermuta = useMemo(
    () => (chavesTexto ? chavesTexto.split("|") : []),
    [chavesTexto],
  );

  /* Os ids das O.S. já aceitas, também como texto pelo mesmo motivo. Na lista
     é o que permite conferir TODOS os saldos contra o ERP em vez de mostrar a
     soma congelada, justo na tela em que a direção bate o olho. */
  const idsTexto = Object.values(mapa || {})
    .flatMap((p) => Object.keys(p?.os || {}))
    .sort()
    .join("|");

  useEffect(() => {
    let vivo = true;
    setBuscandoOS(true);
    const pedido = aberta
      ? (chavesDaPermuta.length ? buscarOrdensDe(chavesDaPermuta, desde) : Promise.resolve([]))
      : buscarOrdensPorId(idsTexto ? [...new Set(idsTexto.split("|"))] : []);
    pedido
      .then((os) => vivo && setOrdens(os))
      .catch((e) => vivo && setAviso({ tom: "erro", texto: e.message }))
      .finally(() => vivo && setBuscandoOS(false));
    return () => {
      vivo = false;
    };
  }, [aberta, chavesDaPermuta, desde, idsTexto]);

  // Busca de cliente no servidor, com folga para a pessoa terminar de digitar.
  useEffect(() => {
    const t = buscaCliente.trim();
    if (t.length < 2) {
      setAchados([]);
      return undefined;
    }
    let vivo = true;
    const id = setTimeout(() => {
      buscarClientes(t, desde)
        .then((cs) => vivo && setAchados(cs))
        .catch(() => vivo && setAchados([]));
    }, 280);
    return () => {
      vivo = false;
      clearTimeout(id);
    };
  }, [buscaCliente, desde]);

  const donos = useMemo(() => donoPorOS(mapa || {}), [mapa]);
  const lista = useMemo(() => resumoGeral(mapa || {}, ordens), [mapa, ordens]);
  const totais = useMemo(() => totaisDasPermutas(lista), [lista]);
  const resumo = useMemo(
    () => (permuta ? resumoDaPermuta(permuta, ordens) : null),
    [permuta, ordens],
  );
  /* O extrato só é montado quando há permuta aberta -- ele existe para o papel,
     e o papel só sai de dentro de uma. */
  const extrato = useMemo(
    () => (permuta ? extratoDaPermuta(permuta, ordens) : null),
    [permuta, ordens],
  );
  /* As O.S. aceitas agrupadas por CNPJ. Só vira painel quando há mais de um --
     com um cliente só, agrupar não separa nada e o grupo seria uma linha extra
     entre a pessoa e a lista. */
  const gruposAceitas = useMemo(
    () => (permuta ? linhasPorCliente(resumo?.linhas || [], permuta.clientes || []) : []),
    [permuta, resumo],
  );

  /* O MAPA MAIS NOVO, FORA DO CICLO DE DESENHO.
     `mapa` só chega às funções pelo fechamento do render, e entre um clique e
     o seguinte ele ainda é o antigo — a resposta do primeiro não voltou. Quem
     precisa montar uma lista a partir do que já está gravado lê DAQUI. */
  const mapaRef = useRef(null);
  /* Cinco caminhos diferentes chamam setMapa (carga inicial, gravação, anexo,
     edição do nome). O ref tem de acompanhar TODOS, senão quem lê dele pode
     montar a lista a partir de um estado que já não vale. O `mexer` ainda
     atribui direto, antes do setMapa, porque o próximo da fila não pode
     esperar o próximo desenho. */
  useEffect(() => { mapaRef.current = mapa; }, [mapa]);

  /* Toda gravação usa o pacote que o SERVIDOR devolveu, nunca o objeto montado
     aqui: se outra aba mexeu na permuta ao lado, o retorno já traz as duas.

     E as gravações vão em FILA, uma de cada vez. Sem isso, dois cliques
     seguidos partiam os dois do mesmo retrato: o Leonardo marcou duas pessoas
     em 19/08/2026 e só ficou uma, porque a segunda gravou o array de clientes
     por cima do da primeira (o servidor funde raso, `v_reg || p_campos`).
     A fila garante que a segunda só monta a lista dela depois de a primeira
     já estar gravada e refletida no mapaRef. */
  const filaRef = useRef(Promise.resolve());
  const mexer = useCallback((id, o) => {
    const proxima = filaRef.current.then(async () => {
      setAviso(null);
      setSalvando(true);
      try {
        const novo = typeof o === "function" ? await mexerNaPermuta(id, o(mapaRef.current?.[id]))
                                             : await mexerNaPermuta(id, o);
        mapaRef.current = novo;   // antes do setMapa: o próximo da fila já lê o novo
        setMapa(novo);
        // Devolve o REGISTRO gravado, não um "true". Quem chamou precisa poder
        // conferir se o que pediu está lá — "não deu erro" nunca foi prova de
        // que gravou, e é exatamente por confiar nisso que a marcação sumia
        // sem ninguém ver.
        return novo?.[id] ?? null;
      } catch (e) {
        setAviso({ tom: "erro", texto: e.message });
        return null;
      } finally {
        setSalvando(false);
      }
    });
    // A fila não pode morrer numa falha: o `catch` acima já devolve false, mas
    // uma rejeição inesperada travaria todas as gravações seguintes.
    filaRef.current = proxima.then(() => {}, () => {});
    return proxima;
  }, []);

  const criar = useCallback(async () => {
    const id = novoId("permuta");
    if (await mexer(id, { campos: { nome: "Nova permuta", credito: 0, clientes: [] }, criar: true })) {
      setAberta(id);
    }
  }, [mexer]);

  const apagar = useCallback(async (id, nome) => {
    if (!window.confirm(`Apagar a permuta "${nome || "sem nome"}"? O histórico, os lançamentos e os anexos vão junto.`)) return;
    setAviso(null);
    try {
      await removerPermuta(id);
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
      /* A O.S. só pode ir como OBJETO. O banco percorre o patch chave a chave e
         só aplica o que for objeto ou nulo — qualquer outra coisa ele PULA em
         silêncio, e o clique não faz nada sem dizer por quê. */
      if (ligar && (!ficha || typeof ficha !== "object")) {
        setAviso({ tom: "erro", texto: `Não consegui montar a ficha da O.S. ${o.numero || o.id}. Recarregue a página e tente de novo.` });
        return;
      }
      const gravado = await mexer(aberta, { osPatch: { [o.id]: ficha } });
      // Mesma régua do cliente: confere o efeito, não a ausência de erro.
      if (gravado) {
        const tem = !!(gravado.os || {})[o.id];
        if (ligar !== tem) {
          setAviso({
            tom: "erro",
            texto: ligar
              ? `Não consegui aceitar a O.S. ${o.numero || o.id}. Tente de novo e, se repetir, me avise.`
              : `Não consegui tirar a O.S. ${o.numero || o.id}. Tente de novo e, se repetir, me avise.`,
          });
        }
      }
    },
    [aberta, ordens, mexer],
  );

  /* A lista sai do registro MAIS NOVO (o retorno do servidor guardado em
     mapaRef), nunca do `permuta` do render. Era daí que vinha o defeito: dois
     cliques rápidos partiam do mesmo retrato vazio e o segundo gravava por
     cima do primeiro.

     A busca NÃO fecha a cada clique, de propósito: marcar várias pessoas
     seguidas é o caso de uso ("marquei duas pessoas"), e fechar obrigaria a
     buscar de novo para cada uma. Quem já foi marcado some da lista sozinho
     (clientesAchados filtra por quem já está na permuta), então a lista vai
     encurtando conforme se clica. */
  const ligarCliente = useCallback(
    async (c) => {
      if (!aberta) return;
      const gravado = await mexer(aberta, (atual) => {
        const atuais = atual?.clientes || [];
        // Conferido contra a lista nova: com a velha, clicar duas vezes na
        // mesma pessoa passava pela checagem e duplicava.
        if (atuais.some((x) => x.chave === c.chave)) return { campos: {} };
        return { campos: { clientes: [...atuais, { chave: c.chave, nome: c.nome, cnpjs: c.cnpjs || [] }] } };
      });
      /* CONFERE O EFEITO, não a ausência de erro.
         Era daqui que vinha o pior do defeito: a marcação sumia e a tela não
         dizia nada, porque "não deu erro" era tratado como "gravou". Se o nome
         não estiver no registro que o servidor devolveu, a pessoa fica sabendo
         na hora — em vez de descobrir semanas depois que o saldo está errado. */
      if (!gravado) return; // o erro da rede já foi mostrado pelo mexer
      const entrou = (gravado.clientes || []).some((x) => x.chave === c.chave);
      setAviso(entrou
        ? { tom: "ok", texto: `${c.nome} marcado(a). Agora são ${(gravado.clientes || []).length} nesta permuta.` }
        : {
            tom: "erro",
            texto: `Não consegui marcar ${c.nome}. O servidor respondeu sem erro, mas o nome não ficou na permuta — tente de novo e, se repetir, me avise.`,
          });
    },
    [aberta, mexer],
  );

  /* Tirar o cliente NÃO tira as O.S. dele que já foram aceitas: o crédito foi
     gasto de verdade, e sumir com ele aqui faria o saldo subir sozinho. */
  const desligarCliente = useCallback(
    async (chave) => {
      if (!aberta) return;
      // Mesmo motivo do ligar: a lista sai do registro mais novo.
      await mexer(aberta, (atual) => ({
        campos: { clientes: (atual?.clientes || []).filter((x) => x.chave !== chave) },
      }));
    },
    [aberta, mexer],
  );

  const salvarLancamento = useCallback(async () => {
    if (!aberta || !formLanc) return;
    const valor = paraNumero(formLanc.valor);
    if (!valor) {
      setAviso({ tom: "erro", texto: "Informe um valor." });
      return;
    }
    const id = formLanc.id || novoId("lanc");
    const ok = await mexer(aberta, {
      lancPatch: {
        [id]: {
          data: formLanc.data || hojeISO(),
          descricao: String(formLanc.descricao || "").trim().slice(0, 200),
          valor,
          tipo: formLanc.tipo === "credito" ? "credito" : "consumo",
        },
      },
    });
    if (ok) setFormLanc(null);
  }, [aberta, formLanc, mexer]);

  /* ANEXAR A NOTA DE UMA ENTRADA.
     O `<input type=file>` é um só, escondido, e guarda em `alvoAnexo` a qual
     lançamento o próximo arquivo pertence. Um input por linha seria mais
     direto de ler, mas a permuta pode ter dezenas de entradas e cada input
     carrega o seu próprio estado -- e um deles com o valor antigo já anexa o
     arquivo errado na linha errada. Com um só, o alvo é explícito. */
  const alvoAnexo = useRef(null);
  const pedirArquivo = useCallback((lanc) => {
    alvoAnexo.current = lanc?.id || null;
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
        setMapa(await anexarNaPermuta(aberta, {
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
        const r = await lerAnexo(aberta, a.chave);
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
    () => ordensDosClientes(ordens, chavesDaPermuta, donos, aberta),
    [ordens, chavesDaPermuta, donos, aberta],
  );
  /* A O.S. JÁ ACEITA SAI DAQUI. Ela aparecia marcada, e ficar marcada não
     ajuda em nada: a lista de escolher existe para achar o que FALTA. Com 25
     aceitas numa carteira de 40, a pessoa percorre a lista inteira caçando as
     15 que ainda não entraram. Quem já entrou está logo acima, em "O.S. que
     entram nesta permuta", e sai de lá pelo botão de tirar. */
  const paraEscolherFiltradas = useMemo(() => {
    const livres = paraEscolher.filter((o) => !o.nesta);
    const t = buscaOS.trim().toLowerCase();
    if (!t) return livres;
    return livres.filter(
      (o) => o.numero.toLowerCase().includes(t) || o.cliente.toLowerCase().includes(t),
    );
  }, [paraEscolher, buscaOS]);
  const jaAceitasAqui = useMemo(() => paraEscolher.filter((o) => o.nesta).length, [paraEscolher]);

  const clientesAchados = useMemo(() => {
    const jaTem = new Set(chavesDaPermuta);
    return achados.filter((c) => !jaTem.has(c.chave));
  }, [achados, chavesDaPermuta]);

  if (erro) {
    return (
      <div className="space-y-6">
        <PageTitle titulo="Permutas" descricao="O que o parceiro nos deu e o que ele já gastou." />
        <Card className="flex items-start gap-2 text-sm text-bad-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {erro}
        </Card>
      </div>
    );
  }
  if (mapa === null) return <CarregandoModulo />;

  // ------------------------------------------------------------ uma permuta
  if (permuta && resumo) {
    const anexos = permuta.anexos || [];
    const eventos = [...(permuta.historico || [])].reverse();
    return (
      <div className="space-y-5">
        <button
          type="button"
          onClick={() => setAberta(null)}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft size={15} /> Todas as permutas
        </button>

        <Aviso aviso={aviso} aoFechar={() => setAviso(null)} />

        {/* Um input de arquivo para a tela inteira; `alvoAnexo` diz de qual
            lançamento é o próximo arquivo. */}
        <input ref={arquivoRef} type="file" className="hidden" onChange={(e) => anexar(e.target.files?.[0])} />

        <Card className="space-y-4">
          {/* SÓ NO PAPEL. Na tela o nome da permuta está no campo ao lado, que
              o `@media print` esconde por ser `input` -- sem isto o PDF saía
              sem dizer de quem é. */}
          <CabecalhoImpressao
            titulo={`Impresilk — Permuta: ${permuta.nome || "sem nome"}`}
            linhas={[
              (permuta.clientes || []).map((c) => c.nome).join(" · ") || "sem cliente ligado",
              `Emitido em ${dataLonga(hojeISO())}`,
              `Crédito ${dinheiro(resumo.credito)} · consumido ${dinheiro(resumo.consumido)} · saldo ${dinheiro(resumo.saldo)}`,
              resumo.saldo < 0 ? `SALDO DEVEDOR: o parceiro deve ${dinheiro(Math.abs(resumo.saldo))} à Impresilk.` : null,
            ]}
          />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <input
              className="input max-w-sm flex-1 text-lg font-medium"
              value={permuta.nome ?? ""}
              placeholder="De quem é esta permuta?"
              onChange={(e) => setMapa((m) => ({ ...m, [aberta]: { ...m[aberta], nome: e.target.value } }))}
              onBlur={(e) => mexer(aberta, { campos: { nome: e.target.value } })}
            />
            <div className="flex items-center gap-2">
              {/* O PDF é a TELA impressa, não um documento paralelo: o que o
                  parceiro recebe é exatamente o que a direção está vendo. Um
                  gerador separado vira uma segunda verdade que ninguém lembra
                  de atualizar junto. O `@media print` do index.css tira botões
                  e campos; o que sobra é a conta. */}
              <BotaoPDF titulo="Gera um PDF desta permuta para enviar ao parceiro" />
              <button
                type="button"
                className="btn-ghost"
                onClick={() => mexer(aberta, { campos: { encerrada: !permuta.encerrada } })}
                title={permuta.encerrada ? "Reabrir a permuta" : "Encerrar: sai do topo da lista, o histórico fica"}
              >
                <Archive size={15} /> {permuta.encerrada ? "Reabrir" : "Encerrar"}
              </button>
              <button
                type="button"
                className="rounded-lg p-2 text-slate-300 hover:bg-bad-50 hover:text-bad-600"
                onClick={() => apagar(aberta, permuta.nome)}
                title="Apagar a permuta"
                aria-label="Apagar a permuta"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <div className="mb-1 text-xs text-slate-500">Crédito do parceiro</div>
              <div className="text-xl font-semibold tabular-nums text-slate-800">{dinheiro(resumo.credito)}</div>
              <div className="text-xs text-slate-500">
                {resumo.creditos.length
                  ? `${resumo.creditos.length} ${resumo.creditos.length === 1 ? "lançamento" : "lançamentos"}`
                  : "nada lançado ainda"}
                {resumo.creditoAntigo > 0 && (
                  <> · {dinheiro(resumo.creditoAntigo)} lançado antes desta tela</>
                )}
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">Já usou</div>
              <div className="text-xl font-semibold tabular-nums text-slate-800">{dinheiro(resumo.consumido)}</div>
              <div className="text-xs text-slate-500">
                {resumo.linhas.length} O.S.
                {resumo.lancado !== 0 && <> · {dinheiro(resumo.lancado)} manual</>}
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">Saldo</div>
              <Saldo valor={resumo.saldo} grande />
            </div>
          </div>
          <Barra pct={resumo.pct} />

          {(resumo.mudaram > 0 || resumo.sumiram > 0 || resumo.semConferir) && (
            <div className="rounded-lg bg-warn-50 px-3 py-2 text-xs text-warn-800">
              {resumo.semConferir && "As O.S. não carregaram nesta sessão: o saldo está usando o valor congelado no aceite. "}
              {resumo.mudaram > 0 && `${resumo.mudaram} O.S. mudaram de valor no ERP depois do aceite (o saldo já usa o valor novo). `}
              {resumo.sumiram > 0 && `${resumo.sumiram} O.S. sumiram do ERP (cancelamento) e continuam abatendo — confira se o crédito deve voltar.`}
            </div>
          )}
        </Card>

        <Secao
          semImpressao
          id="historico"
          titulo="Histórico da operação"
          sub="Escrito pelo servidor a cada mudança — é o que sustenta a conversa com o parceiro."
          aberta={abertas.historico}
          aoAlternar={alternar}
        >
          <Historico eventos={eventos} />
        </Secao>

        {/* ------------------------------------------------- de quem é */}
        <Secao
          id="clientes"
          titulo="Clientes desta permuta"
          sub="Uma permuta pode abranger mais de um CNPJ do mesmo dono — some todos aqui."
          aberta={abertas.clientes}
          aoAlternar={alternar}
        >
          <div className="flex flex-wrap gap-2">
            {(permuta.clientes || []).map((c) => (
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
                  aria-label={`Tirar ${c.nome} desta permuta`}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            {!(permuta.clientes || []).length && (
              <span className="text-sm text-slate-400">Nenhum ainda — procure abaixo.</span>
            )}
          </div>

          <div className="relative max-w-md">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Procurar cliente pelo nome…"
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
                       clique seria IGNORADO em vez de enfileirado, e a pessoa
                       perderia a marcação de novo — por outro caminho. Quem
                       garante que as duas ficam é a fila do `mexer`. */
                    onClick={() => ligarCliente(c)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-slate-800">{c.nome}</span>
                      {(c.cnpjs || []).length > 0 && (
                        <span className="text-[11px] text-slate-400">{c.cnpjs.map(formatarDoc).join(" · ")}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-[11px] text-slate-400">
                      {c.qtd} O.S. · {dinheiro(c.total)}
                    </span>
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

        {/* ------------------------------------------------- as aceitas */}
        <Secao
          semImpressao
          id="aceitas"
          titulo="O.S. que entram nesta permuta"
          sub="É o que abate o crédito."
          aberta={abertas.aceitas}
          aoAlternar={alternar}
        >
          {!resumo.linhas.length ? (
            <Empty>Nenhuma O.S. aceita ainda. Marque abaixo as que fazem parte da troca.</Empty>
          ) : gruposAceitas.length > 1 ? (
            <div>
              {gruposAceitas.map((g) => (
                <GrupoCliente
                  key={g.chave}
                  g={g}
                  aberto={!!gruposAbertos[g.chave]}
                  aoAlternar={alternarGrupo}
                  aoTirar={(x) => marcarOS(x, false)}
                />
              ))}
            </div>
          ) : (
            <div>
              {resumo.linhas.map((l) => (
                <LinhaAceita key={l.id} l={l} aoTirar={(x) => marcarOS(x, false)} />
              ))}
            </div>
          )}
        </Secao>

        {/* -------------------------------- o que o parceiro nos deu */}
        <Secao
          semImpressao
          id="credito"
          titulo="O que o parceiro nos deu"
          sub="Cada coisa que virou crédito, com a data, o que foi e a nota. A soma é o crédito dele."
          aberta={abertas.credito}
          aoAlternar={alternar}
          acao={
            formLanc?.tipo !== "credito" && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => { if (!abertas.credito) alternar("credito"); setFormLanc({ ...LANC_VAZIO, tipo: "credito", data: hojeISO() }); }}
              >
                <Plus size={15} strokeWidth={2.4} /> Lançar crédito
              </button>
            )
          }
        >
          {formLanc?.tipo === "credito" && (
            <FormLancamento
              form={formLanc}
              setForm={setFormLanc}
              aoSalvar={salvarLancamento}
              aoCancelar={() => setFormLanc(null)}
              salvando={salvando}
            />
          )}
          {resumo.creditos.length ? (
            <div>
              {resumo.creditos.map((l) => (
                <LinhaLancamento
                  key={l.id}
                  l={l}
                  aoTirar={(x) => mexer(aberta, { lancPatch: { [x.id]: null } })}
                  aoAnexar={pedirArquivo}
                  aoBaixar={baixar}
                />
              ))}
            </div>
          ) : (
            formLanc?.tipo !== "credito" && (
              <Empty>Nada lançado ainda — sem isto o saldo fica negativo, porque só há consumo.</Empty>
            )
          )}
          {resumo.creditoAntigo > 0 && (
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Há {dinheiro(resumo.creditoAntigo)} de crédito lançado antes desta tela existir, sem data nem
              documento. Ele conta no saldo. Para documentá-lo, lance como entrada acima e me avise para eu
              zerar o valor antigo — senão passa a contar duas vezes.
            </div>
          )}
        </Secao>

        {/* -------------------------------- o que ele gastou fora de O.S. */}
        <Secao
          semImpressao
          id="consumo"
          titulo="Consumo sem O.S."
          sub="O que abateu o crédito sem passar por ordem de serviço — um brinde entregue, um acerto."
          aberta={abertas.consumo}
          aoAlternar={alternar}
          acao={
            formLanc?.tipo !== "consumo" && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => { if (!abertas.consumo) alternar("consumo"); setFormLanc({ ...LANC_VAZIO, tipo: "consumo", data: hojeISO() }); }}
              >
                <Plus size={15} strokeWidth={2.4} /> Lançar consumo
              </button>
            )
          }
        >
          {formLanc?.tipo === "consumo" && (
            <FormLancamento
              form={formLanc}
              setForm={setFormLanc}
              aoSalvar={salvarLancamento}
              aoCancelar={() => setFormLanc(null)}
              salvando={salvando}
            />
          )}
          {resumo.consumos.length ? (
            <div>
              {resumo.consumos.map((l) => (
                <LinhaLancamento
                  key={l.id}
                  l={l}
                  aoTirar={(x) => mexer(aberta, { lancPatch: { [x.id]: null } })}
                  aoAnexar={pedirArquivo}
                  aoBaixar={baixar}
                />
              ))}
            </div>
          ) : (
            formLanc?.tipo !== "consumo" && <Empty>Nenhum consumo fora de O.S.</Empty>
          )}
        </Secao>

        {/* ------------------------------------------------- escolher */}
        <Secao
          id="escolher"
          titulo="Escolher O.S."
          sub="O que ainda NÃO entrou, dos clientes acima. Marque as que fazem parte da permuta — o mesmo cliente também compra pagando."
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
            <span className="text-slate-600">Procurar O.S. desta permuta a partir de</span>
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

          {/* O QUE O PAINEL REALMENTE TEM. Uma permuta pode pedir 2018 e o
              painel ter guardado só de 2025 -- e aí a lista vem vazia pelo
              motivo errado. Dizer isso é a diferença entre "esse cliente não
              comprou" e "eu ainda não fui buscar". */}
          {cobertura?.desde && desde && desde < String(cobertura.desde) && (
            <div className="rounded-lg bg-warn-50 px-3 py-2 text-xs text-warn-800">
              Você pediu a partir de {dataLonga(desde)}, mas o painel só tem O.S. guardada desde{" "}
              {dataLonga(cobertura.desde)}. O que estiver antes disso não aparece aqui até a carga do
              histórico rodar (domingo de madrugada, ou pelo botão “Run workflow” no GitHub).
            </div>
          )}
          {!chavesDaPermuta.length ? (
            <Empty>Ligue um cliente acima para ver as O.S. dele.</Empty>
          ) : buscandoOS ? (
            <Empty>Procurando as O.S. desde {dataLonga(desde)}…</Empty>
          ) : paraEscolherFiltradas.length ? (
            <div>
              {paraEscolherFiltradas.map((o) => (
                <LinhaEscolher key={o.id} o={o} aoMarcar={marcarOS} />
              ))}
            </div>
          ) : (
            <Empty>
              {buscaOS.trim()
                ? "Nenhuma O.S. com esse número ou nome."
                : jaAceitasAqui > 0
                  ? `Todas as ${jaAceitasAqui} O.S. desses clientes já entraram na permuta.`
                  : `Esses clientes não têm O.S. a partir de ${dataLonga(desde)}.`}
            </Empty>
          )}
        </Secao>

        {/* O EXTRATO fica por ÚLTIMO no DOM mas é a única coisa que vai ao
            papel: as seções acima são `sem-impressao`. Assim a tela continua
            organizada por tarefa e a folha, por conta. */}
        {extrato && <ExtratoImpresso e={extrato} permuta={permuta} />}

        {salvando && <div className="text-xs text-slate-400">salvando…</div>}
      </div>
    );
  }

  // ------------------------------------------------------------- a lista
  return (
    <div className="space-y-5">
      <PageTitle
        titulo="Permutas"
        descricao="O que cada parceiro nos deu, o que ele já gastou em O.S. e quanto ainda sobra."
        acao={
          <button type="button" className="btn-ghost" onClick={criar} disabled={salvando}>
            <Plus size={15} strokeWidth={2.4} /> Nova permuta
          </button>
        }
      />

      <Aviso aviso={aviso} aoFechar={() => setAviso(null)} />

      {/* OS TRÊS NÚMEROS DO TOPO.
          NÃO existe um "saldo total" aqui, e é decisão. Somar os saldos das
          cinco permutas da base dá −R$ 81 mil, misturando "R$ 2.238 ainda para
          gastar na Maple Bear" com "R$ 56 mil consumidos além na Vila 61" — o
          resultado não é crédito disponível nem dívida, e não responde
          pergunta nenhuma. Os dois lados aparecem separados. */}
      {lista.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="p-4">
            <div className="text-xs text-slate-500">Total permutado</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-800">{dinheiro(totais.permutado)}</div>
            <div className="mt-0.5 text-xs text-slate-500">
              o que os parceiros deram · {totais.quantas} {totais.quantas === 1 ? "permuta" : "permutas"}
              {totais.encerradas > 0 && ` (${totais.encerradas} encerrada${totais.encerradas > 1 ? "s" : ""} fora da conta)`}
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-xs text-slate-500">Crédito para usar</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-ok-700">{dinheiro(totais.aUsar)}</div>
            <div className="mt-0.5 text-xs text-slate-500">
              somando só quem ainda tem saldo · já consumido {dinheiro(totais.consumido)}
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-xs text-slate-500">Os parceiros estão nos devendo</div>
            <div className={`mt-1 text-2xl font-semibold tabular-nums ${totais.aReceber > 0 ? "text-bad-700" : "text-slate-800"}`}>
              {dinheiro(totais.aReceber)}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              {totais.semCredito > 0 ? (
                /* Sem este aviso o número acima parece prejuízo, e na base real
                   ele é cadastro faltando: duas permutas com crédito zero e
                   dezenas de milhares em O.S. */
                <span className="text-warn-700">
                  {totais.semCredito} {totais.semCredito === 1 ? "permuta está" : "permutas estão"} sem crédito lançado —
                  confira antes de cobrar
                </span>
              ) : "entregamos mais do que recebemos — é a receber"}
            </div>
          </Card>
        </div>
      )}

      {lista.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {lista.map((p) => (
            <CartaoPermuta key={p.id} p={p} aoAbrir={setAberta} />
          ))}
        </div>
      ) : (
        <Card className="py-10 text-center">
          <Handshake size={28} className="mx-auto mb-3 text-slate-300" />
          <div className="text-sm text-slate-500">
            Nenhuma permuta ainda. Crie uma, ligue o cliente e marque as O.S. que entram na troca.
          </div>
        </Card>
      )}
    </div>
  );
}
