// Home: apenas os quatro cards clicaveis, cada um com o numero principal, uma
// linha de status e duas informacoes de apoio. Conclusao primeiro.

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Wallet, Package, FileText, ArrowRight } from "lucide-react";
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
      contas: calcContasAtrasadas(dados.recebiveis, overridesRecebiveis, config),
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

  return (
    <div className="space-y-8">
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
    </div>
  );
}
