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
  Archive, Paperclip, History, Download, CalendarRange,
} from "lucide-react";
import { useApp } from "../config/store.jsx";
import {
  lerPermutas, mexerNaPermuta, removerPermuta, anexarNaPermuta, lerAnexo,
  buscarClientes, buscarOrdensDe, buscarOrdensPorId,
} from "../services/permutas.js";
import {
  fichaDaOS, resumoDaPermuta, resumoGeral, ordensDosClientes, donoPorOS,
} from "../lib/calc/permutas.js";
import { moedaCheia, paraNumero, paraCampo, dataCurta, dataLonga } from "../lib/format.js";
import { Card, PageTitle, SectionTitle, Empty, CarregandoModulo } from "../components/ui.jsx";

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
    <Card
      className={`flex items-start justify-between gap-3 text-sm ${
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

/* O número que a tela existe para dar. Positivo = o parceiro ainda tem crédito;
   negativo = ele já consumiu além, e a diferença é nossa a receber. */
function Saldo({ valor, grande }) {
  const positivo = valor >= 0;
  return (
    <div>
      <div className={`${grande ? "text-3xl" : "text-xl"} font-semibold tabular-nums ${positivo ? "text-ok-700" : "text-bad-700"}`}>
        {dinheiro(valor)}
      </div>
      <div className="text-xs text-slate-500">{positivo ? "ainda tem para gastar" : "consumiu além do crédito"}</div>
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
  return (
    <button
      type="button"
      onClick={() => aoAbrir(p.id)}
      className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-brand-300 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-slate-800">{p.nome || "Sem nome"}</span>
            {p.encerrada && (
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">encerrada</span>
            )}
          </div>
          <div className="mt-0.5 truncate text-xs text-slate-500">
            {(p.clientes || []).length
              ? (p.clientes || []).map((c) => c.nome).join(" · ")
              : "sem cliente ligado ainda"}
          </div>
        </div>
        <Saldo valor={p.saldo} />
      </div>
      <div className="mt-3 space-y-1.5">
        <Barra pct={p.pct} />
        <div className="flex flex-wrap justify-between gap-x-3 text-[11px] text-slate-500">
          <span>{dinheiro(p.consumido)} usados de {dinheiro(p.credito)}</span>
          <span>
            {p.linhas.length} O.S.
            {p.lancamentos.length > 0 && <span> · {p.lancamentos.length} manual</span>}
            {(p.anexos || []).length > 0 && <span> · {p.anexos.length} anexo</span>}
            {p.mudaram > 0 && <span className="ml-1 text-warn-700">· {p.mudaram} mudou</span>}
            {p.sumiram > 0 && <span className="ml-1 text-bad-700">· {p.sumiram} sumiu</span>}
          </span>
        </div>
      </div>
    </button>
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
        <div className="text-[11px] text-slate-400">{dataDaOS(l.data)}</div>
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

function LinhaLancamento({ l, aoTirar }) {
  const credito = l.tipo === "credito";
  return (
    <div className="flex items-center gap-3 border-b border-slate-100 py-2.5 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2">
          <span className="truncate font-medium text-slate-800">{l.descricao || "(sem descrição)"}</span>
          <span
            className={`rounded px-1.5 py-0.5 text-[11px] ${
              credito ? "bg-ok-50 text-ok-700" : "bg-slate-100 text-slate-500"
            }`}
          >
            {credito ? "aumenta o crédito" : "abate o crédito"}
          </span>
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

function Historico({ eventos }) {
  if (!eventos.length) return <Empty>Nada registrado ainda.</Empty>;
  return (
    <ol className="space-y-2">
      {eventos.map((e, i) => (
        <li key={`${e.em}-${i}`} className="flex gap-3 text-sm">
          <span className="w-32 shrink-0 text-[11px] tabular-nums text-slate-400">
            {dataLonga(e.em)} {String(e.em).slice(11, 16)}
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

// -------------------------------------------------------------------- tela

const LANC_VAZIO = { descricao: "", valor: "", data: "", tipo: "consumo" };

export default function Permutas() {
  const { config, updateConfig } = useApp();
  const [mapa, setMapa] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
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
  const [verHistorico, setVerHistorico] = useState(false);
  const arquivoRef = useRef(null);

  /* DESDE QUANDO PROCURAR. Fica na configuração do painel (um dono só) porque
     a mesma data manda na carga do histórico: mudar aqui e a carga de domingo
     passa a puxar de lá. */
  const desde = String(config?.historicoDesde || "2020-01-01").slice(0, 10);
  const podeMudarData = !!config && typeof updateConfig === "function";

  useEffect(() => {
    let vivo = true;
    lerPermutas()
      .then((m) => vivo && setMapa(m))
      .catch((e) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
  }, []);

  const permuta = aberta ? mapa?.[aberta] : null;

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
  const resumo = useMemo(
    () => (permuta ? resumoDaPermuta(permuta, ordens) : null),
    [permuta, ordens],
  );

  /* Toda gravação usa o pacote que o SERVIDOR devolveu, nunca o objeto montado
     aqui: se outra aba mexeu na permuta ao lado, o retorno já traz as duas. */
  const mexer = useCallback(async (id, o) => {
    setAviso(null);
    setSalvando(true);
    try {
      setMapa(await mexerNaPermuta(id, o));
      return true;
    } catch (e) {
      setAviso({ tom: "erro", texto: e.message });
      return false;
    } finally {
      setSalvando(false);
    }
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
      await mexer(aberta, { osPatch: { [o.id]: ligar ? fichaDaOS(bruta || o) : null } });
    },
    [aberta, ordens, mexer],
  );

  const ligarCliente = useCallback(
    async (c) => {
      if (!aberta || !permuta) return;
      const atuais = permuta.clientes || [];
      if (atuais.some((x) => x.chave === c.chave)) return;
      await mexer(aberta, {
        campos: { clientes: [...atuais, { chave: c.chave, nome: c.nome, cnpjs: c.cnpjs || [] }] },
      });
      setBuscaCliente("");
      setAchados([]);
    },
    [aberta, permuta, mexer],
  );

  /* Tirar o cliente NÃO tira as O.S. dele que já foram aceitas: o crédito foi
     gasto de verdade, e sumir com ele aqui faria o saldo subir sozinho. */
  const desligarCliente = useCallback(
    async (chave) => {
      if (!aberta || !permuta) return;
      await mexer(aberta, { campos: { clientes: (permuta.clientes || []).filter((x) => x.chave !== chave) } });
    },
    [aberta, permuta, mexer],
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

  const anexar = useCallback(
    async (file) => {
      if (!aberta || !file) return;
      setAviso(null);
      setSalvando(true);
      try {
        const buf = new Uint8Array(await file.arrayBuffer());
        let bin = "";
        const BLOCO = 0x8000;
        for (let i = 0; i < buf.length; i += BLOCO) bin += String.fromCharCode(...buf.subarray(i, i + BLOCO));
        setMapa(await anexarNaPermuta(aberta, {
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
  const paraEscolherFiltradas = useMemo(() => {
    const t = buscaOS.trim().toLowerCase();
    if (!t) return paraEscolher;
    return paraEscolher.filter(
      (o) => o.numero.toLowerCase().includes(t) || o.cliente.toLowerCase().includes(t),
    );
  }, [paraEscolher, buscaOS]);

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
          onClick={() => { setAberta(null); setVerHistorico(false); }}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft size={15} /> Todas as permutas
        </button>

        <Aviso aviso={aviso} aoFechar={() => setAviso(null)} />

        <Card className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <input
              className="input max-w-sm flex-1 text-lg font-medium"
              value={permuta.nome ?? ""}
              placeholder="De quem é esta permuta?"
              onChange={(e) => setMapa((m) => ({ ...m, [aberta]: { ...m[aberta], nome: e.target.value } }))}
              onBlur={(e) => mexer(aberta, { campos: { nome: e.target.value } })}
            />
            <div className="flex items-center gap-2">
              <button type="button" className="btn-ghost" onClick={() => setVerHistorico((v) => !v)}>
                <History size={15} /> Histórico
              </button>
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
              <label className="mb-1 block text-xs text-slate-500" htmlFor="credito-permuta">
                Crédito do parceiro
              </label>
              <input
                id="credito-permuta"
                className="input tabular-nums"
                inputMode="decimal"
                placeholder="0,00"
                defaultValue={paraCampo(resumo.credito)}
                key={`credito-${aberta}`}
                onBlur={(e) => mexer(aberta, { campos: { credito: paraNumero(e.target.value) } })}
              />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">Já usou</div>
              <div className="text-xl font-semibold tabular-nums text-slate-800">{dinheiro(resumo.consumido)}</div>
              <div className="text-xs text-slate-500">
                {resumo.linhas.length} O.S.
                {resumo.lancado !== 0 && <> · {dinheiro(Math.abs(resumo.lancado))} manual</>}
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

        {verHistorico && (
          <Card className="space-y-3">
            <SectionTitle
              titulo="Histórico da operação"
              sub="Escrito pelo servidor a cada mudança — é o que sustenta a conversa com o parceiro."
            />
            <Historico eventos={eventos} />
          </Card>
        )}

        {/* -------------------------------------- o que sustenta o crédito */}
        <Card className="space-y-3">
          <SectionTitle
            titulo="Documentos do crédito"
            sub="A nota do que compramos do parceiro, o contrato, o combinado por escrito."
            acao={
              <>
                <input
                  ref={arquivoRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => anexar(e.target.files?.[0])}
                />
                <button type="button" className="btn-ghost" onClick={() => arquivoRef.current?.click()} disabled={salvando}>
                  <Paperclip size={15} /> Anexar
                </button>
              </>
            }
          />
          {anexos.length ? (
            <div className="flex flex-wrap gap-2">
              {anexos.map((a) => (
                <button
                  key={a.chave}
                  type="button"
                  onClick={() => baixar(a)}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:border-brand-300 hover:bg-slate-50"
                  title={`${a.nome} — anexado por ${a.quemNome || a.quem} em ${dataLonga(a.em)}`}
                >
                  <Download size={14} className="text-slate-400" />
                  <span className="max-w-56 truncate">{a.nome}</span>
                </button>
              ))}
            </div>
          ) : (
            <Empty>Nenhum documento anexado. Sem ele, o crédito é um número que alguém digitou.</Empty>
          )}
        </Card>

        {/* ------------------------------------------------- de quem é */}
        <Card className="space-y-3">
          <SectionTitle
            titulo="Clientes desta permuta"
            sub="Uma permuta pode abranger mais de um CNPJ do mesmo dono — some todos aqui."
          />
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
        </Card>

        {/* ------------------------------------------------- as aceitas */}
        <Card className="space-y-2">
          <SectionTitle titulo="O.S. que entram nesta permuta" sub="É o que abate o crédito." />
          {resumo.linhas.length ? (
            <div>
              {resumo.linhas.map((l) => (
                <LinhaAceita key={l.id} l={l} aoTirar={(x) => marcarOS(x, false)} />
              ))}
            </div>
          ) : (
            <Empty>Nenhuma O.S. aceita ainda. Marque abaixo as que fazem parte da troca.</Empty>
          )}
        </Card>

        {/* ------------------------------------------- lançamentos manuais */}
        <Card className="space-y-3">
          <SectionTitle
            titulo="Lançamentos manuais"
            sub="O que mexeu no saldo sem passar por O.S. — um brinde entregue, um acerto, um crédito reposto."
            acao={
              !formLanc && (
                <button type="button" className="btn-ghost" onClick={() => setFormLanc({ ...LANC_VAZIO, data: hojeISO() })}>
                  <Plus size={15} strokeWidth={2.4} /> Lançar
                </button>
              )
            }
          />

          {formLanc && (
            <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_9rem_11rem]">
              <input
                className="input"
                placeholder="O que foi? (ex.: 200 canecas entregues)"
                value={formLanc.descricao}
                onChange={(e) => setFormLanc((f) => ({ ...f, descricao: e.target.value }))}
              />
              <input
                className="input tabular-nums"
                inputMode="decimal"
                placeholder="0,00"
                value={formLanc.valor}
                onChange={(e) => setFormLanc((f) => ({ ...f, valor: e.target.value }))}
              />
              <select
                className="input"
                value={formLanc.tipo}
                onChange={(e) => setFormLanc((f) => ({ ...f, tipo: e.target.value }))}
              >
                <option value="consumo">abate o crédito</option>
                <option value="credito">aumenta o crédito</option>
              </select>
              <div className="flex items-center gap-2 sm:col-span-3">
                <input
                  type="date"
                  className="input w-40"
                  value={formLanc.data}
                  onChange={(e) => setFormLanc((f) => ({ ...f, data: e.target.value }))}
                />
                <button type="button" className="btn" onClick={salvarLancamento} disabled={salvando}>
                  Salvar lançamento
                </button>
                <button type="button" className="btn-ghost" onClick={() => setFormLanc(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {resumo.lancamentos.length ? (
            <div>
              {resumo.lancamentos.map((l) => (
                <LinhaLancamento
                  key={l.id}
                  l={l}
                  aoTirar={(x) => mexer(aberta, { lancPatch: { [x.id]: null } })}
                />
              ))}
            </div>
          ) : (
            !formLanc && <Empty>Nenhum lançamento manual.</Empty>
          )}
        </Card>

        {/* ------------------------------------------------- escolher */}
        <Card className="space-y-3">
          <SectionTitle
            titulo="Escolher O.S."
            sub="Só as dos clientes acima. Marque as que fazem parte da permuta — o mesmo cliente também compra pagando."
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
          />
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
                : `Esses clientes não têm O.S. a partir de ${dataLonga(desde)}.`}
            </Empty>
          )}
        </Card>

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

      {/* A DATA DE CORTE DA BUSCA. Vale para procurar aqui E para a carga que
          traz o histórico do ERP -- por isso não é um filtro de tela: mudar
          aqui muda de quando o painel passa a guardar O.S. */}
      <Card className="flex flex-wrap items-center gap-3 text-sm">
        <CalendarRange size={16} className="shrink-0 text-slate-400" />
        <span className="text-slate-600">Procurar O.S. a partir de</span>
        <input
          type="date"
          className="input w-44"
          defaultValue={desde}
          disabled={!podeMudarData}
          onBlur={(e) => {
            const d = e.target.value;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d === desde) return;
            /* `updateConfig` recebe uma FUNÇÃO que devolve a config nova --
               ele já clona antes de chamar. Passar um objeto solto substituiria
               o pacote inteiro e apagaria as regras de todo mundo (motivos de
               perda, régua de cobrança, parâmetros). */
            updateConfig((c) => ({ ...c, historicoDesde: d }));
            setAviso({
              tom: "ok",
              texto: `Busca a partir de ${dataLonga(d)}. O painel passa a guardar O.S. desde essa data na próxima carga do histórico (domingo de madrugada, ou pelo botão no GitHub).`,
            });
          }}
        />
        <span className="text-xs text-slate-400">vale para a busca e para o que o painel guarda do ERP</span>
      </Card>

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
