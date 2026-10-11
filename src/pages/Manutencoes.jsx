import {PessoasRHProvider,usePessoasRH,comNomeRH} from '../components/patrimonio/PessoasRH.jsx';
import { useAbaNavegavel } from "../hooks/useAbaNavegavel.js";
import {Link,Navigate,useSearchParams} from 'react-router-dom';
import {podeAbrir} from '../lib/sessao.js';
import {recortarManutencoes,ROTA_MANUTENCOES,caminhoCadastroPatrimonio} from '../lib/calc/navegacao-patrimonio.js';
import '../components/patrimonio/manutencoes.css';
// Manutenções: o que a empresa gasta para as coisas continuarem funcionando --
// os carros, as máquinas e o prédio (câmeras, ar condicionado, elétrica,
// hidráulica, portões).
//
// A tela abre pelo DINHEIRO e pelo ATRASO, nessa ordem: é o que ninguém
// consegue responder hoje sem procurar nota fiscal na gaveta. O histórico por
// item existe para a conta que decide -- o carro que vai ao mecânico todo mês
// custa mais que a parcela de um novo, e isso só aparece somando.
//
// Itens são cadastrados em Bens e cadastros. Aqui ficam os serviços.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Wrench,
  Plus,
  Trash2,
  Pencil,
  AlertTriangle,
  Search,
  X,
  ChevronDown,
  Car,
  Cog,
  Building2,
  ShoppingCart,
  CalendarClock,
  Coins,
} from "lucide-react";
import { listarAtivos } from "../services/ativos.js";
// O cadastro físico vem de Bens e cadastros; o serviço mantém seu ID.
import { lerManutencoes, salvarManutencao, removerManutencao } from "../services/manutencoes.js";
import { getFluxoMensal } from "../services/mubi.js";
import {
  calcManutencoes,
  agruparGastos,
  FAMILIAS,
  TIPOS_SERVICO,
  resumoEspec,
  unidadeDe,
} from "../lib/calc/manutencoes.js";
import { moeda, moedaCheia, numero, dataLonga, ymdLocal, paraNumero, paraCampo } from "../lib/format.js";
import {
  Card,
  PageTitle,
  SectionTitle,
  StatCard,
  Empty,
  CarregandoModulo,
  ErroModulo,
  AvisoAtualizacao,
  Segmented,
} from "../components/ui.jsx";

const ICONE_FAMILIA = { veiculo: Car, maquina: Cog, predial: Building2, informatica:Cog, seguranca:Building2 };

// As fatias da barra do mês, na ordem do cabeçalho da coluna. "removido" entra
// porque o dinheiro dele conta no total: deixá-lo fora faria a barra não fechar
// com o valor da linha.
const FATIAS = [
  { id: "veiculo", rotulo: "Veículos", cor: "bg-brand" },
  { id: "maquina", rotulo: "Máquinas", cor: "bg-brand-400" },
  { id: "predial", rotulo: "Prédio", cor: "bg-brand-200" },
  {id:"informatica",rotulo:"Informática e telefonia",cor:"bg-blue-500"},
  {id:"seguranca",rotulo:"Segurança",cor:"bg-amber-500"},
  { id: "removido", rotulo: "Itens retirados", cor: "bg-slate-300" },
];

const TOM_SIT = {
  vencida: { chip: "chip-bad", texto: "text-bad-700" },
  perto: { chip: "chip-warn", texto: "text-warn-700" },
  ok: { chip: "chip-ok", texto: "text-ok-700" },
  sem: { chip: "chip", texto: "text-slate-400" },
};

const LANCAMENTO_VAZIO = {
  id: "",
  ativoId: "",
  data: "",
  valor: "",
  tipo: "preventiva",
  descricao: "",
  defeito: "",
  fornecedor: "",
  pedido: "",
  medidor: "",
  proxima: "",
};

// Acento não pode atrapalhar quem procura. Depois que as categorias passaram a
// ter acento, digitar "predio" deixava de achar "Prédio" -- e quem busca no
// celular raramente acentua.
const semAcento = (s) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// ------------------------------------------------------- o que vem do ERP
//
// O Mubisys NÃO diz "esta nota é do carro X": o contas a pagar não traz placa,
// patrimônio nem número de pedido. Casar título com lançamento por
// fornecedor+valor+data seria adivinhação, e erraria (o mesmo fornecedor emite
// várias notas no mês e o título vem parcelado).
//
// O que ele diz é em QUE CONTA o pagamento foi lançado -- e "Manutenção de
// Veículos" é uma dessas contas na Impresilk. Então o ERP entra aqui como
// CONFERÊNCIA, não como importação: de um lado o que foi digitado nesta tela,
// do outro o que de fato saiu do caixa naquele mês. Os dois números nunca são
// somados; se divergirem, é isso mesmo que a tela precisa mostrar.
const ehCentroDeManutencao = (nome) => /manuten/i.test(semAcento(nome));

// ---------------------------------------------------------------- formularios
//
// Fora do componente da página de propósito: componente declarado dentro de
// outro vira um TIPO NOVO a cada render, o React remonta a subárvore e o campo
// perde o foco a cada letra digitada. Já custou caro na tela de Compromissos.

function FormLancamento({ inicial, itens, salvando, aoSalvar, aoFechar }) {
  const [f, setF] = useState(inicial);
  const trocar = (campo) => (e) => setF((v) => ({ ...v, [campo]: e.target.value }));
  const item = itens.find((i) => i.id === f.ativoId);
  // Sem medidor no predial: uma câmera não roda quilômetro nem hora, e o campo
  // pedia "Horas na data" para ela porque o padrão antigo caía em "horas".
  const unidade = unidadeDe(item);
  // Trocar o item ESCONDE o campo do medidor, mas escondê-lo não apagava o que
  // já estava digitado: escolher o carro, digitar 92.400 e trocar para a câmera
  // gravava a câmera com 92.400 -- e a lista mostrava "92.400" sem unidade.
  const trocarItem = (e) => {
    const novoId = e.target.value;
    const temMedidor = !!unidadeDe(itens.find((i) => i.id === novoId));
    setF((v) => ({ ...v, ativoId: novoId, medidor: temMedidor ? v.medidor : "" }));
  };

  return (
    <Card>
      <SectionTitle
        titulo={f.id ? "Editar manutenção" : "Nova manutenção"}
        sub="O valor e a data são o que fazem a conta do ano fechar. O resto ajuda a lembrar depois."
        acao={
          <button className="btn-ghost" onClick={aoFechar}>
            <X size={15} /> Fechar
          </button>
        }
      />
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          aoSalvar(f);
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="m-item">No que foi feito</label>
            <select id="m-item" className="input" value={f.ativoId} onChange={trocarItem} required>
              <option value="">selecione um item de Bens e cadastros</option>
              {f.id&&f.ativoId&&!itens.some(i=>i.id===f.ativoId)&&<option value={f.ativoId}>{f.ativoNome||'Item retirado'} · histórico preservado</option>}
              {Object.entries(FAMILIAS).filter(([id])=>id!=='seguranca'||podeAbrir('seguranca')).map(([fam, meta]) => {
                const doGrupo = itens.filter((i) => i.tipo === fam);
                if (!doGrupo.length) return null;
                return (
                  <optgroup key={fam} label={meta.rotulo}>
                    {doGrupo.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.nome}
                        {i.identificacao ? ` (${i.identificacao})` : ""}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="m-data">Data do serviço</label>
            <input id="m-data" type="date" className="input" value={f.data} onChange={trocar("data")} required />
          </div>

          <div>
            {/* Campo de TEXTO, não type=number: quem digita 1.250,00 num input
                numérico entrega lixo. paraNumero/paraCampo fazem ida e volta. */}
            <label className="label" htmlFor="m-valor">Valor pago (R$)</label>
            <input
              id="m-valor"
              inputMode="decimal"
              className="input"
              placeholder="ex: 1.250,00"
              value={f.valor}
              onChange={trocar("valor")}
              onBlur={(e) => setF((v) => ({ ...v, valor: paraCampo(paraNumero(e.target.value)) }))}
            />
          </div>

          <div>
            <label className="label" htmlFor="m-tipo">Tipo</label>
            <select id="m-tipo" className="input" value={f.tipo} onChange={trocar("tipo")}>
              {Object.entries(TIPOS_SERVICO).map(([id, t]) => (
                <option key={id} value={id}>
                  {t.rotulo} — {t.ajuda}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2"><label className="label" htmlFor="m-defeito">Defeito / motivo (opcional)</label><input id="m-defeito" className="input" maxLength={500} value={f.defeito||''} onChange={trocar('defeito')} placeholder="Ex.: telefone sem áudio"/></div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="m-descricao">O que foi feito</label>
            <input
              id="m-descricao"
              className="input"
              placeholder="ex: troca de óleo e filtros / limpeza das 4 evaporadoras"
              value={f.descricao}
              onChange={trocar("descricao")}
            />
          </div>

          <div>
            <label className="label" htmlFor="m-fornecedor">Quem fez</label>
            <input
              id="m-fornecedor"
              className="input"
              placeholder="oficina, técnico, empresa"
              value={f.fornecedor}
              onChange={trocar("fornecedor")}
            />
          </div>

          <div>
            {/* A ponte com o Compras: o número do pedido ou da NF. Não é
                integração automática -- é a referência que permite achar a
                compra depois, sem inventar sincronização que ninguém pediu. */}
            <label className="label" htmlFor="m-pedido">Pedido de compra / NF</label>
            <input
              id="m-pedido"
              className="input"
              placeholder="número do pedido ou da nota"
              value={f.pedido}
              onChange={trocar("pedido")}
            />
          </div>

          {unidade && (
            <div>
              <label className="label" htmlFor="m-medidor">
                {unidade === "km" ? "Km na data" : "Horas na data"} (opcional)
              </label>
              <input
                id="m-medidor"
                inputMode="decimal"
                className="input"
                placeholder={unidade === "km" ? "ex: 92.400" : "ex: 1.340"}
                value={f.medidor}
                onChange={trocar("medidor")}
                onBlur={(e) => setF((v) => ({ ...v, medidor: paraCampo(paraNumero(e.target.value)) }))}
              />
            </div>
          )}

          <div>
            <label className="label" htmlFor="m-proxima">Próxima manutenção (opcional)</label>
            <input id="m-proxima" type="date" className="input" value={f.proxima} onChange={trocar("proxima")} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-primary" disabled={salvando}>
            {salvando ? "Salvando..." : f.id ? "Salvar alterações" : "Lançar manutenção"}
          </button>
          <button type="button" className="btn-ghost" onClick={aoFechar}>
            Cancelar
          </button>
        </div>
      </form>
    </Card>
  );
}

function Historico({ item, aoEditar, aoApagar }) {
  if (!item.historico.length) {
    return (
      <p className="px-3 pb-3 text-sm text-slate-500">
        Nenhuma manutenção lançada ainda para este item.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto px-3 pb-3">
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr>
            <th className="th text-left">Data</th>
            <th className="th text-left">O que foi feito</th>
            <th className="th text-left">Quem fez</th>
            <th className="th text-left">Pedido / NF</th>
            <th className="th text-right">Valor</th>
            <th className="th text-right"></th>
          </tr>
        </thead>
        <tbody>
          {item.historico.map((l) => (
            <tr key={l.id}>
              <td className="td whitespace-nowrap tabular-nums">{l.data ? dataLonga(l.data) : "-"}</td>
              <td className="td">
                <span className="block text-slate-900">{l.descricao || TIPOS_SERVICO[l.tipo]?.rotulo || "-"}</span>
                <span className="block text-xs text-slate-500">
                  {[
                    TIPOS_SERVICO[l.tipo]?.rotulo,
                    l.medidor ? `${numero(l.medidor)} ${unidadeDe(item) === "km" ? "km" : "h"}` : null,
                    l.proxima ? `próxima em ${dataLonga(l.proxima)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </td>
              <td className="td text-slate-600">{l.fornecedor || "-"}</td>
              <td className="td text-slate-600">{l.pedido || "-"}</td>
              {/* moedaCheia aqui: este numero e conferido contra a nota fiscal,
                  e R$ 1.251 no lugar de R$ 1.250,50 faz a conferencia falhar. */}
              <td className="td text-right tabular-nums font-medium text-slate-900">{moedaCheia(l.valor)}</td>
              <td className="td text-right">
                <span className="inline-flex gap-0.5">
                  <button
                    type="button"
                    onClick={() => aoEditar(l)}
                    className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    title="Editar"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => aoApagar(l)}
                    className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-bad-50 hover:text-bad-700"
                    title="Apagar"
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LinhaItem({ item, aberto, aoAbrir, aoLancar, destinoFicha, aoEditar, aoApagar }) {
  const Icone = ICONE_FAMILIA[item.familia] || Wrench;
  const tom = TOM_SIT[item.sit.nivel];
  return (
    <div className="rounded-xl border" style={{ borderColor: "var(--hairline)" }}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
        <button
          type="button"
          onClick={aoAbrir}
          aria-expanded={aberto}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"
          title={aberto ? "Fechar histórico" : "Ver histórico"}
        >
          <ChevronDown size={16} className={`transition-transform ${aberto ? "" : "-rotate-90"}`} />
        </button>
        <Icone size={17} strokeWidth={2.2} className="shrink-0 text-slate-500" />

        <span className="min-w-0 flex-1 basis-48">
          <span className="block truncate font-display text-sm font-medium text-slate-900">{item.nome}</span>
          <span className="block truncate text-xs text-slate-500">
            {/* A ficha primeiro: a placa identifica o carro melhor que a
                categoria, e é o que a pessoa procura na lista. */}
            {[...resumoEspec(item), item.categoria, item.responsavel].filter(Boolean).join(" · ") ||
              "sem ficha preenchida"}
          </span>
        </span>

        <span className="shrink-0 text-right">
          <span className="block font-display text-sm font-semibold tabular-nums text-slate-900">
            {moeda(item.total)}
          </span>
          <span className="block text-xs text-slate-500">
            {item.quantos === 0
              ? "nada lançado"
              : `${item.quantos} ${item.quantos === 1 ? "serviço" : "serviços"} · ${moeda(item.doze)} em 12 meses`}
          </span>
        </span>

        <span className={`${tom.chip} shrink-0 whitespace-nowrap`}>{item.sit.rotulo}</span>

        <span className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={aoLancar}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 font-display text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-brand"
            title="Lançar uma manutenção neste item"
          >
            <Plus size={14} strokeWidth={2.6} />
            Lançar
          </button>
          {destinoFicha&&<Link to={destinoFicha} className="btn-ghost !py-1 !px-2 text-xs">Ver cadastro</Link>}
        </span>
      </div>
      {aberto && <Historico item={item} aoEditar={aoEditar} aoApagar={aoApagar} />}
    </div>
  );
}

// ---------------------------------------------------------------- página

export default function Manutencoes(){return <PessoasRHProvider><ManutencoesConteudo/></PessoasRHProvider>;}
function ManutencoesConteudo() {
  const {pessoas}=usePessoasRH();
  const [parametros,setParametros]=useSearchParams();
  const itemSelecionado=parametros.get('item')||'';
  const [itens, setItens] = useState(null);
  const [mapa, setMapa] = useState(null);
  const [erro, setErro] = useState(null);
  const [msg, setMsg] = useState(null);
  const familiaInicial = FAMILIAS[parametros.get("familia")] ? parametros.get("familia") : "tudo";
  const [familia, setFamilia] = useState(familiaInicial);
  /* OS CARTÕES VIRAM RECORTE. "Atrasadas: 4" era um número que não virava
     lista -- para achar as 4 era rolar a tabela conferindo etiqueta por
     etiqueta. Clicar filtra, clicar de novo volta. */
  const [recorte, setRecorte] = useState(null); // "vencida" | "sem" | null
  const [busca, setBusca] = useState("");
  // "itens" (o que existe e quanto já custou) x "historico" (quanto saiu em
  // cada mês de cada ano). São duas perguntas diferentes na mesma tela.
  const [aba, setAba] = useAbaNavegavel("itens", ["itens", "historico"]);
  const [anoHist, setAnoHist] = useState("");
  const [mesAberto, setMesAberto] = useState(null);
  const [erp, setErp] = useState(null);
  const [aberto, setAberto] = useState(null);
  useEffect(()=>{setAberto(itemSelecionado||null);setFamilia(itemSelecionado?'tudo':familiaInicial);setRecorte(null);setBusca('');setFormLanc(null);},[itemSelecionado,familiaInicial]);
  const [formLanc, setFormLanc] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const topoForm = useRef(null);
  const novoTipo=parametros.get('novo');
  // "Hoje" em estado é refeito ao voltar para a aba: numa tela de prazo, o dia
  // congelado faz "atrasada" continuar dizendo "em 1 dia" no dia seguinte.
  const [hojeISO, setHojeISO] = useState(() => ymdLocal(new Date()));

  const pedidoLeitura = useRef(0);
  const carregar = useCallback(async () => {
    const pedido = ++pedidoLeitura.current;
    try {
      const [lista, m] = await Promise.all([listarAtivos(), lerManutencoes()]);
      if (pedido !== pedidoLeitura.current) return;
      setItens(lista.filter((x) => FAMILIAS[x.tipo]));
      setMapa(m);
      setErro(null);
    } catch (e) {
      if (pedido !== pedidoLeitura.current) return;
      setErro(e.message);

    }
  }, []);

  // O realizado do ERP é EXTRA: quem não tem o módulo Fluxo de Caixa recebe 403
  // e simplesmente não vê o cartão de conferência. Nada de permissão nova por
  // causa desta tela, e nada de erro na cara de quem não devia ver mesmo.
  useEffect(() => {
    let vivo = true;
    getFluxoMensal()
      .then((r) => { if (vivo) setErp(r); })
      .catch(() => { if (vivo) setErp(null); });
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === "visible") setHojeISO(ymdLocal(new Date()));
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, []);

  const lancarSelecionado = parametros.get('lancar')==='1';
  useEffect(()=>{
    if(!lancarSelecionado || !itemSelecionado || !itens) return;
    if(itens.some(i=>i.id===itemSelecionado)) {
      setFormLanc({...LANCAMENTO_VAZIO,cadastroId:crypto.randomUUID(),ativoId:itemSelecionado,data:hojeISO});
    }
    setParametros(p=>{const n=new URLSearchParams(p);n.delete('lancar');n.delete('categoria');return n;},{replace:true});
  },[lancarSelecionado,itemSelecionado,itens,hojeISO,setParametros]);

  const escopo = useMemo(() => recortarManutencoes(itens || [], mapa || {}, itemSelecionado), [itens,mapa,itemSelecionado]);
  const vm = useMemo(
    () => calcManutencoes(escopo.itens.map(i=>['veiculo','maquina','predial','informatica','seguranca'].includes(i.tipo)?{...comNomeRH(i,pessoas),especificacao:i.tipo==='veiculo'?comNomeRH(i.especificacao||{},pessoas,'motorista'):i.especificacao}:i), escopo.mapa, hojeISO),
    [escopo, hojeISO,pessoas]
  );

  const visiveis = useMemo(() => {
    const q = semAcento(busca.trim());
    return vm.lista
      .filter((i) => !itemSelecionado || i.id === itemSelecionado)
      .filter((i) => familia === "tudo" || i.familia === familia)
      .filter((i) =>
        !q
          ? true
          : semAcento(
              // A ficha entra na busca: procurar pela PLACA é o que se faz
              // quando o carro chega na oficina.
              `${i.nome} ${i.categoria} ${i.identificacao} ${i.responsavel} ${resumoEspec(i).join(" ")}`
            ).includes(q)
      )
      .filter((i) => !recorte || i.sit.nivel === recorte)
      // Atrasado primeiro; depois o que mais consumiu em 12 meses.
      .sort((a, b) => {
        const peso = { vencida: 0, perto: 1, ok: 2, sem: 3 };
        const d = peso[a.sit.nivel] - peso[b.sit.nivel];
        return d !== 0 ? d : b.doze - a.doze;
      });
  }, [vm, familia, busca, recorte, itemSelecionado]);

  // Gasto por ano e por mês. Sai de `vm.lancamentos` (a lista crua) e não da
  // `lista` por item, para que lançamento de item retirado continue contado --
  // senão o total do histórico não bate com o cartão "Gasto no ano" da mesma
  // tela, e quem confere para de confiar nos dois.
  const hist = useMemo(() => agruparGastos(vm.lancamentos, itens || []), [vm.lancamentos, itens]);

  // ORDEM IMPORTA: anosTela -> anoTela -> anoAtivo. `const` não sobe, então
  // anoAtivo lendo anoTela antes da declaração dava "Cannot access before
  // initialization" e a tela abria EM BRANCO -- com o build e o lint verdes.
  //
  // Os anos que a tela oferece: os que têm lançamento digitado MAIS os que o
  // ERP conhece. Sem juntar os dois, quem ainda não digitou nada não via nem a
  // conferência do ERP -- justamente o caso em que ela é mais útil.
  const anosTela = useMemo(() => {
    const s = new Set(hist.anos.map((a) => a.ano));
    Object.keys(!itemSelecionado ? erp?.anos || {} : {}).forEach((a) => s.add(String(a)));
    return [...s].sort((a, b) => b.localeCompare(a));
  }, [hist, erp,itemSelecionado]);

  // Ano na tela: o escolhido, senão o mais recente que tenha alguma coisa. Se o
  // ano escolhido some (apagaram o último lançamento dele), cai no primeiro.
  const anoTela = useMemo(
    () => (anosTela.includes(anoHist) ? anoHist : anosTela[0] || ""),
    [anosTela, anoHist]
  );

  const anoAtivo = useMemo(
    () => hist.anos.find((a) => a.ano === anoTela) || null,
    [hist, anoTela]
  );

  // Contas do ERP com "manutenção" no centro de custo, no ano que está na tela.
  const erpDoAno = useMemo(() => {
    const cats = anoTela && !itemSelecionado ? erp?.anos?.[anoTela]?.saidasPorCategoria : null;
    if (!cats) return null;
    const linhas = Object.entries(cats)
      .filter(([nome]) => ehCentroDeManutencao(nome))
      .map(([nome, meses]) => ({
        nome,
        meses,
        total: Object.values(meses).reduce((s, v) => s + v, 0),
      }))
      .sort((a, b) => b.total - a.total);
    return {
      linhas,
      total: linhas.reduce((s, l) => s + l.total, 0),
      // Quantos centros de custo existem ao todo -- é o que sustenta o aviso de
      // que pode haver manutenção lançada com outro nome.
      quantosCentros: Object.keys(cats).length,
    };
  }, [erp, anoTela,itemSelecionado]);

  const rolarAoForm = () =>
    setTimeout(() => topoForm.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);

  const abrirLancamento = (ativoId = "", lancamento = null) => {
    setFormLanc(
      lancamento
        ? {
            ...LANCAMENTO_VAZIO,
            ...lancamento,
            valor: paraCampo(lancamento.valor),
            medidor: paraCampo(lancamento.medidor),
          }
        : { ...LANCAMENTO_VAZIO, cadastroId:crypto.randomUUID(), ativoId, data: hojeISO }
    );
    rolarAoForm();
  };

  async function gravarLancamento(f) {
    if (!f.ativoId) return setMsg({ tom: "erro", texto: "Escolha em que item o serviço foi feito." });
    const historicoPreservado=f.id&&mapa[f.id]?.ativoId===f.ativoId;
    if (!historicoPreservado&&!(itens||[]).some(i=>i.id===f.ativoId)) return setMsg({tom:'erro',texto:'Cadastre o item primeiro em Bens e cadastros. Atualize a lista se ele já foi cadastrado.'});
    if (!f.data) return setMsg({ tom: "erro", texto: "Informe a data do serviço." });
    setSalvando(true);
    setMsg(null);
    try {
      const id = f.id || f.cadastroId;
      const item = (itens || []).find((i) => i.id === f.ativoId);
      const dados = {
        ativoId: f.ativoId,
        // Nome desnormalizado: se o item for retirado, o gasto continua
        // identificável no histórico em vez de virar "(sem item)".
        ativoNome: item?.nome || mapa[f.id]?.ativoNome || "",
        data: f.data,
        valor: paraNumero(f.valor),
        tipo: f.tipo,
        descricao: f.descricao.trim(),
        defeito: String(f.defeito||'').trim().slice(0,500),
        fornecedor: f.fornecedor.trim(),
        pedido: f.pedido.trim(),
        medidor: paraNumero(f.medidor),
        proxima: f.proxima,
      };
      setMapa(await salvarManutencao(id, dados));
      setFormLanc(null);
      setAberto(f.ativoId);
      setMsg({ tom: "ok", texto: "Manutenção lançada." });
    } catch (e) {
      setMsg({ tom: "erro", texto: e.message });
    } finally {
      setSalvando(false);
    }
  }

  async function apagarLancamento(l) {
    if (!window.confirm(`Apagar o lançamento de ${moedaCheia(l.valor)} de ${l.data ? dataLonga(l.data) : "sem data"}?`)) return;
    setMsg(null);
    try {
      await removerManutencao(l.id);
      setMapa((m) => {
        const novo = { ...(m || {}) };
        delete novo[l.id];
        return novo;
      });
      setMsg({ tom: "aviso", texto: "Lançamento apagado." });
    } catch (e) {
      setMsg({ tom: "erro", texto: e.message });
    }
  }

  // Recortar pela lista só faz sentido na aba dos itens: clicar em "Atrasadas"
  // estando no histórico tinha de trocar de aba sozinho, senão o clique não
  // mudava nada na tela.
  function verNaLista(nivel) {
    setAba("itens");
    setRecorte((r) => (r === nivel && aba === "itens" ? null : nivel));
    if (familia !== "tudo") setFamilia("tudo");
  }

  if(FAMILIAS[novoTipo]&&podeAbrir('patrimonio'))return <Navigate replace to={caminhoCadastroPatrimonio({familia:novoTipo,novo:true})}/>;
  if (erro && itens === null) return <ErroModulo mensagem={erro} aoTentar={carregar} />;
  if (itens === null || mapa === null) return <CarregandoModulo />;

  const k = vm.kpis;
  const selecionado = (itens || []).find(i=>i.id===itemSelecionado);
  const destinoBens=caminhoCadastroPatrimonio({familia:selecionado?.tipo||familia,categoria:selecionado?.categoria,item:selecionado?.id});

  return (
    <div className="pat-manutencoes space-y-4">
      <AvisoAtualizacao erro={erro} aoTentar={carregar}/>
      <PageTitle
        titulo={selecionado ? selecionado.nome : "Manutenções do patrimônio"}
        descricao={itemSelecionado ? "Serviços, custos e próxima manutenção deste equipamento." : "Cuide dos bens: serviços, próximos prazos e custos em um só lugar."}
        acao={
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" disabled={!itens.length || (!!itemSelecionado && !selecionado)} onClick={() => abrirLancamento(itemSelecionado)}>
              <Plus size={16} strokeWidth={2.4} />
              Nova manutenção
            </button>
            {podeAbrir('patrimonio')&&<Link className="btn-outline" to={destinoBens}>{selecionado?'Ver cadastro':'Bens e cadastros'}</Link>}
          </div>
        }
      />

      {itemSelecionado && <div className="pat-manutencoes-contexto" role="status">
        <span>{selecionado ? 'Indicadores e histórico exclusivos deste equipamento.' : 'Equipamento não encontrado. O histórico existente continua preservado.'}</span>
        <div className="flex flex-wrap gap-2">
          {podeAbrir('patrimonio') && <Link className="btn-outline" to={destinoBens}>Voltar aos bens</Link>}
          <Link className="btn-ghost" to={ROTA_MANUTENCOES}>Ver todas as manutenções</Link>
        </div>
      </div>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* Os dois de dinheiro levam ao histórico (onde o gasto se abre mês a
            mês); os dois de contagem recortam a lista aqui embaixo. */}
        <StatCard
          rotulo="Gasto no mês"
          valor={moeda(k.gastoMes)}
          sub={k.gastoMes ? "ver mês a mês" : "somando tudo o que foi lançado"}
          tom="neutral"
          icone={Coins}
          ativo={aba === "historico" && mesAberto === hojeISO.slice(0, 7)}
          onClick={
            k.gastoMes
              ? () => {
                  setAba("historico");
                  setAnoHist(hojeISO.slice(0, 4));
                  setMesAberto(hojeISO.slice(0, 7));
                }
              : undefined
          }
        />
        <StatCard
          rotulo="Gasto no ano"
          valor={moeda(k.gastoAno)}
          sub={`${numero(k.lancamentosAno)} ${k.lancamentosAno === 1 ? "serviço" : "serviços"}`}
          tom="neutral"
          icone={Wrench}
          ativo={aba === "historico" && anoTela === hojeISO.slice(0, 4) && mesAberto == null}
          onClick={
            k.gastoAno
              ? () => {
                  setAba("historico");
                  setAnoHist(hojeISO.slice(0, 4));
                  setMesAberto(null);
                }
              : undefined
          }
        />
        <StatCard
          rotulo="Atrasadas"
          valor={numero(k.atrasadas)}
          sub={k.atrasadas ? (k.atrasadas === 1 ? "passou da data prevista" : "passaram da data prevista") : k.semPrevisao ? `${k.semPrevisao} itens sem previsão; confira a programação` : "nenhum atraso identificado"}
          tom={k.atrasadas ? "bad" : k.semPrevisao ? "warn" : "neutral"}
          icone={AlertTriangle}
          ativo={aba === "itens" && recorte === "vencida"}
          onClick={k.atrasadas ? () => verNaLista("vencida") : undefined}
        />
        <StatCard
          rotulo="Itens"
          valor={numero(k.itens)}
          sub={k.semPrevisao ? `${k.semPrevisao} sem próxima data` : k.itens ? "todos com previsão" : "nenhum cadastrado"}
          tom="neutral"
          icone={CalendarClock}
          ativo={aba === "itens" && recorte === "sem"}
          onClick={k.semPrevisao ? () => verNaLista("sem") : undefined}
        />
      </div>

      {msg && (
        <p
          className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
            msg.tom === "ok"
              ? "bg-ok-50 text-ok-700"
              : msg.tom === "aviso"
                ? "bg-warn-50 text-warn-700"
                : "bg-bad-50 text-bad-700"
          }`}
        >
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          {msg.texto}
        </p>
      )}

      <div ref={topoForm}>
        {formLanc && (
          <FormLancamento
            /* O item entra na key: `useState(inicial)` só lê o `inicial` na
               PRIMEIRA montagem. Com a key fixa em "novo", tocar em "Lançar"
               num segundo item com o formulário aberto não trocava nada -- e o
               gasto ia parar no carro errado, calado. */
            key={formLanc.id || `novo-${formLanc.ativoId || "sem-item"}`}
            inicial={formLanc}
            itens={itens}
            salvando={salvando}
            aoSalvar={gravarLancamento}
            aoFechar={() => setFormLanc(null)}
          />
        )}
      </div>

      {!itemSelecionado && vm.ranking.length > 0 && (
        <details className="card p-3"><summary className="cursor-pointer font-semibold text-sm">Custos por equipamento · últimos 12 meses</summary><div className="mt-3">
          <SectionTitle
            titulo="Quem mais consumiu nos últimos 12 meses"
            sub="A conta que decide trocar um veículo ou renegociar um contrato de assistência."
          />
          <div className="space-y-2">
            {vm.ranking.map((i) => {
              // Últimos 12 meses, não "no ano": em 2 de janeiro o ranking do
              // ano zera e a tela esquece tudo, justamente na semana de decidir
              // orçamento e troca de veículo.
              const maior = vm.ranking[0].doze || 1;
              const Icone = ICONE_FAMILIA[i.familia] || Wrench;
              return (
                <div key={i.id} className="flex items-center gap-3">
                  <Icone size={15} className="shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{i.nome}</span>
                  <div className="hidden h-2 w-40 shrink-0 overflow-hidden rounded-full bg-slate-100 sm:block">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${(i.doze / maior) * 100}%` }} />
                  </div>
                  <span className="w-28 shrink-0 text-right text-sm font-medium tabular-nums text-slate-900">
                    {moeda(i.doze)}
                  </span>
                </div>
              );
            })}
          </div>
        </div></details>
      )}

      {/* Duas perguntas, duas abas: "o que eu tenho e quanto cada coisa já
          custou" e "quanto saiu em cada mês". Misturar as duas na mesma lista
          era o que fazia a segunda não ter resposta nenhuma. */}
      <div className="sem-impressao">
        <Segmented
          opcoes={[
            { valor: "itens", rotulo: "Equipamentos e prazos" },
            { valor: "historico", rotulo: "Histórico por mês" },
          ]}
          valor={aba}
          onChange={setAba}
        />
      </div>

      {aba === "itens" ? (
      <Card>
        <SectionTitle
          titulo={itemSelecionado ? "Ficha e serviços" : "Equipamentos e próximos serviços"}
          sub="Atrasados primeiro. Toque na seta para ver todos os serviços e quanto custaram."
          acao={!itemSelecionado &&
            <Segmented
              opcoes={[
                { valor: "tudo", rotulo: "Tudo" },
                ...Object.entries(FAMILIAS).filter(([id])=>id!=='seguranca'||podeAbrir('seguranca')).map(([id, f]) => ({ valor: id, rotulo: f.rotulo })),
              ]}
              valor={familia}
              onChange={setFamilia}
            />
          }
        />

        {/* O recorte veio de um cartão lá em cima; sem esta faixa a lista fica
            curta "sem motivo" -- e a saída tem de estar do lado do resultado. */}
        {recorte && (
          <div className="sem-impressao mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">
            <span>
              Mostrando só {recorte === "vencida" ? "o que está atrasado" : "o que está sem próxima data"} —{" "}
              {visiveis.length} {visiveis.length === 1 ? "item" : "itens"}.
            </span>
            <button className="btn-ghost !py-1 !px-2 text-xs" onClick={() => setRecorte(null)}>
              <X size={13} /> ver todos
            </button>
          </div>
        )}

        {!itemSelecionado && <div className="sem-impressao mb-4 relative max-w-sm">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9"
            aria-label="Buscar nesta seção" value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, placa, categoria ou responsável"
          />
        </div>}

        {visiveis.length === 0 ? (
          <Empty>
            {recorte
              ? `Nada ${recorte === "vencida" ? "atrasado" : "sem próxima data"} com esse filtro.`
              : busca.trim()
              ? `Nada com "${busca}".`
              : familia !== "tudo"
                ? `Nenhum item em ${FAMILIAS[familia].rotulo.toLowerCase()}${
                    vm.lista.length ? " — mas há itens nas outras abas." : "."
                  } Cadastre o item em Bens e cadastros.`
                : "Cadastre primeiro o item em Bens e cadastros para lançar uma manutenção."}
          </Empty>
        ) : (
          <div className="space-y-2">
            {visiveis.map((i) => (
              <LinhaItem
                key={i.id}
                item={i}
                aberto={aberto === i.id}
                aoAbrir={() => setAberto(aberto === i.id ? null : i.id)}
                aoLancar={() => abrirLancamento(i.id)}
                destinoFicha={podeAbrir('patrimonio')?caminhoCadastroPatrimonio({item:i.id,familia:i.familia,categoria:i.categoria}):null}
                aoEditar={(l) => abrirLancamento(i.id, l)}
                aoApagar={apagarLancamento}
              />
            ))}
          </div>
        )}

        {vm.orfaos.length > 0 && (
          <p className="mt-4 rounded-lg bg-warn-50 px-3 py-2 text-sm text-warn-700">
            {vm.orfaos.length === 1
              ? `1 lançamento é de um item que foi retirado (${moeda(vm.orfaos[0].valor)}).`
              : `${vm.orfaos.length} lançamentos são de itens que foram retirados (${moeda(
                  vm.orfaos.reduce((s, l) => s + l.valor, 0)
                )}).`}{" "}
            O dinheiro continua contado nos totais e no histórico.
          </p>
        )}
      </Card>
      ) : (
        <Card>
          <SectionTitle
            titulo="Quanto saiu em cada mês"
            sub="Soma tudo o que foi lançado, mês a mês. Toque no mês para ver serviço por serviço."
            acao={
              anosTela.length > 1 && (
                <Segmented
                  opcoes={anosTela.map((a) => ({ valor: a, rotulo: a }))}
                  valor={anoTela}
                  onChange={(v) => {
                    setAnoHist(v);
                    setMesAberto(null);
                  }}
                />
              )
            }
          />

          {!anoAtivo ? (
            <Empty>
              Nenhuma manutenção lançada ainda. O histórico se monta sozinho conforme você lança —
              use &quot;Nova manutenção&quot;.
            </Empty>
          ) : (
            <>
              <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard
                  rotulo={`Total em ${anoAtivo.ano}`}
                  valor={moeda(anoAtivo.total)}
                  sub={`${numero(anoAtivo.quantos)} ${anoAtivo.quantos === 1 ? "serviço" : "serviços"}`}
                  tom="neutral"
                  icone={Coins}
                />
                <StatCard
                  rotulo="Média por mês"
                  valor={moeda(anoAtivo.mediaMes)}
                  // Média sobre os meses que TIVERAM gasto -- dividir por 12 num
                  // ano que começou em agosto mente para baixo.
                  sub={
                    anoAtivo.meses.length === 1
                      ? "no único mês com gasto"
                      : `nos ${anoAtivo.meses.length} meses com gasto`
                  }
                  tom="neutral"
                  icone={CalendarClock}
                />
                <StatCard
                  rotulo="Mês mais caro"
                  valor={moeda(Math.max(0, ...anoAtivo.meses.map((m) => m.total)))}
                  sub={anoAtivo.meses.slice().sort((a, b) => b.total - a.total)[0]?.rotulo || "-"}
                  tom="neutral"
                  icone={AlertTriangle}
                />
                {(() => {
                  // Quem comeu mais no ano. `removido` CONCORRE: o dinheiro dele
                  // entra em anoAtivo.total, então deixá-lo fora da disputa fazia
                  // a tela apontar a segunda colocada como líder -- e o número do
                  // cartão não batia com nada da tabela.
                  const lider = FATIAS.map((ft) => ft.id).reduce((a, b) =>
                    (anoAtivo.porFamilia[a] || 0) >= (anoAtivo.porFamilia[b] || 0) ? a : b
                  );
                  const valorLider = anoAtivo.porFamilia[lider] || 0;
                  return (
                    <StatCard
                      rotulo="Onde foi"
                      valor={valorLider > 0 ? moeda(valorLider) : "—"}
                      sub={valorLider > 0 ? FATIAS.find((ft) => ft.id === lider).rotulo : "sem gasto no ano"}
                      tom="neutral"
                      icone={Wrench}
                    />
                  );
                })()}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse">
                  <thead>
                    <tr>
                      <th className="th text-left">Mês</th>
                      <th className="th text-right">Serviços</th>
                      <th className="th text-left">Veículos · Máquinas · Prédio</th>
                      <th className="th text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anoAtivo.meses.map((m) => {
                      const abertoM = mesAberto === m.mes;
                      const maior = Math.max(1, ...anoAtivo.meses.map((x) => x.total));
                      return (
                        <Fragment key={m.mes}>
                          <tr
                            onClick={() => setMesAberto(abertoM ? null : m.mes)}
                            className="cursor-pointer hover:bg-slate-50"
                          >
                            <td className="td">
                              {/* Botão, não só <tr onClick>: a linha inteira
                                  continua clicável, mas quem navega por teclado
                                  precisa de algo que receba foco e responda a
                                  Enter -- senão o detalhe do mês não abre. */}
                              <button
                                type="button"
                                aria-expanded={abertoM}
                                onClick={(e) => { e.stopPropagation(); setMesAberto(abertoM ? null : m.mes); }}
                                className="inline-flex items-center gap-1.5 rounded font-medium text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                              >
                                <ChevronDown
                                  size={14}
                                  className={`text-slate-400 transition-transform ${abertoM ? "" : "-rotate-90"}`}
                                />
                                {m.rotulo}
                              </button>
                            </td>
                            <td className="td text-right tabular-nums text-slate-600">{numero(m.quantos)}</td>
                            <td className="td">
                              {/* Barra EMPILHADA por família: o cabeçalho promete
                                  "Veículos · Máquinas · Prédio", e uma barra de
                                  cor única prometia uma divisão que não existia. */}
                              <span className="flex h-2 w-full max-w-[180px] overflow-hidden rounded-full bg-slate-100">
                                {FATIAS.map((ft) => {
                                  const v = m.porFamilia[ft.id] || 0;
                                  if (v <= 0) return null;
                                  return (
                                    <span
                                      key={ft.id}
                                      className={ft.cor}
                                      title={`${ft.rotulo}: ${moeda(v)}`}
                                      style={{ width: `${(v / maior) * 100}%` }}
                                    />
                                  );
                                })}
                              </span>
                            </td>
                            <td className="td text-right font-medium tabular-nums text-slate-900">
                              {moeda(m.total)}
                            </td>
                          </tr>
                          {abertoM && (
                            <tr>
                              <td className="td" colSpan={4}>
                                <div className="space-y-1.5 rounded-lg bg-slate-50 p-3">
                                  {m.lancamentos.map((l) => (
                                    <div key={l.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                                      <span className="tabular-nums text-slate-500">{dataLonga(l.data)}</span>
                                      <span className="font-medium text-slate-900">
                                        {l.ativoNome || "(item retirado)"}
                                      </span>
                                      <span className="min-w-0 flex-1 truncate text-slate-600">
                                        {l.descricao || TIPOS_SERVICO[l.tipo]?.rotulo || ""}
                                        {l.fornecedor ? ` · ${l.fornecedor}` : ""}
                                      </span>
                                      {/* moedaCheia: esta linha é conferida
                                          contra a nota fiscal. */}
                                      <span className="tabular-nums font-medium text-slate-900">
                                        {moedaCheia(l.valor)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="td font-display font-semibold text-slate-900">{anoAtivo.ano}</td>
                      <td className="td text-right tabular-nums font-semibold text-slate-900">
                        {numero(anoAtivo.quantos)}
                      </td>
                      <td className="td" />
                      {/* moeda() igual ao da coluna: com moedaCheia aqui, a
                           soma das linhas nunca fechava com o rodapé na tela. */}
                      <td className="td text-right font-display font-semibold tabular-nums text-slate-900">
                        {moeda(anoAtivo.total)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Por item dentro do ano: é a mesma conta do ranking, mas de
                  qualquer ano, não só do corrente. */}
              {anoAtivo.porItem.length > 0 && (
                <div className="mt-6">
                  <p className="mb-2 font-display text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Por item em {anoAtivo.ano}
                  </p>
                  <div className="space-y-2">
                    {anoAtivo.porItem.slice(0, 10).map((i) => {
                      const maior = anoAtivo.porItem[0].total || 1;
                      const Icone = ICONE_FAMILIA[i.familia] || Wrench;
                      return (
                        <div key={i.id} className="flex items-center gap-3">
                          <Icone size={15} className="shrink-0 text-slate-400" />
                          <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{i.nome}</span>
                          <span className="hidden text-xs text-slate-400 sm:block">
                            {i.quantos} {i.quantos === 1 ? "serviço" : "serviços"}
                          </span>
                          <div className="hidden h-2 w-32 shrink-0 overflow-hidden rounded-full bg-slate-100 sm:block">
                            <div
                              className="h-full rounded-full bg-brand"
                              style={{ width: `${(i.total / maior) * 100}%` }}
                            />
                          </div>
                          <span className="w-28 shrink-0 text-right text-sm font-medium tabular-nums text-slate-900">
                            {moeda(i.total)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {/* O CORTE FALA. O bloco vem logo abaixo do rodapé com o
                      TOTAL do ano: quem somasse as 10 linhas não fechava com
                      ele e não tinha como saber por quê. */}
                  {anoAtivo.porItem.length > 10 && (
                    <p className="mt-2 text-xs text-slate-400">
                      Mostrando os 10 de maior gasto, de {anoAtivo.porItem.length} itens com manutenção
                      em {anoTela}.
                    </p>
                  )}
                </div>
              )}

            </>
          )}

            {/* Conferência contra o ERP. Fica DEPOIS da tabela de propósito:
                o número da casa é o que foi lançado aqui; o do Mubisys é a
                segunda opinião, não a fonte. */}
            {/* Carregou o ERP e NENHUM centro de custo casou. Sem esta linha,
                "o contador usa outro nome de conta", "a carga noturna ainda não
                rodou" e "não houve manutenção paga" ficavam indistinguíveis --
                a tela simplesmente não dizia nada. */}
            {erpDoAno && erpDoAno.linhas.length === 0 && erpDoAno.quantosCentros > 0 && (
              <p className="mt-6 text-xs text-slate-400">
                No ERP, nenhum dos {erpDoAno.quantosCentros} centros de custo com pagamento em {anoTela}{" "}
                tem &quot;manutenção&quot; no nome. Se o contador usa outro nome de conta para isso, me
                diga qual e eu incluo na conferência.
              </p>
            )}

            {erpDoAno && erpDoAno.linhas.length > 0 && (
              <div className="mt-6 rounded-xl border p-4" style={{ borderColor: "var(--hairline)" }}>
                <p className="font-display text-sm font-semibold text-slate-900">
                  No ERP, em {anoTela}: {moeda(erpDoAno.total)}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                  Contas <b>já pagas</b> no Mubisys cujo centro de custo tem &quot;manutenção&quot; no nome.
                  O ERP não diz a qual carro ou máquina cada nota pertence — não há placa nem número de
                  pedido no contas a pagar. Serve para conferir se o que foi digitado aqui bate com o que
                  saiu do caixa; os dois números não se somam.
                </p>
                <div className="mt-3 space-y-1.5">
                  {erpDoAno.linhas.map((l) => (
                    <div key={l.nome} className="flex items-baseline gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate text-slate-700">{l.nome}</span>
                      <span className="tabular-nums font-medium text-slate-900">{moeda(l.total)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-baseline gap-x-2 border-t pt-3 text-sm"
                     style={{ borderColor: "var(--hairline)" }}>
                  <span className="text-slate-500">Lançado nesta tela:</span>
                  <b className="tabular-nums text-slate-900">{moeda(anoAtivo?.total || 0)}</b>
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-500">nesses centros de custo:</span>
                  <b className="tabular-nums text-slate-900">{moeda(erpDoAno.total)}</b>
                </div>
                {/* Sem a palavra "diferença": os dois lados contam coisas
                    diferentes de propósito (aqui entra manutenção lançada em
                    qualquer conta; lá, só o que o contador pôs num centro com
                    "manutenção" no nome). Chamar isso de diferença acusava um
                    erro que pode não existir. */}
                <p className="mt-2 text-xs text-slate-400">
                  Os dois recortes não são o mesmo: aqui entra tudo o que você lançou; lá, só o que o
                  contador classificou num centro com &quot;manutenção&quot; no nome (são{" "}
                  {erpDoAno.quantosCentros} centros ao todo). Servem para você olhar lado a lado, não
                  para bater na vírgula.
                </p>
              </div>
            )}

            {/* Lançamento sem data não cabe em mês nenhum -- mas some da soma
                do período sem deixar rastro se a tela não contar. */}
            {hist.semData.quantos > 0 && (
              <p className="mt-5 rounded-lg bg-warn-50 px-3 py-2 text-sm text-warn-700">
                {hist.semData.quantos === 1
                  ? `1 lançamento está sem data (${moeda(hist.semData.total)}) e por isso não entra em mês nenhum. Abra o item e informe a data do serviço para ele contar aqui.`
                  : `${hist.semData.quantos} lançamentos estão sem data (${moeda(hist.semData.total)}) e por isso não entram em mês nenhum. Abra o item e informe a data do serviço para eles contarem aqui.`}
              </p>
            )}
        </Card>
      )}

      <Card>
        <SectionTitle
          titulo="Comprou peça ou contratou serviço?"
          sub="O pedido de compra e a nota ficam no sistema de Compras. Aqui guarde o número no campo 'Pedido / NF' — é o que liga uma coisa à outra na hora de conferir."
        />
        <a
          href="https://impresilk.com.br/compras"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 font-display text-sm font-medium text-slate-700 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
          style={{ borderColor: "var(--hairline)" }}
        >
          <ShoppingCart size={16} strokeWidth={2.2} />
          Abrir o Compras
        </a>
      </Card>
    </div>
  );
}
