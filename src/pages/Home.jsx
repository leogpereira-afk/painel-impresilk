// Home: a CAPA da Impresilk. Duas camadas, porque sao coisas diferentes:
//
//   1. Painel de Gestao -- os quatro modulos do proprio painel, cada um com o
//      numero principal ja calculado. Conclusao primeiro: o CEO ve o estado
//      antes de clicar.
//   2. Sistemas -- portas para fora deste app (RH, DRE) e a configuracao. Nao
//      tem numero porque nao sao deste painel; sao atalhos de navegacao.
//
// Misturar as duas camadas no mesmo grid faria o RH parecer um KPI e o Contas
// Atrasadas parecer um link.

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Wallet,
  Package,
  FileText,
  ArrowRight,
  ArrowUpRight,
  Users,
  Settings,
  BarChart3,
} from "lucide-react";
import { useApp } from "../config/store.jsx";
import { calcContasAtrasadas } from "../lib/calc/contasAtrasadas.js";
import { calcFluxoCaixa } from "../lib/calc/fluxoCaixa.js";
import { calcProdutos } from "../lib/calc/produtos.js";
import { calcOrcamentos } from "../lib/calc/orcamentos.js";
import { moeda, pct } from "../lib/format.js";
import { StatusLine, CarregandoModulo, ErroModulo } from "../components/ui.jsx";

function saudacao() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

export default function Home() {
  const { config, dados, overridesRecebiveis, overridesOrcamentos, pronto, erro, recarregar } = useApp();
  const navigate = useNavigate();

  const vm = useMemo(() => {
    if (!dados) return null;
    return {
      contas: calcContasAtrasadas(dados.recebiveis, overridesRecebiveis, config, dados.dsoHist),
      fluxo: calcFluxoCaixa(
        { pagar: dados.pagar, recebiveis: dados.recebiveis, bancos: dados.bancos },
        config
      ),
      produtos: calcProdutos(dados.ordens, dados.catalogo, config),
      orcamentos: calcOrcamentos(dados.orcamentos, overridesOrcamentos, config),
    };
  }, [dados, config, overridesRecebiveis, overridesOrcamentos]);

  if (erro) return <ErroModulo mensagem={erro} aoTentar={recarregar} />;
  if (!pronto || !vm) return <CarregandoModulo />;

  const { contas, fluxo, produtos, orcamentos } = vm;
  const menor15 = fluxo.kpis.menorSaldo15;
  const abaixoColchao = menor15 < config.parametros.colchaoMinimo;
  const lider = produtos.lider;

  const cards = [
    {
      icone: AlertTriangle,
      titulo: "Contas Atrasadas",
      valor: moeda(contas.kpis.totalAtrasado),
      descricao: `${contas.kpis.qtd} titulos em aberto`,
      stats: [
        { rotulo: "Pendentes", valor: `${contas.kpis.pendentesQtd} · ${moeda(contas.kpis.pendentesValor)}` },
        { rotulo: "Reincidentes", valor: `${contas.kpis.reincidentesQtd} · ${moeda(contas.kpis.reincidentesValor)}` },
      ],
      status:
        contas.kpis.totalAtrasado > 0
          ? { tom: "bad", texto: `Maior atraso: ${contas.kpis.maiorAtrasoDias} dias` }
          : { tom: "ok", texto: "Nada atrasado" },
      to: "/contas-atrasadas",
    },
    {
      icone: Wallet,
      titulo: "Fluxo de Caixa",
      valor: moeda(menor15),
      descricao: "menor saldo previsto em 15 dias",
      stats: [
        { rotulo: "Saldo de hoje", valor: moeda(fluxo.kpis.saldoHoje) },
        { rotulo: "Colchao minimo", valor: moeda(fluxo.kpis.colchao) },
      ],
      status: abaixoColchao
        ? { tom: "bad", texto: `${fluxo.kpis.diasAbaixo} dias abaixo do colchao` }
        : { tom: "ok", texto: "Caixa acima do colchao" },
      to: "/fluxo-caixa",
    },
    {
      icone: Package,
      titulo: "Produtos",
      valor: lider ? lider.nome : "-",
      descricao: "lider em faturamento",
      stats: [
        { rotulo: "Desde janeiro", valor: lider ? `${lider.varFat >= 0 ? "+" : ""}${lider.varFat}%` : "-" },
        { rotulo: "Faturamento no ano", valor: lider ? moeda(lider.faturamento) : "-" },
      ],
      status: produtos.liderEmQueda
        ? { tom: "bad", texto: "Lider em queda, atencao" }
        : { tom: "ok", texto: "Lider em alta" },
      to: "/produtos",
    },
    {
      icone: FileText,
      titulo: "Orcamentos",
      valor: moeda(orcamentos.kpis.naMesaValor),
      descricao: `${orcamentos.kpis.naMesaQtd} orcamentos na mesa`,
      stats: [
        { rotulo: "Conversao do time", valor: pct(orcamentos.kpis.conversao) },
        { rotulo: "Perdido no periodo", valor: moeda(orcamentos.kpis.valorPerdido) },
      ],
      status:
        orcamentos.kpis.conversao >= 40
          ? { tom: "ok", texto: `Conversao de ${orcamentos.kpis.conversao}%` }
          : { tom: "warn", texto: `Conversao de ${orcamentos.kpis.conversao}%` },
      to: "/orcamentos",
    },
  ];

  // Portas para fora do painel. `href` = outro sistema (abre em nova aba, o
  // painel continua aberto atras); `to` = rota interna; `embreve` = ainda nao
  // existe, e o cartao diz isso em vez de fingir que funciona.
  const sistemas = [
    {
      icone: BarChart3,
      titulo: "DRE",
      descricao: "Resultado no regime de caixa",
      href: "https://impresilk-dre.netlify.app/",
    },
    {
      icone: Users,
      titulo: "RH",
      descricao: "Pessoas, ponto e folha",
      href: "https://impresilkrh.netlify.app/",
    },
    {
      icone: Settings,
      titulo: "Configuracoes",
      descricao: "Regras, metas e equipe",
      to: "/configuracoes",
    },
  ];

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {saudacao()}, aqui esta o resumo
        </h1>
        <p className="mt-1 text-slate-500">Os quatro pontos que exigem sua atencao hoje.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
        {cards.map((c) => (
          <button
            key={c.titulo}
            onClick={() => navigate(c.to)}
            className="card card-hover group flex flex-col p-6 text-left"
          >
            <div className="flex items-start justify-between">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand/10 text-brand">
                <c.icone size={24} strokeWidth={2.2} />
              </span>
              <ArrowRight
                size={20}
                className="text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-brand"
              />
            </div>

            <h2 className="mt-4 font-display text-base font-semibold text-slate-900">{c.titulo}</h2>
            <p className="kpi-value mt-1 text-2xl text-slate-900 sm:text-[1.7rem]">{c.valor}</p>
            <p className="mt-0.5 text-sm text-slate-500">{c.descricao}</p>

            <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-4" style={{ borderColor: "var(--hairline)" }}>
              {c.stats.map((s) => (
                <div key={s.rotulo}>
                  <p className="label mb-0.5">{s.rotulo}</p>
                  <p className="tnum text-sm font-semibold text-slate-800">{s.valor}</p>
                </div>
              ))}
            </div>

            <div className="mt-4">
              <StatusLine tom={c.status.tom}>{c.status.texto}</StatusLine>
            </div>
          </button>
        ))}
      </div>

      {/* Sistemas: atalhos, nao KPIs. Cartoes menores e sem numero, para nao
          competirem com os quatro modulos acima. */}
      <div>
        <h2 className="font-display text-lg font-semibold text-slate-900">Sistemas</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Os outros sistemas da Impresilk e as regras deste painel.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {sistemas.map((s) => {
            const conteudo = (
              <>
                <div className="flex items-start justify-between">
                  <span
                    className={`grid h-11 w-11 place-items-center rounded-xl ${
                      s.embreve ? "bg-slate-100 text-slate-400" : "bg-brand/10 text-brand"
                    }`}
                  >
                    <s.icone size={22} strokeWidth={2.2} />
                  </span>
                  {s.embreve ? (
                    <span className="chip">em breve</span>
                  ) : s.href ? (
                    <ArrowUpRight
                      size={18}
                      className="text-slate-300 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand"
                    />
                  ) : (
                    <ArrowRight
                      size={18}
                      className="text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-brand"
                    />
                  )}
                </div>
                <h3
                  className={`mt-3 font-display text-base font-semibold ${
                    s.embreve ? "text-slate-500" : "text-slate-900"
                  }`}
                >
                  {s.titulo}
                </h3>
                <p className="mt-0.5 text-sm text-slate-500">{s.descricao}</p>
                {s.href && (
                  <p className="mt-2 text-xs text-slate-400">abre em outra aba</p>
                )}
              </>
            );

            const classe = "card group flex flex-col p-5 text-left";

            if (s.embreve) {
              return (
                <div
                  key={s.titulo}
                  className={`${classe} cursor-default border-dashed opacity-80`}
                  title="Ainda nao construido"
                >
                  {conteudo}
                </div>
              );
            }
            if (s.href) {
              return (
                <a
                  key={s.titulo}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${classe} card-hover`}
                >
                  {conteudo}
                </a>
              );
            }
            return (
              <button
                key={s.titulo}
                onClick={() => navigate(s.to)}
                className={`${classe} card-hover`}
              >
                {conteudo}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
