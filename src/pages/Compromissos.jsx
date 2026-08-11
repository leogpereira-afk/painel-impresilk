// Compromissos: a agenda de campo da vendedora -- visita, medicao, entrega,
// instalacao, retorno de orcamento -- e as situacoes a resolver que nao tem
// data marcada.
//
// A tela abre pelo que esta ATRASADO e depois por hoje: e assim que o problema
// chega. Cada vendedora enxerga so os dela (o servidor separa por dono); a
// direcao ve os de todo mundo e pode filtrar por pessoa.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarCheck,
  Plus,
  Check,
  Trash2,
  Pencil,
  AlertTriangle,
  ChevronDown,
  Users,
  Ruler,
  Truck,
  Wrench,
  Phone,
  FileText,
  HandCoins,
  CircleDot,
  Forward,
  MessageCircle,
  Paperclip,
} from "lucide-react";
import {
  lerCompromissos,
  salvarCompromisso,
  removerCompromisso,
  encaminharCompromisso,
  mandarRecado,
  lerAnexo,
  arquivoParaBase64,
  abrirBase64,
  lerPessoas,
} from "../services/compromissos.js";
import { pdfDaConversa, textoDaConversa, nomeDoArquivo } from "../lib/pdfConversa.js";
import { getSessao } from "../lib/sessao.js";
import { dataCurta, diasEntre, ymdLocal } from "../lib/format.js";
import { Card, PageTitle, SectionTitle, StatCard, Empty, CarregandoModulo } from "../components/ui.jsx";

// Cada tipo tem icone proprio: numa lista de 20 linhas, o icone diz o que e
// antes de a pessoa ler o titulo.
const TIPOS = {
  visita: { rotulo: "Visita", icone: Users, cor: "text-brand" },
  medicao: { rotulo: "Medição", icone: Ruler, cor: "text-brand" },
  retorno: { rotulo: "Retorno de orçamento", icone: Phone, cor: "text-warn-700" },
  entrega: { rotulo: "Entrega", icone: Truck, cor: "text-ok-700" },
  instalacao: { rotulo: "Instalação", icone: Wrench, cor: "text-ok-700" },
  cobranca: { rotulo: "Cobrança", icone: HandCoins, cor: "text-bad-700" },
  documento: { rotulo: "Documento / arte", icone: FileText, cor: "text-slate-500" },
  outro: { rotulo: "Outro", icone: CircleDot, cor: "text-slate-500" },
};

const VAZIO = {
  id: "",
  titulo: "",
  tipo: "visita",
  cliente: "",
  data: "",
  hora: "",
  telefone: "",
  obs: "",
  feito: false,
};

// A frase que a pessoa le antes do numero. Prazo em palavras vale mais que data.
function prazo(dias) {
  if (dias === null) return { texto: "sem data", chip: "chip", peso: 5000, grupo: "Sem data marcada" };
  if (dias < 0) {
    const d = -dias;
    return { texto: `atrasado ${d} ${d === 1 ? "dia" : "dias"}`, chip: "chip-bad", peso: -1000 + dias, grupo: "Atrasados" };
  }
  if (dias === 0) return { texto: "HOJE", chip: "chip-bad", peso: 0, grupo: "Hoje" };
  if (dias === 1) return { texto: "amanha", chip: "chip-warn", peso: 1, grupo: "Amanha" };
  if (dias <= 7) return { texto: `em ${dias} dias`, chip: "chip-warn", peso: dias, grupo: "Proximos 7 dias" };
  // Sim, `em N dias` tambem aqui: a condicao que existia antes (dataCurta(null))
  // e sempre falsa, entao tudo marcado para daqui a mais de uma semana aparecia
  // com uma etiqueta cinza VAZIA do lado da data.
  return { texto: `em ${dias} dias`, chip: "chip", peso: dias, grupo: "Mais para frente" };
}

const ORDEM_GRUPOS = ["Atrasados", "Hoje", "Amanha", "Proximos 7 dias", "Mais para frente", "Sem data marcada"];

  // Eventos seguidos da MESMA pessoa viram um bloco so, com o nome uma vez no
  // topo -- e o que faz o histórico parecer conversa e nao log de sistema.
function blocosDaConversa(c) {
    const hist = Array.isArray(c.historico) ? c.historico : [];
    const blocos = [];
    for (const ev of hist) {
      const ultimo = blocos[blocos.length - 1];
      if (ultimo && ultimo.quem === ev.quem) ultimo.eventos.push(ev);
      else blocos.push({ quem: ev.quem, nome: ev.quemNome || ev.quem, eventos: [ev] });
    }
  return blocos;
}

function Conversa({ c, sessao, enviando, aoEnviar, aoBaixar, aoWhatsApp }) {
    const blocos = blocosDaConversa(c);
    const meu = (quem) => quem === sessao?.usuario;
    return (
      <div className="mt-2 rounded-xl border p-3" style={{ borderColor: "var(--hairline)" }}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="font-display text-sm font-semibold text-slate-900">Conversa</span>
          <button
            type="button"
            onClick={() => aoWhatsApp(c)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-ok-700 px-3 font-display text-xs font-semibold text-white transition-all hover:brightness-90"
            title="Manda o histórico em PDF pelo WhatsApp"
          >
            <MessageCircle size={14} strokeWidth={2.4} />
            Mandar no WhatsApp
          </button>
        </div>

        {blocos.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nada registrado ainda. Escreva abaixo o que foi feito — quem receber este compromisso
            vai ler.
          </p>
        ) : (
          <div className="space-y-3">
            {blocos.map((b, i) => (
              <div key={i} className={`flex flex-col ${meu(b.quem) ? "items-end" : "items-start"}`}>
                <span className="mb-1 font-display text-xs font-semibold text-slate-500">
                  {meu(b.quem) ? "Você" : b.nome}
                </span>
                <div className="max-w-[85%] space-y-1">
                  {b.eventos.map((ev, j) => (
                    <div
                      key={j}
                      className={`rounded-xl px-3 py-2 text-sm ${
                        meu(b.quem) ? "bg-brand/10 text-slate-900" : "bg-slate-100 text-slate-900"
                      }`}
                    >
                      {ev.tipo !== "recado" && (
                        <span className="block font-display text-xs font-semibold text-slate-600">
                          {ev.tipo === "criou" && "abriu o compromisso"}
                          {ev.tipo === "passou" && `passou para ${ev.paraNome || ev.para}`}
                          {ev.tipo === "concluiu" && "marcou como resolvido"}
                          {ev.tipo === "reabriu" && "reabriu"}
                        </span>
                      )}
                      {ev.texto && <span className="block whitespace-pre-wrap">{ev.texto}</span>}
                      {ev.arquivo && (
                        <button
                          type="button"
                          onClick={() => aoBaixar(c, ev.arquivo)}
                          className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-white/70 px-2 py-1 font-display text-xs font-medium text-brand hover:underline"
                        >
                          <Paperclip size={12} />
                          {ev.arquivo.nome}
                        </button>
                      )}
                      <span className="mt-0.5 block text-[11px] tabular-nums text-slate-400">
                        {ev.em ? new Date(ev.em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <Compositor enviando={enviando === c.id} aoEnviar={(t, a) => aoEnviar(c, t, a)} />
    </div>
  );
}



// O campo de escrever tem estado PROPRIO. Se o texto morasse no componente da
// pagina, cada tecla re-renderizaria a lista inteira -- e como Linha/Conversa
// eram criadas dentro da pagina, o React trocava o tipo do componente a cada
// render e o campo perdia o foco a cada letra digitada.
function Compositor({ enviando, aoEnviar }) {
  const [texto, setTexto] = useState("");
  const [arquivo, setArquivo] = useState(null);
  const campoArquivo = useRef(null);

  const enviar = async () => {
    if (!texto.trim() && !arquivo) return;
    const ok = await aoEnviar(texto.trim(), arquivo);
    if (ok) {
      setTexto("");
      setArquivo(null);
      if (campoArquivo.current) campoArquivo.current.value = "";
    }
  };

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          className="input h-9 min-w-0 flex-1 basis-48 py-0 text-sm"
          placeholder="Escreva o que foi feito, o que falta..."
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              enviar();
            }
          }}
        />
        <label
          className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-3 font-display text-xs font-medium text-slate-600 hover:bg-slate-100"
          style={{ borderColor: "var(--hairline)" }}
          title="Anexar foto ou PDF (até 3 MB)"
        >
          <Paperclip size={14} />
          {arquivo ? "1 arquivo" : "Anexar"}
          <input
            ref={campoArquivo}
            type="file"
            className="hidden"
            accept="image/*,application/pdf"
            onChange={(e) => setArquivo(e.target.files?.[0] || null)}
          />
        </label>
        <button
          type="button"
          onClick={enviar}
          disabled={enviando || (!texto.trim() && !arquivo)}
          className="btn-primary h-9 shrink-0 px-3 text-xs disabled:opacity-40"
        >
          {enviando ? "Enviando..." : "Enviar"}
        </button>
      </div>
      {arquivo && (
        <p className="mt-1 text-xs text-slate-500">
          Anexo escolhido: {arquivo.name}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => {
              setArquivo(null);
              if (campoArquivo.current) campoArquivo.current.value = "";
            }}
          >
            tirar
          </button>
        </p>
      )}
    </>
  );
}

// As datas do remarcar rápido. Local, nunca UTC: `new Date().toISOString()`
// devolve o dia de AMANHÃ depois das 21h aqui, e o compromisso nasceria um dia
// à frente sem ninguém entender.
function maisDias(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return ymdLocal(d);
}
function proximaSegunda() {
  const d = new Date();
  // 1 = segunda. Se hoje já é segunda, vai para a semana que vem.
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return ymdLocal(d);
}

function Linha({ c, sessao, ehDirecao, dePessoa, equipe, encaminhando, setEncaminhando,
                 remarcando, setRemarcando,
                 conversaAberta, setConversaAberta, enviando, acoes }) {
  const donoDe = (x) => x.dono ?? sessao?.usuario ?? "";
    const Icone = c.t.icone;

    // O último evento da conversa, resumido para caber numa linha.
    const hist = Array.isArray(c.historico) ? c.historico : [];
    const ult = hist[hist.length - 1];
    const diasSemNovidade = ult?.em ? diasEntre(String(ult.em).slice(0, 10), ymdLocal(new Date())) : null;
    const ultimaNovidade = ult
      ? {
          quem: ult.quemNome || ult.quem || "alguém",
          quando:
            diasSemNovidade == null ? "" : diasSemNovidade <= 0 ? "hoje" : `há ${diasSemNovidade}d`,
          texto: String(ult.texto || "").trim().slice(0, 90),
        }
      : null;
    /* O aviso de parado só vale onde ele quer dizer alguma coisa: um
       compromisso marcado para daqui a duas semanas está parado por desenho.
       Em Atrasados e Sem data, parado é problema. */
    // Só dígitos: o campo aceita "(38) 99999-0000" e o link precisa de número.
    const telDigitos = String(c.telefone || "").replace(/\D/g, "");
    const paradoHa =
      !c.feito &&
      (c.pz.grupo === "Atrasados" || c.pz.grupo === "Sem data marcada") &&
      diasSemNovidade != null &&
      diasSemNovidade >= 3
        ? diasSemNovidade
        : null;
    const quantos = Array.isArray(c.historico)
      ? c.historico.filter((e) => e.tipo === "recado" || e.tipo === "passou").length
      : 0;
    const aberta = conversaAberta === c.id;
    return (
      <div>
      <div
        className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border p-3 transition-colors ${
          c.feito ? "opacity-60" : ""
        }`}
        style={{ borderColor: "var(--hairline)" }}
      >
        <button
          type="button"
          onClick={() => acoes.alternarFeito(c)}
          title={c.feito ? "Reabrir" : "Marcar como feito"}
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border transition-colors ${
            c.feito
              ? "border-ok-600 bg-ok-600 text-white"
              : "text-slate-400 hover:border-ok-600 hover:text-ok-700"
          }`}
          style={c.feito ? undefined : { borderColor: "var(--hairline)" }}
        >
          {c.feito ? <Check size={15} strokeWidth={3} /> : <Check size={15} />}
        </button>

        <Icone size={17} strokeWidth={2.2} className={`shrink-0 ${c.t.cor}`} title={c.t.rotulo} />

        <span className="min-w-0 flex-1 basis-48">
          <span
            className={`block truncate font-display text-sm font-medium text-slate-900 ${
              c.feito ? "line-through" : ""
            }`}
          >
            {c.titulo}
          </span>
          <span className="block truncate text-xs text-slate-500">
            {[
              c.t.rotulo,
              c.cliente,
              ehDirecao && !dePessoa ? c.donoNome : null,
              c.encaminhadoPor && c.encaminhadoPor !== c.donoNome
                ? `veio de ${c.encaminhadoPor}`
                : null,
              c.obs,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>

          {/* ANDANDO OU PARADO — a pergunta que a linha não respondia.
              Para saber se um atrasado está esperando o cliente ou se ninguém
              tocou nele, era preciso abrir a conversa de cada um: a linha só
              mostrava a QUANTIDADE de recados, que não distingue "falei ontem"
              de "cinco recados em março". O último evento já veio no mesmo
              carregamento; era só mostrar. */}
          {ultimaNovidade && (
            <span className="block truncate text-xs text-slate-400">
              <span className="font-medium text-slate-500">{ultimaNovidade.quem}</span>
              {ultimaNovidade.quando ? `, ${ultimaNovidade.quando}` : ""}
              {ultimaNovidade.texto ? `: ${ultimaNovidade.texto}` : ""}
            </span>
          )}
          {paradoHa != null && (
            <span className="chip-warn mt-1 inline-block">sem novidade há {paradoHa} dias</span>
          )}
        </span>

        <span className="shrink-0 text-right">
          {remarcando === c.id ? (
            /* Seletor no LUGAR da etiqueta — o mesmo gesto do encaminhar logo
               ao lado: escolher já remarca, sem formulário e sem perder o
               lugar na lista. */
            <select
              autoFocus
              className="input h-8 w-36 py-0 text-xs"
              defaultValue=""
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                setRemarcando(null);
                if (v === "escolher") return acoes.abrirForm(c);
                acoes.remarcar(c, v);
              }}
              onBlur={() => setRemarcando(null)}
            >
              <option value="" disabled>Remarcar para...</option>
              <option value={maisDias(0)}>Hoje</option>
              <option value={maisDias(1)}>Amanhã</option>
              <option value={proximaSegunda()}>Segunda</option>
              <option value={maisDias(7)}>Daqui a 7 dias</option>
              <option value="escolher">Escolher data...</option>
            </select>
          ) : (
            <>
              {!c.feito && (
                <button
                  type="button"
                  onClick={() => setRemarcando(c.id)}
                  title="Remarcar"
                  className={`${c.pz.chip} whitespace-nowrap transition-opacity hover:opacity-75`}
                >
                  {c.pz.texto}
                </button>
              )}
              <span className="mt-0.5 block text-xs tabular-nums text-slate-500">
                {c.data ? `${dataCurta(c.data)}${c.hora ? ` as ${c.hora}` : ""}` : "sem data"}
              </span>
            </>
          )}
        </span>

        <span className="flex shrink-0 items-center gap-0.5">
          {/* Ligar e WhatsApp direto da linha: é onde o compromisso vira ação.
              Só aparecem quando há telefone -- botão que não liga para lugar
              nenhum é pior do que a falta dele. */}
          {telDigitos && (
            <>
              <a
                href={`tel:${telDigitos}`}
                title={`Ligar para ${c.cliente || "o cliente"}`}
                className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-brand"
              >
                <Phone size={15} strokeWidth={2.2} />
              </a>
              <a
                href={`https://wa.me/55${telDigitos}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Abrir no WhatsApp"
                className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-ok-50 hover:text-ok-700"
              >
                <MessageCircle size={15} strokeWidth={2.2} />
              </a>
            </>
          )}
          {/* A conversa e o coracao da coisa: e onde fica o que ja foi feito e
              o que falta. Botao com rotulo (nao so icone) e com o numero de
              recados, para dar vontade de abrir. */}
          <button
            type="button"
            onClick={() => setConversaAberta(aberta ? null : c.id)}
            aria-expanded={aberta}
            className={`mr-1 inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 font-display text-xs font-semibold transition-colors ${
              aberta ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100 hover:text-brand"
            }`}
            title="Abrir a conversa deste compromisso"
          >
            <MessageCircle size={14} strokeWidth={2.4} />
            Conversa
            {quantos > 0 && (
              <span className={`rounded-full px-1.5 text-[11px] ${aberta ? "bg-white/25" : "bg-slate-200 text-slate-700"}`}>
                {quantos}
              </span>
            )}
          </button>
          {encaminhando === c.id ? (
            // Seletor no lugar do botao: escolher ja encaminha. E o gesto mais
            // curto para "isso aqui e da fulana".
            <select
              autoFocus
              className="input h-8 w-40 py-0 text-xs"
              defaultValue=""
              onChange={(e) => acoes.encaminhar(c, e.target.value)}
              onBlur={() => setEncaminhando(null)}
            >
              <option value="" disabled>
                Passar para...
              </option>
              {equipe
                .filter((p) => p.usuario !== donoDe(c))
                .map((p) => (
                  <option key={p.usuario} value={p.usuario}>
                    {p.nome}
                  </option>
                ))}
            </select>
          ) : (
            equipe.length > 1 && (
              <button
                type="button"
                onClick={() => setEncaminhando(c.id)}
                className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-brand"
                title="Encaminhar para outra pessoa"
              >
                <Forward size={14} />
              </button>
            )
          )}
          <button
            type="button"
            onClick={() => acoes.abrirForm(c)}
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            title="Editar"
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            onClick={() => acoes.remover(c)}
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-bad-50 hover:text-bad-700"
            title="Apagar"
          >
            <Trash2 size={14} />
          </button>
        </span>
      </div>
      {aberta && (
        <Conversa
          c={c}
          sessao={sessao}
          enviando={enviando}
          aoEnviar={acoes.enviarRecado}
          aoBaixar={acoes.baixarAnexo}
          aoWhatsApp={acoes.mandarWhatsApp}
        />
      )}
    </div>
  );
}

export default function Compromissos() {
  const sessao = getSessao();
  const ehDirecao = !!sessao?.master;

  const [mapa, setMapa] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [form, setForm] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [dePessoa, setDePessoa] = useState(null); // filtro da direcao
  const [verFeitos, setVerFeitos] = useState(false);
  const [equipe, setEquipe] = useState([]);
  const [encaminhando, setEncaminhando] = useState(null); // id da linha aberta
  const [remarcando, setRemarcando] = useState(null);     // id da linha remarcando
  const [conversaAberta, setConversaAberta] = useState(null); // id da conversa expandida
  const [enviando, setEnviando] = useState(null); // id do recado em envio
  // Item sem dono so acontece em registro antigo (anterior ao carimbo do
  // servidor). Nesse caso o dono e quem esta vendo -- e o servidor so mostra o
  // que e dela. Sem isso, o "passar para..." oferecia a PROPRIA pessoa.
  const donoDe = (c) => c.dono ?? sessao?.usuario ?? "";
  const cartaoForm = useRef(null);
  // "Hoje" precisa ser ESTADO, nao um calculo do render: esta e uma tela que
  // fica aberta. A vendedora deixa o painel no computador e volta no dia
  // seguinte -- com o dia congelado, o compromisso de hoje continuava
  // aparecendo como "amanha" e o atrasado nao virava atrasado.
  const [hojeISO, setHojeISO] = useState(() => ymdLocal(new Date()));

  const recarregar = useCallback(() => {
    setHojeISO(ymdLocal(new Date()));
    lerCompromissos()
      .then(setMapa)
      .catch((e) => setErro(e.message));
  }, []);

  useEffect(() => {
    let vivo = true;
    lerCompromissos()
      .then((m) => vivo && setMapa(m))
      .catch((e) => vivo && setErro(e.message));
    // A equipe e so para o "encaminhar". Se falhar, a tela continua
    // funcionando -- so o encaminhamento fica indisponivel.
    lerPessoas()
      .then((p) => vivo && setEquipe(p))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  // Voltou para a aba: refaz a conta do dia e busca o que chegou enquanto ela
  // estava em outro lugar (um compromisso encaminhado por uma colega, por
  // exemplo, so aparecia depois de recarregar a pagina na mao).
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === "visible") recarregar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [recarregar]);

  const vm = useMemo(() => {
    if (!mapa) return { grupos: [], feitos: [], hoje: 0, atrasados: 0, semData: 0, pessoas: [] };
    const todos = Object.entries(mapa)
      .map(([id, c]) => {
        const dias = c.data ? diasEntre(hojeISO, c.data) : null;
        return { ...c, id, dias, pz: prazo(dias), t: TIPOS[c.tipo] || TIPOS.outro };
      })
      .filter((c) => !dePessoa || c.dono === dePessoa);

    /* O DIA SAI NA ORDEM DO RELÓGIO.
       A hora era cadastrada, aparecia na linha e não ordenava nada: dentro de
       "Hoje" todo item tem peso 0, o sort empatava e a ordem que sobrava era a
       de chegada. Quem abre a tela de manhã lê de cima para baixo e a lista
       mandava ele para a reunião das 15h antes da visita das 8h.
       Sem hora vai para o fim do dia ("99:99"), que é onde ela cabe: é o que
       não tem hora marcada. */
    const horaDe = (c) => String(c.hora || "99:99");
    const abertos = todos
      .filter((c) => !c.feito)
      .sort(
        (a, b) =>
          a.pz.peso - b.pz.peso ||
          horaDe(a).localeCompare(horaDe(b)) ||
          String(a.criadoEm || "").localeCompare(String(b.criadoEm || ""))
      );
    const feitos = todos
      .filter((c) => c.feito)
      .sort((a, b) => String(b.feitoEm || "").localeCompare(String(a.feitoEm || "")));

    const grupos = [];
    abertos.forEach((c) => {
      let g = grupos.find((x) => x.nome === c.pz.grupo);
      if (!g) {
        g = { nome: c.pz.grupo, itens: [] };
        grupos.push(g);
      }
      g.itens.push(c);
    });
    grupos.sort((a, b) => ORDEM_GRUPOS.indexOf(a.nome) - ORDEM_GRUPOS.indexOf(b.nome));

    // Contagem por pessoa: o chip da direcao mostra quantos cada uma tem EM
    // ABERTO -- e o numero que responde "quem esta afogada?".
    const pessoas = [...new Set(Object.values(mapa).map((c) => c.dono).filter(Boolean))].map((d) => {
      const doDono = Object.values(mapa).filter((c) => c.dono === d);
      /* O CHIP CONTAVA VOLUME, NÃO PROBLEMA.
         "12 em aberto" não responde "quem está afogada?": pode ser doze visitas
         agendadas para o mês, tudo sob controle. Quem responde é o ATRASADO.
         Agora o chip mostra os dois — atrasados em vermelho, total ao lado — e
         a lista vem ordenada por atrasado primeiro. */
      const abertos = doDono.filter((c) => !c.feito);
      const atrasados = abertos.filter(
        (c) => c.data && diasEntre(ymdLocal(new Date()), c.data) < 0
      ).length;
      return {
        dono: d,
        nome: doDono.find((c) => c.donoNome)?.donoNome || d,
        emAberto: abertos.length,
        atrasados,
      };
    }).sort((a, b) => b.atrasados - a.atrasados || b.emAberto - a.emAberto);

    return {
      grupos,
      feitos,
      emAberto: abertos.length,
      concluidos: feitos.length,
      hoje: abertos.filter((c) => c.dias === 0).length,
      atrasados: abertos.filter((c) => c.dias !== null && c.dias < 0).length,
      semData: abertos.filter((c) => c.dias === null).length,
      pessoas,
    };
  }, [mapa, hojeISO, dePessoa]);

  // Tem texto digitado que ainda nao foi salvo? Comparar com o item de origem
  // (ou com o formulario vazio) e o unico jeito de saber -- e sem isso um
  // clique no lapis de outra linha apagava o que a pessoa estava escrevendo,
  // sem perguntar nada.
  const formSujo = () => {
    if (!form) return false;
    const base = form.id ? { ...VAZIO, ...(mapa?.[form.id] ?? {}), id: form.id } : VAZIO;
    return ["titulo", "tipo", "cliente", "data", "hora", "obs"].some(
      (k) => String(form[k] ?? "") !== String(base[k] ?? "")
    );
  };

  const abrirForm = (c) => {
    if (formSujo() && !window.confirm("Você tem um compromisso pela metade. Descartar o que escreveu?")) return;
    setAviso(null);
    setForm(c ? { ...VAZIO, ...c } : { ...VAZIO });
    setTimeout(() => cartaoForm.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
  };

  const salvar = useCallback(
    async (e) => {
      e.preventDefault();
      setAviso(null);
      if (!form.titulo.trim()) return setAviso({ tom: "erro", texto: "Escreva o que precisa ser feito." });
      setSalvando(true);
      try {
        // Id com o usuario e um sufixo aleatorio: `cp-<milissegundo>` sozinho e
        // compartilhado por toda a equipe -- duas pessoas cadastrando no mesmo
        // instante caiam na MESMA linha, e o servidor recusava a segunda por
        // ser de outro dono.
        const novo = !form.id;
        const id = form.id || `cp-${sessao?.usuario || "eu"}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const dados = {
          titulo: form.titulo.trim(),
          tipo: form.tipo,
          cliente: form.cliente.trim(),
          data: form.data,
          hora: form.hora,
          obs: form.obs.trim(),
          criadoEm: form.criadoEm || new Date().toISOString(),
          // feito/feitoEm NAO entram aqui de proposito: quem manda neles e o
          // botao de concluir. Mandando-os, salvar uma edicao aberta antes de
          // concluir o item DESFAZIA o "concluir" feito no meio do caminho.
          ...(novo ? { feito: false, feitoEm: "" } : {}),
        };
        const mapaNovo = await salvarCompromisso(id, dados);
        setMapa(mapaNovo);
        // A direcao filtrando por uma pessoa e cadastrando um compromisso
        // proprio: sem isto o item nascia e sumia da tela no mesmo instante.
        if (novo && dePessoa && mapaNovo?.[id]?.dono !== dePessoa) setDePessoa(null);
        setForm(null);
        setAviso({ tom: "ok", texto: "Compromisso salvo." });
      } catch (err) {
        setAviso({ tom: "erro", texto: err.message });
      } finally {
        setSalvando(false);
      }
    },
    [form, dePessoa, sessao]
  );

  const alternarFeito = async (c) => {
    setAviso(null);
    const feito = !c.feito;
    const patch = { feito, feitoEm: feito ? new Date().toISOString() : "" };
    setMapa((m) => ({ ...(m || {}), [c.id]: { ...m[c.id], ...patch } })); // otimista
    try {
      await salvarCompromisso(c.id, patch);
    } catch (err) {
      setMapa((m) => ({ ...(m || {}), [c.id]: { ...m[c.id], feito: c.feito, feitoEm: c.feitoEm || "" } }));
      setAviso({ tom: "erro", texto: err.message });
    }
  };

  const encaminhar = async (c, paraUsuario) => {
    setEncaminhando(null);
    if (!paraUsuario || paraUsuario === donoDe(c)) return;
    const nome = equipe.find((p) => p.usuario === paraUsuario)?.nome || paraUsuario;
    // Passar adiante e definitivo para quem passou: o item sai da lista dela.
    // O recado e opcional, mas e o que faz a colega entender o que ja foi
    // feito -- por isso a pergunta ja vem junto com a confirmacao.
    const recado = window.prompt(
      `Passar "${c.titulo}" para ${nome}. Ele sai da sua lista e leva a conversa junto.\n\nQuer deixar um recado? (pode deixar em branco)`,
      ""
    );
    if (recado === null) return; // cancelou
    setAviso(null);
    try {
      const mapaNovo = await encaminharCompromisso(c.id, paraUsuario, recado.trim());
      // A resposta ja vem no escopo de quem pediu: se voce nao e a direcao, o
      // item encaminhado simplesmente sai da sua lista.
      setMapa(mapaNovo);
      setAviso({ tom: "ok", texto: `"${c.titulo}" foi para ${nome}.` });
    } catch (err) {
      setAviso({ tom: "erro", texto: err.message });
    }
  };

  // ---- conversa ----------------------------------------------------------
  // Devolve true quando gravou -- e o sinal para o Compositor limpar o campo.
  // Limpar sem confirmacao apagaria o que a pessoa escreveu quando a rede cai.
  const enviarRecado = async (c, texto, file) => {
    if (!texto && !file) return false;
    if (file && file.size > 3 * 1024 * 1024) {
      setAviso({
        tom: "erro",
        texto: `"${file.name}" tem ${(file.size / 1024 / 1024).toFixed(1)} MB. O limite e 3 MB -- mande o PDF ou reduza a foto.`,
      });
      return false;
    }
    setEnviando(c.id);
    setAviso(null);
    try {
      const arquivo = file
        ? { base64: await arquivoParaBase64(file), nome: file.name, mime: file.type || "application/octet-stream" }
        : null;
      setMapa(await mandarRecado(c.id, { texto, arquivo }));
      return true;
    } catch (err) {
      setAviso({ tom: "erro", texto: err.message });
      return false;
    } finally {
      setEnviando(null);
    }
  };

  const baixarAnexo = async (c, arquivo) => {
    try {
      const a = await lerAnexo(c.id, arquivo.chave);
      abrirBase64(a.base64, a.mime, a.nome || arquivo.nome);
    } catch (err) {
      setAviso({ tom: "erro", texto: err.message });
    }
  };

  // Manda a conversa pelo WhatsApp. No celular (que e onde a vendedora esta) o
  // navegador abre a folha de compartilhamento COM o PDF anexado. No
  // computador isso nao existe: baixa o PDF e abre o WhatsApp com o texto, e a
  // pessoa anexa o arquivo que acabou de cair na pasta de downloads.
  const mandarWhatsApp = async (c) => {
    const dados = { ...c, tipoRotulo: c.t?.rotulo };
    try {
      const blob = pdfDaConversa(dados);
      const arquivo = new File([blob], nomeDoArquivo(dados), { type: "application/pdf" });
      const texto = textoDaConversa(dados);
      if (navigator.canShare?.({ files: [arquivo] })) {
        await navigator.share({ files: [arquivo], title: c.titulo, text: texto });
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = arquivo.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
      setAviso({
        tom: "ok",
        texto: "PDF baixado e WhatsApp aberto com o texto. Anexe o PDF na conversa se precisar do papel.",
      });
    } catch (err) {
      // AbortError = a pessoa fechou a folha de compartilhamento. Nao e erro.
      if (err?.name !== "AbortError") setAviso({ tom: "erro", texto: "Não consegui montar o PDF da conversa." });
    }
  };

  const remover = async (c) => {
    if (!window.confirm(`Apagar "${c.titulo}"?`)) return;
    setAviso(null);
    try {
      await removerCompromisso(c.id);
      setMapa((m) => {
        const novo = { ...(m || {}) };
        delete novo[c.id];
        return novo;
      });
      if (form?.id === c.id) setForm(null);
    } catch (err) {
      setAviso({ tom: "erro", texto: err.message });
    }
  };

  // Um objeto so com o que a Linha chama de volta. useMemo nao e otimizacao
  // aqui: sem ele, o objeto muda a cada render e as linhas remontam junto.
  /* REMARCAR EM UM TOQUE.
     Adiar é o gesto mais repetido da manhã: o que ficou de ontem vira hoje ou
     amanhã. Só existia pelo lápis, que abre o formulário no topo e rola a
     página até ele — e depois a pessoa tem de procurar onde estava na lista.
     Enquanto adiar custa isso, ninguém adia, e a agenda de verdade continua no
     papel. Grava só a data, otimista, com volta se o servidor recusar. */
  const remarcar = async (c, novaData) => {
    setAviso(null);
    const antes = c.data || "";
    setMapa((m) => ({ ...(m || {}), [c.id]: { ...m[c.id], data: novaData } }));
    try {
      await salvarCompromisso(c.id, { data: novaData });
    } catch (err) {
      setMapa((m) => ({ ...(m || {}), [c.id]: { ...m[c.id], data: antes } }));
      setAviso({ tom: "erro", texto: err.message });
    }
  };

  const acoes = useMemo(
    () => ({ alternarFeito, abrirForm, remover, encaminhar, enviarRecado, baixarAnexo, mandarWhatsApp, remarcar }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mapa, form, equipe, dePessoa, sessao]
  );

  if (erro) {
    return (
      <div className="space-y-6">
        <PageTitle titulo="Compromissos" descricao="O que você tem para fazer e resolver." />
        <Card className="flex items-start gap-2 text-sm text-bad-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {erro}
        </Card>
      </div>
    );
  }
  if (mapa === null) return <CarregandoModulo />;


  return (
    <div className="space-y-6">
      <PageTitle
        titulo="Compromissos"
        descricao={
          ehDirecao
            ? "A agenda da equipe: visitas, medições, retornos e o que ficou para resolver."
            : "Suas visitas, medições, retornos e o que você tem para resolver. Só você ve esta lista."
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          rotulo="Em aberto"
          valor={String(vm.emAberto)}
          sub={vm.semData ? `${vm.semData} sem data marcada` : "tudo com data"}
          tom={vm.emAberto ? "neutral" : "ok"}
          icone={CircleDot}
        />
        <StatCard
          rotulo="Atrasados"
          valor={String(vm.atrasados)}
          sub={vm.atrasados ? "passaram da data" : "nada atrasado"}
          tom={vm.atrasados ? "bad" : "ok"}
          icone={AlertTriangle}
        />
        <StatCard
          rotulo="Hoje"
          valor={String(vm.hoje)}
          sub={vm.hoje ? "marcados para hoje" : "sem compromisso hoje"}
          tom={vm.hoje ? "warn" : "neutral"}
          icone={CalendarCheck}
        />
        <StatCard
          rotulo="Resolvidos"
          valor={String(vm.concluidos)}
          sub="já concluidos"
          tom={vm.concluidos ? "ok" : "neutral"}
          icone={Check}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary" onClick={() => abrirForm(null)}>
          <Plus size={15} strokeWidth={2.4} />
          Novo compromisso
        </button>

        {ehDirecao && vm.pessoas.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => setDePessoa(null)}
              className={`rounded-full px-3 py-1 font-display text-xs font-semibold transition-colors ${
                dePessoa === null ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Equipe toda
            </button>
            {vm.pessoas.map((p) => (
              <button
                key={p.dono}
                type="button"
                onClick={() => setDePessoa(dePessoa === p.dono ? null : p.dono)}
                className={`rounded-full px-3 py-1 font-display text-xs font-semibold transition-colors ${
                  dePessoa === p.dono ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {p.nome}
                {/* Atrasados primeiro, em vermelho: é o número que responde
                    "quem está afogada?". O total em aberto fica ao lado, em
                    cinza — ele conta volume, não problema. */}
                {p.atrasados > 0 && (
                  <span className={`ml-1.5 ${dePessoa === p.dono ? "text-white" : "text-bad-700"}`}>
                    {p.atrasados}
                  </span>
                )}
                {p.emAberto > 0 && (
                  <span className="ml-1 opacity-60">
                    {p.atrasados > 0 ? "/" : ""}{p.emAberto}
                  </span>
                )}
              </button>
            ))}
          </>
        )}
      </div>

      {aviso && (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            aviso.tom === "ok" ? "bg-ok-50 text-ok-700" : "bg-bad-50 text-bad-700"
          }`}
        >
          {aviso.texto}
        </p>
      )}

      {form && (
        <Card ref={cartaoForm}>
          <SectionTitle
            titulo={form.id ? "Editar compromisso" : "Novo compromisso"}
            sub="Só o título é obrigatório. Sem data, ele entra em 'A resolver'."
          />
          <form onSubmit={salvar} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="c-titulo">O que precisa ser feito</label>
                <input
                  id="c-titulo"
                  className="input"
                  placeholder="ex.: Medir a fachada da loja nova"
                  value={form.titulo}
                  onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="c-tipo">Tipo</label>
                <select
                  id="c-tipo"
                  className="input"
                  value={form.tipo}
                  onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}
                >
                  {Object.entries(TIPOS).map(([id, t]) => (
                    <option key={id} value={id}>
                      {t.rotulo}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="c-cliente">Cliente (opcional)</label>
                <input
                  id="c-cliente"
                  className="input"
                  placeholder="ex.: Padaria São Jose"
                  value={form.cliente}
                  onChange={(e) => setForm((f) => ({ ...f, cliente: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="c-data">Data</label>
                  <input
                    id="c-data"
                    type="date"
                    className="input"
                    value={form.data}
                    onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="c-hora">Hora</label>
                  <input
                    id="c-hora"
                    type="time"
                    className="input"
                    value={form.hora}
                    onChange={(e) => setForm((f) => ({ ...f, hora: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                {/* TELEFONE TEM LUGAR PRÓPRIO.
                    Retorno de orçamento, cobrança e visita terminam em falar
                    com o cliente, e o telefone só cabia dentro da observação,
                    em texto livre -- de onde ninguém liga: é copiar, sair da
                    tela, colar. Com campo próprio, a linha ganha os botões. */}
                <label className="label" htmlFor="c-tel">Telefone do cliente</label>
                <input
                  id="c-tel"
                  className="input"
                  inputMode="tel"
                  placeholder="(38) 99999-0000"
                  value={form.telefone || ""}
                  onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))}
                />
              </div>
              <div>
                <label className="label" htmlFor="c-obs">Observação</label>
                <input
                  id="c-obs"
                  className="input"
                  placeholder="endereço, o que levar..."
                  value={form.obs}
                  onChange={(e) => setForm((f) => ({ ...f, obs: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn-primary" disabled={salvando}>
                {salvando ? "Salvando..." : form.id ? "Salvar alterações" : "Cadastrar"}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setForm(null)}>
                Cancelar
              </button>
            </div>
          </form>
        </Card>
      )}

      {vm.grupos.length === 0 ? (
        <Card>
          <Empty>
            Nada em aberto{dePessoa ? " para esta pessoa" : ""}. Use &quot;Novo compromisso&quot; para
            anotar uma visita, uma medição ou algo a resolver.
          </Empty>
        </Card>
      ) : (
        vm.grupos.map((g) => (
          <Card key={g.nome}>
            <SectionTitle
              titulo={g.nome}
              sub={`${g.itens.length} ${g.itens.length === 1 ? "compromisso" : "compromissos"}`}
            />
            <div className="space-y-2">
              {g.itens.map((c) => (
                <Linha
                  key={c.id}
                  c={c}
                  sessao={sessao}
                  ehDirecao={ehDirecao}
                  dePessoa={dePessoa}
                  equipe={equipe}
                  encaminhando={encaminhando}
                  setEncaminhando={setEncaminhando}
                  remarcando={remarcando}
                  setRemarcando={setRemarcando}
                  conversaAberta={conversaAberta}
                  setConversaAberta={setConversaAberta}
                  enviando={enviando === c.id}
                  acoes={acoes}
                />
              ))}
            </div>
          </Card>
        ))
      )}

      {vm.feitos.length > 0 && (
        <Card className="p-0">
          <button
            type="button"
            onClick={() => setVerFeitos((v) => !v)}
            aria-expanded={verFeitos}
            className="flex w-full items-center gap-2.5 px-5 py-4 text-left"
          >
            <ChevronDown
              size={16}
              className={`shrink-0 text-slate-400 transition-transform ${verFeitos ? "" : "-rotate-90"}`}
            />
            <span className="min-w-0 flex-1 font-display text-base font-semibold text-slate-900">
              Concluidos
            </span>
            <span className="chip-ok">{vm.feitos.length}</span>
          </button>
          {verFeitos && (
            <div className="space-y-2 px-5 pb-5">
              {vm.feitos.map((c) => (
                <Linha
                  key={c.id}
                  c={c}
                  sessao={sessao}
                  ehDirecao={ehDirecao}
                  dePessoa={dePessoa}
                  equipe={equipe}
                  encaminhando={encaminhando}
                  setEncaminhando={setEncaminhando}
                  remarcando={remarcando}
                  setRemarcando={setRemarcando}
                  conversaAberta={conversaAberta}
                  setConversaAberta={setConversaAberta}
                  enviando={enviando === c.id}
                  acoes={acoes}
                />
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
