// Orçamentos — a mesa.
//
// A tela abre com O QUE ESTÁ NA MESA: um orçamento por linha, do maior para o
// menor, com cliente, trabalho, vendedor, estado e dinheiro. É a lista que
// responde "onde eu mexo agora", e é a primeira coisa que aparece.
//
// A versão anterior escondia essa lista dentro de cabeçalhos de balde ("sem
// próxima ação", "prometido e não cumprido") e obrigava a caçar. Os baldes
// continuam existindo no cálculo — mas agora eles são o SELO da linha e o
// recorte dos quatro números do topo, não a estrutura da tela.
//
// Craft da lista (medido em Linear, Geist/Vercel e Attio):
//   · um selo por linha, nunca dois — se precisa de dois, falta uma coluna;
//   · o valor é o ÚNICO número forte da linha, com tabular-nums e o "R$" em
//     cinza; a margem entra abaixo, menor;
//   · sem zebra, sem borda grossa: separador de 1px bem claro e ritmo vertical;
//   · dado ausente é travessão "—", nunca "N/A" nem R$ 0;
//   · cor só marca estado e a ação primária. O resto é cinza.
//
// Três abas: Na mesa (o trabalho) · Agenda (o que foi prometido) · Histórico
// (ganhos e perdidos). O Placar do mês é acordeão no rodapé, e é o ÚNICO lugar
// com seletor de período — na mesa, um filtro de relatório não manda.

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
  MoreHorizontal,
} from "lucide-react";
import { useApp } from "../config/store.jsx";
import { getSessao, vendedorDaSessao } from "../lib/sessao.js";
import { calcOrcamentos, canonVend, somaDias } from "../lib/calc/orcamentos.js";
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

// Selo: fundo 50, texto 700, ponto na cor cheia. Um por linha.
const SELO = {
  bad: { caixa: "bg-bad-50 text-bad-700", ponto: "bg-bad-600" },
  warn: { caixa: "bg-warn-50 text-warn-700", ponto: "bg-warn-600" },
  ok: { caixa: "bg-ok-50 text-ok-700", ponto: "bg-ok-600" },
  brand: { caixa: "bg-brand-50 text-brand-700", ponto: "bg-brand" },
  neutral: { caixa: "bg-slate-100 text-slate-600", ponto: "bg-slate-400" },
};
// Trilho colorido de 3px na borda esquerda: é o que deixa varrer a lista com o
// olho sem ler selo por selo. Só os estados que pedem ação ganham trilho.
const TRILHO = { bad: "bg-bad-600", warn: "bg-warn-500", ok: "bg-transparent", brand: "bg-transparent", neutral: "bg-transparent" };

const CORTES = [
  { id: "mesa", rotulo: "Na mesa" },
  { id: "atrasados", rotulo: "Atrasados" },
  { id: "semRetorno", rotulo: "Sem retorno" },
  { id: "recall", rotulo: "Compra futura" },
];

const ORDENS = {
  valor: { rotulo: "Maior valor", fn: (a, b) => b.valor - a.valor },
  margem: { rotulo: "Maior margem", fn: (a, b) => b.margem - a.margem },
  parado: { rotulo: "Mais parado", fn: (a, b) => b.dias - a.dias },
  urgencia: { rotulo: "Mais urgente", fn: null }, // usa a ordem do balde
};
const PESO_ESTADO = { atrasado: 0, chamado: 1, vencido: 2, hoje: 3, sem: 4, recall: 5, agendado: 6 };

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const primeiroNome = (n) => String(n || "").trim().split(/\s+/)[0] || "";
const iniciais = (n) =>
  String(n || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((x) => x[0])
    .join("")
    .toUpperCase();

function linkWhats(o) {
  if (!o.celular) return null;
  const ola = primeiroNome(o.contatoNome) ? `Olá, ${primeiroNome(o.contatoNome)}! ` : "Olá! ";
  const texto = `${ola}Aqui é da Impresilk, sobre o orçamento ${o.numero || ""}. Posso te ajudar a seguir com ele?`;
  return `https://wa.me/${o.celular}?text=${encodeURIComponent(texto)}`;
}

// ---------------------------------------------------------------- componentes
// Todos no escopo do módulo: componente dentro de componente remonta a cada
// render e o campo de nota perde o foco a cada letra.

function Selo({ estado }) {
  const s = SELO[estado.tom] || SELO.neutral;
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 truncate rounded-full px-2.5 py-1 font-display text-xs font-medium ${s.caixa}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.ponto}`} />
      <span className="truncate">{estado.rotulo}</span>
    </span>
  );
}

function Dinheiro({ valor, margem, semMargem, classe = "text-[17px]" }) {
  return (
    <div className="text-right">
      <p className={`tnum font-semibold text-slate-900 ${classe}`}>
        <span className="text-sm font-normal text-slate-400">R$ </span>
        {numero(Math.round(valor))}
      </p>
      <p className="tnum text-xs text-slate-500">
        {semMargem ? (
          <span className="text-slate-400">margem —</span>
        ) : (
          <>
            margem {numero(Math.round(margem))}
            {valor > 0 && (
              <span className="text-ok-700"> · {Math.round((margem / valor) * 100)}%</span>
            )}
          </>
        )}
      </p>
    </div>
  );
}

function FaixaNumeros({ r, conversao, recorte, aoRecortar }) {
  const celulas = [
    {
      id: "mesa",
      curto: `${numero(r.mesa.qtd)} orçamentos`,
      rotulo: "Na mesa",
      valor: moeda(r.mesa.valor),
      sub: `${numero(r.mesa.qtd)} orçamentos · margem ${moeda(r.mesa.margem)}`,
      cor: "text-slate-900",
    },
    {
      id: "atrasados",
      curto: moeda(r.atrasados.valor),
      rotulo: "Atrasados",
      valor: numero(r.atrasados.qtd),
      sub: `${moeda(r.atrasados.valor)} · promessa vencida ou orçamento vencido`,
      cor: r.atrasados.qtd ? "text-bad-700" : "text-slate-900",
    },
    {
      id: "semRetorno",
      curto: moeda(r.semRetorno.valor),
      rotulo: "Sem retorno marcado",
      valor: numero(r.semRetorno.qtd),
      sub: `${moeda(r.semRetorno.valor)} sem data para voltar e ainda no prazo`,
      cor: r.semRetorno.qtd ? "text-warn-700" : "text-slate-900",
    },
    {
      id: "recall",
      curto: moeda(r.recall.valor),
      rotulo: "Compra futura",
      valor: numero(r.recall.qtd),
      sub: `${moeda(r.recall.valor)} a recuperar com agenda`,
      cor: "text-slate-900",
    },
  ];
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-xl border bg-white lg:grid-cols-4" style={{ borderColor: "var(--hairline)" }}>
      {celulas.map((c, i) => {
        const ativo = recorte === c.id;
        return (
          <button
            key={c.id}
            onClick={() => aoRecortar(c.id)}
            aria-pressed={ativo}
            className={`border-t px-4 py-3 text-left transition-colors first:border-t-0 sm:border-t-0 ${
              i % 2 === 1 ? "border-l" : ""
            } lg:border-l lg:first:border-l-0 ${ativo ? "bg-brand-50" : "hover:bg-slate-50"}`}
            style={{ borderColor: "var(--hairline)" }}
          >
            <span className="block truncate text-xs text-slate-500">{c.rotulo}</span>
            <span className={`tnum mt-0.5 block text-[22px] font-semibold leading-tight ${c.cor}`}>
              {c.valor}
            </span>
            <span className="mt-0.5 hidden line-clamp-2 text-xs text-slate-400 sm:block">{c.sub}</span>
            <span className="mt-0.5 block truncate text-xs text-slate-400 sm:hidden">{c.curto}</span>
          </button>
        );
      })}
    </div>
  );
}

/* Os botões de data SÃO a gravação — não existe escolher e depois salvar.
   Confirmar antes de cada gesto transforma dois toques em quatro; o desfazer de
   8 segundos cobre o engano com um toque só. */
function PainelRetorno({ o, hoje, salvando, acoes, aoFechar }) {
  const [nota, setNota] = useState(o.nota || "");
  const [outra, setOutra] = useState("");
  const marcar = (data) => {
    acoes.agendar(o, data, nota);
    aoFechar();
  };
  return (
    <div className="mt-3 space-y-3 rounded-xl bg-slate-50 p-3">
      <div>
        <p className="label mb-1.5">
          {o.proximoToque ? `Retorno marcado para ${dataLonga(o.proximoToque)}` : "Voltar a falar em"}
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            { d: 1, r: "Amanhã" },
            { d: 3, r: "3 dias" },
            { d: 7, r: "7 dias" },
            { d: 15, r: "15 dias" },
          ].map((b) => (
            <button
              key={b.d}
              className="btn-outline min-h-[40px]"
              disabled={salvando}
              onClick={() => marcar(somaDias(hoje, b.d))}
            >
              {b.r}
              <span className="ml-1 text-xs text-slate-400">{dataCurta(somaDias(hoje, b.d))}</span>
            </button>
          ))}
          <span className="inline-flex items-end gap-2">
            <input
              type="date"
              className="input w-auto"
              value={outra}
              min={hoje}
              onChange={(e) => setOutra(e.target.value)}
              aria-label="Outra data"
            />
            <button className="btn-primary min-h-[40px]" disabled={!outra || salvando} onClick={() => marcar(outra)}>
              Marcar
            </button>
          </span>
        </div>
      </div>

      <input
        key={`n-${o.id}`}
        className="input"
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        placeholder="Nota (opcional): o que ele pediu, o que falta"
        aria-label="Nota do retorno"
      />

      {o.proximoToque && (
        <div className="flex flex-wrap gap-2">
          <button className="btn-outline" disabled={salvando} onClick={() => { acoes.antecipar(o); aoFechar(); }}>
            Antecipar para hoje
          </button>
          <button className="btn-ghost" disabled={salvando} onClick={() => { acoes.cancelar(o); aoFechar(); }}>
            Cancelar retorno
          </button>
        </div>
      )}
    </div>
  );
}

function PainelDesfecho({ o, motivos, salvando, acoes, aoFechar }) {
  const [motivo, setMotivo] = useState(o.motivoPerdaId || "");
  return (
    <div className="mt-3 space-y-3 rounded-xl bg-slate-50 p-3">
      <p className="label mb-0">Como terminou?</p>
      <div className="flex flex-wrap gap-2">
        <button
          className="btn-outline min-h-[44px] text-ok-700"
          disabled={salvando}
          onClick={() => { acoes.baixa(o, "ganho", ""); aoFechar(); }}
        >
          <Check size={15} strokeWidth={2.4} /> Ganhamos
        </button>
        <button
          className="btn-outline min-h-[44px] text-bad-700"
          disabled={salvando}
          onClick={() => { acoes.baixa(o, "perdido", motivo); aoFechar(); }}
        >
          <X size={15} strokeWidth={2.4} /> Perdemos
        </button>
      </div>
      <div>
        <p className="label mb-1.5">Se perdemos, por quê?</p>
        <div className="flex flex-wrap gap-1.5">
          {motivos.map((m) => (
            <button
              key={m.id}
              className={motivo === m.id ? "chip-sel" : "chip-btn"}
              aria-pressed={motivo === m.id}
              onClick={() => setMotivo((v) => (v === m.id ? "" : m.id))}
            >
              {m.nome}
            </button>
          ))}
        </div>
        {o.motivoPerdaNome && !o.motivoManual && (
          <p className="mt-1.5 text-xs text-slate-500">
            O ERP já diz: <b>{o.motivoPerdaNome}</b>. Escolher aqui sobrepõe.
          </p>
        )}
      </div>
      {o.baixaManual && (
        <button className="btn-ghost" disabled={salvando} onClick={() => { acoes.desfazerBaixa(o); aoFechar(); }}>
          Desfazer a baixa (o ERP marca {(o.situacaoErp || "").toLowerCase()})
        </button>
      )}
    </div>
  );
}

function Ficha({ o }) {
  const linhas = [
    o.contatoNome && `contato ${o.contatoNome}`,
    o.celular && o.celular.replace(/^55(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3"),
    o.email,
    o.temValidade
      ? o.diasParaVencer < 0
        ? `vale ${o.validade} dias — venceu há ${Math.abs(o.diasParaVencer)}`
        : `vale ${o.validade} dias — faltam ${o.diasParaVencer}`
      : "sem validade no ERP",
    `enviado em ${dataLonga(o.envio)}`,
    o.mexidoNoErpEm && `o ERP mexeu nele em ${dataLonga(o.mexidoNoErpEm)}`,
    o.fechadoEm && `fechado em ${dataLonga(o.fechadoEm)}`,
    o.nota && `nota: “${o.nota}”`,
  ].filter(Boolean);
  return <p className="mt-2 text-xs text-slate-500">{linhas.join(" · ")}</p>;
}

function LinhaOrcamento({ o, aberto, painel, mostrarVendedor, motivos, hoje, salvando, acoes }) {
  const wa = linkWhats(o);
  const trilho = TRILHO[o.estado.tom] || TRILHO.neutral;
  return (
    <div
      className={`relative border-t px-4 py-3 transition-colors first:border-0 hover:bg-slate-50/60 ${
        o.saindo ? "opacity-50" : ""
      }`}
      style={{ borderColor: "#f0f0f5" }}
    >
      <span className={`absolute inset-y-0 left-0 w-[3px] ${trilho}`} aria-hidden="true" />

      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_144px_120px_44px_140px_136px] xl:items-center xl:gap-3">
        {/* cliente + trabalho: mesmo corpo, muda peso e cor (padrão Geist) */}
        <button className="block w-full min-w-0 text-left" onClick={() => acoes.abrir(o)} aria-expanded={aberto}>
          <p className="truncate font-display text-[15px] font-semibold leading-tight text-slate-900">
            {o.cliente}
          </p>
          <p className="truncate text-sm text-slate-500">{o.trabalho || "sem descrição no ERP"}</p>
        </button>

        <div className="mt-2 flex flex-wrap items-center gap-2 xl:mt-0 xl:block">
          <Selo estado={o.estado} />
          {/* No celular o vendedor e os dias andam junto do selo; no computador
              cada um tem a sua coluna. */}
          {mostrarVendedor && (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 xl:hidden">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-brand-50 text-[9px] font-semibold text-brand-ink">
                {iniciais(o.vendedorNome)}
              </span>
              {o.vendedorNome}
            </span>
          )}
          <span className="text-xs text-slate-400 xl:hidden">{o.dias <= 0 ? "hoje" : `${o.dias} d`}</span>
        </div>

        <div className="hidden xl:block">
          {mostrarVendedor && (
            <span className="flex items-center gap-2 text-sm text-slate-600">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-50 text-[10px] font-semibold text-brand-ink">
                {iniciais(o.vendedorNome)}
              </span>
              <span className="truncate" title={o.vendedorNome}>{primeiroNome(o.vendedorNome)}</span>
            </span>
          )}
        </div>

        <p className="hidden text-right text-sm tabular-nums text-slate-500 xl:block">
          {o.dias <= 0 ? "hoje" : `${o.dias} d`}
        </p>

        <div className="mt-2 flex items-end justify-between gap-3 xl:mt-0 xl:block">
          <Dinheiro valor={o.valor} margem={o.margem} semMargem={o.semMargem} />
        </div>

        {/* Ações sempre visíveis -- no dedo não existe hover, e esconder a ação
            é o que fazia a tela "dar trabalho". No computador elas moram na
            própria linha, em ícones com rótulo escondido; no celular viram
            botões de largura inteira com o nome escrito. */}
        {/* Três botões lado a lado no celular (grade de 3), não empilhados: um
            por linha fazia cada orçamento ocupar 330px e só cabia UM na tela. */}
        <div className="sem-impressao mt-2.5 grid grid-cols-3 gap-2 xl:mt-0 xl:flex xl:justify-end">
          {wa ? (
            <a
              className="btn-outline min-h-[44px] justify-center !border-ok-200 !text-ok-700 xl:min-h-[40px] xl:!px-2.5"
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              title="Chamar no WhatsApp"
              onClick={() => acoes.chamar(o)}
            >
              <MessageCircle size={15} strokeWidth={2.4} />
              <span className="xl:hidden">WhatsApp</span>
            </a>
          ) : o.email ? (
            <a
              className="btn-outline min-h-[44px] justify-center xl:min-h-[40px] xl:!px-2.5"
              href={`mailto:${o.email}`}
              title="Mandar e-mail"
              onClick={() => acoes.chamar(o)}
            >
              <Mail size={15} strokeWidth={2.4} />
              <span className="xl:hidden">E-mail</span>
            </a>
          ) : (
            /* Botão desligado, não texto: com "sem contato" escrito ali, a
               coluna de ações perdia o alinhamento e a linha inteira dançava. */
            <span
              className="btn-outline pointer-events-none min-h-[44px] justify-center opacity-40 xl:min-h-[40px] xl:!px-2.5"
              title="Sem telefone nem e-mail no Mubisys"
            >
              <MessageCircle size={15} strokeWidth={2.4} />
              <span className="xl:hidden">sem nº</span>
            </span>
          )}
          <button
            className={`btn-outline min-h-[44px] justify-center xl:min-h-[40px] xl:!px-2.5 ${painel === "retorno" ? "!border-brand !text-brand" : ""}`}
            onClick={() => acoes.painel(o, "retorno")}
            title={o.proximoToque ? "Mudar o retorno" : "Marcar retorno"}
          >
            <CalendarClock size={15} strokeWidth={2.4} />
            <span className="xl:hidden">{o.proximoToque ? "Mudar" : "Retorno"}</span>
          </button>
          <button
            className={`btn-outline min-h-[44px] justify-center xl:min-h-[40px] xl:!px-2.5 ${painel === "desfecho" ? "!border-brand !text-brand" : ""}`}
            onClick={() => acoes.painel(o, "desfecho")}
            title="Ganhamos ou perdemos"
          >
            <MoreHorizontal size={15} strokeWidth={2.4} />
            <span className="xl:hidden">Ganho/Perda</span>
          </button>
        </div>
      </div>

      {o.qtdDoCliente > 1 && (
        <button className="chip-btn sem-impressao mt-2" onClick={() => acoes.verCliente(o)}>
          +{o.qtdDoCliente - 1} do mesmo cliente
        </button>
      )}
      <span className="apenas-impressao text-xs">
        {[o.celular, o.contatoNome, o.estado.rotulo].filter(Boolean).join(" · ")}
      </span>

      {aberto && <Ficha o={o} />}
      {painel === "retorno" && (
        <PainelRetorno o={o} hoje={hoje} salvando={salvando} acoes={acoes} aoFechar={() => acoes.painel(o, null)} />
      )}
      {painel === "desfecho" && (
        <PainelDesfecho o={o} motivos={motivos} salvando={salvando} acoes={acoes} aoFechar={() => acoes.painel(o, null)} />
      )}
    </div>
  );
}

function LinhaAgenda({ o, salvando, acoes }) {
  return (
    <div className="border-t px-4 py-3 first:border-0" style={{ borderColor: "#f0f0f5" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 flex-1 truncate font-display text-[15px] font-semibold text-slate-900">
          {o.cliente}
        </p>
        <Dinheiro valor={o.valor} margem={o.margem} semMargem={o.semMargem} classe="text-base" />
      </div>
      <p className="mt-0.5 text-sm text-slate-500">
        {o.trabalho || "sem descrição no ERP"} · {o.vendedorNome}
      </p>
      {o.nota && <p className="mt-0.5 text-xs italic text-slate-600">“{o.nota}”</p>}
      <div className="sem-impressao mt-2 flex flex-wrap gap-2">
        {o.celular && (
          <a
            className="btn-outline !border-ok-200 !text-ok-700"
            href={linkWhats(o)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => acoes.chamar(o)}
          >
            <MessageCircle size={14} strokeWidth={2.4} /> WhatsApp
          </a>
        )}
        <button className="btn-outline" disabled={salvando} onClick={() => acoes.antecipar(o)}>
          Antecipar para hoje
        </button>
        <button className="btn-ghost" disabled={salvando} onClick={() => acoes.cancelar(o)}>
          Cancelar retorno
        </button>
      </div>
    </div>
  );
}

function Honestidade({ x, c, minimo, corte }) {
  const linhas = [
    x.abaixoDoMinimo > 0 && `${numero(x.abaixoDoMinimo)} abaixo de ${moeda(minimo)} (valor mínimo em Configurações)`,
    x.antesDoCorte > 0 && `${numero(x.antesDoCorte)} enviados antes de ${dataLonga(corte)}`,
    x.semData > 0 && `${numero(x.semData)} sem data de cadastro no ERP`,
    c.abertosSemValidade > 0 && `${numero(c.abertosSemValidade)} abertos sem validade preenchida — esses nunca aparecem como vencidos`,
    c.filaSemMargem > 0 && `${numero(c.filaSemMargem)} com margem zerada no ERP`,
    c.ganhosSemFechamento > 0 && `${numero(c.ganhosSemFechamento)} marcados como ganhos sem data de aprovação`,
  ].filter(Boolean);
  if (!linhas.length) return null;
  return (
    <details className="sem-impressao mt-4 text-xs text-slate-500">
      <summary className="cursor-pointer">O que não está nesta lista</summary>
      <ul className="mt-1 space-y-0.5 pl-4">
        {linhas.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </details>
  );
}

function Placar({
  aberto, aoAlternar, vmP, rotuloPeriodo, anos, meses, ano, mes,
  aoTrocarAno, aoTrocarMes, aoEscolherVendedor, aoVerMotivo,
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
          <span className="hidden sm:inline">{rotuloPeriodo} · </span>
          {numero(k.ganhosQtd)} ganhos · {pct(k.conversao)} · {moeda(k.margemGanha)}
          <ChevronDown size={16} className={`shrink-0 transition-transform ${aberto ? "" : "-rotate-90"}`} />
        </span>
      </button>

      {aberto && (
        <div className="space-y-5 px-5 pb-5">
          <div className="sem-impressao flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-500">Período</span>
            <select className="input w-auto" value={mes} onChange={(e) => aoTrocarMes(e.target.value)} aria-label="Mês">
              <option value="todos">Ano inteiro</option>
              {meses.map((m) => (
                <option key={m} value={m}>{MESES_LONGOS[Number(m) - 1]}</option>
              ))}
            </select>
            {anos.length > 1 && (
              <select className="input w-auto" value={ano} onChange={(e) => aoTrocarAno(e.target.value)} aria-label="Ano">
                <option value="todos">Todos os anos</option>
                {anos.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            {[
              { r: "Conversão", v: pct(k.conversao), s: `${numero(k.ganhosQtd)} de ${numero(k.ganhosQtd + k.perdidosQtd)} decididos`, c: "text-slate-900" },
              { r: "Margem ganha", v: moeda(k.margemGanha), s: `${moeda(k.ganhosValor)} faturados`, c: "text-ok-700" },
              { r: "Margem perdida", v: moeda(k.margemPerdida), s: `${numero(k.perdidosQtd)} não fecharam`, c: "text-bad-700" },
              { r: "Ticket ganho", v: moeda(k.ticketGanho), s: "média por venda", c: "text-slate-900" },
            ].map((n) => (
              <p key={n.r}>
                <span className="block text-xs text-slate-500">{n.r}</span>
                <span className={`tnum block text-lg font-semibold ${n.c}`}>{n.v}</span>
                <span className="block text-xs text-slate-400">{n.s}</span>
              </p>
            ))}
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
                {vmP.porMotivoPerda.slice(0, 4).map((m) => (
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
            <Link className="underline" to="/configuracoes">equipe e regras em Configurações</Link>
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
    config, dados, overridesOrcamentos, setOverridesOrcamento,
    pronto, erro, recarregar, frescorDe,
  } = useApp();

  const meuVendedor = useMemo(() => canonVend(vendedorDaSessao()), []);
  const [aba, setAba] = useState("mesa");
  const [vendedorEscopo, setVendedorEscopo] = useState(meuVendedor || "");
  const [recorte, setRecorte] = useState("mesa");
  const [ordem, setOrdem] = useState("valor");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(null);
  const [painel, setPainel] = useState({ id: null, qual: null });
  const [limite, setLimite] = useState(30);
  const [placarAberto, setPlacarAberto] = useState(false);
  const [ano, setAno] = useState("todos");
  const [mes, setMes] = useState("todos");
  const [situacaoHist, setSituacaoHist] = useState("ganho");
  const [motivoHist, setMotivoHist] = useState(null);
  const [desfazer, setDesfazer] = useState(null);
  const [saindo, setSaindo] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState(null);

  // "Hoje" em estado: a tela fica aberta o dia inteiro no celular. Congelado, a
  // promessa de hoje só viraria "atrasada" depois de um F5.
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

  useEffect(() => {
    if (!desfazer) return undefined;
    const t = setTimeout(() => {
      setDesfazer(null);
      setSaindo([]);
    }, 8000);
    return () => clearTimeout(t);
  }, [desfazer]);

  /* Impressão mostra a lista INTEIRA (a tela pagina em lotes). `beforeprint`
     sozinho não basta: a atualização de estado do React é assíncrona e o
     diálogo captura a página antes do redesenho. */
  useEffect(() => {
    const mm = window.matchMedia?.("print");
    const entrar = () => setLimite(Number.MAX_SAFE_INTEGER);
    const sair = () => setLimite(30);
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

  /* DUAS CONTAS, DE PROPÓSITO. `vm` é a tela de trabalho e nunca vê o período —
     era o defeito mais grave da tela velha. `vmPeriodo` é só o Placar. */
  const vm = useMemo(
    () =>
      dados
        ? calcOrcamentos(dados.orcamentos, overridesOrcamentos, config, { vendedor: vendedorEscopo, hoje })
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

  /* Quantos orçamentos ABERTOS o mesmo cliente tem: vira o chip "+2 do mesmo
     cliente", que é o que evita ligar três vezes para a mesma empresa. */
  const porCliente = useMemo(() => {
    const m = new Map();
    for (const o of vm?.mesa || []) {
      const k = o.clienteId || norm(o.cliente);
      m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  }, [vm]);

  const naTela = useMemo(() => {
    if (!vm) return [];
    const q = norm(busca.trim());
    const base =
      recorte === "recall"
        ? vm.lista.filter((o) => o.recall)
        : recorte === "atrasados"
          ? vm.mesa.filter((o) => o.toqueAtrasado || o.vencido || (o.chamadoEm && !o.proximoToque))
          : recorte === "semRetorno"
            ? vm.mesa.filter(
                (o) =>
                  !o.proximoToque &&
                  !o.chamadoEm &&
                  !(o.toqueAtrasado || o.vencido || (o.chamadoEm && !o.proximoToque))
              )
            : vm.mesa;
    const filtrada = base.filter((o) => {
      if (!q) return true;
      return norm(`${o.cliente} ${o.numero} ${o.trabalho || ""} ${o.contatoNome || ""} ${o.vendedorNome}`).includes(q);
    });
    const ord =
      ordem === "urgencia"
        ? (a, b) =>
            (PESO_ESTADO[a.estado.chave] ?? 9) - (PESO_ESTADO[b.estado.chave] ?? 9) ||
            b.margem - a.margem ||
            b.valor - a.valor
        : ORDENS[ordem].fn;
    return [...filtrada].sort(ord).map((o) => ({
      ...o,
      qtdDoCliente: porCliente.get(o.clienteId || norm(o.cliente)) || 1,
      saindo: saindo.includes(o.id),
    }));
  }, [vm, recorte, busca, ordem, porCliente, saindo]);

  const historico = useMemo(() => {
    if (!vm) return [];
    const q = norm(busca.trim());
    return vm.lista
      .filter((o) => o.situacao === situacaoHist)
      .filter((o) => !motivoHist || o.motivoChave === motivoHist.chave)
      .filter((o) =>
        !q ? true : norm(`${o.cliente} ${o.numero} ${o.trabalho || ""} ${o.vendedorNome}`).includes(q)
      )
      .sort((a, b) => String(b.fechadoEm).localeCompare(String(a.fechadoEm)) || b.valor - a.valor);
  }, [vm, situacaoHist, motivoHist, busca]);

  if (erro) return <ErroModulo mensagem={erro} aoTentar={recarregar} />;
  if (!pronto || !vm || !vmPeriodo) return <CarregandoModulo />;

  const motivos = config.motivosPerda || [];
  const atualizadoEm = frescorDe("orcamentos");
  const r = vm.recorte;

  const vinculoOrfao =
    !!meuVendedor &&
    (dados?.orcamentos || []).length > 0 &&
    !(dados?.orcamentos || []).some((o) => canonVend(o.vendedorId) === meuVendedor);

  // ------------------------------------------------------------ gravação
  /* Uma gravação = UM pedido. O patch inverso é montado ANTES, lendo o override
     que está no store agora; campo que não existia volta como `null` explícito
     (undefined não apaga nada no merge do servidor). */
  function gravar(ids, campos, rotulo, { some = true } = {}) {
    if (!ids.length) return;
    const inverso = Object.fromEntries(
      ids.map((id) => {
        const atual = overridesOrcamentos[id] || {};
        return [id, Object.fromEntries(Object.keys(campos).map((k) => [k, atual[k] ?? null]))];
      })
    );
    setSalvando(true);
    setAviso(null);
    Promise.resolve(setOverridesOrcamento(Object.fromEntries(ids.map((id) => [id, campos]))))
      .catch((e) => setAviso({ tom: "erro", texto: e?.message || "Não consegui gravar." }))
      .finally(() => setSalvando(false));
    setDesfazer({ rotulo, patch: inverso });
    if (some) setSaindo((s) => [...new Set([...s, ...ids])]);
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
    abrir: (o) => setAberto((a) => (a === o.id ? null : o.id)),
    painel: (o, qual) =>
      setPainel((p) => (p.id === o.id && p.qual === qual ? { id: null, qual: null } : { id: o.id, qual })),
    verCliente: (o) => {
      setBusca(o.cliente);
      setRecorte("mesa");
      setLimite(30);
    },

    /* CHAMAR GRAVA ANTES DE SAIR. O WhatsApp joga a aba do painel para o fundo
       (no iPhone o navegador pode até descarregá-la), então "eu chamei" tem de
       virar fato no servidor no mesmo gesto — com keepalive no serviço. O
       orçamento NÃO some da lista: ele passa a exibir "Chamado dd/mm". */
    chamar: (o) => gravar([o.id], { chamadoEm: hoje }, `Chamada registrada — ${o.cliente}`, { some: false }),

    agendar: (o, data, nota) => {
      if (!data) return;
      const dias = diasEntre(hoje, data);
      if (dias > 90 && !window.confirm(`Retorno para ${dataLonga(data)}, daqui a ${dias} dias. Confirma?`)) return;
      const id =
        o.compromissoId ||
        `cp-${getSessao()?.usuario || "eu"}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      gravar(
        [o.id],
        { proximoToque: data, compromissoId: id, chamadoEm: null, nota: nota || null },
        `${o.cliente}: retorno em ${dataCurta(data)}`,
        { some: recorte !== "mesa" }
      );
      /* O retorno prometido aqui tem de aparecer na agenda de Compromissos:
         antes ele morria dentro do módulo. Falhar aqui NÃO derruba o
         agendamento — o retorno já foi gravado. */
      salvarCompromisso(id, {
        titulo: `Retorno — ${o.cliente}`,
        tipo: "retorno",
        cliente: o.cliente,
        data,
        telefone: o.celular || "",
        obs: nota || o.trabalho || "",
      }).catch((e) => console.warn("[orcamentos] retorno gravado, sem compromisso:", e?.message || e));
    },

    antecipar: (o) => gravar([o.id], { proximoToque: hoje }, `${o.cliente} voltou para hoje`, { some: false }),

    // A NOTA SOBREVIVE ao cancelamento: ela é o que o cliente pediu, não a data.
    cancelar: (o) => {
      gravar([o.id], { proximoToque: null, compromissoId: null }, `Retorno de ${o.cliente} cancelado`, { some: false });
      if (o.compromissoId) {
        removerCompromisso(o.compromissoId).catch((e) =>
          console.warn("[orcamentos] compromisso não removido:", e?.message || e)
        );
      }
    },

    baixa: (o, situacao, motivoId) =>
      gravar(
        [o.id],
        {
          situacao,
          dataBaixa: hoje,
          proximoToque: null,
          compromissoId: null,
          chamadoEm: null,
          ...(motivoId ? { motivoPerdaId: motivoId } : {}),
        },
        `${o.cliente} nº ${o.numero}: ${situacao === "ganho" ? "ganho" : "perdido"}`
      ),

    desfazerBaixa: (o) =>
      gravar([o.id], { situacao: null, dataBaixa: null }, `Baixa desfeita — ${o.cliente}`, { some: false }),
  };

  function trocarVendedor(v) {
    setVendedorEscopo(v);
    setAberto(null);
    setPainel({ id: null, qual: null });
    setSaindo([]);
    setLimite(30);
  }

  function trocarAno(a) {
    setAno(a);
    if (mes !== "todos" && !periodos.mesesDoAno(a).includes(mes)) setMes("todos");
  }

  const rotuloPeriodo =
    mes !== "todos"
      ? `${MESES_LONGOS[Number(mes) - 1]}${ano !== "todos" ? `/${ano}` : ""}`
      : ano !== "todos"
        ? ano
        : "todo o período";

  const visiveis = naTela.slice(0, limite);
  const restantes = naTela.length - visiveis.length;
  const somaTela = naTela.reduce((s, o) => s + o.valor, 0);
  const cortelabel = CORTES.find((c) => c.id === recorte)?.rotulo || "Na mesa";
  const mostrarVendedor = vendedorEscopo === "";

  return (
    <div className={`space-y-5 ${desfazer ? "pb-20" : ""}`}>
      <AvisoDadoParado atualizadoEm={atualizadoEm} />

      <PageTitle
        titulo="Orçamentos"
        descricao={`${numero(r.mesa.qtd)} abertos · ${moeda(r.mesa.valor)} na mesa`}
      />

      <div className="sem-impressao space-y-2">
        <Segmented
          opcoes={[
            { valor: "mesa", rotulo: `Na mesa (${numero(r.mesa.qtd)})` },
            { valor: "agenda", rotulo: `Agenda (${numero(vm.agenda.length)})` },
            { valor: "historico", rotulo: "Histórico" },
          ]}
          valor={aba}
          onChange={(v) => {
            setAba(v);
            setAberto(null);
            setPainel({ id: null, qual: null });
            setLimite(30);
          }}
        />

        {vm.vendedoresDaBase.length > 1 && (
          <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 lg:flex-wrap lg:overflow-visible [&>*]:shrink-0">
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
                {v.nome} <span className="text-slate-400">{numero(v.qtd)}</span>
              </button>
            ))}
          </div>
        )}

        {vinculoOrfao && (
          <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
            Nenhum orçamento da base está no nome <b>{meuVendedor}</b>. Se o seu nome estiver escrito
            diferente no Mubisys, peça para a direção corrigir em Acessos.
            <button className="btn-ghost ml-2" onClick={() => trocarVendedor("")}>Ver o time todo</button>
          </p>
        )}
      </div>

      {aviso && (
        <p className={`rounded-lg px-3 py-2 text-sm ${aviso.tom === "erro" ? "bg-bad-50 text-bad-700" : "bg-ok-50 text-ok-700"}`}>
          {aviso.texto}
        </p>
      )}

      {aba === "mesa" && (
        <>
          <div className="sem-impressao">
            <FaixaNumeros
              r={r}
              conversao={vm.kpis.conversao}
              recorte={recorte}
              aoRecortar={(id) => {
                setRecorte(id);
                setLimite(30);
                setAberto(null);
              }}
            />
          </div>

          <Card className="p-0">
            <div className="px-4 pt-4 sm:px-5 sm:pt-5">
              <CabecalhoImpressao
                titulo="Impresilk — orçamentos na mesa"
                atualizadoEm={atualizadoEm}
                linhas={[
                  `Emitido em ${dataLonga(hoje)} · ${numero(naTela.length)} orçamentos · ${moeda(somaTela)}`,
                  `${cortelabel} · vendedor: ${vendedorEscopo || "todos"}${busca ? ` · busca "${busca}"` : ""}`,
                ]}
              />
              {/* No celular este cabeçalho era 250px repetindo o que a faixa de
                  números e a aba já dizem -- e empurrava a lista, que é o que
                  ele pediu para ver primeiro, para fora da tela. */}
              <div className="hidden sm:block">
                <SectionTitle
                  titulo={cortelabel}
                  sub={`${numero(naTela.length)} ${naTela.length === 1 ? "orçamento" : "orçamentos"} · ${moeda(somaTela)}`}
                  acao={<BotaoPDF titulo="Imprime esta lista" />}
                />
              </div>

              <div className="sem-impressao mb-3 flex flex-wrap items-center gap-2">
                <div className="relative min-w-0 flex-1 sm:max-w-xs">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    className="input pl-9"
                    value={busca}
                    onChange={(e) => {
                      setBusca(e.target.value);
                      setLimite(30);
                    }}
                    placeholder="Cliente, número, trabalho ou contato"
                    aria-label="Buscar orçamento"
                  />
                </div>
                <select
                  className="input w-auto"
                  value={ordem}
                  onChange={(e) => setOrdem(e.target.value)}
                  aria-label="Ordenar por"
                >
                  {Object.entries(ORDENS).map(([id, o]) => (
                    <option key={id} value={id}>{o.rotulo}</option>
                  ))}
                </select>
                {(busca || recorte !== "mesa") && (
                  <button
                    className="btn-ghost"
                    onClick={() => {
                      setBusca("");
                      setRecorte("mesa");
                      setLimite(30);
                    }}
                  >
                    <X size={15} /> Limpar
                  </button>
                )}
              </div>
            </div>

            {visiveis.length === 0 ? (
              <div className="px-5 pb-5">
                <Empty>
                  {busca
                    ? `Nada com "${busca}".`
                    : recorte === "mesa"
                      ? "Nenhum orçamento aberto com este escopo."
                      : `Nada em ${cortelabel.toLowerCase()} — e isso é uma boa notícia.`}
                </Empty>
              </div>
            ) : (
              <div>
                {visiveis.map((o) => (
                  <LinhaOrcamento
                    key={o.id}
                    o={o}
                    aberto={aberto === o.id}
                    painel={painel.id === o.id ? painel.qual : null}
                    mostrarVendedor={mostrarVendedor}
                    motivos={motivos}
                    hoje={hoje}
                    salvando={salvando}
                    acoes={acoes}
                  />
                ))}
              </div>
            )}

            <div className="px-5 pb-5">
              {restantes > 0 && (
                <button className="btn-ghost sem-impressao mt-3" onClick={() => setLimite((n) => n + 30)}>
                  Mostrar mais ({numero(restantes)} restantes)
                </button>
              )}
              <Honestidade
                x={vm.excluidos}
                c={vm.cobertura}
                minimo={config.parametros.valorMinimoOrcamento}
                corte={config.parametros.dataCorteOrcamentos}
              />
              <p className="mt-2 text-xs text-slate-500">
                Cobertura de próximo passo: {numero(vm.cobertura.clientesComData)} de{" "}
                {numero(vm.cobertura.clientesNaMesa)} clientes na mesa têm data ({pct(vm.cobertura.pct)}).
              </p>
            </div>
          </Card>
        </>
      )}

      {aba === "agenda" && (
        <Card className="p-0">
          <div className="px-5 pt-5">
            <CabecalhoImpressao
              titulo="Impresilk — retornos marcados"
              atualizadoEm={atualizadoEm}
              linhas={[
                `Emitido em ${dataLonga(hoje)} · ${numero(vm.agenda.length)} clientes`,
                `Vendedor: ${vendedorEscopo || "todos"}`,
              ]}
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
          </div>
          {vm.agenda.length === 0 ? (
            <div className="px-5 pb-5">
              <Empty>
                Nenhum retorno marcado.
                <button className="btn-ghost ml-2" onClick={() => setAba("mesa")}>Marcar um na mesa</button>
              </Empty>
            </div>
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
              return (
                <div className="pb-5">
                  {faixas.map((fx) => {
                    const gs = vm.agenda.filter((g) => fx.teste(g.proximoToque));
                    if (!gs.length) return null;
                    return (
                      <section key={fx.nome} className="mt-4 first:mt-0">
                        <h3 className="flex items-baseline justify-between gap-3 px-5 pb-1">
                          <span className="font-display text-sm font-semibold text-slate-700">{fx.nome}</span>
                          <span className="tnum text-xs text-slate-500">
                            {numero(gs.length)} · {moeda(gs.reduce((s, g) => s + g.valor, 0))}
                          </span>
                        </h3>
                        {gs.flatMap((g) =>
                          g.itens.map((o) => (
                            <LinhaAgenda key={o.id} o={{ ...o, nota: o.nota || g.nota }} salvando={salvando} acoes={acoes} />
                          ))
                        )}
                      </section>
                    );
                  })}
                </div>
              );
            })()
          )}
        </Card>
      )}

      {aba === "historico" && (
        <Card className="p-0">
          <div className="px-5 pt-5">
            <CabecalhoImpressao
              titulo="Impresilk — histórico de orçamentos"
              atualizadoEm={atualizadoEm}
              linhas={[
                `Emitido em ${dataLonga(hoje)} · ${numero(historico.length)} orçamentos · ${moeda(historico.reduce((s, o) => s + o.valor, 0))}`,
                `${situacaoHist === "ganho" ? "Ganhos" : "Perdidos"} · vendedor: ${vendedorEscopo || "todos"}${motivoHist ? ` · motivo ${motivoHist.nome}` : ""}`,
              ]}
            />
            <SectionTitle
              titulo="Histórico"
              sub="O que já foi decidido — para achar um orçamento e ver o que aconteceu com ele."
              acao={<BotaoPDF titulo="Imprime o histórico com o recorte atual" />}
            />
            <div className="sem-impressao mb-3 flex flex-wrap items-center gap-2">
              <Segmented
                opcoes={[
                  { valor: "ganho", rotulo: `Ganhos (${numero(vm.kpis.ganhosQtd)})` },
                  { valor: "perdido", rotulo: `Perdidos (${numero(vm.kpis.perdidosQtd)})` },
                ]}
                valor={situacaoHist}
                onChange={(v) => {
                  setSituacaoHist(v);
                  setMotivoHist(null);
                  setLimite(30);
                }}
              />
              <div className="relative min-w-0 flex-1 sm:max-w-xs">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  className="input pl-9"
                  value={busca}
                  onChange={(e) => {
                    setBusca(e.target.value);
                    setLimite(30);
                  }}
                  placeholder="Cliente, número ou trabalho"
                  aria-label="Buscar no histórico"
                />
              </div>
              {motivoHist && (
                <button className="chip-sel" onClick={() => setMotivoHist(null)}>
                  {motivoHist.nome} <X size={12} />
                </button>
              )}
            </div>
          </div>

          {historico.length === 0 ? (
            <div className="px-5 pb-5">
              <Empty>Nenhum orçamento neste recorte.</Empty>
            </div>
          ) : (
            <>
              <div>
                {historico.slice(0, limite).map((o) => (
                  <LinhaOrcamento
                    key={o.id}
                    o={{ ...o, qtdDoCliente: 1 }}
                    aberto={aberto === o.id}
                    painel={painel.id === o.id ? painel.qual : null}
                    mostrarVendedor={mostrarVendedor}
                    motivos={motivos}
                    hoje={hoje}
                    salvando={salvando}
                    acoes={acoes}
                  />
                ))}
              </div>
              {historico.length > limite && (
                <div className="px-5 pb-5">
                  <button className="btn-ghost sem-impressao mt-3" onClick={() => setLimite((n) => n + 30)}>
                    Mostrar mais ({numero(historico.length - limite)} restantes)
                  </button>
                </div>
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
          setAba("mesa");
        }}
        aoVerMotivo={(m) => {
          setAba("historico");
          setSituacaoHist("perdido");
          setMotivoHist(m);
          setBusca("");
          setLimite(30);
          setPlacarAberto(false);
        }}
      />

      <BarraDesfazer desfazer={desfazer} aoDesfazer={aplicarDesfazer} />
    </div>
  );
}
