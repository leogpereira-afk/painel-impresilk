// Manutenções: o que a empresa gasta para as coisas continuarem funcionando --
// os carros, as máquinas e o prédio (câmeras, ar condicionado, elétrica,
// hidráulica, portões).
//
// A tela abre pelo DINHEIRO e pelo ATRASO, nessa ordem: é o que ninguém
// consegue responder hoje sem procurar nota fiscal na gaveta. O histórico por
// item existe para a conta que decide -- o carro que vai ao mecânico todo mês
// custa mais que a parcela de um novo, e isso só aparece somando.
//
// CADASTRO: as três famílias nascem aqui, cada uma com a sua ficha técnica
// (placa e ano do carro, número de série da máquina, local da câmera). O
// registro é gravado na MESMA coleção de ativos que a tela "Documentos e
// ativos" usa -- então o carro cadastrado aqui aparece lá para receber IPVA e
// licenciamento, e não existem duas verdades sobre o mesmo veículo.
//
// O formulário daqui manda menos campos que o de lá (não pede validade de
// documento). Quem garante que salvar por aqui não apaga o IPVA é o servidor:
// painel-ativos mantém o que não veio no corpo. Ver o comentário de `limpo`.

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
import { listarAtivos, salvarAtivo, removerAtivo } from "../services/ativos.js";
// O item cadastrado aqui também é patrimônio: mesma coisa, duas perguntas
// ("quanto me custa para manter" e "quanto vale, e onde está").
import { lerSetores, salvarBem } from "../services/patrimonio.js";
import { lerManutencoes, salvarManutencao, removerManutencao } from "../services/manutencoes.js";
import { getFluxoMensal } from "../services/mubi.js";
import {
  calcManutencoes,
  agruparGastos,
  FAMILIAS,
  CATEGORIAS_POR_FAMILIA,
  TIPOS_SERVICO,
  ESPEC_CAMPOS,
  resumoEspec,
  unidadeDe,
  UNIDADE_PADRAO,
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
  Segmented,
} from "../components/ui.jsx";

const ICONE_FAMILIA = { veiculo: Car, maquina: Cog, predial: Building2 };

// As fatias da barra do mês, na ordem do cabeçalho da coluna. "removido" entra
// porque o dinheiro dele conta no total: deixá-lo fora faria a barra não fechar
// com o valor da linha.
const FATIAS = [
  { id: "veiculo", rotulo: "Veículos", cor: "bg-brand" },
  { id: "maquina", rotulo: "Máquinas", cor: "bg-brand-400" },
  { id: "predial", rotulo: "Prédio", cor: "bg-brand-200" },
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
  fornecedor: "",
  pedido: "",
  medidor: "",
  proxima: "",
};

const ITEM_VAZIO = {
  id: "",
  tipo: "predial",
  nome: "",
  categoria: "",
  identificacao: "",
  responsavel: "",
  observacao: "",
  especificacao: {},
  medidorAtual: "",
  medidorProximo: "",
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

// UM DONO PARA A PLACA.
//
// `identificacao` é o campo que a tela "Documentos e ativos" já usa para a
// placa (lá o rótulo é literalmente "Placa", e é o que aparece na listagem
// dela). A ficha nova criou um segundo lugar para o mesmo dado no MESMO
// registro -- e duas telas podiam mostrar placas diferentes do mesmo carro.
//
// Regra: para veículo e máquina, a FICHA manda, e `identificacao` é sempre um
// espelho dela. Espelhar só "quando estivesse vazio" não resolvia: corrigir a
// placa na ficha deixava a outra tela com a placa velha para sempre.
const identificacaoDe = (f) => {
  const e = f.especificacao || {};
  if (f.tipo === "veiculo") {
    const placa = String(e.placa || "").trim();
    if (placa) return placa;
  }
  if (f.tipo === "maquina") {
    const serie = String(e.numeroSerie || "").trim();
    if (serie) return serie;
  }
  return String(f.identificacao || "").trim();
};

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
              <option value="">escolha o carro, a máquina ou o item do prédio</option>
              {Object.entries(FAMILIAS).map(([fam, meta]) => {
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

// Cadastro do item. O TIPO vem primeiro porque ele muda o resto do formulário:
// carro pede placa, máquina pede número de série, câmera pede local. Um
// formulário único com todos os campos obrigaria a pular linha em branco.
const AJUDA_TIPO = {
  veiculo: "Carro, moto, van ou caminhão da empresa.",
  maquina: "Impressora, router, laser, DTF, compressor — o que produz.",
  predial: "Câmera, ar condicionado, quadro elétrico, bomba, portão.",
};
const EXEMPLO_NOME = {
  veiculo: "ex: Strada da instalação",
  maquina: "ex: Laser fibra 1530",
  predial: "ex: Ar condicionado da produção",
};

function FormItem({ inicial, salvando, aoSalvar, aoFechar, setores }) {
  const [f, setF] = useState(inicial);
  const trocar = (campo) => (e) => setF((v) => ({ ...v, [campo]: e.target.value }));
  const trocarEspec = (campo, maiusculo) => (e) => {
    const v = maiusculo ? e.target.value.toUpperCase() : e.target.value;
    setF((old) => ({ ...old, especificacao: { ...(old.especificacao || {}), [campo]: v } }));
  };
  // Trocar o tipo de um item JÁ cadastrado o servidor recusa (o edital viraria
  // documento e mudaria de permissão). Então o seletor só existe no cadastro.
  const novo = !f.id;
  const campos = ESPEC_CAMPOS[f.tipo] || [];
  const categorias = CATEGORIAS_POR_FAMILIA[f.tipo] || [];
  const unidade = UNIDADE_PADRAO[f.tipo] || "";
  const meta = FAMILIAS[f.tipo] || FAMILIAS.predial;

  return (
    <Card>
      <SectionTitle
        titulo={f.id ? `Editar ${meta.singular.toLowerCase()}` : "Novo item"}
        sub={
          f.id
            ? "O que você mudar aqui vale também na tela Documentos e ativos — é o mesmo cadastro."
            : "Escolha o que é: cada tipo pede a ficha dele. O item passa a valer nas duas telas."
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
        {novo ? (
          <div>
            <span className="label">O que é</span>
            <div className="grid gap-2 sm:grid-cols-3">
              {Object.entries(FAMILIAS).map(([id, m]) => {
                const Icone = ICONE_FAMILIA[id] || Wrench;
                const marcado = f.tipo === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={marcado}
                    onClick={() =>
                      // Trocar de tipo LIMPA a ficha, a categoria E o medidor:
                      // placa não faz sentido numa câmera (o servidor
                      // descartaria a chave em silêncio, e a pessoa veria o dado
                      // sumir sem entender), e o km digitado para um carro
                      // ficava escondido no estado e ia gravado num item predial
                      // -- que nem mostra o campo.
                      setF((v) => ({
                        ...v, tipo: id, especificacao: {}, categoria: "",
                        medidorAtual: "", medidorProximo: "",
                      }))
                    }
                    className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors ${
                      marcado ? "border-brand-300 bg-brand-50" : "hover:bg-slate-50"
                    }`}
                    style={marcado ? undefined : { borderColor: "var(--hairline)" }}
                  >
                    <Icone size={18} strokeWidth={2.2} className={marcado ? "text-brand" : "text-slate-400"} />
                    <span className="min-w-0">
                      <span className={`block font-display text-sm font-semibold ${marcado ? "text-brand-700" : "text-slate-900"}`}>
                        {m.singular}
                      </span>
                      <span className="block text-xs leading-snug text-slate-500">{AJUDA_TIPO[id]}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Tipo: <b>{meta.singular}</b> — não dá para trocar depois de cadastrado. Se errou, retire e
            cadastre de novo.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="label" htmlFor="i-nome">Nome</label>
            <input
              id="i-nome"
              className="input"
              placeholder={EXEMPLO_NOME[f.tipo]}
              value={f.nome}
              onChange={trocar("nome")}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="i-categoria">Categoria</label>
            <input
              id="i-categoria"
              className="input"
              list={`cats-${f.tipo}`}
              placeholder="escolha ou digite"
              value={f.categoria}
              onChange={trocar("categoria")}
            />
            <datalist id={`cats-${f.tipo}`}>
              {categorias.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="label" htmlFor="i-responsavel">Responsável</label>
            <input
              id="i-responsavel"
              className="input"
              placeholder="quem cuida disso"
              value={f.responsavel}
              onChange={trocar("responsavel")}
            />
          </div>
        </div>

        {/* A ficha técnica da família. Os campos moram em `especificacao` e a
            lista é a mesma que o servidor aceita (ESPEC_PERMITIDA). */}
        <div>
          <p className="mb-2 font-display text-xs font-semibold uppercase tracking-wide text-slate-500">
            Ficha {f.tipo === "veiculo" ? "do veículo" : f.tipo === "maquina" ? "da máquina" : "do item"}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {campos.map((c) => {
              const valor = (f.especificacao || {})[c.id] || "";
              const id = `e-${c.id}`;
              return (
                <div key={c.id} className={c.curto ? "" : ""}>
                  <label className="label" htmlFor={id}>{c.rotulo}</label>
                  {c.opcoes ? (
                    <>
                      <input
                        id={id}
                        className="input"
                        list={`op-${c.id}`}
                        placeholder="escolha ou digite"
                        value={valor}
                        onChange={trocarEspec(c.id)}
                      />
                      <datalist id={`op-${c.id}`}>
                        {c.opcoes.map((o) => (
                          <option key={o} value={o} />
                        ))}
                      </datalist>
                    </>
                  ) : (
                    <input
                      id={id}
                      type={c.data ? "date" : "text"}
                      className="input"
                      placeholder={c.ph || ""}
                      value={valor}
                      onChange={trocarEspec(c.id, c.maiusculo)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Medidor só onde ele existe. A câmera não roda km nem hora. */}
        {unidade && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="label" htmlFor="i-medatual">
                {unidade === "km" ? "Km atual" : "Horas de uso"}
              </label>
              <input
                id="i-medatual"
                inputMode="decimal"
                className="input"
                placeholder={unidade === "km" ? "ex: 92.400" : "ex: 1.340"}
                value={f.medidorAtual}
                onChange={trocar("medidorAtual")}
                onBlur={(e) => setF((v) => ({ ...v, medidorAtual: paraCampo(paraNumero(e.target.value)) }))}
              />
            </div>
            <div>
              <label className="label" htmlFor="i-medprox">
                {unidade === "km" ? "Próxima revisão em (km)" : "Próxima revisão em (horas)"}
              </label>
              <input
                id="i-medprox"
                inputMode="decimal"
                className="input"
                placeholder={unidade === "km" ? "ex: 100.000" : "ex: 1.500"}
                value={f.medidorProximo}
                onChange={trocar("medidorProximo")}
                onBlur={(e) => setF((v) => ({ ...v, medidorProximo: paraCampo(paraNumero(e.target.value)) }))}
              />
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Identificação só no predial. Em veículo e máquina ela é o espelho
              da placa / do nº de série da ficha -- ter os dois na mesma tela
              era convidar a pessoa a digitar valores diferentes para a mesma
              coisa, e a outra tela mostraria um deles. */}
          {f.tipo === "predial" && (
            <div>
              <label className="label" htmlFor="i-identificacao">Onde fica / identificação</label>
              <input
                id="i-identificacao"
                className="input"
                placeholder="ex: sala da produção, 3º andar"
                value={f.identificacao}
                onChange={trocar("identificacao")}
              />
            </div>
          )}
          <div className="sm:col-span-2">
            <label className="label" htmlFor="i-observacao">Observação</label>
            <input
              id="i-observacao"
              className="input"
              placeholder="telefone da assistência, particularidades..."
              value={f.observacao}
              onChange={trocar("observacao")}
            />
          </div>

          {/* FICHA DE PATRIMÔNIO — o mesmo item, a outra pergunta.
              Aqui se pergunta quanto custa para manter; no Patrimônio, quanto
              vale e onde está. Eram dois cadastros que não se conheciam, e a
              mesma máquina era digitada duas vezes com nomes diferentes — daí
              o valor do seguro nunca fechar com a lista de manutenção.
              Preenchido aqui, o item nasce nas duas telas. A etiqueta é gerada
              pelo servidor na primeira gravação. */}
          <div className="sm:col-span-2 mt-1 border-t pt-3" style={{ borderColor: "var(--hairline)" }}>
            <p className="label">Ficha de patrimônio <span className="font-normal text-slate-400">— aparece também em Patrimônio</span></p>
          </div>
          <div>
            <label className="label" htmlFor="i-setor">Setor</label>
            <select id="i-setor" className="input" value={f.setorSigla || ""} onChange={trocar("setorSigla")}>
              <option value="">onde fica...</option>
              {(setores || []).map((s) => (
                <option key={s.sigla} value={s.sigla}>{s.sigla} — {s.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="i-nf">Nota fiscal</label>
            <input id="i-nf" className="input" placeholder="número da NF"
              value={f.nf || ""} onChange={trocar("nf")} />
          </div>
          <div>
            <label className="label" htmlFor="i-aquisicao">Data de aquisição</label>
            <input id="i-aquisicao" type="date" className="input"
              value={f.dataAquisicao || ""} onChange={trocar("dataAquisicao")} />
          </div>
          <div>
            <label className="label" htmlFor="i-valor">Valor pago (R$)</label>
            <input id="i-valor" className="input" inputMode="decimal" placeholder="ex: 78.500,00"
              value={f.valor || ""} onChange={trocar("valor")} />
          </div>
        </div>

        {novo && f.tipo === "veiculo" && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            IPVA, licenciamento e seguro não se cadastram aqui: este veículo vai aparecer em{" "}
            <b>Documentos e ativos</b>, que é a tela do vencimento de documento.
          </p>
        )}
        {novo && f.tipo === "maquina" && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Contrato de assistência e seguro com data de vencimento se cadastram em{" "}
            <b>Documentos e ativos</b>, que é a tela do vencimento.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-primary" disabled={salvando}>
            {salvando ? "Salvando..." : f.id ? "Salvar" : "Cadastrar item"}
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

function LinhaItem({ item, aberto, aoAbrir, aoLancar, aoEditarItem, aoApagarItem, aoEditar, aoApagar }) {
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
          {/* Editar vale para as três famílias: agora o cadastro nasce aqui, e
              o servidor preserva o que este formulário não manda (validade do
              IPVA, anexo do CRLV). Antes só o predial podia, e com razão. */}
          <button
            type="button"
            onClick={aoEditarItem}
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            title="Editar a ficha deste item"
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            onClick={aoApagarItem}
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-bad-50 hover:text-bad-700"
            title="Retirar item"
          >
            <Trash2 size={14} />
          </button>
        </span>
      </div>
      {aberto && <Historico item={item} aoEditar={aoEditar} aoApagar={aoApagar} />}
    </div>
  );
}

// ---------------------------------------------------------------- página

export default function Manutencoes() {
  const [itens, setItens] = useState(null);
  const [mapa, setMapa] = useState(null);
  const [erro, setErro] = useState(null);
  const [msg, setMsg] = useState(null);
  const [familia, setFamilia] = useState("tudo");
  /* OS CARTÕES VIRAM RECORTE. "Atrasadas: 4" era um número que não virava
     lista -- para achar as 4 era rolar a tabela conferindo etiqueta por
     etiqueta. Clicar filtra, clicar de novo volta. */
  const [recorte, setRecorte] = useState(null); // "vencida" | "sem" | null
  const [busca, setBusca] = useState("");
  // "itens" (o que existe e quanto já custou) x "historico" (quanto saiu em
  // cada mês de cada ano). São duas perguntas diferentes na mesma tela.
  const [aba, setAba] = useState("itens");
  const [anoHist, setAnoHist] = useState("");
  const [mesAberto, setMesAberto] = useState(null);
  const [erp, setErp] = useState(null);
  const [aberto, setAberto] = useState(null);
  const [formLanc, setFormLanc] = useState(null);
  const [formItem, setFormItem] = useState(null);
  // Setores do Patrimônio: o item cadastrado aqui nasce lá também, e "onde
  // fica" é a pergunta que a outra tela faz.
  const [setores, setSetores] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const topoForm = useRef(null);

  // "Hoje" em estado é refeito ao voltar para a aba: numa tela de prazo, o dia
  // congelado faz "atrasada" continuar dizendo "em 1 dia" no dia seguinte.
  const [hojeISO, setHojeISO] = useState(() => ymdLocal(new Date()));

  const carregar = useCallback(async () => {
    try {
      const [lista, m, st] = await Promise.all([listarAtivos(), lerManutencoes(), lerSetores().catch(() => ({}))]);
      setSetores(Object.values(st || {}).filter((x) => x?.sigla).sort((a2, b2) => a2.sigla.localeCompare(b2.sigla)));
      setItens(lista.filter((x) => FAMILIAS[x.tipo]));
      setMapa(m);
      setErro(null);
    } catch (e) {
      setErro(e.message);
      setItens([]);
      setMapa({});
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

  const vm = useMemo(
    () => calcManutencoes(itens || [], mapa || {}, hojeISO),
    [itens, mapa, hojeISO]
  );

  const visiveis = useMemo(() => {
    const q = semAcento(busca.trim());
    return vm.lista
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
  }, [vm, familia, busca, recorte]);

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
    Object.keys(erp?.anos || {}).forEach((a) => s.add(String(a)));
    return [...s].sort((a, b) => b.localeCompare(a));
  }, [hist, erp]);

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
    const cats = anoTela ? erp?.anos?.[anoTela]?.saidasPorCategoria : null;
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
  }, [erp, anoTela]);

  const rolarAoForm = () =>
    setTimeout(() => topoForm.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);

  const abrirLancamento = (ativoId = "", lancamento = null) => {
    setFormItem(null);
    setFormLanc(
      lancamento
        ? {
            ...LANCAMENTO_VAZIO,
            ...lancamento,
            valor: paraCampo(lancamento.valor),
            medidor: paraCampo(lancamento.medidor),
          }
        : { ...LANCAMENTO_VAZIO, ativoId, data: hojeISO }
    );
    rolarAoForm();
  };

  const abrirItem = (item = null, tipo = "predial") => {
    setFormLanc(null);
    setFormItem(
      item
        ? {
            ...ITEM_VAZIO,
            ...item,
            especificacao: { ...(item.especificacao || {}) },
            // Medidor vem do servidor como número e o campo é de texto: sem a
            // conversão, 92400 aparece cru e volta gravado como 92.400 → 92.
            medidorAtual: paraCampo(item.medidorAtual),
            medidorProximo: paraCampo(item.medidorProximo),
          }
        : { ...ITEM_VAZIO, tipo, especificacao: {} }
    );
    rolarAoForm();
  };

  async function gravarLancamento(f) {
    if (!f.ativoId) return setMsg({ tom: "erro", texto: "Escolha em que item o serviço foi feito." });
    if (!f.data) return setMsg({ tom: "erro", texto: "Informe a data do serviço." });
    setSalvando(true);
    setMsg(null);
    try {
      const id = f.id || `mnt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const item = (itens || []).find((i) => i.id === f.ativoId);
      const dados = {
        ativoId: f.ativoId,
        // Nome desnormalizado: se o item for retirado, o gasto continua
        // identificável no histórico em vez de virar "(sem item)".
        ativoNome: item?.nome || "",
        data: f.data,
        valor: paraNumero(f.valor),
        tipo: f.tipo,
        descricao: f.descricao.trim(),
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

  async function gravarItem(f) {
    if (!FAMILIAS[f.tipo]) return setMsg({ tom: "erro", texto: "Escolha se é veículo, máquina ou item do prédio." });
    setSalvando(true);
    setMsg(null);
    try {
      // MANDA SÓ O QUE ESTA TELA EDITA -- nada de espalhar `...f`.
      //
      // O servidor mantém o campo que NÃO vem no corpo. Se eu mandasse o
      // registro inteiro, mandaria junto a `validade` e o `temArquivo` que
      // foram lidos quando a página abriu: alguém mexe no IPVA em "Documentos
      // e ativos", eu salvo a ficha aqui meia hora depois e gravo o valor
      // velho por cima. A proteção do servidor só funciona com o campo
      // ausente de verdade -- reenviar o cache da tela a anula.
      const salvo = await salvarAtivo({
        id: f.id || undefined,
        tipo: f.tipo,
        nome: f.nome,
        categoria: f.categoria,
        responsavel: f.responsavel,
        identificacao: identificacaoDe(f),
        observacao: f.observacao,
        especificacao: f.especificacao || {},
        // `unidadeMedidor` é gravada junto para o lançamento saber se pergunta
        // km ou horas -- antes ela nunca era gravada e todo item caía no
        // fallback "horas", pedindo horas de uso de uma câmera.
        unidadeMedidor: UNIDADE_PADRAO[f.tipo] || "",
        medidorAtual: paraNumero(f.medidorAtual),
        medidorProximo: paraNumero(f.medidorProximo),
      });
      /* O MESMO ITEM, NAS DUAS TELAS.
         Um carro é uma coisa só: aqui interessa quanto custa para manter, no
         Patrimônio interessa quanto vale e onde está. Eram dois cadastros
         separados, sem saber um do outro — e a mesma máquina era digitada duas
         vezes, com nomes diferentes, o que faz o valor do seguro nunca fechar
         com a lista de manutenção.
         O ativo é o dono do vínculo (`origemAtivoId`); o código da etiqueta o
         servidor gera na primeira gravação. Falhar aqui NÃO derruba o cadastro
         do ativo: ele já está salvo, e perder o espelho é menos ruim do que
         dizer que não cadastrou quando cadastrou. */
      try {
        const idBem = f.bemId || `pat-${salvo.id}`;
        await salvarBem(idBem, {
          origemAtivoId: salvo.id,
          setorSigla: f.setorSigla || "",
          nomeGenerico: f.nome,
          descricaoTecnica: [f.categoria, identificacaoDe(f)].filter(Boolean).join(" · "),
          nf: f.nf || "",
          dataAquisicao: f.dataAquisicao || "",
          valor: paraNumero(f.valor),
          situacao: "uso",
          observacao: f.observacao || "",
        });
      } catch (e2) {
        console.warn("[manutencoes] item salvo, mas o espelho no patrimônio falhou:", e2?.message || e2);
      }

      setItens((l) => {
        const outros = (l || []).filter((x) => x.id !== salvo.id);
        return [...outros, salvo];
      });
      setFormItem(null);
      // Sem concordância de gênero: "Câmera cadastrado" era o que saía antes.
      setMsg({ tom: "ok", texto: f.id ? `Ficha salva: ${salvo.nome}.` : `Item cadastrado: ${salvo.nome}.` });
    } catch (e) {
      setMsg({ tom: "erro", texto: e.message });
    } finally {
      setSalvando(false);
    }
  }

  async function apagarItem(item) {
    const linhas = [`Retirar "${item.nome}"?`];
    if (item.quantos) {
      linhas.push(
        `\nEle tem ${item.quantos} ${item.quantos === 1 ? "manutenção lançada" : "manutenções lançadas"} ` +
        `(${moeda(item.total)}). O histórico continua no total da empresa, mas deixa de ficar ligado a este item.`
      );
    }
    // Este item é o MESMO da tela Documentos e ativos. Retirar aqui leva junto
    // o documento e o anexo de lá -- dizer isso na hora é a diferença entre um
    // clique consciente e descobrir o sumiço quando a fiscalização pedir.
    if (item.familia !== "predial" || item.validade || item.temArquivo) {
      const perde = [
        item.validade ? `a validade em ${dataLonga(item.validade)}` : null,
        item.temArquivo ? `o arquivo anexado${item.arquivoNome ? ` (${item.arquivoNome})` : ""}` : null,
      ].filter(Boolean);
      linhas.push(
        `\nEle some também de "Documentos e ativos" -- é o mesmo cadastro` +
        (perde.length ? `, e leva junto ${perde.join(" e ")}.` : ".")
      );
    }
    if (!window.confirm(linhas.join("\n"))) return;
    setMsg(null);
    try {
      await removerAtivo(item.id);
      setItens((l) => (l || []).filter((x) => x.id !== item.id));
      if (formItem?.id === item.id) setFormItem(null);
      setMsg({ tom: "aviso", texto: `${item.nome} saiu da lista.` });
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

  if (erro && !itens?.length) return <ErroModulo mensagem={erro} aoTentar={carregar} />;
  if (itens === null || mapa === null) return <CarregandoModulo />;

  const k = vm.kpis;

  return (
    <div className="space-y-8">
      <PageTitle
        titulo="Manutenções"
        descricao="O que os carros, as máquinas e o prédio custam para continuar funcionando — e o que já está atrasado."
        acao={
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => abrirLancamento()}>
              <Plus size={16} strokeWidth={2.4} />
              Nova manutenção
            </button>
            <button className="btn-ghost" onClick={() => abrirItem()}>
              <Wrench size={16} strokeWidth={2.2} />
              Novo item
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
          sub={k.atrasadas ? (k.atrasadas === 1 ? "passou da data prevista" : "passaram da data prevista") : "nada atrasado"}
          tom={k.atrasadas ? "bad" : "ok"}
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
        {formItem && (
          <FormItem
            key={formItem.id || "novo-item"}
            inicial={formItem}
            setores={setores}
            salvando={salvando}
            aoSalvar={gravarItem}
            aoFechar={() => setFormItem(null)}
          />
        )}
      </div>

      {vm.ranking.length > 0 && (
        <Card>
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
        </Card>
      )}

      {/* Duas perguntas, duas abas: "o que eu tenho e quanto cada coisa já
          custou" e "quanto saiu em cada mês". Misturar as duas na mesma lista
          era o que fazia a segunda não ter resposta nenhuma. */}
      <div className="sem-impressao">
        <Segmented
          opcoes={[
            { valor: "itens", rotulo: "Itens" },
            { valor: "historico", rotulo: "Histórico por mês" },
          ]}
          valor={aba}
          onChange={setAba}
        />
      </div>

      {aba === "itens" ? (
      <Card>
        <SectionTitle
          titulo="Itens e histórico"
          sub="Atrasados primeiro. Toque na seta para ver todos os serviços e quanto custaram."
          acao={
            <Segmented
              opcoes={[
                { valor: "tudo", rotulo: "Tudo" },
                ...Object.entries(FAMILIAS).map(([id, f]) => ({ valor: id, rotulo: f.rotulo })),
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

        <div className="sem-impressao mb-4 relative max-w-sm">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, placa, categoria ou responsável"
          />
        </div>

        {visiveis.length === 0 ? (
          <Empty>
            {recorte
              ? `Nada ${recorte === "vencida" ? "atrasado" : "sem próxima data"} com esse filtro.`
              : busca.trim()
              ? `Nada com "${busca}".`
              : familia !== "tudo"
                ? `Nenhum item em ${FAMILIAS[familia].rotulo.toLowerCase()}${
                    vm.lista.length ? " — mas há itens nas outras abas." : "."
                  } Use "Cadastrar item".`
                : "Nenhum item cadastrado ainda. Use 'Cadastrar item' — vale para carro, máquina e prédio."}
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
                aoEditarItem={() => abrirItem(i)}
                aoApagarItem={() => apagarItem(i)}
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
