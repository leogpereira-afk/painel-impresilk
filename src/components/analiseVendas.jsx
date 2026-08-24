/* AS TRÊS ABAS DE ANÁLISE DE VENDAS da tela de Campanhas: Vendedores,
 * Clientes e Produtos (pedido do dono, 24/08 — "seguindo a mesma linha de
 * inteligência" da aba Anos).
 *
 * A mesma arquitetura: a soma mora NO BANCO (as RPCs de 20260824g), aqui só
 * se pede o recorte e se desenha; todo quadro recolhe e a escolha persiste;
 * corte nunca é mudo; zero só é resultado quando foi medido.
 *
 * Vive em arquivo próprio porque Campanhas.jsx já passa de 3.000 linhas — a
 * página monta estas abas e guarda só o estado de qual está aberta.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, X, Trash2, Link2, Plus, Pencil } from "lucide-react";
import {
  lerVendedoresPanorama, lerVendedorDetalhe, lerClientesAbc, lerClienteDetalhe,
  lerProdutosPanorama, lerProdutoDetalhe, lerGrupos, salvarGrupo, removerGrupo,
  buscarClientes,
} from "../services/campanhas.js";
import { mesesPorAno } from "../lib/calc/campanhas.js";
import { Card, Empty } from "./ui.jsx";
import { dinheiro, dataDaOS, hojeISO, novoId, Aviso, Secao } from "./trocas.jsx";
import { MES_CURTO, rotuloMes, mil, BarrasAno } from "./barras.jsx";

/* Persistência das seções por aba, no padrão da casa: aberto por padrão, e só
   o que a pessoa fechou é gravado. */
function useSecoes(chaveStorage) {
  const [abertas, setAbertas] = useState(() => {
    try { return JSON.parse(localStorage.getItem(chaveStorage) || "{}"); } catch { return {}; }
  });
  const alternar = useCallback((id) => {
    setAbertas((a) => {
      const novo = { ...a, [id]: a[id] === false };
      try { localStorage.setItem(chaveStorage, JSON.stringify(novo)); } catch { /* aba anônima */ }
      return novo;
    });
  }, [chaveStorage]);
  return [(id) => abertas[id] !== false, alternar];
}

/* Os chips de ano, derivados do próprio dado (ano com venda = chip). O dono
   pediu "aperta o ano e aparece o daquele ano, até para não acumular" — mas
   "Todos" existe porque o acumulado também responde pergunta. */
function ChipsAno({ anos, valor, aoEscolher, comTodos = true }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {comTodos && (
        <button
          type="button"
          onClick={() => aoEscolher("")}
          aria-pressed={!valor}
          className={`h-8 rounded-full border px-3 font-display text-sm font-medium transition-all ${
            !valor ? "border-brand bg-brand text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          Todos
        </button>
      )}
      {anos.map((a) => (
        <button
          key={a}
          type="button"
          onClick={() => aoEscolher(a)}
          aria-pressed={valor === a}
          className={`h-8 rounded-full border px-3 font-display text-sm font-medium tabular-nums transition-all ${
            valor === a ? "border-brand bg-brand text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          {a}
        </button>
      ))}
    </div>
  );
}

const casasSimples = (meses) =>
  meses.map((m) => ({
    chave: m.mes,
    rotulo: MES_CURTO[m.n - 1],
    valor: m.valor,
    valorCampanha: 0,
    fora: m.fora,
    parcial: m.parcial,
    /* Cada pedaço só entra se a fonte o mandou: o detalhe de produto vem com
       quantidade e SEM contagem de O.S. — "em 0 O.S." seria afirmação falsa. */
    titulo: m.fora
      ? `${rotuloMes(m.mes)}: ainda não chegou`
      : `${rotuloMes(m.mes)}: ${dinheiro(m.valor)}${m.os != null ? ` em ${m.os} O.S.` : ""}${
          m.quantidade != null ? ` · ${Math.round(m.quantidade).toLocaleString("pt-BR")} un.` : ""
        }${m.clientes != null ? ` · ${m.clientes} ${m.clientes === 1 ? "cliente" : "clientes"}` : ""}${
          m.parcial ? " · mês pela metade" : ""}`,
  }));

/* A curva por ano (12 casas cada) + o acumulado ano a ano — o "no mês, no ano
   e ano acumulado" do pedido, num bloco só, reusado por vendedor e cliente. */
function CurvasDaEntidade({ porMes, porAno }) {
  const anos = useMemo(() => mesesPorAno(porMes || [], { hoje: hojeISO() }), [porMes]);
  const [anoCurva, setAnoCurva] = useState(() => anos.length ? anos[anos.length - 1].ano : "");
  const doAno = anos.find((a) => a.ano === anoCurva) || anos[anos.length - 1];
  const tetoAnos = Math.max(...(porAno || []).map((a) => a.valor), 1);
  if (!anos.length) return null;
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Mês a mês</span>
          <ChipsAno anos={anos.map((a) => a.ano)} valor={doAno?.ano || ""} aoEscolher={setAnoCurva} comTodos={false} />
        </div>
        {doAno && <BarrasAno casas={casasSimples(doAno.meses)} />}
      </div>
      <div>
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Ano acumulado</span>
        <div className="mt-2 space-y-1">
          {(porAno || []).map((a) => (
            <div key={a.ano} className="flex items-center gap-3 text-xs">
              <span className="w-10 shrink-0 font-medium tabular-nums text-brand-600">{a.ano}</span>
              <span className="h-3 min-w-0 flex-1 overflow-hidden rounded bg-slate-100">
                <span className="block h-full rounded bg-brand-300" style={{ width: `${Math.max(1, (a.valor / tetoAnos) * 100)}%` }} />
              </span>
              <span className="w-24 shrink-0 text-right tabular-nums text-slate-800">{dinheiro(a.valor)}</span>
              <span className="w-20 shrink-0 text-right tabular-nums text-slate-400">
                {a.os != null ? `${a.os} O.S.` : a.quantidade != null ? `${Math.round(a.quantidade).toLocaleString("pt-BR")} un.` : ""}
                {a.clientes != null ? ` · ${a.clientes}c` : ""}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ListaValores({ titulo, itens, campoRotulo = "rotulo", extras, fora, foraValor, vazio }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{titulo}</div>
      {itens?.length ? (
        <div className="max-h-80 space-y-0.5 overflow-y-auto pr-1">
          {itens.map((it) => (
            <div key={it.chave || it[campoRotulo]} className="flex items-baseline gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate text-slate-700" title={it[campoRotulo]}>
                {it[campoRotulo]}
                {it.ehGrupo && (
                  <span className="ml-1.5 rounded bg-brand-50 px-1 py-px text-[10px] text-brand-700" title="Grupo de compra: vários CNPJs somados">
                    grupo
                  </span>
                )}
              </span>
              {extras && <span className="shrink-0 text-[10px] text-slate-400">{extras(it)}</span>}
              <span className="shrink-0 tabular-nums text-slate-500">{dinheiro(it.valor)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-slate-400">{vazio || "Nada neste recorte."}</div>
      )}
      {fora > 0 && (
        <div className="text-[11px] text-slate-400">
          e mais {fora} fora desta lista{foraValor > 0 ? `, somando ${dinheiro(foraValor)}` : ""}.
        </div>
      )}
    </div>
  );
}

const NOTA_REGUA_PRODUTOS =
  "Os valores dos produtos são brutos, antes do desconto — os totais em dinheiro são líquidos.";

/* ================================================================ VENDEDORES */
export function AbaVendedores() {
  const [linhas, setLinhas] = useState(null);
  const [erro, setErro] = useState("");
  /* `null` = ninguém escolheu ainda (o efeito abaixo põe o ano corrente);
     `""` = a pessoa CLICOU em "Todos". Com um estado só, clicar em "Todos"
     zerava o ano e o efeito o religava no mesmo render — o recorte de todos
     os anos era inalcançável. */
  const [ano, setAno] = useState(null);
  const [aberto, setAberto] = useState(null);         // vendedor aberto
  const [detalhes, setDetalhes] = useState({});       // cache por `${vendedor}|${ano}`
  const [erros, setErros] = useState({});
  const [secaoAberta, alternarSecao] = useSecoes("campanhas_vendedores_secoes");

  useEffect(() => {
    if (linhas || erro) return;
    let vivo = true;
    lerVendedoresPanorama()
      .then((l) => { if (vivo) setLinhas(l); })
      .catch((e) => { if (vivo) setErro(e.message); });
    return () => { vivo = false; };
  }, [linhas, erro]);

  const anos = useMemo(() => [...new Set((linhas || []).map((l) => l.ano))].sort(), [linhas]);
  // O ano corrente é o recorte de partida: é a pergunta do dia a dia. Só
  // enquanto ninguém escolheu (null) — "" é escolha ("Todos") e fica.
  useEffect(() => {
    if (ano === null && anos.length) setAno(anos[anos.length - 1]);
  }, [anos, ano]);

  const anoEfetivo = ano ?? "";
  const doAno = useMemo(() => {
    if (!linhas) return [];
    if (!ano) {
      // "Todos": soma por vendedor (sem distinct de clientes — não se inventa).
      const mapa = new Map();
      for (const l of linhas) {
        const g = mapa.get(l.vendedor) || { vendedor: l.vendedor, valor: 0, os: 0, clientes: null, anos: 0 };
        g.valor += l.valor; g.os += l.os; g.anos += 1;
        mapa.set(l.vendedor, g);
      }
      return [...mapa.values()].sort((a, b) => b.valor - a.valor);
    }
    return linhas.filter((l) => l.ano === ano).sort((a, b) => b.valor - a.valor);
  }, [linhas, ano]);

  useEffect(() => {
    if (!aberto) return;
    const chave = `${aberto}|${ano ?? ""}`;
    if (chave in detalhes) return;
    setErros((x) => (x[chave] ? { ...x, [chave]: "" } : x));
    lerVendedorDetalhe(aberto, ano || null)
      .then((d) => setDetalhes((x) => ({ ...x, [chave]: d })))
      .catch((e) => setErros((x) => ({ ...x, [chave]: e.message })));
  }, [aberto, ano, detalhes]);

  if (erro) {
    return (
      <Card className="space-y-2 py-6 text-center">
        <div className="text-sm text-bad-600">{erro}</div>
        <button type="button" className="text-xs text-brand-600 underline" onClick={() => setErro("")}>Tentar de novo</button>
      </Card>
    );
  }
  if (!linhas) return <Card className="py-8 text-center text-sm text-slate-400">Somando os vendedores no servidor…</Card>;

  const teto = Math.max(...doAno.map((v) => v.valor), 1);
  const chaveDet = `${aberto}|${ano ?? ""}`;
  const det = detalhes[chaveDet];

  return (
    <>
      <div className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
        Automática: o que cada vendedor vendeu, direto das O.S. do ERP. Escolha o ano para ver só quem
        esteve ativo nele — e toque num vendedor para a curva dos clientes, mês a mês e ano acumulado.
      </div>
      <ChipsAno anos={anos} valor={anoEfetivo} aoEscolher={(a) => { setAno(a); setAberto(null); }} />

      <Secao
        id="ranking"
        titulo={ano ? `Vendedores de ${ano}` : "Vendedores — todos os anos"}
        sub={`${doAno.length} ${doAno.length === 1 ? "vendedor ativo" : "vendedores ativos"} no recorte.`}
        aberta={secaoAberta("ranking")}
        aoAlternar={alternarSecao}
      >
        <div className="space-y-1">
          {doAno.map((v) => (
            <button
              key={v.vendedor}
              type="button"
              onClick={() => setAberto((x) => (x === v.vendedor ? null : v.vendedor))}
              className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50 ${
                aberto === v.vendedor ? "bg-brand-50/70" : ""
              }`}
            >
              <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{v.vendedor}</span>
              <span className="hidden h-2.5 w-40 overflow-hidden rounded bg-slate-100 sm:block">
                <span className="block h-full rounded bg-brand-300" style={{ width: `${Math.max(2, (v.valor / teto) * 100)}%` }} />
              </span>
              <span className="w-16 shrink-0 text-right text-xs tabular-nums text-slate-400">{v.os} O.S.</span>
              {v.clientes != null && (
                <span className="w-16 shrink-0 text-right text-xs tabular-nums text-slate-400">{v.clientes} cli.</span>
              )}
              <span className="w-28 shrink-0 text-right tabular-nums text-slate-800">{dinheiro(v.valor)}</span>
            </button>
          ))}
          {!doAno.length && <Empty>Nenhuma venda com vendedor neste recorte.</Empty>}
        </div>
      </Secao>

      {aberto && (
        <Secao
          id="detalhe"
          titulo={aberto}
          sub={
            det
              ? `${dinheiro(det.total)} em ${det.os} O.S. · ${det.clientesQtd} clientes ${ano ? `em ${ano}` : "no total"}`
              : "Buscando…"
          }
          aberta={secaoAberta("detalhe")}
          aoAlternar={alternarSecao}
          acao={
            <button type="button" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" onClick={() => setAberto(null)} aria-label="Fechar vendedor">
              <X size={14} />
            </button>
          }
        >
          {erros[chaveDet] ? (
            <div className="text-xs text-bad-600">{erros[chaveDet]}</div>
          ) : !det ? (
            <div className="text-xs text-slate-400">Buscando o vendedor no servidor…</div>
          ) : (
            <>
              <CurvasDaEntidade porMes={det.porMes} porAno={det.porAno} />
              <div className="grid gap-4 sm:grid-cols-2">
                <ListaValores
                  titulo={ano ? `Clientes dele em ${ano}` : "Clientes dele (todos os anos)"}
                  itens={det.clientes}
                  extras={(c) => `${c.os} O.S. · última ${dataDaOS(c.ultima)}`}
                  fora={det.clientesFora}
                  foraValor={det.clientesForaValor}
                />
                <div className="space-y-1">
                  <ListaValores
                    titulo={ano ? `O que ele vendeu em ${ano}` : "O que ele vendeu (todos os anos)"}
                    itens={det.produtos}
                    extras={(p) => (p.quantidade > 0 ? `${Math.round(p.quantidade).toLocaleString("pt-BR")} un.` : "")}
                    fora={det.produtosFora}
                    foraValor={det.produtosForaValor}
                  />
                  <div className="text-[11px] text-slate-400">
                    {NOTA_REGUA_PRODUTOS}
                    {det.produtosCobertura?.osSemItens > 0 &&
                      ` ${det.produtosCobertura.osSemItens} O.S. do recorte estão sem itens carregados.`}
                    {det.produtosCobertura &&
                      det.produtosCobertura.brutoComItens - det.produtosCobertura.valorLido > 0.05 &&
                      ` ${dinheiro(det.produtosCobertura.brutoComItens - det.produtosCobertura.valorLido)} vieram do ERP sem produto nomeado, fora do ranking.`}
                  </div>
                </div>
              </div>
            </>
          )}
        </Secao>
      )}
    </>
  );
}

/* ================================================================= CLIENTES */
const TOM_CLASSE = {
  A: "bg-brand-100 text-brand-800",
  B: "bg-warn-100 text-warn-800",
  C: "bg-slate-100 text-slate-500",
};

export function AbaClientes() {
  const [dados, setDados] = useState({});      // cache por ano
  const [erro, setErro] = useState("");
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [aberto, setAberto] = useState(null);   // chave do cliente aberto
  const [detalhes, setDetalhes] = useState({});
  const [erros, setErros] = useState({});
  const [classeVista, setClasseVista] = useState("");  // "" | A | B | C
  const [secaoAberta, alternarSecao] = useSecoes("campanhas_clientes_secoes");
  // grupos
  const [grupos, setGrupos] = useState(null);
  const [gruposFalhou, setGruposFalhou] = useState(false);
  const [avisoGrupo, setAvisoGrupo] = useState(null);
  const [formGrupo, setFormGrupo] = useState(null);   // {id?, nome, membros:[{chave,nome}]}
  /* VÍNCULO DIRETO DA LISTA (pedido do dono, na tela): ativa a seleção, toca
     nos clientes e cria o grupo ali -- sem descer até a seção de grupos. */
  const [selecionando, setSelecionando] = useState(false);
  const [selecionados, setSelecionados] = useState({});   // chave -> nome
  const [nomeRapido, setNomeRapido] = useState("");
  const [buscaMembro, setBuscaMembro] = useState("");
  const [achados, setAchados] = useState([]);
  const [salvandoGrupo, setSalvandoGrupo] = useState(false);

  const chaveAno = ano || "todos";
  useEffect(() => {
    if (chaveAno in dados || erro) return;
    let vivo = true;
    lerClientesAbc(ano || null)
      .then((d) => { if (vivo) setDados((x) => ({ ...x, [chaveAno]: d })); })
      .catch((e) => { if (vivo) setErro(e.message); });
    return () => { vivo = false; };
  }, [chaveAno, ano, dados, erro]);

  useEffect(() => {
    let vivo = true;
    /* Falha aqui NÃO pode virar "nenhum grupo ainda": além de mentir, com a
       lista vazia a checagem de duplicidade deixaria gravar um grupo com
       membro que já está noutro. Falhou = tela de grupos travada com aviso. */
    lerGrupos()
      .then((g) => { if (vivo) { setGrupos(g); setGruposFalhou(false); } })
      .catch(() => { if (vivo) setGruposFalhou(true); });
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    if (!aberto || aberto in detalhes) return;
    setErros((x) => (x[aberto] ? { ...x, [aberto]: "" } : x));
    lerClienteDetalhe(aberto)
      .then((d) => setDetalhes((x) => ({ ...x, [aberto]: d })))
      .catch((e) => setErros((x) => ({ ...x, [aberto]: e.message })));
  }, [aberto, detalhes]);

  // Busca de membro para o grupo, com folga de digitação.
  useEffect(() => {
    const t = buscaMembro.trim();
    if (t.length < 2) { setAchados([]); return undefined; }
    let vivo = true;
    const timer = setTimeout(() => {
      buscarClientes(t).then((r) => { if (vivo) setAchados(r); }).catch(() => {});
    }, 350);
    return () => { vivo = false; clearTimeout(timer); };
  }, [buscaMembro]);

  const d = dados[chaveAno];
  const anosDisponiveis = useMemo(() => {
    const hoje = new Date().getFullYear();
    const lista = [];
    for (let a = 2020; a <= hoje; a++) lista.push(String(a));
    return lista;
  }, []);

  /* A CRIAÇÃO NUM LUGAR SÓ: o formulário da seção de grupos e a seleção
     direta na lista passam pela mesma validação e pela mesma limpeza de
     caches -- dois caminhos com regras diferentes é como o vínculo nasce
     furado. */
  const criarGrupoCom = async (nome, pares, idExistente) => {
    const membros = pares.map((m) => m.chave);
    if (!nome.trim()) { setAvisoGrupo({ tom: "erro", texto: "Dê um nome ao grupo." }); return false; }
    if (membros.length < 2) { setAvisoGrupo({ tom: "erro", texto: "Um grupo precisa de pelo menos dois clientes." }); return false; }
    if (grupos == null) { setAvisoGrupo({ tom: "erro", texto: "Os grupos ainda não carregaram — tente de novo em instantes." }); return false; }
    /* UM CLIENTE, UM GRUPO. O banco desempata por ordem de id quando há dois
       -- mas isso é determinismo, não regra: se a tela deixasse gravar, o
       cliente contaria num grupo e sumiria do outro em silêncio. */
    const emOutro = Object.entries(grupos || {}).find(([gid, g]) =>
      gid !== idExistente && (g.membros || []).some((m) => membros.includes(m)));
    if (emOutro) {
      const repetido = (emOutro[1].membros || []).find((m) => membros.includes(m));
      setAvisoGrupo({
        tom: "erro",
        texto: `"${repetido}" já está no grupo "${emOutro[1].nome || "sem nome"}". Tire de lá primeiro — um cliente só pode estar num grupo.`,
      });
      return false;
    }
    setSalvandoGrupo(true);
    try {
      const novo = await salvarGrupo(idExistente || novoId("grupo"), { nome: nome.trim(), membros });
      setGrupos(novo);
      // O recorte muda de verdade: os caches derivados do grupo são zerados.
      setDados({}); setDetalhes({}); setAberto(null);
      setAvisoGrupo({ tom: "ok", texto: `Grupo "${nome.trim()}" gravado. Os rankings já contam os CNPJs juntos.` });
      return true;
    } catch (e) {
      setAvisoGrupo({ tom: "erro", texto: e.message });
      return false;
    } finally {
      setSalvandoGrupo(false);
    }
  };

  const gravarGrupo = async () => {
    if (!formGrupo) return;
    if (await criarGrupoCom(formGrupo.nome, formGrupo.membros, formGrupo.id)) setFormGrupo(null);
  };

  /* EDITAR = o mesmo formulário de criar, aberto com os membros atuais.
     `criarGrupoCom` já grava por cima quando recebe o id, e a validação de
     "um cliente, um grupo" já exclui o próprio grupo em edição. A chave do
     membro É o nome normalizado do ERP, então ela mesma rotula o chip. */
  const editarGrupo = (id) => {
    const g = (grupos || {})[id];
    if (!g) return;
    setSelecionando(false);
    setSelecionados({});
    setFormGrupo({ id, nome: g.nome || "", membros: (g.membros || []).map((m) => ({ chave: m, nome: m })) });
  };

  const apagarGrupo = async (id, nome) => {
    if (!window.confirm(`Desfazer o grupo "${nome}"? Os clientes voltam a contar separados.`)) return;
    try {
      await removerGrupo(id);
      setGrupos((g) => { const n = { ...g }; delete n[id]; return n; });
      setDados({}); setDetalhes({}); setAberto(null);
    } catch (e) {
      setAvisoGrupo({ tom: "erro", texto: e.message });
    }
  };

  if (erro) {
    return (
      <Card className="space-y-2 py-6 text-center">
        <div className="text-sm text-bad-600">{erro}</div>
        <button type="button" className="text-xs text-brand-600 underline" onClick={() => setErro("")}>Tentar de novo</button>
      </Card>
    );
  }

  const lista = (d?.lista || []).filter((c) => !classeVista || c.classe === classeVista);
  const det = aberto ? detalhes[aberto] : null;

  return (
    <>
      <div className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
        Automática: todos os compradores do recorte, na curva A e B — A são os que somam 80% do valor,
        B até 95%, C o resto. Toque num cliente para o comportamento dele; grupos de CNPJ contam juntos.
      </div>
      <Aviso aviso={avisoGrupo} aoFechar={() => setAvisoGrupo(null)} />
      <ChipsAno anos={anosDisponiveis} valor={ano} aoEscolher={(a) => { setAno(a); setAberto(null); setClasseVista(""); }} />

      {!d ? (
        <Card className="py-8 text-center text-sm text-slate-400">Classificando os clientes no servidor…</Card>
      ) : !d.clientesQtd ? (
        // Virada do ano: 1º de janeiro abre no ano novo, vazio de verdade.
        <Card className="py-8 text-center text-sm text-slate-400">
          Nenhuma venda em {ano || "período nenhum"} ainda — escolha outro ano nos chips acima.
        </Card>
      ) : (
        <>
          <Secao
            id="classes"
            titulo={ano ? `Curva ABC de ${ano}` : "Curva ABC — todos os anos"}
            sub={`${(d.clientesQtd ?? 0).toLocaleString("pt-BR")} clientes no recorte · ${dinheiro(d.total)}.`}
            aberta={secaoAberta("classes")}
            aoAlternar={alternarSecao}
            acao={
              !selecionando ? (
                <button
                  type="button"
                  className="btn-ghost"
                  title="Escolher clientes desta lista e juntá-los num grupo (o mesmo dono com vários CNPJs)"
                  onClick={() => { setSelecionando(true); setSelecionados({}); setNomeRapido(""); }}
                >
                  <Link2 size={14} /> Vincular CNPJs
                </button>
              ) : null
            }
          >
            {selecionando && (
              <div className="space-y-2 rounded-xl border border-brand-300 bg-brand-50/50 p-3">
                <div className="text-xs text-brand-800">
                  Toque nos clientes da lista para marcar quem é o mesmo dono. Quem não estiver na
                  lista você acha pela busca, na seção “Grupos de compra” lá embaixo.
                </div>
                {Object.keys(selecionados).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(selecionados).map(([ch, nome]) => (
                      <span key={ch} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs text-slate-700 ring-1 ring-slate-200">
                        {nome}
                        <button
                          type="button"
                          className="text-slate-400 hover:text-bad-600"
                          onClick={() => setSelecionados((x) => { const n2 = { ...x }; delete n2[ch]; return n2; })}
                          aria-label={`Tirar ${nome}`}
                        >
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className="input h-9 min-w-[14rem] flex-1"
                    placeholder="Nome do grupo (ex.: Grupo Osório)"
                    value={nomeRapido}
                    onChange={(e) => setNomeRapido(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={salvandoGrupo || Object.keys(selecionados).length < 2 || !nomeRapido.trim()}
                    onClick={async () => {
                      const pares = Object.entries(selecionados).map(([chave, nome]) => ({ chave, nome }));
                      if (await criarGrupoCom(nomeRapido, pares)) {
                        setSelecionando(false); setSelecionados({}); setNomeRapido("");
                      }
                    }}
                  >
                    {salvandoGrupo ? "Gravando…" : `Criar grupo (${Object.keys(selecionados).length})`}
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => { setSelecionando(false); setSelecionados({}); }}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-3">
              {(d.classes || []).map((c) => (
                <button
                  key={c.classe}
                  type="button"
                  onClick={() => setClasseVista((x) => (x === c.classe ? "" : c.classe))}
                  aria-pressed={classeVista === c.classe}
                  className={`rounded-xl border p-3 text-left transition-colors ${
                    classeVista === c.classe ? "border-brand-400 bg-brand-50/60" : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <span className={`inline-block rounded px-1.5 py-0.5 font-display text-xs font-semibold ${TOM_CLASSE[c.classe]}`}>
                    Classe {c.classe}
                  </span>
                  <span className="mt-1 block font-display text-lg font-semibold tabular-nums text-slate-900">{dinheiro(c.valor)}</span>
                  <span className="block text-xs text-slate-500">
                    {c.clientes.toLocaleString("pt-BR")} {c.clientes === 1 ? "cliente" : "clientes"}
                  </span>
                </button>
              ))}
            </div>
            {/* CLASSE FILTRADA E LISTA VAZIA: a lista desce com os 200
                maiores, e a classe C (às vezes a B) começa depois disso — o
                cartão acende e a lista sumia sem uma palavra. O "fora" da
                própria classe responde. */}
            {classeVista && !lista.length && (() => {
              const f = (d.fora || []).find((x) => x.classe === classeVista);
              return (
                <Empty>
                  {f
                    ? `Os ${f.clientes.toLocaleString("pt-BR")} clientes da classe ${classeVista} (${dinheiro(f.valor)}) estão todos fora dos ${(d.lista || []).length} maiores — a classe ${classeVista} é justamente a cauda.`
                    : `Nenhum cliente da classe ${classeVista} neste recorte.`}
                </Empty>
              );
            })()}
            <div className="space-y-0.5">
              {lista.map((c) => (
                <button
                  key={c.chave}
                  type="button"
                  title={selecionando && c.ehGrupo ? "Já é um grupo — para mexer nos membros, use a seção Grupos de compra" : undefined}
                  disabled={selecionando && c.ehGrupo}
                  onClick={() => {
                    if (!selecionando) { setAberto((x) => (x === c.chave ? null : c.chave)); return; }
                    setSelecionados((x) => {
                      const n2 = { ...x };
                      if (n2[c.chave]) delete n2[c.chave]; else n2[c.chave] = c.rotulo;
                      return n2;
                    });
                  }}
                  className={`flex w-full items-baseline gap-2 rounded-lg px-2 py-1 text-left text-xs ${
                    selecionando && c.ehGrupo ? "opacity-40" : "hover:bg-slate-50"
                  } ${
                    selecionando && selecionados[c.chave] ? "bg-brand-100/70 ring-1 ring-brand-300"
                    : aberto === c.chave && !selecionando ? "bg-brand-50/70" : ""
                  }`}
                >
                  {selecionando && (
                    <span className={`grid h-3.5 w-3.5 shrink-0 place-items-center self-center rounded border text-[9px] ${
                      selecionados[c.chave] ? "border-brand-500 bg-brand-500 text-white" : "border-slate-300"
                    }`}>
                      {selecionados[c.chave] ? "✓" : ""}
                    </span>
                  )}
                  <span className={`w-5 shrink-0 rounded text-center font-display text-[10px] font-semibold ${TOM_CLASSE[c.classe]}`}>
                    {c.classe}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-slate-700">
                    {c.rotulo}
                    {c.ehGrupo && (
                      <span className="ml-1.5 rounded bg-brand-50 px-1 py-px text-[10px] text-brand-700">grupo</span>
                    )}
                  </span>
                  <span className="shrink-0 text-[10px] tabular-nums text-slate-400">
                    {c.os} O.S. · {(Math.round((c.share || 0) * 1000) / 10).toLocaleString("pt-BR")}%
                  </span>
                  <span className="w-24 shrink-0 text-right tabular-nums text-slate-800">{dinheiro(c.valor)}</span>
                </button>
              ))}
            </div>
            {(d.fora || []).length > 0 && (
              <div className="text-[11px] text-slate-400">
                Fora desta lista:{" "}
                {(d.fora || [])
                  .map((f) => `${f.clientes.toLocaleString("pt-BR")} da classe ${f.classe} (${dinheiro(f.valor)})`)
                  .join(" · ")}
                . Use a busca da tela de Permutas/Campanhas para achar um cliente específico.
              </div>
            )}
          </Secao>

          {aberto && (
            <Secao
              id="cliente"
              titulo={det?.rotulo || "Cliente"}
              sub={det
                ? `Histórico completo (todos os anos): ${dinheiro(det.total)} em ${det.os} O.S. · de ${dataDaOS(det.primeira)} a ${dataDaOS(det.ultima)}`
                : "Buscando…"}
              aberta={secaoAberta("cliente")}
              aoAlternar={alternarSecao}
              acao={
                <button type="button" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" onClick={() => setAberto(null)} aria-label="Fechar cliente">
                  <X size={14} />
                </button>
              }
            >
              {erros[aberto] ? (
                <div className="text-xs text-bad-600">{erros[aberto]}</div>
              ) : !det ? (
                <div className="text-xs text-slate-400">Buscando o cliente no servidor…</div>
              ) : (
                <>
                  {det.ehGrupo && (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="min-w-0">
                        Grupo de compra — soma de: {(det.membros || []).join(" · ")}
                      </span>
                      {grupos?.[aberto] && (
                        <button
                          type="button"
                          className="btn-ghost !py-0.5 !px-2 text-xs"
                          onClick={() => editarGrupo(aberto)}
                        >
                          <Pencil size={12} /> Editar grupo
                        </button>
                      )}
                    </div>
                  )}
                  <CurvasDaEntidade porMes={det.porMes} porAno={det.porAno} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1">
                      <ListaValores
                        titulo="O que ele compra"
                        itens={det.produtos}
                        extras={(p) => (p.quantidade > 0 ? `${Math.round(p.quantidade).toLocaleString("pt-BR")} un.` : "")}
                        fora={det.produtosFora}
                        foraValor={det.produtosForaValor}
                      />
                      <div className="text-[11px] text-slate-400">{NOTA_REGUA_PRODUTOS}</div>
                    </div>
                    <ListaValores
                      titulo="Quem vende para ele"
                      itens={det.vendedores}
                      campoRotulo="vendedor"
                      extras={(v) => `${v.os} O.S.`}
                    />
                  </div>
                </>
              )}
            </Secao>
          )}
        </>
      )}

      <Secao
        id="grupos"
        titulo="Grupos de compra"
        sub="O mesmo dono comprando por vários CNPJs vira UM cliente em todas as análises."
        aberta={secaoAberta("grupos")}
        aoAlternar={alternarSecao}
        acao={
          !formGrupo && (
            <button type="button" className="btn-ghost" onClick={() => setFormGrupo({ nome: "", membros: [] })}>
              <Plus size={14} /> Novo grupo
            </button>
          )
        }
      >
        {gruposFalhou ? (
          <div className="text-xs text-bad-600">
            Não consegui carregar os grupos — sem a lista não dá para criar nem conferir.{" "}
            <button type="button" className="underline" onClick={() => { setGruposFalhou(false); setGrupos(null); lerGrupos().then(setGrupos).catch(() => setGruposFalhou(true)); }}>
              Tentar de novo
            </button>
          </div>
        ) : grupos == null ? (
          <div className="text-xs text-slate-400">Carregando os grupos…</div>
        ) : (
          <>
            {Object.entries(grupos).length === 0 && !formGrupo && (
              <Empty>Nenhum grupo ainda. Crie um quando o mesmo dono comprar com CNPJs diferentes.</Empty>
            )}
            <div className="space-y-1.5">
              {Object.entries(grupos).map(([id, g]) => (
                <div key={id} className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2">
                  <Link2 size={14} className="mt-0.5 shrink-0 text-brand-500" />
                  <div className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-800">{g.nome || "grupo sem nome"}</span>
                    <span className="block text-xs text-slate-500">{(g.membros || []).join(" · ")}</span>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded p-1 text-slate-300 hover:bg-brand-50 hover:text-brand-600"
                    title="Editar o grupo — adicionar ou tirar clientes"
                    onClick={() => editarGrupo(id)}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    className="shrink-0 rounded p-1 text-slate-300 hover:bg-bad-50 hover:text-bad-600"
                    title="Desfazer o grupo"
                    onClick={() => apagarGrupo(id, g.nome || "sem nome")}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            {formGrupo && (
              <div className="space-y-2 rounded-xl border border-brand-200 bg-brand-50/40 p-3">
                {formGrupo.id && (
                  <div className="text-xs font-medium text-brand-800">
                    Editando o grupo — tire pelo X ou adicione pela busca abaixo.
                  </div>
                )}
                <input
                  className="input w-full"
                  placeholder="Nome do grupo (ex.: Grupo Osório)"
                  value={formGrupo.nome}
                  onChange={(e) => setFormGrupo((f) => ({ ...f, nome: e.target.value }))}
                />
                {formGrupo.membros.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {formGrupo.membros.map((m) => (
                      <span key={m.chave} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs text-slate-700 ring-1 ring-slate-200">
                        {m.nome}
                        <button
                          type="button"
                          className="text-slate-400 hover:text-bad-600"
                          onClick={() => setFormGrupo((f) => ({ ...f, membros: f.membros.filter((x) => x.chave !== m.chave) }))}
                          aria-label={`Tirar ${m.nome}`}
                        >
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="relative">
                  <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    className="input w-full pl-8"
                    placeholder="Buscar cliente para adicionar…"
                    value={buscaMembro}
                    onChange={(e) => setBuscaMembro(e.target.value)}
                  />
                  {achados.length > 0 && (
                    <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                      {achados
                        .filter((a) => !formGrupo.membros.some((m) => m.chave === a.chave))
                        .map((a) => (
                          <button
                            key={a.chave}
                            type="button"
                            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50"
                            onClick={() => {
                              setFormGrupo((f) => ({ ...f, membros: [...f.membros, { chave: a.chave, nome: a.nome }] }));
                              setBuscaMembro("");
                            }}
                          >
                            <span className="min-w-0 truncate text-slate-800">{a.nome}</span>
                            <span className="shrink-0 text-[11px] text-slate-400">{a.qtd} O.S. · {dinheiro(a.total)}</span>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn-primary" disabled={salvandoGrupo} onClick={gravarGrupo}>
                    {salvandoGrupo ? "Gravando…" : formGrupo.id ? "Salvar alterações" : "Gravar grupo"}
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => setFormGrupo(null)}>Cancelar</button>
                </div>
              </div>
            )}
          </>
        )}
      </Secao>
    </>
  );
}

/* ================================================================= PRODUTOS */
export function AbaProdutos() {
  const [dados, setDados] = useState({});
  const [erro, setErro] = useState("");
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [aberto, setAberto] = useState(null);
  const [detalhes, setDetalhes] = useState({});
  const [erros, setErros] = useState({});
  const [secaoAberta, alternarSecao] = useSecoes("campanhas_produtos_secoes");

  const chaveAno = ano || "todos";
  useEffect(() => {
    if (chaveAno in dados || erro) return;
    let vivo = true;
    lerProdutosPanorama(ano || null)
      .then((d) => { if (vivo) setDados((x) => ({ ...x, [chaveAno]: d })); })
      .catch((e) => { if (vivo) setErro(e.message); });
    return () => { vivo = false; };
  }, [chaveAno, ano, dados, erro]);

  useEffect(() => {
    if (!aberto || aberto in detalhes) return;
    setErros((x) => (x[aberto] ? { ...x, [aberto]: "" } : x));
    lerProdutoDetalhe(aberto)
      .then((d) => setDetalhes((x) => ({ ...x, [aberto]: d })))
      .catch((e) => setErros((x) => ({ ...x, [aberto]: e.message })));
  }, [aberto, detalhes]);

  const anosDisponiveis = useMemo(() => {
    const hoje = new Date().getFullYear();
    const lista = [];
    for (let a = 2020; a <= hoje; a++) lista.push(String(a));
    return lista;
  }, []);

  if (erro) {
    return (
      <Card className="space-y-2 py-6 text-center">
        <div className="text-sm text-bad-600">{erro}</div>
        <button type="button" className="text-xs text-brand-600 underline" onClick={() => setErro("")}>Tentar de novo</button>
      </Card>
    );
  }

  const d = dados[chaveAno];
  const det = aberto ? detalhes[aberto] : null;
  const teto = Math.max(...(d?.produtos || []).map((p) => p.valor), 1);

  return (
    <>
      <div className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
        Automática: o que a casa mais vende, no grão produto+modelo, com quantos clientes compram cada um.
        Toque num produto para os períodos dele — mês a mês, ano a ano e quem compra.
      </div>
      <ChipsAno anos={anosDisponiveis} valor={ano} aoEscolher={(a) => { setAno(a); setAberto(null); }} />

      {!d ? (
        <Card className="py-8 text-center text-sm text-slate-400">Somando os produtos no servidor…</Card>
      ) : !d.produtosQtd ? (
        <Card className="py-8 text-center text-sm text-slate-400">
          Nenhuma venda com itens em {ano || "período nenhum"} ainda — escolha outro ano nos chips acima.
        </Card>
      ) : (
        <>
          <Secao
            id="ranking"
            titulo={ano ? `O que mais vendemos em ${ano}` : "O que mais vendemos — todos os anos"}
            sub={`${(d.produtosQtd ?? 0).toLocaleString("pt-BR")} produtos no recorte.`}
            aberta={secaoAberta("ranking")}
            aoAlternar={alternarSecao}
          >
            <div className="space-y-0.5">
              {(d.produtos || []).map((p) => (
                <button
                  key={p.chave}
                  type="button"
                  onClick={() => setAberto((x) => (x === p.chave ? null : p.chave))}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs hover:bg-slate-50 ${
                    aberto === p.chave ? "bg-brand-50/70" : ""
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate text-slate-700" title={p.rotulo}>
                    {p.rotulo}
                    {p.categoria && <span className="ml-1.5 text-[10px] text-slate-400">{p.categoria}</span>}
                  </span>
                  <span className="hidden h-2 w-32 overflow-hidden rounded bg-slate-100 sm:block">
                    <span className="block h-full rounded bg-brand-300" style={{ width: `${Math.max(2, (p.valor / teto) * 100)}%` }} />
                  </span>
                  <span className="w-14 shrink-0 text-right text-[10px] tabular-nums text-slate-400">
                    {p.clientes} cli.
                  </span>
                  <span className="w-24 shrink-0 text-right tabular-nums text-slate-800">{dinheiro(p.valor)}</span>
                </button>
              ))}
            </div>
            {d.foraValor > 0 && (
              <div className="text-[11px] text-slate-400">
                e mais {(d.produtosQtd ?? 0) - (d.produtos || []).length} produtos, somando {dinheiro(d.foraValor)}.
              </div>
            )}
            <div className="text-[11px] text-slate-400">
              {NOTA_REGUA_PRODUTOS}
              {d.cobertura?.osSemItens > 0 && ` ${d.cobertura.osSemItens} O.S. do recorte estão sem itens carregados.`}
              {d.cobertura && d.cobertura.brutoComItens - d.cobertura.valorLido > 0.05 &&
                ` ${dinheiro(d.cobertura.brutoComItens - d.cobertura.valorLido)} vieram do ERP sem produto nomeado, fora do ranking.`}
            </div>
          </Secao>

          {aberto && (
            <Secao
              id="produto"
              titulo={det?.rotulo || "Produto"}
              sub={det ? `${dinheiro(det.total)} no total · ${Math.round(det.quantidade || 0).toLocaleString("pt-BR")} un.` : "Buscando…"}
              aberta={secaoAberta("produto")}
              aoAlternar={alternarSecao}
              acao={
                <button type="button" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" onClick={() => setAberto(null)} aria-label="Fechar produto">
                  <X size={14} />
                </button>
              }
            >
              {erros[aberto] ? (
                <div className="text-xs text-bad-600">{erros[aberto]}</div>
              ) : !det ? (
                <div className="text-xs text-slate-400">Buscando o produto no servidor…</div>
              ) : (
                <>
                  <CurvasDaEntidade porMes={det.porMes} porAno={det.porAno} />
                  <ListaValores
                    titulo="Quem compra este produto"
                    itens={det.clientes}
                    extras={(c) => `última ${dataDaOS(c.ultima)}`}
                    fora={det.clientesFora}
                    foraValor={det.clientesForaValor}
                  />
                  <div className="text-[11px] text-slate-400">{NOTA_REGUA_PRODUTOS}</div>
                </>
              )}
            </Secao>
          )}
        </>
      )}
    </>
  );
}
