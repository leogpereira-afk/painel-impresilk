// Bancos e Pix: contas, CNPJs e chaves de todas as empresas.
//
// O que a tela precisa fazer bem: alguem pede os dados no WhatsApp e voce
// responde em DOIS cliques. Por isso o botao verde e o principal de cada
// cartao -- ele abre o WhatsApp com a conta ja escrita e voce so escolhe para
// quem mandar. Copiar valor a valor continua ali para preencher formulario.
//
// As contas vivem SO no servidor (painel-config, chave "bancos"), atras de
// login e do modulo "bancos". Nada de conta bancaria no arquivo publico.
//
// 25/09/2026, pedido do Léo: "colocar logomarca, número de banco e fazer algo
// para ficar fácil de copiar e colar o pix". Entraram:
// - o SELO do banco (a logo que alguém anexar, ou o nome curto na cor da
//   marca) e o NÚMERO da compensação, cadastrado ou deduzido do nome
//   (lib/calc/bancosBR.js);
// - o bloco do PIX: um botão que copia a chave no formato que o app do banco
//   aceita, o aviso quando o tipo cadastrado não bate com a chave, o código
//   "Pix copia e cola" (com valor, se quiser) e o envio só da chave ou só do
//   código no WhatsApp, para quem recebe copiar a mensagem inteira
//   (lib/calc/pix.js).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Copy,
  Check,
  Search,
  X,
  Plus,
  Pencil,
  Trash2,
  MessageCircle,
  AlertTriangle,
  QrCode,
  ImagePlus,
} from "lucide-react";
import { lerBancos, salvarBanco, salvarVarios, removerBanco } from "../services/bancos.js";
import { Card, PageTitle, SectionTitle, CarregandoModulo, ErroModulo } from "../components/ui.jsx";

import { bancosDaImpresilk, contaDaImpresilk } from "../lib/calc/bancos-impresilk.js";
import { codigoDaConta, bancoPeloNome, conflitoDoCodigo, logoDaConta, logoValida, seloDoBanco } from "../lib/calc/bancosBR.js";
import { conferirChave, pixCopiaECola, valorDoCodigo, nomeDoTipo, limiteDaMensagem } from "../lib/calc/pix.js";

const ABERTOS_KEY = "painel_bancos_abertos";

const TIPOS_PIX = ["CNPJ", "CPF", "E-mail", "Telefone", "Aleatoria", "Conta e agencia"];

/* A cidade entra no código "Pix copia e cola" (o manual do Banco Central
   exige o campo). É informativa: o app de quem paga mostra o nome que está
   registrado na chave. Cada conta pode ter a sua; sem ela, vale esta. */
const CIDADE_PADRAO = "Montes Claros";

const VAZIO = {
  id: "",
  grupo: "",
  banco: "",
  codigoBanco: "",
  titular: "",
  doc: "",
  agencia: "",
  conta: "",
  pix: "",
  pixTipo: "CNPJ",
  cidade: "",
  logo: "",
};

/* PELA CONTAGEM DE DÍGITOS, não pela pontuação. A mensagem sai do painel
   direto para cliente e fornecedor: um CPF digitado sem pontos era rotulado
   "CNPJ", e pagamento com o tipo errado trava no banco. 11 dígitos = CPF,
   14 = CNPJ; qualquer outra coisa fica com o rótulo neutro. */
const ehCPF = (doc) => String(doc || "").replace(/\D/g, "").length === 11;

/* O NÚMERO DO BANCO NA MENSAGEM só quando foi CADASTRADO. Um código errado
   vai para dentro de uma TED; o deduzido do nome aparece no cartão, marcado,
   e vira dado quando alguém confirma (a tela pergunta antes de gravar). */
function linhaDoBanco(b) {
  const k = codigoDaConta(b);
  if (!k || k.deduzido) return "";
  return `Banco: ${k.codigo}${k.banco ? ` - ${k.banco.nome}` : ""}`;
}

// O texto que chega para quem pediu os dados. Negrito do WhatsApp = *asteriscos*.
function textoWhatsApp(b) {
  const rotuloDoc = ehCPF(b.doc) ? "CPF" : "CNPJ";
  const pix = b.pix ? conferirChave(b.pix, b.pixTipo) : null;
  return [
    `*${b.banco} - ${b.titular}*`,
    linhaDoBanco(b),
    b.doc && `${rotuloDoc}: ${b.doc}`,
    b.agencia && `Agencia: ${b.agencia}`,
    b.conta && `Conta: ${b.conta}`,
    pix ? `Pix (${pix.tipo ? nomeDoTipo(pix.tipo) : b.pixTipo}): ${pix.chave || b.pix}` : b.pixTipo && `Pix: ${b.pixTipo}`,
  ]
    .filter(Boolean)
    .join("\n");
}

const abrirWhats = (texto) => {
  window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
};

/* A LOGO QUE ALGUÉM ANEXA: reduzida para caber no selo (112 px no lado
   maior) e regravada como PNG. Nada de SVG (pode carregar script) nem da
   imagem original de vários MB dentro do registro da conta. */
async function lerLogo(file) {
  if (!file) throw new Error("Escolha uma imagem.");
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("Use uma imagem PNG, JPG ou WebP.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Imagem grande demais (até 10 MB).");
  const bmp = await createImageBitmap(file);
  const lado = 112;
  const esc = Math.min(1, lado / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * esc));
  const h = Math.max(1, Math.round(bmp.height * esc));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const url = canvas.toDataURL("image/png");
  if (!logoValida(url)) throw new Error("Não foi possível usar esta imagem. Tente outra.");
  return url;
}

function SeloBanco({ conta, todas, tamanho = "h-11 w-11" }) {
  const logo = logoDaConta(conta, todas);
  if (logo) {
    // Branco fixo (não o bg-white do tema): no tema escuro, logo com fundo
    // transparente sumia num quadrado escuro.
    return (
      <span className={`${tamanho} grid shrink-0 place-items-center overflow-hidden rounded-xl border p-1`} style={{ background: "#ffffff", borderColor: "var(--hairline)" }}>
        <img src={logo} alt={`Logo ${conta.banco}`} className="max-h-full max-w-full object-contain" />
      </span>
    );
  }
  const s = seloDoBanco(conta);
  const pequena = s.sigla.length > 4;
  return (
    <span
      aria-hidden="true"
      className={`${tamanho} grid shrink-0 place-items-center rounded-xl px-0.5 text-center font-display font-bold leading-none ${pequena ? "text-[9px]" : "text-xs"}`}
      style={{ background: s.cor, color: s.texto }}
    >
      {s.sigla}
    </span>
  );
}

function Valor({ rotulo, valor, aoCopiar, copiado }) {
  if (!valor) return null;
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="shrink-0 font-display text-xs font-medium uppercase tracking-wide text-slate-400">
        {rotulo}
      </span>
      <button
        type="button"
        onClick={aoCopiar}
        title={`Copiar ${rotulo}`}
        className="group flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-right font-mono text-sm text-slate-700 transition-colors hover:bg-brand/10 hover:text-brand"
      >
        <span className="min-w-0 truncate">{valor}</span>
        {copiado ? (
          <Check size={13} className="shrink-0 text-ok-600" />
        ) : (
          <Copy size={13} className="shrink-0 text-slate-300 group-hover:text-brand" />
        )}
      </button>
    </div>
  );
}

/* O BLOCO DO PIX. O que mais se faz com esta tela é passar a chave: o botão
   grande copia a chave do jeito que o app do banco aceita. O "Pix copia e
   cola" gera o código que o cliente cola no app e já sai com recebedor e,
   se preenchido, o valor. */
function BlocoPix({ b, copiar, copiado }) {
  const [aberto, setAberto] = useState(false);
  const [valor, setValor] = useState("");
  const [mensagem, setMensagem] = useState("");
  const info = conferirChave(b.pix, b.pixTipo);
  const paraCopiar = info.chave || String(b.pix || "").trim();
  const gerado = useMemo(
    () =>
      aberto
        ? pixCopiaECola({ chave: b.pix, tipo: b.pixTipo, nome: b.titular, cidade: b.cidade || CIDADE_PADRAO, valor, mensagem })
        : null,
    [aberto, b.pix, b.pixTipo, b.titular, b.cidade, valor, mensagem]
  );
  const valorOk = valorDoCodigo(valor);
  const limite = limiteDaMensagem(b.pix, b.pixTipo);
  const valorTela = valorOk ? Number(valorOk).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "";
  /* O CÓDIGO VAI SOZINHO NA MENSAGEM. No WhatsApp, "Copiar" leva a mensagem
     inteira: com título ou instrução junto, o app do banco recusa a colagem
     (revisão de 25/09). Um link wa.me manda uma mensagem só. */

  return (
    <div className="mt-2 rounded-lg border bg-slate-50/70 p-2.5" style={{ borderColor: "var(--hairline)" }}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-display text-xs font-semibold uppercase tracking-wide text-slate-500">
          Pix · {info.tipo ? nomeDoTipo(info.tipo) : b.pixTipo}
        </span>
      </div>
      <button
        type="button"
        onClick={() => copiar(paraCopiar, `${b.id}-pix`, "Chave Pix")}
        className="mt-1.5 flex min-h-11 w-full items-center gap-2 rounded-lg bg-brand px-3 py-2 text-left text-white transition-all hover:brightness-95"
        title="Copiar a chave Pix no formato que o app do banco aceita"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-sm">{info.legivel || b.pix}</span>
          <span className="block text-[11px] text-white/80">
            {copiado === `${b.id}-pix` ? "Chave copiada: cole no app do banco" : "Toque para copiar a chave"}
          </span>
        </span>
        {copiado === `${b.id}-pix` ? <Check size={18} className="shrink-0" /> : <Copy size={18} className="shrink-0" />}
      </button>
      {info.aviso && (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-warn-700">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          {info.aviso}
        </p>
      )}
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => setAberto(!aberto)}
          aria-expanded={aberto}
          className="flex min-h-10 items-center justify-center gap-1.5 rounded-lg border bg-white px-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
          style={{ borderColor: "var(--hairline)" }}
          title="Gerar o código que o cliente cola no app e já paga"
        >
          <QrCode size={14} />
          Pix copia e cola
        </button>
        <button
          type="button"
          onClick={() => abrirWhats(paraCopiar)}
          className="flex min-h-10 items-center justify-center gap-1.5 rounded-lg border bg-white px-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
          style={{ borderColor: "var(--hairline)" }}
          title="Mandar no WhatsApp uma mensagem só com a chave, para quem recebe copiar a mensagem inteira"
        >
          <MessageCircle size={14} />
          Só a chave no Whats
        </button>
      </div>

      {aberto && (
        <div className="mt-2 space-y-2 rounded-lg border bg-white p-2.5" style={{ borderColor: "var(--hairline)" }}>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-xs text-slate-500">
              Valor (opcional)
              <input
                className="input mt-1"
                inputMode="decimal"
                placeholder="ex.: 1.250,00"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
              />
            </label>
            <label className="block text-xs text-slate-500">
              Mensagem (opcional, cabem {limite} letras)
              <input
                className="input mt-1"
                maxLength={limite || 72}
                placeholder="ex.: Sinal O.S. 23364"
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
              />
            </label>
          </div>
          {gerado?.erro ? (
            <p className="text-xs text-bad-700">{gerado.erro}</p>
          ) : gerado?.codigo ? (
            <>
              <p className="text-xs text-slate-500">
                {valorTela ? `Código com o valor de ${valorTela}.` : "Sem valor: quem paga digita o valor no app."} Quem paga abre o app do banco, escolhe Pix copia e cola e cola o código.
              </p>
              {gerado.mensagemCortada && (
                <p className="text-xs text-warn-700">
                  A mensagem não coube inteira no código. Vai assim: {gerado.mensagemNoCodigo || "(sem mensagem)"}
                </p>
              )}
              <textarea
                readOnly
                rows={3}
                value={gerado.codigo}
                onFocus={(e) => e.target.select()}
                aria-label="Código Pix copia e cola"
                className="w-full resize-none rounded-lg border bg-slate-50 p-2 font-mono text-[11px] leading-snug text-slate-700"
                style={{ borderColor: "var(--hairline)" }}
              />
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => copiar(gerado.codigo, `${b.id}-codigo`, "Código Pix copia e cola")}
                  className="btn-primary min-h-10 justify-center"
                >
                  {copiado === `${b.id}-codigo` ? <Check size={15} /> : <Copy size={15} />}
                  {copiado === `${b.id}-codigo` ? "Copiado" : "Copiar código"}
                </button>
                <button
                  type="button"
                  onClick={() => abrirWhats(gerado.codigo)}
                  className="flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-ok-700 px-3 font-display text-sm font-semibold text-white transition-all hover:brightness-90"
                  title="Mandar no WhatsApp uma mensagem só com o código, para quem recebe copiar a mensagem inteira"
                >
                  <MessageCircle size={15} />
                  Só o código no Whats
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function Bancos() {
  const [mapa, setMapa] = useState(null); // {id: conta}
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [busca, setBusca] = useState("");
  const [copiado, setCopiado] = useState(null);
  const [form, setForm] = useState(null); // null = formulario fechado
  const [salvando, setSalvando] = useState(false);
  const timer = useRef(null);
  const cartaoForm = useRef(null);

  // O aviso de sucesso fica no rodapé da tela: some sozinho para não cobrir os
  // cartões. O de erro fica até alguém fechar.
  useEffect(() => {
    if (aviso?.tom !== "ok") return undefined;
    const t = setTimeout(() => setAviso(null), 6000);
    return () => clearTimeout(t);
  }, [aviso]);

  useEffect(() => {
    let vivo = true;
    // As contas vem SO do servidor. Elas ja moraram no codigo como semente, e
    // isso significava que qualquer pessoa na internet baixava o arquivo do
    // painel e lia 19 contas, 9 CPF/CNPJ (inclusive o do dono) e 15 chaves Pix
    // sem nenhum login. Plantada a semente, o arquivo virou so risco.
    lerBancos()
      .then((m) => vivo && setMapa(bancosDaImpresilk(m)))
      .catch((e) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
  }, []);

  const [abertos, setAbertos] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(ABERTOS_KEY) || "null") || {};
    } catch {
      return {};
    }
  });

  // Todas as contas (com id), para a logo anexada numa valer nas outras do mesmo banco.
  const todas = useMemo(() => Object.entries(mapa || {}).map(([id, b]) => ({ ...b, id })), [mapa]);

  const grupos = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const itens = todas
      .filter((b) => {
        if (!q) return true;
        const cod = codigoDaConta(b)?.codigo || "";
        return `${b.grupo} ${b.banco} ${cod} ${b.titular} ${b.doc} ${b.agencia} ${b.conta} ${b.pix} ${b.pixTipo}`
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => (a.ordem ?? 9999) - (b.ordem ?? 9999));

    const lista = [];
    itens.forEach((b) => {
      const nome = /^universo(?:\s|$)/i.test(b.titular.trim()) ? "Universo" : "Impresilk";
      let g = lista.find((x) => x.nome === nome);
      if (!g) {
        g = { nome, itens: [] };
        lista.push(g);
      }
      g.itens.push(b);
    });
    return lista;
  }, [todas, busca]);

  const buscando = !!busca.trim();

  const estaAberto = (nome, i) => {
    if (buscando) return true;
    if (nome in abertos) return !!abertos[nome];
    return i === 0;
  };

  const alternar = (nome, i) => {
    // Durante a busca todos ficam abertos a forca; gravar aqui mudaria a
    // preferencia sem efeito visivel e o grupo fecharia ao limpar a busca.
    if (buscando) return;
    const novo = { ...abertos, [nome]: !estaAberto(nome, i) };
    setAbertos(novo);
    try {
      localStorage.setItem(ABERTOS_KEY, JSON.stringify(novo));
    } catch {}
  };

  /* O QUE FOI COPIADO É DITO em voz alta pelo leitor de tela (região viva
     abaixo): trocar o ícone por um tique não chega a quem não vê. */
  const [falado, setFalado] = useState("");
  const falar = (t) => { setFalado(""); requestAnimationFrame(() => setFalado(t)); };
  const copiar = async (texto, chave, rotulo = "Dado") => {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = texto;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const copiou = document.execCommand("copy");
        ta.remove();
        if (!copiou) throw new Error("Cópia indisponível");
      } catch {
        setAviso({tom:"erro",texto:"Não foi possível copiar. Selecione o dado e copie manualmente."});
        falar("Não foi possível copiar");
        return;
      }
    }
    setCopiado(chave);
    falar(`${rotulo} copiado`);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopiado(null), 1600);
  };

  const abrirForm = (b) => {
    setAviso(null);
    // `_orig` guarda a conta como ela estava ao abrir: salvar grava só o que
    // mudou aqui, e não desfaz o que foi confirmado no cartão nesse meio tempo.
    setForm(
      b
        ? { ...VAZIO, ...b, _orig: b, logoMexida: false }
        : { ...VAZIO, cadastroId: crypto.randomUUID(), grupo: "Impresilk e Universo", titular: "Impresilk", logoMexida: false }
    );
    setTimeout(() => cartaoForm.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
  };

  /* O código deduzido do nome vira dado quando alguém confirma. Pergunta
     antes: dali em diante ele sai em toda mensagem de TED, e o "confirmar"
     fica colado no número, que é tocado para copiar. */
  const confirmarCodigo = async (b, codigo) => {
    const k = codigoDaConta(b);
    if (!window.confirm(`Gravar ${codigo}${k?.banco ? ` (${k.banco.nome})` : ""} como número do banco de "${b.banco}"? Ele passa a sair na mensagem do WhatsApp.`)) return;
    setAviso(null);
    try {
      await salvarBanco(b.id, { codigoBanco: codigo });
      setMapa((m) => ({ ...(m || {}), [b.id]: { ...(m || {})[b.id], codigoBanco: codigo } }));
      setAviso({ tom: "ok", texto: `${b.banco}: código ${codigo} confirmado.` });
    } catch (err) {
      setAviso({ tom: "erro", texto: err.message });
    }
  };

  const escolherLogo = async (file) => {
    try {
      const logo = await lerLogo(file);
      setForm((f) => ({ ...f, logo, logoMexida: true }));
    } catch (err) {
      setAviso({ tom: "erro", texto: err.message });
    }
  };

  const salvar = useCallback(
    async (e) => {
      e.preventDefault();
      setAviso(null);
      if (!form.banco.trim() || !form.titular.trim()) {
        return setAviso({ tom: "erro", texto: "Banco e titular são obrigatórios." });
      }
      if (!contaDaImpresilk(form)) {
        return setAviso({ tom: "erro", texto: "Cadastre aqui somente contas de titularidade da Impresilk ou da Universo." });
      }
      const codigoBanco = String(form.codigoBanco || "").trim();
      if (codigoBanco && !/^\d{3}$/.test(codigoBanco)) {
        return setAviso({ tom: "erro", texto: "O código do banco tem 3 dígitos (ex.: 756 para o Sicoob)." });
      }
      if (form.logo && !logoValida(form.logo)) {
        return setAviso({ tom: "erro", texto: "A logo não é uma imagem válida. Escolha outra." });
      }
      // Número que contradiz o nome, ou desconhecido: vai para a TED, então pergunta.
      const conflito = conflitoDoCodigo(form.banco, codigoBanco);
      if (conflito && codigoBanco !== String(form._orig?.codigoBanco ?? "").trim()
        && !window.confirm(`${conflito}\n\nGravar ${codigoBanco} mesmo assim?`)) return;
      setSalvando(true);
      try {
        const id = form.id || form.cadastroId;
        const ordem =
          form.ordem ??
          Math.max(0, ...Object.values(mapa || {}).map((x) => x.ordem ?? 0)) + 1;
        const conta = {
          grupo: /^universo(?:\s|$)/i.test(form.titular.trim()) ? "Universo" : "Impresilk",
          banco: form.banco.trim(),
          codigoBanco,
          titular: form.titular.trim(),
          doc: form.doc.trim(),
          agencia: form.agencia.trim(),
          conta: form.conta.trim(),
          pix: form.pix.trim(),
          pixTipo: form.pixTipo,
          cidade: String(form.cidade || "").trim(),
          logo: form.logo || "",
          ordem,
        };
        /* SÓ O QUE MUDOU NESTE FORMULÁRIO. Revisão de 25/09: com o formulário
           aberto, confirmar o número no cartão e depois salvar gravava o
           número de quando o formulário abriu ("") por cima do confirmado. */
        const igual = (a, b) => String(a ?? "").trim() === String(b ?? "").trim();
        const patch = form.id
          ? Object.fromEntries(Object.entries(conta).filter(([k, v]) => !igual(v, form._orig?.[k])))
          : conta;
        if (!form.logoMexida) delete patch.logo;
        /* A LOGO É DO BANCO, não da conta: quem não tem logo própria mostra a
           de outra conta do mesmo banco. Então anexar ou tirar vale para todas
           as contas do mesmo número, num pedido só. */
        const cod = codigoDaConta(conta)?.codigo;
        const outras = form.logoMexida && cod
          ? todas.filter((x) => x.id !== id && codigoDaConta(x)?.codigo === cod && (x.logo || "") !== conta.logo)
          : [];
        if (!Object.keys(patch).length && !outras.length) {
          setForm(null);
          return setAviso({ tom: "ok", texto: "Nada mudou nesta conta." });
        }
        if (Object.keys(patch).length) await salvarBanco(id, patch);
        if (outras.length) await salvarVarios(Object.fromEntries(outras.map((x) => [x.id, { logo: conta.logo }])));
        setMapa((m) => {
          const novo = { ...(m || {}), [id]: { ...(m || {})[id], ...patch } };
          for (const x of outras) novo[x.id] = { ...novo[x.id], logo: conta.logo };
          return novo;
        });
        setForm(null);
        const n = outras.length;
        setAviso({
          tom: "ok",
          texto: `${conta.banco} - ${conta.titular} salvo.${n ? ` A logo ${conta.logo ? "vale" : "saiu"} também em ${n} ${n === 1 ? "outra conta" : "outras contas"} do mesmo banco.` : ""}`,
        });
      } catch (err) {
        setAviso({ tom: "erro", texto: err.message });
      } finally {
        setSalvando(false);
      }
    },
    [form, mapa, todas]
  );

  const remover = async (b) => {
    // Um toque errado apagava agencia, conta e chave Pix sem volta -- dado que
    // so existe no servidor e ninguem sabe de cabeca. O resto do painel confirma.
    if (!window.confirm(`Apagar a conta ${b.banco}, de ${b.titular}? Sem volta.`)) return;
    setAviso(null);
    try {
      await removerBanco(b.id);
      setMapa((m) => {
        const novo = { ...(m || {}) };
        delete novo[b.id];
        return novo;
      });
      if (form?.id === b.id) setForm(null);
      setAviso({ tom: "ok", texto: `${b.banco} - ${b.titular} removido.` });
    } catch (err) {
      setAviso({ tom: "erro", texto: err.message });
    }
  };

  if (erro) {
    return (
      <div className="space-y-6">
        <PageTitle titulo="Bancos e Pix" descricao="Contas e chaves Pix da Impresilk e da Universo." />
        <ErroModulo mensagem={erro} aoTentar={() => window.location.reload()}/>
      </div>
    );
  }
  if (mapa === null) return <CarregandoModulo />;

  const sugestao = form ? bancoPeloNome(form.banco) : null;
  // A logo que o formulário mostra: a própria, ou a herdada de outra conta do mesmo banco.
  const logoDoForm = form ? logoDaConta(form, form.logoMexida ? [] : todas.filter((x) => x.id !== form.id)) : "";

  return (
    <div className="space-y-6">
      <PageTitle
        titulo="Bancos e Pix"
        descricao="Contas e chaves Pix da Impresilk e da Universo. Copie a chave Pix com um toque, gere o Pix copia e cola ou mande tudo no WhatsApp."
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1 sm:max-w-md">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9 pr-9"
            aria-label="Buscar banco, número, titular, CNPJ, conta ou chave" placeholder="Buscar banco, número, titular, CNPJ, conta ou chave"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          {buscando && (
            <button
              type="button"
              onClick={() => setBusca("")}
              className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-slate-400 hover:text-slate-700"
              aria-label="Limpar busca"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <button type="button" className="btn-primary" onClick={() => abrirForm(null)}>
          <Plus size={15} strokeWidth={2.4} />
          Nova conta
        </button>
      </div>

      {/* O AVISO FICA NO RODAPÉ DA TELA, não no topo da página: no celular,
          quem tocou em "confirmar" ou "Salvar" lá embaixo não via o erro que
          aparecia centenas de pixels acima (revisão de 25/09). */}
      {aviso && (
        <div
          role={aviso.tom === "ok" ? "status" : "alert"}
          className={`fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-lg items-start gap-2 rounded-xl px-4 py-3 text-sm shadow-lg ${
            aviso.tom === "ok" ? "bg-ok-50 text-ok-700" : "bg-bad-50 text-bad-700"
          }`}
        >
          <span className="min-w-0 flex-1">{aviso.texto}</span>
          <button
            type="button"
            onClick={() => setAviso(null)}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg hover:bg-black/5"
            aria-label="Fechar aviso"
          >
            <X size={15} />
          </button>
        </div>
      )}
      <span className="sr-only" role="status" aria-live="polite">{falado}</span>

      {form && (
        <Card ref={cartaoForm}>
          <SectionTitle
            titulo={form.id ? "Editar conta" : "Nova conta"}
            sub="Deixe a chave Pix em branco e escolha 'Conta e agência' quando não houver chave."
          />
          <form onSubmit={salvar} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="label" htmlFor="b-banco">Banco</label>
                <input
                  id="b-banco"
                  className="input"
                  placeholder="ex.: Sicoob Credinor"
                  value={form.banco}
                  onChange={(e) => setForm((f) => ({ ...f, banco: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="b-codigo">Número do banco</label>
                <input
                  id="b-codigo"
                  className="input"
                  inputMode="numeric"
                  maxLength={3}
                  pattern="\d{3}"
                  title="3 dígitos, ex.: 756"
                  placeholder={sugestao ? `${sugestao.codigo} (${sugestao.sigla})` : "3 dígitos, ex.: 756"}
                  value={form.codigoBanco}
                  onChange={(e) => setForm((f) => ({ ...f, codigoBanco: e.target.value.replace(/\D/g, "").slice(0, 3) }))}
                />
                {sugestao && form.codigoBanco !== sugestao.codigo && (
                  <button
                    type="button"
                    className="mt-1 inline-flex min-h-10 items-center text-left text-xs text-brand-700 hover:underline"
                    onClick={() => setForm((f) => ({ ...f, codigoBanco: sugestao.codigo }))}
                  >
                    Pelo nome: {sugestao.codigo} · {sugestao.nome}. Usar este
                  </button>
                )}
              </div>
              <div>
                <label className="label" htmlFor="b-titular">Titular</label>
                <input
                  id="b-titular"
                  className="input"
                  placeholder="ex.: Impresilk"
                  value={form.titular}
                  onChange={(e) => setForm((f) => ({ ...f, titular: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="b-doc">CNPJ ou CPF</label>
                <input
                  id="b-doc"
                  className="input"
                  placeholder="00.000.000/0000-00"
                  value={form.doc}
                  onChange={(e) => setForm((f) => ({ ...f, doc: e.target.value }))}
                />
              </div>
              <div>
                <label className="label" htmlFor="b-ag">Agência</label>
                <input
                  id="b-ag"
                  className="input"
                  value={form.agencia}
                  onChange={(e) => setForm((f) => ({ ...f, agencia: e.target.value }))}
                />
              </div>
              <div>
                <label className="label" htmlFor="b-cc">Conta</label>
                <input
                  id="b-cc"
                  className="input"
                  value={form.conta}
                  onChange={(e) => setForm((f) => ({ ...f, conta: e.target.value }))}
                />
              </div>
              <div>
                <label className="label" htmlFor="b-pixtipo">Tipo da chave Pix</label>
                <select
                  id="b-pixtipo"
                  className="input"
                  value={form.pixTipo}
                  onChange={(e) => setForm((f) => ({ ...f, pixTipo: e.target.value }))}
                >
                  {TIPOS_PIX.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="b-pix">Chave Pix</label>
                <input
                  id="b-pix"
                  className="input"
                  placeholder="deixe em branco se a conta não tem chave"
                  value={form.pix}
                  onChange={(e) => setForm((f) => ({ ...f, pix: e.target.value }))}
                />
                {form.pix.trim() && conferirChave(form.pix, form.pixTipo).aviso && (
                  <p className="mt-1 flex items-start gap-1.5 text-xs text-warn-700">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    {conferirChave(form.pix, form.pixTipo).aviso}
                  </p>
                )}
              </div>
              <div>
                <label className="label" htmlFor="b-cidade">Cidade do titular</label>
                <input
                  id="b-cidade"
                  className="input"
                  placeholder={CIDADE_PADRAO}
                  value={form.cidade}
                  onChange={(e) => setForm((f) => ({ ...f, cidade: e.target.value }))}
                />
                <span className="mt-1 block text-xs text-slate-500">Vai no código Pix copia e cola. Em branco: {CIDADE_PADRAO}.</span>
              </div>
              <div className="sm:col-span-2">
                <span className="label">Logo do banco</span>
                <div className="flex flex-wrap items-center gap-3">
                  {/* A prévia mostra o que vai ficar: mexeu na logo, vale a do
                      formulário; senão, a própria ou a herdada do mesmo banco. */}
                  <SeloBanco
                    conta={{ ...form, id: form.id || "novo" }}
                    todas={form.logoMexida ? [] : todas.filter((x) => x.id !== form.id)}
                    tamanho="h-14 w-14"
                  />
                  <label className="btn-ghost min-h-10 cursor-pointer">
                    <ImagePlus size={15} />
                    {logoDoForm ? "Trocar imagem" : "Anexar imagem"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      onChange={(e) => { escolherLogo(e.target.files?.[0]); e.target.value = ""; }}
                    />
                  </label>
                  {logoDoForm && (
                    <button type="button" className="btn-ghost min-h-10" onClick={() => setForm((f) => ({ ...f, logo: "", logoMexida: true }))}>
                      Tirar a logo
                    </button>
                  )}
                </div>
                <span className="mt-1 block text-xs text-slate-500">
                  PNG, JPG ou WebP, reduzida para caber no selo. A logo é do banco: vale para todas as contas com o mesmo número.
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button className="btn-primary" disabled={salvando}>
                {salvando ? "Salvando..." : form.id ? "Salvar alterações" : "Cadastrar conta"}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setForm(null)}>
                Cancelar
              </button>
            </div>
          </form>
        </Card>
      )}

      {grupos.length === 0 && (
        <p className="text-sm text-slate-500">
          {buscando ? `Nada com "${busca}". Confira a grafia.` : "Nenhuma conta cadastrada ainda."}
        </p>
      )}

      {/* AS EMPRESAS VIRAM CARTÕES.
          Cada grupo era uma faixa da largura da tela, com o nome à esquerda e
          um vazio enorme no meio: cinco empresas viravam cinco telas de
          rolagem, e abrir a certa era mirar numa setinha. Em cartão, elas cabem
          numa olhada e o clique é no cartão inteiro. */}
      {grupos.length > 1 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {grupos.map((g, i) => {
            const aberto = estaAberto(g.nome, i);
            return (
              <button
                key={`card-${g.nome}`}
                type="button"
                onClick={() => alternar(g.nome, i)}
                aria-pressed={aberto}
                className={`rounded-xl border px-4 py-3 text-left transition-all ${
                  aberto
                    ? "border-brand bg-brand text-white shadow-sm"
                    : "bg-white hover:border-brand-300 hover:shadow-sm"
                }`}
                style={aberto ? undefined : { borderColor: "var(--hairline)" }}
              >
                <span className="block truncate font-display text-sm font-semibold">{g.nome}</span>
                <span className={`block text-xs ${aberto ? "text-white/75" : "text-slate-500"}`}>
                  {g.itens.length} {g.itens.length === 1 ? "conta" : "contas"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {grupos.map((g, i) => {
        // Com UMA empresa só não existe grade de cartões (ela pede 2+): fechar
        // o único grupo deixava a tela vazia, sem nenhum botão de volta -- e o
        // estado ficava gravado, sobrevivendo ao recarregar.
        const aberto = grupos.length === 1 || estaAberto(g.nome, i);
        // Fechado não ocupa espaço: quem escolhe é o cartão lá em cima.
        if (!aberto) return null;
        return (
          <Card key={g.nome} className="p-0">
            <button
              type="button"
              onClick={() => alternar(g.nome, i)}
              aria-expanded={aberto}
              className="flex w-full items-center gap-2.5 px-5 py-4 text-left"
            >
              <ChevronDown
                size={16}
                className={`shrink-0 text-slate-400 transition-transform ${aberto ? "" : "-rotate-90"}`}
              />
              <span className="min-w-0 flex-1 truncate font-display text-base font-semibold text-slate-900">
                {g.nome}
              </span>
              <span className="chip">
                {g.itens.length} {g.itens.length === 1 ? "conta" : "contas"}
              </span>
            </button>

            {aberto && (
              <div className="grid grid-cols-1 gap-3 px-5 pb-5 sm:grid-cols-2 2xl:grid-cols-3">
                {/* Duas colunas até tela muito larga: com três, o botão da chave e
                    o do WhatsApp quebravam o rótulo em duas linhas. */}
                {g.itens.map((b) => {
                  const cod = codigoDaConta(b);
                  return (
                    <div
                      key={b.id}
                      className="flex min-w-0 flex-col rounded-xl border p-3.5"
                      style={{ borderColor: "var(--hairline)" }}
                    >
                      <div className="flex items-start gap-2.5">
                        <SeloBanco conta={b} todas={todas} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-display text-sm font-semibold text-slate-900">
                            {b.banco}
                          </span>
                          <span className="block truncate text-xs text-slate-500">{b.titular}</span>
                          {cod ? (
                            <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
                              <button
                                type="button"
                                onClick={() => copiar(cod.codigo, `${b.id}-cod`, "Número do banco")}
                                className="inline-flex min-h-10 items-center rounded px-2 font-mono font-semibold text-slate-700 hover:bg-brand/10 hover:text-brand"
                                title="Copiar o número do banco"
                              >
                                {cod.codigo}
                                {copiado === `${b.id}-cod` && <Check size={11} className="ml-1 inline text-ok-600" />}
                              </button>
                              {cod.banco && <span className="truncate text-slate-500">{cod.banco.nome}</span>}
                              {cod.deduzido && (
                                <button
                                  type="button"
                                  onClick={() => confirmarCodigo(b, cod.codigo)}
                                  className="inline-flex min-h-10 items-center text-left text-warn-700 hover:underline"
                                  title="O número foi deduzido do nome. Confirme para ele entrar na mensagem do WhatsApp."
                                >
                                  pelo nome · confirmar
                                </button>
                              )}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => abrirForm(b)}
                              className="mt-0.5 inline-flex min-h-10 items-center text-xs text-warn-700 hover:underline"
                            >
                              sem número do banco · cadastrar
                            </button>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => abrirForm(b)}
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                          title={`Editar ${b.banco}`}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => remover(b)}
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-bad-50 hover:text-bad-700"
                          title={`Remover ${b.banco}`}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      <div className="mt-1.5 flex-1">
                        <Valor
                          rotulo={ehCPF(b.doc) ? "CPF" : "CNPJ"}
                          valor={b.doc}
                          copiado={copiado === `${b.id}-doc`}
                          aoCopiar={() => copiar(b.doc, `${b.id}-doc`, ehCPF(b.doc) ? "CPF" : "CNPJ")}
                        />
                        <Valor
                          rotulo="Agência"
                          valor={b.agencia}
                          copiado={copiado === `${b.id}-ag`}
                          aoCopiar={() => copiar(b.agencia, `${b.id}-ag`, "Agência")}
                        />
                        <Valor
                          rotulo="Conta"
                          valor={b.conta}
                          copiado={copiado === `${b.id}-cc`}
                          aoCopiar={() => copiar(b.conta, `${b.id}-cc`, "Conta")}
                        />
                        {b.pix ? (
                          <BlocoPix b={b} copiar={copiar} copiado={copiado} />
                        ) : (
                          <div className="flex items-baseline justify-between gap-3 py-1">
                            <span className="font-display text-xs font-medium uppercase tracking-wide text-slate-400">
                              Pix
                            </span>
                            <span className="text-sm text-slate-400">
                              {b.pixTipo === "Conta e agencia" ? "sem chave: por agência e conta" : b.pixTipo}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="mt-3 flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => abrirWhats(textoWhatsApp(b))}
                          // ok-700, e o hover ESCURECE: voltar para ok-600 no hover
                          // devolvia os 3,3:1 que este botao existe para evitar.
                          className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-ok-700 px-3 py-2 font-display text-sm font-semibold text-white transition-all hover:brightness-90"
                          title="Abrir o WhatsApp com estes dados prontos"
                        >
                          <MessageCircle size={15} strokeWidth={2.4} />
                          Mandar dados no WhatsApp
                        </button>
                        <button
                          type="button"
                          onClick={() => copiar(textoWhatsApp(b), `${b.id}-tudo`, "Dados da conta")}
                          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                          style={{ borderColor: "var(--hairline)" }}
                          title="Copiar a conta inteira"
                        >
                          {copiado === `${b.id}-tudo` ? (
                            <Check size={15} className="text-ok-600" />
                          ) : (
                            <Copy size={15} />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
