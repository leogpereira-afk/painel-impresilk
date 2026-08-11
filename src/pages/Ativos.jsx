// Documentos, veiculos e maquinas -- tres lentes do mesmo controle: coisas com
// data que alguem precisa renovar antes de vencer.
//
// A tela abre pelo que esta pior (vencido primeiro) porque e assim que o
// problema chega: ninguem entra aqui para admirar o que esta em dia.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FileCheck2,
  Car,
  Cog,
  ShieldCheck,
  Plus,
  Trash2,
  Upload,
  Download,
  AlertTriangle,
  Check,
  Search,
  X,
} from "lucide-react";
import {
  listarAtivos,
  salvarAtivo,
  removerAtivo,
  guardarArquivo,
  lerArquivo,
  arquivoParaBase64,
  abrirBase64,
} from "../services/ativos.js";
import { calcAtivos, TIPOS, CATEGORIAS } from "../lib/calc/ativos.js";
import { dataLonga, moeda, numero, paraCampo, paraNumero, ymdLocal } from "../lib/format.js";
import {
  Card,
  PageTitle,
  SectionTitle,
  StatCard,
  Empty,
  CarregandoModulo,
  ErroModulo,
  Segmented,
} from "../components/ui.jsx";

const ICONE = { documento: FileCheck2, veiculo: Car, maquina: Cog, seguro: ShieldCheck };

const TOM = {
  vencido: { chip: "chip-bad", barra: "bg-bad-600", texto: "text-bad-700" },
  urgente: { chip: "chip-warn", barra: "bg-warn-600", texto: "text-warn-700" },
  atencao: { chip: "chip", barra: "bg-slate-300", texto: "text-slate-600" },
  ok: { chip: "chip-ok", barra: "bg-ok-600", texto: "text-ok-700" },
  sem: { chip: "chip", barra: "bg-slate-200", texto: "text-slate-400" },
};

const vazio = (tipo) => ({
  tipo,
  nome: "",
  categoria: "",
  identificacao: "",
  responsavel: "",
  emissao: "",
  validade: "",
  medidorAtual: "",
  medidorProximo: "",
  unidadeMedidor: tipo === "veiculo" ? "km" : "horas",
  // Apolice: `identificacao` guarda o numero dela, `responsavel` o corretor,
  // `emissao`/`validade` a vigencia. Estes dois sao so dela.
  seguradora: "",
  valorSegurado: "",
  valor: "",
  observacao: "",
});

export default function Ativos() {
  const [itens, setItens] = useState(null);
  const [erro, setErro] = useState(null);
  const [tipo, setTipo] = useState("documento");
  const [busca, setBusca] = useState("");
  /* OS CARTÕES VIRAM RECORTE. "Vencidos: 3" era um número que não virava
     lista: para achar os 3 era conferir item por item, e eles podiam estar em
     qualquer uma das lentes. Clicar filtra e mostra em qual lente estão. */
  const [recorte, setRecorte] = useState(null); // "vencido" | "urgente" | "sem" | null
  const [form, setForm] = useState(null); // null = formulario fechado
  const [arquivo, setArquivo] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState(null);

  const carregar = useCallback(async () => {
    try {
      setItens(await listarAtivos());
      setErro(null);
    } catch (e) {
      setErro(e.message);
      setItens([]);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const hojeISO = ymdLocal(new Date());
  // Marketing e licitacoes (abas proprias) moram na mesma colecao mas nao tem a
  // mecanica de vencimento -- so entram aqui os tipos DESTA tela, senao viram
  // "sem data" nas estatisticas.
  const vm = useMemo(
    () => calcAtivos((itens || []).filter((x) => TIPOS[x.tipo]), hojeISO),
    [itens, hojeISO]
  );

  const daLente = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return vm.lista
      .filter((x) => x.tipo === tipo)
      .filter((x) => !recorte || x.sit.nivel === recorte)
      .filter((x) =>
        !q
          ? true
          : `${x.nome} ${x.categoria} ${x.identificacao} ${x.responsavel} ${x.seguradora || ""}`
              .toLowerCase()
              .includes(q)
      );
  }, [vm, tipo, busca, recorte]);

  // Quantos do recorte em CADA lente. O cartão conta a casa inteira e a lista
  // mostra uma lente só: sem isto, clicar em "Vencidos: 3" estando em
  // Documentos podia esvaziar a tela -- os 3 estavam nos Veículos.
  const ondeEstao = useMemo(() => {
    if (!recorte) return [];
    return Object.keys(TIPOS)
      .map((t) => ({
        tipo: t,
        rotulo: TIPOS[t].rotulo,
        quantos: vm.lista.filter((x) => x.tipo === t && x.sit.nivel === recorte).length,
      }))
      .filter((x) => x.quantos > 0);
  }, [vm, recorte]);

  // Prêmio e importância segurada da carteira -- as duas perguntas que se faz
  // sobre seguro depois de "vence quando".
  const carteira = useMemo(() => {
    const apolices = vm.lista.filter((x) => x.tipo === "seguro" && x.sit.nivel !== "vencido");
    return {
      quantas: apolices.length,
      premio: apolices.reduce((t, x) => t + (Number(x.valor) || 0), 0),
      segurado: apolices.reduce((t, x) => t + (Number(x.valorSegurado) || 0), 0),
    };
  }, [vm]);

  const recortar = (nivel) => setRecorte((r) => (r === nivel ? null : nivel));

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    setMsg(null);
    // Barra ANTES de gravar. O limite do servidor e ~3 MB (4 MB ja em base64) e
    // ele so responde depois de a foto inteira subir: sem esta conferencia, a
    // pessoa esperava o upload longo para ler "arquivo muito grande" -- e o
    // item ja tinha sido cadastrado sem anexo.
    if (arquivo && arquivo.size > 3 * 1024 * 1024) {
      setSalvando(false);
      return setMsg({
        tom: "erro",
        texto: `"${arquivo.name}" tem ${(arquivo.size / 1024 / 1024).toFixed(1)} MB. O limite e 3 MB -- mande o PDF ou reduza a foto.`,
      });
    }
    try {
      const base = {
        ...form,
        medidorAtual: paraNumero(form.medidorAtual),
        medidorProximo: paraNumero(form.medidorProximo),
        valor: paraNumero(form.valor),
        valorSegurado: paraNumero(form.valorSegurado),
      };
      const item = await salvarAtivo({ ...base, temArquivo: !!arquivo || !!form.temArquivo });
      if (arquivo) {
        try {
          const b64 = await arquivoParaBase64(arquivo);
          await guardarArquivo(item.id, b64, arquivo.type, arquivo.name);
          await salvarAtivo({ ...item, temArquivo: true, arquivoNome: arquivo.name });
        } catch (errArq) {
          // Cadastro e anexo sao duas idas ao servidor. Falhando a segunda, o
          // item ficava la dizendo que TEM arquivo -- e tentar de novo criava
          // outro. Item novo volta atras; edicao so avisa (o item ja existia e
          // tem historico, apagar seria pior que o erro).
          if (!form.id) await removerAtivo(item.id).catch(() => {});
          throw new Error(
            form.id
              ? `Salvei os dados, mas o arquivo nao subiu: ${errArq.message}`
              : `Nao consegui subir o arquivo (${errArq.message}). Nada foi cadastrado -- tente de novo.`
          );
        }
      }
      setMsg({ tom: "ok", texto: `${item.nome} salvo.` });
      setForm(null);
      setArquivo(null);
      // Mostra JA, sem esperar a listagem: a listagem do Blobs tem consistencia
      // eventual (~1 min) para chaves novas, e cadastrar algo que nao aparece
      // parece que nao salvou.
      setItens((atuais) => {
        const outros = (atuais || []).filter((x) => x.id !== item.id);
        return [...outros, { ...item, temArquivo: item.temArquivo || !!arquivo }];
      });
      // Reconcilia com o servidor um pouco depois, quando a listagem alcancar.
      setTimeout(carregar, 60000);
    } catch (err) {
      setMsg({ tom: "erro", texto: err.message });
    } finally {
      setSalvando(false);
    }
  }

  async function baixar(item) {
    try {
      const a = await lerArquivo(item.id);
      abrirBase64(a.base64, a.mime, a.nome || item.arquivoNome);
    } catch (err) {
      setMsg({ tom: "erro", texto: err.message });
    }
  }

  async function apagar(item) {
    setMsg(null);
    try {
      await removerAtivo(item.id);
      setMsg({ tom: "aviso", texto: `${item.nome} removido.` });
      setItens((atuais) => (atuais || []).filter((x) => x.id !== item.id));
      // Formulario aberto no item que acabou de ser apagado: salvar dali
      // RESSUSCITARIA o registro -- so que sem o arquivo, que ja se foi junto.
      // (O servidor tambem recusa desde 04/08; fechar aqui evita o erro.)
      if (form?.id === item.id) {
        setForm(null);
        setArquivo(null);
      }
    } catch (err) {
      setMsg({ tom: "erro", texto: err.message });
    }
  }

  if (erro && !itens?.length) return <ErroModulo mensagem={erro} aoTentar={carregar} />;
  if (itens === null) return <CarregandoModulo />;

  const k = vm.kpis;
  const ehVeicMaq = tipo !== "documento";

  return (
    <div className="space-y-8">
      <PageTitle
        titulo="Documentos e ativos"
        descricao="O que vence e precisa ser renovado: certidões da empresa, manutenção dos veículos e das máquinas."
        acao={
          <button className="btn-primary" onClick={() => setForm(vazio(tipo))}>
            <Plus size={16} strokeWidth={2.4} />
            Novo {TIPOS[tipo].singular.toLowerCase()}
          </button>
        }
      />

      {/* Os cartões recortam a lista. "Cadastrados" é o botão de voltar: ele
          limpa o recorte em vez de aplicar um. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          rotulo="Vencidos" valor={numero(k.vencidos)} sub={k.vencidos ? "precisam de ação hoje" : "nada vencido"}
          tom={k.vencidos ? "bad" : "ok"} icone={AlertTriangle}
          ativo={recorte === "vencido"}
          onClick={k.vencidos ? () => recortar("vencido") : undefined}
        />
        <StatCard
          rotulo="Vencem em 30 dias" valor={numero(k.urgentes)} sub={k.urgentes ? "renovar já" : "nada vencendo"}
          tom={k.urgentes ? "warn" : "ok"} icone={AlertTriangle}
          ativo={recorte === "urgente"}
          onClick={k.urgentes ? () => recortar("urgente") : undefined}
        />
        <StatCard
          rotulo="Cadastrados" valor={numero(k.total)} sub="documentos, veículos, máquinas e seguros"
          tom="neutral" icone={FileCheck2}
          ativo={!recorte}
          onClick={recorte ? () => setRecorte(null) : undefined}
        />
        <StatCard
          rotulo="Sem data" valor={numero(k.semControle)} sub={k.semControle ? "ninguém será avisado" : "todos com data"}
          tom={k.semControle ? "warn" : "ok"} icone={AlertTriangle}
          ativo={recorte === "sem"}
          onClick={k.semControle ? () => recortar("sem") : undefined}
        />
      </div>

      {msg && (
        <p
          className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
            msg.tom === "ok" ? "bg-ok-50 text-ok-700" : msg.tom === "erro" ? "bg-bad-50 text-bad-700" : "bg-warn-50 text-warn-700"
          }`}
        >
          {msg.tom === "ok" ? <Check size={15} className="mt-0.5 shrink-0" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0" />}
          {msg.texto}
        </p>
      )}

      {form && (
        <Card>
          <SectionTitle
            titulo={form.id ? `Editar ${TIPOS[form.tipo].singular.toLowerCase()}` : `Novo ${TIPOS[form.tipo].singular.toLowerCase()}`}
            sub="A data de validade e o que faz o painel avisar antes de vencer."
            acao={
              <button className="btn-ghost" onClick={() => { setForm(null); setArquivo(null); }}>
                <X size={15} /> Fechar
              </button>
            }
          />
          <form onSubmit={salvar} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="label" htmlFor="a-nome">Nome</label>
                <input
                  id="a-nome"
                  className="input"
                  value={form.nome}
                  onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                  placeholder={form.tipo === "veiculo" ? "ex: Fiorino branca" : form.tipo === "maquina" ? "ex: Router CNC" : "ex: Alvara de funcionamento"}
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="a-categoria">Categoria</label>
                <input
                  id="a-categoria"
                  className="input"
                  list="cats"
                  value={form.categoria}
                  onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
                  placeholder="escolha ou digite"
                />
                <datalist id="cats">
                  {(CATEGORIAS[form.tipo] || []).map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="label" htmlFor="a-identificacao">
                  {form.tipo === "veiculo"
                    ? "Placa"
                    : form.tipo === "maquina"
                      ? "Patrimônio"
                      : form.tipo === "seguro"
                        ? "Número da apólice"
                        : "Número do documento"}
                </label>
                <input
                  id="a-identificacao"
                  className="input"
                  value={form.identificacao}
                  onChange={(e) => setForm((f) => ({ ...f, identificacao: e.target.value }))}
                />
              </div>
              <div>
                <label className="label" htmlFor="a-emissao">
                  {form.tipo === "seguro" ? "Início da vigência" : "Emissão"}
                </label>
                <input
                  id="a-emissao" type="date" className="input" value={form.emissao} onChange={(e) => setForm((f) => ({ ...f, emissao: e.target.value }))} />
              </div>
              <div>
                <label className="label" htmlFor="a-validade">
                  {form.tipo === "seguro" ? "Fim da vigência" : "Validade / próxima ação"}
                </label>
                <input
                  id="a-validade" type="date" className="input" value={form.validade} onChange={(e) => setForm((f) => ({ ...f, validade: e.target.value }))} />
              </div>
              <div>
                <label className="label" htmlFor="a-responsavel">
                  {form.tipo === "seguro" ? "Corretor" : "Responsável"}
                </label>
                <input
                  id="a-responsavel" className="input" value={form.responsavel} onChange={(e) => setForm((f) => ({ ...f, responsavel: e.target.value }))} placeholder={form.tipo === "seguro" ? "corretor e telefone" : "quem cuida disso"} />
              </div>

              {/* Km/horas em campo de TEXTO, nao type="number": quem digita
                  "90.000" (o jeito brasileiro) num input numerico entrega
                  "90.000" ao navegador, que le como noventa -- ou como valor
                  invalido e devolve string vazia. paraNumero/paraCampo fazem a
                  ida e a volta, igual as Licitacoes. */}
              {/* Dinheiro em campo de TEXTO: "12.500,00" num input numérico
                  volta vazio ou vira doze e meio. */}
              {form.tipo === "seguro" && (
                <>
                  <div>
                    <label className="label" htmlFor="a-seguradora">Seguradora</label>
                    <input
                      id="a-seguradora"
                      className="input"
                      value={form.seguradora || ""}
                      onChange={(e) => setForm((f) => ({ ...f, seguradora: e.target.value }))}
                      placeholder="ex: Porto Seguro, Tokio Marine"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="a-segurado">Valor segurado (R$)</label>
                    <input
                      id="a-segurado"
                      inputMode="decimal"
                      className="input"
                      value={form.valorSegurado ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, valorSegurado: e.target.value }))}
                      onBlur={(e) => setForm((f) => ({ ...f, valorSegurado: paraCampo(paraNumero(e.target.value)) }))}
                      placeholder="ex: 250.000,00"
                    />
                    <p className="mt-1 text-xs text-slate-500">Quanto a apólice cobre.</p>
                  </div>
                  <div>
                    <label className="label" htmlFor="a-premio">Prêmio (R$ no ano)</label>
                    <input
                      id="a-premio"
                      inputMode="decimal"
                      className="input"
                      value={form.valor ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
                      onBlur={(e) => setForm((f) => ({ ...f, valor: paraCampo(paraNumero(e.target.value)) }))}
                      placeholder="ex: 3.480,00"
                    />
                    <p className="mt-1 text-xs text-slate-500">O que a empresa paga por ela.</p>
                  </div>
                </>
              )}

              {ehVeicMaq && (
                <>
                  <div>
                    <label className="label" htmlFor="a-medidor">{form.unidadeMedidor === "km" ? "Km atual" : "Horas atuais"}</label>
                    <input
                      id="a-medidor"
                      inputMode="decimal"
                      className="input"
                      value={form.medidorAtual}
                      onChange={(e) => setForm((f) => ({ ...f, medidorAtual: e.target.value }))}
                      onBlur={(e) => setForm((f) => ({ ...f, medidorAtual: paraCampo(paraNumero(e.target.value)) }))}
                      placeholder={form.unidadeMedidor === "km" ? "ex: 90.000" : "ex: 1.200"}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="a-proximo">Próxima manutenção em</label>
                    <input
                      id="a-proximo"
                      inputMode="decimal"
                      className="input"
                      value={form.medidorProximo}
                      onChange={(e) => setForm((f) => ({ ...f, medidorProximo: e.target.value }))}
                      onBlur={(e) => setForm((f) => ({ ...f, medidorProximo: paraCampo(paraNumero(e.target.value)) }))}
                      placeholder={form.unidadeMedidor === "km" ? "ex: 95.000" : "ex: 1.500"}
                    />
                  </div>
                </>
              )}
            </div>

            <div>
              <label className="label" htmlFor="a-observacao">Observação</label>
              <input
                  id="a-observacao" className="input" value={form.observacao} onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))} placeholder={form.tipo === "seguro" ? "o que cobre, franquia, número do sinistro..." : "onde renovar, órgão, telefone do contato..."} />
            </div>

            <div>
              <label className="label" htmlFor="a-arquivo">
                {form.tipo === "seguro" ? "Apólice em PDF (até ~3 MB)" : "Arquivo (PDF ou imagem, até ~3 MB)"}
              </label>
              <input
                id="a-arquivo"
                type="file"
                accept="application/pdf,image/*"
                onChange={(e) => setArquivo(e.target.files?.[0] || null)}
                className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:font-display file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
              />
              {form.temArquivo && !arquivo && (
                <p className="mt-1 text-xs text-slate-500">
                  Já tem arquivo guardado ({form.arquivoNome || "documento"}). Escolher outro substitui.
                </p>
              )}
            </div>

            <button className="btn-primary" disabled={salvando}>
              <Upload size={16} strokeWidth={2.4} />
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </form>
        </Card>
      )}

      <Card>
        <SectionTitle
          titulo={TIPOS[tipo].rotulo}
          sub="Ordenado pelo que esta pior: vencido primeiro."
          acao={
            <Segmented
              opcoes={Object.entries(TIPOS).map(([id, t]) => ({ valor: id, rotulo: t.rotulo }))}
              valor={tipo}
              onChange={(v) => {
                setTipo(v);
                setBusca("");
              }}
            />
          }
        />

        {recorte && (
          <div className="sem-impressao mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">
            <span>
              {recorte === "vencido" ? "Vencidos" : recorte === "urgente" ? "Vencendo em 30 dias" : "Sem data"}:
            </span>
            {ondeEstao.map((o) => (
              <button
                key={o.tipo}
                onClick={() => setTipo(o.tipo)}
                aria-pressed={tipo === o.tipo}
                className={`rounded-full px-2.5 py-0.5 font-display text-xs transition-colors ${
                  tipo === o.tipo ? "bg-brand text-white" : "bg-white text-brand-700 hover:bg-brand-100"
                }`}
              >
                {o.rotulo} {o.quantos}
              </button>
            ))}
            <button className="btn-ghost !py-1 !px-2 text-xs" onClick={() => setRecorte(null)}>
              <X size={13} /> ver todos
            </button>
          </div>
        )}

        {/* A carteira de seguros: prêmio e cobertura só fazem sentido somados. */}
        {tipo === "seguro" && carteira.quantas > 0 && !recorte && (
          <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            <span>
              <b className="text-slate-900">{numero(carteira.quantas)}</b>{" "}
              {carteira.quantas === 1 ? "apólice vigente" : "apólices vigentes"}
            </span>
            <span>
              cobrem <b className="text-slate-900">{moeda(carteira.segurado)}</b>
            </span>
            <span>
              custam <b className="text-slate-900">{moeda(carteira.premio)}</b> no ano
            </span>
          </div>
        )}

        <div className="sem-impressao mb-4 relative max-w-sm">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={tipo === "seguro" ? "Buscar por seguradora, ramo ou apólice" : "Buscar por nome, categoria ou responsável"} />
        </div>

        {daLente.length === 0 && recorte ? (
          <Empty>
            Nada aqui em {TIPOS[tipo].rotulo.toLowerCase()}
            {ondeEstao.length ? ` -- veja em ${ondeEstao.map((o) => o.rotulo.toLowerCase()).join(", ")}.` : "."}
          </Empty>
        ) : daLente.length === 0 ? (
          <Empty>
            Nenhum {TIPOS[tipo].singular.toLowerCase()} cadastrado ainda.{" "}
            <button className="btn-ghost ml-1" onClick={() => setForm(vazio(tipo))}>
              Cadastrar o primeiro
            </button>
          </Empty>
        ) : (
          <div className="space-y-2">
            {daLente.map((it) => {
              const Ic = ICONE[it.tipo];
              const t = TOM[it.sit.nivel] || TOM.sem;
              return (
                <div
                  key={it.id}
                  className={`card flex flex-wrap items-center gap-3 border-l-4 p-4 ${
                    it.sit.nivel === "vencido" ? "border-l-bad-600" : it.sit.nivel === "urgente" ? "border-l-warn-600" : "border-l-transparent"
                  }`}
                >
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 ${t.texto}`}>
                    <Ic size={18} strokeWidth={2.2} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="font-display text-sm font-semibold text-slate-900">
                      {it.nome}
                      {it.identificacao && <span className="ml-2 font-normal text-slate-400">{it.identificacao}</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {(it.tipo === "seguro"
                        ? [
                            it.seguradora,
                            it.categoria,
                            it.valorSegurado ? `cobre ${moeda(it.valorSegurado)}` : null,
                            it.valor ? `${moeda(it.valor)}/ano` : null,
                            it.validade && `vigência até ${dataLonga(it.validade)}`,
                          ]
                        : [
                            it.categoria,
                            it.responsavel && `resp. ${it.responsavel}`,
                            it.validade && `validade ${dataLonga(it.validade)}`,
                          ]
                      )
                        .filter(Boolean)
                        .join(" · ") || "sem detalhes"}
                    </p>
                    {it.observacao && <p className="mt-0.5 text-xs text-slate-400">{it.observacao}</p>}
                  </div>

                  <span className={`${t.chip} shrink-0`}>{it.sit.rotulo}</span>

                  <div className="flex shrink-0 items-center gap-1">
                    {it.temArquivo && (
                      <button onClick={() => baixar(it)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-brand" title="Abrir o arquivo" aria-label={`Abrir o arquivo de ${it.nome}`}>
                        <Download size={15} />
                      </button>
                    )}
                    <button onClick={() => { setForm({ ...it, medidorAtual: paraCampo(it.medidorAtual), medidorProximo: paraCampo(it.medidorProximo), valor: paraCampo(it.valor), valorSegurado: paraCampo(it.valorSegurado) }); setArquivo(null); }} className="rounded-lg px-2 py-1 font-display text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800">
                      Editar
                    </button>
                    <button onClick={() => apagar(it)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-bad-50 hover:text-bad-700" title="Remover" aria-label={`Remover ${it.nome}`}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
