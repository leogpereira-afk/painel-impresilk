// Patrimonio: o que a empresa TEM, onde esta e quanto custou.
//
// Nao e a mesma coisa que Manutencoes. La a pergunta e "quanto custa manter";
// aqui e "de quem e, onde fica, por quanto foi comprado e qual a etiqueta".
// O mesmo ar condicionado aparece nos dois -- separar e o que permite
// responder cada pergunta sem poluir a outra.
//
// Tres usos concretos guiaram a tela:
//   1. INVENTARIO: imprimir a lista de um setor e conferir item por item pela
//      etiqueta, andando pelo galpao, sem computador na mao.
//   2. SEGURO: quanto vale o que esta dentro de cada setor.
//   3. COMPRA: quando foi comprado, por quanto, com qual nota.
//
// O CODIGO DA ETIQUETA e gerado pelo servidor e nunca muda -- nem quando o bem
// troca de setor, porque o adesivo ja esta colado nele.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Tag,
  Plus,
  Trash2,
  Pencil,
  AlertTriangle,
  Search,
  X,
  Printer,
  Building2,
  Boxes,
  Coins,
  Wallet,
} from "lucide-react";
import { lerBens, lerSetores, salvarBem, removerBem, salvarSetor, removerSetor, semearSetores } from "../services/patrimonio.js";
import {
  calcPatrimonio,
  SETORES_PADRAO,
  SITUACOES,
  NOMES_GENERICOS,
  idadeEmAnos,
} from "../lib/calc/patrimonio.js";
import { moeda, moedaCheia, numero, dataLonga, ymdLocal, paraNumero, paraCampo } from "../lib/format.js";
import {
  Card,
  PageTitle,
  SectionTitle,
  StatCard,
  Empty,
  CarregandoModulo,
  ErroModulo,
} from "../components/ui.jsx";

const BEM_VAZIO = {
  id: "",
  codigo: "",
  setorSigla: "",
  nomeGenerico: "",
  descricaoTecnica: "",
  nf: "",
  dataAquisicao: "",
  valor: "",
  situacao: "uso",
  observacao: "",
};

const SETOR_VAZIO = { id: "", sigla: "", nome: "", area: "" };

// ---------------------------------------------------------------- formularios
// No escopo do modulo: componente declarado dentro de outro vira tipo novo a
// cada render e o campo perde o foco a cada letra.

function FormBem({ inicial, setores, salvando, aoSalvar, aoFechar }) {
  const [f, setF] = useState(inicial);
  const trocar = (campo) => (e) => setF((v) => ({ ...v, [campo]: e.target.value }));
  return (
    <Card>
      <SectionTitle
        titulo={f.id ? `Editar ${f.codigo || "bem"}` : "Novo bem"}
        sub={
          f.id
            ? "O código da etiqueta não muda -- ele já esta colado no bem."
            : "O código da etiqueta é gerado ao salvar, com a sigla do setor."
        }
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
          <div>
            <label className="label" htmlFor="b-setor">Setor</label>
            <select id="b-setor" className="input" value={f.setorSigla} onChange={trocar("setorSigla")} required>
              <option value="">escolha o setor</option>
              {setores.map((s) => (
                <option key={s.id} value={s.sigla}>
                  {s.sigla} — {s.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="b-nome">Nome generico</label>
            <input
              id="b-nome"
              className="input"
              list="nomes-genericos"
              placeholder="ex: Computador, Cadeira, Compressor"
              value={f.nomeGenerico}
              onChange={trocar("nomeGenerico")}
              required
            />
            <datalist id="nomes-genericos">
              {NOMES_GENERICOS.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            <p className="mt-1 text-xs text-slate-500">E o que agrupa: quantos computadores a empresa tem.</p>
          </div>

          <div>
            <label className="label" htmlFor="b-situacao">Situação</label>
            <select id="b-situacao" className="input" value={f.situacao} onChange={trocar("situacao")}>
              {Object.entries(SITUACOES).map(([id, s]) => (
                <option key={id} value={id}>
                  {s.rotulo}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
            <label className="label" htmlFor="b-descricao">Descrição técnica</label>
            <input
              id="b-descricao"
              className="input"
              placeholder="marca, modelo, número de série, capacidade, cor..."
              value={f.descricaoTecnica}
              onChange={trocar("descricaoTecnica")}
            />
            <p className="mt-1 text-xs text-slate-500">
              O detalhe que identifica ESTE bem: &quot;Dell Optiplex 7090, i5, 16 GB, SSD 512, série 8HJ2K1&quot;.
            </p>
          </div>

          <div>
            <label className="label" htmlFor="b-nf">Nota fiscal</label>
            <input id="b-nf" className="input" placeholder="número da NF" value={f.nf} onChange={trocar("nf")} />
          </div>

          <div>
            <label className="label" htmlFor="b-data">Data de aquisição</label>
            <input id="b-data" type="date" className="input" value={f.dataAquisicao} onChange={trocar("dataAquisicao")} />
          </div>

          <div>
            {/* Texto, nao type=number: 1.250,00 num campo numerico vira lixo. */}
            <label className="label" htmlFor="b-valor">Valor pago (R$)</label>
            <input
              id="b-valor"
              inputMode="decimal"
              className="input"
              placeholder="ex: 3.480,00"
              value={f.valor}
              onChange={trocar("valor")}
              onBlur={(e) => setF((v) => ({ ...v, valor: paraCampo(paraNumero(e.target.value)) }))}
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
            <label className="label" htmlFor="b-obs">Observação</label>
            <input
              id="b-obs"
              className="input"
              placeholder="garantia até, fornecedor, com quem esta..."
              value={f.observacao}
              onChange={trocar("observacao")}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-primary" disabled={salvando}>
            {salvando ? "Salvando..." : f.id ? "Salvar alterações" : "Cadastrar e gerar etiqueta"}
          </button>
          <button type="button" className="btn-ghost" onClick={aoFechar}>
            Cancelar
          </button>
        </div>
      </form>
    </Card>
  );
}

function FormSetor({ inicial, salvando, aoSalvar, aoFechar }) {
  const [f, setF] = useState(inicial);
  const trocar = (campo) => (e) => setF((v) => ({ ...v, [campo]: e.target.value }));
  return (
    <Card>
      <SectionTitle
        titulo={f.id ? `Editar setor ${f.sigla}` : "Novo setor"}
        sub="A sigla vai na etiqueta (PRD-001). Curta: etiqueta comprida não cabe na lateral da máquina."
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
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="s-sigla">Sigla</label>
            <input
              id="s-sigla"
              className="input uppercase"
              maxLength={4}
              placeholder="ex: PRD"
              value={f.sigla}
              onChange={(e) => setF((v) => ({ ...v, sigla: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") }))}
              required
              disabled={!!f.id}
            />
            {f.id && <p className="mt-1 text-xs text-slate-500">A sigla não muda: ela já esta nas etiquetas coladas.</p>}
          </div>
          <div>
            <label className="label" htmlFor="s-nome">Nome do setor</label>
            <input id="s-nome" className="input" placeholder="ex: Produção" value={f.nome} onChange={trocar("nome")} required />
          </div>
          <div>
            <label className="label" htmlFor="s-area">Área (opcional)</label>
            <input id="s-area" className="input" placeholder="ex: Operações" value={f.area} onChange={trocar("area")} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-primary" disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar setor"}
          </button>
          <button type="button" className="btn-ghost" onClick={aoFechar}>
            Cancelar
          </button>
        </div>
      </form>
    </Card>
  );
}

// Folha de etiquetas. Substitui a tela inteira de proposito: brigar com CSS de
// impressao para esconder menu, cartoes e rodape sempre deixa alguma sobra no
// papel. Aqui o que esta na tela E o que sai na impressora.
function FolhaEtiquetas({ bens, aoVoltar }) {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 350);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="space-y-4">
      <div className="sem-impressao flex flex-wrap items-center gap-2">
        <button className="btn-ghost" onClick={aoVoltar}>
          <X size={15} /> Voltar para o patrimônio
        </button>
        <button className="btn-primary" onClick={() => window.print()}>
          <Printer size={15} strokeWidth={2.4} /> Imprimir de novo
        </button>
        <span className="text-sm text-slate-500">
          {bens.length} {bens.length === 1 ? "etiqueta" : "etiquetas"} — recorte pelas linhas.
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {bens.map((b) => (
          <div
            key={b.id}
            className="break-inside-avoid rounded border p-2 text-center"
            style={{ borderColor: "#94a3b8" }}
          >
            <div className="font-display text-lg font-bold tracking-wide text-slate-900">{b.codigo}</div>
            <div className="truncate text-xs text-slate-700">{b.nomeGenerico}</div>
            <div className="truncate text-[10px] text-slate-500">{b.descricaoTecnica || b.setorSigla}</div>
            <div className="mt-0.5 text-[9px] uppercase tracking-wider text-slate-400">IMPRESILK</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- pagina

export default function Patrimonio() {
  const [bens, setBens] = useState(null);
  const [setoresMapa, setSetoresMapa] = useState(null);
  const [erro, setErro] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busca, setBusca] = useState("");
  const [setorFiltro, setSetorFiltro] = useState("");
  const [verBaixados, setVerBaixados] = useState(false);
  /* OS CARTÕES VIRAM RECORTE. "Sem nota: 14" era um número que não virava
     lista: para achar os 14 era caçar na tabela. Clicar filtra, clicar de novo
     volta -- o mesmo gesto das outras telas. */
  const [recorte, setRecorte] = useState(null); // "semNota" | "semValor" | null
  const [formBem, setFormBem] = useState(null);
  const [formSetor, setFormSetor] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [etiquetas, setEtiquetas] = useState(null); // lista a imprimir
  const [verSetores, setVerSetores] = useState(false);
  const topoForm = useRef(null);
  const [hojeISO] = useState(() => ymdLocal(new Date()));

  const carregar = useCallback(async () => {
    try {
      const [b, s] = await Promise.all([lerBens(), lerSetores()]);
      setBens(b);
      setSetoresMapa(s);
      setErro(null);
    } catch (e) {
      setErro(e.message);
      setBens({});
      setSetoresMapa({});
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const vm = useMemo(
    () => calcPatrimonio(bens || {}, setoresMapa || {}, hojeISO),
    [bens, setoresMapa, hojeISO]
  );

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const base = verBaixados ? vm.bens : vm.ativos;
    return base
      .filter((b) => !setorFiltro || b.setorSigla === setorFiltro)
      .filter((b) =>
        !q
          ? true
          : `${b.codigo} ${b.nomeGenerico} ${b.descricaoTecnica} ${b.nf} ${b.observacao}`
              .toLowerCase()
              .includes(q)
      )
      // O recorte dos cartões: "sem nota" e "sem valor" viram lista.
      .filter((b) =>
        recorte === "semNota" ? !String(b.nf || "").trim()
          : recorte === "semValor" ? !b.valor
            : true
      );
  }, [vm, busca, setorFiltro, verBaixados, recorte]);

  const rolar = () =>
    setTimeout(() => topoForm.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);

  const abrirBem = (b = null) => {
    setFormSetor(null);
    setFormBem(
      b
        ? { ...BEM_VAZIO, ...b, valor: paraCampo(b.valor) }
        : { ...BEM_VAZIO, setorSigla: setorFiltro || "", dataAquisicao: hojeISO }
    );
    rolar();
  };

  const abrirSetor = (s = null) => {
    setFormBem(null);
    setFormSetor(s ? { ...SETOR_VAZIO, ...s } : { ...SETOR_VAZIO });
    rolar();
  };

  async function gravarBem(f) {
    if (!f.setorSigla) return setMsg({ tom: "erro", texto: "Escolha o setor -- a sigla dele forma a etiqueta." });
    if (!f.nomeGenerico.trim()) return setMsg({ tom: "erro", texto: "Informe o nome generico do bem." });
    setSalvando(true);
    setMsg(null);
    try {
      const id = f.id || `pat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const dados = {
        // codigo NAO vai daqui: o servidor gera na primeira gravacao e devolve.
        ...(f.codigo ? { codigo: f.codigo } : {}),
        setorSigla: f.setorSigla,
        nomeGenerico: f.nomeGenerico.trim(),
        descricaoTecnica: f.descricaoTecnica.trim(),
        nf: f.nf.trim(),
        dataAquisicao: f.dataAquisicao,
        valor: paraNumero(f.valor),
        situacao: f.situacao,
        observacao: f.observacao.trim(),
      };
      const novo = await salvarBem(id, dados);
      setBens(novo);
      setFormBem(null);
      setMsg({
        tom: "ok",
        texto: novo[id]?.codigo
          ? `${novo[id].nomeGenerico} cadastrado com a etiqueta ${novo[id].codigo}.`
          : "Bem salvo.",
      });
    } catch (e) {
      setMsg({ tom: "erro", texto: e.message });
    } finally {
      setSalvando(false);
    }
  }

  async function apagarBem(b) {
    if (
      !window.confirm(
        `Apagar ${b.codigo} (${b.nomeGenerico})?\n\nSe o bem saiu da empresa (vendido, sucateado, roubado), o certo e mudar a situação para "Baixado" em vez de apagar -- assim ele sai do inventário mas continua no histórico.`
      )
    )
      return;
    setMsg(null);
    try {
      await removerBem(b.id);
      setBens((m) => {
        const novo = { ...(m || {}) };
        delete novo[b.id];
        return novo;
      });
      setMsg({ tom: "aviso", texto: `${b.codigo} apagado.` });
    } catch (e) {
      setMsg({ tom: "erro", texto: e.message });
    }
  }

  async function gravarSetor(f) {
    if (!f.sigla || !f.nome.trim()) return setMsg({ tom: "erro", texto: "Sigla e nome são obrigatórios." });
    const repetida = vm.setores.some((s) => s.sigla === f.sigla && s.id !== f.id);
    if (repetida) return setMsg({ tom: "erro", texto: `Já existe um setor com a sigla ${f.sigla}.` });
    setSalvando(true);
    setMsg(null);
    try {
      const id = f.id || `set-${f.sigla.toLowerCase()}`;
      setSetoresMapa(await salvarSetor(id, { sigla: f.sigla, nome: f.nome.trim(), area: f.area.trim() }));
      setFormSetor(null);
      setMsg({ tom: "ok", texto: `Setor ${f.sigla} salvo.` });
    } catch (e) {
      setMsg({ tom: "erro", texto: e.message });
    } finally {
      setSalvando(false);
    }
  }

  async function apagarSetor(s) {
    const quantos = vm.porSetor.find((x) => x.id === s.id)?.quantos || 0;
    if (quantos) {
      return setMsg({
        tom: "erro",
        texto: `${s.sigla} tem ${quantos} ${quantos === 1 ? "bem" : "bens"}. Mova os bens para outro setor antes de remover -- senão eles ficam sem lugar e somem do inventário por setor.`,
      });
    }
    if (!window.confirm(`Remover o setor ${s.sigla} — ${s.nome}?`)) return;
    setMsg(null);
    try {
      await removerSetor(s.id);
      setSetoresMapa((m) => {
        const novo = { ...(m || {}) };
        delete novo[s.id];
        return novo;
      });
      setMsg({ tom: "aviso", texto: `Setor ${s.sigla} removido.` });
    } catch (e) {
      setMsg({ tom: "erro", texto: e.message });
    }
  }

  async function semear() {
    if (!window.confirm(`Cadastrar os ${SETORES_PADRAO.length} setores da Impresilk de uma vez?\n\nVoce pode editar ou remover depois.`)) return;
    setSalvando(true);
    setMsg(null);
    try {
      setSetoresMapa(await semearSetores(SETORES_PADRAO));
      setVerSetores(true);
      setMsg({ tom: "ok", texto: `${SETORES_PADRAO.length} setores cadastrados.` });
    } catch (e) {
      setMsg({ tom: "erro", texto: e.message });
    } finally {
      setSalvando(false);
    }
  }

  if (erro && !Object.keys(bens || {}).length) return <ErroModulo mensagem={erro} aoTentar={carregar} />;
  if (bens === null || setoresMapa === null) return <CarregandoModulo />;

  if (etiquetas) return <FolhaEtiquetas bens={etiquetas} aoVoltar={() => setEtiquetas(null)} />;

  const k = vm.kpis;

  return (
    <div className="space-y-8">
      <PageTitle
        titulo="Patrimônio"
        descricao="O que a empresa tem, em que setor esta e quanto custou. Cada bem com a sua etiqueta."
        acao={
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => abrirBem()} disabled={!vm.setores.length}>
              <Plus size={16} strokeWidth={2.4} />
              Novo bem
            </button>
            <button className="btn-ghost" onClick={() => setVerSetores((v) => !v)}>
              <Building2 size={16} strokeWidth={2.2} />
              Setores ({vm.setores.length})
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard rotulo="Bens" valor={numero(k.quantos)} sub={k.baixados ? `${k.baixados} baixados` : "todos em uso"} tom="neutral" icone={Boxes} />
        {/* SEM NOTA APARECE NO SUBTÍTULO. `semValor` já era contado e ninguém
            via: este é o número que vai para o seguro, e ele pode estar
            mentindo PARA BAIXO sem nada avisando. "Soma do que foi pago" sem
            dizer quantos itens não têm valor é meia verdade. */}
        <StatCard rotulo="Valor total" valor={moeda(k.valor)}
          ativo={recorte === "semValor"}
          onClick={k.semValor ? () => setRecorte((r) => (r === "semValor" ? null : "semValor")) : undefined}
          sub={k.semValor ? `soma do que foi pago · ${k.semValor} item(ns) sem valor` : "soma do que foi pago"}
          tom={k.semValor ? "warn" : "neutral"} icone={Wallet} />
        <StatCard rotulo="Comprados no ano" valor={moeda(k.noAno)} sub={`${numero(k.compradosNoAno)} ${k.compradosNoAno === 1 ? "bem" : "bens"}`} tom="neutral" icone={Coins} />
        <StatCard
          rotulo="Sem nota"
          valor={numero(k.semNota)}
          sub={k.semNota ? "faltou o número da NF" : "todos com nota"}
          tom={k.semNota ? "warn" : "ok"}
          icone={AlertTriangle}
          ativo={recorte === "semNota"}
          onClick={k.semNota ? () => setRecorte((r) => (r === "semNota" ? null : "semNota")) : undefined}
        />
      </div>

      {msg && (
        <p
          className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
            msg.tom === "ok" ? "bg-ok-50 text-ok-700" : msg.tom === "aviso" ? "bg-warn-50 text-warn-700" : "bg-bad-50 text-bad-700"
          }`}
        >
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          {msg.texto}
        </p>
      )}

      <div ref={topoForm}>
        {formBem && (
          <FormBem
            key={formBem.id || "novo"}
            inicial={formBem}
            setores={vm.setores}
            salvando={salvando}
            aoSalvar={gravarBem}
            aoFechar={() => setFormBem(null)}
          />
        )}
        {formSetor && (
          <FormSetor
            key={formSetor.id || "novo-setor"}
            inicial={formSetor}
            salvando={salvando}
            aoSalvar={gravarSetor}
            aoFechar={() => setFormSetor(null)}
          />
        )}
      </div>

      {vm.setores.length === 0 && (
        <Card>
          <SectionTitle
            titulo="Comece pelos setores"
            sub="A sigla do setor forma o código da etiqueta (PRD-001). Sem setor não da para cadastrar bem."
          />
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={semear} disabled={salvando}>
              <Building2 size={16} strokeWidth={2.4} />
              Cadastrar os {SETORES_PADRAO.length} setores da Impresilk
            </button>
            <button className="btn-ghost" onClick={() => abrirSetor()}>
              <Plus size={16} /> Criar um setor na mão
            </button>
          </div>
        </Card>
      )}

      {verSetores && vm.setores.length > 0 && (
        <Card>
          <SectionTitle
            titulo="Setores"
            sub="A sigla vai na etiqueta e não muda depois de criada."
            acao={
              <button className="btn-ghost" onClick={() => abrirSetor()}>
                <Plus size={15} /> Novo setor
              </button>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse">
              <thead>
                <tr>
                  <th className="th text-left">Sigla</th>
                  <th className="th text-left">Setor</th>
                  <th className="th text-left">Área</th>
                  <th className="th text-right">Bens</th>
                  <th className="th text-right">Valor</th>
                  <th className="th text-right"></th>
                </tr>
              </thead>
              <tbody>
                {vm.porSetor.map((s) => (
                  <tr key={s.id}>
                    <td className="td font-display font-semibold text-slate-900">{s.sigla}</td>
                    <td className="td text-slate-700">{s.nome}</td>
                    <td className="td text-slate-500">{s.area || "-"}</td>
                    <td className="td text-right tabular-nums">{numero(s.quantos)}</td>
                    <td className="td text-right tabular-nums">{moeda(s.valor)}</td>
                    <td className="td text-right">
                      <span className="inline-flex gap-0.5">
                        <button
                          type="button"
                          onClick={() => abrirSetor(s)}
                          className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                          title="Editar"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => apagarSetor(s)}
                          className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-bad-50 hover:text-bad-700"
                          title="Remover"
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
        </Card>
      )}

      {vm.porTipo.length > 0 && (
        <Card>
          <SectionTitle titulo="O que a empresa tem" sub="Agrupado pelo nome generico -- quantos e quanto valem." />
          <div className="flex flex-wrap gap-2">
            {vm.porTipo.map((t) => (
              <button
                key={t.nome}
                type="button"
                onClick={() => setBusca(t.nome)}
                className="rounded-lg border px-3 py-1.5 text-left transition-colors hover:border-brand-300 hover:bg-brand-50"
                style={{ borderColor: "var(--hairline)" }}
              >
                <span className="block font-display text-sm font-medium text-slate-900">
                  {t.quantos}x {t.nome}
                </span>
                <span className="block text-xs text-slate-500">{moeda(t.valor)}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <SectionTitle
          titulo="Bens"
          sub="Ordenados pelo código. Marque os que quiser e imprima as etiquetas."
          acao={
            <button
              className="btn-ghost"
              onClick={() => setEtiquetas(visiveis)}
              disabled={!visiveis.length}
              title="Abre a folha de etiquetas dos bens que estão na lista"
            >
              <Printer size={15} strokeWidth={2.2} />
              Etiquetas ({visiveis.length})
            </button>
          }
        />

        {/* Saída do recorte ao lado do resultado: a lista encurta e o motivo
            está lá em cima, num cartão que pode nem estar na tela. */}
        {recorte && (
          <div className="sem-impressao mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">
            <span>
              Mostrando só o que está {recorte === "semNota" ? "sem nota fiscal" : "sem valor"} —{" "}
              {visiveis.length} {visiveis.length === 1 ? "bem" : "bens"}.
            </span>
            <button className="btn-ghost !py-1 !px-2 text-xs" onClick={() => setRecorte(null)}>
              <X size={13} /> ver todos
            </button>
          </div>
        )}

        <div className="sem-impressao mb-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-9"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por etiqueta, nome, NF ou descrição"
            />
          </div>
          <select className="input h-9 w-auto py-0" value={setorFiltro} onChange={(e) => setSetorFiltro(e.target.value)}>
            <option value="">Todos os setores</option>
            {vm.setores.map((s) => (
              <option key={s.id} value={s.sigla}>
                {s.sigla} — {s.nome}
              </option>
            ))}
          </select>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand-200"
              checked={verBaixados}
              onChange={(e) => setVerBaixados(e.target.checked)}
            />
            Mostrar baixados
          </label>
        </div>

        {visiveis.length === 0 ? (
          <Empty>
            {recorte
              ? `Nenhum bem ${recorte === "semNota" ? "sem nota" : "sem valor"} com esse filtro.`
              : busca.trim() || setorFiltro
              ? "Nenhum bem com esse filtro."
              : "Nenhum bem cadastrado ainda. Use 'Novo bem' para começar o inventário."}
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr>
                  <th className="th text-left">Etiqueta</th>
                  <th className="th text-left">Bem</th>
                  <th className="th text-left">Setor</th>
                  <th className="th text-left">NF</th>
                  <th className="th text-left">Aquisição</th>
                  <th className="th text-right">Valor</th>
                  <th className="th text-right"></th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((b) => {
                  const idade = idadeEmAnos(b.dataAquisicao, hojeISO);
                  const sit = SITUACOES[b.situacao] || SITUACOES.uso;
                  return (
                    <tr key={b.id}>
                      <td className="td">
                        <span className="inline-flex items-center gap-1.5 font-display font-semibold tabular-nums text-slate-900">
                          <Tag size={13} className="shrink-0 text-slate-400" />
                          {b.codigo || "sem código"}
                        </span>
                      </td>
                      <td className="td">
                        <span className="block text-slate-900">{b.nomeGenerico}</span>
                        <span className="block text-xs text-slate-500">
                          {b.descricaoTecnica || "sem descrição técnica"}
                        </span>
                      </td>
                      <td className="td">
                        <span className="block text-slate-700">{b.setorSigla || "-"}</span>
                        {b.situacao !== "uso" && <span className={`${sit.chip} mt-0.5`}>{sit.rotulo}</span>}
                      </td>
                      <td className="td text-slate-600">{b.nf || "-"}</td>
                      <td className="td whitespace-nowrap text-slate-600">
                        {b.dataAquisicao ? dataLonga(b.dataAquisicao) : "-"}
                        {idade !== null && (
                          <span className="block text-xs text-slate-400">
                            {idade === 0 ? "menos de 1 ano" : `${idade} ${idade === 1 ? "ano" : "anos"}`}
                          </span>
                        )}
                      </td>
                      <td className="td text-right tabular-nums font-medium text-slate-900">{moedaCheia(b.valor)}</td>
                      <td className="td text-right">
                        <span className="inline-flex gap-0.5">
                          <button
                            type="button"
                            onClick={() => setEtiquetas([b])}
                            className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-brand"
                            title="Imprimir só esta etiqueta"
                          >
                            <Printer size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => abrirBem(b)}
                            className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                            title="Editar"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => apagarBem(b)}
                            className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-bad-50 hover:text-bad-700"
                            title="Apagar"
                          >
                            <Trash2 size={14} />
                          </button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {vm.semSetor.length > 0 && (
          <p className="mt-4 rounded-lg bg-warn-50 px-3 py-2 text-sm text-warn-700">
            {vm.semSetor.length} {vm.semSetor.length === 1 ? "bem esta" : "bens estão"} sem setor válido
            (o setor foi removido). Edite {vm.semSetor.length === 1 ? "ele" : "eles"} e escolha um setor,
            senão {vm.semSetor.length === 1 ? "ele não aparece" : "eles não aparecem"} no inventário por setor.
          </p>
        )}
      </Card>
    </div>
  );
}
