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

// 10/10/2026, pedido do Léo: "manter padrão, só melhoria de design com muita
// qualidade". Tudo o que a tela faz ficou igual; mudou a hierarquia (ver o
// cabeçalho de bancos.css): a escolha da empresa virou um seletor só na barra
// da busca (antes eram cartões grandes E um cabeçalho recolhível, a mesma
// escolha duas vezes), e no cartão da conta só o WhatsApp é botão cheio.

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
  Landmark,
} from "lucide-react";
import { lerBancos, salvarBanco, salvarVarios, removerBanco } from "../services/bancos.js";
import { Card, PageTitle, CarregandoModulo, ErroModulo } from "../components/ui.jsx";
import "./bancos.css";

import { bancosDaImpresilk, contaDaImpresilk } from "../lib/calc/bancos-impresilk.js";
import { codigoDaConta, bancoPeloNome, conflitoDoCodigo, logoDaConta, logoValida, seloDoBanco } from "../lib/calc/bancosBR.js";
import { conferirChave, pixCopiaECola, valorDoCodigo, nomeDoTipo, limiteDaMensagem } from "../lib/calc/pix.js";

/* A EMPRESA ESCOLHIDA fica lembrada neste aparelho. "" = a primeira (o padrão
   de antes: abrir só a primeira empresa, para a lista caber numa olhada);
   "todas" = todas. A chave antiga (painel_bancos_abertos, um mapa de grupos
   abertos) deixou de ser lida: o seletor escolhe uma ou todas. */
const EMPRESA_KEY = "painel_bancos_empresa";
const TODAS = "todas";

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

/* O NÚMERO DO BANCO VAI NA MENSAGEM SEMPRE QUE É CONHECIDO. Até 10/10/2026 ia
   só o CADASTRADO (o deduzido do nome ficava de fora, por cautela com TED), e
   a conta completa chegava sem o número: o Léo pediu que ele vá sempre. O
   deduzido sai da tabela dos bancos (lib/calc/bancosBR.js) e continua marcado
   no cartão com "confirmar", para quem quiser gravar. */
function linhaDoBanco(b) {
  const k = codigoDaConta(b);
  if (!k) return "";
  return `Banco: ${k.codigo}${k.banco ? ` - ${k.banco.nome}` : ""}`;
}

// A chave como ela vai na mensagem: no formato que o app do banco aceita.
function pixDaConta(b) {
  if (!b.pix) return null;
  const info = conferirChave(b.pix, b.pixTipo);
  return { tipo: info.tipo ? nomeDoTipo(info.tipo) : b.pixTipo, chave: info.chave || String(b.pix).trim() };
}

// O texto que chega para quem pediu os dados. Negrito do WhatsApp = *asteriscos*.
// `semPix`: a conta sem a linha do Pix, para quando o Pix vai em destaque no alto.
function textoWhatsApp(b, { semPix = false } = {}) {
  const rotuloDoc = ehCPF(b.doc) ? "CPF" : "CNPJ";
  const pix = pixDaConta(b);
  return [
    `*${b.banco} - ${b.titular}*`,
    linhaDoBanco(b),
    b.doc && `${rotuloDoc}: ${b.doc}`,
    b.agencia && `Agencia: ${b.agencia}`,
    b.conta && `Conta: ${b.conta}`,
    semPix ? "" : pix ? `Pix (${pix.tipo}): ${pix.chave}` : b.pixTipo && `Pix: ${b.pixTipo}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/* PIX COM A CONTA COMPLETA (pedido do Léo, 10/10/2026): a chave em destaque no
   alto, sozinha numa linha (no computador dá para selecionar só ela), e
   embaixo a conta inteira com o número do banco, para quem também precisa
   de TED ou de conferir o titular. Sem a opção, vai só a chave, como antes:
   no celular, "Copiar" leva a mensagem inteira, e a chave sozinha cola no
   app do banco sem sobra. */
function textoPixComConta(b) {
  const pix = pixDaConta(b);
  if (!pix) return textoWhatsApp(b);
  return `*Pix (${pix.tipo})*\n${pix.chave}\n\n${textoWhatsApp(b, { semPix: true })}`;
}

const PIX_COM_CONTA_KEY = "painel_bancos_pix_com_conta";

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

function SeloBanco({ conta, todas, tamanho = "h-12 w-12" }) {
  const logo = logoDaConta(conta, todas);
  if (logo) {
    // Branco fixo (não o bg-white do tema): no tema escuro, logo com fundo
    // transparente sumia num quadrado escuro.
    return (
      <span className={`${tamanho} grid shrink-0 place-items-center overflow-hidden rounded-[14px] border p-1.5`} style={{ background: "#ffffff", borderColor: "var(--hairline)" }}>
        <img src={logo} alt={`Logo ${conta.banco}`} className="max-h-full max-w-full object-contain" />
      </span>
    );
  }
  const s = seloDoBanco(conta);
  const pequena = s.sigla.length > 4;
  return (
    <span
      aria-hidden="true"
      className={`${tamanho} grid shrink-0 place-items-center rounded-[14px] px-0.5 text-center font-display font-bold leading-none ${pequena ? "text-[9px]" : "text-xs"}`}
      style={{ background: s.cor, color: s.texto, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.06)" }}
    >
      {s.sigla}
    </span>
  );
}

/* UMA LINHA INTEIRA COPIA: o alvo é a largura toda, não o ícone de 13 px. O
   tique e a cor verde dizem que copiou; a região viva diz a quem não vê. */
function Valor({ rotulo, valor, aoCopiar, copiado }) {
  if (!valor) return null;
  return (
    <div className="bk-linha">
      <dt>{rotulo}</dt>
      <dd>
        <button
          type="button"
          onClick={aoCopiar}
          title={`Copiar ${rotulo}`}
          aria-label={`Copiar ${rotulo}: ${valor}`}
          className={`bk-copiavel ${copiado ? "copiado" : ""}`}
        >
          <span className="bk-valor">{valor}</span>
          {copiado ? <Check size={15} strokeWidth={2.6} /> : <Copy size={15} />}
        </button>
      </dd>
    </div>
  );
}

/* O BLOCO DO PIX. O que mais se faz com esta tela é passar a chave: o botão
   grande copia a chave do jeito que o app do banco aceita. O "Pix copia e
   cola" gera o código que o cliente cola no app e já sai com recebedor e,
   se preenchido, o valor. */
function BlocoPix({ b, copiar, copiado, comConta, aoMudarComConta }) {
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

  const chaveCopiada = copiado === `${b.id}-pix`;
  const codigoCopiado = copiado === `${b.id}-codigo`;

  return (
    <section className="bk-pix" aria-label={`Pix de ${b.banco}`}>
      <div className="bk-pix-cab">
        <span className="bk-pix-rotulo">Pix</span>
        <span className="bk-pix-tipo">{info.tipo ? nomeDoTipo(info.tipo) : b.pixTipo}</span>
      </div>
      <button
        type="button"
        onClick={() => copiar(paraCopiar, `${b.id}-pix`, "Chave Pix")}
        className={`bk-pix-chave ${chaveCopiada ? "copiado" : ""}`}
        title="Copiar a chave Pix no formato que o app do banco aceita"
      >
        <span className="bk-pix-texto">
          <span className="bk-pix-valor">{info.legivel || b.pix}</span>
          <span className="bk-pix-dica">
            {chaveCopiada ? "Chave copiada: cole no app do banco" : "Toque para copiar a chave"}
          </span>
        </span>
        <span className="bk-pix-acao" aria-hidden="true">
          {chaveCopiada ? <Check size={16} strokeWidth={2.6} /> : <Copy size={16} />}
          <span>{chaveCopiada ? "Copiada" : "Copiar"}</span>
        </span>
      </button>
      {info.aviso && (
        <p className="bk-pix-aviso">
          <AlertTriangle size={13} />
          {info.aviso}
        </p>
      )}
      <div className="bk-pix-extras">
        <button
          type="button"
          onClick={() => setAberto(!aberto)}
          aria-expanded={aberto}
          className="bk-quieto"
          title="Gerar o código que o cliente cola no app e já paga"
        >
          <QrCode size={15} />
          Pix copia e cola
          <ChevronDown size={14} className="bk-seta" />
        </button>
        <button
          type="button"
          onClick={() => abrirWhats(comConta ? textoPixComConta(b) : paraCopiar)}
          className="bk-quieto"
          title={
            comConta
              ? "Mandar no WhatsApp a chave Pix em destaque e, embaixo, a conta completa com o número do banco"
              : "Mandar no WhatsApp uma mensagem só com a chave, para quem recebe copiar a mensagem inteira"
          }
        >
          <MessageCircle size={15} />
          {comConta ? "Pix e conta no Whats" : "Só a chave no Whats"}
        </button>
      </div>
      {/* A ESCOLHA DE MANDAR A CONTA JUNTO vale para todas as contas e fica
          lembrada neste aparelho. O código copia e cola continua indo sozinho:
          com texto junto, o app do banco recusa a colagem. */}
      <label className="bk-junto">
        <input type="checkbox" checked={comConta} onChange={(e) => aoMudarComConta(e.target.checked)} />
        <span>Mandar a conta completa junto com o Pix</span>
      </label>

      {aberto && (
        <div className="bk-cc">
          <div className="bk-cc-campos">
            <label>
              Valor (opcional)
              <input
                className="input"
                inputMode="decimal"
                placeholder="ex.: 1.250,00"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
              />
            </label>
            <label>
              Mensagem (opcional, cabem {limite} letras)
              <input
                className="input"
                maxLength={limite || 72}
                placeholder="ex.: Sinal O.S. 23364"
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
              />
            </label>
          </div>
          {gerado?.erro ? (
            <p className="bk-cc-nota erro">{gerado.erro}</p>
          ) : gerado?.codigo ? (
            <>
              <p className="bk-cc-nota">
                {valorTela ? `Código com o valor de ${valorTela}.` : "Sem valor: quem paga digita o valor no app."} Quem paga abre o app do banco, escolhe Pix copia e cola e cola o código.
              </p>
              {gerado.mensagemCortada && (
                <p className="bk-cc-nota aviso">
                  A mensagem não coube inteira no código. Vai assim: {gerado.mensagemNoCodigo || "(sem mensagem)"}
                </p>
              )}
              <textarea
                readOnly
                rows={4}
                value={gerado.codigo}
                onFocus={(e) => e.target.select()}
                aria-label="Código Pix copia e cola"
              />
              <div className="bk-cc-acoes">
                <button
                  type="button"
                  onClick={() => copiar(gerado.codigo, `${b.id}-codigo`, "Código Pix copia e cola")}
                  className="btn-primary min-h-11 justify-center rounded-xl"
                >
                  {codigoCopiado ? <Check size={15} /> : <Copy size={15} />}
                  {codigoCopiado ? "Copiado" : "Copiar código"}
                </button>
                <button
                  type="button"
                  onClick={() => abrirWhats(gerado.codigo)}
                  className="bk-whats"
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
    </section>
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

  const [pixComConta, setPixComConta] = useState(() => {
    try {
      return localStorage.getItem(PIX_COM_CONTA_KEY) === "1";
    } catch {
      return false;
    }
  });
  const mudarPixComConta = (sim) => {
    setPixComConta(sim);
    try {
      localStorage.setItem(PIX_COM_CONTA_KEY, sim ? "1" : "0");
    } catch {}
  };

  const [empresa, setEmpresa] = useState(() => {
    try {
      return localStorage.getItem(EMPRESA_KEY) || "";
    } catch {
      return "";
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

  // A contagem do seletor é a da empresa inteira, não a da busca: o número ao
  // lado do nome não pode mudar enquanto se digita sem dizer por quê.
  const totais = useMemo(() => {
    const t = {};
    for (const b of todas) {
      const nome = /^universo(?:\s|$)/i.test(String(b.titular || "").trim()) ? "Universo" : "Impresilk";
      t[nome] = (t[nome] || 0) + 1;
    }
    return t;
  }, [todas]);
  const nomesEmpresas = useMemo(
    () => ["Impresilk", "Universo"].filter((n) => totais[n]),
    [totais]
  );

  /* Qual empresa aparece. Durante a busca, todas (a busca procura em tudo);
     com uma empresa só, ela. Sem escolha gravada, a primeira, como antes. */
  const escolhida = buscando || nomesEmpresas.length <= 1
    ? TODAS
    : empresa === TODAS || nomesEmpresas.includes(empresa)
      ? empresa
      : nomesEmpresas[0];
  const visiveis = escolhida === TODAS ? grupos : grupos.filter((g) => g.nome === escolhida);

  const escolher = (nome) => {
    // Durante a busca o seletor fica parado (todas aparecem): gravar aqui
    // mudaria a preferência sem efeito visível.
    if (buscando) return;
    setEmpresa(nome);
    try {
      localStorage.setItem(EMPRESA_KEY, nome);
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
    if (!window.confirm(`Gravar ${codigo}${k?.banco ? ` (${k.banco.nome})` : ""} como número do banco de "${b.banco}"? Ele já vai na mensagem do WhatsApp; gravado, deixa de ser dedução pelo nome.`)) return;
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
  const campo = (nome) => (e) => setForm((f) => ({ ...f, [nome]: e.target.value }));

  return (
    <div className="bk-page">
      <PageTitle
        titulo="Bancos e Pix"
        descricao="Contas e chaves Pix da Impresilk e da Universo. Copie a chave Pix com um toque, gere o Pix copia e cola ou mande tudo no WhatsApp."
      />

      <div className="bk-barra">
        <div className="bk-busca">
          <Search size={17} />
          <input
            className="input"
            aria-label="Buscar banco, número, titular, CNPJ, conta ou chave"
            placeholder="Buscar banco, número, titular, CNPJ, conta ou chave"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          {buscando && (
            <button type="button" onClick={() => setBusca("")} className="bk-busca-limpar" aria-label="Limpar busca">
              <X size={16} />
            </button>
          )}
        </div>

        {/* A EMPRESA É ESCOLHIDA AQUI, num lugar só. Antes eram cartões grandes
            por empresa e, embaixo, o mesmo nome num cabeçalho recolhível: a
            mesma escolha duas vezes, e uma faixa roxa que pesava mais que as
            contas. */}
        {nomesEmpresas.length > 1 && (
          <div className="bk-empresas" role="group" aria-label="Empresa">
            {[TODAS, ...nomesEmpresas].map((nome) => (
              <button
                key={nome}
                type="button"
                className="bk-empresa"
                aria-pressed={escolhida === nome}
                disabled={buscando}
                title={buscando ? "Durante a busca aparecem todas as empresas" : undefined}
                onClick={() => escolher(nome)}
              >
                {nome === TODAS ? "Todas" : nome}
                <span className="bk-empresa-n">{nome === TODAS ? todas.length : totais[nome]}</span>
              </button>
            ))}
          </div>
        )}

        <button type="button" className="btn-primary bk-nova" onClick={() => abrirForm(null)}>
          <Plus size={16} strokeWidth={2.4} />
          Nova conta
        </button>
      </div>

      {/* O AVISO FICA NO RODAPÉ DA TELA, não no topo da página: no celular,
          quem tocou em "confirmar" ou "Salvar" lá embaixo não via o erro que
          aparecia centenas de pixels acima (revisão de 25/09). */}
      {aviso && (
        <div role={aviso.tom === "ok" ? "status" : "alert"} className={`bk-aviso ${aviso.tom === "ok" ? "ok" : "erro"}`}>
          {aviso.tom === "ok" ? <Check size={17} strokeWidth={2.6} /> : <AlertTriangle size={17} />}
          <span>{aviso.texto}</span>
          <button type="button" onClick={() => setAviso(null)} aria-label="Fechar aviso">
            <X size={15} />
          </button>
        </div>
      )}
      <span className="sr-only" role="status" aria-live="polite">{falado}</span>

      {form && (
        <Card ref={cartaoForm}>
          <div className="bk-form-cab">
            <div>
              <h2>{form.id ? `Editar ${form._orig?.banco || "conta"}` : "Nova conta"}</h2>
              <p>Sem chave Pix, deixe a chave em branco e escolha "Conta e agência".</p>
            </div>
            <button type="button" className="bk-icone" onClick={() => setForm(null)} aria-label="Fechar o formulário">
              <X size={18} />
            </button>
          </div>
          <form onSubmit={salvar}>
            <div className="bk-form-blocos">
              <fieldset className="bk-form-bloco">
                <legend>Banco</legend>
                <div className="bk-form-campos">
                  <div className="largo">
                    <label className="label" htmlFor="b-banco">Nome do banco</label>
                    <input id="b-banco" className="input" placeholder="ex.: Sicoob Credinor" value={form.banco} onChange={campo("banco")} required />
                  </div>
                  <div>
                    <label className="label" htmlFor="b-codigo">Número do banco</label>
                    <input
                      id="b-codigo"
                      className="input bk-mono"
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
                        className="bk-form-sugestao"
                        onClick={() => setForm((f) => ({ ...f, codigoBanco: sugestao.codigo }))}
                      >
                        Pelo nome: {sugestao.codigo} · {sugestao.nome}. Usar este
                      </button>
                    )}
                  </div>
                  <div>
                    <span className="label">Logo do banco</span>
                    <div className="bk-form-logo">
                      {/* A prévia mostra o que vai ficar: mexeu na logo, vale a do
                          formulário; senão, a própria ou a herdada do mesmo banco. */}
                      <SeloBanco
                        conta={{ ...form, id: form.id || "novo" }}
                        todas={form.logoMexida ? [] : todas.filter((x) => x.id !== form.id)}
                        tamanho="h-11 w-11"
                      />
                      <label className="btn-outline min-h-11 cursor-pointer px-3">
                        <ImagePlus size={15} />
                        {logoDoForm ? "Trocar" : "Anexar"}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="sr-only"
                          onChange={(e) => { escolherLogo(e.target.files?.[0]); e.target.value = ""; }}
                        />
                      </label>
                      {logoDoForm && (
                        <button type="button" className="btn-ghost min-h-11 px-3" onClick={() => setForm((f) => ({ ...f, logo: "", logoMexida: true }))}>
                          Tirar
                        </button>
                      )}
                    </div>
                  </div>
                  <span className="bk-form-ajuda largo">
                    Logo em PNG, JPG ou WebP, reduzida para caber no selo. Ela é do banco: vale para todas as contas com o mesmo número.
                  </span>
                </div>
              </fieldset>

              <fieldset className="bk-form-bloco">
                <legend>Titular e conta</legend>
                <div className="bk-form-campos">
                  <div>
                    <label className="label" htmlFor="b-titular">Titular</label>
                    <input id="b-titular" className="input" placeholder="ex.: Impresilk" value={form.titular} onChange={campo("titular")} required />
                  </div>
                  <div>
                    <label className="label" htmlFor="b-doc">CNPJ ou CPF</label>
                    <input id="b-doc" className="input bk-mono" placeholder="00.000.000/0000-00" value={form.doc} onChange={campo("doc")} />
                  </div>
                  <div>
                    <label className="label" htmlFor="b-ag">Agência</label>
                    <input id="b-ag" className="input bk-mono" value={form.agencia} onChange={campo("agencia")} />
                  </div>
                  <div>
                    <label className="label" htmlFor="b-cc">Conta</label>
                    <input id="b-cc" className="input bk-mono" value={form.conta} onChange={campo("conta")} />
                  </div>
                </div>
              </fieldset>

              <fieldset className="bk-form-bloco">
                <legend>Pix</legend>
                <div className="bk-form-campos">
                  <div>
                    <label className="label" htmlFor="b-pixtipo">Tipo da chave</label>
                    <select id="b-pixtipo" className="input" value={form.pixTipo} onChange={campo("pixTipo")}>
                      {TIPOS_PIX.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="b-cidade">Cidade do titular</label>
                    <input id="b-cidade" className="input" placeholder={CIDADE_PADRAO} value={form.cidade} onChange={campo("cidade")} />
                  </div>
                  <div className="largo">
                    <label className="label" htmlFor="b-pix">Chave Pix</label>
                    <input
                      id="b-pix"
                      className="input bk-mono"
                      placeholder="deixe em branco se a conta não tem chave"
                      value={form.pix}
                      onChange={campo("pix")}
                    />
                    {form.pix.trim() && conferirChave(form.pix, form.pixTipo).aviso && (
                      <p className="bk-pix-aviso">
                        <AlertTriangle size={13} />
                        {conferirChave(form.pix, form.pixTipo).aviso}
                      </p>
                    )}
                    <span className="bk-form-ajuda">A cidade vai no código Pix copia e cola. Em branco: {CIDADE_PADRAO}.</span>
                  </div>
                </div>
              </fieldset>
            </div>

            <div className="bk-form-rodape">
              <button type="button" className="btn-ghost" onClick={() => setForm(null)}>
                Cancelar
              </button>
              <button className="btn-primary" disabled={salvando}>
                {salvando ? "Salvando..." : form.id ? "Salvar alterações" : "Cadastrar conta"}
              </button>
            </div>
          </form>
        </Card>
      )}

      {visiveis.length === 0 && (
        <div className="bk-vazio">
          {buscando ? <Search size={26} /> : <Landmark size={26} />}
          <strong>{buscando ? `Nada com "${busca}"` : "Nenhuma conta cadastrada ainda"}</strong>
          <span>{buscando ? "Confira a grafia ou busque pelo número do banco." : "Toque em Nova conta para cadastrar a primeira."}</span>
        </div>
      )}

      {visiveis.map((g) => (
        <section key={g.nome} className="bk-grupo" aria-labelledby={`bk-grupo-${g.nome}`}>
          <div className="bk-grupo-cab">
            <h2 id={`bk-grupo-${g.nome}`}>{g.nome}</h2>
            <span>
              {g.itens.length} {g.itens.length === 1 ? "conta" : "contas"}
            </span>
          </div>

          <div className="bk-grade">
            {g.itens.map((b) => {
              const cod = codigoDaConta(b);
              const rotuloDoc = ehCPF(b.doc) ? "CPF" : "CNPJ";
              return (
                <article key={b.id} className="bk-conta" aria-labelledby={`bk-${b.id}`}>
                  <div className="bk-conta-topo">
                    <SeloBanco conta={b} todas={todas} />
                    <div className="bk-conta-nome">
                      <h3 id={`bk-${b.id}`} title={b.banco}>{b.banco}</h3>
                      <p title={b.titular}>{b.titular}</p>
                    </div>
                    <div className="bk-conta-acoes">
                      <button type="button" onClick={() => abrirForm(b)} className="bk-icone" title={`Editar ${b.banco}`} aria-label={`Editar ${b.banco}`}>
                        <Pencil size={16} />
                      </button>
                      <button type="button" onClick={() => remover(b)} className="bk-icone perigo" title={`Remover ${b.banco}`} aria-label={`Remover ${b.banco}`}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="bk-codigo">
                    {cod ? (
                      <>
                        <button
                          type="button"
                          onClick={() => copiar(cod.codigo, `${b.id}-cod`, "Número do banco")}
                          className={`bk-chip ${copiado === `${b.id}-cod` ? "copiado" : ""}`}
                          title="Copiar o número do banco"
                          aria-label={`Copiar o número do banco: ${cod.codigo}`}
                        >
                          <strong>{cod.codigo}</strong>
                          {cod.banco && <span>{cod.banco.nome}</span>}
                          {copiado === `${b.id}-cod` ? <Check size={13} strokeWidth={2.6} /> : <Copy size={13} />}
                        </button>
                        {cod.deduzido && (
                          <button
                            type="button"
                            onClick={() => confirmarCodigo(b, cod.codigo)}
                            className="bk-chip aviso"
                            title="O número foi deduzido do nome do banco e já vai na mensagem. Confirme para gravar."
                          >
                            <AlertTriangle size={13} />
                            Pelo nome · confirmar
                          </button>
                        )}
                      </>
                    ) : (
                      <button type="button" onClick={() => abrirForm(b)} className="bk-chip aviso">
                        <AlertTriangle size={13} />
                        Sem número do banco · cadastrar
                      </button>
                    )}
                  </div>

                  <dl className="bk-dados">
                    <Valor
                      rotulo={rotuloDoc}
                      valor={b.doc}
                      copiado={copiado === `${b.id}-doc`}
                      aoCopiar={() => copiar(b.doc, `${b.id}-doc`, rotuloDoc)}
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
                    {!b.pix && (
                      <div className="bk-sem-pix">
                        <dt>Pix</dt>
                        <dd>{b.pixTipo === "Conta e agencia" ? "Sem chave: por agência e conta" : b.pixTipo}</dd>
                      </div>
                    )}
                  </dl>

                  {b.pix && <BlocoPix b={b} copiar={copiar} copiado={copiado} comConta={pixComConta} aoMudarComConta={mudarPixComConta} />}

                  <div className="bk-rodape">
                    <button
                      type="button"
                      onClick={() => abrirWhats(textoWhatsApp(b))}
                      className="bk-whats"
                      title="Abrir o WhatsApp com estes dados prontos"
                    >
                      <MessageCircle size={17} strokeWidth={2.3} />
                      Mandar dados no WhatsApp
                    </button>
                    <button
                      type="button"
                      onClick={() => copiar(textoWhatsApp(b), `${b.id}-tudo`, "Dados da conta")}
                      className={`bk-tudo ${copiado === `${b.id}-tudo` ? "copiado" : ""}`}
                      title="Copiar a conta inteira"
                      aria-label="Copiar a conta inteira"
                    >
                      {copiado === `${b.id}-tudo` ? <Check size={17} strokeWidth={2.6} /> : <Copy size={17} />}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
