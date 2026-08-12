// Orçamentos — a mesa de fechamento.
//
// A tela responde UMA pergunta: para quem eu ligo agora, e o que eu prometi a
// ele. Tudo o que não muda o que a pessoa faz nos próximos dez minutos ficou
// atrás de um acordeão (o Placar) ou de uma aba (Arquivo).
//
// A tela velha era um relatório com uma fila dentro: três cartões de placar,
// dois seletores de período, uma tabela de nove colunas e outra de seis — e a
// fila de trabalho só aparecia depois de ~600px de rolagem no celular, que é
// onde o CEO abre isto. Pior: o seletor de mês do relatório mandava também na
// fila, então escolher "junho" para ver um número esvaziava a fila do dia com a
// mensagem "tudo já foi tratado", que era mentira.
//
// Três abas: Hoje (o trabalho), Agenda (o que foi prometido) e Arquivo (achar
// um orçamento). O Placar do mês é o mesmo em todas, fechado por padrão.
//
// A prova de que a tela velha não era usada está no banco: a coleção de
// marcações do painel tinha UM registro em oito meses. Por isso aqui o primeiro
// gesto tem de valer sozinho — o botão É a gravação, e o desfazer fica 8s na
// tela em vez de um diálogo de confirmação antes.

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  MessageCircle,
  Mail,
  CalendarClock,
  Search,
  X,
  ChevronDown,
  Check,
  Undo2,
} from "lucide-react";
import { useApp } from "../config/store.jsx";
import { getSessao, vendedorDaSessao } from "../lib/sessao.js";
import { calcOrcamentos, BALDES, canonVend, somaDias } from "../lib/calc/orcamentos.js";
import { salvarCompromisso, removerCompromisso } from "../services/compromissos.js";
import { moeda, numero, pct, dataCurta, dataLonga, diasEntre, ymdLocal } from "../lib/format.js";
import {
  Card,
  PageTitle,
  SectionTitle,
  BarRow,
  Segmented,
  Empty,
  CarregandoModulo,
  ErroModulo,
  BotaoPDF,
  CabecalhoImpressao,
  AvisoDadoParado,
} from "../components/ui.jsx";

const MESES_LONGOS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const TOM_BALDE = {
  bad: "text-bad-700",
  warn: "text-warn-700",
  neutral: "text-slate-600",
};

const ROTULO_SITUACAO = { aberto: "Aberto", ganho: "Ganho", perdido: "Perdido" };
const CHIP_SITUACAO = { aberto: "chip-warn", ganho: "chip-ok", perdido: "chip-bad" };

// Busca sem acento.
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const primeiroNome = (n) => String(n || "").trim().split(/\s+/)[0] || "";

function linkWhats(g) {
  if (!g.celular) return null;
  const ola = primeiroNome(g.contatoNome) ? `Olá, ${primeiroNome(g.contatoNome)}! ` : "Olá! ";
  const ref =
    g.qtd === 1
      ? `sobre o orçamento ${g.itens[0]?.numero || ""}`.trim()
      : "sobre os orçamentos que enviamos";
  const texto = `${ola}Aqui é da Impresilk, ${ref}. Posso te ajudar a seguir com ele?`;
  return `https://wa.me/${g.celular}?text=${encodeURIComponent(texto)}`;
}

// A linha de tempo do cartão: um fato, nunca uma opinião.
function textoRelogio(g) {
  if (g.balde === "prometido-atrasado" || g.balde === "prometido-hoje") {
    return `prometido para ${dataCurta(g.proximoToque)}`;
  }
  if (g.balde === "chamado-sem-passo") {
    return `chamado ${dataCurta(g.chamadoEm)}, sem retorno marcado`;
  }
  if (g.balde === "vencido" && g.diasParaVencer != null) {
    return `venceu há ${Math.abs(g.diasParaVencer)} d`;
  }
  return g.diasUltimoEnvio <= 0 ? "enviado hoje" : `enviado há ${g.diasUltimoEnvio} d`;
}

// ---------------------------------------------------------------- componentes
// Todos no escopo do módulo: componente declarado dentro de outro vira tipo
// novo a cada render e o campo de nota perde o foco a cada letra digitada.

function Honestidade({ x, c, minimo, corte }) {
  const linhas = [
    x.abaixoDoMinimo > 0 && `${numero(x.abaixoDoMinimo)} abaixo de ${moeda(minimo)} (valor mínimo em Configurações)`,
    x.antesDoCorte > 0 && `${numero(x.antesDoCorte)} enviados antes de ${dataLonga(corte)}`,
    x.semData > 0 && `${numero(x.semData)} sem data de cadastro no ERP`,
    c.abertosSemValidade > 0 && `${numero(c.abertosSemValidade)} abertos sem validade preenchida — esses nunca aparecem como vencidos`,
    c.perdidosSemMotivo > 0 && `${numero(c.perdidosSemMotivo)} perdidos sem texto de motivo`,
    c.filaSemMargem > 0 && `${numero(c.filaSemMargem)} na fila com margem zerada no ERP`,
    c.ganhosSemFechamento > 0 && `${numero(c.ganhosSemFechamento)} marcados como ganhos sem data de aprovação`,
  ].filter(Boolean);
  if (!linhas.length) return null;
  return (
    <details className="sem-impressao mb-3 text-xs text-slate-500">
      <summary className="cursor-pointer">O que não está nesta tela</summary>
      <ul className="mt-1 space-y-0.5 pl-4">
        {linhas.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </details>
  );
}

function GrupoBalde({ balde, qtd, margem, restantes, aoVerTudo, children }) {
  return (
    <section className="mt-5 first:mt-0">
      <h3 className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className={`font-display text-sm font-semibold ${TOM_BALDE[balde.tom]}`}>
          {balde.nome}
        </span>
        <span className="tnum text-xs font-normal text-slate-500">
          {numero(qtd)} {qtd === 1 ? "cliente" : "clientes"}
          {margem > 0 ? ` · ${moeda(margem)} de margem` : ""}
        </span>
      </h3>
      <div className="rounded-xl border" style={{ borderColor: "var(--hairline)" }}>
        {children}
      </div>
      {restantes > 0 && (
        <button className="btn-ghost sem-impressao mt-1" onClick={aoVerTudo}>
          ver os {numero(restantes)} restantes
        </button>
      )}
    </section>
  );
}

/* Os botões de data SÃO a gravação -- não existe "escolher e depois salvar".
   Confirmar antes de gravar em toda ação transforma dois toques em quatro; o
   desfazer de 8s cobre o engano com um toque só, e cobre também o engano que a
   confirmação não pega (a pessoa confirma no automático). */
function BotoesData({ chave, aoEscolher, salvando, hoje }) {
  const [nota, setNota] = useState("");
  const [outra, setOutra] = useState("");
  const escolher = (dias) => aoEscolher(somaDias(hoje, dias), nota);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {[
          { d: 1, r: "Amanhã" },
          { d: 3, r: "Em 3 dias" },
          { d: 7, r: "Em 7 dias" },
          { d: 15, r: "Em 15 dias" },
        ].map((b) => (
          <button
            key={b.d}
            className="btn-outline min-h-[40px]"
            disabled={salvando}
            onClick={() => escolher(b.d)}
          >
            {b.r}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="label" htmlFor={`d-${chave}`}>
            Outra data
          </label>
          <input
            id={`d-${chave}`}
            type="date"
            className="input w-auto"
            value={outra}
            min={hoje}
            onChange={(e) => setOutra(e.target.value)}
          />
        </div>
        <button
          className="btn-primary min-h-[40px]"
          disabled={!outra || salvando}
          onClick={() => aoEscolher(outra, nota)}
        >
          Marcar
        </button>
      </div>
      <input
        key={`n-${chave}`}
        className="input"
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        placeholder="Nota (opcional): o que ele pediu, o que falta"
        aria-label="Nota do retorno"
      />
    </div>
  );
}

function LinhaOrcamento({ o, escolhido, aoEscolher, mostrarCaixa, aoCompraFutura, aoDesfazer }) {
  return (
    <div className="border-t py-2 text-sm first:border-0" style={{ borderColor: "var(--hairline)" }}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        {mostrarCaixa && (
          <input
            type="checkbox"
            className="h-4 w-4 shrink-0 rounded border-slate-300 text-brand focus:ring-brand-200"
            checked={escolhido}
            onChange={aoEscolher}
            aria-label={`Incluir o orçamento ${o.numero}`}
          />
        )}
        <span className="tnum font-medium text-slate-900">nº {o.numero}</span>
        <span className="min-w-0 flex-1 truncate text-slate-600">
          {o.trabalho || "sem descrição no ERP"}
        </span>
        <span className="tnum font-medium text-slate-900">{moeda(o.valor)}</span>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">
        {[
          o.margem > 0 ? `margem ${moeda(o.margem)}` : "sem margem no ERP",
          o.dias <= 0 ? "enviado hoje" : `enviado há ${o.dias} d`,
          o.temValidade
            ? o.diasParaVencer < 0
              ? `vale ${o.validade} dias, venceu há ${Math.abs(o.diasParaVencer)}`
              : `vale ${o.validade} dias, faltam ${o.diasParaVencer}`
            : "sem validade no ERP",
          o.mexidoNoErpEm ? `o ERP mexeu nele em ${dataCurta(o.mexidoNoErpEm)}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {o.situacao === "perdido" && (
        <p className="mt-0.5 text-xs text-bad-700">
          perdido: {o.motivoPerdaNome || "sem motivo"}
          <span className="text-slate-400">
            {" "}
            ({o.motivoManual ? "você classificou" : "veio do ERP"})
          </span>
          {!o.recall && (
            <button className="btn-ghost sem-impressao ml-2 !px-2 !py-0.5 text-xs" onClick={aoCompraFutura}>
              Isto é compra futura
            </button>
          )}
        </p>
      )}
      {o.baixaManual && (
        <p className="mt-0.5 text-xs text-slate-500">
          marcado como {ROTULO_SITUACAO[o.situacao].toLowerCase()}
          {o.dataBaixa ? ` em ${dataCurta(o.dataBaixa)}` : ""} · o ERP marca{" "}
          {(ROTULO_SITUACAO[o.situacaoErp] || o.situacaoErp).toLowerCase()}
          <button className="btn-ghost sem-impressao ml-2 !px-2 !py-0.5 text-xs" onClick={aoDesfazer}>
            Desfazer baixa
          </button>
        </p>
      )}
    </div>
  );
}

function GavetaNegocio({ g, motivos, hoje, salvando, acoes }) {
  const [escolhidos, setEscolhidos] = useState(() => g.ids);
  const [perdendo, setPerdendo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const varios = g.qtd > 1;
  const alvos = varios ? escolhidos : g.ids;

  return (
    <div className="mt-3 space-y-4 rounded-xl bg-slate-50 p-3">
      {g.proximoToque && (
        <div>
          <p className="text-sm text-slate-700">
            Retorno marcado para <b>{dataLonga(g.proximoToque)}</b>
            {g.nota ? ` — “${g.nota}”` : ""}
          </p>
          <div className="sem-impressao mt-2 flex flex-wrap gap-2">
            <button className="btn-outline" disabled={salvando} onClick={() => acoes.antecipar(g)}>
              Antecipar para hoje
            </button>
            <button className="btn-ghost" disabled={salvando} onClick={() => acoes.cancelar(g)}>
              Cancelar retorno
            </button>
          </div>
        </div>
      )}

      <div className="sem-impressao">
        <p className="label mb-1">{g.proximoToque ? "Mudar a data" : "Quando você volta a falar?"}</p>
        <BotoesData
          chave={g.chave}
          hoje={hoje}
          salvando={salvando}
          aoEscolher={(data, nota) => acoes.agendar(g, data, nota)}
        />
      </div>

      {(g.contatoNome || g.celular || g.email) && (
        <p className="text-xs text-slate-500">
          {[g.contatoNome, g.celular, g.email].filter(Boolean).join(" · ")}
        </p>
      )}

      <div>
        <p className="label mb-1">
          {g.qtd === 1 ? "O orçamento" : `Os ${numero(g.qtd)} orçamentos`}
        </p>
        {g.itens.map((o) => (
          <LinhaOrcamento
            key={o.id}
            o={o}
            mostrarCaixa={varios && perdendo}
            escolhido={escolhidos.includes(o.id)}
            aoEscolher={() =>
              setEscolhidos((prev) =>
                prev.includes(o.id) ? prev.filter((x) => x !== o.id) : [...prev, o.id]
              )
            }
            aoCompraFutura={() => acoes.compraFutura(g, o)}
            aoDesfazer={() => acoes.desfazerBaixa(g, o)}
          />
        ))}
      </div>

      <div className="sem-impressao">
        {!perdendo ? (
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-outline min-h-[44px]"
              disabled={salvando}
              onClick={() => (varios ? setPerdendo("ganho") : acoes.baixa(g, g.ids, "ganho", ""))}
            >
              <Check size={15} strokeWidth={2.4} /> Ganhamos
            </button>
            <button
              className="btn-outline min-h-[44px]"
              disabled={salvando}
              onClick={() => setPerdendo("perdido")}
            >
              <X size={15} strokeWidth={2.4} /> Perdemos
            </button>
          </div>
        ) : (
          <div className="space-y-2 rounded-xl bg-white p-3">
            <p className="text-sm text-slate-700">
              {varios
                ? `Quais destes ${numero(g.qtd)} orçamentos? Desmarque o que continua na mesa.`
                : perdendo === "ganho"
                  ? "Marcar como ganho?"
                  : "Marcar como perdido?"}
            </p>
            {perdendo === "perdido" && (
              <div className="flex flex-wrap gap-1.5">
                {motivos.map((m) => (
                  <button
                    key={m.id}
                    className={motivo === m.id ? "chip-sel" : "chip-btn"}
                    onClick={() => setMotivo((v) => (v === m.id ? "" : m.id))}
                  >
                    {m.nome}
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                className={perdendo === "ganho" ? "btn-primary" : "btn-danger"}
                disabled={salvando || alvos.length === 0}
                onClick={() => {
                  acoes.baixa(g, alvos, perdendo, motivo);
                  setPerdendo(false);
                }}
              >
                {alvos.length > 1 ? `Confirmar (${alvos.length})` : "Confirmar"}
              </button>
              <button className="btn-ghost" onClick={() => setPerdendo(false)}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CartaoNegocio({ g, aberto, saindo, mostrarVendedor, motivos, hoje, salvando, acoes }) {
  const wa = linkWhats(g);
  return (
    <div
      className={`border-t px-4 py-3.5 first:border-0 ${saindo ? "opacity-50" : ""}`}
      style={{ borderColor: "var(--hairline)" }}
    >
      <button
        className="block w-full text-left"
        onClick={() => acoes.abrir(g)}
        aria-expanded={aberto}
      >
        {/* line-clamp, não truncate: "PREFEITURA MUNICIPAL DE MONTES CLAROS" e
            "...DE MONTE AZUL" viravam o mesmo cartão cortado. */}
        <p className="line-clamp-2 font-display text-[15px] font-semibold leading-tight text-slate-900">
          {g.cliente}
        </p>
        <p className="tnum mt-1 text-sm text-slate-700">
          {moeda(g.valor)}
          {g.qtd > 1 ? ` · ${numero(g.qtd)} orçamentos` : ""}
          {g.margem > 0 ? (
            <span className="text-ok-700"> · margem {moeda(g.margem)}</span>
          ) : (
            <span className="italic text-slate-400"> · sem margem no ERP</span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          {textoRelogio(g)}
          {mostrarVendedor ? ` · ${g.vendedores.join(", ")}` : ""}
          {g.agrupadoPorNome && (
            <span title="agrupado pelo nome: o ERP não mandou o código deste cliente"> · ~</span>
          )}
        </p>
        {g.nota && <p className="mt-1 truncate text-xs italic text-slate-500">“{g.nota}”</p>}
        <span className="apenas-impressao text-xs">
          {[g.celular, g.contatoNome].filter(Boolean).join(" · ")}
        </span>
      </button>

      <div className="sem-impressao mt-3 grid grid-cols-2 gap-2">
        {wa ? (
          <a
            className="btn-outline min-h-[44px] justify-center"
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => acoes.chamar(g)}
          >
            <MessageCircle size={15} strokeWidth={2.4} /> Chamar
          </a>
        ) : g.email ? (
          <a
            className="btn-outline min-h-[44px] justify-center"
            href={`mailto:${g.email}`}
            onClick={() => acoes.chamar(g)}
          >
            <Mail size={15} strokeWidth={2.4} /> E-mail
          </a>
        ) : (
          <span className="grid min-h-[44px] place-items-center text-xs text-slate-400">
            sem contato no Mubisys
          </span>
        )}
        <button className="btn-outline min-h-[44px] justify-center" onClick={() => acoes.abrir(g)}>
          <CalendarClock size={15} strokeWidth={2.4} />
          {g.proximoToque ? "Ver retorno" : "Retorno"}
        </button>
      </div>

      {aberto && (
        <GavetaNegocio g={g} motivos={motivos} hoje={hoje} salvando={salvando} acoes={acoes} />
      )}
    </div>
  );
}

function LinhaAgenda({ g, salvando, acoes }) {
  return (
    <div className="border-t px-4 py-3 first:border-0" style={{ borderColor: "var(--hairline)" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 flex-1 font-display text-sm font-semibold text-slate-900">
          {g.cliente}
        </p>
        <p className="tnum text-sm text-slate-700">
          {moeda(g.valor)}
          {g.margem > 0 ? <span className="text-ok-700"> · {moeda(g.margem)}</span> : ""}
        </p>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">
        {dataLonga(g.proximoToque)}
        {g.qtd > 1 ? ` · ${numero(g.qtd)} orçamentos` : ""}
        {` · ${g.vendedores.join(", ")}`}
      </p>
      {g.nota && <p className="mt-0.5 text-xs italic text-slate-600">“{g.nota}”</p>}
      <div className="sem-impressao mt-2 flex flex-wrap gap-2">
        {g.celular && (
          <a
            className="btn-outline"
            href={linkWhats(g)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => acoes.chamar(g)}
          >
            <MessageCircle size={14} strokeWidth={2.4} /> Chamar
          </a>
        )}
        <button className="btn-outline" disabled={salvando} onClick={() => acoes.antecipar(g)}>
          Antecipar para hoje
        </button>
        <button className="btn-ghost" disabled={salvando} onClick={() => acoes.cancelar(g)}>
          Cancelar retorno
        </button>
      </div>
    </div>
  );
}

function LinhaArquivo({ o, aberto, aoAbrir, children }) {
  return (
    <div className="border-t first:border-0" style={{ borderColor: "var(--hairline)" }}>
      <button className="block w-full px-4 py-3 text-left" onClick={aoAbrir} aria-expanded={aberto}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="min-w-0 flex-1 truncate font-display text-sm font-medium text-slate-900">
            {o.cliente}
          </span>
          <span className="tnum text-sm font-semibold text-slate-900">{moeda(o.valor)}</span>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">
          <span className={CHIP_SITUACAO[o.situacao] || "chip"}>
            {ROTULO_SITUACAO[o.situacao] || o.situacao}
            {o.baixaManual && " ✎"}
          </span>{" "}
          nº {o.numero}
          {o.trabalho ? ` · ${o.trabalho}` : ""} · {o.vendedorNome} · enviado em{" "}
          {dataLonga(o.envio)}
          {o.fechadoEm ? ` · fechado em ${dataLonga(o.fechadoEm)}` : ""}
          {o.margem > 0 ? ` · margem ${moeda(o.margem)}` : ""}
        </p>
      </button>
      {aberto && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

function Placar({
  aberto,
  aoAlternar,
  vmP,
  rotuloPeriodo,
  anos,
  meses,
  ano,
  mes,
  aoTrocarAno,
  aoTrocarMes,
  aoEscolherVendedor,
  aoVerMotivo,
  aoVerSemPasso,
}) {
  const k = vmP.kpis;
  const maiorMargem = Math.max(1, ...vmP.porVendedor.map((v) => v.margemGanha));
  const maiorMotivo = vmP.porMotivoPerda[0]?.valor || 1;
  return (
    <Card className="p-0">
      <button
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
        onClick={aoAlternar}
        aria-expanded={aberto}
      >
        <span className="font-display font-semibold text-slate-900">Placar do mês</span>
        <span className="tnum flex items-center gap-2 text-xs text-slate-500">
          {rotuloPeriodo} · {numero(k.ganhosQtd)} ganhos · {pct(k.conversao)} ·{" "}
          {moeda(k.margemGanha)}
          <ChevronDown
            size={16}
            className={`shrink-0 transition-transform ${aberto ? "" : "-rotate-90"}`}
          />
        </span>
      </button>

      {aberto && (
        <div className="space-y-5 px-5 pb-5">
          <div className="sem-impressao flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-500">Período</span>
            <select
              className="input w-auto"
              value={mes}
              onChange={(e) => aoTrocarMes(e.target.value)}
              aria-label="Mês"
            >
              <option value="todos">Ano inteiro</option>
              {meses.map((m) => (
                <option key={m} value={m}>
                  {MESES_LONGOS[Number(m) - 1]}
                </option>
              ))}
            </select>
            {/* Select de um item só é controle morto: o cache cobre o ano
                corrente, então o seletor de ano só aparece quando há dois. */}
            {anos.length > 1 && (
              <select
                className="input w-auto"
                value={ano}
                onChange={(e) => aoTrocarAno(e.target.value)}
                aria-label="Ano"
              >
                <option value="todos">Todos os anos</option>
                {anos.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
            <p>
              <span className="label mb-0 block">Conversão</span>
              <span className="tnum text-slate-900">{pct(k.conversao)}</span>
              <span className="block text-xs text-slate-500">
                {numero(k.ganhosQtd)} de {numero(k.ganhosQtd + k.perdidosQtd)} decididos
              </span>
            </p>
            <p>
              <span className="label mb-0 block">Margem ganha</span>
              <span className="tnum text-ok-700">{moeda(k.margemGanha)}</span>
              <span className="block text-xs text-slate-500">{moeda(k.ganhosValor)} faturados</span>
            </p>
            <p>
              <span className="label mb-0 block">Margem perdida</span>
              <span className="tnum text-bad-700">{moeda(k.margemPerdida)}</span>
              <span className="block text-xs text-slate-500">
                {numero(k.perdidosQtd)} não fecharam
              </span>
            </p>
            <p>
              <span className="label mb-0 block">Ticket ganho</span>
              <span className="tnum text-slate-900">{moeda(k.ticketGanho)}</span>
              <span className="block text-xs text-slate-500">média por venda</span>
            </p>
          </div>

          <div>
            <p className="label mb-2">Por vendedor (margem ganha)</p>
            <div className="space-y-2">
              {vmP.porVendedor.map((v) => (
                <button
                  key={v.vendedorId}
                  className="block w-full rounded-xl p-1 text-left transition-colors hover:bg-slate-50"
                  onClick={() => aoEscolherVendedor(v.vendedorId)}
                >
                  <BarRow
                    rotulo={v.nome}
                    valorTexto={moeda(v.margemGanha)}
                    pct={(v.margemGanha / maiorMargem) * 100}
                    tom="ok"
                    sub={`conversão ${pct(v.conversao)} · ${numero(v.naMesa)} na mesa · ${numero(v.semPasso)} sem retorno marcado`}
                  />
                </button>
              ))}
            </div>
          </div>

          {vmP.porMotivoPerda.length > 0 && (
            <div>
              <p className="label mb-2">Por que perdemos</p>
              <div className="space-y-2">
                {vmP.porMotivoPerda.slice(0, 3).map((m) => (
                  <button
                    key={m.chave}
                    className="block w-full rounded-xl p-1 text-left transition-colors hover:bg-slate-50"
                    onClick={() => aoVerMotivo(m)}
                  >
                    <BarRow
                      rotulo={m.nome}
                      valorTexto={moeda(m.valor)}
                      pct={(m.valor / maiorMotivo) * 100}
                      tom="bad"
                      sub={`${numero(m.qtd)} ${m.qtd === 1 ? "orçamento" : "orçamentos"}`}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-slate-500">
            <button className="btn-ghost !px-0 text-xs" onClick={aoVerSemPasso}>
              {numero(vmP.cobertura.semPassoQtd)} abertos sem retorno marcado ·{" "}
              {moeda(vmP.cobertura.semPassoValor)}
            </button>
            {" · "}
            <Link className="underline" to="/configuracoes">
              equipe e regras em Configurações
            </Link>
          </p>
        </div>
      )}
    </Card>
  );
}

function BarraDesfazer({ desfazer, aoDesfazer }) {
  if (!desfazer) return null;
  return (
    <div className="sem-impressao fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-6xl items-center justify-between gap-3 border-t bg-white px-4 py-3 text-sm shadow-lg">
      <span className="min-w-0 truncate text-slate-700">{desfazer.rotulo}</span>
      <button className="btn-outline shrink-0" onClick={aoDesfazer}>
        <Undo2 size={15} strokeWidth={2.4} /> Desfazer
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- página

export default function Orcamentos() {
  const {
    config,
    dados,
    overridesOrcamentos,
    setOverridesOrcamento,
    pronto,
    erro,
    recarregar,
    frescorDe,
  } = useApp();

  const meuVendedor = useMemo(() => canonVend(vendedorDaSessao()), []);
  const [aba, setAba] = useState("hoje");
  const [vendedorEscopo, setVendedorEscopo] = useState(meuVendedor || "");
  const [aberto, setAberto] = useState(null);
  const [expandidoBalde, setExpandidoBalde] = useState({});
  const [placarAberto, setPlacarAberto] = useState(false);
  const [ano, setAno] = useState("todos");
  const [mes, setMes] = useState("todos");
  const [buscaArq, setBuscaArq] = useState("");
  const [situacaoArq, setSituacaoArq] = useState("todos");
  const [motivoArq, setMotivoArq] = useState(null);
  const [limiteArq, setLimiteArq] = useState(50);
  const [abertoArq, setAbertoArq] = useState(null);
  const [desfazer, setDesfazer] = useState(null);
  const [saindo, setSaindo] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState(null);

  /* "Hoje" em estado, não constante: a tela fica aberta o dia inteiro no
     celular. Congelado, a promessa de hoje só viraria "atrasada" depois de um
     F5 -- e a de amanhã continuaria dizendo "amanhã" no dia seguinte. */
  const [hoje, setHoje] = useState(() => ymdLocal(new Date()));
  useEffect(() => {
    const conferir = () => setHoje(ymdLocal(new Date()));
    document.addEventListener("visibilitychange", conferir);
    window.addEventListener("focus", conferir);
    return () => {
      document.removeEventListener("visibilitychange", conferir);
      window.removeEventListener("focus", conferir);
    };
  }, []);

  // A barra de desfazer vive 8 segundos. Quando ela morre, o que saiu da fila
  // some de vez.
  useEffect(() => {
    if (!desfazer) return undefined;
    const t = setTimeout(() => {
      setDesfazer(null);
      setSaindo([]);
    }, 8000);
    return () => clearTimeout(t);
  }, [desfazer]);

  /* Impressão mostra a lista INTEIRA (a tela pagina em lotes de 50).
     `beforeprint` sozinho não basta: a atualização de estado do React é
     assíncrona e o diálogo captura a página antes do redesenho, então o PDF
     saía truncado. `matchMedia("print")` avisa na entrada E na saída. */
  useEffect(() => {
    const mm = window.matchMedia?.("print");
    const entrar = () => setLimiteArq(Number.MAX_SAFE_INTEGER);
    const sair = () => setLimiteArq(50);
    const aoMudar = (e) => (e.matches ? entrar() : sair());
    mm?.addEventListener?.("change", aoMudar);
    window.addEventListener("beforeprint", entrar);
    window.addEventListener("afterprint", sair);
    return () => {
      mm?.removeEventListener?.("change", aoMudar);
      window.removeEventListener("beforeprint", entrar);
      window.removeEventListener("afterprint", sair);
    };
  }, []);

  // Os períodos que EXISTEM no dado: oferecer um mês vazio é oferecer tela em
  // branco.
  const periodos = useMemo(() => {
    const anos = new Set();
    const mesesPorAno = {};
    for (const o of dados?.orcamentos || []) {
      const d = String(o.dataEnvio || "").slice(0, 10);
      if (d.length < 7) continue;
      const a = d.slice(0, 4);
      anos.add(a);
      (mesesPorAno[a] = mesesPorAno[a] || new Set()).add(d.slice(5, 7));
    }
    return {
      anos: [...anos].sort(),
      mesesDoAno: (a) =>
        a === "todos"
          ? [...new Set(Object.values(mesesPorAno).flatMap((s) => [...s]))].sort()
          : [...(mesesPorAno[a] || [])].sort(),
    };
  }, [dados]);

  /* DUAS CONTAS, DE PROPÓSITO.
     `vm` é a tela de trabalho e NUNCA vê o período: era o defeito mais grave da
     tela velha -- escolher "junho" no relatório esvaziava a fila do dia e ainda
     dizia "tudo já foi tratado".
     `vmPeriodo` é só o Placar. */
  const vm = useMemo(
    () =>
      dados
        ? calcOrcamentos(dados.orcamentos, overridesOrcamentos, config, {
            vendedor: vendedorEscopo,
            hoje,
          })
        : null,
    [dados, overridesOrcamentos, config, vendedorEscopo, hoje]
  );

  const vmPeriodo = useMemo(() => {
    if (!dados) return null;
    const base =
      ano === "todos" && mes === "todos"
        ? dados.orcamentos
        : dados.orcamentos.filter((o) => {
            const d = String(o.dataEnvio || "").slice(0, 10);
            if (ano !== "todos" && d.slice(0, 4) !== ano) return false;
            if (mes !== "todos" && d.slice(5, 7) !== mes) return false;
            return true;
          });
    return calcOrcamentos(base, overridesOrcamentos, config, { vendedor: vendedorEscopo, hoje });
  }, [dados, overridesOrcamentos, config, ano, mes, vendedorEscopo, hoje]);

  /* A ORDEM DA FILA É CONGELADA. Ela é ordenada por dinheiro, e marcar um
     orçamento muda o dinheiro do cliente: sem congelar, o cartão pula de lugar
     debaixo do dedo e a pessoa jura que "não selecionou" ou que "sumiu o que eu
     marquei". Congela a LISTA DE CHAVES (não o conjunto): item novo entra no
     fim, item que saiu desaparece quando a barra de desfazer expira. */
  const chaveOrdem = `${vendedorEscopo}|${hoje}`;
  const ordemRef = useRef({ chave: "", ids: [] });
  if (vm && ordemRef.current.chave !== chaveOrdem) {
    ordemRef.current = { chave: chaveOrdem, ids: vm.fila.grupos.map((g) => g.chave) };
  }

  const filaNaTela = useMemo(() => {
    if (!vm) return [];
    const atuais = new Map(vm.fila.grupos.map((g) => [g.chave, g]));
    const congelados = new Map(saindo.map((g) => [g.chave, g]));
    const vistos = new Set();
    const saida = [];
    for (const chave of ordemRef.current.ids) {
      const g = atuais.get(chave) || congelados.get(chave);
      if (!g) continue;
      vistos.add(chave);
      saida.push(g);
    }
    for (const g of vm.fila.grupos) if (!vistos.has(g.chave)) saida.push(g);
    return saida;
    // chaveOrdem entra de propósito: é ele que troca `ordemRef.current` (o lint
    // não enxerga isso porque a leitura é de um ref). Sem ele na lista, mudar
    // de vendedor deixaria a fila renderizada na ordem do vendedor anterior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vm, saindo, chaveOrdem]);

  const listaArquivo = useMemo(() => {
    if (!vm) return [];
    const q = norm(buscaArq.trim());
    return vm.lista.filter((o) => {
      if (situacaoArq === "sem-passo" && !(o.situacao === "aberto" && !o.proximoToque)) return false;
      if (situacaoArq !== "todos" && situacaoArq !== "sem-passo" && o.situacao !== situacaoArq) {
        return false;
      }
      if (motivoArq && o.motivoChave !== motivoArq.chave) return false;
      if (q) {
        const alvo = norm(
          `${o.cliente} ${o.numero} ${o.trabalho || ""} ${o.contatoNome || ""} ${o.vendedorNome}`
        );
        if (!alvo.includes(q)) return false;
      }
      return true;
    });
  }, [vm, buscaArq, situacaoArq, motivoArq]);

  if (erro) return <ErroModulo mensagem={erro} aoTentar={recarregar} />;
  if (!pronto || !vm || !vmPeriodo) return <CarregandoModulo />;

  const f = vm.fila;
  const motivos = config.motivosPerda || [];
  const atualizadoEm = frescorDe("orcamentos");
  const resumoEscopo = `Vendedor: ${vendedorEscopo || "todos"}`;

  /* Vínculo órfão: a conta aponta para um nome que não existe em NENHUM
     orçamento da base. O teste é contra a base crua -- contra a fila, o bom
     vendedor (que agendou o retorno de todo mundo) era acusado de cadastro
     errado justamente por ter feito o trabalho. */
  const vinculoOrfao =
    !!meuVendedor &&
    (dados?.orcamentos || []).length > 0 &&
    !(dados?.orcamentos || []).some((o) => canonVend(o.vendedorId) === meuVendedor);

  // ------------------------------------------------------------ gravação
  /* Uma gravação = UM pedido com todos os ids. Em laço, cada merge relê o
     registro do servidor e um sobrescreve o outro: cliente com 4 orçamentos
     perdia 3 datas. O patch inverso é montado ANTES, lendo o override que está
     no store agora -- e campo que não existia volta como `null` explícito,
     nunca `undefined` (undefined não apaga nada no merge do servidor). */
  function gravar(ids, campos, rotulo, { some = true } = {}) {
    if (!ids.length) return;
    const inverso = Object.fromEntries(
      ids.map((id) => {
        const atual = overridesOrcamentos[id] || {};
        return [id, Object.fromEntries(Object.keys(campos).map((k) => [k, atual[k] ?? null]))];
      })
    );
    const patch = Object.fromEntries(ids.map((id) => [id, campos]));
    setSalvando(true);
    setAviso(null);
    Promise.resolve(setOverridesOrcamento(patch))
      .catch((e) => setAviso({ tom: "erro", texto: e?.message || "Não consegui gravar." }))
      .finally(() => setSalvando(false));
    setDesfazer({ rotulo, patch: inverso });
    if (some) {
      const grupo = filaNaTela.find((g) => g.ids.some((id) => ids.includes(id)));
      if (grupo) setSaindo((s) => (s.some((x) => x.chave === grupo.chave) ? s : [...s, grupo]));
    }
  }

  function aplicarDesfazer() {
    if (!desfazer) return;
    setSalvando(true);
    Promise.resolve(setOverridesOrcamento(desfazer.patch))
      .catch((e) => setAviso({ tom: "erro", texto: e?.message || "Não consegui desfazer." }))
      .finally(() => setSalvando(false));
    setDesfazer(null);
    setSaindo([]);
  }

  const acoes = {
    abrir: (g) => setAberto((a) => (a === g.chave ? null : g.chave)),

    /* CHAMAR GRAVA ANTES DE SAIR. O WhatsApp joga a aba do painel para o fundo
       (no iPhone o navegador pode até descarregá-la), então "eu chamei" tem de
       virar fato no servidor no mesmo gesto. O cartão NÃO some: ele sobe para o
       balde "chamou e não marcou o retorno", que é a dívida de verdade. */
    chamar: (g) => gravar(g.ids, { chamadoEm: hoje }, `Chamada registrada — ${g.cliente}`, { some: false }),

    agendar: (g, data, nota) => {
      if (!data) return;
      const dias = diasEntre(hoje, data);
      if (dias > 90 && !window.confirm(`Retorno para ${dataLonga(data)}, daqui a ${dias} dias. Confirma?`)) {
        return;
      }
      const id = g.compromissoId || `cp-${getSessao()?.usuario || "eu"}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      gravar(
        g.ids,
        { proximoToque: data, compromissoId: id, chamadoEm: null, ...(nota ? { nota } : {}) },
        `Retorno de ${g.cliente} marcado para ${dataCurta(data)}`
      );
      /* O retorno prometido aqui tem de aparecer na Agenda de Compromissos:
         antes ele morria dentro do módulo e a agenda da manhã ficava sem
         justamente o que a pessoa acabou de prometer. Falhar aqui NÃO derruba o
         agendamento -- o retorno já foi gravado. */
      salvarCompromisso(id, {
        titulo: `Retorno — ${g.cliente}`,
        tipo: "retorno",
        cliente: g.cliente,
        data,
        telefone: g.celular || "",
        obs: nota || `${g.qtd} orçamento(s) na mesa`,
      }).catch((e) => console.warn("[orcamentos] retorno gravado, sem compromisso:", e?.message || e));
    },

    antecipar: (g) =>
      gravar(g.ids, { proximoToque: hoje }, `${g.cliente} voltou para a fila de hoje`, {
        some: false,
      }),

    // A NOTA SOBREVIVE ao cancelamento: ela é o que o cliente pediu, não a data.
    cancelar: (g) => {
      gravar(
        g.ids,
        { proximoToque: null, compromissoId: null },
        `Retorno de ${g.cliente} cancelado`,
        { some: false }
      );
      if (g.compromissoId) {
        removerCompromisso(g.compromissoId).catch((e) =>
          console.warn("[orcamentos] compromisso não removido:", e?.message || e)
        );
      }
    },

    /* Um toque só quando o cliente tem UM orçamento; com vários, a gaveta exige
       marcar quais. Dar baixa em tudo de uma vez transformava 1 venda em 4 e o
       Placar passava a mentir. */
    baixa: (g, ids, situacao, motivoId) =>
      gravar(
        ids,
        {
          situacao,
          dataBaixa: hoje,
          proximoToque: null,
          compromissoId: null,
          chamadoEm: null,
          ...(motivoId ? { motivoPerdaId: motivoId } : {}),
        },
        `${g.cliente}: ${ids.length > 1 ? `${ids.length} orçamentos ` : ""}${situacao === "ganho" ? "ganho" : "perdido"}`
      ),

    compraFutura: (g, o) =>
      gravar([o.id], { motivoPerdaId: "compra-futura" }, `${g.cliente} virou compra futura`, {
        some: false,
      }),

    desfazerBaixa: (g, o) =>
      gravar(
        [o.id],
        { situacao: null, dataBaixa: null },
        `Baixa desfeita — ${g.cliente} nº ${o.numero}`,
        { some: false }
      ),
  };

  function trocarVendedor(v) {
    setVendedorEscopo(v);
    setAberto(null);
    setSaindo([]);
    ordemRef.current = { chave: "", ids: [] };
  }

  function trocarAno(a) {
    setAno(a);
    if (mes !== "todos" && !periodos.mesesDoAno(a).includes(mes)) setMes("todos");
  }

  function verNoArquivo(patch) {
    setAba("arquivo");
    setAbertoArq(null);
    setLimiteArq(50);
    setPlacarAberto(false);
    setBuscaArq("");
    setSituacaoArq(patch.situacao ?? "todos");
    setMotivoArq(patch.motivo ?? null);
  }

  const rotuloPeriodo =
    mes !== "todos"
      ? `${MESES_LONGOS[Number(mes) - 1]}${ano !== "todos" ? `/${ano}` : ""}`
      : ano !== "todos"
        ? ano
        : "todo o período";

  const subFila = BALDES.map((b) =>
    f.kpis.porBalde[b.id] ? `${f.kpis.porBalde[b.id]} ${b.nome.toLowerCase()}` : null
  )
    .filter(Boolean)
    .join(" · ");

  const fechadosHoje = vm.fechados.filter((o) => o.fechadoEm === hoje);
  const visiveisArq = listaArquivo.slice(0, limiteArq);
  const restantesArq = listaArquivo.length - visiveisArq.length;
  const temFiltroArq = !!buscaArq || situacaoArq !== "todos" || !!motivoArq;

  return (
    <div className={`space-y-6 ${desfazer ? "pb-20" : ""}`}>
      <AvisoDadoParado atualizadoEm={atualizadoEm} />

      <PageTitle
        titulo="Orçamentos"
        descricao={
          `${numero(f.kpis.clientes)} ${f.kpis.clientes === 1 ? "cliente para tocar" : "clientes para tocar"} · ` +
          (f.kpis.margemAberta > 0
            ? `${moeda(f.kpis.margemAberta)} de margem em jogo`
            : `${moeda(f.kpis.valor)} na mesa`) +
          (f.kpis.margemRecall > 0
            ? ` · ${moeda(f.kpis.margemRecall)} em compra futura a recuperar`
            : "")
        }
      />

      <div className="sem-impressao space-y-2">
        <Segmented
          opcoes={[
            { valor: "hoje", rotulo: `Hoje (${f.kpis.clientes})` },
            { valor: "agenda", rotulo: `Agenda (${vm.agenda.length})` },
            { valor: "arquivo", rotulo: "Arquivo" },
          ]}
          valor={aba}
          onChange={(v) => {
            setAba(v);
            setAberto(null);
          }}
        />

        {vm.vendedoresDaBase.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-slate-500">Vendedor</span>
            <button
              className={vendedorEscopo === "" ? "chip-sel" : "chip-btn"}
              onClick={() => trocarVendedor("")}
              aria-pressed={vendedorEscopo === ""}
            >
              Todos
            </button>
            {vm.vendedoresDaBase.map((v) => (
              <button
                key={v.id}
                className={vendedorEscopo === v.id ? "chip-sel" : "chip-btn"}
                onClick={() => trocarVendedor(v.id)}
                aria-pressed={vendedorEscopo === v.id}
              >
                {v.nome} · {numero(v.qtd)}
              </button>
            ))}
          </div>
        )}

        {vinculoOrfao && (
          <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
            Nenhum orçamento da base está no nome <b>{meuVendedor}</b>. Se o seu nome estiver
            escrito diferente no Mubisys, peça para a direção corrigir em Acessos.
            <button className="btn-ghost ml-2" onClick={() => trocarVendedor("")}>
              Ver o time todo
            </button>
          </p>
        )}
      </div>

      {aviso && (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            aviso.tom === "erro" ? "bg-bad-50 text-bad-700" : "bg-ok-50 text-ok-700"
          }`}
        >
          {aviso.texto}
        </p>
      )}

      {aba === "hoje" && (
        <Card>
          <CabecalhoImpressao
            titulo="Impresilk — fila de fechamento"
            atualizadoEm={atualizadoEm}
            linhas={[
              `Emitido em ${dataLonga(hoje)} · ${numero(f.kpis.clientes)} clientes · ${moeda(f.kpis.valor)}`,
              resumoEscopo,
            ]}
          />
          <SectionTitle
            titulo="Para hoje"
            sub={subFila || "Nada pendente com este escopo."}
            acao={<BotaoPDF titulo="Imprime esta fila como pauta de ligações" />}
          />

          <Honestidade
            x={vm.excluidos}
            c={vm.cobertura}
            minimo={config.parametros.valorMinimoOrcamento}
            corte={config.parametros.dataCorteOrcamentos}
          />

          {filaNaTela.length === 0 ? (
            <Empty>
              {vm.kpis.naMesaQtd === 0
                ? "Nenhum orçamento aberto na base com este escopo."
                : `Nada para hoje: todos os ${numero(vm.kpis.naMesaQtd)} abertos têm retorno marcado.`}
              {vm.agenda.length > 0 && (
                <button className="btn-ghost ml-2" onClick={() => setAba("agenda")}>
                  Ver a Agenda ({numero(vm.agenda.length)})
                </button>
              )}
              {vendedorEscopo && (
                <button className="btn-ghost ml-2" onClick={() => trocarVendedor("")}>
                  Ver o time todo
                </button>
              )}
            </Empty>
          ) : (
            BALDES.map((b) => {
              const gs = filaNaTela.filter((g) => g.balde === b.id);
              if (!gs.length) return null;
              /* Teto no balde GORDO, não na fila inteira: paginar um balde de
                 3 clientes é atrapalhar, mas "compra futura" tem 61 clientes e
                 "sem próxima ação" tem 62 na base de hoje -- sem teto, a aba
                 vira 8 mil pixels de rolagem no celular. Como o balde já vem
                 ordenado por dinheiro, o teto corta o fim, nunca o topo. */
              const teto = gs.length > 15 && !expandidoBalde[b.id] ? 12 : gs.length;
              return (
                <GrupoBalde
                  key={b.id}
                  balde={b}
                  qtd={gs.length}
                  margem={gs.reduce((s, g) => s + g.margem, 0)}
                  restantes={gs.length - teto}
                  aoVerTudo={() => setExpandidoBalde((s) => ({ ...s, [b.id]: true }))}
                >
                  {gs.slice(0, teto).map((g) => (
                    <CartaoNegocio
                      key={g.chave}
                      g={g}
                      aberto={aberto === g.chave}
                      saindo={saindo.some((x) => x.chave === g.chave)}
                      mostrarVendedor={vendedorEscopo === ""}
                      motivos={motivos}
                      hoje={hoje}
                      salvando={salvando}
                      acoes={acoes}
                    />
                  ))}
                </GrupoBalde>
              );
            })
          )}

          <div className="mt-5 space-y-1 border-t pt-3 text-xs text-slate-500" style={{ borderColor: "var(--hairline)" }}>
            {vm.agenda.length > 0 && (
              <p>
                {moeda(vm.agenda.reduce((s, g) => s + g.valor, 0))} estão na Agenda, com data
                marcada.
                <button className="btn-ghost sem-impressao ml-1 !px-1 text-xs" onClick={() => setAba("agenda")}>
                  ver
                </button>
              </p>
            )}
            <p>
              Cobertura de próximo passo: {numero(vm.cobertura.clientesComData)} de{" "}
              {numero(vm.cobertura.clientesNaMesa)} clientes na mesa têm data (
              {pct(vm.cobertura.pct)}).
            </p>
            {fechadosHoje.length > 0 && (
              <p>
                Fechados hoje: {numero(fechadosHoje.length)} (
                {moeda(fechadosHoje.reduce((s, o) => s + o.valor, 0))}).
              </p>
            )}
          </div>
        </Card>
      )}

      {aba === "agenda" && (
        <Card>
          <CabecalhoImpressao
            titulo="Impresilk — retornos marcados"
            atualizadoEm={atualizadoEm}
            linhas={[`Emitido em ${dataLonga(hoje)} · ${numero(vm.agenda.length)} clientes`, resumoEscopo]}
          />
          <SectionTitle
            titulo="Retornos marcados"
            sub={
              vm.agenda.length
                ? `${numero(vm.agenda.length)} clientes · ${moeda(vm.agenda.reduce((s, g) => s + g.valor, 0))} com data marcada`
                : "O que você prometeu, e para quando."
            }
            acao={<BotaoPDF titulo="Imprime a agenda de retornos" />}
          />
          {vm.agenda.length === 0 ? (
            <Empty>
              Nenhum retorno marcado.
              <button className="btn-ghost ml-2" onClick={() => setAba("hoje")}>
                Marcar um na aba Hoje
              </button>
            </Empty>
          ) : (
            (() => {
              const semana = somaDias(hoje, 7);
              const mesQueVem = somaDias(hoje, 30);
              const faixas = [
                { nome: "Amanhã", teste: (d) => d === somaDias(hoje, 1) },
                { nome: "Nos próximos 7 dias", teste: (d) => d > somaDias(hoje, 1) && d <= semana },
                { nome: "Neste mês", teste: (d) => d > semana && d <= mesQueVem },
                { nome: "Mais para frente", teste: (d) => d > mesQueVem },
              ];
              return faixas.map((fx) => {
                const gs = vm.agenda.filter((g) => fx.teste(g.proximoToque));
                if (!gs.length) return null;
                return (
                  <section key={fx.nome} className="mt-5 first:mt-0">
                    <h3 className="mb-1 flex items-baseline justify-between gap-3">
                      <span className="font-display text-sm font-semibold text-slate-700">
                        {fx.nome}
                      </span>
                      <span className="tnum text-xs text-slate-500">
                        {numero(gs.length)} · {moeda(gs.reduce((s, g) => s + g.valor, 0))}
                      </span>
                    </h3>
                    <div className="rounded-xl border" style={{ borderColor: "var(--hairline)" }}>
                      {gs.map((g) => (
                        <LinhaAgenda key={g.chave} g={g} salvando={salvando} acoes={acoes} />
                      ))}
                    </div>
                  </section>
                );
              });
            })()
          )}
        </Card>
      )}

      {aba === "arquivo" && (
        <Card>
          <CabecalhoImpressao
            titulo="Impresilk — orçamentos"
            atualizadoEm={atualizadoEm}
            linhas={[
              `Emitido em ${dataLonga(hoje)} · ${numero(listaArquivo.length)} orçamentos · ${moeda(listaArquivo.reduce((s, o) => s + o.valor, 0))}`,
              [
                resumoEscopo,
                situacaoArq !== "todos" ? `situação: ${situacaoArq}` : null,
                motivoArq ? `motivo: ${motivoArq.nome}` : null,
                buscaArq ? `busca: "${buscaArq}"` : null,
              ]
                .filter(Boolean)
                .join(" · "),
            ]}
          />
          <SectionTitle
            titulo="Todos os orçamentos"
            sub="Para achar um orçamento específico e ver o que aconteceu com ele."
            acao={<BotaoPDF titulo="Imprime a lista com o recorte atual" />}
          />

          <div className="sem-impressao mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:max-w-sm">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="search"
                className="input pl-9"
                value={buscaArq}
                onChange={(e) => {
                  setBuscaArq(e.target.value);
                  setLimiteArq(50);
                }}
                placeholder="Cliente, número, trabalho, contato ou vendedor"
                aria-label="Buscar orçamento"
              />
            </div>
            {/* Chips que quebram linha, não Segmented: as cinco opções somam
                400px e a tela do celular tem 375 -- a página inteira passava a
                rolar de lado por causa desta única barra. */}
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { valor: "todos", rotulo: "Todos" },
                { valor: "aberto", rotulo: "Abertos" },
                { valor: "sem-passo", rotulo: "Sem retorno marcado" },
                { valor: "ganho", rotulo: "Ganhos" },
                { valor: "perdido", rotulo: "Perdidos" },
              ].map((o) => (
                <button
                  key={o.valor}
                  className={situacaoArq === o.valor ? "chip-sel" : "chip-btn"}
                  aria-pressed={situacaoArq === o.valor}
                  onClick={() => {
                    setSituacaoArq(o.valor);
                    setLimiteArq(50);
                  }}
                >
                  {o.rotulo}
                </button>
              ))}
            </div>
            {temFiltroArq && (
              <button
                className="btn-ghost"
                onClick={() => {
                  setBuscaArq("");
                  setSituacaoArq("todos");
                  setMotivoArq(null);
                  setLimiteArq(50);
                }}
              >
                <X size={15} /> Limpar
              </button>
            )}
          </div>

          {motivoArq && (
            <p className="mb-2 text-xs text-slate-500">
              Motivo: <b>{motivoArq.nome}</b>
            </p>
          )}

          <p className="mb-2 text-sm text-slate-500">
            {numero(listaArquivo.length)} de {numero(vm.lista.length)} ·{" "}
            {moeda(listaArquivo.reduce((s, o) => s + o.valor, 0))}
          </p>

          {visiveisArq.length === 0 ? (
            <Empty>Nenhum orçamento neste filtro.</Empty>
          ) : (
            <>
              <div className="rounded-xl border" style={{ borderColor: "var(--hairline)" }}>
                {visiveisArq.map((o) => {
                  const g = {
                    chave: `arq-${o.id}`,
                    cliente: o.cliente,
                    ids: [o.id],
                    itens: [o],
                    qtd: 1,
                    valor: o.valor,
                    margem: o.margem,
                    celular: o.celular,
                    contatoNome: o.contatoNome,
                    email: o.email,
                    nota: o.nota,
                    proximoToque: o.proximoToque,
                    compromissoId: o.compromissoId,
                    vendedores: [o.vendedorNome],
                  };
                  return (
                    <LinhaArquivo
                      key={o.id}
                      o={o}
                      aberto={abertoArq === o.id}
                      aoAbrir={() => setAbertoArq((a) => (a === o.id ? null : o.id))}
                    >
                      <GavetaNegocio
                        g={g}
                        motivos={motivos}
                        hoje={hoje}
                        salvando={salvando}
                        acoes={acoes}
                      />
                    </LinhaArquivo>
                  );
                })}
              </div>
              {restantesArq > 0 && (
                <button className="btn-ghost sem-impressao mt-3" onClick={() => setLimiteArq((n) => n + 50)}>
                  Mostrar mais ({numero(restantesArq)} restantes)
                </button>
              )}
            </>
          )}
        </Card>
      )}

      <Placar
        aberto={placarAberto}
        aoAlternar={() => setPlacarAberto((v) => !v)}
        vmP={vmPeriodo}
        rotuloPeriodo={rotuloPeriodo}
        anos={periodos.anos}
        meses={periodos.mesesDoAno(ano)}
        ano={ano}
        mes={mes}
        aoTrocarAno={trocarAno}
        aoTrocarMes={setMes}
        aoEscolherVendedor={(id) => {
          trocarVendedor(id);
          setPlacarAberto(false);
          setAba("hoje");
        }}
        aoVerMotivo={(m) => verNoArquivo({ situacao: "perdido", motivo: m })}
        aoVerSemPasso={() => verNoArquivo({ situacao: "sem-passo" })}
      />

      <BarraDesfazer desfazer={desfazer} aoDesfazer={aplicarDesfazer} />
    </div>
  );
}
