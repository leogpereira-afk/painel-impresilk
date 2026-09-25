/* A ABA "VENDAS EM ABERTO" de Contas Atrasadas.
 *
 * Pedido do Léo (23/09/2026): "um vendas em aberto, são pedidos que falta ser
 * quitadas, com seus saldos e o saldo total em atraso", "é pra considerar os
 * serviços normais, todos que estiverem rodando na empresa, só não vai entrar o
 * que estiver quitado" e "um seletor de empresas onde eu coloco e tiro quem eu
 * quiser".
 *
 * A conta mora em src/lib/calc/vendasEmAberto.js (com teste) e usa a MESMA régua
 * de pago e em aberto de Campanhas. Esta tela só pede os dados, recorta e
 * desenha. Os dados vêm da porta vendasEmAberto sob demanda: só quem abre a aba
 * paga o download.
 */
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, Search, X } from "lucide-react";
import { lerVendasEmAberto } from "../services/permutas.js";
import {
  vendasEmAberto, totaisDe, empresasDe, ordenarVendas, ORDENS_VENDAS, paginarEmpresas,
} from "../lib/calc/vendasEmAberto.js";
import { moedaCheia, numero, dataLonga, ymdLocal } from "../lib/format.js";
import { Selo, FaixaNumeros, LinhaLista } from "./lista.jsx";
import { Card, SectionTitle, Empty, CarregandoModulo, BotaoPDF, CabecalhoImpressao } from "./ui.jsx";
import { Secao } from "./trocas.jsx";

/* A ESCOLHA DAS EMPRESAS fica neste aparelho: quem tirou uma empresa da conta
   abre a aba de novo e ela continua fora. Guardamos quem SAIU (não quem entra):
   empresa nova com venda em aberto aparece sozinha, em vez de ficar escondida
   por não estar numa lista antiga. */
const CHAVE_FORA = "vendas_aberto_empresas_fora";
const CHAVE_SECOES = "vendas_aberto_secoes";
const lerLS = (chave, padrao) => {
  try { const v = JSON.parse(localStorage.getItem(chave) || "null"); return v ?? padrao; } catch { return padrao; }
};
const gravarLS = (chave, v) => { try { localStorage.setItem(chave, JSON.stringify(v)); } catch { /* aba anônima */ } };

const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const POR_PAGINA = 100;

const SELO_ESTADO = {
  atraso: { tom: "bad", rotulo: (l) => `${numero(l.diasAtraso)} ${l.diasAtraso === 1 ? "dia" : "dias"} em atraso` },
  aVencer: { tom: "brand", rotulo: () => "a vencer" },
  parcialSemTitulo: { tom: "warn", rotulo: () => "paga em parte · resto sem título" },
  semTitulo: { tom: "warn", rotulo: () => "sem título no ERP" },
};

/* UMA VENDA NÃO QUITADA. A lista de cima e as O.S. abertas debaixo de cada
   empresa usam esta mesma linha: duas cópias da régua de selo e de saldo saem
   de sincronia caladas. Dentro da empresa o nome do cliente se repetiria em
   toda linha, então o título passa a ser o número da O.S. */
function LinhaVenda({ l, corte, dentroDaEmpresa = false }) {
  const sel = SELO_ESTADO[l.estado] || SELO_ESTADO.semTitulo;
  const partes = [
    `venda líquida ${moedaCheia(l.valor)}`,
    l.descontoVenda > 0 ? `${moedaCheia(l.descontoVenda)} de desconto já abatido` : "",
    l.recebido > 0 ? `${moedaCheia(l.recebido)} recebido` : "",
    l.atraso > 0 ? `${moedaCheia(l.atraso)} em atraso` : "",
    l.aVencer > 0 ? `${moedaCheia(l.aVencer)} a vencer` : "",
    l.antigo > 0 ? `${moedaCheia(l.antigo)} vencido antes de ${dataLonga(corte)}` : "",
    l.semTitulo > 0 ? `${moedaCheia(l.semTitulo)} sem título` : "",
  ].filter(Boolean);
  const titulo = dentroDaEmpresa ? `O.S. ${l.numero}` : l.cliente;
  const detalhe = [
    dentroDaEmpresa ? "" : `O.S. ${l.numero}`,
    l.data ? `vendida em ${dataLonga(l.data)}` : "",
    l.vendedor || "sem vendedor",
  ].filter(Boolean).join(" · ");
  return (
    <LinhaLista tom={sel.tom === "bad" ? "bad" : sel.tom === "warn" ? "warn" : "neutral"}>
      {/* O texto guarda 10rem: sem isso o valor, que não encolhe, espremia o
          número da O.S. até sumir no celular. Sem espaço, o valor desce. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[10rem] flex-1">
          <p className="truncate font-display text-[15px] font-semibold leading-tight text-slate-900">{titulo}</p>
          <p className="truncate text-sm text-slate-500">{detalhe}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Selo tom={sel.tom}>{sel.rotulo(l)}</Selo>
            {l.compartilhado && (
              <span className="text-xs text-slate-500" title="Um título do ERP cobra esta e outras O.S.; o valor desta foi repartido pelo valor de cada uma.">
                * valor repartido{l.incerto ? " por igual (aproximado)" : ""}
              </span>
            )}
            {l.excesso > 0 && (
              <span className="text-xs text-warn-700" title="O título aberto no ERP é maior que o valor da venda. O saldo mostra o que o ERP cobra; confira a venda no ERP.">
                título {moedaCheia(l.excesso)} maior que a venda, conferir no ERP
              </span>
            )}
            {l.numeroRepetido && (
              <span className="text-xs text-warn-700" title="O ERP tem mais de uma O.S. com este número; os valores foram somados numa venda só.">
                número repetido no ERP ({numero(l.ids.length)} O.S.)
              </span>
            )}
          </div>
        </div>
        <div className="ml-auto max-w-full shrink-0">
          <div className="sem-impressao text-right"><p className="tnum text-[17px] font-semibold text-slate-900">{moedaCheia(l.saldo)}</p><p className="tnum max-w-xl text-xs text-slate-500">{partes.join(" · ")}</p></div>
          <span className="apenas-impressao text-right text-sm">
            {moedaCheia(l.saldo)}<br /><small>{partes.join(" · ")}</small>
          </span>
        </div>
      </div>
    </LinhaLista>
  );
}

export default function VendasEmAberto({ ordens, ordensNegadas, corte, totalAtrasadoTitulos, atualizadoEm }) {
  const [estado, setEstado] = useState({ carregando: true, erro: "", resposta: null });
  const [fora, setFora] = useState(() => new Set(lerLS(CHAVE_FORA, [])));
  const [seletorAberto, setSeletorAberto] = useState(false);
  const [buscaEmpresa, setBuscaEmpresa] = useState("");
  const [busca, setBusca] = useState("");
  const [recorte, setRecorte] = useState("todas"); // todas | atraso | aVencer | semTitulo
  const [ordem, setOrdem] = useState("saldo");
  const [mostrar, setMostrar] = useState(POR_PAGINA);
  const [paginaEmpresa, setPaginaEmpresa] = useState(1);
  const [tamanhoPagina, setTamanhoPagina] = useState(20);
  const [buscaNoGrupo, setBuscaNoGrupo] = useState("");
  const [secoes, setSecoes] = useState(() => lerLS(CHAVE_SECOES, { empresas: false }));
  const [empresasAbertas, setEmpresasAbertas] = useState(() => new Set());

  useEffect(() => {
    if (ordensNegadas) { setEstado({ carregando: false, erro: "", resposta: null }); return; }
    let vivo = true;
    setEstado({ carregando: true, erro: "", resposta: null });
    lerVendasEmAberto()
      .then((r) => vivo && setEstado({ carregando: false, erro: "", resposta: r }))
      .catch((e) => vivo && setEstado({ carregando: false, erro: e.message || "Não foi possível carregar as vendas.", resposta: null }));
    return () => { vivo = false; };
  }, [ordensNegadas, atualizadoEm, ordens]);

  const hoje = ymdLocal(new Date());
  const calc = useMemo(
    () => (estado.resposta ? vendasEmAberto(ordens || [], estado.resposta, { hoje, corte }) : null),
    [estado.resposta, ordens, hoje, corte]
  );
  const empresas = useMemo(() => empresasDe(calc?.linhas || []), [calc]);
  const selecionadas = useMemo(() => (calc?.linhas || []).filter((l) => !fora.has(l.empresa)), [calc, fora]);
  const tot = useMemo(() => totaisDe(selecionadas), [selecionadas]);

  const lista = useMemo(() => {
    const q = norm(busca.trim());
    const f = selecionadas.filter((l) => {
      if (recorte === "atraso" && !(l.atraso > 0)) return false;
      if (recorte === "aVencer" && !(l.aVencer > 0)) return false;
      if (recorte === "semTitulo" && !(l.semTitulo > 0)) return false;
      if (q && !norm(`${l.cliente} ${l.numero} ${l.vendedor} ${l.cnpj}`).includes(q)) return false;
      return true;
    });
    return ordenarVendas(f, ordem);
  }, [selecionadas, busca, recorte, ordem]);
  const somaLista = useMemo(() => totaisDe(lista), [lista]);
  // As vendas de cada empresa, na ordem escolhida, para abrir debaixo do nome.
  const vendasDaEmpresa = useMemo(() => {
    const m = new Map();
    for (const l of lista) {
      if (!m.has(l.empresa)) m.set(l.empresa, []);
      m.get(l.empresa).push(l);
    }
    return m;
  }, [lista]);
  const empresasNoRecorte = useMemo(() => empresasDe(lista).filter((e) =>
    !buscaNoGrupo.trim() || norm(`${e.nome} ${e.cnpj}`).includes(norm(buscaNoGrupo.trim()))), [lista, buscaNoGrupo]);
  const paginacao = paginarEmpresas(empresasNoRecorte, paginaEmpresa, tamanhoPagina);
  useEffect(() => { setPaginaEmpresa(1); }, [busca, recorte, fora, buscaNoGrupo, tamanhoPagina]);

  const alterarFora = (novo) => { setFora(novo); gravarLS(CHAVE_FORA, [...novo]); setMostrar(POR_PAGINA); };
  const alternarEmpresa = (chave) => {
    const n = new Set(fora);
    if (n.has(chave)) n.delete(chave); else n.add(chave);
    alterarFora(n);
  };
  const alternarAberta = (chave) => {
    const n = new Set(empresasAbertas);
    if (n.has(chave)) n.delete(chave); else n.add(chave);
    setEmpresasAbertas(n);
  };
  const alternarSecao = (id) => {
    const n = { ...secoes, [id]: !secoes[id] };
    setSecoes(n); gravarLS(CHAVE_SECOES, n);
  };

  if (ordensNegadas) {
    return (
      <Card className="flex items-start gap-2 text-sm text-warn-700">
        <AlertTriangle size={15} className="mt-0.5 shrink-0" />
        As vendas em aberto dependem das O.S., que vêm do acesso a Campanhas ou Permutas. Ele não está liberado para
        esta conta: peça à direção para liberar.
      </Card>
    );
  }
  if (estado.carregando) return <CarregandoModulo />;
  if (estado.erro || !calc) {
    return (
      <Card className="flex items-start gap-2 text-sm text-bad-700">
        <AlertTriangle size={15} className="mt-0.5 shrink-0" />
        {estado.erro || "Não foi possível montar as vendas em aberto."} Nada foi calculado: esta aba não mostra zero
        quando não conseguiu ler os dados.
      </Card>
    );
  }

  const nEmpresas = empresas.length;
  const nDentro = empresas.filter((e) => !fora.has(e.chave)).length;
  const filtrandoEmpresas = fora.size > 0;
  const temFiltro = !!busca || recorte !== "todas";
  /* O ATRASO DAQUI FECHA COM A ABA "Títulos e meses": é o mesmo dinheiro,
     parcela a parcela. Só não fecha quando há parcela vencida que não cobra
     nenhuma venda desta lista (título sem O.S., venda em permuta ou de antes do
     período). Sem filtro nenhum, a diferença é dita com o nome. */
  const difTitulos = !filtrandoEmpresas && !temFiltro && Number.isFinite(totalAtrasadoTitulos)
    ? Math.round((totalAtrasadoTitulos - tot.atraso) * 100) / 100 : 0;
  const empresasVisiveis = empresas.filter((e) => !buscaEmpresa || norm(`${e.nome} ${e.cnpj}`).includes(norm(buscaEmpresa)));
  const f = calc.fora;

  return (
    <div className="space-y-4">
      <CabecalhoImpressao
        titulo="Vendas em aberto"
        atualizadoEm={atualizadoEm}
        linhas={[
          `${numero(tot.n)} vendas não quitadas · saldo ${moedaCheia(tot.saldo)} · em atraso ${moedaCheia(tot.atraso)}`,
          filtrandoEmpresas ? `${numero(nDentro)} de ${numero(nEmpresas)} empresas na conta` : "todas as empresas",
          temFiltro ? `recorte da lista: ${recorte !== "todas" ? { atraso: "em atraso", aVencer: "a vencer", semTitulo: "sem título" }[recorte] : ""}${busca ? ` busca "${busca}"` : ""}` : "",
        ]}
      />

      <SectionTitle
        titulo="Vendas em aberto"
        sub="Vendas com saldo a receber, entregues ou ainda em produção. Descontos já abatidos e pedidos de retrabalho fora da conta."
        acao={<BotaoPDF titulo="Gera um PDF com as vendas em aberto do recorte que está na tela" />}
      />

      {f.semTipo.n > 0 && <p role="status" className="rounded-xl border border-warn-200 bg-warn-50 p-4 text-sm text-warn-700">
        Apuração parcial: falta ler o tipo de {numero(f.semTipo.n)} pedidos do Mubisys. Eles ficam fora do saldo até ser possível distinguir venda de retrabalho.
      </p>}

      <div className="sem-impressao">
        <FaixaNumeros
          ativo={recorte}
          aoEscolher={(id) => { setRecorte(recorte === id && id !== "todas" ? "todas" : id); setMostrar(POR_PAGINA); }}
          celulas={[
            { id: "todas", rotulo: "Saldo em aberto", valor: moedaCheia(tot.saldo), sub: `${numero(tot.n)} vendas não quitadas`, curto: `${numero(tot.n)} vendas` },
            { id: "atraso", rotulo: "Saldo em atraso", valor: moedaCheia(tot.atraso), cor: tot.atraso > 0 ? "text-bad-700" : undefined,
              sub: `${numero(tot.nAtraso)} vendas com parcela vencida`, curto: `${numero(tot.nAtraso)} vendas` },
            { id: "aVencer", rotulo: "A vencer (até 90 dias)", valor: moedaCheia(tot.aVencer), sub: `${numero(tot.nAVencer)} vendas com parcela no prazo`, curto: `${numero(tot.nAVencer)} vendas` },
            { id: "semTitulo", rotulo: "Sem título no ERP", valor: moedaCheia(tot.semTitulo), cor: tot.semTitulo > 0 ? "text-warn-700" : undefined,
              sub: `${numero(tot.nSemTitulo)} vendas com saldo sem título identificado`, curto: `${numero(tot.nSemTitulo)} vendas` },
          ]}
        />
      </div>

      {/* O SELETOR DE EMPRESAS: tira e põe quem entra na conta. Os números do
          topo, a lista e o PDF seguem a escolha. */}
      <Card className="space-y-3 sem-impressao">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <label className="mb-1 block text-xs text-slate-500" htmlFor="va-busca">Cliente, O.S. ou vendedor</label>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input id="va-busca" className="input pl-9" placeholder="Procurar…" value={busca}
                onChange={(e) => { setBusca(e.target.value); setMostrar(POR_PAGINA); }} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500" htmlFor="va-ordem">Ordenar por</label>
            <select id="va-ordem" className="input w-52" value={ordem} onChange={(e) => setOrdem(e.target.value)}>
              {ORDENS_VENDAS.map((o) => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
            </select>
          </div>
          <div>
            <span className="mb-1 block text-xs text-slate-500">Empresas</span>
            <button type="button" className="input w-52 text-left" aria-expanded={seletorAberto}
              onClick={() => setSeletorAberto(!seletorAberto)}>
              {filtrandoEmpresas ? `${numero(nDentro)} de ${numero(nEmpresas)} empresas` : `Todas (${numero(nEmpresas)})`}
            </button>
          </div>
          {temFiltro && (
            <button type="button" className="h-10 text-sm text-brand-700 hover:underline"
              onClick={() => { setBusca(""); setRecorte("todas"); setMostrar(POR_PAGINA); }}>
              Limpar busca e recorte
            </button>
          )}
        </div>

        {seletorAberto && (
          <div className="rounded-xl border p-3" style={{ borderColor: "var(--hairline)" }}>
            <div className="flex flex-wrap items-center gap-2">
              <input className="input min-w-48 flex-1" placeholder="Procurar empresa…" value={buscaEmpresa}
                onChange={(e) => setBuscaEmpresa(e.target.value)} aria-label="Procurar empresa" />
              <button type="button" className="h-10 rounded-lg border px-3 text-sm" style={{ borderColor: "var(--hairline)" }}
                onClick={() => alterarFora(new Set())}>Marcar todas</button>
              <button type="button" className="h-10 rounded-lg border px-3 text-sm" style={{ borderColor: "var(--hairline)" }}
                onClick={() => alterarFora(new Set(empresas.map((e) => e.chave)))}>Desmarcar todas</button>
              <button type="button" className="grid h-10 w-10 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
                aria-label="Fechar o seletor de empresas" onClick={() => setSeletorAberto(false)}><X size={16} /></button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Desmarque quem não deve entrar na conta. A escolha fica guardada neste aparelho.
            </p>
            <ul className="mt-2 max-h-80 overflow-y-auto">
              {empresasVisiveis.map((e) => (
                <li key={e.chave}>
                  <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-slate-50">
                    <input type="checkbox" className="h-4 w-4" checked={!fora.has(e.chave)} onChange={() => alternarEmpresa(e.chave)} />
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{e.nome}</span>
                    <span className="shrink-0 text-xs text-slate-500">{numero(e.n)} {e.n === 1 ? "venda" : "vendas"}</span>
                    <span className="w-28 shrink-0 text-right text-sm tabular-nums text-slate-700">{moedaCheia(e.saldo)}</span>
                  </label>
                </li>
              ))}
              {!empresasVisiveis.length && <li className="px-2 py-3 text-sm text-slate-500">Nenhuma empresa com esse nome.</li>}
            </ul>
          </div>
        )}
      </Card>

      <Card className="p-0">
        {lista.length ? (
          <>
            <p className="px-4 pt-3 text-xs text-slate-500">
              {numero(lista.length)} {lista.length === 1 ? "venda" : "vendas"} · saldo {moedaCheia(somaLista.saldo)}
              {somaLista.atraso > 0 ? ` · ${moedaCheia(somaLista.atraso)} em atraso` : ""}
            </p>
            {lista.slice(0, mostrar).map((l) => <LinhaVenda key={l.id} l={l} corte={corte} />)}
            <div className="apenas-impressao">{lista.slice(mostrar).map((l) => <LinhaVenda key={l.id} l={l} corte={corte} />)}</div>
            {lista.length > mostrar && (
              <div className="border-t px-4 py-3 text-center sem-impressao" style={{ borderColor: "var(--hairline)" }}>
                <button type="button" className="h-10 rounded-lg border px-4 text-sm text-slate-700 hover:bg-slate-50"
                  style={{ borderColor: "var(--hairline)" }} onClick={() => setMostrar(mostrar + POR_PAGINA)}>
                  Mostrar mais {numero(Math.min(POR_PAGINA, lista.length - mostrar))} de {numero(lista.length - mostrar)}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="p-4">
            <Empty>
              {calc.linhas.length
                ? "Nenhuma venda neste recorte. Limpe a busca, o recorte ou marque mais empresas."
                : "Nenhuma venda com saldo apurado nesta base. Confira abaixo as exclusões e pendências."}
            </Empty>
          </div>
        )}
      </Card>

      <Secao
        id="empresas"
        titulo="Por empresa"
        sub="Veja as empresas do recorte acima e abra cada uma para conferir as O.S. A troca de página não altera os totais."
        aberta={!!secoes.empresas}
        aoAlternar={alternarSecao}
      >
        <div className="flex flex-wrap items-end gap-3 sem-impressao">
          <label className="min-w-56 flex-1 text-xs text-slate-500">Buscar nesta lista de empresas
            <input className="input mt-1" placeholder="Nome ou CNPJ…" value={buscaNoGrupo} onChange={(e) => setBuscaNoGrupo(e.target.value)} />
          </label>
          <label className="text-xs text-slate-500">Empresas por página
            <select className="input mt-1 w-36" value={tamanhoPagina} onChange={(e) => setTamanhoPagina(Number(e.target.value))}>
              {[10, 20, 30, 50].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
        <PaginacaoEmpresas dados={paginacao} aoMudar={setPaginaEmpresa} />
        <ul className="divide-y sem-impressao" style={{ borderColor: "var(--hairline)" }}>
          {paginacao.itens.map((e) => {
            const aberta = empresasAbertas.has(e.chave);
            return (
              <li key={e.chave}>
                <button type="button" aria-expanded={aberta} onClick={() => alternarAberta(e.chave)}
                  className="flex min-h-10 w-full items-center gap-3 py-2 text-left text-sm hover:bg-slate-50">
                  <ChevronDown size={15}
                    className={`shrink-0 text-slate-400 transition-transform ${aberta ? "" : "-rotate-90"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-slate-800">{e.nome}</span>
                    {/* No celular a contagem desce para baixo do nome, para o nome não sumir. */}
                    <span className="block text-xs text-slate-500 sm:hidden">
                      {numero(e.n)} {e.n === 1 ? "venda" : "vendas"}
                      {e.atraso > 0 && <span className="text-bad-700"> · {moedaCheia(e.atraso)} em atraso</span>}
                    </span>
                  </span>
                  <span className="hidden shrink-0 text-xs text-slate-500 sm:inline">{numero(e.n)} {e.n === 1 ? "venda" : "vendas"}</span>
                  {e.atraso > 0 && <span className="hidden shrink-0 text-xs text-bad-700 sm:inline">{moedaCheia(e.atraso)} em atraso</span>}
                  <span className="w-28 shrink-0 text-right tabular-nums text-slate-800">{moedaCheia(e.saldo)}</span>
                </button>
                {aberta && (
                  <div className="mb-2 ml-2 overflow-hidden rounded-xl border sm:ml-6" style={{ borderColor: "var(--hairline)" }}>
                    {(vendasDaEmpresa.get(e.chave) || []).map((l) => (
                      <LinhaVenda key={l.id} l={l} corte={corte} dentroDaEmpresa />
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {!paginacao.total && <p className="text-sm text-slate-500">Nenhuma empresa neste recorte.</p>}
        {paginacao.paginas > 1 && <PaginacaoEmpresas dados={paginacao} aoMudar={setPaginaEmpresa} />}
        <div className="apenas-impressao">
          <p>{numero(empresasNoRecorte.length)} empresas{buscaNoGrupo ? ` · busca: ${buscaNoGrupo}` : ""}</p>
          {empresasNoRecorte.map((e) => <p key={e.chave} className="flex justify-between gap-3 border-b py-2 text-sm"><span>{e.nome} · {e.n} vendas</span><span>{moedaCheia(e.saldo)}</span></p>)}
        </div>
      </Secao>

      {calc.conferir.length > 0 && <details className="rounded-xl border border-warn-200 bg-warn-50 p-4 text-sm text-warn-700">
        <summary className="cursor-pointer font-medium">Conferir baixas: {numero(f.conferencia.n)} vendas · {moedaCheia(f.conferencia.valor)} fora do saldo de cobrança</summary>
        <p className="my-2">Diferenças de até 2% após pagamentos, sem título aberto. Podem ser descontos, mas a base não informa o motivo. Não foram declaradas como dívida nem como quitação confirmada.</p>
        {calc.conferir.map((l) => <p key={l.numero} className="border-t py-2">O.S. {l.numero} · {l.cliente}: líquido {moedaCheia(l.valor)}, recebido {moedaCheia(l.recebido)}, diferença {moedaCheia(l.diferenca)}</p>)}
      </details>}
      <p className="text-xs text-slate-500">Cobertura atual: O.S. desde 01/01/2025. O saldo usa o valor líquido de cada venda; desconto já concedido não entra como dívida. Esta base não confirma descontos negociados apenas na baixa.</p>

      {/* O QUE FICOU DE FORA, CONTADO: nenhuma venda some calada. */}
      <div className="space-y-1 text-xs text-slate-500">
        <p>
          Fora da lista: {numero(f.quitadas.n)} quitadas
          {f.retrabalho.n ? ` · ${numero(f.retrabalho.n)} pedidos de retrabalho (${moedaCheia(f.retrabalho.valor)})` : ""}
          {f.permuta.n ? ` · ${numero(f.permuta.n)} acertadas em permuta (${moedaCheia(f.permuta.valor)})` : ""}

          {f.valorZero.n ? ` · ${numero(f.valorZero.n)} de valor zero` : ""}.
        </p>
        {(f.semDado.n > 0 || f.naoConsultadas.n > 0) && (
          <p className="text-warn-700">
            {f.semDado.n ? `${numero(f.semDado.n)} vendas (${moedaCheia(f.semDado.valor)}) são anteriores ao registro de pagamentos (${dataLonga(calc.desdeDados)}) e não dá para afirmar se estão quitadas. ` : ""}
            {f.naoConsultadas.n ? `${numero(f.naoConsultadas.n)} vendas (${moedaCheia(f.naoConsultadas.valor)}) chegaram depois da última leitura e ficam para a próxima.` : ""}
          </p>
        )}
        {Math.abs(difTitulos) > 0.05 && (
          <p>
            O saldo em atraso desta aba ({moedaCheia(tot.atraso)}) difere do total atrasado da aba Títulos e meses
            ({moedaCheia(totalAtrasadoTitulos)}) em {moedaCheia(Math.abs(difTitulos))}: são parcelas vencidas que não
            foram conciliadas nesta lista. É preciso conferir os vínculos, permutas e a cobertura do período no ERP.
          </p>
        )}
        <p>
          "A vencer" mostra as parcelas que vencem nos próximos 90 dias: é o horizonte que o painel busca no ERP.
          "Sem título" é saldo sem cobrança identificada nesta consulta; não comprova ausência de nota fiscal. Títulos além desse horizonte e pagamentos sem vínculo com a O.S. precisam ser conferidos no ERP.
        </p>
      </div>
    </div>
  );
}

function PaginacaoEmpresas({ dados: p, aoMudar }) {
  return <nav aria-label="Páginas de empresas" className="flex flex-wrap items-center justify-between gap-3 py-2 sem-impressao">
    <span role="status" className="text-xs text-slate-500">Empresas {p.de}–{p.ate} de {numero(p.total)}</span>
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="btn-ghost disabled:opacity-40" disabled={p.pagina === 1} onClick={() => aoMudar(p.pagina - 1)}>Anterior</button>
      <label className="flex items-center gap-2 text-sm text-slate-600">Página
        <select aria-label="Página de empresas" className="input w-20" value={p.pagina} onChange={(e) => aoMudar(Number(e.target.value))}>
          {Array.from({ length: p.paginas }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
        </select>de {p.paginas}
      </label>
      <button type="button" className="btn-ghost disabled:opacity-40" disabled={p.pagina === p.paginas} onClick={() => aoMudar(p.pagina + 1)}>Próxima</button>
    </div>
  </nav>;
}
